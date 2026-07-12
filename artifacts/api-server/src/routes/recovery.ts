import { Router, type Request } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSupabaseAdmin } from "../lib/supabase";
import { invalidateUserCache } from "../middlewares/auth";
import { recordAudit } from "./auditHelper";

const router = Router();

// The master admin account this recovery flow is allowed to reset. Locked to a
// single account on purpose — this endpoint can NEVER touch any other user.
const MASTER_ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "admin@safwa.app").toLowerCase();

const MIN_PASSWORD_LENGTH = 8;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes locked out after MAX_ATTEMPTS
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // sliding window for counting failures

interface AttemptState {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

// In-memory, per-IP throttle. Good enough for a single-instance owner-only
// recovery endpoint; deliberately not persisted (a restart clears lockouts,
// which is acceptable for an emergency owner flow).
const attemptsByIp = new Map<string, AttemptState>();

function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]!.trim();
  }
  return req.ip ?? "unknown";
}

// Constant-time comparison over fixed-length SHA-256 digests so neither the
// value nor the length of the expected code can leak via timing.
function codesMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

router.post("/auth/master-recovery", async (req, res) => {
  const ip = clientIp(req);
  const now = Date.now();
  const state = attemptsByIp.get(ip);

  if (state && state.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((state.lockedUntil - now) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "تم إيقاف الاستعادة مؤقتاً بسبب محاولات فاشلة متكررة. يرجى المحاولة لاحقاً.",
      retryAfterSeconds,
    });
    return;
  }

  const { recoveryCode, newPassword } = req.body ?? {};

  if (typeof recoveryCode !== "string" || recoveryCode.length === 0) {
    res.status(400).json({ error: "رمز الاستعادة مطلوب." });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      error: `يجب أن تتكون كلمة المرور من ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`,
    });
    return;
  }

  const expected = process.env.MASTER_RECOVERY_CODE;
  if (!expected || expected.length === 0) {
    req.log.error("MASTER_RECOVERY_CODE is not configured; master recovery unavailable");
    res.status(503).json({
      error: "خدمة استعادة حساب المسؤول غير مُهيأة. يرجى التواصل مع مالك النظام.",
    });
    return;
  }

  if (!codesMatch(recoveryCode, expected)) {
    const base: AttemptState =
      state && now - state.windowStart < ATTEMPT_WINDOW_MS
        ? state
        : { count: 0, windowStart: now, lockedUntil: 0 };
    base.count += 1;
    if (base.count >= MAX_ATTEMPTS) {
      base.lockedUntil = now + LOCKOUT_MS;
    }
    attemptsByIp.set(ip, base);
    req.log.warn({ ip, attempts: base.count }, "Failed master-recovery attempt");

    if (base.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil(LOCKOUT_MS / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: "تم إيقاف الاستعادة مؤقتاً بسبب محاولات فاشلة متكررة. يرجى المحاولة لاحقاً.",
        retryAfterSeconds,
      });
      return;
    }

    res.status(401).json({
      error: "رمز الاستعادة غير صحيح.",
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - base.count),
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const [localRow] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, MASTER_ADMIN_EMAIL))
      .limit(1);

    let supabaseUserId = localRow?.supabaseUserId ?? null;
    if (!supabaseUserId) {
      const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) {
        req.log.error(error, "Supabase listUsers failed during master recovery");
        res.status(500).json({ error: "خطأ في الخادم." });
        return;
      }
      supabaseUserId =
        data.users.find((u) => u.email?.toLowerCase() === MASTER_ADMIN_EMAIL)?.id ?? null;
    }

    if (!supabaseUserId) {
      res.status(404).json({ error: "حساب المسؤول الرئيسي غير موجود." });
      return;
    }

    // The password entered on the recovery page IS the final password chosen by
    // the owner — NOT a temporary one.  Clearing must_change_password and
    // recording password_changed_at means AuthGuard lets the admin straight into
    // the app without another forced-change step.
    // (The ordinary-user forced-change path in users.ts is untouched — it still
    // sets must_change_password:true for admin-provisioned temp passwords.)
    const { error: updateErr } = await supabase.auth.admin.updateUserById(supabaseUserId, {
      password: newPassword,
      user_metadata: {
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      },
    });
    if (updateErr) {
      req.log.error(updateErr, "Supabase password update failed during master recovery");
      res.status(500).json({ error: "تعذر إعادة تعيين كلمة المرور." });
      return;
    }

    invalidateUserCache(MASTER_ADMIN_EMAIL);
    attemptsByIp.delete(ip);

    // Audit the event WITHOUT the recovery code or the new password.
    await recordAudit({
      entityType: "user",
      entityId: localRow?.id ?? 0,
      action: "master_recovery",
      newData: { email: MASTER_ADMIN_EMAIL, note: "master admin password recovered via recovery code" },
      notes: "Master admin self-recovery from login page; must_change_password cleared; password_changed_at set",
    });

    req.log.warn(
      { email: MASTER_ADMIN_EMAIL, ip },
      "Master admin password recovered via recovery code",
    );

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Master recovery failed");
    res.status(500).json({ error: "خطأ في الخادم." });
  }
});

export default router;

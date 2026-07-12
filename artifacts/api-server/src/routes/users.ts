import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, invalidateUserCache } from "../middlewares/auth";
import { getSupabaseAdmin } from "../lib/supabase";
import { recordAudit } from "./auditHelper";

const router = Router();

const VALID_ROLES = ["admin", "accountant", "viewer"] as const;
const DISABLE_BAN_DURATION = "876000h"; // ~100 years
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIST_USERS_PER_PAGE = 1000;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

// Supabase's admin.listUsers only returns one page (default 50, max 1000) per
// call. Once a team grows past a single page, later accounts are silently
// dropped — so we must follow `nextPage` until every account is fetched.
async function listAllSupabaseUsers(
  supabase: SupabaseAdmin,
): Promise<SupabaseAuthUser[]> {
  const users: SupabaseAuthUser[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PER_PAGE,
    });
    if (error) throw error;
    users.push(...data.users);
    if (!data.nextPage) break;
    page = data.nextPage;
  }
  return users;
}

type SupabaseAuthUser = Awaited<
  ReturnType<SupabaseAdmin["auth"]["admin"]["listUsers"]>
>["data"]["users"][number];

function toManagedUser(
  row: typeof usersTable.$inferSelect,
  passwordChangedAt?: string,
) {
  return {
    id: row.id,
    email: row.username,
    role: row.role,
    disabled: row.disabled,
    createdAt: row.createdAt,
    passwordChangedAt,
  };
}

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(usersTable).orderBy(usersTable.createdAt);

    // Enrich with the effective last password-change timestamp from Supabase
    // (user_metadata.password_changed_at, falling back to the account
    // creation time), so admins can spot overdue/stale passwords. A failure
    // here must not break user listing — degrade to no timestamp.
    const passwordAgeByEmail = new Map<string, string>();
    try {
      const supabase = getSupabaseAdmin();
      const supabaseUsers = await listAllSupabaseUsers(supabase);
      for (const u of supabaseUsers) {
        if (!u.email) continue;
        const changed =
          (u.user_metadata?.password_changed_at as string | undefined) ?? u.created_at;
        if (changed) passwordAgeByEmail.set(u.email.toLowerCase(), changed);
      }
    } catch (enrichErr) {
      req.log.error(enrichErr, "Failed to enrich users with password age");
    }

    res.json(
      rows.map((row) =>
        toManagedUser(row, passwordAgeByEmail.get(row.username.toLowerCase())),
      ),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  const { email, password, role } = req.body ?? {};
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  if (!VALID_ROLES.includes(role)) {
    res.status(400).json({ error: "Role must be admin, accountant or viewer" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, normalizedEmail))
      .limit(1);
    if (existing) {
      res.status(400).json({ error: "Email already exists" });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { role, must_change_password: true },
    });
    if (error) {
      const msg = /already.*registered|exists/i.test(error.message)
        ? "Email already exists"
        : error.message;
      res.status(400).json({ error: msg });
      return;
    }

    const [row] = await db
      .insert(usersTable)
      .values({
        username: normalizedEmail,
        passwordHash: "supabase-auth",
        role,
        supabaseUserId: data.user.id,
      })
      .returning();

    await recordAudit({
      entityType: "user",
      entityId: row.id,
      action: "create",
      newData: toManagedUser(row),
      userId: req.authUser!.id,
    });

    res.status(201).json(toManagedUser(row));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { role, disabled } = req.body ?? {};

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: "Role must be admin, accountant or viewer" });
    return;
  }
  if (disabled !== undefined && typeof disabled !== "boolean") {
    res.status(400).json({ error: "disabled must be a boolean" });
    return;
  }
  if (role === undefined && disabled === undefined) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  try {
    const [old] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!old) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (id === req.authUser!.id) {
      if (disabled === true) {
        res.status(400).json({ error: "Cannot disable your own account" });
        return;
      }
      if (role !== undefined && role !== "admin") {
        res.status(400).json({ error: "Cannot remove your own admin role" });
        return;
      }
    }

    // Mirror the disabled state to Supabase Auth (ban) so the login itself is blocked.
    if (disabled !== undefined && disabled !== old.disabled && old.supabaseUserId) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.auth.admin.updateUserById(old.supabaseUserId, {
        ban_duration: disabled ? DISABLE_BAN_DURATION : "none",
      });
      if (error) {
        req.log.error(error, "Supabase ban update failed");
        res.status(500).json({ error: "Failed to update account status" });
        return;
      }
    }

    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (role !== undefined) updates.role = role;
    if (disabled !== undefined) updates.disabled = disabled;

    const [row] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    invalidateUserCache(old.username);

    await recordAudit({
      entityType: "user",
      entityId: id,
      action: "update",
      oldData: toManagedUser(old),
      newData: toManagedUser(row),
      userId: req.authUser!.id,
    });

    res.json(toManagedUser(row));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { password } = req.body ?? {};

  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  try {
    const [old] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!old) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let supabaseUserId = old.supabaseUserId;
    if (!supabaseUserId) {
      const supabase = getSupabaseAdmin();
      try {
        const supabaseUsers = await listAllSupabaseUsers(supabase);
        supabaseUserId =
          supabaseUsers.find((u) => u.email?.toLowerCase() === old.username.toLowerCase())?.id ??
          null;
      } catch (listErr) {
        req.log.error(listErr, "Supabase listUsers failed");
        res.status(500).json({ error: "Server error" });
        return;
      }
    }

    if (!supabaseUserId) {
      res.status(404).json({ error: "Supabase account not found" });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.updateUserById(supabaseUserId, {
      password,
      user_metadata: { must_change_password: true },
    });
    if (error) {
      req.log.error(error, "Supabase password reset failed");
      res.status(500).json({ error: "Failed to reset password" });
      return;
    }

    invalidateUserCache(old.username);

    await recordAudit({
      entityType: "user",
      entityId: id,
      action: "update",
      oldData: { ...toManagedUser(old), note: "password reset" },
      newData: { ...toManagedUser(old), note: "password reset to temporary" },
      userId: req.authUser!.id,
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);

  try {
    const [old] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!old) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (id === req.authUser!.id) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }

    const supabase = getSupabaseAdmin();

    let supabaseUserId = old.supabaseUserId;
    if (!supabaseUserId) {
      // Legacy row without a stored Supabase ID — look it up by email.
      try {
        const supabaseUsers = await listAllSupabaseUsers(supabase);
        supabaseUserId =
          supabaseUsers.find((u) => u.email?.toLowerCase() === old.username.toLowerCase())?.id ??
          null;
      } catch (listErr) {
        req.log.error(listErr, "Supabase listUsers failed");
        res.status(500).json({ error: "Server error" });
        return;
      }
    }

    if (supabaseUserId) {
      const { error } = await supabase.auth.admin.deleteUser(supabaseUserId);
      if (error && error.status !== 404) {
        req.log.error(error, "Supabase deleteUser failed");
        res.status(500).json({ error: "Failed to delete account" });
        return;
      }
    }

    await db.delete(usersTable).where(eq(usersTable.id, id));
    invalidateUserCache(old.username);

    await recordAudit({
      entityType: "user",
      entityId: id,
      action: "delete",
      oldData: toManagedUser(old),
      userId: req.authUser!.id,
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

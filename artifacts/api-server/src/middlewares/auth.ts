import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { supabaseAuth } from "../lib/supabase";
import { logger } from "../lib/logger";

export type AuthUser = { id: number; email: string; role: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

type CacheEntry = { user: AuthUser; expiresAt: number };

const tokenCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1_000;

/** Drop cached entries for a given email (e.g. after role change / disable). */
export function invalidateUserCache(email: string) {
  const target = email.toLowerCase();
  for (const [key, entry] of tokenCache) {
    if (entry.user.email === target) tokenCache.delete(key);
  }
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= now) tokenCache.delete(key);
  }
  if (tokenCache.size > CACHE_MAX_ENTRIES) {
    for (const key of tokenCache.keys()) {
      if (tokenCache.size <= CACHE_MAX_ENTRIES) break;
      tokenCache.delete(key);
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.authUser = cached.user;
    next();
    return;
  }

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user?.email) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const email = data.user.email.toLowerCase();

    let [row] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, email))
      .limit(1);

    if (!row) {
      [row] = await db
        .insert(usersTable)
        .values({
          username: email,
          passwordHash: "supabase-auth",
          role: (data.user.user_metadata?.role as string | undefined) ?? "viewer",
          supabaseUserId: data.user.id,
        })
        .returning();
    } else if (!row.supabaseUserId) {
      await db
        .update(usersTable)
        .set({ supabaseUserId: data.user.id })
        .where(eq(usersTable.id, row.id));
    }

    if (row.disabled) {
      res.status(403).json({ error: "Account disabled" });
      return;
    }

    const user: AuthUser = { id: row.id, email, role: row.role };
    tokenCache.set(token, { user, expiresAt: Date.now() + CACHE_TTL_MS });
    pruneCache();

    req.authUser = user;
    next();
  } catch (err) {
    logger.error(err, "Auth verification error");
    res.status(500).json({ error: "Server error" });
  }
}

/** Route guard: requires requireAuth to have run first. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.authUser.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

/**
 * Route guard factory: allow only the listed roles.
 * Requires requireAuth to have run first. Used to enforce the role matrix on
 * write endpoints (viewers are read-only, accountants limited to charges/import).
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

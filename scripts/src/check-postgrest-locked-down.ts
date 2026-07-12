/**
 * Security check: verify that resident data is NOT readable directly via
 * Supabase's PostgREST API (bypassing the app).
 *
 * `buildings`, `units`, `persons`, and `charges` must stay deny-all under RLS
 * so that ANY authenticated Supabase user — using the anon key that ships in
 * the frontend bundle — reads an empty result from Supabase's REST endpoints.
 * The app's API server connects as the table-owner pooler role and bypasses
 * RLS, so app behavior is unaffected. This mirrors `check-auth-signup-disabled`
 * but guards direct table reads instead of public signups.
 *
 * A locked-down table returns HTTP 200 with an empty `[]` (not 403) to
 * authenticated PostgREST reads. This check FAILS if any of the four tables
 * returns one or more rows.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-postgrest-locked-down
 *     — signs in as a regular user and exits 0 if all tables are locked down,
 *       exits 1 (with instructions) if any table leaks rows.
 *
 * Credentials: RLS deny-all applies to EVERY authenticated user regardless of
 * app role, so any valid login works. By default (no explicit credentials) the
 * check self-provisions a throwaway Supabase Auth user via the service-role key,
 * signs in as it, runs the check, and deletes it afterward — so the check stays
 * self-contained and never depends on a known password (the admin password is
 * rotated/forced-changed). To instead sign in as an existing account, set
 * CHECK_USER_EMAIL / CHECK_USER_PASSWORD (falling back to ADMIN_EMAIL /
 * ADMIN_PASSWORD); when both are provided, no throwaway user is created.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export {};

function resolveSupabaseUrl(): string {
  const raw = (process.env.SUPABASE_URL ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error(
      "SUPABASE_URL must be the Supabase project URL (https://<project-ref>.supabase.co)",
    );
  }
  return raw.replace(/\/+$/, "");
}

const supabaseUrl = resolveSupabaseUrl();
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!anonKey) {
  throw new Error("SUPABASE_ANON_KEY is required");
}

/** Prefix for the throwaway account so it is identifiable and easy to purge. */
const CHECK_PREFIX = "check-postgrest-";

const explicitEmail = process.env.CHECK_USER_EMAIL ?? process.env.ADMIN_EMAIL;
const explicitPassword =
  process.env.CHECK_USER_PASSWORD ?? process.env.ADMIN_PASSWORD;

const PROTECTED_TABLES = ["buildings", "units", "persons", "charges"] as const;

interface CheckSession {
  email: string;
  accessToken: string;
  /** Deletes the throwaway user (no-op when signed in as an existing account). */
  cleanup: () => Promise<void>;
}

async function signInWith(email: string, password: string): Promise<string> {
  const supabase = createClient(supabaseUrl, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(
      `Could not sign in as ${email}: ${error?.message ?? "no session returned"}.`,
    );
  }
  return data.session.access_token;
}

/**
 * Delete every Supabase Auth user whose email starts with CHECK_PREFIX. Called
 * before provisioning a fresh throwaway user so orphans from a killed run (whose
 * `finally` cleanup never fired) do not accumulate as stale credentials.
 */
async function sweepOrphanedCheckUsers(admin: SupabaseClient): Promise<void> {
  // Collect all matching IDs across pages FIRST, then delete. Deleting while
  // paginating shifts page composition and can skip matches, so we snapshot
  // targets before mutating.
  const targets: { id: string; email: string }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const users = data.users ?? [];
    for (const u of users) {
      if (u.email && u.email.startsWith(CHECK_PREFIX)) {
        targets.push({ id: u.id, email: u.email });
      }
    }
    if (users.length < 200) break;
  }

  for (const { id, email } of targets) {
    const { error: delError } = await admin.auth.admin.deleteUser(id);
    if (delError) {
      console.error(
        `WARNING: failed to delete orphaned check user ${email} (${id}): ${delError.message}.`,
      );
    } else {
      console.log(`Swept orphaned check user: ${email}`);
    }
  }
}

/**
 * Acquire an authenticated session. When explicit credentials are supplied we
 * use them as-is; otherwise we mint a throwaway user via the service-role key so
 * the check never depends on a known password, then delete it on cleanup.
 */
async function acquireSession(): Promise<CheckSession> {
  if (explicitEmail && explicitPassword) {
    const accessToken = await signInWith(explicitEmail, explicitPassword);
    return { email: explicitEmail, accessToken, cleanup: async () => {} };
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "No credentials available: set CHECK_USER_EMAIL / CHECK_USER_PASSWORD " +
        "to an existing account, or provide SUPABASE_SERVICE_ROLE_KEY so the " +
        "check can self-provision a throwaway user.",
    );
  }

  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Self-heal: purge any orphaned throwaway accounts left behind by a run that
  // was killed before its `finally` cleanup could execute (timeout, crash,
  // SIGKILL). Mirrors the prefix-sweep in the e2e suite's purgeE2eAccounts.
  await sweepOrphanedCheckUsers(admin);

  const rid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const email = `${CHECK_PREFIX}${rid}@safwa.app`;
  const password = `CheckPw!${rid}${crypto.randomUUID().slice(0, 8)}`;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "viewer" },
    });
  if (createError || !created.user) {
    throw new Error(
      `Failed to provision throwaway check user: ${createError?.message ?? "no user returned"}`,
    );
  }
  const userId = created.user.id;

  const cleanup = async () => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(
        `WARNING: failed to delete throwaway check user ${email} (${userId}): ${error.message}. ` +
          "Delete it manually via the Supabase dashboard.",
      );
    }
  };

  try {
    const accessToken = await signInWith(email, password);
    return { email, accessToken, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

async function fetchRows(table: string, accessToken: string): Promise<unknown[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`,
    {
      headers: {
        apikey: anonKey!,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const body = await res.text();
  if (!res.ok) {
    // A non-2xx here (e.g. 401/403) also means the row is NOT readable, but we
    // treat unexpected statuses as a hard error so the check stays honest.
    throw new Error(
      `Unexpected response from GET /rest/v1/${table}: ${res.status} ${body}`,
    );
  }
  let rows: unknown;
  try {
    rows = JSON.parse(body);
  } catch {
    throw new Error(`GET /rest/v1/${table} returned non-JSON body: ${body}`);
  }
  if (!Array.isArray(rows)) {
    throw new Error(
      `GET /rest/v1/${table} returned a non-array body: ${JSON.stringify(rows)}`,
    );
  }
  return rows;
}

async function main() {
  console.log(`Project: ${supabaseUrl}`);
  const session = await acquireSession();
  console.log(`Signed in as: ${session.email}`);

  try {
    const leaks: string[] = [];
    for (const table of PROTECTED_TABLES) {
      const rows = await fetchRows(table, session.accessToken);
      if (rows.length > 0) {
        leaks.push(table);
        console.error(
          `LEAK: /rest/v1/${table} returned ${rows.length} row(s) to an authenticated user`,
        );
      } else {
        console.log(`OK: /rest/v1/${table} returned no rows (locked down)`);
      }
    }

    if (leaks.length > 0) {
      console.error(
        `\nFAIL: ${leaks.length} table(s) readable via PostgREST: ${leaks.join(", ")}.\n` +
          "Any authenticated Supabase user can read resident data directly, bypassing " +
          "the app's API, role checks, and audit logging.\n" +
          "Fix: ensure buildings/units/persons/charges use deny-all RLS " +
          "(`.enableRLS()` with no permissive `authenticatedRole` policy) in " +
          "lib/db/src/schema/, then `pnpm --filter @workspace/db run push`. " +
          "See .agents/memory/drizzle-supabase-push.md.",
      );
      process.exit(1);
    }

    console.log("\nPASS: resident data is not readable via PostgREST.");
  } finally {
    await session.cleanup();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

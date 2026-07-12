import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Shared helpers for the forced-password e2e run: env resolution, Supabase
 * admin/anon clients, local Postgres cleanup, and the credentials file the
 * global setup shares with the spec.
 *
 * Every account this suite creates uses E2E_PREFIX so teardown can purge them
 * by pattern regardless of which step created them.
 */
export const E2E_PREFIX = "e2e-pw-";

const here = path.dirname(fileURLToPath(import.meta.url));
export const CREDS_PATH = path.join(here, ".auth", "creds.json");

export interface E2ECreds {
  adminEmail: string;
  adminPass: string;
  memberEmail: string;
  tempPass: string;
  newPass: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} for e2e run`);
  }
  return value;
}

function resolveSupabaseUrl(): string {
  const url = requireEnv("SUPABASE_URL");
  if (!/^https?:\/\//.test(url)) {
    throw new Error(
      `SUPABASE_URL must be an http(s) URL for e2e; got: ${url.slice(0, 24)}…`,
    );
  }
  return url;
}

export function getAdminClient(): SupabaseClient {
  return createClient(resolveSupabaseUrl(), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getPgClient(): pg.Client {
  const connectionString =
    process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "No database URL set for e2e cleanup (SUPABASE_DATABASE_URL or DATABASE_URL)",
    );
  }
  const isSupabase = connectionString.includes("supabase");
  return new pg.Client({
    connectionString,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  });
}

/** Delete every Supabase Auth user and local users row created by this suite. */
export async function purgeE2eAccounts(): Promise<void> {
  const admin = getAdminClient();

  // Supabase Auth: page through users and delete any with our prefix.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const users = data.users ?? [];
    for (const u of users) {
      if (u.email && u.email.startsWith(E2E_PREFIX)) {
        await admin.auth.admin.deleteUser(u.id);
      }
    }
    if (users.length < 200) break;
  }

  // Local Postgres: remove mirror rows (username column stores the email).
  const client = getPgClient();
  try {
    await client.connect();
    await client.query("DELETE FROM users WHERE username LIKE $1", [
      `${E2E_PREFIX}%`,
    ]);
  } finally {
    await client.end();
  }
}

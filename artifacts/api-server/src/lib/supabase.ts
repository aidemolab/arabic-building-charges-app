import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Read the Supabase project URL from the SUPABASE_URL secret.
 */
export function resolveSupabaseUrl(): string {
  const raw = (process.env.SUPABASE_URL ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error(
      "SUPABASE_URL must be the Supabase project URL (https://<project-ref>.supabase.co)",
    );
  }
  return raw.replace(/\/+$/, "");
}

const anonKey = process.env.SUPABASE_ANON_KEY;
if (!anonKey) {
  throw new Error("SUPABASE_ANON_KEY is required");
}

export const supabaseAuth: SupabaseClient = createClient(
  resolveSupabaseUrl(),
  anonKey,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let adminClient: SupabaseClient | null = null;

/**
 * Service-role Supabase client for admin operations (user management).
 * Lazily created; throws if SUPABASE_SERVICE_ROLE_KEY is not configured.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }
  adminClient = createClient(resolveSupabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

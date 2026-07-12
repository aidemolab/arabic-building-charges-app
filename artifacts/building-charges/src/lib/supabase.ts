import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase configuration is missing. SUPABASE_URL and SUPABASE_ANON_KEY must be available at build time.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Absolute URL of the in-app password reset page, used as the redirect
 * target for Supabase password recovery emails. Built from the current
 * origin so it works on both the preview and the deployed domain
 * (the domain must be present in the Supabase redirect allow-list).
 */
export function passwordResetRedirectUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${window.location.origin}${base}reset-password`;
}

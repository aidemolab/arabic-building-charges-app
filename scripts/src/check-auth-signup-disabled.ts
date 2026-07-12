/**
 * Security check: verify that public Supabase Auth signups are disabled.
 *
 * Public signup must stay disabled because the RLS policies on
 * buildings/units/persons/charges grant read access to ANY authenticated
 * Supabase user, and the anon key ships in the frontend bundle. If signup
 * were open, a stranger could self-register and read all resident data
 * via Supabase's REST API without ever touching the app.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-auth-signup-disabled
 *     — exits 0 if signups are disabled, exits 1 (with instructions) if open
 *
 *   pnpm --filter @workspace/scripts run check-auth-signup-disabled -- --fix
 *     — additionally disables signups via the Supabase Management API
 *       (requires the SUPABASE_ACCESS_TOKEN secret, a personal access token)
 */

export {};

function resolveSupabaseProjectRef(): string {
  const raw = (process.env.SUPABASE_URL ?? "").trim();
  const urlMatch = raw.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (urlMatch) return urlMatch[1];
  const dbUrl = process.env.SUPABASE_DATABASE_URL ?? "";
  try {
    const parsed = new URL(dbUrl.replace(/^postgres(ql)?:/i, "http:"));
    const ref = decodeURIComponent(parsed.username).split(".")[1];
    if (ref) return ref;
  } catch {
    // fall through
  }
  throw new Error(
    "Could not determine the Supabase project ref from SUPABASE_URL or SUPABASE_DATABASE_URL",
  );
}

const projectRef = resolveSupabaseProjectRef();
const supabaseUrl = `https://${projectRef}.supabase.co`;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!anonKey) {
  throw new Error("SUPABASE_ANON_KEY is required");
}

async function fetchSignupDisabled(): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: anonKey! },
  });
  if (!res.ok) {
    throw new Error(`GET /auth/v1/settings failed: ${res.status} ${await res.text()}`);
  }
  const settings = (await res.json()) as { disable_signup?: boolean };
  return settings.disable_signup === true;
}

async function disableSignup(): Promise<void> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN (Supabase personal access token) is required for --fix. " +
        "Create one at https://supabase.com/dashboard/account/tokens. " +
        "The service-role key can NOT change auth config.",
    );
  }
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ disable_signup: true }),
    },
  );
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Management API PATCH failed: ${res.status} ${body}`);
  }
  const config = JSON.parse(body) as { disable_signup?: boolean };
  if (config.disable_signup !== true) {
    throw new Error(
      `Management API accepted the PATCH but disable_signup is still ${config.disable_signup}`,
    );
  }
  console.log("Management API: disable_signup set to true");
}

async function verifySignupRejected(): Promise<void> {
  const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: anonKey!, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `signup-check-${Date.now()}@gmail.com`,
      password: `Check-${crypto.randomUUID()}`,
    }),
  });
  const body = (await res.json()) as { error_code?: string; msg?: string };
  if (res.status === 422 && body.error_code === "signup_disabled") {
    console.log(
      `Verified: signup attempt rejected (${res.status} ${body.error_code}: ${body.msg})`,
    );
    return;
  }
  throw new Error(
    `Signup attempt was NOT rejected as expected: ${res.status} ${JSON.stringify(body)}. ` +
      "If a user was created, delete it via the Supabase dashboard and re-run with --fix.",
  );
}

async function main() {
  const fix = process.argv.includes("--fix");
  console.log(`Project: ${supabaseUrl}`);

  let disabled = await fetchSignupDisabled();
  console.log(`Auth settings: disable_signup = ${disabled}`);

  if (!disabled && fix) {
    await disableSignup();
    disabled = await fetchSignupDisabled();
    console.log(`Auth settings after fix: disable_signup = ${disabled}`);
  }

  if (!disabled) {
    console.error(
      "\nFAIL: public signups are ENABLED. Anyone with the anon key can self-register " +
        "and read building/resident data through the authenticated-user RLS policies.\n" +
        "Fix: re-run with --fix (requires SUPABASE_ACCESS_TOKEN), or turn off " +
        "'Allow new users to sign up' in the Supabase dashboard (Authentication → Sign In / Providers).",
    );
    process.exit(1);
  }

  await verifySignupRejected();
  console.log("\nPASS: public signups are disabled.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

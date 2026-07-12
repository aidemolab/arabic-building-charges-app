/**
 * Register the app's domain(s) in the Supabase Auth redirect allow-list so
 * that password recovery emails can redirect back to the in-app
 * /reset-password page. Without an allow-list entry, Supabase ignores the
 * requested redirect_to and falls back to the project's Site URL.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run configure-auth-redirect-urls
 *     — reads REPLIT_DOMAINS (comma-separated) and REPLIT_DEV_DOMAIN and adds
 *       "https://<domain>/**" (and "/reset-password") for each to the
 *       allow-list (idempotent). Also sets site_url to the first domain if it
 *       is still the default localhost value. Requires the
 *       SUPABASE_ACCESS_TOKEN secret (Supabase personal access token; the
 *       service-role key can NOT change auth config).
 *
 * NOTE: The API server also runs this reconciliation automatically on startup
 * (best-effort), so a published app registers its production domain on first
 * boot. This script remains useful for a manual/verbose run or to confirm the
 * allow-list without restarting the server.
 */

import {
  collectDomains,
  ensureAuthRedirectAllowList,
} from "@workspace/supabase-auth-config";

export {};

async function main() {
  const domains = collectDomains();
  if (domains.length === 0) {
    throw new Error(
      "No domains found in REPLIT_DOMAINS or REPLIT_DEV_DOMAIN — cannot configure the redirect allow-list",
    );
  }

  console.log(`Domains: ${domains.join(", ")}`);

  const result = await ensureAuthRedirectAllowList();

  console.log(`Project: https://${result.projectRef}.supabase.co`);
  console.log(`Current site_url: ${result.siteUrl || "(empty)"}`);

  if (result.addedEntries.length === 0 && !result.siteUrlUpdated) {
    console.log("Nothing to change — all domains already allow-listed.");
    return;
  }

  if (result.addedEntries.length > 0) {
    console.log(`Added to allow-list: ${result.addedEntries.join(", ")}`);
  }
  if (result.siteUrlUpdated) {
    console.log(`Set site_url: https://${domains[0]}`);
  }
  console.log("Done: redirect allow-list updated.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

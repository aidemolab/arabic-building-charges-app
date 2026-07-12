import {
  ensureAuthRedirectAllowList,
  MissingAccessTokenError,
} from "@workspace/supabase-auth-config";
import { logger } from "./logger";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Best-effort: keep the Supabase Auth redirect allow-list in sync with the
 * domain(s) this server is currently serving. Runs on startup so that when the
 * app is published (or its domain changes) the new domain is registered
 * automatically — otherwise password-recovery emails would silently drop their
 * redirect and land on the Supabase Site URL instead of /reset-password.
 *
 * This never throws: a failure here must not stop the server from booting. If
 * SUPABASE_ACCESS_TOKEN is not configured we simply skip (the manual script
 * `configure-auth-redirect-urls` can be run instead).
 */
export function ensureAuthRedirectsOnStartup(): void {
  void ensureAuthRedirectAllowList()
    .then((result) => {
      if (result.addedEntries.length > 0 || result.siteUrlUpdated) {
        logger.info(
          {
            projectRef: result.projectRef,
            addedEntries: result.addedEntries,
            siteUrlUpdated: result.siteUrlUpdated,
            domains: result.domains,
          },
          "Supabase Auth redirect allow-list updated for current domain(s)",
        );
      } else {
        // Log at info in production so the deployment logs positively confirm
        // the current (published) domain is already allow-listed; debug in dev
        // to keep local restarts quiet.
        const log = isProduction ? logger.info : logger.debug;
        log.call(
          logger,
          { domains: result.domains },
          "Supabase Auth redirect allow-list already up to date",
        );
      }
    })
    .catch((err) => {
      if (err instanceof MissingAccessTokenError) {
        // In production this is a real, otherwise-invisible failure: without the
        // token the published domain never gets allow-listed and password-reset
        // emails silently drop their redirect. Surface it loudly (error) so it
        // shows up in deployment logs; in dev a warn is enough.
        const message =
          "SUPABASE_ACCESS_TOKEN not set — skipping Supabase Auth redirect " +
          "allow-list sync. Password-reset emails may not redirect back to " +
          "/reset-password on new domains until it is configured.";
        if (isProduction) {
          logger.error(message);
        } else {
          logger.warn(message);
        }
        return;
      }
      logger.error(
        { err: err instanceof Error ? err.message : err },
        "Failed to sync Supabase Auth redirect allow-list (non-fatal)",
      );
    });
}

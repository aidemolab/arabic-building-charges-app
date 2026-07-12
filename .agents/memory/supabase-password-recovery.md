---
name: Supabase password recovery redirects
description: How password-reset email links get back to the app; redirect allow-list rules and testing gotchas
---

# Supabase password recovery redirects

- Supabase silently falls back to the project's Site URL when `redirect_to` is not in the auth `uri_allow_list` — no error is returned. The domain must be allow-listed (`https://<domain>/**`) via the Management API before recovery emails can land on the in-app reset page.
- **Why:** the failure mode is invisible (email still arrives, but the link drops the path and tokens land on the site root), which looks like a frontend bug.
- **How to apply:** the API server now reconciles this automatically on every startup (best-effort, non-fatal) via `ensureAuthRedirectsOnStartup()` → shared `@workspace/supabase-auth-config` lib, so a published app registers its production domain (from `REPLIT_DOMAINS`) on first boot — no manual step needed after deploy. It skips silently (logs a warn) if `SUPABASE_ACCESS_TOKEN` is not present in the runtime. The manual script `pnpm --filter @workspace/scripts run configure-auth-redirect-urls` still exists for a verbose one-off run or to reconcile without restarting; it shares the same lib. Adding the domain manually in the Supabase dashboard → Authentication → URL Configuration also works.
- **Why one shared lib:** the allow-list logic must stay identical between the server startup hook and the manual script; both import `ensureAuthRedirectAllowList()` so a change to the entry format (`/**` + `/reset-password`) can't drift between them.
- **Prod visibility of the startup hook:** `SUPABASE_ACCESS_TOKEN` is a global Replit *secret* (not env-scoped), so it IS present in the published runtime — the sync is not skipped in prod. The startup hook escalates log levels by `NODE_ENV === "production"`: success/"already up to date" logs at `info` (default-visible in deployment logs) and a missing token logs at `error` (loud), instead of the dev-only `debug`/`warn`. **Why:** the original silent skip made a broken prod sync (reset emails dropping their redirect) invisible; in prod the deploy logs must positively confirm the domain is allow-listed or shout if the token is gone.
- Testing gotcha: the raw REST `POST /auth/v1/admin/generate_link` endpoint takes `redirect_to` at the **top level** of the body, not under `options` (that nesting is supabase-js only). A mis-nested `redirect_to` is silently ignored and the link falls back to Site URL — looks identical to an allow-list failure.
- The recovery link 303-redirects with tokens in the URL **hash** (`#access_token=...&type=recovery`); supabase-js (`detectSessionInUrl`) picks it up client-side, so the reset page just waits for a session via `onAuthStateChange`/`getSession`.
- `scripts/src/*.ts` files with no imports/exports are treated as global scripts by tsc and collide on duplicate top-level names across files — add `export {}` to each standalone script.

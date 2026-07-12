---
name: Supabase auth config quirks
description: SUPABASE_URL is the project URL; how clients read it, and how the admin account maps to local users
---

# Supabase Auth configuration quirks

## SUPABASE_URL now holds the real project URL
The `SUPABASE_URL` secret was previously a Postgres pooler connection string (user pasted the wrong value); the code derived the project URL from `SUPABASE_DATABASE_URL` as a workaround. The user has since corrected the secret to the real `https://<ref>.supabase.co` project URL, and the derive-from-DB-URL workaround has been retired.
- `resolveSupabaseUrl()` still exists in `artifacts/api-server/src/lib/supabase.ts`, `artifacts/building-charges/vite.config.ts`, and `scripts/src/migrate-admin-to-supabase.ts`, but now just reads/validates `SUPABASE_URL` (throws if it isn't an http(s) URL). No DB-URL fallback.

**Why:** three copies of derive-from-pooler-username logic added confusion; once the secret was fixed the fallback was dead weight.
**How to apply:** treat `SUPABASE_URL` as authoritative. If it ever regresses to a connection string, login breaks loudly (by design) — fix the secret rather than re-adding a silent fallback. Keys are new-style: publishable (`sb_publishable_...`) in `SUPABASE_ANON_KEY`, secret (`sb_secret_...`) in `SUPABASE_SERVICE_ROLE_KEY`.

## Public signups must stay disabled
`disable_signup: true` must remain set in the project's auth config; strangers must not be able to self-register with the shipped anon key.
**Why:** RLS on buildings/units/persons/charges grants read to all authenticated users, so open signup makes all resident data publicly reachable.
**How to apply:** verify/re-apply with `pnpm --filter @workspace/scripts run check-auth-signup-disabled` (`-- --fix` to re-disable). The fix path uses the Management API and needs the `SUPABASE_ACCESS_TOKEN` secret (personal access token) — the service-role key can NOT change auth config. Admin `auth/v1/admin/users` creation (service role) bypasses `disable_signup`, so in-app team account creation keeps working. Never re-enable signup without tightening RLS first.

## Admin account mapping
- The local `users` table is still the identity source for audit logs: `username` column stores the Supabase email; `requireAuth` auto-creates a row (`passwordHash: "supabase-auth"`, default role `viewer` unless `user_metadata.role` says otherwise) for any new Supabase user. The original admin row was renamed to the admin's email so audit history stayed attached.
- Admin credentials live in Supabase Auth (dashboard → Authentication); see replit.md for the sign-in identity. Never record passwords in memory files.
- The legacy `session` DB table was dropped (July 2026). `SESSION_SECRET` is an unused leftover secret — only the user can delete it from the Secrets pane.

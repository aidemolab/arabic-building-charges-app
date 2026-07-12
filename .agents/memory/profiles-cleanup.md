---
name: Profiles / current_app_role island removed
description: The legacy Supabase role-check plumbing (profiles + current_app_role + auth trigger) was dropped; do not re-add it.
---

# Profiles / current_app_role island removed (July 2026)

The app resolves roles from the local `users` table (`requireAuth` auto-provisions a
row per Supabase user). It never used the Supabase-side `profiles` role mapping. After
the permissive PostgREST policies were dropped, an entire self-contained island of
role-check plumbing was left orphaned and has now been dropped:

- `public.profiles` table (mapped `auth.users` -> app role; had `role`, `active`, etc.)
- `public.current_app_role()` and `private.current_app_role()` — SQL SECURITY DEFINER
  functions that read `profiles`
- `public.handle_new_auth_user()` — trigger function inserting a `view_only` profile row
- `on_auth_user_created` trigger on `auth.users` that called it
- the two remaining policies on `profiles` (`profiles_read_self_or_admin`,
  `profiles_admin_update`), dropped with the table

**Why:** nothing outside the island referenced any of it (no views, FKs, or other
functions; app code only referenced `profiles` in a drizzle `tablesFilter` and a comment).
It was confusing dead security-relevant SQL that risked being re-wired incorrectly.

**How to apply:**
- Do NOT re-create `profiles`, `current_app_role()`, or the `on_auth_user_created`
  trigger. Roles live in the local `users` table, not in Supabase.
- Dropping `profiles` alone WOULD have broken new-account creation (the auth trigger
  inserts into it); the trigger + its function must go together with the table. They did.
- The `tablesFilter: ["!profiles"]` entry in `lib/db/drizzle.config.ts` was removed since
  there is nothing left to exclude. `drizzle-kit push` remains a clean no-op.

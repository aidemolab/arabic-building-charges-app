---
name: Inspecting the app's real DB/auth state
description: Which datastore actually backs the app, and how to query real user/auth state when debugging.
---
The `executeSql` tool (and the built-in Replit Postgres at `DATABASE_URL`) is NOT the app's active database. It is stale/unused — e.g. its `users` table is missing columns like `disabled`/`supabase_user_id` that the code relies on.

**Why:** the app runs against Supabase (`SUPABASE_DATABASE_URL`), and auth lives in Supabase Auth (not any Postgres table). Querying `executeSql` to check user/account state gives misleading results.

**How to apply:** to inspect real rows, connect with `pg` using `SUPABASE_DATABASE_URL`. To inspect auth accounts / user_metadata (e.g. `must_change_password`, ban status, whether a password still works), use `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` (admin API) or `SUPABASE_ANON_KEY` (signInWithPassword) — run these from inside `artifacts/api-server` so the package resolves. The `@supabase/supabase-js` package does NOT resolve from the workspace root / code_execution sandbox.

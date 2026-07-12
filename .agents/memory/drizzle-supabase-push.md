---
name: Drizzle push against Supabase
description: How drizzle-kit push is wired to Supabase and what must stay in sync to keep it safe
---

# Drizzle push against Supabase

The drizzle schema (`lib/db/src/schema/`) now models the live Supabase DB **exactly**, including
RLS policies, identity columns, named FKs/uniques (`*_fkey`/`*_key` names), check constraints,
indexes, and `updated_at` columns. `pnpm --filter @workspace/db run push` is a verified no-op
against a clean tree.

**No public table exposes any permissive policy anymore.** `buildings`, `units`, `persons`,
and `charges` used to carry `*_authenticated_read`/`*_staff_insert`/`*_staff_update` policies
that let ANY authenticated Supabase user read (and staff-role tokens write) every row directly
via PostgREST — a full bypass of the app's API, role checks, and audit logging. Those policies
were dropped; all four now use `.enableRLS()` deny-all like `users`/`audit_log`/`import_log`.
The API server bypasses RLS (table-owner pooler role), so it still reads/writes normally.
**Never re-add a `to: authenticatedRole` policy to a public table** unless the client is meant
to hit PostgREST directly (this app never does — the frontend only talks to `/api`).

**Why:** Supabase's anon key is public, so PostgREST exposes every `public` table. RLS policies
are the only protection (anon/authenticated have full default grants). An unmodeled push
(`--force`) would have dropped all policies, dropped `profiles`, and disabled RLS — a silent
security hole plus data-loss prompts.

**How to apply:**
- `drizzle.config.ts` uses `SUPABASE_DATABASE_URL ?? DATABASE_URL` and sets
  `entities.roles.provider = "supabase"`. It no longer needs a `tablesFilter`.
- The `profiles` table, both `current_app_role()` functions (public + private), the
  `handle_new_auth_user()` trigger function, and the `on_auth_user_created` trigger on
  `auth.users` were all DROPPED (July 2026) as one orphaned island — see
  `profiles-cleanup.md`. There is no longer anything to exclude from the drizzle schema.
  The legacy `session` table was dropped (July 2026) too.
- Tables without policies (`users`, `audit_log`, `import_log`, and now `buildings`, `units`,
  `persons`, `charges`) have `.enableRLS()` = deny-all via PostgREST; the API server connects as
  the table owner (pooler `postgres.<ref>` role) and bypasses RLS, so app behavior is unaffected.
  A deny-all table returns HTTP 200 with an empty `[]` to authenticated PostgREST reads (not 403).
- Never run `drizzle-kit push --force` non-interactively; run `push --verbose` first and read the
  statement list. Any DROP POLICY / DISABLE ROW LEVEL SECURITY line means the schema model and DB
  have drifted — fix the model, not the DB.
- Policy expressions in the schema must stay textually equivalent to what Postgres normalizes,
  or push will churn (drop/recreate policies — harmless but noisy).

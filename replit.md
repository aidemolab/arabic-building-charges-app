# نظام رسوم المبنى — Building Charges & Payments

A full-stack Arabic RTL web application for managing building charges, payments, and forecasts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/building-charges run dev` — run the frontend (port 22146, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run test` — run the API RBAC role-matrix tests (vitest + supertest; auth mocked via `x-test-role` header, DB/Supabase stubbed). Includes `forced-password.test.ts`, which asserts new members are provisioned with `must_change_password: true`, and `require-auth.test.ts`, which exercises the *real* `requireAuth` gate (no bearer → 401, garbage token → 401, disabled user → 403, valid token auto-provisions a local row, and the 60s token cache short-circuits the second call) by stubbing only Supabase `getUser` + the DB query builder.
- `pnpm --filter @workspace/building-charges run test:e2e` — run the Playwright end-to-end suite. `e2e/forced-password.spec.ts` covers the forced first-login password-change flow (provisions a temp Supabase admin via `SUPABASE_SERVICE_ROLE_KEY`, creates the member through the admin UI). `e2e/disabled-user.spec.ts` proves a banned employee is genuinely locked out of the *live* app (not just the stubbed middleware in `require-auth.test.ts`): it provisions a real Supabase viewer, confirms it can read resident data, has an admin disable it via the "المستخدمون" page, then asserts the disabled session is bounced to login and can no longer sign in. Both require the api-server + web workflows running (hit the shared proxy at `localhost:80`) and reuse the `e2e-pw-` prefix so `global-teardown` purges every account. Chromium system libs are declared in `replit.nix`.
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes to Supabase (the active DB; uses `SUPABASE_DATABASE_URL`, falls back to `DATABASE_URL`)
- `bash scripts/sync-github.sh "message"` — sync app to GitHub (aidemolab/arabic-building-charges-app); never `git push` directly (see `.agents/memory/github-sync.md`)
- `pnpm --filter @workspace/scripts run migrate-admin-to-supabase` — (re)create the Supabase Auth admin account and map it to the local users row
- `ADMIN_PASSWORD="<temp>" pnpm --filter @workspace/scripts run reset-admin-password` — emergency recovery for a **locked-out master admin**: sets a temporary password on `admin@safwa.app` (override with `ADMIN_EMAIL`) via the Supabase admin API and forces a password change at next login (`must_change_password=true`). Reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env, never logs the password, and exposes no HTTP endpoint (shell-only, owner trust boundary). Distinct from the in-app "إعادة تعيين" button, which only lets a logged-in admin reset *other* users.
- `pnpm --filter @workspace/scripts run check-auth-signup-disabled` — security check: fail if public Supabase signups are open (add `-- --fix` to disable them via the Management API; needs `SUPABASE_ACCESS_TOKEN`)
- `pnpm --filter @workspace/scripts run check-postgrest-locked-down` — security check: signs in as an authenticated Supabase user and fails if `buildings`/`units`/`persons`/`charges` return any rows via Supabase's PostgREST REST API (i.e. resident data is readable directly, bypassing the app). By default (no explicit creds) it self-provisions a throwaway Supabase Auth user via `SUPABASE_SERVICE_ROLE_KEY`, signs in as it, runs the check, and deletes it afterward — so it never depends on a known password (the admin password is forced-changed). Override with `CHECK_USER_EMAIL`/`CHECK_USER_PASSWORD` (falling back to `ADMIN_EMAIL`/`ADMIN_PASSWORD`) to sign in as an existing account instead, in which case no throwaway user is created. Complements the deny-all RLS states in `lib/db/src/schema/`
- `pnpm --filter @workspace/scripts run check-history-clean` — security check: scans every object reachable from any Git ref (`git rev-list --all --objects`) and fails (exit 1, listing the offending paths) if any `.xlsx` file or anything under `attached_assets/` is present in history. The confidential client workbook (`attached_assets/Building_Charges_2026_*.xlsx`) contains real resident/financial data and must never live in version control. This guard only DETECTS the leak — the actual blob purge must be run in the main app's own repository with explicit user authorisation (a task-env purge does not stick), per `.agents/memory/github-sync.md`.
- Security validation steps (see the `validation` skill) — the security guards run automatically as named validation steps so regressions fail loudly without a manual run: `security-signup` (→ `check-auth-signup-disabled`), `security-postgrest` (→ `check-postgrest-locked-down`), and `security-history` (→ `check-history-clean`). The `rbac` validation step runs the api-server role-matrix tests. `security-postgrest` needs no wired-in credentials — it self-provisions its own throwaway login via `SUPABASE_SERVICE_ROLE_KEY`. Note: `security-history` currently FAILS in task/dev environments because the dirty workbook blob is still reachable from the platform's `main` ancestry; it will only pass once the definitive purge is performed in the main app repo.
- `pnpm --filter @workspace/scripts run configure-auth-redirect-urls` — manually register the app domain(s) in the Supabase Auth redirect allow-list so password-reset emails can link back to `/reset-password` (needs `SUPABASE_ACCESS_TOKEN`). Usually unnecessary: the API server reconciles the allow-list automatically on every startup (see below), so a published app self-registers its production domain on first boot. Use the script for a verbose one-off run or to reconcile without restarting.
- Required env: `SUPABASE_DATABASE_URL` — Postgres connection string, `SUPABASE_URL` — Supabase project URL, `SUPABASE_ANON_KEY` — Supabase publishable/anon key, `SUPABASE_SERVICE_ROLE_KEY` — Supabase secret/service-role key (admin script only), `SUPABASE_ACCESS_TOKEN` — Supabase personal access token (Management API, e.g. auth settings), `MASTER_RECOVERY_CODE` — owner-chosen secret used by the browser-based master-admin recovery page (keep private; never appears in frontend, logs, or API responses). `SESSION_SECRET` is unused (the legacy `session` table was dropped); the user should delete it from the Secrets pane.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Recharts, Arabic RTL, Cairo font
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Auth: Supabase Auth (email/password) — frontend signs in via supabase-js, API verifies bearer tokens
- Excel: xlsx (import/export)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/` — generated hooks and Zod schemas (do not edit)
- `lib/db/src/schema/` — Drizzle ORM schema (source of truth for DB)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/building-charges/src/pages/` — React pages (login, dashboard, charges, buildings, units, persons, import, audit)
- `artifacts/building-charges/src/components/` — Layout, AuthGuard, shadcn/ui components

## Architecture decisions

- Contract-first: OpenAPI spec → codegen → typed hooks used by frontend and validated by backend
- Actual payments = months 1–6 (Jan–Jun 2026), Forecasts = months 7–12 (Jul–Dec 2026), visually separated
- Auth: Supabase Auth. Frontend calls `supabase.auth.signInWithPassword`; `setAuthTokenGetter` (main.tsx) attaches the access token as `Authorization: Bearer` to all API calls. Server `requireAuth` verifies the token via Supabase (60s in-memory cache) and maps the email to a local `users` row (`username` column stores the email), auto-creating one if missing — audit logs keep using local integer user IDs. Disabled users (users.disabled) get 403; `requireAdmin` guards admin-only routes (/users CRUD). Roles: admin / accountant / viewer
- Role matrix (enforced server-side via `requireRole([...])` in `middlewares/auth.ts`, mirrored client-side via `usePermissions()` in `lib/permissions.ts`):
  - **admin**: full access — buildings/units/persons CRUD, charges CRUD + cancel, Excel import/export, user management
  - **accountant**: charges CRUD + cancel, Excel import (preview/commit) + export. NO buildings/units/persons structure changes, NO user management. (Import can create units/persons as a side effect — accepted because import is explicitly an accountant capability.)
  - **viewer**: read-only everywhere. All POST/PATCH/DELETE and import endpoints return 403. Export (GET) stays available.
  - All GET/list/dashboard/audit endpoints are available to every authenticated role.
- Import route accepts flat Excel rows with month columns (jan/feb/…/dec) per unit/person
- Audit log written on all create/update/cancel/archive operations via auditHelper

## Product

- Secure login → Arabic RTL dashboard with charts
- Charges & Payments page with 6-filter combo (building, month, year, type, status, role)
- Payment cancellation with reason + audit history
- Excel import with preview/validation, Excel export with same filters
- Buildings / Units / Persons management with archive support
- Admin-only "المستخدمون" page (`/users`): create accounts (email + temp password + role admin/accountant/viewer), change roles, disable/enable (Supabase ban), delete — all mirrored to Supabase Auth via service-role admin client and audit-logged
- Dashboard: KPI cards, monthly actual vs forecast bar chart, collection-rate gauge (semicircle SVG — shows المحصّل الفعلي vs المستهدف الكلي in ج.م with colour-coded fill: blue ≥80%, amber 50–79%, red <50%), per-building table

## Data

- Real client data imported from "Building Charges 2026" workbook (اتحاد الشاغلين أبراج الصفوة): 5 buildings (عمارة 1–4 + المحلات), 291 units, 379 persons, 1,304 actual payments (Jan–Jun 2026), 284 forecasts (Jul–Dec 2026). No demo/seed data remains.
- See `.agents/memory/safwa-workbook-layout.md` for workbook parsing rules before any re-import.

## Admin account access

- Master-admin email: `admin@safwa.app`. **There is no default or hardcoded password** — the account is deliberately kept on an unknown password, and no password literal exists anywhere in source (the migration script requires `ADMIN_PASSWORD` to be supplied explicitly; it will not fall back to a default). Team accounts are managed in-app on the "المستخدمون" page, or in the Supabase dashboard → Authentication.
- To (re)gain master-admin access, use the **"استعادة حساب المسؤول الرئيسي"** (master recovery) flow on the login page with the `MASTER_RECOVERY_CODE` secret: the password you enter there becomes your **permanent** password (`must_change_password=false`, no forced-change screen). The shell-only `reset-admin-password` script is the fallback emergency path (it sets a temporary password and forces a change at next login).
- The sidebar has a "تغيير كلمة المرور" (change password) dialog (`ChangePasswordDialog.tsx`, uses `supabase.auth.updateUser`) — available at any time after the forced change is satisfied. On success it records `user_metadata.password_changed_at`.
- Stale-password reminder: `AuthGuard.tsx` computes password age from `user_metadata.password_changed_at` (falling back to the account `created_at` for users who never recorded a change). After a configurable max age (`VITE_PASSWORD_MAX_AGE_DAYS`, default 90 days) it opens `ChangePasswordDialog` in a soft `stale` mode — a dismissible "حان وقت تحديث كلمة المرور" reminder (dismiss = "تذكيرني لاحقاً", suppressed for the rest of the session). This is distinct from the hard, non-dismissible `forced` block used for first-login temp passwords (`must_change_password`), which always takes precedence.
- Forgot password: the login page has a "نسيت كلمة المرور؟" link that emails a Supabase recovery link; the link lands on `/reset-password` (`pages/reset-password.tsx`) where a new password is set. The app domain must be in the Supabase redirect allow-list — the API server keeps this in sync automatically on startup (`ensureAuthRedirectsOnStartup()` → `@workspace/supabase-auth-config`), so a published app self-registers its production domain on first boot; the `configure-auth-redirect-urls` script does the same manually if needed.
- **Master-admin browser recovery** (no SMTP, no shell access required): login page → "نسيت كلمة المرور؟" → "استعادة حساب المسؤول الرئيسي" button → `/master-recovery` page. Owner enters `MASTER_RECOVERY_CODE` secret + new password → `POST /api/auth/master-recovery` validates the code server-side (SHA-256 constant-time compare), resets `admin@safwa.app` password in Supabase, sets `must_change_password: false` and `password_changed_at: now`, audit-logs the event (no code or password recorded), clears the token cache, then redirects to login — admin enters immediately without a forced-change screen. Rate-limited: 5 wrong attempts → 15-minute IP lockout. The shell script `reset-admin-password.ts` remains as a secondary backup.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm run typecheck:libs` after changing `lib/db/src/schema/` before typechecking artifacts
- Orval hooks take params directly, NOT wrapped in `{ params: {} }` — e.g. `useListUnits({ buildingId: 1 })`
- `Charge.type` (not `chargeType`), `ChargeInput.type` (not `chargeType`)
- The `SUPABASE_URL` secret holds the real project URL (`https://<project-ref>.supabase.co`); `resolveSupabaseUrl()` (api-server lib/supabase.ts, vite.config.ts, migration script) now just reads and validates it and throws if it isn't an http(s) URL. The old derive-from-`SUPABASE_DATABASE_URL` workaround was retired — see `.agents/memory/supabase-auth-config.md`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

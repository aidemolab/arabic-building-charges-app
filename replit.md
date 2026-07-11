# نظام رسوم المبنى — Building Charges & Payments

A full-stack Arabic RTL web application for managing building charges, payments, and forecasts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/building-charges run dev` — run the frontend (port 22146, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — session signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Recharts, Arabic RTL, Cairo font
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Auth: express-session + connect-pg-simple + bcryptjs
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
- Session-based auth (no JWT); sessions stored in PostgreSQL via connect-pg-simple
- Import route accepts flat Excel rows with month columns (jan/feb/…/dec) per unit/person
- Audit log written on all create/update/cancel/archive operations via auditHelper

## Product

- Secure login → Arabic RTL dashboard with charts
- Charges & Payments page with 6-filter combo (building, month, year, type, status, role)
- Payment cancellation with reason + audit history
- Excel import with preview/validation, Excel export with same filters
- Buildings / Units / Persons management with archive support
- Dashboard: KPI cards, monthly actual vs forecast bar chart, pie chart, per-building table

## Default credentials

- Username: `admin` / Password: `admin123`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm run typecheck:libs` after changing `lib/db/src/schema/` before typechecking artifacts
- Orval hooks take params directly, NOT wrapped in `{ params: {} }` — e.g. `useListUnits({ buildingId: 1 })`
- `Charge.type` (not `chargeType`), `ChargeInput.type` (not `chargeType`)
- connect-pg-simple needs `tableName: "session"` to avoid looking for `table.sql` on disk

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

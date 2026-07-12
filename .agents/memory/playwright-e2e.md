---
name: Playwright e2e setup
description: How browser e2e tests run in this repo — system libs, running against live workflows, and Supabase account lifecycle.
---

# Playwright e2e in this repo

The `@workspace/building-charges` package hosts Playwright specs under `e2e/`
(`pnpm --filter @workspace/building-charges run test:e2e`).

## Running the browser needs Nix system libs
A pnpm-installed Chromium (`playwright install chromium`) fails at launch with
`libglib-2.0.so.0: cannot open shared object file` until the Chromium runtime
libraries are installed as Nix system dependencies (glib, nss, nspr,
at-spi2-atk/at-spi2-core, cups, dbus, expat, libdrm, libxkbcommon, mesa,
alsa-lib, pango, cairo, gtk3, fontconfig, freetype, libgbm, and the relevant
`xorg.*` libs). Install them via `installSystemDependencies(...)` — they land in
`replit.nix`. **Why:** the Nix container ships no system Chromium and no glibc
graphics stack by default.

## Tests run against the already-running workflows
There is no Playwright `webServer` block. The api-server and web workflows must
already be up; the config points `baseURL` at the shared proxy `http://localhost:80`
(never a service port). **How to apply:** if e2e fails to connect, restart the
workflows first, don't add a webServer that re-launches the dev servers (they
need workflow-provided `PORT`/`BASE_PATH`).

## Supabase account lifecycle inside e2e
The forced-password spec provisions a temporary admin in `global-setup` via the
service-role admin client, and the member is created through the admin UI mid-test.
Every account uses the `e2e-pw-` email prefix so `global-teardown` can purge both
Supabase Auth users (paged `listUsers` + `deleteUser`) and local `users` rows
(`username LIKE 'e2e-pw-%'`, connected with the same `ssl:{rejectUnauthorized:false}`
Supabase settings as `lib/db`). **Why:** the app's real data lives in Supabase, not
the stale built-in Postgres; leftover e2e rows otherwise pollute the users table.

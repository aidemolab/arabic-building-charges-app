---
name: Admin account verification pitfall
description: Why diagnostic scripts must never re-rotate the live master-admin Supabase password.
---

# Verifying the master-admin recovery/login flow safely

Never run a diagnostic/cleanup script that rotates `admin@safwa.app`'s Supabase
password *after* the user has completed a recovery. Doing so silently overwrites
the password they just chose and locks them out — the login page then rejects
their correct password with "البريد الإلكتروني أو كلمة المرور غير صحيحة", which
looks like a broken recovery flow but is actually the diagnostic clobbering it.

**Why:** `admin.auth.admin.updateUserById({ password })` changes the live
credential immediately; there is no undo and the random value is unknowable.

**How to apply:** To verify the end-to-end flow, either (a) test against a
throwaway Supabase user, or (b) run the live `master-recovery` endpoint with a
temp password, confirm sign-in + protected-API access + `must_change_password`
is false + audit has no secrets, then leave the account on a **random unknown**
password with `must_change_password: false` so the *user* sets the final
password via the in-app recovery flow. Do not hand the user a known password.
`supabase.auth.getUser()` returns fresh metadata (server round-trip);
`getSession()`/the JWT keep the stale value — read the flag via `getUser()`.

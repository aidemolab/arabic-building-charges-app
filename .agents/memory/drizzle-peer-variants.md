---
name: drizzle-orm peer variant split
description: Adding drizzle-orm to a workspace package without pg/@types/pg breaks api-server typecheck with dual SQL type errors
---

# drizzle-orm peer variant split

Adding `drizzle-orm` as a dependency to a workspace package that does NOT also depend on `pg` + `@types/pg` makes pnpm create a second peer-resolved instance (`drizzle-orm@X` vs `drizzle-orm@X_@types+pg_pg`). Typecheck then fails across the repo with "Types have separate declarations of a private property 'shouldInlineParams'".

**Why:** pnpm materializes one drizzle-orm copy per peer-dependency combination; `@workspace/db`'s emitted declarations reference the pg-flavored copy.

**How to apply:**
- Prefer importing drizzle helpers from `@workspace/db` (it re-exports `eq`) instead of adding `drizzle-orm` to new packages.
- If a package must depend on `drizzle-orm` directly, also add `pg` (deps) and `@types/pg` (devDeps) so it resolves to the same variant — this is how `artifacts/api-server` is set up.

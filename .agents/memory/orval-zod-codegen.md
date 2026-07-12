---
name: Orval zod codegen limits
description: OpenAPI string formats that break the api-zod codegen build
---

# Orval zod codegen limits

Do not use `format: email` (and be wary of other string formats) in `lib/api-spec/openapi.yaml`.

**Why:** Orval emits `zod.email()` for `format: email`, but the pinned zod 3.25 used by
`lib/api-zod` has no top-level `z.email()`, so `codegen` fails typecheck. Validation of email
shape is done manually in the route handler instead.

**How to apply:** If codegen fails inside `lib/api-zod/src/generated/api.ts` with a
"Property 'x' does not exist on type zod" error, remove the offending `format:` from the spec
and validate in the handler.

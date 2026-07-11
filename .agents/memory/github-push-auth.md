---
name: GitHub push auth from Replit
description: How to authenticate git push to GitHub when replit-git-askpass fails
---
# Pushing to GitHub from this environment

**Rule:** If `git push` to GitHub fails with "Invalid username or token", the built-in `replit-git-askpass` credentials are stale. Use the GitHub connector token from the credential proxy instead.

**Why:** The default askpass helper returned an invalid token even after the GitHub connection was healthy. `listConnections('github')` in the code sandbox also returned empty despite a bound, healthy connection — it cannot be relied on for this connector.

**How to apply:**
1. Ensure the GitHub connection is bound (`addIntegration` + `proposeIntegration` if `listConnections` / proxy return nothing).
2. From bash, fetch `https://$REPLIT_CONNECTORS_HOSTNAME/api/v2/connection?include_secrets=true` with header `X_REPLIT_TOKEN: repl $REPL_IDENTITY` — the item's `settings.access_token` (or `settings.oauth.credentials.access_token`) is a valid 40-char token.
3. Write the token to a temp file, use a temp `GIT_ASKPASS` script (`Username* → x-access-token`, `Password* → cat token file`), run the push, then delete both temp files. Never echo the token.
4. Note: `process.env` is undefined in the code_execution sandbox — env vars are only reachable from bash.

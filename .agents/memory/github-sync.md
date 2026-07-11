---
name: Syncing the app to GitHub
description: How to keep aidemolab/arabic-building-charges-app up to date without leaking client data
---
# Keeping GitHub up to date

**Rule:** Never push the local branch history to GitHub. Always sync via `bash scripts/sync-github.sh` (optionally passing a commit message).

**Why:** The local git history still contains the client Excel workbook in pre-scrub commits (July 2026). GitHub's `origin/main` holds a cleaned, rewritten history, so local and remote have permanently diverged. A normal `git push` would either be rejected or (if forced) re-upload the scrubbed client data.

**How to apply:**
1. After meaningful app changes, run `bash scripts/sync-github.sh "message"`.
2. The script snapshots the current working tree (respecting .gitignore), refuses to push if any `.xlsx` or `attached_assets/` file is in the snapshot, and fast-forward pushes a single commit parented on remote main. It is idempotent — exits cleanly when trees already match.
3. Auth is fetched fresh from the GitHub connector credential proxy each run (see github-push-auth.md); no setup needed.
4. Never use `git push origin main` or any `--force` push to this remote.

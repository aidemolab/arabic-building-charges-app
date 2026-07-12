---
name: Syncing the app to GitHub
description: How to keep aidemolab/arabic-building-charges-app up to date without leaking client data
---
# Keeping GitHub up to date

**Rule:** Never push the local branch history to GitHub. Always sync via `bash scripts/sync-github.sh` (optionally passing a commit message).

**Why:** The local git object store used to contain the client Excel workbook blob in pre-scrub commits, and platform merge-backs repeatedly re-parented `main` onto that dirty history. On 2026-07-12, with explicit user authorisation, the full purge was completed: `main` was re-parented onto GitHub's clean tip via `git commit-tree <tree> -p origin/main` + `git update-ref`, all stale branches (`replit-agent`, `subrepl-*`) were re-deleted, the platform refs (`refs/replit/agent-ledger`, `refs/remotes/gitsafe-backup/main`, `refs/heads/main-repl/main`) were deleted, reflogs expired, and `git gc --prune=now` removed the workbook blob. Verified clean at the time — but the purge was performed in an isolated task environment, and the subsequent platform rebase onto `main-repl/main` re-fetched the main app's history, which still contains the dirty commits. Conclusion: a purge run from a task environment CANNOT stick; the definitive purge must be executed in the main app's own repository (same recipe), or the dirty ancestry returns on every rebase/merge-back. The sync-script-only rule stands regardless.

**Watch out:** After any platform merge-back, `git log --oneline main -- '*.xlsx'` must return nothing before considering any direct push. If it doesn't, main has been re-contaminated: re-parent the current tree onto the clean tip with `git commit-tree <tree> -p <clean-tip>` + `git update-ref refs/heads/main <new>` (prefer update-ref over reset --hard so uncommitted files survive), delete any re-created dirty refs (check `git for-each-ref` — including `refs/heads/main-repl/main`), expire reflogs, and `git gc --prune=now` (only with explicit user authorisation).

**How to apply:**
1. After meaningful app changes, run `bash scripts/sync-github.sh "message"`.
2. The script snapshots the current working tree (respecting .gitignore), refuses to push if any `.xlsx` or `attached_assets/` file is in the snapshot, and fast-forward pushes a single commit parented on remote main. It is idempotent — exits cleanly when trees already match.
3. Auth is fetched fresh from the GitHub connector credential proxy each run (see github-push-auth.md); no setup needed.
4. Never use `git push origin main` or any `--force` push to this remote.

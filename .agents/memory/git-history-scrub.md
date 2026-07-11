---
name: Git history scrubbing gotchas
description: Pitfalls when using git-filter-repo to remove files from history in this environment
---
# Scrubbing files from Git history

**Rule:** Before running `git filter-repo` to remove a file from history, copy that file somewhere outside the repo first, and note `git remote -v`.

**Why:** filter-repo checks out the rewritten HEAD, so the scrubbed file vanishes from the working directory too — even when the goal is only to untrack it. It also deletes the `origin` remote. Both happened during the workbook scrub (July 2026); the file was recovered by cloning the `gitsafe-backup` remote into /tmp and copying it back.

**How to apply:**
1. `cp` the target file to /tmp before rewriting.
2. After the rewrite, re-add `origin` and restore the file to disk (ensure it's gitignored so it stays untracked).
3. If the file was lost, the `gitsafe-backup` remote retains pre-rewrite history — clone it read-only into /tmp to extract the file; never push to it.

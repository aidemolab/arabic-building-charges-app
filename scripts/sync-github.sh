#!/usr/bin/env bash
# Sync the current project state to GitHub (aidemolab/arabic-building-charges-app).
#
# IMPORTANT: local git history still contains the client Excel workbook in old
# commits (pre-scrub). NEVER push local branch history directly. This script
# snapshots the current *working tree* (respecting .gitignore) into a commit
# parented on the clean remote main, so no scrubbed data ever reaches GitHub.
#
# Usage: bash scripts/sync-github.sh [commit message]

set -euo pipefail

REMOTE=origin
BRANCH=main

TOK_FILE=$(mktemp)
ASKPASS_FILE=$(mktemp)
trap 'rm -f "$TOK_FILE" "$ASKPASS_FILE"' EXIT
chmod 600 "$TOK_FILE" "$ASKPASS_FILE"

# 1. Fetch a fresh GitHub token from the Replit connector credential proxy
#    (the built-in replit-git-askpass returns stale credentials).
curl -s -H "X_REPLIT_TOKEN: repl $REPL_IDENTITY" \
  "https://$REPLIT_CONNECTORS_HOSTNAME/api/v2/connection?include_secrets=true" \
  | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c).on('end',()=>{
      const j=JSON.parse(d);
      const it=(j.items||[]).find(i=>i.connector_name==='github');
      const t=it?.settings?.access_token||it?.settings?.oauth?.credentials?.access_token||'';
      if(!t){console.error('No GitHub token available from connector proxy');process.exit(1);}
      require('fs').writeFileSync(process.argv[1],t);
    })" "$TOK_FILE"

cat > "$ASKPASS_FILE" <<EOF
#!/bin/bash
case "\$1" in
  Username*) echo "x-access-token";;
  Password*) cat "$TOK_FILE";;
esac
EOF
chmod +x "$ASKPASS_FILE"
export GIT_ASKPASS="$ASKPASS_FILE"

# 2. Snapshot the working tree into a temp index (respects .gitignore, includes untracked)
TMP_INDEX=$(mktemp)
rm -f "$TMP_INDEX"
trap 'rm -f "$TOK_FILE" "$ASKPASS_FILE" "$TMP_INDEX"' EXIT
GIT_INDEX_FILE="$TMP_INDEX" git read-tree HEAD
GIT_INDEX_FILE="$TMP_INDEX" git add -A
LOCAL_TREE=$(GIT_INDEX_FILE="$TMP_INDEX" git write-tree)

# 3. Safety gate: no client data may ever be pushed
if git ls-tree -r "$LOCAL_TREE" --name-only | grep -qiE '\.xlsx$|^attached_assets/'; then
  echo "ERROR: snapshot tree contains client data files (xlsx / attached_assets). Aborting push." >&2
  git ls-tree -r "$LOCAL_TREE" --name-only | grep -iE '\.xlsx$|^attached_assets/' >&2
  exit 1
fi

# 4. Compare trees; skip if GitHub already matches
git fetch "$REMOTE" "$BRANCH"
REMOTE_TREE=$(git rev-parse "$REMOTE/$BRANCH^{tree}")
if [ "$LOCAL_TREE" = "$REMOTE_TREE" ]; then
  echo "GitHub is already up to date (trees match)."
  exit 0
fi

# 5. Snapshot commit: current tree, parented on clean remote history
MSG="${1:-Sync from Replit: $(git log -1 --format=%s) ($(date -u +%Y-%m-%d))}"
export GIT_AUTHOR_NAME="Replit Sync" GIT_AUTHOR_EMAIL="noreply@replit.com"
export GIT_COMMITTER_NAME="Replit Sync" GIT_COMMITTER_EMAIL="noreply@replit.com"
NEW_COMMIT=$(git commit-tree "$LOCAL_TREE" -p "$REMOTE/$BRANCH" -m "$MSG")

# 6. Fast-forward push (never force)
git push "$REMOTE" "$NEW_COMMIT:refs/heads/$BRANCH"
echo "Pushed $NEW_COMMIT to $REMOTE/$BRANCH: $MSG"

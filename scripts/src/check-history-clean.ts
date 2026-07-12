/**
 * Security check: verify the confidential client workbook has NOT crept back
 * into reachable Git history.
 *
 * The client Excel workbook (`attached_assets/Building_Charges_2026_*.xlsx`)
 * contains real resident/financial data and must never live in version
 * control. It was purged from history once, but platform merge-backs can
 * re-parent `main` onto older, dirty commits and silently reintroduce the
 * blob (see `.agents/memory/github-sync.md`). This script scans every object
 * reachable from any ref and fails loudly if a `.xlsx` file or anything under
 * `attached_assets/` is found, so the leak can't return unnoticed.
 *
 * NOTE: This only DETECTS the problem. Actually purging the blob must be done
 * in the main app's own repository with explicit user authorisation — a purge
 * run from a task environment does not stick.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-history-clean
 *     — exits 0 if history is clean, exits 1 (with the offending paths) if not
 */

export {};

import { execFileSync } from "node:child_process";

const FORBIDDEN = /(\.xlsx$)|(^attached_assets\/)/i;

function listHistoryPaths(): string[] {
  let stdout: string;
  try {
    stdout = execFileSync(
      "git",
      ["rev-list", "--all", "--objects"],
      { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`git rev-list --all --objects failed: ${msg}`);
  }

  // Each line is "<sha> [<path>]"; commit/tree objects have no path.
  const paths = new Set<string>();
  for (const line of stdout.split("\n")) {
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx === -1) continue;
    const path = line.slice(spaceIdx + 1).trim();
    if (path) paths.add(path);
  }
  return [...paths];
}

function main(): void {
  const offending = listHistoryPaths()
    .filter((p) => FORBIDDEN.test(p))
    .sort();

  if (offending.length > 0) {
    console.error(
      "\nFAIL: the confidential client workbook (or an attached_assets file) is " +
        "reachable from Git history:\n",
    );
    for (const p of offending) console.error(`  - ${p}`);
    console.error(
      "\nThis is a data leak: real resident/financial data must never live in " +
        "version control.\n" +
        "The blob must be purged from the MAIN app's own repository (a task-env " +
        "purge does not stick) with explicit user authorisation — see " +
        "`.agents/memory/github-sync.md` for the recipe.\n" +
        "Never `git push` this history to GitHub; sync only via " +
        "`bash scripts/sync-github.sh`.",
    );
    process.exit(1);
  }

  console.log(
    "PASS: no .xlsx or attached_assets/ files are reachable from Git history.",
  );
}

main();

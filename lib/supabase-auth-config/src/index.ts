/**
 * Shared helper for keeping the Supabase Auth redirect allow-list in sync with
 * the app's current domain(s).
 *
 * Supabase silently drops the requested `redirect_to` (falling back to the
 * project Site URL) when the target domain is not in the auth `uri_allow_list`.
 * This means password-recovery emails stop landing on the in-app
 * `/reset-password` page as soon as the app is served from a new domain
 * (e.g. the first time it is published) unless the new domain is allow-listed.
 *
 * Used by:
 *   - `scripts/src/configure-auth-redirect-urls.ts` (manual, verbose run)
 *   - the API server startup hook (best-effort, self-healing on every boot)
 */

export interface EnsureAllowListResult {
  /** The Supabase project ref the config was read/written against. */
  projectRef: string;
  /** The Site URL currently configured on the project. */
  siteUrl: string;
  /** Allow-list entries that were added by this run (empty when up to date). */
  addedEntries: string[];
  /** True when the Site URL was updated (only happens if it was still default). */
  siteUrlUpdated: boolean;
  /** The full set of domains that were reconciled. */
  domains: string[];
}

export class MissingAccessTokenError extends Error {
  constructor() {
    super(
      "SUPABASE_ACCESS_TOKEN (Supabase personal access token) is required. " +
        "Create one at https://supabase.com/dashboard/account/tokens.",
    );
    this.name = "MissingAccessTokenError";
  }
}

/**
 * Resolve the Supabase project ref from SUPABASE_URL, falling back to the
 * project ref embedded in the pooler username of SUPABASE_DATABASE_URL.
 */
export function resolveSupabaseProjectRef(): string {
  const raw = (process.env.SUPABASE_URL ?? "").trim();
  const urlMatch = raw.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (urlMatch) return urlMatch[1];
  const dbUrl = process.env.SUPABASE_DATABASE_URL ?? "";
  try {
    const parsed = new URL(dbUrl.replace(/^postgres(ql)?:/i, "http:"));
    const ref = decodeURIComponent(parsed.username).split(".")[1];
    if (ref) return ref;
  } catch {
    // fall through
  }
  throw new Error(
    "Could not determine the Supabase project ref from SUPABASE_URL or SUPABASE_DATABASE_URL",
  );
}

/**
 * Collect the app domains from REPLIT_DOMAINS (comma-separated) and
 * REPLIT_DEV_DOMAIN. In production REPLIT_DOMAINS holds the published domain.
 */
export function collectDomains(): string[] {
  const domains = new Set<string>();
  for (const d of (process.env.REPLIT_DOMAINS ?? "").split(",")) {
    const trimmed = d.trim();
    if (trimmed) domains.add(trimmed);
  }
  const dev = (process.env.REPLIT_DEV_DOMAIN ?? "").trim();
  if (dev) domains.add(dev);
  return [...domains];
}

/**
 * Build the allow-list entries wanted for a domain: a broad wildcard plus the
 * explicit reset-password path (belt-and-suspenders against wildcard rules).
 */
export function wantedEntriesForDomain(domain: string): string[] {
  return [`https://${domain}/**`, `https://${domain}/reset-password`];
}

/**
 * Ensure every current app domain is present in the Supabase Auth redirect
 * allow-list. Idempotent: only issues a PATCH when something is missing.
 *
 * Throws MissingAccessTokenError when SUPABASE_ACCESS_TOKEN is not set, and a
 * generic Error for API/HTTP failures. Callers decide whether to treat these as
 * fatal (the manual script) or best-effort (the server startup hook).
 */
export async function ensureAuthRedirectAllowList(): Promise<EnsureAllowListResult> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new MissingAccessTokenError();
  }

  const domains = collectDomains();
  if (domains.length === 0) {
    throw new Error(
      "No domains found in REPLIT_DOMAINS or REPLIT_DEV_DOMAIN — cannot configure the redirect allow-list",
    );
  }

  const projectRef = resolveSupabaseProjectRef();
  const configUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const getRes = await fetch(configUrl, { headers });
  if (!getRes.ok) {
    throw new Error(
      `GET auth config failed: ${getRes.status} ${await getRes.text()}`,
    );
  }
  const config = (await getRes.json()) as {
    site_url?: string;
    uri_allow_list?: string;
  };

  const existing = (config.uri_allow_list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowList = new Set(existing);

  const wanted = domains.flatMap(wantedEntriesForDomain);
  const missing = wanted.filter((entry) => !allowList.has(entry));
  for (const entry of missing) allowList.add(entry);

  const patch: Record<string, string> = {};
  if (missing.length > 0) {
    patch.uri_allow_list = [...allowList].join(",");
  }

  const siteUrl = (config.site_url ?? "").trim();
  const isDefaultSiteUrl =
    siteUrl === "" || /^https?:\/\/localhost(:\d+)?\/?$/i.test(siteUrl);
  if (isDefaultSiteUrl) {
    patch.site_url = `https://${domains[0]}`;
  }

  const result: EnsureAllowListResult = {
    projectRef,
    siteUrl,
    addedEntries: [],
    siteUrlUpdated: false,
    domains,
  };

  if (Object.keys(patch).length === 0) {
    return result;
  }

  const patchRes = await fetch(configUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
  });
  const body = await patchRes.text();
  if (!patchRes.ok) {
    throw new Error(`PATCH auth config failed: ${patchRes.status} ${body}`);
  }

  const updated = JSON.parse(body) as { uri_allow_list?: string };
  const updatedList = (updated.uri_allow_list ?? "")
    .split(",")
    .map((s) => s.trim());
  const stillMissing = wanted.filter((e) => !updatedList.includes(e));
  if (stillMissing.length > 0) {
    throw new Error(
      `PATCH accepted but allow-list still missing: ${stillMissing.join(", ")}`,
    );
  }

  result.addedEntries = missing;
  result.siteUrlUpdated = Boolean(patch.site_url);
  return result;
}

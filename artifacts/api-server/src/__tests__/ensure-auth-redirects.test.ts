import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Startup redirect-sync logging coverage.
 *
 * `ensureAuthRedirectsOnStartup` keeps Supabase's Auth redirect allow-list in
 * sync with the current domain so password-reset emails land on /reset-password.
 * The whole point of the escalated logging is *visibility*: in production a
 * missing SUPABASE_ACCESS_TOKEN must surface at `error` (an otherwise-invisible
 * failure) and a successful/"already up to date" sync must surface at `info`
 * (visible at the default log level). This suite locks that behavior in so a
 * future refactor can't quietly revert to a silent skip.
 *
 * Only two things are stubbed: `ensureAuthRedirectAllowList` from
 * `@workspace/supabase-auth-config` (so no real Supabase Management API call is
 * made) and the logger (so we can assert the exact level used). The escalation
 * logic itself runs unchanged.
 */

const { ensureSpy, MissingAccessTokenError, loggerSpies } = vi.hoisted(() => {
  class MissingAccessTokenError extends Error {
    constructor() {
      super("SUPABASE_ACCESS_TOKEN not set");
      this.name = "MissingAccessTokenError";
    }
  }
  return {
    ensureSpy: vi.fn(),
    MissingAccessTokenError,
    loggerSpies: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock("@workspace/supabase-auth-config", () => ({
  ensureAuthRedirectAllowList: ensureSpy,
  MissingAccessTokenError,
}));

vi.mock("../lib/logger", () => ({ logger: loggerSpies }));

const originalNodeEnv = process.env.NODE_ENV;

/**
 * `isProduction` is captured at module load, so NODE_ENV must be set *before*
 * the module is (re-)imported. A fresh import per test keeps each isolated.
 */
async function loadHook(nodeEnv: "production" | "development") {
  process.env.NODE_ENV = nodeEnv;
  vi.resetModules();
  const mod = await import("../lib/ensureAuthRedirects");
  return mod.ensureAuthRedirectsOnStartup;
}

beforeEach(() => {
  ensureSpy.mockReset();
  loggerSpies.info.mockReset();
  loggerSpies.warn.mockReset();
  loggerSpies.error.mockReset();
  loggerSpies.debug.mockReset();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("ensureAuthRedirectsOnStartup — missing SUPABASE_ACCESS_TOKEN", () => {
  it("logs at error (not warn/silent) in production and does not throw", async () => {
    ensureSpy.mockRejectedValueOnce(new MissingAccessTokenError());
    const hook = await loadHook("production");

    // Fire-and-forget: it must never throw and stop the server from booting.
    expect(() => hook()).not.toThrow();

    await vi.waitFor(() => expect(loggerSpies.error).toHaveBeenCalledTimes(1));
    // In production this is a real, otherwise-invisible failure — never warn.
    expect(loggerSpies.warn).not.toHaveBeenCalled();
    const [message] = loggerSpies.error.mock.calls[0];
    expect(String(message)).toContain("SUPABASE_ACCESS_TOKEN");
  });

  it("stays at warn (not error) in development", async () => {
    ensureSpy.mockRejectedValueOnce(new MissingAccessTokenError());
    const hook = await loadHook("development");

    expect(() => hook()).not.toThrow();

    await vi.waitFor(() => expect(loggerSpies.warn).toHaveBeenCalledTimes(1));
    expect(loggerSpies.error).not.toHaveBeenCalled();
  });
});

describe("ensureAuthRedirectsOnStartup — successful / up-to-date sync", () => {
  const upToDateResult = {
    projectRef: "abcd1234",
    addedEntries: [],
    siteUrlUpdated: false,
    domains: ["app.example.com"],
  };

  it("logs an up-to-date sync at info (visible at default level) in production", async () => {
    ensureSpy.mockResolvedValueOnce(upToDateResult);
    const hook = await loadHook("production");

    hook();

    await vi.waitFor(() => expect(loggerSpies.info).toHaveBeenCalledTimes(1));
    // Debug is below the default log level — it must not be used in production.
    expect(loggerSpies.debug).not.toHaveBeenCalled();
    const [context, message] = loggerSpies.info.mock.calls[0];
    expect(context).toMatchObject({ domains: ["app.example.com"] });
    expect(String(message)).toContain("already up to date");
  });

  it("keeps an up-to-date sync at debug (quiet) in development", async () => {
    ensureSpy.mockResolvedValueOnce(upToDateResult);
    const hook = await loadHook("development");

    hook();

    await vi.waitFor(() => expect(loggerSpies.debug).toHaveBeenCalledTimes(1));
    expect(loggerSpies.info).not.toHaveBeenCalled();
  });
});

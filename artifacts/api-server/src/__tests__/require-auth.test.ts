import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Authentication gate coverage — the REAL `requireAuth`.
 *
 * rbac.test.ts / forced-password.test.ts deliberately mock `requireAuth` (role
 * injected via `x-test-role`) so they can focus on the authorization matrix.
 * This suite does the opposite: it exercises the real `requireAuth` middleware
 * end-to-end so the authentication gate itself is guarded against silent
 * regressions. A regression here would let a banned employee or a stale/forged
 * token keep reading resident data even while the role matrix stays intact.
 *
 * Only the two external dependencies are stubbed: Supabase's `getUser` (so we
 * never hit the network) and the `@workspace/db` query builder (so we never hit
 * a live DB). The middleware — token parsing, 401/403 branches, auto-provision,
 * and the 60s in-memory token cache — runs unchanged.
 */

const { getUserSpy, state } = vi.hoisted(() => ({
  getUserSpy: vi.fn(),
  state: {
    selectRows: [] as unknown[],
    insertRow: null as unknown,
    selectCalls: 0,
    insertCalls: 0,
    updateCalls: 0,
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            state.selectCalls++;
            return Promise.resolve(state.selectRows);
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => {
          state.insertCalls++;
          return Promise.resolve([state.insertRow]);
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          state.updateCalls++;
          return Promise.resolve([]);
        },
      }),
    }),
  },
  usersTable: {},
}));

// Keep the real drizzle helpers but neutralize `eq` so it can be called against
// the table stub without building real SQL (the stubbed db ignores it anyway).
vi.mock("drizzle-orm", async (importActual) => {
  const actual = await importActual<typeof import("drizzle-orm")>();
  return { ...actual, eq: () => ({}) };
});

vi.mock("../lib/supabase", () => ({
  resolveSupabaseUrl: () => "https://example.supabase.co",
  supabaseAuth: { auth: { getUser: getUserSpy } },
}));

// Silence the error log emitted on the 500 branch.
vi.mock("../lib/logger", () => ({
  logger: { error: () => {}, info: () => {}, warn: () => {} },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

beforeEach(async () => {
  getUserSpy.mockReset();
  state.selectRows = [];
  state.insertRow = null;
  state.selectCalls = 0;
  state.insertCalls = 0;
  state.updateCalls = 0;

  // Fresh app per test so the module-level token cache starts empty and cannot
  // leak entries across tests. (vitest module registry is reset per file, but a
  // dynamic re-import keeps each test isolated.)
  vi.resetModules();
  const { requireAuth } = await import("../middlewares/auth");
  app = express();
  app.get("/protected", requireAuth, (req: express.Request, res: express.Response) => {
    res.status(200).json({ authUser: req.authUser });
  });
});

describe("requireAuth — authentication gate", () => {
  it("returns 401 when no bearer token is present", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
    expect(getUserSpy).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is not a Bearer token", async () => {
    const res = await request(app).get("/protected").set("Authorization", "Basic abc123");
    expect(res.status).toBe(401);
    expect(getUserSpy).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid/garbage token (Supabase rejects it)", async () => {
    getUserSpy.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });

    const res = await request(app).get("/protected").set("Authorization", "Bearer garbage-token");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
    expect(getUserSpy).toHaveBeenCalledTimes(1);
    // A rejected token must never reach the DB lookup.
    expect(state.selectCalls).toBe(0);
  });

  it("returns 403 'Account disabled' for a banned user, even with a valid token", async () => {
    getUserSpy.mockResolvedValue({
      data: { user: { id: "sb-banned", email: "banned@safwa.app", user_metadata: {} } },
      error: null,
    });
    state.selectRows = [
      {
        id: 42,
        username: "banned@safwa.app",
        role: "accountant",
        disabled: true,
        supabaseUserId: "sb-banned",
      },
    ];

    const res = await request(app).get("/protected").set("Authorization", "Bearer valid-banned");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Account disabled");
  });

  it("auto-provisions a local row for a valid token with no match and allows it through", async () => {
    getUserSpy.mockResolvedValue({
      data: {
        user: { id: "sb-new", email: "New.Member@Safwa.app", user_metadata: { role: "accountant" } },
      },
      error: null,
    });
    state.selectRows = []; // no existing local row
    state.insertRow = {
      id: 99,
      username: "new.member@safwa.app",
      role: "accountant",
      disabled: false,
      supabaseUserId: "sb-new",
    };

    const res = await request(app).get("/protected").set("Authorization", "Bearer valid-new");
    expect(res.status).toBe(200);
    expect(state.insertCalls).toBe(1);
    expect(res.body.authUser.role).toBe("accountant");
    // Email is normalized to lowercase before it becomes the identity.
    expect(res.body.authUser.email).toBe("new.member@safwa.app");
  });

  it("allows an existing, enabled user through with the role from their local row", async () => {
    getUserSpy.mockResolvedValue({
      data: {
        // Supabase metadata says admin, but the local row is the source of truth.
        user: { id: "sb-viewer", email: "viewer@safwa.app", user_metadata: { role: "admin" } },
      },
      error: null,
    });
    state.selectRows = [
      {
        id: 7,
        username: "viewer@safwa.app",
        role: "viewer",
        disabled: false,
        supabaseUserId: "sb-viewer",
      },
    ];

    const res = await request(app).get("/protected").set("Authorization", "Bearer valid-viewer");
    expect(res.status).toBe(200);
    expect(res.body.authUser.role).toBe("viewer");
    expect(state.insertCalls).toBe(0);
  });

  it("caches the verified token for the TTL — a second call within 60s doesn't re-hit Supabase", async () => {
    getUserSpy.mockResolvedValue({
      data: { user: { id: "sb-cache", email: "cache@safwa.app", user_metadata: {} } },
      error: null,
    });
    state.selectRows = [
      {
        id: 11,
        username: "cache@safwa.app",
        role: "viewer",
        disabled: false,
        supabaseUserId: "sb-cache",
      },
    ];

    const token = "Bearer valid-cache-token";
    const first = await request(app).get("/protected").set("Authorization", token);
    const second = await request(app).get("/protected").set("Authorization", token);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // The cache hit short-circuits before Supabase and the DB are consulted again.
    expect(getUserSpy).toHaveBeenCalledTimes(1);
    expect(state.selectCalls).toBe(1);
  });
});

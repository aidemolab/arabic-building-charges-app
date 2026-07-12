import { describe, it, expect, vi, beforeAll } from "vitest";
import type { Request, Response, NextFunction } from "express";
import request from "supertest";

/**
 * RBAC matrix coverage.
 *
 * These tests lock in the server-side role matrix enforced by `requireRole` /
 * `requireAdmin` (middlewares/auth.ts). Authentication is mocked — a request
 * carries its role via the `x-test-role` header, which our stubbed `requireAuth`
 * turns into `req.authUser`. The real `requireRole` / `requireAdmin` guards run
 * unchanged, so every 403 below is produced by the actual authorization code.
 *
 * The database and Supabase clients are stubbed so handlers never touch a live
 * DB. Blocked requests are rejected by the guard before any handler logic runs,
 * so their 403s are deterministic. For allowed requests we assert the guard let
 * them through (status !== 403); the eventual 2xx/4xx/5xx from the stubbed data
 * layer is not the subject under test.
 */

// A chainable, awaitable stub that stands in for Drizzle's query builder.
// Any method returns another chain; awaiting a chain resolves to an empty array.
function createChain(): unknown {
  const target = function () {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve([]);
      }
      return () => createChain();
    },
    apply() {
      return createChain();
    },
  });
}

const dbStub = new Proxy(
  {},
  {
    get() {
      return () => createChain();
    },
  },
);

const tableStub = {};

vi.mock("@workspace/db", () => ({
  db: dbStub,
  buildingsTable: tableStub,
  unitsTable: tableStub,
  personsTable: tableStub,
  chargesTable: tableStub,
  usersTable: tableStub,
  auditLogTable: tableStub,
  importLogTable: tableStub,
}));

// Neutralize Drizzle SQL builders so handlers can call eq/and/etc. against the
// table stubs without exploding; the stubbed db ignores the resulting SQL.
vi.mock("drizzle-orm", async (importActual) => {
  const actual = await importActual<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: () => ({}),
    and: () => ({}),
    ne: () => ({}),
    like: () => ({}),
  };
});

// Avoid the real Supabase client (which requires env + network) while keeping
// the module importable by routes/users.ts.
vi.mock("../lib/supabase", () => ({
  resolveSupabaseUrl: () => "https://example.supabase.co",
  supabaseAuth: {},
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: async () => ({ data: { user: { id: "sb-1" } }, error: null }),
        updateUserById: async () => ({ error: null }),
        deleteUser: async () => ({ error: null }),
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  }),
}));

// Keep the real requireRole / requireAdmin guards; only replace requireAuth so
// the role can be injected via header instead of a real Supabase token.
vi.mock("../middlewares/auth", async (importActual) => {
  const actual = await importActual<typeof import("../middlewares/auth")>();
  return {
    ...actual,
    requireAuth: (req: Request, res: Response, next: NextFunction) => {
      const role = req.headers["x-test-role"];
      if (typeof role !== "string" || role.length === 0) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.authUser = { id: 1, email: `${role}@test.local`, role };
      next();
    },
  };
});

type Method = "get" | "post" | "patch" | "delete";
type Role = "admin" | "accountant" | "viewer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

beforeAll(async () => {
  app = (await import("../app")).default;
});

function call(method: Method, path: string, role?: Role) {
  const r = request(app)[method](path);
  if (role) r.set("x-test-role", role);
  return r;
}

// Write / mutating endpoints grouped by the roles allowed to reach them.
const STRUCTURE_WRITES: Array<[Method, string]> = [
  ["post", "/api/buildings"],
  ["patch", "/api/buildings/1"],
  ["delete", "/api/buildings/1"],
  ["post", "/api/units"],
  ["patch", "/api/units/1"],
  ["delete", "/api/units/1"],
  ["post", "/api/persons"],
  ["patch", "/api/persons/1"],
  ["delete", "/api/persons/1"],
];

const CHARGE_WRITES: Array<[Method, string]> = [
  ["post", "/api/charges"],
  ["patch", "/api/charges/1"],
  ["post", "/api/charges/1/cancel"],
];

const IMPORT_WRITES: Array<[Method, string]> = [
  ["post", "/api/import/preview"],
  ["post", "/api/import/commit"],
];

const USER_ADMIN: Array<[Method, string]> = [
  ["get", "/api/users"],
  ["post", "/api/users"],
  ["patch", "/api/users/1"],
  ["delete", "/api/users/1"],
];

// Read endpoints available to every authenticated role.
const READS: string[] = [
  "/api/buildings",
  "/api/units",
  "/api/persons",
  "/api/charges",
  "/api/audit",
  "/api/export/charges",
];

describe("Authentication", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await call("get", "/api/buildings");
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated writes with 401", async () => {
    const res = await call("post", "/api/buildings");
    expect(res.status).toBe(401);
  });
});

describe("viewer role", () => {
  it("can read all list/export endpoints (200)", async () => {
    for (const path of READS) {
      const res = await call("get", path, "viewer");
      expect(res.status, `GET ${path}`).toBe(200);
    }
  });

  it("is blocked (403) from every structure write", async () => {
    for (const [method, path] of STRUCTURE_WRITES) {
      const res = await call(method, path, "viewer");
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("is blocked (403) from charge writes", async () => {
    for (const [method, path] of CHARGE_WRITES) {
      const res = await call(method, path, "viewer");
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("is blocked (403) from import preview/commit", async () => {
    for (const [method, path] of IMPORT_WRITES) {
      const res = await call(method, path, "viewer");
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("is blocked (403) from all user-management endpoints", async () => {
    for (const [method, path] of USER_ADMIN) {
      const res = await call(method, path, "viewer");
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });
});

describe("accountant role", () => {
  it("can read all list/export endpoints (200)", async () => {
    for (const path of READS) {
      const res = await call("get", path, "accountant");
      expect(res.status, `GET ${path}`).toBe(200);
    }
  });

  it("is blocked (403) from structure writes", async () => {
    for (const [method, path] of STRUCTURE_WRITES) {
      const res = await call(method, path, "accountant");
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("is blocked (403) from all user-management endpoints", async () => {
    for (const [method, path] of USER_ADMIN) {
      const res = await call(method, path, "accountant");
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("is allowed (not 403) on charge writes", async () => {
    for (const [method, path] of CHARGE_WRITES) {
      const res = await call(method, path, "accountant");
      expect(res.status, `${method} ${path}`).not.toBe(403);
    }
  });

  it("is allowed (not 403) on import preview/commit", async () => {
    for (const [method, path] of IMPORT_WRITES) {
      const res = await call(method, path, "accountant");
      expect(res.status, `${method} ${path}`).not.toBe(403);
    }
  });
});

describe("admin role", () => {
  it("can read all list/export endpoints (200)", async () => {
    for (const path of READS) {
      const res = await call("get", path, "admin");
      expect(res.status, `GET ${path}`).toBe(200);
    }
  });

  it("is allowed (not 403) on structure writes", async () => {
    for (const [method, path] of STRUCTURE_WRITES) {
      const res = await call(method, path, "admin");
      expect(res.status, `${method} ${path}`).not.toBe(403);
    }
  });

  it("is allowed (not 403) on charge writes", async () => {
    for (const [method, path] of CHARGE_WRITES) {
      const res = await call(method, path, "admin");
      expect(res.status, `${method} ${path}`).not.toBe(403);
    }
  });

  it("is allowed (not 403) on import preview/commit", async () => {
    for (const [method, path] of IMPORT_WRITES) {
      const res = await call(method, path, "admin");
      expect(res.status, `${method} ${path}`).not.toBe(403);
    }
  });

  it("is allowed (not 403) on all user-management endpoints", async () => {
    for (const [method, path] of USER_ADMIN) {
      const res = await call(method, path, "admin");
      expect(res.status, `${method} ${path}`).not.toBe(403);
    }
  });
});

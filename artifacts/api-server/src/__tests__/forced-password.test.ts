import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import request from "supertest";

/**
 * Forced first-login password change — server contract.
 *
 * The UI half of this flow (a non-dismissible ChangePasswordDialog that blocks
 * the app until a new password is set, and does not reappear afterwards) is
 * exercised end-to-end via the testing skill. This unit test locks in the
 * server-side guarantee that underpins it: every account created through the
 * admin "المستخدمون" page is provisioned with `must_change_password: true` in
 * its Supabase user_metadata. If that flag ever stopped being set, temporary
 * passwords would silently live forever — exactly the regression this guards.
 *
 * Auth is mocked (role injected via `x-test-role`) and the DB / Supabase admin
 * clients are stubbed, mirroring rbac.test.ts. The Supabase `createUser` call is
 * a spy so we can assert the metadata it receives.
 */

const { createUserSpy } = vi.hoisted(() => ({ createUserSpy: vi.fn() }));

const createdRow = {
  id: 1,
  username: "new-member@safwa.app",
  role: "viewer",
  disabled: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  supabaseUserId: "sb-1",
  passwordHash: "supabase-auth",
};

// An insert result that is both awaitable (recordAudit does `await ...values()`)
// and chainable via `.returning()` (the users route does `...values().returning()`).
const insertResult = {
  returning: () => Promise.resolve([createdRow]),
  then: (resolve: (v: unknown) => void) => resolve(undefined),
};

const dbMock = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve([]) }),
      orderBy: () => Promise.resolve([]),
    }),
  }),
  insert: () => ({ values: () => insertResult }),
  update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([createdRow]) }) }) }),
  delete: () => ({ where: () => Promise.resolve([]) }),
};

const tableStub = {};

vi.mock("@workspace/db", () => ({
  db: dbMock,
  buildingsTable: tableStub,
  unitsTable: tableStub,
  personsTable: tableStub,
  chargesTable: tableStub,
  usersTable: tableStub,
  auditLogTable: tableStub,
  importLogTable: tableStub,
}));

vi.mock("drizzle-orm", async (importActual) => {
  const actual = await importActual<typeof import("drizzle-orm")>();
  return { ...actual, eq: () => ({}), and: () => ({}), ne: () => ({}), like: () => ({}) };
});

vi.mock("../lib/supabase", () => ({
  resolveSupabaseUrl: () => "https://example.supabase.co",
  supabaseAuth: {},
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: createUserSpy,
        updateUserById: async () => ({ error: null }),
        deleteUser: async () => ({ error: null }),
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  }),
}));

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

beforeAll(async () => {
  app = (await import("../app")).default;
});

beforeEach(() => {
  createUserSpy.mockReset();
  createUserSpy.mockResolvedValue({ data: { user: { id: "sb-1" } }, error: null });
});

describe("forced first-login password change (server contract)", () => {
  it("provisions new accounts with must_change_password: true", async () => {
    const res = await call("post", "/api/users", "admin").send({
      email: "new-member@safwa.app",
      password: "temp123",
      role: "viewer",
    });

    expect(res.status).toBe(201);
    expect(createUserSpy).toHaveBeenCalledTimes(1);
    const arg = createUserSpy.mock.calls[0][0];
    expect(arg.email).toBe("new-member@safwa.app");
    expect(arg.user_metadata.must_change_password).toBe(true);
    expect(arg.user_metadata.role).toBe("viewer");
  });

  it("preserves the requested role alongside the forced flag", async () => {
    await call("post", "/api/users", "admin").send({
      email: "acct@safwa.app",
      password: "temp123",
      role: "accountant",
    });

    expect(createUserSpy).toHaveBeenCalledTimes(1);
    const arg = createUserSpy.mock.calls[0][0];
    expect(arg.user_metadata.must_change_password).toBe(true);
    expect(arg.user_metadata.role).toBe("accountant");
  });

  it("does not create an account (or set the flag) for non-admins", async () => {
    const res = await call("post", "/api/users", "viewer").send({
      email: "sneaky@safwa.app",
      password: "temp123",
      role: "viewer",
    });

    expect(res.status).toBe(403);
    expect(createUserSpy).not.toHaveBeenCalled();
  });
});

type Method = "get" | "post" | "patch" | "delete";
function call(method: Method, path: string, role?: string) {
  const r = request(app)[method](path);
  if (role) r.set("x-test-role", role);
  return r;
}

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  CREDS_PATH,
  E2E_PREFIX,
  getAdminClient,
  type E2ECreds,
} from "./helpers";

const creds = JSON.parse(readFileSync(CREDS_PATH, "utf8")) as E2ECreds;

const rid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const bannedEmail = `${E2E_PREFIX}banned-${rid}@safwa.app`;
const bannedPass = `BannedPw!${rid}`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
}

test.describe.configure({ mode: "serial" });

/**
 * End-to-end proof that disabling an employee genuinely locks them out of the
 * live app — not just that the middleware branches correctly (that is covered by
 * the stubbed require-auth.test.ts unit test).
 *
 * The flow provisions a real Supabase viewer, confirms they can read resident
 * data through the running app, has an admin disable them via the "المستخدمون"
 * page, and then asserts the disabled account is both (a) kicked out of its
 * existing session when it tries to reach data and (b) unable to sign in again.
 */
test("a disabled employee is locked out of the live app", async ({ browser }) => {
  const admin = getAdminClient();

  await test.step("provision a real Supabase viewer account", async () => {
    const { error } = await admin.auth.admin.createUser({
      email: bannedEmail,
      password: bannedPass,
      email_confirm: true,
      user_metadata: {
        role: "viewer",
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
      },
    });
    if (error) {
      throw new Error(`Failed to provision e2e viewer: ${error.message}`);
    }
  });

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  try {
    await test.step("viewer signs in and can read resident data", async () => {
      await login(memberPage, bannedEmail, bannedPass);
      await expect(
        memberPage.getByRole("button", { name: "تسجيل الخروج" }),
      ).toBeVisible();

      await memberPage.goto("/persons");
      await expect(
        memberPage.getByRole("heading", { name: "الملاك والمستأجرون" }),
      ).toBeVisible();
      // Real resident rows are present — the viewer genuinely reaches data.
      await expect(memberPage.locator("tbody tr").first()).toBeVisible();
      await expect(memberPage.getByText("لا توجد نتائج")).toHaveCount(0);
    });

    await test.step("admin disables the viewer via the المستخدمون page", async () => {
      await login(adminPage, creds.adminEmail, creds.adminPass);
      await expect(
        adminPage.getByRole("button", { name: "تسجيل الخروج" }),
      ).toBeVisible();

      await adminPage.goto("/users");
      // The viewer's local mirror row exists because it signed in above.
      const memberRow = adminPage
        .getByRole("row")
        .filter({ hasText: bannedEmail });
      await expect(memberRow).toBeVisible();

      await memberRow.getByRole("button", { name: "تعطيل" }).click();
      await expect(memberRow.getByText("معطّل")).toBeVisible();
    });

    await test.step("the disabled viewer's live session can no longer reach data", async () => {
      // A full reload forces a fresh /api/me — the disabled row now yields
      // 401/403, so AuthGuard bounces the session back to the login screen.
      await memberPage.goto("/persons");
      await expect(memberPage.locator("#email")).toBeVisible();
      await expect(
        memberPage.getByRole("heading", { name: "الملاك والمستأجرون" }),
      ).toHaveCount(0);
    });

    await test.step("the disabled viewer can no longer sign in", async () => {
      const freshContext = await browser.newContext();
      const freshPage = await freshContext.newPage();
      try {
        await login(freshPage, bannedEmail, bannedPass);
        await expect(
          freshPage.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحة"),
        ).toBeVisible();
        // Still on the login page — no app chrome ever renders.
        await expect(
          freshPage.getByRole("button", { name: "تسجيل الخروج" }),
        ).toHaveCount(0);
      } finally {
        await freshContext.close();
      }
    });
  } finally {
    await memberContext.close();
    await adminContext.close();
  }
});

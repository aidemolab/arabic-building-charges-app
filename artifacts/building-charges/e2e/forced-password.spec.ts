import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { CREDS_PATH, type E2ECreds } from "./helpers";

const creds = JSON.parse(readFileSync(CREDS_PATH, "utf8")) as E2ECreds;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page.locator("#email")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("new member is forced to change the temp password before using the app", async ({
  page,
}) => {
  const forcedTitle = "قم بتعيين كلمة مرور جديدة";

  await test.step("admin logs in without being forced to change a password", async () => {
    await login(page, creds.adminEmail, creds.adminPass);
    await expect(
      page.getByRole("button", { name: "تسجيل الخروج" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  await test.step("admin creates a new member account", async () => {
    await page.goto("/users");
    await page.getByRole("button", { name: "إضافة مستخدم" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("إضافة مستخدم جديد")).toBeVisible();
    await dialog.getByPlaceholder("user@example.com").fill(creds.memberEmail);
    await dialog.getByPlaceholder("6 أحرف على الأقل").fill(creds.tempPass);
    // Role defaults to viewer — leave it. Click create exactly once.
    await dialog.getByRole("button", { name: "إنشاء الحساب" }).click();

    // Dialog closes and the new member appears in the table.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: creds.memberEmail }),
    ).toBeVisible();

    await logout(page);
  });

  await test.step("member logs in and is blocked by a non-dismissible dialog", async () => {
    await login(page, creds.memberEmail, creds.tempPass);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(forcedTitle)).toBeVisible();

    // No close (X) button and no cancel/dismiss button in forced mode.
    await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "إلغاء" })).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "تذكيرني لاحقاً" }),
    ).toHaveCount(0);
    // The only action is "save password".
    await expect(
      dialog.getByRole("button", { name: "حفظ كلمة المرور" }),
    ).toBeVisible();

    // Escape is ignored.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    // Clicking outside (top-left corner, on the overlay) is ignored.
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();

    // The app chrome behind the overlay cannot be interacted with — a trial
    // click on the logout button is intercepted by the modal overlay.
    await expect(
      page
        .getByRole("button", { name: "تسجيل الخروج" })
        .click({ trial: true, timeout: 3000 }),
    ).rejects.toThrow();
  });

  await test.step("mismatched passwords are rejected and keep the dialog open", async () => {
    const dialog = page.getByRole("dialog");
    await page.locator("#new-password").fill(creds.newPass);
    await page.locator("#confirm-password").fill(`${creds.newPass}-nope`);
    await dialog.getByRole("button", { name: "حفظ كلمة المرور" }).click();

    await expect(
      page.getByText("كلمتا المرور غير متطابقتين").first(),
    ).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  await test.step("a valid new password clears the forced dialog", async () => {
    const dialog = page.getByRole("dialog");
    await page.locator("#new-password").fill(creds.newPass);
    await page.locator("#confirm-password").fill(creds.newPass);
    await dialog.getByRole("button", { name: "حفظ كلمة المرور" }).click();

    await expect(page.getByText("تم تغيير كلمة المرور").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  await test.step("the forced dialog does not reappear on the next login", async () => {
    await logout(page);
    await login(page, creds.memberEmail, creds.newPass);

    await expect(
      page.getByRole("button", { name: "تسجيل الخروج" }),
    ).toBeVisible();
    // Give the async password-state check time to run, then confirm no dialog.
    await page.waitForTimeout(1500);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(forcedTitle)).toHaveCount(0);
  });
});

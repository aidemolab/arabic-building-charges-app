import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CREDS_PATH,
  E2E_PREFIX,
  getAdminClient,
  purgeE2eAccounts,
  type E2ECreds,
} from "./helpers";

/**
 * Provisions a temporary Supabase admin (must_change_password = false so it can
 * reach the app) and writes the run's credentials for the spec. The member
 * account itself is created through the admin UI inside the test.
 */
export default async function globalSetup() {
  await purgeE2eAccounts();

  const rid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const creds: E2ECreds = {
    adminEmail: `${E2E_PREFIX}admin-${rid}@safwa.app`,
    adminPass: `AdminPw!${rid}`,
    memberEmail: `${E2E_PREFIX}member-${rid}@safwa.app`,
    tempPass: `TempPw!${rid}`,
    newPass: `NewPw!${rid}xyz`,
  };

  const admin = getAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: creds.adminEmail,
    password: creds.adminPass,
    email_confirm: true,
    user_metadata: {
      role: "admin",
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    },
  });
  if (error) {
    throw new Error(`Failed to provision e2e admin: ${error.message}`);
  }

  await mkdir(path.dirname(CREDS_PATH), { recursive: true });
  await writeFile(CREDS_PATH, JSON.stringify(creds, null, 2), "utf8");
}

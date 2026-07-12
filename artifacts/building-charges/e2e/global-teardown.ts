import { rm } from "node:fs/promises";
import { CREDS_PATH, purgeE2eAccounts } from "./helpers";

/** Remove every account created by the run and the shared credentials file. */
export default async function globalTeardown() {
  await purgeE2eAccounts();
  await rm(CREDS_PATH, { force: true });
}

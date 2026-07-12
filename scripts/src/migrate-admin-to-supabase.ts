import { createClient } from "@supabase/supabase-js";
import { db, usersTable, eq } from "@workspace/db";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@safwa.app";
// No default/hardcoded password: a password is only needed when CREATING a brand
// new Supabase Auth admin, and must be supplied explicitly via ADMIN_PASSWORD.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function resolveSupabaseUrl(): string {
  const raw = (process.env.SUPABASE_URL ?? "").trim();
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error(
      "SUPABASE_URL must be the Supabase project URL (https://<project-ref>.supabase.co)",
    );
  }
  return raw.replace(/\/+$/, "");
}

const supabaseUrl = resolveSupabaseUrl();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: existing, error: listError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  let authUser = existing.users.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );

  if (authUser) {
    console.log(`Supabase Auth user already exists: ${authUser.id} (${authUser.email})`);
  } else {
    if (!ADMIN_PASSWORD) {
      throw new Error(
        "ADMIN_PASSWORD env is required to create the admin Supabase account (no default password is allowed). Set a strong temporary password, then change it via the app or the master-recovery flow.",
      );
    }
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "admin" },
    });
    if (error) throw error;
    authUser = data.user;
    console.log(`Created Supabase Auth user: ${authUser.id} (${authUser.email})`);
  }

  const [legacyAdmin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, "admin"))
    .limit(1);

  if (legacyAdmin) {
    await db
      .update(usersTable)
      .set({ username: ADMIN_EMAIL })
      .where(eq(usersTable.id, legacyAdmin.id));
    console.log(
      `Renamed local users row #${legacyAdmin.id} from "admin" to "${ADMIN_EMAIL}" (audit history preserved)`,
    );
  } else {
    const [byEmail] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, ADMIN_EMAIL))
      .limit(1);
    if (byEmail) {
      console.log(`Local users row already mapped to ${ADMIN_EMAIL} (#${byEmail.id})`);
    } else {
      console.log("No legacy admin row found; middleware will create one on first login.");
    }
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

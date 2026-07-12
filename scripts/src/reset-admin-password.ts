import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@safwa.app";

const newPassword = process.env.ADMIN_PASSWORD;
if (!newPassword) {
  throw new Error(
    'ADMIN_PASSWORD is required. Invoke as: ADMIN_PASSWORD="<temp-password>" pnpm --filter @workspace/scripts run reset-admin-password',
  );
}
if (newPassword.length < 6) {
  throw new Error("ADMIN_PASSWORD must be at least 6 characters");
}

const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
if (!/^https?:\/\//i.test(supabaseUrl)) {
  throw new Error("SUPABASE_URL must be the Supabase project URL (https://<ref>.supabase.co)");
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) throw new Error(`Failed to list users: ${listErr.message}`);
const users = listData.users;

const admin = users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
if (!admin) throw new Error(`Admin user not found in Supabase Auth: ${ADMIN_EMAIL}`);

const existing = admin.user_metadata ?? {};

const { error: updateErr } = await supabase.auth.admin.updateUserById(admin.id, {
  password: newPassword,
  user_metadata: { ...existing, must_change_password: true },
});
if (updateErr) throw new Error(`Failed to reset admin password: ${updateErr.message}`);

console.log(`Done: temporary password set on ${ADMIN_EMAIL} (id: ${admin.id}).`);
console.log("The admin will be forced to change this password at next login.");

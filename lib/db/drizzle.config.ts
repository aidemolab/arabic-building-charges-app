import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database URL set. Provide SUPABASE_DATABASE_URL (preferred) or DATABASE_URL.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
  entities: {
    roles: {
      provider: "supabase",
    },
  },
});

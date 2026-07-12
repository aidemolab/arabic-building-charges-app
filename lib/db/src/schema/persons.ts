import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
  foreignKey,
  index,
  check,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";

export const personsTable = pgTable(
  "persons",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    unitId: integer("unit_id").notNull(),
    nameAr: text("name_ar").notNull(),
    role: text("role").notNull(),
    phone: text("phone"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.unitId],
      foreignColumns: [unitsTable.id],
      name: "persons_unit_id_fkey",
    }).onDelete("restrict"),
    index("persons_unit_id_idx").on(t.unitId),
    check("persons_role_check", sql`role = any (array['owner'::text, 'tenant'::text])`),
  ],
).enableRLS();

export const insertPersonSchema = createInsertSchema(personsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof personsTable.$inferSelect;

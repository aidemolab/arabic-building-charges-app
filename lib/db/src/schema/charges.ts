import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  text,
  numeric,
  boolean,
  timestamp,
  foreignKey,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { personsTable } from "./persons";

export const chargesTable = pgTable(
  "charges",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    unitId: integer("unit_id").notNull(),
    personId: integer("person_id").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
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
      name: "charges_unit_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.personId],
      foreignColumns: [personsTable.id],
      name: "charges_person_id_fkey",
    }).onDelete("restrict"),
    unique("charges_unit_id_person_id_year_month_type_key").on(
      t.unitId,
      t.personId,
      t.year,
      t.month,
      t.type,
    ),
    index("charges_unit_id_idx").on(t.unitId),
    index("charges_person_id_idx").on(t.personId),
    index("charges_period_idx").on(t.year, t.month),
    index("charges_filter_idx").on(t.type, t.status, t.archived),
    check("charges_year_check", sql`year >= 2000 and year <= 2100`),
    check("charges_month_check", sql`month >= 1 and month <= 12`),
    check("charges_amount_check", sql`amount > (0)::numeric`),
    check("charges_type_check", sql`type = any (array['actual'::text, 'forecast'::text])`),
    check(
      "charges_status_check",
      sql`status = any (array['paid'::text, 'pending'::text, 'cancelled'::text])`,
    ),
    check("charges_check", sql`(status <> 'cancelled'::text) or (cancel_reason is not null)`),
  ],
).enableRLS();

export const insertChargeSchema = createInsertSchema(chargesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCharge = z.infer<typeof insertChargeSchema>;
export type Charge = typeof chargesTable.$inferSelect;

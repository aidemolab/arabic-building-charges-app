import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { personsTable } from "./persons";

export const chargesTable = pgTable("charges", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  personId: integer("person_id").notNull().references(() => personsTable.id),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertChargeSchema = createInsertSchema(chargesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCharge = z.infer<typeof insertChargeSchema>;
export type Charge = typeof chargesTable.$inferSelect;

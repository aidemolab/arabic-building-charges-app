import { pgTable, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const buildingsTable = pgTable("buildings", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  nameAr: text("name_ar").notNull(),
  code: text("code").notNull().unique(),
  addressAr: text("address_ar"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}).enableRLS();

export const insertBuildingSchema = createInsertSchema(buildingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBuilding = z.infer<typeof insertBuildingSchema>;
export type Building = typeof buildingsTable.$inferSelect;

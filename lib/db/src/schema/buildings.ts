import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const buildingsTable = pgTable("buildings", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  code: text("code").notNull().unique(),
  addressAr: text("address_ar"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBuildingSchema = createInsertSchema(buildingsTable).omit({ id: true, createdAt: true });
export type InsertBuilding = z.infer<typeof insertBuildingSchema>;
export type Building = typeof buildingsTable.$inferSelect;

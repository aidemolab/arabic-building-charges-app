import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const importLogTable = pgTable("import_log", {
  id: serial("id").primaryKey(),
  filename: text("filename"),
  buildingId: integer("building_id"),
  year: integer("year"),
  unitsCreated: integer("units_created").notNull().default(0),
  personsCreated: integer("persons_created").notNull().default(0),
  chargesCreated: integer("charges_created").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  userId: integer("user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertImportLogSchema = createInsertSchema(importLogTable).omit({ id: true, createdAt: true });
export type InsertImportLog = z.infer<typeof insertImportLogSchema>;
export type ImportLog = typeof importLogTable.$inferSelect;

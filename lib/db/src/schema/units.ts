import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
  foreignKey,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { buildingsTable } from "./buildings";

export const unitsTable = pgTable(
  "units",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    buildingId: integer("building_id").notNull(),
    unitRef: text("unit_ref").notNull(),
    floor: integer("floor"),
    category: text("category"),
    tier: text("tier"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      columns: [t.buildingId],
      foreignColumns: [buildingsTable.id],
      name: "units_building_id_fkey",
    }).onDelete("restrict"),
    unique("units_building_id_unit_ref_key").on(t.buildingId, t.unitRef),
    index("units_building_id_idx").on(t.buildingId),
  ],
).enableRLS();

export const insertUnitSchema = createInsertSchema(unitsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Unit = typeof unitsTable.$inferSelect;

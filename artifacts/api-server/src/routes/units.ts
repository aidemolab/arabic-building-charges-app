import { Router } from "express";
import { db, unitsTable, buildingsTable, personsTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { recordAudit } from "./auditHelper";

const router = Router();

router.get("/units", requireAuth, async (req, res) => {
  try {
    const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;
    const floor = req.query.floor ? parseInt(req.query.floor as string) : undefined;
    const includeArchived = req.query.includeArchived === "true";

    const rows = await db
      .select({
        id: unitsTable.id,
        buildingId: unitsTable.buildingId,
        buildingNameAr: buildingsTable.nameAr,
        unitRef: unitsTable.unitRef,
        floor: unitsTable.floor,
        category: unitsTable.category,
        tier: unitsTable.tier,
        archived: unitsTable.archived,
        createdAt: unitsTable.createdAt,
      })
      .from(unitsTable)
      .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
      .where(
        and(
          buildingId ? eq(unitsTable.buildingId, buildingId) : undefined,
          floor !== undefined ? eq(unitsTable.floor, floor) : undefined,
          !includeArchived ? eq(unitsTable.archived, false) : undefined,
        ) as SQL
      )
      .orderBy(unitsTable.buildingId, unitsTable.floor, unitsTable.unitRef);

    res.json(rows.map(r => ({ ...r, buildingNameAr: r.buildingNameAr ?? null, floor: r.floor ?? null, category: r.category ?? null, tier: r.tier ?? null })));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/units", requireAuth, requireRole("admin"), async (req, res) => {
  const { buildingId, unitRef, floor, category, tier } = req.body;
  if (!buildingId || !unitRef) { res.status(400).json({ error: "buildingId and unitRef required" }); return; }
  try {
    const [u] = await db.insert(unitsTable).values({ buildingId, unitRef, floor: floor ?? null, category: category || null, tier: tier || null }).returning();
    await recordAudit({ entityType: "unit", entityId: u.id, action: "create", newData: u, userId: req.authUser!.id });
    res.status(201).json({ id: u.id, buildingId: u.buildingId, buildingNameAr: null, unitRef: u.unitRef, floor: u.floor ?? null, category: u.category ?? null, tier: u.tier ?? null, archived: u.archived, createdAt: u.createdAt });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/units/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  try {
    const [u] = await db
      .select({ id: unitsTable.id, buildingId: unitsTable.buildingId, buildingNameAr: buildingsTable.nameAr, unitRef: unitsTable.unitRef, floor: unitsTable.floor, category: unitsTable.category, tier: unitsTable.tier, archived: unitsTable.archived, createdAt: unitsTable.createdAt })
      .from(unitsTable)
      .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
      .where(eq(unitsTable.id, id))
      .limit(1);
    if (!u) { res.status(404).json({ error: "Not found" }); return; }
    const persons = await db.select().from(personsTable).where(and(eq(personsTable.unitId, id), eq(personsTable.archived, false)));
    res.json({ ...u, buildingNameAr: u.buildingNameAr ?? null, floor: u.floor ?? null, category: u.category ?? null, tier: u.tier ?? null, persons: persons.map(p => ({ ...p, phone: p.phone ?? null })) });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/units/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { unitRef, floor, category, tier } = req.body;
  try {
    const [old] = await db.select().from(unitsTable).where(eq(unitsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const updates: any = {};
    if (unitRef !== undefined) updates.unitRef = unitRef;
    if (floor !== undefined) updates.floor = floor;
    if (category !== undefined) updates.category = category;
    if (tier !== undefined) updates.tier = tier;
    const [u] = await db.update(unitsTable).set(updates).where(eq(unitsTable.id, id)).returning();
    await recordAudit({ entityType: "unit", entityId: id, action: "update", oldData: old, newData: u, userId: req.authUser!.id });
    res.json({ id: u.id, buildingId: u.buildingId, buildingNameAr: null, unitRef: u.unitRef, floor: u.floor ?? null, category: u.category ?? null, tier: u.tier ?? null, archived: u.archived, createdAt: u.createdAt });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/units/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id as string);
  try {
    const [old] = await db.select().from(unitsTable).where(eq(unitsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(unitsTable).set({ archived: true }).where(eq(unitsTable.id, id));
    await recordAudit({ entityType: "unit", entityId: id, action: "archive", oldData: old, userId: req.authUser!.id });
    res.json({ ok: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

import { Router } from "express";
import { db, personsTable, unitsTable, buildingsTable } from "@workspace/db";
import { eq, and, like, SQL } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { recordAudit } from "./auditHelper";

const router = Router();

router.get("/persons", requireAuth, async (req, res) => {
  try {
    const unitId = req.query.unitId ? parseInt(req.query.unitId as string) : undefined;
    const role = req.query.role as string | undefined;
    const nameAr = req.query.nameAr as string | undefined;
    const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;
    const includeArchived = req.query.includeArchived === "true";

    const conditions: (SQL | undefined)[] = [
      !includeArchived ? eq(personsTable.archived, false) : undefined,
      unitId ? eq(personsTable.unitId, unitId) : undefined,
      role ? eq(personsTable.role, role) : undefined,
      nameAr ? like(personsTable.nameAr, `%${nameAr}%`) : undefined,
    ];

    let rows: any[] = [];

    if (buildingId) {
      rows = await db
        .select({
          id: personsTable.id, unitId: personsTable.unitId, nameAr: personsTable.nameAr,
          role: personsTable.role, phone: personsTable.phone, archived: personsTable.archived,
          createdAt: personsTable.createdAt, unitRef: unitsTable.unitRef,
          floor: unitsTable.floor,
          buildingId: buildingsTable.id, buildingNameAr: buildingsTable.nameAr,
        })
        .from(personsTable)
        .leftJoin(unitsTable, eq(personsTable.unitId, unitsTable.id))
        .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
        .where(and(...conditions, eq(buildingsTable.id, buildingId)) as SQL)
        .orderBy(personsTable.nameAr);
    } else {
      rows = await db
        .select({
          id: personsTable.id, unitId: personsTable.unitId, nameAr: personsTable.nameAr,
          role: personsTable.role, phone: personsTable.phone, archived: personsTable.archived,
          createdAt: personsTable.createdAt, unitRef: unitsTable.unitRef,
          floor: unitsTable.floor,
          buildingId: buildingsTable.id, buildingNameAr: buildingsTable.nameAr,
        })
        .from(personsTable)
        .leftJoin(unitsTable, eq(personsTable.unitId, unitsTable.id))
        .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
        .where(and(...conditions) as SQL)
        .orderBy(personsTable.nameAr);
    }

    res.json(rows.map(r => ({ ...r, phone: r.phone ?? null, unitRef: r.unitRef ?? null, floor: r.floor ?? null, buildingId: r.buildingId ?? null, buildingNameAr: r.buildingNameAr ?? null })));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/persons", requireAuth, requireRole("admin"), async (req, res) => {
  const { nameAr, role, unitId, phone } = req.body;
  if (!nameAr || !role || !unitId) { res.status(400).json({ error: "nameAr, role, unitId required" }); return; }
  try {
    const [p] = await db.insert(personsTable).values({ nameAr, role, unitId, phone: phone || null }).returning();
    await recordAudit({ entityType: "person", entityId: p.id, action: "create", newData: p, userId: req.authUser!.id });
    res.status(201).json({ id: p.id, unitId: p.unitId, unitRef: null, floor: null, buildingId: null, buildingNameAr: null, nameAr: p.nameAr, role: p.role, phone: p.phone ?? null, archived: p.archived, createdAt: p.createdAt });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/persons/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  try {
    const [p] = await db
      .select({ id: personsTable.id, unitId: personsTable.unitId, nameAr: personsTable.nameAr, role: personsTable.role, phone: personsTable.phone, archived: personsTable.archived, createdAt: personsTable.createdAt, unitRef: unitsTable.unitRef, floor: unitsTable.floor, buildingId: buildingsTable.id, buildingNameAr: buildingsTable.nameAr })
      .from(personsTable)
      .leftJoin(unitsTable, eq(personsTable.unitId, unitsTable.id))
      .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
      .where(eq(personsTable.id, id))
      .limit(1);
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...p, phone: p.phone ?? null, unitRef: p.unitRef ?? null, floor: p.floor ?? null, buildingId: p.buildingId ?? null, buildingNameAr: p.buildingNameAr ?? null });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/persons/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { nameAr, role, phone, unitId } = req.body;
  try {
    const [old] = await db.select().from(personsTable).where(eq(personsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const updates: any = {};
    if (nameAr !== undefined) updates.nameAr = nameAr;
    if (role !== undefined) updates.role = role;
    if (phone !== undefined) updates.phone = phone;
    if (unitId !== undefined) updates.unitId = unitId;
    const [p] = await db.update(personsTable).set(updates).where(eq(personsTable.id, id)).returning();
    await recordAudit({ entityType: "person", entityId: id, action: "update", oldData: old, newData: p, userId: req.authUser!.id });
    res.json({ id: p.id, unitId: p.unitId, unitRef: null, floor: null, buildingId: null, buildingNameAr: null, nameAr: p.nameAr, role: p.role, phone: p.phone ?? null, archived: p.archived, createdAt: p.createdAt });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/persons/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id as string);
  try {
    const [old] = await db.select().from(personsTable).where(eq(personsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(personsTable).set({ archived: true }).where(eq(personsTable.id, id));
    await recordAudit({ entityType: "person", entityId: id, action: "archive", oldData: old, userId: req.authUser!.id });
    res.json({ ok: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

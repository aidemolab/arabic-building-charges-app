import { Router } from "express";
import { db, chargesTable, unitsTable, buildingsTable, personsTable } from "@workspace/db";
import { eq, and, like, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { recordAudit } from "./auditHelper";

const router = Router();

function chargeFields() {
  return {
    id: chargesTable.id,
    unitId: chargesTable.unitId,
    unitRef: unitsTable.unitRef,
    buildingId: buildingsTable.id,
    buildingNameAr: buildingsTable.nameAr,
    floor: unitsTable.floor,
    personId: chargesTable.personId,
    personNameAr: personsTable.nameAr,
    personRole: personsTable.role,
    year: chargesTable.year,
    month: chargesTable.month,
    amount: chargesTable.amount,
    type: chargesTable.type,
    status: chargesTable.status,
    paidAt: chargesTable.paidAt,
    notes: chargesTable.notes,
    cancelReason: chargesTable.cancelReason,
    archived: chargesTable.archived,
    createdAt: chargesTable.createdAt,
  };
}

function formatCharge(r: any) {
  return {
    ...r,
    amount: parseFloat(r.amount),
    unitRef: r.unitRef ?? null,
    buildingId: r.buildingId ?? null,
    buildingNameAr: r.buildingNameAr ?? null,
    floor: r.floor ?? null,
    personNameAr: r.personNameAr ?? null,
    personRole: r.personRole ?? null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    notes: r.notes ?? null,
    cancelReason: r.cancelReason ?? null,
  };
}

router.get("/charges", requireAuth, async (req, res) => {
  try {
    const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;
    const unitId = req.query.unitId ? parseInt(req.query.unitId as string) : undefined;
    const personId = req.query.personId ? parseInt(req.query.personId as string) : undefined;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const role = req.query.role as string | undefined;
    const nameAr = req.query.nameAr as string | undefined;
    const floor = req.query.floor ? parseInt(req.query.floor as string) : undefined;
    const includeArchived = req.query.includeArchived === "true";

    const conditions: (SQL | undefined)[] = [
      !includeArchived ? eq(chargesTable.archived, false) : undefined,
      unitId ? eq(chargesTable.unitId, unitId) : undefined,
      personId ? eq(chargesTable.personId, personId) : undefined,
      month ? eq(chargesTable.month, month) : undefined,
      year ? eq(chargesTable.year, year) : undefined,
      type ? eq(chargesTable.type, type) : undefined,
      status ? eq(chargesTable.status, status) : undefined,
      buildingId ? eq(buildingsTable.id, buildingId) : undefined,
      role ? eq(personsTable.role, role) : undefined,
      nameAr ? like(personsTable.nameAr, `%${nameAr}%`) : undefined,
      floor !== undefined ? eq(unitsTable.floor, floor) : undefined,
    ];

    const rows = await db
      .select(chargeFields())
      .from(chargesTable)
      .leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id))
      .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
      .leftJoin(personsTable, eq(chargesTable.personId, personsTable.id))
      .where(and(...conditions) as SQL)
      .orderBy(chargesTable.year, chargesTable.month, personsTable.nameAr);

    res.json(rows.map(formatCharge));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/charges", requireAuth, async (req, res) => {
  const { unitId, personId, year, month, amount, type, status, paidAt, notes } = req.body;
  if (!unitId || !personId || !year || !month || amount === undefined || !type) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  try {
    const [c] = await db.insert(chargesTable).values({
      unitId, personId, year, month, amount: amount.toString(),
      type, status: status ?? "pending",
      paidAt: paidAt ? new Date(paidAt) : null,
      notes: notes || null,
    }).returning();
    await recordAudit({ entityType: "charge", entityId: c.id, action: "create", newData: c, userId: (req.session as any).userId });
    const [full] = await db.select(chargeFields()).from(chargesTable).leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id)).leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id)).leftJoin(personsTable, eq(chargesTable.personId, personsTable.id)).where(eq(chargesTable.id, c.id)).limit(1);
    res.status(201).json(formatCharge(full));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/charges/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  try {
    const [row] = await db.select(chargeFields()).from(chargesTable).leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id)).leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id)).leftJoin(personsTable, eq(chargesTable.personId, personsTable.id)).where(eq(chargesTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(formatCharge(row));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/charges/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { amount, status, paidAt, notes, type } = req.body;
  try {
    const [old] = await db.select().from(chargesTable).where(eq(chargesTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const updates: any = {};
    if (amount !== undefined) updates.amount = amount.toString();
    if (status !== undefined) updates.status = status;
    if (paidAt !== undefined) updates.paidAt = paidAt ? new Date(paidAt) : null;
    if (notes !== undefined) updates.notes = notes;
    if (type !== undefined) updates.type = type;
    await db.update(chargesTable).set(updates).where(eq(chargesTable.id, id));
    await recordAudit({ entityType: "charge", entityId: id, action: "update", oldData: old, newData: { ...old, ...updates }, userId: (req.session as any).userId });
    const [full] = await db.select(chargeFields()).from(chargesTable).leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id)).leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id)).leftJoin(personsTable, eq(chargesTable.personId, personsTable.id)).where(eq(chargesTable.id, id)).limit(1);
    res.json(formatCharge(full));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/charges/:id/cancel", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { reason } = req.body;
  if (!reason) { res.status(400).json({ error: "reason required" }); return; }
  try {
    const [old] = await db.select().from(chargesTable).where(eq(chargesTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    if (old.status === "cancelled") { res.status(400).json({ error: "Already cancelled" }); return; }
    await db.update(chargesTable).set({ status: "cancelled", cancelReason: reason }).where(eq(chargesTable.id, id));
    await recordAudit({ entityType: "charge", entityId: id, action: "cancel", oldData: old, newData: { status: "cancelled", cancelReason: reason }, userId: (req.session as any).userId, notes: reason });
    const [full] = await db.select(chargeFields()).from(chargesTable).leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id)).leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id)).leftJoin(personsTable, eq(chargesTable.personId, personsTable.id)).where(eq(chargesTable.id, id)).limit(1);
    res.json(formatCharge(full));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

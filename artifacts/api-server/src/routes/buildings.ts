import { Router } from "express";
import { db, buildingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { recordAudit } from "./auditHelper";

const router = Router();

router.get("/buildings", requireAuth, async (req, res) => {
  try {
    const buildings = await db.select().from(buildingsTable).orderBy(buildingsTable.nameAr);
    res.json(buildings.map(b => ({
      id: b.id, nameAr: b.nameAr, code: b.code,
      addressAr: b.addressAr ?? null, archived: b.archived, createdAt: b.createdAt
    })));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/buildings", requireAuth, async (req, res) => {
  const { nameAr, code, addressAr } = req.body;
  if (!nameAr || !code) {
    res.status(400).json({ error: "nameAr and code required" });
    return;
  }
  try {
    const [b] = await db.insert(buildingsTable).values({ nameAr, code, addressAr: addressAr || null }).returning();
    await recordAudit({ entityType: "building", entityId: b.id, action: "create", newData: b, userId: (req.session as any).userId });
    res.status(201).json({ id: b.id, nameAr: b.nameAr, code: b.code, addressAr: b.addressAr ?? null, archived: b.archived, createdAt: b.createdAt });
  } catch (err: any) {
    if (err.code === "23505") { res.status(400).json({ error: "Code already exists" }); return; }
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/buildings/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  try {
    const [b] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id)).limit(1);
    if (!b) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: b.id, nameAr: b.nameAr, code: b.code, addressAr: b.addressAr ?? null, archived: b.archived, createdAt: b.createdAt });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/buildings/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const { nameAr, code, addressAr } = req.body;
  try {
    const [old] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    const updates: any = {};
    if (nameAr !== undefined) updates.nameAr = nameAr;
    if (code !== undefined) updates.code = code;
    if (addressAr !== undefined) updates.addressAr = addressAr;
    const [b] = await db.update(buildingsTable).set(updates).where(eq(buildingsTable.id, id)).returning();
    await recordAudit({ entityType: "building", entityId: id, action: "update", oldData: old, newData: b, userId: (req.session as any).userId });
    res.json({ id: b.id, nameAr: b.nameAr, code: b.code, addressAr: b.addressAr ?? null, archived: b.archived, createdAt: b.createdAt });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/buildings/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  try {
    const [old] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id)).limit(1);
    if (!old) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(buildingsTable).set({ archived: true }).where(eq(buildingsTable.id, id));
    await recordAudit({ entityType: "building", entityId: id, action: "archive", oldData: old, userId: (req.session as any).userId });
    res.json({ ok: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

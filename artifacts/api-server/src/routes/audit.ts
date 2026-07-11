import { Router } from "express";
import { db, auditLogTable, usersTable } from "@workspace/db";
import { eq, and, ne, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/audit", requireAuth, async (req, res) => {
  try {
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId ? parseInt(req.query.entityId as string) : undefined;
    const action = req.query.action as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const conditions: (SQL | undefined)[] = [
      ne(auditLogTable.action, "import_create"),
      entityType ? eq(auditLogTable.entityType, entityType) : undefined,
      entityId ? eq(auditLogTable.entityId, entityId) : undefined,
      action ? eq(auditLogTable.action, action) : undefined,
    ];

    const rows = await db
      .select({
        id: auditLogTable.id,
        entityType: auditLogTable.entityType,
        entityId: auditLogTable.entityId,
        action: auditLogTable.action,
        oldData: auditLogTable.oldData,
        newData: auditLogTable.newData,
        userId: auditLogTable.userId,
        username: usersTable.username,
        notes: auditLogTable.notes,
        createdAt: auditLogTable.createdAt,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.userId, usersTable.id))
      .where(and(...conditions) as SQL)
      .orderBy(auditLogTable.createdAt)
      .limit(limit);

    res.json(rows.map(r => ({
      ...r,
      oldData: r.oldData ?? null,
      newData: r.newData ?? null,
      userId: r.userId ?? null,
      username: r.username ?? null,
      notes: r.notes ?? null,
    })));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

import { db, auditLogTable } from "@workspace/db";
import { logger } from "../lib/logger";

interface AuditParams {
  entityType: string;
  entityId: number;
  action: string;
  oldData?: any;
  newData?: any;
  userId?: number;
  notes?: string;
}

export async function recordAudit(params: AuditParams) {
  try {
    await db.insert(auditLogTable).values({
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      oldData: params.oldData ? JSON.stringify(params.oldData) : null,
      newData: params.newData ? JSON.stringify(params.newData) : null,
      userId: params.userId ?? null,
      notes: params.notes ?? null,
    });
  } catch (err) {
    logger.error(err, "Audit log error");
  }
}

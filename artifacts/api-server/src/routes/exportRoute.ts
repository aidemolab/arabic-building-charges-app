import { Router } from "express";
import * as XLSX from "xlsx";
import { db, chargesTable, unitsTable, buildingsTable, personsTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const ARABIC_MONTHS: Record<number, string> = {
  1: "يناير", 2: "فبراير", 3: "مارس", 4: "أبريل",
  5: "مايو", 6: "يونيو", 7: "يوليو", 8: "أغسطس",
  9: "سبتمبر", 10: "أكتوبر", 11: "نوفمبر", 12: "ديسمبر",
};

router.get("/export/charges", requireAuth, async (req, res) => {
  try {
    const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const role = req.query.role as string | undefined;
    const floor = req.query.floor ? parseInt(req.query.floor as string) : undefined;

    const conditions: (SQL | undefined)[] = [
      eq(chargesTable.archived, false),
      buildingId ? eq(buildingsTable.id, buildingId) : undefined,
      month ? eq(chargesTable.month, month) : undefined,
      year ? eq(chargesTable.year, year) : undefined,
      type ? eq(chargesTable.type, type) : undefined,
      status ? eq(chargesTable.status, status) : undefined,
      role ? eq(personsTable.role, role) : undefined,
      floor !== undefined ? eq(unitsTable.floor, floor) : undefined,
    ];

    const rows = await db
      .select({
        buildingNameAr: buildingsTable.nameAr,
        floor: unitsTable.floor,
        unitRef: unitsTable.unitRef,
        personNameAr: personsTable.nameAr,
        personRole: personsTable.role,
        year: chargesTable.year,
        month: chargesTable.month,
        amount: chargesTable.amount,
        type: chargesTable.type,
        status: chargesTable.status,
        paidAt: chargesTable.paidAt,
        notes: chargesTable.notes,
      })
      .from(chargesTable)
      .leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id))
      .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
      .leftJoin(personsTable, eq(chargesTable.personId, personsTable.id))
      .where(and(...conditions) as SQL)
      .orderBy(chargesTable.year, chargesTable.month, personsTable.nameAr);

    const data = rows.map(r => ({
      "المبنى": r.buildingNameAr ?? "",
      "الطابق": r.floor ?? "",
      "رقم الوحدة": r.unitRef ?? "",
      "الاسم": r.personNameAr ?? "",
      "الصفة": r.personRole === "owner" ? "مالك" : "مستأجر",
      "السنة": r.year,
      "الشهر": ARABIC_MONTHS[r.month] ?? r.month,
      "المبلغ": parseFloat(r.amount),
      "النوع": r.type === "actual" ? "فعلي" : "توقعي",
      "الحالة": r.status === "paid" ? "مدفوع" : r.status === "cancelled" ? "ملغى" : "معلق",
      "تاريخ الدفع": r.paidAt ? new Date(r.paidAt).toLocaleDateString("ar-EG") : "",
      "ملاحظات": r.notes ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المدفوعات");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="charges-export-${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    logger.error(err, "Export error");
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;

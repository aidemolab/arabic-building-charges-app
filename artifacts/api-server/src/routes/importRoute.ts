import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, unitsTable, personsTable, chargesTable, buildingsTable, importLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const MONTH_COLS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ACTUAL_MONTHS = [1, 2, 3, 4, 5, 6];

function parseSheet(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true }) as any[];
  return raw;
}

function detectColumns(firstRow: any): Record<string, string> {
  const mapping: Record<string, string> = {};
  const keys = Object.keys(firstRow);
  for (const k of keys) {
    const lower = k.toLowerCase().replace(/\s+/g, "");
    if (lower.includes("floor") || lower.includes("طابق") || lower.includes("دور")) mapping.floor = k;
    else if (lower.includes("unit") || lower.includes("ref") || lower.includes("وحدة") || lower.includes("شقة")) mapping.unitRef = k;
    else if (lower.includes("name") || lower.includes("اسم") || lower.includes("مالك") || lower.includes("مستأجر")) mapping.nameAr = k;
    else if (lower.includes("role") || lower.includes("type") || lower.includes("نوع") || lower.includes("صفة")) mapping.role = k;
    else if (lower.includes("cat") || lower.includes("فئة")) mapping.category = k;
    else if (lower.includes("tier") || lower.includes("درجة")) mapping.tier = k;
    else if (lower === "jan" || lower === "1" || lower === "يناير") mapping.jan = k;
    else if (lower === "feb" || lower === "2" || lower === "فبراير") mapping.feb = k;
    else if (lower === "mar" || lower === "3" || lower === "مارس") mapping.mar = k;
    else if (lower === "apr" || lower === "4" || lower === "أبريل" || lower === "ابريل") mapping.apr = k;
    else if (lower === "may" || lower === "5" || lower === "مايو") mapping.may = k;
    else if (lower === "jun" || lower === "6" || lower === "يونيو") mapping.jun = k;
    else if (lower === "jul" || lower === "7" || lower === "يوليو") mapping.jul = k;
    else if (lower === "aug" || lower === "8" || lower === "أغسطس") mapping.aug = k;
    else if (lower === "sep" || lower === "9" || lower === "سبتمبر") mapping.sep = k;
    else if (lower === "oct" || lower === "10" || lower === "أكتوبر") mapping.oct = k;
    else if (lower === "nov" || lower === "11" || lower === "نوفمبر") mapping.nov = k;
    else if (lower === "dec" || lower === "12" || lower === "ديسمبر") mapping.dec = k;
  }
  return mapping;
}

function parseRole(val: string | null): string | null {
  if (!val) return null;
  const v = val.toString().trim().toLowerCase();
  if (v.includes("owner") || v.includes("مالك") || v.includes("ملاك")) return "owner";
  if (v.includes("tenant") || v.includes("مستأجر")) return "tenant";
  return null;
}

router.post("/import/preview", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const raw = parseSheet(file.buffer);
    if (raw.length === 0) { res.json({ rows: [], totalRows: 0, validRows: 0, errorRows: 0, warnings: [] }); return; }

    const colMap = detectColumns(raw[0]);
    const warnings: string[] = [];

    if (!colMap.unitRef) warnings.push("لم يتم العثور على عمود رقم الوحدة");
    if (!colMap.nameAr) warnings.push("لم يتم العثور على عمود الاسم");
    if (!colMap.role) warnings.push("لم يتم العثور على عمود الصفة (مالك/مستأجر)");

    const unitPersonPairs = new Set<string>();
    const rows = raw.map((row, idx) => {
      const errors: string[] = [];
      const rowWarnings: string[] = [];

      const unitRef = colMap.unitRef ? (row[colMap.unitRef]?.toString().trim() ?? "") : "";
      const nameAr = colMap.nameAr ? (row[colMap.nameAr]?.toString().trim() ?? "") : "";
      const roleRaw = colMap.role ? (row[colMap.role]?.toString().trim() ?? null) : null;
      const role = parseRole(roleRaw);
      const floor = colMap.floor ? (row[colMap.floor] !== null && row[colMap.floor] !== undefined ? parseInt(row[colMap.floor]) : null) : null;
      const category = colMap.category ? (row[colMap.category]?.toString().trim() || null) : null;
      const tier = colMap.tier ? (row[colMap.tier]?.toString().trim() || null) : null;

      if (!unitRef) errors.push("رقم الوحدة مطلوب");
      if (!nameAr) errors.push("الاسم مطلوب");
      if (!role) errors.push(`الصفة غير صحيحة: ${roleRaw || "فارغ"} (يجب: مالك أو مستأجر)`);

      const pairKey = `${unitRef}::${nameAr}::${role}`;
      if (unitRef && nameAr && role) {
        if (unitPersonPairs.has(pairKey)) {
          rowWarnings.push("تكرار: نفس الوحدة والشخص والصفة");
        } else {
          unitPersonPairs.add(pairKey);
        }
      }

      const months: Record<string, number | null> = {};
      for (const m of MONTH_COLS) {
        if (colMap[m]) {
          const val = row[colMap[m]];
          if (val === null || val === undefined || val === "") {
            months[m] = null;
          } else {
            const n = parseFloat(val);
            if (isNaN(n)) {
              rowWarnings.push(`قيمة شهر ${m} غير صحيحة: ${val}`);
              months[m] = null;
            } else {
              months[m] = n;
            }
          }
        } else {
          months[m] = null;
        }
      }

      return {
        rowIndex: idx + 1,
        floor: isNaN(floor as any) ? null : floor,
        unitRef,
        nameAr,
        role: role ?? "",
        category,
        tier,
        jan: months.jan, feb: months.feb, mar: months.mar, apr: months.apr,
        may: months.may, jun: months.jun, jul: months.jul, aug: months.aug,
        sep: months.sep, oct: months.oct, nov: months.nov, dec: months.dec,
        errors,
        warnings: rowWarnings,
      };
    });

    const validRows = rows.filter(r => r.errors.length === 0).length;
    const errorRows = rows.filter(r => r.errors.length > 0).length;

    res.json({ rows, totalRows: rows.length, validRows, errorRows, warnings });
  } catch (err) {
    logger.error(err, "Import preview error");
    res.status(500).json({ error: "Failed to parse file" });
  }
});

router.post("/import/commit", requireAuth, async (req, res) => {
  const { rows, buildingId, year, filename } = req.body;
  if (!rows || !buildingId || !year) { res.status(400).json({ error: "rows, buildingId, year required" }); return; }

  const userId = (req.session as any).userId;
  let unitsCreated = 0, personsCreated = 0, chargesCreated = 0;
  const errors: string[] = [];

  try {
    const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, buildingId)).limit(1);
    if (!building) { res.status(404).json({ error: "Building not found" }); return; }

    for (const row of rows) {
      if (row.errors && row.errors.length > 0) continue;
      try {
        let [unit] = await db.select().from(unitsTable).where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitRef, row.unitRef))).limit(1);
        if (!unit) {
          [unit] = await db.insert(unitsTable).values({ buildingId, unitRef: row.unitRef, floor: row.floor ?? null, category: row.category || null, tier: row.tier || null }).returning();
          unitsCreated++;
        }

        let [person] = await db.select().from(personsTable).where(and(eq(personsTable.unitId, unit.id), eq(personsTable.nameAr, row.nameAr), eq(personsTable.role, row.role))).limit(1);
        if (!person) {
          [person] = await db.insert(personsTable).values({ unitId: unit.id, nameAr: row.nameAr, role: row.role }).returning();
          personsCreated++;
        }

        const monthAmounts: [number, number | null][] = [
          [1, row.jan], [2, row.feb], [3, row.mar], [4, row.apr],
          [5, row.may], [6, row.jun], [7, row.jul], [8, row.aug],
          [9, row.sep], [10, row.oct], [11, row.nov], [12, row.dec],
        ];

        for (const [month, amount] of monthAmounts) {
          if (amount === null || amount === undefined) continue;
          const type = ACTUAL_MONTHS.includes(month) ? "actual" : "forecast";
          const existing = await db.select().from(chargesTable).where(and(eq(chargesTable.unitId, unit.id), eq(chargesTable.personId, person.id), eq(chargesTable.year, year), eq(chargesTable.month, month))).limit(1);
          if (existing.length === 0) {
            await db.insert(chargesTable).values({ unitId: unit.id, personId: person.id, year, month, amount: amount.toString(), type, status: type === "actual" ? "paid" : "pending" });
            chargesCreated++;
          }
        }
      } catch (rowErr: any) {
        logger.error(rowErr, `Import row ${row.rowIndex} error`);
        errors.push(`صف ${row.rowIndex}: ${rowErr.message}`);
      }
    }

    await db.insert(importLogTable).values({
      filename: filename ?? null,
      buildingId,
      year,
      unitsCreated,
      personsCreated,
      chargesCreated,
      errorCount: errors.length,
      userId: userId ?? null,
      notes: `استيراد ملف Excel — ${building.nameAr}`,
    });

    res.json({ unitsCreated, personsCreated, chargesCreated, errors });
  } catch (err) {
    logger.error(err, "Commit import error");
    res.status(500).json({ error: "Import failed" });
  }
});

export default router;

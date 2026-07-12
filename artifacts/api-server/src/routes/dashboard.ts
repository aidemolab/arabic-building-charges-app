import { Router } from "express";
import { db, chargesTable, unitsTable, buildingsTable, personsTable } from "@workspace/db";
import { eq, and, SQL, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : 2026;
    const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;

    const [buildingCount] = await db.select({ count: sql<number>`count(*)::int` }).from(buildingsTable).where(eq(buildingsTable.archived, false));
    const [unitCount] = await db.select({ count: sql<number>`count(*)::int` }).from(unitsTable).where(
      and(eq(unitsTable.archived, false), buildingId ? eq(unitsTable.buildingId, buildingId) : undefined) as SQL
    );
    const [personCount] = await db.select({ count: sql<number>`count(*)::int` }).from(personsTable).where(eq(personsTable.archived, false));

    // Expected/required amount: each non-archived unit owes its monthly grade (الدرجة / tier)
    // for every actual-charge month. Units without a grade contribute 0. This is the FULL
    // amount that should have been collected if every unit paid its required monthly fee,
    // independent of whether a charge row exists — so never-charged units lower the rate.
    const actualMonthsCount = 6;
    const [expectedAgg] = await db
      .select({
        gradeSum: sql<string>`coalesce(sum(nullif(${unitsTable.tier}, '')::numeric), 0)`,
      })
      .from(unitsTable)
      .where(
        and(
          eq(unitsTable.archived, false),
          buildingId ? eq(unitsTable.buildingId, buildingId) : undefined,
        ) as SQL,
      );
    const totalActualDue = parseFloat(expectedAgg?.gradeSum || "0") * actualMonthsCount;

    const conditions: (SQL | undefined)[] = [
      eq(chargesTable.archived, false),
      eq(chargesTable.year, year),
      buildingId ? eq(buildingsTable.id, buildingId) : undefined,
    ];

    const chargeAgg = await db
      .select({
        type: chargesTable.type,
        status: chargesTable.status,
        total: sql<string>`sum(${chargesTable.amount}::numeric)`,
        count: sql<number>`count(*)::int`,
      })
      .from(chargesTable)
      .leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id))
      .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
      .where(and(...conditions) as SQL)
      .groupBy(chargesTable.type, chargesTable.status);

    let totalActualPaid = 0, totalForecast = 0, totalCancelled = 0;
    for (const row of chargeAgg) {
      const amt = parseFloat(row.total || "0");
      if (row.type === "actual" && row.status === "paid") totalActualPaid += amt;
      if (row.type === "forecast") totalForecast += amt;
      if (row.status === "cancelled") totalCancelled += amt;
    }

    const collectionRate = totalActualDue > 0 ? Math.round((totalActualPaid / totalActualDue) * 100) : 0;

    res.json({
      totalBuildings: buildingCount.count,
      totalUnits: unitCount.count,
      totalPersons: personCount.count,
      totalActualPaid,
      totalActualDue,
      totalForecast,
      totalCancelled,
      collectionRate,
      actualMonthsCount,
      forecastMonthsCount: 6,
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/dashboard/monthly", requireAuth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : 2026;
    const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;

    const conditions: (SQL | undefined)[] = [
      eq(chargesTable.archived, false),
      eq(chargesTable.year, year),
      buildingId ? eq(buildingsTable.id, buildingId) : undefined,
    ];

    const rows = await db
      .select({
        month: chargesTable.month,
        type: chargesTable.type,
        status: chargesTable.status,
        total: sql<string>`sum(${chargesTable.amount}::numeric)`,
        count: sql<number>`count(*)::int`,
      })
      .from(chargesTable)
      .leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id))
      .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
      .where(and(...conditions) as SQL)
      .groupBy(chargesTable.month, chargesTable.type, chargesTable.status)
      .orderBy(chargesTable.month);

    const monthMap: Record<string, any> = {};
    for (let m = 1; m <= 12; m++) {
      const type = m <= 6 ? "actual" : "forecast";
      const key = `${m}-${type}`;
      monthMap[key] = { month: m, type, totalAmount: 0, paidCount: 0, pendingCount: 0, cancelledCount: 0 };
    }

    for (const row of rows) {
      const key = `${row.month}-${row.type}`;
      if (!monthMap[key]) monthMap[key] = { month: row.month, type: row.type, totalAmount: 0, paidCount: 0, pendingCount: 0, cancelledCount: 0 };
      monthMap[key].totalAmount += parseFloat(row.total || "0");
      if (row.status === "paid") monthMap[key].paidCount += row.count;
      else if (row.status === "pending") monthMap[key].pendingCount += row.count;
      else if (row.status === "cancelled") monthMap[key].cancelledCount += row.count;
    }

    res.json(Object.values(monthMap).sort((a: any, b: any) => a.month - b.month));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/dashboard/by-building", requireAuth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : 2026;

    const buildings = await db.select().from(buildingsTable).where(eq(buildingsTable.archived, false));

    const actualMonthsCount = 6;
    const results = await Promise.all(buildings.map(async (b) => {
      const [unitAgg] = await db
        .select({
          count: sql<number>`count(*)::int`,
          gradeSum: sql<string>`coalesce(sum(nullif(${unitsTable.tier}, '')::numeric), 0)`,
        })
        .from(unitsTable)
        .where(and(eq(unitsTable.buildingId, b.id), eq(unitsTable.archived, false)));
      const [personCount] = await db.select({ count: sql<number>`count(distinct ${personsTable.id})::int` }).from(personsTable).leftJoin(unitsTable, eq(personsTable.unitId, unitsTable.id)).where(and(eq(unitsTable.buildingId, b.id), eq(personsTable.archived, false)));

      const chargeAgg = await db
        .select({ type: chargesTable.type, status: chargesTable.status, total: sql<string>`sum(${chargesTable.amount}::numeric)` })
        .from(chargesTable)
        .leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id))
        .where(and(eq(unitsTable.buildingId, b.id), eq(chargesTable.year, year), eq(chargesTable.archived, false)))
        .groupBy(chargesTable.type, chargesTable.status);

      let totalActualPaid = 0, totalForecast = 0;
      for (const row of chargeAgg) {
        const amt = parseFloat(row.total || "0");
        if (row.type === "actual" && row.status === "paid") totalActualPaid += amt;
        if (row.type === "forecast") totalForecast += amt;
      }

      // Same grade-based expected as the summary gauge: units × grade × actual months.
      const totalActualDue = parseFloat(unitAgg?.gradeSum || "0") * actualMonthsCount;

      return {
        buildingId: b.id,
        buildingNameAr: b.nameAr,
        totalUnits: unitAgg.count,
        totalPersons: personCount.count,
        totalActual: totalActualPaid,
        totalForecast,
        collectionRate: totalActualDue > 0 ? Math.round((totalActualPaid / totalActualDue) * 100) : 0,
      };
    }));

    res.json(results);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/dashboard/payment-status", requireAuth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : 2026;
    const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;

    const conditions: (SQL | undefined)[] = [
      eq(chargesTable.archived, false),
      eq(chargesTable.year, year),
      eq(chargesTable.type, "actual"),
      buildingId ? eq(buildingsTable.id, buildingId) : undefined,
    ];

    const rows = await db
      .select({
        status: chargesTable.status,
        count: sql<number>`count(*)::int`,
        total: sql<string>`sum(${chargesTable.amount}::numeric)`,
      })
      .from(chargesTable)
      .leftJoin(unitsTable, eq(chargesTable.unitId, unitsTable.id))
      .leftJoin(buildingsTable, eq(unitsTable.buildingId, buildingsTable.id))
      .where(and(...conditions) as SQL)
      .groupBy(chargesTable.status);

    let paid = 0, pending = 0, cancelled = 0, paidAmount = 0, totalAmount = 0;
    for (const row of rows) {
      const amt = parseFloat(row.total || "0");
      totalAmount += amt;
      if (row.status === "paid") { paid = row.count; paidAmount = amt; }
      else if (row.status === "pending") pending = row.count;
      else if (row.status === "cancelled") cancelled = row.count;
    }

    res.json({ paid, pending, cancelled, totalAmount, paidAmount });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

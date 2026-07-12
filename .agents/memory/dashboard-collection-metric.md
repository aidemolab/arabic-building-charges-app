---
name: Dashboard collection-rate metric
description: How the dashboard defines "expected/due" vs "collected" for نسبة التحصيل, and why.
---

# Dashboard نسبة التحصيل (collection rate) definition

**Rule:** The gauge target (`totalActualDue`, labelled **إجمالي المبلغ المستحق**) and every
`collectionRate` on the dashboard = each non-archived unit's **grade × the number of actual
months** (currently 6, Jan–Jun), NOT the sum of existing charge rows.

- Expected = `Σ over non-archived units in filter ( NULLIF(units.tier,'')::numeric ) × actualMonthsCount`.
- Collected (**إجمالي المبلغ المحصل**) = `Σ actual charges with status='paid'`.
- `collectionRate = round(collected / expected × 100)`.
- Applied identically in `/dashboard/summary` AND `/dashboard/by-building` so the gauge and the
  per-building table never contradict each other.

**Key data facts (why grade, not charges):**
- The per-unit monthly required fee lives in `units.tier` (the **الدرجة** column: 100/70/50/200; 21 units null). There is **no** dedicated fee column.
- `units.tier` is NOT equal to the charge amount — a grade-100 unit may have paid 150/75/70/50; 188 units even vary their paid amount month to month. So charge amounts cannot define "required".
- Many units have missing months and ~67 units (incl. all shops المحلات) have **no** actual charge at all. Summing existing charges therefore shows a misleading 100%.

**Why:** The user explicitly wanted "the total that should have been collected if every flat/unit
paid the full required amount for all relevant units" — i.e. never-charged/under-charged units must
drag the rate down. Grade × months is the only per-unit "required" figure the schema actually holds.
A grade-less unit contributes 0 (no defined fee); a building can exceed 100% when residents pay above
their grade (that is truthful, left as-is).

**How to apply:** If a real per-unit monthly-fee field is ever added, switch the expected calc to it
and bump nothing else. `actualMonthsCount` is a single const in `routes/dashboard.ts` (summary +
by-building) — keep both in lockstep. Do not revert to paid+pending as the denominator.

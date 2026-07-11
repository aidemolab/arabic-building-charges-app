---
name: Safwa Towers workbook layout
description: Parsing rules for the client's "Building Charges 2026" Excel workbook (اتحاد الشاغلين أبراج الصفوة)
---

The client workbook is ONE sheet containing FIVE data sections plus summaries — it is not a single-building file:

- عمارة (1), عمارة (2), عمارة (3), عمارة (4), المحلات (shops) — section headers use tatweel-stretched text (e.g. "عمــ...ارة (2)"), so substring matching on "عمارة"/"محلات" fails; match on prefix or strip tatweel (ـ).
- Header row per section: الدور، النموذج، الأسم، الصفة، الفئة، الشريحة then numeric month columns 1–12. Header repeats in every section — skip rows where الصفة column literally equals "الصفة".
- Each section ends with an الإجمالى totals row (must skip). After المحلات come "تحصيل شهر ..." collection sections and a budget block — not unit data, skip everything from there on.
- الدور and النموذج (unit ref) carry forward when blank; reset the carry at section boundaries. Floor "الأرضى" → 0.
- Role variants: مالك → owner; مستأجر AND مستاجر → tenant; "باع" (sold) appears once → treated as owner. Missing role: first person row of a unit = owner, later rows = tenant.
- Some rows have a role + payments but no name — imported with nameAr "غير محدد" so payments are not lost.
- Blank month cells = no record at all (never zero). Months 1–6 → actual/paid; 7–12 → forecast/pending.

**Why:** the first import attempt assumed one building; the sheet's الإجمالى rows and collection sections would silently corrupt totals if not excluded.
**How to apply:** any re-import of an updated workbook version must reuse these rules; verify by comparing per-building month-1 sums against the sheet's own الإجمالى row (B1=6760, B2=4890, B3=4170, B4=3300 in the 2026 file).

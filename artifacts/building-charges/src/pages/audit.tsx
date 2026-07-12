import { useState, type ReactNode } from "react";
import { useListAudit } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  cancel: "إلغاء",
  archive: "أرشفة",
  delete: "حذف",
  import_create: "استيراد",
  login: "تسجيل دخول",
  password_change: "تغيير كلمة المرور",
};

const ENTITY_LABELS: Record<string, string> = {
  charge: "رسم",
  building: "مبنى",
  unit: "وحدة",
  person: "شخص",
  user: "مستخدم",
};

const ROLE_USER: Record<string, string> = { admin: "مدير", accountant: "محاسب", viewer: "مراقب" };
const ROLE_PERSON: Record<string, string> = { owner: "مالك", tenant: "مستأجر" };
const STATUS_AR: Record<string, string> = { paid: "مدفوع", cancelled: "ملغى", pending: "معلق" };
const TYPE_AR: Record<string, string> = { actual: "فعلي", forecast: "توقعي" };
const MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function actionColor(action: string) {
  if (action === "create" || action === "import_create") return "bg-green-100 text-green-700";
  if (action === "update" || action === "password_change") return "bg-blue-100 text-blue-700";
  if (action === "archive") return "bg-orange-100 text-orange-700";
  if (action === "cancel" || action === "delete") return "bg-red-100 text-red-600";
  if (action === "login") return "bg-purple-100 text-purple-700";
  return "bg-muted text-muted-foreground";
}

function formatDate(dt: string | undefined) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("ar-EG", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmt(n: number | string | null | undefined) {
  if (n == null) return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  return isNaN(v) ? String(n) : v.toLocaleString("ar-EG") + " ج.م";
}

function parseData(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try { return JSON.parse(raw as string); } catch { return null; }
}

type AuditEntry = {
  id?: number;
  entityType?: string | null;
  entityId?: number | null;
  action?: string | null;
  oldData?: string | null;
  newData?: string | null;
  username?: string | null;
  actorRole?: string | null;
  notes?: string | null;
  createdAt?: string;
};

function Dash() {
  return <span className="text-xs text-muted-foreground">—</span>;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function ChangeLine({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <span className="inline-flex gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="line-through text-muted-foreground">{from}</span>
      <span>←</span>
      <span className="font-medium text-blue-700">{to}</span>
    </span>
  );
}

// ── Dedicated column helpers for user-entity rows ─────────────────────────────

function AffectedUserCell({ e }: { e: AuditEntry }): ReactNode {
  if (e.entityType !== "user") return <Dash />;
  const src = parseData(e.newData) ?? parseData(e.oldData);
  const email = String(src?.email ?? "");
  if (!email) return <Dash />;
  return <span className="text-xs font-medium">{email}</span>;
}

function RoleChangeCell({ e }: { e: AuditEntry }): ReactNode {
  if (e.entityType !== "user") return <Dash />;
  const action = e.action ?? "";
  const old = parseData(e.oldData);
  const nd = parseData(e.newData);

  if (action === "create" && nd?.role) {
    return (
      <span className="text-xs font-medium text-green-700">
        {ROLE_USER[String(nd.role)] ?? String(nd.role)}
      </span>
    );
  }

  if (action === "delete" && old?.role) {
    return (
      <span className="text-xs line-through text-muted-foreground">
        {ROLE_USER[String(old.role)] ?? String(old.role)}
      </span>
    );
  }

  if (action === "update" && old && nd && old.role !== nd.role) {
    const from = ROLE_USER[String(old.role)] ?? String(old.role ?? "—");
    const to   = ROLE_USER[String(nd.role)]  ?? String(nd.role  ?? "—");
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="line-through text-muted-foreground">{from}</span>
        <span className="text-muted-foreground">←</span>
        <span className="font-medium text-blue-700">{to}</span>
      </span>
    );
  }

  return <Dash />;
}

function StatusChangeCell({ e }: { e: AuditEntry }): ReactNode {
  if (e.entityType !== "user") return <Dash />;
  const action = e.action ?? "";
  const old = parseData(e.oldData);
  const nd  = parseData(e.newData);

  if (action === "update" && old && nd && old.disabled !== nd.disabled) {
    const from = old.disabled ? "موقوف" : "نشط";
    const to   = nd.disabled  ? "موقوف ⛔" : "نشط ✓";
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="line-through text-muted-foreground">{from}</span>
        <span className="text-muted-foreground">←</span>
        <span className={cn("font-medium", nd.disabled ? "text-red-600" : "text-green-700")}>{to}</span>
      </span>
    );
  }

  return <Dash />;
}

// ── Details column — non-user entities only ───────────────────────────────────

function formatDetails(e: AuditEntry): ReactNode {
  const old = parseData(e.oldData);
  const nd  = parseData(e.newData);
  const action = e.action ?? "";
  const entityType = e.entityType ?? "";

  if (entityType === "user") {
    if (action === "password_change") {
      return <span className="text-xs text-muted-foreground">كلمة مرور جديدة</span>;
    }
    return <Dash />;
  }

  // ── BUILDING ───────────────────────────────────────────────────────────────
  if (entityType === "building") {
    if (action === "update" && old && nd) {
      const lines: ReactNode[] = [];
      if (old.nameAr !== nd.nameAr)
        lines.push(<ChangeLine key="name" label="الاسم" from={String(old.nameAr ?? "—")} to={String(nd.nameAr ?? "—")} />);
      if (old.code !== nd.code)
        lines.push(<ChangeLine key="code" label="الكود" from={String(old.code ?? "—")} to={String(nd.code ?? "—")} />);
      if (old.addressAr !== nd.addressAr)
        lines.push(<ChangeLine key="addr" label="العنوان" from={String(old.addressAr ?? "—")} to={String(nd.addressAr ?? "—")} />);
      if (lines.length === 0)
        lines.push(<DetailLine key="name" label="المبنى" value={String(nd.nameAr ?? "—")} />);
      return <div className="flex flex-col gap-0.5">{lines}</div>;
    }
    const src = nd ?? old;
    return (
      <div className="flex flex-col gap-0.5">
        <DetailLine label="المبنى" value={String(src?.nameAr ?? "—")} />
        {Boolean(src?.code) && <DetailLine label="الكود" value={String(src!.code)} />}
      </div>
    );
  }

  // ── UNIT ───────────────────────────────────────────────────────────────────
  if (entityType === "unit") {
    if (action === "update" && old && nd) {
      const lines: ReactNode[] = [];
      if (old.unitRef !== nd.unitRef)
        lines.push(<ChangeLine key="ref" label="الوحدة" from={String(old.unitRef ?? "—")} to={String(nd.unitRef ?? "—")} />);
      if (old.floor !== nd.floor)
        lines.push(<ChangeLine key="floor" label="الدور" from={String(old.floor ?? "—")} to={String(nd.floor ?? "—")} />);
      if (old.category !== nd.category)
        lines.push(<ChangeLine key="cat" label="الفئة" from={String(old.category ?? "—")} to={String(nd.category ?? "—")} />);
      if (old.tier !== nd.tier)
        lines.push(<ChangeLine key="tier" label="الدرجة" from={String(old.tier ?? "—")} to={String(nd.tier ?? "—")} />);
      if (lines.length === 0)
        lines.push(<DetailLine key="ref" label="الوحدة" value={String(nd.unitRef ?? "—")} />);
      return <div className="flex flex-col gap-0.5">{lines}</div>;
    }
    const src = nd ?? old;
    return (
      <div className="flex flex-col gap-0.5">
        <DetailLine label="الوحدة" value={String(src?.unitRef ?? "—")} />
        {src?.floor != null && <DetailLine label="الدور" value={String(src.floor)} />}
        {Boolean(src?.category) && <DetailLine label="الفئة" value={String(src!.category)} />}
      </div>
    );
  }

  // ── PERSON ─────────────────────────────────────────────────────────────────
  if (entityType === "person") {
    if (action === "update" && old && nd) {
      const lines: ReactNode[] = [];
      if (old.nameAr !== nd.nameAr)
        lines.push(<ChangeLine key="name" label="الاسم" from={String(old.nameAr ?? "—")} to={String(nd.nameAr ?? "—")} />);
      if (old.role !== nd.role)
        lines.push(<ChangeLine key="role" label="الصفة"
          from={ROLE_PERSON[String(old.role)] ?? String(old.role ?? "—")}
          to={ROLE_PERSON[String(nd.role)] ?? String(nd.role ?? "—")} />);
      if (old.phone !== nd.phone)
        lines.push(<ChangeLine key="phone" label="الجوال" from={String(old.phone ?? "—")} to={String(nd.phone ?? "—")} />);
      if (lines.length === 0)
        lines.push(<DetailLine key="name" label="الاسم" value={String(nd.nameAr ?? "—")} />);
      return <div className="flex flex-col gap-0.5">{lines}</div>;
    }
    const src = nd ?? old;
    return (
      <div className="flex flex-col gap-0.5">
        <DetailLine label="الاسم" value={String(src?.nameAr ?? "—")} />
        {Boolean(src?.role) && <DetailLine label="الصفة" value={ROLE_PERSON[String(src!.role)] ?? String(src!.role)} />}
      </div>
    );
  }

  // ── CHARGE ─────────────────────────────────────────────────────────────────
  if (entityType === "charge") {
    if (action === "cancel") {
      const reason = String((nd?.cancelReason) ?? e.notes ?? "—");
      return (
        <div className="flex flex-col gap-0.5">
          <DetailLine label="سبب الإلغاء" value={reason} />
        </div>
      );
    }
    if (action === "update" && old && nd) {
      const lines: ReactNode[] = [];
      if (String(old.amount ?? "") !== String(nd.amount ?? ""))
        lines.push(<ChangeLine key="amt" label="المبلغ" from={fmt(old.amount as string)} to={fmt(nd.amount as string)} />);
      if (old.status !== nd.status)
        lines.push(<ChangeLine key="status" label="الحالة"
          from={STATUS_AR[String(old.status)] ?? String(old.status ?? "—")}
          to={STATUS_AR[String(nd.status)] ?? String(nd.status ?? "—")} />);
      if (old.type !== nd.type)
        lines.push(<ChangeLine key="type" label="النوع"
          from={TYPE_AR[String(old.type)] ?? String(old.type ?? "—")}
          to={TYPE_AR[String(nd.type)] ?? String(nd.type ?? "—")} />);
      if (lines.length === 0) {
        const src = nd;
        const m = src?.month as number;
        lines.push(<DetailLine key="date" label="الشهر" value={`${MONTH_AR[(m - 1)] ?? m} ${src?.year ?? ""}`} />);
      }
      return <div className="flex flex-col gap-0.5">{lines}</div>;
    }
    const src = nd ?? old;
    if (!src) return <span className="text-xs text-muted-foreground">{e.notes ?? "—"}</span>;
    const m = src.month as number;
    return (
      <div className="flex flex-col gap-0.5">
        {m != null && <DetailLine label="الشهر" value={`${MONTH_AR[(m - 1)] ?? m} ${src.year ?? ""}`} />}
        <DetailLine label="المبلغ" value={fmt(src.amount as string)} />
        {Boolean(src.type)   && <DetailLine label="النوع"  value={TYPE_AR[String(src.type)]   ?? String(src.type)} />}
        {Boolean(src.status) && <DetailLine label="الحالة" value={STATUS_AR[String(src.status)] ?? String(src.status)} />}
      </div>
    );
  }

  // ── FALLBACK ───────────────────────────────────────────────────────────────
  if (e.notes) return <span className="text-xs text-muted-foreground">{e.notes}</span>;
  const src = nd ?? old;
  if (src?.nameAr) return <span className="text-xs">{String(src.nameAr)}</span>;
  return <Dash />;
}

export default function AuditPage() {
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [limitStr, setLimitStr] = useState("50");

  const { data: entries, isLoading } = useListAudit({
    ...(filterEntity !== "all" ? { entityType: filterEntity } : {}),
    ...(filterAction !== "all" ? { action: filterAction } : {}),
    limit: parseInt(limitStr) || 50,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6" /> سجل التدقيق
        </h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filterEntity} onValueChange={setFilterEntity}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="النوع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="الإجراء" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الإجراءات</SelectItem>
            <SelectItem value="create">إنشاء</SelectItem>
            <SelectItem value="update">تعديل</SelectItem>
            <SelectItem value="cancel">إلغاء</SelectItem>
            <SelectItem value="archive">أرشفة</SelectItem>
            <SelectItem value="delete">حذف</SelectItem>
            <SelectItem value="password_change">تغيير كلمة المرور</SelectItem>
          </SelectContent>
        </Select>
        <Select value={limitStr} onValueChange={setLimitStr}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25 سجل</SelectItem>
            <SelectItem value="50">50 سجل</SelectItem>
            <SelectItem value="100">100 سجل</SelectItem>
            <SelectItem value="200">200 سجل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {entries && entries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">التاريخ والوقت</th>
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">المنفذ</th>
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">دور المنفذ</th>
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">المستخدم المتأثر</th>
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">تغيير الدور</th>
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">تغيير الحالة</th>
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">الإجراء</th>
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">النوع</th>
                      <th className="text-right py-3 px-3 font-medium whitespace-nowrap">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">

                        {/* التاريخ والوقت */}
                        <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDate(e.createdAt)}
                        </td>

                        {/* المنفذ — actor email; "النظام" when no actor */}
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-xs">{e.username ?? "النظام"}</span>
                        </td>

                        {/* دور المنفذ — actor role pill; blank for system rows */}
                        <td className="py-2.5 px-3">
                          {e.actorRole ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium whitespace-nowrap">
                              {ROLE_USER[e.actorRole] ?? e.actorRole}
                            </span>
                          ) : (
                            e.username ? <Dash /> : null
                          )}
                        </td>

                        {/* المستخدم المتأثر — affected user; dedicated column, user-entity only */}
                        <td className="py-2.5 px-3">
                          <AffectedUserCell e={e} />
                        </td>

                        {/* تغيير الدور */}
                        <td className="py-2.5 px-3">
                          <RoleChangeCell e={e} />
                        </td>

                        {/* تغيير الحالة */}
                        <td className="py-2.5 px-3">
                          <StatusChangeCell e={e} />
                        </td>

                        {/* الإجراء */}
                        <td className="py-2.5 px-3">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", actionColor(e.action ?? ""))}>
                            {ACTION_LABELS[e.action ?? ""] ?? e.action}
                          </span>
                        </td>

                        {/* النوع */}
                        <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">
                          {ENTITY_LABELS[e.entityType ?? ""] ?? e.entityType}
                        </td>

                        {/* التفاصيل — non-user entity context */}
                        <td className="py-2.5 px-3">
                          {formatDetails(e)}
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <ClipboardList className="h-10 w-10 opacity-25" />
                <p className="text-sm font-medium">لا توجد إجراءات مسجّلة بعد</p>
                <p className="text-xs text-center max-w-xs">
                  ستظهر هنا أي تعديلات أو إلغاءات أو أرشفة تتم يدويًا من خلال التطبيق
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState } from "react";
import {
  useListCharges, useCreateCharge, useUpdateCharge, useCancelCharge,
  useListBuildings, useListPersons, useListUnits,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Charge, ChargeInput } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CreditCard, Plus, XCircle, Loader2, Download, Filter } from "lucide-react";
import { ARABIC_MONTHS, STATUS_LABELS, TYPE_LABELS, ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";

type ChargeType = "actual" | "forecast";
type ChargeStatus = "pending" | "paid" | "cancelled";

function statusColor(status: string) {
  if (status === "paid") return "bg-green-100 text-green-700 border-green-200";
  if (status === "pending") return "bg-amber-100 text-amber-700 border-amber-200";
  if (status === "cancelled") return "bg-red-100 text-red-600 border-red-200";
  return "";
}

function formatCurrency(v: number | string | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ج.م";
}

function ChargeForm({
  onSubmit,
  isPending,
  onCancel,
}: {
  onSubmit: (data: ChargeInput) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const { data: buildings } = useListBuildings();
  const [buildingId, setBuildingId] = useState("");
  const { data: units } = useListUnits(buildingId ? { buildingId: parseInt(buildingId) } : undefined);
  const [unitId, setUnitId] = useState("");
  const { data: persons } = useListPersons(unitId ? { unitId: parseInt(unitId) } : undefined);
  const [personId, setPersonId] = useState("");
  const [month, setMonth] = useState("1");
  const [year, setYear] = useState("2026");
  const [amount, setAmount] = useState("");
  const [chargeType, setChargeType] = useState<ChargeType>("actual");
  const [status, setStatus] = useState<ChargeStatus>("pending");
  const [notes, setNotes] = useState("");

  const handleMonthChange = (v: string) => {
    setMonth(v);
    setChargeType(parseInt(v) <= 6 ? "actual" : "forecast");
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>المبنى</Label>
        <Select value={buildingId} onValueChange={(v) => { setBuildingId(v); setUnitId(""); setPersonId(""); }}>
          <SelectTrigger><SelectValue placeholder="اختر المبنى" /></SelectTrigger>
          <SelectContent>
            {buildings?.filter((b) => !b.archived).map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>الوحدة</Label>
          <Select value={unitId} onValueChange={(v) => { setUnitId(v); setPersonId(""); }} disabled={!buildingId}>
            <SelectTrigger><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
            <SelectContent>
              {units?.filter((u) => !u.archived).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.unitRef}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>الشخص</Label>
          <Select value={personId} onValueChange={setPersonId} disabled={!unitId}>
            <SelectTrigger><SelectValue placeholder="اختر الشخص" /></SelectTrigger>
            <SelectContent>
              {persons?.filter((p) => !p.archived).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>الشهر</Label>
          <Select value={month} onValueChange={handleMonthChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ARABIC_MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {m} {i < 6 ? "(فعلي)" : "(توقعي)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>السنة</Label>
          <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label>النوع</Label>
          <Input value={chargeType === "actual" ? "فعلي" : "توقعي"} readOnly className="bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>المبلغ (ج.م)</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label>الحالة</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ChargeStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">معلق</SelectItem>
              <SelectItem value="paid">مدفوع</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>ملاحظات</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="ملاحظات اختيارية..." />
      </div>
      <DialogFooter className="mt-4 gap-2">
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button
          onClick={() => onSubmit({
            unitId: parseInt(unitId),
            personId: parseInt(personId),
            month: parseInt(month),
            year: parseInt(year),
            amount: parseFloat(amount),
            type: chargeType,
            status: status as ChargeInput["status"],
            notes: notes || undefined,
          })}
          disabled={isPending || !unitId || !personId || !amount}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          حفظ
        </Button>
      </DialogFooter>
    </div>
  );
}

function CancelDialog({
  charge,
  onClose,
}: {
  charge: Charge;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const cancelMutation = useCancelCharge();
  const [reason, setReason] = useState("");

  const handleCancel = () => {
    cancelMutation.mutate(
      { id: charge.id, data: { reason } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">إلغاء الرسم</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            هل تريد إلغاء هذا الرسم؟ أدخل سبب الإلغاء.
          </p>
          <div className="space-y-1.5">
            <Label>سبب الإلغاء</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="أدخل سبب الإلغاء..."
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>تراجع</Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelMutation.isPending || !reason.trim()}
          >
            {cancelMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            تأكيد الإلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ChargesPage() {
  const queryClient = useQueryClient();
  const { canManageCharges } = usePermissions();
  const [filterBuilding, setFilterBuilding] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("2026");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRole, setFilterRole] = useState("all");

  const { data: buildings } = useListBuildings();
  const { data: charges, isLoading } = useListCharges({
    ...(filterBuilding !== "all" ? { buildingId: parseInt(filterBuilding) } : {}),
    ...(filterMonth !== "all" ? { month: parseInt(filterMonth) } : {}),
    year: parseInt(filterYear),
    ...(filterType !== "all" ? { type: filterType as ChargeType } : {}),
    ...(filterStatus !== "all" ? { status: filterStatus as ChargeStatus } : {}),
    ...(filterRole !== "all" ? { role: filterRole as "owner" | "tenant" } : {}),
  });

  const createMutation = useCreateCharge();
  const updateMutation = useUpdateCharge();

  const [showCreate, setShowCreate] = useState(false);
  const [cancelling, setCancelling] = useState<Charge | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/charges"] });

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterBuilding !== "all") params.set("buildingId", filterBuilding);
    if (filterMonth !== "all") params.set("month", filterMonth);
    if (filterYear) params.set("year", filterYear);
    if (filterType !== "all") params.set("type", filterType);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterRole !== "all") params.set("role", filterRole);
    window.open(`/api/export/charges?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6" /> الرسوم والمدفوعات
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 ml-2" /> تصدير Excel
          </Button>
          {canManageCharges && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 ml-2" /> إضافة رسم
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={filterBuilding} onValueChange={setFilterBuilding}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="المبنى" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المباني</SelectItem>
                {buildings?.filter((b) => !b.archived).map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="الشهر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الشهور</SelectItem>
                {ARABIC_MONTHS.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2027">2027</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="النوع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="actual">فعلي</SelectItem>
                <SelectItem value="forecast">توقعي</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="paid">مدفوع</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
                <SelectItem value="cancelled">ملغى</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="الدور" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="owner">مالك</SelectItem>
                <SelectItem value="tenant">مستأجر</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
          يناير–يونيو (فعلي)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-300 inline-block" />
          يوليو–ديسمبر (توقعي)
        </span>
        {charges && <span className="mr-auto">{charges.length} سجل</span>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-right py-3 px-3 font-medium">الشهر / السنة</th>
                    <th className="text-right py-3 px-3 font-medium">الشخص</th>
                    <th className="text-right py-3 px-3 font-medium">الوحدة</th>
                    <th className="text-right py-3 px-3 font-medium">الدور</th>
                    <th className="text-right py-3 px-3 font-medium">النوع</th>
                    <th className="text-left py-3 px-3 font-medium">المبلغ</th>
                    <th className="text-right py-3 px-3 font-medium">الحالة</th>
                    <th className="py-3 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {charges?.map((c) => {
                    const isForecast = c.type === "forecast";
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          "border-b last:border-0 hover:bg-muted/20 transition-colors",
                          isForecast ? "bg-slate-50/50" : "bg-blue-50/20"
                        )}
                      >
                        <td className="py-2 px-3">
                          <span className="font-medium">{ARABIC_MONTHS[(c.month ?? 1) - 1]}</span>
                          <span className="text-muted-foreground mr-1">{c.year}</span>
                        </td>
                        <td className="py-2 px-3">{c.personNameAr ?? "—"}</td>
                        <td className="py-2 px-3">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{c.unitRef ?? "—"}</span>
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-xs">
                            {ROLE_LABELS[c.personRole as keyof typeof ROLE_LABELS] ?? c.personRole ?? "—"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            isForecast ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700"
                          )}>
                            {TYPE_LABELS[c.type as keyof typeof TYPE_LABELS] ?? c.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-left font-medium tabular-nums">
                          {formatCurrency(c.amount)}
                        </td>
                        <td className="py-2 px-3">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full border font-medium",
                            statusColor(c.status ?? "")
                          )}>
                            {STATUS_LABELS[c.status as keyof typeof STATUS_LABELS] ?? c.status}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {canManageCharges && c.status !== "cancelled" && (
                            <div className="flex gap-1 justify-end">
                              {c.status === "pending" && (
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-xs h-7"
                                  onClick={() => {
                                    updateMutation.mutate(
                                      { id: c.id, data: { status: "paid" } },
                                      { onSuccess: invalidate }
                                    );
                                  }}
                                >
                                  تسجيل دفع
                                </Button>
                              )}
                              <Button
                                size="sm" variant="ghost"
                                className="text-muted-foreground hover:text-destructive h-7"
                                onClick={() => setCancelling(c)}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                          {c.status === "cancelled" && c.cancelReason && (
                            <span className="text-xs text-muted-foreground line-clamp-1 max-w-[120px]" title={c.cancelReason}>
                              {c.cancelReason}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {charges?.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground">
                        لا توجد بيانات تطابق الفلاتر المحددة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>إضافة رسم جديد</DialogTitle></DialogHeader>
          <ChargeForm
            onSubmit={(data) => createMutation.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } })}
            isPending={createMutation.isPending}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      {cancelling && (
        <CancelDialog charge={cancelling} onClose={() => setCancelling(null)} />
      )}
    </div>
  );
}

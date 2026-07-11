import { useState } from "react";
import { useListAudit } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  cancel: "إلغاء",
  archive: "أرشفة",
};

const ENTITY_LABELS: Record<string, string> = {
  charge: "رسم",
  building: "مبنى",
  unit: "وحدة",
  person: "شخص",
};

function actionColor(action: string) {
  if (action === "create") return "bg-green-100 text-green-700";
  if (action === "update") return "bg-blue-100 text-blue-700";
  if (action === "archive") return "bg-orange-100 text-orange-700";
  if (action === "cancel") return "bg-red-100 text-red-600";
  return "bg-muted text-muted-foreground";
}

function formatDate(dt: string | undefined) {
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleString("ar-SA", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
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
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="الإجراء" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الإجراءات</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
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
                      <th className="text-right py-3 px-4 font-medium">التاريخ والوقت</th>
                      <th className="text-right py-3 px-4 font-medium">المستخدم</th>
                      <th className="text-right py-3 px-4 font-medium">الإجراء</th>
                      <th className="text-right py-3 px-4 font-medium">النوع</th>
                      <th className="text-right py-3 px-4 font-medium">المعرّف</th>
                      <th className="text-right py-3 px-4 font-medium">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 text-muted-foreground text-xs">{formatDate(e.createdAt)}</td>
                        <td className="py-2.5 px-4">
                          <span className="font-medium">{e.username ?? "النظام"}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", actionColor(e.action ?? ""))}>
                            {ACTION_LABELS[e.action ?? ""] ?? e.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground">
                          {ENTITY_LABELS[e.entityType ?? ""] ?? e.entityType}
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground tabular-nums">{e.entityId ?? "—"}</td>
                        <td className="py-2.5 px-4">
                          {e.newData ? (
                            <span className="text-xs text-muted-foreground max-w-[200px] truncate block" title={String(e.newData)}>
                              {String(e.newData).slice(0, 80)}
                            </span>
                          ) : e.notes ? (
                            <span className="text-xs text-muted-foreground">{e.notes}</span>
                          ) : "—"}
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

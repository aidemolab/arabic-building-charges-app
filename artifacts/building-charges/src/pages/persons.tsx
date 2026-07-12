import { useState } from "react";
import {
  useListPersons, useCreatePerson, useUpdatePerson, useArchivePerson,
  useListBuildings, useListUnits,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Person, PersonInput } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Pencil, Archive, Loader2, Search } from "lucide-react";
import { ROLE_LABELS } from "@/lib/constants";
import { usePermissions } from "@/lib/permissions";

function PersonForm({
  initial,
  onSubmit,
  isPending,
  onCancel,
}: {
  initial?: { nameAr?: string; role?: "owner" | "tenant"; phone?: string | null; unitId?: number };
  onSubmit: (data: PersonInput) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const { data: buildings } = useListBuildings();
  const [buildingId, setBuildingId] = useState("");
  const { data: units } = useListUnits(buildingId ? { buildingId: parseInt(buildingId) } : undefined);
  const [unitId, setUnitId] = useState(initial?.unitId ? String(initial.unitId) : "");
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? "");
  const [role, setRole] = useState<"owner" | "tenant">(initial?.role ?? "tenant");
  const [phone, setPhone] = useState(initial?.phone ?? "");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>المبنى</Label>
          <Select value={buildingId} onValueChange={(v) => { setBuildingId(v); setUnitId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر المبنى" /></SelectTrigger>
            <SelectContent>
              {buildings?.filter((b) => !b.archived).map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>الوحدة</Label>
          <Select value={unitId} onValueChange={setUnitId} disabled={!buildingId}>
            <SelectTrigger><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
            <SelectContent>
              {units?.filter((u) => !u.archived).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.unitRef}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>الاسم</Label>
        <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="محمد عبدالله" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>الصفة</Label>
          <Select value={role} onValueChange={(v) => setRole(v as "owner" | "tenant")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">مالك</SelectItem>
              <SelectItem value="tenant">مستأجر</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>رقم الجوال</Label>
          <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" dir="ltr" />
        </div>
      </div>
      <DialogFooter className="mt-4 gap-2">
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button
          onClick={() => onSubmit({
            unitId: parseInt(unitId),
            nameAr,
            role,
            phone: phone || undefined,
          })}
          disabled={isPending || !unitId || !nameAr}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          حفظ
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function PersonsPage() {
  const queryClient = useQueryClient();
  const { canManageStructure } = usePermissions();
  const [filterBuilding, setFilterBuilding] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [searchName, setSearchName] = useState("");
  const [searchUnit, setSearchUnit] = useState("");
  const { data: buildings } = useListBuildings();
  const { data: persons, isLoading } = useListPersons({
    ...(filterBuilding !== "all" ? { buildingId: parseInt(filterBuilding) } : {}),
    ...(filterRole !== "all" ? { role: filterRole as "owner" | "tenant" } : {}),
    ...(searchName ? { nameAr: searchName } : {}),
  });
  const createMutation = useCreatePerson();
  const updateMutation = useUpdatePerson();
  const archiveMutation = useArchivePerson();

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/persons"] });

  const visiblePersons = persons?.filter((p) => {
    if (p.archived) return false;
    if (searchUnit && !p.unitRef?.toLowerCase().includes(searchUnit.toLowerCase())) return false;
    return true;
  });

  const colCount = canManageStructure ? 7 : 6;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> الملاك والمستأجرون
        </h1>
        {canManageStructure && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 ml-2" /> إضافة شخص
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pr-8 w-44"
            placeholder="بحث بالاسم..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
          />
        </div>
        <div className="relative">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pr-8 w-36"
            placeholder="رقم الوحدة..."
            value={searchUnit}
            onChange={(e) => setSearchUnit(e.target.value)}
          />
        </div>
        <Select value={filterBuilding} onValueChange={setFilterBuilding}>
          <SelectTrigger className="w-36"><SelectValue placeholder="كل المباني" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المباني</SelectItem>
            {buildings?.filter((b) => !b.archived).map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-32"><SelectValue placeholder="الدور" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="owner">مالك</SelectItem>
            <SelectItem value="tenant">مستأجر</SelectItem>
          </SelectContent>
        </Select>
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
                    <th className="text-right py-3 px-4 font-medium">الاسم</th>
                    <th className="text-right py-3 px-4 font-medium">الصفة</th>
                    <th className="text-right py-3 px-4 font-medium">المبنى</th>
                    <th className="text-right py-3 px-4 font-medium">الوحدة</th>
                    <th className="text-right py-3 px-4 font-medium">الدور</th>
                    <th className="text-right py-3 px-4 font-medium">رقم الجوال</th>
                    {canManageStructure && <th className="py-3 px-4" />}
                  </tr>
                </thead>
                <tbody>
                  {visiblePersons?.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4 font-medium">{p.nameAr}</td>
                      <td className="py-2.5 px-4">
                        <Badge variant={p.role === "owner" ? "default" : "secondary"} className="text-xs">
                          {ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] ?? p.role}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs">
                        {p.buildingNameAr ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">
                        {p.unitRef ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-center">
                        {p.floor != null ? p.floor : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground" dir="ltr">{p.phone ?? "—"}</td>
                      {canManageStructure && (
                        <td className="py-2.5 px-4">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                if (confirm("أرشفة هذا الشخص؟")) {
                                  archiveMutation.mutate({ id: p.id }, { onSuccess: invalidate });
                                }
                              }}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {visiblePersons?.length === 0 && (
                    <tr>
                      <td colSpan={colCount} className="text-center py-10 text-muted-foreground">
                        لا توجد نتائج
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
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة شخص جديد</DialogTitle></DialogHeader>
          <PersonForm
            onSubmit={(data) => createMutation.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } })}
            isPending={createMutation.isPending}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل بيانات الشخص</DialogTitle></DialogHeader>
          {editing && (
            <PersonForm
              initial={{
                nameAr: editing.nameAr,
                role: editing.role as "owner" | "tenant",
                phone: editing.phone,
                unitId: editing.unitId,
              }}
              onSubmit={(data) => updateMutation.mutate({ id: editing.id, data }, { onSuccess: () => { invalidate(); setEditing(null); } })}
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

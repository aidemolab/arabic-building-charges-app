import { useState } from "react";
import {
  useListUnits, useCreateUnit, useUpdateUnit, useArchiveUnit, useListBuildings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Unit, UnitInput } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Home, Plus, Pencil, Archive, Loader2 } from "lucide-react";
import { usePermissions } from "@/lib/permissions";

function UnitForm({
  initial,
  onSubmit,
  isPending,
  onCancel,
}: {
  initial?: Partial<UnitInput & { id?: number }>;
  onSubmit: (data: UnitInput) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const { data: buildings } = useListBuildings();
  const [buildingId, setBuildingId] = useState(initial?.buildingId ? String(initial.buildingId) : "");
  const [unitRef, setUnitRef] = useState(initial?.unitRef ?? "");
  const [floor, setFloor] = useState(initial?.floor != null ? String(initial.floor) : "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [tier, setTier] = useState(initial?.tier ?? "");

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>المبنى</Label>
        <Select value={buildingId} onValueChange={setBuildingId}>
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
          <Label>رقم الوحدة</Label>
          <Input value={unitRef} onChange={(e) => setUnitRef(e.target.value)} placeholder="A-101" dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label>الطابق</Label>
          <Input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="1" />
        </div>
        <div className="space-y-1.5">
          <Label>الفئة</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="سكني">سكني</SelectItem>
              <SelectItem value="تجاري">تجاري</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>الدرجة</Label>
          <Input value={tier} onChange={(e) => setTier(e.target.value)} placeholder="A" />
        </div>
      </div>
      <DialogFooter className="mt-4 gap-2">
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button
          onClick={() => onSubmit({
            buildingId: parseInt(buildingId),
            unitRef,
            floor: floor ? parseInt(floor) : undefined,
            category: category || undefined,
            tier: tier || undefined,
          })}
          disabled={isPending || !buildingId || !unitRef}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          حفظ
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function UnitsPage() {
  const queryClient = useQueryClient();
  const { canManageStructure } = usePermissions();
  const [filterBuilding, setFilterBuilding] = useState<string>("all");
  const { data: buildings } = useListBuildings();
  const { data: units, isLoading } = useListUnits(
    filterBuilding !== "all" ? { buildingId: parseInt(filterBuilding) } : undefined
  );
  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();
  const archiveMutation = useArchiveUnit();

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/units"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Home className="h-6 w-6" /> الوحدات
        </h1>
        <div className="flex gap-2">
          <Select value={filterBuilding} onValueChange={setFilterBuilding}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="كل المباني" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المباني</SelectItem>
              {buildings?.filter((b) => !b.archived).map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManageStructure && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 ml-2" /> إضافة وحدة
            </Button>
          )}
        </div>
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
                    <th className="text-right py-3 px-4 font-medium">رقم الوحدة</th>
                    <th className="text-right py-3 px-4 font-medium">المبنى</th>
                    <th className="text-right py-3 px-4 font-medium">الطابق</th>
                    <th className="text-right py-3 px-4 font-medium">الفئة</th>
                    <th className="text-right py-3 px-4 font-medium">الدرجة</th>
                    {canManageStructure && <th className="py-3 px-4" />}
                  </tr>
                </thead>
                <tbody>
                  {units?.filter((u) => !u.archived).map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4">
                        <Badge variant="outline" className="font-mono text-xs">{u.unitRef}</Badge>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">{u.buildingNameAr}</td>
                      <td className="py-2.5 px-4">{u.floor ?? "—"}</td>
                      <td className="py-2.5 px-4">{u.category ?? "—"}</td>
                      <td className="py-2.5 px-4">{u.tier ?? "—"}</td>
                      {canManageStructure && (
                        <td className="py-2.5 px-4">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                if (confirm("أرشفة الوحدة؟")) {
                                  archiveMutation.mutate({ id: u.id }, { onSuccess: invalidate });
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
                  {units?.filter((u) => !u.archived).length === 0 && (
                    <tr>
                      <td colSpan={canManageStructure ? 6 : 5} className="text-center py-10 text-muted-foreground">
                        لا توجد وحدات
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
          <DialogHeader><DialogTitle>إضافة وحدة جديدة</DialogTitle></DialogHeader>
          <UnitForm
            onSubmit={(data) => createMutation.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } })}
            isPending={createMutation.isPending}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل الوحدة</DialogTitle></DialogHeader>
          {editing && (
            <UnitForm
              initial={{
                buildingId: editing.buildingId,
                unitRef: editing.unitRef,
                floor: editing.floor ?? undefined,
                category: editing.category ?? undefined,
                tier: editing.tier ?? undefined,
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

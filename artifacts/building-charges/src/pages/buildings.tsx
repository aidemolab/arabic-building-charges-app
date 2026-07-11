import { useState } from "react";
import {
  useListBuildings, useCreateBuilding, useUpdateBuilding, useArchiveBuilding,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Building, BuildingInput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Pencil, Archive, Loader2 } from "lucide-react";

function BuildingForm({
  initial,
  onSubmit,
  isPending,
  onCancel,
}: {
  initial?: Partial<BuildingInput>;
  onSubmit: (data: BuildingInput) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [addressAr, setAddressAr] = useState(initial?.addressAr ?? "");

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>اسم المبنى</Label>
        <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="مبنى الياسمين" />
      </div>
      <div className="space-y-1.5">
        <Label>الرمز</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="BLDG-01" dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label>العنوان</Label>
        <Input value={addressAr} onChange={(e) => setAddressAr(e.target.value)} placeholder="شارع الملك فهد، الرياض" />
      </div>
      <DialogFooter className="mt-4 gap-2">
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button
          onClick={() => onSubmit({ nameAr, code, addressAr })}
          disabled={isPending || !nameAr || !code}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          حفظ
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function BuildingsPage() {
  const queryClient = useQueryClient();
  const { data: buildings, isLoading } = useListBuildings();
  const createMutation = useCreateBuilding();
  const updateMutation = useUpdateBuilding();
  const archiveMutation = useArchiveBuilding();

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Building | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/buildings"] });

  const handleCreate = (data: BuildingInput) => {
    createMutation.mutate({ data }, { onSuccess: () => { invalidate(); setShowCreate(false); } });
  };

  const handleUpdate = (data: BuildingInput) => {
    if (!editing) return;
    updateMutation.mutate({ id: editing.id, data }, {
      onSuccess: () => { invalidate(); setEditing(null); },
    });
  };

  const handleArchive = (id: number) => {
    if (!confirm("هل تريد أرشفة هذا المبنى؟")) return;
    archiveMutation.mutate({ id }, { onSuccess: invalidate });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6" /> المباني
        </h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 ml-2" /> إضافة مبنى
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {buildings?.filter((b) => !b.archived).map((b) => (
            <Card key={b.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{b.nameAr}</span>
                  <Badge variant="outline" className="text-xs font-mono">{b.code}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {b.addressAr && (
                  <p className="text-sm text-muted-foreground mb-3">{b.addressAr}</p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                    <Pencil className="h-3.5 w-3.5 ml-1.5" /> تعديل
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(b.id)}
                    className="text-muted-foreground hover:text-destructive">
                    <Archive className="h-3.5 w-3.5 ml-1.5" /> أرشفة
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {buildings?.filter((b) => !b.archived).length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              لا توجد مباني، أضف مبنى جديداً
            </div>
          )}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مبنى جديد</DialogTitle>
          </DialogHeader>
          <BuildingForm
            onSubmit={handleCreate}
            isPending={createMutation.isPending}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل المبنى</DialogTitle>
          </DialogHeader>
          {editing && (
            <BuildingForm
              initial={{ ...editing, addressAr: editing.addressAr ?? undefined }}
              onSubmit={handleUpdate}
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

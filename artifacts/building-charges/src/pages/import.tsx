import { useState, useRef } from "react";
import { usePreviewImport, useCommitImport, useListBuildings } from "@workspace/api-client-react";
import { ImportPreview, ImportRow } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, RotateCcw, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";

const MONTH_COLS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;
const MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function ImportPage() {
  const queryClient = useQueryClient();
  const { canImport } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [committed, setCommitted] = useState(false);
  const [buildingId, setBuildingId] = useState<string>("");
  const [year, setYear] = useState<string>("2026");

  const { data: buildings } = useListBuildings();
  const previewMutation = usePreviewImport();
  const commitMutation = useCommitImport();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setCommitted(false);

    const formData = new FormData();
    formData.append("file", f);
    previewMutation.mutate(
      { data: formData as unknown as { filename?: string } },
      { onSuccess: (data) => setPreview(data) }
    );
  };

  const handleCommit = () => {
    if (!preview?.rows || !buildingId) return;
    commitMutation.mutate(
      {
        data: {
          rows: preview.rows,
          buildingId: parseInt(buildingId),
          year: parseInt(year),
        },
      },
      {
        onSuccess: () => {
          setCommitted(true);
          queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
          queryClient.invalidateQueries({ queryKey: ["/api/units"] });
          queryClient.invalidateQueries({ queryKey: ["/api/persons"] });
        },
      }
    );
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setCommitted(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!canImport) {
    return (
      <div className="space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="h-6 w-6" /> استيراد Excel
          </h1>
        </div>
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              ليس لديك صلاحية لاستيراد البيانات. يقتصر الاستيراد على المدير والمحاسب.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6" /> استيراد Excel
        </h1>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            ارفع ملف Excel يحتوي على أعمدة الوحدات والأشخاص والمبالغ الشهرية (يناير–ديسمبر).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>المبنى المستهدف</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger><SelectValue placeholder="اختر المبنى" /></SelectTrigger>
                <SelectContent>
                  {buildings?.filter((b) => !b.archived).map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>السنة</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors",
              file ? "border-primary/40 bg-primary/5" : "border-border"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            {previewMutation.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">جاري تحليل الملف...</p>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">انقر لتغيير الملف</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">انقر لرفع ملف Excel</p>
                <p className="text-xs text-muted-foreground">XLSX أو XLS</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {committed && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <p className="font-medium text-green-800">تم الاستيراد بنجاح</p>
                <p className="text-sm text-green-700">
                  تم معالجة {preview?.validRows ?? 0} صف من البيانات
                </p>
              </div>
              <Button variant="outline" size="sm" className="mr-auto" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 ml-2" />
                استيراد جديد
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {preview && !committed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 text-sm">
              <Badge className="bg-green-100 text-green-700 border-green-200">
                <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
                {preview.validRows} صف صالح
              </Badge>
              {preview.errorRows > 0 && (
                <Badge className="bg-red-100 text-red-600 border-red-200">
                  <AlertCircle className="h-3.5 w-3.5 ml-1" />
                  {preview.errorRows} صف به أخطاء
                </Badge>
              )}
              {!buildingId && (
                <span className="text-amber-600 text-xs">⚠ اختر المبنى أولاً</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 ml-2" /> إعادة
              </Button>
              <Button
                onClick={handleCommit}
                disabled={preview.validRows === 0 || commitMutation.isPending || !buildingId}
              >
                {commitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                تأكيد الاستيراد ({preview.validRows} صف)
              </Button>
            </div>
          </div>

          {preview.warnings && preview.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-700 mb-1">تحذيرات:</p>
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">{w}</p>
              ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">معاينة البيانات ({preview.totalRows} صف)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                    <tr className="border-b">
                      <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">#</th>
                      <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">الوحدة</th>
                      <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">الاسم</th>
                      <th className="text-right py-2.5 px-3 font-medium whitespace-nowrap">الدور</th>
                      {MONTH_COLS.map((m, i) => (
                        <th key={m} className="text-left py-2.5 px-2 font-medium whitespace-nowrap">
                          <span className={cn(i < 6 ? "text-blue-700" : "text-slate-500")}>{MONTH_AR[i]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row: ImportRow, i: number) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2 px-3 text-muted-foreground">{row.rowIndex ?? i + 1}</td>
                        <td className="py-2 px-3 font-mono">{row.unitRef ?? "—"}</td>
                        <td className="py-2 px-3">{row.nameAr ?? "—"}</td>
                        <td className="py-2 px-3">
                          {row.role ? (
                            <Badge variant="outline" className="text-xs">
                              {row.role === "owner" ? "مالك" : row.role === "tenant" ? "مستأجر" : row.role}
                            </Badge>
                          ) : "—"}
                        </td>
                        {MONTH_COLS.map((m, mi) => {
                          const val = row[m];
                          return (
                            <td key={m} className={cn(
                              "py-2 px-2 text-left tabular-nums",
                              mi < 6 ? "text-blue-700" : "text-slate-500"
                            )}>
                              {val != null ? val.toLocaleString("ar-EG") : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

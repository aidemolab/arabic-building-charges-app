import { useState } from "react";
import {
  useGetDashboardSummary,
  useGetDashboardMonthly,
  useGetDashboardByBuilding,
  useListBuildings,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { ARABIC_MONTHS } from "@/lib/constants";
import { TrendingUp, Building2, CheckCircle2, XCircle, Percent } from "lucide-react";

const ACTUAL_COLOR = "#2563eb";
const FORECAST_COLOR = "#94a3b8";

function formatCurrency(v: number | string | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ج.م";
}

export default function DashboardPage() {
  const [year, setYear] = useState(2026);
  const [buildingId, setBuildingId] = useState<string>("all");

  const params = {
    year,
    ...(buildingId !== "all" ? { buildingId: parseInt(buildingId) } : {}),
  };

  const { data: summary } = useGetDashboardSummary(params);
  const { data: monthly } = useGetDashboardMonthly(params);
  const { data: byBuilding } = useGetDashboardByBuilding({ year });
  const { data: buildings } = useListBuildings();

  const monthlyByMonth: Record<number, { actual: number | null; forecast: number | null }> = {};
  monthly?.forEach((m) => {
    if (!monthlyByMonth[m.month]) monthlyByMonth[m.month] = { actual: null, forecast: null };
    if (m.type === "actual") monthlyByMonth[m.month].actual = m.totalAmount;
    else monthlyByMonth[m.month].forecast = m.totalAmount;
  });

  const monthlyChartData = Array.from({ length: 12 }, (_, i) => ({
    name: ARABIC_MONTHS[i],
    month: i + 1,
    فعلي: monthlyByMonth[i + 1]?.actual ?? null,
    توقعي: monthlyByMonth[i + 1]?.forecast ?? null,
  }));

  const collected = summary?.totalActualPaid ?? 0;
  const target = summary?.totalActualDue ?? 0;
  const collectionPct = target > 0 ? (collected / target) * 100 : 0;
  const gaugeColor = collectionPct >= 80 ? "#22c55e" : collectionPct >= 50 ? "#f59e0b" : "#ef4444";
  const gaugeData = [
    { name: "محصّل", value: Math.min(collected, target), color: gaugeColor },
    { name: "متبقٍ", value: Math.max(target - collected, 0), color: "#e5e7eb" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">لوحة البيانات</h1>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
              <SelectItem value="2027">2027</SelectItem>
            </SelectContent>
          </Select>
          <Select value={buildingId} onValueChange={setBuildingId}>
            <SelectTrigger className="w-40"><SelectValue placeholder="كل المباني" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المباني</SelectItem>
              {buildings?.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">المدفوع الفعلي</span>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(summary?.totalActualPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">إجمالي التوقعي</span>
            </div>
            <p className="text-xl font-bold text-muted-foreground">{formatCurrency(summary?.totalForecast)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-400" />
              <span className="text-xs text-muted-foreground">الملغى</span>
            </div>
            <p className="text-xl font-bold text-red-500">{formatCurrency(summary?.totalCancelled)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">معدل التحصيل</span>
            </div>
            <p className="text-xl font-bold text-primary">
              {summary?.collectionRate != null ? `${Math.round(summary.collectionRate)}%` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>التوزيع الشهري — الفعلي والتوقعي</span>
              <div className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: ACTUAL_COLOR }} />
                  فعلي (يناير–يونيو)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: FORECAST_COLOR }} />
                  توقعي (يوليو–ديسمبر)
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 12, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fontFamily: "Cairo" }}
                  padding={{ left: 28, right: 12 }}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: "Cairo" }}
                  width={78}
                  tickMargin={8}
                  tickFormatter={(v: number) => v.toLocaleString("ar-EG")}
                  label={{
                    value: "المبلغ (ج.م)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fontFamily: "Cairo", fill: "#64748b", textAnchor: "middle" },
                  }}
                />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), ""]}
                  labelStyle={{ fontFamily: "Cairo", direction: "rtl" }}
                />
                <Bar dataKey="فعلي" fill={ACTUAL_COLOR} radius={[3, 3, 0, 0]} />
                <Bar dataKey="توقعي" fill={FORECAST_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">نسبة التحصيل</CardTitle>
          </CardHeader>
          <CardContent>
            {target > 0 ? (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={gaugeData}
                        cx="50%"
                        cy="90%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={62}
                        outerRadius={92}
                        cornerRadius={4}
                        dataKey="value"
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {gaugeData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
                    <span className="text-3xl font-bold" style={{ color: gaugeColor }}>
                      {Math.round(collectionPct)}%
                    </span>
                    <span className="text-[11px] text-muted-foreground">نسبة التحصيل</span>
                  </div>
                </div>
                <div className="space-y-1.5 mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-300" />
                      <span>إجمالي المبلغ المستحق</span>
                    </div>
                    <span className="font-semibold">{formatCurrency(target)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: gaugeColor }}
                      />
                      <span>إجمالي المبلغ المحصل</span>
                    </div>
                    <span className="font-semibold" style={{ color: gaugeColor }}>
                      {formatCurrency(collected)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                لا توجد بيانات
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <p className="text-3xl font-bold text-primary">{summary?.totalBuildings ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">مبنى</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <p className="text-3xl font-bold text-primary">{summary?.totalUnits ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">وحدة</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <p className="text-3xl font-bold text-primary">{summary?.totalPersons ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">مالك / مستأجر</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <p className="text-3xl font-bold text-primary">
              {(summary?.actualMonthsCount ?? 0) + (summary?.forecastMonthsCount ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">رسم مسجل</p>
          </CardContent>
        </Card>
      </div>

      {byBuilding && byBuilding.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> ملخص حسب المبنى
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 px-3 font-medium">المبنى</th>
                    <th className="text-left py-2 px-3 font-medium">الوحدات</th>
                    <th className="text-left py-2 px-3 font-medium">فعلي</th>
                    <th className="text-left py-2 px-3 font-medium">توقعي</th>
                    <th className="text-left py-2 px-3 font-medium">نسبة التحصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {byBuilding.map((b) => (
                    <tr key={b.buildingId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-medium">{b.buildingNameAr}</td>
                      <td className="py-2 px-3 text-left">{b.totalUnits}</td>
                      <td className="py-2 px-3 text-left text-blue-600">{formatCurrency(b.totalActual)}</td>
                      <td className="py-2 px-3 text-left text-muted-foreground">{formatCurrency(b.totalForecast)}</td>
                      <td className="py-2 px-3 text-left">
                        {b.collectionRate != null ? `${Math.round(b.collectionRate)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

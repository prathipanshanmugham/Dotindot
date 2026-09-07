import { useEffect, useState } from "react";
import api, { formatINR } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import ExportMenu from "@/components/ExportMenu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CHART_COLORS } from "@/components/Badges";

export default function EmployeeRevenuePage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/finance/employee-revenue").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data)
    return <FinanceLayout title="Employee Revenue"><div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div></FinanceLayout>;

  const maxRev = Math.max(...data.employees.map((e) => e.revenue), 1);
  const names = data.employees.map((e) => e.name);

  return (
    <FinanceLayout title="Employee Revenue" subtitle="Revenue attributed to each team member from project income."
      actions={<ExportMenu dataset="employee-revenue" />}>
      <div className="flex items-start gap-2 rounded-lg bg-[#FFF7ED] border border-orange-200 px-4 py-3 text-sm text-gray-700" data-testid="split-rule-note" title={data.split_rule}>
        <Info className="h-4 w-4 text-[#F26B21] mt-0.5 shrink-0" />
        <span><span className="font-semibold">Split rule:</span> {data.split_rule}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Ranked by attributed revenue</CardTitle></CardHeader>
          <CardContent className="space-y-3" data-testid="employee-revenue-ranking">
            {data.employees.map((e, i) => (
              <div key={e.user_id} data-testid={`employee-revenue-row-${e.user_id}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                    <span className="text-sm font-semibold text-gray-800">{e.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">{e.role}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold">{formatINR(e.revenue)}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden ml-7">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#F26B21] to-[#FBA834]" style={{ width: `${(e.revenue / maxRev) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-gray-200/80">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Monthly trend per employee</CardTitle></CardHeader>
          <CardContent className="h-80" data-testid="employee-revenue-trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthly_trend}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
                <Tooltip formatter={(v) => formatINR(v)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                {names.map((n, i) => (
                  <Line key={n} type="monotone" dataKey={n} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </FinanceLayout>
  );
}

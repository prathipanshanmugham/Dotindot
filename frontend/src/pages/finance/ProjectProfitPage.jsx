import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import ExportMenu from "@/components/ExportMenu";
import { ProjectStatusBadge } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

export default function ProjectProfitPage() {
  const [rows, setRows] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/finance/project-profit").then((r) => setRows(r.data)).catch(() => setRows([]));
  }, []);

  if (!rows)
    return <FinanceLayout title="Project Profit"><div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div></FinanceLayout>;

  const chartData = rows.slice(0, 12).map((r) => ({ name: r.project_name.slice(0, 16), net: r.net }));

  return (
    <FinanceLayout title="Project Profit" subtitle="Net = linked income − (linked expenses + manual cost allocation). Ranked by margin."
      actions={<ExportMenu dataset="project-profit" />}>
      <Card className="border-gray-200/80">
        <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Net profit by project (₹)</CardTitle></CardHeader>
        <CardContent className="h-72" data-testid="profit-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} interval={0} angle={-28} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
              <ReferenceLine y={0} stroke="#D1D5DB" />
              <Bar dataKey="net" radius={[5, 5, 0, 0]} maxBarSize={34}>
                {chartData.map((d, i) => <Cell key={i} fill={d.net >= 0 ? "#F26B21" : "#EF4444"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Project</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Revenue billed</TableHead><TableHead className="text-right">Linked expenses</TableHead>
              <TableHead className="text-right">Cost allocation</TableHead><TableHead className="text-right">Net</TableHead><TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.project_id} onClick={() => navigate(`/projects/${r.project_id}`)} className="cursor-pointer hover:bg-orange-50/40" data-testid={`profit-row-${r.project_id}`}>
                <TableCell>
                  <div className="font-semibold text-gray-900 text-sm">{r.project_name}</div>
                  <div className="text-xs text-gray-400">{r.client_name}</div>
                </TableCell>
                <TableCell><ProjectStatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right font-mono text-sm text-emerald-600">{formatINR(r.revenue)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-red-500">{formatINR(r.linked_expenses)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-gray-500">{formatINR(r.cost_allocation)}</TableCell>
                <TableCell className={`text-right font-mono text-sm font-bold ${r.net >= 0 ? "text-gray-900" : "text-red-600"}`}>{formatINR(r.net)}</TableCell>
                <TableCell className={`text-right font-mono text-sm font-semibold ${r.margin_pct === null ? "text-gray-300" : r.margin_pct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {r.margin_pct === null ? "—" : `${r.margin_pct}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </FinanceLayout>
  );
}

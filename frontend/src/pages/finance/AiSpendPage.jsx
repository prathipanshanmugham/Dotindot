import { useEffect, useState } from "react";
import api, { formatINR } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cpu } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

export default function AiSpendPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/finance/ai-spend").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data)
    return <FinanceLayout title="AI Spend"><div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div></FinanceLayout>;

  return (
    <FinanceLayout title="AI Spend" subtitle="Dedicated sub-ledger for AI tooling — API usage, subscriptions and client-attributable costs."
      actions={<ExportMenu dataset="ai-spend" />}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono" data-testid="ai-total-spend">{formatINR(data.total_tx_spend)}</div><div className="text-xs text-gray-500">AI usage spend (ledger, 6 mo)</div></CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono" data-testid="ai-subs-burn">{formatINR(data.subscriptions_monthly_burn)}</div><div className="text-xs text-gray-500">AI subscriptions / month</div></CardContent></Card>
        <Card className="border-gray-200/80"><CardContent className="p-5"><div className="text-2xl font-bold font-mono">{data.by_tool.length}</div><div className="text-xs text-gray-500">AI tools in use</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Cost per tool</CardTitle></CardHeader>
          <CardContent className="h-56" data-testid="ai-by-tool-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_tool} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
                <Bar dataKey="value" fill="#F26B21" radius={[0, 5, 5, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Monthly AI spend trend</CardTitle></CardHeader>
          <CardContent className="h-56" data-testid="ai-trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthly_trend}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatINR(v)} />
                <Line type="monotone" dataKey="value" stroke="#F26B21" strokeWidth={2.5} dot={{ fill: "#F26B21", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Cost per client (attributed)</CardTitle></CardHeader>
          <CardContent className="h-56" data-testid="ai-by-client-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_client} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={95} />
                <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
                <Bar dataKey="value" fill="#FBA834" radius={[0, 5, 5, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/80">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Cpu className="h-4 w-4 text-[#F26B21]" /> AI subscriptions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 pb-4" data-testid="ai-subscriptions-list">
          {data.subscriptions.map((s) => (
            <Badge key={s.id} variant="outline" className={`${s.status === "active" ? "bg-[#FFF7ED] text-[#F26B21] border-orange-200" : "bg-gray-100 text-gray-400 border-gray-200"} px-3 py-1.5`}>
              {s.name} · {formatINR(s.monthly_equivalent)}/mo
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Date</TableHead><TableHead>Tool</TableHead><TableHead>Description</TableHead>
              <TableHead>Client / Project</TableHead><TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.transactions.slice(0, 50).map((x) => (
              <TableRow key={x.id} data-testid={`ai-tx-row-${x.id}`}>
                <TableCell className="text-sm text-gray-600 whitespace-nowrap">{x.date}</TableCell>
                <TableCell><Badge variant="outline" className="bg-[#FFF7ED] text-[#F26B21] border-orange-200">{x.ai_tool || "Other"}</Badge></TableCell>
                <TableCell className="text-sm text-gray-800">{x.description}</TableCell>
                <TableCell className="text-xs text-gray-500">{[x.client_name, x.project_name].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-red-500">−{formatINR(x.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </FinanceLayout>
  );
}

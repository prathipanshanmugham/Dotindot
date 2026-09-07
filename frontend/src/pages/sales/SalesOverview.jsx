import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import SalesLayout, { STAGE_STYLES } from "@/components/SalesLayout";
import { labelize, CHART_COLORS } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CalendarClock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, Cell as BarCell } from "recharts";

const Stat = ({ label, value, sub, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-5">
      <div className="text-2xl font-bold font-mono tracking-tight text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 font-medium mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </CardContent>
  </Card>
);

const FollowupList = ({ title, items, tone }) => (
  <div>
    <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${tone}`}>{title} ({items.length})</div>
    <div className="space-y-1.5">
      {items.length === 0 && <p className="text-xs text-gray-300">None</p>}
      {items.slice(0, 5).map((f) => (
        <Link key={f.lead_id + f.follow_up_date} to={`/sales/leads/${f.lead_id}`}
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-orange-300 transition-colors"
          data-testid={`followup-${f.lead_id}`}>
          <div>
            <div className="text-sm font-semibold text-gray-800">{f.lead_name}</div>
            <div className="text-[11px] text-gray-400">{labelize(f.stage)} · {f.owner_name}</div>
          </div>
          <span className="text-xs font-mono text-gray-500">{f.follow_up_date}</span>
        </Link>
      ))}
    </div>
  </div>
);

export default function SalesOverview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/sales/overview").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data)
    return <SalesLayout title="Overview"><div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div></SalesLayout>;

  const funnelData = data.funnel.map((f) => ({ ...f, stage: labelize(f.stage) }));

  return (
    <SalesLayout title="Sales Overview" subtitle={`${data.total_leads} leads · open pipeline ${formatINR(data.open_pipeline_value)}`}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Win rate" value={`${data.win_rate}%`} sub="won ÷ (won + lost)" testid="sales-stat-winrate" />
        <Stat label="Avg deal size" value={formatINR(data.avg_deal_size)} testid="sales-stat-avgdeal" />
        <Stat label="Avg time to close" value={data.avg_days_to_close !== null ? `${data.avg_days_to_close}d` : "—"} sub="lead created → won" testid="sales-stat-ttc" />
        <Stat label="Open pipeline" value={formatINR(data.open_pipeline_value)} testid="sales-stat-pipeline" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Funnel — count & value per stage</CardTitle></CardHeader>
          <CardContent className="h-64" data-testid="sales-funnel-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData}>
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip formatter={(v, n) => (n === "value" ? formatINR(v) : v)} cursor={{ fill: "#FFF7ED" }} />
                <Bar dataKey="count" name="Leads" radius={[5, 5, 0, 0]} maxBarSize={40}>
                  {funnelData.map((_, i) => <BarCell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Leads by source</CardTitle></CardHeader>
          <CardContent className="h-64" data-testid="sales-source-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.by_source.map((s) => ({ name: labelize(s.source), value: s.count }))} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                  {data.by_source.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Conversion rates */}
      <Card className="border-gray-200/80">
        <CardContent className="p-4 flex flex-wrap items-center gap-2" data-testid="conversion-rates">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400 mr-2">Stage conversion</span>
          {data.conversion.map((c) => (
            <Badge key={c.from} variant="outline" className="bg-gray-50 border-gray-200 text-gray-700 gap-1.5 px-3 py-1.5" data-testid={`conversion-${c.from}-${c.to}`}>
              {labelize(c.from)} <ArrowRight className="h-3 w-3 text-[#F26B21]" /> {labelize(c.to)}
              <span className="font-mono font-bold text-[#F26B21]">{c.rate_pct}%</span>
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Follow-ups */}
        <Card className="border-gray-200/80" data-testid="followups-card">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#F26B21]" /> Follow-ups due</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <FollowupList title="Overdue" items={data.followups.overdue} tone="text-red-500" />
            <FollowupList title="Today" items={data.followups.today} tone="text-amber-600" />
            <FollowupList title="Upcoming (7d)" items={data.followups.upcoming} tone="text-gray-400" />
          </CardContent>
        </Card>

        {/* Targets */}
        <Card className="border-gray-200/80" data-testid="targets-progress-card">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Targets — current month & quarter</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {data.targets.length === 0 && <p className="text-sm text-gray-400">No targets set for this period.</p>}
            {data.targets.map((t) => (
              <div key={t.id} data-testid={`overview-target-${t.id}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-800">{t.user_name} · {t.period}</span>
                  <span className="text-xs font-mono">
                    <span className={t.pct >= 100 ? "text-emerald-600 font-bold" : "text-gray-700 font-semibold"}>{formatINR(t.actual)}</span>
                    <span className="text-gray-400"> / {formatINR(t.amount)} ({t.pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full ${t.pct >= 100 ? "bg-emerald-500" : t.pct >= 70 ? "bg-[#F26B21]" : "bg-amber-400"}`}
                    style={{ width: `${Math.min(t.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </SalesLayout>
  );
}

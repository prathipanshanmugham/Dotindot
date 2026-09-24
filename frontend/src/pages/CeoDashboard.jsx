import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR } from "@/lib/api";
import { labelize, CHART_COLORS } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BranchFilter } from "@/components/BranchFilter";
import { ArrowUpRight, ArrowDownRight, Info, ArrowRight, Globe2, Building2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, ComposedChart, Cell,
} from "recharts";

const PERIODS = [
  { value: "this_month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "last_6_months", label: "Last 6 months" },
];

const Delta = ({ change, invert = false }) => {
  if (change === null || change === undefined) return <span className="text-[11px] text-gray-300">no comparison</span>;
  const good = invert ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${good ? "text-emerald-600" : "text-red-500"}`}>
      <Icon className="h-3 w-3" /> {Math.abs(change)}% vs prev
    </span>
  );
};

const Metric = ({ label, value, delta, invert, link, linkLabel, tooltip, testid, children }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-5">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
        {label}
        {tooltip && <Info className="h-3 w-3 text-gray-300 cursor-help" title={tooltip} />}
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight text-gray-900 mt-1">{value}</div>
      <div className="flex items-center justify-between mt-1.5">
        {delta !== undefined ? <Delta change={delta} invert={invert} /> : <span />}
        {link && (
          <Link to={link} className="text-[11px] font-semibold text-[#F26B21] hover:underline inline-flex items-center gap-0.5" data-testid={`${testid}-link`}>
            {linkLabel || "View"} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </CardContent>
  </Card>
);

export default function CeoDashboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("this_month");
  const [d, setD] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState("all");

  useEffect(() => {
    setD(null);
    api.get("/ceo/dashboard", { params: { period, ...(branch !== "all" ? { branch } : {}) } }).then((r) => setD(r.data)).catch(() => {});
  }, [period, branch]);

  useEffect(() => {
    api.get("/locations/compare").then((r) => setBranches(r.data)).catch(() => {});
  }, []);

  if (!d)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-7xl" data-testid="ceo-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">CEO Dashboard</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Good to see you, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{d.range.start} → {d.range.end} · compared with {d.prev_range.start} → {d.prev_range.end}</p>
        </div>
        <div className="flex items-center gap-2">
          <BranchFilter value={branch} onChange={setBranch} testid="ceo-branch-filter" />
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[170px]" data-testid="ceo-period-select"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 1: headline */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="MRR" value={formatINR(d.mrr.value)} tooltip={d.mrr.formula} link="/clients" linkLabel="Clients" testid="ceo-mrr" />
        <Metric label="ARR" value={formatINR(d.mrr.arr)} tooltip="ARR = MRR × 12" link="/clients" linkLabel="Clients" testid="ceo-arr" />
        <Metric label="Profit margin" value={d.margin.value_pct !== null ? `${d.margin.value_pct}%` : "—"} delta={d.margin.change} link="/finance/ledger" linkLabel="Ledger" testid="ceo-margin" />
        <Metric label="Open pipeline" value={formatINR(d.pipeline.total_value)} link="/sales/pipeline" linkLabel="Pipeline" testid="ceo-pipeline">
          <div className="text-[11px] text-gray-400 mt-1">{d.pipeline.open_count} open leads</div>
        </Metric>
      </div>

      {/* Row 2: trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">Revenue, expense & margin — 6 months</CardTitle></CardHeader>
          <CardContent className="h-64" data-testid="ceo-margin-trend">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.margin.trend}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={34} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v, n) => (n === "Margin %" ? `${v}%` : formatINR(v))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="income" name="Income" fill="#F26B21" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="l" dataKey="expense" name="Expense" fill="#CBD5E1" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line yAxisId="r" type="monotone" dataKey="margin_pct" name="Margin %" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-gray-200/80">
          <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold text-gray-700">MRR trend — 6 months</CardTitle></CardHeader>
          <CardContent className="h-64" data-testid="ceo-mrr-trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.mrr.trend}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
                <Tooltip formatter={(v) => formatINR(v)} />
                <Line type="monotone" dataKey="value" name="MRR" stroke="#F26B21" strokeWidth={2.5} dot={{ fill: "#F26B21", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: unit economics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="CAC" value={d.cac.value !== null ? formatINR(d.cac.value) : "—"} delta={d.cac.change_pct} invert tooltip={d.cac.formula} link="/finance/marketing" linkLabel="Marketing" testid="ceo-cac">
          <div className="text-[11px] text-gray-400 mt-1">{formatINR(d.cac.marketing_spend)} spend · {d.cac.new_clients_won} won</div>
        </Metric>
        <Metric label="Retention" value={`${d.retention.retained_pct}%`} tooltip={d.retention.label} link="/clients" linkLabel="Clients" testid="ceo-retention">
          <div className="text-[11px] text-gray-400 mt-1">{d.retention.churned}/{d.retention.total_clients} churned ({d.retention.churn_rate_pct}%)</div>
        </Metric>
        <Metric label="Revenue / employee" value={formatINR(d.revenue_per_employee.value)} delta={d.revenue_per_employee.change_pct} tooltip={d.revenue_per_employee.formula} link="/finance/employees" linkLabel="Ranking" testid="ceo-rpe">
          <div className="text-[11px] text-gray-400 mt-1">{d.revenue_per_employee.headcount} active headcount</div>
        </Metric>
        <Metric label="Utilization" value={`${d.utilization.rate_pct}%`} tooltip={d.utilization.formula} link="/projects" linkLabel="Projects" testid="ceo-utilization">
          <div className="text-[11px] text-gray-400 mt-1">{d.utilization.utilized}/{d.utilization.headcount} on active projects</div>
        </Metric>
      </div>

      {/* Pipeline by stage */}
      <Card className="border-gray-200/80">
        <CardHeader className="pb-0 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold text-gray-700">Pipeline by stage</CardTitle>
          <Link to="/sales/pipeline" className="text-[11px] font-semibold text-[#F26B21] hover:underline inline-flex items-center gap-0.5" data-testid="ceo-pipeline-drill">Open board <ArrowRight className="h-3 w-3" /></Link>
        </CardHeader>
        <CardContent className="h-48" data-testid="ceo-pipeline-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.pipeline.by_stage.map((s) => ({ ...s, stage: labelize(s.stage) }))} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={78} />
              <Tooltip formatter={(v, n) => (n === "value" ? formatINR(v) : v)} cursor={{ fill: "#FFF7ED" }} />
              <Bar dataKey="value" name="value" radius={[0, 5, 5, 0]} maxBarSize={20}>
                {d.pipeline.by_stage.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Global expansion panel */}
      <Card className="border-gray-200/80" data-testid="ceo-global-panel">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Globe2 className="h-4 w-4 text-[#F26B21]" /> Global expansion — revenue by region</CardTitle>
          <Link to="/clients" className="text-[11px] font-semibold text-[#F26B21] hover:underline inline-flex items-center gap-0.5">Clients <ArrowRight className="h-3 w-3" /></Link>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56" data-testid="ceo-region-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.regions.by_region}>
                <XAxis dataKey="region" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
                <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
                <Bar dataKey="revenue" fill="#FBA834" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Top regions this period</div>
            {d.regions.top3.length === 0 && <p className="text-sm text-gray-400">No regional revenue in this period.</p>}
            {d.regions.top3.map((r, i) => (
              <div key={r.region} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3" data-testid={`ceo-top-region-${i}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{r.region}</div>
                    <div className="text-[11px] text-gray-400">{r.clients} clients</div>
                  </div>
                </div>
                <span className="font-mono text-sm font-bold">{formatINR(r.revenue)}</span>
              </div>
            ))}
            <Badge variant="outline" className="bg-[#FFF7ED] text-[#F26B21] border-orange-200 mt-1">Expansion readiness view — multi-currency arrives in a later phase</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Performance by branch */}
      <Card className="border-gray-200/80" data-testid="ceo-branch-panel">
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-[#F26B21]" /> Performance by branch</CardTitle>
          <Link to="/locations" className="text-[11px] font-semibold text-[#F26B21] hover:underline inline-flex items-center gap-0.5">Locations <ArrowRight className="h-3 w-3" /></Link>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56" data-testid="ceo-branch-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branches}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
                <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
                <Bar dataKey="revenue" name="Revenue" fill="#F26B21" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Branch roll-up</div>
            {branches.length === 0 && <p className="text-sm text-gray-400">No branches configured yet.</p>}
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3" data-testid={`ceo-branch-row-${b.id}`}>
                <div>
                  <div className="text-sm font-semibold text-gray-800">{b.name} <span className="text-xs font-normal text-gray-400">· {b.city}</span></div>
                  <div className="text-[11px] text-gray-400">{b.clients_active} active clients · {b.projects_active} active projects · {b.headcount} staff · pipeline {formatINR(b.pipeline_value)}</div>
                </div>
                <span className="font-mono text-sm font-bold">{formatINR(b.revenue)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

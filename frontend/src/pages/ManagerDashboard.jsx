import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR } from "@/lib/api";
import { labelize } from "@/components/Badges";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, TrendingUp, Users, FolderKanban, Laptop, Activity, AlertTriangle } from "lucide-react";

const Stat = ({ icon: Icon, label, value, sub, link, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}><CardContent className="p-4">
    <div className="flex items-center gap-2 text-xs text-gray-500 font-medium"><Icon className="h-3.5 w-3.5 text-[#F26B21]" /> {label}</div>
    <div className="text-2xl font-bold font-mono text-gray-900 mt-1">{value}</div>
    <div className="flex items-center justify-between mt-1"><span className="text-[11px] text-gray-400">{sub || ""}</span>{link && <Link to={link} className="text-[11px] font-semibold text-[#F26B21] hover:underline">View</Link>}</div>
  </CardContent></Card>
);

const Panel = ({ title, icon: Icon, children, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Icon className="h-4 w-4 text-[#F26B21]" /> {title}</CardTitle></CardHeader>
    <CardContent className="pt-0">{children}</CardContent>
  </Card>
);

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [branch, setBranch] = useState("all");
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/dashboard/manager", { params: branch !== "all" ? { branch } : {} }).then((r) => setD(r.data)).catch(() => {});
  }, [branch]);
  if (!d) return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-7xl" data-testid="manager-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Manager Dashboard</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Welcome, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{d.branches.map((b) => b.name).join(", ") || "No branches"} · {d.range.start} → {d.range.end}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardSwitcher current="manager" />
          {d.branches.length > 1 && (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-[180px]" data-testid="manager-branch-filter"><Building2 className="h-3.5 w-3.5 text-[#F26B21] mr-1.5" /><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All my branches</SelectItem>{d.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={TrendingUp} label="Revenue (MTD)" value={formatINR(d.sales.revenue)} sub={`${d.sales.won_count} deals won · ${formatINR(d.sales.won_value)}`} link="/sales" testid="mgr-stat-revenue" />
        <Stat icon={TrendingUp} label="Open pipeline" value={formatINR(d.sales.open_pipeline)} sub={`${d.sales.open_leads} open leads`} link="/sales/pipeline" testid="mgr-stat-pipeline" />
        <Stat icon={FolderKanban} label="Active projects" value={d.projects.active} sub={`${d.clients.active} active clients`} link="/projects" testid="mgr-stat-projects" />
        <Stat icon={Laptop} label="Branch assets" value={d.assets.count} sub={`${d.assets.in_use} in use · ${formatINR(d.assets.value)}`} link="/assets" testid="mgr-stat-assets" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <Panel title="Team performance (won value this month)" icon={Users} testid="mgr-team">
          {d.team.length === 0 ? <p className="text-sm text-gray-400 py-3">No team activity this month.</p> : (
            <div className="space-y-2.5 mt-1">
              {d.team.map((t, i) => {
                const max = Math.max(...d.team.map((x) => x.won_value), 1);
                return (
                  <div key={i} data-testid={`mgr-team-row-${i}`}>
                    <div className="flex items-center justify-between text-sm"><span className="text-gray-800 font-medium">{t.name}</span><span className="font-mono text-xs text-gray-600">{formatINR(t.won_value)} · {t.won_count} won · {t.projects} projects</span></div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-1"><div className="h-full bg-[#F26B21] rounded-full transition-all" style={{ width: `${Math.max(2, (t.won_value / max) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="Pending items" icon={AlertTriangle} testid="mgr-pending">
          <div className="space-y-2 text-sm">
            {d.pending.expense_approvals !== null && <Link to="/finance/expenses" className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"><span>Expense approvals</span><Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{d.pending.expense_approvals}</Badge></Link>}
            {d.pending.posts_in_review !== null && <Link to="/social" className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"><span>Posts in review</span><Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">{d.pending.posts_in_review}</Badge></Link>}
            <div className="rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex items-center justify-between"><span>Overdue follow-ups</span><Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{d.pending.overdue_followups.length}</Badge></div>
              {d.pending.overdue_followups.slice(0, 4).map((l) => <Link key={l.id} to={`/sales/leads/${l.id}`} className="block text-xs text-gray-500 hover:text-[#F26B21] mt-1 truncate">{l.name} · {l.follow_up_date}{l.owner ? ` · ${l.owner}` : ""}</Link>)}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Recent branch activity" icon={Activity} testid="mgr-activity">
        {d.activity.length === 0 && <p className="text-sm text-gray-400 py-3">No recent activity.</p>}
        <div className="divide-y divide-gray-100">
          {d.activity.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-gray-700 truncate"><span className="font-semibold">{a.user_name}</span> · {labelize(a.action)}{a.entity_name ? ` — ${a.entity_name}` : ""}</span><span className="text-[11px] text-gray-400 shrink-0">{new Date(a.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

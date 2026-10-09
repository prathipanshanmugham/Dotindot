import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR } from "@/lib/api";
import { labelize } from "@/components/Badges";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import TodayAttendanceStrip from "@/components/TodayAttendanceStrip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, CheckSquare, Target, Laptop, GraduationCap, Activity, ReceiptText } from "lucide-react";

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

export default function StaffDashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard/staff").then((r) => setD(r.data)).catch(() => {}); }, []);
  if (!d) return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-7xl" data-testid="staff-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">My Dashboard</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Hi, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your projects, tasks and things assigned to you.</p>
        </div>
        <DashboardSwitcher current="staff" />
      </div>

      <TodayAttendanceStrip />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={FolderKanban} label="Active projects" value={d.projects.active} sub={`${d.projects.total} total`} link="/projects" testid="staff-stat-projects" />
        <Stat icon={CheckSquare} label="Open deliverables" value={d.open_tasks} sub="across your projects" testid="staff-stat-tasks" />
        {d.sales ? (
          <Stat icon={Target} label="Won this month" value={formatINR(d.sales.won_value)} sub={d.sales.target ? `${d.sales.pct}% of ${formatINR(d.sales.target)}` : `${d.sales.open_leads} open leads`} link="/sales/pipeline" testid="staff-stat-sales" />
        ) : (
          <Stat icon={Laptop} label="Assets assigned" value={d.assets.length} sub="in your care" testid="staff-stat-assets" />
        )}
        <Stat icon={GraduationCap} label="Training" value={`${d.training_completed}/${d.training.length}`} sub="courses completed" testid="staff-stat-training" />
      </div>

      {(d.extras.pending_expense_approvals !== undefined || d.extras.posts_in_review !== undefined || d.extras.active_campaigns !== undefined || d.my_pending_expenses > 0 || (d.sales && d.sales.overdue_followups > 0)) && (
        <div className="flex flex-wrap gap-2" data-testid="staff-extras">
          {d.extras.pending_expense_approvals !== undefined && <Link to="/finance/expenses"><Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 py-1.5 px-3">{d.extras.pending_expense_approvals} expense approvals pending</Badge></Link>}
          {d.extras.posts_in_review !== undefined && <Link to="/social"><Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200 py-1.5 px-3">{d.extras.posts_in_review} posts in review</Badge></Link>}
          {d.extras.active_campaigns !== undefined && <Link to="/ads"><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 py-1.5 px-3">{d.extras.active_campaigns} active campaigns</Badge></Link>}
          {d.my_pending_expenses > 0 && <Link to="/my-expenses"><Badge variant="outline" className="bg-gray-50 text-gray-700 py-1.5 px-3"><ReceiptText className="h-3 w-3 mr-1" />{d.my_pending_expenses} of my expenses awaiting approval</Badge></Link>}
          {d.sales?.overdue_followups > 0 && <Link to="/sales/pipeline"><Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 py-1.5 px-3">{d.sales.overdue_followups} overdue follow-ups</Badge></Link>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="My projects" icon={FolderKanban} testid="staff-projects">
          {d.projects.items.length === 0 && <p className="text-sm text-gray-400 py-3">No projects assigned to you yet.</p>}
          <div className="divide-y divide-gray-100">
            {d.projects.items.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg" data-testid={`staff-project-${p.id}`}>
                <div className="min-w-0"><div className="text-sm font-semibold text-gray-800 truncate">{p.name}</div><div className="text-[11px] text-gray-400">{p.client}{p.end_date ? ` · due ${p.end_date}` : ""}</div></div>
                <div className="flex items-center gap-2 shrink-0"><div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-[#F26B21]" style={{ width: `${p.progress}%` }} /></div><Badge variant="outline" className="text-[10px]">{labelize(p.status)}</Badge></div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Open deliverables" icon={CheckSquare} testid="staff-tasks">
          {d.tasks.length === 0 && <p className="text-sm text-gray-400 py-3">Nothing outstanding — nice.</p>}
          <div className="divide-y divide-gray-100">
            {d.tasks.map((t, i) => (
              <Link key={i} to={`/projects/${t.project_id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                <div className="min-w-0"><div className="text-sm text-gray-800 truncate">{t.title}</div><div className="text-[11px] text-gray-400">{t.project}{t.client ? ` · ${t.client}` : ""}</div></div>
                {t.due && <span className="text-[11px] text-gray-400 shrink-0">{t.due}</span>}
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Assets assigned to me" icon={Laptop} testid="staff-assets">
          {d.assets.length === 0 && <p className="text-sm text-gray-400 py-3">No assets assigned.</p>}
          <div className="divide-y divide-gray-100">
            {d.assets.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5 text-sm"><div><span className="font-semibold text-gray-800">{a.name}</span> <span className="text-xs text-gray-400 font-mono ml-1">{a.code}</span></div><span className="text-[11px] text-gray-400">{labelize(a.asset_type)}{a.next_maintenance_date ? ` · maint. ${a.next_maintenance_date}` : ""}</span></div>
            ))}
          </div>
        </Panel>
        <Panel title="My training" icon={GraduationCap} testid="staff-training">
          {d.training.length === 0 && <p className="text-sm text-gray-400 py-3">No courses assigned.</p>}
          <div className="divide-y divide-gray-100">
            {d.training.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 text-sm"><span className="text-gray-800">{t.course}</span><Badge variant="outline" className={`text-[10px] ${t.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{labelize(t.status || "assigned")}</Badge></div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="My recent activity" icon={Activity} testid="staff-activity">
        {d.activity.length === 0 && <p className="text-sm text-gray-400 py-3">No activity yet.</p>}
        <div className="divide-y divide-gray-100">
          {d.activity.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-gray-700 truncate">{labelize(a.action)}{a.entity_name ? ` — ${a.entity_name}` : ""}</span><span className="text-[11px] text-gray-400 shrink-0">{new Date(a.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, daysUntil } from "@/lib/api";
import { labelize, CHART_COLORS, ROLE_LABELS } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FolderKanban, IndianRupee, CalendarClock, ArrowRight } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const StatCard = ({ icon: Icon, label, value, sub, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-5 flex items-start gap-4">
      <div className="h-10 w-10 rounded-xl bg-[#FFF7ED] flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-[#F26B21]" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight">{value}</div>
        <div className="text-xs text-gray-500 font-medium">{label}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </CardContent>
  </Card>
);

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then((res) => setStats(res.data)).catch(() => {});
  }, []);

  if (!stats)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const isEmployee = user.role === "employee";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6 max-w-7xl" data-testid="dashboard-page">
      {/* Welcome */}
      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900" data-testid="welcome-heading">
              {greeting}, {user.name.split(" ")[0]}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              You're signed in as <span className="font-semibold text-[#F26B21]">{ROLE_LABELS[user.role]}</span>.
              {isEmployee ? " Here's a snapshot of your assigned projects." : " Here's what's happening at dotindot today."}
            </p>
          </div>
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] flex items-center justify-center text-white text-xl font-extrabold">
            {user.name[0]}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!isEmployee && (
          <StatCard icon={Users} label="Total Clients" value={stats.clients_total} sub={`${stats.clients_active} active`} testid="stat-clients" />
        )}
        <StatCard icon={FolderKanban} label={isEmployee ? "My Projects" : "Total Projects"} value={stats.projects_total} sub={`${stats.projects_active} in flight`} testid="stat-projects" />
        <StatCard icon={IndianRupee} label={isEmployee ? "My Project Budgets" : "Total Project Budgets"} value={formatINR(stats.total_budget)} testid="stat-budget" />
        {!isEmployee && (
          <StatCard icon={CalendarClock} label="Contracts expiring <30d" value={stats.expiring_contracts.length} testid="stat-expiring" />
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Projects by status</CardTitle>
          </CardHeader>
          <CardContent className="h-64" data-testid="chart-projects-status">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.projects_by_status.map((d) => ({ ...d, name: labelize(d.name) }))}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip cursor={{ fill: "#FFF7ED" }} />
                <Bar dataKey="value" fill="#F26B21" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {!isEmployee ? (
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Clients by status</CardTitle>
            </CardHeader>
            <CardContent className="h-64" data-testid="chart-clients-status">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.clients_by_status.map((d) => ({ ...d, name: labelize(d.name) }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {stats.clients_by_status.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Quick links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/projects" className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:border-orange-300 hover:bg-orange-50 transition-colors" data-testid="quicklink-projects">
                View my assigned projects <ArrowRight className="h-4 w-4 text-[#F26B21]" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Expiring contracts */}
      {!isEmployee && stats.expiring_contracts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40 shadow-sm" data-testid="expiring-contracts-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-600" /> Contracts expiring within 30 days
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.expiring_contracts.map((c, i) => (
              <Link
                key={i}
                to={`/clients/${c.client_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-200/70 px-4 py-2.5 hover:border-amber-400 transition-colors"
                data-testid={`expiring-contract-${i}`}
              >
                <div>
                  <span className="text-sm font-semibold text-gray-800">{c.client_name}</span>
                  <span className="text-sm text-gray-500 ml-2">{c.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{formatINR(c.value)}</span>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                    {daysUntil(c.expiry_date)}d left · {c.expiry_date}
                  </Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

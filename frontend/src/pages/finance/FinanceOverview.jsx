import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, ReceiptText, Repeat, PiggyBank, Cpu, Megaphone, TrendingUp, Users, IndianRupee, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const QUICK_LINKS = [
  { name: "Ledger", path: "/finance/ledger", icon: BookOpen, desc: "All income & expenses" },
  { name: "Expenses", path: "/finance/expenses", icon: ReceiptText, desc: "Approval workflow" },
  { name: "Subscriptions", path: "/finance/subscriptions", icon: Repeat, desc: "Recurring tools & renewals" },
  { name: "Budgets", path: "/finance/budgets", icon: PiggyBank, desc: "Actual vs planned" },
  { name: "AI Spend", path: "/finance/ai", icon: Cpu, desc: "AI tools sub-ledger" },
  { name: "Marketing", path: "/finance/marketing", icon: Megaphone, desc: "Campaign spend & ROI" },
  { name: "Project Profit", path: "/finance/profit", icon: TrendingUp, desc: "Margins per project" },
  { name: "Employee Revenue", path: "/finance/employees", icon: Users, desc: "Revenue per team member" },
];

const Stat = ({ label, value, tone, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-5">
      <div className={`text-2xl font-bold font-mono tracking-tight ${tone || "text-gray-900"}`}>{value}</div>
      <div className="text-xs text-gray-500 font-medium mt-0.5">{label}</div>
    </CardContent>
  </Card>
);

export default function FinanceOverview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/finance/overview").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data)
    return <FinanceLayout title="Overview"><div className="h-40 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div></FinanceLayout>;

  return (
    <FinanceLayout title="Overview" subtitle="Financial health of dotindot at a glance — all figures in ₹ INR.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Net this month" value={formatINR(data.net_this_month)} tone={data.net_this_month >= 0 ? "text-emerald-600" : "text-red-600"} testid="fin-stat-net-month" />
        <Stat label="Income YTD" value={formatINR(data.income_ytd)} testid="fin-stat-income-ytd" />
        <Stat label="Expenses YTD" value={formatINR(data.expense_ytd)} testid="fin-stat-expense-ytd" />
        <Stat label="Subscription burn / mo" value={formatINR(data.subscription_burn_monthly)} testid="fin-stat-burn" />
        <Card className={`shadow-sm ${data.pending_approvals ? "border-amber-300 bg-amber-50/50" : "border-gray-200/80"}`} data-testid="fin-stat-pending">
          <CardContent className="p-5">
            <div className="text-2xl font-bold font-mono text-gray-900 flex items-center gap-2">
              {data.pending_approvals}
              {data.pending_approvals > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            </div>
            <div className="text-xs text-gray-500 font-medium mt-0.5">Pending approvals</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><IndianRupee className="h-4 w-4 text-[#F26B21]" /> Income vs expense — last 6 months</CardTitle></CardHeader>
        <CardContent className="h-72" data-testid="fin-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.trend}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <Tooltip formatter={(v) => formatINR(v)} cursor={{ fill: "#FFF7ED" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Income" fill="#F26B21" radius={[5, 5, 0, 0]} maxBarSize={34} />
              <Bar dataKey="expense" name="Expense" fill="#94A3B8" radius={[5, 5, 0, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {QUICK_LINKS.map((q) => (
          <Link key={q.path} to={q.path} data-testid={`fin-quicklink-${q.name.toLowerCase().replace(/\s+/g, "-")}`}
            className="group rounded-xl border border-gray-200 bg-white p-4 hover:border-orange-300 hover:bg-orange-50/40 transition-colors">
            <q.icon className="h-5 w-5 text-[#F26B21] mb-2" />
            <div className="text-sm font-semibold text-gray-800 group-hover:text-[#F26B21]">{q.name}</div>
            <div className="text-[11px] text-gray-400">{q.desc}</div>
          </Link>
        ))}
      </div>
    </FinanceLayout>
  );
}

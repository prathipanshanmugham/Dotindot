// What an investor sees: their position, investments, returns, company snapshot and updates. Used by the investor portal
// and by the admin "preview as investor".
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, Pill, inr, inrShort, fmtDate } from "@/components/kit";
import { Wallet, TrendingUp, HandCoins, Percent, Users, Briefcase, Building2, Megaphone, Link2 } from "lucide-react";

export default function InvestorDashboardView({ d }) {
  const t = d.totals;
  const co = d.company || {};
  return (
    <div className="space-y-5" data-testid="investor-dashboard">
      {d.welcome && <p className="text-sm text-gray-600">{d.welcome}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Wallet} label="You invested" value={inr(t.invested)} testid="inv-invested" />
        <Stat icon={TrendingUp} label="Current value" value={inr(t.current_value)} sub={t.stake_percent ? `${t.stake_percent}% stake` : null} tone="green" testid="inv-current" />
        <Stat icon={HandCoins} label="Paid to you" value={inr(t.returns_paid + t.principal_back)} tone="blue" />
        <Stat icon={Percent} label="Overall" value={t.moic ? `${t.moic}×` : "—"} sub={t.xirr != null ? `${t.xirr}% a year` : null} tone="violet" />
      </div>
      {d.valuation && <p className="text-xs text-gray-500">Current value uses the company valuation of <b>{inr(d.valuation.valuation)}</b> dated {fmtDate(d.valuation.date)}{d.valuation.method ? ` (${d.valuation.method})` : ""}.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="border-gray-200/80 shadow-sm lg:col-span-3"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Your investments</CardTitle></CardHeader>
          <CardContent className="pt-0 overflow-x-auto"><table className="w-full text-sm" data-testid="inv-investments">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100"><th className="text-left py-2">Date</th><th className="text-left py-2">Type</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Terms</th><th className="text-right py-2">Value now</th></tr></thead>
            <tbody>{d.investments.map((x) => (
              <tr key={x.id} className="border-b border-gray-50 last:border-0"><td className="py-2 whitespace-nowrap">{fmtDate(x.date)}</td><td className="py-2">{x.instrument_label}{x.status !== "active" && <Pill className="ml-1">{x.status}</Pill>}</td>
                <td className="py-2 text-right font-mono">{inr(x.amount)}</td><td className="py-2 text-right text-gray-600">{x.stake_percent ? `${x.stake_percent}%` : x.interest_rate ? `${x.interest_rate}% p.a.` : "—"}</td>
                <td className="py-2 text-right font-mono font-semibold">{inr(x.current_value)}</td></tr>))}</tbody></table></CardContent></Card>
        <Card className="border-gray-200/80 shadow-sm lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Paid to you</CardTitle></CardHeader>
          <CardContent className="pt-0 max-h-72 overflow-y-auto">{d.returns.length === 0 ? <p className="text-sm text-gray-400">Nothing paid out yet.</p> : (
            <ul className="divide-y divide-gray-50" data-testid="inv-returns">{d.returns.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2 text-sm"><span><span className="text-gray-800">{r.kind_label}</span><span className="block text-xs text-gray-400">{fmtDate(r.date)}{r.tds ? ` · TDS ${inr(r.tds)}` : ""}</span></span><span className="font-mono">{inr(r.amount)}</span></li>))}</ul>
          )}</CardContent></Card>
      </div>
      {Object.keys(co).length > 0 && (
        <Card className="border-gray-200/80 shadow-sm" data-testid="inv-company"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">How {d.company_name || "the company"} is doing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {co.revenue_12m != null && <Stat icon={TrendingUp} label="Revenue, last 12 months" value={inrShort(co.revenue_12m)} />}
              {co.profit_12m != null && <Stat icon={Wallet} label="Profit, last 12 months" value={inrShort(co.profit_12m)} tone="green" />}
              {co.active_clients != null && <Stat icon={Building2} label="Active clients" value={co.active_clients} tone="blue" />}
              {co.team_size != null && <Stat icon={Users} label="Team" value={co.team_size} tone="violet" />}
              {co.projects_delivered != null && <Stat icon={Briefcase} label="Projects delivered" value={co.projects_delivered} sub={`${co.projects_active} running`} tone="amber" />}
              {co.pipeline_value != null && <Stat icon={TrendingUp} label="Sales pipeline" value={inrShort(co.pipeline_value)} tone="gray" />}
            </div>
            {co.monthly?.length > 0 && (
              <div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%">
                <LineChart data={co.monthly} margin={{ top: 6, right: 12, left: -6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={inrShort} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip formatter={(v, k) => [inr(v), k === "revenue" ? "Revenue" : "Profit"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend formatter={(k) => <span className="text-xs text-gray-600">{k === "revenue" ? "Revenue" : "Profit"}</span>} />
                  {co.monthly[0].revenue != null && <Line type="monotone" dataKey="revenue" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} />}
                  {co.monthly[0].profit != null && <Line type="monotone" dataKey="profit" stroke="#eb6834" strokeWidth={2} dot={{ r: 3 }} />}
                </LineChart></ResponsiveContainer></div>
            )}
          </CardContent></Card>
      )}
      <Card className="border-gray-200/80 shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4 text-[#F26B21]" /> Updates</CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-4" data-testid="inv-updates">{d.updates.length === 0 ? <p className="text-sm text-gray-400">No updates yet.</p> : d.updates.map((u) => (
          <div key={u.id} className="border-l-2 border-orange-200 pl-3"><div className="text-sm font-semibold text-gray-900">{u.title}</div><div className="text-xs text-gray-400 mb-1">{fmtDate(u.date)}{u.created_by_name ? ` · ${u.created_by_name}` : ""}</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{u.body}</p>
            {u.links?.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#F26B21] mr-3 mt-1"><Link2 className="h-3 w-3" />{l.title}</a>)}</div>))}</CardContent></Card>
      {d.contact && <p className="text-xs text-gray-400 text-center">Questions? {d.contact}</p>}
    </div>
  );
}

import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderKanban, CheckCircle2, Flag, Megaphone, TrendingUp, Target, Share2, IndianRupee, Download, CalendarDays, Users, FileSignature, Loader2 } from "lucide-react";

export const DEFAULT_PERIODS = [
  { value: "this_month", label: "This month" }, { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" }, { value: "last_6_months", label: "Last 6 months" },
  { value: "ytd", label: "Year to date" }, { value: "custom", label: "Custom range" },
];
const STATUS = {
  kickoff: ["Kick-off", "bg-sky-50 text-sky-700 border-sky-200"], in_progress: ["In progress", "bg-orange-50 text-[#F26B21] border-orange-200"],
  review: ["In review", "bg-violet-50 text-violet-700 border-violet-200"], on_hold: ["On hold", "bg-gray-100 text-gray-600 border-gray-200"],
  completed: ["Completed", "bg-emerald-50 text-emerald-700 border-emerald-200"],
};
const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const inrShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`;
  return `₹${v}`;
};
const fmtDate = (iso) => (iso ? new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const nice = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const Kpi = ({ icon: Icon, label, value, sub, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs font-medium"><Icon className="h-4 w-4 text-[#F26B21]" />{label}</div>
      <div className="mt-1.5 text-xl sm:text-2xl font-bold text-gray-900 font-mono tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </CardContent>
  </Card>
);

const Section = ({ title, icon: Icon, children, className = "", right, testid }) => (
  <Card className={`border-gray-200/80 shadow-sm ${className}`} data-testid={testid}>
    <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
      <CardTitle className="text-base font-semibold flex items-center gap-2">{Icon && <Icon className="h-4 w-4 text-[#F26B21]" />}{title}</CardTitle>
      {right}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);
const Empty = ({ children }) => <p className="text-sm text-gray-400 py-3">{children}</p>;

/** Period picker + PDF button. `value` = {period, start, end}. */
export function PeriodBar({ value, onChange, periods = DEFAULT_PERIODS, onDownload, downloading }) {
  const [draft, setDraft] = useState({ start: value.start || "", end: value.end || "" });
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2" data-testid="period-bar">
      <Select value={value.period} onValueChange={(v) => onChange(v === "custom" ? { period: v, start: draft.start, end: draft.end } : { period: v })}>
        <SelectTrigger className="sm:w-48 bg-white" data-testid="period-select"><CalendarDays className="h-4 w-4 mr-1.5 text-gray-400" /><SelectValue /></SelectTrigger>
        <SelectContent>{periods.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
      </Select>
      {value.period === "custom" && (
        <div className="flex items-center gap-2">
          <Input type="date" className="bg-white" value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} aria-label="From" data-testid="period-start" />
          <span className="text-gray-400 text-sm">to</span>
          <Input type="date" className="bg-white" value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} aria-label="To" data-testid="period-end" />
          <Button variant="outline" disabled={!draft.start || !draft.end} onClick={() => onChange({ period: "custom", ...draft })} data-testid="period-apply">Apply</Button>
        </div>
      )}
      {onDownload && (
        <Button className="sm:ml-auto bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={downloading} onClick={onDownload} data-testid="download-report-pdf">
          {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download PDF report
        </Button>
      )}
    </div>
  );
}

export default function ClientDashboardView({ data: d }) {
  const k = d.kpis;
  const hasAds = d.ads.campaigns.length > 0 || d.ads.monthly.some((m) => m.spend || m.revenue);
  const socialTotal = d.social.by_platform.reduce((a, b) => a + b.value, 0);
  return (
    <div className="space-y-4" data-testid="client-dashboard">
      <div className="text-xs text-gray-500" data-testid="period-label">
        Showing <span className="font-semibold text-gray-800">{d.period.label}</span> · {fmtDate(d.period.start)} – {fmtDate(d.period.end)}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="client-kpis">
        <Kpi icon={FolderKanban} label="Active projects" value={k.active_projects} sub={`${k.completed_projects} completed`} testid="kpi-active-projects" />
        <Kpi icon={CheckCircle2} label="Deliverables done" value={`${k.deliverables_done}/${k.deliverables_total}`} sub="across active projects" testid="kpi-deliverables" />
        <Kpi icon={Flag} label="Milestones" value={k.milestones_done} sub={`completed · ${k.milestones_upcoming} coming up`} testid="kpi-milestones" />
        <Kpi icon={IndianRupee} label="Payments received" value={inrShort(k.paid_in_period)} sub={`${inrShort(k.paid_ytd)} this year`} testid="kpi-payments" />
        {hasAds && <Kpi icon={Megaphone} label="Ad spend" value={inrShort(k.ad_spend)} sub={`${inrShort(k.ad_revenue)} revenue tracked`} testid="kpi-ad-spend" />}
        {hasAds && <Kpi icon={TrendingUp} label="ROAS" value={k.roas != null ? `${k.roas}x` : "—"} sub="revenue ÷ ad spend" testid="kpi-roas" />}
        {hasAds && <Kpi icon={Target} label="Conversions" value={Number(k.conversions).toLocaleString("en-IN")} testid="kpi-conversions" />}
        <Kpi icon={Share2} label="Posts published" value={k.posts_published} sub={k.posts_planned ? `${k.posts_planned} more scheduled` : null} testid="kpi-posts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Section title="Projects" icon={FolderKanban} className="lg:col-span-2" testid="client-projects">
          {d.projects.length === 0 ? <Empty>No projects yet.</Empty> : (
            <div className="space-y-3">
              {d.projects.map((p) => {
                const [label, cls] = STATUS[p.status] || [nice(p.status), "bg-gray-100 text-gray-600 border-gray-200"];
                return (
                  <div key={p.id} className="rounded-xl border border-gray-100 p-3" data-testid={`client-project-${p.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">{p.name}</div>
                        <div className="text-xs text-gray-500">{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</div>
                      </div>
                      <Badge variant="outline" className={`${cls} text-[11px] shrink-0`}>{label}</Badge>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[#F26B21] to-[#FBA834]" style={{ width: `${p.progress}%` }} /></div>
                      <span className="text-xs font-semibold text-gray-700 font-mono w-10 text-right">{p.progress}%</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-gray-500">
                      <span>{p.deliverables_done} of {p.deliverables_total} deliverables</span>
                      {p.next_milestone && <span>Next: <span className="text-gray-800 font-medium">{p.next_milestone.title}</span>{p.next_milestone.due_date ? ` · ${fmtDate(p.next_milestone.due_date)}` : ""}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
        <Section title="Coming up" icon={Flag} testid="client-upcoming">
          {d.milestones_upcoming.length === 0 ? <Empty>No milestones due in the next 45 days.</Empty> : (
            <ul className="space-y-2.5">
              {d.milestones_upcoming.map((m, i) => (
                <li key={i} className="flex gap-3">
                  <div className={`w-12 shrink-0 rounded-lg text-center py-1 ${m.overdue ? "bg-red-50 text-red-700" : "bg-orange-50 text-[#F26B21]"}`}>
                    <div className="text-[10px] font-bold uppercase">{new Date(m.due_date + "T00:00:00").toLocaleDateString("en-IN", { month: "short" })}</div>
                    <div className="text-base font-bold leading-none">{new Date(m.due_date + "T00:00:00").getDate()}</div>
                  </div>
                  <div className="min-w-0"><div className="text-sm font-medium text-gray-900">{m.title}</div><div className="text-xs text-gray-500 truncate">{m.project}{m.overdue ? " · overdue" : ""}</div></div>
                </li>
              ))}
            </ul>
          )}
          {d.milestones_done.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Completed this period</div>
              <ul className="space-y-1">{d.milestones_done.map((m, i) => <li key={i} className="text-xs text-gray-600 flex gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-px" />{m.title} <span className="text-gray-400">· {m.project}</span></li>)}</ul>
            </div>
          )}
        </Section>
      </div>

      {hasAds && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Section title="Ad spend vs revenue" icon={Megaphone} className="lg:col-span-2" testid="client-ads-chart">
            <div className="h-56 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.ads.monthly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={inrShort} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip formatter={(v) => inr(v)} cursor={{ fill: "#FFF7ED" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="spend" name="Spend" fill="#F26B21" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
          <Section title="Campaigns" className="lg:col-span-3" testid="client-campaigns">
            {d.ads.campaigns.length === 0 ? <Empty>No campaign activity in this period.</Empty> : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-gray-500 text-left"><th className="px-2 py-1.5 font-medium">Campaign</th><th className="px-2 py-1.5 font-medium text-right">Spend</th><th className="px-2 py-1.5 font-medium text-right">Revenue</th><th className="px-2 py-1.5 font-medium text-right">ROAS</th><th className="px-2 py-1.5 font-medium text-right hidden sm:table-cell">Conv.</th></tr></thead>
                  <tbody>
                    {d.ads.campaigns.map((c, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-2"><div className="font-medium text-gray-900">{c.name}</div><div className="text-xs text-gray-500">{nice(c.platform)} · {nice(c.status)}</div></td>
                        <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{inr(c.spend)}</td>
                        <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{inr(c.revenue)}</td>
                        <td className={`px-2 py-2 text-right font-mono font-semibold ${c.roas >= 2 ? "text-emerald-700" : c.roas != null && c.roas < 1 ? "text-red-600" : "text-gray-800"}`}>{c.roas != null ? `${c.roas}x` : "—"}</td>
                        <td className="px-2 py-2 text-right font-mono hidden sm:table-cell">{c.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Social media" icon={Share2} testid="client-social">
          {socialTotal === 0 && d.social.upcoming.length === 0 ? <Empty>No social posts in this period.</Empty> : (
            <>
              {socialTotal > 0 && (
                <div className="space-y-2 mb-3">
                  {d.social.by_platform.map((p) => (
                    <div key={p.name} className="flex items-center gap-3 text-sm">
                      <span className="w-24 text-gray-700">{nice(p.name)}</span>
                      <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-pink-500" style={{ width: `${(100 * p.value) / socialTotal}%` }} /></div>
                      <span className="w-8 text-right font-mono text-xs text-gray-700">{p.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {d.social.upcoming.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Scheduled next 2 weeks</div>
                  <ul className="space-y-1.5">{d.social.upcoming.map((x, i) => (
                    <li key={i} className="text-xs flex gap-2"><span className="w-16 shrink-0 text-gray-500">{fmtDate(x.date).replace(/ \d{4}$/, "")}</span><span className="font-medium text-gray-700 w-20 shrink-0">{nice(x.platform)}</span><span className="text-gray-600 truncate">{x.caption || nice(x.content_type)}</span></li>
                  ))}</ul>
                </div>
              )}
            </>
          )}
        </Section>
        <Section title="Payments" icon={IndianRupee} testid="client-payments" right={<span className="text-xs text-gray-500">Total <span className="font-semibold text-gray-900 font-mono">{inr(k.paid_in_period)}</span></span>}>
          {d.payments.length === 0 ? <Empty>No payments recorded in this period.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {d.payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0"><div className="text-gray-900 truncate">{p.description || "Payment"}</div><div className="text-xs text-gray-500">{fmtDate(p.date)}{p.invoice_ref ? ` · ${p.invoice_ref}` : ""}</div></div>
                  <span className="font-mono font-semibold text-gray-900 whitespace-nowrap">{inr(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Agreements" icon={FileSignature} testid="client-contracts">
          {d.contracts.length === 0 ? <Empty>No agreements on file.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {d.contracts.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0"><div className="font-medium text-gray-900 truncate">{c.title}</div><div className="text-xs text-gray-500">{fmtDate(c.start_date)} → {fmtDate(c.expiry_date)}</div></div>
                  <Badge variant="outline" className={c.status === "expired" ? "bg-gray-100 text-gray-500" : c.days_left != null && c.days_left <= 30 ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                    {c.status === "expired" ? "Expired" : c.days_left != null && c.days_left <= 30 ? `Renews in ${c.days_left}d` : "Active"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Your dotindot team" icon={Users} testid="client-team">
          {d.team.length === 0 ? <Empty>Team will appear once a project starts.</Empty> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {d.team.map((t, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-2.5 py-2">
                  <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#F26B21] to-[#FBA834] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{t.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                  <div className="min-w-0"><div className="text-sm font-medium text-gray-900 truncate">{t.name}</div><div className="text-xs text-gray-500 truncate">{t.role}</div></div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/** Reads the filename + error text from a blob response. */
export const blobErrorText = async (e) => {
  try { const t = await e.response.data.text(); return JSON.parse(t).detail || t; } catch { return e?.message || "Download failed"; }
};

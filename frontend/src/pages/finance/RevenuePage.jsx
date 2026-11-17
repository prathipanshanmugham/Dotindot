// Finance → MRR & ARR. Recurring revenue from projects billed every month / quarter / year (backend: routes_revenue.py).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import { BranchFilter } from "@/components/BranchFilter";
import { Spinner, Empty, Pill, fmtDate, monthLabel, inrShort } from "@/components/kit";
import { rupees } from "@/lib/revenue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Repeat, FileText, CalendarClock, ArrowUpRight, ArrowDownRight, Minus, ChevronRight } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";

const ORANGE = "#F26B21";
const GAINED = "#2a78d6";   // diverging pair (validated): gained above zero, lost below
const LOST = "#e34948";
const AXIS = { fontSize: 11, fill: "#6B7280" };
const short = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs space-y-0.5">
      <div className="font-semibold text-gray-900">{monthLabel(label)}</div>
      <div className="text-gray-700">MRR <span className="font-mono font-semibold">{rupees(r.mrr)}</span> · {r.clients} client{r.clients === 1 ? "" : "s"}</div>
      {r.new > 0 && <div className="text-gray-600">New <span className="font-mono">+{rupees(r.new)}</span></div>}
      {r.expansion > 0 && <div className="text-gray-600">Grew <span className="font-mono">+{rupees(r.expansion)}</span></div>}
      {r.contraction > 0 && <div className="text-gray-600">Shrank <span className="font-mono">−{rupees(r.contraction)}</span></div>}
      {r.churn > 0 && <div className="text-gray-600">Lost <span className="font-mono">−{rupees(r.churn)}</span></div>}
    </div>
  );
};

const Bars = ({ rows, total, testid, link }) => (
  <div className="space-y-2.5" data-testid={testid}>
    {rows.map((r) => {
      const pct = total ? Math.max(2, (r.mrr / total) * 100) : 0;
      const label = <span className="text-sm font-medium text-gray-800 truncate">{r.label}</span>;
      return (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-3">
            {link && r.href ? <Link to={r.href} className="min-w-0 truncate hover:text-[#F26B21]">{label}</Link> : label}
            <span className="text-sm font-mono text-gray-900 shrink-0">{rupees(r.mrr)}<span className="text-gray-400 text-xs"> /mo</span></span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: ORANGE }} /></div>
          {r.sub && <div className="text-[11px] text-gray-400 mt-0.5">{r.sub}</div>}
        </div>
      );
    })}
  </div>
);

const Move = ({ label, value, sign }) => (
  <div className="flex items-center justify-between py-1.5 text-sm">
    <span className="text-gray-600 flex items-center gap-1.5">
      {sign > 0 ? <ArrowUpRight className="h-3.5 w-3.5" style={{ color: GAINED }} /> : sign < 0 ? <ArrowDownRight className="h-3.5 w-3.5" style={{ color: LOST }} /> : <Minus className="h-3.5 w-3.5 text-gray-400" />}
      {label}
    </span>
    <span className="font-mono text-gray-900">{sign > 0 ? "+" : sign < 0 ? "−" : ""}{rupees(value)}</span>
  </div>
);

export default function RevenuePage() {
  const [branch, setBranch] = useState("all");
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const load = () => api.get("/revenue/summary", { params: branch !== "all" ? { branch } : {} }).then((r) => setD(r.data)).catch((e) => toast.error(apiError(e)));
  useEffect(() => { setD(null); load(); }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/revenue/draft-invoices", {});
      toast.success(data.message);
      data.skipped.filter((s) => !s.reason.startsWith("Already")).forEach((s) => toast.error(`${s.client} · ${s.project}: ${s.reason}`));
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const head = (
    <FinanceLayout title="MRR & ARR" subtitle="Money that comes in every month from recurring projects — retainers, social media, maintenance."
      actions={<BranchFilter value={branch} onChange={setBranch} testid="revenue-branch" />}>
      {!d ? <Spinner /> : null}
    </FinanceLayout>
  );
  if (!d) return head;

  const tm = d.this_month || { new: 0, expansion: 0, contraction: 0, churn: 0, net: 0 };
  const start = d.mrr - tm.net;
  const trend = d.trend.map((t) => ({ ...t, gained: t.new + t.expansion, lost: -(t.churn + t.contraction) }));
  const hasHistory = trend.some((t) => t.mrr > 0);

  return (
    <FinanceLayout title="MRR & ARR" subtitle="Money that comes in every month from recurring projects — retainers, social media, maintenance."
      actions={<BranchFilter value={branch} onChange={setBranch} testid="revenue-branch" />}>
      <div className="space-y-4" data-testid="revenue-page">
        {/* headline */}
        <Card className="border-gray-200/80 shadow-sm">
          <CardContent className="p-5 sm:p-6 grid gap-5 lg:grid-cols-[1.2fr_2fr] items-center">
            <div>
              <div className="text-sm text-gray-500">MRR today</div>
              <div className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 font-mono mt-1" data-testid="revenue-mrr">{rupees(d.mrr)}</div>
              <div className="text-sm text-gray-600 mt-1.5">
                ARR <span className="font-mono font-semibold text-gray-900" data-testid="revenue-arr">{rupees(d.arr)}</span>
                {tm.net !== 0 && <span className="ml-2 inline-flex items-center gap-0.5 font-medium" style={{ color: tm.net > 0 ? GAINED : LOST }}>
                  {tm.net > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}{tm.net > 0 ? "+" : "−"}{rupees(Math.abs(tm.net))} this month</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["Recurring clients", d.recurring_clients, null], ["Recurring projects", d.recurring_projects, null],
                ["Average per client", rupees(d.arpa), "a month"], ["Paused (on hold)", rupees(d.paused_mrr), "a month"]].map(([l, v, s]) => (
                <div key={l} className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
                  <div className="text-lg font-bold font-mono text-gray-900 leading-tight">{v}</div>
                  <div className="text-xs text-gray-500">{l}{s && <span className="text-gray-400"> · {s}</span>}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {d.mrr === 0 && !hasHistory ? (
          <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-6">
            <Empty icon={Repeat} title="No recurring projects yet" sub="Open a project, choose Edit → Billing & dates → Recurring, and add the monthly (or quarterly, yearly) amount. MRR starts showing here straight away."
              action={<Button asChild variant="outline" size="sm"><Link to="/projects">Go to projects</Link></Button>} />
          </CardContent></Card>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-gray-200/80 shadow-sm lg:col-span-2">
                <CardHeader className="pb-1 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-semibold text-gray-700">MRR, last 12 months</CardTitle>
                  <button type="button" className="text-xs font-medium text-gray-500 hover:text-[#F26B21]" onClick={() => setShowTable((x) => !x)} data-testid="revenue-table-toggle">{showTable ? "Show chart" : "Show as table"}</button>
                </CardHeader>
                <CardContent>
                  {showTable ? (
                    <div className="overflow-x-auto" data-testid="revenue-table">
                      <table className="w-full text-sm">
                        <thead><tr className="text-xs text-gray-500 border-b border-gray-100"><th className="text-left font-medium py-2">Month</th><th className="text-right font-medium">MRR</th><th className="text-right font-medium">New</th><th className="text-right font-medium">Grew</th><th className="text-right font-medium">Shrank</th><th className="text-right font-medium">Lost</th><th className="text-right font-medium">Clients</th></tr></thead>
                        <tbody>{[...d.trend].reverse().map((t) => (
                          <tr key={t.month} className="border-b border-gray-50 last:border-0 font-mono">
                            <td className="py-1.5 font-sans text-gray-700">{monthLabel(t.month)}</td><td className="text-right text-gray-900">{rupees(t.mrr)}</td>
                            <td className="text-right text-gray-600">{t.new ? `+${rupees(t.new)}` : "—"}</td><td className="text-right text-gray-600">{t.expansion ? `+${rupees(t.expansion)}` : "—"}</td>
                            <td className="text-right text-gray-600">{t.contraction ? `−${rupees(t.contraction)}` : "—"}</td><td className="text-right text-gray-600">{t.churn ? `−${rupees(t.churn)}` : "—"}</td>
                            <td className="text-right text-gray-600">{t.clients}</td>
                          </tr>))}</tbody>
                      </table>
                    </div>
                  ) : (
                    <>
                      <div className="h-56" data-testid="revenue-trend">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                            <defs><linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity={0.18} /><stop offset="100%" stopColor={ORANGE} stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid vertical={false} stroke="#F3F4F6" />
                            <XAxis dataKey="month" tickFormatter={short} tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                            <YAxis tickFormatter={inrShort} tick={AXIS} axisLine={false} tickLine={false} width={56} />
                            <Tooltip content={<Tip />} cursor={{ stroke: "#D1D5DB", strokeWidth: 1 }} />
                            <Area type="monotone" dataKey="mrr" stroke={ORANGE} strokeWidth={2} fill="url(#mrrFill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} name="MRR" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="h-36 mt-2" data-testid="revenue-movement">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={trend} stackOffset="sign" barCategoryGap={2} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <XAxis dataKey="month" tickFormatter={short} tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                            <YAxis tickFormatter={(v) => inrShort(Math.abs(v))} tick={AXIS} axisLine={false} tickLine={false} width={56} />
                            <ReferenceLine y={0} stroke="#D1D5DB" />
                            <Tooltip content={<Tip />} cursor={{ fill: "#F9FAFB" }} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="gained" name="Gained (new + grew)" stackId="m" fill={GAINED} radius={[4, 4, 0, 0]} maxBarSize={28} />
                            <Bar dataKey="lost" name="Lost (shrank + left)" stackId="m" fill={LOST} radius={[0, 0, 4, 4]} maxBarSize={28} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="border-gray-200/80 shadow-sm">
                <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold text-gray-700">{monthLabel(d.month)} so far</CardTitle></CardHeader>
                <CardContent className="divide-y divide-gray-100" data-testid="revenue-this-month">
                  <div className="flex items-center justify-between py-1.5 text-sm"><span className="text-gray-600">MRR at the start</span><span className="font-mono text-gray-900">{rupees(start)}</span></div>
                  <Move label="New clients" value={tm.new} sign={tm.new ? 1 : 0} />
                  <Move label="Existing clients grew" value={tm.expansion} sign={tm.expansion ? 1 : 0} />
                  <Move label="Existing clients shrank" value={tm.contraction} sign={tm.contraction ? -1 : 0} />
                  <Move label="Clients left" value={tm.churn} sign={tm.churn ? -1 : 0} />
                  <div className="flex items-center justify-between pt-2 text-sm font-semibold"><span className="text-gray-900">MRR now</span><span className="font-mono text-gray-900">{rupees(d.mrr)}</span></div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-gray-200/80 shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">MRR by client</CardTitle></CardHeader>
                <CardContent>
                  {d.by_client.length === 0 ? <p className="text-sm text-gray-400">No recurring clients this month.</p> : (
                    <Bars testid="revenue-by-client" link total={d.mrr} rows={d.by_client.map((c) => ({ key: c.client_id, label: c.name, mrr: c.mrr, href: `/clients/${c.client_id}`,
                      sub: `${c.share}% of MRR · ${c.projects} project${c.projects === 1 ? "" : "s"}${c.since ? ` · since ${fmtDate(c.since, { month: "short", year: "numeric" })}` : ""}` }))} />
                  )}
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card className="border-gray-200/80 shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">MRR by service</CardTitle></CardHeader>
                  <CardContent>
                    {d.by_service.length === 0 ? <p className="text-sm text-gray-400">Nothing yet.</p> :
                      <Bars testid="revenue-by-service" total={d.mrr} rows={d.by_service.map((s) => ({ key: s.service, label: s.label, mrr: s.mrr }))} />}
                  </CardContent>
                </Card>
                {d.by_branch.length > 1 && (
                  <Card className="border-gray-200/80 shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">MRR by branch</CardTitle></CardHeader>
                    <CardContent><Bars testid="revenue-by-branch" total={d.mrr} rows={d.by_branch.map((b) => ({ key: b.branch_id || "none", label: b.name, mrr: b.mrr }))} /></CardContent>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}

        {/* bills */}
        <Card className="border-gray-200/80 shadow-sm">
          <CardHeader className="pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><FileText className="h-4 w-4 text-[#F26B21]" />Recurring bills in {monthLabel(d.month)}</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">{d.bills.length} bill{d.bills.length === 1 ? "" : "s"} · {rupees(d.bills_total)} before GST · {d.bills_open} not invoiced yet</p>
            </div>
            {d.can_draft && d.bills_open > 0 && (
              <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" disabled={busy} onClick={draft} data-testid="revenue-draft">
                Draft {d.bills_open} invoice{d.bills_open === 1 ? "" : "s"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {d.bills.length === 0 ? <p className="text-sm text-gray-400 py-2">No recurring bills fall in this month.</p> : (
              <div className="divide-y divide-gray-100" data-testid="revenue-bills">
                {d.bills.map((b) => (
                  <div key={`${b.project_id}-${b.bill_date}`} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <Link to={`/clients/${b.client_id}`} className="text-sm font-semibold text-gray-900 hover:text-[#F26B21]">{b.client}</Link>
                      <div className="text-xs text-gray-500 truncate"><Link to={`/projects/${b.project_id}`} className="hover:text-[#F26B21]">{b.project}</Link> · {b.period}</div>
                    </div>
                    <div className="flex items-center gap-3 sm:justify-end">
                      <span className="text-xs text-gray-500">{fmtDate(b.bill_date, { day: "numeric", month: "short" })}</span>
                      <span className="font-mono text-sm text-gray-900 sm:w-28 text-right">{rupees(b.amount)}</span>
                      <span className="sm:w-48 flex sm:justify-end">{b.invoice ? <Link to={`/finance/billing/${b.invoice.id}`}><Pill tone={b.invoice.status === "paid" ? "green" : b.invoice.status === "draft" ? "gray" : "blue"}>{b.invoice.number} · {b.invoice.status.replace("_", " ")}</Pill></Link>
                        : <Pill tone="amber">Not invoiced</Pill>}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!d.can_draft && d.bills_open > 0 && <p className="text-xs text-gray-400 mt-2">Someone with Billing access can draft these invoices.</p>}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#F26B21]" />Next month's bills</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {d.next_bills.length === 0 ? <p className="text-sm text-gray-400">None.</p> : (
                <>
                  <div className="space-y-1.5" data-testid="revenue-next-bills">
                    {d.next_bills.slice(0, 8).map((b) => (
                      <div key={`${b.project_id}-${b.bill_date}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-gray-700">{b.client}</span><span className="font-mono text-gray-900 shrink-0">{rupees(b.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">{d.next_bills.length} bills · {rupees(d.next_bills_total)} before GST</div>
                </>
              )}
            </CardContent>
          </Card>
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">Contracts ending in 90 days</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {d.renewals.length === 0 ? <p className="text-sm text-gray-400">None — no recurring contract ends soon.</p> : (
                <div className="space-y-2" data-testid="revenue-renewals">
                  {d.renewals.map((r) => (
                    <Link key={r.project_id} to={`/projects/${r.project_id}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:border-orange-200">
                      <div className="min-w-0"><div className="text-sm font-medium text-gray-800 truncate">{r.client}</div><div className="text-[11px] text-gray-500 truncate">{r.project} · ends {fmtDate(r.end_date)}</div></div>
                      <Pill tone={r.days_left <= 30 ? "amber" : "gray"}>{r.days_left}d</Pill>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">One-time projects</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-3" data-testid="revenue-one-time">
              <div><div className="text-xl font-bold font-mono text-gray-900">{rupees(d.one_time.active_value)}</div><div className="text-xs text-gray-500">In progress across {d.one_time.active_projects} project{d.one_time.active_projects === 1 ? "" : "s"}</div></div>
              <div><div className="text-xl font-bold font-mono text-gray-900">{rupees(d.one_time.booked_this_fy)}</div><div className="text-xs text-gray-500">Started this financial year (since {fmtDate(d.one_time.fy_start, { month: "short", year: "numeric" })})</div></div>
              <Link to="/projects?billing=one_time" className="text-xs font-semibold text-[#F26B21] inline-flex items-center gap-0.5">See one-time projects <ChevronRight className="h-3.5 w-3.5" /></Link>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-gray-400">MRR counts recurring projects live on the last day of each month (today for this month), turned into a monthly amount — a quarterly fee ÷ 3, a yearly fee ÷ 12. Projects on hold are paused. ARR = MRR × 12. Amounts are before GST.</p>
      </div>
    </FinanceLayout>
  );
}

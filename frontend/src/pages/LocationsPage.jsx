// Locations — where Dotindot works: each of our locations side by side, India on a map, everything abroad by country.
// Backend: GET /locations/insights (routes_location_insights.py) — one call, scoped to the viewer's locations.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BranchFilter, useBranchOptions } from "@/components/BranchFilter";
import { PageHead, PillTabs, Stat, Spinner, Pill, inrShort, monthLabel } from "@/components/kit";
import { ChartCard, TipBox, LegendRow, SERIES, BRAND, AXIS, GRID } from "@/components/ChartCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, UserCheck, Briefcase, Repeat, TrendingUp, Globe2, MapPin, Crown, Plus, Target } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import IndiaMap from "@/pages/locations/IndiaMap";
import LocationManager from "@/pages/locations/LocationManager";

const STATUS = [["kickoff", "Kickoff"], ["in_progress", "In progress"], ["review", "In review"], ["on_hold", "On hold"], ["completed", "Completed"]];
const BAND = { strong: ["green", "Strong"], steady: ["amber", "Steady"], attention: ["red", "Needs attention"] };
const shortMonth = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" });
const cut = (s, n = 14) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

const useNarrow = () => {
  const [narrow, setNarrow] = useState(typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 640);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
};

/** Horizontal bars, one row per item; several series sit side by side (same unit, one axis). */
const HBars = ({ rows, series, money, testid, narrow }) => {
  const h = Math.max(140, rows.length * (series.length > 1 ? 18 * series.length + 14 : 34) + 36);
  const fmt = money ? inrShort : (v) => v;
  return (
    <div data-testid={testid}>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barCategoryGap={series.length > 1 ? 8 : 10} barGap={2}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmt} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={narrow ? 92 : 132} tickFormatter={(v) => cut(v, narrow ? 12 : 18)} />
            <Tooltip cursor={{ fill: "#F9FAFB" }} content={({ active, payload, label }) => active && payload?.length ? (
              <TipBox title={label} items={series.map((s) => ({ label: s.label, color: s.color, value: fmt(payload[0].payload[s.key] || 0) }))} />
            ) : null} />
            {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[0, 4, 4, 0]} maxBarSize={18} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {series.length > 1 && <LegendRow items={series} />}
    </div>
  );
};

/** Tiny income line for a card (plain SVG so it always stays inside its box). */
const Spark = ({ values, label }) => {
  const W = 112, H = 36, P = 3;
  const max = Math.max(...values, 0);
  if (!values.length || max <= 0) return <div className="h-9 w-28 flex items-center justify-end text-[10px] text-gray-400 shrink-0">no income yet</div>;
  const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, values.length - 1);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" role="img" aria-label={label}>
      <title>{label}</title>
      <polyline points={pts} fill="none" stroke={BRAND} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill={BRAND} />
    </svg>
  );
};

/** A location at a glance. */
const LocationCard = ({ l, money, color }) => (
  <Card className="border-gray-200/80 shadow-sm min-w-0" data-testid={`loc-card-${l.id}`}>
    <CardContent className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} aria-hidden />
            <span className="font-semibold text-gray-900 truncate">{l.name}</span></div>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 truncate">
            {l.country === "India" ? <MapPin className="h-3 w-3 shrink-0" /> : <Globe2 className="h-3 w-3 shrink-0" />}
            {[l.city, l.country !== "India" ? l.country : null].filter(Boolean).join(", ") || "—"}
            {l.status !== "active" && <span className="text-gray-400"> · inactive</span>}
          </div>
          <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-1 truncate"><Crown className="h-3 w-3 text-[#F26B21] shrink-0" />{l.ceo || <span className="text-gray-400">No Location CEO yet</span>}</div>
        </div>
        {l.score != null ? (
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold text-gray-900 leading-none">{l.score}<span className="text-xs text-gray-400 font-medium">/100</span></div>
            <Pill tone={BAND[l.band]?.[0]} className="mt-1">{BAND[l.band]?.[1]}</Pill>
          </div>
        ) : <span className="text-[11px] text-gray-400 shrink-0">No score yet</span>}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[["Clients", l.clients], ["Team", l.team], ["Projects", l.projects_active], ["Leads", l.leads_open]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-gray-50 py-2"><div className="text-base font-semibold text-gray-900">{v}</div><div className="text-[10px] text-gray-500">{k}</div></div>
        ))}
      </div>
      {money && (
        <div className="flex items-end justify-between gap-3">
          <div className="text-xs text-gray-600 space-y-0.5 min-w-0">
            <div>MRR <span className="font-mono font-semibold text-gray-900">{inrShort(l.mrr)}</span></div>
            <div>Income, 6 mo <span className="font-mono font-semibold text-gray-900">{inrShort(l.revenue_6m)}</span></div>
          </div>
          <Spark values={(l.trend || []).map((t) => t.income)} label={`Income by month for ${l.name}, last 6 months: ${(l.trend || []).map((t) => `${shortMonth(t.month)} ${inrShort(t.income)}`).join(", ")}`} />
        </div>
      )}
    </CardContent>
  </Card>
);

export default function LocationsPage() {
  const { user } = useAuth();
  const narrow = useNarrow();
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") || "overview";
  const setTab = (t) => setSearch(t === "overview" ? {} : { tab: t }, { replace: true });
  const [branch, setBranch] = useState("all");
  const [d, setD] = useState(null);
  const [failed, setFailed] = useState(false);
  const [newSignal, setNewSignal] = useState(0);
  const isAdmin = ["super_admin", "admin"].includes(user?.role);
  const all = useBranchOptions();

  const load = useCallback(() => {
    api.get("/locations/insights", { params: branch !== "all" ? { branch } : {} }).then((r) => { setD(r.data); setFailed(false); }).catch(() => setFailed(true));
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  // colour follows the location (its place in the full, name-sorted list), never its rank in a chart
  const colorOf = useMemo(() => {
    const ids = [...all].sort((a, b) => a.name.localeCompare(b.name)).map((b) => b.id);
    return (id) => SERIES[Math.max(0, ids.indexOf(id)) % SERIES.length];
  }, [all]);

  const charts = useMemo(() => {
    if (!d) return null;
    const locs = d.locations;
    // income trend: up to 7 locations by name plus "Other" so there are never more than 8 lines
    let shown = locs;
    let other = null;
    if (d.money && locs.length > 8) {
      shown = [...locs].sort((a, b) => b.revenue_6m - a.revenue_6m).slice(0, 7);
      const rest = locs.filter((l) => !shown.includes(l));
      other = d.months.map((m, i) => rest.reduce((a, l) => a + (l.trend?.[i]?.income || 0), 0));
    }
    const trend = d.money ? d.months.map((m, i) => {
      const row = { month: m };
      shown.forEach((l) => { row[l.id] = l.trend?.[i]?.income || 0; });
      if (other) row.__other = other[i];
      return row;
    }) : [];
    const lines = [...shown.map((l) => ({ key: l.id, label: l.name, color: colorOf(l.id) })), ...(other ? [{ key: "__other", label: "Other locations", color: "#9CA3AF" }] : [])];
    const byLoc = locs.map((l) => ({ label: l.name, id: l.id, clients: l.clients, team: l.team, leads_open: l.leads_open, mrr: l.mrr || 0,
      pipeline: l.pipeline_value || 0, ...Object.fromEntries(STATUS.map(([k]) => [k, l.projects_by_status?.[k] || 0])) }));
    const states = d.india.states.filter((s) => s.clients || s.team || s.leads).slice(0, 12).map((s) => ({ label: s.state, ...s }));
    const countries = d.abroad.map((c) => ({ label: c.country, clients: c.clients.length, team: c.team, leads: c.leads, locations: c.locations.length }));
    return { trend, lines, byLoc, states, countries };
  }, [d, colorOf]);

  if (failed && !d) return <p className="text-sm text-gray-500 py-10 text-center">Couldn't load locations. Check your connection and try again.</p>;
  if (!d) return <Spinner />;
  const k = d.kpis;
  const money = d.money;
  const tabs = [["overview", "Overview"], ["india", "India map", k.india_cities], ["abroad", "Outside India", k.countries_abroad], ["manage", "Manage", d.locations.length]];

  return (
    <div className="space-y-5 max-w-7xl min-w-0" data-testid="locations-page">
      <PageHead title="Locations"
        sub={`${k.locations} location${k.locations === 1 ? "" : "s"} · ${k.india_cities} ${k.india_cities === 1 ? "city" : "cities"} in India · ${k.countries_abroad} ${k.countries_abroad === 1 ? "country" : "countries"} abroad`}
        actions={<>
          {all.length > 1 && <BranchFilter value={branch} onChange={setBranch} testid="map-branch-filter" className="w-[170px] sm:w-[190px]" />}
          {isAdmin && <Button onClick={() => { setTab("manage"); setNewSignal((n) => n + 1); }} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="locations-add">
            <Plus className="h-4 w-4 mr-1.5" /> Add location</Button>}
        </>} />

      <PillTabs tabs={tabs} value={tab} onChange={setTab} testid="locations-tabs" />

      {tab === "overview" && (
        <div className="space-y-5" data-testid="locations-overview">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="locations-kpis">
            <Stat icon={Building2} label="Locations" sub={k.locations_abroad ? `${k.locations_abroad} abroad` : null} value={k.locations} tone="gray" testid="kpi-locations" />
            <Stat icon={Users} label="Clients" sub={`${k.clients_india} India · ${k.clients_abroad} abroad`} value={k.clients} testid="kpi-clients" />
            <Stat icon={UserCheck} label="Team" value={k.team} tone="blue" testid="kpi-team" />
            <Stat icon={Briefcase} label="Active projects" value={k.projects_active} tone="violet" testid="kpi-projects" />
            {money ? <>
              <Stat icon={Repeat} label="MRR" sub="all locations" value={inrShort(k.mrr)} tone="green" testid="kpi-mrr" />
              <Stat icon={TrendingUp} label="Income, 6 months" value={inrShort(k.revenue_6m)} tone="orange" testid="kpi-income" />
            </> : <>
              <Stat icon={MapPin} label="States in India" value={k.india_states} tone="green" />
              <Stat icon={Globe2} label="Countries abroad" value={k.countries_abroad} tone="amber" />
            </>}
          </div>

          {d.locations.length === 0 ? (
            <Card className="border-gray-200/80"><CardContent className="p-6 text-sm text-gray-500">No locations yet.{isAdmin && <> <button type="button" className="font-semibold text-[#F26B21]" onClick={() => { setTab("manage"); setNewSignal((n) => n + 1); }}>Add your first location</button>.</>}</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="location-cards">
              {d.locations.map((l) => <LocationCard key={l.id} l={l} money={money} color={colorOf(l.id)} />)}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {money && (
              <ChartCard title="Income by location" sub="Last 6 months, from the ledger" testid="chart-income-trend" className="lg:col-span-2"
                rows={charts.trend} columns={[{ key: "month", label: "Month", format: (v) => monthLabel(v) }, ...charts.lines.map((s) => ({ key: s.key, label: s.label, format: inrShort }))]}>
                <div className="h-60 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={charts.trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis dataKey="month" tickFormatter={shortMonth} tick={AXIS} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={inrShort} tick={AXIS} axisLine={false} tickLine={false} width={narrow ? 44 : 56} />
                      <Tooltip cursor={{ stroke: "#D1D5DB" }} content={({ active, payload, label }) => active && payload?.length ? (
                        <TipBox title={monthLabel(label)} items={charts.lines.map((s) => ({ label: s.label, color: s.color, value: inrShort(payload[0].payload[s.key] || 0) }))} />
                      ) : null} />
                      {charts.lines.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: s.color }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {charts.lines.length > 1 && <LegendRow items={charts.lines} />}
              </ChartCard>
            )}

            <ChartCard title="Clients and team" sub="At each location" testid="chart-clients-team" rows={charts.byLoc}
              columns={[{ key: "label", label: "Location" }, { key: "clients", label: "Clients" }, { key: "team", label: "Team" }]}>
              <HBars rows={charts.byLoc} narrow={narrow} testid="bars-clients-team"
                series={[{ key: "clients", label: "Clients", color: SERIES[0] }, { key: "team", label: "Team", color: SERIES[1] }]} />
            </ChartCard>

            <ChartCard title="Projects by status" sub="Client and internal projects run from each location" testid="chart-project-status" rows={charts.byLoc}
              columns={[{ key: "label", label: "Location" }, ...STATUS.map(([key, label]) => ({ key, label }))]}>
              <div style={{ height: Math.max(140, charts.byLoc.length * 34 + 36) }} data-testid="bars-project-status">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.byLoc} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barCategoryGap={10}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={narrow ? 92 : 132} tickFormatter={(v) => cut(v, narrow ? 12 : 18)} />
                    <Tooltip cursor={{ fill: "#F9FAFB" }} content={({ active, payload, label }) => active && payload?.length ? (
                      <TipBox title={label} items={STATUS.map(([key, l], i) => ({ label: l, color: SERIES[i], value: payload[0].payload[key] || 0 }))} />
                    ) : null} />
                    {STATUS.map(([key, l], i) => <Bar key={key} dataKey={key} name={l} stackId="s" fill={SERIES[i]} stroke="#fff" strokeWidth={2} maxBarSize={18}
                      radius={i === STATUS.length - 1 ? [0, 4, 4, 0] : 0} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <LegendRow items={STATUS.map(([, l], i) => ({ label: l, color: SERIES[i] }))} />
            </ChartCard>

            {money ? (
              <>
                <ChartCard title="Recurring revenue (MRR)" sub="Per month, from recurring projects" testid="chart-mrr" rows={charts.byLoc.filter((r) => r.mrr > 0)}
                  empty="No recurring projects yet. Mark a project Recurring to see MRR here." columns={[{ key: "label", label: "Location" }, { key: "mrr", label: "MRR", format: inrShort }]}
                  actions={<Link to="/finance/revenue" className="text-xs font-semibold text-[#F26B21] whitespace-nowrap">MRR & ARR</Link>}>
                  <HBars rows={charts.byLoc.filter((r) => r.mrr > 0)} money narrow={narrow} testid="bars-mrr" series={[{ key: "mrr", label: "MRR", color: BRAND }]} />
                </ChartCard>
                <ChartCard title="Open sales pipeline" sub="Value of leads not yet won or lost" testid="chart-pipeline" rows={charts.byLoc.filter((r) => r.pipeline > 0)}
                  empty="No open leads at these locations." columns={[{ key: "label", label: "Location" }, { key: "pipeline", label: "Open pipeline", format: inrShort }, { key: "leads_open", label: "Leads" }]}>
                  <HBars rows={charts.byLoc.filter((r) => r.pipeline > 0)} money narrow={narrow} testid="bars-pipeline" series={[{ key: "pipeline", label: "Open pipeline", color: BRAND }]} />
                </ChartCard>
              </>
            ) : (
              <ChartCard title="Open leads" sub="Leads not yet won or lost" testid="chart-leads" rows={charts.byLoc.filter((r) => r.leads_open > 0)}
                empty="No open leads at these locations." columns={[{ key: "label", label: "Location" }, { key: "leads_open", label: "Open leads" }]}>
                <HBars rows={charts.byLoc.filter((r) => r.leads_open > 0)} narrow={narrow} testid="bars-leads" series={[{ key: "leads_open", label: "Open leads", color: BRAND }]} />
              </ChartCard>
            )}
          </div>

          {d.unplaced && (d.unplaced.clients > 0 || d.unplaced.team > 0) && (
            <p className="text-xs text-gray-500" data-testid="map-unplaced">
              Not placed anywhere yet (no city): {[d.unplaced.clients && `${d.unplaced.clients} client${d.unplaced.clients > 1 ? "s" : ""}`, d.unplaced.team && `${d.unplaced.team} team`].filter(Boolean).join(" · ")}.
            </p>
          )}
        </div>
      )}

      {tab === "india" && (
        <div className="space-y-5" data-testid="locations-india">
          <IndiaMap india={d.india} />
          <ChartCard title="By state" sub="Clients, team and open leads in each Indian state" testid="chart-states" rows={charts.states}
            empty="No one in India has a state set yet."
            columns={[{ key: "label", label: "State" }, { key: "clients", label: "Clients" }, { key: "team", label: "Team" }, { key: "leads", label: "Open leads" }, { key: "locations", label: "Locations" }]}>
            <HBars rows={charts.states} narrow={narrow} testid="bars-states"
              series={[{ key: "clients", label: "Clients", color: SERIES[0] }, { key: "team", label: "Team", color: SERIES[1] }, { key: "leads", label: "Open leads", color: SERIES[2] }]} />
          </ChartCard>
        </div>
      )}

      {tab === "abroad" && (
        <div className="space-y-5" data-testid="locations-abroad">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 flex gap-2.5">
            <Globe2 className="h-4 w-4 text-[#F26B21] mt-0.5 shrink-0" />
            <p>Places outside India aren't on the map. They're grouped by country here.</p>
          </div>
          {d.abroad.length === 0 ? (
            <Card className="border-gray-200/80"><CardContent className="p-6 text-sm text-gray-500" data-testid="abroad-empty">No clients, team or locations outside India yet.</CardContent></Card>
          ) : (
            <>
              <ChartCard title="By country" sub="Clients, team and open leads outside India" testid="chart-countries" rows={charts.countries}
                columns={[{ key: "label", label: "Country" }, { key: "clients", label: "Clients" }, { key: "team", label: "Team" }, { key: "leads", label: "Open leads" }, { key: "locations", label: "Locations" }]}>
                <HBars rows={charts.countries} narrow={narrow} testid="bars-countries"
                  series={[{ key: "clients", label: "Clients", color: SERIES[0] }, { key: "team", label: "Team", color: SERIES[1] }, { key: "leads", label: "Open leads", color: SERIES[2] }]} />
              </ChartCard>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="country-cards">
                {d.abroad.map((c) => (
                  <Card key={c.country} className="border-gray-200/80 shadow-sm min-w-0" data-testid={`country-${c.country.toLowerCase().replace(/\s+/g, "-")}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-gray-900 flex items-center gap-1.5"><Globe2 className="h-4 w-4 text-gray-400" />{c.country}</div>
                        {c.cities.length > 0 && <span className="text-xs text-gray-500 truncate">{c.cities.join(", ")}</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[["Clients", c.clients.length], ["Team", c.team], ["Open leads", c.leads]].map(([kk, v]) => (
                          <div key={kk} className="rounded-lg bg-gray-50 py-2"><div className="text-base font-semibold text-gray-900">{v}</div><div className="text-[10px] text-gray-500">{kk}</div></div>
                        ))}
                      </div>
                      {c.locations.length > 0 && <div className="text-xs text-gray-600 flex flex-wrap gap-1.5 items-center"><Building2 className="h-3.5 w-3.5 text-gray-500" />{c.locations.map((b) => <Pill key={b.id} tone="gray">{b.name}</Pill>)}</div>}
                      {c.clients.length > 0 && (
                        <ul className="text-sm space-y-1">
                          {c.clients.slice(0, 6).map((cl) => <li key={cl.id} className="truncate"><Link to={`/clients/${cl.id}`} className="text-[#C2410C] font-medium hover:underline">{cl.name}</Link>{cl.city && <span className="text-xs text-gray-500"> · {cl.city}</span>}</li>)}
                          {c.clients.length > 6 && <li className="text-xs text-gray-500">and {c.clients.length - 6} more</li>}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "manage" && <LocationManager onChanged={load} openNewSignal={newSignal} />}

      {tab === "overview" && money && d.locations.some((l) => l.score == null) && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> A location gets its score once it has a target, invoices, active projects, clients or attendance. See Dashboard → Location scores.</p>
      )}
    </div>
  );
}

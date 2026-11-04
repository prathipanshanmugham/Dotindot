// v3.1 Digital Growth — shared pieces for the Growth page, the client dashboard and the client portal.
import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Instagram, Facebook, Youtube, Linkedin, Twitter, AtSign, Pin, Store, Globe, MessageCircle, Hash, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

// Categorical slots in their validated order (adjacent pairs clear the CVD gates). Accounts take slots in the order
// they're listed for an owner, so an account keeps its colour across every chart on the page.
export const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const slotColor = (i) => (i < SLOTS.length ? SLOTS[i] : "#8a8f98");

export const PLATFORM_ICON = {
  instagram: Instagram, facebook: Facebook, youtube: Youtube, linkedin: Linkedin, x: Twitter, threads: AtSign,
  pinterest: Pin, google_business: Store, website: Globe, whatsapp: MessageCircle, other: Hash,
};
export const PlatformIcon = ({ platform, className = "h-4 w-4" }) => {
  const I = PLATFORM_ICON[platform] || Hash;
  return <I className={className} aria-hidden="true" />;
};

export const fmtNum = (v, dec = 0) => (v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: dec }));
export const fmtCompact = (v) => {
  if (v == null) return "—";
  const n = Number(v); const a = Math.abs(n); const s = n < 0 ? "−" : "";
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${s}${(a / 1e3).toFixed(0)}K`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${Math.round(a)}`;
};
export const signed = (v, compact = false) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${compact ? fmtCompact(Math.abs(v)) : fmtNum(Math.abs(v))}`);

/** Up / down / flat pill — status colour always paired with an arrow and the number. */
export const ChangePill = ({ value, pct, compact = true, testid }) => {
  if (value == null) return <span className="text-xs text-gray-400" data-testid={testid}>—</span>;
  const up = value > 0, down = value < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const tone = up ? "bg-emerald-50 text-emerald-700 border-emerald-200" : down ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold font-mono whitespace-nowrap ${tone}`} data-testid={testid}>
      <Icon className="h-3 w-3" />{signed(value, compact)}{pct != null && <span className="font-sans font-medium opacity-80">&nbsp;({pct > 0 ? "+" : ""}{pct}%)</span>}
    </span>
  );
};

/** Tiny single-series trend line (gaps carried forward). */
export const Sparkline = ({ points, color = SLOTS[0], width = 96, height = 28, testid }) => {
  const pts = [];
  let last = null;
  (points || []).forEach((p) => { last = p ?? last; pts.push(last); });
  const vals = pts.filter((v) => v != null);
  if (vals.length < 2) return <svg width={width} height={height} data-testid={testid} aria-hidden="true" />;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const step = width / Math.max(1, pts.length - 1);
  const xy = pts.map((v, i) => (v == null ? null : [i * step, height - 3 - ((v - min) / span) * (height - 6)])).filter(Boolean);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [ex, ey] = xy[xy.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} data-testid={testid} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="3" fill={color} stroke="#fff" strokeWidth="2" />
    </svg>
  );
};

const axisTick = { fontSize: 11, fill: "#6B7280" };

const ChartTip = ({ active, payload, label, fmt = fmtNum, names }) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs min-w-[170px]">
      <div className="font-semibold text-gray-900 mb-1">{label}</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-gray-600 min-w-0"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} /><span className="truncate">{names[p.dataKey] || p.name}</span></span>
          <span className="font-mono font-semibold text-gray-900">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

/** Legend with icons — identity is never colour alone. */
export const SeriesLegend = ({ accounts, colors, value = (a) => a.audience_now, fmt = fmtCompact, testid = "growth-legend" }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600" data-testid={testid}>
    {accounts.map((a) => (
      <span key={a.id} className="inline-flex items-center gap-1.5 min-w-0">
        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: colors[a.id] }} />
        <PlatformIcon platform={a.platform} className="h-3.5 w-3.5 text-gray-500 shrink-0" />
        <span className="truncate max-w-[180px]">{a.label}</span>
        {value(a) != null && <span className="font-mono text-gray-900 font-semibold">{fmt(value(a))}</span>}
      </span>
    ))}
  </div>
);

export const colorMap = (accounts) => Object.fromEntries((accounts || []).map((a, i) => [a.id, slotColor(i)]));

/** Audience over time: absolute numbers, or indexed growth % from the start of the period (one axis either way). */
export function AudienceChart({ data, height = 280, testid = "growth-audience-chart" }) {
  const [mode, setMode] = useState("abs");
  const [view, setView] = useState("chart");
  const accounts = (data?.accounts || []).filter((a) => a.audience_metric && a.series.some((s) => s.audience != null) && a.platform !== "google_business");
  const colors = colorMap(data?.accounts);
  if (!accounts.length) return <p className="text-sm text-gray-400 py-6 text-center">No follower numbers in this period yet.</p>;
  const rows = data.months.map((m, i) => {
    const r = { label: data.month_labels[i] };
    accounts.forEach((a) => {
      const v = a.series[i].audience;
      if (v == null) return;
      r[a.id] = mode === "abs" ? v : (a.audience_start ? +((100 * (v - a.audience_start)) / a.audience_start).toFixed(1) : null);
    });
    return r;
  });
  const names = Object.fromEntries(accounts.map((a) => [a.id, a.label]));
  const fmt = mode === "abs" ? fmtNum : (v) => `${v > 0 ? "+" : ""}${v}%`;
  const direct = accounts.length <= 4;
  const lastIdx = Object.fromEntries(accounts.map((a) => [a.id, rows.reduce((k, r, i) => (r[a.id] != null ? i : k), -1)]));
  return (
    <div className="space-y-3" data-testid={testid}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs font-semibold" role="tablist">
          {[["abs", "Followers"], ["pct", "Growth %"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} data-testid={`audience-mode-${k}`}
              className={`px-2.5 py-1 rounded-md ${mode === k ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={() => setView(view === "chart" ? "table" : "chart")} className="text-xs font-semibold text-[#F26B21]" data-testid="audience-view-toggle">
          {view === "chart" ? "View as table" : "View as chart"}
        </button>
      </div>
      {view === "chart" ? (
        <>
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: direct ? 64 : 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#EEF0F2" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={mode === "abs" ? 48 : 44} tickFormatter={mode === "abs" ? fmtCompact : (v) => `${v}%`} domain={mode === "abs" ? ["auto", "auto"] : ["auto", "auto"]} />
                <Tooltip content={<ChartTip fmt={fmt} names={names} />} cursor={{ stroke: "#9CA3AF", strokeDasharray: "3 3" }} />
                {accounts.map((a) => (
                  <Line key={a.id} type="monotone" dataKey={a.id} name={a.label} stroke={colors[a.id]} strokeWidth={2} connectNulls isAnimationActive={false}
                    dot={rows.length <= 3 ? { r: 3, strokeWidth: 0, fill: colors[a.id] } : false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                    label={direct ? ({ x, y, index, value }) => (index === lastIdx[a.id] && value != null
                      ? <text x={x + 6} y={y} dy={4} fontSize={11} fill="#374151" fontWeight={600}>{mode === "abs" ? fmtCompact(value) : `${value > 0 ? "+" : ""}${value}%`}</text> : null) : false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <SeriesLegend accounts={accounts} colors={colors} />
        </>
      ) : (
        <SeriesTable months={data.month_labels} accounts={accounts} pick={(a, i) => a.series[i].audience} />
      )}
    </div>
  );
}

/** Views (or impressions) per month, stacked by account — 2px surface gaps, rounded top only. */
export function ViewsChart({ data, height = 240, testid = "growth-views-chart" }) {
  const [view, setView] = useState("chart");
  const accounts = (data?.accounts || []).filter((a) => a.views_metric && a.platform !== "website" && a.platform !== "google_business" && a.series.some((s) => s.views));
  const colors = colorMap(data?.accounts);
  if (!accounts.length) return <p className="text-sm text-gray-400 py-6 text-center">No views recorded in this period yet.</p>;
  const rows = data.months.map((m, i) => {
    const r = { label: data.month_labels[i] };
    accounts.forEach((a) => { if (a.series[i].views != null) r[a.id] = a.series[i].views; });
    return r;
  });
  const names = Object.fromEntries(accounts.map((a) => [a.id, `${a.label} · ${(a.views_label || "views").toLowerCase()}`]));
  return (
    <div className="space-y-3" data-testid={testid}>
      <div className="flex justify-end">
        <button type="button" onClick={() => setView(view === "chart" ? "table" : "chart")} className="text-xs font-semibold text-[#F26B21]" data-testid="views-view-toggle">
          {view === "chart" ? "View as table" : "View as chart"}
        </button>
      </div>
      {view === "chart" ? (
        <>
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke="#EEF0F2" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} tickFormatter={fmtCompact} />
                <Tooltip content={<ChartTip names={names} />} cursor={{ fill: "#F9FAFB" }} />
                {accounts.map((a, i) => (
                  <Bar key={a.id} dataKey={a.id} stackId="v" fill={colors[a.id]} stroke="#fff" strokeWidth={2} isAnimationActive={false}
                    radius={i === accounts.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <SeriesLegend accounts={accounts} colors={colors} value={(a) => a.views} testid="views-legend" />
        </>
      ) : (
        <SeriesTable months={data.month_labels} accounts={accounts} pick={(a, i) => a.series[i].views} />
      )}
    </div>
  );
}

export const SeriesTable = ({ months, accounts, pick }) => (
  <div className="overflow-x-auto -mx-1" data-testid="growth-series-table">
    <table className="w-full text-xs">
      <thead><tr className="text-gray-500 border-b border-gray-100"><th className="text-left font-semibold py-2 px-1">Account</th>{months.map((m) => <th key={m} className="text-right font-semibold py-2 px-1 whitespace-nowrap">{m}</th>)}</tr></thead>
      <tbody>{accounts.map((a) => (
        <tr key={a.id} className="border-b border-gray-50 last:border-0">
          <td className="py-1.5 px-1 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><PlatformIcon platform={a.platform} className="h-3.5 w-3.5 text-gray-500" />{a.label}</span></td>
          {months.map((m, i) => <td key={m} className="py-1.5 px-1 text-right font-mono text-gray-800">{fmtNum(pick(a, i))}</td>)}
        </tr>
      ))}</tbody>
    </table>
  </div>
);

/** Section for the client dashboard / portal: KPIs, audience trend and per-account table. */
export function ClientGrowthSection({ growth }) {
  const t = growth.totals;
  const tiles = [
    ["Total audience", fmtCompact(t.audience_now), "followers + subscribers"],
    ["New followers", signed(t.net_growth, true), t.growth_pct != null ? `${t.growth_pct > 0 ? "+" : ""}${t.growth_pct}% over the period` : ""],
    ["Views", fmtCompact(t.views), "across social accounts"],
    ["Engagement rate", t.engagement_rate != null ? `${t.engagement_rate}%` : "—", "interactions ÷ reach"],
  ];
  // the chart shows a longer trend (spark, from spark_start) than the report period the tiles and table cover
  const data = { months: growth.months, month_labels: growth.months, accounts: growth.accounts.map((a, i) => ({ ...a, id: `a${i}`, audience_metric: a.audience_label ? "x" : null,
    audience_start: a.spark_start ?? a.audience_start, series: (a.spark || []).map((v) => ({ audience: v })) })) };
  return (
    <div className="space-y-4" data-testid="client-growth-body">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {tiles.map(([l, v, s]) => (
          <div key={l} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
            <div className="text-[11px] text-gray-500">{l}</div>
            <div className="text-lg font-bold font-mono text-gray-900">{v}</div>
            {s && <div className="text-[10px] text-gray-400 truncate">{s}</div>}
          </div>
        ))}
      </div>
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-2">Audience trend · {growth.months[0]} – {growth.months[growth.months.length - 1]}</div>
        <AudienceChart data={data} height={220} testid="client-growth-chart" />
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm" data-testid="client-growth-table">
          <thead><tr className="text-xs text-gray-500 border-b border-gray-100">
            <th className="text-left font-semibold py-2 px-1">Account</th><th className="text-right font-semibold py-2 px-1">Now</th>
            <th className="text-right font-semibold py-2 px-1">Change</th><th className="text-right font-semibold py-2 px-1 hidden sm:table-cell">Views</th>
            <th className="text-right font-semibold py-2 px-1 hidden sm:table-cell">Engagement</th></tr></thead>
          <tbody>{growth.accounts.map((a, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              <td className="py-2 px-1"><span className="inline-flex items-center gap-1.5"><PlatformIcon platform={a.platform} className="h-4 w-4 text-gray-500" /><span className="text-gray-800">{a.label}</span></span></td>
              <td className="py-2 px-1 text-right font-mono">{fmtNum(a.audience_now)}<span className="block text-[10px] text-gray-400 font-sans">{(a.audience_label || "").toLowerCase()}</span></td>
              <td className="py-2 px-1 text-right"><ChangePill value={a.change} pct={a.change_pct} /></td>
              <td className="py-2 px-1 text-right font-mono hidden sm:table-cell">{a.views ? fmtCompact(a.views) : "—"}</td>
              <td className="py-2 px-1 text-right font-mono hidden sm:table-cell">{a.engagement_rate != null ? `${a.engagement_rate}%` : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// v3.0 Lead Flow: Sankey (source → furthest stage → outcome), per-source table and monthly volume by source.
import { useMemo, useState } from "react";
import { Sankey, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Layer, Rectangle } from "recharts";
import { inr } from "@/components/kit";

// Fixed colour per source (colour follows the source, never its rank). Validated categorical steps;
// low-volume sources share neutral greys. Every node is labelled, so colour never carries meaning alone.
export const SOURCE_COLORS = {
  meta_ads: "#2a78d6", google_ads: "#eb6834", website: "#1baf7a", whatsapp: "#eda100", instagram: "#e87ba4", referral: "#6250d6",
  linkedin: "#2a78d6", ads: "#eb6834", cold_outreach: "#eda100", event: "#e87ba4",
  facebook: "#8a8f98", walk_in: "#a8a29e", marketplace: "#78716c", other: "#9ca3af",
};
const STAGE_COLOR = "#94a3b8";
const OUTCOME_COLORS = { won: "#15803d", converted: "#15803d", lost: "#dc2626", open: "#d97706" };

const nodeColor = (n) => (n.kind === "source" ? SOURCE_COLORS[n.key] || "#9ca3af" : n.kind === "stage" ? STAGE_COLOR : OUTCOME_COLORS[n.key] || "#9ca3af");

const FlowNode = ({ x, y, width, height, payload, containerWidth }) => {
  const right = x + width + 6;
  const leftSide = x > containerWidth * 0.66;
  const color = nodeColor(payload);
  const label = payload.name;
  const val = payload.value;
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={Math.max(height, 2)} fill={color} radius={3} />
      <text x={leftSide ? x - 6 : right} y={y + height / 2} textAnchor={leftSide ? "end" : "start"} dominantBaseline="middle" fontSize={11} fill="#111827" fontWeight={600}>
        {label}
        <tspan fill="#6B7280" fontWeight={500}>{`  ${val}`}</tspan>
      </text>
    </Layer>
  );
};

const FlowLink = ({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload }) => {
  const [hover, setHover] = useState(false);
  const color = nodeColor(payload.source);
  return (
    <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={color} strokeOpacity={hover ? 0.55 : 0.28} strokeWidth={Math.max(linkWidth, 1)}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />
  );
};

const FlowTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload?.payload || payload[0].payload;
  const isLink = p?.source && p?.target;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      {isLink ? (
        <><div className="font-semibold text-gray-900">{p.source.name} → {p.target.name}</div>
          <div className="text-gray-600">{p.value} lead{p.value === 1 ? "" : "s"}{p.amount ? ` · ${inr(p.amount)}` : ""}</div></>
      ) : (
        <><div className="font-semibold text-gray-900">{p?.name}</div><div className="text-gray-600">{p?.value} lead{p?.value === 1 ? "" : "s"}</div></>
      )}
    </div>
  );
};

export function LeadSankey({ flow, height = 360 }) {
  const data = useMemo(() => {
    if (!flow?.nodes?.length || !flow?.links?.length) return null;
    return { nodes: flow.nodes.map((n) => ({ ...n })), links: flow.links.filter((l) => l.value > 0).map((l) => ({ ...l })) };
  }, [flow]);
  if (!data) return <div className="h-40 flex items-center justify-center text-sm text-gray-400" data-testid="lead-sankey-empty">No leads in this period yet.</div>;
  return (
    <div className="w-full overflow-x-auto" data-testid="lead-sankey">
      <div style={{ minWidth: 560, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey data={data} nodeWidth={10} nodePadding={18} margin={{ top: 8, right: 120, bottom: 8, left: 8 }} iterations={48}
            node={<FlowNode />} link={<FlowLink />}>
            <Tooltip content={<FlowTip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function SourceTable({ sources, winLabel = "Won", showSpend = false, testid = "lead-sources-table" }) {
  if (!sources?.length) return null;
  return (
    <div className="overflow-x-auto" data-testid={testid}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="text-left font-semibold py-2 pr-3">Source</th>
            <th className="text-right font-semibold py-2 px-2">Leads</th>
            <th className="text-right font-semibold py-2 px-2">Qualified</th>
            <th className="text-right font-semibold py-2 px-2">{winLabel}</th>
            <th className="text-right font-semibold py-2 px-2">{winLabel} %</th>
            <th className="text-right font-semibold py-2 px-2">{winLabel} value</th>
            {showSpend && <th className="text-right font-semibold py-2 pl-2">Cost / lead</th>}
          </tr>
        </thead>
        <tbody>
          {sources.map((r) => (
            <tr key={r.source} className="border-b border-gray-50 last:border-0">
              <td className="py-2 pr-3"><span className="inline-flex items-center gap-2 font-medium text-gray-800"><span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: SOURCE_COLORS[r.source] || "#9ca3af" }} />{r.label}</span></td>
              <td className="py-2 px-2 text-right font-mono">{r.leads}</td>
              <td className="py-2 px-2 text-right font-mono text-gray-600">{r.qualified}</td>
              <td className="py-2 px-2 text-right font-mono">{r.won}</td>
              <td className="py-2 px-2 text-right font-mono text-gray-600">{r.win_rate}%</td>
              <td className="py-2 px-2 text-right font-mono text-gray-600">{r.won_value ? inr(r.won_value) : "—"}</td>
              {showSpend && <td className="py-2 pl-2 text-right font-mono text-gray-600">{r.cost_per_lead ? inr(r.cost_per_lead) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MonthlyBySource({ monthly, labels, height = 220 }) {
  const keys = useMemo(() => {
    const tot = {};
    (monthly || []).forEach((m) => Object.entries(m).forEach(([k, v]) => { if (k !== "month") tot[k] = (tot[k] || 0) + v; }));
    return Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
  }, [monthly]);
  if (!keys.length) return null;
  return (
    <div style={{ height }} data-testid="lead-monthly-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={monthly} margin={{ top: 6, right: 6, left: -18, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#F9FAFB" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, k) => [v, labels?.[k] || k]} />
          <Legend formatter={(k) => <span className="text-xs text-gray-600">{labels?.[k] || k}</span>} iconType="square" iconSize={9} />
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="s" fill={SOURCE_COLORS[k] || "#9ca3af"} stroke="#fff" strokeWidth={1.5}
              radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={44} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

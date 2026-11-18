import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Validated categorical order (light surface). Colour follows the entity, never its rank: callers map an entity's
// stable index into this list. Three slots are under 3:1 contrast, so every chart ships a table view and a legend.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const BRAND = "#F26B21";
export const AXIS = { fontSize: 11, fill: "#6B7280" };
export const GRID = "#F3F4F6";

/** A chart with a title, a one-line note and a "Show as table" switch (the table carries the exact numbers). */
export function ChartCard({ title, sub, columns, rows, children, testid, empty, className = "", actions }) {
  const [table, setTable] = useState(false);
  const hasRows = rows && rows.length > 0;
  return (
    <Card className={`border-gray-200/80 shadow-sm min-w-0 ${className}`} data-testid={testid}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold text-gray-800">{title}</CardTitle>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {actions}
          {hasRows && columns && (
            <button type="button" className="text-xs font-medium text-gray-500 hover:text-[#F26B21] whitespace-nowrap" onClick={() => setTable((x) => !x)}
              data-testid={testid && `${testid}-table-toggle`}>{table ? "Show chart" : "Show as table"}</button>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {!hasRows ? (
          <p className="text-sm text-gray-400 py-8 text-center">{empty || "Nothing to show yet."}</p>
        ) : table ? (
          <div className="overflow-x-auto -mx-1 px-1" data-testid={testid && `${testid}-table`}>
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  {columns.map((c, i) => <th key={c.key} className={`py-2 font-medium ${i === 0 ? "text-left" : "text-right"} whitespace-nowrap px-1`}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    {columns.map((c, j) => (
                      <td key={c.key} className={`py-1.5 px-1 ${j === 0 ? "text-left text-gray-800" : "text-right font-mono text-gray-700"} whitespace-nowrap`}>
                        {c.format ? c.format(r[c.key], r) : r[c.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : children}
      </CardContent>
    </Card>
  );
}

/** Tooltip box used by every chart: a title line and one row per series with its colour chip. */
export const TipBox = ({ title, items }) => (
  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md text-xs space-y-1 max-w-[240px]">
    {title && <div className="font-semibold text-gray-900">{title}</div>}
    {items.map((it) => (
      <div key={it.label} className="flex items-center justify-between gap-3 text-gray-700">
        <span className="flex items-center gap-1.5 min-w-0"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: it.color }} /><span className="truncate">{it.label}</span></span>
        <span className="font-mono font-semibold text-gray-900">{it.value}</span>
      </div>
    ))}
  </div>
);

/** Legend row (always shown for two or more series; identity is never colour alone). */
export const LegendRow = ({ items }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mt-2">
    {items.map((it) => (
      <span key={it.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />{it.label}</span>
    ))}
  </div>
);

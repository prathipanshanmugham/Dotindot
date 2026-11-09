// v3.0 small shared building blocks for the new modules (HR, payroll, loans, investors, support, lead flow, AI).
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError, formatINR } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { saveBlobResponse } from "@/components/ExportMenu";

export const inr = (v) => formatINR(Math.round(Number(v) || 0));
export const inrShort = (v) => {
  const n = Number(v) || 0;
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(0)}k`;
  return `${sign}₹${Math.round(a)}`;
};
export const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const thisMonth = () => localISO().slice(0, 7);
export const fmtDate = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) => {
  if (!iso) return "—";
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", opts);
};
export const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};
export const monthLabel = (ym) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "—");
export const ago = (iso) => {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
};
export const initials = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** GET helper with reload. */
export const useLoad = (path, params, deps = []) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    if (!path) return Promise.resolve();
    return api.get(path, params ? { params } : undefined)
      .then((r) => { setData(r.data); setError(null); })
      .catch((e) => { setError(apiError(e)); if (e.response?.status !== 403) toast.error(apiError(e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(params || {})]);
  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return [data, load, setData, error];
};

export const Spinner = ({ className = "h-64" }) => (
  <div className={`${className} flex items-center justify-center`} data-testid="loading"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>
);

export const Empty = ({ icon: Icon, title, sub, action, className = "" }) => (
  <div className={`text-center py-12 px-4 ${className}`} data-testid="empty-state">
    {Icon && <div className="mx-auto h-11 w-11 rounded-2xl bg-[#FFF7ED] flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-[#F26B21]" /></div>}
    <div className="text-sm font-semibold text-gray-800">{title}</div>
    {sub && <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{sub}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Stat = ({ icon: Icon, label, value, sub, tone = "orange", testid, className = "" }) => {
  const tones = { orange: "bg-[#FFF7ED] text-[#F26B21]", green: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-600", amber: "bg-amber-50 text-amber-600", gray: "bg-gray-100 text-gray-600", violet: "bg-violet-50 text-violet-600" };
  return (
    <Card className={`border-gray-200/80 shadow-sm ${className}`} data-testid={testid}>
      <CardContent className="p-3.5 sm:p-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        {Icon && <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon style={{ height: 18, width: 18 }} /></div>}
        <div className="min-w-0 w-full sm:w-auto">
          <div className="text-base sm:text-lg font-bold text-gray-900 font-mono leading-snug [overflow-wrap:anywhere] sm:truncate">{value}</div>
          <div className="text-xs text-gray-500 line-clamp-2 sm:line-clamp-none sm:truncate">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</div>
        </div>
      </CardContent>
    </Card>
  );
};

const PILL = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200", red: "bg-red-50 text-red-700 border-red-200", amber: "bg-amber-50 text-amber-800 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200", gray: "bg-gray-100 text-gray-600 border-gray-200", orange: "bg-[#FFF7ED] text-[#C2410C] border-orange-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};
export const Pill = ({ tone = "gray", children, className = "", ...rest }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${PILL[tone] || PILL.gray} ${className}`} {...rest}>{children}</span>
);

export const PageHead = ({ kicker, title, sub, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      {kicker && <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">{kicker}</div>}
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 [overflow-wrap:anywhere]">{title}</h1>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/** Rounded pill tabs (state-driven). tabs: [[key, label, count?]] */
export const PillTabs = ({ tabs, value, onChange, testid = "tabs" }) => (
  <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid={testid}>
    {tabs.map(([k, label, count]) => (
      <button key={k} type="button" onClick={() => onChange(k)} data-testid={`${testid}-${k}`}
        className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${value === k ? "bg-[#F26B21] text-white" : "bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-[#F26B21]"}`}>
        {label}{count != null && <span className={`ml-1.5 ${value === k ? "text-white/80" : "text-gray-400"}`}>{count}</span>}
      </button>
    ))}
  </div>
);

/** Section layout with route tabs (like Finance). tabs: [{name, path, exact, perm}] */
export const ModuleLayout = ({ kicker, title, subtitle, tabs, actions, children, testid }) => {
  const { hasPerm } = useAuth();
  const shown = tabs.filter((t) => !t.perm || hasPerm(...[].concat(t.perm)));
  return (
    <div className="space-y-5 max-w-7xl" data-testid={testid}>
      <PageHead kicker={kicker} title={title} sub={subtitle} actions={actions} />
      <div className="flex gap-1.5 border-b border-gray-200 pb-3 overflow-x-auto -mx-1 px-1">
        {shown.map((t) => (
          <NavLink key={t.path} to={t.path} end={t.exact} data-testid={`${testid}-tab-${t.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
            className={({ isActive }) => `px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${isActive ? "bg-[#F26B21] text-white" : "bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-[#F26B21]"}`}>
            {t.name}
          </NavLink>
        ))}
      </div>
      {children}
    </div>
  );
};

export const Field = ({ label, hint, children, className = "" }) => (
  <div className={`space-y-1.5 ${className}`}>
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    {children}
    {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
  </div>
);

export const Avatar = ({ name, size = 8 }) => (
  <div style={{ height: size * 4, width: size * 4 }} className="rounded-full bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white text-[11px] font-bold flex items-center justify-center shrink-0">{initials(name)}</div>
);

/** Save a blob download (same helper as the Export menu). */
export const download = async (path, fallbackName, params) => {
  try {
    const res = await api.get(path, { params, responseType: "blob" });
    saveBlobResponse(res, fallbackName);
  } catch (e) {
    let msg = apiError(e);
    try { if (e.response?.data instanceof Blob) msg = JSON.parse(await e.response.data.text()).detail || msg; } catch { /* ignore */ }
    toast.error(msg);
  }
};

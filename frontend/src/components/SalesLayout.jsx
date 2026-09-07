import { NavLink } from "react-router-dom";

export const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];
export const OPEN_STAGES = ["new", "contacted", "qualified", "proposal"];
export const LEAD_SOURCES = ["referral", "website", "ads", "linkedin", "cold_outreach", "event", "other"];

export const STAGE_STYLES = {
  new: "bg-sky-50 text-sky-700 border-sky-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  qualified: "bg-violet-50 text-violet-700 border-violet-200",
  proposal: "bg-orange-50 text-orange-700 border-orange-200",
  won: "bg-emerald-50 text-emerald-700 border-emerald-200",
  lost: "bg-red-50 text-red-600 border-red-200",
};

export const QUOTE_STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
  expired: "bg-amber-50 text-amber-700 border-amber-200",
};

const TABS = [
  { name: "Overview", path: "/sales", exact: true },
  { name: "Pipeline", path: "/sales/pipeline" },
  { name: "Quotes", path: "/sales/quotes" },
  { name: "Targets", path: "/sales/targets" },
];

export default function SalesLayout({ title, subtitle, children, actions }) {
  return (
    <div className="space-y-5 max-w-7xl" data-testid="sales-layout">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Sales & Marketing</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-3">
        {TABS.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            end={t.exact}
            data-testid={`sales-tab-${t.name.toLowerCase()}`}
            className={({ isActive }) =>
              `px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                isActive ? "bg-[#F26B21] text-white" : "bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-[#F26B21]"
              }`
            }
          >
            {t.name}
          </NavLink>
        ))}
      </div>
      {children}
    </div>
  );
}

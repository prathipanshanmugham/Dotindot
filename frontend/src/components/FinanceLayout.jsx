import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const EXPENSE_CATEGORIES = ["operational", "marketing", "tools", "salaries", "misc", "ai"];
export const INCOME_CATEGORIES = ["project_income", "retainer", "campaign_revenue", "other"];
export const CHANNELS = ["meta", "google", "linkedin", "other"];
export const PAYMENT_METHODS = ["bank_transfer", "upi", "credit_card", "cash", "pending"];

const TABS = [
  { name: "Overview", path: "/finance", exact: true, roles: ["super_admin", "admin", "finance"] },
  { name: "Ledger", path: "/finance/ledger", roles: ["super_admin", "admin", "finance"] },
  { name: "Expenses", path: "/finance/expenses", roles: ["super_admin", "admin", "finance"] },
  { name: "Subscriptions", path: "/finance/subscriptions", roles: ["super_admin", "admin", "finance"] },
  { name: "Budgets", path: "/finance/budgets", roles: ["super_admin", "admin", "finance"] },
  { name: "AI Spend", path: "/finance/ai", roles: ["super_admin", "admin", "finance"] },
  { name: "API Credits", path: "/finance/api-credits", roles: ["super_admin", "admin", "finance"], perm: "finance.api_credits" },
  { name: "Marketing", path: "/finance/marketing", roles: ["super_admin", "admin", "finance"] },
  { name: "Project Profit", path: "/finance/profit", roles: ["super_admin", "admin", "finance", "pm"] },
  { name: "Employee Revenue", path: "/finance/employees", roles: ["super_admin", "admin", "finance"] },
];

export default function FinanceLayout({ title, subtitle, children, actions }) {
  const { user, hasPerm } = useAuth();
  const tabs = TABS.filter((t) => (t.perm ? hasPerm(t.perm) : t.roles.includes(user?.role)));
  return (
    <div className="space-y-5 max-w-7xl" data-testid="finance-layout">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Finance</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-gray-200 pb-3">
        {tabs.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            end={t.exact}
            data-testid={`finance-tab-${t.name.toLowerCase().replace(/\s+/g, "-")}`}
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

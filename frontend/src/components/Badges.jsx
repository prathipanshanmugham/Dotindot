import { Badge } from "@/components/ui/badge";

export const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin / CEO",
  finance: "Finance",
  sales: "Sales",
  pm: "Project Manager",
  employee: "Employee",
  ads_manager: "Ads Manager",
  social_manager: "Social Manager",
};

export const PROJECT_STATUSES = ["kickoff", "in_progress", "review", "completed", "on_hold"];
export const CLIENT_STATUSES = ["active", "inactive", "churned"];
export const INDUSTRIES = ["real-estate", "healthcare", "e-commerce", "restaurant", "fintech", "saas", "other"];
export const SERVICE_TYPES = ["web_dev", "marketing", "ai", "retainer", "one_off"];
export const SIZES = ["small", "mid", "large"];

export const labelize = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const projectStatusStyles = {
  kickoff: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-orange-50 text-orange-700 border-orange-200",
  review: "bg-violet-50 text-violet-700 border-violet-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  on_hold: "bg-gray-100 text-gray-600 border-gray-200",
};

const clientStatusStyles = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-amber-50 text-amber-700 border-amber-200",
  churned: "bg-red-50 text-red-600 border-red-200",
};

const healthStyles = {
  healthy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  watch: "bg-amber-50 text-amber-700 border-amber-200",
  at_risk: "bg-red-50 text-red-600 border-red-200",
};

const healthDot = { healthy: "bg-emerald-500", watch: "bg-amber-500", at_risk: "bg-red-500" };

export const ProjectStatusBadge = ({ status }) => (
  <Badge variant="outline" className={`${projectStatusStyles[status] || ""} font-medium`} data-testid={`project-status-badge-${status}`}>
    {labelize(status)}
  </Badge>
);

export const ClientStatusBadge = ({ status }) => (
  <Badge variant="outline" className={`${clientStatusStyles[status] || ""} font-medium`} data-testid={`client-status-badge-${status}`}>
    {labelize(status)}
  </Badge>
);

export const HealthBadge = ({ health }) => (
  <Badge variant="outline" className={`${healthStyles[health] || ""} font-medium gap-1.5`} data-testid={`health-badge-${health}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${healthDot[health] || "bg-gray-400"} animate-pulse`} />
    {health === "at_risk" ? "At Risk" : labelize(health)}
  </Badge>
);

export const RoleBadge = ({ role }) => (
  <Badge variant="outline" className="bg-[#FFF7ED] text-[#F26B21] border-orange-200 font-semibold uppercase tracking-wide text-[10px]" data-testid="role-badge">
    {ROLE_LABELS[role] || role}
  </Badge>
);

const expenseStatusStyles = {
  submitted: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
};

export const ExpenseStatusBadge = ({ status }) => (
  <Badge variant="outline" className={`${expenseStatusStyles[status] || ""} font-medium`} data-testid={`expense-status-badge-${status}`}>
    {labelize(status)}
  </Badge>
);

export const CHART_COLORS = ["#F26B21", "#FBA834", "#6366F1", "#10B981", "#64748B", "#EF4444", "#0EA5E9"];

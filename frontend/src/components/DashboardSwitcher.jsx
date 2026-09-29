import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Crown, Building2, User } from "lucide-react";

const KINDS = [
  { key: "ceo", label: "CEO", icon: Crown, path: "/dashboard/ceo" },
  { key: "manager", label: "Manager", icon: Building2, path: "/dashboard/manager" },
  { key: "staff", label: "Staff", icon: User, path: "/dashboard/staff" },
];

// super_admin only: preview any of the three role dashboards
export const DashboardSwitcher = ({ current }) => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (user?.role !== "super_admin") return null;
  return (
    <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5 text-xs font-semibold" data-testid="dashboard-switcher">
      {KINDS.map((k) => {
        const active = current === k.key || pathname === k.path;
        return (
          <Link key={k.key} to={k.path} data-testid={`dashboard-switch-${k.key}`}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${active ? "bg-[#F26B21] text-white" : "text-gray-500 hover:text-gray-900"}`}>
            <k.icon className="h-3.5 w-3.5" /> {k.label}
          </Link>
        );
      })}
    </div>
  );
};

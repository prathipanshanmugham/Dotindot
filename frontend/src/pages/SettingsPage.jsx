import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { RoleBadge } from "@/components/Badges";
import { DotindotLogo } from "@/components/DotindotLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Building2, ShieldCheck, ArrowRight, IndianRupee, Clock } from "lucide-react";
import { ChangePasswordCard } from "@/pages/settings/ChangePasswordCard";
import { RolePermissionsCard } from "@/pages/settings/RolePermissionsCard";
import { WorkspaceManager } from "@/pages/settings/WorkspaceManager";
import { RecycleBin } from "@/pages/settings/RecycleBin";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-5xl" data-testid="settings-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Your account and workspace configuration.</p>
      </div>

      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><User className="h-4 w-4 text-[#F26B21]" /> Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white font-bold flex items-center justify-center">
              {(user?.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{user?.name}</div>
              <div className="text-xs text-gray-400">{user?.email}</div>
            </div>
            <RoleBadge role={user?.role} />
          </div>
          <Link
            to={`/employees/${user?.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F26B21] hover:underline"
            data-testid="settings-edit-profile-link"
          >
            View & edit my profile <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>

      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-[#F26B21]" /> Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <DotindotLogo height={22} />
            <span className="text-xs text-gray-400">Internal Operations & Growth Platform</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1"><IndianRupee className="h-3 w-3" /> Currency</div>
              <div className="font-semibold text-gray-800">INR (₹)</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1"><Clock className="h-3 w-3" /> Log retention</div>
              <div className="font-semibold text-gray-800">90 days (auto-purge daily)</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1"><ShieldCheck className="h-3 w-3" /> Access control</div>
              <div className="font-semibold text-gray-800">Role-based (5 roles)</div>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            User accounts, roles and deactivation are managed by admins under <span className="font-semibold">User Management</span>.
          </p>
        </CardContent>
      </Card>

      <ChangePasswordCard />

      {user?.role === "super_admin" && (
        <>
          <RolePermissionsCard />
          <WorkspaceManager />
          <RecycleBin />
        </>
      )}
    </div>
  );
}

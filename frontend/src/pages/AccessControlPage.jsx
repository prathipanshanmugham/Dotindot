import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import { RoleBadge, ROLE_LABELS, labelize } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, RotateCcw, MapPin, Lock, Save } from "lucide-react";

// Display-name overrides for permission keys (keys themselves stay stable)
const PERM_LABELS = { "sales.hud": "Sales — Sales View (TV mode)", "ai_agents": "AI Agents — View assigned agents & log runs", "ai_agents.manage": "AI Agents — Add, edit & assign", "ai_agents.delete": "AI Agents — Delete", "org_structure": "Org Structure — View", "org_structure.manage": "Org Structure — Edit & move roles", "org_structure.delete": "Org Structure — Delete" };

export default function AccessControlPage() {
  const { user: me } = useAuth();
  const [registry, setRegistry] = useState(null);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(new Set());
  const [draftBranches, setDraftBranches] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/access/registry").then((r) => setRegistry(r.data)).catch(() => {});
    api.get("/access/users").then((r) => setUsers(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/locations/branches").then((r) => setBranches(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const selected = users.find((u) => u.id === selectedId);

  const pickUser = (u) => {
    setSelectedId(u.id);
    setDraft(new Set(u.effective_permissions || []));
    const assigns = (u.branch_assignments || []).length
      ? u.branch_assignments
      : (u.assigned_branches || []).map((b) => ({ branch_id: b, branch_role: "staff" }));
    setDraftBranches(Object.fromEntries(assigns.map((a) => [a.branch_id, a.branch_role])));
  };

  const locked = selected && (
    selected.role === "super_admin" ||
    (me.role === "admin" && ["admin", "super_admin"].includes(selected.role))
  );

  const toggleKey = (key) => {
    if (locked) return;
    setDraft((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const roleDefault = selected ? new Set(registry?.role_defaults?.[selected.role] || []) : new Set();

  const savePermissions = async () => {
    if (!selected || !registry) return;
    const overrides = {};
    const allKeys = Object.values(registry.groups).flat();
    allKeys.forEach((k) => {
      const has = draft.has(k);
      if (has !== roleDefault.has(k)) overrides[k] = has;
    });
    setBusy(true);
    try {
      const { data } = await api.put(`/access/users/${selected.id}/permissions`, { overrides });
      setUsers((prev) => prev.map((u) => (u.id === data.id ? { ...u, ...data } : u)));
      toast.success(`Permissions saved for ${selected.name}`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const resetDefaults = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/access/users/${selected.id}/permissions/reset`);
      setUsers((prev) => prev.map((u) => (u.id === data.id ? { ...u, ...data } : u)));
      setDraft(new Set(data.effective_permissions || []));
      toast.success("Reset to role defaults");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const setBranchRole = (bid, role) => {
    if (locked) return;
    setDraftBranches((prev) => {
      const next = { ...prev };
      if (role === "none") delete next[bid]; else next[bid] = role;
      return next;
    });
  };

  const saveBranches = async () => {
    if (!selected) return;
    setBusy(true);
    const assignments = Object.entries(draftBranches).map(([branch_id, branch_role]) => ({ branch_id, branch_role }));
    try {
      await api.put(`/access/users/${selected.id}/branches`, { assignments });
      setUsers((prev) => prev.map((u) => (u.id === selected.id ? { ...u, branch_assignments: assignments, assigned_branches: assignments.map((a) => a.branch_id) } : u)));
      toast.success(assignments.length ? "Branch roles saved" : "Branch restrictions removed (all branches)");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!registry)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-7xl" data-testid="access-control-page">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-[#F26B21]" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Access Control</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Role defaults ± per-user overrides. Restrict users to branches to scope the data they see. Super admin accounts cannot be restricted.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* User list */}
        <Card className="border-gray-200/80 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-bold uppercase tracking-widest text-gray-400">Team ({users.length})</div>
          <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
            {users.map((u) => {
              const overrideCount = Object.keys(u.permission_overrides || {}).length;
              return (
                <button
                  key={u.id}
                  onClick={() => pickUser(u)}
                  data-testid={`access-user-${u.id}`}
                  className={`w-full text-left px-4 py-3 transition-colors ${selectedId === u.id ? "bg-[#FFF7ED]" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{u.name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{u.email}</div>
                    </div>
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {overrideCount > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 bg-blue-50 text-blue-700 border-blue-200">{overrideCount} override{overrideCount > 1 ? "s" : ""}</Badge>
                    )}
                    {(u.assigned_branches || []).length > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 bg-cyan-50 text-cyan-700 border-cyan-200">
                        <MapPin className="h-2.5 w-2.5 mr-0.5" />{u.assigned_branches.length} branch{u.assigned_branches.length > 1 ? "es" : ""}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Editor */}
        {!selected ? (
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="h-64 flex items-center justify-center text-sm text-gray-400">
              Select a team member to manage their permissions and branch access.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card className="border-gray-200/80 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#F26B21] to-[#FBA834] text-white text-sm font-bold flex items-center justify-center">
                      {selected.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900">{selected.name}</div>
                      <div className="text-xs text-gray-400">{selected.email} · {ROLE_LABELS[selected.role]}</div>
                    </div>
                  </div>
                  {locked ? (
                    <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200 gap-1" data-testid="access-locked-badge">
                      <Lock className="h-3 w-3" /> {selected.role === "super_admin" ? "Super admin — unrestricted" : "Only a super admin can edit this account"}
                    </Badge>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={resetDefaults} disabled={busy} data-testid="access-reset-btn">
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to role defaults
                      </Button>
                      <Button size="sm" onClick={savePermissions} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="access-save-btn">
                        <Save className="h-3.5 w-3.5 mr-1.5" /> Save permissions
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Permission matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="permission-matrix">
              {Object.entries(registry.groups).map(([group, keys]) => (
                <Card key={group} className="border-gray-200/80 shadow-sm">
                  <CardContent className="p-4">
                    <div className="text-xs font-bold uppercase tracking-widest text-[#F26B21] mb-2">{group}</div>
                    <div className="space-y-1.5">
                      {keys.map((k) => {
                        const on = draft.has(k);
                        const isDefault = roleDefault.has(k) === on;
                        return (
                          <div key={k} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50" data-testid={`perm-row-${k}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm text-gray-700 truncate">{PERM_LABELS[k] || labelize(k.replace(".", " — "))}</span>
                              {!isDefault && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" title="Overridden from role default" />}
                            </div>
                            <Switch
                              checked={on}
                              disabled={locked || busy}
                              onCheckedChange={() => toggleKey(k)}
                              data-testid={`perm-toggle-${k}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Branch access */}
            <Card className="border-gray-200/80 shadow-sm" data-testid="branch-access-card">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#F26B21]" /> Branch access & role</div>
                    <p className="text-xs text-gray-400 mt-0.5">No branch assigned = access to all branches. <span className="font-semibold">Manager</span> can edit/delete branch records; <span className="font-semibold">Staff</span> can view and edit only their own.</p>
                  </div>
                  {!locked && (
                    <Button size="sm" variant="outline" onClick={saveBranches} disabled={busy} data-testid="branch-save-btn">
                      <Save className="h-3.5 w-3.5 mr-1.5" /> Save branch roles
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branches.map((b) => {
                    const role = draftBranches[b.id] || "none";
                    return (
                      <div key={b.id} className={`rounded-lg border px-3 py-2.5 flex items-center justify-between gap-2 ${role !== "none" ? "border-[#F26B21]/40 bg-[#FFF7ED]/60" : "border-gray-200"}`} data-testid={`branch-check-${b.id}`}>
                        <div className="min-w-0"><div className="text-sm font-semibold text-gray-800 truncate">{b.name}</div><div className="text-[11px] text-gray-400">{b.city}</div></div>
                        <Select value={role} disabled={locked || busy} onValueChange={(v) => setBranchRole(b.id, v)}>
                          <SelectTrigger className="w-[120px] h-8 text-xs" data-testid={`branch-role-${b.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No access</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

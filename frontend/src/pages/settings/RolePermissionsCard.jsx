import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ROLE_LABELS, labelize } from "@/components/Badges";
import { ShieldCheck, Lock } from "lucide-react";

const PERM_LABELS = { "sales.hud": "Sales — Sales View (TV mode)", "assets.delete": "Assets — Delete (permanent)", "password_manager.reveal": "Password Manager — Reveal / Copy secrets", "ai_agents": "AI Agents — View assigned agents & log runs", "ai_agents.manage": "AI Agents — Add, edit & assign", "ai_agents.delete": "AI Agents — Delete", "org_structure": "Org Structure — View", "org_structure.manage": "Org Structure — Edit & move roles", "org_structure.delete": "Org Structure — Delete" };

// super_admin only: edits the DB-backed ROLE DEFAULT permission sets.
// Per-user overrides (Access Control) stay layered on top of these.
export const RolePermissionsCard = () => {
  const [data, setData] = useState(null);
  const [matrix, setMatrix] = useState({});
  const [dirtyRoles, setDirtyRoles] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/access/role-defaults").then((r) => {
      setData(r.data);
      const m = {};
      for (const [role, keys] of Object.entries(r.data.roles || {})) {
        m[role] = Object.fromEntries(keys.map((k) => [k, true]));
      }
      setMatrix(m);
    }).catch(() => {});
  }, []);

  if (!data) return null;
  const roles = data.editable_roles || [];
  const groups = Object.entries(data.groups || {});
  const dirty = Object.keys(dirtyRoles).length > 0;

  const toggle = (role, key) => {
    setMatrix((m) => ({ ...m, [role]: { ...m[role], [key]: !m[role]?.[key] } }));
    setDirtyRoles((d) => ({ ...d, [role]: true }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const changed = Object.keys(dirtyRoles);
      for (const role of changed) {
        const perms = Object.keys(matrix[role] || {}).filter((k) => matrix[role][k]);
        await api.put(`/access/role-defaults/${role}`, { permissions: perms });
      }
      toast.success(`Role defaults saved — hidden tabs are removed and blocked immediately`);
      setDirtyRoles({});
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid="role-permissions-card">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#F26B21]" /> Role permissions
          </CardTitle>
          <p className="text-xs text-gray-400 mt-1">
            Default tab visibility per role. Per-user overrides in Access Control stay layered on top.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={!dirty || saving}
          className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold disabled:opacity-40"
          data-testid="role-permissions-save">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-gray-50/70 text-left">
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Module / tab</th>
              <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 text-center whitespace-nowrap">
                <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Super Admin</span>
              </th>
              {roles.map((r) => (
                <th key={r} className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center whitespace-nowrap">
                  {ROLE_LABELS[r] || labelize(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([gname, keys]) => (
              <Fragment key={gname}>
                <tr>
                  <td colSpan={roles.length + 2} className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">
                    {gname}
                  </td>
                </tr>
                {keys.map((k) => (
                  <tr key={k} className="border-t border-gray-50">
                    <td className="px-4 py-2 text-gray-700">{PERM_LABELS[k] || labelize(k.replace(".", " — "))}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-300">always</td>
                    {roles.map((r) => (
                      <td key={r} className="px-3 py-2 text-center">
                        <Switch
                          checked={!!matrix[r]?.[k]}
                          onCheckedChange={() => toggle(r, k)}
                          data-testid={`role-perm-${r}-${k}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

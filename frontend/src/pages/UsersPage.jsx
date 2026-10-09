import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/components/Badges";
import { PasswordInput } from "@/components/PasswordInput";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, AlertTriangle, History } from "lucide-react";
import { toast } from "sonner";
import { LoginHistoryDialog, fmtWhen } from "@/pages/users/LoginHistoryDialog";

const ROLES = ["super_admin", "admin", "finance", "sales", "pm", "employee", "ads_manager", "social_manager"];

export default function UsersPage() {
  const { user: me } = useAuth();
  const isSuper = me?.role === "super_admin";
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [historyUser, setHistoryUser] = useState(null);

  const load = useCallback(() => {
    api.get("/users").then((r) => setUsers(r.data)).catch((e) => toast.error(apiError(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error("Name, email and password are required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/users", form);
      toast.success("User created");
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "employee" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const updateUser = async (id, patch, msg) => {
    try {
      await api.put(`/users/${id}`, patch);
      toast.success(msg);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openDelete = async (u) => {
    setDeleteTarget(u);
    setAssignments(null);
    try {
      const { data } = await api.get(`/users/${u.id}/assignments`);
      setAssignments(data);
    } catch (e) {
      setAssignments({ active_projects: [], open_leads: [], assets_held: [] });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      toast.success(`${deleteTarget.name} permanently deleted`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="users-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create team accounts, assign roles, deactivate access.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-user-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Full name</Label><Input data-testid="user-form-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Email</Label><Input data-testid="user-form-email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Password</Label><PasswordInput data-testid="user-form-password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
                  <SelectTrigger data-testid="user-form-role"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createUser} disabled={busy} data-testid="user-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
                {busy ? "Creating..." : "Create user"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const lockedRow = me?.role === "admin" && ["admin", "super_admin"].includes(u.role);
              return (
              <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white text-xs font-bold flex items-center justify-center">
                      {u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Select value={u.role} disabled={lockedRow} onValueChange={(v) => updateUser(u.id, { role: v }, `Role updated to ${ROLE_LABELS[v]}`)}>
                    <SelectTrigger className="w-[170px]" data-testid={`user-role-select-${u.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {u.is_active ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">Deactivated</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={u.is_active}
                    disabled={lockedRow}
                    onCheckedChange={(v) => updateUser(u.id, { is_active: v }, v ? "User activated" : "User deactivated")}
                    data-testid={`user-active-switch-${u.id}`}
                  />
                </TableCell>
                <TableCell>
                  <button onClick={() => setHistoryUser(u)} className="text-left group" data-testid={`user-last-active-${u.id}`} title="View login history">
                    <span className="text-sm text-gray-700 group-hover:text-[#F26B21] flex items-center gap-1.5"><History className="h-3.5 w-3.5 text-gray-400" />{fmtWhen(u.last_login)}</span>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  {isSuper && u.id !== me.id && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => openDelete(u)} data-testid={`delete-user-btn-${u.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Permanent delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" /> Permanently delete {deleteTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-gray-500">
                <p>
                  This is <span className="font-semibold text-red-600">permanent</span>. The account is removed and can never
                  log in again. Historical records (projects, transactions, logs) are kept with the name
                  "Deleted user ({deleteTarget?.name})".
                </p>
                {!assignments ? (
                  <p className="text-xs text-gray-400">Checking current assignments…</p>
                ) : assignments.active_projects.length + assignments.open_leads.length + assignments.assets_held.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1" data-testid="delete-user-warnings">
                    <div className="font-bold">This user is still assigned to:</div>
                    {assignments.active_projects.length > 0 && (
                      <div>• {assignments.active_projects.length} active project(s): {assignments.active_projects.map((p) => p.name).join(", ")}</div>
                    )}
                    {assignments.open_leads.length > 0 && (
                      <div>• {assignments.open_leads.length} open lead(s): {assignments.open_leads.map((l) => l.name).join(", ")}</div>
                    )}
                    {assignments.assets_held.length > 0 && (
                      <div>• {assignments.assets_held.length} asset(s): {assignments.assets_held.map((a) => a.name).join(", ")}</div>
                    )}
                    <div>Consider reassigning these before deleting.</div>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-700">No active projects, open leads or assets assigned — safe to delete.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-user-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" data-testid="delete-user-confirm">
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {historyUser && <LoginHistoryDialog user={historyUser} onClose={() => setHistoryUser(null)} />}
    </div>
  );
}

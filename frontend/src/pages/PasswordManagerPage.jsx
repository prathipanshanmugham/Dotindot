import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import api, { apiError, formatINR } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KeyRound, Plus, Pencil, Trash2, Eye, ShieldCheck, ShieldAlert, Clock, Search, RefreshCw, Copy, EyeOff } from "lucide-react";
import { PasswordEntryDialog } from "@/pages/passwords/PasswordEntryDialog";
import { RevealDialog } from "@/pages/passwords/RevealDialog";

const STATUS = {
  ok: { label: "Healthy", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  due_soon: { label: "Due soon", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  overdue: { label: "Overdue", cls: "bg-red-50 text-red-700 border-red-200" },
  unknown: { label: "Never set", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const Stat = ({ label, value, tone, icon: Icon, testid }) => (
  <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4 flex items-center gap-3" data-testid={testid}>
    <span className={`h-9 w-9 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></span>
    <div><div className="text-2xl font-bold text-gray-900 font-mono leading-none">{value}</div><div className="text-[11px] uppercase tracking-widest text-gray-400 mt-1">{label}</div></div>
  </CardContent></Card>
);

export default function PasswordManagerPage() {
  const { hasPerm } = useAuth();
  const canReveal = hasPerm("password_manager.reveal");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({ twofa: "all", status: "all", search: "" });
  const [editing, setEditing] = useState(undefined); // undefined closed, null new, obj edit
  const [revealTarget, setRevealTarget] = useState(null); // {entry, mode}
  const [revealed, setRevealed] = useState({}); // id -> {password, until}

  const del = useRecordDelete({ coll: "password_entries", permKey: "password_manager.delete", rows, onDeleted: () => load() });
  const load = useCallback(() => {
    const params = {};
    if (filters.twofa !== "all") params.twofa = filters.twofa;
    if (filters.status !== "all") params.status = filters.status;
    if (filters.search.trim()) params.search = filters.search.trim();
    api.get("/passwords", { params }).then((r) => setRows(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/passwords/summary").then((r) => setSummary(r.data)).catch(() => {});
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  // Auto-hide revealed passwords after 30s
  useEffect(() => {
    const ids = Object.keys(revealed);
    if (!ids.length) return;
    const t = setInterval(() => {
      const now = Date.now();
      setRevealed((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.until > now)));
    }, 1000);
    return () => clearInterval(t);
  }, [revealed]);

  const remove = async (e) => {
    if (!window.confirm(`Delete "${e.name}" from the vault?`)) return;
    try { await api.delete(`/passwords/${e.id}`); toast.success("Entry deleted"); load(); } catch (err) { toast.error(apiError(err)); }
  };

  const onRevealed = (id, password, mode) => {
    if (mode === "copy") {
      navigator.clipboard?.writeText(password).then(() => {
        toast.success("Copied to clipboard — clears automatically in 30s");
        setTimeout(() => navigator.clipboard?.writeText("").catch(() => {}), 30000);
      }).catch(() => toast.error("Clipboard blocked by the browser — use Reveal instead"));
    } else {
      setRevealed((r) => ({ ...r, [id]: { password, until: Date.now() + 30000 } }));
    }
    setRevealTarget(null);
  };

  const copy = (pw) => { navigator.clipboard?.writeText(pw); toast.success("Copied — clipboard clears in 30s"); setTimeout(() => navigator.clipboard?.writeText("").catch(() => {}), 30000); };

  return (
    <div className="space-y-6 max-w-7xl" data-testid="password-manager-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><KeyRound className="h-6 w-6 text-[#F26B21]" /><h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Password Manager</h1></div>
          <p className="text-sm text-gray-500 mt-1">Encrypted vault for tool logins. Reveal requires your login password and auto-hides after 30 seconds. Reminders are in-app only.</p>
        </div>
        <Button onClick={() => setEditing(null)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="add-password-btn"><Plus className="h-4 w-4 mr-1.5" /> Add entry</Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="password-summary">
          <Stat label="Entries" value={summary.total} tone="bg-gray-100 text-gray-700" icon={KeyRound} testid="pw-stat-total" />
          <Stat label="Without 2FA" value={summary.without_2fa} tone="bg-red-50 text-red-600" icon={ShieldAlert} testid="pw-stat-2fa" />
          <Stat label="Overdue change" value={summary.overdue} tone="bg-red-50 text-red-600" icon={Clock} testid="pw-stat-overdue" />
          <Stat label="Due in 7 days" value={summary.due_soon} tone="bg-amber-50 text-amber-600" icon={Clock} testid="pw-stat-due" />
          <Stat label="Renewals 30d" value={summary.renewals_30d} tone="bg-blue-50 text-blue-600" icon={RefreshCw} testid="pw-stat-renewals" />
        </div>
      )}

      <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search tools…" className="pl-9" data-testid="pw-search-input" /></div>
        <Select value={filters.twofa} onValueChange={(v) => setFilters((f) => ({ ...f, twofa: v }))}>
          <SelectTrigger className="w-[150px]" data-testid="pw-filter-2fa"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">2FA: any</SelectItem><SelectItem value="on">2FA enabled</SelectItem><SelectItem value="off">2FA missing</SelectItem></SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
          <SelectTrigger className="w-[160px]" data-testid="pw-filter-status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="ok">Healthy</SelectItem><SelectItem value="due_soon">Due soon</SelectItem><SelectItem value="overdue">Overdue</SelectItem></SelectContent>
        </Select>
      </CardContent></Card>

      <Card className="border-gray-200/80 shadow-sm overflow-hidden"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-gray-50/70">
          <TableHead className="w-20">{del.canDelete && <><BulkDeleteBar kit={del} />{del.dialog}</>}</TableHead><TableHead>Tool</TableHead><TableHead>Username</TableHead><TableHead>Password</TableHead><TableHead>2FA</TableHead><TableHead>Change status</TableHead><TableHead>Renewal</TableHead><TableHead>Owner</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">No entries match.</TableCell></TableRow>}
          {rows.map((e) => {
            const st = STATUS[e.change_status] || STATUS.unknown;
            const rv = revealed[e.id];
            return (
              <TableRow key={e.id} data-testid={`pw-row-${e.id}`}><TableCell className="w-20"><RowDeleteControls kit={del} row={e} /></TableCell>
                <TableCell><div className="font-semibold text-gray-900">{e.name}</div>{e.login_url && <a href={e.login_url} target="_blank" rel="noreferrer" className="text-xs text-[#F26B21] hover:underline">{e.login_url.replace(/^https?:\/\//, "")}</a>}{e.plan && <div className="text-[11px] text-gray-400">{e.plan}{e.cost ? ` · ${formatINR(e.cost)}/yr` : ""}</div>}</TableCell>
                <TableCell className="text-sm text-gray-700 font-mono">{e.username}</TableCell>
                <TableCell>
                  {rv ? (
                    <div className="flex items-center gap-1.5" data-testid={`pw-revealed-${e.id}`}>
                      <code className="text-xs bg-gray-900 text-emerald-300 rounded px-2 py-1">{rv.password}</code>
                      <button onClick={() => copy(rv.password)} className="text-gray-400 hover:text-gray-700" data-testid={`pw-copy-${e.id}`}><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setRevealed((r) => { const n = { ...r }; delete n[e.id]; return n; })} className="text-gray-400 hover:text-gray-700"><EyeOff className="h-3.5 w-3.5" /></button>
                      <span className="text-[10px] text-gray-400 font-mono">{Math.max(0, Math.ceil((rv.until - Date.now()) / 1000))}s</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2"><span className="text-gray-400 tracking-widest">••••••••</span>
                      {e.has_password && canReveal && (
                        <>
                          <button onClick={() => setRevealTarget({ entry: e, mode: "reveal" })} className="text-gray-400 hover:text-[#F26B21]" data-testid={`pw-reveal-${e.id}`} title="Reveal (requires login password)"><Eye className="h-4 w-4" /></button>
                          <button onClick={() => setRevealTarget({ entry: e, mode: "copy" })} className="text-gray-400 hover:text-[#F26B21]" data-testid={`pw-copy-hidden-${e.id}`} title="Copy without showing (requires login password)"><Copy className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>{e.twofa_enabled ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><ShieldCheck className="h-3 w-3" />{(e.twofa_method || "on").toUpperCase()}</Badge> : <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1" data-testid={`pw-no2fa-${e.id}`}><ShieldAlert className="h-3 w-3" /> Off</Badge>}</TableCell>
                <TableCell><Badge variant="outline" className={st.cls} data-testid={`pw-status-${e.id}`}>{st.label}</Badge>{e.change_due_date && <div className="text-[11px] text-gray-400 mt-0.5">due {e.change_due_date}</div>}</TableCell>
                <TableCell className="text-sm text-gray-600">{e.renewal_date || "—"}</TableCell>
                <TableCell className="text-sm text-gray-600">{e.owner_name || <Badge variant="outline" className="bg-gray-50 text-gray-500 border-dashed text-[10px]" data-testid={`pw-unassigned-${e.id}`}>Unassigned</Badge>}{e.branch_name && <div className="text-[11px] text-gray-400">{e.branch_name}</div>}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(e)} data-testid={`pw-edit-${e.id}`}><Pencil className="h-3.5 w-3.5 text-gray-500" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(e)} data-testid={`pw-delete-${e.id}`}><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" /></Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table></div></Card>

      {editing !== undefined && <PasswordEntryDialog entry={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load(); }} />}
      {revealTarget && <RevealDialog entry={revealTarget.entry} mode={revealTarget.mode} onClose={() => setRevealTarget(null)} onRevealed={onRevealed} />}
    </div>
  );
}

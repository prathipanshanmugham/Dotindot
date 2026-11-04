import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Database, Pencil, Trash2, AlertTriangle, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { labelize } from "@/components/Badges";

const PREFERRED_COLS = ["name", "title", "number", "email", "action", "user_name", "platform", "period", "date", "status", "stage", "role", "city", "category", "amount", "code"];

const pickColumns = (items) => {
  if (!items?.length) return [];
  const sample = items[0];
  const cols = PREFERRED_COLS.filter((k) => k in sample);
  for (const k of Object.keys(sample)) {
    if (cols.length >= 4) break;
    if (!cols.includes(k) && k !== "id" && ["string", "number", "boolean"].includes(typeof sample[k])) cols.push(k);
  }
  return cols.slice(0, 4);
};

const cell = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return "{…}";
  return String(v).slice(0, 60);
};

// super_admin ONLY: browse/edit/hard-delete any record in any collection.
export const WorkspaceManager = () => {
  const [collections, setCollections] = useState([]);
  const [coll, setColl] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState({});
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState("");
  const [delTarget, setDelTarget] = useState(null); // {record, dependents|null, checked}
  const [singleConfirm, setSingleConfirm] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [cascadeBulk, setCascadeBulk] = useState(false);
  // v3.0: skip the recycle bin ("delete forever") + wipe a whole module
  const [forever, setForever] = useState(false);
  const [foreverBulk, setForeverBulk] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState("");

  useEffect(() => {
    api.get("/workspace/collections").then((r) => setCollections(r.data)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!coll) return;
    api.get(`/workspace/${coll}`, { params: { search: search || undefined, page, page_size: 20 } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(apiError(e)));
  }, [coll, search, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { setPage(1); setSelected({}); }, [coll, search]);

  const refreshCounts = () => {
    window.dispatchEvent(new Event("workspace-deleted"));
    return api.get("/workspace/collections").then((r) => setCollections(r.data)).catch(() => {});
  };

  const openEdit = (rec) => {
    setEditing(rec);
    setEditText(JSON.stringify(rec, null, 2));
  };

  const saveEdit = async () => {
    let body;
    try {
      body = JSON.parse(editText);
    } catch (e) {
      return toast.error("Invalid JSON — fix the syntax before saving");
    }
    try {
      await api.put(`/workspace/${coll}/${editing.id}`, body);
      toast.success("Record updated");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openDelete = async (rec) => {
    setSingleConfirm(""); setForever(false);
    setDelTarget({ record: rec, dependents: null, checked: false });
    try {
      const { data: res } = await api.get(`/workspace/${coll}/${rec.id}/dependents`);
      const deps = res.dependents || {};
      setDelTarget({ record: rec, dependents: Object.keys(deps).length ? deps : null, checked: true });
    } catch (e) {
      setDelTarget({ record: rec, dependents: null, checked: true });
    }
  };

  const doDelete = async (rid, cascade) => {
    try {
      await api.delete(`/workspace/${coll}/${rid}`, { params: { ...(cascade ? { cascade: true } : {}), ...(forever ? { permanent: true } : {}) } });
      toast.success(`${cascade ? "Record and dependents" : "Record"} deleted${forever ? " forever" : " — undo available for 24h"}`);
      setDelTarget(null);
      load();
      refreshCounts();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 409 && detail?.dependents) {
        // Safety net: wire the 409 body into the open dialog
        setDelTarget((t) => ({ ...t, dependents: detail.dependents, checked: true }));
        toast.warning("Dependent records found — cascade confirmation required");
      } else {
        toast.error(apiError(e));
      }
    }
  };

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const bulkDelete = async () => {
    try {
      const { data: res } = await api.post(`/workspace/${coll}/bulk-delete`, { ids: selectedIds, cascade: cascadeBulk, permanent: foreverBulk });
      toast.success(`${res.deleted} deleted${foreverBulk ? " forever" : ""}${res.skipped.length ? `, ${res.skipped.length} skipped` : ""}`);
      if (res.skipped.length) {
        toast.warning(res.skipped.slice(0, 3).map((s) => `${s.id.slice(0, 8)}: ${typeof s.reason === "string" ? s.reason : "blocked"}`).join(" · "));
      }
      setBulkOpen(false);
      setConfirmText("");
      setSelected({});
      load();
      refreshCounts();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const wipe = async () => {
    try {
      const { data: res } = await api.post(`/workspace/${coll}/wipe`, { confirm: wipeText });
      toast.success(`${res.deleted} records deleted forever`);
      setWipeOpen(false); setWipeText(""); setSelected({});
      load(); refreshCounts();
    } catch (e) { toast.error(apiError(e)); }
  };

  const collLabel = collections.find((c) => c.key === coll)?.label;
  const cols = pickColumns(data?.items);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid="workspace-manager">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Database className="h-4 w-4 text-[#F26B21]" /> Workspace data manager
        </CardTitle>
        <p className="text-xs text-gray-400">
          Super admin power tool — edit or <span className="font-semibold text-red-500">hard delete</span> any record in any module. Deleted records go to "Recently deleted" below for 24 hours — or tick <span className="font-semibold">Delete forever</span> to remove them for good straight away.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={coll} onValueChange={setColl}>
            <SelectTrigger className="sm:w-[260px]" data-testid="workspace-collection-select">
              <SelectValue placeholder="Pick a module / collection" />
            </SelectTrigger>
            <SelectContent>
              {collections.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label} ({c.count})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {coll && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records…" className="pl-9" data-testid="workspace-search-input" />
            </div>
          )}
          {coll && data?.total > 0 && (
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 shrink-0" onClick={() => { setWipeText(""); setWipeOpen(true); }} data-testid="workspace-wipe-btn">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete all…
            </Button>
          )}
        </div>

        {coll && data && (
          <>
            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5" data-testid="workspace-bulk-bar">
                <span className="text-sm font-semibold text-red-700">{selectedIds.length} selected</span>
                <Button size="sm" variant="destructive" onClick={() => { setConfirmText(""); setCascadeBulk(false); setForeverBulk(false); setBulkOpen(true); }} data-testid="workspace-bulk-delete-btn">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete selected
                </Button>
              </div>
            )}
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/70">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={data.items.length > 0 && data.items.every((r) => selected[r.id])}
                        onCheckedChange={(v) => {
                          const next = { ...selected };
                          data.items.forEach((r) => { next[r.id] = !!v; });
                          setSelected(next);
                        }}
                        data-testid="workspace-select-all"
                      />
                    </TableHead>
                    {cols.map((c) => <TableHead key={c}>{labelize(c)}</TableHead>)}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.length === 0 && (
                    <TableRow><TableCell colSpan={cols.length + 2} className="text-center py-8 text-sm text-gray-400">No records.</TableCell></TableRow>
                  )}
                  {data.items.map((r) => (
                    <TableRow key={r.id} data-testid={`workspace-row-${r.id}`}>
                      <TableCell>
                        <Checkbox checked={!!selected[r.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id]: !!v }))} data-testid={`workspace-select-${r.id}`} />
                      </TableCell>
                      {cols.map((c) => <TableCell key={c} className="text-sm text-gray-700 max-w-[220px] truncate">{cell(r[c])}</TableCell>)}
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} data-testid={`workspace-edit-${r.id}`}>
                          <Pencil className="h-3.5 w-3.5 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDelete(r)} data-testid={`workspace-delete-${r.id}`}>
                          <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{data.total} records</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="workspace-prev-page">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span>Page {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="workspace-next-page">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Edit record */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit record <span className="font-mono text-xs text-gray-400">{editing?.id}</span></DialogTitle></DialogHeader>
          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={16} className="font-mono text-xs" data-testid="workspace-edit-json" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="workspace-edit-save">Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single delete confirm (+ dependents cascade flow) */}
      <Dialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Permanently delete this record?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-gray-600">
            <p>
              <span className="font-mono text-xs bg-gray-100 rounded px-1.5 py-0.5">{delTarget?.record?.id}</span>
              {" — "}{forever ? <>This removes the record <span className="font-semibold text-red-600">forever</span>. It will not go to Recently deleted and cannot be restored.</> : <>This removes the record now. It stays in <span className="font-semibold">Recently deleted</span> for 24 hours (undo available), then is purged permanently.</>}
            </p>
            <label className="flex items-start gap-2 text-xs text-gray-600 rounded-lg border border-red-100 bg-red-50/50 p-2.5 cursor-pointer">
              <Checkbox checked={forever} onCheckedChange={(v) => { setForever(!!v); setSingleConfirm(""); }} className="mt-0.5" data-testid="workspace-delete-forever" />
              <span><span className="font-semibold text-red-700">Delete forever</span> — skip Recently deleted. No undo.</span>
            </label>
            {delTarget && !delTarget.checked && (
              <p className="text-xs text-gray-400" data-testid="workspace-dependents-checking">Checking for dependent records…</p>
            )}
            {delTarget?.dependents && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1" data-testid="workspace-dependents-warning">
                  <div className="font-bold">Dependent records found:</div>
                  {Object.entries(delTarget.dependents).map(([k, n]) => (
                    <div key={k} data-testid={`workspace-dependent-${k}`}>• {labelize(k)}: {n} record{n === 1 ? "" : "s"}</div>
                  ))}
                  <div>Cascade delete will remove or unlink them so no broken references remain.</div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-700">Type <span className="font-mono text-red-600">DELETE</span> to enable cascade delete:</p>
                  <Input
                    value={singleConfirm}
                    onChange={(e) => setSingleConfirm(e.target.value)}
                    placeholder="DELETE"
                    data-testid="workspace-delete-confirm-input"
                  />
                </div>
              </>
            )}
            {delTarget?.checked && !delTarget?.dependents && (
              <p className="text-xs text-emerald-700" data-testid="workspace-no-dependents">No dependent records — safe to delete this record only.</p>
            )}
            {forever && !delTarget?.dependents && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-700">Type <span className="font-mono text-red-600">DELETE</span> to confirm:</p>
                <Input value={singleConfirm} onChange={(e) => setSingleConfirm(e.target.value)} placeholder="DELETE" data-testid="workspace-delete-confirm-input" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTarget(null)} data-testid="workspace-delete-cancel">Cancel</Button>
            {delTarget?.dependents ? (
              <Button
                variant="destructive"
                disabled={singleConfirm !== "DELETE"}
                onClick={() => doDelete(delTarget.record.id, true)}
                data-testid="workspace-delete-cascade"
              >
                Cascade delete
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={!delTarget?.checked || (forever && singleConfirm !== "DELETE")}
                onClick={() => doDelete(delTarget.record.id, false)}
                data-testid="workspace-delete-confirm"
              >
                {forever ? "Delete forever" : "Delete permanently"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete: type DELETE to confirm */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Bulk delete {selectedIds.length} records
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-gray-600">
            <p>This removes {selectedIds.length} records from <span className="font-semibold">{collLabel}</span>. {foreverBulk ? <span className="font-semibold text-red-600">They are deleted forever — no undo.</span> : "They stay in Recently deleted for 24 hours (undo available), then are purged."}</p>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <Checkbox checked={foreverBulk} onCheckedChange={(v) => setForeverBulk(!!v)} data-testid="workspace-bulk-forever" />
              <span><span className="font-semibold text-red-700">Delete forever</span> — skip Recently deleted</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <Checkbox checked={cascadeBulk} onCheckedChange={(v) => setCascadeBulk(!!v)} data-testid="workspace-bulk-cascade" />
              Also cascade-delete/unlink dependent records (otherwise records with dependents are skipped)
            </label>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-700">Type <span className="font-mono text-red-600">DELETE</span> to confirm:</p>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" data-testid="workspace-bulk-confirm-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={confirmText !== "DELETE"} onClick={bulkDelete} data-testid="workspace-bulk-confirm-btn">
              Delete {selectedIds.length} records{foreverBulk ? " forever" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v3.0 wipe a whole module */}
      <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
        <DialogContent className="max-w-md" data-testid="workspace-wipe-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="h-5 w-5" /> Delete all {collLabel}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-gray-600">
            <p>Every record in <span className="font-semibold">{collLabel}</span> ({data?.total}) will be <span className="font-semibold text-red-600">deleted forever</span>. Linked records elsewhere are removed or unlinked the same way as a single delete. This skips Recently deleted and cannot be undone.</p>
            {coll === "users" && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">Super admin accounts and your own login are always kept.</p>}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-700">Type <span className="font-mono text-red-600">DELETE ALL</span> to confirm:</p>
              <Input value={wipeText} onChange={(e) => setWipeText(e.target.value)} placeholder="DELETE ALL" data-testid="workspace-wipe-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWipeOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={wipeText !== "DELETE ALL"} onClick={wipe} data-testid="workspace-wipe-confirm">Delete all forever</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

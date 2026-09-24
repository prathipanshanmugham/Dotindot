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
  const [delTarget, setDelTarget] = useState(null); // {record, dependents?}
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [cascadeBulk, setCascadeBulk] = useState(false);

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

  const refreshCounts = () => api.get("/workspace/collections").then((r) => setCollections(r.data)).catch(() => {});

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

  const doDelete = async (rid, cascade) => {
    try {
      await api.delete(`/workspace/${coll}/${rid}`, { params: cascade ? { cascade: true } : {} });
      toast.success(cascade ? "Record and dependents deleted" : "Record permanently deleted");
      setDelTarget(null);
      load();
      refreshCounts();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 409 && detail?.dependents) {
        setDelTarget((t) => ({ ...t, dependents: detail.dependents }));
      } else {
        toast.error(apiError(e));
      }
    }
  };

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const bulkDelete = async () => {
    try {
      const { data: res } = await api.post(`/workspace/${coll}/bulk-delete`, { ids: selectedIds, cascade: cascadeBulk });
      toast.success(`${res.deleted} deleted${res.skipped.length ? `, ${res.skipped.length} skipped` : ""}`);
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

  const cols = pickColumns(data?.items);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid="workspace-manager">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Database className="h-4 w-4 text-[#F26B21]" /> Workspace data manager
        </CardTitle>
        <p className="text-xs text-gray-400">
          Super admin power tool — edit or <span className="font-semibold text-red-500">permanently delete</span> any record. Deletes are true DB removals and cannot be undone.
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
        </div>

        {coll && data && (
          <>
            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5" data-testid="workspace-bulk-bar">
                <span className="text-sm font-semibold text-red-700">{selectedIds.length} selected</span>
                <Button size="sm" variant="destructive" onClick={() => { setConfirmText(""); setCascadeBulk(false); setBulkOpen(true); }} data-testid="workspace-bulk-delete-btn">
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDelTarget({ record: r })} data-testid={`workspace-delete-${r.id}`}>
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
              {" — "}This action is <span className="font-semibold text-red-600">permanent and cannot be undone</span>.
            </p>
            {delTarget?.dependents && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1" data-testid="workspace-dependents-warning">
                <div className="font-bold">Dependent records found:</div>
                {Object.entries(delTarget.dependents).map(([k, n]) => (
                  <div key={k}>• {labelize(k)}: {n} record{n === 1 ? "" : "s"}</div>
                ))}
                <div>Cascade delete will remove or unlink them so no broken references remain.</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTarget(null)} data-testid="workspace-delete-cancel">Cancel</Button>
            {delTarget?.dependents ? (
              <Button variant="destructive" onClick={() => doDelete(delTarget.record.id, true)} data-testid="workspace-delete-cascade">
                Delete with dependents
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => doDelete(delTarget.record.id, false)} data-testid="workspace-delete-confirm">
                Delete permanently
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
            <p>This permanently removes {selectedIds.length} records from <span className="font-semibold">{collections.find((c) => c.key === coll)?.label}</span>. It cannot be undone.</p>
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
              Delete {selectedIds.length} records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

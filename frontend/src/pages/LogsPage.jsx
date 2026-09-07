import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { labelize } from "@/components/Badges";
import ExportMenu from "@/components/ExportMenu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollText, Trash2, ShieldCheck, Clock, CalendarClock, ChevronLeft, ChevronRight, XCircle } from "lucide-react";

const actionStyle = (action) => {
  if (action === "login") return "bg-blue-50 text-blue-700 border-blue-200";
  if (action.includes("purge")) return "bg-red-50 text-red-600 border-red-200";
  if (action.includes("delete") || action.includes("deactivat")) return "bg-red-50 text-red-600 border-red-200";
  if (action.includes("create") || action.includes("assign")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (action.includes("update") || action.includes("marked")) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
};

const fmtTs = (iso) => {
  if (!iso) return "—";
  const dt = new Date(iso);
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const PAGE_SIZE = 25;

export default function LogsPage() {
  const [meta, setMeta] = useState(null);
  const [logs, setLogs] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ user_id: "all", action: "all", date_from: "", date_to: "" });
  const [purging, setPurging] = useState(false);

  const loadMeta = useCallback(() => {
    api.get("/logs/meta").then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  const loadLogs = useCallback(() => {
    const params = { page, page_size: PAGE_SIZE };
    if (filters.user_id !== "all") params.user_id = filters.user_id;
    if (filters.action !== "all") params.action = filters.action;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    api.get("/logs", { params }).then((r) => setLogs(r.data)).catch(() => {});
  }, [page, filters]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  const setFilter = (k, v) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({ user_id: "all", action: "all", date_from: "", date_to: "" });
  };

  const purgeNow = async () => {
    setPurging(true);
    try {
      const { data } = await api.post("/logs/purge");
      toast.success(`Purged ${data.deleted_count} log${data.deleted_count === 1 ? "" : "s"} older than 90 days`);
      loadMeta();
      loadLogs();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setPurging(false);
    }
  };

  const totalPages = logs ? Math.max(1, Math.ceil(logs.total / PAGE_SIZE)) : 1;
  const purge = meta?.purge;
  const hasFilters = filters.user_id !== "all" || filters.action !== "all" || filters.date_from || filters.date_to;

  return (
    <div className="space-y-6 max-w-7xl" data-testid="logs-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Activity Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Every login and record change across the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            dataset="logs"
            params={{
              ...(filters.user_id !== "all" && { user_id: filters.user_id }),
              ...(filters.action !== "all" && { action: filters.action }),
              ...(filters.date_from && { date_from: filters.date_from }),
              ...(filters.date_to && { date_to: filters.date_to }),
            }}
          />
          <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" disabled={purging} data-testid="purge-now-btn">
              <Trash2 className="h-4 w-4 mr-2" /> Purge old logs now
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Purge logs older than 90 days?</AlertDialogTitle>
              <AlertDialogDescription>
                {purge ? `${purge.purgeable_count} log entr${purge.purgeable_count === 1 ? "y is" : "ies are"} older than the 90-day retention window and will be permanently deleted.` : ""} This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="purge-cancel-btn">Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={purgeNow} data-testid="purge-confirm-btn">Purge now</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      {/* Retention info strip */}
      <Card className="border-gray-200/80 shadow-sm bg-[#FFF7ED]/50" data-testid="purge-info-strip">
        <CardContent className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-[#F26B21] shrink-0" />
            <div>
              <div className="font-semibold text-gray-800">90 days</div>
              <div className="text-xs text-gray-500">Retention window</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-[#F26B21] shrink-0" />
            <div>
              <div className="font-semibold text-gray-800" data-testid="purge-last-run">
                {purge?.last_run ? `${fmtTs(purge.last_run.run_at)} · ${purge.last_run.deleted_count} deleted` : "Never run"}
              </div>
              <div className="text-xs text-gray-500">Last purge {purge?.last_run ? `(${purge.last_run.trigger})` : ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <CalendarClock className="h-4 w-4 text-[#F26B21] shrink-0" />
            <div>
              <div className="font-semibold text-gray-800" data-testid="purge-next-run">{purge?.next_run ? fmtTs(purge.next_run) : "—"}</div>
              <div className="text-xs text-gray-500">Next scheduled run (daily)</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <ScrollText className="h-4 w-4 text-[#F26B21] shrink-0" />
            <div>
              <div className="font-semibold text-gray-800">
                {meta?.total_logs ?? "—"} total · <span className="text-red-600">{purge?.purgeable_count ?? 0} purgeable</span>
              </div>
              <div className="text-xs text-gray-500">Log entries</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filters.user_id} onValueChange={(v) => setFilter("user_id", v)}>
          <SelectTrigger className="w-48 bg-white" data-testid="logs-user-filter"><SelectValue placeholder="User" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {meta?.users?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.action} onValueChange={(v) => setFilter("action", v)}>
          <SelectTrigger className="w-48 bg-white" data-testid="logs-action-filter"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {meta?.actions?.map((a) => <SelectItem key={a} value={a}>{labelize(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40 bg-white" value={filters.date_from} onChange={(e) => setFilter("date_from", e.target.value)} data-testid="logs-date-from" />
        <span className="text-xs text-gray-400">to</span>
        <Input type="date" className="w-40 bg-white" value={filters.date_to} onChange={(e) => setFilter("date_to", e.target.value)} data-testid="logs-date-to" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500" data-testid="logs-clear-filters">
            <XCircle className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="border-gray-200/80 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-[11px] uppercase tracking-widest text-gray-400">
                <th className="px-5 py-3 font-semibold">When</th>
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Action</th>
                <th className="px-5 py-3 font-semibold">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!logs && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400">Loading...</td></tr>
              )}
              {logs?.items?.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400">No log entries match your filters.</td></tr>
              )}
              {logs?.items?.map((l) => (
                <tr key={l.id} className="hover:bg-orange-50/40 transition-colors" data-testid={`log-row-${l.id}`}>
                  <td className="px-5 py-3 whitespace-nowrap font-mono text-xs text-gray-500">{fmtTs(l.timestamp)}</td>
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-800">{l.user_name || "—"}</div>
                    <div className="text-[11px] text-gray-400">{l.user_email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className={`${actionStyle(l.action)} font-medium`}>{labelize(l.action)}</Badge>
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {l.entity_type ? (
                      <span>
                        <span className="text-[11px] uppercase tracking-wide text-gray-400 mr-1.5">{labelize(l.entity_type)}</span>
                        {l.entity_name || l.entity_id}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {logs && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span data-testid="logs-pagination-info">
            Showing {logs.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, logs.total)} of {logs.total}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="logs-prev-page">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-xs font-semibold text-gray-600">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="logs-next-page">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

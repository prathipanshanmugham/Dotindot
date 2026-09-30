import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, List, Instagram, Facebook,
  Linkedin, Youtube, Twitter, Music2, ExternalLink, Trash2, ArrowRightCircle,
} from "lucide-react";

const PLATFORMS = ["instagram", "facebook", "linkedin", "youtube", "x", "tiktok"];
const CONTENT_TYPES = ["reel", "static", "carousel", "story", "video", "blog"];
const STATUSES = ["planned", "in_review", "approved", "posted"];
const NEXT_STATUS = { planned: "in_review", in_review: "approved", approved: "posted" };

const PLATFORM_ICONS = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin, youtube: Youtube, x: Twitter, tiktok: Music2 };
const statusStyles = {
  planned: "bg-gray-100 text-gray-600 border-gray-200",
  in_review: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  posted: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const statusChip = {
  planned: "bg-gray-200 text-gray-700",
  in_review: "bg-amber-400/90 text-white",
  approved: "bg-blue-500 text-white",
  posted: "bg-emerald-500 text-white",
};

const PostStatusBadge = ({ status }) => (
  <Badge variant="outline" className={`${statusStyles[status] || ""} font-medium`}>{labelize(status)}</Badge>
);

const monthLabel = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
};

const POST_EMPTY = { client_id: "", platform: "instagram", scheduled_date: "", scheduled_time: "11:00", content_type: "static", caption: "", creative_link: "", status: "planned", assigned_to: "" };

export default function SocialPage() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [posts, setPosts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [view, setView] = useState("calendar");
  const [filters, setFilters] = useState({ client_id: "all", platform: "all", status: "all" });
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(POST_EMPTY);
  const [busy, setBusy] = useState(false);

  const canWrite = ["super_admin", "admin", "social_manager"].includes(user.role);

  const load = useCallback(() => {
    const params = { month };
    if (filters.client_id !== "all") params.client_id = filters.client_id;
    if (filters.platform !== "all") params.platform = filters.platform;
    if (filters.status !== "all") params.status = filters.status;
    api.get("/social/posts", { params }).then((r) => setPosts(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/social/summary", { params: { month } }).then((r) => setSummary(r.data)).catch(() => {});
  }, [month, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
    api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {});
  }, []);

  const shiftMonth = (delta) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const grid = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const startOffset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
    const days = new Date(y, m, 0).getDate();
    const byDay = {};
    posts.forEach((p) => {
      const key = (p.scheduled_at || "").slice(0, 10);
      (byDay[key] = byDay[key] || []).push(p);
    });
    return { startOffset, days, byDay, y, m };
  }, [month, posts]);

  const openCreate = (dateStr) => {
    setEditing(null);
    setForm({ ...POST_EMPTY, scheduled_date: dateStr || `${month}-01` });
    setDialogOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      client_id: p.client_id || "", platform: p.platform,
      scheduled_date: (p.scheduled_at || "").slice(0, 10),
      scheduled_time: (p.scheduled_at || "").slice(11, 16) || "11:00",
      content_type: p.content_type, caption: p.caption || "", creative_link: p.creative_link || "",
      status: p.status, assigned_to: p.assigned_to || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.scheduled_date) return toast.error("Schedule date is required");
    setBusy(true);
    const body = {
      client_id: form.client_id || null, platform: form.platform,
      scheduled_at: `${form.scheduled_date}T${form.scheduled_time || "11:00"}:00`,
      content_type: form.content_type, caption: form.caption, creative_link: form.creative_link,
      status: form.status, assigned_to: form.assigned_to || null,
    };
    try {
      if (editing) {
        await api.put(`/social/posts/${editing.id}`, body);
        toast.success("Post updated");
      } else {
        await api.post("/social/posts", body);
        toast.success("Post scheduled");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const advance = async (p) => {
    const next = NEXT_STATUS[p.status];
    if (!next) return;
    try {
      await api.post(`/social/posts/${p.id}/status`, { status: next });
      toast.success(`Moved to ${labelize(next)}`);
      load();
      if (editing?.id === p.id) setForm((f) => ({ ...f, status: next }));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (p) => {
    try {
      await api.delete(`/social/posts/${p.id}`);
      toast.success("Post deleted");
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const del = useRecordDelete({ coll: "social_posts", permKey: "social.delete", rows: posts, onDeleted: () => load() });
  return (
    <div className="space-y-5 max-w-7xl" data-testid="social-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Growth</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Social Media</h1>
          <p className="text-sm text-gray-500 mt-0.5">Post scheduling calendar and status tracking across client accounts.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="social-posts" params={{ month }} />
          {canWrite && (
            <Button onClick={() => openCreate()} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="add-post-btn">
              <Plus className="h-4 w-4 mr-1.5" /> Schedule post
            </Button>
          )}
        </div>
      </div>

      {/* Month nav + summary chips + view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(-1)} data-testid="month-prev"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="w-44 text-center text-sm font-bold text-gray-900" data-testid="month-label">{monthLabel(month)}</div>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftMonth(1)} data-testid="month-next"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {summary && (
          <div className="flex flex-wrap gap-1.5" data-testid="social-summary-chips">
            <Badge variant="outline" className="bg-gray-50 border-gray-200 text-gray-600">{summary.total} posts</Badge>
            {summary.by_status.map((s) => (
              <Badge key={s.name} variant="outline" className={`${statusStyles[s.name] || ""}`}>{s.value} {labelize(s.name)}</Badge>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {[["calendar", CalendarDays], ["list", List]].map(([v, Icon]) => (
              <button key={v} onClick={() => setView(v)} data-testid={`social-view-${v}`}
                className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors ${view === v ? "bg-[#F26B21] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                <Icon className="h-3.5 w-3.5" /> {labelize(v)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filters.client_id} onValueChange={(v) => setFilters((f) => ({ ...f, client_id: v }))}>
          <SelectTrigger className="w-[180px]" data-testid="social-client-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All clients</SelectItem>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.platform} onValueChange={(v) => setFilters((f) => ({ ...f, platform: v }))}>
          <SelectTrigger className="w-[150px]" data-testid="social-platform-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All platforms</SelectItem>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{labelize(p)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
          <SelectTrigger className="w-[150px]" data-testid="social-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {view === "calendar" ? (
        <Card className="border-gray-200/80 shadow-sm overflow-hidden" data-testid="social-calendar">
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/70">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: grid.startOffset }).map((_, i) => (
              <div key={`b${i}`} className="min-h-[92px] border-b border-r border-gray-50 bg-gray-50/40" />
            ))}
            {Array.from({ length: grid.days }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${month}-${String(day).padStart(2, "0")}`;
              const dayPosts = grid.byDay[dateStr] || [];
              const isToday = dateStr === new Date().toISOString().slice(0, 10);
              return (
                <div key={day} className={`min-h-[92px] border-b border-r border-gray-50 p-1.5 ${isToday ? "bg-[#FFF7ED]/60" : ""} ${canWrite ? "cursor-pointer hover:bg-orange-50/30" : ""}`}
                  onClick={() => canWrite && openCreate(dateStr)} data-testid={`cal-day-${day}`}>
                  <div className={`text-[11px] font-bold mb-1 ${isToday ? "text-[#F26B21]" : "text-gray-400"}`}>{day}</div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 3).map((p) => {
                      const Icon = PLATFORM_ICONS[p.platform] || Instagram;
                      return (
                        <button key={p.id} onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          className={`w-full flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold truncate ${statusChip[p.status]}`}
                          data-testid={`cal-post-${p.id}`} title={`${p.client_name || "Internal"} — ${p.caption}`}>
                          <Icon style={{ height: 10, width: 10 }} className="shrink-0" />
                          <span className="truncate">{p.client_name || labelize(p.content_type)}</span>
                        </button>
                      );
                    })}
                    {dayPosts.length > 3 && <div className="text-[9px] text-gray-400 pl-1">+{dayPosts.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="border-gray-200/80 shadow-sm overflow-hidden" data-testid="social-list">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/70"><TableHead className="w-20">{del.canDelete && <><BulkDeleteBar kit={del} />{del.dialog}</>}</TableHead>
                <TableHead>Scheduled</TableHead><TableHead>Client</TableHead><TableHead>Platform</TableHead>
                <TableHead>Type</TableHead><TableHead>Caption</TableHead><TableHead>Assigned</TableHead>
                <TableHead>Status</TableHead>{canWrite && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">No posts scheduled for this month.</TableCell></TableRow>
              )}
              {posts.map((p) => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-orange-50/40" onClick={() => canWrite && openEdit(p)} data-testid={`post-row-${p.id}`}><TableCell className="w-20"><RowDeleteControls kit={del} row={p} /></TableCell>
                  <TableCell className="text-sm font-medium">{(p.scheduled_at || "").replace("T", " ").slice(0, 16)}</TableCell>
                  <TableCell className="text-sm">{p.client_name || "Internal"}</TableCell>
                  <TableCell className="text-sm">{labelize(p.platform)}</TableCell>
                  <TableCell className="text-sm text-gray-500">{labelize(p.content_type)}</TableCell>
                  <TableCell className="text-sm text-gray-600 max-w-[240px] truncate">{p.caption}</TableCell>
                  <TableCell className="text-sm text-gray-500">{p.assigned_to_name || "—"}</TableCell>
                  <TableCell><PostStatusBadge status={p.status} /></TableCell>
                  {canWrite && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {NEXT_STATUS[p.status] && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-[#F26B21]" onClick={() => advance(p)} data-testid={`advance-post-${p.id}`}>
                          <ArrowRightCircle className="h-3.5 w-3.5 mr-1" /> {labelize(NEXT_STATUS[p.status])}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="post-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? "Edit post" : "Schedule post"}
              {editing && <PostStatusBadge status={form.status} />}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Client</Label>
              <Select value={form.client_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1" data-testid="post-form-client"><SelectValue placeholder="Client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Internal / dotindot</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
                <SelectTrigger className="mt-1" data-testid="post-form-platform"><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{labelize(p)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" className="mt-1" value={form.scheduled_date} onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))} data-testid="post-form-date" /></div>
            <div><Label>Time</Label><Input type="time" className="mt-1" value={form.scheduled_time} onChange={(e) => setForm((f) => ({ ...f, scheduled_time: e.target.value }))} /></div>
            <div>
              <Label>Content type</Label>
              <Select value={form.content_type} onValueChange={(v) => setForm((f) => ({ ...f, content_type: v }))}>
                <SelectTrigger className="mt-1" data-testid="post-form-type"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTENT_TYPES.map((t) => <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned to</Label>
              <Select value={form.assigned_to || "none"} onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1" data-testid="post-form-assigned"><SelectValue placeholder="Team member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {team.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Caption / idea</Label><Textarea rows={2} className="mt-1" value={form.caption} onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))} data-testid="post-form-caption" /></div>
            <div className="col-span-2">
              <Label>Creative link</Label>
              <div className="flex gap-2 mt-1">
                <Input value={form.creative_link} onChange={(e) => setForm((f) => ({ ...f, creative_link: e.target.value }))} placeholder="https://drive.google.com/..." />
                {form.creative_link && (
                  <Button variant="outline" size="icon" asChild><a href={form.creative_link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1" data-testid="post-form-status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={busy} className="flex-1 bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="post-form-submit">
              {busy ? "Saving..." : editing ? "Save changes" : "Schedule post"}
            </Button>
            {editing && NEXT_STATUS[editing.status] && (
              <Button variant="outline" onClick={() => advance(editing)} data-testid="post-dialog-advance">
                <ArrowRightCircle className="h-4 w-4 mr-1.5 text-[#F26B21]" /> {labelize(NEXT_STATUS[editing.status])}
              </Button>
            )}
            {editing && (
              <Button variant="outline" size="icon" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => remove(editing)} data-testid="post-dialog-delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

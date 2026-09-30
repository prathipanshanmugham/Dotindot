import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import api, { formatINR, apiError } from "@/lib/api";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Users2, Instagram, Youtube, Facebook, Linkedin, Music2, Twitter } from "lucide-react";

export const NICHES = ["fashion", "tech", "food", "travel", "fitness", "finance", "other"];
export const BOOKING_STATUSES = ["available", "negotiating", "booked", "blacklisted"];
export const INF_PLATFORMS = ["instagram", "youtube", "facebook", "linkedin", "tiktok", "x"];
export const PLATFORM_ICONS = { instagram: Instagram, youtube: Youtube, facebook: Facebook, linkedin: Linkedin, tiktok: Music2, x: Twitter };

const bookingStyles = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  negotiating: "bg-amber-50 text-amber-700 border-amber-200",
  booked: "bg-blue-50 text-blue-700 border-blue-200",
  blacklisted: "bg-red-50 text-red-600 border-red-200",
};

export const BookingBadge = ({ status }) => (
  <Badge variant="outline" className={`${bookingStyles[status] || ""} font-medium`}>{labelize(status)}</Badge>
);

export const fmtFollowers = (n) => (n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`);

const INF_EMPTY = {
  name: "", handle: "", niche: "food", booking_status: "available",
  contact_email: "", contact_phone: "", manager_name: "", notes: "",
  ig_followers: "", ig_engagement: "", yt_followers: "", yt_engagement: "",
  rate_reel: "", rate_post: "", rate_story: "", rate_video: "",
};

export const buildInfluencerBody = (form) => {
  const platforms = [];
  if (Number(form.ig_followers)) platforms.push({ platform: "instagram", followers: Number(form.ig_followers), engagement_rate: Number(form.ig_engagement) || 0 });
  if (Number(form.yt_followers)) platforms.push({ platform: "youtube", followers: Number(form.yt_followers), engagement_rate: Number(form.yt_engagement) || 0 });
  const rate_card = {};
  [["reel", form.rate_reel], ["post", form.rate_post], ["story", form.rate_story], ["video", form.rate_video]].forEach(([k, v]) => {
    if (Number(v)) rate_card[k] = Number(v);
  });
  return {
    name: form.name, handle: form.handle.startsWith("@") ? form.handle : `@${form.handle}`,
    niche: form.niche, booking_status: form.booking_status, contact_email: form.contact_email,
    contact_phone: form.contact_phone, manager_name: form.manager_name, notes: form.notes,
    platforms, rate_card,
  };
};

export default function InfluencersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ niche: "all", booking_status: "all", platform: "all", search: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(INF_EMPTY);
  const [busy, setBusy] = useState(false);

  const canWrite = ["super_admin", "admin", "social_manager", "sales"].includes(user.role);

  const load = useCallback(() => {
    const params = {};
    if (filters.niche !== "all") params.niche = filters.niche;
    if (filters.booking_status !== "all") params.booking_status = filters.booking_status;
    if (filters.platform !== "all") params.platform = filters.platform;
    if (filters.search.trim()) params.search = filters.search.trim();
    api.get("/influencers", { params }).then((r) => setRows(r.data)).catch((e) => toast.error(apiError(e)));
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.handle.trim()) return toast.error("Name and handle are required");
    setBusy(true);
    try {
      const { data } = await api.post("/influencers", buildInfluencerBody(form));
      toast.success("Influencer added");
      setCreateOpen(false);
      setForm(INF_EMPTY);
      navigate(`/influencers/${data.id}`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const del = useRecordDelete({ coll: "influencers", permKey: "influencers.delete", rows: rows, onDeleted: () => load() });
  return (
    <div className="space-y-6 max-w-7xl" data-testid="influencers-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Growth</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Influencers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Directory, rate cards and past collaborations for creator partnerships.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu dataset="influencers" params={{
            ...(filters.niche !== "all" && { niche: filters.niche }),
            ...(filters.booking_status !== "all" && { booking_status: filters.booking_status }),
          }} />
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="add-influencer-btn">
              <Plus className="h-4 w-4 mr-1.5" /> Add influencer
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9 w-56" placeholder="Search name or handle..." value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} data-testid="influencer-search" />
        </div>
        <Select value={filters.niche} onValueChange={(v) => setFilters((f) => ({ ...f, niche: v }))}>
          <SelectTrigger className="w-[140px]" data-testid="influencer-niche-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All niches</SelectItem>{NICHES.map((n) => <SelectItem key={n} value={n}>{labelize(n)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.booking_status} onValueChange={(v) => setFilters((f) => ({ ...f, booking_status: v }))}>
          <SelectTrigger className="w-[150px]" data-testid="influencer-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{BOOKING_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.platform} onValueChange={(v) => setFilters((f) => ({ ...f, platform: v }))}>
          <SelectTrigger className="w-[150px]" data-testid="influencer-platform-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All platforms</SelectItem>{INF_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{labelize(p)}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.length === 0 && (
          <Card className="border-gray-200/80 col-span-full">
            <CardContent className="py-14 text-center text-sm text-gray-400">
              <Users2 className="h-7 w-7 mx-auto mb-2 text-gray-300" /> No influencers match these filters.
            </CardContent>
          </Card>
        )}
        {del.canDelete && <div className="flex justify-end">{del.dialog}<BulkDeleteBar kit={del} /></div>}
        {rows.map((inf) => (
          <Card key={inf.id} className="border-gray-200/80 shadow-sm cursor-pointer hover:border-orange-300 transition-all"
            onClick={() => navigate(`/influencers/${inf.id}`)} data-testid={`influencer-card-${inf.id}`}>
            <CardContent className="p-5"><div className="flex justify-end -mb-6 relative z-10"><RowDeleteControls kit={del} row={inf} /></div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 truncate">{inf.name}</div>
                  <div className="text-xs text-[#F26B21] font-semibold">{inf.handle}</div>
                </div>
                <BookingBadge status={inf.booking_status} />
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]">{labelize(inf.niche)}</Badge>
                {(inf.platforms || []).map((p) => {
                  const Icon = PLATFORM_ICONS[p.platform] || Instagram;
                  return (
                    <span key={p.platform} className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Icon style={{ height: 12, width: 12 }} /> {fmtFollowers(p.followers)}
                    </span>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-50 py-2">
                  <div className="text-sm font-bold text-gray-900">{fmtFollowers(inf.total_followers)}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">Reach</div>
                </div>
                <div className="rounded-lg bg-gray-50 py-2">
                  <div className="text-sm font-bold text-gray-900">{inf.avg_engagement}%</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">Engagement</div>
                </div>
                <div className="rounded-lg bg-gray-50 py-2">
                  <div className="text-sm font-bold text-gray-900 font-mono">{inf.rate_card?.reel ? formatINR(inf.rate_card.reel) : "—"}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">Per reel</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-gray-400">{(inf.collaborations || []).length} past collaboration{(inf.collaborations || []).length === 1 ? "" : "s"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="influencer-form-dialog">
          <DialogHeader><DialogTitle>Add influencer</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="influencer-form-name" /></div>
            <div><Label>Handle</Label><Input className="mt-1" placeholder="@handle" value={form.handle} onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))} data-testid="influencer-form-handle" /></div>
            <div>
              <Label>Niche</Label>
              <Select value={form.niche} onValueChange={(v) => setForm((f) => ({ ...f, niche: v }))}>
                <SelectTrigger className="mt-1" data-testid="influencer-form-niche"><SelectValue /></SelectTrigger>
                <SelectContent>{NICHES.map((n) => <SelectItem key={n} value={n}>{labelize(n)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Booking status</Label>
              <Select value={form.booking_status} onValueChange={(v) => setForm((f) => ({ ...f, booking_status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{BOOKING_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Email</Label><Input className="mt-1" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} /></div>
            <div><Label>Manager (optional)</Label><Input className="mt-1" value={form.manager_name} onChange={(e) => setForm((f) => ({ ...f, manager_name: e.target.value }))} /></div>
            <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-gray-400 pt-1">Audience</div>
            <div><Label>Instagram followers</Label><Input type="number" className="mt-1" value={form.ig_followers} onChange={(e) => setForm((f) => ({ ...f, ig_followers: e.target.value }))} /></div>
            <div><Label>IG engagement %</Label><Input type="number" className="mt-1" value={form.ig_engagement} onChange={(e) => setForm((f) => ({ ...f, ig_engagement: e.target.value }))} /></div>
            <div><Label>YouTube subscribers</Label><Input type="number" className="mt-1" value={form.yt_followers} onChange={(e) => setForm((f) => ({ ...f, yt_followers: e.target.value }))} /></div>
            <div><Label>YT engagement %</Label><Input type="number" className="mt-1" value={form.yt_engagement} onChange={(e) => setForm((f) => ({ ...f, yt_engagement: e.target.value }))} /></div>
            <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-gray-400 pt-1">Rate card (₹)</div>
            <div><Label>Reel</Label><Input type="number" className="mt-1" value={form.rate_reel} onChange={(e) => setForm((f) => ({ ...f, rate_reel: e.target.value }))} data-testid="influencer-form-rate-reel" /></div>
            <div><Label>Post</Label><Input type="number" className="mt-1" value={form.rate_post} onChange={(e) => setForm((f) => ({ ...f, rate_post: e.target.value }))} /></div>
            <div><Label>Story</Label><Input type="number" className="mt-1" value={form.rate_story} onChange={(e) => setForm((f) => ({ ...f, rate_story: e.target.value }))} /></div>
            <div><Label>Video</Label><Input type="number" className="mt-1" value={form.rate_video} onChange={(e) => setForm((f) => ({ ...f, rate_video: e.target.value }))} /></div>
          </div>
          <Button onClick={create} disabled={busy} className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="influencer-form-submit">
            {busy ? "Saving..." : "Add influencer"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import { BookingBadge, BOOKING_STATUSES, PLATFORM_ICONS, fmtFollowers } from "@/pages/InfluencersPage";
import { labelize } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2, Plus, Mail, Phone, UserRound, Instagram } from "lucide-react";

const COLLAB_EMPTY = { client_id: "", campaign_name: "", date: "", deliverable: "", amount: "", note: "" };

export default function InfluencerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [inf, setInf] = useState(null);
  const [clients, setClients] = useState([]);
  const [collabOpen, setCollabOpen] = useState(false);
  const [collab, setCollab] = useState(COLLAB_EMPTY);
  const [busy, setBusy] = useState(false);

  const canWrite = ["super_admin", "admin", "social_manager", "sales"].includes(user.role);

  const load = useCallback(() => {
    api.get(`/influencers/${id}`).then((r) => setInf(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
  }, []);

  if (!inf)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const setStatus = async (v) => {
    try {
      await api.put(`/influencers/${id}`, { booking_status: v });
      setInf((p) => ({ ...p, booking_status: v }));
      toast.success(`Status set to ${labelize(v)}`);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const addCollab = async () => {
    if (!collab.campaign_name.trim() || !collab.date) return toast.error("Campaign name and date are required");
    setBusy(true);
    try {
      const { data } = await api.post(`/influencers/${id}/collabs`, {
        ...collab, client_id: collab.client_id || null, amount: Number(collab.amount) || 0,
      });
      setInf(data);
      setCollabOpen(false);
      setCollab(COLLAB_EMPTY);
      toast.success("Collaboration recorded");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/influencers/${id}`);
      toast.success("Influencer removed");
      navigate("/influencers");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const totalCollabValue = (inf.collaborations || []).reduce((s, c) => s + (c.amount || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl" data-testid="influencer-detail-page">
      <button onClick={() => navigate("/influencers")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21] transition-colors" data-testid="back-to-influencers">
        <ArrowLeft className="h-4 w-4" /> Back to directory
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900" data-testid="influencer-name">{inf.name}</h1>
            <BookingBadge status={inf.booking_status} />
            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">{labelize(inf.niche)}</Badge>
          </div>
          <p className="text-sm text-[#F26B21] font-semibold mt-1">{inf.handle}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
            {inf.contact_email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" />{inf.contact_email}</span>}
            {inf.contact_phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-gray-400" />{inf.contact_phone}</span>}
            {inf.manager_name && <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-gray-400" />Managed by {inf.manager_name}</span>}
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Select value={inf.booking_status} onValueChange={setStatus}>
              <SelectTrigger className="w-[150px]" data-testid="influencer-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>{BOOKING_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
            </Select>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" data-testid="delete-influencer-btn"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {inf.name}?</AlertDialogTitle>
                  <AlertDialogDescription>The rate card and collaboration history will be deleted.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-influencer">Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Audience + rate card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-gray-200/80 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs font-bold uppercase tracking-widest text-[#F26B21] mb-3">Audience</div>
            <div className="space-y-2" data-testid="influencer-platforms">
              {(inf.platforms || []).map((p) => {
                const Icon = PLATFORM_ICONS[p.platform] || Instagram;
                return (
                  <div key={p.platform} className="flex items-center justify-between rounded-lg bg-gray-50 px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-medium text-gray-700"><Icon style={{ height: 15, width: 15 }} /> {labelize(p.platform)}</span>
                    <span className="text-sm"><span className="font-bold">{fmtFollowers(p.followers)}</span> <span className="text-xs text-gray-400 ml-2">{p.engagement_rate}% eng.</span></span>
                  </div>
                );
              })}
              {(inf.platforms || []).length === 0 && <p className="text-sm text-gray-400">No platform data.</p>}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              <span>Total reach: <b className="text-gray-800">{fmtFollowers(inf.total_followers)}</b></span>
              <span>Avg engagement: <b className="text-gray-800">{inf.avg_engagement}%</b></span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-200/80 shadow-sm">
          <CardContent className="p-5">
            <div className="text-xs font-bold uppercase tracking-widest text-[#F26B21] mb-3">Rate card</div>
            <div className="grid grid-cols-2 gap-2" data-testid="influencer-rate-card">
              {["reel", "post", "story", "video"].map((k) => (
                <div key={k} className="rounded-lg border border-gray-200 px-3.5 py-2.5">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">{labelize(k)}</div>
                  <div className="font-mono font-bold text-gray-900">{inf.rate_card?.[k] ? formatINR(inf.rate_card[k]) : "—"}</div>
                </div>
              ))}
            </div>
            {inf.notes && <p className="mt-3 text-xs text-gray-500 whitespace-pre-wrap">{inf.notes}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Collaborations */}
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-[#F26B21]">Past collaborations</div>
              <p className="text-xs text-gray-400 mt-0.5">{(inf.collaborations || []).length} collabs · {formatINR(totalCollabValue)} total value</p>
            </div>
            {canWrite && (
              <Button size="sm" variant="outline" onClick={() => setCollabOpen(true)} data-testid="add-collab-btn">
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Record collaboration
              </Button>
            )}
          </div>
          <div className="space-y-2" data-testid="collab-list">
            {(inf.collaborations || []).length === 0 && <p className="text-sm text-gray-400">No collaborations recorded yet.</p>}
            {(inf.collaborations || []).map((c) => (
              <div key={c.id} className="rounded-lg border border-gray-200 px-4 py-3" data-testid={`collab-${c.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-gray-800">{c.campaign_name}</span>
                    {c.client_name && <span className="text-xs text-gray-400 ml-2">for {c.client_name}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{c.date}</span>
                    <span className="font-mono text-sm font-bold">{formatINR(c.amount)}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">{c.deliverable}{c.note ? ` — ${c.note}` : ""}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add collab dialog */}
      <Dialog open={collabOpen} onOpenChange={setCollabOpen}>
        <DialogContent className="max-w-md" data-testid="collab-dialog">
          <DialogHeader><DialogTitle>Record collaboration</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Client</Label>
              <Select value={collab.client_id || "none"} onValueChange={(v) => setCollab((c) => ({ ...c, client_id: v === "none" ? "" : v }))}>
                <SelectTrigger className="mt-1" data-testid="collab-client"><SelectValue placeholder="Client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Internal / other</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Campaign name</Label><Input className="mt-1" value={collab.campaign_name} onChange={(e) => setCollab((c) => ({ ...c, campaign_name: e.target.value }))} data-testid="collab-campaign" /></div>
            <div><Label>Date</Label><Input type="date" className="mt-1" value={collab.date} onChange={(e) => setCollab((c) => ({ ...c, date: e.target.value }))} data-testid="collab-date" /></div>
            <div><Label>Amount (₹)</Label><Input type="number" className="mt-1" value={collab.amount} onChange={(e) => setCollab((c) => ({ ...c, amount: e.target.value }))} data-testid="collab-amount" /></div>
            <div className="col-span-2"><Label>Deliverable</Label><Input className="mt-1" placeholder="e.g. 2 reels + 3 stories" value={collab.deliverable} onChange={(e) => setCollab((c) => ({ ...c, deliverable: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Outcome note</Label><Input className="mt-1" value={collab.note} onChange={(e) => setCollab((c) => ({ ...c, note: e.target.value }))} /></div>
          </div>
          <Button onClick={addCollab} disabled={busy} className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="collab-submit">
            {busy ? "Saving..." : "Record collaboration"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

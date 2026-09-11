import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError } from "@/lib/api";
import { LEAD_STAGES, STAGE_STYLES, QUOTE_STATUS_STYLES } from "@/components/SalesLayout";
import { labelize } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Phone, Mail, Users2, StickyNote, Sparkles, ExternalLink, FileText, Plus } from "lucide-react";
import { toast } from "sonner";

const KIND_ICONS = { call: Phone, email: Mail, meeting: Users2, note: StickyNote };
const INDUSTRIES = ["real-estate", "healthcare", "e-commerce", "restaurant", "fintech", "saas", "other"];
const SERVICES = ["web_dev", "marketing", "ai", "retainer", "one_off"];

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lead, setLead] = useState(null);
  const [activity, setActivity] = useState({ kind: "call", text: "", date: "", follow_up_date: "" });
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertMode, setConvertMode] = useState("new_client");
  const [clients, setClients] = useState([]);
  const [existingClientId, setExistingClientId] = useState("");
  const [newClient, setNewClient] = useState({});
  const [busy, setBusy] = useState(false);

  const canWrite = ["super_admin", "admin", "sales"].includes(user.role);

  const load = useCallback(() => {
    api.get(`/sales/leads/${id}`).then((r) => {
      setLead(r.data);
      setNewClient({
        name: r.data.name, company: r.data.company, industry: "other", service_type: "web_dev",
        size: "small", status: "active", retainer: false, region: r.data.region, city: r.data.city,
      });
    }).catch((e) => toast.error(apiError(e)));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (convertOpen) api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
  }, [convertOpen]);

  if (!lead)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const changeStage = async (stage) => {
    try {
      await api.post(`/sales/leads/${id}/stage`, { stage });
      toast.success(`Stage → ${labelize(stage)}`);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const addActivity = async () => {
    if (!activity.text.trim()) { toast.error("Activity text required"); return; }
    try {
      await api.post(`/sales/leads/${id}/activities`, {
        ...activity,
        date: activity.date || undefined,
        follow_up_date: activity.follow_up_date || null,
      });
      toast.success("Activity logged");
      setActivity({ kind: "call", text: "", date: "", follow_up_date: "" });
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const convert = async (startProject) => {
    setBusy(true);
    try {
      const payload = convertMode === "existing_client"
        ? { mode: "existing_client", client_id: existingClientId }
        : { mode: "new_client", client: newClient };
      const { data } = await api.post(`/sales/leads/${id}/convert`, payload);
      toast.success(`Converted to client: ${data.client_name}`);
      setConvertOpen(false);
      if (startProject) {
        navigate(`/projects/new?client=${data.client_id}&budget=${lead.estimated_value || 0}`);
      } else {
        load();
      }
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const acceptedQuote = (lead.quotes || []).find((q) => q.status === "accepted");

  return (
    <div className="space-y-6 max-w-6xl" data-testid="lead-detail-page">
      <button onClick={() => navigate("/sales/pipeline")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21] transition-colors" data-testid="back-to-pipeline">
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900" data-testid="lead-name-heading">{lead.name}</h1>
            <Badge variant="outline" className={`${STAGE_STYLES[lead.stage]} font-semibold`} data-testid={`lead-stage-badge-${lead.stage}`}>{labelize(lead.stage)}</Badge>
            {lead.converted_client_id && (
              <Link to={`/clients/${lead.converted_client_id}`}>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1" data-testid="converted-badge">
                  Converted → {lead.converted_client_name} <ExternalLink className="h-3 w-3" />
                </Badge>
              </Link>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {lead.company} · {labelize(lead.source)} · {lead.city}{lead.region ? `, ${lead.region}` : ""} · Owner: {lead.owner_name}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{lead.contact_email} · {lead.contact_phone} {lead.follow_up_date ? `· Follow-up: ${lead.follow_up_date}` : ""}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono text-[#F26B21]" data-testid="lead-value">{formatINR(lead.estimated_value)}</div>
          <div className="text-xs text-gray-400">{lead.service_interest || "Estimated value"}</div>
        </div>
      </div>

      {/* Stage stepper */}
      <Card className="border-gray-200/80">
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          {LEAD_STAGES.map((s) => (
            <button
              key={s}
              disabled={!canWrite || !!lead.converted_client_id}
              onClick={() => changeStage(s)}
              data-testid={`stage-btn-${s}`}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
                lead.stage === s ? "bg-[#F26B21] text-white" :
                s === "lost" ? "bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500" :
                "bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-[#F26B21]"
              }`}
            >
              {labelize(s)}
            </button>
          ))}
          {canWrite && lead.stage === "won" && !lead.converted_client_id && (
            <Button size="sm" onClick={() => setConvertOpen(true)} data-testid="convert-lead-btn"
              className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Convert to Client
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity timeline */}
        <Card className="border-gray-200/80" data-testid="lead-activity-card">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Activity timeline</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {canWrite && (
              <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="flex gap-2">
                  <Select value={activity.kind} onValueChange={(v) => setActivity((p) => ({ ...p, kind: v }))}>
                    <SelectTrigger className="w-[120px]" data-testid="activity-kind-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["call", "email", "meeting", "note"].map((k) => <SelectItem key={k} value={k}>{labelize(k)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" className="w-[150px]" value={activity.date} onChange={(e) => setActivity((p) => ({ ...p, date: e.target.value }))} data-testid="activity-date-input" />
                  <Input type="date" className="w-[150px]" title="Set follow-up date" value={activity.follow_up_date} onChange={(e) => setActivity((p) => ({ ...p, follow_up_date: e.target.value }))} data-testid="activity-followup-input" />
                </div>
                <Textarea rows={2} placeholder="What happened? (call summary, email sent, meeting notes...)" value={activity.text} onChange={(e) => setActivity((p) => ({ ...p, text: e.target.value }))} data-testid="activity-text-input" />
                <Button size="sm" onClick={addActivity} data-testid="add-activity-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Log activity
                </Button>
              </div>
            )}
            <div className="relative space-y-4">
              {(lead.activities || []).length === 0 && <p className="text-sm text-gray-400">No activity yet.</p>}
              {(lead.activities || []).map((a) => {
                const Icon = KIND_ICONS[a.kind] || StickyNote;
                return (
                  <div key={a.id} className="flex gap-3" data-testid={`activity-item-${a.id}`}>
                    <div className="h-8 w-8 rounded-full bg-[#FFF7ED] flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-[#F26B21]" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">{a.date} · {labelize(a.kind)} · {a.created_by_name}</div>
                      <div className="text-sm text-gray-800">{a.text}</div>
                      {a.follow_up_date && <div className="text-[11px] text-amber-600 mt-0.5">Follow-up: {a.follow_up_date}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Quotes + notes */}
        <div className="space-y-4">
          <Card className="border-gray-200/80" data-testid="lead-quotes-card">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-semibold">Quotes</CardTitle>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/sales/quotes/new?lead=${id}`)} data-testid="new-quote-for-lead-btn">
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> New quote
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {(lead.quotes || []).length === 0 && <p className="text-sm text-gray-400">No quotes for this lead.</p>}
              {(lead.quotes || []).map((q) => (
                <Link key={q.id} to={`/sales/quotes/${q.id}`} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 hover:border-orange-300 transition-colors" data-testid={`lead-quote-${q.id}`}>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{q.number} · {q.title}</div>
                    <div className="text-xs text-gray-400">Valid till {q.validity_date}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{formatINR(q.total)}</span>
                    <Badge variant="outline" className={QUOTE_STATUS_STYLES[q.status]}>{labelize(q.status)}</Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          {lead.notes && (
            <Card className="border-gray-200/80">
              <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Notes</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-gray-700 whitespace-pre-wrap" data-testid="lead-notes">{lead.notes}</p></CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Convert dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Convert "{lead.name}" to client</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {acceptedQuote && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                Accepted quote {acceptedQuote.number} · {formatINR(acceptedQuote.total)} — will prefill project budget.
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setConvertMode("new_client")} data-testid="convert-mode-new"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${convertMode === "new_client" ? "border-[#F26B21] bg-orange-50 text-[#F26B21]" : "border-gray-200 text-gray-500"}`}>
                Create new client
              </button>
              <button onClick={() => setConvertMode("existing_client")} data-testid="convert-mode-existing"
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${convertMode === "existing_client" ? "border-[#F26B21] bg-orange-50 text-[#F26B21]" : "border-gray-200 text-gray-500"}`}>
                Link existing client
              </button>
            </div>
            {convertMode === "new_client" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2"><Label>Client name</Label><Input data-testid="convert-client-name" value={newClient.name || ""} onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Company</Label><Input value={newClient.company || ""} onChange={(e) => setNewClient((p) => ({ ...p, company: e.target.value }))} /></div>
                <div className="space-y-1">
                  <Label>Industry</Label>
                  <Select value={newClient.industry} onValueChange={(v) => setNewClient((p) => ({ ...p, industry: v }))}>
                    <SelectTrigger data-testid="convert-client-industry"><SelectValue /></SelectTrigger>
                    <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{labelize(i)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Service type</Label>
                  <Select value={newClient.service_type} onValueChange={(v) => setNewClient((p) => ({ ...p, service_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SERVICES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={!!newClient.retainer} onCheckedChange={(v) => setNewClient((p) => ({ ...p, retainer: v }))} />
                  <Label className="text-sm">Retainer</Label>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Existing client</Label>
                <Select value={existingClientId} onValueChange={setExistingClientId}>
                  <SelectTrigger data-testid="convert-existing-select"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button variant="outline" disabled={busy || (convertMode === "existing_client" && !existingClientId)} onClick={() => convert(false)} data-testid="convert-only-btn">
              Convert only
            </Button>
            <Button disabled={busy || (convertMode === "existing_client" && !existingClientId)} onClick={() => convert(true)} data-testid="convert-and-project-btn"
              className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              {busy ? "Converting..." : "Convert + start project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

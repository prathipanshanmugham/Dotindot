import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatINR, apiError, daysUntil } from "@/lib/api";
import SalesLayout, { LEAD_STAGES, LEAD_SOURCES, STAGE_STYLES } from "@/components/SalesLayout";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, ChevronRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const EMPTY = { name: "", company: "", contact_email: "", contact_phone: "", source: "website", estimated_value: "", service_interest: "", region: "India", city: "", owner_id: "", follow_up_date: "", notes: "" };

export default function PipelinePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [team, setTeam] = useState([]);
  const [filters, setFilters] = useState({ source: "all", owner: "all" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const canWrite = ["super_admin", "admin", "sales"].includes(user.role);

  useEffect(() => {
    api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const params = {};
    if (filters.source !== "all") params.source = filters.source;
    if (filters.owner !== "all") params.owner = filters.owner;
    const { data } = await api.get("/sales/leads", { params });
    setLeads(data);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const changeStage = async (leadId, stage) => {
    try {
      await api.post(`/sales/leads/${leadId}/stage`, { stage });
      toast.success(`Moved to ${labelize(stage)}`);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const createLead = async () => {
    if (!form.name.trim()) { toast.error("Lead name required"); return; }
    setBusy(true);
    try {
      await api.post("/sales/leads", {
        ...form,
        estimated_value: Number(form.estimated_value) || 0,
        owner_id: form.owner_id || null,
        follow_up_date: form.follow_up_date || null,
      });
      toast.success("Lead created");
      setDialogOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <SalesLayout
      title="Pipeline"
      subtitle={`${leads.length} leads in view`}
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu
            dataset="leads"
            params={{
              ...(filters.source !== "all" && { source: filters.source }),
              ...(filters.owner !== "all" && { owner: filters.owner }),
            }}
          />
          {canWrite && (
            <Button onClick={() => setDialogOpen(true)} data-testid="add-lead-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> New Lead
            </Button>
          )}
        </div>
      }
    >
      {/* Filters */}
      <Card className="border-gray-200/80">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Select value={filters.source} onValueChange={(v) => setFilters((p) => ({ ...p, source: v }))}>
            <SelectTrigger className="w-[170px]" data-testid="pipeline-source-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.owner} onValueChange={(v) => setFilters((p) => ({ ...p, owner: v }))}>
            <SelectTrigger className="w-[180px]" data-testid="pipeline-owner-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Kanban — horizontal scroll on mobile, grid on xl */}
      <div className="flex gap-3 overflow-x-auto pb-3 xl:grid xl:grid-cols-6 xl:overflow-visible xl:pb-0" data-testid="pipeline-board">
        {LEAD_STAGES.map((stage) => {
          const col = leads.filter((l) => l.stage === stage);
          const value = col.reduce((s, l) => s + (l.estimated_value || 0), 0);
          return (
            <div key={stage} className="rounded-xl bg-gray-50/80 border border-gray-200/70 flex flex-col w-[250px] shrink-0 xl:w-auto xl:shrink" data-testid={`kanban-column-${stage}`}>
              <div className="px-3 py-2.5 border-b border-gray-200/70">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={`${STAGE_STYLES[stage]} font-semibold`}>{labelize(stage)}</Badge>
                  <span className="text-xs font-bold text-gray-500">{col.length}</span>
                </div>
                <div className="text-[11px] font-mono text-gray-400 mt-1">{formatINR(value)}</div>
              </div>
              <div className="p-2 space-y-2 flex-1 min-h-[120px]">
                {col.map((l) => {
                  const overdue = l.follow_up_date && daysUntil(l.follow_up_date) < 0 && !["won", "lost"].includes(l.stage);
                  return (
                    <div key={l.id}
                      className="rounded-lg bg-white border border-gray-200 p-2.5 hover:border-orange-300 hover:shadow-sm transition-all cursor-pointer"
                      onClick={() => navigate(`/sales/leads/${l.id}`)} data-testid={`lead-card-${l.id}`}>
                      <div className="text-sm font-semibold text-gray-900 leading-tight flex items-start gap-1">
                        {overdue && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />}
                        <span className="truncate">{l.name}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">{l.company}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="font-mono text-xs font-bold text-[#F26B21]">{formatINR(l.estimated_value)}</span>
                        <span className="text-[10px] text-gray-400">{labelize(l.source)}</span>
                      </div>
                      {canWrite && !l.converted_client_id && (
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <Select value={l.stage} onValueChange={(v) => changeStage(l.id, v)}>
                            <SelectTrigger className="h-6 text-[11px] px-2" data-testid={`stage-select-${l.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STAGES.map((s) => <SelectItem key={s} value={s} className="text-xs">{labelize(s)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {l.converted_client_id && (
                        <Badge variant="outline" className="mt-2 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                          Converted <ChevronRight className="h-2.5 w-2.5" />
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* New lead dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2"><Label>Name *</Label><Input data-testid="lead-form-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Company</Label><Input data-testid="lead-form-company" value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Estimated value (₹)</Label><Input data-testid="lead-form-value" type="number" value={form.estimated_value} onChange={(e) => setForm((p) => ({ ...p, estimated_value: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Email</Label><Input data-testid="lead-form-email" value={form.contact_email} onChange={(e) => setForm((p) => ({ ...p, contact_email: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input data-testid="lead-form-phone" value={form.contact_phone} onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm((p) => ({ ...p, source: v }))}>
                <SelectTrigger data-testid="lead-form-source"><SelectValue /></SelectTrigger>
                <SelectContent>{LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Owner</Label>
              <Select value={form.owner_id || "me"} onValueChange={(v) => setForm((p) => ({ ...p, owner_id: v === "me" ? "" : v }))}>
                <SelectTrigger data-testid="lead-form-owner"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">Me</SelectItem>
                  {team.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Service interest</Label><Input data-testid="lead-form-service" value={form.service_interest} onChange={(e) => setForm((p) => ({ ...p, service_interest: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Follow-up date</Label><Input data-testid="lead-form-followup" type="date" value={form.follow_up_date} onChange={(e) => setForm((p) => ({ ...p, follow_up_date: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Region</Label><Input data-testid="lead-form-region" value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} /></div>
            <div className="space-y-1"><Label>City</Label><Input data-testid="lead-form-city" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2"><Label>Notes</Label><Textarea data-testid="lead-form-notes" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={createLead} disabled={busy} data-testid="lead-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">{busy ? "Creating..." : "Create lead"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalesLayout>
  );
}

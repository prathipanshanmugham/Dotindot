import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { labelize, PROJECT_STATUSES, ROLE_LABELS } from "@/components/Badges";
import MultiSelect from "@/components/MultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import ProjectKindField from "@/components/ProjectKind";
import ProjectBillingFields, { billingProblem } from "@/components/ProjectBilling";

const tmpId = () => `new-${Math.random().toString(36).slice(2, 9)}`;
const move = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

// Edit / restructure an existing project: details, client, billing & dates, team, milestones, deliverables.
// The project being edited is copied when the dialog opens: the page may clear its own copy while the dialog closes.
export default function ProjectEditDialog({ open, onOpenChange, project, onSaved }) {
  const [orig, setOrig] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("details");
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !project) return;
    setOrig(project);
    setTab("details");
    setForm({
      name: (project.name || "").trim(), kind: project.kind || "client", client_id: project.client_id || "", branch_id: project.branch_id || null, status: project.status || "kickoff",
      description: project.description || "", location: project.location || "", service: project.service || "",
      start_date: project.start_date || "", end_date: project.end_date || "",
      billing_type: project.billing_type === "recurring" ? "recurring" : "one_time",
      budget: String(project.budget ?? 0), recurring_amount: project.recurring_amount ? String(project.recurring_amount) : "", billing_cycle: project.billing_cycle || "monthly",
      cost_allocation: String(project.cost_allocation ?? ""),
      team_member_ids: project.team_member_ids || [],
      milestones: (project.milestones || []).map((m) => ({ ...m, id: m.id || tmpId(), title: m.title || "" })),
      deliverables: (project.deliverables || []).map((d) => ({ ...d, id: d.id || tmpId(), item: d.item || "" })),
    });
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
    api.get("/users/team").then((r) => setTeam(r.data.map((u) => ({ value: u.id, label: u.name, hint: ROLE_LABELS[u.role] || labelize(u.role) })))).catch(() => {});
  }, [open, project]);

  if (!form || !orig) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (key, i, k, v) => setForm((f) => { const arr = [...f[key]]; arr[i] = { ...arr[i], [k]: v }; return { ...f, [key]: arr }; });
  const internal = form.kind === "internal";

  const save = async () => {
    if (!form.name.trim()) { setTab("details"); return toast.error("Project name can't be empty"); }
    if (!internal && !form.client_id) { setTab("details"); return toast.error("Pick the client, or mark the project internal"); }
    const problem = billingProblem({ ...form, billing_type: internal ? "one_time" : form.billing_type });
    if (problem) { setTab("billing"); return toast.error(problem); }
    setBusy(true);
    const clean = (x) => { const { id, ...rest } = x; return String(id || "").startsWith("new-") ? rest : x; };
    const recurring = !internal && form.billing_type === "recurring";
    const body = {
      name: form.name.trim(), kind: form.kind, ...(internal ? { branch_id: form.branch_id } : { client_id: form.client_id }), status: form.status, description: form.description, location: form.location,
      start_date: form.start_date || null, end_date: form.end_date || null,
      billing_type: recurring ? "recurring" : "one_time", budget: Number(form.budget) || 0,
      ...(recurring ? { recurring_amount: Number(form.recurring_amount) || 0, billing_cycle: form.billing_cycle } : {}),
      ...(internal ? {} : { service: form.service || "" }),
      cost_allocation: Number(form.cost_allocation) || 0,
      team_member_ids: form.team_member_ids,
      milestones: form.milestones.filter((m) => m.title.trim()).map((m) => clean({ ...m, title: m.title.trim(), due_date: m.due_date || null, done: !!m.done })),
      deliverables: form.deliverables.filter((d) => d.item.trim()).map((d) => clean({ ...d, item: d.item.trim(), done: !!d.done })),
    };
    try {
      await api.put(`/projects/${orig.id}`, body);
      toast.success(recurring && form.status === "completed" && !form.end_date ? "Project updated — billing stops from today" : "Project updated");
      onOpenChange(false);
      onSaved && onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const ListEditor = ({ k, field, placeholder, withDate }) => (
    <div className="space-y-2">
      {form[k].length === 0 && <p className="text-xs text-gray-400">Nothing yet.</p>}
      {form[k].map((it, i) => (
        <div key={it.id} className="rounded-lg border border-gray-200 p-2 sm:p-2.5" data-testid={`edit-${k}-row-${i}`}>
          <div className="flex items-center gap-2">
            <Checkbox checked={!!it.done} onCheckedChange={(v) => setItem(k, i, "done", !!v)} aria-label="Done" />
            <Input className="h-9 flex-1 min-w-0" value={it[field]} placeholder={placeholder} onChange={(e) => setItem(k, i, field, e.target.value)} data-testid={`edit-${k}-input-${i}`} />
            {withDate && <Input type="date" className="h-9 w-[150px] hidden sm:block" value={it.due_date || ""} onChange={(e) => setItem(k, i, "due_date", e.target.value)} aria-label="Due date" />}
            <div className="flex items-center shrink-0">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400" disabled={i === 0} onClick={() => set(k, move(form[k], i, -1))} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400" disabled={i === form[k].length - 1} onClick={() => set(k, move(form[k], i, 1))} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => set(k, form[k].filter((_, j) => j !== i))} aria-label="Remove" data-testid={`edit-${k}-remove-${i}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {withDate && <Input type="date" className="h-9 mt-2 sm:hidden" value={it.due_date || ""} onChange={(e) => setItem(k, i, "due_date", e.target.value)} aria-label="Due date" />}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => set(k, [...form[k], withDate ? { id: tmpId(), title: "", due_date: "", done: false } : { id: tmpId(), item: "", done: false }])} data-testid={`edit-${k}-add`}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add {k === "milestones" ? "milestone" : "deliverable"}
      </Button>
    </div>
  );

  const tabs = [["details", "Details"], ["billing", internal ? "Budget & dates" : "Billing & dates"], ["team", "Team"], ["milestones", `Milestones (${form.milestones.length})`], ["deliverables", `Deliverables (${form.deliverables.length})`]];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="project-edit-dialog">
        <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white border border-gray-200 h-auto flex-wrap justify-start">
            {tabs.map(([v, l]) => <TabsTrigger key={v} value={v} className="data-[state=active]:bg-[#FFF7ED] data-[state=active]:text-[#F26B21]" data-testid={`project-edit-tab-${v}`}>{l}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="details" className="space-y-3 pt-2">
            <div className="space-y-1"><Label>Project name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="project-edit-name" /></div>
            <ProjectKindField value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} clients={clients} testid="project-edit-kind" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger data-testid="project-edit-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City, region" /></div>
            </div>
            {!internal && orig.kind !== "internal" && form.client_id !== orig.client_id && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">This moves the project to a different client. Its ledger entries stay linked to the project.</p>}
            {internal && orig.kind !== "internal" && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">The project leaves {orig.client_name || "the client"}'s portal and stops counting towards MRR. Its ledger entries stay linked to the project.</p>}
            <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} data-testid="project-edit-description" /></div>
          </TabsContent>

          <TabsContent value="billing" className="space-y-4 pt-2">
            <ProjectBillingFields value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} internal={internal} testid="project-edit-billing" />
            <div className="space-y-1"><Label>Internal cost allocation (₹)</Label><Input type="number" min="0" value={form.cost_allocation} onChange={(e) => set("cost_allocation", e.target.value)} />
              <p className="text-xs text-gray-400">Our own cost of running it, for Project Profit.</p></div>
          </TabsContent>

          <TabsContent value="team" className="space-y-2 pt-2">
            <Label>Team members</Label>
            <MultiSelect options={team} value={form.team_member_ids} onChange={(v) => set("team_member_ids", v)} placeholder="Add people to this project" testid="project-edit-team" />
            <p className="text-xs text-gray-400">Assigned employees see this project on their dashboard and can tick off deliverables.</p>
          </TabsContent>

          <TabsContent value="milestones" className="pt-2">{ListEditor({ k: "milestones", field: "title", placeholder: "Milestone", withDate: true })}</TabsContent>
          <TabsContent value="deliverables" className="pt-2">{ListEditor({ k: "deliverables", field: "item", placeholder: "Deliverable" })}</TabsContent>
        </Tabs>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={save} data-testid="project-edit-save">{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

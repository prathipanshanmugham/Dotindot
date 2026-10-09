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

const tmpId = () => `new-${Math.random().toString(36).slice(2, 9)}`;
const move = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

// Edit / restructure an existing project: details, client, timeline, budget, team, milestones, deliverables.
export default function ProjectEditDialog({ open, onOpenChange, project, onSaved }) {
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("details");
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !project) return;
    setTab("details");
    setForm({
      name: project.name || "", client_id: project.client_id || "", status: project.status || "kickoff",
      description: project.description || "", location: project.location || "",
      start_date: project.start_date || "", end_date: project.end_date || "",
      budget: String(project.budget ?? ""), cost_allocation: String(project.cost_allocation ?? ""),
      team_member_ids: project.team_member_ids || [],
      milestones: (project.milestones || []).map((m) => ({ ...m })),
      deliverables: (project.deliverables || []).map((d) => ({ ...d })),
    });
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
    api.get("/users/team").then((r) => setTeam(r.data.map((u) => ({ value: u.id, label: u.name, hint: ROLE_LABELS[u.role] || labelize(u.role) })))).catch(() => {});
  }, [open, project]);

  if (!form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (key, i, k, v) => setForm((f) => { const arr = [...f[key]]; arr[i] = { ...arr[i], [k]: v }; return { ...f, [key]: arr }; });

  const save = async () => {
    if (!form.name.trim()) { setTab("details"); return toast.error("Project name can't be empty"); }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { setTab("timeline"); return toast.error("End date must be after the start date"); }
    setBusy(true);
    const clean = (x) => { const { id, ...rest } = x; return String(id || "").startsWith("new-") ? rest : x; };
    const body = {
      name: form.name.trim(), client_id: form.client_id, status: form.status, description: form.description, location: form.location,
      start_date: form.start_date || null, end_date: form.end_date || null,
      budget: Number(form.budget) || 0, cost_allocation: Number(form.cost_allocation) || 0,
      team_member_ids: form.team_member_ids,
      milestones: form.milestones.filter((m) => m.title.trim()).map((m) => clean({ ...m, title: m.title.trim(), due_date: m.due_date || null, done: !!m.done })),
      deliverables: form.deliverables.filter((d) => d.item.trim()).map((d) => clean({ ...d, item: d.item.trim(), done: !!d.done })),
    };
    try {
      await api.put(`/projects/${project.id}`, body);
      toast.success("Project updated");
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
            {withDate && <Input type="date" className="h-9 w-[150px] hidden sm:block" value={it.due_date || ""} onChange={(e) => setItem(k, i, "due_date", e.target.value)} />}
            <div className="flex items-center shrink-0">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400" disabled={i === 0} onClick={() => set(k, move(form[k], i, -1))} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400" disabled={i === form[k].length - 1} onClick={() => set(k, move(form[k], i, 1))} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => set(k, form[k].filter((_, j) => j !== i))} aria-label="Remove" data-testid={`edit-${k}-remove-${i}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {withDate && <Input type="date" className="h-9 mt-2 sm:hidden" value={it.due_date || ""} onChange={(e) => setItem(k, i, "due_date", e.target.value)} />}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => set(k, [...form[k], withDate ? { id: tmpId(), title: "", due_date: "", done: false } : { id: tmpId(), item: "", done: false }])} data-testid={`edit-${k}-add`}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add {k === "milestones" ? "milestone" : "deliverable"}
      </Button>
    </div>
  );

  const tabs = [["details", "Details"], ["timeline", "Timeline & budget"], ["team", "Team"], ["milestones", `Milestones (${form.milestones.length})`], ["deliverables", `Deliverables (${form.deliverables.length})`]];
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Client</Label>
                <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                  <SelectTrigger data-testid="project-edit-client"><SelectValue placeholder="Select a client" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger data-testid="project-edit-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {form.client_id !== project.client_id && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">This moves the project to a different client. Its ledger entries stay linked to the project.</p>}
            <div className="space-y-1"><Label>Location</Label><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City, region" /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} data-testid="project-edit-description" /></div>
          </TabsContent>

          <TabsContent value="timeline" className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} data-testid="project-edit-start" /></div>
              <div className="space-y-1"><Label>End date</Label><Input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} data-testid="project-edit-end" /></div>
              <div className="space-y-1"><Label>Budget (₹)</Label><Input type="number" min="0" value={form.budget} onChange={(e) => set("budget", e.target.value)} data-testid="project-edit-budget" /></div>
              <div className="space-y-1"><Label>Internal cost allocation (₹)</Label><Input type="number" min="0" value={form.cost_allocation} onChange={(e) => set("cost_allocation", e.target.value)} /></div>
            </div>
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

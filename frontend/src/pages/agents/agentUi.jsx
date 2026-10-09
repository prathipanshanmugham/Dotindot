import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { labelize, ROLE_LABELS } from "@/components/Badges";
import MultiSelect from "@/components/MultiSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Star, Copy, Check } from "lucide-react";

export const PLATFORM_LABELS = {
  chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", perplexity: "Perplexity", copilot: "GitHub Copilot",
  midjourney: "Midjourney", custom_gpt: "Custom GPT", n8n: "n8n", make: "Make", zapier: "Zapier", other: "Other",
};
const PLATFORM_COLORS = {
  chatgpt: "bg-emerald-600", claude: "bg-[#D97757]", gemini: "bg-blue-600", perplexity: "bg-teal-600", copilot: "bg-gray-800",
  midjourney: "bg-indigo-600", custom_gpt: "bg-emerald-700", n8n: "bg-rose-500", make: "bg-violet-600", zapier: "bg-orange-500", other: "bg-gray-500",
};
const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  testing: "bg-blue-50 text-blue-700 border-blue-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  retired: "bg-gray-100 text-gray-500 border-gray-200",
};

export const PlatformMark = ({ platform, size = "h-10 w-10 text-sm" }) => {
  const label = PLATFORM_LABELS[platform] || "AI";
  const initials = label.replace(/[^A-Za-z0-9 ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`${size} ${PLATFORM_COLORS[platform] || "bg-gray-500"} rounded-xl text-white font-bold flex items-center justify-center shrink-0`} title={label}>
      {initials}
    </div>
  );
};

export const AgentStatusBadge = ({ status }) => (
  <Badge variant="outline" className={`${STATUS_STYLES[status] || ""} font-medium text-[11px]`} data-testid={`agent-status-${status}`}>{labelize(status)}</Badge>
);

export const initialsOf = (name) => (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export const PeopleStack = ({ people = [], max = 4, openToAll }) => {
  if (openToAll) return <span className="text-xs font-medium text-gray-600">Everyone</span>;
  if (!people.length) return <span className="text-xs text-gray-400">Not assigned</span>;
  return (
    <div className="flex items-center">
      {people.slice(0, max).map((p, i) => (
        <div key={p.id} title={p.name} className={`h-7 w-7 rounded-full bg-gradient-to-br from-[#F26B21] to-[#FBA834] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white ${i ? "-ml-2" : ""}`}>
          {initialsOf(p.name)}
        </div>
      ))}
      {people.length > max && <div className="-ml-2 h-7 w-7 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold flex items-center justify-center ring-2 ring-white">+{people.length - max}</div>}
    </div>
  );
};

export const lastUsedText = (iso) => {
  if (!iso) return "Never used";
  const days = Math.round((new Date(new Date().toDateString()) - new Date(iso + "T00:00:00")) / 86400000);
  if (days <= 0) return "Used today";
  if (days === 1) return "Used yesterday";
  return `Used ${days} days ago`;
};

export const CopyButton = ({ text, label = "Copy", testid }) => {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (e) {
      toast.error("Couldn't copy — select the text and copy it manually");
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={copy} data-testid={testid}>
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {done ? "Copied" : label}
    </Button>
  );
};

// Shared option lists for pickers
export const usePickerOptions = (enabled = true) => {
  const [opts, setOpts] = useState({ team: [], clients: [], projects: [] });
  useEffect(() => {
    if (!enabled) return;
    Promise.all([
      api.get("/users/team").catch(() => ({ data: [] })),
      api.get("/clients").catch(() => ({ data: [] })),
      api.get("/projects").catch(() => ({ data: [] })),
    ]).then(([t, c, p]) => setOpts({
      team: (t.data || []).map((u) => ({ value: u.id, label: u.name, hint: ROLE_LABELS[u.role] || labelize(u.role) })),
      clients: (c.data || []).map((x) => ({ value: x.id, label: x.name, hint: x.city })),
      projects: (p.data || []).map((x) => ({ value: x.id, label: x.name, hint: x.client_name })),
    }));
  }, [enabled]);
  return opts;
};

const EMPTY = {
  name: "", platform: "chatgpt", agent_type: "assistant", status: "active", purpose: "", access_url: "", owner_id: "",
  open_to_all: false, assignee_ids: [], client_ids: [], project_ids: [], monthly_cost: "", minutes_saved_per_run: "",
  playbook: "", guardrails: "", prompts: [],
};

export function AgentFormDialog({ open, onOpenChange, agent, meta, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [tab, setTab] = useState("details");
  const [busy, setBusy] = useState(false);
  const opts = usePickerOptions(open);

  useEffect(() => {
    if (!open) return;
    setTab("details");
    setForm(agent ? {
      ...EMPTY, ...agent,
      owner_id: agent.owner_id || "",
      monthly_cost: String(agent.monthly_cost ?? ""), minutes_saved_per_run: String(agent.minutes_saved_per_run ?? ""),
      prompts: (agent.prompts || []).map((p) => ({ ...p })),
    } : EMPTY);
  }, [open, agent]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setPrompt = (i, k, v) => setForm((f) => {
    const prompts = [...f.prompts];
    prompts[i] = { ...prompts[i], [k]: v };
    return { ...f, prompts };
  });

  const save = async () => {
    if (!form.name.trim()) { setTab("details"); return toast.error("Give the agent a name"); }
    setBusy(true);
    const body = {
      name: form.name.trim(), platform: form.platform, agent_type: form.agent_type, status: form.status,
      purpose: form.purpose, access_url: form.access_url, owner_id: form.owner_id || null,
      open_to_all: form.open_to_all, assignee_ids: form.assignee_ids, client_ids: form.client_ids, project_ids: form.project_ids,
      monthly_cost: Number(form.monthly_cost) || 0, minutes_saved_per_run: Number(form.minutes_saved_per_run) || 0,
      playbook: form.playbook, guardrails: form.guardrails,
      prompts: form.prompts.filter((p) => p.title.trim() && p.prompt.trim()).map((p) => (p.id && !String(p.id).startsWith("new-") ? p : { title: p.title, prompt: p.prompt, when_to_use: p.when_to_use })),
    };
    try {
      const { data } = agent ? await api.put(`/agents/${agent.id}`, body) : await api.post("/agents", body);
      toast.success(agent ? "Agent updated" : "Agent added");
      onOpenChange(false);
      onSaved && onSaved(data);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const platforms = meta?.platforms || Object.keys(PLATFORM_LABELS);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="agent-form-dialog">
        <DialogHeader><DialogTitle>{agent ? `Edit ${agent.name}` : "Add an AI agent"}</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white border border-gray-200 w-full grid grid-cols-3 h-auto">
            {["details", "assignment", "playbook"].map((t) => (
              <TabsTrigger key={t} value={t} className="data-[state=active]:bg-[#FFF7ED] data-[state=active]:text-[#F26B21]" data-testid={`agent-form-tab-${t}`}>{labelize(t)}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="details" className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Proposal Writer" data-testid="agent-form-name" /></div>
              <div className="space-y-1"><Label>Platform</Label>
                <Select value={form.platform} onValueChange={(v) => set("platform", v)}>
                  <SelectTrigger data-testid="agent-form-platform"><SelectValue /></SelectTrigger>
                  <SelectContent>{platforms.map((p) => <SelectItem key={p} value={p}>{PLATFORM_LABELS[p] || labelize(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>What it does</Label>
                <Select value={form.agent_type} onValueChange={(v) => set("agent_type", v)}>
                  <SelectTrigger data-testid="agent-form-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{(meta?.agent_types || ["assistant"]).map((p) => <SelectItem key={p} value={p}>{labelize(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger data-testid="agent-form-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{(meta?.statuses || ["active"]).map((p) => <SelectItem key={p} value={p}>{labelize(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Owner</Label>
                <Select value={form.owner_id || "none"} onValueChange={(v) => set("owner_id", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="agent-form-owner"><SelectValue placeholder="Who looks after it" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No owner</SelectItem>
                    {opts.team.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1"><Label>Purpose</Label><Textarea rows={2} value={form.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="What job does this agent do for us?" data-testid="agent-form-purpose" /></div>
              <div className="sm:col-span-2 space-y-1"><Label>Link to open it</Label><Input value={form.access_url} onChange={(e) => set("access_url", e.target.value)} placeholder="https://…" /></div>
              <div className="space-y-1"><Label>Monthly cost (₹)</Label><Input type="number" min="0" value={form.monthly_cost} onChange={(e) => set("monthly_cost", e.target.value)} data-testid="agent-form-cost" /></div>
              <div className="space-y-1"><Label>Minutes saved per run</Label><Input type="number" min="0" value={form.minutes_saved_per_run} onChange={(e) => set("minutes_saved_per_run", e.target.value)} placeholder="Typical estimate" /></div>
            </div>
          </TabsContent>

          <TabsContent value="assignment" className="space-y-4 pt-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
              <div>
                <div className="text-sm font-medium text-gray-800">Available to everyone</div>
                <div className="text-xs text-gray-500">Anyone in the team can see the playbook and log runs.</div>
              </div>
              <Switch checked={form.open_to_all} onCheckedChange={(v) => set("open_to_all", v)} data-testid="agent-form-open-to-all" />
            </label>
            <div className="space-y-1"><Label>Assigned team members</Label>
              <MultiSelect options={opts.team} value={form.assignee_ids} onChange={(v) => set("assignee_ids", v)} placeholder="Pick people who should use it" testid="agent-form-assignees" />
            </div>
            <div className="space-y-1"><Label>Clients it works on</Label>
              <MultiSelect options={opts.clients} value={form.client_ids} onChange={(v) => set("client_ids", v)} placeholder="Optional" testid="agent-form-clients" />
            </div>
            <div className="space-y-1"><Label>Projects it works on</Label>
              <MultiSelect options={opts.projects} value={form.project_ids} onChange={(v) => set("project_ids", v)} placeholder="Optional" testid="agent-form-projects" />
            </div>
          </TabsContent>

          <TabsContent value="playbook" className="space-y-3 pt-2">
            <div className="space-y-1"><Label>How to use it well</Label>
              <Textarea rows={4} value={form.playbook} onChange={(e) => set("playbook", e.target.value)} placeholder={"1. Paste the brief\n2. Use the prompt below\n3. Check facts before sending"} data-testid="agent-form-playbook" />
            </div>
            <div className="space-y-1"><Label>Guardrails (what not to do)</Label>
              <Textarea rows={2} value={form.guardrails} onChange={(e) => set("guardrails", e.target.value)} placeholder="e.g. Never paste client passwords" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Saved prompts</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => set("prompts", [...form.prompts, { id: `new-${Date.now()}`, title: "", when_to_use: "", prompt: "" }])} data-testid="agent-form-add-prompt">
                  <Plus className="h-3 w-3 mr-1" /> Add prompt
                </Button>
              </div>
              {form.prompts.length === 0 && <p className="text-xs text-gray-400">Save the prompts that work, so the whole team gets the same results.</p>}
              {form.prompts.map((p, i) => (
                <div key={p.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Prompt name" value={p.title} onChange={(e) => setPrompt(i, "title", e.target.value)} data-testid={`agent-form-prompt-title-${i}`} />
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-gray-400 hover:text-red-600" onClick={() => set("prompts", form.prompts.filter((_, j) => j !== i))} aria-label="Remove prompt">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input placeholder="When to use it" value={p.when_to_use || ""} onChange={(e) => setPrompt(i, "when_to_use", e.target.value)} />
                  <Textarea rows={3} placeholder="The prompt text" value={p.prompt} onChange={(e) => setPrompt(i, "prompt", e.target.value)} data-testid={`agent-form-prompt-text-${i}`} />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={save} data-testid="agent-form-save">
            {busy ? "Saving…" : agent ? "Save changes" : "Add agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const OUTCOMES = [
  { v: "success", label: "Worked", cls: "data-[on=true]:bg-emerald-50 data-[on=true]:border-emerald-300 data-[on=true]:text-emerald-700" },
  { v: "partial", label: "Needed edits", cls: "data-[on=true]:bg-amber-50 data-[on=true]:border-amber-300 data-[on=true]:text-amber-700" },
  { v: "failed", label: "Didn't help", cls: "data-[on=true]:bg-red-50 data-[on=true]:border-red-300 data-[on=true]:text-red-700" },
];

export function LogUsageDialog({ open, onOpenChange, agent, onSaved }) {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); // local date, not UTC
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const opts = usePickerOptions(open);
  useEffect(() => {
    if (open && agent) setForm({ date: today, task: "", client_id: "", project_id: "", minutes_saved: String(agent.minutes_saved_per_run || ""), outcome: "success", rating: 0, note: "" });
  }, [open, agent, today]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  if (!agent) return null;

  const save = async () => {
    if (!form.task?.trim()) return toast.error("Describe what you used it for");
    setBusy(true);
    try {
      await api.post(`/agents/${agent.id}/usage`, {
        date: form.date || null, task: form.task.trim(), client_id: form.client_id || null, project_id: form.project_id || null,
        minutes_saved: Number(form.minutes_saved) || 0, outcome: form.outcome, rating: form.rating || null, note: form.note,
      });
      toast.success("Run logged — thanks!");
      onOpenChange(false);
      onSaved && onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const clientOpts = agent.client_ids?.length ? opts.clients.filter((c) => agent.client_ids.includes(c.value)) : opts.clients;
  const projectOpts = agent.project_ids?.length ? opts.projects.filter((c) => agent.project_ids.includes(c.value)) : opts.projects;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="log-usage-dialog">
        <DialogHeader><DialogTitle>Log a run · {agent.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>What did you use it for? *</Label>
            <Input value={form.task || ""} onChange={(e) => set("task", e.target.value)} placeholder="e.g. Proposal for Bombay Brew Co" data-testid="usage-task" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date || ""} max={today} onChange={(e) => set("date", e.target.value)} /></div>
            <div className="space-y-1"><Label>Minutes saved</Label><Input type="number" min="0" value={form.minutes_saved || ""} onChange={(e) => set("minutes_saved", e.target.value)} data-testid="usage-minutes" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Client</Label>
              <Select value={form.client_id || "none"} onValueChange={(v) => set("client_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{clientOpts.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Project</Label>
              <Select value={form.project_id || "none"} onValueChange={(v) => set("project_id", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{projectOpts.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>How did it go?</Label>
            <div className="grid grid-cols-3 gap-2">
              {OUTCOMES.map((o) => (
                <button key={o.v} type="button" data-on={form.outcome === o.v} onClick={() => set("outcome", o.v)}
                  className={`rounded-lg border border-gray-200 px-2 py-2 text-xs font-medium text-gray-600 min-h-[40px] ${o.cls}`} data-testid={`usage-outcome-${o.v}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1"><Label>Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => set("rating", form.rating === n ? 0 : n)} className="p-1.5" aria-label={`${n} star${n > 1 ? "s" : ""}`} data-testid={`usage-rating-${n}`}>
                  <Star className={`h-6 w-6 ${n <= (form.rating || 0) ? "fill-[#FBA834] text-[#FBA834]" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1"><Label>Tip for the team (optional)</Label><Textarea rows={2} value={form.note || ""} onChange={(e) => set("note", e.target.value)} placeholder="What worked, what to watch out for" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={save} data-testid="usage-save">{busy ? "Saving…" : "Log run"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

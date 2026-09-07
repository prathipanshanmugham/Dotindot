import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import api, { formatINR, apiError } from "@/lib/api";
import { labelize, PROJECT_STATUSES } from "@/components/Badges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, CalendarIcon, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

const STEPS = ["Client & Basics", "Timeline & Milestones", "Budget", "Team & Deliverables", "Review"];

const DatePickerField = ({ label, value, onChange, testid }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal" data-testid={testid}>
          <CalendarIcon className="h-4 w-4 mr-2 text-gray-400" />
          {value ? value : <span className="text-gray-400">Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? new Date(value + "T00:00:00") : undefined}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  </div>
);

export default function NewProjectWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    client_id: searchParams.get("client") || "",
    name: "",
    description: "",
    status: "kickoff",
    start_date: "",
    end_date: "",
    budget: searchParams.get("budget") || "",
    milestones: [],
    deliverables: [],
    team_member_ids: [],
    location: "",
  });

  useEffect(() => {
    api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
    api.get("/users/team").then((r) => setTeam(r.data)).catch(() => {});
  }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const selectedClient = clients.find((c) => c.id === form.client_id);

  const canNext = () => {
    if (step === 0) return form.client_id && form.name.trim();
    if (step === 2) return form.budget !== "" && Number(form.budget) >= 0;
    return true;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        budget: Number(form.budget) || 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        milestones: form.milestones.filter((m) => m.title.trim()).map((m) => ({ title: m.title, due_date: m.due_date || null, done: false })),
        deliverables: form.deliverables.filter((d) => d.item.trim()).map((d) => ({ item: d.item, done: false })),
      };
      const { data } = await api.post("/projects", payload);
      toast.success("Project created");
      navigate(`/projects/${data.id}`);
    } catch (e) {
      toast.error(apiError(e));
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6" data-testid="new-project-wizard">
      <button onClick={() => navigate("/projects")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21] transition-colors" data-testid="wizard-back-to-projects">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </button>
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">New Project</h1>
        <p className="text-sm text-gray-500 mt-0.5">Guided setup — {STEPS.length} quick steps.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                  i < step ? "bg-[#F26B21] text-white" : i === step ? "bg-[#FFF7ED] text-[#F26B21] border-2 border-[#F26B21]" : "bg-gray-100 text-gray-400"
                }`}
                data-testid={`wizard-step-indicator-${i}`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden md:block ${i === step ? "text-gray-900" : "text-gray-400"}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`h-px flex-1 ${i < step ? "bg-[#F26B21]" : "bg-gray-200"}`} />}
          </div>
        ))}
      </div>

      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-6 space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                  <SelectTrigger data-testid="wizard-client-select"><SelectValue placeholder="Select a client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.city}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project name *</Label>
                <Input data-testid="wizard-project-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Website Revamp 2026" />
              </div>
              <div className="space-y-1.5">
                <Label>Scope / description</Label>
                <Textarea data-testid="wizard-project-description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What are we building?" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Initial status</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger data-testid="wizard-project-status"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Location tag</Label>
                  <Input data-testid="wizard-project-location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={selectedClient ? `${selectedClient.city}, ${selectedClient.region} (inherited)` : "Inherits client location"} />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <DatePickerField label="Start date" value={form.start_date} onChange={(v) => set("start_date", v)} testid="wizard-start-date" />
                <DatePickerField label="End date" value={form.end_date} onChange={(v) => set("end_date", v)} testid="wizard-end-date" />
              </div>
              <div className="pt-2">
                <Label className="text-sm font-semibold">Milestones</Label>
                <div className="space-y-2 mt-2">
                  {form.milestones.map((m, i) => (
                    <div key={i} className="grid grid-cols-[1.5fr_1fr_auto] gap-2 items-center">
                      <Input placeholder="Milestone title" value={m.title} onChange={(e) => set("milestones", form.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} data-testid={`wizard-milestone-title-${i}`} />
                      <Input type="date" value={m.due_date} onChange={(e) => set("milestones", form.milestones.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} data-testid={`wizard-milestone-date-${i}`} />
                      <Button variant="ghost" size="icon" onClick={() => set("milestones", form.milestones.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" data-testid="wizard-add-milestone" onClick={() => set("milestones", [...form.milestones, { title: "", due_date: "" }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add milestone
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Project budget (₹) *</Label>
                <Input data-testid="wizard-budget-input" type="number" min="0" value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. 350000" />
              </div>
              {form.budget !== "" && (
                <div className="rounded-xl bg-[#FFF7ED] border border-orange-200 px-4 py-3">
                  <div className="text-xs text-gray-500">Budget preview</div>
                  <div className="text-2xl font-bold font-mono text-[#F26B21]">{formatINR(Number(form.budget))}</div>
                  <div className="text-xs text-gray-400 mt-1">Currency: INR (multi-currency coming later)</div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <>
              <div>
                <Label className="text-sm font-semibold">Assign team members</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {team.map((u) => (
                    <label key={u.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${form.team_member_ids.includes(u.id) ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}>
                      <Checkbox
                        checked={form.team_member_ids.includes(u.id)}
                        onCheckedChange={(v) =>
                          set("team_member_ids", v ? [...form.team_member_ids, u.id] : form.team_member_ids.filter((x) => x !== u.id))
                        }
                        data-testid={`wizard-team-checkbox-${u.id}`}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-800">{u.name}</div>
                        <div className="text-[11px] text-gray-400 uppercase tracking-wide">{u.role}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <Label className="text-sm font-semibold">Deliverables checklist</Label>
                <div className="space-y-2 mt-2">
                  {form.deliverables.map((d, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                      <Input placeholder="Deliverable item" value={d.item} onChange={(e) => set("deliverables", form.deliverables.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} data-testid={`wizard-deliverable-${i}`} />
                      <Button variant="ghost" size="icon" onClick={() => set("deliverables", form.deliverables.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" data-testid="wizard-add-deliverable" onClick={() => set("deliverables", [...form.deliverables, { item: "" }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add deliverable
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3" data-testid="wizard-review">
              <h3 className="text-lg font-semibold text-gray-900">Review & create</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><div className="text-xs text-gray-400 uppercase tracking-wide">Client</div>{selectedClient?.name || "—"}</div>
                <div><div className="text-xs text-gray-400 uppercase tracking-wide">Project</div>{form.name}</div>
                <div><div className="text-xs text-gray-400 uppercase tracking-wide">Status</div>{labelize(form.status)}</div>
                <div><div className="text-xs text-gray-400 uppercase tracking-wide">Timeline</div>{form.start_date || "—"} → {form.end_date || "—"}</div>
                <div><div className="text-xs text-gray-400 uppercase tracking-wide">Budget</div><span className="font-mono font-semibold">{formatINR(Number(form.budget) || 0)}</span></div>
                <div><div className="text-xs text-gray-400 uppercase tracking-wide">Team</div>{form.team_member_ids.length ? team.filter((u) => form.team_member_ids.includes(u.id)).map((u) => u.name).join(", ") : "—"}</div>
                <div><div className="text-xs text-gray-400 uppercase tracking-wide">Milestones</div>{form.milestones.filter((m) => m.title.trim()).length}</div>
                <div><div className="text-xs text-gray-400 uppercase tracking-wide">Deliverables</div>{form.deliverables.filter((d) => d.item.trim()).length}</div>
              </div>
              {form.description && <p className="text-sm text-gray-600 border-t border-gray-100 pt-3">{form.description}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} data-testid="wizard-prev-btn">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()} data-testid="wizard-next-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            Next <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={busy} data-testid="create-project-submit-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            {busy ? "Creating..." : "Create project"}
          </Button>
        )}
      </div>
    </div>
  );
}

// "How is it billed?" — one-time value, or a recurring fee with its cycle and dates. Used by the new-project wizard
// and the edit dialog. value: { billing_type, budget, recurring_amount, billing_cycle, start_date, end_date, service }
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Repeat, Receipt } from "lucide-react";
import { SERVICES, CYCLES, CYCLE_WORD, rupees, toMonthly, billingText } from "@/lib/revenue";
import { fmtDate } from "@/components/kit";

/** One line on how a project is billed, for lists. */
export const BillingCell = ({ p }) => {
  if (p.kind === "internal") return <span className="text-xs text-gray-400">Internal · {rupees(p.budget)}</span>;
  if (p.billing_type === "recurring") return (
    <div>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-900 whitespace-nowrap"><Repeat className="h-3.5 w-3.5 text-[#F26B21] shrink-0" />{billingText(p)}</span>
      <div className="text-[11px] text-gray-500">{p.live ? (p.next_bill_date ? `Next bill ${fmtDate(p.next_bill_date, { day: "numeric", month: "short" })}` : "Billing") : p.status === "on_hold" ? "Paused" : "Not billing now"}</div>
    </div>
  );
  return <span className="inline-flex items-center gap-1 text-sm text-gray-700 whitespace-nowrap"><Receipt className="h-3.5 w-3.5 text-gray-400 shrink-0" />{billingText(p)}</span>;
};

const TYPES = [
  ["one_time", "One-time", "A fixed price for the whole project", Receipt],
  ["recurring", "Recurring", "Billed every month, quarter or year — a retainer", Repeat],
];

/** Returns the first problem with the billing fields, or "" when they're fine. */
export const billingProblem = (v) => {
  if (v.billing_type === "recurring") {
    if (!(Number(v.recurring_amount) > 0)) return "Add how much the client pays each cycle";
    if (!v.start_date) return "Add the date billing starts";
  } else if (v.budget === "" || v.budget === null || v.budget === undefined || Number(v.budget) < 0) return "Add the project value (0 is fine)";
  if (v.start_date && v.end_date && v.end_date < v.start_date) return "The end date must be after the start date";
  return "";
};

export default function ProjectBillingFields({ value, onChange, testid = "billing", showService = true, internal = false }) {
  const v = value;
  const rec = !internal && v.billing_type === "recurring";
  const set = (k, x) => onChange({ [k]: x });
  const mrr = toMonthly(v.recurring_amount, v.billing_cycle);
  return (
    <div className="space-y-4">
      {!internal && <div className="space-y-1.5">
        <Label>How is it billed?</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" data-testid={`${testid}-type`}>
          {TYPES.map(([k, title, sub, Icon]) => {
            const on = (v.billing_type || "one_time") === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => set("billing_type", k)} data-testid={`${testid}-type-${k}`}
                className={`text-left rounded-xl border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F26B21]/40 ${on ? "border-[#F26B21] bg-[#FFF7ED] ring-1 ring-[#F26B21]" : "border-gray-200 hover:border-gray-300 bg-white"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Icon className={`h-4 w-4 ${on ? "text-[#F26B21]" : "text-gray-400"}`} />{title}</span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{sub}</span>
              </button>
            );
          })}
        </div>
      </div>}

      {rec ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount each time (₹, before GST) *</Label>
              <Input type="number" min="0" inputMode="decimal" value={v.recurring_amount} onChange={(e) => set("recurring_amount", e.target.value)} placeholder="e.g. 30000" data-testid={`${testid}-amount`} />
            </div>
            <div className="space-y-1.5">
              <Label>Billed every</Label>
              <Select value={v.billing_cycle || "monthly"} onValueChange={(x) => set("billing_cycle", x)}>
                <SelectTrigger data-testid={`${testid}-cycle`}><SelectValue /></SelectTrigger>
                <SelectContent>{CYCLES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Billing starts *</Label>
              <Input type="date" value={v.start_date || ""} onChange={(e) => set("start_date", e.target.value)} data-testid={`${testid}-start`} />
            </div>
            <div className="space-y-1.5">
              <Label>Ends (leave empty if ongoing)</Label>
              <Input type="date" value={v.end_date || ""} min={v.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} data-testid={`${testid}-end`} />
            </div>
          </div>
          {Number(v.recurring_amount) > 0 && (
            <p className="text-xs text-gray-600 bg-[#FFF7ED] border border-orange-200 rounded-lg px-3 py-2" data-testid={`${testid}-preview`}>
              {rupees(v.recurring_amount)} every {CYCLE_WORD[v.billing_cycle] || "month"} = <span className="font-semibold text-gray-900">{rupees(mrr)} MRR</span> · {rupees(mrr * 12)} a year.
              {" "}Marking the project completed stops the billing.
            </p>
          )}
          <div className="space-y-1.5">
            <Label>One-time setup fee (optional, ₹)</Label>
            <Input type="number" min="0" inputMode="decimal" value={v.budget} onChange={(e) => set("budget", e.target.value)} placeholder="0" data-testid={`${testid}-setup`} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{internal ? "Budget (₹)" : "Project value (₹, before GST) *"}</Label>
            <Input type="number" min="0" inputMode="decimal" value={v.budget} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. 150000" data-testid={`${testid}-value`} />
          </div>
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input type="date" value={v.start_date || ""} onChange={(e) => set("start_date", e.target.value)} data-testid={`${testid}-start`} />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={v.end_date || ""} min={v.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} data-testid={`${testid}-end`} />
          </div>
        </div>
      )}

      {showService && !internal && (
        <div className="space-y-1.5">
          <Label>Service</Label>
          <Select value={v.service || "auto"} onValueChange={(x) => set("service", x === "auto" ? "" : x)}>
            <SelectTrigger data-testid={`${testid}-service`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Work it out from the name</SelectItem>
              {SERVICES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">Used to split MRR by service.</p>
        </div>
      )}
    </div>
  );
}

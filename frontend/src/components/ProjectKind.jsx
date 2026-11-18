import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Building2 } from "lucide-react";
import { LocationSelect, useBranchOptions } from "@/components/BranchFilter";

const KINDS = [
  ["client", "For a client", "Work we deliver and bill to a client", Briefcase],
  ["internal", "Internal", "Our own work: our website, marketing, tools or training", Building2],
];

/** True when the person only works in some branches (so an internal project must sit in one of them). */
export const useBranchLimited = () => {
  const { user } = useAuth();
  return user?.role !== "super_admin" && ((user?.branch_assignments || []).length > 0 || (user?.assigned_branches || []).length > 0);
};

/** "Internal" pill for lists and headers. */
export const InternalBadge = ({ className = "" }) => (
  <span className={`inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-semibold ${className}`}>
    <Building2 className="h-3 w-3" /> Internal
  </span>
);

/**
 * Client project or internal project, then the client, then the location that runs it.
 * value: { kind, client_id, branch_id, branch_name? }; onChange(patch)
 */
export default function ProjectKindField({ value, onChange, clients, testid = "project-kind" }) {
  const limited = useBranchLimited();
  const branches = useBranchOptions();
  const kind = value.kind || "client";
  const first = branches[0]?.id;
  useEffect(() => {  // people limited to some locations always file work under one of them
    if (limited && !value.branch_id && first && (kind === "internal" || value.client_id)) onChange({ branch_id: first });
  }, [limited, kind, value.branch_id, value.client_id, first]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickClient = (id) => {
    const c = clients.find((x) => x.id === id);
    onChange({ client_id: id, branch_id: c?.branch_id || (limited ? first || null : null) });
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Who is it for?</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" data-testid={testid}>
          {KINDS.map(([k, title, sub, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => onChange({ kind: k })} data-testid={`${testid}-${k}`}
              className={`text-left rounded-xl border p-3 transition-colors ${kind === k ? "border-[#F26B21] bg-[#FFF7ED] ring-1 ring-[#F26B21]" : "border-gray-200 hover:border-gray-300 bg-white"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Icon className={`h-4 w-4 ${kind === k ? "text-[#F26B21]" : "text-gray-400"}`} />{title}</span>
              <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{sub}</span>
            </button>
          ))}
        </div>
      </div>
      {kind === "client" && (
        <div className="space-y-1.5">
          <Label>Client *</Label>
          <Select value={value.client_id || ""} onValueChange={pickClient}>
            <SelectTrigger data-testid={`${testid}-client`}><SelectValue placeholder="Select a client" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Location</Label>
        <LocationSelect value={value.branch_id || null} onChange={(v) => onChange({ branch_id: v })} testid={`${testid}-branch`} fallbackName={value.branch_name}
          none={limited ? undefined : kind === "internal" ? "Whole company" : "No location yet"} />
        <p className="text-xs text-gray-500">
          {kind === "internal" ? "Internal projects never appear in the client portal or on client invoices." : "The location that runs this project. It starts as the client's location."}
        </p>
      </div>
    </div>
  );
}

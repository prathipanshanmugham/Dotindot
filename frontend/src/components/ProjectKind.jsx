import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Building2 } from "lucide-react";

const KINDS = [
  ["client", "For a client", "Work we deliver and bill to a client", Briefcase],
  ["internal", "Internal", "Our own work: our website, marketing, tools or training", Building2],
];
const WHOLE = "__company";

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
 * Client project or internal project, then the client (or, for internal work, the branch).
 * value: { kind, client_id, branch_id }; onChange(patch)
 */
export default function ProjectKindField({ value, onChange, clients, testid = "project-kind" }) {
  const limited = useBranchLimited();
  const [branches, setBranches] = useState([]);
  useEffect(() => { api.get("/locations/branch-options").then((r) => setBranches(r.data)).catch(() => {}); }, []);
  const kind = value.kind || "client";
  const first = branches[0]?.id;
  useEffect(() => {  // people limited to some branches always file internal work under one of them
    if (limited && kind === "internal" && !value.branch_id && first) onChange({ branch_id: first });
  }, [limited, kind, value.branch_id, first]); // eslint-disable-line react-hooks/exhaustive-deps
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
      {kind === "client" ? (
        <div className="space-y-1.5">
          <Label>Client *</Label>
          <Select value={value.client_id || ""} onValueChange={(v) => onChange({ client_id: v })}>
            <SelectTrigger data-testid={`${testid}-client`}><SelectValue placeholder="Select a client" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Select value={value.branch_id || (limited ? branches[0]?.id || "" : WHOLE)} onValueChange={(v) => onChange({ branch_id: v === WHOLE ? null : v })}>
            <SelectTrigger data-testid={`${testid}-branch`}><SelectValue placeholder="Pick a branch" /></SelectTrigger>
            <SelectContent>
              {!limited && <SelectItem value={WHOLE}>Whole company</SelectItem>}
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">Internal projects never appear in the client portal or on client invoices.</p>
        </div>
      )}
    </div>
  );
}

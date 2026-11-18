import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";

let cache = null;
let wait = null;
const load = () => {
  wait = wait || api.get("/locations/branch-options").then((r) => { cache = r.data; return r.data; }).catch(() => { wait = null; return []; });
  return wait;
};

/** Our locations (branches) this person can use, fetched once and refreshed when records change. */
export const useBranchOptions = () => {
  const [branches, setBranches] = useState(cache || []);
  useEffect(() => {
    let live = true;
    if (!cache) load().then((b) => live && setBranches(b));
    const clear = () => { cache = null; wait = null; load().then((b) => live && setBranches(b)); };
    window.addEventListener("records-changed", clear);
    return () => { live = false; window.removeEventListener("records-changed", clear); };
  }, []);
  return branches;
};

// Location filter ("all" = every location the user can see). Server enforces scope.
export const BranchFilter = ({ value, onChange, testid = "branch-filter", className = "w-[180px]" }) => {
  const branches = useBranchOptions();
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger className={className} data-testid={testid}>
        <Building2 className="h-3.5 w-3.5 text-[#F26B21] mr-1.5 shrink-0" />
        <SelectValue placeholder="All locations" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All locations</SelectItem>
        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

const NONE = "__none";

/**
 * Pick one of our locations. `none` = label for "no location" (omit to force a pick).
 * A stored location the person can't see any more still shows by name (`fallbackName`).
 */
export const LocationSelect = ({ value, onChange, none, placeholder = "Pick a location", testid = "location-select", disabled, fallbackName, className = "" }) => {
  const branches = useBranchOptions();
  const known = !value || !branches.length || branches.some((b) => b.id === value);   // until the list loads, don't call it "another"
  return (
    <Select value={value || (none ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger className={className} data-testid={testid}>
        <Building2 className="h-3.5 w-3.5 text-[#F26B21] mr-1.5 shrink-0" />
        <span className="flex-1 min-w-0 text-left truncate"><SelectValue placeholder={placeholder} /></span>
      </SelectTrigger>
      <SelectContent>
        {none && <SelectItem value={NONE}>{none}</SelectItem>}
        {!known && <SelectItem value={value}>{fallbackName || "Another location"}</SelectItem>}
        {branches.map((b) => <SelectItem key={b.id} value={b.id} data-testid={`${testid}-opt-${b.id}`}>{b.name}{b.city && !b.name.toLowerCase().includes(b.city.toLowerCase()) ? ` — ${b.city}` : ""}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";

let cache = null;

// Branch dropdown ("all" = every branch the user can see). Server enforces scope.
export const BranchFilter = ({ value, onChange, testid = "branch-filter", className = "w-[180px]" }) => {
  const [branches, setBranches] = useState(cache || []);
  useEffect(() => {
    if (cache) return;
    api.get("/locations/branch-options").then((r) => { cache = r.data; setBranches(r.data); }).catch(() => {});
  }, []);
  useEffect(() => {
    const clear = () => { cache = null; api.get("/locations/branch-options").then((r) => { cache = r.data; setBranches(r.data); }).catch(() => {}); };
    window.addEventListener("records-changed", clear);
    return () => window.removeEventListener("records-changed", clear);
  }, []);
  return (
    <Select value={value || "all"} onValueChange={onChange}>
      <SelectTrigger className={className} data-testid={testid}>
        <Building2 className="h-3.5 w-3.5 text-[#F26B21] mr-1.5 shrink-0" />
        <SelectValue placeholder="All branches" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All branches</SelectItem>
        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

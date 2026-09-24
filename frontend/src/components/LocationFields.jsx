import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";

let geoCache = null;

const Combo = ({ value, onChange, options, placeholder, testid, disabled, allowCustom }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const showCustom = allowCustom && q.trim() && !options.some((o) => o.toLowerCase() === q.trim().toLowerCase());
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" disabled={disabled} data-testid={testid}
          className="w-full justify-between font-normal h-10 px-3 bg-white">
          <span className={`truncate ${value ? "text-gray-900" : "text-gray-400"}`}>{value || placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 z-[100] w-[--radix-popover-trigger-width] min-w-[220px]" align="start">
        <Command>
          <CommandInput placeholder={`Search…`} value={q} onValueChange={setQ} data-testid={`${testid}-search`} />
          <CommandList className="max-h-56">
            <CommandEmpty>{showCustom ? " " : "No match."}</CommandEmpty>
            {showCustom && (
              <CommandGroup heading="Custom">
                <CommandItem value={`__custom_${q}`} onSelect={() => { onChange(q.trim()); setOpen(false); }} data-testid={`${testid}-custom`}>
                  Use "{q.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => { onChange(o); setOpen(false); }} data-testid={`${testid}-opt-${o.replace(/\s+/g, "-").toLowerCase()}`}>
                  <Check className={`mr-2 h-3.5 w-3.5 ${o === value ? "opacity-100 text-[#F26B21]" : "opacity-0"}`} />
                  {o}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// Country -> State -> City cascading pickers. India uses the static dataset; others free-text.
export const LocationFields = ({ country, state, city, onChange, prefix = "loc", compact }) => {
  const [geo, setGeo] = useState(geoCache);

  useEffect(() => {
    if (geoCache) return;
    api.get("/locations/geo").then((r) => { geoCache = r.data; setGeo(r.data); }).catch(() => {});
  }, []);

  const countries = geo?.countries || ["India"];
  const states = country === "India" ? Object.keys(geo?.india_states || {}).sort() : [];
  const cities = country === "India" && state ? (geo?.india_states?.[state] || []) : [];
  const isIndia = country === "India";

  return (
    <>
      <div className="space-y-1">
        <Label>Country</Label>
        <Combo value={country} placeholder="Select country" options={countries} testid={`${prefix}-country`}
          onChange={(v) => onChange({ country: v, state: "", city: "" })} />
      </div>
      <div className="space-y-1">
        <Label>State / UT</Label>
        {isIndia ? (
          <Combo value={state} placeholder={states.length ? "Select state" : "Loading…"} options={states} testid={`${prefix}-state`}
            disabled={!states.length} onChange={(v) => onChange({ country, state: v, city: "" })} />
        ) : (
          <Input value={state || ""} placeholder="State / province" data-testid={`${prefix}-state`}
            onChange={(e) => onChange({ country, state: e.target.value, city })} />
        )}
      </div>
      <div className={`space-y-1 ${compact ? "" : "col-span-2 sm:col-span-1"}`}>
        <Label>City</Label>
        {isIndia ? (
          <Combo value={city} placeholder={state ? "Select or type city" : "Pick a state first"} options={cities} allowCustom
            disabled={!state} testid={`${prefix}-city`} onChange={(v) => onChange({ country, state, city: v })} />
        ) : (
          <Input value={city || ""} placeholder="City" data-testid={`${prefix}-city`}
            onChange={(e) => onChange({ country, state, city: e.target.value })} />
        )}
      </div>
    </>
  );
};

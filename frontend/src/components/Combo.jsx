import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronsUpDown, X } from "lucide-react";

/**
 * Dropdown with search. Pick one of `options`, or (allowCustom) type your own answer.
 * options: strings. A value that isn't in the list (older data) still shows as picked.
 */
export const Combo = ({ value, onChange, options, placeholder = "Select…", testid, disabled, allowCustom, clearable, className = "" }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = value && !options.includes(value) ? [value, ...options] : options;
  const typed = q.trim();
  const showCustom = allowCustom && typed && !list.some((o) => o.toLowerCase() === typed.toLowerCase());
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} data-testid={testid}
          className={`w-full justify-between font-normal h-10 px-3 bg-white ${className}`}>
          <span className={`truncate ${value ? "text-gray-900" : "text-gray-400"}`}>{value || placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 z-[100] w-[--radix-popover-trigger-width] min-w-[220px]" align="start">
        <Command>
          <CommandInput placeholder={allowCustom ? "Search or type…" : "Search…"} value={q} onValueChange={setQ} data-testid={testid && `${testid}-search`} />
          <CommandList className="max-h-60">
            <CommandEmpty>{showCustom ? " " : "No match."}</CommandEmpty>
            {showCustom && (
              <CommandGroup>
                <CommandItem value={`__custom_${typed}`} onSelect={() => { onChange(typed); setOpen(false); }} data-testid={testid && `${testid}-custom`}>
                  Use “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {list.map((o) => (
                <CommandItem key={o} value={o} onSelect={() => { onChange(o); setOpen(false); }} data-testid={testid && `${testid}-opt-${o.replace(/\s+/g, "-").toLowerCase()}`}>
                  <Check className={`mr-2 h-3.5 w-3.5 shrink-0 ${o === value ? "opacity-100 text-[#F26B21]" : "opacity-0"}`} />
                  {o}
                </CommandItem>
              ))}
            </CommandGroup>
            {clearable && value && (
              <CommandGroup>
                <CommandItem value="__clear" onSelect={() => { onChange(""); setOpen(false); }} className="text-gray-500">
                  <X className="mr-2 h-3.5 w-3.5" /> Clear
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const NONE = "__none";

/**
 * Plain dropdown for a fixed list. options: strings or [value, label]. `none` adds an empty choice with that label.
 * A stored value outside the list (older data) is kept and shown.
 */
export const ChoiceSelect = ({ value, onChange, options, none, placeholder = "Select…", testid, disabled, className = "" }) => {
  const opts = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  if (value && !opts.some(([v]) => v === value)) opts.unshift([value, value]);
  return (
    <Select value={value || (none ? NONE : "")} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
      <SelectTrigger className={className} data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {none && <SelectItem value={NONE}>{none}</SelectItem>}
        {opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

// Fixed answers used in more than one form
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];
export const MARITAL = ["Single", "Married", "Divorced", "Widowed", "Prefer not to say"];

let lookupCache = null;
let lookupWait = null;

/** Shared pick-lists from the server (departments, roles, categories…), fetched once. */
export const useLookups = () => {
  const [d, setD] = useState(lookupCache || {});
  useEffect(() => {
    if (lookupCache) return;
    lookupWait = lookupWait || api.get("/lookups").then((r) => { lookupCache = r.data; return r.data; }).catch(() => { lookupWait = null; return {}; });
    let live = true;
    lookupWait.then((x) => live && setD(x));
    return () => { live = false; };
  }, []);
  return d;
};

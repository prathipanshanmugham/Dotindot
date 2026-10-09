import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, X } from "lucide-react";

// Searchable multi-select. options: [{ value, label, hint? }]
export default function MultiSelect({ options = [], value = [], onChange, placeholder = "Select…", testid, emptyText = "Nothing found." }) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal" data-testid={testid}>
            <span className={`truncate ${selected.length ? "text-gray-800" : "text-gray-400"}`}>
              {selected.length ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[220px]" align="start">
          <Command>
            <CommandInput placeholder="Search…" />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.hint || ""}`} onSelect={() => toggle(o.value)} data-testid={testid ? `${testid}-opt-${o.value}` : undefined}>
                    <Check className={`h-4 w-4 mr-2 ${value.includes(o.value) ? "opacity-100 text-[#F26B21]" : "opacity-0"}`} />
                    <span className="truncate">{o.label}</span>
                    {o.hint && <span className="ml-auto pl-2 text-[11px] text-gray-400 shrink-0">{o.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((o) => (
            <span key={o.value} className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-[#FFF7ED] pl-2.5 pr-1 py-0.5 text-xs text-gray-700">
              <span className="truncate max-w-[160px]">{o.label}</span>
              <button type="button" onClick={() => toggle(o.value)} className="rounded-full p-0.5 hover:bg-orange-100" aria-label={`Remove ${o.label}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

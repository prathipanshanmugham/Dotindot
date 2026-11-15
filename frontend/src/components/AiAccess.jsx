// Shared pieces for AI connections: the access picker and the two super-admin switches.
// Used by Settings → AI and by the approval page an AI app sends you to (/connect-ai).
import { Switch } from "@/components/ui/switch";
import { ShieldCheck } from "lucide-react";

export const ACCESS = [
  { key: "read", label: "Read only", text: "Looks things up and summarises. Changes nothing." },
  { key: "write", label: "Read & write", text: "Also adds and updates records, like leads, tasks, notes and invoices. Never deletes." },
  { key: "full", label: "Full control", text: "Everything the login can do, deleting included. Deleted records go to the recycle bin." },
];

export const NEVER = "Never open to an AI, whatever you choose: AI settings, signing in and passwords, the client and investor portals, recycle-bin restores and wipes, and erasing the activity log.";

export function AccessPicker({ value, onChange, testid = "ai-access" }) {
  return (
    <div role="radiogroup" aria-label="What it can do" className="grid gap-2" data-testid={testid}>
      {ACCESS.map((a) => {
        const on = value === a.key;
        return (
          <button key={a.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(a.key)} data-testid={`${testid}-${a.key}`}
            className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F26B21]/50 ${on ? "border-[#F26B21] bg-orange-50/60" : "border-gray-200 hover:border-orange-200"}`}>
            <span className="flex items-center gap-2">
              <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${on ? "border-[#F26B21] bg-[radial-gradient(circle,#F26B21_45%,transparent_50%)]" : "border-gray-300"}`} aria-hidden="true" />
              <span className="text-sm font-semibold text-gray-900">{a.label}</span>
            </span>
            <span className="block text-xs text-gray-500 mt-0.5 pl-6">{a.text}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ExtraSwitches({ value, onChange, isSuper }) {
  const rows = [
    ["manage_access", "Change logins and permissions", "Add people, change roles and what each person can open."],
    ["read_secrets", "Read saved passwords and ID numbers", "Open the password manager, client logins, PAN, UAN and bank numbers."],
  ];
  return (
    <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
      {rows.map(([k, label, text]) => (
        <label key={k} className={`flex items-start justify-between gap-3 px-3.5 py-2.5 ${isSuper ? "cursor-pointer" : "opacity-60"}`}>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-800">{label}</span>
            <span className="block text-xs text-gray-500">{text}</span>
          </span>
          <Switch checked={!!value[k]} disabled={!isSuper} onCheckedChange={(v) => onChange(k, v)} data-testid={`ai-switch-${k}`} />
        </label>
      ))}
      {!isSuper && <p className="px-3.5 py-2 text-[11px] text-gray-400">Only a super admin can turn these on.</p>}
    </div>
  );
}

export const NeverNote = ({ className = "" }) => (
  <p className={`text-[11px] text-gray-500 flex items-start gap-1.5 ${className}`}><ShieldCheck className="h-3.5 w-3.5 mt-px shrink-0 text-emerald-600" />{NEVER}</p>
);

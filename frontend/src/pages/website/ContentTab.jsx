import { useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Empty, Pill, PillTabs, Field, initials } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Building2, Quote, Users, Trophy, MapPin, BadgeCheck } from "lucide-react";
import { ImageField, ConfirmDelete, mediaUrl, ORANGE_BTN } from "./websiteKit";

// Lists shown on the website, edited one item at a time. Order here = order on the site.
export const KINDS = {
  clients: {
    label: "Clients", one: "client", icon: Building2,
    empty: "Add the brands you work with. They appear in “Who we work with” on the home page and on the Clients page, with their logo and a short description.",
    title: (r) => r.name, sub: (r) => [r.industry, r.url && r.url.replace(/^https?:\/\//, "")].filter(Boolean).join(" · "), body: (r) => r.description,
    image: "logo", imageLabel: "Logo", imageHint: "A PNG with a transparent background works best. Without one, the name is shown.",
    fields: [
      ["name", "Brand name", "input", { required: true, max: 80, placeholder: "AVN Solar" }],
      ["industry", "Industry", "input", { max: 60, placeholder: "Solar energy" }],
      ["description", "Short description", "textarea", { max: 240, rows: 3, placeholder: "What we do for them, in a sentence" }],
      ["url", "Website", "input", { max: 300, placeholder: "https://example.com" }],
    ],
  },
  testimonials: {
    label: "Testimonials", one: "testimonial", icon: Quote,
    empty: "Add a quote from a client. It appears on the website only after you confirm they've agreed to be quoted.",
    title: (r) => r.name, sub: (r) => [r.role, r.company].filter(Boolean).join(", "), body: (r) => r.quote,
    image: "photo", imageLabel: "Photo", imageHint: "A square headshot. Initials are shown otherwise.",
    fields: [
      ["quote", "Quote", "textarea", { required: true, max: 600, rows: 5, placeholder: "What the client said, in their words" }],
      ["name", "Name", "input", { required: true, max: 80 }],
      ["role", "Role", "input", { max: 80, placeholder: "Founder" }],
      ["company", "Company", "input", { max: 80 }],
    ],
  },
  team: {
    label: "Team", one: "team member", icon: Users,
    empty: "Add the people behind the work. They appear on the About page, and on the home page once there are two or more.",
    title: (r) => r.name, sub: (r) => r.role, body: (r) => r.bio,
    image: "photo", imageLabel: "Photo", imageHint: "A square photo. Initials are shown otherwise.",
    fields: [
      ["name", "Name", "input", { required: true, max: 80 }],
      ["role", "Role", "input", { required: true, max: 80, placeholder: "Head of Performance" }],
      ["bio", "Short bio", "textarea", { max: 400, rows: 3, placeholder: "One or two lines on their experience" }],
      ["linkedin", "LinkedIn", "input", { max: 300, placeholder: "https://www.linkedin.com/in/…" }],
    ],
  },
  cases: {
    label: "Case studies", one: "case study", icon: Trophy,
    empty: "Add a result you can share. Case studies appear on the home page and the Clients page.",
    title: (r) => r.title, sub: (r) => [r.client, r.result].filter(Boolean).join(" · "), body: (r) => r.summary,
    fields: [
      ["client", "Client", "input", { required: true, max: 80 }],
      ["title", "Headline", "input", { required: true, max: 140, placeholder: "Cut cost per lead while doubling volume" }],
      ["result", "Key result", "input", { max: 60, placeholder: "2.4x leads" }],
      ["summary", "Summary", "textarea", { max: 500, rows: 4, placeholder: "The challenge, what we did and the outcome" }],
    ],
  },
  locations: {
    label: "Offices", one: "office", icon: MapPin,
    empty: "Add your offices. Each one appears on the Contact page with its address, phone, email and directions, in the footer, and in the details search engines read.",
    title: (r) => r.name, sub: (r) => [r.city, r.country, r.phone].filter(Boolean).join(" · "), body: (r) => r.address,
    fields: [
      ["name", "Office name", "input", { required: true, max: 80, placeholder: "Erode" }],
      ["address", "Street address", "textarea", { required: true, max: 300, rows: 3, placeholder: "Door number, street, area" }],
      ["city", "City and postcode", "input", { max: 60, placeholder: "Erode 638001" }],
      ["country", "Country", "input", { max: 60, placeholder: "India" }],
      ["phone", "Phone", "input", { max: 30, placeholder: "+91 424 …" }],
      ["email", "Email", "input", { max: 120, placeholder: "erode@dotindot.in" }],
      ["hours", "Opening hours", "input", { max: 100, placeholder: "Mon–Sat, 9:30 am – 6:30 pm" }],
      ["map_url", "Google Maps link", "input", { max: 500, placeholder: "Optional — otherwise found from the address" }],
    ],
    flag: ["hq", "Head office", "Shown first in search results as your main address."],
  },
  certifications: {
    label: "Certifications", one: "certification", icon: BadgeCheck,
    empty: "Add certifications and partner badges (Google Partner, Meta Business Partner, ISO…). Their logos appear on the home and About pages. Only add ones you currently hold.",
    title: (r) => r.name, sub: (r) => r.url && r.url.replace(/^https?:\/\//, ""),
    image: "logo", imageLabel: "Badge or logo", imageHint: "The official badge, as a PNG or WebP.",
    fields: [
      ["name", "Name", "input", { required: true, max: 100, placeholder: "Google Partner" }],
      ["url", "Verification link", "input", { max: 300, placeholder: "Where visitors can check it (optional)" }],
    ],
  },
};
export const CONTENT_KINDS = Object.keys(KINDS);

const ItemDialog = ({ kind, row, onClose, onSaved }) => {
  const K = KINDS[kind];
  const [f, setF] = useState(() => ({
    ...Object.fromEntries(K.fields.map(([k]) => [k, row?.[k] || ""])), ...(K.image ? { [K.image]: row?.[K.image] || "" } : {}),
    consent: !!row?.consent, hq: !!row?.hq,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const save = async (e) => {
    e.preventDefault();
    const missing = K.fields.find(([k, , , o]) => o.required && !String(f[k] || "").trim());
    if (missing) return toast.error(`${missing[1]} is required`);
    setBusy(true);
    const body = { ...f };
    if (kind !== "testimonials") delete body.consent;
    if (kind !== "locations") delete body.hq;
    try {
      const r = row ? await api.put(`/website/${kind}/${row.id}`, body) : await api.post(`/website/${kind}`, body);
      onSaved(r.data.publish, row ? "Saved" : `Added ${K.one}`);
    } catch (err) { toast.error(apiError(err)); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="website-item-dialog">
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${K.one}` : `Add ${K.one}`}</DialogTitle>
          <DialogDescription>Saving publishes it to the website.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className={kind === "locations" ? "grid sm:grid-cols-2 gap-4" : "space-y-4"}>
            {K.fields.map(([k, label, type, o]) => (
              <Field key={k} className={kind === "locations" && ["name", "address", "map_url"].includes(k) ? "sm:col-span-2" : ""}
                label={<>{label}{!o.required && <span className="text-gray-400 font-normal"> (optional)</span>}</>}>
                {type === "textarea"
                  ? <Textarea value={f[k]} onChange={set(k)} maxLength={o.max} rows={o.rows || 3} placeholder={o.placeholder} data-testid={`website-field-${k}`} />
                  : <Input value={f[k]} onChange={set(k)} maxLength={o.max} placeholder={o.placeholder} data-testid={`website-field-${k}`} />}
              </Field>
            ))}
          </div>
          {K.image && <ImageField label={<>{K.imageLabel} <span className="text-gray-400 font-normal">(optional)</span></>} hint={K.imageHint} value={f[K.image]} onChange={set(K.image)} round={K.image === "photo"} />}
          {K.flag && (
            <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm cursor-pointer">
              <Switch checked={f[K.flag[0]]} onCheckedChange={(v) => setF((s) => ({ ...s, [K.flag[0]]: v }))} className="mt-0.5" data-testid={`website-field-${K.flag[0]}`} />
              <span><span className="font-medium text-gray-800">{K.flag[1]}</span><span className="block text-xs text-gray-500 mt-0.5">{K.flag[2]}</span></span>
            </label>
          )}
          {kind === "testimonials" && (
            <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm cursor-pointer">
              <Checkbox checked={f.consent} onCheckedChange={(v) => setF((s) => ({ ...s, consent: !!v }))} className="mt-0.5" data-testid="website-field-consent" />
              <span><span className="font-medium text-gray-800">{f.name || "The client"} has agreed to be quoted on our website.</span><span className="block text-xs text-gray-500 mt-0.5">Until this is ticked, the quote is saved here but not shown on the site.</span></span>
            </label>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy} className={ORANGE_BTN} data-testid="website-save">{busy ? "Publishing…" : row ? "Save and publish" : "Add and publish"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ItemList = ({ kind, rows, canManage, canDelete, busy, onEdit, onDelete, onToggle, onMove }) => {
  const K = KINDS[kind];
  if (!rows.length) return <Card className="border-gray-200/80 shadow-sm"><Empty icon={K.icon} title={`No ${K.label.toLowerCase()} yet`} sub={K.empty}
    action={canManage && <Button size="sm" onClick={() => onEdit(null)} className={ORANGE_BTN}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add {K.one}</Button>} /></Card>;
  return (
    <div className="space-y-2" data-testid={`website-list-${kind}`}>
      {rows.map((r, i) => {
        const img = K.image && r[K.image];
        const shown = r.visible !== false && (kind !== "testimonials" || r.consent);
        return (
          <Card key={r.id} className={`border-gray-200/80 shadow-sm ${shown ? "" : "bg-gray-50/70"}`} data-testid={`website-row-${r.id}`}>
            <CardContent className="p-3.5 flex flex-wrap sm:flex-nowrap items-start gap-3">
              {K.image && (
                <div className={`h-11 w-11 shrink-0 overflow-hidden border border-gray-200 bg-white flex items-center justify-center text-xs font-bold text-gray-500 ${K.image === "photo" ? "rounded-full" : "rounded-lg"}`}>
                  {img ? <img src={mediaUrl(img)} alt="" className={`h-full w-full ${K.image === "photo" ? "object-cover" : "object-contain p-1"}`} /> : initials(K.title(r))}
                </div>
              )}
              {kind === "locations" && <div className="h-11 w-11 shrink-0 rounded-lg bg-[#FFF7ED] flex items-center justify-center"><MapPin className="h-5 w-5 text-[#F26B21]" /></div>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-semibold break-words ${shown ? "text-gray-900" : "text-gray-500"}`}>{K.title(r)}</span>
                  {r.hq && <Pill tone="orange">Head office</Pill>}
                  {r.visible === false && <Pill tone="gray">Hidden</Pill>}
                  {kind === "testimonials" && !r.consent && <Pill tone="amber">Waiting for the client's OK</Pill>}
                </div>
                {K.sub(r) && <div className="text-xs text-gray-500 mt-0.5 truncate">{K.sub(r)}</div>}
                {K.body && K.body(r) && <p className="text-sm text-gray-600 mt-1.5 line-clamp-2 whitespace-pre-line">{K.body(r)}</p>}
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto border-t border-gray-100 pt-2 sm:border-0 sm:pt-0">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 mr-auto sm:mr-1.5" title="Show on the website">
                    <Switch checked={r.visible !== false} disabled={busy} onCheckedChange={(v) => onToggle(r, v)} data-testid={`website-visible-${r.id}`} /> On website
                  </label>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400" disabled={busy || i === 0} onClick={() => onMove(i, -1)} title="Move up" aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400" disabled={busy || i === rows.length - 1} onClick={() => onMove(i, 1)} title="Move down" aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500" disabled={busy} onClick={() => onEdit(r)} title="Edit" aria-label="Edit" data-testid={`website-edit-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                  {canDelete && <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-red-600" disabled={busy} onClick={() => onDelete(r)} title="Delete" aria-label="Delete" data-testid={`website-delete-${r.id}`}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

/** Clients, testimonials, team, case studies, offices and certifications. */
export default function ContentTab({ data, setData, canManage, canDelete, busy, run, done }) {
  const [kind, setKind] = useState("clients");
  const [edit, setEdit] = useState(undefined); // undefined closed · null new · row
  const [del, setDel] = useState(null);
  const rows = data[kind] || [];
  const toggle = (r, v) => run(() => api.put(`/website/${kind}/${r.id}`, { visible: v }), v ? "Shown on the website" : "Hidden from the website");
  const move = (i, dir) => {
    const ids = rows.map((r) => r.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    setData((d) => ({ ...d, [kind]: ids.map((id) => d[kind].find((r) => r.id === id)) }));
    run(() => api.post(`/website/${kind}/order`, { ids }), null);
  };
  const K = KINDS[kind];
  return (
    <div className="space-y-4" data-testid="website-content">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs tabs={CONTENT_KINDS.map((k) => [k, KINDS[k].label, (data[k] || []).length])} value={kind} onChange={setKind} testid="website-tabs" />
        {canManage && <Button size="sm" onClick={() => setEdit(null)} disabled={busy} className={ORANGE_BTN} data-testid="website-add"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add {K.one}</Button>}
      </div>
      <ItemList kind={kind} rows={rows} canManage={canManage} canDelete={canDelete} busy={busy} onEdit={setEdit} onDelete={setDel} onToggle={toggle} onMove={move} />
      {edit !== undefined && <ItemDialog kind={kind} row={edit} onClose={() => setEdit(undefined)} onSaved={(p, m) => { setEdit(undefined); done(p, m); }} />}
      {del && <ConfirmDelete what={K.one} title={K.title(del)} onClose={() => setDel(null)}
        onConfirm={async () => { const r = await api.delete(`/website/${kind}/${del.id}`); setDel(null); done(r.data.publish, "Deleted. It's in the recycle bin for 24 hours."); }} />}
    </div>
  );
}

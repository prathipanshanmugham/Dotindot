import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, Empty, Pill, PageHead, PillTabs, Field, ago, initials } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Globe, Plus, Pencil, Trash2, ArrowUp, ArrowDown, ExternalLink, RefreshCw, CheckCircle2, AlertTriangle,
  Building2, Quote, Users, Trophy, Hash, ImagePlus, X,
} from "lucide-react";

// v3.3 Website editor: what visitors see on the public site. Every save publishes (rebuild + swap, a few seconds).
const ORIGIN = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const mediaUrl = (p) => (p ? `${ORIGIN}/${p.replace(/^\//, "")}` : "");

const KINDS = {
  clients: {
    label: "Clients", one: "client", icon: Building2,
    empty: "Add the brands you work with. Their names (or logos) appear on the home page and the Clients page.",
    title: (r) => r.name, sub: (r) => [r.industry, r.url && r.url.replace(/^https?:\/\//, "")].filter(Boolean).join(" · "),
    image: "logo", imageLabel: "Logo", imageHint: "Optional. A PNG with a transparent background works best.",
    fields: [
      ["name", "Brand name", "input", { required: true, max: 80, placeholder: "AVN Solar" }],
      ["industry", "Industry", "input", { max: 60, placeholder: "Solar energy" }],
      ["url", "Website", "input", { max: 300, placeholder: "https://example.com" }],
    ],
  },
  testimonials: {
    label: "Testimonials", one: "testimonial", icon: Quote,
    empty: "Add a quote from a client. It appears on the website only after you confirm they've agreed to be quoted.",
    title: (r) => r.name, sub: (r) => [r.role, r.company].filter(Boolean).join(", "), body: (r) => r.quote,
    image: "photo", imageLabel: "Photo", imageHint: "Optional. A square headshot. Initials are shown otherwise.",
    fields: [
      ["quote", "Quote", "textarea", { required: true, max: 600, placeholder: "What the client said, in their words" }],
      ["name", "Name", "input", { required: true, max: 80 }],
      ["role", "Role", "input", { max: 80, placeholder: "Founder" }],
      ["company", "Company", "input", { max: 80 }],
    ],
  },
  team: {
    label: "Team", one: "team member", icon: Users,
    empty: "Add the people behind the work. They appear on the About page and in the home page's team section.",
    title: (r) => r.name, sub: (r) => r.role, body: (r) => r.bio,
    image: "photo", imageLabel: "Photo", imageHint: "Optional. A square photo. Initials are shown otherwise.",
    fields: [
      ["name", "Name", "input", { required: true, max: 80 }],
      ["role", "Role", "input", { required: true, max: 80, placeholder: "Head of Performance" }],
      ["bio", "Short bio", "textarea", { max: 400, placeholder: "One or two lines on their experience" }],
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
      ["summary", "Summary", "textarea", { max: 500, placeholder: "The challenge, what we did and the outcome" }],
    ],
  },
};

const PublishBar = ({ publish, canManage, busy, onPublish }) => {
  const ok = publish?.status === "live";
  return (
    <Card className={`shadow-sm ${publish?.status === "error" ? "border-red-200 bg-red-50/60" : "border-gray-200/80"}`} data-testid="website-publish-bar">
      <CardContent className="p-3.5 flex flex-wrap items-center gap-3">
        {busy ? <RefreshCw className="h-4 w-4 text-[#F26B21] animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : publish ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <Globe className="h-4 w-4 text-gray-400" />}
        <div className="min-w-0 flex-1 text-sm">
          {busy ? <span className="font-medium text-gray-800">Publishing to the website…</span>
            : ok ? <span><span className="font-medium text-gray-800">Live on the website.</span> <span className="text-gray-500">Published {ago(publish.at)} by {publish.by}.</span></span>
              : publish ? <span><span className="font-medium text-red-700">Saved, but the website wasn't updated.</span> <span className="text-red-700/80">{publish.error}</span></span>
                : <span className="text-gray-600">Changes you save here go live on the website in a few seconds.</span>}
        </div>
        {canManage && <Button size="sm" variant="outline" onClick={onPublish} disabled={busy} data-testid="website-publish"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Publish now</Button>}
      </CardContent>
    </Card>
  );
};

const ImageField = ({ label, hint, value, onChange, round }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("That image is over 5 MB. Please use a smaller one.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await api.post("/website/media", fd);
      onChange(r.data.path);
    } catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  };
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <div className={`h-16 w-16 shrink-0 overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center ${round ? "rounded-full" : "rounded-xl"}`}>
          {value ? <img src={mediaUrl(value)} alt="" className={`h-full w-full ${round ? "object-cover" : "object-contain p-1.5"}`} /> : <ImagePlus className="h-5 w-5 text-gray-300" />}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} data-testid="website-image-input" />
        <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy}>{busy ? "Uploading…" : value ? "Replace" : "Upload image"}</Button>
        {value && <Button type="button" size="sm" variant="ghost" className="text-gray-500" onClick={() => onChange("")}><X className="h-3.5 w-3.5 mr-1" /> Remove</Button>}
      </div>
    </Field>
  );
};

const ItemDialog = ({ kind, row, onClose, onSaved }) => {
  const K = KINDS[kind];
  const [f, setF] = useState(() => ({ ...Object.fromEntries(K.fields.map(([k]) => [k, row?.[k] || ""])), ...(K.image ? { [K.image]: row?.[K.image] || "" } : {}), consent: !!row?.consent }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const save = async (e) => {
    e.preventDefault();
    const missing = K.fields.find(([k, , , o]) => o.required && !String(f[k] || "").trim());
    if (missing) return toast.error(`${missing[1]} is required`);
    setBusy(true);
    const body = { ...f };
    if (kind !== "testimonials") delete body.consent;
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
          {K.fields.map(([k, label, type, o]) => (
            <Field key={k} label={<>{label}{!o.required && <span className="text-gray-400 font-normal"> (optional)</span>}</>}>
              {type === "textarea"
                ? <Textarea value={f[k]} onChange={set(k)} maxLength={o.max} rows={k === "quote" ? 5 : 3} placeholder={o.placeholder} data-testid={`website-field-${k}`} />
                : <Input value={f[k]} onChange={set(k)} maxLength={o.max} placeholder={o.placeholder} data-testid={`website-field-${k}`} />}
            </Field>
          ))}
          {K.image && <ImageField label={<>{K.imageLabel} <span className="text-gray-400 font-normal">(optional)</span></>} hint={K.imageHint} value={f[K.image]} onChange={set(K.image)} round={K.image === "photo"} />}
          {kind === "testimonials" && (
            <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm cursor-pointer">
              <Checkbox checked={f.consent} onCheckedChange={(v) => setF((s) => ({ ...s, consent: !!v }))} className="mt-0.5" data-testid="website-field-consent" />
              <span><span className="font-medium text-gray-800">{f.name || "The client"} has agreed to be quoted on our website.</span><span className="block text-xs text-gray-500 mt-0.5">Until this is ticked, the quote is saved here but not shown on the site.</span></span>
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-[#F26B21] hover:bg-[#d95a14] text-white" data-testid="website-save">{busy ? "Publishing…" : row ? "Save and publish" : `Add and publish`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const DeleteDialog = ({ kind, row, onClose, onDone }) => {
  const K = KINDS[kind];
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.delete(`/website/${kind}/${row.id}`);
      onDone(r.data.publish, `Deleted. It's in the recycle bin for 24 hours.`);
    } catch (err) { toast.error(apiError(err)); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this {K.one}?</DialogTitle>
          <DialogDescription>“{K.title(row)}” comes off the website now. You can restore it from the recycle bin for 24 hours. To keep it but hide it from the site, switch off “On website” instead.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={go} disabled={busy} data-testid="website-delete-confirm">{busy ? "Deleting…" : "Delete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ItemList = ({ kind, rows, canManage, canDelete, busy, onEdit, onDelete, onToggle, onMove }) => {
  const K = KINDS[kind];
  if (!rows.length) return <Card className="border-gray-200/80 shadow-sm"><Empty icon={K.icon} title={`No ${K.label.toLowerCase()} yet`} sub={K.empty}
    action={canManage && <Button size="sm" onClick={() => onEdit(null)} className="bg-[#F26B21] hover:bg-[#d95a14] text-white"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add {K.one}</Button>} /></Card>;
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
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-semibold ${shown ? "text-gray-900" : "text-gray-500"}`}>{K.title(r)}</span>
                  {r.visible === false && <Pill tone="gray">Hidden</Pill>}
                  {kind === "testimonials" && !r.consent && <Pill tone="amber">Waiting for the client's OK</Pill>}
                </div>
                {K.sub(r) && <div className="text-xs text-gray-500 mt-0.5 truncate">{K.sub(r)}</div>}
                {K.body && K.body(r) && <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">{K.body(r)}</p>}
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto border-t border-gray-100 pt-2 sm:border-0 sm:pt-0">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 mr-auto sm:mr-1.5" title="Show on the website">
                    <Switch checked={r.visible !== false} disabled={busy} onCheckedChange={(v) => onToggle(r, v)} data-testid={`website-visible-${r.id}`} /> On website
                  </label>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" disabled={busy || i === 0} onClick={() => onMove(i, -1)} title="Move up"><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" disabled={busy || i === rows.length - 1} onClick={() => onMove(i, 1)} title="Move down"><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500" disabled={busy} onClick={() => onEdit(r)} title="Edit" data-testid={`website-edit-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                  {canDelete && <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" disabled={busy} onClick={() => onDelete(r)} title="Delete" data-testid={`website-delete-${r.id}`}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const SOCIAL = [["linkedin", "LinkedIn"], ["instagram", "Instagram"], ["youtube", "YouTube"], ["x", "X"], ["facebook", "Facebook"]];

const SettingsForm = ({ settings, canManage, onSaved }) => {
  const init = () => ({
    numbers: [...(settings.numbers || []), ...Array(4).fill({ value: "", label: "" })].slice(0, 4),
    email: settings.email || "", phone: settings.phone || "", phone_display: settings.phone_display || "", whatsapp: settings.whatsapp || "",
    social: Object.fromEntries(SOCIAL.map(([k]) => [k, settings.social?.[k] || ""])),
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(init()); }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const setNum = (i, k) => (e) => setF((s) => ({ ...s, numbers: s.numbers.map((n, j) => (j === i ? { ...n, [k]: e.target.value } : n)) }));
  const save = async (e) => {
    e.preventDefault();
    if (f.numbers.some((n) => !!n.value.trim() !== !!n.label.trim())) return toast.error("Each number needs both a figure and a label");
    setBusy(true);
    try {
      const r = await api.put("/website-settings", { ...f, numbers: f.numbers.filter((n) => n.value.trim() && n.label.trim()) });
      onSaved(r.data.publish, "Saved");
    } catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  };
  const dis = !canManage || busy;
  return (
    <form onSubmit={save} className="space-y-4" data-testid="website-settings">
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Key numbers</h3>
            <p className="text-sm text-gray-500">Shown under the home page headline when at least three are filled in. Use only figures you can stand behind.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {f.numbers.map((n, i) => (
              <div key={i} className="flex gap-2">
                <Input className="w-28 shrink-0 font-semibold" value={n.value} onChange={setNum(i, "value")} maxLength={20} placeholder="e.g. 40+" disabled={dis} data-testid={`website-number-${i}`} />
                <Input value={n.label} onChange={setNum(i, "label")} maxLength={60} placeholder="What it counts, e.g. Brands served" disabled={dis} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Contact details</h3>
            <p className="text-sm text-gray-500">Used in the header, footer, contact page and search results.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} disabled={dis} data-testid="website-email" /></Field>
            <Field label="WhatsApp number" hint="Digits with country code, like 919876543210"><Input value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} disabled={dis} inputMode="numeric" data-testid="website-whatsapp" /></Field>
            <Field label="Phone (for dialling)" hint="With country code, like +91 98765 43210"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} disabled={dis} data-testid="website-phone" /></Field>
            <Field label="Phone (as shown)" hint="How the number is written on the site"><Input value={f.phone_display} onChange={(e) => setF({ ...f, phone_display: e.target.value })} disabled={dis} /></Field>
          </div>
        </CardContent>
      </Card>
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Social profiles</h3>
            <p className="text-sm text-gray-500">Full links starting with https://. Leave blank to hide.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {SOCIAL.map(([k, label]) => (
              <Field key={k} label={label}><Input value={f.social[k]} onChange={(e) => setF({ ...f, social: { ...f.social, [k]: e.target.value } })} placeholder="https://" disabled={dis} /></Field>
            ))}
          </div>
        </CardContent>
      </Card>
      {canManage && <div className="flex justify-end"><Button type="submit" disabled={busy} className="bg-[#F26B21] hover:bg-[#d95a14] text-white" data-testid="website-settings-save">{busy ? "Publishing…" : "Save and publish"}</Button></div>}
    </form>
  );
};

export default function WebsitePage() {
  const [data, reload, setData] = useLoad("/website");
  const [tab, setTab] = useState("clients");
  const [edit, setEdit] = useState(undefined); // undefined closed · null new · row
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!data) return <Spinner />;
  const { can_manage: canManage, can_delete: canDelete } = data;
  const done = (publish, msg) => {
    setEdit(undefined); setDel(null); setBusy(false);
    setData((d) => ({ ...d, publish }));
    if (publish?.status === "error") toast.error("Saved, but the website wasn't updated. See the note at the top.");
    else if (msg) toast.success(`${msg}. The website is updated.`);
    reload();
  };
  const run = async (fn, msg) => {
    setBusy(true);
    try { const r = await fn(); done(r.data.publish || r.data, msg); } catch (err) { toast.error(apiError(err)); setBusy(false); }
  };
  const rows = tab === "settings" ? [] : data[tab] || [];
  const toggle = (r, v) => run(() => api.put(`/website/${tab}/${r.id}`, { visible: v }), v ? "Shown on the website" : "Hidden from the website");
  const move = (i, dir) => {
    const ids = rows.map((r) => r.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    setData((d) => ({ ...d, [tab]: ids.map((id) => d[tab].find((r) => r.id === id)) }));
    run(() => api.post(`/website/${tab}/order`, { ids }), null);
  };
  const tabs = [...Object.entries(KINDS).map(([k, K]) => [k, K.label, (data[k] || []).length]), ["settings", "Numbers & contact"]];

  return (
    <div className="space-y-5 max-w-5xl" data-testid="website-page">
      <PageHead kicker="Growth" title="Website" sub="Clients, testimonials, team, case studies and contact details on dotindot.in"
        actions={<>
          <Button variant="outline" size="sm" asChild><a href="/" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View website</a></Button>
          {canManage && tab !== "settings" && <Button size="sm" onClick={() => setEdit(null)} disabled={busy} className="bg-[#F26B21] hover:bg-[#d95a14] text-white" data-testid="website-add"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add {KINDS[tab].one}</Button>}
        </>} />
      <PublishBar publish={data.publish} canManage={canManage} busy={busy} onPublish={() => run(() => api.post("/website-publish"), "Published")} />
      <PillTabs tabs={tabs} value={tab} onChange={setTab} testid="website-tabs" />
      {tab === "settings"
        ? <SettingsForm settings={data.settings} canManage={canManage} onSaved={done} />
        : <ItemList kind={tab} rows={rows} canManage={canManage} canDelete={canDelete} busy={busy} onEdit={setEdit} onDelete={setDel} onToggle={toggle} onMove={move} />}
      {tab !== "settings" && !canManage && <p className="text-xs text-gray-500 flex items-center gap-1.5"><Hash className="h-3 w-3" /> You can view the website content. Ask an admin for “Website: manage” to change it.</p>}
      {edit !== undefined && <ItemDialog kind={tab} row={edit} onClose={() => setEdit(undefined)} onSaved={done} />}
      {del && <DeleteDialog kind={tab} row={del} onClose={() => setDel(null)} onDone={done} />}
    </div>
  );
}

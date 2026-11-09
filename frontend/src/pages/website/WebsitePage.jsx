import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, PageHead, Field } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, LayoutGrid, Newspaper, Search, FileText, MessageCircle, Phone } from "lucide-react";
import { PublishBar, siteUrl, ORANGE_BTN } from "./websiteKit";
import ContentTab from "./ContentTab";
import InsightsTab from "./InsightsTab";
import SeoTab from "./SeoTab";
import PagesTab from "./PagesTab";
import ChatbotTab from "./ChatbotTab";

// v3.3 Website editor: everything visitors see on dotindot.in that isn't code. Every save publishes
// (the site is rebuilt next to the live one and swapped in, a few seconds).
const SECTIONS = [
  ["content", "Content", LayoutGrid], ["insights", "Insights", Newspaper], ["seo", "SEO", Search],
  ["pages", "Pages", FileText], ["chatbot", "Chatbot", MessageCircle], ["contact", "Contact & numbers", Phone],
];

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
      {canManage && <div className="flex justify-end"><Button type="submit" disabled={busy} className={ORANGE_BTN} data-testid="website-settings-save">{busy ? "Publishing…" : "Save and publish"}</Button></div>}
    </form>
  );
};

export default function WebsitePage() {
  const [data, reload, setData] = useLoad("/website");
  const [params, setParams] = useSearchParams();
  const section = SECTIONS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "content";
  const [busy, setBusy] = useState(false);

  if (!data) return <Spinner />;
  const { can_manage: canManage, can_delete: canDelete } = data;
  const done = (publish, msg) => {
    setBusy(false);
    if (publish) setData((d) => ({ ...d, publish }));
    if (publish?.status === "error") toast.error("Saved, but the website wasn't updated. See the note at the top.");
    else if (msg) toast.success(`${msg}. The website is updated.`);
    reload();
  };
  const run = async (fn, msg) => {
    setBusy(true);
    try { const r = await fn(); done(r.data.publish || r.data, msg); } catch (err) { toast.error(apiError(err)); setBusy(false); }
  };
  const props = { data, setData, canManage, canDelete, busy, run, done, onSaved: done };

  return (
    <div className="space-y-5 max-w-5xl" data-testid="website-page">
      <PageHead kicker="Growth" title="Website" sub="Everything visitors see on dotindot.in: content, articles, SEO, legal pages and the chat assistant"
        actions={<Button variant="outline" size="sm" asChild><a href={siteUrl("/")} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View website</a></Button>} />
      <PublishBar publish={data.publish} canManage={canManage} busy={busy} onPublish={() => run(() => api.post("/website-publish"), "Published")} />
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-gray-200 min-w-max" role="tablist" data-testid="website-sections">
          {SECTIONS.map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={section === k} onClick={() => setParams(k === "content" ? {} : { tab: k }, { replace: true })}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${section === k ? "border-[#F26B21] text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"}`}
              data-testid={`website-section-${k}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      {section === "content" && <ContentTab {...props} />}
      {section === "insights" && <InsightsTab {...props} />}
      {section === "seo" && <SeoTab {...props} />}
      {section === "pages" && <PagesTab {...props} />}
      {section === "chatbot" && <ChatbotTab {...props} />}
      {section === "contact" && <SettingsForm settings={data.settings} canManage={canManage} onSaved={done} />}
    </div>
  );
}

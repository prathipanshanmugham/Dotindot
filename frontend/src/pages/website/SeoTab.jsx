import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Field } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, Search, RotateCcw } from "lucide-react";
import { Count, SearchPreview, ORANGE_BTN } from "./websiteKit";

/** Search engines: verification, analytics, and the title + description of every page. Articles are set in Insights. */
export default function SeoTab({ data, canManage, onSaved }) {
  const seo = data.settings?.seo || {};
  const pages = useMemo(() => data.pages_index || [], [data.pages_index]);
  const init = () => ({ google: seo.google || "", bing: seo.bing || "", ga4: seo.ga4 || "", pages: { ...(seo.pages || {}) } });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { setF(init()); }, [data.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const setPage = (path, k, v) => setF((s) => ({ ...s, pages: { ...s.pages, [path]: { ...(s.pages[path] || {}), [k]: v } } }));
  const shown = useMemo(() => pages.filter((p) => !q || `${p.path} ${p.title}`.toLowerCase().includes(q.toLowerCase())), [pages, q]);
  const changed = Object.values(f.pages).filter((v) => (v?.title || "").trim() || (v?.description || "").trim()).length;
  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const r = await api.put("/website-settings", { seo: f });
      onSaved(r.data.publish, "SEO saved");
    } catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  };
  const dis = !canManage || busy;
  return (
    <form onSubmit={save} className="space-y-4" data-testid="website-seo">
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Search engines and analytics</h3>
            <p className="text-sm text-gray-500">Paste the verification code (or the whole meta tag) from Google Search Console and Bing Webmaster Tools, then submit dotindot.in/sitemap.xml in both.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Google Search Console"><Input value={f.google} onChange={(e) => setF({ ...f, google: e.target.value })} disabled={dis} placeholder="<meta name=“google-site-verification” …>" data-testid="seo-google" /></Field>
            <Field label="Bing Webmaster Tools"><Input value={f.bing} onChange={(e) => setF({ ...f, bing: e.target.value })} disabled={dis} placeholder="<meta name=“msvalidate.01” …>" /></Field>
            <Field label="Google Analytics 4" hint="Measurement ID. Leave blank for no analytics."><Input value={f.ga4} onChange={(e) => setF({ ...f, ga4: e.target.value })} disabled={dis} placeholder="G-XXXXXXXXXX" /></Field>
          </div>
        </CardContent>
      </Card>
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900">Page titles and descriptions</h3>
              <p className="text-sm text-gray-500">What Google shows for each page. Leave blank to keep the default. {changed ? `${changed} page${changed > 1 ? "s" : ""} customised.` : ""} Article titles are set in Insights.</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page" className="pl-9" />
            </div>
          </div>
          {!pages.length && <p className="text-sm text-gray-500">The page list appears after the website has been published once.</p>}
          <div className="divide-y divide-gray-100 border-y border-gray-100">
            {shown.map((p) => {
              const ov = f.pages[p.path] || {}, isOpen = open === p.path, custom = (ov.title || "").trim() || (ov.description || "").trim();
              return (
                <div key={p.path} className="py-1">
                  <button type="button" onClick={() => setOpen(isOpen ? null : p.path)} className="w-full flex items-center gap-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate">{(ov.title || "").trim() || p.title}</span>
                      <span className="block text-xs text-gray-500 truncate">{p.path}{custom ? " · customised" : ""}</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="grid lg:grid-cols-2 gap-4 pb-4">
                      <div className="space-y-3 min-w-0">
                        <Field label={<span className="flex justify-between gap-2">Title <Count value={ov.title} ideal={60} max={90} /></span>}>
                          <Input value={ov.title || ""} onChange={(e) => setPage(p.path, "title", e.target.value)} maxLength={90} placeholder={p.title} disabled={dis} />
                        </Field>
                        <Field label={<span className="flex justify-between gap-2">Description <Count value={ov.description} ideal={155} max={220} /></span>}>
                          <Textarea value={ov.description || ""} onChange={(e) => setPage(p.path, "description", e.target.value)} maxLength={220} rows={3} placeholder={p.description} disabled={dis} />
                        </Field>
                        {custom && canManage && <Button type="button" size="sm" variant="ghost" className="text-gray-500" onClick={() => setF((s) => ({ ...s, pages: { ...s.pages, [p.path]: { title: "", description: "" } } }))}><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Back to default</Button>}
                      </div>
                      <SearchPreview title={(ov.title || "").trim() || p.title} description={(ov.description || "").trim() || p.description} path={p.path} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {canManage && <div className="flex justify-end"><Button type="submit" disabled={busy} className={ORANGE_BTN} data-testid="seo-save">{busy ? "Publishing…" : "Save and publish"}</Button></div>}
    </form>
  );
}

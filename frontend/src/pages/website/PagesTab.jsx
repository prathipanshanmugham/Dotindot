import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Field, fmtDate } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLink, RotateCcw, Bot } from "lucide-react";
import { Count, siteUrl, ORANGE_BTN } from "./websiteKit";

const HINT = "## Heading · - bullet list · **bold** · [link text](https://…). {{name}}, {{email}} and {{domain}} are filled in for you.";

/** Privacy policy, terms of use, llms.txt and the "Who we work with" text. */
export default function PagesTab({ data, canManage, onSaved }) {
  const pg = data.settings?.pages || {}, def = data.default_pages || {};
  const init = () => ({ privacy: pg.privacy || def.privacy || "", terms: pg.terms || def.terms || "", llms: pg.llms || "", clients_intro: pg.clients_intro || "" });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(init()); }, [data.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // text identical to the built-in version is stored as "use the default", so later improvements still apply
      const body = { ...f, privacy: f.privacy.trim() === (def.privacy || "").trim() ? "" : f.privacy, terms: f.terms.trim() === (def.terms || "").trim() ? "" : f.terms };
      const r = await api.put("/website-settings", { pages: body });
      onSaved(r.data.publish, "Saved");
    } catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  };
  const dis = !canManage || busy;
  const legal = (k, title, path) => (
    <Card className="border-gray-200/80 shadow-sm">
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{pg[`${k}_updated`] ? `Last changed ${fmtDate(pg[`${k}_updated`])}` : "The built-in version"} · shown at dotindot.in{path}</p>
          </div>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" asChild><a href={siteUrl(path)} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View</a></Button>
            {canManage && f[k].trim() !== (def[k] || "").trim() && <Button type="button" size="sm" variant="ghost" className="text-gray-500" onClick={() => setF({ ...f, [k]: def[k] || "" })}><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Built-in version</Button>}
          </div>
        </div>
        <Field hint={HINT}><Textarea value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} rows={12} maxLength={30000} disabled={dis} className="font-mono text-[13px] leading-relaxed" data-testid={`pages-${k}`} /></Field>
      </CardContent>
    </Card>
  );
  return (
    <form onSubmit={save} className="space-y-4" data-testid="website-pages">
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-gray-900">“Who we work with” text</h3>
            <p className="text-sm text-gray-500">The line beside the client logos on the home page, and the introduction on the Clients page.</p>
          </div>
          <Field label={<span className="flex justify-between gap-2"><span /> <Count value={f.clients_intro} max={300} /></span>}>
            <Input value={f.clients_intro} onChange={(e) => setF({ ...f, clients_intro: e.target.value })} maxLength={300} disabled={dis}
              placeholder="Growth-focused businesses in energy, manufacturing, retail, e-commerce and professional services…" />
          </Field>
        </CardContent>
      </Card>
      {legal("privacy", "Privacy policy", "/privacy/")}
      {legal("terms", "Terms of use", "/terms/")}
      <Card className="border-gray-200/80 shadow-sm">
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Bot className="h-4 w-4 text-gray-400" /> llms.txt</h3>
              <p className="text-sm text-gray-500">The summary AI assistants such as ChatGPT, Claude and Perplexity read first. {f.llms.trim() ? "Written by hand." : "Automatic: rebuilt from your services, offices, markets and articles on every publish."}</p>
            </div>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" asChild><a href={siteUrl("/llms.txt")} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> View</a></Button>
              {canManage && (f.llms.trim()
                ? <Button type="button" size="sm" variant="ghost" className="text-gray-500" onClick={() => setF({ ...f, llms: "" })}><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Back to automatic</Button>
                : <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, llms: data.llms_generated || "" })} disabled={!data.llms_generated}>Edit by hand</Button>)}
            </div>
          </div>
          {f.llms.trim()
            ? <Textarea value={f.llms} onChange={(e) => setF({ ...f, llms: e.target.value })} rows={14} maxLength={50000} disabled={dis} className="font-mono text-[12.5px] leading-relaxed" data-testid="pages-llms" />
            : <pre className="max-h-72 overflow-auto rounded-xl bg-gray-50 border border-gray-200 p-3 text-[12px] leading-relaxed text-gray-600 whitespace-pre-wrap break-words">{data.llms_generated || "Appears after the website has been published once."}</pre>}
        </CardContent>
      </Card>
      {canManage && <div className="flex justify-end"><Button type="submit" disabled={busy} className={ORANGE_BTN} data-testid="pages-save">{busy ? "Publishing…" : "Save and publish"}</Button></div>}
    </form>
  );
}

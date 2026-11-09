import { useMemo, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Empty, Pill, Field, fmtDate } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ExternalLink, Newspaper, Search } from "lucide-react";
import { ImageField, ConfirmDelete, Count, SearchPreview, siteUrl, ORANGE_BTN } from "./websiteKit";

const slugify = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
const words = (t) => (t || "").split(/\s+/).filter(Boolean).length;
const today = () => new Date().toISOString().slice(0, 10);

const ArticleDialog = ({ row, onClose, onSaved }) => {
  const [f, setF] = useState(() => ({
    title: row?.title || "", slug: row?.slug || "", date: row?.date || today(), summary: row?.summary || "", body: row?.body || "",
    image: row?.image || "", seo_title: row?.seo_title || "", seo_description: row?.seo_description || "", visible: row ? row.visible !== false : true,
  }));
  const [slugTouched, setSlugTouched] = useState(!!row);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => {
    const v = e?.target ? e.target.value : e, n = { ...s, [k]: v };
    if (k === "title" && !slugTouched) n.slug = slugify(v);
    return n;
  });
  const save = async (e) => {
    e.preventDefault();
    for (const [k, l] of [["title", "Title"], ["summary", "Summary"], ["body", "Article text"]]) if (!f[k].trim()) return toast.error(`${l} is required`);
    setBusy(true);
    try {
      const body = { ...f, slug: slugify(f.slug || f.title) };
      const r = row ? await api.put(`/website/insights/${row.id}`, body) : await api.post("/website/insights", body);
      onSaved(r.data.publish, row ? "Article saved" : f.visible ? "Article published" : "Draft saved");
    } catch (err) { toast.error(apiError(err)); setBusy(false); }
  };
  const mins = Math.max(1, Math.round(words(f.body) / 220));
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="article-dialog">
        <DialogHeader>
          <DialogTitle>{row ? "Edit article" : "New article"}</DialogTitle>
          <DialogDescription>Appears under Insights on the website, in the sitemap and in llms.txt.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label="Title"><Input value={f.title} onChange={set("title")} maxLength={140} placeholder="What should a lead cost?" data-testid="article-title" /></Field>
          <div className="grid sm:grid-cols-[1fr_160px] gap-4">
            <Field label="Web address" hint={`dotindot.in/insights/${slugify(f.slug || f.title) || "…"}/`}>
              <Input value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug")(e); }} maxLength={80} placeholder="from the title" />
            </Field>
            <Field label="Date"><Input type="date" value={f.date} onChange={set("date")} /></Field>
          </div>
          <Field label={<span className="flex justify-between gap-2">Summary <Count value={f.summary} max={300} /></span>} hint="Shown on the Insights page and as the description in search results (unless you set one below).">
            <Textarea value={f.summary} onChange={set("summary")} maxLength={300} rows={2} data-testid="article-summary" />
          </Field>
          <Field label={<span className="flex justify-between gap-2">Article <span className="text-[11px] text-gray-400">{words(f.body)} words · {mins} min read</span></span>}
            hint="## Heading · - bullet list · 1. numbered list · **bold** · [link text](https://…) · a blank line starts a new paragraph">
            <Textarea value={f.body} onChange={set("body")} rows={14} maxLength={30000} className="font-mono text-[13px] leading-relaxed" data-testid="article-body" />
          </Field>
          <ImageField label={<>Share image <span className="text-gray-400 font-normal">(optional)</span></>} hint="Shown when the article is shared on LinkedIn, WhatsApp or X. 1200 × 630 works best." value={f.image} onChange={set("image")} wide />
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Search className="h-4 w-4 text-gray-400" /> Search engines</div>
            <Field label={<span className="flex justify-between gap-2">Title in search results <Count value={f.seo_title} ideal={60} max={70} /></span>}>
              <Input value={f.seo_title} onChange={set("seo_title")} maxLength={70} placeholder={`${f.title || "Title"} — Dotindot Creative`} />
            </Field>
            <Field label={<span className="flex justify-between gap-2">Description in search results <Count value={f.seo_description} ideal={155} max={170} /></span>}>
              <Textarea value={f.seo_description} onChange={set("seo_description")} maxLength={170} rows={2} placeholder={f.summary || "Uses the summary"} />
            </Field>
            <SearchPreview title={f.seo_title || `${f.title || "Title"} — Dotindot Creative`} description={f.seo_description || f.summary} path={`/insights/${slugify(f.slug || f.title)}/`} />
          </div>
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <Switch checked={f.visible} onCheckedChange={(v) => setF((s) => ({ ...s, visible: v }))} data-testid="article-visible" />
            <span><span className="font-medium text-gray-800">Published</span><span className="text-gray-500"> — off keeps it as a draft here</span></span>
          </label>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy} className={ORANGE_BTN} data-testid="article-save">{busy ? "Publishing…" : f.visible ? "Save and publish" : "Save draft"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function InsightsTab({ data, canManage, canDelete, busy, run, done }) {
  const [edit, setEdit] = useState(undefined);
  const [del, setDel] = useState(null);
  const [q, setQ] = useState("");
  const rows = useMemo(() => (data.insights || []).filter((r) => !q || `${r.title} ${r.summary}`.toLowerCase().includes(q.toLowerCase())), [data.insights, q]);
  return (
    <div className="space-y-4" data-testid="website-insights">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles" className="pl-9" />
        </div>
        {canManage && <Button size="sm" onClick={() => setEdit(null)} disabled={busy} className={`${ORANGE_BTN} ml-auto`} data-testid="article-add"><Plus className="h-3.5 w-3.5 mr-1.5" /> New article</Button>}
      </div>
      {!rows.length ? (
        <Card className="border-gray-200/80 shadow-sm"><Empty icon={Newspaper} title={q ? "No articles match" : "No articles yet"} sub="Articles appear under Insights on the website, help you rank, and give AI assistants something to cite." /></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className={`border-gray-200/80 shadow-sm ${r.visible === false ? "bg-gray-50/70" : ""}`} data-testid={`article-row-${r.id}`}>
              <CardContent className="p-3.5 flex flex-wrap sm:flex-nowrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold break-words ${r.visible === false ? "text-gray-500" : "text-gray-900"}`}>{r.title}</span>
                    {r.visible === false && <Pill tone="gray">Draft</Pill>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{fmtDate(r.date)} · /insights/{r.slug}/</div>
                  <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">{r.summary}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto border-t border-gray-100 pt-2 sm:border-0 sm:pt-0">
                  {canManage && <label className="flex items-center gap-1.5 text-xs text-gray-500 mr-auto sm:mr-1.5"><Switch checked={r.visible !== false} disabled={busy}
                    onCheckedChange={(v) => run(() => api.put(`/website/insights/${r.id}`, { visible: v }), v ? "Article published" : "Article moved to drafts")} /> Published</label>}
                  {r.visible !== false && <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500" asChild><a href={siteUrl(`/insights/${r.slug}/`)} target="_blank" rel="noopener noreferrer" title="View on the website" aria-label="View on the website"><ExternalLink className="h-4 w-4" /></a></Button>}
                  {canManage && <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500" disabled={busy} onClick={() => setEdit(r)} title="Edit" aria-label="Edit"><Pencil className="h-4 w-4" /></Button>}
                  {canDelete && <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-red-600" disabled={busy} onClick={() => setDel(r)} title="Delete" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {edit !== undefined && <ArticleDialog row={edit} onClose={() => setEdit(undefined)} onSaved={(p, m) => { setEdit(undefined); done(p, m); }} />}
      {del && <ConfirmDelete what="article" title={del.title} onClose={() => setDel(null)}
        onConfirm={async () => { const r = await api.delete(`/website/insights/${del.id}`); setDel(null); done(r.data.publish, "Deleted. It's in the recycle bin for 24 hours."); }} />}
    </div>
  );
}


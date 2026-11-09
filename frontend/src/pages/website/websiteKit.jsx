import { useRef, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Field, ago } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Globe, RefreshCw, CheckCircle2, AlertTriangle, ImagePlus, X } from "lucide-react";

// v3.3 Website editor — shared pieces. Every save publishes (rebuild + swap, a few seconds).
const ORIGIN = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const mediaUrl = (p) => (p ? `${ORIGIN}/${p.replace(/^\//, "")}` : "");
export const siteUrl = (path = "/") => `${ORIGIN}${path}`;
export const ORANGE_BTN = "bg-[#F26B21] hover:bg-[#d95a14] text-white";

export const PublishBar = ({ publish, canManage, busy, onPublish }) => {
  const ok = publish?.status === "live";
  return (
    <Card className={`shadow-sm ${publish?.status === "error" ? "border-red-200 bg-red-50/60" : "border-gray-200/80"}`} data-testid="website-publish-bar">
      <CardContent className="p-3.5 flex flex-wrap items-center gap-3">
        {busy ? <RefreshCw className="h-4 w-4 text-[#F26B21] animate-spin" /> : ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : publish ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <Globe className="h-4 w-4 text-gray-400" />}
        <div className="min-w-0 flex-1 text-sm">
          {busy ? <span className="font-medium text-gray-800">Publishing to the website…</span>
            : ok ? <span><span className="font-medium text-gray-800">Live on the website.</span> <span className="text-gray-500">Published {ago(publish.at)} by {publish.by}.</span></span>
              : publish ? <span><span className="font-medium text-red-700">Saved, but the website wasn't updated.</span> <span className="text-red-700/80 break-words">{publish.error}</span></span>
                : <span className="text-gray-600">Changes you save here go live on the website in a few seconds.</span>}
        </div>
        {canManage && <Button size="sm" variant="outline" onClick={onPublish} disabled={busy} data-testid="website-publish"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Publish now</Button>}
      </CardContent>
    </Card>
  );
};

export const ImageField = ({ label, hint, value, onChange, round, wide }) => {
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
  const box = wide ? "h-16 w-28 rounded-xl" : round ? "h-16 w-16 rounded-full" : "h-16 w-16 rounded-xl";
  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap items-center gap-3">
        <div className={`${box} shrink-0 overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center`}>
          {value ? <img src={mediaUrl(value)} alt="" className={`h-full w-full ${round || wide ? "object-cover" : "object-contain p-1.5"}`} /> : <ImagePlus className="h-5 w-5 text-gray-300" />}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} data-testid="website-image-input" />
        <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy}>{busy ? "Uploading…" : value ? "Replace" : "Upload image"}</Button>
        {value && <Button type="button" size="sm" variant="ghost" className="text-gray-500" onClick={() => onChange("")}><X className="h-3.5 w-3.5 mr-1" /> Remove</Button>}
      </div>
    </Field>
  );
};

/** "12 / 60" under a field, amber when over the ideal length. */
export const Count = ({ value, ideal, max }) => {
  const n = (value || "").length;
  return <span className={`text-[11px] tabular-nums ${n > (ideal || max) ? "text-amber-700" : "text-gray-400"}`}>{n} / {ideal || max}{ideal && max && n > ideal ? ` (max ${max})` : ""}</span>;
};

/** How a page shows in Google's results. */
export const SearchPreview = ({ title, description, path }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3.5 min-w-0">
    <div className="text-[12px] text-gray-500 truncate">dotindot.in{path && path !== "/" ? ` › ${path.replace(/^\/|\/$/g, "").split("/").join(" › ")}` : ""}</div>
    <div className="text-[17px] leading-snug text-[#1a0dab] mt-0.5 line-clamp-1 break-all">{title || "Page title"}</div>
    <div className="text-[13px] leading-snug text-gray-600 mt-1 line-clamp-2 break-words">{description || "Meta description"}</div>
  </div>
);

export const ConfirmDelete = ({ what, title, onClose, onConfirm }) => {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this {what}?</DialogTitle>
          <DialogDescription>“{title}” comes off the website now. You can restore it from the recycle bin for 24 hours. To keep it but hide it from the site, switch off “On website” instead.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" disabled={busy} data-testid="website-delete-confirm" onClick={async () => { setBusy(true); try { await onConfirm(); } catch (e) { toast.error(apiError(e)); setBusy(false); } }}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Empty, Pill, Field, ago, fmtDateTime, Spinner } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageCircle, Sparkles, AlertTriangle, UserCheck, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Count, ORANGE_BTN } from "./websiteKit";

const Transcript = ({ id, onClose }) => {
  const [c] = useLoad(`/website/chats/${id}`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conversation</DialogTitle>
          <DialogDescription>{c ? `Started ${fmtDateTime(c.created_at)} on ${c.page || "/"}${c.tz ? ` · ${c.tz}` : ""} · ${c.mode === "ai" ? "AI replies" : "guided"}` : "Loading…"}</DialogDescription>
        </DialogHeader>
        {!c ? <Spinner className="h-40" /> : (
          <div className="space-y-3">
            {(c.lead?.name || c.lead?.email || c.lead?.phone) && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm">
                <div className="font-semibold text-emerald-900">{c.lead.name || "Visitor"}</div>
                <div className="text-emerald-800 break-words">{[c.lead.email, c.lead.phone, c.lead.company].filter(Boolean).join(" · ")}</div>
                {c.lead_id && <Link to={`/sales/leads/${c.lead_id}`} className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-emerald-900 underline">Open the lead in Sales <ArrowUpRight className="h-3 w-3" /></Link>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {(c.messages || []).map((m, i) => (
                <div key={i} className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${m.role === "user" ? "self-end bg-[#0e1b33] text-white rounded-br-md" : "self-start bg-gray-100 text-gray-800 rounded-bl-md"}`}>{m.text}</div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** The website assistant: how it answers, and every conversation it has had. */
export default function ChatbotTab({ data, canManage, onSaved }) {
  const { hasPerm } = useAuth();
  const chat = data.chat || {}, status = data.chat_status || {};
  const init = () => ({ enabled: chat.enabled !== false, name: chat.name || "Dot", greeting: chat.greeting || "", instructions: chat.instructions || "",
    provider: chat.provider || "", model: chat.model || "", daily_limit: chat.daily_limit ?? 400 });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [leadsOnly, setLeadsOnly] = useState(false);
  const [open, setOpen] = useState(null);
  const [chats, reloadChats] = useLoad(canManage ? "/website/chats" : null, { leads_only: leadsOnly, limit: 80 }, [leadsOnly]);
  useEffect(() => { setF(init()); }, [data.chat]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.put("/website-settings", { chat: { ...f, daily_limit: Number(f.daily_limit) || 0 } });
      onSaved(r.data.publish, "Assistant settings saved");
    } catch (err) { toast.error(apiError(err)); }
    setBusy(false);
  };
  const dis = !canManage || busy;
  return (
    <div className="space-y-4" data-testid="website-chatbot">
      <Card className={`shadow-sm ${status.provider ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/60"}`}>
        <CardContent className="p-4 flex flex-wrap items-start gap-3">
          {status.provider ? <Sparkles className="h-5 w-5 text-emerald-600 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />}
          <div className="min-w-0 flex-1 text-sm">
            {status.provider
              ? <><div className="font-semibold text-gray-900">{f.name || "Dot"} answers with {status.provider_label}.</div><div className="text-gray-600">It replies from what your website says, asks what visitors need, and turns them into leads in Sales → Pipeline. If the AI is unavailable it switches to a short guided conversation, so no lead is lost.</div></>
              : <><div className="font-semibold text-gray-900">No AI key connected yet — {f.name || "Dot"} runs as a guided conversation.</div><div className="text-gray-700">It still captures every lead (need → name → email or WhatsApp). Connect Claude, OpenAI or Gemini in Settings → AI and it will start answering questions too.</div></>}
          </div>
          {hasPerm("ai_settings") && <Button size="sm" variant="outline" asChild><Link to="/settings/ai">Settings → AI</Link></Button>}
          <div className="w-full flex flex-wrap gap-2 text-xs text-gray-600"><Pill tone="gray">{status.conversations || 0} conversations</Pill><Pill tone="green">{status.leads || 0} became leads</Pill></div>
        </CardContent>
      </Card>

      <form onSubmit={save}>
        <Card className="border-gray-200/80 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} disabled={dis} data-testid="chat-enabled" />
              <span><span className="font-medium text-gray-800">Show the assistant on the website</span><span className="text-gray-500"> — the orange dot in the corner of every page</span></span>
            </label>
            <div className="grid sm:grid-cols-[200px_1fr] gap-4">
              <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={30} disabled={dis} /></Field>
              <Field label={<span className="flex justify-between gap-2">First message <Count value={f.greeting} max={300} /></span>}>
                <Input value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} maxLength={300} disabled={dis}
                  placeholder={`Hi, I'm ${f.name || "Dot"} from Dotindot. Ask me anything about marketing, websites or AI automation…`} />
              </Field>
            </div>
            <Field label={<span className="flex justify-between gap-2">What the assistant should know <Count value={f.instructions} max={4000} /></span>}
              hint="Offers, how you'd like it to talk, what to recommend, what never to say. It already knows everything on the website.">
              <Textarea value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} rows={5} maxLength={4000} disabled={dis}
                placeholder={"e.g. This month the free audit includes a competitor report.\nFor e-commerce brands, mention our Shopify experience."} />
            </Field>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="AI provider">
                <Select value={f.provider || "auto"} onValueChange={(v) => setF({ ...f, provider: v === "auto" ? "" : v })} disabled={dis}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic (the default in Settings → AI)</SelectItem>
                    {Object.entries(status.providers || {}).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Model" hint="Blank uses the provider's model from Settings → AI."><Input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} maxLength={100} disabled={dis} placeholder="e.g. claude-haiku-5-5" /></Field>
              <Field label="AI replies per day" hint="After this, the guided conversation takes over until tomorrow."><Input type="number" min={0} max={5000} value={f.daily_limit} onChange={(e) => setF({ ...f, daily_limit: e.target.value })} disabled={dis} /></Field>
            </div>
            {canManage && <div className="flex justify-end"><Button type="submit" disabled={busy} className={ORANGE_BTN} data-testid="chat-save">{busy ? "Publishing…" : "Save and publish"}</Button></div>}
          </CardContent>
        </Card>
      </form>

      {canManage && (
        <Card className="border-gray-200/80 shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900">Conversations</h3>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-600"><Switch checked={leadsOnly} onCheckedChange={setLeadsOnly} /> Only those who left details</label>
                <Button size="sm" variant="ghost" onClick={() => reloadChats()}>Refresh</Button>
              </div>
            </div>
            {!chats ? <Spinner className="h-24" /> : !chats.length ? <Empty icon={MessageCircle} title="No conversations yet" sub="When visitors chat with the assistant, every conversation appears here." /> : (
              <div className="divide-y divide-gray-100 border-y border-gray-100">
                {chats.map((c) => (
                  <button key={c.id} type="button" onClick={() => setOpen(c.id)} className="w-full flex items-start gap-3 py-3 text-left hover:bg-gray-50/80 px-1 rounded-lg">
                    <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${c.lead_id ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>{c.lead_id ? <UserCheck className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-gray-900 truncate">{c.lead?.name || (c.lead_id ? "Visitor" : "Anonymous visitor")}</span>
                        {c.lead_id && <Pill tone="green">Lead</Pill>}
                        <span className="text-xs text-gray-400">{ago(c.updated_at)} · {c.visitor_messages} message{c.visitor_messages === 1 ? "" : "s"} · {c.page}</span>
                      </div>
                      <div className="text-sm text-gray-600 truncate">{[c.lead?.email, c.lead?.phone].filter(Boolean).join(" · ") || c.preview}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {open && <Transcript id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

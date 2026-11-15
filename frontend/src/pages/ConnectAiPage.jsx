// /connect-ai?request=… — where Claude, ChatGPT or another AI app sends you to approve a connection (OAuth consent).
// You choose who it works as and what it can do; approving sends you back to the app. Backend: ai_connector.py.
import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DotindotWordmark } from "@/components/DotindotLogo";
import { AccessPicker, ExtraSwitches, NeverNote } from "@/components/AiAccess";
import { Field } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ShieldAlert, TriangleAlert, Loader2 } from "lucide-react";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-[#F9FAFB] px-4 py-8 sm:py-14" data-testid="connect-ai-page">
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6 flex justify-center"><DotindotWordmark height={28} /></div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-7 shadow-sm">{children}</div>
    </div>
  </div>
);

export default function ConnectAiPage() {
  const [params] = useSearchParams();
  const rid = params.get("request") || "";
  const { user } = useAuth();
  const [req, setReq] = useState(null);
  const [problem, setProblem] = useState("");
  const [f, setF] = useState({ name: "", run_as_user_id: "", access: "read", manage_access: false, read_secrets: false });
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!rid) { setProblem("This link is missing its connection request. Start again from the AI app."); return; }
    api.get(`/oauth/requests/${encodeURIComponent(rid)}`)
      .then((r) => { setReq(r.data); setF((x) => ({ ...x, name: r.data.app_name, run_as_user_id: r.data.me.id })); })
      .catch((e) => setProblem(e.response?.status === 403
        ? "Only people with AI settings access can approve AI connections. Ask an admin to open this link, or ask them for that access."
        : apiError(e)));
  }, [rid]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const decide = async (approve) => {
    setBusy(approve ? "approve" : "deny");
    try {
      const { data } = approve
        ? await api.post(`/oauth/requests/${encodeURIComponent(rid)}/approve`, { ...f, run_as_user_id: req.is_super_admin ? f.run_as_user_id : undefined })
        : await api.post(`/oauth/requests/${encodeURIComponent(rid)}/deny`);
      setDone(approve ? "approved" : "declined");
      window.location.assign(data.redirect);
    } catch (e) { setProblem(apiError(e)); setBusy(""); }
  };

  if (problem && !req) return (
    <Shell>
      <div className="flex items-start gap-3"><ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div><h1 className="text-lg font-semibold text-gray-900">This connection can't be approved</h1><p className="text-sm text-gray-600 mt-1">{problem}</p>
          <Link to="/dashboard" className="inline-block mt-4 text-sm font-semibold text-[#F26B21]">Go to dotindot</Link></div>
      </div>
    </Shell>
  );
  if (!req) return <Shell><div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[#F26B21]" /></div></Shell>;
  if (done) return (
    <Shell>
      <div className="text-center py-4"><CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
        <h1 className="text-lg font-semibold text-gray-900 mt-3">{done === "approved" ? `Connected — taking you back to ${req.app_name}` : `Declined — taking you back to ${req.app_name}`}</h1>
        <p className="text-sm text-gray-500 mt-1">You can change or disconnect it any time in Settings → AI.</p></div>
    </Shell>
  );

  return (
    <Shell>
      <h1 className="text-xl font-semibold text-gray-900 [overflow-wrap:anywhere]" data-testid="connect-ai-title">{req.app_name} wants to work in dotindot</h1>
      <p className="text-sm text-gray-500 mt-1">After you approve, it goes back to <span className="font-medium text-gray-700">{req.return_to}</span>.</p>
      {!req.known_app && !req.local_app && (
        <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2" data-testid="connect-ai-unknown"><TriangleAlert className="h-4 w-4 shrink-0" />
          This isn't Claude or ChatGPT. Approve only if you started this connection from {req.return_to} just now.</p>
      )}
      <div className="mt-5 space-y-4">
        <Field label="Name it" hint="It shows under this name in the activity log, like “Claude (AI)”.">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} data-testid="connect-ai-name" />
        </Field>
        <Field label="Works as" hint={req.is_super_admin ? "It gets this login's role, permissions and branches." : "It gets your role, permissions and branches — never more than you have."}>
          {req.is_super_admin ? (
            <Select value={f.run_as_user_id} onValueChange={(v) => set("run_as_user_id", v)}>
              <SelectTrigger data-testid="connect-ai-runas"><SelectValue /></SelectTrigger>
              <SelectContent>{req.logins.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}{u.id === user?.id ? " (you)" : ""} · {u.role.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          ) : <Input value={`${req.me.name} (you)`} disabled />}
        </Field>
        <Field label="What it can do"><AccessPicker value={f.access} onChange={(v) => set("access", v)} testid="connect-ai-access" /></Field>
        {req.is_super_admin && <ExtraSwitches value={f} onChange={set} isSuper />}
        <NeverNote />
        {!req.enabled && <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2.5">AI connections are switched off right now. Approving switches them on.</p>}
        {problem && <p className="text-sm text-red-600" role="alert">{problem}</p>}
      </div>
      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button variant="outline" disabled={!!busy} onClick={() => decide(false)} data-testid="connect-ai-deny">Decline</Button>
        <Button className="bg-[#F26B21] hover:bg-[#E05A10] text-white" disabled={!!busy || f.name.trim().length < 2} onClick={() => decide(true)} data-testid="connect-ai-approve">
          {busy === "approve" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Approve
        </Button>
      </div>
    </Shell>
  );
}

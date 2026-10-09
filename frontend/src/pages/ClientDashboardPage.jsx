import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { saveBlobResponse } from "@/components/ExportMenu";
import ClientDashboardView, { PeriodBar, DEFAULT_PERIODS, blobErrorText } from "@/components/ClientDashboardView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowLeft, KeyRound, Plus, MoreHorizontal, Copy, ExternalLink, ShieldCheck } from "lucide-react";

const genPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(12);
  window.crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("").replace(/^(.{4})(.{4})(.{4})$/, "$1-$2-$3");
};
const portalUrl = () => `${window.location.origin}/portal/login`;

function CredentialsDialog({ creds, onClose }) {
  const text = creds ? `Your dotindot client portal\n${portalUrl()}\nEmail: ${creds.email}\nPassword: ${creds.password}` : "";
  return (
    <Dialog open={!!creds} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="portal-creds-dialog">
        <DialogHeader>
          <DialogTitle>Share these login details</DialogTitle>
          <DialogDescription>This password is shown once. Send it to the client over a private channel; they can change it after signing in.</DialogDescription>
        </DialogHeader>
        <pre className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs whitespace-pre-wrap break-all font-mono" data-testid="portal-creds-text">{text}</pre>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(text); toast.success("Copied"); }} data-testid="portal-creds-copy"><Copy className="h-4 w-4 mr-1.5" /> Copy</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PortalLogins({ clientId, clientName }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [creds, setCreds] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/clients/${clientId}/portal-users`).then((r) => setD(r.data)).catch(() => setD({ users: [], can_manage: false })), [clientId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;

  const create = async () => {
    const password = genPassword();
    setBusy(true);
    try {
      await api.post(`/clients/${clientId}/portal-users`, { name: form.name, email: form.email, password });
      setOpen(false); setForm({ name: "", email: "" }); setCreds({ email: form.email.trim().toLowerCase(), password }); load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const reset = async (u) => {
    const password = genPassword();
    try { await api.put(`/clients/${clientId}/portal-users/${u.id}`, { password }); setCreds({ email: u.email, password }); }
    catch (e) { toast.error(apiError(e)); }
  };
  const toggle = async (u) => {
    try { await api.put(`/clients/${clientId}/portal-users/${u.id}`, { is_active: !u.is_active }); toast.success(u.is_active ? "Login disabled" : "Login enabled"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const remove = async () => {
    try { await api.delete(`/clients/${clientId}/portal-users/${removing.id}`); toast.success("Login removed"); setRemoving(null); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid="portal-logins-card">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4 text-[#F26B21]" />Client portal logins</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">People at {clientName} who can sign in, see this dashboard and download the PDF. They can't see anything else.</p>
        </div>
        {d.can_manage && <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="add-portal-user"><Plus className="h-4 w-4 mr-1" /> Add login</Button>}
      </CardHeader>
      <CardContent>
        {d.users.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No client logins yet.{d.can_manage ? " Add one to give the client their own dashboard." : ""}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {d.users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5" data-testid={`portal-user-${u.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{u.name}</div>
                  <div className="text-xs text-gray-500 truncate">{u.email} · {u.last_login ? `last signed in ${new Date(u.last_login).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "never signed in"}</div>
                </div>
                <Badge variant="outline" className={u.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500"}>{u.is_active ? "Active" : "Disabled"}</Badge>
                {d.can_manage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Login actions" data-testid={`portal-user-menu-${u.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => reset(u)} data-testid={`portal-user-reset-${u.id}`}>Reset password</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggle(u)}>{u.is_active ? "Disable login" : "Enable login"}</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setRemoving(u)}>Remove</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Clients see projects, milestones, ads, social, payments and agreements — never costs, margins, notes or credentials.</div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="portal-user-dialog">
          <DialogHeader><DialogTitle>Add a client login</DialogTitle><DialogDescription>We'll generate a strong password for you to share.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya (Marketing head)" data-testid="portal-user-name" /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@client.com" data-testid="portal-user-email" /></div>
          </div>
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy || !form.email.includes("@")} onClick={create} data-testid="portal-user-save">Create login</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove {removing?.email}?</AlertDialogTitle><AlertDialogDescription>They won't be able to sign in to the client portal anymore.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={remove}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function ClientDashboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [period, setPeriod] = useState({ period: "this_month" });
  const [d, setD] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const params = period.period === "custom" ? period : { period: period.period };

  useEffect(() => {
    if (period.period === "custom" && !(period.start && period.end)) return;
    api.get(`/clients/${id}/dashboard`, { params }).then((r) => setD(r.data)).catch((e) => toast.error(apiError(e)));
  }, [id, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/clients/${id}/dashboard/report`, { params, responseType: "blob" });
      saveBlobResponse(res, `dotindot-report-${id}.pdf`);
    } catch (e) { toast.error(await blobErrorText(e)); } finally { setDownloading(false); }
  };

  if (!d) return <div className="h-64 flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;
  return (
    <div className="space-y-5 max-w-7xl" data-testid="client-dashboard-page">
      <button onClick={() => navigate(`/clients/${id}`)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#F26B21]" data-testid="back-to-client">
        <ArrowLeft className="h-4 w-4" /> Back to {d.client.name}
      </button>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#F26B21]">Client dashboard</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{d.client.name}</h1>
          <p className="text-sm text-gray-500 mt-1">The same view the client sees in their portal{d.portal_users ? ` · ${d.portal_users} active login${d.portal_users > 1 ? "s" : ""}` : ""}.</p>
        </div>
        <Button variant="outline" size="sm" asChild className="self-start lg:self-auto"><a href={portalUrl()} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1.5" /> Portal sign-in page</a></Button>
      </div>
      <PeriodBar value={period} onChange={setPeriod} periods={d.periods || DEFAULT_PERIODS} onDownload={download} downloading={downloading} />
      <ClientDashboardView data={d} />
      <PortalLogins clientId={id} clientName={d.client.name} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import portalApi, { PORTAL_TOKEN } from "@/lib/portalApi";
import { apiError } from "@/lib/api";
import { saveBlobResponse } from "@/components/ExportMenu";
import ClientDashboardView, { PeriodBar, DEFAULT_PERIODS, blobErrorText } from "@/components/ClientDashboardView";
import { DotindotLogo, DotindotMark } from "@/components/DotindotLogo";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, KeyRound, ChevronDown } from "lucide-react";

const hasToken = () => { try { return !!localStorage.getItem(PORTAL_TOKEN); } catch { return false; } };

export function PortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (hasToken()) navigate("/portal", { replace: true }); }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { data } = await portalApi.post("/portal/login", { email, password });
      localStorage.setItem(PORTAL_TOKEN, data.access_token);
      toast.success(`Welcome, ${data.user.name.split(" ")[0]}`);
      navigate("/portal", { replace: true });
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF7ED] via-white to-white p-6" data-testid="portal-login-page">
      <div className="w-full max-w-sm">
        <div className="mb-8"><DotindotLogo size={34} textClass="text-2xl" /></div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Client portal</h1>
        <p className="text-sm text-gray-500 mt-1 mb-7">See your projects, campaign results and payments, and download your monthly report.</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="pemail">Email</Label>
            <Input id="pemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required data-testid="portal-email" /></div>
          <div className="space-y-1.5"><Label htmlFor="ppass">Password</Label>
            <PasswordInput id="ppass" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required data-testid="portal-password" /></div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" data-testid="portal-login-error">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="portal-login-submit">{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="text-xs text-gray-400 mt-6">Don't have a login? Ask your dotindot account manager. <Link to="/login" className="text-gray-500 hover:text-[#F26B21]">Team sign-in</Link></p>
      </div>
    </div>
  );
}

function ChangePassword({ open, onClose }) {
  const [f, setF] = useState({ current_password: "", new_password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.new_password !== f.confirm) return toast.error("New passwords don't match");
    setBusy(true);
    try { await portalApi.post("/portal/change-password", { current_password: f.current_password, new_password: f.new_password }); toast.success("Password changed"); setF({ current_password: "", new_password: "", confirm: "" }); onClose(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" data-testid="portal-change-password">
        <DialogHeader><DialogTitle>Change password</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Current password</Label><PasswordInput value={f.current_password} onChange={(e) => setF((x) => ({ ...x, current_password: e.target.value }))} /></div>
          <div className="space-y-1"><Label>New password</Label><PasswordInput value={f.new_password} onChange={(e) => setF((x) => ({ ...x, new_password: e.target.value }))} placeholder="At least 8 characters" /></div>
          <div className="space-y-1"><Label>Confirm new password</Label><PasswordInput value={f.confirm} onChange={(e) => setF((x) => ({ ...x, confirm: e.target.value }))} /></div>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy || f.new_password.length < 8 || !f.current_password} onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PortalDashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [d, setD] = useState(null);
  const [period, setPeriod] = useState({ period: "this_month" });
  const [downloading, setDownloading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const params = period.period === "custom" ? period : { period: period.period };

  const signOut = () => { try { localStorage.removeItem(PORTAL_TOKEN); } catch { /* ignore */ } navigate("/portal/login", { replace: true }); };
  useEffect(() => {
    if (!hasToken()) { navigate("/portal/login", { replace: true }); return undefined; }
    const out = () => navigate("/portal/login", { replace: true });
    window.addEventListener("portal-signed-out", out);
    portalApi.get("/portal/me").then((r) => setMe(r.data)).catch(() => {});
    return () => window.removeEventListener("portal-signed-out", out);
  }, [navigate]);
  useEffect(() => {
    if (!hasToken() || (period.period === "custom" && !(period.start && period.end))) return;
    portalApi.get("/portal/dashboard", { params }).then((r) => setD(r.data)).catch((e) => e.response?.status !== 401 && toast.error(apiError(e)));
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setDownloading(true);
    try { const res = await portalApi.get("/portal/report", { params, responseType: "blob" }); saveBlobResponse(res, "dotindot-report.pdf"); }
    catch (e) { toast.error(await blobErrorText(e)); } finally { setDownloading(false); }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]" data-testid="portal-page">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <DotindotMark size={28} />
            <span className="font-extrabold tracking-tight text-gray-900 hidden sm:inline">dotindot.</span>
            <span className="text-gray-300 hidden sm:inline">/</span>
            <span className="text-sm font-semibold text-gray-700 truncate" data-testid="portal-client-name">{me?.client_name || d?.client?.name || ""}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 max-w-[50vw]" data-testid="portal-user-menu"><span className="truncate">{me?.name || "Account"}</span><ChevronDown className="h-4 w-4 shrink-0" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal"><div className="text-sm font-medium truncate">{me?.name}</div><div className="text-xs text-gray-500 truncate">{me?.email}</div></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPwOpen(true)}><KeyRound className="h-4 w-4 mr-2" /> Change password</DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="text-red-600 focus:text-red-600" data-testid="portal-sign-out"><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Hi {me?.name?.split(" ")[0] || "there"}</h1>
          <p className="text-sm text-gray-500 mt-1">Here's how your work with dotindot is going.</p>
        </div>
        <PeriodBar value={period} onChange={setPeriod} periods={me?.periods || DEFAULT_PERIODS} onDownload={download} downloading={downloading} />
        {d ? <ClientDashboardView data={d} /> : <div className="h-64 flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>}
        <p className="text-xs text-gray-400 text-center pt-4">Questions about anything here? Reply to your account manager — we're happy to walk you through it.</p>
      </main>
      <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

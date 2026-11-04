// v3.0 Investor portal — its own login page (/investor/login) and dashboard (/investor). Investor tokens only work on
// /api/investor-portal/*, so an investor can never reach staff or client screens.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import investorApi, { INVESTOR_TOKEN } from "@/lib/investorApi";
import { apiError } from "@/lib/api";
import { saveBlobResponse } from "@/components/ExportMenu";
import { blobErrorText } from "@/components/ClientDashboardView";
import InvestorDashboardView from "@/components/InvestorDashboardView";
import { DotindotMark, DotindotWordmark, DotindotStacked } from "@/components/DotindotLogo";
import { PasswordInput } from "@/components/PasswordInput";
import { Spinner, fmtDateTime } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, KeyRound, ChevronDown, Download, ShieldCheck, RefreshCw } from "lucide-react";

const hasToken = () => { try { return !!localStorage.getItem(INVESTOR_TOKEN); } catch { return false; } };

export function InvestorLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (hasToken()) navigate("/investor", { replace: true }); }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { data } = await investorApi.post("/investor-portal/login", { email, password });
      localStorage.setItem(INVESTOR_TOKEN, data.access_token);
      toast.success(`Welcome, ${data.user.name.split(" ")[0]}`);
      navigate("/investor", { replace: true });
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white" data-testid="investor-login-page">
      <div className="hidden lg:flex relative overflow-hidden bg-[#111827] text-white p-12 flex-col justify-between">
        <DotindotWordmark height={30} light />
        <DotindotMark size={420} light className="absolute -right-24 -bottom-24 opacity-[0.06]" />
        <div className="relative max-w-md">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#FFAD42] mb-3">Investor relations</div>
          <h2 className="text-3xl font-bold leading-tight">Your stake in dotindot, in one place.</h2>
          <p className="text-sm text-gray-300 mt-3 leading-relaxed">See what you've invested, what it's worth today, every payout you've received and the latest company updates. Download a statement any time.</p>
        </div>
        <p className="relative text-xs text-gray-500 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Private and read-only. Only you can see your position.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><DotindotStacked width={150} /></div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Investor login</h1>
          <p className="text-sm text-gray-500 mt-1 mb-7">Sign in with the email and password dotindot shared with you.</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="iemail">Email</Label>
              <Input id="iemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="username" data-testid="investor-email" /></div>
            <div className="space-y-1.5"><Label htmlFor="ipass">Password</Label>
              <PasswordInput id="ipass" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" data-testid="investor-password" /></div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" data-testid="investor-login-error">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="investor-login-submit">{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
          <p className="text-xs text-gray-400 mt-6">Forgot your password? Ask your dotindot contact to reset it. <Link to="/login" className="text-gray-500 hover:text-[#F26B21]">Team sign-in</Link> · <Link to="/portal/login" className="text-gray-500 hover:text-[#F26B21]">Client portal</Link></p>
        </div>
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
    try { await investorApi.post("/investor-portal/change-password", { current_password: f.current_password, new_password: f.new_password }); toast.success("Password changed"); setF({ current_password: "", new_password: "", confirm: "" }); onClose(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" data-testid="investor-change-password">
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

export function InvestorDashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [d, setD] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const signOut = () => { try { localStorage.removeItem(INVESTOR_TOKEN); } catch { /* ignore */ } navigate("/investor/login", { replace: true }); };
  const load = () => investorApi.get("/investor-portal/dashboard").then((r) => setD(r.data)).catch((e) => e.response?.status !== 401 && toast.error(apiError(e)));
  useEffect(() => {
    if (!hasToken()) { navigate("/investor/login", { replace: true }); return undefined; }
    const out = () => navigate("/investor/login", { replace: true });
    window.addEventListener("investor-signed-out", out);
    investorApi.get("/investor-portal/me").then((r) => setMe(r.data)).catch(() => {});
    load();
    return () => window.removeEventListener("investor-signed-out", out);
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const statement = async () => {
    setDownloading(true);
    try { const res = await investorApi.get("/investor-portal/statement", { responseType: "blob" }); saveBlobResponse(res, "dotindot-statement.pdf"); }
    catch (e) { toast.error(await blobErrorText(e)); } finally { setDownloading(false); }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]" data-testid="investor-page">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <DotindotMark size={26} className="sm:hidden" />
            <DotindotWordmark height={20} className="hidden sm:block" />
            <span className="text-gray-300 hidden sm:inline">/</span>
            <span className="text-sm font-semibold text-gray-700 truncate">Investor</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 max-w-[50vw]" data-testid="investor-user-menu"><span className="truncate">{me?.name || "Account"}</span><ChevronDown className="h-4 w-4 shrink-0" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal"><div className="text-sm font-medium truncate">{me?.name}</div><div className="text-xs text-gray-500 truncate">{me?.email}</div></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setPwOpen(true)}><KeyRound className="h-4 w-4 mr-2" /> Change password</DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="text-red-600 focus:text-red-600" data-testid="investor-sign-out"><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900" data-testid="investor-greeting">Hi {me?.name?.split(" ")[0] || "there"}</h1>
            <p className="text-sm text-gray-500 mt-1">{me?.investor_name && me.investor_name !== me.name ? `${me.investor_name} · ` : ""}Your investment in {d?.company_name || "dotindot"}{d?.generated_at ? ` · updated ${fmtDateTime(d.generated_at)}` : ""}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} data-testid="investor-refresh"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={statement} disabled={downloading} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="investor-statement-download"><Download className="h-3.5 w-3.5 mr-1.5" /> {downloading ? "Preparing…" : "Download statement"}</Button>
          </div>
        </div>
        {d ? <InvestorDashboardView d={d} /> : <Spinner />}
      </main>
      <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

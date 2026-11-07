import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useLoad, Spinner, Stat, PageHead, PillTabs, Pill, Field, Empty, Avatar, inr, inrShort, fmtDate, localISO, download } from "@/components/kit";
import { useRecordDelete, RowDeleteControls } from "@/components/RecordDelete";
import InvestorDashboardView from "@/components/InvestorDashboardView";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Wallet, TrendingUp, HandCoins, PieChart, Plus, Eye, Download, KeyRound, Megaphone, Settings2, Building, Copy } from "lucide-react";
import { appUrl } from "@/lib/base";

const num = (v) => (v === "" || v == null ? 0 : Number(v));
const genPassword = () => `Inv-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`;

function InvestorForm({ open, onClose, inv, meta, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF(inv ? { ...inv } : { name: "", type: "individual", email: "", phone: "", city: "", joined_on: localISO(), notes: "", status: "active" }); }, [open, inv]);
  const save = async () => {
    try { const { data } = inv ? await api.put(`/investors/${inv.id}`, f) : await api.post("/investors", f); toast.success("Investor saved"); onSaved(data); onClose(); } catch (e) { toast.error(apiError(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="investor-form"><DialogHeader><DialogTitle>{inv ? "Edit investor" : "Add investor"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2"><Input value={f.name || ""} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} data-testid="if-name" /></Field>
          <Field label="Type"><Select value={f.type} onValueChange={(v) => setF((x) => ({ ...x, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(meta.types).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Since"><Input type="date" value={f.joined_on || ""} onChange={(e) => setF((x) => ({ ...x, joined_on: e.target.value }))} /></Field>
          <Field label="Email"><Input value={f.email || ""} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} /></Field>
          <Field label="Phone"><Input value={f.phone || ""} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} /></Field>
          <Field label="City" className="col-span-2"><Input value={f.city || ""} onChange={(e) => setF((x) => ({ ...x, city: e.target.value }))} /></Field>
          <Field label="Notes (internal)" className="col-span-2"><Textarea rows={2} value={f.notes || ""} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!f.name?.trim()} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="if-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoneyDialog({ kind, open, onClose, inv, meta, onSaved }) {
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open) return;
    setF(kind === "investment" ? { date: localISO(), amount: "", instrument: "profit_share", stake_percent: "", interest_rate: "", tenure_months: "", terms: "", note: "" }
      : { date: localISO(), amount: "", kind: "profit_share", investment_id: "", tds: "", note: "" });
  }, [open, kind]);
  const save = async () => {
    try {
      if (kind === "investment") await api.post("/investors/investments", { investor_id: inv.id, ...f, amount: num(f.amount), stake_percent: f.stake_percent === "" ? null : num(f.stake_percent),
        interest_rate: f.interest_rate === "" ? null : num(f.interest_rate), tenure_months: f.tenure_months === "" ? null : num(f.tenure_months) });
      else await api.post("/investors/returns", { investor_id: inv.id, ...f, amount: num(f.amount), tds: num(f.tds), investment_id: f.investment_id || null });
      toast.success(kind === "investment" ? "Investment recorded" : "Payout recorded"); onSaved(); onClose();
    } catch (e) { toast.error(apiError(e)); }
  };
  const debt = f.instrument === "debt";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid={`${kind}-dialog`}><DialogHeader><DialogTitle>{kind === "investment" ? "Record money invested" : "Record a payout to the investor"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={f.date || ""} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} /></Field>
          <Field label="Amount (₹)"><Input type="number" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} data-testid={`${kind}-amount`} /></Field>
          {kind === "investment" ? (<>
            <Field label="Instrument" className="col-span-2"><Select value={f.instrument} onValueChange={(v) => setF((x) => ({ ...x, instrument: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(meta.instruments).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></Field>
            {debt ? (<>
              <Field label="Interest % a year"><Input type="number" value={f.interest_rate} onChange={(e) => setF((x) => ({ ...x, interest_rate: e.target.value }))} /></Field>
              <Field label="Tenure (months)"><Input type="number" value={f.tenure_months} onChange={(e) => setF((x) => ({ ...x, tenure_months: e.target.value }))} /></Field>
            </>) : <Field label="Stake / profit share %" className="col-span-2"><Input type="number" step="0.01" value={f.stake_percent} onChange={(e) => setF((x) => ({ ...x, stake_percent: e.target.value }))} data-testid="investment-stake" /></Field>}
            <Field label="Terms" className="col-span-2"><Textarea rows={2} value={f.terms} onChange={(e) => setF((x) => ({ ...x, terms: e.target.value }))} placeholder="e.g. 6% of net profit, paid quarterly" /></Field>
          </>) : (<>
            <Field label="Type"><Select value={f.kind} onValueChange={(v) => setF((x) => ({ ...x, kind: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(meta.return_kinds).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="TDS deducted (₹)"><Input type="number" value={f.tds} onChange={(e) => setF((x) => ({ ...x, tds: e.target.value }))} /></Field>
            <Field label="Against investment" className="col-span-2"><Select value={f.investment_id || "none"} onValueChange={(v) => setF((x) => ({ ...x, investment_id: v === "none" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">— General —</SelectItem>{(inv?.investments || []).map((x) => <SelectItem key={x.id} value={x.id}>{fmtDate(x.date)} · {x.instrument_label} · {inr(x.amount)}</SelectItem>)}</SelectContent></Select></Field>
          </>)}
          <Field label="Note" className="col-span-2"><Input value={f.note || ""} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!num(f.amount)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid={`${kind}-save`}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvestorSheet({ id, meta, canManage, onClose, onChanged, onEdit }) {
  const [inv, setInv] = useState(null);
  const [tab, setTab] = useState("money");
  const [money, setMoney] = useState(null);
  const [preview, setPreview] = useState(null);
  const [login, setLogin] = useState(null);
  const load = () => api.get(`/investors/${id}`).then((r) => setInv(r.data)).catch((e) => { toast.error(apiError(e)); onClose(); });
  useEffect(() => { setInv(null); setTab("money"); setPreview(null); if (id) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "preview" && id && !preview) api.get(`/investors/${id}/dashboard`).then((r) => setPreview(r.data)).catch((e) => toast.error(apiError(e))); }, [tab, id, preview]);
  const createLogin = async () => {
    try { await api.post(`/investors/${id}/logins`, login); toast.success("Login created — share the email and password with the investor"); setLogin(null); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const toggleLogin = async (l) => { try { await api.put(`/investors/${id}/logins/${l.id}`, { is_active: !l.is_active }); load(); } catch (e) { toast.error(apiError(e)); } };
  const portalUrl = appUrl("/investor/login");
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col" data-testid="investor-sheet">
        {!inv ? <Spinner /> : (
          <>
            <SheetHeader className="p-5 pb-3 border-b border-gray-100 text-left">
              <div className="flex items-center gap-3"><Avatar name={inv.name} size={11} /><div className="min-w-0"><SheetTitle className="text-lg truncate">{inv.name}</SheetTitle>
                <div className="text-xs text-gray-500">{inv.type_label}{inv.city ? ` · ${inv.city}` : ""} · since {fmtDate(inv.joined_on)}</div></div>
                <div className="ml-auto flex gap-2">{canManage && <Button size="sm" variant="ghost" onClick={() => onEdit(inv)}>Edit</Button>}
                  <Button size="sm" variant="outline" onClick={() => download(`/investors/${id}/statement`, "statement.pdf")} data-testid="investor-statement"><Download className="h-3.5 w-3.5 mr-1.5" /> Statement</Button></div></div>
              <div className="grid grid-cols-4 gap-3 pt-2 text-sm">
                <div><div className="text-[11px] text-gray-500">Invested</div><div className="font-bold font-mono">{inr(inv.totals.invested)}</div></div>
                <div><div className="text-[11px] text-gray-500">Value now</div><div className="font-bold font-mono">{inr(inv.totals.current_value)}</div></div>
                <div><div className="text-[11px] text-gray-500">Paid out</div><div className="font-bold font-mono">{inr(inv.totals.returns_paid + inv.totals.principal_back)}</div></div>
                <div><div className="text-[11px] text-gray-500">Return</div><div className="font-bold font-mono">{inv.totals.moic ? `${inv.totals.moic}×` : "—"}{inv.totals.xirr != null && <span className="text-xs text-gray-500 font-normal"> · {inv.totals.xirr}%/yr</span>}</div></div>
              </div>
              <PillTabs tabs={[["money", "Money"], ["logins", "Portal login", inv.logins.length], ["preview", "Preview as investor"]]} value={tab} onChange={setTab} testid="investor-tab" />
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {tab === "money" && (<>
                {canManage && <div className="flex gap-2"><Button size="sm" onClick={() => setMoney("investment")} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="add-investment"><Plus className="h-3.5 w-3.5 mr-1" /> Investment</Button>
                  <Button size="sm" variant="outline" onClick={() => setMoney("return")} data-testid="add-return"><HandCoins className="h-3.5 w-3.5 mr-1" /> Payout</Button></div>}
                <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Investments</div>
                  <table className="w-full text-sm"><tbody>{inv.investments.map((x) => (
                    <tr key={x.id} className="border-b border-gray-50"><td className="py-2">{fmtDate(x.date)}</td><td className="py-2">{x.instrument_label}<span className="block text-xs text-gray-400">{x.terms}</span></td>
                      <td className="py-2 text-right font-mono">{inr(x.amount)}</td><td className="py-2 text-right text-gray-600">{x.stake_percent ? `${x.stake_percent}%` : x.interest_rate ? `${x.interest_rate}%` : ""}</td>
                      <td className="py-2 text-right font-mono font-semibold">{inr(x.current_value)}</td></tr>))}</tbody></table></div>
                <div><div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Payouts</div>
                  {inv.returns.length === 0 ? <p className="text-xs text-gray-400">None yet.</p> : <table className="w-full text-sm"><tbody>{inv.returns.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50"><td className="py-1.5">{fmtDate(r.date)}</td><td className="py-1.5">{r.kind_label}</td><td className="py-1.5 text-xs text-gray-400">{r.note}</td><td className="py-1.5 text-right font-mono">{inr(r.amount)}</td></tr>))}</tbody></table>}</div>
                {inv.notes && <p className="text-sm text-gray-600 rounded-lg bg-gray-50 px-3 py-2">{inv.notes}</p>}
              </>)}
              {tab === "logins" && (<>
                <p className="text-sm text-gray-600">Investors sign in at <span className="font-mono text-xs">{portalUrl}</span> <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard?.writeText(portalUrl); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button> — separate from the team login. They only see their own investments and the company figures you choose to share.</p>
                {inv.logins.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2" data-testid={`inv-login-${l.id}`}>
                    <KeyRound className="h-4 w-4 text-gray-400" /><div className="flex-1 min-w-0"><div className="text-sm font-medium text-gray-800">{l.email}</div><div className="text-xs text-gray-500">{l.last_login ? `last signed in ${fmtDate(l.last_login)}` : "never signed in"}</div></div>
                    {canManage && <label className="flex items-center gap-2 text-xs"><Switch checked={l.is_active} onCheckedChange={() => toggleLogin(l)} /> {l.is_active ? "Active" : "Off"}</label>}
                  </div>))}
                {canManage && (login ? (
                  <div className="rounded-xl border border-orange-100 bg-[#FFFBF7] p-4 space-y-3">
                    <Field label="Email"><Input value={login.email} onChange={(e) => setLogin((x) => ({ ...x, email: e.target.value }))} data-testid="inv-login-email" /></Field>
                    <Field label="Password"><PasswordInput value={login.password} onChange={(e) => setLogin((x) => ({ ...x, password: e.target.value }))} /></Field>
                    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setLogin(null)}>Cancel</Button><Button onClick={createLogin} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="inv-login-create">Create login</Button></div>
                  </div>) : <Button size="sm" variant="outline" onClick={() => setLogin({ name: inv.name, email: inv.email || "", password: genPassword() })} data-testid="inv-login-new"><Plus className="h-3.5 w-3.5 mr-1" /> Give portal access</Button>)}
              </>)}
              {tab === "preview" && (!preview ? <Spinner /> : <div className="rounded-xl border border-dashed border-gray-300 p-4 bg-[#FAFAF9]"><InvestorDashboardView d={preview} /></div>)}
            </div>
          </>
        )}
        {inv && <MoneyDialog kind={money} open={!!money} onClose={() => setMoney(null)} inv={inv} meta={meta} onSaved={() => { load(); onChanged(); }} />}
      </SheetContent>
    </Sheet>
  );
}

export default function InvestorsPage() {
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState("investors");
  const [d, reload] = useLoad("/investors");
  const [vals, reloadVals] = useLoad(tab === "valuation" ? "/investors-valuations" : null);
  const [updates, reloadUpd] = useLoad(tab === "updates" ? "/investors/updates/all" : null);
  const [cfg, reloadCfg] = useLoad(tab === "settings" ? "/investors-settings" : null);
  const [form, setForm] = useState(undefined);
  const [val, setVal] = useState(null);
  const [upd, setUpd] = useState(null);
  const [share, setShare] = useState(null);
  useEffect(() => { if (cfg) setShare(cfg); }, [cfg]);
  const del = useRecordDelete({ coll: "investors", permKey: "investors.delete", rows: d?.investors || [], onDeleted: reload, labelOf: (r) => r.name });
  const delUpd = useRecordDelete({ coll: "investor_updates", permKey: "investors.delete", rows: updates || [], onDeleted: reloadUpd, labelOf: (r) => r.title });
  const openId = sp.get("open");
  const setOpen = (id) => setSp((p) => { const n = new URLSearchParams(p); if (id) n.set("open", id); else n.delete("open"); return n; });
  const can = d?.can_manage;
  const saveVal = async () => { try { await api.post("/investors/valuations", { ...val, valuation: num(val.valuation) }); toast.success("Valuation saved — investor values updated"); setVal(null); reloadVals(); reload(); } catch (e) { toast.error(apiError(e)); } };
  const saveUpd = async () => { try { await api.post("/investors/updates", { ...upd, links: upd.link ? [{ title: upd.link_title || "Link", url: upd.link }] : [] }); toast.success("Update posted to investors"); setUpd(null); reloadUpd(); } catch (e) { toast.error(apiError(e)); } };
  const saveShare = async () => { try { await api.put("/investors-settings", { share: share.share, welcome: share.welcome, contact: share.contact, company_name: share.company_name }); toast.success("Investor portal settings saved"); reloadCfg(); } catch (e) { toast.error(apiError(e)); } };
  const t = d?.totals;
  return (
    <div className="space-y-5 max-w-7xl" data-testid="investors-page">
      <PageHead kicker="Finance" title="Investors" sub="Who has invested, what it's worth now, what we've paid out — and the separate investor login."
        actions={can && <Button size="sm" onClick={() => setForm(null)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="add-investor-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add investor</Button>} />
      {!d ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat icon={Building} label="Active investors" value={t.investors} testid="inv-count" />
            <Stat icon={Wallet} label="Raised" value={inr(t.invested)} tone="blue" />
            <Stat icon={TrendingUp} label="Their value now" value={inr(t.current_value)} tone="green" />
            <Stat icon={HandCoins} label="Paid out" value={inr(t.returns_paid)} tone="amber" />
            <Stat icon={PieChart} label="Stake given" value={`${t.stake_out}%`} sub={d.valuation ? `valuation ${inrShort(d.valuation.valuation)}` : "no valuation yet"} tone="violet" className="col-span-2 lg:col-span-1" />
          </div>
          <PillTabs tabs={[["investors", "Investors"], ["valuation", "Valuation"], ["updates", "Updates"], ["settings", "Portal settings"]]} value={tab} onChange={setTab} testid="investors-tab" />
          {tab === "investors" && (
            <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
              {del.dialog}
              {d.investors.length === 0 ? <Empty icon={Building} title="No investors yet" /> : (
                <table className="w-full text-sm" data-testid="investors-table">
                  <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 bg-gray-50/60"><th className="w-14" />
                    <th className="text-left font-semibold py-2.5 px-2">Investor</th><th className="text-right font-semibold py-2.5 px-2">Invested</th><th className="text-right font-semibold py-2.5 px-2">Value now</th>
                    <th className="text-right font-semibold py-2.5 px-2">Paid out</th><th className="text-right font-semibold py-2.5 px-2">Return</th><th className="text-left font-semibold py-2.5 px-4">Portal</th></tr></thead>
                  <tbody>{d.investors.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-orange-50/40 cursor-pointer" onClick={() => setOpen(r.id)} data-testid={`investor-${r.id}`}>
                      <td className="py-2.5 pl-3"><RowDeleteControls kit={del} row={r} /></td>
                      <td className="py-2.5 px-2"><div className="font-medium text-gray-900">{r.name}</div><div className="text-xs text-gray-500">{r.type_label} · {r.investments_count} investment{r.investments_count === 1 ? "" : "s"}{r.stake_percent ? ` · ${r.stake_percent}%` : ""}</div></td>
                      <td className="py-2.5 px-2 text-right font-mono">{inr(r.invested)}</td><td className="py-2.5 px-2 text-right font-mono font-semibold">{inr(r.current_value)}</td>
                      <td className="py-2.5 px-2 text-right font-mono text-gray-600">{inr(r.returns_paid + r.principal_back)}</td>
                      <td className="py-2.5 px-2 text-right font-mono">{r.moic ? `${r.moic}×` : "—"}{r.xirr != null && <span className="block text-[11px] text-gray-400">{r.xirr}%/yr</span>}</td>
                      <td className="py-2.5 px-4">{r.logins ? <Pill tone="green">{r.logins} login</Pill> : <Pill>none</Pill>}</td></tr>))}</tbody>
                </table>
              )}
            </CardContent></Card>
          )}
          {tab === "valuation" && (
            <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-4 space-y-3">
              <p className="text-sm text-gray-600">Stake-based investments are valued at <i>stake % × latest company valuation</i>. Add a new valuation after a funding round or each year-end.</p>
              {can && (val ? (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end rounded-xl border border-orange-100 bg-[#FFFBF7] p-3">
                  <Field label="Date"><Input type="date" value={val.date} onChange={(e) => setVal((x) => ({ ...x, date: e.target.value }))} /></Field>
                  <Field label="Valuation (₹)"><Input type="number" value={val.valuation} onChange={(e) => setVal((x) => ({ ...x, valuation: e.target.value }))} data-testid="val-amount" /></Field>
                  <Field label="Method"><Input value={val.method} onChange={(e) => setVal((x) => ({ ...x, method: e.target.value }))} placeholder="e.g. 4× trailing revenue" /></Field>
                  <div className="flex gap-2"><Button variant="ghost" onClick={() => setVal(null)}>Cancel</Button><Button onClick={saveVal} disabled={!num(val.valuation)} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="val-save">Save</Button></div>
                </div>) : <Button size="sm" variant="outline" onClick={() => setVal({ date: localISO(), valuation: "", method: "", note: "" })} data-testid="add-valuation"><Plus className="h-3.5 w-3.5 mr-1" /> New valuation</Button>)}
              {!vals ? <Spinner className="h-24" /> : <table className="w-full text-sm"><tbody>{vals.map((v) => (
                <tr key={v.id} className="border-b border-gray-50"><td className="py-2">{fmtDate(v.date)}</td><td className="py-2 font-mono font-semibold">{inr(v.valuation)}</td><td className="py-2 text-gray-500">{v.method}</td></tr>))}</tbody></table>}
            </CardContent></Card>
          )}
          {tab === "updates" && (
            <div className="space-y-3">
              {can && (upd ? (
                <Card className="border-orange-100 bg-[#FFFBF7]"><CardContent className="p-4 space-y-3" data-testid="update-form">
                  <Field label="Title"><Input value={upd.title} onChange={(e) => setUpd((x) => ({ ...x, title: e.target.value }))} data-testid="upd-title" /></Field>
                  <Field label="Update"><Textarea rows={5} value={upd.body} onChange={(e) => setUpd((x) => ({ ...x, body: e.target.value }))} data-testid="upd-body" /></Field>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Who sees it"><Select value={upd.audience} onValueChange={(v) => setUpd((x) => ({ ...x, audience: v }))}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All investors</SelectItem><SelectItem value="selected">Selected investors</SelectItem></SelectContent></Select></Field>
                    <Field label="Link title"><Input value={upd.link_title} onChange={(e) => setUpd((x) => ({ ...x, link_title: e.target.value }))} placeholder="e.g. Q2 report" /></Field>
                    <Field label="Link"><Input value={upd.link} onChange={(e) => setUpd((x) => ({ ...x, link: e.target.value }))} placeholder="https://drive.google.com/…" /></Field>
                  </div>
                  {upd.audience === "selected" && <div className="flex flex-wrap gap-1.5">{d.investors.map((i) => (
                    <button key={i.id} type="button" onClick={() => setUpd((x) => ({ ...x, investor_ids: x.investor_ids.includes(i.id) ? x.investor_ids.filter((y) => y !== i.id) : [...x.investor_ids, i.id] }))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${upd.investor_ids.includes(i.id) ? "bg-[#FFF7ED] border-orange-300 text-[#C2410C] font-semibold" : "border-gray-200 text-gray-600"}`}>{i.name}</button>))}</div>}
                  <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setUpd(null)}>Cancel</Button><Button onClick={saveUpd} disabled={!upd.title.trim() || !upd.body.trim()} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="upd-post">Post update</Button></div>
                </CardContent></Card>
              ) : <Button size="sm" onClick={() => setUpd({ title: "", body: "", audience: "all", investor_ids: [], link: "", link_title: "" })} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="new-update"><Megaphone className="h-3.5 w-3.5 mr-1.5" /> Post an update</Button>)}
              {delUpd.dialog}
              {!updates ? <Spinner className="h-24" /> : updates.map((u) => (
                <Card key={u.id} className="border-gray-200/80 shadow-sm"><CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-gray-900">{u.title}</div><div className="text-xs text-gray-400">{fmtDate(u.date)} · {u.audience === "all" ? "all investors" : u.investor_names.join(", ")}</div></div><RowDeleteControls kit={delUpd} row={u} /></div>
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{u.body}</p></CardContent></Card>))}
            </div>
          )}
          {tab === "settings" && (!share ? <Spinner /> : (
            <Card className="border-gray-200/80 shadow-sm" data-testid="investor-settings"><CardContent className="p-5 space-y-4">
              <div><div className="text-sm font-semibold text-gray-800 mb-2">Company figures investors can see</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{Object.entries(share.share_labels).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm"><span>{label}</span>
                    <Switch checked={!!share.share[k]} disabled={!can} onCheckedChange={(v) => setShare((x) => ({ ...x, share: { ...x.share, [k]: v } }))} data-testid={`share-${k}`} /></label>))}</div></div>
              <Field label="Welcome message"><Textarea rows={2} value={share.welcome} disabled={!can} onChange={(e) => setShare((x) => ({ ...x, welcome: e.target.value }))} /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Company name"><Input value={share.company_name} disabled={!can} onChange={(e) => setShare((x) => ({ ...x, company_name: e.target.value }))} /></Field>
                <Field label="Contact line"><Input value={share.contact} disabled={!can} onChange={(e) => setShare((x) => ({ ...x, contact: e.target.value }))} placeholder="Name · email · phone" /></Field>
              </div>
              <p className="text-xs text-gray-500">Investor login page: <span className="font-mono">{appUrl("/investor/login")}</span></p>
              {can && <div className="flex justify-end"><Button onClick={saveShare} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="share-save"><Settings2 className="h-3.5 w-3.5 mr-1.5" /> Save</Button></div>}
            </CardContent></Card>
          ))}
          <InvestorForm open={form !== undefined} inv={form} meta={d.meta} onClose={() => setForm(undefined)} onSaved={(x) => { reload(); if (!form) setOpen(x.id); }} />
          <InvestorSheet id={openId} meta={d.meta} canManage={can} onClose={() => setOpen(null)} onChanged={reload} onEdit={(x) => setForm(x)} />
        </>
      )}
    </div>
  );
}

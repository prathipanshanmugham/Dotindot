// v3.1 Digital Growth — follower growth, views and engagement for every client and for dotindot's own accounts.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLoad, Spinner, PageHead, PillTabs, Pill, Field, Empty, fmtDate, ago, download } from "@/components/kit";
import { useRecordDelete } from "@/components/RecordDelete";
import { AudienceChart, ViewsChart, ChangePill, Sparkline, PlatformIcon, colorMap, fmtNum, fmtCompact, signed } from "@/components/GrowthCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Rocket, Users, TrendingUp, Eye, Heart, LayoutGrid, Plus, Upload, ClipboardPen, Download, FileText, FileSpreadsheet, Settings2, RefreshCw,
  Pencil, Trash2, ExternalLink, AlertTriangle, CheckCircle2, Table2, Target, ChevronDown, Trophy,
} from "lucide-react";

const SOURCE = { manual: "entered by hand", import: "imported", sync: "synced", ai: "added by AI" };

const shift = (ym, k) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${String(Math.floor(t / 12)).padStart(4, "0")}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const mLabel = (ym, long = false) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: long ? "long" : "short", year: "numeric" }) : "—");
const monthOptions = (thisMonth, n = 18) => [thisMonth, ...Array.from({ length: n }, (_, i) => shift(thisMonth, -(i + 1)))];
const cleanNum = (v) => String(v ?? "").replace(/,/g, "").trim();

const TONES = { orange: "bg-[#FFF7ED] text-[#F26B21]", green: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-600", blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600", gray: "bg-gray-100 text-gray-600", violet: "bg-violet-50 text-violet-600" };
/** KPI tile: label, value and a full-width note on its own line (nothing truncated). */
const Kpi = ({ icon: Icon, label, value, sub, tone = "orange", testid, className = "" }) => (
  <Card className={`border-gray-200/80 shadow-sm ${className}`} data-testid={testid}>
    <CardContent className="p-4">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-gray-500">{label}</span>
        {Icon && <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${TONES[tone]}`}><Icon className="h-3.5 w-3.5" /></span>}</div>
      <div className="mt-1 text-xl sm:text-2xl font-bold text-gray-900 font-mono tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{sub}</div>}
    </CardContent>
  </Card>
);

// ------------------------------------------------------------------ page
export default function GrowthPage() {
  const { hasPerm, user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [meta, reloadMeta] = useLoad("/growth/meta");
  const owner = sp.get("owner") || "internal";
  const [months, setMonths] = useState(6);
  const [end, setEnd] = useState("");
  const isAll = owner === "all";
  const params = { months, ...(end ? { end } : {}) };
  const [ovRaw, reloadOv, , ovErr] = useLoad(!meta || isAll ? null : "/growth/overview", { owner, ...params });
  const [boardRaw, reloadBoard, , boardErr] = useLoad(meta ? "/growth/leaderboard" : null, params);
  // only show data that belongs to what's picked (the previous client's numbers never linger under a new name)
  const endWanted = end || meta?.default_end;
  const ov = ovRaw && ovRaw.owner === owner && ovRaw.months.length === months && ovRaw.months[ovRaw.months.length - 1] === endWanted ? ovRaw : null;
  const board = boardRaw && boardRaw.months.length === months && boardRaw.months[boardRaw.months.length - 1] === endWanted ? boardRaw : null;
  const [dlg, setDlg] = useState(null);          // {kind: account|entry|import|settings, ...}
  const [sheet, setSheet] = useState(null);      // account for the numbers sheet
  const [syncing, setSyncing] = useState("");
  const reload = () => { reloadOv(); reloadBoard(); };
  const kit = useRecordDelete({ coll: "growth_accounts", permKey: "growth.delete", rows: ov?.accounts || [], onDeleted: reload, labelOf: (a) => a.label });

  const setOwner = (o) => setSp((p) => { const n = new URLSearchParams(p); n.set("owner", o); n.delete("enter"); return n; });
  const ownerName = (o) => (o === "internal" ? "dotindot" : (meta?.clients || []).find((c) => c.id === o)?.name || "Client");
  const tracked = useMemo(() => Object.fromEntries((board?.rows || []).map((r) => [r.owner, r])), [board]);

  // bell link: /growth?enter=1 → open the entry grid on the first owner still missing last month's numbers
  useEffect(() => {
    if (sp.get("enter") !== "1" || !board || !meta?.can_manage) return;
    const first = board.rows.find((r) => r.missing_last_month > 0);
    setDlg({ kind: "entry", owner: first?.owner || (owner === "all" ? "internal" : owner), month: shift(meta.this_month, -1) });
    setSp((p) => { const n = new URLSearchParams(p); n.delete("enter"); return n; }, { replace: true });
  }, [sp, board, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meta) return <Spinner />;
  const canManage = meta.can_manage;
  const ends = monthOptions(meta.this_month, 18);
  const endValue = end || meta.default_end;

  const syncNow = async (a) => {
    setSyncing(a.id);
    try {
      const { data } = await api.post(`/growth/accounts/${a.id}/sync`);
      data.ok ? toast.success(`${a.label}: ${data.message}`) : toast.error(`${a.label}: ${data.message}`);
      reload();
    } catch (e) { toast.error(apiError(e)); } finally { setSyncing(""); }
  };
  const reportParams = { owner, months, ...(end ? { end } : {}) };
  const allRange = () => { const s = shift(endValue, -(months - 1)); const [y, m] = endValue.split("-").map(Number); return { date_from: `${s}-01`, date_to: `${endValue}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` }; };

  return (
    <div className="space-y-5 max-w-7xl" data-testid="growth-page">
      <PageHead kicker="Growth" title="Digital Growth"
        sub="Followers, views and engagement across every platform — for each client and for dotindot."
        actions={<>
          {canManage && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: "entry", owner: isAll ? "internal" : owner, month: shift(meta.this_month, -1) })} data-testid="growth-enter-btn"><ClipboardPen className="h-3.5 w-3.5 mr-1.5" /> Enter numbers</Button>}
          {canManage && <Button size="sm" variant="outline" onClick={() => setDlg({ kind: "import", owner: isAll ? "internal" : owner })} data-testid="growth-import-btn"><Upload className="h-3.5 w-3.5 mr-1.5" /> Import</Button>}
          {(!isAll || (hasPerm("reports") && ["super_admin", "admin", "sales", "pm"].includes(user?.role))) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" data-testid="growth-report-btn"><Download className="h-3.5 w-3.5 mr-1.5" /> Report <ChevronDown className="h-3 w-3 ml-1 text-gray-400" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {isAll ? <>
                  <DropdownMenuItem className="cursor-pointer" data-testid="growth-report-pdf" onClick={() => download("/reports/template/digital-growth/export", "dotindot-digital-growth.pdf", { format: "pdf", ...allRange() })}><FileText className="h-3.5 w-3.5 mr-2 text-[#F26B21]" /> All clients · PDF</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" data-testid="growth-report-xlsx" onClick={() => download("/reports/template/digital-growth/export", "dotindot-digital-growth.xlsx", { format: "xlsx", ...allRange() })}><FileSpreadsheet className="h-3.5 w-3.5 mr-2 text-emerald-600" /> All clients · Excel</DropdownMenuItem>
                </> : <>
                  <DropdownMenuItem className="cursor-pointer" data-testid="growth-report-pdf" onClick={() => download("/growth/report", "growth-report.pdf", { ...reportParams, format: "pdf" })}><FileText className="h-3.5 w-3.5 mr-2 text-[#F26B21]" /> PDF report</DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" data-testid="growth-report-xlsx" onClick={() => download("/growth/report", "growth-report.xlsx", { ...reportParams, format: "xlsx" })}><FileSpreadsheet className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Excel (all numbers)</DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canManage && <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={() => setDlg({ kind: "account", owner: isAll ? "internal" : owner })} data-testid="growth-add-account"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add account</Button>}
          {canManage && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDlg({ kind: "settings" })} title="Connections & sync settings" data-testid="growth-settings-btn"><Settings2 className="h-4 w-4" /></Button>}
        </>} />

      {/* scope bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3" data-testid="growth-scope">
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="sm:w-72 bg-white" data-testid="growth-owner-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="internal">dotindot — our own accounts</SelectItem>
            <SelectItem value="all">All clients — side by side</SelectItem>
            <SelectSeparator />
            {meta.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{tracked[c.id] ? ` · ${tracked[c.id].accounts} account${tracked[c.id].accounts > 1 ? "s" : ""}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 flex-wrap">
          <PillTabs tabs={[[3, "3 months"], [6, "6 months"], [12, "12 months"]]} value={months} onChange={setMonths} testid="growth-months" />
          <Select value={endValue} onValueChange={(v) => setEnd(v === meta.default_end ? "" : v)}>
            <SelectTrigger className="w-44 h-8 text-xs bg-white" data-testid="growth-end-select"><span className="text-gray-400 mr-1">to</span><SelectValue /></SelectTrigger>
            <SelectContent>{ends.map((m) => <SelectItem key={m} value={m}>{mLabel(m, true)}{m === meta.this_month ? " (so far)" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {isAll ? (boardErr && !board ? <LoadError msg={boardErr} /> : <Leaderboard board={board} onOpen={setOwner} />)
        : !ov ? (ovErr ? <LoadError msg={ovErr} onBack={() => setOwner("internal")} /> : <Spinner />) : (
        <OwnerView ov={ov} meta={meta} canManage={canManage} kit={kit} syncing={syncing} onSync={syncNow}
          onAdd={() => setDlg({ kind: "account", owner })} onEdit={(a) => setDlg({ kind: "account", owner, account: a })}
          onNumbers={setSheet} onEnter={() => setDlg({ kind: "entry", owner, month: shift(meta.this_month, -1) })} />
      )}
      {kit.dialog}

      {dlg?.kind === "account" && <AccountDialog meta={meta} owner={dlg.owner} account={dlg.account} ownerName={ownerName} onClose={() => setDlg(null)}
        onSaved={(o) => { setDlg(null); if (o && o !== owner) setOwner(o); reload(); }} />}
      {dlg?.kind === "entry" && <EntryDialog meta={meta} initialOwner={dlg.owner} initialMonth={dlg.month} board={board} ownerName={ownerName} onClose={() => setDlg(null)}
        onSaved={() => { setDlg(null); reload(); }} />}
      {dlg?.kind === "import" && <ImportDialog meta={meta} initialOwner={dlg.owner} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); reload(); }} />}
      {dlg?.kind === "settings" && <SettingsDialog meta={meta} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); reloadMeta(); }} />}
      {sheet && <NumbersSheet account={sheet} meta={meta} canManage={canManage} onClose={() => setSheet(null)}
        onEdit={(m) => { setSheet(null); setDlg({ kind: "entry", owner, month: m }); }} />}
    </div>
  );
}

const LoadError = ({ msg, onBack }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid="growth-load-error"><CardContent className="p-0">
    <Empty icon={AlertTriangle} title="Couldn't open this view" sub={msg}
      action={onBack ? <Button size="sm" variant="outline" onClick={onBack}>Show dotindot's accounts</Button> : null} />
  </CardContent></Card>
);

// ------------------------------------------------------------------ one owner
function OwnerView({ ov, meta, canManage, kit, syncing, onSync, onAdd, onEdit, onNumbers, onEnter }) {
  const t = ov.totals;
  const colors = colorMap(ov.accounts);
  if (!ov.accounts.length) {
    return (
      <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0">
        <Empty icon={Rocket} title={`No accounts tracked for ${ov.owner_name} yet`}
          sub="Add their Instagram, Facebook, YouTube, LinkedIn, Google Business Profile, website and more — then enter or sync the monthly numbers."
          action={canManage ? <Button size="sm" className="bg-[#F26B21] hover:bg-[#E05A10] text-white" onClick={onAdd} data-testid="growth-empty-add"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add the first account</Button> : null} />
      </CardContent></Card>
    );
  }
  const last = shift(meta.this_month, -1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="growth-kpis">
        <Kpi icon={Users} label="Total audience" value={fmtCompact(t.audience_now)} sub="followers + subscribers, month end" testid="growth-kpi-audience" />
        <Kpi icon={TrendingUp} tone={t.net_growth < 0 ? "red" : "green"} label="New followers" value={signed(t.net_growth, true)} sub={t.growth_pct != null ? `${t.growth_pct > 0 ? "+" : ""}${t.growth_pct}% over the period` : "over the period"} testid="growth-kpi-net" />
        <Kpi icon={Eye} tone="blue" label="Views" value={fmtCompact(t.views)} sub={ov.period} testid="growth-kpi-views" />
        <Kpi icon={Heart} tone="violet" label="Engagement rate" value={t.engagement_rate != null ? `${t.engagement_rate}%` : "—"} sub="interactions ÷ reach" testid="growth-kpi-er" />
        <Kpi icon={LayoutGrid} tone={t.missing_last_month ? "amber" : "gray"} label="Accounts" value={t.accounts} className="col-span-2 lg:col-span-1"
          sub={t.missing_last_month ? `${t.missing_last_month} missing ${mLabel(last)}` : `all up to date for ${mLabel(last)}`} testid="growth-kpi-accounts" />
      </div>
      {t.best && <p className="text-sm text-gray-600 -mt-1" data-testid="growth-best"><Trophy className="h-4 w-4 text-amber-500 inline -mt-0.5 mr-1.5" />Fastest growing: <span className="font-semibold text-gray-900">{t.best.label}</span> ({t.best.change_pct > 0 ? "+" : ""}{t.best.change_pct}% over {ov.period})</p>}
      {canManage && t.missing_last_month > 0 && (
        <button type="button" onClick={onEnter} className="w-full text-left rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2" data-testid="growth-missing-banner">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {t.missing_last_month} account{t.missing_last_month > 1 ? "s" : ""} still need {mLabel(last, true)} numbers. <span className="font-semibold underline underline-offset-2">Enter them now</span>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="border-gray-200/80 shadow-sm lg:col-span-3 min-w-0"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Audience over time</CardTitle></CardHeader>
          <CardContent><AudienceChart data={ov} /></CardContent></Card>
        <Card className="border-gray-200/80 shadow-sm lg:col-span-2 min-w-0"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Views per month</CardTitle></CardHeader>
          <CardContent><ViewsChart data={ov} /></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="growth-accounts">
        {ov.accounts.map((a) => <AccountCard key={a.id} a={a} color={colors[a.id]} canManage={canManage} kit={kit} syncing={syncing === a.id}
          onSync={() => onSync(a)} onEdit={() => onEdit(a)} onNumbers={() => onNumbers(a)} lastMonth={last} />)}
      </div>
    </div>
  );
}

function AccountCard({ a, color, canManage, kit, syncing, onSync, onEdit, onNumbers, lastMonth }) {
  const headline = a.audience_now != null ? a.audience_now : a.views;
  const headLabel = a.audience_now != null ? a.audience_label : a.views_label;
  const sync = a.sync || {};
  return (
    <Card className="border-gray-200/80 shadow-sm flex flex-col" data-testid={`growth-account-${a.platform}`}>
      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-white" style={{ background: color }}><PlatformIcon platform={a.platform} /></span>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{a.platform_label}</div>
              <div className="text-xs text-gray-500 truncate">{a.handle ? (["website", "google_business"].includes(a.platform) ? a.handle : `@${a.handle.replace(/^@/, "")}`) : "—"}
                {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex ml-1 align-middle text-gray-400 hover:text-[#F26B21]" title="Open profile"><ExternalLink className="h-3 w-3" /></a>}</div>
            </div>
          </div>
          {a.status === "paused" ? <Pill>paused</Pill> : a.missing_last_month ? <Pill tone="amber" data-testid="growth-missing-pill"><AlertTriangle className="h-3 w-3" />{mLabel(lastMonth)} missing</Pill> : null}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl font-bold font-mono text-gray-900 leading-tight" data-testid="growth-account-headline">{fmtNum(headline)}</div>
            <div className="text-xs text-gray-500">{(headLabel || "").toLowerCase()}{a.audience_now == null && a.views != null ? " in the period" : ""}</div>
          </div>
          <Sparkline points={a.series.map((s) => (a.audience_now != null ? s.audience : s.views))} color={color} testid={`growth-spark-${a.platform}`} />
        </div>
        {a.audience_now != null && <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500"><ChangePill value={a.change} pct={a.change_pct} /> <span>over the period</span>
          {a.last_month_change != null && <span className="text-gray-400">· last month {signed(a.last_month_change)}</span>}</div>}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {a.audience_now != null && a.views_label && <div className="rounded-lg bg-gray-50 px-2.5 py-1.5"><div className="text-gray-500">{a.views_label}</div><div className="font-mono font-semibold text-gray-900">{fmtCompact(a.views)}</div></div>}
          {a.engagement_rate != null && <div className="rounded-lg bg-gray-50 px-2.5 py-1.5"><div className="text-gray-500">Engagement</div><div className="font-mono font-semibold text-gray-900">{a.engagement_rate}%</div></div>}
          {a.platform === "google_business" && a.series.at(-1)?.values?.rating != null && <div className="rounded-lg bg-gray-50 px-2.5 py-1.5"><div className="text-gray-500">Rating</div><div className="font-mono font-semibold text-gray-900">{a.series.filter((s) => s.values?.rating != null).at(-1)?.values.rating} ★</div></div>}
          {a.platform === "website" && <div className="rounded-lg bg-gray-50 px-2.5 py-1.5"><div className="text-gray-500">Users</div><div className="font-mono font-semibold text-gray-900">{fmtCompact(a.series.reduce((s, x) => s + (x.values?.users || 0), 0))}</div></div>}
        </div>
        {a.target ? (
          <div className="space-y-1" data-testid="growth-target">
            <div className="flex justify-between text-xs"><span className="text-gray-500 inline-flex items-center gap-1"><Target className="h-3 w-3" /> Goal {fmtCompact(a.target)}{a.target_date ? ` by ${fmtDate(a.target_date, { month: "short", year: "numeric" })}` : ""}</span><span className="font-mono font-semibold text-gray-800">{a.target_pct ?? 0}%</span></div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, a.target_pct || 0)}%`, background: color }} /></div>
          </div>
        ) : null}
        <div className="mt-auto pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="text-[11px] text-gray-400 min-w-0 truncate" data-testid="growth-account-source">
            {sync.method ? (sync.last ? (sync.last.ok ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Synced {ago(sync.last.at)}</span>
              : <span className="inline-flex items-center gap-1 text-red-600" title={sync.last.message}><AlertTriangle className="h-3 w-3" /> Sync failed — {sync.last.message}</span>) : "Auto-sync on")
              : a.last_month ? `${mLabel(a.last_month)} · ${SOURCE[a.last_source] || "entered"}` : "No numbers yet"}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {canManage && sync.method && <Button size="icon" variant="ghost" className="h-7 w-7" disabled={syncing} onClick={onSync} title="Sync now" data-testid="growth-sync-btn"><RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /></Button>}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onNumbers} title="Monthly numbers" data-testid="growth-numbers-btn"><Table2 className="h-3.5 w-3.5" /></Button>
            {canManage && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} title="Edit account" data-testid="growth-edit-btn"><Pencil className="h-3.5 w-3.5" /></Button>}
            {kit.canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={() => kit.requestDelete(a)} title="Delete account and its numbers" data-testid="growth-delete-btn"><Trash2 className="h-3.5 w-3.5" /></Button>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ all clients
function Leaderboard({ board, onOpen }) {
  if (!board) return <Spinner />;
  const rows = board.rows;
  const clients = rows.filter((r) => !r.internal);
  if (!rows.length) return <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0"><Empty icon={Rocket} title="No accounts tracked yet" sub="Pick a client above and add their social accounts." /></CardContent></Card>;
  const sum = (k) => clients.reduce((s, r) => s + (r[k] || 0), 0);
  return (
    <div className="space-y-4" data-testid="growth-leaderboard">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Clients tracked" value={clients.length} sub={`${sum("accounts")} accounts`} />
        <Kpi icon={Users} tone="blue" label="Combined client audience" value={fmtCompact(sum("audience_now"))} />
        <Kpi icon={TrendingUp} tone="green" label="New followers for clients" value={signed(sum("net_growth"), true)} sub={board.period} />
        <Kpi icon={Eye} tone="violet" label="Client views" value={fmtCompact(sum("views"))} />
      </div>
      <Card className="border-gray-200/80 shadow-sm"><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]" data-testid="growth-board-table">
          <thead><tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50/60">
            <th className="text-left font-semibold py-2.5 px-4">Client</th><th className="text-right font-semibold py-2.5 px-3">Audience</th>
            <th className="text-right font-semibold py-2.5 px-3">New followers</th><th className="text-right font-semibold py-2.5 px-3">Views</th>
            <th className="text-right font-semibold py-2.5 px-3">Engagement</th><th className="text-center font-semibold py-2.5 px-3">Trend</th><th className="py-2.5 px-3" /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.owner} onClick={() => onOpen(r.owner)} className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-orange-50/40 ${r.internal ? "bg-[#FFF7ED]/50" : ""}`} data-testid={`growth-board-row-${r.internal ? "internal" : r.owner}`}>
              <td className="py-2.5 px-4"><div className="font-medium text-gray-900">{r.name}</div><div className="text-[11px] text-gray-400 truncate max-w-[260px]">{r.platforms.join(" · ")}</div></td>
              <td className="py-2.5 px-3 text-right font-mono">{fmtNum(r.audience_now)}</td>
              <td className="py-2.5 px-3 text-right"><ChangePill value={r.net_growth} pct={r.growth_pct} /></td>
              <td className="py-2.5 px-3 text-right font-mono">{fmtCompact(r.views)}</td>
              <td className="py-2.5 px-3 text-right font-mono">{r.engagement_rate != null ? `${r.engagement_rate}%` : "—"}</td>
              <td className="py-2.5 px-3"><div className="flex justify-center"><Sparkline points={r.spark} width={84} height={24} /></div></td>
              <td className="py-2.5 px-3 text-right">{r.missing_last_month ? <Pill tone="amber">{r.missing_last_month} missing</Pill> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </CardContent></Card>
      <p className="text-xs text-gray-400">Audience = followers and subscribers across social accounts at the end of each month. Growth compares the end of the period with the month before it starts.</p>
    </div>
  );
}

// ------------------------------------------------------------------ dialogs
function OwnerSelect({ meta, value, onChange, disabled, testid = "growth-dlg-owner" }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger data-testid={testid}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="internal">dotindot (our accounts)</SelectItem>
        <SelectSeparator />
        {meta.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AccountDialog({ meta, owner: initialOwner, account, onClose, onSaved }) {
  const editing = !!account;
  const [f, setF] = useState(() => ({
    owner: account?.owner || initialOwner || "internal", platform: account?.platform || "instagram", handle: account?.handle || "", url: account?.url || "",
    target: account?.target ?? "", target_date: account?.target_date || "", status: account?.status || "active",
    syncOn: !!account?.sync?.method, external_id: account?.sync?.external_id || "", host: account?.sync?.host || "graph.instagram.com", token: "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const plat = meta.platforms.find((p) => p.key === f.platform);
  const canSync = !!plat?.sync;
  const save = async () => {
    setBusy(true);
    try {
      let sync;
      if (canSync && f.syncOn) {
        sync = { method: plat.sync, external_id: f.external_id || (plat.sync === "youtube" ? f.handle : plat.sync === "instagram" ? "me" : ""), host: plat.sync === "instagram" ? f.host : "graph.facebook.com",
          ...(f.token.trim() ? { access_token: f.token.trim() } : {}) };
      } else if (editing && account.sync?.method) sync = { method: null };
      const body = { handle: f.handle, url: f.url, target: f.target === "" ? null : Number(cleanNum(f.target)), target_date: f.target_date || null, ...(sync ? { sync } : {}) };
      const { data } = editing ? await api.put(`/growth/accounts/${account.id}`, { ...body, status: f.status })
        : await api.post("/growth/accounts", { ...body, owner: f.owner, platform: f.platform });
      toast.success(editing ? "Account updated" : `${plat.label} account added`);
      if (sync?.method) {
        const r = await api.post(`/growth/accounts/${data.id}/sync`).then((x) => x.data).catch(() => null);
        if (r) r.ok ? toast.success(r.message) : toast.error(`Saved, but the first sync failed: ${r.message}`);
      }
      onSaved(f.owner);
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="growth-account-dialog">
        <DialogHeader><DialogTitle>{editing ? `Edit ${account.platform_label} account` : "Add an account to track"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Whose account"><OwnerSelect meta={meta} value={f.owner} onChange={(v) => set("owner", v)} disabled={editing} /></Field>
          <Field label="Platform">
            <Select value={f.platform} onValueChange={(v) => set("platform", v)} disabled={editing}>
              <SelectTrigger data-testid="growth-dlg-platform"><SelectValue /></SelectTrigger>
              <SelectContent>{meta.platforms.map((p) => <SelectItem key={p.key} value={p.key}><span className="inline-flex items-center gap-2"><PlatformIcon platform={p.key} className="h-3.5 w-3.5 text-gray-500" />{p.label}</span></SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label={f.platform === "website" ? "Domain" : f.platform === "google_business" ? "Listing name" : "Handle"}>
            <Input value={f.handle} onChange={(e) => set("handle", e.target.value)} placeholder={f.platform === "website" ? "example.in" : f.platform === "youtube" ? "@channel" : "username"} data-testid="growth-dlg-handle" />
          </Field>
          <Field label="Profile link"><Input value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" data-testid="growth-dlg-url" /></Field>
          {plat?.audience && <>
            <Field label={`Goal (${plat.audience})`} hint="Optional — shows progress on the card"><Input inputMode="numeric" value={f.target} onChange={(e) => set("target", e.target.value)} placeholder="e.g. 50000" data-testid="growth-dlg-target" /></Field>
            <Field label="Goal date"><Input type="date" value={f.target_date} onChange={(e) => set("target_date", e.target.value)} /></Field>
          </>}
          {editing && <Field label="Status">
            <Select value={f.status} onValueChange={(v) => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused (no reminders or sync)</SelectItem></SelectContent></Select>
          </Field>}
        </div>
        {canSync && (
          <div className="rounded-xl border border-gray-200 p-3 space-y-3" data-testid="growth-dlg-sync">
            <label className="flex items-center justify-between gap-3">
              <span><span className="text-sm font-semibold text-gray-900">Update automatically</span><span className="block text-xs text-gray-500">{meta.sync_labels[plat.sync]} — synced every night, or tap sync on the card.</span></span>
              <Switch checked={f.syncOn} onCheckedChange={(v) => set("syncOn", v)} data-testid="growth-dlg-sync-toggle" />
            </label>
            {f.syncOn && plat.sync === "youtube" && <>
              <Field label="Channel @handle or channel id" hint="Public statistics: subscribers, videos and views. Monthly views start counting from the second month synced.">
                <Input value={f.external_id} onChange={(e) => set("external_id", e.target.value)} placeholder={f.handle || "@channel or UC…"} /></Field>
              {!meta.settings.youtube_connected && <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Add a YouTube Data API key in settings (gear icon) first.</p>}
            </>}
            {f.syncOn && plat.sync === "instagram" && <>
              <Field label="Connected through">
                <Select value={f.host} onValueChange={(v) => set("host", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="graph.instagram.com">Instagram Login (professional account)</SelectItem><SelectItem value="graph.facebook.com">Facebook Login (linked Facebook Page)</SelectItem></SelectContent></Select>
              </Field>
              <Field label="Instagram account id" hint={f.host === "graph.instagram.com" ? "Leave as “me” for an Instagram Login token" : "The Instagram business account id linked to the Page"}>
                <Input value={f.external_id} onChange={(e) => set("external_id", e.target.value)} placeholder="me" /></Field>
              <Field label="Access token" hint={account?.sync?.token_hint ? `Saved token ${account.sync.token_hint} — paste a new one only to replace it.` : "Needs insights permission. Stored encrypted; never shown again."}>
                <Input type="password" autoComplete="off" value={f.token} onChange={(e) => set("token", e.target.value)} placeholder={account?.sync?.token_hint ? "••••••••" : "Paste the token"} data-testid="growth-dlg-token" /></Field>
            </>}
            {f.syncOn && plat.sync === "facebook" && <>
              <Field label="Page id"><Input value={f.external_id} onChange={(e) => set("external_id", e.target.value)} placeholder="1234567890" /></Field>
              <Field label="Page access token" hint={account?.sync?.token_hint ? `Saved token ${account.sync.token_hint}` : "Stored encrypted; never shown again."}>
                <Input type="password" autoComplete="off" value={f.token} onChange={(e) => set("token", e.target.value)} placeholder="Paste the token" /></Field>
            </>}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="growth-dlg-save">{busy ? "Saving…" : editing ? "Save" : "Add account"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog({ meta, initialOwner, initialMonth, board, ownerName, onClose, onSaved }) {
  const [owner, setOwner] = useState(initialOwner || "internal");
  const [month, setMonth] = useState(initialMonth || shift(meta.this_month, -1));
  const [accounts, setAccounts] = useState(null);
  const [vals, setVals] = useState({});
  const [orig, setOrig] = useState({});
  const [saved, setSaved] = useState({});
  const [busy, setBusy] = useState(false);
  const mdef = useMemo(() => Object.fromEntries(meta.metrics.map((m) => [m.key, m])), [meta]);
  const pdef = useMemo(() => Object.fromEntries(meta.platforms.map((p) => [p.key, p])), [meta]);
  useEffect(() => {
    let live = true;
    setAccounts(null);
    Promise.all([api.get("/growth/accounts", { params: { owner } }), api.get("/growth/months", { params: { owner, month } })]).then(([a, m]) => {
      if (!live) return;
      const have = Object.fromEntries(m.data.map((r) => [r.account_id, r.values || {}]));
      const loaded = Object.fromEntries(a.data.map((x) => [x.id, Object.fromEntries(Object.entries(have[x.id] || {}).map(([k, v]) => [k, String(v)]))]));
      setAccounts(a.data.filter((x) => x.status !== "paused"));
      setSaved(have);
      setOrig(loaded);
      setVals(loaded);
    }).catch((e) => toast.error(apiError(e)));
    return () => { live = false; };
  }, [owner, month]);
  const behind = (board?.rows || []).filter((r) => r.missing_last_month > 0 && r.owner !== owner);
  const save = async () => {
    setBusy(true);
    try {
      // only the cells someone changed: synced or imported numbers that weren't touched keep their source
      const entries = accounts.map((a) => {
        const now = vals[a.id] || {}, was = orig[a.id] || {};
        const keys = new Set([...Object.keys(now), ...Object.keys(was)]);
        const values = {}, clear = [];
        keys.forEach((k) => {
          const n = cleanNum(now[k]), o = cleanNum(was[k]);
          if (n === o) return;
          if (n === "") clear.push(k); else values[k] = n;
        });
        return { account_id: a.id, values, clear };
      }).filter((e) => Object.keys(e.values).length || e.clear.length);
      if (!entries.length) { toast("Nothing changed"); onClose(); return; }
      const { data } = await api.put("/growth/months", { month, entries });
      toast.success(`${mLabel(month, true)} saved for ${data.saved} account${data.saved === 1 ? "" : "s"}`);
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="growth-entry-dialog">
        <DialogHeader><DialogTitle>Enter monthly numbers</DialogTitle>
          <DialogDescription>Followers, subscribers and totals are the number at the end of the month. Views, reach, interactions and clicks are that month's totals — copy them from each platform's insights.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Whose accounts"><OwnerSelect meta={meta} value={owner} onChange={setOwner} testid="growth-entry-owner" /></Field>
          <Field label="Month">
            <Select value={month} onValueChange={setMonth}><SelectTrigger data-testid="growth-entry-month"><SelectValue /></SelectTrigger>
              <SelectContent>{monthOptions(meta.this_month, 24).map((m) => <SelectItem key={m} value={m}>{mLabel(m, true)}{m === meta.this_month ? " (so far)" : ""}</SelectItem>)}</SelectContent></Select>
          </Field>
        </div>
        {behind.length > 0 && <p className="text-xs text-amber-700">Also behind on {mLabel(shift(meta.this_month, -1))}: {behind.slice(0, 6).map((r, i) => (
          <span key={r.owner}>{i ? ", " : ""}<button type="button" className="font-semibold underline underline-offset-2" onClick={() => { setOwner(r.owner); setMonth(shift(meta.this_month, -1)); }}>{r.internal ? "dotindot" : r.name}</button></span>))}</p>}
        {!accounts ? <Spinner className="h-40" /> : accounts.length === 0 ? <Empty icon={Rocket} title={`No active accounts for ${ownerName(owner)}`} sub="Add an account first." /> : (
          <div className="space-y-3" data-testid="growth-entry-grid">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-xl border border-gray-200 p-3" data-testid={`growth-entry-${a.platform}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-2 font-semibold text-sm text-gray-900 min-w-0"><PlatformIcon platform={a.platform} className="h-4 w-4 text-gray-500" /><span className="truncate">{a.platform_label}{a.handle ? ` · ${a.handle}` : ""}</span></span>
                  {saved[a.id] ? <Pill tone="green"><CheckCircle2 className="h-3 w-3" /> on file</Pill> : <Pill tone="amber">not entered</Pill>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(pdef[a.platform]?.metrics || []).map((k) => (
                    <label key={k} className="space-y-1 min-w-0">
                      <span className="block text-[11px] text-gray-500 truncate" title={mdef[k]?.hint || ""}>{mdef[k]?.label}{mdef[k]?.kind === "stock" ? " · month end" : ""}</span>
                      <Input inputMode="decimal" className="h-8 font-mono text-sm" value={vals[a.id]?.[k] ?? ""} placeholder="—"
                        onChange={(e) => setVals((v) => ({ ...v, [a.id]: { ...(v[a.id] || {}), [k]: e.target.value } }))} data-testid={`growth-input-${a.platform}-${k}`} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !accounts?.length} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="growth-entry-save">{busy ? "Saving…" : `Save ${mLabel(month)}`}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const IMPORT_EXAMPLE = "Month,Platform,Handle,Followers,Views,Reach,Interactions\n2026-09,Instagram,brandname,12840,90210,41200,2310\n2026-10,Instagram,brandname,13410,104500,45800,2690";

function ImportDialog({ meta, initialOwner, onClose, onSaved }) {
  const [owner, setOwner] = useState(initialOwner || "internal");
  const [text, setText] = useState("");
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (dry) => {
    setBusy(true);
    try {
      const { data } = await api.post("/growth/import", { owner, text, dry_run: dry });
      if (dry) setCheck(data);
      else { toast.success(`Imported ${data.rows} row${data.rows === 1 ? "" : "s"}${data.problems.length ? ` · ${data.problems.length} skipped` : ""}`); onSaved(); }
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const onFile = (e) => { const file = e.target.files?.[0]; if (!file) return; file.text().then((t) => { setText(t); setCheck(null); }); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="growth-import-dialog">
        <DialogHeader><DialogTitle>Import numbers</DialogTitle>
          <DialogDescription>Paste from a spreadsheet or upload a CSV export. Needs a header row with <b>Month</b> and <b>Platform</b>, then any number columns (Followers, Views, Reach, Interactions, Subscribers…). Add a <b>Handle</b> column if a client has two accounts on one platform.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Whose accounts"><OwnerSelect meta={meta} value={owner} onChange={(v) => { setOwner(v); setCheck(null); }} testid="growth-import-owner" /></Field>
          <Field label="CSV file (optional)"><Input type="file" accept=".csv,.tsv,.txt" onChange={onFile} className="text-xs" data-testid="growth-import-file" /></Field>
        </div>
        <Textarea rows={7} value={text} onChange={(e) => { setText(e.target.value); setCheck(null); }} placeholder={IMPORT_EXAMPLE} className="font-mono text-xs" data-testid="growth-import-text" />
        {check && (
          <div className="space-y-2" data-testid="growth-import-check">
            <p className="text-sm"><span className="font-semibold text-emerald-700">{check.rows} row{check.rows === 1 ? "" : "s"} ready</span>{check.problems.length ? <span className="text-amber-700"> · {check.problems.length} will be skipped</span> : null}</p>
            {check.preview.length > 0 && <div className="rounded-lg border border-gray-100 max-h-40 overflow-auto text-xs">{check.preview.map((p, i) => (
              <div key={i} className="px-2.5 py-1.5 border-b border-gray-50 last:border-0 flex gap-2"><span className="font-semibold text-gray-800 shrink-0">{mLabel(p.month)}</span><span className="text-gray-600 shrink-0">{p.account}</span>
                <span className="text-gray-500 font-mono truncate">{Object.entries(p.values).map(([k, v]) => `${k} ${v}`).join(" · ")}</span></div>))}</div>}
            {check.problems.length > 0 && <ul className="text-xs text-amber-800 space-y-0.5 max-h-32 overflow-auto">{check.problems.map((p, i) => <li key={i}>Row {p.row}: {p.problem}</li>)}</ul>}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          {!check ? <Button onClick={() => run(true)} disabled={busy || !text.trim()} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="growth-import-check-btn">{busy ? "Checking…" : "Check"}</Button>
            : <Button onClick={() => run(false)} disabled={busy || !check.rows} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="growth-import-go">{busy ? "Importing…" : `Import ${check.rows} row${check.rows === 1 ? "" : "s"}`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ meta, onClose, onSaved }) {
  const s = meta.settings;
  const [key, setKey] = useState("");
  const [ver, setVer] = useState(s.graph_version);
  const [auto, setAuto] = useState(s.auto_sync);
  const [busy, setBusy] = useState(false);
  const save = async (extra = {}) => {
    setBusy(true);
    try {
      await api.put("/growth/settings", { graph_version: ver, auto_sync: auto, ...(key.trim() ? { youtube_api_key: key.trim() } : {}), ...extra });
      toast.success("Settings saved"); onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="growth-settings-dialog">
        <DialogHeader><DialogTitle>Connections & sync</DialogTitle>
          <DialogDescription>Accounts you can't connect still work — enter or import their numbers each month.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field label="YouTube Data API key" hint={s.youtube_connected ? `Saved key ${s.youtube_key_hint}. Paste a new key only to replace it.` : "Google Cloud console → enable “YouTube Data API v3” → Credentials → API key. One key covers every channel."}>
            <div className="flex gap-2"><Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.youtube_connected ? "••••••••" : "AIza…"} data-testid="growth-yt-key" />
              {s.youtube_connected && <Button variant="outline" size="sm" className="shrink-0" disabled={busy} onClick={() => save({ remove_youtube_key: true })}>Remove</Button>}</div>
          </Field>
          <Field label="Meta Graph API version" hint="Used for Instagram and Facebook sync. Each account brings its own access token (Instagram Login: instagram_business_basic + instagram_business_manage_insights; Facebook Login: instagram_basic, instagram_manage_insights, pages_read_engagement).">
            <Input value={ver} onChange={(e) => setVer(e.target.value)} className="w-32 font-mono" data-testid="growth-graph-version" />
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
            <span><span className="text-sm font-semibold text-gray-900">Sync every night</span><span className="block text-xs text-gray-500">Around 2 am IST, every connected account is refreshed.</span></span>
            <Switch checked={auto} onCheckedChange={setAuto} data-testid="growth-auto-sync" />
          </label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save()} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white" data-testid="growth-settings-save">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumbersSheet({ account, meta, canManage, onClose, onEdit }) {
  const [rows] = useLoad("/growth/months", { account_id: account.id });
  const mdef = Object.fromEntries(meta.metrics.map((m) => [m.key, m]));
  const mets = (meta.platforms.find((p) => p.key === account.platform)?.metrics || []).filter((k) => (rows || []).some((r) => r.values?.[k] != null));
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl p-0 flex flex-col" data-testid="growth-numbers-sheet">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-100"><SheetTitle className="flex items-center gap-2"><PlatformIcon platform={account.platform} className="h-4 w-4 text-gray-500" />{account.label}</SheetTitle>
          <p className="text-xs text-gray-500">Every month on file, newest first.</p></SheetHeader>
        <div className="flex-1 overflow-auto p-5">
          {!rows ? <Spinner className="h-40" /> : rows.length === 0 ? <Empty icon={Table2} title="No numbers yet" /> : (
            <table className="w-full text-xs" data-testid="growth-numbers-table">
              <thead><tr className="text-gray-500 border-b border-gray-100"><th className="text-left font-semibold py-2 pr-2">Month</th>
                {mets.map((k) => <th key={k} className="text-right font-semibold py-2 px-1.5 whitespace-nowrap">{mdef[k]?.short || mdef[k]?.label}</th>)}<th className="text-left font-semibold py-2 pl-2">Source</th>{canManage && <th />}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-1.5 pr-2 font-semibold text-gray-800 whitespace-nowrap">{mLabel(r.month)}</td>
                  {mets.map((k) => <td key={k} className="py-1.5 px-1.5 text-right font-mono text-gray-800">{fmtNum(r.values?.[k], 1)}</td>)}
                  <td className="py-1.5 pl-2 text-gray-500 whitespace-nowrap" title={r.note || ""}>{SOURCE[r.source] || r.source}{r.updated_by ? ` · ${r.updated_by}` : ""}</td>
                  {canManage && <td className="py-1 pl-1"><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit(r.month)} title="Edit this month"><Pencil className="h-3 w-3" /></Button></td>}
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

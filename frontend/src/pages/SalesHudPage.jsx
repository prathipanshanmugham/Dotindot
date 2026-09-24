import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import { labelize } from "@/components/Badges";
import { DotindotMark } from "@/components/DotindotLogo";
import { X, Trophy, TrendingUp, Building2, PartyPopper } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import confetti from "canvas-confetti";

const REFRESH_MS = 15000;
const ROTATE_MS = 12000;
const SPLASH_MS = 8000;
const PANELS = ["Pipeline", "Leaderboard", "Month Pulse"];
const BAR_COLORS = ["#FBA834", "#F26B21", "#38BDF8", "#A78BFA", "#34D399", "#F87171"];

const bigINR = (n) => {
  const v = Number(n || 0);
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return formatINR(v);
};

export default function SalesHudPage() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [panel, setPanel] = useState(0);
  const [splash, setSplash] = useState(null);
  const lastWonRef = useRef(undefined);

  const fireConfetti = useCallback(() => {
    const end = Date.now() + 4000;
    const colors = ["#F26B21", "#FBA834", "#ffffff", "#34D399"];
    (function frame() {
      confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors, zIndex: 300 });
      confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors, zIndex: 300 });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, []);

  const load = useCallback(() => {
    api.get("/sales/hud").then((r) => {
      setD(r.data);
      setUpdatedAt(new Date());
      const key = r.data.latest_won?.at || null;
      if (lastWonRef.current !== undefined && key && key !== lastWonRef.current) {
        setSplash(r.data.latest_won);
        fireConfetti();
        setTimeout(() => setSplash(null), SPLASH_MS);
      }
      lastWonRef.current = key;
    }).catch(() => {});
  }, [fireConfetti]);

  useEffect(() => {
    load();
    const dataTimer = setInterval(load, REFRESH_MS);
    const rotateTimer = setInterval(() => setPanel((p) => (p + 1) % PANELS.length), ROTATE_MS);
    const onKey = (e) => { if (e.key === "Escape") navigate("/sales"); };
    window.addEventListener("keydown", onKey);
    return () => { clearInterval(dataTimer); clearInterval(rotateTimer); window.removeEventListener("keydown", onKey); };
  }, [load, navigate]);

  if (!d)
    return (
      <div className="fixed inset-0 z-[100] bg-[#080B12] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" />
      </div>
    );

  const pct = Math.min(d.target.pct, 100);
  const onTrack = d.target.pct >= 100;

  return (
    <div className="fixed inset-0 z-[100] bg-[#080B12] text-white flex flex-col overflow-hidden select-none" data-testid="sales-hud">
      <style>{`
        @keyframes hud-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes hud-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes hud-splash-in { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      {splash && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#080B12]/85 backdrop-blur-sm" data-testid="hud-deal-won-splash" onClick={() => setSplash(null)}>
          <div className="text-center px-8" style={{ animation: "hud-splash-in .5s cubic-bezier(.2,.8,.2,1)" }}>
            <PartyPopper className="mx-auto h-16 w-16 text-[#FBA834]" />
            <div className="mt-4 text-xs font-bold uppercase tracking-[0.5em] text-[#F26B21]">Deal won</div>
            <div className="mt-2 text-5xl sm:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-[#F26B21] to-[#FBA834] bg-clip-text text-transparent" data-testid="hud-splash-name">{splash.name}</div>
            <div className="mt-4 font-mono text-4xl sm:text-5xl font-extrabold text-white" data-testid="hud-splash-value">{bigINR(splash.value)}</div>
            {splash.owner && <div className="mt-3 text-lg text-white/60">closed by <span className="font-bold text-white">{splash.owner}</span></div>}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 pt-5">
        <div className="flex items-center gap-3">
          <DotindotMark size={30} />
          <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-[#F26B21] to-[#FBA834] bg-clip-text text-transparent">dotindot.</span>
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-3">Sales View · {d.month}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs font-semibold text-emerald-400" data-testid="hud-live-indicator">
            <span className="h-2 w-2 rounded-full bg-emerald-400" style={{ animation: "hud-pulse 1.6s infinite" }} />
            LIVE · refreshes every 15s{updatedAt && ` · updated ${updatedAt.toLocaleTimeString("en-IN", { hour12: false })}`}
          </span>
          <button onClick={() => navigate("/sales")} data-testid="hud-exit-btn"
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-xs font-semibold text-white/60 hover:text-white hover:border-white/40 transition-colors">
            <X className="h-3.5 w-3.5" /> Exit (ESC)
          </button>
        </div>
      </div>

      {/* Persistent target hero */}
      <div className="px-8 pt-6" data-testid="hud-target-hero">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-8 py-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.25em] text-white/40">Team target — {d.month}</div>
              <div className="mt-1 flex items-baseline gap-4 flex-wrap">
                <span className="text-5xl sm:text-6xl font-extrabold font-mono tracking-tight text-white" data-testid="hud-actual">{bigINR(d.target.actual)}</span>
                <span className="text-xl text-white/40 font-mono">/ {bigINR(d.target.amount)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-extrabold font-mono ${onTrack ? "text-emerald-400" : "text-[#FBA834]"}`} data-testid="hud-pct">{d.target.pct}%</div>
              <div className="text-xs text-white/40 uppercase tracking-widest mt-1">{onTrack ? "Target smashed" : "of monthly target"}</div>
            </div>
          </div>
          <div className="mt-5 h-4 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#F26B21] to-[#FBA834] transition-all duration-1000" style={{ width: `${pct}%` }} data-testid="hud-progress-bar" />
          </div>
        </div>
      </div>

      {/* Rotating panel */}
      <div className="flex-1 px-8 py-6 min-h-0">
        <div className="h-full rounded-3xl border border-white/10 bg-white/[0.02] p-6 flex flex-col" data-testid={`hud-panel-${panel}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-white/50">{PANELS[panel]}</div>
            <div className="flex gap-2">
              {PANELS.map((_, i) => (
                <button key={i} onClick={() => setPanel(i)} data-testid={`hud-panel-dot-${i}`}
                  className={`h-2.5 rounded-full transition-all ${i === panel ? "w-8 bg-[#F26B21]" : "w-2.5 bg-white/20 hover:bg-white/40"}`} />
              ))}
            </div>
          </div>

          {panel === 0 && (
            <div className="flex-1 min-h-0" data-testid="hud-pipeline-panel">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.pipeline.map((p) => ({ ...p, stage: labelize(p.stage) }))} layout="vertical" margin={{ left: 10, right: 40 }}>
                  <XAxis type="number" tick={{ fontSize: 12, fill: "rgba(255,255,255,.4)" }} axisLine={false} tickLine={false} tickFormatter={(v) => bigINR(v)} />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 14, fill: "rgba(255,255,255,.75)", fontWeight: 700 }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, color: "#fff" }}
                    formatter={(v, n) => (n === "value" ? [formatINR(v), "Value"] : [v, "Leads"])} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                  <Bar dataKey="value" name="value" radius={[0, 8, 8, 0]} maxBarSize={34}>
                    {d.pipeline.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {panel === 1 && (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-5 items-center" data-testid="hud-leaderboard-panel">
              {d.leaderboard.length === 0 && <div className="col-span-3 text-center text-white/40 text-lg">No wins recorded this month yet — go close something.</div>}
              {d.leaderboard.map((l, i) => (
                <div key={l.name} className={`rounded-3xl border p-6 text-center ${i === 0 ? "border-[#FBA834]/60 bg-gradient-to-b from-[#F26B21]/15 to-transparent" : "border-white/10 bg-white/[0.03]"}`}
                  data-testid={`hud-leader-${i}`}>
                  <Trophy className={`mx-auto h-8 w-8 ${i === 0 ? "text-[#FBA834]" : i === 1 ? "text-slate-300" : "text-amber-700"}`} />
                  <div className="mt-3 text-xl font-extrabold">{l.name}</div>
                  <div className="mt-1 font-mono text-3xl font-extrabold text-[#FBA834]">{bigINR(l.value)}</div>
                  <div className="text-[11px] uppercase tracking-widest text-white/40 mt-1">won this month</div>
                </div>
              ))}
            </div>
          )}

          {panel === 2 && (
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-5 items-center" data-testid="hud-pulse-panel">
              {[
                { icon: TrendingUp, label: "MTD revenue", value: bigINR(d.mtd_revenue) },
                { icon: Trophy, label: "Deals won MTD", value: d.won_count_mtd },
                { icon: Building2, label: "Top branch", value: d.top_branch?.name || "—", sub: d.top_branch ? bigINR(d.top_branch.revenue) : "" },
                { icon: TrendingUp, label: "Open pipeline", value: bigINR(d.pipeline.filter((p) => !["won", "lost"].includes(p.stage)).reduce((s, p) => s + p.value, 0)) },
              ].map((m) => (
                <div key={m.label} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
                  <m.icon className="mx-auto h-7 w-7 text-[#F26B21]" />
                  <div className="mt-3 font-mono text-3xl font-extrabold">{m.value}</div>
                  {m.sub && <div className="font-mono text-sm text-[#FBA834]">{m.sub}</div>}
                  <div className="text-[11px] uppercase tracking-widest text-white/40 mt-1">{m.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ticker */}
      <div className="border-t border-white/10 bg-white/[0.02] py-3 overflow-hidden" data-testid="hud-ticker">
        <div className="flex whitespace-nowrap" style={{ animation: "hud-marquee 40s linear infinite", width: "max-content" }}>
          {[...d.ticker, ...d.ticker].map((t, i) => (
            <span key={i} className="mx-8 text-sm text-white/60">
              <span className="font-bold text-white">{t.lead}</span>
              <span className="mx-1.5 text-[#F26B21]">→</span>
              {labelize(t.stage)}
              {t.owner && <span className="text-white/30 ml-1.5">· {t.owner}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { inrShort } from "@/components/kit";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, MapPin, ArrowRight } from "lucide-react";

// Status steps (fixed): the fill carries severity, the track is a lighter step of the same hue.
const BANDS = {
  strong: { label: "Strong", icon: CheckCircle2, fill: "#0ca30c", track: "#dcf3dc", ink: "#0a7a0a" },
  steady: { label: "Steady", icon: AlertTriangle, fill: "#fab219", track: "#fdeec9", ink: "#8a5a00" },
  attention: { label: "Needs attention", icon: AlertOctagon, fill: "#d03b3b", track: "#f6dada", ink: "#b02a2a" },
};
const bandOf = (s) => (s === null || s === undefined ? null : s >= 75 ? "strong" : s >= 50 ? "steady" : "attention");
const MONTH = new Date().toLocaleString("en-IN", { month: "long" });

const Meter = ({ value, height = 8, label }) => {
  const b = BANDS[bandOf(value)];
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: b ? b.track : "#f1f1ef" }}
      role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-label={label} title={value === null ? `${label}: not scored yet` : `${label}: ${value} / 100`}>
      {b && <div className="h-full rounded-full" style={{ width: `${Math.max(value, 2)}%`, background: b.fill }} />}
    </div>
  );
};

const BandPill = ({ band }) => {
  const b = BANDS[band];
  if (!b) return <span className="text-xs text-gray-400">Not scored yet</span>;
  const Icon = b.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-gray-800">
      <Icon className="h-3.5 w-3.5" style={{ color: b.fill }} aria-hidden /> {b.label}
    </span>
  );
};

/** What each part is made of, in words and real numbers — or why it isn't scored yet. */
const facts = (p, loc, canSetTarget) => {
  switch (p.key) {
    case "sales":
      return p.missing ? (
        <>Won {inrShort(p.won_value)} this month · no {MONTH} target yet{canSetTarget && <> · <Link to={`/sales/targets?location=${loc.id}`} className="font-semibold text-[#F26B21] hover:underline" data-testid={`score-set-target-${loc.id}`}>Set one</Link></>}</>
      ) : <>{inrShort(p.won_value)} won of {inrShort(p.target)} target · {p.won_count} deal{p.won_count === 1 ? "" : "s"}</>;
    case "collections":
      return p.missing ? "No invoices fell due in the last 90 days" : <>{inrShort(p.collected)} of {inrShort(p.due)} collected · {inrShort(p.outstanding)} still due</>;
    case "delivery":
      return p.missing ? "No active projects here" : <>{p.on_track} of {p.active} active projects on track{p.late ? ` · ${p.late} late` : ""}</>;
    case "clients":
      return p.missing ? "No active clients here yet" : <>{p.healthy} healthy · {p.watch} to watch · {p.at_risk} at risk</>;
    case "attendance":
      if (p.missing === "no_staff") return "Nobody is based here yet";
      if (p.missing) return "No attendance marked this month";
      return <>{p.present_days} of {p.expected_days} working days present · {p.people} {p.people === 1 ? "person" : "people"}</>;
    default:
      return null;
  }
};

const ScoreCard = ({ loc, ranked, canSetTarget }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={`location-score-${loc.id}`}>
    <CardContent className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{loc.name}</div>
          <div className="text-xs text-gray-500 truncate flex items-center gap-1">
            {loc.city && <><MapPin className="h-3 w-3 shrink-0" />{loc.city}</>}{loc.head && <span className="truncate">{loc.city ? " · " : ""}{loc.head}</span>}
          </div>
        </div>
        {ranked && loc.rank && <span className="text-xs font-semibold text-gray-500 shrink-0" aria-label={`Ranked ${loc.rank}`}>#{loc.rank}</span>}
      </div>

      {loc.score === null ? (
        <p className="text-sm text-gray-600 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5" data-testid={`location-score-value-${loc.id}`}>
          No score yet. It starts once this location has a target, invoices, active projects, clients or attendance.
        </p>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-semibold tracking-tight text-gray-900 leading-none" data-testid={`location-score-value-${loc.id}`}>
              {loc.score}<span className="text-base font-medium text-gray-400"> / 100</span>
            </div>
            <div className="pb-1"><BandPill band={loc.band} /></div>
          </div>
          <Meter value={loc.score} height={10} label={`${loc.name} score`} />
        </>
      )}
      {loc.provisional && <p className="text-xs text-gray-500 -mt-2">Early read: only {loc.scored_weight}% of the card has data so far.</p>}

      <ul className="space-y-3 pt-1">
        {loc.parts.map((p) => (
          <li key={p.key} data-testid={`score-part-${loc.id}-${p.key}`}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-800 font-medium">{p.label} <span className="text-xs font-normal text-gray-400">{p.weight}%</span></span>
              <span className="text-sm font-semibold text-gray-900">{p.score ?? <span className="text-xs font-normal text-gray-400">not scored</span>}</span>
            </div>
            <div className="mt-1"><Meter value={p.score} height={6} label={p.label} /></div>
            <div className="text-xs text-gray-500 mt-1 leading-snug">{facts(p, loc, canSetTarget)}</div>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);

/** One scorecard per location: the CEO sees every location, a location manager sees theirs. */
export default function LocationScores({ testid = "location-scores" }) {
  const { hasPerm, user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api.get("/dashboard/location-scores").then((r) => setD(r.data)).catch(() => setErr(true)); }, []);
  if (err) return null;
  const canSetTarget = ["super_admin", "admin", "sales"].includes(user?.role) && (hasPerm ? hasPerm("sales.targets") : true);
  const un = d?.unassigned;
  const loose = un ? [[un.clients, "client"], [un.projects, "project"], [un.leads, "lead"]].filter(([n]) => n > 0) : [];
  return (
    <section className="space-y-3" data-testid={testid}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Location scores</h2>
          <p className="text-xs text-gray-500">{d ? `${MONTH} so far, out of 100` : "Working out each location's score…"}</p>
        </div>
        {d && (
          <Popover>
            <PopoverTrigger className="text-xs font-semibold text-[#F26B21] inline-flex items-center gap-1 hover:underline" data-testid="location-scores-how">
              <Info className="h-3.5 w-3.5" /> How the score works
            </PopoverTrigger>
            <PopoverContent className="w-80 text-xs text-gray-600 leading-relaxed space-y-2" align="end">
              <p>{d.method}</p>
              <p>75 and up is Strong, 50 to 74 Steady, under 50 Needs attention.</p>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {!d ? (
        <div className="h-40 rounded-xl border border-dashed border-gray-200 animate-pulse" />
      ) : d.locations.length === 0 ? (
        <Card className="border-gray-200/80"><CardContent className="p-5 text-sm text-gray-500">No locations yet. <Link to="/locations" className="font-semibold text-[#F26B21]">Add your first location</Link> to see its score.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {d.locations.map((l) => <ScoreCard key={l.id} loc={l} ranked={d.locations.length > 1} canSetTarget={canSetTarget} />)}
        </div>
      )}
      {loose.length > 0 && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2" data-testid="location-scores-unassigned">
          {loose.map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`).join(", ")} {loose.length === 1 && loose[0][0] === 1 ? "has" : "have"} no location yet, so {loose.length === 1 && loose[0][0] === 1 ? "it doesn't" : "they don't"} count towards any score.{" "}
          <Link to="/clients" className="font-semibold text-[#F26B21] inline-flex items-center gap-0.5">Set locations <ArrowRight className="h-3 w-3" /></Link>
        </p>
      )}
    </section>
  );
}

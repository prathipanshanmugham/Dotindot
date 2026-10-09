import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CalendarCheck, ArrowRight } from "lucide-react";

/** One-line nudge on the staff dashboard: check in / file today's report. */
export default function TodayAttendanceStrip() {
  const { hasPerm } = useAuth();
  const [d, setD] = useState(null);
  const allowed = hasPerm("daily_reports");
  useEffect(() => { if (allowed) api.get("/daily/me").then((r) => setD(r.data)).catch(() => {}); }, [allowed]);
  if (!d) return null;
  const r = d.record;
  const off = (d.settings.weekly_off || []).includes((new Date(d.today + "T00:00:00").getDay() + 6) % 7);
  let text, cta;
  if (!r?.status) { if (off) return null; text = "You haven't checked in today."; cta = "Check in"; }
  else if (["leave", "absent"].includes(r.status)) return null;
  else if (!r.report?.submitted) { text = `Checked in at ${r.check_in_local || "—"}. Don't forget today's report.`; cta = "Write report"; }
  else { text = `Checked in at ${r.check_in_local || "—"} · today's report is filed.`; cta = "Open"; }
  const done = r?.report?.submitted;
  return (
    <Link to="/daily" data-testid="today-attendance-strip"
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${done ? "border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-50" : "border-orange-200 bg-[#FFF7ED] text-gray-800 hover:bg-orange-50"}`}>
      <CalendarCheck className={`h-5 w-5 shrink-0 ${done ? "text-emerald-600" : "text-[#F26B21]"}`} />
      <span className="flex-1 min-w-0">{text}</span>
      <span className={`font-semibold inline-flex items-center gap-1 whitespace-nowrap ${done ? "text-emerald-700" : "text-[#F26B21]"}`}>{cta}<ArrowRight className="h-4 w-4" /></span>
    </Link>
  );
}

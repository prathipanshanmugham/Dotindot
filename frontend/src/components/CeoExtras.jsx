import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { formatINR } from "@/lib/api";
import { labelize } from "@/components/Badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Boxes, Users, ShieldAlert, RefreshCw, Activity } from "lucide-react";

const Tile = ({ icon: Icon, title, link, children, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
      <CardTitle className="text-sm font-semibold flex items-center gap-2"><Icon className="h-4 w-4 text-[#F26B21]" /> {title}</CardTitle>
      {link && <Link to={link} className="text-[11px] font-semibold text-[#F26B21] hover:underline">View</Link>}
    </CardHeader>
    <CardContent className="pt-0">{children}</CardContent>
  </Card>
);

const Row = ({ label, value, tone }) => (
  <div className="flex items-center justify-between py-1 text-sm"><span className="text-gray-500">{label}</span><span className={`font-mono font-bold ${tone || "text-gray-900"}`}>{value}</span></div>
);

export const CeoExtras = () => {
  const [x, setX] = useState(null);
  useEffect(() => { api.get("/dashboard/ceo").then((r) => setX(r.data)).catch(() => {}); }, []);
  if (!x) return null;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="ceo-extras">
        <Tile icon={Boxes} title="Assets" link="/assets" testid="ceo-assets-card">
          <Row label="Registered" value={x.assets.count} />
          <Row label="Total value" value={formatINR(x.assets.value)} />
          <Row label="In use" value={x.assets.in_use} />
          <Row label="Maintenance due (30d)" value={x.assets.maintenance_due} tone={x.assets.maintenance_due ? "text-amber-600" : "text-emerald-600"} />
        </Tile>
        <Tile icon={Users} title="Employees" link="/employees" testid="ceo-employees-card">
          <Row label="Headcount" value={x.employees.headcount} />
          {x.employees.by_branch.map((b) => <Row key={b.branch} label={b.branch} value={b.count} />)}
        </Tile>
        <Tile icon={ShieldAlert} title="Password & security health" link="/passwords" testid="ceo-security-card">
          <Row label="Vault entries" value={x.security.entries} />
          <Row label="Without 2FA" value={x.security.without_2fa} tone={x.security.without_2fa ? "text-red-600" : "text-emerald-600"} />
          <Row label="Overdue password changes" value={x.security.overdue_changes} tone={x.security.overdue_changes ? "text-red-600" : "text-emerald-600"} />
        </Tile>
        <Tile icon={RefreshCw} title="Subscription renewals (30d)" link="/finance/subscriptions" testid="ceo-renewals-card">
          {x.renewals.items.length === 0 && <p className="text-sm text-gray-400">Nothing renewing soon.</p>}
          {x.renewals.items.map((s, i) => <Row key={i} label={`${s.name} · ${s.date}`} value={formatINR(s.cost)} />)}
        </Tile>
      </div>
      <Card className="border-gray-200/80 shadow-sm" data-testid="ceo-critical-feed">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-[#F26B21]" /> Recent critical activity</CardTitle></CardHeader>
        <CardContent className="pt-0 divide-y divide-gray-100">
          {x.critical_feed.length === 0 && <p className="text-sm text-gray-400 py-2">No critical actions recorded.</p>}
          {x.critical_feed.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate"><span className="font-semibold text-gray-800">{a.user_name}</span> <Badge variant="outline" className="text-[10px] mx-1">{labelize(a.action)}</Badge> <span className="text-gray-500">{a.entity_name}</span></span>
              <span className="text-[11px] text-gray-400 shrink-0">{new Date(a.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
};

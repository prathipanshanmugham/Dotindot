import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { RoleBadge, ROLE_LABELS } from "@/components/Badges";
import ExportMenu from "@/components/ExportMenu";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Users, Building2, Globe2, GraduationCap, ArrowRight } from "lucide-react";

const StatCard = ({ icon: Icon, label, value, testid }) => (
  <Card className="border-gray-200/80 shadow-sm" data-testid={testid}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-[#FFF7ED] flex items-center justify-center shrink-0">
        <Icon className="h-4.5 w-4.5 text-[#F26B21]" style={{ height: 18, width: 18 }} />
      </div>
      <div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </CardContent>
  </Card>
);

const initials = (name) =>
  (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function EmployeesPage() {
  const [people, setPeople] = useState(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");

  const load = () => {
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (role !== "all") params.role = role;
    api.get("/employees", { params }).then((r) => setPeople(r.data)).catch(() => setPeople([]));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, role]);

  // v2.6: super admin can permanently remove people from the directory (same pipeline as User Management)
  const del = useRecordDelete({ coll: "users", permKey: "__super_admin__", rows: people || [], onDeleted: load, labelOf: (p) => p.name });
  if (!people)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const departments = new Set(people.map((p) => p.department).filter(Boolean));
  const cities = new Set(people.map((p) => p.city).filter(Boolean));
  const inTraining = people.length; // placeholder not shown

  return (
    <div className="space-y-6 max-w-7xl" data-testid="employees-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Team Directory</h1>
          <p className="text-sm text-gray-500 mt-1">The people behind dotindot — profiles, skills and training.</p>
        </div>
        <ExportMenu
          dataset="employees"
          params={{ ...(search.trim() && { search: search.trim() }), ...(role !== "all" && { role }) }}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Team members" value={people.filter((p) => p.is_active !== false).length} testid="emp-stat-total" />
        <StatCard icon={Building2} label="Departments" value={departments.size} testid="emp-stat-departments" />
        <StatCard icon={Globe2} label="Cities" value={cities.size} testid="emp-stat-cities" />
        <StatCard icon={GraduationCap} label="Roles" value={new Set(people.map((p) => p.role)).size} testid="emp-stat-roles" />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            data-testid="employees-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, designation or skill..."
            className="pl-9 bg-white"
          />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44 bg-white" data-testid="employees-role-filter">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {del.canDelete && people.length > 0 && <div className="flex justify-end">{del.dialog}<BulkDeleteBar kit={del} /></div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {people.map((p) => (
          <Link key={p.id} to={`/employees/${p.id}`} data-testid={`employee-card-${p.id}`}>
            <Card className={`border-gray-200/80 shadow-sm hover:border-orange-300 hover:shadow-md transition-all h-full ${p.is_active === false ? "opacity-60" : ""}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#F26B21] to-[#FBA834] text-white font-bold flex items-center justify-center text-sm">
                    {initials(p.name)}
                  </div>
                  <div className="flex items-center gap-1"><RoleBadge role={p.role} /><RowDeleteControls kit={del} row={p} /></div>
                </div>
                <div className="mt-3">
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    {p.name}
                    {p.is_active === false && <Badge variant="outline" className="text-[9px] bg-gray-100 text-gray-500">Inactive</Badge>}
                  </div>
                  <div className="text-xs text-gray-500">{p.designation || "—"}</div>
                </div>
                {p.city && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                    <MapPin className="h-3 w-3" /> {p.city}
                  </div>
                )}
                {p.skills?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.skills.slice(0, 3).map((s) => (
                      <span key={s} className="text-[10px] font-medium bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{s}</span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-[#F26B21]">
                  View profile <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {people.length === 0 && (
        <div className="text-center text-sm text-gray-400 py-16">No team members match your filters.</div>
      )}
    </div>
  );
}

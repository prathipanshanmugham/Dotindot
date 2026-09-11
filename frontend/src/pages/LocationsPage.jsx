import { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Building2, UserCheck, Globe2, Plus, Pencil, Trash2 } from "lucide-react";

const LAYERS = [
  { key: "clients", label: "Clients", color: "#F26B21", icon: Users, offset: [0, 0] },
  { key: "branches", label: "Branches", color: "#1F2937", icon: Building2, offset: [0.22, 0.22] },
  { key: "employees", label: "Team", color: "#2563EB", icon: UserCheck, offset: [-0.22, -0.22] },
];

const makeIcon = (color, count) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff;"><span style="transform:rotate(45deg);font-size:11px;font-weight:700;font-family:sans-serif;">${count}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });

const EMPTY_BRANCH = { name: "", city: "", country: "", address: "", head_name: "", contact_email: "", contact_phone: "", status: "active" };

const BranchManager = () => {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin"].includes(user?.role);
  const [branches, setBranches] = useState([]);
  const [cities, setCities] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_BRANCH);

  const load = useCallback(() => {
    api.get("/locations/branches").then((r) => setBranches(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api.get("/locations/cities").then((r) => setCities(r.data)).catch(() => {});
  }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY_BRANCH); setOpen(true); };
  const openEdit = (b) => {
    setEditing(b);
    setForm({
      name: b.name || "", city: b.city || "", country: b.country || "", address: b.address || "",
      head_name: b.head_name || "", contact_email: b.contact_email || "", contact_phone: b.contact_phone || "",
      status: b.status || "active",
    });
    setOpen(true);
  };

  const pickCity = (city) => {
    const c = cities.find((x) => x.city === city);
    setForm((f) => ({ ...f, city, country: c?.country || f.country }));
  };

  const save = async () => {
    if (!form.name || !form.city) return toast.error("Branch name and city are required");
    try {
      if (editing) await api.put(`/locations/branches/${editing.id}`, form);
      else await api.post("/locations/branches", form);
      toast.success(editing ? "Branch updated" : "Branch created");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (b) => {
    try {
      await api.delete(`/locations/branches/${b.id}`);
      toast.success("Branch deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <Card className="border-gray-200/80 shadow-sm" data-testid="branch-manager">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#F26B21]" /> Branches
        </CardTitle>
        {isAdmin && (
          <Button size="sm" onClick={openNew} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="add-branch-btn">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add branch
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Branch</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Manager / Head</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.length === 0 && (
              <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-sm text-gray-400">No branches yet.</TableCell></TableRow>
            )}
            {branches.map((b) => (
              <TableRow key={b.id} data-testid={`branch-row-${b.id}`}>
                <TableCell>
                  <div className="font-semibold text-gray-900">{b.name}</div>
                  {b.address && <div className="text-xs text-gray-400">{b.address}</div>}
                </TableCell>
                <TableCell className="text-sm text-gray-600">{b.city}{b.country ? `, ${b.country}` : ""}</TableCell>
                <TableCell className="text-sm text-gray-600">{b.manager_name || "—"}</TableCell>
                <TableCell className="text-xs text-gray-500">{b.contact_email || "—"}{b.contact_phone ? ` · ${b.contact_phone}` : ""}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={b.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}>
                    {b.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)} data-testid={`edit-branch-${b.id}`}>
                      <Pencil className="h-3.5 w-3.5 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(b)} data-testid={`delete-branch-${b.id}`}>
                      <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit branch" : "New branch"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Branch name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} data-testid="branch-form-name" />
            </div>
            <div className="space-y-1">
              <Label>City</Label>
              <Select value={form.city} onValueChange={pickCity}>
                <SelectTrigger data-testid="branch-form-city"><SelectValue placeholder="Pick a city" /></SelectTrigger>
                <SelectContent>{cities.map((c) => <SelectItem key={c.city} value={c.city}>{c.city}, {c.country}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="branch-form-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} data-testid="branch-form-address" />
            </div>
            <div className="space-y-1">
              <Label>Head / Manager name</Label>
              <Input value={form.head_name} onChange={(e) => setForm((f) => ({ ...f, head_name: e.target.value }))} data-testid="branch-form-head" />
            </div>
            <div className="space-y-1">
              <Label>Contact email</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} data-testid="branch-form-email" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Contact phone</Label>
              <Input value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} data-testid="branch-form-phone" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="branch-form-save">
              {editing ? "Save changes" : "Create branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default function LocationsPage() {
  const [data, setData] = useState(null);
  const [enabled, setEnabled] = useState({ clients: true, branches: true, employees: true });

  useEffect(() => {
    api.get("/locations/map").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const toggle = (key) => setEnabled((e) => ({ ...e, [key]: !e[key] }));

  return (
    <div className="space-y-5 max-w-7xl" data-testid="locations-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Locations</h1>
          <p className="text-sm text-gray-500 mt-1">Where our clients, branches and team are — across {data.totals.cities} cities.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Globe2 className="h-4 w-4" /> OpenStreetMap
        </div>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap gap-2">
        {LAYERS.map((l) => (
          <button
            key={l.key}
            onClick={() => toggle(l.key)}
            data-testid={`layer-toggle-${l.key}`}
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
              enabled[l.key]
                ? "border-transparent text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-400"
            }`}
            style={enabled[l.key] ? { backgroundColor: l.color } : {}}
          >
            <l.icon className="h-3.5 w-3.5" />
            {l.label}
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${enabled[l.key] ? "bg-white/25" : "bg-gray-100"}`}>
              {data.totals[l.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Map */}
        <Card className="border-gray-200/80 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div style={{ height: "calc(100vh - 320px)", minHeight: 420 }} data-testid="locations-map">
              <MapContainer center={[22, 55]} zoom={4} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {data.cities.map((c) =>
                  LAYERS.map((l) => {
                    const items = c[l.key];
                    if (!enabled[l.key] || !items?.length) return null;
                    return (
                      <Marker
                        key={`${c.city}-${l.key}`}
                        position={[c.lat + l.offset[0], c.lng + l.offset[1]]}
                        icon={makeIcon(l.color, items.length)}
                      >
                        <Popup>
                          <div style={{ minWidth: 180 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                              {c.city}, {c.country} — {l.label}
                            </div>
                            {items.map((it) => (
                              <div key={it.id} style={{ fontSize: 12, padding: "2px 0" }}>
                                {l.key === "clients" ? (
                                  <Link to={`/clients/${it.id}`} style={{ color: "#F26B21", fontWeight: 600 }}>{it.name}</Link>
                                ) : l.key === "employees" ? (
                                  <Link to={`/employees/${it.id}`} style={{ color: "#2563EB", fontWeight: 600 }}>{it.name}</Link>
                                ) : (
                                  <span style={{ fontWeight: 600 }}>{it.name}</span>
                                )}
                                <span style={{ color: "#9CA3AF", marginLeft: 6 }}>
                                  {it.industry || it.designation || it.head_name || ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })
                )}
              </MapContainer>
            </div>
          </CardContent>
        </Card>

        {/* City list */}
        <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          {data.cities.map((c) => (
            <Card key={c.city} className="border-gray-200/80 shadow-sm" data-testid={`city-card-${c.city.replace(/\s+/g, "-").toLowerCase()}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900 text-sm">{c.city}</div>
                  <span className="text-[10px] uppercase tracking-widest text-gray-400">{c.country}</span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  {c.clients.length > 0 && <span className="flex items-center gap-1"><Users className="h-3 w-3 text-[#F26B21]" />{c.clients.length} client{c.clients.length > 1 ? "s" : ""}</span>}
                  {c.branches.length > 0 && <span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-700" />{c.branches.length} branch</span>}
                  {c.employees.length > 0 && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3 text-blue-600" />{c.employees.length} team</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Branch management */}
      <BranchManager />
    </div>
  );
}

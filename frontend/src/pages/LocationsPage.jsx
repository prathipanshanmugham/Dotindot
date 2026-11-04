import { useEffect, useState, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import api, { apiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Building2, UserCheck, Globe2, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { LocationFields } from "@/components/LocationFields";
import { PinPicker } from "@/components/PinPicker";
import { BranchFilter } from "@/components/BranchFilter";

const LAYERS = [
  { key: "clients", label: "Clients", color: "#F26B21", icon: Users },
  { key: "branches", label: "Branches", color: "#1F2937", icon: Building2 },
  { key: "employees", label: "Team", color: "#2563EB", icon: UserCheck },
];

// v3.0: branches sit on their own exact pin; clients + team share ONE marker at their city's centre (no offsets).
const BUILDING_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>';
const branchIcon = (exact) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${exact ? "#1F2937" : "#fff"};color:${exact ? "#fff" : "#1F2937"};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);border:${exact ? "2px solid #fff" : "2px dashed #1F2937"};"><span style="transform:rotate(45deg);display:flex">${BUILDING_SVG}</span></div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
  });
const cityIcon = (clients, team) => {
  const seg = (n, bg) => (n ? `<span style="background:${bg};color:#fff;padding:0 7px;line-height:22px;font-weight:700">${n}</span>` : "");
  const html = `<div style="display:inline-flex;border-radius:11px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);font:11px Inter,sans-serif;transform:translate(-50%,-50%);white-space:nowrap">${seg(clients, "#F26B21")}${seg(team, "#2563EB")}</div>`;
  return L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -12] });
};

const EMPTY_BRANCH = { name: "", city: "", state: "", country: "India", address: "", head_name: "", contact_email: "", contact_phone: "", status: "active", lat: null, lng: null, pin_source: null };

const BranchManager = ({ onChanged, onLocate }) => {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin"].includes(user?.role);
  const [branches, setBranches] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_BRANCH);

  const del = useRecordDelete({ coll: "branches", permKey: "locations.delete", rows: branches, onDeleted: () => { load(); onChanged && onChanged(); } });
  const load = useCallback(() => {
    api.get("/locations/branches").then((r) => setBranches(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY_BRANCH); setOpen(true); };
  const pinChange = useCallback((lat, lng, pin_source) => setForm((f) => ({ ...f, lat, lng, pin_source })), []);
  const openEdit = (b) => {
    setEditing(b);
    setForm({
      name: b.name || "", city: b.city || "", state: b.state || "", country: b.country || "India", address: b.address || "",
      head_name: b.head_name || "", contact_email: b.contact_email || "", contact_phone: b.contact_phone || "",
      status: b.status || "active", lat: b.lat ?? null, lng: b.lng ?? null, pin_source: b.pin_source || null,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.city) return toast.error("Branch name and city are required");
    try {
      if (editing) await api.put(`/locations/branches/${editing.id}`, form);
      else await api.post("/locations/branches", form);
      toast.success(editing ? "Branch updated" : form.pin_source === "exact" ? "Branch created with its exact pin" : `Branch created — pinned at ${form.city} centre for now`);
      setOpen(false);
      load();
      onChanged && onChanged();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (b) => {
    try {
      await api.delete(`/locations/branches/${b.id}`);
      toast.success("Branch deleted");
      load();
      onChanged && onChanged();
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
              <TableHead className="w-20">{del.canDelete && <><BulkDeleteBar kit={del} />{del.dialog}</>}</TableHead>
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
              <TableRow key={b.id} data-testid={`branch-row-${b.id}`} className="cursor-pointer hover:bg-orange-50/40" onClick={() => onLocate && onLocate(b)}><TableCell className="w-20"><RowDeleteControls kit={del} row={b} /></TableCell>
                <TableCell>
                  <div className="font-semibold text-gray-900">{b.name}</div>
                  {b.address && <div className="text-xs text-gray-400">{b.address}</div>}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {b.city}{b.country ? `, ${b.country}` : ""}
                  <div className="mt-0.5">{b.pin_source === "exact"
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700" data-testid={`branch-pin-exact-${b.id}`}><CheckCircle2 className="h-3 w-3" /> Exact pin</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" data-testid={`branch-pin-approx-${b.id}`}><AlertTriangle className="h-3 w-3" /> {b.lat == null ? "No pin" : "City centre pin"}</span>}</div>
                </TableCell>
                <TableCell className="text-sm text-gray-600">{b.manager_name || "—"}</TableCell>
                <TableCell className="text-xs text-gray-500">{b.contact_email || "—"}{b.contact_phone ? ` · ${b.contact_phone}` : ""}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={b.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}>
                    {b.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(b); }} data-testid={`edit-branch-${b.id}`}>
                      <Pencil className="h-3.5 w-3.5 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); remove(b); }} data-testid={`delete-branch-${b.id}`}>
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
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <LocationFields country={form.country} state={form.state} city={form.city} prefix="branch-form" compact
                onChange={(v) => setForm((f) => ({ ...f, ...v, ...(v.city !== undefined && v.city !== f.city ? { lat: null, lng: null, pin_source: null } : {}) }))} />
            </div>
            <div className="col-span-2">
              <PinPicker city={form.city} lat={form.lat} lng={form.lng} source={form.pin_source} onChange={pinChange} />
            </div>
            <div className="col-span-2 space-y-1">
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
  const [branchFilter, setBranchFilter] = useState("all");
  const mapRef = useRef(null);
  const mapWrapRef = useRef(null);

  const loadMap = useCallback(() => {
    api.get("/locations/map", { params: branchFilter !== "all" ? { branch: branchFilter } : {} }).then((r) => setData(r.data)).catch(() => {});
  }, [branchFilter]);

  useEffect(() => { loadMap(); }, [loadMap]);

  // Auto-fit to all visible pins whenever data changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !data) return;
    const pts = [...data.cities.map((c) => [c.lat, c.lng]), ...(data.branches || []).filter((b) => b.lat != null).map((b) => [b.lat, b.lng])];
    if (!pts.length) return;
    if (pts.length === 1) m.setView(pts[0], 12);
    else m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 13 });
  }, [data]);

  const flyTo = (c) => mapRef.current?.flyTo([c.lat, c.lng], 12, { duration: 0.8 });

  // Keep Leaflet correctly sized when its container changes (panel toggles, resize, layout shifts)
  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  if (!data)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const toggle = (key) => setEnabled((e) => ({ ...e, [key]: !e[key] }));
  const branchPins = data.branches || [];
  const needFix = branchPins.filter((b) => b.pin_source !== "exact");

  return (
    <div className="space-y-5 max-w-7xl" data-testid="locations-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Locations</h1>
          <p className="text-sm text-gray-500 mt-1">Where our clients, branches and team are — across {data.totals.cities} cities.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <BranchFilter value={branchFilter} onChange={setBranchFilter} testid="map-branch-filter" />
          <Globe2 className="h-4 w-4" /> OpenStreetMap
        </div>
      </div>

      {needFix.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-3" data-testid="pins-need-fix">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">{needFix.length === 1 ? "1 branch is" : `${needFix.length} branches are`} pinned at the city centre, not the office: </span>
            {needFix.map((b) => b.name).join(", ")}.
            <span className="text-amber-800"> Edit the branch below and tap <b>Use my location</b> at the office, or paste its Google Maps link. Attendance uses this pin.</span>
          </div>
        </div>
      )}

      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2">
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
        <span className="text-xs text-gray-400 sm:ml-2">Branches show their exact pin · clients and team show at their city's centre</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* Map */}
        <Card className="border-gray-200/80 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div style={{ height: "calc(100vh - 320px)", minHeight: 420 }} data-testid="locations-map" className="map-wrapper" ref={mapWrapRef}>
              <MapContainer ref={mapRef} center={[11.1, 77.6]} zoom={7} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {data.cities.map((c) => {
                  const nc = enabled.clients ? c.clients.length : 0;
                  const ne = enabled.employees ? c.employees.length : 0;
                  if (!nc && !ne) return null;
                  return (
                    <Marker key={`city-${c.city}`} position={[c.lat, c.lng]} icon={cityIcon(nc, ne)}>
                      <Popup>
                        <div style={{ minWidth: 190, maxHeight: 260, overflowY: "auto" }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{c.city}{c.country ? `, ${c.country}` : ""}</div>
                          {nc > 0 && <div style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 4 }}>Clients</div>}
                          {nc > 0 && c.clients.map((it) => (
                            <div key={it.id} style={{ fontSize: 12, padding: "2px 0" }}>
                              <Link to={`/clients/${it.id}`} style={{ color: "#F26B21", fontWeight: 600 }}>{it.name}</Link>
                              <span style={{ color: "#9CA3AF", marginLeft: 6 }}>{it.industry || ""}</span>
                            </div>
                          ))}
                          {ne > 0 && <div style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 6 }}>Team</div>}
                          {ne > 0 && c.employees.map((it) => (
                            <div key={it.id} style={{ fontSize: 12, padding: "2px 0" }}>
                              <Link to={`/employees/${it.id}`} style={{ color: "#2563EB", fontWeight: 600 }}>{it.name}</Link>
                              <span style={{ color: "#9CA3AF", marginLeft: 6 }}>{it.designation || ""}</span>
                            </div>
                          ))}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
                {enabled.branches && branchPins.filter((b) => b.lat != null).map((b) => (
                  <Marker key={`branch-${b.id}`} position={[b.lat, b.lng]} icon={branchIcon(b.pin_source === "exact")} zIndexOffset={500}>
                    <Popup>
                      <div style={{ minWidth: 180 }}>
                        <div style={{ fontWeight: 700 }}>{b.name}</div>
                        <div style={{ fontSize: 12, color: "#6B7280" }}>{b.address || b.city}</div>
                        {b.head_name && <div style={{ fontSize: 12, color: "#6B7280" }}>Head: {b.head_name}</div>}
                        <div style={{ fontSize: 11, marginTop: 4, color: b.pin_source === "exact" ? "#047857" : "#B45309", fontWeight: 600 }}>
                          {b.pin_source === "exact" ? "Exact office pin" : "Approximate — city centre"}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </CardContent>
        </Card>

        {/* City list */}
        <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          {data.cities.map((c) => (
            <Card key={c.city} className="border-gray-200/80 shadow-sm cursor-pointer hover:border-[#F26B21]/50 transition-colors" onClick={() => flyTo(c.branches?.find((b) => b.lat != null) || c)} data-testid={`city-card-${c.city.replace(/\s+/g, "-").toLowerCase()}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900 text-sm">{c.city}</div>
                  <span className="text-[10px] uppercase tracking-widest text-gray-400">{c.country}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {c.clients.length > 0 && <span className="flex items-center gap-1"><Users className="h-3 w-3 text-[#F26B21]" />{c.clients.length} client{c.clients.length > 1 ? "s" : ""}</span>}
                  {c.branches.length > 0 && <span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-700" />{c.branches.length} branch{c.branches.length > 1 ? "es" : ""}</span>}
                  {c.employees.length > 0 && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3 text-blue-600" />{c.employees.length} team</span>}
                </div>
              </CardContent>
            </Card>
          ))}
          {(data.unplaced?.clients > 0 || data.unplaced?.employees > 0) && (
            <p className="text-xs text-gray-400 px-1" data-testid="map-unplaced">
              Not on the map (no city set): {[data.unplaced.clients && `${data.unplaced.clients} client${data.unplaced.clients > 1 ? "s" : ""}`, data.unplaced.employees && `${data.unplaced.employees} team`].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>

      {/* Branch management */}
      <BranchManager onChanged={loadMap} onLocate={(b) => b.lat && mapRef.current?.flyTo([b.lat, b.lng], 12, { duration: 0.8 })} />
    </div>
  );
}

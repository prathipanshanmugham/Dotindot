import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Building2, UserCheck, Globe2 } from "lucide-react";

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
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Building2, UserCheck, MapPin } from "lucide-react";

// The map covers India only. Places abroad are listed by country on the "Outside India" tab instead.
const INDIA = L.latLngBounds([6.4, 68.0], [37.6, 97.6]);
const ROOM = L.latLngBounds([2.0, 60.0], [41.0, 104.0]);   // a little slack so pins near the edge aren't hidden

export const LAYERS = [
  { key: "clients", label: "Clients", color: "#F26B21", icon: Users },
  { key: "branches", label: "Locations", color: "#1F2937", icon: Building2 },
  { key: "team", label: "Team", color: "#2563EB", icon: UserCheck },
];

const BUILDING_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4M10 10h4M10 14h4M10 18h4"/></svg>';
const branchIcon = (exact) => L.divIcon({
  className: "",
  html: `<div style="background:${exact ? "#1F2937" : "#fff"};color:${exact ? "#fff" : "#1F2937"};width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);border:${exact ? "2px solid #fff" : "2px dashed #1F2937"};"><span style="transform:rotate(45deg);display:flex">${BUILDING_SVG}</span></div>`,
  iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
});
const cityIcon = (clients, team) => {
  const seg = (n, bg) => (n ? `<span style="background:${bg};color:#fff;padding:0 7px;line-height:22px;font-weight:700">${n}</span>` : "");
  const html = `<div style="display:inline-flex;border-radius:11px;overflow:hidden;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);font:11px Inter,sans-serif;transform:translate(-50%,-50%);white-space:nowrap">${seg(clients, "#F26B21")}${seg(team, "#2563EB")}</div>`;
  return L.divIcon({ className: "", html, iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -12] });
};

/** India map: locations at their pin, clients and team counted at their city's centre. */
export default function IndiaMap({ india, focus }) {
  const mapRef = useRef(null);
  const wrapRef = useRef(null);
  const [on, setOn] = useState({ clients: true, branches: true, team: true });
  const cities = useMemo(() => india.cities || [], [india]);
  const pins = useMemo(() => india.pins || [], [india]);
  const totals = {
    clients: cities.reduce((a, c) => a + c.clients.length, 0),
    branches: pins.length,
    team: cities.reduce((a, c) => a + c.team.length, 0),
  };

  // fit to what's on the map (inside India), or all of India when there's nothing yet
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const pts = [...cities.map((c) => [c.lat, c.lng]), ...pins.map((b) => [b.lat, b.lng])].filter(([a, b]) => INDIA.contains([a, b]));
    if (!pts.length) m.fitBounds(INDIA);
    else if (pts.length === 1) m.setView(pts[0], 10);
    else m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 11 });
  }, [cities, pins]);

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo([focus.lat, focus.lng], 12, { duration: 0.8 });
  }, [focus]);

  useEffect(() => {   // keep Leaflet sized when the layout changes (tabs, rotation, resize)
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flyTo = (c) => mapRef.current?.flyTo([c.lat, c.lng], 11, { duration: 0.8 });

  return (
    <div className="space-y-3" data-testid="india-map-panel">
      <div className="flex flex-wrap items-center gap-2">
        {LAYERS.map((l) => (
          <button key={l.key} type="button" onClick={() => setOn((x) => ({ ...x, [l.key]: !x[l.key] }))} data-testid={`layer-toggle-${l.key}`}
            aria-pressed={on[l.key]}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${on[l.key] ? "border-transparent text-white shadow-sm" : "border-gray-200 bg-white text-gray-500"}`}
            style={on[l.key] ? { backgroundColor: l.color } : {}}>
            <l.icon className="h-3.5 w-3.5" />{l.label}
            <span className={`rounded-full px-1.5 text-[10px] font-bold ${on[l.key] ? "bg-white/25" : "bg-gray-100"}`}>{totals[l.key]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 min-w-0">
        <Card className="border-gray-200/80 shadow-sm overflow-hidden min-w-0">
          <CardContent className="p-0">
            <div ref={wrapRef} className="h-[58vh] min-h-[320px] lg:h-[calc(100vh-330px)] lg:min-h-[460px] map-wrapper" data-testid="locations-map">
              <MapContainer ref={mapRef} bounds={INDIA} maxBounds={ROOM} maxBoundsViscosity={0.9} minZoom={4} style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false} worldCopyJump={false}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" noWrap bounds={ROOM} />
                {cities.map((c) => {
                  const nc = on.clients ? c.clients.length : 0;
                  const ne = on.team ? c.team.length : 0;
                  if (!nc && !ne) return null;
                  return (
                    <Marker key={`city-${c.city}`} position={[c.lat, c.lng]} icon={cityIcon(nc, ne)}>
                      <Popup>
                        <div style={{ minWidth: 180, maxHeight: 240, overflowY: "auto" }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{c.city}{c.state ? `, ${c.state}` : ""}</div>
                          {nc > 0 && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Clients</div>}
                          {nc > 0 && c.clients.map((it) => (
                            <div key={it.id} style={{ fontSize: 12, padding: "2px 0" }}><Link to={`/clients/${it.id}`} style={{ color: "#C2410C", fontWeight: 600 }}>{it.name}</Link></div>
                          ))}
                          {ne > 0 && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>Team</div>}
                          {ne > 0 && c.team.map((it) => (
                            <div key={it.id} style={{ fontSize: 12, padding: "2px 0" }}><Link to={`/employees/${it.id}`} style={{ color: "#1D4ED8", fontWeight: 600 }}>{it.name}</Link>
                              <span style={{ color: "#6B7280", marginLeft: 6 }}>{it.designation}</span></div>
                          ))}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
                {on.branches && pins.map((b) => (
                  <Marker key={`branch-${b.id}`} position={[b.lat, b.lng]} icon={branchIcon(b.pin === "exact")} zIndexOffset={500}>
                    <Popup>
                      <div style={{ minWidth: 170 }}>
                        <div style={{ fontWeight: 700 }}>{b.name}</div>
                        <div style={{ fontSize: 12, color: "#6B7280" }}>{b.address || b.city}</div>
                        {b.ceo && <div style={{ fontSize: 12, color: "#6B7280" }}>Location CEO: {b.ceo}</div>}
                        <div style={{ fontSize: 11, marginTop: 4, color: b.pin === "exact" ? "#047857" : "#B45309", fontWeight: 600 }}>{b.pin === "exact" ? "Exact office pin" : "Approximate — city centre"}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2 lg:overflow-y-auto lg:max-h-[calc(100vh-330px)] min-w-0" data-testid="map-city-list">
          {cities.length === 0 && <p className="text-sm text-gray-400 px-1">No clients, team or locations with a city in India yet.</p>}
          {cities.map((c) => (
            <button type="button" key={c.city} onClick={() => flyTo(c.branches.find((b) => b.lat != null) || c)}
              className="w-full text-left rounded-xl border border-gray-200 bg-white px-3.5 py-3 hover:border-[#F26B21]/50 transition-colors"
              data-testid={`city-card-${c.city.replace(/\s+/g, "-").toLowerCase()}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 text-sm truncate flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />{c.city}</span>
                <span className="text-[11px] text-gray-400 truncate">{c.state}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                {c.clients.length > 0 && <span className="flex items-center gap-1"><Users className="h-3 w-3 text-[#F26B21]" />{c.clients.length} client{c.clients.length > 1 ? "s" : ""}</span>}
                {c.branches.length > 0 && <span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-700" />{c.branches.length} location{c.branches.length > 1 ? "s" : ""}</span>}
                {c.team.length > 0 && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3 text-blue-600" />{c.team.length} team</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500">Locations sit on their office pin. Clients and team show at their city's centre. Places outside India aren't on this map — see Outside India.</p>
    </div>
  );
}

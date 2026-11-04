import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, LocateFixed, Link2, CheckCircle2, AlertTriangle } from "lucide-react";

let coordCache = null;
const pinIcon = (exact) => L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:${exact ? "#F26B21" : "#fff"};border:${exact ? "2px solid #fff" : "3px dashed #F26B21"};box-shadow:0 2px 6px rgba(0,0,0,.35);transform:rotate(-45deg)"></div>`,
  iconSize: [20, 20], iconAnchor: [10, 20],
});

const Recenter = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => { if (lat != null) map.setView([lat, lng], Math.max(map.getZoom(), 13)); }, [lat, lng, map]);
  return null;
};

/**
 * Branch pin editor. Starts at the city's centre (marked approximate). Make it exact by:
 *  - "Use my location" while standing in the office (GPS),
 *  - pasting a Google Maps link or "lat, lng",
 *  - dragging the pin.
 * onChange(lat, lng, source) where source is "exact" | "city".
 */
export const PinPicker = ({ city, lat, lng, source, onChange }) => {
  const [coords, setCoords] = useState(coordCache);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState("");
  const markerRef = useRef(null);

  useEffect(() => {
    if (coordCache) return;
    api.get("/locations/geo").then((r) => { coordCache = r.data.city_coords || {}; setCoords(coordCache); }).catch(() => {});
  }, []);

  const centre = useMemo(() => {
    const c = coords && coords[city];
    return c ? [c.lat, c.lng] : null;
  }, [coords, city]);

  useEffect(() => {
    if (lat == null && centre) onChange(centre[0], centre[1], "city");
  }, [centre, lat, onChange]);

  const locateMe = () => {
    if (!navigator.geolocation) return toast.error("This browser can't share location");
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy("");
        onChange(+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6), "exact");
        toast.success(`Pinned to your location (±${Math.round(p.coords.accuracy)} m)`);
      },
      (e) => { setBusy(""); toast.error(e.code === 1 ? "Location permission was blocked — allow it in the browser and try again" : "Couldn't get your location — try again outdoors or paste the map link"); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const applyPaste = async () => {
    if (!paste.trim()) return;
    setBusy("paste");
    try {
      const { data } = await api.post("/locations/parse-pin", { text: paste.trim() });
      onChange(data.lat, data.lng, "exact");
      setPaste("");
      toast.success("Pin set from the link");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(""); }
  };

  const pos = lat != null ? [lat, lng] : centre;
  const exact = source === "exact";
  return (
    <div className="space-y-2" data-testid="pin-picker">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {pos ? (
          exact ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700" data-testid="pin-picker-exact"><CheckCircle2 className="h-3.5 w-3.5" /> Exact pin</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700" data-testid="pin-picker-approx"><AlertTriangle className="h-3.5 w-3.5" /> City centre only — set the exact spot below</span>
          )
        ) : (
          <span className="inline-flex items-center gap-1.5 text-gray-400" data-testid="pin-picker-empty"><MapPin className="h-3.5 w-3.5" /> Pick the city, then set the exact spot</span>
        )}
        {pos && <span className="font-mono text-gray-500" data-testid="pin-picker-coords">{pos[0].toFixed(5)}, {pos[1].toFixed(5)}</span>}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button type="button" variant="outline" size="sm" onClick={locateMe} disabled={busy === "gps"} className="shrink-0" data-testid="pin-use-gps">
          <LocateFixed className="h-3.5 w-3.5 mr-1.5" /> {busy === "gps" ? "Locating…" : "Use my location"}
        </Button>
        <div className="flex gap-2 flex-1 min-w-0">
          <Input value={paste} onChange={(e) => setPaste(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyPaste())}
            placeholder="Paste Google Maps link or 11.3410, 77.7172" className="h-9 text-xs min-w-0" data-testid="pin-paste-input" />
          <Button type="button" variant="outline" size="sm" onClick={applyPaste} disabled={!paste.trim() || busy === "paste"} className="shrink-0" data-testid="pin-paste-btn">
            <Link2 className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Set</span>
          </Button>
        </div>
      </div>
      {pos && (
        <div className="h-48 rounded-lg overflow-hidden border border-gray-200">
          <MapContainer center={pos} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <Recenter lat={pos[0]} lng={pos[1]} />
            <Marker ref={markerRef} position={pos} icon={pinIcon(exact)} draggable
              eventHandlers={{ dragend: () => { const p = markerRef.current?.getLatLng(); if (p) onChange(+p.lat.toFixed(6), +p.lng.toFixed(6), "exact"); } }} />
          </MapContainer>
        </div>
      )}
      <p className="text-[11px] text-gray-400">Tip: stand in the office and tap <span className="font-semibold">Use my location</span>, or drag the pin. Attendance uses this pin to tell if someone checked in at the office.</p>
    </div>
  );
};

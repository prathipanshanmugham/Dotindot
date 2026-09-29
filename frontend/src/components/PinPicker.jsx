import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import api from "@/lib/api";
import { MapPin } from "lucide-react";

let coordCache = null;
const pinIcon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#F26B21;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transform:rotate(-45deg)"></div>',
  iconSize: [18, 18], iconAnchor: [9, 18],
});

const Recenter = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => { if (lat != null) map.setView([lat, lng], Math.max(map.getZoom(), 11)); }, [lat, lng, map]);
  return null;
};

// Mini-map with a draggable pin; auto-seeded from the city dataset, fine-tune by dragging.
export const PinPicker = ({ city, state, lat, lng, onChange }) => {
  const [coords, setCoords] = useState(coordCache);
  const markerRef = useRef(null);

  useEffect(() => {
    if (coordCache) return;
    api.get("/locations/geo").then((r) => { coordCache = r.data.city_coords || {}; setCoords(coordCache); }).catch(() => {});
  }, []);

  const auto = useMemo(() => {
    if (!coords) return null;
    const c = coords[city] || (state && coords[`__capital__${state}`]);
    return c ? [c.lat, c.lng] : null;
  }, [coords, city, state]);

  useEffect(() => {
    if (lat == null && auto) onChange(auto[0], auto[1]);
  }, [auto, lat, onChange]);

  const pos = lat != null ? [lat, lng] : auto;
  if (!pos) return <p className="text-xs text-gray-400 flex items-center gap-1.5" data-testid="pin-picker-empty"><MapPin className="h-3.5 w-3.5" /> Pick a state and city to preview the map pin.</p>;

  return (
    <div className="space-y-1.5" data-testid="pin-picker">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#F26B21]" /> Drag the pin to fine-tune the exact spot</span>
        <span className="font-mono" data-testid="pin-picker-coords">{pos[0].toFixed(4)}, {pos[1].toFixed(4)}</span>
      </div>
      <div className="h-44 rounded-lg overflow-hidden border border-gray-200">
        <MapContainer center={pos} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Recenter lat={pos[0]} lng={pos[1]} />
          <Marker ref={markerRef} position={pos} icon={pinIcon} draggable
            eventHandlers={{ dragend: () => { const p = markerRef.current?.getLatLng(); if (p) onChange(+p.lat.toFixed(6), +p.lng.toFixed(6)); } }} />
        </MapContainer>
      </div>
    </div>
  );
};

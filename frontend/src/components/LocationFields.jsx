import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Combo } from "@/components/Combo";

let geoCache = null;
let geoWait = null;

/** Countries, Indian states and their cities (for dropdowns). */
export const useGeo = () => {
  const [geo, setGeo] = useState(geoCache);
  useEffect(() => {
    if (geoCache) return;
    let live = true;
    geoWait = geoWait || api.get("/locations/geo").then((r) => { geoCache = r.data; return r.data; }).catch(() => { geoWait = null; return null; });
    geoWait.then((g) => live && g && setGeo(g));
    return () => { live = false; };
  }, []);
  return geo;
};

// Country -> State -> City cascading pickers. India uses the static dataset; others free-text.
export const LocationFields = ({ country, state, city, onChange, prefix = "loc", compact }) => {
  const [geo, setGeo] = useState(geoCache);

  useEffect(() => {
    if (geoCache) return;
    api.get("/locations/geo").then((r) => { geoCache = r.data; setGeo(r.data); }).catch(() => {});
  }, []);

  const countries = geo?.countries || ["India"];
  const states = country === "India" ? Object.keys(geo?.india_states || {}).sort() : [];
  const cities = country === "India" && state ? (geo?.india_states?.[state] || []) : [];
  const isIndia = country === "India";

  return (
    <>
      <div className="space-y-1">
        <Label>Country</Label>
        <Combo value={country} placeholder="Select country" options={countries} testid={`${prefix}-country`}
          onChange={(v) => onChange({ country: v, state: "", city: "" })} />
      </div>
      <div className="space-y-1">
        <Label>State / UT</Label>
        {isIndia ? (
          <Combo value={state} placeholder={states.length ? "Select state" : "Loading…"} options={states} testid={`${prefix}-state`}
            disabled={!states.length} onChange={(v) => onChange({ country, state: v, city: "" })} />
        ) : (
          <Input value={state || ""} placeholder="State / province" data-testid={`${prefix}-state`}
            onChange={(e) => onChange({ country, state: e.target.value, city })} />
        )}
      </div>
      <div className={`space-y-1 ${compact ? "" : "col-span-2 sm:col-span-1"}`}>
        <Label>City</Label>
        {isIndia ? (
          <Combo value={city} placeholder={state ? "Select or type city" : "Pick a state first"} options={cities} allowCustom
            disabled={!state} testid={`${prefix}-city`} onChange={(v) => onChange({ country, state, city: v })} />
        ) : (
          <Input value={city || ""} placeholder="City" data-testid={`${prefix}-city`}
            onChange={(e) => onChange({ country, state, city: e.target.value })} />
        )}
      </div>
    </>
  );
};

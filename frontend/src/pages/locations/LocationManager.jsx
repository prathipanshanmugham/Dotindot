import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import { LocationFields } from "@/components/LocationFields";
import { PinPicker } from "@/components/PinPicker";
import { Pill } from "@/components/kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2, Globe2, Mail, Phone, Crown } from "lucide-react";

const EMPTY = { name: "", city: "", state: "", country: "India", address: "", head_name: "", manager_id: null, contact_email: "", contact_phone: "",
  status: "active", lat: null, lng: null, pin_source: null };

const PinNote = ({ b }) => {
  if (b.country && b.country !== "India") return <span className="inline-flex items-center gap-1 text-[11px] text-gray-500"><Globe2 className="h-3 w-3" /> Outside India · no map</span>;
  return b.pin_source === "exact"
    ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700" data-testid={`branch-pin-exact-${b.id}`}><CheckCircle2 className="h-3 w-3" /> Exact pin</span>
    : <span className="inline-flex items-center gap-1 text-[11px] text-amber-700" data-testid={`branch-pin-approx-${b.id}`}><AlertTriangle className="h-3 w-3" /> {b.lat == null ? "No pin" : "City centre pin"}</span>;
};

/** Add, edit and remove locations. Table on wide screens, cards on phones. */
export default function LocationManager({ onChanged, openNewSignal }) {
  const { user } = useAuth();
  const isAdmin = ["super_admin", "admin"].includes(user?.role);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api.get("/locations/branches").then((r) => setRows(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (open) api.get("/users/team").then((r) => setPeople(r.data)).catch(() => {}); }, [open]);
  const del = useRecordDelete({ coll: "branches", permKey: "locations.delete", rows, onDeleted: () => { load(); onChanged?.(); } });

  const openNew = useCallback(() => { setEditing(null); setForm(EMPTY); setOpen(true); }, []);
  useEffect(() => { if (openNewSignal) openNew(); }, [openNewSignal, openNew]);
  const openEdit = (b) => {
    setEditing(b);
    setForm({ name: b.name || "", city: b.city || "", state: b.state || "", country: b.country || "India", address: b.address || "", head_name: b.head_name || "",
      manager_id: b.manager_id || null, contact_email: b.contact_email || "", contact_phone: b.contact_phone || "", status: b.status || "active",
      lat: b.lat ?? null, lng: b.lng ?? null, pin_source: b.pin_source || null });
    setOpen(true);
  };
  const pinChange = useCallback((lat, lng, pin_source) => setForm((f) => ({ ...f, lat, lng, pin_source })), []);
  const india = (form.country || "India") === "India";

  const save = async () => {
    if (!form.name.trim() || !form.city) return toast.error("Give the location a name and pick its city");
    setBusy(true);
    try {
      if (editing) await api.put(`/locations/branches/${editing.id}`, form);
      else await api.post("/locations/branches", form);
      toast.success(editing ? `${form.name} saved` : `${form.name} added`);
      setOpen(false);
      load();
      onChanged?.();
      window.dispatchEvent(new Event("records-changed"));   // location pickers elsewhere refresh
    } catch (e) { toast.error(apiError(e)); }
    setBusy(false);
  };
  const remove = async (b) => {
    try { await api.delete(`/locations/branches/${b.id}`); toast.success(`${b.name} deleted`); load(); onChanged?.(); window.dispatchEvent(new Event("records-changed")); }
    catch (e) { toast.error(apiError(e)); }
  };

  const needPin = rows.filter((b) => (b.country || "India") === "India" && b.pin_source !== "exact");

  return (
    <div className="space-y-4" data-testid="branch-manager">
      {needPin.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-3" data-testid="pins-need-fix">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p><span className="font-semibold">{needPin.length === 1 ? "1 location is" : `${needPin.length} locations are`} pinned at the city centre, not the office:</span> {needPin.map((b) => b.name).join(", ")}.
            <span className="text-amber-800"> Edit it and tap <b>Use my location</b> at the office, or paste its Google Maps link. Attendance uses this pin.</span></p>
        </div>
      )}

      <Card className="border-gray-200/80 shadow-sm">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3 gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 whitespace-nowrap"><Building2 className="h-4 w-4 text-[#F26B21]" /> All locations <span className="text-gray-400 font-normal text-sm">{rows.length}</span></CardTitle>
          <div className="flex items-center gap-2">
            {del.canDelete && <><BulkDeleteBar kit={del} />{del.dialog}</>}
            {isAdmin && <Button size="sm" variant="outline" onClick={openNew} className="hidden sm:inline-flex" data-testid="add-branch-btn"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add location</Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 && <p className="text-center py-10 text-sm text-gray-400">No locations yet.</p>}

          {/* phones: cards */}
          <div className="md:hidden divide-y divide-gray-100" data-testid="branch-cards">
            {rows.map((b) => (
              <div key={b.id} className="px-4 py-3.5 flex gap-3" data-testid={`branch-card-${b.id}`}>
                {del.canDelete && <div className="pt-0.5"><RowDeleteControls kit={del} row={b} /></div>}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-gray-900 [overflow-wrap:anywhere]">{b.name}</div>
                    <Pill tone={b.status === "active" ? "green" : "gray"}>{b.status === "active" ? "Active" : "Inactive"}</Pill>
                  </div>
                  <div className="text-xs text-gray-600">{[b.city, b.state, b.country].filter(Boolean).join(", ")}</div>
                  <PinNote b={b} />
                  {b.manager_name && <div className="text-xs text-gray-600 flex items-center gap-1"><Crown className="h-3 w-3 text-[#F26B21]" /> {b.manager_name}</div>}
                  {(b.contact_email || b.contact_phone) && (
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      {b.contact_email && <a href={`mailto:${b.contact_email}`} className="inline-flex items-center gap-1 [overflow-wrap:anywhere]"><Mail className="h-3 w-3" />{b.contact_email}</a>}
                      {b.contact_phone && <a href={`tel:${b.contact_phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{b.contact_phone}</a>}
                    </div>
                  )}
                  {isAdmin && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(b)} data-testid={`edit-branch-m-${b.id}`}><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>
                      {!del.canDelete && <Button size="sm" variant="ghost" className="h-8 text-gray-500" onClick={() => remove(b)}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* wider screens: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/70">
                  {del.canDelete && <TableHead className="w-12" />}
                  <TableHead>Location</TableHead>
                  <TableHead>Place</TableHead>
                  <TableHead>Location CEO</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow key={b.id} data-testid={`branch-row-${b.id}`}>
                    {del.canDelete && <TableCell className="w-12"><RowDeleteControls kit={del} row={b} /></TableCell>}
                    <TableCell><div className="font-semibold text-gray-900">{b.name}</div>{b.address && <div className="text-xs text-gray-400 max-w-[260px] truncate">{b.address}</div>}</TableCell>
                    <TableCell className="text-sm text-gray-600">{[b.city, b.country].filter(Boolean).join(", ")}<div className="mt-0.5"><PinNote b={b} /></div></TableCell>
                    <TableCell className="text-sm text-gray-700">{b.manager_name || <span className="text-gray-300">—</span>}</TableCell>
                    <TableCell className="text-xs text-gray-500">{b.contact_email || "—"}{b.contact_phone ? ` · ${b.contact_phone}` : ""}</TableCell>
                    <TableCell><Pill tone={b.status === "active" ? "green" : "gray"}>{b.status === "active" ? "Active" : "Inactive"}</Pill></TableCell>
                    {isAdmin && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)} data-testid={`edit-branch-${b.id}`} aria-label={`Edit ${b.name}`}><Pencil className="h-3.5 w-3.5 text-gray-500" /></Button>
                        {!del.canDelete && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(b)} data-testid={`delete-branch-${b.id}`} aria-label={`Delete ${b.name}`}><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" /></Button>}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="branch-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New location"}</DialogTitle>
            <DialogDescription>An office of ours. Clients, projects, leads and people can be filed under it.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Dotindot Chennai" data-testid="branch-form-name" /></div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <LocationFields country={form.country} state={form.state} city={form.city} prefix="branch-form" compact
                onChange={(v) => setForm((f) => ({ ...f, ...v, ...((v.city !== undefined && v.city !== f.city) || (v.country !== undefined && v.country !== f.country) ? { lat: null, lng: null, pin_source: null } : {}) }))} />
            </div>
            <div className="sm:col-span-2"><PinPicker city={form.city} lat={form.lat} lng={form.lng} source={form.pin_source} onChange={pinChange} showMap={india} /></div>
            <div className="sm:col-span-2 space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} data-testid="branch-form-address" /></div>
            <div className="space-y-1">
              <Label>Location CEO</Label>
              <Select value={form.manager_id || "__none"} onValueChange={(v) => setForm((f) => ({ ...f, manager_id: v === "__none" ? "" : v }))}>
                <SelectTrigger data-testid="branch-form-ceo"><SelectValue placeholder="Pick a person" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No CEO yet{!form.manager_id && form.head_name ? ` (was “${form.head_name}”)` : ""}</SelectItem>
                  {form.manager_id && !people.some((p) => p.id === form.manager_id) && <SelectItem value={form.manager_id}>{form.head_name || "Current CEO"}</SelectItem>}
                  {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">Gets the CEO report for this location.</p>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="branch-form-status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Contact email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} data-testid="branch-form-email" /></div>
            <div className="space-y-1"><Label>Contact phone</Label><Input type="tel" value={form.contact_phone} onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))} data-testid="branch-form-phone" /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="branch-form-save">{busy ? "Saving…" : editing ? "Save changes" : "Add location"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

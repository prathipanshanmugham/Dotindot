import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { labelize, ROLE_LABELS } from "@/components/Badges";
import ExportMenu from "@/components/ExportMenu";
import MultiSelect from "@/components/MultiSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Network, ListTree, Plus, Minus, Maximize2, Pencil, Trash2, Search, ChevronRight, ChevronDown, CheckCircle2, Target, Users, Sparkles, UserPlus,
  MapPin, Building2,
} from "lucide-react";

// ---------- layout constants ----------
const W = 216; // node width
const H = 84; // node height
const XSTEP = 272;
const YSTEP = 100;
const BRANCH_COLORS = ["#F26B21", "#2563EB", "#059669", "#7C3AED", "#DB2777", "#0891B2", "#CA8A04", "#4B5563"];
const initialsOf = (n) => (n || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// ---------- v2.8 location views ----------
// People carry their home branch_id; boxes can be tagged to a location (branch_id) or be company-wide.
export const NO_LOC = "_none";
const personAt = (p, loc) => (loc === NO_LOC ? !p.branch_id : p.branch_id === loc);
const personAtLoc = personAt;
const nodeAt = (n, loc) =>
  loc === NO_LOC
    ? (!n.branch_id && n.kind === "role" && !(n.people || []).length) || (n.people || []).some((p) => !p.branch_id)
    : n.branch_id === loc || (n.people || []).some((p) => p.branch_id === loc);

/** The chart as seen from one location: boxes there (or holding people there) plus everything above them. */
export function pruneForLocation(nodes, loc) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const keep = new Set();
  nodes.forEach((n) => {
    if (!nodeAt(n, loc)) return;
    let cur = n;
    while (cur && !keep.has(cur.id)) { keep.add(cur.id); cur = byId[cur.parent_id]; }
  });
  return nodes.filter((n) => keep.has(n.id)).map((n) => {
    if (!n.parent_id || !byId[n.parent_id]) return n; // the top box (CEO) is shown as-is
    const people = (n.people || []).filter((p) => personAt(p, loc));
    return { ...n, people, person_ids: people.map((p) => p.id) };
  });
}

/** Company → one box per location → that location's departments, roles and people. */
export function locationTree(nodes, branches, includeUnlocated = true) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => !n.parent_id || !byId[n.parent_id]);
  const root = roots[0];
  if (!root) return [];
  const rootIds = new Set(roots.map((r) => r.id));
  const out = [{ ...root }];
  const groups = includeUnlocated ? [...branches, { id: NO_LOC, name: "No location set", city: "", headcount: null }] : branches;
  groups.forEach((b, i) => {
    const pruned = pruneForLocation(nodes, b.id).filter((n) => !rootIds.has(n.id));
    if (b.id === NO_LOC && !pruned.length) return;
    const locId = `loc::${b.id}`;
    out.push({ id: locId, kind: "location", title: b.name, parent_id: root.id, people: [], person_ids: [], responsibilities: [], kpis: [],
      order: b.id === NO_LOC ? 999 : i, branch: b });
    pruned.forEach((n) => out.push({
      ...n, id: `${b.id}::${n.id}`, ref_id: n.id,
      parent_id: !n.parent_id || rootIds.has(n.parent_id) || !byId[n.parent_id] ? locId : `${b.id}::${n.parent_id}`,
    }));
  });
  return out;
}

// Bilateral mind-map layout: top-level branches alternate right/left of the root, each side laid out as a tidy tree.
function useLayout(nodes, collapsed) {
  return useMemo(() => {
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const kids = {};
    nodes.forEach((n) => {
      const p = n.parent_id && byId[n.parent_id] ? n.parent_id : null;
      (kids[p] = kids[p] || []).push(n);
    });
    Object.values(kids).forEach((arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title)));
    const roots = kids[null] || [];
    const pos = {};
    const color = {};
    const visibleKids = (id) => (collapsed[id] ? [] : kids[id] || []);
    const leafCount = (id) => { const k = visibleKids(id); return k.length ? k.reduce((s, c) => s + leafCount(c.id), 0) : 1; };
    const descendants = (id) => (kids[id] || []).reduce((s, c) => s + 1 + descendants(c.id), 0);

    let offsetY = 0;
    roots.forEach((root, ri) => {
      color[root.id] = BRANCH_COLORS[0];
      const top = visibleKids(root.id);
      // split branches into two balanced sides
      const sides = { 1: [], [-1]: [] };
      let r = 0, l = 0;
      top.forEach((c) => { const w = leafCount(c.id); if (r <= l) { sides[1].push(c); r += w; } else { sides[-1].push(c); l += w; } });
      top.forEach((c, i) => {
        const col = BRANCH_COLORS[(i % (BRANCH_COLORS.length - 1)) + 1];
        const paint = (n) => { color[n.id] = col; (kids[n.id] || []).forEach(paint); };
        paint(c);
      });
      let maxSpan = 1;
      [1, -1].forEach((dir) => {
        let cursor = 0;
        const local = {};
        const place = (n, depth) => {
          const k = visibleKids(n.id);
          let y;
          if (!k.length) { y = cursor; cursor += 1; } else { k.forEach((c) => place(c, depth + 1)); y = (local[k[0].id].y + local[k[k.length - 1].id].y) / 2; }
          local[n.id] = { x: dir * depth * XSTEP, y };
        };
        sides[dir].forEach((c) => place(c, 1));
        const mid = (cursor - 1) / 2;
        Object.entries(local).forEach(([id, p]) => { pos[id] = { x: p.x, y: (p.y - mid) * YSTEP + offsetY, dir }; });
        maxSpan = Math.max(maxSpan, cursor);
      });
      pos[root.id] = { x: 0, y: offsetY, dir: 0 };
      offsetY += (maxSpan + 1) * YSTEP;
      if (ri === 0) color[root.id] = BRANCH_COLORS[0];
    });

    const edges = [];
    nodes.forEach((n) => {
      if (!n.parent_id || !pos[n.id] || !pos[n.parent_id]) return;
      const p = pos[n.parent_id];
      const c = pos[n.id];
      const right = c.x >= p.x;
      const x1 = p.x + (right ? W / 2 : -W / 2);
      const x2 = c.x + (right ? -W / 2 : W / 2);
      const mx = (x1 + x2) / 2;
      edges.push({ id: n.id, d: `M ${x1} ${p.y} C ${mx} ${p.y}, ${mx} ${c.y}, ${x2} ${c.y}`, color: color[n.id] });
    });
    const xs = Object.values(pos).map((p) => p.x);
    const ys = Object.values(pos).map((p) => p.y);
    const bounds = xs.length ? { minX: Math.min(...xs) - W / 2, maxX: Math.max(...xs) + W / 2, minY: Math.min(...ys) - H / 2, maxY: Math.max(...ys) + H / 2 } : null;
    const subtree = (id) => {
      let roles = 0;
      const people = new Set();
      const walk = (nid) => (kids[nid] || []).forEach((c) => { roles += 1; (c.person_ids || []).forEach((p) => people.add(p)); walk(c.id); });
      walk(id);
      return { roles, people: people.size };
    };
    return { byId, kids, roots, pos, color, edges, bounds, descendants, subtree };
  }, [nodes, collapsed]);
}

// ---------- node card ----------
const NodeCard = ({ n, color, isRoot, selected, highlighted, hiddenCount, onToggle, hasKids, collapsed, onSelect, side, sub }) => {
  const vacant = n.kind === "role" && (n.people || []).length === 0;
  const base = isRoot
    ? "bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white border-transparent"
    : n.kind === "department" ? "bg-white text-gray-900" : "bg-white text-gray-900";
  return (
    <div className="absolute" style={{ left: -W / 2, top: -H / 2, width: W, height: H }}>
      <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(n.id); }}
        className={`group h-full w-full rounded-xl border text-left px-3 py-2 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F26B21] ${base} ${selected ? "ring-2 ring-[#F26B21] ring-offset-2" : ""} ${highlighted ? "outline outline-2 outline-offset-2 outline-amber-400" : ""}`}
        style={!isRoot ? { borderColor: ["department", "location"].includes(n.kind) ? color : "#E5E7EB", borderLeftWidth: ["department", "location"].includes(n.kind) ? 4 : 1, borderLeftColor: color, ...(n.kind === "location" ? { background: `${color}0D` } : {}) } : undefined}
        data-testid={`org-node-${n.id}`}>
        <div className="flex items-center gap-1.5">
          {!isRoot && (n.kind === "location" ? <MapPin className="h-3 w-3 shrink-0" style={{ color }} /> : <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />)}
          <span className={`text-[10px] font-bold uppercase tracking-widest ${isRoot ? "text-white/80" : "text-gray-400"}`}>{labelize(n.kind)}</span>
          {vacant && <span className="ml-auto rounded-full bg-amber-50 border border-amber-200 px-1.5 text-[9px] font-semibold text-amber-700">Vacant</span>}
        </div>
        <div className={`mt-0.5 text-sm font-semibold leading-tight line-clamp-1 ${isRoot ? "text-white" : "text-gray-900"}`}>{n.title}</div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="flex">
            {(n.people || []).slice(0, 3).map((p, i) => (
              <span key={p.id} title={p.name} className={`h-6 w-6 rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ${isRoot ? "bg-white text-[#F26B21] ring-[#F7893A]" : "bg-gray-900 text-white ring-white"} ${i ? "-ml-1.5" : ""}`}>{initialsOf(p.name)}</span>
            ))}
          </div>
          <span className={`text-[11px] truncate ${isRoot ? "text-white/90" : "text-gray-500"}`}>
            {n.kind === "location" ? `${n.branch?.city ? n.branch.city + " · " : ""}${sub ? sub.people : 0} ${sub && sub.people === 1 ? "person" : "people"}`
              : (n.people || []).length === 1 ? n.people[0].name : (n.people || []).length > 1 ? `${n.people.length} people` : sub && sub.roles ? `${sub.roles} role${sub.roles > 1 ? "s" : ""} · ${sub.people} ${sub.people === 1 ? "person" : "people"}` : ""}
          </span>
        </div>
      </button>
      {hasKids && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(n.id); }}
          className="absolute top-1/2 -translate-y-1/2 h-6 min-w-6 px-1 rounded-full bg-white border text-[10px] font-bold text-gray-600 flex items-center justify-center shadow-sm hover:border-[#F26B21] hover:text-[#F26B21]"
          style={side === -1 ? { left: -12 } : { right: -12 }}
          aria-label={collapsed ? "Expand" : "Collapse"} data-testid={`org-toggle-${n.id}`}>
          {collapsed ? `+${hiddenCount}` : "–"}
        </button>
      )}
    </div>
  );
};

// ---------- pan & zoom canvas ----------
function MindMap({ layout, nodes, selectedId, onSelect, collapsed, onToggle, highlight, focusKey }) {
  const boxRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef(null);
  const movedRef = useRef(false);
  const pointers = useRef(new Map());

  const fit = useCallback(() => {
    const el = boxRef.current;
    if (!el || !layout.bounds) return;
    const { minX, maxX, minY, maxY } = layout.bounds;
    const pad = 48;
    const k = Math.min(1.1, Math.max(0.3, Math.min((el.clientWidth - pad) / (maxX - minX), (el.clientHeight - pad) / (maxY - minY))));
    setView({ k, x: el.clientWidth / 2 - ((minX + maxX) / 2) * k, y: el.clientHeight / 2 - ((minY + maxY) / 2) * k });
  }, [layout.bounds]);

  useEffect(() => { fit(); }, [fit, nodes.length]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  useEffect(() => {
    const focusId = focusKey ? focusKey.split(":")[0] : null;
    if (!focusId || !layout.pos[focusId] || !boxRef.current) return;
    const el = boxRef.current;
    const p = layout.pos[focusId];
    setView((v) => ({ ...v, x: el.clientWidth / 2 - p.x * v.k, y: el.clientHeight / 2 - p.y * v.k }));
  }, [focusKey, layout.pos]);

  const zoomAt = (factor, cx, cy) => setView((v) => {
    const k = Math.min(2.2, Math.max(0.25, v.k * factor));
    const f = k / v.k;
    return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
  });
  const zoomCenter = (factor) => { const el = boxRef.current; zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2); };

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 40 && e.deltaMode === 0 && !e.shiftKey) {
      // trackpad two-finger scroll pans
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      return;
    }
    const r = boxRef.current.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  };
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const stop = (e) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    return () => el.removeEventListener("wheel", stop);
  }, []);

  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) { movedRef.current = false; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)[1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      const r = boxRef.current.getBoundingClientRect();
      if (before > 0) zoomAt(after / before, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      movedRef.current = true;
      drag.current = null;
      return;
    }
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      drag.current.moved = true;
      movedRef.current = true;
      if (!boxRef.current.hasPointerCapture?.(e.pointerId)) boxRef.current.setPointerCapture?.(e.pointerId);
    }
    if (drag.current.moved) setView((v) => ({ ...v, x: drag.current.vx + dx, y: drag.current.vy + dy }));
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) drag.current = null;
  };

  return (
    <div className="relative">
      <div ref={boxRef}
        className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-xl border border-gray-200 bg-[#FBFBFA] touch-none select-none cursor-grab active:cursor-grabbing"
        style={{ backgroundImage: "radial-gradient(#E5E7EB 1px, transparent 1px)", backgroundSize: `${20 * view.k}px ${20 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        data-testid="org-mindmap">
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="absolute overflow-visible" style={{ left: 0, top: 0 }} width="1" height="1">
            {layout.edges.map((e) => <path key={e.id} d={e.d} fill="none" stroke={e.color} strokeOpacity="0.55" strokeWidth="2" />)}
          </svg>
          {nodes.filter((n) => layout.pos[n.id]).map((n) => {
            const p = layout.pos[n.id];
            const hasKids = (layout.kids[n.id] || []).length > 0;
            return (
              <div key={n.id} className="absolute" style={{ left: p.x, top: p.y }}>
                <NodeCard n={n} color={layout.color[n.id] || "#9CA3AF"} isRoot={!n.parent_id || !layout.byId[n.parent_id]} side={p.dir}
                  selected={selectedId === n.id} highlighted={highlight.has(n.id)} hasKids={hasKids} collapsed={!!collapsed[n.id]}
                  hiddenCount={layout.descendants(n.id)} sub={hasKids ? layout.subtree(n.id) : null} onToggle={onToggle} onSelect={(id) => { if (!movedRef.current) onSelect(id); }} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
        <Button size="icon" variant="outline" className="h-9 w-9 bg-white" onClick={() => zoomCenter(1.2)} aria-label="Zoom in" data-testid="org-zoom-in"><Plus className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" className="h-9 w-9 bg-white" onClick={() => zoomCenter(1 / 1.2)} aria-label="Zoom out" data-testid="org-zoom-out"><Minus className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" className="h-9 w-9 bg-white" onClick={fit} aria-label="Fit to screen" data-testid="org-fit"><Maximize2 className="h-4 w-4" /></Button>
      </div>
      <div className="absolute left-3 bottom-3 rounded-md bg-white/90 border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hidden sm:block">Drag to move · scroll or pinch to zoom · click a box for details</div>
    </div>
  );
}

// ---------- list (outline) view ----------
function OutlineView({ layout, selectedId, onSelect, collapsed, onToggle, highlight }) {
  const Row = ({ n, depth }) => {
    const kids = layout.kids[n.id] || [];
    const open = !collapsed[n.id];
    return (
      <>
        <div className={`flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-orange-50/50 ${selectedId === n.id ? "bg-orange-50" : ""} ${highlight.has(n.id) ? "ring-1 ring-amber-300" : ""}`}
          style={{ paddingLeft: 8 + depth * 18 }} data-testid={`org-row-${n.id}`}>
          {kids.length ? (
            <button type="button" onClick={() => onToggle(n.id)} className="h-7 w-7 -ml-1 flex items-center justify-center rounded text-gray-500 hover:text-gray-900 shrink-0" aria-label={open ? "Collapse" : "Expand"}>
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : <span className="w-6 shrink-0" />}
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: layout.color[n.id] || "#9CA3AF" }} />
          <button type="button" onClick={() => onSelect(n.id)} className="min-w-0 flex-1 text-left">
            <div className="text-sm font-semibold text-gray-900 truncate">{n.title}</div>
            <div className="text-xs text-gray-500 truncate">
              {labelize(n.kind)}{(n.people || []).length ? ` · ${n.people.map((p) => p.name).join(", ")}` : n.kind === "role" ? " · Vacant" : ""}
            </div>
          </button>
          {(n.responsibilities || []).length > 0 && <span className="text-[11px] text-gray-400 shrink-0 hidden sm:inline">{n.responsibilities.length} duties</span>}
        </div>
        {open && kids.map((c) => <Row key={c.id} n={c} depth={depth + 1} />)}
      </>
    );
  };
  return <Card className="border-gray-200/80"><CardContent className="p-2 sm:p-3" data-testid="org-outline">{layout.roots.map((r) => <Row key={r.id} n={r} depth={0} />)}</CardContent></Card>;
}

// ---------- node form ----------
function NodeFormDialog({ open, onOpenChange, node, parentId, nodes, kinds, team, onSaved, layout, branches = [], defaultBranch = "" }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(node ? {
      title: node.title, kind: node.kind, parent_id: node.parent_id || "", person_ids: node.person_ids || [],
      responsibilities: (node.responsibilities || []).join("\n"), kpis: (node.kpis || []).join("\n"), description: node.description || "",
      branch_id: node.branch_id || "",
    } : { title: "", kind: parentId ? "role" : "department", parent_id: parentId || "", person_ids: [], responsibilities: "", kpis: "", description: "",
      branch_id: defaultBranch || "" });
  }, [open, node, parentId, defaultBranch]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // a node can't report to itself or anything below it
  const blocked = useMemo(() => {
    if (!node) return new Set();
    const out = new Set([node.id]);
    const walk = (id) => (layout.kids[id] || []).forEach((c) => { out.add(c.id); walk(c.id); });
    walk(node.id);
    return out;
  }, [node, layout]);

  const save = async () => {
    if (!form.title?.trim()) return toast.error("Give it a title");
    setBusy(true);
    const body = {
      title: form.title.trim(), kind: form.kind, parent_id: form.parent_id || null, person_ids: form.person_ids,
      responsibilities: form.responsibilities.split("\n").map((s) => s.trim()).filter(Boolean),
      kpis: form.kpis.split("\n").map((s) => s.trim()).filter(Boolean), description: form.description,
      branch_id: form.branch_id || null,
    };
    try {
      if (node) await api.put(`/org/nodes/${node.id}`, body);
      else await api.post("/org/nodes", body);
      toast.success(node ? "Saved" : "Added to the chart");
      onOpenChange(false);
      onSaved();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="org-node-dialog">
        <DialogHeader><DialogTitle>{node ? `Edit ${node.title}` : "Add to the org chart"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1"><Label>Title *</Label><Input value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Content Writer" data-testid="org-form-title" /></div>
            <div className="space-y-1"><Label>Type</Label>
              <Select value={form.kind || "role"} onValueChange={(v) => set("kind", v)}>
                <SelectTrigger data-testid="org-form-kind"><SelectValue /></SelectTrigger>
                <SelectContent>{kinds.map((k) => <SelectItem key={k} value={k}>{labelize(k)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Reports to</Label>
            <Select value={form.parent_id || "none"} onValueChange={(v) => set("parent_id", v === "none" ? "" : v)}>
              <SelectTrigger data-testid="org-form-parent"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nobody (top of the chart)</SelectItem>
                {nodes.filter((n) => !blocked.has(n.id)).map((n) => <SelectItem key={n.id} value={n.id}>{n.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {branches.length > 0 && (
            <div className="space-y-1"><Label>Location</Label>
              <Select value={form.branch_id || "all"} onValueChange={(v) => set("branch_id", v === "all" ? "" : v)}>
                <SelectTrigger data-testid="org-form-location"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations (company-wide)</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}{b.city ? ` · ${b.city}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-400">Tag a role to a branch so it shows in that location's chart even while vacant.</p>
            </div>
          )}
          <div className="space-y-1"><Label>People in this role</Label>
            <MultiSelect options={team} value={form.person_ids || []} onChange={(v) => set("person_ids", v)} placeholder="Leave empty for a vacant role" testid="org-form-people" />
          </div>
          <div className="space-y-1"><Label>Responsibilities <span className="text-gray-400 font-normal">(one per line)</span></Label>
            <Textarea rows={4} value={form.responsibilities || ""} onChange={(e) => set("responsibilities", e.target.value)} placeholder={"Plans the content calendar\nApproves posts before publishing"} data-testid="org-form-resp" />
          </div>
          <div className="space-y-1"><Label>KPIs <span className="text-gray-400 font-normal">(one per line)</span></Label>
            <Textarea rows={2} value={form.kpis || ""} onChange={(e) => set("kpis", e.target.value)} placeholder="Engagement rate" data-testid="org-form-kpis" />
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={form.description || ""} onChange={(e) => set("description", e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={save} data-testid="org-form-save">{busy ? "Saving…" : node ? "Save" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- page ----------
const NO_COLLAPSE = {};
export default function OrgStructurePage() {
  const [data, setData] = useState(null);
  const [view, setView] = useState(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "list" : "map"));
  const [collapsed, setCollapsed] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [q, setQ] = useState("");
  const [focusId, setFocusId] = useState(null);
  const [form, setForm] = useState({ open: false, node: null, parentId: null });
  const [delTarget, setDelTarget] = useState(null);
  const [team, setTeam] = useState([]);
  const [busy, setBusy] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [loc, setLoc] = useState("all");

  const load = useCallback(() => api.get("/org/nodes").then((r) => setData(r.data)).catch(() => setData({ nodes: [], unassigned: [], kinds: [] })), []);
  useEffect(() => {
    load();
    api.get("/users/team").then((r) => setTeam(r.data.map((u) => ({ value: u.id, label: u.name, hint: ROLE_LABELS[u.role] || labelize(u.role) })))).catch(() => {});
  }, [load]);

  const nodes = useMemo(() => data?.nodes || [], [data]);
  const branches = useMemo(() => data?.branches || [], [data]);
  const origLayout = useLayout(nodes, NO_COLLAPSE);
  const displayNodes = useMemo(() => {
    if (view === "locations") return locationTree(nodes, loc === "all" ? branches : branches.filter((b) => b.id === loc), loc === "all");
    return loc === "all" ? nodes : pruneForLocation(nodes, loc);
  }, [nodes, branches, view, loc]);
  const layout = useLayout(displayNodes, collapsed);
  const selected = selectedId ? layout.byId[selectedId] : null;
  const refId = selected ? selected.ref_id || selected.id : null;
  const original = refId ? origLayout.byId[refId] : null;
  const isLocation = selected?.kind === "location";
  useEffect(() => { setSelectedId(null); setCollapsed({}); }, [view, loc]);
  const allPeople = useMemo(() => {
    const m = {};
    nodes.forEach((n) => (n.people || []).forEach((p) => { m[p.id] = p; }));
    (data?.unassigned || []).forEach((p) => { m[p.id] = p; });
    return Object.values(m);
  }, [nodes, data]);

  const highlight = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return new Set();
    return new Set(displayNodes.filter((n) => `${n.title} ${(n.people || []).map((p) => p.name).join(" ")} ${(n.responsibilities || []).join(" ")}`.toLowerCase().includes(s)).map((n) => n.id));
  }, [q, displayNodes]);

  const jumpToMatch = () => {
    const first = [...highlight][0];
    if (!first) return toast.info("No match in the chart");
    // expand every ancestor so the match is visible
    const open = {};
    let cur = layout.byId[first]?.parent_id;
    while (cur) { open[cur] = false; cur = layout.byId[cur]?.parent_id; }
    setCollapsed((c) => ({ ...c, ...open }));
    setSelectedId(first);
    setFocusId(first + ":" + Date.now());
  };

  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const bootstrap = async (replace = false) => {
    setBusy(true);
    try {
      const { data: r } = await api.post("/org/bootstrap", { replace });
      toast.success(`Chart built — ${r.created} roles and departments`);
      setCollapsed({});
      load();
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  const remove = async (mode) => {
    try {
      const { data: r } = await api.delete(`/org/nodes/${delTarget.id}`, { params: { mode } });
      toast.success(r.removed > 1 ? `Removed ${r.removed} boxes — undo within 24h from Settings` : "Removed — undo within 24h from Settings");
      setDelTarget(null);
      setSelectedId(null);
      window.dispatchEvent(new Event("records-changed"));
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data)
    return <div className="h-64 flex items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" /></div>;

  const canManage = data.can_manage;
  const canDelete = data.can_delete;
  const directReports = selected ? (layout.kids[selected.id] || []) : [];
  const parent = selected?.parent_id ? layout.byId[selected.parent_id] : null;
  const vacancies = displayNodes.filter((n) => n.kind === "role" && !(n.people || []).length).length;
  const branchName = (id) => branches.find((b) => b.id === id)?.name;
  const unassigned = (data.unassigned || []).filter((p) => loc === "all" || personAtLoc(p, loc));
  const locPeople = isLocation ? allPeople.filter((p) => personAtLoc(p, selected.branch.id)) : [];
  const rootId = origLayout.roots[0]?.id || null;

  return (
    <div className="space-y-5 max-w-7xl" data-testid="org-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Org Structure</h1>
          <p className="text-sm text-gray-500 mt-1">Who does what, and who reports to whom. Click any box to see responsibilities and KPIs.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {nodes.length > 0 && <ExportMenu dataset="org-structure" params={loc !== "all" && loc !== NO_LOC ? { branch: loc } : {}} />}
          {canManage && nodes.length > 0 && (
            <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" onClick={() => setForm({ open: true, node: null, parentId: isLocation ? rootId : refId, branch: isLocation ? selected.branch.id : loc !== "all" ? loc : "" })} data-testid="org-add-btn">
              <Plus className="h-4 w-4 mr-2" /> Add role
            </Button>
          )}
        </div>
      </div>

      {nodes.length === 0 ? (
        <Card className="border-dashed border-gray-300"><CardContent className="py-14 text-center space-y-3">
          <Network className="h-9 w-9 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-600 font-medium">No org chart yet.</p>
          {canManage ? (
            <>
              <p className="text-xs text-gray-500 max-w-md mx-auto">Start from your current team: we'll put the CEO at the centre, group everyone into departments by role, and add standard responsibilities you can edit.</p>
              <div className="flex justify-center gap-2 flex-wrap">
                <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={() => bootstrap(false)} data-testid="org-bootstrap-btn"><Sparkles className="h-4 w-4 mr-2" /> Build from current team</Button>
                <Button variant="outline" onClick={() => setForm({ open: true, node: null, parentId: null })} data-testid="org-start-blank">Start from scratch</Button>
              </div>
            </>
          ) : <p className="text-xs text-gray-500">Ask an admin to set it up.</p>}
        </CardContent></Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 self-start whitespace-nowrap overflow-x-auto max-w-full">
              <button type="button" onClick={() => setView("map")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === "map" ? "bg-[#FFF7ED] text-[#F26B21]" : "text-gray-600"}`} data-testid="org-view-map"><Network className="h-4 w-4" /> Mind map</button>
              <button type="button" onClick={() => setView("list")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-[#FFF7ED] text-[#F26B21]" : "text-gray-600"}`} data-testid="org-view-list"><ListTree className="h-4 w-4" /> List</button>
              {branches.length > 0 && <button type="button" onClick={() => setView("locations")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === "locations" ? "bg-[#FFF7ED] text-[#F26B21]" : "text-gray-600"}`} data-testid="org-view-locations"><MapPin className="h-4 w-4" /> By location</button>}
            </div>
            {branches.length > 0 && (
              <Select value={loc} onValueChange={setLoc}>
                <SelectTrigger className="sm:w-52 bg-white" data-testid="org-location-select"><MapPin className="h-4 w-4 mr-1.5 text-gray-400" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} · {b.headcount}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <form className="relative sm:w-72" onSubmit={(e) => { e.preventDefault(); jumpToMatch(); }}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Find a person or role…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="org-search" />
            </form>
            <div className="flex items-center gap-3 text-xs text-gray-500 sm:ml-auto flex-wrap">
              <span><span className="font-semibold text-gray-800">{displayNodes.filter((n) => n.kind !== "location").length}</span> boxes</span>
              <span><span className="font-semibold text-gray-800">{displayNodes.reduce((s, n) => s + (n.person_ids || []).length, 0)}</span> placements</span>
              {vacancies > 0 && <span className="text-amber-700"><span className="font-semibold">{vacancies}</span> vacant</span>}
              <button type="button" className="underline hover:text-gray-800" onClick={() => setCollapsed({})}>Expand all</button>
              {canManage && canDelete && <button type="button" className="underline hover:text-gray-800" onClick={() => setRebuildOpen(true)} data-testid="org-rebuild">Rebuild from team</button>}
            </div>
          </div>

          {loc !== "all" && displayNodes.length === 0 && (
            <Card className="border-dashed border-gray-300"><CardContent className="py-10 text-center text-sm text-gray-500" data-testid="org-location-empty">
              Nobody at {branchName(loc)} is placed in the chart yet. Add a role and set its location, or place people based there.
            </CardContent></Card>
          )}
          {displayNodes.length > 0 && (view === "map"
            ? <MindMap layout={layout} nodes={displayNodes} selectedId={selectedId} onSelect={setSelectedId} collapsed={collapsed} onToggle={toggle} highlight={highlight} focusKey={focusId} />
            : view === "list"
              ? <OutlineView layout={layout} selectedId={selectedId} onSelect={setSelectedId} collapsed={collapsed} onToggle={toggle} highlight={highlight} />
              : (
                <>
                  <div className="hidden md:block"><MindMap layout={layout} nodes={displayNodes} selectedId={selectedId} onSelect={setSelectedId} collapsed={collapsed} onToggle={toggle} highlight={highlight} focusKey={focusId} /></div>
                  <div className="md:hidden"><OutlineView layout={layout} selectedId={selectedId} onSelect={setSelectedId} collapsed={collapsed} onToggle={toggle} highlight={highlight} /></div>
                </>
              ))}
          {view === "locations" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" data-testid="org-location-tiles">
              {branches.filter((b) => loc === "all" || b.id === loc).map((b) => {
                const boxes = displayNodes.filter((n) => n.id.startsWith(`${b.id}::`));
                const vac = boxes.filter((n) => n.kind === "role" && !(n.people || []).length).length;
                return (
                  <button key={b.id} type="button" onClick={() => setSelectedId(`loc::${b.id}`)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-orange-200">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 truncate"><MapPin className="h-3.5 w-3.5 text-[#F26B21] shrink-0" />{b.name}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{b.headcount} {b.headcount === 1 ? "person" : "people"} · {boxes.filter((n) => n.kind === "role").length} {boxes.filter((n) => n.kind === "role").length === 1 ? "role" : "roles"}{vac ? ` · ${vac} vacant` : ""}</div>
                  </button>
                );
              })}
            </div>
          )}

          {unassigned.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40" data-testid="org-unassigned">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-2"><UserPlus className="h-4 w-4" /> Not placed in the chart yet</div>
                <div className="flex flex-wrap gap-2">
                  {unassigned.map((p) => (
                    <span key={p.id} className="rounded-full bg-white border border-amber-200 px-3 py-1 text-xs text-gray-700">{p.name} <span className="text-gray-400">· {ROLE_LABELS[p.role] || labelize(p.role)}{loc === "all" && branchName(p.branch_id) ? ` · ${branchName(p.branch_id)}` : ""}</span></span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* details panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="org-panel">
          {selected && isLocation && (
            <div className="space-y-5" data-testid="org-location-panel">
              <SheetHeader className="text-left space-y-1">
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#F26B21]" /><span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Location</span></div>
                <SheetTitle className="text-xl" data-testid="org-panel-title">{selected.title}</SheetTitle>
                <p className="text-sm text-gray-500">{[selected.branch.city, selected.branch.country].filter(Boolean).join(", ")}{selected.branch.head_name ? ` · Head: ${selected.branch.head_name}` : ""}</p>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2">
                {[["People", locPeople.length], ["Roles", displayNodes.filter((n) => n.id.startsWith(`${selected.branch.id}::`) && n.kind === "role").length], ["Vacant", displayNodes.filter((n) => n.id.startsWith(`${selected.branch.id}::`) && n.kind === "role" && !(n.people || []).length).length]].map(([l, v]) => (
                  <div key={l} className="rounded-lg border border-gray-200 px-3 py-2"><div className="text-lg font-bold font-mono text-gray-900">{v}</div><div className="text-[11px] text-gray-500">{l}</div></div>
                ))}
              </div>
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Team at this location</h3>
                {locPeople.length === 0 && <p className="text-sm text-gray-400">Nobody is based here yet.</p>}
                {locPeople.map((p) => (
                  <Link key={p.id} to={`/employees/${p.id}`} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:border-orange-200">
                    <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white text-xs font-bold flex items-center justify-center">{initialsOf(p.name)}</span>
                    <div className="min-w-0"><div className="text-sm font-medium text-gray-800 truncate">{p.name}</div><div className="text-[11px] text-gray-400 truncate">{p.designation || ROLE_LABELS[p.role] || labelize(p.role)}</div></div>
                  </Link>
                ))}
              </section>
              {directReports.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Departments here</h3>
                  {directReports.map((c) => (
                    <button key={c.id} type="button" onClick={() => setSelectedId(c.id)} className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-orange-200">
                      <span className="min-w-0"><span className="block text-sm font-medium text-gray-800 truncate">{c.title}</span><span className="block text-[11px] text-gray-400 truncate">{(c.people || []).map((p) => p.name).join(", ") || labelize(c.kind)}</span></span>
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </section>
              )}
              {canManage && selected.branch.id !== NO_LOC && (
                <div className="pt-2 border-t border-gray-100">
                  <Button variant="outline" onClick={() => setForm({ open: true, node: null, parentId: rootId, branch: selected.branch.id })} data-testid="org-location-add-role"><Plus className="h-4 w-4 mr-1.5" /> Add a role at {selected.title}</Button>
                </div>
              )}
            </div>
          )}
          {selected && !isLocation && (
            <div className="space-y-5">
              <SheetHeader className="text-left space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: layout.color[selected.id] }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{labelize(selected.kind)}</span>
                </div>
                <SheetTitle className="text-xl" data-testid="org-panel-title">{selected.title}</SheetTitle>
                {parent && parent.kind !== "location" && <p className="text-sm text-gray-500">Reports to <button type="button" className="text-[#F26B21] font-medium hover:underline" onClick={() => setSelectedId(parent.id)}>{parent.title}</button></p>}
                <p className="text-xs text-gray-500 flex items-center gap-1" data-testid="org-panel-location"><MapPin className="h-3.5 w-3.5" />{original?.branch_id ? branchName(original.branch_id) || "Location" : "All locations"}
                  {loc !== "all" || view === "locations" ? <span className="text-gray-400">· showing people at this location</span> : null}</p>
              </SheetHeader>
              {selected.description && <p className="text-sm text-gray-600 whitespace-pre-line">{selected.description}</p>}

              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> People</h3>
                {(selected.people || []).length === 0 && <p className="text-sm text-amber-700">Vacant: nobody holds this yet.</p>}
                {(selected.people || []).map((p) => (
                  <Link key={p.id} to={`/employees/${p.id}`} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 hover:border-orange-200">
                    <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white text-xs font-bold flex items-center justify-center">{initialsOf(p.name)}</span>
                    <div className="min-w-0"><div className="text-sm font-medium text-gray-800 truncate">{p.name}</div><div className="text-[11px] text-gray-400 truncate">{p.designation || ROLE_LABELS[p.role] || labelize(p.role)}{branchName(p.branch_id) ? ` · ${branchName(p.branch_id)}` : ""}</div></div>
                  </Link>
                ))}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Responsibilities</h3>
                {(selected.responsibilities || []).length === 0 && <p className="text-sm text-gray-400">None written yet.</p>}
                <ul className="space-y-1.5" data-testid="org-panel-resp">
                  {(selected.responsibilities || []).map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700"><CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />{r}</li>
                  ))}
                </ul>
              </section>

              {(selected.kpis || []).length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> KPIs</h3>
                  <div className="flex flex-wrap gap-1.5">{selected.kpis.map((k, i) => <Badge key={i} variant="outline" className="bg-[#FFF7ED] border-orange-200 text-gray-700 font-medium">{k}</Badge>)}</div>
                </section>
              )}

              {directReports.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Direct reports</h3>
                  {directReports.map((c) => (
                    <button key={c.id} type="button" onClick={() => setSelectedId(c.id)} className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-orange-200">
                      <span className="min-w-0"><span className="block text-sm font-medium text-gray-800 truncate">{c.title}</span><span className="block text-[11px] text-gray-400 truncate">{(c.people || []).map((p) => p.name).join(", ") || labelize(c.kind)}</span></span>
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </section>
              )}

              {(canManage || canDelete) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  {canManage && <Button variant="outline" onClick={() => setForm({ open: true, node: original, parentId: null })} data-testid="org-panel-edit"><Pencil className="h-4 w-4 mr-1.5" /> Edit</Button>}
                  {canManage && <Button variant="outline" onClick={() => setForm({ open: true, node: null, parentId: refId, branch: loc !== "all" && loc !== NO_LOC ? loc : selected.id.includes("::") ? selected.id.split("::")[0] : original?.branch_id || "" })} data-testid="org-panel-add-child"><Plus className="h-4 w-4 mr-1.5" /> Add below</Button>}
                  {canDelete && <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDelTarget(original)} data-testid="org-panel-delete"><Trash2 className="h-4 w-4 mr-1.5" /> Delete</Button>}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <NodeFormDialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} node={form.node} parentId={form.parentId}
        nodes={nodes} kinds={data.kinds?.length ? data.kinds : ["company", "department", "team", "role"]} team={team} onSaved={load} layout={origLayout}
        branches={branches} defaultBranch={form.branch && form.branch !== NO_LOC ? form.branch : ""} />

      <Dialog open={rebuildOpen} onOpenChange={setRebuildOpen}>
        <DialogContent className="max-w-md" data-testid="org-rebuild-dialog">
          <DialogHeader><DialogTitle>Rebuild the chart from the current team?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Your current chart, including edited responsibilities, is replaced with a fresh one built from everyone's role. The old chart can be restored from Settings → Recently deleted for 24 hours.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRebuildOpen(false)}>Cancel</Button>
            <Button className="bg-[#F26B21] hover:bg-[#d95b16] text-white" disabled={busy} onClick={() => { setRebuildOpen(false); bootstrap(true); }} data-testid="org-rebuild-confirm">Rebuild</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <DialogContent className="max-w-md" data-testid="org-delete-dialog">
          <DialogHeader><DialogTitle className="text-red-700">Delete "{delTarget?.title}"?</DialogTitle></DialogHeader>
          {delTarget && (origLayout.kids[delTarget.id] || []).length > 0 ? (
            <div className="space-y-2 text-sm text-gray-600">
              <p>It has {(origLayout.kids[delTarget.id] || []).length} direct report{(origLayout.kids[delTarget.id] || []).length > 1 ? "s" : ""}. What should happen to them?</p>
              <div className="grid gap-2">
                <Button variant="outline" className="justify-start h-auto py-2.5 text-left whitespace-normal" onClick={() => remove("reattach")} data-testid="org-delete-reattach">
                  <span><span className="block font-semibold text-gray-900">Keep them</span><span className="block text-xs text-gray-500">They move up and report to {origLayout.byId[delTarget.parent_id]?.title || "the top of the chart"}.</span></span>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-2.5 text-left whitespace-normal border-red-200" onClick={() => remove("cascade")} data-testid="org-delete-cascade">
                  <span><span className="block font-semibold text-red-700">Delete the whole branch</span><span className="block text-xs text-gray-500">Removes {origLayout.descendants(delTarget.id)} box{origLayout.descendants(delTarget.id) > 1 ? "es" : ""} below it too.</span></span>
                </Button>
              </div>
              <p className="text-xs text-gray-400">Either way, it can be restored from Settings → Recently deleted for 24 hours.</p>
            </div>
          ) : (
            <p className="text-sm text-gray-600">It can be restored from Settings → Recently deleted for 24 hours.</p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDelTarget(null)}>Cancel</Button>
            {delTarget && !(origLayout.kids[delTarget.id] || []).length && <Button variant="destructive" onClick={() => remove("reattach")} data-testid="org-delete-confirm">Delete</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

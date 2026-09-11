import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api, { formatINR } from "@/lib/api";
import { saveBlobResponse } from "@/components/ExportMenu";
import { labelize, CHART_COLORS } from "@/components/Badges";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileSpreadsheet, Play, Sparkles, SlidersHorizontal } from "lucide-react";

const iso = (d) => d.toISOString().slice(0, 10);
const PRESETS = {
  this_month: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; },
  last_month: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), iso(new Date(n.getFullYear(), n.getMonth(), 0))]; },
  quarter: () => { const n = new Date(); const qs = Math.floor(n.getMonth() / 3) * 3; return [iso(new Date(n.getFullYear(), qs, 1)), iso(n)]; },
  ytd: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), 0, 1)), iso(n)]; },
};

const fmtCell = (v, fmt) => {
  if (v === null || v === undefined || v === "") return "—";
  if (fmt === "money") return formatINR(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
};

const SectionTable = ({ section, limit = 10 }) => (
  <Card className="border-gray-200/80 shadow-sm overflow-hidden">
    {section.title && <div className="px-4 pt-3 text-xs font-bold uppercase tracking-widest text-[#F26B21]">{section.title}</div>}
    <Table>
      <TableHeader>
        <TableRow className="bg-gray-50/70">
          {section.columns.map((c) => (
            <TableHead key={c.key} className={c.fmt === "money" || c.fmt === "num" ? "text-right" : ""}>{c.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {section.rows.length === 0 && (
          <TableRow><TableCell colSpan={section.columns.length} className="text-center py-6 text-sm text-gray-400">No data for this period.</TableCell></TableRow>
        )}
        {section.rows.slice(0, limit).map((row, i) => (
          <TableRow key={i}>
            {section.columns.map((c) => (
              <TableCell key={c.key} className={`text-sm ${c.fmt === "money" ? "text-right font-mono" : c.fmt === "num" ? "text-right font-mono" : "text-gray-700"}`}>
                {fmtCell(row[c.key], c.fmt)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    {section.rows.length > limit && (
      <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">Showing {limit} of {section.rows.length} rows — full data in the downloaded file.</div>
    )}
  </Card>
);

const ChartCard = ({ chart }) => (
  <Card className="border-gray-200/80 shadow-sm">
    <div className="px-4 pt-3 text-xs font-bold uppercase tracking-widest text-[#F26B21]">{chart.title}</div>
    <CardContent className="h-60 pt-2">
      {!chart.data || chart.data.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-gray-400">No data for this period.</div>
      ) : chart.type === "donut" ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chart.data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={3}>
              {chart.data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart.data}>
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip cursor={{ fill: "#FFF7ED" }} />
            {(chart.keys || ["value"]).map((k, i) => (
              <Bar key={k} dataKey={k} name={labelize(k)} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[5, 5, 0, 0]} maxBarSize={36} />
            ))}
            {chart.keys && <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />}
          </BarChart>
        </ResponsiveContainer>
      )}
    </CardContent>
  </Card>
);

export default function ReportsPage() {
  // ---------- Templates state ----------
  const [templates, setTemplates] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [preset, setPreset] = useState("this_month");
  const [range, setRange] = useState(PRESETS.this_month());
  const [preview, setPreview] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ---------- Custom builder state ----------
  const [modules, setModules] = useState([]);
  const [mod, setMod] = useState(null);
  const [cRange, setCRange] = useState(["", ""]);
  const [cFilters, setCFilters] = useState({});
  const [cColumns, setCColumns] = useState([]);
  const [cPreview, setCPreview] = useState(null);
  const [cBusy, setCBusy] = useState(false);

  useEffect(() => {
    api.get("/reports/templates").then((r) => {
      setTemplates(r.data);
      if (r.data.length) setActiveKey(r.data[0].key);
    }).catch(() => {});
    api.get("/reports/custom/meta").then((r) => setModules(r.data)).catch(() => {});
  }, []);

  const applyPreset = (p) => { setPreset(p); setRange(PRESETS[p]()); };

  const generate = useCallback(async (key) => {
    setGenerating(true);
    setPreview(null);
    try {
      const { data } = await api.get(`/reports/template/${key}`, { params: { date_from: range[0], date_to: range[1] } });
      setPreview(data);
    } catch (e) {
      toast.error("Could not generate this report");
    } finally {
      setGenerating(false);
    }
  }, [range]);

  const exportTemplate = async (format) => {
    if (!activeKey) return;
    setExporting(true);
    try {
      const res = await api.get(`/reports/template/${activeKey}/export`, {
        params: { format, date_from: range[0], date_to: range[1] }, responseType: "blob",
      });
      saveBlobResponse(res, `dotindot-${activeKey}.${format}`);
      toast.success(`${format === "pdf" ? "PDF" : "Excel"} downloaded`);
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // ---------- Custom builder handlers ----------
  const pickModule = (key) => {
    const m = modules.find((x) => x.key === key);
    setMod(m);
    setCFilters({});
    setCColumns(m ? m.columns.map((c) => c.key) : []);
    setCPreview(null);
  };

  const toggleColumn = (key) => {
    setCColumns((cols) => cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key]);
  };

  const customBody = (format) => ({
    module: mod.key,
    date_from: cRange[0] || null,
    date_to: cRange[1] || null,
    filters: cFilters,
    columns: mod.columns.map((c) => c.key).filter((k) => cColumns.includes(k)),
    format,
  });

  const runPreview = async () => {
    if (!mod) return toast.error("Pick a module first");
    if (!cColumns.length) return toast.error("Select at least one column");
    setCBusy(true);
    try {
      const { data } = await api.post("/reports/custom/preview", customBody(null));
      setCPreview(data);
    } catch (e) {
      toast.error("Preview failed");
    } finally {
      setCBusy(false);
    }
  };

  const exportCustom = async (format) => {
    if (!mod) return;
    setCBusy(true);
    try {
      const res = await api.post("/reports/custom/export", customBody(format), { responseType: "blob" });
      saveBlobResponse(res, `dotindot-custom-${mod.key}.${format}`);
      toast.success(`${format === "pdf" ? "PDF" : "Excel"} downloaded`);
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setCBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl" data-testid="reports-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Pre-built report templates and a custom builder — every report downloads as branded PDF or Excel.</p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates" data-testid="reports-tab-templates" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Templates</TabsTrigger>
          <TabsTrigger value="custom" data-testid="reports-tab-custom" className="gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Custom builder</TabsTrigger>
        </TabsList>

        {/* ---------------- Templates ---------------- */}
        <TabsContent value="templates" className="mt-5 space-y-5">
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Label className="text-sm text-gray-500">Period</Label>
              <div className="flex gap-1.5">
                {Object.keys(PRESETS).map((p) => (
                  <button key={p} onClick={() => applyPreset(p)} data-testid={`report-preset-${p}`}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${preset === p ? "bg-[#FFF7ED] text-[#F26B21] border border-orange-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {labelize(p === "ytd" ? "YTD" : p)}
                  </button>
                ))}
              </div>
              <Input type="date" className="w-[150px]" value={range[0]} onChange={(e) => { setRange([e.target.value, range[1]]); setPreset(""); }} data-testid="report-date-from" />
              <span className="text-gray-400 text-sm">→</span>
              <Input type="date" className="w-[150px]" value={range[1]} onChange={(e) => { setRange([range[0], e.target.value]); setPreset(""); }} data-testid="report-date-to" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {templates.map((t) => (
              <Card
                key={t.key}
                className={`cursor-pointer transition-all shadow-sm ${activeKey === t.key ? "border-[#F26B21] ring-1 ring-[#F26B21]/30" : "border-gray-200/80 hover:border-orange-300"}`}
                onClick={() => setActiveKey(t.key)}
                data-testid={`template-card-${t.key}`}
              >
                <CardContent className="p-4">
                  <div className="font-semibold text-gray-900 text-sm">{t.name}</div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{t.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => generate(activeKey)}
              disabled={!activeKey || generating}
              className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold"
              data-testid="generate-report-btn"
            >
              <Play className="h-4 w-4 mr-1.5" /> {generating ? "Generating..." : "Generate report"}
            </Button>
            {preview && (
              <>
                <Button variant="outline" size="sm" onClick={() => exportTemplate("pdf")} disabled={exporting} data-testid="template-export-pdf">
                  <FileText className="h-3.5 w-3.5 mr-1.5 text-[#F26B21]" /> Download PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportTemplate("xlsx")} disabled={exporting} data-testid="template-export-xlsx">
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> Download Excel
                </Button>
              </>
            )}
          </div>

          {preview && (
            <div className="space-y-4" data-testid="report-preview">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{preview.title}</h2>
                <p className="text-xs text-gray-400">{preview.period}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="report-summary">
                {preview.summary.map((s, i) => (
                  <Card key={i} className="border-orange-200/70 bg-[#FFF7ED]/50 shadow-sm">
                    <CardContent className="p-3.5">
                      <div className="text-base font-bold text-gray-900 font-mono">{s.money ? formatINR(s.value) : s.value}</div>
                      <div className="text-[11px] text-gray-500">{s.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {preview.charts?.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="report-charts">
                  {preview.charts.map((c, i) => <ChartCard key={i} chart={c} />)}
                </div>
              )}
              {preview.sections.map((sec, i) => <SectionTable key={i} section={sec} />)}
            </div>
          )}
        </TabsContent>

        {/* ---------------- Custom builder ---------------- */}
        <TabsContent value="custom" className="mt-5 space-y-5">
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label>Module</Label>
                  <Select value={mod?.key || ""} onValueChange={pickModule}>
                    <SelectTrigger className="w-[190px]" data-testid="custom-module-select"><SelectValue placeholder="Pick a module" /></SelectTrigger>
                    <SelectContent>
                      {modules.map((m) => <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input type="date" className="w-[150px]" value={cRange[0]} onChange={(e) => setCRange([e.target.value, cRange[1]])} data-testid="custom-date-from" />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input type="date" className="w-[150px]" value={cRange[1]} onChange={(e) => setCRange([cRange[0], e.target.value])} data-testid="custom-date-to" />
                </div>
                {mod?.filters.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label>{f.label}</Label>
                    <Select value={cFilters[f.key] || "all"} onValueChange={(v) => setCFilters((p) => ({ ...p, [f.key]: v }))}>
                      <SelectTrigger className="w-[160px]" data-testid={`custom-filter-${f.key}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {f.options.map((o) => <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {mod && (
                <div>
                  <Label className="mb-2 block">Columns</Label>
                  <div className="flex flex-wrap gap-x-5 gap-y-2" data-testid="custom-columns">
                    {mod.columns.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <Checkbox
                          checked={cColumns.includes(c.key)}
                          onCheckedChange={() => toggleColumn(c.key)}
                          data-testid={`custom-col-${c.key}`}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={runPreview} disabled={!mod || cBusy} className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold" data-testid="custom-preview-btn">
                  <Play className="h-4 w-4 mr-1.5" /> {cBusy ? "Working..." : "Preview"}
                </Button>
                {cPreview && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => exportCustom("pdf")} disabled={cBusy} data-testid="custom-export-pdf">
                      <FileText className="h-3.5 w-3.5 mr-1.5 text-[#F26B21]" /> Download PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => exportCustom("xlsx")} disabled={cBusy} data-testid="custom-export-xlsx">
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> Download Excel
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {cPreview && (
            <div className="space-y-2" data-testid="custom-preview-table">
              <p className="text-sm text-gray-500">{cPreview.total} matching records · previewing first {Math.min(20, cPreview.total)}</p>
              <SectionTable section={{ title: null, columns: cPreview.columns, rows: cPreview.rows }} limit={20} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

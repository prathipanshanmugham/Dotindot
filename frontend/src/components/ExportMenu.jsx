import { useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, ChevronDown } from "lucide-react";

export const saveBlobResponse = (res, fallbackName) => {
  const dispo = res.headers["content-disposition"] || "";
  const m = dispo.match(/filename="?([^";]+)"?/);
  const filename = m ? m[1] : fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function ExportMenu({ dataset, params = {}, label = "Export" }) {
  const [busy, setBusy] = useState(false);

  const download = async (format) => {
    setBusy(true);
    try {
      const res = await api.get(`/exports/${dataset}`, { params: { ...params, format }, responseType: "blob" });
      saveBlobResponse(res, `dotindot-${dataset}-${new Date().toISOString().slice(0, 10)}.${format}`);
      toast.success(`${format === "pdf" ? "PDF" : "Excel"} export downloaded`);
    } catch (e) {
      toast.error("Export failed — you may not have permission for this data set");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy} data-testid={`export-menu-${dataset}`} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> {busy ? "Exporting..." : label} <ChevronDown className="h-3 w-3 text-gray-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => download("pdf")} data-testid={`export-pdf-${dataset}`} className="cursor-pointer">
          <FileText className="h-3.5 w-3.5 mr-2 text-[#F26B21]" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => download("xlsx")} data-testid={`export-xlsx-${dataset}`} className="cursor-pointer">
          <FileSpreadsheet className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

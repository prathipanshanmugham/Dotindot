import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useRecordDelete, RowDeleteControls, BulkDeleteBar } from "@/components/RecordDelete";
import api, { formatINR } from "@/lib/api";
import SalesLayout, { QUOTE_STATUS_STYLES } from "@/components/SalesLayout";
import ExportMenu from "@/components/ExportMenu";
import { labelize } from "@/components/Badges";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";

const STATUSES = ["draft", "sent", "accepted", "rejected", "expired"];

export default function QuotesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [status, setStatus] = useState("all");

  const canWrite = ["super_admin", "admin", "sales"].includes(user.role);

  const load = useCallback(async () => {
    const params = status === "all" ? {} : { status };
    const { data } = await api.get("/sales/quotes", { params });
    setQuotes(data);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const del = useRecordDelete({ coll: "quotes", permKey: "sales.delete", rows: quotes, onDeleted: () => load() });
  return (
    <SalesLayout
      title="Quotes"
      subtitle={`${quotes.length} quotes · proposal generator`}
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu dataset="quotes" params={status === "all" ? {} : { status }} />
          {canWrite && (
            <Button onClick={() => navigate("/sales/quotes/new")} data-testid="new-quote-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> New Quote
            </Button>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]" data-testid="quote-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-gray-200/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70"><TableHead className="w-20">{del.canDelete && <><BulkDeleteBar kit={del} />{del.dialog}</>}</TableHead>
              <TableHead>Number</TableHead><TableHead>Title</TableHead><TableHead>For</TableHead>
              <TableHead>Validity</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-sm text-gray-400">No quotes.</TableCell></TableRow>
            ) : quotes.map((q) => (
              <TableRow key={q.id} onClick={() => navigate(`/sales/quotes/${q.id}`)} className="cursor-pointer hover:bg-orange-50/40" data-testid={`quote-row-${q.id}`}><TableCell className="w-20"><RowDeleteControls kit={del} row={q} /></TableCell>
                <TableCell className="font-mono text-sm font-semibold text-[#F26B21]">{q.number}</TableCell>
                <TableCell className="text-sm font-semibold text-gray-900 max-w-[280px] truncate">{q.title}</TableCell>
                <TableCell className="text-sm text-gray-600">{q.lead_name || q.client_name || "—"}</TableCell>
                <TableCell className="text-sm text-gray-500">{q.validity_date || "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">{formatINR(q.total)}</TableCell>
                <TableCell><Badge variant="outline" className={QUOTE_STATUS_STYLES[q.status]} data-testid={`quote-status-${q.id}`}>{labelize(q.status)}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </SalesLayout>
  );
}

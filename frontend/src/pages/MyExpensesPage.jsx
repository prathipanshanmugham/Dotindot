import { useEffect, useState, useCallback } from "react";
import api, { formatINR, openReceipt } from "@/lib/api";
import ExpenseSubmitDialog from "@/components/ExpenseSubmitDialog";
import { labelize, ExpenseStatusBadge } from "@/components/Badges";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Paperclip, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function MyExpensesPage() {
  const [rows, setRows] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/finance/expenses");
    setRows(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const viewReceipt = async (path) => {
    try { await openReceipt(path); } catch (e) { toast.error("Could not open receipt"); }
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="my-expenses-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">My Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submit expenses and track their approval status. Finance reviews every submission.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="my-expense-submit-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
          <Plus className="h-4 w-4 mr-1.5" /> Submit Expense
        </Button>
      </div>

      <Card className="border-gray-200/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead>
              <TableHead>Receipt</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-sm text-gray-400">You haven't submitted any expenses yet.</TableCell></TableRow>
            ) : rows.map((e) => (
              <TableRow key={e.id} data-testid={`my-expense-row-${e.id}`}>
                <TableCell className="text-sm text-gray-600 whitespace-nowrap">{e.date}</TableCell>
                <TableCell className="text-sm text-gray-700">{labelize(e.category)}</TableCell>
                <TableCell className="text-sm text-gray-800 max-w-[280px] truncate">{e.description}</TableCell>
                <TableCell>
                  {e.receipt_path ? (
                    <Button variant="ghost" size="sm" onClick={() => viewReceipt(e.receipt_path)}><Paperclip className="h-3.5 w-3.5 text-[#F26B21]" /></Button>
                  ) : e.receipt_link ? (
                    <a href={e.receipt_link} target="_blank" rel="noopener noreferrer" className="text-[#F26B21]"><ExternalLink className="h-3.5 w-3.5" /></a>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">{formatINR(e.amount)}</TableCell>
                <TableCell><ExpenseStatusBadge status={e.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ExpenseSubmitDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} />
    </div>
  );
}

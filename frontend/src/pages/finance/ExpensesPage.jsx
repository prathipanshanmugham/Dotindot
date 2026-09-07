import { useEffect, useState, useCallback } from "react";
import api, { formatINR, apiError, openReceipt } from "@/lib/api";
import FinanceLayout from "@/components/FinanceLayout";
import ExpenseSubmitDialog from "@/components/ExpenseSubmitDialog";
import ExportMenu from "@/components/ExportMenu";
import { labelize, ExpenseStatusBadge } from "@/components/Badges";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Check, X, Banknote, Paperclip, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const TABS = ["submitted", "approved", "paid", "rejected", "all"];

export default function ExpensesPage() {
  const [tab, setTab] = useState("submitted");
  const [rows, setRows] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    const params = tab === "all" ? {} : { status: tab };
    const { data } = await api.get("/finance/expenses", { params });
    setRows(data);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    try {
      await api.post(`/finance/expenses/${id}/${action}`);
      toast.success(`Expense ${action === "pay" ? "marked paid" : action + "d"}`);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const viewReceipt = async (path) => {
    try { await openReceipt(path); } catch (e) { toast.error("Could not open receipt"); }
  };

  return (
    <FinanceLayout
      title="Expenses"
      subtitle="Approval workflow: submitted → approved → paid. Approved expenses post to the ledger automatically."
      actions={
        <div className="flex items-center gap-2">
          <ExportMenu dataset="expenses" params={tab === "all" ? {} : { status: tab }} />
          <Button onClick={() => setDialogOpen(true)} data-testid="submit-expense-btn" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            <Plus className="h-4 w-4 mr-1.5" /> Submit Expense
          </Button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border border-gray-200">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t} data-testid={`expense-tab-${t}`} className="data-[state=active]:bg-[#FFF7ED] data-[state=active]:text-[#F26B21]">
              {labelize(t)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="border-gray-200/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/70">
              <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead>
              <TableHead>Submitted by</TableHead><TableHead>Receipt</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-sm text-gray-400">No {tab === "all" ? "" : labelize(tab).toLowerCase() + " "}expenses.</TableCell></TableRow>
            ) : rows.map((e) => (
              <TableRow key={e.id} data-testid={`expense-row-${e.id}`}>
                <TableCell className="text-sm text-gray-600 whitespace-nowrap">{e.date}</TableCell>
                <TableCell className="text-sm text-gray-700">{labelize(e.category)}{e.ai_tool ? ` · ${e.ai_tool}` : ""}</TableCell>
                <TableCell className="text-sm text-gray-800 max-w-[240px] truncate">{e.description}</TableCell>
                <TableCell className="text-sm text-gray-500">{e.submitted_by_name}</TableCell>
                <TableCell>
                  {e.receipt_path ? (
                    <Button variant="ghost" size="sm" onClick={() => viewReceipt(e.receipt_path)} data-testid={`view-receipt-${e.id}`}>
                      <Paperclip className="h-3.5 w-3.5 text-[#F26B21]" />
                    </Button>
                  ) : e.receipt_link ? (
                    <a href={e.receipt_link} target="_blank" rel="noopener noreferrer" className="text-[#F26B21]"><ExternalLink className="h-3.5 w-3.5" /></a>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">{formatINR(e.amount)}</TableCell>
                <TableCell><ExpenseStatusBadge status={e.status} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {e.status === "submitted" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => act(e.id, "approve")} data-testid={`approve-expense-${e.id}`}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-red-500 border-red-200 hover:bg-red-50" onClick={() => act(e.id, "reject")} data-testid={`reject-expense-${e.id}`}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {e.status === "approved" && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[#F26B21] border-orange-200 hover:bg-orange-50" onClick={() => act(e.id, "pay")} data-testid={`pay-expense-${e.id}`}>
                        <Banknote className="h-3.5 w-3.5 mr-1" /> Pay
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ExpenseSubmitDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={load} />
    </FinanceLayout>
  );
}

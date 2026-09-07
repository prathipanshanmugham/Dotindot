import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import { labelize } from "@/components/Badges";
import { EXPENSE_CATEGORIES } from "@/components/FinanceLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const EMPTY = { category: "operational", amount: "", date: new Date().toISOString().slice(0, 10), description: "", client_id: "none", project_id: "none", ai_tool: "", receipt_link: "" };

export default function ExpenseSubmitDialog({ open, onOpenChange, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setFile(null);
    if (user.role !== "employee") {
      api.get("/clients").then((r) => setClients(r.data)).catch(() => {});
    }
    api.get("/projects").then((r) => setProjects(r.data)).catch(() => {});
  }, [open, user.role]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      let receipt_path = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await api.post("/finance/expenses/upload-receipt", fd, { headers: { "Content-Type": "multipart/form-data" } });
        receipt_path = data.receipt_path;
      }
      await api.post("/finance/expenses", {
        category: form.category,
        amount: Number(form.amount),
        date: form.date,
        description: form.description,
        client_id: form.client_id === "none" ? null : form.client_id,
        project_id: form.project_id === "none" ? null : form.project_id,
        ai_tool: form.category === "ai" ? form.ai_tool || null : null,
        receipt_path,
        receipt_link: form.receipt_link,
      });
      toast.success("Expense submitted for approval");
      onOpenChange(false);
      onSaved && onSaved();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Submit expense</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger data-testid="expense-form-category"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Amount (₹)</Label><Input data-testid="expense-form-amount" type="number" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
            <div className="space-y-1"><Label>Date</Label><Input data-testid="expense-form-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
            {form.category === "ai" && (
              <div className="space-y-1"><Label>AI tool</Label><Input data-testid="expense-form-ai-tool" value={form.ai_tool} onChange={(e) => set("ai_tool", e.target.value)} placeholder="OpenAI, Midjourney..." /></div>
            )}
          </div>
          <div className="space-y-1"><Label>Description</Label><Textarea data-testid="expense-form-description" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            {clients.length > 0 && (
              <div className="space-y-1">
                <Label>Client (optional)</Label>
                <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                  <SelectTrigger data-testid="expense-form-client"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {projects.length > 0 && (
              <div className="space-y-1">
                <Label>Project (optional)</Label>
                <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
                  <SelectTrigger data-testid="expense-form-project"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label>Receipt (jpg/png/pdf, max 5MB)</Label>
            <Input data-testid="expense-form-receipt-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="space-y-1"><Label>Or receipt link</Label><Input data-testid="expense-form-receipt-link" value={form.receipt_link} onChange={(e) => set("receipt_link", e.target.value)} placeholder="https://..." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} data-testid="expense-form-submit" className="bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold">
            {busy ? "Submitting..." : "Submit expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

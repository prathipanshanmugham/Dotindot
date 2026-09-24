import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History } from "lucide-react";

export const fmtWhen = (iso) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const LoginHistoryDialog = ({ user, onClose }) => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get(`/users/${user.id}/logins`).then((r) => setRows(r.data)).catch(() => setRows([]));
  }, [user.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="login-history-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><History className="h-4 w-4 text-[#F26B21]" /> Login history — {user.name}</DialogTitle></DialogHeader>
        {!rows ? <p className="text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
          <p className="text-sm text-gray-400" data-testid="login-history-empty">No logins recorded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm" data-testid={`login-history-row-${i}`}>
                <span className="text-gray-700">{new Date(r.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="text-xs text-gray-400">{fmtWhen(r.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, CalendarClock, RefreshCw, Handshake, ReceiptText, PhoneCall, GraduationCap, Wrench, Megaphone, KeyRound, Wallet, CalendarCheck } from "lucide-react";

const KIND_META = {
  contract: { icon: CalendarClock, color: "text-amber-600 bg-amber-50" },
  subscription: { icon: RefreshCw, color: "text-blue-600 bg-blue-50" },
  partnership: { icon: Handshake, color: "text-violet-600 bg-violet-50" },
  expense: { icon: ReceiptText, color: "text-emerald-600 bg-emerald-50" },
  followup: { icon: PhoneCall, color: "text-red-500 bg-red-50" },
  training: { icon: GraduationCap, color: "text-[#F26B21] bg-[#FFF7ED]" },
  asset: { icon: Wrench, color: "text-cyan-700 bg-cyan-50" },
  social: { icon: Megaphone, color: "text-pink-600 bg-pink-50" },
  password: { icon: KeyRound, color: "text-amber-700 bg-amber-50" },
  api_credit: { icon: Wallet, color: "text-indigo-600 bg-indigo-50" },
  daily: { icon: CalendarCheck, color: "text-emerald-700 bg-emerald-50" },
};

export default function NotificationsBell() {
  const [data, setData] = useState({ items: [], count: 0 });
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get("/notifications").then((r) => setData(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-gray-50 transition-colors" data-testid="notifications-bell">
          <Bell className="h-4.5 w-4.5 text-gray-500" style={{ height: 18, width: 18 }} />
          {data.count > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-[#F26B21] text-white text-[9px] font-bold flex items-center justify-center"
              data-testid="notifications-count"
            >
              {data.count > 99 ? "99+" : data.count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[70vh] overflow-y-auto p-0">
        <DropdownMenuLabel className="px-4 py-3">
          <span className="text-sm font-bold text-gray-900">Notifications</span>
          <span className="text-xs text-gray-400 font-normal ml-2">{data.count} item{data.count === 1 ? "" : "s"} need attention</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        {data.items.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400" data-testid="notifications-empty">
            All clear — nothing needs your attention.
          </div>
        )}
        {data.items.map((n, i) => {
          const meta = KIND_META[n.kind] || KIND_META.contract;
          const Icon = meta.icon;
          return (
            <button
              key={i}
              onClick={() => navigate(n.link)}
              data-testid={`notification-item-${i}`}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-orange-50/50 transition-colors text-left border-b border-gray-50 last:border-0"
            >
              <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                <Icon style={{ height: 15, width: 15 }} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-800 truncate">{n.title}</span>
                <span className="block text-xs text-gray-400">{n.sub}</span>
              </span>
            </button>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

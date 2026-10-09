import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, FolderKanban, IndianRupee, TrendingUp, UserCheck,
  Handshake, BarChart3, ScrollText, Settings, ShieldCheck, LogOut, Search, ChevronDown,
  PieChart, ReceiptText, MapPin, Megaphone, CalendarDays, Sparkles, Boxes, MonitorPlay, KeyRound, Menu, Lock, Bot, Network, CalendarCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { DotindotWordmark } from "@/components/DotindotLogo";
import NotificationsBell from "@/components/NotificationsBell";
import { RoleBadge, ROLE_LABELS, labelize } from "@/components/Badges";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  {
    section: "Core",
    items: [
      { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { name: "Clients", path: "/clients", icon: Users, perm: ["clients"] },
      { name: "Projects", path: "/projects", icon: FolderKanban, perm: ["projects"] },
      { name: "Daily Reporting", path: "/daily", icon: CalendarCheck, perm: ["daily_reports"] },
    ],
  },
  {
    section: "Growth",
    items: [
      { name: "Sales", path: "/sales", icon: TrendingUp, perm: ["sales.pipeline", "sales.quotes", "sales.targets"] },
      { name: "Sales View", path: "/hud", icon: MonitorPlay, perm: ["sales.hud"] },
      { name: "Ads", path: "/ads", icon: Megaphone, perm: ["ads"] },
      { name: "Social Media", path: "/social", icon: CalendarDays, perm: ["social"] },
      { name: "Influencers", path: "/influencers", icon: Sparkles, perm: ["influencers"] },
    ],
  },
  {
    section: "Operations",
    items: [
      {
        name: "Finance", path: "/finance", icon: IndianRupee,
        perm: ["finance.ledger", "finance.subscriptions", "finance.budgets", "finance.ai_spend", "finance.api_credits", "finance.marketing", "finance.employee_revenue"],
      },
      { name: "Project Profit", path: "/finance/profit", icon: PieChart, perm: ["finance.project_profit"], when: (u, hasPerm) => !hasPerm("finance.ledger") },
      { name: "My Expenses", path: "/my-expenses", icon: ReceiptText, when: (u) => !["super_admin", "admin", "finance"].includes(u?.role) },
      { name: "Employees", path: "/employees", icon: UserCheck, perm: ["employees"] },
      { name: "Org Structure", path: "/org", icon: Network, perm: ["org_structure"] },
      { name: "AI Agents", path: "/agents", icon: Bot, perm: ["ai_agents"] },
      { name: "Assets", path: "/assets", icon: Boxes, perm: ["assets"] },
      { name: "Partnerships", path: "/partnerships", icon: Handshake, perm: ["partnerships"] },
      { name: "Locations", path: "/locations", icon: MapPin, perm: ["locations"] },
    ],
  },
  {
    section: "System",
    items: [
      { name: "Reports", path: "/reports", icon: BarChart3, perm: ["reports"] },
      { name: "Logs", path: "/logs", icon: ScrollText, perm: ["logs"] },
      { name: "Access Control", path: "/access", icon: KeyRound, perm: ["access_control"] },
      { name: "Password Manager", path: "/passwords", icon: Lock, perm: ["password_manager"] },
      { name: "User Management", path: "/admin/users", icon: ShieldCheck, perm: ["user_management"] },
      { name: "Settings", path: "/settings", icon: Settings },
    ],
  },
];

const GlobalSearch = () => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/search", { params: { q: q.trim() } });
        setResults(data);
        setOpen(true);
      } catch (e) {
        setResults(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (path) => {
    setOpen(false);
    setQ("");
    navigate(path);
  };

  const hasResults = results && (results.clients?.length || results.projects?.length);

  return (
    <div className="relative w-full max-w-md" ref={boxRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <Input
        data-testid="global-search-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim() && results && setOpen(true)}
        placeholder="Search clients & projects..."
        className="pl-9 bg-gray-50 border-gray-200 focus-visible:ring-[#F26B21]"
      />
      {open && (
        <div
          className="absolute top-11 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
          data-testid="global-search-results"
        >
          {!hasResults && <div className="px-4 py-3 text-sm text-gray-500">No results for "{q}"</div>}
          {results?.clients?.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Clients</div>
              {results.clients.map((c) => (
                <button
                  key={c.id}
                  data-testid={`search-result-client-${c.id}`}
                  onClick={() => go(`/clients/${c.id}`)}
                  className="w-full text-left px-4 py-2 hover:bg-orange-50 flex items-center justify-between transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800">{c.name}</span>
                  <span className="text-xs text-gray-400">{c.company}</span>
                </button>
              ))}
            </div>
          )}
          {results?.projects?.length > 0 && (
            <div className="pb-2">
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Projects</div>
              {results.projects.map((p) => (
                <button
                  key={p.id}
                  data-testid={`search-result-project-${p.id}`}
                  onClick={() => go(`/projects/${p.id}`)}
                  className="w-full text-left px-4 py-2 hover:bg-orange-50 flex items-center justify-between transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.client_name} · {labelize(p.status)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SidebarInner = ({ user, hasPerm, onNavigate }) => {
  const initials = (user?.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <>
      <div className="h-16 flex items-center px-5 border-b border-gray-100 shrink-0">
        <NavLink to="/dashboard" onClick={onNavigate} aria-label="dotindot home" className="flex items-center"><DotindotWordmark height={24} /></NavLink>
        <Badge variant="outline" className="ml-2.5 text-[9px] px-1.5 border-gray-200 text-gray-400">Ops</Badge>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV.map((section) => {
          const visible = section.items.filter(
            (i) => (!i.perm || hasPerm(...i.perm)) && (!i.when || i.when(user, hasPerm))
          );
          if (!visible.length) return null;
          return (
            <div key={section.section}>
              <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {section.section}
              </div>
              {visible.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
                      isActive
                        ? "bg-[#FFF7ED] text-[#F26B21]"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.name}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="p-3 border-t border-gray-100 shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white text-xs font-bold flex items-center justify-center">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-800 truncate">{user?.name}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{ROLE_LABELS[user?.role]}</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default function AppLayout({ children }) {
  const { user, hasPerm, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initials = (user?.name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex">
      {/* Desktop sidebar */}
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200/80 hidden lg:flex flex-col fixed inset-y-0 left-0 z-40">
        <SidebarInner user={user} hasPerm={hasPerm} />
      </aside>

      {/* Mobile slide-over sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col" data-testid="mobile-sidebar">
          <SidebarInner user={user} hasPerm={hasPerm} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen min-w-0">
        <header className="h-16 sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 flex items-center gap-2 sm:gap-6 px-3 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden !min-h-0 h-11 w-11 -ml-1 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
            data-testid="mobile-menu-btn"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <NavLink to="/dashboard" className="sm:hidden flex items-center" aria-label="dotindot home" data-testid="mobile-brand"><DotindotWordmark height={20} /></NavLink>
          <div className="hidden sm:block flex-1 max-w-md">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <button
              onClick={() => setMobileSearch((s) => !s)}
              className="sm:hidden !min-h-0 h-11 w-11 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
              data-testid="mobile-search-btn"
              aria-label="Toggle search"
            >
              <Search className="h-5 w-5" />
            </button>
            <NotificationsBell />
            <span className="hidden md:inline-flex"><RoleBadge role={user?.role} /></span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="user-menu-trigger"
                  className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-gray-50 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FE7A18] to-[#FFAD42] text-white text-xs font-bold flex items-center justify-center">
                    {initials}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-semibold">{user?.name}</div>
                  <div className="text-xs text-gray-400 font-normal">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="logout-btn" className="text-red-600 focus:text-red-600 cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {mobileSearch && (
          <div className="sm:hidden sticky top-16 z-30 bg-white border-b border-gray-200 px-3 py-2.5" data-testid="mobile-search-bar">
            <GlobalSearch />
          </div>
        )}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fadein min-w-0" key={location.pathname}>
          {children}
        </main>
      </div>
    </div>
  );
}

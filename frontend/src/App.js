import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import ClientsPage from "@/pages/ClientsPage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import ProjectsPage from "@/pages/ProjectsPage";
import NewProjectWizard from "@/pages/NewProjectWizard";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import UsersPage from "@/pages/UsersPage";
import MyExpensesPage from "@/pages/MyExpensesPage";
import FinanceOverview from "@/pages/finance/FinanceOverview";
import LedgerPage from "@/pages/finance/LedgerPage";
import ExpensesPage from "@/pages/finance/ExpensesPage";
import SubscriptionsPage from "@/pages/finance/SubscriptionsPage";
import BudgetsPage from "@/pages/finance/BudgetsPage";
import AiSpendPage from "@/pages/finance/AiSpendPage";
import MarketingPage from "@/pages/finance/MarketingPage";
import ProjectProfitPage from "@/pages/finance/ProjectProfitPage";
import EmployeeRevenuePage from "@/pages/finance/EmployeeRevenuePage";
import CeoDashboard from "@/pages/CeoDashboard";
import SalesOverview from "@/pages/sales/SalesOverview";
import PipelinePage from "@/pages/sales/PipelinePage";
import LeadDetailPage from "@/pages/sales/LeadDetailPage";
import QuotesPage from "@/pages/sales/QuotesPage";
import QuoteBuilderPage from "@/pages/sales/QuoteBuilderPage";
import QuoteViewPage from "@/pages/sales/QuoteViewPage";
import TargetsPage from "@/pages/sales/TargetsPage";
import EmployeesPage from "@/pages/EmployeesPage";
import EmployeeProfilePage from "@/pages/EmployeeProfilePage";
import LogsPage from "@/pages/LogsPage";
import PartnershipsPage from "@/pages/PartnershipsPage";
import LocationsPage from "@/pages/LocationsPage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import AccessControlPage from "@/pages/AccessControlPage";
import AssetsPage from "@/pages/AssetsPage";
import AdsPage from "@/pages/ads/AdsPage";
import AdCampaignDetailPage from "@/pages/ads/AdCampaignDetailPage";
import SocialPage from "@/pages/SocialPage";
import InfluencersPage from "@/pages/InfluencersPage";
import InfluencerDetailPage from "@/pages/InfluencerDetailPage";
import SalesHudPage from "@/pages/SalesHudPage";
import PasswordManagerPage from "@/pages/PasswordManagerPage";

const FIN_ANY = [
  "finance.ledger", "finance.expenses", "finance.subscriptions", "finance.budgets",
  "finance.ai_spend", "finance.marketing", "finance.project_profit", "finance.employee_revenue",
];
const SALES_ANY = ["sales.pipeline", "sales.quotes", "sales.targets"];

const HomeDashboard = () => {
  const { user } = useAuth();
  return ["super_admin", "admin"].includes(user?.role) ? <CeoDashboard /> : <DashboardPage />;
};

const Protected = ({ children, perm, roles, bare }) => {
  const { user, loading, hasPerm } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <div className="h-8 w-8 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  const permOk = !perm || hasPerm(...(Array.isArray(perm) ? perm : [perm]));
  const roleOk = !roles || user.role === "super_admin" || roles.includes(user.role);
  if (!permOk || !roleOk) return <Navigate to="/dashboard" replace />;
  return bare ? children : <AppLayout>{children}</AppLayout>;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Protected><HomeDashboard /></Protected>} />
          <Route path="/clients" element={<Protected perm="clients"><ClientsPage /></Protected>} />
          <Route path="/clients/:id" element={<Protected perm="clients"><ClientDetailPage /></Protected>} />
          <Route path="/projects" element={<Protected perm="projects"><ProjectsPage /></Protected>} />
          <Route path="/projects/new" element={<Protected perm="projects" roles={["admin", "pm", "sales"]}><NewProjectWizard /></Protected>} />
          <Route path="/projects/:id" element={<Protected perm="projects"><ProjectDetailPage /></Protected>} />
          <Route path="/admin/users" element={<Protected perm="user_management"><UsersPage /></Protected>} />
          <Route path="/access" element={<Protected perm="access_control"><AccessControlPage /></Protected>} />
          <Route path="/passwords" element={<Protected perm="password_manager"><PasswordManagerPage /></Protected>} />
          <Route path="/finance" element={<Protected perm={FIN_ANY}><FinanceOverview /></Protected>} />
          <Route path="/finance/ledger" element={<Protected perm="finance.ledger"><LedgerPage /></Protected>} />
          <Route path="/finance/expenses" element={<Protected perm="finance.expenses"><ExpensesPage /></Protected>} />
          <Route path="/finance/subscriptions" element={<Protected perm="finance.subscriptions"><SubscriptionsPage /></Protected>} />
          <Route path="/finance/budgets" element={<Protected perm="finance.budgets"><BudgetsPage /></Protected>} />
          <Route path="/finance/ai" element={<Protected perm="finance.ai_spend"><AiSpendPage /></Protected>} />
          <Route path="/finance/marketing" element={<Protected perm="finance.marketing"><MarketingPage /></Protected>} />
          <Route path="/finance/profit" element={<Protected perm="finance.project_profit"><ProjectProfitPage /></Protected>} />
          <Route path="/finance/employees" element={<Protected perm="finance.employee_revenue"><EmployeeRevenuePage /></Protected>} />
          <Route path="/my-expenses" element={<Protected><MyExpensesPage /></Protected>} />
          <Route path="/sales" element={<Protected perm={SALES_ANY}><SalesOverview /></Protected>} />
          <Route path="/sales/pipeline" element={<Protected perm="sales.pipeline"><PipelinePage /></Protected>} />
          <Route path="/sales/leads/:id" element={<Protected perm="sales.pipeline"><LeadDetailPage /></Protected>} />
          <Route path="/sales/quotes" element={<Protected perm="sales.quotes"><QuotesPage /></Protected>} />
          <Route path="/sales/quotes/new" element={<Protected perm="sales.quotes" roles={["admin", "sales"]}><QuoteBuilderPage /></Protected>} />
          <Route path="/sales/quotes/:id" element={<Protected perm="sales.quotes"><QuoteViewPage /></Protected>} />
          <Route path="/sales/quotes/:id/edit" element={<Protected perm="sales.quotes" roles={["admin", "sales"]}><QuoteBuilderPage /></Protected>} />
          <Route path="/sales/targets" element={<Protected perm="sales.targets"><TargetsPage /></Protected>} />
          <Route path="/hud" element={<Protected perm="sales.hud" bare><SalesHudPage /></Protected>} />
          <Route path="/ads" element={<Protected perm="ads"><AdsPage /></Protected>} />
          <Route path="/ads/:id" element={<Protected perm="ads"><AdCampaignDetailPage /></Protected>} />
          <Route path="/social" element={<Protected perm="social"><SocialPage /></Protected>} />
          <Route path="/influencers" element={<Protected perm="influencers"><InfluencersPage /></Protected>} />
          <Route path="/influencers/:id" element={<Protected perm="influencers"><InfluencerDetailPage /></Protected>} />
          <Route path="/assets" element={<Protected perm="assets"><AssetsPage /></Protected>} />
          <Route path="/employees" element={<Protected perm="employees"><EmployeesPage /></Protected>} />
          <Route path="/employees/:id" element={<Protected perm="employees"><EmployeeProfilePage /></Protected>} />
          <Route path="/partnerships" element={<Protected perm="partnerships"><PartnershipsPage /></Protected>} />
          <Route path="/locations" element={<Protected perm="locations"><LocationsPage /></Protected>} />
          <Route path="/logs" element={<Protected perm="logs"><LogsPage /></Protected>} />
          <Route path="/reports" element={<Protected perm="reports"><ReportsPage /></Protected>} />
          <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;

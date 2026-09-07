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

const STAFF = ["admin", "finance", "sales", "pm"];
const FIN = ["admin", "finance"];
const SALES_READ = ["admin", "sales", "pm", "finance"];
const SALES_WRITE = ["admin", "sales"];

const HomeDashboard = () => {
  const { user } = useAuth();
  return user?.role === "admin" ? <CeoDashboard /> : <DashboardPage />;
};

const Protected = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <div className="h-8 w-8 rounded-full border-2 border-[#F26B21] border-t-transparent animate-spin" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <AppLayout>{children}</AppLayout>;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Protected><HomeDashboard /></Protected>} />
          <Route path="/clients" element={<Protected roles={STAFF}><ClientsPage /></Protected>} />
          <Route path="/clients/:id" element={<Protected roles={STAFF}><ClientDetailPage /></Protected>} />
          <Route path="/projects" element={<Protected><ProjectsPage /></Protected>} />
          <Route path="/projects/new" element={<Protected roles={["admin", "pm", "sales"]}><NewProjectWizard /></Protected>} />
          <Route path="/projects/:id" element={<Protected><ProjectDetailPage /></Protected>} />
          <Route path="/admin/users" element={<Protected roles={["admin"]}><UsersPage /></Protected>} />
          <Route path="/finance" element={<Protected roles={FIN}><FinanceOverview /></Protected>} />
          <Route path="/finance/ledger" element={<Protected roles={FIN}><LedgerPage /></Protected>} />
          <Route path="/finance/expenses" element={<Protected roles={FIN}><ExpensesPage /></Protected>} />
          <Route path="/finance/subscriptions" element={<Protected roles={FIN}><SubscriptionsPage /></Protected>} />
          <Route path="/finance/budgets" element={<Protected roles={FIN}><BudgetsPage /></Protected>} />
          <Route path="/finance/ai" element={<Protected roles={FIN}><AiSpendPage /></Protected>} />
          <Route path="/finance/marketing" element={<Protected roles={FIN}><MarketingPage /></Protected>} />
          <Route path="/finance/profit" element={<Protected roles={["admin", "finance", "pm"]}><ProjectProfitPage /></Protected>} />
          <Route path="/finance/employees" element={<Protected roles={FIN}><EmployeeRevenuePage /></Protected>} />
          <Route path="/my-expenses" element={<Protected><MyExpensesPage /></Protected>} />
          <Route path="/sales" element={<Protected roles={SALES_READ}><SalesOverview /></Protected>} />
          <Route path="/sales/pipeline" element={<Protected roles={SALES_READ}><PipelinePage /></Protected>} />
          <Route path="/sales/leads/:id" element={<Protected roles={SALES_READ}><LeadDetailPage /></Protected>} />
          <Route path="/sales/quotes" element={<Protected roles={SALES_READ}><QuotesPage /></Protected>} />
          <Route path="/sales/quotes/new" element={<Protected roles={SALES_WRITE}><QuoteBuilderPage /></Protected>} />
          <Route path="/sales/quotes/:id" element={<Protected roles={SALES_READ}><QuoteViewPage /></Protected>} />
          <Route path="/sales/quotes/:id/edit" element={<Protected roles={SALES_WRITE}><QuoteBuilderPage /></Protected>} />
          <Route path="/sales/targets" element={<Protected roles={SALES_READ}><TargetsPage /></Protected>} />
          <Route path="/employees" element={<Protected><EmployeesPage /></Protected>} />
          <Route path="/employees/:id" element={<Protected><EmployeeProfilePage /></Protected>} />
          <Route path="/partnerships" element={<Protected roles={STAFF}><PartnershipsPage /></Protected>} />
          <Route path="/locations" element={<Protected roles={STAFF}><LocationsPage /></Protected>} />
          <Route path="/logs" element={<Protected roles={["admin"]}><LogsPage /></Protected>} />
          <Route path="/reports" element={<Protected roles={STAFF}><ReportsPage /></Protected>} />
          <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;

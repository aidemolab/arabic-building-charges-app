import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGuard } from "@/components/AuthGuard";
import { Layout } from "@/components/Layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import BuildingsPage from "@/pages/buildings";
import UnitsPage from "@/pages/units";
import PersonsPage from "@/pages/persons";
import ChargesPage from "@/pages/charges";
import ImportPage from "@/pages/import";
import AuditPage from "@/pages/audit";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

function RtlSetup() {
  useEffect(() => {
    document.documentElement.setAttribute("dir", "rtl");
    document.documentElement.setAttribute("lang", "ar");
    return () => {
      document.documentElement.removeAttribute("dir");
      document.documentElement.removeAttribute("lang");
    };
  }, []);
  return null;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <AuthGuard>
          <Layout>
            <DashboardPage />
          </Layout>
        </AuthGuard>
      </Route>
      <Route path="/charges">
        <AuthGuard>
          <Layout>
            <ChargesPage />
          </Layout>
        </AuthGuard>
      </Route>
      <Route path="/buildings">
        <AuthGuard>
          <Layout>
            <BuildingsPage />
          </Layout>
        </AuthGuard>
      </Route>
      <Route path="/units">
        <AuthGuard>
          <Layout>
            <UnitsPage />
          </Layout>
        </AuthGuard>
      </Route>
      <Route path="/persons">
        <AuthGuard>
          <Layout>
            <PersonsPage />
          </Layout>
        </AuthGuard>
      </Route>
      <Route path="/import">
        <AuthGuard>
          <Layout>
            <ImportPage />
          </Layout>
        </AuthGuard>
      </Route>
      <Route path="/audit">
        <AuthGuard>
          <Layout>
            <AuditPage />
          </Layout>
        </AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RtlSetup />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

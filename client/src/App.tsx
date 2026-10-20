import { lazy, Suspense } from "react";
import { Switch, Route, Router } from "wouter";
import { useGuardedHashLocation } from "@/lib/unsaved-navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import CalculatorPage from "@/pages/CalculatorPage";
import AdminPage from "@/pages/AdminPage";
import LeadsPage from "@/pages/LeadsPage";
import Layout from "@/components/Layout";

// DEV-CP-02 preview routes are split out, so the existing calculator keeps its
// current bundle size and load behavior.
const TariffProfilesPage = lazy(() => import("@/pages/TariffProfilesPage"));
const TariffEditorPage = lazy(() => import("@/pages/TariffEditorPage"));
const SimpleCalculatorPage = lazy(() => import("@/pages/SimpleCalculatorPage"));
const SimpleCatalogPage = lazy(() => import("@/pages/SimpleCatalogPage"));

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useGuardedHashLocation}>
        <Layout>
          <Switch>
            <Route path="/" component={CalculatorPage} />
            <Route path="/admin" component={AdminPage} />
            <Route path="/leads" component={LeadsPage} />
            <Route path="/simple/catalog">
              <Suspense fallback={<p>Загрузка…</p>}><SimpleCatalogPage /></Suspense>
            </Route>
            <Route path="/simple">
              <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка…</p>}>
                <SimpleCalculatorPage />
              </Suspense>
            </Route>
            {/* DEV-CP-02 preview routes: tariff profiles and editor */}
            <Route path="/tariffs">
              <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка…</p>}>
                <TariffProfilesPage />
              </Suspense>
            </Route>
            <Route path="/tariffs/:profileId">
              <Suspense fallback={<p className="text-sm text-muted-foreground">Загрузка…</p>}>
                <TariffEditorPage />
              </Suspense>
            </Route>
          </Switch>
        </Layout>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

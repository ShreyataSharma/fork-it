import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Welcome from "@/pages/Welcome";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";

import Home from "@/pages/Home";
import Loading from "@/pages/Loading";
import Recipes from "@/pages/Recipes";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/home">
        <RequireAuth>
          <AppLayout>
            <Home />
          </AppLayout>
        </RequireAuth>
      </Route>
      <Route path="/loading">
        <AppLayout>
          <Loading />
        </AppLayout>
      </Route>
      <Route path="/recipes">
        <AppLayout>
          <Recipes />
        </AppLayout>
      </Route>
      <Route>
        <AppLayout>
          <div className="p-6 text-espresso">Page not found</div>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

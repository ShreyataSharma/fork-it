import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Auth from "@/pages/Auth";
import AppLayout from "@/components/AppLayout";

import Home from "@/pages/Home";
import Loading from "@/pages/Loading";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Auth} />
      <Route path="/home">
        <AppLayout>
          <Home />
        </AppLayout>
      </Route>
      <Route path="/loading">
        <AppLayout>
          <Loading />
        </AppLayout>
      </Route>
      <Route path="/recipes">
        <AppLayout>
          <div className="p-6 text-espresso">Recipes Screen Coming Soon...</div>
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

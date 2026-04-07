import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Auth from "@/pages/Auth";
import AppLayout from "@/components/AppLayout";

function HomePlaceholder() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-serif text-espresso mb-4">What's in your fridge?</h2>
      <p className="text-olive-mid">You are successfully logged in and viewing the layout shell!</p>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Auth} />
      <Route path="/home">
        <AppLayout>
          <HomePlaceholder />
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

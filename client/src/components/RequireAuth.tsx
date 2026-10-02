import { useEffect, useState, type ReactNode } from "react";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Renders children only for signed-in users; everyone else is sent to the Welcome page.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setStatus(data.session ? "in" : "out"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "in" : "out");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <Loader2 className="animate-spin text-olive" />
      </div>
    );
  }
  if (status === "out") return <Redirect to="/" />;
  return <>{children}</>;
}

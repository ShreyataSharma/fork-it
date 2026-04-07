import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot_password">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name }
          }
        });
        if (error) throw error;
        toast({ title: "Account created!", description: "Check your email to confirm." });
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        toast({ title: "Welcome back!" });
      } else if (mode === "forgot_password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        toast({ title: "Password reset sent", description: "Check your email for a reset link." });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-serif text-espresso mb-2">Fork It</h1>
          <p className="text-olive-mid font-medium">Your AI Sous Chef</p>
        </div>
        
        <Card className="border-olive-pale shadow-lg rounded-2xl">
          <CardHeader>
            <CardTitle className="text-2xl text-espresso font-serif">
              {mode === "login" ? "Welcome back" : mode === "signup" ? "Create an account" : "Reset password"}
            </CardTitle>
            <CardDescription>
              {mode === "login" ? "Enter your email to sign in" : mode === "signup" ? "Enter your details to sign up" : "Enter your email to receive a reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input 
                    id="name" 
                    type="text" 
                    placeholder="Gordon Ramsay" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required 
                    className="focus-visible:ring-olive"
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="chef@forkit.app" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                  className="focus-visible:ring-olive"
                />
              </div>

              {mode !== "forgot_password" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                    className="focus-visible:ring-olive"
                  />
                </div>
              )}
              
              <Button type="submit" className="w-full bg-olive hover:bg-olive-mid text-white" disabled={loading}>
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : mode === "signup" ? "Sign Up" : "Send Reset Link"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 text-sm text-center">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => setMode("forgot_password")} className="text-olive hover:text-espresso font-medium transition-colors">
                  Forgot password?
                </button>
                <div className="text-muted-foreground">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => setMode("signup")} className="text-olive hover:text-espresso font-medium transition-colors">
                    Sign up
                  </button>
                </div>
              </>
            ) : mode === "signup" ? (
              <div className="text-muted-foreground">
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-olive hover:text-espresso font-medium transition-colors">
                  Sign in
                </button>
              </div>
            ) : (
              <div className="text-muted-foreground">
                Remember your password?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-olive hover:text-espresso font-medium transition-colors">
                  Sign in
                </button>
              </div>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

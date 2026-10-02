import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import kitchenHero from "@/assets/home/kitchen-hero.png";
import utensilsIcon from "@/assets/home/utensils.svg";
import arrowRightIcon from "@/assets/home/arrow-right.svg";

type Tab = "signup" | "login";

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const inputClass =
  "h-12 w-full rounded-xl border border-mist/60 bg-white px-4 text-[16px] text-espresso placeholder:text-espresso/40 focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/20";
const labelClass = "mb-1.5 block text-[13px] font-semibold text-espresso/80";

export default function Welcome() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("signup");
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Already signed in (including returning from Google OAuth): skip the form.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setLocation("/home");
    });
  }, [setLocation]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError("");
    setNotice("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (tab === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return setError(error.message);
        // With email confirmation on, Supabase returns no session until the link is clicked.
        if (!data.session) return setNotice("Check your email to confirm your account, then log in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return setError(
            error.code === "invalid_credentials" || error.message === "Invalid login credentials"
              ? "Email or password is incorrect"
              : error.message,
          );
        }
      }
      setLocation("/home");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setNotice("If an account exists for that email, a reset link is on its way.");
  };

  const handleGoogle = async () => {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/home` },
    });
    if (error) setError(error.message);
  };

  const submitLabel = tab === "signup" ? "Create account" : "Log in";

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <main className="mx-auto grid w-full max-w-[1120px] flex-1 grid-cols-1 gap-12 px-8 pb-16 pt-12 md:grid-cols-2 md:items-center md:gap-16 md:pt-16">
        {/* Hero */}
        <section className="flex flex-col">
          <div className="relative mx-auto w-full max-w-[326px] md:max-w-[460px]">
            <div className="absolute inset-[8px] rounded-full bg-[rgba(107,122,58,0.1)] blur-[32px]" aria-hidden />
            <div className="relative aspect-square w-full rotate-1 overflow-hidden rounded-[16px] shadow-[0px_12px_32px_0px_rgba(27,28,24,0.04)]">
              <img src={kitchenHero} alt="Warm, cozy kitchen" className="h-full w-full object-cover" />
            </div>
            <div className="absolute -bottom-[13px] -right-[5px] flex items-center gap-2 rounded-full border border-mist/15 bg-white px-[21px] py-[13px] drop-shadow-[0px_12px_16px_rgba(27,28,24,0.04)]">
              <img src={utensilsIcon} alt="" width={8.75} height={11.6667} />
              <span className="text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] text-olive">
                Made at home
              </span>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center gap-[15px] text-center">
            <h1 className="max-w-[240px] font-serif text-[36px] leading-[45px] tracking-[-0.9px] text-espresso">
              Cook something amazing tonight
            </h1>
            <p className="max-w-[280px] text-[18px] leading-[29.25px] text-olive/70">
              Tell us what's in your fridge — we'll do the rest
            </p>
          </div>
        </section>

        {/* Form */}
        <section className="mx-auto flex w-full max-w-[400px] flex-col">
          <span className="mb-4 text-center text-[12px] font-semibold uppercase leading-4 tracking-[1.2px] text-espresso/50">
            Get started
          </span>

          {forgot ? (
            <form onSubmit={handleReset} className="flex flex-col gap-5">
              <p className="text-center text-[15px] leading-6 text-espresso/70">
                Enter your email and we'll send you a link to reset your password.
              </p>
              <div>
                <label htmlFor="reset-email" className={labelClass}>Email</label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              {error && <p className="text-[13px] font-medium text-red-600">{error}</p>}
              {notice && <p className="text-[13px] font-medium text-olive">{notice}</p>}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-olive py-5 text-[18px] font-bold leading-7 text-white shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] transition-opacity disabled:opacity-60"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForgot(false);
                  setError("");
                  setNotice("");
                }}
                className="text-center text-[14px] font-medium leading-5 text-olive hover:text-espresso"
              >
                Back
              </button>
            </form>
          ) : (
            <>
              <div role="tablist" className="flex rounded-full bg-stone p-1">
                {(["signup", "login"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => switchTab(t)}
                    className={`flex-1 rounded-full py-2 text-[14px] font-bold leading-5 transition-colors ${
                      tab === t ? "bg-olive text-white shadow-sm" : "text-espresso/70 hover:text-espresso"
                    }`}
                  >
                    {t === "signup" ? "Create account" : "Log in"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
                <div>
                  <label htmlFor="email" className={labelClass}>Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="password" className={labelClass}>Password</label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={tab === "signup" ? 8 : undefined}
                    autoComplete={tab === "signup" ? "new-password" : "current-password"}
                    placeholder={tab === "signup" ? "At least 8 characters" : "Your password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    className={inputClass}
                  />
                  {error && <p className="mt-2 text-[13px] font-medium text-red-600">{error}</p>}
                  {notice && <p className="mt-2 text-[13px] font-medium text-olive">{notice}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-olive py-5 text-[18px] font-bold leading-7 text-white shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)] transition-opacity disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      {submitLabel}
                      <img src={arrowRightIcon} alt="" width={16} height={16} />
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setForgot(true);
                  setError("");
                  setNotice("");
                }}
                className="mt-5 self-center text-[14px] font-medium leading-5 text-olive hover:text-espresso"
              >
                Forgot password?
              </button>

              <div className="my-6 flex items-center gap-4" aria-hidden>
                <div className="h-px flex-1 bg-mist/50" />
                <span className="text-[12px] uppercase tracking-[1.2px] text-espresso/40">or</span>
                <div className="h-px flex-1 bg-mist/50" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-mist bg-white py-4 text-[16px] font-semibold leading-6 text-espresso transition-colors hover:bg-stone/40"
              >
                <GoogleLogo />
                Continue with Google
              </button>
            </>
          )}
        </section>
      </main>

      <footer className="flex flex-col items-center gap-6 bg-cream px-8 py-12">
        <span className="font-serif text-[18px] italic leading-7 text-espresso">Fork It</span>
        <div className="flex gap-6 text-[12px] uppercase leading-4 tracking-[1.2px] text-espresso/40">
          <span>Privacy</span>
          <span>Terms</span>
          <span>Support</span>
        </div>
        <span className="text-[10px] uppercase leading-[15px] tracking-[1px] text-espresso/30">
          © 2024 Fork It. Crafted for the modern kitchen.
        </span>
      </footer>
    </div>
  );
}

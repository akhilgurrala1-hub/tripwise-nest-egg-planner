import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Compass, Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { safeRedirect, useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search["redirect"]),
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Waypoint" },
      {
        name: "description",
        content: "Sign in or create a Waypoint account to see real places along your route.",
      },
      { property: "og:title", content: "Sign in — Waypoint" },
      {
        property: "og:description",
        content: "Create a free Waypoint account to unlock real routes and places.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { redirect } = Route.useSearch();
  const router = useRouter();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<"" | "confirm" | "reset">("");

  const goNext = () => router.history.push(redirect ?? "/road-trip");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        goNext();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${redirect ?? "/road-trip"}` },
        });
        if (error) throw error;
        if (data.session) goNext();
        else setSent("confirm");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("reset");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 pt-10">
      <div className="surface-card animate-rise p-6">
        <span className="grid size-11 place-items-center rounded-full bg-gradient-sunset text-sunset-foreground shadow-glow">
          <Compass className="size-5" />
        </span>

        {user ? (
          <>
            <h1 className="mt-4 font-display text-3xl font-semibold">You're signed in</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
            <Button className="mt-6 w-full" onClick={goNext}>
              Continue
            </Button>
          </>
        ) : sent ? (
          <>
            <MailCheck className="mt-4 size-8 text-success" />
            <h1 className="mt-2 font-display text-3xl font-semibold">Check your email</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {sent === "confirm"
                ? `We sent a confirmation link to ${email}. Open it to finish creating your account.`
                : `If an account exists for ${email}, a password reset link is on its way.`}
            </p>
            <Button
              variant="outline"
              className="mt-6 w-full"
              onClick={() => {
                setSent("");
                setMode("signin");
              }}
            >
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <h1 className="mt-4 font-display text-3xl font-semibold">
              {mode === "signin"
                ? "Welcome back"
                : mode === "signup"
                  ? "Create your account"
                  : "Reset your password"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "forgot"
                ? "We'll email you a link to choose a new password."
                : "Sign in to see real places, drive times and routes for your trips."}
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 h-11 rounded-xl bg-card"
                />
              </div>
              {mode !== "forgot" && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs font-semibold text-primary"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 h-11 rounded-xl bg-card"
                  />
                </div>
              )}
              <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "signup" ? (
                <>
                  Already have an account?{" "}
                  <button className="font-semibold text-primary" onClick={() => setMode("signin")}>
                    Sign in
                  </button>
                </>
              ) : mode === "signin" ? (
                <>
                  New to Waypoint?{" "}
                  <button className="font-semibold text-primary" onClick={() => setMode("signup")}>
                    Create an account
                  </button>
                </>
              ) : (
                <button className="font-semibold text-primary" onClick={() => setMode("signin")}>
                  Back to sign in
                </button>
              )}
            </p>
          </>
        )}
      </div>
      <Link
        to="/"
        className="mt-4 text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Keep planning without an account
      </Link>
    </div>
  );
}

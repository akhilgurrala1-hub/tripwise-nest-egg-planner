import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LogoMark } from "@/components/app/Logo";
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
      { title: "Sign in | Waypoint" },
      {
        name: "description",
        content: "Sign in or create a Waypoint account to see real places along your route.",
      },
      { property: "og:title", content: "Sign in | Waypoint" },
      {
        property: "og:description",
        content:
          "Create a free Waypoint account to save trips and plan with real routes and places.",
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
        if (data.session) {
          // Email confirmation is off for this project, so the account is ready right away.
          toast.success("Account created. You're signed in", {
            description: "No confirmation email is needed.",
          });
          goNext();
        } else setSent("confirm");
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
      <div className="surface-card p-6">
        <LogoMark className="size-10" />

        {user ? (
          <>
            <h1 className="title-display mt-4 text-4xl">You're signed in</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
            <Button className="mt-6 w-full" onClick={goNext}>
              Continue
            </Button>
          </>
        ) : sent ? (
          <>
            <MailCheck className="mt-4 size-8 text-success" />
            <h1 className="title-display mt-2 text-4xl">Check your email</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {sent === "confirm"
                ? `We sent a confirmation link to ${email}. Open it to finish creating your account. It can take a few minutes, so check your spam folder too.`
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
            <h1 className="title-display mt-4 text-4xl">
              {mode === "signin"
                ? "Welcome back"
                : mode === "signup"
                  ? "Create your account"
                  : "Reset your password"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "forgot"
                ? "We'll email you a link to choose a new password."
                : mode === "signup"
                  ? "Save your trips to your account."
                  : "Sign in to your account."}
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
                  className="mt-2 h-11 rounded-xl bg-card"
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
                    aria-describedby={mode === "signup" ? "password-hint" : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 h-11 rounded-xl bg-card"
                  />
                  {mode === "signup" && (
                    <p id="password-hint" className="mt-2 text-xs text-muted-foreground">
                      At least 6 characters.
                    </p>
                  )}
                </div>
              )}
              <Button type="submit" variant="hero" className="w-full" loading={busy}>
                {mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
              </Button>
              {mode === "signup" && (
                <p className="text-xs text-muted-foreground">
                  By creating an account you agree to the{" "}
                  <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/privacy"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              )}
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
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

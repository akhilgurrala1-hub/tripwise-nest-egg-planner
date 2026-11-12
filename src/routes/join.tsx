import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import {
  JOIN_PATH,
  JOIN_STORAGE_KEY,
  acceptInvite,
  friendlyShareError,
  sharedTripsQuery,
  tokenFromHash,
} from "@/lib/members";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Join a trip | Waypoint" },
      { name: "description", content: "Open a trip someone invited you to view." },
      // An invite is private: keep it out of search results.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function readToken(): string | null {
  try {
    const fromLink = tokenFromHash(window.location.hash);
    if (fromLink) {
      window.sessionStorage.setItem(JOIN_STORAGE_KEY, fromLink);
      // The token leaves the address bar and the browser history right away.
      window.history.replaceState(null, "", JOIN_PATH);
    }
    return tokenFromHash(window.sessionStorage.getItem(JOIN_STORAGE_KEY) ?? "");
  } catch {
    return null;
  }
}

/** Opening an invite link never joins by itself: you see what it is, then choose to join. */
function JoinPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setToken(readToken()), []);

  const join = async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const tripId = await acceptInvite(token, nickname);
      window.sessionStorage.removeItem(JOIN_STORAGE_KEY);
      void queryClient.invalidateQueries({ queryKey: sharedTripsQuery.queryKey });
      void navigate({ to: "/shared-trip/$id", params: { id: tripId } });
    } catch (e) {
      // Whatever went wrong, this token is no use again: don't keep it.
      window.sessionStorage.removeItem(JOIN_STORAGE_KEY);
      setToken(null);
      setError(friendlyShareError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 pt-10 pb-24">
      <h1 className="title-display text-large-title">Join a trip</h1>
      {token === undefined || loading ? (
        <p className="mt-4 text-muted-foreground">Checking your invite…</p>
      ) : error ? (
        <div role="alert" className="mt-4 space-y-4">
          <p>{error}</p>
          <Button asChild variant="outline">
            <Link to="/">Go to Waypoint</Link>
          </Button>
        </div>
      ) : !token ? (
        <div className="mt-4 space-y-4">
          <p className="text-muted-foreground">
            This page needs an invite link from the person who owns a trip. Open the link they sent
            you.
          </p>
          <Button asChild variant="outline">
            <Link to="/">Go to Waypoint</Link>
          </Button>
        </div>
      ) : !user ? (
        <div className="mt-4 space-y-4">
          <p className="text-muted-foreground">
            Someone invited you to view their trip plan. Sign in or create a free account to
            continue; your invite waits here.
          </p>
          <Button asChild variant="hero">
            <Link to="/auth" search={{ redirect: JOIN_PATH }}>
              Sign in to continue
            </Link>
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-muted-foreground">
            You've been invited to view a trip plan. You'll see the days and places only. The
            owner's budget, prices, bookings, spending and saved preferences stay private, and you
            can leave any time.
          </p>
          <div className="space-y-2">
            <label htmlFor="nick" className="text-sm font-semibold">
              Name the owner will see (optional)
            </label>
            <Input
              id="nick"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={40}
              placeholder="For example, Sam"
              autoComplete="nickname"
            />
            <p className="text-xs text-muted-foreground">
              Your email address is never shown to the owner.
            </p>
          </div>
          <Button variant="hero" onClick={join} disabled={busy}>
            {busy ? "Joining…" : "Join this trip"}
          </Button>
        </div>
      )}
    </div>
  );
}

import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { deleteMyAccount } from "@/lib/account-data.functions";

import { PageHeader } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PREFERENCES,
  MEMBERSHIPS,
  preferencesQuery,
  savePreferences,
  type Preferences,
} from "@/lib/account";
import { ACCESSIBILITY, DIETARY } from "@/lib/needs";
import { airportByCode, airportsNear } from "@/lib/airports";
import { INTERESTS, TRANSPORT_MODES, TRAVEL_STYLES } from "@/lib/demo-data";
import { useAirports } from "@/lib/live/use-airports";
import { geocodeQuery, useDebouncedValue } from "@/lib/live/use-live";
import { cn } from "@/lib/utils";

/** Everything saved under the account, as one JSON file. Reads go through row-level security. */
async function exportMyData(email: string) {
  const [trips, bookings, prefs] = await Promise.all([
    supabase.from("trips").select("*"),
    supabase.from("bookings").select("*"),
    supabase.from("traveler_preferences").select("*"),
  ]);
  if (trips.error || bookings.error || prefs.error) throw new Error("Couldn't read your data.");
  const file = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      email,
      trips: trips.data,
      bookings: bookings.data,
      preferences: prefs.data,
    },
    null,
    2,
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([file], { type: "application/json" }));
  a.download = "waypoint-my-data.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function YourData({ email }: { email: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    try {
      const res = await deleteMyAccount({ data: { confirmEmail: confirm } });
      if (!res.ok) return void toast.error(res.error);
      await supabase.auth.signOut();
      window.localStorage.clear();
      window.location.assign("/");
    } catch {
      toast.error("Couldn't delete the account. Try again, or contact us.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="surface-card space-y-4 p-6">
      <div>
        <h2 className="title-display text-title-1">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Download what Waypoint has saved for you, or delete your account. Trips saved only in this
          browser stay here until you clear them.
        </p>
      </div>
      <Button
        variant="outline"
        onClick={() =>
          exportMyData(email).catch(() => toast.error("Couldn't export your data. Try again."))
        }
      >
        Download my data
      </Button>
      <div className="border-t border-separator pt-4">
        <p className="text-sm font-semibold">Delete my account</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This permanently deletes your sign-in, saved trips, bookings and preferences. It can't be
          undone. Type your email address to confirm.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            aria-label="Type your email to confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={email}
            className="max-w-xs"
          />
          <Button
            variant="outline"
            disabled={busy || confirm.trim().toLowerCase() !== email.toLowerCase()}
            onClick={del}
          >
            {busy ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </div>
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile & preferences | Waypoint" },
      {
        name: "description",
        content: "Your home city, airport, travel style and interests, used to plan new trips.",
      },
      { property: "og:title", content: "Profile & preferences | Waypoint" },
      { property: "og:description", content: "Tell Waypoint how you like to travel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? "none";
    const prefs = await context.queryClient.ensureQueryData(preferencesQuery(userId));
    return { userId, email: data.user?.email ?? "", hasPrefs: !!prefs };
  },
  component: ProfilePage,
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-3xl p-6 text-sm text-destructive">
      {error instanceof Error ? error.message : "Couldn't load your profile."}
    </div>
  ),
});

function ProfilePage() {
  const { userId, email } = Route.useLoaderData();
  const { data: saved } = useSuspenseQuery(preferencesQuery(userId));
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Preferences>(saved ?? DEFAULT_PREFERENCES);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "interests" | "memberships" | "dietary" | "accessibility", v: string) =>
    setForm((f) => ({
      ...f,
      [k]: (f[k] as string[]).includes(v)
        ? (f[k] as string[]).filter((x) => x !== v)
        : [...f[k], v],
    }));
  const airportOk = form.home_airport === "" || /^[A-Z]{3}$/.test(form.home_airport);

  const save = async () => {
    if (!airportOk) {
      toast.error("Home airport should be a 3-letter code, like CLT.");
      return;
    }
    setSaving(true);
    try {
      await savePreferences(userId, { ...form, home_city: form.home_city.trim() });
      await queryClient.invalidateQueries({ queryKey: ["account", "preferences"] });
      toast.success("Preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Profile & preferences" showTrip={false} />
      <div className="mx-auto mt-6 max-w-3xl space-y-6 px-4">
        <section className="surface-card p-6">
          <p className="text-footnote text-muted-foreground">Signed in as</p>
          <p className="font-semibold">{email}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link
              to="/trips"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Saved trips
            </Link>
            <Link
              to="/bookings"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Bookings
            </Link>
            <Link
              to="/reset-password"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Change password
            </Link>
          </div>
        </section>

        <YourData email={email} />

        <section className="surface-card space-y-6 p-6">
          <div>
            <h2 className="title-display text-title-1">How you like to travel</h2>
            <p className="text-sm text-muted-foreground">
              Your home city and airport, travel style, usual group size and interests shape new
              trips and what Waypoint suggests. Flight prices search from your home airport. The
              usual way to get there is saved but not used yet.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="home-city">Home city</Label>
              <Input
                id="home-city"
                value={form.home_city}
                maxLength={120}
                placeholder="Charlotte, NC"
                onChange={(e) => set("home_city", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="home-airport">Home airport code</Label>
              <Input
                id="home-airport"
                value={form.home_airport}
                placeholder="CLT"
                aria-invalid={!airportOk}
                onChange={(e) =>
                  set(
                    "home_airport",
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, "")
                      .slice(0, 3),
                  )
                }
              />
              <AirportHint
                code={form.home_airport}
                city={form.home_city}
                onPick={(code) => set("home_airport", code)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="travelers">Usual number of travelers</Label>
              <Input
                id="travelers"
                type="number"
                min={1}
                max={20}
                value={form.travelers}
                onChange={(e) =>
                  set(
                    "travelers",
                    Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transport">Usual way to get there (saved, not used yet)</Label>
              <select
                id="transport"
                value={form.transport_mode}
                onChange={(e) =>
                  set("transport_mode", e.target.value as Preferences["transport_mode"])
                }
                className="h-10 w-full rounded-md border border-input bg-background px-4 text-sm"
              >
                {TRANSPORT_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold">Travel style</legend>
            <div className="grid grid-cols-3 gap-2">
              {TRAVEL_STYLES.map((s) => (
                <Chip
                  key={s.id}
                  active={form.travel_style === s.id}
                  onClick={() => set("travel_style", s.id)}
                >
                  {s.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold">Interests</legend>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <Chip
                  key={i.id}
                  active={form.interests.includes(i.id)}
                  onClick={() => toggle("interests", i.id)}
                >
                  {i.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-1 text-sm font-semibold">Memberships & travel cards</legend>
            <p className="mb-2 text-xs text-muted-foreground">
              Shown as reminders on the Booking checklist next to the bookings they might help with
              (lounges, member rates, card travel benefits). Waypoint doesn't know your plan's
              terms, so they never change prices. Don't enter card numbers anywhere.
            </p>
            <div className="flex flex-wrap gap-2">
              {MEMBERSHIPS.map((m) => (
                <Chip
                  key={m}
                  active={form.memberships.includes(m)}
                  onClick={() => toggle("memberships", m)}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-1 text-sm font-semibold">Food needs (optional)</legend>
            <p className="mb-2 text-xs text-muted-foreground">
              When you ask the AI planner for a plan, these are sent to Google's Gemini service with
              your request, so it can favor restaurants likely to suit you (see Privacy). Waypoint
              can't verify that a place meets a need, so always confirm with the restaurant. Stored
              privately, never in share links, deleted with your account.
            </p>
            <div className="flex flex-wrap gap-2">
              {DIETARY.map((d) => (
                <Chip
                  key={d.id}
                  active={form.dietary.includes(d.id)}
                  onClick={() => toggle("dietary", d.id)}
                >
                  {d.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-1 text-sm font-semibold">Access needs (optional)</legend>
            <p className="mb-2 text-xs text-muted-foreground">
              When you ask the AI planner for a plan, these are sent to Google's Gemini service with
              your request, so it can favor accessible places and shorter walks (see Privacy).
              Waypoint has no verified accessibility data, so confirm with each venue. Stored
              privately, never in share links, deleted with your account.
            </p>
            <div className="flex flex-wrap gap-2">
              {ACCESSIBILITY.map((a) => (
                <Chip
                  key={a.id}
                  active={form.accessibility.includes(a.id)}
                  onClick={() => toggle("accessibility", a.id)}
                >
                  {a.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <Button variant="hero" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Save preferences
          </Button>
        </section>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

/** What a typed code is, or the airports nearest the home city to pick from. */
function AirportHint({
  code,
  city,
  onPick,
}: {
  code: string;
  city: string;
  onPick: (code: string) => void;
}) {
  const airports = useAirports();
  const typed = useDebouncedValue(city.trim());
  const geo = useQuery({ ...geocodeQuery(typed), enabled: typed.length >= 2 });
  if (!airports) return null;
  const known = code.length === 3 ? airportByCode(airports, code) : null;
  if (code.length === 3)
    return known ? (
      <p className="text-xs text-muted-foreground">{known.name}</p>
    ) : (
      <p className="text-xs text-destructive">No airport with scheduled flights uses {code}.</p>
    );
  const p = geo.data?.[0];
  const near = p ? airportsNear(airports, { lat: p.lat, lon: p.lon }, 3) : [];
  if (!near.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      Nearest:
      {near.map((a) => (
        <button
          key={a.code}
          type="button"
          onClick={() => onPick(a.code)}
          title={a.name}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {a.code} ({a.miles} mi)
        </button>
      ))}
    </p>
  );
}

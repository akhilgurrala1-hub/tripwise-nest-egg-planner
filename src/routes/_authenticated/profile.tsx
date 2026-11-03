import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { INTERESTS, TRANSPORT_MODES, TRAVEL_STYLES } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile & preferences — Waypoint" },
      {
        name: "description",
        content: "Your home city, airport, travel style and interests, used to plan new trips.",
      },
      { property: "og:title", content: "Profile & preferences — Waypoint" },
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
  const toggle = (k: "interests" | "memberships", v: string) =>
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
      <PageHeader eyebrow="Your account" title="Profile & preferences" showTrip={false} />
      <div className="mx-auto mt-6 max-w-3xl space-y-6 px-4">
        <section className="surface-card p-5">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Signed in as
          </p>
          <p className="font-semibold">{email}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
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

        <section className="surface-card space-y-5 p-5">
          <div>
            <h2 className="text-[15px] font-semibold">How you like to travel</h2>
            <p className="text-sm text-muted-foreground">
              New trips start with these choices, and flight prices search from your home airport.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="home-city">Home city</Label>
              <Input
                id="home-city"
                value={form.home_city}
                maxLength={120}
                placeholder="Charlotte, NC"
                onChange={(e) => set("home_city", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
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
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="transport">Usual way to get there</Label>
              <select
                id="transport"
                value={form.transport_mode}
                onChange={(e) =>
                  set("transport_mode", e.target.value as Preferences["transport_mode"])
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
              Saved for perk matching, such as lounges and member travel deals. Perks aren't applied
              to prices yet.
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
        "min-h-10 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

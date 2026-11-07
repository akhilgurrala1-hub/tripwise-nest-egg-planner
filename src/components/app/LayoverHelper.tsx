import { Check, Clock, Plane, X } from "lucide-react";
import { useState } from "react";

import countryRows from "@/data/countries.json";
import { Input } from "@/components/ui/input";
import { airportByCode, airportByName, airportCity, type Airport } from "@/lib/airports";
import { safeExternalUrl } from "@/lib/booking";
import { layoverAdvice, type LayoverAdvice } from "@/lib/layovers";
import type { Layover } from "@/lib/prices/live";
import { useAirports } from "@/lib/live/use-airports";
import { useVisas } from "@/lib/live/use-visas";
import { tripActions, useTrip } from "@/lib/trip-store";
import { entryRule, OFFICIAL_CHECK, type VisaTable } from "@/lib/visas";
import { cn } from "@/lib/utils";

const COUNTRIES = (countryRows as { code: string; name: string }[])
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name));
const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;

/**
 * Layovers: whether there's time and permission to leave the airport on the
 * traveler's passport, and what to do inside if not. Uses the connections in live
 * flight results when there are any, and checks any airport they type.
 */
export function LayoverHelper({ homeCountry }: { homeCountry: string }) {
  const { trip } = useTrip();
  const visas = useVisas();
  const airports = useAirports();
  const passport = trip.setup.passport ?? homeCountry;
  const [where, setWhere] = useState("");
  const [hours, setHours] = useState(6);
  const [overnight, setOvernight] = useState(false);

  // Connections in the cheapest live result, when prices were fetched.
  const live = (trip.live?.flights?.options[0]?.layovers ?? []).filter((l) => l.minutes >= 60);
  const typed =
    airports && where.trim()
      ? (airportByCode(airports, where) ?? airportByName(airports, where))
      : null;

  return (
    <section aria-labelledby="layovers-title" className="surface-card p-6 sm:p-6">
      <h2 id="layovers-title" className="title-display text-title-1 leading-tight">
        Layovers
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Whether you can leave the airport on your passport, if there's time, and what to do inside
        if not.
      </p>
      <label className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Your passport</span>
        <select
          value={passport}
          onChange={(e) => tripActions.setPassport(e.target.value)}
          className="h-10 rounded-lg border border-input bg-fill px-4 text-sm"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {live.length > 0 && airports && visas && (
        <div className="mt-6 space-y-4">
          <p className="eyebrow">In your cheapest flight</p>
          {live.map((l) => (
            <AdviceFor
              key={l.code}
              layover={l}
              airport={airportByCode(airports, l.code)}
              passport={passport}
              visas={visas}
            />
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => e.preventDefault()}
        className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
      >
        <label className="text-xs text-muted-foreground">
          Check a layover: airport or city
          <Input
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="e.g. IST or Doha"
            className="mt-1 h-10"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Length
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="mt-1 block h-10 rounded-lg border border-input bg-fill px-4 text-sm text-foreground"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
              <option key={h} value={h}>
                {h} hour{h === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overnight}
            onChange={(e) => setOvernight(e.target.checked)}
            className="size-4"
          />
          Overnight
        </label>
      </form>
      {where.trim() && airports && !typed && (
        <p className="mt-2 text-xs text-muted-foreground">
          No airport found for "{where.trim()}". Try its code, like IST, or the city.
        </p>
      )}
      {typed && visas && (
        <div className="mt-4">
          <AdviceFor
            layover={{ code: typed.code, name: typed.name, minutes: hours * 60, overnight }}
            airport={typed}
            passport={passport}
            visas={visas}
          />
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Entry rules from the Passport Index (updated {visas?.updated ?? "recently"}). They change,
        and airport transit rules have exceptions, so confirm with{" "}
        <a
          href={OFFICIAL_CHECK.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary hover:underline"
        >
          IATA Travel Centre
        </a>{" "}
        or your airline before you count on leaving.
      </p>
    </section>
  );
}

function AdviceFor({
  layover,
  airport,
  passport,
  visas,
}: {
  layover: Layover;
  airport: Airport | null;
  passport: string;
  visas: VisaTable;
}) {
  const country = airport?.country ?? "";
  const advice = layoverAdvice({
    minutes: layover.minutes,
    overnight: layover.overnight,
    code: layover.code,
    name: airport?.name ?? layover.name,
    city: airport ? airportCity(airport.city) : "",
    country,
    entry: entryRule(visas, passport, country),
    passport,
  });
  return (
    <AdviceCard
      advice={advice}
      code={layover.code}
      name={airport?.name ?? layover.name}
      passportName={countryName(passport)}
    />
  );
}

function AdviceCard({
  advice,
  code,
  name,
  passportName,
}: {
  advice: LayoverAdvice;
  code: string;
  name: string;
  passportName: string;
}) {
  const leaves = advice.canLeave === "yes";
  return (
    <article className="rounded-xl border border-border p-4">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Plane className="size-4 translate-y-0.5 text-muted-foreground" aria-hidden />
        <h3 className="text-headline font-semibold">
          {code} · {name}
        </h3>
        <span className="tabular flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="size-3.5" aria-hidden /> {advice.duration}
        </span>
      </header>
      <p className={cn("mt-2 flex gap-2 text-sm", leaves ? "text-success" : "text-foreground")}>
        {leaves ? (
          <Check className="mt-1 size-4 shrink-0" aria-hidden />
        ) : (
          <X className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span>
          <span className="sr-only">{passportName} passport: </span>
          {advice.leaveText}
        </span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{advice.verdictText}</p>
      <ul className="mt-4 space-y-1 text-sm">
        {advice.inside.map((i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
            {i}
          </li>
        ))}
      </ul>
      {advice.notes.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {advice.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-4">
        {advice.links.map((l) => (
          <a
            key={l.label}
            href={safeExternalUrl(l.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            {l.label}
          </a>
        ))}
      </div>
    </article>
  );
}

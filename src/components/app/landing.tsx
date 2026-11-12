import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CATEGORIES, CATEGORY_LABELS, categoriesFor, formatMoney } from "@/lib/budget";
import { TRIP_TYPES } from "@/lib/demo-data";

/** A section head: a headline with one italic word, and a lede beneath it. */
export function SectionHead({ title, lede }: { title: ReactNode; lede?: ReactNode }) {
  return (
    <div>
      <h2 className="title-display max-w-4xl text-large-title">{title}</h2>
      {lede && (
        <p className="mt-6 max-w-xl font-display text-title-2 leading-snug font-light text-foreground/80 italic">
          {lede}
        </p>
      )}
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Your trip, in your own words.",
    body: "Type a trip in your own words, or pick a place. Waypoint reads dates, group size, cities and what you already have covered, and asks only for what is missing.",
  },
  {
    n: "02",
    title: "The whole price, up front.",
    body: "A budget built from real distances, fares and local costs, with an emergency fund set aside first. Every number says whether it is an estimate, a live price or not listed.",
  },
  {
    n: "03",
    title: "The days, then the bookings.",
    body: "Real places from Wikivoyage, Wikipedia and OpenStreetMap fill each day. A booking list says what to book by when, with searches pre-filled. You book on the provider's own site.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-t border-separator py-20 sm:py-28" aria-labelledby="how-title">
      <div className="page-container">
        <SectionHead
          title={
            <span id="how-title">
              Three steps, <em>no spreadsheet.</em>
            </span>
          }
          lede="Most planners start with where to go. Waypoint starts with what it will cost."
        />
        <ol className="mt-16 border-t border-separator">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="grid gap-4 border-b border-separator py-10 lg:grid-cols-[5fr_7fr] lg:gap-16"
            >
              <div className="flex items-baseline gap-6">
                <span className="font-display text-title-1 font-light text-muted-foreground">
                  {s.n}
                </span>
                <h3 className="title-display text-title-1">{s.title}</h3>
              </div>
              <p className="max-w-xl text-body text-foreground/80">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const TOOLS: {
  n: string;
  title: string;
  to?: "/budget" | "/itinerary" | "/road-trip" | "/book" | "/spending";
  cta?: string;
  accent: string;
  tag: string;
  lead: string;
  body: string;
  includes: string[];
}[] = [
  {
    n: "I",
    title: "Budget",
    to: "/budget" as const,
    cta: "Open the sample budget",
    accent: "& emergency fund.",
    tag: "Estimated, then checked",
    lead: "Every cost in one place, with a cushion that overspending never touches.",
    body: "Gas, tolls, flights, hotels, meals, activities and a price buffer, each with its formula one tap away. If the plan runs over, Waypoint suggests cuts and checks them by recomputing the budget.",
    includes: ["Line by line costs", "Emergency fund", "Cut suggestions", "Display currency"],
  },
  {
    n: "II",
    title: "Itinerary",
    to: "/itinerary" as const,
    cta: "See a sample itinerary",
    accent: "day by day.",
    tag: "Every day planned",
    lead: "Real places, in a sensible order, for the days you have.",
    body: "Sights from Wikivoyage and Wikipedia, restaurants from OpenStreetMap, the weather and the public holidays. Edit anything, undo it, print it. Stops you add are yours and stay when the plan is rebuilt.",
    includes: ["Real places", "Weather and holidays", "Edit and undo", "Print to PDF"],
  },
  {
    n: "III",
    title: "Road trip",
    to: "/road-trip" as const,
    cta: "Find stops on the route",
    accent: "stops.",
    tag: "On the route",
    lead: "Stops worth the detour, priced against what is left.",
    body: "Find places within a few kilometres of the road, spread along the drive, with the detour time and what each stop does to the budget. Prices that are not published say so.",
    includes: ["Real route", "Detour minutes", "Stops on budget", "Map"],
  },
  {
    n: "IV",
    title: "Booking",
    to: "/book" as const,
    cta: "See the booking checklist",
    accent: "checklist.",
    tag: "Book by dates",
    lead: "What to book, by when, with the search already filled in.",
    body: "Flights, stays, tickets and a short list of things to do before you go. Each one opens the provider's site with your dates and group, and you record the confirmation here.",
    includes: ["Book-by dates", "Pre-filled searches", "Before you go", "Calendar file"],
  },
  {
    n: "V",
    title: "Spending",
    to: "/spending" as const,
    cta: "Log a cost",
    accent: "as you go.",
    tag: "During the trip",
    lead: "What you spent, against what you planned.",
    body: "Log a cost in seconds, in the local currency if you like. In a group, Waypoint splits each cost to the cent and lists the fewest payments to even up.",
    includes: ["Log costs", "Group splits", "Settle up", "Spreadsheet"],
  },
  {
    n: "VI",
    title: "Sharing",
    accent: "a plan.",
    tag: "No account needed",
    lead: "Send the whole plan as a link.",
    body: "The trip is packed into the link itself, so it never touches a server. Bookings and exact locations stay out. Whoever opens it gets their own copy to change.",
    includes: ["One link", "Private by design", "Opens as a copy", "Nothing to install"],
  },
];

export function Tools() {
  return (
    <section className="border-t border-separator py-20 sm:py-28" aria-labelledby="tools-title">
      <div className="page-container">
        <SectionHead
          title={
            <span id="tools-title">
              Six tools, <em>one trip.</em>
            </span>
          }
          lede="Each one works on its own and feeds the others: change the budget and the plan follows."
        />
        <div className="mt-16">
          {TOOLS.map((t) => (
            <article
              key={t.n}
              className="grid gap-8 border-t border-separator py-14 lg:grid-cols-[5fr_7fr] lg:gap-16"
            >
              <header>
                <h3 className="title-display text-title-1">
                  {t.title} <em>{t.accent}</em>
                </h3>
                <p className="mt-6 inline-block rounded-sm border border-border px-2 py-1 label-mono">
                  {t.tag}
                </p>
              </header>
              <div>
                <p className="font-display text-title-2 leading-snug font-light text-foreground italic">
                  {t.lead}
                </p>
                <p className="mt-6 max-w-xl text-body text-foreground/80">{t.body}</p>
                <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-separator pt-6">
                  {t.includes.map((i) => (
                    <div key={i}>
                      <dt className="label-mono">Includes</dt>
                      <dd className="mt-1 font-display text-headline font-normal">{i}</dd>
                    </div>
                  ))}
                </dl>
                {t.to && (
                  <Link to={t.to} className="link-chevron mt-8 inline-block text-footnote">
                    {t.cta}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The sample trip's arithmetic, from the same budget engine the app uses. */
export function TheMath({
  sample,
  place,
  totals,
}: {
  sample: boolean;
  place: string;
  totals: { total: number; emergency: number; spendable: number; planned: number; left: number };
}) {
  const over = totals.left < 0;
  const steps = [
    ["Total budget", totals.total],
    ["Emergency fund", totals.emergency],
    ["To spend", totals.spendable],
    ["Planned", totals.planned],
    [over ? "Over by" : "Left over", Math.abs(totals.left)],
  ] as const;
  return (
    <section className="border-t border-separator py-20 sm:py-28" aria-labelledby="math-title">
      <div className="page-container">
        <SectionHead
          title={
            <span id="math-title">
              The cushion comes <em>first.</em>
            </span>
          }
          lede="The emergency fund is carved out of the budget before anything is planned, so a surprise never eats the trip."
        />
        <ol className="mt-16 grid gap-px border-y border-separator bg-[var(--separator)] sm:grid-cols-5">
          {steps.map(([label, value], i) => (
            <li key={label} className="bg-background px-1 py-8 sm:px-6">
              <p className="label-mono">{label}</p>
              <p
                className={
                  "money-display mt-4 text-stat " +
                  (i === 4 ? (over ? "text-destructive" : "text-primary") : "")
                }
              >
                {formatMoney(value)}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-6 label-mono">
          {sample ? "Sample trip" : "Your trip"} · {place}
        </p>
      </div>
    </section>
  );
}

/** Which budget lines each kind of trip has, straight from the app's own rules. */
export function TripTypes() {
  const cols = TRIP_TYPES.map((t) => ({
    id: t.id,
    label: t.label,
    has: new Set(categoriesFor(t.id, t.modes[0]!)),
  }));
  const used = CATEGORIES.filter((c) => cols.some((col) => col.has.has(c)));
  // Only the lines that differ are worth a row; the rest every trip has.
  const rows = used.filter((c) => !cols.every((col) => col.has.has(c)));
  const shared = used.filter((c) => cols.every((col) => col.has.has(c)));
  return (
    <section className="border-t border-separator py-20 sm:py-28" aria-labelledby="types-title">
      <div className="page-container">
        <SectionHead
          title={
            <span id="types-title">
              Five kinds of trip, <em>priced differently.</em>
            </span>
          }
          lede="A cruise has a fare and port fees, a road trip has gas and stops. Waypoint only shows the costs your trip really has."
        />
        <div
          className="relative mt-16 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Budget lines by trip type"
        >
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <caption className="sr-only">Budget lines by trip type</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-4 pr-4 label-mono font-normal">
                  Budget line
                </th>
                {cols.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className="px-4 py-4 text-center label-mono font-normal"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r} className="border-b border-separator">
                  <th scope="row" className="py-4 pr-4 text-body font-normal">
                    {CATEGORY_LABELS[r]}
                  </th>
                  {cols.map((c) => (
                    <td key={c.id} className="px-4 py-4 text-center">
                      {c.has.has(r) ? (
                        <>
                          <span
                            aria-hidden
                            className="inline-block size-2 rounded-full bg-primary"
                          />
                          <span className="sr-only">Included</span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden className="inline-block h-px w-4 bg-muted-foreground" />
                          <span className="sr-only">Not included</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-8 max-w-3xl text-body text-foreground/80">
          <span className="label-mono mr-4">Every trip also has</span>
          {shared.map((c) => CATEGORY_LABELS[c]).join(", ")}.
        </p>
      </div>
    </section>
  );
}

const QUESTIONS = [
  {
    q: "Is Waypoint free?",
    a: "Yes, it is free today. A few extras need a free account, like saving trips across devices and AI planning.",
  },
  {
    q: "Do I need an account?",
    a: "No. Every page works signed out, and your trip stays in your browser. An account adds saved trips and AI planning.",
  },
  {
    q: "Where do the prices come from?",
    a: "From Waypoint's own budget engine: your distances, typical fares and local costs for the group you describe. A price a source publishes is used and marked. Anything unpublished says not listed and is never counted as free. Live flight and hotel prices appear when that connection is set up.",
  },
  {
    q: "Does it book trips or take payment?",
    a: "Never. Each booking item opens the provider's own site with your dates and group filled in. You book and pay there, then record it here.",
  },
  {
    q: "How accurate are the estimates?",
    a: "They are estimates, and they are labeled that way. Use them to choose a trip and set a budget, then check live prices before you book.",
  },
  {
    q: "Does it work outside the United States?",
    a: "Yes. Suggestions work from any start point, units and currency follow your country, and other currencies show as approximate conversions. Budget math stays in US dollars.",
  },
];

export function Faq() {
  return (
    <section className="border-t border-separator py-20 sm:py-28" aria-labelledby="faq-title">
      <div className="page-container">
        <SectionHead
          title={
            <span id="faq-title">
              Questions <em>asked.</em>
            </span>
          }
        />
        <AccordionPrimitive.Root
          type="single"
          collapsible
          className="mt-16 border-t border-separator"
        >
          {QUESTIONS.map((x) => (
            <AccordionPrimitive.Item key={x.q} value={x.q} className="border-b border-separator">
              <AccordionPrimitive.Header>
                <AccordionPrimitive.Trigger className="faq-trigger group flex w-full items-center gap-6 py-6 text-left">
                  <span className="flex-1 font-display text-title-2 font-normal">{x.q}</span>
                  <Plus
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-45"
                  />
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Content className="faq-content overflow-hidden">
                <p className="max-w-2xl pb-8 text-body text-foreground/80">{x.a}</p>
              </AccordionPrimitive.Content>
            </AccordionPrimitive.Item>
          ))}
        </AccordionPrimitive.Root>
      </div>
    </section>
  );
}

/** The last word on the page: the brand's emblem, a headline and the one action. */
export function ClosingCta({ onStart }: { onStart: () => void }) {
  return (
    <section className="border-t border-separator py-24 text-center sm:py-36">
      <div className="page-container flex flex-col items-center">
        <h2 className="title-display text-large-title">
          Plan your next <em>trip.</em>
        </h2>
        <p className="mt-6 max-w-md text-body text-foreground/80">
          Say where you want to go. You will have a price before you have a plan.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Button size="lg" onClick={onStart}>
            Start planning <ArrowRight />
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/dashboard">See the sample trip</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

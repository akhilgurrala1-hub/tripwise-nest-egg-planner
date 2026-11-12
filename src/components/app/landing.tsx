import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

/** A section head: a plain headline and, optionally, one line under it. */
export function SectionHead({ title, lede }: { title: ReactNode; lede?: ReactNode }) {
  return (
    <div>
      <h2 className="title-display max-w-3xl text-large-title">{title}</h2>
      {lede && <p className="mt-4 max-w-xl text-body text-foreground/80">{lede}</p>}
    </div>
  );
}

const STEPS = [
  {
    title: "Describe the trip",
    body: "Type it in your own words, or pick a place. Waypoint reads dates, group size and cities, and asks only for what's missing.",
  },
  {
    title: "See the budget",
    body: "Costs come from real distances, typical fares and local prices, with an emergency fund set aside first. Each number says whether it's an estimate, a live price or not listed.",
  },
  {
    title: "Plan the days and bookings",
    body: "Real places from Wikivoyage, Wikipedia and OpenStreetMap fill each day, and a checklist says what to book and by when. You book on the provider's own site.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-16 sm:py-24" aria-labelledby="how-title">
      <div className="page-container">
        <h2 id="how-title" className="title-display text-center text-large-title">
          How it works
        </h2>
        <ul className="mt-12 grid gap-10 text-center md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title}>
              <h3 className="text-headline font-semibold">{s.title}</h3>
              <p className="mt-2 text-body text-foreground/80">{s.body}</p>
            </li>
          ))}
        </ul>
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
    <section className="bg-card py-16 sm:py-24" aria-labelledby="faq-title">
      <div className="page-container">
        <h2 id="faq-title" className="title-display text-center text-large-title">
          Common questions
        </h2>
        <AccordionPrimitive.Root
          type="single"
          collapsible
          className="mx-auto mt-12 max-w-3xl border-t border-separator"
        >
          {QUESTIONS.map((x) => (
            <AccordionPrimitive.Item key={x.q} value={x.q} className="border-b border-separator">
              <AccordionPrimitive.Header>
                <AccordionPrimitive.Trigger className="faq-trigger group flex w-full items-center gap-4 py-4 text-left">
                  <span className="flex-1 text-headline font-semibold">{x.q}</span>
                  <Plus
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-45"
                  />
                </AccordionPrimitive.Trigger>
              </AccordionPrimitive.Header>
              <AccordionPrimitive.Content className="faq-content overflow-hidden">
                <p className="max-w-2xl pb-4 text-body text-foreground/80">{x.a}</p>
              </AccordionPrimitive.Content>
            </AccordionPrimitive.Item>
          ))}
        </AccordionPrimitive.Root>
      </div>
    </section>
  );
}

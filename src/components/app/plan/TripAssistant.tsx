import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUp,
  Check,
  CornerDownRight,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { LogoMark } from "@/components/app/Logo";
import { stagger } from "@/components/app/motion";
import { formatDateRange } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { tripChat } from "@/lib/ai-trip-chat.functions";
import { airportFor } from "@/lib/airports";
import { useAirports } from "@/lib/live/use-airports";
import { useTowns } from "@/lib/live/use-towns";
import { cleanChatAnswer } from "@/lib/ai-quality";
import { coverageFromDraft, draftDates, missingFields, type TripDraft } from "@/lib/assistant";
import { understand, type AskField, type UnderstandContext } from "@/lib/understand/conversation";
import { gazetteer } from "@/lib/understand/gazetteer";
import { factLines, localAnswer, reconcile, type AssistantAnswer } from "@/lib/understand/reply";
import type { GeoPoint } from "@/lib/catalog";
import { useHomePlace } from "@/lib/live/use-home";
import { useLocale, useUsdRate } from "@/lib/live/use-locale";
import { recommendDestinations } from "@/lib/recommend";
import { useAuth } from "@/lib/auth-context";
import { coveredLabels, formatMoney } from "@/lib/budget";
import { todayIso } from "@/lib/dates";
import { cabinInfo, tripTypeInfo } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

type Turn =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      questions: { question: string; options: string[] }[];
      ideas: { name: string; why: string }[];
      /** What each question asks about, so the next answer lands in the right place */
      fields?: AskField[];
      /** A short line under the answer (e.g. the AI was unavailable, so Waypoint answered) */
      note?: string;
    };

interface Saved {
  turns: Turn[];
  draft: TripDraft | null;
  pending: string;
  /** The last answer had everything needed to build the trip */
  ready?: boolean;
}

const STORAGE_KEY = "waypoint.assistant";
const TIMEOUT_MS = 60_000;
/** Quick starts: a short label to tap, and the full message it sends. */
const EXAMPLES: { label: string; message: string }[] = [
  {
    label: "Plan a mountain weekend for 2",
    message: "A long weekend in the mountains for 2 in March, under $1,500",
  },
  {
    label: "Plan a beach week for 4",
    message: "Somewhere warm with a beach for a family of 4 this summer",
  },
  {
    label: "Find a short cruise",
    message: "A 4-night cruise from the closest port, comfortable but not fancy",
  },
];

/** Places Waypoint knows well near the traveler, so the assistant's ideas can be planned in detail. */
function nearbyLines(from: GeoPoint | null, draft: TripDraft | null): string[] {
  if (!from) return [];
  const types = draft?.tripType ? [draft.tripType] : (["road-trip", "flight"] as const);
  return types
    .flatMap((tripType) =>
      recommendDestinations({ from, tripType, interests: draft?.interests ?? [], limit: 6 }).map(
        (s) =>
          `${s.name} (${s.region}): ${tripType === "flight" ? "fly-away" : tripType}${s.distanceLabel ? `, ${s.distanceLabel}` : ""}`,
      ),
    )
    .slice(0, 12);
}

function load(): Saved {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Saved> | null) : null;
    // A damaged or older saved conversation starts fresh instead of breaking the page.
    if (saved && Array.isArray(saved.turns))
      return {
        turns: saved.turns.filter(
          (t) => t && (t.role === "user" || t.role === "assistant") && typeof t === "object",
        ),
        draft: saved.draft ?? null,
        pending: typeof saved.pending === "string" ? saved.pending : "",
        ready: !!saved.ready,
      };
  } catch {
    /* ignore */
  }
  return { turns: [], draft: null, pending: "" };
}

/**
 * Describe a trip in your own words. The assistant asks only what it still needs
 * (with tap-to-answer options), suggests places when you're unsure, and once it
 * knows where, when and who, hands a ready trip to the planner.
 */
export function TripAssistant({
  homeCity,
  from = null,
  onBuild,
  onFill,
  variant = "card",
}: {
  homeCity: string;
  /** "hero": the page's main question introduces it, so it has no heading of its own */
  variant?: "card" | "hero";
  /** Where the traveler starts, for nearby ideas */
  from?: GeoPoint | null;
  /** Start this trip now */
  onBuild: (draft: TripDraft) => void;
  /** Put it in the form below for fine-tuning */
  onFill: (draft: TripDraft) => void;
}) {
  const { user, loading: authLoading } = useAuth();
  const { currency } = useLocale();
  const airports = useAirports();
  const towns = useTowns();
  const homeAirport = airports && from ? airportFor(airports, from) : null;
  const { place } = useHomePlace();
  const [state, setState] = useState<Saved>({ turns: [], draft: null, pending: "" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: string; detail?: string } | null>(
    null,
  );
  const controller = useRef<AbortController | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // The conversation survives page changes and the sign-in round trip.
  useEffect(() => {
    const saved = load();
    setState(saved);
    if (saved.pending) setText(saved.pending);
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, pending: text }));
    } catch {
      /* ignore */
    }
  }, [state, text]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (state.turns.length > 0)
      threadEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.turns.length, busy]);

  const today = todayIso();
  const usdRate = useUsdRate(currency);
  const places = useMemo(() => gazetteer(airports, towns), [airports, towns]);
  const ctx: UnderstandContext = {
    today,
    gazetteer: places,
    ...(homeCity ? { homeCity } : {}),
    ...(place?.country ? { homeCountry: place.country } : {}),
    from,
    ...(usdRate ? { usdPer: { [currency]: 1 / usdRate } } : {}),
  };
  const missing = missingFields(state.draft, today);
  const ready = state.turns.length > 0 && !!state.ready && missing.length === 0;

  /** Show an answer (Waypoint's own or the AI's, checked) as the assistant's turn. */
  const show = (turns: Turn[], a: AssistantAnswer, note?: string) =>
    setState((s) => ({
      ...s,
      draft: a.trip,
      ready: a.ready,
      turns: [
        ...turns,
        {
          role: "assistant",
          content: a.reply,
          questions: a.questions.slice(0, 3),
          ideas: a.ideas.slice(0, 3),
          fields: a.fields,
          ...(note ? { note } : {}),
        },
      ],
    }));

  const send = async (message: string) => {
    const content = message.trim().slice(0, 1200);
    if (!content || busy) return;
    setError(null);
    const turns: Turn[] = [...state.turns, { role: "user", content }];
    setState((s) => ({ ...s, turns }));
    setText("");
    // Waypoint reads the whole conversation itself first: free, instant, and the
    // facts the AI's answer is checked against.
    const conversation = turns.map((t) =>
      t.role === "user"
        ? { role: "user" as const, content: t.content }
        : { role: "assistant" as const, content: t.content, fields: t.fields ?? [] },
    );
    const u = understand(conversation, ctx);
    if (!user) {
      show(turns, localAnswer(u, ctx));
      return;
    }
    setBusy(true);
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const timer = setTimeout(() => ctrl.abort("timeout"), TIMEOUT_MS);
    const fallback = (why: string) =>
      show(turns, localAnswer(u, ctx), `${why} Waypoint answered on its own.`);
    try {
      const res = await tripChat({
        signal: ctrl.signal,
        data: {
          messages: turns
            .slice(-16)
            .map((t) => ({ role: t.role, content: t.content.slice(0, 1200) })),
          today,
          homeCity,
          draft: state.draft,
          country: place?.country ?? "",
          currency,
          nearby: nearbyLines(from, state.draft),
          homeAirport: homeAirport
            ? `${homeAirport.code} (${homeAirport.name})${homeAirport.miles >= 5 ? `, ${homeAirport.miles} miles away` : ""}`.slice(
                0,
                160,
              )
            : "",
          facts: factLines(u),
        },
      });
      if (!res.ok) {
        // The trip still moves forward: Waypoint answers, and the reason is kept for reporting.
        setError(res.detail ? { message: res.error, retry: content, detail: res.detail } : null);
        fallback(res.error);
        return;
      }
      const userTexts = turns.filter((t) => t.role === "user").map((t) => t.content);
      show(turns, reconcile(cleanChatAnswer(res.answer), u, ctx, userTexts));
    } catch {
      if (ctrl.signal.aborted && ctrl.signal.reason !== "timeout") {
        setState((s) => ({ ...s, turns: s.turns.slice(0, -1) }));
        return;
      }
      fallback(
        ctrl.signal.reason === "timeout" ? "The AI took too long." : "The AI couldn't be reached.",
      );
    } finally {
      clearTimeout(timer);
      if (controller.current === ctrl) controller.current = null;
      setBusy(false);
    }
  };

  const reset = () => {
    controller.current?.abort("reset");
    setBusy(false);
    setError(null);
    setState({ turns: [], draft: null, pending: "" });
    setText("");
  };

  /** The empty hero composer is drawn as a search bar. */
  const search = variant === "hero" && state.turns.length === 0;
  const lastAssistant = [...state.turns].reverse().find((t) => t.role === "assistant") as
    Extract<Turn, { role: "assistant" }> | undefined;

  return (
    <section
      className={cn(
        // As the page's hero, the composer itself is the card until the conversation starts
        // (and nothing clips the bar's shadow).
        search ? "" : "surface-card overflow-hidden",
      )}
    >
      {variant === "hero" ? (
        state.turns.length > 0 && (
          <div className="flex justify-end px-4 pt-4">
            <Button variant="ghost" size="sm" onClick={reset} aria-label="Start over">
              <RotateCcw /> <span className="hidden sm:inline">Start over</span>
            </Button>
          </div>
        )
      ) : (
        <header className="flex items-start gap-4 px-6 pt-6 sm:px-6 sm:pt-6">
          <div className="min-w-0 flex-1">
            <p className="eyebrow flex items-center gap-2">Describe it</p>
            <h2 className="mt-2 text-headline leading-snug font-semibold">
              Tell us the trip in your own words
            </h2>
            <p className="mt-1 text-footnote text-muted-foreground">
              Waypoint asks what it needs, then builds the plan.
            </p>
          </div>
          {state.turns.length > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} aria-label="Start over">
              <RotateCcw /> <span className="hidden sm:inline">Start over</span>
            </Button>
          )}
        </header>
      )}

      {state.turns.length > 0 && (
        <div className="max-h-[420px] space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
          {state.turns.map((t, i) =>
            t.role === "user" ? (
              <p
                key={i}
                className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2 text-sm text-ink-foreground"
              >
                {t.content}
              </p>
            ) : (
              <div key={i} className="max-w-[92%] space-y-2">
                <p className="w-fit rounded-2xl rounded-bl-md bg-muted px-4 py-2 text-sm">
                  {t.content}
                </p>
                {t.note && <p className="px-1 text-xs text-muted-foreground">{t.note}</p>}
                {t === lastAssistant && !busy && (
                  <>
                    {ready && t.questions.length > 0 && (
                      <p className="eyebrow px-1 pt-1">Optional, for a better plan</p>
                    )}
                    {t.questions.map((q, qi) => (
                      <div key={qi} style={stagger(qi + 1)} className="">
                        <p className="text-footnote font-medium">{q.question}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {q.options.slice(0, 4).map((o) => (
                            <button
                              key={o}
                              type="button"
                              onClick={() => send(o)}
                              className="h-8 rounded-lg border border-border bg-card px-2 text-footnote transition-[border-color,transform] duration-150 hover:border-primary active:scale-[0.97]"
                            >
                              {o}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {t.ideas.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-3">
                        {t.ideas.map((idea, ii) => (
                          <button
                            key={idea.name}
                            type="button"
                            style={stagger(ii + 1)}
                            onClick={() => send(`Let's do ${idea.name}.`)}
                            className="rounded-xl border border-border bg-card p-4 text-left transition-[border-color,transform] duration-150 pressable hover:border-primary"
                          >
                            <span className="block text-sm font-medium">{idea.name}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {idea.why}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ),
          )}
          {busy && (
            <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-4 py-2 text-sm text-muted-foreground">
              <LogoMark loading className="size-5" /> Thinking…
              <button
                type="button"
                className="ml-1 text-xs underline underline-offset-2"
                onClick={() => {
                  controller.current?.abort("cancel");
                  setState((s) => ({ ...s, turns: s.turns.slice(0, -1) }));
                }}
              >
                Cancel
              </button>
            </div>
          )}
          <div ref={threadEnd} />
        </div>
      )}

      {state.draft && <DraftSummary draft={state.draft} today={today} />}

      {ready && state.draft && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-4">
          <Button variant="hero" onClick={() => onBuild(state.draft!)}>
            Build this trip <ArrowRight />
          </Button>
          <Button variant="outline" onClick={() => onFill(state.draft!)}>
            <SlidersHorizontal /> Fine-tune below
          </Button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 text-sm text-destructive"
        >
          <span className="min-w-0">
            {error.message}
            {error.detail && (
              <span className="mt-1 block text-xs break-words text-muted-foreground">
                Details: {error.detail}
              </span>
            )}
          </span>
          <Button size="sm" variant="outline" onClick={() => send(error.retry)}>
            Try again
          </Button>
        </div>
      )}

      <form
        className={cn(
          variant === "hero" && state.turns.length === 0 ? "" : "p-4 sm:p-6",
          state.turns.length > 0 && "border-t border-border",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div
          className={cn(
            "flex gap-2 rounded-2xl border transition-[border-color,box-shadow,background-color] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10",
            search
              ? // The hero: one wide search-style bar, like a travel app's "Where to?"
                "items-center border-border bg-card p-2 pl-6 shadow-lift"
              : "flex-col border-input bg-background/70 p-2 pl-4 focus-within:bg-card sm:flex-row sm:items-end",
          )}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={search ? 1 : state.turns.length ? 1 : 3}
            maxLength={1200}
            placeholder={
              state.turns.length
                ? "Answer or add details…"
                : search
                  ? "Rome for a week in May, 2 of us"
                  : "e.g. A long weekend somewhere with hiking and good food, 2 of us, about $1,200"
            }
            aria-label="Describe your trip"
            className={cn(
              "w-full flex-1 resize-none bg-transparent leading-relaxed outline-none placeholder:text-muted-foreground",
              search ? "min-h-0 py-2 text-body sm:text-headline" : "min-h-9 py-2 text-body",
            )}
          />
          {search ? (
            <Button
              type="submit"
              variant="hero"
              size="lg"
              disabled={!text.trim() || busy}
              className="shrink-0 px-4 sm:px-6"
            >
              <ArrowUp className="sm:hidden" />
              <span className="sr-only sm:not-sr-only">Plan</span>
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              variant="ink"
              disabled={!text.trim() || busy}
              aria-label="Send"
              className="size-10 shrink-0 self-end rounded-xl"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
        {/* The hero keeps one line under the bar (the quick starts); the full panel explains AI. */}
        {!user && !authLoading && !search && (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            Waypoint's own planner answers right away.{" "}
            <Link to="/auth" search={{ redirect: "/" }} className="underline underline-offset-2">
              Sign in
            </Link>{" "}
            to add AI answers too.
          </p>
        )}
        {state.turns.length === 0 && (
          <div className="mt-4">
            <p className={cn("eyebrow px-1", search && "sr-only")}>Or start with</p>
            <ul
              className={cn(
                "mt-2 flex flex-wrap gap-2",
                search && "justify-center xl:justify-start",
              )}
            >
              {EXAMPLES.map((ex) => (
                <li key={ex.label}>
                  <button
                    type="button"
                    onClick={() => void send(ex.message)}
                    title={ex.message}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg border border-border bg-card transition-[border-color,transform] duration-150 hover:border-primary active:scale-[0.97]",
                      search ? "h-9 px-4 text-footnote" : "h-10 px-4 text-body",
                    )}
                  >
                    <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
                    {ex.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </section>
  );
}

/** What the assistant has worked out so far; each detail pops in as it's decided. */
function DraftSummary({ draft, today }: { draft: TripDraft; today: string }) {
  const dates = draftDates(draft, today);
  const items: { key: string; label: string; value: string | null }[] = [
    {
      key: "where",
      label: "Where",
      value:
        draft.tripType === "staycation"
          ? "Home"
          : (draft.cities?.length ?? 0) > 1
            ? draft.cities.map((c) => `${c.name.split(",")[0]} ${c.nights}n`).join(" → ")
            : draft.destination,
    },
    {
      key: "when",
      label: "When",
      value: dates ? formatDateRange(dates.startDate, dates.endDate) : null,
    },
    {
      key: "who",
      label: "Who",
      value: draft.travelers
        ? `${draft.travelers} traveler${draft.travelers > 1 ? "s" : ""}`
        : null,
    },
    {
      key: "type",
      label: "Trip",
      value: draft.tripType ? tripTypeInfo(draft.tripType).label : null,
    },
    ...(draft.cabin && draft.cabin !== "economy"
      ? [{ key: "cabin", label: "Cabin", value: cabinInfo(draft.cabin).label }]
      : []),
    {
      key: "budget",
      label: "Budget",
      // Without a number from the traveler, Waypoint works it out from the trip's costs.
      value: draft.totalBudget ? formatMoney(draft.totalBudget) : "Worked out for you",
    },
    // Only shown once the assistant has worked them out: nothing to fill in otherwise.
    ...(() => {
      const coverage = coverageFromDraft(draft);
      const covered = coveredLabels(coverage);
      return [
        ...(covered.length
          ? [{ key: "covered", label: "Not counted", value: covered.join(", ") }]
          : []),
        ...(coverage?.transfer
          ? [
              {
                key: "transfer",
                label: "To the airport or station",
                value: `${formatMoney(coverage.transfer)} round trip`,
              },
            ]
          : []),
      ];
    })(),
  ];
  return (
    <div className="flex flex-wrap gap-2 border-t border-border bg-muted/40 px-4 py-2">
      {items.map((it) => (
        <span
          key={`${it.key}:${it.value ?? ""}`}
          className={cn(
            "inline-flex h-7 items-center gap-2 rounded-lg border px-2 text-xs",
            it.value
              ? "border-border bg-card"
              : "border-dashed border-border text-muted-foreground",
          )}
        >
          {it.value ? <Check className="size-3 text-success" /> : null}
          <span className="text-muted-foreground">{it.label}</span>
          {it.value && <span className="font-medium">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

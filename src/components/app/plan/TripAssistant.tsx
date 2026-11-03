import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUp,
  Check,
  CornerDownRight,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LogoMark } from "@/components/app/Logo";
import { stagger } from "@/components/app/motion";
import { formatDateRange } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { tripChat } from "@/lib/ai-trip-chat.functions";
import { cleanChatAnswer } from "@/lib/ai-quality";
import { coverageFromDraft, draftDates, missingFields, type TripDraft } from "@/lib/assistant";
import type { GeoPoint } from "@/lib/catalog";
import { useHomePlace } from "@/lib/live/use-home";
import { useLocale } from "@/lib/live/use-locale";
import { recommendDestinations } from "@/lib/recommend";
import { useAuth } from "@/lib/auth-context";
import { coveredLabels, formatMoney } from "@/lib/budget";
import { todayIso } from "@/lib/dates";
import { tripTypeInfo } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

type Turn =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      questions: { question: string; options: string[] }[];
      ideas: { name: string; why: string }[];
    };

interface Saved {
  turns: Turn[];
  draft: TripDraft | null;
  pending: string;
}

const STORAGE_KEY = "waypoint.assistant";
const TIMEOUT_MS = 60_000;
const EXAMPLES = [
  "A long weekend in the mountains for 2 in March, under $1,500",
  "Somewhere warm with a beach for a family of 4 this summer",
  "A 4-night cruise from the closest port, comfortable but not fancy",
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
    if (raw) return JSON.parse(raw) as Saved;
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
}: {
  homeCity: string;
  /** Where the traveler starts, for nearby ideas */
  from?: GeoPoint | null;
  /** Start this trip now */
  onBuild: (draft: TripDraft) => void;
  /** Put it in the form below for fine-tuning */
  onFill: (draft: TripDraft) => void;
}) {
  const { user, loading: authLoading } = useAuth();
  const { currency } = useLocale();
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
  const missing = missingFields(state.draft, today);
  const ready = state.turns.length > 0 && missing.length === 0;

  const send = async (message: string) => {
    const content = message.trim().slice(0, 1200);
    if (!content || busy) return;
    if (!user) return;
    setError(null);
    const turns: Turn[] = [...state.turns, { role: "user", content }];
    setState((s) => ({ ...s, turns }));
    setText("");
    setBusy(true);
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const timer = setTimeout(() => ctrl.abort("timeout"), TIMEOUT_MS);
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
        },
      });
      if (!res.ok) {
        setError({
          message: res.error,
          retry: content,
          ...(res.detail ? { detail: res.detail } : {}),
        });
        setState((s) => ({ ...s, turns: s.turns.slice(0, -1) }));
        return;
      }
      const a = cleanChatAnswer(res.answer);
      setState((s) => ({
        ...s,
        draft: a.trip,
        turns: [
          ...turns,
          {
            role: "assistant",
            content: a.reply,
            questions: a.ready ? [] : a.questions.slice(0, 3),
            ideas: a.ideas.slice(0, 3),
          },
        ],
      }));
    } catch {
      if (ctrl.signal.aborted && ctrl.signal.reason !== "timeout") return;
      setError({
        message:
          ctrl.signal.reason === "timeout"
            ? "That took too long. Try again."
            : "Couldn't reach the assistant. Try again.",
        retry: content,
      });
      setState((s) => ({ ...s, turns: s.turns.slice(0, -1) }));
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

  const lastAssistant = [...state.turns].reverse().find((t) => t.role === "assistant") as
    Extract<Turn, { role: "assistant" }> | undefined;

  return (
    <section className="surface-card overflow-hidden">
      <header className="flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0 flex-1">
          <p className="eyebrow flex items-center gap-1.5">
            <span aria-hidden className="size-[5px] rounded-full bg-brand-coral" /> Describe it
          </p>
          <h2 className="mt-2 text-[19px] leading-snug font-semibold">
            Tell us the trip in your own words
          </h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Waypoint asks what it needs, then builds the plan.
          </p>
        </div>
        {state.turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} aria-label="Start over">
            <RotateCcw /> <span className="hidden sm:inline">Start over</span>
          </Button>
        )}
      </header>

      {state.turns.length > 0 && (
        <div className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {state.turns.map((t, i) =>
            t.role === "user" ? (
              <p
                key={i}
                className="animate-rise ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-ink-foreground"
              >
                {t.content}
              </p>
            ) : (
              <div key={i} className="animate-rise max-w-[92%] space-y-2.5">
                <p className="w-fit rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm">
                  {t.content}
                </p>
                {t === lastAssistant && !busy && (
                  <>
                    {t.questions.map((q, qi) => (
                      <div key={qi} style={stagger(qi + 1)} className="animate-rise">
                        <p className="text-[13px] font-medium">{q.question}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {q.options.slice(0, 4).map((o) => (
                            <button
                              key={o}
                              type="button"
                              onClick={() => send(o)}
                              className="h-8 rounded-lg border border-border bg-card px-2.5 text-[13px] transition-[border-color,transform] duration-150 hover:border-primary active:scale-[0.97]"
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
                            className="animate-rise rounded-xl border border-border bg-card p-3 text-left transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-primary"
                          >
                            <span className="block text-sm font-medium">{idea.name}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
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
            <div className="animate-pop flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm text-muted-foreground">
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
        <div className="animate-rise flex flex-wrap gap-2 border-t border-border px-4 py-3">
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
          className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm text-destructive"
        >
          <span className="min-w-0">
            {error.message}
            {error.detail && (
              <span className="mt-0.5 block text-xs break-words text-muted-foreground">
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
        className={cn("p-4 sm:p-5", state.turns.length > 0 && "border-t border-border")}
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="flex flex-col gap-2 rounded-2xl border border-input bg-background/70 p-2 pl-4 transition-[border-color,box-shadow,background-color] focus-within:border-primary focus-within:bg-card focus-within:ring-4 focus-within:ring-primary/10 sm:flex-row sm:items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={state.turns.length ? 1 : 3}
            maxLength={1200}
            placeholder={
              state.turns.length
                ? "Answer or add details…"
                : "e.g. A long weekend somewhere with hiking and good food, 2 of us, about $1,200"
            }
            aria-label="Describe your trip"
            className="min-h-9 w-full flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          {user || authLoading ? (
            <Button
              type="submit"
              size="icon"
              variant="ink"
              disabled={!text.trim() || busy || authLoading}
              aria-label="Send"
              className="size-10 shrink-0 self-end rounded-xl"
            >
              <ArrowUp />
            </Button>
          ) : (
            <Button asChild variant="ink" className="h-10 shrink-0 self-end rounded-xl">
              <Link to="/auth" search={{ redirect: "/" }}>
                Sign in to ask
              </Link>
            </Button>
          )}
        </div>
        {state.turns.length === 0 && (
          <div className="mt-4">
            <p className="eyebrow px-1">Try one</p>
            <ul className="mt-1.5 divide-y divide-border/70">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    onClick={() => (user ? send(ex) : setText(ex))}
                    className="group flex w-full items-start gap-2.5 px-1 py-2.5 text-left text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-brand-coral transition-transform group-hover:translate-x-0.5" />
                    {ex}
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
      value: draft.tripType === "staycation" ? "Home" : draft.destination,
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
    {
      key: "budget",
      label: "Budget",
      value: draft.totalBudget ? formatMoney(draft.totalBudget) : null,
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
    <div className="flex flex-wrap gap-1.5 border-t border-border bg-muted/40 px-4 py-2.5">
      {items.map((it) => (
        <span
          key={`${it.key}:${it.value ?? ""}`}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs",
            it.value
              ? "animate-pop border-border bg-card"
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

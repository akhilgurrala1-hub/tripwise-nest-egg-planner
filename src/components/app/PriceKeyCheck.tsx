import { useServerFn } from "@tanstack/react-start";
import { CircleAlert, CircleCheck, Loader2, PlugZap } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { testPriceKeys } from "@/lib/prices/live-prices.functions";
import { cn } from "@/lib/utils";

type Check = Awaited<ReturnType<typeof testPriceKeys>>[number];

const SERVICE = {
  serpapi: { label: "Flights & hotels (SerpApi)", secret: "SERPAPI_API_KEY", site: "serpapi.com" },
  eia: { label: "Gas prices (U.S. EIA)", secret: "EIA_API_KEY", site: "eia.gov/opendata" },
} as const;

/**
 * Setup help for live prices, plus a test that asks each service whether its key
 * works (uses no searches). Shows which secret name a key was found under, never
 * the key itself.
 */
export function PriceKeyCheck({
  connected,
  signedIn,
  className,
}: {
  /** Whether any key was found */
  connected: boolean;
  signedIn: boolean;
  className?: string;
}) {
  const test = useServerFn(testPriceKeys);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setChecks(await test());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("border-t border-separator pt-4 text-xs", className)}>
      {!connected && !import.meta.env.DEV && (
        <p className="text-muted-foreground">
          Live prices aren't available right now, so these amounts are estimates.
        </p>
      )}
      {/* Setup help is for whoever runs the app: shown in the editor preview, not to visitors. */}
      {!connected && import.meta.env.DEV && (
        <div className="space-y-2 text-muted-foreground">
          <p className="font-medium text-foreground">Live prices aren't connected yet</p>
          <p>
            In Vercel, open{" "}
            <strong className="text-foreground">Settings → Environment Variables</strong> and add
            these, then redeploy so the app picks them up:
          </p>
          <ul className="space-y-1 pl-1">
            {Object.values(SERVICE).map((s) => (
              <li key={s.secret}>
                <code className="rounded bg-muted px-1 py-1 font-mono text-micro text-foreground">
                  {s.secret}
                </code>{" "}
                for {s.label}. Free key from {s.site}.
              </li>
            ))}
          </ul>
        </div>
      )}
      {signedIn && (
        <div className={cn(!connected && "mt-4")}>
          <Button variant="outline" size="sm" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <PlugZap />}
            {busy ? "Testing…" : "Test connection"}
          </Button>
          {failed && (
            <p className="mt-2 text-destructive">Couldn't run the test. Try again in a moment.</p>
          )}
          {checks && (
            <ul className="mt-2 space-y-2" aria-live="polite">
              {checks.map((c) => {
                const s = SERVICE[c.service];
                const ok = c.status === "ok";
                return (
                  <li key={c.service} className="flex gap-2">
                    {ok ? (
                      <CircleCheck className="mt-px size-3.5 shrink-0 text-success" />
                    ) : (
                      <CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
                    )}
                    <span>
                      <span className="font-medium text-foreground">{s.label}:</span>{" "}
                      {c.status === "missing"
                        ? `no key found. Add a secret named ${s.secret}.`
                        : `${c.detail}${c.name && c.name !== s.secret ? ` (found as ${c.name})` : ""}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

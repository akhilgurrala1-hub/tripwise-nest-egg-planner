<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Trip state lives in a client store (`src/lib/trip-store.ts`) persisted to localStorage; trips are not saved to accounts yet, so every page must keep working signed out.
- All budget math is pure functions in `src/lib/budget.ts` with tests in `src/test/budget.test.ts`; UI must never compute totals itself so rules stay testable.
- The emergency reserve is carved out of the total budget before spendable money is computed and is never reduced by over-spending.
- Road-trip stops are excluded from taxes and the misc cushion so a stop's budget impact equals its cost exactly; over-budget cut suggestions are verified by recomputing the budget, not by estimates.
- Route data uses the `RouteStop` shape in `src/lib/routing/`. Signed-out users get the demo provider (generic stop types, sample times); signed-in users get real Google Maps routes/places via the auth-protected `getRealStops` server function, because map calls are billable and must never be exposed publicly.
- Map-service calls run only on explicit user action (a search button), are cached client-side, and are capped per search (fixed query count, one page each) to bound cost.
- Accounts use email/password via Lovable Cloud with a single app-wide session subscriber (`AuthProvider` in `src/lib/auth-context.tsx`); no profiles table.
- Saved trips are migrated by version in `trip-store.ts`; bump the version and add a migration when the stored shape changes.
- Example prices and venues live only in `src/lib/demo-data.ts` and must be visibly labeled as demo data wherever shown, until real travel-data integrations replace that module.
- AI itinerary generation runs server-side via a `createServerFn` in `src/lib/ai-itinerary.functions.ts` calling the AI gateway helper in `src/lib/ai/`; AI output is labeled as unverified estimates.
- No real bookings or payments are implemented.
- Theming: all colors are semantic tokens in `src/styles.css` with `:root` (light) and `.dark` values; text on photos uses `on-image`, text on deep hero cards uses `ink-foreground` (never `primary-foreground`, which flips in dark mode). The theme class is set by an inline head script before paint to avoid flashes.
- Never compute dates at module scope: edge runtimes freeze the clock at 1970 during module load. Sample trips are built lazily in `trip-store.ts`.

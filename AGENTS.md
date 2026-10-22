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
- Trip state lives in a client store (`src/lib/trip-store.ts`) persisted to localStorage; there are no accounts or backend database yet, so keep pages working without a server session.
- All budget math is pure functions in `src/lib/budget.ts` with tests in `src/test/budget.test.ts`; UI must never compute totals itself so rules stay testable.
- The emergency reserve is carved out of the total budget before spendable money is computed and is never reduced by over-spending.
- Road-trip stops are excluded from taxes and the misc cushion so a stop's budget impact equals its cost exactly; over-budget cut suggestions are verified by recomputing the budget, not by estimates.
- Route data goes through the `RouteProvider` interface in `src/lib/routing/`; the demo provider uses generic stop types (never real business names) and sample times, so a real mapping service can replace it without touching screens.
- Saved trips are migrated by version in `trip-store.ts`; bump the version and add a migration when the stored shape changes.
- Example prices and venues live only in `src/lib/demo-data.ts` and must be visibly labeled as demo data wherever shown, until real travel-data integrations replace that module.
- AI itinerary generation runs server-side via a `createServerFn` in `src/lib/ai-itinerary.functions.ts` calling the AI gateway helper in `src/lib/ai/`; AI output is labeled as unverified estimates.
- No real bookings or payments are implemented.

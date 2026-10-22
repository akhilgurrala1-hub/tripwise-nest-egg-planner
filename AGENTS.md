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
- The emergency fund is carved out of the total budget before spendable money is computed and is never reduced by over-spending.
- Example prices and venues live only in `src/lib/demo-data.ts` and must be visibly labeled as demo data wherever shown, until real travel-data integrations replace that module.
- AI itinerary generation runs server-side via a `createServerFn` in `src/lib/ai-itinerary.functions.ts` calling the AI gateway helper in `src/lib/ai/`; AI output is labeled as unverified estimates.
- No real bookings or payments are implemented.

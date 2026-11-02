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
- Trip state lives in a client store (`src/lib/trip-store.ts`) persisted to localStorage; signed-in users can also save trips to their account (`src/lib/account.ts`), but every page must keep working signed out.
- All budget math is pure functions in `src/lib/budget.ts` with tests in `src/test/budget.test.ts`; UI must never compute totals itself so rules stay testable.
- The emergency reserve is carved out of the total budget before spendable money is computed and is never reduced by over-spending.
- Road-trip stops are excluded from taxes and the misc cushion so a stop's budget impact equals its cost exactly; over-budget cut suggestions are verified by recomputing the budget, not by estimates.
- Route data uses the `RouteStop` shape in `src/lib/routing/`. Signed-out users get the demo provider (generic stop types, sample times); signed-in users get real Google Maps routes/places via the auth-protected `getRealStops` server function, because map calls are billable and must never be exposed publicly. The itinerary uses the same rule: signed-in users can build it from real destination places via the auth-protected `getDestinationPlaces` server function; unpublished prices stay marked "not listed" and are never counted as free.
- Map-service calls run only on explicit user action (a search button), are cached client-side, and are capped per search (fixed query count, one page each) to bound cost.
- Accounts use email/password via Lovable Cloud with a single app-wide session subscriber (`AuthProvider` in `src/lib/auth-context.tsx`); no profiles table.
- Saved trips are migrated by version in `trip-store.ts`; bump the version and add a migration when the stored shape changes.
- Example prices and venues live only in `src/lib/demo-data.ts` and must be visibly labeled as demo data wherever shown, until real travel-data integrations replace that module.
- AI itinerary generation runs server-side via a `createServerFn` in `src/lib/ai-itinerary.functions.ts` calling the AI gateway helper in `src/lib/ai/`; AI output is labeled as unverified estimates.
- No real bookings or payments are implemented.
- Theming: all colors are semantic tokens in `src/styles.css` with `:root` (light) and `.dark` values; text on photos uses `on-image`, text on deep hero cards uses `ink-foreground` (never `primary-foreground`, which flips in dark mode). The theme class is set by an inline head script before paint to avoid flashes.
- Never compute dates at module scope: edge runtimes freeze the clock at 1970 during module load. Sample trips are built lazily in `trip-store.ts`.
- Live data lives in `src/lib/live/`. Weather (Open-Meteo forecast within 16 days, last year's same dates beyond that, labeled "typical") and place autocomplete (Open-Meteo geocoding) are free and keyless, so they run client-side for everyone; never call them during SSR. Each demo destination has a real `anchor` town for weather; custom destinations never inherit it.
- Searches (places, hotels, AI) use `destinationQuery()` from `src/lib/live/place.ts` so generic labels like "Custom destination" or "Staycation" never reach a search; a staycation searches the traveler's home city.
- A budget category is labeled "Live price" only while its input still equals the fetched price (`src/lib/live/sources.ts`); `PriceSourceBadge` shows what is live. The live-prices panel asks `getLivePriceStatus` which keys exist and never offers a search that can't run.
- Trip types are separate categories (`TRIP_TYPES` in `demo-data.ts`): road trip, fly-away, cruise, train & bus, staycation. Each lists its allowed transport modes (`modeForTripType` enforces them), destinations declare which types they suit in `bestFor`, and `categoriesFor()` in `budget.ts` decides which budget categories a type shows (cruise costs only on cruises, stops only on road trips, gas/tolls only when driving). The Road trip tab and page appear only for road trips.
- Cruises price cabin + main dining as a per-person-per-night fare plus gratuities and port fees in the `cruise` category (not taxed: port fees include taxes); hotel nights default to $0. Switching trip type goes through `tripActions.setTripType`, which re-estimates the budget and returns plain-language notes on what changed.
- Stored trips are version 4; `migrate()` maps the old "budget-vacation" (Getaway) type to fly-away, train & bus or road trip by transport mode.


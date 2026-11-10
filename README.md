ARG TRAVEL

Create a modern AI-powered travel planning web app. The app should eventually support every type of traveler, but the first version will focus on budget-friendly vacations, road trips, and staycations. Build a beautiful, mobile-friendly interface with:

A welcome page where users select their destination, dates, number of travelers, interests, and budget.

An intelligent budget calculator covering gas, food, water, accommodations, parking, tolls, taxes, activities, and miscellaneous expenses.

A protected emergency fund that is excluded from normal spending.

A personalized travel itinerary with suggested destinations, restaurants, and sightseeing stops.

A dashboard showing total planned expenses, remaining money, and potential savings.

Use example prices and locations clearly labeled as demonstrations until real travel-data integrations are available. Make the app functional with editable budgets and working calculations. Use a premium, modern design that feels friendly to both budget and luxury travelers. Do not implement real bookings or payments yet.

Hosted on Vercel, with accounts and saved trips in Supabase. See "Hosting" in `AGENTS.md`.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

### Checks

```sh
bun run check        # types, lint, unit tests and the data tools
bun run data:check   # just the data files in src/data
```

The data tools in `tools/` are Python (standard library only) and use [uv](https://docs.astral.sh/uv/):

```sh
cd tools
uv run pytest
uv run python -m waypoint_data check
uv run python -m waypoint_data fmt
curl -sLo airports.csv https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
uv run python -m waypoint_data airports airports.csv
uv run python -m waypoint_data prompts   # the trip assistant's 10,000-case test set
CORPUS_REPORT=1 bunx vitest run src/test/assistant-corpus.test.ts   # (from the repo root) accuracy per field
```

## Layout

- `src/routes`: pages. `src/components`: UI. `src/lib`: the app's logic, pure and tested (`src/test`).
- `src/lib/trip/`: the trip's shape, building, budget fitting, migrations and derived view; `src/lib/trip-store.ts` holds the current trip.
- `*.server.ts`: server-only code (AI, maps, prices, rate limits); reached from the browser only through `*.functions.ts` server functions.
- `src/data/`: reference data as JSON (airports, countries, states, places, cruises, nicknames, rules), built and checked by `tools/`.
- `src/lib/understand/`: Waypoint's own reading of trip requests (places, dates, money, groups, preferences), used by the assistant for everyone and to check the AI.

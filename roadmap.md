# Waypoint roadmap

## Audit & fix round (current)

- [x] P1 Cross-tab sync, stable trip IDs, AI results scoped to the trip they were requested for
- [x] P1 Trip type ↔ transport ↔ route consistency (flights get airport handling, no driving stops)
- [x] P1 Trip-type transitions explain what changed
- [x] P1 Date inputs: no reverting (start moves keep the length), one-day trips, timezone-safe dates, clear validation
- [ ] P2 One shared money engine in cents; "No spendable budget" instead of 999%
- [x] P2 Itinerary ↔ activities budget discrepancy flag + explicit sync (with Undo)
- [ ] P2 Live tips after itinerary edits; stale AI number tips hidden
- [ ] P2 Savings show category vs total-trip savings; safe apply/undo
- [x] P2 AI cancel/retry/timeout, previous plan kept
- [ ] P2 Arrival/departure times, travel days
- [x] P2 Demo / AI / your-own / map-verified labels (plan label + "Yours" + Google Maps links)
- [ ] P3 Saved trips in accounts (create, list, open, rename, duplicate, recoverable delete, save status, conflict detection)
- [ ] P3 Verify sign-in flow and live maps signed in
- [ ] P4 Dark-mode contrast, 44px touch targets, responsive check
- [x] P4 Itinerary editing: add, edit, swap, reorder, undo remove
- [x] Tests + browser checks (two tabs, delayed/cancelled/timed-out AI, mobile, both themes)

## Quality pass (done)

- [x] Accessibility audit (axe-core) clean on every page, both themes, mobile, menus and dialogs
- [x] AI grounded in real nearby places, weather and holidays; every answer checked before it's shown
- [x] "Refine this plan": ask the AI for specific changes, keep the rest
- [x] Plan trip jumps to the field that needs fixing; no impossible checklist steps
- [x] Security updates: vite 8.1.6, zod 4.6.6, vitest 4.1.12 and 24 transitive fixes

## Worldwide & free data (done)

- [x] ~50 international places and 7 international cruise routes; suggestions from any start point
- [x] °C / km and local-currency estimates for travelers outside the US (display menu to change)
- [x] Free real places for everyone: Wikipedia landmarks + OpenStreetMap restaurants
- [x] Destination photos and introductions (Wikipedia); public holidays during the trip
- [x] Regional train and bus booking links; print / save the itinerary as PDF

## After funding (costs money)

- [ ] AI on Claude with web search for live events, hours and prices
- [ ] Own Supabase, hosting and Google Maps key (leave Lovable, no badge)
- [ ] Live hotel/flight prices (SerpApi) and gas prices (EIA)
- [ ] Reliable sign-up emails (custom SMTP, e.g. Resend)

## Personal & booking (done)

- [x] Trips start where the traveler is (profile, device on request, or approximate city)
- [x] Suggestions ranked by distance, trip type and interests (50+ real places, 8 cruise ports)
- [x] Drive miles and example fares from the real start point
- [x] AI trip assistant: asks what it needs, suggests places, builds the trip
- [x] Book step: per-trip checklist with pre-filled provider searches, confirmations and spend vs. budget
- [x] Live trip preview on the Plan page; trip-type colors

## Organization & motion (done)

- [x] Nav in flow order: Plan, Overview, Budget, Itinerary, Road trip
- [x] Trip bar on every planning page; trip type switchable in place
- [x] Travel scenes: car drives, plane flies its arc, ship sails, train/bus pulls in, sun rises at home
- [x] Compact road-trip stops; plan vs. budget panel; itinerary page split into components
- [x] Budget derived once per change; odd dollar amounts no longer block the Plan form

## Live data & flow (done)

- [x] Live weather per trip day (forecast + typical beyond 16 days), weather-aware AI itineraries and rainy-day hints
- [x] Real place autocomplete for destinations and starting city
- [x] Live prices panel on the Budget page, per-category "Live price" labels, stale/date-changed warnings, connection status
- [x] Dashboard planning checklist (plan → live prices → stops → itinerary → save)
- [x] Separate trip types: road trip, fly-away, cruise (fare, gratuities, port fees), train & bus, staycation
- [x] Fixed custom/staycation destinations being searched as "X, Custom destination"

## Hardening (done)

- [x] CI on every PR and push to main: type check, lint, tests, build
- [x] AI itinerary requires sign-in (spends credits); stricter sign-in redirect check; booking links limited to http(s)
- [x] Removed unused chart library (recharts)

## Later (waiting on decisions or credentials)

- [ ] AI that learns preferences from past trips — after saved trips
- [ ] Credit card & membership perks (Chase Sapphire, Priority Pass lounges, Costco Travel) — needs: which cards/memberships first; perk terms need a maintained source
- [x] Real places (sights, restaurants, ratings, Maps links) in the itinerary for signed-in users
- [ ] Real hotel/flight prices — needs a SerpApi key (Google Hotels/Flights); user declined the key request for now
- [ ] Real gas prices — needs a free EIA key; user declined the key request for now
- [ ] Reviews (hotels, restaurants, malls) incl. Reddit threads — needs: reviews provider; Reddit API access/terms
- [ ] Booking flows — needs: booking partner and payments decision

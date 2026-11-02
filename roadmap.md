# Waypoint roadmap

## Audit & fix round (current)
- [ ] P1 Cross-tab sync, stable trip IDs, AI results scoped to the trip they were requested for
- [ ] P1 Trip type ↔ transport ↔ route consistency (flights get airport handling, no driving stops)
- [ ] P1 Trip-type transitions explain what changed
- [ ] P1 Date inputs: no reverting, one-day trips, timezone-safe dates, clear validation
- [ ] P2 One shared money engine in cents; "No spendable budget" instead of 999%
- [ ] P2 Itinerary ↔ activities budget discrepancy flag + explicit sync
- [ ] P2 Live tips after itinerary edits; stale AI number tips hidden
- [ ] P2 Savings show category vs total-trip savings; safe apply/undo
- [ ] P2 Arrival/departure times, travel days; AI cancel/retry/timeout, previous plan kept
- [ ] P2 Demo / AI / your-own / map-verified labels per item
- [ ] P3 Saved trips in accounts (create, list, open, rename, duplicate, recoverable delete, save status, conflict detection)
- [ ] P3 Verify sign-in flow and live maps signed in
- [ ] P4 Dark-mode contrast, 44px touch targets, responsive check
- [ ] P4 Itinerary editing: add, edit, swap, reorder, undo remove
- [ ] Tests + browser checks (two tabs, delayed AI, mobile, both themes)

## Live data & flow (done)
- [x] Live weather per trip day (forecast + typical beyond 16 days), weather-aware AI itineraries and rainy-day hints
- [x] Real place autocomplete for destinations and starting city
- [x] Live prices panel on the Budget page, per-category "Live price" labels, stale/date-changed warnings, connection status
- [x] Dashboard planning checklist (plan → live prices → stops → itinerary → save)
- [x] Fixed custom/staycation destinations being searched as "X, Custom destination"

## Later (waiting on decisions or credentials)
- [ ] AI that learns preferences from past trips — after saved trips
- [ ] Credit card & membership perks (Chase Sapphire, Priority Pass lounges, Costco Travel) — needs: which cards/memberships first; perk terms need a maintained source
- [x] Real places (sights, restaurants, ratings, Maps links) in the itinerary for signed-in users
- [ ] Real hotel/flight prices — needs a SerpApi key (Google Hotels/Flights); user declined the key request for now
- [ ] Real gas prices — needs a free EIA key; user declined the key request for now
- [ ] Reviews (hotels, restaurants, malls) incl. Reddit threads — needs: reviews provider; Reddit API access/terms
- [ ] Booking flows — needs: booking partner and payments decision

"""Waypoint's data tooling.

The app's reference data lives as JSON in `src/data/`, separate from code:

- `airports.json`: generated from OurAirports (`python -m waypoint_data airports`).
- `places.json` and `cruises.json`: the suggestion catalog, edited by hand.
- `rules.json`: the vocabulary and limits the data must follow (interests, trip
  types, how far an airport may be). The TypeScript tests check it matches the app.

`python -m waypoint_data check` validates all of it and `fmt` writes it in the one
canonical layout (one record per line), so diffs stay small and reviewable.
"""

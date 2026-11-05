"""Where the data files live, relative to the repository."""

from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "src" / "data"

AIRPORTS = DATA / "airports.json"
PLACES = DATA / "places.json"
CRUISES = DATA / "cruises.json"
RULES = DATA / "rules.json"
COUNTRIES = DATA / "countries.json"
STATES = DATA / "states.json"
ALIASES = DATA / "place-aliases.json"
VISAS = DATA / "visas.json"

#: Files whose layout `fmt` owns (rules.json is small and hand-formatted).
RECORD_FILES = (AIRPORTS, PLACES, CRUISES, COUNTRIES, STATES, ALIASES, VISAS)

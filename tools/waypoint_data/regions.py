"""Build src/data/countries.json and src/data/states.json from OurAirports'
countries.csv and regions.csv (public domain, same source as the airports).

The trip assistant uses them to read place names ("japan", "the uk", "asheville nc")
and to write them the way the app does ("City, ST" in the US, "City, Country" elsewhere).
"""

import csv
import re
from pathlib import Path

from . import jsonfile, paths

COUNTRIES_URL = (
    "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/countries.csv"
)
REGIONS_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/regions.csv"

#: Countries whose subdivisions travelers name after a city ("Portland, OR").
STATE_COUNTRIES = ("US", "CA", "AU")

#: What people call a country besides its name (lowercase is fine, matching ignores case).
EXTRA_ALIASES: dict[str, list[str]] = {
    "US": ["USA", "U.S.", "U.S.A.", "America", "the States", "United States of America"],
    "GB": ["UK", "U.K.", "Britain", "England", "Scotland", "Wales", "Northern Ireland"],
    "KR": ["Korea"],
    "AE": ["UAE", "Emirates"],
    "NL": ["Holland"],
    "CZ": ["Czechia"],
    "TR": ["Turkiye"],
    "CI": ["Ivory Coast"],
    "DO": ["DR", "Dominican Rep"],
    "VN": ["Viet Nam"],
}

#: Keyword noise in the source ("Airports in Hong Kong", "Dutch airports").
NOISE = re.compile(r"airport|aeropuert|luchthav|flughaf|aeroport|aéroport", re.IGNORECASE)


def _aliases(name: str, keywords: str) -> list[str]:
    out = []
    for word in (k.strip() for k in keywords.split(",")):
        if not word or NOISE.search(word) or not word.isascii() or len(word.split()) > 3:
            continue
        if word.lower() != name.lower() and word not in out:
            out.append(word)
    return out


def build_countries(rows: list[dict[str, str]]) -> list[dict]:
    out = []
    for r in sorted(rows, key=lambda r: r["code"]):
        code, name = r["code"].strip(), r["name"].strip()
        if not re.fullmatch(r"[A-Z]{2}", code) or not name:
            continue
        aliases = _aliases(name, r.get("keywords", ""))
        for extra in EXTRA_ALIASES.get(code, []):
            if extra not in aliases:
                aliases.append(extra)
        out.append({"code": code, "name": name, "aliases": aliases})
    return out


def build_states(rows: list[dict[str, str]]) -> list[list[str]]:
    """[country, short code, name] for US states, Canadian provinces, Australian states."""
    out = []
    for r in rows:
        country, local, name = r["iso_country"], r["local_code"].strip(), r["name"].strip()
        if country in STATE_COUNTRIES and re.fullmatch(r"[A-Z]{2,3}", local) and name:
            out.append([country, local, name])
    return sorted(out)


def build(countries_csv: Path, regions_csv: Path) -> tuple[list[dict], list[list[str]]]:
    with countries_csv.open(newline="", encoding="utf-8") as f:
        countries = build_countries(list(csv.DictReader(f)))
    with regions_csv.open(newline="", encoding="utf-8") as f:
        states = build_states(list(csv.DictReader(f)))
    jsonfile.write_records(paths.COUNTRIES, countries)
    jsonfile.write_records(paths.STATES, states)
    return countries, states

"""Checks for the data files. Each returns a list of problems in plain words (empty
when the data is fine), so a bad edit is caught in CI with a message that says
which record and what's wrong.
"""

import re
from collections import Counter
from collections.abc import Iterable, Sequence
from typing import Any

from .geo import miles_between, valid_point

SLUG = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
COUNTRY = re.compile(r"[A-Z]{2}")
IATA = re.compile(r"[A-Z]{3}")
#: The app's writing rule: no long dashes in anything shown to travelers.
LONG_DASH = re.compile("[\u2013\u2014]")

Record = dict[str, Any]


def _text_problems(where: str, field: str, value: object, limit: int) -> list[str]:
    if not isinstance(value, str) or not value.strip():
        return [f"{where}: {field} is missing"]
    out = []
    if value != value.strip() or "  " in value:
        out.append(f"{where}: {field} has stray spaces")
    if LONG_DASH.search(value):
        out.append(f"{where}: {field} uses a long dash (use a comma, period or colon)")
    if len(value) > limit:
        out.append(f"{where}: {field} is {len(value)} characters (at most {limit})")
    return out


def _duplicates(ids: Iterable[str]) -> list[str]:
    return sorted(i for i, n in Counter(ids).items() if n > 1)


def _subset_problems(where: str, field: str, values: object, allowed: Sequence[str]) -> list[str]:
    if not isinstance(values, list) or not values:
        return [f"{where}: {field} needs at least one value"]
    out = [f"{where}: unknown {field} {v!r}" for v in values if v not in allowed]
    if len(set(values)) != len(values):
        out.append(f"{where}: {field} lists a value twice")
    return out


def check_airports(rows: Sequence[Sequence[Any]]) -> list[str]:
    out: list[str] = []
    if not rows:
        return ["airports: the table is empty"]
    codes = [str(r[0]) if r else "" for r in rows]
    for i, row in enumerate(rows):
        where = f"airport {codes[i] or i}"
        if len(row) != 9:
            out.append(f"{where}: expected 9 columns, found {len(row)}")
            continue
        code, lat, lon, size, city, country, name, region, also = row
        if not isinstance(also, list) or not all(isinstance(a, str) and a for a in also):
            out.append(f"{where}: other names must be a list of text")
        if region and not re.fullmatch(r"[A-Z]{2,3}", str(region)):
            out.append(f"{where}: region must be a state code or empty")
        if not IATA.fullmatch(str(code)):
            out.append(f"{where}: code isn't three capital letters")
        if not valid_point(lat, lon):
            out.append(f"{where}: location is off the map")
        if size not in ("H", "L", "M"):
            out.append(f"{where}: size must be H, L or M")
        if not COUNTRY.fullmatch(str(country)):
            out.append(f"{where}: country isn't a two-letter code")
        if not str(name).strip():
            out.append(f"{where}: name is missing")
        if not isinstance(city, str):
            out.append(f"{where}: city must be text")
    if codes != sorted(codes):
        out.append("airports: rows must be sorted by code (regenerate the file)")
    out += [f"airport {c}: listed twice" for c in _duplicates(codes)]
    return out


def nearest_airport_miles(rows: Sequence[Sequence[Any]], lat: float, lon: float) -> float:
    """Straight-line miles to the closest airport in the table."""
    return min((miles_between(lat, lon, r[1], r[2]) for r in rows), default=float("inf"))


def check_places(
    places: Sequence[Record], rules: Record, airports: Sequence[Sequence[Any]]
) -> list[str]:
    out: list[str] = []
    limits = rules["textLimits"]
    countries = {r[5] for r in airports}
    for i, p in enumerate(places):
        pid = p.get("id")
        where = f"place {pid or i}"
        if not isinstance(pid, str) or not SLUG.fullmatch(pid):
            out.append(f"{where}: id must be lowercase words joined by hyphens")
        for field in ("name", "town", "region", "tagline"):
            out += _text_problems(where, field, p.get(field), limits[field])
        if not valid_point(p.get("lat"), p.get("lon")):
            out.append(f"{where}: location is off the map")
        out += _subset_problems(where, "interest", p.get("tags"), rules["interests"])
        out += _subset_problems(where, "trip type", p.get("types"), rules["placeTripTypes"])
        if p.get("tier") not in rules["tiers"]:
            out.append(f"{where}: tier must be one of {', '.join(rules['tiers'])}")
        country = p.get("country")
        if not isinstance(country, str) or not COUNTRY.fullmatch(country):
            out.append(f"{where}: country isn't a two-letter code")
        elif countries and country not in countries:
            out.append(f"{where}: country {country} isn't a known country code")
        # A place suggested for flying has to have an airport the app can find.
        if "flight" in (p.get("types") or []) and valid_point(p.get("lat"), p.get("lon")):
            miles = nearest_airport_miles(airports, p["lat"], p["lon"])
            if miles > rules["maxAirportMiles"]:
                out.append(
                    f"{where}: suggested for flights but the nearest airport is "
                    f"{miles:.0f} miles away (at most {rules['maxAirportMiles']})"
                )
        unknown = set(p) - set(rules["placeFields"])
        if unknown:
            out.append(f"{where}: unknown fields {', '.join(sorted(unknown))}")
    out += [f"place {d}: id used twice" for d in _duplicates(str(p.get("id")) for p in places)]
    return out


def check_cruises(cruises: Sequence[Record], rules: Record) -> list[str]:
    out: list[str] = []
    limits = rules["textLimits"]
    for i, c in enumerate(cruises):
        cid = c.get("id")
        where = f"cruise {cid or i}"
        if not isinstance(cid, str) or not SLUG.fullmatch(cid):
            out.append(f"{where}: id must be lowercase words joined by hyphens")
        for field, limit in (
            ("name", limits["name"]),
            ("tagline", limits["tagline"]),
            ("port", limits["town"]),
            ("callTown", limits["town"]),
        ):
            out += _text_problems(where, field, c.get(field), limit)
        for field in ("portPoint", "callPoint"):
            pt = c.get(field)
            if not isinstance(pt, dict) or not valid_point(pt.get("lat"), pt.get("lon")):
                out.append(f"{where}: {field} is off the map")
        out += _subset_problems(where, "interest", c.get("tags"), rules["interests"])
        if c.get("tier") not in rules["tiers"]:
            out.append(f"{where}: tier must be one of {', '.join(rules['tiers'])}")
        if "country" in c and not COUNTRY.fullmatch(str(c["country"])):
            out.append(f"{where}: country isn't a two-letter code")
        unknown = set(c) - set(rules["cruiseFields"])
        if unknown:
            out.append(f"{where}: unknown fields {', '.join(sorted(unknown))}")
    out += [f"cruise {d}: id used twice" for d in _duplicates(str(c.get("id")) for c in cruises)]
    return out


def check_countries(countries: Sequence[Record], states: Sequence[Sequence[str]]) -> list[str]:
    out: list[str] = []
    codes = [str(c.get("code")) for c in countries]
    for c in countries:
        where = f"country {c.get('code')}"
        if not COUNTRY.fullmatch(str(c.get("code"))):
            out.append(f"{where}: code isn't two capital letters")
        if not str(c.get("name") or "").strip():
            out.append(f"{where}: name is missing")
        if not isinstance(c.get("aliases"), list):
            out.append(f"{where}: aliases must be a list")
    out += [f"country {d}: listed twice" for d in _duplicates(codes)]
    known = set(codes)
    for s in states:
        if len(s) != 3 or s[0] not in known or not re.fullmatch(r"[A-Z]{2,3}", str(s[1])):
            out.append(f"state {s}: expected [country, code, name]")
    if not any(s[0] == "US" for s in states):
        out.append("states: the US states are missing")
    return out


def check_aliases(aliases: Sequence[Sequence[str]]) -> list[str]:
    """[what people type, the place it means, "city" or "region"]."""
    out: list[str] = []
    for row in aliases:
        where = f"alias {row[0] if row else row!r}"
        if len(row) != 3:
            out.append(f"{where}: expected [alias, place, kind]")
            continue
        alias, name, kind = row
        if not re.fullmatch(r"[a-z0-9]+( [a-z0-9]+)*", str(alias)):
            out.append(f"{where}: write the alias in plain lowercase words")
        out += _text_problems(where, "place", name, 80)
        if kind not in ("city", "region"):
            out.append(f"{where}: kind must be city or region")
    out += [f"alias {d}: listed twice" for d in _duplicates(str(r[0]) for r in aliases if r)]
    return out


#: Places the app counts as the US that GeoNames and OurAirports list as their own country.
US_TERRITORIES = {"PR", "VI", "GU"}

#: A catalog place's coordinates farther than this from the real town it names are wrong.
MAX_TOWN_KM = 60


def check_locations(
    places: list[Record], cruises: list[Record], towns: list[list], airports: list[list]
) -> list[str]:
    """Each place's coordinates against where its town really is (GeoNames, then airports).

    A place whose town isn't in either table is skipped; one whose town is, but far
    from the place's coordinates, is reported with the distance.
    """
    from .towns import fold, km

    # Keyed by name and country, and by name, country and state where there is one.
    where: dict[tuple[str, ...], list[tuple[float, float]]] = {}
    for t in towns[1:]:
        where.setdefault((fold(t[0]), t[1]), []).append((t[3], t[4]))
        if t[2]:
            where.setdefault((fold(t[0]), t[1], t[2]), []).append((t[3], t[4]))
    for a in airports:
        region = a[7] if len(a) > 7 else ""
        for n in [a[4], *(a[8] if len(a) > 8 else [])]:
            where.setdefault((fold(n), a[5]), []).append((a[1], a[2]))
            if region:
                where.setdefault((fold(n), a[5], region), []).append((a[1], a[2]))
    out: list[str] = []

    def near(label: str, town: str, country: str, at: tuple[float, float]) -> None:
        name, _, qualifier = (x.strip() for x in town.partition(","))
        key: tuple[str, ...] = (fold(name), country)
        if country == "US" and qualifier in US_TERRITORIES:
            key = (fold(name), qualifier)
        elif country in ("US", "CA", "AU") and qualifier.isupper() and 2 <= len(qualifier) <= 3:
            key = (fold(name), country, qualifier)
        spots = where.get(key)
        if not spots:
            return
        d = min(km(at, s) for s in spots)
        if d > MAX_TOWN_KM:
            out.append(f"{label}: {d:.0f} km from {town} (check its coordinates)")

    for p in places:
        near(f"places/{p['id']}", p["town"], p["country"], (p["lat"], p["lon"]))
    for c in cruises:
        country = c.get("country", "US")
        near(
            f"cruises/{c['id']} port",
            c["port"],
            country,
            (c["portPoint"]["lat"], c["portPoint"]["lon"]),
        )
    return out


def check_all(data: Record) -> list[str]:
    """Every check over the loaded files: airports, places, cruises (keys as in paths)."""
    from .towns import check_towns
    from .visas import check_visas

    rules = data["rules"]
    return (
        check_airports(data["airports"])
        + check_countries(data["countries"], data["states"])
        + check_aliases(data["aliases"])
        + check_visas(data["visas"])
        + check_towns(data["towns"])
        + check_places(data["places"], rules, data["airports"])
        + check_cruises(data["cruises"], rules)
        + check_locations(data["places"], data["cruises"], data["towns"], data["airports"])
    )

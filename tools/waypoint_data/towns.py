"""Build src/data/towns.json: the towns and cities travelers name that the airport table
doesn't cover (Cambridge, Siena, Sedona, Hallstatt...), from GeoNames (CC BY 4.0,
https://www.geonames.org).

Which towns: every place of 50,000 people or more, 15,000 or more in the countries
travelers visit most, and a hand-picked list of small towns people travel to
(MUST_HAVE). A town the airport table already has (same name and country, within
30 km) is left out.

Rows: the first is ["_meta", source, built date]; then
[name, country, region, lat, lon, population in thousands, word], where region is the
state or province code in the US, Canada and Australia (else ""), and word is 1 when
the name is also an everyday English word ("March", "Reading", "Normal"). The app only
reads a word town as a place when it's capitalized, qualified ("reading, uk") or listed
with other places, so "a week in march" stays a date.

Input: GeoNames' cities500/1000/5000 table (the .txt from the download, or
geonamescache's JSON copy of it) and a word list with common words in lowercase and
names capitalized (/usr/share/dict/words from the wamerican package).
"""

import json
import math
import unicodedata
from datetime import date
from pathlib import Path

from . import jsonfile, paths

SOURCE_URL = "https://download.geonames.org/export/dump/cities500.zip"
SOURCE = "GeoNames (CC BY 4.0, geonames.org)"

MIN_POP = 50_000
MIN_POP_TOURISM = 15_000
#: Countries where travelers often go to smaller towns.
TOURISM = set(
    [
        "US",
        "CA",
        "GB",
        "IE",
        "FR",
        "IT",
        "ES",
        "PT",
        "DE",
        "AT",
        "CH",
        "NL",
        "BE",
        "LU",
        "GR",
        "HR",
        "SI",
        "CZ",
        "HU",
        "PL",
        "DK",
        "NO",
        "SE",
        "FI",
        "IS",
        "MT",
        "CY",
        "MX",
        "CR",
        "AU",
        "NZ",
        "JP",
        "KR",
        "TH",
        "VN",
        "IL",
        "MA",
        "TR",
        "AR",
        "CL",
        "PE",
        "CO",
    ]
)
#: Words never read as towns, whatever GeoNames has (Of in Turkey, March in England,
#: Spring in Texas): small words, months, days, seasons and the words of trip plans.
NEVER = set(
    [
        "a",
        "an",
        "and",
        "as",
        "at",
        "be",
        "by",
        "do",
        "for",
        "go",
        "he",
        "i",
        "if",
        "in",
        "is",
        "it",
        "me",
        "my",
        "no",
        "of",
        "on",
        "or",
        "so",
        "the",
        "to",
        "up",
        "us",
        "we",
        "can",
        "may",
        "will",
        "was",
        "are",
        "you",
        "our",
        "its",
        "all",
        "but",
        "not",
        "out",
        "any",
        "one",
        "two",
        "ten",
        "new",
        "old",
        "big",
        "top",
        "get",
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "spring",
        "summer",
        "fall",
        "autumn",
        "winter",
        "week",
        "weekend",
        "weeks",
        "night",
        "nights",
        "day",
        "days",
        "month",
        "year",
        "holiday",
        "holidays",
        "break",
        "vacation",
        "trip",
        "long",
        "short",
        "christmas",
        "easter",
        "thanksgiving",
        "halloween",
        "memorial",
        "labor",
        "independence",
        "mom",
        "dad",
        "wife",
        "husband",
        "kids",
        "family",
        "friends",
        "people",
        "adults",
        "budget",
        "cheap",
        "luxury",
    ]
)

#: A town this close to one at least this many times bigger is a neighborhood of it.
NEIGHBORHOOD_KM = 8
NEIGHBORHOOD_RATIO = 10
NEIGHBORHOOD_CITY_POP = 100_000

#: Closer than this to an airport town of the same name, the airport row covers it.
SAME_TOWN_KM = 30

#: GeoNames numbers Canada's and Australia's provinces; the app uses their postal codes.
CA_PROVINCES = {
    "01": "AB", "02": "BC", "03": "MB", "04": "NB", "05": "NL", "07": "NS", "08": "ON",
    "09": "PE", "10": "QC", "11": "SK", "12": "YT", "13": "NT", "14": "NU",
}  # fmt: skip
AU_STATES = {
    "01": "ACT", "02": "NSW", "03": "NT", "04": "QLD", "05": "SA", "06": "TAS", "07": "VIC",
    "08": "WA",
}  # fmt: skip

#: Small towns people travel to, below the population cut: "Name|CC" (|region to pick
#: one), separated by semicolons.
MUST_HAVE = """
Sedona|US|AZ; Park City|US|UT; Jackson|US|WY; Vail|US|CO; Telluride|US|CO
Breckenridge|US|CO; Estes Park|US|CO; Taos|US|NM; Gatlinburg|US|TN; Pigeon Forge|US|TN
Bar Harbor|US|ME; Kennebunkport|US|ME; Provincetown|US|MA; Nantucket|US|MA; Stowe|US|VT
Woodstock|US|VT; Lake Placid|US|NY; Cooperstown|US|NY; Sonoma|US|CA; Healdsburg|US|CA
Calistoga|US|CA; Carmel-by-the-Sea|US|CA; Mendocino|US|CA; Solvang|US|CA; Ojai|US|CA
Laguna Beach|US|CA; South Lake Tahoe|US|CA; Springdale|US|UT; Williams|US|AZ; Tombstone|US|AZ
Bisbee|US|AZ; Marfa|US|TX; Fredericksburg|US|TX; Galena|US|IL
Saugatuck|US|MI; Eureka Springs|US|AR; Beaufort|US|SC; Hilton Head Island|US|SC; Islamorada|US|FL
Sanibel|US|FL; Highlands|US|NC; Blowing Rock|US|NC; Bryson City|US|NC; Leavenworth|US|WA
Friday Harbor|US|WA; Cannon Beach|US|OR; Sisters|US|OR; Whitefish|US|MT; Cody|US|WY
Deadwood|US|SD; Lahaina|US|HI; Seward|US|AK; Skagway|US|AK
Talkeetna|US|AK; Homer|US|AK; Williamsburg|US|VA; New Hope|US|PA
Cape May|US|NJ; Mystic|US|CT; Ogunquit|US|ME; Hot Springs|US|AR; Moab|US|UT
Big Bear Lake|US|CA; Jasper|CA|AB; Canmore|CA|AB; Banff|CA|AB; Whistler|CA|BC
Tofino|CA|BC; Niagara-on-the-Lake|CA|ON; Mont-Tremblant|CA|QC
Lunenburg|CA|NS; Baie-Saint-Paul|CA|QC
Hallstatt|AT; Zell am See|AT; Kitzbühel|AT; Sankt Wolfgang im Salzkammergut|AT; Interlaken|CH
Zermatt|CH; Grindelwald|CH; Lauterbrunnen|CH; St. Moritz|CH
Positano|IT; Amalfi|IT; Ravello|IT; Sorrento|IT; Capri|IT
Anacapri|IT; Portofino|IT; Monterosso al Mare|IT; Vernazza|IT; Riomaggiore|IT
Bellagio|IT; Varenna|IT; Taormina|IT; Cefalù|IT; Alberobello|IT
San Gimignano|IT; Montepulciano|IT; Cortona|IT; Orvieto|IT; Cortina d'Ampezzo|IT
Ortisei|IT; Chamonix-Mont-Blanc|FR; Èze|FR; Saint-Paul-de-Vence|FR; Gordes|FR
Rocamadour|FR; Honfleur|FR; Étretat|FR; Giverny|FR; Riquewihr|FR
Eguisheim|FR; Saint-Tropez|FR; Óbidos|PT; Nazaré|PT; Nerja|ES
Frigiliana|ES; Cadaqués|ES; Tossa de Mar|ES; Bled|SI; Piran|SI
Kotor|ME; Budva|ME; Rovinj|HR; Hvar|HR; Korčula|HR
Oia|GR; Fira|GR; Mýkonos|GR; Nafplio|GR
Lindos|GR; Giethoorn|NL; Volendam|NL; Rothenburg ob der Tauber|DE; Füssen|DE
Berchtesgaden|DE; Mittenwald|DE; Cochem|DE; Bacharach|DE; Rüdesheim am Rhein|DE
Český Krumlov|CZ; Windermere|GB; Ambleside|GB; Keswick|GB; Bourton on the Water|GB
St Ives|GB; Portree|GB; Fort William|GB; Pitlochry|GB; Oban|GB
Killarney|IE; Dingle|IE; Kinsale|IE; Vík í Mýrdal|IS
Sa Pa|VN; Ninh Bình|VN
Pai|TH; Hakone|JP; Wadi Musa|JO; Wanaka|NZ
Byron Bay|AU; Noosa Heads|AU; Port Douglas|AU; Margaret River|AU; Tulum|MX
Sayulita|MX; Bacalar|MX; Isla Mujeres|MX; Antigua Guatemala|GT
San Pedro|BZ; Ollantaytambo|PE; Machupicchu|PE; El Chaltén|AR; Cafayate|AR
Colonia del Sacramento|UY; Punta del Este|UY; Paraty|BR; Armação dos Búzios|BR
"""


def fold(s: str) -> str:
    """Lowercase ASCII, the way the app compares names ("Malmö" → "malmo")."""
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (la1, lo1), (la2, lo2) = a, b
    h = (
        math.sin(math.radians(la2 - la1) / 2) ** 2
        + math.cos(math.radians(la1))
        * math.cos(math.radians(la2))
        * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    )
    return 6371 * 2 * math.asin(math.sqrt(h))


def read_cities(path: Path) -> list[dict]:
    """GeoNames' cities table: the tab-separated download, or geonamescache's JSON."""
    if path.suffix == ".json":
        raw = json.loads(path.read_text(encoding="utf-8"))
        return [
            {
                "name": c["name"],
                "country": c["countrycode"],
                "admin1": c.get("admin1code", ""),
                "lat": float(c["latitude"]),
                "lon": float(c["longitude"]),
                "pop": int(c["population"]),
            }
            for c in (raw.values() if isinstance(raw, dict) else raw)
        ]
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            col = line.rstrip("\n").split("\t")
            if len(col) < 15 or not col[0].isdigit():
                continue
            out.append(
                {
                    "name": col[1],
                    "country": col[8],
                    "admin1": col[10],
                    "lat": float(col[4]),
                    "lon": float(col[5]),
                    "pop": int(col[14] or 0),
                }
            )
    return out


def read_words(path: Path) -> set[str]:
    """Everyday words: the list's lowercase entries (names in it are capitalized)."""
    with path.open(encoding="utf-8") as f:
        return {w.strip() for w in f if w.strip() and w.strip().islower() and "'" not in w}


def plain_name(c: dict) -> str:
    """The name travelers use: Japanese cities without "-shi" ("Nara-shi" is Nara)."""
    name = c["name"]
    if c["country"] == "JP" and name.endswith("-shi"):
        return name[: -len("-shi")]
    return name


def is_word(name: str, words: set[str]) -> bool:
    """A name made only of everyday words: "Reading", "The Beaches", "Long Mỹ" ("long my")."""
    tokens = fold(name).removeprefix("the ").replace("-", " ").split()
    return bool(tokens) and all(t in words or t in NEVER for t in tokens)


def region_of(c: dict) -> str:
    if c["country"] == "US":
        return c["admin1"] if len(c["admin1"]) == 2 else ""
    if c["country"] == "CA":
        return CA_PROVINCES.get(c["admin1"], "")
    if c["country"] == "AU":
        return AU_STATES.get(c["admin1"], "")
    return ""


def must_have() -> list[tuple[str, str, str]]:
    out = []
    for item in MUST_HAVE.replace("\n", ";").split(";"):
        parts = [p.strip() for p in item.split("|")]
        if len(parts) >= 2 and parts[0]:
            out.append((parts[0], parts[1], parts[2] if len(parts) > 2 else ""))
    return out


def build_rows(
    cities: list[dict], airports: list[list], words: set[str], built: str
) -> tuple[list[list], list[str]]:
    """The towns.json rows, and the MUST_HAVE towns the table didn't have."""
    air: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for a in airports:
        for n in [a[4], *(a[8] if len(a) > 8 else [])]:
            air.setdefault((fold(n), a[5]), []).append((a[1], a[2]))

    wanted = {(fold(n), c): r for n, c, r in must_have()}
    found: set[tuple[str, str]] = set()
    picked: list[dict] = []
    for c in cities:
        key = (fold(plain_name(c)), c["country"])
        region = region_of(c)
        must = key in wanted and (not wanted[key] or wanted[key] == region)
        floor = MIN_POP_TOURISM if c["country"] in TOURISM else MIN_POP
        if c["pop"] < floor and not must:
            continue
        if fold(plain_name(c)).removeprefix("the ") in NEVER:
            continue
        if must:
            found.add(key)
        picked.append({**c, "name": plain_name(c), "region": region, "key": key, "must": must})

    # Neighborhoods: GeoNames lists city districts as towns ("Bow" in London). A town
    # right next to a much bigger one is part of it, unless it's on the must-have list.
    big = [c for c in cities if c["pop"] >= NEIGHBORHOOD_CITY_POP]
    grid: dict[tuple[int, int], list[dict]] = {}
    for b in big:
        grid.setdefault((int(b["lat"] * 10), int(b["lon"] * 10)), []).append(b)

    def is_part(c: dict) -> bool:
        gy, gx = int(c["lat"] * 10), int(c["lon"] * 10)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for b in grid.get((gy + dy, gx + dx), []):
                    if (
                        b["country"] == c["country"]
                        and fold(b["name"]) != c["key"][0]
                        and b["pop"] >= NEIGHBORHOOD_RATIO * c["pop"]
                        and km((c["lat"], c["lon"]), (b["lat"], b["lon"])) < NEIGHBORHOOD_KM
                    ):
                        return True
        return False

    best: dict[tuple[str, str, str], dict] = {}
    for c in picked:
        if not c["must"] and is_part(c):
            continue
        if any(km((c["lat"], c["lon"]), p) < SAME_TOWN_KM for p in air.get(c["key"], [])):
            continue
        k = (c["key"][0], c["key"][1], c["region"])
        if k not in best or best[k]["pop"] < c["pop"]:
            best[k] = c

    rows: list[list] = [["_meta", SOURCE, built]]
    for c in sorted(best.values(), key=lambda c: (c["country"], fold(c["name"]), c["region"])):
        rows.append(
            [
                c["name"],
                c["country"],
                c["region"],
                round(c["lat"], 3),
                round(c["lon"], 3),
                max(1, round(c["pop"] / 1000)),
                1 if not c["must"] and is_word(c["name"], words) else 0,
            ]
        )
    missing = sorted(f"{n}|{c}" for (n, c) in wanted if (n, c) not in found)
    return rows, missing


def build(
    cities_path: Path, words_path: Path, out: Path = paths.TOWNS, built: str | None = None
) -> tuple[list[list], list[str]]:
    rows, missing = build_rows(
        read_cities(cities_path),
        jsonfile.load(paths.AIRPORTS),
        read_words(words_path),
        built or date.today().isoformat(),
    )
    jsonfile.write_records(out, rows)
    return rows, missing


def check_towns(rows: list[list]) -> list[str]:
    out: list[str] = []
    if not rows or rows[0][0] != "_meta" or len(rows[0]) != 3:
        return ["towns: the first row must be [_meta, source, built]"]
    seen: set[tuple[str, str, str]] = set()
    for r in rows[1:]:
        ok = (
            isinstance(r, list)
            and len(r) == 7
            and isinstance(r[0], str)
            and r[0].strip()
            and isinstance(r[1], str)
            and len(r[1]) == 2
            and r[1].isupper()
            and isinstance(r[2], str)
            and isinstance(r[3], (int, float))
            and -90 <= r[3] <= 90
            and isinstance(r[4], (int, float))
            and -180 <= r[4] <= 180
            and isinstance(r[5], int)
            and r[5] >= 1
            and r[6] in (0, 1)
        )
        if not ok:
            out.append(f"towns: bad row {r[:2]}")
            continue
        key = (fold(r[0]), r[1], r[2])
        if key in seen:
            out.append(f"towns: {r[0]}, {r[1]} {r[2]} is listed twice")
        seen.add(key)
    return out

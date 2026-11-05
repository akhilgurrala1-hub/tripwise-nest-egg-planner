"""Build src/data/airports.json from OurAirports' airports.csv (public domain).

Keeps large and medium airports with scheduled service and an IATA code: the
airports a traveler can actually book a flight to. Each row is
[IATA, lat, lon, size ("L" large / "M" medium), town, country, name, region, also],
where town is the town it serves in English (see citynames.py), region the state or
province code in the US, Canada and Australia ("NC"), and also the other names
people use for that town (its local name, the district the runway is in).
"""

import csv
import re
from collections.abc import Iterable
from pathlib import Path

from . import jsonfile, paths
from .citynames import names_for
from .regions import STATE_COUNTRIES

SOURCE_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv"

SIZES = {"large_airport": "L", "medium_airport": "M"}
IATA = re.compile(r"[A-Z]{3}")

AirportRow = list  # [code, lat, lon, size, town, country, name, region, also]


def clean_text(value: str | None, limit: int) -> str:
    """One line, no long dashes (the app's writing rule), at most `limit` characters."""
    text = re.sub(r"\s+", " ", value or "").replace("\u2013", "-").replace("\u2014", "-")
    return text.strip()[:limit]


def row_for(record: dict[str, str]) -> AirportRow | None:
    """The app's row for one CSV record, or None when it's not a bookable airport."""
    size = SIZES.get(record.get("type", ""))
    if not size or record.get("scheduled_service") != "yes":
        return None
    code = (record.get("iata_code") or "").strip()
    if not IATA.fullmatch(code):
        return None
    try:
        lat = round(float(record["latitude_deg"]), 3)
        lon = round(float(record["longitude_deg"]), 3)
    except (KeyError, ValueError):
        return None
    country = (record.get("iso_country") or "").strip()[:2]
    region = (record.get("iso_region") or "").strip()
    state = region.split("-", 1)[1] if country in STATE_COUNTRIES and "-" in region else ""
    name = clean_text(record.get("name"), 70)
    town, also = names_for(
        code, clean_text(record.get("municipality"), 80), name, record.get("keywords", "")
    )
    return [
        code,
        lat,
        lon,
        size,
        clean_text(town, 50),
        country,
        name,
        state if re.fullmatch(r"[A-Z]{2,3}", state) else "",
        [clean_text(a, 50) for a in also],
    ]


def build_rows(records: Iterable[dict[str, str]]) -> list[AirportRow]:
    """Every bookable airport, sorted by code, one row per code (the first wins)."""
    rows = sorted((r for r in map(row_for, records) if r), key=lambda r: r[0])
    seen: set[str] = set()
    unique = []
    for row in rows:
        if row[0] not in seen:
            seen.add(row[0])
            unique.append(row)
    return unique


def build(csv_path: Path, out: Path = paths.AIRPORTS) -> list[AirportRow]:
    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = build_rows(csv.DictReader(f))
    jsonfile.write_records(out, rows)
    return rows

"""Build src/data/visas.json: what each passport needs to enter each country, from the
Passport Index dataset (MIT license, https://github.com/imorte/passport-index-data,
scraped from passportindex.org).

One row per passport: [passport, codes], where codes has one entry per destination
(in the order of the first row's list), comma-separated:
  a number  visa-free for that many days     F  visa-free, no set limit
  A  visa on arrival                          T  electronic travel authorisation (ESTA, eTA...)
  E  e-visa                                   V  visa required
  N  no admission                             -  their own country
The first row is ["_meta", last updated, "AD,AE,..." destinations].

The app uses it to say whether a traveler can leave the airport on a layover and what
entering the destination takes. It's guidance with a date on it, not a ruling: the
page always points to an official check.
"""

import csv
import re
from pathlib import Path

from . import jsonfile, paths

SOURCE_URL = (
    "https://raw.githubusercontent.com/imorte/passport-index-data/main/passport-index-tidy-iso2.csv"
)
CODES = {
    "visa free": "F",
    "visa on arrival": "A",
    "eta": "T",
    "e-visa": "E",
    "visa required": "V",
    "no admission": "N",
    "-1": "-",
}
CODE = re.compile(r"\d{1,3}|[FATEVN-]")


def code_for(requirement: str) -> str:
    r = requirement.strip().lower()
    if r.isdigit():
        return str(int(r))
    if r not in CODES:
        raise ValueError(f"unknown requirement {requirement!r}")
    return CODES[r]


def build_rows(records: list[dict[str, str]], updated: str) -> list[list[str]]:
    dests = sorted({r["Destination"].strip().upper() for r in records})
    index = {d: i for i, d in enumerate(dests)}
    table: dict[str, list[str]] = {}
    for r in records:
        p = r["Passport"].strip().upper()
        d = r["Destination"].strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", p) or d not in index:
            continue
        table.setdefault(p, ["V"] * len(dests))[index[d]] = code_for(r["Requirement"])
    rows = [["_meta", updated, ",".join(dests)]]
    rows += [[p, ",".join(codes)] for p, codes in sorted(table.items())]
    return rows


def build(csv_path: Path, updated: str, out: Path = paths.VISAS) -> list[list[str]]:
    with csv_path.open(newline="", encoding="utf-8") as f:
        rows = build_rows(list(csv.DictReader(f)), updated)
    jsonfile.write_records(out, rows)
    return rows


def check_visas(rows: list[list[str]]) -> list[str]:
    out: list[str] = []
    if not rows or rows[0][0] != "_meta" or len(rows[0]) != 3:
        return ["visas: the first row must be [_meta, updated, destinations]"]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", rows[0][1]):
        out.append("visas: the updated date must be YYYY-MM-DD")
    dests = rows[0][2].split(",")
    for row in rows[1:]:
        if len(row) != 2 or not re.fullmatch(r"[A-Z]{2}", row[0]):
            out.append(f"visas: bad row {row[:1]}")
            continue
        codes = row[1].split(",")
        if len(codes) != len(dests):
            out.append(f"visas {row[0]}: {len(codes)} entries for {len(dests)} destinations")
        bad = [c for c in codes if not CODE.fullmatch(c)]
        if bad:
            out.append(f"visas {row[0]}: unknown codes {bad[:3]}")
        if row[0] in dests and codes[dests.index(row[0])] != "-":
            out.append(f"visas {row[0]}: its own country should be '-'")
    if len(rows) < 150:
        out.append("visas: fewer than 150 passports")
    return out

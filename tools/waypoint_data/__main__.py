"""Command line for Waypoint's data files: check, fmt, airports.

- check: validate every data file (exit 1 on any problem)
- fmt [--check]: rewrite data files in the canonical layout (--check only reports)
- airports [CSV]: rebuild airports.json from OurAirports' airports.csv
- regions [COUNTRIES REGIONS]: rebuild countries.json and states.json
- prompts [--check]: write the trip assistant's 10,000-case test set
- visas [CSV] [--updated DATE]: rebuild visas.json from the Passport Index dataset
- towns [CITIES WORDS]: rebuild towns.json from GeoNames and an English word list
"""

import argparse
import sys
from pathlib import Path

from . import airports, checks, jsonfile, paths, prompts, regions, towns, visas


def load_all() -> dict:
    return {
        "airports": jsonfile.load(paths.AIRPORTS),
        "places": jsonfile.load(paths.PLACES),
        "cruises": jsonfile.load(paths.CRUISES),
        "rules": jsonfile.load(paths.RULES),
        "countries": jsonfile.load(paths.COUNTRIES),
        "states": jsonfile.load(paths.STATES),
        "aliases": jsonfile.load(paths.ALIASES),
        "visas": jsonfile.load(paths.VISAS),
        "towns": jsonfile.load(paths.TOWNS),
    }


def cmd_check(_: argparse.Namespace) -> int:
    data = load_all()
    problems = checks.check_all(data)
    problems += [
        f"{p.relative_to(paths.REPO)}: not in the canonical layout (run fmt)"
        for p in paths.RECORD_FILES
        if not jsonfile.is_canonical(p)
    ]
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        print(f"{len(problems)} problem(s) in src/data", file=sys.stderr)
        return 1
    print(
        f"src/data is fine: {len(data['airports'])} airports, "
        f"{len(data['places'])} places, {len(data['cruises'])} cruises"
    )
    return 0


def cmd_fmt(args: argparse.Namespace) -> int:
    changed = [p for p in paths.RECORD_FILES if not jsonfile.is_canonical(p)]
    if args.check:
        for p in changed:
            print(f"{p.relative_to(paths.REPO)} needs formatting", file=sys.stderr)
        return 1 if changed else 0
    for p in changed:
        jsonfile.write_records(p, jsonfile.load(p))
        print(f"formatted {p.relative_to(paths.REPO)}")
    return 0


def cmd_airports(args: argparse.Namespace) -> int:
    if not args.csv:
        print(f"Download the table first:\n  curl -sLo airports.csv {airports.SOURCE_URL}")
        return 2
    rows = airports.build(Path(args.csv))
    large = sum(1 for r in rows if r[3] in ("H", "L"))
    print(f"wrote {len(rows)} airports ({large} large) to {paths.AIRPORTS.relative_to(paths.REPO)}")
    return 0


def cmd_regions(args: argparse.Namespace) -> int:
    if not (args.countries and args.regions):
        print(
            "Download the tables first:\n"
            f"  curl -sLo countries.csv {regions.COUNTRIES_URL}\n"
            f"  curl -sLo regions.csv {regions.REGIONS_URL}"
        )
        return 2
    countries, states = regions.build(Path(args.countries), Path(args.regions))
    print(f"wrote {len(countries)} countries and {len(states)} states and provinces")
    return 0


def cmd_prompts(args: argparse.Namespace) -> int:
    if args.check:
        if prompts.is_current():
            print("the assistant test set is current")
            return 0
        print("tools/corpus/assistant-prompts.jsonl is out of date (run prompts)", file=sys.stderr)
        return 1
    n = prompts.write()
    print(f"wrote {n} cases to {prompts.CORPUS.relative_to(paths.REPO)}")
    return 0


def cmd_visas(args: argparse.Namespace) -> int:
    if not args.csv:
        print(f"Download the table first:\n  curl -sLo visas.csv {visas.SOURCE_URL}")
        return 2
    rows = visas.build(Path(args.csv), args.updated)
    print(f"wrote {len(rows) - 1} passports to {paths.VISAS.relative_to(paths.REPO)}")
    return 0


def cmd_towns(args: argparse.Namespace) -> int:
    if not (args.cities and args.words):
        print(
            "Download the tables first:\n"
            f"  curl -sLo cities500.zip {towns.SOURCE_URL} && unzip cities500.zip\n"
            "  and an English word list (apt-get install wamerican: /usr/share/dict/words)"
        )
        return 2
    rows, missing = towns.build(Path(args.cities), Path(args.words))
    words = sum(1 for r in rows[1:] if r[6])
    print(
        f"wrote {len(rows) - 1} towns ({words} also everyday words) to "
        f"{paths.TOWNS.relative_to(paths.REPO)}"
    )
    if missing:
        print("not found in the table: " + ", ".join(missing), file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="waypoint_data", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="validate every data file").set_defaults(run=cmd_check)
    fmt = sub.add_parser("fmt", help="write data files in the canonical layout")
    fmt.add_argument("--check", action="store_true", help="only report files that need it")
    fmt.set_defaults(run=cmd_fmt)
    air = sub.add_parser("airports", help="rebuild airports.json from airports.csv")
    air.add_argument("csv", nargs="?", help="path to OurAirports' airports.csv")
    air.set_defaults(run=cmd_airports)
    reg = sub.add_parser("regions", help="rebuild countries.json and states.json")
    reg.add_argument("countries", nargs="?", help="path to OurAirports' countries.csv")
    reg.add_argument("regions", nargs="?", help="path to OurAirports' regions.csv")
    reg.set_defaults(run=cmd_regions)
    pr = sub.add_parser("prompts", help="write the trip assistant's test set")
    pr.add_argument("--check", action="store_true", help="only check it's current")
    pr.set_defaults(run=cmd_prompts)
    vi = sub.add_parser("visas", help="rebuild visas.json from the Passport Index dataset")
    vi.add_argument("csv", nargs="?", help="path to passport-index-tidy-iso2.csv")
    vi.add_argument("--updated", default="2026-02-17", help="the dataset's last-updated date")
    vi.set_defaults(run=cmd_visas)
    tw = sub.add_parser("towns", help="rebuild towns.json from GeoNames")
    tw.add_argument("cities", nargs="?", help="GeoNames cities500.txt (or geonamescache JSON)")
    tw.add_argument("words", nargs="?", help="word list, common words in lowercase")
    tw.set_defaults(run=cmd_towns)
    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())

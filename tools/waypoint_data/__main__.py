"""Command line for Waypoint's data files: check, fmt, airports.

- check: validate every data file (exit 1 on any problem)
- fmt [--check]: rewrite data files in the canonical layout (--check only reports)
- airports [CSV]: rebuild airports.json from OurAirports' airports.csv
"""

import argparse
import sys
from pathlib import Path

from . import airports, checks, jsonfile, paths


def load_all() -> dict:
    return {
        "airports": jsonfile.load(paths.AIRPORTS),
        "places": jsonfile.load(paths.PLACES),
        "cruises": jsonfile.load(paths.CRUISES),
        "rules": jsonfile.load(paths.RULES),
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
    large = sum(1 for r in rows if r[3] == "L")
    print(f"wrote {len(rows)} airports ({large} large) to {paths.AIRPORTS.relative_to(paths.REPO)}")
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
    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())

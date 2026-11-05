import csv
import io

from waypoint_data import airports, jsonfile

HEADER = (
    "type,scheduled_service,iata_code,latitude_deg,longitude_deg,municipality,iso_country,name,"
    "iso_region"
)


def records(*lines: str):
    return list(csv.DictReader(io.StringIO("\n".join([HEADER, *lines]))))


def test_keeps_bookable_airports_only():
    rows = airports.build_rows(
        records(
            "large_airport,yes,ORD,41.9786,-87.9048,Chicago,US,Chicago O'Hare International,US-IL",
            "medium_airport,yes,AVL,35.4362,-82.5418,Asheville,US,Asheville Regional,US-NC",
            "small_airport,yes,XXA,1,1,Town,US,Grass strip",  # too small
            "large_airport,no,XXB,1,1,Town,US,Military field",  # no scheduled service
            "medium_airport,yes,,1,1,Town,US,No code",  # no IATA code
            "medium_airport,yes,ab1,1,1,Town,US,Bad code",
            "medium_airport,yes,XXC,north,1,Town,US,Bad latitude",
        )
    )
    assert [r[0] for r in rows] == ["AVL", "ORD"]
    assert rows[1] == [
        "ORD",
        41.979,
        -87.905,
        "L",
        "Chicago",
        "US",
        "Chicago O'Hare International",
        "IL",
        [],
    ]


def test_text_is_one_line_without_long_dashes():
    rows = airports.build_rows(
        records('medium_airport,yes,AAA,0,0,"Town \u2013  North",FR,"Name\u2014with   dash"')
    )
    assert rows[0][4] == "Town - North"
    assert rows[0][6] == "Name-with dash"


def test_one_row_per_code_sorted():
    rows = airports.build_rows(
        records(
            "medium_airport,yes,ZZZ,0,0,Z,US,Last",
            "large_airport,yes,AAA,0,0,A,US,First",
            "medium_airport,yes,AAA,1,1,A,US,Duplicate",
        )
    )
    assert [(r[0], r[6]) for r in rows] == [("AAA", "First"), ("ZZZ", "Last")]


def test_build_writes_the_canonical_file(tmp_path):
    src = tmp_path / "airports.csv"
    src.write_text(HEADER + "\nlarge_airport,yes,KEF,63.985,-22.6056,Reykjavik,IS,Keflavik,IS-1\n")
    out = tmp_path / "airports.json"
    airports.build(src, out)
    assert jsonfile.load(out) == [
        ["KEF", 63.985, -22.606, "L", "Reykjavik", "IS", "Keflavik", "", []]
    ]
    assert jsonfile.is_canonical(out)

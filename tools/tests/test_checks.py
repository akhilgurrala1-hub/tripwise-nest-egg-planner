from waypoint_data import checks


def test_good_records_pass(place, cruise, rules, airports):
    assert checks.check_places([place], rules, airports) == []
    assert checks.check_cruises([cruise], rules) == []
    assert checks.check_airports(airports) == []


def test_place_problems_are_named(place, rules, airports):
    bad = {
        **place,
        "id": "Blue Ridge",
        "tagline": "Drives \u2014 towns",
        "tags": ["nature", "skiing"],
        "types": ["cruise"],
        "tier": "cheap",
        "country": "usa",
        "lat": 123,
        "extra": 1,
    }
    problems = "\n".join(checks.check_places([bad], rules, airports))
    for expected in (
        "id must be lowercase",
        "long dash",
        "unknown interest 'skiing'",
        "unknown trip type 'cruise'",
        "tier must be one of",
        "country isn't a two-letter code",
        "off the map",
        "unknown fields extra",
    ):
        assert expected in problems


def test_flight_places_need_an_airport(place, rules, airports):
    remote = {**place, "id": "far", "lat": -54.8, "lon": -68.3}  # Ushuaia, not in the table
    problems = checks.check_places([remote], rules, airports)
    assert any("nearest airport is" in p for p in problems)
    # A road-trip-only place doesn't need one.
    assert checks.check_places([{**remote, "types": ["road-trip"]}], rules, airports) == []


def test_unknown_country_and_duplicate_ids(place, rules, airports):
    problems = checks.check_places([place, {**place, "country": "ZZ"}], rules, airports)
    assert "place blue-ridge: id used twice" in problems
    assert any("ZZ isn't a known country" in p for p in problems)


def test_text_limits_and_spaces(place, rules, airports):
    rules["textLimits"]["tagline"] = 10
    problems = checks.check_places([{**place, "name": " Blue  Ridge"}], rules, airports)
    assert any("name has stray spaces" in p for p in problems)
    assert any("tagline is 30 characters (at most 10)" in p for p in problems)


def test_cruise_problems(cruise, rules):
    bad = {**cruise, "callPoint": {"lat": 0}, "tags": [], "country": "Bahamas"}
    problems = "\n".join(checks.check_cruises([bad, cruise], rules))
    assert "callPoint is off the map" in problems
    assert "interest needs at least one value" in problems
    assert "country isn't a two-letter code" in problems
    assert "id used twice" in problems


def test_airport_table_problems(airports):
    airports.append(["ATL", 0, 0, "L", "Atlanta", "US", "Again"])
    airports.append(["bad", 0, 200, "S", "X", "U", ""])
    problems = "\n".join(checks.check_airports(airports))
    assert "airport ATL: listed twice" in problems
    assert "must be sorted" in problems
    for expected in ("three capital letters", "off the map", "L or M", "two-letter", "name"):
        assert expected in problems


def test_booleans_are_not_coordinates():
    assert not checks.valid_point(True, 0)
    assert checks.valid_point(-90, 180)

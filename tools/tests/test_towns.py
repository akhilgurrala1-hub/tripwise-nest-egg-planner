from waypoint_data import checks, towns


def city(name, country, pop, lat=0.0, lon=0.0, admin1=""):
    return {"name": name, "country": country, "admin1": admin1, "lat": lat, "lon": lon, "pop": pop}


WORDS = {"reading", "march", "beaches", "long", "my", "can"}


def build(cities, airports=()):
    rows, missing = towns.build_rows(cities, list(airports), WORDS, "2026-11-05")
    return rows, {r[0]: r for r in rows[1:]}, missing


def test_picks_towns_by_size_and_where_travelers_go():
    _, by, _ = build(
        [
            city("Siena", "IT", 54_000, 43.32, 11.33),  # tourism country: 15k is enough
            city("Small Town", "IT", 9_000, 44.0, 11.0),
            city("Kayes", "ML", 30_000, 14.4, -11.4),  # elsewhere: 50k
            city("Bamako", "ML", 1_800_000, 12.6, -8.0),
            city("Sedona", "US", 10_000, 34.87, -111.76, "AZ"),  # on the must-have list
        ]
    )
    assert set(by) == {"Siena", "Bamako", "Sedona"}
    assert by["Sedona"][1:3] == ["US", "AZ"]
    assert by["Siena"][5] == 54


def test_skips_towns_the_airport_table_has_and_neighborhoods():
    airports = [["SEA", 47.45, -122.31, "L", "Seattle", "US", "Seattle-Tacoma", "WA", []]]
    _, by, _ = build(
        [
            city("Seattle", "US", 750_000, 47.61, -122.33, "WA"),
            city("Vancouver", "CA", 600_000, 49.25, -123.12, "02"),
            city("Killarney", "CA", 28_000, 49.22, -123.04, "02"),  # a Vancouver neighborhood
            city("Burnaby", "CA", 250_000, 49.27, -122.95, "02"),  # a city next door: kept
        ],
        airports,
    )
    assert "Seattle" not in by
    assert "Killarney" not in by
    assert {"Vancouver", "Burnaby"} <= set(by)
    assert by["Vancouver"][2] == "BC"


def test_marks_words_and_drops_names_that_are_never_towns():
    _, by, _ = build(
        [
            city("Reading", "GB", 230_000, 51.45, -0.97),
            city("The Beaches", "CA", 21_000, 43.67, -79.3),
            city("Long Mỹ", "VN", 60_000, 9.68, 105.57),
            city("Cambridge", "GB", 145_000, 52.2, 0.12),
            city("March", "GB", 22_000, 52.55, 0.09),
            city("Of", "TR", 70_000, 40.95, 40.27),
            city("Nara-shi", "JP", 360_000, 34.68, 135.8),
        ]
    )
    assert by["Reading"][6] == 1
    assert by["The Beaches"][6] == 1
    assert by["Long Mỹ"][6] == 1
    assert by["Cambridge"][6] == 0
    assert "March" not in by and "Of" not in by
    assert "Nara" in by


def test_reports_must_have_towns_it_cannot_find():
    _, _, missing = build([city("Sedona", "US", 10_000, 34.87, -111.76, "AZ")])
    assert "sedona|US" not in missing
    assert "hallstatt|AT" in missing


def test_the_must_have_list_parses():
    entries = towns.must_have()
    assert ("Sedona", "US", "AZ") in entries
    assert ("Hallstatt", "AT", "") in entries
    assert all(len(cc) == 2 and cc.isupper() for _, cc, _ in entries)


def test_the_table_checks_out(repo_data):
    assert towns.check_towns(repo_data["towns"]) == []
    assert towns.check_towns([["_meta", "x", "y"], ["Bad", "usa", "", 1, 1, 1, 0]])
    assert towns.check_towns(
        [["_meta", "x", "y"], ["A", "US", "", 1, 1, 1, 0], ["A", "US", "", 2, 2, 1, 0]]
    )


def test_catalog_places_sit_where_their_towns_are(repo_data, place):
    data = repo_data
    assert (
        checks.check_locations(data["places"], data["cruises"], data["towns"], data["airports"])
        == []
    )
    wrong = {**place, "id": "moved", "town": "Asheville, NC", "lat": 40.0, "lon": -100.0}
    problems = checks.check_locations([wrong], [], data["towns"], data["airports"])
    assert problems and "places/moved" in problems[0] and "km from Asheville, NC" in problems[0]
    # Logan, OH is checked against Ohio, not Logan, Utah.
    logan = {**place, "id": "hocking", "town": "Logan, OH", "lat": 39.54, "lon": -82.41}
    assert checks.check_locations([logan], [], data["towns"], data["airports"]) == []

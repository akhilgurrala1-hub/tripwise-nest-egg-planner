from waypoint_data import regions


def test_countries_get_clean_aliases():
    rows = [
        {"code": "NL", "name": "Netherlands", "keywords": "Holland, Luchthavens van Nederland"},
        {"code": "US", "name": "United States", "keywords": "American airports"},
        {"code": "x1", "name": "Bad", "keywords": ""},
    ]
    out = regions.build_countries(rows)
    assert [c["code"] for c in out] == ["NL", "US"]
    assert out[0]["aliases"] == ["Holland"]
    assert "USA" in out[1]["aliases"]
    assert "American airports" not in out[1]["aliases"]


def test_states_only_where_people_use_them():
    rows = [
        {"iso_country": "US", "local_code": "NC", "name": "North Carolina"},
        {"iso_country": "AU", "local_code": "NSW", "name": "New South Wales"},
        {"iso_country": "FR", "local_code": "75", "name": "Paris"},
        {"iso_country": "US", "local_code": "U-A", "name": "Unknown"},
    ]
    assert regions.build_states(rows) == [
        ["AU", "NSW", "New South Wales"],
        ["US", "NC", "North Carolina"],
    ]

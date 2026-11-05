import pytest

from waypoint_data import visas


def test_codes_are_compact_and_complete():
    rows = visas.build_rows(
        [
            {"Passport": "US", "Destination": "IT", "Requirement": "90"},
            {"Passport": "US", "Destination": "US", "Requirement": "-1"},
            {"Passport": "US", "Destination": "CN", "Requirement": "visa required"},
            {"Passport": "IN", "Destination": "AE", "Requirement": "e-visa"},
            {"Passport": "IN", "Destination": "US", "Requirement": "visa required"},
        ],
        "2026-02-17",
    )
    assert rows[0] == ["_meta", "2026-02-17", "AE,CN,IT,US"]
    assert rows[1] == ["IN", "E,V,V,V"]
    assert rows[2] == ["US", "V,V,90,-"]
    with pytest.raises(ValueError):
        visas.code_for("maybe")


def test_the_table_checks_out(repo_data):
    assert visas.check_visas(repo_data["visas"]) == []
    assert visas.check_visas([["_meta", "x", "AA,BB"], ["US", "F"]])

"""The real files in src/data: valid, canonical, and covering what the app needs."""

from waypoint_data import __main__ as cli
from waypoint_data import checks, jsonfile, paths


def test_repo_data_passes_every_check(repo_data):
    assert checks.check_all(repo_data) == []


def test_repo_data_is_canonical():
    for p in paths.RECORD_FILES:
        assert jsonfile.is_canonical(p), f"run: python -m waypoint_data fmt ({p.name})"


def test_hubs_travelers_fly_to_are_there(repo_data):
    codes = {r[0] for r in repo_data["airports"]}
    assert len(codes) > 3000
    assert {"ORD", "JFK", "LHR", "CDG", "NRT", "SYD", "GRU", "JNB", "KEF", "FCO"} <= codes


def test_check_command(capsys):
    assert cli.main(["check"]) == 0
    assert "src/data is fine" in capsys.readouterr().out
    assert cli.main(["fmt", "--check"]) == 0


def test_places_people_name_are_readable(repo_data):
    names = {c["name"] for c in repo_data["countries"]}
    assert {"Japan", "Italy", "United Kingdom", "Mexico"} <= names
    states = {(s[0], s[1]) for s in repo_data["states"]}
    assert {("US", "NC"), ("US", "CA"), ("CA", "ON"), ("AU", "NSW")} <= states
    clt = next(r for r in repo_data["airports"] if r[0] == "CLT")
    assert clt[7] == "NC"

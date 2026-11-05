from datetime import date

from waypoint_data import prompts


def test_the_set_is_10000_unique_cases_of_every_kind():
    cases = prompts.generate()
    assert len(cases) == prompts.COUNT == 10_000
    keys = {str(c.get("messages") or c.get("turns")) + c["today"] for c in cases}
    assert len(keys) == len(cases)
    kinds = {c["kind"] for c in cases}
    assert kinds == {"single", "multi", "vague", "origin", "covered", "typos", "conversation"}
    # Vague and short messages are a real share of the set.
    assert sum(c["kind"] == "vague" for c in cases) > 500


def test_it_is_deterministic_and_the_committed_file_is_current():
    assert prompts.dumps(prompts.generate(200)) == prompts.dumps(prompts.generate(200))
    assert prompts.is_current(), "run: python -m waypoint_data prompts"


def test_dates_follow_the_apps_rules():
    thursday = date(2026, 11, 5)
    # A month with no day is its first Friday; a past one is next year's.
    assert prompts.month_start(thursday, 3).isoformat() == "2027-03-05"
    assert prompts.month_start(thursday, 11).isoformat() == "2026-11-06"
    # Thanksgiving trips start the Wednesday before; July 4th trips on the 3rd.
    make, nights = prompts.HOLIDAYS["thanksgiving"]
    assert prompts.upcoming(thursday, make).isoformat() == "2026-11-25"
    assert nights == 4
    make, _ = prompts.HOLIDAYS["memorial day weekend"]
    assert prompts.upcoming(thursday, make).isoformat() == "2027-05-28"


def test_every_case_says_what_it_expects():
    for c in prompts.generate(500):
        assert c["expect"], c
        assert c["today"] in prompts.TODAYS
        assert c.get("messages") or c.get("turns")

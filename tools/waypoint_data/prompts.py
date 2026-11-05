"""Generate the trip assistant's test set: 10,000 messages and conversations the way
people really type them (vague, misspelled, all lowercase, multi-city, families,
budgets in every format, holidays, "idk somewhere warm lol"), each with what the
assistant should understand from it.

The expected answers are worked out here, independently of the app's TypeScript
reader, so the test in src/test/assistant-corpus.test.ts checks one implementation
against another. The file is deterministic (fixed seed): regenerate it with
`python -m waypoint_data prompts` and CI checks it's current with `--check`.
"""

import json
import random
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from . import jsonfile, paths

CORPUS = paths.REPO / "tools" / "corpus" / "assistant-prompts.jsonl"
COUNT = 10_000
SEED = 20261105
#: The "today" each case is read on: a Monday, a Thursday and a Saturday.
TODAYS = ("2026-03-02", "2026-11-05", "2027-06-12")

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]  # fmt: skip
MONTH_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


# --- Dates, worked out the way the app promises (see src/lib/understand/when.ts) ---


def d(iso: str) -> date:
    return date.fromisoformat(iso)


def on_or_after(day: date, weekday: int) -> date:
    """First `weekday` (Monday = 0) on or after `day`."""
    return day + timedelta(days=(weekday - day.weekday()) % 7)


FRIDAY, SATURDAY, SUNDAY, MONDAY, THURSDAY = 4, 5, 6, 0, 3


def month_start(today: date, month: int, year: int | None = None) -> date:
    """A month with no day: its first Friday, never in the past."""

    def pick(y: int) -> date:
        return on_or_after(date(y, month, 1), FRIDAY)

    if year:
        first = pick(year)
        return first if first >= today else on_or_after(today + timedelta(days=7), FRIDAY)
    first = pick(today.year)
    if first >= today:
        return first
    soon = on_or_after(today + timedelta(days=7), FRIDAY)
    if soon.month == month and soon.year == today.year:
        return soon
    return pick(today.year + 1)


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    if n > 0:
        return on_or_after(date(year, month, 1), weekday) + timedelta(days=7 * (n - 1))
    last = (date(year + (month == 12), month % 12 + 1, 1)) - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def upcoming(today: date, make) -> date:
    this = make(today.year)
    return this if this >= today else make(today.year + 1)


HOLIDAYS = {
    "thanksgiving": (lambda y: nth_weekday(y, 11, THURSDAY, 4) - timedelta(days=1), 4),
    "christmas": (lambda y: date(y, 12, 23), 4),
    "the 4th of july": (lambda y: date(y, 7, 3), 3),
    "memorial day weekend": (lambda y: nth_weekday(y, 5, MONDAY, -1) - timedelta(days=3), 3),
    "labor day weekend": (lambda y: nth_weekday(y, 9, MONDAY, 1) - timedelta(days=3), 3),
    "new years": (lambda y: date(y, 12, 30), 3),
    "spring break": (lambda y: nth_weekday(y, 3, SATURDAY, 2), 7),
}


@dataclass
class When:
    text: str
    start: str | None = None
    nights: int | None = None
    #: The start is a guess from a month or season (the app may move it a little)
    approx: bool = False


def when_options(today: date, rng: random.Random) -> When:
    kind = rng.choice(
        ["month", "month", "exact", "range", "weekend", "next_month", "in_weeks", "holiday",
         "season", "tomorrow", "numeric"]
    )  # fmt: skip
    if kind == "month":
        m = rng.randint(1, 12)
        word = rng.choice([MONTH_NAMES[m - 1], MONTH_NAMES[m - 1].title()])
        if m == 5:  # "may" needs a cue, which "in" gives
            return When(f"in {word}", month_start(today, m).isoformat(), approx=True)
        return When(
            rng.choice([f"in {word}", word, f"sometime in {word}"]),
            month_start(today, m).isoformat(),
            approx=True,
        )
    if kind in ("exact", "range"):
        start = today + timedelta(days=rng.randint(5, 300))
        mname = rng.choice([MONTH_NAMES[start.month - 1], MONTH_SHORT[start.month - 1]])
        suffix = rng.choice(["", "th"]) if start.day not in (1, 2, 3, 21, 22, 23, 31) else ""
        if kind == "exact":
            return When(f"on {mname} {start.day}{suffix}", start.isoformat())
        n = rng.randint(2, 12)
        end = start + timedelta(days=n)
        if end.month == start.month:
            text = rng.choice(
                [f"{mname} {start.day}-{end.day}", f"{mname} {start.day} to {end.day}"]
            )
        else:
            emname = MONTH_NAMES[end.month - 1]
            text = f"{mname} {start.day} to {emname} {end.day}"
        return When(text, start.isoformat(), n)
    if kind == "numeric":
        start = today + timedelta(days=rng.randint(5, 300))
        n = rng.randint(2, 9)
        end = start + timedelta(days=n)
        return When(f"{start.month}/{start.day} - {end.month}/{end.day}", start.isoformat(), n)
    if kind == "weekend":
        if rng.random() < 0.5:
            wd = today.weekday()
            start = today if wd in (SATURDAY, SUNDAY) else on_or_after(today, FRIDAY)
            return When(
                rng.choice(["this weekend", "this wknd", "this weekend"]),
                start.isoformat(),
                0 if wd == SUNDAY else 2,
            )
        start = on_or_after(today + timedelta(days=1), FRIDAY) + timedelta(days=7)
        return When(rng.choice(["next weekend", "next wknd"]), start.isoformat(), 2)
    if kind == "next_month":
        m = today.month % 12 + 1
        y = today.year + (today.month == 12)
        return When("next month", month_start(today, m, y).isoformat())
    if kind == "in_weeks":
        n = rng.randint(2, 8)
        return When(
            rng.choice([f"in {n} weeks", f"in {n} wks"]),
            (today + timedelta(days=7 * n)).isoformat(),
        )
    if kind == "holiday":
        name = rng.choice(sorted(HOLIDAYS))
        make, nights = HOLIDAYS[name]
        text = rng.choice([f"for {name}", f"over {name}", name])
        return When(text, upcoming(today, make).isoformat(), nights)
    if kind == "season":
        season, month = rng.choice([("this summer", 7), ("in the spring", 4), ("this fall", 10)])
        return When(season, month_start(today, month).isoformat(), approx=True)
    return When(
        rng.choice(["tomorrow", "tmrw", "tomorrow"]), (today + timedelta(days=1)).isoformat()
    )


def length_options(rng: random.Random) -> tuple[str, int]:
    kind = rng.choice(["nights", "days", "week", "weeks", "weekend", "long", "month"])
    if kind == "nights":
        n = rng.randint(1, 20)
        return rng.choice(
            [f"for {n} nights", f"{n} nights", f"{n} nites", f"{n}-night"]
        ) if n > 1 else "for 1 night", n
    if kind == "days":
        n = rng.randint(2, 21)
        return rng.choice([f"for {n} days", f"{n} days", f"{n}-day", f"a {n} day trip"]), n - 1
    if kind == "week":
        return rng.choice(["for a week", "a week", "for one week", "week long"]), 7
    if kind == "weeks":
        n = rng.randint(2, 6)
        word = {2: "two", 3: "three", 4: "four"}.get(n, str(n)) if rng.random() < 0.4 else str(n)
        return f"for {word} weeks", 7 * n
    if kind == "weekend":
        return rng.choice(["for the weekend", "a weekend"]), 2
    if kind == "long":
        return rng.choice(["a long weekend", "long weekend"]), 3
    return rng.choice(["for a month", "a month"]), 30


# --- Who ---


def who_options(rng: random.Random) -> tuple[str, int, bool]:
    """(text, travelers, has kids)"""
    kind = rng.randint(0, 13)
    if kind == 0:
        return rng.choice(["just me", "solo", "by myself", "alone", "only me"]), 1, False
    if kind == 1:
        return (
            rng.choice(
                [
                    "me and my wife",
                    "my husband and i",
                    "me and my girlfriend",
                    "me and my bf",
                    "with my partner",
                    "me and my wife",
                ]
            ),
            2,
            False,
        )
    if kind == 2:
        n = rng.randint(2, 12)
        return (
            rng.choice([f"{n} people", f"{n} ppl", f"for {n} people", f"{n} of us", f"we are {n}"]),
            n,
            False,
        )
    if kind == 3:
        n = rng.randint(3, 8)
        return rng.choice([f"family of {n}", f"a family of {n}"]), n, True
    if kind == 4:
        a, k = rng.randint(1, 2), rng.randint(1, 4)
        return (
            rng.choice(
                [f"{a} adults and {k} kids", f"{a} adults {k} kids", f"{a} adults, {k} children"]
            ),
            a + k,
            True,
        )
    if kind == 5:
        n = rng.randint(1, 6)
        return (
            rng.choice([f"me and {n} friends", f"me and {n} buddies", f"me + {n} friends"]),
            n + 1,
            False,
        )
    if kind == 6:
        k = rng.randint(1, 3)
        return f"me, my wife and our {k} kids", k + 2, True
    if kind == 7:
        return rng.choice(["honeymoon", "our anniversary", "a romantic getaway"]), 2, False
    if kind == 8:
        n = rng.randint(4, 12)
        return rng.choice([f"group of {n}", f"a group of {n}", f"party of {n}"]), n, False
    if kind == 9:
        return "my mom and i", 2, False
    if kind == 10:
        n = rng.randint(2, 4)
        return f"the {n} of us", n, False
    if kind == 11:
        n = rng.randint(2, 6)
        word = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six"}[n]
        return f"{word} people", n, False
    if kind == 12:
        return "me and my sister", 2, False
    n = rng.randint(2, 4)
    return f"{n} couples", 2 * n, False


# --- Money ---


def budget_options(rng: random.Random, travelers: int) -> tuple[str, int]:
    amount = rng.choice(
        [
            400,
            600,
            800,
            1000,
            1200,
            1500,
            1800,
            2000,
            2500,
            3000,
            3500,
            4000,
            5000,
            6000,
            7500,
            8000,
            10000,
            12000,
            15000,
        ]
    )
    kind = rng.randint(0, 8)
    if kind == 0:
        return f"${amount:,}", amount
    if kind == 1:
        return f"budget {amount}", amount
    if kind == 2 and amount % 1000 == 0:
        return rng.choice(
            [f"{amount // 1000}k", f"${amount // 1000}k", f"{amount // 1000} grand"]
        ), amount
    if kind == 3:
        return f"under ${amount}", amount
    if kind == 4:
        return f"around {amount} dollars", amount
    if kind == 5:
        return f"{amount} bucks", amount
    if kind == 6 and amount <= 5000:
        return f"${amount} per person", amount * travelers
    if kind == 7:
        return f"max {amount}", amount
    return f"about ${amount:,} total", amount


STYLES = [
    ("cheap", "budget"), ("on a budget", "budget"), ("as cheap as possible", "budget"),
    ("broke college student", "budget"), ("luxury", "luxury"), ("fancy", "luxury"),
    ("5 star", "luxury"), ("treat ourselves", "luxury"), ("comfortable", "comfort"),
    ("mid range", "comfort"), ("nice but not crazy", "comfort"),
]  # fmt: skip
STOPS = [
    ("nonstop only", "nonstop"), ("direct flights", "nonstop"), ("no layovers", "nonstop"),
    ("one stop max", "one"), ("1 layover is fine", "one"), ("max 1 stop", "one"),
    ("layovers are fine", "any"), ("dont mind stops", "any"),
]  # fmt: skip
CABINS = [
    ("business class", "business"),
    ("first class", "first"),
    ("premium economy", "premium"),
    ("economy", "economy"),
]
TRIP_TYPES = [
    ("road trip", "road-trip"), ("driving", "road-trip"), ("by car", "road-trip"),
    ("flying", "flight"), ("by plane", "flight"), ("train trip", "rail"), ("by train", "rail"),
    ("on amtrak", "rail"), ("by bus", "rail"),
]  # fmt: skip
INTERESTS = [
    ("hiking", "nature"), ("national parks", "nature"), ("good food", "food"),
    ("foodie stuff", "food"), ("wineries", "food"), ("museums", "history"), ("history", "history"),
    ("beaches", "beaches"), ("snorkeling", "beaches"), ("live music", "arts"),
    ("art galleries", "arts"), ("skiing", "adventure"), ("rafting", "adventure"),
    ("theme parks", "family"), ("nightlife", "nightlife"), ("bars", "nightlife"),
    ("shopping", "shopping"), ("markets", "shopping"),
]  # fmt: skip
VAGUE = [
    "idk", "help", "trip", "plan a trip", "i need a vacation", "vacation pls", "surprise me",
    "somewhere warm", "idk somewhere warm lol", "beach lol", "somewhere fun",
    "i wanna go somewhere", "where should i go", "any ideas", "help me plan", "need to get away",
    "i want to travel",
    "plan something", "anywhere cheap", "somewhere with mountains", "i dont know where to go",
    "hi", "hello", "yo", "can you help", "what do you suggest", "somewhere new", "a getaway",
    "something relaxing", "a trip with snow", "somewhere romantic", "somewhere abroad",
    "a city break", "a cheap getaway", "best place for a vacation", "ideas for a trip",
]  # fmt: skip
INTROS = [
    "", "", "", "i want to go to", "i wanna go to", "plan a trip to", "thinking about", "trip to",
    "we want to visit", "looking at", "can you plan", "how about", "planning a trip to", "visiting",
    "headed to", "going to", "lets do", "take me to", "dreaming of", "need a trip to",
]  # fmt: skip
TYPOS = {
    "weekend": "wekend", "tomorrow": "tommorow", "budget": "bugdet", "people": "ppl",
    "nights": "nites", "vacation": "vacay", "february": "febuary", "with": "w",
}  # fmt: skip


# --- Places ---


def plain(s: str) -> str:
    s = re.sub(r"[̀-ͯ]", "", __import__("unicodedata").normalize("NFD", s))
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("'", "")).strip()


@dataclass
class Place:
    #: How the case types it
    typed: str
    #: The town's name (the first part of what the app writes)
    town: str
    country: str


@dataclass
class Pools:
    domestic: list[Place] = field(default_factory=list)
    world: list[Place] = field(default_factory=list)
    nicknames: list[Place] = field(default_factory=list)
    multi: list[list[Place]] = field(default_factory=list)
    origins: list[Place] = field(default_factory=list)


def build_pools() -> Pools:
    rules = jsonfile.load(paths.RULES)
    everyday = set(rules["everydayPlaceWords"])
    aliases = jsonfile.load(paths.ALIASES)
    places = jsonfile.load(paths.PLACES)
    airports = jsonfile.load(paths.AIRPORTS)
    countries = jsonfile.load(paths.COUNTRIES)
    states = jsonfile.load(paths.STATES)
    # Names that mean something else to the app (a country, a state, a nickname, a
    # catalog place): not used as plain airport towns, so every label is certain.
    taken = {plain(a[0]) for a in aliases}
    taken |= {plain(c["name"]) for c in countries} | {
        plain(a) for c in countries for a in c["aliases"]
    }
    taken |= {plain(s[2]) for s in states}
    taken |= {plain(p["name"]) for p in places} | {plain(p["town"].split(",")[0]) for p in places}
    stop = set(MONTH_NAMES) | set(MONTH_SHORT) | everyday | {"home", "city", "beach", "summer"}
    pools = Pools()
    for p in places:
        town = p["town"].split(",")[0].strip()
        key = plain(town)
        if key in everyday or key in stop:
            continue
        place = Place(
            p["town"] if p["country"] == "US" and "," in p["town"] else town, town, p["country"]
        )
        (pools.domestic if p["country"] == "US" else pools.world).append(place)
    # Big airports' towns, typed plainly, when the name means only that town.
    by_key: dict[str, set[tuple[str, str]]] = {}
    for a in airports:
        if a[3] not in ("H", "L") or not a[4]:
            continue
        by_key.setdefault(plain(a[4]), set()).add((a[4], a[5]))
    for key, towns in sorted(by_key.items()):
        if len(towns) != 1 or key in taken or key in stop or len(key) < 4 or re.search(r"\d", key):
            continue
        town, country = next(iter(towns))
        if "-" in town or "'" in town or len(town.split()) > 3:
            continue
        place = Place(town, town, country)
        (pools.domestic if country == "US" else pools.world).append(place)
    # A nickname that's also a place Waypoint plans in detail means that place
    # ("the grand canyon" → its catalog town), as the app reads it.
    catalog = {}
    for p in places:
        for n in (p["name"], p["town"].split(",")[0]):
            catalog.setdefault(plain(n).removeprefix("the "), p["town"].split(",")[0].strip())
    for alias, name, kind in aliases:
        if kind == "city" and len(alias) > 3 and alias not in ("la", "dc", "sf", "atl"):
            town = catalog.get(plain(alias).removeprefix("the "), name.split(",")[0].strip())
            pools.nicknames.append(Place(alias, town, ""))
    pools.origins = [p for p in pools.domestic if " " not in p.typed or "," in p.typed][:200]
    # Multi-city routes people actually take, plus random ones from one country.
    pools.multi = [
        [Place(t, t, "IT") for t in ("Rome", "Florence", "Venice")],
        [Place(t, t, "JP") for t in ("Tokyo", "Kyoto", "Osaka")],
        [Place(t, t, "ES") for t in ("Madrid", "Barcelona", "Seville")],
        [Place(t, t, "FR") for t in ("Paris", "Lyon", "Nice")],
        [Place("London", "London", "GB"), Place("Edinburgh", "Edinburgh", "GB")],
        [Place("Lisbon", "Lisbon", "PT"), Place("Porto", "Porto", "PT")],
        [
            Place("Prague", "Prague", "CZ"),
            Place("Vienna", "Vienna", "AT"),
            Place("Budapest", "Budapest", "HU"),
        ],
        [
            Place("Bangkok", "Bangkok", "TH"),
            Place("Chiang Mai", "Chiang Mai", "TH"),
            Place("Phuket", "Phuket", "TH"),
        ],
        [Place("Seattle", "Seattle", "US"), Place("Portland, OR", "Portland", "US")],
        [
            Place("New York", "New York", "US"),
            Place("Boston", "Boston", "US"),
            Place("Washington DC", "Washington", "US"),
        ],
        [Place("Athens", "Athens", "GR"), Place("Santorini", "Santorini", "GR")],
        [
            Place("Amsterdam", "Amsterdam", "NL"),
            Place("Brussels", "Brussels", "BE"),
            Place("Paris", "Paris", "FR"),
        ],
    ]
    return pools


def typed(place: Place, rng: random.Random) -> str:
    """How a person types a place: often lowercase, sometimes Title Case."""
    t = place.typed
    r = rng.random()
    if r < 0.45:
        return t.lower()
    return t


# --- Cases ---


def case_single(rng: random.Random, pools: Pools, today: date) -> dict:
    pool = rng.choice([pools.domestic, pools.world, pools.world, pools.nicknames])
    place = rng.choice(pool)
    exp: dict = {"dest": plain(place.town)}
    parts: list[str] = []
    intro = rng.choice(INTROS)
    parts.append(f"{intro} {typed(place, rng)}".strip())
    if rng.random() < 0.75:
        w = when_options(today, rng)
        parts.append(w.text)
        exp["start"] = w.start
        if w.approx:
            exp["approx"] = True
        if w.nights is not None:
            exp["nights"] = w.nights
    if "nights" not in exp and rng.random() < 0.7:
        text, n = length_options(rng)
        parts.append(text)
        exp["nights"] = n
    travelers = None
    if rng.random() < 0.75:
        text, travelers, kids = who_options(rng)
        parts.append(text)
        exp["travelers"] = travelers
        if kids:
            exp["interests"] = ["family"]
    if rng.random() < 0.4:
        text, amount = budget_options(rng, travelers or 1)
        if "per person" in text and not travelers:
            text, amount = f"${amount}", amount
        parts.append(text)
        exp["budget"] = amount
    if rng.random() < 0.3:
        text, style = rng.choice(STYLES)
        parts.append(text)
        exp["style"] = style
    if rng.random() < 0.25:
        text, interest = rng.choice(INTERESTS)
        parts.append(rng.choice([f"into {text}", f"love {text}", f"want {text}", text]))
        exp.setdefault("interests", []).append(interest)
    if rng.random() < 0.15 and place.country not in ("", "US"):
        text, cabin = rng.choice(CABINS)
        parts.append(text)
        exp["cabin"] = cabin
    if rng.random() < 0.12 and place.country not in ("", "US"):
        text, stops = rng.choice(STOPS)
        parts.append(text)
        exp["stops"] = stops
    if rng.random() < 0.15 and place.country == "US":
        text, tt = rng.choice(TRIP_TYPES)
        parts.append(text)
        exp["tripType"] = tt
    head, rest = parts[0], parts[1:]
    rng.shuffle(rest)
    sep = rng.choice([" ", ", ", " ", " , "])
    return {
        "kind": "single",
        "today": today.isoformat(),
        "messages": [sep.join([head, *rest])],
        "expect": exp,
    }


def case_multi(rng: random.Random, pools: Pools, today: date) -> dict:
    route = rng.choice(pools.multi)
    nights = [rng.randint(1, 6) for _ in route]
    style = rng.randint(0, 3)
    names = [typed(p, rng) for p in route]
    if style == 0:
        text = ", ".join(f"{n} nights in {c}" for n, c in zip(nights, names, strict=True))
    elif style == 1:
        text = " then ".join(f"{c} ({n} nights)" for n, c in zip(nights, names, strict=True))
    elif style == 2:
        first = f"{nights[0]} nights in {names[0]}"
        text = first + "".join(f", {n} in {c}" for n, c in zip(nights[1:], names[1:], strict=True))
    else:
        text = ", ".join(names[:-1]) + f" and {names[-1]}"
        nights = []
    exp: dict = {"dest": plain(route[0].town), "cities": [plain(p.town) for p in route]}
    if nights:
        exp["cityNights"] = nights
        exp["nights"] = sum(nights)
    parts = [rng.choice(["", "trip:", "we want", "plan"]) + " " + text]
    if not nights and rng.random() < 0.8:
        t, n = length_options(rng)
        if t.startswith("for "):
            parts.append(t)
            exp["nights"] = n
    if rng.random() < 0.7:
        w = when_options(today, rng)
        # A holiday brings its own length; skip it when a length was already given.
        if w.nights is None or ("nights" not in exp):
            parts.append(w.text)
            exp["start"] = w.start
            if w.approx:
                exp["approx"] = True
            if w.nights is not None:
                exp["nights"] = w.nights
    if rng.random() < 0.7:
        t, n, _kids = who_options(rng)
        parts.append(t)
        exp["travelers"] = n
    return {
        "kind": "multi",
        "today": today.isoformat(),
        "messages": [" ".join(p.strip() for p in parts)],
        "expect": exp,
    }


def case_vague(rng: random.Random, pools: Pools, today: date) -> dict:
    text = rng.choice(VAGUE)
    exp: dict = {"dest": None, "ask": "destination"}
    if rng.random() < 0.4:
        t, n, _kids = who_options(rng)
        text = f"{text} {t}"
        exp["travelers"] = n
    if rng.random() < 0.3:
        w = when_options(today, rng)
        text = f"{text} {w.text}"
        exp["start"] = w.start
        if w.approx:
            exp["approx"] = True
    return {"kind": "vague", "today": today.isoformat(), "messages": [text], "expect": exp}


def case_origin(rng: random.Random, pools: Pools, today: date) -> dict:
    origin = rng.choice(pools.origins)
    dest = rng.choice([p for p in pools.domestic + pools.world if p.town != origin.town])
    o, t = typed(origin, rng), typed(dest, rng)
    form = rng.randint(0, 4)
    text = [
        f"from {o} to {t}", f"flying from {o} to {t}", f"{o} to {t}",
        f"leaving from {o}, want to go to {t}", f"i live in {o} and want to visit {t}",
    ][form]  # fmt: skip
    exp: dict = {"dest": plain(dest.town), "origin": plain(origin.town)}
    if rng.random() < 0.6:
        lt, n = length_options(rng)
        text += f" {lt}"
        exp["nights"] = n
    return {"kind": "origin", "today": today.isoformat(), "messages": [text], "expect": exp}


def case_covered(rng: random.Random, pools: Pools, today: date) -> dict:
    dest = rng.choice(pools.domestic)
    t = typed(dest, rng)
    forms = [
        (
            f"going home to {t} for christmas, staying with my parents",
            {"lodging": True, "meals": True},
        ),
        (f"visiting {t}, staying with friends", {"lodging": True}),
        (f"{t} for a week, just need the flight", {"activities": True}),
        (f"staying with my family in {t} for thanksgiving", {"lodging": True, "meals": True}),
        (f"{t} for a week, we don't need a hotel", {"lodging": True}),
        (f"{t} next month, no hotel needed", {"lodging": True}),
        (f"{t} for 3 nights, dont need accommodation", {"lodging": True}),
        (f"work trip to {t}, the hotel is paid by work", {"lodging": True}),
        (f"{t} for 5 nights, we already booked an airbnb", {"lodging": True}),
        (f"{t}, staying with a friend", {"lodging": True}),
    ]
    text, cov = forms[rng.randrange(len(forms))]
    exp: dict = {"dest": plain(dest.town), "covered": cov}
    if rng.random() < 0.5:
        text += ", just me"
        exp["travelers"] = 1
    return {"kind": "covered", "today": today.isoformat(), "messages": [text], "expect": exp}


def case_typos(rng: random.Random, pools: Pools, today: date) -> dict:
    case = case_single(rng, pools, today)
    msg = case["messages"][0]
    for right, wrong in TYPOS.items():
        if rng.random() < 0.6:
            msg = re.sub(rf"\b{right}\b", wrong, msg)
    msg = msg.replace(",", "") if rng.random() < 0.5 else msg
    case["messages"] = [msg]
    case["kind"] = "typos"
    return case


def case_conversation(rng: random.Random, pools: Pools, today: date) -> dict:
    """A vague start, then answers to the assistant's questions, one at a time."""
    place = rng.choice(pools.domestic + pools.world)
    w = when_options(today, rng)
    who_text, n, kids = who_options(rng)
    first = rng.choice(VAGUE)
    turns: list[dict] = [{"user": first}, {"asked": ["destination", "dates", "travelers"]}]
    turns.append({"user": typed(place, rng)})
    turns.append({"asked": ["dates", "travelers"]})
    turns.append({"user": w.text})
    exp: dict = {"dest": plain(place.town), "start": w.start, "travelers": n}
    if w.approx:
        exp["approx"] = True
    if w.nights is None:
        turns.append({"asked": ["length", "travelers"]})
        length_text, nights = length_options(rng)
        turns.append({"user": length_text})
        exp["nights"] = nights
    else:
        exp["nights"] = w.nights
    turns.append({"asked": ["travelers"]})
    spelled = rng.random() < 0.7
    turns.append({"user": who_text if spelled else str(n)})
    if kids and spelled:
        exp["interests"] = ["family"]
    return {"kind": "conversation", "today": today.isoformat(), "turns": turns, "expect": exp}


KINDS = [
    (case_single, 34), (case_multi, 12), (case_vague, 10), (case_origin, 10),
    (case_covered, 6), (case_typos, 14), (case_conversation, 14),
]  # fmt: skip


def generate(count: int = COUNT, seed: int = SEED) -> list[dict]:
    rng = random.Random(seed)
    pools = build_pools()
    makers = [m for m, w in KINDS for _ in range(w)]
    seen: set[str] = set()
    out: list[dict] = []
    while len(out) < count:
        today = d(rng.choice(TODAYS))
        case = rng.choice(makers)(rng, pools, today)
        key = json.dumps(case.get("messages") or case.get("turns"), sort_keys=True) + case["today"]
        if key in seen:
            continue
        seen.add(key)
        case["id"] = len(out) + 1
        out.append(case)
    return out


def dumps(cases: list[dict]) -> str:
    return "".join(json.dumps(c, ensure_ascii=False, separators=(",", ":")) + "\n" for c in cases)


def write(path: Path = CORPUS) -> int:
    cases = generate()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(cases), encoding="utf-8")
    return len(cases)


def is_current(path: Path = CORPUS) -> bool:
    return path.exists() and path.read_text(encoding="utf-8") == dumps(generate())

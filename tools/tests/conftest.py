import copy

import pytest

from waypoint_data import jsonfile, paths


@pytest.fixture(scope="session")
def repo_data():
    return {
        "airports": jsonfile.load(paths.AIRPORTS),
        "places": jsonfile.load(paths.PLACES),
        "cruises": jsonfile.load(paths.CRUISES),
        "rules": jsonfile.load(paths.RULES),
    }


@pytest.fixture
def rules(repo_data):
    return copy.deepcopy(repo_data["rules"])


AIRPORTS = [
    ["ATL", 33.637, -84.428, "L", "Atlanta", "US", "Hartsfield-Jackson Atlanta International"],
    ["AVL", 35.436, -82.542, "M", "Asheville", "US", "Asheville Regional Airport"],
    ["KEF", 63.985, -22.606, "L", "Reykjavik", "IS", "Keflavik International Airport"],
]


@pytest.fixture
def airports():
    return copy.deepcopy(AIRPORTS)


@pytest.fixture
def place():
    return {
        "id": "blue-ridge",
        "name": "Blue Ridge Mountains",
        "town": "Asheville, NC",
        "region": "North Carolina",
        "lat": 35.5951,
        "lon": -82.5515,
        "tagline": "Scenic drives & mountain towns",
        "tags": ["nature", "food"],
        "types": ["road-trip", "flight"],
        "tier": "mid",
        "country": "US",
    }


@pytest.fixture
def cruise():
    return {
        "id": "miami-bahamas",
        "name": "Bahamas",
        "tagline": "Beaches and a private island",
        "port": "Miami, FL",
        "portPoint": {"lat": 25.77, "lon": -80.17},
        "callTown": "Nassau, Bahamas",
        "callPoint": {"lat": 25.04, "lon": -77.35},
        "tier": "value",
        "tags": ["beaches"],
    }

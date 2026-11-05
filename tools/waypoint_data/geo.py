"""Distances, matching `milesBetween` in src/lib/catalog.ts."""

from math import asin, cos, radians, sin, sqrt

EARTH_MILES = 3958.8


def miles_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in miles."""
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    h = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * EARTH_MILES * asin(min(1.0, sqrt(h)))


def valid_point(lat: object, lon: object) -> bool:
    return (
        isinstance(lat, int | float)
        and isinstance(lon, int | float)
        and not isinstance(lat, bool)
        and not isinstance(lon, bool)
        and -90 <= lat <= 90
        and -180 <= lon <= 180
    )

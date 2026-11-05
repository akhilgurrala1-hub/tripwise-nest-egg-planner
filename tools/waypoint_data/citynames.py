"""The town an airport serves, in English, as travelers type it.

OurAirports gives the municipality in the local language or the suburb the
runway is in ("Firenze (FI)", "Venezia (VE)", "Spata-Artemida" for Athens). The
assistant needs "Florence", "Venice", "Athens", so each airport gets an English
display town plus the other names people use for it.
"""

import re

#: IATA metropolitan-area codes that appear in OurAirports' keywords.
METRO_CODES = {
    "LON": "London",
    "PAR": "Paris",
    "MIL": "Milan",
    "ROM": "Rome",
    "TYO": "Tokyo",
    "OSA": "Osaka",
    "SEL": "Seoul",
    "BJS": "Beijing",
    "SHA": "Shanghai",
    "MOW": "Moscow",
    "BUE": "Buenos Aires",
    "SAO": "Sao Paulo",
    "RIO": "Rio de Janeiro",
    "NYC": "New York",
    "WAS": "Washington",
    "CHI": "Chicago",
    "STO": "Stockholm",
    "REK": "Reykjavik",
    "YTO": "Toronto",
    "YMQ": "Montreal",
    "BER": "Berlin",
    "BUH": "Bucharest",
    "JKT": "Jakarta",
    "IST": "Istanbul",
    "DTT": "Detroit",
    "QDF": "Dallas",
    "QHO": "Houston",
    "QMI": "Miami",
    "OSL": "Oslo",
    "BKK": "Bangkok",
    "TCI": "Tenerife",
    "CAS": "Casablanca",
}

#: Local names → the English ones travelers type.
EXONYMS = {
    "Firenze": "Florence",
    "Venezia": "Venice",
    "Napoli": "Naples",
    "Milano": "Milan",
    "Roma": "Rome",
    "Torino": "Turin",
    "Genova": "Genoa",
    "Padova": "Padua",
    "Siracusa": "Syracuse",
    "München": "Munich",
    "Köln": "Cologne",
    "Nürnberg": "Nuremberg",
    "Wien": "Vienna",
    "Praha": "Prague",
    "Warszawa": "Warsaw",
    "Kraków": "Krakow",
    "Lisboa": "Lisbon",
    "Sevilla": "Seville",
    "Bruxelles": "Brussels",
    "Brussel": "Brussels",
    "Genève": "Geneva",
    "Zürich": "Zurich",
    "Athína": "Athens",
    "København": "Copenhagen",
    "Göteborg": "Gothenburg",
    "Reykjavík": "Reykjavik",
    "Moskva": "Moscow",
    "Sankt-Peterburg": "St Petersburg",
    "Saint Petersburg": "St Petersburg",
    "Bucuresti": "Bucharest",
    "Beograd": "Belgrade",
    "Den Haag": "The Hague",
    "Marrakech": "Marrakesh",
    "Al Qahirah": "Cairo",
    "Ciudad de México": "Mexico City",
    "Mexico City": "Mexico City",
    "Rio De Janeiro": "Rio de Janeiro",
    "São Paulo": "Sao Paulo",
    "Bogotá": "Bogota",
    "Montréal": "Montreal",
    "Québec": "Quebec City",
    "Kyiv": "Kyiv",
    "Hanoi (Soc Son)": "Hanoi",
}

#: Big airports whose listed town is a suburb or district.
AIRPORT_TOWNS = {
    "ATH": "Athens",
    "MXP": "Milan",
    "LIN": "Milan",
    "BGY": "Milan",
    "CIA": "Rome",
    "TPE": "Taipei",
    "DPS": "Bali",
    "EWR": "Newark",
    "LGW": "London",
    "STN": "London",
    "LTN": "London",
    "LCY": "London",
    "ORY": "Paris",
    "NRT": "Tokyo",
    "HND": "Tokyo",
    "KIX": "Osaka",
    "ITM": "Osaka",
    "ICN": "Seoul",
    "GMP": "Seoul",
    "PVG": "Shanghai",
    "PKX": "Beijing",
    "DME": "Moscow",
    "SVO": "Moscow",
    "VKO": "Moscow",
    "BRU": "Brussels",
    "EDI": "Edinburgh",
    "AMS": "Amsterdam",
    "DUS": "Dusseldorf",
    "SXF": "Berlin",
    "ARN": "Stockholm",
    "OSL": "Oslo",
    "HEL": "Helsinki",
    "SYD": "Sydney",
    "MEL": "Melbourne",
    "AKL": "Auckland",
    "IAD": "Washington",
    "DCA": "Washington",
    "BWI": "Baltimore",
    "MDW": "Chicago",
    "ORD": "Chicago",
    "JFK": "New York",
    "LGA": "New York",
    "DFW": "Dallas",
    "DAL": "Dallas",
    "IAH": "Houston",
    "HOU": "Houston",
    "SNA": "Santa Ana",
    "BUR": "Burbank",
    "LAX": "Los Angeles",
    "SFO": "San Francisco",
    "SEA": "Seattle",
    "MSP": "Minneapolis",
    "DTW": "Detroit",
    "CVG": "Cincinnati",
    "PHL": "Philadelphia",
    "BOS": "Boston",
    "MIA": "Miami",
    "FLL": "Fort Lauderdale",
    "MCO": "Orlando",
    "TPA": "Tampa",
    "LAS": "Las Vegas",
    "PHX": "Phoenix",
    "DEN": "Denver",
    "SLC": "Salt Lake City",
    "ATL": "Atlanta",
    "CLT": "Charlotte",
    "MSY": "New Orleans",
    "HNL": "Honolulu",
    "YUL": "Montreal",
    "YYZ": "Toronto",
    "YVR": "Vancouver",
    "GRU": "Sao Paulo",
    "GIG": "Rio de Janeiro",
    "EZE": "Buenos Aires",
    "AEP": "Buenos Aires",
    "MEX": "Mexico City",
    "CUN": "Cancun",
    "SJD": "Cabo San Lucas",
    "PVR": "Puerto Vallarta",
    "PUJ": "Punta Cana",
    "SJU": "San Juan",
    "NAS": "Nassau",
    "MBJ": "Montego Bay",
    "DXB": "Dubai",
    "DOH": "Doha",
    "AUH": "Abu Dhabi",
    "TLV": "Tel Aviv",
    "CAI": "Cairo",
    "JNB": "Johannesburg",
    "CPT": "Cape Town",
    "NBO": "Nairobi",
    "BKK": "Bangkok",
    "DMK": "Bangkok",
    "HKT": "Phuket",
    "SIN": "Singapore",
    "KUL": "Kuala Lumpur",
    "CGK": "Jakarta",
    "MNL": "Manila",
    "SGN": "Ho Chi Minh City",
    "HAN": "Hanoi",
    "DEL": "New Delhi",
    "BOM": "Mumbai",
    "HKG": "Hong Kong",
    "MFM": "Macau",
    "KEF": "Reykjavik",
    "DUB": "Dublin",
    "MAN": "Manchester",
    "LIS": "Lisbon",
    "OPO": "Porto",
    "MAD": "Madrid",
    "BCN": "Barcelona",
    "PMI": "Palma de Mallorca",
    "AGP": "Malaga",
    "FCO": "Rome",
    "VCE": "Venice",
    "FLR": "Florence",
    "NAP": "Naples",
    "PSA": "Pisa",
    "BLQ": "Bologna",
    "CTA": "Catania",
    "PMO": "Palermo",
    "NCE": "Nice",
    "MRS": "Marseille",
    "LYS": "Lyon",
    "GVA": "Geneva",
    "ZRH": "Zurich",
    "VIE": "Vienna",
    "PRG": "Prague",
    "BUD": "Budapest",
    "WAW": "Warsaw",
    "KRK": "Krakow",
    "CPH": "Copenhagen",
    "IST": "Istanbul",
    "SAW": "Istanbul",
    "AYT": "Antalya",
    "JTR": "Santorini",
    "JMK": "Mykonos",
    "HER": "Heraklion",
    "DBV": "Dubrovnik",
    "SPU": "Split",
    "RAK": "Marrakesh",
    "CMN": "Casablanca",
    "LIM": "Lima",
    "CUZ": "Cusco",
    "BOG": "Bogota",
    "CTG": "Cartagena",
    "SCL": "Santiago",
    "SJO": "San Jose",
    "LIR": "Liberia",
}

_PAREN = re.compile(r"\s*\(.*?\)\s*")


def clean_town(municipality: str) -> list[str]:
    """The names in a municipality field: "Ingliston, Edinburgh" → both, asides dropped."""
    text = _PAREN.sub(" ", municipality or "").strip()
    parts = [p.strip() for chunk in text.split(",") for p in chunk.split("/")]
    return [p for p in parts if p and len(p) <= 50]


def names_for(code: str, municipality: str, name: str, keywords: str) -> tuple[str, list[str]]:
    """(the English town, other names people use for it) for one airport."""
    towns = clean_town(municipality)
    town = AIRPORT_TOWNS.get(code) or (EXONYMS.get(municipality.strip()) if municipality else None)
    if not town and towns:
        town = EXONYMS.get(towns[0], towns[0])
    # "Florence Airport", "Naples International Airport": the town is the name.
    m = re.fullmatch(r"([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:International )?Airport", name.strip())
    if not town and m:
        town = m.group(1)
    extra: list[str] = []
    for t in towns:
        english = EXONYMS.get(t, t)
        for n in (t, english):
            if n and n != town and n not in extra:
                extra.append(n)
    for word in (k.strip() for k in (keywords or "").split(",")):
        metro = METRO_CODES.get(word)
        if metro and metro != town and metro not in extra:
            extra.append(metro)
    if m and " " not in m.group(1) and m.group(1) != town and m.group(1) not in extra:
        extra.append(m.group(1))
    return (town or "")[:50], extra[:4]


#: The main international airport where a city has more than one large one, so
#: searches use the airport most flights go through (Rome is FCO, not Ciampino).
PRIMARY_HUBS = frozenset(
    """FCO CDG LHR JFK ORD MXP HND ICN PVG PEK SVO EZE GRU GIG IST BKK TPE KIX IAH DFW IAD
    ARN OSL YUL YYZ YVR LAX SFO MIA ATL DEN SEA BOS MEX AMS FRA MUC MAD BCN LIS DUB ZRH VIE
    CPH HEL ATH DXB DOH SIN HKG SYD MEL AKL JNB CPT CAI DEL BOM MNL CGK KUL SGN HAN LIM BOG
    SCL PHL CLT MSP DTW PHX LAS MCO HNL SLC EDI MAN BRU WAW PRG BUD""".split()  # noqa: SIM905
)

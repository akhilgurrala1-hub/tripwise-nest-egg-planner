from waypoint_data import citynames


def test_local_names_become_english():
    assert citynames.names_for("FLR", "Firenze (FI)", "Florence Airport, Peretola", "Firenze") == (
        "Florence",
        ["Firenze"],
    )
    town, also = citynames.names_for("XXX", "Venezia (VE)", "Venice Marco Polo Airport", "")
    assert town == "Venice"
    assert "Venezia" in also


def test_suburbs_and_metro_codes():
    town, also = citynames.names_for("ZZZ", "Segrate (MI)", "Somewhere Airport", "MIL, X")
    assert town == "Segrate"
    assert "Milan" in also
    assert (
        citynames.names_for("EDI", "Ingliston, Edinburgh", "Edinburgh Airport", "")[0]
        == "Edinburgh"
    )


def test_town_from_a_plain_airport_name():
    assert citynames.names_for("QQQ", "", "Seville Airport", "")[0] == "Seville"
    assert citynames.clean_town("Paris (Roissy-en-France, Val-d'Oise)") == ["Paris"]


def test_main_hubs_are_marked():
    from waypoint_data import airports

    rec = {
        "type": "large_airport",
        "scheduled_service": "yes",
        "latitude_deg": "41.8",
        "longitude_deg": "12.25",
        "municipality": "Rome",
        "iso_country": "IT",
        "name": "Rome Fiumicino",
        "iso_region": "IT-62",
        "keywords": "",
    }
    assert airports.row_for({**rec, "iata_code": "FCO"})[3] == "H"
    assert airports.row_for({**rec, "iata_code": "CIA"})[3] == "L"

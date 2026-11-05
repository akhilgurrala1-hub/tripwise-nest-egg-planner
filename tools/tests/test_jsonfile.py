from waypoint_data import jsonfile


def test_one_record_per_line(tmp_path):
    path = tmp_path / "x.json"
    assert jsonfile.write_records(path, [{"a": 1, "b": "é"}, [1, 2.5]])
    assert path.read_text(encoding="utf-8") == '[\n  {"a": 1, "b": "é"},\n  [1, 2.5]\n]\n'
    assert jsonfile.is_canonical(path)
    # Writing the same records again changes nothing.
    assert not jsonfile.write_records(path, jsonfile.load(path))


def test_empty_and_messy_files(tmp_path):
    assert jsonfile.dumps_records([]) == "[]\n"
    path = tmp_path / "y.json"
    path.write_text('[{"a":1}]', encoding="utf-8")
    assert not jsonfile.is_canonical(path)

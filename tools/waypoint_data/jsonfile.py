"""Reading and writing the data files in their canonical layout.

A data file is a JSON array with one record per line: easy to read, and a change
to one airport or place is a one-line diff.
"""

import json
from pathlib import Path
from typing import Any


def dumps_records(records: list[Any]) -> str:
    """The canonical text of a list of records."""
    if not records:
        return "[]\n"
    lines = (json.dumps(r, ensure_ascii=False, separators=(", ", ": ")) for r in records)
    return "[\n  " + ",\n  ".join(lines) + "\n]\n"


def load(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_records(path: Path, records: list[Any]) -> bool:
    """Write records canonically. Returns True when the file changed."""
    text = dumps_records(records)
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def is_canonical(path: Path) -> bool:
    return path.read_text(encoding="utf-8") == dumps_records(load(path))

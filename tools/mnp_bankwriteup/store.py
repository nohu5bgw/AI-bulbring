"""
Local record store — saves metadata for every generated writeup to
~/.mnp_bankwriteup/records.json so the Search tab can find them later.
"""

import json
import os
from datetime import datetime
from pathlib import Path

STORE_DIR  = Path.home() / ".mnp_bankwriteup"
STORE_FILE = STORE_DIR / "records.json"


def _load() -> list:
    if not STORE_FILE.exists():
        return []
    try:
        return json.loads(STORE_FILE.read_text())
    except Exception:
        return []


def _save(records: list):
    STORE_DIR.mkdir(exist_ok=True)
    STORE_FILE.write_text(json.dumps(records, indent=2))


def add_record(client_name: str, client_number: str,
               file_path: str, statement_count: int, transaction_count: int):
    records = _load()
    records.insert(0, {
        "client_name":       client_name,
        "client_number":     client_number,
        "file_path":         str(file_path),
        "generated_at":      datetime.now().strftime("%Y-%m-%d %H:%M"),
        "statement_count":   statement_count,
        "transaction_count": transaction_count,
    })
    _save(records)


def search(query: str) -> list:
    """Return records where client_name or client_number contains query (case-insensitive)."""
    q = query.strip().lower()
    if not q:
        return _load()
    return [
        r for r in _load()
        if q in r.get("client_name", "").lower()
        or q in r.get("client_number", "").lower()
    ]


def all_records() -> list:
    return _load()


def remove_record(file_path: str):
    records = [r for r in _load() if r.get("file_path") != str(file_path)]
    _save(records)

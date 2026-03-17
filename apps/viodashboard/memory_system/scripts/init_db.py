#!/usr/bin/env python3
from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / 'db' / 'memory.db'
SCHEMA_PATH = BASE_DIR / 'schema.sql'


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    schema = SCHEMA_PATH.read_text(encoding='utf-8')
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(schema)
        conn.commit()
    finally:
        conn.close()
    print(f'Initialized SQLite memory DB at: {DB_PATH}')


if __name__ == '__main__':
    main()

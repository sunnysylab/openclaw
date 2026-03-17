#!/usr/bin/env python3
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / 'db' / 'memory.db'
LEGACY_LOG = BASE_DIR / 'legacy' / 'data' / 'memory-log.jsonl'
LEGACY_FACTS = BASE_DIR / 'legacy' / 'data' / 'facts.jsonl'


def read_jsonl(path: Path) -> Iterable[Dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    with path.open('r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict):
                rows.append(data)
    return rows


def make_id(prefix: str, *parts: str) -> str:
    raw = '|'.join([prefix, *[str(p or '') for p in parts]])
    return hashlib.sha1(raw.encode('utf-8')).hexdigest()[:16]


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def event_exists(conn: sqlite3.Connection, event_id: str) -> bool:
    row = conn.execute('SELECT 1 FROM events WHERE id = ? LIMIT 1', (event_id,)).fetchone()
    return row is not None


def fact_exists(conn: sqlite3.Connection, fact_id: str) -> bool:
    row = conn.execute('SELECT 1 FROM facts WHERE id = ? LIMIT 1', (fact_id,)).fetchone()
    return row is not None


def map_legacy_event_id(row: Dict[str, Any]) -> str:
    return make_id('legacy-event', str(row.get('id') or ''), str(row.get('timestamp') or ''), str(row.get('text') or ''))


def import_legacy_log(conn: sqlite3.Connection, dry_run: bool = False) -> Dict[str, int]:
    rows = list(read_jsonl(LEGACY_LOG))
    inserted = 0
    skipped = 0
    for row in rows:
        text = str(row.get('text') or '').strip()
        if not text:
            skipped += 1
            continue
        event_id = map_legacy_event_id(row)
        if event_exists(conn, event_id):
            skipped += 1
            continue

        tags = row.get('tags') if isinstance(row.get('tags'), list) else []
        source_name = str(row.get('source') or 'legacy')
        speaker = str(row.get('speaker') or 'unknown')
        conversation_title = str(row.get('conversation_title') or '').strip()
        title = f"Legacy {speaker} message"
        if conversation_title:
            title += f" · {conversation_title}"
        ts = str(row.get('timestamp') or '').strip()
        if not ts:
            ts = '1970-01-01T00:00:00+00:00'

        if not dry_run:
            conn.execute(
                '''
                INSERT INTO events (
                  id, ts, kind, source, title, content, tags_json, project_area, status, confidence, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    event_id,
                    ts,
                    'conversation',
                    f'import_legacy:{source_name}',
                    title,
                    text,
                    json.dumps(tags, ensure_ascii=False),
                    'legacy_import',
                    'imported',
                    0.9,
                    'migrate_legacy.py',
                ),
            )
            conn.execute(
                'INSERT INTO events_fts (id, title, content, tags, project_area) VALUES (?, ?, ?, ?, ?)',
                (event_id, title, text, ' '.join(tags), 'legacy_import'),
            )
        inserted += 1
    return {'seen': len(rows), 'inserted': inserted, 'skipped': skipped}


def resolve_source_event_id(conn: sqlite3.Connection, source_record_id: Optional[str]) -> Optional[str]:
    if not source_record_id:
        return None
    for legacy in read_jsonl(LEGACY_LOG):
        if str(legacy.get('id') or '') == str(source_record_id):
            mapped = map_legacy_event_id(legacy)
            row = conn.execute('SELECT id FROM events WHERE id = ? LIMIT 1', (mapped,)).fetchone()
            return str(row['id']) if row else mapped
    return None


def import_legacy_facts(conn: sqlite3.Connection, dry_run: bool = False) -> Dict[str, int]:
    rows = list(read_jsonl(LEGACY_FACTS))
    inserted = 0
    skipped = 0
    for row in rows:
        content = str(row.get('text') or '').strip()
        fact_type = str(row.get('type') or '').strip() or 'status'
        if not content:
            skipped += 1
            continue
        fact_id = make_id('legacy-fact', str(row.get('id') or ''), fact_type, content)
        if fact_exists(conn, fact_id):
            skipped += 1
            continue
        source_event_id = resolve_source_event_id(conn, row.get('source_record_id'))
        scope = 'long_term' if fact_type in {'preference', 'decision', 'rule'} else 'short_term'
        valid_from = str(row.get('timestamp') or '').strip() or None
        if not dry_run:
            conn.execute(
                '''
                INSERT INTO facts (id, fact_type, content, scope, source_event_id, valid_from, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
                ''',
                (fact_id, fact_type, content, scope, source_event_id, valid_from),
            )
        inserted += 1
    return {'seen': len(rows), 'inserted': inserted, 'skipped': skipped}


def main() -> None:
    parser = argparse.ArgumentParser(description='Migrate legacy JSONL memory data into SQLite memory.db')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    if not DB_PATH.exists():
        raise SystemExit(f'Database not found: {DB_PATH}. Run init_db.py first.')

    conn = connect()
    try:
        log_stats = import_legacy_log(conn, dry_run=args.dry_run)
        fact_stats = import_legacy_facts(conn, dry_run=args.dry_run)
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
    finally:
        conn.close()

    print(json.dumps({
        'dry_run': args.dry_run,
        'legacy_log': log_stats,
        'legacy_facts': fact_stats,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

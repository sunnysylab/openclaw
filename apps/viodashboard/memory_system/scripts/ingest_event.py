#!/usr/bin/env python3
import argparse
import datetime as dt
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / 'db' / 'memory.db'


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def make_id(prefix: str, *parts: str) -> str:
    raw = '|'.join([prefix, *[p or '' for p in parts], utc_now_iso()])
    return hashlib.sha1(raw.encode('utf-8')).hexdigest()[:16]


def parse_tags(raw: Optional[str]) -> str:
    if not raw:
        return '[]'
    tags = [t.strip() for t in raw.split(',') if t.strip()]
    return json.dumps(tags, ensure_ascii=False)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def insert_event(conn: sqlite3.Connection, args: argparse.Namespace) -> str:
    event_id = make_id('event', args.kind, args.source, args.title or '', args.content)
    tags_json = parse_tags(args.tags)

    conn.execute(
        '''
        INSERT INTO events (
          id, ts, kind, source, title, content, tags_json, project_area, status, confidence, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        (
            event_id,
            args.ts or utc_now_iso(),
            args.kind,
            args.source,
            args.title,
            args.content,
            tags_json,
            args.project_area,
            args.status,
            args.confidence,
            args.created_by,
        ),
    )

    tags_text = ' '.join(json.loads(tags_json)) if tags_json else ''
    conn.execute(
        'INSERT INTO events_fts (id, title, content, tags, project_area) VALUES (?, ?, ?, ?, ?)',
        (event_id, args.title or '', args.content, tags_text, args.project_area or ''),
    )
    return event_id


def insert_artifact(conn: sqlite3.Connection, event_id: str, spec: str) -> str:
    # format: path|artifact_type|note
    parts = spec.split('|', 2)
    path = parts[0].strip()
    artifact_type = parts[1].strip() if len(parts) > 1 and parts[1].strip() else 'file'
    note = parts[2].strip() if len(parts) > 2 and parts[2].strip() else None
    artifact_id = make_id('artifact', event_id, path, artifact_type)
    conn.execute(
        '''
        INSERT INTO artifacts (id, event_id, path, artifact_type, note)
        VALUES (?, ?, ?, ?, ?)
        ''',
        (artifact_id, event_id, path, artifact_type, note),
    )
    return artifact_id


def insert_fact(conn: sqlite3.Connection, event_id: str, spec: str) -> str:
    # format: fact_type|scope|content
    parts = spec.split('|', 2)
    if len(parts) < 3:
        raise SystemExit('--fact must be: fact_type|scope|content')
    fact_type = parts[0].strip()
    scope = parts[1].strip()
    content = parts[2].strip()
    fact_id = make_id('fact', fact_type, scope, content)
    conn.execute(
        '''
        INSERT INTO facts (id, fact_type, content, scope, source_event_id, valid_from)
        VALUES (?, ?, ?, ?, ?, ?)
        ''',
        (fact_id, fact_type, content, scope, event_id, utc_now_iso()),
    )
    return fact_id


def insert_risk(conn: sqlite3.Connection, event_id: str, spec: str) -> str:
    # format: severity|category|description|mitigation|status
    parts = spec.split('|', 4)
    if len(parts) < 3:
        raise SystemExit('--risk must be at least: severity|category|description')
    severity = parts[0].strip()
    category = parts[1].strip()
    description = parts[2].strip()
    mitigation = parts[3].strip() if len(parts) > 3 and parts[3].strip() else None
    status = parts[4].strip() if len(parts) > 4 and parts[4].strip() else 'open'
    risk_id = make_id('risk', severity, category, description)
    conn.execute(
        '''
        INSERT INTO risks (id, event_id, severity, category, description, mitigation, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''',
        (risk_id, event_id, severity, category, description, mitigation, status),
    )
    return risk_id


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description='Ingest one event into memory_system SQLite DB')
    p.add_argument('--kind', required=True)
    p.add_argument('--source', required=True)
    p.add_argument('--content', required=True)
    p.add_argument('--title')
    p.add_argument('--project-area')
    p.add_argument('--tags', help='Comma-separated tags')
    p.add_argument('--status')
    p.add_argument('--confidence', type=float)
    p.add_argument('--created-by')
    p.add_argument('--ts', help='ISO timestamp; defaults to now')
    p.add_argument('--artifact', action='append', default=[], help='path|artifact_type|note')
    p.add_argument('--fact', action='append', default=[], help='fact_type|scope|content')
    p.add_argument('--risk', action='append', default=[], help='severity|category|description|mitigation|status')
    return p


def main() -> None:
    args = build_parser().parse_args()
    if not DB_PATH.exists():
        raise SystemExit(f'Database not found: {DB_PATH}. Run init_db.py first.')

    conn = connect()
    try:
        event_id = insert_event(conn, args)
        artifact_ids = [insert_artifact(conn, event_id, spec) for spec in args.artifact]
        fact_ids = [insert_fact(conn, event_id, spec) for spec in args.fact]
        risk_ids = [insert_risk(conn, event_id, spec) for spec in args.risk]
        conn.commit()
    finally:
        conn.close()

    print(json.dumps({
        'event_id': event_id,
        'artifacts_added': len(artifact_ids),
        'facts_added': len(fact_ids),
        'risks_added': len(risk_ids),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()

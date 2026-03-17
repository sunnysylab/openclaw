#!/usr/bin/env python3
import argparse
import json
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / 'db' / 'memory.db'


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def add_date_filter(sql: str, params: list, column: str, args):
    if args.date_from:
        sql += f' AND substr({column}, 1, 10) >= ?'
        params.append(args.date_from)
    if args.date_to:
        sql += f' AND substr({column}, 1, 10) <= ?'
        params.append(args.date_to)
    return sql, params


def query_events(conn, args):
    sql = 'SELECT id, ts, kind, source, title, project_area, content FROM events WHERE 1=1'
    params = []
    if args.query:
        sql += ' AND (content LIKE ? OR title LIKE ?)'
        like = f'%{args.query}%'
        params.extend([like, like])
    if args.kind:
        sql += ' AND kind = ?'
        params.append(args.kind)
    if args.source:
        sql += ' AND source = ?'
        params.append(args.source)
    if args.project_area:
        sql += ' AND project_area = ?'
        params.append(args.project_area)
    sql, params = add_date_filter(sql, params, 'ts', args)
    sql += ' ORDER BY ts DESC LIMIT ?'
    params.append(args.limit)
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def query_facts(conn, args):
    sql = 'SELECT id, fact_type, scope, content, source_event_id, valid_from, created_at FROM facts WHERE 1=1'
    params = []
    if args.query:
        sql += ' AND content LIKE ?'
        params.append(f'%{args.query}%')
    if args.fact_type:
        sql += ' AND fact_type = ?'
        params.append(args.fact_type)
    if args.scope:
        sql += ' AND scope = ?'
        params.append(args.scope)
    sql, params = add_date_filter(sql, params, 'coalesce(valid_from, created_at)', args)
    sql += ' ORDER BY coalesce(valid_from, created_at) DESC LIMIT ?'
    params.append(args.limit)
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def query_risks(conn, args):
    sql = 'SELECT id, severity, category, status, description, mitigation, created_at FROM risks WHERE 1=1'
    params = []
    if args.query:
        sql += ' AND (description LIKE ? OR mitigation LIKE ?)'
        like = f'%{args.query}%'
        params.extend([like, like])
    if args.risk_severity:
        sql += ' AND severity = ?'
        params.append(args.risk_severity)
    if args.risk_status:
        sql += ' AND status = ?'
        params.append(args.risk_status)
    sql, params = add_date_filter(sql, params, 'created_at', args)
    sql += ' ORDER BY created_at DESC LIMIT ?'
    params.append(args.limit)
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def print_rows(label, rows):
    print(f'## {label} ({len(rows)})')
    for row in rows:
        print('-' * 80)
        for key, value in row.items():
            print(f'{key}: {value}')


def main():
    parser = argparse.ArgumentParser(description='Query memory_system SQLite data')
    parser.add_argument('--table', choices=['events', 'facts', 'risks', 'all'], default='all')
    parser.add_argument('--query')
    parser.add_argument('--kind')
    parser.add_argument('--source')
    parser.add_argument('--project-area')
    parser.add_argument('--fact-type')
    parser.add_argument('--scope')
    parser.add_argument('--risk-severity')
    parser.add_argument('--risk-status')
    parser.add_argument('--date-from')
    parser.add_argument('--date-to')
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--limit', type=int, default=10)
    args = parser.parse_args()

    conn = connect()
    try:
        result = {}
        if args.table in {'events', 'all'}:
            result['events'] = query_events(conn, args)
        if args.table in {'facts', 'all'}:
            result['facts'] = query_facts(conn, args)
        if args.table in {'risks', 'all'}:
            result['risks'] = query_risks(conn, args)
    finally:
        conn.close()

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    for label, rows in result.items():
        print_rows(label, rows)


if __name__ == '__main__':
    main()

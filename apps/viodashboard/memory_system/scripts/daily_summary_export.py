#!/usr/bin/env python3
import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / 'db' / 'memory.db'
EXPORT_DIR = BASE_DIR / 'exports' / 'daily'


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def bullet_list(items):
    return '\n'.join(f'- {item}' for item in items) if items else '- None'


def section(title, body):
    return f'## {title}\n{body}\n'


def summarize_events(events):
    if not events:
        return ['No events recorded for this date.']
    lines = []
    for row in events:
        label = row['title'] or (row['content'][:100] + ('…' if len(row['content']) > 100 else ''))
        lines.append(f"[{row['kind']}] {label} (source={row['source']}, area={row['project_area'] or 'n/a'})")
    return lines


def summarize_decisions(facts):
    decisions = [r['content'] for r in facts if r['fact_type'] == 'decision']
    return decisions or ['No explicit decisions captured.']


def summarize_facts(facts):
    return [f"[{r['fact_type']}/{r['scope']}] {r['content']}" for r in facts] or ['No facts captured.']


def group_risks(risks):
    grouped = defaultdict(list)
    for row in risks:
        grouped[f"{row['severity']}/{row['category']}"] .append(row)
    return grouped


def summarize_risks(risks):
    if not risks:
        return '### Risk overview\n- No open risks.\n'
    chunks = ['### Risk overview']
    grouped = group_risks(risks)
    for key in sorted(grouped.keys()):
        chunks.append(f'- {key}: {len(grouped[key])} open')
    chunks.append('')
    chunks.append('### Open risk details')
    for key in sorted(grouped.keys()):
        chunks.append(f'- {key}')
        for row in grouped[key]:
            detail = f"{row['description']} (status={row['status']})"
            if row['mitigation']:
                detail += f" | mitigation: {row['mitigation']}"
            chunks.append(f"  - {detail}")
    return '\n'.join(chunks) + '\n'


def summarize_artifacts(artifacts):
    if not artifacts:
        return ['No related artifacts linked yet.']
    lines = []
    for row in artifacts:
        lines.append(f"[{row['artifact_type']}] {row['path']}" + (f" | {row['note']}" if row['note'] else ''))
    return lines


def derive_next_actions(events, risks, artifacts):
    actions = []
    if risks:
        actions.append('Review open risks and either mitigate them or explicitly accept them with rationale.')
    if artifacts:
        actions.append('Inspect linked artifacts/files to verify that the recorded memory aligns with the actual implementation state.')
    if any((row['kind'] == 'decision' for row in events)):
        actions.append('Promote durable decisions from today into longer-term memory or stable project rules where appropriate.')
    if not actions and events:
        actions.append('Continue recording meaningful project events so future daily reviews have stronger input data.')
    if not actions:
        actions.append('No concrete next actions inferred yet.')
    return actions


def main() -> None:
    parser = argparse.ArgumentParser(description='Export a review-grade daily Markdown summary from memory_system SQLite data')
    parser.add_argument('--date', required=True, help='UTC date prefix, e.g. 2026-03-12')
    parser.add_argument('--write-db', action='store_true', help='Also upsert into daily_summaries table')
    args = parser.parse_args()

    conn = connect()
    try:
        events = conn.execute(
            '''
            SELECT id, ts, kind, source, title, content, project_area
            FROM events
            WHERE substr(ts, 1, 10) = ?
            ORDER BY ts ASC
            ''',
            (args.date,),
        ).fetchall()
        facts = conn.execute(
            '''
            SELECT id, fact_type, scope, content, source_event_id, created_at, valid_from
            FROM facts
            WHERE substr(coalesce(valid_from, created_at), 1, 10) = ?
            ORDER BY coalesce(valid_from, created_at) ASC
            ''',
            (args.date,),
        ).fetchall()
        risks = conn.execute(
            '''
            SELECT id, severity, category, status, description, mitigation, created_at
            FROM risks
            WHERE status != 'closed'
            ORDER BY created_at DESC
            ''',
        ).fetchall()
        artifacts = conn.execute(
            '''
            SELECT a.id, a.path, a.artifact_type, a.note, a.event_id, e.ts
            FROM artifacts a
            JOIN events e ON e.id = a.event_id
            WHERE substr(e.ts, 1, 10) = ?
            ORDER BY e.ts ASC, a.path ASC
            ''',
            (args.date,),
        ).fetchall()
    finally:
        conn.close()

    summary_text = (
        f"{len(events)} events, {len(facts)} facts, {len(risks)} open risks, and {len(artifacts)} linked artifacts "
        f"captured in memory_system for {args.date}."
    )
    next_actions = derive_next_actions(events, risks, artifacts)

    content = (
        f"# Daily Review - {args.date}\n\n"
        + section('Executive summary', summary_text)
        + section('Key changes', bullet_list(summarize_events(events)))
        + section('Decisions', bullet_list(summarize_decisions(facts)))
        + section('Captured facts', bullet_list(summarize_facts(facts)))
        + section('Related artifacts', bullet_list(summarize_artifacts(artifacts)))
        + summarize_risks(risks)
        + section('Review notes', bullet_list([
            'This report is generated from the structured memory_system SQLite store.',
            'Use it as a project-level review surface, not only as a raw event dump.',
            'Open risks are intentionally included even if they originated before the target date, because unresolved risk remains operationally relevant.',
        ]))
        + section('Next actions', bullet_list(next_actions))
    )

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = EXPORT_DIR / f'{args.date}.md'
    out_path.write_text(content, encoding='utf-8')

    if args.write_db:
        conn = connect()
        try:
            conn.execute(
                '''
                INSERT INTO daily_summaries (summary_date, summary, key_changes, open_risks, next_actions)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(summary_date) DO UPDATE SET
                  summary=excluded.summary,
                  key_changes=excluded.key_changes,
                  open_risks=excluded.open_risks,
                  next_actions=excluded.next_actions
                ''',
                (
                    args.date,
                    summary_text,
                    json.dumps([dict(r) for r in events], ensure_ascii=False),
                    json.dumps([dict(r) for r in risks], ensure_ascii=False),
                    json.dumps(next_actions, ensure_ascii=False),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    print(json.dumps({
        'date': args.date,
        'output': str(out_path),
        'events': len(events),
        'facts': len(facts),
        'open_risks': len(risks),
        'artifacts': len(artifacts),
        'wrote_db': args.write_db,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

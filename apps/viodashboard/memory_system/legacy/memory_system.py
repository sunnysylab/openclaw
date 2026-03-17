#!/usr/bin/env python3
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
LOG_FILE = DATA_DIR / "memory-log.jsonl"
FACTS_FILE = DATA_DIR / "facts.jsonl"


# -----------------------------
# Core helpers
# -----------------------------
def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def parse_iso(ts: Optional[str]) -> dt.datetime:
    if not ts:
        return dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
    try:
        return dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def append_jsonl(path: Path, record: Dict[str, Any]) -> None:
    ensure_data_dir()
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> Iterable[Dict[str, Any]]:
    if not path.exists():
        return []
    out: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def normalize_tags(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def text_hash_12(s: str) -> str:
    return hashlib.sha1(normalize_text(s).encode("utf-8")).hexdigest()[:12]


def make_record(
    source: str,
    conversation_id: Optional[str],
    conversation_title: Optional[str],
    speaker: str,
    text: str,
    tags: Optional[List[str]] = None,
    meta: Optional[Dict[str, Any]] = None,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}

    ts = timestamp or utc_now_iso()
    raw_id = f"{source}|{conversation_id}|{speaker}|{ts}|{text_hash_12(text)}"
    rid = hashlib.sha1(raw_id.encode("utf-8")).hexdigest()[:16]

    return {
        "id": rid,
        "timestamp": ts,
        "source": source,
        "conversation_id": conversation_id,
        "conversation_title": conversation_title,
        "speaker": speaker,
        "text": text,
        "text_hash": text_hash_12(text),
        "tags": tags or [],
        "meta": meta or {},
    }


# -----------------------------
# Phase 2: memory extraction
# -----------------------------
PREFERENCE_PATTERNS = [
    re.compile(r"\b(i prefer|i like|i love|my preference is)\b", re.I),
]
TODO_PATTERNS = [
    re.compile(r"\b(remind me to|i need to|todo|to-do|i should)\b", re.I),
]
DECISION_PATTERNS = [
    re.compile(r"\b(let'?s|we should|we decided|decision:)\b", re.I),
]


def classify_fact(text: str, speaker: str) -> Optional[str]:
    if speaker.lower() not in {"user", "human"}:
        return None
    for p in PREFERENCE_PATTERNS:
        if p.search(text):
            return "preference"
    for p in TODO_PATTERNS:
        if p.search(text):
            return "todo"
    for p in DECISION_PATTERNS:
        if p.search(text):
            return "decision"
    return None


def fact_key(fact_type: str, text: str) -> str:
    return hashlib.sha1(f"{fact_type}|{normalize_text(text)}".encode("utf-8")).hexdigest()[:16]


def extract_fact_from_record(rec: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    text = rec.get("text", "")
    speaker = rec.get("speaker", "")
    fact_type = classify_fact(text, speaker)
    if not fact_type:
        return None

    return {
        "id": fact_key(fact_type, text),
        "type": fact_type,
        "text": text,
        "source_record_id": rec.get("id"),
        "timestamp": rec.get("timestamp"),
        "conversation_id": rec.get("conversation_id"),
        "conversation_title": rec.get("conversation_title"),
    }


def append_fact_if_new(fact: Dict[str, Any]) -> bool:
    existing = read_jsonl(FACTS_FILE)
    seen = {f.get("id") for f in existing}
    if fact.get("id") in seen:
        return False
    append_jsonl(FACTS_FILE, fact)
    return True


# -----------------------------
# Commands
# -----------------------------
def cmd_init(_: argparse.Namespace) -> None:
    ensure_data_dir()
    if not LOG_FILE.exists():
        LOG_FILE.write_text("", encoding="utf-8")
    if not FACTS_FILE.exists():
        FACTS_FILE.write_text("", encoding="utf-8")
    print(f"Initialized memory system at: {DATA_DIR}")


def _log_record_and_maybe_fact(rec: Dict[str, Any], extract: bool) -> Tuple[bool, bool]:
    if not rec:
        return (False, False)

    append_jsonl(LOG_FILE, rec)
    fact_added = False
    if extract:
        fact = extract_fact_from_record(rec)
        if fact:
            fact_added = append_fact_if_new(fact)
    return (True, fact_added)


def cmd_log_openclaw(args: argparse.Namespace) -> None:
    text = args.text or ""
    if args.stdin:
        text = sys.stdin.read().strip()

    rec = make_record(
        source="openclaw",
        conversation_id=args.conversation_id,
        conversation_title=args.conversation_title,
        speaker=args.speaker,
        text=text,
        tags=normalize_tags(args.tags),
        meta={"channel": args.channel} if args.channel else {},
    )

    if not rec:
        raise SystemExit("No text provided.")

    ok, fact_added = _log_record_and_maybe_fact(rec, args.extract)
    if ok:
        print(f"Logged OpenClaw message: {rec['id']}")
        if fact_added:
            print("Extracted 1 fact.")


def _flatten_chatgpt_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                txt = item.get("text")
                if txt:
                    parts.append(str(txt))
        return "\n".join([p for p in parts if p]).strip()
    if isinstance(content, dict):
        parts = content.get("parts")
        if isinstance(parts, list):
            return "\n".join([str(p) for p in parts if p is not None]).strip()
        text = content.get("text")
        if text:
            return str(text).strip()
    return ""


def iter_chatgpt_export_records(conv: Dict[str, Any], title_filter: Optional[str]) -> Iterable[Dict[str, Any]]:
    conv_id = conv.get("id") or str(uuid.uuid4())
    title = conv.get("title") or "(untitled)"

    if title_filter and title_filter.lower() not in title.lower():
        return

    mapping = conv.get("mapping") or {}
    for node_id, node in mapping.items():
        message = (node or {}).get("message")
        if not message:
            continue

        author = (message.get("author") or {}).get("role") or "unknown"
        c = message.get("content")
        text = _flatten_chatgpt_content(c)
        if not text:
            continue

        create_time = message.get("create_time")
        ts = None
        if isinstance(create_time, (float, int)):
            ts = dt.datetime.fromtimestamp(create_time, tz=dt.timezone.utc).isoformat()

        rec = make_record(
            source="chatgpt",
            conversation_id=conv_id,
            conversation_title=title,
            speaker=author,
            text=text,
            tags=[],
            meta={"node_id": node_id},
            timestamp=ts,
        )
        if rec:
            yield rec


def cmd_import_chatgpt_export(args: argparse.Namespace) -> None:
    path = Path(args.file).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"File not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise SystemExit("Expected top-level JSON array from ChatGPT export conversations.json")

    existing_hashes = {r.get("text_hash") for r in read_jsonl(LOG_FILE)}
    imported = 0
    skipped_dup = 0
    extracted = 0

    for conv in data:
        if not isinstance(conv, dict):
            continue
        for rec in iter_chatgpt_export_records(conv, args.title_contains):
            if rec.get("text_hash") in existing_hashes:
                skipped_dup += 1
                continue
            existing_hashes.add(rec.get("text_hash"))
            ok, fact_added = _log_record_and_maybe_fact(rec, args.extract)
            if ok:
                imported += 1
                if fact_added:
                    extracted += 1

    print(f"Imported {imported} records into {LOG_FILE} (skipped duplicates: {skipped_dup}).")
    if args.extract:
        print(f"Extracted facts: {extracted}")


def iter_openclaw_json_records(data: Any, conversation_id: Optional[str], conversation_title: Optional[str]) -> Iterable[Dict[str, Any]]:
    # Accept either list of messages or object {messages:[...]}
    messages = data
    if isinstance(data, dict):
        messages = data.get("messages") or data.get("items") or []
    if not isinstance(messages, list):
        return

    for m in messages:
        if not isinstance(m, dict):
            continue
        speaker = m.get("role") or m.get("speaker") or "unknown"
        text = m.get("text") or m.get("content") or m.get("message") or ""
        ts = m.get("timestamp") or m.get("created_at") or m.get("time")
        if isinstance(text, list):
            text = "\n".join([str(x) for x in text if x is not None])
        rec = make_record(
            source="openclaw",
            conversation_id=conversation_id or m.get("conversation_id"),
            conversation_title=conversation_title or m.get("conversation_title"),
            speaker=str(speaker),
            text=str(text),
            tags=[],
            meta={"imported": True},
            timestamp=str(ts) if ts else None,
        )
        if rec:
            yield rec


def cmd_import_openclaw_json(args: argparse.Namespace) -> None:
    path = Path(args.file).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"File not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    existing_hashes = {r.get("text_hash") for r in read_jsonl(LOG_FILE)}
    imported = 0
    skipped_dup = 0
    extracted = 0

    for rec in iter_openclaw_json_records(data, args.conversation_id, args.conversation_title):
        if rec.get("text_hash") in existing_hashes:
            skipped_dup += 1
            continue
        existing_hashes.add(rec.get("text_hash"))
        ok, fact_added = _log_record_and_maybe_fact(rec, args.extract)
        if ok:
            imported += 1
            if fact_added:
                extracted += 1

    print(f"Imported {imported} OpenClaw records (skipped duplicates: {skipped_dup}).")
    if args.extract:
        print(f"Extracted facts: {extracted}")


def cmd_extract_facts(_: argparse.Namespace) -> None:
    records = list(read_jsonl(LOG_FILE))
    existing = {f.get("id") for f in read_jsonl(FACTS_FILE)}
    added = 0
    for rec in records:
        fact = extract_fact_from_record(rec)
        if not fact:
            continue
        if fact.get("id") in existing:
            continue
        append_jsonl(FACTS_FILE, fact)
        existing.add(fact.get("id"))
        added += 1
    print(f"Added {added} new facts to {FACTS_FILE}")


def cmd_search(args: argparse.Namespace) -> None:
    q = args.query.lower().strip()
    if not q:
        raise SystemExit("Query cannot be empty.")

    records = list(read_jsonl(LOG_FILE))
    if not records:
        print("No log records yet.")
        return

    hits = []
    now = utc_now()
    for rec in records:
        text = str(rec.get("text", ""))
        title = str(rec.get("conversation_title", ""))
        tags = " ".join(rec.get("tags", []))
        haystack = f"{text}\n{title}\n{tags}".lower()
        if q not in haystack:
            continue

        # Simple ranking: textual score + recency bonus
        text_score = haystack.count(q)
        age_days = max((now - parse_iso(rec.get("timestamp"))).total_seconds() / 86400.0, 0)
        recency_bonus = 2.0 / (1.0 + age_days)
        score = text_score + recency_bonus
        rec["_score"] = round(score, 4)
        hits.append(rec)

    if not hits:
        print("No matches.")
        return

    hits.sort(key=lambda r: (r.get("_score", 0), r.get("timestamp", "")), reverse=True)

    max_results = args.limit
    for rec in hits[:max_results]:
        print("-" * 80)
        print(
            f"score={rec.get('_score')} | [{rec.get('timestamp')}] "
            f"{rec.get('source')}::{rec.get('speaker')} | {rec.get('conversation_title')}"
        )
        print(rec.get("text", "")[:500])

    print("-" * 80)
    print(f"Found {len(hits)} matches (showing {min(len(hits), max_results)}).")


def cmd_list_facts(args: argparse.Namespace) -> None:
    facts = list(read_jsonl(FACTS_FILE))
    if args.type:
        facts = [f for f in facts if f.get("type") == args.type]

    if not facts:
        print("No facts found.")
        return

    facts.sort(key=lambda f: f.get("timestamp", ""), reverse=True)
    for f in facts[: args.limit]:
        print("-" * 80)
        print(f"[{f.get('timestamp')}] {f.get('type')} | {f.get('conversation_title')}")
        print(f.get("text", ""))
    print("-" * 80)
    print(f"Total facts: {len(facts)}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Personal Memory System")
    sp = p.add_subparsers(dest="cmd", required=True)

    p_init = sp.add_parser("init", help="Initialize memory storage")
    p_init.set_defaults(func=cmd_init)

    p_log = sp.add_parser("log-openclaw", help="Log one OpenClaw message")
    p_log.add_argument("--speaker", required=True, help="user|assistant|system|tool")
    p_log.add_argument("--text", help="Message text")
    p_log.add_argument("--stdin", action="store_true", help="Read message text from stdin")
    p_log.add_argument("--conversation-id", help="Conversation id")
    p_log.add_argument("--conversation-title", help="Conversation title")
    p_log.add_argument("--channel", help="telegram|discord|...")
    p_log.add_argument("--tags", help="Comma-separated tags")
    p_log.add_argument("--extract", action="store_true", help="Extract preference/todo/decision facts")
    p_log.set_defaults(func=cmd_log_openclaw)

    p_imp = sp.add_parser("import-chatgpt-export", help="Import ChatGPT conversations export JSON")
    p_imp.add_argument("--file", required=True, help="Path to conversations.json")
    p_imp.add_argument("--title-contains", help="Only import conversations whose title contains this text")
    p_imp.add_argument("--extract", action="store_true", help="Extract preference/todo/decision facts")
    p_imp.set_defaults(func=cmd_import_chatgpt_export)

    p_imp_oc = sp.add_parser("import-openclaw-json", help="Import OpenClaw messages from JSON")
    p_imp_oc.add_argument("--file", required=True, help="Path to JSON list/object of messages")
    p_imp_oc.add_argument("--conversation-id", help="Override conversation_id")
    p_imp_oc.add_argument("--conversation-title", help="Override conversation_title")
    p_imp_oc.add_argument("--extract", action="store_true", help="Extract preference/todo/decision facts")
    p_imp_oc.set_defaults(func=cmd_import_openclaw_json)

    p_extract = sp.add_parser("extract-facts", help="Re-scan memory log and extract facts")
    p_extract.set_defaults(func=cmd_extract_facts)

    p_search = sp.add_parser("search", help="Search memory log")
    p_search.add_argument("--query", required=True)
    p_search.add_argument("--limit", type=int, default=10)
    p_search.set_defaults(func=cmd_search)

    p_facts = sp.add_parser("list-facts", help="List extracted facts")
    p_facts.add_argument("--type", choices=["preference", "todo", "decision"])
    p_facts.add_argument("--limit", type=int, default=20)
    p_facts.set_defaults(func=cmd_list_facts)

    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

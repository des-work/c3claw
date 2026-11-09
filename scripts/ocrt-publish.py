#!/usr/bin/env python3
"""Publish OCRT telemetry to the dashboard through a mapped Discord webhook.

The Cloudflare receiver only trusts messages that carry a webhook ID mapped to
the reporting team in DISCORD_SOURCE_POLICY_JSON. A native bot post has no
webhook ID and is rejected, so an agent that chats into a channel cannot
produce dashboard activity no matter how its text is formatted. This adapter is
the bridge: structured records in, one validated `[OCRT]` line out per record,
posted through the mapped webhook.

Wire format consumed by shared/discord.js:

    [OCRT] team_id | tool | target | result | details

Dedup is the publisher's job. The receiver keys events on the Discord message
ID, so re-posting the same action creates a second message and a second event.
Pass --state to record published event IDs and skip repeats.

Usage:
    ocrt-publish.py --webhook-file private.json --input events.jsonl --state seen.json
    ocrt-publish.py --dry-run < events.json
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.request

PREFIX = "[OCRT]"
TEAM = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX = {"tool": 100, "target": 200, "result": 40, "details": 2000}
REQUIRED = ("team_id", "tool", "target", "result")
STATE_CAP = 5000
USER_AGENT = "DiscordBot (https://github.com/des-work/c3claw, 1.0)"
CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def clean(value, *, allow_pipe=False):
    """Collapse whitespace and control characters; drop pipes in keyed fields.

    A pipe inside team_id, tool, target or result would shift every later field
    when the receiver splits the line, so it is replaced rather than escaped.
    Pipes inside details are harmless: the parser rejoins the remainder.
    """
    text = CONTROL.sub(" ", str(value))
    if not allow_pipe:
        text = text.replace("|", "/")
    return " ".join(text.split())


def normalize(record, index):
    """Return (line, event_id, None) or (None, None, reason)."""
    if not isinstance(record, dict):
        return None, None, f"record {index} is not a JSON object"
    missing = [f for f in REQUIRED if not str(record.get(f) or "").strip()]
    if missing:
        # Never invent a tool or target. An operational notice such as
        # "job X failed" does not describe an action against a target, and
        # guessing one would put fabricated activity on the dashboard.
        return None, None, f"record {index} is missing required field(s): {', '.join(missing)}"

    fields = {f: clean(record[f]) for f in REQUIRED}
    details = clean(record.get("details", ""), allow_pipe=True)
    if not TEAM.match(fields["team_id"]):
        return None, None, (f"record {index} team_id {fields['team_id']!r} is not 1-64 characters "
                            "of letters, digits, underscore or hyphen")
    for field in ("tool", "target", "result"):
        if len(fields[field]) > MAX[field]:
            return None, None, f"record {index} {field} exceeds {MAX[field]} characters"
    if len(details) > MAX["details"]:
        details = details[:MAX["details"] - 1].rstrip() + "…"

    parts = [fields["team_id"], fields["tool"], fields["target"], fields["result"]]
    if details:
        parts.append(details)
    line = f"{PREFIX} " + " | ".join(parts)
    event_id = record.get("event_id")
    return line, (str(event_id) if event_id is not None else None), None


def load_records(path):
    raw = sys.stdin.read() if path in (None, "-") else open(path, encoding="utf-8").read()
    raw = raw.strip()
    if not raw:
        return []
    if raw[0] == "[":
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("Top-level JSON must be an object, an array, or JSON Lines.")
        return parsed
    if raw[0] == "{" and "\n" not in raw.strip().rstrip("}"):
        return [json.loads(raw)]
    records = []
    for number, line in enumerate(raw.splitlines(), 1):
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"line {number} is not valid JSON: {error.msg}") from None
    return records


def read_state(path):
    if not path or not os.path.exists(path):
        return {"published": []}
    try:
        state = json.load(open(path, encoding="utf-8"))
        if isinstance(state, dict) and isinstance(state.get("published"), list):
            return state
    except (json.JSONDecodeError, OSError):
        pass
    # A damaged state file must not silently re-enable duplicate publishing.
    raise SystemExit(f"State file {path} is unreadable or malformed; refusing to publish blind.")


def write_state(path, state):
    state["published"] = state["published"][-STATE_CAP:]
    temporary = f"{path}.tmp"
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        json.dump(state, handle)
        handle.write("\n")
    os.replace(temporary, path)


def webhook_url(args):
    if args.webhook_file:
        return json.load(open(args.webhook_file, encoding="utf-8"))["webhook_url"]
    url = os.environ.get("OCRT_WEBHOOK_URL")
    if not url:
        raise SystemExit("Supply --webhook-file or OCRT_WEBHOOK_URL. The URL is never printed or logged.")
    return url


def post(url, line, attempts=3, sleeper=time.sleep):
    """Post one line. Returns (message_id, None) or (None, reason).

    `wait=true` makes Discord return the created message so the caller can
    record its ID. A request that fails without a response may or may not have
    been delivered, so it is reported as uncertain and never retried blindly.
    """
    body = json.dumps({"content": line, "allowed_mentions": {"parse": []}}).encode()
    request = urllib.request.Request(
        url + ("&" if "?" in url else "?") + "wait=true", data=body, method="POST",
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT})
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response).get("id"), None
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < attempts:
                try:
                    retry_after = float(json.loads(error.read(4096)).get("retry_after", 1))
                except (ValueError, json.JSONDecodeError):
                    retry_after = 1.0
                sleeper(min(max(retry_after, 0.5), 60))
                continue
            if 500 <= error.code < 600 and attempt < attempts:
                sleeper(min(2 ** attempt, 10))
                continue
            return None, f"HTTP {error.code} from Discord"
        except (urllib.error.URLError, TimeoutError) as error:
            return None, (f"delivery uncertain: the request failed without a response ({type(error).__name__}); "
                          "check the channel before republishing this record")
    return None, "rate limited; retries exhausted"


def main(argv=None):
    parser = argparse.ArgumentParser(description="Publish OCRT telemetry through a mapped Discord webhook.")
    parser.add_argument("--input", "-i", help="JSON, JSON array or JSON Lines file. Default: stdin.")
    parser.add_argument("--webhook-file", help="JSON file with {\"webhook_url\": ...}, mode 0600.")
    parser.add_argument("--state", help="Dedup state file of already published event_ids.")
    parser.add_argument("--dry-run", action="store_true", help="Print the lines that would be posted; post nothing.")
    parser.add_argument("--limit", type=int, default=100, help="Maximum records to publish in one run (default 100).")
    args = parser.parse_args(argv)

    try:
        records = load_records(args.input)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Could not read input: {error}")
    if args.limit < 1:
        raise SystemExit("--limit must be at least 1.")

    state = read_state(args.state)
    published = set(state["published"])
    url = None if args.dry_run else webhook_url(args)

    results, posted, skipped, rejected, uncertain = [], 0, 0, 0, 0
    for index, record in enumerate(records):
        if posted >= args.limit:
            results.append({"index": index, "status": "deferred", "reason": "run limit reached"})
            continue
        line, event_id, reason = normalize(record, index)
        if reason:
            rejected += 1
            results.append({"index": index, "status": "rejected", "reason": reason})
            continue
        if event_id and event_id in published:
            skipped += 1
            results.append({"index": index, "status": "skipped", "event_id": event_id,
                            "reason": "already published; republishing would double count"})
            continue
        if args.dry_run:
            results.append({"index": index, "status": "would_publish", "event_id": event_id, "line": line})
            posted += 1
            continue
        message_id, failure = post(url, line)
        if failure:
            if failure.startswith("delivery uncertain"):
                uncertain += 1
            results.append({"index": index, "status": "failed", "event_id": event_id, "reason": failure})
            break
        posted += 1
        results.append({"index": index, "status": "published", "event_id": event_id,
                        "message_id": message_id, "line": line})
        if event_id:
            published.add(event_id)
            state["published"].append(event_id)
            if args.state:
                write_state(args.state, state)

    summary = {"mode": "dry_run" if args.dry_run else "publish", "records": len(records),
               "published": posted, "skipped_duplicate": skipped, "rejected": rejected,
               "uncertain": uncertain, "results": results, "webhook_url_printed": False}
    print(json.dumps(summary, indent=1))
    return 1 if rejected or uncertain or any(r["status"] == "failed" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())

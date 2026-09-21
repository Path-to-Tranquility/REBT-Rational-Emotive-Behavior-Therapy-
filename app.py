"""Local REBT journal. Run with: python app.py"""

import csv
from datetime import datetime
from pathlib import Path
import json
import os
import shutil
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from uuid import uuid4


CSV_PATH = Path(__file__).resolve().parent / "data" / "rebt_entries.csv"
FIELDS = [
    ("activating_event", "A — Activating event", "What happened? Describe the situation using observable facts."),
    ("beliefs", "B — Beliefs", "What did you tell yourself? Include any musts, shoulds, or rigid demands."),
    ("negative_emotions", "C — Negative emotions", "Name the emotions you felt."),
    ("behaviour", "C — Behaviour", "Describe what you did or avoided doing."),
    ("disputation", "D — Dispute the belief", "What evidence supports or challenges the belief? Is it logical and helpful?"),
    ("effective_belief", "E — Effective new belief", "Write a flexible, realistic alternative you can practice."),
    ("healthy_negative_emotion", "E — New healthy negative emotion", "Name a realistic emotion you would like to work toward."),
    ("constructive_behaviour", "E — New constructive behaviour", "Describe a helpful response you can choose."),
    ("next_action", "Next action (optional)", "What is one practical step you want to take?"),
]
COLUMNS = ["entry_id", "submitted_at", "entry_date"] + [item[0] for item in FIELDS] + [
    "intensity_before", "intensity_after"
]


LEGACY_COLUMNS = ["entry_id", "submitted_at", "entry_date", "activating_event",
                  "beliefs", "consequences", "disputation", "effective_belief",
                  "next_action", "intensity_before", "intensity_after"]
# Keep the original combined answers intact instead of guessing how to split them.
COLUMNS.append("consequences")


def migrate_legacy_csv(path):
    if not path.exists() or path.stat().st_size == 0:
        return
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames == COLUMNS:
            return
        if reader.fieldnames != LEGACY_COLUMNS:
            raise ValueError("The CSV has unexpected columns. Move or rename it before saving a new entry.")
        rows = list(reader)
    backup = path.with_name(f"{path.stem}.backup-{uuid4().hex}{path.suffix}")
    shutil.copy2(path, backup)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", newline="", encoding="utf-8",
                                         dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            writer = csv.DictWriter(handle, fieldnames=COLUMNS)
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def save_entry(values, path=CSV_PATH):
    """Validate and append one entry, writing a header only for an empty file."""
    cleaned = {key: str(values.get(key, "")).strip() for key in COLUMNS[2:]}
    try:
        datetime.strptime(cleaned["entry_date"], "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("Enter a valid date in YYYY-MM-DD format.") from exc
    for key, label, _ in FIELDS:
        if key == "next_action":
            continue
        if not cleaned[key]:
            raise ValueError(f"Please complete {label}.")
    for key in ("intensity_before", "intensity_after"):
        try:
            number = int(cleaned[key])
        except ValueError as exc:
            raise ValueError("Emotion intensity must be a whole number from 0 to 10.") from exc
        if not 0 <= number <= 10:
            raise ValueError("Emotion intensity must be a whole number from 0 to 10.")
    row = {"entry_id": str(uuid4()), "submitted_at": datetime.now().astimezone().isoformat(), **cleaned}
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    migrate_legacy_csv(path)
    with path.open("a+", newline="", encoding="utf-8") as handle:
        handle.seek(0)
        header = next(csv.reader(handle), None)
        if header is not None and header != COLUMNS:
            raise ValueError("The CSV has unexpected columns. Move or rename it before saving a new entry.")
        handle.seek(0, 2)
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        if header is None:
            writer.writeheader()
        writer.writerow(row)
    return row


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        pages = {"/": "index.html", "/voice": "voice.html", "/voice.html": "voice.html", "/voice.js": "voice.js"}
        if self.path not in pages:
            self.send_error(404)
            return
        content = Path(__file__).with_name(pages[self.path]).read_bytes()
        self.send_response(200)
        content_type = "application/javascript" if self.path == "/voice.js" else "text/html"
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        if self.path != "/entries":
            self.send_error(404)
            return
        # Only accept JSON requests from this local form.
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.send_error(415)
            return
        origin = self.headers.get("Origin")
        if origin and origin != f"http://127.0.0.1:{self.server.server_port}":
            self.send_error(403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1_000_000:
                raise ValueError("Invalid submission size.")
            values = json.loads(self.rfile.read(length))
            if not isinstance(values, dict):
                raise ValueError("Expected a form submission.")
            save_entry(values)
            code, result = 201, {"message": "Entry saved to data/rebt_entries.csv."}
        except (ValueError, UnicodeError) as exc:
            code, result = 400, {"message": str(exc)}
        except (OSError, csv.Error):
            code, result = 500, {"message": "Could not save. Close the CSV in Excel if it is open and check folder permissions. Your answers are still here."}
        content = json.dumps(result).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        pass  # Keep journal content out of console logs.


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 8765), Handler)
    print("Open http://127.0.0.1:8765 in your browser. Press Ctrl+C to stop.")
    print(f"Entries save to: {CSV_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

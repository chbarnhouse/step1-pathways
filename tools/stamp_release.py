#!/usr/bin/env python3
"""Turn the pending { v: 'next' } changelog entry into a real version. Used by release.sh.

  python3 tools/stamp_release.py minor|patch|major|X.Y.Z   → prints the new version
  python3 tools/stamp_release.py --check                   → exit 1 if there are unreleased notes
  python3 tools/stamp_release.py --list                    → print them
"""
import datetime
import re
import sys
from pathlib import Path

VERSION_JS = Path(__file__).resolve().parent.parent / "static" / "js" / "version.js"
NEXT = re.compile(r"\{ v: 'next', items: \[(.*?)\] \},\n", re.S)


def pending(src):
    m = NEXT.search(src)
    return m and m.group(1).strip() and m


def main(arg):
    src = VERSION_JS.read_text()
    if arg == "--check":
        sys.exit(1 if pending(src) else 0)
    m = pending(src)
    if arg == "--list":
        for item in re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(1) if m else ""):
            print("  • " + item.replace("\\'", "'"))
        return
    if not m:
        sys.exit("No unreleased notes: add them to the { v: 'next', items: [...] } entry in static/js/version.js first.")
    cur = re.search(r"const APP_VERSION = '(\d+)\.(\d+)\.(\d+)';", src)
    major, minor, patch = map(int, cur.groups())
    if re.fullmatch(r"\d+\.\d+\.\d+", arg):
        new = arg
    else:
        new = {"major": f"{major + 1}.0.0", "minor": f"{major}.{minor + 1}.0", "patch": f"{major}.{minor}.{patch + 1}"}.get(arg)
        if not new:
            sys.exit("usage: stamp_release.py minor|patch|major|X.Y.Z")
    today = datetime.date.today().isoformat()
    src = src[:m.start()] + f"{{ v: '{new}', date: '{today}', items: [{m.group(1)}] }},\n" + src[m.end():]
    src = src.replace(cur.group(0), f"const APP_VERSION = '{new}';")
    VERSION_JS.write_text(src)
    print(new)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "minor")

#!/usr/bin/env bash
#
# Publish a round of changes to classmates (GitHub Pages) — the only thing that updates the public copy.
#
# Day to day you work on the dev branch: commit, push, ./deploy.sh to your own copy (it shows a
# Preview badge while there are unreleased notes). GitHub Pages serves docs/ from main, and main
# only moves here. When a round is ready:
#
#   ./release.sh            next minor version (3.7.0 → 3.8.0)
#   ./release.sh patch      3.7.0 → 3.7.1     (also: major, or an exact X.Y.Z)
#   ./release.sh minor -y   skip the confirmation
#
# Steps: check (incl. tools/test-data.js: saved data stays safe) → stamp the pending changelog entry with the version and today's date → validate →
# build docs/ → commit + tag on dev → fast-forward main → push → deploy your copy → back on dev.
set -euo pipefail
cd "$(dirname "$0")"

BUMP="${1:-minor}"; YES="${2:-}"
[ "$(git branch --show-current)" = dev ] || { echo "Switch to dev first (git checkout dev)."; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first:"; git status --short; exit 1; }
python3 tools/stamp_release.py --check && { echo "Nothing to release: the { v: 'next' } entry in static/js/version.js is empty."; exit 1; }
git fetch -q github
git merge-base --is-ancestor github/main dev || { echo "main has commits dev doesn't; merge main into dev first."; exit 1; }

echo "==> Checking saved data stays safe"
node tools/test-data.js >/dev/null || { node tools/test-data.js | grep "✗"; echo "Release stopped: fix the problems above first."; exit 1; }

echo "==> Unreleased notes:"
python3 tools/stamp_release.py --list
if [ "$YES" != "-y" ]; then read -r -p "Publish these to classmates as a $BUMP release? [y/N] " a; [ "$a" = y ] || exit 1; fi

VER="$(python3 tools/stamp_release.py "$BUMP")"
echo "==> Version $VER"
node tools/validate.js
python3 build.py
node tools/test-data.js --write-ids   # these ids are now promised to users
git add static/js/version.js docs tools/released-ids.json
git -c user.name=Claude -c user.email=claude@cowork.local commit -q -m "STEP 1 Pathways $VER"
git tag "v$VER"

echo "==> Publishing"
git checkout -q main
git merge -q --ff-only dev
git push -q github main dev "v$VER"
git checkout -q dev

echo "==> Updating your copy"
./deploy.sh
echo "==> Released $VER: https://chbarnhouse.github.io/step1-pathways/ (GitHub Pages takes about a minute)"

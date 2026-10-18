#!/usr/bin/env bash
#
# Deploy Pathways to the homelab (https://pathways.chbarnhouse.com).
#
# Runs as its own user and systemd unit inside CT 147 (shared with RentTracker —
# local-lvm was over its 80% thin-pool ceiling on 2026-10-17, so no new container).
# Everything goes through the Proxmox host with pct, like RentTracker: the service
# containers have no authorized_keys.
#
#   ./deploy.sh            push code + built-in pathways, restart, verify
#   ./deploy.sh --setup    first run: also create the user and the systemd unit
#
# data/user/ (your edits and answer history) lives only on the server and is never touched.
set -euo pipefail

PVE_HOST="${PVE_HOST:-Proxmox}"
CTID="${CTID:-147}"
APPDIR="${APPDIR:-/opt/pathways}"
CT_IP="${CT_IP:-192.168.10.125}"
PORT="${PORT:-8010}"

cd "$(dirname "$0")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Packing"
COPYFILE_DISABLE=1 tar czf "$STAGE/pathways.tgz" --no-xattrs --exclude='__pycache__' --exclude='data/user' \
  server.py build.py README.md static data
scp -q "$STAGE/pathways.tgz" "$PVE_HOST:/tmp/pathways.tgz"

echo "==> Installing into CT $CTID:$APPDIR"
ssh "$PVE_HOST" bash -s -- "$CTID" "$APPDIR" "$PORT" "${1:-}" <<'REMOTE'
set -euo pipefail
CTID="$1"; APPDIR="$2"; PORT="$3"; MODE="${4:-}"
pct push "$CTID" /tmp/pathways.tgz /tmp/pathways.tgz
if [[ "$MODE" == "--setup" ]]; then
  pct exec "$CTID" -- bash -c "
    id pathways >/dev/null 2>&1 || useradd --system --home $APPDIR --shell /usr/sbin/nologin pathways
    mkdir -p $APPDIR/app $APPDIR/data/user
    cat > /etc/systemd/system/pathways.service <<UNIT
[Unit]
Description=Pathways study app
After=network.target

[Service]
User=pathways
WorkingDirectory=$APPDIR/app
Environment=PORT=$PORT PATHWAYS_QUIET=1 PATHWAYS_USER_STATE=$APPDIR/data/user/state.json
ExecStart=/usr/bin/python3 $APPDIR/app/server.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable pathways
  "
fi
# Unpack beside the live code and swap, so a failed extract never leaves it half-replaced.
pct exec "$CTID" -- bash -c "
  set -e
  rm -rf $APPDIR/app.new && mkdir -p $APPDIR/app.new
  tar xzf /tmp/pathways.tgz -C $APPDIR/app.new
  rm -rf $APPDIR/app.old
  [ -d $APPDIR/app ] && mv $APPDIR/app $APPDIR/app.old || true
  mv $APPDIR/app.new $APPDIR/app
  rm -rf $APPDIR/app.old /tmp/pathways.tgz
  chown -R pathways:pathways $APPDIR
  systemctl restart pathways
"
rm -f /tmp/pathways.tgz
REMOTE

echo "==> Verifying"
sleep 2
curl -fsS --max-time 10 "http://$CT_IP:$PORT/" | grep -q "<title>Pathways</title>" || { echo "!! page did not render" >&2; exit 1; }
curl -fsS --max-time 10 "http://$CT_IP:$PORT/bundle.js" | grep -q '"glycolysis"' || { echo "!! bundle missing pathways" >&2; exit 1; }
curl -fsS --max-time 10 "http://$CT_IP:$PORT/api/state" >/dev/null || { echo "!! state API down" >&2; exit 1; }
echo "==> OK — http://$CT_IP:$PORT  ·  https://pathways.chbarnhouse.com"

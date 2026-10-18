#!/usr/bin/env bash
#
# Deploy STEP 1 Pathways to a Proxmox homelab.
#
# Runs as its own user and systemd unit inside a Proxmox container, reached through the
# Proxmox host with pct (the containers have no authorized_keys). Host, container and
# address come from deploy.env (not committed) — see deploy.env.example.
#
#   ./deploy.sh            push code + built-in pathways, restart, verify
#   ./deploy.sh --setup    first run: also create the user and the systemd unit
#
# data/user/ (your edits and answer history) lives only on the server and is never touched.
set -euo pipefail

cd "$(dirname "$0")"
[ -f deploy.env ] && . ./deploy.env
: "${PVE_HOST:?set PVE_HOST in deploy.env}" "${CTID:?set CTID in deploy.env}" "${CT_IP:?set CT_IP in deploy.env}"
APPDIR="${APPDIR:-/opt/step1-pathways}"
PORT="${PORT:-8010}"
PUBLIC_URL="${PUBLIC_URL:-}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Checking saved data stays safe"
node tools/test-data.js >/dev/null || { node tools/test-data.js | grep "✗"; echo "!! deploy stopped: this version could break saved data" >&2; exit 1; }

echo "==> Packing"
COPYFILE_DISABLE=1 tar czf "$STAGE/step1-pathways.tgz" --no-xattrs --exclude='__pycache__' --exclude='data/user' \
  server.py README.md static data
scp -q "$STAGE/step1-pathways.tgz" "$PVE_HOST:/tmp/step1-pathways.tgz"

echo "==> Installing into CT $CTID:$APPDIR"
ssh "$PVE_HOST" bash -s -- "$CTID" "$APPDIR" "$PORT" "${1:-}" <<'REMOTE'
set -euo pipefail
CTID="$1"; APPDIR="$2"; PORT="$3"; MODE="${4:-}"
pct push "$CTID" /tmp/step1-pathways.tgz /tmp/step1-pathways.tgz
if [[ "$MODE" == "--setup" ]]; then
  pct exec "$CTID" -- bash -c "
    id step1-pathways >/dev/null 2>&1 || useradd --system --home $APPDIR --shell /usr/sbin/nologin step1-pathways
    mkdir -p $APPDIR/app $APPDIR/data/user
    cat > /etc/systemd/system/step1-pathways.service <<UNIT
[Unit]
Description=STEP 1 Pathways study app
After=network.target

[Service]
User=step1-pathways
WorkingDirectory=$APPDIR/app
Environment=PORT=$PORT PATHWAYS_QUIET=1 PATHWAYS_USER_STATE=$APPDIR/data/user/state.json
ExecStart=/usr/bin/python3 $APPDIR/app/server.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable step1-pathways
  "
fi
# Unpack beside the live code and swap, so a failed extract never leaves it half-replaced.
pct exec "$CTID" -- bash -c "
  set -e
  # A copy of your data from just before this version runs (it may upgrade the data on first load). Last 10 kept.
  if [ -f $APPDIR/data/user/state.json ]; then
    mkdir -p $APPDIR/data/user/backups
    cp -p $APPDIR/data/user/state.json $APPDIR/data/user/backups/predeploy-\$(date +%Y%m%d-%H%M%S).json
    ls -1t $APPDIR/data/user/backups/predeploy-*.json | tail -n +11 | xargs -r rm -f
  fi
  rm -rf $APPDIR/app.new && mkdir -p $APPDIR/app.new
  tar xzf /tmp/step1-pathways.tgz -C $APPDIR/app.new
  rm -rf $APPDIR/app.old
  [ -d $APPDIR/app ] && mv $APPDIR/app $APPDIR/app.old || true
  mv $APPDIR/app.new $APPDIR/app
  rm -rf $APPDIR/app.old /tmp/step1-pathways.tgz
  chown -R step1-pathways:step1-pathways $APPDIR
  systemctl restart step1-pathways
"
rm -f /tmp/step1-pathways.tgz
REMOTE

echo "==> Verifying"
sleep 2
curl -fsS --max-time 10 "http://$CT_IP:$PORT/" | grep -q "<title>STEP 1 Pathways</title>" || { echo "!! page did not render" >&2; exit 1; }
curl -fsS --max-time 10 "http://$CT_IP:$PORT/bundle.js" | grep -q '"glycolysis"' || { echo "!! bundle missing pathways" >&2; exit 1; }
curl -fsS --max-time 10 "http://$CT_IP:$PORT/api/state" >/dev/null || { echo "!! state API down" >&2; exit 1; }
echo "==> OK — http://$CT_IP:$PORT  ${PUBLIC_URL:+·  $PUBLIC_URL}"

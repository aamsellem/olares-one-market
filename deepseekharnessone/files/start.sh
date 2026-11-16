#!/bin/bash
# DeepSeek Harness on Olares: install the pinned dsh release once into the app's data, seed the web profile with
# Olares Router as the model provider, then serve the Web UI on loopback behind proxy.mjs.
set -euo pipefail

VER="${DSH_VERSION:?}"
RT="/data/runtime/$VER"
# HOME is the workspace (Home/Code): the Web UI creates new projects under HOME, and they belong in the user's
# files, not in the app's data. Tool caches and settings stay in the app's data.
export DSH_HOME=/data/home HOME=/workspace npm_config_cache=/data/npm-cache npm_config_update_notifier=false
export XDG_CACHE_HOME=/data/cache XDG_CONFIG_HOME=/data/config XDG_DATA_HOME=/data/share XDG_STATE_HOME=/data/state
export GIT_CONFIG_GLOBAL=/data/gitconfig HISTFILE=/data/bash_history PYTHONUSERBASE=/data/python
export DSH_TELEMETRY_DISABLED=1 DSH_TOKEN_FILE=/tmp/dsh-token
mkdir -p /data/runtime "$DSH_HOME" /workspace "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME"
touch "$GIT_CONFIG_GLOBAL"

if [ ! -x "$RT/node_modules/.bin/dsh" ]; then
  echo "start: installing @deepseek-ai/dsh@$VER (first start, about 1.2 GB)"
  rm -rf "$RT.tmp" && mkdir -p "$RT.tmp"
  (cd "$RT.tmp" && npm init -y >/dev/null && npm install --no-audit --no-fund "@deepseek-ai/dsh@$VER")
  rm -rf "$RT" && mv "$RT.tmp" "$RT"
  find /data/runtime -mindepth 1 -maxdepth 1 ! -name "$VER" -exec rm -rf {} +
  npm cache clean --force >/dev/null 2>&1 || true
fi
DSH="$RT/node_modules/.bin/dsh"

# Subagents run on the parent's model. With model selection on, the model may send a child reasoning_effort alone,
# which dsh refuses ("requires both provider and model") when the only provider is Router.
for f in "$RT"/node_modules/@deepseek-ai/dsh-web-app/presets/*.patch.yml; do
  sed -i -e 's/^\( *\)modelSelection: true$/\1modelSelection: false/' -e 's/^\( *\)modelDiscovery: true$/\1modelDiscovery: false/' "$f"
done

# The profile patch is seeded once: the Web UI saves its own model settings into the same file afterwards.
PATCH="$DSH_HOME/profiles/web/cordis.patch.yml"
[ -f "$PATCH" ] || "$DSH" --profile web --help >/dev/null
if ! grep -q '^- id:' "$PATCH"; then
  echo "start: seeding the web profile with Olares Router"
  cp /app/router.patch.yml "$PATCH"
fi

cd /workspace
rm -f "$DSH_TOKEN_FILE"
"$DSH" --profile web --no-open --port 3080 > >(tee /tmp/dsh.log) 2>&1 &
for _ in $(seq 1 120); do
  grep -q 'token=' /tmp/dsh.log 2>/dev/null && break
  sleep 1
done
grep -o 'token=[^ ]*' /tmp/dsh.log | head -1 | cut -d= -f2 > "$DSH_TOKEN_FILE"
[ -s "$DSH_TOKEN_FILE" ] || { echo "start: dsh did not print its launch URL"; exit 1; }

node /app/proxy.mjs &
wait -n
echo "start: a process exited, restarting the container"
exit 1

#!/bin/sh
# Aeris engine: stock ComfyUI on the official PyTorch CUDA image.
# First boot installs ComfyUI + its Python deps into /data/engine (persistent); later boots start in seconds.
set -eu
COMFY_VERSION="${COMFY_VERSION:-0.45.0}"
CONVERTER_REF="${CONVERTER_REF:-bc8538278f82053b3ca10a44d62d02596f8e1a37}"  # public domain, adds POST /workflow/convert
BASE=/data/engine
APP="$BASE/ComfyUI-$COMFY_VERSION"
VENV="$BASE/venv-$COMFY_VERSION"
RUN="$BASE/run"
mkdir -p "$RUN/input" "$RUN/output" "$RUN/temp" "$RUN/user" "$BASE/pip-cache"

fetch() {  # url dest-dir
  python3 - "$1" "$2" <<'PY'
import io, sys, tarfile, urllib.request, os, shutil
url, dest = sys.argv[1], sys.argv[2]
data = urllib.request.urlopen(url, timeout=120).read()
tmp = dest + ".tmp"
shutil.rmtree(tmp, ignore_errors=True)
with tarfile.open(fileobj=io.BytesIO(data)) as t:
    t.extractall(tmp)
inner = os.path.join(tmp, os.listdir(tmp)[0])
shutil.rmtree(dest, ignore_errors=True)
os.rename(inner, dest)
shutil.rmtree(tmp, ignore_errors=True)
PY
}

if [ ! -f "$APP/.aeris-ready" ]; then
  echo "AERIS_ENGINE: installing ComfyUI $COMFY_VERSION"
  case "$COMFY_VERSION" in   # a release (0.43.2) or a commit, for a merged fix not released yet
    *.*) COMFY_URL="https://github.com/comfyanonymous/ComfyUI/archive/refs/tags/v$COMFY_VERSION.tar.gz" ;;
    *) COMFY_URL="https://github.com/comfyanonymous/ComfyUI/archive/$COMFY_VERSION.tar.gz" ;;
  esac
  fetch "$COMFY_URL" "$APP"
  fetch "https://github.com/SethRobinson/comfyui-workflow-to-api-converter-endpoint/archive/$CONVERTER_REF.tar.gz" \
        "$APP/custom_nodes/comfyui-workflow-to-api-converter-endpoint"
  touch "$APP/.aeris-ready"
fi

if [ ! -f "$VENV/.aeris-ready" ]; then
  echo "AERIS_ENGINE: installing Python dependencies"
  # the PyTorch image has no ensurepip: create the venv without pip and drive it with the system pip
  python3 -m venv --clear --without-pip --system-site-packages "$VENV"
  # torch comes from the image; the template/docs packages (~600 MB) are optional for an API-only engine
  grep -v -E '^(torch|torchvision|torchaudio|comfyui-workflow-templates|comfyui-embedded-docs)([=<> ]|$)' "$APP/requirements.txt" > "$BASE/requirements.txt"
  PIP_CACHE_DIR="$BASE/pip-cache" python3 -m pip --python "$VENV/bin/python" install --disable-pip-version-check \
    -r "$BASE/requirements.txt"
  touch "$VENV/.aeris-ready"
fi

# Aéris built-in extension (Diffusers-name LoRAs for MiniMax H3…), refreshed on every start
mkdir -p "$APP/custom_nodes/aeris_nodes" && cp /etc/aeris/aeris_nodes.py "$APP/custom_nodes/aeris_nodes/__init__.py"

if [ -f "$BASE/nodes.json" ]; then  # custom nodes required by installed workflows (written by the Aeris server)
  PIP_CACHE_DIR="$BASE/pip-cache" python3 /etc/aeris/nodes.py "$BASE/nodes.json" "$APP/custom_nodes" "$VENV/bin/python" || true
fi

echo "AERIS_ENGINE: ready, starting ComfyUI $COMFY_VERSION"
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# Olares GPU sharing (HAMi libvgpu) crashes with cudaMallocAsync / pinned host memory / dynamic VRAM:
# use the plain allocator. Models stay loaded between jobs (smart memory kept on).
SAFE_ARGS="--disable-cuda-malloc --disable-pinned-memory --disable-dynamic-vram --reserve-vram 1"
cd "$APP"
exec "$VENV/bin/python" main.py --listen 0.0.0.0 --port 8188 --disable-auto-launch \
  --extra-model-paths-config /etc/aeris/extra_model_paths.yaml \
  --input-directory "$RUN/input" --output-directory "$RUN/output" \
  --temp-directory "$RUN/temp" --user-directory "$RUN/user" \
  $SAFE_ARGS ${ENGINE_ARGS:-}

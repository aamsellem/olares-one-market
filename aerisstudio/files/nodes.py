"""Install the custom nodes listed in /data/engine/nodes.json into the engine (run by start.sh before ComfyUI).

nodes.json: {"nodes": [{"name": "comfyui-h3-oneclick-swap", "repo": "D3voz/comfyui-h3-oneclick-swap", "ref": "<commit or tag>"}]}
Each node is fetched as a GitHub archive at its pinned ref (no git needed), then its requirements are installed in the
engine venv without touching torch (constraints pin the image's torch build). A node already at its ref is skipped.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.request

nodes_file, custom_dir, venv_python = sys.argv[1], sys.argv[2], sys.argv[3]
spec = json.load(open(nodes_file)).get("nodes", [])
constraints = os.path.join(os.path.dirname(nodes_file), "constraints.txt")
import torch, torchvision, torchaudio  # noqa: E401  (system site-packages of the image)
with open(constraints, "w") as f:
    f.write(f"torch=={torch.__version__}\ntorchvision=={torchvision.__version__}\ntorchaudio=={torchaudio.__version__}\n")

failed = []
for n in spec:
    name, repo, ref = n["name"], n["repo"], n["ref"]
    if not all(c.isalnum() or c in "-_." for c in name) or repo.count("/") != 1:
        print(f"AERIS_NODES: skip invalid entry {n}", flush=True)
        continue
    dest = os.path.join(custom_dir, name)
    marker = os.path.join(dest, ".aeris-ref")
    if os.path.exists(marker) and open(marker).read().strip() == ref:
        continue
    print(f"AERIS_NODES: installing {repo}@{ref}", flush=True)
    try:
        for attempt in range(4):  # GitHub archives of repos with media can be large: retry flaky downloads
            try:
                data = urllib.request.urlopen(f"https://github.com/{repo}/archive/{ref}.tar.gz", timeout=300).read()
                break
            except Exception as e:
                if attempt == 3:
                    raise
                print(f"AERIS_NODES: {name}: retry after {e}", flush=True)
                import time
                time.sleep(5 * (attempt + 1))
        tmp = dest + ".tmp"
        shutil.rmtree(tmp, ignore_errors=True)
        with tarfile.open(fileobj=io.BytesIO(data)) as t:
            t.extractall(tmp)
        shutil.rmtree(dest, ignore_errors=True)
        os.rename(os.path.join(tmp, os.listdir(tmp)[0]), dest)
        shutil.rmtree(tmp, ignore_errors=True)
        req = os.path.join(dest, "requirements.txt")
        if os.path.exists(req):
            lines = [l for l in open(req).read().splitlines()
                     if l.strip() and not l.strip().lower().startswith(("torch", "#", "-e"))]
            lines = ["opencv-python-headless" if l.strip().startswith("opencv-python") else l for l in lines]
            if lines:
                with open(req + ".aeris", "w") as f:
                    f.write("\n".join(lines) + "\n")
                subprocess.run([sys.executable, "-m", "pip", "--python", venv_python, "install", "--disable-pip-version-check",
                                "-r", req + ".aeris", "-c", constraints], check=True)
        open(marker, "w").write(ref)
    except Exception as e:  # keep going: one broken node must not stop the engine
        failed.append(name)
        print(f"AERIS_NODES: {name} failed: {e}", flush=True)
print(f"AERIS_NODES: ready ({len(spec) - len(failed)}/{len(spec)})" + (f", failed: {', '.join(failed)}" if failed else ""), flush=True)

# Orales One Market

## What This Is

A Cloudflare Worker serving as a **custom Olares Market source** — an alternative app store optimised for the **Olares One** device (the only Olares hardware product).

The user is **aamsellem**, the only external contributor to `beclab/apps` (the official Olares app store).

## Global Standards

- **Language**: All outputs, code comments, and documentation MUST be in **British English** (e.g., *optimise*, *catalogue*, *synchronise*, *colour*).

## Architecture

Self-contained repo: app Helm charts live alongside the market server code.

```
orales-one-market/
├── <app-dirs>/              ← Helm charts (Chart.yaml + OlaresManifest.yaml + templates/)
├── generate-model-app.sh    ← Generator script for new model apps
├── scripts/build-catalog.js ← Parses app charts → src/catalog.json
├── src/index.ts             ← Cloudflare Worker (serves market API)
├── src/catalog.json         ← Generated catalog (committed, deterministic)
├── wrangler.toml            ← Cloudflare Workers config
└── GEMINI.md
```

There is a sibling project `../orales-market/` with the **generic** apps for any Olares hardware. This repo contains apps **optimised for Olares One** hardware specifically.

The build script (`scripts/build-catalog.js`) scans the repo root for directories containing both `Chart.yaml` and `OlaresManifest.yaml`, and generates `src/catalog.json`. The worker (`src/index.ts`) imports this catalog and serves 3 API endpoints.

## Olares Market Source API Contract

When a user adds a market source URL in Olares (Market → Settings → Add source), the local `market` service (Go, repo `beclab/market`) syncs every **5 minutes** via 3 endpoints:

### 1. `GET /api/v1/appstore/hash?version=X`
Quick hash check. If hash matches cached value, endpoints 2+3 are skipped.
```json
{"hash": "bf42332c...", "last_updated": "2026-03-08T...", "version": "1.12.3"}
```

### 2. `GET /api/v1/appstore/info?version=X`
Full catalog with simplified app entries.
```json
{
  "version": "1.12.3",
  "hash": "...",
  "last_updated": "...",
  "data": {
    "apps": {"<8char_hex_id>": {"id","name","version","category","description","icon","source":1}},
    "recommends": {}, "pages": {}, "topics": {}, "topic_lists": {},
    "tops": [], "latest": ["appname1","appname2"], "tags": {}
  },
  "stats": {"appstore_data": {"apps": 7}, "last_updated": "..."}
}
```
Fields `recommends`, `pages`, `topics`, `topic_lists`, `tops`, `tags` can be empty for minimal implementation.

### 3. `POST /api/v1/applications/info`
Full details for specific apps (called in batches of 10).
```json
// Request
{"app_ids": ["4ef430dd", "d6252832"], "version": "1.12.3"}
// Response
{"apps": {"4ef430dd": {/* full ApplicationInfoEntry */}}, "version": "1.12.3", "not_found": []}
```

The full `ApplicationInfoEntry` has ~50 fields parsed from `OlaresManifest.yaml`: `id`, `name`, `cfgType`, `chartName`, `icon`, `description`, `title`, `version`, `categories`, `fullDescription`, `developer`, `requiredMemory` (bytes string), `requiredDisk` (bytes string), `requiredCPU` (cores string), `requiredGPU` (bytes string), `supportArch`, `permission`, `entrances`, `options`, `subCharts`, `submitter`, `license`, `i18n`, etc.

**Resource format conversions** (OlaresManifest → API):
- CPU: `4000m` → `"4"` (millicores to cores)
- Memory/Disk/GPU: `24Gi` → `"25769803776"` (K8s notation to bytes string)

**App IDs** are 8-char hex strings (MD5 hash of app name, truncated).

### Chart download
The `chartName` field (e.g. `"llamacppqwen35a3bone-1.0.6.tgz"`) tells Olares what chart to install. The chart-repo-service downloads from:
```
{BaseURL}/api/v1/applications/{appName}/chart?fileName={chartName}&version={version}
```
Charts are base64-encoded in `src/charts.json` and decoded at serve time by the worker.

## Build System

```bash
npm run build:catalog    # Parse app charts → src/catalog.json + src/charts.json + src/icons.json
npm run dev              # Build + wrangler dev (localhost:8787)
npm run deploy           # Build + wrangler deploy (Cloudflare)
```

Deployed at: `https://orales-one-market.aamsellem.workers.dev`

The build script:
- Scans the repo root for directories containing both `Chart.yaml` and `OlaresManifest.yaml`
- Strips Helm template directives (`{{if}}`, `{{else}}`, `{{end}}`) before YAML parsing — keeps the admin/if branch, drops else branch
- Reads `i18n/` subdirectories for locale-specific manifests
- Generates a deterministic `catalog.json` (no timestamps in content, only writes if changed to avoid wrangler rebuild loops)
- Hash is MD5 of the JSON payload (deterministic across runs if apps haven't changed)

## Current Apps

| ID | Name | Version | Backend | Notes |
|----|------|---------|---------|-------|
| `4ef430dd` | llamacppqwen35a3bone | 1.0.21 | llama.cpp b8334 | Unsloth UD-Q4_K_XL, 128.75 t/s, developer role fix |
| `2c5c39c9` | qwen35a3bvisionone | 1.0.2 | llama.cpp b8334 | UD-Q4_K_XL + mmproj F16, vision, 131.03 t/s, 16K ctx |
| `(new)` | devstralsmallone | 1.0.0 | llama.cpp b8334 | Devstral Small 24B, UD-Q5_K_XL, coding agent, 53.6% SWE-Bench |

Only Olares One optimised apps belong here. Generic apps stay in `orales-market`.

## Olares One Hardware

- **GPU**: NVIDIA RTX 5090M (24GB GDDR7, 896 GB/s, sm_120 Blackwell)
- **CPU**: Intel Core Ultra 9 275HX (24 cores, AVX2/FMA/F16C/AVX-VNNI — NO AVX-512, NO AMX)
- **RAM**: 96GB DDR5 5600MHz
- **TDP**: GPU 175W, CPU 160W

## Olares Manifest Constraints

- Entrance title: max 30 chars, only `[a-z0-9A-Z-\s]` — NO dots, parentheses, or special chars. Replace dots with hyphens (e.g., `GLM-4.7` → `GLM-47`)
- Proxy image: `beclab/aboveos-bitnami-openresty:1.25.3-2`
- Manifest version: `0.10.0` (must match official beclab/apps format, NOT 0.11.0)
- Top-level `apiVersion: 'v2'` required in OlaresManifest.yaml
- CPU values in integer cores (e.g., `4`), NOT millicores (`4000m`)
- Olares dependency: `>=1.12.3-0`

### Olares Environment Variables (olaresEnv)

Apps can request system-level environment variables via the `envs` section in OlaresManifest.yaml. These are injected into Helm values as `.Values.olaresEnv.<VAR_NAME>`.

**Declaration in OlaresManifest.yaml:**
```yaml
envs:
  - envName: OLARES_USER_HUGGINGFACE_SERVICE
    required: true
    applyOnChange: true
    valueFrom:
      envName: OLARES_USER_HUGGINGFACE_SERVICE
  - envName: OLARES_USER_HUGGINGFACE_TOKEN
    required: true
    applyOnChange: true
    valueFrom:
      envName: OLARES_USER_HUGGINGFACE_TOKEN
```

**Usage in deployment templates:**
```yaml
env:
  - name: HF_ENDPOINT
    value: "{{ .Values.olaresEnv.OLARES_USER_HUGGINGFACE_SERVICE }}"
  - name: HF_TOKEN
    value: "{{ .Values.olaresEnv.OLARES_USER_HUGGINGFACE_TOKEN }}"
```

**Available variables:**
- `OLARES_USER_HUGGINGFACE_SERVICE` — HuggingFace API endpoint (proxy)
- `OLARES_USER_HUGGINGFACE_TOKEN` — User's HuggingFace token (for gated models)

**Important:** Without the `envs` declaration, `.Values.olaresEnv` will be empty `{}`. The user must have configured their HF token in Olares settings.

## Key References

- `beclab/market` (GitHub) — Go service running locally on Olares devices, syncs from market sources
- Sync steps: `internal/v2/appinfo/syncerfn/{hash_comparison,data_fetch,detail_fetch}_step.go`
- Types: `internal/v2/types/types.go` (`ApplicationInfoEntry`, `AppsInfoRequest`, `AppsInfoResponse`)
- Settings: `internal/v2/settings/manager.go` (endpoint path config, `createDefaultAPIEndpoints`)
- Official market URLs: `https://api.olares.com/market` (global), `https://api.olares.cn/market` (China)

## Relationship with orales-market

- `orales-market` = generic apps for any Olares hardware
- `orales-one-market` (this repo) = apps optimised for **Olares One** hardware (RTX 5090M, 96GB DDR5, Core Ultra 9 275HX)

Apps may exist in both repos with different configurations (quantization, GPU layers, context size, etc.).

## llama.cpp Optimisation for Olares One (Battle-tested)

### Best configuration (128.75 t/s — Qwen3.5-35B-A3B)

Image: `ghcr.io/ggml-org/llama.cpp:server-cuda13-b8740` (pinned, includes GATED_DELTA_NET fused op + CUDA fused multiply for MoE)
Model: `unsloth/Qwen3.5-35B-A3B-GGUF` → `Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf` (22.2GB)

```
--host 0.0.0.0 --port 8080
--model /models/Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf
--n-gpu-layers 99          # all layers on GPU
--threads 16               # for CPU work (24 cores available)
--ctx-size 16384           # Unsloth recommended
--cache-type-k q8_0        # KV cache quantization — big speed gain
--cache-type-v q8_0        # KV cache quantization
--batch-size 512           # prompt processing optimisation
--ubatch-size 512          # critical for pp throughput
--parallel 1               # single user — best throughput
--mlock                    # prevent OS swap
--swa-full                 # sliding window attention for hybrid arch (+3-4 t/s)
--flash-attn auto          # flash attention
--op-offload               # GPU-accelerated prefill for CPU weights
```

Env vars:
```
GGML_CUDA_GRAPH_OPT=1     # concurrent CUDA streams for QKV projections
```

### Performance history (tested on Olares One)

| Version | Config change | t/s | Delta |
|---------|--------------|-----|-------|
| v1.0.0 | --cpu-moe (experts on CPU) | ~56 | baseline |
| v1.0.1 | removed --cpu-moe | 112 | +100% |
| v1.0.2 | +ctk/ctv q8_0, batch 512, np 1, mlock | 125 | +11.6% |
| v1.0.3 | MXFP4 + swa-full | 115.89 | -7.3% |
| **v1.0.4** | **UD-Q4_K_XL + swa-full** | **128.75** | **+2.9%** |

### What HURTS performance — DO NOT USE

- **`--cpu-moe`**: Halves performance (56 vs 112 t/s). MoE expert computation on CPU is way too slow even with 16 threads on Core Ultra 9 275HX. Keep everything on GPU.
- **MXFP4 quantization**: Despite being smaller (18.4GB vs 22.2GB), MXFP4 is ~10% slower than UD-Q4_K_XL on RTX 5090M. CUDA kernels are less optimised for this format.
- **Low thread count**: 4 threads → 16 threads makes a noticeable difference.
- **Missing KV cache quantization**: Without `-ctk q8_0 -ctv q8_0`, speed drops significantly and VRAM is wasted on full-precision KV cache.

### What HELPS performance — ALWAYS USE

- **KV cache q8_0** (`-ctk q8_0 -ctv q8_0`): Biggest single-flag improvement. Saves VRAM + speeds up. Warning: may degrade quality at very long contexts (20-40K+).
- **Batch/ubatch 512**: Huge impact on prompt processing (ubatch=128→512 = 175→460 t/s pp in benchmarks).
- **`--swa-full`**: +3-4 t/s for Qwen3.5 hybrid attention architecture (Gated DeltaNet + SSM).
- **`GGML_CUDA_GRAPH_OPT=1`**: Concurrent CUDA streams. Single GPU only.
- **`--flash-attn auto`**: Standard flash attention optimisation.
- **`--mlock`**: Prevents model from being swapped to disk by OS.
- **`-np 1`**: Single parallel sequence, best single-user throughput.
- **`--op-offload`**: GPU-accelerated prompt processing for any CPU-resident weights.
- **Unsloth Dynamic (UD) quants**: Better quality than standard K-quants — important layers upcasted to 8/16-bit.

### VRAM budget (RTX 5090M 24GB)

| Quant | Model size | Free for KV cache |
|-------|-----------|-------------------|
| Q3_K_XL | 16.6 GB | ~7.4 GB |
| Q4_K_M | 22.0 GB | ~2 GB |
| UD-Q4_K_XL | 22.2 GB | ~1.8 GB |
| MXFP4 | 18.4 GB | ~5.6 GB |

UD-Q4_K_XL at 16K context with q8_0 KV cache fits comfortably.

### Sampling parameters (Unsloth recommended for Qwen3.5)

- **Thinking mode (coding)**: temp=0.6, top_p=0.95, top_k=20, min_p=0.0
- **Thinking mode (general)**: temp=1.0, top_p=0.95, top_k=20, min_p=0.0, presence_penalty=1.5
- **Non-thinking (general)**: temp=0.7, top_p=0.8, top_k=20, min_p=0.0, presence_penalty=1.5
- Model is **very sensitive to sampling params** — use these exact values for tool calling/agentic use.

### Docker image tags (llama.cpp)

- Format: `ghcr.io/ggml-org/llama.cpp:server-cuda13-b{N}`
- Always pin to a specific build number, don't use `server-cuda` (rolling latest).
- CUDA variants: `server-cuda`, `server-cuda12`, `server-cuda13`
- b8740 (April 10, 2026) includes: CUDA fused multiply for MoE, GATED_DELTA_NET fused op, Hadamard rotation (TurboQuant), less CUDA syncs, SSM conv shared mem.

### GGUF sources

- **Unsloth**: `unsloth/Qwen3.5-35B-A3B-GGUF` — UD (Dynamic) quants with imatrix. Updated March 5, 2026 with improved quantization. MXFP4 bug fixed Feb 27.
- **Bartowski**: `bartowski/Qwen_Qwen3.5-35B-A3B-GGUF` — standard quants with imatrix, 29 variants.

### Key llama.cpp merges (March 2026)

- **PR #19504** (Mar 7): GATED_DELTA_NET fused op — critical for Qwen3.5 MoE perf
- **PR #17795** (Mar 5): Less CUDA synchronisations — +1-1.5% all models
- **PR #20128** (Mar 6): Shared mem for SSM conv — benefits Qwen3.5 hybrid arch
- **PR #20149** (Mar 6): Skip redundant RoPE cache updates

### Reference benchmarks (from Reddit r/LocalLLaMA)

| Hardware | Quant | t/s (generation) |
|----------|-------|-----------------|
| RTX 5090 desktop 32GB | UD-Q4_K_XL | 180-185 |
| **Olares One RTX 5090M 24GB** | **UD-Q4_K_XL** | **128.75** |
| RTX 4090 24GB | Q3_K_XL | 115 |
| RTX 3090 24GB | MXFP4 | 100-112 |
| M4 Max 64GB | MXFP4 | 60 |
| M4 Pro 48GB | MXFP4/Q4_K_L | 30 |

### Speculative decoding (not yet available)

Speculative decoding for Qwen3.5 in llama.cpp is NOT yet implemented (issue #20039). PRs in progress. When available, expect 1.5-2x generation speedup.

### Known bugs

- **Full prompt re-processing**: Qwen3.5 models may force full prompt re-processing on every conversation turn due to hybrid recurrent architecture (GDN + SSM) + SWA cache logic. Workaround: set `CLAUDE_CODE_ATTRIBUTION_HEADER=0` if using as Claude Code backend (or equivalent for Gemini CLI).
- **GGUF chat template incomplete**: Pass explicit chat template from base model, not the one built into GGUF.

## KTransformers on Olares One

Alternative backend for models not well-suited to GGUF quantization. Uses BF16 native precision with hybrid CPU+GPU inference (attention on GPU, MoE experts on CPU via AMX-optimised kernels).

### Docker image

`approachingai/ktransformers:latest` (v0.5.2.post2) — has TWO conda environments:
- Default Python `/opt/conda/lib/python3.11/` — OLD, **NO sm_120/Blackwell support**
- `serve` env `/opt/miniconda3/envs/serve/` — PyTorch cu128 + sglang-kt, **supports RTX 5090**
- **MUST use**: `command: ["/opt/miniconda3/envs/serve/bin/python", "-m", "sglang.launch_server"]`

### Supported models (kt-kernel)

- DeepSeek-V2/V3/R1, Qwen3-MoE (30B-A3B), Mixtral, Llama, InternLM

### NOT supported

- **Qwen3.5-35B-A3B** (`Qwen3_5MoeForConditionalGeneration`) — architecture not in kt-kernel
- **GPT-OSS 120B** — no architecture support, no MXFP4 support

### Key server args (Qwen3-30B-A3B, BF16, ~60GB)

```
--kt-cpuinfer 24 --kt-threadpool-count 1 --kt-num-gpu-experts 32
--kt-method BF16 --attention-backend flashinfer --mem-fraction-static 0.80
--chunked-prefill-size 4096 --max-running-requests 4 --max-total-tokens 32768
--enable-mixed-chunk --tensor-parallel-size 1 --enable-p2p-check
--disable-shared-experts-fusion --kt-gpu-prefill-token-threshold 4096
--kt-enable-dynamic-expert-update
```

### Known issues

- Chinese pip mirror proxy in container — `unset http_proxy` or `-i https://pypi.org/simple/`
- Model download (~60GB BF16) via `snapshot_download` — handles resume internally, do NOT add skip-if-exists check

## Model choices for Olares One

| Model | Backend | Precision | Size | Status |
|-------|---------|-----------|------|--------|
| **Qwen3.5-35B-A3B** | llama.cpp | UD-Q4_K_XL | 22.2GB | **128.75 t/s** — best option |
| Qwen3-30B-A3B | KTransformers | BF16 | ~60GB | Works, untested perf |
| GPT-OSS 120B | — | — | — | NOT supported by any backend yet |

## Non-llama.cpp Apps (PyTorch/Diffusers/etc.)

Apps that aren't simple llama.cpp servers require extra validation. Lessons from ACE-Step XL (20+ failed iterations):

### Mandatory Pre-Chart Validation

**Before writing ANY chart**, SSH into the Olares One and explore the image live:

```bash
ssh olares@192.168.1.32
kubectl run --rm -it debug --image=<image> -- bash

# Inside the container, check:
which python3                           # Python location
python3 -c "import torch; print(torch.__version__)"  # Torch version
find / -name "*.py" -path "*/acestep/*" | head  # Code location
ls /app/ /opt/ /venv/                   # Working directory structure
python3 -c "import torchaudio; torchaudio.save('/tmp/test.wav', torch.randn(1,16000), 16000); print('OK')"  # Test audio export end-to-end
```

### HuggingFace Repos

ALWAYS verify repos exist before using them in download Jobs:
```bash
curl -s -o /dev/null -w "%{http_code}" "https://huggingface.co/api/models/<org>/<repo>/tree/main?recursive=1"
# 200 = public, 401 = gated (needs token), 404 = doesn't exist
```

### Common Pitfalls

- **torchcodec/torchaudio**: In torch 2.10+ nightly, `torchaudio.save()` depends on `torchcodec` which is often compiled against a different torch ABI. Fix: replace `import torchaudio` with a soundfile+ffmpeg shim (`torchaudio_shim.py`)
- **Image structure varies wildly**: `harveyff` uses `/app/.venv/`, `vastai` uses `/venv/main/`, code can be at `/app/`, `/opt/workspace-internal/`, or pip-installed. Always check.
- **Build our own image when deps are broken**: Don't waste iterations patching. One clean Dockerfile > 10 runtime monkey-patches.
- **Volume mount paths must match app expectations**: The app writes to a specific path (e.g., `/app/checkpoints/`). Mount the persistent volume THERE, not somewhere else with symlinks.

### Custom Docker Image Pattern

When the community image has broken deps:

```dockerfile
FROM docker.io/<community-image>:<tag>
# Update app code (e.g., add XL model support)
RUN wget -q https://github.com/<repo>/archive/main.zip -O /tmp/code.zip && \
    unzip -qo /tmp/code.zip -d /tmp/ && \
    cp -r /tmp/<repo>-main/<module>/* /app/<module>/ && \
    rm -rf /tmp/code.zip /tmp/<repo>-main
# Fix broken deps with a shim instead of patching
COPY torchaudio_shim.py /app/torchaudio_shim.py
RUN sed -i 's/^import torchaudio$/import torchaudio_shim as torchaudio/' /app/<module>/audio_utils.py
```

Build for amd64 from Mac: `docker buildx build --platform linux/amd64 -t aamsellem/<name>:<tag> . --load`
Push: `docker push aamsellem/<name>:<tag>`

### Olares One SSH Access

```bash
ssh olares@192.168.1.32
```

## TODO

- [x] ~~Investigate chart `.tgz` download mechanism~~ — resolved: `{BaseURL}/api/v1/applications/{appName}/chart?fileName={chartName}`
- [x] ~~Deploy to Cloudflare~~ — live at `https://orales-one-market.aamsellem.workers.dev`
- [x] ~~Test with actual Olares device as market source~~ — working, all metadata displays correctly
- [x] ~~Custom-compiled llama.cpp~~ — NOT worth it. CPU has no AVX-512/AMX (Arrow Lake-HX). Generic image already uses AVX2+FMA. No docker on Olares One (only containerd).
- [ ] Add GitHub Action for auto-deploy on push
- [ ] Try speculative decoding when llama.cpp adds Qwen3.5 support (PR #20075)
- [ ] Re-evaluate when new llama.cpp builds drop (check GATED_DELTA_NET improvements)
- [ ] Add more Olares One optimised apps (TTS, image gen, etc.)

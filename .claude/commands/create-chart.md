# Create Helm Chart for Olares One

Create a complete Helm chart for an individual model app optimized for Olares One 1.12.6+, ready to import in Studio.

## Argument: $ARGUMENTS

The argument should describe what to build:
- A model + backend (e.g., "Qwen3.5-35B-A3B llama.cpp UD-Q4_K_XL")
- Or reference a previous /research-model output
- Or "from-docker <docker run command>" to convert a working Docker command into a chart

## Olares One Constraints (MUST follow)

- `olaresManifest.version: '0.12.0'`
- `apiVersion: 'v3'` at top level of OlaresManifest.yaml
- No `metadata.appid` and no Helm template expressions in `OlaresManifest.yaml`
- `metadata.categories` must be `AI`; retain richer browsing labels in `scripts/market-taxonomy.json`
- Declare one NVIDIA `spec.accelerator` envelope, `permission.appData: true`, and Olares `>=1.12.6-0`
- Add `workloadReplicas.<app>: 1`, `values.yaml` `workloads.<app>.replicaCount: 1`, and wire the Deployment's replicas to that value
- CPU values: integer cores (NOT millicores)
- Entrance title: max 30 chars; avoid punctuation that Olares cannot render
- Proxy image: `beclab/aboveos-bitnami-openresty:1.25.3-2`
- Olares dependency: `>=1.12.6-0`

## Chart Structure for Olares One apps

These are **simple single-user apps** (no shared/admin split like official beclab/apps).
No Helm template conditionals are allowed in the manifest. These are individual applications, not shared Olares apps.

```
<app-name>/
├── Chart.yaml
├── OlaresManifest.yaml
├── values.yaml
├── owners
├── .helmignore
├── i18n/en-US/OlaresManifest.yaml
└── templates/
    └── deployment.yaml    ← ConfigMap + Deployment + Service
```

## Steps

1. **Determine app name**: lowercase alphanumeric, no hyphens/underscores. Convention:
   - llama.cpp: `llamacpp<model><quant>one` (e.g., `llamacppqwen35a3bone`)
   - vLLM: `vllm<model>one`
   - KTransformers: `kt<model>one`

2. **Generate the v3 scaffold** rather than copying an old chart. For example:
   ```bash
   scripts/generate-model-app.sh --backend llamacpp --name llamacpp<model>one \
     --title "Model One" --model-url https://.../model.gguf --model-file model.gguf \
     --taxonomy "LLM Chat,AI Agents"
   ```
   For vLLM, use `--backend vllm --model org/model`. The generator creates the chart and the Worker-only taxonomy entry, but does not create an icon or publish the chart.

3. **Chart.yaml**: Standard Helm v2 chart, version starts at `1.0.0`.

4. **OlaresManifest.yaml**: Use the generated v3 chart and `llamacppqwen35a3bone/` as references. Key fields:
   - Resource requirements based on model size + backend needs
   - Icon URL: `https://orales-one-market.aamsellem.workers.dev/icons/<app-name>.png`
   - Manifest category: `AI`; keep display taxonomy in `scripts/market-taxonomy.json`
   - Developer: `aamsellem`
   - Website/sourceCode: `https://github.com/aamsellem/olares-one-market`
   - License URL: use `ggml-org` (NOT `ggerganov`) for llama.cpp

5. **templates/deployment.yaml**: Contains:
   - **ConfigMap**: model URL, file name, all tunable parameters (if needed)
   - **InitContainer for permissions**: ALWAYS add an initContainer that runs `chmod -R 777 <volume-mount>` for hostPath volumes. Non-root containers cannot write to hostPath dirs created by K8s. Do NOT use `chown` with hardcoded UIDs — container user UID varies by image.
   - **InitContainer for model download** (if needed): downloads model on first run (wget/curl), caches to persistent volume
   - **InitContainer for extra binaries** (if needed): Use `docker.io/alpine:3.20` to download static binaries (e.g., ffmpeg from johnvansickle.com) into an emptyDir shared volume. Do NOT install packages in the main container (OPA blocks `runAsUser: 0` with untrusted registries). Do NOT use scratch-based images (no shell). Static binaries avoid glibc incompatibilities.
   - **Main container**: the inference server with all optimized args
   - **Probes**: startup (long timeout for model loading + download), liveness
   - **Resources**: CPU/memory limits matching OlaresManifest
   - **GPU annotation**: `applications.app.bytetrade.io/gpu-inject: "true"`
   - **Volume**: hostPath to `{{ .Values.userspace.appData }}/<subdir>`
   - **OPA security constraints**: Olares has an OPA webhook that blocks `runAsUser: 0` + untrusted registries (ghcr.io, quay.io). Trusted: `docker.io/`, `beclab/`. Use trusted images for initContainers that need root.

6. **values.yaml**: Preserve the generated `userspace` and `workloads.<app>.replicaCount` values.

7. **i18n/en-US/OlaresManifest.yaml**: Localized metadata and spec.

8. **owners**: `aamsellem`

9. **.helmignore**: Exclude `docker/`, `*.tgz`, `.DS_Store`

10. **Ask user for icon** or generate placeholder. Place in `icons/<app-name>.png`.

11. **Package**: `helm package <app-name> -d charts/`

12. **Report**: Show chart structure, file sizes, and suggest: "Run `/test-on-device <app-name>` to test in Studio."

## Reference

Use `llamacppqwen35a3bone/` as the template for all new apps. Read it to understand the exact format, then adapt for the new model/backend.

### llama.cpp optimized args (battle-tested on Olares One)

```
--n-gpu-layers 99 --threads 16
--cache-type-k q8_0 --cache-type-v q8_0
--batch-size 2048 --ubatch-size 1024
--parallel 1 --mlock --swa-full
--flash-attn auto --op-offload
--jinja --no-context-shift
```
Env: `GGML_CUDA_GRAPH_OPT=1`

### Docker images (pinned)
- llama.cpp: `ghcr.io/ggml-org/llama.cpp:server-cuda-b<N>` — ALWAYS verify the tag exists on ghcr.io before deploying (not every build gets a Docker image). Current known good: **b8284**.
- vLLM: `vllm/vllm-openai:v<version>`
- KTransformers: `approachingai/ktransformers:latest` (use serve env)

### Important: verify Docker image exists before deploying
```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:ggml-org/llama.cpp:pull" | jq -r '.token')
curl -s -o /dev/null -w "%{http_code}" "https://ghcr.io/v2/ggml-org/llama.cpp/manifests/server-cuda-b<N>" \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.oci.image.index.v1+json"
# 200 = exists, 404 = does not exist
```

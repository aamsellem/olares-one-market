# Draft Reddit post — r/LocalLLM

**Suggested title:** First sm_120 BeeLlama.cpp benchmark on consumer Blackwell mobile: 107 t/s at FULL 262K context on Qwen3.6 27B (+48% vs MTP, +22% vs vLLM Genesis)

---

## Body

Tested the BeeLlama.cpp fork that's been making the rounds (claim of 135 t/s on Qwen3.6 27B Q5 + vision + 200K context on a single RTX 3090). Sounded too good. My best Qwen3.6 27B path on Olares One (RTX 5090M Laptop, 24GB GDDR7, 896 GB/s, sm_120 Blackwell consumer mobile, Core Ultra 9 275HX, 96GB DDR5) was 88 t/s on vLLM + Genesis 28-patch + MTP n=3, or 72.75 t/s at FULL 262K on llama.cpp + MTP.

Built BeeLlama from source for sm_120, tested it. **The post wasn't cherry-picked.**

TL;DR: **107.54 t/s AVG (10 clean runs, range 101.70-119.38) at FULL 262K context. Zero CUDA OOM. Zero degradation cycle.** New strict best Qwen3.6 27B path on consumer Blackwell — fastest AND longest in one stack.

### Stack

- Custom image: `aamsellem/beellama-cpp:0.1.1` (amd64 + CUDA 13 + sm_120, built from `Anbeeld/beellama.cpp` v0.1.1)
- Target: `unsloth/Qwen3.6-27B-GGUF` — `UD-Q3_K_XL` (14.5 GB, **NOT** the MTP-baked variant — BeeLlama uses DFlash spec decoding, not MTP)
- Drafter: `spiritbuun/Qwen3.6-27B-DFlash-GGUF` — `dflash-draft-3.6-q8_0.gguf` (1.85 GB)
- KV cache: **turbo3** (3-bit Walsh-Hadamard rotated, ~25% smaller than q4_0)
- Spec: `--spec-type dflash --spec-dflash-cross-ctx 1024`
- Batch: 2048, ubatch: 256, flash-attn on, mlock, no-mmap

### Methodology

Space Invaders HTML prompt, 2000 tokens, temp 0.6 / top_k 20 / min_p 0.0. 2 warmups + 10 measured runs at each context size.

### Context sweep on RTX 5090M

| Context | Runs | AVG t/s | Range | KV cache (turbo3) |
|---------|------|---------|-------|------------------|
| 96K  | 10 | 106.67 | 97.84-115.36 | ~3 GB |
| 128K | 5 | **116.0**  | 107.12-127.32 | ~4 GB |
| 200K | 5 | 108.5  | 100.51-122.82 | ~6 GB |
| **262K (full native)** | **10** | **107.54** | **101.70-119.38** | **~8 GB** |

Perf is essentially **flat across context sizes**. turbo3 KV scales gracefully — even at 262K full native the stack fits on 24 GB with headroom. No 5-fast/4-slow cycle like the one I posted about Gemma 4 DFlash on vLLM last week.

The 128K sweet spot is real and reproducible. Best guess is cudagraph capture sizes aligning with prefill chunks at exactly that range.

### Comparison vs my other Qwen3.6 27B paths on the same hardware

| Path | Context | t/s | Stack |
|------|---------|-----|-------|
| **BeeLlama (this)** | **262K FULL** | **107.54** | llama.cpp fork + DFlash + turbo3 KV |
| vLLM Genesis Turbo | 88K | 88 | vLLM + 28 patches + MTP n=3 + TurboQuant K8V4 |
| buun-DFlash | 96K | 76 | llama.cpp + DFlash (no MTP claim, no CopySpec) |
| llama.cpp MTP | 262K FULL | 72.75 | am17an MTP branch + unsloth UD-Q3_K_XL + q4_0 KV |

- **+48% vs MTP** at same 262K target quant
- **+22% vs vLLM Genesis Turbo** at 1/3 the context
- **+40% vs buun-DFlash** at less context

### Fork chain (for context)

`ggml-org/llama.cpp` → `TheTom/llama-cpp-turboquant` (turbo2/3/4 KV) → `spiritbuun/buun-llama-cpp` (DFlash for Qwen 3.6) → `Anbeeld/beellama.cpp` (MTP claim, CopySpec, reasoning-loop protection)

None of these forks publish a Linux Docker image for sm_120. The build via `docker buildx --platform linux/amd64 --build-arg CUDA_DOCKER_ARCH=120` from an M-series Mac took ~50 min through qemu emulation. Image is 2.67 GB, on Docker Hub as `aamsellem/beellama-cpp:0.1.1`.

### Why it wins over MTP @ same 262K (analysis, not certainty)

Three combined factors:

1. **DFlash drafter vs MTP head**: spiritbuun's q8_0 DFlash drafter for Qwen 3.6 was specifically tuned by z-lab on Qwen 3.6's output distribution. Higher accept than the MTP head baked into havenoammo's GGUF.
2. **turbo3 vs q4_0 KV**: ~25% smaller → more compute buffer headroom → bigger batch.
3. **batch 2048 / ubatch 256 vs 512/512**: more prefill packing per scheduler cycle.

I haven't isolated which of the three contributes the most yet — that's the next bench.

### Gotchas

- If you have a `havenoammo/Qwen3.6-27B-MTP-UD-GGUF` cached, BeeLlama refuses to load it: `done_getting_tensors: wrong number of tensors; expected 866, got 862`. MTP head bakes 4 tensors BeeLlama's loader doesn't recognize. Use the non-MTP unsloth variant.
- Multi-GPU broken in this fork (issue #7). Single-GPU only.
- BeeLlama hasn't synced upstream master since April 23 — won't get new llama.cpp builds (b9130+) until Anbeeld rebases.
- No Genesis 28-patch maintenance burden, but you do depend on Anbeeld maintaining the fork.

### Reproducible

Helm chart, exact image tag, all flags, bench harness: https://github.com/aamsellem/olares-one-market/tree/main/llamacppqwen36beellamaone (v1.0.1).

If you run a different sm_120 card (5070 Ti, 5080, 5090 desktop, 5090M), the `aamsellem/beellama-cpp:0.1.1` image should work as-is. 5090 desktop with 32GB and 1.79 TB/s should land around 150-180 t/s if my mobile-to-desktop bandwidth scaling holds — let me know your numbers.

### Open questions

1. Anyone tested BeeLlama's CopySpec (its unique addition over buun) on structured-output workloads? My open-ended HTML bench is the wrong workload for CopySpec.
2. q4_0 KV vs turbo3 — is the win in the engine or in the KV format?
3. Does the 128K sweet spot reproduce on other sm_120 cards?

---

**Hardware:** Olares One (RTX 5090M Laptop, 24GB, sm_120 Blackwell mobile)
**Image:** `aamsellem/beellama-cpp:0.1.1` (custom build, source: https://github.com/Anbeeld/beellama.cpp v0.1.1)
**Helm chart:** https://github.com/aamsellem/olares-one-market/tree/main/llamacppqwen36beellamaone
**Full blog writeup:** https://blog.aamsellem.com/posts/beellama-cpp-262k-blackwell-mobile/

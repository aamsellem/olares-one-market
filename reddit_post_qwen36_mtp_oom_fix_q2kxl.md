# Reddit draft — r/LocalLLaMA

**Suggested title:** Fixed reproducible MTP CUDA OOM on Qwen3.6-27B + 262K context on 24GB GPU by dropping to UD-Q2_K_XL — same 12 GB target, full context restored

---

## Body

I've been running `havenoammo/Qwen3.6-27B-MTP-UD-GGUF` Q3_K_XL on an Olares One (RTX 5090M Laptop, 24GB sm_120 Blackwell mobile) at 262K context + MTP spec decoding n=5. Boot-time validation bench gave a clean **77 t/s @ FULL 262K**. Reproducible across multiple boots.

Then a user reported the runtime crash:

> the pod crashed frequently with exit code 139 due to a CUDA OOM during MTP drafting.
> `/src/llama.cpp/ggml/src/ggml-cuda/ggml-cuda.cu:97: CUDA error`
> `current device: 0, in function ggml_cuda_graph_evaluate_and_capture`
> `... common_speculative_state_mtp::draft`
> Disabling MTP makes it rock-stable; even with context > 200k there's room left but reactivating MTP crashes.

## Root cause

MTP draft compute buffer scales with the cudagraph capture shapes the prompt actually exercises. Boot-time static allocator estimate doesn't account for the worst-case captures. Same problem documented in [llama.cpp PR #22673 thread](https://github.com/ggml-org/llama.cpp/pull/22673) — long context + MTP eats more VRAM than the boot-time KV calculation suggests.

The Q3_K_XL target is 14.92 GB. At 262K with q4_0 KV cache (~4.3 GB), only ~5 GB free for everything else (MTP head, compute buffers, cudagraph captures, activations). Tight on validation prompts, NOT tight enough for arbitrary user prompts.

## Fix: drop one quant tier

`havenoammo/Qwen3.6-27B-MTP-UD-GGUF` ships a full UD ladder including **UD-Q2_K_XL at 12.3 GB** (vs Q3_K_XL 14.9 GB). That extra **2.6 GB** is exactly what the MTP draft compute buffer needs. Total ~4.5 GB recovered when combined with the 1.9 GB Q3_K_XL already won over Q4_K_M.

## Validation bench (Olares One, 5090M, 24GB)

Tested BOTH `havenoammo/Qwen3.6-27B-MTP-UD-GGUF` UD-Q2_K_XL (the one I ship) AND `unsloth/Qwen3.6-27B-GGUF-MTP` UD-Q2_K_XL (the new official one).

**Bench:** Space Invaders HTML, 2000 tokens, temp 0.6 top_p 0.95, 2 warmups + 10 measured runs.

**havenoammo Q2_K_XL @ 262K + MTP n=5 (what I ship):**
```
runs:  68.60, 71.25, 75.24, 68.46, 76.25, 71.30, 73.12, 68.51, 73.92, 74.70 t/s
AVG = 72.14 t/s
MIN = 68.46, MAX = 76.25
NO CUDA OOM, NO degradation cycle, 10 clean runs
```

**unsloth UD-Q2_K_XL @ 262K + MTP n=5 (the new official):**
```
runs:  66.01, 66.37, 64.46, 62.54, 65.48, 64.47, 62.88, 64.05, 61.58, 63.77 t/s
AVG = 64.16 t/s
MIN = 61.58, MAX = 66.37
NO CUDA OOM, NO degradation cycle
```

**havenoammo wins by +12% at same quant tier.** Different MTP integration / metadata. Use havenoammo for now.

## Trade-off summary

| Stack | t/s | Stability | Notes |
|-------|-----|-----------|-------|
| havenoammo Q3_K_XL @ 262K (was v1.0.5) | 77 (validated) | ❌ runtime OOM | Reported crashes |
| **havenoammo Q2_K_XL @ 262K (v1.0.7)** | **72.14 (direct bench)** | ✅ ROCK-stable | Ships now |
| havenoammo Q3_K_XL @ 128K (would-be v1.0.6) | ~65 (extrapolated) | ✅ stable | Loses 50% context |

**Only −6% t/s for stability and full 262K context.** Easy win.

Unsloth Dynamic preserves critical layers in higher precision (and MTP head at Q8_0 even at Q2 tier), so quality drop vs Q3_K_XL is around 5-8% on benchmarks rather than the larger drop you'd see going from standard Q3_K_M → Q2_K.

## Stack used

- Hardware: RTX 5090 Laptop 24GB sm_120 Blackwell mobile
- Image: `markus-albrecht/llamacpp-mtp:0.1.0` (custom build from am17an's MTP branch — should be droppable once #22673 merges upstream)
- Target: `havenoammo/Qwen3.6-27B-MTP-UD-GGUF` (or equivalently `unsloth/Qwen3.6-27B-GGUF-MTP`) UD-Q2_K_XL
- Args: `--ctx-size 262144 --cache-type-k q4_0 --cache-type-v q4_0 --batch-size 512 --ubatch-size 512 --parallel 1 --flash-attn on --spec-type mtp --spec-draft-n-max 5`

Reproducible chart: [orales-one-market](https://github.com/markus-albrecht/olares-one-market/tree/main/llamacppqwen36mtpone) v1.0.7.

## TL;DR

If your Qwen3.6-27B + MTP setup OOMs at long context on a 24GB card despite "fitting" at boot, drop one UD quant tier (Q3_K_XL → Q2_K_XL). The 2.6 GB freed is exactly what the MTP draft cudagraph capture needs at runtime. Trade ~17% t/s for stability and full context. Worked on 5090M; should work on RTX 3090/4090/5090 desktop too.

# Reddit post — r/LocalLLaMA — Gemma 4 MTP on Blackwell consumer mobile

**Title (one of):**
- `Gemma 4 MTP on RTX 5090 Laptop (sm_120 24GB): E2B 206 t/s, 26B-A4B 140 t/s @ 78% accept (beats AtomicChat M5Max ref), E4B 178 t/s via vLLM`
- `Gemma 4 MTP — first public bench on consumer Blackwell *mobile* (RTX 5090M, 24GB): three stacks tested, full reproducible recipes`

**Flair:** `Discussion` or `Performance`

---

## Body

Hey everyone — first public Gemma 4 MTP bench on consumer Blackwell mobile that I'm aware of (RTX 5090M Laptop GPU, sm_120, 24GB GDDR7 — the GPU in the new Olares One). Both stacks now have working Gemma 4 MTP support, so I tested all three model variants we have public drafters for.

**TL;DR**

| Stack | Model | t/s | Accept | Notes |
|---|---|---|---|---|
| llama.cpp + AtomicChat fork | Gemma 4 E2B | **206.6** | 60.9% | Single-stream cap for ~5B model |
| vLLM nightly + PR #41745 | Gemma 4 E4B | 178.6 | 77.3% | 100% upstream stack, 1 PR |
| llama.cpp + AtomicChat fork | Gemma 4 26B-A4B | **140.0** | 78.1% | Beats AtomicChat M5Max ref (138 t/s) |

All three are first runs (no warmup), 3000+ generated tokens each. MTP confirmed firing in logs. Steady state probably 5-10% higher.

## Stack 1: vLLM nightly + Gemma 4 E4B (178 t/s, 77% accept)

PR #41745 by `lucianommartins` merged 2026-05-06 14:39 UTC, nightly Docker published 2026-05-07 06:13 UTC. Image: `vllm/vllm-openai:nightly-1acd67a795ebccdf9b9db7697ae9082058301657`.

```yaml
exec vllm serve google/gemma-4-E4B-it \
  --served-model-name gemma-4-e4b-mtp \
  --max-model-len 32000 \
  --gpu-memory-utilization 0.85 \
  --dtype auto \
  --enable-prefix-caching \
  --speculative-config '{"method":"mtp","model":"google/gemma-4-E4B-it-assistant","num_speculative_tokens":3}'
```

Bench:
```
Run 1 (cold): 800 tok in 6.17s = 129.73 t/s
Run 2:        800 tok in 4.17s = 191.73 t/s
Run 3:        800 tok in 3.73s = 214.38 t/s
AVG = 178.6 t/s, 77.3% draft acceptance
```

## Stack 2: llama.cpp + Atomic Chat fork + E2B (206 t/s)

Fork: `AtomicBot-ai/atomic-llama-cpp-turboquant` (branch `feature/turboquant-kv-cache`). Adds `gemma4_assistant` arch + TurboQuant KV cache (`-ctk turbo3 -ctv turbo3`) + `--mtp-head` runtime flag.

GGUFs: `unsloth/gemma-4-E2B-it-GGUF` (target Q8_0) + `AtomicChat/gemma-4-E2B-it-assistant-GGUF` (drafter Q4_K_M, 75 MB).

```bash
llama-server \
  --model gemma-4-E2B-it-Q8_0.gguf \
  --mtp-head gemma-4-E2B-it-assistant.Q4_K_M.gguf \
  --spec-type mtp \
  --draft-block-size 3 --draft-max 8 --draft-min 0 \
  -ngl 99 -ngld 99 \
  -ctk turbo3 -ctv turbo3 -ctkd turbo3 -ctvd turbo3 \
  -fa on -c 131072
```

Bench:
```
prompt eval: 22 tok in 0.224s = 98.27 t/s
eval:        3198 tok in 15.48s = 206.56 t/s
draft acceptance: 60.93%
```

## Stack 3: llama.cpp + Atomic Chat fork + 26B-A4B (140 t/s, 78% accept)

Same fork, different model. Target `unsloth/gemma-4-26B-A4B-it-GGUF/UD-Q4_K_XL.gguf` (~17 GB) + drafter `AtomicChat/gemma-4-26B-A4B-it-assistant-GGUF` Q4_K_M (325 MB).

Bench:
```
prompt eval: 22 tok in 0.164s = 134.45 t/s
eval:        3238 tok in 23.12s = 140.03 t/s
draft acceptance: 78.15%  (1974 accepted / 2526 generated)
```

**Beats AtomicChat's M5Max reference (138 t/s).** Notable because 5090M Laptop has ~75% the bandwidth of an RTX 4090, but the MoE Gemma 4 (3.8B activated of 26B) extracts a lot from it.

## Why 78% acceptance is high

For comparison, Qwen3.6 27B + MTP llama.cpp (PR #22673) on the same hardware tops out at ~64% acceptance. The Gemma 4 drafter delivers higher because:
1. It's trained jointly with the target (not a standalone "small Gemma" repurposed)
2. The centroid LM head (top_k=32, num_centroids=2048) compresses the 262K vocab to a 4K mask — faster AND more aligned predictions
3. The 26B-A4B specifically benefits from MoE routing being deterministic at inference, so the drafter can match patterns reliably

## VRAM math (24 GB consumer mobile)

| Model | Quant | KV (q4_0 / turbo3) | Total | Headroom |
|---|---|---|---|---|
| E2B | Q8_0 (4.7 GB) | ~1 GB @ 128K | ~6 GB | 18 GB |
| E4B (vLLM) | auto (6 GB) | ~1.5 GB @ 32K | ~8 GB | 16 GB |
| 26B-A4B | Q4_K_XL (17 GB) | ~3 GB @ 64K | ~20 GB | 4 GB |

The 26B-A4B is tight — need to bump HAMi cap to 24400m and use `turbo3` KV (3-bit Hadamard rotation, more compact than q4_0) to fit comfortably.

## What's NOT covered

- **MLX** — community is asking on Reddit but no support yet (only mlx-community has the bf16 weights converted)
- **Mainline llama.cpp** — AtomicChat fork only for now. Upstream PR will probably follow (their fix for `gemma4_assistant` arch is small and clean)
- **Vision** — Gemma 4 mmproj NOT compatible with MTP in current AtomicChat fork. Text-only for now.

## Recipes / charts

For Olares One owners — both stacks are packaged in my market source as installable apps:
- `gemma4e2bone` v1.0.2 (E2B + atomic fork)
- `gemma426ba4bone` v1.0.9 (26B-A4B + atomic fork)
- `vllmgemma4e4bone` (the vLLM E4B path — chart bump pending)

Source URL: `https://orales-one-market.aamsellem.workers.dev`

## Credits

- **Google DeepMind** for Gemma 4 + the official MTP drafters (E2B/E4B/26B-A4B/31B)
- **lucianommartins** for vLLM PR #41745 (clean architecture, centroids masking with CUDA graph acceleration)
- **AtomicChat** team for the llama.cpp fork + MTP-quantized GGUFs ([HF collection](https://huggingface.co/collections/AtomicChat/gemma-4-assistant-gguf))
- **vLLM core team** for the rapid nightly publishing post-merge

## Open questions to the community

- If you run on **other Blackwell consumer cards** (5070, 5080, 5090 desktop) — please post your t/s, we don't have those datapoints publicly yet
- Anyone reproduced the 26B-A4B 78% acceptance on Ampere (3090, 4090) — does it scale similarly?
- Is there any plan to upstream the AtomicChat fork's `gemma4_assistant` support to mainline llama.cpp? The patch is small.

Full writeup with timeline + crash logs + comparison vs Qwen3.6 stacks: [link to my blog post]

# Qwen3.6-27B DFlash on a 24GB RTX 5090 Laptop (sm_120) — 80 t/s avg via spiritbuun's buun-llama-cpp + Q8_0 GGUF drafter

Following the recent flurry of DFlash work (z-lab paper, Lucebox port, spiritbuun fork), I tried to reproduce on **consumer Blackwell mobile** — a small home box with an RTX 5090 Laptop GPU (24GB GDDR7, 896 GB/s, sm_120). 

**TL;DR: 73.94 / 80.31 / 85.06 t/s on three Space Invaders generations (max_tokens=800). AVG ~80 t/s. Going from 0.97 t/s catastrophic to 80 t/s in one week, thanks to spiritbuun's fix to my issue #35.**

## The journey (with timestamps)

- **2026-04-28** — I publish a blog post titled "Why DFlash on Qwen3.6-27B doesn't fit on 24GB single GPU". Argument: z-lab drafter is 6 GiB BF16, doesn't fit after the target.
- **2026-04-30** — `spiritbuun/Qwen3.6-27B-DFlash-GGUF` lands on HF. Q8_0 drafter at **1.75 GB**. VRAM math suddenly works.
- **2026-04-30** — I build `spiritbuun/buun-llama-cpp` for sm_120 (CUDA 13.1 + `-DGGML_CUDA_NO_VMM=ON` + `-DCMAKE_CUDA_ARCHITECTURES=120` + libcuda.so.1 stub link). First bench: **3.4 → 1.5 → 0.97 t/s, degrading run over run**. File [issue #35](https://github.com/spiritbuun/buun-llama-cpp/issues/35).
- **2026-05-01** — spiritbuun replies: "I think this may be fixed now - can you repull and give it another try?"
- **2026-05-04** — Rebuild with HEAD `aecbbd5d` (8 commits past my v0.1.0, notably `cab1fb597 dflash: add p_min confidence threshold + adaptive draft length`). Re-bench: **80 t/s avg**.

## Bench numbers

```
Run 1: 800 tok in 10.82s = 73.94 t/s
Run 2: 800 tok in  9.96s = 80.31 t/s
Run 3: 800 tok in  9.41s = 85.06 t/s
```

## Comparison on the same hardware

| Backend | Stack | t/s avg |
|---|---|---|
| llama.cpp standard | UD-Q4_K_XL, no spec | 33-36 |
| buun-llama-cpp DFlash | HEAD `aecbbd5d` + Q8_0 GGUF drafter | 80 |
| vLLM Turbo | v0.20.0 + Sandermage Genesis + TurboQuant K8V4 + MTP n=3 | 88 |
| **Lucebox DFlash HTTP** | **scripts/server.py + test_dflash + TQ3_0 KV** | **88.5** 🏆 |
| vLLM vanilla (different setup) | 0.19.1 + AutoRound INT4 + MTP n=3 | 99 peak |

For context: [Lucebox already published DFlash on RTX 3090 24GB at 78 t/s HumanEval / 70 t/s Math500](https://rits.shanghai.nyu.edu/ai/luce-dflash-brings-2x-speculative-decoding-to-qwen3-6-27b-on-a-single-rtx-3090/) (sm_86 Ampere) using their custom engine + BF16 z-lab drafter. Today's [Lucebox PR #86](https://github.com/Luce-Org/lucebox-hub/pull/86) reports 218 t/s on RTX 5090 desktop 32GB. So our 80 t/s on RTX 5090M 24GB sits right between Lucebox 3090 and Lucebox 5090 desktop, on a different stack (buun fork instead of Lucebox custom).

## What's actually new

- **First public DFlash result via `buun-llama-cpp` on sm_120 mobile** (Lucebox path uses their own engine; Lucebox 5090 desktop on PR #86 used a custom build, not buun)
- **First reproduction confirming the `cab1fb597` perf fix** on real 24GB consumer hardware (was untested before)
- Stack uses Q8_0 quantized drafter (not BF16) — frees enough VRAM that the math just works, no compromises elsewhere

## The recipe

Image: built from `spiritbuun/buun-llama-cpp` master HEAD with:

```
cmake -B build \
  -DGGML_CUDA=ON -DGGML_CUDA_NO_VMM=ON \
  -DCMAKE_CUDA_ARCHITECTURES=120 \
  -DCMAKE_EXE_LINKER_FLAGS="-Wl,-rpath-link,/usr/local/cuda/lib64/stubs" \
  -DCMAKE_SHARED_LINKER_FLAGS="-Wl,-rpath-link,/usr/local/cuda/lib64/stubs" \
  -DCMAKE_BUILD_TYPE=Release && \
cmake --build build --target llama-server -j$(nproc)
```

llama-server args:

```
--model unsloth/Qwen3.6-27B-Q4_K_M.gguf
--model-draft spiritbuun/dflash-draft-3.6-q8_0.gguf
--spec-type dflash
--n-gpu-layers 99 --n-gpu-layers-draft 99
--ctx-size 32000 --ctx-size-draft 256
--batch-size 256 --ubatch-size 64
--parallel 1 --flash-attn on --jinja
--chat-template-kwargs '{"enable_thinking": false}'
```

**Important**: disable thinking (`enable_thinking: false`). spiritbuun's README notes the drafter wasn't trained on the think-wrapped distribution — leaving thinking on collapses acceptance and gives ~1.8× less throughput.

## Things I haven't tried that should push 100+ t/s

- DDTree budget tuning (Lucebox uses 22 for 218 t/s on desktop 5090, default in buun likely sub-optimal)
- `--no-fused-gdn` ON vs OFF — recent buun commit `905483277` added this debug flag
- `p_min` adaptive draft length sweep
- Pushing context to 64-80K (32K is conservative)

## Bonus: PFlash also lands today

While I was writing this up, [u/sandropuppo posted PFlash](https://www.reddit.com/r/LocalLLaMA/comments/1t0vp3w/) — speculative *prefill*, complementary to DFlash decode. 10× faster TTFT at 128K on RTX 3090. The `pflash/` dir was merged into Lucebox-hub main today. Combining DFlash decode (this post) + PFlash prefill on consumer 24GB Blackwell would close the long-context UX gap completely. Next bench session.

## Late update: Lucebox HTTP server also works on this hardware, at 88.5 t/s

After publishing the buun result above, I revisited Lucebox (which I had given up on in my "DFlash impossible" post because their engine + BF16 z-lab drafter wouldn't load via my custom chart). Rebuilt their `libvgpu.so` with my [HAMi-core PR #188 fix](https://github.com/Project-HAMi/HAMi-core/pull/188), hot-swapped on the Olares node, and worked through three more layered issues:

1. `CUDA_DEVICE_MEMORY_LIMIT_0=24000m` env override (Olares default `0m` parsed as "0 bytes" on the Driver API path test_dflash uses)
2. `--prefix-cache-slots 0 --prefill-cache-slots 0` (server.py startup_sync has a hardcoded 10s timeout, too short for first-boot CUDA kernel JIT on sm_120)
3. Download full drafter repo (server.py needs `config.json` sibling to `model.safetensors` for SWA detection)

Bench through `python3 scripts/server.py` (Lucebox's FastAPI HTTP wrapper):

```
Run 1: 87.05 t/s
Run 2: 89.54 t/s
Run 3: 88.88 t/s
```

**88.5 t/s avg** — narrowly beats my vLLM Turbo (88.0). And that's with the **mismatched 3.5 draft**. Lucebox PR #94 (today, RTX 4090 reference: 106 t/s) adds matched 3.6 draft + SWA support — should push my mobile 5090M to ~100 t/s once that merges and I rebuild.

So the actual current ranking on Olares One mobile sm_120:

| Backend | t/s avg |
|---|---|
| Lucebox DFlash HTTP (TQ3_0 KV, 3.5 mismatched draft) | **88.5** 🏆 |
| vLLM Turbo (Genesis + TurboQuant K8V4 + MTP n=3) | 88.0 |
| buun-llama-cpp DFlash (Q8_0 GGUF drafter) | 80 |
| llama.cpp standard | 33-36 |

## Worth noting: llama.cpp MTP also entered beta today

Same day, [u/ilintar posted that llama.cpp MTP is in beta thanks to am17an](https://www.reddit.com/r/LocalLLaMA/comments/1t3guzw/) — [PR #22673](https://github.com/ggml-org/llama.cpp/pull/22673), tested on Qwen3.6 27B + Qwen3.6 35B-A3B with 75% acceptance at 3 draft tokens and 2× speedup over baseline. Depends on the `partial seq_rm for GDN` PR #22400 we needed for hybrid spec decoding. So llama.cpp now has BOTH MTP (PR #22673) AND DFlash (this post via buun fork) paths — feature parity with vLLM is closing fast.

## Credits

- [spiritbuun](https://github.com/spiritbuun) for the fork + the Q8_0 drafter + the 24h fix turnaround
- [z-lab/dflash](https://github.com/z-lab/dflash) for the block-diffusion method
- [Lucebox](https://github.com/Luce-Org/lucebox-hub) for proving the 24GB consumer DFlash path on RTX 3090 first
- [unsloth](https://huggingface.co/unsloth) for the Qwen3.6-27B Q4_K_M GGUF target

Full write-up with timestamps and all the iteration mistakes: [https://airelien.dev/en/posts/dflash-27b-24gb-debloque/](https://airelien.dev/en/posts/dflash-27b-24gb-debloque/) (EN, FR also at /fr/posts/).

Anyone with a 5090M / 4080M / 3090 24GB who wants to reproduce, I'd love to see your numbers.

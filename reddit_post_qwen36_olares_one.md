# Qwen3.6-27B at 85-100 t/s on a 24GB RTX 5090 Laptop GPU — vLLM + MTP n=3, adapted from the 32GB recipes

Following [u/Kindly-Cantaloupe978's 80 t/s @ 218K context post](https://www.reddit.com/r/LocalLLaMA/comments/1sv8eua/qwen3627b_at_80_tps_with_218k_context_window_on/) and [Wasif Basharat's 85 t/s Medium write-up](https://medium.com/@fzbcwvv/an-overnight-stack-for-qwen3-6-27b-85-tps-125k-context-vision-on-one-rtx-3090-0d95c6291914), I tried to reproduce on my Olares One — a small home-AI box with an **RTX 5090 Laptop GPU (24GB, ~896 GB/s, sm_120 Blackwell)**, not the 32GB desktop card.

After several iterations: **~85-100 t/s sustained, peaks at 99.7 t/s, 75K max context, MTP n=3 with 92-95% acceptance once warm.** That's roughly 3x faster than llama.cpp on the same hardware (33-36 t/s with the best NVFP4 GGUF) and matches/beats the 32GB desktop references.

## TL;DR numbers

| Setup | Hardware | t/s |
|---|---|---|
| llama.cpp UD-Q4_K_XL or NVFP4 GGUF | RTX 5090M 24GB | 33-36 |
| vLLM v0.17 NVFP4 (no MTP) | RTX 5090M 24GB | 39 |
| vLLM v0.19.1 NVFP4 + MTP n=1 | RTX 5090M 24GB | OOM (model OK, MTP head 2.37 GiB doesn't fit) |
| **vLLM 0.19.1 + Lorbus AutoRound + MTP n=1** | RTX 5090M 24GB | 65 |
| **vLLM 0.19.1 + Lorbus AutoRound + MTP n=3** | RTX 5090M 24GB | **85-100** |
| Reference: same recipe on 5090 desktop 32GB | RTX 5090 32GB | 78-80 |
| Reference: Wasif's stack on 3090 24GB | RTX 3090 24GB | 85 |

## Five gotchas specific to 24GB Blackwell mobile

**1. NVFP4 + MTP = OOM on 24GB**

I tried `sakamakismile/Qwen3.6-27B-Text-NVFP4-MTP` first. NVFP4 is 2x FP8 throughput on Blackwell tensor cores, and the model name says it includes MTP. Loaded fine, but:

```
torch.OutOfMemoryError: Tried to allocate 2.37 GiB. GPU has 2.25 GiB free.
```

Same issue Wasif documents. vLLM's `Qwen3_5MTP` loader allocates a fresh 2.37 GiB BF16 buffer for `mtp.fc` because NVFP4 quantizes everything in the file. On 32GB it fits, on 24GB it doesn't.

Fix: switch to `Lorbus/Qwen3.6-27B-int4-AutoRound`, which dequantizes only `mtp.fc` to BF16 in the file (~280 MiB). vLLM finds it on disk, no fresh buffer.

Trade-off: AutoRound INT4 uses Marlin kernels (Ampere-tuned) instead of native NVFP4 tensor cores. But MTP n=3 brings way more speed than NVFP4 acceleration would have on a bandwidth-bound consumer card.

**2. `--kv-cache-dtype fp8_e5m2` rejected with NVFP4 checkpoints**

```
ValueError: fp8_e5m2 kv-cache is not supported with fp8 checkpoints.
```

AutoRound INT4 isn't FP8 family, so `fp8_e5m2` works there. Bonus: it gives more KV pool than `fp8_e4m3` (Olares One ends up with 23,760 cached tokens with fp8_e5m2 + gpu-mem-util 0.97).

**3. PR vllm#36325 (Blackwell TMA fix) is mandatory on sm_12x**

Without it, Triton autotuner OOMs at warmup. `is_tma_supported` returns True for any compute capability ≥9 but Blackwell consumer doesn't really do TMA — descriptor buffer allocations blow up VRAM. PR caps at `< 12`. 4-line patch I cherry-picked into a custom image.

**4. `patch_tolist_cudagraph.py` is now public**

The previously-private patch from Wasif's article is now in [noonghunna/qwen36-27b-single-3090/patches/](https://github.com/noonghunna/qwen36-27b-single-3090). 165 lines, fixes a `.tolist()` CPU sync that breaks CUDA graph capture during warmup's continuation-chunk simulation when spec-decode + chunked-prefill combine. Required even with fp8 KV (not just TurboQuant).

**5. MTP n=3 actually fits on 24GB with Lorbus**

I expected n=3 to OOM (Wasif's article warns about it on 24GB with sakamakismile). With Lorbus's dequantized `mtp.fc` and `--gpu-memory-utilization 0.97`, n=3 fits fine. Acceptance length peaks at 3.86/3.0 (98%/96%/92% per-position), generation throughput peaks at 99.7 t/s.

## The recipe

Custom Docker image (FROM `vllm/vllm-openai:v0.19.1-cu130`):

- Apply `vllm-project/vllm#36325.diff` at build time
- Mount `patch_tolist_cudagraph.py` and run it before `vllm serve` via entrypoint wrapper

vLLM args:

```
--model Lorbus/Qwen3.6-27B-int4-AutoRound
--quantization auto_round
--dtype float16
--attention-backend flashinfer
--kv-cache-dtype fp8_e5m2
--max-model-len 75000
--gpu-memory-utilization 0.97
--max-num-seqs 1
--max-num-batched-tokens 2048
--language-model-only
--enable-prefix-caching
--enable-chunked-prefill
--enable-auto-tool-choice
--tool-call-parser qwen3_coder
--reasoning-parser qwen3
--speculative-config '{"method":"mtp","num_speculative_tokens":3}'
```

Env:

```
VLLM_USE_FLASHINFER_SAMPLER=1
VLLM_MEMORY_PROFILER_ESTIMATE_CUDAGRAPHS=1
VLLM_ALLOW_LONG_MAX_MODEL_LEN=1
VLLM_MARLIN_USE_ATOMIC_ADD=1
VLLM_FLOAT32_MATMUL_PRECISION=high
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,max_split_size_mb:512
NCCL_CUMEM_ENABLE=0
NCCL_P2P_DISABLE=1
OMP_NUM_THREADS=1
CUDA_DEVICE_MAX_CONNECTIONS=8
```

## Live metrics (steady state)

```
Avg generation throughput: 85-100 t/s (variance with content)
Peak: 99.7 t/s
Mean acceptance length: 3.20 → 3.86 (out of 3 max)
Per-position acceptance: 98%/93%/88%
Avg draft acceptance rate: 92-95%
Model loading: 16.87 GiB
KV pool: 23,760 tokens (3.24 GiB)
KV cache usage during generation: 21-31%
```

## Notes

- **Variance**: speeds drop to 65-70 t/s on creative/transition text where MTP acceptance falls to ~70%, climb back to 95+ t/s on predictable patterns (boilerplate code, structured output). Same "MTP variance" Wasif documents.
- **Why we beat the 32GB references**: probably the combination of Lorbus + flashinfer + chunked-prefill at n=3 lands well, and the laptop card's lower bandwidth is masked by the high MTP acceptance. Bandwidth math: 60% of desktop 5090 (896 vs 1500 GB/s) → ceiling ~50 t/s without spec, ×~2 acceptance length → ~100 t/s achievable, which is what we see.
- **Could NVFP4 still help?** If anyone publishes a Qwen3.6-27B NVFP4 quant with `mtp.fc` dequantized in the file (Lorbus-style trick applied to NVFP4 instead of AutoRound), 24GB Blackwell mobile would likely push past 100 t/s. The 2x tensor core speed would compound with MTP n=3.

## Credits

- u/Kindly-Cantaloupe978 for the Reddit recipe on 5090 32GB
- [Wasif Basharat](https://medium.com/@fzbcwvv) for the Medium write-up on 3090 24GB
- [noonghunna/qwen36-27b-single-3090](https://github.com/noonghunna/qwen36-27b-single-3090) for publishing the patches
- [vllm-project/vllm#36325](https://github.com/vllm-project/vllm/pull/36325) for the Blackwell TMA fix
- Lorbus for the AutoRound quant with the dequantized MTP head trick

Happy to share the custom Dockerfile or the Helm chart if it helps anyone running on consumer Blackwell mobile. Curious if other 5090M / 4080M / 3090 24GB owners can reproduce these numbers.

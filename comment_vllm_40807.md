Adding a 4th hardware datapoint to the thread — **NVIDIA RTX 5090M Laptop GPU (sm_120 Blackwell consumer mobile, 24 GB GDDR7)** on an Olares One device. The bug reproduces here too. Tested two stacks today (2026-05-06) against the same baseline.

### Test setup

- **Model**: `Lorbus/Qwen3.6-27B-int4-AutoRound`
- **vLLM image**: `vllm/vllm-openai:gemma4-0505-cu130` — main HEAD post #39931 (commit `9b4e83934`, vLLM `0.20.2rc1.dev49`)
- **Config**: `--kv-cache-dtype turboquant_k8v4 --speculative-config '{"method":"mtp","num_speculative_tokens":3}' --max-model-len 88000 --enable-chunked-prefill --enable-prefix-caching --gpu-memory-utilization 0.97`
- **Bench prompt**: 3× standard "Write a Space Invaders HTML game" (~70-token prompt, 800 max_tokens, temp=0.6, top_p=0.95)
- **Baseline**: same model + same flags running on the Genesis-patched image (28 patches + `disable_p8.py`, vLLM v0.20.0) — gets 88 t/s avg on this hardware.

### Result 1 — vanilla main HEAD + `--enforce-eager` (no patches)

After hitting two issues:
1. HAMi-core `CUDA_DEVICE_MEMORY_LIMIT_0=0m` parsing bug crashed `EagleProposer.__init__` at `torch.zeros(...)` → `RuntimeError: CUDA driver error: invalid argument`. Workaround: override `CUDA_DEVICE_MEMORY_LIMIT_0=24000m`. (FYI for the thread — not a vLLM issue, but Olares devices set this env var by default and any TurboQuant + MTP stack will hit it on the drafter alloc path. Worth noting since this issue's hardware list is mostly Olares-style consumer Blackwell.)
2. The `query_start_loc.tolist()` CUDA graph capture crash described in this issue.

Workaround `--enforce-eager` boots successfully and TurboQuant-hybrid is detected exactly as #39931 designed:

```
INFO config.py:195 TQ hybrid: full-attention layers [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59, 63]
INFO Resolved architecture: Qwen3_5MTP
INFO Using TURBOQUANT attention backend out of potential backends: ['TURBOQUANT'].
INFO Mamba cache mode is set to 'align' for Qwen3_5ForConditionalGeneration when prefix caching is enabled
```

Bench:

| Run | Tokens | Elapsed | t/s |
|---|---|---|---|
| 1 | 800 | 11.12s | 71.97 |
| 2 | 800 | 10.84s | 73.81 |
| 3 | 800 | 11.13s | 71.87 |

**AVG = 72.55 t/s** (range 71.87 – 73.81). That's **−17.5% vs 88 t/s Genesis baseline** on the same hardware/model — consistent with @Sandermage's expected "between cudagraph=ON broken and cudagraph=NONE correct" range.

### Result 2 — vanilla main HEAD + Patch 65 alone (no `--enforce-eager`)

Curious whether dropping `--enforce-eager` and applying just @Sandermage's P65 (3-line `get_cudagraph_support` classmethod override on `TurboQuantMetadataBuilder`) would buy back the CUDA graphs for the 1-token decode path. Inline-patched the file at container start via initContainer-style text-patch.

Boot phase, all green:
```
P65 applied: TurboQuantMetadataBuilder.get_cudagraph_support added
WARNING [compilation.py:1390] CUDAGraphMode.FULL_AND_PIECEWISE is not supported with spec-decode for attention backend TurboQuantAttentionBackend (support: AttentionCGSupport.UNIFORM_SINGLE_TOKEN_DECODE); setting cudagraph_mode=PIECEWISE
Capturing CUDA graphs (mixed prefill-decode, PIECEWISE): 100%|██████████| 4/4
init engine took 100.32 s (compilation: 39.30 s)
Application startup complete.
```

vLLM correctly picks up the patched `get_cudagraph_support`, downgrades to PIECEWISE, captures cleanly. `READY 1/1`, `/health 200 OK`.

But on the **first /v1/chat/completions request**, EngineCore dies:

```
File ".../vllm/v1/attention/backends/turboquant_attn.py", line 862, in _decode_attention
    current_workspace_manager().get_simultaneous(...)
File ".../vllm/v1/worker/workspace.py", line 157, in _ensure_workspace_size
    raise AssertionError(
AssertionError: Workspace is locked but allocation from
'turboquant_attn.py:862:_decode_attention' requires 0.76 MB,
current size is 0.00 MB. Workspace growth is not allowed after locking.
```

This matches @Sandermage's earlier description of the *profiler-invisible `torch.empty` inside `_continuation_prefill`* — the allocation that profile_run misses, which Patches 22 + 38 (shared dequant + persistent 4-D K/V workspace prealloc) address. P65 fixes the CUDA graph capture path correctly, but the workspace lock issue is independent and bites at first inference.

### Implications for upstreaming

P65 alone is necessary but not sufficient. From this run, a minimum upstream-able set on Blackwell consumer would be:
- **P65** (3 lines, the `get_cudagraph_support` classmethod) — clean, isolated, low-risk
- **P22 + P38** (workspace prealloc family) — non-trivial, larger surface
- Possibly **P44** (TQ mixed attn out buf, capture-safe reuse) for full robustness

So the original "extract P23 + P44 to upstream PR" plan @Sandermage proposed earlier in this thread might need to grow into a small series — perhaps three PRs filed independently to keep each reviewable: (1) the P65 classmethod, (2) the workspace prealloc, (3) any remaining bits.

### Offer

Happy to test any combination of patches on Olares One RTX 5090M mobile (sm_120, 24 GB) — Blackwell consumer mobile is currently the least-represented configuration in this thread, and our bench harness produces consistent ±2% numbers. If @Sandermage extracts the workspace-prealloc family, I can run the full pack and post the t/s back here.

Thanks to @noonghunna for filing this with such a clean reproducer, and to @Sandermage for documenting the root cause + maintaining the workaround patch tree publicly. Also @JartX for landing #39931 — even if it's not the full fix, the hybrid TurboQuant detection working natively is a real upgrade (no more `NotImplementedError` on Mamba layers).

— Aurélien (aamsellem)

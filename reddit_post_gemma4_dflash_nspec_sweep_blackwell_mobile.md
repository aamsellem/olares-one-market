# Draft Reddit post — r/LocalLLaMA

**Suggested title:** Full n_spec sweep on Gemma 4 26B-A4B + DFlash on RTX 5090M mobile: optimal is n=8 (NOT n=15 like desktop), and I found a weird 5-fast/4-slow degradation cycle

---

## Body

I run a single-user, single-GPU setup on an Olares One device (RTX 5090M Laptop — 24GB GDDR7, 896 GB/s, sm_120 Blackwell consumer mobile, Core Ultra 9 275HX, 96GB DDR5). I've been benching Gemma 4 26B-A4B + z-lab DFlash drafter via vLLM and wanted to verify the Tech-Practice article's n_spec=15 recommendation (228→600 t/s sweep on RTX 5090 desktop 32GB).

TL;DR: **on mobile 5090M, peak is at n_spec=8, not n=15. And there's a reproducible degradation cycle I couldn't fix.**

### Stack

- vLLM `tokenspeed-preview-x86_64-ubuntu2404` (0.20.2rc1.dev67+g58c8a5eaa)
- Target: `cyankiwi/gemma-4-26B-A4B-it-AWQ-4bit` (compressed-tensors WNA16-Marlin, ~17.5 GB)
- Drafter: `z-lab/gemma-4-26B-A4B-it-DFlash` (~860 MB)
- KV cache: fp8
- Attention backend: `triton_attn` (Gemma 4 head_dim hetero + multimodal forces this — `flash_attn` errors with `partial multimodal token full attention not supported`)
- max-num-seqs 4, max-num-batched-tokens 8192, gpu-memory-utilization 0.92, --enable-prefix-caching

### Methodology

Space Invaders HTML prompt, 2000 tokens, temp 0.6, top_p 0.95. 2 warmups + 3-10 measured runs.

### n_spec sweep

| n_spec | Stable AVG | MAX |
|--------|-----------|-----|
| 6 | 220.61 | 225.95 |
| **8** | **223.90** | **235.22** ← peak |
| 10 | ~215 | 222 |
| 11 | 212.25 | 217.66 |
| 12 | ~202 | 207 |
| 13 (was prior default) | ~207 | 213 |
| 15 (Tech-Practice rec) | 201.39 | 211 |
| 17 | ~194 | 196 |
| 20 | 187.33 | 196 |

The Tech-Practice n=15 sweet spot is for desktop 5090 32GB (1.79 TB/s bandwidth). Mobile 5090M (24GB, 896 GB/s = ~50% bandwidth) wants shallower drafts. Compute buffer per spec token consumes proportionally more VRAM, and deeper drafts past n=8 cost more than they save.

**Peak ceiling on mobile = ~235 t/s** (1-token MAX), stable AVG ~224.

### The weird part: reproducible degradation cycle

After picking n=8, I ran 10-run extended bench to validate. Found this:

```
run1:  221 t/s ← fast
run2:  214 t/s
run3:  218 t/s
run4:  222 t/s
run5:  230 t/s
run6:  103 t/s ← transition
run7:   59 t/s ← DEGRADED (=vanilla decode, no spec)
run8:   62 t/s
run9:   62 t/s
run10: 212 t/s ← recovered
```

Exactly 5 fast → 4 slow → recovery. Reproducible across boots. The 60 t/s figure matches what we'd expect from no-spec-decoding decode on Gemma 4 26B-A4B — DFlash is being temporarily disabled.

**Workarounds I tried (none fix):**
- `--enable-prefix-caching` OFF → same cycle
- `--max-num-seqs 1` (we're single-user anyway) → same cycle
- `--enforce-eager` → cycle delayed from run 6 to run 9, but eager also caps perf at ~130 t/s
- `--no-enable-chunked-prefill` → boot fails (max_num_batched_tokens 8192 < max_model_len 16384)

The cycle is deterministic enough that it can't be GPU thermal. It's some periodic internal vLLM state machine — possibly KV cache compaction, drafter state reset, or adaptive spec acceptance throttling kicking the request count past N. Best guess: cudagraph re-capture, but eager confirmed it's not the only factor.

**Real-world impact:** single-user throughput cycles between 220 t/s peak and 60 t/s degraded. Long-session AVG ≈ 160 t/s instead of the 224 peak.

### Open questions

Anyone else seeing this with vLLM + DFlash on Gemma 4 (or other targets)? Specifically interested if:
1. The cycle goes away on a newer vLLM image with PRs #41703 / #42102 / #40898
2. It's only on consumer Blackwell (sm_120) or also on H100/A100 with DFlash
3. There's a config flag I'm missing

I'll probably file a vLLM issue with the repro tonight.

---

**Hardware:** Olares One (RTX 5090M 24GB, 896 GB/s, sm_120 Blackwell mobile)
**Image:** `vllm/vllm-openai:tokenspeed-preview-x86_64-ubuntu2404`
**App chart (open source):** https://github.com/markus-albrecht/olares-one-market/tree/main/vllmgemma4dflashone — v1.0.4 ships with n_spec=8

Edit: also released a complementary app today: `llamacppgemma4audione` (Gemma 4 E4B + native audio input via USM Conformer encoder, llama.cpp PR #21421 merged April 12). Uses BF16 mmproj (F16/Q8_0 are known to produce repetitive output). ~6 GB VRAM, ASR + audio understanding.

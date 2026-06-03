# Discord post — Olares (May 14, 2026)

---

**🔥 New Qwen3.6 27B record on Olares One: 107 t/s at FULL 262K context**

Hey team! Quick drop this morning on what is now the **fastest AND longest** stack to run Qwen3.6 27B locally on an Olares One (RTX 5090M 24GB, sm_120 Blackwell consumer mobile).

**📊 Bench**

10 clean runs at FULL 262K context:
• **107.54 t/s AVG** (range 101.70 → 119.38)
• ZERO CUDA OOM
• ZERO degradation cycle (unlike the Gemma 4 DFlash bug I posted last week — none of that here)

Full context sweep:

```
 96K → 106.67 t/s
128K → 116.00 t/s  ← sweet spot, reason unknown
200K → 108.50 t/s
262K → 107.54 t/s  ← maximum native context
```

Perf is **flat** across the entire range. The turbo3 KV cache (3-bit Walsh-Hadamard rotated) compresses aggressively enough that even at 262K the whole stack fits in 24 GB with headroom.

**⚔️ Vs my previous records on the same hardware**

| Path | Context | t/s |
|------|---------|-----|
| **BeeLlama (new)** | **262K FULL** | **107.54** |
| vLLM Genesis Turbo | 88K | 88 |
| buun-DFlash | 96K | 76 |
| llama.cpp MTP | 262K | 72.75 |

→ **+48% vs MTP at same 262K**
→ **+22% vs vLLM Genesis Turbo** (at 1/3 the context)
→ **+40% vs buun-DFlash** (at much less context)

**🛠️ Stack**

• Image: `aamsellem/beellama-cpp:0.1.1` (custom amd64 + CUDA 13 + sm_120 build of Anbeeld/beellama.cpp v0.1.1, ~50 min via qemu on Mac arm64)
• Target: `unsloth/Qwen3.6-27B-GGUF` UD-Q3_K_XL (14.5 GB) — **NOT the MTP-baked variant**
• Drafter: `spiritbuun/Qwen3.6-27B-DFlash-GGUF` dflash-draft-3.6-q8_0 (1.85 GB)
• KV cache: turbo3
• Spec: `--spec-type dflash --spec-dflash-cross-ctx 1024`
• Batch 2048 / ubatch 256, flash-attn on, mlock, no-mmap

Fork chain: ggml-org/llama.cpp → TheTom/turboquant → spiritbuun/buun → Anbeeld/beellama

**⚠️ Gotchas**

1. If you have the havenoammo MTP-baked GGUF already cached, BeeLlama refuses to load it (`expected 866, got 862` tensors). Use unsloth's non-MTP variant.
2. Multi-GPU broken in this fork (issue #7). Single-GPU only — fine for Olares One.
3. BeeLlama hasn't synced master since April 23. Post-b9130 llama.cpp builds won't reach this fork until Anbeeld rebases.

**📦 How to install**

Shipped as `llamacppqwen36beellamaone` v1.0.1 on my market source:
`https://orales-one-market.aamsellem.workers.dev`

(Olares Studio → Market → Settings → Add source, then search "Qwen36 27B BeeLlama One")

**📰 Full write-up**

Build process, analysis of the 3 factors driving the +48% vs MTP, detailed comparisons:
https://blog.aamsellem.com/en/posts/beellama-cpp-262k-blackwell-mobile/

**❓ Open questions to the community**

• If anyone runs Qwen3.6 27B on another sm_120 card (5070 Ti, 5080, 5090 desktop) — the `aamsellem/beellama-cpp:0.1.1` image should work as-is. Post your numbers! 5090 desktop should land 150-180 t/s if my mobile→desktop scaling holds.

• The 128K sweet spot (116 t/s) is reproducible on my end but weird. Anyone with a similar setup seeing the same?

• Has anyone tested CopySpec (BeeLlama's unique addition over buun) on structured-output workloads (JSON tool-calling, replay)? My HTML bench is the wrong workload for that.

See you soon! 🚀

# Discord reply to Marc — round 2 (use case clarified)

**Context** : Marc replied explaining his actual use case (office workhorse, 2-3 concurrent users, 128K+ ctx, vision, >100 t/s) and explicitly asks to keep `vllmgemma426ba4bvisionone` shipped — he just needs the context bump.

---

## Draft (English)

```
Got it — that use case framing helps a lot. PagedAttention + multi-user + long PDF + vision is exactly what vLLM does best, so we're aligned on the choice. Let me push the context ceiling on the existing app and report back with the actual measured limit.

Quick math on Gemma 4 26B-A4B + cyankiwi AWQ + fp8 KV on 24 GB:
- Model loaded: ~16.6 GB
- vLLM compute reserve (cudagraph, runtime): ~3-5 GB
- Available for KV cache: ~3-4 GB
- fp8 KV per token for Gemma 4 hybrid (mixed SSM + attn layers): ~80-100 KB

That gives a theoretical ceiling around 30-40K context for single-user, lower for 2-3 concurrent slots (each slot reserves its own KV budget). 128K on a single 24 GB GPU with this stack is genuinely not reachable without going to NVFP4 (would save ~5 GB on the model) or going to a Gemma 4 quant smaller than AWQ-4bit (Q3 or below — quality drop).

I'm running a context ceiling test right now on the live pod. Will report back with the actual max_model_len that boots clean + serves the Space Invaders bench at >100 t/s with 2-3 concurrent slots. My guess is 32K is safe, 48K likely, 65K tight, 128K OOM.

On NVFP4 — Kimi K2.6 NVFP4 release from NVIDIA two days ago is the strongest signal yet that NVFP4 is becoming production-grade for external models. NVIDIA documented quality essentially equal to INT4 baseline on six benchmarks (GPQA Diamond, SciCode, τ²-Bench Telecom, MMMU Pro, AA-LCR, IFBench). When a Gemma 4 26B-A4B-NVFP4 ships (likely either NVIDIA themselves or unsloth doing a community port), we'd save ~5 GB on the model footprint, freeing ~5 GB more for KV cache — that's the 128K path on 24 GB. I'm watching the relevant HF spaces for that drop.

On FlashInfer SM120 cubins (your other note) — same story, still waiting on 0.6.12 release. Once that lands, NVFP4 inference on consumer Blackwell mobile will be unlocked across the stack, not just for foundation models.

Keeping vllmgemma426ba4bvisionone v1.0.0 shipped as-is. Will publish a v1.0.1 with whatever max context is safely achievable today (probably ~48K-65K range), and a v1.0.2 once NVFP4 lands.

For your immediate workflow: if 16K is genuinely blocking and you can accept slightly lower throughput, try also the new llamacppqwen36beellamavisionone v1.0.0 I just shipped (~106 t/s @ 200K with vision, llama.cpp path so single-user oriented — not as good as vLLM for 2-3 concurrent but the 200K context might cover your PDF use case until the Gemma 4 vLLM path can match it).

Cheers
```

## Why this works

- **Validates his use case** without re-litigating choices
- **Honest math** on why 128K isn't reachable today
- **Concrete promise**: v1.0.1 with measured max context coming
- **Bridge solution**: llamacppqwen36beellamavisionone v1.0.0 (200K + vision) as workaround until vLLM Gemma 4 can hit 128K
- **Roadmap**: NVFP4 + FlashInfer dependencies clearly identified

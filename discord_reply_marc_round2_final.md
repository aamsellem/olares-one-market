# Discord reply à Marc — round 2 FINAL (128K validated + shipped)

**Context** : Marc replied explaining his office workhorse use case (2-3 concurrent users PagedAttention, 128K+ ctx, vision, >100 t/s). He asked to keep vllmgemma426ba4bvisionone and just push the context. Tested + shipped v1.0.1 with 128K context.

---

## Draft (English, ready to paste)

```
Hey Marc, just pushed vllmgemma426ba4bvisionone v1.0.1 with the exact spec you described. Should be in your market within a minute.

Validated bench on Olares One:
- max_model_len: 16384 → 131072 (128K — your target hit exactly)
- gpu_memory_utilization: 0.85 → 0.92 (needed for the larger KV cache)
- 10-run AVG: 135.85 t/s @ 128K context (range 135.52-136.06, range 0.54)
- Zero throughput regression vs v1.0.0 16K (which was 135.97 t/s, range 0.56)

So 8× the context for zero perf cost. The KV math worked out because vLLM's fp8 KV cache compression is genuinely effective on Gemma 4 hybrid arch — bandwidth pressure stays manageable. Your spec (vision + 128K + >100 t/s + PagedAttention for 2-3 users) is fully covered now without waiting for NVFP4.

A few notes for production deployment:
- max_num_seqs is set to 4 in the chart, which gives you 2-3 concurrent users comfortably while leaving one slot for system tasks. Bump to 6 if you actually need 5+ concurrent.
- max-num-batched-tokens is 8192 — caps total tokens processed per scheduler step across all slots. Standard vLLM value.
- enable-prefix-caching is on. For your PDF workflow with repeated header/footer content across documents, this should give massive cache hits — first PDF in a batch processes fresh, subsequent ones with shared context hit the prefix cache.

NVFP4 still on the watchlist for v1.0.2 — would free another ~5 GB which could push max_model_len to ~250K+ if you ever need it for very long doc batches. But for now you have the production-grade office workhorse spec running on a 24 GB consumer Blackwell mobile, which is genuinely a sweet spot.

Cheers
```

## Why this works
- **Concrete delivery**: not "I'll try" but "shipped, here are the numbers"
- **Validates his hypothesis**: vLLM fp8 KV is the answer (no need for turbo3 or NVFP4 NOW)
- **Production-ready details**: max_num_seqs, prefix caching, batched tokens — speaks his "office workhorse" framing
- **Future roadmap intact**: NVFP4 still on the watchlist for v1.0.2 (longer context if ever needed)
- **Concise** (~250 words, paste-ready)

# Discord post — paste this directly (Discord-compatible markdown)

---

Hey folks! Sharing a few results from this week on my Olares One — fellow LLM tinkerer here, just trying to push what fits on the RTX 5090M 24GB.

🏆 **The genuinely new thing: Gemma 4 MTP works on Blackwell consumer mobile**

Three stacks tested, all reproducible:

- **Gemma 4 E2B + MTP** via llama.cpp + Atomic Chat fork → **206 t/s**, 61% draft acceptance
- **Gemma 4 E4B + MTP** via vLLM nightly + PR #41745 → **178 t/s**, 77% acceptance (24h after upstream merge — pretty wild)
- **Gemma 4 26B-A4B + MTP** via llama.cpp + Atomic Chat fork → **140 t/s**, 78% acceptance — beats AtomicChat's own M5Max reference (138 t/s)

26B-A4B at 140 t/s with 78% acceptance is the most useful one for me — MoE Gemma 4 (3.8B active of 26B) extracts a lot from the 5090M's bandwidth, you get 26B-class quality at 6B-class latency.

📜 **New: a Qwen 3.6 27B *long context* option (next to the fast one I shared earlier)**

Quick FYI in case you remember the Qwen 3.6 27B Fast app I shared a while back (vLLM Turbo + Genesis stack, ~88 t/s steady, capped at 88K context on 24GB):

I added a sibling app focused on **long context** — same hardware, 128K context, ~65 t/s steady-state. It's llama.cpp + PR #22673 + froggeric's MTP-GGUF. The 262K native context is technically possible if you switch to a lighter quant (IQ4_XS or IQ3_M) — I've stuck to Q4_K_M @ 128K for the chart default.

Not a speed revolution (you stay around 65-90 t/s either way), but if you do agentic coding on big codebases or RAG with long retrieved context, the second app finally lets you fit it.

⚠️ **Honest disclaimer on the Qwen 3.6 27B speed**

I tried *a lot* this week to push the Fast app above 88 t/s on 24GB, and couldn't get a real gain. What I tested (all roughly equivalent or worse):

- vLLM main HEAD with PR #39931 *no-Genesis* → 72 t/s (−17% vs Genesis baseline, CUDA graph capture still broken without Patch 65)
- vLLM main HEAD + Sandermage Patch 65 alone → crashes at workspace lock on first inference (needs Patch 22 + 38 too, which aren't upstreamed yet)
- Lucebox v1.9.0 (PR #94 matched 3.6 SWA draft + PR #99 consumer Blackwell fix) → 69 t/s — regression vs 88 t/s reference from May 4, can't isolate the cause (PR #99, fa_window, KV format all eliminated; suspect environment regression)
- Bumping Fast to 128K context → vLLM caps practical max at 88704 tokens with current TurboQuant K8V4 + MTP n=3 (OOM beyond)
- Genesis P5B (KV pad-smaller-to-max) → CUDA OOM continuation prefill on 24GB

So the *fast* path stays at ~88 t/s steady. The *new* axis worth showing is the long-context tradeoff (65 t/s @ 128K via llama.cpp + MTP).

I also cleaned out 4 redundant / broken Qwen 3.6 27B variants from my market source (Lucebox DFlash, buun-llama-cpp DFlash, vLLM 0.19.1 vanilla, llama.cpp NVFP4+ngram) — too many options, hard to choose.

🛠️ **Bugs I hit + workarounds (might save you time)**

1. **HAMi `0m` parsing bug** — Olares default `CUDA_DEVICE_MEMORY_LIMIT_0=0m` → HAMi-core parses as "0 bytes" → CUDA allocations crash on the `EagleProposer.__init__` path under spec decoding. Workaround: env `CUDA_DEVICE_MEMORY_LIMIT_0=24400m` in your pod. Affects vLLM AND llama.cpp with MTP.

2. **vLLM Turbo + `--prefix-caching-hash-algo xxhash`** = `ModuleNotFoundError: xxhash` after a few requests (the Genesis-patched image doesn't ship the package). Drop the flag, default sha256 works.

3. **Genesis `P5B` (`GENESIS_ENABLE_P5B_KV=1`)** triggers CUDA OOM during continuation prefill on 24GB. Combined with P38 buffer prealloc, it overflows the HAMi cap. Keep disabled.

📦 **Where to find it**

My market source: `https://orales-one-market.aamsellem.workers.dev`
(Olares Studio → Market → Settings → Add source)

Apps available:
- **Qwen36 27B Fast** — vLLM Turbo + Genesis (88 t/s, 88K)
- **Qwen36 27B Long Context** — llama.cpp + MTP (65 t/s, 128K)
- **Gemma 4 E2B Voice Brain** — atomic-llamacpp, 206 t/s
- **Gemma 4 26B-A4B One** — atomic-llamacpp, 140 t/s

📰 **Detailed writeups (with crash logs, configs, comparison)**

- Gemma 4 MTP first Blackwell consumer mobile bench: <https://airelien.dev/posts/gemma4-mtp-first-blackwell-mobile-bench>
- Comprehensive recap of the week: <https://airelien.dev/posts/olares-one-bench-week-blackwell-consumer-mobile>

❓ **Anyone else?**

- If you run on **other Blackwell consumer cards** (5070, 5080, 5090 desktop) — Gemma 4 MTP t/s? I'd love datapoints.
- Lucebox v1.6.0+ users on Olares One: are you still getting 88+ t/s, or have you also seen the regression to ~69 t/s I saw between May 4 and May 7?
- Anyone packaging non-LLM apps for Olares (Postiz, n8n alternatives, etc.) — looking for tips before I scope my next chart.

Cheers!

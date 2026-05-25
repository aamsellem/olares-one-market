# Olares One Market

A curated app store for the **Olares One** — the first Olares hardware device, packing an RTX 5090M (24 GB GDDR7), 96 GB DDR5, and a 24-core Intel Core Ultra 9 275HX into a compact form factor.

Every app here is hand-tuned for this exact hardware. No generic configs — just the fastest possible inference on a single 24 GB consumer GPU.

> **One-click install.** Add the market source, and apps appear in your Olares Market alongside the official catalogue.

## Quick Start

Add this URL as a market source in **Olares Market → Settings → Add Source**:

```
https://orales-one-market.markus-albrecht.workers.dev
```

Apps show up within 5 minutes. Install like any other Olares app — models download automatically on first launch.

## The Qwen 3.6 27B trio

Three configs of the same model, each tuned for a different trade-off. Pick the one that matches your workload.

| App | Speed | Context | Stack |
|-----|-------|---------|-------|
| **vllmqwen36turbo27bone** | **88 t/s** | 88K | vLLM + Genesis 28-patch + TurboQuant K8V4 + MTP n=3 |
| **llamacppqwen36mtpone** v1.0.8 | **72.75 t/s stable** | **262K** | llama.cpp am17an MTP branch + unsloth UD-Q3_K_XL + MTP n=5 |
| **llamacppqwen36dflashone** | 76 t/s | 96K | buun-llama-cpp + spiritbuun DFlash drafter + turbo3 KV |

For chat and quick coding the Turbo Fast app wins. For long-context work (codebase analysis, doc Q&A) the Long Context app holds the full 262K native window with **zero CUDA OOM** — runtime-stable validated 2026-05-12, 10 clean runs. v1.0.5 (havenoammo Q3) had reproducible runtime OOM in MTP draft; v1.0.7 (havenoammo Q2) fixed it at -8% quality; v1.0.8 (unsloth Q3) restores Q3 quality without OOM.

## Gemma 4 — fastest path

| App | Speed | Notes |
|-----|-------|-------|
| **vllmgemma4dflashone** v1.0.4 | **224 t/s avg / 235 peak** | vLLM tokenspeed-preview + cyankiwi AWQ + z-lab DFlash, **n_spec=8** (mobile-tuned, not the desktop n=15) |
| **vllmgemma4e4bone** | — | E4B with vision + audio + MTP centroids masking |
| **gemma426ba4bone** | 119 t/s | Atomic Chat llama.cpp fork with MTP, native vision |
| **gemma4e2bone** | — | E2B 2.3B for voice-pipeline use |
| **llamacppgemma4audione** v1.0.0 | — | E4B + native audio input (USM Conformer, llama.cpp PR #21421 mainline b9101) |

The DFlash app has a known **5-fast/4-slow degradation cycle** every ~10 requests, currently traced to drafter alignment (low-yield spec fallback pattern). Peak phases hit 220-235 t/s, slow phases drop to ~60 t/s. Long-session AVG ≈ 161 t/s.

## Other LLMs

| App | Model | Notes |
|-----|-------|-------|
| llamacppqwen35a3bone | Qwen3.5 35B-A3B | UD-Q4_K_XL, 129 t/s, 64K |
| llamacppnemotron30a3bone | Nemotron 3 Nano 30B-A3B | 184 t/s, 128K (Mamba-2 hybrid) |
| cascade230a3bone | Nemotron Cascade 2 30B-A3B | math + code specialist |
| llamacppglm47flash | GLM-4.7 Flash | 30B-A3B bilingual |
| qwen3coder30a3bone | Qwen3-Coder 30B-A3B | coding agent |
| devstralsmallone | Devstral Small 24B | coding agent, 53.6% SWE-Bench |
| qwen35a3bvisionone | Qwen3.5 35B-A3B Vision | + mmproj F16, 131 t/s |
| qwen36a3bvisionone | Qwen3.6 35B-A3B Vision | image + text |
| qwen35iq4visionone | Qwen3.5 35B-A3B Vision IQ4 | long context vision |
| llamacppqwen35iq4one | Qwen3.5 35B-A3B IQ4 | compact long-context |
| llamacppqwen36a3bone | Qwen3.6 35B-A3B | hybrid SSM/MoE |
| nemotron3nano4bone | Nemotron 3 Nano 4B | lightweight edge model |
| exl3qwen35a3bone | Qwen3.5 35B-A3B | ExLlamaV3 + TabbyAPI |
| vllmqwen3527bone | Qwen3.5 27B | NVFP4, vLLM |

## Voice & creative

| App | Function | Notes |
|-----|----------|-------|
| omnivoiceone | TTS, 646 languages | voice clone, voice design, 0.6B |
| qwen3ttstone | TTS, 1.7B | 9 voices, zero-shot voice clone |
| vllmvoxtral3bone | ASR | 2.7× faster than Whisper, 3.2% WER |
| vllmvoxtralrt4bone | Streaming ASR | real-time WebSocket, 480 ms latency |
| vllmvoxtraltts4bone | TTS | 20 voices, 9 languages, 70 ms latency |
| acestepxlone | Music generation | ACE-Step 1.5 XL (4B DiT, Turbo + SFT modes) |

## How It Works

A single Cloudflare Worker serves the full Olares Market Source API. Each app is a Helm chart with GPU-optimised configs, packaged and deployed from this repo.

```bash
npm install
npm run dev              # Local dev (localhost:8787)
npm run deploy           # Deploy to Cloudflare Workers
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/appstore/hash?version=X` | Catalogue hash for cache check |
| GET | `/api/v1/appstore/info?version=X` | Full catalogue with app summaries |
| POST | `/api/v1/applications/info` | App details (batched by ID) |
| GET | `/api/v1/applications/{name}/chart?fileName=X` | Chart `.tgz` download |
| GET | `/icons/{name}.png` | App icon |

## Hardware

- **GPU**: NVIDIA RTX 5090M — 24 GB GDDR7, 896 GB/s, sm_120 Blackwell
- **CPU**: Intel Core Ultra 9 275HX — 24 cores, AVX2/FMA/F16C/AVX-VNNI
- **RAM**: 96 GB DDR5 5600 MHz
- **TDP**: GPU 175 W, CPU 160 W

## Related

- [olares-market](https://github.com/markus-albrecht/orales-market) — generic apps for any Olares hardware

## License

MIT

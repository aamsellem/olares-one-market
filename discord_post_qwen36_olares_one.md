New version of the Qwen3.6-27B vLLM app on my market source: ~85-100 t/s sustained, peaks at 99.7 t/s on the Olares One. About 3x faster than llama.cpp on the same hardware. 75K max context.

It runs Lorbus/Qwen3.6-27B-int4-AutoRound on vLLM 0.19.1 with MTP speculative decoding (n=3, ~93% acceptance), fp8_e5m2 KV cache, flashinfer backend.

Custom Docker image because vanilla vLLM crashes on Blackwell consumer GPUs: I cherry-picked vllm PR #36325 (Triton TMA fix for sm_120) and the patch_tolist_cudagraph.py from noonghunna/qwen36-27b-single-3090 (fixes CUDA graph capture during spec-decode + chunked-prefill warmup).

The main 24GB-specific catch: NVFP4 quants like sakamakismile's are tempting on Blackwell (2x FP8 throughput) but the MTP head re-allocation in vLLM eats 2.37 GiB and OOMs. Lorbus's AutoRound INT4 has mtp.fc dequantized in the file (~280 MiB), so the OOM goes away. We trade NVFP4 tensor cores for the ability to actually fit MTP, but MTP n=3 brings way more speed than NVFP4 acceleration would have.

To try: add https://orales-one-market.aamsellem.workers.dev as a market source, install Qwen3.6 27B Dense NVFP4 vLLM One. First launch downloads ~19GB. OpenAI-compatible API on port 8000.

Speeds vary 65-100 t/s depending on how predictable the generated text is (Wasif Basharat's "MTP variance"). Curious if anyone gets different numbers on other Olares hardware.

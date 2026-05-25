# Research Model for Olares One

Find the optimal model configuration for the Olares One hardware.

## Argument: $ARGUMENTS

The argument is either:
- A model name/family (e.g., "Qwen3.5-35B-A3B", "DeepSeek-R1", "Llama-4-Scout")
- A use case (e.g., "best coding model", "best reasoning model", "fast chat model")
- "latest" — check what's new since last research

## Olares One Hardware Specs

- **GPU**: NVIDIA RTX 5090M — 24GB GDDR7, 896 GB/s bandwidth, sm_120 Blackwell
- **CPU**: Intel Core Ultra 9 275HX — 24 cores, AVX-512, AMX
- **RAM**: 96GB DDR5 5600MHz
- **TDP**: GPU 175W, CPU 160W

## Research Steps

1. **Search the web** for:
   - Latest benchmarks on RTX 5090/5090M for the given model
   - Best quantization options (GGUF quants, AWQ, GPTQ, etc.)
   - Backend performance comparisons (llama.cpp, vLLM, KTransformers, SGLang)
   - Recent llama.cpp/vLLM releases with relevant optimisations
   - Reddit r/LocalLLaMA threads about this model on similar hardware

2. **Check compatibility**:
   - Does the model fit in 24GB VRAM? Calculate: model size + KV cache at target context
   - If not fully GPU-resident, what's the best hybrid strategy (CPU offload, MoE offload)?
   - Which backend supports this architecture? (Check GEMINI.md for known support)

3. **Evaluate quantization options**:
   - For GGUF: compare UD (Unsloth Dynamic) vs standard K-quants vs MXFP4
   - For AWQ/GPTQ: check if vLLM supports efficient serving
   - Calculate VRAM usage for each option at target context size
   - Reference GEMINI.md VRAM budget table

4. **Determine optimal parameters** based on GEMINI.md battle-tested configs:
   - KV cache type (q8_0 recommended for speed)
   - Batch/ubatch sizes (512 recommended)
   - Flash attention, SWA, op-offload as applicable
   - Thread count (16 recommended for 24-core CPU)
   - Context size (balance quality vs VRAM)

5. **Generate recommendation** with:
   - Recommended backend + image tag
   - Model source (HuggingFace URL)
   - Quantization choice with rationale
   - Estimated VRAM usage
   - Expected performance (t/s) based on similar benchmarks
   - Full Docker run command for testing (see /test-docker)
   - Risk factors or unknowns

6. **Compare with existing apps** in this repo to avoid duplicates. Check what's in `../orales-market/` too.

## Output Format

Present findings as a structured recommendation the user can validate before proceeding to `/test-docker`.

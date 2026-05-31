# llama.cpp server compiled for Olares One
# Core Ultra 9 275HX (AVX-512, AMX) + RTX 5090M (sm_120 Blackwell)
#
# MUST be built on x86_64 machine (ideally the Olares One itself)
# docker build -t aamsellem/llamacpp-one:latest .

# ---- Stage 1: Build ----
FROM nvidia/cuda:12.8.1-devel-ubuntu24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Clone llama.cpp at pinned version
ARG LLAMA_CPP_REF=b8234
RUN git clone --depth 1 --branch b4458 https://github.com/ggml-org/llama.cpp.git 2>/dev/null || \
    git clone https://github.com/ggml-org/llama.cpp.git && \
    cd llama.cpp && git checkout ${LLAMA_CPP_REF} 2>/dev/null || true

WORKDIR /build/llama.cpp

# Build with hardware-specific optimizations
RUN cmake -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DGGML_CUDA=ON \
    -DCMAKE_CUDA_ARCHITECTURES=120 \
    -DGGML_AVX=ON \
    -DGGML_AVX2=ON \
    -DGGML_AVX512=ON \
    -DGGML_AVX512_VBMI=ON \
    -DGGML_AVX512_VNNI=ON \
    -DGGML_AVX512_BF16=ON \
    -DGGML_AMX_TILE=ON \
    -DGGML_AMX_INT8=ON \
    -DGGML_AMX_BF16=ON \
    -DGGML_FMA=ON \
    -DGGML_F16C=ON \
    -DGGML_CUDA_FA_ALL_QUANTS=ON \
    -DGGML_CUDA_GRAPHS=ON \
    -DLLAMA_CURL=OFF \
    && cmake --build build --config Release -j$(nproc) --target llama-server llama-bench

# ---- Stage 2: Runtime ----
FROM nvidia/cuda:12.8.1-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/llama.cpp/build/bin/llama-server /usr/local/bin/llama-server
COPY --from=builder /build/llama.cpp/build/bin/llama-bench /usr/local/bin/llama-bench

EXPOSE 8080

ENTRYPOINT ["llama-server"]

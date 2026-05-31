#!/bin/bash
# Coller ce script dans le terminal SSH de l'Olares One
# Il crée le Dockerfile, build l'image et la push sur Docker Hub
set -e

echo "=== Build llama.cpp optimisé pour Olares One ==="
echo ""

WORKDIR="/tmp/llamacpp-build"
IMAGE="aamsellem/llamacpp-one"
TAG="b8234"

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

# Créer le Dockerfile inline
cat > Dockerfile << 'DOCKERFILE'
# llama.cpp server compiled for Olares One
# Core Ultra 9 275HX (AVX-512, AMX) + RTX 5090M (sm_120 Blackwell)
FROM nvidia/cuda:12.8.1-devel-ubuntu24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone https://github.com/ggml-org/llama.cpp.git

WORKDIR /build/llama.cpp

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

FROM nvidia/cuda:12.8.1-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/llama.cpp/build/bin/llama-server /usr/local/bin/llama-server
COPY --from=builder /build/llama.cpp/build/bin/llama-bench /usr/local/bin/llama-bench

EXPOSE 8080
ENTRYPOINT ["llama-server"]
DOCKERFILE

echo "Dockerfile créé. Lancement du build..."
echo "Cela prend ~10-15 minutes avec 24 cores."
echo ""

docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .

echo ""
echo "=== Build terminé ! ==="
echo ""
echo "Images créées :"
docker images | grep "$IMAGE"
echo ""
echo "Pour push sur Docker Hub :"
echo "  docker login"
echo "  docker push $IMAGE:$TAG"
echo "  docker push $IMAGE:latest"
echo ""
echo "Pour tester (benchmark) :"
echo "  docker run --gpus all --rm -v /chemin/vers/models:/models $IMAGE:latest \\"
echo "    llama-bench -m /models/Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf -ngl 99 -fa 1"

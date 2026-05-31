#!/bin/bash
set -e

IMAGE="aamsellem/llamacpp-one:latest"
LLAMA_CPP_REF="${1:-b8234}"

echo "Building $IMAGE (llama.cpp $LLAMA_CPP_REF)"
echo "Optimized for: Core Ultra 9 275HX (AVX-512, AMX) + RTX 5090M (sm_120)"
echo ""
echo "This MUST be run on x86_64 (ideally the Olares One itself)."
echo ""

docker build \
    --build-arg LLAMA_CPP_REF="$LLAMA_CPP_REF" \
    -t "$IMAGE" \
    -t "aamsellem/llamacpp-one:$LLAMA_CPP_REF" \
    .

echo ""
echo "Done! Images:"
echo "  $IMAGE"
echo "  aamsellem/llamacpp-one:$LLAMA_CPP_REF"
echo ""
echo "Push with:"
echo "  docker push $IMAGE"
echo "  docker push aamsellem/llamacpp-one:$LLAMA_CPP_REF"
echo ""
echo "Benchmark with:"
echo "  docker run --gpus all --rm aamsellem/llamacpp-one:$LLAMA_CPP_REF \\"
echo "    llama-bench -m /path/to/model.gguf -ngl 99 -fa 1"

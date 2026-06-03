# Discord reply à Marc — Gemma 4 26B-A4B Vision FINAL (vLLM 136 t/s shipped)

**Context** : Marc shared on Discord 2026-05-14 his hand-patched gemma426ba4bone v1.0.9 to restore vision, getting 125 t/s avg with mmproj F16 + no MTP + GGML_CUDA_GRAPH_OPT. After his message I ran a full bench cycle (4 llama.cpp configs + 2 vLLM configs) and shipped a vLLM variant that beats his baseline. This is the updated final reply.

---

## Draft (English)

```
Hey Marc, final follow-up on your mmproj patch from yesterday. Long message — but I wanted to give you the full picture of what I learned from your baseline.

Step 1 — I first shipped your setup as a separate app `llamacppgemma426ba4bvisionone` v1.0.3 (atomic fork llama.cpp + mmproj F16 + q4_0 KV + no spec + parallel 1 + GGML_CUDA_GRAPH_OPT). Four configs benched on Olares One, 10 runs each:

- v1.0.0 (turbo3 + ngram-cache): 115.93 t/s — ngram-cache doesn't fire on HTML/code, pure overhead
- v1.0.1 (turbo3, no spec): 116.20 t/s — dropped ngram, marginal gain
- v1.0.2 (q8_0 KV, no spec): 123.97 t/s — turbo3 → q8_0 = +6.7%, matches your 125
- v1.0.3 (q4_0 KV, parallel 1): 121.81 t/s text / 123.53 t/s with image — +3.5 GB headroom

Three technical findings worth flagging:
- turbo3 KV has a non-trivial overhead on Gemma 4 (~6.7% vs q8_0). The Hadamard rotation dequant is too expensive on sm_120 at this model size. (On Qwen3.6 27B with DFlash it's the opposite — turbo3 is essential to fit 262K. Per-model tradeoff.)
- ngram-cache is useless on HTML/code (output too variable to match ngrams). Drop it.
- ubatch MUST be ≥ image_max_tokens (~1100 for Gemma 4) or you hit an assert fail on the first image input (PR #21550). Safe default is ubatch 2048.

Step 2 — I tested vLLM in parallel to see if there was something better. Image vllm/vllm-openai:tokenspeed-preview + cyankiwi AWQ-4bit (Gemma4ForConditionalGeneration native multimodal, vision encoder bundled, no separate mmproj) + triton_attn + fp8 KV. **136 t/s AVG (range 0.56, exceptional stability)**. Vision validated (gradient PNG test → "Red" correct). +9.7% over my best llama.cpp config.

Step 3 — I added the DFlash drafter (z-lab/gemma-4-26B-A4B-it-DFlash) to the vLLM stack. It boots, but **reproduces the 5-fast/4-slow cycle** I documented on vllmgemma4dflashone: 5 runs at 200-212 t/s, 4 runs at 58-98 t/s, misleading AVG 150. That's vLLM's adaptive spec throttling bug. For consistent UX, the 136 t/s steady-state beats the 150 bimodal.

**Final state in the market**: I removed llamacppgemma426ba4bvisionone (no reason to keep two apps doing the same thing worse). In its place: **vllmgemma426ba4bvisionone v1.0.0** = 136 t/s vision-capable Gemma 4 26B-A4B with range-0.56 stability.

Three benefits of the vLLM path vs your llama.cpp patch:
1. +9% throughput (136 vs 125)
2. Native multimodal (audio_config bundled too — not wired in the chart yet but ready whenever)
3. No atomic-fork maintenance burden — vLLM mainline path

Tradeoffs:
- Context 16K initial vs 128K on your llama.cpp config (pushable to 65K easily — let me know if you need it)
- AWQ-4bit vs UD-Q4_K_XL — slightly lower quality but quasi-imperceptible on standard benchmarks
- vLLM is heavier to boot (~2 min vs ~30s)

For your workflow: if 16K context is enough and you want max throughput → install vllmgemma426ba4bvisionone v1.0.0 from Olares Studio. If you need the long-context llama.cpp path, just say so and I'll put llamacppgemma426ba4bvisionone v1.0.3 back in the market alongside.

Thanks again for the initial push on the vision restoration. Your patch surfaced 3 bugs along the way (turbo3 overhead on Gemma 4, ngram-cache useless on HTML, ubatch requirement for multimodal). Good share.

Cheers
```

## Pourquoi ce draft

| Élément | Effet |
|---------|-------|
| **3 étapes chronologiques** | Lui montre tout le travail dérivé de son contribution |
| **4 configs chiffres bruts** | Honnêteté + rigueur méthodologique |
| **3 findings techniques** | Lui donne valeur réutilisable pour ses prochains setups |
| **Reconnait DFlash failure** | Honnêteté, pas de fake claim |
| **Mention l'option de garder llamacpp variant** | Lui donne le pouvoir de décider |
| **Crédit final pour les bugs découverts** | Le valorise sans flagornerie |

## Versions alternatives

### Plus court (1 paragraphe)

> Salut Marc, retour final. J'ai shippé vllmgemma426ba4bvisionone v1.0.0 sur le market (136 t/s avg, range 0.56, vision validée). C'est +9% vs ta config llama.cpp (125 t/s validée indépendamment chez moi), via vLLM tokenspeed-preview + cyankiwi AWQ Gemma4ForConditionalGeneration. Side findings sur le chemin : turbo3 KV a un overhead -6.7% sur Gemma 4 (l'inverse de Qwen3.6), ngram-cache spec inutile sur HTML/code, ubatch doit être ≥ image_max_tokens (~1100). DFlash drafter ajouté à vLLM = reproduit le 5-fast/4-slow cycle vu sur vllmgemma4dflashone, gardé off pour l'UX. Si tu préfères garder le path llama.cpp long-context, dis-moi et je remets llamacppgemma426ba4bvisionone v1.0.3 dans le market. Merci pour le push initial.

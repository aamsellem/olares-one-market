# Discord post — Olares (14 mai 2026)

---

**🔥 Nouveau record Qwen3.6 27B sur Olares One : 107 t/s à 262K de contexte FULL**

Hello la team ! Petit drop ce matin sur ce qui est maintenant la stack **la plus rapide ET la plus longue** pour faire tourner Qwen3.6 27B en local sur un Olares One (RTX 5090M 24GB, sm_120 Blackwell consumer mobile).

**📊 Bench**

10 runs propres au contexte 262K **FULL** :
• **107.54 t/s AVG** (range 101.70 → 119.38)
• ZÉRO CUDA OOM
• ZÉRO cycle de dégradation (cf. le bug que j'ai posté sur Gemma 4 DFlash la semaine dernière, ici rien de tout ça)

Sweep complet de contexte :

```
 96K → 106.67 t/s
128K → 116.00 t/s  ← sweet spot, raison inconnue
200K → 108.50 t/s
262K → 107.54 t/s  ← contexte natif maximum
```

La perf est **plate** sur toute la plage. Le KV cache turbo3 (3-bit Walsh-Hadamard rotated) compresse assez agressivement pour qu'à 262K toute la stack tienne dans 24 GB avec marge.

**⚔️ Vs mes anciens records sur le même hardware**

| Path | Context | t/s |
|------|---------|-----|
| **BeeLlama (nouveau)** | **262K FULL** | **107.54** |
| vLLM Genesis Turbo | 88K | 88 |
| buun-DFlash | 96K | 76 |
| llama.cpp MTP | 262K | 72.75 |

→ **+48% vs MTP au même 262K**
→ **+22% vs vLLM Genesis Turbo** (à 1/3 du contexte)
→ **+40% vs buun-DFlash** (à beaucoup moins de contexte)

**🛠️ Stack**

• Image : `aamsellem/beellama-cpp:0.1.1` (build custom amd64 + CUDA 13 + sm_120 de Anbeeld/beellama.cpp v0.1.1, ~50 min via qemu sur Mac arm64)
• Target : `unsloth/Qwen3.6-27B-GGUF` UD-Q3_K_XL (14.5 GB) — **pas la variante MTP-baked**
• Drafter : `spiritbuun/Qwen3.6-27B-DFlash-GGUF` dflash-draft-3.6-q8_0 (1.85 GB)
• KV cache : turbo3
• Spec : `--spec-type dflash --spec-dflash-cross-ctx 1024`
• Batch 2048 / ubatch 256, flash-attn on, mlock, no-mmap

Fork chain : ggml-org/llama.cpp → TheTom/turboquant → spiritbuun/buun → Anbeeld/beellama

**⚠️ Gotchas**

1. Si vous avez déjà le GGUF havenoammo MTP-baked en cache, BeeLlama refuse de le loader (`expected 866, got 862` tensors). Utilisez la variante non-MTP d'unsloth.
2. Multi-GPU cassé dans ce fork (issue #7). Single-GPU only — fine pour Olares One.
3. BeeLlama n'a pas synchro master depuis le 23 avril. Les builds llama.cpp post-b9130 n'arriveront pas tant qu'Anbeeld rebase pas.

**📦 Comment installer**

App shippée comme `llamacppqwen36beellamaone` v1.0.1 sur ma market source :
`https://orales-one-market.aamsellem.workers.dev`

(Olares Studio → Market → Settings → Add source, puis cherchez "Qwen36 27B BeeLlama One")

**📰 Article complet**

Build process, analyse des 3 facteurs qui font les +48% vs MTP, comparaisons détaillées :
https://blog.aamsellem.com/posts/beellama-cpp-262k-blackwell-mobile/

**❓ Open questions à la communauté**

• Si quelqu'un tourne Qwen3.6 27B sur une autre carte sm_120 (5070 Ti, 5080, 5090 desktop) — l'image `aamsellem/beellama-cpp:0.1.1` devrait marcher telle quelle. Postez vos chiffres ! 5090 desktop devrait taper 150-180 t/s si mon scaling mobile→desktop tient.

• Le sweet spot à 128K (116 t/s) est reproductible chez moi mais bizarre. Quelqu'un avec un setup similaire a vu pareil ?

• Quelqu'un a testé CopySpec (l'ajout unique de BeeLlama au-dessus de buun) sur des workloads de sortie structurée (JSON tool-calling, replay) ? Mon bench HTML est mauvais workload pour ça.

À très vite ! 🚀

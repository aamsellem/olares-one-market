# Discord reply to Marc — Gemma 4 26B-A4B Vision One v1.0.3 shipped

**Context** : Marc shared on Discord his hand-patched gemma426ba4bone v1.0.9 config to restore vision (125 t/s avg with mmproj F16 + no MTP + GGML_CUDA_GRAPH_OPT). This message updates him on the new app shipped using his work as baseline.

---

## Draft

```
Salut Marc, juste un retour suite à ton partage de ce matin.

J'ai shippé ton setup comme une app séparée du market : `llamacppgemma426ba4bvisionone` v1.0.3, dispo dans Olares Market depuis quelques heures. Ça garde gemma426ba4bone intact (text-only MTP, 178 t/s) pour ceux qui n'ont pas besoin de vision, et offre une variante "vision-enabled" claire à côté.

J'ai poussé un peu plus loin que ton baseline 125 t/s en testant 4 configs côte à côte. Petit récap des chiffres mesurés sur Olares One (10 runs propres chacun, Space Invaders HTML prompt, atomic fork image base) :

- mmproj F16 + ngram-cache spec + turbo3 KV + parallel 2 : 115.93 t/s (ngram-cache ne fire pas sur HTML, juste overhead)
- mmproj F16 + no spec + turbo3 KV + parallel 2 : 116.20 t/s (drop ngram, gain marginal)
- mmproj F16 + no spec + q8_0 KV + parallel 2 : 123.97 t/s (turbo3 → q8_0 = +6.7%, on rejoint ton 125)
- mmproj F16 + no spec + q4_0 KV + parallel 1 : 121.81 t/s text / 123.53 t/s avec image (q4_0 perd -1.7% mais libère 3.5 GB pour vision)

J'ai shippé v1.0.3 (la dernière) parce que les 3.5 GB de marge te permettent d'envoyer des images plus grosses sans risquer l'OOM. Pour ton usage si tu préfères pure throughput tu peux passer en q8_0 et gagner ~2 t/s.

Trois findings techniques sortis du process :
1. turbo3 KV a un overhead non-trivial sur Gemma 4 (~6.7% vs q8_0). La rotation Hadamard dequant est trop chère sur sm_120 pour cette taille de modèle. Sur Qwen3.6 27B avec DFlash c'est l'inverse — turbo3 est essentiel pour fit 262K. Tradeoff per-model.
2. ngram-cache spec décodage ne sert à rien sur HTML/code (l'output est trop varié pour matcher des ngrams). Pure overhead. À retirer.
3. ubatch DOIT être ≥ image_max_tokens (~1100 pour Gemma 4) sinon assert fail sur premier image input. PR #21550 dans llama.cpp doc ça. ubatch 2048 safe.

J'ai aussi vérifié que l'issue #21402 (Gemma 4 mmproj crash sur sm_120 RTX 5090) ne nous touche pas — testé en envoyant une PNG 64x64 au server, il a correctement identifié le gradient. Le bug vbooka1 rapporte est spécifique à Q8_0 target + BF16 mmproj sur vanilla b8664. Notre combo UD-Q4_K_XL + F16 mmproj + atomic fork est safe.

Si tu veux essayer le test #2 que je suis en train de bencher (vLLM + cyankiwi AWQ Gemma 4 multimodal, même hardware), je peux te partager les chiffres dès qu'ils sortent. vllmgemma4dflashone fait 224 t/s text-only sans vision donc le potentiel est là, on verra ce que ça donne avec mmproj activé.

Merci encore pour le partage initial, ça a vraiment fait avancer la chose.

Salut
```

## Why this works

- **Reconnait son apport** sans flatterie excessive
- **Donne les chiffres bruts** des 4 configs benchées sur son hardware identique
- **Justifie le choix v1.0.3** par un argument concret (3.5 GB headroom vision)
- **Partage 3 findings techniques** que lui peut réutiliser sur ses prochains setups
- **Mention le test vLLM en cours** sans promettre de résultat
- **Ton peer-to-peer**, tutoiement, francais

# Discord post — Olares One LLM market update (8 mai 2026)

---

**🔥 Olares One LLM Market — gros update cette semaine**

Hello la team ! Quelques news pour les possesseurs d'Olares One qui font tourner des LLMs en local. J'ai bench tout ce qui pouvait tenir sur le RTX 5090M 24GB cette semaine, fait le tri dans mon market source, et publié 2 articles détaillés.

**🏆 Le scoop : Gemma 4 E4B + MTP en stack 100% upstream**

Le 6 mai vLLM merge la PR #41745 (support natif des drafters Multi-Token Prediction de Gemma 4). Le 7 mai à 06:13 UTC le nightly Docker est publié. À 06:35 UTC, mon Olares One sort **178 t/s avec 77% draft acceptance** — premier bench public Gemma 4 MTP sur Blackwell consumer mobile.

Pas de fork, pas de patch, juste `vllm/vllm-openai:nightly` + le bon `--speculative-config`. Stack super propre.

Article complet : https://airelien.dev/fr/posts/gemma4-mtp-first-blackwell-mobile-bench (ou ton blog URL)

**🧹 Cleanup Qwen3.6 27B : 8 apps → 2**

Pour aider les autres possesseurs Olares One à choisir, j'ai gardé 2 variantes claires :

• **Qwen36 27B Fast** (vLLM Turbo + Genesis 28 patches + TurboQuant K8V4 + MTP n=3) — **88 t/s steady state**, 88K context. La stack la plus rapide qu'on ait sur ce hardware.

• **Qwen36 27B Long Context** (llama.cpp + PR #22673 + froggeric MTP-GGUF) — **65 t/s steady, 128K context** (262K natif possible avec quant plus petit). Pour les workflows agentic / long codebase.

Supprimé du market : `lucedflashqwen36one`, `dflashqwen36one`, `vllmqwen36dense27bone`, `llamacppqwen36dense27bone` (broken / redundant / dépassés).

**🛠️ Bugs trouvés + fixes (pour ceux qui galèrent avec HAMi) :**

1. HAMi-core parse `CUDA_DEVICE_MEMORY_LIMIT_0=0m` (default Olares) comme "0 bytes" → toute alloc CUDA crash sur le path `EagleProposer.__init__`. Workaround : env `CUDA_DEVICE_MEMORY_LIMIT_0=24400m` dans le pod. Affecte vLLM ET llama.cpp avec spec decoding.

2. `--prefix-caching-hash-algo xxhash` dans le chart vLLM Turbo crashait après quelques requêtes (`ModuleNotFoundError: xxhash`). Drop le flag → default sha256 fonctionne.

3. `GENESIS_ENABLE_P5B_KV=1` provoque CUDA OOM continuation prefill sur 24 GB (pas qu'avec turboquant_4bit_nc, aussi avec K8V4). Garder désactivé sur Olares One.

**📦 Comment installer**

Ma source market : `https://orales-one-market.aamsellem.workers.dev`

(Olares Studio → Market → Settings → Add source)

**📰 Articles complets**

• Le scoop Gemma 4 MTP : https://airelien.dev/fr/posts/gemma4-mtp-first-blackwell-mobile-bench

• Le récap exhaustif (Gemma 4 + Lucebox régression + vLLM no-Genesis + cleanup) : https://airelien.dev/fr/posts/olares-one-bench-week-blackwell-consumer-mobile

**❓ Open questions à la communauté**

• Si vous tournez Lucebox v1.6.0+ sur Olares One (ou autre 5090M Laptop) : reproduisez-vous mon 88 → 69 t/s régression du 4 → 7 mai, ou ça tourne toujours à 88+ chez vous ? Faut isoler kernel/HAMi vs methodo bench.

• Si vous bench Gemma 4 MTP sur d'autres Blackwell (5070, 5080, 5090 desktop) — postez vos chiffres, on construit la base de comparaison.

À très vite ! 🚀

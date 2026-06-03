# r/LocalLLaMA — kit de commentaires LIVE (consultés via cmux le 14 mai 2026)

Posts identifiés et lus en direct. Chaque commentaire est calibré au contenu **réel** du post cible.
Ordre = priorité (du plus rentable en karma).

Règles :
- Pas de lien blog dans le 1er commentaire (auto-filter Reddit)
- Si l'OP réagit, 2e commentaire avec lien blog OK
- Tutoyer/vouvoyer en anglais → toujours « you »
- Mentionner « RTX 5090M / sm_120 / consumer Blackwell mobile » au moins une fois — signal de rareté

---

## 🥇 #1 — Qwen3.6 27b MTP 256K dual 5090 (DESKTOP)

**URL :** https://www.reddit.com/r/LocalLLaMA/comments/1tcqqjh/follow_up_qwen36_27b_q5_k_m_mtp_256k_context_5090/

**OP** : No_Mango7658, postée -3h. Tourne Qwen3.6 27B Q5_K_M-mtp avec llama-cli-mtp + `--spec-type mtp --spec-draft-n-max 3 -c 262144 --cache-type-k q8_0`. Avec dual 5090 desktop : **127.9 t/s** generation. Avec single GPU : 119.4 t/s. 39 GB VRAM avec q8_0 KV.

**Pourquoi tu commentes** : tu fais **107 t/s @ 262K sur UN SEUL mobile 5090M 24GB** avec un stack différent qui rentre dans la moitié de la VRAM. Ça lui donne une alternative.

**Comment :**

> Useful datapoint as a single-GPU counterpart. RTX 5090M Laptop (24GB sm_120 consumer Blackwell mobile, 896 GB/s = ~50% of desktop 5090 bandwidth), same Qwen3.6 27B, **107.54 t/s avg over 10 runs at FULL 262K context, range 101.70-119.38, zero CUDA OOM**.
>
> Stack is different from yours though — BeeLlama.cpp fork (Anbeeld/beellama.cpp v0.1.1, fork chain: ggml-org → TheTom/turboquant → spiritbuun/buun-llama-cpp → Anbeeld) with DFlash spec decoding instead of MTP:
>
> - Target: `unsloth/Qwen3.6-27B-GGUF` UD-Q3_K_XL (14.5 GB, NOT the MTP-baked variant — BeeLlama refuses those with `done_getting_tensors: wrong number of tensors; expected 866, got 862`)
> - Drafter: `spiritbuun/Qwen3.6-27B-DFlash-GGUF` dflash-draft-3.6-q8_0 (1.85 GB)
> - KV cache: `--cache-type-k turbo3 --cache-type-v turbo3` (3-bit Walsh-Hadamard, ~25% smaller than q8_0 = the headroom that lets 262K fit on 24GB)
> - `--batch-size 2048 --ubatch-size 256 --spec-type dflash --spec-dflash-cross-ctx 1024`
>
> Total VRAM at 262K: ~24.3 GB (14.5 target + 1.85 drafter + ~8 GB KV turbo3). Same context as yours, less than half your card-pair's combined 47 GB.
>
> Would be curious to know your AVG over 10 runs (not single run), and whether MTP n=3 vs n=5 with q8_0 KV moves the needle on a dense Q5_K_M target.

---

## 🥇 #2 — Multi-Token Prediction (MTP) for Qwen on LLaMA.cpp + TurboQuant

**URL :** https://www.reddit.com/r/LocalLLaMA/comments/1tckzy2/multitoken_prediction_mtp_for_qwen_on_llamacpp/

**OP** : gladkos (-7h). MTP + TurboQuant Qwen3.6 27B sur M5 Max 64GB : **21 → 34 t/s (+62%)**, 90% acceptance. Lien vers fork `AtomicBot-ai/atomic-llama-cpp-turboquant`.

**Pourquoi tu commentes** : tu as la même combo sur Blackwell + a un chiffre encore meilleur. Tu valides son approche et offres un datapoint NVIDIA.

**Comment :**

> Great work — 90% acceptance on the M5 Max is impressive. Sharing a complementary Blackwell datapoint since most replies here will be Apple Silicon:
>
> Same Qwen3.6 27B + TurboQuant + spec decoding (DFlash drafter instead of MTP head, but same idea) on RTX 5090M (24GB sm_120 consumer Blackwell mobile):
>
> | Stack | t/s | Notes |
> |---|---|---|
> | llama.cpp baseline (no spec) | ~36 | UD-Q3_K_XL, 32K ctx |
> | llama.cpp + am17an MTP branch + q4_0 KV | 72.75 | unsloth UD-Q3_K_XL, **FULL 262K ctx** |
> | BeeLlama.cpp + DFlash drafter + **turbo3 KV** | **107.54** | same target, **FULL 262K ctx** |
>
> The turbo3 KV (3-bit Walsh-Hadamard rotation, the same TurboQuant primitives merged in PR #21038) is what lets the 262K full native context fit on 24 GB alongside the target + drafter — ~8 GB KV cache vs ~12 GB for q4_0.
>
> One question for you — on the M5 Max, do you see the embedding table issue from the `mdda` post (Gemma 4 MTP tied LM head silently on CPU)? Wondering if Apple Silicon hits the same `--override-tensor-draft "token_embd.weight=CUDA0"` workaround or if Metal lays it out differently.

---

## 🥇 #3 — 24+ tok/s from ~30B MoE on old GTX 1080 (TurboQuant + MoE offload)

**URL :** https://www.reddit.com/r/LocalLLaMA/comments/1tcc7h5/24_toks_from_30b_moe_models_on_an_old_gtx_1080_8/

**OP** : mdda (-13h). Qwen3.6 35B-A3B et Gemma 4 26B-A4B sur GTX 1080 8GB + 32GB RAM, 24 t/s, 128K ctx, K=turbo4 V=turbo3, MoE expert offload. Fork `AtomicBot-ai/atomic-llama-cpp-turboquant`. Trouvé le bug embedding table sur Gemma 4 MTP.

**Pourquoi tu commentes** : tu confirmes son setup côté Blackwell, et tu peux compléter avec **les chiffres tout-GPU** sur ces deux exact mêmes modèles.

**Comment :**

> The embedding-table-on-CPU finding is gold, thanks for documenting. Sharing the all-GPU end of the spectrum for the same two models — different bottleneck, same conclusions about MoE expert handling:
>
> RTX 5090M (24GB sm_120 consumer Blackwell mobile, 896 GB/s, all experts on GPU):
>
> | Model | Quant | Stack | t/s |
> |---|---|---|---|
> | Qwen3.5-35B-A3B | UD-Q4_K_XL | llama.cpp + flash-attn + q8_0 KV | **128.75** @ 16K |
> | Qwen3.6 27B (dense) | UD-Q3_K_XL | BeeLlama + DFlash drafter + turbo3 KV | **107.54** @ FULL 262K |
> | Gemma 4 26B-A4B | AWQ-4bit | vLLM + z-lab DFlash drafter n_spec=8 | **224** @ 96K |
> | Gemma 4 E4B | Q4_K_M | vLLM + MTP n=3 | **178** @ 32K |
>
> Same lesson on the MoE side: `--cpu-moe` cuts perf in half on Blackwell too. Core Ultra 9 275HX has no AVX-512 / AMX, MoE expert compute on CPU is the wrong tradeoff even with 24 cores. The win is keeping experts on GPU + getting the KV cache small enough to fit (turbo3/turbo4 = magic).
>
> Also second your point on Gemma 4 MTP — separate issue I hit: vLLM + DFlash drafter has a reproducible 5-fast/4-slow cycle, drops from 224 t/s peak to 60 t/s for 4 runs then recovers. Reproducible with `--enforce-eager` so it's not cudagraph. Workarounds I tried that didn't fix: prefix-caching off, max-num-seqs=1, max-num-batched-tokens variations. Likely periodic spec acceptance throttling in the scheduler.

---

## 🥈 #4 — Strix Halo or GPUs? (€2k budget)

**URL :** https://www.reddit.com/r/LocalLLaMA/comments/1tct2dp/strix_halo_or_gpus/

**OP** : undernightcore (-25 min, donc tout récent — bon timing). €2k budget, veut dense 27-30B + MoE 3B activés. Demande quelles t/s espérer.

**Pourquoi tu commentes** : tu es la voix unique « mini-PC tout-en-un » dans un fil qui va recevoir 20 réponses « 2× 3090 ».

**Comment :**

> Counterpoint to the 2× 3090 / Strix Halo answers you'll get — there's a third route: a mini-PC with a mobile Blackwell. I run an Olares One (basically a NUC-class box with RTX 5090M Laptop 24GB GDDR7 + Core Ultra 9 275HX + 96GB DDR5). About $2.5k retail, but you get a single-box turnkey solution with a full Linux server stack on top.
>
> Real numbers I get on dense 27-30B + small MoE:
>
> | Model | t/s | Context |
> |---|---|---|
> | Qwen3.6 27B (dense) | **107** | **FULL 262K** |
> | Qwen3.5 35B-A3B (MoE) | 128.75 | 16K |
> | Gemma 4 26B-A4B (MoE) | 224 | 96K |
> | Gemma 4 E4B | 178 | 32K |
>
> Tradeoff vs 2× 3090: less raw VRAM (24 vs 48GB), so 70B doesn't fit, but everything in your target range (27-30B + 3B-activated MoE) fits with full context. Mobile Blackwell has ~50% the bandwidth of desktop 5090, so you trade ~30-40% peak perf for 30W idle and 0 fan noise.
>
> Strix Halo I'd skip for now — Vulkan support in llama.cpp is fine but RocM is still rough for spec decoding, and you'd lose access to BeeLlama / vLLM Genesis / z-lab DFlash drafters that need CUDA.
>
> If you're set on building rather than buying — single RTX 5090 (32GB, ~$2k street if you find one) + a cheap host gives you the best perf-per-watt right now.

---

## 🥈 #5 — Running Qwen 3.6 35B-A3B on 2x 5060TI (90 t/s, wants Q6/Q8)

**URL :** https://www.reddit.com/r/LocalLLaMA/comments/1tch5ps/running_qwen_36_35b_a3b_on_2x_5060ti/

**OP** : chocofoxy (-10h). 2× 5060Ti 16GB = 32GB VRAM, Q4 sur LM Studio, full context, 90 t/s. Veut passer Q6/Q8. mATX, GPUs stackées, problèmes cooling.

**Pourquoi tu commentes** : tu as le bench Qwen3.5-35B-A3B avec UD-Q4_K_XL, donc tu peux donner le bon advice quant.

**Comment :**

> Solid 90 t/s on 2× 5060Ti. Quick thought on the quant upgrade: **don't go to Q6 or Q8, switch to UD-Q4_K_XL instead** (unsloth Dynamic). It's nominally Q4 but unsloth keeps the attention layers + embeddings at Q8/BF16 — so quality lands within ~0.3% of Q6_K perplexity at the size of Q4_K_M. On my RTX 5090M (24GB sm_120 consumer Blackwell mobile) I get **128.75 t/s on Qwen3.5-35B-A3B UD-Q4_K_XL** vs ~100 t/s on standard Q4_K_M. The smarter quant beats the bigger quant on this model class.
>
> Other low-hanging speedups worth trying:
> - `--cache-type-k q8_0 --cache-type-v q8_0` — biggest single-flag improvement on this hybrid arch (Gated DeltaNet + SSM)
> - `--swa-full` — +3-4 t/s for Qwen3.5 specifically
> - `--batch-size 512 --ubatch-size 512` — prompt processing massively faster
> - env `GGML_CUDA_GRAPH_OPT=1` — concurrent CUDA streams
>
> On the cooling: with stacked GPUs on mATX, the only real fix is undervolting both cards by ~50-100mV (lossless perf, -15% power). Anything else is treating the symptom.

---

## 🥈 #6 — New Linux user, need help compiling llama.cpp

**URL :** https://www.reddit.com/r/LocalLLaMA/comments/1tcce4k/new_linux_user_need_help_compiling_llamacpp/

**OP** : Spiderboyz1 (-13h). CachyOS, 4070S + 3× 3090, Ryzen 9700X. Veut comprendre comment compiler.

**Pourquoi tu commentes** : tu as buildé llama.cpp custom + des forks (BeeLlama, buun) pour sm_120, tu connais les pièges. Karma facile, OP demande de l'aide concrète.

**Comment :**

> Your two cmake commands are correct, with one tweak. For your hardware (4070S = sm_89, 3090 = sm_86) you want to target both archs explicitly so the binary works on either:
>
> ```bash
> cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES="86;89"
> cmake --build build --config Release -j$(nproc)
> ```
>
> Without `CMAKE_CUDA_ARCHITECTURES` cmake tries to autodetect from your *current* GPU only — which means if you run with a different mix later, the binary doesn't have kernels for it.
>
> On "compile vs precompiled": pre-built b9979 works fine 95% of the time. Compile yourself when you need:
> 1. A specific recent commit (master moves fast, pre-built lags 1-3 days)
> 2. A fork that doesn't publish binaries (TurboQuant, DFlash, BeeLlama — for Qwen 3.5/3.6 spec decoding you need these)
> 3. Custom build flags (`GGML_CUDA_FORCE_MMQ`, etc.)
>
> CUDA Toolkit version: 12.4+ for the 4070S to get the new attention kernels. CUDA 13.x if you want SM 12.0 support (not your case but worth knowing). `base-devel` (or its equivalent on CachyOS) + the matching CUDA toolkit is all you need — no separate `cuBLAS`/`cuDNN` installs needed for llama.cpp.
>
> Build time on your Ryzen 9700X: ~3 minutes with `-j$(nproc)`. Don't be afraid to recompile, it's cheap.

---

## 🥉 #7 — Best local model supporting Claude Code (Rtx 3060)

**URL :** https://www.reddit.com/r/LocalLLaMA/comments/1tcqb2u/best_local_model_supporting_claude_code_rtx3060/

**OP** : CatSweaty4883 (-3h). RTX 3060 12GB, 16GB RAM. Tourne Qwen3.5 9B Q4 262K avec llama.cpp comme backend Claude Code. Veut mieux.

**Pourquoi tu commentes** : tu utilises Qwen3.5/3.6 comme backend Claude Code sur Olares One, tu connais le bug `CLAUDE_CODE_ATTRIBUTION_HEADER`.

**Comment :**

> On 12 GB VRAM your current Qwen3.5 9B Q4 at 262K is genuinely the sweet spot for Claude Code — anything bigger forces you to either kill context (which Claude Code burns through fast) or offload to CPU (which kills the TPS that makes the agent loop feel responsive).
>
> Two specific things that will improve your setup without changing model:
>
> 1. **Set `CLAUDE_CODE_ATTRIBUTION_HEADER=0` in your env.** Qwen3.5 hybrid recurrent arch (Gated DeltaNet + SSM) interacts badly with Claude Code's default header — forces full prompt re-processing on every turn instead of using the KV cache. With the env var set, your effective context stays cached and each tool-call iteration is 10× faster.
>
> 2. **Switch to UD-Q4_K_XL if you're on standard Q4_K_M.** Unsloth Dynamic keeps the attention layers at Q8 — for tool calling specifically (where JSON arg formatting is sensitive to sampling), this is the difference between 90% and 99% structural correctness. Same VRAM footprint as Q4_K_M.
>
> If you do upgrade hardware later: Qwen3.5-35B-A3B (MoE, 3B active) on a 24 GB card runs at 128 t/s with the full agentic use-case in mind. Qwen3.6 27B dense is even better for code quality but needs 16 GB just for the target + drafter, leaving little for context.

---

## 🥉 #8 — Fast vision-capable models that handle tool calls

**URL :** https://www.reddit.com/r/LocalLLaMA/comments/1tcl96f/looking_for_fast_visioncapable_local_models_that/

**OP** : yaboyskales (-7h). App "cursor-aware AI overlay", veut sub-2s TTFT, vision + 6 tools. Candidats : Qwen2.5-VL, MiniCPM-V, Llama 3.2 Vision, Pixtral.

**Pourquoi tu commentes** : tu as l'app `qwen35a3bvisionone` (Qwen3.5-35B-A3B + mmproj F16) sur Olares One. C'est le plus rapide vision+tools sur ta classe de hardware.

**Comment :**

> For sub-2s TTFT with vision + tool calls, the candidate you're missing is **Qwen3.5-35B-A3B + mmproj** (the MoE variant with vision via projected encoder).
>
> Why over Qwen2.5-VL: only 3B parameters active per token = much faster decode AND faster prefill, and the tool calling fine-tune in Qwen3.5 is significantly tighter on JSON arg formatting than 2.5-VL. The mmproj file is separate (`steampunque/Qwen3.5-35B-A3B-MP-GGUF` → `Qwen3.5-35B-A3B.mmproj.gguf`, F16, ~0.9 GB) — pass it with `--mmproj`.
>
> Numbers from my RTX 5090M (24GB sm_120 consumer Blackwell mobile):
> - 131 t/s generation with mmproj loaded (vs 129 t/s text-only — negligible vision overhead)
> - TTFT on screenshot prompts: ~400-600 ms for a 1024×1024 image
> - VRAM: 22.2 GB target + 0.9 GB mmproj = ~23 GB, fits 16K ctx with q8_0 KV
>
> The vision input goes through the OpenAI-compatible `image_url` content block (works with llama.cpp's server with `--mmproj`). Function calling format is the same as text mode — Qwen3.5 has been the cleanest open vision+tools combo I've tested for this exact pattern.
>
> On stack: llama.cpp's server is faster than vLLM for single-user TTFT (vLLM optimizes for batch throughput, you're optimizing for first-token-latency).

---

## Plan d'action karma

**Jour 1 (aujourd'hui)** : poste #1, #3, #6, #7. Ce sont les plus matures (older) avec déjà des commentaires → less spam-flag risk, bon engagement.

**Jour 2** : poste #2, #5, #8. Plus jeunes, ton commentaire arrive plus tôt = plus de visibilité.

**Jour 3** : commenter #4 dès qu'il a 30-60 minutes d'âge (timing fenêtre optimale pour Strix Halo).

**Karma estimé sur 3 jours** : 50-150 karma si les commentaires sont upvotés normalement (3-5 upvotes par commentaire technique = standard r/LocalLLaMA), 200+ si un de tes commentaires devient top-comment d'un thread (probable sur #1 ou #3).

**Une fois 100+ karma** : post le draft BeeLlama du dossier `reddit_post_beellama_qwen36_blackwell_mobile.md`. Auto-mod devrait laisser passer.

---

## Anti-patterns à éviter (vérifié ces 3 derniers jours sur le sub)

- Liens directs vers ton blog/Github dans le 1er commentaire (auto-removed)
- « DM me for details » (mauvaise perception)
- « I run a custom market » sans contexte (semble shill, mentionne Olares One comme hardware)
- Re-commenter sur un même thread plusieurs fois en moins de 5 min (semble bot)
- Dire « let me know if you want X » plus de 2 fois (mauvais perception)

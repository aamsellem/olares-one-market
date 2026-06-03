# Réponse à Anbeeld — r/Qwen_AI

**Thread parent :** https://www.reddit.com/r/Qwen_AI/comments/1tcq2h7/
*« First sm_120 BeeLlama.cpp benchmark on consumer Blackwell mobile »* (aurelienams, -3h, 2026-05-14)

**Commentaire d'Anbeeld** (il y a ~5 min) :

> Hello, Bee there. Even I myself am surprised to see it hold up this well at long context, but not complaining. Thank you for doing this!

**Contexte** : Anbeeld est le mainteneur de [Anbeeld/beellama.cpp](https://github.com/Anbeeld/beellama.cpp), le fork qu'on a bench. Réponse positive et chaleureuse — il a publié son tweet/post avec une claim 135 t/s sur RTX 3090 200K, ton bench valide ET étend (sm_120 mobile + 262K).

---

## Draft de réponse

```
Thanks for the kind reply, glad it landed. Two things that might be useful for your project given what I went through:

1. The MTP-baked GGUF tensor count error (`expected 866, got 862`) caught me by surprise — I had `havenoammo/Qwen3.6-27B-MTP-UD-GGUF` cached from another app and BeeLlama refused to load it. Probably worth a one-liner in the quickstart doc saying "DFlash spec mode needs the non-MTP variant of the target GGUF" so people don't hit the same wall.

2. No public sm_120 (consumer Blackwell) Docker image exists — I built mine from your `.devops/cuda.Dockerfile` with `--build-arg CUDA_DOCKER_ARCH=120` via qemu (~50 min on a Mac arm64). Happy to open a PR adding sm_120 to the build matrix if you publish CI-built images, or contribute the prebuilt tag if you want to link mine in your README. Image is on Docker Hub as `aamsellem/beellama-cpp:0.1.1` if anyone wants to skip the build.

One observation worth flagging: there's a reproducible 128K sweet spot on this hardware (116 t/s avg vs 107 at 262K, 108 at 200K). Could just be cudagraph capture sizes aligning at exactly that range, but if you've seen the same on your reference hardware it might point to something tuneable. Let me know if you want bench scripts.
```

---

## Pourquoi ce draft

| Point | Effet |
|-------|-------|
| Court (200 mots, 3 paragraphes) | Conserve l'attention sur Reddit |
| 3 datapoints concrets pour le mainteneur | Lui apporte de la valeur, pas seulement du compliment |
| Position contributeur potentiel sans push | « Happy to open a PR » — offer, pas demande |
| Promo subtile de l'image Docker | Utile à la communauté, pas du shill |
| Observation 128K = ouverture conversation technique | Il peut creuser ou laisser passer |

## Variantes selon l'effet souhaité

### Variante A — Plus pushy sur la collaboration

> Thanks for the reply! Three things I'd love to contribute back if you're open to it:
>
> 1. PR adding sm_120 (consumer Blackwell) to your CI build matrix — `--build-arg CUDA_DOCKER_ARCH=120` is the only change.
> 2. PR for the quickstart doc: the MTP-baked GGUF tensor count error (`expected 866, got 862`) caught me with a `havenoammo/Qwen3.6-27B-MTP-UD-GGUF` from another app. A one-line warning « DFlash mode needs the non-MTP variant » would save people the debug.
> 3. Bench scripts for the 128K → 262K context sweep I ran, if you want to add a perf table to README.
>
> Let me know which (if any) you'd want.

### Variante B — Plus minimaliste

> Thanks! Quick FYI for the doc — the MTP-baked GGUF tensor count error (`expected 866, got 862`) caught me out. People with havenoammo's MTP variant cached will hit it. Happy to PR a one-liner warning if useful.
>
> Also: sm_120 (consumer Blackwell) Docker image at `aamsellem/beellama-cpp:0.1.1` if you want to link it in the README — would save people a 50-min qemu build.

### Variante C — Plus enthousiaste

> 🐝 You built one of the best local inference paths I've tested in 6 months on this hardware. Two quick contributions I'd love to make:
>
> - PR adding sm_120 build target (consumer Blackwell) — 1-line Dockerfile change
> - PR doc note: MTP-baked GGUFs error out with `expected 866, got 862`, took me 20 min to figure out
>
> Also: that 128K sweet spot (116 t/s avg vs 107 @ 262K, 108 @ 200K) — have you seen the same on your reference hardware? Could be cudagraph capture alignment. Let me know if you want my bench scripts.

---

## Plan post-réponse

Si Anbeeld répond positivement à l'une des trois offres :
1. **PR Docker sm_120** → ajoute un build target dans `.github/workflows/` du repo BeeLlama
2. **PR doc gotcha MTP** → ajoute warning dans `docs/quickstart-qwen36-dflash.md`
3. **Bench scripts** → push tes scripts Space Invaders sur ton repo + lien depuis ta réponse

Si il ne répond pas / réponse neutre :
- Reste publiable. La conversation publique a déjà servi (positionne ton expertise sm_120 dans la communauté).

---

## Lien vers thread

Quand tu posteras la réponse, le permalink sera de la forme :
`https://www.reddit.com/r/Qwen_AI/comments/1tcq2h7/.../comment/<comment-id>/`

À sauvegarder dans memory pour suivi.

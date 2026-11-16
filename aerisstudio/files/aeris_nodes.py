"""Aéris built-in ComfyUI extension.

Diffusers-format LoRAs for MiniMax H3 (e.g. NVIDIA's Open-H3-Regenerate-2K: `transformer.transformer_blocks.N.attn.to_q`)
name the attention projections separately, while ComfyUI's H3 fuses them in `qkv_proj`. ComfyUI's LoRA key map only
knows its own names for H3, so those LoRAs load as "not found". This adds the Diffusers names, with q/k/v mapped to
their third of `qkv_proj` (ComfyUI's offset patches), so such LoRAs work with the stock LoraLoaderModelOnly.

It also adds "Aeris Trim Border": crops the plain margin around a picture (H3 lays a character sheet's panels out in a
box in the middle of the frame, whatever the prompt says), keeping a small margin.

"Aeris H3 Carry" / "Aeris H3 Trim Start" continue an H3 take: the take's last frames and sound open the new run as
frozen latents (re-encoded: the H3 VAE encodes independent 17-frame clips, so the tail encodes to the same tokens),
the first new frame is anchored on the take's last frame, and the replayed frames are cut from the result. Same
technique as KadoBOT/ComfyUI-H3-Continuity-Studio (MIT), reimplemented on the core MiniMax H3 nodes.

"Aeris Remake Conditioning" / "Keyframe Until" / "Noise" run Viggle Remake (H3 LoRAs that re-shoot a clip with
another actor or an edited scene). Adapted from Viggle AI's ComfyUI nodes (Apache-2.0, Copyright 2026 Viggle AI,
https://huggingface.co/Viggle/Viggle-Remake): same conditioning, keyframe release and noise order; Aéris adds the
length taken from the source (frames = 0) and writes MiniMax H3's six-section prompt from a plain description when
the prompt is not already in that format. Powered by Viggle Remake.
"""
import logging
import re

import comfy.lora

log = logging.getLogger("aeris")
_ORIG = comfy.lora.model_lora_keys_unet

PART = {"attn.to_out.0": "attn.out_proj", "ff.net.0.proj": "mlp.fc1", "ff.net.2": "mlp.fc2"}
QKV = ("attn.to_q", "attn.to_k", "attn.to_v")


def diffusers_h3_keys(sd_shapes: dict) -> dict:
    """{diffusers lora key: comfy key or (comfy key, (dim, offset, size))} from the model's {key: shape}."""
    out = {}
    for k, shape in sd_shapes.items():
        m = re.match(r"^diffusion_model\.(blocks|token_refiner\.blocks)\.(\d+)\.(attn\.qkv_proj|attn\.out_proj|mlp\.fc1|mlp\.fc2)\.weight$", k)
        if not m:
            continue
        group, n, part = m.groups()
        prefix = f"transformer.{'transformer_blocks' if group == 'blocks' else 'token_refiner.refiner_blocks'}.{n}"
        if part == "attn.qkv_proj":
            third = shape[0] // 3
            for i, name in enumerate(QKV):
                out[f"{prefix}.{name}"] = (k, (0, i * third, third))
        else:
            name = next(d for d, c in PART.items() if c == part)
            out[f"{prefix}.{name}"] = k
    return out


def model_lora_keys_unet(model, key_map={}):
    key_map = _ORIG(model, key_map)
    try:
        import comfy.model_base
        if isinstance(model, comfy.model_base.MiniMaxH3):
            sd = model.state_dict()
            extra = diffusers_h3_keys({k: tuple(v.shape) for k, v in sd.items()})
            for k, v in extra.items():
                key_map.setdefault(k, v)
    except Exception as e:  # never break LoRA loading for other models
        log.warning("aeris: H3 diffusers LoRA keys not added: %s", e)
    return key_map


class AerisTrimBorder:
    CATEGORY = "aeris"
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",),
                             "tolerance": ("FLOAT", {"default": 0.08, "min": 0.01, "max": 0.5, "step": 0.01}),
                             "margin": ("INT", {"default": 12, "min": 0, "max": 256})}}

    def run(self, image, tolerance, margin):
        img = image[0]  # H, W, C in 0..1; the border colour is the corners' median
        h, w = img.shape[0], img.shape[1]
        corners = img[[0, 0, h - 1, h - 1], [0, w - 1, 0, w - 1]]
        bg = corners.median(dim=0).values
        busy = (img - bg).abs().amax(dim=-1) > tolerance
        rows = (busy.float().mean(dim=1) > 0.01).nonzero()
        cols = (busy.float().mean(dim=0) > 0.01).nonzero()
        if len(rows) == 0 or len(cols) == 0:
            return (image,)
        y0, y1 = max(int(rows[0]) - margin, 0), min(int(rows[-1]) + margin + 1, h)
        x0, x1 = max(int(cols[0]) - margin, 0), min(int(cols[-1]) + margin + 1, w)
        return (image[:, y0:y1, x0:x1, :],)


H3_FPS, H3_AUDIO_FPS = 24, 40


def grid_frames(n: int) -> int:
    """Largest H3 clip length (17k + 5 frames) not above n."""
    return n - (n - 5) % 17 if n >= 5 else 0


def drop_guides_before(positive, frame):
    """Keyframe guides inside the frozen frames would fight them: drop them (an empty list must go entirely)."""
    out = []
    for embedding, meta in positive:
        kept = [kf for kf in meta.get("minimax_keyframes") or [] if kf["resolved_frame_index"] >= frame]
        meta = {k: v for k, v in meta.items() if k != "minimax_keyframes"}
        if kept:
            meta["minimax_keyframes"] = kept
        out.append([embedding, meta])
    return out


class AerisH3Carry:
    CATEGORY = "aeris"
    RETURN_TYPES = ("CONDITIONING", "LATENT")
    RETURN_NAMES = ("positive", "latent")
    FUNCTION = "run"
    DESCRIPTION = ("Opens this MiniMax H3 run with the last frames (and sound) of a previous take, frozen, so the new "
                   "frames continue its motion, positions and voice. Place between the H3 conditioning and the sampler; "
                   "cut the carried frames from the result with Aeris H3 Trim Start.")

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"positive": ("CONDITIONING",), "latent": ("LATENT",), "vae": ("VAE",),
                             "images": ("IMAGE", {"tooltip": "The previous take's frames (24 fps)."}),
                             "context_frames": ("INT", {"default": 39, "min": 5, "max": 141, "step": 17,
                                                        "tooltip": "Frames carried: 39 = 1.6 s, 90 = 3.75 s, 141 = 5.9 s."}),
                             "anchor": ("BOOLEAN", {"default": True, "tooltip": "Anchor the first new frame on the take's last frame."})},
                "optional": {"audio_vae": ("VAE",), "audio": ("AUDIO", {"tooltip": "The previous take's sound."})}}

    def run(self, positive, latent, vae, images, context_frames, anchor=True, audio_vae=None, audio=None):
        import torch
        import comfy.nested_tensor
        from comfy_extras import nodes_minimax_h3 as h3

        samples = latent["samples"]
        if (not getattr(samples, "is_nested", False) or len(samples.tensors) != 2 or samples.tensors[0].ndim != 5
                or samples.tensors[0].shape[1] != 24):
            raise ValueError("Aeris H3 Carry expects a MiniMax H3 audio+video latent")
        if "noise_mask" in latent:
            raise ValueError("Aeris H3 Carry: the latent already has a noise mask")
        video, sound = samples.tensors
        ctx = grid_frames(min(context_frames, images.shape[0]))
        if ctx < 5:
            raise ValueError(f"Aeris H3 Carry: the previous take has only {images.shape[0]} frames")
        tokens = h3.video_latent_t(ctx)
        if tokens >= video.shape[2]:
            raise ValueError(f"Aeris H3 Carry: this run must be longer than the {ctx} carried frames")
        width, height = video.shape[4] * 16, video.shape[3] * 16
        z = vae.encode(h3._resize(images[-ctx:], width, height, "center"))
        if z.shape[2] != tokens:
            raise ValueError(f"Aeris H3 Carry: {ctx} frames encoded to {z.shape[2]} latents, expected {tokens}")
        video = video.clone()
        video[:, :, :tokens] = z[:1].to(device=video.device, dtype=video.dtype)
        video_mask = torch.ones((1, 1) + tuple(video.shape[2:]), device=video.device)
        video_mask[:, :, :tokens] = 0
        sound_mask = torch.ones((1, 1) + tuple(sound.shape[2:]), device=sound.device)
        if audio is not None and audio_vae is not None:
            za, ta = h3._encode_ref_audio(audio_vae, audio)
            ticks = round(ctx * H3_AUDIO_FPS / H3_FPS)
            start = max(0, min(round((images.shape[0] - ctx) * H3_AUDIO_FPS / H3_FPS), ta - ticks))
            if ta >= ticks and sound.shape[-1] > ticks:
                sound = sound.clone()
                sound[..., :ticks] = za[:1, ..., start:start + ticks].to(device=sound.device, dtype=sound.dtype)
                sound_mask[..., :ticks] = 0
        out = dict(latent)
        out["samples"] = comfy.nested_tensor.NestedTensor((video, sound))
        out["noise_mask"] = comfy.nested_tensor.NestedTensor((video_mask, sound_mask))
        positive = drop_guides_before(positive, ctx)
        if anchor:  # the frozen replay does not pin the first free frame's pose
            positive = h3.MiniMaxH3AddGuide.execute(positive, out, ctx, vae=vae, image=images[-1:]).args[0]
        log.info("aeris: H3 carry of %d frames (%d latents)", ctx, tokens)
        return (positive, out)


class AerisH3TrimStart:
    CATEGORY = "aeris"
    RETURN_TYPES = ("IMAGE", "AUDIO")
    RETURN_NAMES = ("images", "audio")
    FUNCTION = "run"
    DESCRIPTION = "Cuts the frames carried by Aeris H3 Carry (and their sound) from the start of a decoded H3 run."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"images": ("IMAGE",), "audio": ("AUDIO",),
                             "context_frames": ("INT", {"default": 39, "min": 0, "max": 141, "step": 17})},
                "optional": {"carried": ("IMAGE", {"tooltip": "The previous take's frames, to cut exactly what was carried."})}}

    def run(self, images, audio, context_frames, carried=None):
        n = grid_frames(min(context_frames, carried.shape[0])) if carried is not None else grid_frames(context_frames)
        n = min(n, images.shape[0] - 1)
        cut = round(n * audio["sample_rate"] / H3_FPS)
        return (images[n:], {**audio, "waveform": audio["waveform"][..., cut:]})


# ---------------------------------------------------------------- Viggle Remake (adapted, Apache-2.0)
REMAKE_FPS, REMAKE_AUDIO_SR, REMAKE_AUDIO_LATENT_FPS = 24, 32000, 40
REMAKE_MAX_FRAMES = 294   # 17n+5; Viggle's recommended ceiling (~12 s)


def remake_frames(available: int, wanted: int = 0) -> int:
    """The output length: `wanted` when given, else the longest 17n+5 the source covers, between 90 and 294 frames."""
    n = wanted or min(available, REMAKE_MAX_FRAMES)
    n = max(90, (n - 5) // 17 * 17 + 5)
    return n


def remake_stamps(nf: int) -> list:
    """The conditioner's 2 fps block labels for an nf-frame clip (every 12th frame, merged in pairs, mean time)."""
    idx, cursor = [], 0.0
    while round(cursor) < nf:
        if not idx or round(cursor) > idx[-1]:
            idx.append(round(cursor))
        cursor += REMAKE_FPS / 2
    t = [i / 2 for i in range(len(idx))]
    t += t[-1:] * (len(t) % 2)
    return [(t[i] + t[i + 1]) / 2 for i in range(0, len(t), 2)]


def _mmss(seconds: float) -> str:
    return "%02d:%06.3f" % (int(seconds // 60), seconds % 60)


def remake_prompt(mode: str, text: str, replaced: str, n_refs: int, frames: int) -> str:
    """MiniMax H3's six-section prompt for Viggle Remake, written from a plain description. A prompt already in that
    format (it starts with `subject_definitions:`) is used verbatim."""
    text = (text or "").strip()
    if text.lower().startswith("subject_definitions"):
        return text
    pics = [f"<Picture {i + 1}>" for i in range(n_refs)]
    pics_txt = " and ".join([", ".join(pics[:-1]), pics[-1]] if len(pics) > 2 else pics) if pics else ""
    end = _mmss(frames / REMAKE_FPS)
    frame_defs = "\n".join(f"{p} is a frame of the target video, exactly as the target video shows it at that moment." for p in pics)
    refs_ret = "\n".join(f"{p} (appears in [Shot 1]): reference - a frame of the target video; the look of <Subject 1> is taken from it." for p in pics)
    text = text.rstrip(".")
    if mode == "swap":
        who = (replaced or "the main person").strip().rstrip(".")
        return (f"subject_definitions:\n<Video 1> is the source video for the editing task.\n{frame_defs}\n"
                f"<Subject 1> is {text}, exactly as shown in {pics_txt}. <Subject 1> replaces {who} in <Video 1>.\n\n"
                f"summary:\n[video editing + character replacement] The target video is an edited version of <Video 1> in which "
                f"{who} becomes <Subject 1>, looking exactly as in {pics_txt}. The shots, the camera, the motion, the timing, "
                f"the actions, the place and the other people of <Video 1> are kept.\n\n"
                f"retention_analysis:\n<Video 1> (source video editing): fully_preserved - the shots and cuts, the camera framing and "
                f"movement, the location, the light, the other people and the motion and timing of every action are copied frame for frame.\n"
                f"{refs_ret}\n<Subject 1> (appears in [Shot 1]): fully_preserved - the face, hair, body, clothes and colours of "
                f"<Subject 1> stay identical in every frame.\n\n"
                f"detailed_description:\nThe target video keeps the look, the light and the colours of <Video 1>.\n"
                f"[Shot 1] From 00:00.000 to {end}, <Subject 1> does exactly what {who} does in <Video 1>, with the same "
                f"timing, gestures, expressions and camera. In every frame, from the first to the last, {who} is <Subject 1> "
                f"exactly as in {pics_txt}. Only this one figure changes, and everything else stays as in <Video 1>.\n\n"
                f"overall_soundscape:\nThe soundtrack of <Video 1>, unchanged.\n\nnon_diegetic_music:\nN/A")
    return (f"subject_definitions:\n<Video 1> is the source video for the target video edit.\n{frame_defs}\n"
            f"<Subject 1> is what changes: {text}.\n\n"
            f"summary:\n[video editing] The target video is an edited version of <Video 1> in which {text}, with exactly the "
            f"same framing, camera motion, light and timing as <Video 1>.\n\n"
            f"retention_analysis:\n<Video 1> (source video editing): fully_preserved - everything that the change does not "
            f"touch is copied frame for frame: the framing, the camera move, the people, their motion and the timing.\n"
            f"{refs_ret.replace('the look of <Subject 1>', 'the look of the change')}\n<Subject 1> (appears in [Shot 1]): changed - {text}, in every frame.\n\n"
            f"detailed_description:\nThe target video keeps the style and colours of <Video 1>.\n[Shot 1] From 00:00.000 to {end}, "
            f"the shot plays exactly as in <Video 1>, except that {text}, consistently in every frame, as in {pics_txt}.\n\n"
            f"overall_soundscape:\nThe soundtrack of <Video 1>, unchanged.\n\nnon_diegetic_music:\nN/A")


def _lanczos(image, width, height):
    import comfy.utils
    return comfy.utils.common_upscale(image.movedim(-1, 1), width, height, "lanczos", "disabled").movedim(1, -1)


def _cover(image, width, height):
    h, w = image.shape[1], image.shape[2]
    s = max(width / w, height / h)
    sw, sh = max(width, round(w * s)), max(height, round(h * s))
    left, top = (sw - width) // 2, (sh - height) // 2
    return _lanczos(image, sw, sh)[:, top:top + height, left:left + width]


class AerisRemakeConditioning:
    CATEGORY = "Aeris"
    RETURN_TYPES = ("CONDITIONING", "LATENT", "INT")
    RETURN_NAMES = ("positive", "latent", "frames")
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "clip": ("CLIP",), "vae": ("VAE",), "audio_vae": ("VAE",),
            "source": ("IMAGE", {"tooltip": "The source clip's frames at 24 fps: motion, camera, framing and everything not changed."}),
            "mode": (["swap", "edit"], {"tooltip": "swap: replace a character. edit: change the scene (remove, add, restyle)."}),
            "prompt": ("STRING", {"multiline": True, "tooltip": "What the target shows (swap: the new character; edit: what "
                                                                "changes), or a full six-section prompt used verbatim."}),
            "replaced": ("STRING", {"default": "", "tooltip": "swap: who is replaced in the source, e.g. 'the man in the grey hoodie'."}),
            "ref_1": ("IMAGE", {"tooltip": "<Picture 1>: a frame of the source repainted to show the target."}),
            "pins": ("STRING", {"default": "", "tooltip": "Optional: the source frame each picture was painted from, e.g. '12, 190'."}),
            "frames": ("INT", {"default": 0, "min": 0, "max": 345, "tooltip": "Output length (17n+5 frames); 0 = as long as the source, up to 294."}),
            "short_edge": ("INT", {"default": 480, "min": 480, "max": 736, "step": 32, "tooltip": "480 (832x480) or 736 (1280x736)."}),
        }, "optional": {"audio": ("AUDIO",), "ref_2": ("IMAGE",), "ref_3": ("IMAGE",), "ref_4": ("IMAGE",)}}

    def run(self, clip, vae, audio_vae, source, mode, prompt, replaced, ref_1, pins, frames, short_edge,
            audio=None, ref_2=None, ref_3=None, ref_4=None):
        import torch
        import comfy.audio
        import comfy.nested_tensor
        import comfy.utils
        import node_helpers
        nf, se = remake_frames(source.shape[0], frames), short_edge
        refs = [r[:1, ..., :3] for r in (ref_1, ref_2, ref_3, ref_4) if r is not None]
        pins = [int(p) for p in pins.replace(",", " ").split()]
        if (nf - 5) % 17:
            raise ValueError(f"frames must be 17n+5, got {nf}")
        if len(pins) not in (0, len(refs)):
            raise ValueError(f"give one pin per picture or none: {len(pins)} pins, {len(refs)} pictures")
        if not all(0 <= p < nf for p in pins):
            raise ValueError(f"pins must be in [0, {nf})")
        source = source[..., :3]
        h, w = source.shape[1], source.shape[2]
        if min(h, w) != se or h % 32 or w % 32:
            long = se * 16 // 9 // 32 * 32
            w, h = (long, se) if w >= h else (se, long)
            source = comfy.utils.common_upscale(source.movedim(-1, 1), w, h, "bicubic", "center").movedim(1, -1)
        source = source[:nf]
        if source.shape[0] < nf:
            raise ValueError(f"the source has {source.shape[0]} frames at 24 fps, at least 90 are needed (3.75 s)")
        text = remake_prompt(mode, prompt, replaced, len(refs), nf)
        segments = ["<Video 1>: ", *["<%.1f seconds>" % s for s in remake_stamps(nf)],
                    *["<Picture %d>: " % (i + 1) for i in range(len(refs))], text]
        tokens = {"qwen3vl_32b": [[t for s in segments for t in clip.tokenize(s)["qwen3vl_32b"][0]]]}
        positive = clip.encode_from_tokens_scheduled(tokens)
        z = vae.encode(source)
        blocks = [{"kind": "video", "latent_t": z.shape[2], "latent_h": h // 16, "latent_w": w // 16,
                   "ref_audio_t": 0, "latent": z, "audio_latent": None}]
        for r in refs:
            rh, rw = r.shape[1], r.shape[2]
            th = max(32, round(rh * se / min(rh, rw) / 32) * 32)
            tw = max(32, round(rw * se / min(rh, rw) / 32) * 32)
            r = r if (rh, rw) == (th, tw) else _lanczos(r, tw, th)
            blocks.append({"kind": "image", "latent_h": th // 16, "latent_w": tw // 16, "latent": vae.encode(r)})
        keyframes = []
        for i, (r, p) in enumerate(zip(refs, pins)):
            if (r.shape[1], r.shape[2]) != (h, w):
                r = _lanczos(r, w, h) if i == 0 else _cover(r, w, h)
            keyframes.append({"resolved_frame_index": p, "latent": vae.encode(r)})
        values = {"minimax_refs": blocks, "minimax_keyframes": keyframes} if keyframes else {"minimax_refs": blocks}
        positive = node_helpers.conditioning_set_values(positive, values)
        n = round((nf + 1) / REMAKE_FPS * REMAKE_AUDIO_SR)
        wav = torch.zeros(2, n)
        if audio is not None:
            wav, sr = audio["waveform"][0].float(), audio["sample_rate"]
            wav = wav.repeat(2, 1) if wav.shape[0] == 1 else wav[:2]
            wav = wav[:, :round(nf / REMAKE_FPS * sr)]
            wav = comfy.audio.resample(wav, sr, REMAKE_AUDIO_SR) if sr != REMAKE_AUDIO_SR else wav
        wav = torch.nn.functional.pad(wav, (0, max(0, n - wav.shape[1])))[:, :n]
        wav = torch.nn.functional.pad(wav, (0, -n % 800))   # whole 800-sample latent frames, no centre crop
        za = audio_vae.encode(wav[None].movedim(1, -1))[..., :round(nf / REMAKE_FPS * REMAKE_AUDIO_LATENT_FPS)]
        video = torch.zeros(1, 24, (nf - 5) // 17 * 5 + 2, h // 16, w // 16)
        latent = {"samples": comfy.nested_tensor.NestedTensor((video, za)),
                  "noise_mask": comfy.nested_tensor.NestedTensor((torch.ones_like(video), torch.zeros_like(za)))}
        return (positive, latent, nf)


class AerisRemakeKeyframeUntil:
    CATEGORY = "Aeris"
    RETURN_TYPES = ("MODEL",)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",), "keyframe_until": ("FLOAT", {"default": 0.9, "min": 0.0, "max": 1.0, "step": 0.01}),
                             "memory_factor": ("FLOAT", {"default": 2.5, "min": 1.0, "max": 8.0, "step": 0.1,
                                                         "tooltip": "Scales ComfyUI's memory estimate while it loads the model: a bypass "
                                                                    "LoRA and the source video's reference tokens are not counted, so "
                                                                    "without it the text encoder stays on the GPU and sampling runs out of memory."})}}

    def run(self, model, keyframe_until, memory_factor=1.0):
        import comfy.patcher_extension

        def release(executor, x, timestep, context, transformer_options, minimax_payload=None, **kwargs):
            p = minimax_payload or {}
            if p.get("keyframes") and float(timestep.flatten()[0]) / 1000 < keyframe_until:
                refs = p.get("refs") or []
                minimax_payload = dict(p, keyframes=None, layout=None,
                                       cond_video_latents=[r["latent"] for r in refs if "latent" in r],
                                       cond_audio_latents=[r["audio_latent"] for r in refs if r.get("audio_latent") is not None])
            return executor(x, timestep, context, transformer_options, minimax_payload=minimax_payload, **kwargs)

        def prepare(executor, model, *args, **kwargs):   # the factor applies only while the model is being loaded
            base = model.model
            old = base.memory_usage_factor
            base.memory_usage_factor = old * memory_factor
            try:
                return executor(model, *args, **kwargs)
            finally:
                base.memory_usage_factor = old

        m = model.clone()
        m.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, "aeris_remake_keyframe_until", release)
        if memory_factor != 1.0:
            m.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.PREPARE_SAMPLING, "aeris_remake_memory", prepare)
        return (m,)


class _RemakeNoiseSource:
    def __init__(self, seed, skip):
        self.seed, self.skip = seed, skip

    def generate_noise(self, input_latent):
        import torch
        import comfy.nested_tensor
        g = torch.Generator().manual_seed(self.seed)
        for shape in self.skip:
            torch.randn(shape, generator=g)
        return comfy.nested_tensor.NestedTensor([torch.randn(t.shape, generator=g) for t in input_latent["samples"].unbind()])


class AerisRemakeNoise:
    CATEGORY = "Aeris"
    RETURN_TYPES = ("NOISE",)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"positive": ("CONDITIONING",),
                             "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "control_after_generate": True})}}

    def run(self, positive, seed):
        c = positive[0][1]
        skip = [b["latent"].shape for b in c.get("minimax_refs", []) + c.get("minimax_keyframes", []) if "latent" in b]
        return (_RemakeNoiseSource(seed, skip),)


# ---------------------------------------------------------------- MiniMax H3: INT8 attention by default
def h3_int8_attention():
    """Comfy Kitchen's INT8 attention (what ModelAttentionBackend's « comfy kitchen attention » sets) for every H3 run that
    does not pick a backend itself: on the RTX 5090 Mobile it halves H3's sampling time (R2V 480p 5 s: 22 → 11 min, 66 →
    31 s per step) with no visible change at the same seed. A workflow's own ModelAttentionBackend still wins."""
    try:
        import comfy.ldm.minimax.model as h3
        from comfy.ldm.modules.attention import get_attention_function
    except ImportError:   # outside ComfyUI (tests, catalog build) or an engine without H3
        return False
    kitchen = get_attention_function("comfy_kitchen_int8", None)
    if kitchen is None or getattr(h3.optimized_attention, "aeris_int8", False):
        return False
    original = h3.optimized_attention

    def override(_, *args, **kwargs):
        return kitchen(*args, **kwargs)
    if getattr(kitchen, "container_function", None) is not None:
        override.container_function = kitchen.container_function

    def attention(*args, transformer_options=None, **kwargs):
        options = transformer_options if transformer_options is not None else {}
        if "optimized_attention_override" not in options:
            options = {**options, "optimized_attention_override": override}
        return original(*args, transformer_options=options, **kwargs)
    attention.aeris_int8 = True
    h3.optimized_attention = attention
    log.info("aeris: MiniMax H3 uses Comfy Kitchen INT8 attention by default")
    return True


h3_int8_attention()

comfy.lora.model_lora_keys_unet = model_lora_keys_unet
NODE_CLASS_MAPPINGS = {"AerisTrimBorder": AerisTrimBorder, "AerisH3Carry": AerisH3Carry,
                       "AerisH3TrimStart": AerisH3TrimStart, "AerisRemakeConditioning": AerisRemakeConditioning,
                       "AerisRemakeKeyframeUntil": AerisRemakeKeyframeUntil, "AerisRemakeNoise": AerisRemakeNoise}
NODE_DISPLAY_NAME_MAPPINGS = {"AerisTrimBorder": "Aeris Trim Border", "AerisH3Carry": "Aeris H3 Carry",
                              "AerisH3TrimStart": "Aeris H3 Trim Start", "AerisRemakeConditioning": "Aeris Remake Conditioning (Viggle)",
                              "AerisRemakeKeyframeUntil": "Aeris Remake Keyframe Until (Viggle)", "AerisRemakeNoise": "Aeris Remake Noise (Viggle)"}
log.info("aeris: MiniMax H3 Diffusers LoRA names enabled")

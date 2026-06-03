# HF Discussion draft — havenoammo/Qwen3.6-27B-MTP-UD-GGUF

**Where:** https://huggingface.co/havenoammo/Qwen3.6-27B-MTP-UD-GGUF/discussions
Click "New discussion", suggested title:
**Bench: 77 t/s @ full 262K on consumer 24GB Blackwell (am17an MTP branch)**

---

Bench on RTX 5090 Laptop (sm_120, 24 GB), am17an mtp-clean branch, PR #22673:

`-ctk q4_0 -ctv q4_0 --spec-draft-n-max 5 -c 262144`

3-run avg: 77 t/s, 74–80% draft acceptance (Space Invaders HTML prompt, 2000 tokens out).

This is the first config I've found that actually fits the full 262K native context with MTP active on a single 24 GB consumer GPU. froggeric's Q4_K_M-mtp on the same branch caps at 128K and OOMs at MTP draft compute buffer when pushed higher.

The acceptance is what surprised me — 74–80% at 262K vs 64% on Q4_K_M at 128K. The MTP head + attention layers staying at 6/8-bit precision (instead of being uniformly 3-bit like a standard Q3) keeps the drafter aligned. Net result is faster AND longer context.

Thanks for putting this up — unlocks a real long-context use case for 24 GB.

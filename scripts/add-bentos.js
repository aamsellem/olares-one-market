// One-shot: inject bento blocks + multi-categories into all OlaresManifest.yaml files.
// Stays text-based (no YAML reformat) — finds the `categories:` array block and replaces it.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// 32 apps — bento facts curated from project memory + bench results
const APPS = {
  acestepxlone: {
    cats: ['Image Gen'],
    bento: {
      family: 'ace', size_label: 'XL', badge: 'music',
      hero: { value: 'Music', label: 'text-to-audio', sub: 'lyrics → song' },
      specs: [{ label: 'context', value: '4K' }, { label: 'vram', value: '12 GB' }],
      caps: { tool_calling: false, vision: false, audio: true, mtp: false },
      stack: 'PyTorch · Diffusers · ACE-Step XL',
    },
  },
  cascade230a3bone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'nemotron', size_label: '30B-A3B', badge: 'hybrid',
      hero: { value: '85 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '64K' }, { label: 'vram', value: '18 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'llama.cpp · Q4_K_S · NemotronH MoE',
    },
  },
  devstralsmallone: {
    cats: ['Coding', 'AI Agents'],
    bento: {
      family: 'mistral', size_label: '24B', badge: 'swe-bench',
      hero: { value: '53.6%', label: 'swe-bench verified' },
      specs: [{ label: 'context', value: '128K' }, { label: 'vram', value: '17 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'llama.cpp · UD-Q5_K_XL · Devstral',
    },
  },
  exl3qwen35a3bone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'qwen', size_label: '35B-A3B', badge: 'exl3',
      hero: { value: '110 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '20 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'ExLlamaV3 · 3.5bpw · MoE',
    },
  },
  gemma426ba4bone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'gemma', size_label: '26B-A4B', badge: 'efficient',
      hero: { value: '140 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '128K' }, { label: 'vram', value: '19 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: true },
      stack: 'llama.cpp · Q4_K_M · Atomic fork',
    },
  },
  gemma4e2bone: {
    cats: ['Audio', 'LLM Chat'],
    bento: {
      family: 'gemma', size_label: 'E2B', badge: 'voice',
      hero: { value: '230 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '4 GB' }],
      caps: { tool_calling: true, vision: false, audio: true, mtp: false },
      stack: 'llama.cpp · USM Conformer · audio in',
    },
  },
  llamacppgemma4audione: {
    cats: ['Audio'],
    bento: {
      family: 'gemma', size_label: 'E4B', badge: 'audio',
      hero: { value: '30s', label: 'audio input max' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '6 GB' }],
      caps: { tool_calling: true, vision: false, audio: true, mtp: false },
      stack: 'llama.cpp · USM Conformer · mmproj BF16',
    },
  },
  llamacppglm47flash: {
    cats: ['LLM Chat'],
    bento: {
      family: 'other', size_label: 'Flash', badge: 'glm',
      hero: { value: 'GLM-4.7', label: 'zhipu flash' },
      specs: [{ label: 'context', value: '128K' }, { label: 'vram', value: '18 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'llama.cpp · GLM-4.7-Flash',
    },
  },
  llamacppnemotron30a3bone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'nemotron', size_label: '30B-A3B', badge: 'nano',
      hero: { value: '95 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '64K' }, { label: 'vram', value: '17 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'llama.cpp · UD-Q4_K_XL · NemotronH',
    },
  },
  llamacppqwen35a3bone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'qwen', size_label: '35B-A3B', badge: 'classic',
      hero: { value: '129 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '16K' }, { label: 'vram', value: '22 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'llama.cpp · UD-Q4_K_XL · Qwen 3.5',
    },
  },
  llamacppqwen35iq4one: {
    cats: ['LLM Chat'],
    bento: {
      family: 'qwen', size_label: '35B IQ4', badge: 'long ctx',
      hero: { value: '120 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '128K' }, { label: 'vram', value: '17 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'llama.cpp · IQ4_XS · 128K ctx',
    },
  },
  llamacppqwen36a3bone: {
    cats: ['LLM Chat', 'AI Agents'],
    bento: {
      family: 'qwen', size_label: '35B-A3B', badge: 'champion',
      hero: { value: '246 t/s', label: 'fastest on Olares One' },
      specs: [{ label: 'context', value: '262K' }, { label: 'vram', value: '17.2 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: true, mtp_accept: 86.6 },
      stack: 'llama.cpp · Q3_K_XL · A3B MoE',
    },
  },
  llamacppqwen36beellamaone: {
    cats: ['LLM Chat', 'AI Agents'],
    bento: {
      family: 'qwen', size_label: '27B', badge: 'beellama',
      hero: { value: '107 t/s', label: 'speed @ 262K' },
      specs: [{ label: 'context', value: '262K' }, { label: 'vram', value: '20 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: true, mtp_accept: 25 },
      stack: 'BeeLlama · DFlash · turbo3 KV',
    },
  },
  llamacppqwen36beellamavisionone: {
    cats: ['Vision', 'AI Agents'],
    bento: {
      family: 'qwen', size_label: '27B', badge: 'vision',
      hero: { value: '106 t/s', label: 'speed + vision' },
      specs: [{ label: 'context', value: '200K' }, { label: 'vram', value: '22 GB' }],
      caps: { tool_calling: true, vision: true, audio: false, mtp: true, mtp_accept: 24 },
      stack: 'BeeLlama · DFlash · mmproj BF16',
    },
  },
  llamacppqwen36dflashone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'qwen', size_label: '27B', badge: 'dflash',
      hero: { value: '76 t/s', label: 'speed @ 96K' },
      specs: [{ label: 'context', value: '96K' }, { label: 'vram', value: '21 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: true, mtp_accept: 25 },
      stack: 'llama.cpp · DFlash · turbo3 KV',
    },
  },
  llamacppqwen36mtpone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'qwen', size_label: '27B', badge: 'long ctx',
      hero: { value: '72 t/s', label: 'speed @ 262K' },
      specs: [{ label: 'context', value: '262K' }, { label: 'vram', value: '20 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: true, mtp_accept: 64 },
      stack: 'llama.cpp · Q3_K_XL · MTP',
    },
  },
  nemotron3nano4bone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'nemotron', size_label: '4B', badge: 'nano',
      hero: { value: '180 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '4 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'llama.cpp · Q5_K_XL · Nemotron 3 Nano',
    },
  },
  nemotronlabselastic30bnvfp4one: {
    cats: ['LLM Chat', 'AI Agents'],
    bento: {
      family: 'nemotron', size_label: '30B-A3B', badge: 'nvfp4',
      hero: { value: '182 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '19 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'vLLM · NVFP4 native · Blackwell tensor',
    },
  },
  omnivoiceone: {
    cats: ['TTS'],
    bento: {
      family: 'other', size_label: 'OmniVoice', badge: 'tts',
      hero: { value: 'TTS', label: 'text-to-speech' },
      specs: [{ label: 'context', value: '4K' }, { label: 'vram', value: '8 GB' }],
      caps: { tool_calling: false, vision: false, audio: true, mtp: false },
      stack: 'PyTorch · OmniVoice',
    },
  },
  qwen35a3bvisionone: {
    cats: ['Vision'],
    bento: {
      family: 'qwen', size_label: '35B-A3B', badge: 'vision',
      hero: { value: '131 t/s', label: 'speed + vision' },
      specs: [{ label: 'context', value: '16K' }, { label: 'vram', value: '23 GB' }],
      caps: { tool_calling: true, vision: true, audio: false, mtp: false },
      stack: 'llama.cpp · UD-Q4_K_XL · mmproj F16',
    },
  },
  qwen35iq4visionone: {
    cats: ['Vision'],
    bento: {
      family: 'qwen', size_label: '35B IQ4', badge: 'vision long',
      hero: { value: '118 t/s', label: 'speed + vision' },
      specs: [{ label: 'context', value: '64K' }, { label: 'vram', value: '18 GB' }],
      caps: { tool_calling: true, vision: true, audio: false, mtp: false },
      stack: 'llama.cpp · IQ4_XS · vision',
    },
  },
  qwen36a3bvisionone: {
    cats: ['Vision', 'AI Agents'],
    bento: {
      family: 'qwen', size_label: '35B-A3B', badge: 'vision',
      hero: { value: '120 t/s', label: 'speed + vision' },
      specs: [{ label: 'context', value: '64K' }, { label: 'vram', value: '22 GB' }],
      caps: { tool_calling: true, vision: true, audio: false, mtp: false },
      stack: 'llama.cpp · Q3_K_XL · mmproj BF16',
    },
  },
  qwen3coder30a3bone: {
    cats: ['Coding', 'AI Agents'],
    bento: {
      family: 'qwen', size_label: '30B-A3B', badge: 'coder',
      hero: { value: '130 t/s', label: 'coding speed' },
      specs: [{ label: 'context', value: '256K' }, { label: 'vram', value: '17 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'llama.cpp · UD-Q4_K_XL · Coder',
    },
  },
  qwen3ttstone: {
    cats: ['TTS'],
    bento: {
      family: 'qwen', size_label: '1.7B', badge: 'tts',
      hero: { value: 'TTS', label: 'qwen voice' },
      specs: [{ label: 'context', value: '8K' }, { label: 'vram', value: '4 GB' }],
      caps: { tool_calling: false, vision: false, audio: true, mtp: false },
      stack: 'llama.cpp · Qwen3-TTS 1.7B',
    },
  },
  vllmgemma426ba4bvisionone: {
    cats: ['Vision', 'AI Agents'],
    bento: {
      family: 'gemma', size_label: '26B-A4B', badge: 'vision',
      hero: { value: '136 t/s', label: 'speed + vision' },
      specs: [{ label: 'context', value: '128K' }, { label: 'vram', value: '22 GB' }],
      caps: { tool_calling: true, vision: true, audio: false, mtp: false },
      stack: 'vLLM · AWQ · triton_attn · fp8 KV',
    },
  },
  vllmgemma4dflashone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'gemma', size_label: '26B-A4B', badge: 'dflash',
      hero: { value: '224 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '128K' }, { label: 'vram', value: '21 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'vLLM · AWQ · DFlash drafter',
    },
  },
  vllmgemma4e4bone: {
    cats: ['Audio', 'LLM Chat'],
    bento: {
      family: 'gemma', size_label: 'E4B', badge: 'voice mtp',
      hero: { value: '178 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '6 GB' }],
      caps: { tool_calling: true, vision: false, audio: true, mtp: true, mtp_accept: 77 },
      stack: 'vLLM · Gemma4MTP · centroids',
    },
  },
  vllmqwen3527bone: {
    cats: ['LLM Chat'],
    bento: {
      family: 'qwen', size_label: '27B', badge: 'nvfp4',
      hero: { value: '100 t/s', label: 'speed' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '19 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: false },
      stack: 'vLLM · NVFP4 native · Blackwell',
    },
  },
  vllmqwen36turbo27bone: {
    cats: ['LLM Chat', 'AI Agents'],
    bento: {
      family: 'qwen', size_label: '27B', badge: 'turbo',
      hero: { value: '88 t/s', label: 'speed @ 88K' },
      specs: [{ label: 'context', value: '88K' }, { label: 'vram', value: '20 GB' }],
      caps: { tool_calling: true, vision: false, audio: false, mtp: true, mtp_accept: 75 },
      stack: 'vLLM · TurboQuant K8V4 · MTP n=3',
    },
  },
  vllmvoxtral3bone: {
    cats: ['Audio'],
    bento: {
      family: 'voxtral', size_label: 'Mini 3B', badge: 'asr',
      hero: { value: 'ASR', label: 'speech recognition' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '6 GB' }],
      caps: { tool_calling: false, vision: false, audio: true, mtp: false },
      stack: 'vLLM · Voxtral Mini · audio in',
    },
  },
  vllmvoxtralrt4bone: {
    cats: ['Audio'],
    bento: {
      family: 'voxtral', size_label: '4B', badge: 'realtime',
      hero: { value: 'Live', label: 'streaming asr' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '8 GB' }],
      caps: { tool_calling: false, vision: false, audio: true, mtp: false },
      stack: 'vLLM · Voxtral RT · low-latency',
    },
  },
  vllmvoxtraltts4bone: {
    cats: ['TTS'],
    bento: {
      family: 'voxtral', size_label: '4B', badge: 'tts',
      hero: { value: 'TTS', label: 'voice synth' },
      specs: [{ label: 'context', value: '32K' }, { label: 'vram', value: '8 GB' }],
      caps: { tool_calling: false, vision: false, audio: true, mtp: false },
      stack: 'vLLM · Voxtral TTS 4B',
    },
  },
}

function formatBentoYaml(b, cats, indent = '  ') {
  const lines = []
  lines.push(`${indent}categories:`)
  for (const c of cats) lines.push(`${indent}  - ${c}`)
  lines.push(`${indent}bento:`)
  lines.push(`${indent}  family: ${b.family}`)
  if (b.size_label) lines.push(`${indent}  size_label: "${b.size_label}"`)
  if (b.badge) lines.push(`${indent}  badge: ${b.badge}`)
  lines.push(`${indent}  hero:`)
  lines.push(`${indent}    value: "${b.hero.value}"`)
  lines.push(`${indent}    label: "${b.hero.label}"`)
  if (b.hero.sub) lines.push(`${indent}    sub: "${b.hero.sub}"`)
  lines.push(`${indent}  specs:`)
  for (const s of b.specs) lines.push(`${indent}    - { label: "${s.label}", value: "${s.value}" }`)
  const c = b.caps
  lines.push(`${indent}  capabilities:`)
  lines.push(`${indent}    tool_calling: ${!!c.tool_calling}`)
  lines.push(`${indent}    vision:       ${!!c.vision}`)
  lines.push(`${indent}    audio:        ${!!c.audio}`)
  if (c.mtp) {
    if (c.mtp_accept) lines.push(`${indent}    mtp:          { enabled: true, accept: ${c.mtp_accept} }`)
    else lines.push(`${indent}    mtp:          { enabled: true }`)
  } else {
    lines.push(`${indent}    mtp:          { enabled: false }`)
  }
  lines.push(`${indent}  stack: "${b.stack}"`)
  return lines.join('\n')
}

function processApp(appName, def) {
  const file = join(ROOT, appName, 'OlaresManifest.yaml')
  if (!existsSync(file)) {
    console.log(`  skip ${appName} (no manifest)`)
    return
  }
  let raw = readFileSync(file, 'utf8')

  // Match the categories: block (may already include bento). Replace from `categories:` line up through (but not including) the next sibling-level key.
  // categories key is at 2-space indent under metadata. Next sibling is either `entrances:` at 0-space, or `spec:`, or end of metadata.
  const newBlock = formatBentoYaml(def.bento, def.cats)
  const re = /^  categories:[\s\S]*?(?=^(?:entrances:|spec:|permission:|options:|user:))/m
  if (!re.test(raw)) {
    console.log(`  warn ${appName} (no categories block found)`)
    return
  }
  raw = raw.replace(re, newBlock + '\n')
  writeFileSync(file, raw)
  console.log(`  ok   ${appName}`)
}

let done = 0
for (const [name, def] of Object.entries(APPS)) {
  processApp(name, def)
  done++
}
console.log(`\nProcessed ${done} apps.`)

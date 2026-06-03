// Generate impactful Bento PNG screenshots for Olares One Market apps.
// Asymmetric grid + decorative SVG graphics (speedometer, progress bar, icons).
// Reads `metadata.bento` from each OlaresManifest.yaml.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FONTS_DIR = join(__dirname, 'fonts')
const OUT_DIR = join(ROOT, 'public', 'screenshots')

const W = 1200
const H = 800
const PAD = 28
const GAP = 18
const R_LG = 36

const FONTS = [
  { name: 'Inter', data: readFileSync(join(FONTS_DIR, 'Inter-Regular.otf')), weight: 400, style: 'normal' },
  { name: 'Inter', data: readFileSync(join(FONTS_DIR, 'Inter-SemiBold.otf')), weight: 600, style: 'normal' },
  { name: 'Inter', data: readFileSync(join(FONTS_DIR, 'Inter-Bold.otf')), weight: 700, style: 'normal' },
]

const FAMILY = {
  qwen:     { brand: '#615CEB', deep: '#3B36B0', light: '#EFEDFF', tintBg: '#E9E5FF', mono: 'Q', name: 'Qwen' },
  gemma:    { brand: '#EA4335', deep: '#B12D22', light: '#FFEFEC', tintBg: '#FFE3DE', mono: 'G', name: 'Gemma' },
  nemotron: { brand: '#76B900', deep: '#558700', light: '#EEF7DC', tintBg: '#E3F2C7', mono: 'N', name: 'Nemotron' },
  deepseek: { brand: '#4D6BFE', deep: '#2B47C9', light: '#E8EEFF', tintBg: '#DCE5FF', mono: 'D', name: 'DeepSeek' },
  llama:    { brand: '#FF7700', deep: '#C75A00', light: '#FFEFE0', tintBg: '#FFE3CC', mono: 'L', name: 'Llama' },
  mistral:  { brand: '#FF6F00', deep: '#C75300', light: '#FFEEDC', tintBg: '#FFE0BD', mono: 'M', name: 'Mistral' },
  voxtral:  { brand: '#FFB000', deep: '#C78800', light: '#FFF5DC', tintBg: '#FFEAB8', mono: 'V', name: 'Voxtral' },
  flux:     { brand: '#111114', deep: '#000000', light: '#EDEDEF', tintBg: '#DCDCDF', mono: 'F', name: 'FLUX' },
  ace:      { brand: '#00B2D6', deep: '#0089A8', light: '#DDF5FB', tintBg: '#C7EDF6', mono: 'A', name: 'ACE-Step' },
  other:    { brand: '#5A5A66', deep: '#3A3A45', light: '#ECECF0', tintBg: '#DCDCE3', mono: '·', name: '' },
}

const INK = '#14141C'
const INK_DIM = '#4A4A55'
const INK_FAINT = '#8A8A95'

// Convert numeric value with suffix (eg "262K" → 262000, "1.2M" → 1200000)
function parseNum(v) {
  if (!v) return 0
  const m = String(v).match(/([\d.]+)\s*([kKmM]?)/)
  if (!m) return 0
  const n = parseFloat(m[1])
  const s = m[2].toLowerCase()
  return s === 'm' ? n * 1e6 : s === 'k' ? n * 1e3 : n
}

function text(content, style = {}) {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children: content } }
}

// SVG icon — minimal stroke based glyphs for capabilities
const ICONS = {
  tool:  '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-6.3 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.7 2.7-2-2 2.7-2.7Z"/></svg>',
  bolt:  '<svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
  eye:   '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3.2"/></svg>',
  audio: '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12v0M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>',
}

// Smooth gradient area-curve sparkline. Generates a wave through `points` (0..1 range Y).
// Style matches the reference image's MRR chart.
function sparklineSvg(points, color, accentColor, w = 600, h = 140) {
  const n = points.length
  const step = w / (n - 1)
  // Catmull-Rom smoothing → cubic bezier
  function smooth(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`
    }
    return d
  }
  const xy = points.map((y, i) => [i * step, h - (h - 18) * y - 12])
  const linePath = smooth(xy)
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`
  const gradId = `sparkgrad_${Math.random().toString(36).slice(2, 8)}`
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#${gradId})"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${xy[xy.length - 1][0]}" cy="${xy[xy.length - 1][1]}" r="6" fill="${color}"/>
    <circle cx="${xy[xy.length - 1][0]}" cy="${xy[xy.length - 1][1]}" r="11" fill="${color}" fill-opacity="0.25"/>
  </svg>`
}

function svgImage(svgString, w, h) {
  // satori needs <img src=data:image/svg+xml;base64,...>
  const b64 = Buffer.from(svgString, 'utf8').toString('base64')
  return {
    type: 'img',
    props: { src: `data:image/svg+xml;base64,${b64}`, width: w, height: h, style: { display: 'block' } },
  }
}

function dot(color, size = 12) {
  return {
    type: 'div',
    props: { style: { width: size, height: size, borderRadius: 999, background: color, display: 'flex' } },
  }
}

function buildBento(b, name) {
  const fam = FAMILY[b.family] || FAMILY.other
  const heroSpec = b.hero || { value: '—', label: name }
  const ctxSpec = (b.specs || []).find((s) => /context|ctx/i.test(s.label)) || null
  const vramSpec = (b.specs || []).find((s) => /vram|memory/i.test(s.label)) || null
  const cap = b.capabilities || {}
  const mtp = cap.mtp && (cap.mtp.enabled !== false)
    ? { on: true, label: cap.mtp.accept ? `${cap.mtp.accept}% accept` : 'enabled' }
    : { on: false, label: null }
  const stackLine = b.stack || ''
  const title = b.title || name
  const badge = b.badge ? b.badge.toUpperCase().replace(/-/g, ' ') : null

  // Sparkline curve — pseudo-random but stable per app, ending high (champion narrative)
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  function rand(i) { return ((Math.sin(seed * 9.27 + i * 3.71) + 1) / 2) }
  // generate ascending-trending curve: low → high
  const sparkPoints = Array.from({ length: 12 }, (_, i) => {
    const trend = 0.25 + (i / 11) * 0.65   // baseline rises from 0.25 to 0.90
    const noise = (rand(i) - 0.5) * 0.18    // ±9% wobble
    return Math.max(0.05, Math.min(0.95, trend + noise))
  })

  // capability card — strong active/inactive dichotomy
  // ACTIVE   = filled with family brand color, white text + icon, status pill "ACTIVE"
  // INACTIVE = pale grey, muted icon + text, status pill "—"
  function capCell(label, on, sub, iconKey) {
    const iconColor = on ? '#FFFFFF' : '#B6B6BE'
    const icon = ICONS[iconKey].replace(/currentColor/g, iconColor)
    const bg = on ? fam.brand : '#EFEFF3'
    const labelColor = on ? '#FFFFFF' : INK_DIM
    const subColor = on ? 'rgba(255,255,255,0.82)' : INK_FAINT
    const pillBg = on ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.06)'
    const pillColor = on ? '#FFFFFF' : INK_FAINT
    return {
      type: 'div',
      props: {
        style: {
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          flex: 1, padding: 24, borderRadius: R_LG,
          background: bg, position: 'relative', overflow: 'hidden',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
              children: [
                svgImage(icon, 48, 48),
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex', padding: '6px 12px', borderRadius: 999,
                      background: pillBg, color: pillColor,
                      fontSize: 13, fontWeight: 700, letterSpacing: 1.2,
                    },
                    children: on ? 'ACTIVE' : 'OFF',
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', gap: 2 },
              children: [
                text(label, { fontSize: 24, fontWeight: 700, color: labelColor, letterSpacing: -0.4 }),
                text(on ? (sub || 'supported') : 'not available', { fontSize: 15, fontWeight: 500, color: subColor }),
              ],
            },
          },
        ],
      },
    }
  }

  // Decorative blob inside the brand card
  const brandBlob = `<svg width="500" height="280" viewBox="0 0 500 280" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="g" cx="80%" cy="20%" r="60%"><stop offset="0%" stop-color="white" stop-opacity="0.35"/><stop offset="100%" stop-color="white" stop-opacity="0"/></radialGradient></defs>
    <circle cx="430" cy="40" r="180" fill="url(#g)"/>
    <circle cx="480" cy="240" r="110" fill="white" fill-opacity="0.08"/>
  </svg>`

  return {
    type: 'div',
    props: {
      style: {
        width: W, height: H,
        display: 'flex', flexDirection: 'column', gap: GAP,
        background: fam.tintBg, padding: PAD, fontFamily: 'Inter',
      },
      children: [
        // === Row 1 — Brand (450w) + Hero (rest) ===
        {
          type: 'div',
          props: {
            style: { display: 'flex', gap: GAP, height: 280 },
            children: [
              // Brand card
              {
                type: 'div',
                props: {
                  style: {
                    width: 450, padding: 32, borderRadius: R_LG,
                    background: fam.brand, color: '#FFFFFF',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    position: 'relative', overflow: 'hidden',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', position: 'absolute', top: 0, left: 0, width: 500, height: 280 },
                        children: svgImage(brandBlob, 500, 280),
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, zIndex: 1 },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 72, height: 72, borderRadius: 22,
                                background: 'rgba(255,255,255,0.22)',
                                fontSize: 44, fontWeight: 700,
                              },
                              children: fam.mono,
                            },
                          },
                          text(fam.name || 'Olares One', {
                            fontSize: 28, fontWeight: 600, opacity: 0.92,
                          }),
                        ],
                      },
                    },
                    text(title, { fontSize: 44, fontWeight: 700, lineHeight: 1.05, zIndex: 1 }),
                  ],
                },
              },
              // Hero t/s card with smooth wave sparkline
              {
                type: 'div',
                props: {
                  style: {
                    flex: 1, padding: 32, borderRadius: R_LG, background: '#FFFFFF',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    position: 'relative', overflow: 'hidden',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 },
                        children: [
                          text(heroSpec.label || 'speed', {
                            fontSize: 18, fontWeight: 600, color: INK_FAINT,
                            letterSpacing: 0.5, textTransform: 'uppercase',
                          }),
                          badge ? {
                            type: 'div',
                            props: {
                              style: {
                                display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
                                padding: '6px 12px', borderRadius: 999, background: fam.light,
                              },
                              children: [
                                text('★', { fontSize: 16, color: fam.brand }),
                                text(badge, { fontSize: 14, fontWeight: 700, color: fam.deep, letterSpacing: 0.6 }),
                              ],
                            },
                          } : null,
                        ].filter(Boolean),
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'column', zIndex: 2 },
                        children: [
                          text(heroSpec.value, {
                            fontSize: 170, fontWeight: 700, color: INK,
                            lineHeight: 0.9, letterSpacing: -7,
                          }),
                          text(heroSpec.sub || 'tokens / second', {
                            fontSize: 22, fontWeight: 600, color: INK_FAINT, marginTop: 6,
                          }),
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        // === Row 2 — Context (with progress bar) + VRAM + Stack ===
        {
          type: 'div',
          props: {
            style: { display: 'flex', gap: GAP, height: 200 },
            children: [
              // Context — dark card with positive framing (no %), tokens label below
              ctxSpec ? {
                type: 'div',
                props: {
                  style: {
                    width: 380, padding: 28, borderRadius: R_LG,
                    background: INK, color: '#FFFFFF',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  },
                  children: [
                    text('context', {
                      fontSize: 18, fontWeight: 600, opacity: 0.6, letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }),
                    text(ctxSpec.value, {
                      fontSize: 108, fontWeight: 700, lineHeight: 0.95, letterSpacing: -4,
                      color: fam.light,
                    }),
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 },
                        children: [
                          {
                            type: 'div',
                            props: {
                              style: { width: 6, height: 6, borderRadius: 999, background: fam.brand, display: 'flex' },
                            },
                          },
                          text(ctxSpec.sub || 'tokens · full native', {
                            fontSize: 18, fontWeight: 600, color: fam.light, opacity: 0.85,
                          }),
                        ],
                      },
                    },
                  ],
                },
              } : null,
              // VRAM
              vramSpec ? {
                type: 'div',
                props: {
                  style: {
                    width: 260, padding: 28, borderRadius: R_LG, background: '#FFFFFF',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  },
                  children: [
                    text('vram', {
                      fontSize: 18, fontWeight: 600, color: INK_FAINT, letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }),
                    text(vramSpec.value, {
                      fontSize: 64, fontWeight: 700, color: INK, lineHeight: 1, letterSpacing: -2,
                    }),
                    text('of 24 GB', { fontSize: 16, fontWeight: 500, color: INK_FAINT }),
                  ],
                },
              } : null,
              // Stack info
              stackLine ? {
                type: 'div',
                props: {
                  style: {
                    flex: 1, padding: 28, borderRadius: R_LG, background: '#FFFFFF',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 },
                        children: [
                          dot(fam.brand, 10),
                          text('inference stack', {
                            fontSize: 18, fontWeight: 600, color: INK_FAINT, letterSpacing: 0.5,
                            textTransform: 'uppercase',
                          }),
                        ],
                      },
                    },
                    text(stackLine, { fontSize: 24, fontWeight: 600, color: INK, lineHeight: 1.3 }),
                  ],
                },
              } : null,
            ].filter(Boolean),
          },
        },
        // === Row 3 — Capabilities (4 cells with icons) ===
        {
          type: 'div',
          props: {
            style: { display: 'flex', gap: GAP, flex: 1 },
            children: [
              capCell('Tool calling', !!cap.tool_calling, cap.tool_calling ? 'BFCL-class agent' : null, 'tool'),
              capCell('MTP draft', mtp.on, mtp.label, 'bolt'),
              capCell('Vision', !!cap.vision, cap.vision ? 'image input' : null, 'eye'),
              capCell('Audio', !!cap.audio, cap.audio ? 'audio input' : null, 'audio'),
            ],
          },
        },
      ],
    },
  }
}

function loadManifest(appDir) {
  const path = join(appDir, 'OlaresManifest.yaml')
  if (!existsSync(path)) return null
  let raw = readFileSync(path, 'utf8')
  raw = raw.replace(/\{\{-?\s*if[^}]*\}\}([\s\S]*?)(?:\{\{-?\s*else\s*-?\}\}([\s\S]*?))?\{\{-?\s*end\s*-?\}\}/g, '$1')
  raw = raw.replace(/\{\{[^}]*\}\}/g, '""')
  try { return yaml.load(raw) } catch (_) { return null }
}

async function renderApp(appDir, appName) {
  const mf = loadManifest(appDir)
  if (!mf || !mf.metadata || !mf.metadata.bento) return { skipped: true, reason: 'no bento block' }
  const bento = { ...mf.metadata.bento, title: mf.metadata.title || mf.metadata.bento.title }
  const tree = buildBento(bento, appName)
  const svg = await satori(tree, { width: W, height: H, fonts: FONTS })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng()
  mkdirSync(OUT_DIR, { recursive: true })
  const outPath = join(OUT_DIR, `${appName}-bento.png`)
  writeFileSync(outPath, png)
  return { skipped: false, outPath, bytes: png.length }
}

async function main() {
  const target = process.argv[2]
  const entries = readdirSync(ROOT).filter((e) => {
    const p = join(ROOT, e)
    return statSync(p).isDirectory() && existsSync(join(p, 'OlaresManifest.yaml'))
  })
  const targets = target ? entries.filter((e) => e === target) : entries
  let done = 0, skipped = 0
  for (const e of targets) {
    const r = await renderApp(join(ROOT, e), e)
    if (r.skipped) { console.log(`  skip ${e}`); skipped++ } else { console.log(`  ok   ${e} → ${r.outPath} (${(r.bytes / 1024).toFixed(1)} KB)`); done++ }
  }
  console.log(`\nGenerated ${done} bento PNG${done === 1 ? '' : 's'}, skipped ${skipped}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })

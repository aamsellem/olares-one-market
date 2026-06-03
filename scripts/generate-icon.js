// Generate coherent square icons for Olares One Market apps.
// Family-color background + monogram + size badge — matches the bento design system.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FONTS_DIR = join(__dirname, 'fonts')
const OUT_DIR = join(ROOT, 'public', 'icons')

const SIZE = 512
const FONTS = [
  { name: 'Inter', data: readFileSync(join(FONTS_DIR, 'Inter-Regular.otf')), weight: 400, style: 'normal' },
  { name: 'Inter', data: readFileSync(join(FONTS_DIR, 'Inter-SemiBold.otf')), weight: 600, style: 'normal' },
  { name: 'Inter', data: readFileSync(join(FONTS_DIR, 'Inter-Bold.otf')), weight: 700, style: 'normal' },
]

const FAMILY = {
  qwen:     { primary: '#615CEB', secondary: '#9C97FF', mono: 'Q' },
  gemma:    { primary: '#EA4335', secondary: '#FF7A6A', mono: 'G' },
  nemotron: { primary: '#76B900', secondary: '#A8E243', mono: 'N' },
  deepseek: { primary: '#4D6BFE', secondary: '#86A2FF', mono: 'D' },
  llama:    { primary: '#FF7700', secondary: '#FFB066', mono: 'L' },
  mistral:  { primary: '#FF6F00', secondary: '#FFA040', mono: 'M' },
  voxtral:  { primary: '#FFB000', secondary: '#FFD66B', mono: 'V' },
  flux:     { primary: '#FFFFFF', secondary: '#C0C0C0', mono: 'F' },
  ace:      { primary: '#00C2FF', secondary: '#5BE0FF', mono: 'A' },
  hermes:   { primary: '#1A0F2E', secondary: '#5B3B92', mono: 'H' },
  other:    { primary: '#888888', secondary: '#BBBBBB', mono: '·' },
}

function loadManifest(appDir) {
  const path = join(appDir, 'OlaresManifest.yaml')
  if (!existsSync(path)) return null
  let raw = readFileSync(path, 'utf8')
  raw = raw.replace(/\{\{-?\s*if[^}]*\}\}([\s\S]*?)(?:\{\{-?\s*else\s*-?\}\}([\s\S]*?))?\{\{-?\s*end\s*-?\}\}/g, '$1')
  raw = raw.replace(/\{\{[^}]*\}\}/g, '""')
  try { return yaml.load(raw) } catch (_) { return null }
}

function buildIcon(b, name) {
  const fam = FAMILY[b.family] || FAMILY.other
  const sizeLabel = b.size_label || ''
  const oneBadge = b.olares_one !== false  // default true; mark "One" device app

  return {
    type: 'div',
    props: {
      style: {
        width: SIZE, height: SIZE,
        display: 'flex', flexDirection: 'column',
        background: `linear-gradient(135deg, ${fam.primary} 0%, ${fam.secondary} 100%)`,
        position: 'relative', overflow: 'hidden',
        fontFamily: 'Inter',
      },
      children: [
        // Inner soft circle (depth)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute', top: -120, right: -120,
              width: 380, height: 380, borderRadius: 999,
              background: 'rgba(255,255,255,0.10)', display: 'flex',
            },
          },
        },
        // Monogram centered
        {
          type: 'div',
          props: {
            style: {
              width: SIZE, height: SIZE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            },
            children: {
              type: 'div',
              props: {
                style: { display: 'flex', fontSize: 280, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 },
                children: fam.mono,
              },
            },
          },
        },
        // Size label bottom-left
        sizeLabel ? {
          type: 'div',
          props: {
            style: {
              position: 'absolute', left: 36, bottom: 32, display: 'flex',
              fontSize: 44, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: -1,
            },
            children: sizeLabel,
          },
        } : null,
        // "ONE" badge bottom-right
        oneBadge ? {
          type: 'div',
          props: {
            style: {
              position: 'absolute', right: 28, bottom: 28, display: 'flex',
              padding: '8px 16px', borderRadius: 999,
              background: 'rgba(0,0,0,0.32)',
              fontSize: 24, fontWeight: 700, color: '#FFFFFF', letterSpacing: 2,
            },
            children: 'ONE',
          },
        } : null,
      ].filter(Boolean),
    },
  }
}

async function renderApp(appDir, appName) {
  const mf = loadManifest(appDir)
  if (!mf || !mf.metadata || !mf.metadata.bento) return { skipped: true, reason: 'no bento' }
  const b = mf.metadata.bento
  const tree = buildIcon(b, appName)
  const svg = await satori(tree, { width: SIZE, height: SIZE, fonts: FONTS })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng()
  mkdirSync(OUT_DIR, { recursive: true })
  const outPath = join(OUT_DIR, `${appName}.png`)
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
    if (r.skipped) {
      console.log(`  skip ${e} (${r.reason})`)
      skipped++
    } else {
      console.log(`  ok   ${e} → ${r.outPath} (${(r.bytes / 1024).toFixed(1)} KB)`)
      done++
    }
  }
  console.log(`\nGenerated ${done} icon${done === 1 ? '' : 's'}, skipped ${skipped}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })

// One-shot: bump patch version +1 on all 32 apps to force device cache invalidation.
// Necessary because beclab/market only re-fetches detail when chart version changes.
// After bento+categories rollout on 2026-05-23, 15/32 apps had stale ['AI'] category.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function bumpPatch(version) {
  const m = String(version).match(/^['"]?(\d+)\.(\d+)\.(\d+)['"]?$/)
  if (!m) return null
  return `${m[1]}.${m[2]}.${parseInt(m[3], 10) + 1}`
}

function processApp(dir) {
  const name = dir
  const appDir = join(ROOT, dir)
  const chart = join(appDir, 'Chart.yaml')
  const manifest = join(appDir, 'OlaresManifest.yaml')
  if (!existsSync(chart) || !existsSync(manifest)) return null

  let chartRaw = readFileSync(chart, 'utf8')
  let manifestRaw = readFileSync(manifest, 'utf8')

  // Chart.yaml: version: 'X.Y.Z' and appVersion: 'X.Y.Z'
  const cmV = chartRaw.match(/^version:\s*['"]?(\d+\.\d+\.\d+)['"]?$/m)
  const cmAV = chartRaw.match(/^appVersion:\s*['"]?(\d+\.\d+\.\d+)['"]?$/m)
  if (!cmV) return null
  const newV = bumpPatch(cmV[1])

  chartRaw = chartRaw.replace(/^version:\s*['"]?\d+\.\d+\.\d+['"]?$/m, `version: '${newV}'`)
  if (cmAV) chartRaw = chartRaw.replace(/^appVersion:\s*['"]?\d+\.\d+\.\d+['"]?$/m, `appVersion: '${newV}'`)
  writeFileSync(chart, chartRaw)

  // OlaresManifest.yaml: metadata.version + spec.versionName
  manifestRaw = manifestRaw.replace(/^(\s+version:\s*)['"]?\d+\.\d+\.\d+['"]?$/m, `$1'${newV}'`)
  manifestRaw = manifestRaw.replace(/^(\s+versionName:\s*)['"]?\d+\.\d+\.\d+['"]?$/m, `$1'${newV}'`)
  writeFileSync(manifest, manifestRaw)

  return { name, old: cmV[1], new: newV }
}

const apps = readdirSync(ROOT).filter((e) => {
  const p = join(ROOT, e)
  return statSync(p).isDirectory() && existsSync(join(p, 'OlaresManifest.yaml')) && existsSync(join(p, 'Chart.yaml'))
})

let done = 0, skipped = 0
for (const a of apps) {
  const r = processApp(a)
  if (r) {
    console.log(`  ${a.padEnd(40)} ${r.old} → ${r.new}`)
    done++
  } else {
    console.log(`  skip ${a}`)
    skipped++
  }
}
console.log(`\nBumped ${done} apps, skipped ${skipped}.`)

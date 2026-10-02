const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');
const MARKET_TAXONOMY = require('./market-taxonomy.json');

// Scan app charts from this repo's root
const APPS_REPO = path.resolve(__dirname, '..');
const OUTPUT = path.resolve(__dirname, '../src/catalog.json');

// --- Helpers ---

// Go market service strict-parses timestamps as `2006-01-02T15:04:05.000000000Z` (9-digit nanos).
// JS toISOString() emits 3-digit ms — pad to 9 so the Go syncer doesn't choke and skip apps.
function isoNanos(d = new Date()) {
  return d.toISOString().replace(/\.(\d+)Z$/, (_m, ms) => `.${ms.padEnd(9, '0')}Z`);
}

function generateAppId(name) {
  return crypto.createHash('md5').update(name).digest('hex').substring(0, 8);
}

function parseCpu(value) {
  if (!value) return '0';
  const str = String(value);
  if (str.endsWith('m')) return String(parseInt(str) / 1000);
  return str;
}

function parseBytes(value) {
  if (!value) return '0';
  const str = String(value);
  const units = { Ki: 1024, Mi: 1048576, Gi: 1073741824, Ti: 1099511627776 };
  for (const [suffix, mult] of Object.entries(units)) {
    if (str.endsWith(suffix)) return String(parseInt(str) * mult);
  }
  return str;
}

function assertPlainManifest(content, file) {
  // Opening delimiters are sufficient: a valid Helm directive always has one,
  // while JSON examples in app descriptions can legitimately contain `}}`.
  if (content.includes('{{')) {
    throw new Error(`${file}: OlaresManifest.yaml must not contain Helm template directives`);
  }
}

// --- Read i18n locales ---

function readI18n(appDir) {
  const i18n = {};
  const i18nDir = path.join(appDir, 'i18n');
  if (!fs.existsSync(i18nDir)) return i18n;

  for (const locale of fs.readdirSync(i18nDir, { withFileTypes: true })) {
    if (!locale.isDirectory()) continue;
    const manifestPath = path.join(i18nDir, locale.name, 'OlaresManifest.yaml');
    if (!fs.existsSync(manifestPath)) continue;
    const raw = fs.readFileSync(manifestPath, 'utf8');
    assertPlainManifest(raw, manifestPath);
    i18n[locale.name] = yaml.load(raw);
  }
  return i18n;
}

// --- Scan all app directories ---

function scanApps() {
  const entries = fs.readdirSync(APPS_REPO, { withFileTypes: true });
  const apps = {};

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const appDir = path.join(APPS_REPO, entry.name);
    const chartPath = path.join(appDir, 'Chart.yaml');
    const manifestPath = path.join(appDir, 'OlaresManifest.yaml');

    if (!fs.existsSync(chartPath) || !fs.existsSync(manifestPath)) continue;

    console.log(`Processing: ${entry.name}`);

    let chart, manifest;
    try {
      chart = yaml.load(fs.readFileSync(chartPath, 'utf8'));
      const rawManifest = fs.readFileSync(manifestPath, 'utf8');
      assertPlainManifest(rawManifest, manifestPath);
      manifest = yaml.load(rawManifest);
    } catch (e) {
      throw new Error(`Cannot build catalog for ${entry.name}: ${e.message}`);
    }

    const meta = manifest.metadata || {};
    const spec = manifest.spec || {};
    const accelerator = (spec.accelerator || []).find((entry) => entry.mode === 'nvidia') || {};
    const appName = chart.name || meta.name || entry.name;
    const appId = generateAppId(appName);
    const i18n = readI18n(appDir);
    // The Olares v3 manifest permits only the platform category. Keep the
    // richer browsing taxonomy in this Worker-only source artifact instead.
    const categories = MARKET_TAXONOMY[appName] || ['AI'];

    const bento = meta.bento || null;
    const baseUrl = 'https://orales-one-market.aamsellem.workers.dev';
    const bentoUrl = `${baseUrl}/screenshots/${appName}-bento.png`;
    const tagList = bento ? [bento.family, ...(bento.badge ? [bento.badge] : [])].filter(Boolean) : null;

    // Olares Studio sidebar filter uses this Worker-provided taxonomy. The
    // manifest itself remains strictly `AI` for the Olares v3 validator.

    // Simplified entry for /api/v1/appstore/info
    // `categories` array is REQUIRED — Studio's calcCategories() iterates this to
    // populate the sidebar (verified in beclab/Olares/.../stores/market/center.ts).
    const summary = {
      id: appId,
      name: appName,
      version: meta.version || chart.version,
      category: categories[0] || 'AI',
      categories,
      description: meta.description || '',
      icon: meta.icon || '',
      screenshots: null,
      tags: tagList,
      metadata: null,
      source: 1,
      updated_at: isoNanos(),
    };

    // Full entry for /api/v1/applications/info
    const detail = {
      id: appId,
      name: appName,
      cfgType: manifest['olaresManifest.type'] || 'app',
      chartName: `${appName}-${chart.version}.tgz`,
      icon: meta.icon || '',
      description: meta.description || '',
      appID: appId,
      title: meta.title || appName,
      version: meta.version || chart.version,
      categories,
      versionName: spec.versionName || chart.appVersion || meta.version || '',
      fullDescription: spec.fullDescription || meta.description || '',
      upgradeDescription: spec.upgradeDescription || '',
      promoteImage: spec.promoteImage || [bentoUrl],
      promoteVideo: spec.promoteVideo || '',
      subCategory: spec.subCategory || '',
      locale: Object.keys(i18n).length > 0
        ? ['en-US', ...Object.keys(i18n).filter(l => l !== 'en-US')]
        : spec.locale || ['en-US'],
      developer: spec.developer || '',
      requiredMemory: parseBytes(accelerator.requiredMemory || spec.requiredMemory),
      requiredDisk: parseBytes(accelerator.requiredDisk || spec.requiredDisk),
      supportClient: spec.supportClient || {},
      supportArch: spec.supportArch || [],
      requiredGPU: parseBytes(accelerator.requiredGPUMemory || spec.requiredGpu),
      requiredCPU: parseCpu(accelerator.requiredCpu || spec.requiredCpu),
      rating: 0,
      target: spec.target || '',
      permission: manifest.permission || {},
      entrances: (manifest.entrances || []).map(e => ({
        name: e.name || '',
        host: e.host || '',
        port: e.port || 0,
        title: e.title || '',
        icon: e.icon || '',
        authLevel: e.authLevel || 'private',
        invisible: e.invisible || false,
        openMethod: e.openMethod || '',
        disablePreload: e.disablePreload || false,
      })),
      middleware: manifest.middleware || null,
      options: manifest.options || {},
      submitter: spec.submitter || 'orales-market',
      doc: spec.doc || '',
      website: spec.website || '',
      featuredImage: spec.featuredImage || bentoUrl,
      sourceCode: spec.sourceCode || '',
      license: spec.license || [],
      legal: spec.legal || null,
      i18n: Object.fromEntries(
        Object.entries(i18n).map(([locale, lm]) => [locale, {
          metadata: {
            title: (lm.metadata || {}).title || '',
            description: (lm.metadata || {}).description || '',
          },
          entrances: null,
          spec: {
            fullDescription: (lm.spec || {}).fullDescription || '',
            upgradeDescription: (lm.spec || {}).upgradeDescription || '',
          },
        }])
      ),
      namespace: '',
      onlyAdmin: spec.onlyAdmin || false,
      lastCommitHash: '',
      createTime: 0,
      updateTime: 0,
      count: null,
      versionHistory: [{
        appName: appName,
        version: meta.version || chart.version,
        versionName: chart.appVersion || '',
        mergedAt: isoNanos(),
        upgradeDescription: '',
      }],
      screenshots: null,
      tags: tagList,
      metadata: null,
      updated_at: isoNanos(),
    };

    apps[appId] = { summary, detail, categories };
    console.log(`  -> ${appName} (${appId}) v${summary.version}`);
  }

  return apps;
}

// --- Package charts and build charts.json ---

function chartDirectories() {
  return fs.readdirSync(APPS_REPO, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(APPS_REPO, name, 'Chart.yaml')) && fs.existsSync(path.join(APPS_REPO, name, 'OlaresManifest.yaml')))
    .sort();
}

function buildCharts() {
  const chartsDir = path.resolve(__dirname, '../charts');
  const chartsOutput = path.resolve(__dirname, '../src/charts.json');
  const charts = {};

  // Archive bytes are what the Worker serves, so packaging must happen in the
  // same deterministic build as the catalog.  `charts/` remains an ignored
  // build directory; src/charts.json is the reviewed, deployed artifact.
  fs.rmSync(chartsDir, { recursive: true, force: true });
  fs.mkdirSync(chartsDir, { recursive: true });
  for (const chartName of chartDirectories()) {
    execFileSync('helm', ['package', path.join(APPS_REPO, chartName), '--destination', chartsDir], { stdio: 'inherit' });
  }

  for (const file of fs.readdirSync(chartsDir).sort()) {
    if (!file.endsWith('.tgz')) continue;
    charts[file] = fs.readFileSync(path.join(chartsDir, file)).toString('base64');
    console.log(`Chart: ${file} (${Math.round(fs.statSync(path.join(chartsDir, file)).size / 1024)}KB)`);
  }

  const newContent = JSON.stringify(charts);
  let existing = '';
  try { existing = fs.readFileSync(chartsOutput, 'utf8'); } catch {}
  if (newContent !== existing) {
    fs.writeFileSync(chartsOutput, newContent);
    console.log(`Charts written to ${chartsOutput}`);
  } else {
    console.log('Charts unchanged, skipping write.');
  }
  console.log();
  return charts;
}

// Icons + screenshots are served as static assets via Cloudflare Workers Assets
// (see wrangler.toml [assets] directory = "./public"). They are NOT bundled into the
// worker code. The generator scripts write directly into ./public/{icons,screenshots}.

// --- Main ---

console.log('Building catalog from', APPS_REPO);
console.log();

const charts = buildCharts();
const apps = scanApps();

const summaries = {};
const details = {};
const latest = [];
const categorySet = new Set();

for (const [id, app] of Object.entries(apps)) {
  summaries[id] = app.summary;
  details[id] = app.detail;
  latest.push(app.summary.name);
  for (const c of app.categories || []) categorySet.add(c);
}

const allCategories = Array.from(categorySet).sort();

for (const app of Object.values(apps)) {
  const archive = app.detail.chartName;
  if (!Object.hasOwn(charts, archive)) {
    throw new Error(`Missing packaged chart archive for ${app.detail.name}: ${archive}`);
  }
}

// Sort latest: newest apps first (by version, higher = newer)
latest.sort((a, b) => {
  const va = apps[Object.keys(apps).find(k => apps[k].summary.name === a)]?.summary?.version || '0';
  const vb = apps[Object.keys(apps).find(k => apps[k].summary.name === b)]?.summary?.version || '0';
  // Apps at v1.0.0 are newest (just created), higher patch = more updates
  const pa = va.split('.').map(Number);
  const pb = vb.split('.').map(Number);
  // Lower version = newer app (v1.0.0 just created vs v1.0.27 old)
  return (pa[0]*10000+pa[1]*100+pa[2]) - (pb[0]*10000+pb[1]*100+pb[2]);
});

// tops = flat ranked list the Go market "nested market data" parser iterates to
// enumerate apps (the flat `apps` dict alone yields 0 parsed apps). appId = app name,
// matching the official api.olares.com/market convention.
const tops = latest.map((name, i) => ({ appId: name, rank: i + 1 }));

// Hash over app content with every `updated_at` stripped. Those fields were
// previously live `new Date()` values INSIDE the hashed payload, so the hash
// changed on every build despite the "deterministic" claim — defeating the
// device-side hash check and the write-if-changed guard below.
const STAMP_KEYS = new Set(['updated_at', 'mergedAt']);
const stripStamps = (v) =>
  Array.isArray(v) ? v.map(stripStamps)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !STAMP_KEYS.has(k)).map(([k, x]) => [k, stripStamps(x)]))
    : v;

const catalogPayload = JSON.stringify(stripStamps({ summaries, details, latest, tops }));
const hash = crypto.createHash('md5').update(catalogPayload).digest('hex');

// Olares v2 sync (/api/v2/catalog) is built around epoch-ms `last_modify_time`.
// Anchor it to the content hash: the stamp advances only when app content
// actually changed, so no-op rebuilds stay byte-identical (no wrangler loop)
// and the device refetches exactly when there is something new.
let existingContent = '';
try { existingContent = fs.readFileSync(OUTPUT, 'utf8'); } catch {}

let generatedAt = Date.now();
try {
  const prev = JSON.parse(existingContent);
  if (prev.hash === hash && prev.generated_at) generatedAt = prev.generated_at;
} catch {}

// Emitted `updated_at` now means "when this catalog last actually changed".
const stampIso = isoNanos(new Date(generatedAt));
const applyStamp = (v) => {
  if (Array.isArray(v)) return v.forEach(applyStamp);
  if (!v || typeof v !== 'object') return;
  for (const [k, x] of Object.entries(v)) {
    if (STAMP_KEYS.has(k)) v[k] = stampIso;
    else applyStamp(x);
  }
};
applyStamp(summaries);
applyStamp(details);

const catalog = { hash, generated_at: generatedAt, summaries, details, latest, tops, categories: allCategories };
const newContent = JSON.stringify(catalog, null, 2);

if (newContent === existingContent) {
  console.log('\nCatalog unchanged, skipping write.');
} else {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, newContent);
  console.log(`\nCatalog written to ${OUTPUT}`);
}

console.log(`Apps: ${Object.keys(summaries).length}, Hash: ${hash}`);

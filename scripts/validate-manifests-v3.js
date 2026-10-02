#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const marketTaxonomy = require('./market-taxonomy.json');

const root = path.resolve(__dirname, '..');
const failures = [];
const charts = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(root, name, 'Chart.yaml')) && fs.existsSync(path.join(root, name, 'OlaresManifest.yaml')))
  .sort();

function fail(chart, message) { failures.push(`${chart}: ${message}`); }
function readYaml(file, chart) {
  try { return yaml.load(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(chart, `${file}: ${error.message}`); return {}; }
}

for (const chartName of charts) {
  const chartDir = path.join(root, chartName);
  const chart = readYaml(path.join(chartDir, 'Chart.yaml'), chartName);
  const manifestFile = path.join(chartDir, 'OlaresManifest.yaml');
  const manifest = readYaml(manifestFile, chartName);
  const raw = fs.readFileSync(manifestFile, 'utf8');
  const spec = manifest.spec || {};
  const accelerator = spec.accelerator;

  if (manifest['olaresManifest.version'] !== '0.12.0') fail(chartName, 'must use olaresManifest.version 0.12.0');
  if (manifest.apiVersion !== 'v3') fail(chartName, 'must use apiVersion v3');
  if (manifest.metadata?.appid !== undefined) fail(chartName, 'must not retain deprecated metadata.appid');
  if (JSON.stringify(manifest.metadata?.categories) !== JSON.stringify(['AI'])) fail(chartName, 'must use only the supported AI category');
  if (!Array.isArray(marketTaxonomy[chartName]) || marketTaxonomy[chartName].length === 0) fail(chartName, 'must retain Worker-only market taxonomy');
  // These are individual applications. A shared hostPath model cache does not
  // make the app an Olares shared application: there are no shared entrances
  // or cluster-scoped workloads, and each release keeps its own namespace and
  // appData. Do not accidentally turn a model cache into shared-app semantics.
  if (manifest.options?.shared === true || manifest.spec?.onlyAdmin === true) fail(chartName, 'must remain an individual (non-shared) application');
  if (!Array.isArray(accelerator) || accelerator.length !== 1 || accelerator[0].mode !== 'nvidia') fail(chartName, 'must declare one nvidia accelerator envelope');
  else {
    for (const key of ['requiredCpu', 'limitedCpu', 'requiredMemory', 'limitedMemory', 'requiredDisk', 'limitedDisk', 'requiredGPUMemory', 'limitedGPUMemory']) {
      if (accelerator[0][key] === undefined) fail(chartName, `accelerator is missing ${key}`);
    }
  }
  if (/^  (requiredGpu|limitedGpu|requiredCpu|limitedCpu|requiredMemory|limitedMemory|requiredDisk|limitedDisk):/m.test(raw)) fail(chartName, 'retains flat v2 resource fields');
  if (!raw.includes("version: '>=1.12.6-0'")) fail(chartName, 'must require Olares >=1.12.6-0');
  if (String(manifest.metadata?.version) !== String(chart.version)) fail(chartName, 'metadata.version must match Chart.yaml version');

  const templateFiles = fs.readdirSync(path.join(chartDir, 'templates')).filter((file) => file.endsWith('.yaml'));
  let deployments = 0;
  for (const templateFile of templateFiles) {
    const template = fs.readFileSync(path.join(chartDir, 'templates', templateFile), 'utf8');
    if (!/^kind: Deployment$/m.test(template)) continue;
    deployments += 1;
    const name = template.match(/^kind: Deployment\nmetadata:\n(?:  [^\n]+\n)*?  name: ([^\s]+)$/m)?.[1];
    if (!name) { fail(chartName, `${templateFile}: missing Deployment metadata.name`); continue; }
    if (manifest.workloadReplicas?.[name] !== 1) fail(chartName, `workloadReplicas must declare ${name}: 1`);
    if (!template.includes(`replicas: {{ .Values.workloads.${name}.replicaCount }}`)) fail(chartName, `${templateFile}: must consume workloads.${name}.replicaCount`);
    const values = readYaml(path.join(chartDir, 'values.yaml'), chartName);
    if (values.workloads?.[name]?.replicaCount !== 1) fail(chartName, `values.yaml must declare workloads.${name}.replicaCount: 1`);
  }
  if (deployments !== 1) fail(chartName, `expected one Deployment, found ${deployments}`);

  const localeDir = path.join(chartDir, 'i18n');
  if (!fs.existsSync(localeDir)) fail(chartName, 'is missing i18n');
  else for (const locale of fs.readdirSync(localeDir)) {
    const localeFile = path.join(localeDir, locale, 'OlaresManifest.yaml');
    if (!fs.existsSync(localeFile)) { fail(chartName, `i18n/${locale} is missing OlaresManifest.yaml`); continue; }
    const localeRaw = fs.readFileSync(localeFile, 'utf8');
    if (localeRaw.includes("apiVersion: 'v2'") || localeRaw.includes("olaresManifest.version: '0.10.0'")) fail(chartName, `i18n/${locale} retains a v2 manifest`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated ${charts.length} Olares v3 charts.`);

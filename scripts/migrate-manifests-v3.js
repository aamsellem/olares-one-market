#!/usr/bin/env node

/*
 * One-time, repeatable migration for the Olares One chart set.
 *
 * Olares 1.12.6 rejects v2 manifests.  Keep this script with the repository so
 * the bulk conversion is reviewable and can be reapplied to a restored v2
 * catalogue without hand-editing 43 charts.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const chartDirectories = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(root, name, 'Chart.yaml')) && fs.existsSync(path.join(root, name, 'OlaresManifest.yaml')))
  .sort();

function bumpPatch(version, file) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`${file}: expected a three-part chart version, got ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function updateFile(file, transform) {
  const oldContent = fs.readFileSync(file, 'utf8');
  const newContent = transform(oldContent);
  if (oldContent !== newContent) fs.writeFileSync(file, newContent);
}

function normalizeManifestCategories(content, file) {
  // Keep `metadata.bento` untouched; only replace the direct category list.
  // The first replacement repairs an older migration-script rerun that put a
  // duplicate categories block immediately below `metadata:`.
  if (!/^metadata:/m.test(content)) throw new Error(`${file}: missing metadata block`);
  let next = content.replace(/^metadata:\n  categories:\n(?:    [^\n]*\n)+/m, 'metadata:\n');
  if (/^  categories:\n(?:    [^\n]*\n)+/m.test(next)) {
    return next.replace(/^  categories:\n(?:    [^\n]*\n)+/m, '  categories:\n    - AI\n');
  }
  return next.replace(/^metadata:\n/m, 'metadata:\n  categories:\n    - AI\n');
}

function updateManifest(file, workloadName, chartVersion) {
  updateFile(file, (content) => {
    let next = content
      .replace("olaresManifest.version: '0.10.0'", "olaresManifest.version: '0.12.0'")
      .replace("apiVersion: 'v2'", "apiVersion: 'v3'")
      .replace(/version: '>=1\.12\.3-0'/g, "version: '>=1.12.6-0'")
      .replace(/^  appid: .+\n/m, '');
    next = normalizeManifestCategories(next, file);

    if (next.includes('workloadReplicas:')) {
      next = next.replace(/^workloadReplicas:\n(?:  [^\n]+: .+\n)+/m, `workloadReplicas:\n  ${workloadName}: 1\n`);
    } else {
      next = next.replace(/(apiVersion: 'v3'\n)/, `$1workloadReplicas:\n  ${workloadName}: 1\n`);
    }

    // Convert the v2 flat resource envelope without changing its values. All
    // current charts are NVIDIA-only CUDA workloads, so the equivalent v3
    // accelerator mode is nvidia.
    const fields = ['limitedCpu', 'requiredCpu', 'requiredDisk', 'limitedDisk', 'limitedMemory', 'requiredMemory', 'requiredGpu', 'limitedGpu'];
    const resources = {};
    for (const field of fields) {
      const match = next.match(new RegExp(`^  ${field}: (.+)$`, 'm'));
      if (match) resources[field] = match[1];
    }
    if (!next.includes('  accelerator:') && Object.keys(resources).length > 0) {
      const block = fields
        .filter((field) => resources[field] !== undefined)
        .map((field) => `  ${field}: ${resources[field]}\n`)
        .join('');
      const required = ['limitedCpu', 'requiredCpu', 'requiredDisk', 'limitedDisk', 'limitedMemory', 'requiredMemory', 'requiredGpu', 'limitedGpu'];
      if (required.some((field) => resources[field] === undefined)) {
        throw new Error(`${file}: incomplete v2 resource envelope`);
      }
      const accelerator = [
        '  accelerator:',
        '    - mode: nvidia',
        `      limitedCpu: ${resources.limitedCpu}`,
        `      requiredCpu: ${resources.requiredCpu}`,
        `      requiredDisk: ${resources.requiredDisk}`,
        `      limitedDisk: ${resources.limitedDisk}`,
        `      limitedMemory: ${resources.limitedMemory}`,
        `      requiredMemory: ${resources.requiredMemory}`,
        `      requiredGPUMemory: ${resources.requiredGpu}`,
        `      limitedGPUMemory: ${resources.limitedGpu}`,
        '',
      ].join('\n');
      next = next.replace(block, accelerator);
    }

    // Metadata versions identify the package presented by Market.  Move it in
    // lockstep with Chart.yaml so the new v3 archive cannot be mistaken for
    // the cached v2 archive.
    next = next.replace(/^(  version:) .+$/m, `$1 '${chartVersion}'`);
    return next;
  });
}

for (const chartName of chartDirectories) {
  const chartDir = path.join(root, chartName);
  const chartFile = path.join(chartDir, 'Chart.yaml');
  const chart = yaml.load(fs.readFileSync(chartFile, 'utf8'));
  const rootManifestFile = path.join(chartDir, 'OlaresManifest.yaml');
  const needsMigration = fs.readFileSync(rootManifestFile, 'utf8').includes("olaresManifest.version: '0.10.0'");
  const nextVersion = needsMigration ? bumpPatch(chart.version, chartFile) : chart.version;

  if (needsMigration) updateFile(chartFile, (content) => content.replace(/^version: .+$/m, `version: '${nextVersion}'`));

  const templateFiles = fs.readdirSync(path.join(chartDir, 'templates'))
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => path.join(chartDir, 'templates', name));
  const deploymentFile = templateFiles.find((file) => /^kind: Deployment$/m.test(fs.readFileSync(file, 'utf8')));
  if (!deploymentFile) throw new Error(`${chartName}: expected exactly one Deployment template`);
  const deployment = fs.readFileSync(deploymentFile, 'utf8');
  const name = deployment.match(/^kind: Deployment\nmetadata:\n(?:  [^\n]+\n)*?  name: ([^\s]+)$/m)?.[1];
  if (!name) throw new Error(`${deploymentFile}: cannot determine Deployment metadata.name`);

  updateFile(deploymentFile, (content) => content.replace(/^  replicas: .+$/m, `  replicas: {{ .Values.workloads.${name}.replicaCount }}`));
  updateFile(path.join(chartDir, 'values.yaml'), (content) => {
    const workload = `workloads:\n  ${name}:\n    replicaCount: 1\n`;
    let next = content;
    if (next.trim() === '{}') next = workload;
    else if (/^\{\}\nworkloads:/m.test(next)) next = next.replace(/^\{\}\nworkloads:\n(?:  [^\n]+:\n    replicaCount: .+\n)+/m, workload);
    else if (next.includes('workloads:')) next = next.replace(/^workloads:\n(?:  [^\n]+:\n    replicaCount: .+\n)+/m, workload);
    else next = `${next.endsWith('\n') ? next : `${next}\n`}${workload}`;
    // Olares injects these values at install time. Empty defaults make the
    // chart renderable by Helm locally without changing the injected runtime
    // configuration.
    if (!/^userspace:/m.test(next)) next += 'userspace:\n  appData: ""\n';
    if (!/^olaresEnv:/m.test(next)) next += 'olaresEnv: {}\n';
    return next;
  });
  updateManifest(rootManifestFile, name, nextVersion);

  // Locale overlays normally contain only translated fields. Two historical
  // overlays duplicated full v2 manifests; migrate those headers/resources as
  // well, while leaving normal locale-only overlays untouched.
  const localeDir = path.join(chartDir, 'i18n');
  if (fs.existsSync(localeDir)) {
    for (const locale of fs.readdirSync(localeDir)) {
      const localeManifest = path.join(localeDir, locale, 'OlaresManifest.yaml');
      if (!fs.existsSync(localeManifest)) continue;
      if (fs.readFileSync(localeManifest, 'utf8').includes('olaresManifest.version:')) {
        updateManifest(localeManifest, name, nextVersion);
      }
    }
  }
}

console.log(`Migrated ${chartDirectories.length} charts to Olares manifest v3.`);

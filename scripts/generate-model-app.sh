#!/usr/bin/env node

/*
 * Scaffold an individual Olares v3 model-server chart.
 *
 * Examples:
 *   scripts/generate-model-app.sh --backend llamacpp --name llamacppfooone \
 *     --title "Foo One" --model-url https://example.invalid/foo.gguf \
 *     --model-file foo.gguf --taxonomy "LLM Chat,AI Agents"
 *   scripts/generate-model-app.sh --backend vllm --name vllmfooone \
 *     --title "Foo vLLM One" --model org/foo --taxonomy "LLM Chat"
 *
 * The generated chart intentionally targets the repository's individual-app
 * model-server shape. It is not an Olares shared application.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const MARKET_URL = 'https://orales-one-market.aamsellem.workers.dev';

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  scripts/generate-model-app.sh --backend <llamacpp|vllm> --name <chart-name> --title <title> [options]

Required for llama.cpp:
  --model-url <https-url>  --model-file <file.gguf>
Required for vLLM:
  --model <HuggingFace model id>

Options:
  --alias <name>                 OpenAI served-model name (defaults to chart name)
  --description <text>           Short description
  --full-description <text>      Long description
  --version <semver>             Chart and manifest version (default: 1.0.0)
  --image <image:tag>            Server image
  --taxonomy <a,b,...>           Worker browsing taxonomy (default: LLM Chat)
  --output-dir <directory>       Root to create the chart in (default: repository root)
  --self-test                    Generate llama.cpp and vLLM fixtures in a temporary root and validate them
  --help
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (argument === '--help' || argument === '-h') usage();
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    if (key === 'self-test') { options.selfTest = true; continue; }
    const value = inlineValue === undefined ? argv[++i] : inlineValue;
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
  }
  return options;
}

function quote(value) { return JSON.stringify(String(value)); }
function indent(text, width) {
  const padding = ' '.repeat(width);
  return String(text).split('\n').map((line) => `${padding}${line}`).join('\n');
}
function yamlBlock(text, width) {
  return `${indent(String(text || ''), width)}`;
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function normalizeBackend(value) {
  if (value === 'llama.cpp') return 'llamacpp';
  return value;
}
function taxonomy(value) {
  const items = String(value || 'LLM Chat').split(',').map((item) => item.trim()).filter(Boolean);
  assert(items.length > 0, '--taxonomy must contain at least one label');
  return [...new Set(items)];
}

function validatedOptions(input) {
  const backend = normalizeBackend(input.backend);
  assert(['llamacpp', 'vllm'].includes(backend), '--backend must be llamacpp or vllm');
  assert(/^[a-z][a-z0-9]*$/.test(input.name || ''), '--name must be lowercase alphanumeric and start with a letter');
  assert(input.title && input.title.length <= 30, '--title is required and must be at most 30 characters');
  assert(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(input.version || '1.0.0'), '--version must be a semver value');
  if (backend === 'llamacpp') {
    assert(/^https:\/\//.test(input['model-url'] || ''), '--model-url must be an HTTPS URL for llama.cpp');
    assert(input['model-file'], '--model-file is required for llama.cpp');
  } else {
    assert(input.model, '--model is required for vLLM');
  }
  return {
    backend,
    name: input.name,
    title: input.title,
    version: input.version || '1.0.0',
    alias: input.alias || input.name,
    description: input.description || `${input.title} served via ${backend === 'llamacpp' ? 'llama.cpp' : 'vLLM'} — optimized for Olares One`,
    fullDescription: input['full-description'] || `${input.title} is an individual GPU-backed model service for Olares One. The model data is retained in this app's persistent appData volume.`,
    image: input.image || (backend === 'llamacpp'
      ? 'docker.io/beclab/ggml-org-llama.cpp:server-cuda13-b11046'
      : 'vllm/vllm-openai:v0.25.1-x86_64-ubuntu2404'),
    modelUrl: input['model-url'],
    modelFile: input['model-file'],
    model: input.model,
    taxonomy: taxonomy(input.taxonomy),
    outputDir: path.resolve(input['output-dir'] || REPO_ROOT),
  };
}

function manifest(app) {
  const port = app.backend === 'llamacpp' ? 8080 : 8000;
  return `---
olaresManifest.version: '0.12.0'
olaresManifest.type: app
apiVersion: 'v3'
workloadReplicas:
  ${app.name}: 1
metadata:
  name: ${app.name}
  icon: ${MARKET_URL}/icons/${app.name}.png
  description: ${quote(app.description)}
  title: ${quote(app.title)}
  version: '${app.version}'
  categories:
    - AI
entrances:
  - name: ${app.name}
    port: ${port}
    host: ${app.name}
    title: ${quote(app.title)}
    icon: ${MARKET_URL}/icons/${app.name}.png
    openMethod: window
    authLevel: internal
spec:
  versionName: '${app.version}'
  fullDescription: |
${yamlBlock(app.fullDescription, 4)}

  developer: aamsellem
  website: https://github.com/aamsellem/olares-one-market
  sourceCode: https://github.com/aamsellem/olares-one-market
  submitter: aamsellem
  locale:
    - en-US
  license:
    - text: Apache-2.0
      url: https://www.apache.org/licenses/LICENSE-2.0

  accelerator:
    - mode: nvidia
      limitedCpu: 16
      requiredCpu: 4
      requiredDisk: 30Gi
      limitedDisk: 60Gi
      limitedMemory: 40Gi
      requiredMemory: 24Gi
      requiredGPUMemory: 1Gi
      limitedGPUMemory: 24Gi

  supportArch:
    - amd64
permission:
  appData: true
options:
  apiTimeout: 0
  dependencies:
    - name: olares
      version: '>=1.12.6-0'
      type: system
`;
}

function chart(app) {
  const backendName = app.backend === 'llamacpp' ? 'llama.cpp' : 'vLLM';
  return `apiVersion: v2
name: ${app.name}
description: ${quote(`${app.title} served via ${backendName} — optimized for Olares One`)}
type: application
version: '${app.version}'
appVersion: '${app.version}'
`;
}

function values(app) {
  return `admin: ""
bfl:
  username: ""
userspace:
  appData: ""
  appCache: ""
  userData: ""
workloads:
  ${app.name}:
    replicaCount: 1
olaresEnv: {}
`;
}

function llamacppDeployment(app) {
  return `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${app.name}-env
  namespace: "{{ .Release.Namespace }}"
data:
  MODEL_URL: ${quote(app.modelUrl)}
  MODEL_FILE: ${quote(app.modelFile)}
  MODEL_ALIAS: ${quote(app.alias)}
  CONTEXT_SIZE: "32768"
  N_GPU_LAYERS: "99"
  THREADS: "16"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    io.kompose.service: ${app.name}
  name: ${app.name}
  namespace: "{{ .Release.Namespace }}"
  annotations:
    applications.app.bytetrade.io/gpu-inject: "true"
spec:
  replicas: {{ .Values.workloads.${app.name}.replicaCount }}
  selector:
    matchLabels:
      io.kompose.service: ${app.name}
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        io.kompose.service: ${app.name}
    spec:
      initContainers:
        - name: model-downloader
          image: "docker.io/alpine:3.20"
          command: ["sh", "-c"]
          args:
            - |
              MODEL_PATH="/models/${'${MODEL_FILE}'}"
              if [ -f "$MODEL_PATH" ]; then
                echo "Model already downloaded: $MODEL_PATH"
              else
                wget -O "$MODEL_PATH.tmp" "$MODEL_URL" && mv "$MODEL_PATH.tmp" "$MODEL_PATH"
              fi
          envFrom:
            - configMapRef:
                name: ${app.name}-env
          volumeMounts:
            - name: models
              mountPath: /models
      containers:
        - name: llamacpp-server
          image: ${quote(app.image)}
          command: ["/app/llama-server"]
          args:
            - --host
            - 0.0.0.0
            - --port
            - "8080"
            - --model
            - /models/$(MODEL_FILE)
            - --alias
            - $(MODEL_ALIAS)
            - --ctx-size
            - $(CONTEXT_SIZE)
            - --n-gpu-layers
            - $(N_GPU_LAYERS)
            - --threads
            - $(THREADS)
            - --flash-attn
            - auto
            - --jinja
          envFrom:
            - configMapRef:
                name: ${app.name}-env
          env:
            - name: GGML_CUDA_GRAPH_OPT
              value: "1"
          ports:
            - containerPort: 8080
          startupProbe:
            httpGet: { path: /health, port: 8080 }
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 120
          livenessProbe:
            httpGet: { path: /health, port: 8080 }
            initialDelaySeconds: 60
            periodSeconds: 30
          resources:
            limits:
              cpu: "16"
              memory: 40Gi
              nvidia.com/gpu: "1"
            requests:
              cpu: "4"
              memory: 24Gi
              nvidia.com/gpu: "1"
          volumeMounts:
            - name: models
              mountPath: /models
      volumes:
        - name: models
          hostPath:
            path: "{{ .Values.userspace.appData }}/models"
            type: DirectoryOrCreate
---
apiVersion: v1
kind: Service
metadata:
  name: ${app.name}
  namespace: "{{ .Release.Namespace }}"
spec:
  ports:
    - name: llamacpp
      port: 8080
      targetPort: 8080
  selector:
    io.kompose.service: ${app.name}
`;
}

function vllmDeployment(app) {
  return `---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${app.name}-env
  namespace: "{{ .Release.Namespace }}"
data:
  MODEL_NAME: ${quote(app.model)}
  MODEL_ALIAS: ${quote(app.alias)}
  MAX_MODEL_LEN: "32768"
  GPU_MEMORY_UTILIZATION: "0.90"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    io.kompose.service: ${app.name}
  name: ${app.name}
  namespace: "{{ .Release.Namespace }}"
  annotations:
    applications.app.bytetrade.io/gpu-inject: "true"
spec:
  replicas: {{ .Values.workloads.${app.name}.replicaCount }}
  selector:
    matchLabels:
      io.kompose.service: ${app.name}
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        io.kompose.service: ${app.name}
    spec:
      containers:
        - name: vllm-server
          image: ${quote(app.image)}
          command: ["vllm", "serve"]
          args:
            - $(MODEL_NAME)
            - --served-model-name
            - $(MODEL_ALIAS)
            - --host
            - 0.0.0.0
            - --port
            - "8000"
            - --max-model-len
            - $(MAX_MODEL_LEN)
            - --gpu-memory-utilization
            - $(GPU_MEMORY_UTILIZATION)
            - --download-dir
            - /models
            - --trust-remote-code
          envFrom:
            - configMapRef:
                name: ${app.name}-env
          env:
            - name: HF_HOME
              value: /models/huggingface
          ports:
            - containerPort: 8000
          startupProbe:
            httpGet: { path: /health, port: 8000 }
            initialDelaySeconds: 60
            periodSeconds: 15
            failureThreshold: 120
          livenessProbe:
            httpGet: { path: /health, port: 8000 }
            initialDelaySeconds: 120
            periodSeconds: 30
          resources:
            limits:
              cpu: "16"
              memory: 40Gi
              nvidia.com/gpu: "1"
            requests:
              cpu: "4"
              memory: 24Gi
              nvidia.com/gpu: "1"
          volumeMounts:
            - name: models
              mountPath: /models
      volumes:
        - name: models
          hostPath:
            path: "{{ .Values.userspace.appData }}/models"
            type: DirectoryOrCreate
---
apiVersion: v1
kind: Service
metadata:
  name: ${app.name}
  namespace: "{{ .Release.Namespace }}"
spec:
  ports:
    - name: vllm
      port: 8000
      targetPort: 8000
  selector:
    io.kompose.service: ${app.name}
`;
}

function localManifest(app) {
  return `metadata:
  title: ${quote(app.title)}
  description: ${quote(app.description)}
spec:
  fullDescription: |
${yamlBlock(app.fullDescription, 4)}
`;
}

function writeFile(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, { encoding: 'utf8', flag: 'wx' });
}

function generate(input) {
  const app = validatedOptions(input);
  const chartDir = path.join(app.outputDir, app.name);
  assert(!fs.existsSync(chartDir), `Refusing to overwrite existing chart directory: ${chartDir}`);
  const taxonomyFile = path.join(app.outputDir, 'scripts', 'market-taxonomy.json');
  let marketTaxonomy = {};
  if (fs.existsSync(taxonomyFile)) {
    marketTaxonomy = JSON.parse(fs.readFileSync(taxonomyFile, 'utf8'));
    assert(!Object.prototype.hasOwnProperty.call(marketTaxonomy, app.name), `Refusing to overwrite existing taxonomy entry: ${app.name}`);
  }

  fs.mkdirSync(chartDir, { recursive: false });
  try {
    writeFile(path.join(chartDir, 'Chart.yaml'), chart(app));
    writeFile(path.join(chartDir, 'OlaresManifest.yaml'), manifest(app));
    writeFile(path.join(chartDir, 'values.yaml'), values(app));
    writeFile(path.join(chartDir, 'owners'), 'aamsellem\n');
    writeFile(path.join(chartDir, '.helmignore'), '*.tgz\n.DS_Store\n');
    writeFile(path.join(chartDir, 'i18n', 'en-US', 'OlaresManifest.yaml'), localManifest(app));
    writeFile(path.join(chartDir, 'templates', 'deployment.yaml'), app.backend === 'llamacpp' ? llamacppDeployment(app) : vllmDeployment(app));

    marketTaxonomy[app.name] = app.taxonomy;
    fs.mkdirSync(path.dirname(taxonomyFile), { recursive: true });
    fs.writeFileSync(taxonomyFile, `${JSON.stringify(marketTaxonomy, null, 2)}\n`);
  } catch (error) {
    fs.rmSync(chartDir, { recursive: true, force: true });
    throw error;
  }
  return { app, chartDir };
}

function selfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'olares-v3-generator-'));
  try {
    generate({
      backend: 'llamacpp', name: 'testllamacppone', title: 'Test llama.cpp One',
      'model-url': 'https://example.invalid/test.gguf', 'model-file': 'test.gguf',
      'output-dir': tempRoot,
    });
    generate({
      backend: 'vllm', name: 'testvllmone', title: 'Test vLLM One', model: 'example/test-model',
      'output-dir': tempRoot,
    });
    const validation = spawnSync(process.execPath, [path.join(SCRIPT_DIR, 'validate-manifests-v3.js')], {
      env: { ...process.env, OLARES_MARKET_ROOT: tempRoot }, encoding: 'utf8',
    });
    if (validation.status !== 0) throw new Error(`Generated chart validation failed:\n${validation.stdout}${validation.stderr}`);
    for (const chartName of ['testllamacppone', 'testvllmone']) {
      const lint = spawnSync('helm', ['lint', path.join(tempRoot, chartName)], { encoding: 'utf8', timeout: 30000 });
      if (lint.error) throw new Error(`Helm lint failed for ${chartName}: ${lint.error.message}`);
      if (lint.status !== 0) throw new Error(`Helm lint failed for ${chartName}:\n${lint.stdout}${lint.stderr}`);
    }
    console.log(`Self-test passed: ${validation.stdout.trim()}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    if (Object.keys(options).length !== 1) throw new Error('--self-test cannot be combined with chart options');
    selfTest();
  } else {
    const result = generate(options);
    console.log(`Generated Olares v3 ${result.app.backend} chart: ${result.chartDir}`);
  }
} catch (error) {
  console.error(`generate-model-app: ${error.message}`);
  process.exitCode = 1;
}

# Test App via Olares Studio

Package the Helm chart and guide the user to import/test it in Olares Studio on the Olares One device.

## Argument: $ARGUMENTS

The argument is the app name (directory name in the repo root, e.g., "llamacppqwen35a3bone").

## Workflow

### Step 1: Validate and package the chart

- Verify Chart.yaml + OlaresManifest.yaml exist and are correct:
  - `olaresManifest.version: '0.10.0'`
  - `apiVersion: 'v2'` present
  - CPU values in integer cores (not millicores)
  - All required spec fields present
- Run `helm template <app-dir>` to verify template rendering (check for YAML errors)
- Package: `helm package <app-dir> -d charts/`
- Report the `.tgz` file path and size

### Step 2: Guide user to import in Olares Studio

Tell the user:
1. Transfer the `.tgz` file to the Olares One (e.g., via SCP, shared folder, or upload through Files app)
   ```bash
   scp charts/<app-name>-<version>.tgz <olares-user>@<olares-ip>:~/
   ```
2. Open **Studio** on Olares One
3. Import the chart `.tgz` file
4. Install/run the app from Studio

### Step 3: Provide monitoring commands

```bash
# Watch pods for the app
kubectl get pods -A | grep <app-name>

# Watch pod logs
kubectl logs -n <namespace> -l io.kompose.service=<app-name> -f --all-containers

# Check events for issues
kubectl get events -A --sort-by=.lastTimestamp | grep <app-name> | tail -20
```

### Step 4: Provide test commands

For llama.cpp backends:
```bash
# Find the service
kubectl get svc -A | grep <app-name>

# Port forward for testing
kubectl port-forward -n <namespace> svc/<app-name> 8080:8080 &

# Health check
curl http://localhost:8080/health

# Generation test — measure t/s
curl -s http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"<alias>","messages":[{"role":"user","content":"Explain quantum computing in 3 sentences."}],"max_tokens":200}'

# Server metrics
kubectl logs -n <namespace> -l io.kompose.service=<app-name> -c llamacpp-server --tail=10
```

For vLLM backends:
```bash
kubectl port-forward -n <namespace> svc/<app-name> 8000:8000 &
curl http://localhost:8000/health
curl -s http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"<alias>","messages":[{"role":"user","content":"Hello!"}],"max_tokens":100}'
```

### Step 5: Analyze results

When the user shares logs or output:
- Parse tokens/second from server logs
- Compare with GEMINI.md benchmark table
- Check for errors (OOM, CUDA, model download failures)
- Suggest tweaks if performance is suboptimal (reference GEMINI.md "What HELPS"/"What HURTS")

### Step 6: Iterate

If issues found:
- Edit chart files (templates/deployment.yaml, OlaresManifest.yaml, etc.)
- Bump version: update Chart.yaml + OlaresManifest.yaml version
- Repackage: `helm package <app-dir> -d charts/`
- Tell user to uninstall from Studio and reimport the new `.tgz`
- Repeat from Step 3

### Step 7: Mark as validated

When the user confirms the app works:
- Update GEMINI.md performance history table
- Tell user: "Chart validated in Studio! Run `/deploy` to publish to the market."

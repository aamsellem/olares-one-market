# Bump App Version

Bump an app's version, repackage, rebuild, and deploy.

Usage: /bump <app-name> [new-version]

If no new-version is given, auto-increment the patch version (e.g., 1.0.5 -> 1.0.6).

## Steps

1. **Read current version** from `<app-name>/Chart.yaml` and `<app-name>/OlaresManifest.yaml`.

2. **Bump version** in ALL version locations:
   - `Chart.yaml`: update `version` and `appVersion`
   - `OlaresManifest.yaml`: update `metadata.version` and `spec.versionName`

3. **Verify Docker image exists**: If the deployment references a ghcr.io image tag, check it exists before deploying:
   ```bash
   TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:ggml-org/llama.cpp:pull" | jq -r '.token')
   curl -s -o /dev/null -w "%{http_code}" "https://ghcr.io/v2/ggml-org/llama.cpp/manifests/<tag>" \
     -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.oci.image.index.v1+json"
   ```
   If 404, find the latest available tag by scanning downward.

4. **Remove old chart** from `charts/` directory.

5. **Package new chart**: `helm package <app-name> -d charts/`

6. **Rebuild catalog**: `node scripts/build-catalog.js`

7. **Deploy**: `npx wrangler deploy`

8. **Verify**: Check the deployed API returns the new version:
   ```
   curl -s https://orales-one-market.aamsellem.workers.dev/api/v1/appstore/info?version=1.12.3
   ```

9. **Report**: Show old version -> new version, new hash, and deployed URL.

## Argument: $ARGUMENTS

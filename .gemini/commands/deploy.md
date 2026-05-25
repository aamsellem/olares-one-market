# Deploy Orales One Market

Full deployment workflow for the Olares One Market Cloudflare Worker.

## Steps

1. **Validate all app charts**: For each directory at repo root containing both `Chart.yaml` and `OlaresManifest.yaml`:
   - Verify `olaresManifest.version` is `'0.10.0'` (NOT 0.11.0)
   - Verify `apiVersion: 'v2'` is present at top level of OlaresManifest.yaml
   - Verify Chart.yaml `version` matches OlaresManifest.yaml `metadata.version`
   - Verify CPU values use integer notation (e.g., `4`) not millicores (`4000m`)
   - Verify all required spec fields: developer, requiredCpu, requiredMemory, requiredDisk, requiredGpu, supportArch
   - Verify `website` and `sourceCode` point to `https://github.com/aamsellem/olares-one-market` (NOT orales-market)
   - Verify Docker image tags exist on their registries (especially ghcr.io tags — not every build gets published)

2. **Package Helm charts**: For each app, run `helm package <app-dir> -d charts/`. Remove old versions from `charts/` if the version was bumped.

3. **Rebuild catalog**: Run `node scripts/build-catalog.js` — this generates `src/catalog.json`, `src/charts.json`, and `src/icons.json`.

4. **Verify locally** (optional): Run `npm run dev` and test:
   - `GET /health` — should list correct app count
   - `GET /api/v1/appstore/hash?version=1.12.3` — should return hash
   - `GET /api/v1/appstore/info?version=1.12.3` — should list all apps
   - `POST /api/v1/applications/info` with `{"app_ids":["<id>"],"version":"1.12.3"}` — check detail fields
   - `GET /api/v1/applications/<app>/chart?fileName=<chartname>.tgz` — should return gzip

5. **Deploy to Cloudflare**: Run `npx wrangler deploy`.

6. **Verify deployed**: Run the same checks against `https://orales-one-market.aamsellem.workers.dev`.

7. **Report**: Show app count, hash, deployed URL, and version for each app.

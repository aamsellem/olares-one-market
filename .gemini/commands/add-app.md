# Add New App — Full Workflow

Complete pipeline: research → create chart → test in Studio → deploy to market.

## Argument: $ARGUMENTS

The argument describes what to add:
- A model name (e.g., "DeepSeek-R1-0528")
- A use case (e.g., "best coding model for Olares One")
- A specific config (e.g., "Qwen3-30B-A3B vLLM AWQ-4bit")

## Pipeline

Execute these steps sequentially, asking the user for validation at each gate:

### Phase 1: Research
Follow `/research-model` instructions to find the optimal configuration.
Present recommendation and ask: **"Valide cette config pour passer au chart ?"**

### Phase 2: Create Chart
Follow `/create-chart` instructions to build the full Helm chart.
Show the generated files and ask: **"Chart pret, on teste dans Studio ?"**

### Phase 3: Test in Studio
Follow `/test-on-device` instructions.
Package the chart and guide the user to import in Studio.
Wait for user feedback on performance.
Iterate if needed (edit chart → repackage → reimport).
Ask: **"Perfs validees, on deploie sur le market ?"**

### Phase 4: Deploy
Follow `/deploy` instructions to publish to the Cloudflare Worker.
Verify all API endpoints.
Report final status.

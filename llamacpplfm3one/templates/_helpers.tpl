{{- /* llmbase.gpuMiB: normalize a GPU-memory quantity to a BARE MiB integer for
       HAMi's nvidia.com/gpumem (a Mi/Gi suffix is misread by the scheduler).
       Accepts 8Gi / 8G / 8192Mi / 8192M / 8192 and returns MiB. */ -}}
{{- define "llmbase.gpuMiB" -}}
{{- $g := trim . -}}
{{- if hasSuffix "Gi" $g -}}
{{- mul (int (trimSuffix "Gi" $g)) 1024 -}}
{{- else if hasSuffix "G" $g -}}
{{- mul (int (trimSuffix "G" $g)) 1024 -}}
{{- else if hasSuffix "Mi" $g -}}
{{- int (trimSuffix "Mi" $g) -}}
{{- else if hasSuffix "M" $g -}}
{{- int (trimSuffix "M" $g) -}}
{{- else -}}
{{- int $g -}}
{{- end -}}
{{- end -}}
{{- /* llamacpplfm3one.presetArgs: an empty ENGINE_ARGS gets the preset. Both the engine and llm-init call it, so the
       model card and the engine agree. Keep $preset byte-identical to ENGINE_ARGS.default in OlaresManifest.yaml. */ -}}
{{- define "llamacpplfm3one.presetArgs" -}}
{{- $args := trim (. | default "") -}}
{{- $preset := "-c 262144 -ngl all -fa on --jinja -np 2 -kvu --temp 0.1 --top-k 50 --repeat-penalty 1.1" -}}
{{- if eq $args "" -}}
{{- $preset -}}
{{- else -}}
{{- $args -}}
{{- end -}}
{{- end -}}
{{- /* llamacpplfm3one.engineArgs: pass ENGINE_ARGS through unchanged. */ -}}
{{- define "llamacpplfm3one.engineArgs" -}}
{{- $in := . -}}
{{- trim ($in.Args | default "") -}}
{{- end -}}

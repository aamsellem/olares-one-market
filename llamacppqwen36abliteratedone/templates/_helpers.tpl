{{- /* llmbase.gpuMiB: normalize a GPU-memory quantity to a BARE MiB integer for
       HAMi's nvidia.com/gpumem. */ -}}
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
{{- /* llamacppqwen36abliteratedone.engineArgs: CPU mode auto-adds -ngl 0 unless user set -ngl. */ -}}
{{- define "llamacppqwen36abliteratedone.engineArgs" -}}
{{- $in := . -}}
{{- $args := trim ($in.Args | default "") -}}
{{- $isCpu := $in.IsCpu | default false -}}
{{- if and $isCpu (not (contains "-ngl" $args)) -}}
{{- if $args -}}
{{- $args = printf "%s -ngl 0" $args -}}
{{- else -}}
{{- $args = "-ngl 0" -}}
{{- end -}}
{{- end -}}
{{- $args -}}
{{- end -}}

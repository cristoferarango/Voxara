# Descarga S2 Pro Q6_K + tokenizer (Fish Audio Research License — uso personal/investigación)
$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Dest = Join-Path $Root 'eval\models\s2-pro-gguf'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "Destino: $Dest"
if (-not (Get-Command huggingface-cli -ErrorAction SilentlyContinue) -and -not (Get-Command hf -ErrorAction SilentlyContinue)) {
  Write-Host "Instalando huggingface_hub (pip)..."
  python -m pip install -U "huggingface_hub[cli]"
}

$cli = if (Get-Command hf -ErrorAction SilentlyContinue) { 'hf' } else { 'huggingface-cli' }
& $cli download rodrigomt/s2-pro-gguf s2-pro-q6_k.gguf tokenizer.json LICENSE.md README.md --local-dir $Dest
if ($LASTEXITCODE -ne 0) { throw "Falló la descarga del modelo" }

$gguf = Join-Path $Dest 's2-pro-q6_k.gguf'
if (-not (Test-Path $gguf)) { throw "No está $gguf" }
Write-Host "OK — modelo listo: $gguf"

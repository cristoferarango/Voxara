# Descarga S2 Pro Q6_K + tokenizer (Fish Audio Research License — uso personal/investigación)
$ErrorActionPreference = 'Stop'
$Root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$Dest = Join-Path $Root 'eval\models\s2-pro-gguf'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "Destino: $Dest"

# Asegura huggingface_hub (la CLI `hf` puede no estar en el PATH en Windows).
python -m pip install -U "huggingface_hub" 2>&1 | Out-Null

# Descarga vía API de Python: robusto aunque `hf`/`huggingface-cli` no estén en PATH.
python (Join-Path $PSScriptRoot 'download_model.py')
if ($LASTEXITCODE -ne 0) { throw "Falló la descarga del modelo" }

$gguf = Get-ChildItem -Path $Dest -Filter *.gguf -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $gguf) { throw "No se encontró ningún .gguf en $Dest" }
Write-Host "OK — modelo listo: $($gguf.FullName)"

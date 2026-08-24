# Construye la imagen s2cpp:cuda y arranca el contenedor s2eval en :3030
$ErrorActionPreference = 'Stop'
$Eval = Resolve-Path (Join-Path $PSScriptRoot '..')
$Root = Resolve-Path (Join-Path $Eval '..')
$ModelDir = Join-Path $Eval 'models\s2-pro-gguf'
$Gguf = Join-Path $ModelDir 's2-pro-q6_k.gguf'
$Tok = Join-Path $ModelDir 'tokenizer.json'

if (-not (Test-Path $Gguf) -or -not (Test-Path $Tok)) {
  throw "Falta el modelo. Ejecuta primero: .\eval\scripts\download_model.ps1"
}
if (-not (Test-Path (Join-Path $Eval 's2.cpp\CMakeLists.txt'))) {
  throw "Falta eval/s2.cpp. ¿Clonaste el repo completo?"
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker no está en PATH"
}

Write-Host "Build imagen s2cpp:cuda (puede tardar)..."
Push-Location $Eval
try {
  docker build -f docker/s2cpp.Dockerfile -t s2cpp:cuda .
  if ($LASTEXITCODE -ne 0) { throw "docker build falló" }
} finally {
  Pop-Location
}

docker rm -f s2eval 2>$null | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Eval 'out'), (Join-Path $Eval 'refs') | Out-Null

Write-Host "Arrancando s2eval en 127.0.0.1:3030 ..."
docker run -d --name s2eval --gpus all `
  -p 3030:3030 `
  -v "${ModelDir}:/models" `
  -v "$(Join-Path $Eval 'refs'):/refs" `
  -v "$(Join-Path $Eval 'out'):/out" `
  s2cpp:cuda `
  --model /models/s2-pro-q6_k.gguf `
  --tokenizer /models/tokenizer.json `
  --cuda 0 `
  --codec-cpu `
  --server --host 0.0.0.0 --port 3030

if ($LASTEXITCODE -ne 0) { throw "docker run falló" }
Write-Host "OK — motor S2 Pro en http://127.0.0.1:3030 (contenedor s2eval)"
Write-Host "Desde la raíz del repo: npm install && npm run dev"

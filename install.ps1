#Requires -Version 5.1
<#
.SYNOPSIS
  Instalación completa de Voxara (clone → npm → modelo → Docker S2 Pro).

.DESCRIPTION
  Un solo comando (recomendado):

    irm https://gist.githubusercontent.com/cristoferarango/5c04b23cf4c8ac688aa5b0dd441c1227/raw/voxara | iex

  O desde el repo:

    irm https://raw.githubusercontent.com/cristoferarango/Voxara/main/install.ps1 | iex
    .\install.ps1

  Hace: clone → npm install → modelo → Docker s2eval → npm run dev.

.PARAMETER InstallDir
  Carpeta destino (default: $HOME\Voxara).

.PARAMETER SkipModel
  No descarga el GGUF (útil si ya lo tienes).

.PARAMETER SkipDocker
  No construye ni arranca s2eval.

.PARAMETER WithStt
  Crea el venv e instala dependencias de Audio → texto (omitido por defecto).

.PARAMETER NoUi
  No lanza la UI al final (por defecto sí arranca npm run dev).
#>
param(
  [string]$InstallDir = "",
  [switch]$SkipModel,
  [switch]$SkipDocker,
  [switch]$WithStt,
  [switch]$NoUi
)

$ErrorActionPreference = 'Stop'
$RepoUrl = 'https://github.com/cristoferarango/Voxara.git'
$Brand = 'Voxara'

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
  Write-Host "    OK  $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
  Write-Host "    !   $msg" -ForegroundColor Yellow
}

function Test-Cmd([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Assert-Cmd([string]$Name, [string]$Hint) {
  if (-not (Test-Cmd $Name)) {
    throw "Falta '$Name'. $Hint"
  }
}

Write-Host ""
Write-Host "  $Brand — instalador rápido" -ForegroundColor White
Write-Host "  https://corporacionarango.com" -ForegroundColor DarkGray
Write-Host "  Modelo S2 Pro: Fish Audio Research License (personal/investigación)" -ForegroundColor DarkGray
Write-Host ""

# --- Prerrequisitos ---
Write-Step "Comprobando prerrequisitos"
Assert-Cmd 'git' 'Instala Git: https://git-scm.com/downloads'
Assert-Cmd 'node' 'Instala Node.js 18+: https://nodejs.org'
Assert-Cmd 'npm' 'npm viene con Node.js'

$nodeMajor = [int]((node -v) -replace '^v','' -split '\.')[0]
if ($nodeMajor -lt 18) { throw "Node.js 18+ requerido (tienes $(node -v))" }
Write-Ok "Node $(node -v), npm $(npm -v), git $(git --version)"

if (-not $SkipDocker) {
  Assert-Cmd 'docker' 'Instala Docker Desktop con soporte NVIDIA GPU'
  docker info 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Docker no responde. ¿Está Docker Desktop en marcha?" }
  Write-Ok "Docker disponible"
  try {
    $gpu = docker info 2>$null | Select-String -Pattern 'Runtimes:.*nvidia|nvidia'
    if (-not $gpu) {
      Write-Warn "No se detectó runtime nvidia en 'docker info'. El contenedor puede fallar sin GPU."
    } else {
      Write-Ok "GPU NVIDIA visible para Docker"
    }
  } catch {
    Write-Warn "No se pudo verificar GPU en Docker"
  }
}

if (-not $SkipModel) {
  if (-not (Test-Cmd 'python') -and -not (Test-Cmd 'python3')) {
    throw "Falta Python 3 (hace falta para descargar el modelo con huggingface_hub)."
  }
  Write-Ok "Python listo para la descarga del modelo"
}

# --- Localizar / clonar repo ---
Write-Step "Preparando el repositorio"

function Test-VoxaraRoot([string]$Path) {
  $pkg = Join-Path $Path 'package.json'
  $s2 = Join-Path $Path 'eval\s2.cpp\CMakeLists.txt'
  if (-not (Test-Path $pkg) -or -not (Test-Path $s2)) { return $false }
  try {
    $name = (Get-Content $pkg -Raw | ConvertFrom-Json).name
    return ($name -eq 'voxara')
  } catch {
    return $false
  }
}

$Root = $null
if (Test-VoxaraRoot (Get-Location).Path) {
  $Root = (Get-Location).Path
  Write-Ok "Usando repo actual: $Root"
} elseif ($InstallDir -and (Test-VoxaraRoot $InstallDir)) {
  $Root = (Resolve-Path $InstallDir).Path
  Write-Ok "Usando: $Root"
} else {
  if (-not $InstallDir) {
    $InstallDir = Join-Path $env:USERPROFILE 'Voxara'
  }
  if (Test-Path (Join-Path $InstallDir '.git')) {
    $Root = (Resolve-Path $InstallDir).Path
    Write-Step "Actualizando $Root"
    Push-Location $Root
    try {
      git pull --ff-only
    } catch {
      Write-Warn "git pull falló; se continúa con la copia local"
    } finally {
      Pop-Location
    }
  } else {
    if (Test-Path $InstallDir) {
      throw "La carpeta '$InstallDir' existe pero no es un clone de Voxara. Elige otra con -InstallDir"
    }
    Write-Step "Clonando $RepoUrl → $InstallDir"
    git clone $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { throw "git clone falló" }
    $Root = (Resolve-Path $InstallDir).Path
  }
  if (-not (Test-VoxaraRoot $Root)) {
    throw "El directorio $Root no parece Voxara completo"
  }
  Write-Ok "Repo en $Root"
}

Set-Location $Root

# --- npm ---
Write-Step "npm install"
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install falló" }
Write-Ok "Dependencias UI instaladas"

# --- Modelo ---
if (-not $SkipModel) {
  Write-Step "Descargando S2 Pro Q6_K (~varios GB; puede tardar)"
  & "$Root\eval\scripts\download_model.ps1"
  Write-Ok "Modelo listo"
} else {
  Write-Warn "Omitida descarga del modelo (-SkipModel)"
}

# --- Docker motor ---
if (-not $SkipDocker) {
  Write-Step "Construyendo imagen y arrancando s2eval (:3030)"
  & "$Root\eval\scripts\start_s2.ps1"
  Write-Ok "Motor S2 Pro en http://127.0.0.1:3030"
} else {
  Write-Warn "Omitido Docker (-SkipDocker)"
}

# --- STT opcional ---
if ($WithStt) {
  Write-Step "Preparando Audio → texto (Whisper)"
  $Eval = Join-Path $Root 'eval'
  $Venv = Join-Path $Eval '.venv'
  $Py = Join-Path $Venv 'Scripts\python.exe'
  $Req = Join-Path $Root 'eval\scripts\requirements-stt.txt'
  if (-not (Test-Path $Py)) {
    python -m venv $Venv
    & $Py -m pip install -U pip
    & $Py -m pip install -r $Req
  }
  Write-Ok "STT listo. Arranca con: .\eval\scripts\start_stt.ps1"
} else {
  Write-Warn "STT omitido (usa -WithStt para instalar Whisper)"
}

# --- Fin ---
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  $Brand instalado en:" -ForegroundColor Green
Write-Host "  $Root" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Motor:  http://127.0.0.1:3030"
Write-Host "  UI:     http://127.0.0.1:5173"
Write-Host ""
Write-Host "  Si el motor se queda ocupado: docker restart s2eval"
Write-Host "  Licencias: Apache-2.0 (código) + Fish Audio Research (modelo)"
Write-Host "  https://corporacionarango.com"
Write-Host ""

if (-not $NoUi) {
  Write-Step "Arrancando UI en http://127.0.0.1:5173 (Ctrl+C para salir)"
  npm run dev
} else {
  Write-Host "  UI omitida (-NoUi). Arranca con: cd `"$Root`"; npm run dev"
  Write-Host ""
}

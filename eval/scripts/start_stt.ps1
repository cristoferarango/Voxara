# Whisper local (Audio → texto) en :3031
$ErrorActionPreference = 'Stop'
$Eval = Resolve-Path (Join-Path $PSScriptRoot '..')
$Venv = Join-Path $Eval '.venv'
$Py = Join-Path $Venv 'Scripts\python.exe'
$Req = Join-Path $PSScriptRoot 'requirements-stt.txt'

if (-not (Test-Path $Py)) {
  Write-Host "Creando venv en eval\.venv ..."
  python -m venv $Venv
  & $Py -m pip install -U pip
  & $Py -m pip install -r $Req
}

Write-Host "STT en http://127.0.0.1:3031 ..."
& $Py (Join-Path $PSScriptRoot 'stt_server.py')

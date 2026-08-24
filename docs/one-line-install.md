# Instalación one-shot de Voxara

Un solo comando deja Voxara listo en el PC: clone → npm → modelo → Docker → UI.

## Comando recomendado (Gist público)

### Windows

```powershell
irm https://gist.githubusercontent.com/cristoferarango/5c04b23cf4c8ac688aa5b0dd441c1227/raw/voxara | iex
```

Gist: https://gist.github.com/cristoferarango/5c04b23cf4c8ac688aa5b0dd441c1227

### Linux / macOS

```bash
curl -fsSL https://gist.githubusercontent.com/cristoferarango/e57bc3ff03f64184dc84a44a25a5808b/raw/voxara-ios | bash
```

Gist: https://gist.github.com/cristoferarango/e57bc3ff03f64184dc84a44a25a5808b

## Desde el repo (sin Gist)

```powershell
irm https://raw.githubusercontent.com/cristoferarango/Voxara/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/cristoferarango/Voxara/main/install.sh | bash
```

Si ya clonaste:

```powershell
.\install.ps1
```

```bash
chmod +x install.sh eval/scripts/*.sh
./install.sh
```

## Qué instala

| Paso | Resultado |
|------|-----------|
| Prerrequisitos | Git, Node 18+, Docker GPU, Python |
| Clone | `%USERPROFILE%\Voxara` o `~/Voxara` |
| UI deps | `npm install` |
| Modelo | `eval/models/s2-pro-gguf/s2-pro-q6_k.gguf` |
| Motor | contenedor `s2eval` → http://127.0.0.1:3030 |
| Frontend | `npm run dev` → http://127.0.0.1:5173 |

## Opciones

| Efecto | PowerShell | Bash |
|--------|------------|------|
| No abrir la UI | `-NoUi` | `--no-ui` |
| Preparar Whisper | `-WithStt` | `--with-stt` |
| Otra carpeta | `-InstallDir "D:\Voxara"` | `--dir ~/misc/Voxara` |
| Saltar modelo | `-SkipModel` | `--skip-model` |
| Saltar Docker | `-SkipDocker` | `--skip-docker` |

Ejemplo con opciones (Windows, sin pipe):

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/cristoferarango/Voxara/main/install.ps1 -OutFile $env:TEMP\voxara-install.ps1
& $env:TEMP\voxara-install.ps1 -WithStt -InstallDir "$env:USERPROFILE\Voxara"
```

## Requisitos de hardware / software

- Docker Desktop con NVIDIA Container Toolkit / GPU support  
- ~6–8 GB VRAM para Q6_K  
- Varios GB de disco (modelo + imagen)  
- Primera instalación: puede tardar 10–40+ min según red y disco  

## Problemas frecuentes

- **Docker no responde** → abre Docker Desktop y reintenta  
- **Sin GPU / nvidia** → el contenedor puede fallar; hace falta NVIDIA  
- **`server_busy`** → `docker restart s2eval`  
- **Puerto 5173 ocupado** → cierra el proceso Vite anterior o cambia puerto en Vite  

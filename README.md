# Voxara

**Clona voces. Genera audio. Corre en tu GPU.**

Voxara es una plataforma de IA de código abierto para **clonar voces** y generar audio con **texto a voz (TTS)**. Sube una muestra, crea una voz personalizada y convierte cualquier texto en habla realista — local, sencilla y lista para integrar.

| | |
|---|---|
| **Autor** | [Cristofer Arango](https://corporacionarango.com) |
| **Web** | [corporacionarango.com](https://corporacionarango.com) |
| **Licencia (código)** | [Apache License 2.0](LICENSE) |
| **Repo** | [github.com/cristoferarango/Voxara](https://github.com/cristoferarango/Voxara) |

> **Motor:** Fish Audio **S2 Pro** (GGUF) vía **s2.cpp** en Docker.  
> Los pesos del modelo tienen [licencia Fish Audio Research](eval/models/s2-pro-gguf/LICENSE.md) (uso personal / investigación; comercial requiere licencia de Fish Audio). Ver [NOTICE](NOTICE).

---

## Instalación en un solo comando

Un comando clona el repo, instala dependencias, descarga el modelo, levanta el motor en Docker y abre la UI.

### Windows (PowerShell)

```powershell
irm https://gist.githubusercontent.com/cristoferarango/5c04b23cf4c8ac688aa5b0dd441c1227/raw/voxara | iex
```

### Linux / macOS

```bash
curl -fsSL https://gist.githubusercontent.com/cristoferarango/e57bc3ff03f64184dc84a44a25a5808b/raw/voxara-ios | bash
```

Gists: [Windows](https://gist.github.com/cristoferarango/5c04b23cf4c8ac688aa5b0dd441c1227) · [Linux/macOS](https://gist.github.com/cristoferarango/e57bc3ff03f64184dc84a44a25a5808b)

### Alternativa (directo desde este repo)

```powershell
irm https://raw.githubusercontent.com/cristoferarango/Voxara/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/cristoferarango/Voxara/main/install.sh | bash
```

### Qué hace el instalador

1. Comprueba Git, Node.js 18+, Docker (GPU NVIDIA) y Python  
2. Clona (o actualiza) en `%USERPROFILE%\Voxara` / `~/Voxara`  
3. `npm install`  
4. Descarga **S2 Pro Q6_K**  
5. Build Docker + arranca contenedor **s2eval** en el puerto **3030**  
6. Lanza la UI: **http://127.0.0.1:5173**

La primera vez tarda (descarga del modelo + build de la imagen). Luego abre el navegador en esa URL.

| Opción | Windows | Linux / macOS |
|--------|---------|---------------|
| Sin UI al final | `-NoUi` | `--no-ui` |
| Incluir Whisper (STT) | `-WithStt` | `--with-stt` |
| Carpeta destino | `-InstallDir D:\Voxara` | `--dir ~/Voxara` |

Detalle: [docs/one-line-install.md](docs/one-line-install.md)

---

## Requisitos

1. Node.js 18+  
2. Docker Desktop con GPU NVIDIA  
3. ~6–8 GB VRAM (Q6_K)  
4. Python 3.10+ (descarga del modelo; también para Audio → texto)  
5. Varios GB libres en disco (modelo + imagen Docker)

---

## Características

- Clonación de voz desde audio (WAV/MP3 y más)
- Texto a voz con **2 generaciones** para elegir
- Biblioteca de voces en el navegador
- Descarga WAV / MP3
- Audio → texto opcional (Whisper local)
- Todo en tu máquina — sin API cloud obligatoria

---

## Si ya clonaste el repo

```bash
git clone https://github.com/cristoferarango/Voxara.git
cd Voxara
```

```powershell
# Windows — todo de una vez
.\install.ps1
```

```bash
# Linux / macOS — todo de una vez
chmod +x install.sh eval/scripts/*.sh
./install.sh
```

### Pasos manuales (opcional)

```powershell
npm install
.\eval\scripts\download_model.ps1
.\eval\scripts\start_s2.ps1
npm run dev
```

```bash
npm install
./eval/scripts/download_model.sh
./eval/scripts/start_s2.sh
npm run dev
```

Audio → texto (opcional): `.\eval\scripts\start_stt.ps1` / `./eval/scripts/start_stt.sh`

Si el motor se queda ocupado: `docker restart s2eval`

---

## Uso

1. **Clonación de voz** — sube 15–20 s de habla y guarda la voz  
2. **Texto a voz** — elige la voz, escribe el guion, genera 2 tomas  
3. Descarga en WAV o MP3  

Las voces se guardan en el navegador (IndexedDB), no en el servidor.

---

## Estructura

```text
Voxara/
├── install.ps1 / install.sh   # Instalador one-shot
├── src/                       # UI (React + Vite)
├── eval/
│   ├── s2.cpp/                # Motor de inferencia
│   ├── docker/                # Imagen CUDA
│   ├── models/                # LICENSE + docs (el .gguf se descarga)
│   └── scripts/               # download / start_s2 / start_stt
├── LICENSE                    # Apache-2.0 — Cristofer Arango
├── NOTICE                     # Atribuciones de terceros
└── README.md
```

---

## Licencias

| Componente | Licencia |
|------------|----------|
| Código Voxara (UI, scripts de este repo) | Apache-2.0 © 2026 Cristofer Arango |
| Modelo S2 Pro GGUF | Fish Audio Research License |
| s2.cpp / ggml | Ver avisos en `eval/s2.cpp/` y [NOTICE](NOTICE) |

---

## Autor

**Cristofer Arango** · [corporacionarango.com](https://corporacionarango.com)

Built for creators who want studio-quality voice cloning without giving up control of their stack.

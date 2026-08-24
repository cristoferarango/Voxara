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

## Características

- Clonación de voz desde audio (WAV/MP3 y más)
- Texto a voz con **2 generaciones** para elegir
- Biblioteca de voces en el navegador
- Descarga WAV / MP3
- Audio → texto opcional (Whisper local)
- Todo en tu máquina — sin API cloud obligatoria

---

## Requisitos

1. Node.js 18+
2. Docker con GPU NVIDIA
3. ~6–8 GB VRAM (Q6_K)
4. Python 3.10+ (solo para Audio → texto)

---

## Instalación rápida

```bash
git clone https://github.com/cristoferarango/Voxara.git
cd Voxara
npm install
```

### 1. Descargar el modelo S2 Pro

```powershell
# Windows
.\eval\scripts\download_model.ps1
```

```bash
# Linux / macOS
chmod +x eval/scripts/*.sh
./eval/scripts/download_model.sh
```

### 2. Arrancar el motor (puerto 3030)

```powershell
.\eval\scripts\start_s2.ps1
```

```bash
./eval/scripts/start_s2.sh
```

### 3. UI

```bash
npm run dev
```

Abre **http://127.0.0.1:5173**

### 4. (Opcional) Audio → texto

```powershell
.\eval\scripts\start_stt.ps1
```

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
├── src/                 # UI (React + Vite)
├── eval/
│   ├── s2.cpp/          # Motor de inferencia
│   ├── docker/          # Imagen CUDA
│   ├── models/          # LICENSE + docs (el .gguf se descarga)
│   └── scripts/         # download / start_s2 / start_stt
├── LICENSE              # Apache-2.0 — Cristofer Arango
├── NOTICE               # Atribuciones de terceros
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

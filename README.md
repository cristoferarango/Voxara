# FishVoiceUI

UI local para **clonar voz** y **texto a voz** con **Fish Audio S2 Pro (GGUF)** vía **s2.cpp** en Docker (GPU NVIDIA).

Licencia del modelo: [Fish Audio Research License](eval/models/s2-pro-gguf/LICENSE.md) — uso personal / investigación. Uso comercial requiere licencia aparte de Fish Audio.

---

## Qué incluye este repo

| Incluido en Git | No incluido (se descarga al instalar) |
|-----------------|----------------------------------------|
| UI React/Vite (`src/`) | `s2-pro-q6_k.gguf` (~4.3 GB) |
| Código **s2.cpp** + ggml (`eval/s2.cpp/`) | `eval/.venv/` (Whisper) |
| Dockerfile + scripts | Audios de `eval/out/` |
| Tokenizer docs / LICENSE del modelo | |

Las voces clonadas en la UI se guardan en el **navegador** (IndexedDB), no en el repo.

---

## Requisitos

1. **Node.js 18+**
2. **Docker Desktop** con GPU (**NVIDIA Container Toolkit** / WSL2 en Windows)
3. GPU ~**6–8 GB VRAM** (Q6_K)
4. **Python 3.10+** (solo si usas Audio → texto / Whisper)
5. Opcional: `huggingface_hub` CLI para bajar el modelo

---

## Arranque (otra máquina, desde cero)

```bash
git clone <URL_DE_ESTE_REPO> FishVoiceUI
cd FishVoiceUI
npm install
```

### 1) Descargar el modelo

**Windows (PowerShell):**

```powershell
.\eval\scripts\download_model.ps1
```

**Linux/macOS:**

```bash
chmod +x eval/scripts/*.sh
./eval/scripts/download_model.sh
```

Debe quedar:

```text
eval/models/s2-pro-gguf/s2-pro-q6_k.gguf
eval/models/s2-pro-gguf/tokenizer.json
```

### 2) Arrancar el motor S2 (Docker → puerto 3030)

**Windows:**

```powershell
.\eval\scripts\start_s2.ps1
```

**Linux/macOS:**

```bash
./eval/scripts/start_s2.sh
```

Esto construye la imagen `s2cpp:cuda` y levanta el contenedor `s2eval` con `--codec-cpu` (recomendado en esta GPU stack).

Comprueba: `http://127.0.0.1:3030/` (suele responder 404; eso es normal — el endpoint útil es `POST /generate`).

### 3) Arrancar la UI

```bash
npm run dev
```

Abre **http://127.0.0.1:5173**

Vite reenvía:

- `/api/generate` → s2.cpp `:3030`
- `/api/transcribe` → Whisper `:3031` (opcional)

### 4) (Opcional) Audio → texto

```powershell
.\eval\scripts\start_stt.ps1
```

```bash
./eval/scripts/start_stt.sh
```

---

## Variables de entorno

```bash
copy .env.example .env   # Windows
# cp .env.example .env   # Linux/macOS
```

Por defecto `VITE_API_URL=/api` (proxy Vite). No hace falta cambiar nada en local.

---

## Operación diaria

| Acción | Comando |
|--------|---------|
| UI | `npm run dev` |
| Reiniciar motor si queda en 503 | `docker restart s2eval` |
| Parar motor | `docker stop s2eval` |
| STT | `.\eval\scripts\start_stt.ps1` |

Si una generación falla y el motor queda ocupado, reinicia `s2eval` y espera ~10–20 s.

---

## Estructura

```text
FishVoiceUI/
├── src/                      # UI
├── vite.config.js            # Proxy + health/cancel s2
├── eval/
│   ├── s2.cpp/               # Motor C++ (vendored)
│   ├── docker/s2cpp.Dockerfile
│   ├── models/s2-pro-gguf/   # LICENSE + README; .gguf NO en git
│   ├── scripts/
│   │   ├── download_model.ps1 / .sh
│   │   ├── start_s2.ps1 / .sh
│   │   ├── start_stt.ps1 / .sh
│   │   ├── stt_server.py
│   │   └── requirements-stt.txt
│   └── texts/
└── README.md
```

---

## Push a GitHub

```bash
git remote add origin https://github.com/TU_USUARIO/FishVoiceUI.git
git branch -M main
git push -u origin main
```

Quien clone debe repetir **descarga del modelo** + **start_s2** + `npm run dev`.

---

## Scripts npm

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo (5173) |
| `npm run build` | Build `dist/` |
| `npm run preview` | Preview del build |

# FishVoiceUI

Interfaz web local inspirada en Fish Audio para **clonar voz** y generar **TTS** con tu servidor Fish Speech (S1-mini).

Proyecto **separado** de `FishVoice` (el motor). Esta carpeta sí está pensada para subir a tu propio repositorio Git.

---

## Requisitos

1. Node.js 18+  
2. Fish Speech API corriendo en `http://127.0.0.1:8080`  
   (en la carpeta FishVoice: `start_fishvoice_api.bat`)

---

## Instalación

```bash
cd FishVoiceUI
npm install
```

Opcional — copia variables de entorno:

```bash
copy .env.example .env
```

---

## Uso

1. Arranca la API de FishVoice (otra terminal):
   ```bat
   cd ..\FishVoice
   start_fishvoice_api.bat
   ```

2. Arranca la UI:
   ```bash
   npm run dev
   ```

3. Abre **http://127.0.0.1:5173**

### Flujo de clonación

1. **Clonación de voz** → sube o graba 10–30s de audio  
2. Escribe el texto exacto del audio de referencia  
3. Escribe el texto nuevo a generar  
4. **Clonar y generar** → descarga el WAV  

También puedes ir a **Texto a voz** para reutilizar la voz cargada.

---

## Subir a GitHub

```bash
cd FishVoiceUI
git init
git add .
git commit -m "feat: interfaz FishVoiceUI para clonación y TTS local"
gh repo create FishVoiceUI --public --source=. --remote=origin --push
```

O crea el repo vacío en GitHub y:

```bash
git remote add origin https://github.com/TU_USUARIO/FishVoiceUI.git
git branch -M main
git push -u origin main
```

---

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (puerto 5173) |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Previsualizar el build |

El proxy de Vite reenvía `/api/*` → `http://127.0.0.1:8080/*` para evitar CORS en desarrollo.

---

## Estructura

```
FishVoiceUI/
├── public/
├── src/
│   ├── api.js                 # Cliente HTTP → Fish Speech
│   ├── App.jsx
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── VoiceClone.jsx     # Pantalla tipo Fish Audio
│   │   ├── TextToSpeech.jsx
│   │   └── Home.jsx
│   └── index.css
├── .env.example
├── package.json
└── README.md
```

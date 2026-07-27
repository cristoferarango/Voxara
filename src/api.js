const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/v1/health`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error('Servidor no disponible')
  return res.json()
}

/**
 * Genera audio TTS. Si hay archivo de referencia + texto de referencia, clona la voz.
 */
export async function generateTTS({
  text,
  referenceFile = null,
  referenceText = '',
  format = 'wav',
  temperature = 0.7,
  topP = 0.7,
  chunkLength = 200,
  maxNewTokens = 1024,
}) {
  const payload = {
    text,
    format,
    temperature,
    top_p: topP,
    chunk_length: chunkLength,
    max_new_tokens: maxNewTokens,
    repetition_penalty: 1.1,
    normalize: true,
    references: [],
    reference_id: null,
  }

  if (referenceFile && referenceText.trim()) {
    const audioB64 = await fileToBase64(referenceFile)
    payload.references = [{ audio: audioB64, text: referenceText.trim() }]
  }

  const res = await fetch(`${API_BASE}/v1/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText || `Error HTTP ${res.status}`)
  }

  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const duration = audio.duration
      URL.revokeObjectURL(url)
      if (!Number.isFinite(duration)) reject(new Error('No se pudo leer la duración'))
      else resolve(duration)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Archivo de audio inválido'))
    }
    audio.src = url
  })
}

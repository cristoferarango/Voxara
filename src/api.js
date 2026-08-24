/** s2.cpp local (Vite proxy → puerto 3030). */
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export function getApiBase() {
  return API_BASE
}

/** Codec en GPU. ~21.5 frames/s. */
export function estimateGenerationSeconds(text, hasReference = false) {
  const chars = (text || '').trim().length
  const audioSec = Math.min(60, Math.max(4, chars / 13))
  const wall = (hasReference ? 12 : 6) + audioSec * 1.6
  return Math.max(12, Math.min(90, Math.round(wall)))
}

function plainTtsChars(text) {
  return (text || '').replace(/<\|speaker:\d+\|>/g, '').trim().length
}

/**
 * s2.cpp ya pone <|speaker:0|> en la referencia. Si lo repetimos en el
 * texto, o dejamos saltos de línea, el modelo mete otro locutor en las pausas.
 */
export function sanitizeTtsText(text) {
  let t = (text || '').replace(/<\|speaker:\d+\|>/g, '')
  t = t.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ')
  t = t.replace(/\n{2,}/g, '. ')
  t = t.replace(/\n/g, ' ')
  t = t.replace(/[ \t]+/g, ' ')
  t = t.replace(/\s+([.,;:!?¡¿])/g, '$1')
  t = t.replace(/([.!?]){2,}/g, '$1')
  return t.trim()
}

export function tokensForText(text, cap = 1400) {
  const chars = plainTtsChars(text)
  const frames = Math.round((chars / 11.5) * 22 + 48)
  return Math.min(cap, Math.max(96, frames))
}

export function clipReferenceText(refText, audioSec = 20) {
  const t = (refText || '')
    .replace(/<\|speaker:\d+\|>/g, '')
    .trim()
    .replace(/\s+/g, ' ')
  const maxChars = Math.max(110, Math.round(audioSec * 14))
  if (t.length <= maxChars) return t
  const slice = t.slice(0, maxChars)
  const sp = slice.lastIndexOf(' ')
  return (sp > 50 ? slice.slice(0, sp) : slice).trim()
}

export async function cancelS2Job() {
  try {
    await fetch('/__s2_cancel', { method: 'POST' })
  } catch {
    /* ignore */
  }
}

export async function checkHealth() {
  const res = await fetch('/__s2_health', {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Health HTTP ${res.status}`)
  const body = await res.json().catch(() => ({}))
  if (body.ok === false) throw new Error('s2.cpp no responde en :3030')
  return { status: 'ok', engine: 's2.cpp', ...body }
}

/** s2.cpp only decodes WAV/MP3 in memory. Other formats silently fall back to the default (female) voice. */
function encodeWavPcm16Mono(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate
  const n = audioBuffer.length
  const nCh = audioBuffer.numberOfChannels
  const chans = Array.from({ length: nCh }, (_, c) => audioBuffer.getChannelData(c))
  const dataSize = n * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, dataSize, true)
  let o = 44
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let c = 0; c < nCh; c++) s += chans[c][i]
    s = Math.max(-1, Math.min(1, s / nCh))
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    o += 2
  }
  return buffer
}

async function trimAndResampleMono(decoded, maxSec, targetRate) {
  const srcRate = decoded.sampleRate
  const nCh = decoded.numberOfChannels
  const keep = Math.min(decoded.length, Math.floor(maxSec * srcRate))
  const mono = new Float32Array(keep)
  for (let i = 0; i < keep; i++) {
    let s = 0
    for (let c = 0; c < nCh; c++) s += decoded.getChannelData(c)[i]
    mono[i] = s / nCh
  }
  const mk = (len, rate) => {
    const ctx = new OfflineAudioContext(1, Math.max(1, len), rate)
    const buf = ctx.createBuffer(1, Math.max(1, len), rate)
    buf.copyToChannel(mono.subarray(0, len), 0)
    return buf
  }
  if (srcRate === targetRate) return mk(keep, srcRate)

  const outLen = Math.max(1, Math.round((keep / srcRate) * targetRate))
  const offline = new OfflineAudioContext(1, outLen, targetRate)
  const buf = offline.createBuffer(1, keep, srcRate)
  buf.copyToChannel(mono, 0)
  const src = offline.createBufferSource()
  src.buffer = buf
  src.connect(offline.destination)
  src.start(0)
  return offline.startRendering()
}

/** El codec S2 es 44.1 kHz. Más segundos de muestra = más emoción y énfasis. */
export const CODEC_SAMPLE_RATE = 44100
export const REF_SECONDS = 20

export async function audioFileToWav(file, { maxSec = REF_SECONDS, sampleRate = CODEC_SAMPLE_RATE } = {}) {
  const raw = await file.arrayBuffer()
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) {
    throw new Error('Este navegador no puede convertir el audio a WAV')
  }
  const ctx = new Ctx()
  let decoded
  try {
    decoded = await ctx.decodeAudioData(raw.slice(0))
    const prepared = await trimAndResampleMono(decoded, maxSec, sampleRate)
    const wav = encodeWavPcm16Mono(prepared)
    const base = (file.name || 'reference').replace(/\.[^.]+$/, '') || 'reference'
    return new File([wav], `${base}.wav`, { type: 'audio/wav' })
  } catch (err) {
    if (err instanceof Error && err.message.includes('WAV')) throw err
    throw new Error(
      'No se pudo leer el audio de referencia. Usa WAV o MP3 (M4A/WebM del celular a veces no entran).',
    )
  } finally {
    await ctx.close().catch(() => {})
  }
}

async function wavPcmInfo(file) {
  const head = await file.slice(0, 44).arrayBuffer()
  if (head.byteLength < 44) return null
  const v = new DataView(head)
  const tag = (o, n) =>
    String.fromCharCode(...new Uint8Array(head, o, n))
  if (tag(0, 4) !== 'RIFF' || tag(8, 4) !== 'WAVE') return null
  return {
    format: v.getUint16(20, true),
    channels: v.getUint16(22, true),
    sampleRate: v.getUint32(24, true),
    bits: v.getUint16(34, true),
  }
}

/** No reconvertir un WAV PCM 44.1 kHz ya preparado (pérdida de calidad). */
async function ensureReferenceWav(file) {
  const info = await wavPcmInfo(file).catch(() => null)
  if (
    info &&
    info.format === 1 &&
    info.channels === 1 &&
    info.bits === 16 &&
    info.sampleRate === CODEC_SAMPLE_RATE
  ) {
    return file
  }
  return audioFileToWav(file, { maxSec: REF_SECONDS, sampleRate: CODEC_SAMPLE_RATE })
}

/**
 * POST /generate (multipart) → audio/wav
 */
export async function generateTTS({
  text,
  referenceFile = null,
  referenceText = '',
  temperature = 0.7,
  topP = 0.88,
  maxNewTokens,
  signal,
  onStatus,
  onProgress,
}) {
  const hasRef = !!(referenceFile && referenceText.trim())
  const prompt = sanitizeTtsText(text)
  const estimateSec = estimateGenerationSeconds(prompt, hasRef)
  const tokens = maxNewTokens ?? tokensForText(prompt, 1400)
  const t0 = Date.now()

  const report = (partial) => {
    if (signal?.aborted) return
    const elapsedSec = (Date.now() - t0) / 1000
    const percent = partial.percent ?? 0
    const etaSec =
      percent >= 99 ? 0 : Math.max(0, estimateSec * (1 - percent / 100) * 0.85)
    const payload = {
      percent,
      label: partial.label || '',
      elapsedSec,
      etaSec,
      phase: partial.phase || 'work',
    }
    onProgress?.(payload)
    if (partial.label) onStatus?.(partial.label)
  }

  const form = new FormData()
  form.append('text', prompt)
  if (hasRef) {
    report({ percent: 4, label: 'Preparando audio de referencia...', phase: 'encode' })
    const wavFile = await ensureReferenceWav(referenceFile)
    report({ percent: 8, label: 'Adjuntando audio de referencia...', phase: 'encode' })
    form.append('reference', wavFile, wavFile.name || 'reference.wav')
    form.append('reference_text', clipReferenceText(referenceText, REF_SECONDS))
  }
  if (signal?.aborted) throw new Error('Generación cancelada')

  form.append(
    'params',
    JSON.stringify({
      max_new_tokens: tokens,
      min_tokens_before_end: 0,
      temperature,
      top_p: topP,
      top_k: 40,
      stream_decode_stride_frames: 1024,
    }),
  )

  report({
    percent: hasRef ? 12 : 8,
    label: `Enviando a S2 Pro Q6_K (~${estimateSec}s est.)...`,
    phase: 'send',
  })

  const genStart = Date.now()
  const ticker = setInterval(() => {
    if (signal?.aborted) {
      clearInterval(ticker)
      return
    }
    const elapsed = (Date.now() - genStart) / 1000
    const span = Math.max(estimateSec, 16)
    const percent = Math.min(94, 12 + (elapsed / span) * 82)
    const label =
      elapsed < span * 0.5
        ? `Generando en GPU… ${Math.round(elapsed)}s`
        : `Decodificando audio… ${Math.round(elapsed)}s`
    report({
      percent,
      label,
      phase: 'generate',
    })
  }, 250)

  let res
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      body: form,
      signal,
    })
  } catch (err) {
    clearInterval(ticker)
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw new Error('Generación cancelada')
    }
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      msg === 'Failed to fetch' || msg.includes('fetch')
        ? 'No se pudo hablar con s2.cpp. Recarga http://localhost:5173/ y comprueba que el contenedor sigue arriba.'
        : msg,
    )
  } finally {
    clearInterval(ticker)
  }

  if (!res) {
    throw new Error('Sin respuesta del motor S2 Pro')
  }

  if (res.status === 503) {
    throw new Error('El motor estaba ocupado; si vuelve a pasar, pulsa Cancelar y espera a que diga libre.')
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    if (res.status === 504 || /Tiempo de espera/i.test(errText)) {
      throw new Error(
        's2.cpp tardó demasiado. Cancela, espera 10 s y vuelve a generar con un texto más corto (1–2 frases).',
      )
    }
    throw new Error(
      errText?.slice(0, 280) ||
        `La API respondió ${res.status}. ¿Está corriendo s2.cpp en el puerto 3030?`,
    )
  }

  const contentType = res.headers.get('content-type') || ''
  report({ percent: 92, label: 'Recibiendo WAV...', phase: 'download' })

  if (signal?.aborted) throw new Error('Generación cancelada')
  const blob = await res.blob()
  if (signal?.aborted) throw new Error('Generación cancelada')

  if (!blob.size) throw new Error('La API devolvió audio vacío')

  if (contentType.includes('json')) {
    const textBody = await blob.text()
    throw new Error(`Respuesta JSON inesperada: ${textBody.slice(0, 200)}`)
  }

  report({
    percent: 100,
    label: `Completado — ${Math.round(blob.size / 1024)} KB`,
    phase: 'done',
  })

  return URL.createObjectURL(blob)
}

export async function transcribeAudio({ file, language = 'es', onProgress }) {
  const t0 = Date.now()
  const report = (partial) => {
    onProgress?.({
      percent: partial.percent ?? 0,
      label: partial.label || '',
      elapsedSec: (Date.now() - t0) / 1000,
      etaSec: partial.etaSec ?? 15,
      phase: partial.phase || 'work',
    })
  }
  report({ percent: 8, label: 'Convirtiendo a WAV 16 kHz...', phase: 'encode' })
  const wav = await audioFileToWav(file, { maxSec: 600, sampleRate: 16000 })
  report({ percent: 18, label: 'Enviando a Whisper local...', phase: 'send' })
  const ticker = setInterval(() => {
    const elapsed = (Date.now() - t0) / 1000
    report({
      percent: Math.min(88, 18 + elapsed * 2),
      label: `Transcribiendo… ${Math.round(elapsed)}s`,
      phase: 'generate',
      etaSec: 20,
    })
  }, 250)
  let res
  try {
    res = await fetch(`/api/transcribe?lang=${encodeURIComponent(language)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: wav,
    })
  } catch {
    throw new Error(
      'No se pudo hablar con Whisper. Arranca eval/scripts/stt_server.py (puerto 3031).',
    )
  } finally {
    clearInterval(ticker)
  }
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || payload.ok === false) {
    throw new Error(
      payload.error ||
        `Whisper respondió ${res.status}. ¿Está el servidor STT en :3031?`,
    )
  }
  report({ percent: 100, label: 'Listo', phase: 'done', etaSec: 0 })
  return payload
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

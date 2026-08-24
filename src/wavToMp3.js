import { Mp3Encoder } from '@breezystack/lamejs'

function readFour(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

function parseWavPcm(buffer) {
  const view = new DataView(buffer)
  if (buffer.byteLength < 44 || readFour(view, 0) !== 'RIFF' || readFour(view, 8) !== 'WAVE') {
    throw new Error('El audio no es un WAV válido')
  }

  let offset = 12
  let format = 1
  let channels = 1
  let sampleRate = 44100
  let bits = 16
  let dataOffset = -1
  let dataSize = 0

  while (offset + 8 <= view.byteLength) {
    const id = readFour(view, offset)
    const size = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (id === 'fmt ') {
      format = view.getUint16(start, true)
      channels = view.getUint16(start + 2, true)
      sampleRate = view.getUint32(start + 4, true)
      bits = view.getUint16(start + 14, true)
    } else if (id === 'data') {
      dataOffset = start
      dataSize = size
      break
    }
    offset = start + size + (size % 2)
  }

  if (dataOffset < 0) throw new Error('WAV sin datos de audio')

  const samples = Math.floor(dataSize / (channels * (bits / 8)))
  const left = new Int16Array(samples)
  const right = channels > 1 ? new Int16Array(samples) : null

  if (format === 1 && bits === 16) {
    for (let i = 0; i < samples; i++) {
      const o = dataOffset + i * channels * 2
      left[i] = view.getInt16(o, true)
      if (right) right[i] = view.getInt16(o + 2, true)
    }
  } else if (format === 3 && bits === 32) {
    const toI16 = (f) => {
      const s = Math.max(-1, Math.min(1, f))
      return s < 0 ? s * 0x8000 : s * 0x7fff
    }
    for (let i = 0; i < samples; i++) {
      const o = dataOffset + i * channels * 4
      left[i] = toI16(view.getFloat32(o, true))
      if (right) right[i] = toI16(view.getFloat32(o + 4, true))
    }
  } else {
    throw new Error(`WAV no soportado (formato ${format}, ${bits} bit)`)
  }

  return { sampleRate, channels, left, right }
}

export async function wavBufferToMp3Blob(arrayBuffer, kbps = 192) {
  const { sampleRate, channels, left, right } = parseWavPcm(arrayBuffer)
  const encoder = new Mp3Encoder(channels, sampleRate, kbps)
  const block = 1152
  const parts = []

  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block)
    const encoded =
      channels > 1 ? encoder.encodeBuffer(l, right.subarray(i, i + block)) : encoder.encodeBuffer(l)
    if (encoded.length) parts.push(encoded)
  }
  const flush = encoder.flush()
  if (flush.length) parts.push(flush)

  return new Blob(parts, { type: 'audio/mpeg' })
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function downloadGeneratedAudio(audioUrl, { format = 'wav', basename = 'fishvoice' } = {}) {
  const safe = (basename || 'fishvoice').replace(/[<>:"/\\|?*]+/g, '_').trim() || 'fishvoice'
  const res = await fetch(audioUrl)
  if (!res.ok) throw new Error('No se pudo leer el audio generado')
  const buf = await res.arrayBuffer()
  if (format === 'mp3') {
    const blob = await wavBufferToMp3Blob(buf, 192)
    triggerDownload(blob, `${safe}.mp3`)
    return
  }
  triggerDownload(new Blob([buf], { type: 'audio/wav' }), `${safe}.wav`)
}

import { useCallback, useMemo, useRef, useState } from 'react'
import { IconMic, IconMoon, IconRecord, IconUpload } from '../icons'
import { generateTTS, getAudioDuration, audioFileToWav, cancelS2Job, clipReferenceText, transcribeAudio, REF_SECONDS } from '../api'
import ProgressPanel from './ProgressPanel'
import AudioDownload from './AudioDownload'

const MAX_MB = 32
const MIN_SEC = 5
const GOOD_SEC = 30
const MAX_SEC = 210

const ACCEPT =
  'audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/flac,audio/webm,audio/ogg,video/mp4,video/webm,.mp3,.wav,.m4a,.flac,.mp4,.mov,.webm,.weba,.opus'

function formatSec(s) {
  if (!Number.isFinite(s) || s <= 0) return '0s'
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m ${sec}s`
}

export default function VoiceClone({ existingNames = [], onPersistVoice, onGoTts, onBusy }) {
  const inputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [duration, setDuration] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [voiceName, setVoiceName] = useState('')
  const [refText, setRefText] = useState('')
  const [ttsText, setTtsText] = useState('Hola, esta es una prueba de mi voz clonada.')
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)
  const abortRef = useRef(null)

  const fillPct = useMemo(() => Math.min(100, (duration / MAX_SEC) * 100), [duration])

  const applyFile = useCallback(
    async (f) => {
      setError('')
      if (!f) return
      if (f.size > MAX_MB * 1024 * 1024) {
        setError(`El archivo supera ${MAX_MB} MB`)
        return
      }
      try {
        const d = await getAudioDuration(f)
        setFile(f)
        setDuration(d)
        if (!voiceName) setVoiceName(f.name.replace(/\.[^.]+$/, ''))
        setStep(2)
      } catch (e) {
        setError(e.message || 'No se pudo leer el audio')
      }
    },
    [voiceName],
  )

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) applyFile(f)
  }

  const clearFile = () => {
    setFile(null)
    setDuration(0)
    setStep(1)
    setAudioUrl(null)
    setError('')
  }

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const f = new File([blob], `grabacion-${Date.now()}.webm`, {
          type: 'audio/webm',
        })
        await applyFile(f)
      }
      mediaRecorderRef.current = mr
      mr.start()
      setRecording(true)
    } catch {
      setError('No se pudo acceder al micrófono. Permite el acceso o sube un archivo.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const saveVoiceAndGenerate = async () => {
    setError('')
    setSavedOk(false)
    if (!file) {
      setError('Sube o graba un audio primero')
      return
    }
    if (duration < MIN_SEC) {
      setError(
        `Necesitas al menos ${MIN_SEC} segundos de audio (tienes ${formatSec(duration)})`,
      )
      return
    }
    if (!voiceName.trim()) {
      setError('Ponle un nombre único a esta voz')
      return
    }
    const taken = existingNames.some(
      (n) => n.trim().toLowerCase() === voiceName.trim().toLowerCase(),
    )
    if (taken) {
      setError(`Ya existe una voz llamada «${voiceName.trim()}». Usa otro nombre.`)
      return
    }
    if (!refText.trim()) {
      setError('Escribe el texto exacto que se escucha en el audio de referencia (solo lo hablado)')
      return
    }

    const ac = new AbortController()
    abortRef.current?.abort()
    abortRef.current = ac
    setLoading(true)
    setStatusMsg('')
    setProgress({ percent: 1, label: `Guardando voz (primeros ${REF_SECONDS} s)...`, elapsedSec: 0, etaSec: 8 })
    setAudioUrl(null)
    onBusy?.(true)

    try {
      const wavFile = await audioFileToWav(file)
      let aligned = clipReferenceText(refText.trim(), REF_SECONDS)
      const tooLong = refText.trim().replace(/\s+/g, ' ').length > REF_SECONDS * 16
      if (tooLong) {
        setProgress({
          percent: 10,
          label: `El texto de referencia es más largo que el clip. Transcribiendo los ${REF_SECONDS} s…`,
          elapsedSec: 0,
          etaSec: 20,
        })
        try {
          const stt = await transcribeAudio({
            file: wavFile,
            language: 'es',
            onProgress: setProgress,
          })
          if (stt.text?.trim()) aligned = stt.text.trim()
        } catch {
          /* Whisper opcional: se usa el recorte del texto pegado */
        }
      }
      await onPersistVoice?.({
        name: voiceName.trim(),
        file: wavFile,
        duration: Math.min(duration, REF_SECONDS),
        refText: aligned,
      })
      setSavedOk(true)
      setProgress({ percent: 100, label: 'Voz guardada', elapsedSec: 0, etaSec: 0 })
      if (ttsText.trim()) {
        const url = await generateTTS({
          text: ttsText.trim(),
          referenceFile: wavFile,
          referenceText: aligned,
          signal: ac.signal,
          onStatus: setStatusMsg,
          onProgress: setProgress,
        })
        if (ac.signal.aborted) return
        setAudioUrl(url)
        setStatusMsg('Voz guardada. Prueba generada con el texto que escribiste.')
      } else {
        setStatusMsg('Voz guardada. Úsala en Texto a voz.')
      }
    } catch (e) {
      setError(
        e.message ||
          'Error al guardar o generar. ¿Está s2.cpp en el puerto 3030?',
      )
      setStatusMsg('')
      setProgress(null)
    } finally {
      abortRef.current = null
      setLoading(false)
      onBusy?.(false)
    }
  }

  const cancelGenerate = () => {
    abortRef.current?.abort()
    cancelS2Job()
    setLoading(false)
    onBusy?.(false)
    setProgress(null)
    setError('Generación cancelada. El motor se está deteniendo (~10 s).')
  }

  return (
    <>
      <header className="topbar">
        <h1>Construir una nueva voz</h1>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Tema oscuro" aria-label="Tema">
            <IconMoon />
          </button>
        </div>
      </header>

      <div className="content">
        <aside className="steps">
          <div className={`step ${step === 1 ? 'active' : duration > 0 ? 'done' : ''}`}>
            <span className="step-num">{duration > 0 && step !== 1 ? '✓' : '1'}</span>
            Audio Fuente
          </div>
          <div className={`step ${step === 2 ? 'active' : ''}`}>
            <span className="step-num">2</span>
            Detalles de Voz
          </div>
        </aside>

        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-kicker">
              <IconMic />
              Clon de Voz Instantáneo
            </h2>
            <p className="panel-sub">
              Sube 15–20 s de esa voz, con la emoción y el énfasis que quieres copiar. Se usan los
              primeros {REF_SECONDS} s tal cual. El nombre no puede repetirse.
            </p>
          </div>

          {step === 1 && (
            <>
              <div
                className={`upload-zone ${dragOver ? 'dragover' : ''} ${file ? 'has-file' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <h3 className="upload-title">Añade o suelta tus archivos de audio</h3>
                <p className="upload-desc">
                  Arrastra y suelta o haz clic para cargar / grabar. Formatos: MP3, WAV, M4A,
                  FLAC, MP4, MOV, WEBM, WEBA, OPUS — MAX {MAX_MB}MB.
                </p>
                <div className="upload-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => inputRef.current?.click()}
                  >
                    <IconUpload />
                    Cargar
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                  >
                    <IconRecord />
                    {recording ? 'Detener' : 'Registro'}
                  </button>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  hidden
                  onChange={(e) => applyFile(e.target.files?.[0])}
                />
              </div>

              <div className="duration-wrap">
                <div className="duration-label">
                  Subido: <strong>{formatSec(duration)}</strong>
                </div>
                <div className="duration-track">
                  <div className="duration-fill" style={{ width: `${fillPct}%` }} />
                </div>
                <div className="duration-marks">
                  <span>
                    <b>10s</b> Min
                  </span>
                  <span>
                    <b>30s</b> Bien
                  </span>
                  <span>
                    <b>210s</b> Max
                  </span>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="form-card">
              {file && (
                <div className="file-chip" style={{ marginTop: 0, marginBottom: 18 }}>
                  <span>🎙 {file.name}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{formatSec(duration)}</span>
                  <button type="button" onClick={clearFile} title="Quitar">
                    ✕
                  </button>
                </div>
              )}

              <div className="duration-wrap" style={{ marginTop: 0, marginBottom: 20 }}>
                <div className="duration-label">
                  Subido: <strong>{formatSec(duration)}</strong>
                </div>
                <div className="duration-track">
                  <div className="duration-fill" style={{ width: `${fillPct}%` }} />
                </div>
                <div className="duration-marks">
                  <span>
                    <b>10s</b> Min
                  </span>
                  <span>
                    <b>30s</b> Bien
                  </span>
                  <span>
                    <b>210s</b> Max
                  </span>
                </div>
                {duration > 0 && duration < MIN_SEC && (
                  <p className="hint warn">
                    Faltan {formatSec(MIN_SEC - duration)} para el mínimo.
                  </p>
                )}
                {duration >= MIN_SEC && duration < GOOD_SEC && (
                  <p className="hint">Bien para empezar. 30s da mejor calidad.</p>
                )}
                {duration >= GOOD_SEC && (
                  <p className="hint ok">Duración óptima para clonar.</p>
                )}
              </div>

              <div className="field">
                <label htmlFor="voiceName">Nombre de la voz</label>
                <input
                  id="voiceName"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="Nombre único, ej: Narrador Piura"
                />
              </div>

              <div className="field">
                <label htmlFor="refText">Texto del audio de referencia</label>
                <textarea
                  id="refText"
                  value={refText}
                  onChange={(e) => setRefText(e.target.value)}
                  placeholder={`Lo que se oye al inicio (los primeros ${REF_SECONDS} s)...`}
                />
                <p className="field-hint">
                  Escribe lo que se escucha en esos {REF_SECONDS} s, con las mismas pausas si puedes.
                  El modelo copia el tono de esa muestra. Si pegas una letra entera, tiende a cantar.
                </p>
                <div className="form-actions" style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={loading || !file}
                    onClick={async () => {
                      setError('')
                      try {
                        const wavFile = await audioFileToWav(file)
                        const stt = await transcribeAudio({ file: wavFile, language: 'es' })
                        if (!stt.text?.trim()) {
                          setError(`Whisper no detectó habla en los ${REF_SECONDS} s. Prueba otro clip.`)
                          return
                        }
                        setRefText(stt.text.trim())
                      } catch (e) {
                        setError(
                          e.message ||
                            'No se pudo transcribir. Arranca Whisper en el puerto 3031.',
                        )
                      }
                    }}
                  >
                    Rellenar texto con lo que se oye (Whisper)
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="ttsText">Texto a generar con esta voz</label>
                <textarea
                  id="ttsText"
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  placeholder="Opcional: texto de prueba (lo que debe DECIR, no cantar)..."
                />
              </div>

              <div className="form-actions">
                <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>
                  Volver
                </button>
                <button
                  className="btn btn-primary btn-lg"
                  type="button"
                  disabled={loading}
                  onClick={saveVoiceAndGenerate}
                >
                  {loading ? 'Guardando...' : 'Guardar voz'}
                </button>
                {loading && (
                  <button className="btn btn-ghost" type="button" onClick={cancelGenerate}>
                    Cancelar
                  </button>
                )}
                <button className="btn btn-ghost" type="button" onClick={onGoTts}>
                  Ir a Texto a voz
                </button>
              </div>

              {savedOk && !loading && (
                <p className="hint ok">
                  Voz guardada. En Texto a voz puedes seleccionarla en el menú de voces.
                </p>
              )}

              {(loading || progress) && (
                <ProgressPanel
                  percent={progress?.percent ?? 0}
                  label={progress?.label || statusMsg || 'Generando...'}
                  elapsedSec={progress?.elapsedSec ?? 0}
                  etaSec={progress?.etaSec}
                  done={!loading && progress?.percent >= 100}
                />
              )}

              {audioUrl && (
                <div className="audio-result">
                  <h3>Audio generado</h3>
                  <audio controls src={audioUrl} />
                  <AudioDownload
                    audioUrl={audioUrl}
                    basename={voiceName.trim() || 'voxara'}
                  />
                </div>
              )}
            </div>
          )}

          {error && <div className="error-box">{error}</div>}
        </section>
      </div>
    </>
  )
}

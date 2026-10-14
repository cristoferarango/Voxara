import { useCallback, useRef, useState } from 'react'
import { IconMoon, IconStt, IconUpload } from '../icons'
import { transcribeAudio, getAudioDuration } from '../api'
import ProgressPanel from './ProgressPanel'

const MAX_MB = 40
const ACCEPT = 'audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/webm,audio/ogg,.mp3,.wav,.m4a,.webm,.ogg'

function formatSec(s) {
  if (!Number.isFinite(s) || s <= 0) return '0s'
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export default function SpeechToText() {
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const [file, setFile] = useState(null)
  const [duration, setDuration] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  const applyFile = useCallback(async (f) => {
    setError('')
    setText('')
    if (!f) return
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera ${MAX_MB} MB`)
      return
    }
    try {
      const d = await getAudioDuration(f)
      setFile(f)
      setDuration(d)
    } catch (e) {
      setError(e.message || 'No se pudo leer el audio')
    }
  }, [])

  const transcribe = async () => {
    if (!file) {
      setError('Sube un audio primero')
      return
    }
    setError('')
    setCopied(false)
    setLoading(true)
    setProgress({ percent: 4, label: 'Preparando audio...', elapsedSec: 0, etaSec: 20 })
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const result = await transcribeAudio({
        file,
        language: 'es',
        durationSec: duration,
        signal: ac.signal,
        onProgress: setProgress,
      })
      setText(result.text || '')
      if (!result.text) setError('No se detectó habla en el audio.')
    } catch (e) {
      if (ac.signal.aborted) {
        setError('Transcripción cancelada.')
        setProgress(null)
      } else {
        setError(
          e.message ||
            'No se pudo transcribir. Arranca el servidor Whisper (puerto 3031).',
        )
      }
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
  }

  const copy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <>
      <header className="topbar">
        <h1>Audio a texto</h1>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Tema oscuro" aria-label="Tema">
            <IconMoon />
          </button>
        </div>
      </header>

      <div className="content tts-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-kicker">
              <IconStt />
              Transcribir
            </h2>
            <p className="panel-sub">
              S2 Pro no hace esto: aquí se usa Whisper local (español). Sube un WAV/MP3.
            </p>
          </div>

          <div
            className={`upload-zone ${dragOver ? 'dragover' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) applyFile(f)
            }}
          >
            <h3 className="upload-title">Arrastra el audio o cárgalo</h3>
            <p className="upload-desc">MP3, WAV, M4A, WEBM — máximo {MAX_MB} MB.</p>
            <div className="upload-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => inputRef.current?.click()}
              >
                <IconUpload />
                Cargar audio
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

          {file && (
            <div className="file-chip">
              <span>{file.name}</span>
              <span style={{ color: 'var(--text-dim, var(--muted))' }}>{formatSec(duration)}</span>
              <button
                type="button"
                onClick={() => {
                  setFile(null)
                  setDuration(0)
                  setText('')
                }}
                title="Quitar"
              >
                ✕
              </button>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 18 }}>
            <button
              className="btn btn-primary btn-lg"
              type="button"
              disabled={loading || !file}
              onClick={transcribe}
            >
              {loading ? 'Transcribiendo...' : 'Transcribir a texto'}
            </button>
            {loading && (
              <button className="btn btn-ghost" type="button" onClick={cancel}>
                Cancelar
              </button>
            )}
          </div>

          {(loading || progress) && (
            <ProgressPanel
              percent={progress?.percent ?? 0}
              label={progress?.label || 'Transcribiendo...'}
              elapsedSec={progress?.elapsedSec ?? 0}
              etaSec={progress?.etaSec}
              done={!loading && progress?.percent >= 100}
            />
          )}

          {error && <div className="error-box">{error}</div>}

          {text && (
            <div className="form-card" style={{ marginTop: 18 }}>
              <div className="field">
                <label htmlFor="sttOut">Texto</label>
                <textarea id="sttOut" value={text} onChange={(e) => setText(e.target.value)} />
              </div>
              <div className="form-actions">
                <button className="btn btn-ghost" type="button" onClick={copy}>
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

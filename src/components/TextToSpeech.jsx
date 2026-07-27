import { useState } from 'react'
import { IconMoon, IconWave } from '../icons'
import { generateTTS } from '../api'

export default function TextToSpeech({ voice, onGoClone }) {
  const [text, setText] = useState(
    'Bienvenido a FishVoice. Esta voz se genera localmente en tu GPU.',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState(null)

  const generate = async () => {
    setError('')
    setAudioUrl(null)
    if (!text.trim()) {
      setError('Escribe un texto para generar')
      return
    }
    setLoading(true)
    try {
      const url = await generateTTS({
        text: text.trim(),
        referenceFile: voice?.file || null,
        referenceText: voice?.refText || '',
      })
      setAudioUrl(url)
    } catch (e) {
      setError(e.message || 'Error al generar. ¿Está corriendo la API en el puerto 8080?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>Texto a voz</h1>
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
              <IconWave />
              Generar audio
            </h2>
            <p className="panel-sub">
              Usa tu voz clonada o la voz por defecto del modelo S1-mini.
            </p>
          </div>

          {voice?.file ? (
            <div className="voice-badge">
              Voz activa: <strong>{voice.name}</strong>
            </div>
          ) : (
            <div className="voice-badge empty">
              Sin voz clonada — se usará la voz por defecto.{' '}
              <button
                type="button"
                onClick={onGoClone}
                style={{ color: '#fde68a', textDecoration: 'underline', marginLeft: 4 }}
              >
                Crear voz
              </button>
            </div>
          )}

          <div className="form-card">
            <div className="field">
              <label htmlFor="tts">Texto</label>
              <textarea
                id="tts"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe lo que quieres escuchar..."
              />
            </div>

            <div className="form-actions">
              <button
                className="btn btn-primary btn-lg"
                type="button"
                disabled={loading}
                onClick={generate}
              >
                {loading ? 'Generando...' : 'Generar'}
              </button>
            </div>

            {loading && (
              <div className="loading-row">
                <div className="spinner" />
                Generando... espera unos segundos
              </div>
            )}

            {error && <div className="error-box">{error}</div>}

            {audioUrl && (
              <div className="audio-result">
                <h3>Resultado</h3>
                <audio controls src={audioUrl} autoPlay />
                <div className="form-actions" style={{ marginTop: 12 }}>
                  <a className="btn btn-ghost" href={audioUrl} download="fishvoice.wav">
                    Descargar WAV
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

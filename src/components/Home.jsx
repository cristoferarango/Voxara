import { IconMoon } from '../icons'

export default function Home({ onNavigate, apiStatus }) {
  return (
    <>
      <header className="topbar">
        <h1>Inicio</h1>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Tema oscuro" aria-label="Tema">
            <IconMoon />
          </button>
        </div>
      </header>

      <div className="content tts-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-kicker">FishVoice local</h2>
            <p className="panel-sub">
              Clona voces y genera TTS en tu PC con Fish Speech (S1-mini) + RTX.
            </p>
          </div>

          <div className="form-card">
            <p style={{ marginTop: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              1. Arranca la API en FishVoice: <code>start_fishvoice_api.bat</code>
              <br />
              2. En esta carpeta: <code>npm run dev</code>
              <br />
              3. Abre <strong>Clonación de voz</strong>, sube 10–30s de audio y genera.
            </p>

            <div className="status-pill" style={{ marginBottom: 18, display: 'inline-flex' }}>
              <span
                className={`status-dot ${apiStatus === 'ok' ? 'ok' : apiStatus === 'err' ? 'err' : ''}`}
              />
              {apiStatus === 'ok' && 'API lista en http://127.0.0.1:8080'}
              {apiStatus === 'err' && 'API no detectada'}
              {apiStatus === 'checking' && 'Comprobando...'}
            </div>

            <div className="form-actions">
              <button className="btn btn-primary btn-lg" type="button" onClick={() => onNavigate('clone')}>
                Construir una nueva voz
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => onNavigate('tts')}>
                Texto a voz
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

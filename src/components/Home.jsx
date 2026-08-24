import { IconMoon } from '../icons'
import { getApiBase } from '../api'

export default function Home({ onNavigate, apiStatus }) {
  return (
    <>
      <header className="topbar">
        <h1>Inicio</h1>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Tema" aria-label="Tema">
            <IconMoon />
          </button>
        </div>
      </header>

      <div className="content tts-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-kicker">FishVoice local</h2>
            <p className="panel-sub">
              Esta UI habla con S2 Pro Q6_K (s2.cpp) a través de {getApiBase()}
            </p>
          </div>

          <div className="form-card">
            <p style={{ marginTop: 0, color: 'var(--muted)', lineHeight: 1.65 }}>
              1. El motor <strong>s2.cpp</strong> debe estar en el puerto 3030
              <br />
              2. Aquí: <code>npm run dev</code>
              <br />
              3. Usa <strong>Clonación de voz</strong> o <strong>Texto a voz</strong>
            </p>

            <div className="status-pill" style={{ marginBottom: 18, display: 'inline-flex' }}>
              <div className="status-row">
                <span
                  className={`status-dot ${apiStatus === 'ok' ? 'ok' : apiStatus === 'err' ? 'err' : ''}`}
                />
                {apiStatus === 'ok' && `Conectado a ${getApiBase()}`}
                {apiStatus === 'err' && 'API offline — arranca el contenedor s2.cpp'}
                {apiStatus === 'checking' && 'Comprobando...'}
              </div>
            </div>

            <div className="form-actions">
              <button
                className="btn btn-primary btn-lg"
                type="button"
                onClick={() => onNavigate('clone')}
              >
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

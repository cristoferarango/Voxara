import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Home from './components/Home'
import VoiceClone from './components/VoiceClone'
import TextToSpeech from './components/TextToSpeech'
import SimplePage from './components/SimplePage'
import { checkHealth } from './api'

export default function App() {
  const [page, setPage] = useState('clone')
  const [voice, setVoice] = useState(null)
  const [apiStatus, setApiStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false
    const ping = async () => {
      try {
        await checkHealth()
        if (!cancelled) setApiStatus('ok')
      } catch {
        if (!cancelled) setApiStatus('err')
      }
    }
    ping()
    const id = setInterval(ping, 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const navigate = (id) => {
    if (id === 'dev') {
      setPage('dev')
      return
    }
    if (id === 'history') {
      setPage('history')
      return
    }
    setPage(id)
  }

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={navigate} apiStatus={apiStatus} />
      <main className="main">
        {page === 'home' && (
          <Home onNavigate={navigate} apiStatus={apiStatus} />
        )}
        {page === 'clone' && (
          <VoiceClone
            voice={voice}
            setVoice={setVoice}
            onGoTts={() => setPage('tts')}
          />
        )}
        {page === 'tts' && (
          <TextToSpeech voice={voice} onGoClone={() => setPage('clone')} />
        )}
        {page === 'history' && (
          <SimplePage title="Historia de la generación">
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Los audios generados se pueden descargar desde cada pantalla.
              El historial persistente se puede añadir más adelante.
            </p>
          </SimplePage>
        )}
        {page === 'dev' && (
          <SimplePage title="Desarrolladores">
            <p style={{ marginTop: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              API local: <code>http://127.0.0.1:8080</code>
              <br />
              Health: <code>GET /v1/health</code>
              <br />
              TTS: <code>POST /v1/tts</code>
              <br />
              OpenAPI: <code>/openapi.json</code>
            </p>
            <pre
              style={{
                background: 'var(--bg-soft)',
                padding: 14,
                borderRadius: 10,
                overflow: 'auto',
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >{`curl -X POST http://127.0.0.1:8080/v1/tts \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hola mundo","format":"wav"}' \\
  --output out.wav`}</pre>
          </SimplePage>
        )}
      </main>
    </div>
  )
}

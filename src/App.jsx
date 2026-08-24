import { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import Home from './components/Home'
import VoiceClone from './components/VoiceClone'
import TextToSpeech from './components/TextToSpeech'
import SpeechToText from './components/SpeechToText'
import SimplePage from './components/SimplePage'
import { checkHealth } from './api'
import {
  deleteVoice,
  getStoredActiveVoiceId,
  listVoices,
  saveVoice,
  setStoredActiveVoiceId,
} from './voicesStore'

export default function App() {
  const [page, setPage] = useState('clone')
  const [voices, setVoices] = useState([])
  const [activeVoiceId, setActiveVoiceId] = useState(getStoredActiveVoiceId)
  const [apiStatus, setApiStatus] = useState('checking')
  const failCount = useRef(0)
  const busyRef = useRef(false)

  const refreshVoices = useCallback(async () => {
    const rows = await listVoices()
    setVoices(rows)
    return rows
  }, [])

  useEffect(() => {
    refreshVoices().catch(() => {})
  }, [refreshVoices])

  const selectVoice = useCallback((id) => {
    setActiveVoiceId(id)
    setStoredActiveVoiceId(id)
  }, [])

  const persistVoice = useCallback(
    async ({ name, refText, duration, file }) => {
      const saved = await saveVoice({ name, refText, duration, file })
      await refreshVoices()
      selectVoice(saved.id)
      return saved
    },
    [refreshVoices, selectVoice],
  )

  const removeVoice = useCallback(
    async (id) => {
      await deleteVoice(id)
      const rows = await refreshVoices()
      if (activeVoiceId === id) {
        const next = rows[0]?.id || ''
        selectVoice(next)
      }
    },
    [activeVoiceId, refreshVoices, selectVoice],
  )

  const setBusy = useCallback((busy) => {
    busyRef.current = busy
    if (busy) setApiStatus('busy')
    else setApiStatus('ok')
  }, [])

  useEffect(() => {
    let cancelled = false

    const ping = async () => {
      if (busyRef.current) return
      try {
        await checkHealth()
        if (cancelled) return
        failCount.current = 0
        setApiStatus((s) => (s === 'busy' ? s : 'ok'))
      } catch {
        if (cancelled) return
        failCount.current += 1
        if (failCount.current >= 2) setApiStatus('err')
      }
    }

    ping()
    const id = setInterval(ping, 8000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const navigate = (id) => setPage(id)

  const activeVoice = voices.find((v) => v.id === activeVoiceId) || voices[0] || null

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={navigate} apiStatus={apiStatus} />
      <main className="main">
        {page === 'home' && <Home onNavigate={navigate} apiStatus={apiStatus} />}
        {page === 'clone' && (
          <VoiceClone
            existingNames={voices.map((v) => v.name)}
            onPersistVoice={persistVoice}
            onGoTts={() => setPage('tts')}
            onBusy={setBusy}
          />
        )}
        {page === 'tts' && (
          <TextToSpeech
            voices={voices}
            activeVoice={activeVoice}
            activeVoiceId={activeVoice?.id || ''}
            onSelectVoice={selectVoice}
            onDeleteVoice={removeVoice}
            onGoClone={() => setPage('clone')}
            onBusy={setBusy}
          />
        )}
        {page === 'stt' && <SpeechToText />}
        {page === 'history' && (
          <SimplePage title="Historia de la generación">
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Los audios generados se pueden descargar desde cada pantalla.
            </p>
          </SimplePage>
        )}
        {page === 'dev' && (
          <SimplePage title="Desarrolladores">
            <p style={{ marginTop: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
              Motor: <code>s2.cpp</code> S2 Pro Q6_K
              <br />
              API: <code>http://127.0.0.1:3030</code>
              <br />
              TTS: <code>POST /generate</code>
            </p>
          </SimplePage>
        )}
      </main>
    </div>
  )
}

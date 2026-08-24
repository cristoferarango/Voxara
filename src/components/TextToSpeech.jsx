import { useEffect, useMemo, useRef, useState } from 'react'
import { IconWave } from '../icons'
import { generateTTS, cancelS2Job, checkHealth, audioFileToWav } from '../api'
import { normalizeVoiceName, voiceToFile } from '../voicesStore'
import ProgressPanel from './ProgressPanel'
import VoicePreview from './VoicePreview'
import GenerationPlayer from './GenerationPlayer'
import { DEFAULT_LANG_ID, Flag, S2_LANGUAGES } from '../s2Languages.jsx'

const AVATAR_COLORS = ['#3d8bfd', '#2fbf71', '#d4a017', '#e25555', '#9b7dff', '#2ec4b6', '#f4a261']
const DEFAULT_STABILITY = 70
const DEFAULT_FORMAT = 'wav'
const DEFAULT_TEXT =
  'Bienvenidos a Corporación Arango, una empresa líder en el sector tecnológico.'

function avatarColor(name) {
  const s = name || ''
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

function initials(name) {
  const parts = (name || 'V').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'S2'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function formatSec(s) {
  if (!Number.isFinite(s) || s <= 0) return ''
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

function tempFromStability(stability) {
  return Math.max(0.58, Math.min(0.8, 0.8 - (Number(stability) / 100) * 0.22))
}

export default function TextToSpeech({
  voices = [],
  activeVoice,
  activeVoiceId,
  onSelectVoice,
  onDeleteVoice,
  onGoClone,
  onBusy,
}) {
  const [text, setText] = useState(DEFAULT_TEXT)
  const [query, setQuery] = useState('')
  const [railTab, setRailTab] = useState('settings')
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [langId, setLangId] = useState(DEFAULT_LANG_ID)
  const [stability, setStability] = useState(DEFAULT_STABILITY)
  const [outFormat, setOutFormat] = useState(DEFAULT_FORMAT)
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [samples, setSamples] = useState([])
  const [picked, setPicked] = useState(0)
  const [history, setHistory] = useState([])
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteTyped, setDeleteTyped] = useState('')
  const abortRef = useRef(null)
  const cancelledRef = useRef(false)
  const samplesRef = useRef([])
  const voiceBoxRef = useRef(null)
  const langBoxRef = useRef(null)

  const voiceLabel = activeVoice ? activeVoice.name : 'S2 Pro · voz del motor'
  const voiceSub = activeVoice ? 'Clonada' : 'Sin clon'
  const lang = S2_LANGUAGES.find((l) => l.id === langId) || S2_LANGUAGES[0]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return voices
    return voices.filter((v) => (v.name || '').toLowerCase().includes(q))
  }, [voices, query])

  useEffect(() => {
    return () => {
      samplesRef.current.forEach((s) => URL.revokeObjectURL(s.url))
    }
  }, [])

  useEffect(() => {
    const onDoc = (e) => {
      if (!voiceBoxRef.current?.contains(e.target)) setVoiceOpen(false)
      if (!langBoxRef.current?.contains(e.target)) setLangOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const replaceSamples = (next) => {
    samplesRef.current.forEach((s) => URL.revokeObjectURL(s.url))
    samplesRef.current = next
    setSamples(next)
  }

  const resetSettings = () => {
    setStability(DEFAULT_STABILITY)
    setLangId(DEFAULT_LANG_ID)
    setOutFormat(DEFAULT_FORMAT)
  }

  const generate = async () => {
    setError('')
    setStatusMsg('')
    setProgress({ percent: 1, label: 'Preparando 2 muestras...', elapsedSec: 0, etaSec: 50 })
    if (!text.trim()) {
      setError('Escribe un texto para generar')
      setProgress(null)
      return
    }
    replaceSamples([])
    setPicked(0)
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    cancelledRef.current = false
    setLoading(true)
    onBusy?.(true)
    const temperature = tempFromStability(stability)
    const topP = 0.88
    const collected = []
    const refText = (activeVoice?.refText || '').trim()

    try {
      let refBytes = null
      let refName = 'reference.wav'
      if (activeVoice?.blob) {
        const prepared = await audioFileToWav(voiceToFile(activeVoice))
        refBytes = await prepared.arrayBuffer()
        refName = prepared.name || refName
      }
      const makeRefFile = () =>
        refBytes ? new File([refBytes.slice(0)], refName, { type: 'audio/wav' }) : null

      for (let i = 0; i < 2; i++) {
        if (cancelledRef.current || ac.signal.aborted) return
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 800))
          try {
            await checkHealth()
          } catch {
            /* el POST igual reintenta si hace falta */
          }
        }
        const url = await generateTTS({
          text: text.trim(),
          referenceFile: makeRefFile(),
          referenceText: refText,
          temperature,
          topP,
          signal: ac.signal,
          onStatus: setStatusMsg,
          onProgress: (p) => {
            if (cancelledRef.current) return
            setProgress({
              ...p,
              percent: Math.round(i * 50 + (p.percent || 0) * 0.5),
              label: `Muestra ${i + 1} de 2 — ${p.label || 'Generando...'}`,
            })
          },
        })
        if (cancelledRef.current || ac.signal.aborted) return
        collected.push({ url, n: i + 1 })
        samplesRef.current = collected
        setSamples([...collected])
        if (i === 0) setPicked(0)
      }
      setStatusMsg('Dos muestras listas — elige la que más te guste')
      setProgress({ percent: 100, label: '2 muestras generadas', elapsedSec: 0, etaSec: 0 })
      setHistory((prev) =>
        [
          {
            id: crypto.randomUUID(),
            text: text.trim(),
            voice: voiceLabel,
            at: Date.now(),
          },
          ...prev,
        ].slice(0, 20),
      )
    } catch (e) {
      if (cancelledRef.current) return
      setError(e.message || 'Error al generar. ¿Está s2.cpp en el puerto 3030?')
      setStatusMsg('')
      if (!collected.length) setProgress(null)
    } finally {
      abortRef.current = null
      if (!cancelledRef.current) {
        setLoading(false)
        onBusy?.(false)
      }
    }
  }

  const cancelGenerate = async () => {
    cancelledRef.current = true
    abortRef.current?.abort()
    setProgress({
      percent: 8,
      label: 'Cancelando y liberando el motor...',
      elapsedSec: 0,
      etaSec: 12,
    })
    await cancelS2Job()
    setLoading(false)
    onBusy?.(false)
    setProgress(null)
    setError('Generación cancelada. El motor ya está libre.')
  }

  const nameMatchesDelete =
    pendingDelete &&
    normalizeVoiceName(deleteTyped).toLowerCase() ===
      normalizeVoiceName(pendingDelete.name).toLowerCase()

  const confirmDeleteVoice = async () => {
    if (!pendingDelete || !nameMatchesDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    setDeleteTyped('')
    setVoiceOpen(false)
    await onDeleteVoice?.(id)
  }

  return (
    <>
      <header className="topbar">
        <h1>Texto a voz</h1>
      </header>

      <div className="studio">
        <section className="studio-stage">
          <div className="speaker-row">
            <button
              type="button"
              className="speaker-pill"
              onClick={() => {
                setRailTab('settings')
                setVoiceOpen(true)
              }}
            >
              <span
                className={`voice-avatar ${activeVoice ? '' : 'default'}`}
                style={activeVoice ? { background: avatarColor(activeVoice.name) } : undefined}
              >
                {initials(activeVoice?.name)}
              </span>
              <span className="speaker-pill-text">
                <strong>{voiceLabel}</strong>
                <em>{voiceSub}</em>
              </span>
            </button>
            <VoicePreview voice={activeVoice} label={voiceLabel} />
          </div>

          <textarea
            id="tts"
            className="studio-script"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe el guion..."
          />

          <button className="add-speaker" type="button" onClick={onGoClone}>
            + Clonar otra voz
          </button>

          {loading && progress && (
            <ProgressPanel
              percent={progress?.percent ?? 0}
              label={progress?.label || statusMsg || 'Generando...'}
              elapsedSec={progress?.elapsedSec ?? 0}
              etaSec={progress?.etaSec}
              done={false}
            />
          )}

          {error && <div className="error-box">{error}</div>}

          {samples.length > 0 && (
            <div className="gen-list">
              {samples.map((s, i) => (
                <GenerationPlayer
                  key={s.url}
                  n={s.n}
                  url={s.url}
                  basename={`voxara-generacion-${s.n}`}
                  preferred={outFormat}
                  autoPlay={i === 0 && samples.length === 1}
                  selected={picked === i}
                  onSelect={() => setPicked(i)}
                />
              ))}
              {loading && samples.length === 1 && (
                <GenerationPlayer n={2} pending selected={false} />
              )}
            </div>
          )}

          <div className="studio-footer">
            <button
              className="btn btn-primary btn-lg"
              type="button"
              disabled={loading}
              onClick={generate}
            >
              {loading ? 'Generando 2 muestras...' : 'Generar 2 muestras'}
            </button>
            {loading && (
              <button className="btn btn-ghost" type="button" onClick={cancelGenerate}>
                Cancelar
              </button>
            )}
          </div>
        </section>

        <aside className="studio-rail" aria-label="Ajustes">
          <div className="studio-tabs">
            <button
              type="button"
              className={railTab === 'settings' ? 'active' : ''}
              onClick={() => setRailTab('settings')}
            >
              Ajustes
            </button>
            <button
              type="button"
              className={railTab === 'history' ? 'active' : ''}
              onClick={() => setRailTab('history')}
            >
              Historial
            </button>
          </div>

          {railTab === 'settings' && (
            <div className="studio-settings">
              <div className="set-field" ref={voiceBoxRef}>
                <label>Voz</label>
                <button
                  type="button"
                  className="set-select"
                  disabled={loading}
                  onClick={() => setVoiceOpen((o) => !o)}
                >
                  <span
                    className={`voice-avatar sm ${activeVoice ? '' : 'default'}`}
                    style={activeVoice ? { background: avatarColor(activeVoice.name) } : undefined}
                  >
                    {initials(activeVoice?.name)}
                  </span>
                  <span className="set-select-text">
                    <strong>{voiceLabel}</strong>
                    <em>{voiceSub}</em>
                  </span>
                  <span className="set-chevron">›</span>
                </button>
                {voiceOpen && (
                  <div className="voice-pop">
                    <input
                      className="voice-search"
                      type="search"
                      placeholder="Buscar voz..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className={`voice-pop-item ${!activeVoiceId ? 'on' : ''}`}
                      onClick={() => {
                        onSelectVoice?.('')
                        setVoiceOpen(false)
                      }}
                    >
                      <span className="voice-avatar sm default">S2</span>
                      S2 Pro · motor
                    </button>
                    {filtered.map((v) => (
                      <div key={v.id} className="voice-pop-row">
                        <button
                          type="button"
                          className={`voice-pop-item ${v.id === activeVoiceId ? 'on' : ''}`}
                          onClick={() => {
                            onSelectVoice?.(v.id)
                            setVoiceOpen(false)
                          }}
                        >
                          <span className="voice-avatar sm" style={{ background: avatarColor(v.name) }}>
                            {initials(v.name)}
                          </span>
                          <span>
                            {v.name}
                            {formatSec(v.duration) ? ` · ${formatSec(v.duration)}` : ''}
                          </span>
                        </button>
                        <VoicePreview voice={v} />
                        <button
                          type="button"
                          className="voice-del"
                          aria-label={`Borrar ${v.name}`}
                          disabled={loading}
                          onClick={(e) => {
                            e.stopPropagation()
                            setPendingDelete(v)
                            setDeleteTyped('')
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {voices.length === 0 && (
                      <p className="voice-empty">Aún no hay voces clonadas.</p>
                    )}
                    <button className="btn btn-ghost voice-new" type="button" onClick={onGoClone}>
                      + Nueva voz
                    </button>
                  </div>
                )}
              </div>

              <div className="set-field">
                <div className="set-label-row">
                  <label>Modelo</label>
                </div>
                <div className="set-select static">
                  <IconWave />
                  <span className="set-select-text">
                    <strong>S2 Pro Q6_K</strong>
                    <em>Local · GPU</em>
                  </span>
                </div>
              </div>

              <div className="set-field">
                <div className="set-label-row">
                  <label htmlFor="temp-range">Temperatura</label>
                  <span className="set-value">{tempFromStability(stability).toFixed(2)}</span>
                </div>
                <input
                  id="temp-range"
                  className="set-range"
                  type="range"
                  min="0"
                  max="100"
                  value={stability}
                  disabled={loading}
                  onChange={(e) => setStability(Number(e.target.value))}
                />
                <div className="set-range-labels">
                  <span>Creativo (0.80)</span>
                  <span>Estable (0.58)</span>
                </div>
              </div>

              <div className="set-field" ref={langBoxRef}>
                <label>Idioma del texto</label>
                <button
                  type="button"
                  className="set-select"
                  disabled={loading}
                  onClick={() => setLangOpen((o) => !o)}
                >
                  <Flag country={lang.country} name={lang.name} />
                  <span className="set-select-text">
                    <strong>{lang.name}</strong>
                    <em>S2 Pro · detección automática</em>
                  </span>
                  <span className="set-chevron">›</span>
                </button>
                {langOpen && (
                  <div className="voice-pop lang-pop">
                    {S2_LANGUAGES.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`voice-pop-item ${l.id === lang.id ? 'on' : ''}`}
                        onClick={() => {
                          setLangId(l.id)
                          setLangOpen(false)
                        }}
                      >
                        <Flag country={l.country} name={l.name} />
                        <span>{l.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="set-field">
                <label htmlFor="out-fmt">Descarga</label>
                <select
                  id="out-fmt"
                  className="set-native"
                  value={outFormat}
                  onChange={(e) => setOutFormat(e.target.value)}
                >
                  <option value="wav">WAV 44.1 kHz PCM (salida del motor)</option>
                  <option value="mp3">MP3 192 kbps (convertido aquí)</option>
                </select>
              </div>

              <button className="reset-link" type="button" onClick={resetSettings}>
                Restablecer valores
              </button>
            </div>
          )}

          {railTab === 'history' && (
            <div className="studio-history">
              {history.length === 0 ? (
                <p className="voice-empty">Aún no hay generaciones en esta sesión.</p>
              ) : (
                history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="hist-item"
                    onClick={() => setText(h.text)}
                  >
                    <strong>{h.voice}</strong>
                    <span>{h.text}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </aside>
      </div>

      {pendingDelete && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setPendingDelete(null)
            setDeleteTyped('')
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-voice-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="del-voice-title">Eliminar voz clonada</h2>
            <p>
              Esto no se puede deshacer. Escribe el nombre exacto{' '}
              <strong>{pendingDelete.name}</strong> para confirmar.
            </p>
            <label className="field" htmlFor="del-voice-name">
              Nombre de la voz
            </label>
            <input
              id="del-voice-name"
              autoFocus
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              placeholder={pendingDelete.name}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setPendingDelete(null)
                  setDeleteTyped('')
                }
                if (e.key === 'Enter' && nameMatchesDelete) confirmDeleteVoice()
              }}
            />
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setPendingDelete(null)
                  setDeleteTyped('')
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={!nameMatchesDelete}
                onClick={confirmDeleteVoice}
              >
                Eliminar para siempre
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

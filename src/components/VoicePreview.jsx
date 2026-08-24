import { useEffect, useRef, useState } from 'react'

const PREVIEW_SEC = 6
let activeStop = null

function stopActive() {
  activeStop?.()
  activeStop = null
}

export default function VoicePreview({ voice, label }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  const urlRef = useRef('')

  const stop = () => {
    const a = audioRef.current
    if (a) {
      a.pause()
      a.src = ''
    }
    audioRef.current = null
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = ''
    }
    if (activeStop === stop) activeStop = null
    setPlaying(false)
  }

  useEffect(() => () => stop(), [voice?.id])

  if (!voice?.blob) return null

  const toggle = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (playing) {
      stop()
      return
    }
    stopActive()
    const url = URL.createObjectURL(voice.blob)
    urlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    const onDone = () => stop()
    audio.addEventListener('ended', onDone)
    audio.addEventListener('timeupdate', () => {
      if (audio.currentTime >= PREVIEW_SEC) stop()
    })
    audio.addEventListener('error', onDone)
    activeStop = stop
    setPlaying(true)
    audio.play().catch(onDone)
  }

  return (
    <button
      type="button"
      className={`voice-play ${playing ? 'on' : ''}`}
      aria-label={playing ? `Detener muestra de ${label || voice.name}` : `Oír muestra de ${label || voice.name}`}
      title={playing ? 'Detener' : 'Oír muestra (6 s)'}
      onClick={toggle}
    >
      {playing ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="5" height="12" rx="1" />
          <rect x="13" y="6" width="5" height="12" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5L8 5.5Z" />
        </svg>
      )}
    </button>
  )
}

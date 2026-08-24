import { useEffect, useRef, useState } from 'react'
import { downloadGeneratedAudio } from '../wavToMp3'

const BARS = 96

async function peaksFromUrl(url) {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  try {
    const decoded = await ctx.decodeAudioData(buf.slice(0))
    const ch = decoded.getChannelData(0)
    const step = Math.max(1, Math.floor(ch.length / BARS))
    const peaks = new Array(BARS).fill(0.08)
    for (let i = 0; i < BARS; i++) {
      let m = 0
      const start = i * step
      const end = Math.min(ch.length, start + step)
      for (let j = start; j < end; j++) {
        const a = Math.abs(ch[j])
        if (a > m) m = a
      }
      peaks[i] = Math.max(0.08, Math.min(1, m * 1.6))
    }
    return { peaks, duration: decoded.duration }
  } finally {
    await ctx.close().catch(() => {})
  }
}

export default function GenerationPlayer({
  n,
  url,
  basename,
  preferred = 'wav',
  autoPlay = false,
  selected = false,
  pending = false,
  onSelect,
}) {
  const audioRef = useRef(null)
  const [peaks, setPeaks] = useState(() => Array.from({ length: BARS }, () => 0.12))
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!url) return
    let dead = false
    peaksFromUrl(url).then((p) => {
      if (!dead) setPeaks(p.peaks)
    }).catch(() => {})
    return () => {
      dead = true
    }
  }, [url])

  useEffect(() => {
    if (!url) return
    const audio = new Audio(url)
    audioRef.current = audio
    const onTime = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration)
    }
    const onEnd = () => {
      setPlaying(false)
      setProgress(1)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnd)
    if (autoPlay) {
      audio.play().then(() => setPlaying(true)).catch(() => {})
    }
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnd)
      audioRef.current = null
    }
  }, [url, autoPlay])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio || pending) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    audio.play().then(() => setPlaying(true)).catch(() => {})
  }

  const seek = (e) => {
    const audio = audioRef.current
    if (!audio?.duration || pending) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = x * audio.duration
    setProgress(x)
  }

  const download = async () => {
    if (!url || pending) return
    setBusy(true)
    try {
      await downloadGeneratedAudio(url, { format: preferred || 'wav', basename })
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    if (!url || pending) return
    const other = preferred === 'mp3' ? 'wav' : 'mp3'
    setBusy(true)
    try {
      await downloadGeneratedAudio(url, { format: other, basename })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className={`gen-player ${selected ? 'picked' : ''} ${pending ? 'pending' : ''}`}
      onClick={onSelect}
    >
      <span className="gen-label">Generación {n}</span>
      <button
        type="button"
        className={`gen-play ${playing ? 'on' : ''}`}
        disabled={pending}
        aria-label={playing ? 'Pausar' : 'Reproducir'}
        onClick={(e) => {
          e.stopPropagation()
          toggle()
        }}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <rect x="6" y="5" width="4.5" height="14" rx="1" />
            <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M8 5.2v13.6L19.2 12 8 5.2Z" />
          </svg>
        )}
      </button>

      <div
        className="gen-wave"
        role="slider"
        aria-label="Forma de onda"
        onClick={(e) => {
          e.stopPropagation()
          seek(e)
        }}
      >
        {peaks.map((h, i) => {
          const filled = i / peaks.length <= progress
          return (
            <span
              key={i}
              className={`gen-bar ${filled ? 'on' : ''}`}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          )
        })}
      </div>

      <div className="gen-actions">
        <button
          type="button"
          className="gen-icon"
          title={preferred === 'mp3' ? 'Descargar WAV' : 'Descargar MP3'}
          disabled={pending || busy}
          onClick={(e) => {
            e.stopPropagation()
            share()
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M7 12H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3" strokeLinecap="round" />
            <path d="M17 12h2a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" strokeLinecap="round" />
            <path d="M8 12h8M16 9l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="gen-icon"
          title={`Descargar ${(preferred || 'wav').toUpperCase()}`}
          disabled={pending || busy}
          onClick={(e) => {
            e.stopPropagation()
            download()
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 4v11M7 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 19h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </article>
  )
}

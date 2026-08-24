import { useState } from 'react'
import { downloadGeneratedAudio } from '../wavToMp3'

export default function AudioDownload({
  audioUrl,
  basename = 'fishvoice',
  compact = false,
  preferred = '',
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const onDownload = async (format) => {
    setError('')
    setBusy(format)
    try {
      await downloadGeneratedAudio(audioUrl, { format, basename })
    } catch (e) {
      setError(e.message || 'No se pudo descargar el audio')
    } finally {
      setBusy('')
    }
  }

  const wavPrimary = !preferred || preferred === 'wav'

  return (
    <div className={`download-bar ${compact ? 'compact' : ''}`}>
      {!compact && <span className="download-label">Descargar</span>}
      <button
        className={`btn ${wavPrimary ? 'btn-primary' : 'btn-ghost'}`}
        type="button"
        disabled={!!busy}
        onClick={() => onDownload('wav')}
      >
        {busy === 'wav' ? '…' : 'WAV'}
      </button>
      <button
        className={`btn ${wavPrimary ? 'btn-ghost' : 'btn-primary'}`}
        type="button"
        disabled={!!busy}
        onClick={() => onDownload('mp3')}
      >
        {busy === 'mp3' ? '…' : 'MP3'}
      </button>
      {error ? (
        <p className="field-hint" style={{ color: 'var(--danger)', flexBasis: '100%' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default function ProgressPanel({
  percent = 0,
  label = '',
  elapsedSec = 0,
  etaSec = null,
  done = false,
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))

  return (
    <div className={`progress-panel ${done ? 'done' : ''}`}>
      <div className="progress-top">
        <span className="progress-label">{label || (done ? 'Completado' : 'Procesando...')}</span>
        <span className="progress-pct">{pct}%</span>
      </div>

      <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="progress-meta">
        <span>Transcurrido: {formatTime(elapsedSec)}</span>
        {!done && etaSec != null && etaSec > 0 && (
          <span>Restante ≈ {formatTime(etaSec)}</span>
        )}
        {done && <span>Listo</span>}
      </div>
    </div>
  )
}

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}m ${r}s`
}

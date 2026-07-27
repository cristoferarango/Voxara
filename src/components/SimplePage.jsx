import { IconMoon } from '../icons'

export default function SimplePage({ title, children }) {
  return (
    <>
      <header className="topbar">
        <h1>{title}</h1>
        <div className="topbar-actions">
          <button className="icon-btn" type="button" title="Tema oscuro" aria-label="Tema">
            <IconMoon />
          </button>
        </div>
      </header>
      <div className="content tts-grid">
        <section className="panel">
          <div className="form-card">{children}</div>
        </section>
      </div>
    </>
  )
}

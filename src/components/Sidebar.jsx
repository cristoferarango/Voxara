import {
  IconHome,
  IconMic,
  IconWave,
  IconClone,
  IconBook,
  IconCode,
} from '../icons'

const NAV = [
  {
    label: null,
    items: [
      { id: 'home', label: 'Inicio', icon: IconHome },
      { id: 'clone', label: 'Voz personalizada', icon: IconClone },
    ],
  },
  {
    label: 'Productos',
    items: [
      { id: 'tts', label: 'Texto a voz', icon: IconWave },
      { id: 'clone', label: 'Clonación de voz', icon: IconMic },
      { id: 'history', label: 'Historia de la generación', icon: IconBook },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      { id: 'dev', label: 'Desarrolladores', icon: IconCode },
    ],
  },
]

export default function Sidebar({ page, onNavigate, apiStatus }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">F</div>
        <div className="brand-name">FishVoice</div>
      </div>

      {NAV.map((section, i) => (
        <div className="nav-section" key={i}>
          {section.label && <div className="nav-label">{section.label}</div>}
          {section.items.map((item) => {
            const Icon = item.icon
            const active = page === item.id
            return (
              <button
                key={`${section.label}-${item.id}-${item.label}`}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
                type="button"
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ))}

      <div className="sidebar-footer">
        <div className="status-pill">
          <span className={`status-dot ${apiStatus === 'ok' ? 'ok' : apiStatus === 'err' ? 'err' : ''}`} />
          {apiStatus === 'ok' && 'API local conectada'}
          {apiStatus === 'err' && 'API offline — inicia start_fishvoice_api.bat'}
          {apiStatus === 'checking' && 'Comprobando API...'}
        </div>
        <button className="plus-btn" type="button" onClick={() => onNavigate('clone')}>
          Nueva voz
        </button>
      </div>
    </aside>
  )
}

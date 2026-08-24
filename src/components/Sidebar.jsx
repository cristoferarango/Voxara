import {
  IconHome,
  IconMic,
  IconWave,
  IconClone,
  IconBook,
  IconCode,
  IconStt,
} from '../icons'
import { getApiBase } from '../api'

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
      { id: 'stt', label: 'Audio a texto', icon: IconStt },
      { id: 'clone', label: 'Clonación de voz', icon: IconMic },
      { id: 'history', label: 'Historia', icon: IconBook },
    ],
  },
  {
    label: 'Plataforma',
    items: [{ id: 'dev', label: 'Desarrolladores', icon: IconCode }],
  },
]

export default function Sidebar({ page, onNavigate, apiStatus }) {
  const apiBase = getApiBase()

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">V</div>
        <div className="brand-name">Voxara</div>
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
          <div className="status-row">
            <span
              className={`status-dot ${
                apiStatus === 'ok' || apiStatus === 'busy'
                  ? 'ok'
                  : apiStatus === 'err'
                    ? 'err'
                    : ''
              }`}
            />
            {apiStatus === 'ok' && 'S2 Pro Q6_K conectado'}
            {apiStatus === 'busy' && 'API ocupada (generando...)'}
            {apiStatus === 'err' && 'API offline — arranca el contenedor s2.cpp'}
            {apiStatus === 'checking' && 'Comprobando API...'}
          </div>
          <div className="status-url">{apiBase}</div>
        </div>
        <button className="plus-btn" type="button" onClick={() => onNavigate('clone')}>
          Nueva voz
        </button>
        <a
          className="sidebar-credit"
          href="https://corporacionarango.com"
          target="_blank"
          rel="noreferrer"
        >
          corporacionarango.com
        </a>
      </div>
    </aside>
  )
}

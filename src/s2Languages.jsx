/** Idiomas que S2 Pro sí cubre (detección automática por el texto). Banderas ISO reales. */
export const S2_LANGUAGES = [
  { id: 'es-PE', name: 'Español (Perú)', country: 'pe', tier: 2 },
  { id: 'es-MX', name: 'Español (México)', country: 'mx', tier: 2 },
  { id: 'es-CO', name: 'Español (Colombia)', country: 'co', tier: 2 },
  { id: 'es-AR', name: 'Español (Argentina)', country: 'ar', tier: 2 },
  { id: 'es-CL', name: 'Español (Chile)', country: 'cl', tier: 2 },
  { id: 'es-ES', name: 'Español (España)', country: 'es', tier: 2 },
  { id: 'en-US', name: 'Inglés (EE. UU.)', country: 'us', tier: 1 },
  { id: 'en-GB', name: 'Inglés (Reino Unido)', country: 'gb', tier: 1 },
  { id: 'zh-CN', name: 'Chino', country: 'cn', tier: 1 },
  { id: 'ja-JP', name: 'Japonés', country: 'jp', tier: 1 },
  { id: 'ko-KR', name: 'Coreano', country: 'kr', tier: 2 },
  { id: 'pt-BR', name: 'Portugués (Brasil)', country: 'br', tier: 2 },
  { id: 'pt-PT', name: 'Portugués (Portugal)', country: 'pt', tier: 2 },
  { id: 'fr-FR', name: 'Francés', country: 'fr', tier: 2 },
  { id: 'de-DE', name: 'Alemán', country: 'de', tier: 2 },
  { id: 'it-IT', name: 'Italiano', country: 'it', tier: 3 },
  { id: 'ru-RU', name: 'Ruso', country: 'ru', tier: 2 },
  { id: 'ar-SA', name: 'Árabe', country: 'sa', tier: 2 },
  { id: 'nl-NL', name: 'Neerlandés', country: 'nl', tier: 3 },
  { id: 'pl-PL', name: 'Polaco', country: 'pl', tier: 3 },
  { id: 'tr-TR', name: 'Turco', country: 'tr', tier: 3 },
  { id: 'hi-IN', name: 'Hindi', country: 'in', tier: 3 },
  { id: 'th-TH', name: 'Tailandés', country: 'th', tier: 3 },
  { id: 'vi-VN', name: 'Vietnamita', country: 'vn', tier: 3 },
  { id: 'id-ID', name: 'Indonesio', country: 'id', tier: 3 },
  { id: 'uk-UA', name: 'Ucraniano', country: 'ua', tier: 3 },
  { id: 'sv-SE', name: 'Sueco', country: 'se', tier: 3 },
]

export const DEFAULT_LANG_ID = 'es-PE'

export function Flag({ country, name }) {
  const code = String(country || '').toLowerCase()
  return (
    <img
      className="flag-img"
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      width={28}
      height={21}
      alt={name ? `Bandera de ${name}` : ''}
      title={name || code.toUpperCase()}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}

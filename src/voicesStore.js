const DB_NAME = 'fishvoice-voices'
const STORE = 'voices'
const VERSION = 1
const ACTIVE_KEY = 'fv_active_voice'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function getStoredActiveVoiceId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || ''
  } catch {
    return ''
  }
}

export function setStoredActiveVoiceId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* ignore */
  }
}

export async function listVoices() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const rows = req.result || []
      rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      resolve(rows)
    }
    req.onerror = () => reject(req.error)
  })
}

export function normalizeVoiceName(name) {
  return (name || '').trim().replace(/\s+/g, ' ')
}

export async function voiceNameTaken(name, exceptId = '') {
  const n = normalizeVoiceName(name).toLowerCase()
  if (!n) return false
  const rows = await listVoices()
  return rows.some(
    (v) => v.id !== exceptId && normalizeVoiceName(v.name).toLowerCase() === n,
  )
}

export async function saveVoice({ name, refText, duration, file }) {
  const blob = file instanceof Blob ? file : new Blob([file], { type: 'audio/wav' })
  const cleanName = normalizeVoiceName(name) || 'Mi voz'
  if (await voiceNameTaken(cleanName)) {
    throw new Error(`Ya existe una voz llamada «${cleanName}». Elige otro nombre.`)
  }
  const voice = {
    id: crypto.randomUUID(),
    name: cleanName,
    refText: (refText || '').trim(),
    duration: duration || 0,
    createdAt: Date.now(),
    blob,
  }
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).put(voice)
  })
  return voice
}

export async function deleteVoice(id) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).delete(id)
  })
}

export function voiceToFile(voice) {
  if (!voice?.blob) return null
  const safe = (voice.name || 'voz').replace(/[^\w\-]+/g, '_')
  return new File([voice.blob], `${safe}.wav`, { type: 'audio/wav' })
}

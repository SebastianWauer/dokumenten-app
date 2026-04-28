import { supabase } from './supabase'

const VORLAGEN_KEY = 'dokument_textvorlagen_v1'

function leseLocal() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(VORLAGEN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function schreibeLocal(vorlagen) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(VORLAGEN_KEY, JSON.stringify(vorlagen))
}

export async function ladeTextVorlagen() {
  const { data, error } = await supabase
    .from('textvorlagen')
    .select('id,name,einleitungstext,schlusstext,updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    return leseLocal()
  }

  const vorlagen = (data ?? []).map((eintrag) => ({
    id: String(eintrag.id),
    name: eintrag.name,
    einleitungstext: eintrag.einleitungstext || '',
    schlusstext: eintrag.schlusstext || '',
    updatedAt: eintrag.updated_at || null,
  }))
  schreibeLocal(vorlagen)
  return vorlagen
}

export async function speichereTextVorlage({ name, einleitungstext, schlusstext }) {
  const saubererName = String(name || '').trim()
  if (!saubererName) {
    throw new Error('Bitte einen Namen für die Vorlage eingeben.')
  }

  const einleitung = String(einleitungstext || '').trim()
  const schluss = String(schlusstext || '').trim()
  if (!einleitung && !schluss) {
    throw new Error('Eine Vorlage benötigt mindestens Einleitungs- oder Schlusstext.')
  }

  const payload = {
    name: saubererName,
    einleitungstext: einleitung || null,
    schlusstext: schluss || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('textvorlagen')
    .upsert([payload], { onConflict: 'name' })

  if (error) {
    const jetzt = new Date().toISOString()
    const bestehend = leseLocal()
    const ohneGleichenNamen = bestehend.filter((vorlage) => String(vorlage?.name || '').toLowerCase() !== saubererName.toLowerCase())
    const neueVorlage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: saubererName,
      einleitungstext: einleitung,
      schlusstext: schluss,
      updatedAt: jetzt,
    }
    const neu = [neueVorlage, ...ohneGleichenNamen]
    schreibeLocal(neu)
    return neu
  }

  return ladeTextVorlagen()
}

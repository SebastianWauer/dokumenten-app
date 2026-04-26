import { useEffect, useState } from 'react'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'

const initialForm = {
  name: '',
  inhaber: '',
  strasse: '',
  plz: '',
  ort: '',
  land: '',
  telefon: '',
  email: '',
  steuernummer: '',
  ustId: '',
  kleinunternehmer: false,
  iban: '',
  bic: '',
  bank: '',
  zahlungszielTage: '',
}

function getFeld(datensatz, kandidaten) {
  for (const feld of kandidaten) {
    if (datensatz[feld] !== null && datensatz[feld] !== undefined) {
      return datensatz[feld]
    }
  }
  return ''
}

function toBool(wert) {
  if (typeof wert === 'boolean') return wert
  if (typeof wert === 'number') return wert === 1
  if (typeof wert === 'string') return ['1', 'true', 'ja'].includes(wert.toLowerCase())
  return false
}

function waehleSpalte(kandidaten, bekannteSpalten) {
  if (!bekannteSpalten || bekannteSpalten.length === 0) {
    return kandidaten[0]
  }

  for (const kandidat of kandidaten) {
    if (bekannteSpalten.includes(kandidat)) {
      return kandidat
    }
  }

  return kandidaten[0]
}

function baueProfilPayload(form, bekannteSpalten) {
  return {
    [waehleSpalte(['name'], bekannteSpalten)]: form.name,
    [waehleSpalte(['inhaber'], bekannteSpalten)]: form.inhaber,
    [waehleSpalte(['strasse', 'straße'], bekannteSpalten)]: form.strasse,
    [waehleSpalte(['plz'], bekannteSpalten)]: form.plz,
    [waehleSpalte(['ort', 'stadt'], bekannteSpalten)]: form.ort,
    [waehleSpalte(['land'], bekannteSpalten)]: form.land,
    [waehleSpalte(['telefon', 'phone'], bekannteSpalten)]: form.telefon,
    [waehleSpalte(['email', 'e_mail'], bekannteSpalten)]: form.email,
    [waehleSpalte(['steuernummer'], bekannteSpalten)]: form.steuernummer,
    [waehleSpalte(['ust_id', 'ustid'], bekannteSpalten)]: form.ustId,
    [waehleSpalte(['paragraph19'], bekannteSpalten)]:
      form.kleinunternehmer,
    [waehleSpalte(['iban'], bekannteSpalten)]: form.iban,
    [waehleSpalte(['bic'], bekannteSpalten)]: form.bic,
    [waehleSpalte(['bank'], bekannteSpalten)]: form.bank,
    [waehleSpalte(['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days'], bekannteSpalten)]:
      form.zahlungszielTage === '' ? null : Number(form.zahlungszielTage),
  }
}

export default function Einstellungen() {
  const [form, setForm] = useState(initialForm)
  const [profilId, setProfilId] = useState(null)
  const [bekannteSpalten, setBekannteSpalten] = useState([])
  const [laden, setLaden] = useState(true)
  const [speichern, setSpeichern] = useState(false)
  const [fehler, setFehler] = useState('')
  const [erfolg, setErfolg] = useState('')

  async function ladeProfil() {
    setLaden(true)
    setFehler('')

    try {
      const { data, error } = await supabase.from('firmenprofile').select('*').limit(1)
      if (error) throw error

      const profil = data?.[0]
      if (!profil) {
        setProfilId(null)
        setBekannteSpalten([])
        setForm(initialForm)
        return
      }

      setProfilId(profil.id ?? null)
      setBekannteSpalten(Object.keys(profil))

      setForm({
        name: getFeld(profil, ['name']),
        inhaber: getFeld(profil, ['inhaber']),
        strasse: getFeld(profil, ['strasse', 'straße']),
        plz: getFeld(profil, ['plz']),
        ort: getFeld(profil, ['ort', 'stadt']),
        land: getFeld(profil, ['land']),
        telefon: getFeld(profil, ['telefon', 'phone']),
        email: getFeld(profil, ['email', 'e_mail']),
        steuernummer: getFeld(profil, ['steuernummer']),
        ustId: getFeld(profil, ['ust_id', 'ustid']),
        kleinunternehmer: toBool(getFeld(profil, ['paragraph19'])),
        iban: getFeld(profil, ['iban']),
        bic: getFeld(profil, ['bic']),
        bank: getFeld(profil, ['bank']),
        zahlungszielTage: String(getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']) || ''),
      })
    } catch (err) {
      setFehler(err.message || 'Firmenprofil konnte nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    ladeProfil()
  }, [])

  function updateFeld(feld, wert) {
    setForm((alt) => ({
      ...alt,
      [feld]: wert,
    }))
  }

  async function speichernHandler(e) {
    e.preventDefault()
    setSpeichern(true)
    setFehler('')
    setErfolg('')

    try {
      const payload = baueProfilPayload(form, bekannteSpalten)

      if (profilId) {
        const { error } = await supabase.from('firmenprofile').update(payload).eq('id', profilId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('firmenprofile').insert([payload]).select('id').limit(1)
        if (error) throw error

        const neuesProfil = data?.[0]
        if (neuesProfil?.id) {
          setProfilId(neuesProfil.id)
        }
      }

      setErfolg('Firmenprofil wurde gespeichert.')
      await ladeProfil()
    } catch (err) {
      setFehler(err.message || 'Speichern fehlgeschlagen.')
    } finally {
      setSpeichern(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />

      <main className="flex-1 p-8">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Einstellungen</h2>
          <p className="text-sm text-gray-500">
            Firmenprofil für Rechnungen, Angebote und Mahnungen verwalten.
          </p>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl p-6">
          {laden ? (
            <p className="text-sm text-gray-500">Firmenprofil wird geladen...</p>
          ) : (
            <form onSubmit={speichernHandler} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateFeld('name', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Sport Voice"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inhaber</label>
                  <input
                    type="text"
                    value={form.inhaber}
                    onChange={(e) => updateFeld('inhaber', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Sebastian Wauer"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
                  <input
                    type="text"
                    value={form.strasse}
                    onChange={(e) => updateFeld('strasse', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Buchenstraße 50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PLZ</label>
                  <input
                    type="text"
                    value={form.plz}
                    onChange={(e) => updateFeld('plz', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="42283"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
                  <input
                    type="text"
                    value={form.ort}
                    onChange={(e) => updateFeld('ort', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Wuppertal"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
                  <input
                    type="text"
                    value={form.land}
                    onChange={(e) => updateFeld('land', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Deutschland"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={form.telefon}
                    onChange={(e) => updateFeld('telefon', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="+49 ..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateFeld('email', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="info@sportvoice.de"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Steuernummer</label>
                  <input
                    type="text"
                    value={form.steuernummer}
                    onChange={(e) => updateFeld('steuernummer', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="123/4567/8901"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">USt-ID</label>
                  <input
                    type="text"
                    value={form.ustId}
                    onChange={(e) => updateFeld('ustId', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="DE123456789"
                  />
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg px-4 py-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.kleinunternehmer}
                    onChange={(e) => updateFeld('kleinunternehmer', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#185FA5] focus:ring-[#185FA5]"
                  />
                  <span className="text-sm text-gray-800">Kleinunternehmer nach § 19 UStG</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                  <input
                    type="text"
                    value={form.iban}
                    onChange={(e) => updateFeld('iban', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="DE..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BIC</label>
                  <input
                    type="text"
                    value={form.bic}
                    onChange={(e) => updateFeld('bic', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="XXXXDEXX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                  <input
                    type="text"
                    value={form.bank}
                    onChange={(e) => updateFeld('bank', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Bankname"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zahlungsziel in Tagen</label>
                  <input
                    type="number"
                    min="0"
                    value={form.zahlungszielTage}
                    onChange={(e) => updateFeld('zahlungszielTage', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="14"
                  />
                </div>
              </div>

              {fehler && <p className="text-sm text-red-600">{fehler}</p>}
              {erfolg && <p className="text-sm text-green-700">{erfolg}</p>}

              <div>
                <button
                  type="submit"
                  disabled={speichern}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                >
                  {speichern ? 'Wird gespeichert...' : 'Firmenprofil speichern'}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}

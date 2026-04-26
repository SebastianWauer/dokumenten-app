import { useEffect, useMemo, useState } from 'react'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'

function getFeld(kunde, kandidaten) {
  for (const feld of kandidaten) {
    if (kunde?.[feld] !== null && kunde?.[feld] !== undefined && kunde?.[feld] !== '') {
      return kunde[feld]
    }
  }
  return ''
}

const initialForm = {
  firma: '',
  ansprechpartner: '',
  strasse: '',
  plz: '',
  ort: '',
  land: 'Deutschland',
  telefon: '',
  email: '',
  ust_id: '',
  notizen: '',
}

export default function Kunden() {
  const [kunden, setKunden] = useState([])
  const [laden, setLaden] = useState(true)
  const [speichern, setSpeichern] = useState(false)
  const [loeschen, setLoeschen] = useState(false)
  const [fehler, setFehler] = useState('')
  const [formularFehler, setFormularFehler] = useState('')
  const [formularOffen, setFormularOffen] = useState(false)
  const [bearbeitenId, setBearbeitenId] = useState(null)
  const [form, setForm] = useState(initialForm)

  const normalisierteKunden = useMemo(() => {
    return kunden.map((kunde) => {
      const kundenFirma = getFeld(kunde, ['firma', 'name', 'unternehmen'])
      const kundenAnsprechpartner = getFeld(kunde, ['ansprechpartner', 'kontaktperson'])
      const kundenOrt = getFeld(kunde, ['ort', 'stadt'])
      const kundenEmail = getFeld(kunde, ['email', 'kontakt_email', 'e_mail'])

      return {
        id: kunde.id ?? `${kundenFirma}-${kundenOrt}-${kundenEmail}`,
        firma: kundenFirma,
        ansprechpartner: kundenAnsprechpartner,
        ort: kundenOrt,
        email: kundenEmail,
        raw: kunde,
      }
    })
  }, [kunden])

  async function ladeKunden() {
    setLaden(true)
    setFehler('')

    try {
      const { data, error } = await supabase.from('kunden').select('*')
      if (error) throw error
      setKunden(data ?? [])
    } catch (err) {
      setFehler(err.message || 'Kunden konnten nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    ladeKunden()
  }, [])

  function resetFormular() {
    setForm(initialForm)
    setBearbeitenId(null)
    setFormularFehler('')
  }

  function updateFeld(feld, wert) {
    setForm((alt) => ({ ...alt, [feld]: wert }))
  }

  function formularFuerNeuenKunden() {
    resetFormular()
    setFormularOffen(true)
  }

  function kundeZumBearbeiten(kunde) {
    setForm({
      firma: getFeld(kunde, ['firma', 'name', 'unternehmen']),
      ansprechpartner: getFeld(kunde, ['ansprechpartner', 'kontaktperson']),
      strasse: getFeld(kunde, ['strasse', 'straße', 'adresse']),
      plz: getFeld(kunde, ['plz']),
      ort: getFeld(kunde, ['ort', 'stadt']),
      land: getFeld(kunde, ['land']) || 'Deutschland',
      telefon: getFeld(kunde, ['telefon', 'phone']),
      email: getFeld(kunde, ['email', 'kontakt_email', 'e_mail']),
      ust_id: getFeld(kunde, ['ust_id', 'ustid']),
      notizen: getFeld(kunde, ['notizen', 'notiz']),
    })
    setBearbeitenId(kunde.id ?? null)
    setFormularFehler('')
    setFormularOffen(true)
  }

  async function kundeSpeichern(e) {
    e.preventDefault()
    setSpeichern(true)
    setFormularFehler('')

    try {
      const kundePayload = {
        firma: form.firma,
        ansprechpartner: form.ansprechpartner || null,
        strasse: form.strasse || null,
        plz: form.plz || null,
        ort: form.ort || null,
        land: form.land || 'Deutschland',
        telefon: form.telefon || null,
        email: form.email || null,
        ust_id: form.ust_id || null,
        notizen: form.notizen || null,
      }

      if (bearbeitenId) {
        const { error } = await supabase.from('kunden').update(kundePayload).eq('id', bearbeitenId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('kunden').insert([kundePayload])
        if (error) throw error
      }

      await ladeKunden()
      resetFormular()
      setFormularOffen(false)
    } catch (err) {
      setFormularFehler(err.message || 'Kunde konnte nicht gespeichert werden.')
    } finally {
      setSpeichern(false)
    }
  }

  async function kundeLoeschen() {
    if (!bearbeitenId) return

    const bestaetigt = window.confirm('Kunde wirklich löschen?')
    if (!bestaetigt) return

    setLoeschen(true)
    setFormularFehler('')

    try {
      const { error } = await supabase.from('kunden').delete().eq('id', bearbeitenId)
      if (error) throw error

      await ladeKunden()
      resetFormular()
      setFormularOffen(false)
    } catch (err) {
      setFormularFehler(err.message || 'Kunde konnte nicht gelöscht werden.')
    } finally {
      setLoeschen(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />

      <main className="flex-1 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Kunden</h2>
            <p className="text-sm text-gray-500">
              Übersicht aller Kunden für Angebote, Rechnungen und Mahnungen.
            </p>
          </div>

          <button
            type="button"
            onClick={formularFuerNeuenKunden}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] transition-colors"
          >
            Neuer Kunde
          </button>
        </div>

        {formularOffen && (
          <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {bearbeitenId ? 'Kunde bearbeiten' : 'Neuen Kunden anlegen'}
            </h3>

            <form onSubmit={kundeSpeichern} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Firma</label>
                  <input
                    type="text"
                    value={form.firma}
                    onChange={(e) => updateFeld('firma', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="z. B. Muster GmbH"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ansprechpartner</label>
                  <input
                    type="text"
                    value={form.ansprechpartner}
                    onChange={(e) => updateFeld('ansprechpartner', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="z. B. Max Mustermann"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
                  <input type="text" value={form.strasse} onChange={(e) => updateFeld('strasse', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]" placeholder="Straße und Hausnummer" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PLZ</label>
                  <input type="text" value={form.plz} onChange={(e) => updateFeld('plz', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]" placeholder="z. B. 42283" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
                  <input type="text" value={form.ort} onChange={(e) => updateFeld('ort', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]" placeholder="z. B. Wuppertal" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
                  <input type="text" value={form.land} onChange={(e) => updateFeld('land', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]" placeholder="Deutschland" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input type="text" value={form.telefon} onChange={(e) => updateFeld('telefon', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]" placeholder="+49 ..." />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                  <input type="email" value={form.email} onChange={(e) => updateFeld('email', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]" placeholder="kontakt@kunde.de" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">USt-ID</label>
                  <input type="text" value={form.ust_id} onChange={(e) => updateFeld('ust_id', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]" placeholder="DE123456789" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
                <textarea
                  value={form.notizen}
                  onChange={(e) => updateFeld('notizen', e.target.value)}
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                  placeholder="Interne Hinweise zum Kunden"
                />
              </div>

              {formularFehler && <p className="text-sm text-red-600">{formularFehler}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={speichern}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                >
                  {speichern ? 'Wird gespeichert...' : bearbeitenId ? 'Änderungen speichern' : 'Kunde speichern'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormularOffen(false)
                    resetFormular()
                  }}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Abbrechen
                </button>
                {bearbeitenId && (
                  <button
                    type="button"
                    onClick={kundeLoeschen}
                    disabled={loeschen}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors"
                  >
                    {loeschen ? 'Wird gelöscht...' : 'Löschen'}
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Firma
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Ansprechpartner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Ort
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    E-Mail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {laden && (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-sm text-gray-500">
                      Kunden werden geladen...
                    </td>
                  </tr>
                )}

                {!laden && fehler && (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-sm text-red-600">
                      {fehler}
                    </td>
                  </tr>
                )}

                {!laden && !fehler && normalisierteKunden.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-sm text-gray-500">
                      Noch keine Kunden vorhanden.
                    </td>
                  </tr>
                )}

                {!laden && !fehler && normalisierteKunden.map((kunde) => (
                  <tr
                    key={kunde.id}
                    className="hover:bg-gray-50/70 cursor-pointer"
                    onClick={() => kundeZumBearbeiten(kunde.raw)}
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">{kunde.firma || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{kunde.ansprechpartner || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{kunde.ort || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{kunde.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}

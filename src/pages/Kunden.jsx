import { useEffect, useMemo, useState } from 'react'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'

function getFeld(kunde, kandidaten) {
  for (const feld of kandidaten) {
    if (kunde[feld] !== null && kunde[feld] !== undefined && kunde[feld] !== '') {
      return kunde[feld]
    }
  }
  return ''
}

export default function Kunden() {
  const [kunden, setKunden] = useState([])
  const [laden, setLaden] = useState(true)
  const [speichern, setSpeichern] = useState(false)
  const [fehler, setFehler] = useState('')
  const [formularFehler, setFormularFehler] = useState('')
  const [formularOffen, setFormularOffen] = useState(false)

  const [name, setName] = useState('')
  const [ort, setOrt] = useState('')
  const [email, setEmail] = useState('')

  const normalisierteKunden = useMemo(() => {
    return kunden.map((kunde) => {
      const kundenName = getFeld(kunde, ['name', 'firma', 'unternehmen'])
      const kundenOrt = getFeld(kunde, ['ort', 'stadt'])
      const kundenEmail = getFeld(kunde, ['email', 'kontakt_email', 'e_mail'])

      return {
        id: kunde.id ?? `${kundenName}-${kundenOrt}-${kundenEmail}`,
        name: kundenName,
        ort: kundenOrt,
        email: kundenEmail,
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
    setName('')
    setOrt('')
    setEmail('')
    setFormularFehler('')
  }

  async function kundeAnlegen(e) {
    e.preventDefault()
    setSpeichern(true)
    setFormularFehler('')

    try {
      const neuerKunde = {
        firma: name,
        ort,
        email,
      }

      const { error } = await supabase.from('kunden').insert([neuerKunde])
      if (error) throw error

      await ladeKunden()
      resetFormular()
      setFormularOffen(false)
    } catch (err) {
      setFormularFehler(err.message || 'Kunde konnte nicht gespeichert werden.')
    } finally {
      setSpeichern(false)
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
            onClick={() => {
              setFormularOffen((wert) => !wert)
              setFormularFehler('')
            }}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] transition-colors"
          >
            Neuer Kunde
          </button>
        </div>

        {formularOffen && (
          <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Neuen Kunden anlegen</h3>

            <form onSubmit={kundeAnlegen} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="z. B. Muster GmbH"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
                  <input
                    type="text"
                    value={ort}
                    onChange={(e) => setOrt(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="z. B. Wuppertal"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="kontakt@kunde.de"
                    required
                  />
                </div>
              </div>

              {formularFehler && <p className="text-sm text-red-600">{formularFehler}</p>}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={speichern}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                >
                  {speichern ? 'Wird gespeichert...' : 'Kunde speichern'}
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
                    Name
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
                    <td colSpan={3} className="px-6 py-6 text-sm text-gray-500">
                      Kunden werden geladen...
                    </td>
                  </tr>
                )}

                {!laden && fehler && (
                  <tr>
                    <td colSpan={3} className="px-6 py-6 text-sm text-red-600">
                      {fehler}
                    </td>
                  </tr>
                )}

                {!laden && !fehler && normalisierteKunden.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-6 text-sm text-gray-500">
                      Noch keine Kunden vorhanden.
                    </td>
                  </tr>
                )}

                {!laden && !fehler && normalisierteKunden.map((kunde) => (
                  <tr key={kunde.id} className="hover:bg-gray-50/70">
                    <td className="px-6 py-4 text-sm text-gray-900">{kunde.name || '—'}</td>
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

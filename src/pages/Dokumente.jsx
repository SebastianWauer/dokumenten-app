import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'

function getFeld(datensatz, kandidaten) {
  for (const feld of kandidaten) {
    if (datensatz?.[feld] !== null && datensatz?.[feld] !== undefined && datensatz?.[feld] !== '') {
      return datensatz[feld]
    }
  }
  return ''
}

function formatiereBetrag(wert) {
  const nummer = Number(wert || 0)
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(nummer)
}

function formatiereDatum(wert) {
  if (!wert) return '—'
  const datum = new Date(wert)
  if (Number.isNaN(datum.getTime())) return wert
  return new Intl.DateTimeFormat('de-DE').format(datum)
}

export default function Dokumente() {
  const [dokumente, setDokumente] = useState([])
  const [kunden, setKunden] = useState([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState('')
  const hatGeladenRef = useRef(false)

  const kundenMap = useMemo(() => {
    const map = new Map()

    for (const kunde of kunden) {
      const id = kunde.id
      const name = getFeld(kunde, ['firma', 'name', 'unternehmen'])
      if (id !== undefined && id !== null) {
        map.set(id, name || '—')
      }
    }

    return map
  }, [kunden])

  const dokumentListe = useMemo(() => {
    return dokumente.map((dokument) => {
      const kundenId = getFeld(dokument, ['kunden_id', 'kunde_id'])
      return {
        id: dokument.id ?? `${getFeld(dokument, ['nummer'])}-${getFeld(dokument, ['datum'])}`,
        nummer: getFeld(dokument, ['nummer']),
        typ: getFeld(dokument, ['typ']),
        kunde: kundenMap.get(kundenId) || '—',
        datum: getFeld(dokument, ['datum']),
        betrag: getFeld(dokument, ['brutto', 'gesamtbetrag', 'netto']),
        status: getFeld(dokument, ['status']) || 'Entwurf',
      }
    })
  }, [dokumente, kundenMap])

  async function ladeDaten() {
    setLaden(true)
    setFehler('')

    try {
      const [{ data: dokumentData, error: dokumentError }, { data: kundenData, error: kundenError }] =
        await Promise.all([
          supabase.from('dokumente').select('*').order('datum', { ascending: false }),
          supabase.from('kunden').select('*'),
        ])

      if (dokumentError) throw dokumentError
      if (kundenError) throw kundenError

      const eindeutigeDokumente = []
      const gesehen = new Set()

      for (const dokument of dokumentData ?? []) {
        const key = String(dokument.id ?? dokument.nummer ?? `${dokument.typ}-${dokument.datum}`)
        if (gesehen.has(key)) continue
        gesehen.add(key)
        eindeutigeDokumente.push(dokument)
      }

      setDokumente(eindeutigeDokumente)
      setKunden(kundenData ?? [])
    } catch (err) {
      setFehler(err.message || 'Dokumente konnten nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    if (hatGeladenRef.current) return
    hatGeladenRef.current = true
    ladeDaten()
  }, [])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />

      <main className="flex-1 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Dokumente</h2>
            <p className="text-sm text-gray-500">
              Übersicht aller gespeicherten Dokumente.
            </p>
          </div>

          <Link
            to="/dokumente/neu"
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] transition-colors"
          >
            Neues Dokument
          </Link>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Nummer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Typ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Kunde
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Datum
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Betrag
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {laden && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-sm text-gray-500">
                      Dokumente werden geladen...
                    </td>
                  </tr>
                )}

                {!laden && fehler && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-sm text-red-600">
                      {fehler}
                    </td>
                  </tr>
                )}

                {!laden && !fehler && dokumentListe.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-sm text-gray-500">
                      Noch keine Dokumente vorhanden.
                    </td>
                  </tr>
                )}

                {!laden && !fehler && dokumentListe.map((dokument) => (
                  <tr key={dokument.id} className="hover:bg-gray-50/70">
                    <td className="px-6 py-4 text-sm text-gray-900">{dokument.nummer || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{dokument.typ || '—'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{dokument.kunde}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{formatiereDatum(dokument.datum)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatiereBetrag(dokument.betrag)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{dokument.status}</td>
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

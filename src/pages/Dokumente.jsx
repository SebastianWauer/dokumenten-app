import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { formatiereBetrag, formatiereDatum, getFeld } from '../lib/utils'

export default function Dokumente() {
  const [dokumente, setDokumente] = useState([])
  const [kunden, setKunden] = useState([])
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState('')
  const [suche, setSuche] = useState('')
  const [typFilter, setTypFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

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
        dokumentId: dokument.id ?? null,
        nummer: getFeld(dokument, ['nummer']),
        typ: getFeld(dokument, ['typ']),
        kunde: kundenMap.get(kundenId) || '—',
        datum: getFeld(dokument, ['datum']),
        betrag: getFeld(dokument, ['brutto_gesamt', 'netto_gesamt']),
        status: getFeld(dokument, ['status']) || 'Entwurf',
      }
    })
  }, [dokumente, kundenMap])

  const gefilterteDokumente = useMemo(() => {
    const suchwert = suche.trim().toLowerCase()

    return dokumentListe.filter((dokument) => {
      const passtSuche = !suchwert || [
        dokument.nummer,
        dokument.typ,
        dokument.kunde,
        dokument.status,
        formatiereDatum(dokument.datum),
      ].some((wert) => String(wert || '').toLowerCase().includes(suchwert))

      const passtTyp = !typFilter || dokument.typ === typFilter
      const passtStatus = !statusFilter || dokument.status === statusFilter

      return passtSuche && passtTyp && passtStatus
    })
  }, [dokumentListe, suche, typFilter, statusFilter])

  const typen = useMemo(() => [...new Set(dokumentListe.map((dokument) => dokument.typ).filter(Boolean))], [dokumentListe])
  const statusWerte = useMemo(() => [...new Set(dokumentListe.map((dokument) => dokument.status).filter(Boolean))], [dokumentListe])

  const ladeDaten = useCallback(async function ladeDaten() {
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
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      ladeDaten()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [ladeDaten])

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-gray-200 p-4">
            <input
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              placeholder="Suchen nach Nummer, Kunde, Status..."
            />
            <select
              value={typFilter}
              onChange={(e) => setTypFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
            >
              <option value="">Alle Typen</option>
              {typen.map((typ) => (
                <option key={typ} value={typ}>{typ}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
            >
              <option value="">Alle Status</option>
              {statusWerte.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
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

                {!laden && !fehler && gefilterteDokumente.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-sm text-gray-500">
                      Keine passenden Dokumente gefunden.
                    </td>
                  </tr>
                )}

                {!laden && !fehler && gefilterteDokumente.map((dokument) => (
                  <tr key={dokument.id} className="hover:bg-gray-50/70">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {dokument.dokumentId ? (
                        <Link to={`/dokumente/${dokument.dokumentId}`} className="text-[#185FA5] hover:underline">
                          {dokument.nummer || '—'}
                        </Link>
                      ) : (
                        dokument.nummer || '—'
                      )}
                    </td>
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

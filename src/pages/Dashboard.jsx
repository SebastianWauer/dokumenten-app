import { useCallback, useEffect, useState } from 'react'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { formatiereBetrag } from '../lib/utils'

export default function Dashboard() {
  const [kennzahlen, setKennzahlen] = useState({
    offeneRechnungen: 0,
    einnahmenMonat: 0,
    kundenGesamt: 0,
  })
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState('')
  const [anzeigename, setAnzeigename] = useState('')

  const ladeKennzahlen = useCallback(async function ladeKennzahlen() {
    setLaden(true)
    setFehler('')

    try {
      const monatsStart = new Date()
      monatsStart.setDate(1)
      monatsStart.setHours(0, 0, 0, 0)
      const monatsStartIso = monatsStart.toISOString().slice(0, 10)

      const [
        { data: dokumente, error: dokumenteError },
        { count: kundenCount, error: kundenError },
        { data: sessionData, error: sessionError },
      ] = await Promise.all([
        supabase.from('dokumente').select('typ,status,datum,brutto_gesamt'),
        supabase.from('kunden').select('id', { count: 'exact', head: true }),
        supabase.auth.getSession(),
      ])

      if (dokumenteError) throw dokumenteError
      if (kundenError) throw kundenError
      if (sessionError) throw sessionError

      const user = sessionData?.session?.user
      const name = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || ''
      setAnzeigename(name)

      const offeneRechnungen = (dokumente ?? []).filter((dokument) => {
        return dokument.typ === 'Rechnung' && !['Bezahlt', 'Storniert'].includes(dokument.status || 'Entwurf')
      }).length

      const einnahmenMonat = (dokumente ?? []).reduce((summe, dokument) => {
        if (dokument.typ !== 'Rechnung' || dokument.status !== 'Bezahlt') return summe
        if (!dokument.datum || dokument.datum < monatsStartIso) return summe
        return summe + Number(dokument.brutto_gesamt || 0)
      }, 0)

      setKennzahlen({
        offeneRechnungen,
        einnahmenMonat,
        kundenGesamt: kundenCount ?? 0,
      })
    } catch (err) {
      setFehler(err.message || 'Dashboard konnte nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      ladeKennzahlen()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [ladeKennzahlen])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />
      <main className="flex-1 p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Dashboard</h2>
        <p className="text-gray-400 text-sm mb-8">
          {anzeigename ? `Willkommen zurück, ${anzeigename}.` : 'Willkommen zurück.'}
        </p>
        {fehler && <p className="text-sm text-red-600 mb-4">{fehler}</p>}

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">Offene Rechnungen</p>
            <p className="text-2xl font-bold text-gray-900">{laden ? '...' : kennzahlen.offeneRechnungen}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">Einnahmen diesen Monat</p>
            <p className="text-2xl font-bold text-gray-900">{laden ? '...' : formatiereBetrag(kennzahlen.einnahmenMonat)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">Kunden gesamt</p>
            <p className="text-2xl font-bold text-gray-900">{laden ? '...' : kennzahlen.kundenGesamt}</p>
          </div>
        </div>
      </main>
    </div>
  )
}

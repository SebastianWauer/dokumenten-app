import { useCallback, useEffect, useMemo, useState } from 'react'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { formatiereBetrag, formatiereDatum } from '../lib/utils'

export default function Eingangsrechnungen() {
  const [liste, setListe] = useState([])
  const [laden, setLaden] = useState(true)
  const [hochladen, setHochladen] = useState(false)
  const [fehler, setFehler] = useState('')
  const [erfolg, setErfolg] = useState('')

  const [lieferant, setLieferant] = useState('')
  const [rechnungsnummer, setRechnungsnummer] = useState('')
  const [rechnungsdatum, setRechnungsdatum] = useState(new Date().toISOString().slice(0, 10))
  const [betrag, setBetrag] = useState('')
  const [datei, setDatei] = useState(null)

  const sortiert = useMemo(
    () => [...liste].sort((a, b) => String(b.rechnungsdatum || '').localeCompare(String(a.rechnungsdatum || ''))),
    [liste],
  )

  const lade = useCallback(async () => {
    setLaden(true)
    setFehler('')
    try {
      const { data, error } = await supabase
        .from('eingangsrechnungen')
        .select('*')
        .order('rechnungsdatum', { ascending: false })
        .limit(200)
      if (error) throw error
      setListe(data ?? [])
    } catch (err) {
      setFehler(err.message || 'Eingangsrechnungen konnten nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    const tid = window.setTimeout(() => {
      lade()
    }, 0)
    return () => window.clearTimeout(tid)
  }, [lade])

  async function speichern(e) {
    e.preventDefault()
    if (!datei) {
      setFehler('Bitte eine PDF auswählen.')
      return
    }
    setHochladen(true)
    setFehler('')
    setErfolg('')
    try {
      const extension = (datei.name.split('.').pop() || 'pdf').toLowerCase()
      const dateiname = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
      const pfad = `eingang/${dateiname}`

      const { error: uploadError } = await supabase.storage
        .from('eingangsrechnungen')
        .upload(pfad, datei, { upsert: false, contentType: datei.type || 'application/pdf' })
      if (uploadError) throw uploadError

      const payload = {
        lieferant: lieferant || null,
        rechnungsnummer: rechnungsnummer || null,
        rechnungsdatum,
        brutto_betrag: Number(betrag || 0),
        dateipfad: pfad,
        dateiname: datei.name,
      }
      const { error: insertError } = await supabase.from('eingangsrechnungen').insert([payload])
      if (insertError) throw insertError

      setLieferant('')
      setRechnungsnummer('')
      setRechnungsdatum(new Date().toISOString().slice(0, 10))
      setBetrag('')
      setDatei(null)
      setErfolg('Eingangsrechnung wurde hochgeladen und archiviert.')
      await lade()
    } catch (err) {
      setFehler(err.message || 'Upload fehlgeschlagen.')
    } finally {
      setHochladen(false)
    }
  }

  async function oeffnen(row) {
    try {
      const { data, error } = await supabase.storage.from('eingangsrechnungen').createSignedUrl(row.dateipfad, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setFehler(err.message || 'Datei konnte nicht geöffnet werden.')
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />
      <main className="flex-1 p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Eingangsrechnungen</h2>
        <p className="text-sm text-gray-500 mb-8">PDF-Upload und Archiv für Eingangsbelege.</p>
        {fehler && <p className="text-sm text-red-600 mb-4">{fehler}</p>}
        {erfolg && <p className="text-sm text-green-700 mb-4">{erfolg}</p>}

        <section className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <form onSubmit={speichern} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <label className="text-sm text-gray-700 md:col-span-2">Lieferant
              <input value={lieferant} onChange={(e) => setLieferant(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <label className="text-sm text-gray-700">Rechnungsnr.
              <input value={rechnungsnummer} onChange={(e) => setRechnungsnummer(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <label className="text-sm text-gray-700">Datum
              <input type="date" value={rechnungsdatum} onChange={(e) => setRechnungsdatum(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <label className="text-sm text-gray-700">Betrag
              <input type="number" step="0.01" min="0" value={betrag} onChange={(e) => setBetrag(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
            </label>
            <label className="text-sm text-gray-700">PDF
              <input type="file" accept="application/pdf" onChange={(e) => setDatei(e.target.files?.[0] ?? null)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
            </label>
            <button type="submit" disabled={hochladen} className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60">
              {hochladen ? 'Lädt...' : 'Hochladen'}
            </button>
          </form>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {laden ? (
            <p className="p-4 text-sm text-gray-500">Archiv wird geladen...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">Datum</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">Lieferant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">Rechnungsnr.</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-gray-600 uppercase">Betrag</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">Datei</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortiert.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-4 text-sm text-gray-500">Noch keine Eingangsrechnungen vorhanden.</td></tr>
                  )}
                  {sortiert.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatiereDatum(row.rechnungsdatum)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{row.lieferant || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.rechnungsnummer || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatiereBetrag(row.brutto_betrag || 0)}</td>
                      <td className="px-4 py-3 text-sm">
                        <button type="button" onClick={() => oeffnen(row)} className="text-[#185FA5] hover:underline">
                          Öffnen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { getFeld } from '../lib/utils'

const dokumentTypen = ['Rechnung', 'Angebot', 'Auftragsbestätigung', 'Lieferschein', 'Gutschrift']
const statusOptionen = ['Entwurf', 'Versendet', 'Bezahlt', 'Überfällig', 'Storniert']

function toDecimal(wert) {
  const normalisiert = String(wert || '').replace(',', '.').trim()
  const nummer = Number(normalisiert)
  return Number.isFinite(nummer) ? nummer : 0
}

function formatiereBetrag(wert) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(wert || 0))
}

function berechnePositionsGesamt(position) {
  const menge = toDecimal(position.menge)
  const einzelpreis = toDecimal(position.einzelpreis)
  const rabatt = toDecimal(position.rabattProzent)
  const brutto = menge * einzelpreis
  return brutto - (brutto * rabatt) / 100
}

function leerePosition(id) {
  return {
    id,
    bezeichnung: '',
    beschreibung: '',
    interneNotiz: '',
    menge: '1',
    einheit: 'Stk',
    einzelpreis: '',
    rabattProzent: '0',
  }
}

function mapPositionen(positionenData) {
  if (!positionenData || positionenData.length === 0) {
    return [leerePosition(Date.now())]
  }

  return positionenData.map((position, index) => ({
    id: position.id ?? `p-${index}`,
    bezeichnung: getFeld(position, ['bezeichnung']),
    beschreibung: getFeld(position, ['beschreibung']),
    interneNotiz: getFeld(position, ['interne_notiz']),
    menge: String(getFeld(position, ['menge']) || '1'),
    einheit: getFeld(position, ['einheit']) || 'Stk',
    einzelpreis: String(getFeld(position, ['einzelpreis']) || ''),
    rabattProzent: String(getFeld(position, ['rabatt_prozent']) || '0'),
  }))
}

export default function DokumentBearbeiten() {
  const navigate = useNavigate()
  const { id } = useParams()

  const [firmenprofil, setFirmenprofil] = useState(null)
  const [kunden, setKunden] = useState([])
  const [dokumentTyp, setDokumentTyp] = useState('Rechnung')
  const [dokumentNummer, setDokumentNummer] = useState('')
  const [status, setStatus] = useState('Entwurf')
  const [kundenId, setKundenId] = useState('')
  const [datum, setDatum] = useState('')
  const [leistungszeitraum, setLeistungszeitraum] = useState('')
  const [leistungszeitraumAnzeigen, setLeistungszeitraumAnzeigen] = useState(true)
  const [einleitungstext, setEinleitungstext] = useState('')
  const [schlusstext, setSchlusstext] = useState('')
  const [positionen, setPositionen] = useState([leerePosition(1)])
  const [dokumentSpalten, setDokumentSpalten] = useState([])

  const [laden, setLaden] = useState(true)
  const [speichern, setSpeichern] = useState(false)
  const [fehler, setFehler] = useState('')
  const [formularFehler, setFormularFehler] = useState('')

  const netto = useMemo(
    () => positionen.reduce((summe, position) => summe + berechnePositionsGesamt(position), 0),
    [positionen],
  )

  const paragraph19Aktiv = Boolean(firmenprofil?.paragraph19)
  const ust = paragraph19Aktiv ? 0 : netto * 0.19
  const brutto = netto + ust

  const ladeDaten = useCallback(async function ladeDaten() {
    setLaden(true)
    setFehler('')

    try {
      const { data: dokumentData, error: dokumentError } = await supabase
        .from('dokumente')
        .select('*')
        .eq('id', id)
        .single()

      if (dokumentError) throw dokumentError
      if (!dokumentData) throw new Error('Dokument wurde nicht gefunden.')

      const [
        { data: profilData, error: profilError },
        { data: kundenData, error: kundenError },
        { data: positionenData, error: positionenError },
      ] = await Promise.all([
        supabase.from('firmenprofile').select('*').eq('id', dokumentData.firmenprofil_id).single(),
        supabase.from('kunden').select('*').order('firma', { ascending: true }),
        supabase.from('positionen').select('*').eq('dokument_id', id).order('reihenfolge'),
      ])

      if (profilError) throw profilError
      if (kundenError) throw kundenError
      if (positionenError) throw positionenError

      setFirmenprofil(profilData ?? null)
      setKunden(kundenData ?? [])
      setDokumentSpalten(Object.keys(dokumentData))
      setDokumentTyp(getFeld(dokumentData, ['typ']) || 'Rechnung')
      setDokumentNummer(getFeld(dokumentData, ['nummer']))
      setStatus(getFeld(dokumentData, ['status']) || 'Entwurf')
      setKundenId(String(getFeld(dokumentData, ['kunde_id']) || ''))
      setDatum(getFeld(dokumentData, ['datum']) || '')
      setLeistungszeitraum(getFeld(dokumentData, ['leistungszeitraum']))
      setLeistungszeitraumAnzeigen(dokumentData.leistungszeitraum_anzeigen !== false)
      setEinleitungstext(getFeld(dokumentData, ['einleitungstext']))
      setSchlusstext(getFeld(dokumentData, ['schlusstext']))
      setPositionen(mapPositionen(positionenData))
    } catch (err) {
      setFehler(err.message || 'Dokument konnte nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }, [id])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      ladeDaten()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [ladeDaten])

  function updatePosition(positionId, feld, wert) {
    setPositionen((alt) => alt.map((position) => {
      if (position.id !== positionId) return position
      return { ...position, [feld]: wert }
    }))
  }

  function positionHinzufuegen() {
    setPositionen((alt) => [...alt, leerePosition(Date.now())])
  }

  function positionEntfernen(positionId) {
    setPositionen((alt) => {
      if (alt.length <= 1) return alt
      return alt.filter((position) => position.id !== positionId)
    })
  }

  async function speichernHandler(e) {
    e.preventDefault()
    setSpeichern(true)
    setFormularFehler('')
    setFehler('')

    try {
      if (!firmenprofil?.id) {
        throw new Error('Firmenprofil konnte nicht geladen werden.')
      }
      if (!kundenId) {
        throw new Error('Bitte einen Kunden auswählen.')
      }
      if (!dokumentNummer) {
        throw new Error('Dokumentnummer fehlt.')
      }

      const ausgewaehlterKunde = kunden.find((kunde) => String(kunde.id) === String(kundenId))
      if (!ausgewaehlterKunde?.id) {
        throw new Error('Ausgewählter Kunde konnte nicht gefunden werden.')
      }

      const gueltigePositionen = positionen.filter((position) => position.bezeichnung.trim() !== '')
      if (gueltigePositionen.length === 0) {
        throw new Error('Bitte mindestens eine Position mit Bezeichnung anlegen.')
      }

      const dokumentPayload = {
        typ: dokumentTyp,
        datum,
        leistungszeitraum: leistungszeitraum || null,
        status,
        firmenprofil_id: firmenprofil.id,
        kunde_id: ausgewaehlterKunde.id,
        einleitungstext: einleitungstext || null,
        schlusstext: schlusstext || null,
        netto_gesamt: netto,
        ust_betrag: ust,
        brutto_gesamt: brutto,
      }

      if (dokumentSpalten.includes('leistungszeitraum_anzeigen')) {
        dokumentPayload.leistungszeitraum_anzeigen = leistungszeitraumAnzeigen
      }

      const { error: updateError } = await supabase.from('dokumente').update(dokumentPayload).eq('id', id)
      if (updateError) throw updateError

      const { error: deletePositionError } = await supabase.from('positionen').delete().eq('dokument_id', id)
      if (deletePositionError) throw deletePositionError

      const neuePositionen = gueltigePositionen.map((position, index) => ({
        dokument_id: id,
        reihenfolge: index + 1,
        bezeichnung: position.bezeichnung.trim(),
        beschreibung: position.beschreibung?.trim() ? position.beschreibung.trim() : null,
        interne_notiz: position.interneNotiz?.trim() ? position.interneNotiz.trim() : null,
        menge: toDecimal(position.menge),
        einheit: position.einheit.trim() || null,
        einzelpreis: toDecimal(position.einzelpreis),
        rabatt_prozent: toDecimal(position.rabattProzent),
        gesamt: berechnePositionsGesamt(position),
      }))

      const { error: insertPositionError } = await supabase.from('positionen').insert(neuePositionen)
      if (insertPositionError) throw insertPositionError

      navigate(`/dokumente/${id}`)
    } catch (err) {
      setFormularFehler(err.message || 'Dokument konnte nicht gespeichert werden.')
    } finally {
      setSpeichern(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />

      <main className="flex-1 p-8">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Dokument bearbeiten</h2>
          <p className="text-sm text-gray-500">
            Bestehende Rechnung bearbeiten und aktualisieren.
          </p>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl p-6">
          {laden ? (
            <p className="text-sm text-gray-500">Daten werden geladen...</p>
          ) : (
            <form onSubmit={speichernHandler} className="space-y-6">
              {fehler && <p className="text-sm text-red-600">{fehler}</p>}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dokumenttyp</label>
                  <select
                    value={dokumentTyp}
                    onChange={(e) => setDokumentTyp(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                  >
                    {dokumentTypen.map((typ) => (
                      <option key={typ} value={typ}>
                        {typ}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kunde</label>
                  <select
                    value={kundenId}
                    onChange={(e) => setKundenId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    required
                  >
                    <option value="">Kunde auswählen</option>
                    {kunden.map((kunde) => (
                      <option key={kunde.id} value={String(kunde.id)}>
                        {getFeld(kunde, ['firma', 'name', 'unternehmen']) || `Kunde ${kunde.id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dokumentnummer</label>
                  <input
                    type="text"
                    value={dokumentNummer}
                    readOnly
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 bg-gray-50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
                  <input
                    type="date"
                    value={datum}
                    onChange={(e) => setDatum(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leistungszeitraum</label>
                  <input
                    type="text"
                    value={leistungszeitraum}
                    onChange={(e) => setLeistungszeitraum(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="z. B. 01.04.2026 - 15.04.2026"
                  />
                  <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={leistungszeitraumAnzeigen}
                      onChange={(e) => setLeistungszeitraumAnzeigen(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[#185FA5] focus:ring-[#185FA5]"
                    />
                    Im PDF anzeigen
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                  >
                    {statusOptionen.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-gray-900">Positionen</h3>
                  <button
                    type="button"
                    onClick={positionHinzufuegen}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-[#185FA5] bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    Position hinzufügen
                  </button>
                </div>

                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                          Position
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                          Menge
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                          Einheit
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                          Einzelpreis
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                          Rabatt %
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-gray-600 uppercase">
                          Gesamtpreis
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-gray-600 uppercase">
                          Aktion
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {positionen.map((position) => (
                        <tr key={position.id}>
                          <td className="px-4 py-3">
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={position.bezeichnung}
                                onChange={(e) => updatePosition(position.id, 'bezeichnung', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                                placeholder="Bezeichnung"
                              />
                              <textarea
                                value={position.beschreibung}
                                onChange={(e) => updatePosition(position.id, 'beschreibung', e.target.value)}
                                rows={2}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                                placeholder="Beschreibung (optional, erscheint auf Rechnung)"
                              />
                              <div className="bg-gray-100 border border-gray-200 rounded-lg p-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Interne Notiz - nicht auf Rechnung sichtbar
                                </label>
                                <textarea
                                  value={position.interneNotiz}
                                  onChange={(e) => updatePosition(position.id, 'interneNotiz', e.target.value)}
                                  rows={2}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                                  placeholder="Interne Notiz (optional)"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={position.menge}
                              onChange={(e) => updatePosition(position.id, 'menge', e.target.value)}
                              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={position.einheit}
                              onChange={(e) => updatePosition(position.id, 'einheit', e.target.value)}
                              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                              placeholder="Stk"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={position.einzelpreis}
                              onChange={(e) => updatePosition(position.id, 'einzelpreis', e.target.value)}
                              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={position.rabattProzent}
                              onChange={(e) => updatePosition(position.id, 'rabattProzent', e.target.value)}
                              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right">
                            {formatiereBetrag(berechnePositionsGesamt(position))}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => positionEntfernen(position.id)}
                              className="rounded-lg px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                            >
                              Entfernen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Einleitungstext</label>
                  <textarea
                    value={einleitungstext}
                    onChange={(e) => setEinleitungstext(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Einleitender Text für das Dokument"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Schlusstext</label>
                  <textarea
                    value={schlusstext}
                    onChange={(e) => setSchlusstext(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Abschließender Text für das Dokument"
                  />
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <p className="text-gray-700">
                    Netto: <span className="font-semibold text-gray-900">{formatiereBetrag(netto)}</span>
                  </p>
                  <p className="text-gray-700">
                    USt ({paragraph19Aktiv ? '0' : '19'} %):{' '}
                    <span className="font-semibold text-gray-900">{formatiereBetrag(ust)}</span>
                  </p>
                  <p className="text-gray-700">
                    Brutto: <span className="font-semibold text-gray-900">{formatiereBetrag(brutto)}</span>
                  </p>
                </div>
                {paragraph19Aktiv && (
                  <p className="mt-2 text-xs text-gray-600">
                    Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.
                  </p>
                )}
              </div>

              {formularFehler && <p className="text-sm text-red-600">{formularFehler}</p>}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={speichern}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                >
                  {speichern ? 'Wird gespeichert...' : 'Änderungen speichern'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/dokumente/${id}`)}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { formatiereBetrag } from '../lib/utils'

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function toDecimal(wert) {
  const nummer = Number(wert)
  return Number.isFinite(nummer) ? nummer : 0
}

function findeOptionaleSpalte(kandidaten, daten) {
  if (!daten) return null
  return kandidaten.find((spalte) => Object.prototype.hasOwnProperty.call(daten, spalte)) || null
}

function parseIsoDate(wert) {
  if (!wert) return null
  const iso = String(wert).slice(0, 10)
  const datum = new Date(iso)
  if (Number.isNaN(datum.getTime())) return null
  return datum
}

export default function Dashboard() {
  const [kennzahlen, setKennzahlen] = useState({
    offeneRechnungen: 0,
    einnahmenMonat: 0,
    kundenGesamt: 0,
    dsoTage: 0,
    mahnquote: 0,
    umsatzprognose: 0,
  })
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState('')
  const [anzeigename, setAnzeigename] = useState('')
  const [jahresauswertung, setJahresauswertung] = useState({
    jahr: new Date().getFullYear(),
    monate: [],
    quartale: [],
    kunden: [],
  })

  const ladeKennzahlen = useCallback(async function ladeKennzahlen() {
    setLaden(true)
    setFehler('')

    try {
      const monatsStart = new Date()
      const aktuellesJahr = monatsStart.getFullYear()
      monatsStart.setDate(1)
      monatsStart.setHours(0, 0, 0, 0)
      const monatsStartIso = monatsStart.toISOString().slice(0, 10)
      const jahresStartIso = `${aktuellesJahr}-01-01`
      const jahresEndeIso = `${aktuellesJahr}-12-31`

      const [{ data: schemaDokumente, error: schemaDokumenteError }] = await Promise.all([
        supabase.from('dokumente').select('*').limit(1),
      ])
      if (schemaDokumenteError) throw schemaDokumenteError
      const beispielDokument = schemaDokumente?.[0] ?? null
      const zahlungsbetragSpalte = findeOptionaleSpalte(['bezahlt_betrag', 'zahlung_betrag', 'paid_amount'], beispielDokument)
      const zahlungsdatumSpalte = findeOptionaleSpalte(['zahlungsdatum', 'zahlungseingang_datum', 'paid_at'], beispielDokument)

      const [
        { count: offeneRechnungenCount, error: offeneRechnungenError },
        { data: rechnungenMonat, error: rechnungenMonatError },
        { data: gutschriftenMonat, error: gutschriftenMonatError },
        { count: kundenCount, error: kundenError },
        { data: kundenListe, error: kundenListeError },
        { data: dokumenteJahr, error: dokumenteJahrError },
        { data: sessionData, error: sessionError },
      ] = await Promise.all([
        supabase
          .from('dokumente')
          .select('id', { count: 'exact', head: true })
          .eq('typ', 'Rechnung')
          .not('status', 'in', '("Bezahlt","Storniert")'),
        supabase
          .from('dokumente')
          .select('*')
          .eq('typ', 'Rechnung')
          .not('status', 'eq', 'Storniert'),
        supabase
          .from('dokumente')
          .select('brutto_gesamt')
          .eq('typ', 'Gutschrift')
          .eq('status', 'Bezahlt')
          .gte('datum', monatsStartIso),
        supabase.from('kunden').select('id', { count: 'exact', head: true }),
        supabase.from('kunden').select('id,firma,ansprechpartner'),
        supabase
          .from('dokumente')
          .select('*')
          .in('typ', ['Rechnung', 'Gutschrift', 'Mahnung'])
          .not('status', 'in', '("Entwurf","Storniert")')
          .gte('datum', jahresStartIso)
          .lte('datum', jahresEndeIso),
        supabase.auth.getSession(),
      ])

      if (offeneRechnungenError) throw offeneRechnungenError
      if (rechnungenMonatError) throw rechnungenMonatError
      if (gutschriftenMonatError) throw gutschriftenMonatError
      if (kundenError) throw kundenError
      if (kundenListeError) throw kundenListeError
      if (dokumenteJahrError) throw dokumenteJahrError
      if (sessionError) throw sessionError

      const user = sessionData?.session?.user
      const name = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || ''
      setAnzeigename(name)

      const summeRechnungen = (rechnungenMonat ?? []).reduce((summe, dokument) => {
        if (zahlungsbetragSpalte) {
          const zahlungsdatum = zahlungsdatumSpalte ? dokument?.[zahlungsdatumSpalte] : null
          const faelltInMonat = zahlungsdatum ? String(zahlungsdatum).slice(0, 10) >= monatsStartIso : false
          if (!faelltInMonat) return summe
          return summe + Math.abs(toDecimal(dokument?.[zahlungsbetragSpalte]))
        }

        const status = String(dokument?.status || '')
        const faelltInMonat = String(dokument?.datum || '').slice(0, 10) >= monatsStartIso
        if (status !== 'Bezahlt' || !faelltInMonat) return summe
        return summe + Math.abs(toDecimal(dokument?.brutto_gesamt))
      }, 0)
      const summeGutschriften = (gutschriftenMonat ?? []).reduce((summe, dokument) => {
        return summe + Math.abs(Number(dokument.brutto_gesamt || 0))
      }, 0)
      const einnahmenMonat = summeRechnungen - summeGutschriften

      const rechnungenAlle = (rechnungenMonat ?? []).filter((d) => String(d?.typ || '') === 'Rechnung')
      const bezahlte = rechnungenAlle.filter((d) => String(d?.status || '') === 'Bezahlt')
      const dsoWerte = bezahlte
        .map((d) => {
          const start = parseIsoDate(d?.datum)
          const ende = parseIsoDate(zahlungsdatumSpalte ? d?.[zahlungsdatumSpalte] : d?.datum)
          if (!start || !ende) return null
          const tage = Math.round((ende.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
          return Number.isFinite(tage) && tage >= 0 ? tage : null
        })
        .filter((v) => v !== null)
      const dsoTage = dsoWerte.length > 0
        ? dsoWerte.reduce((a, b) => a + b, 0) / dsoWerte.length
        : 0

      const rechnungGesamt = (dokumenteJahr ?? []).filter((d) => String(d?.typ || '') === 'Rechnung').length
      const mahnungenGesamt = (dokumenteJahr ?? []).filter((d) => String(d?.typ || '') === 'Mahnung').length
      const mahnquote = rechnungGesamt > 0 ? (mahnungenGesamt / rechnungGesamt) * 100 : 0

      setKennzahlen({
        offeneRechnungen: offeneRechnungenCount ?? 0,
        einnahmenMonat,
        kundenGesamt: kundenCount ?? 0,
        dsoTage,
        mahnquote,
        umsatzprognose: 0,
      })

      const kundenNameMap = new Map((kundenListe ?? []).map((kunde) => [
        String(kunde.id),
        kunde.firma || kunde.name || kunde.unternehmen || `Kunde ${kunde.id}`,
      ]))
      const monatSummen = Array.from({ length: 12 }, () => 0)
      const kundenSummen = new Map()

      for (const dokument of dokumenteJahr ?? []) {
        const typ = String(dokument?.typ || '')
        const status = String(dokument?.status || '')

        let betrag = 0
        let datum = null

        if (typ === 'Rechnung' && zahlungsbetragSpalte) {
          datum = parseIsoDate(zahlungsdatumSpalte ? dokument?.[zahlungsdatumSpalte] : null)
          betrag = Math.abs(toDecimal(dokument?.[zahlungsbetragSpalte]))
        } else if (typ === 'Rechnung') {
          if (status !== 'Bezahlt') continue
          datum = parseIsoDate(dokument?.datum)
          betrag = Math.abs(toDecimal(dokument?.brutto_gesamt))
        } else if (typ === 'Gutschrift') {
          if (status !== 'Bezahlt') continue
          datum = parseIsoDate(dokument?.datum)
          betrag = -Math.abs(toDecimal(dokument?.brutto_gesamt))
        }

        if (!datum || datum.getFullYear() !== aktuellesJahr) continue
        const monatIndex = datum.getMonth()
        monatSummen[monatIndex] += betrag

        const kundeId = String(dokument?.kunde_id || '')
        if (kundeId) {
          kundenSummen.set(kundeId, (kundenSummen.get(kundeId) || 0) + betrag)
        }
      }

      const quartalSummen = [
        monatSummen[0] + monatSummen[1] + monatSummen[2],
        monatSummen[3] + monatSummen[4] + monatSummen[5],
        monatSummen[6] + monatSummen[7] + monatSummen[8],
        monatSummen[9] + monatSummen[10] + monatSummen[11],
      ]
      const kundenTop = [...kundenSummen.entries()]
        .map(([kundeId, summe]) => ({ kunde: kundenNameMap.get(kundeId) || `Kunde ${kundeId}`, summe }))
        .sort((a, b) => b.summe - a.summe)
        .slice(0, 5)

      const monatMitDaten = monatSummen.filter((summe) => summe !== 0)
      const monatsschnitt = monatMitDaten.length > 0
        ? monatMitDaten.reduce((a, b) => a + b, 0) / monatMitDaten.length
        : 0
      const umsatzprognose = monatsschnitt * 12

      setKennzahlen((alt) => ({ ...alt, umsatzprognose }))

      setJahresauswertung({
        jahr: aktuellesJahr,
        monate: monatSummen.map((summe, index) => ({ label: MONATE[index], summe })),
        quartale: quartalSummen.map((summe, index) => ({ label: `Q${index + 1}`, summe })),
        kunden: kundenTop,
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">DSO (Tage)</p>
            <p className="text-2xl font-bold text-gray-900">{laden ? '...' : kennzahlen.dsoTage.toFixed(1)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">Mahnquote</p>
            <p className="text-2xl font-bold text-gray-900">{laden ? '...' : `${kennzahlen.mahnquote.toFixed(1)} %`}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-6">
            <p className="text-sm text-gray-400 mb-1">Umsatzprognose (12M)</p>
            <p className="text-2xl font-bold text-gray-900">{laden ? '...' : formatiereBetrag(kennzahlen.umsatzprognose)}</p>
          </div>
        </div>

        <section className="mt-6 bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Jahresauswertung {jahresauswertung.jahr}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-3">Einnahmen nach Monat</p>
              <div className="space-y-2">
                {jahresauswertung.monate.map((monat) => (
                  <div key={monat.label} className="grid grid-cols-[2.2rem_1fr_auto] items-center gap-2 text-xs">
                    <span className="text-gray-600">{monat.label}</span>
                    <div className="h-2 rounded bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full ${monat.summe >= 0 ? 'bg-[#185FA5]' : 'bg-red-400'}`}
                        style={{ width: `${Math.min(100, Math.abs(monat.summe) / Math.max(1, ...jahresauswertung.monate.map((m) => Math.abs(m.summe))) * 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-700">{formatiereBetrag(monat.summe)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-3">Einnahmen nach Quartal</p>
              <div className="space-y-2">
                {jahresauswertung.quartale.map((quartal) => (
                  <div key={quartal.label} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="text-gray-700">{quartal.label}</span>
                    <span className="font-medium text-gray-900">{formatiereBetrag(quartal.summe)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 mb-3">Top Kunden (Jahr)</p>
              <div className="space-y-2">
                {jahresauswertung.kunden.length === 0 && (
                  <p className="text-sm text-gray-500">Noch keine Daten.</p>
                )}
                {jahresauswertung.kunden.map((eintrag) => (
                  <div key={eintrag.kunde} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <span className="text-gray-700 truncate pr-3">{eintrag.kunde}</span>
                    <span className="font-medium text-gray-900">{formatiereBetrag(eintrag.summe)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

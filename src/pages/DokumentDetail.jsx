import { useEffect, useMemo, useState } from 'react'
import { Document, Page, StyleSheet, Text, View, Image, pdf } from '@react-pdf/renderer'
import { Link, useParams } from 'react-router-dom'
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

function formatBetrag(wert) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(wert || 0))
}

function formatEuro(wert) {
  return `${formatBetrag(wert)} €`
}

function formatDatum(wert) {
  if (!wert) return '—'
  const datum = new Date(wert)
  if (Number.isNaN(datum.getTime())) return wert
  return new Intl.DateTimeFormat('de-DE').format(datum)
}

function baueAdressZeileFirmenprofil(profil) {
  const name = getFeld(profil, ['name']) || 'Sport Voice'
  const strasse = getFeld(profil, ['strasse', 'straße'])
  const plz = getFeld(profil, ['plz'])
  const ort = getFeld(profil, ['ort', 'stadt'])
  return [name, strasse, [plz, ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
}

function baueKundenAdressZeilen(kunde) {
  const zeilen = []
  const firma = getFeld(kunde, ['firma', 'name', 'unternehmen'])
  const ansprechpartner = getFeld(kunde, ['ansprechpartner', 'kontaktperson'])
  const strasse = getFeld(kunde, ['strasse', 'straße', 'adresse'])
  const plz = getFeld(kunde, ['plz'])
  const ort = getFeld(kunde, ['ort', 'stadt'])

  if (firma) zeilen.push(firma)
  if (ansprechpartner) zeilen.push(ansprechpartner)
  if (strasse) zeilen.push(strasse)
  if (plz || ort) zeilen.push([plz, ort].filter(Boolean).join(' '))
  return zeilen.length > 0 ? zeilen : ['—']
}

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 42,
    paddingHorizontal: 44,
    fontSize: 10.5,
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  senderLine: {
    fontSize: 8.5,
    color: '#4b5563',
    maxWidth: '64%',
  },
  logoWrap: {
    alignItems: 'flex-end',
  },
  logoTitle: {
    fontSize: 17,
    fontWeight: 700,
    textTransform: 'lowercase',
    lineHeight: 1.05,
  },
  logoSub: {
    fontSize: 10,
    marginTop: 3,
  },
  logoImage: {
    width: 132,
    height: 52,
    objectFit: 'contain',
  },
  adressRow: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  empfaengerWrap: {
    width: '54%',
  },
  infosWrap: {
    width: '42%',
    alignItems: 'flex-end',
  },
  empfaengerTitle: {
    fontSize: 9,
    marginBottom: 4,
    color: '#374151',
  },
  line: {
    marginTop: 4,
  },
  infoLine: {
    fontSize: 10,
    marginTop: 4,
  },
  rechnungTitle: {
    marginTop: 26,
    fontSize: 14,
    fontWeight: 700,
  },
  table: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  lastTableRow: {
    borderBottomWidth: 0,
  },
  colPos: {
    width: '10%',
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  colBez: {
    width: '62%',
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  colBetrag: {
    width: '28%',
    paddingVertical: 7,
    paddingHorizontal: 8,
    textAlign: 'right',
  },
  summaryLine: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hint: {
    width: '60%',
    fontSize: 9.5,
    color: '#4b5563',
  },
  totalWrap: {
    width: '38%',
    alignItems: 'flex-end',
  },
  totalTitle: {
    fontSize: 10,
  },
  totalValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: 700,
  },
  footer: {
    marginTop: 40,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    fontSize: 9.5,
    color: '#4b5563',
  },
})

function RechnungPdf({ dokument, profil, kunde, positionen }) {
  const logoUrl = getFeld(profil, ['logo_url'])
  const hinweis = profil?.paragraph19
    ? 'Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.'
    : `Umsatzsteuer: ${formatEuro(getFeld(dokument, ['ust_betrag']))}`

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.senderLine}>{baueAdressZeileFirmenprofil(profil)}</Text>
          <View style={pdfStyles.logoWrap}>
            {logoUrl ? (
              <Image src={logoUrl} style={pdfStyles.logoImage} />
            ) : (
              <>
                <Text style={pdfStyles.logoTitle}>sport voice</Text>
                <Text style={pdfStyles.logoSub}>Sebastian Wauer</Text>
              </>
            )}
          </View>
        </View>

        <View style={pdfStyles.adressRow}>
          <View style={pdfStyles.empfaengerWrap}>
            <Text style={pdfStyles.empfaengerTitle}>An:</Text>
            {baueKundenAdressZeilen(kunde).map((zeile, index) => (
              <Text key={`adr-${index}`} style={pdfStyles.line}>{zeile}</Text>
            ))}
          </View>

          <View style={pdfStyles.infosWrap}>
            <Text style={pdfStyles.infoLine}>Datum: {formatDatum(getFeld(dokument, ['datum']))}</Text>
            <Text style={pdfStyles.infoLine}>Telefon: {getFeld(profil, ['telefon', 'phone']) || '—'}</Text>
            <Text style={pdfStyles.infoLine}>E-Mail: {getFeld(profil, ['email', 'e_mail']) || '—'}</Text>
          </View>
        </View>

        <Text style={pdfStyles.rechnungTitle}>Rechnung Nr. {getFeld(dokument, ['nummer'])}</Text>

        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableHeader}>
            <Text style={pdfStyles.colPos}>Pos.</Text>
            <Text style={pdfStyles.colBez}>Bezeichnung</Text>
            <Text style={pdfStyles.colBetrag}>Gesamtpreis €</Text>
          </View>

          {positionen.map((position, index) => {
            const istLetzte = index === positionen.length - 1
            return (
              <View
                key={position.id ?? `${index}-${position.bezeichnung}`}
                style={[pdfStyles.tableRow, istLetzte ? pdfStyles.lastTableRow : null]}
              >
                <Text style={pdfStyles.colPos}>{position.reihenfolge ?? index + 1}</Text>
                <Text style={pdfStyles.colBez}>{getFeld(position, ['bezeichnung']) || '—'}</Text>
                <Text style={pdfStyles.colBetrag}>{formatBetrag(getFeld(position, ['gesamt']))}</Text>
              </View>
            )
          })}
        </View>

        <View style={pdfStyles.summaryLine}>
          <Text style={pdfStyles.hint}>{hinweis}</Text>
          <View style={pdfStyles.totalWrap}>
            <Text style={pdfStyles.totalTitle}>Gesamtbetrag</Text>
            <Text style={pdfStyles.totalValue}>{formatEuro(getFeld(dokument, ['brutto_gesamt']))}</Text>
          </View>
        </View>

        <View style={pdfStyles.footer}>
          <Text>
            {`Bank: ${getFeld(profil, ['bank']) || '—'} · IBAN: ${getFeld(profil, ['iban']) || '—'} · BIC: ${getFeld(profil, ['bic']) || '—'}`}
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export default function DokumentDetail() {
  const { id } = useParams()
  const [dokument, setDokument] = useState(null)
  const [profil, setProfil] = useState(null)
  const [kunde, setKunde] = useState(null)
  const [positionen, setPositionen] = useState([])
  const [laden, setLaden] = useState(true)
  const [pdfLaden, setPdfLaden] = useState(false)
  const [fehler, setFehler] = useState('')

  const brutto = useMemo(() => getFeld(dokument, ['brutto_gesamt']), [dokument])

  async function ladeDokument() {
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

      const [{ data: profilData, error: profilError }, { data: kundeData, error: kundeError }, { data: positionenData, error: positionenError }] =
        await Promise.all([
          supabase.from('firmenprofile').select('*').eq('id', dokumentData.firmenprofil_id).single(),
          supabase.from('kunden').select('*').eq('id', dokumentData.kunde_id).single(),
          supabase.from('positionen').select('*').eq('dokument_id', id).order('reihenfolge'),
        ])

      if (profilError) throw profilError
      if (kundeError) throw kundeError
      if (positionenError) throw positionenError

      setDokument(dokumentData)
      setProfil(profilData ?? null)
      setKunde(kundeData ?? null)
      setPositionen(positionenData ?? [])
    } catch (err) {
      setFehler(err.message || 'Dokument konnte nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    ladeDokument()
  }, [id])

  async function pdfHerunterladen() {
    if (!dokument || !profil || !kunde) return
    setPdfLaden(true)

    try {
      const blob = await pdf(
        <RechnungPdf
          dokument={dokument}
          profil={profil}
          kunde={kunde}
          positionen={positionen}
        />,
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      const dateiname = `${getFeld(dokument, ['nummer']) || 'rechnung'}.pdf`

      link.href = url
      link.download = dateiname
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } finally {
      setPdfLaden(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />

      <main className="flex-1 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Dokument</h2>
            <p className="text-sm text-gray-500">
              Detailansicht mit PDF-Export.
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              to="/dokumente"
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Zurück
            </Link>
            <Link
              to={`/dokumente/${id}/bearbeiten`}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Bearbeiten
            </Link>
            <button
              type="button"
              onClick={pdfHerunterladen}
              disabled={laden || pdfLaden || !dokument}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
            >
              {pdfLaden ? 'PDF wird erstellt...' : 'PDF herunterladen'}
            </button>
          </div>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl p-6">
          {laden && <p className="text-sm text-gray-500">Dokument wird geladen...</p>}
          {!laden && fehler && <p className="text-sm text-red-600">{fehler}</p>}

          {!laden && !fehler && dokument && (
            <div className="space-y-6">
              {getFeld(profil, ['logo_url']) && (
                <div className="flex justify-end">
                  <img
                    src={getFeld(profil, ['logo_url'])}
                    alt="Firmenlogo"
                    className="h-14 w-auto object-contain"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <p className="text-gray-700">
                  Nummer: <span className="font-semibold text-gray-900">{getFeld(dokument, ['nummer']) || '—'}</span>
                </p>
                <p className="text-gray-700">
                  Datum: <span className="font-semibold text-gray-900">{formatDatum(getFeld(dokument, ['datum']))}</span>
                </p>
                <p className="text-gray-700">
                  Kunde: <span className="font-semibold text-gray-900">{getFeld(kunde, ['firma', 'name', 'unternehmen']) || '—'}</span>
                </p>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="min-w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">Pos.</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">Bezeichnung</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-gray-600 uppercase">Gesamtpreis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {positionen.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-4 text-sm text-gray-500">Keine Positionen vorhanden.</td>
                      </tr>
                    )}
                    {positionen.map((position, index) => (
                      <tr key={position.id ?? `${index}-${position.bezeichnung}`}>
                        <td className="px-4 py-3 text-sm text-gray-700">{position.reihenfolge ?? index + 1}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{getFeld(position, ['bezeichnung']) || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatEuro(getFeld(position, ['gesamt']))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
                <p className="text-xs text-gray-600">
                  {profil?.paragraph19
                    ? 'Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.'
                    : `USt-Betrag: ${formatEuro(getFeld(dokument, ['ust_betrag']))}`}
                </p>
                <p className="text-sm font-semibold text-gray-900">Gesamtbetrag: {formatEuro(brutto)}</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

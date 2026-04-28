import { useCallback, useEffect, useMemo, useState } from 'react'
import { Document, Page, StyleSheet, Text, View, Image, pdf } from '@react-pdf/renderer'
import { Link, useParams } from 'react-router-dom'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { resolvePdfLayout } from '../lib/pdfLayout'
import { getFeld } from '../lib/utils'

const statusOptionen = ['Entwurf', 'Versendet', 'Bezahlt', 'Überfällig', 'Storniert']

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

function formatDatumLang(wert) {
  if (!wert) return '—'
  const datum = new Date(wert)
  if (Number.isNaN(datum.getTime())) return wert
  return new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(datum)
}

function dokumentTitel(dokument) {
  const typ = getFeld(dokument, ['typ']) || 'Dokument'
  const nummer = getFeld(dokument, ['nummer'])
  return `${typ} Nr. ${nummer || '—'}`
}

function sollLeistungszeitraumAnzeigen(dokument) {
  return getFeld(dokument, ['leistungszeitraum']) && dokument?.leistungszeitraum_anzeigen !== false
}

function baueAdressZeileFirmenprofil(profil) {
  const name = getFeld(profil, ['name'])
  const inhaber = getFeld(profil, ['inhaber'])
  const strasse = getFeld(profil, ['strasse', 'straße'])
  const plz = getFeld(profil, ['plz'])
  const ort = getFeld(profil, ['ort', 'stadt'])
  return [[name, inhaber].filter(Boolean).join(' · '), strasse, [plz, ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
}

function baueFooterDaten(profil) {
  const ortszeile = [
    getFeld(profil, ['strasse', 'straße']),
    [getFeld(profil, ['plz']), getFeld(profil, ['ort', 'stadt'])].filter(Boolean).join(' '),
    getFeld(profil, ['land']),
    getFeld(profil, ['inhaber']),
  ].filter(Boolean).join(' · ')

  return {
    name: getFeld(profil, ['name']),
    ortszeile,
    kontakt: [
      getFeld(profil, ['telefon', 'phone']) ? `Telefon: ${getFeld(profil, ['telefon', 'phone'])}` : '',
      getFeld(profil, ['email', 'e_mail']) ? `E-Mail: ${getFeld(profil, ['email', 'e_mail'])}` : '',
    ].filter(Boolean).join(' · '),
    bank: [
      getFeld(profil, ['bank']) ? `Bank: ${getFeld(profil, ['bank'])}` : '',
      getFeld(profil, ['iban']) ? `IBAN: ${getFeld(profil, ['iban'])}` : '',
      getFeld(profil, ['bic']) ? `BIC: ${getFeld(profil, ['bic'])}` : '',
      getFeld(profil, ['steuernummer']) ? `Steuernummer: ${getFeld(profil, ['steuernummer'])}` : '',
    ].filter(Boolean).join(' · '),
  }
}

function PdfFooter({ profil }) {
  const footer = baueFooterDaten(profil)

  return (
    <View style={pdfStyles.footer}>
      <Text style={pdfStyles.footerName}>{footer.name}</Text>
      {footer.ortszeile && <Text style={pdfStyles.footerLine}>{footer.ortszeile}</Text>}
      {footer.kontakt && <Text style={pdfStyles.footerLine}>{footer.kontakt}</Text>}
      {footer.bank && <Text style={pdfStyles.footerLine}>{footer.bank}</Text>}
    </View>
  )
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

function istLogoPdfKompatibel(url) {
  if (!url) return false
  const ohneQuery = url.split('?')[0].toLowerCase()
  if (ohneQuery.endsWith('.svg')) return false
  return ohneQuery.endsWith('.png') || ohneQuery.endsWith('.jpg') || ohneQuery.endsWith('.jpeg') || ohneQuery.endsWith('.webp')
}

async function erstellePdfBlobMitTimeout(element, timeoutMs = 15000) {
  const pdfPromise = pdf(element).toBlob()
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Die PDF-Erstellung hat zu lange gedauert.')), timeoutMs)
  })

  try {
    return await Promise.race([pdfPromise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId)
  }
}

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 42,
    paddingHorizontal: 44,
    fontSize: 10.5,
    color: '#1f2937',
  },
  layoutPage: {
    position: 'relative',
    padding: 0,
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
    textDecoration: 'underline',
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
    marginTop: 14,
    minHeight: 0,
  },
  empfaengerWrap: {
    position: 'absolute',
    left: 57,
    top: 128,
    width: 245,
  },
  infosWrap: {
    position: 'absolute',
    right: 44,
    top: 128,
    width: 190,
    alignItems: 'flex-end',
  },
  empfaengerTitle: {
    fontSize: 9,
    marginBottom: 4,
    color: '#374151',
  },
  line: {
    marginTop: 2,
  },
  firstAddressLine: {
    marginTop: 0,
    fontWeight: 700,
    color: '#111827',
  },
  infoLine: {
    fontSize: 10,
    marginTop: 4,
  },
  bodyText: {
    marginTop: 12,
    fontSize: 10.5,
    lineHeight: 1.35,
  },
  detailText: {
    marginTop: 8,
    fontSize: 10,
    color: '#4b5563',
  },
  rechnungTitle: {
    fontSize: 18,
    fontWeight: 700,
  },
  titleRule: {
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
  },
  table: {
    marginTop: 24,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    backgroundColor: '#f3f4f6',
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    marginTop: 5,
    marginBottom: 5,
  },
  lastTableRow: {
    borderBottomWidth: 0,
  },
  colPos: {
    width: '10%',
    paddingVertical: 1,
    paddingHorizontal: 8,
  },
  colBez: {
    width: '62%',
    paddingVertical: 1,
    paddingHorizontal: 8,
  },
  posTitel: {
    fontSize: 10.5,
    fontWeight: 700,
  },
  posBeschreibung: {
    marginTop: 0,
    fontSize: 10.5,
    color: '#6b7280',
  },
  colBetrag: {
    width: '28%',
    paddingVertical: 1,
    paddingHorizontal: 8,
    textAlign: 'right',
  },
  summaryLine: {
    marginTop: 18,
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
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  totalTitle: {
    fontSize: 12,
    fontWeight: 700,
  },
  totalValue: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: 700,
  },
  footer: {
    fontSize: 8,
    color: '#4b5563',
    textAlign: 'center',
    alignItems: 'center',
  },
  footerName: {
    fontWeight: 700,
    color: '#1f2937',
  },
  footerLine: {
    marginTop: 1,
  },
  faltlinie: {
    position: 'absolute',
    left: 6,
    width: 14,
    borderTopWidth: 1,
    borderTopColor: '#6b7280',
  },
  faltlinieOben: {
    top: 298,
  },
  faltlinieUnten: {
    top: 596,
  },
})

function RechnungPdf({ dokument, profil, kunde, positionen }) {
  const layout = resolvePdfLayout(getFeld(profil, ['pdf_layout']))
  const senderTop = Math.max(layout.margins.top, layout.recipient.y - 12)
  const logoUrl = getFeld(profil, ['logo_url'])
  const logoUrlPdf = istLogoPdfKompatibel(logoUrl) ? logoUrl : ''
  const hinweis = profil?.paragraph19
    ? 'Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.'
    : `Umsatzsteuer: ${formatEuro(getFeld(dokument, ['ust_betrag']))}`

  return (
    <Document>
      <Page size="A4" style={pdfStyles.layoutPage}>
        <View style={[pdfStyles.faltlinie, { top: layout.fold.topY }]} />
        <View style={[pdfStyles.faltlinie, { top: layout.fold.bottomY }]} />

        <Text style={[pdfStyles.senderLine, { position: 'absolute', left: layout.recipient.x, top: senderTop, width: Math.max(layout.recipient.w, layout.sender.w) }]}>
          {baueAdressZeileFirmenprofil(profil)}
        </Text>

        <View style={[pdfStyles.logoWrap, { position: 'absolute', left: layout.logo.x, top: layout.logo.y, width: layout.logo.w, height: layout.logo.h }]}>
            {logoUrlPdf ? (
              <Image src={logoUrlPdf} style={{ ...pdfStyles.logoImage, width: layout.logo.w, height: layout.logo.h }} />
            ) : getFeld(profil, ['name', 'inhaber']) ? (
              <>
                {getFeld(profil, ['name']) && <Text style={pdfStyles.logoTitle}>{getFeld(profil, ['name'])}</Text>}
                {getFeld(profil, ['inhaber']) && <Text style={pdfStyles.logoSub}>{getFeld(profil, ['inhaber'])}</Text>}
              </>
            ) : null}
        </View>

        <View style={pdfStyles.adressRow}>
          <View style={[pdfStyles.empfaengerWrap, { left: layout.recipient.x, top: layout.recipient.y, width: layout.recipient.w, minHeight: layout.recipient.h }]}>
            {baueKundenAdressZeilen(kunde).map((zeile, index) => (
              <Text key={`adr-${index}`} style={index === 0 ? pdfStyles.firstAddressLine : pdfStyles.line}>{zeile}</Text>
            ))}
          </View>

          <View style={[pdfStyles.infosWrap, { left: layout.meta.x, top: layout.meta.y, width: layout.meta.w, minHeight: layout.meta.h }]}>
            <Text style={pdfStyles.infoLine}>Datum: {formatDatumLang(getFeld(dokument, ['datum']))}</Text>
            <Text style={pdfStyles.infoLine}>Telefon: {getFeld(profil, ['telefon', 'phone']) || '—'}</Text>
            <Text style={pdfStyles.infoLine}>E-Mail: {getFeld(profil, ['email', 'e_mail']) || '—'}</Text>
          </View>
        </View>

        <View
          style={{
            position: 'absolute',
            left: layout.positionen.x,
            top: layout.positionen.y,
            width: layout.positionen.w,
            minHeight: layout.positionen.h,
          }}
        >
          <Text style={pdfStyles.rechnungTitle}>{dokumentTitel(dokument)}</Text>
          <View style={pdfStyles.titleRule} />
          {getFeld(dokument, ['einleitungstext']) && (
            <Text style={pdfStyles.bodyText}>{getFeld(dokument, ['einleitungstext'])}</Text>
          )}
          {sollLeistungszeitraumAnzeigen(dokument) && (
            <Text style={pdfStyles.detailText}>Leistungszeitraum: {getFeld(dokument, ['leistungszeitraum'])}</Text>
          )}

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
                <View style={pdfStyles.colBez}>
                  <Text style={pdfStyles.posTitel}>{getFeld(position, ['bezeichnung']) || '—'}</Text>
                  {getFeld(position, ['beschreibung']) && (
                    <Text style={pdfStyles.posBeschreibung}>{getFeld(position, ['beschreibung'])}</Text>
                  )}
                </View>
                <Text style={pdfStyles.colBetrag}>{formatEuro(getFeld(position, ['gesamt']))}</Text>
              </View>
            )
          })}
          </View>

          <View style={pdfStyles.summaryLine}>
            <Text style={pdfStyles.hint}>{hinweis}</Text>
          <View style={pdfStyles.totalWrap}>
              <Text style={pdfStyles.totalTitle}>Gesamtbetrag €:</Text>
              <Text style={pdfStyles.totalValue}>{formatEuro(getFeld(dokument, ['brutto_gesamt']))}</Text>
            </View>
          </View>
          {getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']) && (
            <Text style={pdfStyles.detailText}>
              Zahlungsziel: {getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days'])} Tage
            </Text>
          )}
          {getFeld(dokument, ['schlusstext']) && (
            <Text style={pdfStyles.bodyText}>{getFeld(dokument, ['schlusstext'])}</Text>
          )}
        </View>

        <View
          style={{
            position: 'absolute',
            left: layout.footer.x,
            top: layout.footer.y,
            width: layout.footer.w,
            minHeight: layout.footer.h,
          }}
        >
          <PdfFooter profil={profil} />
        </View>
      </Page>
    </Document>
  )
}

function RechnungPdfSafe({ dokument, profil, kunde, positionen }) {
  const hinweis = profil?.paragraph19
    ? 'Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.'
    : `Umsatzsteuer: ${formatEuro(getFeld(dokument, ['ust_betrag']))}`

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.senderLine}>{baueAdressZeileFirmenprofil(profil)}</Text>
          <View style={pdfStyles.logoWrap}>
            {getFeld(profil, ['name']) && <Text style={pdfStyles.logoTitle}>{getFeld(profil, ['name'])}</Text>}
            {getFeld(profil, ['inhaber']) && <Text style={pdfStyles.logoSub}>{getFeld(profil, ['inhaber'])}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          {baueKundenAdressZeilen(kunde).map((zeile, index) => (
            <Text key={`safe-adr-${index}`} style={index === 0 ? pdfStyles.firstAddressLine : pdfStyles.line}>{zeile}</Text>
          ))}
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={pdfStyles.infoLine}>Datum: {formatDatumLang(getFeld(dokument, ['datum']))}</Text>
          <Text style={pdfStyles.infoLine}>Telefon: {getFeld(profil, ['telefon', 'phone']) || '—'}</Text>
          <Text style={pdfStyles.infoLine}>E-Mail: {getFeld(profil, ['email', 'e_mail']) || '—'}</Text>
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={pdfStyles.rechnungTitle}>{dokumentTitel(dokument)}</Text>
          <View style={pdfStyles.titleRule} />
        </View>
        {getFeld(dokument, ['einleitungstext']) && (
          <Text style={pdfStyles.bodyText}>{getFeld(dokument, ['einleitungstext'])}</Text>
        )}
        {sollLeistungszeitraumAnzeigen(dokument) && (
          <Text style={pdfStyles.detailText}>Leistungszeitraum: {getFeld(dokument, ['leistungszeitraum'])}</Text>
        )}

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
                key={position.id ?? `safe-${index}-${position.bezeichnung}`}
                style={[pdfStyles.tableRow, istLetzte ? pdfStyles.lastTableRow : null]}
              >
                <Text style={pdfStyles.colPos}>{position.reihenfolge ?? index + 1}</Text>
                <View style={pdfStyles.colBez}>
                  <Text style={pdfStyles.posTitel}>{getFeld(position, ['bezeichnung']) || '—'}</Text>
                  {getFeld(position, ['beschreibung']) && (
                    <Text style={pdfStyles.posBeschreibung}>{getFeld(position, ['beschreibung'])}</Text>
                  )}
                </View>
                <Text style={pdfStyles.colBetrag}>{formatEuro(getFeld(position, ['gesamt']))}</Text>
              </View>
            )
          })}
        </View>

        <View style={pdfStyles.summaryLine}>
          <Text style={pdfStyles.hint}>{hinweis}</Text>
          <View style={pdfStyles.totalWrap}>
            <Text style={pdfStyles.totalTitle}>Gesamtbetrag €:</Text>
            <Text style={pdfStyles.totalValue}>{formatEuro(getFeld(dokument, ['brutto_gesamt']))}</Text>
          </View>
        </View>
        {getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']) && (
          <Text style={pdfStyles.detailText}>
            Zahlungsziel: {getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days'])} Tage
          </Text>
        )}
        {getFeld(dokument, ['schlusstext']) && (
          <Text style={pdfStyles.bodyText}>{getFeld(dokument, ['schlusstext'])}</Text>
        )}

        <View style={{ marginTop: 24 }}>
          <PdfFooter profil={profil} />
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
  const [pdfFehler, setPdfFehler] = useState('')
  const [statusSpeichern, setStatusSpeichern] = useState(false)

  const brutto = useMemo(() => getFeld(dokument, ['brutto_gesamt']), [dokument])

  const ladeDokument = useCallback(async function ladeDokument() {
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
  }, [id])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      ladeDokument()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [ladeDokument])

  async function pdfHerunterladen() {
    if (!dokument || !profil || !kunde || pdfLaden) return
    setPdfLaden(true)
    setPdfFehler('')

    try {
      let blob = null
      let layoutFehler = null

      try {
        blob = await erstellePdfBlobMitTimeout(
          <RechnungPdf
            dokument={dokument}
            profil={profil}
            kunde={kunde}
            positionen={positionen}
          />,
          20000,
        )
      } catch (err) {
        layoutFehler = err
      }

      if (!blob || !(blob instanceof Blob) || blob.size === 0) {
        blob = await erstellePdfBlobMitTimeout(
          <RechnungPdfSafe
            dokument={dokument}
            profil={profil}
            kunde={kunde}
            positionen={positionen}
          />,
        )
      }

      if (!blob || !(blob instanceof Blob) || blob.size === 0) {
        throw layoutFehler || new Error('PDF konnte nicht erstellt werden.')
      }

      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      const dateiname = `${getFeld(dokument, ['nummer']) || 'rechnung'}.pdf`

      link.href = url
      link.download = dateiname
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setPdfFehler(err?.message || 'PDF konnte nicht erstellt werden.')
    } finally {
      setPdfLaden(false)
    }
  }

  async function statusAendern(neuerStatus) {
    if (!dokument?.id || statusSpeichern) return
    setStatusSpeichern(true)
    setFehler('')

    try {
      const { error } = await supabase.from('dokumente').update({ status: neuerStatus }).eq('id', dokument.id)
      if (error) throw error
      setDokument((alt) => ({ ...alt, status: neuerStatus }))
    } catch (err) {
      setFehler(err.message || 'Status konnte nicht gespeichert werden.')
    } finally {
      setStatusSpeichern(false)
    }
  }

  async function dokumentStornieren() {
    if (!window.confirm('Dokument stornieren? Es wird nicht gelöscht, sondern auf Storniert gesetzt.')) return
    await statusAendern('Storniert')
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
            <button
              type="button"
              onClick={dokumentStornieren}
              disabled={laden || statusSpeichern || !dokument || getFeld(dokument, ['status']) === 'Storniert'}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-60 transition-colors"
            >
              Stornieren
            </button>
          </div>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl p-6">
          {laden && <p className="text-sm text-gray-500">Dokument wird geladen...</p>}
          {!laden && fehler && <p className="text-sm text-red-600">{fehler}</p>}
          {!laden && !fehler && pdfFehler && <p className="text-sm text-red-600">{pdfFehler}</p>}

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
                <label className="text-gray-700">
                  Status:
                  <select
                    value={getFeld(dokument, ['status']) || 'Entwurf'}
                    onChange={(e) => statusAendern(e.target.value)}
                    disabled={statusSpeichern}
                    className="ml-2 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                  >
                    {statusOptionen.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              </div>

              {(getFeld(dokument, ['einleitungstext']) || getFeld(dokument, ['leistungszeitraum']) || getFeld(dokument, ['schlusstext'])) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  {getFeld(dokument, ['einleitungstext']) && <p>{getFeld(dokument, ['einleitungstext'])}</p>}
                  {getFeld(dokument, ['leistungszeitraum']) && <p>Leistungszeitraum: {getFeld(dokument, ['leistungszeitraum'])}</p>}
                  {getFeld(dokument, ['schlusstext']) && <p>{getFeld(dokument, ['schlusstext'])}</p>}
                </div>
              )}

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
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900">{getFeld(position, ['bezeichnung']) || '—'}</p>
                          {getFeld(position, ['beschreibung']) && (
                            <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">
                              {getFeld(position, ['beschreibung'])}
                            </p>
                          )}
                          {getFeld(position, ['interne_notiz']) && (
                            <div className="mt-2 rounded-md border border-gray-200 bg-gray-100 px-2 py-2">
                              <p className="text-[11px] font-medium text-gray-600 mb-1">
                                Interne Notiz - nicht auf Rechnung sichtbar
                              </p>
                              <p className="text-xs text-gray-700 whitespace-pre-wrap">
                                {getFeld(position, ['interne_notiz'])}
                              </p>
                            </div>
                          )}
                        </td>
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

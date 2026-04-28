import { useCallback, useEffect, useMemo, useState } from 'react'
import { Document, Page, StyleSheet, Text, View, Image, pdf } from '@react-pdf/renderer'
import {
  AlignmentType,
  Document as WordDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { resolvePdfLayout } from '../lib/pdfLayout'
import { getFeld } from '../lib/utils'

const statusOptionen = ['Entwurf', 'Versendet', 'Teilbezahlt', 'Bezahlt', 'Überfällig', 'Angenommen', 'Abgelehnt', 'Abgelaufen', 'Storniert']

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

function berechneFaelligkeitsdatum(datumWert, zahlungszielTage) {
  const tage = Number(zahlungszielTage)
  if (!datumWert || !Number.isFinite(tage) || tage < 0) return ''
  const basis = new Date(datumWert)
  if (Number.isNaN(basis.getTime())) return ''
  basis.setDate(basis.getDate() + tage)
  return basis.toISOString().slice(0, 10)
}

function resolveFaelligkeitsdatum(dokument, profil) {
  const direkt = getFeld(dokument, ['faelligkeitsdatum', 'faellig_am', 'due_date'])
  if (direkt) return direkt
  return berechneFaelligkeitsdatum(
    getFeld(dokument, ['datum']),
    getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']),
  )
}

function truncateText(wert, maxLen) {
  const text = String(wert || '').trim()
  if (!text) return ''
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

function buildEpcPayload(dokument, profil) {
  const iban = truncateText(getFeld(profil, ['iban']), 34).replace(/\s+/g, '')
  const empfaenger = truncateText(getFeld(profil, ['name']) || getFeld(profil, ['inhaber']), 70)
  if (!iban || !empfaenger) return ''

  const bic = truncateText(getFeld(profil, ['bic']), 11)
  const betrag = Number(getFeld(dokument, ['brutto_gesamt']) || 0)
  const euroBetrag = Number.isFinite(betrag) && betrag > 0 ? `EUR${betrag.toFixed(2)}` : ''
  const verwendungszweck = truncateText(getFeld(dokument, ['nummer']) || '', 35)

  return [
    'BCD',
    '002',
    '1',
    'SCT',
    bic,
    empfaenger,
    iban,
    euroBetrag,
    '',
    verwendungszweck,
    '',
    '',
  ].join('\n')
}

function buildEpcQrUrl(dokument, profil) {
  if (getFeld(dokument, ['typ']) !== 'Rechnung') return ''
  const payload = buildEpcPayload(dokument, profil)
  if (!payload) return ''
  return `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(payload)}`
}

function toDecimal(wert) {
  const normalisiert = String(wert ?? '').replace(',', '.').trim()
  const nummer = Number(normalisiert)
  return Number.isFinite(nummer) ? nummer : 0
}

function istGueltigerBetragEingabe(wert) {
  const normalisiert = String(wert ?? '').trim().replace(',', '.')
  return /^\d+(\.\d{1,2})?$/.test(normalisiert)
}

function findeOptionaleSpalte(kandidaten, daten) {
  if (!daten) return null
  return kandidaten.find((spalte) => Object.prototype.hasOwnProperty.call(daten, spalte)) || null
}

function positionIstAufAnfrage(position) {
  const einzelpreis = position?.einzelpreis
  return einzelpreis === null || einzelpreis === undefined || String(einzelpreis).trim() === ''
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
  const ustId = getFeld(profil, ['ust_id', 'ustid', 'ustidnr', 'umsatzsteuer_id'])
  const steuerKennzeichen = ustId
    ? `USt-ID: ${ustId}`
    : (getFeld(profil, ['steuernummer']) ? `Steuernummer: ${getFeld(profil, ['steuernummer'])}` : '')

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
      steuerKennzeichen,
    ].filter(Boolean).join(' · '),
    bank: [
      getFeld(profil, ['bank']) ? `Bank: ${getFeld(profil, ['bank'])}` : '',
      getFeld(profil, ['iban']) ? `IBAN: ${getFeld(profil, ['iban'])}` : '',
      getFeld(profil, ['bic']) ? `BIC: ${getFeld(profil, ['bic'])}` : '',
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
  const epcQrUrl = buildEpcQrUrl(dokument, profil)

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
            {getFeld(dokument, ['typ']) === 'Rechnung' && resolveFaelligkeitsdatum(dokument, profil) && (
              <Text style={pdfStyles.infoLine}>
                Fälligkeitsdatum: {formatDatumLang(
                  resolveFaelligkeitsdatum(dokument, profil),
                )}
              </Text>
            )}
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
                <Text style={pdfStyles.colBetrag}>
                  {positionIstAufAnfrage(position) ? 'Auf Anfrage' : formatEuro(getFeld(position, ['gesamt']))}
                </Text>
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
              {berechneFaelligkeitsdatum(
                getFeld(dokument, ['datum']),
                getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']),
              )
                ? ` (fällig am ${formatDatum(
                  berechneFaelligkeitsdatum(
                    getFeld(dokument, ['datum']),
                    getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']),
                  ),
                )})`
                : ''}
            </Text>
          )}
          {getFeld(dokument, ['schlusstext']) && (
            <Text style={pdfStyles.bodyText}>{getFeld(dokument, ['schlusstext'])}</Text>
          )}
          {epcQrUrl && (
            <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
              <Text style={pdfStyles.detailText}>SEPA-QR-Code (EPC)</Text>
              <Image src={epcQrUrl} style={{ width: 94, height: 94, marginTop: 4 }} />
            </View>
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
  const epcQrUrl = buildEpcQrUrl(dokument, profil)

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
          {getFeld(dokument, ['typ']) === 'Rechnung' && resolveFaelligkeitsdatum(dokument, profil) && (
            <Text style={pdfStyles.infoLine}>
              Fälligkeitsdatum: {formatDatumLang(
                resolveFaelligkeitsdatum(dokument, profil),
              )}
            </Text>
          )}
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
                <Text style={pdfStyles.colBetrag}>
                  {positionIstAufAnfrage(position) ? 'Auf Anfrage' : formatEuro(getFeld(position, ['gesamt']))}
                </Text>
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
            {berechneFaelligkeitsdatum(
              getFeld(dokument, ['datum']),
              getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']),
            )
              ? ` (fällig am ${formatDatum(
                berechneFaelligkeitsdatum(
                  getFeld(dokument, ['datum']),
                  getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']),
                ),
              )})`
              : ''}
          </Text>
        )}
        {getFeld(dokument, ['schlusstext']) && (
          <Text style={pdfStyles.bodyText}>{getFeld(dokument, ['schlusstext'])}</Text>
        )}
        {epcQrUrl && (
          <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
            <Text style={pdfStyles.detailText}>SEPA-QR-Code (EPC)</Text>
            <Image src={epcQrUrl} style={{ width: 94, height: 94, marginTop: 4 }} />
          </View>
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
  const navigate = useNavigate()
  const [dokument, setDokument] = useState(null)
  const [profil, setProfil] = useState(null)
  const [kunde, setKunde] = useState(null)
  const [positionen, setPositionen] = useState([])
  const [laden, setLaden] = useState(true)
  const [pdfLaden, setPdfLaden] = useState(false)
  const [wordLaden, setWordLaden] = useState(false)
  const [pdfVorschauLaden, setPdfVorschauLaden] = useState(false)
  const [pdfVorschauUrl, setPdfVorschauUrl] = useState('')
  const [mailSenden, setMailSenden] = useState(false)
  const [mailEmpfaenger, setMailEmpfaenger] = useState('')
  const [mailBetreff, setMailBetreff] = useState('')
  const [mailText, setMailText] = useState('')
  const [fehler, setFehler] = useState('')
  const [pdfFehler, setPdfFehler] = useState('')
  const [erfolg, setErfolg] = useState('')
  const [statusSpeichern, setStatusSpeichern] = useState(false)
  const [zahlungSpeichern, setZahlungSpeichern] = useState(false)
  const [zahlungBetrag, setZahlungBetrag] = useState('')
  const [zahlungDatum, setZahlungDatum] = useState(new Date().toISOString().slice(0, 10))
  const [zahlungshistorie, setZahlungshistorie] = useState([])
  const [zahlungshistorieVerfuegbar, setZahlungshistorieVerfuegbar] = useState(true)
  const [serieSpeichern, setSerieSpeichern] = useState(false)
  const [serieAktiv, setSerieAktiv] = useState(false)
  const [serieIntervallTage, setSerieIntervallTage] = useState('30')
  const [serieNaechstesDatum, setSerieNaechstesDatum] = useState(new Date().toISOString().slice(0, 10))

  const brutto = useMemo(() => getFeld(dokument, ['brutto_gesamt']), [dokument])
  const zahlungsbetragSpalte = useMemo(
    () => findeOptionaleSpalte(['bezahlt_betrag', 'zahlung_betrag', 'paid_amount'], dokument),
    [dokument],
  )
  const zahlungsdatumSpalte = useMemo(
    () => findeOptionaleSpalte(['zahlungsdatum', 'zahlungseingang_datum', 'paid_at'], dokument),
    [dokument],
  )
  const serieAktivSpalte = useMemo(
    () => findeOptionaleSpalte(['wiederholung_aktiv', 'serien_aktiv', 'recurring_active'], dokument),
    [dokument],
  )
  const serieIntervallSpalte = useMemo(
    () => findeOptionaleSpalte(['wiederholung_intervall_tage', 'serien_intervall_tage', 'recurring_interval_days'], dokument),
    [dokument],
  )
  const serieNaechstesSpalte = useMemo(
    () => findeOptionaleSpalte(['wiederholung_naechste_faelligkeit', 'serien_naechstes_datum', 'recurring_next_date'], dokument),
    [dokument],
  )
  const gezahlt = useMemo(() => toDecimal(zahlungsbetragSpalte ? dokument?.[zahlungsbetragSpalte] : 0), [dokument, zahlungsbetragSpalte])
  const offen = useMemo(() => Math.max(0, toDecimal(brutto) - gezahlt), [brutto, gezahlt])
  const istRechnung = getFeld(dokument, ['typ']) === 'Rechnung'
  const zahlungszielTage = getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days'])
  const faelligkeitsdatum = useMemo(
    () => resolveFaelligkeitsdatum(dokument, profil),
    [dokument, profil, zahlungszielTage],
  )

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

      const [
        { data: profilData, error: profilError },
        { data: kundeData, error: kundeError },
        { data: positionenData, error: positionenError },
        zahlungenResult,
      ] =
        await Promise.all([
          supabase.from('firmenprofile').select('*').eq('id', dokumentData.firmenprofil_id).single(),
          supabase.from('kunden').select('*').eq('id', dokumentData.kunde_id).single(),
          supabase.from('positionen').select('*').eq('dokument_id', id).order('reihenfolge'),
          supabase
            .from('zahlungen')
            .select('id, dokument_id, betrag, zahlungsdatum, notiz, created_at')
            .eq('dokument_id', id)
            .order('zahlungsdatum', { ascending: false }),
        ])

      if (profilError) throw profilError
      if (kundeError) throw kundeError
      if (positionenError) throw positionenError

      setDokument(dokumentData)
      setProfil(profilData ?? null)
      setKunde(kundeData ?? null)
      setPositionen(positionenData ?? [])
      if (zahlungenResult?.error) {
        setZahlungshistorieVerfuegbar(false)
        setZahlungshistorie([])
      } else {
        setZahlungshistorieVerfuegbar(true)
        setZahlungshistorie(zahlungenResult?.data ?? [])
      }
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

  useEffect(() => {
    if (!dokument) return
    setSerieAktiv(Boolean(serieAktivSpalte ? dokument?.[serieAktivSpalte] : false))
    setSerieIntervallTage(String(serieIntervallSpalte ? dokument?.[serieIntervallSpalte] ?? 30 : 30))
    setSerieNaechstesDatum(String(serieNaechstesSpalte ? dokument?.[serieNaechstesSpalte] ?? new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)).slice(0, 10))
  }, [dokument, serieAktivSpalte, serieIntervallSpalte, serieNaechstesSpalte])

  useEffect(() => {
    if (!dokument || !kunde) return
    setMailEmpfaenger(getFeld(kunde, ['email', 'e_mail']) || '')
    setMailBetreff(`${getFeld(dokument, ['typ']) || 'Dokument'} ${getFeld(dokument, ['nummer']) || ''}`.trim())
    setMailText('Anbei erhalten Sie das Dokument als PDF.\n\nViele Grüße')
  }, [dokument, kunde])

  useEffect(() => () => {
    if (pdfVorschauUrl) {
      URL.revokeObjectURL(pdfVorschauUrl)
    }
  }, [pdfVorschauUrl])

  useEffect(() => {
    function onKeyDown(event) {
      const isMeta = event.metaKey || event.ctrlKey
      if (!isMeta) return
      const key = String(event.key || '').toLowerCase()
      if (key === 'p') {
        event.preventDefault()
        druckansichtOeffnen()
      }
      if (key === 'n') {
        event.preventDefault()
        navigate('/dokumente/neu')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, dokument, profil, kunde, pdfVorschauLaden])

  async function erstelleRechnungsPdfBlob() {
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
    return blob
  }

  async function pdfHerunterladen() {
    if (!dokument || !profil || !kunde || pdfLaden) return
    setPdfLaden(true)
    setPdfFehler('')

    try {
      const blob = await erstelleRechnungsPdfBlob()

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

  async function pdfVorschauAnzeigen() {
    if (!dokument || !profil || !kunde || pdfVorschauLaden) return
    setPdfVorschauLaden(true)
    setPdfFehler('')
    try {
      const blob = await erstelleRechnungsPdfBlob()
      if (pdfVorschauUrl) URL.revokeObjectURL(pdfVorschauUrl)
      setPdfVorschauUrl(URL.createObjectURL(blob))
    } catch (err) {
      setPdfFehler(err?.message || 'PDF-Vorschau konnte nicht erstellt werden.')
    } finally {
      setPdfVorschauLaden(false)
    }
  }

  async function druckansichtOeffnen() {
    if (!dokument || !profil || !kunde || pdfVorschauLaden) return
    setPdfVorschauLaden(true)
    setPdfFehler('')
    try {
      const blob = await erstelleRechnungsPdfBlob()
      const url = URL.createObjectURL(blob)
      const druckFenster = window.open(url, '_blank', 'noopener,noreferrer')
      if (!druckFenster) {
        URL.revokeObjectURL(url)
        throw new Error('Druckansicht konnte nicht geöffnet werden (Popup blockiert).')
      }
      window.setTimeout(() => {
        try {
          druckFenster.print()
        } catch {
          // Browser-abhängig: Druck kann ggf. manuell ausgelöst werden.
        }
      }, 400)
      window.setTimeout(() => URL.revokeObjectURL(url), 45000)
    } catch (err) {
      setPdfFehler(err.message || 'Druckansicht konnte nicht geöffnet werden.')
    } finally {
      setPdfVorschauLaden(false)
    }
  }

  function pdfVorschauSchliessen() {
    if (pdfVorschauUrl) {
      URL.revokeObjectURL(pdfVorschauUrl)
    }
    setPdfVorschauUrl('')
  }

  async function dokumentPerMailSenden() {
    if (!dokument || !profil || !kunde || mailSenden) return
    if (!mailEmpfaenger.trim()) {
      setFehler('Bitte einen Empfänger für den E-Mail-Versand eingeben.')
      return
    }

    setMailSenden(true)
    setFehler('')
    setErfolg('')
    try {
      const blob = await erstelleRechnungsPdfBlob()
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i])
      }
      const pdfBase64 = btoa(binary)

      const { error } = await supabase.functions.invoke('send-document-mail', {
        body: {
          to: mailEmpfaenger.trim(),
          subject: mailBetreff || `${getFeld(dokument, ['typ']) || 'Dokument'} ${getFeld(dokument, ['nummer']) || ''}`.trim(),
          text: mailText || '',
          filename: `${getFeld(dokument, ['nummer']) || 'dokument'}.pdf`,
          pdfBase64,
        },
      })
      if (error) throw error

      setErfolg('E-Mail wurde erfolgreich versendet.')
    } catch (err) {
      setFehler(err?.message || 'E-Mail konnte nicht versendet werden.')
    } finally {
      setMailSenden(false)
    }
  }

  async function statusAendern(neuerStatus) {
    if (!dokument?.id || statusSpeichern) return
    const aktuellerStatus = getFeld(dokument, ['status']) || 'Entwurf'
    if (neuerStatus === 'Storniert' && aktuellerStatus !== 'Storniert') {
      const bestaetigt = window.confirm('Status wirklich auf "Storniert" setzen?')
      if (!bestaetigt) return
    }
    setStatusSpeichern(true)
    setFehler('')
    setErfolg('')

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

  async function wordHerunterladen() {
    if (!dokument || !profil || !kunde || wordLaden) return
    setWordLaden(true)
    setFehler('')
    try {
      const docTitle = `${getFeld(dokument, ['typ']) || 'Dokument'} ${getFeld(dokument, ['nummer']) || ''}`.trim()
      const kundenName = getFeld(kunde, ['firma', 'name', 'unternehmen']) || '—'
      const ustHinweis = profil?.paragraph19
        ? 'Nach § 19 Abs. 1 UStG wird keine Umsatzsteuer berechnet.'
        : `USt-Betrag: ${formatEuro(getFeld(dokument, ['ust_betrag']))}`

      const tableRows = [
        new TableRow({
          children: [
            new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: 'Pos.' })] }),
            new TableCell({ width: { size: 60, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: 'Bezeichnung' })] }),
            new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ text: 'Gesamtpreis', alignment: AlignmentType.RIGHT })] }),
          ],
        }),
        ...positionen.map((position, index) => new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(String(position.reihenfolge ?? index + 1))] }),
            new TableCell({
              children: [
                new Paragraph(getFeld(position, ['bezeichnung']) || '—'),
                ...(getFeld(position, ['beschreibung'])
                  ? [new Paragraph({ text: getFeld(position, ['beschreibung']), spacing: { before: 80 } })]
                  : []),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  text: positionIstAufAnfrage(position) ? 'Auf Anfrage' : formatEuro(getFeld(position, ['gesamt'])),
                  alignment: AlignmentType.RIGHT,
                }),
              ],
            }),
          ],
        })),
      ]

      const wordDoc = new WordDocument({
        sections: [{
          properties: {},
          children: [
            new Paragraph({ text: getFeld(profil, ['name']) || '', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: docTitle, heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 200 } }),
            new Paragraph({ text: `Datum: ${formatDatum(getFeld(dokument, ['datum']))}` }),
            new Paragraph({ text: `Kunde: ${kundenName}` }),
            ...(getFeld(dokument, ['leistungszeitraum'])
              ? [new Paragraph({ text: `Leistungszeitraum: ${getFeld(dokument, ['leistungszeitraum'])}` })]
              : []),
            ...(getFeld(dokument, ['einleitungstext'])
              ? [new Paragraph({ text: getFeld(dokument, ['einleitungstext']), spacing: { before: 160 } })]
              : []),
            new Paragraph({ text: '' }),
            new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
            new Paragraph({ text: '', spacing: { before: 200 } }),
            new Paragraph({ text: ustHinweis }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: `Gesamtbetrag: ${formatEuro(brutto)}`, bold: true })],
            }),
            ...(getFeld(dokument, ['schlusstext'])
              ? [new Paragraph({ text: getFeld(dokument, ['schlusstext']), spacing: { before: 160 } })]
              : []),
          ],
        }],
      })

      const blob = await Packer.toBlob(wordDoc)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      const dateiname = `${getFeld(dokument, ['nummer']) || 'dokument'}.docx`
      link.href = url
      link.download = dateiname
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setFehler(err?.message || 'Word-Dokument konnte nicht erstellt werden.')
    } finally {
      setWordLaden(false)
    }
  }

  async function zahlungErfassen() {
    if (!dokument?.id || zahlungSpeichern) return
    if (!istRechnung) return
    setErfolg('')
    if (!zahlungsbetragSpalte) {
      setFehler('Zahlungsspalte fehlt in der Datenbank (bezahlt_betrag/zahlung_betrag/paid_amount).')
      return
    }

    if (!istGueltigerBetragEingabe(zahlungBetrag)) {
      setFehler('Bitte Betrag im Format 1234,56 oder 1234.56 eingeben.')
      return
    }

    const betragNeu = toDecimal(zahlungBetrag)
    if (betragNeu <= 0) {
      setFehler('Bitte einen Zahlungsbetrag größer 0 eingeben.')
      return
    }
    if (betragNeu > offen) {
      setFehler(`Der Betrag überschreitet den offenen Betrag (${formatEuro(offen)}).`)
      return
    }

    setZahlungSpeichern(true)
    setFehler('')
    try {
      const neuerGezahltWert = Math.min(toDecimal(brutto), gezahlt + betragNeu)
      let neuerStatus = getFeld(dokument, ['status']) || 'Entwurf'
      if (neuerGezahltWert <= 0) {
        neuerStatus = 'Versendet'
      } else if (neuerGezahltWert < toDecimal(brutto)) {
        neuerStatus = 'Teilbezahlt'
      } else {
        neuerStatus = 'Bezahlt'
      }

      const payload = {
        [zahlungsbetragSpalte]: neuerGezahltWert,
        status: neuerStatus,
      }
      if (zahlungsdatumSpalte) {
        payload[zahlungsdatumSpalte] = zahlungDatum || null
      }

      const { error } = await supabase.from('dokumente').update(payload).eq('id', dokument.id)
      if (error) throw error

      if (zahlungshistorieVerfuegbar) {
        const { data: zahlungRow, error: zahlungError } = await supabase
          .from('zahlungen')
          .insert({
            dokument_id: dokument.id,
            betrag: betragNeu,
            zahlungsdatum: zahlungDatum || new Date().toISOString().slice(0, 10),
          })
          .select('id, dokument_id, betrag, zahlungsdatum, notiz, created_at')
          .single()
        if (zahlungError) {
          setZahlungshistorieVerfuegbar(false)
        } else if (zahlungRow) {
          setZahlungshistorie((alt) => [zahlungRow, ...alt])
        }
      }

      setDokument((alt) => ({
        ...alt,
        ...payload,
      }))
      setZahlungBetrag('')
      setErfolg(`Zahlung über ${formatEuro(betragNeu)} wurde erfasst.`)
    } catch (err) {
      setFehler(err.message || 'Zahlung konnte nicht gespeichert werden.')
    } finally {
      setZahlungSpeichern(false)
    }
  }

  async function serieSpeichernHandler() {
    if (!dokument?.id || serieSpeichern) return
    if (!istRechnung) return
    if (!serieAktivSpalte || !serieIntervallSpalte || !serieNaechstesSpalte) {
      setFehler('Serien-Felder fehlen in der Datenbank. Bitte Migration ausführen.')
      return
    }

    const intervall = Number(serieIntervallTage)
    if (!Number.isFinite(intervall) || intervall < 1) {
      setFehler('Intervall muss mindestens 1 Tag sein.')
      return
    }
    if (!serieNaechstesDatum) {
      setFehler('Bitte ein nächstes Erstellungsdatum wählen.')
      return
    }

    setSerieSpeichern(true)
    setFehler('')
    setErfolg('')
    try {
      const payload = {
        [serieAktivSpalte]: serieAktiv,
        [serieIntervallSpalte]: intervall,
        [serieNaechstesSpalte]: serieNaechstesDatum,
      }
      const { error } = await supabase.from('dokumente').update(payload).eq('id', dokument.id)
      if (error) throw error
      setDokument((alt) => ({ ...alt, ...payload }))
      setErfolg('Serienrechnung gespeichert.')
    } catch (err) {
      setFehler(err.message || 'Serienrechnung konnte nicht gespeichert werden.')
    } finally {
      setSerieSpeichern(false)
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
            <button
              type="button"
              onClick={pdfVorschauAnzeigen}
              disabled={laden || pdfVorschauLaden || !dokument}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
            >
              {pdfVorschauLaden ? 'Vorschau lädt...' : 'PDF Vorschau'}
            </button>
            <button
              type="button"
              onClick={druckansichtOeffnen}
              disabled={laden || pdfVorschauLaden || !dokument}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
            >
              {pdfVorschauLaden ? 'Öffnet...' : 'Drucken'}
            </button>
            <button
              type="button"
              onClick={wordHerunterladen}
              disabled={laden || wordLaden || !dokument}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
            >
              {wordLaden ? 'Word wird erstellt...' : 'Word herunterladen'}
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
          {!laden && !fehler && erfolg && <p className="text-sm text-green-700">{erfolg}</p>}
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
                {istRechnung && (
                  <p className="text-gray-700">
                    Fällig am:{' '}
                    <span className="font-semibold text-gray-900">
                      {faelligkeitsdatum ? formatDatum(faelligkeitsdatum) : '—'}
                    </span>
                  </p>
                )}
                {getFeld(dokument, ['typ']) === 'Angebot' && (
                  <p className="text-gray-700">
                    Gültig bis:{' '}
                    <span className="font-semibold text-gray-900">
                      {formatDatum(getFeld(dokument, ['angebot_gueltig_bis', 'gueltig_bis', 'valid_until']))}
                    </span>
                  </p>
                )}
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
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {positionIstAufAnfrage(position) ? 'Auf Anfrage' : formatEuro(getFeld(position, ['gesamt']))}
                        </td>
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

              {istRechnung && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <p className="text-gray-700">
                      Bereits bezahlt: <span className="font-semibold text-gray-900">{formatEuro(gezahlt)}</span>
                    </p>
                    <p className="text-gray-700">
                      Offen: <span className="font-semibold text-gray-900">{formatEuro(offen)}</span>
                    </p>
                    {zahlungsdatumSpalte && (
                      <p className="text-gray-700">
                        Letzter Zahlungseingang:{' '}
                        <span className="font-semibold text-gray-900">
                          {formatDatum(dokument?.[zahlungsdatumSpalte])}
                        </span>
                      </p>
                    )}
                  </div>

                  {getFeld(dokument, ['status']) !== 'Storniert' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <label className="text-sm text-gray-700 md:col-span-2">
                        Zahlungseingang (Betrag)
                        <input
                          type="text"
                          inputMode="decimal"
                          value={zahlungBetrag}
                          onChange={(e) => setZahlungBetrag(e.target.value)}
                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                          placeholder="z. B. 250,00"
                        />
                      </label>
                      <label className="text-sm text-gray-700">
                        Zahlungsdatum
                        <input
                          type="date"
                          value={zahlungDatum}
                          onChange={(e) => setZahlungDatum(e.target.value)}
                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={zahlungErfassen}
                        disabled={zahlungSpeichern || !zahlungsbetragSpalte}
                        className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                      >
                        {zahlungSpeichern ? 'Speichert...' : 'Zahlung erfassen'}
                      </button>
                    </div>
                  )}

                  {zahlungshistorieVerfuegbar && (
                    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
                      <table className="min-w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">Datum</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold tracking-wide text-gray-600 uppercase">Betrag</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {zahlungshistorie.length === 0 && (
                            <tr>
                              <td colSpan={2} className="px-4 py-3 text-sm text-gray-500">Noch keine Teilzahlungen erfasst.</td>
                            </tr>
                          )}
                          {zahlungshistorie.map((eintrag) => (
                            <tr key={eintrag.id}>
                              <td className="px-4 py-2 text-sm text-gray-700">{formatDatum(eintrag.zahlungsdatum)}</td>
                              <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">{formatEuro(eintrag.betrag)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {istRechnung && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-800">Wiederkehrende Rechnung</p>
                  {!serieAktivSpalte || !serieIntervallSpalte || !serieNaechstesSpalte ? (
                    <p className="text-sm text-amber-700">
                      Serien-Felder fehlen in der Datenbank. Bitte SQL-Migration ausführen.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={serieAktiv}
                          onChange={(e) => setSerieAktiv(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-[#185FA5] focus:ring-[#185FA5]"
                        />
                        Aktiv
                      </label>
                      <label className="text-sm text-gray-700">
                        Intervall (Tage)
                        <input
                          type="number"
                          min="1"
                          value={serieIntervallTage}
                          onChange={(e) => setSerieIntervallTage(e.target.value)}
                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                        />
                      </label>
                      <label className="text-sm text-gray-700">
                        Nächstes Datum
                        <input
                          type="date"
                          value={serieNaechstesDatum}
                          onChange={(e) => setSerieNaechstesDatum(e.target.value)}
                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={serieSpeichernHandler}
                        disabled={serieSpeichern}
                        className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                      >
                        {serieSpeichern ? 'Speichert...' : 'Serie speichern'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-800">Dokument per E-Mail senden</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-sm text-gray-700 md:col-span-1">
                    Empfänger
                    <input
                      type="email"
                      value={mailEmpfaenger}
                      onChange={(e) => setMailEmpfaenger(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                      placeholder="kunde@beispiel.de"
                    />
                  </label>
                  <label className="text-sm text-gray-700 md:col-span-2">
                    Betreff
                    <input
                      type="text"
                      value={mailBetreff}
                      onChange={(e) => setMailBetreff(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    />
                  </label>
                  <label className="text-sm text-gray-700 md:col-span-3">
                    Nachricht
                    <textarea
                      rows={4}
                      value={mailText}
                      onChange={(e) => setMailText(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={dokumentPerMailSenden}
                    disabled={mailSenden || !dokument}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                  >
                    {mailSenden ? 'Senden...' : 'E-Mail senden'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {pdfVorschauUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8">
          <div className="bg-white rounded-xl w-full h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <p className="text-sm font-medium text-gray-800">PDF Vorschau</p>
              <button
                type="button"
                onClick={pdfVorschauSchliessen}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Schließen
              </button>
            </div>
            <iframe title="PDF Vorschau" src={pdfVorschauUrl} className="w-full h-full" />
          </div>
        </div>
      )}
    </div>
  )
}


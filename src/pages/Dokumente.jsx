import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { formatiereBetrag, formatiereDatum, getFeld } from '../lib/utils'

const dokumentConfig = {
  Rechnung: { defaultPrefix: 'R', nummerFeld: 'rechnung_nummer', prefixFeld: 'rechnung_prefix' },
  Mahnung: { defaultPrefix: 'M', nummerFeld: 'mahnung_nummer', prefixFeld: 'mahnung_prefix' },
}

function findeOptionaleSpalte(kandidaten, daten) {
  if (!daten) return null
  return kandidaten.find((spalte) => Object.prototype.hasOwnProperty.call(daten, spalte)) || null
}

function addDaysIso(datumIso, tage) {
  const basis = new Date(datumIso)
  if (Number.isNaN(basis.getTime())) return datumIso
  basis.setDate(basis.getDate() + Number(tage || 0))
  return basis.toISOString().slice(0, 10)
}

function csvEscape(wert) {
  const text = String(wert ?? '')
  if (text.includes(';') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function findeCounterInfo(dokumentTyp, profil) {
  const config = dokumentConfig[dokumentTyp]
  if (!config || !profil) return { nummer: '', nummerFeld: null, aktuelleNummer: null }
  const prefix = String(profil[config.prefixFeld] || config.defaultPrefix).trim()
  const nummer = Number(profil[config.nummerFeld])
  if (!Number.isFinite(nummer) || nummer < 0) return { nummer: '', nummerFeld: config.nummerFeld, aktuelleNummer: null }
  return { nummer: `${prefix}-${String(nummer).padStart(4, '0')}`, nummerFeld: config.nummerFeld, aktuelleNummer: nummer }
}

export default function Dokumente() {
  const location = useLocation()
  const navigate = useNavigate()
  const PAGE_SIZE = 50
  const [dokumente, setDokumente] = useState([])
  const [kunden, setKunden] = useState([])
  const [seite, setSeite] = useState(1)
  const [gesamtzahl, setGesamtzahl] = useState(0)
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState('')
  const [suche, setSuche] = useState('')
  const [datumVon, setDatumVon] = useState('')
  const [datumBis, setDatumBis] = useState('')
  const [typFilter, setTypFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [kategorieFilter, setKategorieFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [erfolg, setErfolg] = useState('')
  const [aktionId, setAktionId] = useState(null)
  const [serienLaufen, setSerienLaufen] = useState(false)
  const [sortBy, setSortBy] = useState('datum')
  const [sortDir, setSortDir] = useState('desc')

  const kundenMap = useMemo(() => {
    const map = new Map()

    for (const kunde of kunden) {
      const id = kunde.id
      const name = getFeld(kunde, ['firma', 'name', 'unternehmen'])
      if (id !== undefined && id !== null) {
        map.set(id, name || 'â€”')
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
        kunde: kundenMap.get(kundenId) || 'â€”',
        datum: getFeld(dokument, ['datum']),
        betrag: getFeld(dokument, ['brutto_gesamt', 'netto_gesamt']),
        status: getFeld(dokument, ['status']) || 'Entwurf',
        kategorie: getFeld(dokument, ['kategorie', 'kategorie_name', 'projekt']),
        tags: Array.isArray(getFeld(dokument, ['tags'])) ? getFeld(dokument, ['tags']) : [],
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

      const passtVon = !datumVon || String(dokument.datum || '').slice(0, 10) >= datumVon
      const passtBis = !datumBis || String(dokument.datum || '').slice(0, 10) <= datumBis
      const passtKategorie = !kategorieFilter || String(dokument.kategorie || '').toLowerCase().includes(kategorieFilter.trim().toLowerCase())
      const passtTag = !tagFilter || (dokument.tags || []).some((tag) => String(tag || '').toLowerCase().includes(tagFilter.trim().toLowerCase()))

      return passtSuche && passtVon && passtBis && passtKategorie && passtTag
    })
  }, [dokumentListe, suche, datumVon, datumBis, kategorieFilter, tagFilter])

  const typen = useMemo(() => [...new Set(dokumentListe.map((dokument) => dokument.typ).filter(Boolean))], [dokumentListe])
  const statusWerte = useMemo(() => [...new Set(dokumentListe.map((dokument) => dokument.status).filter(Boolean))], [dokumentListe])
  const gesamtSeiten = Math.max(1, Math.ceil(gesamtzahl / PAGE_SIZE))

  const ladeDaten = useCallback(async function ladeDaten() {
    setLaden(true)
    setFehler('')

    try {
      if (datumVon && datumBis && datumVon > datumBis) {
        throw new Error('Der Zeitraum ist ungültig: "Von" liegt nach "Bis".')
      }

      const von = (seite - 1) * PAGE_SIZE
      const bis = von + PAGE_SIZE - 1

      let dokumentQuery = supabase
        .from('dokumente')
        .select('*', { count: 'exact' })
        .order(
          sortBy === 'betrag' ? 'brutto_gesamt' : sortBy,
          { ascending: sortDir === 'asc' },
        )
        .range(von, bis)
      if (datumVon) {
        dokumentQuery = dokumentQuery.gte('datum', datumVon)
      }
      if (datumBis) {
        dokumentQuery = dokumentQuery.lte('datum', datumBis)
      }
      if (typFilter) {
        dokumentQuery = dokumentQuery.eq('typ', typFilter)
      }
      if (statusFilter) {
        dokumentQuery = dokumentQuery.eq('status', statusFilter)
      }

      const [{ data: dokumentData, error: dokumentError, count: dokumentCount }] = await Promise.all([dokumentQuery])

      if (dokumentError) throw dokumentError

      const eindeutigeDokumente = []
      const gesehen = new Set()

      for (const dokument of dokumentData ?? []) {
        const key = String(dokument.id ?? dokument.nummer ?? `${dokument.typ}-${dokument.datum}`)
        if (gesehen.has(key)) continue
        gesehen.add(key)
        eindeutigeDokumente.push(dokument)
      }

      const kundenIds = [...new Set(eindeutigeDokumente
        .map((dokument) => getFeld(dokument, ['kunden_id', 'kunde_id']))
        .filter((kundeId) => kundeId !== null && kundeId !== undefined))]

      let kundenData = []
      if (kundenIds.length > 0) {
        const { data, error: kundenError } = await supabase.from('kunden').select('*').in('id', kundenIds)
        if (kundenError) throw kundenError
        kundenData = data ?? []
      }

      setDokumente(eindeutigeDokumente)
      setKunden(kundenData)
      setGesamtzahl(dokumentCount ?? 0)
    } catch (err) {
      setFehler(err.message || 'Dokumente konnten nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }, [seite, datumVon, datumBis, typFilter, statusFilter, sortBy, sortDir])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      ladeDaten()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [ladeDaten])

  useEffect(() => {
    function onKeyDown(event) {
      const isMeta = event.metaKey || event.ctrlKey
      if (!isMeta) return
      const key = String(event.key || '').toLowerCase()
      if (key === 'n') {
        event.preventDefault()
        navigate('/dokumente/neu')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  useEffect(() => {
    setSeite(1)
  }, [suche, typFilter, statusFilter, datumVon, datumBis, sortBy, sortDir, kategorieFilter, tagFilter])

  function sortierungWechseln(neuesFeld) {
    if (sortBy === neuesFeld) {
      setSortDir((alt) => (alt === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(neuesFeld)
    setSortDir(neuesFeld === 'datum' ? 'desc' : 'asc')
  }

  useEffect(() => {
    const meldung = location.state?.erfolg
    if (!meldung) return
    setErfolg(String(meldung))
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  async function erstelleFolgedokument(quelleId, zielTyp) {
    if (!quelleId || aktionId) return
    setAktionId(quelleId)
    setFehler('')
    try {
      const { data: quelle, error: quellError } = await supabase.from('dokumente').select('*').eq('id', quelleId).single()
      if (quellError || !quelle) throw new Error('Quelldokument konnte nicht geladen werden.')

      const { data: profil, error: profilError } = await supabase.from('firmenprofile').select('*').eq('id', quelle.firmenprofil_id).single()
      if (profilError || !profil) throw new Error('Firmenprofil konnte nicht geladen werden.')

      const counterInfo = findeCounterInfo(zielTyp, profil)
      if (!counterInfo.nummer || !counterInfo.nummerFeld || counterInfo.aktuelleNummer === null) {
        throw new Error(`Nummernkreis für ${zielTyp} ist nicht korrekt konfiguriert.`)
      }

      const { data: counterUpdate, error: counterError } = await supabase
        .from('firmenprofile')
        .update({ [counterInfo.nummerFeld]: counterInfo.aktuelleNummer + 1 })
        .eq('id', profil.id)
        .eq(counterInfo.nummerFeld, counterInfo.aktuelleNummer)
        .select('id')
        .single()
      if (counterError || !counterUpdate?.id) throw new Error('Nummer konnte nicht reserviert werden.')

      const payload = {
        typ: zielTyp,
        nummer: counterInfo.nummer,
        datum: new Date().toISOString().slice(0, 10),
        status: 'Entwurf',
        firmenprofil_id: quelle.firmenprofil_id,
        kunde_id: quelle.kunde_id,
        leistungszeitraum: quelle.leistungszeitraum || null,
        einleitungstext: zielTyp === 'Mahnung' ? `Zahlungserinnerung zur Rechnung ${quelle.nummer || ''}`.trim() : quelle.einleitungstext || null,
        schlusstext: zielTyp === 'Mahnung'
          ? 'Bitte begleichen Sie den offenen Betrag bis zum angegebenen Fälligkeitsdatum.'
          : quelle.schlusstext || null,
        netto_gesamt: quelle.netto_gesamt || 0,
        ust_betrag: quelle.ust_betrag || 0,
        brutto_gesamt: quelle.brutto_gesamt || 0,
      }
      if (Object.prototype.hasOwnProperty.call(quelle, 'leistungszeitraum_anzeigen')) payload.leistungszeitraum_anzeigen = quelle.leistungszeitraum_anzeigen !== false
      if (Object.prototype.hasOwnProperty.call(quelle, 'bezugsdokument_id')) payload.bezugsdokument_id = quelle.id

      const { data: neu, error: neuError } = await supabase.from('dokumente').insert([payload]).select('id').single()
      if (neuError || !neu?.id) throw neuError || new Error('Dokument konnte nicht erstellt werden.')

      const { data: pos, error: posError } = await supabase.from('positionen').select('*').eq('dokument_id', quelle.id).order('reihenfolge')
      if (posError) throw posError
      if ((pos ?? []).length > 0) {
        const payloadPos = pos.map((p, i) => ({
          dokument_id: neu.id,
          reihenfolge: i + 1,
          bezeichnung: p.bezeichnung || '',
          beschreibung: p.beschreibung || null,
          interne_notiz: p.interne_notiz || null,
          menge: Number(p.menge || 0),
          einheit: p.einheit || null,
          einzelpreis: Number(p.einzelpreis || 0),
          rabatt_prozent: Number(p.rabatt_prozent || 0),
          gesamt: Number(p.gesamt || 0),
        }))
        const { error: posInsertError } = await supabase.from('positionen').insert(payloadPos)
        if (posInsertError) throw posInsertError
      }

      navigate(`/dokumente/${neu.id}`)
    } catch (err) {
      setFehler(err.message || 'Folgedokument konnte nicht erstellt werden.')
    } finally {
      setAktionId(null)
    }
  }

  async function dokumentDuplizieren(quelleId) {
    if (!quelleId || aktionId) return
    setAktionId(quelleId)
    setFehler('')
    try {
      const { data: quelle, error: quellError } = await supabase.from('dokumente').select('*').eq('id', quelleId).single()
      if (quellError || !quelle) throw new Error('Quelldokument konnte nicht geladen werden.')

      const { data: profil, error: profilError } = await supabase.from('firmenprofile').select('*').eq('id', quelle.firmenprofil_id).single()
      if (profilError || !profil) throw new Error('Firmenprofil konnte nicht geladen werden.')

      const counterInfo = findeCounterInfo(String(quelle.typ || 'Rechnung'), profil)
      if (!counterInfo.nummer || !counterInfo.nummerFeld || counterInfo.aktuelleNummer === null) {
        throw new Error(`Nummernkreis für ${quelle.typ || 'Dokument'} ist nicht korrekt konfiguriert.`)
      }

      const { data: counterUpdate, error: counterError } = await supabase
        .from('firmenprofile')
        .update({ [counterInfo.nummerFeld]: counterInfo.aktuelleNummer + 1 })
        .eq('id', profil.id)
        .eq(counterInfo.nummerFeld, counterInfo.aktuelleNummer)
        .select('id')
        .single()
      if (counterError || !counterUpdate?.id) throw new Error('Nummer konnte nicht reserviert werden.')

      const payload = {
        typ: quelle.typ,
        nummer: counterInfo.nummer,
        datum: new Date().toISOString().slice(0, 10),
        status: 'Entwurf',
        firmenprofil_id: quelle.firmenprofil_id,
        kunde_id: quelle.kunde_id,
        leistungszeitraum: quelle.leistungszeitraum || null,
        einleitungstext: quelle.einleitungstext || null,
        schlusstext: quelle.schlusstext || null,
        netto_gesamt: quelle.netto_gesamt || 0,
        ust_betrag: quelle.ust_betrag || 0,
        brutto_gesamt: quelle.brutto_gesamt || 0,
      }
      if (Object.prototype.hasOwnProperty.call(quelle, 'leistungszeitraum_anzeigen')) payload.leistungszeitraum_anzeigen = quelle.leistungszeitraum_anzeigen !== false

      const { data: neu, error: neuError } = await supabase.from('dokumente').insert([payload]).select('id').single()
      if (neuError || !neu?.id) throw neuError || new Error('Dokument konnte nicht dupliziert werden.')

      const { data: pos, error: posError } = await supabase.from('positionen').select('*').eq('dokument_id', quelle.id).order('reihenfolge')
      if (posError) throw posError
      if ((pos ?? []).length > 0) {
        const payloadPos = pos.map((p, i) => ({
          dokument_id: neu.id,
          reihenfolge: i + 1,
          bezeichnung: p.bezeichnung || '',
          beschreibung: p.beschreibung || null,
          interne_notiz: p.interne_notiz || null,
          menge: Number(p.menge || 0),
          einheit: p.einheit || null,
          einzelpreis: p.einzelpreis === null || p.einzelpreis === undefined ? null : Number(p.einzelpreis || 0),
          rabatt_prozent: Number(p.rabatt_prozent || 0),
          gesamt: Number(p.gesamt || 0),
        }))
        const { error: posInsertError } = await supabase.from('positionen').insert(payloadPos)
        if (posInsertError) throw posInsertError
      }

      navigate(`/dokumente/${neu.id}`)
    } catch (err) {
      setFehler(err.message || 'Dokument konnte nicht dupliziert werden.')
    } finally {
      setAktionId(null)
    }
  }

  async function faelligeSerienErstellen() {
    if (serienLaufen) return
    setSerienLaufen(true)
    setFehler('')
    setErfolg('')
    try {
      const heute = new Date().toISOString().slice(0, 10)
      const { data: schemaProbe, error: schemaError } = await supabase.from('dokumente').select('*').limit(1)
      if (schemaError) throw schemaError
      const beispiel = schemaProbe?.[0] ?? null

      const aktivSpalte = findeOptionaleSpalte(
        ['wiederholung_aktiv', 'serien_aktiv', 'recurring_active'],
        beispiel,
      )
      const intervallSpalte = findeOptionaleSpalte(
        ['wiederholung_intervall_tage', 'serien_intervall_tage', 'recurring_interval_days'],
        beispiel,
      )
      const naechsteFaelligkeitSpalte = findeOptionaleSpalte(
        ['wiederholung_naechste_faelligkeit', 'serien_naechstes_datum', 'recurring_next_date'],
        beispiel,
      )

      if (!aktivSpalte || !intervallSpalte || !naechsteFaelligkeitSpalte) {
        throw new Error('Serien-Felder fehlen in dokumente. Bitte SQL-Migration für wiederkehrende Rechnungen ausführen.')
      }

      const { data: faelligeQuellen, error: faelligeError } = await supabase
        .from('dokumente')
        .select('*')
        .eq('typ', 'Rechnung')
        .eq(aktivSpalte, true)
        .lte(naechsteFaelligkeitSpalte, heute)
        .not('status', 'eq', 'Storniert')
      if (faelligeError) throw faelligeError

      if (!faelligeQuellen || faelligeQuellen.length === 0) {
        setErfolg('Keine fälligen Serien-Rechnungen gefunden.')
        return
      }

      let erstellt = 0
      for (const quelle of faelligeQuellen) {
        const { data: profil, error: profilError } = await supabase
          .from('firmenprofile')
          .select('*')
          .eq('id', quelle.firmenprofil_id)
          .single()
        if (profilError || !profil) throw new Error('Firmenprofil konnte nicht geladen werden.')

        const counterInfo = findeCounterInfo('Rechnung', profil)
        if (!counterInfo.nummer || !counterInfo.nummerFeld || counterInfo.aktuelleNummer === null) {
          throw new Error('Nummernkreis für Rechnung ist nicht korrekt konfiguriert.')
        }

        const { data: counterUpdate, error: counterError } = await supabase
          .from('firmenprofile')
          .update({ [counterInfo.nummerFeld]: counterInfo.aktuelleNummer + 1 })
          .eq('id', profil.id)
          .eq(counterInfo.nummerFeld, counterInfo.aktuelleNummer)
          .select('id')
          .single()
        if (counterError || !counterUpdate?.id) throw new Error('Nummer konnte nicht reserviert werden.')

        const payload = {
          typ: 'Rechnung',
          nummer: counterInfo.nummer,
          datum: heute,
          status: 'Entwurf',
          firmenprofil_id: quelle.firmenprofil_id,
          kunde_id: quelle.kunde_id,
          leistungszeitraum: quelle.leistungszeitraum || null,
          einleitungstext: quelle.einleitungstext || null,
          schlusstext: quelle.schlusstext || null,
          netto_gesamt: quelle.netto_gesamt || 0,
          ust_betrag: quelle.ust_betrag || 0,
          brutto_gesamt: quelle.brutto_gesamt || 0,
        }
        if (Object.prototype.hasOwnProperty.call(quelle, 'leistungszeitraum_anzeigen')) {
          payload.leistungszeitraum_anzeigen = quelle.leistungszeitraum_anzeigen !== false
        }
        const { data: neu, error: neuError } = await supabase.from('dokumente').insert([payload]).select('id').single()
        if (neuError || !neu?.id) throw neuError || new Error('Serien-Rechnung konnte nicht erstellt werden.')

        const { data: pos, error: posError } = await supabase
          .from('positionen')
          .select('*')
          .eq('dokument_id', quelle.id)
          .order('reihenfolge')
        if (posError) throw posError
        if ((pos ?? []).length > 0) {
          const payloadPos = pos.map((p, i) => ({
            dokument_id: neu.id,
            reihenfolge: i + 1,
            bezeichnung: p.bezeichnung || '',
            beschreibung: p.beschreibung || null,
            interne_notiz: p.interne_notiz || null,
            menge: Number(p.menge || 0),
            einheit: p.einheit || null,
            einzelpreis: p.einzelpreis === null || p.einzelpreis === undefined ? null : Number(p.einzelpreis || 0),
            rabatt_prozent: Number(p.rabatt_prozent || 0),
            gesamt: Number(p.gesamt || 0),
          }))
          const { error: posInsertError } = await supabase.from('positionen').insert(payloadPos)
          if (posInsertError) throw posInsertError
        }

        const intervall = Math.max(1, Number(quelle?.[intervallSpalte] || 0))
        const naechstesDatum = addDaysIso(String(quelle?.[naechsteFaelligkeitSpalte] || heute), intervall)
        const { error: quelleUpdateError } = await supabase
          .from('dokumente')
          .update({ [naechsteFaelligkeitSpalte]: naechstesDatum })
          .eq('id', quelle.id)
        if (quelleUpdateError) throw quelleUpdateError

        erstellt += 1
      }

      setErfolg(`${erstellt} Serien-Rechnung(en) erstellt.`)
      await ladeDaten()
    } catch (err) {
      setFehler(err.message || 'Fällige Serien-Rechnungen konnten nicht erstellt werden.')
    } finally {
      setSerienLaufen(false)
    }
  }

  function exportDatevCsv() {
    try {
      const exportierbare = gefilterteDokumente.filter((dokument) => {
        const typ = String(dokument.typ || '')
        const status = String(dokument.status || '')
        if (status === 'Entwurf' || status === 'Storniert') return false
        return typ === 'Rechnung' || typ === 'Gutschrift'
      })

      if (exportierbare.length === 0) {
        setFehler('Keine exportierbaren Dokumente im aktuellen Filter gefunden.')
        return
      }

      const header = [
        'Belegdatum',
        'Belegnummer',
        'Dokumenttyp',
        'Kunde',
        'Betrag_EUR',
        'Status',
        'Buchungstext',
      ]

      const zeilen = exportierbare.map((dokument) => {
        const betrag = Number(dokument.betrag || 0)
        const vorzeichenBetrag = dokument.typ === 'Gutschrift' ? -Math.abs(betrag) : Math.abs(betrag)
        const buchungstext = `${dokument.typ} ${dokument.nummer || ''}`.trim()

        return [
          String(dokument.datum || '').slice(0, 10),
          dokument.nummer || '',
          dokument.typ || '',
          dokument.kunde || '',
          vorzeichenBetrag.toFixed(2).replace('.', ','),
          dokument.status || '',
          buchungstext,
        ]
      })

      const csv = [header, ...zeilen]
        .map((row) => row.map(csvEscape).join(';'))
        .join('\n')

      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      const heute = new Date().toISOString().slice(0, 10)
      link.href = url
      link.download = `datev-export-${heute}.csv`
      window.document.body.appendChild(link)
      link.click()
      window.document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      setErfolg(`${exportierbare.length} Dokumente als DATEV-CSV exportiert.`)
      setFehler('')
    } catch (err) {
      setFehler(err.message || 'DATEV-CSV konnte nicht exportiert werden.')
    }
  }

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
          <button
            type="button"
            onClick={faelligeSerienErstellen}
            disabled={serienLaufen}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-[#185FA5] bg-blue-50 hover:bg-blue-100 disabled:opacity-60 transition-colors"
          >
            {serienLaufen ? 'Erstellt...' : 'Fällige Serien erstellen'}
          </button>
          <button
            type="button"
            onClick={exportDatevCsv}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            DATEV-CSV Export
          </button>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {erfolg && (
            <p className="mx-4 mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {erfolg}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 border-b border-gray-200 p-4">
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
            <input
              type="date"
              value={datumVon}
              onChange={(e) => setDatumVon(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              placeholder="Von"
              title="Zeitraum von"
            />
            <input
              type="date"
              value={datumBis}
              onChange={(e) => setDatumBis(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              placeholder="Bis"
              title="Zeitraum bis"
            />
            <input
              type="text"
              value={kategorieFilter}
              onChange={(e) => setKategorieFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              placeholder="Kategorie/Projekt"
            />
            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
              placeholder="Tag"
            />
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
                    <button type="button" onClick={() => sortierungWechseln('datum')} className="hover:text-gray-900">
                      Datum {sortBy === 'datum' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    <button type="button" onClick={() => sortierungWechseln('betrag')} className="hover:text-gray-900">
                      Betrag {sortBy === 'betrag' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    <button type="button" onClick={() => sortierungWechseln('status')} className="hover:text-gray-900">
                      Status {sortBy === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Kategorie / Tags
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold tracking-wide text-gray-600 uppercase">
                    Aktion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {laden && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-sm text-gray-500">
                      Dokumente werden geladen...
                    </td>
                  </tr>
                )}

                {!laden && fehler && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-sm text-red-600">
                      {fehler}
                    </td>
                  </tr>
                )}

                {!laden && !fehler && gefilterteDokumente.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-6 text-sm text-gray-500">
                      Keine passenden Dokumente gefunden.
                    </td>
                  </tr>
                )}

                {!laden && !fehler && gefilterteDokumente.map((dokument) => (
                  <tr key={dokument.id} className="hover:bg-gray-50/70">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {dokument.dokumentId ? (
                        <Link to={`/dokumente/${dokument.dokumentId}`} className="text-[#185FA5] hover:underline">
                          {dokument.nummer || 'â€”'}
                        </Link>
                      ) : (
                        dokument.nummer || 'â€”'
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{dokument.typ || 'â€”'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{dokument.kunde}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{formatiereDatum(dokument.datum)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">{formatiereBetrag(dokument.betrag)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{dokument.status}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="flex flex-col gap-1">
                        <span>{dokument.kategorie || '—'}</span>
                        {(dokument.tags || []).length > 0 && (
                          <span className="text-xs text-gray-500">{(dokument.tags || []).join(', ')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {(dokument.typ === 'Angebot' || dokument.typ === 'Auftragsbestätigung') && (
                          <button
                            type="button"
                            onClick={() => erstelleFolgedokument(dokument.dokumentId, 'Rechnung')}
                            disabled={aktionId === dokument.dokumentId}
                            className="rounded-lg px-3 py-2 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                          >
                            Als Rechnung
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => dokumentDuplizieren(dokument.dokumentId)}
                          disabled={aktionId === dokument.dokumentId}
                          className="rounded-lg px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
                        >
                          Duplizieren
                        </button>
                        {dokument.typ === 'Rechnung' && dokument.status !== 'Bezahlt' && dokument.status !== 'Storniert' && (
                          <button
                            type="button"
                            onClick={() => erstelleFolgedokument(dokument.dokumentId, 'Mahnung')}
                            disabled={aktionId === dokument.dokumentId}
                            className="rounded-lg px-3 py-2 text-xs font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 disabled:opacity-60 transition-colors"
                          >
                            Mahnung
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm">
            <p className="text-gray-500">
              Seite {seite} von {gesamtSeiten}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSeite((alt) => Math.max(1, alt - 1))}
                disabled={seite <= 1 || laden}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={() => setSeite((alt) => Math.min(gesamtSeiten, alt + 1))}
                disabled={seite >= gesamtSeiten || laden}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 transition-colors"
              >
                Weiter
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}


import { useCallback, useEffect, useRef, useState } from 'react'
import Navigation from '../components/Navigation'
import { supabase } from '../lib/supabase'
import { DEFAULT_PDF_LAYOUT, PDF_MARGINS, PDF_PAGE, resolvePdfLayout } from '../lib/pdfLayout'
import { getFeld } from '../lib/utils'

const PREVIEW_WIDTH = 430
const PREVIEW_SCALE = PREVIEW_WIDTH / PDF_PAGE.width
const PREVIEW_HEIGHT = Math.round(PDF_PAGE.height * PREVIEW_SCALE)

const initialForm = {
  name: '',
  inhaber: '',
  strasse: '',
  plz: '',
  ort: '',
  land: '',
  telefon: '',
  email: '',
  steuernummer: '',
  ustId: '',
  ustSatz: '19',
  kleinunternehmer: false,
  iban: '',
  bic: '',
  bank: '',
  zahlungszielTage: '',
  logoUrl: '',
  pdfLayout: resolvePdfLayout(DEFAULT_PDF_LAYOUT),
}

function toBool(wert) {
  if (typeof wert === 'boolean') return wert
  if (typeof wert === 'number') return wert === 1
  if (typeof wert === 'string') return ['1', 'true', 'ja'].includes(wert.toLowerCase())
  return false
}

function istGueltigePlz(wert) {
  return /^\d{5}$/.test(String(wert || '').trim())
}

function istGueltigeIban(iban) {
  const normalisiert = String(iban || '').replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalisiert)) return false

  const verschoben = `${normalisiert.slice(4)}${normalisiert.slice(0, 4)}`
  const numerisch = verschoben.replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55))

  let rest = 0
  for (const zeichen of numerisch) {
    rest = Number(`${rest}${zeichen}`) % 97
  }
  return rest === 1
}

function waehleSpalte(kandidaten, bekannteSpalten) {
  if (!bekannteSpalten || bekannteSpalten.length === 0) {
    return kandidaten[0]
  }

  for (const kandidat of kandidaten) {
    if (bekannteSpalten.includes(kandidat)) {
      return kandidat
    }
  }

  return kandidaten[0]
}

function waehleOptionaleSpalte(kandidaten, bekannteSpalten) {
  if (!bekannteSpalten || bekannteSpalten.length === 0) {
    return null
  }

  for (const kandidat of kandidaten) {
    if (bekannteSpalten.includes(kandidat)) {
      return kandidat
    }
  }

  return null
}

function baueProfilPayload(form, bekannteSpalten) {
  const ustSatzSpalte = waehleOptionaleSpalte(['ust_satz', 'mwst_satz', 'umsatzsteuer_satz', 'steuersatz'], bekannteSpalten)

  return {
    [waehleSpalte(['name'], bekannteSpalten)]: form.name,
    [waehleSpalte(['inhaber'], bekannteSpalten)]: form.inhaber,
    [waehleSpalte(['strasse', 'straße'], bekannteSpalten)]: form.strasse,
    [waehleSpalte(['plz'], bekannteSpalten)]: form.plz,
    [waehleSpalte(['ort', 'stadt'], bekannteSpalten)]: form.ort,
    [waehleSpalte(['land'], bekannteSpalten)]: form.land,
    [waehleSpalte(['telefon', 'phone'], bekannteSpalten)]: form.telefon,
    [waehleSpalte(['email', 'e_mail'], bekannteSpalten)]: form.email,
    [waehleSpalte(['steuernummer'], bekannteSpalten)]: form.steuernummer,
    [waehleSpalte(['ust_id', 'ustid'], bekannteSpalten)]: form.ustId,
    ...(ustSatzSpalte
      ? { [ustSatzSpalte]: form.ustSatz === '' ? null : Number(form.ustSatz) }
      : {}),
    [waehleSpalte(['paragraph19'], bekannteSpalten)]:
      form.kleinunternehmer,
    [waehleSpalte(['iban'], bekannteSpalten)]: form.iban,
    [waehleSpalte(['bic'], bekannteSpalten)]: form.bic,
    [waehleSpalte(['bank'], bekannteSpalten)]: form.bank,
    [waehleSpalte(['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days'], bekannteSpalten)]:
      form.zahlungszielTage === '' ? null : Number(form.zahlungszielTage),
    [waehleSpalte(['logo_url'], bekannteSpalten)]: form.logoUrl || null,
    [waehleSpalte(['pdf_layout'], bekannteSpalten)]: form.pdfLayout,
  }
}

export default function Einstellungen() {
  const [form, setForm] = useState(initialForm)
  const [profilId, setProfilId] = useState(null)
  const [bekannteSpalten, setBekannteSpalten] = useState([])
  const [laden, setLaden] = useState(true)
  const [speichern, setSpeichern] = useState(false)
  const [fehler, setFehler] = useState('')
  const [erfolg, setErfolg] = useState('')
  const [logoDatei, setLogoDatei] = useState(null)
  const [logoVorschau, setLogoVorschau] = useState('')
  const [drag, setDrag] = useState(null)
  const previewRef = useRef(null)

  const ladeProfil = useCallback(async function ladeProfil() {
    setLaden(true)
    setFehler('')

    try {
      const { data, error } = await supabase.from('firmenprofile').select('*').limit(1)
      if (error) throw error

      const profil = data?.[0]
      if (!profil) {
        setProfilId(null)
        setBekannteSpalten([])
        setForm(initialForm)
        return
      }

      setProfilId(profil.id ?? null)
      setBekannteSpalten(Object.keys(profil))

      setForm({
        name: getFeld(profil, ['name']),
        inhaber: getFeld(profil, ['inhaber']),
        strasse: getFeld(profil, ['strasse', 'straße']),
        plz: getFeld(profil, ['plz']),
        ort: getFeld(profil, ['ort', 'stadt']),
        land: getFeld(profil, ['land']),
        telefon: getFeld(profil, ['telefon', 'phone']),
        email: getFeld(profil, ['email', 'e_mail']),
        steuernummer: getFeld(profil, ['steuernummer']),
        ustId: getFeld(profil, ['ust_id', 'ustid']),
        ustSatz: String(getFeld(profil, ['ust_satz', 'mwst_satz', 'umsatzsteuer_satz', 'steuersatz']) || '19'),
        kleinunternehmer: toBool(getFeld(profil, ['paragraph19'])),
        iban: getFeld(profil, ['iban']),
        bic: getFeld(profil, ['bic']),
        bank: getFeld(profil, ['bank']),
        zahlungszielTage: String(getFeld(profil, ['zahlungsziel_tage', 'zahlungsziel', 'payment_term_days']) || ''),
        logoUrl: getFeld(profil, ['logo_url']),
        pdfLayout: resolvePdfLayout(getFeld(profil, ['pdf_layout'])),
      })
    } catch (err) {
      setFehler(err.message || 'Firmenprofil konnte nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      ladeProfil()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [ladeProfil])

  useEffect(() => {
    return () => {
      if (logoVorschau) {
        URL.revokeObjectURL(logoVorschau)
      }
    }
  }, [logoVorschau])

  function updateFeld(feld, wert) {
    setForm((alt) => ({
      ...alt,
      [feld]: wert,
    }))
  }

  function updateLayout(part, patch) {
    setForm((alt) => ({
      ...alt,
      pdfLayout: resolvePdfLayout({
        ...alt.pdfLayout,
        [part]: {
          ...alt.pdfLayout[part],
          ...patch,
        },
      }),
    }))
  }

  function updateFold(patch) {
    setForm((alt) => ({
      ...alt,
      pdfLayout: resolvePdfLayout({
        ...alt.pdfLayout,
        fold: {
          ...alt.pdfLayout.fold,
          ...patch,
        },
      }),
    }))
  }

  function starteDrag(event, target, mode = 'move') {
    if (!previewRef.current) return
    event.preventDefault()
    event.stopPropagation()

    const rect = previewRef.current.getBoundingClientRect()
    const scaleX = PDF_PAGE.width / rect.width
    const scaleY = PDF_PAGE.height / rect.height

    if (target === 'foldTop' || target === 'foldBottom') {
      setDrag({
        target,
        mode: 'line',
        startX: event.clientX,
        startY: event.clientY,
        startTopY: form.pdfLayout.fold.topY,
        startBottomY: form.pdfLayout.fold.bottomY,
        scaleX,
        scaleY,
      })
      return
    }

    const box = form.pdfLayout[target]
    setDrag({
      target,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startBox: box,
      scaleX,
      scaleY,
    })
  }

  useEffect(() => {
    if (!drag) return undefined

    function onMouseMove(event) {
      const dx = (event.clientX - drag.startX) * drag.scaleX
      const dy = (event.clientY - drag.startY) * drag.scaleY

      if (drag.mode === 'line') {
        if (drag.target === 'foldTop') {
          updateFold({ topY: drag.startTopY + dy })
        } else {
          updateFold({ bottomY: drag.startBottomY + dy })
        }
        return
      }

      if (drag.mode === 'resize') {
        updateLayout(drag.target, {
          w: drag.startBox.w + dx,
          h: drag.startBox.h + dy,
        })
        return
      }

      updateLayout(drag.target, {
        x: drag.startBox.x + dx,
        y: drag.startBox.y + dy,
      })
    }

    function onMouseUp() {
      setDrag(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [drag, form.pdfLayout])

  function logoDateiAuswaehlen(e) {
    const datei = e.target.files?.[0]
    if (!datei) return

    const erlaubteTypen = ['image/jpeg', 'image/png', 'image/svg+xml']
    if (!erlaubteTypen.includes(datei.type)) {
      setFehler('Bitte nur JPG, PNG oder SVG als Logo hochladen.')
      return
    }

    if (logoVorschau) {
      URL.revokeObjectURL(logoVorschau)
    }

    const vorschau = URL.createObjectURL(datei)
    setLogoDatei(datei)
    setLogoVorschau(vorschau)
    setFehler('')
    setErfolg('')
  }

  async function ladeLogoHoch(datei, zielProfilId) {
    const dateiendung = (datei.name.split('.').pop() || 'png').toLowerCase()
    const dateiname = `logo_${Date.now()}.${dateiendung}`
    const pfad = `profil_${zielProfilId}/${dateiname}`

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(pfad, datei, { upsert: true })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('logos').getPublicUrl(pfad)
    return data.publicUrl
  }

  async function speichernHandler(e) {
    e.preventDefault()
    setSpeichern(true)
    setFehler('')
    setErfolg('')

    try {
      if (form.plz && !istGueltigePlz(form.plz)) {
        throw new Error('PLZ muss aus genau 5 Ziffern bestehen.')
      }
      if (form.iban && !istGueltigeIban(form.iban)) {
        throw new Error('Bitte eine gültige IBAN eingeben.')
      }

      let aktiveProfilId = profilId
      let finaleLogoUrl = form.logoUrl || ''

      if (!aktiveProfilId) {
        const payloadOhneLogo = baueProfilPayload({ ...form, logoUrl: '' }, bekannteSpalten)
        const { data, error } = await supabase.from('firmenprofile').insert([payloadOhneLogo]).select('id').limit(1)
        if (error) throw error

        const neuesProfil = data?.[0]
        if (!neuesProfil?.id) throw new Error('Firmenprofil konnte nicht angelegt werden.')
        aktiveProfilId = neuesProfil.id
        setProfilId(neuesProfil.id)
      }

      if (logoDatei) {
        finaleLogoUrl = await ladeLogoHoch(logoDatei, aktiveProfilId)
      }

      const payload = baueProfilPayload({ ...form, logoUrl: finaleLogoUrl }, bekannteSpalten)

      const { error } = await supabase.from('firmenprofile').update(payload).eq('id', aktiveProfilId)
      if (error) throw error

      setLogoDatei(null)
      setErfolg('Firmenprofil wurde gespeichert.')
      await ladeProfil()
      window.dispatchEvent(new Event('profil-aktualisiert'))
    } catch (err) {
      setFehler(err.message || 'Speichern fehlgeschlagen.')
    } finally {
      setSpeichern(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Navigation />

      <main className="flex-1 p-8">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Einstellungen</h2>
          <p className="text-sm text-gray-500">
            Firmenprofil für Rechnungen, Angebote und Mahnungen verwalten.
          </p>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl p-6">
          {laden ? (
            <p className="text-sm text-gray-500">Firmenprofil wird geladen...</p>
          ) : (
            <form onSubmit={speichernHandler} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateFeld('name', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Sport Voice"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inhaber</label>
                  <input
                    type="text"
                    value={form.inhaber}
                    onChange={(e) => updateFeld('inhaber', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Sebastian Wauer"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Straße</label>
                  <input
                    type="text"
                    value={form.strasse}
                    onChange={(e) => updateFeld('strasse', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Buchenstraße 50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PLZ</label>
                  <input
                    type="text"
                    value={form.plz}
                    onChange={(e) => updateFeld('plz', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="42283"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
                  <input
                    type="text"
                    value={form.ort}
                    onChange={(e) => updateFeld('ort', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Wuppertal"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
                  <input
                    type="text"
                    value={form.land}
                    onChange={(e) => updateFeld('land', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Deutschland"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={form.telefon}
                    onChange={(e) => updateFeld('telefon', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="+49 ..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateFeld('email', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="info@sportvoice.de"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Steuernummer</label>
                  <input
                    type="text"
                    value={form.steuernummer}
                    onChange={(e) => updateFeld('steuernummer', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="123/4567/8901"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">USt-ID</label>
                  <input
                    type="text"
                    value={form.ustId}
                    onChange={(e) => updateFeld('ustId', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="DE123456789"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Standard-USt-Satz (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.ustSatz}
                    onChange={(e) => updateFeld('ustSatz', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="19"
                  />
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg px-4 py-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.kleinunternehmer}
                    onChange={(e) => updateFeld('kleinunternehmer', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#185FA5] focus:ring-[#185FA5]"
                  />
                  <span className="text-sm text-gray-800">Kleinunternehmer nach § 19 UStG</span>
                </label>
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                  onChange={logoDateiAuswaehlen}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#185FA5] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#154f8a]"
                />
                <p className="mt-2 text-xs text-gray-500">
                  JPG und PNG erscheinen auch im PDF. SVG wird in der App gespeichert, aber beim PDF-Export durch Text ersetzt.
                </p>
                {(logoVorschau || form.logoUrl) && (
                  <div className="mt-3">
                    <img
                      src={logoVorschau || form.logoUrl}
                      alt="Logo-Vorschau"
                      className="h-16 w-auto object-contain border border-gray-200 rounded-lg p-2 bg-white"
                    />
                  </div>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    PDF-Layout per Drag & Drop
                  </label>
                  <button
                    type="button"
                    onClick={() => updateFeld('pdfLayout', resolvePdfLayout(DEFAULT_PDF_LAYOUT))}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    Layout zurücksetzen
                  </button>
                </div>

                <p className="text-xs text-gray-500 mb-3">
                  Elemente verschieben. Unten rechts am Kasten ziehen, um die Größe zu ändern.
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Feste Seitenränder: oben {PDF_MARGINS.top}px, rechts {PDF_MARGINS.right}px, unten {PDF_MARGINS.bottom}px, links {PDF_MARGINS.left}px.
                </p>

                <div className="overflow-auto">
                  <div
                    ref={previewRef}
                    className="relative border border-gray-300 bg-white rounded-lg"
                    style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
                  >
                    <div
                      className="absolute border border-dashed border-gray-300 pointer-events-none"
                      style={{
                        left: form.pdfLayout.margins.left * PREVIEW_SCALE,
                        top: form.pdfLayout.margins.top * PREVIEW_SCALE,
                        width: (PDF_PAGE.width - form.pdfLayout.margins.left - form.pdfLayout.margins.right) * PREVIEW_SCALE,
                        height: (PDF_PAGE.height - form.pdfLayout.margins.top - form.pdfLayout.margins.bottom) * PREVIEW_SCALE,
                      }}
                    />
                    {[
                      { key: 'sender', label: 'Absender', className: 'bg-blue-50 border-blue-200 text-blue-800' },
                      { key: 'recipient', label: 'Empfänger', className: 'bg-gray-50 border-gray-300 text-gray-800' },
                      { key: 'meta', label: 'Datum / Kontakt', className: 'bg-gray-50 border-gray-300 text-gray-800' },
                      { key: 'logo', label: 'Logo', className: 'bg-blue-50 border-blue-200 text-blue-800' },
                      { key: 'positionen', label: 'Positionen', className: 'bg-gray-50 border-gray-300 text-gray-800' },
                      { key: 'footer', label: 'Fußzeile', className: 'bg-blue-50 border-blue-200 text-blue-800' },
                    ].map((item) => {
                      const box = form.pdfLayout[item.key]
                      return (
                        <div
                          key={item.key}
                          onMouseDown={(event) => starteDrag(event, item.key, 'move')}
                          className={`absolute border rounded p-1 text-[10px] font-medium cursor-move select-none ${item.className}`}
                          style={{
                            left: box.x * PREVIEW_SCALE,
                            top: box.y * PREVIEW_SCALE,
                            width: box.w * PREVIEW_SCALE,
                            height: box.h * PREVIEW_SCALE,
                          }}
                        >
                          {item.label}
                          <span
                            onMouseDown={(event) => starteDrag(event, item.key, 'resize')}
                            className="absolute right-0 bottom-0 w-3 h-3 bg-gray-400 rounded-tl cursor-se-resize"
                          />
                        </div>
                      )
                    })}

                    <div
                      onMouseDown={(event) => starteDrag(event, 'foldTop')}
                      className="absolute left-0 right-0 border-t border-dashed border-gray-500 cursor-ns-resize"
                      style={{ top: form.pdfLayout.fold.topY * PREVIEW_SCALE }}
                    />
                    <div
                      onMouseDown={(event) => starteDrag(event, 'foldBottom')}
                      className="absolute left-0 right-0 border-t border-dashed border-gray-500 cursor-ns-resize"
                      style={{ top: form.pdfLayout.fold.bottomY * PREVIEW_SCALE }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                  <input
                    type="text"
                    value={form.iban}
                    onChange={(e) => updateFeld('iban', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="DE..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BIC</label>
                  <input
                    type="text"
                    value={form.bic}
                    onChange={(e) => updateFeld('bic', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="XXXXDEXX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                  <input
                    type="text"
                    value={form.bank}
                    onChange={(e) => updateFeld('bank', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="Bankname"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zahlungsziel in Tagen</label>
                  <input
                    type="number"
                    min="0"
                    value={form.zahlungszielTage}
                    onChange={(e) => updateFeld('zahlungszielTage', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#185FA5]"
                    placeholder="14"
                  />
                </div>
              </div>

              {fehler && <p className="text-sm text-red-600">{fehler}</p>}
              {erfolg && <p className="text-sm text-green-700">{erfolg}</p>}

              <div>
                <button
                  type="submit"
                  disabled={speichern}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-[#185FA5] hover:bg-[#154f8a] disabled:opacity-60 transition-colors"
                >
                  {speichern ? 'Wird gespeichert...' : 'Firmenprofil speichern'}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}

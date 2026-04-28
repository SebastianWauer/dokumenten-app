export function getFeld(datensatz, kandidaten) {
  for (const feld of kandidaten) {
    if (datensatz?.[feld] !== null && datensatz?.[feld] !== undefined && datensatz?.[feld] !== '') {
      return datensatz[feld]
    }
  }
  return ''
}

export function formatiereBetrag(wert) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(wert || 0))
}

export function formatiereDatum(wert) {
  if (!wert) return '—'
  const datum = new Date(wert)
  if (Number.isNaN(datum.getTime())) return wert
  return new Intl.DateTimeFormat('de-DE').format(datum)
}

export const PDF_PAGE = {
  width: 595,
  height: 842,
}

export const PDF_MARGINS = {
  top: 46,
  right: 70,
  bottom: 32,
  left: 82,
}

export const DEFAULT_PDF_LAYOUT = {
  logo: { x: 393, y: 46, w: 132, h: 52 },
  sender: { x: 82, y: 124, w: 360, h: 12 },
  recipient: { x: 82, y: 137, w: 245, h: 92 },
  meta: { x: 350, y: 137, w: 175, h: 70 },
  positionen: { x: 82, y: 260, w: 443, h: 360 },
  footer: { x: 82, y: 768, w: 443, h: 36 },
  fold: { topY: 298, bottomY: 596 },
}

function toNum(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeBox(input, fallback, margins) {
  const maxW = Math.max(40, PDF_PAGE.width - margins.left - margins.right)
  const maxH = Math.max(16, PDF_PAGE.height - margins.top - margins.bottom)

  const x = toNum(input?.x, fallback.x)
  const y = toNum(input?.y, fallback.y)
  const w = Math.max(40, Math.min(toNum(input?.w, fallback.w), maxW))
  const h = Math.max(16, Math.min(toNum(input?.h, fallback.h), maxH))

  return {
    x: Math.max(margins.left, Math.min(x, PDF_PAGE.width - margins.right - w)),
    y: Math.max(margins.top, Math.min(y, PDF_PAGE.height - margins.bottom - h)),
    w,
    h,
  }
}

export function resolvePdfLayout(value) {
  const parsed = typeof value === 'string'
    ? (() => {
      try {
        return JSON.parse(value)
      } catch {
        return {}
      }
    })()
    : (value || {})

  const margins = {
    top: PDF_MARGINS.top,
    right: PDF_MARGINS.right,
    bottom: PDF_MARGINS.bottom,
    left: PDF_MARGINS.left,
  }

  return {
    margins,
    logo: normalizeBox(parsed.logo, DEFAULT_PDF_LAYOUT.logo, margins),
    sender: normalizeBox(parsed.sender, DEFAULT_PDF_LAYOUT.sender, margins),
    recipient: normalizeBox(parsed.recipient, DEFAULT_PDF_LAYOUT.recipient, margins),
    meta: normalizeBox(parsed.meta, DEFAULT_PDF_LAYOUT.meta, margins),
    positionen: normalizeBox(parsed.positionen, DEFAULT_PDF_LAYOUT.positionen, margins),
    footer: normalizeBox(parsed.footer, DEFAULT_PDF_LAYOUT.footer, margins),
    fold: {
      topY: Math.max(margins.top, Math.min(toNum(parsed.fold?.topY, DEFAULT_PDF_LAYOUT.fold.topY), PDF_PAGE.height - margins.bottom)),
      bottomY: Math.max(margins.top, Math.min(toNum(parsed.fold?.bottomY, DEFAULT_PDF_LAYOUT.fold.bottomY), PDF_PAGE.height - margins.bottom)),
    },
  }
}

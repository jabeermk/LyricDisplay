// PDF text extraction. pdf.js is lazy-loaded, only when a PDF is actually used.
import { normalizeLyrics, titleFromFilename } from './text.js'
import { detectLanguage } from './script.js'

const RTL = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/

/**
 * Rebuild text from pdf.js text items of one page.
 * Items need {str, transform:[a,b,c,d,x,y], width, height}. PDF y grows upward.
 * Items are grouped into lines by Y; large vertical gaps become blank lines (stanza breaks).
 */
export function itemsToText(items) {
  const toks = items
    .filter((it) => typeof it.str === 'string' && it.transform)
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width || 0,
      h: Math.abs(it.height || it.transform[3] || 0) || 10,
    }))
    .filter((t) => t.str !== '')
  if (!toks.length) return ''

  toks.sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const t of toks) {
    const cur = lines[lines.length - 1]
    const tol = Math.max(2, 0.4 * t.h)
    if (cur && Math.abs(t.y - cur.y) <= tol) {
      cur.items.push(t)
      cur.y = (cur.y * (cur.items.length - 1) + t.y) / cur.items.length
      cur.h = Math.max(cur.h, t.h)
    } else lines.push({ y: t.y, h: t.h, items: [t] })
  }

  const rows = lines.map((ln) => {
    const rtl = RTL.test(ln.items.map((i) => i.str).join(''))
    ln.items.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x))
    let out = ''
    let prev = null
    for (const it of ln.items) {
      if (prev) {
        const gap = rtl ? prev.x - (it.x + it.w) : it.x - (prev.x + prev.w)
        const hasSpace = /\s$/.test(out) || /^\s/.test(it.str)
        if (!hasSpace && gap > ln.h * 0.12) out += ' '
      }
      out += it.str
      prev = it
    }
    return { y: ln.y, text: out.replace(/[ \t]+/g, ' ').trim() }
  })

  const gaps = []
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i - 1].y - rows[i].y)
  const sorted = gaps.filter((g) => g > 0).sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.3)] : 0 // normal line pitch (low percentile survives many stanza gaps)

  const out = []
  rows.forEach((r, i) => {
    if (i > 0 && median > 0 && rows[i - 1].y - r.y > median * 1.45) out.push('')
    if (r.text !== '') out.push(r.text)
  })
  return out.join('\n')
}

/** Heuristic warnings for extracted text: 'empty' (scanned) | 'garbled' (font encoding). */
export function analyzeExtraction(text) {
  const letters = (text.match(/\S/g) || []).length
  if (letters < 8) return ['empty']
  const bad = (text.match(/[�-]/g) || []).length + (text.match(/\(cid:\d+\)/g) || []).length * 5
  return bad / letters > 0.02 ? ['garbled'] : []
}

export const WARNING_TEXT = {
  empty: 'No text found. This looks like a scanned (image) PDF. Paste the lyrics or use a .txt file instead.',
  garbled: 'Text looks garbled (font encoding). Check the preview. Pasting or a .txt file is more reliable.',
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  }
  return pdfjs
}

/** Open a PDF Blob/File as a pdf.js document (caller must destroy()). */
export async function openPdfDoc(blob) {
  const pdfjs = await loadPdfjs()
  return pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
}

/** Extract a File -> {title, lyrics, language, tag, pitch, warnings, pages}. */
export async function extractPdf(file) {
  const doc = await openPdfDoc(file)
  const pages = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      pages.push(itemsToText(content.items))
    }
  } finally {
    doc.destroy?.()
  }
  const lyrics = normalizeLyrics(pages.filter(Boolean).join('\n\n'))
  return {
    title: titleFromFilename(file.name) || 'Untitled',
    lyrics,
    language: detectLanguage(lyrics),
    tag: '',
    pitch: '',
    warnings: analyzeExtraction(lyrics),
    pages: doc.numPages,
  }
}

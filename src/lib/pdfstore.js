// Original PDF files, keyed by song id.
// 1) kept on this device (IndexedDB), 2) or shipped with the app in public/pdfs/<id>.pdf
//    and listed in public/pdfs/index.json (see README).
const DB = 'stagelyrics-pdf'
const STORE = 'pdfs'

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => {
      db.close()
      resolve(req && req.result)
    }
    t.onerror = t.onabort = () => {
      db.close()
      reject(t.error)
    }
  })
}

let shipped = null
async function shippedIds() {
  if (shipped) return shipped
  try {
    const r = await fetch('pdfs/index.json')
    const json = r.ok && (r.headers.get('content-type') || '').includes('json') ? await r.json() : []
    shipped = new Set(Array.isArray(json) ? json.filter((x) => typeof x === 'string') : [])
  } catch {
    shipped = new Set()
  }
  return shipped
}

export const putPdf = (id, blob) => tx('readwrite', (s) => s.put(blob, id))

export async function getPdf(id) {
  try {
    const local = await tx('readonly', (s) => s.get(id))
    if (local) return local
  } catch {
    /* fall through to shipped copy */
  }
  if (!(await shippedIds()).has(id)) return null
  try {
    const r = await fetch(`pdfs/${encodeURIComponent(id)}.pdf`)
    return r.ok && (r.headers.get('content-type') || '').includes('pdf') ? await r.blob() : null
  } catch {
    return null
  }
}

export async function hasPdf(id) {
  try {
    if ((await tx('readonly', (s) => s.count(id))) > 0) return true
  } catch {
    /* ignore */
  }
  return (await shippedIds()).has(id)
}

export const deletePdf = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {})
export const clearPdfs = () => tx('readwrite', (s) => s.clear()).catch(() => {})

/** Ids of PDFs stored on this device only. */
export async function localPdfIds() {
  try {
    return [...(await tx('readonly', (s) => s.getAllKeys()))]
  } catch {
    return []
  }
}

/** Ids with a PDF available here: on this device or shipped with the app. */
export async function pdfIds() {
  return new Set([...(await localPdfIds()), ...(await shippedIds())])
}

// Original PDF files kept on this device (IndexedDB), keyed by song id.
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

export const putPdf = (id, blob) => tx('readwrite', (s) => s.put(blob, id))
export const getPdf = (id) => tx('readonly', (s) => s.get(id))
export const hasPdf = async (id) => {
  try {
    return !!(await getPdf(id))
  } catch {
    return false
  }
}
export const deletePdf = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {})
export const clearPdfs = () => tx('readwrite', (s) => s.clear()).catch(() => {})
export const pdfIds = async () => {
  try {
    return new Set(await tx('readonly', (st) => st.getAllKeys()))
  } catch {
    return new Set()
  }
}

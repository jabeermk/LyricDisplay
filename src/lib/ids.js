// crypto.randomUUID only exists in secure contexts (https / localhost), not plain-http LAN.
export function makeId(prefix = '') {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    try {
      return prefix + c.randomUUID()
    } catch {
      /* fall through to the fallback */
    }
  }
  let rnd
  if (c && typeof c.getRandomValues === 'function') {
    const a = new Uint32Array(3)
    c.getRandomValues(a)
    rnd = Array.from(a, (n) => n.toString(36)).join('')
  } else {
    rnd = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  }
  return `${prefix}${Date.now().toString(36)}-${rnd}`
}

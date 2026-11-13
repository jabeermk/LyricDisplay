// Unicode script detection -> language name / BCP-47 code.
const RANGES = [
  ['Malayalam', 'ml', [[0x0d00, 0x0d7f]]],
  ['Tamil', 'ta', [[0x0b80, 0x0bff]]],
  ['Hindi', 'hi', [[0x0900, 0x097f]]], // Devanagari
  ['Bengali', 'bn', [[0x0980, 0x09ff]]],
  ['Punjabi', 'pa', [[0x0a00, 0x0a7f]]],
  ['Gujarati', 'gu', [[0x0a80, 0x0aff]]],
  ['Odia', 'or', [[0x0b00, 0x0b7f]]],
  ['Telugu', 'te', [[0x0c00, 0x0c7f]]],
  ['Kannada', 'kn', [[0x0c80, 0x0cff]]],
  ['Sinhala', 'si', [[0x0d80, 0x0dff]]],
  ['Thai', 'th', [[0x0e00, 0x0e7f]]],
  ['Arabic', 'ar', [[0x0600, 0x06ff], [0x0750, 0x077f], [0xfb50, 0xfdff], [0xfe70, 0xfeff]]],
  ['Hebrew', 'he', [[0x0590, 0x05ff]]],
  ['Russian', 'ru', [[0x0400, 0x04ff]]],
  ['Korean', 'ko', [[0xac00, 0xd7af]]],
  ['Japanese', 'ja', [[0x3040, 0x30ff]]],
  ['Chinese', 'zh', [[0x4e00, 0x9fff]]],
]
const URDU = /[ٹڈڑںےۓ]/

export const LANGUAGE_SUGGESTIONS = [
  'English', 'Malayalam', 'Hindi', 'Tamil', 'Arabic', 'Telugu', 'Kannada', 'Bengali', 'Urdu',
  'Marathi', 'Gujarati', 'Punjabi', 'Sanskrit', 'Latin', 'Spanish', 'French',
]
export const TAG_SUGGESTIONS = ['Melody', 'Fast', 'Medley', 'Devotional']

const CODES = Object.fromEntries([
  ...RANGES.map(([n, c]) => [n.toLowerCase(), c]),
  ['english', 'en'], ['urdu', 'ur'], ['marathi', 'mr'], ['sanskrit', 'sa'], ['latin', 'la'],
  ['spanish', 'es'], ['french', 'fr'], ['german', 'de'], ['portuguese', 'pt'], ['italian', 'it'],
])

export function languageCode(name) {
  return CODES[String(name || '').trim().toLowerCase()]
}

const NON_LATIN_CODES = new Set(RANGES.map((r) => r[1]).concat(['ur', 'mr', 'sa']))
export function isNonLatinCode(code) {
  return !!code && NON_LATIN_CODES.has(code)
}

const LATIN = /[A-Za-zÀ-ɏ]/

/** Returns {name, code} of the dominant script, or null if there are no letters. */
export function detectScript(text) {
  if (!text) return null
  const counts = new Map()
  let latin = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp < 0x80 || (cp >= 0xc0 && cp <= 0x24f)) {
      if (LATIN.test(ch)) latin++
      continue
    }
    for (const [name, , ranges] of RANGES) {
      if (ranges.some(([a, b]) => cp >= a && cp <= b)) {
        counts.set(name, (counts.get(name) || 0) + 1)
        break
      }
    }
  }
  let best = null
  let bestN = 0
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name
      bestN = n
    }
  }
  if (!best && !latin) return null
  if (!best || latin > bestN) return { name: 'English', code: 'en' }
  if (best === 'Arabic' && URDU.test(text)) return { name: 'Urdu', code: 'ur' }
  return { name: best, code: CODES[best.toLowerCase()] }
}

export function detectLanguage(text) {
  return detectScript(text)?.name || ''
}

/** lang attribute for one lyric line. */
export function lineLang(line, songLang) {
  const s = detectScript(line)
  const base = languageCode(songLang)
  if (!s) return base
  if (s.name === 'English') {
    return base && isNonLatinCode(base) ? `${base}-Latn` : base || 'en'
  }
  return s.code
}

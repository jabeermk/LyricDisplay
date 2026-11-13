// Generates PNG icons with no dependencies (zlib only).
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const p = pixel((x + ox) / size, (y + oy) / size)
        r += p[0]; g += p[1]; b += p[2]; a += p[3]
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r / 4; raw[o + 1] = g / 4; raw[o + 2] = b / 4; raw[o + 3] = a / 4
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const BG = [20, 17, 15, 255], ACC = [255, 169, 77, 255], CLEAR = [0, 0, 0, 0]
const rrect = (u, v, x0, y0, x1, y1, r) => {
  const cx = Math.min(Math.max(u, x0 + r), x1 - r), cy = Math.min(Math.max(v, y0 + r), y1 - r)
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r
}
// scale: glyph scale (smaller for maskable safe zone); rounded: transparent rounded corners
const make = (scale, rounded) => (u, v) => {
  if (rounded && !rrect(u, v, 0, 0, 1, 1, 0.22)) return CLEAR
  const s = (a) => 0.5 + (a - 0.5) / scale
  const x = s(u), y = s(v)
  const dark = rrect(x, y, 0.32, 0.37, 0.68, 0.425, 0.026) || rrect(x, y, 0.285, 0.475, 0.715, 0.53, 0.026) || rrect(x, y, 0.365, 0.58, 0.635, 0.635, 0.026)
  if ((x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.33 ** 2) return dark ? BG : ACC
  return BG
}
mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', png(192, make(1, true)))
writeFileSync('public/icons/icon-512.png', png(512, make(1, true)))
writeFileSync('public/icons/icon-maskable-512.png', png(512, make(1.25, false)))
console.log('icons written')

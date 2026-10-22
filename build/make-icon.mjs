// Generates build/icon.ico (multi-resolution) and build/icon.png (512) from
// build/icon-source.png, the Unbound master artwork.
//
// One-off build tool. Run: npm install --no-save sharp png-to-ico && node build/make-icon.mjs
//
// There is no vector source: the brand mark was supplied as a 1254x1254 PNG.
// icon-source.png is kept in-repo as the master so the .ico and the 512px icon
// can always be regenerated. Do not edit icon.png by hand — it is an output.
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const master = await readFile(path.join(dir, 'icon-source.png'))

// Flatten onto a square canvas at 1024 so every downstream size downscales
// crisply and nothing depends on the source's exact dimensions.
const square = await sharp(master)
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = []
for (const s of sizes) {
  pngs.push(await sharp(square).resize(s, s).png().toBuffer())
}

await writeFile(path.join(dir, 'icon.png'), await sharp(square).resize(512, 512).png().toBuffer())
const ico = await pngToIco(pngs)
await writeFile(path.join(dir, 'icon.ico'), ico)
console.log(`wrote icon.ico (${ico.length} bytes, sizes ${sizes.join('/')}) and icon.png (512)`)

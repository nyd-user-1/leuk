/**
 * Compress leuk illustration PNGs to AVIF and upload them to Vercel Blob.
 *
 * Usage:
 *   node --env-file=.env.local scripts/ingest-leuk-assets.mjs
 *
 * Source:  public/leuk-1a.png, public/leuk-2.png … public/leuk-11.png
 * Encode:  sharp → AVIF (quality 60), dimensions preserved
 * Land at: assets/leuk-1a.avif … assets/leuk-11.avif  (public, stable path)
 *
 * Adapted from the sports project's ingest-blob-photos.mjs upload loop.
 */

import { put } from '@vercel/blob'
import sharp from 'sharp'
import { readFileSync, statSync } from 'fs'
import { join } from 'path'

const PUBLIC = 'public'
const PREFIX = 'assets/'
const QUALITY = 60

// The set the user asked for: 1a, then 2 through 11.
const NAMES = ['leuk-1a', ...Array.from({ length: 10 }, (_, i) => `leuk-${i + 2}`)]

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    console.error('Missing BLOB_READ_WRITE_TOKEN. Run with:')
    console.error('  node --env-file=.env.local scripts/ingest-leuk-assets.mjs')
    process.exit(1)
  }

  const results = []
  let srcTotal = 0
  let outTotal = 0

  for (const name of NAMES) {
    const src = join(PUBLIC, `${name}.png`)
    let srcBytes
    try {
      srcBytes = statSync(src).size
    } catch {
      console.warn(`  ⚠ ${name}.png not found — skipping`)
      continue
    }

    const avif = await sharp(readFileSync(src)).avif({ quality: QUALITY, effort: 4 }).toBuffer()
    const pathname = `${PREFIX}${name}.avif`

    const blob = await put(pathname, avif, {
      access: 'public',
      contentType: 'image/avif',
      addRandomSuffix: false, // stable, predictable asset URLs
      allowOverwrite: true,
      token,
    })

    srcTotal += srcBytes
    outTotal += avif.length
    const kb = (n) => (n / 1024).toFixed(0).padStart(5)
    console.log(`  ✓ ${name.padEnd(11)} ${kb(srcBytes)} KB → ${kb(avif.length)} KB avif   ${blob.url}`)
    results.push({ name, url: blob.url, srcBytes, outBytes: avif.length })
  }

  console.log(
    `\nDone. ${results.length} images  ${(srcTotal / 1024 / 1024).toFixed(1)} MB → ` +
      `${(outTotal / 1024 / 1024).toFixed(2)} MB  (${(100 - (outTotal / srcTotal) * 100).toFixed(1)}% smaller)`,
  )
  console.log('\nURLs:')
  results.forEach((r) => console.log(`  ${r.name}: ${r.url}`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

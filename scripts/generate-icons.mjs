// Regenerate Bite Book icons + favicons from public/bb-logo.png (4K source).
// Run: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = join(root, 'public', 'bb-logo.png')

const outputs = [
  { file: 'icon-192x192.png', size: 192 },
  { file: 'icon-512x512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-16.png', size: 16 },
]

for (const { file, size } of outputs) {
  const out = join(root, 'public', file)
  await sharp(src)
    .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(`wrote ${out} (${size}x${size})`)
}

// Shrinks oversized images in public/media in place: resizes anything wider
// than MAX_WIDTH (the homepage visual displays at 680px, so 2x retina needs
// ~1400px at most) and recompresses PNGs. next/image re-encodes to WebP/AVIF
// per device in production, so the source just needs to stop being huge.
//
// Run from the project root:  node scripts/compress-media.mjs

import { readdirSync, statSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const MEDIA_DIR = "public/media";
const MAX_WIDTH = 1400;
const MIN_BYTES = 150 * 1024; // leave already-small files alone

for (const name of readdirSync(MEDIA_DIR)) {
  if (!/\.png$/i.test(name)) {
    continue;
  }

  const filePath = join(MEDIA_DIR, name);
  const before = statSync(filePath).size;

  if (before < MIN_BYTES) {
    console.log(`Skipped (already small): ${name} (${Math.round(before / 1024)}KB)`);
    continue;
  }

  const image = sharp(filePath);
  const meta = await image.metadata();
  const width = Math.min(meta.width ?? MAX_WIDTH, MAX_WIDTH);

  const tmpPath = `${filePath}.tmp`;
  await image
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(tmpPath);

  const after = statSync(tmpPath).size;

  if (after >= before) {
    unlinkSync(tmpPath);
    console.log(`Skipped (no gain): ${name}`);
    continue;
  }

  unlinkSync(filePath);
  renameSync(tmpPath, filePath);
  console.log(
    `Compressed: ${name} ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB (width ${width}px)`
  );
}

console.log("Done.");

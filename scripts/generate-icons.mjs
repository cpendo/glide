import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, '../assets/icons');
const source = resolve(iconsDir, 'icon-original.png');

const sizes = [16, 48, 128];

for (const size of sizes) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 242, g: 232, b: 207, alpha: 1 } })
    .png()
    .toFile(resolve(iconsDir, `icon-${size}.png`));

  console.log(`Generated icon-${size}.png`);
}

console.log('Done!');

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
async function optimizeHero() {
  const source = path.join(root, 'assets/hero-wga-bali.png');
  for (const width of [640, 1280]) {
    const target = path.join(root, `assets/hero-wga-bali-${width}.webp`);
    if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(source).mtimeMs)
      continue;
    await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(target);
    console.log(`${path.basename(target)}: ${Math.round(fs.statSync(target).size / 1024)} KB`);
  }
}
module.exports = { optimizeHero };
if (require.main === module)
  optimizeHero().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

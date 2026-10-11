const fs = require('node:fs');
const path = require('node:path');
const { optimizeHero } = require('./optimize-images.cjs');

// Only this allowlist is public. Backend source, backups and secrets never enter dist.
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
async function build() {
  await optimizeHero();
  // Replace generated output only. Never follow a symlink or remove source assets.
  if (
    path.dirname(output) !== root ||
    path.basename(output) !== 'dist' ||
    (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())
  )
    throw new Error('Unsafe build output path');
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const entry of [
    'index.html',
    'katalog.html',
    'ulasan.html',
    'admin.html',
    'admin-catalog.html',
    'admin-moments.html',
    'admin-reviews.html',
    'momen.html',
    'robots.txt',
    'sitemap.xml',
    'css',
    'js',
    'assets',
  ]) {
    fs.cpSync(path.join(root, entry), path.join(output, entry), {
      recursive: true,
      filter: (source) =>
        !['WGA-Decoration-Catalogue.pdf', 'hero-wga-bali.png'].includes(path.basename(source)),
    });
  }
  console.log('Public assets prepared in dist/. Vercel builds api/ separately.');
}
build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

const fs = require('node:fs/promises');
const path = require('node:path');

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !secretKey) {
  console.error('SUPABASE_URL dan SUPABASE_SECRET_KEY wajib tersedia di .env.local.');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const bucket = 'wga-catalog';
const records = [
  ['Gayor + Angkul-Angkul', 'Dekor'],
  ['Gayor', 'Dekor'],
  ['Gayor Panggung', 'Dekor'],
  ['Tetaring', 'Dekor'],
  ['Photo Booth', 'Dekor'],
  ['Stand Foto', 'Dekor'],
  ['Tenda Kubu VIP / Kain', 'Tenda'],
  ['Tenda VIP / Kain', 'Tenda'],
  ['Tenda Biasa & Tenda Kubu', 'Tenda'],
  ['Tenda Pemios', 'Tenda'],
  ['Bale Metatah', 'Dekor'],
  ['Panggung / Triplek', 'Panggung'],
  ['Meja Buffe / Prasmanan', 'Meja'],
  ['Meja Panjang', 'Meja'],
  ['Meja Banten & Meja Kaca', 'Meja'],
  ['Meja Bundar', 'Meja'],
  ['Warung / Meja Welcome Drink', 'Warung'],
  ['Kursi', 'Kursi'],
  ['Sound & Lighting', 'Sound & Lighting'],
  ['TV & Kipas / Uap', 'Peralatan'],
  ['Alat Makan & Minum (1)', 'Alat Makan'],
  ['Alat Makan & Minum (2)', 'Alat Makan'],
  ['Alat Makan & Minum (3)', 'Alat Makan'],
  ['Alat Makan & Minum (4)', 'Alat Makan'],
  ['Kain Dinding', 'Kain Dinding'],
  ['Proyektor + Layar & Lampu', 'Peralatan'],
  ['Karpet & Sanggah Surya', 'Peralatan'],
  ['Alat Masak (1)', 'Alat Masak'],
  ['Alat Masak (2)', 'Alat Masak'],
  ['Alat Masak (3)', 'Alat Masak'],
];

const baseUrl = new URL(supabaseUrl).origin;
const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(`${response.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function upload(relativePath, buffer, mimeType) {
  await request(`${baseUrl}/storage/v1/object/${bucket}/${relativePath}`, {
    method: 'POST',
    body: buffer,
    headers: { 'Content-Type': mimeType, 'x-upsert': 'true' },
  });
}

async function main() {
  const categories = [...new Set(records.map(([, category]) => category))].map((name) => ({ name }));
  await request(`${baseUrl}/rest/v1/catalog_categories?on_conflict=name`, {
    method: 'POST',
    body: JSON.stringify(categories),
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
  });

  for (let index = 0; index < records.length; index += 1) {
    const page = index + 1;
    const [title, category] = records[index];
    const originalPath = `legacy/page-${String(page).padStart(2, '0')}.jpg`;
    const thumbPath = `legacy/thumbs/page-${String(page).padStart(2, '0')}-thumb.jpg`;
    const original = await fs.readFile(path.join(root, 'assets', 'catalog', 'pages', `page-${String(page).padStart(2, '0')}.jpg`));
    const thumbnail = await fs.readFile(path.join(root, 'assets', 'catalog', 'thumbs', `page-${String(page).padStart(2, '0')}-thumb.jpg`));
    await upload(originalPath, original, 'image/jpeg');
    await upload(thumbPath, thumbnail, 'image/jpeg');
    const url = `${baseUrl}/storage/v1/object/public/${bucket}/${originalPath}`;
    const thumbUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${thumbPath}`;
    await request(`${baseUrl}/rest/v1/catalog_items?on_conflict=legacy_page`, {
      method: 'POST',
      body: JSON.stringify({
        path: originalPath,
        thumb_path: thumbPath,
        title,
        category,
        url,
        thumb_url: thumbUrl,
        mime_type: 'image/jpeg',
        bytes: original.length,
        thumb_bytes: thumbnail.length,
        legacy_page: page,
      }),
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });
    console.log(`Imported ${page}/${records.length}: ${title}`);
  }
  console.log('Katalog lama berhasil dipindahkan ke Supabase.');
}

main().catch((error) => {
  console.error(`Import katalog gagal: ${error.message}`);
  process.exitCode = 1;
});

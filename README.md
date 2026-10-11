# WGA Dekorasi

Website HTML/CSS/JS dengan API Vercel Functions, database dan penyimpanan foto
Supabase, serta Cloudflare Turnstile untuk ulasan dan login admin.
Katalog, galeri momen, dan ulasan dikelola melalui halaman admin terpisah.

## Menjalankan lokal

Dari direktori proyek:

```powershell
npm install
npm run dev
```

Buka `http://127.0.0.1:3000/index.html`. Gunakan Node.js 24.
Halaman baru: `/ulasan.html` dan `/admin.html`. Tanpa konfigurasi, formulir dan
login sengaja nonaktif. Ikuti [panduan setup](docs/reviews-setup.md).
Google Fonts, Google Maps, dan Turnstile memerlukan internet.
Server Python hanya cocok untuk preview halaman statis, bukan API.

## Struktur

| File/folder                 | Tanggung jawab                                                        |
| --------------------------- | --------------------------------------------------------------------- |
| `index.html`                | Beranda, layanan, 10 preview katalog, tentang, kontak                 |
| `katalog.html`              | Katalog database dengan pencarian, kategori, dan pagination           |
| `css/style.css`             | Token desain, komponen, breakpoint, dan penyesuaian komponen          |
| `js/main.js`                | Inisialisasi navigasi, tahun footer, highlight, dan lightbox          |
| `js/catalog-data.js`        | Metadata 30 halaman katalog: ID, judul, kategori                      |
| `js/catalog.js`             | Kartu katalog, filter server, pagination, dan katalog cadangan       |
| `assets/`                   | Foto, logo, thumbnail, dan halaman katalog                            |
| `ulasan.html`, `admin.html` | Form dan daftar ulasan, login serta moderasi admin                    |
| `api/`, `server/`           | Endpoint Vercel dan validasi/autorisasi sisi server                   |
| `supabase/migrations/`      | Skema, hak akses database, rate limit, dan audit                      |
| `scripts/`, `tests/`        | Server lokal, build allowlist, tes API dan PostgreSQL                 |
| `docs/`                     | Catatan review dan urutan pengembangan berikutnya                     |
| `tmp/`                      | Backup, alat pemeriksaan, dan hasil screenshot lokal; jangan diunggah |

## Aturan pemeliharaan

- `catalog-data.js` harus dimuat sebelum `catalog.js`; keduanya memakai `defer`.
  `main.js` menyediakan `window.WGALightbox` untuk membuka detail kartu.
- Katalog aktif berasal dari database. Cadangan 30 item hanya dipakai jika API
  gagal dan ditandai sebagai cadangan. Respons database kosong tetap ditampilkan kosong.
- Tambahkan foto lewat admin, bukan menulis kartu HTML manual. `legacy_page`
  mempertahankan urutan katalog lama; foto baru berurutan paling akhir.
- Halaman galeri publik/admin mengambil 24 item per permintaan dan otomatis memuat
  berikutnya saat scroll mendekati bawah daftar; beranda tetap mengambil 10.
  Tombol manual tersedia jika browser tidak mendukung IntersectionObserver atau
  sebagai tombol coba lagi saat koneksi gagal.
- `js/admin-media.js` membaca foto sekali dan mengecilkan kiriman beserta thumbnail
  hingga JSON di bawah 4 MiB. Jangan menaikkan batas API tanpa meninjau batas hosting.
- Urutan CSS merupakan bagian dari kontrak tampilan: aturan dasar, breakpoint,
  kemudian penyesuaian komponen. Jangan memindahkan semua media query ke akhir
  tanpa memeriksa cascade dan membandingkan tampilan desktop/mobile.
- Pertahankan whitespace HTML yang signifikan. Konfigurasi Prettier memakai
  `htmlWhitespaceSensitivity: strict` untuk menjaga jarak teks dan elemen inline.
- Samakan versi URL stylesheet/script pada kedua halaman saat memperbarui aset.
- File gambar katalog dan harga di dalamnya tidak diubah saat refactor.

## Pemeriksaan setelah perubahan

Periksa beranda dan katalog pada lebar 320, 390, 640, 768, 1024, dan 1440 px.
Coba menu mobile, Escape, lightbox, pencarian, kategori, reset hasil kosong,
serta highlight saat scroll. Bandingkan dengan tampilan sebelum perubahan.

Alat pemeriksaan refactor disimpan di `tmp/verify-refactor.cjs`. Backup dan
screenshot berada di `tmp/refactor-backup-*` dan `tmp/refactor-verification/`.
Alat ini hanya untuk pengembangan dan tidak menjadi dependensi website.

Untuk format kode dengan Prettier yang sudah disiapkan lokal:

```powershell
node tmp/refactor-tools/node_modules/prettier/bin/prettier.cjs --write index.html katalog.html css/style.css js/*.js
```

## Hosting

Konfigurasi Vercel ada di `vercel.json`: build `npm run build`, output `dist`,
dan API Node di `api/`. Build hanya menyalin aset publik yang diizinkan.
Jangan unggah `.env.local`, `tmp/`, backup, atau secret key ke repository.
Jalankan `npm test` dan `npm run build` sebelum mencoba Vercel Preview.
Setup layanan dan pengujian integrasi nyata wajib selesai sebelum produksi.
Jalankan migrasi yang belum diterapkan sesuai urutan. Perubahan optimasi terbaru
memerlukan `supabase/migrations/006_gallery_performance.sql` untuk indeks browsing
dan agregasi statistik ulasan. Tidak ada data lama yang dihapus.

Build membuat varian WebP foto utama dan membersihkan `dist/` sebelum menyalin
allowlist aset publik. PDF katalog sumber dan PNG hero asli tetap ada di `assets/`,
tetapi tidak ikut paket publik. Jangan menyimpan file manual di `dist/`.

Lihat [hasil optimasi dan pemeriksaan](docs/optimization-review.md) untuk batas
pengujian dan langkah sebelum deploy. Perubahan lokal tidak otomatis dipublikasikan.

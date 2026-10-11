# Review struktur dan pekerjaan berikutnya

## Tahap 1 — perapian tanpa redesign

Temuan awal:

- CSS dasar dipadatkan dalam baris panjang, lalu ditambah banyak override hasil
  iterasi desain. Memindahkan urutannya sembarangan dapat mengubah mobile.
- Font statistik memiliki aturan bertentangan yang akhirnya ditimpa `!important`.
- Badge hero dan frame bagian dalam memiliki style yang sudah tidak digunakan.
- Beranda masih menyimpan galeri tersembunyi dengan sepuluh referensi `.webp`
  yang tidak tersedia pada folder katalog saat ini.
- Metadata katalog bercampur dengan rendering, pencarian, dan event handler.
- JavaScript umum menggabungkan seluruh state fitur dalam satu blok.
- README lama menyebut 27 item, sedangkan katalog aktif berisi 30 halaman.
- Website masih statis; belum ada penyimpanan ulasan, autentikasi admin, upload,
  pembatasan request di server, atau proses pengolahan gambar.

Perapian:

- Format HTML/CSS/JavaScript konsisten, tanpa mengurutkan ulang cascade CSS.
- Metadata katalog dipindahkan ke `js/catalog-data.js` dan dibuat read-only.
- Navigasi, footer, highlight, dan lightbox memiliki fungsi inisialisasi sendiri.
- Logika filter hanya diinisialisasi pada halaman katalog.
- Galeri tersembunyi lama dan CSS khusus yang tidak lagi digunakan dihapus.
- Font statistik disatukan pada aturan efektif yang sama, tanpa `!important`.
- Versi aset disamakan di kedua halaman; dokumentasi diperbarui.

Konten aktif, urutan kartu (termasuk halaman 10 sebelum 9 di beranda), aset foto,
tautan, warna, ukuran, breakpoint, dan animasi yang ada dipertahankan.
Style inline peta tetap dipertahankan pada tahap ini karena prioritasnya juga
mempengaruhi perilaku hover; penghapusannya membutuhkan pemeriksaan tersendiri.

## Status backend — implementasi lokal, menunggu setup layanan

Hosting yang dipakai adalah Vercel. Beranda dan katalog lama tetap dipertahankan.
Tahap ulasan memiliki skema Supabase, API Vercel, Turnstile, formulir tanpa login,
dan login/moderasi admin. Halaman baru belum ditautkan dari beranda.
Tidak ada migrasi database cloud atau deployment produksi yang dijalankan.

Tes lokal API dan PostgreSQL (PGlite) mencakup validasi, pembatasan request,
otorisasi, moderasi atomik, dan penolakan akses database langsung. Pengujian
browser memakai layanan tiruan; bukan bukti koneksi Supabase/Turnstile nyata.

Langkah terdekat: buat proyek Supabase **dev**, jalankan migrasi, buat admin,
atur Turnstile dan environment lokal, lalu uji alur nyata sampai moderasi.
Panduan bertahap ada di [reviews-setup.md](reviews-setup.md).

## Antrean pekerjaan

Kerjakan tahap ulasan sampai lolos integrasi dan Preview sebelum beralih ke galeri.

1. **Ulasan klien dan moderasi minimum admin.** Nama, lokasi, bintang 1–5,
   komentar; pengunjung tidak perlu login. Form masuk ke admin untuk ditinjau;
   hanya ulasan yang disetujui tampil publik. Rancang validasi sisi server,
   batas panjang/payload, pembatasan request, pemeriksaan bot, penanganan duplikat,
   serta output teks yang aman. Pengamanan admin menggunakan autentikasi dan
   otorisasi server. Jangan mengandalkan validasi atau rahasia di JavaScript browser.
2. **Galeri foto lapangan.** Terpisah dari katalog sewa. Admin mengunggah hasil
   pemasangan dan memilih kategori; halaman publik memiliki Semua/per kategori.
3. **Admin panel lengkap dan skala foto.** Kelola ulasan, foto, dan kategori.
   Rancang penyimpanan objek, proses thumbnail/varian ukuran, validasi upload,
   pagination, lazy loading, dan pengiriman gambar melalui cache/CDN. Ribuan foto
   tidak dimuat sekaligus pada browser; gambar asli tidak menjadi thumbnail.

Ketentuan keamanan dan kapasitas perlu diuji saat implementasi. Logika formulir
saja tidak menjamin perlindungan DDoS: pembatasan di aplikasi perlu dipadukan
dengan perlindungan jaringan/edge pada hosting. Pemilihan dan konfigurasi
layanannya dilakukan pada tahap backend, bukan ditambahkan pada refactor ini.

## Batas pemeriksaan visual

Pembanding lokal memakai browser Edge headless di enam ukuran layar, dengan
reduced motion dan resource eksternal diblokir agar hasil konsisten. Google Maps
dan webfont online tidak dinilai pada pembanding ini. Foto disimpan dalam
screenshot asli; pada perbandingan pixel layout, area bitmap dimask karena
resampling gambar full-page dapat bervariasi. Teks, bidang, ikon SVG, dan posisi
elemen tetap dibandingkan. Hasil mentah ada di `tmp/refactor-verification/`.

Hasil tahap 1: seluruh 12 pembanding (dua halaman × enam lebar layar) memiliki
0 pixel berbeda pada area yang dibandingkan. Tidak ada error JavaScript,
overflow horizontal, atau gambar aktif yang gagal dimuat. Menu mobile,
lightbox/Escape, filter Tenda, pencarian tanpa hasil, dan reset katalog lulus.
Pemeriksaan sintaks JavaScript dan format Prettier juga lulus.

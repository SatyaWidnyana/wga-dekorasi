# Perbaikan dan pemeriksaan — 11 Oktober 2026

## Yang berubah

- Hero asli 3.17 MiB mendapat varian WebP 640 px (~104 KiB) dan 1280 px (~300 KiB).
  Foto dan merek tidak diganti. Browser memilih ukuran melalui `srcset`.
- Build dibersihkan setiap kali; PDF sumber 113 MiB dan PNG hero asli tidak disalin
  ke `dist`. File sumber tetap disimpan. Paket publik turun menjadi sekitar 12.8 MiB.
  Ukuran paket bukan ukuran yang harus diunduh setiap pengunjung.
- Katalog publik/admin menggunakan cursor yang mengikuti urutan legacy lalu waktu
  upload. Beranda tetap 10 item; halaman daftar 24 item per permintaan, otomatis
  dilanjutkan saat scroll mendekati bawah daftar. Tombol manual hanya fallback/retry.
  Filter dan pencarian katalog bekerja di server, termasuk item di halaman berikutnya.
- Foto admin baru tetap di akhir. Hapus/upload memperbarui kartu terkait tanpa
  merender ulang semua gambar; state foto terhapus tidak muncul kembali.
- Upload membaca sumber satu kali, menghasilkan gambar dan thumbnail, dan mengurangi
  kualitas/dimensi bila diperlukan. Total JSON dibatasi 4 MiB, di bawah batas request
  [Vercel Functions 4.5 MB](https://vercel.com/docs/functions/limitations).
  Transport masih JSON/base64, bukan direct signed upload.
- Server memeriksa signature JPG/PNG/WebP, batas request, login, keanggotaan admin,
  origin, dan rate limit. Pengecekan signature bukan pemindaian malware penuh.
- Cleanup kedua file tetap dicoba meskipun salah satunya gagal.
  Jika penyimpanan metadata timeout, server mengecek apakah row sebenarnya sudah
  tersimpan sebelum cleanup; foto tidak dihapus bila hasil transaksi belum pasti.
- Ditambahkan CSP, Permissions-Policy, HSTS untuk produksi, no-store/noindex untuk
  semua halaman admin. CSP mengizinkan sumber font, Maps dan
  [Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
  yang digunakan situs, tanpa mengizinkan inline script atau eval.
- Permintaan filter momen lama dibatalkan; respons terlambat tidak mengganti kategori
  terbaru. Ukuran preview stabil dan tidak memakai foto sebelumnya.
- Timeout browser memakai AbortController tanpa bergantung pada AbortSignal.timeout.
  CSS mendapat fallback vh dan perbaikan dekorasi ulasan yang menyebabkan overflow mobile.
- Migrasi 006 menambah indeks dan RPC statistik seluruh ulasan non-rejected. Sebelum
  migrasi dijalankan, fallback masih menghitung seluruh halaman, tetapi lebih boros query.

## Pemeriksaan

- `npm test`: tes API, validasi upload, otorisasi, pagination, cleanup, dan database
  lokal PGlite yang menjalankan seluruh migrasi 001–006. Data uji hanya berada di memori.
- Hasil akhir: 29 tes lulus, `npm audit` melaporkan 0 kerentanan dependensi yang dikenal.
- `npm run build`: hasil publik memakai allowlist; backend dan environment tidak disalin.
- `node scripts/check-build.cjs`: syntax 37 file JavaScript, referensi aset, marker
  secret, allowlist publik, dan keberadaan file sumber lulus; output 12.76 MiB.
- `node scripts/check-browser.cjs`: Edge headless, 8 halaman, lebar 320/390/768/1440;
  cek overflow, error JavaScript/CSP, 10 item beranda, paging/pencarian, pergantian
  filter cepat, lightbox, dan hapus lalu upload. Semua API dimock: tidak menulis Supabase.
  Runner ini memakai Playwright yang tersedia di `tmp/refactor-tools/node_modules`.
- `node scripts/check-auto-paging.cjs`: scroll otomatis katalog/momen publik dan
  admin di lebar 390/1440, urutan tanpa duplikat, berhenti di akhir daftar, retry
  kegagalan tanpa loop, satu request bersamaan, dan beranda tetap 10 item.

## Sebelum deploy

1. Jalankan **006_gallery_performance.sql** sekali di SQL Editor Supabase, setelah 005.
2. Restart server lokal setelah perubahan backend: `npm run dev`.
3. Jalankan tes dan build; deploy hanya bila sudah siap. Perubahan ini belum dideploy.
4. Uji login/Turnstile, satu upload nyata, dan hapus foto uji pada Vercel Preview.
   Pastikan ALLOWED_ORIGINS dan hostname Turnstile sesuai domain preview/produksi.
5. Uji Safari/iPhone dan koneksi seluler nyata; emulasi lebar layar bukan sertifikasi
   seluruh browser. Pantau bandwidth/storage Supabase dan latency setelah deploy.

Pengujian ini bukan jaminan bebas celah atau benchmark server produksi. Transaksi
database dan Storage tetap dua layanan terpisah; gangguan jaringan bisa memerlukan
pemeriksaan manual objek yatim. Konfigurasi backup, kuota, serta pekerjaan cleanup
hash ulasan terjadwal di Supabase tetap perlu dicek di lingkungan produksi.

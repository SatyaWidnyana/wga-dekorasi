# Panduan mengaktifkan ulasan WGA — kerjakan dari tahap 1

Kode backend, form, dan moderasi sudah tersedia. Belum ada database cloud yang
dibuat atau deployment yang dipublikasikan. Website utama tetap seperti sebelumnya.
Halaman baru sengaja belum ditautkan dari beranda sebelum lolos uji Preview.

## 1. Buat project Supabase pengembangan

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) menggunakan akunmu.
2. Pilih **New project** pada organisasi yang kamu gunakan.
3. Beri nama `wga-dekorasi-dev`, buat password database yang kuat, dan simpan
   password itu di password manager. Pilih region terdekat yang tersedia.
4. Tunggu project selesai disiapkan. Tidak perlu mengubah domain atau Vercel dahulu.

**Checkpoint:** beri tahu bahwa project sudah siap. Tidak perlu mengirim password,
API secret, atau connection string. Kita bisa melanjutkan panduan dari sini.

## 2. Buat tabel dan aturan database

1. Di project **dev**, buka **SQL Editor → New query**.
2. Salin seluruh `supabase/migrations/001_reviews.sql`, lalu **Run** sekali.
3. Pastikan muncul tabel `reviews`, `review_admins`, `review_moderation_log`,
   dan `review_rate_limits`. Semuanya menggunakan RLS dan tidak memberi akses
   langsung kepada role pengunjung/user biasa.
4. Simpan migrasi ini sebagai riwayat. Jangan menjalankan ulang setelah berhasil;
   perubahan berikutnya menggunakan file migrasi bernomor baru.

RLS dan privilege bekerja bersama. Secret key server melewati RLS, sehingga
API juga selalu memeriksa autentikasi/otorisasi sebelum operasi admin.
[Referensi Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 3. Siapkan akun admin

1. Pada pengaturan Authentication, matikan **Allow new users to sign up** dan
   jangan aktifkan anonymous sign-in. Tetap aktifkan login email/password.
2. Di **Authentication → Users**, buat user admin dengan email milikmu dan
   password unik yang kuat. Konfirmasikan user sesuai opsi dashboard.
3. Salin **User UID**, bukan email/password, lalu jalankan SQL berikut dengan UID asli:

```sql
insert into public.review_admins (user_id)
values ('GANTI_DENGAN_USER_UID')
on conflict (user_id) do nothing;
```

Tidak ada fitur pendaftaran admin publik. Akun yang login tanpa baris di
`review_admins` tetap tidak mendapat akses. Menghapus membership mencabut akses
pada pemeriksaan API berikutnya. Dashboard hanya menyimpan access token dalam
cookie HttpOnly/SameSite Strict; Secure diterapkan pada Vercel. Tidak ada token
di localStorage. Sesi maksimal satu jam, tanpa refresh otomatis.

Login proxy aplikasi sudah memverifikasi Turnstile sendiri sebelum menghubungi
Supabase Auth. Pada **project dev baru ini**, jangan memasang CAPTCHA kedua di
Supabase Auth menggunakan token yang sama: token Turnstile hanya dapat dipakai
sekali. Pembatasan bawaan Supabase Auth tetap berlaku. Publishable key tidak
dikirim ke frontend ini, tetapi jangan menganggap key tersebut sebagai rahasia
atau pengganti proteksi akun. Jika ingin CAPTCHA langsung di Auth atau MFA,
kita perlu menambahkan alur khusus sebelum mengaktifkan pengaturan tersebut.

[Pengaturan Auth](https://supabase.com/docs/guides/auth/general-configuration).

## 4. Buat Cloudflare Turnstile

Turnstile dapat dipakai tanpa memindahkan DNS/domain dari Vercel.

1. Buat/login akun Cloudflare, buka **Turnstile → Add widget**.
2. Buat widget pengembangan WGA, pilih mode **Managed**.
3. Masukkan hostname pengujian: `localhost`, `127.0.0.1`, dan hostname Preview
   Vercel yang benar setelah tersedia. Masukkan domain tanpa `https://`/port/path.
4. Simpan **site key** dan **secret key** di tempat aman. Jangan kirim secret di chat.
5. Gunakan widget dan key terpisah untuk production; jangan izinkan localhost
   pada widget production dan jangan gunakan dummy testing key saat deploy.

Backend ulasan memeriksa `success`, hostname, dan action `review`; backend login
memeriksa action `admin_login`. CAPTCHA yang tidak termuat/kedaluwarsa tidak
membuka jalan pintas untuk mengirim data.
[Validasi Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## 5. Isi environment lokal

Duplikasikan `.env.example` menjadi `.env.local` menggunakan editor. File ini
diabaikan Git dan tidak masuk build publik. Isi:

| Nama                       | Nilai                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| `SUPABASE_URL`             | URL project dev dari Connect dialog                              |
| `SUPABASE_PUBLISHABLE_KEY` | Key `sb_publishable_...` dari API Keys                           |
| `SUPABASE_SECRET_KEY`      | Key server `sb_secret_...`, bukan password database              |
| `TURNSTILE_SITE_KEY`       | Site key widget dev                                              |
| `TURNSTILE_SECRET_KEY`     | Secret key widget dev                                            |
| `ABUSE_HASH_SECRET`        | String acak minimal 32 karakter; gunakan hasil perintah di bawah |
| `ALLOWED_ORIGINS`          | `http://localhost:3000,http://127.0.0.1:3000`                    |
| `TURNSTILE_HOSTNAMES`      | `localhost,127.0.0.1`                                            |
| `REVIEWS_ENABLED`          | `true` setelah semua langkah sebelumnya selesai                  |

Buat secret hash sendiri di terminal lokal (jangan kirim hasilnya ke chat):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

[Lokasi dan perbedaan API keys Supabase](https://supabase.com/docs/guides/getting-started/api-keys).
Implementasi ini memakai jenis key baru, bukan JWT `anon/service_role` lama.

Jalankan:

```powershell
npm install
npm run dev
```

- Beranda: `http://127.0.0.1:3000/`
- Ulasan: `http://127.0.0.1:3000/ulasan.html`
- Admin: `http://127.0.0.1:3000/admin.html`

Restart server setiap mengubah `.env.local` atau kode backend. Server Python
port 8000 hanya melayani file statis; gunakan port 3000 untuk API. Tanpa env,
form dan login tetap tertutup dengan pesan bahwa layanan belum tersedia.

## 6. Aktifkan pembersihan data keamanan

Di Supabase dev, aktifkan **Cron/pg_cron** melalui dashboard. Buat job harian
dengan SQL `select public.wga_cleanup_review_security();`. Contoh jadwal
`0 18 * * *` berarti pukul **02.00 WITA** keesokan harinya jika scheduler memakai UTC.
Periksa timezone yang ditampilkan dashboard.

Fungsi ini menghapus bucket rate-limit kedaluwarsa dan mengosongkan hash koneksi/
deduplikasi untuk ulasan yang lebih tua dari 30 hari. Tanpa job, pembersihan
tidak berjalan otomatis. Pastikan job berhasil sebelum membuka form publik.
[Dokumentasi Supabase Cron](https://supabase.com/docs/guides/cron).

## 7. Uji alur nyata sebelum Preview

1. Kirim satu ulasan uji di halaman ulasan. Respons harus “menunggu peninjauan”.
2. Sebelum persetujuan, ulasan tidak terlihat di daftar publik.
3. Login di `/admin.html`; ulasan harus masuk tab Menunggu.
4. Klik Tampilkan; periksa tab Ditampilkan dan daftar publik.
5. Coba Tolak/Kembalikan ke antrean. Catatan internal tidak pernah muncul publik.
6. Coba akses API admin tanpa login: harus 401; user tanpa membership harus 403.
7. CAPTCHA gagal/kedaluwarsa, input tidak valid, kiriman berulang, dan permintaan
   lintas origin harus ditolak. Jangan menguji banjir request pada production.
8. Periksa baris `review_moderation_log`, hasil job cleanup, dan tidak ada secret
   di respons API/HTML. Hapus data uji melalui dashboard sebelum production.

## 8. Vercel Preview, lalu production pada tahap terpisah

Belum ada deployment yang dilakukan oleh perubahan ini. Saat siap menguji:

- Gunakan branch pengembangan/Preview; jangan push langsung ke branch production.
  Folder lokal saat ini belum merupakan repository Git. Hubungkan ke repository
  Vercel yang benar sebelum menentukan alur push/deploy.
- Framework preset **Other**, Node **24.x**, build `npm run build`, output `dist`.
  Vercel membangun `api/*.js` sebagai Functions terpisah.
- Isi environment di **Preview** dengan project Supabase dev. Jangan mengisi
  secret melalui HTML/JS publik. Sesuaikan `ALLOWED_ORIGINS` dengan URL HTTPS
  Preview persis (tanpa slash akhir) dan hostname pada Turnstile.
- Jika Preview berubah alamat, perbarui allowlist lalu redeploy. Jangan membuka
  wildcard seluruh `*.vercel.app` karena itu mencakup project orang lain.
- `dist/` hanya berisi file publik yang diizinkan. `server/`, migrasi, tests,
  `.env*`, docs, dan backup tidak disalin ke output statis.
- Aktifkan proteksi deployment Preview dan pastikan tidak dapat diindeks.
- Production nanti memakai project database, widget, hash secret, dan environment
  tersendiri. Tetap `REVIEWS_ENABLED=false` sampai checklist uji nyata selesai.

## Keamanan dan batas kapasitas

- Validasi server, batas payload aplikasi 8 KB, panjang teks, rating 1–5,
  persetujuan publikasi, honeypot, dan larangan HTML/link pada komentar.
- Origin allowlist dan pemeriksaan site request; ini lapisan tambahan, bukan
  pengganti CAPTCHA/rate-limit karena klien non-browser bisa memalsukan Origin.
- Ulasan: 5 percobaan/jam per IP (IPv6 dikelompokkan /64), maksimal 3 kiriman
  baru/24 jam per kelompok koneksi, dan fingerprint duplikat 24 jam.
- Login: 10 percobaan/15 menit per kelompok koneksi. Operasi admin dibatasi
  120/menit. Batas global masing-masing scope membatasi beban di database.
- IP mentah tidak disimpan di tabel aplikasi; HMAC digunakan sebagai penanda.
  IP dikirim ke Turnstile untuk verifikasi. Penyedia hosting memiliki log sendiri.
- Semua konten pengguna dimasukkan sebagai teks, bukan `innerHTML`.
- Daftar publik 6 ulasan/halaman; admin 20/halaman, dengan cursor dan indeks.
- Cache publik 60 detik; admin dan respons error tidak di-cache.

Rate limit database mencegah spam kiriman, tetapi request masih mencapai Function
dan database. Tambahkan **Vercel Firewall/WAF rate limits** untuk endpoint API
sebelum produksi, terutama POST `/api/reviews`, POST `/api/admin-session`, serta
GET API agar variasi query acak tidak membanjiri cache/database. Sesuaikan
angka dengan traffic dan batas paket; cek harga di dashboard sebelum mengaktifkan
fitur berbayar. Pantau usage dan alert biaya. Jaringan kantor/shared IP mungkin
terkena batas bersama; sesuaikan berdasarkan data pemakaian.

Vercel menyediakan mitigasi DDoS tingkat platform, tetapi tidak ada janji mutlak
“anti-DDoS/anti-spam”. Proteksi edge, aplikasi, pengaturan akun, dan pemantauan
harus bekerja bersama. [Vercel Firewall](https://vercel.com/docs/vercel-firewall),
[WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Status pengujian kode

`npm test` menjalankan validasi API dengan upstream tiruan dan migrasi asli di
Postgres lokal sementara (PGlite), termasuk privilege, deduplikasi, rate limit,
moderasi, audit, dan cleanup. PGlite bukan database production atau simulasi
konkurensi multi-instance penuh; race condition masih perlu diuji pada staging.
Tidak ada tes yang memakai secret atau project Supabase pengguna.

Uji UI lokal menggunakan backend/CAPTCHA simulasi di `tmp/verify-reviews.cjs`.
Pengujian ini tidak menggantikan uji nyata Supabase Auth, Turnstile, HTTPS cookie,
atau packaging Vercel. Semua itu menunggu konfigurasi akun dan Preview Deployment.

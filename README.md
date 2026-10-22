# 🏥 Antrean Cerdas - Sistem Antrean Digital Universal (PWA & Realtime)

Aplikasi manajemen antrean digital universal generasi baru yang siap pakai (*production & commercial ready*). Dirancang khusus untuk puskesmas, klinik, rumah sakit, instansi pemerintahan, kantor pelayanan publik, perbankan, loket perizinan, dan usaha layanan terpadu.

Mendukung arsitektur **Hybrid Online & Full Offline**: antrean tetap dapat berjalan, dipanggil, dan disinkronkan antar-perangkat secara lokal menggunakan memori peramban (*LocalStorage*) dan *BroadcastChannel* meskipun jaringan internet terputus.

---

## 🌟 Fitur Unggulan Sistem

### 1. 📱 Layar Pasien / Pengunjung (`/`)
* **Pendaftaran Mandiri & Cepat**: Ambil nomor tiket antrean secara instan cukup dengan memasukkan nama.
* **Progressive Web App (PWA)**: Dapat dipasang (*install*) langsung di layar beranda ponsel pintar (Android/iOS) tanpa perlu ke Play Store / App Store.
* **Perkiraan Waktu Tunggu Cerdas**: Estimasi waktu tunggu otomatis yang menyesuaikan ritme loket dan prediksi kecerdasan buatan (*Machine Learning*).
* **Navigasi Jarak GPS & Rute OSRM**: Menghitung jarak tempuh dan waktu perjalanan pengunjung ke lokasi instansi secara realtime.
* **Pemberitahuan & Panggilan Suara**: Dilengkapi notifikasi lonceng (*chime*) dan sintesis suara otomatis saat giliran nomor dipanggil.
* **Layar Cadangan Offline Bersih**: Tampilan khusus dengan latar belakang putih elegan, logo instansi, status tiket yang tersimpan aman di HP, dan tombol hubungkan ulang (*retry*).

### 2. 📺 Layar Display TV Publik (`/display`)
* **Tata Letak Monitor TV Modern**: Dirancang untuk monitor loket atau TV ruang tunggu publik dengan visibilitas tinggi.
* **Nomor Aktif & Daftar Menunggu**: Menampilkan nomor yang sedang dilayani dengan animasi panggilan berkedip (*flash alert*) serta daftar nomor yang berada di antrean berikutnya.
* **Panggilan Suara Otomatis (TTS)**: Memanggil nomor dan nama pengunjung secara otomatis menggunakan *human voice synthesis* dan nada *chime* khas loket pelayanan.
* **QR Code Display Dinamis**: Menampilkan kode QR agar pengunjung yang datang dapat memindai langsung untuk mengambil tiket dari HP masing-masing.
* **Jam Digital & Indikator Koneksi**: Jam digital realtime dan penanda koneksi otomatis (*Live Online* vs *Mode Offline Lokal*).

### 3. 🛡️ Panel Petugas & Administrator (`/admin`)
* **Dashboard Statistik Realtime**: Ringkasan total tiket, antrean menunggu, antrean dipanggil, rata-rata durasi pelayanan loket, dan grafik beban kerja.
* **Kelola Antrean Terpadu**: Tombol panggil berikutnya, panggil ulang, tandai selesai, tandai terlambat, atau batalkan tiket dengan alasan jelas.
* **Kustomisasi Identitas & Media Instansi**:
  * Ubah nama instansi, alamat lengkap, dan syarat wajib pengunjung.
  * Unggah logo instansi (PNG/JPG) dan foto latar belakang gedung/layanan (16:9 lanskap).
  * Koordinat lokasi Google Maps otomatis diekstrak ke latitude & longitude.
  * Pengumuman darurat instan yang muncul sebagai banner merah mencolok di semua layar pengunjung secara realtime.
* **Kustomisasi Tema & Warna Sistem (Custom Branding)**:
  * Pengaturan palet warna utama (*Primary Color*), aksen, dan latar belakang yang otomatis menyinkronkan seluruh tampilan pasien, display TV, dan admin.
  * Ganti nama aplikasi dan unggah favicon kustom.
* **Laporan & Ekspor Data**: Filter riwayat antrean berdasarkan harian, bulanan, tahunan, atau arsip lengkap dengan opsi unduh CSV / Excel.
* **Modul Kecerdasan Buatan (ML Random Forest)**: Latih model estimasi waktu tunggu menggunakan data riil kunjungan loket langsung dari panel admin.
* **Keamanan Akun & Personel Petugas**:
  * Otentikasi resmi Supabase Auth berbasis cookie server `httpOnly` bertanda tangan HMAC-SHA256 (aman dari XSS & pencurian token).
  * Perlindungan anti *brute-force* (penguncian akun otomatis setelah 5 kali gagal).
  * Pengelolaan nama pengguna (*username*) yang tersimpan permanen.
  * Pendaftaran akun petugas baru dengan tautan aktivasi email aman.

---

## 🛠️ Tumpukan Teknologi (*Tech Stack*)

* **Frontend & Framework**: [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/)
* **Ikon Antarmuka**: [Lucide React](https://lucide.dev/)
* **Basis Data & Realtime**: [Supabase](https://supabase.com/) (PostgreSQL 15+, Row Level Security, Realtime CDC)
* **Kecerdasan Buatan (ML)**: Random Forest Regressor (Scikit-Learn, Pandas, Joblib) & Dual Estimator Queue Prediction
* **PWA & Offline**: Web Service Worker, Cache API, LocalStorage, BroadcastChannel API
* **Suara & Audio**: Web Speech Synthesis API, Web Audio API (Synthesized Chime Generator)
* **Navigasi Geografis**: OpenStreetMap & OSRM Routing Engine

---

## 📋 Prasyarat Sistem

Sebelum memasang aplikasi, pastikan komputer/server Anda telah terpasang:
1. **Node.js**: Versi `18.18.0` atau yang lebih baru (disarankan Node.js 20 LTS).
2. **NPM**: Versi `9.0.0` atau yang lebih baru.
3. **Akun Supabase**: Akun gratis di [supabase.com](https://supabase.com) untuk basis data cloud.
4. **Python (Opsional)**: Versi `3.10+` jika ingin menjalankan microservice Python Flask untuk *retraining* Random Forest offline.

---

## 🚀 Panduan Instalasi Cepat

### 1. Unduh Proyek & Pasang Dependensi
```bash
# Masuk ke direktori proyek
cd antrean-next

# Pasang dependensi Node.js
npm install
```

### 2. Konfigurasi Variabel Lingkungan (`.env.local`)
Buat berkas bernama `.env.local` pada direktori utama proyek, lalu isi kredensial Supabase Anda:

```env
# URL & Kunci API Supabase Anda (Dapatkan di Dashboard Supabase: Project Settings -> API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Kunci Layanan Server (Opsional tapi sangat disarankan untuk fitur manajemen akun admin)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# URL Domain Publik Aplikasi Anda
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Kunci Rahasia Sesi Server (Gunakan string acak panjang untuk keamanan produksi)
AUTH_SECRET=kunci-rahasia-antrean-universal-produksi-aman-2026-super-secret
```

---

## 🗄️ Menyiapkan Basis Data Supabase (Cukup Import 1 Berkas: `database.sql`)

Seluruh struktur basis data, reset otomatis, tabel, fungsi atomik, realtime, dan keamanan telah dikemas rapi dalam **satu berkas tunggal**: [`database.sql`](file:///home/kiyotakaay/Documents/antrean-next/database.sql).

### Langkah Eksekusi Skema di Supabase:
1. Buka dashboard proyek Anda di [supabase.com](https://app.supabase.com).
2. Di bilah navigasi kiri, klik menu **SQL Editor**.
3. Buat query baru (*+ New query*).
4. Buka berkas `database.sql`, salin seluruh isinya (`Ctrl + A` lalu `Ctrl + C`), dan tempelkan ke SQL Editor.
5. Klik tombol **Run** (atau tekan `Ctrl + Enter`).
6. Supabase akan secara otomatis:
   * Membersihkan tabel/fungsi lama jika ada agar tidak konflik (*clean reset*).
   * Membuat tabel `pengaturan`, `antrean`, `ml_dataset`, dan `kredensial_petugas`.
   * Memasang fungsi penomoran atomik `register_queue` (anti nomor ganda walau diakses ribuan pendaftar bersamaan).
   * Mengaktifkan publikasi *realtime* Supabase untuk display TV dan pasien.
   * Menerapkan aturan keamanan *Row Level Security* (RLS).
   * Memasukkan data awal konfigurasi yang bersih dan siap digunakan.

---

## 👤 Pembuatan Akun Petugas Pertama Kali

Aplikasi menerapkan standar keamanan tanpa kata sandi bawaan (*no hardcoded password*). Untuk membuat akun administrator pertama:

### Cara 1: Melalui Supabase Auth Dashboard (Paling Mudah)
1. Buka dashboard Supabase Anda -> menu **Authentication** -> **Users**.
2. Klik tombol **Add User** -> pilih **Create User**.
3. Masukkan email petugas (contoh: `admin@organisasi.com`) dan tentukan kata sandinya (minimal 8 karakter).
4. Centang opsi **Auto Confirm User?** agar akun langsung terverifikasi.
5. Di bagian **User Metadata**, tambahkan JSON berikut:
   ```json
   {
     "nama": "Administrator Utama",
     "username": "admin",
     "role": "superadmin",
     "status": "aktif"
   }
   ```
6. Akun siap digunakan untuk login di `/admin`!

### Cara 2: Menambahkan Akun Petugas Tambahan
Setelah berhasil masuk ke `/admin`:
1. Masuk ke menu **Pengaturan** -> **Kelola Pengguna**.
2. Masukkan nama lengkap petugas baru, email, dan pilih perannya (*Admin* / *Superadmin*).
3. Klik **Kirim Tautan Aktivasi**. Petugas baru akan menerima tautan aktivasi email untuk membuat kata sandi mereka sendiri.

---

## 💻 Menjalankan Aplikasi

### Mode Pengembangan (Development)
```bash
npm run dev
```
Buka peramban di:
* **Halaman Pasien / Pengunjung**: `http://localhost:3000`
* **Layar Display TV Publik**: `http://localhost:3000/display`
* **Portal Petugas / Admin**: `http://localhost:3000/admin`

### Mode Produksi (Production Build)
```bash
# Bangun aplikasi teroptimasi
npm run build

# Jalankan server produksi
npm run start
```

---

## 🌐 Panduan Publikasi & Penjualan (Deployment)

Aplikasi ini 100% kompatibel dan siap di-*deploy* ke berbagai platform cloud:

### 1. Publikasi ke Vercel (Disarankan)
1. Unggah kode ke repositori GitHub / GitLab Anda.
2. Buka [Vercel Dashboard](https://vercel.com) dan klik **Add New Project**.
3. Impor repositori ini.
4. Masukkan **Environment Variables** persis seperti yang ada pada berkas `.env.local`:
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY`
   * `NEXT_PUBLIC_APP_URL`
   * `AUTH_SECRET`
5. Klik **Deploy**. Aplikasi akan aktif secara global dalam hitungan detik.

### 2. Publikasi Mandiri / VPS (Docker / PM2)
Jika menggunakan server Ubuntu / Debian mandiri:
```bash
# Install PM2
npm install -g pm2

# Build & jalankan di background
npm run build
pm2 start npm --name "antrean-digital" -- start
pm2 save
pm2 startup
```

---

## 📁 Struktur Inti Berkas Proyek

```
antrean-next/
├── api/                           # Microservice Python Flask untuk Random Forest AI
│   ├── index.py                   # Endpoint inferensi prediksi & retraining Flask
│   ├── latih_model.py             # Script pelatihan model dari CSV
│   ├── model_metadata.json        # Metadata model & status sampel dataset
│   └── requirements.txt           # Dependensi Python (scikit-learn, joblib, flask)
├── public/                        # Aset publik statis
│   ├── icon.svg                   # Ikon aplikasi PWA
│   ├── manifest.json              # Web App Manifest untuk instalasi mobile
│   └── sw.js                      # Service Worker untuk dukungan offline & caching
├── src/
│   ├── app/
│   │   ├── admin/page.js          # Antarmuka lengkap panel petugas & pengaturan
│   │   ├── display/page.js        # Antarmuka layar TV / monitor publik
│   │   ├── page.js                # Antarmuka pengunjung / pasien & layar offline
│   │   ├── layout.js              # Root Layout Next.js
│   │   ├── globals.css            # Styling Tailwind CSS & animasi sistem
│   │   └── api/                   # API Routes Next.js (Serverless)
│   │       ├── antrean/           # Aksi panggil, daftar, batal & sinkronisasi antrean
│   │       ├── auth/              # Autentikasi sesi, login, profil, ganti sandi & OTP
│   │       ├── ml/                # Endpoint prediksi & retraining AI Next.js
│   │       └── tts/               # Pengolah suara pemanggilan loket
│   └── lib/
│       ├── auth.js                # Enkripsi PBKDF2 & verifikasi sesi HMAC-SHA256
│       ├── brandTheme.js          # Generator palet warna branding kustom instansi
│       ├── pwa.js                 # PWA service worker & audio chime helper
│       ├── supabaseClient.js      # Client Supabase, routing GPS & penomoran atomik
│       └── tts.js                 # Sintesis suara manusia Web Speech API
├── database.sql                  # Skema lengkap Supabase & skrip reset database
├── package.json                   # Dependensi & skrip Next.js
└── README.md                      # Dokumentasi resmi proyek
```

---

## 📄 Lisensi & Hak Penggunaan

Hak Cipta © 2026. Seluruh hak cipta dilindungi undang-undang.
Dilisensikan untuk penggunaan komersial, kustomisasi mandiri, dan distribusi solusi digital terpadu.

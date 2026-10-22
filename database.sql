-- ==============================================================================
-- DATABASE.SQL: SKEMA RESMI & PANDUAN IMPORT TUNGGAL SUPABASE
-- SISTEM ANTREAN CERDAS DIGITAL UNIVERSAL
-- Versi: 1.0.0 (Production & Commercial Ready)
-- ==============================================================================
--
-- PANDUAN CARA PAKAI (CUKUP SEKALI IMPORT):
-- 1. Buka dashboard proyek Supabase Anda: https://app.supabase.com
-- 2. Pilih menu "SQL Editor" di bilah navigasi kiri.
-- 3. Buat tab baru (+ New query).
-- 4. Salin SELURUH isi file ini (Ctrl + A lalu Ctrl + C), tempelkan di SQL Editor.
-- 5. Klik tombol "RUN" (atau tekan Ctrl + Enter).
--
-- File ini otomatis:
-- A. Menghapus (drop & clean) tabel/fungsi lama jika ada agar tidak konflik
-- B. Membuat semua tabel baru (pengaturan, antrean, ml_dataset, kredensial_petugas)
-- C. Membuat fungsi atomik register_queue (anti nomor ganda diakses bersamaan)
-- D. Mengaktifkan realtime Supabase untuk display TV & pasien
-- E. Menerapkan keamanan Row Level Security (RLS)
-- F. Mengisi data awal konfigurasi yang bersih dan siap pakai
-- ==============================================================================


-- ==============================================================================
-- 1. BERSIHKAN STRUKTUR LAMA (CLEAN RESET / WIPE)
-- ==============================================================================

-- 1.1 Nonaktifkan sementara publikasi realtime pada tabel lama
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS antrean;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS pengaturan;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS ml_dataset;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

-- 1.2 Hapus seluruh trigger dan fungsi lama
DROP TRIGGER IF EXISTS trg_antrean_updated_at ON antrean CASCADE;
DROP TRIGGER IF EXISTS trg_pengaturan_updated_at ON pengaturan CASCADE;
DROP FUNCTION IF EXISTS register_queue(uuid, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS register_queue(uuid, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- 1.3 Hapus seluruh tabel lama beserta ketergantungannya (CASCADE)
DROP TABLE IF EXISTS ml_dataset CASCADE;
DROP TABLE IF EXISTS antrean CASCADE;
DROP TABLE IF EXISTS pengaturan CASCADE;
DROP TABLE IF EXISTS kredensial_petugas CASCADE;


-- ==============================================================================
-- 2. EKSTENSI & FUNGSI UTAMA POSTGRESQL
-- ==============================================================================

-- 2.1 Aktifkan Ekstensi UUID & Kriptografi
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2.2 Fungsi Pembantu Otomatisasi Timestamp updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ==============================================================================
-- 3. PEMBUATAN TABEL-TABEL UTAMA
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 3.1 TABEL: pengaturan (Profil Instansi, Tema Warna, Lokasi GPS, QR & Display)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pengaturan (
  id VARCHAR(100) PRIMARY KEY DEFAULT 'pengaturan_organisasi',
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  nama_organisasi TEXT NOT NULL DEFAULT 'Loket Pelayanan Terpadu',
  alamat_organisasi TEXT NOT NULL DEFAULT 'Jl. Pelayanan Publik No. 1, Kota Layanan',
  logo_url TEXT DEFAULT '🏢',
  foto_organisasi_url TEXT DEFAULT '',
  info_penting TEXT DEFAULT 'Wajib membawa kartu identitas asli (KTP/KK) dan bukti nomor antrean.',
  pengumuman_darurat TEXT DEFAULT '',
  status_buka BOOLEAN NOT NULL DEFAULT TRUE,
  maps_url TEXT DEFAULT 'https://maps.google.com/?q=-0.5282,102.5853',
  latitude NUMERIC(10, 6) DEFAULT -0.528200,
  longitude NUMERIC(10, 6) DEFAULT 102.585300,
  display_qr_link TEXT DEFAULT '',
  display_sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  warna_utama VARCHAR(10) NOT NULL DEFAULT '#0d9488',
  warna_aksen VARCHAR(10) NOT NULL DEFAULT '#0f766e',
  warna_latar VARCHAR(10) NOT NULL DEFAULT '#f0fdfa',
  nama_aplikasi VARCHAR(100) NOT NULL DEFAULT 'Antrean Cerdas',
  favicon_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger auto-update updated_at pada pengaturan
CREATE TRIGGER trg_pengaturan_updated_at
BEFORE UPDATE ON pengaturan
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------------------------
-- 3.2 TABEL: antrean (Daftar Antrean Pasien/Pengunjung Harian)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS antrean (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  nomor VARCHAR(20) NOT NULL,
  nama VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'MENUNGGU',
  -- Status yang didukung: 'MENUNGGU', 'MEMANGGIL', 'TERLAMBAT', 'SELESAI', 'DIBATALKAN'
  urutan INT NOT NULL DEFAULT 1,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  panggilan_ke INT NOT NULL DEFAULT 0,
  sumber VARCHAR(30) NOT NULL DEFAULT 'PUBLIC',
  estimasi_menit INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  waktu_panggilan TIMESTAMPTZ,
  last_called_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  waktu_dibatalkan TIMESTAMPTZ,
  alasan_batal TEXT,
  idempotency_key VARCHAR(100),
  cancel_token_hash VARCHAR(64)
);

-- Indeks performa query antrean
CREATE INDEX IF NOT EXISTS idx_antrean_tenant_status ON antrean(tenant_id, status, is_archived);
CREATE INDEX IF NOT EXISTS idx_antrean_created_at ON antrean(created_at);
CREATE INDEX IF NOT EXISTS idx_antrean_nomor ON antrean(nomor);
CREATE INDEX IF NOT EXISTS idx_antrean_cancel_hash ON antrean(cancel_token_hash);


-- ------------------------------------------------------------------------------
-- 3.3 TABEL: ml_dataset (Perekaman Dataset Pelatihan AI Random Forest)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_dataset (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  antrean_id BIGINT REFERENCES antrean(id) ON DELETE SET NULL,
  nomor VARCHAR(20),
  sumber VARCHAR(30),
  antrean_di_depan INT NOT NULL DEFAULT 0,
  jam_daftar NUMERIC(5, 2) NOT NULL,
  rata_waktu_pelayanan NUMERIC(5, 2) NOT NULL DEFAULT 7.0,
  waktu_tunggu_menit NUMERIC(6, 2),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_ml_dataset_tenant ON ml_dataset(tenant_id, status);


-- ------------------------------------------------------------------------------
-- 3.4 TABEL: kredensial_petugas (Penyimpanan Cadangan Hash PBKDF2 Petugas)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kredensial_petugas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  username VARCHAR(100) UNIQUE NOT NULL,
  nama VARCHAR(150),
  email VARCHAR(150),
  password_hash TEXT NOT NULL,
  salt VARCHAR(64) NOT NULL,
  peran VARCHAR(30) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ==============================================================================
-- 4. FUNGSI ATOMIK PENDAFTARAN ANTREAN (RPC register_queue)
-- Menghitung nomor antrean harian dengan Row-Level Locking (Anti Nomor Ganda)
-- ==============================================================================

CREATE OR REPLACE FUNCTION register_queue(
  p_tenant_id UUID,
  p_nama TEXT,
  p_sumber TEXT DEFAULT 'PUBLIC',
  p_idempotency_key TEXT DEFAULT NULL,
  p_cancel_token_hash TEXT DEFAULT NULL
)
RETURNS SETOF antrean AS $$
DECLARE
  v_next_num INT;
  v_nomor_tiket TEXT;
  v_max_urutan INT;
  v_antrean_depan INT;
  v_estimasi_menit INT;
  v_today_start TIMESTAMPTZ;
  v_new_row antrean;
BEGIN
  -- Tentukan batas awal hari ini (UTC)
  v_today_start := DATE_TRUNC('day', NOW());

  -- Kunci tabel antrean untuk tenant ini agar tidak ada race condition penomoran
  PERFORM 1 FROM antrean 
  WHERE tenant_id = p_tenant_id AND created_at >= v_today_start 
  FOR UPDATE;

  -- 1. Cek idempotensi: Jika key sudah pernah didaftarkan, kembalikan tiket yang ada
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_new_row FROM antrean 
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key 
    LIMIT 1;

    IF FOUND THEN
      RETURN NEXT v_new_row;
      RETURN;
    END IF;
  END IF;

  -- 2. Hitung nomor urut berikutnya hari ini
  SELECT COALESCE(MAX(
    CASE 
      WHEN nomor ~ '^A[0-9]+$' THEN SUBSTRING(nomor FROM 2)::INT 
      ELSE 0 
    END
  ), 0) + 1
  INTO v_next_num
  FROM antrean
  WHERE tenant_id = p_tenant_id AND created_at >= v_today_start;

  -- Format nomor antrean (contoh: A01, A02, A10)
  v_nomor_tiket := 'A' || LPAD(v_next_num::TEXT, 2, '0');

  -- 3. Hitung urutan display
  SELECT COALESCE(MAX(urutan), 0) + 1 INTO v_max_urutan
  FROM antrean
  WHERE tenant_id = p_tenant_id AND is_archived = FALSE;

  -- 4. Hitung estimasi waktu awal (5 menit per orang di depan)
  SELECT COUNT(*) INTO v_antrean_depan
  FROM antrean
  WHERE tenant_id = p_tenant_id 
    AND is_archived = FALSE 
    AND status IN ('MENUNGGU', 'MEMANGGIL');

  v_estimasi_menit := GREATEST(5, (v_antrean_depan + 1) * 5);

  -- 5. Masukkan data antrean baru
  INSERT INTO antrean (
    tenant_id,
    nomor,
    nama,
    status,
    urutan,
    is_archived,
    panggilan_ke,
    sumber,
    estimasi_menit,
    idempotency_key,
    cancel_token_hash,
    created_at
  ) VALUES (
    p_tenant_id,
    v_nomor_tiket,
    TRIM(p_nama),
    'MENUNGGU',
    v_max_urutan,
    FALSE,
    0,
    UPPER(p_sumber),
    v_estimasi_menit,
    p_idempotency_key,
    p_cancel_token_hash,
    NOW()
  )
  RETURNING * INTO v_new_row;

  RETURN NEXT v_new_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- 5. PUBLIKASI REALTIME SUPABASE
-- Mengirim event perubahan seketika ke Display TV & Halaman Pasien
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE antrean;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE pengaturan;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;


-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) & HAK AKSES DATA
-- ==============================================================================

-- 6.1 Aktifkan RLS di setiap tabel
ALTER TABLE pengaturan ENABLE ROW LEVEL SECURITY;
ALTER TABLE antrean ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_dataset ENABLE ROW LEVEL SECURITY;
ALTER TABLE kredensial_petugas ENABLE ROW LEVEL SECURITY;

-- 6.2 Kebijakan Tabel pengaturan
DROP POLICY IF EXISTS "Publik dapat membaca profil pengaturan" ON pengaturan;
CREATE POLICY "Publik dapat membaca profil pengaturan" 
ON pengaturan FOR SELECT 
TO public 
USING (true);

DROP POLICY IF EXISTS "Petugas berwenang dapat mengubah pengaturan" ON pengaturan;
CREATE POLICY "Petugas berwenang dapat mengubah pengaturan" 
ON pengaturan FOR ALL 
TO authenticated, service_role 
USING (true) 
WITH CHECK (true);

-- 6.3 Kebijakan Tabel antrean
DROP POLICY IF EXISTS "Publik dapat melihat antrean aktif" ON antrean;
CREATE POLICY "Publik dapat melihat antrean aktif" 
ON antrean FOR SELECT 
TO public 
USING (true);

DROP POLICY IF EXISTS "Publik dapat mendaftarkan antrean baru" ON antrean;
CREATE POLICY "Publik dapat mendaftarkan antrean baru" 
ON antrean FOR INSERT 
TO public 
WITH CHECK (true);

DROP POLICY IF EXISTS "Petugas dapat mengelola antrean" ON antrean;
CREATE POLICY "Petugas dapat mengelola antrean" 
ON antrean FOR ALL 
TO authenticated, service_role 
USING (true) 
WITH CHECK (true);

-- 6.4 Kebijakan Tabel ml_dataset & kredensial_petugas
DROP POLICY IF EXISTS "Akses dataset hanya untuk sistem dan petugas" ON ml_dataset;
CREATE POLICY "Akses dataset hanya untuk sistem dan petugas" 
ON ml_dataset FOR ALL 
TO authenticated, service_role 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Kredensial hanya untuk service role dan authenticated" ON kredensial_petugas;
CREATE POLICY "Kredensial hanya untuk service role dan authenticated" 
ON kredensial_petugas FOR ALL 
TO authenticated, service_role 
USING (true) 
WITH CHECK (true);


-- ==============================================================================
-- 7. DATA AWAL BERSIH (SEED DATA)
-- ==============================================================================

INSERT INTO pengaturan (
  id,
  tenant_id,
  nama_organisasi,
  alamat_organisasi,
  logo_url,
  foto_organisasi_url,
  info_penting,
  pengumuman_darurat,
  status_buka,
  maps_url,
  latitude,
  longitude,
  display_qr_link,
  display_sound_enabled,
  warna_utama,
  warna_aksen,
  warna_latar,
  nama_aplikasi,
  favicon_url
) VALUES (
  'pengaturan_organisasi',
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Loket Pelayanan Terpadu',
  'Jl. Pelayanan Publik No. 1, Kota Layanan',
  '🏢',
  '',
  'Wajib membawa kartu identitas asli (KTP/KK) dan bukti nomor antrean.',
  '',
  TRUE,
  'https://maps.google.com/?q=-0.5282,102.5853',
  -0.528200,
  102.585300,
  '',
  TRUE,
  '#0d9488',
  '#0f766e',
  '#f0fdfa',
  'Antrean Cerdas',
  ''
) ON CONFLICT (id) DO UPDATE SET
  updated_at = NOW();

-- SELESAI! Database Supabase Anda telah 100% aktif, bersih, dan siap digunakan.

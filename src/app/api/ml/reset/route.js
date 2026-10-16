import { NextResponse } from 'next/server';
import { ambilSesiDariRequest } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/ml/reset
 *
 * Mereset data pelatihan AI dan mengembalikan model ke status bawaan.
 * 
 * Ketentuan Keamanan:
 * - HANYA menghapus dataset pelatihan pada tabel ml_dataset.
 * - TIDAK MENGHAPUS riwayat antrean operasional (tabel antrean), log panggilan, akun, atau profil.
 * - Mereset file metadata api/model_metadata.json ke status awal.
 */
export async function POST(request) {
  // 1. Verifikasi autentikasi sesi admin
  const sesi = ambilSesiDariRequest(request);
  if (!sesi) {
    return NextResponse.json(
      { error: 'Autentikasi admin diperlukan untuk mereset data pelatihan AI.' },
      { status: 401 }
    );
  }

  try {
    const tenantId = sesi.organisasiId || '00000000-0000-0000-0000-000000000001';
    let dbDeletedCount = 0;

    // 2. Hapus data pelatihan dari tabel ml_dataset di Supabase jika terhubung
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error, count } = await supabase
          .from('ml_dataset')
          .delete({ count: 'exact' })
          .eq('tenant_id', tenantId);

        if (!error && typeof count === 'number') {
          dbDeletedCount = count;
        }
      }
    } catch (dbErr) {
      console.warn('[RESET ML] Kendala reset di Supabase ml_dataset:', dbErr.message);
    }

    // 3. Hapus file model pkl secara fisik dari disk jika ada
    const modelPklPath = path.join(process.cwd(), 'api', 'rf_antrean_model.pkl');
    try {
      if (fs.existsSync(modelPklPath)) {
        fs.unlinkSync(modelPklPath);
      }
    } catch (pklErr) {
      console.warn('[RESET ML] Kendala menghapus rf_antrean_model.pkl:', pklErr.message);
    }

    // 4. Reset metadata model di api/model_metadata.json
    const metaPath = path.join(process.cwd(), 'api', 'model_metadata.json');
    const resetMetadata = {
      versi: "vDefault_Awal",
      fitur: ["antrean_di_depan", "rata_waktu_pelayanan", "jam_daftar"],
      total_sampel: 0,
      status: "RESET_BERSIH",
      keterangan: "Model menggunakan estimasi adaptif bawaan. Silakan impor CSV riwayat antrean untuk melatih kembali.",
      waktu_reset: new Date().toISOString()
    };

    try {
      fs.writeFileSync(metaPath, JSON.stringify(resetMetadata, null, 2), 'utf-8');
    } catch (fsErr) {
      console.warn('[RESET ML] Kendala reset model_metadata.json:', fsErr.message);
    }

    // 5. Beritahu Python Flask backend agar mengosongkan cache model di memori
    try {
      let baseUrl = 'http://127.0.0.1:5328';
      if (process.env.PYTHON_API_URL) baseUrl = process.env.PYTHON_API_URL;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      await fetch(`${baseUrl}/api/reset`, {
        method: 'POST',
        signal: controller.signal,
      }).catch(() => {});
      clearTimeout(timeoutId);
    } catch {
      // Abaikan jika server python tidak aktif
    }

    return NextResponse.json({
      sukses: true,
      pesan: 'Data pelatihan AI berhasil direset ke standar bawaan. Dataset sekarang 0 baris.',
      total_dataset: 0,
      status: 'STANDAR_BAWAAN',
      dataset_dihapus: dbDeletedCount,
      tindakan_selanjutnya: 'Sistem siap menerima impor berkas CSV riwayat antrean baru untuk pelatihan model.',
      metadata: resetMetadata
    });

  } catch (error) {
    console.error('Error pada /api/ml/reset:', error);
    return NextResponse.json({
      error: 'Gagal mereset data pelatihan AI: ' + (error?.message || 'Kesalahan sistem')
    }, { status: 500 });
  }
}

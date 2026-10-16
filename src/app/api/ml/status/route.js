import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/ml/status
 *
 * Mengembalikan status aktual model AI Random Forest dan dataset pelatihan:
 * - Apakah model sedang aktif dari data riwayat CSV yang dilatih
 * - Jumlah sampel dataset (0 jika direset atau belum ada data)
 * - Versi model dan status keterhubungan
 */
export async function GET() {
  try {
    const metaPath = path.join(process.cwd(), 'api', 'model_metadata.json');
    const modelPath = path.join(process.cwd(), 'api', 'rf_antrean_model.pkl');

    let metadata = null;
    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch (err) {
        console.warn('Gagal membaca model_metadata.json:', err.message);
      }
    }

    const modelFileAda = fs.existsSync(modelPath);
    const isReset = !metadata || metadata.status === 'RESET_BERSIH' || (metadata.total_sampel || 0) <= 0;
    const modelAktif = !isReset && modelFileAda;

    const totalSampel = modelAktif ? (metadata?.total_sampel || 0) : 0;
    const versi = modelAktif ? (metadata?.versi || 'vAktif') : 'vStandar_Bawaan';

    return NextResponse.json({
      model_aktif: modelAktif,
      total_dataset: totalSampel,
      status: modelAktif ? 'AKTIF' : 'STANDAR_BAWAAN',
      versi,
      keterangan: modelAktif
        ? `Model Random Forest aktif terlatih dari ${totalSampel.toLocaleString('id-ID')} data riwayat antrean.`
        : 'Sistem menggunakan aturan waktu standar bawaan (7 menit/pasien). Dataset saat ini 0 baris.',
      metadata: metadata || null,
      file_model_ada: modelFileAda,
    });
  } catch (err) {
    return NextResponse.json({
      model_aktif: false,
      total_dataset: 0,
      status: 'STANDAR_BAWAAN',
      error: err.message,
    }, { status: 500 });
  }
}

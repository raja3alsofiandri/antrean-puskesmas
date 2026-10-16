import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/ml/evaluasi
 *
 * Mengembalikan ringkasan metadata evaluasi simulasi AI Machine Learning
 * dari dataset dummy pengujian 5 tahun (2021-2025).
 * Data berlabel transparan sebagai EVALUASI_SIMULASI (bukan data pasien nyata).
 */
export async function GET() {
  try {
    const metaPath = path.join(process.cwd(), 'data', 'dummy', 'evaluasi_simulasi_metadata.json');
    if (fs.existsSync(metaPath)) {
      const content = fs.readFileSync(metaPath, 'utf-8');
      const data = JSON.parse(content);
      return NextResponse.json({
        tersedia: true,
        ...data,
      });
    }

    return NextResponse.json({
      tersedia: false,
      pesan: 'Metadata evaluasi simulasi belum dibuat. Jalankan scripts/generate_dummy_dataset.py.',
    });
  } catch (err) {
    return NextResponse.json({
      tersedia: false,
      error: err.message,
    }, { status: 500 });
  }
}

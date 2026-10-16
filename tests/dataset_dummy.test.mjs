import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const DATASET_PATH = path.join(process.cwd(), 'data', 'dummy', 'antrean_puskesmas_2021_2025.csv');
const METADATA_PATH = path.join(process.cwd(), 'data', 'dummy', 'evaluasi_simulasi_metadata.json');

test('Dataset Dummy: File CSV dan Metadata Berhasil Dibuat', () => {
  assert.ok(fs.existsSync(DATASET_PATH), 'File CSV dataset dummy harus ada di data/dummy');
  assert.ok(fs.existsSync(METADATA_PATH), 'File metadata evaluasi simulasi harus ada');
  
  const stats = fs.statSync(DATASET_PATH);
  assert.ok(stats.size > 5 * 1024 * 1024, 'Ukuran file CSV minimal 5MB untuk 50k+ baris');
});

test('Dataset Dummy: Validasi Metadata dan Jumlah Baris >= 50.000', () => {
  const meta = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8'));
  assert.equal(meta.status, 'VALID_SIMULATION');
  assert.ok(meta.total_baris >= 50000, `Target 50.000 baris tercapai: ${meta.total_baris}`);
  assert.deepEqual(meta.tahun_cakupan, [2021, 2022, 2023, 2024, 2025]);
  assert.ok(meta.evaluasi_simulasi_mae.gabungan_ensemble > 0, 'MAE gabungan harus valid');
  assert.match(meta.evaluasi_simulasi_mae.label, /EVALUASI_SIMULASI/);
});

test('Dataset Dummy: Format Header CSV Kompatibel dengan Skema Aplikasi', () => {
  const content = fs.readFileSync(DATASET_PATH, 'utf-8');
  const firstLine = content.split('\n')[0].trim();
  const headers = firstLine.split(',');

  // Kolom wajib laporan
  const requiredCols = [
    'No', 'Nomor Antrean', 'Nama Pengunjung', 'Tanggal', 
    'Jam Daftar', 'Jam Panggil', 'Jam Selesai', 'Antrean Di Depan',
    'Waktu Tunggu (Menit)', 'Durasi Pelayanan (Menit)', 'Sumber', 'Status'
  ];

  requiredCols.forEach(col => {
    assert.ok(headers.includes(col), `Header harus mengandung kolom wajib: ${col}`);
  });

  // Kolom prediksi simulasi & label sintetis
  assert.ok(headers.includes('Prediksi RF (Menit)'));
  assert.ok(headers.includes('Prediksi Interval (Menit)'));
  assert.ok(headers.includes('Prediksi Gabungan (Menit)'));
  assert.ok(headers.includes('is_synthetic'));
});

test('Dataset Dummy: Validasi Sampel Baris dan Kronologi Waktu', () => {
  const content = fs.readFileSync(DATASET_PATH, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  
  // Periksa minimal 100 sampel baris pertama dan 100 baris terakhir
  const sampleIndices = [
    ...Array.from({ length: 50 }, (_, i) => i + 1),
    ...Array.from({ length: 50 }, (_, i) => lines.length - 1 - i)
  ];

  const headers = lines[0].split(',');
  const idxTgl = headers.indexOf('Tanggal');
  const idxReg = headers.indexOf('Jam Daftar');
  const idxCall = headers.indexOf('Jam Panggil');
  const idxFin = headers.indexOf('Jam Selesai');
  const idxStatus = headers.indexOf('Status');
  const idxWait = headers.indexOf('Waktu Tunggu (Menit)');
  const idxDur = headers.indexOf('Durasi Pelayanan (Menit)');
  const idxSynthetic = headers.indexOf('is_synthetic');

  sampleIndices.forEach(idx => {
    if (idx >= lines.length) return;
    const cols = lines[idx].split(',');
    assert.equal(cols[idxSynthetic], 'TRUE', 'Semua baris harus ditandai is_synthetic = TRUE');

    const status = cols[idxStatus];
    if (status === 'SELESAI') {
      const regTime = cols[idxReg];
      const callTime = cols[idxCall];
      const finTime = cols[idxFin];

      assert.ok(regTime <= callTime, `Jam daftar (${regTime}) harus <= Jam panggil (${callTime})`);
      assert.ok(callTime <= finTime, `Jam panggil (${callTime}) harus <= Jam selesai (${finTime})`);

      const wait = parseFloat(cols[idxWait]);
      const dur = parseFloat(cols[idxDur]);
      assert.ok(!isNaN(wait) && wait >= 0, `Waktu tunggu harus angka >= 0: ${cols[idxWait]}`);
      assert.ok(!isNaN(dur) && dur > 0, `Durasi pelayanan harus angka > 0: ${cols[idxDur]}`);
    }
  });
});

test('Dataset Dummy: Formula Prediksi Gabungan Ensemble Sesuai Spesifikasi', () => {
  // estimasi_gabungan = round((prediksi_rf + prediksi_interval) / 2)
  const content = fs.readFileSync(DATASET_PATH, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  const headers = lines[0].split(',');

  const idxRF = headers.indexOf('Prediksi RF (Menit)');
  const idxInt = headers.indexOf('Prediksi Interval (Menit)');
  const idxGabungan = headers.indexOf('Prediksi Gabungan (Menit)');

  for (let i = 1; i <= 20; i++) {
    const cols = lines[i].split(',');
    const rf = parseFloat(cols[idxRF]);
    const intv = parseFloat(cols[idxInt]);
    const gab = parseFloat(cols[idxGabungan]);

    const expected = Math.round((rf + intv) / 2.0);
    assert.equal(gab, expected, `Baris ${i}: Gabungan (${gab}) harus sama dengan round((${rf} + ${intv})/2) = ${expected}`);
  }
});

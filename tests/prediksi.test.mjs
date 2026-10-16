import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Logika penyaringan pencilan IQR (Q3 + 1.5 * IQR)
 * Persis seperti yang diimplementasikan di getIntervalEstimate dan /api/ml/predict
 */
function saringDanHitungMedianInterval(intervals) {
  if (!intervals || intervals.length < 2) return null;

  let valid = intervals.filter(v => typeof v === 'number' && v > 0);
  if (valid.length < 2) return null;

  // Jika >= 5 sampel, saring pencilan menggunakan IQR
  if (valid.length >= 5) {
    valid.sort((a, b) => a - b);
    const q1 = valid[Math.floor(valid.length * 0.25)];
    const q3 = valid[Math.floor(valid.length * 0.75)];
    const iqr = q3 - q1;
    const batasAtas = q3 + 1.5 * iqr;
    const batasBawah = Math.max(0, q1 - 1.5 * iqr);
    valid = valid.filter(v => v >= batasBawah && v <= batasAtas);
  }

  if (valid.length === 0) return null;

  valid.sort((a, b) => a - b);
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 === 0
    ? (valid[mid - 1] + valid[mid]) / 2
    : valid[mid];

  return { median, jumlahSampel: valid.length };
}

function hitungPrediksiGabungan(rfEst, intEst, antreanDiDepan, rataWaktu = 7.0) {
  if (antreanDiDepan <= 0) return { estimasiMenit: 2, metode: 'direct_next' };

  const rfValid = rfEst && rfEst > 0;
  const intValid = intEst && intEst > 0;

  if (rfValid && intValid) {
    return {
      estimasiMenit: Math.max(1, Math.round(0.5 * rfEst + 0.5 * intEst)),
      metode: 'combined_rf_interval',
    };
  } else if (rfValid) {
    return {
      estimasiMenit: Math.max(1, Math.round(rfEst)),
      metode: 'random_forest_only',
    };
  } else if (intValid) {
    return {
      estimasiMenit: Math.max(1, Math.round(intEst)),
      metode: 'interval_only',
    };
  } else {
    return {
      estimasiMenit: Math.max(5, Math.round(antreanDiDepan * rataWaktu + 4)),
      metode: 'fallback_heuristic',
    };
  }
}

test('Prediksi AI: Median Interval dengan Jumlah Genap dan Ganjil', () => {
  // Ganjil: [4, 5, 6] -> median = 5
  const ganjil = saringDanHitungMedianInterval([4, 6, 5]);
  assert.equal(ganjil.median, 5);

  // Genap: [4, 6] -> median = (4+6)/2 = 5
  const genap = saringDanHitungMedianInterval([4, 6]);
  assert.equal(genap.median, 5);
});

test('Prediksi AI: IQR Outlier Filtering Menyaring Pencilan Ekstrem', () => {
  // Sampel: [5, 6, 5, 6, 55] -> 55 adalah pencilan (anomali istirahat/gangguan)
  const data = [5, 6, 5, 6, 55];
  const hasil = saringDanHitungMedianInterval(data);
  assert.ok(hasil, 'Hasil harus ada');
  assert.equal(hasil.jumlahSampel, 4, 'Pencilan 55 harus disaring keluar');
  assert.ok(hasil.median <= 6, 'Median setelah penyaringan pencilan harus sekitar 5-6');
});

test('Prediksi AI: Gabungan 50:50 Saat Kedua Estimator Valid', () => {
  const rf = 20;
  const interval = 30;
  const gabungan = hitungPrediksiGabungan(rf, interval, 4);

  assert.equal(gabungan.metode, 'combined_rf_interval');
  assert.equal(gabungan.estimasiMenit, 25); // 0.5 * 20 + 0.5 * 30 = 25
});

test('Prediksi AI: Estimator Tunggal Saat Salah Satu Tidak Tersedia', () => {
  // Hanya RF yang valid
  const hanyaRf = hitungPrediksiGabungan(22, null, 3);
  assert.equal(hanyaRf.metode, 'random_forest_only');
  assert.equal(hanyaRf.estimasiMenit, 22);

  // Hanya Interval yang valid
  const hanyaInt = hitungPrediksiGabungan(null, 18, 3);
  assert.equal(hanyaInt.metode, 'interval_only');
  assert.equal(hanyaInt.estimasiMenit, 18);
});

test('Prediksi AI: Fallback Heuristik Saat Keduanya Tidak Valid', () => {
  const fallback = hitungPrediksiGabungan(null, null, 3, 7.0);
  assert.equal(fallback.metode, 'fallback_heuristic');
  assert.equal(fallback.estimasiMenit, 25); // 3 * 7.0 + 4 = 25
  assert.ok(fallback.estimasiMenit > 0, 'Hasil prediksi tidak boleh negatif');
});

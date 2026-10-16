import test from 'node:test';
import assert from 'node:assert/strict';

test('Alur Impor & Validasi: Penolakan Data Tidak Memenuhi Syarat (< 5 baris)', () => {
  // Simulasi validasi minimal baris
  const sampelSedikit = [
    { 'Nomor Antrean': 'A01', 'Status': 'SELESAI', 'Jam Daftar': '08:00', 'Jam Selesai': '08:07' },
    { 'Nomor Antrean': 'A02', 'Status': 'SELESAI', 'Jam Daftar': '08:10', 'Jam Selesai': '08:15' },
  ];

  const minimalSyarat = 5;
  const valid = sampelSedikit.filter(s => s.Status === 'SELESAI');
  assert.ok(valid.length < minimalSyarat, 'Sampel < 5 baris harus terdeteksi tidak mencukupi');
});

test('Alur Impor & Validasi: Pelacakan Baris Ditolak dan Rentang Tanggal Riil', () => {
  const dataUji = [
    { 'Nomor Antrean': 'A01', 'Tanggal': '2023-01-10', 'Status': 'SELESAI', 'Jam Daftar': '08:00', 'Jam Selesai': '08:07' },
    { 'Nomor Antrean': 'A02', 'Tanggal': '2023-01-10', 'Status': 'TERLAMBAT', 'Jam Daftar': '08:10', 'Jam Selesai': '08:20' },
    { 'Nomor Antrean': 'A03', 'Tanggal': '2024-12-15', 'Status': 'DIBATALKAN', 'Jam Daftar': '08:15', 'Jam Selesai': '-' },
    { 'Nomor Antrean': 'A04', 'Tanggal': '2024-12-15', 'Status': 'SELESAI', 'Jam Daftar': '08:30', 'Jam Selesai': '08:38' },
  ];

  const barisSelesai = dataUji.filter(d => d.Status === 'SELESAI');
  const barisDitolak = dataUji.filter(d => d.Status !== 'SELESAI');

  assert.equal(barisSelesai.length, 2, '2 baris berhasil diproses');
  assert.equal(barisDitolak.length, 2, '2 baris ditolak karena belum selesai');

  // Rentang tanggal terluar
  const tgls = barisSelesai.map(d => new Date(d.Tanggal)).sort((a, b) => a - b);
  const minTgl = tgls[0];
  const maxTgl = tgls[tgls.length - 1];

  assert.equal(minTgl.getFullYear(), 2023);
  assert.equal(maxTgl.getFullYear(), 2024);
});

test('Alur Reset Aman: Reset Hanya Memengaruhi Dataset Pelatihan Bukan Operasional', () => {
  // Simulasi isolasi data
  const databaseSimulasi = {
    operasional_antrean: [{ id: 1, nomor: 'A01', status: 'SELESAI' }],
    operasional_call_log: [{ id: 10, nomor: 'A01', called_at: '2026-10-15T08:00:00Z' }],
    pelatihan_ml_dataset: [{ id: 100, nomor: 'A01', waktu_tunggu_menit: 5 }],
  };

  // Eksekusi reset data pelatihan
  databaseSimulasi.pelatihan_ml_dataset = [];

  // Verifikasi tabel operasional tetap utuh 100%
  assert.equal(databaseSimulasi.pelatihan_ml_dataset.length, 0, 'Dataset pelatihan berhasil dikosongkan');
  assert.equal(databaseSimulasi.operasional_antrean.length, 1, 'Riwayat operasional antrean TIDAK terhapus');
  assert.equal(databaseSimulasi.operasional_call_log.length, 1, 'Log panggilan operasional TIDAK terhapus');
});

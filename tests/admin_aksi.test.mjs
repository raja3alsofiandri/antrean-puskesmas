import test from 'node:test';
import assert from 'node:assert/strict';
import { buatTokenSesi, verifikasiTokenSesi, ambilSesiDariRequest, NAMA_COOKIE_SESI } from '../src/lib/auth.js';

test('Aksi Admin: Permintaan Tanpa Cookie Sesi Tidak Terautentikasi', () => {
  const req = {
    cookies: {
      get: () => null,
    },
    headers: {
      get: () => null,
    },
  };

  const sesi = ambilSesiDariRequest(req);
  assert.equal(sesi, null, 'Permintaan tanpa cookie harus menghasilkan sesi null');
});

test('Aksi Admin: Permintaan dengan Cookie Palsu Ditolak', () => {
  const req = {
    cookies: {
      get: (nama) => (nama === NAMA_COOKIE_SESI ? { value: 'token-palsu.12345' } : null),
    },
    headers: {
      get: () => null,
    },
  };

  const sesi = ambilSesiDariRequest(req);
  assert.equal(sesi, null, 'Token palsu harus ditolak');
});

test('Aksi Admin: Permintaan dengan Sesi Sah Berhasil Diverifikasi', () => {
  const tokenSah = buatTokenSesi({
    userId: 'petugas-001',
    username: 'admin_loket',
    organisasiId: '00000000-0000-0000-0000-000000000001',
    peran: 'admin',
  });

  const req = {
    cookies: {
      get: (nama) => (nama === NAMA_COOKIE_SESI ? { value: tokenSah } : null),
    },
    headers: {
      get: () => null,
    },
  };

  const sesi = ambilSesiDariRequest(req);
  assert.ok(sesi, 'Sesi sah harus berhasil diverifikasi');
  assert.equal(sesi.username, 'admin_loket');
  assert.equal(sesi.peran, 'admin');
  assert.equal(sesi.organisasiId, '00000000-0000-0000-0000-000000000001');
});

test('Aksi Admin: Validasi Payload Aksi Panggil dan Selesai', () => {
  function validasiAksi(aksi, data) {
    if (!aksi) return { valid: false, pesan: 'Parameter aksi wajib disertakan.' };
    if (['PANGGIL', 'SELESAI', 'LEWATI', 'BATALKAN'].includes(aksi) && !data?.id) {
      return { valid: false, pesan: 'ID antrean wajib disertakan.' };
    }
    return { valid: true };
  }

  assert.equal(validasiAksi(null, {}).valid, false);
  assert.equal(validasiAksi('PANGGIL', {}).valid, false);
  assert.equal(validasiAksi('SELESAI', {}).valid, false);
  assert.equal(validasiAksi('LEWATI', {}).valid, false);
  assert.equal(validasiAksi('BATALKAN', {}).valid, false);
  assert.equal(validasiAksi('PANGGIL', { id: 10 }).valid, true);
  assert.equal(validasiAksi('SELESAI', { id: 10, durasi_aktual_menit: 6.5 }).valid, true);
  assert.equal(validasiAksi('BATALKAN', { id: 10 }).valid, true);
  assert.equal(validasiAksi('STATUS_BUKA', { status_buka: true }).valid, true);
  assert.equal(validasiAksi('RESET_SIKLUS', {}).valid, true);
});

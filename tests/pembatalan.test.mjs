import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

function hitungHash(token) {
  return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
}

function simulasikanValidasiPembatalan(tiket, inputToken) {
  if (!tiket) {
    return { sukses: false, statusHttp: 404, pesan: 'Tiket antrean tidak ditemukan dalam sistem.' };
  }

  if (tiket.status === 'DIBATALKAN') {
    return { sukses: false, statusHttp: 400, pesan: 'Tiket antrean ini sudah pernah dibatalkan sebelumnya.' };
  }

  if (tiket.status === 'SELESAI') {
    return { sukses: false, statusHttp: 400, pesan: 'Tiket antrean tidak dapat dibatalkan karena pelayanan telah selesai.' };
  }

  if (tiket.status === 'MEMANGGIL') {
    return { sukses: false, statusHttp: 400, pesan: 'Tiket sedang dipanggil ke loket pelayanan.' };
  }

  if (!tiket.cancel_token_hash) {
    return { sukses: false, statusHttp: 403, pesan: 'Tiket ini tidak memiliki token pembatalan terdaftar.' };
  }

  const hashInput = hitungHash(inputToken);
  const bufInput = Buffer.from(hashInput, 'hex');
  const bufDatabase = Buffer.from(tiket.cancel_token_hash, 'hex');

  if (bufInput.length !== bufDatabase.length || !crypto.timingSafeEqual(bufInput, bufDatabase)) {
    return { sukses: false, statusHttp: 403, pesan: 'Otorisasi gagal: Token pembatalan tidak cocok.' };
  }

  return {
    sukses: true,
    statusHttp: 200,
    pesan: `Tiket nomor ${tiket.nomor} berhasil dibatalkan.`,
    statusBaru: 'DIBATALKAN',
  };
}

test('Keamanan Pembatalan: Token Valid Berhasil Membatalkan Tiket Status MENUNGGU', () => {
  const tokenRahasia = crypto.randomBytes(16).toString('hex');
  const tiket = {
    id: 1,
    nomor: 'A05',
    status: 'MENUNGGU',
    cancel_token_hash: hitungHash(tokenRahasia),
  };

  const hasil = simulasikanValidasiPembatalan(tiket, tokenRahasia);
  assert.equal(hasil.sukses, true);
  assert.equal(hasil.statusHttp, 200);
  assert.equal(hasil.statusBaru, 'DIBATALKAN');
});

test('Keamanan Pembatalan: Token Valid Berhasil Membatalkan Tiket Status TERLAMBAT', () => {
  const tokenRahasia = crypto.randomBytes(16).toString('hex');
  const tiket = {
    id: 2,
    nomor: 'A06',
    status: 'TERLAMBAT',
    cancel_token_hash: hitungHash(tokenRahasia),
  };

  const hasil = simulasikanValidasiPembatalan(tiket, tokenRahasia);
  assert.equal(hasil.sukses, true);
  assert.equal(hasil.statusHttp, 200);
});

test('Keamanan Pembatalan: Token Salah Ditolak dengan Status 403', () => {
  const tokenAsli = crypto.randomBytes(16).toString('hex');
  const tokenSalah = 'token_pembatalan_palsu_12345';
  const tiket = {
    id: 3,
    nomor: 'A07',
    status: 'MENUNGGU',
    cancel_token_hash: hitungHash(tokenAsli),
  };

  const hasil = simulasikanValidasiPembatalan(tiket, tokenSalah);
  assert.equal(hasil.sukses, false);
  assert.equal(hasil.statusHttp, 403);
  assert.ok(hasil.pesan.includes('Otorisasi gagal'));
});

test('Keamanan Pembatalan: Tiket yang Sedang Dipanggil (MEMANGGIL) Tidak Boleh Dibatalkan', () => {
  const tokenRahasia = crypto.randomBytes(16).toString('hex');
  const tiket = {
    id: 4,
    nomor: 'A08',
    status: 'MEMANGGIL',
    cancel_token_hash: hitungHash(tokenRahasia),
  };

  const hasil = simulasikanValidasiPembatalan(tiket, tokenRahasia);
  assert.equal(hasil.sukses, false);
  assert.equal(hasil.statusHttp, 400);
  assert.ok(hasil.pesan.includes('sedang dipanggil'));
});

test('Keamanan Pembatalan: Tiket yang Sudah Selesai (SELESAI) Tidak Boleh Dibatalkan', () => {
  const tokenRahasia = crypto.randomBytes(16).toString('hex');
  const tiket = {
    id: 5,
    nomor: 'A09',
    status: 'SELESAI',
    cancel_token_hash: hitungHash(tokenRahasia),
  };

  const hasil = simulasikanValidasiPembatalan(tiket, tokenRahasia);
  assert.equal(hasil.sukses, false);
  assert.equal(hasil.statusHttp, 400);
  assert.ok(hasil.pesan.includes('pelayanan telah selesai'));
});

test('Keamanan Pembatalan: Tiket yang Sudah Dibatalkan Menolak Pembatalan Berulang', () => {
  const tokenRahasia = crypto.randomBytes(16).toString('hex');
  const tiket = {
    id: 6,
    nomor: 'A10',
    status: 'DIBATALKAN',
    cancel_token_hash: hitungHash(tokenRahasia),
  };

  const hasil = simulasikanValidasiPembatalan(tiket, tokenRahasia);
  assert.equal(hasil.sukses, false);
  assert.equal(hasil.statusHttp, 400);
  assert.ok(hasil.pesan.includes('sudah pernah dibatalkan'));
});

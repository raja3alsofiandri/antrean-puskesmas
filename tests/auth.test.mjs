import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buatSalt,
  hashPassword,
  verifikasiPassword,
  buatTokenSesi,
  verifikasiTokenSesi,
  catatLoginGagal,
  resetLoginGagal,
  periksaStatusKunci,
  BATAS_PERCOBAAN_GAGAL
} from '../src/lib/auth.js';

test('Keamanan Auth: Hashing PBKDF2 dan Verifikasi Password', () => {
  const passwordAsli = 'KatasandiRahasia#2026';
  const salt = buatSalt();
  assert.equal(salt.length, 32, 'Salt harus 16 byte (32 karakter hex)');

  const hash = hashPassword(passwordAsli, salt);
  assert.ok(hash.length >= 64, 'Hash harus memiliki panjang minimal 64 karakter hex');

  // Password cocok
  const cocok = verifikasiPassword(passwordAsli, hash, salt);
  assert.equal(cocok, true, 'Verifikasi password harus berhasil untuk password yang benar');

  // Password salah
  const salah = verifikasiPassword('PasswordSalah123', hash, salt);
  assert.equal(salah, false, 'Verifikasi password harus gagal untuk password yang salah');

  // Salt berbeda
  const saltLain = buatSalt();
  const saltSalah = verifikasiPassword(passwordAsli, hash, saltLain);
  assert.equal(saltSalah, false, 'Verifikasi harus gagal jika salt berbeda');
});

test('Keamanan Auth: Token Sesi HMAC-SHA256 dan Kedaluwarsa', () => {
  const payload = {
    userId: 101,
    username: 'petugas_loket_1',
    organisasiId: '00000000-0000-0000-0000-000000000001',
    peran: 'operator',
  };

  const token = buatTokenSesi(payload);
  assert.ok(typeof token === 'string' && token.includes('.'), 'Token harus terdiri dari data.signature');

  // Verifikasi token valid
  const verified = verifikasiTokenSesi(token);
  assert.ok(verified, 'Token yang sah harus berhasil diverifikasi');
  assert.equal(verified.userId, 101);
  assert.equal(verified.username, 'petugas_loket_1');
  assert.equal(verified.organisasiId, '00000000-0000-0000-0000-000000000001');
  assert.ok(verified.exp > Math.floor(Date.now() / 1000), 'Token harus memiliki waktu kedaluwarsa di masa depan');

  // Tolak token yang dimanipulasi
  const tokenPalsu = token.slice(0, -4) + 'abcd';
  const hasilPalsu = verifikasiTokenSesi(tokenPalsu);
  assert.equal(hasilPalsu, null, 'Token dengan signature palsu harus ditolak');

  // Tolak token kosong / sampah
  assert.equal(verifikasiTokenSesi(''), null);
  assert.equal(verifikasiTokenSesi('invalid.token.here'), null);
});

test('Keamanan Auth: Pencegahan Brute Force & Penguncian Akun', () => {
  const usernameTest = 'uji_bruteforce_' + Date.now();
  resetLoginGagal(usernameTest);

  // Status awal: tidak terkunci
  let status = periksaStatusKunci(usernameTest);
  assert.equal(status.terkunci, false);

  // Lakukan percobaan gagal hingga batas - 1
  for (let i = 1; i < BATAS_PERCOBAAN_GAGAL; i++) {
    const hasil = catatLoginGagal(usernameTest);
    assert.equal(hasil.terkunci, false, `Percobaan ke-${i} belum boleh mengunci akun`);
    assert.equal(hasil.sisaPercobaan, BATAS_PERCOBAAN_GAGAL - i);
  }

  // Percobaan ke-5: akun harus terkunci
  const hasilKunci = catatLoginGagal(usernameTest);
  assert.equal(hasilKunci.terkunci, true, 'Akun harus terkunci setelah 5 kali gagal');
  assert.ok(hasilKunci.sisaMenit > 0, 'Sisa menit penguncian harus positif');

  // Periksa kembali status penguncian
  status = periksaStatusKunci(usernameTest);
  assert.equal(status.terkunci, true);

  // Reset setelah login berhasil
  resetLoginGagal(usernameTest);
  status = periksaStatusKunci(usernameTest);
  assert.equal(status.terkunci, false, 'Status terkunci harus direset setelah login berhasil');
});

test('Keamanan Auth: Sandi Bawaan / Default (admin123, sandi123) Ditolak Tanpa Pengecualian', () => {
  const saltAcak = buatSalt();
  const hashRandom = hashPassword('RandomUserPass#2026', saltAcak);

  // Sandi bawaan/default dilarang keras cocok dengan akun mana pun
  const sandiDefault = ['admin123', 'sandi123', 'admin', 'password', '123456'];
  for (const defPass of sandiDefault) {
    const cocok = verifikasiPassword(defPass, hashRandom, saltAcak);
    assert.equal(cocok, false, `Sandi bawaan/default "${defPass}" tidak boleh valid`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { susunKalimatPanggilan, susunKalimatPeringatan } from '../src/lib/tts.js';

test('TTS: Susun Kalimat Panggilan Universal Pertama', () => {
  const kalimat = susunKalimatPanggilan('A01', 'Budi Santoso', 1);
  assert.ok(kalimat.includes('A 01'), 'Nomor harus dieja terpisah huruf dan angka');
  assert.ok(kalimat.includes('Budi Santoso'), 'Nama pengunjung harus tercantum');
  assert.ok(kalimat.includes('loket pelayanan'), 'Harus menggunakan istilah loket pelayanan universal');
  assert.equal(kalimat.startsWith('Panggilan ulang.'), false, 'Panggilan pertama tidak boleh ada prefix panggilan ulang');
});

test('TTS: Susun Kalimat Panggilan Ulang (Recall)', () => {
  const kalimat = susunKalimatPanggilan('B12', 'Siti Rahma', 2);
  assert.ok(kalimat.startsWith('Panggilan ulang.'), 'Panggilan ke-2 harus diawali dengan Panggilan ulang.');
  assert.ok(kalimat.includes('B 12'));
  assert.ok(kalimat.includes('Siti Rahma'));
});

test('TTS: Susun Kalimat Peringatan Universal', () => {
  const kalimat = susunKalimatPeringatan('C03', 'Ahmad Dani', '10:30', 4);
  assert.ok(kalimat.includes('C 03'));
  assert.ok(kalimat.includes('Ahmad Dani'));
  assert.ok(kalimat.includes('10:30'));
  assert.ok(kalimat.includes('tersisa 4 orang lagi di depan'));
  assert.ok(kalimat.includes('loket pelayanan'));
});

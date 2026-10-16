import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Parse CSV helper seperti di route.js
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.trim().replace(/^"|"$/g, ''));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const rawCols = parseCSVLine(lines[i]);
    if (rawCols.length === 0) continue;
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = (rawCols[idx] || '').trim().replace(/^"|"$/g, '');
    });
    rows.push(rowObj);
  }
  return rows;
}

function parseJamDesimal(timeStr) {
  if (!timeStr || timeStr === '-') return 9.0;
  const match = timeStr.match(/(\d{1,2})[:.](\d{1,2})/);
  if (match) {
    const jam = parseInt(match[1], 10);
    const mnt = parseInt(match[2], 10);
    return Number((jam + mnt / 60).toFixed(2));
  }
  const num = parseFloat(timeStr);
  return !isNaN(num) ? num : 9.0;
}

function hitungDurasiMenit(jamDaftarStr, jamSelesaiStr) {
  if (!jamDaftarStr || !jamSelesaiStr || jamDaftarStr === '-' || jamSelesaiStr === '-') return 7.0;
  const mDaftar = jamDaftarStr.match(/(\d{1,2})[:.](\d{1,2})/);
  const mSelesai = jamSelesaiStr.match(/(\d{1,2})[:.](\d{1,2})/);
  if (mDaftar && mSelesai) {
    const menitDaftar = parseInt(mDaftar[1], 10) * 60 + parseInt(mDaftar[2], 10);
    const menitSelesai = parseInt(mSelesai[1], 10) * 60 + parseInt(mSelesai[2], 10);
    let diff = menitSelesai - menitDaftar;
    if (diff < 0) diff += 24 * 60;
    if (diff > 0 && diff <= 300) return diff;
  }
  return 7.0;
}

function normalisasiKeDatasetML(rawItems) {
  const dataset = [];

  rawItems.forEach((item, idx) => {
    const status = item['Status'] || item['status'] || '';
    if (status && status !== 'SELESAI' && status !== 'COMPLETE') {
      return;
    }

    const nomor = item['Nomor Antrean'] || item['nomor'] || `A-${idx + 1}`;
    const jamDaftarStr = item['Jam Daftar'] || item['jam_daftar'] || '';
    const jamSelesaiStr = item['Jam Selesai'] || item['jam_selesai'] || '';
    const durasiCol = item['Durasi Pelayanan (Menit)'] || item['durasi_aktual_menit'];
    const waktuTungguCol = item['Waktu Tunggu (Menit)'] || item['waktu_tunggu_menit'];

    const jamDaftar = parseJamDesimal(jamDaftarStr);

    let waktuTungguVal;
    if (waktuTungguCol !== undefined && waktuTungguCol !== '' && waktuTungguCol !== '-') {
      waktuTungguVal = parseFloat(waktuTungguCol);
    }
    if (isNaN(waktuTungguVal) || waktuTungguVal === undefined || waktuTungguVal < 0) {
      waktuTungguVal = durasiCol ? parseFloat(durasiCol) : hitungDurasiMenit(jamDaftarStr, jamSelesaiStr);
      if (isNaN(waktuTungguVal) || waktuTungguVal <= 0) waktuTungguVal = 7.0;
    }

    let rataWaktuVal = 7.0;
    if (durasiCol !== undefined && durasiCol !== '' && durasiCol !== '-') {
      const parsedDurasi = parseFloat(durasiCol);
      if (!isNaN(parsedDurasi) && parsedDurasi > 0 && parsedDurasi <= 60) {
        rataWaktuVal = Number(parsedDurasi.toFixed(1));
      }
    }

    let antreanDepan = 0;
    if (item['Antrean Di Depan'] !== undefined && item['Antrean Di Depan'] !== '') {
      antreanDepan = parseInt(item['Antrean Di Depan'], 10);
      if (isNaN(antreanDepan)) antreanDepan = 0;
    } else {
      const matchNum = nomor.match(/\d+/);
      antreanDepan = matchNum ? Math.max(0, parseInt(matchNum[0], 10) - 1) : idx;
    }

    dataset.push({
      nomor,
      antrean_di_depan: Math.min(50, Math.max(0, antreanDepan)),
      jam_daftar: jamDaftar,
      rata_waktu_pelayanan: rataWaktuVal,
      waktu_tunggu_menit: Number(waktuTungguVal.toFixed(1)),
      status: 'COMPLETE',
    });
  });

  return dataset;
}

test('Pipeline Impor: Parser Mampu Mengekstrak 100 Sampel Dataset Dummy', () => {
  const datasetPath = path.join(process.cwd(), 'data', 'dummy', 'antrean_puskesmas_2021_2025.csv');
  const fileContent = fs.readFileSync(datasetPath, 'utf-8');
  
  // Ambil header + 100 baris pertama
  const sampleLines = fileContent.split('\n').slice(0, 101).join('\n');
  const rawRows = parseCSV(sampleLines);
  assert.equal(rawRows.length, 100, 'Harus menghasilkan 100 raw objects');

  const normalized = normalisasiKeDatasetML(rawRows);
  assert.ok(normalized.length > 80, 'Mayoritas berstatus SELESAI dan berhasil dinormalisasi');

  const first = normalized[0];
  assert.ok('antrean_di_depan' in first);
  assert.ok('jam_daftar' in first);
  assert.ok('rata_waktu_pelayanan' in first);
  assert.ok('waktu_tunggu_menit' in first);
  assert.equal(first.status, 'COMPLETE');

  assert.ok(first.waktu_tunggu_menit >= 0);
  assert.ok(first.rata_waktu_pelayanan > 0);
});

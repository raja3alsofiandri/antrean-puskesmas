import { NextResponse } from 'next/server';
import { ambilSesiDariRequest } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Helper: Parse CSV Text menjadi array of objects
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
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

/**
 * Helper: Ekstraksi jam desimal dari string waktu ("08:30" => 8.5)
 */
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

/**
 * Helper: Hitung durasi dalam menit antara Jam Daftar dan Jam Selesai
 */
function hitungDurasiMenit(jamDaftarStr, jamSelesaiStr, tanggalStr) {
  if (!jamDaftarStr || !jamSelesaiStr || jamDaftarStr === '-' || jamSelesaiStr === '-') {
    return 7.0;
  }
  try {
    const mDaftar = jamDaftarStr.match(/(\d{1,2})[:.](\d{1,2})/);
    const mSelesai = jamSelesaiStr.match(/(\d{1,2})[:.](\d{1,2})/);
    if (mDaftar && mSelesai) {
      const menitDaftar = parseInt(mDaftar[1], 10) * 60 + parseInt(mDaftar[2], 10);
      const menitSelesai = parseInt(mSelesai[1], 10) * 60 + parseInt(mSelesai[2], 10);
      let diff = menitSelesai - menitDaftar;
      if (diff < 0) diff += 24 * 60; // Melewati tengah malam
      if (diff > 0 && diff <= 300) return diff;
    }
  } catch {
    // fallback
  }
  return 7.0;
}

/**
 * Helper: Normalisasi data riwayat antrean laporan ke format ML
 */
/**
 * Helper: Ekstraksi objek Date dari string tanggal (mendukung YYYY-MM-DD dan DD/MM/YYYY)
 */
function parseTanggalObj(tglStr) {
  if (!tglStr || typeof tglStr !== 'string') return null;
  const str = tglStr.trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
    }
  } else if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
    }
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

const DAFTAR_NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function formatBulanTahun(dt) {
  if (!dt || !(dt instanceof Date) || isNaN(dt.getTime())) return '';
  return `${DAFTAR_NAMA_BULAN[dt.getMonth()]} ${dt.getFullYear()}`;
}

/**
 * Helper: Normalisasi data riwayat antrean laporan ke format ML dengan pelacakan baris ditolak & rentang tanggal riil
 */
function normalisasiKeDatasetML(rawItems) {
  const dataset = [];
  let ditolakStatusBukanSelesai = 0;
  let ditolakFormatTidakLengkap = 0;
  let adaKolomWaktuTunggu = false;
  let minDate = null;
  let maxDate = null;

  rawItems.forEach((item, idx) => {
    // 1. Cek jika sudah dalam format dataset langsung
    if (item.waktu_tunggu_menit !== undefined && item.jam_daftar !== undefined) {
      adaKolomWaktuTunggu = true;
      const antreanDepan = parseInt(item.antrean_di_depan || 0, 10);
      const jamDaftar = parseFloat(item.jam_daftar || 9.0);
      const waktuTunggu = parseFloat(item.waktu_tunggu_menit || 7.0);

      const tglObj = parseTanggalObj(item.tanggal || item.registered_at || item.created_at);
      if (tglObj) {
        if (!minDate || tglObj < minDate) minDate = tglObj;
        if (!maxDate || tglObj > maxDate) maxDate = tglObj;
      }

      if (waktuTunggu > 0) {
        dataset.push({
          nomor: item.nomor || `A-${idx + 1}`,
          antrean_di_depan: Math.max(0, antreanDepan),
          jam_daftar: jamDaftar,
          rata_waktu_pelayanan: parseFloat(item.rata_waktu_pelayanan || 7.0),
          waktu_tunggu_menit: waktuTunggu,
          status: 'COMPLETE',
        });
      } else {
        ditolakFormatTidakLengkap++;
      }
      return;
    }

    // 2. Format dari ekspor laporan CSV riwayat antrean
    const status = (item['Status'] || item['status'] || '').toUpperCase();
    if (status && status !== 'SELESAI' && status !== 'COMPLETE') {
      ditolakStatusBukanSelesai++;
      return; // Hanya data selesai yang digunakan untuk melatih model waktu tunggu
    }

    const nomor = item['Nomor Antrean'] || item['nomor'] || `A-${idx + 1}`;
    const jamDaftarStr = item['Jam Daftar'] || item['jam_daftar'] || '';
    const jamSelesaiStr = item['Jam Selesai'] || item['jam_selesai'] || '';
    const tanggalStr = item['Tanggal'] || item['tanggal'] || '';
    const durasiCol = item['Durasi Pelayanan (Menit)'] || item['durasi_aktual_menit'];
    const waktuTungguCol = item['Waktu Tunggu (Menit)'] || item['waktu_tunggu_menit'] || item['Waktu Tunggu'] || item['waktu_tunggu'];

    const tglObj = parseTanggalObj(tanggalStr);
    if (tglObj) {
      if (!minDate || tglObj < minDate) minDate = tglObj;
      if (!maxDate || tglObj > maxDate) maxDate = tglObj;
    }

    const jamDaftar = parseJamDesimal(jamDaftarStr);

    // Bedakan waktu tunggu aktual dari durasi pelayanan:
    let waktuTungguVal;
    if (waktuTungguCol !== undefined && waktuTungguCol !== '' && waktuTungguCol !== '-') {
      adaKolomWaktuTunggu = true;
      waktuTungguVal = parseFloat(waktuTungguCol);
    }
    if (isNaN(waktuTungguVal) || waktuTungguVal === undefined || waktuTungguVal <= 0) {
      waktuTungguVal = durasiCol ? parseFloat(durasiCol) : hitungDurasiMenit(jamDaftarStr, jamSelesaiStr, tanggalStr);
      if (isNaN(waktuTungguVal) || waktuTungguVal <= 0) {
        waktuTungguVal = 7.0;
      }
    }
    // Batasi nilai waktu tunggu maksimal 60 menit (outlier loket puskesmas)
    waktuTungguVal = Math.min(60.0, Math.max(1.0, waktuTungguVal));

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
      if (matchNum) {
        antreanDepan = Math.max(0, parseInt(matchNum[0], 10) - 1);
      } else {
        antreanDepan = idx;
      }
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

  // Tentukan ringkasan rentang tanggal terluar
  let rentangTanggal = 'Tidak tertera';
  if (minDate && maxDate) {
    const minStr = formatBulanTahun(minDate);
    const maxStr = formatBulanTahun(maxDate);
    rentangTanggal = minStr === maxStr ? minStr : `${minStr} – ${maxStr}`;
  }

  const alasanDitolak = [];
  if (ditolakStatusBukanSelesai > 0) {
    alasanDitolak.push(`${ditolakStatusBukanSelesai} baris diabaikan karena belum berstatus SELESAI (batal atau terlambat)`);
  }
  if (ditolakFormatTidakLengkap > 0) {
    alasanDitolak.push(`${ditolakFormatTidakLengkap} baris diabaikan karena format kolom waktu tidak lengkap`);
  }

  return {
    dataset,
    totalBaris: rawItems.length,
    berhasil: dataset.length,
    ditolak: ditolakStatusBukanSelesai + ditolakFormatTidakLengkap,
    alasanDitolak,
    rentangTanggal,
    adaKolomWaktuTunggu,
    minDate,
    maxDate
  };
}

/**
 * Jalankan script latih_model.py via child_process
 */
async function jalankanPythonLatih(datasetPath) {
  return new Promise((resolve, reject) => {
    const rootDir = process.cwd();
    let pythonBin = path.join(rootDir, 'venv', 'bin', 'python3');
    if (!fs.existsSync(pythonBin)) {
      pythonBin = 'python3';
    }

    const scriptPath = path.join(rootDir, 'api', 'latih_model.py');
    const child = spawn(pythonBin, [scriptPath, '--dataset', datasetPath, '--paksa'], {
      cwd: rootDir,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `Proses Python keluar dengan kode ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * POST /api/ml/retrain
 *
 * Menerima berkas CSV riwayat antrean untuk melatih model Random Forest.
 */
export async function POST(request) {
  const sesi = ambilSesiDariRequest(request);
  if (!sesi) {
    return NextResponse.json(
      { error: 'Autentikasi admin diperlukan untuk memperbarui model AI.' },
      { status: 401 }
    );
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    let rawItems = [];
    let namaFile = 'berkas_riwayat.csv';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) {
        return NextResponse.json({ error: 'Berkas CSV tidak ditemukan pada formulir unggah.' }, { status: 400 });
      }
      namaFile = file.name || 'berkas_riwayat.csv';
      const text = await file.text();
      rawItems = parseCSV(text);
    } else {
      const body = await request.json().catch(() => ({}));
      if (body.namaFile) namaFile = body.namaFile;
      if (body.csvText) {
        rawItems = parseCSV(body.csvText);
      } else if (Array.isArray(body.data)) {
        rawItems = body.data;
      } else {
        return NextResponse.json({ error: 'Permintaan harus memuat file CSV atau array data riwayat antrean.' }, { status: 400 });
      }
    }

    if (!rawItems || rawItems.length === 0) {
      return NextResponse.json({ error: 'Berkas CSV kosong atau tidak memiliki baris data yang dapat diproses.' }, { status: 400 });
    }

    // Normalisasi data dengan pelacakan lengkap
    const hasilNormalisasi = normalisasiKeDatasetML(rawItems);
    const { dataset, totalBaris, berhasil, ditolak, alasanDitolak, rentangTanggal, adaKolomWaktuTunggu } = hasilNormalisasi;

    if (dataset.length === 0) {
      return NextResponse.json({
        error: 'Tidak ditemukan riwayat antrean berstatus SELESAI dalam berkas CSV ini. Pastikan berkas memuat data antrean yang sudah selesai dilayani.',
        ringkasan: {
          nama_file: namaFile,
          total_baris: totalBaris,
          baris_berhasil: 0,
          baris_ditolak: totalBaris,
          alasan_penolakan: alasanDitolak.length > 0 ? alasanDitolak : ['Semua baris berstatus selain SELESAI atau tidak memiliki data waktu valid.']
        }
      }, { status: 400 });
    }

    if (dataset.length < 5) {
      return NextResponse.json({
        error: `Data antrean selesai yang valid hanya ${dataset.length} baris. Minimal 5 data antrean diperlukan untuk memperbarui model perkiraan waktu tunggu.`,
        ringkasan: {
          nama_file: namaFile,
          total_baris: totalBaris,
          baris_berhasil: dataset.length,
          baris_ditolak: ditolak,
          alasan_penolakan: alasanDitolak
        }
      }, { status: 400 });
    }

    // Simpan dataset ke temporary file untuk pelatihan Python
    const tempDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(tempDir)) {
      try { fs.mkdirSync(tempDir, { recursive: true }); } catch {}
    }
    const tempFilePath = path.join(tempDir, `import_ml_${Date.now()}.csv`);
    
    // Tulis file CSV bersih untuk script Python
    const csvLines = ['antrean_di_depan,rata_waktu_pelayanan,jam_daftar,waktu_tunggu_menit,status'];
    dataset.forEach(row => {
      csvLines.push(`${row.antrean_di_depan},${row.rata_waktu_pelayanan},${row.jam_daftar},${row.waktu_tunggu_menit},${row.status}`);
    });
    fs.writeFileSync(tempFilePath, csvLines.join('\n'), 'utf-8');

    // 1. Simpan ke Supabase ml_dataset jika terhubung (terpisah dari tabel antrean operasional)
    let dbSavedCount = 0;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const tenantId = sesi.organisasiId || '00000000-0000-0000-0000-000000000001';
        const rowsToInsert = dataset.slice(0, 5000).map((d, i) => ({
          tenant_id: tenantId,
          nomor: d.nomor || `IMP-${i + 1}`,
          sumber: 'IMPORT_CSV',
          antrean_di_depan: d.antrean_di_depan,
          jam_daftar: Math.round(d.jam_daftar),
          waktu_tunggu_menit: d.waktu_tunggu_menit,
          status: 'COMPLETE',
        }));
        const { error: insErr, data: insData } = await supabase.from('ml_dataset').insert(rowsToInsert).select('id');
        if (!insErr && insData) {
          dbSavedCount = insData.length;
        }
      }
    } catch (dbErr) {
      console.warn('Gagal simpan ke Supabase ml_dataset (non-fatal):', dbErr.message);
    }

    // 2. Jalankan pelatihan model Random Forest Scikit-Learn
    let pythonSuccess = false;
    let metadataResult = null;

    try {
      await jalankanPythonLatih(tempFilePath);
      pythonSuccess = true;

      const metaPath = path.join(process.cwd(), 'api', 'model_metadata.json');
      if (fs.existsSync(metaPath)) {
        metadataResult = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      }
    } catch (trainErr) {
      console.warn('Pelatihan via script lokal gagal, mencoba Flask endpoint:', trainErr.message);
      try {
        let baseUrl = 'http://127.0.0.1:5328';
        if (process.env.PYTHON_API_URL) baseUrl = process.env.PYTHON_API_URL;
        const resp = await fetch(`${baseUrl}/api/retrain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataset }),
        });
        if (resp.ok) {
          metadataResult = await resp.json();
          pythonSuccess = true;
        }
      } catch (flaskErr) {
        console.warn('Flask endpoint juga tidak merespons:', flaskErr.message);
      }
    } finally {
      try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch {}
    }

    const ringkasan = {
      nama_file: namaFile,
      total_baris_file: totalBaris,
      baris_berhasil: berhasil,
      baris_ditolak: ditolak,
      alasan_penolakan: alasanDitolak,
      rentang_data: rentangTanggal,
      ada_kolom_waktu_tunggu: adaKolomWaktuTunggu,
      tanggal_impor: new Date().toISOString(),
      model_diperbarui: pythonSuccess
    };

    return NextResponse.json({
      sukses: true,
      pesan: pythonSuccess
        ? `Model berhasil diperbarui dari ${berhasil.toLocaleString('id-ID')} data antrean (${rentangTanggal}).`
        : `Data riwayat (${berhasil.toLocaleString('id-ID')} baris) berhasil diproses dan disimpan ke basis data pelatihan.`,
      total_data_diimpor: berhasil,
      tersimpan_ke_db: dbSavedCount,
      model_diperbarui: pythonSuccess,
      ringkasan,
      metadata: metadataResult || {
        versi: `v${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
        total_sampel: berhasil,
        status: 'AKTIF',
        metode: 'Random Forest AI + Interval Estimator',
      },
    });

  } catch (error) {
    console.error('Error pada /api/ml/retrain:', error);
    return NextResponse.json({
      error: 'Terjadi kendala saat memproses berkas CSV: ' + (error?.message || 'Kesalahan sistem'),
    }, { status: 500 });
  }
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Tenant default untuk single-tenant (backward compatible)
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Validasi apakah env Supabase telah diisi oleh developer
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http') && 
  !supabaseUrl.includes('your-project-id')
);

// Inisialisasi client Supabase dengan singleton pattern untuk mencegah warning multiple GoTrueClient
const dapatkanSupabaseClient = () => {
  if (!isSupabaseConfigured) return null;

  if (typeof window !== 'undefined') {
    if (!window.__supabaseSingleton) {
      window.__supabaseSingleton = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false, // Menghindari multiple storage key conflict di browser
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    }
    return window.__supabaseSingleton;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

export const supabase = dapatkanSupabaseClient();

/**
 * Prediksi estimasi waktu tunggu menggunakan backend AI Flask
 * @param {number} antreanDiDepan - Jumlah antrean orang di depan pengunjung
 * @param {number} rataWaktu - Rata-rata waktu pelayanan dalam menit
 */
export async function getAIEstimate(antreanDiDepan = 0, rataWaktu = 7.0) {
  const now = new Date();
  const jamDaftar = Number((now.getHours() + now.getMinutes() / 60).toFixed(2));

  try {
    const res = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        antrean_di_depan: antreanDiDepan,
        rata_waktu_pelayanan: rataWaktu,
        jam_daftar: jamDaftar,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (typeof data.estimasi_menit === 'number') {
        return {
          estimasiMenit: data.estimasi_menit,
          metode: data.metode || 'random_forest_ai',
          pesan: data.pesan || 'Dihitung via Random Forest AI Universal',
        };
      }
    }
  } catch (err) {
    console.warn('[AI ESTIMATE] Menggunakan kalkulasi adaptif cadangan:', err);
  }

  // Fallback kalkulasi matematis adaptif jika Flask belum berjalan
  const fallbackMenit = Math.max(5, Math.round(antreanDiDepan * 7 + 4));
  return {
    estimasiMenit: fallbackMenit,
    metode: 'fallback_rule',
    pesan: `Estimasi adaptif: ${fallbackMenit} menit`,
  };
}

/**
 * Generator nomor antrean berikutnya (cth: A01, A02, ...)
 * @param {Array} currentList - Daftar antrean yang ada saat ini
 */
export function generateNextQueueNumber(currentList = []) {
  if (!currentList || currentList.length === 0) return 'A01';

  let highestNum = 0;
  currentList.forEach((item) => {
    if (item.nomor) {
      const match = item.nomor.match(/\d+/);
      if (match) {
        const val = parseInt(match[0], 10);
        if (val > highestNum) highestNum = val;
      }
    }
  });

  const nextVal = highestNum + 1;
  return `A${String(nextVal).padStart(2, '0')}`;
}

/**
 * Formula Haversine untuk kalkulasi jarak radius bumi (KM)
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius bumi dalam KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Number(d.toFixed(1));
}

/**
 * Integrasi OSRM (Open Source Routing Machine) Publik
 * Menghitung jarak jalan raya riil (KM) dan durasi tempuh (Menit)
 */
export async function calculateOSRMRoute(userLat, userLon, destLat, destLon) {
  if (!userLat || !userLon || !destLat || !destLon) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // Batas timeout 4 detik

    // OSRM format koordinat: {lon},{lat}
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userLon},${userLat};${destLon},${destLat}?overview=false`;
    const res = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const km = Number((route.distance / 1000).toFixed(1));
        const menit = Math.max(1, Math.round(route.duration / 60));
        return {
          jarakKm: `${km} KM`,
          waktuTempuh: `± ${menit} Menit`,
          rawKm: km,
          rawMenit: menit,
          metode: 'Rute Lokasi',
        };
      }
    }
  } catch (err) {
    console.warn('[GPS/OSRM] Gagal atau timeout menghubungi OSRM, fallback ke Haversine:', err);
  }

  // Fallback Haversine cerdas (asumsi kecepatan kendaraan 35 km/jam)
  const km = calculateHaversineDistance(userLat, userLon, destLat, destLon);
  const menit = Math.max(2, Math.round((km / 35) * 60 + 2));
  return {
    jarakKm: `${km} KM`,
    waktuTempuh: `± ${menit} Menit`,
    rawKm: km,
    rawMenit: menit,
    metode: 'GPS Radius Lurus',
  };
}

/**
 * Parsing URL Google Maps menjadi koordinat Lat & Lon
 */
export function parseGoogleMapsCoordinates(input) {
  if (!input) return null;
  const str = String(input).trim();

  // Pola @lat,lon, e.g. https://www.google.com/maps/@-0.5282,102.5853,17z
  const atMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lon: parseFloat(atMatch[2]) };
  }

  // Pola ?q=lat,lon atau &q=lat,lon
  const qMatch = str.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lon: parseFloat(qMatch[2]) };
  }

  // Pola ?ll=lat,lon
  const llMatch = str.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (llMatch) {
    return { lat: parseFloat(llMatch[1]), lon: parseFloat(llMatch[2]) };
  }

  // Pola angka langsung: "-0.5282, 102.5853"
  const rawMatch = str.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/);
  if (rawMatch) {
    return { lat: parseFloat(rawMatch[1]), lon: parseFloat(rawMatch[2]) };
  }

  return null;
}

/**
 * Menghitung durasi aktual pelayanan pengunjung (dalam menit)
 */
export function calculateActualDurationMinutes(createdAt, finishedAt) {
  if (!createdAt || !finishedAt) return 0;
  const start = new Date(createdAt).getTime();
  const end = new Date(finishedAt).getTime();
  const diffMs = Math.max(0, end - start);
  return Number((diffMs / (1000 * 60)).toFixed(1));
}

// ==============================================================================
// PENDAFTARAN ATOMIK VIA RPC (mencegah nomor ganda)
// ==============================================================================

// Alias bahasa Indonesia untuk tenant default
export const DEFAULT_ORGANISASI_ID = DEFAULT_TENANT_ID;

/**
 * Mendaftarkan antrean baru secara aman melalui server API
 * Menghasilkan token pembatalan acak dan menyimpan hash-nya di database
 * @param {string} nama - Nama pengunjung / pelanggan
 * @param {string} sumber - 'PUBLIC' atau 'ADMIN'
 * @param {string|null} idempotencyKey - Kunci idempotensi unik
 * @param {string} organisasiId - UUID organisasi
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function registerQueueAtomic(nama, sumber = 'PUBLIC', idempotencyKey = null, organisasiId = DEFAULT_ORGANISASI_ID) {
  // 1. Coba melalui endpoint server /api/antrean/daftar (menjamin token pembatalan aman)
  try {
    const res = await fetch('/api/antrean/daftar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nama,
        sumber,
        organisasi_id: organisasiId,
        kunci_idempotensi: idempotencyKey,
      }),
    });

    const hasil = await res.json().catch(() => ({}));

    if (res.ok && hasil.sukses && hasil.tiket) {
      return { data: hasil.tiket, error: null };
    }

    if (!res.ok) {
      // Jika endpoint mengembalikan error terstruktur, kembalikan pesannya
      return { data: null, error: { message: hasil.pesan || `Server error (${res.status})` } };
    }
  } catch (errApi) {
    console.warn('[registerQueueAtomic] Panggilan /api/antrean/daftar gagal, mencoba RPC langsung:', errApi.message);
  }

  // 2. Fallback: panggil Supabase RPC langsung jika API route lokal tidak dapat dijangkau
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: { message: 'Database antrean tidak dikonfigurasi.' } };
  }

  try {
    const { data, error } = await supabase.rpc('register_queue', {
      p_tenant_id: organisasiId,
      p_nama: nama,
      p_sumber: sumber,
      p_idempotency_key: idempotencyKey,
      p_cancel_token_hash: null,
    });

    if (error) return { data: null, error };

    const ticket = Array.isArray(data) ? data[0] : data;
    return { data: ticket, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message } };
  }
}

/**
 * Membatalkan tiket antrean secara aman menggunakan token pembatalan
 * @param {number} antreanId - ID tiket antrean
 * @param {string} tokenPembatalan - Token pembatalan rahasia yang dipegang pengguna
 * @param {string} alasan - Alasan pembatalan (opsional)
 * @returns {Promise<{sukses: boolean, pesan: string, tiket?: object}>}
 */
export async function batalkanAntreanAman(antreanId, tokenPembatalan, alasan = 'Dibatalkan oleh pengunjung') {
  try {
    const res = await fetch('/api/antrean/batal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        antrean_id: antreanId,
        token_pembatalan: tokenPembatalan,
        alasan,
      }),
    });

    const hasil = await res.json().catch(() => ({}));
    if (res.ok && hasil.sukses) {
      return { sukses: true, pesan: hasil.pesan, tiket: hasil.tiket };
    }

    return {
      sukses: false,
      pesan: hasil.pesan || `Gagal membatalkan tiket (kode ${res.status}).`,
    };
  } catch (err) {
    return {
      sukses: false,
      pesan: 'Terjadi kegagalan koneksi jaringan saat memproses pembatalan: ' + err.message,
    };
  }
}

// ==============================================================================
// PENCATATAN KEJADIAN PANGGILAN (server-side timestamps)
// ==============================================================================

/**
 * Mencatat kejadian panggilan di server via RPC
 * @param {number} antreanId - ID tiket antrean
 * @param {number} panggilanKe - Panggilan ke berapa
 * @returns {Promise<{error: object|null}>}
 */
export async function logCallEvent(antreanId, panggilanKe = 1) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: null }; // Silent no-op jika Supabase tidak aktif
  }

  try {
    const { error } = await supabase.rpc('log_call_event', {
      p_antrean_id: antreanId,
      p_panggilan_ke: panggilanKe,
    });
    if (error) {
      console.warn('[logCallEvent] RPC error:', error.message);
    }
    return { error };
  } catch (err) {
    console.warn('[logCallEvent] Error:', err.message);
    return { error: { message: err.message } };
  }
}

/**
 * Menyimpan fitur dataset ML saat pendaftaran
 * @param {object} params
 */
export async function recordMLRegistration({
  antreanId, nomor, sumber, antreanDiDepan, jamDaftar, registeredAt, tenantId = DEFAULT_TENANT_ID
}) {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    await supabase.from('ml_dataset').insert({
      tenant_id: tenantId,
      antrean_id: antreanId,
      nomor,
      sumber,
      antrean_di_depan: antreanDiDepan,
      jam_daftar: jamDaftar,
      registered_at: registeredAt,
      status: 'PENDING',
    });
  } catch (err) {
    console.warn('[recordMLRegistration] Error:', err.message);
  }
}

// ==============================================================================
// ESTIMATOR INTERVAL ANTARPANGGILAN
// ==============================================================================

/**
 * Menghitung estimasi waktu tunggu berdasarkan interval antarpanggilan.
 *
 * Alur:
 *   1. Ambil hingga 11 panggilan pertama terakhir (untuk mendapatkan 10 interval)
 *   2. Hitung selisih waktu antarpanggilan berturut-turut
 *   3. Jika >= 5 interval, saring pencilan (Q3 + 1.5 × IQR)
 *   4. Gunakan median interval valid sebagai estimator
 *   5. Kalikan dengan jumlah antrean di depan
 *
 * @param {number} antreanDiDepan - Jumlah orang di depan pengunjung
 * @param {string} tenantId - UUID tenant
 * @returns {Promise<{estimasiMenit: number|null, medianInterval: number|null, sampleCount: number, metode: string}>}
 */
export async function getIntervalEstimate(antreanDiDepan = 0, tenantId = DEFAULT_TENANT_ID) {
  if (!isSupabaseConfigured || !supabase || antreanDiDepan <= 0) {
    return { estimasiMenit: null, medianInterval: null, sampleCount: 0, metode: 'interval_unavailable' };
  }

  try {
    // Ambil 11 panggilan pertama terakhir (untuk 10 interval)
    const { data, error } = await supabase
      .from('call_log')
      .select('called_at')
      .eq('tenant_id', tenantId)
      .eq('is_first_call', true)
      .order('called_at', { ascending: false })
      .limit(11);

    if (error || !data || data.length < 2) {
      return { estimasiMenit: null, medianInterval: null, sampleCount: 0, metode: 'interval_insufficient_data' };
    }

    // Balik urutan agar kronologis
    const sorted = data.reverse();

    // Hitung interval antarpanggilan (dalam menit)
    const intervals = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].called_at).getTime();
      const curr = new Date(sorted[i].called_at).getTime();
      const diffMin = (curr - prev) / (1000 * 60);
      // Abaikan interval negatif atau nol (data korup)
      if (diffMin > 0) {
        intervals.push(diffMin);
      }
    }

    if (intervals.length < 2) {
      return { estimasiMenit: null, medianInterval: null, sampleCount: intervals.length, metode: 'interval_insufficient_data' };
    }

    let validIntervals = [...intervals];

    // Jika >= 5 interval, saring pencilan menggunakan IQR
    if (validIntervals.length >= 5) {
      validIntervals.sort((a, b) => a - b);
      const q1Idx = Math.floor(validIntervals.length * 0.25);
      const q3Idx = Math.floor(validIntervals.length * 0.75);
      const q1 = validIntervals[q1Idx];
      const q3 = validIntervals[q3Idx];
      const iqr = q3 - q1;
      const upperBound = q3 + 1.5 * iqr;
      const lowerBound = Math.max(0, q1 - 1.5 * iqr);
      validIntervals = validIntervals.filter((v) => v >= lowerBound && v <= upperBound);
    }

    if (validIntervals.length === 0) {
      return { estimasiMenit: null, medianInterval: null, sampleCount: intervals.length, metode: 'interval_all_outliers' };
    }

    // Hitung median
    validIntervals.sort((a, b) => a - b);
    const mid = Math.floor(validIntervals.length / 2);
    const medianInterval = validIntervals.length % 2 === 0
      ? (validIntervals[mid - 1] + validIntervals[mid]) / 2
      : validIntervals[mid];

    const estimasiMenit = Math.max(1, Math.round(medianInterval * antreanDiDepan));

    return {
      estimasiMenit,
      medianInterval: Number(medianInterval.toFixed(1)),
      sampleCount: validIntervals.length,
      metode: 'interval_median',
    };
  } catch (err) {
    console.warn('[getIntervalEstimate] Error:', err.message);
    return { estimasiMenit: null, medianInterval: null, sampleCount: 0, metode: 'interval_error' };
  }
}

// ==============================================================================
// PREDIKSI GABUNGAN: RANDOM FOREST + INTERVAL
// ==============================================================================

/**
 * Konfigurasi fallback waktu tunggu per orang jika kedua estimator tidak tersedia
 */
const FALLBACK_MINUTES_PER_PERSON = 5;

/**
 * Menghitung estimasi waktu tunggu gabungan.
 *
 * Logika penggabungan:
 *   - Jika kedua estimator valid: 50% RF + 50% Interval
 *   - Jika hanya RF valid: gunakan RF 100%
 *   - Jika hanya Interval valid: gunakan Interval 100%
 *   - Jika keduanya tidak valid: fallback rule-based
 *
 * Bobot 50:50 adalah bobot awal. Belum dioptimalkan dari evaluasi data.
 *
 * @param {number} antreanDiDepan
 * @param {number} rataWaktu - Rata-rata waktu pelayanan (menit)
 * @param {string} tenantId
 * @returns {Promise<{estimasiMenit: number, metode: string, detail: object}>}
 */
export async function getCombinedEstimate(antreanDiDepan = 0, rataWaktu = 7.0, tenantId = DEFAULT_TENANT_ID) {
  if (antreanDiDepan <= 0) {
    return {
      estimasiMenit: 2,
      metode: 'direct_next',
      detail: { pesan: 'Giliran berikutnya segera' },
    };
  }

  // Jalankan kedua estimator secara paralel
  const [rfResult, intervalResult] = await Promise.all([
    getAIEstimate(antreanDiDepan, rataWaktu),
    getIntervalEstimate(antreanDiDepan, tenantId),
  ]);

  const rfValid = rfResult && rfResult.metode !== 'fallback_rule' && rfResult.estimasiMenit > 0;
  const intervalValid = intervalResult && intervalResult.estimasiMenit !== null && intervalResult.sampleCount >= 2;

  let estimasiMenit;
  let metode;

  if (rfValid && intervalValid) {
    // Gabungan 50/50 (bobot awal, belum dioptimalkan)
    estimasiMenit = Math.round(0.5 * rfResult.estimasiMenit + 0.5 * intervalResult.estimasiMenit);
    metode = 'combined_rf_interval';
  } else if (rfValid) {
    estimasiMenit = rfResult.estimasiMenit;
    metode = 'random_forest_only';
  } else if (intervalValid) {
    estimasiMenit = intervalResult.estimasiMenit;
    metode = 'interval_only';
  } else {
    // Fallback rule-based
    estimasiMenit = Math.max(2, antreanDiDepan * FALLBACK_MINUTES_PER_PERSON);
    metode = 'fallback_rule';
  }

  // Pastikan tidak negatif
  estimasiMenit = Math.max(1, estimasiMenit);

  return {
    estimasiMenit,
    metode,
    detail: {
      rf: rfValid ? { menit: rfResult.estimasiMenit, metode: rfResult.metode } : null,
      interval: intervalValid ? { menit: intervalResult.estimasiMenit, median: intervalResult.medianInterval, samples: intervalResult.sampleCount } : null,
      fallbackPerOrang: FALLBACK_MINUTES_PER_PERSON,
    },
  };
}


import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Validasi apakah env Supabase telah diisi oleh developer
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http') && 
  !supabaseUrl.includes('your-project-id')
);

// Inisialisasi client Supabase dengan auto reconnect untuk Realtime
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;

/**
 * Prediksi estimasi waktu tunggu menggunakan backend AI Flask
 * @param {number} antreanDiDepan - Jumlah antrean orang di depan pasien
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
          pesan: data.pesan || 'Dihitung via Random Forest AI Puskesmas',
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
 * Menghitung durasi aktual pelayanan pasien (dalam menit)
 */
export function calculateActualDurationMinutes(createdAt, finishedAt) {
  if (!createdAt || !finishedAt) return 0;
  const start = new Date(createdAt).getTime();
  const end = new Date(finishedAt).getTime();
  const diffMs = Math.max(0, end - start);
  return Number((diffMs / (1000 * 60)).toFixed(1));
}

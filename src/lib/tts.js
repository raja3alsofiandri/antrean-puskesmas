/**
 * Helper Text-To-Speech (TTS) Suara Manusia Asli Bahasa Indonesia untuk pemanggilan pasien.
 * 
 * Menggunakan arsitektur Dual-Engine:
 * 1. Primary Engine: Natural High-Quality Human Voice Audio stream (/api/tts)
 *    Menghasilkan suara manusia asli Indonesia yang jernih, luwes, dan berintonasi alami
 *    (seperti pengumuman bandara / rumah sakit profesional).
 * 2. Fallback Engine: Web Speech API (SpeechSynthesis) dengan prioritas voice Neural/Natural
 *    terbaik (Google Bahasa Indonesia / Microsoft Gadis/Ardi) jika offline.
 */

export const JEDA_ANTAR_FRASA = 320;

const RATE_BAWAAN = 0.95;
const PITCH_BAWAAN = 1.0;

const ANGKA_UCAP = [
  'nol', 'satu', 'dua', 'tiga', 'empat',
  'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
];

// Audio element singleton untuk pemutaran streaming audio alami
let currentAudioElement = null;
let idRangkaianAktif = 0;

/**
 * Menghentikan semua pemutaran suara yang sedang berjalan.
 */
export function stopAllSpeech() {
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {
      // ignore
    }
    currentAudioElement = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * Mengubah nomor antrean menjadi bentuk ucapan yang jelas.
 * Contoh: "A01" -> "A nol satu", "B12" -> "B satu dua".
 */
export function ejaNomorAntrean(nomor) {
  if (nomor === null || nomor === undefined) return '';
  const bersih = String(nomor).trim().replace(/[^0-9A-Za-z]/g, '');
  if (!bersih) return String(nomor).trim();

  const cocok = bersih.match(/^([A-Za-z]+)?(\d+)$/);
  if (!cocok) return String(nomor).trim();

  const huruf = cocok[1] ? cocok[1].toUpperCase().split('').join(' ') : '';
  const digit = cocok[2].split('').map((d) => ANGKA_UCAP[Number(d)]).join(' ');

  return huruf ? `${huruf} ${digit}` : digit;
}

/**
 * Memilih voice browser Indonesia terbaik (untuk fallback offline).
 */
export function pilihSuaraIndonesia() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  let voices = [];
  try {
    voices = window.speechSynthesis.getVoices() || [];
  } catch {
    return null;
  }
  if (!voices.length) return null;

  const skorNama = (nama) => {
    const n = (nama || '').toLowerCase();
    let skor = 0;
    if (n.includes('natural') || n.includes('neural')) skor += 150;
    if (n.includes('google')) skor += 100;
    if (n.includes('gadis')) skor += 80;
    if (n.includes('damayanti')) skor += 70;
    if (n.includes('microsoft')) skor += 60;
    if (n.includes('ardi')) skor += 50;
    if (n.includes('indonesia')) skor += 30;
    return skor;
  };

  const kandidat = voices
    .map((v) => {
      const lang = (v.lang || '').toLowerCase().replace('_', '-');
      let skor = 0;
      if (lang === 'id-id') skor += 60;
      else if (lang === 'id') skor += 50;
      else if (lang.startsWith('id-')) skor += 40;
      else if (lang.startsWith('id')) skor += 30;

      if (skor > 0) skor += skorNama(v.name);
      return { voice: v, skor };
    })
    .filter((k) => k.skor > 0)
    .sort((a, b) => b.skor - a.skor);

  return kandidat.length ? kandidat[0].voice : null;
}

function bangunUtterance(kalimat, opsi = {}) {
  const utterance = new SpeechSynthesisUtterance(kalimat);
  utterance.lang = opsi.lang || 'id-ID';
  utterance.rate = opsi.rate ?? RATE_BAWAAN;
  utterance.pitch = opsi.pitch ?? PITCH_BAWAAN;
  if (opsi.volume !== undefined) utterance.volume = opsi.volume;

  const voice = opsi.voice || pilihSuaraIndonesia();
  if (voice) utterance.voice = voice;

  return utterance;
}

/**
 * Menyusun kalimat pemanggilan pasien dengan tata bahasa formal klinis
 * yang santun, jelas, dan natural.
 */
export function susunKalimatPanggilan(nomor, namaPasien, panggilanKe = 1) {
  const nomorUcap = ejaNomorAntrean(nomor);
  const nama = String(namaPasien || '').trim();

  if (panggilanKe > 1) {
    if (nama) {
      return `Panggilan ulang, nomor antrean, ${nomorUcap}, atas nama, ${nama}. Silakan segera menuju ke loket pemeriksaan.`;
    }
    return `Panggilan ulang, nomor antrean, ${nomorUcap}. Silakan segera menuju ke loket pemeriksaan.`;
  }

  if (nama) {
    return `Nomor antrean, ${nomorUcap}, atas nama, ${nama}. Silakan menuju ke loket pemeriksaan.`;
  }
  return `Nomor antrean, ${nomorUcap}. Silakan menuju ke loket pemeriksaan.`;
}

/**
 * Kompatibilitas fungsi susunFrasaPanggilan lama.
 */
export function susunFrasaPanggilan(nomor, namaPasien, panggilanKe = 1) {
  const nomorUcap = ejaNomorAntrean(nomor);
  const nama = String(namaPasien || '').trim();

  if (panggilanKe > 1) {
    return [
      'Panggilan ulang',
      `nomor antrean ${nomorUcap}`,
      nama ? `atas nama ${nama}` : '',
      'silakan segera menuju loket pemeriksaan',
    ].filter(Boolean);
  }

  return [
    'Nomor antrean',
    `${nomorUcap}`,
    nama ? `atas nama ${nama}` : '',
    'silakan menuju loket pemeriksaan',
  ].filter(Boolean);
}

/**
 * Memutar audio dari URL / API dengan promise.
 */
function playAudioUrl(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    currentAudioElement = audio;
    audio.onended = () => {
      currentAudioElement = null;
      resolve();
    };
    audio.onerror = (e) => {
      currentAudioElement = null;
      reject(e);
    };
    audio.play().catch(reject);
  });
}

/**
 * Membaca teks menggunakan model suara manusia asli.
 * Otomatis mencoba Natural Audio Model (/api/tts) terlebih dahulu.
 * Jika perangkat offline atau gagal, fallback secara transparan ke SpeechSynthesis browser terbaik.
 */
export async function ucapkanSuaraManusia(teks, opsi = {}) {
  if (typeof window === 'undefined') return;
  const kalimat = String(teks || '').trim();
  if (!kalimat) return;

  idRangkaianAktif += 1;
  const idSaya = idRangkaianAktif;

  stopAllSpeech();

  // 1. Coba Suara Manusia Asli via API Audio Model
  try {
    const ttsUrl = `/api/tts?text=${encodeURIComponent(kalimat)}`;
    await playAudioUrl(ttsUrl);
    return;
  } catch (err) {
    console.warn('TTS API gagal atau offline, beralih ke engine browser:', err);
  }

  // 2. Fallback: Web Speech Synthesis Browser
  if (idSaya !== idRangkaianAktif) return;
  if ('speechSynthesis' in window) {
    try {
      const utterance = bangunUtterance(kalimat, opsi);
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Fallback SpeechSynthesis error:', e);
    }
  }
}

/**
 * Membaca satu kalimat tunggal.
 */
export function ucapkanKalimat(kalimat, opsi = {}) {
  ucapkanSuaraManusia(kalimat, opsi);
}

/**
 * Membaca rangkaian frasa dengan jeda alami.
 * Menggabungkan kalimat atau memutarnya secara berurutan dengan model suara manusia asli.
 */
export async function ucapkanBerpseci(segments, opsi = {}) {
  if (typeof window === 'undefined') return;
  const frasa = (segments || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!frasa.length) return;

  // Gabungkan frasa menjadi satu kalimat utuh dengan koma untuk intonasi napas manusia yang tepat
  const kalimatLengkap = frasa.join(', ');
  await ucapkanSuaraManusia(kalimatLengkap, opsi);
}

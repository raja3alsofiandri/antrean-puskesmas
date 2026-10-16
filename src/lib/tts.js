/**
 * TTS (Text-to-Speech) Helper — Sistem Antrean Universal
 *
 * Alur:
 *   1. Coba fetch MP3 dari /api/tts (proxy Google Translate)
 *   2. Jika gagal, fallback ke browser speechSynthesis
 *   3. stopAllSpeech() menghentikan semua audio yang sedang diputar
 */

// Referensi audio element yang sedang aktif (untuk stop)
let currentAudio = null;
let currentAbortController = null;

const ANGKA_UCAP = [
  'nol', 'satu', 'dua', 'tiga', 'empat',
  'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
];

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
 * Menghentikan semua speech dan audio yang sedang berjalan
 */
export function stopAllSpeech() {
  // Hentikan speechSynthesis browser
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) { /* ignore */ }
  }
  // Hentikan Audio element jika ada
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.src = '';
    } catch (_) { /* ignore */ }
    currentAudio = null;
  }
  // Abort fetch yang sedang berjalan
  if (currentAbortController) {
    try { currentAbortController.abort(); } catch (_) { /* ignore */ }
    currentAbortController = null;
  }
}

/**
 * Memutar audio dari URL, mengembalikan Promise yang resolve saat selesai
 * @param {string} url - URL audio (blob atau http)
 * @returns {Promise<void>}
 */
function playAudioUrl(url) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('No window')); return; }

    // Hentikan audio sebelumnya
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.src = ''; } catch (_) { /* ignore */ }
    }

    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      currentAudio = null;
      resolve();
    };
    audio.onerror = (e) => {
      currentAudio = null;
      reject(e);
    };

    audio.play().catch((err) => {
      currentAudio = null;
      reject(err);
    });
  });
}

/**
 * Membuat SpeechSynthesisUtterance dengan voice Indonesia
 * @param {string} teks
 * @returns {SpeechSynthesisUtterance}
 */
function bangunUtterance(teks) {
  const utterance = new SpeechSynthesisUtterance(teks);
  utterance.lang = 'id-ID';
  utterance.rate = 0.88;
  utterance.pitch = 1.05;

  const voices = window.speechSynthesis.getVoices();
  const idVoice = voices.find((v) =>
    (v.lang && (v.lang === 'id-ID' || v.lang.startsWith('id'))) ||
    (v.name && (
      v.name.toLowerCase().includes('indonesia') ||
      v.name.toLowerCase().includes('id-id') ||
      v.name.toLowerCase().includes('gadis') ||
      v.name.toLowerCase().includes('damayanti')
    ))
  );
  if (idVoice) utterance.voice = idVoice;

  return utterance;
}

/**
 * Ucapkan teks dengan suara manusia (Google Translate TTS) dengan fallback ke browser
 * @param {string} teks - Teks yang akan diucapkan
 * @param {object} opsi - Opsi tambahan
 * @param {number} opsi.delayMs - Delay sebelum mulai bicara (default 0)
 * @returns {Promise<void>}
 */
export async function ucapkanSuaraManusia(teks, opsi = {}) {
  if (!teks || typeof window === 'undefined') return;

  const { delayMs = 0 } = opsi;

  // Hentikan speech/audio sebelumnya
  stopAllSpeech();

  // Tunggu delay jika diminta (misalnya setelah chime)
  if (delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }

  // 1. Coba fetch dari /api/tts
  try {
    currentAbortController = new AbortController();
    const encodedText = encodeURIComponent(teks);
    const res = await fetch(`/api/tts?text=${encodedText}`, {
      signal: currentAbortController.signal,
    });
    currentAbortController = null;

    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0) {
        const blobUrl = URL.createObjectURL(blob);
        try {
          await playAudioUrl(blobUrl);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
        return; // Berhasil via API
      }
    }
  } catch (err) {
    currentAbortController = null;
    // Lanjut ke fallback jika gagal (network error, abort, dll)
    if (err.name === 'AbortError') return; // User stopped speech
    console.warn('[TTS] API gagal, fallback ke speechSynthesis:', err.message);
  }

  // 2. Fallback: browser speechSynthesis
  if ('speechSynthesis' in window) {
    return new Promise((resolve) => {
      const utterance = bangunUtterance(teks);
      utterance.onend = resolve;
      utterance.onerror = () => resolve(); // Tetap resolve agar tidak hang
      window.speechSynthesis.speak(utterance);
    });
  }
}

/**
 * Menyusun kalimat panggilan yang natural untuk TTS (Universal)
 * @param {string} nomor - Nomor antrean (cth: "A01")
 * @param {string} nama - Nama pelanggan / pengunjung
 * @param {number} panggilanKe - Panggilan ke berapa (1 = pertama, >1 = ulang)
 * @param {string} tujuanLoket - Nama loket tujuan (default: 'loket pelayanan')
 * @returns {string} Kalimat panggilan lengkap
 */
export function susunKalimatPanggilan(nomor, nama, panggilanKe = 1, tujuanLoket = 'loket pelayanan') {
  // Pisahkan huruf dan angka: "A01" → "A 01"
  const nomorSpelled = (nomor || '').replace(/([A-Za-z])(\d+)/, '$1 $2');
  const intro = panggilanKe > 1 ? 'Panggilan ulang. ' : '';

  return `${intro}Nomor antrean, ${nomorSpelled}, atas nama, ${nama}, silakan menuju ke ${tujuanLoket} sekarang.`;
}

/**
 * Menyusun kalimat peringatan bersiap (Universal)
 * @param {string} nomor
 * @param {string} nama
 * @param {string} batasWaktu - Waktu batas (cth: "09:30")
 * @param {number} sisaAntrean - Jumlah orang di depan
 * @returns {string}
 */
export function susunKalimatPeringatan(nomor, nama, batasWaktu, sisaAntrean = 4) {
  const nomorSpelled = (nomor || '').replace(/([A-Za-z])(\d+)/, '$1 $2');
  const infoSisa = sisaAntrean === 0
    ? 'giliran Anda berikutnya'
    : `antrean Anda tersisa ${sisaAntrean} orang lagi di depan`;

  return `Pemberitahuan layanan antrean. Nomor antrean ${nomorSpelled}, atas nama ${nama}, ${infoSisa}. Harap bersiap menuju loket pelayanan sebelum pukul ${batasWaktu} agar tidak terlewat.`;
}

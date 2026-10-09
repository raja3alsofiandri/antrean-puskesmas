/**
 * Helper Text-To-Speech (TTS) Bahasa Indonesia untuk pemanggilan pasien.
 * Hanya mengatur cara kalimat dibunyikan — tanpa logika bisnis.
 */

/** Jeda antar frasa (ms) — meniru "napas" manusia agar tidak terdengar robotik. */
export const JEDA_ANTAR_FRASA = 280;

/** Nilai bawaan rate & pitch yang lebih natural (tidak terlalu lambat / tinggi). */
const RATE_BAWAAN = 0.95;
const PITCH_BAWAAN = 1.0;

const ANGKA_UCAP = [
  'nol', 'satu', 'dua', 'tiga', 'empat',
  'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
];

// Penanda urutan rangkaian frasa terbaru — rangkaian lama otomatis berhenti.
let idRangkaianAktif = 0;

/**
 * Mengubah nomor antrean menjadi bentuk ucapan yang jelas.
 * Contoh: "A01" -> "A nol satu", "B12" -> "B satu dua", "7" -> "tujuh"? TIDAK —
 * nomor murni angka dieja per-digit juga agar jelas ("07" -> "nol tujuh").
 * Fallback: kembalikan input apa adanya.
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
 * Memilih voice Indonesia terbaik dari daftar voice browser.
 * Skor lebih tinggi untuk voice bermutu: Google, Gadis, Damayanti, Microsoft (neural), Ardi.
 * Return null jika tidak ada voice Indonesia → biarkan default engine.
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
    if (n.includes('google')) skor += 100;
    if (n.includes('gadis')) skor += 80;
    if (n.includes('damayanti')) skor += 70;
    if (n.includes('microsoft')) skor += 50;
    if (n.includes('ardi')) skor += 40;
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
 * Menyusun frasa pengumuman pemanggilan pasien (sama untuk halaman pasien & admin).
 * Return array string frasa — untuk dibacakan lewat ucapkanBerpseci().
 */
export function susunFrasaPanggilan(nomor, namaPasien, panggilanKe = 1) {
  const nomorUcap = ejaNomorAntrean(nomor);
  const nama = String(namaPasien || '').trim();

  if (panggilanKe > 1) {
    return [
      'Mohon maaf',
      'panggilan ulang',
      `nomor antrean ${nomorUcap}`,
      `atas nama ${nama}`,
      'silakan segera menuju loket pemeriksaan',
    ].filter(Boolean);
  }

  return [
    'Permisi',
    `nomor antrean ${nomorUcap}`,
    `atas nama ${nama}`,
    'silakan menuju loket pemeriksaan',
  ].filter(Boolean);
}

/**
 * Membaca satu kalimat tunggal dengan parameter natural.
 * Return SpeechSynthesisUtterance.
 */
export function ucapkanKalimat(kalimat, opsi = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const utterance = bangunUtterance(kalimat, opsi);
  try {
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Gagal membunyikan kalimat TTS:', err);
  }
  return utterance;
}

/**
 * Membaca rangkaian frasa dengan jeda alami antar frasa (chain utterance).
 * Contoh: ["Permisi", "nomor antrean A nol satu", "atas nama Budi"].
 * Rangkaian sebelumnya otomatis dibatalkan (cancel) agar tidak tumpang tindih.
 */
export function ucapkanBerpseci(segments, opsi = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const frasa = (segments || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!frasa.length) return;

  const jedaAntarFrasa = opsi.jedaAntarFrasa ?? JEDA_ANTAR_FRASA;

  // Batalkan rangkaian lama + utterance yang masih tertunda.
  idRangkaianAktif += 1;
  const idSaya = idRangkaianAktif;

  try {
    window.speechSynthesis.cancel();

    const bicara = (index) => {
      // Kalau ada panggilan baru di tengah jalan, rangkaian ini berhenti.
      if (idSaya !== idRangkaianAktif) return;
      if (index >= frasa.length) return;

      const utterance = bangunUtterance(frasa[index], opsi);
      utterance.onend = () => {
        if (idSaya !== idRangkaianAktif) return;
        setTimeout(() => bicara(index + 1), jedaAntarFrasa);
      };
      utterance.onerror = () => {
        if (idSaya !== idRangkaianAktif) return;
        setTimeout(() => bicara(index + 1), jedaAntarFrasa);
      };
      window.speechSynthesis.speak(utterance);
    };

    bicara(0);
  } catch (err) {
    console.warn('Gagal membunyikan rangkaian frasa TTS:', err);
  }
}

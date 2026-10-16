import crypto from 'crypto';

/**
 * Modul Keamanan Autentikasi Petugas & Sesi Server
 * Sistem Antrean Universal
 *
 * Menggunakan algoritma standar kriptografi Node.js (PBKDF2 & HMAC-SHA256)
 * tanpa dependensi eksternal, aman dari timing attack dan brute-force.
 */

// Kunci rahasia server untuk menandatangani token sesi (HMAC-SHA256)
const AUTH_SECRET = process.env.AUTH_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'rahasia-antrean-universal-default-2026';

// Nama cookie sesi httpOnly
export const NAMA_COOKIE_SESI = 'sesi_petugas';

// Durasi sesi dalam detik (8 jam)
export const DURASI_SESI_DETIK = 8 * 60 * 60;

// Batas percobaan login gagal sebelum akun dikunci (5 kali)
export const BATAS_PERCOBAAN_GAGAL = 5;

// Durasi penguncian akun (15 menit dalam milidetik)
export const DURASI_KUNCI_MS = 15 * 60 * 1000;

// Cache memori untuk pelacakan percobaan login (rate limiting per username/IP)
const pelacakPercobaan = new Map();

/**
 * Menghasilkan salt acak 16 byte dalam format hex
 * @returns {string}
 */
export function buatSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Menghash password menggunakan PBKDF2 dengan 100.000 iterasi
 * @param {string} password
 * @param {string} salt
 * @returns {string} hash hex
 */
export function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
}

/**
 * Memverifikasi kecocokan password menggunakan perbandingan waktu konstan (timing-safe)
 * @param {string} passwordInput
 * @param {string} hashTersimpan
 * @param {string} salt
 * @returns {boolean}
 */
export function verifikasiPassword(passwordInput, hashTersimpan, salt) {
  try {
    const hashHitung = hashPassword(passwordInput, salt);
    const bufHitung = Buffer.from(hashHitung, 'hex');
    const bufTersimpan = Buffer.from(hashTersimpan, 'hex');
    if (bufHitung.length !== bufTersimpan.length) return false;
    return crypto.timingSafeEqual(bufHitung, bufTersimpan);
  } catch (_) {
    return false;
  }
}

/**
 * Membuat token sesi terenkripsi/tertanda tangan (HMAC-SHA256)
 * @param {object} payload - Data sesi (userId, username, organisasiId, peran)
 * @returns {string} token sesi
 */
export function buatTokenSesi(payload) {
  const sekarang = Math.floor(Date.now() / 1000);
  const data = {
    ...payload,
    iat: sekarang,
    exp: sekarang + DURASI_SESI_DETIK,
  };
  const dataB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(dataB64)
    .digest('base64url');
  return `${dataB64}.${signature}`;
}

/**
 * Memverifikasi token sesi dan mengembalikan payload jika valid
 * @param {string} token
 * @returns {object|null} payload jika valid, null jika invalid/kedaluwarsa
 */
export function verifikasiTokenSesi(token) {
  if (!token || typeof token !== 'string') return null;
  const bagian = token.split('.');
  if (bagian.length !== 2) return null;

  const [dataB64, signature] = bagian;

  // Verifikasi tanda tangan digital HMAC-SHA256
  const signatureDiharapkan = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(dataB64)
    .digest('base64url');

  try {
    const bufAsli = Buffer.from(signature);
    const bufDiharapkan = Buffer.from(signatureDiharapkan);
    if (bufAsli.length !== bufDiharapkan.length) return null;
    if (!crypto.timingSafeEqual(bufAsli, bufDiharapkan)) return null;

    // Decode dan periksa kedaluwarsa
    const jsonStr = Buffer.from(dataB64, 'base64url').toString('utf8');
    const data = JSON.parse(jsonStr);

    const sekarang = Math.floor(Date.now() / 1000);
    if (!data.exp || data.exp < sekarang) {
      return null; // Kedaluwarsa
    }

    return data;
  } catch (_) {
    return null;
  }
}

/**
 * Memeriksa apakah suatu username/IP sedang dikunci karena percobaan gagal
 * @param {string} kunci - Username atau alamat IP
 * @returns {{ terkunci: boolean, sisaMenit: number }}
 */
export function periksaStatusKunci(kunci) {
  const info = pelacakPercobaan.get(kunci);
  if (!info) return { terkunci: false, sisaMenit: 0 };

  const sekarang = Date.now();
  if (info.terkunciSampai && info.terkunciSampai > sekarang) {
    const sisaMenit = Math.ceil((info.terkunciSampai - sekarang) / 60000);
    return { terkunci: true, sisaMenit };
  }

  // Jika kunci waktu sudah lewat, reset status terkunci
  if (info.terkunciSampai && info.terkunciSampai <= sekarang) {
    pelacakPercobaan.delete(kunci);
    return { terkunci: false, sisaMenit: 0 };
  }

  return { terkunci: false, sisaMenit: 0 };
}

/**
 * Mencatat percobaan login gagal dan mengunci jika melampaui batas
 * @param {string} kunci
 * @returns {{ terkunci: boolean, sisaPercobaan: number, sisaMenit: number }}
 */
export function catatLoginGagal(kunci) {
  const sekarang = Date.now();
  const info = pelacakPercobaan.get(kunci) || { gagal: 0, terkunciSampai: null };

  info.gagal += 1;

  if (info.gagal >= BATAS_PERCOBAAN_GAGAL) {
    info.terkunciSampai = sekarang + DURASI_KUNCI_MS;
    pelacakPercobaan.set(kunci, info);
    return { terkunci: true, sisaPercobaan: 0, sisaMenit: Math.ceil(DURASI_KUNCI_MS / 60000) };
  }

  pelacakPercobaan.set(kunci, info);
  return {
    terkunci: false,
    sisaPercobaan: BATAS_PERCOBAAN_GAGAL - info.gagal,
    sisaMenit: 0,
  };
}

/**
 * Mereset catatan login gagal setelah login berhasil
 * @param {string} kunci
 */
export function resetLoginGagal(kunci) {
  pelacakPercobaan.delete(kunci);
}

/**
 * Mengekstrak token sesi dari Request Next.js (dari cookies atau header Authorization)
 * @param {Request} request
 * @returns {object|null} Data sesi pengguna jika valid
 */
export function ambilSesiDariRequest(request) {
  try {
    // 1. Coba dari request.cookies (NextRequest)
    let token = request?.cookies?.get?.(NAMA_COOKIE_SESI)?.value;

    // 2. Coba dari Header Cookie (standar Web Request)
    if (!token) {
      const cookieHeader = request?.headers?.get?.('cookie') || '';
      if (cookieHeader) {
        const cookies = Object.fromEntries(
          cookieHeader.split(';').map(c => {
            const [k, ...v] = c.trim().split('=');
            return [k, decodeURIComponent(v.join('='))];
          })
        );
        token = cookies[NAMA_COOKIE_SESI];
      }
    }

    // 3. Fallback dari Header Authorization: Bearer <token>
    if (!token) {
      const authHeader = request?.headers?.get?.('authorization') || '';
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (!token) return null;

    return verifikasiTokenSesi(token);
  } catch (_) {
    return null;
  }
}

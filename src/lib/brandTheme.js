/**
 * brandTheme.js
 * Utilitas branding warna dinamis — dipakai di semua 3 halaman:
 * Admin (/admin), Pasien (/), dan Display (/display).
 *
 * Cara kerja:
 * 1. `generatePalette(hex600)` → hasilkan 11 shade warna dari 1 warna utama
 * 2. `injectBrandTheme(hex)` → inject <style> ke <head> yang meng-override
 *    CSS vars Tailwind (--color-teal-*) SEKALIGUS class langsung (!important)
 *    sehingga bekerja baik di Tailwind v4 CSS-var mode maupun inline-compiled mode.
 */

/** Hex → [H(0-360), S(0-100), L(0-100)] */
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** [H, S, L] → hex */
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Hasilkan 11 shade dari 1 hex (hex dianggap shade-600).
 * @param {string} hex600 - warna utama, contoh '#2563eb'
 * @returns {{ 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950 }}
 */
export function generatePalette(hex600) {
  const [h, s, l] = hexToHsl(hex600);
  return {
    50:  hslToHex(h, Math.max(s - 35, 8),  97),
    100: hslToHex(h, Math.max(s - 25, 12), 93),
    200: hslToHex(h, Math.max(s - 15, 18), 86),
    300: hslToHex(h, Math.max(s - 8,  25), 74),
    400: hslToHex(h, s,                    62),
    500: hslToHex(h, s,                    54),
    600: hex600,
    700: hslToHex(h, Math.min(s + 5,  100), Math.max(l - 9,  18)),
    800: hslToHex(h, Math.min(s + 8,  100), Math.max(l - 19, 12)),
    900: hslToHex(h, Math.min(s + 10, 100), Math.max(l - 29,  8)),
    950: hslToHex(h, Math.min(s + 10, 100), Math.max(l - 38,  5)),
  };
}

/**
 * Inject/update <style id="brand-theme-override"> dengan override penuh warna Tailwind.
 * Bekerja di semua 3 halaman. Aman dipanggil kapan saja di client-side.
 *
 * @param {string} primaryHex - warna utama dalam format hex 6 digit, contoh '#2563eb'
 */
export function injectBrandTheme(primaryHex) {
  if (typeof document === 'undefined') return;
  if (!primaryHex || !/^#[0-9a-fA-F]{6}$/.test(primaryHex)) return;

  try {
    const p = generatePalette(primaryHex);

    const css = `
:root {
  --brand-primary: ${p[600]};
  --brand-accent:  ${p[700]};
  --brand-bg:      ${p[50]};
  --color-teal-50:  ${p[50]};   --color-teal-100: ${p[100]};
  --color-teal-200: ${p[200]};  --color-teal-300: ${p[300]};
  --color-teal-400: ${p[400]};  --color-teal-500: ${p[500]};
  --color-teal-600: ${p[600]};  --color-teal-700: ${p[700]};
  --color-teal-800: ${p[800]};  --color-teal-900: ${p[900]};
  --color-teal-950: ${p[950]};
  --color-emerald-50:  ${p[50]};   --color-emerald-100: ${p[100]};
  --color-emerald-200: ${p[200]};  --color-emerald-300: ${p[300]};
  --color-emerald-400: ${p[400]};  --color-emerald-500: ${p[500]};
  --color-emerald-600: ${p[600]};  --color-emerald-700: ${p[700]};
  --color-emerald-800: ${p[800]};
}
/* Override kelas Tailwind langsung — fallback untuk nilai yang dikompilasi inline */
.bg-teal-50  { background-color: ${p[50]}  !important }
.bg-teal-100 { background-color: ${p[100]} !important }
.bg-teal-200 { background-color: ${p[200]} !important }
.bg-teal-300 { background-color: ${p[300]} !important }
.bg-teal-400 { background-color: ${p[400]} !important }
.bg-teal-500 { background-color: ${p[500]} !important }
.bg-teal-600 { background-color: ${p[600]} !important }
.bg-teal-700 { background-color: ${p[700]} !important }
.bg-teal-800 { background-color: ${p[800]} !important }
.bg-teal-900 { background-color: ${p[900]} !important }
.bg-teal-950 { background-color: ${p[950]} !important }
.bg-teal-500\\/10 { background-color: ${p[500]}1a !important }
.bg-teal-500\\/20 { background-color: ${p[500]}33 !important }
.bg-teal-400\\/20 { background-color: ${p[400]}33 !important }
.bg-teal-400\\/30 { background-color: ${p[400]}4d !important }
.bg-teal-800\\/80 { background-color: ${p[800]}cc !important }
.text-teal-50  { color: ${p[50]}  !important }
.text-teal-100 { color: ${p[100]} !important }
.text-teal-200 { color: ${p[200]} !important }
.text-teal-300 { color: ${p[300]} !important }
.text-teal-400 { color: ${p[400]} !important }
.text-teal-500 { color: ${p[500]} !important }
.text-teal-600 { color: ${p[600]} !important }
.text-teal-700 { color: ${p[700]} !important }
.text-teal-800 { color: ${p[800]} !important }
.text-teal-900 { color: ${p[900]} !important }
.text-teal-950 { color: ${p[950]} !important }
.border-teal-100 { border-color: ${p[100]} !important }
.border-teal-200 { border-color: ${p[200]} !important }
.border-teal-300 { border-color: ${p[300]} !important }
.border-teal-400 { border-color: ${p[400]} !important }
.border-teal-500 { border-color: ${p[500]} !important }
.border-teal-600 { border-color: ${p[600]} !important }
.border-teal-700 { border-color: ${p[700]} !important }
.border-teal-800 { border-color: ${p[800]} !important }
.border-teal-400\\/30 { border-color: ${p[400]}4d !important }
.border-teal-500\\/30 { border-color: ${p[500]}4d !important }
.border-teal-800\\/40 { border-color: ${p[800]}66 !important }
.border-teal-800\\/60 { border-color: ${p[800]}99 !important }
.ring-teal-500   { --tw-ring-color: ${p[500]} !important }
.divide-teal-200 > * + * { border-color: ${p[200]} !important }
.bg-emerald-50   { background-color: ${p[50]}  !important }
.bg-emerald-100  { background-color: ${p[100]} !important }
.bg-emerald-500  { background-color: ${p[500]} !important }
.bg-emerald-600  { background-color: ${p[600]} !important }
.text-emerald-500{ color: ${p[500]} !important }
.text-emerald-600{ color: ${p[600]} !important }
.text-emerald-700{ color: ${p[700]} !important }
.text-emerald-800{ color: ${p[800]} !important }
.border-emerald-100 { border-color: ${p[100]} !important }
.border-emerald-200 { border-color: ${p[200]} !important }
.hover\\:bg-teal-50:hover  { background-color: ${p[50]}  !important }
.hover\\:bg-teal-100:hover { background-color: ${p[100]} !important }
.hover\\:bg-teal-700:hover { background-color: ${p[700]} !important }
.hover\\:text-teal-700:hover { color: ${p[700]} !important }
.hover\\:text-teal-800:hover { color: ${p[800]} !important }
.hover\\:border-teal-200:hover { border-color: ${p[200]} !important }
.hover\\:border-teal-300:hover { border-color: ${p[300]} !important }
.focus\\:ring-teal-500:focus { --tw-ring-color: ${p[500]} !important }
.focus\\:ring-2:focus { box-shadow: 0 0 0 2px ${p[500]} !important }
.group:hover .group-hover\\:bg-teal-50  { background-color: ${p[50]}  !important }
.group:hover .group-hover\\:text-teal-700 { color: ${p[700]} !important }
.from-teal-400 { --tw-gradient-from: ${p[400]} !important }
.via-teal-400  { --tw-gradient-via:  ${p[400]} !important }
.to-teal-500   { --tw-gradient-to:   ${p[500]} !important }
.from-teal-600 { --tw-gradient-from: ${p[600]} !important }
.to-teal-600   { --tw-gradient-to:   ${p[600]} !important }
.from-teal-700 { --tw-gradient-from: ${p[700]} !important }
.from-teal-800 { --tw-gradient-from: ${p[800]} !important }
.to-teal-800   { --tw-gradient-to:   ${p[800]} !important }
.from-teal-900 { --tw-gradient-from: ${p[900]} !important }
.to-teal-900   { --tw-gradient-to:   ${p[900]} !important }
.via-teal-800  { --tw-gradient-via:  ${p[800]} !important }
.via-teal-900  { --tw-gradient-via:  ${p[900]} !important }
.from-teal-950 { --tw-gradient-from: ${p[950]} !important }
.via-teal-950  { --tw-gradient-via:  ${p[950]} !important }
.to-teal-950   { --tw-gradient-to:   ${p[950]} !important }
.via-teal-50\\/20 { --tw-gradient-via: ${p[50]}33 !important }
.shadow-teal-100 { --tw-shadow-color: ${p[100]} !important }
.shadow-teal-200 { --tw-shadow-color: ${p[200]} !important }
.shadow-teal-500\\/20 { --tw-shadow-color: ${p[500]}33 !important }
.shadow-teal-500\\/30 { --tw-shadow-color: ${p[500]}4d !important }
.shadow-teal-600\\/20 { --tw-shadow-color: ${p[600]}33 !important }
.shadow-teal-600\\/30 { --tw-shadow-color: ${p[600]}4d !important }
`;

    let style = document.getElementById('brand-theme-override');
    if (!style) {
      style = document.createElement('style');
      style.id = 'brand-theme-override';
      document.head.appendChild(style);
    }
    style.textContent = css;
  } catch (e) {
    console.warn('[BrandTheme] Gagal terapkan tema:', e);
  }
}

export const DEFAULT_CONFIG = {
  namaOrganisasi: 'Loket Pelayanan Terpadu',
  alamatOrganisasi: 'Jl. Pelayanan Publik No. 1, Kota Layanan',
  logoUrl: '🏢',
  fotoOrganisasiUrl: '',
  infoPenting: 'Wajib membawa kartu identitas asli (KTP/KK/SIM) dan bukti nomor antrean.',
  statusBuka: true,
  pengumumanDarurat: '',
  mapsUrl: 'https://maps.google.com/?q=-0.5282,102.5853',
  latitude: -0.5282,
  longitude: 102.5853,
  displayQrLink: '',
  displaySoundEnabled: true,
  warnaUtama: '#0d9488',
  warnaAksen: '#0f766e',
  warnaLatar: '#f0fdfa',
  namaAplikasi: 'Antrean Cerdas',
  faviconUrl: '',
};

/**
 * Ambil konfigurasi tersimpan dari localStorage secara aman.
 * Jika belum ada data tersimpan, mengembalikan DEFAULT_CONFIG.
 * Bekerja baik untuk SSR (fallback aman) maupun browser client.
 */
export function getCachedConfig() {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem('pengaturan_organisasi');
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      namaOrganisasi: parsed.namaOrganisasi || parsed.nama_organisasi || DEFAULT_CONFIG.namaOrganisasi,
      alamatOrganisasi: parsed.alamatOrganisasi || parsed.alamat_organisasi || DEFAULT_CONFIG.alamatOrganisasi,
      logoUrl: parsed.logoUrl || parsed.logo_url || DEFAULT_CONFIG.logoUrl,
      fotoOrganisasiUrl: parsed.fotoOrganisasiUrl || parsed.foto_organisasi_url || '',
      infoPenting: parsed.infoPenting || parsed.info_penting || DEFAULT_CONFIG.infoPenting,
      statusBuka: parsed.statusBuka ?? parsed.status_buka ?? true,
      pengumumanDarurat: parsed.pengumumanDarurat || parsed.pengumuman_darurat || '',
      mapsUrl: parsed.mapsUrl || parsed.maps_url || DEFAULT_CONFIG.mapsUrl,
      latitude: parsed.latitude !== undefined && parsed.latitude !== null && !isNaN(Number(parsed.latitude)) ? Number(parsed.latitude) : DEFAULT_CONFIG.latitude,
      longitude: parsed.longitude !== undefined && parsed.longitude !== null && !isNaN(Number(parsed.longitude)) ? Number(parsed.longitude) : DEFAULT_CONFIG.longitude,
      displayQrLink: parsed.displayQrLink || parsed.display_qr_link || '',
      displaySoundEnabled: parsed.displaySoundEnabled ?? parsed.display_sound_enabled ?? true,
      warnaUtama: parsed.warnaUtama || parsed.warna_utama || DEFAULT_CONFIG.warnaUtama,
      warnaAksen: parsed.warnaAksen || parsed.warna_aksen || DEFAULT_CONFIG.warnaAksen,
      warnaLatar: parsed.warnaLatar || parsed.warna_latar || DEFAULT_CONFIG.warnaLatar,
      namaAplikasi: parsed.namaAplikasi || parsed.nama_aplikasi || DEFAULT_CONFIG.namaAplikasi,
      faviconUrl: parsed.faviconUrl || parsed.favicon_url || '',
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Baca warna & identitas dari localStorage dan terapkan segera (tanpa tunggu Supabase).
 * Panggil di awal mount komponen untuk menghindari flash of default content/color.
 */
export function applyBrandThemeFromCache() {
  if (typeof window === 'undefined') return;
  try {
    const cfg = getCachedConfig();
    if (cfg?.warnaUtama) injectBrandTheme(cfg.warnaUtama);
    if (cfg?.faviconUrl) applyFavicon(cfg.faviconUrl);
    if (cfg?.namaAplikasi || cfg?.namaOrganisasi) {
      const appName = cfg.namaAplikasi || 'Antrean Cerdas';
      const orgName = cfg.namaOrganisasi || 'Loket Pelayanan';
      if (document.title.includes('Portal Petugas')) {
        document.title = `${appName} - Panel Petugas Loket (${orgName})`;
      } else if (document.title.includes('Display')) {
        document.title = `${appName} - Layar Display (${orgName})`;
      } else {
        document.title = `${appName} - ${orgName}`;
      }
    }
  } catch { /* ignore */ }
}

/**
 * Terapkan favicon custom ke tag <link> di <head>.
 * @param {string} url - data URL atau URL gambar
 */
export function applyFavicon(url) {
  if (typeof document === 'undefined' || !url) return;
  try {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'shortcut icon';
      document.head.appendChild(link);
    }
    link.href = url;
  } catch { /* ignore */ }
}


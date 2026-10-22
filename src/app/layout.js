import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Antrean Cerdas - Sistem Antrean Digital Universal",
  description: "Sistem Antrean Digital Real-time Multi-Tenant Berbasis AI/ML",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sistem Antrean Universal",
  },
};

export const viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  try {
    var raw = localStorage.getItem('pengaturan_organisasi');
    if (!raw) return;
    var cfg = JSON.parse(raw);
    var hex = cfg.warnaUtama || cfg.warna_utama;
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;

    function hexToHsl(h) {
      var r = parseInt(h.slice(1,3), 16) / 255;
      var g = parseInt(h.slice(3,5), 16) / 255;
      var b = parseInt(h.slice(5,7), 16) / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var l = (max + min) / 2;
      if (max === min) return [0, 0, Math.round(l * 100)];
      var d = max - min;
      var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      var hue;
      switch (max) {
        case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: hue = ((b - r) / d + 2) / 6; break;
        default: hue = ((r - g) / d + 4) / 6;
      }
      return [Math.round(hue * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    function hslToHex(h, s, l) {
      s /= 100; l /= 100;
      var a = s * Math.min(l, 1 - l);
      var f = function(n) {
        var k = (n + h / 30) % 12;
        var c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * c).toString(16).padStart(2, '0');
      };
      return '#' + f(0) + f(8) + f(4);
    }

    var hsl = hexToHsl(hex);
    var h = hsl[0], s = hsl[1], l = hsl[2];
    var p50 = hslToHex(h, Math.max(s - 35, 8), 97);
    var p100 = hslToHex(h, Math.max(s - 25, 12), 93);
    var p200 = hslToHex(h, Math.max(s - 15, 18), 86);
    var p300 = hslToHex(h, Math.max(s - 8, 25), 74);
    var p400 = hslToHex(h, s, 62);
    var p500 = hslToHex(h, s, 54);
    var p600 = hex;
    var p700 = hslToHex(h, Math.min(s + 5, 100), Math.max(l - 9, 18));
    var p800 = hslToHex(h, Math.min(s + 8, 100), Math.max(l - 19, 12));
    var p900 = hslToHex(h, Math.min(s + 10, 100), Math.max(l - 29, 8));
    var p950 = hslToHex(h, Math.min(s + 10, 100), Math.max(l - 38, 5));

    var css = ':root{' +
      '--brand-primary:' + p600 + ';--brand-accent:' + p700 + ';--brand-bg:' + p50 + ';' +
      '--color-teal-50:' + p50 + ';--color-teal-100:' + p100 + ';--color-teal-200:' + p200 + ';' +
      '--color-teal-300:' + p300 + ';--color-teal-400:' + p400 + ';--color-teal-500:' + p500 + ';' +
      '--color-teal-600:' + p600 + ';--color-teal-700:' + p700 + ';--color-teal-800:' + p800 + ';' +
      '--color-teal-900:' + p900 + ';--color-teal-950:' + p950 + ';' +
      '--color-emerald-50:' + p50 + ';--color-emerald-100:' + p100 + ';--color-emerald-200:' + p200 + ';' +
      '--color-emerald-500:' + p500 + ';--color-emerald-600:' + p600 + ';--color-emerald-700:' + p700 + ';--color-emerald-800:' + p800 + ';}' +
      '.bg-teal-50{background-color:' + p50 + '!important}.bg-teal-100{background-color:' + p100 + '!important}.bg-teal-200{background-color:' + p200 + '!important}.bg-teal-500{background-color:' + p500 + '!important}.bg-teal-600{background-color:' + p600 + '!important}.bg-teal-700{background-color:' + p700 + '!important}.bg-teal-800{background-color:' + p800 + '!important}.bg-teal-900{background-color:' + p900 + '!important}' +
      '.text-teal-50{color:' + p50 + '!important}.text-teal-100{color:' + p100 + '!important}.text-teal-200{color:' + p200 + '!important}.text-teal-300{color:' + p300 + '!important}.text-teal-400{color:' + p400 + '!important}.text-teal-500{color:' + p500 + '!important}.text-teal-600{color:' + p600 + '!important}.text-teal-700{color:' + p700 + '!important}.text-teal-800{color:' + p800 + '!important}.text-teal-900{color:' + p900 + '!important}' +
      '.border-teal-100{border-color:' + p100 + '!important}.border-teal-200{border-color:' + p200 + '!important}.border-teal-300{border-color:' + p300 + '!important}.border-teal-400{border-color:' + p400 + '!important}.border-teal-500{border-color:' + p500 + '!important}.border-teal-600{border-color:' + p600 + '!important}.border-teal-700{border-color:' + p700 + '!important}.border-teal-800{border-color:' + p800 + '!important}' +
      '.ring-teal-500{--tw-ring-color:' + p500 + '!important}.divide-teal-200> * + *{border-color:' + p200 + '!important}' +
      '.bg-emerald-50{background-color:' + p50 + '!important}.bg-emerald-100{background-color:' + p100 + '!important}.bg-emerald-500{background-color:' + p500 + '!important}.bg-emerald-600{background-color:' + p600 + '!important}' +
      '.text-emerald-500{color:' + p500 + '!important}.text-emerald-600{color:' + p600 + '!important}.text-emerald-700{color:' + p700 + '!important}.text-emerald-800{color:' + p800 + '!important}' +
      '.border-emerald-100{border-color:' + p100 + '!important}.border-emerald-200{border-color:' + p200 + '!important}' +
      '.hover\\\\:bg-teal-50:hover{background-color:' + p50 + '!important}.hover\\\\:bg-teal-100:hover{background-color:' + p100 + '!important}.hover\\\\:bg-teal-700:hover{background-color:' + p700 + '!important}' +
      '.hover\\\\:text-teal-700:hover{color:' + p700 + '!important}.hover\\\\:text-teal-800:hover{color:' + p800 + '!important}' +
      '.hover\\\\:border-teal-200:hover{border-color:' + p200 + '!important}.hover\\\\:border-teal-300:hover{border-color:' + p300 + '!important}' +
      '.focus\\\\:ring-teal-500:focus{--tw-ring-color:' + p500 + '!important}' +
      '.from-teal-400{--tw-gradient-from:' + p400 + '!important}.via-teal-400{--tw-gradient-via:' + p400 + '!important}.to-teal-500{--tw-gradient-to:' + p500 + '!important}' +
      '.from-teal-900{--tw-gradient-from:' + p900 + '!important}.from-teal-950{--tw-gradient-from:' + p950 + '!important}.via-teal-950{--tw-gradient-via:' + p950 + '!important}.to-teal-950{--tw-gradient-to:' + p950 + '!important}';

    var style = document.createElement('style');
    style.id = 'brand-theme-override';
    style.textContent = css;
    document.head.appendChild(style);

    var fav = cfg.faviconUrl || cfg.favicon_url;
    if (fav) {
      var link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.head.appendChild(link);
      }
      link.href = fav;
    }

    var appTitle = cfg.namaAplikasi || cfg.nama_aplikasi;
    var orgTitle = cfg.namaOrganisasi || cfg.nama_organisasi;
    if (appTitle || orgTitle) {
      document.title = (appTitle || 'Antrean Cerdas') + (orgTitle ? (' - ' + orgTitle) : '');
    }
  } catch(e) {}
})();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-800">{children}</body>
    </html>
  );
}

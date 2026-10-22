"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock, Users, Volume2, VolumeX,
  Wifi, WifiOff, CheckCircle2,
  Megaphone, ChevronRight,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { playNotificationChime, unlockAudio } from '@/lib/pwa';
import { ucapkanSuaraManusia, susunKalimatPanggilan } from '@/lib/tts';
import { injectBrandTheme, applyBrandThemeFromCache, applyFavicon, getCachedConfig } from '@/lib/brandTheme';

export default function DisplayPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [config, setConfig] = useState(getCachedConfig);
  const [sedangDipanggil, setSedangDipanggil] = useState(null);
  const [daftarMenunggu, setDaftarMenunggu] = useState([]);
  const [totalHariIni, setTotalHariIni] = useState(0);
  const [totalSelesai, setTotalSelesai] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [jam, setJam] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [flashCall, setFlashCall] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [patientOrigin, setPatientOrigin] = useState('');

  const lastCalledNomorRef = useRef(null);
  const lastCallTagRef = useRef('');
  const flashIntervalRef = useRef(null);

  // ----- Mount & audio -----
  useEffect(() => {
    setIsMounted(true);
    applyBrandThemeFromCache();
    unlockAudio();
    document.documentElement.classList.remove('dark');
    if (typeof window !== 'undefined') setPatientOrigin(window.location.origin + '/');
  }, []);

  // ----- QR link handling -----
  useEffect(() => {
    setQrUrl(config.displayQrLink?.trim() || patientOrigin || '/');
  }, [config.displayQrLink, patientOrigin, isMounted]);

  // ----- Clock -----
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setJam(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setTanggal(now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ----- Load data (config + antrean) -----
  const loadData = useCallback(async () => {
    if (!isMounted) return;

    // Helper untuk memproses daftar antrean dan membunyikan panggilan
    const prosesDaftarAntrean = (antreanData) => {
      if (!Array.isArray(antreanData)) return;
      const memanggil = antreanData.find(q => q.status === 'MEMANGGIL') || null;
      const menunggu = antreanData.filter(q => q.status === 'MENUNGGU' || q.status === 'TERLAMBAT');
      const selesai = antreanData.filter(q => q.status === 'SELESAI');

      if (memanggil) {
        const callTag = `${memanggil.nomor}_${memanggil.panggilan_ke || 1}_${memanggil.last_called_at || ''}`;
        if (callTag !== lastCallTagRef.current) {
          lastCallTagRef.current = callTag;
          lastCalledNomorRef.current = memanggil.nomor;

          setConfig(prev => {
            if (prev.displaySoundEnabled) {
              playNotificationChime();
              const kalimat = susunKalimatPanggilan(memanggil.nomor, memanggil.nama, memanggil.panggilan_ke || 1);
              ucapkanSuaraManusia(kalimat, { delayMs: 550 }).catch(() => {});
            }
            return prev;
          });

          let count = 0;
          clearInterval(flashIntervalRef.current);
          setFlashCall(true);
          flashIntervalRef.current = setInterval(() => {
            count++;
            setFlashCall(f => !f);
            if (count >= 6) {
              clearInterval(flashIntervalRef.current);
              setFlashCall(false);
            }
          }, 400);
        }
      }

      setSedangDipanggil(memanggil);
      setDaftarMenunggu(menunggu);
      setTotalHariIni(antreanData.length);
      setTotalSelesai(selesai.length);
    };

    const loadFromLocal = () => {
      try {
        const raw = localStorage.getItem('antrean_local_db');
        if (raw) {
          const all = JSON.parse(raw).filter(q => !q.is_archived);
          prosesDaftarAntrean(all);
        }
        const cached = getCachedConfig();
        setConfig(prev => ({ ...prev, ...cached }));
        if (cached.warnaUtama) {
          injectBrandTheme(cached.warnaUtama);
        }
        if (cached.faviconUrl) {
          applyFavicon(cached.faviconUrl);
        }
      } catch { /* ignore */ }
    };

    // Muat seketika dari cache lokal sebelum request jaringan
    loadFromLocal();

    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      setIsOnline(false);
      return;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: cfgData } = await supabase
          .from('pengaturan')
          .select('*')
          .eq('id', 'pengaturan_organisasi')
          .maybeSingle();
        if (cfgData) {
          if (cfgData.warna_utama) {
            injectBrandTheme(cfgData.warna_utama);
          }
          if (cfgData.favicon_url) {
            applyFavicon(cfgData.favicon_url);
          }

          setConfig(prev => ({
            ...prev,
            namaOrganisasi: cfgData.nama_organisasi || prev.namaOrganisasi,
            alamatOrganisasi: cfgData.alamat_organisasi || prev.alamatOrganisasi,
            logoUrl: cfgData.logo_url || '🏢',
            fotoOrganisasiUrl: cfgData.foto_organisasi_url || '',
            statusBuka: cfgData.status_buka ?? true,
            pengumumanDarurat: cfgData.pengumuman_darurat || '',
            displayQrLink: cfgData.display_qr_link || '',
            displaySoundEnabled: cfgData.display_sound_enabled ?? true,
            warnaUtama: cfgData.warna_utama || prev.warnaUtama,
            warnaAksen: cfgData.warna_aksen || prev.warnaAksen,
            warnaLatar: cfgData.warna_latar || prev.warnaLatar,
            faviconUrl: cfgData.favicon_url || prev.faviconUrl,
          }));

          try {
            localStorage.setItem('pengaturan_organisasi', JSON.stringify({
              ...cfgData,
              warnaUtama: cfgData.warna_utama,
              faviconUrl: cfgData.favicon_url,
            }));
          } catch { /* ignore */ }
        }
        const { data: antreanData, error: antreanErr } = await supabase
          .from('antrean').select('*').eq('is_archived', false)
          .order('urutan', { ascending: true }).order('created_at', { ascending: true });

        if (antreanErr) throw antreanErr;

        if (antreanData) {
          prosesDaftarAntrean(antreanData);
          try {
            localStorage.setItem('antrean_local_db', JSON.stringify(antreanData));
          } catch { /* ignore */ }
        }
        setIsOnline(true);
      } catch {
        setIsOnline(false);
        loadFromLocal();
      }
    } else {
      loadFromLocal();
      setIsOnline(true);
    }
  }, [isMounted]);

  // ----- Realtime Supabase, BroadcastChannel & Polling -----
  useEffect(() => {
    if (!isMounted) return;
    loadData();

    // BroadcastChannel: Selalu aktif untuk sinkronisasi instan antar-tab/layar offline maupun online
    let bc = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      bc = new BroadcastChannel('antrean_sync_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'UPDATE_ALL' || event.data?.type === 'PANGGIL') {
          loadData();
        } else if (event.data?.type === 'UPDATE_CONFIG') {
          const d = event.data?.data;
          if (d) {
            if (d.warna_utama || d.warnaUtama) {
              injectBrandTheme(d.warna_utama || d.warnaUtama);
            }
            if (d.favicon_url || d.faviconUrl) {
              applyFavicon(d.favicon_url || d.faviconUrl);
            }
            setConfig(prev => ({
              ...prev,
              namaOrganisasi: d.nama_organisasi || d.namaOrganisasi || prev.namaOrganisasi,
              alamatOrganisasi: d.alamat_organisasi || d.alamatOrganisasi || prev.alamatOrganisasi,
              logoUrl: d.logo_url || d.logoUrl || prev.logoUrl,
              fotoOrganisasiUrl: d.foto_organisasi_url ?? d.fotoOrganisasiUrl ?? prev.fotoOrganisasiUrl,
              statusBuka: d.status_buka ?? d.statusBuka ?? prev.statusBuka,
              pengumumanDarurat: d.pengumuman_darurat ?? d.pengumumanDarurat ?? prev.pengumumanDarurat,
              displayQrLink: d.display_qr_link ?? d.displayQrLink ?? prev.displayQrLink,
              displaySoundEnabled: d.display_sound_enabled ?? d.displaySoundEnabled ?? prev.displaySoundEnabled,
              warnaUtama: d.warna_utama || d.warnaUtama || prev.warnaUtama,
              faviconUrl: d.favicon_url || d.faviconUrl || prev.faviconUrl,
            }));
          }
          loadData();
        }
      };
    }

    let ch = null;
    if (isSupabaseConfigured && supabase) {
      ch = supabase.channel('display_rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'antrean' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan' }, loadData)
        .subscribe();
    }

    const handleOnline = () => {
      setIsOnline(true);
      loadData();
    };
    const handleOffline = () => {
      setIsOnline(false);
      loadData();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const poll = setInterval(loadData, 5000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (ch) supabase.removeChannel(ch);
      if (bc) bc.close();
      clearInterval(poll);
      clearInterval(flashIntervalRef.current);
    };
  }, [isMounted, loadData]);

  if (!isMounted) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100/70 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-teal-700 font-bold text-lg">Memuat Layar Display…</p>
        </div>
      </main>
    );
  }

  const menunggutampil = daftarMenunggu.slice(0, 10);
  const qrColor = (config.warnaUtama || '#0d9488').replace('#', '');
  const qrSrc = qrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}&margin=8&color=${qrColor}&bgcolor=ffffff&format=svg`
    : '';

  return (
    <main className="h-screen w-screen overflow-hidden font-sans bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100/70 text-slate-800 select-none flex flex-col">

      {/* Latar Foto Organisasi / Instansi (Sinkron dengan App & Admin) */}
      {config.fotoOrganisasiUrl && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div
            className="absolute -inset-20 bg-cover bg-center opacity-60 animate-bg-load"
            style={{ backgroundImage: `url("${config.fotoOrganisasiUrl}")` }}
          />
          <div className="absolute inset-0 bg-white/75 backdrop-blur-[1.5px]" />
        </div>
      )}

      <div className="relative z-10 flex flex-col flex-1 p-3 sm:p-4 lg:p-6 gap-3 sm:gap-4 min-h-0">

        {/* ── HEADER SINKRON ADMIN & APP ── */}
        <header className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 flex items-center justify-between gap-4 shrink-0">
          {/* Logo & Identitas */}
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
            <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center text-2xl sm:text-3xl font-black shadow-xs shrink-0 overflow-hidden">
              {config.logoUrl && (config.logoUrl.startsWith('http') || config.logoUrl.startsWith('data:')) ? (
                <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <span>{config.logoUrl || '🏢'}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
                <span className="bg-teal-100 text-teal-800 text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                  Layar Display Loket (TV)
                </span>
                <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                  config.statusBuka ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${config.statusBuka ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {config.statusBuka ? 'Pendaftaran Buka' : 'Pendaftaran Tutup'}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                  isOnline ? 'bg-teal-50 text-teal-700 border border-teal-200/80' : 'bg-slate-200 text-slate-600'
                }`}>
                  {isOnline ? <Wifi className="w-3 h-3 text-teal-600" /> : <WifiOff className="w-3 h-3" />}
                  {isOnline ? 'Live Online' : 'Offline'}
                </span>
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 whitespace-nowrap">
                  {config.displaySoundEnabled ? <Volume2 className="w-3 h-3 text-teal-600" /> : <VolumeX className="w-3 h-3 text-slate-400" />}
                  {config.displaySoundEnabled ? 'Suara Aktif' : 'Senyap'}
                </span>
              </div>
              <h1 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 truncate leading-tight">
                {config.namaOrganisasi}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium truncate hidden sm:block">
                {config.alamatOrganisasi}
              </p>
            </div>
          </div>

          {/* SISI KANAN HEADER: WAKTU REALTIME SINKRON ADMIN */}
          <div className="hidden sm:flex items-center gap-3.5 shrink-0 bg-slate-50 border border-slate-200/80 px-4 py-3 rounded-2xl shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100/60">
              <Clock className="w-5 h-5 animate-pulse text-teal-600" />
            </div>
            <div className="text-right sm:text-left">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tanggal || 'Hari Ini'}</p>
              <p className="text-sm sm:text-lg font-black font-mono text-teal-700 tracking-tight leading-tight">{jam}</p>
            </div>
          </div>
        </header>

        {/* BANNER DARURAT ELEGAN SINKRON APP & ADMIN */}
        {config.pengumumanDarurat && (
          <aside className="bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white rounded-2xl sm:rounded-3xl px-4 py-2.5 sm:py-3 flex items-center gap-3 shrink-0 shadow-md border border-red-500/40">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/30 shadow-xs">
              <Megaphone className="w-4 h-4 md:w-5 md:h-5 text-amber-300 animate-pulse shrink-0" />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2.5 md:gap-3 overflow-hidden">
              <span className="px-2.5 py-0.5 rounded-full bg-white text-rose-700 font-extrabold text-[10px] md:text-xs tracking-wider uppercase shrink-0 shadow-xs flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
                PENGUMUMAN
              </span>
              <p className="text-xs sm:text-sm md:text-base font-semibold text-white leading-snug break-words min-w-0 line-clamp-2">
                {config.pengumumanDarurat}
              </p>
            </div>
          </aside>
        )}

        {/* ── BODY UTAMA (BENTO GRID 3-KOLOM DESKTOP) ── */}
        <div className="flex-1 flex flex-col md:grid md:grid-cols-12 gap-3 sm:gap-4 min-h-0 overflow-y-auto md:overflow-hidden">

          {/* ── KIRI: Statistik + Antrean Menunggu (3 Kolom) ── */}
          <div className="md:col-span-3 flex flex-col gap-3 sm:gap-4 min-h-0 shrink-0 md:shrink">

            {/* Statistik Hari Ini — Bergaya Mini Cards Serasi App */}
            <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 shrink-0">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                <p className="text-[10px] sm:text-xs font-black text-slate-700 uppercase tracking-wider">Statistik Hari Ini</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50/80 rounded-2xl p-2.5 border border-slate-200/80 text-center flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Total</p>
                  <p className="text-xl sm:text-2xl font-black text-teal-700 leading-none my-1">{totalHariIni}</p>
                  <p className="text-[9px] text-teal-600 font-bold">Tiket</p>
                </div>
                <div className="bg-slate-50/80 rounded-2xl p-2.5 border border-slate-200/80 text-center flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Tunggu</p>
                  <p className="text-xl sm:text-2xl font-black text-amber-600 leading-none my-1">{daftarMenunggu.length}</p>
                  <p className="text-[9px] text-amber-600 font-bold">Orang</p>
                </div>
                <div className="bg-slate-50/80 rounded-2xl p-2.5 border border-slate-200/80 text-center flex flex-col justify-between">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Selesai</p>
                  <p className="text-xl sm:text-2xl font-black text-emerald-600 leading-none my-1">{totalSelesai}</p>
                  <p className="text-[9px] text-emerald-600 font-bold">Terlayani</p>
                </div>
              </div>
            </div>

            {/* Antrean Menunggu — Flex-1 di desktop dengan scrollbar halus */}
            <div className="hidden md:flex bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-5 flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Antrean Menunggu</span>
                </div>
                <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                  {daftarMenunggu.length} Orang
                </span>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 scrollbar-thin">
                {menunggutampil.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-6">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                    <p className="text-xs text-slate-400 font-semibold leading-relaxed">Tidak ada antrean<br />menunggu saat ini</p>
                  </div>
                ) : (
                  menunggutampil.map((item, idx) => (
                    <div key={item.id} className={`flex items-center gap-2.5 p-2.5 rounded-2xl border transition-all ${
                      item.status === 'TERLAMBAT'
                        ? 'bg-amber-50/70 border-amber-200/80 shadow-2xs'
                        : 'bg-slate-50/70 border-slate-200/70 hover:bg-white shadow-2xs'
                    }`}>
                      <span className="text-xs text-slate-400 w-4 text-right shrink-0 font-bold">{idx + 1}</span>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs font-mono shrink-0 border ${
                        item.status === 'TERLAMBAT'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-teal-50 text-teal-700 border-teal-200'
                      }`}>
                        {item.nomor}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate leading-tight">{item.nama}</p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {item.created_at ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '–'}
                        </p>
                      </div>
                      {item.status === 'TERLAMBAT' && (
                        <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wide">TLB</span>
                      )}
                    </div>
                  ))
                )}
                {daftarMenunggu.length > 10 && (
                  <p className="text-center text-[11px] text-slate-400 py-1 font-semibold">+{daftarMenunggu.length - 10} lainnya dalam antrean</p>
                )}
              </div>
            </div>
          </div>

          {/* ── TENGAH: Hero Nomor Dipanggil (6 Kolom) ── */}
          <div className="md:col-span-6 min-h-0 flex-1 md:flex-auto flex">
            <div className={`w-full bg-white/95 backdrop-blur-md rounded-3xl border-2 shadow-lg flex flex-col items-center justify-center text-center p-5 sm:p-6 md:p-8 relative overflow-hidden transition-all duration-300 ${
              flashCall ? 'border-teal-400 ring-4 ring-teal-400/20' : 'border-slate-200/90'
            }`}>
              {/* Garis aksen atas — identik dengan Hero App & Admin */}
              <div className={`absolute top-0 inset-x-0 h-2 ${
                sedangDipanggil ? 'bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500' : 'bg-slate-200'
              }`} />

              {/* Label */}
              <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-slate-400 mb-4 sm:mb-6">
                ◆ Nomor Sedang Dipanggil ◆
              </p>

              {sedangDipanggil ? (
                <>
                  {/* Kotak nomor — responsive sizing dengan bayangan megah */}
                  <div className={`relative mb-4 sm:mb-6 transition-all duration-300 ${flashCall ? 'scale-105' : 'scale-100'}`}>
                    {flashCall && <span className="absolute -inset-3 rounded-[2.5rem] border-4 border-teal-400 animate-ping opacity-40" />}
                    <div className={`w-32 h-32 sm:w-44 sm:h-44 md:w-52 md:h-52 lg:w-60 lg:h-60 xl:w-72 xl:h-72 rounded-3xl xl:rounded-[2.5rem] flex items-center justify-center border-4 shadow-xl md:shadow-2xl transition-all duration-300 ${
                      flashCall
                        ? 'bg-teal-600 border-teal-300 shadow-teal-400/40'
                        : 'bg-teal-50/80 border-teal-200 shadow-teal-100/50'
                    }`}>
                      <span className={`font-black font-mono leading-none tracking-tight ${
                        sedangDipanggil.nomor?.length > 3
                          ? 'text-4xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl'
                          : 'text-5xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-[10rem]'
                      } ${flashCall ? 'text-white' : 'text-teal-700'}`}>
                        {sedangDipanggil.nomor}
                      </span>
                    </div>
                  </div>

                  {/* Nama pengunjung */}
                  <p className="text-xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 mb-3 tracking-tight leading-tight max-w-full truncate px-2">
                    {sedangDipanggil.nama}
                  </p>

                  {/* Instruksi Loket */}
                  <div className="flex items-center gap-2 text-sm sm:text-lg md:text-xl text-slate-700 font-semibold flex-wrap justify-center mt-1">
                    <span>Silakan menuju ke</span>
                    <span className="font-black text-teal-900 bg-teal-100 border border-teal-200/80 px-4 py-1 rounded-2xl inline-flex items-center gap-1.5 shadow-2xs">
                      Loket Pelayanan
                      <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-teal-700" />
                    </span>
                  </div>

                  {sedangDipanggil.panggilan_ke > 1 && (
                    <div className="mt-3 sm:mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm font-bold shadow-2xs animate-pulse">
                      <Megaphone className="w-4 h-4 text-amber-600" />
                      Panggilan ke-{sedangDipanggil.panggilan_ke} — Harap segera ke loket
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 sm:gap-6">
                  <div className="w-32 h-32 sm:w-44 sm:h-44 md:w-52 md:h-52 lg:w-60 lg:h-60 rounded-3xl bg-slate-100 border-4 border-slate-200/80 flex items-center justify-center shadow-inner">
                    <span className="text-5xl sm:text-7xl md:text-8xl opacity-25">🔔</span>
                  </div>
                  <div>
                    <p className="text-lg sm:text-2xl md:text-3xl font-black text-slate-500">
                      {config.statusBuka ? 'Belum Ada Panggilan Aktif' : 'Loket Pelayanan Tutup'}
                    </p>
                    <p className="text-xs sm:text-sm md:text-base text-slate-400 mt-1.5 font-medium">
                      {config.statusBuka ? 'Pindai QR Code di samping untuk mengambil nomor antrean' : 'Pelayanan pendaftaran antrean telah berakhir untuk hari ini'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── KANAN: QR Code Ambil Antrean (3 Kolom) ── */}
          <div className="md:col-span-3 min-h-0 flex flex-col shrink-0 md:shrink">
            <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:h-full overflow-hidden">

              {/* Header QR Berkelas */}
              <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 rounded-t-3xl p-4 sm:p-5 text-center text-white shrink-0 shadow-xs">
                <p className="text-base sm:text-lg lg:text-xl font-black leading-tight uppercase tracking-wider">
                  Ambil Antrean
                </p>
                <p className="text-[11px] text-teal-200 mt-1 font-medium">
                  Scan QR via kamera smartphone
                </p>
              </div>

              {/* Box QR Code */}
              <div className="flex-1 flex items-center justify-center p-4 min-h-0">
                {qrSrc ? (
                  <div className="p-2 sm:p-3 bg-white rounded-2xl border-2 border-teal-100 shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrSrc}
                      alt="QR Code Antrean"
                      className="w-auto h-auto max-w-[130px] max-h-[130px] sm:max-w-[170px] sm:max-h-[170px] md:max-w-full md:max-h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl bg-slate-100 border-4 border-slate-200 flex items-center justify-center">
                    <span className="text-4xl md:text-6xl opacity-20">📱</span>
                  </div>
                )}
              </div>

              {/* URL Website */}
              <div className="px-4 pb-4 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-px bg-slate-200" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">atau akses link</p>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 text-center shadow-2xs">
                  <p className="text-[11px] sm:text-xs font-black font-mono text-teal-800 break-all leading-snug">
                    {qrUrl || '–'}
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}

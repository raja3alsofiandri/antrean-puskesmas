'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock, Users, Volume2, VolumeX,
  Wifi, WifiOff, CheckCircle2, AlertTriangle,
  Megaphone, ChevronRight,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { playNotificationChime, unlockAudio } from '@/lib/pwa';

export default function DisplayPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [config, setConfig] = useState({
    namaPuskesmas: 'Puskesmas Kuala Cenaku',
    alamatPuskesmas: 'Jl. Kesehatan No. 1, Kuala Cenaku, Kab. Indragiri Hulu, Riau',
    logoUrl: '🏥',
    fotoPuskesmasUrl: '',
    statusBuka: true,
    pengumumanDarurat: '',
    displayQrLink: '',
    displaySoundEnabled: true,
  });
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
  const flashIntervalRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
    unlockAudio();
    document.documentElement.classList.remove('dark');
    if (typeof window !== 'undefined') setPatientOrigin(window.location.origin + '/');
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    setQrUrl(config.displayQrLink?.trim() || patientOrigin || '/');
  }, [config.displayQrLink, patientOrigin, isMounted]);

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

  const loadData = useCallback(async () => {
    if (!isMounted) return;
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: cfgData } = await supabase.from('pengaturan').select('*').eq('id', 'puskesmas_config').maybeSingle();
        if (cfgData) {
          setConfig(prev => ({
            ...prev,
            namaPuskesmas: cfgData.nama_puskesmas || prev.namaPuskesmas,
            alamatPuskesmas: cfgData.alamat_puskesmas || prev.alamatPuskesmas,
            logoUrl: cfgData.logo_url || '🏥',
            fotoPuskesmasUrl: cfgData.foto_puskesmas_url || '',
            statusBuka: cfgData.status_buka ?? true,
            pengumumanDarurat: cfgData.pengumuman_darurat || '',
            displayQrLink: cfgData.display_qr_link || '',
            displaySoundEnabled: cfgData.display_sound_enabled ?? true,
          }));
        }
        const { data: antreanData } = await supabase
          .from('antrean').select('*').eq('is_archived', false)
          .order('urutan', { ascending: true }).order('created_at', { ascending: true });
        if (antreanData) {
          const memanggil = antreanData.find(q => q.status === 'MEMANGGIL') || null;
          const menunggu = antreanData.filter(q => q.status === 'MENUNGGU' || q.status === 'TERLAMBAT');
          const selesai = antreanData.filter(q => q.status === 'SELESAI');
          if (memanggil && memanggil.nomor !== lastCalledNomorRef.current) {
            lastCalledNomorRef.current = memanggil.nomor;
            setConfig(prev => { if (prev.displaySoundEnabled) playNotificationChime(); return prev; });
            let count = 0;
            clearInterval(flashIntervalRef.current);
            setFlashCall(true);
            flashIntervalRef.current = setInterval(() => {
              count++; setFlashCall(f => !f);
              if (count >= 6) { clearInterval(flashIntervalRef.current); setFlashCall(false); }
            }, 400);
          }
          setSedangDipanggil(memanggil);
          setDaftarMenunggu(menunggu);
          setTotalHariIni(antreanData.length);
          setTotalSelesai(selesai.length);
        }
        setIsOnline(true);
      } catch { setIsOnline(false); }
    } else {
      try {
        const raw = localStorage.getItem('antrean_local_db');
        if (raw) {
          const all = JSON.parse(raw).filter(q => !q.is_archived);
          const memanggil = all.find(q => q.status === 'MEMANGGIL') || null;
          setSedangDipanggil(memanggil);
          setDaftarMenunggu(all.filter(q => q.status === 'MENUNGGU' || q.status === 'TERLAMBAT'));
          setTotalHariIni(all.length);
          setTotalSelesai(all.filter(q => q.status === 'SELESAI').length);
        }
        const rawCfg = localStorage.getItem('puskesmas_config');
        if (rawCfg) setConfig(prev => ({ ...prev, ...JSON.parse(rawCfg) }));
        setIsOnline(true);
      } catch { setIsOnline(false); }
    }
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    loadData();
    if (isSupabaseConfigured && supabase) {
      const ch = supabase.channel('display_rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'antrean' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan' }, loadData)
        .subscribe();
      const poll = setInterval(loadData, 10000);
      return () => { supabase.removeChannel(ch); clearInterval(poll); clearInterval(flashIntervalRef.current); };
    }
    const poll = setInterval(loadData, 5000);
    return () => { clearInterval(poll); clearInterval(flashIntervalRef.current); };
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
  const qrSrc = qrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}&margin=8&color=0f766e&bgcolor=ffffff&format=svg`
    : '';

  return (
    <main className="h-screen w-screen overflow-hidden font-sans relative bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100/70 text-slate-800 select-none flex flex-col">

      {/* Latar Foto Puskesmas */}
      {config.fotoPuskesmasUrl && (
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url("${config.fotoPuskesmasUrl}")` }} />
          <div className="absolute inset-0 bg-white/78 backdrop-blur-[1px]" />
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full p-3 gap-3">

        {/* ══════════════════════════════════
            HEADER
        ══════════════════════════════════ */}
        <header className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm px-5 py-3 flex items-center gap-4 shrink-0">
          {/* Logo */}
          <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-3xl shrink-0 overflow-hidden">
            {config.logoUrl && (config.logoUrl.startsWith('http') || config.logoUrl.startsWith('data:'))
              ? <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              : <span>{config.logoUrl || '🏥'}</span>}
          </div>

          {/* Nama + Alamat */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                config.statusBuka ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${config.statusBuka ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                {config.statusBuka ? 'Loket Buka' : 'Loket Tutup'}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                isOnline ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
              }`}>
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? 'Realtime' : 'Offline'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {config.displaySoundEnabled ? <Volume2 className="w-3 h-3 text-teal-500" /> : <VolumeX className="w-3 h-3" />}
                {config.displaySoundEnabled ? 'Suara Aktif' : 'Senyap'}
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-900 truncate leading-tight">{config.namaPuskesmas}</h1>
            <p className="text-sm text-slate-500 font-medium truncate">{config.alamatPuskesmas}</p>
          </div>

          {/* Jam */}
          <div className="shrink-0 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-black font-mono text-slate-900 tracking-wider leading-none">{jam || '--:--:--'}</p>
              <p className="text-xs text-slate-400 font-medium capitalize mt-0.5">{tanggal}</p>
            </div>
          </div>
        </header>

        {/* BANNER DARURAT */}
        {config.pengumumanDarurat && (
          <aside className="bg-red-600 text-white rounded-2xl px-5 py-3 flex items-center gap-3 shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-200 shrink-0 animate-pulse" />
            <p className="text-base font-bold flex-1">
              <span className="text-amber-200 font-extrabold mr-2 uppercase tracking-wider text-sm">PENGUMUMAN:</span>
              {config.pengumumanDarurat}
            </p>
          </aside>
        )}

        {/* ══════════════════════════════════
            BODY — 3 KOLOM FULL HEIGHT
        ══════════════════════════════════ */}
        <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">

          {/* ── KIRI: Statistik + Antrean Menunggu ── */}
          <div className="col-span-3 flex flex-col gap-3 min-h-0">

            {/* Statistik */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm p-4 shrink-0">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Statistik Hari Ini</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total', value: totalHariIni, icon: Users, bg: 'bg-teal-50 border-teal-100 text-teal-600', num: 'text-teal-700' },
                  { label: 'Menunggu', value: daftarMenunggu.length, icon: Clock, bg: 'bg-amber-50 border-amber-100 text-amber-600', num: 'text-amber-700' },
                  { label: 'Selesai', value: totalSelesai, icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-100 text-emerald-600', num: 'text-emerald-700' },
                ].map(({ label, value, icon: Icon, bg, num }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-center">
                    <div className={`w-9 h-9 rounded-xl ${bg} border flex items-center justify-center shrink-0`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className={`text-3xl font-black leading-none ${num}`}>{value}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide leading-tight">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Antrean Menunggu — flex-1 isi sisa tinggi */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-black text-slate-700 uppercase tracking-wider">Antrean Menunggu</span>
                </div>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                  {daftarMenunggu.length} orang
                </span>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-0.5">
                {menunggutampil.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-6">
                    <CheckCircle2 className="w-14 h-14 text-emerald-300" />
                    <p className="text-base text-slate-400 font-semibold leading-snug">Tidak ada antrean<br />menunggu saat ini</p>
                  </div>
                ) : (
                  menunggutampil.map((item, idx) => (
                    <div key={item.id} className={`flex items-center gap-3 px-3 py-3 rounded-xl border ${
                      item.status === 'TERLAMBAT'
                        ? 'bg-amber-50 border-amber-200/80'
                        : 'bg-slate-50 border-slate-200/60'
                    }`}>
                      <span className="text-sm text-slate-400 w-5 text-right shrink-0 font-bold">{idx + 1}</span>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shrink-0 border ${
                        item.status === 'TERLAMBAT'
                          ? 'bg-amber-100 text-amber-700 border-amber-200'
                          : 'bg-teal-50 text-teal-700 border-teal-100'
                      }`}>
                        {item.nomor}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-slate-800 truncate leading-tight">{item.nama}</p>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                            : '–'}
                        </p>
                      </div>
                      {item.status === 'TERLAMBAT' && (
                        <span className="text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0 uppercase">
                          TLB
                        </span>
                      )}
                    </div>
                  ))
                )}
                {daftarMenunggu.length > 10 && (
                  <p className="text-center text-sm text-slate-400 py-2 font-medium">
                    +{daftarMenunggu.length - 10} antrean lainnya…
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── TENGAH: Hero Nomor Dipanggil ── */}
          <div className="col-span-6 min-h-0">
            <div className={`bg-white/95 backdrop-blur-md rounded-2xl border shadow-sm h-full flex flex-col items-center justify-center text-center px-6 relative overflow-hidden transition-all ${
              flashCall ? 'border-teal-400 shadow-teal-200/60 shadow-xl' : 'border-slate-200/80'
            }`}>
              {/* Garis aksen atas */}
              <div className={`absolute top-0 inset-x-0 h-2 ${
                sedangDipanggil
                  ? 'bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500'
                  : 'bg-slate-200'
              }`} />

              {/* Label */}
              <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 mb-6">
                ◆ Nomor Sedang Dipanggil ◆
              </p>

              {sedangDipanggil ? (
                <>
                  {/* Kotak nomor BESAR */}
                  <div className={`relative mb-7 transition-all duration-300 ${flashCall ? 'scale-105' : 'scale-100'}`}>
                    {flashCall && (
                      <span className="absolute -inset-3 rounded-[2.5rem] border-4 border-teal-400 animate-ping opacity-40" />
                    )}
                    <div className={`w-64 h-64 xl:w-80 xl:h-80 rounded-[2.5rem] flex items-center justify-center border-4 shadow-2xl transition-all duration-300 ${
                      flashCall
                        ? 'bg-teal-500 border-teal-300 shadow-teal-300/50'
                        : 'bg-teal-50 border-teal-200 shadow-teal-100/40'
                    }`}>
                      <span className={`font-black leading-none tracking-tight ${
                        (sedangDipanggil.nomor?.length || 0) > 3 ? 'text-8xl xl:text-9xl' : 'text-9xl xl:text-[10rem]'
                      } ${flashCall ? 'text-white' : 'text-teal-700'}`}>
                        {sedangDipanggil.nomor}
                      </span>
                    </div>
                  </div>

                  {/* Nama pasien */}
                  <p className="text-4xl xl:text-5xl font-black text-slate-900 mb-4 leading-tight max-w-xl truncate">
                    {sedangDipanggil.nama}
                  </p>

                  {/* Instruksi */}
                  <div className="flex items-center gap-3 text-xl text-slate-600 font-semibold flex-wrap justify-center">
                    <span>Silakan menuju ke</span>
                    <span className="font-black text-teal-800 bg-teal-100 border border-teal-200 px-4 py-1 rounded-full inline-flex items-center gap-1.5 text-xl">
                      Loket Pemeriksaan
                      <ChevronRight className="w-5 h-5" />
                    </span>
                  </div>

                  {sedangDipanggil.panggilan_ke > 1 && (
                    <div className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-base font-bold">
                      <Megaphone className="w-4 h-4" />
                      Panggilan ke-{sedangDipanggil.panggilan_ke} — Harap segera menuju loket
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-6">
                  <div className="w-64 h-64 xl:w-72 xl:h-72 rounded-[2.5rem] bg-slate-100 border-4 border-slate-200 flex items-center justify-center">
                    <span className="text-8xl xl:text-9xl opacity-25">🔔</span>
                  </div>
                  <div>
                    <p className="text-3xl xl:text-4xl font-black text-slate-400">
                      {config.statusBuka ? 'Belum Ada Panggilan' : 'Loket Sedang Tutup'}
                    </p>
                    <p className="text-lg text-slate-400 mt-2">
                      {config.statusBuka ? 'Scan QR untuk ambil nomor antrean' : 'Loket pendaftaran tidak beroperasi saat ini'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── KANAN: QR Code ── */}
          <div className="col-span-3 min-h-0">
            <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm h-full flex flex-col">

              {/* ── SCAN QR UNTUK ANTREAN ── */}
              <div className="bg-teal-600 rounded-t-2xl px-5 py-5 text-center shrink-0">
                <p className="text-2xl xl:text-3xl font-black text-white leading-tight uppercase tracking-wide">
                  Scan QR untuk<br />Ambil Antrean
                </p>
              </div>

              {/* QR Code — isi ruang tersisa */}
              <div className="flex-1 flex items-center justify-center p-5 min-h-0">
                {qrSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrSrc}
                    alt="QR Code Antrean"
                    className="w-full h-full object-contain rounded-xl border-4 border-teal-100 shadow-md bg-white"
                    style={{ maxWidth: 300, maxHeight: 300 }}
                  />
                ) : (
                  <div className="w-48 h-48 rounded-xl bg-slate-100 border-4 border-slate-200 flex items-center justify-center">
                    <span className="text-6xl opacity-20">📱</span>
                  </div>
                )}
              </div>

              {/* ── ATAU KUNJUNGI WEBSITE ── */}
              <div className="px-5 pb-5 shrink-0">
                {/* Divider */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-slate-200" />
                  <p className="text-base xl:text-lg font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    atau kunjungi website
                  </p>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* URL — teks besar, jelas, tanpa tombol */}
                <div className="bg-teal-50 border-2 border-teal-200 rounded-2xl px-4 py-4 text-center">
                  <p className="text-base xl:text-lg font-black font-mono text-teal-700 break-all leading-snug">
                    {qrUrl || '–'}
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <footer className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 px-5 py-2.5 flex items-center justify-between gap-3 shrink-0 text-xs text-slate-400 font-medium shadow-sm">
          <span>{config.namaPuskesmas} • Sistem Antrean Digital</span>
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {isOnline ? 'Terhubung Realtime' : 'Koneksi Terputus'}
          </span>
        </footer>

      </div>
    </main>
  );
}

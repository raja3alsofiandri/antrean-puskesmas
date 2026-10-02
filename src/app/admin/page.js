'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Users, 
  Volume2, 
  VolumeX, 
  Download, 
  Lock, 
  Unlock, 
  Key, 
  LogOut, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Bell, 
  Upload, 
  MapPin, 
  RefreshCw, 
  XCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Clock,
  Smartphone,
  Sparkles,
  HelpCircle,
  RotateCcw,
  ExternalLink,
  QrCode
} from 'lucide-react';
import { 
  supabase, 
  isSupabaseConfigured,
  parseGoogleMapsCoordinates,
  calculateActualDurationMinutes
} from '@/lib/supabaseClient';
import { 
  registerServiceWorker, 
  requestNotificationPermission, 
  sendSystemNotification, 
  playNotificationChime,
  unlockAudio
} from '@/lib/pwa';

export default function AdminPage() {
  // -------------------------------------------------------------
  // State Autentikasi & Akun Petugas (SSR-Safe Initialization)
  // -------------------------------------------------------------
  const [isMounted, setIsMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [savedUsername, setSavedUsername] = useState('admin');
  const [savedPass, setSavedPass] = useState('puskesmas123');
  const [activeMenu, setActiveMenu] = useState('antrean'); // 'antrean' | 'profil' | 'laporan' | 'sandi'

  // Sinkronisasi Sesi & Preferensi Lokal Setelah Komponen Ter-Mount (Cegah SSR Mismatch)
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      document.documentElement.classList.remove('dark');
      localStorage.removeItem('theme_mode');
      localStorage.removeItem('patient_dark_mode');

      const logged = sessionStorage.getItem('admin_is_logged_in') === 'true';
      if (logged) setIsLoggedIn(true);

      const snd = localStorage.getItem('admin_sound_enabled');
      if (snd !== null) {
        setSoundEnabled(snd === 'true');
      }

      const u = localStorage.getItem('admin_username');
      if (u) setSavedUsername(u);

      const p = localStorage.getItem('admin_password');
      if (p) setSavedPass(p);
    }
  }, []);

  // State Ganti Sandi Form & Verifikasi Username (Wajib Kosong Default)
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Verifikasi Username untuk melihat password saat ini (Wajib Kosong Default)
  const [verifyUsernameInput, setVerifyUsernameInput] = useState('');
  const [isPassVerifiedAndRevealed, setIsPassVerifiedAndRevealed] = useState(false);
  const [showRevealedPassword, setShowRevealedPassword] = useState(false);

  // Jam Digital Realtime
  const [realtimeClock, setRealtimeClock] = useState('');

  // PWA Install Prompt di Admin
  const [deferredAdminPrompt, setDeferredAdminPrompt] = useState(null);
  const [isAdminAppInstalled, setIsAdminAppInstalled] = useState(false);

  // Toggle Suara Admin
  const [soundEnabled, setSoundEnabled] = useState(true);

  // -------------------------------------------------------------
  // State Antrean & Operasional
  // -------------------------------------------------------------
  const [daftarAntrean, setDaftarAntrean] = useState([]);
  const [filterStatus, setFilterStatus] = useState('AKTIF'); // 'AKTIF' | 'SEMUA' | 'MENUNGGU' | 'MEMANGGIL' | 'TERLAMBAT' | 'SELESAI'
  const [searchQuery, setSearchQuery] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPwaInstallGuideModal, setShowPwaInstallGuideModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Filter Laporan CSV
  const [filterPeriode, setFilterPeriode] = useState('HARIAN'); // 'HARIAN' | 'BULANAN' | 'TAHUNAN' | 'SEMUA'

  // -------------------------------------------------------------
  // State Profil, Media & Pengumuman Puskesmas (Default Bersih)
  // -------------------------------------------------------------
  const [namaPuskesmas, setNamaPuskesmas] = useState('Puskesmas Kuala Cenaku');
  const [alamatPuskesmas, setAlamatPuskesmas] = useState('Jl. Kesehatan No. 1, Kuala Cenaku, Kab. Indragiri Hulu, Riau');
  const [logoUrl, setLogoUrl] = useState('🏥');
  const [fotoPuskesmasUrl, setFotoPuskesmasUrl] = useState('');
  const [infoPenting, setInfoPenting] = useState('Wajib membawa KTP atau Kartu Keluarga (KK) fisik saat datang ke loket.');
  const [statusBuka, setStatusBuka] = useState(true);
  const [pengumumanDarurat, setPengumumanDarurat] = useState('');
  const [mapsUrl, setMapsUrl] = useState('https://maps.google.com/?q=-0.5282,102.5853');
  const [latitude, setLatitude] = useState(-0.5282);
  const [longitude, setLongitude] = useState(102.5853);
  // Pengaturan Layar Display Publik
  const [displayQrLink, setDisplayQrLink] = useState('');         // Link custom untuk QR di /display
  const [displaySoundEnabled, setDisplaySoundEnabled] = useState(true); // Suara chime di /display

  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3500);
  };

  // Jam Digital Realtime
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hariTanggal = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const jam = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setRealtimeClock(`${hariTanggal} • ${jam} WIB`);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // PWA Install Event Listener di Admin
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredAdminPrompt(e);
    };
    const handleAppInstalled = () => {
      setIsAdminAppInstalled(true);
      setDeferredAdminPrompt(null);
      showToast('Aplikasi Admin berhasil dipasang!', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      setIsAdminAppInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_sound_enabled', String(nextVal));
    }
    if (nextVal) {
      // Gunakan nada lonceng medis yang sama persis dengan suara panggilan pasien
      playNotificationChime();
      showToast('Suara pemanggilan loket aktif 🔊', 'success');
    } else {
      showToast('Suara pemanggilan dinonaktifkan (mode senyap) 🔇', 'info');
    }
  };

  const handleInstallAdminApp = async () => {
    if (deferredAdminPrompt) {
      try {
        deferredAdminPrompt.prompt();
        const { outcome } = await deferredAdminPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsAdminAppInstalled(true);
          showToast('Aplikasi Admin berhasil dipasang!', 'success');
        }
        setDeferredAdminPrompt(null);
      } catch (err) {
        console.warn('Admin install error:', err);
        setShowPwaInstallGuideModal(true);
      }
    } else {
      setShowPwaInstallGuideModal(true);
    }
  };

  // Helper Sensor Username (Contoh: 'admin' -> 'Axxxxn')
  const sensorUsername = (u) => {
    if (!u) return '******';
    const s = String(u).trim();
    if (s.length <= 2) return s[0] + '*';
    const first = s[0].toUpperCase();
    const last = s[s.length - 1];
    const mask = 'x'.repeat(Math.max(5, s.length - 2));
    return `${first}${mask}${last}`;
  };

  // Verifikasi Username untuk membuka password saat ini
  const handleVerifyUsernameForPassword = (e) => {
    e.preventDefault();
    if (verifyUsernameInput.trim().toLowerCase() === savedUsername.trim().toLowerCase()) {
      setIsPassVerifiedAndRevealed(true);
      showToast('Username cocok! Password saat ini berhasil dibuka.', 'success');
    } else {
      setIsPassVerifiedAndRevealed(false);
      showToast('Username tidak sesuai dengan akun terdaftar!', 'alert');
    }
  };

  // -------------------------------------------------------------
  // 1. Text-To-Speech & Notifikasi Suara Pemanggilan Loket
  // -------------------------------------------------------------
  useEffect(() => {
    unlockAudio(); // Unlock shared AudioContext on mobile gesture
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const onVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.onvoiceschanged = onVoicesChanged;
      return () => {
        if (window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const panggilPasienTTS = useCallback((nomor, nama, panggilanKe = 1) => {
    if (!soundEnabled) return;

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const prefix = panggilanKe > 1 ? 'Panggilan ulang. ' : '';
      const nomorSpelled = (nomor || '').replace(/([A-Za-z])(\d+)/, '$1 $2');
      const text = `${prefix}Nomor antrean, ${nomorSpelled}, atas nama, ${nama}, silakan menuju ke loket pemeriksaan sekarang.`;
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 0.88;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const idVoice = voices.find((v) => 
        (v.lang && (v.lang === 'id-ID' || v.lang.startsWith('id'))) ||
        (v.name && (v.name.toLowerCase().includes('indonesia') || v.name.toLowerCase().includes('id-id') || v.name.toLowerCase().includes('gadis') || v.name.toLowerCase().includes('damayanti')))
      );
      if (idVoice) utterance.voice = idVoice;

      // Chime dulu (notifikasi medis), lalu suara panggilan 550ms kemudian
      playNotificationChime();
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 550);
    } catch (e) {
      console.warn('TTS Admin error:', e);
    }
  }, [soundEnabled]);

  // -------------------------------------------------------------
  // 2. Fetch Data Antrean, Pengaturan & Akun Admin dari Supabase
  // -------------------------------------------------------------
  const loadAdminData = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: antreanData, error: antreanErr } = await supabase
          .from('antrean')
          .select('*')
          .order('urutan', { ascending: true })
          .order('created_at', { ascending: true });

        if (!antreanErr && antreanData) {
          setDaftarAntrean(antreanData);
        }

        const { data: cfgData } = await supabase
          .from('pengaturan')
          .select('*')
          .eq('id', 'puskesmas_config')
          .maybeSingle();

        if (cfgData) {
          setNamaPuskesmas(cfgData.nama_puskesmas || 'Puskesmas Kuala Cenaku');
          setAlamatPuskesmas(cfgData.alamat_puskesmas || 'Jl. Kesehatan No. 1, Kuala Cenaku');
          setLogoUrl(cfgData.logo_url || '🏥');
          setFotoPuskesmasUrl(cfgData.foto_puskesmas_url || '');
          setInfoPenting(cfgData.info_penting || '');
          setStatusBuka(cfgData.status_buka ?? true);
          setPengumumanDarurat(cfgData.pengumuman_darurat || '');
          setMapsUrl(cfgData.maps_url || 'https://maps.google.com/?q=-0.5282,102.5853');
          if (cfgData.latitude) setLatitude(parseFloat(cfgData.latitude));
          if (cfgData.longitude) setLongitude(parseFloat(cfgData.longitude));
          if (cfgData.display_qr_link !== undefined) setDisplayQrLink(cfgData.display_qr_link || '');
          if (cfgData.display_sound_enabled !== undefined) setDisplaySoundEnabled(cfgData.display_sound_enabled ?? true);
        }

        const { data: credData } = await supabase
          .from('pengaturan')
          .select('*')
          .eq('id', 'admin_credential')
          .maybeSingle();

        if (credData) {
          if (credData.nama_puskesmas) setSavedUsername(credData.nama_puskesmas);
          if (credData.info_penting) setSavedPass(credData.info_penting);
        }
      } catch (err) {
        console.error('Error load admin data:', err);
      }
    } else {
      const savedQueue = localStorage.getItem('antrean_local_db');
      if (savedQueue) {
        try { setDaftarAntrean(JSON.parse(savedQueue)); } catch { /* ignore */ }
      }
      const savedCfg = localStorage.getItem('puskesmas_config');
      if (savedCfg) {
        try {
          const parsed = JSON.parse(savedCfg);
          if (parsed.namaPuskesmas) setNamaPuskesmas(parsed.namaPuskesmas);
          if (parsed.alamatPuskesmas) setAlamatPuskesmas(parsed.alamatPuskesmas);
          if (parsed.logoUrl) setLogoUrl(parsed.logoUrl);
          if (parsed.fotoPuskesmasUrl) setFotoPuskesmasUrl(parsed.fotoPuskesmasUrl);
          if (parsed.statusBuka !== undefined) setStatusBuka(parsed.statusBuka);
          if (parsed.pengumumanDarurat !== undefined) setPengumumanDarurat(parsed.pengumumanDarurat);
        } catch { /* ignore */ }
      }
    }
  }, []);

  // -------------------------------------------------------------
  // 3. Supabase Realtime Sinkronisasi
  // -------------------------------------------------------------
  useEffect(() => {
    registerServiceWorker();
    requestNotificationPermission();

    const timer = setTimeout(() => {
      loadAdminData();
    }, 0);

    if (isSupabaseConfigured && supabase) {
      const antreanChannel = supabase
        .channel('admin-antrean-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'antrean' },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setDaftarAntrean((prev) => {
                if (prev.some((q) => q.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
              showToast(`Pasien baru mendaftar: ${payload.new.nomor} - ${payload.new.nama}`, 'success');
            } else if (payload.eventType === 'UPDATE') {
              setDaftarAntrean((prev) =>
                prev.map((q) => (q.id === payload.new.id ? payload.new : q))
              );
            } else if (payload.eventType === 'DELETE') {
              setDaftarAntrean((prev) => prev.filter((q) => q.id !== payload.old.id));
              showToast(`Antrean #${payload.old.id} telah dihapus/dibatalkan`, 'info');
            }
          }
        )
        .subscribe();

      const configChannel = supabase
        .channel('admin-config-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pengaturan' },
          (payload) => {
            if (payload.new) {
              if (payload.new.id === 'puskesmas_config') {
                setStatusBuka(payload.new.status_buka ?? true);
                setPengumumanDarurat(payload.new.pengumuman_darurat || '');
              } else if (payload.new.id === 'admin_credential') {
                if (payload.new.nama_puskesmas) setSavedUsername(payload.new.nama_puskesmas);
                if (payload.new.info_penting) setSavedPass(payload.new.info_penting);
              }
            }
          }
        )
        .subscribe();

      // Polling 15 detik untuk admin (lebih sering karena buka layar aktif)
      const pollInterval = setInterval(() => {
        loadAdminData();
      }, 15000);

      return () => {
        clearTimeout(timer);
        clearInterval(pollInterval);
        supabase.removeChannel(antreanChannel);
        supabase.removeChannel(configChannel);
      };
    } else {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('antrean_sync_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'UPDATE_ALL') loadAdminData();
        };
        return () => {
          clearTimeout(timer);
          bc.close();
        };
      }
      return () => clearTimeout(timer);
    }
  }, [loadAdminData]);

  // -------------------------------------------------------------
  // 4. Identifikasi Pasien Aktif & Siklus
  // -------------------------------------------------------------
  const antreanAktif = daftarAntrean.filter((q) => !q.is_archived && q.status !== 'SELESAI');
  const pasienMemanggil = antreanAktif.find((q) => q.status === 'MEMANGGIL');
  const pasienTeratas = pasienMemanggil || antreanAktif[0] || null;
  const isSiklusTutupAtauKosong = !statusBuka || antreanAktif.length === 0;

  // -------------------------------------------------------------
  // Helper: Panggil Pasien Tertentu Secara Langsung
  // -------------------------------------------------------------
  const panggilPasienTertentu = async (patient, count = 1) => {
    if (!patient) return;
    const nowIso = new Date().toISOString();

    panggilPasienTTS(patient.nomor, patient.nama, count);
    sendSystemNotification(
      `🔊 Panggilan Loket: ${patient.nomor}`,
      `Nomor antrean ${patient.nomor} (${patient.nama}) dipanggil ke loket pemeriksaan!`
    );

    if (isSupabaseConfigured && supabase) {
      await supabase
        .from('antrean')
        .update({
          status: 'MEMANGGIL',
          panggilan_ke: count,
          last_called_at: nowIso,
        })
        .eq('id', patient.id);
    } else {
      const updated = daftarAntrean.map((q) =>
        q.id === patient.id
          ? { ...q, status: 'MEMANGGIL', panggilan_ke: count, last_called_at: nowIso }
          : q
      );
      setDaftarAntrean(updated);
      localStorage.setItem('antrean_local_db', JSON.stringify(updated));
    }

    showToast(`Memanggil ${patient.nomor} - ${patient.nama} (${count}x)`, 'success');
  };

  // -------------------------------------------------------------
  // 5. 4 TOMBOL MASTER KONTROL (RINGKAS & TERINTEGRASI)
  // -------------------------------------------------------------

  // TOMBOL 1: PANGGIL PASIEN (Include Lewati & Panggil Berikutnya di Klik ke-4)
  const handlePanggilUlang = async () => {
    if (isSiklusTutupAtauKosong || !pasienTeratas) {
      alert('Tidak ada pasien aktif atau siklus pendaftaran sedang tutup.');
      return;
    }

    const currentCount = pasienTeratas.panggilan_ke || 0;

    // Jika sudah 3x dipanggil, klik ke-4 otomatis lewati antrean & panggil berikutnya!
    if (currentCount >= 3) {
      showToast(`⚠️ ${pasienTeratas.nomor} telah dipanggil 3x. Otomatis dilewati ke antrean berikutnya!`, 'alert');
      await handleLewatiAntrean(pasienTeratas);
      return;
    }

    const nextCount = currentCount + 1;
    await panggilPasienTertentu(pasienTeratas, nextCount);
  };

  // Helper: Lewati Antrean
  const handleLewatiAntrean = async (targetPatient = pasienTeratas) => {
    if (!targetPatient) return;

    const waitingAfter = antreanAktif.filter(
      (q) => q.id !== targetPatient.id && (q.status === 'MENUNGGU' || q.status === 'TERLAMBAT')
    );

    let newUrutan = (targetPatient.urutan ?? 0) + 10;
    if (waitingAfter.length >= 2) {
      newUrutan = (waitingAfter[1].urutan ?? 0) + 1;
    } else if (waitingAfter.length === 1) {
      newUrutan = (waitingAfter[0].urutan ?? 0) + 1;
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('antrean')
          .update({
            status: 'TERLAMBAT',
            urutan: newUrutan,
          })
          .eq('id', targetPatient.id);
      } catch (err) {
        console.error('Gagal lewati antrean:', err);
      }
    } else {
      const updated = daftarAntrean.map((q) =>
        q.id === targetPatient.id ? { ...q, status: 'TERLAMBAT', urutan: newUrutan } : q
      );
      setDaftarAntrean(updated);
      localStorage.setItem('antrean_local_db', JSON.stringify(updated));
    }

    showToast(`⏭️ ${targetPatient.nomor} dilewati antreannya`, 'alert');

    // Otomatis panggil antrean berikutnya jika ada
    if (waitingAfter.length > 0) {
      const nextOne = waitingAfter[0];
      setTimeout(() => {
        panggilPasienTertentu(nextOne, 1);
      }, 700);
    }
  };

  // TOMBOL 2: SELESAI (Include Panggil Berikutnya Secara Otomatis)
  const handleTandaiSelesai = async () => {
    if (!pasienTeratas) {
      alert('Tidak ada pasien aktif yang sedang dilayani.');
      return;
    }

    const patientDone = pasienTeratas;
    const nowIso = new Date().toISOString();
    const durasi = calculateActualDurationMinutes(patientDone.created_at, nowIso);

    const nextCandidates = antreanAktif.filter(
      (q) => q.id !== patientDone.id && (q.status === 'MENUNGGU' || q.status === 'TERLAMBAT')
    );

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('antrean')
          .update({
            status: 'SELESAI',
            finished_at: nowIso,
            durasi_aktual_menit: durasi,
          })
          .eq('id', patientDone.id);
      } catch (err) {
        console.error('Gagal menandai selesai:', err);
      }
    } else {
      const updated = daftarAntrean.map((q) =>
        q.id === patientDone.id
          ? { ...q, status: 'SELESAI', finished_at: nowIso, durasi_aktual_menit: durasi }
          : q
      );
      setDaftarAntrean(updated);
      localStorage.setItem('antrean_local_db', JSON.stringify(updated));
    }

    showToast(`✅ ${patientDone.nomor} (${patientDone.nama}) selesai dilayani`, 'success');

    // Otomatis langsung panggil pasien berikutnya
    if (nextCandidates.length > 0) {
      const nextPatient = nextCandidates[0];
      setTimeout(() => {
        panggilPasienTertentu(nextPatient, 1);
      }, 600);
    } else {
      showToast('🎉 Semua antrean telah selesai dilayani!', 'info');
    }
  };

  // TOMBOL 3: TUTUP / BUKA PENDAFTARAN
  const handleTogglePendaftaran = async () => {
    const nextState = !statusBuka;
    setStatusBuka(nextState);

    if (isSupabaseConfigured && supabase) {
      await supabase
        .from('pengaturan')
        .upsert({ id: 'puskesmas_config', status_buka: nextState });
    } else {
      const savedCfg = JSON.parse(localStorage.getItem('puskesmas_config') || '{}');
      savedCfg.statusBuka = nextState;
      localStorage.setItem('puskesmas_config', JSON.stringify(savedCfg));
    }

    showToast(nextState ? 'Pendaftaran Loket DIBUKA' : 'Pendaftaran Loket DITUTUP', 'info');
  };

  // TOMBOL 4: RESET SIKLUS HARIAN (Tutup Loket, Simpan Data SELESAI, Hapus Antrean Belum Selesai)
  const handleResetSiklusHarian = async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        // 1. Tutup loket pendaftaran
        await supabase
          .from('pengaturan')
          .upsert({ id: 'puskesmas_config', status_buka: false });

        // 2. Arsipkan antrean yang berstatus SELESAI (tersimpan untuk laporan CSV & dataset skripsi)
        await supabase
          .from('antrean')
          .update({ is_archived: true })
          .eq('is_archived', false)
          .eq('status', 'SELESAI');

        // 3. Hapus antrean yang belum selesai (MENUNGGU, TERLAMBAT, MEMANGGIL) agar antrean baru bersih
        await supabase
          .from('antrean')
          .delete()
          .eq('is_archived', false)
          .neq('status', 'SELESAI');
      } else {
        const savedQueue = JSON.parse(localStorage.getItem('antrean_local_db') || '[]');
        const archivedDone = savedQueue
          .filter((q) => q.status === 'SELESAI')
          .map((q) => ({ ...q, is_archived: true }));
        localStorage.setItem('antrean_local_db', JSON.stringify(archivedDone));
        localStorage.removeItem('antrean_pasien');

        const savedCfg = JSON.parse(localStorage.getItem('puskesmas_config') || '{}');
        savedCfg.statusBuka = false;
        localStorage.setItem('puskesmas_config', JSON.stringify(savedCfg));
      }

      setStatusBuka(false);
      loadAdminData();
      setShowResetModal(false);
      showToast('Siklus ditutup. Data selesai disimpan, antrean yang belum selesai dihapus.', 'success');
    } catch (err) {
      console.error('Gagal reset harian:', err);
      alert('Gagal menutup siklus harian.');
    }
  };

  // -------------------------------------------------------------
  // 6. Pengaturan: Simpan & Unggah Media
  // -------------------------------------------------------------
  const handleMapsUrlChange = (url) => {
    setMapsUrl(url);
    const coords = parseGoogleMapsCoordinates(url);
    if (coords) {
      setLatitude(coords.lat);
      setLongitude(coords.lon);
      showToast(`Koordinat otomatis: ${coords.lat}, ${coords.lon}`, 'success');
    }
  };

  const handleFileUpload = (e, targetSetter) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert('Ukuran file maksimal 3 MB!');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      targetSetter(reader.result);
      showToast('Gambar berhasil dimuat!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleHapusPengumumanDarurat = async () => {
    setPengumumanDarurat('');
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('pengaturan')
          .upsert({
            id: 'puskesmas_config',
            pengumuman_darurat: '',
            updated_at: new Date().toISOString(),
          });
      } catch (err) {
        console.error(err);
      }
    }
    showToast('Banner pengumuman darurat telah dibersihkan.', 'info');
  };

  const handleSimpanPengaturan = async (e) => {
    e.preventDefault();

    const payload = {
      id: 'puskesmas_config',
      nama_puskesmas: namaPuskesmas,
      alamat_puskesmas: alamatPuskesmas,
      logo_url: logoUrl,
      foto_puskesmas_url: fotoPuskesmasUrl,
      info_penting: infoPenting,
      pengumuman_darurat: pengumumanDarurat.trim(),
      status_buka: statusBuka,
      maps_url: mapsUrl,
      latitude: latitude,
      longitude: longitude,
      display_qr_link: displayQrLink.trim(),
      display_sound_enabled: displaySoundEnabled,
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('pengaturan').upsert(payload);
        if (error) throw error;
        showToast('Pengaturan Puskesmas berhasil disimpan & disiarkan!', 'success');
      } catch (err) {
        console.error('Gagal simpan:', err);
        alert('Gagal menyimpan ke database Supabase.');
      }
    } else {
      localStorage.setItem('puskesmas_config', JSON.stringify({
        namaPuskesmas,
        alamatPuskesmas,
        logoUrl,
        fotoPuskesmasUrl,
        infoPenting,
        pengumumanDarurat,
        statusBuka,
        mapsUrl,
        latitude,
        longitude,
      }));
      showToast('Pengaturan disimpan secara lokal.', 'success');
    }
  };

  // -------------------------------------------------------------
  // 7. Unduh Laporan CSV Sederhana & Sinkronisasi Tabel Laporan
  // -------------------------------------------------------------
  const getFilteredReportRows = useCallback(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return daftarAntrean.filter((row) => {
      // HANYA antrean yang sudah SELESAI yang disimpan dan ditampilkan di halaman ekspor serta file CSV
      if (row.status !== 'SELESAI') return false;

      if (!row.created_at) return true;
      const d = new Date(row.created_at);

      if (filterPeriode === 'HARIAN') {
        return d.toISOString().split('T')[0] === todayStr;
      }
      if (filterPeriode === 'BULANAN') {
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      }
      if (filterPeriode === 'TAHUNAN') {
        return d.getFullYear() === currentYear;
      }
      return true;
    });
  }, [daftarAntrean, filterPeriode]);

  const exportToCSV = () => {
    const filteredRows = getFilteredReportRows();

    if (filteredRows.length === 0) {
      alert(`Tidak ada data antrean untuk periode: ${filterPeriode}`);
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let csvContent = '\uFEFF'; // BOM untuk kompatibilitas Excel
    csvContent += 'No,Nomor Antrean,Nama Pasien,Jam Daftar,Jam Selesai\n';

    filteredRows.forEach((row, index) => {
      const createdStr = row.created_at 
        ? new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
        : '-';
      const finishedStr = row.finished_at 
        ? new Date(row.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
        : '-';
      const cleanNama = (row.nama || '').replace(/"/g, '""');

      csvContent += `${index + 1},${row.nomor},"${cleanNama}","${createdStr}","${finishedStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `laporan_antrean_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Laporan CSV berhasil diekspor!', 'success');
  };

  // -------------------------------------------------------------
  // 8. Simpan Sandi Baru ke Supabase
  // -------------------------------------------------------------
  const handleUpdatePassword = async (e) => {
    e.preventDefault();

    if (!currentPass.trim()) {
      showToast('Masukkan password saat ini!', 'alert');
      return;
    }

    if (currentPass.trim() !== savedPass.trim()) {
      showToast('Password saat ini salah! Periksa kembali.', 'alert');
      return;
    }

    if (newPass.length < 6) {
      showToast('Password baru minimal 6 karakter!', 'alert');
      return;
    }

    if (newPass !== confirmPass) {
      showToast('Konfirmasi password baru tidak cocok!', 'alert');
      return;
    }

    setIsChangingPass(true);

    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('pengaturan').upsert({
          id: 'admin_credential',
          nama_puskesmas: savedUsername,
          info_penting: newPass,
          updated_at: new Date().toISOString(),
        });

        if (error) throw error;
      }

      setSavedPass(newPass);
      localStorage.setItem('admin_password', newPass);

      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setIsPassVerifiedAndRevealed(false);
      showToast('Password admin berhasil diperbarui dan tersimpan di Supabase!', 'success');
    } catch (err) {
      console.error('Gagal memperbarui password:', err);
      showToast('Terjadi kesalahan saat menyimpan password ke Supabase.', 'alert');
    } finally {
      setIsChangingPass(false);
    }
  };

  const antreanDitampilkan = daftarAntrean
    .filter((item) => {
      if (filterStatus === 'AKTIF') return !item.is_archived;
      if (filterStatus === 'SEMUA') return true;
      return item.status === filterStatus;
    })
    .filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return item.nama?.toLowerCase().includes(q) || item.nomor?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aDone = a.status === 'SELESAI' ? 1 : 0;
      const bDone = b.status === 'SELESAI' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aUrutan = a.urutan ?? 0;
      const bUrutan = b.urutan ?? 0;
      if (aUrutan !== bUrutan) return aUrutan - bUrutan;

      return new Date(a.created_at) - new Date(b.created_at);
    });

  // -------------------------------------------------------------
  // RENDER: HYDRATION GUARD & PANEL LOGIN
  // -------------------------------------------------------------
  if (!isMounted) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-400">Memuat Portal Petugas...</p>
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-6 sm:p-8 max-w-sm w-full border border-slate-100">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-teal-50 text-teal-600 mb-3 border border-teal-100 shadow-sm">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black text-slate-900">Portal Petugas Loket</h1>
            <p className="text-xs text-slate-400 mt-1">{namaPuskesmas}</p>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (loginUsername.trim() === savedUsername && loginPassword === savedPass) {
              setIsLoggedIn(true);
              sessionStorage.setItem('admin_is_logged_in', 'true');
              showToast('Selamat bertugas!', 'success');
            } else {
              alert('Username atau Password salah!');
            }
          }} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Username</label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg shadow-teal-600/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" /> Masuk ke Dashboard
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <a 
              href="/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-bold transition-colors"
            >
              Buka Layar Pasien (Tab Baru) ↗
            </a>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // RENDER: DASHBOARD ADMIN UTAMA
  // -------------------------------------------------------------
  return (
    <main className="min-h-screen font-sans pb-20 relative bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100/70 text-slate-800">

      {/* LATAR BELAKANG FOTO PUSKESMAS (Sama seperti halaman pasien) */}
      {fotoPuskesmasUrl ? (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center transition-all duration-700 opacity-65 scale-100"
            style={{ backgroundImage: `url("${fotoPuskesmasUrl}")` }}
          />
          {/* Lapisan overlay lembut putih bersih */}
          <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px]" />
        </div>
      ) : null}

      
      {/* Toast Notifikasi */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md animate-fade-in">
          <div className={`p-4 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-semibold border ${
            toastMessage.type === 'alert' 
              ? 'bg-amber-600 text-white border-amber-700' 
              : toastMessage.type === 'success'
              ? 'bg-teal-600 text-white border-teal-700'
              : 'bg-slate-800 text-white border-slate-900'
          }`}>
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="flex-1">{toastMessage.message}</p>
          </div>
        </div>
      )}

      <div className="relative z-10 w-full max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8">

        {/* ================= HEADER ADMIN (Loket Utama + Waktu Realtime) ================= */}
        <div className="bg-white/95 backdrop-blur-md p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-200/80 mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all w-full overflow-hidden">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 w-full md:flex-1">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center text-2xl sm:text-3xl font-black shadow-xs shrink-0 overflow-hidden">
              {logoUrl.startsWith('http') || logoUrl.startsWith('data:') ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                logoUrl || '🏥'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="bg-teal-100 text-teal-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                  Panel Loket Utama
                </span>
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                  statusBuka ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusBuka ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
                  {statusBuka ? 'Pendaftaran Buka' : 'Pendaftaran Tutup'}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 truncate leading-tight">{namaPuskesmas}</h1>
              <p className="text-xs text-slate-500 line-clamp-1 sm:truncate max-w-full break-all sm:break-normal">{alamatPuskesmas}</p>
            </div>
          </div>

          {/* SISI KANAN CARD LOKET UTAMA: WAKTU REALTIME */}
          <div className="flex items-center gap-3 shrink-0 w-full md:w-auto bg-slate-50 border border-slate-200/80 px-4 py-3 rounded-2xl shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100/60">
              <Clock className="w-5 h-5 animate-pulse text-teal-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Waktu</p>
              <p className="text-xs sm:text-sm font-black font-mono text-slate-800 tracking-tight">
                {realtimeClock || '--:--:-- WIB'}
              </p>
            </div>
          </div>
        </div>

        {/* ================= 1 CARD PANJANG MENU AKSI CEPAT (MODERN & TERSTRUKTUR) ================= */}
        <div className="bg-white/95 backdrop-blur-md p-3 sm:p-4 rounded-3xl shadow-sm border border-slate-200/80 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
            
            {/* 1. Suara On / Suara Off */}
            <button
              type="button"
              onClick={toggleSound}
              className={`p-3 sm:p-4 rounded-2xl transition-all cursor-pointer border flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3 group shadow-xs hover:shadow-md ${
                soundEnabled
                  ? 'bg-gradient-to-br from-teal-50 to-emerald-50/60 border-teal-200 text-teal-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                soundEnabled ? 'bg-teal-600 text-white shadow-xs shadow-teal-500/30' : 'bg-slate-200 text-slate-500'
              }`}>
                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-black break-words whitespace-normal leading-tight block">
                  {soundEnabled ? 'Suara Aktif' : 'Suara Senyap'}
                </span>
                <p className="hidden sm:block text-[11px] text-slate-500 truncate mt-0.5">
                  {soundEnabled ? 'Bunyikan TTS loket' : 'Mode hening panggilan'}
                </p>
              </div>
            </button>

            {/* 2. Layar Pasien */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 sm:p-4 rounded-2xl transition-all cursor-pointer border border-slate-200 bg-slate-50 hover:bg-teal-50/70 hover:border-teal-200 text-slate-800 flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3 group shadow-xs hover:shadow-md"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-2xs">
                <ExternalLink className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-black break-words whitespace-normal leading-tight block">
                  Layar Pasien
                </span>
                <p className="hidden sm:block text-[11px] text-slate-500 truncate mt-0.5">
                  Buka tab antrean baru ↗
                </p>
              </div>
            </a>

            {/* 3. Pasang Aplikasi */}
            <button
              type="button"
              onClick={handleInstallAdminApp}
              className="p-3 sm:p-4 rounded-2xl transition-all cursor-pointer border border-slate-200 bg-slate-50 hover:bg-teal-50/70 hover:border-teal-200 text-slate-800 flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3 group shadow-xs hover:shadow-md"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-2xs">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-black break-words whitespace-normal leading-tight block">
                  {isAdminAppInstalled ? 'Aplikasi Terpasang' : 'Pasang Aplikasi'}
                </span>
                <p className="hidden sm:block text-[11px] text-slate-500 truncate mt-0.5">
                  Aplikasi mandiri loket
                </p>
              </div>
            </button>

            {/* 4. Layar Display */}
            <a
              href="/display"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 sm:p-4 rounded-2xl transition-all cursor-pointer border border-slate-200 bg-slate-50 hover:bg-violet-50/70 hover:border-violet-200 text-slate-800 flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3 group shadow-xs hover:shadow-md"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-violet-50 text-violet-600 border border-violet-100 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-2xs">
                <ExternalLink className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-black break-words whitespace-normal leading-tight block">
                  Layar Display
                </span>
                <p className="hidden sm:block text-[11px] text-slate-500 truncate mt-0.5">
                  Tampilan TV / monitor publik ↗
                </p>
              </div>
            </a>

            {/* 5. Keluar */}
            <button
              type="button"
              onClick={() => setShowLogoutModal(true)}
              className="p-3 sm:p-4 rounded-2xl transition-all cursor-pointer border border-rose-200/80 bg-rose-50/60 hover:bg-rose-100/80 text-rose-900 flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3 group shadow-xs hover:shadow-md"
            >
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 shadow-2xs">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-black break-words whitespace-normal leading-tight block">
                  Keluar Akun
                </span>
                <p className="hidden sm:block text-[11px] text-rose-600/80 truncate mt-0.5">
                  Akhiri sesi petugas
                </p>
              </div>
            </button>

          </div>
        </div>

        {/* ================= TAB MENU (RINGKAS: KELOLA ANTREAN) ================= */}
        <div className="flex bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xs border border-slate-200/80 mb-6 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveMenu('antrean')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMenu === 'antrean' 
                ? 'bg-teal-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" /> Kelola Antrean
          </button>
          <button
            onClick={() => setActiveMenu('profil')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMenu === 'profil' 
                ? 'bg-teal-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4" /> Media & Profil Puskesmas
          </button>
          <button
            onClick={() => setActiveMenu('laporan')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMenu === 'laporan' 
                ? 'bg-teal-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Download className="w-4 h-4" /> Ekspor CSV / Excel
          </button>
          <button
            onClick={() => setActiveMenu('sandi')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMenu === 'sandi' 
                ? 'bg-teal-600 text-white shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Key className="w-4 h-4" /> Ganti Sandi
          </button>
        </div>

        {/* ================= TAB 1: KELOLA ANTREAN (4 MASTER BUTTONS) ================= */}
        {activeMenu === 'antrean' && (
          <div className="space-y-6">
            
            {/* ================= MASTER CONTROL PANEL (DENGAN TOTAL AKTIF & 4 TOMBOL) ================= */}
            <div className="bg-gradient-to-r from-teal-900 to-slate-900 text-white rounded-3xl p-6 shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-teal-800/60">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-teal-300 bg-teal-800/80 px-3 py-1 rounded-full">
                    Pasien Teratas Saat Ini
                  </span>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-4xl font-black text-white">
                      {pasienTeratas ? pasienTeratas.nomor : '---'}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-100">
                        {pasienTeratas ? pasienTeratas.nama : 'Tidak ada antrean aktif'}
                      </h3>
                      <p className="text-xs text-teal-200">
                        {pasienTeratas 
                          ? `Status: ${pasienTeratas.status} • Panggilan: ${pasienTeratas.panggilan_ke || 0}/3`
                          : isSiklusTutupAtauKosong 
                          ? 'Siklus antrean hari ini telah ditutup atau selesai.'
                          : 'Belum ada pendaftaran baru.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Total Antrean Aktif dimasukkan di dekat card master control */}
                <div className="inline-flex items-center gap-2 bg-teal-800/90 text-teal-100 px-4 py-2 rounded-2xl text-xs font-bold border border-teal-700/60 shadow-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Total Antrean Aktif: <strong className="text-white text-sm ml-1">{antreanAktif.length}</strong> Pasien</span>
                </div>
              </div>

              {/* Peringatan jika siklus tutup */}
              {!statusBuka && (
                <div className="mt-4 bg-amber-500/20 border border-amber-400/40 rounded-2xl p-3 text-xs text-amber-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Pendaftaran antrean sedang ditutup. Pasien baru tidak dapat mendaftar.</span>
                </div>
              )}

              {/* 4 TOMBOL MASTER KONTROL (RINGKAS & TEPAT SASARAN) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-5">
                
                {/* 1. Panggil Pasien (include lewati dan panggil berikutnya di ke-4) */}
                <button
                  onClick={handlePanggilUlang}
                  disabled={isSiklusTutupAtauKosong || !pasienTeratas}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold p-4 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 shadow-md active:scale-95 text-center"
                >
                  <Volume2 className="w-6 h-6 text-blue-200" />
                  <span className="font-extrabold text-sm">Panggil Pasien</span>
                  <span className="text-[11px] text-blue-200">
                    {pasienTeratas ? `Panggilan ${pasienTeratas.panggilan_ke || 0}/3` : 'Tidak ada pasien'}
                  </span>
                </button>

                {/* 2. Selesai (include panggil berikutnya secara otomatis) */}
                <button
                  onClick={handleTandaiSelesai}
                  disabled={isSiklusTutupAtauKosong || !pasienTeratas}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold p-4 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 shadow-md active:scale-95 text-center"
                >
                  <CheckCircle2 className="w-6 h-6 text-emerald-200" />
                  <span className="font-extrabold text-sm">Selesai & Lanjut</span>
                  <span className="text-[11px] text-emerald-200">Otomatis panggil selanjutnya</span>
                </button>

                {/* 3. Tutup / Buka Pendaftaran */}
                <button
                  onClick={handleTogglePendaftaran}
                  className={`font-bold p-4 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 shadow-md active:scale-95 text-center text-white ${
                    statusBuka ? 'bg-amber-600 hover:bg-amber-500' : 'bg-teal-600 hover:bg-teal-500'
                  }`}
                >
                  {statusBuka ? <Lock className="w-6 h-6 text-amber-200" /> : <Unlock className="w-6 h-6 text-teal-200" />}
                  <span className="font-extrabold text-sm">{statusBuka ? 'Tutup Pendaftaran' : 'Buka Pendaftaran'}</span>
                  <span className="text-[11px] text-slate-200">{statusBuka ? 'Pendaftaran Sedang Buka' : 'Pendaftaran Sedang Tutup'}</span>
                </button>

                {/* 4. Reset Siklus Harian (Tutup & Simpan Riwayat Selesai) */}
                <button
                  onClick={() => setShowResetModal(true)}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold p-4 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 shadow-md active:scale-95 text-center"
                >
                  <RefreshCw className="w-6 h-6 text-rose-200" />
                  <span className="font-extrabold text-sm">Reset Siklus Harian</span>
                  <span className="text-[11px] text-rose-200">Tutup loket & simpan riwayat selesai</span>
                </button>

              </div>

            </div>

            {/* ================= TABEL ANTREAN REALTIME ================= */}
            <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-xs border border-slate-200/80 p-5 sm:p-6">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div className="relative flex-1 w-full sm:max-w-xs">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama atau nomor..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                  />
                </div>

                <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                  {['AKTIF', 'SEMUA', 'MENUNGGU', 'MEMANGGIL', 'TERLAMBAT', 'SELESAI'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setFilterStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        filterStatus === st 
                          ? 'bg-white text-teal-800 shadow-xs' 
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* LIST / TABEL ANTREAN */}
              <div className="space-y-2.5">
                {antreanDitampilkan.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-xs">
                    Tidak ada antrean yang sesuai dengan filter ini.
                  </div>
                ) : (
                  antreanDitampilkan.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 min-w-0 ${
                        item.status === 'MEMANGGIL'
                          ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-100'
                          : item.status === 'TERLAMBAT'
                          ? 'bg-amber-50/60 border-amber-200'
                          : item.status === 'SELESAI'
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : 'bg-white border-slate-200/80 hover:border-teal-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <span className="text-xs font-black text-slate-300 w-5 shrink-0">#{idx + 1}</span>
                        <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 text-teal-800 font-black text-sm flex items-center justify-center shrink-0 leading-tight text-center">
                          {item.nomor}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-slate-900 text-sm truncate max-w-[140px] sm:max-w-none">{item.nama}</h4>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${
                              item.status === 'MEMANGGIL' ? 'bg-blue-600 text-white animate-pulse' :
                              item.status === 'TERLAMBAT' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                              item.status === 'SELESAI' ? 'bg-emerald-100 text-emerald-800' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {item.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                            Daftar: {item.created_at ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                            {item.finished_at && ` • Selesai: ${new Date(item.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
                            {item.panggilan_ke > 0 ? ` • Panggilan: ${item.panggilan_ke}x` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Status Ringkas Pelayanan */}
                      <div className="self-end sm:self-center text-right shrink-0">
                        {item.status === 'MEMANGGIL' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-100 text-blue-800 text-xs font-bold animate-pulse">
                            <Volume2 className="w-3.5 h-3.5" /> Dipanggil
                          </span>
                        ) : item.status === 'SELESAI' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">
                            {item.status === 'TERLAMBAT' ? 'Dilewati' : 'Menunggu'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

            </div>

          </div>
        )}

        {/* ================= TAB 2: KUSTOMISASI MEDIA, GPS & PENGUMUMAN ================= */}
        {activeMenu === 'profil' && (
          <form onSubmit={handleSimpanPengaturan} className="space-y-6 animate-fade-in w-full">
            
            {/* Header Pengantar Tab 2 */}
            <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100 shadow-2xs">
                  <Settings className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-black text-slate-900 text-lg">Profil, Media & Pengumuman Instansi</h2>
                  <p className="text-xs text-slate-400">Pengaturan identitas, media visual, dan navigasi GPS yang tersinkron otomatis ke seluruh pasien.</p>
                </div>
              </div>

              {/* Tombol Simpan Cepat di Header */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                <button
                  type="submit"
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-5 py-2.5 rounded-2xl text-xs shadow-md shadow-teal-600/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Simpan Perubahan
                </button>
              </div>
            </div>

            {/* Layout 2 Kolom Seimbang (Desktop 12 Kolom, Mobile Stack) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* ================= KOLOM KIRI (5 KOLOM): PRATINJAU LANGSUNG (LIVE PREVIEW) ================= */}
              <div className="lg:col-span-5 space-y-5">
                
                {/* Card Live Preview Pasien */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 relative overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-teal-600" />
                      Pratinjau Layar Pasien (Live)
                    </span>
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                      Tampilan Nyata
                    </span>
                  </div>

                  {/* Frame Simulasi Layar Pasien Nyata (1:1 Sinkron Web Pasien) */}
                  <div className="rounded-2xl border border-slate-200/90 overflow-hidden bg-slate-100 relative shadow-md">
                    {/* Browser / Device Chrome Header */}
                    <div className="bg-slate-200/90 px-3.5 py-2 border-b border-slate-300/70 flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      </div>
                      <div className="flex-1 bg-white/90 rounded-md px-2.5 py-0.5 text-[10px] text-slate-500 font-mono flex items-center justify-between border border-slate-200/60 shadow-2xs">
                        <span className="truncate">antrean-puskesmas.web.app (Layar Pasien)</span>
                        <span className="text-[9px] font-bold text-teal-600 uppercase tracking-wider">LIVE</span>
                      </div>
                    </div>

                    {/* Viewport Layar Pasien */}
                    <div className="relative p-3.5 sm:p-4 min-h-[360px] flex flex-col justify-start overflow-hidden bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100/70">
                      {/* Latar Belakang Foto Jelas */}
                      {fotoPuskesmasUrl ? (
                        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                          <img 
                            src={fotoPuskesmasUrl} 
                            alt="Foto Latar Puskesmas" 
                            className="w-full h-full object-cover object-center scale-100 transition-transform duration-700" 
                          />
                          <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px]" />
                        </div>
                      ) : null}

                      {/* Banner Pengumuman Darurat (Sinkron Pasien) */}
                      {pengumumanDarurat && (
                        <aside className="relative z-10 bg-red-600 text-white px-3 py-2 rounded-xl shadow-xs mb-3 flex items-center gap-2 text-xs font-bold animate-pulse">
                          <AlertCircle className="w-4 h-4 text-amber-200 shrink-0" />
                          <div className="flex-1 text-[11px] leading-tight">
                            <span className="uppercase tracking-wider font-extrabold text-amber-200 mr-1">PENGUMUMAN:</span>
                            {pengumumanDarurat}
                          </div>
                        </aside>
                      )}

                      {/* Card Profil Pasien (Persis 1:1 Dengan Web Pasien - Card Kepala dengan Foto Jelas) */}
                      <div className={`relative z-10 rounded-2xl p-4 sm:p-5 border shadow-md text-center overflow-hidden transition-all ${
                        fotoPuskesmasUrl 
                          ? 'border-slate-800/20 shadow-slate-900/10' 
                          : 'bg-white/95 backdrop-blur-md border-slate-200/80 shadow-slate-200/50'
                      }`}>
                        {/* Latar Belakang Foto Pada Card Kepala (JELAS, TANPA LAPISAN PUTIH OPACITY) */}
                        {fotoPuskesmasUrl ? (
                          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                            <img 
                              src={fotoPuskesmasUrl} 
                              alt="Latar Card Kepala" 
                              className="w-full h-full object-cover object-center" 
                            />
                            {/* Gradasi gelap lembut di bawah agar foto tetap tampil tajam 100% dan teks putih terbaca sangat kontras */}
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/20" />
                          </div>
                        ) : null}

                        {/* Top gradient line */}
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500 z-10" />
                        
                        {/* Logo Puskesmas */}
                        <div className="relative z-10 inline-flex items-center justify-center w-16 h-16 rounded-2xl border border-white/80 bg-white/95 text-teal-600 shadow-md mb-2.5 overflow-hidden">
                          {logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('data:')) ? (
                            <img src={logoUrl} alt="Logo Pelayanan" className="w-13 h-13 object-contain rounded-xl p-0.5" />
                          ) : (
                            <span className="text-3xl">{logoUrl || '🏥'}</span>
                          )}
                        </div>

                        {/* Nama Puskesmas */}
                        <h4 className={`relative z-10 text-base sm:text-lg font-black tracking-tight leading-snug ${
                          fotoPuskesmasUrl ? 'text-white drop-shadow-md' : 'text-slate-900'
                        }`}>
                          {namaPuskesmas || 'Nama Puskesmas Belum Diatur'}
                        </h4>

                        {/* Alamat Puskesmas */}
                        <p className={`relative z-10 text-[11px] sm:text-xs mt-1 max-w-xs mx-auto leading-relaxed font-medium ${
                          fotoPuskesmasUrl ? 'text-slate-200 drop-shadow-xs' : 'text-slate-500'
                        }`}>
                          {alamatPuskesmas || 'Alamat Belum Diatur'}
                        </p>

                        {/* Status Loket Badge */}
                        <div className={`relative z-10 mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border backdrop-blur-md shadow-2xs ${
                          fotoPuskesmasUrl 
                            ? 'bg-white/95 border-white/60 text-slate-800' 
                            : 'bg-slate-50 border-slate-200/80 text-slate-800'
                        }`}>
                          <span className={`w-2.5 h-2.5 rounded-full ${statusBuka ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
                          <span className={statusBuka ? 'text-emerald-700' : 'text-rose-700'}>
                            {statusBuka ? 'Loket Pelayanan Buka' : 'Loket Pelayanan Ditutup'}
                          </span>
                        </div>
                      </div>

                      {/* Mini Tab & Navigasi Mockup Pasien */}
                      <div className="relative z-10 mt-3 flex bg-slate-200/80 p-1 rounded-xl border border-slate-200/90 shadow-2xs">
                        <div className="flex-1 py-1.5 text-center text-[10px] font-bold rounded-lg bg-white text-teal-800 shadow-2xs flex items-center justify-center gap-1">
                          <span>🎫 Ambil Antrean</span>
                        </div>
                        <div className="flex-1 py-1.5 text-center text-[10px] font-bold rounded-lg text-slate-600 flex items-center justify-center gap-1">
                          <span>🔍 Cek Antrean</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-3 text-center leading-relaxed">
                    Setiap perubahan di formulir sebelah kanan akan langsung terlihat pada pratinjau ini sebelum disimpan ke server.
                  </p>
                </div>

                {/* Card Panduan & Rekomendasi Media */}
                <div className="bg-slate-50 rounded-3xl p-5 border border-slate-200/80 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    Panduan & Rekomendasi Media
                  </div>
                  <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="text-teal-600 font-bold">•</span>
                      <span><strong>Logo:</strong> Gunakan gambar transparan berformat PNG aspek rasio 1:1 (persegi) agar simetris.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-teal-600 font-bold">•</span>
                      <span><strong>Foto Latar:</strong> Gunakan foto gedung/layanan berformat JPG/WebP lanskap (16:9) beresolusi minimal 1280x720.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-teal-600 font-bold">•</span>
                      <span><strong>Koordinat GPS:</strong> Pastikan latitude & longitude akurat agar estimasi rute OSRM pasien tidak meleset.</span>
                    </li>
                  </ul>
                </div>

              </div>

              {/* ================= KOLOM KANAN (7 KOLOM): FORMULIR PENGATURAN TERSTRUKTUR ================= */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* 1. SEKSI IDENTITAS PUSKESMAS */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <span className="w-2 h-2 rounded-full bg-teal-500" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      1. Identitas & Informasi Instansi
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                        Nama Puskesmas / Instansi
                      </label>
                      <input
                        type="text"
                        value={namaPuskesmas}
                        onChange={(e) => setNamaPuskesmas(e.target.value)}
                        placeholder="Contoh: Puskesmas Kuala Cenaku"
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                        Alamat Lengkap
                      </label>
                      <input
                        type="text"
                        value={alamatPuskesmas}
                        onChange={(e) => setAlamatPuskesmas(e.target.value)}
                        placeholder="Contoh: Jl. Kesehatan No. 1, Kuala Cenaku"
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Persyaratan Wajib Pasien (KTP/KK Fisik)
                    </label>
                    <textarea
                      rows={2}
                      value={infoPenting}
                      onChange={(e) => setInfoPenting(e.target.value)}
                      placeholder="Contoh: Wajib membawa KTP atau KK fisik saat datang ke loket..."
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 leading-relaxed"
                    />
                  </div>
                </div>

                {/* 2. SEKSI MEDIA VISUAL (LOGO & FOTO BACKGROUND) */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      2. Media Visual (Logo & Foto Background)
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Upload Logo (Proposional & Simetris) */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Logo Instansi</span>
                          {logoUrl && logoUrl !== '🏥' ? (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-teal-600" /> Logo Khusus
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                              Ikon Standar
                            </span>
                          )}
                        </div>

                        {/* Kotak Preview Logo Proposional */}
                        <div className="w-full h-32 sm:h-36 rounded-xl bg-white border border-slate-200 overflow-hidden relative shadow-inner flex flex-col items-center justify-center p-3 group">
                          {logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('data:')) ? (
                            <>
                              <div className="flex-1 flex items-center justify-center w-full">
                                <img 
                                  src={logoUrl} 
                                  alt="Preview Logo" 
                                  className="max-w-[120px] max-h-[75px] w-auto h-auto object-contain drop-shadow-sm group-hover:scale-105 transition-transform duration-300" 
                                />
                              </div>
                              <span className="text-[10px] font-medium text-slate-400 mt-1">
                                Format Transparan PNG / JPG • Rasio 1:1
                              </span>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-center">
                              <span className="text-4xl sm:text-5xl mb-1 drop-shadow-xs">{logoUrl || '🏥'}</span>
                              <span className="text-[10px] font-medium text-slate-400">
                                Ikon Standar • Disarankan format PNG 1:1
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200/60">
                        <label className="flex-1 inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-3 rounded-xl cursor-pointer transition-colors shadow-2xs">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{logoUrl && logoUrl !== '🏥' ? 'Ganti Logo' : 'Unggah Logo'}</span>
                          <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setLogoUrl)} className="hidden" />
                        </label>
                        {logoUrl && logoUrl !== '🏥' && (
                          <button
                            type="button"
                            onClick={() => {
                              setLogoUrl('🏥');
                              showToast('Logo direset ke ikon standar 🏥', 'info');
                            }}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold py-2.5 px-3.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Upload Background Foto */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Foto Latar Belakang</span>
                          {fotoPuskesmasUrl ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Foto Jelas & Aktif
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                              Belum Ada Foto
                            </span>
                          )}
                        </div>

                        {/* Foto Preview Jelas */}
                        <div className="w-full h-32 sm:h-36 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden relative shadow-inner group">
                          {fotoPuskesmasUrl ? (
                            <>
                              <img 
                                src={fotoPuskesmasUrl} 
                                alt="Latar Belakang Puskesmas" 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent flex items-end p-2.5">
                                <span className="text-[10px] font-bold text-white drop-shadow-xs">
                                  Format Lanskap 16:9 (Foto Jelas)
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-3 text-center">
                              <Upload className="w-6 h-6 text-slate-300 mb-1" />
                              <p className="text-xs font-bold text-slate-500">Belum Ada Foto Latar</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Unggah foto gedung puskesmas untuk latar belakang pasien</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200/60">
                        <label className="flex-1 inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-3 rounded-xl cursor-pointer transition-colors shadow-2xs">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{fotoPuskesmasUrl ? 'Ganti Foto Latar' : 'Unggah Foto Latar'}</span>
                          <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFotoPuskesmasUrl)} className="hidden" />
                        </label>
                        {fotoPuskesmasUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setFotoPuskesmasUrl('');
                              showToast('Foto latar belakang dihapus.', 'info');
                            }}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold py-2.5 px-3.5 rounded-xl border border-rose-200 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. SEKSI LOKASI SPASIAL (GOOGLE MAPS & OSRM) */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        3. Lokasi Google Maps & Koordinat OSRM
                      </h3>
                    </div>
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                      >
                        Buka Maps ↗
                      </a>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      URL / Link Google Maps Loket
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={mapsUrl}
                        onChange={(e) => handleMapsUrlChange(e.target.value)}
                        placeholder="Contoh: https://maps.google.com/?q=-0.5282,102.5853"
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 pl-10"
                      />
                      <MapPin className="w-4 h-4 text-teal-600 absolute left-3.5 top-3.5" />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Mendukung format link Google Maps biasa ataupun link pendek (maps.app.goo.gl). Koordinat akan diekstrak otomatis.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Latitude (Garis Lintang)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={latitude}
                        onChange={(e) => setLatitude(parseFloat(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Longitude (Garis Bujur)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={longitude}
                        onChange={(e) => setLongitude(parseFloat(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. SEKSI PENGUMUMAN DARURAT (LIVE DI LAYAR PASIEN) */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-rose-200 p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-rose-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <h3 className="text-xs font-black text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Bell className="w-4 h-4 text-rose-600" />
                        4. Banner Pengumuman Darurat (Live)
                      </h3>
                    </div>
                    {pengumumanDarurat && (
                      <button
                        type="button"
                        onClick={handleHapusPengumumanDarurat}
                        className="bg-rose-100 hover:bg-rose-200 text-rose-700 text-[11px] font-bold px-3 py-1.5 rounded-xl cursor-pointer flex items-center gap-1 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Hapus Banner
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Pengumuman darurat akan muncul sebagai pita merah tebal di bagian atas layar seluruh pasien secara real-time. Kosongkan jika tidak ada kendala darurat.
                  </p>

                  <input
                    type="text"
                    value={pengumumanDarurat}
                    onChange={(e) => setPengumumanDarurat(e.target.value)}
                    placeholder="Contoh: Loket pendaftaran tutup jam 11:30 WIB karena rapat koordinasi dinas..."
                    className="w-full px-4 py-3 rounded-2xl bg-rose-50/50 border border-rose-200 text-xs sm:text-sm font-medium text-rose-950 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* 5. SEKSI LAYAR DISPLAY PUBLIK (/display) */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-violet-200/80 p-5 sm:p-6 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-violet-100">
                    <span className="w-2 h-2 rounded-full bg-violet-500" />
                    <h3 className="text-xs font-black text-violet-800 uppercase tracking-wider flex items-center gap-1.5">
                      5. Pengaturan Layar Display Publik (/display)
                    </h3>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Layar display publik untuk TV / monitor di ruang tunggu. QR code di layar display akan mengarah ke link yang diisi di bawah. Kosongkan untuk otomatis menggunakan URL web pasien ({typeof window !== 'undefined' ? window.location.origin + '/' : '/'}).
                  </p>

                  {/* Link Custom QR */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Link untuk QR Code Display
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        value={displayQrLink}
                        onChange={(e) => setDisplayQrLink(e.target.value)}
                        placeholder={`Kosongkan = otomatis (${typeof window !== 'undefined' ? window.location.origin + '/' : '/'})`}
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 pl-10"
                      />
                      <QrCode className="w-4 h-4 text-violet-500 absolute left-3.5 top-3.5" />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Contoh: <span className="font-mono text-violet-600">https://antrean-puskesmas.web.app/</span> — isi link web pasien atau link khusus bisnis lainnya.
                    </p>
                  </div>

                  {/* Preview QR */}
                  {(displayQrLink || typeof window !== 'undefined') && (
                    <div className="flex items-center gap-4 p-4 bg-violet-50/60 border border-violet-200/60 rounded-2xl">
                      <div className="shrink-0">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(displayQrLink || (typeof window !== 'undefined' ? window.location.origin + '/' : '/'))}&margin=4&color=5b21b6&bgcolor=ffffff&format=svg`}
                          alt="Preview QR"
                          width={80}
                          height={80}
                          className="rounded-xl border border-violet-200 bg-white"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-violet-800 mb-0.5">Pratinjau QR Code</p>
                        <p className="text-[11px] text-violet-600 font-mono break-all leading-snug">
                          {displayQrLink || (typeof window !== 'undefined' ? window.location.origin + '/' : '/')}
                        </p>
                        <a
                          href="/display"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-violet-700 underline underline-offset-2 hover:text-violet-900"
                        >
                          <ExternalLink className="w-3 h-3" /> Buka Layar Display ↗
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Toggle Suara Display */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${displaySoundEnabled ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500'}`}>
                        {displaySoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Suara Notifikasi Layar Display</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {displaySoundEnabled
                            ? 'Chime medis akan berbunyi otomatis di layar display saat ada panggilan baru'
                            : 'Layar display akan senyap — tidak ada suara notifikasi'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDisplaySoundEnabled(!displaySoundEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer shrink-0 ${displaySoundEnabled ? 'bg-violet-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${displaySoundEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                {/* Tombol Simpan Bawah */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-7 py-3.5 rounded-2xl text-xs shadow-md shadow-teal-600/20 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Simpan Seluruh Pengaturan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      loadAdminData();
                      showToast('Perubahan pengaturan dibatalkan.', 'info');
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 py-3.5 rounded-2xl text-xs transition-all cursor-pointer flex items-center gap-2 border border-slate-200"
                  >
                    <RotateCcw className="w-4 h-4" /> Batalkan
                  </button>
                </div>

              </div>

            </div>

          </form>
        )}

        {/* ================= TAB 3: EKSPOR LAPORAN CSV / EXCEL ================= */}
        {activeMenu === 'laporan' && (
          <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-xs border border-slate-200/80 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base">Ekspor Laporan Antrean</h2>
                <p className="text-xs text-slate-400">
                  Unduh rekapan data antrean pasien untuk kebutuhan laporan berkala loket.
                </p>
              </div>
            </div>

            {/* Filter Periode */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full overflow-hidden">
              <div className="w-full sm:w-auto">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Pilih Periode
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 w-full sm:w-auto">
                  {['HARIAN', 'BULANAN', 'TAHUNAN', 'SEMUA'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setFilterPeriode(p)}
                      className={`px-3 py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                        filterPeriode === p 
                          ? 'bg-teal-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tombol Ekspor CSV / Excel Sederhana */}
              <button
                onClick={exportToCSV}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-6 py-3.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Ekspor File CSV / Excel
              </button>
            </div>

            {/* TABEL PREVIEW LAPORAN (SINKRON DENGAN FILE CSV) */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  Tabel Data Laporan ({getFilteredReportRows().length} Pasien)
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  Periode: <strong className="text-teal-700">{filterPeriode}</strong>
                </span>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center">No</th>
                      <th className="px-4 py-3">Nomor Antrean</th>
                      <th className="px-4 py-3">Nama Pasien</th>
                      <th className="px-4 py-3">Jam Daftar</th>
                      <th className="px-4 py-3">Jam Selesai</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {getFilteredReportRows().length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400">
                          Tidak ada data antrean untuk periode {filterPeriode}.
                        </td>
                      </tr>
                    ) : (
                      getFilteredReportRows().map((row, idx) => (
                        <tr key={row.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <span className="bg-teal-50 border border-teal-200 text-teal-800 font-black px-2.5 py-1 rounded-lg text-xs">
                              {row.nomor}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">{row.nama}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.created_at ? new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.finished_at ? new Date(row.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                              row.status === 'SELESAI' ? 'bg-emerald-100 text-emerald-800' :
                              row.status === 'MEMANGGIL' ? 'bg-blue-100 text-blue-800' :
                              row.status === 'TERLAMBAT' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 leading-relaxed">
              <span className="font-bold text-slate-800 block mb-1">Informasi Kolom Laporan:</span>
              File CSV / Excel berisi kolom yang sinkron: <strong>No</strong>, <strong>Nomor Antrean</strong>, <strong>Nama Pasien</strong>, <strong>Jam Daftar</strong>, dan <strong>Jam Selesai</strong>.
            </div>
          </div>
        )}

        {/* ================= TAB 4: GANTI SANDI ADMIN (2-Kolom Seimbang & Rapi) ================= */}
        {activeMenu === 'sandi' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start animate-fade-in">
            
            {/* KOLOM KIRI: INFO AKUN & CEK SANDI SAAT INI */}
            <div className="lg:col-span-5 space-y-6">
              {/* Header & Info Username Disensor */}
              <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-7">
                <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 border border-teal-100 shadow-2xs">
                    <Key className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-black text-slate-900 text-lg">Keamanan & Sandi Loket</h2>
                    <p className="text-xs text-slate-400">Kredensial akun petugas tersinkronisasi di Supabase</p>
                  </div>
                </div>

                {/* 1. Status Akun Terdaftar (Aman & Terenkripsi) */}
                <div className="mt-5 bg-teal-50/70 border border-teal-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-teal-950">
                        Kredensial Akun Petugas:
                      </p>
                      <p className="text-[11px] text-teal-700">
                        Username & kata sandi dirahasiakan & terenkripsi di database
                      </p>
                    </div>
                  </div>

                  <div className="w-full flex items-center justify-between gap-2 bg-white border border-teal-200 px-3.5 py-2 rounded-xl shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span className="font-mono font-black text-slate-700 text-xs tracking-widest">
                      ••••••••••••
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200 srink-0">
                      Terlindungi
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. FITUR INTIP / CEK PASSWORD SAAT INI (Wajib Masukkan Username Manual) */}
              <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-7">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Lihat Kata Sandi Saat Ini
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Masukkan username Anda secara manual dengan benar untuk membuka dan melihat kata sandi aktif saat ini.
                </p>

                <form onSubmit={handleVerifyUsernameForPassword} autoComplete="off" className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      name="sec_verify_username_field"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      readOnly
                      onFocus={(e) => e.target.removeAttribute('readOnly')}
                      value={verifyUsernameInput}
                      onChange={(e) => {
                        setVerifyUsernameInput(e.target.value);
                        setIsPassVerifiedAndRevealed(false);
                      }}
                      placeholder="Masukkan username Anda di sini..."
                      className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                      required
                    />
                    <button
                      type="submit"
                      className="bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-sm shrink-0 flex items-center justify-center gap-1.5"
                    >
                      <ShieldCheck className="w-4 h-4 text-teal-400" />
                      Buka Sandi
                    </button>
                  </div>
                </form>

                {/* Tampilan Sandi Jika Username Cocok */}
                {isPassVerifiedAndRevealed ? (
                  <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 animate-fade-in flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-emerald-900">Kata Sandi Terbuka:</p>
                      <p className="font-mono text-base font-black text-emerald-950 tracking-wider mt-0.5">
                        {showRevealedPassword ? savedPass : '••••••••••••'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowRevealedPassword(!showRevealedPassword)}
                      className="inline-flex items-center gap-1 bg-white hover:bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs font-bold cursor-pointer transition-all shadow-2xs"
                    >
                      {showRevealedPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showRevealedPassword ? 'Sembunyikan' : 'Tampilkan'}</span>
                    </button>
                  </div>
                ) : verifyUsernameInput && (
                  <p className="text-[11px] text-slate-400 mt-2 italic">
                    * Ketikkan username akun yang cocok lalu klik &quot;Buka Sandi&quot;.
                  </p>
                )}
              </div>
            </div>

            {/* KOLOM KANAN: FORM GANTI PASSWORD BARU */}
            <div className="lg:col-span-7 bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-7 overflow-hidden">
              <div>
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                  <Key className="w-4 h-4 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Perbarui Kata Sandi Baru
                  </h3>
                </div>

                <form onSubmit={handleUpdatePassword} autoComplete="off" className="space-y-4">
                  {/* 1. Password Saat Ini (Kosong manual) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      1. Masukkan Password Saat Ini
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPass ? 'text' : 'password'}
                        name="sec_pwd_curr_manual"
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        readOnly
                        onFocus={(e) => e.target.removeAttribute('readOnly')}
                        value={currentPass}
                        onChange={(e) => setCurrentPass(e.target.value)}
                        placeholder="Ketik password saat ini..."
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium pr-11 text-slate-800"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* 2. Password Baru */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      2. Password Baru (Min. 6 Karakter)
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        name="sec_pwd_new_manual"
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        readOnly
                        onFocus={(e) => e.target.removeAttribute('readOnly')}
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="Ketik password baru..."
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium pr-11 text-slate-800"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* 3. Konfirmasi Password Baru */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      3. Konfirmasi Ulang Password Baru
                    </label>
                    <input
                      type="password"
                      name="sec_pwd_conf_manual"
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      readOnly
                      onFocus={(e) => e.target.removeAttribute('readOnly')}
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      placeholder="Ulangi password baru persis..."
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                      required
                      minLength={6}
                    />
                  </div>

                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={isChangingPass}
                      className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md shadow-teal-600/20 cursor-pointer transition-all flex items-center justify-center gap-2"
                    >
                      {isChangingPass ? (
                        'Menyimpan Sandi ke Supabase...'
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Simpan Perubahan Sandi Baru
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                <p className="text-[11px] text-slate-400">
                  Data kredensial baru akan langsung disinkronkan ke tabel pengaturan di Supabase.
                </p>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ================= MODAL RESET SIKLUS HARIAN ================= */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <RefreshCw className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-2">
              Tutup & Reset Siklus Harian?
            </h3>
            
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Tindakan ini akan <strong>menutup loket pendaftaran</strong> dan <strong>mengarsipkan antrean hari ini</strong>. Hanya data pasien yang berstatus <strong>SELESAI</strong> yang disimpan dalam riwayat laporan. Antrean baru berikutnya akan dimulai kembali dari nomor <strong>A01</strong> saat loket dibuka kembali.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={handleResetSiklusHarian}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-rose-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                Ya, Tutup & Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI KELUAR ADMIN ================= */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <LogOut className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-2">Keluar dari Panel Admin?</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Sesi login petugas akan diakhiri. Anda perlu memasukkan kredensial kembali untuk mengelola loket antrean.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutModal(false);
                  setIsLoggedIn(false);
                  sessionStorage.removeItem('admin_is_logged_in');
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-rose-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL PANDUAN INSTALL PWA ADMIN ================= */}
      {showPwaInstallGuideModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-200">
              <Smartphone className="w-7 h-7" />
            </div>

            <h3 className="text-base font-black text-slate-900 mb-2">Pasang Aplikasi Web (PWA)</h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed text-left">
              Tambahkan panel admin ke Layar Utama komputer atau ponsel untuk akses cepat tanpa mengetik URL dan menerima peringatan sistem:
            </p>

            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 text-left text-xs text-slate-700 space-y-2 mb-5">
              <div className="flex items-start gap-2">
                <span className="font-black text-teal-600">•</span>
                <span><strong>Komputer (Desktop Chrome/Edge):</strong> Klik ikon <strong>Install</strong> di sisi kanan bilah alamat (URL bar) atau menu browser ➔ Install App.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-black text-teal-600">•</span>
                <span><strong>Android (Chrome):</strong> Klik menu titik tiga di kanan atas ➔ pilih <strong>Tambahkan ke Layar Utama</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-black text-teal-600">•</span>
                <span><strong>iPhone / iPad (Safari):</strong> Klik tombol <strong>Bagikan (Share)</strong> ➔ geser dan pilih <strong>Tambahkan ke Layar Utama</strong>.</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPwaInstallGuideModal(false)}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-xs"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
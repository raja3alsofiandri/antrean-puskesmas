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
  RotateCcw,
  ExternalLink,
  QrCode,
  Monitor,
  AlertTriangle,
  UserPlus,
  Ban,
  Mail,
  Trash2,
  Shield,
  Megaphone,
  Menu
} from 'lucide-react';
import { 
  supabase, 
  isSupabaseConfigured,
  parseGoogleMapsCoordinates,
  calculateActualDurationMinutes,
  logCallEvent,
  DEFAULT_TENANT_ID
} from '@/lib/supabaseClient';
import { 
  registerServiceWorker, 
  requestNotificationPermission, 
  sendSystemNotification, 
  playNotificationChime,
  unlockAudio
} from '@/lib/pwa';
import { 
  ucapkanSuaraManusia, 
  susunKalimatPanggilan,
  stopAllSpeech
} from '@/lib/tts';

export default function AdminPage() {
  // -------------------------------------------------------------
  // State Autentikasi & Akun Petugas (Aman - Terverifikasi Server)
  // -------------------------------------------------------------
  const [isMounted, setIsMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [adminUsername, setAdminUsername] = useState('Petugas Loket');
  const [adminEmail, setAdminEmail] = useState('');
  const [activeMenu, setActiveMenu] = useState('antrean'); // 'antrean' | 'profil' | 'laporan' | 'sandi'
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar drawer

  // Toggle Suara Admin
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Sinkronisasi Sesi Server & Preferensi Lokal Setelah Komponen Ter-Mount
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      document.documentElement.classList.remove('dark');
      localStorage.removeItem('theme_mode');
      localStorage.removeItem('antrean_dark_mode');
      // Bersihkan password plain text dari penyimpanan lokal lama jika pernah tersimpan
      localStorage.removeItem('admin_password');

      const snd = localStorage.getItem('admin_sound_enabled');
      if (snd !== null) {
        setSoundEnabled(snd === 'true');
      }

      const savedLastImport = localStorage.getItem('antrean_ai_last_import');
      if (savedLastImport) {
        try { setRiwayatImporTerakhir(JSON.parse(savedLastImport)); } catch {}
      }

      // Verifikasi sesi server yang sah melalui endpoint httpOnly cookie
      fetch('/api/auth/sesi')
        .then((res) => res.json())
        .then((resData) => {
          if (resData.terautentikasi && resData.pengguna) {
            setIsLoggedIn(true);
            if (resData.pengguna.username) setAdminUsername(resData.pengguna.username);
            if (resData.pengguna.email) setAdminEmail(resData.pengguna.email);
            sessionStorage.setItem('admin_is_logged_in', 'true');
          } else {
            setIsLoggedIn(false);
            sessionStorage.removeItem('admin_is_logged_in');
          }
        })
        .catch(() => {
          // Fallback offline: periksa sessionStorage hanya jika koneksi gagal
          const logged = sessionStorage.getItem('admin_is_logged_in') === 'true';
          if (logged) setIsLoggedIn(true);
        });

      // Deteksi jika halaman dibuka dari tautan reset password email
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('type=recovery') || search.includes('mode=reset_password') || hash.includes('access_token')) {
        setIsResetPasswordMode(true);
      }
    }

    if (isSupabaseConfigured && supabase?.auth) {
      const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsResetPasswordMode(true);
        }
      });
      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  // State Ganti Sandi Form (Aman)
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Jam Digital Realtime
  const [realtimeClock, setRealtimeClock] = useState('');

  // PWA Install Prompt di Admin
  const [deferredAdminPrompt, setDeferredAdminPrompt] = useState(null);
  const [isAdminAppInstalled, setIsAdminAppInstalled] = useState(false);

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

  // State Modal Batalkan Antrean
  const [showBatalModal, setShowBatalModal] = useState(false);
  const [itemAkanDibatalkan, setItemAkanDibatalkan] = useState(null);
  const [teksKonfirmasiBatal, setTeksKonfirmasiBatal] = useState('');
  const [isSubmittingBatal, setIsSubmittingBatal] = useState(false);

  // State Modal Tambah Antrean Manual
  const [showTambahAntreanModal, setShowTambahAntreanModal] = useState(false);
  const [namaPengunjungBaru, setNamaPengunjungBaru] = useState('');
  const [isSubmittingTambah, setIsSubmittingTambah] = useState(false);

  // State Modal Konfirmasi Web (Pengganti alert/confirm browser)
  const [showModalSimpanPengaturan, setShowModalSimpanPengaturan] = useState(false);
  const [showModalBatalEdit, setShowModalBatalEdit] = useState(false);
  const [showModalHapusPengumuman, setShowModalHapusPengumuman] = useState(false);
  const [showModalKonfirmasiGantiSandi, setShowModalKonfirmasiGantiSandi] = useState(false);

  // State Lupa Sandi & Pemulihan via Email
  const [showLupaSandiModal, setShowLupaSandiModal] = useState(false);
  const [lupaSandiEmail, setLupaSandiEmail] = useState('');
  const [isSubmittingLupaSandi, setIsSubmittingLupaSandi] = useState(false);

  // State Tambah Akun Admin Baru & Konfirmasi
  const [emailAkunBaru, setEmailAkunBaru] = useState('');
  const [passwordAkunBaru, setPasswordAkunBaru] = useState('');
  const [showPasswordAkunBaru, setShowPasswordAkunBaru] = useState(false);
  const [isSubmittingTambahAkun, setIsSubmittingTambahAkun] = useState(false);
  const [showModalKonfirmasiTambahAkun, setShowModalKonfirmasiTambahAkun] = useState(false);

  // State Daftar & Hapus Akun Petugas (Konfirmasi 2x)
  const [daftarAkunPetugas, setDaftarAkunPetugas] = useState([]);
  const [isLoadingDaftarAkun, setIsLoadingDaftarAkun] = useState(false);
  const [showModalHapusAkun, setShowModalHapusAkun] = useState(false);
  const [targetAkunHapus, setTargetAkunHapus] = useState('');
  const [tahapHapusAkun, setTahapHapusAkun] = useState(1); // 1 = ketik email, 2 = ketik HAPUS AKUN
  const [inputEmailHapus, setInputEmailHapus] = useState('');
  const [inputTeksHapus, setInputTeksHapus] = useState('');
  const [isSubmittingHapusAkun, setIsSubmittingHapusAkun] = useState(false);

  // State Mode Pemulihan Password dari Email Link
  const [isResetPasswordMode, setIsResetPasswordMode] = useState(false);
  const [resetPassBaru, setResetPassBaru] = useState('');
  const [resetPassKonfirm, setResetPassKonfirm] = useState('');
  const [showResetPassBaru, setShowResetPassBaru] = useState(false);
  const [showResetPassKonfirm, setShowResetPassKonfirm] = useState(false);
  const [isSubmittingResetPass, setIsSubmittingResetPass] = useState(false);

  // Filter & Pemilih Periode Laporan CSV
  const [filterPeriode, setFilterPeriode] = useState('HARIAN'); // 'HARIAN' | 'BULANAN' | 'TAHUNAN' | 'SEMUA'
  const [selectedTanggal, setSelectedTanggal] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedBulan, setSelectedBulan] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [selectedTahun, setSelectedTahun] = useState(() => String(new Date().getFullYear()));

  // State Import CSV & Pelatihan Ulang Model AI
  const [isRetrainingAI, setIsRetrainingAI] = useState(false);
  const [retrainResult, setRetrainResult] = useState(null);
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const csvFileInputRef = useRef(null);

  // State Profil, Media & Pengumuman Organisasi (Default Universal)
  // -------------------------------------------------------------
  const [namaOrganisasi, setNamaOrganisasi] = useState(process.env.NEXT_PUBLIC_ORGANISASI_NAMA || 'Loket Pelayanan Terpadu');
  const [alamatOrganisasi, setAlamatOrganisasi] = useState(process.env.NEXT_PUBLIC_ORGANISASI_ALAMAT || 'Jl. Pelayanan Publik No. 1, Kota Layanan');
  const [logoUrl, setLogoUrl] = useState('🏢');
  const [fotoOrganisasiUrl, setFotoOrganisasiUrl] = useState('');
  const [infoPenting, setInfoPenting] = useState('Wajib membawa KTP atau Kartu Identitas fisik saat datang ke loket.');
  const [statusBuka, setStatusBuka] = useState(true);
  const [pengumumanDarurat, setPengumumanDarurat] = useState('');
  const [mapsUrl, setMapsUrl] = useState('https://maps.google.com/?q=-0.5282,102.5853');
  const [latitude, setLatitude] = useState(-0.5282);
  const [longitude, setLongitude] = useState(102.5853);
  // Pengaturan Layar Display Publik
  const [displayQrLink, setDisplayQrLink] = useState('');         // Link custom untuk QR di /display
  const [displaySoundEnabled, setDisplaySoundEnabled] = useState(true); // Suara chime di /display
  const [activePreviewTab, setActivePreviewTab] = useState('pengunjung'); // 'pengunjung' | 'display'

  // State untuk menyimpan nilai terakhir yang tersimpan (untuk batalkan)
  const [lastSavedConfig, setLastSavedConfig] = useState(null);

  // State Estimasi Waktu Tunggu Live (AI) & Evaluasi Simulasi Historis
  const [liveAiEstimate, setLiveAiEstimate] = useState(null);
  const [isLoadingAiEstimate, setIsLoadingAiEstimate] = useState(false);
  const [evaluasiSimulasi, setEvaluasiSimulasi] = useState(null);
  const [statusAiModel, setStatusAiModel] = useState({
    model_aktif: false,
    total_dataset: 0,
    status: 'STANDAR_BAWAAN',
    versi: 'vStandar_Bawaan',
  });

  // State Pengelolaan Data Pelatihan AI & Riwayat Impor
  const [showModalResetAI, setShowModalResetAI] = useState(false);
  const [isResettingAI, setIsResettingAI] = useState(false);
  const [showDetailSimulasiModal, setShowDetailSimulasiModal] = useState(false);
  const [riwayatImporTerakhir, setRiwayatImporTerakhir] = useState(null);

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
      // Gunakan nada lonceng loket yang sama persis dengan suara panggilan pengunjung
      playNotificationChime();
      showToast('Suara pemanggilan loket aktif 🔊', 'success');
    } else {
      stopAllSpeech();
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

  const panggilAntreanTTS = useCallback((nomor, nama, panggilanKe = 1) => {
    if (!soundEnabled) return;

    // Chime dulu (notifikasi loket), lalu suara panggilan 550ms kemudian
    playNotificationChime();
    const kalimat = susunKalimatPanggilan(nomor, nama, panggilanKe);
    ucapkanSuaraManusia(kalimat, { delayMs: 550 }).catch((e) => {
      console.warn('TTS Admin error:', e);
    });
  }, [soundEnabled]);

  // -------------------------------------------------------------
  // 2. Fetch Data Antrean & Pengaturan dari Supabase
  // -------------------------------------------------------------
  const loadAntreanData = useCallback(async () => {
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
      } catch (err) {
        console.error('Error load antrean:', err);
      }
    } else {
      const savedQueue = localStorage.getItem('antrean_local_db');
      if (savedQueue) {
        try { setDaftarAntrean(JSON.parse(savedQueue)); } catch { /* ignore */ }
      }
    }
  }, []);

  const loadConfigData = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: cfgData } = await supabase
          .from('pengaturan')
          .select('*')
          .eq('id', 'pengaturan_organisasi')
          .maybeSingle();

        if (cfgData) {
          const namaOrg = cfgData.nama_organisasi || 'Loket Pelayanan Terpadu';
          const alamatOrg = cfgData.alamat_organisasi || 'Jl. Pelayanan Publik No. 1';
          const fotoOrg = cfgData.foto_organisasi_url || '';

          const cfg = {
            namaOrganisasi: namaOrg,
            alamatOrganisasi: alamatOrg,
            logoUrl: cfgData.logo_url || '🏢',
            fotoOrganisasiUrl: fotoOrg,
            infoPenting: cfgData.info_penting || '',
            statusBuka: cfgData.status_buka ?? true,
            pengumumanDarurat: cfgData.pengumuman_darurat || '',
            mapsUrl: cfgData.maps_url || 'https://maps.google.com/?q=-0.5282,102.5853',
            latitude: cfgData.latitude ? parseFloat(cfgData.latitude) : -0.5282,
            longitude: cfgData.longitude ? parseFloat(cfgData.longitude) : 102.5853,
            displayQrLink: cfgData.display_qr_link || '',
            displaySoundEnabled: cfgData.display_sound_enabled ?? true,
          };

          setNamaOrganisasi(cfg.namaOrganisasi);
          setAlamatOrganisasi(cfg.alamatOrganisasi);
          setLogoUrl(cfg.logoUrl);
          setFotoOrganisasiUrl(cfg.fotoOrganisasiUrl);
          setInfoPenting(cfg.infoPenting);
          setStatusBuka(cfg.statusBuka);
          setPengumumanDarurat(cfg.pengumumanDarurat);
          setMapsUrl(cfg.mapsUrl);
          setLatitude(cfg.latitude);
          setLongitude(cfg.longitude);
          setDisplayQrLink(cfg.displayQrLink);
          setDisplaySoundEnabled(cfg.displaySoundEnabled);

          // Simpan snapshot config tersimpan untuk fungsi batalkan
          setLastSavedConfig(cfg);
        }
      } catch (err) {
        console.error('Error load config data:', err);
      }
    } else {
      const savedCfg = localStorage.getItem('pengaturan_organisasi');
      if (savedCfg) {
        try {
          const parsed = JSON.parse(savedCfg);
          if (parsed.namaOrganisasi) setNamaOrganisasi(parsed.namaOrganisasi);
          if (parsed.alamatOrganisasi) setAlamatOrganisasi(parsed.alamatOrganisasi);
          if (parsed.logoUrl) setLogoUrl(parsed.logoUrl);
          if (parsed.fotoOrganisasiUrl) setFotoOrganisasiUrl(parsed.fotoOrganisasiUrl);
          if (parsed.statusBuka !== undefined) setStatusBuka(parsed.statusBuka);
          if (parsed.pengumumanDarurat !== undefined) setPengumumanDarurat(parsed.pengumumanDarurat);
          setLastSavedConfig(parsed);
        } catch { /* ignore */ }
      }
    }
  }, []);

  const loadAdminData = useCallback(async () => {
    await Promise.all([loadAntreanData(), loadConfigData()]);
  }, [loadAntreanData, loadConfigData]);

  // -------------------------------------------------------------
  // 3. Supabase Realtime Sinkronisasi
  // -------------------------------------------------------------
  useEffect(() => {
    registerServiceWorker();
    requestNotificationPermission();

    // Initial load antrean dan config saat pertama kali dibuka
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
              showToast(`Pengunjung baru mendaftar: ${payload.new.nomor} - ${payload.new.nama}`, 'success');
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
          () => {
            // Pengaturan realtime listener
          }
        )
        .subscribe();

      // Polling 15 detik HANYA untuk antrean pengunjung — TIDAK MENIMPA FORM PENGATURAN ADMIN
      const pollInterval = setInterval(() => {
        loadAntreanData();
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
          if (event.data?.type === 'UPDATE_ALL') loadAntreanData();
        };
        return () => {
          clearTimeout(timer);
          bc.close();
        };
      }
      return () => clearTimeout(timer);
    }
  }, [loadAdminData, loadAntreanData]);

  // -------------------------------------------------------------
  // 4a. Estimasi Waktu Tunggu Live (AI) & Evaluasi Simulasi
  // -------------------------------------------------------------
  const loadLiveAiEstimate = useCallback(async (antreanDepan) => {
    setIsLoadingAiEstimate(true);
    try {
      const res = await fetch('/api/ml/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          antrean_di_depan: Math.max(0, antreanDepan),
          rata_waktu_pelayanan: 7.0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiveAiEstimate(data);
      }
    } catch (err) {
      console.warn('[loadLiveAiEstimate] Error:', err);
    } finally {
      setIsLoadingAiEstimate(false);
    }
  }, []);

  const loadStatusAiModel = useCallback(async () => {
    try {
      const res = await fetch('/api/ml/status');
      if (res.ok) {
        const data = await res.json();
        setStatusAiModel(data);
        if (!data.model_aktif) {
          setRiwayatImporTerakhir(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('antrean_ai_last_import');
          }
        }
      }
    } catch (err) {
      console.warn('[loadStatusAiModel] Error:', err);
    }
  }, []);

  const loadEvaluasiSimulasi = useCallback(async () => {
    try {
      const res = await fetch('/api/ml/evaluasi');
      if (res.ok) {
        const data = await res.json();
        if (data.tersedia) {
          setEvaluasiSimulasi(data);
        }
      }
    } catch (err) {
      console.warn('[loadEvaluasiSimulasi] Error:', err);
    }
  }, []);

  useEffect(() => {
    if (activeMenu === 'laporan') {
      const antreanDepan = daftarAntrean.filter((q) => q.status === 'MENUNGGU').length;
      loadLiveAiEstimate(antreanDepan);
      loadEvaluasiSimulasi();
      loadStatusAiModel();
    }
  }, [activeMenu, daftarAntrean, loadLiveAiEstimate, loadEvaluasiSimulasi, loadStatusAiModel]);

  // -------------------------------------------------------------
  // 4. Identifikasi Antrean Aktif & Siklus
  // -------------------------------------------------------------
  const antreanAktif = daftarAntrean.filter((q) => !q.is_archived && q.status !== 'SELESAI' && q.status !== 'DIBATALKAN');
  const antreanMemanggil = antreanAktif.find((q) => q.status === 'MEMANGGIL');
  const antreanTeratas = antreanMemanggil || antreanAktif[0] || null;
  const adaAntreanAktif = antreanAktif.length > 0 && Boolean(antreanTeratas);

  // -------------------------------------------------------------
  // Helper: Panggil Antrean Tertentu Secara Langsung
  // -------------------------------------------------------------
  const panggilAntreanTertentu = async (targetItem, count = 1) => {
    if (!targetItem) return;
    const nowIso = new Date().toISOString();

    // 1. Suara panggil & notifikasi loket instan
    panggilAntreanTTS(targetItem.nomor, targetItem.nama, count);
    sendSystemNotification(
      `🔊 Panggilan Loket: ${targetItem.nomor}`,
      `Nomor antrean ${targetItem.nomor} (${targetItem.nama}) dipanggil ke loket pelayanan!`
    );

    // 2. Optimistic local update agar UI langsung responsif seketika
    setDaftarAntrean((prev) =>
      prev.map((q) =>
        q.id === targetItem.id
          ? { ...q, status: 'MEMANGGIL', panggilan_ke: count, last_called_at: nowIso }
          : q
      )
    );

    // 3. Eksekusi ke server API yang aman
    try {
      const res = await fetch('/api/antrean/aksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'PANGGIL',
          data: { id: targetItem.id, panggilan_ke: count },
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (res.ok && resData.sukses) {
        showToast(`Memanggil ${targetItem.nomor} - ${targetItem.nama} (${count}x)`, 'success');
      } else {
        if (isSupabaseConfigured && supabase) {
          await supabase
            .from('antrean')
            .update({
              status: 'MEMANGGIL',
              panggilan_ke: count,
              last_called_at: nowIso,
            })
            .eq('id', targetItem.id);
          logCallEvent(targetItem.id, count).catch(() => {});
        }
        showToast(`Memanggil ${targetItem.nomor} - ${targetItem.nama} (${count}x)`, 'success');
      }
    } catch (err) {
      console.warn('Panggilan via API dialihkan ke fallback lokal:', err);
      const updated = daftarAntrean.map((q) =>
        q.id === targetItem.id
          ? { ...q, status: 'MEMANGGIL', panggilan_ke: count, last_called_at: nowIso }
          : q
      );
      localStorage.setItem('antrean_local_db', JSON.stringify(updated));
      showToast(`Memanggil ${targetItem.nomor} - ${targetItem.nama} (${count}x)`, 'success');
    }
  };

  // -------------------------------------------------------------
  // 5. 4 TOMBOL MASTER KONTROL (RINGKAS & TERINTEGRASI)
  // -------------------------------------------------------------

  // TOMBOL 1: PANGGIL ANTREAN (Include Lewati & Panggil Berikutnya di Klik ke-4)
  const handlePanggilUlang = async () => {
    if (!antreanTeratas || antreanAktif.length === 0) {
      showToast('Tidak ada antrean pengunjung yang aktif saat ini.', 'info');
      return;
    }

    const currentCount = antreanTeratas.panggilan_ke || 0;

    // Jika sudah 3x dipanggil, klik ke-4 otomatis lewati antrean & panggil berikutnya!
    if (currentCount >= 3) {
      showToast(`⚠️ ${antreanTeratas.nomor} telah dipanggil 3x. Otomatis dilewati ke antrean berikutnya!`, 'alert');
      await handleLewatiAntrean(antreanTeratas);
      return;
    }

    const nextCount = currentCount + 1;
    await panggilAntreanTertentu(antreanTeratas, nextCount);
  };

  // Helper: Lewati Antrean
  const handleLewatiAntrean = async (targetAntrean = antreanTeratas) => {
    if (!targetAntrean) return;

    const waitingAfter = antreanAktif.filter(
      (q) => q.id !== targetAntrean.id && (q.status === 'MENUNGGU' || q.status === 'TERLAMBAT')
    );

    let newUrutan = (targetAntrean.urutan ?? 0) + 10;
    if (waitingAfter.length >= 2) {
      newUrutan = (waitingAfter[1].urutan ?? 0) + 1;
    } else if (waitingAfter.length === 1) {
      newUrutan = (waitingAfter[0].urutan ?? 0) + 1;
    }

    // Optimistic local update
    setDaftarAntrean((prev) =>
      prev.map((q) =>
        q.id === targetAntrean.id ? { ...q, status: 'TERLAMBAT', urutan: newUrutan } : q
      )
    );

    try {
      await fetch('/api/antrean/aksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'LEWATI',
          data: { id: targetAntrean.id, urutan: newUrutan },
        }),
      });
    } catch (_) {
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('antrean')
          .update({ status: 'TERLAMBAT', urutan: newUrutan })
          .eq('id', targetAntrean.id)
          .catch(() => {});
      }
    }

    showToast(`⏭️ ${targetAntrean.nomor} dilewati antreannya`, 'alert');

    // Otomatis panggil antrean berikutnya jika ada
    if (waitingAfter.length > 0) {
      const nextOne = waitingAfter[0];
      setTimeout(() => {
        panggilAntreanTertentu(nextOne, 1);
      }, 700);
    }
  };

  // TOMBOL 2: SELESAI (Include Panggil Berikutnya Secara Otomatis)
  const handleTandaiSelesai = async (customTarget = null) => {
    const targetDone = customTarget || antreanTeratas;
    if (!targetDone) {
      showToast('Tidak ada antrean pengunjung aktif yang sedang dilayani.', 'info');
      return;
    }

    const nowIso = new Date().toISOString();
    const durasi = calculateActualDurationMinutes(targetDone.created_at, nowIso);

    const nextCandidates = antreanAktif.filter(
      (q) => q.id !== targetDone.id && (q.status === 'MENUNGGU' || q.status === 'TERLAMBAT')
    );

    // Optimistic local update
    setDaftarAntrean((prev) =>
      prev.map((q) =>
        q.id === targetDone.id
          ? { ...q, status: 'SELESAI', finished_at: nowIso, durasi_aktual_menit: durasi }
          : q
      )
    );

    try {
      await fetch('/api/antrean/aksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'SELESAI',
          data: { id: targetDone.id, durasi_aktual_menit: durasi },
        }),
      });
    } catch (_) {
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('antrean')
          .update({
            status: 'SELESAI',
            finished_at: nowIso,
            durasi_aktual_menit: durasi,
          })
          .eq('id', targetDone.id)
          .catch(() => {});
      }
    }

    showToast(`✅ ${targetDone.nomor} (${targetDone.nama}) selesai dilayani`, 'success');

    // Otomatis langsung panggil antrean berikutnya jika selesai dari tombol master atas
    if (!customTarget && nextCandidates.length > 0) {
      const nextAntrean = nextCandidates[0];
      setTimeout(() => {
        panggilAntreanTertentu(nextAntrean, 1);
      }, 600);
    } else if (!customTarget && nextCandidates.length === 0) {
      showToast('🎉 Semua antrean telah selesai dilayani!', 'info');
    }
  };

  // TOMBOL 3: TUTUP / BUKA PENDAFTARAN
  const handleTogglePendaftaran = async () => {
    const nextState = !statusBuka;
    setStatusBuka(nextState);

    try {
      await fetch('/api/antrean/aksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'STATUS_BUKA',
          data: { status_buka: nextState },
        }),
      });
    } catch (_) {
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('pengaturan')
          .upsert({ id: 'pengaturan_organisasi', tenant_id: DEFAULT_TENANT_ID, status_buka: nextState })
          .catch(() => {});
      }
    }

    const savedCfg = JSON.parse(localStorage.getItem('pengaturan_organisasi') || '{}');
    savedCfg.statusBuka = nextState;
    localStorage.setItem('pengaturan_organisasi', JSON.stringify(savedCfg));

    showToast(nextState ? 'Pendaftaran Loket DIBUKA' : 'Pendaftaran Loket DITUTUP', 'info');
  };

  // TOMBOL 4: RESET SIKLUS HARIAN (Tutup Loket, Simpan Data SELESAI, Hapus Antrean Belum Selesai)
  const handleResetSiklusHarian = async () => {
    try {
      const res = await fetch('/api/antrean/aksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi: 'RESET_SIKLUS' }),
      });

      if (!res.ok) {
        if (isSupabaseConfigured && supabase) {
          await supabase
            .from('pengaturan')
            .upsert({ id: 'pengaturan_organisasi', tenant_id: DEFAULT_TENANT_ID, status_buka: false });
          await supabase
            .from('antrean')
            .update({ is_archived: true })
            .eq('is_archived', false)
            .eq('status', 'SELESAI');
          await supabase
            .from('antrean')
            .delete()
            .eq('is_archived', false)
            .neq('status', 'SELESAI');
        }
      }

      setStatusBuka(false);
      localStorage.removeItem('antrean_pengunjung');
      const savedCfg = JSON.parse(localStorage.getItem('pengaturan_organisasi') || '{}');
      savedCfg.statusBuka = false;
      localStorage.setItem('pengaturan_organisasi', JSON.stringify(savedCfg));

      await loadAdminData();
      setShowResetModal(false);
      showToast('Siklus ditutup. Data selesai disimpan, antrean yang belum selesai dibersihkan.', 'success');
    } catch (err) {
      console.error('Gagal reset harian:', err);
      showToast('Gagal menutup siklus harian.', 'alert');
    }
  };

  // -------------------------------------------------------------
  // 5B. Pembatalan Antrean (Dengan Konfirmasi Teks)
  // -------------------------------------------------------------
  const handleBukaModalBatal = (item) => {
    setItemAkanDibatalkan(item);
    setTeksKonfirmasiBatal('');
    setShowBatalModal(true);
  };

  const handleKonfirmasiBatal = async () => {
    if (!itemAkanDibatalkan) return;
    if (teksKonfirmasiBatal.trim().toLowerCase() !== 'batalkan') {
      showToast('Ketik kata "batalkan" untuk mengonfirmasi pembatalan.', 'alert');
      return;
    }

    setIsSubmittingBatal(true);
    const targetId = itemAkanDibatalkan.id;
    const nomorTiket = itemAkanDibatalkan.nomor;
    const nowIso = new Date().toISOString();

    // Optimistic local update agar tabel segera bereaksi
    setDaftarAntrean((prev) =>
      prev.map((q) =>
        q.id === targetId
          ? { ...q, status: 'DIBATALKAN', finished_at: nowIso, waktu_dibatalkan: nowIso, alasan_batal: 'Dibatalkan oleh Petugas Loket' }
          : q
      )
    );

    try {
      const res = await fetch('/api/antrean/aksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'BATALKAN',
          data: { id: targetId, alasan: 'Dibatalkan oleh Petugas Loket' },
        }),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok || !resData.sukses) {
        if (isSupabaseConfigured && supabase) {
          await supabase
            .from('antrean')
            .update({
              status: 'DIBATALKAN',
              finished_at: nowIso,
              waktu_dibatalkan: nowIso,
              alasan_batal: 'Dibatalkan oleh Petugas Loket',
            })
            .eq('id', targetId)
            .catch(() => {});
        }
      }

      showToast(`Antrean ${nomorTiket} (${itemAkanDibatalkan.nama}) berhasil dibatalkan.`, 'info');
    } catch (err) {
      console.error('Gagal batalkan antrean:', err);
      showToast('Gagal memproses pembatalan antrean.', 'alert');
    } finally {
      setIsSubmittingBatal(false);
      setShowBatalModal(false);
      setItemAkanDibatalkan(null);
      setTeksKonfirmasiBatal('');
    }
  };

  // -------------------------------------------------------------
  // 5C. Tambah Antrean Manual oleh Petugas Loket
  // -------------------------------------------------------------
  const handleTambahAntreanManual = async (e) => {
    if (e) e.preventDefault();
    const namaBersih = namaPengunjungBaru.trim();
    if (!namaBersih || namaBersih.length < 2) {
      showToast('Nama pengunjung wajib diisi minimal 2 karakter.', 'alert');
      return;
    }

    setIsSubmittingTambah(true);
    try {
      const res = await fetch('/api/antrean/daftar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: namaBersih,
          sumber: 'LOKET',
          organisasiId: DEFAULT_TENANT_ID,
        }),
      });

      const dataRes = await res.json().catch(() => ({}));

      if (res.ok && dataRes.sukses && dataRes.tiket) {
        const tiketBaru = dataRes.tiket;
        setDaftarAntrean((prev) => {
          const exists = prev.some((q) => q.id === tiketBaru.id);
          if (exists) return prev;
          return [...prev, tiketBaru];
        });
        showToast(`Antrean ${tiketBaru.nomor} untuk ${tiketBaru.nama} berhasil didaftarkan!`, 'success');
        setShowTambahAntreanModal(false);
        setNamaPengunjungBaru('');
      } else {
        throw new Error(dataRes.pesan || 'Gagal mendaftarkan antrean baru.');
      }
    } catch (err) {
      console.error('Gagal tambah antrean manual:', err);
      showToast(err.message || 'Gagal mendaftarkan antrean manual.', 'alert');
    } finally {
      setIsSubmittingTambah(false);
    }
  };

  // -------------------------------------------------------------
  // 6. Pengaturan: Simpan & Unggah Media
  // -------------------------------------------------------------
  const handleMapsUrlChange = (url) => {
    setMapsUrl(url);
    if (!url.trim()) {
      // URL dikosongkan — reset koordinat
      setLatitude('');
      setLongitude('');
      return;
    }
    const coords = parseGoogleMapsCoordinates(url);
    if (coords) {
      setLatitude(coords.lat);
      setLongitude(coords.lon);
      showToast(`Koordinat otomatis: ${coords.lat}, ${coords.lon}`, 'success');
    } else {
      // URL diisi tapi tidak ada koordinat yang bisa diekstrak — kosongkan
      setLatitude('');
      setLongitude('');
    }
  };

  const handleFileUpload = (e, targetSetter) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      showToast('Ukuran file maksimal 3 MB!', 'alert');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      targetSetter(reader.result);
      showToast('Gambar berhasil dimuat!', 'success');
    };
    reader.readAsDataURL(file);
  };

  // Konfirmasi Web: Hapus Pengumuman Darurat
  const handleHapusPengumumanDarurat = () => {
    setShowModalHapusPengumuman(true);
  };

  const handleKonfirmasiHapusPengumuman = () => {
    setPengumumanDarurat('');
    setShowModalHapusPengumuman(false);
    showToast('Banner pengumuman darurat telah dikosongkan. Klik Simpan Perubahan untuk menyiarkan.', 'info');
  };

  // Konfirmasi Web: Batalkan Perubahan Form
  const handleBukaModalBatalEdit = () => {
    setShowModalBatalEdit(true);
  };

  const handleKonfirmasiBatalEdit = () => {
    if (!lastSavedConfig) {
      loadConfigData();
    } else {
      setNamaOrganisasi(lastSavedConfig.namaOrganisasi);
      setAlamatOrganisasi(lastSavedConfig.alamatOrganisasi);
      setLogoUrl(lastSavedConfig.logoUrl);
      setFotoOrganisasiUrl(lastSavedConfig.fotoOrganisasiUrl);
      setInfoPenting(lastSavedConfig.infoPenting);
      setPengumumanDarurat(lastSavedConfig.pengumumanDarurat);
      setStatusBuka(lastSavedConfig.statusBuka);
      setMapsUrl(lastSavedConfig.mapsUrl);
      setLatitude(lastSavedConfig.latitude);
      setLongitude(lastSavedConfig.longitude);
      setDisplayQrLink(lastSavedConfig.displayQrLink);
      setDisplaySoundEnabled(lastSavedConfig.displaySoundEnabled);
    }
    setShowModalBatalEdit(false);
    showToast('Semua perubahan formulir telah dibatalkan.', 'info');
  };

  // Konfirmasi Web: Simpan Pengaturan
  const handleBukaModalSimpanPengaturan = () => {
    setShowModalSimpanPengaturan(true);
  };

  const handleKonfirmasiSimpanPengaturan = async () => {
    setShowModalSimpanPengaturan(false);
    await handleSimpanPengaturan();
  };

  const handleSimpanPengaturan = async () => {
    const payload = {
      id: 'pengaturan_organisasi',
      tenant_id: DEFAULT_TENANT_ID,
      nama_organisasi: namaOrganisasi,
      alamat_organisasi: alamatOrganisasi,
      foto_organisasi_url: fotoOrganisasiUrl,
      logo_url: logoUrl,
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

    try {
      const res = await fetch('/api/antrean/aksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aksi: 'SIMPAN_PENGATURAN',
          data: payload,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (res.ok && resData.sukses) {
        showToast('Pengaturan organisasi berhasil disimpan & disiarkan!', 'success');
      } else {
        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase.from('pengaturan').upsert(payload);
          if (error) throw error;
        }
        showToast('Pengaturan organisasi berhasil disimpan!', 'success');
      }

      setLastSavedConfig({
        namaOrganisasi, alamatOrganisasi, logoUrl, fotoOrganisasiUrl,
        infoPenting, pengumumanDarurat, statusBuka, mapsUrl,
        latitude, longitude, displayQrLink, displaySoundEnabled,
      });
    } catch (err) {
      console.error('Gagal simpan pengaturan:', err);
      showToast(`Gagal simpan: ${err?.message || 'Periksa koneksi database'}`, 'alert');
    }

    localStorage.setItem('pengaturan_organisasi', JSON.stringify(payload));
  };


  // -------------------------------------------------------------
  // 7. Unduh Laporan CSV Sederhana & Sinkronisasi Tabel Laporan
  // -------------------------------------------------------------
  const isRowInPeriod = useCallback((row) => {
    if (!row.created_at) return true;
    const d = new Date(row.created_at);

    if (filterPeriode === 'HARIAN') {
      const rowDateStr = d.toISOString().split('T')[0];
      return rowDateStr === selectedTanggal;
    }
    if (filterPeriode === 'BULANAN') {
      const [targetYear, targetMonth] = selectedBulan.split('-').map(Number);
      return d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth;
    }
    if (filterPeriode === 'TAHUNAN') {
      return d.getFullYear() === Number(selectedTahun);
    }
    return true;
  }, [filterPeriode, selectedTanggal, selectedBulan, selectedTahun]);

  // Semua pengunjung pada periode aktif (untuk Ringkasan A & Analisis B)
  const getAllRowsInFilter = useCallback(() => {
    return daftarAntrean.filter(isRowInPeriod);
  }, [daftarAntrean, isRowInPeriod]);

  // Khusus antrean SELESAI pada periode aktif (untuk Pratinjau & Ekspor CSV D)
  const getFilteredReportRows = useCallback(() => {
    return daftarAntrean
      .filter((row) => row.status === 'SELESAI' && isRowInPeriod(row))
      .sort((a, b) => {
        if (filterPeriode === 'TAHUNAN') {
          const dateA = new Date(a.created_at || 0);
          const dateB = new Date(b.created_at || 0);
          const monthDiff = dateA.getMonth() - dateB.getMonth();
          if (monthDiff !== 0) return monthDiff;
          return dateA - dateB;
        }
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      });
  }, [daftarAntrean, isRowInPeriod, filterPeriode]);

  const hitungDurasiWajarRow = (row) => {
    if (row.durasi_aktual_menit) {
      const val = Math.round(Number(row.durasi_aktual_menit));
      if (!isNaN(val) && val > 0 && val <= 60) return val;
    }
    if (row.created_at && row.finished_at) {
      const diffMs = new Date(row.finished_at) - new Date(row.created_at);
      const diffMnt = Math.round(diffMs / 60000);
      if (diffMnt > 0 && diffMnt <= 60) return diffMnt;
    }
    return 7; // Standar bawaan waktu pelayanan loket Puskesmas
  };

  const exportToCSV = () => {
    const filteredRows = getFilteredReportRows();

    if (filteredRows.length === 0) {
      showToast(`Tidak ada data antrean selesai untuk periode: ${filterPeriode}`, 'info');
      return;
    }

    const daftarNamaBulan = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    let filename = '';
    let csvContent = '\uFEFF'; // BOM untuk kompatibilitas UTF-8 Excel

    if (filterPeriode === 'HARIAN') {
      filename = `laporan_antrean_harian_${selectedTanggal}.csv`;
      csvContent += 'No,Nomor Antrean,Nama Pengunjung,Tanggal,Jam Daftar,Jam Selesai,Durasi Pelayanan (Menit),Status\n';

      filteredRows.forEach((row, index) => {
        const d = row.created_at ? new Date(row.created_at) : new Date();
        const tglStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const createdStr = row.created_at 
          ? new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
          : '-';
        const finishedStr = row.finished_at 
          ? new Date(row.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
          : '-';
        const cleanNama = (row.nama || '').replace(/"/g, '""');
        const durasiMenit = hitungDurasiWajarRow(row);

        csvContent += `${index + 1},${row.nomor},"${cleanNama}","${tglStr}","${createdStr}","${finishedStr}",${durasiMenit},"${row.status}"\n`;
      });
    } else if (filterPeriode === 'BULANAN') {
      const [thn, bln] = selectedBulan.split('-');
      const namaBulan = daftarNamaBulan[parseInt(bln, 10) - 1] || bln;
      filename = `laporan_antrean_bulanan_${thn}_${bln}.csv`;
      csvContent += 'No,Nomor Antrean,Nama Pengunjung,Bulan,Tahun,Tanggal,Jam Daftar,Jam Selesai,Durasi Pelayanan (Menit),Status\n';

      filteredRows.forEach((row, index) => {
        const d = row.created_at ? new Date(row.created_at) : new Date();
        const tglStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const createdStr = row.created_at 
          ? new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
          : '-';
        const finishedStr = row.finished_at 
          ? new Date(row.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
          : '-';
        const cleanNama = (row.nama || '').replace(/"/g, '""');
        const durasiMenit = hitungDurasiWajarRow(row);

        csvContent += `${index + 1},${row.nomor},"${cleanNama}","${namaBulan}",${thn},"${tglStr}","${createdStr}","${finishedStr}",${durasiMenit},"${row.status}"\n`;
      });
    } else if (filterPeriode === 'TAHUNAN') {
      filename = `laporan_antrean_tahunan_${selectedTahun}.csv`;
      csvContent += 'No,Nomor Antrean,Nama Pengunjung,Bulan Ke,Nama Bulan,Tahun,Tanggal,Jam Daftar,Jam Selesai,Durasi Pelayanan (Menit),Status\n';

      filteredRows.forEach((row, index) => {
        const d = row.created_at ? new Date(row.created_at) : new Date();
        const bulanKe = d.getMonth() + 1; // 1 s/d 12
        const namaBulan = daftarNamaBulan[d.getMonth()] || `Bulan ${bulanKe}`;
        const tahunStr = d.getFullYear();
        const tglStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const createdStr = row.created_at 
          ? new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
          : '-';
        const finishedStr = row.finished_at 
          ? new Date(row.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
          : '-';
        const cleanNama = (row.nama || '').replace(/"/g, '""');
        const durasiMenit = hitungDurasiWajarRow(row);

        csvContent += `${index + 1},${row.nomor},"${cleanNama}",${bulanKe},"${namaBulan}",${tahunStr},"${tglStr}","${createdStr}","${finishedStr}",${durasiMenit},"${row.status}"\n`;
      });
    } else {
      const todayStr = new Date().toISOString().split('T')[0];
      filename = `laporan_antrean_semua_${todayStr}.csv`;
      csvContent += 'No,Nomor Antrean,Nama Pengunjung,Tanggal,Jam Daftar,Jam Selesai,Durasi Pelayanan (Menit),Status\n';

      filteredRows.forEach((row, index) => {
        const d = row.created_at ? new Date(row.created_at) : new Date();
        const tglStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const createdStr = row.created_at 
          ? new Date(row.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
          : '-';
        const finishedStr = row.finished_at 
          ? new Date(row.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
          : '-';
        const cleanNama = (row.nama || '').replace(/"/g, '""');
        const durasiMenit = hitungDurasiWajarRow(row);

        csvContent += `${index + 1},${row.nomor},"${cleanNama}","${tglStr}","${createdStr}","${finishedStr}",${durasiMenit},"${row.status}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Laporan CSV (${filename}) berhasil diekspor!`, 'success');
  };

  // Handler Pilih Berkas CSV untuk Import & Latih AI
  const handleFileCsvChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        showToast('Berkas harus berekstensi .csv', 'alert');
        return;
      }
      setSelectedCsvFile(file);
      setRetrainResult(null);
    }
  };

  // Handler Kirim CSV untuk Memperbarui Model AI
  const handleProsesImportDanLatihAI = async () => {
    if (!selectedCsvFile) {
      showToast('Pilih berkas CSV riwayat antrean terlebih dahulu!', 'alert');
      return;
    }

    setIsRetrainingAI(true);
    setRetrainResult(null);

    try {
      const csvText = await selectedCsvFile.text();
      const res = await fetch('/api/ml/retrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, namaFile: selectedCsvFile.name }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.sukses) {
        throw new Error(resData.error || resData.pesan || 'Gagal memperbarui model AI');
      }

      setRetrainResult(resData);
      if (resData.ringkasan) {
        setRiwayatImporTerakhir(resData.ringkasan);
        if (typeof window !== 'undefined') {
          localStorage.setItem('antrean_ai_last_import', JSON.stringify(resData.ringkasan));
        }
      }

      showToast(resData.pesan || 'Model AI berhasil diperbarui dari riwayat antrean!', 'success');
      setSelectedCsvFile(null);
      if (csvFileInputRef.current) csvFileInputRef.current.value = '';

      // Muat ulang status model riil & perkiraan live
      await loadStatusAiModel();
      const antreanDepan = daftarAntrean.filter((q) => q.status === 'MENUNGGU').length;
      loadLiveAiEstimate(antreanDepan);
    } catch (err) {
      console.error('Gagal import & latih AI:', err);
      showToast(`Kendala impor: ${err.message || 'Periksa berkas CSV'}`, 'alert');
    } finally {
      setIsRetrainingAI(false);
    }
  };

  // Handler Reset Data Pelatihan AI (Hanya dataset pelatihan & model, tidak menyentuh operasional)
  const handleEksekusiResetDataPelatihan = async () => {
    setIsResettingAI(true);
    try {
      const res = await fetch('/api/ml/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const resData = await res.json();
      if (!res.ok || !resData.sukses) {
        throw new Error(resData.error || resData.pesan || 'Gagal mereset data pelatihan');
      }

      setRiwayatImporTerakhir(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('antrean_ai_last_import');
      }
      setRetrainResult(null);
      setShowModalResetAI(false);
      showToast('Data pelatihan AI berhasil direset ke standar bawaan (0 baris dataset).', 'success');

      // Muat ulang status model riil & perkiraan live
      await loadStatusAiModel();
      const antreanDepan = daftarAntrean.filter((q) => q.status === 'MENUNGGU').length;
      loadLiveAiEstimate(antreanDepan);
    } catch (err) {
      console.error('Gagal reset AI:', err);
      showToast(`Kendala reset: ${err.message || 'Kesalahan sistem'}`, 'alert');
    } finally {
      setIsResettingAI(false);
    }
  };

  // Handler Latih Langsung dari Data Laporan Terfilter Aktif
  const handleLatihLangsungDariLaporanAktif = async () => {
    const filteredRows = getFilteredReportRows();
    if (filteredRows.length === 0) {
      showToast('Tidak ada data antrean berstatus SELESAI pada filter saat ini.', 'alert');
      return;
    }

    setIsRetrainingAI(true);
    setRetrainResult(null);

    try {
      const dataPayload = filteredRows.map((row, idx) => {
        let durasi = 7.0;
        if (row.durasi_aktual_menit) {
          const val = Number(row.durasi_aktual_menit);
          if (!isNaN(val) && val > 0 && val <= 120) durasi = val;
        } else if (row.created_at && row.finished_at) {
          const diff = (new Date(row.finished_at) - new Date(row.created_at)) / 60000;
          if (diff > 0 && diff <= 120) {
            durasi = Number(diff.toFixed(1));
          } else if (diff > 120) {
            durasi = 7.0; // Jika dibiarkan berjam-jam/seharian, gunakan standar wajar loket
          }
        }
        // Batasi rentang durasi wajar pelayanan pendaftaran loket Puskesmas (1 s.d. 45 menit)
        durasi = Math.min(45, Math.max(1, durasi));

        const d = row.created_at ? new Date(row.created_at) : new Date();
        const jamDaftar = Number((d.getHours() + d.getMinutes() / 60).toFixed(2));
        const antreanDepan = row.urutan > 1 ? row.urutan - 1 : idx;

        return {
          nomor: row.nomor || `A-${idx + 1}`,
          antrean_di_depan: Math.min(50, Math.max(0, antreanDepan)),
          jam_daftar: jamDaftar,
          rata_waktu_pelayanan: 7.0,
          waktu_tunggu_menit: durasi,
          status: 'COMPLETE',
        };
      });

      const res = await fetch('/api/ml/retrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataPayload }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.sukses) {
        throw new Error(resData.error || resData.pesan || 'Gagal memperbarui model AI');
      }

      setRetrainResult(resData);
      showToast('Model Random Forest AI berhasil diperbarui dari laporan aktif!', 'success');
    } catch (err) {
      console.error('Gagal latih model dari laporan aktif:', err);
      showToast(`Kendala pelatihan: ${err.message || 'Gagal memproses data'}`, 'alert');
    } finally {
      setIsRetrainingAI(false);
    }
  };

  // -------------------------------------------------------------
  // 8. Pembaruan Kata Sandi Baru dengan Konfirmasi Web
  // -------------------------------------------------------------
  const handleBukaModalGantiSandi = (e) => {
    e.preventDefault();

    if (!currentPass.trim()) {
      showToast('Masukkan kata sandi saat ini!', 'alert');
      return;
    }

    if (newPass.length < 8) {
      showToast('Kata sandi baru minimal 8 karakter demi standar keamanan!', 'alert');
      return;
    }

    if (newPass !== confirmPass) {
      showToast('Konfirmasi kata sandi baru tidak cocok!', 'alert');
      return;
    }

    setShowModalKonfirmasiGantiSandi(true);
  };

  const handleKonfirmasiGantiSandi = async () => {
    setIsChangingPass(true);

    try {
      const res = await fetch('/api/auth/ganti-sandi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandi_lama: currentPass,
          sandi_baru: newPass,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.sukses) {
        setCurrentPass('');
        setNewPass('');
        setConfirmPass('');
        setShowModalKonfirmasiGantiSandi(false);
        showToast(data.pesan || 'Kata sandi berhasil diperbarui dengan aman!', 'success');
      } else {
        const pesanGagal = data.pesan || 'Gagal memperbarui kata sandi.';
        showToast(pesanGagal, 'alert');
      }
    } catch (err) {
      console.error('Gagal memperbarui kata sandi:', err);
      showToast('Terjadi kesalahan jaringan saat menyimpan kata sandi.', 'alert');
    } finally {
      setIsChangingPass(false);
    }
  };

  // -------------------------------------------------------------
  // 9A. Manajemen Akun Petugas (Daftar, Tambah dg Konfirmasi, Hapus 2x)
  // -------------------------------------------------------------
  const loadDaftarAkunPetugas = useCallback(async () => {
    setIsLoadingDaftarAkun(true);
    try {
      const res = await fetch('/api/auth/daftar-akun');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sukses && Array.isArray(data.data)) {
        setDaftarAkunPetugas(data.data);
      }
    } catch (_) {
      // Abaikan jika jaringan bermasalah
    } finally {
      setIsLoadingDaftarAkun(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && activeMenu === 'sandi') {
      loadDaftarAkunPetugas();
    }
  }, [isLoggedIn, activeMenu, loadDaftarAkunPetugas]);

  const handleBukaModalTambahAkun = (e) => {
    if (e) e.preventDefault();
    const emailBersih = emailAkunBaru.trim().toLowerCase();
    const passBersih = passwordAkunBaru.trim();

    if (!emailBersih || !passBersih) {
      showToast('Email dan kata sandi akun baru wajib diisi.', 'alert');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailBersih)) {
      showToast('Format alamat email tidak valid.', 'alert');
      return;
    }

    if (passBersih.length < 8) {
      showToast('Kata sandi akun baru minimal 8 karakter.', 'alert');
      return;
    }

    setShowModalKonfirmasiTambahAkun(true);
  };

  const handleEksekusiTambahAkun = async () => {
    const emailBersih = emailAkunBaru.trim().toLowerCase();
    const passBersih = passwordAkunBaru.trim();

    setIsSubmittingTambahAkun(true);
    try {
      const res = await fetch('/api/auth/tambah-akun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailBersih, password: passBersih }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.sukses) {
        setEmailAkunBaru('');
        setPasswordAkunBaru('');
        setShowModalKonfirmasiTambahAkun(false);
        showToast(data.pesan || `Akun baru ${emailBersih} berhasil ditambahkan!`, 'success');
        loadDaftarAkunPetugas();
      } else {
        if (data.kodeError === 'SERVICE_KEY_MISSING') {
          showToast('Layanan manajemen akun belum dikonfigurasi pada server.', 'alert');
        } else {
          showToast(data.pesan || 'Gagal membuat akun baru.', 'alert');
        }
      }
    } catch (_) {
      showToast('Gagal terhubung ke server untuk membuat akun baru.', 'alert');
    } finally {
      setIsSubmittingTambahAkun(false);
    }
  };

  const handleBukaModalHapusAkun = (email) => {
    const emailTarget = (email || '').trim().toLowerCase();
    const emailAktif = (adminEmail || adminUsername || '').trim().toLowerCase();
    if (emailTarget === emailAktif || (emailAktif && emailTarget.includes(emailAktif))) {
      showToast('Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.', 'alert');
      return;
    }
    setTargetAkunHapus(emailTarget);
    setTahapHapusAkun(1);
    setInputEmailHapus('');
    setInputTeksHapus('');
    setShowModalHapusAkun(true);
  };

  const handleLanjutTahap2Hapus = (e) => {
    if (e) e.preventDefault();
    if (inputEmailHapus.trim().toLowerCase() !== targetAkunHapus.trim().toLowerCase()) {
      showToast('Alamat email konfirmasi tidak sesuai!', 'alert');
      return;
    }
    setTahapHapusAkun(2);
    setInputTeksHapus('');
  };

  const handleEksekusiHapusAkun = async (e) => {
    if (e) e.preventDefault();
    if (inputTeksHapus.trim() !== 'HAPUS AKUN') {
      showToast('Ketik kata HAPUS AKUN dengan huruf kapital persis untuk mengonfirmasi.', 'alert');
      return;
    }

    setIsSubmittingHapusAkun(true);
    try {
      const res = await fetch('/api/auth/hapus-akun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetAkunHapus }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.sukses) {
        showToast(data.pesan || `Akun ${targetAkunHapus} berhasil dihapus permanen.`, 'success');
        setShowModalHapusAkun(false);
        setTargetAkunHapus('');
        setInputEmailHapus('');
        setInputTeksHapus('');
        loadDaftarAkunPetugas();
      } else {
        showToast(data.pesan || 'Gagal menghapus akun.', 'alert');
      }
    } catch (_) {
      showToast('Gagal terhubung ke server untuk menghapus akun.', 'alert');
    } finally {
      setIsSubmittingHapusAkun(false);
    }
  };

  // -------------------------------------------------------------
  // 9. Lupa Sandi & Pemulihan Password via Email
  // -------------------------------------------------------------
  const handleKirimLupaSandi = async (e) => {
    if (e) e.preventDefault();
    const emailBersih = lupaSandiEmail.trim().toLowerCase();
    if (!emailBersih) {
      showToast('Masukkan alamat email akun petugas!', 'alert');
      return;
    }

    setIsSubmittingLupaSandi(true);
    try {
      const res = await fetch('/api/auth/lupa-sandi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailBersih }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.sukses) {
        setShowLupaSandiModal(false);
        setLupaSandiEmail('');
        showToast(data.pesan || 'Tautan reset sandi telah dikirim ke email Anda!', 'success');
      } else {
        showToast(data.pesan || 'Gagal mengirim email reset sandi.', 'alert');
      }
    } catch (_) {
      showToast('Gagal menghubungi server reset kata sandi.', 'alert');
    } finally {
      setIsSubmittingLupaSandi(false);
    }
  };

  const handleEksekusiResetPassword = async (e) => {
    if (e) e.preventDefault();
    if (!resetPassBaru || resetPassBaru.length < 8) {
      showToast('Kata sandi baru minimal 8 karakter!', 'alert');
      return;
    }
    if (resetPassBaru !== resetPassKonfirm) {
      showToast('Konfirmasi kata sandi baru tidak cocok!', 'alert');
      return;
    }

    setIsSubmittingResetPass(true);
    try {
      if (isSupabaseConfigured && supabase?.auth) {
        const { error } = await supabase.auth.updateUser({
          password: resetPassBaru,
        });
        if (error) throw error;
      }
      showToast('Kata sandi berhasil diperbarui! Silakan masuk dengan sandi baru.', 'success');
      setIsResetPasswordMode(false);
      setResetPassBaru('');
      setResetPassKonfirm('');
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (err) {
      showToast(`Gagal mereset kata sandi: ${err.message || 'Tautan pemulihan mungkin sudah kedaluwarsa.'}`, 'alert');
    } finally {
      setIsSubmittingResetPass(false);
    }
  };

  const antreanDitampilkan = daftarAntrean
    .filter((item) => {
      if (filterStatus === 'AKTIF') return !item.is_archived && item.status !== 'SELESAI' && item.status !== 'DIBATALKAN';
      if (filterStatus === 'SEMUA') return true;
      return item.status === filterStatus;
    })
    .filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return item.nama?.toLowerCase().includes(q) || item.nomor?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aDone = a.status === 'SELESAI' || a.status === 'DIBATALKAN' ? 1 : 0;
      const bDone = b.status === 'SELESAI' || b.status === 'DIBATALKAN' ? 1 : 0;
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
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800 relative">
        {/* Toast Notifikasi Web di Halaman Login */}
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

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-6 sm:p-8 max-w-sm w-full border border-slate-100">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-teal-50 text-teal-600 mb-3 border border-teal-100 shadow-sm">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black text-slate-900">Portal Petugas Loket</h1>
            <p className="text-xs text-slate-400 mt-1">{namaOrganisasi}</p>
            <span className="inline-block mt-2 text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
              Sistem Otentikasi Resmi
            </span>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            setIsLoggingIn(true);
            try {
              const res = await fetch('/api/auth/masuk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: loginUsername.trim(),
                  username: loginUsername.trim(),
                  password: loginPassword,
                }),
              });

              const data = await res.json().catch(() => ({}));

              if (res.ok && data.sukses) {
                // Sinkronkan juga sesi client Supabase browser jika aktif
                if (isSupabaseConfigured && supabase?.auth) {
                  supabase.auth.signInWithPassword({
                    email: loginUsername.trim().includes('@') ? loginUsername.trim() : `${loginUsername.trim()}@antrean.local`,
                    password: loginPassword,
                  }).catch(() => {});
                }

                setIsLoggedIn(true);
                sessionStorage.setItem('admin_is_logged_in', 'true');
                setLoginPassword('');
                if (data.pengguna?.username) setAdminUsername(data.pengguna.username);
                if (data.pengguna?.email) setAdminEmail(data.pengguna.email);
                else if (loginUsername.trim().includes('@')) setAdminEmail(loginUsername.trim());
                loadAdminData();
              } else {
                const pesanErr = data.pesan || 'Email atau kata sandi salah. Silakan periksa kembali.';
                showToast(pesanErr, 'alert');
              }
            } catch (err) {
              console.error('Login error:', err);
              showToast('Gagal terhubung ke server autentikasi. Periksa koneksi internet Anda.', 'alert');
            } finally {
              setIsLoggingIn(false);
            }
          }} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Email Petugas
              </label>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="admin@organisasi.com"
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">Gunakan alamat email resmi petugas yang terdaftar</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Kata Sandi (Password)</label>
                <button
                  type="button"
                  onClick={() => {
                    setLupaSandiEmail(loginUsername.includes('@') ? loginUsername.trim() : '');
                    setShowLupaSandiModal(true);
                  }}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors cursor-pointer"
                >
                  Lupa kata sandi?
                </button>
              </div>
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
              disabled={isLoggingIn}
              className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-2xl text-sm shadow-lg shadow-teal-600/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" /> {isLoggingIn ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <a 
              href="/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-bold transition-colors"
            >
              Buka Layar Antrean (Tab Baru) ↗
            </a>
          </div>
        </div>

        {/* ================= MODAL LUPA KATA SANDI (RESET VIA EMAIL) ================= */}
        {showLupaSandiModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-left">
              <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-teal-100 shadow-2xs">
                <Mail className="w-7 h-7" />
              </div>

              <h3 className="text-lg font-black text-slate-900 text-center mb-1">
                Atur Ulang Kata Sandi
              </h3>
              <p className="text-xs text-slate-500 text-center mb-4 leading-relaxed">
                Masukkan alamat email akun petugas Anda. Tautan verifikasi pemulihan kata sandi akan dikirim ke kotak masuk email Anda.
              </p>

              <form onSubmit={handleKirimLupaSandi} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Alamat Email Petugas <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={lupaSandiEmail}
                    onChange={(e) => setLupaSandiEmail(e.target.value)}
                    placeholder="admin@organisasi.com"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowLupaSandiModal(false)}
                    disabled={isSubmittingLupaSandi}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!lupaSandiEmail.trim() || isSubmittingLupaSandi}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-teal-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingLupaSandi ? 'Mengirim...' : 'Kirim Tautan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= MODAL ATUR SANDI BARU (DARI EMAIL LINK) ================= */}
        {isResetPasswordMode && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-left">
              <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-teal-100 shadow-2xs">
                <Key className="w-7 h-7" />
              </div>

              <h3 className="text-lg font-black text-slate-900 text-center mb-1">
                Buat Kata Sandi Baru
              </h3>
              <p className="text-xs text-slate-500 text-center mb-4 leading-relaxed">
                Anda mengakses sistem melalui tautan pemulihan email. Silakan tentukan kata sandi baru untuk akun petugas Anda.
              </p>

              <form onSubmit={handleEksekusiResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Kata Sandi Baru (Min. 8 Karakter) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showResetPassBaru ? 'text' : 'password'}
                      required
                      autoFocus
                      minLength={8}
                      value={resetPassBaru}
                      onChange={(e) => setResetPassBaru(e.target.value)}
                      placeholder="Minimal 8 karakter..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassBaru(!showResetPassBaru)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      {showResetPassBaru ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Konfirmasi Kata Sandi Baru <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showResetPassKonfirm ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={resetPassKonfirm}
                      onChange={(e) => setResetPassKonfirm(e.target.value)}
                      placeholder="Ketik ulang kata sandi baru..."
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassKonfirm(!showResetPassKonfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      {showResetPassKonfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Indikator Kesesuaian Kata Sandi */}
                  {resetPassKonfirm && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
                      {resetPassBaru === resetPassKonfirm ? (
                        <span className="text-teal-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Kata sandi cocok
                        </span>
                      ) : (
                        <span className="text-rose-600 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Kata sandi belum cocok
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsResetPasswordMode(false)}
                    disabled={isSubmittingResetPass}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!resetPassBaru || resetPassBaru.length < 8 || resetPassBaru !== resetPassKonfirm || isSubmittingResetPass}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-teal-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingResetPass ? 'Menyimpan...' : 'Simpan Sandi'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    );
  }

  // -------------------------------------------------------------
  // RENDER: DASHBOARD ADMIN UTAMA
  // -------------------------------------------------------------
  return (
    <main className="min-h-screen font-sans pb-20 relative bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100/70 text-slate-800 lg:flex lg:flex-row">

      {/* LATAR BELAKANG FOTO ORGANISASI (Sama seperti halaman antrean pengunjung) */}
      {fotoOrganisasiUrl ? (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center transition-all duration-700 opacity-65 scale-100"
            style={{ backgroundImage: `url("${fotoOrganisasiUrl}")` }}
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

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR NAVIGASI */}
      <aside className={`fixed top-0 left-0 h-full w-64 z-50 lg:sticky lg:top-0 lg:z-auto lg:flex lg:flex-col lg:min-h-screen transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="h-full lg:h-screen bg-white/95 backdrop-blur-md border-r border-slate-200/80 shadow-xl lg:shadow-sm flex flex-col lg:sticky lg:top-0">

          {/* Logo / Brand */}
          <div className="p-5 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center text-lg font-black overflow-hidden shrink-0">
                {(logoUrl.startsWith('http') || logoUrl.startsWith('data:')) ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span>{logoUrl || '🏢'}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 truncate leading-tight">{namaOrganisasi}</p>
                <p className="text-[10px] text-teal-700 font-bold truncate">Panel Petugas</p>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigasi Menu */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {[
              { id: 'antrean', icon: Users, label: 'Kelola Antrean', desc: 'Panggil & kelola tiket' },
              { id: 'profil', icon: Settings, label: 'Media & Profil', desc: 'Identitas & tampilan' },
              { id: 'laporan', icon: Download, label: 'Laporan', desc: 'Riwayat data pengunjung' },
              { id: 'sandi', icon: Shield, label: 'Kelola Admin', desc: 'Akun & keamanan' },
            ].map(({ id, icon: Icon, label, desc }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveMenu(id);
                  if (id === 'sandi') loadDaftarAkunPetugas();
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left transition-all cursor-pointer group ${
                  activeMenu === id
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  activeMenu === id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-700'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-black leading-tight ${activeMenu === id ? 'text-white' : 'text-slate-800'}`}>{label}</p>
                  <p className={`text-[10px] truncate mt-0.5 ${activeMenu === id ? 'text-teal-100' : 'text-slate-400'}`}>{desc}</p>
                </div>
              </button>
            ))}
          </nav>

          {/* Footer Sidebar */}
          <div className="p-3 border-t border-slate-100 space-y-1 shrink-0">
            <div className="px-3.5 py-2.5 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Sesi Aktif</p>
              <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{adminEmail || adminUsername}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowLogoutModal(true)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-left transition-all cursor-pointer text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <LogOut className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold">Keluar Akun</span>
            </button>
          </div>
        </div>
      </aside>

      {/* KONTEN UTAMA */}
      <div className="relative z-10 flex-1 min-w-0 p-4 sm:p-6 lg:p-8 xl:p-10">


        {/* ================= HEADER ADMIN (Loket Utama + Waktu Realtime) ================= */}
        <div className="bg-white/95 backdrop-blur-md p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-200/80 mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all w-full overflow-hidden">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 w-full md:flex-1">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center text-2xl sm:text-3xl font-black shadow-xs shrink-0 overflow-hidden">
              {logoUrl.startsWith('http') || logoUrl.startsWith('data:') ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                logoUrl || '🏢'
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
              <h1 className="text-lg sm:text-xl font-black text-slate-900 truncate leading-tight">{namaOrganisasi}</h1>
              <p className="text-xs text-slate-500 line-clamp-1 sm:truncate max-w-full break-all sm:break-normal">{alamatOrganisasi}</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            
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

            {/* 2. Layar Pengunjung */}
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
                  Layar Antrean
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



          </div>
        </div>

        {/* BREADCRUMB & HAMBURGER MOBILE */}
        <div className="flex items-center justify-between mb-6 lg:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Panel</span>
            <span className="text-slate-300 text-xs">/</span>
            <span className="text-xs font-black text-teal-700">
              {activeMenu === 'antrean' ? 'Kelola Antrean' :
               activeMenu === 'profil' ? 'Media & Profil' :
               activeMenu === 'laporan' ? 'Laporan' :
               'Kelola Admin'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="bg-white/95 border border-slate-200/80 shadow-sm p-2.5 rounded-2xl text-slate-700 hover:text-teal-700 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
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
                    Antrean Teratas Saat Ini
                  </span>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-4xl font-black text-white">
                      {antreanTeratas ? antreanTeratas.nomor : '---'}
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-slate-100">
                        {antreanTeratas ? antreanTeratas.nama : 'Tidak ada antrean aktif'}
                      </h3>
                      <p className="text-xs text-teal-200">
                        {antreanTeratas 
                          ? `Status: ${antreanTeratas.status} • Panggilan: ${antreanTeratas.panggilan_ke || 0}/3`
                          : antreanAktif.length === 0 
                          ? 'Belum ada antrean yang sedang menunggu.'
                          : 'Siklus antrean hari ini telah selesai.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Total Antrean Aktif dimasukkan di dekat card master control */}
                <div className="inline-flex items-center gap-2 bg-teal-800/90 text-teal-100 px-4 py-2 rounded-2xl text-xs font-bold border border-teal-700/60 shadow-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Total Antrean Aktif: <strong className="text-white text-sm ml-1">{antreanAktif.length}</strong> Pengunjung</span>
                </div>
              </div>

              {/* Peringatan jika siklus tutup */}
              {!statusBuka && (
                <div className="mt-4 bg-amber-500/20 border border-amber-400/40 rounded-2xl p-3 text-xs text-amber-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Pendaftaran antrean sedang ditutup. Pengunjung baru tidak dapat mendaftar.</span>
                </div>
              )}

              {/* 4 TOMBOL MASTER KONTROL (RINGKAS & TEPAT SASARAN) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-5">
                
                {/* 1. Panggil Pengunjung (include lewati dan panggil berikutnya di ke-4) */}
                <button
                  type="button"
                  onClick={handlePanggilUlang}
                  disabled={!adaAntreanAktif}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold p-4 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 shadow-md active:scale-95 text-center"
                >
                  <Volume2 className="w-6 h-6 text-blue-200" />
                  <span className="font-extrabold text-sm">Panggil Pengunjung</span>
                  <span className="text-[11px] text-blue-200">
                    {antreanTeratas ? `Panggilan ${antreanTeratas.panggilan_ke || 0}/3` : 'Tidak ada antrean'}
                  </span>
                </button>

                {/* 2. Selesai (include panggil berikutnya secara otomatis) */}
                <button
                  type="button"
                  onClick={() => handleTandaiSelesai()}
                  disabled={!adaAntreanAktif}
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
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto flex-1">
                  <div className="relative flex-1 sm:max-w-xs">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama atau nomor..."
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                    />
                  </div>

                  {/* Tombol Tambah Antrean oleh Petugas */}
                  <button
                    type="button"
                    onClick={() => {
                      setNamaPengunjungBaru('');
                      setShowTambahAntreanModal(true);
                    }}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                    title="Tambah antrean manual untuk pengunjung loket"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Tambah Antrean</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
                  {['AKTIF', 'SEMUA', 'MENUNGGU', 'MEMANGGIL', 'TERLAMBAT', 'SELESAI', 'DIBATALKAN'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setFilterStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
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
                          : item.status === 'DIBATALKAN'
                          ? 'bg-rose-50/40 border-rose-200 opacity-60'
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
                              item.status === 'DIBATALKAN' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {item.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                            Daftar: {item.created_at ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                            {item.finished_at && ` • Selesai: ${new Date(item.finished_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
                            {item.waktu_dibatalkan && ` • Dibatalkan: ${new Date(item.waktu_dibatalkan).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}
                            {item.panggilan_ke > 0 ? ` • Panggilan: ${item.panggilan_ke}x` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Aksi & Status Pelayanan (Hanya Batalkan dengan Konfirmasi Teks) */}
                      <div className="self-end sm:self-center flex items-center gap-2 flex-wrap justify-end shrink-0">
                        {item.status === 'SELESAI' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Selesai Dilayani
                          </span>
                        ) : item.status === 'DIBATALKAN' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
                            <XCircle className="w-3.5 h-3.5" /> Dibatalkan
                          </span>
                        ) : (
                          /* Tombol Batalkan Antrean untuk antrean yang belum selesai */
                          <button
                            type="button"
                            onClick={() => handleBukaModalBatal(item)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                            title="Batalkan antrean ini"
                          >
                            <Ban className="w-3.5 h-3.5 text-rose-600" />
                            <span>Batalkan</span>
                          </button>
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
          <div
            className="space-y-6 animate-fade-in w-full"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
              }
            }}
          >
            {/* Header Pengantar Tab 2 — Gradient Executive Cohesive */}
            <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-teal-800/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-400/30 flex items-center justify-center shrink-0 shadow-inner">
                    <Settings className="w-7 h-7 text-teal-300" />
                  </div>
                  <div>
                    <h2 className="font-black text-white text-xl tracking-tight">Profil, Media &amp; Pengumuman Instansi</h2>
                    <p className="text-xs text-teal-200/80 mt-0.5">Identitas resmi, logo, foto latar, navigasi GPS, dan pengaturan layar display publik</p>
                  </div>
                </div>

                {/* Tombol Simpan + Batalkan di Header */}
                <div className="flex items-center gap-2.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleBukaModalBatalEdit}
                    className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2.5 rounded-2xl text-xs transition-all cursor-pointer flex items-center gap-1.5 border border-white/20 shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Batalkan
                  </button>
                  <button
                    type="button"
                    onClick={handleBukaModalSimpanPengaturan}
                    className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black px-5 py-2.5 rounded-2xl text-xs shadow-lg shadow-teal-500/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4 text-slate-950" /> Simpan Perubahan
                  </button>
                </div>
              </div>
            </div>

            {/* Layout 2 Kolom Seimbang (Desktop 12 Kolom, Mobile Stack) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* ================= KOLOM KIRI (5 KOLOM): PRATINJAU LANGSUNG (LIVE PREVIEW) ================= */}
              <div className="lg:col-span-5 flex flex-col space-y-5">
                
                {/* Card Live Preview Multi-Layar (Pengunjung & Display TV) */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-4 shrink-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Eye className="w-4 h-4 text-teal-600" />
                      Pratinjau Layar Langsung (Live)
                    </span>
                    
                    {/* Toggle Tab Pratinjau: Layar Pengunjung vs Layar Display TV */}
                    <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setActivePreviewTab('pengunjung')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 ${
                          activePreviewTab === 'pengunjung'
                            ? 'bg-white text-teal-700 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Smartphone className="w-3 h-3" /> Pengunjung (HP)
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePreviewTab('display')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 ${
                          activePreviewTab === 'display'
                            ? 'bg-violet-600 text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Monitor className="w-3 h-3" /> Display (TV)
                      </button>
                    </div>
                  </div>

                  {/* KONDISIONAL 1: FRAME SIMULASI LAYAR PENGUNJUNG (HP) */}
                  {activePreviewTab === 'pengunjung' ? (
                    <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-800/30 animate-fade-in">
                      {/* Banner Pengumuman Darurat — sinkron page.js */}
                      {pengumumanDarurat && (
                        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white px-3 py-2 flex items-center gap-2.5 border-b border-red-500/40">
                          <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                            <Megaphone className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                            <span className="px-2 py-0.5 rounded-full bg-white text-rose-700 font-extrabold text-[8px] uppercase tracking-wider shrink-0 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-rose-600 animate-ping" />
                              PENGUMUMAN
                            </span>
                            <p className="text-[10px] font-semibold text-white leading-tight break-words min-w-0 line-clamp-2">
                              {pengumumanDarurat}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Header Card Profil Instansi — mirip card kepala page.js */}
                      <div className={`relative overflow-hidden text-center p-5 ${
                        fotoOrganisasiUrl ? '' : 'bg-white/95'
                      }`}>
                        {/* Foto latar */}
                        {fotoOrganisasiUrl ? (
                          <div className="absolute inset-0 z-0">
                            <img src={fotoOrganisasiUrl} alt="Foto Latar" className="w-full h-full object-cover object-center" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-slate-950/20" />
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100/70" />
                        )}

                        {/* Garis aksen warna atas — persis page.js */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500 z-10" />

                        {/* Logo */}
                        <div className="relative z-10 inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-white/80 bg-white/95 shadow-md mb-2 overflow-hidden mx-auto">
                          {logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('data:')) ? (
                            <img src={logoUrl} alt="Logo" className="w-12 h-12 object-contain rounded-xl p-0.5" />
                          ) : (
                            <span className="text-3xl">{logoUrl || '🏢'}</span>
                          )}
                        </div>

                        {/* Nama & Alamat */}
                        <h4 className={`relative z-10 text-sm font-black tracking-tight leading-snug ${
                          fotoOrganisasiUrl ? 'text-white drop-shadow-md' : 'text-slate-900'
                        }`}>
                          {namaOrganisasi || 'Nama Instansi'}
                        </h4>
                        <p className={`relative z-10 text-[10px] mt-0.5 font-medium leading-snug ${
                          fotoOrganisasiUrl ? 'text-slate-200' : 'text-slate-500'
                        }`}>
                          {alamatOrganisasi || 'Alamat Instansi'}
                        </p>

                        {/* Status Badge — persis page.js */}
                        <div className={`relative z-10 mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md shadow-2xs ${
                          fotoOrganisasiUrl
                            ? 'bg-white/95 border-white/60 text-slate-800'
                            : 'bg-slate-50 border-slate-200/80 text-slate-800'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${statusBuka ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
                          <span className={statusBuka ? 'text-emerald-700' : 'text-rose-700'}>
                            {statusBuka ? 'Loket Buka' : 'Loket Ditutup'}
                          </span>
                        </div>
                      </div>

                      {/* Info Persyaratan — card mini */}
                      <div className="bg-white/90 px-4 py-3 border-t border-slate-100">
                        <p className="text-[9px] font-black uppercase tracking-wider text-teal-700 mb-1">Persyaratan:</p>
                        <p className="text-[10px] text-slate-600 leading-snug line-clamp-2">
                          {infoPenting || 'Wajib membawa kartu identitas resmi.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* KONDISIONAL 2: FRAME SIMULASI LAYAR DISPLAY PUBLIK (TV 16:9) — PUTIH BERSIH SINKRON /display */
                    <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200/90 bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100/70 text-slate-800 animate-fade-in flex flex-col space-y-2 p-3 text-[10px] relative">
                      {/* Latar Foto Transparan Jika Ada */}
                      {fotoOrganisasiUrl && (
                        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                          <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url("${fotoOrganisasiUrl}")` }} />
                          <div className="absolute inset-0 bg-white/80 backdrop-blur-[0.5px]" />
                        </div>
                      )}

                      {/* Top Header Simulasi TV (Putih Bersih) */}
                      <div className="bg-white/90 backdrop-blur-md rounded-xl border border-slate-200/80 shadow-xs p-2 flex items-center justify-between gap-2 relative z-10">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                            {logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('data:')) ? (
                              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-sm">{logoUrl || '🏢'}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 text-[11px] truncate leading-tight">{namaOrganisasi || 'Instansi Pelayanan'}</p>
                            <p className="text-[8px] text-slate-500 truncate">{alamatOrganisasi || 'Alamat Instansi'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${statusBuka ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {statusBuka ? 'Buka' : 'Tutup'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-teal-100 text-teal-800">
                            Live
                          </span>
                          <span className="text-[9px] font-mono text-teal-700 font-black tabular-nums">
                            {realtimeClock || '12:00:00'}
                          </span>
                        </div>
                      </div>

                      {/* Banner Darurat Elegan di Layar Display TV */}
                      {pengumumanDarurat && (
                        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white rounded-xl px-2.5 py-1.5 flex items-center gap-2 border border-red-500/40 relative z-10 shadow-xs">
                          <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center shrink-0">
                            <Megaphone className="w-3 h-3 text-amber-300 animate-pulse" />
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                            <span className="px-1.5 py-0.2 rounded-full bg-white text-rose-700 font-black text-[7px] uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                              <span className="w-1 h-1 rounded-full bg-rose-600 animate-ping" />
                              PENGUMUMAN
                            </span>
                            <p className="text-[9px] font-semibold text-white leading-tight break-words min-w-0 line-clamp-1">
                              {pengumumanDarurat}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Layout 3 Kolom Mini Layar Display (Putih Bersih) */}
                      <div className="grid grid-cols-12 gap-2 pt-0.5 relative z-10">
                        {/* Kolom Kiri: Statistik Ringkas */}
                        <div className="col-span-3 bg-white/95 backdrop-blur-md rounded-xl p-2 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                          <p className="text-[7px] font-black uppercase tracking-wider text-slate-400 mb-1">Statistik Hari Ini</p>
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[8px] bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-100">
                              <span className="text-slate-500">Total:</span>
                              <span className="font-black text-teal-700">{daftarAntrean.length}</span>
                            </div>
                            <div className="flex justify-between items-center text-[8px] bg-amber-50 px-1.5 py-0.5 rounded-lg border border-amber-100">
                              <span className="text-amber-800">Tunggu:</span>
                              <span className="font-black text-amber-700">
                                {daftarAntrean.filter(q => q.status === 'MENUNGGU' || q.status === 'TERLAMBAT').length}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[8px] bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-100">
                              <span className="text-emerald-800">Selesai:</span>
                              <span className="font-black text-emerald-700">
                                {daftarAntrean.filter(q => q.status === 'SELESAI').length}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Kolom Tengah: Hero Nomor Sedang Dipanggil */}
                        <div className="col-span-6 bg-white/95 backdrop-blur-md rounded-xl p-2.5 border-2 border-slate-200/90 text-center flex flex-col items-center justify-center relative overflow-hidden shadow-xs">
                          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500" />
                          <p className="text-[7px] font-black uppercase tracking-widest text-slate-400 mb-1">◆ Nomor Sedang Dipanggil ◆</p>
                          <div className="w-20 h-12 rounded-xl bg-teal-50 border-2 border-teal-200 flex items-center justify-center my-0.5 shadow-xs">
                            <span className="text-xl font-black text-teal-700 font-mono">
                              {daftarAntrean.find(q => q.status === 'MEMANGGIL')?.nomor || 'A-001'}
                            </span>
                          </div>
                          <p className="text-[10px] font-black text-slate-900 truncate max-w-full">
                            {daftarAntrean.find(q => q.status === 'MEMANGGIL')?.nama || 'Nama Pengunjung'}
                          </p>
                          <div className="mt-0.5 bg-teal-100 text-teal-800 text-[7px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                            Silakan ke Loket Pelayanan
                          </div>
                        </div>

                        {/* Kolom Kanan: QR Code Mini REAL */}
                        <div className="col-span-3 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between">
                          <div className="bg-teal-600 py-1 text-center">
                            <p className="text-[7px] font-black uppercase text-white tracking-tight">Scan Antrean</p>
                          </div>
                          <div className="p-1 flex flex-col items-center justify-center">
                            {/* QR Code REAL dari URL Website Pengunjung Saat Ini */}
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(typeof window !== 'undefined' ? (window.location.origin + '/') : 'https://antrean.online/')}&margin=4&color=0f766e&bgcolor=ffffff&format=svg`}
                              alt="QR Code Antrean Real"
                              width={48}
                              height={48}
                              className="rounded-lg border-2 border-teal-100 bg-white"
                            />
                            <p className="text-[6px] font-mono font-bold text-teal-800 mt-1 truncate max-w-full text-center">
                              {typeof window !== 'undefined' ? window.location.host : 'antrean.online'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Footer Link Akses Display */}
                      <div className="pt-1 flex items-center justify-between border-t border-slate-200/80 text-[8px] text-slate-500 relative z-10">
                        <span className="font-medium">Layar Display TV Resolusi Standar &amp; 4K</span>
                        <a href="/display" target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:text-teal-900 font-bold flex items-center gap-0.5">
                          Buka Layar Penuh ↗
                        </a>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                    Perubahan langsung disimulasikan secara realtime pada mode pratinjau yang aktif.
                  </p>
                </div>

                {/* Card Pengumuman Darurat Siaran Langsung (Setara tinggi di desktop, ringkas & clean di HP) */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 border border-rose-200/90 shadow-sm flex flex-col flex-1 space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-rose-100 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shadow-xs shrink-0">
                        <Megaphone className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                          Pengumuman Darurat (Live)
                        </h3>
                        <p className="text-[10px] text-slate-400">Siaran teks penting ke semua layar pengunjung &amp; TV display</p>
                      </div>
                    </div>
                    {pengumumanDarurat && (
                      <button
                        type="button"
                        onClick={handleHapusPengumumanDarurat}
                        className="bg-rose-100 hover:bg-rose-200 text-rose-700 text-[11px] font-bold px-3 py-1.5 rounded-xl cursor-pointer flex items-center gap-1 transition-colors shrink-0"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Hapus
                      </button>
                    )}
                  </div>

                  <textarea
                    rows={3}
                    value={pengumumanDarurat}
                    onChange={(e) => setPengumumanDarurat(e.target.value)}
                    placeholder="Contoh: Loket pendaftaran tutup sementara jam 11:30 WIB karena rapat koordinasi dinas..."
                    className="w-full flex-1 min-h-[90px] lg:min-h-[140px] p-4 rounded-2xl bg-rose-50/50 border border-rose-200 text-sm font-medium text-rose-950 placeholder-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none leading-relaxed transition-all"
                  />
                  <p className="text-[11px] text-slate-500 leading-relaxed shrink-0">
                    Pesan ini otomatis tampil sebagai banner merah berkelas di bagian atas layar pengunjung dan layar TV display. Kosongkan jika tidak ada pengumuman darurat.
                  </p>
                </div>

              </div>

              {/* ================= KOLOM KANAN (7 KOLOM): SATU CARD BESAR TERPADU ================= */}
              <div className="lg:col-span-7 space-y-5">

                {/* CARD UTAMA TERPADU: PENGATURAN PROFIL, IDENTITAS, MEDIA & LOKASI */}
                <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-7 space-y-6">

                  {/* SUB-SEKSI 1: IDENTITAS & DOKUMEN PERSYARATAN */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Identitas &amp; Dokumen Persyaratan</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Nama Instansi / Unit Layanan</label>
                        <input
                          type="text"
                          value={namaOrganisasi}
                          onChange={(e) => setNamaOrganisasi(e.target.value)}
                          placeholder="Contoh: Kantor Layanan Terpadu"
                          className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Alamat Lengkap</label>
                        <input
                          type="text"
                          value={alamatOrganisasi}
                          onChange={(e) => setAlamatOrganisasi(e.target.value)}
                          placeholder="Contoh: Jl. Pelayanan Publik No. 1"
                          className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Persyaratan Wajib Pengunjung (KTP / Dokumen)</label>
                      <textarea
                        rows={2}
                        value={infoPenting}
                        onChange={(e) => setInfoPenting(e.target.value)}
                        placeholder="Contoh: Wajib membawa identitas diri atau bukti registrasi fisik saat datang ke loket..."
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* DIVIDER HALUS */}
                  <hr className="border-slate-100" />

                  {/* SUB-SEKSI 2: MEDIA VISUAL (LOGO & FOTO LATAR) */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Media Visual (Logo &amp; Foto Latar)</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {/* Tile Logo */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Logo Instansi</span>
                          {logoUrl && logoUrl !== '🏢' ? (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Khusus
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Standar</span>
                          )}
                        </div>

                        <div className="h-36 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden flex flex-col items-center justify-center p-3 transition-colors">
                          {logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('data:')) ? (
                            <img src={logoUrl} alt="Logo" className="max-w-[100px] max-h-[85px] object-contain rounded-xl" />
                          ) : (
                            <span className="text-5xl">{logoUrl || '🏢'}</span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <label className="flex-1 inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-3 rounded-xl cursor-pointer transition-colors shadow-2xs">
                            <Upload className="w-3.5 h-3.5" />
                            {logoUrl && logoUrl !== '🏢' ? 'Ganti Logo' : 'Unggah Logo'}
                            <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setLogoUrl)} className="hidden" />
                          </label>
                          {logoUrl && logoUrl !== '🏢' && (
                            <button
                              type="button"
                              onClick={() => { setLogoUrl('🏢'); showToast('Logo direset ke ikon standar 🏢', 'info'); }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-3 rounded-xl border border-slate-200 cursor-pointer"
                              title="Reset Logo"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 text-center">Format PNG / JPG transparan · Rasio 1:1</p>
                      </div>

                      {/* Tile Foto Latar */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Foto Latar Belakang</span>
                          {fotoOrganisasiUrl ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Terpasang
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Kosong</span>
                          )}
                        </div>

                        <div className="h-36 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden relative">
                          {fotoOrganisasiUrl ? (
                            <img src={fotoOrganisasiUrl} alt="Foto Latar" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-center px-3">
                              <Upload className="w-6 h-6 text-slate-300" />
                              <p className="text-xs font-bold text-slate-500">Belum Ada Foto</p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <label className="flex-1 inline-flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2.5 px-3 rounded-xl cursor-pointer transition-colors shadow-2xs">
                            <Upload className="w-3.5 h-3.5" />
                            {fotoOrganisasiUrl ? 'Ganti Foto' : 'Unggah Foto'}
                            <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFotoOrganisasiUrl)} className="hidden" />
                          </label>
                          {fotoOrganisasiUrl && (
                            <button
                              type="button"
                              onClick={() => { setFotoOrganisasiUrl(''); showToast('Foto latar dihapus.', 'info'); }}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold py-2.5 px-3 rounded-xl border border-rose-200 cursor-pointer"
                              title="Hapus Foto"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 text-center">Format JPG / WebP lanskap · Min. 1280×720px</p>
                      </div>
                    </div>
                  </div>

                  {/* DIVIDER HALUS */}
                  <hr className="border-slate-100" />

                  {/* SUB-SEKSI 3: LOKASI GPS & PETA NAVIGASI */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Lokasi GPS &amp; Peta Navigasi</h3>
                      </div>
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5" /> Buka Google Maps ↗
                        </a>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tautan Google Maps</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={mapsUrl}
                          onChange={(e) => handleMapsUrlChange(e.target.value)}
                          placeholder="https://maps.google.com/?q=-0.5282,102.5853"
                          className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 pl-11"
                        />
                        <MapPin className="w-4 h-4 text-teal-600 absolute left-4 top-3.5" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Tempel link Google Maps atau maps.app.goo.gl — koordinat akan diekstrak otomatis.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Latitude (Garis Lintang)</label>
                        <input
                          type="number"
                          step="any"
                          value={latitude}
                          onChange={(e) => setLatitude(parseFloat(e.target.value))}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Longitude (Garis Bujur)</label>
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

                </div>

              </div>

            </div>

          </div>
        )}

        {/* ================= TAB 3: EKSPOR LAPORAN CSV / EXCEL ================= */}
        {activeMenu === 'laporan' && (
          <div className="w-full animate-fade-in space-y-6">

            {/* Header Tab Laporan */}
            <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-teal-800/40">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-400/30 flex items-center justify-center shrink-0">
                  <Download className="w-6 h-6 text-teal-300" />
                </div>
                <div>
                  <h2 className="font-black text-white text-lg sm:text-xl tracking-tight">Laporan</h2>
                  <p className="text-xs text-teal-200/80 mt-0.5">Ringkasan pengunjung, analisis waktu pelayanan, dan data riwayat antrean loket</p>
                </div>
              </div>
            </div>

            {/* ================= FILTER WAKTU & SATU-SATUNYA TOMBOL UNDUH LAPORAN ================= */}
            <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Pilih Periode Laporan
                  </h3>
                </div>

                {/* SATU-SATUNYA TOMBOL UNDUH CSV UTAMA */}
                <button
                  type="button"
                  onClick={exportToCSV}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-sm shadow-teal-600/20 transition-all cursor-pointer flex items-center gap-2 self-start sm:self-auto active:scale-95"
                >
                  <Download className="w-4 h-4" /> Unduh Laporan ({getFilteredReportRows().length} Baris CSV)
                </button>
              </div>

              {/* Tombol Pilihan Mode Periode */}
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200">
                  {[
                    { id: 'HARIAN', label: '📅 Harian' },
                    { id: 'BULANAN', label: '📆 Bulanan' },
                    { id: 'TAHUNAN', label: '📊 Tahunan' },
                    { id: 'SEMUA', label: '🗂️ Semua Data' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFilterPeriode(p.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center whitespace-nowrap ${
                        filterPeriode === p.id 
                          ? 'bg-teal-600 text-white shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kontrol Kalender Sesuai Pilihan */}
              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
                {filterPeriode === 'HARIAN' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Pilih Tanggal Laporan
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedTanggal(new Date().toISOString().split('T')[0])}
                          className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-700 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          Hari Ini
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() - 1);
                            setSelectedTanggal(d.toISOString().split('T')[0]);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          Kemarin
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="relative flex-1 sm:max-w-xs">
                        <input
                          type="date"
                          value={selectedTanggal}
                          onChange={(e) => setSelectedTanggal(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                        <span className="w-2 h-2 rounded-full bg-teal-500" />
                        <span>
                          {new Date(selectedTanggal + 'T00:00:00').toLocaleDateString('id-ID', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {filterPeriode === 'BULANAN' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Pilih Bulan &amp; Tahun
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          const y = now.getFullYear();
                          const m = String(now.getMonth() + 1).padStart(2, '0');
                          setSelectedBulan(`${y}-${m}`);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-700 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer self-start sm:self-auto"
                      >
                        Bulan Ini
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Bulan</label>
                        <select
                          value={parseInt(selectedBulan.split('-')[1], 10)}
                          onChange={(e) => {
                            const [thn] = selectedBulan.split('-');
                            setSelectedBulan(`${thn}-${String(e.target.value).padStart(2, '0')}`);
                          }}
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs cursor-pointer"
                        >
                          {[
                            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
                          ].map((namaBln, idx) => (
                            <option key={idx + 1} value={idx + 1}>{idx + 1} - {namaBln}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tahun</label>
                        <select
                          value={selectedBulan.split('-')[0]}
                          onChange={(e) => {
                            const [, bln] = selectedBulan.split('-');
                            setSelectedBulan(`${e.target.value}-${bln}`);
                          }}
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs cursor-pointer"
                        >
                          {[2024, 2025, 2026, 2027, 2028].map((y) => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {filterPeriode === 'TAHUNAN' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Pilih Tahun Rekapitulasi (Jan – Des)
                      </label>
                      <button
                        type="button"
                        onClick={() => setSelectedTahun(String(new Date().getFullYear()))}
                        className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-700 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer self-start sm:self-auto"
                      >
                        Tahun Ini
                      </button>
                    </div>

                    <div className="max-w-xs">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tahun</label>
                      <select
                        value={selectedTahun}
                        onChange={(e) => setSelectedTahun(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs cursor-pointer"
                      >
                        {[2023, 2024, 2025, 2026, 2027, 2028].map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {filterPeriode === 'SEMUA' && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">Menampilkan Seluruh Riwayat Antrean Selesai</p>
                    <p className="text-[11px] text-slate-500">
                      Semua berkas tanpa batasan tanggal akan diekspor ke dalam satu lembar kerja CSV / Excel.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ================= A. RINGKASAN ANTREAN (5 KPI CARDS) ================= */}
            {(() => {
              const allRows = getAllRowsInFilter();
              const selesaiRows = allRows.filter((r) => r.status === 'SELESAI');
              const batalRows = allRows.filter((r) => r.status === 'DIBATALKAN');

              // Rata-rata durasi pelayanan di loket (disaring dari outlier > 60 menit)
              const withDurasi = selesaiRows.filter((r) => {
                let val = null;
                if (r.durasi_aktual_menit && Number(r.durasi_aktual_menit) > 0) {
                  val = Number(r.durasi_aktual_menit);
                } else if (r.created_at && r.finished_at) {
                  val = Math.round((new Date(r.finished_at) - new Date(r.created_at)) / 60000);
                }
                return val !== null && val > 0 && val <= 60;
              });
              const avgDurasi = withDurasi.length > 0
                ? Math.round(withDurasi.reduce((sum, r) => {
                    const val = r.durasi_aktual_menit ? Number(r.durasi_aktual_menit) : Math.round((new Date(r.finished_at) - new Date(r.created_at)) / 60000);
                    return sum + Math.min(60, Math.max(1, val));
                  }, 0) / withDurasi.length)
                : (selesaiRows.length > 0 ? 7 : null);

              // Rata-rata waktu tunggu (hanya jika data tersedia)
              const withWaktuTunggu = selesaiRows.filter((r) => {
                if (r.last_called_at && r.created_at) {
                  const diff = (new Date(r.last_called_at) - new Date(r.created_at)) / 60000;
                  return diff >= 0 && diff < 300;
                }
                return false;
              });
              const avgWaktuTunggu = withWaktuTunggu.length > 0
                ? Math.round(withWaktuTunggu.reduce((sum, r) => {
                    const diff = (new Date(r.last_called_at) - new Date(r.created_at)) / 60000;
                    return sum + diff;
                  }, 0) / withWaktuTunggu.length)
                : null;

              return (
                <div className="space-y-6">
                  {/* Grid 5 KPI Cards Ringkasan */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                    {/* 1. Jumlah Pengunjung */}
                    <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                      <div className="flex items-center justify-between text-teal-600 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Jumlah Pengunjung</span>
                        <Users className="w-4 h-4 text-teal-600" />
                      </div>
                      <p className="text-2xl font-black text-slate-900">{allRows.length}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">Total pada periode ini</p>
                    </div>

                    {/* 2. Antrean Selesai */}
                    <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                      <div className="flex items-center justify-between text-emerald-600 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Antrean Selesai</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <p className="text-2xl font-black text-emerald-700">{selesaiRows.length}</p>
                      <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                        {allRows.length > 0 ? `${Math.round((selesaiRows.length / allRows.length) * 100)}% dari total` : '0%'}
                      </p>
                    </div>

                    {/* 3. Antrean Dibatalkan */}
                    <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dibatalkan</span>
                        <XCircle className="w-4 h-4 text-slate-400" />
                      </div>
                      <p className="text-2xl font-black text-slate-700">{batalRows.length}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Batal atau tidak hadir</p>
                    </div>

                    {/* 4. Rata-rata Durasi Pelayanan */}
                    <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                      <div className="flex items-center justify-between text-blue-600 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rata-rata Layanan</span>
                        <Clock className="w-4 h-4 text-blue-600" />
                      </div>
                      <p className="text-2xl font-black text-slate-900">
                        {avgDurasi !== null ? `${avgDurasi}` : '-'}{' '}
                        <span className="text-xs font-semibold text-slate-400">menit</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Durasi di loket pendaftaran</p>
                    </div>

                    {/* 5. Rata-rata Waktu Tunggu */}
                    <div className="bg-white/95 backdrop-blur-md rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
                      <div className="flex items-center justify-between text-amber-600 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Rata Waktu Tunggu</span>
                        <Sparkles className="w-4 h-4 text-amber-600" />
                      </div>
                      <p className="text-2xl font-black text-slate-900">
                        {avgWaktuTunggu !== null ? `${avgWaktuTunggu}` : '-'}{' '}
                        <span className="text-xs font-semibold text-slate-400">{avgWaktuTunggu !== null ? 'menit' : ''}</span>
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {avgWaktuTunggu !== null ? 'Daftar hingga dipanggil' : 'Belum terdata'}
                      </p>
                    </div>
                  </div>

                  {/* ================= B. ANALISIS ANTREAN (GRAFIK, WAKTU RAMAI, STATUS) ================= */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                    {/* Kolom Kiri (7 Kolom): Grafik Tren Pengunjung Periode Terpilih */}
                    {(() => {
                      // Buat grafik sederhana sesuai filter periode
                      let chartData = [];
                      if (filterPeriode === 'HARIAN') {
                        // Per jam layanan (07.00 - 14.00)
                        const jamLabels = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00+'];
                        const jamMap = { 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0 };
                        allRows.forEach((r) => {
                          if (r.created_at) {
                            const j = new Date(r.created_at).getHours();
                            if (j < 7) jamMap[7] = (jamMap[7] || 0) + 1;
                            else if (j >= 13) jamMap[13] = (jamMap[13] || 0) + 1;
                            else jamMap[j] = (jamMap[j] || 0) + 1;
                          }
                        });
                        chartData = jamLabels.map((lbl, idx) => {
                          const hour = idx + 7;
                          return { label: lbl, count: jamMap[hour] || 0 };
                        });
                      } else if (filterPeriode === 'BULANAN') {
                        // Per rentang minggu dalam bulan
                        const mingguMap = { 'Minggu 1': 0, 'Minggu 2': 0, 'Minggu 3': 0, 'Minggu 4': 0, 'Minggu 5': 0 };
                        allRows.forEach((r) => {
                          if (r.created_at) {
                            const tgl = new Date(r.created_at).getDate();
                            const m = tgl <= 7 ? 'Minggu 1' : tgl <= 14 ? 'Minggu 2' : tgl <= 21 ? 'Minggu 3' : tgl <= 28 ? 'Minggu 4' : 'Minggu 5';
                            mingguMap[m] = (mingguMap[m] || 0) + 1;
                          }
                        });
                        chartData = Object.keys(mingguMap).map((m) => ({ label: m, count: mingguMap[m] }));
                      } else if (filterPeriode === 'TAHUNAN') {
                        // Per bulan (Jan–Des)
                        const bulanSingkat = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                        const blnMap = {};
                        bulanSingkat.forEach((_, i) => { blnMap[i] = 0; });
                        allRows.forEach((r) => {
                          if (r.created_at) {
                            const m = new Date(r.created_at).getMonth();
                            blnMap[m] = (blnMap[m] || 0) + 1;
                          }
                        });
                        chartData = bulanSingkat.map((lbl, idx) => ({ label: lbl, count: blnMap[idx] || 0 }));
                      } else {
                        // SEMUA ARSIP: per tahun atau gabungan
                        const thnMap = {};
                        allRows.forEach((r) => {
                          if (r.created_at) {
                            const y = new Date(r.created_at).getFullYear();
                            thnMap[y] = (thnMap[y] || 0) + 1;
                          }
                        });
                        chartData = Object.keys(thnMap).sort().map((y) => ({ label: `Thn ${y}`, count: thnMap[y] }));
                        if (chartData.length === 0) chartData = [{ label: 'Semua Data', count: allRows.length }];
                      }

                      const maxCount = Math.max(...chartData.map((c) => c.count), 1);

                      // Hari paling ramai & jam paling ramai
                      const hariNama = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                      const hariHitung = {};
                      const jamHitung = {};
                      allRows.forEach((r) => {
                        if (r.created_at) {
                          const d = new Date(r.created_at);
                          const h = hariNama[d.getDay()];
                          hariHitung[h] = (hariHitung[h] || 0) + 1;
                          const j = d.getHours();
                          jamHitung[j] = (jamHitung[j] || 0) + 1;
                        }
                      });
                      const hariPalingRamai = Object.keys(hariHitung).sort((a, b) => hariHitung[b] - hariHitung[a])[0] || 'Senin';
                      const jamPalingRamai = Object.keys(jamHitung).sort((a, b) => jamHitung[b] - jamHitung[a])[0];

                      return (
                        <div className="lg:col-span-7 bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                            <div>
                              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                Grafik Jumlah Pengunjung ({filterPeriode === 'HARIAN' ? 'Per Jam' : filterPeriode === 'BULANAN' ? 'Per Minggu' : filterPeriode === 'TAHUNAN' ? 'Per Bulan' : 'Per Tahun'})
                              </h3>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Mengikuti periode: <strong className="text-teal-700">{filterPeriode === 'HARIAN' ? selectedTanggal : filterPeriode === 'BULANAN' ? selectedBulan : filterPeriode === 'TAHUNAN' ? `Tahun ${selectedTahun}` : 'Semua Arsip'}</strong>
                              </p>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-xl self-start sm:self-auto">
                              Total: {allRows.length} Orang
                            </span>
                          </div>

                          {/* Visualisasi Bar Chart Sederhana */}
                          <div className="space-y-2 py-1">
                            {chartData.map((item) => {
                              const pct = Math.round((item.count / maxCount) * 100);
                              return (
                                <div key={item.label} className="flex items-center gap-3 text-xs">
                                  <span className="w-14 text-[11px] font-bold text-slate-500 shrink-0 text-right">
                                    {item.label}
                                  </span>
                                  <div className="flex-1 bg-slate-100 h-4 rounded-xl overflow-hidden relative">
                                    <div
                                      className="bg-teal-600 h-full rounded-xl transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="w-12 text-[11px] font-black text-slate-800 shrink-0 text-left">
                                    {item.count} <span className="font-normal text-slate-400 text-[10px]">org</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Highlight Waktu & Hari Ramai */}
                          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                            <div className="p-3 bg-teal-50/60 border border-teal-100 rounded-2xl">
                              <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">Hari Paling Ramai</p>
                              <p className="text-base font-black text-teal-950 mt-0.5">
                                {allRows.length > 0 ? hariPalingRamai : 'Belum Ada Data'}
                              </p>
                            </div>
                            <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-2xl">
                              <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Jam Pelayanan Tersibuk</p>
                              <p className="text-base font-black text-blue-950 mt-0.5">
                                {allRows.length > 0 && jamPalingRamai !== undefined ? `${String(jamPalingRamai).padStart(2, '0')}:00 WIB` : '08:00 WIB'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Kolom Kanan (5 Kolom): Perbandingan Status & Jalur Pendaftaran */}
                    {(() => {
                      const allRows = getAllRowsInFilter();
                      const total = allRows.length || 1;
                      const statusList = [
                        { label: 'Selesai Dilayani', count: allRows.filter((r) => r.status === 'SELESAI').length, color: 'bg-emerald-500', text: 'text-emerald-700' },
                        { label: 'Menunggu Giliran', count: allRows.filter((r) => r.status === 'MENUNGGU').length, color: 'bg-amber-400', text: 'text-amber-700' },
                        { label: 'Sedang Dipanggil', count: allRows.filter((r) => r.status === 'MEMANGGIL').length, color: 'bg-blue-500', text: 'text-blue-700' },
                        { label: 'Terlambat Hadir', count: allRows.filter((r) => r.status === 'TERLAMBAT').length, color: 'bg-rose-400', text: 'text-rose-700' },
                        { label: 'Dibatalkan', count: allRows.filter((r) => r.status === 'DIBATALKAN').length, color: 'bg-slate-400', text: 'text-slate-600' },
                      ];

                      const dariOnline = allRows.filter((r) => r.sumber === 'ONLINE').length;
                      const dariLoket = allRows.filter((r) => r.sumber !== 'ONLINE').length;

                      return (
                        <div className="lg:col-span-5 bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
                          <div className="pb-3 border-b border-slate-100">
                            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                              Perbandingan Status Antrean
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Sebaran status antrean pada periode aktif</p>
                          </div>

                          {/* Progress Bars Status */}
                          <div className="space-y-2.5">
                            {statusList.map((st) => {
                              const pct = Math.round((st.count / total) * 100);
                              return (
                                <div key={st.label}>
                                  <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                                    <span className={st.text}>{st.label}</span>
                                    <span className="text-slate-700">{st.count} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${st.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Jalur Pendaftaran (Loket vs Online) */}
                          <div className="pt-3 border-t border-slate-100">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Jalur Pendaftaran Pengunjung</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                                <p className="text-base font-black text-slate-900">{dariLoket}</p>
                                <p className="text-[10px] font-bold text-slate-500 uppercase mt-0.5">Loket Fisik</p>
                              </div>
                              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl text-center">
                                <p className="text-base font-black text-blue-900">{dariOnline}</p>
                                <p className="text-[10px] font-bold text-blue-600 uppercase mt-0.5">Daftar Online</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  </div>

                  {/* ================= C. ANALISIS PERKIRAAN WAKTU TUNGGU (AI & LOKET) ================= */}
                  {(() => {
                    const antreanDepanSaatIni = daftarAntrean.filter((q) => q.status === 'MENUNGGU').length;
                    const rfDetail = liveAiEstimate?.detail?.rf;
                    const intDetail = liveAiEstimate?.detail?.interval;

                    const rfMenit = rfDetail?.estimasiMenit ?? null;
                    // Pola AI aktif jika model di backend AKTIF dan memiliki dataset > 0
                    const isRfActive = Boolean(statusAiModel?.model_aktif && (statusAiModel?.total_dataset || 0) > 0);

                    const intMenit = intDetail?.estimasiMenit ?? null;
                    const intMedian = intDetail?.median ?? null;
                    const intSamples = intDetail?.samples ?? 0;
                    const isIntActive = Boolean(intSamples >= 2);

                    const keduaTersedia = isRfActive && isIntActive;
                    let estimasiGabungan = 0;
                    if (antreanDepanSaatIni === 0) {
                      estimasiGabungan = 0;
                    } else if (keduaTersedia) {
                      const rfVal = rfMenit ?? (antreanDepanSaatIni * 7);
                      const intVal = intMenit ?? Math.round(antreanDepanSaatIni * (intMedian ?? 7));
                      estimasiGabungan = Math.max(1, Math.round((rfVal + intVal) / 2.0));
                    } else if (isRfActive) {
                      estimasiGabungan = rfMenit ?? (antreanDepanSaatIni * 7);
                    } else if (isIntActive) {
                      estimasiGabungan = intMenit ?? Math.max(1, Math.round(antreanDepanSaatIni * (intMedian ?? 7)));
                    } else {
                      estimasiGabungan = antreanDepanSaatIni * 7;
                    }

                    // Tentukan nama metode aktif yang ramah awam
                    let namaMetodeAktif = 'Standar Bawaan Puskesmas (7 mnt/pasien)';
                    let warnaMetodeAktif = 'bg-slate-50 text-slate-800 border-slate-200';
                    let dotWarna = 'bg-slate-400';
                    let penjelasanMetodeAktif = antreanDepanSaatIni === 0
                      ? 'Standar bawaan Puskesmas (7 mnt/pasien). Saat ini antrean kosong (0 orang menunggu), pasien baru akan langsung dipanggil tanpa antrean.'
                      : `Waktu tunggu dihitung menggunakan standar waktu 7 menit per pasien untuk ${antreanDepanSaatIni} orang yang menunggu (${estimasiGabungan} menit).`;

                    if (keduaTersedia) {
                      namaMetodeAktif = 'Rata-Rata Gabungan (Pola AI + Kecepatan Loket Hari Ini)';
                      warnaMetodeAktif = 'bg-emerald-50 text-emerald-900 border-emerald-300';
                      dotWarna = 'bg-emerald-500 animate-pulse';
                      penjelasanMetodeAktif = antreanDepanSaatIni === 0
                        ? 'Paling akurat: Menggabungkan Pola AI dan Kecepatan Panggilan Loket. Saat ini antrean kosong (0 orang), pasien baru langsung dipanggil ke loket.'
                        : `Paling akurat: Menggabungkan Pola AI (${rfMenit ?? (antreanDepanSaatIni * 7)} mnt) dan Kecepatan Panggilan Hari Ini (${intMenit ?? Math.round(antreanDepanSaatIni * (intMedian ?? 7))} mnt) menjadi rata-rata ${estimasiGabungan} menit.`;
                    } else if (isRfActive) {
                      namaMetodeAktif = 'Pola Data Antrean Saja (Random Forest AI)';
                      warnaMetodeAktif = 'bg-teal-50 text-teal-900 border-teal-300';
                      dotWarna = 'bg-teal-500 animate-pulse';
                      penjelasanMetodeAktif = antreanDepanSaatIni === 0
                        ? `Model Random Forest aktif (${statusAiModel.total_dataset.toLocaleString('id-ID')} data riwayat). Saat ini antrean kosong, pasien baru langsung dipanggil.`
                        : `Model Random Forest aktif (${statusAiModel.total_dataset.toLocaleString('id-ID')} data riwayat). Kecepatan loket akan otomatis aktif setelah loket memanggil minimal 2 pasien.`;
                    } else if (isIntActive) {
                      namaMetodeAktif = 'Kecepatan Panggilan Loket Hari Ini Saja';
                      warnaMetodeAktif = 'bg-blue-50 text-blue-900 border-blue-300';
                      dotWarna = 'bg-blue-500 animate-pulse';
                      penjelasanMetodeAktif = antreanDepanSaatIni === 0
                        ? `Kecepatan loket aktif (rata-rata ${intMedian} mnt/pasien dari ${intSamples} panggilan). Saat ini antrean kosong, pasien baru langsung dipanggil.`
                        : `Dihitung langsung dari ritme kerja loket hari ini (rata-rata ${intMedian} mnt/pasien dari ${intSamples} panggilan). Model AI sedang standby.`;
                    }

                    return (
                      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-teal-200/90 shadow-sm space-y-6">

                        {/* Header Seksi */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-teal-100">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center">
                              <Sparkles className="w-5 h-5 text-teal-600" />
                            </div>
                            <div>
                              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Analisis AI &amp; Kecepatan Loket</h3>
                              <p className="text-[11px] text-slate-500 mt-0.5">Pantau metode estimasi waktu tunggu yang dilihat pasien di layar TV dan handphone</p>
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full self-start sm:self-auto">
                            {antreanDepanSaatIni} Pasien Menunggu
                          </span>
                        </div>

                        {/* === CARD BESAR: METODE AKTIF SAAT INI === */}
                        <div className={`rounded-2xl border-2 p-4 sm:p-5 ${warnaMetodeAktif}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <span className={`w-3.5 h-3.5 rounded-full mt-1 shrink-0 ${dotWarna}`} />
                              <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Metode Yang Digunakan Saat Ini</p>
                                <p className="text-sm sm:text-base font-black leading-snug">{namaMetodeAktif}</p>
                                <p className="text-[11px] opacity-85 mt-1.5 leading-relaxed">{penjelasanMetodeAktif}</p>
                              </div>
                            </div>
                            <div className="shrink-0 text-right pl-2">
                              <p className="text-3xl sm:text-4xl font-black leading-none text-slate-900">
                                {isLoadingAiEstimate ? '…' : `${estimasiGabungan}`}
                              </p>
                              <p className="text-[10px] font-bold opacity-60 mt-0.5">menit</p>
                            </div>
                          </div>

                          {/* Checklist 3 Kondisi Aktivasi */}
                          <div className="mt-4 pt-3.5 border-t border-current/10 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {[
                              {
                                label: '1. Pola AI (CSV Riwayat)',
                                ok: isRfActive,
                                okText: `Aktif · ${statusAiModel.total_dataset.toLocaleString('id-ID')} data riwayat`,
                                noText: '0 Baris · Standby (Standar 7 mnt)',
                              },
                              {
                                label: '2. Kecepatan Loket Hari Ini',
                                ok: isIntActive,
                                okText: `Aktif · ${intMedian ?? '?'} mnt/pasien (${intSamples} panggilan)`,
                                noText: 'Standby · Butuh min. 2 panggilan',
                              },
                              {
                                label: '3. Gabungan Terpadu',
                                ok: keduaTersedia,
                                okText: antreanDepanSaatIni === 0
                                  ? 'Aktif · Siap prediksi otomatis'
                                  : `Aktif · Rata-rata (${rfMenit ?? (antreanDepanSaatIni * 7)} + ${intMenit ?? Math.round(antreanDepanSaatIni * (intMedian ?? 7))}) ÷ 2`,
                                noText: 'Otomatis aktif saat keduanya siap',
                              },
                            ].map(({ label, ok, okText, noText }) => (
                              <div key={label} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl ${ok ? 'bg-white/60 border border-emerald-200/60' : 'bg-black/5'}`}>
                                <span className={`mt-0.5 shrink-0 text-sm font-black ${ok ? 'text-emerald-600' : 'opacity-40'}`}>
                                  {ok ? '✓' : '○'}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black leading-tight">{label}</p>
                                  <p className={`text-[10px] mt-0.5 leading-snug ${ok ? 'font-bold text-emerald-800' : 'opacity-60'}`}>
                                    {ok ? okText : noText}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* === GRID 3 KARTU DETAIL KOMPONEN === */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                          {/* KARTU 1: RANDOM FOREST AI */}
                          <div className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${isRfActive ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm ${isRfActive ? 'bg-teal-100' : 'bg-slate-200'}`}>🧠</div>
                                  <p className={`text-[10px] font-black uppercase tracking-wider ${isRfActive ? 'text-teal-800' : 'text-slate-500'}`}>1. Pola AI</p>
                                </div>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isRfActive ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                  {isRfActive ? '● Aktif' : '○ Standby'}
                                </span>
                              </div>
                              <p className={`text-2xl font-black ${isRfActive ? 'text-teal-900' : 'text-slate-500'}`}>
                                {isRfActive ? (antreanDepanSaatIni === 0 ? '0 mnt' : `${rfMenit ?? (antreanDepanSaatIni * 7)} mnt`) : '0 Baris Data'}
                              </p>
                              <p className={`text-[10px] mt-1 leading-snug ${isRfActive ? 'text-teal-700' : 'text-slate-500'}`}>
                                {isRfActive
                                  ? (antreanDepanSaatIni === 0
                                      ? `Model aktif (${statusAiModel.total_dataset.toLocaleString('id-ID')} data). Menunggu antrean baru.`
                                      : `Terlatih dari ${statusAiModel.total_dataset.toLocaleString('id-ID')} riwayat antrean.`)
                                  : 'Menggunakan standar 7 menit per orang. Impor file CSV di bawah untuk melatih model.'}
                              </p>
                            </div>
                            <div className="pt-2 border-t border-current/10 text-[10px] font-semibold opacity-75">
                              Status: {isRfActive ? 'Model Random Forest Terlatih' : 'Standar Bawaan Puskesmas'}
                            </div>
                          </div>

                          {/* KARTU 2: INTERVAL LOKET LIVE */}
                          <div className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${isIntActive ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-sm ${isIntActive ? 'bg-blue-100' : 'bg-slate-200'}`}>⏱️</div>
                                  <p className={`text-[10px] font-black uppercase tracking-wider ${isIntActive ? 'text-blue-800' : 'text-slate-500'}`}>2. Kecepatan Loket</p>
                                </div>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isIntActive ? 'bg-blue-600 text-white' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                  {isIntActive ? '● Aktif' : `Perlu ${Math.max(0, 2 - intSamples)} panggilan lagi`}
                                </span>
                              </div>
                              <p className={`text-2xl font-black ${isIntActive ? 'text-blue-900' : 'text-slate-500'}`}>
                                {isIntActive ? (antreanDepanSaatIni === 0 ? '0 mnt' : `${intMenit ?? Math.round(antreanDepanSaatIni * (intMedian ?? 7))} mnt`) : 'Menunggu Panggilan'}
                              </p>
                              <p className={`text-[10px] mt-1 leading-snug ${isIntActive ? 'text-blue-700' : 'text-slate-500'}`}>
                                {isIntActive
                                  ? (antreanDepanSaatIni === 0
                                      ? `Ritme loket aktif: rata-rata ${intMedian} mnt/pasien (${intSamples} panggilan). Menunggu antrean baru.`
                                      : `Kecepatan loket hari ini: rata-rata ${intMedian} mnt/pasien (${intSamples} panggilan).`)
                                  : 'Sistem otomatis mengukur ritme panggilan setelah 2 pasien pertama dipanggil.'}
                              </p>
                            </div>
                            <div className="pt-2 border-t border-current/10 text-[10px] font-semibold opacity-75">
                              Log Hari Ini: {intSamples} panggilan tercatat
                            </div>
                          </div>

                          {/* KARTU 3: YANG DILIHAT PASIEN */}
                          <div className="rounded-2xl border-2 border-teal-500/30 bg-teal-50 p-4 flex flex-col justify-between gap-3 shadow-xs">
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-xl bg-teal-100 flex items-center justify-center text-sm">📱</div>
                                  <p className="text-[10px] font-black uppercase tracking-wider text-teal-800">3. Yang Dilihat Pasien</p>
                                </div>
                                <span className="text-[9px] font-black bg-teal-600 text-white px-2 py-0.5 rounded-full">● Live Realtime</span>
                              </div>
                              <p className="text-3xl font-black text-teal-950">
                                {isLoadingAiEstimate ? '…' : `${estimasiGabungan} mnt`}
                              </p>
                              <p className="text-[10px] mt-1 leading-snug text-teal-800">
                                {antreanDepanSaatIni === 0
                                  ? 'Antrean kosong (0 orang menunggu). Pengunjung baru langsung dilayani di loket.'
                                  : keduaTersedia
                                    ? `Rata-rata gabungan: (${rfMenit ?? (antreanDepanSaatIni * 7)} mnt + ${intMenit ?? Math.round(antreanDepanSaatIni * (intMedian ?? 7))} mnt) ÷ 2 = ${estimasiGabungan} mnt.`
                                    : isRfActive
                                      ? `Dari Pola AI: ${rfMenit ?? (antreanDepanSaatIni * 7)} mnt untuk ${antreanDepanSaatIni} orang.`
                                      : isIntActive
                                        ? `Dari kecepatan panggilan loket: ${intMenit ?? Math.round(antreanDepanSaatIni * (intMedian ?? 7))} mnt.`
                                        : `Standar 7 menit/pasien (${antreanDepanSaatIni} orang × 7 mnt = ${estimasiGabungan} mnt).`}
                              </p>
                            </div>
                            <div className="pt-2 border-t border-teal-200/80 text-[10px] font-bold text-teal-700">
                              Sinkron di layar TV &amp; tiket handphone
                            </div>
                          </div>

                        </div>

                        {/* === CARD KEAKURATAN DATA REAL-TIME === */}
                        <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${statusAiModel.model_aktif ? 'bg-teal-500 animate-pulse' : 'bg-slate-400'}`} />
                              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                Keakuratan Data Real-Time
                              </h4>
                            </div>
                            {statusAiModel.model_aktif && statusAiModel.total_dataset > 0 ? (
                              <span className="text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full self-start sm:self-auto">
                                Model Aktif ({statusAiModel.total_dataset.toLocaleString('id-ID')} Data Riil)
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full self-start sm:self-auto">
                                Belum Ada Data Pelatihan
                              </span>
                            )}
                          </div>

                          {statusAiModel.model_aktif && statusAiModel.total_dataset > 0 ? (
                            /* TAMPILAN JIKA SUDAH ADA CSV DIIMPOR (DATA NYATA) */
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3.5 bg-white rounded-xl border border-teal-200/80">
                                  <p className="text-[10px] font-black uppercase text-teal-700 tracking-wider">Akurasi Model AI (MAE)</p>
                                  <p className="text-2xl font-black text-teal-950 mt-1">
                                    {statusAiModel.metadata?.mae ? `${statusAiModel.metadata.mae} mnt` : 'Optimal'}
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                                    Rata-rata selisih prediksi dari {statusAiModel.total_dataset.toLocaleString('id-ID')} riwayat antrean riil yang diimpor.
                                  </p>
                                </div>

                                <div className="p-3.5 bg-white rounded-xl border border-blue-200/80">
                                  <p className="text-[10px] font-black uppercase text-blue-700 tracking-wider">Kecepatan Loket Hari Ini</p>
                                  <p className="text-2xl font-black text-blue-950 mt-1">
                                    {isIntActive ? `${intMedian} mnt` : '–'}
                                  </p>
                                  <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                                    {isIntActive
                                      ? `Rata-rata durasi per pasien dari ${intSamples} panggilan riil hari ini.`
                                      : 'Menunggu loket memanggil minimal 2 pasien hari ini.'}
                                  </p>
                                </div>

                                <div className="p-3.5 bg-white rounded-xl border border-slate-200">
                                  <p className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Sinkronisasi Layar</p>
                                  <p className="text-2xl font-black text-slate-900 mt-1">Aktif</p>
                                  <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                                    Perkiraan waktu tunggu otomatis diperbarui saat nomor antrean dipanggil.
                                  </p>
                                </div>
                              </div>

                              <p className="text-[10px] text-slate-400 italic">
                                * Metrik dihitung langsung dari data riil riwayat antrean Anda, bukan data simulasi.
                              </p>
                            </div>
                          ) : (
                            /* TAMPILAN KOSONG SEBELUM ADA IMPOR CSV */
                            <div className="p-5 bg-white rounded-2xl border border-dashed border-slate-200 text-center space-y-1.5">
                              <p className="text-xs font-bold text-slate-700">
                                Belum Ada Data Pelatihan AI yang Diimpor
                              </p>
                              <p className="text-[11px] text-slate-500 max-w-lg mx-auto leading-relaxed">
                                Keakuratan model AI akan dihitung secara otomatis berdasarkan data riwayat kunjungan loket Anda setelah berkas CSV diimpor pada bagian di bawah.
                              </p>
                              <div className="pt-2 text-[10px] font-semibold text-slate-400">
                                Status Saat Ini: Menggunakan aturan standar bawaan Puskesmas (7 menit/pasien).
                              </div>
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })()}

                </div>
              );
            })()}

            {/* TABEL PREVIEW LAPORAN (SINKRON DENGAN FILE CSV) */}
            <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Daftar Pengunjung Selesai ({getFilteredReportRows().length} Pasien)
                  </h3>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Periode Terpilih: <strong className="text-teal-700 font-bold">
                      {filterPeriode === 'HARIAN' ? selectedTanggal :
                       filterPeriode === 'BULANAN' ? selectedBulan :
                       filterPeriode === 'TAHUNAN' ? `Tahun ${selectedTahun}` :
                       'Semua Data'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center">No</th>
                        <th className="px-4 py-3">Nomor Antrean</th>
                        <th className="px-4 py-3">Nama Pengunjung</th>
                        {filterPeriode === 'BULANAN' && <th className="px-4 py-3">Bulan</th>}
                        {filterPeriode === 'TAHUNAN' && <th className="px-4 py-3">Bulan (1-12)</th>}
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3">Jam Daftar</th>
                        <th className="px-4 py-3">Jam Selesai</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {getFilteredReportRows().length === 0 ? (
                        <tr>
                          <td colSpan={filterPeriode === 'BULANAN' || filterPeriode === 'TAHUNAN' ? 8 : 7} className="text-center py-10 text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <span className="text-2xl">📋</span>
                              <p className="font-semibold text-xs text-slate-600">Tidak ada data antrean selesai untuk periode ini.</p>
                              <p className="text-[11px] text-slate-400">Coba pilih tanggal atau rentang waktu yang berbeda.</p>
                            </div>
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
                            {filterPeriode === 'BULANAN' && (
                              <td className="px-4 py-3 font-semibold text-slate-700">
                                {row.created_at ? new Date(row.created_at).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : '-'}
                              </td>
                            )}
                            {filterPeriode === 'TAHUNAN' && (
                              <td className="px-4 py-3 font-semibold text-teal-800">
                                {row.created_at ? `Bulan ${new Date(row.created_at).getMonth() + 1} (${new Date(row.created_at).toLocaleDateString('id-ID', { month: 'short' })})` : '-'}
                              </td>
                            )}
                            <td className="px-4 py-3 text-slate-600 font-medium">
                              {row.created_at ? new Date(row.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                            </td>
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
            </div>

            {/* ================= E. PENGELOLAAN DATA PELATIHAN AI ================= */}
            <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-7 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0 shadow-xs">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                      E. Pengelolaan Data Pelatihan AI
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kelola dataset pelatihan dan perbarui model estimasi waktu tunggu tanpa mengganggu data antrean operasional pasien.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Penyimpanan Terpisah &amp; Aman
                  </span>
                </div>
              </div>

              {/* Card Catatan Impor Terakhir */}
              <div className="p-4 sm:p-5 rounded-2xl border transition-all bg-slate-50/70 border-slate-200">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusAiModel.model_aktif && statusAiModel.total_dataset > 0 ? 'bg-teal-500' : 'bg-slate-400'}`} />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Status Dataset Pelatihan AI Saat Ini
                    </h4>
                  </div>
                  {statusAiModel.model_aktif && statusAiModel.total_dataset > 0 ? (
                    <span className="text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-teal-600" /> Model Aktif ({statusAiModel.total_dataset.toLocaleString('id-ID')} Baris)
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                      Dataset 0 Baris (Standar Bawaan)
                    </span>
                  )}
                </div>

                {statusAiModel.model_aktif && statusAiModel.total_dataset > 0 && riwayatImporTerakhir ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nama Berkas</p>
                      <p className="font-bold text-slate-800 truncate mt-0.5" title={riwayatImporTerakhir.nama_file}>
                        {riwayatImporTerakhir.nama_file || 'Dataset CSV'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Waktu Impor</p>
                      <p className="font-bold text-slate-800 mt-0.5">
                        {riwayatImporTerakhir.tanggal_impor ? new Date(riwayatImporTerakhir.tanggal_impor).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        }) : 'Tersimpan'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jumlah Baris Valid</p>
                      <p className="font-bold text-teal-700 mt-0.5">
                        {statusAiModel.total_dataset.toLocaleString('id-ID')} baris
                        {riwayatImporTerakhir.baris_ditolak > 0 && (
                          <span className="text-rose-600 text-[10px] ml-1 font-normal">
                            ({riwayatImporTerakhir.baris_ditolak} dilewati)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rentang Data Riil</p>
                      <p className="font-bold text-slate-800 mt-0.5">
                        {riwayatImporTerakhir.rentang_data || 'Semua Periode'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 text-center py-5">
                    <p className="text-xs font-semibold text-slate-700">
                      Belum ada berkas CSV yang diimpor (Dataset Pelatihan: 0 Baris).
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Sistem saat ini menggunakan standar waktu bawaan Puskesmas (7 menit/pasien). Anda dapat mengimpor berkas CSV riwayat antrean untuk melatih model Random Forest sesuai ritme kunjungan loket Anda.
                    </p>
                  </div>
                )}
              </div>

              {/* Area Unggah Berkas CSV Riwayat Antrean */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                {/* Kolom Kiri: Input File Drag/Drop */}
                <div className="lg:col-span-7 bg-slate-50 border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-3 transition-colors relative">
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileCsvChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={isRetrainingAI}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-teal-600">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {selectedCsvFile ? selectedCsvFile.name : 'Pilih atau Tarik Berkas CSV Riwayat Antrean ke Sini'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {selectedCsvFile
                        ? `Ukuran: ${(selectedCsvFile.size / 1024).toFixed(1)} KB · Siap diimpor untuk melatih model`
                        : 'Mendukung CSV hasil ekspor Harian, Bulanan, Tahunan, maupun Arsip Lengkap'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 z-20 pointer-events-none">
                    <span className="text-[10px] font-bold bg-white text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg">
                      Format CSV (UTF-8)
                    </span>
                    <span className="text-[10px] font-bold bg-white text-teal-700 border border-teal-200 px-2.5 py-1 rounded-lg">
                      Minimal 5 Data Valid
                    </span>
                  </div>
                </div>

                {/* Kolom Kanan: Aksi Eksekusi & Shortcut */}
                <div className="lg:col-span-5 flex flex-col justify-between gap-3 p-5 bg-teal-50/50 border border-teal-100 rounded-2xl">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-teal-900 mb-1">
                      Aksi Pembelajaran Model
                    </h4>
                    <p className="text-[11px] text-teal-700 leading-relaxed">
                      Sistem akan membaca pola jam sibuk dan durasi riil loket dari berkas CSV tanpa mengubah antrean hari ini.
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={handleProsesImportDanLatihAI}
                      disabled={!selectedCsvFile || isRetrainingAI}
                      className={`w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm ${
                        !selectedCsvFile || isRetrainingAI
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                          : 'bg-teal-600 hover:bg-teal-700 text-white cursor-pointer active:scale-98 shadow-teal-600/20'
                      }`}
                    >
                      {isRetrainingAI ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Sedang Melatih Model...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" /> Impor CSV &amp; Latih Model AI
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleLatihLangsungDariLaporanAktif}
                      disabled={isRetrainingAI || getFilteredReportRows().length === 0}
                      className="w-full py-2.5 px-3 rounded-xl text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-teal-600" />
                      Latih Langsung dari {getFilteredReportRows().length} Data Terfilter
                    </button>

                    {/* Tombol Reset Data Pelatihan AI */}
                    <button
                      type="button"
                      onClick={() => setShowModalResetAI(true)}
                      className="w-full py-2.5 px-3 rounded-xl text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      Reset Data Pelatihan AI ke Standar
                    </button>
                  </div>
                </div>
              </div>

              {/* Box Notifikasi Hasil Pelatihan Sukses */}
              {retrainResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-fade-in flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-emerald-950">
                        {retrainResult.pesan || 'Model AI Berhasil Diperbarui!'}
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Versi: <strong className="font-mono">{retrainResult.metadata?.versi || 'vTerbaru'}</strong> · Data Sampel: <strong>{retrainResult.total_data_diimpor || retrainResult.metadata?.total_sampel || 0}</strong> baris
                        {retrainResult.ringkasan?.rentang_data && (
                          <span> · Rentang: <strong>{retrainResult.ringkasan.rentang_data}</strong></span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 px-3 py-1 rounded-full self-start sm:self-auto">
                    Model Siap Digunakan
                  </span>
                </div>
              )}

              {/* 3 Langkah Informasi Alur Ramah Petugas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <div>
                    <p className="text-[11px] font-black text-slate-800">Ekspor Laporan</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      Gunakan tabel laporan di atas untuk mengunduh rekapan riwayat antrean dalam format CSV.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="text-[11px] font-black text-slate-800">Unggah &amp; Latih</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      Unggah berkas CSV ke bagian ini. Sistem akan mempelajari pola interval loket secara otomatis.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="w-6 h-6 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <div>
                    <p className="text-[11px] font-black text-slate-800">Data Operasional Aman</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      Pelatihan dan reset model AI disimpan terpisah, sehingga tidak pernah menghapus antrean pasien yang berjalan.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ================= TAB 4: KELOLA ADMIN ================= */}
        {activeMenu === 'sandi' && (
          <div className="w-full animate-fade-in space-y-6">
            {/* Header Kelola Admin */}
            <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-teal-800/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-400/30 flex items-center justify-center shrink-0 shadow-inner">
                    <Users className="w-7 h-7 text-teal-300" />
                  </div>
                  <div>
                    <h2 className="font-black text-white text-xl tracking-tight">Kelola Akun &amp; Kredensial Petugas</h2>
                    <p className="text-xs text-teal-200/80 mt-0.5">Atur hak akses petugas, tambahkan personel baru, dan kelola kata sandi akun</p>
                  </div>
                </div>

                {/* Badge Akun Aktif */}
                <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3 self-start sm:self-auto">
                  <div className="w-8 h-8 rounded-xl bg-teal-400/20 text-teal-300 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-teal-300">Akun Petugas Aktif</p>
                    <p className="text-xs font-bold text-white truncate max-w-[200px]">
                      {adminEmail || (adminUsername.includes('@') ? adminUsername : `${adminUsername}@organisasi.com`)}
                    </p>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-teal-300 shrink-0 ml-1" />
                </div>
              </div>
            </div>

            {/* Grid 2-Kolom: Tambah Akun Baru (Kiri) | Ganti Sandi Saya (Kanan) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

              {/* ===== KOLOM 1: TAMBAH AKUN PETUGAS BARU ===== */}
              <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-7 space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 shadow-2xs">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Tambah Akun Petugas Baru</h3>
                    <p className="text-[11px] text-slate-500">Daftarkan akun login tambahan untuk staf operasional loket</p>
                  </div>
                </div>

                <form onSubmit={handleBukaModalTambahAkun} autoComplete="off" className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Alamat Email Petugas Baru <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={emailAkunBaru}
                        onChange={(e) => setEmailAkunBaru(e.target.value)}
                        placeholder="contoh: petugas2@organisasi.com"
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 pl-11"
                        required
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Kata Sandi Awal (Min. 8 Karakter) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswordAkunBaru ? 'text' : 'password'}
                        value={passwordAkunBaru}
                        onChange={(e) => setPasswordAkunBaru(e.target.value)}
                        placeholder="Minimal 8 karakter..."
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium pr-11 text-slate-800"
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordAkunBaru(!showPasswordAkunBaru)}
                        className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPasswordAkunBaru ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md shadow-teal-600/20 cursor-pointer transition-all flex items-center justify-center gap-2 pt-3"
                  >
                    <UserPlus className="w-4 h-4" /> Daftarkan Akun Petugas
                  </button>
                </form>

                {/* Kebijakan Akses Petugas */}
                <div className="pt-2">
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-1.5">
                    <p className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-teal-600" /> Kebijakan Akses Operasional
                    </p>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Setiap akun petugas yang terdaftar memiliki hak akses untuk memanggil tiket, melayani pengunjung, serta mencetak rekapan laporan operasional.
                    </p>
                  </div>
                </div>
              </div>

              {/* ===== KOLOM 2: GANTI KATA SANDI SAYA ===== */}
              <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-7 space-y-5">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 shadow-2xs">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Perbarui Kata Sandi Saya</h3>
                    <p className="text-[11px] text-slate-500">Ganti kata sandi akun petugas yang sedang digunakan saat ini</p>
                  </div>
                </div>

                <form onSubmit={handleBukaModalGantiSandi} autoComplete="off" className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      1. Kata Sandi Saat Ini <span className="text-rose-500">*</span>
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
                        placeholder="Ketik kata sandi saat ini..."
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

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      2. Kata Sandi Baru (Min. 8 Karakter) <span className="text-rose-500">*</span>
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
                        placeholder="Minimal 8 karakter..."
                        className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium pr-11 text-slate-800"
                        required
                        minLength={8}
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

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      3. Konfirmasi Ulang Kata Sandi Baru <span className="text-rose-500">*</span>
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
                      placeholder="Ulangi kata sandi baru persis..."
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                      required
                      minLength={8}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingPass}
                    className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md shadow-teal-600/20 cursor-pointer transition-all flex items-center justify-center gap-2 pt-3"
                  >
                    {isChangingPass ? (
                      'Memproses...'
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> Simpan Kata Sandi Baru</>
                    )}
                  </button>
                </form>

                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-400 text-center sm:text-left">
                    Tersimpan aman dengan enkripsi standar industri.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLupaSandiEmail(adminEmail || (adminUsername.includes('@') ? adminUsername : ''));
                      setShowLupaSandiModal(true);
                    }}
                    className="text-xs font-bold text-teal-600 hover:text-teal-800 hover:underline cursor-pointer shrink-0"
                  >
                    Lupa sandi? Reset via email →
                  </button>
                </div>
              </div>

            </div>

            {/* ===== SECTION BAWAH: DAFTAR AKUN PETUGAS TERDAFTAR ===== */}
            <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-7 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Daftar Akun Petugas Terdaftar</h3>
                    <p className="text-[11px] text-slate-500">Kelola dan tinjau seluruh personel yang memiliki akses ke portal loket</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={loadDaftarAkunPetugas}
                    disabled={isLoadingDaftarAkun}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-200"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDaftarAkun ? 'animate-spin' : ''}`} />
                    {isLoadingDaftarAkun ? 'Memuat...' : 'Muat Ulang'}
                  </button>
                </div>
              </div>

              {/* Tabel / List Akun */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] bg-slate-50/70">
                      <th className="py-3 px-4 font-bold rounded-l-xl">No</th>
                      <th className="py-3 px-4 font-bold">Alamat Email Petugas</th>
                      <th className="py-3 px-4 font-bold">Peran Akses</th>
                      <th className="py-3 px-4 font-bold text-center">Status</th>
                      <th className="py-3 px-4 font-bold text-right rounded-r-xl">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {daftarAkunPetugas.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          {isLoadingDaftarAkun ? 'Sedang memuat daftar akun...' : 'Belum ada data akun tambahan atau akun utama belum disinkronkan.'}
                        </td>
                      </tr>
                    ) : (
                      daftarAkunPetugas.map((akun, idx) => {
                        const emailAkun = akun.email || '';
                        const emailAktif = (adminEmail || adminUsername || '').trim().toLowerCase();
                        const isAkunAktif = emailAkun.toLowerCase() === emailAktif || (emailAktif && emailAkun.toLowerCase().includes(emailAktif));

                        return (
                          <tr key={akun.id || idx} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-400">{idx + 1}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-xs shrink-0">
                                  {emailAkun.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-bold text-slate-900">{emailAkun}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200">
                                {akun.peran || 'Petugas'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {isAkunAktif ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                                  <ShieldCheck className="w-3 h-3 text-teal-600" /> Akun Anda (Aktif)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                                  Terdaftar
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {isAkunAktif ? (
                                <span className="text-[11px] text-slate-400 italic">Sesi Aktif</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleBukaModalHapusAkun(emailAkun)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer shadow-2xs"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Hapus Akun
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ================= MODAL KONFIRMASI BATALKAN ANTREAN ================= */}
      {showBatalModal && itemAkanDibatalkan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <Ban className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-1">
              Batalkan Antrean?
            </h3>
            
            <div className="my-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-left">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                <span>Nomor Tiket:</span>
                <span className="text-sm font-black text-slate-900">{itemAkanDibatalkan.nomor}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>Nama Pengunjung:</span>
                <span className="text-sm font-bold text-slate-800 truncate max-w-[170px]">{itemAkanDibatalkan.nama}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Tindakan ini tidak dapat diurungkan. Untuk konfirmasi pembatalan, silakan ketik kata <strong className="text-rose-600 font-mono">batalkan</strong> di bawah:
            </p>

            <input
              type="text"
              autoFocus
              value={teksKonfirmasiBatal}
              onChange={(e) => setTeksKonfirmasiBatal(e.target.value)}
              placeholder='Ketik "batalkan"'
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-medium text-slate-800 text-center focus:outline-none focus:ring-2 focus:ring-rose-500 mb-5"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && teksKonfirmasiBatal.trim().toLowerCase() === 'batalkan') {
                  handleKonfirmasiBatal();
                }
              }}
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowBatalModal(false);
                  setItemAkanDibatalkan(null);
                  setTeksKonfirmasiBatal('');
                }}
                disabled={isSubmittingBatal}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleKonfirmasiBatal}
                disabled={teksKonfirmasiBatal.trim().toLowerCase() !== 'batalkan' || isSubmittingBatal}
                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-rose-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSubmittingBatal ? 'Memproses...' : 'Ya, Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH ANTREAN MANUAL ================= */}
      {showTambahAntreanModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-teal-100 shadow-2xs">
              <UserPlus className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-black text-slate-900 text-center mb-1">
              Tambah Antrean Pengunjung
            </h3>
            
            <p className="text-xs text-slate-500 text-center mb-4 leading-relaxed">
              Daftarkan antrean baru untuk pengunjung yang hadir langsung di loket pelayanan.
            </p>

            <form onSubmit={handleTambahAntreanManual} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Nama Lengkap Pengunjung <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={namaPengunjungBaru}
                  onChange={(e) => setNamaPengunjungBaru(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="p-3 bg-teal-50/70 rounded-2xl border border-teal-100 text-[11px] text-teal-800 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" /> Nomor Urut Otomatis
                </p>
                <p className="text-teal-700 leading-snug">
                  Nomor tiket berikutnya akan digenerate otomatis secara atomik dan langsung masuk ke daftar antrean.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTambahAntreanModal(false);
                    setNamaPengunjungBaru('');
                  }}
                  disabled={isSubmittingTambah}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!namaPengunjungBaru.trim() || isSubmittingTambah}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-teal-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmittingTambah ? 'Menyimpan...' : 'Daftarkan Tiket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              Tindakan ini akan <strong>menutup loket pendaftaran</strong> dan <strong>mengarsipkan antrean hari ini</strong>. Hanya data pengunjung yang berstatus <strong>SELESAI</strong> yang disimpan dalam riwayat laporan. Antrean baru berikutnya akan dimulai kembali dari nomor <strong>A01</strong> saat loket dibuka kembali.
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
                onClick={async () => {
                  try {
                    await fetch('/api/auth/keluar', { method: 'POST' });
                    if (isSupabaseConfigured && supabase?.auth) {
                      await supabase.auth.signOut().catch(() => {});
                    }
                  } catch (_) {}
                  setShowLogoutModal(false);
                  setIsLoggedIn(false);
                  sessionStorage.removeItem('admin_is_logged_in');
                  showToast('Sesi petugas berhasil diakhiri.', 'info');
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-rose-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI SIMPAN PENGATURAN ================= */}
      {showModalSimpanPengaturan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-2">
              Simpan Pengaturan Organisasi?
            </h3>
            
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Perubahan profil, media visual, navigasi GPS, dan pengumuman akan segera diterapkan ke server dan disinkronkan ke seluruh layar pengunjung secara langsung.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowModalSimpanPengaturan(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Periksa Kembali
              </button>
              <button
                type="button"
                onClick={handleKonfirmasiSimpanPengaturan}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-teal-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                Ya, Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI BATALKAN PERUBAHAN FORM ================= */}
      {showModalBatalEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-amber-100">
              <RotateCcw className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-2">
              Batalkan Perubahan Formulir?
            </h3>
            
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Semua teks dan pengaturan yang baru saja Anda ketik dan belum disimpan akan dikembalikan persis seperti data terakhir di server.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowModalBatalEdit(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Tetap di Sini
              </button>
              <button
                type="button"
                onClick={handleKonfirmasiBatalEdit}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-amber-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                Ya, Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI HAPUS PENGUMUMAN DARURAT ================= */}
      {showModalHapusPengumuman && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <XCircle className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-2">
              Hapus Pengumuman Darurat?
            </h3>
            
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Banner merah peringatan darurat akan dihapus dan tidak lagi ditampilkan di layar pengunjung maupun monitor display.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowModalHapusPengumuman(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleKonfirmasiHapusPengumuman}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-rose-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI GANTI KATA SANDI ================= */}
      {showModalKonfirmasiGantiSandi && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
              <Key className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-2">
              Perbarui Kata Sandi Petugas?
            </h3>
            
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Kata sandi akun petugas akan diperbarui secara aman. Pastikan Anda mengingat kata sandi baru untuk masuk pada sesi berikutnya.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowModalKonfirmasiGantiSandi(false)}
                disabled={isChangingPass}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleKonfirmasiGantiSandi}
                disabled={isChangingPass}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-teal-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isChangingPass ? 'Menyimpan...' : 'Ya, Perbarui Sandi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI TAMBAH AKUN PETUGAS ================= */}
      {showModalKonfirmasiTambahAkun && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-teal-100">
              <UserPlus className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-2">
              Daftarkan Akun Petugas?
            </h3>
            
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Anda akan mendaftarkan akun login baru dengan alamat email:
            </p>

            <div className="bg-teal-50/70 border border-teal-200 rounded-2xl p-3 mb-5 font-bold text-teal-900 text-xs break-all">
              {emailAkunBaru}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowModalKonfirmasiTambahAkun(false)}
                disabled={isSubmittingTambahAkun}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleEksekusiTambahAkun}
                disabled={isSubmittingTambahAkun}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-teal-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSubmittingTambahAkun ? 'Memproses...' : 'Ya, Daftarkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI HAPUS AKUN (2 TAHAP) ================= */}
      {showModalHapusAkun && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 text-left">
            
            {tahapHapusAkun === 1 ? (
              /* TAHAP 1: KETIK ALAMAT EMAIL AKUN */
              <div>
                <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-100">
                  <AlertTriangle className="w-7 h-7" />
                </div>

                <div className="text-center mb-4">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 mb-1.5">
                    Konfirmasi Tahap 1 dari 2
                  </span>
                  <h3 className="text-lg font-black text-slate-900">
                    Verifikasi Alamat Email Akun
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Tindakan ini permanen. Untuk melanjutkan proses penghapusan, ketik ulang alamat email akun berikut persis:
                  </p>
                </div>

                <div className="bg-slate-100 border border-slate-200 rounded-2xl p-3 text-center mb-4 font-mono font-bold text-xs text-slate-800 break-all select-all">
                  {targetAkunHapus}
                </div>

                <form onSubmit={handleLanjutTahap2Hapus} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Ketik Ulang Email di Atas <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={inputEmailHapus}
                      onChange={(e) => setInputEmailHapus(e.target.value)}
                      placeholder="Ketik alamat email persis..."
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowModalHapusAkun(false)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={inputEmailHapus.trim().toLowerCase() !== targetAkunHapus.trim().toLowerCase()}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-amber-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      Lanjut ke Tahap 2 ➔
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* TAHAP 2: KETIK KATA HAPUS AKUN */
              <div>
                <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-rose-100">
                  <Trash2 className="w-7 h-7" />
                </div>

                <div className="text-center mb-4">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 mb-1.5">
                    Konfirmasi Tahap 2 dari 2 (Terakhir)
                  </span>
                  <h3 className="text-lg font-black text-slate-900">
                    Konfirmasi Hapus Akun Permanen
                  </h3>
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 mb-4 space-y-1">
                  <p className="text-[11px] font-black text-rose-900 uppercase tracking-wide">
                    Peringatan Tindakan Permanen
                  </p>
                  <p className="text-[11px] text-rose-700 leading-snug">
                    Akun <span className="font-bold">{targetAkunHapus}</span> akan dicabut aksesnya dan dihapus selamanya dari sistem.
                  </p>
                </div>

                <form onSubmit={handleEksekusiHapusAkun} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Ketik kata <span className="text-rose-600 font-mono font-black">HAPUS AKUN</span> untuk mengeksekusi <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={inputTeksHapus}
                      onChange={(e) => setInputTeksHapus(e.target.value)}
                      placeholder="HAPUS AKUN"
                      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold font-mono tracking-widest text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setTahapHapusAkun(1)}
                      disabled={isSubmittingHapusAkun}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
                    >
                      ← Kembali
                    </button>
                    <button
                      type="submit"
                      disabled={inputTeksHapus.trim() !== 'HAPUS AKUN' || isSubmittingHapusAkun}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-rose-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isSubmittingHapusAkun ? 'Menghapus...' : 'Hapus Akun Permanen'}
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ================= MODAL LUPA KATA SANDI (DARI DASHBOARD ADMIN) ================= */}
      {showLupaSandiModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-left">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-teal-100 shadow-2xs">
              <Mail className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-black text-slate-900 text-center mb-1">
              Atur Ulang Kata Sandi
            </h3>
            <p className="text-xs text-slate-500 text-center mb-4 leading-relaxed">
              Tautan verifikasi pemulihan kata sandi akan dikirim ke kotak masuk email akun petugas Anda.
            </p>

            <form onSubmit={handleKirimLupaSandi} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Alamat Email Petugas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={lupaSandiEmail}
                  onChange={(e) => setLupaSandiEmail(e.target.value)}
                  placeholder="admin@organisasi.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLupaSandiModal(false)}
                  disabled={isSubmittingLupaSandi}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!lupaSandiEmail.trim() || isSubmittingLupaSandi}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-teal-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmittingLupaSandi ? 'Mengirim...' : 'Kirim Tautan'}
                </button>
              </div>
            </form>
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

      {/* ================= MODAL ATUR SANDI BARU (DARI EMAIL LINK - MODE TERAUTENTIKASI) ================= */}
      {isResetPasswordMode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-left">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-teal-100 shadow-2xs">
              <Key className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-black text-slate-900 text-center mb-1">
              Buat Kata Sandi Baru
            </h3>
            <p className="text-xs text-slate-500 text-center mb-4 leading-relaxed">
              Anda mengakses sistem melalui tautan pemulihan email. Silakan tentukan kata sandi baru untuk akun petugas Anda.
            </p>

            <form onSubmit={handleEksekusiResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Kata Sandi Baru (Min. 8 Karakter) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showResetPassBaru ? 'text' : 'password'}
                    required
                    autoFocus
                    minLength={8}
                    value={resetPassBaru}
                    onChange={(e) => setResetPassBaru(e.target.value)}
                    placeholder="Minimal 8 karakter..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassBaru(!showResetPassBaru)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showResetPassBaru ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Konfirmasi Kata Sandi Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showResetPassKonfirm ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={resetPassKonfirm}
                    onChange={(e) => setResetPassKonfirm(e.target.value)}
                    placeholder="Ketik ulang kata sandi baru..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassKonfirm(!showResetPassKonfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showResetPassKonfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Indikator Kesesuaian Kata Sandi */}
                {resetPassKonfirm && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
                    {resetPassBaru === resetPassKonfirm ? (
                      <span className="text-teal-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Kata sandi cocok
                      </span>
                    ) : (
                      <span className="text-rose-600 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Kata sandi belum cocok
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsResetPasswordMode(false)}
                  disabled={isSubmittingResetPass}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!resetPassBaru || resetPassBaru.length < 8 || resetPassBaru !== resetPassKonfirm || isSubmittingResetPass}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-teal-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmittingResetPass ? 'Menyimpan...' : 'Simpan Sandi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL KONFIRMASI RESET DATA PELATIHAN AI ================= */}
      {showModalResetAI && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 text-left space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0 border border-rose-100">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Reset Data Pelatihan AI?
                </h3>
                <p className="text-xs text-slate-500">
                  Kembalikan model perkiraan waktu ke pengaturan standar
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
              <p className="font-bold text-slate-800">Tindakan ini akan mereset:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li>Riwayat dataset pelatihan yang diimpor (tabel pelatihan).</li>
                <li>Bobot model Random Forest kembali ke standar bawaan (~7 menit/pasien).</li>
              </ul>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-900 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Data antrean pasien hari ini, riwayat panggilan, &amp; akun admin <strong>AMAN</strong> (tidak dihapus).</span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModalResetAI(false)}
                disabled={isResettingAI}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer border border-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleEksekusiResetDataPelatihan}
                disabled={isResettingAI}
                className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-xs shadow-md shadow-rose-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isResettingAI ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Mereset...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" /> Ya, Reset Model
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Evaluasi Simulasi kini sudah disajikan langsung dalam Card Inline di Halaman Laporan */}

    </main>
  );
}
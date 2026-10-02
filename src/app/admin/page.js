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
  ShieldCheck
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
  // State Autentikasi & Akun Petugas (Tersimpan di Supabase)
  // -------------------------------------------------------------
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('admin_is_logged_in') === 'true';
    }
    return false;
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [savedUsername, setSavedUsername] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_username') || 'admin';
    }
    return 'admin';
  });
  const [savedPass, setSavedPass] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_password') || 'puskesmas123';
    }
    return 'puskesmas123';
  });
  const [activeMenu, setActiveMenu] = useState('antrean'); // 'antrean' | 'profil' | 'laporan' | 'sandi'

  // State Ganti Sandi Form
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);

  // Toggle Suara Admin
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem('admin_sound_enabled');
      return s !== null ? s === 'true' : true;
    }
    return true;
  });

  // -------------------------------------------------------------
  // State Antrean & Operasional
  // -------------------------------------------------------------
  const [daftarAntrean, setDaftarAntrean] = useState([]);
  const [filterStatus, setFilterStatus] = useState('AKTIF'); // 'AKTIF' | 'SEMUA' | 'MENUNGGU' | 'MEMANGGIL' | 'TERLAMBAT' | 'SELESAI'
  const [searchQuery, setSearchQuery] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
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

  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3500);
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

    if (currentPass !== savedPass) {
      alert('Password saat ini tidak sesuai!');
      return;
    }

    if (newPass.length < 6) {
      alert('Password baru minimal 6 karakter!');
      return;
    }

    if (newPass !== confirmPass) {
      alert('Konfirmasi password tidak cocok!');
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
      showToast('Password admin berhasil diperbarui di server Supabase!', 'success');
    } catch (err) {
      console.error('Gagal memperbarui password:', err);
      alert('Terjadi kesalahan saat menyimpan password ke Supabase.');
    } finally {
      setIsChangingPass(false);
    }
  };

  const toggleSound = () => {
    const nextState = !soundEnabled;
    setSoundEnabled(nextState);
    localStorage.setItem('admin_sound_enabled', String(nextState));
    showToast(`Suara pemanggilan: ${nextState ? 'AKTIF 🔊' : 'SENYAP 🔇'}`, 'info');
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
  // RENDER: PANEL LOGIN
  // -------------------------------------------------------------
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
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
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
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
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
              className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800 font-bold transition-colors"
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
    <main className="min-h-screen text-slate-800 font-sans pb-20 relative bg-white">

      {/* LATAR BELAKANG FOTO PUSKESMAS (Sama seperti halaman pasien) */}
      {fotoPuskesmasUrl ? (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center transition-all duration-700 opacity-65 scale-100"
            style={{ backgroundImage: `url("${fotoPuskesmasUrl}")` }}
          />
          {/* Lapisan overlay putih lembut agar foto terlihat soft dan tulisan sangat jelas */}
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px]" />
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

      <div className="relative z-10 max-w-6xl mx-auto p-4 sm:p-6">

        {/* ================= HEADER ADMIN ================= */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-xs border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 overflow-hidden">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 flex items-center justify-center text-3xl font-black shadow-xs shrink-0 overflow-hidden">
              {logoUrl.startsWith('http') || logoUrl.startsWith('data:') ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                logoUrl || '🏥'
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-teal-100 text-teal-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                  Panel Loket Utama
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  statusBuka ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusBuka ? 'bg-emerald-600' : 'bg-red-600'}`} />
                  {statusBuka ? 'Pendaftaran Buka' : 'Pendaftaran Tutup'}
                </span>
              </div>
              <h1 className="text-xl font-black text-slate-900 mt-0.5 truncate">{namaPuskesmas}</h1>
              <p className="text-xs text-slate-500 truncate">{alamatPuskesmas}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Toggle Suara Admin */}
            <button
              onClick={toggleSound}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                soundEnabled
                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
              }`}
              title="Toggle Suara Pemanggilan"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-blue-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              <span>{soundEnabled ? 'Suara Loket: ON' : 'Suara Loket: OFF'}</span>
            </button>

            {/* Buka Layar Pasien di TAB BARU */}
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            >
              Layar Pasien ↗
            </a>

            {/* Logout */}
            <button
              onClick={() => {
                setIsLoggedIn(false);
                sessionStorage.removeItem('admin_is_logged_in');
              }}
              className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-3.5 py-2 rounded-xl border border-red-200 transition-all cursor-pointer flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" /> Keluar
            </button>
          </div>
        </div>

        {/* ================= TAB MENU (RINGKAS: KELOLA ANTREAN) ================= */}
        <div className="flex bg-white p-1.5 rounded-2xl shadow-xs border border-slate-200 mb-6 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveMenu('antrean')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMenu === 'antrean' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" /> Kelola Antrean
          </button>
          <button
            onClick={() => setActiveMenu('profil')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMenu === 'profil' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4" /> Media & Profil Puskesmas
          </button>
          <button
            onClick={() => setActiveMenu('laporan')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMenu === 'laporan' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Download className="w-4 h-4" /> Ekspor CSV / Excel
          </button>
          <button
            onClick={() => setActiveMenu('sandi')}
            className={`flex-1 py-2.5 px-4 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMenu === 'sandi' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
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
                          ? `Status: ${pasienTeratas.status} • Panggilan: ${pasienTeratas.panggilan_ke || 0}/3 (Ke-4 Lewati)`
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
                    {pasienTeratas ? `Panggilan ${pasienTeratas.panggilan_ke || 0}/3 (Ke-4 Lewati)` : 'Tidak ada pasien'}
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
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200 p-5 sm:p-6">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <div className="relative flex-1 w-full sm:max-w-xs">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama atau nomor..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                  {['AKTIF', 'SEMUA', 'MENUNGGU', 'MEMANGGIL', 'TERLAMBAT', 'SELESAI'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setFilterStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        filterStatus === st ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
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
                          ? 'bg-blue-50/60 border-blue-300 ring-2 ring-blue-200'
                          : item.status === 'TERLAMBAT'
                          ? 'bg-amber-50/40 border-amber-200'
                          : item.status === 'SELESAI'
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : 'bg-white border-slate-200/80 hover:border-slate-300'
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
          <div className="bg-white rounded-3xl shadow-xs border border-slate-200 p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base">Profil, Media & Pengumuman Puskesmas</h2>
                <p className="text-xs text-slate-400">Pengaturan ini tersinkronisasi secara real-time ke layar seluruh pasien.</p>
              </div>
            </div>

            <form onSubmit={handleSimpanPengaturan} className="space-y-5">
              
              {/* Profil Teks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Nama Puskesmas
                  </label>
                  <input
                    type="text"
                    value={namaPuskesmas}
                    onChange={(e) => setNamaPuskesmas(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
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
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                    required
                  />
                </div>
              </div>

              {/* Upload Logo Puskesmas */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Logo Puskesmas (Emoji / URL / Upload File)
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-2xl overflow-hidden shrink-0">
                    {logoUrl.startsWith('http') || logoUrl.startsWith('data:') ? (
                      <img src={logoUrl} alt="Preview" className="w-full h-full object-contain p-1" />
                    ) : (
                      logoUrl || '🏥'
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="Emoji 🏥 atau URL gambar..."
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium"
                    />
                    <label className="inline-flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Unggah File Logo
                      <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setLogoUrl)} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Upload Foto Latar Belakang Puskesmas */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Foto Latar Belakang Puskesmas (Tampil di Layar Pasien)
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-16 rounded-2xl bg-white border border-slate-200 overflow-hidden shrink-0">
                    {fotoPuskesmasUrl ? (
                      <img src={fotoPuskesmasUrl} alt="Latar Belakang" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                        Belum Ada
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={fotoPuskesmasUrl}
                      onChange={(e) => setFotoPuskesmasUrl(e.target.value)}
                      placeholder="URL Foto Puskesmas..."
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium"
                    />
                    <label className="inline-flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Unggah Foto Latar Belakang
                      <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setFotoPuskesmasUrl)} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Integrasi Google Maps & Koordinat OSRM */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  Lokasi Google Maps & Koordinat
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Link Google Maps (Mendukung link maps.google.com atau maps.app.goo.gl)
                  </label>
                  <input
                    type="text"
                    value={mapsUrl}
                    onChange={(e) => handleMapsUrlChange(e.target.value)}
                    placeholder="https://maps.google.com/?q=-0.5282,102.5853"
                    className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Latitude (Lat)</label>
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => setLatitude(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Longitude (Lon)</label>
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => setLongitude(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Informasi Penting Syarat Pasien */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Informasi Penting Syarat Pasien (KTP/KK Fisik)
                </label>
                <textarea
                  rows={2}
                  value={infoPenting}
                  onChange={(e) => setInfoPenting(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>

              {/* Pengumuman Darurat */}
              <div className="bg-red-50/80 border border-red-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-red-700 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-red-600" />
                    Pengumuman Darurat (Tampil Live di Layar Pasien)
                  </span>
                  {pengumumanDarurat && (
                    <button
                      type="button"
                      onClick={handleHapusPengumumanDarurat}
                      className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-3 py-1 rounded-xl cursor-pointer flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Hapus Pengumuman
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={pengumumanDarurat}
                  onChange={(e) => setPengumumanDarurat(e.target.value)}
                  placeholder="Contoh: Loket tutup jam 11:30 WIB karena rapat koordinasi..."
                  className="w-full px-4 py-3 rounded-xl bg-white border border-red-200 text-sm text-red-900 placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
                />
              </div>

              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-3.5 rounded-2xl text-xs shadow-md shadow-teal-600/20 transition-all cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" /> Simpan Pengaturan
              </button>

            </form>
          </div>
        )}

        {/* ================= TAB 3: EKSPOR LAPORAN CSV / EXCEL ================= */}
        {activeMenu === 'laporan' && (
          <div className="bg-white rounded-3xl shadow-xs border border-slate-200 p-6 space-y-5">
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
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Pilih Periode
                </label>
                <div className="flex gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                  {['HARIAN', 'BULANAN', 'TAHUNAN', 'SEMUA'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setFilterPeriode(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        filterPeriode === p ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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

            <div className="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200 leading-relaxed">
              <span className="font-bold text-slate-800 block mb-1">Informasi Kolom Laporan:</span>
              File CSV / Excel berisi kolom yang sinkron: <strong>No</strong>, <strong>Nomor Antrean</strong>, <strong>Nama Pasien</strong>, <strong>Jam Daftar</strong>, dan <strong>Jam Selesai</strong>.
            </div>
          </div>
        )}

        {/* ================= TAB 4: GANTI SANDI ADMIN ================= */}
        {activeMenu === 'sandi' && (
          <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-black text-slate-900 text-lg">Keamanan & Sandi Loket</h2>
                <p className="text-xs text-slate-400">Kata sandi tersimpan dan tersinkronisasi di Supabase</p>
              </div>
            </div>

            {/* Info Akun Aktif */}
            <div className="bg-teal-50/70 border border-teal-100 rounded-2xl p-4 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-teal-950">Username Petugas: {savedUsername}</p>
                  <p className="text-[11px] text-teal-700">Tersinkronisasi otomatis dengan server Supabase</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Password Saat Ini
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    placeholder="Masukkan password lama"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium pr-11"
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
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Password Baru (Min. 6 Karakter)
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Masukkan password baru"
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium pr-11"
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

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Konfirmasi Password Baru
                </label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="Ketik ulang password baru"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
                  required
                  minLength={6}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-2xl text-xs shadow-md shadow-teal-600/20 cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  {isChangingPass ? (
                    'Menyimpan ke Supabase...'
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Simpan Sandi Baru ke Supabase
                    </>
                  )}
                </button>
              </div>
            </form>
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
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer"
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

    </main>
  );
}
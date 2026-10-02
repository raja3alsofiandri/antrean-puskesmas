'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  User, 
  Clock, 
  Users, 
  AlertTriangle, 
  Search, 
  Volume2, 
  Trash2, 
  ExternalLink, 
  Lock, 
  ArrowRight, 
  ArrowLeft, 
  Info, 
  Navigation, 
  RotateCcw,
  CheckCircle2,
  Ticket
} from 'lucide-react';
import { 
  supabase, 
  isSupabaseConfigured, 
  generateNextQueueNumber,
  calculateOSRMRoute,
  calculateHaversineDistance
} from '@/lib/supabaseClient';
import { 
  registerServiceWorker, 
  requestNotificationPermission, 
  sendSystemNotification, 
  playNotificationChime,
  unlockAudio
} from '@/lib/pwa';

export default function PatientPage() {
  // -------------------------------------------------------------
  // State Input & Navigasi Tab
  // -------------------------------------------------------------
  const [inputNama, setInputNama] = useState('');
  const [tabAktif, setTabAktif] = useState('ambil'); // 'ambil' | 'cari'
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  // -------------------------------------------------------------
  // State Antrean Pasien Aktif & Publik
  // -------------------------------------------------------------
  const [myQueue, setMyQueue] = useState(null);
  const [tampilkanTiket, setTampilkanTiket] = useState(true); // Toggle lihat tiket vs halaman input
  const [allQueues, setAllQueues] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [notificationToast, setNotificationToast] = useState(null);

  // -------------------------------------------------------------
  // State OSRM & GPS Realtime
  // -------------------------------------------------------------
  const [gpsData, setGpsData] = useState({
    loading: false,
    jarakKm: '± 3.0 KM',
    waktuTempuh: '± 8 Menit',
    metode: 'GPS Realtime',
    error: null,
  });

  // -------------------------------------------------------------
  // State Konfigurasi Puskesmas (Default Bersih Tanpa Foto Bawaan)
  // -------------------------------------------------------------
  const [config, setConfig] = useState({
    namaPuskesmas: 'Puskesmas Kuala Cenaku',
    alamatPuskesmas: 'Jl. Kesehatan No. 1, Kuala Cenaku, Kab. Indragiri Hulu, Riau',
    logoUrl: '🏥',
    fotoPuskesmasUrl: '', // Latar belakang awal putih bersih
    infoPenting: 'Wajib membawa KTP atau Kartu Keluarga (KK) fisik saat datang ke loket. Toleransi keterlambatan maksimal 15 Menit.',
    statusBuka: true,
    pengumumanDarurat: '',
    latitude: -0.5282,
    longitude: 102.5853,
    mapsUrl: 'https://maps.google.com/?q=-0.5282,102.5853',
  });

  const lastCallIdRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const lastCoordsRef = useRef({ lat: null, lon: null });
  const notifiedFiveBesarRef = useRef(new Set());

  const showToast = (message, type = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setNotificationToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setNotificationToast(null), 4000);
  };

  // -------------------------------------------------------------
  // 1. Text-To-Speech & Notifikasi Suara (Bip Medis + Suara Pasien)
  // -------------------------------------------------------------
  useEffect(() => {
    unlockAudio();
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

  // Suara Panggilan Realtime (Bip Medis Dilanjutkan Membaca Nomor Antrean dan Nama Pasien)
  const playCallingVoice = useCallback((nomor, namaPasien, panggilanKe = 1) => {
    // 1. Bunyikan nada bip lonceng medis klinis
    playNotificationChime();

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();

      const intro = panggilanKe > 1 ? 'Panggilan ulang. ' : '';
      const nomorSpelled = (nomor || '').replace(/([A-Za-z])(\d+)/, '$1 $2');
      const kalimat = `${intro}Nomor antrean, ${nomorSpelled}, atas nama, ${namaPasien}, silakan menuju ke loket pemeriksaan sekarang.`;
      
      const utterance = new SpeechSynthesisUtterance(kalimat);
      utterance.lang = 'id-ID';
      utterance.rate = 0.88;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const idVoice = voices.find((v) => 
        (v.lang && (v.lang === 'id-ID' || v.lang.startsWith('id'))) ||
        (v.name && (v.name.toLowerCase().includes('indonesia') || v.name.toLowerCase().includes('id-id') || v.name.toLowerCase().includes('gadis') || v.name.toLowerCase().includes('damayanti')))
      );
      if (idVoice) utterance.voice = idVoice;

      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 550);
    } catch (err) {
      console.warn('Gagal membunyikan Text-to-Speech panggilan:', err);
    }
  }, []);

  // Suara Notifikasi Kesehatan & Peringatan Waktu Tiba (Saat Masuk Panggilan Bersiap)
  const playPeringatanLimaBesarVoice = useCallback((nomor, namaPasien, batasWaktu, sisaAntrean = 4) => {
    // 1. Bunyikan nada bip lonceng medis klinis
    playNotificationChime();

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();

      const nomorSpelled = (nomor || '').replace(/([A-Za-z])(\d+)/, '$1 $2');
      const infoSisa = sisaAntrean === 0 
        ? 'giliran Anda berikutnya' 
        : `antrean Anda tersisa ${sisaAntrean} orang lagi di depan`;
      const kalimat = `Pemberitahuan layanan kesehatan Puskesmas. Nomor antrean ${nomorSpelled}, atas nama ${namaPasien}, ${infoSisa}. Harap segera hadir di Puskesmas sebelum pukul ${batasWaktu} agar tidak terlewat.`;

      const utterance = new SpeechSynthesisUtterance(kalimat);
      utterance.lang = 'id-ID';
      utterance.rate = 0.88;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const idVoice = voices.find((v) => 
        (v.lang && (v.lang === 'id-ID' || v.lang.startsWith('id'))) ||
        (v.name && (v.name.toLowerCase().includes('indonesia') || v.name.toLowerCase().includes('id-id') || v.name.toLowerCase().includes('gadis') || v.name.toLowerCase().includes('damayanti')))
      );
      if (idVoice) utterance.voice = idVoice;

      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 550);
    } catch (err) {
      console.warn('Gagal membunyikan Text-to-Speech persiapan:', err);
    }
  }, []);

  // -------------------------------------------------------------
  // 2. Kalkulasi Rute OSRM Jarak
  // -------------------------------------------------------------
  const updateRouteOSRM = useCallback(async (userLat, userLon, destLat, destLon) => {
    const targetLat = destLat || config.latitude;
    const targetLon = destLon || config.longitude;

    if (!userLat || !userLon || !targetLat || !targetLon) return;

    const result = await calculateOSRMRoute(userLat, userLon, targetLat, targetLon);
    if (result) {
      setGpsData({
        loading: false,
        jarakKm: result.jarakKm,
        waktuTempuh: result.waktuTempuh,
        metode: result.metode,
        error: null,
      });
    }
  }, [config.latitude, config.longitude]);

  // -------------------------------------------------------------
  // 3. Deteksi GPS Realtime (WatchPosition - Setiap Gerakan Berubah)
  // -------------------------------------------------------------
  useEffect(() => {
    registerServiceWorker();

    if (typeof window === 'undefined' || !navigator.geolocation) {
      return;
    }

    // Ambil posisi awal sekali
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        lastCoordsRef.current = { lat: latitude, lon: longitude };
        updateRouteOSRM(latitude, longitude, config.latitude, config.longitude);
      },
      (err) => {
        console.warn('GPS initial error:', err.message);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );

    // Watch position secara realtime untuk memperbarui setiap ada pergerakan
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const prev = lastCoordsRef.current;

        // Cek jika bergerak lebih dari 15 meter (0.015 KM)
        let hasMoved = true;
        if (prev.lat !== null && prev.lon !== null) {
          const dist = calculateHaversineDistance(prev.lat, prev.lon, latitude, longitude);
          if (dist < 0.015) {
            hasMoved = false;
          }
        }

        if (hasMoved) {
          lastCoordsRef.current = { lat: latitude, lon: longitude };
          updateRouteOSRM(latitude, longitude, config.latitude, config.longitude);
        }
      },
      (err) => {
        console.warn('GPS watchPosition error:', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [config.latitude, config.longitude, updateRouteOSRM]);

  // -------------------------------------------------------------
  // 4. Fetch Awal Data Antrean & Pengaturan dari Supabase
  // -------------------------------------------------------------
  const fetchAllData = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: antreanData, error: antreanErr } = await supabase
          .from('antrean')
          .select('*')
          .eq('is_archived', false)
          .order('urutan', { ascending: true })
          .order('created_at', { ascending: true });

        if (!antreanErr && antreanData) {
          setAllQueues(antreanData);

          const savedTicket = localStorage.getItem('antrean_pasien');
          if (savedTicket) {
            try {
              const parsed = JSON.parse(savedTicket);
              const found = antreanData.find((item) => String(item.id) === String(parsed.id));
              if (found) {
                setMyQueue(found);
                localStorage.setItem('antrean_pasien', JSON.stringify(found));
              } else {
                setMyQueue(null);
                localStorage.removeItem('antrean_pasien');
              }
            } catch (e) {
              console.error('Error parse antrean_pasien:', e);
            }
          }
        }

        const { data: cfgData, error: cfgErr } = await supabase
          .from('pengaturan')
          .select('*')
          .eq('id', 'puskesmas_config')
          .single();

        if (!cfgErr && cfgData) {
          const lat = cfgData.latitude ? parseFloat(cfgData.latitude) : -0.5282;
          const lon = cfgData.longitude ? parseFloat(cfgData.longitude) : 102.5853;

          setConfig({
            namaPuskesmas: cfgData.nama_puskesmas || 'Puskesmas Kuala Cenaku',
            alamatPuskesmas: cfgData.alamat_puskesmas || 'Jl. Kesehatan No. 1, Kuala Cenaku',
            logoUrl: cfgData.logo_url || '🏥',
            fotoPuskesmasUrl: cfgData.foto_puskesmas_url || '',
            infoPenting: cfgData.info_penting || 'Wajib membawa KTP atau Kartu Keluarga (KK) fisik.',
            statusBuka: cfgData.status_buka ?? true,
            pengumumanDarurat: cfgData.pengumuman_darurat || '',
            latitude: lat,
            longitude: lon,
            mapsUrl: cfgData.maps_url || `https://maps.google.com/?q=${lat},${lon}`,
          });

          if (lastCoordsRef.current.lat) {
            updateRouteOSRM(lastCoordsRef.current.lat, lastCoordsRef.current.lon, lat, lon);
          }
        }
      } catch (err) {
        console.error('Error fetching Supabase data:', err);
      }
    } else {
      // Fallback Standalone Local Storage
      const savedTicket = localStorage.getItem('antrean_pasien');
      if (savedTicket) {
        try { setMyQueue(JSON.parse(savedTicket)); } catch { /* ignore */ }
      }
      const savedAll = localStorage.getItem('antrean_local_db');
      if (savedAll) {
        try { setAllQueues(JSON.parse(savedAll)); } catch { /* ignore */ }
      }
      const savedCfg = localStorage.getItem('puskesmas_config');
      if (savedCfg) {
        try { setConfig((prev) => ({ ...prev, ...JSON.parse(savedCfg) })); } catch { /* ignore */ }
      }
    }
  }, [updateRouteOSRM]);

  // -------------------------------------------------------------
  // 5. Supabase Realtime Subscription (Sync Dua Arah)
  // -------------------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAllData();
    }, 0);

    if (isSupabaseConfigured && supabase) {
      const antreanChannel = supabase
        .channel('patient-antrean-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'antrean' },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setAllQueues((prev) => {
                if (prev.some((q) => q.id === payload.new.id)) return prev;
                return [...prev, payload.new];
              });
            } else if (payload.eventType === 'UPDATE') {
              setAllQueues((prev) =>
                prev.map((q) => (q.id === payload.new.id ? payload.new : q))
              );

              // Update live status tiket pasien & bunyikan suara / notifikasi PWA
              setMyQueue((current) => {
                if (current && String(current.id) === String(payload.new.id)) {
                  const isCalling = payload.new.status === 'MEMANGGIL';
                  const callTag = `${payload.new.id}_${payload.new.panggilan_ke || 0}_${payload.new.last_called_at || ''}`;

                  if (isCalling && lastCallIdRef.current !== callTag) {
                    lastCallIdRef.current = callTag;
                    playCallingVoice(payload.new.nomor, payload.new.nama, payload.new.panggilan_ke || 1);
                    sendSystemNotification(
                      `📢 Panggilan Nomor ${payload.new.nomor}!`,
                      `Atas nama ${payload.new.nama}, silakan menuju ke loket pemeriksaan sekarang!`
                    );
                    showToast(`Nomor ${payload.new.nomor} sedang dipanggil ke loket!`, 'alert');
                  }

                  localStorage.setItem('antrean_pasien', JSON.stringify(payload.new));
                  return payload.new;
                }
                return current;
              });
            } else if (payload.eventType === 'DELETE') {
              setAllQueues((prev) => prev.filter((q) => q.id !== payload.old.id));

              setMyQueue((current) => {
                if (current && String(current.id) === String(payload.old.id)) {
                  localStorage.removeItem('antrean_pasien');
                  showToast('Antrean Anda telah dibatalkan / di-reset.', 'info');
                  return null;
                }
                return current;
              });
            }
          }
        )
        .subscribe();

      const configChannel = supabase
        .channel('patient-config-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pengaturan' },
          (payload) => {
            if (payload.new && payload.new.id === 'puskesmas_config') {
              const lat = payload.new.latitude ? parseFloat(payload.new.latitude) : -0.5282;
              const lon = payload.new.longitude ? parseFloat(payload.new.longitude) : 102.5853;

              setConfig((prev) => ({
                ...prev,
                namaPuskesmas: payload.new.nama_puskesmas || prev.namaPuskesmas,
                alamatPuskesmas: payload.new.alamat_puskesmas || prev.alamatPuskesmas,
                logoUrl: payload.new.logo_url || prev.logoUrl,
                fotoPuskesmasUrl: payload.new.foto_puskesmas_url || '',
                infoPenting: payload.new.info_penting ?? prev.infoPenting,
                statusBuka: payload.new.status_buka ?? true,
                pengumumanDarurat: payload.new.pengumuman_darurat || '',
                latitude: lat,
                longitude: lon,
                mapsUrl: payload.new.maps_url || prev.mapsUrl,
              }));

              if (lastCoordsRef.current.lat) {
                updateRouteOSRM(lastCoordsRef.current.lat, lastCoordsRef.current.lon, lat, lon);
              }
            }
          }
        )
        .subscribe();

      // Polling 30 detik sebagai fallback jika realtime WebSocket terputus
      const pollInterval = setInterval(() => {
        fetchAllData();
      }, 30000);

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
          if (event.data?.type === 'UPDATE_ALL') fetchAllData();
        };
        return () => {
          clearTimeout(timer);
          bc.close();
        };
      }
      return () => clearTimeout(timer);
    }
  }, [fetchAllData, playCallingVoice, updateRouteOSRM]);

  // -------------------------------------------------------------
  // 6. Kalkulasi Antrean di Depan & Menit Tunggu Realtime
  // -------------------------------------------------------------
  const hitungAntreanDiDepan = () => {
    if (!myQueue) return 0;
    const antreanSebelum = allQueues.filter((item) => {
      const isMenunggu = item.status === 'MENUNGGU' || item.status === 'MEMANGGIL';
      const isPrioritas = (item.urutan ?? 0) < (myQueue.urutan ?? 0) || 
        ((item.urutan ?? 0) === (myQueue.urutan ?? 0) && item.id < myQueue.id);
      return isMenunggu && isPrioritas;
    });
    return antreanSebelum.length;
  };

  // Menit tunggu realtime: berkurang secara dinamis ketika antrean sebelumnya selesai
  const hitungEstimasiMenitRealtime = () => {
    if (!myQueue) return 0;
    if (myQueue.status === 'SELESAI') return 0;
    if (myQueue.status === 'MEMANGGIL') return 0;

    const sisaDepan = hitungAntreanDiDepan();
    if (sisaDepan === 0) return 2; // Giliran berikutnya segera

    // Rata-rata 5 menit per orang yang sedang menunggu di depan
    return Math.max(2, sisaDepan * 5);
  };

  // Batas Waktu Kedatangan (Estimasi Akhir Kedatangan Pasien di Puskesmas)
  const hitungBatasWaktuKedatangan = useCallback(() => {
    if (!myQueue) return '-';
    if (myQueue.status === 'SELESAI') return 'Selesai';
    if (myQueue.status === 'MEMANGGIL') return 'Sekarang';
    const mnt = hitungEstimasiMenitRealtime();
    const targetDate = new Date(Date.now() + mnt * 60000);
    return targetDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  }, [myQueue, allQueues]);

  // Efek Notifikasi Peringatan Bersiap (Suara Bip Medis & Notifikasi PWA di HP)
  useEffect(() => {
    if (!myQueue) return;
    if (myQueue.status !== 'MENUNGGU' && myQueue.status !== 'TERLAMBAT') return;

    const sisaDepan = hitungAntreanDiDepan();
    // Jika posisi antrean masuk 5 besar (di depan kurang dari 5 orang)
    if (sisaDepan < 5) {
      const ticketKey = `${myQueue.id}_lima_besar`;
      if (!notifiedFiveBesarRef.current.has(ticketKey)) {
        notifiedFiveBesarRef.current.add(ticketKey);
        const batasWaktu = hitungBatasWaktuKedatangan();

        // 1. Suara bip medis klinis dilanjutkan pengumuman suara persiapan
        playPeringatanLimaBesarVoice(myQueue.nomor, myQueue.nama, batasWaktu, sisaDepan);

        // 2. Notifikasi PWA (Bekerja di HP meskipun web diminimalkan)
        const infoUrutan = sisaDepan === 0 ? 'Giliran Anda berikutnya' : `Sisa ${sisaDepan} antrean lagi`;
        sendSystemNotification(
          `🏥 Puskesmas Kuala Cenaku: Bersiap Menuju Loket!`,
          `Nomor ${myQueue.nomor} (${myQueue.nama}): ${infoUrutan}. Harap tiba sebelum pukul ${batasWaktu}.`
        );

        // 3. Pesan toast di layar
        showToast(`⚠️ ${infoUrutan}! Harap tiba sebelum pukul ${batasWaktu}.`, 'alert');
      }
    }
  }, [allQueues, myQueue, hitungAntreanDiDepan, hitungBatasWaktuKedatangan, playPeringatanLimaBesarVoice]);

  // Daftar antrean yang sedang menunggu (hanya yang belum selesai) terurut
  const antreanMenungguList = allQueues
    .filter((q) => !q.is_archived && (q.status === 'MENUNGGU' || q.status === 'MEMANGGIL' || q.status === 'TERLAMBAT'))
    .sort((a, b) => {
      if (a.status === 'MEMANGGIL' && b.status !== 'MEMANGGIL') return -1;
      if (b.status === 'MEMANGGIL' && a.status !== 'MEMANGGIL') return 1;
      const aUrutan = a.urutan ?? 0;
      const bUrutan = b.urutan ?? 0;
      if (aUrutan !== bUrutan) return aUrutan - bUrutan;
      return new Date(a.created_at) - new Date(b.created_at);
    });

  // -------------------------------------------------------------
  // 7. Aksi: Ambil Nomor Antrean Baru
  // -------------------------------------------------------------
  const handleAmbilAntrean = async (e) => {
    e.preventDefault();

    if (!config.statusBuka) {
      alert('Pendaftaran antrean sedang ditutup oleh petugas Puskesmas.');
      return;
    }

    const namaClean = inputNama.trim();
    if (!namaClean) {
      alert('Silakan masukkan nama lengkap sesuai KTP / Kartu Keluarga!');
      return;
    }

    requestNotificationPermission();
    setLoading(true);

    try {
      const antreanAktif = allQueues.filter(
        (q) => !q.is_archived && (q.status === 'MENUNGGU' || q.status === 'MEMANGGIL')
      );
      const jumlahDiDepan = antreanAktif.length;
      const estimasiAwal = Math.max(5, (jumlahDiDepan + 1) * 5);

      const nomorBaru = generateNextQueueNumber(allQueues);
      const maxUrutan = allQueues.reduce((max, q) => Math.max(max, q.urutan ?? 0), 0);

      const tiketData = {
        nomor: nomorBaru,
        nama: namaClean,
        status: 'MENUNGGU',
        estimasi_menit: estimasiAwal,
        urutan: maxUrutan + 1,
        panggilan_ke: 0,
        is_archived: false,
        created_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from('antrean')
          .insert([tiketData])
          .select()
          .single();

        if (error) throw error;

        const savedItem = data || tiketData;
        setMyQueue(savedItem);
        setTampilkanTiket(true);
        localStorage.setItem('antrean_pasien', JSON.stringify(savedItem));
      } else {
        const localId = Date.now();
        const savedItem = { ...tiketData, id: localId };
        const updatedList = [...allQueues, savedItem];

        setAllQueues(updatedList);
        setMyQueue(savedItem);
        setTampilkanTiket(true);
        localStorage.setItem('antrean_pasien', JSON.stringify(savedItem));
        localStorage.setItem('antrean_local_db', JSON.stringify(updatedList));

        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('antrean_sync_channel');
          bc.postMessage({ type: 'UPDATE_ALL' });
          bc.close();
        }
      }

      showToast(`Nomor Antrean Anda: ${nomorBaru}`, 'success');
      setInputNama('');
    } catch (err) {
      console.error('Gagal mengambil antrean:', err);
      alert('Terjadi kendala saat mendaftarkan antrean. Silakan coba kembali.');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // 8. Aksi: Batalkan Antrean
  // -------------------------------------------------------------
  const konfirmasiBatalkan = async () => {
    if (!myQueue) return;

    setLoading(true);
    const queueId = myQueue.id;

    try {
      if (isSupabaseConfigured && supabase && queueId) {
        const { error } = await supabase
          .from('antrean')
          .delete()
          .eq('id', queueId);

        if (error) throw error;
      } else {
        const updatedList = allQueues.filter((q) => q.id !== queueId);
        setAllQueues(updatedList);
        localStorage.setItem('antrean_local_db', JSON.stringify(updatedList));

        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const bc = new BroadcastChannel('antrean_sync_channel');
          bc.postMessage({ type: 'UPDATE_ALL' });
          bc.close();
        }
      }

      setMyQueue(null);
      localStorage.removeItem('antrean_pasien');
      setShowModal(false);
      lastCallIdRef.current = null;
      setHasSearched(false);
      setSearchResults([]);
      showToast('Nomor antrean Anda berhasil dibatalkan.', 'info');
    } catch (err) {
      console.error('Gagal membatalkan antrean:', err);
      alert('Gagal membatalkan antrean. Silakan periksa koneksi Anda.');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // 9. Aksi: Cari / Cek Antrean (Hanya yang BELUM SELESAI)
  // -------------------------------------------------------------
  const handleCariAntrean = (e) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    // HANYA antrean yang BELUM SELESAI dan BELUM DIARSIPKAN
    const hasil = allQueues.filter(
      (item) =>
        !item.is_archived &&
        item.status !== 'SELESAI' && // Tidak menampilkan antrean yang sudah selesai
        (item.nama?.toLowerCase().includes(query) || item.nomor?.toLowerCase().includes(query))
    );

    setSearchResults(hasil);
    setHasSearched(true);
    // Selalu tampilkan daftar hasil terlebih dahulu — pengguna harus klik "Buka Tiket"
  };

  const pilihAntreanHasilCari = (item) => {
    requestNotificationPermission();
    setMyQueue(item);
    setTampilkanTiket(true);
    localStorage.setItem('antrean_pasien', JSON.stringify(item));
    setHasSearched(false);
    showToast(`Membuka tiket ${item.nomor} - ${item.nama}`, 'success');
  };

  // -------------------------------------------------------------
  // RENDER INTERFACE PASIEN
  // -------------------------------------------------------------
  return (
    <main className="min-h-screen text-slate-800 font-sans selection:bg-teal-100 selection:text-teal-900 pb-16 relative bg-white">
      
      {/* LATAR BELAKANG FOTO PUSKESMAS (Diputihkan lembut agar nyaman dibaca) */}
      {config.fotoPuskesmasUrl ? (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center transition-all duration-700 opacity-65 scale-100"
            style={{ backgroundImage: `url("${config.fotoPuskesmasUrl}")` }}
          />
          {/* Lapisan overlay putih lembut agar foto terlihat soft dan tulisan sangat jelas */}
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px]" />
        </div>
      ) : null}

      {/* TOAST NOTIFIKASI MELAYANG */}
      {notificationToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md animate-fade-in">
          <div className={`p-4 rounded-2xl shadow-xl flex items-center gap-3 text-sm font-semibold border ${
            notificationToast.type === 'alert' 
              ? 'bg-amber-500 text-white border-amber-600' 
              : notificationToast.type === 'success'
              ? 'bg-teal-600 text-white border-teal-700'
              : 'bg-slate-800 text-white border-slate-900'
          }`}>
            <Info className="w-5 h-5 shrink-0" />
            <p className="flex-1">{notificationToast.message}</p>
          </div>
        </div>
      )}

      {/* BANNER PENGUMUMAN DARURAT */}
      {config.pengumumanDarurat && (
        <aside aria-label="Pengumuman Darurat" className="bg-red-600 text-white px-4 py-3 shadow-md sticky top-0 z-40">
          <div className="max-w-md mx-auto flex items-center gap-3 text-xs sm:text-sm font-bold">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-200" />
            <div className="flex-1">
              <span className="uppercase tracking-wider font-extrabold text-amber-200 mr-1.5">PENGUMUMAN:</span>
              {config.pengumumanDarurat}
            </div>
          </div>
        </aside>
      )}

      <div className="relative z-10 max-w-md mx-auto pt-6 px-4">
        
        {/* ================= HEADER PUSKESMAS ================= */}
        <header className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/95 border border-teal-100 text-teal-600 mb-3 shadow-md shadow-teal-100/50 backdrop-blur-xs overflow-hidden">
            {config.logoUrl.startsWith('http') || config.logoUrl.startsWith('data:') ? (
              <img 
                src={config.logoUrl} 
                alt="Logo Puskesmas" 
                className="w-16 h-16 object-contain rounded-2xl p-1" 
              />
            ) : (
              <span className="text-4xl">{config.logoUrl || '🏥'}</span>
            )}
          </div>
          
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{config.namaPuskesmas}</h1>
          <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto leading-relaxed font-medium">
            {config.alamatPuskesmas}
          </p>

          {/* Status Loket Badge */}
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border transition-colors bg-white/90 backdrop-blur-xs shadow-xs">
            <span className={`w-2 h-2 rounded-full ${config.statusBuka ? 'bg-emerald-500 animate-ping' : 'bg-red-500'}`} />
            <span className={config.statusBuka ? 'text-emerald-700' : 'text-red-700'}>
              {config.statusBuka ? 'Loket Pendaftaran Buka' : 'Loket Pendaftaran Ditutup'}
            </span>
          </div>
        </header>

        {/* ================= NOTIFIKASI TIKET AKTIF (Bila pengguna kembali ke form) ================= */}
        {myQueue && !tampilkanTiket && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3.5 mb-5 flex items-center justify-between shadow-xs animate-fade-in">
            <div className="flex items-center gap-3">
              <span className="bg-teal-600 text-white text-xs font-black px-2.5 py-1.5 rounded-xl shadow-xs">
                {myQueue.nomor}
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800">{myQueue.nama}</p>
                <p className="text-[11px] text-teal-700 font-medium">
                  {myQueue.status === 'MEMANGGIL' ? 'Sedang Dipanggil ke Loket!' : `Status: ${myQueue.status}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setTampilkanTiket(true)}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <Ticket className="w-3.5 h-3.5" /> Buka Tiket
            </button>
          </div>
        )}

        {/* ================= TAB NAVIGASI ================= */}
        {(!myQueue || !tampilkanTiket) && (
          <div className="flex bg-slate-200/80 p-1.5 rounded-2xl mb-6 border border-slate-200">
            <button
              onClick={() => { setTabAktif('ambil'); setHasSearched(false); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                tabAktif === 'ambil'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ambil Antrean
            </button>
            <button
              onClick={() => setTabAktif('cari')}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                tabAktif === 'cari'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cek / Cari Antrean
            </button>
          </div>
        )}

        {/* ================= 1. FORM PENDAFTARAN MANDIRI ================= */}
        {tabAktif === 'ambil' && (!myQueue || !tampilkanTiket) && (
          <div className="bg-white/95 backdrop-blur-xs rounded-3xl shadow-xl shadow-slate-200/60 p-6 sm:p-8 border border-slate-100 mb-6">
            
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Pendaftaran Antrean Mandiri</h2>
              </div>
            </div>

            {!config.statusBuka ? (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center my-4">
                <Lock className="w-8 h-8 text-red-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-red-900">Pendaftaran Ditutup Sementara</h3>
                <p className="text-xs text-red-700 mt-1 leading-relaxed">
                  Loket antrean pendaftaran sedang ditutup oleh pihak Puskesmas. Silakan hubungi petugas loket.
                </p>
              </div>
            ) : (
              <form onSubmit={handleAmbilAntrean} className="space-y-4">
                <div>
                  <label htmlFor="patient-input" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Nama Pasien
                  </label>
                  <input
                    id="patient-input"
                    type="text"
                    value={inputNama}
                    onChange={(e) => setInputNama(e.target.value)}
                    placeholder="Masukkan nama sesuai KTP / Kartu Keluarga"
                    className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium"
                    required
                    maxLength={60}
                  />
                </div>

                {/* Syarat Penting KTP/KK */}
                <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <span className="font-bold block mb-0.5">Informasi Penting:</span>
                    {config.infoPenting}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-teal-600/20 active:scale-[0.98] transition-all cursor-pointer text-sm flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Memproses Antrean...
                    </span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Ambil Nomor Antrean
                    </>
                  )}
                </button>
              </form>
            )}

          </div>
        )}

        {/* ================= 2. MENU CARI / CEK ANTREAN (HANYA YANG BELUM SELESAI) ================= */}
        {tabAktif === 'cari' && (!myQueue || !tampilkanTiket) && (
          <div className="bg-white/95 backdrop-blur-xs rounded-3xl shadow-xl shadow-slate-200/60 p-6 sm:p-8 border border-slate-100 mb-6">
            
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Cek Status Nomor Antrean</h2>
                <p className="text-xs text-slate-400">Lacak tiket Anda berdasarkan nama atau nomor antrean</p>
              </div>
            </div>

            <form onSubmit={handleCariAntrean} className="flex gap-2 my-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama atau nomor (contoh: A01)..."
                className="flex-1 px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
              />
              <button
                type="submit"
                className="bg-slate-900 hover:bg-black text-white px-5 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                Cari
              </button>
            </form>

            {hasSearched && (
              <div className="mt-4 space-y-2.5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Hasil Pencarian ({searchResults.length}):
                </p>
                {searchResults.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-400">
                    Tidak ditemukan antrean aktif untuk &quot;{searchQuery}&quot;. Antrean yang sudah selesai tidak dapat dicari lagi.
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 font-black text-sm flex items-center justify-center">
                          {item.nomor}
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800">{item.nama}</h4>
                          <span className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.2 rounded-full uppercase ${
                            item.status === 'MEMANGGIL' ? 'bg-blue-600 text-white animate-pulse' :
                            item.status === 'TERLAMBAT' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => pilihAntreanHasilCari(item)}
                        className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                      >
                        Buka Tiket <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= 3. TAMPILAN TIKET SINKRON (SAMA PERSIS DENGAN AMBIL ANTREAN) ================= */}
        {myQueue && tampilkanTiket && (
          <div className="bg-white/95 backdrop-blur-xs rounded-3xl shadow-xl shadow-slate-200/70 p-6 sm:p-8 border border-slate-100 relative overflow-hidden animate-fade-in mb-6">
            
            {/* Header Status Live */}
            <div className="flex justify-between items-center mb-5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Status Antrean Anda:
              </span>
              <span className={`text-xs font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
                myQueue.status === 'MEMANGGIL'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200 animate-bounce'
                  : myQueue.status === 'TERLAMBAT'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : myQueue.status === 'SELESAI'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-teal-100 text-teal-800'
              }`}>
                {myQueue.status === 'MEMANGGIL' && <Volume2 className="w-3.5 h-3.5 animate-spin" />}
                {myQueue.status === 'TERLAMBAT' ? 'Dilewati (Terlambat)' : myQueue.status}
              </span>
            </div>

            {/* NOTIFIKASI KHUSUS SAAT SEDANG DIPANGGIL */}
            {myQueue.status === 'MEMANGGIL' && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5 text-center animate-pulse">
                <div className="flex items-center justify-center gap-2 text-blue-700 font-black text-sm mb-1">
                  <Volume2 className="w-5 h-5 text-blue-600" />
                  NOMOR ANDA SEDANG DIPANGGIL!
                </div>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Silakan segera menuju ke ruang loket pemeriksaan sekarang.
                </p>
                <button
                  onClick={() => playCallingVoice(myQueue.nomor, myQueue.nama, (myQueue.panggilan_ke || 1) + 1)}
                  className="mt-3 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl cursor-pointer shadow-sm transition-all"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Putar Ulang Suara Panggilan
                </button>
              </div>
            )}

            {/* NOTIFIKASI JIKA STATUS TERLAMBAT / DILEWATI */}
            {myQueue.status === 'TERLAMBAT' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-center">
                <div className="flex items-center justify-center gap-2 text-amber-800 font-black text-xs uppercase tracking-wider mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Antrean Sempat Terlewat
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Nomor Anda sempat dilewati karena belum hadir saat dipanggil. Antrean Anda otomatis digeser dan akan dipanggil kembali.
                </p>
              </div>
            )}

            {/* NOTIFIKASI JIKA STATUS SELESAI */}
            {myQueue.status === 'SELESAI' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5 text-center">
                <p className="text-xs font-bold text-emerald-800">
                  🎉 Pelayanan Anda telah selesai. Terima kasih telah mengunjungi {config.namaPuskesmas}.
                </p>
              </div>
            )}

            {/* Peringatan Wajib Bawa KTP/KK Fisik & Toleransi Keterlambatan */}
            <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 my-3 flex items-start gap-3 text-left">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <span className="font-bold block mb-0.5">Persyaratan Berkas & Waktu:</span>
                {config.infoPenting || 'Wajib membawa KTP atau Kartu Keluarga (KK) fisik saat datang ke loket. Toleransi keterlambatan maksimal 15 Menit.'}
              </div>
            </div>

            {/* Nomor Tiket Besar */}
            <div className="text-center py-4 bg-radial from-teal-50/80 to-transparent rounded-3xl my-2">
              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
                Nomor Antrean
              </p>
              <h2 className="text-7xl font-black text-teal-600 tracking-tight my-2">
                {myQueue.nomor}
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                Atas Nama: <strong className="text-slate-900 font-bold">{myQueue.nama}</strong>
              </p>
            </div>

            {/* === PERKIRAAN WAKTU (Terstruktur & Rapi) === */}
            <div className="mt-4 bg-slate-50/90 rounded-2xl border border-slate-100 overflow-hidden">
              
              {/* Header perkiraan */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <Clock className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Perkiraan Waktu Pelayanan</span>
              </div>

              {/* Tiga stat block sejajar */}
              <div className="grid grid-cols-3 divide-x divide-slate-100">
                <div className="p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Estimasi Tunggu</p>
                  <p className="text-xl font-black text-teal-700 leading-none">
                    {hitungEstimasiMenitRealtime()}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Menit</p>
                </div>

                <div className="p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Antrean Depan</p>
                  <p className="text-xl font-black text-blue-700 leading-none">
                    {hitungAntreanDiDepan()}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Orang</p>
                </div>

                <div className="p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Tiba Sebelum</p>
                  {myQueue.status === 'MEMANGGIL' ? (
                    <p className="text-[11px] font-black text-blue-600 leading-tight mt-1">Langsung ke Loket!</p>
                  ) : (
                    <>
                      <p className="text-sm font-black text-emerald-700 leading-none">{hitungBatasWaktuKedatangan()}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Status badge bawah */}
              {myQueue.status !== 'SELESAI' && (
                <div className={`px-4 py-2.5 flex items-center justify-between border-t border-slate-100 ${
                  myQueue.status === 'MEMANGGIL' ? 'bg-blue-50' : hitungAntreanDiDepan() < 5 ? 'bg-emerald-50' : 'bg-white'
                }`}>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {myQueue.status === 'MEMANGGIL'
                      ? 'Nomor Anda sedang dipanggil'
                      : `Diusahakan hadir sebelum pukul ${hitungBatasWaktuKedatangan()}`}
                  </span>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 ml-2 ${
                    myQueue.status === 'MEMANGGIL'
                      ? 'bg-blue-600 text-white animate-pulse'
                      : hitungAntreanDiDepan() === 0
                      ? 'bg-emerald-600 text-white animate-bounce'
                      : hitungAntreanDiDepan() < 5
                      ? 'bg-emerald-500 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {myQueue.status === 'MEMANGGIL'
                      ? 'Panggilan Aktif'
                      : hitungAntreanDiDepan() === 0
                      ? 'Giliran Anda Berikutnya!'
                      : hitungAntreanDiDepan() === 1
                      ? 'Sisa 1 Antrean'
                      : hitungAntreanDiDepan() < 5
                      ? `Sisa ${hitungAntreanDiDepan()} Antrean`
                      : `Antrean ke-${hitungAntreanDiDepan() + 1}`}
                  </span>
                </div>
              )}
            </div>

            <hr className="my-5 border-slate-100" />

            {/* INTEGRASI OSRM & GPS REALTIME (Setiap Gerakan Berubah) */}
            <div className="bg-slate-50/90 p-4 rounded-2xl border border-slate-200/80 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Navigation className="w-4 h-4 text-blue-600" />
                  Rute & Jarak ke Puskesmas
                </div>
                <button
                  onClick={() => {
                    if (lastCoordsRef.current.lat) {
                      updateRouteOSRM(lastCoordsRef.current.lat, lastCoordsRef.current.lon, config.latitude, config.longitude);
                    }
                  }}
                  disabled={gpsData.loading}
                  className="text-[10px] font-bold text-teal-700 hover:text-teal-900 bg-teal-50 px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                  title="Perbarui GPS"
                >
                  <RotateCcw className={`w-3 h-3 ${gpsData.loading ? 'animate-spin' : ''}`} />
                  Perbarui
                </button>
              </div>

              {/* GPS Stats: Jarak + Waktu tempuh */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white rounded-xl p-2.5 border border-slate-100 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Jarak</p>
                  <p className="text-base font-black text-slate-800 mt-0.5">{gpsData.jarakKm}</p>
                </div>
                <div className="bg-white rounded-xl p-2.5 border border-slate-100 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Perjalanan</p>
                  <p className="text-base font-black text-slate-800 mt-0.5">{gpsData.waktuTempuh}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-400 font-medium">
                  {gpsData.metode}{gpsData.error ? ` • ${gpsData.error}` : ''}
                </p>
                <a
                  href={config.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-200 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Buka Maps
                </a>
              </div>
            </div>

            {/* Tombol Aksi: Kembali dan Batalkan / Hapus */}
            {myQueue.status !== 'SELESAI' ? (
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setTampilkanTiket(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl transition-all text-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3.5 rounded-2xl transition-all text-xs cursor-pointer border border-red-200/80 flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" /> Batalkan Antrean
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMyQueue(null);
                  localStorage.removeItem('antrean_pasien');
                  setTabAktif('ambil');
                }}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-2xl transition-all text-xs cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                Ambil Antrean Baru
              </button>
            )}

          </div>
        )}

        {/* ================= 4. LIST ANTREAN MENUNGGU (PER BARIS RAPI) ================= */}
        <div className="bg-white/95 backdrop-blur-xs rounded-3xl p-5 border border-slate-200/90 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Daftar Antrean Menunggu
                </h3>
                <p className="text-[11px] text-slate-400">Total {antreanMenungguList.length} pasien dalam antrean</p>
              </div>
            </div>
            <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
              Privasi Terjaga
            </span>
          </div>

          {antreanMenungguList.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 italic">
              Belum ada antrean yang menunggu saat ini.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {antreanMenungguList.map((item, idx) => {
                const isMyTicket = myQueue && String(myQueue.id) === String(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                      isMyTicket 
                        ? 'bg-teal-50/80 border-teal-300 ring-2 ring-teal-200/60' 
                        : 'bg-slate-50/70 border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400 w-5">#{idx + 1}</span>
                      <div className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center shrink-0 ${
                        isMyTicket ? 'bg-teal-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-teal-700'
                      }`}>
                        {item.nomor}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          Nomor {item.nomor} {isMyTicket ? <span className="text-teal-600 font-black ml-1">(Anda)</span> : ''}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Daftar: {item.created_at ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </p>
                      </div>
                    </div>

                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                      item.status === 'MEMANGGIL'
                        ? 'bg-blue-600 text-white animate-pulse'
                        : item.status === 'TERLAMBAT'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-teal-100 text-teal-800'
                    }`}>
                      {item.status === 'MEMANGGIL' ? 'Dipanggil' : item.status === 'TERLAMBAT' ? 'Terlambat' : 'Menunggu'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Pasien Bersih */}
        <footer className="mt-8 text-center text-xs text-slate-400">
          <p>© {new Date().getFullYear()} {config.namaPuskesmas}.</p>
          <p className="text-[11px] text-slate-400/80 mt-0.5">Sistem Antrean Digital Puskesmas</p>
        </footer>

      </div>

      {/* ================= MODAL KONFIRMASI BATALKAN ANTREAN ================= */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl border border-slate-100 text-center">
            
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-red-100">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-2">Batalkan Nomor Antrean?</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Nomor <strong>{myQueue?.nomor}</strong> atas nama <strong>{myQueue?.nama}</strong> akan dibatalkan dari sistem pelayanan.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={konfirmasiBatalkan}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-red-200 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {loading ? 'Membatalkan...' : 'Ya, Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
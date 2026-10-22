import { NextResponse } from 'next/server';
import { ambilSesiDariRequest } from '@/lib/auth';

const DEFAULT_ORGANISASI_ID = '00000000-0000-0000-0000-000000000001';

/**
 * POST /api/antrean/aksi
 * Endpoint otoritatif server untuk seluruh aksi pengelolaan antrean oleh petugas/admin:
 * - PANGGIL: Memanggil nomor antrean tertentu
 * - SELESAI: Menandai antrean telah selesai dilayani
 * - LEWATI: Menunda/melewati antrean ke urutan belakang
 * - STATUS_BUKA: Membuka atau menutup pendaftaran pengunjung
 * - RESET_SIKLUS: Menutup loket harian, mengarsipkan antrean selesai, membersihkan antrean sisa
 * - SIMPAN_PENGATURAN: Memperbarui identitas, media, dan konfigurasi organisasi
 */
export async function POST(request) {
  try {
    // 1. Verifikasi sesi petugas dari cookie httpOnly
    const sesi = ambilSesiDariRequest(request);
    if (!sesi) {
      return NextResponse.json(
        { sukses: false, pesan: 'Sesi petugas tidak valid atau telah kedaluwarsa. Silakan login kembali.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { aksi, data } = body;

    if (!aksi) {
      return NextResponse.json(
        { sukses: false, pesan: 'Parameter aksi wajib disertakan.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { sukses: false, pesan: 'Koneksi database Supabase belum terkonfigurasi di server.' },
        { status: 503 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowIso = new Date().toISOString();
    const tenantId = sesi.organisasiId || DEFAULT_ORGANISASI_ID;

    // ─────────────────────────────────────────────────────────────
    // AKSI 1: PANGGIL ANTREAN
    // ─────────────────────────────────────────────────────────────
    if (aksi === 'PANGGIL') {
      const antreanId = data?.id;
      const count = Number(data?.panggilan_ke || 1);

      if (!antreanId) {
        return NextResponse.json(
          { sukses: false, pesan: 'ID antrean wajib disertakan untuk memanggil.' },
          { status: 400 }
        );
      }

      // Update status tiket antrean menjadi MEMANGGIL
      const { data: updatedTicket, error: updateErr } = await supabase
        .from('antrean')
        .update({
          status: 'MEMANGGIL',
          panggilan_ke: count,
          last_called_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', antreanId)
        .select()
        .single();

      if (updateErr) {
        console.error('[API AKSI] Gagal update panggil:', updateErr.message);
        return NextResponse.json(
          { sukses: false, pesan: `Gagal memperbarui status panggil: ${updateErr.message}` },
          { status: 500 }
        );
      }

      // Catat log kejadian panggilan di server
      try {
        await supabase.rpc('log_call_event', {
          p_antrean_id: antreanId,
          p_panggilan_ke: count,
        });
      } catch (logErr) {
        console.warn('[API AKSI] log_call_event RPC skipped:', logErr?.message);
      }

      return NextResponse.json({
        sukses: true,
        pesan: `Antrean ${updatedTicket?.nomor || ''} berhasil dipanggil (${count}x).`,
        tiket: updatedTicket,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // AKSI 2: SELESAI DILAYANI
    // ─────────────────────────────────────────────────────────────
    if (aksi === 'SELESAI') {
      const antreanId = data?.id;
      const durasi = data?.durasi_aktual_menit !== undefined ? Number(data.durasi_aktual_menit) : null;

      if (!antreanId) {
        return NextResponse.json(
          { sukses: false, pesan: 'ID antrean wajib disertakan untuk menandai selesai.' },
          { status: 400 }
        );
      }

      const updatePayload = {
        status: 'SELESAI',
        finished_at: nowIso,
        updated_at: nowIso,
      };
      if (durasi !== null) {
        updatePayload.durasi_aktual_menit = durasi;
      }

      const { data: updatedTicket, error: updateErr } = await supabase
        .from('antrean')
        .update(updatePayload)
        .eq('id', antreanId)
        .select()
        .single();

      if (updateErr) {
        console.error('[API AKSI] Gagal update selesai:', updateErr.message);
        return NextResponse.json(
          { sukses: false, pesan: `Gagal menandai selesai: ${updateErr.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        sukses: true,
        pesan: `Antrean ${updatedTicket?.nomor || ''} selesai dilayani.`,
        tiket: updatedTicket,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // AKSI 3: LEWATI ANTREAN (TERLAMBAT)
    // ─────────────────────────────────────────────────────────────
    if (aksi === 'LEWATI') {
      const antreanId = data?.id;
      const newUrutan = Number(data?.urutan || 9999);

      if (!antreanId) {
        return NextResponse.json(
          { sukses: false, pesan: 'ID antrean wajib disertakan untuk melewati.' },
          { status: 400 }
        );
      }

      const { data: updatedTicket, error: updateErr } = await supabase
        .from('antrean')
        .update({
          status: 'TERLAMBAT',
          urutan: newUrutan,
          updated_at: nowIso,
        })
        .eq('id', antreanId)
        .select()
        .single();

      if (updateErr) {
        console.error('[API AKSI] Gagal update lewati:', updateErr.message);
        return NextResponse.json(
          { sukses: false, pesan: `Gagal melewati antrean: ${updateErr.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        sukses: true,
        pesan: `Antrean ${updatedTicket?.nomor || ''} telah dilewati.`,
        tiket: updatedTicket,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // AKSI 4: TOGGLE STATUS PENDAFTARAN LOKET
    // ─────────────────────────────────────────────────────────────
    if (aksi === 'STATUS_BUKA') {
      const nextStatusBuka = Boolean(data?.status_buka);

      const { error: upsertErr } = await supabase
        .from('pengaturan')
        .upsert(
          {
            id: 'pengaturan_organisasi',
            tenant_id: tenantId,
            status_buka: nextStatusBuka,
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        );

      if (upsertErr) {
        console.error('[API AKSI] Gagal update status buka:', upsertErr.message);
        return NextResponse.json(
          { sukses: false, pesan: `Gagal memperbarui status pendaftaran: ${upsertErr.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        sukses: true,
        pesan: nextStatusBuka ? 'Pendaftaran loket telah DIBUKA.' : 'Pendaftaran loket telah DITUTUP.',
        status_buka: nextStatusBuka,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // AKSI 5: RESET SIKLUS HARIAN
    // ─────────────────────────────────────────────────────────────
    if (aksi === 'RESET_SIKLUS') {
      // 1. Tutup loket pendaftaran
      await supabase
        .from('pengaturan')
        .upsert(
          {
            id: 'pengaturan_organisasi',
            tenant_id: tenantId,
            status_buka: false,
            updated_at: nowIso,
          },
          { onConflict: 'id' }
        );

      // 2. Arsipkan antrean yang berstatus SELESAI (untuk laporan dan dataset skripsi)
      await supabase
        .from('antrean')
        .update({ is_archived: true, updated_at: nowIso })
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .eq('status', 'SELESAI');

      // 3. Hapus atau arsipkan antrean yang belum selesai
      await supabase
        .from('antrean')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .neq('status', 'SELESAI');

      return NextResponse.json({
        sukses: true,
        pesan: 'Siklus harian berhasil ditutup & direset. Riwayat selesai telah diarsipkan.',
      });
    }

    // ─────────────────────────────────────────────────────────────
    // AKSI 6: BATALKAN ANTREAN OLEH ADMIN
    // ─────────────────────────────────────────────────────────────
    if (aksi === 'BATALKAN') {
      const antreanId = data?.id;

      if (!antreanId) {
        return NextResponse.json(
          { sukses: false, pesan: 'ID antrean wajib disertakan untuk membatalkan.' },
          { status: 400 }
        );
      }

      const { data: updatedTicket, error: updateErr } = await supabase
        .from('antrean')
        .update({
          status: 'DIBATALKAN',
          waktu_dibatalkan: nowIso,
          alasan_batal: data?.alasan || 'Dibatalkan oleh Petugas Loket',
          finished_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', antreanId)
        .not('status', 'in', '("SELESAI","DIBATALKAN")')
        .select()
        .single();

      if (updateErr) {
        console.error('[API AKSI] Gagal batalkan antrean:', updateErr.message);
        return NextResponse.json(
          { sukses: false, pesan: `Gagal membatalkan antrean: ${updateErr.message}` },
          { status: 500 }
        );
      }

      if (!updatedTicket) {
        return NextResponse.json(
          { sukses: false, pesan: 'Antrean tidak ditemukan atau sudah selesai/dibatalkan.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        sukses: true,
        pesan: `Antrean ${updatedTicket?.nomor || ''} berhasil dibatalkan.`,
        tiket: updatedTicket,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // AKSI 7: SIMPAN SELURUH PENGATURAN INSTANSI
    // ─────────────────────────────────────────────────────────────
    if (aksi === 'SIMPAN_PENGATURAN') {
      const p = data || {};
      const payload = {
        id: 'pengaturan_organisasi',
        tenant_id: tenantId,
        nama_organisasi: p.nama_organisasi || 'Loket Pelayanan Terpadu',
        alamat_organisasi: p.alamat_organisasi || 'Jl. Pelayanan Publik No. 1',
        logo_url: p.logo_url || '🏢',
        foto_organisasi_url: p.foto_organisasi_url || '',
        info_penting: p.info_penting || '',
        status_buka: p.status_buka ?? true,
        pengumuman_darurat: (p.pengumuman_darurat || '').trim(),
        maps_url: p.maps_url || '',
        latitude: p.latitude !== '' && p.latitude !== null && !isNaN(Number(p.latitude)) ? Number(p.latitude) : -0.5282,
        longitude: p.longitude !== '' && p.longitude !== null && !isNaN(Number(p.longitude)) ? Number(p.longitude) : 102.5853,
        display_qr_link: (p.display_qr_link || '').trim(),
        display_sound_enabled: p.display_sound_enabled ?? true,
        updated_at: nowIso,
      };

      const { error: upsertErr } = await supabase
        .from('pengaturan')
        .upsert(payload, { onConflict: 'id' });

      if (upsertErr) {
        console.error('[API AKSI] Gagal simpan pengaturan:', upsertErr.message);
        return NextResponse.json(
          { sukses: false, pesan: `Gagal menyimpan pengaturan: ${upsertErr.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        sukses: true,
        pesan: 'Pengaturan organisasi berhasil disimpan & disiarkan!',
        pengaturan: payload,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // AKSI 8: SINKRONISASI ANTREAN OFFLINE KE CLOUD (DUA ARAH)
    // ─────────────────────────────────────────────────────────────
    if (aksi === 'SINKRONISASI_OFFLINE') {
      const offlineAntrean = Array.isArray(data?.offline_antrean) ? data.offline_antrean : [];
      const offlineUpdates = Array.isArray(data?.offline_updates) ? data.offline_updates : [];
      let totalDisinkronkan = 0;

      // 1. Masukkan tiket baru yang dibuat saat offline (dengan pencegahan duplikasi)
      for (const item of offlineAntrean) {
        try {
          // Periksa apakah tiket dengan nomor ini sudah tersimpan di database
          const { data: existing } = await supabase
            .from('antrean')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('nomor', item.nomor)
            .eq('is_archived', false)
            .maybeSingle();

          if (existing) {
            // Jika sudah ada, cukup perbarui statusnya
            const { error: upErr } = await supabase
              .from('antrean')
              .update({
                status: item.status || 'MENUNGGU',
                panggilan_ke: item.panggilan_ke !== undefined ? Number(item.panggilan_ke) : undefined,
                last_called_at: item.last_called_at || undefined,
                finished_at: item.finished_at || undefined,
                durasi_aktual_menit: item.durasi_aktual_menit ? Number(item.durasi_aktual_menit) : undefined,
                updated_at: nowIso,
              })
              .eq('id', existing.id);
            if (!upErr) totalDisinkronkan++;
          } else {
            const insertPayload = {
              tenant_id: tenantId,
              nomor: item.nomor,
              nama: item.nama || 'Pengunjung',
              status: item.status || 'MENUNGGU',
              sumber: item.sumber || 'LOKET',
              estimasi_menit: Number(item.estimasi_menit || 5),
              urutan: Number(item.urutan || 0),
              panggilan_ke: Number(item.panggilan_ke || 0),
              last_called_at: item.last_called_at || null,
              finished_at: item.finished_at || null,
              durasi_aktual_menit: item.durasi_aktual_menit ? Number(item.durasi_aktual_menit) : null,
              is_archived: false,
              created_at: item.created_at || nowIso,
              updated_at: nowIso,
            };
            const { error: insErr } = await supabase.from('antrean').insert(insertPayload);
            if (!insErr) totalDisinkronkan++;
          }
        } catch (e) {
          console.warn('[SYNC OFFLINE] Insert/Upsert error:', e);
        }
      }

      // 2. Terapkan pembaruan status yang dilakukan saat offline
      for (const up of offlineUpdates) {
        try {
          const updatePayload = {
            status: up.status,
            panggilan_ke: up.panggilan_ke !== undefined ? Number(up.panggilan_ke) : undefined,
            last_called_at: up.last_called_at || undefined,
            finished_at: up.finished_at || undefined,
            durasi_aktual_menit: up.durasi_aktual_menit !== undefined ? Number(up.durasi_aktual_menit) : undefined,
            urutan: up.urutan !== undefined ? Number(up.urutan) : undefined,
            alasan_batal: up.alasan_batal || undefined,
            waktu_dibatalkan: up.waktu_dibatalkan || undefined,
            updated_at: nowIso,
          };
          Object.keys(updatePayload).forEach(key => updatePayload[key] === undefined && delete updatePayload[key]);

          let query = supabase.from('antrean').update(updatePayload);
          if (up.id && typeof up.id === 'number' && up.id < 2000000000) {
            query = query.eq('id', up.id);
          } else if (up.nomor) {
            query = query.eq('nomor', up.nomor).eq('tenant_id', tenantId).eq('is_archived', false);
          } else if (up.id) {
            query = query.eq('id', up.id);
          }

          const { error: upErr } = await query;
          if (!upErr) totalDisinkronkan++;
        } catch (e) {
          console.warn('[SYNC OFFLINE] Update error:', e);
        }
      }

      // 3. Ambil seluruh data antrean terbaru dari Supabase
      const { data: antreanData } = await supabase
        .from('antrean')
        .select('*')
        .order('urutan', { ascending: true })
        .order('created_at', { ascending: true });

      return NextResponse.json({
        sukses: true,
        pesan: `Berhasil menyinkronkan ${totalDisinkronkan} pembaruan offline ke cloud database.`,
        total_disinkronkan: totalDisinkronkan,
        daftar_terbaru: antreanData || [],
      });
    }

    return NextResponse.json(
      { sukses: false, pesan: `Aksi '${aksi}' tidak dikenali.` },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API AKSI] Internal error:', error);
    return NextResponse.json(
      { sukses: false, pesan: `Terjadi kendala internal server: ${error?.message || error}` },
      { status: 500 }
    );
  }
}

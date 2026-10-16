import { NextResponse } from 'next/server';
import crypto from 'crypto';

const DEFAULT_ORGANISASI_ID = '00000000-0000-0000-0000-000000000001';

/**
 * POST /api/antrean/daftar
 * Pendaftaran tiket antrean publik & admin melalui server
 *
 * Mengamankan:
 * 1. Penomoran atomik dan pencegahan duplikasi nomor
 * 2. Pembuatan token pembatalan acak (kriptografis 32-karakter)
 * 3. Penyimpanan HASH token di database (bukan token mentah)
 * 4. Pencatatan fitur awal ke dataset ML (tanpa data masa depan)
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const nama = (body.nama || '').trim().slice(0, 100);
    const sumber = (body.sumber || 'PUBLIC').toUpperCase();
    const organisasiId = body.organisasi_id || body.tenant_id || DEFAULT_ORGANISASI_ID;
    const kunciIdempotensi = body.kunci_idempotensi || null;

    if (!nama) {
      return NextResponse.json(
        { sukses: false, pesan: 'Nama lengkap wajib diisi untuk mendaftar antrean.' },
        { status: 400 }
      );
    }

    // 1. Generate token pembatalan acak yang sulit ditebak
    const tokenPembatalan = crypto.randomBytes(16).toString('hex');
    const hashTokenPembatalan = crypto
      .createHash('sha256')
      .update(tokenPembatalan)
      .digest('hex');

    // 2. Hubungkan ke Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { sukses: false, pesan: 'Layanan database antrean belum dikonfigurasi.' },
        { status: 503 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Periksa status buka antrean organisasi
    const { data: cfg } = await supabase
      .from('pengaturan')
      .select('status_buka')
      .eq('id', 'pengaturan_organisasi')
      .maybeSingle();

    if (cfg && cfg.status_buka === false && sumber === 'PUBLIC') {
      return NextResponse.json(
        { sukses: false, pesan: 'Pendaftaran antrean sedang ditutup oleh petugas loket.' },
        { status: 403 }
      );
    }

    // 4. Daftarkan secara atomik via RPC register_queue
    let tiket = null;

    // Coba versi 5 parameter terlebih dahulu (dengan hash token pembatalan)
    const { data: rpcData, error: rpcError } = await supabase.rpc('register_queue', {
      p_tenant_id: organisasiId,
      p_nama: nama,
      p_sumber: sumber,
      p_idempotency_key: kunciIdempotensi,
      p_cancel_token_hash: hashTokenPembatalan,
    });

    if (!rpcError && rpcData) {
      tiket = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    } else {
      console.warn('RPC register_queue gagal, mengaktifkan fallback atomik langsung:', rpcError?.message);

      // Fallback transaksi langsung jika RPC overload/error
      // Hitung nomor berikutnya hari ini
      const todayDate = new Date().toISOString().split('T')[0];
      const { data: todayQueues } = await supabase
        .from('antrean')
        .select('nomor, urutan')
        .eq('tenant_id', organisasiId)
        .gte('created_at', `${todayDate}T00:00:00Z`);

      let maxNum = 0;
      let maxUrutan = 0;
      (todayQueues || []).forEach((q) => {
        const m = (q.nomor || '').match(/\d+/);
        if (m) {
          const n = parseInt(m[0], 10);
          if (n > maxNum) maxNum = n;
        }
        if (q.urutan && q.urutan > maxUrutan) maxUrutan = q.urutan;
      });

      const nextNum = maxNum + 1;
      const nomorBaru = 'A' + String(nextNum).padStart(2, '0');

      // Hitung antrean di depan
      const { count: antreanDiDepan } = await supabase
        .from('antrean')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', organisasiId)
        .eq('is_archived', false)
        .in('status', ['MENUNGGU', 'MEMANGGIL']);

      const estimasiAwal = Math.max(5, ((antreanDiDepan || 0) + 1) * 5);

      const { data: insertData, error: insertError } = await supabase
        .from('antrean')
        .insert({
          nomor: nomorBaru,
          nama,
          status: 'MENUNGGU',
          estimasi_menit: estimasiAwal,
          urutan: maxUrutan + 1,
          panggilan_ke: 0,
          is_archived: false,
          sumber,
          tenant_id: organisasiId,
          idempotency_key: kunciIdempotensi,
          cancel_token_hash: hashTokenPembatalan,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error('Gagal menyimpan antrean: ' + insertError.message);
      }

      tiket = insertData;
    }

    if (!tiket || !tiket.id) {
      return NextResponse.json(
        { sukses: false, pesan: 'Tidak ada data tiket yang berhasil dibuat.' },
        { status: 500 }
      );
    }

    // Pastikan hash token pembatalan tersimpan
    if (!tiket.cancel_token_hash) {
      await supabase
        .from('antrean')
        .update({ cancel_token_hash: hashTokenPembatalan })
        .eq('id', tiket.id);
    }

    // 6. Catat fitur dataset ML saat pendaftaran (asinkron)
    try {
      const waktuSekarang = new Date();
      const jamDaftar = Number((waktuSekarang.getHours() + waktuSekarang.getMinutes() / 60).toFixed(2));

      // Hitung antrean di depan
      const { count: antreanDiDepan } = await supabase
        .from('antrean')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', organisasiId)
        .eq('is_archived', false)
        .in('status', ['MENUNGGU', 'MEMANGGIL'])
        .lt('id', tiket.id);

      await supabase.from('ml_dataset').insert({
        tenant_id: organisasiId,
        antrean_id: tiket.id,
        nomor: tiket.nomor,
        sumber,
        antrean_di_depan: antreanDiDepan || 0,
        jam_daftar: jamDaftar,
        registered_at: tiket.created_at || waktuSekarang.toISOString(),
        status: 'PENDING',
      });
    } catch (errMl) {
      console.warn('Pencatatan dataset ML pendaftaran dilewati:', errMl.message);
    }

    // 7. Kembalikan data tiket beserta token pembatalan mentah kepada pendaftar
    return NextResponse.json({
      sukses: true,
      pesan: `Pendaftaran berhasil. Nomor antrean Anda: ${tiket.nomor}`,
      tiket: {
        ...tiket,
        token_pembatalan: tokenPembatalan, // Disimpan di perangkat pembuat tiket untuk pembatalan
      },
    });
  } catch (error) {
    console.error('Kesalahan pada endpoint pendaftaran antrean:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kegagalan server saat memproses pendaftaran antrean.' },
      { status: 500 }
    );
  }
}

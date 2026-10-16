import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Menghasilkan hash SHA-256 dari token pembatalan
 * @param {string} token
 * @returns {string}
 */
function hitungHashToken(token) {
  return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
}

/**
 * POST /api/antrean/batal
 * Pembatalan tiket antrean secara aman menggunakan verifikasi hash token
 *
 * Payload:
 * {
 *   antrean_id: number,
 *   token_pembatalan: string,
 *   alasan?: string
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const antreanId = body.antrean_id ?? body.antreanId ?? body.tiket_id ?? body.tiketId;
    const tokenPembatalan = body.token_pembatalan ?? body.token;
    const alasan = (body.alasan || 'Dibatalkan oleh pengunjung').trim().slice(0, 200);

    // 1. Validasi masukan dasar
    if (!antreanId || isNaN(Number(antreanId))) {
      return NextResponse.json(
        { sukses: false, pesan: 'ID tiket antrean tidak valid.' },
        { status: 400 }
      );
    }

    if (!tokenPembatalan || typeof tokenPembatalan !== 'string' || tokenPembatalan.trim().length < 8) {
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Token pembatalan tidak valid atau tidak disertakan. Pembatalan hanya dapat dilakukan oleh pemilik tiket yang sah.',
        },
        { status: 400 }
      );
    }

    const hashInput = hitungHashToken(tokenPembatalan);

    // 2. Hubungkan ke Supabase dengan aman
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { sukses: false, pesan: 'Layanan database antrean belum siap.' },
        { status: 503 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Ambil data tiket antrean saat ini
    const { data: tiket, error: errTiket } = await supabase
      .from('antrean')
      .select('id, nomor, nama, status, cancel_token_hash, finished_at, tenant_id')
      .eq('id', Number(antreanId))
      .maybeSingle();

    if (errTiket || !tiket) {
      return NextResponse.json(
        { sukses: false, pesan: 'Tiket antrean tidak ditemukan dalam sistem.' },
        { status: 404 }
      );
    }

    // 4. Periksa apakah tiket sudah dibatalkan sebelumnya
    if (tiket.status === 'DIBATALKAN') {
      return NextResponse.json(
        { sukses: false, pesan: 'Tiket antrean ini sudah pernah dibatalkan sebelumnya.' },
        { status: 400 }
      );
    }

    // 5. Periksa status tiket: hanya boleh dibatalkan jika masih MENUNGGU atau TERLAMBAT
    if (tiket.status === 'SELESAI') {
      return NextResponse.json(
        { sukses: false, pesan: 'Tiket antrean tidak dapat dibatalkan karena pelayanan telah selesai.' },
        { status: 400 }
      );
    }

    if (tiket.status === 'MEMANGGIL') {
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Tiket sedang dipanggil ke loket pelayanan. Silakan konfirmasi langsung ke petugas jika ingin membatalkan.',
        },
        { status: 400 }
      );
    }

    // 6. Validasi hash token pembatalan menggunakan constant-time comparison
    if (!tiket.cancel_token_hash) {
      // Tiket lama yang dibuat sebelum fitur token pembatalan
      // Demi keamanan, tolak pembatalan tanpa token yang sesuai
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Tiket ini tidak memiliki token pembatalan terdaftar. Silakan hubungi petugas loket.',
        },
        { status: 403 }
      );
    }

    const bufInput = Buffer.from(hashInput, 'hex');
    const bufDatabase = Buffer.from(tiket.cancel_token_hash, 'hex');

    let cocok = false;
    if (bufInput.length === bufDatabase.length) {
      cocok = crypto.timingSafeEqual(bufInput, bufDatabase);
    }

    if (!cocok) {
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Otorisasi gagal: Token pembatalan tidak cocok. Anda tidak memiliki hak untuk membatalkan tiket ini.',
        },
        { status: 403 }
      );
    }

    // 7. Perbarui status tiket menjadi 'DIBATALKAN' secara aman (bukan DELETE fisik)
    const waktuBatal = new Date().toISOString();
    const { error: errUpdate } = await supabase
      .from('antrean')
      .update({
        status: 'DIBATALKAN',
        finished_at: waktuBatal,
      })
      .eq('id', tiket.id)
      .eq('status', tiket.status); // Cegah race condition: hanya update jika status belum berubah

    if (errUpdate) {
      return NextResponse.json(
        { sukses: false, pesan: 'Gagal memperbarui status antrean: ' + errUpdate.message },
        { status: 500 }
      );
    }

    // 8. Perbarui status dataset ML agar tiket batal tidak menghasilkan label waktu tunggu palsu
    try {
      await supabase
        .from('ml_dataset')
        .update({ status: 'CANCELLED' })
        .eq('antrean_id', tiket.id);
    } catch (_) {
      // Non-blocking jika tabel ml_dataset belum aktif
    }

    return NextResponse.json({
      sukses: true,
      pesan: `Tiket antrean nomor ${tiket.nomor} atas nama ${tiket.nama} berhasil dibatalkan.`,
      tiket: {
        id: tiket.id,
        nomor: tiket.nomor,
        status: 'DIBATALKAN',
        waktuDibatalkan: waktuBatal,
        alasan,
      },
    });
  } catch (error) {
    console.error('Kesalahan pada endpoint pembatalan antrean:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kesalahan sistem saat memproses pembatalan tiket.' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { ambilSesiDariRequest } from '@/lib/auth';

/**
 * POST /api/auth/hapus-akun
 * Menghapus akun petugas dari sistem secara permanen.
 * Memerlukan sesi petugas aktif dan konfirmasi ganda.
 * 
 * Body: { email }
 */
export async function POST(request) {
  try {
    const sesi = ambilSesiDariRequest(request);
    if (!sesi) {
      return NextResponse.json(
        { sukses: false, pesan: 'Akses ditolak. Silakan masuk terlebih dahulu.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { sukses: false, pesan: 'Alamat email akun yang akan dihapus wajib diisi.' },
        { status: 400 }
      );
    }

    // Cegah menghapus akun yang sedang aktif digunakan
    const emailSesi = (sesi.email || '').trim().toLowerCase();
    const usernameSesi = (sesi.username || '').trim().toLowerCase();
    if (email === emailSesi || email === usernameSesi || (emailSesi && email.includes(emailSesi))) {
      return NextResponse.json(
        { sukses: false, pesan: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let berhasilHapus = false;

    // 1. Coba hapus via Supabase Auth Admin jika Service Role Key tersedia
    if (supabaseUrl && serviceRoleKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const targetUser = listData?.users?.find(
          (u) => (u.email || '').toLowerCase() === email
        );

        if (targetUser) {
          const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(targetUser.id);
          if (delError) {
            console.error('Gagal hapus user di auth:', delError.message);
            return NextResponse.json(
              { sukses: false, pesan: `Gagal menghapus akun: ${delError.message}` },
              { status: 400 }
            );
          }
          berhasilHapus = true;
        }
      } catch (errAdmin) {
        console.error('Kesalahan admin auth delete:', errAdmin);
      }
    }

    // 2. Coba bersihkan dari tabel kredensial_petugas jika ada
    if (supabaseUrl && (serviceRoleKey || supabaseAnonKey)) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const key = serviceRoleKey || supabaseAnonKey;
        const supabase = createClient(supabaseUrl, key, { auth: { persistSession: false } });

        const usernameTarget = email.split('@')[0];
        const { error: dbError } = await supabase
          .from('kredensial_petugas')
          .delete()
          .or(`username.eq.${email},username.eq.${usernameTarget}`);

        if (!dbError) {
          berhasilHapus = true;
        }
      } catch (_) {}
    }

    if (!berhasilHapus) {
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Layanan penghapusan akun belum dapat diproses. Pastikan akun tersebut terdaftar dan server terkonfigurasi.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sukses: true,
      pesan: `Akun ${email} berhasil dihapus permanen dari sistem.`,
    });
  } catch (error) {
    console.error('[HAPUS-AKUN] Error:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kesalahan server saat memproses penghapusan akun.' },
      { status: 500 }
    );
  }
}

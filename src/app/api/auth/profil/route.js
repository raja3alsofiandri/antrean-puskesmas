import { NextResponse } from 'next/server';
import {
  ambilSesiDariRequest,
  buatTokenSesi,
  NAMA_COOKIE_SESI,
  DURASI_SESI_DETIK,
} from '@/lib/auth';

/**
 * POST /api/auth/profil
 * Memperbarui nama pengguna (username / nama petugas) yang sedang login.
 * Menyimpan perubahan secara permanen ke Supabase Auth user_metadata
 * dan memperbarui cookie sesi server.
 */
export async function POST(request) {
  try {
    const sesi = ambilSesiDariRequest(request);

    if (!sesi) {
      return NextResponse.json(
        { sukses: false, pesan: 'Akses ditolak. Silakan login terlebih dahulu.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const namaBaru = (body.nama || body.username || '').trim();

    if (!namaBaru) {
      return NextResponse.json(
        { sukses: false, pesan: 'Nama pengguna tidak boleh kosong.' },
        { status: 400 }
      );
    }

    if (namaBaru.length < 2) {
      return NextResponse.json(
        { sukses: false, pesan: 'Nama pengguna minimal 2 karakter.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 1. Simpan perubahan ke Supabase Auth metadata jika Service Role Key tersedia
    if (supabaseUrl && serviceRoleKey && sesi.userId) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userObj } = await supabaseAdmin.auth.admin.getUserById(sesi.userId);
        const existingMeta = userObj?.user?.user_metadata || {};

        await supabaseAdmin.auth.admin.updateUserById(sesi.userId, {
          user_metadata: {
            ...existingMeta,
            nama: namaBaru,
            username: namaBaru,
            nama_diperbarui_pada: new Date().toISOString(),
          },
        });
      } catch (errAdmin) {
        console.warn('[AUTH-PROFIL] Gagal update via admin:', errAdmin.message);
      }
    }

    // 2. Simpan juga ke tabel kredensial_petugas jika ada
    if (supabaseUrl && (serviceRoleKey || supabaseAnonKey)) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseClient = createClient(supabaseUrl, serviceRoleKey || supabaseAnonKey, {
          auth: { persistSession: false },
        });

        await supabaseClient
          .from('kredensial_petugas')
          .update({
            nama: namaBaru,
            username: namaBaru,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sesi.userId)
          .catch(() => {});
      } catch (_) {}
    }

    // 3. Terbitkan token sesi baru yang memuat username terbaru
    const updatedSesiPayload = {
      ...sesi,
      username: namaBaru,
    };
    const tokenBaru = buatTokenSesi(updatedSesiPayload);

    // 4. Kirim respons dan set cookie httpOnly yang diperbarui
    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      sukses: true,
      pesan: `Nama pengguna berhasil diperbarui menjadi "${namaBaru}" dan tersimpan permanen!`,
      pengguna: {
        userId: sesi.userId,
        username: namaBaru,
        email: sesi.email,
        peran: sesi.peran,
      },
    });

    response.cookies.set({
      name: NAMA_COOKIE_SESI,
      value: tokenBaru,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: DURASI_SESI_DETIK,
    });

    return response;
  } catch (error) {
    console.error('[AUTH-PROFIL] Error:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kesalahan server saat memperbarui profil pengguna.' },
      { status: 500 }
    );
  }
}

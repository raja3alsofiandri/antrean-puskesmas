import { NextResponse } from 'next/server';
import { ambilSesiDariRequest } from '@/lib/auth';

/**
 * POST /api/auth/tambah-akun
 * Membuat akun login baru di Supabase Auth menggunakan Service Role Key.
 * Hanya bisa diakses oleh petugas yang sudah terautentikasi (sesi aktif).
 *
 * Body: { email, password }
 * Membutuhkan SUPABASE_SERVICE_ROLE_KEY di environment variables.
 */
export async function POST(request) {
  try {
    // Verifikasi sesi petugas yang sedang login
    const sesi = ambilSesiDariRequest(request);
    if (!sesi) {
      return NextResponse.json(
        { sukses: false, pesan: 'Akses ditolak. Silakan masuk terlebih dahulu.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const password = (body.password || '').trim();

    // Validasi input
    if (!email || !password) {
      return NextResponse.json(
        { sukses: false, pesan: 'Email dan kata sandi wajib diisi.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { sukses: false, pesan: 'Format alamat email tidak valid.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { sukses: false, pesan: 'Kata sandi minimal 8 karakter.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Layanan manajemen akun belum dikonfigurasi pada server.',
          kodeError: 'SERVICE_KEY_MISSING',
        },
        { status: 503 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Buat akun baru menggunakan admin API
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // langsung konfirmasi tanpa perlu verifikasi email
      user_metadata: {
        role: 'admin',
        dibuat_oleh: sesi.username || sesi.userId,
      },
    });

    if (error) {
      const pesanError = error.message?.includes('already registered') || error.message?.includes('already been registered')
        ? `Alamat email ${email} sudah terdaftar di dalam sistem. Silakan gunakan alamat email lain.`
        : `Gagal membuat akun: ${error.message}`;

      return NextResponse.json(
        { sukses: false, pesan: pesanError },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sukses: true,
      pesan: `Akun baru berhasil dibuat untuk ${email}. Petugas dapat langsung masuk menggunakan email dan kata sandi tersebut.`,
      pengguna: {
        id: data.user?.id,
        email: data.user?.email,
      },
    });
  } catch (error) {
    console.error('[TAMBAH-AKUN] Internal error:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kegagalan server saat membuat akun baru.' },
      { status: 500 }
    );
  }
}

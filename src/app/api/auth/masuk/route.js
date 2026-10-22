import { NextResponse } from 'next/server';
import {
  buatTokenSesi,
  periksaStatusKunci,
  catatLoginGagal,
  resetLoginGagal,
  NAMA_COOKIE_SESI,
  DURASI_SESI_DETIK,
  verifikasiPassword,
  bersihkanAkunPendingKedaluwarsa,
} from '@/lib/auth';

const DEFAULT_ORGANISASI_ID = '00000000-0000-0000-0000-000000000001';

/**
 * POST /api/auth/masuk
 * Autentikasi petugas / admin organisasi secara resmi melalui Supabase Auth
 *
 * Catatan Keamanan:
 * - Menggunakan Supabase Authentication (auth.users) sebagai penyedia identitas tunggal.
 * - TIDAK MENGGUNAKAN kata sandi bawaan / hardcoded password apa pun.
 * - Dilengkapi perlindungan anti brute-force: penguncian akun 15 menit setelah 5x gagal.
 * - Menerbitkan cookie httpOnly SameSite=Lax bertanda tangan HMAC-SHA256.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier = (body.email || body.username || '').trim().toLowerCase();
    const password = body.password || '';

    if (!identifier || !password) {
      return NextResponse.json(
        { sukses: false, pesan: 'Email atau nama pengguna serta kata sandi wajib diisi.' },
        { status: 400 }
      );
    }

    // 1. Periksa apakah akun sedang dikunci karena terlalu banyak percobaan gagal
    const statusKunci = periksaStatusKunci(identifier);
    if (statusKunci.terkunci) {
      return NextResponse.json(
        {
          sukses: false,
          pesan: `Akun terkunci sementara demi keamanan karena 5 kali percobaan gagal. Silakan tunggu ${statusKunci.sisaMenit} menit lagi.`,
          terkunci: true,
          sisaMenit: statusKunci.sisaMenit,
        },
        { status: 429 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Konfigurasi Supabase Auth belum terpasang di server (.env.local). Hubungi administrator sistem.',
        },
        { status: 500 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userValid = null;
    let authSessionData = null;

    // Bersihkan akun pending anomali (> 30 menit) jika service role key tersedia
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        bersihkanAkunPendingKedaluwarsa(supabaseAdmin).catch(() => {});
      } catch (_) {}
    }

    // 2. Autentikasi utama menggunakan Supabase Auth (signInWithPassword)
    const emailToAuth = identifier.includes('@') ? identifier : `${identifier}@antrean.local`;

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToAuth,
      password: password,
    });

    if (!authError && authData?.user) {
      const user = authData.user;

      // Akun yang masih pending belum memiliki password resmi dan dilarang login
      if (user.user_metadata?.status === 'pending') {
        return NextResponse.json(
          {
            sukses: false,
            pesan: 'Akun ini masih dalam status pendaftaran sementara dan belum memiliki kata sandi resmi. Silakan selesaikan proses pendaftaran akun terlebih dahulu.',
          },
          { status: 403 }
        );
      }

      userValid = {
        userId: user.id,
        email: user.email,
        username: user.user_metadata?.nama || user.user_metadata?.username || (user.email ? user.email.split('@')[0] : identifier),
        organisasiId: user.user_metadata?.organisasi_id || user.user_metadata?.tenant_id || DEFAULT_ORGANISASI_ID,
        peran: user.app_metadata?.role || user.user_metadata?.role || 'admin',
      };
      authSessionData = authData.session;
    } else if (identifier.includes('@') && authError) {
      // Jika email eksplisit dimasukkan dan ditolak oleh Supabase Auth
      console.warn('Supabase Auth gagal:', authError.message);
    } else {
      // 3. Jika username dimasukkan tanpa '@', coba periksa tabel kredensial_petugas jika sudah ada hash unik (tanpa fallback default)
      try {
        const { data: petData } = await supabase
          .from('kredensial_petugas')
          .select('*')
          .eq('username', identifier)
          .maybeSingle();

        if (petData && petData.password_hash && petData.salt) {
          const cocok = verifikasiPassword(password, petData.password_hash, petData.salt);
          if (cocok) {
            userValid = {
              userId: petData.id,
              username: petData.username,
              organisasiId: petData.tenant_id || DEFAULT_ORGANISASI_ID,
              peran: petData.peran || 'admin',
            };
          }
        }
      } catch (errDb) {
        console.warn('Pemeriksaan kredensial cadangan dilewati:', errDb.message);
      }
    }

    // 4. Jika verifikasi gagal (TIDAK ADA KATA SANDI DEFAULT BAWAAN)
    if (!userValid) {
      const hasilGagal = catatLoginGagal(identifier);
      if (hasilGagal.terkunci) {
        return NextResponse.json(
          {
            sukses: false,
            pesan: `Akun dikunci demi keamanan karena ${hasilGagal.sisaPercobaan === 0 ? '5' : ''} kali percobaan gagal. Tunggu ${hasilGagal.sisaMenit} menit.`,
            terkunci: true,
            sisaMenit: hasilGagal.sisaMenit,
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Email atau kata sandi salah. Silakan periksa kembali kredensial Anda.',
          sisaPercobaan: hasilGagal.sisaPercobaan,
        },
        { status: 401 }
      );
    }

    // 5. Berhasil: Reset catatan gagal
    resetLoginGagal(identifier);

    // 6. Buat token sesi aman server
    const tokenSesi = buatTokenSesi(userValid);

    // 7. Siapkan respons dengan cookie httpOnly
    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      sukses: true,
      pesan: 'Autentikasi Supabase berhasil. Selamat bertugas!',
      pengguna: {
        userId: userValid.userId,
        username: userValid.username,
        email: userValid.email,
        organisasiId: userValid.organisasiId,
        peran: userValid.peran,
      },
      session: authSessionData
        ? {
            accessToken: authSessionData.access_token,
            expiresAt: authSessionData.expires_at,
          }
        : null,
    });

    response.cookies.set({
      name: NAMA_COOKIE_SESI,
      value: tokenSesi,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: DURASI_SESI_DETIK,
    });

    return response;
  } catch (error) {
    console.error('Kesalahan pada endpoint masuk:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kendala pada server saat memproses login.' },
      { status: 500 }
    );
  }
}

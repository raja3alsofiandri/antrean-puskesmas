import { NextResponse } from 'next/server';
import {
  ambilSesiDariRequest,
  hashPassword,
  verifikasiPassword,
  buatSalt,
} from '@/lib/auth';

/**
 * POST /api/auth/ganti-sandi
 * Memperbarui kata sandi akun petugas secara aman melalui Supabase Auth
 * Menghapus segala bentuk kata sandi default bawaan.
 */
export async function POST(request) {
  const sesi = ambilSesiDariRequest(request);

  if (!sesi) {
    return NextResponse.json(
      { sukses: false, pesan: 'Akses ditolak. Sesi Anda tidak valid atau telah berakhir.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const sandiLama = body.sandi_lama || '';
    const sandiBaru = body.sandi_baru || '';

    if (!sandiLama || !sandiBaru) {
      return NextResponse.json(
        { sukses: false, pesan: 'Kata sandi saat ini dan kata sandi baru wajib diisi.' },
        { status: 400 }
      );
    }

    if (sandiBaru.length < 8) {
      return NextResponse.json(
        { sukses: false, pesan: 'Kata sandi baru minimal 8 karakter demi standar keamanan.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { sukses: false, pesan: 'Koneksi database Supabase belum terkonfigurasi.' },
        { status: 500 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let verified = false;
    let authAccessToken = null;

    // 1. Verifikasi kata sandi lama via Supabase Auth
    const emailToVerify = sesi.email || (sesi.username.includes('@') ? sesi.username : `${sesi.username}@antrean.local`);
    const { data: authSignIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: emailToVerify,
      password: sandiLama,
    });

    if (!signInError && authSignIn?.session) {
      verified = true;
      authAccessToken = authSignIn.session.access_token;

      // Update password via Supabase REST API langsung agar bebas dari masalah internal session storage
      try {
        const updateRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${authAccessToken}`,
          },
          body: JSON.stringify({ password: sandiBaru }),
        });

        const updateData = await updateRes.json().catch(() => ({}));

        if (!updateRes.ok) {
          // Fallback via client.auth.setSession & updateUser
          await supabase.auth.setSession({
            access_token: authSignIn.session.access_token,
            refresh_token: authSignIn.session.refresh_token,
          });

          const { error: fallbackErr } = await supabase.auth.updateUser({
            password: sandiBaru,
          });

          if (fallbackErr) {
            return NextResponse.json(
              { sukses: false, pesan: 'Gagal memperbarui kata sandi. Pastikan kata sandi memenuhi kriteria keamanan.' },
              { status: 400 }
            );
          }
        }
      } catch (restErr) {
        // Fallback jika fetch REST gagal
        await supabase.auth.setSession({
          access_token: authSignIn.session.access_token,
          refresh_token: authSignIn.session.refresh_token,
        });

        const { error: fallbackErr } = await supabase.auth.updateUser({
          password: sandiBaru,
        });

        if (fallbackErr) {
          return NextResponse.json(
            { sukses: false, pesan: 'Gagal memperbarui kata sandi. Silakan coba kembali.' },
            { status: 400 }
          );
        }
      }
    } else {
      // 2. Cek tabel kredensial_petugas jika menggunakan PBKDF2 hash
      const { data: petData } = await supabase
        .from('kredensial_petugas')
        .select('*')
        .eq('username', sesi.username)
        .maybeSingle();

      if (petData && petData.password_hash && petData.salt) {
        const cocok = verifikasiPassword(sandiLama, petData.password_hash, petData.salt);
        if (cocok) {
          verified = true;
          const saltBaru = buatSalt();
          const hashBaru = hashPassword(sandiBaru, saltBaru);

          await supabase
            .from('kredensial_petugas')
            .update({
              password_hash: hashBaru,
              salt: saltBaru,
              updated_at: new Date().toISOString(),
            })
            .eq('id', petData.id);
        }
      }
    }

    if (!verified) {
      return NextResponse.json(
        { sukses: false, pesan: 'Kata sandi saat ini tidak sesuai.' },
        { status: 401 }
      );
    }

    // 3. Sinkronkan juga ke tabel kredensial_petugas jika ada baris untuk username ini
    try {
      const { data: petData } = await supabase
        .from('kredensial_petugas')
        .select('id')
        .eq('username', sesi.username)
        .maybeSingle();

      if (petData) {
        const saltBaru = buatSalt();
        const hashBaru = hashPassword(sandiBaru, saltBaru);
        await supabase
          .from('kredensial_petugas')
          .update({
            password_hash: hashBaru,
            salt: saltBaru,
            updated_at: new Date().toISOString(),
          })
          .eq('id', petData.id);
      }
    } catch (_) {}

    // 4. Jika service role key tersedia, sinkronkan juga ke auth.users
    if (serviceRoleKey && sesi.userId) {
      try {
        const adminSupabase = createClient(supabaseUrl, serviceRoleKey);
        await adminSupabase.auth.admin.updateUserById(sesi.userId, {
          password: sandiBaru,
        });
      } catch (adminErr) {
        console.warn('Sinkronisasi password admin dilewati:', adminErr.message);
      }
    }

    return NextResponse.json({
      sukses: true,
      pesan: 'Kata sandi berhasil diperbarui dengan aman.',
    });
  } catch (error) {
    console.error('Kesalahan saat ganti sandi:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Gagal memperbarui kata sandi server.' },
      { status: 500 }
    );
  }
}

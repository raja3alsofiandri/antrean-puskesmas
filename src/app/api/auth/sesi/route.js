import { NextResponse } from 'next/server';
import { ambilSesiDariRequest } from '@/lib/auth';

/**
 * GET /api/auth/sesi
 * Memverifikasi validitas sesi aktif petugas dari cookie httpOnly
 */
export async function GET(request) {
  const sesi = ambilSesiDariRequest(request);

  if (!sesi) {
    return NextResponse.json(
      { terautentikasi: false, pesan: 'Sesi tidak ditemukan atau belum login.' },
      { status: 200 }
    );
  }

  let usernameAktif = sesi.username;
  let emailAktif = sesi.email || (sesi.username && sesi.username.includes('@') ? sesi.username : null);

  // Jika service role key tersedia, periksa metadata pengguna terbaru agar nama selalu sinkron
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRoleKey && sesi.userId) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userObj } = await supabaseAdmin.auth.admin.getUserById(sesi.userId);
      if (userObj?.user) {
        const meta = userObj.user.user_metadata || {};
        if (meta.nama || meta.username) {
          usernameAktif = meta.nama || meta.username;
        }
        if (userObj.user.email) {
          emailAktif = userObj.user.email;
        }
      }
    } catch (_) {}
  }

  return NextResponse.json({
    terautentikasi: true,
    pengguna: {
      userId: sesi.userId,
      username: usernameAktif,
      email: emailAktif,
      organisasiId: sesi.organisasiId,
      peran: sesi.peran,
      kedaluwarsaPada: sesi.exp,
    },
  });
}

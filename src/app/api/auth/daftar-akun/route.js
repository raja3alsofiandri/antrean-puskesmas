import { NextResponse } from 'next/server';
import { ambilSesiDariRequest } from '@/lib/auth';

/**
 * GET /api/auth/daftar-akun
 * Mengambil daftar akun petugas yang terdaftar di sistem.
 * Memerlukan sesi petugas aktif.
 */
export async function GET(request) {
  try {
    const sesi = ambilSesiDariRequest(request);
    if (!sesi) {
      return NextResponse.json(
        { sukses: false, pesan: 'Akses ditolak. Silakan masuk terlebih dahulu.' },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let akunList = [];

    // Jika Service Role Key tersedia, ambil dari Supabase Auth Admin
    if (supabaseUrl && serviceRoleKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await supabaseAdmin.auth.admin.listUsers();
        if (!error && data?.users) {
          akunList = data.users.map((u) => ({
            id: u.id,
            email: u.email || '',
            dibuatPada: u.created_at,
            terakhirMasuk: u.last_sign_in_at,
            peran: u.user_metadata?.role || u.app_metadata?.role || 'petugas',
          }));
        }
      } catch (errAdmin) {
        console.warn('Gagal membaca auth users via admin:', errAdmin.message);
      }
    }

    // Jika list masih kosong dan ada anon key, coba cek kredensial_petugas
    if (akunList.length === 0 && supabaseUrl && supabaseAnonKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
        });
        const { data: petData } = await supabase
          .from('kredensial_petugas')
          .select('id, username, peran, created_at');

        if (petData && petData.length > 0) {
          akunList = petData.map((p) => ({
            id: String(p.id),
            email: p.username.includes('@') ? p.username : `${p.username}@organisasi.com`,
            dibuatPada: p.created_at,
            terakhirMasuk: null,
            peran: p.peran || 'petugas',
          }));
        }
      } catch (_) {}
    }

    // Pastikan akun aktif yang sedang login minimal ada di daftar jika list masih kosong
    if (akunList.length === 0 && sesi) {
      const emailAktif = sesi.email || (sesi.username.includes('@') ? sesi.username : `${sesi.username}@organisasi.com`);
      akunList.push({
        id: sesi.userId || 'active',
        email: emailAktif,
        dibuatPada: new Date().toISOString(),
        terakhirMasuk: new Date().toISOString(),
        peran: sesi.peran || 'admin',
      });
    }

    return NextResponse.json({
      sukses: true,
      data: akunList,
    });
  } catch (error) {
    console.error('[DAFTAR-AKUN] Error:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Gagal memuat daftar akun petugas.' },
      { status: 500 }
    );
  }
}

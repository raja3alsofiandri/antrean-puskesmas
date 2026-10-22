import { NextResponse } from 'next/server';
import { ambilSesiDariRequest, bersihkanAkunPendingKedaluwarsa } from '@/lib/auth';

/**
 * POST /api/auth/tambah-akun
 * Menetapkan kata sandi resmi dan mengaktifkan akun petugas baru di Supabase Auth.
 * Hanya bisa diakses oleh petugas yang sudah terautentikasi (sesi aktif).
 *
 * Body: { email, password, nama, role }
 */
export async function POST(request) {
  try {
    // 1. Verifikasi sesi petugas yang sedang login ATAU token aktivasi email
    const sesi = ambilSesiDariRequest(request);
    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const password = (body.password || '').trim();
    const nama = (body.nama || '').trim();
    const role = (body.role || 'admin').trim().toLowerCase();
    const token = (body.token || '').trim();

    if (!sesi && !token) {
      return NextResponse.json(
        { sukses: false, pesan: 'Akses ditolak. Silakan masuk terlebih dahulu atau gunakan tautan aktivasi email yang valid.' },
        { status: 401 }
      );
    }

    // 2. Validasi input
    if (!email || !password) {
      return NextResponse.json(
        { sukses: false, pesan: 'Email dan kata sandi resmi wajib diisi.' },
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
        { sukses: false, pesan: 'Kata sandi resmi minimal 8 karakter.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          sukses: false,
          pesan: 'Layanan manajemen akun belum dikonfigurasi pada server (SUPABASE_SERVICE_ROLE_KEY missing).',
          kodeError: 'SERVICE_KEY_MISSING',
        },
        { status: 503 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 3. Bersihkan akun anomali (pending > 30 menit tanpa password)
    await bersihkanAkunPendingKedaluwarsa(supabaseAdmin);

    // 4. Cari akun di Supabase Auth
    const { data: userList, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      return NextResponse.json(
        { sukses: false, pesan: `Gagal membaca basis data pengguna: ${listErr.message}` },
        { status: 500 }
      );
    }

    const existingUser = userList?.users?.find(
      (u) => (u.email || '').toLowerCase() === email
    );

    let savedUserId = null;

    if (existingUser) {
      // Jika aktivasi dilakukan tanpa sesi login admin, verifikasi token aktivasi
      if (!sesi) {
        const meta = existingUser.user_metadata || {};
        if (meta.status !== 'pending') {
          return NextResponse.json(
            { sukses: false, pesan: 'Akun ini sudah aktif. Silakan masuk menggunakan kata sandi Anda.' },
            { status: 400 }
          );
        }
        if (meta.pending_until && meta.pending_until < Date.now()) {
          return NextResponse.json(
            { sukses: false, pesan: 'Tautan aktivasi telah kedaluwarsa (maksimal 30 menit). Silakan minta administrator mengirim ulang tautan aktivasi.' },
            { status: 400 }
          );
        }
        if (token && meta.activation_token && meta.activation_token !== token) {
          return NextResponse.json(
            { sukses: false, pesan: 'Token tautan aktivasi tidak valid.' },
            { status: 400 }
          );
        }
      }

      // Perbarui password user dan tandai statusnya menjadi 'aktif'
      const { data: updated, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            ...existingUser.user_metadata,
            nama: nama || existingUser.user_metadata?.nama || email.split('@')[0],
            username: nama || existingUser.user_metadata?.nama || email.split('@')[0],
            role: role === 'superadmin' ? 'superadmin' : 'admin',
            status: 'aktif', // Resmi aktif dan memiliki kata sandi resmi
            activation_token: null,
            pending_until: null,
            dibuat_oleh: sesi?.username || sesi?.userId || 'Aktivasi Tautan Email',
            diaktifkan_pada: new Date().toISOString(),
          },
        }
      );

      if (updateErr) {
        return NextResponse.json(
          { sukses: false, pesan: `Gagal memperbarui kata sandi akun: ${updateErr.message}` },
          { status: 400 }
        );
      }
      savedUserId = updated.user?.id;
    } else {
      // Jika tanpa sesi dan user tidak ditemukan di auth
      if (!sesi) {
        return NextResponse.json(
          { sukses: false, pesan: 'Akun aktivasi tidak ditemukan atau telah kedaluwarsa.' },
          { status: 404 }
        );
      }

      // Jika belum tercatat dan dipanggil oleh admin resmi dengan sesi
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nama: nama || email.split('@')[0],
          username: nama || email.split('@')[0],
          role: role === 'superadmin' ? 'superadmin' : 'admin',
          status: 'aktif',
          dibuat_oleh: sesi?.username || sesi?.userId || 'Admin',
          diaktifkan_pada: new Date().toISOString(),
        },
      });

      if (createErr) {
        return NextResponse.json(
          { sukses: false, pesan: `Gagal membuat akun: ${createErr.message}` },
          { status: 400 }
        );
      }
      savedUserId = created.user?.id;
    }

    return NextResponse.json({
      sukses: true,
      pesan: `Akun petugas untuk ${email} berhasil diaktifkan dengan kata sandi baru. Petugas kini dapat masuk ke sistem.`,
      pengguna: {
        id: savedUserId,
        email: email,
      },
    });
  } catch (error) {
    console.error('[TAMBAH-AKUN] Internal error:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kegagalan server saat menyelesaikan pendaftaran akun.' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  periksaRateLimitOtp,
  catatPengirimanOtp,
  bersihkanAkunPendingKedaluwarsa,
  ambilSesiDariRequest,
} from '@/lib/auth';

// In-memory cache OTP fallback untuk reliabilitas
const otpCache = new Map();

/**
 * POST /api/auth/otp
 * Endpoint terpadu untuk pengiriman tautan verifikasi email aman & OTP:
 * 1. KIRIM_LINK_PENDAFTARAN / KIRIM_OTP: Mengirim tautan aktivasi pendaftaran akun baru
 * 2. KIRIM_LINK_GANTI_EMAIL: Mengirim tautan konfirmasi ganti alamat email
 * 3. KONFIRMASI_GANTI_EMAIL: Menyelesaikan pembaruan email saat tautan diklik
 * 4. VERIFIKASI_OTP: Fallback verifikasi kode numerik jika diperlukan
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const aksi = body.aksi || 'KIRIM_LINK_PENDAFTARAN';
    const email = (body.email || body.emailBaru || '').trim().toLowerCase();
    const token = (body.token || '').trim();

    if (!email) {
      return NextResponse.json(
        { sukses: false, pesan: 'Alamat email wajib diisi.' },
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let supabaseAdmin = null;
    if (supabaseUrl && serviceRoleKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      } catch (errAdmin) {
        console.warn('[AUTH-LINK] Gagal menginisialisasi Supabase Admin:', errAdmin.message);
      }
    }

    // Jalankan auto-cleanup akun pending kedaluwarsa (> 30 menit tanpa password)
    if (supabaseAdmin) {
      bersihkanAkunPendingKedaluwarsa(supabaseAdmin).catch(() => {});
    }

    const origin = request.headers.get('origin') ||
      request.headers.get('referer')?.split('/').slice(0, 3).join('/') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';

    // =========================================================================
    // AKSI 1: KIRIM TAUTAN AKTIVASI PENDAFTARAN AKUN BARU
    // =========================================================================
    if (aksi === 'KIRIM_LINK_PENDAFTARAN' || (aksi === 'KIRIM_OTP' && body.mode === 'PENDAFTARAN')) {
      // 1. Rate Limiting: Maksimal 2 kali pengiriman per jam per email
      const statusRate = periksaRateLimitOtp(email);
      if (!statusRate.diperbolehkan) {
        return NextResponse.json(
          {
            sukses: false,
            pesan: `Batas pengiriman tautan tercapai (maksimal 2 kali per jam). Silakan coba lagi dalam ${statusRate.sisaMenit} menit.`,
            rateLimited: true,
            sisaMenit: statusRate.sisaMenit,
          },
          { status: 429 }
        );
      }

      const nama = (body.nama || '').trim();
      const role = body.role === 'superadmin' ? 'superadmin' : 'admin';

      if (!nama) {
        return NextResponse.json(
          { sukses: false, pesan: 'Nama lengkap petugas wajib diisi.' },
          { status: 400 }
        );
      }

      const activationToken = crypto.randomBytes(24).toString('hex');

      // 2. Periksa akun di Supabase Auth & simpan status sementara (30 menit)
      if (supabaseAdmin) {
        try {
          const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userList?.users?.find(
            (u) => (u.email || '').toLowerCase() === email
          );

          if (existingUser) {
            // Jika akun sudah aktif dan memiliki kata sandi resmi
            if (existingUser.user_metadata?.status !== 'pending') {
              return NextResponse.json(
                {
                  sukses: false,
                  pesan: `Alamat email ${email} sudah terdaftar sebagai petugas aktif. Gunakan email lain.`,
                },
                { status: 400 }
              );
            } else {
              // Refresh batas waktu pending 30 menit
              await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
                user_metadata: {
                  ...existingUser.user_metadata,
                  nama: nama || existingUser.user_metadata?.nama,
                  username: nama || existingUser.user_metadata?.nama,
                  role,
                  status: 'pending',
                  activation_token: activationToken,
                  pending_until: Date.now() + 30 * 60 * 1000,
                  tautan_dikirim_at: new Date().toISOString(),
                },
              });
            }
          } else {
            // Buat akun sementara di Supabase Auth dengan password acak yang tidak dapat ditebak
            const tempPassword = `temp_${crypto.randomUUID()}_!${Date.now()}`;
            await supabaseAdmin.auth.admin.createUser({
              email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: {
                nama,
                username: nama,
                role,
                status: 'pending', // Menandakan akun sementara, belum memiliki kata sandi resmi
                activation_token: activationToken,
                pending_until: Date.now() + 30 * 60 * 1000, // Berlaku maksimal 30 menit
                dibuat_pada: new Date().toISOString(),
              },
            });
          }
        } catch (errUser) {
          console.warn('[AUTH-LINK] Error pengelolaan akun sementara:', errUser.message);
        }
      }

      // 3. Buat tautan aktivasi langsung (Direct Application Link) & tautan Supabase yang aman dari penolakan whitelist
      const directActivationLink = `${origin}/admin?mode=aktivasi_akun&email=${encodeURIComponent(email)}&nama=${encodeURIComponent(nama)}&role=${role}&token=${activationToken}`;
      const supabaseRedirectUrl = `${origin}/admin`;

      let emailTerkirim = false;
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
          });

          const { error: sendErr } = await supabase.auth.signInWithOtp({
            email,
            options: {
              shouldCreateUser: false,
              emailRedirectTo: supabaseRedirectUrl,
            },
          });

          if (!sendErr) {
            emailTerkirim = true;
          } else {
            console.warn('[AUTH-LINK] Supabase signInWithOtp error:', sendErr.message);
            if (supabaseAdmin) {
              const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
                data: { nama, role, status: 'pending', activation_token: activationToken },
                redirectTo: supabaseRedirectUrl,
              });
              if (!invErr) {
                emailTerkirim = true;
              } else {
                console.warn('[AUTH-LINK] Supabase inviteUserByEmail error:', invErr.message);
              }
            }
          }
        } catch (sbErr) {
          console.warn('[AUTH-LINK] Exception call Supabase:', sbErr);
        }
      }

      // Catat rate limiting
      catatPengirimanOtp(email);

      // Simpan backup OTP ke memori untuk fallback jika diperlukan
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      otpCache.set(email, { otp: generatedOtp, expiresAt: Date.now() + 30 * 60 * 1000 });

      return NextResponse.json({
        sukses: true,
        pesan: `Tautan aktivasi akun berhasil dibuat untuk ${email}.`,
        linkAktivasi: directActivationLink,
        backupOtp: generatedOtp,
        email,
        nama,
        role,
        emailTerkirim,
      });
    }

    // =========================================================================
    // AKSI 2: KIRIM TAUTAN KONFIRMASI GANTI ALAMAT EMAIL
    // =========================================================================
    if (aksi === 'KIRIM_LINK_GANTI_EMAIL') {
      const sesi = ambilSesiDariRequest(request);
      if (!sesi) {
        return NextResponse.json(
          { sukses: false, pesan: 'Akses ditolak. Silakan masuk terlebih dahulu.' },
          { status: 401 }
        );
      }

      // 1. Rate Limiting: Maksimal 2x per jam
      const statusRate = periksaRateLimitOtp(email);
      if (!statusRate.diperbolehkan) {
        return NextResponse.json(
          {
            sukses: false,
            pesan: `Batas pengiriman tautan tercapai (maksimal 2 kali per jam). Silakan coba lagi dalam ${statusRate.sisaMenit} menit.`,
            rateLimited: true,
            sisaMenit: statusRate.sisaMenit,
          },
          { status: 429 }
        );
      }

      // 2. Periksa apakah email baru sudah dipakai oleh akun lain
      if (supabaseAdmin) {
        try {
          const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userList?.users?.find(
            (u) => (u.email || '').toLowerCase() === email && u.id !== sesi.userId
          );

          if (existingUser) {
            return NextResponse.json(
              {
                sukses: false,
                pesan: `Alamat email ${email} sudah digunakan oleh akun lain. Silakan pilih alamat email berbeda.`,
              },
              { status: 400 }
            );
          }
        } catch (_) {}
      }

      // Simpan token ganti email di metadata akun
      const emailChangeToken = crypto.randomBytes(24).toString('hex');
      if (supabaseAdmin && sesi.userId) {
        try {
          const { data: userObj } = await supabaseAdmin.auth.admin.getUserById(sesi.userId);
          await supabaseAdmin.auth.admin.updateUserById(sesi.userId, {
            user_metadata: {
              ...(userObj?.user?.user_metadata || {}),
              pending_new_email: email,
              email_change_token: emailChangeToken,
              email_change_expires: Date.now() + 30 * 60 * 1000,
            },
          });
        } catch (_) {}
      }

      // 3. Buat tautan konfirmasi langsung (Direct Application Link) & tautan Supabase aman
      const directConfirmLink = `${origin}/admin?mode=konfirmasi_ganti_email&email_baru=${encodeURIComponent(email)}&user_id=${encodeURIComponent(sesi.userId)}&token=${emailChangeToken}`;
      const supabaseRedirectUrl = `${origin}/admin`;

      let emailTerkirim = false;
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
          });

          const { error: sendErr } = await supabase.auth.signInWithOtp({
            email,
            options: {
              shouldCreateUser: true,
              emailRedirectTo: supabaseRedirectUrl,
              data: {
                ganti_email_target_id: sesi.userId,
                ganti_email_token: emailChangeToken,
                email_baru: email,
              },
            },
          });

          if (!sendErr) {
            emailTerkirim = true;
          }
        } catch (_) {}
      }

      catatPengirimanOtp(email);

      return NextResponse.json({
        sukses: true,
        pesan: `Tautan konfirmasi ganti email berhasil dibuat untuk ${email}.`,
        linkKonfirmasi: directConfirmLink,
        emailBaru: email,
        emailTerkirim,
      });
    }

    // =========================================================================
    // AKSI 3: KONFIRMASI GANTI EMAIL (SAAT TAUTAN DI EMAIL DIKLIK)
    // =========================================================================
    if (aksi === 'KONFIRMASI_GANTI_EMAIL') {
      const sesi = ambilSesiDariRequest(request);
      const targetUserId = sesi?.userId || body.userId || body.user_id;
      const verifyToken = (body.token || '').trim();

      if (!targetUserId) {
        return NextResponse.json(
          { sukses: false, pesan: 'Identitas sesi petugas tidak valid. Silakan masuk terlebih dahulu.' },
          { status: 401 }
        );
      }

      if (supabaseAdmin) {
        // Jika tidak ada sesi aktif, verifikasi token email_change_token
        if (!sesi) {
          const { data: userData, error: getUserErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
          if (getUserErr || !userData?.user) {
            return NextResponse.json(
              { sukses: false, pesan: 'Pengguna tidak ditemukan atau tautan tidak valid.' },
              { status: 404 }
            );
          }
          const meta = userData.user.user_metadata || {};
          if (
            !verifyToken ||
            meta.email_change_token !== verifyToken ||
            !meta.email_change_expires ||
            meta.email_change_expires < Date.now() ||
            (meta.pending_new_email || '').toLowerCase() !== email
          ) {
            return NextResponse.json(
              { sukses: false, pesan: 'Tautan konfirmasi ganti email tidak valid atau sudah kedaluwarsa (maksimal 30 menit).' },
              { status: 400 }
            );
          }
        }

        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          email,
          email_confirm: true,
          user_metadata: {
            email_change_token: null,
            email_change_expires: null,
            pending_new_email: null,
            email_diperbarui_pada: new Date().toISOString(),
          },
        });

        if (updateErr) {
          return NextResponse.json(
            { sukses: false, pesan: `Gagal memperbarui email di server: ${updateErr.message}` },
            { status: 400 }
          );
        }
      }

      return NextResponse.json({
        sukses: true,
        pesan: `Alamat email login berhasil diperbarui menjadi ${email}!`,
        emailBaru: email,
      });
    }

    // =========================================================================
    // AKSI 4: VERIFIKASI OTP (FALLBACK BACKWARDS-COMPATIBILITY)
    // =========================================================================
    if (aksi === 'VERIFIKASI_OTP') {
      let verifikasiBerhasil = false;

      if (supabaseUrl && supabaseAnonKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false },
          });

          const { data, error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'email',
          });

          if (!error && (data?.session || data?.user)) {
            verifikasiBerhasil = true;
          }
        } catch (_) {}
      }

      if (!verifikasiBerhasil) {
        const cached = otpCache.get(email);
        if (cached && cached.otp === token && cached.expiresAt > Date.now()) {
          verifikasiBerhasil = true;
          otpCache.delete(email);
        }
      }

      if (!verifikasiBerhasil) {
        return NextResponse.json(
          {
            sukses: false,
            pesan: 'Kode verifikasi tidak cocok atau telah kedaluwarsa. Silakan periksa kembali atau minta kirim ulang.',
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        sukses: true,
        pesan: 'Verifikasi berhasil!',
      });
    }

    return NextResponse.json(
      { sukses: false, pesan: 'Aksi tidak dikenali.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[AUTH-LINK] Internal Error:', err);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kegagalan server saat memproses tautan email.' },
      { status: 500 }
    );
  }
}

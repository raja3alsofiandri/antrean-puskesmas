import { NextResponse } from 'next/server';

/**
 * POST /api/auth/lupa-sandi
 * Mengirimkan tautan reset kata sandi ke email petugas melalui Supabase Auth
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { sukses: false, pesan: 'Alamat email akun petugas wajib diisi.' },
        { status: 400 }
      );
    }

    // Validasi format email sederhana
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { sukses: false, pesan: 'Format alamat email tidak valid.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { sukses: false, pesan: 'Layanan pemulihan kata sandi sedang tidak tersedia.' },
        { status: 503 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Dapatkan origin dari request header untuk redirect URL
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    const origin = request.headers.get('origin') || `${protocol}://${host}`;
    const redirectUrl = `${origin}/admin`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (resetError) {
      console.warn('[LUPA-SANDI] Supabase Auth reset error:', resetError.message);
      const msg = resetError.message?.toLowerCase().includes('rate limit')
        ? 'Terlalu banyak permintaan reset kata sandi. Silakan tunggu beberapa menit lagi.'
        : `Gagal mengirim email reset kata sandi. Pastikan email terdaftar.`;
      return NextResponse.json(
        { sukses: false, pesan: msg },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sukses: true,
      pesan: `Tautan reset kata sandi berhasil dikirim ke ${email}. Silakan periksa kotak masuk atau spam email Anda.`,
    });
  } catch (error) {
    console.error('[LUPA-SANDI] Internal error:', error);
    return NextResponse.json(
      { sukses: false, pesan: 'Terjadi kegagalan server saat memproses permintaan reset sandi.' },
      { status: 500 }
    );
  }
}

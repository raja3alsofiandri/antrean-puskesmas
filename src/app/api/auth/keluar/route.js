import { NextResponse } from 'next/server';
import { NAMA_COOKIE_SESI } from '@/lib/auth';

/**
 * POST /api/auth/keluar
 * Mengakhiri sesi aktif petugas loket dan menghapus cookie
 */
export async function POST() {
  const response = NextResponse.json({
    sukses: true,
    pesan: 'Sesi petugas berhasil diakhiri.',
  });

  response.cookies.set({
    name: NAMA_COOKIE_SESI,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}

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

  return NextResponse.json({
    terautentikasi: true,
    pengguna: {
      userId: sesi.userId,
      username: sesi.username,
      email: sesi.email || (sesi.username && sesi.username.includes('@') ? sesi.username : null),
      organisasiId: sesi.organisasiId,
      peran: sesi.peran,
      kedaluwarsaPada: sesi.exp,
    },
  });
}

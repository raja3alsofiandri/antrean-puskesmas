import { ambilSesiDariRequest } from '@/lib/auth';

/**
 * GET /api/ml/dataset?tenant_id=...&format=json
 *
 * Mengekspor dataset ML pelatihan untuk tenant tertentu.
 * Dilindungi autentikasi sesi petugas / admin.
 * Hanya mengembalikan data yang statusnya COMPLETE (sudah dipanggil).
 *
 * Response: array of dataset rows dengan kolom yang sesuai fitur model.
 */
export async function GET(request) {
  // 1. Verifikasi autentikasi sesi petugas
  const sesi = ambilSesiDariRequest(request);
  if (!sesi) {
    return NextResponse.json(
      { error: 'Autentikasi diperlukan untuk mengekspor dataset.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenant_id') || sesi.organisasiId || '00000000-0000-0000-0000-000000000001';

  // Cegah akses lintas organisasi (hanya boleh akses organisasinya sendiri)
  if (sesi.organisasiId && sesi.organisasiId !== tenantId) {
    return NextResponse.json(
      { error: 'Akses ditolak: Anda tidak memiliki izin untuk mengekspor data organisasi lain.' },
      { status: 403 }
    );
  }

  const format = searchParams.get('format') || 'json';

  // Dynamic import supabase agar bisa menggunakan env vars
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase belum dikonfigurasi' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase
      .from('ml_dataset')
      .select('antrean_id, nomor, sumber, antrean_di_depan, jam_daftar, registered_at, first_called_at, waktu_tunggu_menit, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'COMPLETE')
      .order('registered_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (format === 'csv') {
      if (!data || data.length === 0) {
        return new NextResponse('antrean_id,nomor,sumber,antrean_di_depan,jam_daftar,registered_at,first_called_at,waktu_tunggu_menit\n', {
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="ml_dataset.csv"' },
        });
      }
      const headers = Object.keys(data[0]).filter(k => k !== 'status');
      const csvRows = [headers.join(',')];
      for (const row of data) {
        csvRows.push(headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
      }
      return new NextResponse(csvRows.join('\n'), {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="ml_dataset.csv"' },
      });
    }

    return NextResponse.json({
      tenant_id: tenantId,
      count: data?.length || 0,
      schema_version: '2.0',
      columns: ['antrean_di_depan', 'jam_daftar', 'registered_at', 'first_called_at', 'waktu_tunggu_menit', 'sumber', 'nomor'],
      data: data || [],
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/ml/dataset
 *
 * Mengimpor dataset ML dari JSON.
 * Body: { tenant_id, data: [{ antrean_di_depan, jam_daftar, waktu_tunggu_menit, ... }] }
 *
 * Validasi: kolom wajib, tipe data, duplikasi berdasarkan antrean_id.
 */
export async function POST(request) {
  // 1. Verifikasi autentikasi sesi petugas
  const sesi = ambilSesiDariRequest(request);
  if (!sesi) {
    return NextResponse.json(
      { error: 'Autentikasi diperlukan untuk mengimpor dataset.' },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);

  if (!body || !body.data || !Array.isArray(body.data)) {
    return NextResponse.json({ error: 'Body harus berisi { data: [...] }' }, { status: 400 });
  }

  const tenantId = body.tenant_id || sesi.organisasiId || '00000000-0000-0000-0000-000000000001';

  // Cegah akses lintas organisasi
  if (sesi.organisasiId && sesi.organisasiId !== tenantId) {
    return NextResponse.json(
      { error: 'Akses ditolak: Anda tidak memiliki izin untuk mengimpor data ke organisasi lain.' },
      { status: 403 }
    );
  }

  const requiredCols = ['antrean_di_depan', 'jam_daftar', 'waktu_tunggu_menit'];

  // Validasi setiap row
  const errors = [];
  const validRows = [];
  for (let i = 0; i < body.data.length; i++) {
    const row = body.data[i];
    const missing = requiredCols.filter(c => row[c] === undefined || row[c] === null);
    if (missing.length > 0) {
      errors.push({ row: i, error: `Kolom wajib kosong: ${missing.join(', ')}` });
      continue;
    }
    if (typeof row.antrean_di_depan !== 'number' || typeof row.jam_daftar !== 'number' || typeof row.waktu_tunggu_menit !== 'number') {
      errors.push({ row: i, error: 'Tipe data salah: antrean_di_depan, jam_daftar, waktu_tunggu_menit harus number' });
      continue;
    }
    validRows.push({
      tenant_id: tenantId,
      antrean_id: row.antrean_id || 0,
      nomor: row.nomor || `IMP${i + 1}`,
      sumber: row.sumber || 'IMPORT',
      antrean_di_depan: row.antrean_di_depan,
      jam_daftar: row.jam_daftar,
      registered_at: row.registered_at || new Date().toISOString(),
      first_called_at: row.first_called_at || new Date().toISOString(),
      waktu_tunggu_menit: row.waktu_tunggu_menit,
      status: 'COMPLETE',
    });
  }

  if (validRows.length === 0) {
    return NextResponse.json({ error: 'Tidak ada row valid', errors }, { status: 400 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase belum dikonfigurasi' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase.from('ml_dataset').insert(validRows).select('id');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      imported: data?.length || validRows.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

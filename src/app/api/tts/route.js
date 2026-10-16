import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/tts?text=...
 *
 * Proxy ke Google Translate TTS untuk menghasilkan audio MP3
 * dengan suara manusia berbahasa Indonesia.
 *
 * Mengembalikan stream MP3 binary.
 * Jika gagal, mengembalikan JSON error 502.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text');

  if (!text || text.trim().length === 0) {
    return NextResponse.json(
      { error: 'Parameter "text" wajib diisi.' },
      { status: 400 }
    );
  }

  // Batasi panjang teks agar tidak menyalahgunakan layanan
  const cleanText = text.trim().slice(0, 500);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=id&q=${encodeURIComponent(cleanText)}`;

    const response = await fetch(googleTtsUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://translate.google.com/',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Google TTS mengembalikan status ${response.status}` },
        { status: 502 }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    if (audioBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: 'Audio kosong dari Google TTS' },
        { status: 502 }
      );
    }

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Timeout menghubungi Google TTS (8 detik)' },
        { status: 504 }
      );
    }

    console.error('[/api/tts] Error:', err.message);
    return NextResponse.json(
      { error: 'Gagal mengambil audio TTS', detail: err.message },
      { status: 502 }
    );
  }
}

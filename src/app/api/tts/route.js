import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Endpoint Text-To-Speech (TTS) Bahasa Indonesia Alami
 * Menggunakan engine Text-to-Speech Google Cloud/Translate TTS id-ID
 * Menghasilkan suara manusia asli Indonesia yang fasih, halus, dan natural.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text');

  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Text parameter is required' }, { status: 400 });
  }

  const cleanText = text.trim().slice(0, 200); // Google TTS limit per segment

  try {
    const encoded = encodeURIComponent(cleanText);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=id&total=1&idx=0&textlen=${cleanText.length}&client=tw-ob&prev=input`;

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
        Accept: '*/*',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream TTS error: ${res.status}` },
        { status: res.status }
      );
    }

    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

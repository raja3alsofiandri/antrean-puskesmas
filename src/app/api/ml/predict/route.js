import { NextResponse } from 'next/server';

/**
 * POST /api/ml/predict
 *
 * Prediksi waktu tunggu gabungan: Random Forest + Interval Estimator.
 *
 * Body: { antrean_di_depan, rata_waktu_pelayanan?, tenant_id? }
 * Response: { estimasi_menit, metode, detail }
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  const antreanDiDepan = parseInt(body.antrean_di_depan || 0, 10);
  const rataWaktu = parseFloat(body.rata_waktu_pelayanan || 7.0);
  const tenantId = body.tenant_id || '00000000-0000-0000-0000-000000000001';

  // 1. Periksa kesiapan model Random Forest (via metadata & file model)
  let rfResult = null;
  let modelSiap = false;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const metaPath = path.join(process.cwd(), 'api', 'model_metadata.json');
    const modelPklPath = path.join(process.cwd(), 'api', 'rf_antrean_model.pkl');

    if (fs.existsSync(metaPath) && fs.existsSync(modelPklPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta && meta.status !== 'RESET_BERSIH' && (meta.total_sampel || 0) > 0) {
        modelSiap = true;
      }
    }
  } catch (fsCheckErr) {
    console.warn('[/api/ml/predict] Check model metadata error:', fsCheckErr.message);
  }

  if (modelSiap) {
    try {
      let baseUrl = 'http://127.0.0.1:5328';
      if (process.env.PYTHON_API_URL) {
        baseUrl = process.env.PYTHON_API_URL;
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      }
      const rfUrl = `${baseUrl}/api/predict`;

      const now = new Date();
      const jamDaftar = Number((now.getHours() + now.getMinutes() / 60).toFixed(2));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const rfRes = await fetch(rfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ antrean_di_depan: antreanDiDepan, rata_waktu_pelayanan: rataWaktu, jam_daftar: jamDaftar }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (rfRes.ok) {
        const rfData = await rfRes.json();
        if (rfData.status === 'success' && rfData.metode !== 'smart_heuristic_fallback') {
          rfResult = { estimasiMenit: rfData.estimasi_menit, metode: rfData.metode };
        }
      }
    } catch (err) {
      console.warn('[/api/ml/predict] RF error:', err.message);
    }
  }

  // 2. Interval Estimator (dari call_log di Supabase)
  let intervalResult = null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data } = await supabase
        .from('call_log')
        .select('called_at')
        .eq('tenant_id', tenantId)
        .eq('is_first_call', true)
        .order('called_at', { ascending: false })
        .limit(11);

      if (data && data.length >= 2) {
        const sorted = data.reverse();
        const intervals = [];
        for (let i = 1; i < sorted.length; i++) {
          const diff = (new Date(sorted[i].called_at) - new Date(sorted[i - 1].called_at)) / 60000;
          if (diff > 0) intervals.push(diff);
        }

        if (intervals.length >= 2) {
          let valid = [...intervals];
          // IQR filtering jika >= 5 interval
          if (valid.length >= 5) {
            valid.sort((a, b) => a - b);
            const q1 = valid[Math.floor(valid.length * 0.25)];
            const q3 = valid[Math.floor(valid.length * 0.75)];
            const iqr = q3 - q1;
            valid = valid.filter(v => v >= Math.max(0, q1 - 1.5 * iqr) && v <= q3 + 1.5 * iqr);
          }

          if (valid.length > 0) {
            valid.sort((a, b) => a - b);
            const mid = Math.floor(valid.length / 2);
            const median = valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
            intervalResult = {
              estimasiMenit: Math.max(1, Math.round(median * antreanDiDepan)),
              median: Number(median.toFixed(1)),
              samples: valid.length,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('[/api/ml/predict] Interval error:', err.message);
  }

  // 3. Khusus ketika tidak ada antrean di depan (antreanDiDepan <= 0)
  if (antreanDiDepan <= 0) {
    return NextResponse.json({
      estimasi_menit: 0,
      metode: 'direct_next',
      detail: {
        rf: modelSiap ? { estimasiMenit: 0, metode: 'random_forest_ai' } : null,
        interval: intervalResult ? { estimasiMenit: 0, median: intervalResult.median, samples: intervalResult.samples } : null,
      },
      pesan: 'Tidak ada antrean menunggu di depan loket (langsung dilayani).',
    });
  }

  // 4. Perhitungan Gabungan untuk antrean aktif
  let estimasiMenit;
  let metode;

  const rfValid = rfResult && rfResult.estimasiMenit > 0;
  const intValid = intervalResult && intervalResult.estimasiMenit > 0;

  if (rfValid && intValid) {
    estimasiMenit = Math.round(0.5 * rfResult.estimasiMenit + 0.5 * intervalResult.estimasiMenit);
    metode = 'combined_rf_interval';
  } else if (rfValid) {
    estimasiMenit = rfResult.estimasiMenit;
    metode = 'random_forest_only';
  } else if (intValid) {
    estimasiMenit = intervalResult.estimasiMenit;
    metode = 'interval_only';
  } else {
    estimasiMenit = Math.max(1, Math.round(antreanDiDepan * rataWaktu));
    metode = 'fallback_heuristic';
  }

  estimasiMenit = Math.max(1, estimasiMenit);

  return NextResponse.json({
    estimasi_menit: estimasiMenit,
    metode,
    detail: {
      rf: rfValid ? rfResult : null,
      interval: intValid ? intervalResult : null,
    },
    pesan: `Estimasi waktu tunggu: ${estimasiMenit} menit (${metode}).`,
  });
}

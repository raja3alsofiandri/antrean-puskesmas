import os
import joblib
import pandas as pd
from datetime import datetime
from flask import Flask, jsonify, request

app = Flask(__name__)

# Base directory untuk memuat model relatif terhadap file ini
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'rf_antrean_model.pkl')

# Cache model Scikit-Learn
model = None
model_load_error = None

try:
    if os.path.exists(MODEL_PATH):
        model = joblib.load(MODEL_PATH)
        print(f"[AI MODEL] Berhasil memuat model Random Forest dari: {MODEL_PATH}")
    else:
        model_load_error = f"File model tidak ditemukan di {MODEL_PATH}"
        print(f"[AI MODEL ERROR] {model_load_error}")
except Exception as e:
    model_load_error = str(e)
    print(f"[AI MODEL ERROR] Gagal memuat model: {e}")

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

@app.route('/api/python', methods=['GET'])
def hello_world():
    meta = {}
    meta_path = os.path.join(BASE_DIR, 'model_metadata.json')
    if os.path.exists(meta_path):
        try:
            import json
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
        except Exception:
            pass

    return jsonify({
        "status": "online",
        "pesan": "Backend AI Flask Prediksi Antrean Universal Aktif!",
        "model_loaded": model is not None,
        "model_version": meta.get("versi", "v1.0.0"),
        "model_mae": meta.get("mae", None),
        "model_path": MODEL_PATH
    })

@app.route('/api/predict', methods=['POST', 'OPTIONS'])
def predict():
    if request.method == 'OPTIONS':
        return ('', 204)

    data = request.get_json(silent=True) or {}

    # Ekstraksi dan sanitasi fitur input
    try:
        antrean_di_depan = int(data.get('antrean_di_depan', 0))
    except (ValueError, TypeError):
        antrean_di_depan = 0

    try:
        rata_waktu = float(data.get('rata_waktu_pelayanan', 7.0))
    except (ValueError, TypeError):
        rata_waktu = 7.0

    # Waktu saat ini (jam desimal, cth: 09:30 -> 9.5)
    now = datetime.now()
    default_jam = round(now.hour + (now.minute / 60.0), 2)
    try:
        jam_daftar = float(data.get('jam_daftar', default_jam))
    except (ValueError, TypeError):
        jam_daftar = default_jam

    # Jika antrean di depan 0, estimasi minimal langsung diperiksa
    if antrean_di_depan <= 0:
        return jsonify({
            "status": "success",
            "estimasi_menit": 5,
            "antrean_di_depan": 0,
            "jam_daftar": jam_daftar,
            "metode": "direct_next",
            "pesan": "Anda adalah giliran berikutnya (estimasi ~5 menit)."
        })

    # Cek metadata model apakah berstatus RESET atau tidak aktif
    global model
    meta_path = os.path.join(BASE_DIR, 'model_metadata.json')
    model_bisa_dipakai = False
    if os.path.exists(meta_path) and os.path.exists(MODEL_PATH):
        try:
            import json
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            if meta.get('status') != 'RESET_BERSIH' and int(meta.get('total_sampel', 0)) > 0:
                model_bisa_dipakai = True
                if model is None:
                    model = joblib.load(MODEL_PATH)
        except Exception as reload_err:
            print(f"[MODEL RELOAD ERROR] {reload_err}")
            model_bisa_dipakai = False

    # Coba gunakan Model Random Forest Scikit-Learn jika memang aktif dan valid
    if model_bisa_dipakai and model is not None:
        try:
            # Fitur yang diharapkan: ['antrean_di_depan', 'rata_waktu_pelayanan', 'jam_daftar']
            features_df = pd.DataFrame([{
                'antrean_di_depan': antrean_di_depan,
                'rata_waktu_pelayanan': rata_waktu,
                'jam_daftar': jam_daftar
            }])

            raw_prediction = model.predict(features_df)[0]
            estimasi_menit = max(5, int(round(float(raw_prediction))))

            return jsonify({
                "status": "success",
                "estimasi_menit": estimasi_menit,
                "antrean_di_depan": antrean_di_depan,
                "jam_daftar": jam_daftar,
                "metode": "random_forest_ai",
                "pesan": f"Estimasi waktu tunggu dihitung akurat dengan AI ({estimasi_menit} menit)."
            })
        except Exception as pred_err:
            print(f"[PREDICTION ERROR] Fallback digunakan karena: {pred_err}")

    # Fallback Heuristik Cerdas (Jika model belum di-load atau di-reset)
    # Rata-rata 7 menit per orang + 4 menit buffer pelayanan
    estimasi_fallback = max(5, int(round((antrean_di_depan * rata_waktu) + 4)))
    return jsonify({
        "status": "success",
        "estimasi_menit": estimasi_fallback,
        "antrean_di_depan": antrean_di_depan,
        "jam_daftar": jam_daftar,
        "metode": "smart_heuristic_fallback",
        "pesan": f"Estimasi waktu tunggu standar adaptif: {estimasi_fallback} menit."
    })

@app.route('/api/reset', methods=['POST', 'OPTIONS'])
def reset_model():
    if request.method == 'OPTIONS':
        return ('', 204)

    global model
    model = None
    if os.path.exists(MODEL_PATH):
        try:
            os.remove(MODEL_PATH)
        except Exception as e:
            print(f"[RESET] Gagal hapus model pkl: {e}")

    meta_path = os.path.join(BASE_DIR, 'model_metadata.json')
    try:
        import json
        reset_meta = {
            "versi": "vDefault_Awal",
            "fitur": ["antrean_di_depan", "rata_waktu_pelayanan", "jam_daftar"],
            "total_sampel": 0,
            "status": "RESET_BERSIH",
            "keterangan": "Model menggunakan estimasi adaptif bawaan.",
            "waktu_reset": datetime.now().isoformat()
        }
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(reset_meta, f, indent=2)
    except Exception as e:
        print(f"[RESET] Gagal tulis metadata: {e}")

    return jsonify({
        "status": "success",
        "pesan": "Model Random Forest berhasil direset ke standar bawaan Puskesmas (0 sampel).",
        "model_loaded": False,
        "total_sampel": 0
    })

@app.route('/api/retrain', methods=['POST', 'OPTIONS'])
def retrain():
    if request.method == 'OPTIONS':
        return ('', 204)

    global model
    body = request.get_json(silent=True) or {}
    items = body.get('data', [])
    if not items or len(items) < 5:
        return jsonify({
            "status": "error",
            "pesan": "Minimal 5 data riwayat antrean valid diperlukan untuk melatih model."
        }), 400

    try:
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.metrics import mean_absolute_error
        import json

        df = pd.DataFrame(items)
        if 'antrean_di_depan' not in df.columns or 'waktu_tunggu_menit' not in df.columns:
            return jsonify({"status": "error", "pesan": "Kolom antrean_di_depan dan waktu_tunggu_menit wajib ada."}), 400

        df['antrean_di_depan'] = pd.to_numeric(df['antrean_di_depan'], errors='coerce').fillna(0).astype(int)
        df['rata_waktu_pelayanan'] = pd.to_numeric(df.get('rata_waktu_pelayanan', 7.0), errors='coerce').fillna(7.0).astype(float)
        df['jam_daftar'] = pd.to_numeric(df.get('jam_daftar', 9.0), errors='coerce').fillna(9.0).astype(float)
        df['waktu_tunggu_menit'] = pd.to_numeric(df['waktu_tunggu_menit'], errors='coerce').fillna(7.0).astype(float)

        fitur = ['antrean_di_depan', 'rata_waktu_pelayanan', 'jam_daftar']
        X = df[fitur]
        y = df['waktu_tunggu_menit']

        rf = RandomForestRegressor(n_estimators=100, max_depth=6, random_state=42)
        rf.fit(X, y)

        preds = rf.predict(X)
        mae = float(round(mean_absolute_error(y, preds), 3))

        # Update cache global
        model = rf
        joblib.dump(rf, MODEL_PATH)

        versi = f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        meta = {
            "versi": versi,
            "fitur": fitur,
            "total_sampel": len(df),
            "mae": mae,
            "waktu_pelatihan": datetime.now().isoformat(),
            "status": "AKTIF"
        }
        meta_path = os.path.join(BASE_DIR, 'model_metadata.json')
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, indent=2)

        return jsonify({
            "status": "success",
            "pesan": f"Model Random Forest berhasil diperbarui dengan {len(df)} data sampel.",
            "versi": versi,
            "mae": mae,
            "total_sampel": len(df)
        })
    except Exception as e:
        return jsonify({"status": "error", "pesan": str(e)}), 500

# Untuk Vercel Serverless Function, objek 'app' diekspor
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5328, debug=True)
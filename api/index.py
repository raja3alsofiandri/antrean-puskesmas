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
    return jsonify({
        "status": "online",
        "pesan": "Backend AI Flask Puskesmas Kuala Cenaku Aktif!",
        "model_loaded": model is not None,
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

    # Coba gunakan Model Random Forest Scikit-Learn
    if model is not None:
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

    # Fallback Heuristik Cerdas (Jika model belum di-load atau error)
    # Rata-rata 7 menit per orang + 5 menit buffer pelayanan
    estimasi_fallback = max(5, int(round((antrean_di_depan * rata_waktu) + 4)))
    return jsonify({
        "status": "success",
        "estimasi_menit": estimasi_fallback,
        "antrean_di_depan": antrean_di_depan,
        "jam_daftar": jam_daftar,
        "metode": "smart_heuristic_fallback",
        "pesan": f"Estimasi waktu tunggu adaptif: {estimasi_fallback} menit."
    })

# Untuk Vercel Serverless Function, objek 'app' diekspor
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5328, debug=True)
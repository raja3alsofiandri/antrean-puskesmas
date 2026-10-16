#!/usr/bin/env python3
"""
Skrip Pelatihan Ulang Model Random Forest Prediksi Waktu Tunggu Antrean Universal
Bahasa: Python 3
Algoritma: RandomForestRegressor (Scikit-Learn)

Aturan:
1. Hanya melatih menggunakan tiket yang statusnya 'COMPLETE' (panggilan pertama valid).
2. Data pembatalan atau tiket yang tidak pernah dipanggil dieksklusikan.
3. Pemisahan data latih dan uji berbasis urutan waktu (chronological split 80:20).
4. Evaluasi metrik MAE (Mean Absolute Error).
5. Penggantian model aktif hanya jika kandidat baru mengungguli model lama.
6. Mempertahankan model aktif jika pelatihan gagal atau evaluasi lebih buruk.
"""

import os
import sys
import argparse
import json
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_AKTIF_PATH = os.path.join(BASE_DIR, 'rf_antrean_model.pkl')
METADATA_PATH = os.path.join(BASE_DIR, 'model_metadata.json')

FITUR_WAJIB = ['antrean_di_depan', 'rata_waktu_pelayanan', 'jam_daftar']
TARGET_KOLOM = 'waktu_tunggu_menit'
MINIMAL_SAMPEL = 10

def muat_dataset(file_path):
    """Memuat dan membersihkan dataset pelatihan."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File dataset tidak ditemukan: {file_path}")

    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
        # Dukungan format ekspor laporan Puskesmas
        if 'Durasi Pelayanan (Menit)' in df.columns or 'Nomor Antrean' in df.columns:
            if 'Status' in df.columns:
                df = df[df['Status'].astype(str).str.upper() == 'SELESAI'].copy()
            if TARGET_KOLOM not in df.columns:
                if 'Waktu Tunggu (Menit)' in df.columns:
                    df[TARGET_KOLOM] = pd.to_numeric(df['Waktu Tunggu (Menit)'], errors='coerce')
                elif 'Durasi Pelayanan (Menit)' in df.columns:
                    df[TARGET_KOLOM] = pd.to_numeric(df['Durasi Pelayanan (Menit)'], errors='coerce')
            if 'antrean_di_depan' not in df.columns:
                if 'Nomor Antrean' in df.columns:
                    extracted = df['Nomor Antrean'].astype(str).str.extract(r'(\d+)')[0].fillna(1).astype(int) - 1
                    df['antrean_di_depan'] = extracted.clip(lower=0, upper=50)
                else:
                    df['antrean_di_depan'] = 0
            if 'jam_daftar' not in df.columns and 'Jam Daftar' in df.columns:
                def parse_jam_val(val):
                    try:
                        s = str(val).strip().replace('.', ':')
                        parts = s.split(':')
                        return float(parts[0]) + float(parts[1]) / 60.0
                    except:
                        return 9.0
                df['jam_daftar'] = df['Jam Daftar'].apply(parse_jam_val)
            if 'rata_waktu_pelayanan' not in df.columns:
                df['rata_waktu_pelayanan'] = 7.0
    elif file_path.endswith('.json'):
        with open(file_path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
            data_list = raw.get('data', raw) if isinstance(raw, dict) else raw
            df = pd.DataFrame(data_list)
    else:
        raise ValueError("Format file harus CSV atau JSON")

    # Filter hanya data yang statusnya COMPLETE dan waktu tunggu valid
    if 'status' in df.columns:
        df = df[df['status'] == 'COMPLETE']

    # Pastikan target valid dan positif
    df = df[pd.to_numeric(df[TARGET_KOLOM], errors='coerce') > 0].copy()
    df[TARGET_KOLOM] = df[TARGET_KOLOM].astype(float)
    # Batasi nilai ekstrem / anomali antrean lewat malam (maksimal 60 menit per pasien di loket)
    df[TARGET_KOLOM] = df[TARGET_KOLOM].clip(lower=1.0, upper=60.0)

    # Tambahkan rata_waktu_pelayanan default jika belum ada
    if 'rata_waktu_pelayanan' not in df.columns:
        df['rata_waktu_pelayanan'] = 7.0
    else:
        df['rata_waktu_pelayanan'] = df['rata_waktu_pelayanan'].fillna(7.0).astype(float).clip(lower=1.0, upper=45.0)

    df['antrean_di_depan'] = pd.to_numeric(df['antrean_di_depan'], errors='coerce').fillna(0).astype(int)
    df['jam_daftar'] = pd.to_numeric(df['jam_daftar'], errors='coerce').fillna(9.0).astype(float)

    # Urutkan berdasarkan waktu pendaftaran jika tersedia
    if 'registered_at' in df.columns:
        df['registered_at'] = pd.to_datetime(df['registered_at'], errors='coerce')
        df = df.sort_values('registered_at').reset_index(drop=True)

    return df

def latih_dan_evaluasi(df):
    """
    Melatih model kandidat dan mengevaluasi MAE dengan chronological train-test split.
    """
    total_sampel = len(df)
    if total_sampel < MINIMAL_SAMPEL:
        raise ValueError(
            f"Jumlah sampel valid ({total_sampel}) belum mencukupi batas minimal ({MINIMAL_SAMPEL}) "
            "untuk menghasilkan model yang dapat diandalkan."
        )

    # Chronological Split (80% latih, 20% uji)
    split_idx = int(total_sampel * 0.8)
    if split_idx >= total_sampel:
        split_idx = total_sampel - 1

    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]

    X_train = train_df[FITUR_WAJIB]
    y_train = train_df[TARGET_KOLOM]

    X_test = test_df[FITUR_WAJIB]
    y_test = test_df[TARGET_KOLOM]

    # Latih model kandidat
    kandidat = RandomForestRegressor(
        n_estimators=100,
        max_depth=6,
        random_state=42,
        min_samples_split=2
    )
    kandidat.fit(X_train, y_train)

    pred_kandidat = kandidat.predict(X_test)
    mae_kandidat = mean_absolute_error(y_test, pred_kandidat)

    # Evaluasi model aktif saat ini pada set uji yang sama (jika ada)
    mae_lama = None
    model_lama = None
    if os.path.exists(MODEL_AKTIF_PATH):
        try:
            model_lama = joblib.load(MODEL_AKTIF_PATH)
            pred_lama = model_lama.predict(X_test)
            mae_lama = mean_absolute_error(y_test, pred_lama)
        except Exception as e:
            print(f"[Peringatan] Gagal mengevaluasi model lama: {e}")

    return {
        "kandidat": kandidat,
        "mae_kandidat": float(round(mae_kandidat, 3)),
        "mae_lama": float(round(mae_lama, 3)) if mae_lama is not None else None,
        "total_sampel": total_sampel,
        "sampel_latih": len(train_df),
        "sampel_uji": len(test_df),
    }

def main():
    parser = argparse.ArgumentParser(description="Pelatihan Ulang Model Random Forest Antrean Universal")
    parser.add_argument('--dataset', type=str, required=True, help="Path ke file dataset CSV atau JSON")
    parser.add_argument('--paksa', action='store_true', help="Paksa simpan model tanpa membandingkan MAE")
    args = parser.parse_args()

    print(f"=== MEMULAI PELATIHAN ULANG MODEL RANDOM FOREST ===")
    print(f"Waktu Eksekusi: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"File Dataset  : {args.dataset}")

    try:
        df = muat_dataset(args.dataset)
        print(f"[Dataset] Berhasil memuat {len(df)} baris data valid berstatus COMPLETE.")

        hasil = latih_dan_evaluasi(df)
        print(f"[Evaluasi] MAE Model Kandidat : {hasil['mae_kandidat']} menit")
        if hasil['mae_lama'] is not None:
            print(f"[Evaluasi] MAE Model Lama     : {hasil['mae_lama']} menit")

        # Keputusan penggantian model aktif
        terima = False
        if args.paksa:
            terima = True
            alasan = "Dipaksa melalui flag --paksa"
        elif hasil['mae_lama'] is None:
            terima = True
            alasan = "Tidak ada model lama yang terdaftar"
        elif hasil['mae_kandidat'] <= hasil['mae_lama']:
            terima = True
            alasan = f"Model kandidat memiliki MAE lebih rendah ({hasil['mae_kandidat']} <= {hasil['mae_lama']})"
        else:
            terima = False
            alasan = f"Model lama lebih baik ({hasil['mae_lama']} < {hasil['mae_kandidat']}). Model aktif dipertahankan."

        print(f"[Keputusan] Status Penggantian: {'DITERIMA' if terima else 'DITOLAK'} ({alasan})")

        if terima:
            # Simpan model baru secara atomik (simpan ke temp file lalu rename)
            temp_path = MODEL_AKTIF_PATH + ".tmp"
            joblib.dump(hasil['kandidat'], temp_path)
            os.replace(temp_path, MODEL_AKTIF_PATH)

            versi_baru = f"v{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            metadata = {
                "versi": versi_baru,
                "fitur": FITUR_WAJIB,
                "total_sampel": hasil['total_sampel'],
                "sampel_latih": hasil['sampel_latih'],
                "sampel_uji": hasil['sampel_uji'],
                "mae": hasil['mae_kandidat'],
                "mae_sebelumnya": hasil['mae_lama'],
                "waktu_pelatihan": datetime.now().isoformat(),
                "status": "AKTIF",
            }

            with open(METADATA_PATH, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2)

            print(f"[Sukses] Model aktif berhasil diperbarui ke versi: {versi_baru}")
            print(f"[Sukses] File model tersimpan di: {MODEL_AKTIF_PATH}")
        else:
            print("[Info] Model aktif lama tetap dipertahankan tanpa perubahan.")

    except Exception as e:
        print(f"[ERROR] Pelatihan gagal: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()

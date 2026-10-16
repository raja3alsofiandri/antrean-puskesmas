#!/usr/bin/env python3
"""
Skrip Generator Dataset Dummy Historis 5 Tahun Antrean Puskesmas (2021-2025)
Project: antrean-next

Tujuan:
- Menghasilkan 50.000+ baris data sintetis antrean Puskesmas yang realistis,
  kronologis, dan konsisten dari 1 Januari 2021 sampai 31 Desember 2025.
- Memenuhi skema ekspor laporan & parser impor Machine Learning.
- Menyediakan evaluasi time-split (2021-2024 train/dev, 2025 test) dengan MAE simulasi.
- Menggunakan seed tetap (42) agar dapat direproduksi 100%.
"""

import os
import sys
import random
import json
from datetime import datetime, date, timedelta
import numpy as np
import pandas as pd

# Pastikan seed tetap untuk reproduktibilitas
RANDOM_SEED = 42
random.seed(RANDOM_SEED)
np.random.seed(RANDOM_SEED)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'data', 'dummy')
OUTPUT_CSV = os.path.join(OUTPUT_DIR, 'antrean_puskesmas_2021_2025.csv')
METADATA_JSON = os.path.join(OUTPUT_DIR, 'evaluasi_simulasi_metadata.json')

# Nama-nama depan dan belakang Indonesia untuk kombinasi nama sintetis yang realistis
NAMA_DEPAN = [
    'Ahmad', 'Budi', 'Siti', 'Dewi', 'Sri', 'Muhammad', 'Nur', 'Agus', 'Eko', 'Rini',
    'Dian', 'Tri', 'Wahyu', 'Endang', 'Hendra', 'Yuli', 'Rina', 'Iwan', 'Ratna', 'Bambang',
    'Lestari', 'Surya', 'Wati', 'Fajar', 'Rahmat', 'Indah', 'Rizky', 'Putri', 'Bayu', 'Mega',
    'Doni', 'Maya', 'Hadi', 'Fitri', 'Arief', 'Dwi', 'Novi', 'Adi', 'Kartika', 'Roni',
    'Anita', 'Teguh', 'Ayu', 'Yoga', 'Desi', 'Ilham', 'Wulandari', 'Rian', 'Tari', 'Bagus'
]

NAMA_BELAKANG = [
    'Santoso', 'Pratama', 'Kusuma', 'Lestari', 'Wijaya', 'Saputra', 'Hidayat', 'Nugroho',
    'Setiawan', 'Utami', 'Purnomo', 'Rahmawati', 'Wibowo', 'Anggraini', 'Firmansyah',
    'Handayani', 'Kurniawan', 'Astuti', 'Gunawan', 'Susanti', 'Mahendra', 'Suryani',
    'Irawan', 'Safitri', 'Subagyo', 'Purwanti', 'Cahyono', 'Wardani', 'Hartono', 'Puspita',
    'Suhendra', 'Yuliana', 'Hakim', 'Damayanti', 'Syahputra', 'Febriani', 'Permana', 'Oktaviani'
]

def format_time_str(dt):
    return dt.strftime('%H:%M:%S')

def time_to_decimal_hours(dt):
    return round(dt.hour + (dt.minute / 60.0) + (dt.second / 3600.0), 3)

def generate_patient_name(unique_id):
    depan = random.choice(NAMA_DEPAN)
    belakang = random.choice(NAMA_BELAKANG)
    return f"{depan} {belakang} (Sintetis #{unique_id:05d})"

def simulate_day_queues(current_date, daily_patient_count, global_counter_start):
    """
    Simulasikan antrean untuk satu hari kerja di Puskesmas.
    Loket buka: 07:30.
    Loket mulai memanggil: 07:40 - 07:45.
    Layanan: 2 loket paralel (Loket 1 & Loket 2) yang melayani pasien secara dinamis.
    """
    records = []
    
    # 2 loket pendaftaran di Puskesmas
    # Menyimpan waktu kapan loket bebas (tersedia untuk panggilan berikutnya)
    # Loket 1 & Loket 2 siap pada jam 07:40
    start_service_dt = datetime.combine(current_date, datetime.min.time()).replace(hour=7, minute=40, second=0)
    counter_busy_until = [start_service_dt, start_service_dt]
    
    # Simpan riwayat interval panggilan untuk estimator interval real-time
    daily_call_timestamps = []
    
    # Bangkitkan waktu pendaftaran tiap pasien
    arrival_times = []
    is_friday = (current_date.weekday() == 4)
    is_saturday = (current_date.weekday() == 5)
    
    # Jam tutup loket
    if is_friday:
        close_hour, close_min = 11, 15
    elif is_saturday:
        close_hour, close_min = 11, 30
    else:
        close_hour, close_min = 12, 0
        
    for _ in range(daily_patient_count):
        # Distribusi waktu kedatangan (pagi padat)
        p = random.random()
        if p < 0.45:
            # 07:30 - 08:45 (Rush hour pagi)
            min_offset = random.randint(0, 75)
        elif p < 0.80:
            # 08:45 - 10:15 (Jam ramai kedua)
            min_offset = 75 + random.randint(0, 90)
        elif p < 0.95:
            # 10:15 - 11:15 (Jam melandai)
            min_offset = 165 + random.randint(0, 60)
        else:
            # Menjelang tutup
            max_extra = max(5, int((close_hour * 60 + close_min) - (7 * 60 + 30 + 225)))
            min_offset = 225 + random.randint(0, max_extra)
            
        reg_dt = datetime.combine(current_date, datetime.min.time()).replace(hour=7, minute=30, second=0)
        reg_dt += timedelta(minutes=min_offset, seconds=random.randint(0, 59))
        arrival_times.append(reg_dt)
        
    # Urutkan berdasarkan waktu pendaftaran
    arrival_times.sort()
    
    # Pelacakan status pelayanan untuk menghitung antrean_di_depan riil saat daftar
    service_events = [] # (called_dt, finished_dt)
    
    for idx, reg_dt in enumerate(arrival_times):
        nomor_antrean = f"A{idx + 1:02d}"
        unique_no = global_counter_start + idx
        nama_pengunjung = generate_patient_name(unique_no)
        
        # Tentukan sumber (30% Online, 70% Loket)
        sumber = "ONLINE" if random.random() < 0.30 else "LOKET"
        
        # Hitung jumlah antrean di depan yang BELUM dipanggil saat pasien ini mendaftar
        antrean_di_depan = sum(1 for (c_dt, f_dt, st) in service_events if c_dt > reg_dt and st != 'DIBATALKAN')
        
        # Tentukan status tiket
        # 93% SELESAI, 4% TERLAMBAT (tetap dilayani setelah panggilan ulang), 3% DIBATALKAN (batal sebelum dipanggil)
        status_prob = random.random()
        if status_prob < 0.03:
            status = "DIBATALKAN"
        elif status_prob < 0.07:
            status = "TERLAMBAT"
        else:
            status = "SELESAI"
            
        jam_daftar_str = format_time_str(reg_dt)
        jam_daftar_dec = time_to_decimal_hours(reg_dt)
        
        # Prediksi RF simulasi berdasarkan fitur
        # Formula model RF: durasi estimasi ~ max(5, round(antrean_di_depan * 6.5 + 4.5 + noise))
        noise_rf = random.gauss(0, 1.2)
        pred_rf = max(5, int(round((antrean_di_depan * 6.8) + 4.0 + noise_rf))) if antrean_di_depan > 0 else 5
        
        # Prediksi Interval simulasi (median interval panggilan sebelumnya * antrean_di_depan)
        if len(daily_call_timestamps) >= 2 and antrean_di_depan > 0:
            diffs = [(daily_call_timestamps[k] - daily_call_timestamps[k-1]).total_seconds() / 60.0 
                     for k in range(1, len(daily_call_timestamps))]
            diffs = [d for d in diffs if 1.0 <= d <= 25.0] # IQR filter
            median_int = float(np.median(diffs)) if diffs else 6.5
            pred_int = max(3, int(round(median_int * antrean_di_depan)))
        else:
            median_int = 6.5
            pred_int = max(5, int(round(6.5 * antrean_di_depan))) if antrean_di_depan > 0 else 5
            
        pred_gabungan = int(round((pred_rf + pred_int) / 2.0))
        
        if status == "DIBATALKAN":
            # Pasien batal sebelum dipanggil
            service_events.append((reg_dt, reg_dt, 'DIBATALKAN'))
            records.append({
                'No': unique_no,
                'Nomor Antrean': nomor_antrean,
                'Nama Pengunjung': nama_pengunjung,
                'Tanggal': current_date.strftime('%Y-%m-%d'),
                'Jam Daftar': jam_daftar_str,
                'Jam Panggil': '-',
                'Jam Selesai': '-',
                'Antrean Di Depan': antrean_di_depan,
                'Waktu Tunggu (Menit)': '',
                'Durasi Pelayanan (Menit)': '',
                'Sumber': sumber,
                'Status': status,
                'Prediksi RF (Menit)': pred_rf,
                'Prediksi Interval (Menit)': pred_int,
                'Prediksi Gabungan (Menit)': pred_gabungan,
                'Catatan Data': 'DATA SINTETIS PUSKESMAS 2021-2025',
                'is_synthetic': 'TRUE'
            })
            continue
            
        # Untuk SELESAI dan TERLAMBAT: Pasien dipanggil oleh loket yang pertama tersedia
        # Cari loket yang tercepat bebas
        counter_idx = 0 if counter_busy_until[0] <= counter_busy_until[1] else 1
        earliest_counter_available = counter_busy_until[counter_idx]
        
        # Waktu panggilan tidak boleh sebelum pasien mendaftar dan tidak boleh sebelum loket selesai
        call_dt = max(reg_dt, earliest_counter_available)
        
        # Buffer jeda pemanggilan loket (10 - 45 detik jeda panggilan audio TTS)
        call_dt += timedelta(seconds=random.randint(10, 45))
        
        if status == "TERLAMBAT":
            # Pasien terlambat datang ke loket saat pertama dipanggil, ada delay panggilan ulang 3-8 menit
            call_dt += timedelta(minutes=random.randint(3, 8))
            
        # Durasi pelayanan: distribusi gamma/lognormal realistis (rata-rata 6.5 menit, rentang 3 - 15 menit)
        # 70% pasien kontrol rutin (4 - 7 menit), 20% pasien lansia/anak (7 - 11 menit), 10% pasien baru/rujukan (10 - 15 menit)
        r_type = random.random()
        if r_type < 0.70:
            durasi_menit = round(random.uniform(4.0, 7.5), 1)
        elif r_type < 0.90:
            durasi_menit = round(random.uniform(7.5, 11.5), 1)
        else:
            durasi_menit = round(random.uniform(11.5, 15.0), 1)
            
        finish_dt = call_dt + timedelta(minutes=durasi_menit)
        
        # Update kapan loket tersebut sibuk
        counter_busy_until[counter_idx] = finish_dt
        
        # Waktu tunggu aktual dari jam daftar sampai jam panggil
        waktu_tunggu_menit = round((call_dt - reg_dt).total_seconds() / 60.0, 1)
        
        daily_call_timestamps.append(call_dt)
        service_events.append((call_dt, finish_dt, status))
        
        records.append({
            'No': unique_no,
            'Nomor Antrean': nomor_antrean,
            'Nama Pengunjung': nama_pengunjung,
            'Tanggal': current_date.strftime('%Y-%m-%d'),
            'Jam Daftar': jam_daftar_str,
            'Jam Panggil': format_time_str(call_dt),
            'Jam Selesai': format_time_str(finish_dt),
            'Antrean Di Depan': antrean_di_depan,
            'Waktu Tunggu (Menit)': waktu_tunggu_menit,
            'Durasi Pelayanan (Menit)': durasi_menit,
            'Sumber': sumber,
            'Status': status,
            'Prediksi RF (Menit)': pred_rf,
            'Prediksi Interval (Menit)': pred_int,
            'Prediksi Gabungan (Menit)': pred_gabungan,
            'Catatan Data': 'DATA SINTETIS PUSKESMAS 2021-2025',
            'is_synthetic': 'TRUE'
        })
        
    return records

def generate_5year_dataset():
    """
    Menghasilkan dataset historis 5 tahun dari 2021-01-01 s.d. 2025-12-31.
    """
    start_date = date(2021, 1, 1)
    end_date = date(2025, 12, 31)
    
    current_date = start_date
    all_records = []
    global_counter = 1
    
    print(f"[*] Memulai pembuatan dataset sintetis: {start_date} s.d. {end_date}...")
    
    total_days = (end_date - start_date).days + 1
    processed_days = 0
    operating_days = 0
    
    while current_date <= end_date:
        processed_days += 1
        weekday = current_date.weekday() # 0 = Senin, ..., 5 = Sabtu, 6 = Minggu
        
        # Hari Minggu Puskesmas tutup (loket antrean rawat jalan libur)
        if weekday == 6:
            current_date += timedelta(days=1)
            continue
            
        operating_days += 1
        year = current_date.year
        month = current_date.month
        
        # Pola volume harian:
        # Senin paling ramai, Selasa-Kamis sedang, Jumat pendek, Sabtu setengah hari
        if weekday == 0:
            base_count = random.randint(46, 70)
        elif weekday in (1, 2, 3):
            base_count = random.randint(34, 52)
        elif weekday == 4:
            base_count = random.randint(28, 44)
        else: # Sabtu
            base_count = random.randint(20, 36)
            
        # Penyesuaian tahun & musiman (misal awal tahun musim hujan/DBD ada peningkatan)
        if month in (1, 2):
            base_count = int(base_count * 1.10)
        elif month in (4, 5): # Periode libur hari raya
            base_count = int(base_count * 0.92)
            
        # Tren tahunan pasca 2021:
        if year == 2021:
            # Pandemi 2021, fluktuasi
            base_count = int(base_count * 0.90)
        elif year == 2025:
            # Peningkatan integrasi digital/antrean online
            base_count = int(base_count * 1.08)
            
        day_records = simulate_day_queues(current_date, base_count, global_counter)
        global_counter += len(day_records)
        all_records.extend(day_records)
        
        current_date += timedelta(days=1)
        
    print(f"[*] Selesai simulasi {operating_days} hari operasional.")
    print(f"[*] Total record yang dihasilkan: {len(all_records):,} baris.")
    
    df = pd.DataFrame(all_records)
    
    # Pastikan direktori tujuan tersedia
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False, encoding='utf-8')
    print(f"[+] Dataset tersimpan di: {OUTPUT_CSV}")
    print(f"[+] Ukuran file: {os.path.getsize(OUTPUT_CSV) / (1024 * 1024):.2f} MB")
    
    return df

def validate_and_evaluate(df):
    """
    Validasi integritas data & lakukan evaluasi model simulasi (2021-2024 train, 2025 test).
    """
    print("\n=== VALIDASI INTEGRITAS DATASET DUMMY ===")
    total_rows = len(df)
    assert total_rows >= 50000, f"Error: Target 50.000 baris belum tercapai ({total_rows})"
    print(f"[✓] Jumlah baris mencukupi: {total_rows:,} baris (target >= 50.000)")
    
    min_date = df['Tanggal'].min()
    max_date = df['Tanggal'].max()
    print(f"[✓] Rentang tanggal: {min_date} s.d. {max_date}")
    assert min_date == '2021-01-01' or min_date == '2021-01-02', f"Tanggal awal salah: {min_date}"
    assert max_date == '2025-12-31', f"Tanggal akhir salah: {max_date}"
    
    # Periksa kronologi untuk status SELESAI
    selesai_df = df[df['Status'] == 'SELESAI'].copy()
    print(f"[✓] Jumlah tiket SELESAI: {len(selesai_df):,} ({len(selesai_df)/total_rows*100:.1f}%)")
    
    # Validasi kronologis jam daftar <= jam panggil <= jam selesai
    kronologi_error = 0
    for _, row in selesai_df.iterrows():
        t_reg = datetime.strptime(row['Jam Daftar'], '%H:%M:%S')
        t_call = datetime.strptime(row['Jam Panggil'], '%H:%M:%S')
        t_fin = datetime.strptime(row['Jam Selesai'], '%H:%M:%S')
        if not (t_reg <= t_call <= t_fin):
            kronologi_error += 1
            
    assert kronologi_error == 0, f"Error: Ada {kronologi_error} baris dengan kronologi tidak konsisten!"
    print(f"[✓] Kronologi waktu daftar <= panggil <= selesai 100% konsisten (0 anomali)")
    
    # Distribusi status
    status_counts = df['Status'].value_counts().to_dict()
    print(f"[✓] Distribusi status antrean:")
    for st, count in status_counts.items():
        print(f"    - {st}: {count:,} ({count/total_rows*100:.2f}%)")
        
    # Distribusi sumber
    sumber_counts = df['Sumber'].value_counts().to_dict()
    print(f"[✓] Distribusi sumber antrean:")
    for sm, count in sumber_counts.items():
        print(f"    - {sm}: {count:,} ({count/total_rows*100:.2f}%)")

    # Evaluasi MAE Simulasi (Time-Split: 2021-2024 train, 2025 test)
    print("\n=== EVALUASI SIMULASI MACHINE LEARNING (CHRONOLOGICAL TIME-SPLIT) ===")
    print("Pembagian data: 2021 s.d. 2024 = Train/Dev | 2025 = Test")
    
    # Hanya gunakan data SELESAI dengan waktu tunggu valid
    clean_df = selesai_df.copy()
    clean_df['Waktu Tunggu (Menit)'] = pd.to_numeric(clean_df['Waktu Tunggu (Menit)'], errors='coerce')
    clean_df['Antrean Di Depan'] = pd.to_numeric(clean_df['Antrean Di Depan'], errors='coerce').fillna(0).astype(int)
    clean_df['Durasi Pelayanan (Menit)'] = pd.to_numeric(clean_df['Durasi Pelayanan (Menit)'], errors='coerce')
    
    # Ekstraksi jam desimal untuk fitur RF
    def parse_jam(j_str):
        parts = j_str.split(':')
        return round(int(parts[0]) + int(parts[1])/60.0 + int(parts[2])/3600.0, 3)
    clean_df['jam_daftar_dec'] = clean_df['Jam Daftar'].apply(parse_jam)
    
    train_mask = clean_df['Tanggal'] < '2025-01-01'
    test_mask = clean_df['Tanggal'] >= '2025-01-01'
    
    train_data = clean_df[train_mask]
    test_data = clean_df[test_mask]
    
    print(f"Data latih (2021-2024): {len(train_data):,} baris")
    print(f"Data uji   (2025)     : {len(test_data):,} baris")
    
    # Latih model RF Scikit-Learn pada data latih
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    
    features = ['antrean_di_depan', 'rata_waktu_pelayanan', 'jam_daftar']
    
    X_train = pd.DataFrame({
        'antrean_di_depan': train_data['Antrean Di Depan'],
        'rata_waktu_pelayanan': 7.0,
        'jam_daftar': train_data['jam_daftar_dec']
    })
    y_train = train_data['Waktu Tunggu (Menit)']
    
    X_test = pd.DataFrame({
        'antrean_di_depan': test_data['Antrean Di Depan'],
        'rata_waktu_pelayanan': 7.0,
        'jam_daftar': test_data['jam_daftar_dec']
    })
    y_test = test_data['Waktu Tunggu (Menit)']
    
    rf_model = RandomForestRegressor(n_estimators=100, max_depth=6, random_state=RANDOM_SEED)
    rf_model.fit(X_train, y_train)
    
    preds_rf_test = rf_model.predict(X_test)
    preds_int_test = test_data['Prediksi Interval (Menit)'].astype(float).values
    preds_gabungan_test = np.round((preds_rf_test + preds_int_test) / 2.0)
    
    mae_rf = float(round(mean_absolute_error(y_test, preds_rf_test), 2))
    mae_interval = float(round(mean_absolute_error(y_test, preds_int_test), 2))
    mae_gabungan = float(round(mean_absolute_error(y_test, preds_gabungan_test), 2))
    
    rmse_gabungan = float(round(np.sqrt(mean_squared_error(y_test, preds_gabungan_test)), 2))
    
    print(f"\n[HASIL EVALUASI SIMULASI PADA DATA UJI 2025]:")
    print(f"1. MAE Random Forest       : {mae_rf} menit")
    print(f"2. MAE Interval Estimator  : {mae_interval} menit")
    print(f"3. MAE Gabungan (Ensemble) : {mae_gabungan} menit (RMSE: {rmse_gabungan} menit)")
    print("Catatan: Angka di atas merupakan evaluasi simulasi pada dataset dummy terstandardisasi.")
    
    # Simpan metadata evaluasi
    metadata = {
        "status": "VALID_SIMULATION",
        "file_dataset": OUTPUT_CSV,
        "total_baris": total_rows,
        "rentang_tanggal": f"{min_date} s.d. {max_date}",
        "tahun_cakupan": [2021, 2022, 2023, 2024, 2025],
        "total_tiket_selesai": len(selesai_df),
        "split": {
            "train_period": "2021-01-01 s.d. 2024-12-31",
            "train_samples": len(train_data),
            "test_period": "2025-01-01 s.d. 2025-12-31",
            "test_samples": len(test_data),
        },
        "evaluasi_simulasi_mae": {
            "random_forest": mae_rf,
            "interval_estimator": mae_interval,
            "gabungan_ensemble": mae_gabungan,
            "rmse_gabungan": rmse_gabungan,
            "label": "EVALUASI_SIMULASI (Bukan data pasien nyata)"
        },
        "statistik_deskriptif": {
            "rata_rata_waktu_tunggu_menit": round(clean_df['Waktu Tunggu (Menit)'].mean(), 2),
            "median_waktu_tunggu_menit": round(clean_df['Waktu Tunggu (Menit)'].median(), 2),
            "rata_rata_durasi_pelayanan_menit": round(clean_df['Durasi Pelayanan (Menit)'].mean(), 2),
            "distribusi_status": status_counts,
            "distribusi_sumber": sumber_counts
        },
        "waktu_generate": datetime.now().isoformat()
    }
    
    with open(METADATA_JSON, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    print(f"[✓] Metadata evaluasi simulasi tersimpan di: {METADATA_JSON}")
    
    return metadata

if __name__ == '__main__':
    df = generate_5year_dataset()
    meta = validate_and_evaluate(df)
    print("\n[✓] SELURUH PROSES PEMBUATAN & VALIDASI SELESAI DENGAN SUKSES!")

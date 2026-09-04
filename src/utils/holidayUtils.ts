/**
 * Indonesian Public Holidays & Weekend Checker Utility
 * Digunakan untuk validasi tanggal transaksi voucher kas & pengeluaran HO/lapangan.
 * Mencegah penginputan transaksi pada hari libur nasional, tanggal merah, cuti bersama,
 * serta akhir pekan (Sabtu & Minggu).
 */

export interface HolidayCheckResult {
  isHolidayOrWeekend: boolean;
  isWeekend: boolean;
  isNationalHoliday: boolean;
  dayName: string;
  formattedDateIndonesian: string;
  reason: string | null;
  suggestedNextWorkday: string; // YYYY-MM-DD
  suggestedPrevWorkday: string; // YYYY-MM-DD
}

// Hari Libur Nasional Tahunan Tetap (Bulan-Tanggal: MM-DD)
export const FIXED_ANNUAL_HOLIDAYS: Record<string, string> = {
  "01-01": "Tahun Baru Masehi",
  "05-01": "Hari Buruh Internasional",
  "06-01": "Hari Lahir Pancasila",
  "08-17": "Hari Kemerdekaan Republik Indonesia",
  "12-25": "Hari Raya Natal",
};

// Database Hari Libur Nasional & Cuti Bersama Resmi Indonesia (Multi-Tahun)
export const NATIONAL_HOLIDAYS_INDONESIA: Record<string, string> = {
  // 2024
  "2024-01-01": "Tahun Baru 2024 Masehi",
  "2024-02-08": "Isra Mikraj Nabi Muhammad SAW",
  "2024-02-09": "Cuti Bersama Tahun Baru Imlek 2575",
  "2024-02-10": "Tahun Baru Imlek 2575 Kongzili",
  "2024-03-11": "Hari Suci Nyepi Tahun Baru Saka 1946",
  "2024-03-12": "Cuti Bersama Hari Suci Nyepi",
  "2024-03-29": "Wafat Yesus Kristus",
  "2024-03-31": "Hari Paskah",
  "2024-04-08": "Cuti Bersama Hari Raya Idul Fitri 1445 H",
  "2024-04-09": "Cuti Bersama Hari Raya Idul Fitri 1445 H",
  "2024-04-10": "Hari Raya Idul Fitri 1445 Hijriah",
  "2024-04-11": "Hari Raya Idul Fitri 1445 Hijriah",
  "2024-04-12": "Cuti Bersama Hari Raya Idul Fitri 1445 H",
  "2024-04-15": "Cuti Bersama Hari Raya Idul Fitri 1445 H",
  "2024-05-01": "Hari Buruh Internasional",
  "2024-05-09": "Kenaikan Yesus Kristus",
  "2024-05-10": "Cuti Bersama Kenaikan Yesus Kristus",
  "2024-05-23": "Hari Raya Waisak 2568 BE",
  "2024-05-24": "Cuti Bersama Hari Raya Waisak",
  "2024-06-01": "Hari Lahir Pancasila",
  "2024-06-17": "Hari Raya Idul Adha 1445 Hijriah",
  "2024-06-18": "Cuti Bersama Hari Raya Idul Adha",
  "2024-07-07": "Tahun Baru Islam 1446 Hijriah",
  "2024-08-17": "Hari Kemerdekaan RI Ke-79",
  "2024-09-16": "Maulid Nabi Muhammad SAW",
  "2024-12-25": "Hari Raya Natal",
  "2024-12-26": "Cuti Bersama Hari Raya Natal",

  // 2025
  "2025-01-01": "Tahun Baru 2025 Masehi",
  "2025-01-27": "Isra Mikraj Nabi Muhammad SAW",
  "2025-01-28": "Cuti Bersama Tahun Baru Imlek 2576",
  "2025-01-29": "Tahun Baru Imlek 2576 Kongzili",
  "2025-03-28": "Cuti Bersama Hari Suci Nyepi",
  "2025-03-29": "Hari Suci Nyepi Tahun Baru Saka 1947",
  "2025-03-31": "Hari Raya Idul Fitri 1446 Hijriah",
  "2025-04-01": "Hari Raya Idul Fitri 1446 Hijriah",
  "2025-04-02": "Cuti Bersama Hari Raya Idul Fitri 1446 H",
  "2025-04-03": "Cuti Bersama Hari Raya Idul Fitri 1446 H",
  "2025-04-04": "Cuti Bersama Hari Raya Idul Fitri 1446 H",
  "2025-04-07": "Cuti Bersama Hari Raya Idul Fitri 1446 H",
  "2025-04-18": "Wafat Yesus Kristus",
  "2025-04-20": "Kebangkitan Yesus Kristus (Paskah)",
  "2025-05-01": "Hari Buruh Internasional",
  "2025-05-12": "Hari Raya Waisak 2569 BE",
  "2025-05-13": "Cuti Bersama Hari Raya Waisak",
  "2025-05-29": "Kenaikan Yesus Kristus",
  "2025-05-30": "Cuti Bersama Kenaikan Yesus Kristus",
  "2025-06-01": "Hari Lahir Pancasila",
  "2025-06-06": "Hari Raya Idul Adha 1446 Hijriah",
  "2025-06-09": "Cuti Bersama Hari Raya Idul Adha",
  "2025-06-27": "Tahun Baru Islam 1447 Hijriah",
  "2025-08-17": "Hari Kemerdekaan RI Ke-80",
  "2025-09-05": "Maulid Nabi Muhammad SAW",
  "2025-12-25": "Hari Raya Natal",
  "2025-12-26": "Cuti Bersama Hari Raya Natal",

  // 2026
  "2026-01-01": "Tahun Baru 2026 Masehi",
  "2026-01-29": "Tahun Baru Imlek 2577 Kongzili",
  "2026-01-30": "Cuti Bersama Tahun Baru Imlek 2577",
  "2026-02-15": "Isra Mikraj Nabi Muhammad SAW",
  "2026-03-11": "Hari Suci Nyepi Tahun Baru Saka 1948",
  "2026-03-12": "Cuti Bersama Hari Suci Nyepi",
  "2026-03-19": "Cuti Bersama Hari Raya Idul Fitri 1447 H",
  "2026-03-20": "Hari Raya Idul Fitri 1447 Hijriah",
  "2026-03-21": "Hari Raya Idul Fitri 1447 Hijriah",
  "2026-03-22": "Hari Raya Idul Fitri 1447 Hijriah",
  "2026-03-23": "Cuti Bersama Hari Raya Idul Fitri 1447 H",
  "2026-03-24": "Cuti Bersama Hari Raya Idul Fitri 1447 H",
  "2026-04-03": "Wafat Yesus Kristus (Jumat Agung)",
  "2026-04-05": "Hari Paskah",
  "2026-05-01": "Hari Buruh Internasional",
  "2026-05-14": "Kenaikan Yesus Kristus",
  "2026-05-15": "Cuti Bersama Kenaikan Yesus Kristus",
  "2026-05-27": "Hari Raya Waisak 2570 BE",
  "2026-05-28": "Hari Raya Idul Adha 1447 Hijriah",
  "2026-05-29": "Cuti Bersama Hari Raya Idul Adha",
  "2026-06-01": "Hari Lahir Pancasila",
  "2026-06-16": "Tahun Baru Islam 1448 Hijriah",
  "2026-08-17": "Hari Kemerdekaan RI Ke-81",
  "2026-08-25": "Maulid Nabi Muhammad SAW",
  "2026-12-25": "Hari Raya Natal",
  "2026-12-26": "Cuti Bersama Hari Raya Natal",

  // 2027
  "2027-01-01": "Tahun Baru 2027 Masehi",
  "2027-02-06": "Isra Mikraj Nabi Muhammad SAW",
  "2027-02-17": "Tahun Baru Imlek 2578 Kongzili",
  "2027-03-11": "Hari Suci Nyepi Tahun Baru Saka 1949",
  "2027-03-26": "Wafat Yesus Kristus",
  "2027-03-28": "Kenaikan Yesus Kristus",
  "2027-04-08": "Cuti Bersama Hari Raya Idul Fitri 1448 H",
  "2027-04-09": "Hari Raya Idul Fitri 1448 Hijriah",
  "2027-04-10": "Hari Raya Idul Fitri 1448 Hijriah",
  "2027-04-12": "Cuti Bersama Hari Raya Idul Fitri 1448 H",
  "2027-05-01": "Hari Buruh Internasional",
  "2027-05-20": "Hari Raya Waisak 2571 BE",
  "2027-05-27": "Kenaikan Yesus Kristus",
  "2027-06-01": "Hari Lahir Pancasila",
  "2027-06-16": "Hari Raya Idul Adha 1448 Hijriah",
  "2027-07-06": "Tahun Baru Islam 1449 Hijriah",
  "2027-08-17": "Hari Kemerdekaan RI Ke-82",
  "2027-09-15": "Maulid Nabi Muhammad SAW",
  "2027-12-25": "Hari Raya Natal",
  "2027-12-26": "Cuti Bersama Hari Raya Natal",

  // 2028
  "2028-01-01": "Tahun Baru 2028 Masehi",
  "2028-01-26": "Tahun Baru Imlek 2579 Kongzili",
  "2028-02-23": "Isra Mikraj Nabi Muhammad SAW",
  "2028-02-28": "Hari Raya Idul Fitri 1449 Hijriah",
  "2028-02-29": "Hari Raya Idul Fitri 1449 Hijriah",
  "2028-03-17": "Hari Suci Nyepi Tahun Baru Saka 1950",
  "2028-04-14": "Wafat Yesus Kristus",
  "2028-05-01": "Hari Buruh Internasional",
  "2028-05-09": "Hari Raya Waisak 2572 BE",
  "2028-05-25": "Kenaikan Yesus Kristus",
  "2028-06-01": "Hari Lahir Pancasila",
  "2028-06-05": "Hari Raya Idul Adha 1449 Hijriah",
  "2028-06-25": "Tahun Baru Islam 1450 Hijriah",
  "2028-08-17": "Hari Kemerdekaan RI Ke-83",
  "2028-09-03": "Maulid Nabi Muhammad SAW",
  "2028-12-25": "Hari Raya Natal",

  // 2029
  "2029-01-01": "Tahun Baru 2029 Masehi",
  "2029-02-13": "Tahun Baru Imlek 2580 Kongzili",
  "2029-02-16": "Hari Raya Idul Fitri 1450 Hijriah",
  "2029-02-17": "Hari Raya Idul Fitri 1450 Hijriah",
  "2029-03-15": "Hari Suci Nyepi Tahun Baru Saka 1951",
  "2029-03-30": "Wafat Yesus Kristus",
  "2029-05-01": "Hari Buruh Internasional",
  "2029-05-10": "Kenaikan Yesus Kristus",
  "2029-05-25": "Hari Raya Idul Adha 1450 Hijriah",
  "2029-05-27": "Hari Raya Waisak 2573 BE",
  "2029-06-01": "Hari Lahir Pancasila",
  "2029-06-14": "Tahun Baru Islam 1451 Hijriah",
  "2029-08-17": "Hari Kemerdekaan RI Ke-84",
  "2029-08-23": "Maulid Nabi Muhammad SAW",
  "2029-12-25": "Hari Raya Natal",

  // 2030
  "2030-01-01": "Tahun Baru 2030 Masehi",
  "2030-02-02": "Tahun Baru Imlek 2581 Kongzili",
  "2030-02-05": "Hari Raya Idul Fitri 1451 Hijriah",
  "2030-02-06": "Hari Raya Idul Fitri 1451 Hijriah",
  "2030-03-05": "Hari Suci Nyepi Tahun Baru Saka 1952",
  "2030-04-19": "Wafat Yesus Kristus",
  "2030-05-01": "Hari Buruh Internasional",
  "2030-05-30": "Kenaikan Yesus Kristus",
  "2030-06-01": "Hari Lahir Pancasila",
  "2030-08-17": "Hari Kemerdekaan RI Ke-85",
  "2030-12-25": "Hari Raya Natal",
};

const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Format string tanggal YYYY-MM-DD ke "Hari, DD Bulan YYYY"
 */
export function formatDateWithDayIndonesian(dateYMD: string): string {
  if (!dateYMD) return '';
  const parts = dateYMD.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return dateYMD;
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(d.getTime())) return dateYMD;
  const dayName = INDONESIAN_DAYS[d.getDay()];
  const dayNum = parts[2];
  const monthName = INDONESIAN_MONTHS[parts[1] - 1] || '';
  const yearNum = parts[0];
  return `${dayName}, ${dayNum} ${monthName} ${yearNum}`;
}

/**
 * Helper untuk konversi objek Date lokal ke YYYY-MM-DD string
 */
export function dateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Cek apakah sebuah tanggal tertentu adalah hari libur (Sabtu, Minggu, atau Tanggal Merah Nasional)
 */
export function checkIsHolidayOrWeekend(dateYMD: string): HolidayCheckResult {
  if (!dateYMD) {
    return {
      isHolidayOrWeekend: false,
      isWeekend: false,
      isNationalHoliday: false,
      dayName: '',
      formattedDateIndonesian: '',
      reason: null,
      suggestedNextWorkday: '',
      suggestedPrevWorkday: ''
    };
  }

  const parts = dateYMD.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return {
      isHolidayOrWeekend: false,
      isWeekend: false,
      isNationalHoliday: false,
      dayName: '',
      formattedDateIndonesian: dateYMD,
      reason: null,
      suggestedNextWorkday: '',
      suggestedPrevWorkday: ''
    };
  }

  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayIndex = d.getDay();
  const dayName = INDONESIAN_DAYS[dayIndex] || '';
  const formattedDate = formatDateWithDayIndonesian(dateYMD);

  const isSunday = dayIndex === 0;
  const isSaturday = dayIndex === 6;
  const isWeekend = isSunday || isSaturday;

  let isNationalHoliday = false;
  let holidayName: string | null = null;

  // 1. Cek tanggal spesifik di daftar libur nasional
  if (NATIONAL_HOLIDAYS_INDONESIA[dateYMD]) {
    isNationalHoliday = true;
    holidayName = NATIONAL_HOLIDAYS_INDONESIA[dateYMD];
  } else {
    // 2. Cek libur berulang tahunan (MM-DD)
    const mmdd = `${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
    if (FIXED_ANNUAL_HOLIDAYS[mmdd]) {
      isNationalHoliday = true;
      holidayName = FIXED_ANNUAL_HOLIDAYS[mmdd];
    }
  }

  let reason: string | null = null;
  if (isNationalHoliday && isWeekend) {
    reason = `${dayName} & Hari Libur Nasional (${holidayName})`;
  } else if (isNationalHoliday) {
    reason = `Hari Libur Nasional (${holidayName})`;
  } else if (isSunday) {
    reason = `Hari Minggu (Akhir Pekan)`;
  } else if (isSaturday) {
    reason = `Hari Sabtu (Akhir Pekan)`;
  }

  const isHolidayOrWeekend = isWeekend || isNationalHoliday;

  // Hitung rekomendasi hari kerja terdekat
  const suggestedNextWorkday = getNextWorkday(dateYMD);
  const suggestedPrevWorkday = getPreviousWorkday(dateYMD);

  return {
    isHolidayOrWeekend,
    isWeekend,
    isNationalHoliday,
    dayName,
    formattedDateIndonesian: formattedDate,
    reason,
    suggestedNextWorkday,
    suggestedPrevWorkday
  };
}

/**
 * Mencari hari kerja berikutnya (bukan Sabtu, Minggu, atau Tanggal Merah)
 */
export function getNextWorkday(startDateYMD: string): string {
  const parts = startDateYMD.split('-').map(Number);
  if (parts.length !== 3) return startDateYMD;
  
  let current = new Date(parts[0], parts[1] - 1, parts[2]);
  // Cek hingga 14 hari ke depan
  for (let i = 1; i <= 14; i++) {
    current.setDate(current.getDate() + 1);
    const ymd = dateToYMD(current);
    const day = current.getDay();
    const isWk = day === 0 || day === 6;
    const isNat = Boolean(NATIONAL_HOLIDAYS_INDONESIA[ymd] || FIXED_ANNUAL_HOLIDAYS[ymd.slice(5)]);
    if (!isWk && !isNat) {
      return ymd;
    }
  }
  return startDateYMD;
}

/**
 * Mencari hari kerja sebelumnya (bukan Sabtu, Minggu, atau Tanggal Merah)
 */
export function getPreviousWorkday(startDateYMD: string): string {
  const parts = startDateYMD.split('-').map(Number);
  if (parts.length !== 3) return startDateYMD;
  
  let current = new Date(parts[0], parts[1] - 1, parts[2]);
  // Cek hingga 14 hari ke belakang
  for (let i = 1; i <= 14; i++) {
    current.setDate(current.getDate() - 1);
    const ymd = dateToYMD(current);
    const day = current.getDay();
    const isWk = day === 0 || day === 6;
    const isNat = Boolean(NATIONAL_HOLIDAYS_INDONESIA[ymd] || FIXED_ANNUAL_HOLIDAYS[ymd.slice(5)]);
    if (!isWk && !isNat) {
      return ymd;
    }
  }
  return startDateYMD;
}

/**
 * Mendapatkan tanggal default untuk transaksi baru:
 * Jika hari ini adalah hari libur atau akhir pekan, kembalikan hari kerja terdekat yang valid.
 */
export function getDefaultTransactionDate(): { dateYMD: string; wasAdjusted: boolean; originalDateReason: string | null } {
  const today = new Date();
  const todayYMD = dateToYMD(today);
  const check = checkIsHolidayOrWeekend(todayYMD);
  
  if (check.isHolidayOrWeekend) {
    // Jika hari ini libur, defaultkan ke hari kerja sebelumnya (misal Jumat jika Sabtu/Minggu)
    // agar pembukuan tidak melompati tanggal berjalan, atau hari kerja berikutnya jika awal pekan
    return {
      dateYMD: check.suggestedPrevWorkday || todayYMD,
      wasAdjusted: true,
      originalDateReason: check.reason
    };
  }

  return {
    dateYMD: todayYMD,
    wasAdjusted: false,
    originalDateReason: null
  };
}

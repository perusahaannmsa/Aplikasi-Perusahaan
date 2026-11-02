import { EmployeeLoan, LoanPayment, Worker } from '../types';
import { INITIAL_WORKERS } from '../constantsAbsen';

export const STORAGE_KEY_EMPLOYEE_LOANS = 'nmsa_employee_loans_v1';

/**
 * Ambil daftar karyawan yang tersinkronisasi 100% dengan modul Absensi Harian NMSA
 */
export function getSynchronizedAttendanceWorkers(): Worker[] {
  try {
    const saved = localStorage.getItem("karyawan_uang_makan");
    let workersList: Worker[] = saved ? JSON.parse(saved) : [];
    
    if (!Array.isArray(workersList) || workersList.length === 0) {
      workersList = [...INITIAL_WORKERS];
    } else {
      // Pastikan seluruh 9 karyawan resmi dari INITIAL_WORKERS selalu ada
      INITIAL_WORKERS.forEach(iw => {
        const idx = workersList.findIndex(w => w.id === iw.id || w.name.toLowerCase().trim() === iw.name.toLowerCase().trim());
        if (idx === -1) {
          workersList.push(iw);
        } else if (!workersList[idx].phoneNumber && iw.phoneNumber) {
          workersList[idx].phoneNumber = iw.phoneNumber;
        }
      });
    }

    return workersList.filter(w => w && w.name && w.isActive !== false);
  } catch (e) {
    return [...INITIAL_WORKERS];
  }
}

/**
 * Konversi angka nominal ke kalimat terbilang bahasa Indonesia
 */
export function terbilang(nominal: number): string {
  const bilangan = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];

  const angka = Math.floor(Math.abs(nominal));
  if (angka === 0) return 'Nol Rupiah';

  function sebut(n: number): string {
    if (n < 12) return bilangan[n];
    if (n < 20) return sebut(n - 10) + ' Belas';
    if (n < 100) return sebut(Math.floor(n / 10)) + ' Puluh ' + sebut(n % 10);
    if (n < 200) return 'Seratus ' + sebut(n - 100);
    if (n < 1000) return sebut(Math.floor(n / 100)) + ' Ratus ' + sebut(n % 100);
    if (n < 2000) return 'Seribu ' + sebut(n - 1000);
    if (n < 1000000) return sebut(Math.floor(n / 1000)) + ' Ribu ' + sebut(n % 1000);
    if (n < 1000000000) return sebut(Math.floor(n / 1000000)) + ' Juta ' + sebut(n % 1000000);
    if (n < 1000000000000) return sebut(Math.floor(n / 1000000000)) + ' Miliar ' + sebut(n % 1000000000);
    return sebut(Math.floor(n / 1000000000000)) + ' Triliun ' + sebut(n % 1000000000000);
  }

  const hasil = sebut(angka).replace(/\s+/g, ' ').trim();
  return `${hasil} Rupiah`;
}

export function formatRupiah(amount: number): string {
  return `Rp ${(Number(amount) || 0).toLocaleString('id-ID')}`;
}

export function formatTanggalIndo(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export interface LoanCalculatedSummary {
  totalPinjaman: number;
  totalDibayar: number;
  sisaPinjaman: number;
  progressPersen: number;
  effectiveStatus: 'Lunas' | 'Dalam Cicilan' | 'Belum Dibayar' | 'Menunggu Persetujuan' | 'Ditolak';
  paymentCount: number;
  sisaCicilanBulan?: number;
  terakhirBayar?: string;
}

/**
 * Hitung kalkulasi pembayaran, sisa hutang, dan status pinjaman
 */
export function calculateLoanSummary(loan: EmployeeLoan): LoanCalculatedSummary {
  const totalPinjaman = Number(loan.jumlahPinjaman) || 0;
  const payments = Array.isArray(loan.payments) ? loan.payments : [];
  const totalDibayar = payments.reduce((sum, p) => sum + (Number(p.jumlahBayar) || 0), 0);
  const sisaPinjaman = Math.max(0, totalPinjaman - totalDibayar);
  const progressPersen = totalPinjaman > 0 ? Math.min(100, Math.round((totalDibayar / totalPinjaman) * 100)) : 0;

  let effectiveStatus: LoanCalculatedSummary['effectiveStatus'] = 'Belum Dibayar';

  if (loan.status === 'Ditolak') {
    effectiveStatus = 'Ditolak';
  } else if (loan.status === 'Menunggu Persetujuan') {
    effectiveStatus = 'Menunggu Persetujuan';
  } else if (sisaPinjaman <= 0 && totalPinjaman > 0) {
    effectiveStatus = 'Lunas';
  } else if (totalDibayar > 0) {
    effectiveStatus = 'Dalam Cicilan';
  } else {
    effectiveStatus = 'Belum Dibayar';
  }

  const sortedPayments = [...payments].sort((a, b) => new Date(b.tanggalBayar).getTime() - new Date(a.tanggalBayar).getTime());
  const terakhirBayar = sortedPayments[0]?.tanggalBayar;

  const cicilanPerBulan = Number(loan.cicilanPerBulan) || 0;
  const sisaCicilanBulan = (cicilanPerBulan > 0 && sisaPinjaman > 0)
    ? Math.ceil(sisaPinjaman / cicilanPerBulan)
    : undefined;

  return {
    totalPinjaman,
    totalDibayar,
    sisaPinjaman,
    progressPersen,
    effectiveStatus,
    paymentCount: payments.length,
    sisaCicilanBulan,
    terakhirBayar
  };
}

/**
 * Buat nomor pinjaman unik berurutan: PK-YYYYMM-001
 */
export function generateNextLoanNumber(existingLoans: EmployeeLoan[]): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `PK-${yyyy}${mm}-`;

  let maxSeq = 0;
  for (const l of existingLoans) {
    if (l.nomorPinjaman && l.nomorPinjaman.startsWith(prefix)) {
      const numPart = parseInt(l.nomorPinjaman.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export const INITIAL_SAMPLE_LOANS: EmployeeLoan[] = [
  {
    id: 'loan-sample-1',
    nomorPinjaman: 'PK-202610-001',
    tanggalPermohonan: '2026-10-15',
    namaKaryawan: 'Faisal Zainuddin',
    divisi: 'Operasional Lapangan',
    alasanPeminjaman: 'Keperluan biaya mendesak renovasi genteng rumah bocor',
    jumlahPinjaman: 5000000,
    caraPembayaran: 'Potong Gaji Bulanan Rp 1.000.000 x 5 Bulan',
    tenorBulan: 5,
    cicilanPerBulan: 1000000,
    tanggalPengambilanPinjaman: '2026-10-16',
    peminjamNama: 'Faisal Zainuddin',
    peminjamJabatan: 'Staff Operasional',
    peminjamTanggal: '2026-10-15',
    atasanNama: 'Andi Muhammad Rifki',
    atasanJabatan: 'Direktur',
    atasanTanggal: '2026-10-15',
    financeNama: 'Harijon',
    financeJabatan: 'Direktur Keuangan',
    financeTanggal: '2026-10-16',
    direkturNama: 'Andi Nursyam Halid',
    direkturJabatan: 'Direktur Utama',
    direkturTanggal: '2026-10-16',
    catatan: 'Disetujui. Pencairan via transfer ke rekening BCA karyawan. Pemotongan gaji dimulai pada slip gaji periode akhir Oktober 2026.',
    status: 'Belum Lunas',
    payments: [
      {
        id: 'pay-1',
        tanggalBayar: '2026-10-31',
        jumlahBayar: 1000000,
        metodePembayaran: 'Potong Gaji',
        keterangan: 'Potong Gaji Angsuran ke-1 (Periode Oktober 2026)',
        nomorBukti: 'SLIP-OCT-2026-FZ',
        diterimaOleh: 'Sri Ekowati (Finance)',
        createdAt: '2026-10-31T17:00:00.000Z'
      }
    ],
    createdAt: '2026-10-15T09:30:00.000Z',
    updatedAt: '2026-10-31T17:00:00.000Z'
  },
  {
    id: 'loan-sample-2',
    nomorPinjaman: 'PK-202610-002',
    tanggalPermohonan: '2026-10-20',
    namaKaryawan: 'Andi Dhiya Salsabila',
    divisi: 'Keuangan & Akuntansi',
    alasanPeminjaman: 'Pembayaran biaya pendidikan / kuliah semester lanjutan',
    jumlahPinjaman: 3000000,
    caraPembayaran: 'Potong Gaji Bulanan Rp 1.000.000 x 3 Bulan',
    tenorBulan: 3,
    cicilanPerBulan: 1000000,
    tanggalPengambilanPinjaman: '2026-10-22',
    peminjamNama: 'Andi Dhiya Salsabila',
    peminjamJabatan: 'Staff Keuangan',
    peminjamTanggal: '2026-10-20',
    atasanNama: 'Andi Muhammad Rifki',
    atasanJabatan: 'Direktur',
    atasanTanggal: '2026-10-21',
    financeNama: 'Harijon',
    financeJabatan: 'Direktur Keuangan',
    financeTanggal: '2026-10-21',
    direkturNama: 'Andi Nursyam Halid',
    direkturJabatan: 'Direktur Utama',
    direkturTanggal: '2026-10-22',
    catatan: 'Disetujui. Pencairan telah ditransfer.',
    status: 'Disetujui',
    payments: [],
    createdAt: '2026-10-20T10:00:00.000Z'
  }
];

export function getSavedEmployeeLoans(): EmployeeLoan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EMPLOYEE_LOANS);
    if (!raw) return INITIAL_SAMPLE_LOANS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse employee loans from localStorage:', e);
  }
  return INITIAL_SAMPLE_LOANS;
}

export function saveEmployeeLoans(loans: EmployeeLoan[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_EMPLOYEE_LOANS, JSON.stringify(loans));
    // Trigger window event for reactive sync
    window.dispatchEvent(new CustomEvent('nmsa-employee-loans-updated', { detail: loans }));
  } catch (e) {
    console.error('Failed to save employee loans to localStorage:', e);
  }

  // Silent sync to backend server unified-storage
  try {
    fetch('/api/unified-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeLoans: loans })
    }).catch(() => {});
  } catch (_) {}
}

import { EmployeeLoan, LoanPayment, Worker, Submission, LoanDisbursement } from '../types';
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

/**
 * Cek apakah sebuah transaksi pengajuan / voucher kas merupakan transaksi Pinjaman / Hutang
 * Mendeteksi otomatis:
 * - Pinjaman Sementara
 * - Pinjaman Karyawan
 * - Pinjaman ANH (PT Agro Nusantara Halid)
 * - Pinjaman NH (Nursyam Halid)
 * - Pinjaman SHIRON, IPN, dll.
 * - Hutang Pribadi / Hutang Pihak Ketiga / Talangan
 */
export function isLoanSubmission(sub: Submission): boolean {
  if (!sub) return false;
  // 1. Ditandai manual atau terhubung langsung dengan ID / nomor pinjaman
  if (sub.loanId || (sub as any).loanNumber || (sub as any).isLoan) return true;
  
  // 2. Berdasarkan jenis pengajuan yang eksplisit "Pinjaman Karyawan" / "Pinjaman"
  const cleanJenis = (sub.jenisPengajuan || '').trim().toLowerCase();
  if (
    cleanJenis === 'pinjaman karyawan' || 
    cleanJenis === 'pinjaman' || 
    cleanJenis === 'kasbon karyawan' ||
    cleanJenis === 'pencairan pinjaman karyawan'
  ) {
    return true;
  }

  return false;
}

/**
 * Normalisasi nama untuk pencocokan yang akurat
 * Membersihkan titel Indonesia (Bpk, Ibu, Pak, Sdr, H., Hj., Dr., Drs., Ir., dll) dan tanda baca
 */
export function normalizePersonName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^(bpk\.?|bapak\.?|ibu\.?|bu\.?|pak\.?|saudara\.?|sdr\.?|h\.|haji\b|hj\.|dr\.|drs\.|ir\.|prof\.)\s+/i, '')
    .replace(/[\(\)\[\],.\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cek apakah dua nama orang/entitas identik atau sangat mirip
 */
export function arePersonNamesMatching(nameA: string, nameB: string): boolean {
  const normA = normalizePersonName(nameA);
  const normB = normalizePersonName(nameB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  return false;
}

/**
 * Tentukan kategori pinjaman: 'karyawan' atau 'perusahaan'
 * - Karyawan: Karyawan tetap/staff dari master absensi atau jenis pinjaman karyawan
 * - Perusahaan / Pihak Ketiga: PT, CV, ANH, NH, Direksi, Yayasan, Pihak Ketiga, Vendor
 */
export function determineLoanCategory(
  recipientName: string,
  jenisPengajuan?: string,
  workersList?: Worker[]
): 'karyawan' | 'perusahaan' {
  const normRecipient = normalizePersonName(recipientName);
  const jenis = (jenisPengajuan || '').toLowerCase();

  // 1. Jika nama eksplisit berawalan / mengandung entitas bisnis (PT, CV, Yayasan, ANH, Universitas, dll)
  if (
    /^(pt|pt\.|cv|cv\.|firma|fa|koperasi|ud|ud\.|yayasan|universitas|unila)\b/i.test(recipientName.trim()) ||
    normRecipient.includes('pt.') ||
    normRecipient.includes('pt ') ||
    normRecipient.includes('agro nusantara halid') ||
    normRecipient.includes('perusahaan') ||
    normRecipient.includes('universitas') ||
    normRecipient.includes('unila')
  ) {
    return 'perusahaan';
  }

  // 2. Jika jenis pengajuan eksplisit menyebutkan perusahaan atau pihak ketiga
  if (
    jenis.includes('perusahaan') ||
    jenis.includes('pihak ketiga') ||
    jenis.includes('anh') ||
    jenis.includes('rekanan')
  ) {
    return 'perusahaan';
  }

  // 3. Jika jenis pengajuan eksplisit menyebutkan karyawan
  if (jenis.includes('karyawan') || jenis.includes('staff') || jenis.includes('pegawai')) {
    return 'karyawan';
  }

  // 4. Cocokkan dengan master daftar karyawan absensi & HO
  const activeWorkers = workersList || getSynchronizedAttendanceWorkers();
  const isFoundInWorkers = activeWorkers.some(w => {
    return arePersonNamesMatching(w.name, recipientName);
  });

  if (isFoundInWorkers) {
    return 'karyawan';
  }

  // 5. Fallback: jika bukan karyawan di daftar master absensi, kategorikan sebagai pinjaman perusahaan / rekanan / pihak ketiga
  return 'perusahaan';
}

/**
 * Sinkronisasi otomatis data transaksi Voucher HO ke Modul Pinjaman
 * Mengakumulasikan transaksi pinjaman dengan nama penerima yang sama:
 * "jika sudah tercatat pada menu pinjaman setiap ada transaksi pinjaman dengan nama yang sama,
 * maka pinjaman tersebut terakumulasikan atau bertambah seiring saldo pinjaman yang ada sebelumnya."
 */
export function syncLoansWithSubmissions(
  existingLoans: EmployeeLoan[],
  submissions: Submission[],
  workersList?: Worker[]
): {
  syncedLoans: EmployeeLoan[];
  newLoansCount: number;
  accumulatedCount: number;
} {
  const allWorkers = workersList || getSynchronizedAttendanceWorkers();
  const loanSubmissions = submissions.filter(isLoanSubmission);

  if (loanSubmissions.length === 0) {
    return {
      syncedLoans: existingLoans,
      newLoansCount: 0,
      accumulatedCount: 0
    };
  }

  // Salin list pinjaman yang ada agar tidak mutasi langsung
  const updatedLoans: EmployeeLoan[] = existingLoans.map(l => ({
    ...l,
    disbursements: Array.isArray(l.disbursements) ? [...l.disbursements] : [],
    payments: Array.isArray(l.payments) ? [...l.payments] : []
  }));

  let newLoansCount = 0;
  let accumulatedCount = 0;

  // Urutkan submission dari terlama ke terbaru agar riwayat akumulasi kronologis
  const sortedSubs = [...loanSubmissions].sort((a, b) => {
    const dateA = a.tanggal || '';
    const dateB = b.tanggal || '';
    return dateA.localeCompare(dateB);
  });

  sortedSubs.forEach(sub => {
    const recipient = (sub.dibayarkanKepada || '').trim();
    if (!recipient) return;

    // Hitung nominal voucher
    let voucherAmount = 0;
    if (Array.isArray(sub.items) && sub.items.length > 0) {
      voucherAmount = sub.items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
    }
    if (voucherAmount <= 0) {
      voucherAmount = Number((sub as any).subTotal) || Number((sub as any).total) || 0;
    }
    if (voucherAmount <= 0) {
      voucherAmount = Number((sub as any).invoiceAmount) || 0;
    }

    // Tentukan kategori (karyawan vs perusahaan)
    const category = determineLoanCategory(recipient, sub.jenisPengajuan, allWorkers);

    // Cari worker match jika kategori karyawan
    const matchedWorker = allWorkers.find(w => arePersonNamesMatching(w.name, recipient));

    // Cari apakah sudah ada pinjaman atas ID/nomor pinjaman yang sama, voucher terhubung, atau nama yang sama
    const existingIndex = updatedLoans.findIndex(l => {
      // 1. Exact match by loanId or loanNumber from voucher created via Pinjaman menu
      if ((sub as any).loanId && l.id === (sub as any).loanId) return true;
      if ((sub as any).loanNumber && l.nomorPinjaman === (sub as any).loanNumber) return true;
      // 2. Match by linkedSubmissionId / linkedSubmissionKode
      if (l.linkedSubmissionId && l.linkedSubmissionId === sub.id) return true;
      if (l.linkedSubmissionKode && sub.kode && l.linkedSubmissionKode === sub.kode) return true;
      // 3. Match by existing disbursements
      if (l.disbursements && l.disbursements.some(d => d.submissionId === sub.id || (sub.kode && d.kodeDokumen === sub.kode))) {
        return true;
      }
      // 4. Match by name
      return arePersonNamesMatching(l.namaKaryawan, recipient);
    });

    const disbursementItem: LoanDisbursement = {
      id: `disb-${sub.id}`,
      submissionId: sub.id,
      kodeDokumen: sub.kode,
      tanggal: sub.tanggal || new Date().toISOString().split('T')[0],
      jumlah: voucherAmount,
      keterangan: sub.notes || sub.jenisPengajuan || 'Pencairan Pinjaman via Voucher HO',
      statusPembayaran: sub.status || 'Belum Lunas'
    };

    if (existingIndex >= 0) {
      // AKUMULASI DENGAN PINJAMAN YANG SUDAH ADA
      const currentLoan = updatedLoans[existingIndex];
      const disbList = [...(currentLoan.disbursements || [])];

      // Cek apakah transaksi voucher ini sudah pernah dicatat di riwayat pencairan
      const existingDisbIdx = disbList.findIndex(d => 
        (d.submissionId && d.submissionId === sub.id) || 
        (sub.kode && d.kodeDokumen === sub.kode)
      );

      let isNewVoucherForThisLoan = false;

      if (existingDisbIdx >= 0) {
        // Update disbursement yang sudah ada
        disbList[existingDisbIdx] = {
          ...disbList[existingDisbIdx],
          jumlah: voucherAmount,
          tanggal: sub.tanggal || disbList[existingDisbIdx].tanggal,
          keterangan: sub.notes || sub.jenisPengajuan || disbList[existingDisbIdx].keterangan,
          statusPembayaran: sub.status || disbList[existingDisbIdx].statusPembayaran
        };
      } else {
        // Transaksi baru dengan nama yang sama -> Tambahkan ke pencairan & akumulasikan!
        disbList.push(disbursementItem);
        accumulatedCount++;
        isNewVoucherForThisLoan = true;
      }

      // Hitung akumulasi total pinjaman:
      // Total dari seluruh disbursement yang terhubung
      const totalFromDisbursements = disbList.reduce((sum, d) => sum + (Number(d.jumlah) || 0), 0);
      
      // Jika pinjaman memiliki saldo awal manual yang dibuat sebelum ada voucher
      const initialManualBase = (currentLoan as any).manualBaseAmount || 0;
      const finalTotalPinjaman = totalFromDisbursements > 0 
        ? Math.max(totalFromDisbursements + initialManualBase, currentLoan.jumlahPinjaman) 
        : currentLoan.jumlahPinjaman;

      // Jika ada beberapa disbursement, catat di skema cara pembayaran
      let caraBayar = currentLoan.caraPembayaran || '';
      if (disbList.length > 1) {
        caraBayar = `Terakumulasi dari ${disbList.length} voucher (${disbList.map(d => d.kodeDokumen || d.tanggal).join(', ')})`;
      } else if (sub.kode) {
        caraBayar = `Voucher HO (${sub.kode})`;
      }

      const updatedItem: EmployeeLoan = {
        ...currentLoan,
        category: currentLoan.category || category,
        jumlahPinjaman: finalTotalPinjaman,
        disbursements: disbList,
        caraPembayaran: caraBayar,
        linkedSubmissionId: currentLoan.linkedSubmissionId || sub.id,
        linkedSubmissionKode: currentLoan.linkedSubmissionKode || sub.kode,
        status: currentLoan.status === 'Menunggu Persetujuan' ? 'Disetujui' : currentLoan.status,
        updatedAt: new Date().toISOString()
      };

      // Hapus dari posisi lama dan pindahkan ke posisi teratas jika ada voucher baru terakumulasi
      if (isNewVoucherForThisLoan) {
        updatedLoans.splice(existingIndex, 1);
        updatedLoans.unshift(updatedItem);
      } else {
        updatedLoans[existingIndex] = updatedItem;
      }

    } else {
      // BUAT DATA PINJAMAN BARU
      const nextLoanNo = generateNextLoanNumber(updatedLoans);
      const newLoanId = `loan-sync-${sub.id}`;

      const newLoan: EmployeeLoan = {
        id: newLoanId,
        nomorPinjaman: nextLoanNo,
        tanggalPermohonan: sub.tanggal || new Date().toISOString().split('T')[0],
        namaKaryawan: recipient,
        category,
        divisi: category === 'karyawan' 
          ? (matchedWorker?.division || matchedWorker?.role || 'Staff / Karyawan NMSA') 
          : 'Pihak Ketiga / Rekanan Perusahaan',
        alasanPeminjaman: sub.notes || `Pencairan ${sub.jenisPengajuan}`,
        jumlahPinjaman: voucherAmount,
        caraPembayaran: `Voucher HO (${sub.kode || '-'})`,
        tenorBulan: 5,
        cicilanPerBulan: Math.round(voucherAmount / 5),
        tanggalPengambilanPinjaman: sub.tanggal || new Date().toISOString().split('T')[0],
        peminjamNama: recipient,
        peminjamJabatan: category === 'karyawan' ? (matchedWorker?.role || 'Karyawan') : 'Pimpinan Rekanan / Pihak Ketiga',
        peminjamTanggal: sub.tanggal,
        atasanNama: 'Andi Muhammad Rifki',
        atasanJabatan: 'Direktur',
        atasanTanggal: sub.tanggal,
        financeNama: 'Harijon',
        financeJabatan: 'Direktur Keuangan',
        financeTanggal: sub.tanggal,
        direkturNama: 'Andi Nursyam Halid',
        direkturJabatan: 'Direktur Utama',
        direkturTanggal: sub.tanggal,
        catatan: `Tersinkronisasi otomatis dari transaksi Voucher ${sub.kode || ''}: ${sub.notes || sub.jenisPengajuan}`,
        status: 'Belum Lunas',
        payments: [],
        disbursements: [disbursementItem],
        linkedSubmissionId: sub.id,
        linkedSubmissionKode: sub.kode,
        createdAt: sub.tanggal ? `${sub.tanggal}T08:00:00.000Z` : new Date().toISOString()
      };

      updatedLoans.unshift(newLoan);
      newLoansCount++;
    }
  });

  return {
    syncedLoans: updatedLoans,
    newLoansCount,
    accumulatedCount
  };
}

/**
 * Tandai pinjaman sebagai Lunas
 * Menambahkan catatan pelunasan penuh sebesar sisa pinjaman dan mengubah status pinjaman menjadi 'Lunas'
 */
export function markLoanAsLunas(
  loan: EmployeeLoan,
  tanggalLunas?: string,
  keterangan?: string,
  penerima?: string
): EmployeeLoan {
  const summary = calculateLoanSummary(loan);
  const nowStr = new Date().toISOString();
  const tglBayar = tanggalLunas || nowStr.split('T')[0];
  const sisa = summary.sisaPinjaman;

  const settlementPayment: LoanPayment = {
    id: `pay-settle-${Date.now()}`,
    tanggalBayar: tglBayar,
    jumlahBayar: sisa > 0 ? sisa : Number(loan.jumlahPinjaman) || 0,
    metodePembayaran: 'Lainnya',
    keterangan: keterangan || 'Pelunasan Penuh (Ditandai Lunas oleh Finance)',
    nomorBukti: `LUNAS-${loan.nomorPinjaman}`,
    diterimaOleh: penerima || 'Sri Ekowati (Finance)',
    createdAt: nowStr
  };

  const existingPayments = Array.isArray(loan.payments) ? [...loan.payments] : [];

  return {
    ...loan,
    status: 'Lunas',
    payments: [...existingPayments, settlementPayment],
    updatedAt: nowStr
  };
}

/**
 * Batalkan status Lunas (Aktifkan kembali pinjaman ke daftar hutang)
 */
export function reopenLoan(loan: EmployeeLoan): EmployeeLoan {
  const payments = (loan.payments || []).filter(p => !p.id.startsWith('pay-settle-'));
  return {
    ...loan,
    status: 'Belum Lunas',
    payments,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Hubungkan / ganti transaksi Voucher kas secara manual ke sebuah Pinjaman
 */
export function manuallyLinkVoucherToLoan(
  loan: EmployeeLoan,
  sub: Submission
): EmployeeLoan {
  let voucherAmount = 0;
  if (Array.isArray(sub.items) && sub.items.length > 0) {
    voucherAmount = sub.items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  }
  if (voucherAmount <= 0) {
    voucherAmount = Number((sub as any).subTotal) || Number((sub as any).total) || 0;
  }
  if (voucherAmount <= 0) {
    voucherAmount = Number((sub as any).invoiceAmount) || 0;
  }

  const disbList = [...(loan.disbursements || [])];
  const existingIdx = disbList.findIndex(d => d.submissionId === sub.id || (sub.kode && d.kodeDokumen === sub.kode));

  const disbItem: LoanDisbursement = {
    id: `disb-manual-${sub.id}`,
    submissionId: sub.id,
    kodeDokumen: sub.kode,
    tanggal: sub.tanggal || new Date().toISOString().split('T')[0],
    jumlah: voucherAmount,
    keterangan: sub.notes || sub.jenisPengajuan || 'Pencairan Pinjaman via Voucher HO (Manual)',
    statusPembayaran: sub.status || 'Belum Lunas'
  };

  if (existingIdx >= 0) {
    disbList[existingIdx] = disbItem;
  } else {
    disbList.push(disbItem);
  }

  const totalFromDisbursements = disbList.reduce((sum, d) => sum + (Number(d.jumlah) || 0), 0);
  const newTotal = Math.max(loan.jumlahPinjaman, totalFromDisbursements);

  return {
    ...loan,
    jumlahPinjaman: newTotal,
    linkedSubmissionId: sub.id,
    linkedSubmissionKode: sub.kode,
    disbursements: disbList,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Lepas tautan voucher dari pinjaman
 */
export function manuallyUnlinkVoucherFromLoan(
  loan: EmployeeLoan,
  submissionId: string
): EmployeeLoan {
  const disbList = (loan.disbursements || []).filter(d => d.submissionId !== submissionId);
  const totalFromDisbursements = disbList.reduce((sum, d) => sum + (Number(d.jumlah) || 0), 0);

  return {
    ...loan,
    linkedSubmissionId: loan.linkedSubmissionId === submissionId ? undefined : loan.linkedSubmissionId,
    linkedSubmissionKode: loan.linkedSubmissionId === submissionId ? undefined : loan.linkedSubmissionKode,
    disbursements: disbList,
    jumlahPinjaman: disbList.length > 0 ? totalFromDisbursements : loan.jumlahPinjaman,
    updatedAt: new Date().toISOString()
  };
}

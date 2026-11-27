import { AgendaItem, Submission } from '../types';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(amount || 0);
}

export const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// Forward-only cutoff timestamp (27 Nov 2026 11:15 WIB = 2026-11-27T04:15:00.000Z)
// Memastikan hanya transaksi Invoice yang ditandai mulai dari sekarang hingga ke depan yang masuk pengingat Wajib DJP (< Tgl 5)
export const DJP_BUKTI_POTONG_CUTOFF_DATE = '2026-11-27';
export const DJP_BUKTI_POTONG_CUTOFF_ISO = '2026-11-27T04:15:00.000Z';
export const DJP_BUKTI_POTONG_DUE_DAY = 5;

/**
 * Menghitung batas akhir wajib pembuatan & pelaporan Bukti Potong DJP (Coretax),
 * yaitu SEBELUM tanggal 5 di bulan berikutnya berdasarkan tanggal transaksi pengajuan invoice.
 * Contoh:
 * - Transaksi 27 November 2026 -> Masa Pajak: November 2026 -> Jatuh tempo: Sebelum Tgl 5 Desember 2026 (2026-12-05)
 * - Transaksi 15 Desember 2026 -> Masa Pajak: Desember 2026 -> Jatuh tempo: Sebelum Tgl 5 Januari 2027 (2027-01-05)
 */
export function calculateTaxDueDate(dateStr?: string): {
  dueDate: string;
  taxPeriod: string;
  monthName: string;
  year: number;
  dueDateFormatted: string;
  nextMonthName: string;
  nextYear: number;
} {
  let txYear: number;
  let txMonth: number; // 0-11

  if (dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parts = dateStr.split('-');
    txYear = parseInt(parts[0], 10);
    txMonth = parseInt(parts[1], 10) - 1;
  } else {
    const now = new Date();
    txYear = now.getFullYear();
    txMonth = now.getMonth();
  }

  if (isNaN(txYear) || isNaN(txMonth) || txMonth < 0 || txMonth > 11) {
    const now = new Date();
    txYear = now.getFullYear();
    txMonth = now.getMonth();
  }

  const monthName = INDONESIAN_MONTHS[txMonth] || 'Bulan Pajak';
  const taxPeriod = `${txYear}-${String(txMonth + 1).padStart(2, '0')}`;

  // Bulan berikutnya sebelum tanggal 5
  let nextMonth = txMonth + 1;
  let nextYear = txYear;
  if (nextMonth > 11) {
    nextMonth = 0; // Januari tahun berikutnya
    nextYear = txYear + 1;
  }

  const nextMonthStr = String(nextMonth + 1).padStart(2, '0');
  const dueDate = `${nextYear}-${nextMonthStr}-05`;
  const nextMonthName = INDONESIAN_MONTHS[nextMonth];
  const dueDateFormatted = `Sebelum Tgl 5 ${nextMonthName} ${nextYear}`;

  return {
    dueDate,
    taxPeriod,
    monthName,
    year: txYear,
    dueDateFormatted,
    nextMonthName,
    nextYear
  };
}

/**
 * Mengecek secara ketat apakah suatu transaksi merupakan transaksi Invoice yang
 * secara EKSPLISIT ditandai oleh pengguna ("Tandai Sebagai Invoice / Buatkan Laporan Bukti Potong Pajak")
 * dan dibuat/diaktifkan mulai dari sekarang sampai ke depan (forward-only >= DJP_BUKTI_POTONG_CUTOFF_ISO).
 */
export function isExplicitBuktiPotongInvoice(sub?: Partial<Submission> | null): boolean {
  if (!sub) return false;

  // 1. Wajib eksplisit berjenis Invoice yang diklik user & opsi pengingat bukti potong aktif
  if (sub.isInvoice !== true) return false;
  if (sub.sendToAgenda === false) return false;
  if (sub.taxBuktiPotongRequired !== true && sub.sendToAgenda !== true) return false;

  // 2. Hanya membaca mulai dari aktivasi fitur sekarang sampai ke depan (tidak membaca masa lalu)
  if (sub.taxReminderActivatedAt) {
    return sub.taxReminderActivatedAt >= DJP_BUKTI_POTONG_CUTOFF_ISO;
  }

  if (sub.createdAt) {
    return sub.createdAt >= DJP_BUKTI_POTONG_CUTOFF_ISO;
  }

  return false;
}

/**
 * Mengecek apakah suatu transaksi merupakan transaksi Invoice / Tagihan (digunakan untuk rekap PPh 23 umum)
 */
export function isInvoiceSubmission(sub: Partial<Submission>): boolean {
  if (!sub) return false;
  if (sub.isInvoice) return true;
  const jenis = (sub.jenisPengajuan || '').toLowerCase();
  const kode = (sub.kode || '').toLowerCase();
  if (jenis.includes('invoice') || jenis.includes('tagihan') || jenis.includes('faktur') || jenis.includes('vendor')) {
    return true;
  }
  if (kode.includes('inv') || (sub.invoiceNumber && sub.invoiceNumber.trim() !== '')) {
    return true;
  }
  return false;
}

/**
 * Sinkronisasi otomatis transaksi invoice yang ditandai eksplisit ke Agenda Pengingat Wajib Bukti Potong DJP (< Tgl 5 bulan berikutnya).
 * Jika sudah ada agenda untuk masa pajak tersebut, rincian invoice baru akan digabungkan (diagregasi) tanpa duplikasi.
 */
export function syncInvoiceSubmissionToAgenda(
  savedSub: Submission,
  currentAgenda: AgendaItem[] = [],
  userFullName?: string
): {
  updatedAgendaItems: AgendaItem[];
  affectedAgendaId: string;
  isNew: boolean;
  dueDateFormatted: string;
} {
  const { dueDate, taxPeriod, monthName, year, dueDateFormatted, nextMonthName, nextYear } = calculateTaxDueDate(savedSub.tanggal);

  // Hitung total nominal invoice
  let totalAmount = 0;
  if (typeof savedSub.invoiceAmount === 'number' && savedSub.invoiceAmount > 0) {
    totalAmount = savedSub.invoiceAmount;
  } else if (savedSub.items && savedSub.items.length > 0) {
    totalAmount = savedSub.items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  }

  const subKode = (savedSub.kode || 'HO').trim();
  const noInv = savedSub.invoiceNumber?.trim() || '-';
  const penerima = savedSub.dibayarkanKepada?.trim() || '-';
  const formattedNominal = formatRupiah(totalAmount);
  const subNote = savedSub.notes?.trim() ? ` | Catatan: "${savedSub.notes.trim()}"` : '';

  const invoiceEntryLine = `• [${subKode}] Inv: ${noInv} | Vendor: ${penerima} | Rp ${formattedNominal}${subNote}`;

  const existingAgendaIndex = currentAgenda.findIndex((item) => {
    if (item.category !== 'Pajak') return false;
    const matchesDueDate = item.dueDate === dueDate;
    const matchesTaxPeriod = item.taxPeriod === taxPeriod;
    const isPphAgenda = (item.title || '').toLowerCase().includes('pph') ||
                        (item.title || '').toLowerCase().includes('coretax') ||
                        (item.title || '').toLowerCase().includes('invoice') ||
                        (item.title || '').toLowerCase().includes('bukti potong') ||
                        (item.title || '').toLowerCase().includes('bupot') ||
                        (item.title || '').toLowerCase().includes('djp');
    return (matchesDueDate || matchesTaxPeriod) && isPphAgenda;
  });

  if (existingAgendaIndex >= 0) {
    const existing = { ...currentAgenda[existingAgendaIndex] };
    const currentCodes: string[] = existing.linkedVoucherCodes
      ? [...existing.linkedVoucherCodes]
      : (existing.voucherCode ? existing.voucherCode.split(',').map(s => s.trim()) : []);

    if (!currentCodes.includes(subKode)) {
      currentCodes.push(subKode);
    }

    let updatedDescription = existing.description || '';
    if (!updatedDescription.includes(subKode)) {
      if (updatedDescription.trim() === '') {
        updatedDescription = `📋 WAJIB BUAT & LAPOR BUKTI POTONG PAJAK KE DJP (CORETAX)\nMasa Pajak: ${monthName} ${year}\nBatas Waktu Wajib: ${dueDateFormatted}\n\nDaftar Invoice Wajib Bukti Potong DJP:\n${invoiceEntryLine}`;
      } else if (updatedDescription.includes('Daftar Invoice')) {
        updatedDescription = `${updatedDescription.trim()}\n${invoiceEntryLine}`;
      } else {
        updatedDescription = `${updatedDescription.trim()}\n\nDaftar Invoice Wajib Bukti Potong DJP:\n${invoiceEntryLine}`;
      }
    }

    const updatedItem: AgendaItem = {
      ...existing,
      title: `Wajib Lapor Bukti Potong DJP Masa ${monthName} ${year} (< Tgl 5 ${nextMonthName})`,
      linkedVoucherCodes: currentCodes,
      voucherCode: currentCodes.join(', '),
      description: updatedDescription,
      taxPeriod,
      dueDate,
      priority: 'tinggi',
      status: 'pending',
      updatedAt: new Date().toISOString()
    };

    const newAgendaList = [...currentAgenda];
    newAgendaList[existingAgendaIndex] = updatedItem;

    return {
      updatedAgendaItems: newAgendaList,
      affectedAgendaId: existing.id,
      isNew: false,
      dueDateFormatted
    };
  } else {
    const newId = `agenda_djp_bupot_${taxPeriod}_${Date.now()}`;
    const newDescription = `📋 WAJIB BUAT & LAPOR BUKTI POTONG PAJAK KE DJP (CORETAX)\nMasa Pajak: ${monthName} ${year}\nBatas Akhir Wajib Pelaporan: Sebelum Tanggal 5 ${nextMonthName} ${nextYear} (${dueDate})\n\nSifatnya Wajib: Setiap transaksi Invoice yang telah ditandai wajib dibuatkan Bukti Potong pajaknya dan dilaporkan ke DJP sebelum tanggal 5 bulan berikutnya agar tidak terlewat.\n\nDaftar Invoice Wajib Bukti Potong DJP:\n${invoiceEntryLine}`;

    const newAgendaItem: AgendaItem = {
      id: newId,
      title: `Wajib Lapor Bukti Potong DJP Masa ${monthName} ${year} (< Tgl 5 ${nextMonthName})`,
      description: newDescription,
      dueDate,
      dueTime: '08:30',
      category: 'Pajak',
      priority: 'tinggi',
      status: 'pending',
      recurrence: 'none',
      taxPeriod,
      voucherCode: subKode,
      linkedVoucherCodes: [subKode],
      assignedTo: savedSub.dibuatOleh || userFullName || 'Nur Wahyudi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return {
      updatedAgendaItems: [newAgendaItem, ...currentAgenda],
      affectedAgendaId: newId,
      isNew: true,
      dueDateFormatted
    };
  }
}

/**
 * Format ringkasan daftar transaksi dan invoice terpilih untuk disematkan pada catatan/note agenda
 */
export function formatTransactionsSummaryNote(selectedSubs: Submission[]): string {
  if (!selectedSubs || selectedSubs.length === 0) return '';

  const lines = selectedSubs.map((sub, idx) => {
    let totalVal = 0;
    if (typeof sub.invoiceAmount === 'number' && sub.invoiceAmount > 0) {
      totalVal = sub.invoiceAmount;
    } else if (sub.items && sub.items.length > 0) {
      totalVal = sub.items.reduce((s, it) => s + (Number(it.total) || 0), 0);
    }
    const kode = sub.kode || 'HO';
    const penerima = sub.dibayarkanKepada || '-';
    const inv = sub.invoiceNumber ? ` [No Inv: ${sub.invoiceNumber}]` : '';
    const note = sub.notes ? ` (Note: ${sub.notes})` : '';
    return `${idx + 1}. ${kode}${inv} - ${penerima} (${formatRupiah(totalVal)})${note}`;
  });

  return `\n\n📌 Rincian Transaksi Terhubung:\n${lines.join('\n')}`;
}

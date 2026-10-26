import { AgendaItem, Submission } from '../types';

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(amount || 0);
}

export const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Menghitung batas akhir pelaporan PPh (Coretax DJP) yaitu tanggal 20 di bulan berikutnya
 * berdasarkan tanggal transaksi pengajuan invoice.
 * Contoh:
 * - Transaksi 15 Agustus 2026 -> Masa Pajak: Agustus 2026 -> Jatuh tempo: 20 September 2026
 * - Transaksi 09 September 2026 -> Masa Pajak: September 2026 -> Jatuh tempo: 20 Oktober 2026
 * - Transaksi 25 Desember 2026 -> Masa Pajak: Desember 2026 -> Jatuh tempo: 20 Januari 2027
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

  // Ensure valid values
  if (isNaN(txYear) || isNaN(txMonth) || txMonth < 0 || txMonth > 11) {
    const now = new Date();
    txYear = now.getFullYear();
    txMonth = now.getMonth();
  }

  const monthName = INDONESIAN_MONTHS[txMonth] || 'Bulan Pajak';
  const taxPeriod = `${txYear}-${String(txMonth + 1).padStart(2, '0')}`;

  // Bulan berikutnya untuk tanggal 20
  let nextMonth = txMonth + 1;
  let nextYear = txYear;
  if (nextMonth > 11) {
    nextMonth = 0; // Januari tahun berikutnya
    nextYear = txYear + 1;
  }

  const nextMonthStr = String(nextMonth + 1).padStart(2, '0');
  const dueDate = `${nextYear}-${nextMonthStr}-20`;
  const nextMonthName = INDONESIAN_MONTHS[nextMonth];
  const dueDateFormatted = `20 ${nextMonthName} ${nextYear}`;

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
 * Mengecek apakah suatu transaksi merupakan transaksi Invoice / Tagihan
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
 * Sinkronisasi otomatis transaksi invoice ke Agenda Pengingat Coretax DJP.
 * Jika sudah ada agenda untuk masa pajak tersebut (jatuh tempo tgl 20 bulan berikutnya),
 * rincian invoice baru akan digabungkan ke dalam agenda tersebut (diagregasi) tanpa membuat duplikasi agenda.
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
  const { dueDate, taxPeriod, monthName, year, dueDateFormatted } = calculateTaxDueDate(savedSub.tanggal);

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

  // Format satu baris entri invoice untuk dicantumkan di catatan agenda
  const invoiceEntryLine = `• [${subKode}] Inv: ${noInv} | Penerima: ${penerima} | ${formattedNominal}${subNote}`;

  // Cari apakah sudah ada agenda pajak untuk masa pajak atau tanggal jatuh tempo ini
  const existingAgendaIndex = currentAgenda.findIndex((item) => {
    if (item.category !== 'Pajak') return false;
    // Cocokkan berdasarkan taxPeriod atau dueDate tgl 20 bulan berikutnya
    const matchesDueDate = item.dueDate === dueDate;
    const matchesTaxPeriod = item.taxPeriod === taxPeriod;
    const isPphAgenda = (item.title || '').toLowerCase().includes('pph') ||
                        (item.title || '').toLowerCase().includes('coretax') ||
                        (item.title || '').toLowerCase().includes('invoice') ||
                        (item.title || '').toLowerCase().includes('bupot');
    return (matchesDueDate || matchesTaxPeriod) && isPphAgenda;
  });

  if (existingAgendaIndex >= 0) {
    // Agenda SUDAH ADA: Gabungkan ke agenda yang sudah ada!
    const existing = { ...currentAgenda[existingAgendaIndex] };
    const currentCodes: string[] = existing.linkedVoucherCodes
      ? [...existing.linkedVoucherCodes]
      : (existing.voucherCode ? existing.voucherCode.split(',').map(s => s.trim()) : []);

    if (!currentCodes.includes(subKode)) {
      currentCodes.push(subKode);
    }

    // Periksa apakah deskripsi sudah mengandung kode voucher ini
    let updatedDescription = existing.description || '';
    if (!updatedDescription.includes(subKode)) {
      if (updatedDescription.trim() === '') {
        updatedDescription = `📋 Pengingat Pelaporan PPh Masa ${monthName} ${year} (Coretax DJP)\nBatas Waktu: ${dueDateFormatted}\n\nDaftar Invoice Pemotongan PPh:\n${invoiceEntryLine}`;
      } else {
        // Cek jika bagian Daftar Invoice sudah ada
        if (updatedDescription.includes('Daftar Invoice') || updatedDescription.includes('Daftar Transaksi')) {
          updatedDescription = `${updatedDescription.trim()}\n${invoiceEntryLine}`;
        } else {
          updatedDescription = `${updatedDescription.trim()}\n\nDaftar Invoice Pemotongan PPh:\n${invoiceEntryLine}`;
        }
      }
    }

    const updatedItem: AgendaItem = {
      ...existing,
      linkedVoucherCodes: currentCodes,
      voucherCode: currentCodes.join(', '),
      description: updatedDescription,
      taxPeriod: taxPeriod,
      dueDate: dueDate,
      status: 'pending', // Re-aktifkan jika sebelumnya selesai agar staf tidak terlewat invoice baru
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
    // Agenda BELUM ADA: Buat agenda baru untuk tanggal 20 bulan berikutnya!
    const newId = `agenda_pph_${taxPeriod}_${Date.now()}`;
    const newDescription = `📋 Pengingat Pelaporan & Penyetoran PPh (Coretax DJP)\nMasa Pajak: ${monthName} ${year}\nBatas Akhir Pelaporan: ${dueDateFormatted}\n\nSetiap transaksi invoice wajib dipotong PPh (PPh 21 / 23 / Final) dan dilaporkan ke sistem Coretax DJP paling lambat tanggal 20 bulan berikutnya.\n\nDaftar Invoice Pemotongan PPh:\n${invoiceEntryLine}`;

    const newAgendaItem: AgendaItem = {
      id: newId,
      title: `Lapor PPh Masa ${monthName} ${year} - Coretax DJP (Invoice Vendor)`,
      description: newDescription,
      dueDate: dueDate,
      dueTime: '09:00',
      category: 'Pajak',
      priority: 'tinggi',
      status: 'pending',
      recurrence: 'none',
      taxPeriod: taxPeriod,
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


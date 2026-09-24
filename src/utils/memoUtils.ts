import { BankAccountMaster, InternalMemo, Submission } from '../types';

export const OFFICIAL_KOP_SURAT_IMAGE_URL = '/kop-surat-nmsa-full.png';

/**
 * Parses a "Dari" string into Name and Role/Jabatan.
 * Supports formats like:
 * - "Andi Muhammad Rifki - Direktur"
 * - "Andi Muhammad Rifki – Direktur Utama"
 * - "Andi Muhammad Rifki (Direktur)"
 * - "Andi Muhammad Rifki, Direktur"
 */
export function parseDari(dariText: string): { nama: string; jabatan: string } {
  if (!dariText) return { nama: '', jabatan: '' };
  const dashIndex = dariText.search(/\s+(?:–|—|-|\/|\|)\s+/);
  if (dashIndex !== -1) {
    const nama = dariText.substring(0, dashIndex).trim();
    const rest = dariText.substring(dashIndex).replace(/^\s*(?:–|—|-|\/|\|)\s*/, '').trim();
    return { nama, jabatan: rest };
  }
  const parenMatch = dariText.match(/^([^(]+)\(([^)]+)\)$/);
  if (parenMatch) return { nama: parenMatch[1].trim(), jabatan: parenMatch[2].trim() };
  const commaMatch = dariText.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) return { nama: commaMatch[1].trim(), jabatan: commaMatch[2].trim() };
  return { nama: dariText.trim(), jabatan: '' };
}

export const DEFAULT_BANK_ACCOUNTS: BankAccountMaster[] = [
  {
    id: 'bank-mandiri-nmsa',
    bankName: 'Bank Mandiri',
    accountNumber: '1030013139064',
    accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
    isDefault: true,
  },
  {
    id: 'bank-bca-nmsa',
    bankName: 'Bank BCA',
    accountNumber: '0753088991',
    accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
    isDefault: false,
  },
  {
    id: 'bank-bri-nmsa',
    bankName: 'Bank BRI',
    accountNumber: '034101000789304',
    accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
    isDefault: false,
  },
];

export function formatHariTanggalMemo(dateInput: string | Date = new Date()): string {
  let d: Date;
  if (typeof dateInput === 'string') {
    // Handle YYYY-MM-DD or ISO
    const parts = dateInput.split('T')[0].split('-');
    if (parts.length === 3) {
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(dateInput);
    }
  } else {
    d = dateInput;
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const dayName = days[d.getDay()] || 'Senin';
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()] || 'September';
  const year = d.getFullYear();

  return `${dayName} / ${dayNum} ${monthName} ${year}`;
}

export function toRomanMonth(monthZeroIndexed: number): string {
  const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romanMonths[monthZeroIndexed] || 'IX';
}

export function generateDefaultMemoNumber(sequence = 164, date = new Date()): string {
  const roman = toRomanMonth(date.getMonth());
  const year = date.getFullYear();
  const seqStr = String(sequence).padStart(3, '0');
  return `${seqStr}/IM-NMSA/KEU/${roman}/${year}`;
}

export function getSavedBankAccounts(): BankAccountMaster[] {
  try {
    const raw = localStorage.getItem('NMSA_SAVED_BANK_ACCOUNTS');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load bank accounts from localStorage:', e);
  }
  return DEFAULT_BANK_ACCOUNTS;
}

export function saveBankAccounts(accounts: BankAccountMaster[]): void {
  try {
    localStorage.setItem('NMSA_SAVED_BANK_ACCOUNTS', JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save bank accounts:', e);
  }
}

export function getSavedInternalMemos(): InternalMemo[] {
  try {
    const raw = localStorage.getItem('NMSA_INTERNAL_MEMOS');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((m) => ({
          ...m,
          companyHeaderUrl:
            !m.companyHeaderUrl ||
            m.companyHeaderUrl.includes('kommodo.ai') ||
            m.companyHeaderUrl.includes('Kop-Surat-NMSA.png') ||
            m.companyHeaderUrl.includes('i.ibb.co.com/N26djkQX')
              ? OFFICIAL_KOP_SURAT_IMAGE_URL
              : m.companyHeaderUrl,
        }));
      }
    }
  } catch (e) {
    console.error('Failed to load internal memos:', e);
  }
  return [];
}

export function saveInternalMemos(memos: InternalMemo[]): void {
  try {
    localStorage.setItem('NMSA_INTERNAL_MEMOS', JSON.stringify(memos));
  } catch (e) {
    console.error('Failed to save internal memos:', e);
  }
}

export function createInitialMemo(submission?: Submission | null, existingCount = 163): InternalMemo {
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];
  const hariTanggalDisplay = formatHariTanggalMemo(now);
  const defaultAccounts = getSavedBankAccounts();
  const defaultBank = defaultAccounts.find(a => a.isDefault) || defaultAccounts[0] || DEFAULT_BANK_ACCOUNTS[0];

  if (submission) {
    const subTotal = (submission.items || []).reduce((sum, item) => sum + (item.total || 0), 0);
    const formattedAmount = `Rp. ${Number(subTotal).toLocaleString('id-ID')},-`;
    const invoiceOrRef = submission.kode ? `No. ${submission.kode}` : '';
    const dateFormatted = formatHariTanggalMemo(submission.tanggal || now);

    return {
      id: `memo-${Date.now()}`,
      nomorMemo: generateDefaultMemoNumber(existingCount + 1, now),
      tanggal: todayIso,
      hariTanggalDisplay,
      dari: 'H. A. Nursyam Halid – Direktur Utama',
      kepada: 'Harijon – Direktur Keuangan',
      perihal: `Pembayaran ${submission.jenisPengajuan || 'Operasional'} - ${submission.dibayarkanKepada || ''}`.trim(),
      isiSurat: `Sehubungan dengan adanya pengajuan pembayaran keperluan <strong>${submission.jenisPengajuan || 'operasional'}</strong> terkait <strong>${submission.dibayarkanKepada || 'pihak rekanan'}</strong> sesuai rincian pada formulir voucher pengeluaran <strong>${invoiceOrRef}</strong> tertanggal ${dateFormatted}, dengan ini kami memohon untuk dilakukan pembayaran sebesar <strong>${formattedAmount}</strong> dapat di transfer ke :`,
      bankName: defaultBank.bankName,
      accountNumber: defaultBank.accountNumber,
      accountHolder: defaultBank.accountHolder,
      penutup: 'Demikian Internal Memo ini dibuat untuk dapat dipahami bersama dan dilaksanakan sebaik baiknya',
      salamPenutup: 'Hormat saya,',
      penandatanganNama: 'H. Andi Nursyam Halid',
      penandatanganJabatan: 'Direktur Utama',
      useSecondSigner: false,
      salamPenutup2: 'Menyetujui,',
      penandatanganNama2: 'Harijon',
      penandatanganJabatan2: 'Direktur Keuangan',
      linkedSubmissionId: submission.id,
      linkedSubmissionKode: submission.kode,
      linkedAmount: subTotal,
      companyName: 'PT. NUSANTARA MINERAL SUKSES ABADI',
      companyHeaderUrl: OFFICIAL_KOP_SURAT_IMAGE_URL,
      useImageHeader: false, // Default to official layout with long line like PDF IM Tongkang
      createdAt: new Date().toISOString(),
    };
  }

  // Default sample exactly matching user's official "IM - Pembayaran Tongkang" Word document
  return {
    id: `memo-${Date.now()}`,
    nomorMemo: '168/IM-NMSA/KEU/IX/2026',
    tanggal: todayIso,
    hariTanggalDisplay: 'Kamis / 24 September 2026',
    dari: 'Andi Muhammad Rifki – Direktur',
    kepada: 'Harijon – Direktur Keuangan',
    perihal: 'Pembayaran DP Batubara 50%',
    isiSurat: 'Sehubungan dengan akan dilakukannya kegiatan pengiriman Batubara ke <strong>PLTU Pelabuhan Ratu ADC</strong>, dengan ini kami memohon untuk dapat dilakukan pembayaran <strong>DP Tongkang sebesar 50%</strong> dari total biaya yang terlampir didalam <strong>Invoice No. 001-DP/WAA-BJM-NMSA/IX/26 Tanggal 23 September 2026</strong>, yaitu <strong>Sebesar Rp. 712.500.000,-</strong> dapat di Transfer ke :',
    bankName: 'Bank Mandiri',
    accountNumber: '1030013139064',
    accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
    penutup: 'Demikian Internal Memo ini dibuat untuk dapat dipahami bersama dan dilaksanakan sebaik baiknya',
    salamPenutup: 'Hormat Saya',
    penandatanganNama: 'Andi Muhammad Rifki',
    penandatanganJabatan: 'Direktur',
    signerCount: 3,
    useSecondSigner: true,
    useThirdSigner: true,
    approvalHeaderTitle: 'Mengetahui dan Menyetujui',
    salamPenutup2: 'Menyetujui,',
    penandatanganNama2: 'Harijon',
    penandatanganJabatan2: 'Direktur Keuangan',
    salamPenutup3: 'Menyetujui,',
    penandatanganNama3: 'Abdul Aziz Halid',
    penandatanganJabatan3: 'Direktur Utama ANH',
    companyName: 'PT. NUSANTARA MINERAL SUKSES ABADI',
    companyHeaderUrl: OFFICIAL_KOP_SURAT_IMAGE_URL,
    useImageHeader: false, // Default to official layout with long line like Word document
    createdAt: new Date().toISOString(),
  };
}

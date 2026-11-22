import { Submission, SubmissionItem, AccurateMappedTransaction } from '../types';

export interface DuplicateSubmissionMatch {
  submission: Submission;
  reason: string;
  matchedNominal: number;
  matchScore: number;
  similarityLevel: 'identik' | 'tinggi' | 'sedang';
  matchedFactors: {
    sameName: boolean;
    sameType: boolean;
    sameContent: boolean;
    sameNominal: boolean;
    sameDate: boolean;
    sameCode?: boolean;
    matchedRecipientName?: string;
    matchedTypeName?: string;
    matchedContentSnippet?: string;
    matchedCode?: string;
  };
  matchedLabels: string[];
  itemSnippet?: string;
  matchedCurrentItemIndices?: number[];
  matchedNameOrDescription?: string;
}

/**
 * Normalizes text for robust comparison (lowercase, trimmed, collapsed spaces, stripped punctuation)
 */
export function normalizeText(text: string = ''): string {
  return text
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strictly preserves EVERY digit, letter (case-exact), slash (/), and character of a transaction code.
 * Only trims leading/trailing spaces so "001/BKK/NMSA/XI/2026" and "002/BKK/NMSA/XI/2026" or
 * "001/BKK/NMSA" vs "001-BKK-NMSA" are always treated as distinct transactions.
 */
export function normalizeExactTransactionCode(code?: string): string {
  return String(code ?? '').trim();
}

/**
 * Detects duplicate items within a single voucher (same description & same nominal)
 */
export function findDuplicateItemIndices(items: SubmissionItem[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicateIndices = new Set<number>();

  items.forEach((item, index) => {
    const cleanDesc = normalizeText(item.item);
    const amount = Number(item.total) || 0;
    if (cleanDesc && amount > 0) {
      const key = `${cleanDesc}_${amount}`;
      if (seen.has(key)) {
        duplicateIndices.add(index);
        duplicateIndices.add(seen.get(key)!);
      } else {
        seen.set(key, index);
      }
    }
  });

  return duplicateIndices;
}

/**
 * Removes duplicate items from a voucher's items array
 */
export function removeDuplicateItems(items: SubmissionItem[]): {
  cleaned: SubmissionItem[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const cleaned: SubmissionItem[] = [];
  let removedCount = 0;

  items.forEach((item, index) => {
    const cleanDesc = normalizeText(item.item);
    const amount = Number(item.total) || 0;
    if (cleanDesc && amount > 0) {
      const key = `${cleanDesc}_${amount}`;
      if (seen.has(key)) {
        removedCount++;
        return;
      }
      seen.add(key);
    }
    cleaned.push({
      ...item,
      no: cleaned.length + 1
    });
  });

  return { cleaned, removedCount };
}

/**
 * Helper to extract YYYY-MM from date string
 */
export function extractYearMonth(dateStr?: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}/.test(trimmed)) {
    return trimmed.substring(0, 7);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    return `${parts[2]}-${parts[1].padStart(2, '0')}`;
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  return null;
}

export function findPotentialDuplicateSubmissions(
  current: {
    dibayarkanKepada?: string;
    total?: number;
    tanggal?: string;
    jenisPengajuan?: string;
    kode?: string;
    items?: SubmissionItem[];
    notes?: string;
    id?: string;
  },
  existingSubmissions: Submission[] = [],
  options?: {
    onlyCompareWithLastTransaction?: boolean;
    sameMonthOnly?: boolean;
    requireSameCode?: boolean;
  }
): DuplicateSubmissionMatch[] {
  if (!existingSubmissions || existingSubmissions.length === 0) return [];
  const currentTotal = Number(current.total) || (current.items?.reduce((acc, it) => acc + (Number(it.total) || 0), 0) || 0);
  
  // Must have valid nominal (> 0), recipient, and transaction type to detect strict 100% duplicates
  if (currentTotal <= 0) return [];

  const cleanRecipient = normalizeText(current.dibayarkanKepada);
  const cleanType = normalizeText(current.jenisPengajuan);
  const cleanNotes = normalizeText(current.notes);
  const currentKode = normalizeExactTransactionCode(current.kode);
  const requireSameCode = options?.requireSameCode ?? Boolean(current.kode !== undefined);

  if (!cleanRecipient || !cleanType) return [];
  if (requireSameCode && (!currentKode || currentKode === '-')) return [];

  // Filter out self
  let candidates = existingSubmissions.filter(s => !current.id || s.id !== current.id);
  if (candidates.length === 0) return [];

  const sameMonthOnly = options?.sameMonthOnly ?? true;
  const onlyCompareWithLast = options?.onlyCompareWithLastTransaction ?? false;

  // Wajib dalam bulan yang sama (YYYY-MM) sesuai tanggal transaksi yang sedang diinput/diedit
  if (sameMonthOnly) {
    const curYM = extractYearMonth(current.tanggal);
    if (!curYM) return [];
    candidates = candidates.filter(s => extractYearMonth(s.tanggal) === curYM);
    if (candidates.length === 0) return [];
  }

  // Urutkan transaksi dari yang paling terakhir/terbaru berdasarkan tanggal & ID
  const sortedCandidates = [...candidates].sort((a, b) => {
    const timeA = new Date(a.tanggal || 0).getTime();
    const timeB = new Date(b.tanggal || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  let targetSubmissions = sortedCandidates;
  if (onlyCompareWithLast) {
    targetSubmissions = sortedCandidates.slice(0, 1);
  }

  const matches: DuplicateSubmissionMatch[] = [];

  for (const existing of targetSubmissions) {
    const existingTotal = (existing.items && existing.items.length > 0)
      ? existing.items.reduce((acc, it) => acc + (Number(it.total) || 0), 0)
      : (Number((existing as any).nominal) || Number((existing as any).total) || 0);

    const existingRecipient = normalizeText(existing.dibayarkanKepada);
    const existingType = normalizeText(existing.jenisPengajuan);
    const existingNotes = normalizeText(existing.notes);
    const existingKode = normalizeExactTransactionCode(existing.kode);

    // 1. Exact Nominal Match (100% sama)
    const isTotalNominalMatch = currentTotal > 0 && existingTotal > 0 && Math.abs(currentTotal - existingTotal) < 0.01;
    if (!isTotalNominalMatch) continue;

    // 2. Exact Recipient Match (100% sama, tanpa substring .includes())
    const isSameName = Boolean(cleanRecipient && existingRecipient && cleanRecipient === existingRecipient);
    if (!isSameName) continue;

    // 3. Exact Transaction Type Match (100% sama, tanpa substring .includes())
    const isSameType = Boolean(cleanType && existingType && cleanType === existingType);
    if (!isSameType) continue;

    // 4. Exact Transaction Code Match (100% sama angka, huruf, dan garis miring '/')
    const isSameCode = Boolean(currentKode && currentKode !== '-' && existingKode && existingKode !== '-' && currentKode === existingKode);
    if (requireSameCode && !isSameCode) continue;

    // 5. Same Content Check (opsional untuk skor 100% + sorot item yang identik)
    let isSameContent = false;
    let matchedItemSnippet = '';
    const matchedCurItemIndices: number[] = [];

    if (cleanNotes && existingNotes && cleanNotes === existingNotes) {
      isSameContent = true;
      matchedItemSnippet = `Catatan: "${existing.notes}"`;
    }

    if (current.items && current.items.length > 0 && existing.items && existing.items.length > 0) {
      current.items.forEach((curIt, curIdx) => {
        const curDesc = normalizeText(curIt.item || curIt.keterangan);
        const curAmt = Number(curIt.total) || 0;
        if (!curDesc && curAmt <= 0) return;

        for (const exIt of existing.items) {
          const exDesc = normalizeText(exIt.item || exIt.keterangan);
          const exAmt = Number(exIt.total) || 0;
          if (!exDesc && exAmt <= 0) continue;

          if (curDesc && exDesc && curDesc === exDesc && Math.abs(curAmt - exAmt) < 0.01) {
            isSameContent = true;
            matchedItemSnippet = `Item "${exIt.item || exIt.keterangan}" senilai Rp ${curAmt.toLocaleString('id-ID')}`;
            if (!matchedCurItemIndices.includes(curIdx)) matchedCurItemIndices.push(curIdx);
            break;
          }
        }
      });
    }

    if (matchedCurItemIndices.length === 0 && current.items && current.items.length === 1) {
      matchedCurItemIndices.push(0);
    }

    // 6. Same Date vs Different Date (within same YYYY-MM month)
    const isSameDate = Boolean(
      current.tanggal &&
      existing.tanggal &&
      current.tanggal.trim().substring(0, 10) === existing.tanggal.trim().substring(0, 10)
    );

    const matchedLabels: string[] = [
      ...(isSameCode ? [`Kode Transaksi Sama 100% (${existingKode})`] : []),
      `Penerima Sama 100% (${existing.dibayarkanKepada})`,
      `Jenis Transaksi Sama 100% (${existing.jenisPengajuan})`,
      `Nominal Total Sama (Rp ${currentTotal.toLocaleString('id-ID')})`,
      isSameDate ? `Tanggal Sama (${existing.tanggal})` : `Bulan Sama, Beda Tanggal (${existing.tanggal})`
    ];
    if (isSameContent) matchedLabels.push('Isi/Rincian Identik');

    const similarityLevel: 'identik' | 'tinggi' | 'sedang' = isSameDate ? 'identik' : 'tinggi';
    const matchScore = isSameDate ? (isSameContent ? 100 : 98) : (isSameContent ? 90 : 85);
    const reason = isSameDate
      ? `Duplikat 100% Sama: Tanggal (${existing.tanggal}), ${isSameCode ? `Kode (${existingKode}), ` : ''}Nominal (Rp ${currentTotal.toLocaleString('id-ID')}), Penerima (${existing.dibayarkanKepada}), dan Jenis Transaksi (${existing.jenisPengajuan}) sama persis`
      : `Sama Bulan & Transaksi 100% (Beda Tanggal): ${isSameCode ? `Kode (${existingKode}), ` : ''}Penerima (${existing.dibayarkanKepada}), Jenis (${existing.jenisPengajuan}), dan Nominal (Rp ${currentTotal.toLocaleString('id-ID')}) sama persis di bulan yang sama pada tanggal ${existing.tanggal}`;

    matches.push({
      submission: existing,
      reason,
      matchedNominal: currentTotal,
      matchScore,
      similarityLevel,
      matchedFactors: {
        sameName: true,
        sameType: true,
        sameContent: isSameContent,
        sameNominal: true,
        sameDate: isSameDate,
        sameCode: isSameCode,
        matchedRecipientName: existing.dibayarkanKepada,
        matchedTypeName: existing.jenisPengajuan,
        matchedContentSnippet: matchedItemSnippet || existing.notes,
        matchedCode: existingKode || undefined
      },
      matchedLabels,
      itemSnippet: matchedItemSnippet,
      matchedCurrentItemIndices: matchedCurItemIndices,
      matchedNameOrDescription: existing.dibayarkanKepada || existing.jenisPengajuan || 'Pengeluaran'
    });
  }

  return matches.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return new Date(b.submission.tanggal || 0).getTime() - new Date(a.submission.tanggal || 0).getTime();
  });
}

/**
 * Finds duplicate transaction IDs in Accurate Petty Cash Mapping (same description + same amount + same date)
 */
export function findDuplicateAccurateTransactions(transactions: AccurateMappedTransaction[]): Set<string> {
  const seen = new Map<string, string>();
  const duplicateIds = new Set<string>();

  for (const t of transactions) {
    const cleanDesc = normalizeText(t.description);
    const amount = Number(t.amount) || 0;
    if (cleanDesc && amount > 0) {
      const key = `${t.date || ''}_${cleanDesc}_${amount}`;
      if (seen.has(key)) {
        duplicateIds.add(t.id);
      } else {
        seen.set(key, t.id);
      }
    }
  }

  return duplicateIds;
}

/**
 * Removes duplicate transactions from Accurate Petty Cash Mapping list
 */
export function removeDuplicateAccurateTransactions(transactions: AccurateMappedTransaction[]): {
  cleaned: AccurateMappedTransaction[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const cleaned: AccurateMappedTransaction[] = [];
  let removedCount = 0;

  for (const t of transactions) {
    const cleanDesc = normalizeText(t.description);
    const amount = Number(t.amount) || 0;
    if (cleanDesc && amount > 0) {
      const key = `${t.date || ''}_${cleanDesc}_${amount}`;
      if (seen.has(key)) {
        removedCount++;
        continue;
      }
      seen.add(key);
    }
    cleaned.push(t);
  }

  return { cleaned, removedCount };
}

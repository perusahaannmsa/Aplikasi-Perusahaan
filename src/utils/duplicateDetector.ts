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
    matchedRecipientName?: string;
    matchedTypeName?: string;
    matchedContentSnippet?: string;
  };
  matchedLabels: string[];
  itemSnippet?: string;
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
 * Checks for potential duplicate submissions / vouchers across the database.
 * Detects matches based on user requirement:
 * "voucher dengan jenis, atau nama, atau isi dan nominal yang sama"
 * 
 * 1. Same Payee (dibayarkanKepada) + Same Nominal
 * 2. Same Type (jenisPengajuan) + Same Nominal
 * 3. Same Content / Item Details (items / notes) + Same Nominal
 * 4. Combinations of the above (highest risk duplicate)
 */
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
    items?: SubmissionItem[];
    notes?: string;
    id?: string;
  },
  existingSubmissions: Submission[] = [],
  options?: {
    onlyCompareWithLastTransaction?: boolean;
    sameMonthOnly?: boolean;
  }
): DuplicateSubmissionMatch[] {
  if (!existingSubmissions || existingSubmissions.length === 0) return [];
  const currentTotal = Number(current.total) || (current.items?.reduce((acc, it) => acc + (Number(it.total) || 0), 0) || 0);
  
  // If no nominal and no items, nothing to compare
  if (currentTotal <= 0 && (!current.items || current.items.length === 0)) return [];

  const cleanRecipient = normalizeText(current.dibayarkanKepada);
  const cleanType = normalizeText(current.jenisPengajuan);
  const cleanNotes = normalizeText(current.notes);

  // Filter out self
  let candidates = existingSubmissions.filter(s => !current.id || s.id !== current.id);
  if (candidates.length === 0) return [];

  const sameMonthOnly = options?.sameMonthOnly ?? true;
  const onlyCompareWithLast = options?.onlyCompareWithLastTransaction ?? false;

  // Filter khusus: Dalam jangka bulan itu saja (sesuai tanggal transaksi yang sedang diinput/diedit)
  if (sameMonthOnly && current.tanggal) {
    const curYM = extractYearMonth(current.tanggal);
    if (curYM) {
      candidates = candidates.filter(s => {
        const sYM = extractYearMonth(s.tanggal);
        return sYM === curYM;
      });
      if (candidates.length === 0) return [];
    }
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
    // Ambil hanya transaksi paling terakhir jika diminta
    targetSubmissions = sortedCandidates.slice(0, 1);
  }

  for (const existing of targetSubmissions) {
    const existingTotal = (existing.items && existing.items.length > 0)
      ? existing.items.reduce((acc, it) => acc + (Number(it.total) || 0), 0)
      : (Number((existing as any).nominal) || Number((existing as any).total) || 0);

    const existingRecipient = normalizeText(existing.dibayarkanKepada);
    const existingType = normalizeText(existing.jenisPengajuan);
    const existingNotes = normalizeText(existing.notes);

    // 1. Same Nominal Check
    const isTotalNominalMatch = currentTotal > 0 && existingTotal > 0 && Math.abs(currentTotal - existingTotal) < 0.01;

    // 2. Same Name Check (Dibayarkan Kepada)
    const isSameName = Boolean(
      cleanRecipient &&
      existingRecipient &&
      cleanRecipient.length >= 2 &&
      existingRecipient.length >= 2 &&
      (
        cleanRecipient === existingRecipient ||
        (cleanRecipient.length >= 4 && (cleanRecipient.includes(existingRecipient) || existingRecipient.includes(cleanRecipient)))
      )
    );

    // 3. Same Type Check (Jenis Pengajuan)
    const isSameType = Boolean(
      cleanType &&
      existingType &&
      cleanType.length >= 3 &&
      existingType.length >= 3 &&
      (
        cleanType === existingType ||
        (cleanType.length >= 4 && (cleanType.includes(existingType) || existingType.includes(cleanType)))
      )
    );

    // 4. Same Content Check (Isi: items & notes)
    let isSameContent = false;
    let matchedItemSnippet = '';
    let isItemLevelMatch = false;
    let itemMatchNominal = 0;

    // Check notes
    if (cleanNotes && existingNotes && cleanNotes.length >= 4 && existingNotes.length >= 4) {
      if (cleanNotes === existingNotes || cleanNotes.includes(existingNotes) || existingNotes.includes(cleanNotes)) {
        isSameContent = true;
        matchedItemSnippet = `Catatan: "${existing.notes}"`;
      }
    }

    // Check items description and line-item nominals
    if (current.items && current.items.length > 0 && existing.items && existing.items.length > 0) {
      for (const curIt of current.items) {
        const curDesc = normalizeText(curIt.item || curIt.keterangan);
        const curAmt = Number(curIt.total) || 0;
        if (!curDesc || curDesc.length < 3) continue;

        for (const exIt of existing.items) {
          const exDesc = normalizeText(exIt.item || exIt.keterangan);
          const exAmt = Number(exIt.total) || 0;
          if (!exDesc || exDesc.length < 3) continue;

          const descMatches = curDesc === exDesc || 
            (curDesc.length >= 5 && exDesc.length >= 5 && (curDesc.includes(exDesc) || exDesc.includes(curDesc)));

          if (descMatches) {
            isSameContent = true;
            matchedItemSnippet = `Item: "${exIt.item}"`;
            if (curAmt > 0 && exAmt > 0 && Math.abs(curAmt - exAmt) < 0.01) {
              isItemLevelMatch = true;
              itemMatchNominal = curAmt;
              matchedItemSnippet = `Item "${exIt.item}" senilai Rp ${curAmt.toLocaleString('id-ID')}`;
              break;
            }
          }
        }
        if (isItemLevelMatch) break;
      }
    }

    // 5. Same Date Check
    const isSameDate = Boolean(current.tanggal && existing.tanggal && current.tanggal === existing.tanggal);

    // Determine if this constitutes a match based on user requirements:
    // "voucher dengan jenis, atau nama, atau isi dan nominal yang sama"
    const hasCoreMatch = (isSameName && isTotalNominalMatch) ||
                         (isSameType && isTotalNominalMatch) ||
                         (isSameContent && isTotalNominalMatch) ||
                         isItemLevelMatch;

    if (!hasCoreMatch) continue;

    // Build reason, score, and labels
    const matchedLabels: string[] = [];
    let matchScore = 0;

    if (isSameName) matchedLabels.push(`Nama Penerima Sama (${existing.dibayarkanKepada})`);
    if (isSameType) matchedLabels.push(`Jenis Sama (${existing.jenisPengajuan})`);
    if (isSameContent) matchedLabels.push(`Isi/Rincian Sama`);
    if (isTotalNominalMatch) matchedLabels.push(`Nominal Total Sama (Rp ${currentTotal.toLocaleString('id-ID')})`);
    else if (isItemLevelMatch) matchedLabels.push(`Nominal Item Sama (Rp ${itemMatchNominal.toLocaleString('id-ID')})`);
    if (isSameDate) matchedLabels.push(`Tanggal Sama (${existing.tanggal})`);

    let similarityLevel: 'identik' | 'tinggi' | 'sedang' = 'sedang';
    let reason = '';

    const effectiveNominal = isTotalNominalMatch ? currentTotal : itemMatchNominal;

    if (isSameName && isSameType && isSameContent && isTotalNominalMatch) {
      similarityLevel = 'identik';
      matchScore = 100;
      reason = `Sangat Identik: Jenis (${existing.jenisPengajuan}), Nama (${existing.dibayarkanKepada}), Rincian Isi, dan Total Nominal (Rp ${effectiveNominal.toLocaleString('id-ID')}) sama persis`;
    } else if (isSameName && isSameContent && isTotalNominalMatch) {
      similarityLevel = 'tinggi';
      matchScore = 90;
      reason = `Nama Penerima (${existing.dibayarkanKepada}), Isi Rincian, dan Total Nominal (Rp ${effectiveNominal.toLocaleString('id-ID')}) sama persis`;
    } else if (isSameName && isSameType && isTotalNominalMatch) {
      similarityLevel = 'tinggi';
      matchScore = 85;
      reason = `Nama Penerima (${existing.dibayarkanKepada}), Jenis (${existing.jenisPengajuan}), dan Total Nominal (Rp ${effectiveNominal.toLocaleString('id-ID')}) sama persis`;
    } else if (isSameName && isTotalNominalMatch) {
      similarityLevel = 'tinggi';
      matchScore = 75;
      reason = `Nama Penerima (${existing.dibayarkanKepada}) & Total Nominal (Rp ${effectiveNominal.toLocaleString('id-ID')}) sama persis`;
    } else if (isItemLevelMatch) {
      similarityLevel = isSameName ? 'tinggi' : 'sedang';
      matchScore = isSameName ? 80 : 65;
      reason = `Rincian Isi ${matchedItemSnippet} sama persis dengan voucher sebelumnya`;
    } else if (isSameContent && isTotalNominalMatch) {
      similarityLevel = 'sedang';
      matchScore = 60;
      reason = `Isi/Rincian Transaksi (${matchedItemSnippet || 'Rincian Sama'}) & Total Nominal (Rp ${effectiveNominal.toLocaleString('id-ID')}) sama persis`;
    } else if (isSameType && isTotalNominalMatch) {
      similarityLevel = 'sedang';
      matchScore = 50;
      reason = `Jenis Pengajuan (${existing.jenisPengajuan}) & Total Nominal (Rp ${effectiveNominal.toLocaleString('id-ID')}) sama persis`;
    }

    if (isSameDate) {
      matchScore = Math.min(100, matchScore + 5);
      reason += ` pada tanggal yang sama (${existing.tanggal})`;
    }

    matches.push({
      submission: existing,
      reason,
      matchedNominal: effectiveNominal,
      matchScore,
      similarityLevel,
      matchedFactors: {
        sameName: isSameName,
        sameType: isSameType,
        sameContent: isSameContent,
        sameNominal: isTotalNominalMatch || isItemLevelMatch,
        sameDate: isSameDate,
        matchedRecipientName: existing.dibayarkanKepada,
        matchedTypeName: existing.jenisPengajuan,
        matchedContentSnippet: matchedItemSnippet || existing.notes
      },
      matchedLabels,
      itemSnippet: matchedItemSnippet
    });
  }

  // Sort by matchScore descending, then by existing date descending
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

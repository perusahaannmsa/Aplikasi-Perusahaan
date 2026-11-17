import { MonthlyExecutionRecord, MonthlyRecurringTransaction, Submission } from '../types';

export const STORAGE_KEY_MONTHLY_TRANSACTIONS = 'nmsa_monthly_transactions_v1';

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const STOPWORDS = new Set([
  'biaya',
  'pembayaran',
  'bayar',
  'tagihan',
  'rutin',
  'bulanan',
  'kantor',
  'pusat',
  'dana',
  'kas',
  'bank',
  'uang',
  'pt',
  'cv',
  'tbk',
  'jasa',
  'perusahaan',
  'keperluan',
  'operasional',
  'administrasi',
  'dan',
  'atau',
  'untuk',
  'dari',
  'bulan',
]);

export interface JakartaTodayParts {
  year: number;
  month: number;
  day: number;
  monthKey: string; // YYYY-MM
  dateStr: string; // YYYY-MM-DD
}

export function getJakartaTodayParts(now: Date = new Date()): JakartaTodayParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = fmt.format(now); // YYYY-MM-DD
  const [yStr, mStr, dStr] = dateStr.split('-');
  return {
    year: Number(yStr) || now.getFullYear(),
    month: Number(mStr) || now.getMonth() + 1,
    day: Number(dStr) || now.getDate(),
    monthKey: `${yStr}-${mStr}`,
    dateStr,
  };
}

export function formatMonthKeyIndonesian(monthKey: string): string {
  const [y, m] = String(monthKey || '').split('-');
  const mIdx = Number(m) - 1;
  if (mIdx >= 0 && mIdx < 12 && y) {
    return `${MONTH_NAMES_ID[mIdx]} ${y}`;
  }
  return monthKey;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [yStr, mStr] = String(monthKey || '').split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = (Number(mStr) || new Date().getMonth() + 1) - 1;
  const dt = new Date(y, m + deltaMonths, 1);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

export function getSubmissionTotalAmount(sub: Submission): number {
  if (!sub) return 0;
  if (Array.isArray(sub.items) && sub.items.length > 0) {
    return sub.items.reduce((sum, it) => sum + (Number(it.total) || Number(it.nominal) || 0), 0);
  }
  return Number((sub as any).totalNominal || (sub as any).total || 0);
}

function normalizeSearchText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMeaningfulTokens(raw: string): string[] {
  return normalizeSearchText(raw)
    .split(' ')
    .filter((tok) => tok.length >= 3 && !STOPWORDS.has(tok));
}

export function buildAutoKeywords(title: string, recipient: string, category: string): string[] {
  const combined = [
    ...extractMeaningfulTokens(title),
    ...extractMeaningfulTokens(recipient),
    ...extractMeaningfulTokens(category),
  ];
  return Array.from(new Set(combined)).slice(0, 8);
}

export function getSubmissionSearchHaystack(sub: Submission): string {
  const itemsText = Array.isArray(sub.items)
    ? sub.items.map((it) => `${it.item || ''} ${it.keterangan || ''}`).join(' ')
    : '';
  return normalizeSearchText(
    `${sub.jenisPengajuan || ''} ${sub.dibayarkanKepada || ''} ${sub.notes || ''} ${itemsText} ${sub.kode || ''}`
  );
}

export function doesSubmissionMatchRecurring(
  sub: Submission,
  item: MonthlyRecurringTransaction
): { matched: boolean; reason: string; score: number } {
  if (!sub || !item) return { matched: false, reason: '', score: 0 };

  if (sub.recurringTemplateId && sub.recurringTemplateId === item.id) {
    return { matched: true, reason: 'Terhubung langsung ke jadwal bulanan', score: 100 };
  }

  const haystack = getSubmissionSearchHaystack(sub);
  if (!haystack) return { matched: false, reason: '', score: 0 };

  // 1. Check explicit custom keywords defined by user
  const keywords = (Array.isArray(item.matchKeywords) ? item.matchKeywords : [])
    .map((k) => normalizeSearchText(k))
    .filter((k) => k.length >= 2);

  const matchedKeywords = keywords.filter((kw) => haystack.includes(kw));
  if (matchedKeywords.length > 0) {
    return {
      matched: true,
      reason: `Cocok kata kunci: ${matchedKeywords.slice(0, 3).join(', ')}`,
      score: 50 + matchedKeywords.length * 10,
    };
  }

  // 2. Check strong overlap on recipient + title meaningful tokens
  const titleTokens = extractMeaningfulTokens(item.title);
  const recipientTokens = extractMeaningfulTokens(item.recipient);

  const recipHits = recipientTokens.filter((t) => haystack.includes(t));
  const titleHits = titleTokens.filter((t) => haystack.includes(t));

  if (recipientTokens.length > 0 && recipHits.length === recipientTokens.length && recipHits.length >= 1) {
    return {
      matched: true,
      reason: `Cocok penerima: ${item.recipient}`,
      score: 40 + recipHits.length * 5,
    };
  }

  if (titleTokens.length >= 2 && titleHits.length >= 2) {
    return {
      matched: true,
      reason: `Cocok judul: ${titleHits.slice(0, 2).join(' ')}`,
      score: 35 + titleHits.length * 5,
    };
  }

  if (titleTokens.length === 1 && titleHits.length === 1 && titleHits[0].length >= 4) {
    return {
      matched: true,
      reason: `Cocok nama transaksi: ${titleHits[0]}`,
      score: 30,
    };
  }

  return { matched: false, reason: '', score: 0 };
}

export type MonthlyDetectedState = 'executed' | 'due_soon' | 'overdue' | 'upcoming' | 'paused';

export interface MonthlyDetectionResult {
  state: MonthlyDetectedState;
  isExecuted: boolean;
  isManuallyMarked: boolean;
  matchedSubmission: Submission | null;
  matchReason: string;
  manualRecord: MonthlyExecutionRecord | null;
  dueDay: number;
  dueDateStr: string; // YYYY-MM-DD
  daysRemaining: number; // Negative = overdue days
  actualAmount: number;
  voucherStatus?: Submission['status'];
}

export function detectMonthlyExecutionForMonth(
  item: MonthlyRecurringTransaction,
  targetMonth: string,
  submissions: Submission[],
  activeCompanyId?: string,
  todayOverride?: JakartaTodayParts
): MonthlyDetectionResult {
  const today = todayOverride || getJakartaTodayParts();
  const dueDay = Math.min(28, Math.max(1, Number(item.dueDay) || 15));
  const dueDateStr = `${targetMonth}-${String(dueDay).padStart(2, '0')}`;

  // Filter submissions inside targetMonth and company scope
  const monthSubmissions = (submissions || []).filter((sub) => {
    if (!sub) return false;
    const subCompany = (sub.companyId || activeCompanyId || 'nmsa').toLowerCase().trim();
    const targetCompany = (item.companyId || activeCompanyId || 'nmsa').toLowerCase().trim();
    if (activeCompanyId && sub.companyId && subCompany !== targetCompany) {
      return false;
    }
    if (sub.recurringTemplateId === item.id && sub.recurringMonth === targetMonth) {
      return true;
    }
    return String(sub.tanggal || '').startsWith(targetMonth);
  });

  const savedRec = item.paidMonths?.[targetMonth] || null;
  let matchedSub: Submission | null = null;
  let matchReason = '';

  // 1. Explicit submission link saved inside paidMonths
  if (savedRec?.submissionId) {
    matchedSub =
      (submissions || []).find((s) => s.id === savedRec.submissionId) || null;
    if (matchedSub) {
      matchReason = `Tertaut ke Voucher ${matchedSub.kode}`;
    }
  }

  // 2. Direct recurringTemplateId match on submissions
  if (!matchedSub) {
    const directSub = monthSubmissions.find((s) => s.recurringTemplateId === item.id);
    if (directSub) {
      matchedSub = directSub;
      matchReason = `Dibuat langsung dari Transaksi Bulanan (${directSub.kode})`;
    }
  }

  // 3. Smart automatic keyword/recipient/title detection in monthSubmissions
  if (!matchedSub && item.isActive !== false) {
    let bestScore = 0;
    for (const sub of monthSubmissions) {
      const check = doesSubmissionMatchRecurring(sub, item);
      if (check.matched && check.score > bestScore) {
        bestScore = check.score;
        matchedSub = sub;
        matchReason = `Terdeteksi otomatis (${check.reason})`;
      }
    }
  }

  const isManuallyMarked = Boolean(savedRec && savedRec.status === 'paid' && savedRec.markedManually);
  const isExecuted = Boolean(matchedSub || isManuallyMarked);

  // Days calculation relative to Jakarta today
  const diffDays =
    targetMonth === today.monthKey
      ? dueDay - today.day
      : targetMonth < today.monthKey
      ? -1
      : 30;

  let state: MonthlyDetectedState = 'due_soon';
  if (!item.isActive && !isExecuted) {
    state = 'paused';
  } else if (isExecuted) {
    state = 'executed';
  } else if (targetMonth > today.monthKey) {
    state = 'upcoming';
  } else if (targetMonth < today.monthKey || (targetMonth === today.monthKey && today.day > dueDay)) {
    state = 'overdue';
  } else {
    state = 'due_soon';
  }

  const actualAmount = matchedSub
    ? getSubmissionTotalAmount(matchedSub)
    : Number(savedRec?.amount || item.defaultAmount || 0);

  return {
    state,
    isExecuted,
    isManuallyMarked,
    matchedSubmission: matchedSub,
    matchReason: matchReason || (isManuallyMarked ? 'Ditandai selesai manual' : ''),
    manualRecord: savedRec,
    dueDay,
    dueDateStr,
    daysRemaining: diffDays,
    actualAmount,
    voucherStatus: matchedSub?.status,
  };
}

export interface PendingMonthlySummary {
  monthKey: string;
  monthLabel: string;
  totalActive: number;
  executedCount: number;
  pendingCount: number;
  overdueCount: number;
  dueSoonCount: number;
  pendingTotalEstimated: number;
  pendingItems: Array<{
    item: MonthlyRecurringTransaction;
    detection: MonthlyDetectionResult;
  }>;
}

export function getPendingMonthlySummary(
  items: MonthlyRecurringTransaction[],
  submissions: Submission[],
  activeCompanyId?: string,
  targetMonth?: string
): PendingMonthlySummary {
  const today = getJakartaTodayParts();
  const monthKey = targetMonth || today.monthKey;
  const cleanCompany = (activeCompanyId || 'nmsa').toLowerCase().trim();

  const scopedItems = (items || []).filter((item) => {
    if (!item || item.isActive === false) return false;
    if (item.companyId && item.companyId.toLowerCase().trim() !== cleanCompany) return false;
    if (item.startMonth && item.startMonth > monthKey) return false;
    return true;
  });

  let executedCount = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;
  let pendingTotalEstimated = 0;
  const pendingItems: Array<{
    item: MonthlyRecurringTransaction;
    detection: MonthlyDetectionResult;
  }> = [];

  for (const item of scopedItems) {
    const detection = detectMonthlyExecutionForMonth(item, monthKey, submissions, activeCompanyId, today);
    if (detection.isExecuted) {
      executedCount++;
    } else {
      if (detection.state === 'overdue') overdueCount++;
      else dueSoonCount++;
      pendingTotalEstimated += Number(item.defaultAmount) || 0;
      pendingItems.push({ item, detection });
    }
  }

  pendingItems.sort((a, b) => a.detection.dueDay - b.detection.dueDay);

  return {
    monthKey,
    monthLabel: formatMonthKeyIndonesian(monthKey),
    totalActive: scopedItems.length,
    executedCount,
    pendingCount: pendingItems.length,
    overdueCount,
    dueSoonCount,
    pendingTotalEstimated,
    pendingItems,
  };
}

export const MONTHLY_TRANSACTION_PRESETS: Array<
  Pick<MonthlyRecurringTransaction, 'title' | 'category' | 'recipient' | 'defaultAmount' | 'paymentMethod' | 'dueDay' | 'matchKeywords' | 'notes'>
> = [
  {
    title: 'Gaji Karyawan & Operasional',
    category: 'Biaya Gaji',
    recipient: 'Karyawan',
    defaultAmount: 0,
    paymentMethod: 'Cek/Transfer',
    dueDay: 15,
    matchKeywords: ['gaji', 'payroll', 'salary', 'upah'],
    notes: 'Pembayaran gaji rutin setiap bulan sebelum tanggal 15',
  },
  {
    title: 'Tagihan Listrik PLN Kantor',
    category: 'Biaya Operasional',
    recipient: 'PT PLN (Persero)',
    defaultAmount: 0,
    paymentMethod: 'Cek/Transfer',
    dueDay: 15,
    matchKeywords: ['listrik', 'pln', 'token'],
    notes: 'Tagihan listrik bulanan kantor sebelum jatuh tempo tgl 15',
  },
  {
    title: 'Internet & WiFi Kantor',
    category: 'Biaya Operasional',
    recipient: 'Provider Internet',
    defaultAmount: 0,
    paymentMethod: 'Cek/Transfer',
    dueDay: 15,
    matchKeywords: ['internet', 'wifi', 'indihome', 'biznet', 'telkom', 'isp'],
    notes: 'Langganan internet kantor bulanan',
  },
  {
    title: 'BPJS Kesehatan & Ketenagakerjaan',
    category: 'Biaya Gaji',
    recipient: 'BPJS',
    defaultAmount: 0,
    paymentMethod: 'Cek/Transfer',
    dueDay: 15,
    matchKeywords: ['bpjs', 'ketenagakerjaan', 'kesehatan'],
    notes: 'Iuran BPJS karyawan sebelum tgl 15',
  },
  {
    title: 'Sewa Kantor / Gedung',
    category: 'Biaya Operasional',
    recipient: 'Pengelola Gedung',
    defaultAmount: 0,
    paymentMethod: 'Cek/Transfer',
    dueDay: 15,
    matchKeywords: ['sewa', 'gedung', 'service charge', 'ipl'],
    notes: 'Biaya sewa atau service charge gedung bulanan',
  },
  {
    title: 'Tagihan Air PDAM & Kebersihan',
    category: 'Biaya Operasional',
    recipient: 'PDAM / Pengelola',
    defaultAmount: 0,
    paymentMethod: 'Cek/Transfer',
    dueDay: 15,
    matchKeywords: ['pdam', 'air', 'kebersihan', 'keamanan'],
    notes: 'Pembayaran air bersih & retribusi kebersihan bulanan',
  },
];

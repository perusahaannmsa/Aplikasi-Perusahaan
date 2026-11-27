import React, { useEffect, useMemo, useState } from 'react';
import {
  AgendaItem,
  MonthlyRecurringTransaction,
  Submission,
} from '../types';
import {
  MONTHLY_TRANSACTION_PRESETS,
  MonthlyDetectionResult,
  buildAutoKeywords,
  detectMonthlyExecutionForMonth,
  formatMonthKeyIndonesian,
  getJakartaTodayParts,
  getSubmissionTotalAmount,
  isSubmissionSettledForMonthly,
  shiftMonthKey,
} from '../utils/monthlyTransactions';
import {
  calculateTaxDueDate,
  isExplicitBuktiPotongInvoice,
} from '../utils/agendaTaxSync';
import { AgendaManager } from './AgendaManager';
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  FileCheck2,
  FileText,
  Link2,
  PauseCircle,
  PlayCircle,
  Plus,
  Receipt,
  Repeat,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Unlink,
  Upload,
  X,
  AlertTriangle,
} from 'lucide-react';

interface MonthlyTransactionsManagerProps {
  items: MonthlyRecurringTransaction[];
  submissions: Submission[];
  activeCompanyId?: string;
  userProfile?: any;
  onSaveItems: (updated: MonthlyRecurringTransaction[], deletedId?: string) => void;
  onCreateVoucher: (item: MonthlyRecurringTransaction, targetMonth: string) => void;
  onViewVoucher: (submission: Submission) => void;
  onUploadPaymentProof?: (submission: Submission) => void;
  onUpdateSubmission?: (submission: Submission) => Promise<void> | void;
  onOpenPph23View?: () => void;
  onBackToList: () => void;
  agendaItems?: AgendaItem[];
  onSaveAgendaItems?: (items: AgendaItem[]) => void;
  initialSubTab?: 'recurring' | 'bupot_djp' | 'agenda';
  onSubTabChange?: (tab: 'recurring' | 'bupot_djp' | 'agenda') => void;
}

const DEFAULT_CATEGORIES = [
  'Biaya Gaji',
  'Biaya Operasional',
  'Perlengkapan Kantor',
  'Pemeliharaan AC',
  'Transportasi',
  'Petty Cash Kantor Pusat',
  'Petty Cash Lapangan',
  'Biaya Perjalanan Dinas (SPPD)',
  'Pinjaman Perusahaan',
  'Hutang Pihak Ketiga',
];

const formatRupiah = (val: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val || 0);

interface FormState {
  id?: string;
  title: string;
  category: string;
  recipient: string;
  defaultAmount: string;
  paymentMethod: 'Cek/Transfer' | 'Tunai';
  dueDay: number;
  keywordsText: string;
  notes: string;
  isActive: boolean;
}

export const MonthlyTransactionsManager: React.FC<MonthlyTransactionsManagerProps> = ({
  items,
  submissions,
  activeCompanyId = 'nmsa',
  userProfile,
  onSaveItems,
  onCreateVoucher,
  onViewVoucher,
  onUploadPaymentProof,
  onUpdateSubmission,
  onOpenPph23View,
  onBackToList,
  agendaItems = [],
  onSaveAgendaItems,
  initialSubTab = 'recurring',
  onSubTabChange,
}) => {
  const today = useMemo(() => getJakartaTodayParts(), []);
  const [activeSubTab, setActiveSubTab] = useState<'recurring' | 'bupot_djp' | 'agenda'>(initialSubTab);
  const [selectedMonth, setSelectedMonth] = useState<string>(today.monthKey);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'executed' | 'overdue' | 'paused'>('all');

  // States for DJP Bukti Potong (< Tgl 5) sub-tab
  const [bupotSearchQuery, setBupotSearchQuery] = useState('');
  const [bupotStatusFilter, setBupotStatusFilter] = useState<'all' | 'pending' | 'reported'>('all');
  const [bupotPeriodFilter, setBupotPeriodFilter] = useState<string>('ALL');
  const [editingBupotId, setEditingBupotId] = useState<string | null>(null);
  const [bupotNumberDraft, setBupotNumberDraft] = useState<string>('');
  const [bupotNoteDraft, setBupotNoteDraft] = useState<string>('');
  const [savingBupotId, setSavingBupotId] = useState<string | null>(null);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  const handleSwitchSubTab = (tab: 'recurring' | 'bupot_djp' | 'agenda') => {
    setActiveSubTab(tab);
    onSubTabChange?.(tab);
  };

  const agendaDueCount = useMemo(
    () => (agendaItems || []).filter((it) => it.status === 'pending' && it.dueDate <= today.dateStr).length,
    [agendaItems, today.dateStr]
  );

  // Add / Edit Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<FormState>({
    title: '',
    category: 'Biaya Operasional',
    recipient: '',
    defaultAmount: '',
    paymentMethod: 'Cek/Transfer',
    dueDay: 15,
    keywordsText: '',
    notes: '',
    isActive: true,
  });
  const [formError, setFormError] = useState('');

  // Link existing voucher modal state
  const [linkTargetItem, setLinkTargetItem] = useState<MonthlyRecurringTransaction | null>(null);
  const [linkSearch, setLinkSearch] = useState('');

  // Inline delete confirm ID
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const cleanCompany = (activeCompanyId || userProfile?.companyId || 'nmsa').toLowerCase().trim();

  // Strict explicit opt-in & forward-only DJP Bukti Potong (< Tgl 5 bulan berikutnya) invoices
  const explicitDjpInvoices = useMemo(() => {
    return (submissions || [])
      .filter((sub) => {
        if (!isExplicitBuktiPotongInvoice(sub)) return false;
        const sc = (sub.companyId || cleanCompany).toLowerCase().trim();
        if (sub.companyId && sc !== cleanCompany) return false;
        return true;
      })
      .map((sub) => {
        const taxDue = calculateTaxDueDate(sub.tanggal);
        const isReported = Boolean(sub.djpReported);
        const todayMs = Date.parse(`${today.dateStr}T00:00:00Z`) || Date.now();
        const dueMs = Date.parse(`${taxDue.dueDate}T00:00:00Z`) || todayMs;
        const daysLeft = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
        const isOverdue = !isReported && today.dateStr >= taxDue.dueDate;
        const isDueSoon = !isReported && !isOverdue && daysLeft <= 7;
        return {
          sub,
          taxDue,
          isReported,
          daysLeft,
          isOverdue,
          isDueSoon,
          amount:
            typeof sub.invoiceAmount === 'number' && sub.invoiceAmount > 0
              ? sub.invoiceAmount
              : getSubmissionTotalAmount(sub),
        };
      })
      .sort((a, b) => {
        if (a.isReported !== b.isReported) return a.isReported ? 1 : -1;
        return a.taxDue.dueDate.localeCompare(b.taxDue.dueDate) || String(b.sub.tanggal || '').localeCompare(String(a.sub.tanggal || ''));
      });
  }, [submissions, cleanCompany, today.dateStr]);

  const bupotStats = useMemo(() => {
    const total = explicitDjpInvoices.length;
    const reported = explicitDjpInvoices.filter((x) => x.isReported).length;
    const pending = total - reported;
    const overdue = explicitDjpInvoices.filter((x) => x.isOverdue).length;
    return { total, reported, pending, overdue };
  }, [explicitDjpInvoices]);

  const bupotAvailablePeriods = useMemo(() => {
    const periods = new Set<string>();
    explicitDjpInvoices.forEach((x) => periods.add(x.taxDue.taxPeriod));
    return Array.from(periods).sort().reverse();
  }, [explicitDjpInvoices]);

  const filteredDjpInvoices = useMemo(() => {
    const q = bupotSearchQuery.trim().toLowerCase();
    return explicitDjpInvoices.filter((entry) => {
      if (bupotPeriodFilter !== 'ALL' && entry.taxDue.taxPeriod !== bupotPeriodFilter) return false;
      if (bupotStatusFilter === 'pending' && entry.isReported) return false;
      if (bupotStatusFilter === 'reported' && !entry.isReported) return false;
      if (!q) return true;
      const hay = `${entry.sub.kode || ''} ${entry.sub.invoiceNumber || ''} ${entry.sub.dibayarkanKepada || ''} ${entry.sub.bupotNumber || ''} ${entry.sub.notes || ''} ${entry.taxDue.monthName} ${entry.taxDue.nextMonthName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [explicitDjpInvoices, bupotPeriodFilter, bupotStatusFilter, bupotSearchQuery]);

  const handleToggleDjpReported = async (
    entry: (typeof explicitDjpInvoices)[number],
    customBupotNumber?: string,
    customNote?: string
  ) => {
    if (!onUpdateSubmission) return;
    const { sub, taxDue } = entry;
    setSavingBupotId(sub.id);
    try {
      const nextReported = customBupotNumber !== undefined ? true : !sub.djpReported;
      const nowIso = new Date().toISOString();
      const updatedSub: Submission = {
        ...sub,
        djpReported: nextReported,
        djpReportedAt: nextReported ? nowIso : undefined,
        djpReportedBy: nextReported ? (userProfile?.fullName || 'Nur Wahyudi') : undefined,
        ...(customBupotNumber !== undefined ? { bupotNumber: customBupotNumber.trim() || sub.bupotNumber } : {}),
        ...(customNote !== undefined ? { djpReportNote: customNote.trim() || undefined } : {}),
        bupotStatus: nextReported ? 'Sudah Bupot' : (sub.bupotNumber ? 'Siap Lapor Coretax' : 'Belum Bupot'),
        updatedAt: nowIso,
      };
      await onUpdateSubmission(updatedSub);

      // Sync corresponding tax period agenda item status if all explicit invoices in that period are reported
      if (onSaveAgendaItems && agendaItems.length > 0) {
        const samePeriodInvoices = explicitDjpInvoices.filter((x) => x.taxDue.taxPeriod === taxDue.taxPeriod);
        const allPeriodDone = samePeriodInvoices.every((x) =>
          x.sub.id === sub.id ? nextReported : x.isReported
        );
        let changed = false;
        const nextAgenda = agendaItems.map((ag) => {
          if (ag.category === 'Pajak' && ag.taxPeriod === taxDue.taxPeriod) {
            const desiredStatus = allPeriodDone ? 'completed' : 'pending';
            if (ag.status !== desiredStatus) {
              changed = true;
              return {
                ...ag,
                status: desiredStatus as 'pending' | 'completed',
                completedAt: desiredStatus === 'completed' ? nowIso : undefined,
                completedBy: desiredStatus === 'completed' ? (userProfile?.fullName || 'Nur Wahyudi') : undefined,
                updatedAt: nowIso,
              };
            }
          }
          return ag;
        });
        if (changed) {
          onSaveAgendaItems(nextAgenda);
        }
      }
      setEditingBupotId(null);
    } finally {
      setSavingBupotId(null);
    }
  };

  const companyItems = useMemo(() => {
    return (items || []).filter((item) => {
      if (!item) return false;
      if (item.companyId && item.companyId.toLowerCase().trim() !== cleanCompany) return false;
      return true;
    });
  }, [items, cleanCompany]);

  const enrichedItems = useMemo(() => {
    return companyItems
      .map((item) => {
        const detection = detectMonthlyExecutionForMonth(
          item,
          selectedMonth,
          submissions,
          cleanCompany,
          today
        );
        return { item, detection };
      })
      .sort((a, b) => {
        const rank = (d: MonthlyDetectionResult) => {
          if (d.state === 'overdue') return 0;
          if (d.state === 'due_soon') return 1;
          if (d.state === 'upcoming') return 2;
          if (d.state === 'executed') return 3;
          return 4;
        };
        const diff = rank(a.detection) - rank(b.detection);
        if (diff !== 0) return diff;
        return a.detection.dueDay - b.detection.dueDay;
      });
  }, [companyItems, selectedMonth, submissions, cleanCompany, today]);

  const stats = useMemo(() => {
    let totalActive = 0;
    let executedCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let estimatedTotal = 0;
    let realizedTotal = 0;

    for (const { item, detection } of enrichedItems) {
      if (item.isActive === false) continue;
      totalActive++;
      estimatedTotal += Number(item.defaultAmount) || 0;
      if (detection.isExecuted) {
        executedCount++;
        realizedTotal += detection.actualAmount || 0;
      } else {
        pendingCount++;
        if (detection.state === 'overdue') {
          overdueCount++;
        }
      }
    }

    return {
      totalActive,
      executedCount,
      pendingCount,
      overdueCount,
      estimatedTotal,
      realizedTotal,
    };
  }, [enrichedItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedItems.filter(({ item, detection }) => {
      if (statusFilter === 'pending' && (detection.isExecuted || item.isActive === false)) return false;
      if (statusFilter === 'executed' && !detection.isExecuted) return false;
      if (statusFilter === 'overdue' && detection.state !== 'overdue') return false;
      if (statusFilter === 'paused' && item.isActive !== false) return false;

      if (!q) return true;
      const hay = `${item.title} ${item.category} ${item.recipient} ${(item.matchKeywords || []).join(' ')} ${detection.matchedSubmission?.kode || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [enrichedItems, statusFilter, searchQuery]);

  // Candidate vouchers for linking to selected item
  const candidateVouchers = useMemo(() => {
    if (!linkTargetItem) return [];
    const q = linkSearch.trim().toLowerCase();
    return (submissions || [])
      .filter((s) => {
        if (!s) return false;
        const sc = (s.companyId || cleanCompany).toLowerCase().trim();
        if (s.companyId && sc !== cleanCompany) return false;
        if (!q) return String(s.tanggal || '').startsWith(selectedMonth);
        const hay = `${s.kode || ''} ${s.jenisPengajuan || ''} ${s.dibayarkanKepada || ''} ${s.tanggal || ''} ${s.notes || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')))
      .slice(0, 30);
  }, [linkTargetItem, linkSearch, submissions, cleanCompany, selectedMonth]);

  const openAddModal = (preset?: (typeof MONTHLY_TRANSACTION_PRESETS)[number]) => {
    setFormError('');
    if (preset) {
      setFormState({
        title: preset.title,
        category: preset.category,
        recipient: preset.recipient,
        defaultAmount: preset.defaultAmount > 0 ? String(preset.defaultAmount) : '',
        paymentMethod: preset.paymentMethod || 'Cek/Transfer',
        dueDay: preset.dueDay || 15,
        keywordsText: (preset.matchKeywords || []).join(', '),
        notes: preset.notes || '',
        isActive: true,
      });
    } else {
      setFormState({
        title: '',
        category: 'Biaya Operasional',
        recipient: '',
        defaultAmount: '',
        paymentMethod: 'Cek/Transfer',
        dueDay: 15,
        keywordsText: '',
        notes: '',
        isActive: true,
      });
    }
    setIsFormOpen(true);
  };

  const openEditModal = (item: MonthlyRecurringTransaction) => {
    setFormError('');
    setFormState({
      id: item.id,
      title: item.title,
      category: item.category || 'Biaya Operasional',
      recipient: item.recipient || '',
      defaultAmount: item.defaultAmount ? String(item.defaultAmount) : '',
      paymentMethod: item.paymentMethod || 'Cek/Transfer',
      dueDay: Math.min(28, Math.max(1, Number(item.dueDay) || 15)),
      keywordsText: (item.matchKeywords || []).join(', '),
      notes: item.notes || '',
      isActive: item.isActive !== false,
    });
    setIsFormOpen(true);
  };

  const handleQuickAddPreset = (preset: (typeof MONTHLY_TRANSACTION_PRESETS)[number]) => {
    const nowIso = new Date().toISOString();
    const newItem: MonthlyRecurringTransaction = {
      id: `mrec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      companyId: cleanCompany,
      title: preset.title,
      category: preset.category,
      recipient: preset.recipient,
      defaultAmount: preset.defaultAmount || 0,
      paymentMethod: preset.paymentMethod || 'Cek/Transfer',
      dueDay: preset.dueDay || 15,
      isActive: true,
      startMonth: selectedMonth,
      matchKeywords: preset.matchKeywords,
      notes: preset.notes,
      paidMonths: {},
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    onSaveItems([newItem, ...items]);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const title = formState.title.trim();
    if (!title) {
      setFormError('Nama transaksi bulanan wajib diisi.');
      return;
    }
    const dueDay = Math.min(28, Math.max(1, Number(formState.dueDay) || 15));
    const parsedAmount = Number(String(formState.defaultAmount).replace(/[^0-9.-]/g, '')) || 0;
    const rawKeywords = formState.keywordsText
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const matchKeywords =
      rawKeywords.length > 0
        ? Array.from(new Set(rawKeywords))
        : buildAutoKeywords(title, formState.recipient, formState.category);

    const nowIso = new Date().toISOString();

    if (formState.id) {
      const updated = items.map((it) =>
        it.id === formState.id
          ? {
              ...it,
              title,
              category: formState.category.trim() || 'Biaya Operasional',
              recipient: formState.recipient.trim() || '-',
              defaultAmount: parsedAmount,
              paymentMethod: formState.paymentMethod,
              dueDay,
              matchKeywords,
              notes: formState.notes.trim(),
              isActive: formState.isActive,
              updatedAt: nowIso,
            }
          : it
      );
      onSaveItems(updated);
    } else {
      const newItem: MonthlyRecurringTransaction = {
        id: `mrec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        companyId: cleanCompany,
        title,
        category: formState.category.trim() || 'Biaya Operasional',
        recipient: formState.recipient.trim() || '-',
        defaultAmount: parsedAmount,
        paymentMethod: formState.paymentMethod,
        dueDay,
        isActive: formState.isActive,
        startMonth: selectedMonth <= today.monthKey ? selectedMonth : today.monthKey,
        matchKeywords,
        notes: formState.notes.trim(),
        paidMonths: {},
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      onSaveItems([newItem, ...items]);
    }
    setIsFormOpen(false);
  };

  const handleToggleActive = (item: MonthlyRecurringTransaction) => {
    const updated = items.map((it) =>
      it.id === item.id
        ? { ...it, isActive: it.isActive === false, updatedAt: new Date().toISOString() }
        : it
    );
    onSaveItems(updated);
  };

  const handleDeleteItem = (id: string) => {
    const updated = items.filter((it) => it.id !== id);
    setConfirmDeleteId(null);
    onSaveItems(updated, id);
  };

  const handleToggleManualComplete = (
    item: MonthlyRecurringTransaction,
    detection: MonthlyDetectionResult
  ) => {
    const nextPaidMonths = { ...(item.paidMonths || {}) };
    if (detection.isManuallyMarked || detection.manualRecord?.submissionId) {
      delete nextPaidMonths[selectedMonth];
    } else {
      nextPaidMonths[selectedMonth] = {
        monthKey: selectedMonth,
        status: 'paid',
        paidAt: detection.matchedSubmission?.tanggal || today.dateStr,
        submissionId: detection.matchedSubmission?.id,
        submissionCode: detection.matchedSubmission?.kode,
        amount: detection.actualAmount || item.defaultAmount || 0,
        markedManually: !detection.matchedSubmission,
      };
    }
    const updated = items.map((it) =>
      it.id === item.id
        ? { ...it, paidMonths: nextPaidMonths, updatedAt: new Date().toISOString() }
        : it
    );
    onSaveItems(updated);
  };

  const handleBindVoucherToMonth = (sub: Submission) => {
    if (!linkTargetItem) return;
    const nextPaidMonths = { ...(linkTargetItem.paidMonths || {}) };
    const settled = isSubmissionSettledForMonthly(sub);
    nextPaidMonths[selectedMonth] = {
      monthKey: selectedMonth,
      status: settled ? 'paid' : 'pending',
      paidAt: sub.tanggal || today.dateStr,
      submissionId: sub.id,
      submissionCode: sub.kode,
      amount: getSubmissionTotalAmount(sub),
      markedManually: false,
    };
    const updated = items.map((it) =>
      it.id === linkTargetItem.id
        ? { ...it, paidMonths: nextPaidMonths, updatedAt: new Date().toISOString() }
        : it
    );
    onSaveItems(updated);
    setLinkTargetItem(null);
    setLinkSearch('');
  };

  const handleUnbindMonth = (item: MonthlyRecurringTransaction) => {
    const nextPaidMonths = { ...(item.paidMonths || {}) };
    delete nextPaidMonths[selectedMonth];
    const updated = items.map((it) =>
      it.id === item.id
        ? { ...it, paidMonths: nextPaidMonths, updatedAt: new Date().toISOString() }
        : it
    );
    onSaveItems(updated);
  };

  const getStatusBadge = (detection: MonthlyDetectionResult) => {
    switch (detection.state) {
      case 'executed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
            <CheckCircle2 size={13} />
            {detection.hasPaymentProof ? 'Sudah Dibayar (Ada Bukti)' : 'Sudah Dijalankan'}
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-bold">
            <AlertTriangle size={13} />
            {detection.hasUnpaidVoucher
              ? `Lewat Tgl ${detection.dueDay} · Belum Lunas`
              : `Lewat Tgl ${detection.dueDay}`}
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 text-stone-600 border border-stone-200 text-[11px] font-bold">
            <PauseCircle size={13} />
            Dijeda
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-bold">
            <CalendarClock size={13} />
            {detection.hasUnpaidVoucher ? 'Voucher Dibuat (Belum Lunas)' : 'Bulan Mendatang'}
          </span>
        );
      case 'due_soon':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">
            <Clock size={13} />
            {detection.hasUnpaidVoucher ? 'Menunggu Bukti Transfer / Lunas' : 'Belum Dibayar'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-3xs space-y-4 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBackToList}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 text-xs font-bold transition cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Kembali ke Dashboard</span>
              </button>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl">
                <Repeat size={12} />
                Siklus Otomatis Bulanan · Batas Sebelum Tgl 15
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight font-display">
              Jadwal Bulanan &amp; Pengingat Agenda
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 max-w-2xl">
              {activeSubTab === 'recurring' ? (
                <>
                  Memantau kewajiban rutin setiap 1 bulan sekali secara berkelanjutan. Sistem mendeteksi otomatis bukti bayar &amp; pelunasan dari{' '}
                  <strong className="text-stone-800">Voucher HO</strong> sebelum tanggal 15.
                </>
              ) : activeSubTab === 'bupot_djp' ? (
                <>
                  Pengingat <strong className="text-rose-700">Wajib Buat &amp; Lapor Bukti Potong DJP</strong> untuk transaksi berjenis Invoice yang Anda tandai mulai sekarang ke depan. Batas pelaporan: <strong className="text-stone-900">sebelum tanggal 5 bulan berikutnya</strong>.
                </>
              ) : (
                <>
                  Pengingat kegiatan kerja, jatuh tempo invoice vendor, rekonsiliasi kas, dan tenggat waktu pajak dalam satu tampilan bulanan.
                </>
              )}
            </p>
          </div>

          {activeSubTab === 'recurring' && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Month Switcher */}
              <div className="inline-flex items-center bg-stone-100 border border-stone-200 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, -1))}
                  className="p-1.5 rounded-lg hover:bg-white text-stone-700 transition cursor-pointer"
                  title="Bulan Sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="px-2.5 text-xs font-bold text-stone-900 min-w-[130px] text-center">
                  {formatMonthKeyIndonesian(selectedMonth)}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, 1))}
                  className="p-1.5 rounded-lg hover:bg-white text-stone-700 transition cursor-pointer"
                  title="Bulan Berikutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {selectedMonth !== today.monthKey && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(today.monthKey)}
                  className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-xs font-bold text-stone-800 transition cursor-pointer"
                >
                  Bulan Ini
                </button>
              )}

              <button
                type="button"
                onClick={() => openAddModal()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs shadow-3xs transition cursor-pointer"
              >
                <Plus size={15} />
                <span>Tambah Transaksi Bulanan</span>
              </button>
            </div>
          )}
        </div>

        {/* Unified Sub-Tab Bar: Transaksi Bulanan + Wajib Bukti Potong DJP + Agenda & Pengingat */}
        <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleSwitchSubTab('recurring')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer border ${
              activeSubTab === 'recurring'
                ? 'bg-amber-500 text-stone-950 border-amber-600 shadow-3xs'
                : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
            }`}
          >
            <CalendarClock size={15} />
            <span>Transaksi Bulanan (&lt; Tgl 15)</span>
            {stats.pendingCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold tabular-nums ${
                activeSubTab === 'recurring'
                  ? 'bg-stone-950 text-amber-300'
                  : stats.overdueCount > 0
                  ? 'bg-rose-600 text-white'
                  : 'bg-amber-200 text-amber-950'
              }`}>
                {stats.pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSwitchSubTab('bupot_djp')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer border ${
              activeSubTab === 'bupot_djp'
                ? 'bg-rose-600 text-white border-rose-700 shadow-3xs'
                : bupotStats.pending > 0
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300'
                : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
            }`}
          >
            <FileCheck2 size={15} />
            <span>Wajib Bukti Potong DJP (&lt; Tgl 5)</span>
            {bupotStats.pending > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold tabular-nums ${
                activeSubTab === 'bupot_djp'
                  ? 'bg-white text-rose-700'
                  : 'bg-rose-600 text-white'
              }`}>
                {bupotStats.pending}
              </span>
            )}
          </button>

          {onSaveAgendaItems && (
            <button
              type="button"
              onClick={() => handleSwitchSubTab('agenda')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer border ${
                activeSubTab === 'agenda'
                  ? 'bg-amber-500 text-stone-950 border-amber-600 shadow-3xs'
                  : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
              }`}
            >
              <CalendarDays size={15} />
              <span>Agenda &amp; Pengingat Tugas</span>
              {agendaDueCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold tabular-nums ${
                  activeSubTab === 'agenda'
                    ? 'bg-stone-950 text-amber-300'
                    : 'bg-rose-600 text-white'
                }`}>
                  {agendaDueCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'agenda' && onSaveAgendaItems ? (
        <AgendaManager
          embedded
          agendaItems={agendaItems}
          onSaveAgendaItems={onSaveAgendaItems}
          submissions={submissions}
          userProfile={userProfile}
          onOpenSubmissionForPrint={onViewVoucher}
          onClose={onBackToList}
        />
      ) : activeSubTab === 'bupot_djp' ? (
        <div className="space-y-4">
          {/* Mandatory DJP Bukti Potong Info & KPI */}
          <div className="bg-gradient-to-r from-rose-950 via-stone-900 to-amber-950 text-white rounded-2xl p-5 border border-rose-800/60 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-200 text-[10px] font-mono font-bold uppercase tracking-wider">
                <ShieldAlert size={12} />
                Sifatnya Wajib · Batas Sebelum Tgl 5 Bulan Berikutnya
              </div>
              <h3 className="text-lg font-black tracking-tight">
                Pengingat Wajib Buat &amp; Lapor Bukti Potong Pajak ke DJP
              </h3>
              <p className="text-xs text-stone-300 max-w-2xl">
                Menampilkan <strong>hanya</strong> transaksi berjenis <strong>Invoice</strong> yang Anda klik <em>&ldquo;Tandai Sebagai Invoice&rdquo;</em> dengan pengingat DJP aktif mulai dari sekarang ke depan. Wajib dibuatkan dan dilaporkan Bukti Potong-nya ke DJP sebelum tanggal 5 bulan berikutnya.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 text-center min-w-[100px]">
                <div className="text-[10px] font-mono text-rose-200 uppercase">Wajib Lapor</div>
                <div className="text-xl font-black text-rose-300 tabular-nums">{bupotStats.pending}</div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 text-center min-w-[100px]">
                <div className="text-[10px] font-mono text-emerald-200 uppercase">Sudah Lapor</div>
                <div className="text-xl font-black text-emerald-300 tabular-nums">{bupotStats.reported}</div>
              </div>
              {onOpenPph23View && (
                <button
                  type="button"
                  onClick={onOpenPph23View}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <Receipt size={14} />
                  <span>Buka Modul PPh 23</span>
                </button>
              )}
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-3xs">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={bupotSearchQuery}
                onChange={(e) => setBupotSearchQuery(e.target.value)}
                placeholder="Cari kode voucher, nomor invoice vendor, nama perusahaan, atau no. bukti potong..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:border-rose-400 outline-none text-xs text-stone-900"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bupotPeriodFilter}
                onChange={(e) => setBupotPeriodFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs font-bold text-stone-800 outline-none cursor-pointer"
              >
                <option value="ALL">Semua Masa Pajak (Mulai Nov 2026)</option>
                {bupotAvailablePeriods.map((p) => (
                  <option key={p} value={p}>
                    Masa Pajak: {formatMonthKeyIndonesian(p)}
                  </option>
                ))}
              </select>

              <select
                value={bupotStatusFilter}
                onChange={(e) => setBupotStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs font-bold text-stone-800 outline-none cursor-pointer"
              >
                <option value="all">Semua Status ({bupotStats.total})</option>
                <option value="pending">Wajib Lapor / Belum ({bupotStats.pending})</option>
                <option value="reported">Sudah Lapor DJP ({bupotStats.reported})</option>
              </select>
            </div>
          </div>

          {/* Invoice DJP List */}
          {filteredDjpInvoices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-10 text-center space-y-2">
              <FileCheck2 size={36} className="mx-auto text-stone-300" />
              <h4 className="text-sm font-black text-stone-800">
                Belum Ada Transaksi Invoice Wajib Bukti Potong DJP
              </h4>
              <p className="text-xs text-stone-500 max-w-lg mx-auto">
                Ketika Anda membuat transaksi Voucher baru dan mengklik <strong>&ldquo;Tandai Sebagai Invoice&rdquo;</strong> dengan pengingat Bukti Potong DJP aktif, transaksinya akan langsung tercatat otomatis di sini untuk dilaporkan sebelum tanggal 5 bulan berikutnya.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDjpInvoices.map((entry) => {
                const { sub, taxDue, isReported, isOverdue, isDueSoon, daysLeft, amount } = entry;
                const isEditingThis = editingBupotId === sub.id;
                const isSavingThis = savingBupotId === sub.id;

                return (
                  <div
                    key={sub.id}
                    className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-3xs transition space-y-3 ${
                      isReported
                        ? 'border-emerald-200 bg-emerald-50/20'
                        : isOverdue
                        ? 'border-rose-300 bg-rose-50/30'
                        : isDueSoon
                        ? 'border-amber-300 bg-amber-50/30'
                        : 'border-stone-200'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {isReported ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase">
                              <CheckCircle2 size={12} />
                              Sudah Lapor DJP
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase">
                              <AlertTriangle size={12} />
                              Wajib Segera Lapor! Batas {taxDue.dueDateFormatted}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-stone-950 text-[10px] font-black uppercase">
                              <Clock size={12} />
                              Wajib Buat &amp; Lapor DJP · {taxDue.dueDateFormatted} ({daysLeft >= 0 ? `H-${daysLeft}` : 'Lewat Batas'})
                            </span>
                          )}

                          <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 font-mono text-[11px] font-bold text-stone-800">
                            {sub.kode || 'HO'}
                          </span>

                          {sub.invoiceNumber && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 font-mono text-[11px] font-bold text-indigo-800">
                              No. Inv: {sub.invoiceNumber}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <h4 className="text-sm sm:text-base font-black text-stone-900">
                            {sub.dibayarkanKepada || 'Vendor'}
                          </h4>
                          <span className="text-xs font-mono font-black text-stone-900">
                            {formatRupiah(amount)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-600">
                          <span>Tanggal Transaksi: <strong>{sub.tanggal}</strong></span>
                          <span>Masa Pajak: <strong>{taxDue.monthName} {taxDue.year}</strong></span>
                          {sub.bupotNumber && (
                            <span className="text-emerald-700 font-mono font-bold">
                              No. Bukti Potong: {sub.bupotNumber}
                            </span>
                          )}
                          {isReported && sub.djpReportedAt && (
                            <span className="text-emerald-700">
                              Dilaporkan: {new Date(sub.djpReportedAt).toLocaleDateString('id-ID')} ({sub.djpReportedBy || 'Keuangan'})
                            </span>
                          )}
                        </div>
                        {sub.djpReportNote && (
                          <div className="text-[11px] text-stone-500 italic">
                            Catatan DJP: {sub.djpReportNote}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onViewVoucher(sub)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold cursor-pointer transition"
                        >
                          <FileText size={13} />
                          <span>Buka Voucher</span>
                        </button>

                        {!isReported && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingThis) {
                                setEditingBupotId(null);
                              } else {
                                setEditingBupotId(sub.id);
                                setBupotNumberDraft(sub.bupotNumber || '');
                                setBupotNoteDraft(sub.djpReportNote || '');
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold cursor-pointer transition"
                          >
                            <Edit3 size={13} />
                            <span>Input No. Bupot</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isSavingThis}
                          onClick={() => handleToggleDjpReported(entry)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer transition shadow-3xs disabled:opacity-50 ${
                            isReported
                              ? 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-300'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          <CheckCircle2 size={14} />
                          <span>
                            {isSavingThis
                              ? 'Menyimpan...'
                              : isReported
                              ? 'Batalkan Status Lapor'
                              : 'Tandai Sudah Lapor DJP'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {isEditingThis && (
                      <div className="pt-3 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                        <div>
                          <label className="block text-[11px] font-bold text-stone-700 mb-1">
                            Nomor Bukti Potong (Coretax DJP)
                          </label>
                          <input
                            type="text"
                            value={bupotNumberDraft}
                            onChange={(e) => setBupotNumberDraft(e.target.value)}
                            placeholder="Contoh: BUPOT-2026-000123"
                            className="w-full px-3 py-1.5 rounded-xl border border-stone-300 bg-white text-xs font-mono text-stone-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-stone-700 mb-1">
                            Catatan Pelaporan (Opsional)
                          </label>
                          <input
                            type="text"
                            value={bupotNoteDraft}
                            onChange={(e) => setBupotNoteDraft(e.target.value)}
                            placeholder="Contoh: Sudah lapor SPT Masa Coretax"
                            className="w-full px-3 py-1.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isSavingThis}
                            onClick={() => handleToggleDjpReported(entry, bupotNumberDraft, bupotNoteDraft)}
                            className="flex-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
                          >
                            Simpan &amp; Tandai Lapor DJP
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingBupotId(null)}
                            className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Strip Pengingat Wajib Bukti Potong DJP (< Tgl 5) di Tab Utama Menu Bulanan */}
      {bupotStats.pending > 0 && (
        <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-white border border-rose-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-600 text-white shrink-0">
              <FileCheck2 size={18} />
            </div>
            <div className="text-xs space-y-0.5">
              <div className="font-black text-rose-950">
                Wajib Buat &amp; Lapor Bukti Potong ke DJP (&lt; Tgl 5 Bulan Berikutnya): {bupotStats.pending} Invoice
              </div>
              <p className="text-[11px] text-stone-700">
                Ada {bupotStats.pending} transaksi Invoice yang sudah Anda tandai dan wajib dilaporkan Bukti Potong-nya ke DJP sebelum tanggal 5 bulan berikutnya.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSwitchSubTab('bupot_djp')}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition cursor-pointer shrink-0"
          >
            Lihat Daftar Bukti Potong DJP &rarr;
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-3xs">
          <div className="text-[11px] font-mono font-bold text-stone-500 uppercase tracking-wider">
            Jadwal Aktif / Bulan
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl sm:text-3xl font-black text-stone-900 tabular-nums">
              {stats.totalActive}
            </span>
            <span className="text-[11px] font-mono text-stone-500 tabular-nums">
              Est. {formatRupiah(stats.estimatedTotal)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-3xs">
          <div className="text-[11px] font-mono font-bold text-emerald-700 uppercase tracking-wider">
            Sudah Dijalankan
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700 tabular-nums">
              {stats.executedCount}
            </span>
            <span className="text-[11px] font-mono text-emerald-700 tabular-nums">
              {formatRupiah(stats.realizedTotal)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-amber-300 p-4 shadow-3xs">
          <div className="text-[11px] font-mono font-bold text-amber-800 uppercase tracking-wider">
            Menunggu Dibayar
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-700 tabular-nums">
              {stats.pendingCount}
            </span>
            <span className="text-[11px] font-mono text-amber-700">
              {selectedMonth === today.monthKey ? `Hari ke-${today.day} WIB` : formatMonthKeyIndonesian(selectedMonth)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-3xs">
          <div className="text-[11px] font-mono font-bold text-rose-700 uppercase tracking-wider">
            Lewat Batas Tgl 15
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl sm:text-3xl font-black text-rose-700 tabular-nums">
              {stats.overdueCount}
            </span>
            <span className="text-[11px] font-mono text-rose-600">
              {stats.overdueCount > 0 ? 'Perlu tindakan segera' : 'Semua aman'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: `Semua (${enrichedItems.length})` },
            { id: 'pending', label: `Belum Dijalankan (${stats.pendingCount})` },
            { id: 'executed', label: `Sudah Dijalankan (${stats.executedCount})` },
            { id: 'overdue', label: `Lewat Jatuh Tempo (${stats.overdueCount})` },
            { id: 'paused', label: `Dijeda` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-stone-900 text-white shadow-3xs'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari tagihan, penerima, kategori..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:border-amber-500 outline-none text-xs text-stone-900"
          />
        </div>
      </div>

      {/* Quick Presets Strip (when user has few items or wants quick templates) */}
      {companyItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 text-center space-y-5 shadow-3xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <CalendarClock size={24} />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h3 className="text-base sm:text-lg font-black text-stone-900">
              Belum Ada Daftar Transaksi Bulanan
            </h3>
            <p className="text-xs sm:text-sm text-stone-500">
              Tambahkan transaksi rutin seperti Gaji, Listrik PLN, Internet, BPJS, atau Sewa Kantor.
              Sistem akan otomatis mengecek Voucher HO setiap bulan dan mengingatkan sebelum tanggal 15.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto">
            {MONTHLY_TRANSACTION_PRESETS.map((preset) => (
              <button
                key={preset.title}
                type="button"
                onClick={() => handleQuickAddPreset(preset)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-amber-100 border border-stone-200 hover:border-amber-300 text-xs font-bold text-stone-800 transition cursor-pointer"
              >
                <Plus size={13} className="text-amber-700" />
                <span>{preset.title}</span>
              </button>
            ))}
          </div>
          <div>
            <button
              type="button"
              onClick={() => openAddModal()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs shadow-3xs transition cursor-pointer"
            >
              <Plus size={15} />
              <span>Buat Transaksi Bulanan Kustom</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-xs sm:text-sm text-stone-500">
              Tidak ada transaksi bulanan yang cocok dengan filter saat ini.
            </div>
          ) : (
            filteredItems.map(({ item, detection }) => {
              const dueText =
                detection.state === 'executed'
                  ? `Tuntas periode ${formatMonthKeyIndonesian(selectedMonth)}`
                  : selectedMonth === today.monthKey
                  ? detection.daysRemaining >= 0
                    ? detection.daysRemaining === 0
                      ? `Batas hari ini (Tgl ${detection.dueDay})`
                      : `H-${detection.daysRemaining} sebelum Tgl ${detection.dueDay}`
                    : `Terlewat ${Math.abs(detection.daysRemaining)} hari dari Tgl ${detection.dueDay}`
                  : `Jatuh tempo Tgl ${detection.dueDay}`;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-3xs transition ${
                    detection.state === 'overdue'
                      ? 'border-rose-300'
                      : detection.state === 'executed'
                      ? 'border-emerald-200'
                      : 'border-stone-200'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left Info */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getStatusBadge(detection)}
                        <span className="text-[11px] font-mono font-bold text-stone-500">
                          {item.category} · {item.paymentMethod || 'Cek/Transfer'}
                        </span>
                        <span className="text-[11px] font-mono text-stone-500">
                          · {dueText}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="text-base font-black text-stone-900">
                          {item.title}
                        </h3>
                        <span className="text-xs font-semibold text-stone-600">
                          Penerima: <strong className="text-stone-800">{item.recipient}</strong>
                        </span>
                      </div>

                      {item.notes && (
                        <p className="text-xs text-stone-500">{item.notes}</p>
                      )}

                      {/* Matched Voucher Detail / Manual Note */}
                      {detection.matchedSubmission ? (
                        <div
                          className={`pt-1 flex flex-wrap items-center gap-2 text-xs ${
                            detection.isExecuted ? 'text-emerald-800' : 'text-amber-800'
                          }`}
                        >
                          <Receipt
                            size={14}
                            className={`shrink-0 ${
                              detection.isExecuted ? 'text-emerald-600' : 'text-amber-600'
                            }`}
                          />
                          <span className="font-bold">
                            Voucher {detection.matchedSubmission.kode}
                          </span>
                          <span className="text-stone-500">
                            ({detection.matchedSubmission.tanggal} · Status:{' '}
                            {detection.matchedSubmission.status || 'Belum Lunas'}
                            {detection.hasPaymentProof ? ' · Bukti Transfer Terlampir' : ''})
                          </span>
                          <span
                            className={`text-[11px] font-mono ${
                              detection.isExecuted ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            — {detection.isExecuted ? detection.matchReason : 'Belum ada bukti transfer / status belum Lunas'}
                          </span>
                          <button
                            type="button"
                            onClick={() => onViewVoucher(detection.matchedSubmission!)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 underline cursor-pointer"
                          >
                            <span>Lihat Voucher</span>
                            <ExternalLink size={12} />
                          </button>
                        </div>
                      ) : detection.isManuallyMarked ? (
                        <div className="pt-1 text-xs text-emerald-700 font-semibold">
                          ✓ Ditandai sudah dijalankan manual pada {detection.manualRecord?.paidAt || selectedMonth}
                        </div>
                      ) : (
                        <div className="pt-1 text-[11px] font-mono text-stone-400">
                          Kata kunci deteksi: {(item.matchKeywords || []).join(', ') || '-'}
                        </div>
                      )}
                    </div>

                    {/* Right Amount & Action Buttons */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 shrink-0">
                      <div className="text-left lg:text-right">
                        <div className="text-[10px] font-mono font-bold text-stone-400 uppercase">
                          {detection.matchedSubmission ? 'Nominal Voucher' : 'Estimasi / Bulan'}
                        </div>
                        <div className="text-base sm:text-lg font-black text-stone-900 tabular-nums">
                          {detection.actualAmount > 0
                            ? formatRupiah(detection.actualAmount)
                            : 'Sesuai Tagihan'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {detection.hasUnpaidVoucher && detection.matchedSubmission && onUploadPaymentProof && (
                          <button
                            type="button"
                            onClick={() => onUploadPaymentProof(detection.matchedSubmission!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer"
                          >
                            <Upload size={13} />
                            <span>Upload Bukti Transfer</span>
                          </button>
                        )}

                        {!detection.matchedSubmission && (
                          <button
                            type="button"
                            onClick={() => onCreateVoucher(item, selectedMonth)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs transition cursor-pointer"
                          >
                            <Plus size={13} />
                            <span>Buat Voucher</span>
                          </button>
                        )}

                        {detection.manualRecord?.submissionId ? (
                          <button
                            type="button"
                            onClick={() => handleUnbindMonth(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs font-bold transition cursor-pointer"
                            title="Lepaskan tautan voucher pada bulan ini"
                          >
                            <Unlink size={13} />
                            <span>Lepas Tautan</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setLinkTargetItem(item);
                              setLinkSearch('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 text-xs font-bold transition cursor-pointer"
                            title="Tautkan dengan Voucher HO yang sudah ada"
                          >
                            <Link2 size={13} />
                            <span>Tautkan Voucher</span>
                          </button>
                        )}

                        {!detection.matchedSubmission && (
                          <button
                            type="button"
                            onClick={() => handleToggleManualComplete(item, detection)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                              detection.isManuallyMarked
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            <CheckCircle2 size={13} />
                            <span>{detection.isManuallyMarked ? 'Batalkan Selesai' : 'Tandai Selesai'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition cursor-pointer"
                          title="Edit Jadwal Transaksi"
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleActive(item)}
                          className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition cursor-pointer"
                          title={item.isActive === false ? 'Aktifkan Otomatis Setiap Bulan' : 'Jeda Sementara'}
                        >
                          {item.isActive === false ? <PlayCircle size={14} className="text-emerald-600" /> : <PauseCircle size={14} />}
                        </button>

                        {confirmDeleteId === item.id ? (
                          <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-2 py-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-[11px] font-black text-rose-700 hover:text-rose-900 cursor-pointer"
                            >
                              Ya, Hapus
                            </button>
                            <span className="text-stone-300">|</span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px] font-bold text-stone-600 hover:text-stone-900 cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                            title="Hapus Transaksi Bulanan"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Subtle Preset Helper Row */}
          <div className="bg-stone-50 rounded-2xl border border-stone-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <Sparkles size={14} className="text-amber-600 shrink-0" />
              <span>Tambah cepat template bulanan umum:</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {MONTHLY_TRANSACTION_PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => openAddModal(preset)}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 border border-stone-200 hover:border-amber-300 text-[11px] font-bold text-stone-700 transition cursor-pointer"
                >
                  + {preset.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Recurring Monthly Transaction */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:hidden">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-xl overflow-hidden my-auto">
            <div className="px-5 py-4 bg-stone-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black">
                  {formState.id ? 'Edit Transaksi Bulanan' : 'Tambah Transaksi Bulanan Baru'}
                </h3>
                <p className="text-[11px] text-stone-300 font-mono">
                  Berjalan otomatis berulang 1 bulan sekali
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-800 text-stone-300 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Nama Transaksi / Tagihan Rutin *
                </label>
                <input
                  type="text"
                  value={formState.title}
                  onChange={(e) => setFormState((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Contoh: Tagihan Listrik PLN, Gaji Karyawan, Internet Biznet"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:border-amber-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Kategori Pengajuan Voucher HO
                  </label>
                  <input
                    type="text"
                    list="monthly-category-options"
                    value={formState.category}
                    onChange={(e) => setFormState((p) => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:border-amber-500 outline-none"
                  />
                  <datalist id="monthly-category-options">
                    {DEFAULT_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Penerima Kas / Vendor
                  </label>
                  <input
                    type="text"
                    value={formState.recipient}
                    onChange={(e) => setFormState((p) => ({ ...p, recipient: e.target.value }))}
                    placeholder="Contoh: PT PLN, Telkom, Karyawan"
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Estimasi Nominal (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formState.defaultAmount}
                    onChange={(e) => setFormState((p) => ({ ...p, defaultAmount: e.target.value }))}
                    placeholder="0 (atau sesuai tagihan)"
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:border-amber-500 outline-none tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Metode Pembayaran
                  </label>
                  <select
                    value={formState.paymentMethod}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        paymentMethod: e.target.value as 'Cek/Transfer' | 'Tunai',
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:border-amber-500 outline-none"
                  >
                    <option value="Cek/Transfer">Cek/Transfer</option>
                    <option value="Tunai">Tunai</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700">
                    Batas Tanggal Pembayaran Tiap Bulan (Default Sebelum Tgl 15)
                  </label>
                  <div className="flex items-center gap-1">
                    {[5, 10, 15, 25].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setFormState((p) => ({ ...p, dueDay: d }))}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer border ${
                          formState.dueDay === d
                            ? 'bg-amber-500 text-stone-950 border-amber-500'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                      >
                        Tgl {d}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={formState.dueDay}
                  onChange={(e) =>
                    setFormState((p) => ({
                      ...p,
                      dueDay: Math.min(28, Math.max(1, Number(e.target.value) || 15)),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:border-amber-500 outline-none tabular-nums"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700">
                    Kata Kunci Deteksi Otomatis dari Voucher HO
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const auto = buildAutoKeywords(
                        formState.title,
                        formState.recipient,
                        formState.category
                      );
                      setFormState((p) => ({ ...p, keywordsText: auto.join(', ') }));
                    }}
                    className="text-[11px] font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                  >
                    Isi Otomatis
                  </button>
                </div>
                <input
                  type="text"
                  value={formState.keywordsText}
                  onChange={(e) => setFormState((p) => ({ ...p, keywordsText: e.target.value }))}
                  placeholder="Pisahkan dengan koma, misal: pln, listrik, token"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:border-amber-500 outline-none"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Jika Anda membuat Voucher HO pada bulan tersebut yang mengandung kata kunci ini, sistem otomatis menandai transaksi sudah dijalankan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={formState.notes}
                  onChange={(e) => setFormState((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Keterangan ID pelanggan, rekening tujuan, atau catatan rutin"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:border-amber-500 outline-none"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-stone-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.isActive}
                  onChange={(e) => setFormState((p) => ({ ...p, isActive: e.target.checked }))}
                  className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <span>Aktifkan otomatis berkelanjutan setiap bulan</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-black cursor-pointer"
                >
                  {formState.id ? 'Simpan Perubahan' : 'Simpan Jadwal Bulanan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Link Existing Voucher to This Month */}
      {linkTargetItem && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 bg-stone-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-black">Tautkan Voucher HO</h3>
                <p className="text-[11px] text-stone-300">
                  {linkTargetItem.title} · {formatMonthKeyIndonesian(selectedMonth)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkTargetItem(null)}
                className="p-1.5 rounded-full hover:bg-stone-800 text-stone-300 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 border-b border-stone-200 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder="Cari kode voucher, penerima, atau keterangan (kosongkan = bulan dipilih)..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:border-amber-500 outline-none text-xs text-stone-900"
                />
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {candidateVouchers.length === 0 ? (
                <div className="text-center py-8 text-xs text-stone-500">
                  Tidak ada voucher ditemukan pada {formatMonthKeyIndonesian(selectedMonth)}. Coba ketik di kolom pencarian atau buat voucher baru.
                </div>
              ) : (
                candidateVouchers.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleBindVoucherToMonth(sub)}
                    className="w-full text-left p-3 rounded-xl border border-stone-200 hover:border-amber-400 hover:bg-amber-50/50 transition cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
                        <span>{sub.kode}</span>
                        <span className="text-stone-400 font-normal">· {sub.tanggal}</span>
                      </div>
                      <div className="text-xs text-stone-700 truncate">
                        {sub.jenisPengajuan} — {sub.dibayarkanKepada}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-stone-900 tabular-nums">
                        {formatRupiah(getSubmissionTotalAmount(sub))}
                      </div>
                      <div className="text-[10px] font-mono text-stone-500">{sub.status}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

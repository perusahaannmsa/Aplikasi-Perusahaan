import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Submission, ActivityLog } from '../types';
import { formatRupiah, formatDateIndonesian, isPettyCashSubmission, getPettyCashCustodian, isInvoiceSubmission, sortSubmissionsDescending } from '../utils';
import { getVoucherShareLink } from '../utils/appLinks';
import { Search, Eye, Edit2, Trash2, Calendar, MapPin, DollarSign, Plus, Copy, RefreshCw, Cloud, CloudUpload, FileText, Database, History, FileSpreadsheet, CheckCircle, AlertCircle, Printer, Check, ExternalLink, Coins, User, Bell, ChevronDown, Sparkles, Share2, Send, MoreVertical, Receipt, Building2, X, AlertTriangle, Info, Layers, Filter, CreditCard, Star, Download, RotateCcw, SlidersHorizontal, EyeOff } from 'lucide-react';
import { loadActivityLogsFromFirestore, isFirebaseConfigured, triggerGoogleDriveAutoRefresh } from '../firebase';
import { LiveClock } from './LiveClock';
import { normalizeText, extractYearMonth, normalizeExactTransactionCode } from '../utils/duplicateDetector';
import { F1SignaturesBlock } from './F1SignaturesBlock';
import { SignerSettingsModal, SignerConfigItem } from './SignerSettingsModal';
import {
  normalizeSignerCompanyId,
  resolveCompanySignerBundle,
  saveCompanySignerBundle,
  resetCompanySignerBundle,
  buildDefaultListSignersForCompany,
  COMPANY_SIGNERS_UPDATED_EVENT,
} from '../utils/companySigners';

interface SubmissionsListProps {
  submissions: Submission[];
  onSelect: (submission: Submission, initialTab?: 'both' | 'pengajuan' | 'pengeluaran' | 'lampiran' | 'only_invoice_payment') => void;
  onEdit: (submission: Submission) => void;
  onOpenSppdEditor?: (submission: Submission) => void;
  onOpenSppdManager?: () => void;
  onOpenLoanManager?: () => void;
  onDelete: (id: string, options?: { deleteDriveFolder?: boolean }) => void;
  onBulkDelete?: (ids: string[], options?: { deleteDriveFolder?: boolean }) => void;
  onDuplicate: (submission: Submission) => void;
  onAddNew: () => void;
  onOpenBuktiTransfer?: (submission?: Submission) => void;
  userProfile?: any;
  onMarkAsPaid?: (id: string) => void;
  onBulkUpdateSubmissions?: (updatedSubs: Submission[], customNotice?: string) => Promise<void> | void;
  layoutMode?: 'standard' | 'spreadsheet' | 'audit_logs' | 'invoice_recap' | 'unpaid_outstanding' | 'petty_cash_recap';
  onLayoutModeChange?: (mode: 'standard' | 'spreadsheet' | 'audit_logs' | 'invoice_recap' | 'unpaid_outstanding' | 'petty_cash_recap') => void;
  pettyCashHolders?: string[];
  onOpenConsolidateModal?: () => void;
  onOpenPph23View?: () => void;
  onOpenRabView?: () => void;
  onCreateMemo?: (submission: Submission) => void;
  onForceCloudSync?: () => void;
  onRestoreBackupToFirestore?: () => void;
  onUploadSingleToFirestore?: (submission: Submission) => void;
  onUploadSelectedToFirestore?: (submissions: Submission[]) => void;
  onUploadUnsyncedToFirestore?: () => void;
  unsyncedSubmissionIds?: Set<string>;
  cloudSyncedIds?: Set<string>;
  uploadingSubmissionIds?: Set<string>;
  hasCloudInventory?: boolean;
  onOpenDriveCleaner?: () => void;
  isCloudSyncing?: boolean;
  cloudSyncNotice?: string | null;
  onDismissCloudSyncNotice?: () => void;
}

export const SubmissionsList: React.FC<SubmissionsListProps> = ({
  submissions,
  onSelect,
  onEdit,
  onOpenSppdEditor,
  onOpenSppdManager,
  onOpenLoanManager,
  onDelete,
  onBulkDelete,
  onDuplicate,
  onAddNew,
  onOpenBuktiTransfer,
  userProfile,
  onMarkAsPaid,
  onBulkUpdateSubmissions,
  layoutMode: propLayoutMode,
  onLayoutModeChange,
  pettyCashHolders = [],
  onOpenConsolidateModal,
  onOpenPph23View,
  onOpenRabView,
  onCreateMemo,
  onForceCloudSync,
  onRestoreBackupToFirestore,
  onUploadSingleToFirestore,
  onUploadSelectedToFirestore,
  onUploadUnsyncedToFirestore,
  unsyncedSubmissionIds,
  cloudSyncedIds,
  uploadingSubmissionIds,
  hasCloudInventory = false,
  onOpenDriveCleaner,
  isCloudSyncing = false,
  cloudSyncNotice = null,
  onDismissCloudSyncNotice,
}) => {
  const [searchTerm, setSearchTerm] = useState(() => {
    try { return sessionStorage.getItem('sublist_searchTerm') || ''; } catch (e) { return ''; }
  });
  const [methodFilter, setMethodFilter] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_methodFilter') || 'All'; } catch (e) { return 'All'; }
  });
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_statusFilter') || 'All'; } catch (e) { return 'All'; }
  });
  const [searchCategory, setSearchCategory] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_searchCategory') || 'all'; } catch (e) { return 'all'; }
  });
  
  const currentNow = new Date();
  const currentMonthDefault = String(currentNow.getMonth() + 1).padStart(2, '0');
  const currentYearDefault = String(currentNow.getFullYear());

  const [yearFilter, setYearFilter] = useState<string>(() => {
    try {
      const hasCustom = sessionStorage.getItem('sublist_hasCustomPeriodFilter');
      if (hasCustom === 'true') {
        return sessionStorage.getItem('sublist_yearFilter') || currentYearDefault;
      }
      return currentYearDefault;
    } catch (e) {
      return currentYearDefault;
    }
  });

  const [monthFilter, setMonthFilter] = useState<string>(() => {
    try {
      const hasCustom = sessionStorage.getItem('sublist_hasCustomPeriodFilter');
      if (hasCustom === 'true') {
        return sessionStorage.getItem('sublist_monthFilter') || currentMonthDefault;
      }
      return currentMonthDefault;
    } catch (e) {
      return currentMonthDefault;
    }
  });

  const [dateFilter, setDateFilter] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_dateFilter') || ''; } catch (e) { return ''; }
  });

  const [deleteConfirmSub, setDeleteConfirmSub] = useState<Submission | null>(null);
  const [deleteIncludeDrive, setDeleteIncludeDrive] = useState<boolean>(true);
  const didAutoExpandPeriodRef = useRef<boolean>(false);

  // Filter khusus duplikat ketat (100% sama: Tanggal, Nominal, Penerima & Jenis Transaksi, serta bulan sama beda tanggal)
  const [duplicateFilterMode, setDuplicateFilterMode] = useState<'all' | 'any_duplicate' | 'exact_same' | 'same_month_diff_date' | 'same_code'>('all');
  const showOnlyDuplicates = duplicateFilterMode !== 'all';
  const setShowOnlyDuplicates = (updater: boolean | ((prev: boolean) => boolean)) => {
    setDuplicateFilterMode((prevMode) => {
      const prevBool = prevMode !== 'all';
      const nextBool = typeof updater === 'function' ? updater(prevBool) : updater;
      return nextBool ? 'any_duplicate' : 'all';
    });
  };
  const [showOnlyUnsynced, setShowOnlyUnsynced] = useState(false);
  const [firestoreFilter, setFirestoreFilter] = useState<'all' | 'synced' | 'unsynced'>('all');
  const [diffDateFilter, setDiffDateFilter] = useState<'all' | 'same_any_diff_date' | 'same_code_diff_date' | 'same_tx_diff_date'>('all');
  const [checkedDiffDateIds, setCheckedDiffDateIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('nmsa_checked_diff_date_ids');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const handleToggleCheckedDiffDate = (submissionId: string) => {
    setCheckedDiffDateIds((prev) => {
      const next = prev.includes(submissionId)
        ? prev.filter((id) => id !== submissionId)
        : [...prev, submissionId];
      try {
        localStorage.setItem('nmsa_checked_diff_date_ids', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };
  const handleResetCheckedDiffDate = () => {
    setCheckedDiffDateIds([]);
    try {
      localStorage.removeItem('nmsa_checked_diff_date_ids');
    } catch (e) {}
  };
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateModalSearch, setDuplicateModalSearch] = useState('');
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const [showArchivedDuplicates, setShowArchivedDuplicates] = useState(false);

  // Status tanda aman / transaksi sah (tidak lagi terdeteksi duplikat)
  const [acknowledgedDuplicateIds, setAcknowledgedDuplicateIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('acknowledged_double_submission_ids');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Cutoff timestamp untuk mengabaikan seluruh riwayat sebelumnya
  const [acknowledgedAllHistoryTimestamp, setAcknowledgedAllHistoryTimestamp] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('acknowledged_double_all_history_until') || 0);
    } catch (e) {
      return 0;
    }
  });

  // Centang (Check) aktif untuk pilihan baris massal -> Pilihan menu tindakan lengkap, Prioritas Bayar, Sah, atau Hapus Terpilih
  const [selectedCheckedIds, setSelectedCheckedIds] = useState<string[]>([]);
  const selectedCheckedSet = useMemo(() => new Set(selectedCheckedIds), [selectedCheckedIds]);
  const showCheckColumn = selectedCheckedIds.length > 0;
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteIncludeDrive, setBulkDeleteIncludeDrive] = useState(true);
  const [bulkMarkPaidConfirmOpen, setBulkMarkPaidConfirmOpen] = useState(false);
  const [bulkActionToast, setBulkActionToast] = useState<string | null>(null);

  // Dropdown pilihan untuk kolom CHECK (Pilih Semua, Belum Lunas, Prioritas Bayar, Belum Firestore, dll.)
  const [isCheckMenuOpen, setIsCheckMenuOpen] = useState(false);
  const [checkMenuPosition, setCheckMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Pengaturan Penanda Tangan Cetak List (PDF) per Perusahaan (sinkron dengan gaya F1 & F2 + opsi Hilangkan TTD)
  const activeCompanyId = useMemo(
    () => normalizeSignerCompanyId(userProfile?.companyId || userProfile?.companyDetails?.id),
    [userProfile?.companyId, userProfile?.companyDetails?.id]
  );
  const activeCompanyFullName = useMemo(() => {
    const raw =
      userProfile?.companyDetails?.fullName ||
      userProfile?.companyName ||
      userProfile?.companyDetails?.name ||
      'PT NUSANTARA MINERAL SUKSES ABADI';
    return String(raw).trim() || 'PT NUSANTARA MINERAL SUKSES ABADI';
  }, [userProfile?.companyDetails?.fullName, userProfile?.companyName, userProfile?.companyDetails?.name]);

  const [listSigners, setListSigners] = useState<SignerConfigItem[]>(() =>
    resolveCompanySignerBundle(activeCompanyId, userProfile).listSigners
  );
  const [listShowSigners, setListShowSigners] = useState<boolean>(() =>
    resolveCompanySignerBundle(activeCompanyId, userProfile).listShowSigners
  );
  const [listSignatureStyle, setListSignatureStyle] = useState<'table' | 'line'>(() =>
    resolveCompanySignerBundle(activeCompanyId, userProfile).listSignatureStyle
  );
  const [companyF1Signers, setCompanyF1Signers] = useState<SignerConfigItem[]>(() =>
    resolveCompanySignerBundle(activeCompanyId, userProfile).f1Signers
  );
  const [companyF2Signers, setCompanyF2Signers] = useState<SignerConfigItem[]>(() =>
    resolveCompanySignerBundle(activeCompanyId, userProfile).f2Signers
  );
  const [companySignatureStyle, setCompanySignatureStyle] = useState<'table' | 'line'>(() =>
    resolveCompanySignerBundle(activeCompanyId, userProfile).signatureStyle
  );
  const [isListPrintPreviewOpen, setIsListPrintPreviewOpen] = useState(false);
  const [isListSignerModalOpen, setIsListSignerModalOpen] = useState(false);

  useEffect(() => {
    const syncListSigners = () => {
      const bundle = resolveCompanySignerBundle(activeCompanyId, userProfile);
      setListSigners(bundle.listSigners);
      setListShowSigners(bundle.listShowSigners);
      setListSignatureStyle(bundle.listSignatureStyle);
      setCompanyF1Signers(bundle.f1Signers);
      setCompanyF2Signers(bundle.f2Signers);
      setCompanySignatureStyle(bundle.signatureStyle);
    };
    syncListSigners();
    if (typeof window !== 'undefined') {
      window.addEventListener(COMPANY_SIGNERS_UPDATED_EVENT, syncListSigners);
      return () => window.removeEventListener(COMPANY_SIGNERS_UPDATED_EVENT, syncListSigners);
    }
  }, [activeCompanyId, userProfile]);

  const handleSaveListSigners = (
    nextSigners: SignerConfigItem[],
    showSigners: boolean,
    style: 'table' | 'line'
  ) => {
    setListSigners(nextSigners);
    setListShowSigners(showSigners);
    setListSignatureStyle(style);
    saveCompanySignerBundle(activeCompanyId, {
      listSigners: nextSigners,
      listShowSigners: showSigners,
      listSignatureStyle: style,
    });
  };

  const handleToggleListSignersVisibility = (nextVisible: boolean) => {
    setListShowSigners(nextVisible);
    saveCompanySignerBundle(activeCompanyId, { listShowSigners: nextVisible });
  };

  const handleChangeListSignatureStyle = (nextStyle: 'table' | 'line') => {
    setListSignatureStyle(nextStyle);
    saveCompanySignerBundle(activeCompanyId, { listSignatureStyle: nextStyle });
  };

  const handleResetListSigners = () => {
    const defaultList = buildDefaultListSignersForCompany(
      activeCompanyId,
      companyF1Signers,
      userProfile?.companyDetails
    );
    setListSigners(defaultList);
    setListShowSigners(true);
    setListSignatureStyle('line');
    saveCompanySignerBundle(activeCompanyId, {
      listSigners: defaultList,
      listShowSigners: true,
      listSignatureStyle: 'line',
    });
  };

  const activeListSignerCount = useMemo(
    () => listSigners.filter((s) => s.enabled !== false).length,
    [listSigners]
  );

  // Filter & sorotan transaksi yang diprioritaskan untuk dibayar selanjutnya
  const [priorityFilter, setPriorityFilter] = useState<boolean>(() => {
    try { return sessionStorage.getItem('sublist_priorityFilter') === 'true'; } catch { return false; }
  });
  const [pinPriorityTop, setPinPriorityTop] = useState<boolean>(() => {
    try { return sessionStorage.getItem('sublist_pinPriorityTop') !== 'false'; } catch { return true; }
  });
  const [localPriorityIds, setLocalPriorityIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('nmsa_payment_priority_ids');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const localPrioritySet = useMemo(() => new Set(localPriorityIds), [localPriorityIds]);

  const isSubPriorityPayNext = useMemo(() => {
    return (sub: Submission): boolean => {
      if (!sub?.id) return false;
      if (sub.paymentPriority === 'next') return true;
      if (sub.paymentPriority === null) return false;
      return localPrioritySet.has(sub.id);
    };
  }, [localPrioritySet]);

  useEffect(() => {
    const existingSet = new Set((submissions || []).map((s) => s.id));
    setSelectedCheckedIds((prev) => {
      const next = prev.filter((id) => existingSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [submissions]);

  const handleToggleSelectCheck = (submissionId: string) => {
    setSelectedCheckedIds((prev) =>
      prev.includes(submissionId)
        ? prev.filter((id) => id !== submissionId)
        : [...prev, submissionId]
    );
  };

  const handleClearSelectedChecks = () => {
    setSelectedCheckedIds([]);
  };

  const handleSetPaymentPriority = async (targetSubs: Submission[], enable: boolean) => {
    const validTargets = (targetSubs || []).filter((s) => s && s.id);
    if (validTargets.length === 0) return;
    const targetIds = validTargets.map((s) => s.id);
    const targetIdSet = new Set(targetIds);

    setLocalPriorityIds((prev) => {
      const next = enable
        ? Array.from(new Set([...prev, ...targetIds]))
        : prev.filter((id) => !targetIdSet.has(id));
      try {
        localStorage.setItem('nmsa_payment_priority_ids', JSON.stringify(next));
      } catch (_) {}
      return next;
    });

    if (onBulkUpdateSubmissions) {
      const nowIso = new Date().toISOString();
      const updatedSubs: Submission[] = validTargets.map((s) => ({
        ...s,
        paymentPriority: enable ? 'next' : null,
        paymentPriorityAt: enable ? nowIso : undefined,
      }));
      await onBulkUpdateSubmissions(updatedSubs);
    }

    setBulkActionToast(
      enable
        ? `⭐ ${validTargets.length} transaksi disorot & diprioritaskan untuk dibayar selanjutnya.`
        : `✓ Sorotan prioritas pembayaran dihapus dari ${validTargets.length} transaksi.`
    );
    setTimeout(() => setBulkActionToast(null), 5000);
  };

  const handleResetAllFilters = () => {
    setSearchTerm('');
    setSearchCategory('all');
    setMethodFilter('All');
    setStatusFilter('All');
    setDateFilter('');
    setMonthFilter('All');
    setYearFilter('All');
    setDiffDateFilter('all');
    setDuplicateFilterMode('all');
    setFirestoreFilter('all');
    setShowOnlyUnsynced(false);
    setPriorityFilter(false);
    try {
      sessionStorage.setItem('sublist_hasCustomPeriodFilter', 'true');
      sessionStorage.setItem('sublist_priorityFilter', 'false');
    } catch (_) {}
  };

  const handleToggleAcknowledgeDuplicate = (submissionId: string) => {
    const currentlyMarked = acknowledgedDuplicateIds.includes(submissionId) || checkedDiffDateIds.includes(submissionId);
    if (currentlyMarked) {
      setAcknowledgedDuplicateIds(prev => {
        const next = prev.filter(id => id !== submissionId);
        try { localStorage.setItem('acknowledged_double_submission_ids', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      setCheckedDiffDateIds(prev => {
        const next = prev.filter(id => id !== submissionId);
        try { localStorage.setItem('nmsa_checked_diff_date_ids', JSON.stringify(next)); } catch (e) {}
        return next;
      });
    } else {
      setAcknowledgedDuplicateIds(prev => {
        const next = [...prev, submissionId];
        try { localStorage.setItem('acknowledged_double_submission_ids', JSON.stringify(next)); } catch (e) {}
        return next;
      });
    }
  };

  const handleAcknowledgeAllDuplicates = (idsToAcknowledge: string[]) => {
    setAcknowledgedDuplicateIds(prev => {
      const next = Array.from(new Set([...prev, ...idsToAcknowledge]));
      try { localStorage.setItem('acknowledged_double_submission_ids', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const handleAcknowledgeCluster = (clusterSubmissions: Submission[]) => {
    const clusterIds = clusterSubmissions.map(s => s.id);
    handleAcknowledgeAllDuplicates(clusterIds);
  };

  // User requirement:
  // "untuk tampilan dari daftar rekap double ini tolong tambahkan tombol untuk memilih bahwa transaksi ini seluruhnya tidak double dan aplikasi tidak akan mendeteksinya lagi. dan jika ada transaksi baru yang serupa baru terdeteksi lagi."
  const handleAcknowledgeAllHistory = () => {
    const now = Date.now();
    setAcknowledgedAllHistoryTimestamp(now);
    const allIds = submissions.map(s => s.id);
    setAcknowledgedDuplicateIds(allIds);
    try {
      localStorage.setItem('acknowledged_double_all_history_until', String(now));
      localStorage.setItem('acknowledged_double_submission_ids', JSON.stringify(allIds));
    } catch (e) {}
  };

  const handleResetAcknowledgeDuplicates = () => {
    setAcknowledgedDuplicateIds([]);
    setAcknowledgedAllHistoryTimestamp(0);
    setCheckedDiffDateIds([]);
    try {
      localStorage.removeItem('acknowledged_double_submission_ids');
      localStorage.removeItem('acknowledged_double_all_history_until');
      localStorage.removeItem('nmsa_checked_diff_date_ids');
    } catch (e) {}
  };

  // Tandai seluruh baris yang sedang di-check sebagai Transaksi yang Sah (kecualikan dari deteksi duplikat & beda tanggal)
  const handleMarkSelectedAsLegitimate = () => {
    if (selectedCheckedIds.length === 0) return;
    const count = selectedCheckedIds.length;
    handleAcknowledgeAllDuplicates(selectedCheckedIds);
    setCheckedDiffDateIds((prev) => {
      const next = Array.from(new Set([...prev, ...selectedCheckedIds]));
      try {
        localStorage.setItem('nmsa_checked_diff_date_ids', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    setSelectedCheckedIds([]);
    setBulkActionToast(`✓ ${count} transaksi berhasil ditandai sebagai transaksi yang SAH dan tidak lagi terdeteksi sebagai duplikat.`);
    setTimeout(() => setBulkActionToast(null), 5000);
  };

  const handleUnmarkSelectedAsLegitimate = () => {
    if (selectedCheckedIds.length === 0) return;
    const checkedSet = new Set(selectedCheckedIds);
    setAcknowledgedDuplicateIds((prev) => {
      const next = prev.filter((id) => !checkedSet.has(id));
      try { localStorage.setItem('acknowledged_double_submission_ids', JSON.stringify(next)); } catch (_) {}
      return next;
    });
    setCheckedDiffDateIds((prev) => {
      const next = prev.filter((id) => !checkedSet.has(id));
      try { localStorage.setItem('nmsa_checked_diff_date_ids', JSON.stringify(next)); } catch (_) {}
      return next;
    });
    setBulkActionToast(`✓ Tanda Sah dibatalkan untuk ${selectedCheckedIds.length} transaksi.`);
    setTimeout(() => setBulkActionToast(null), 4000);
  };

  const isSubVerifiedLegit = useMemo(() => {
    const ackSet = new Set(acknowledgedDuplicateIds);
    const checkedDiffSet = new Set(checkedDiffDateIds);
    return (sub: Submission): boolean => {
      if (!sub?.id) return false;
      if (ackSet.has(sub.id) || checkedDiffSet.has(sub.id)) return true;
      if (acknowledgedAllHistoryTimestamp > 0) {
        const subTime = new Date(sub.createdAt || sub.tanggal || 0).getTime();
        if (subTime <= acknowledgedAllHistoryTimestamp) return true;
      }
      return false;
    };
  }, [acknowledgedDuplicateIds, checkedDiffDateIds, acknowledgedAllHistoryTimestamp]);

  // Seluruh kelompok duplikat ketat (100% sama: Bulan sama + Kode Transaksi 100% sama + Penerima sama + Jenis Transaksi sama + Total Nominal sama)
  const duplicateClusters = useMemo(() => {
    if (!submissions || submissions.length < 2) return [];

    const map = new Map<string, {
      key: string;
      yearMonth: string;
      kode: string;
      recipientName: string;
      jenisPengajuan: string;
      nominal: number;
      submissions: Submission[];
    }>();

    submissions.forEach(sub => {
      if (!sub || !sub.id) return;
      const yearMonth = extractYearMonth(sub.tanggal);
      const subTotal = (sub.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0) || (sub as any).nominal || 0;
      const cleanRec = normalizeText(sub.dibayarkanKepada);
      const cleanJenis = normalizeText(sub.jenisPengajuan);
      const exactKode = normalizeExactTransactionCode(sub.kode);
      if (!yearMonth || !cleanRec || !cleanJenis || !exactKode || exactKode === '-' || subTotal <= 0) return;

      const key = `${yearMonth}|${exactKode}|${cleanRec}|${cleanJenis}|${subTotal}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          yearMonth,
          kode: exactKode,
          recipientName: sub.dibayarkanKepada || 'Tanpa Nama',
          jenisPengajuan: sub.jenisPengajuan || '-',
          nominal: subTotal,
          submissions: []
        });
      }
      map.get(key)!.submissions.push(sub);
    });

    return Array.from(map.values())
      .filter(g => g.submissions.length > 1)
      .map(g => ({
        ...g,
        submissions: g.submissions.sort((a, b) => new Date(b.tanggal || 0).getTime() - new Date(a.tanggal || 0).getTime())
      }))
      .sort((a, b) => b.submissions.length - a.submissions.length);
  }, [submissions]);

  // Seluruh ID yang terkelompok 100% sama dalam bulan yang sama
  const duplicateSubmissionIds = useMemo(() => {
    const ids = new Set<string>();
    duplicateClusters.forEach(cluster => {
      cluster.submissions.forEach(s => ids.add(s.id));
    });
    return ids;
  }, [duplicateClusters]);

  // Deteksi transaksi duplikat KETAT (berdasarkan bulan yang sama):
  // 1) 100% Sama Semua (Tanggal sama + Kode Transaksi 100% sama angka/huruf/garis miring + Nominal sama + Penerima sama + Jenis Transaksi sama)
  // 2) Sama Bulan & Transaksi 100%, Beda Tanggal (Bulan YYYY-MM sama + Kode Transaksi 100% sama + Nominal sama + Penerima sama + Jenis Transaksi sama, tanggal berbeda)
  // 3) No-Kode Voucher Duplikat 100% sama di bulan yang sama (opsional di dropdown)
  // Transaksi yang sudah ditandai SAH dikecualikan sebelum menghitung pasangan aktif.
  const duplicateInspection = useMemo(() => {
    const exactSameGroups = new Map<string, Submission[]>();
    const sameMonthTxGroups = new Map<string, Submission[]>();
    const codeMonthGroups = new Map<string, Submission[]>();

    const normalizeDateKey = (rawDate?: string) => String(rawDate || '').trim().substring(0, 10);

    (submissions || []).forEach((sub) => {
      if (!sub || !sub.id) return;
      if (isSubVerifiedLegit(sub)) return;

      const yearMonth = extractYearMonth(sub.tanggal);
      if (!yearMonth) return;

      const exactDate = normalizeDateKey(sub.tanggal);
      const subTotal = (sub.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0) || Number((sub as any).nominal) || 0;
      const cleanRec = normalizeText(sub.dibayarkanKepada);
      const cleanJenis = normalizeText(sub.jenisPengajuan);
      const exactKode = normalizeExactTransactionCode(sub.kode);
      const hasValidKode = Boolean(exactKode && exactKode !== '-');

      if (cleanRec && cleanJenis && hasValidKode && subTotal > 0) {
        if (exactDate) {
          const exactKey = `${exactDate}|${exactKode}|${subTotal}|${cleanRec}|${cleanJenis}`;
          const arr = exactSameGroups.get(exactKey) || [];
          arr.push(sub);
          exactSameGroups.set(exactKey, arr);
        }

        const monthTxKey = `${yearMonth}|${exactKode}|${subTotal}|${cleanRec}|${cleanJenis}`;
        const mArr = sameMonthTxGroups.get(monthTxKey) || [];
        mArr.push(sub);
        sameMonthTxGroups.set(monthTxKey, mArr);
      }

      if (hasValidKode && exactKode !== 'HO' && exactKode.length >= 3) {
        const kodeKey = `${yearMonth}|${exactKode}`;
        const kArr = codeMonthGroups.get(kodeKey) || [];
        kArr.push(sub);
        codeMonthGroups.set(kodeKey, kArr);
      }
    });

    const exactSameIds = new Set<string>();
    const sameMonthDiffDateIds = new Set<string>();
    const sameCodeIds = new Set<string>();
    const groupSortKeyMap = new Map<string, string>();
    const groupCountMap = new Map<string, number>();
    let duplicateGroupCount = 0;

    exactSameGroups.forEach((group) => {
      if (group.length >= 2) {
        duplicateGroupCount++;
        const first = group[0];
        const ym = extractYearMonth(first.tanggal) || '';
        const total = (first.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0) || Number((first as any).nominal) || 0;
        const firstKode = normalizeExactTransactionCode(first.kode);
        const sortClusterKey = `STRICT:${ym}|${firstKode}|${total}|${normalizeText(first.dibayarkanKepada)}|${normalizeText(first.jenisPengajuan)}`;
        group.forEach((s) => {
          exactSameIds.add(s.id);
          groupSortKeyMap.set(s.id, sortClusterKey);
          groupCountMap.set(s.id, group.length);
        });
      }
    });

    sameMonthTxGroups.forEach((group, monthTxKey) => {
      const distinctDates = new Set(group.map((s) => normalizeDateKey(s.tanggal)).filter(Boolean));
      if (group.length >= 2 && distinctDates.size >= 2) {
        const hasNewGroup = group.some((s) => !exactSameIds.has(s.id));
        if (hasNewGroup) duplicateGroupCount++;
        const sortClusterKey = `STRICT:${monthTxKey}`;
        group.forEach((s) => {
          sameMonthDiffDateIds.add(s.id);
          groupSortKeyMap.set(s.id, sortClusterKey);
          groupCountMap.set(s.id, Math.max(groupCountMap.get(s.id) || 0, group.length));
        });
      }
    });

    codeMonthGroups.forEach((group, kodeKey) => {
      if (group.length >= 2) {
        group.forEach((s) => {
          sameCodeIds.add(s.id);
          if (!groupSortKeyMap.has(s.id)) {
            groupSortKeyMap.set(s.id, `KODE:${kodeKey}`);
            groupCountMap.set(s.id, group.length);
          }
        });
      }
    });

    // Gabungan ketat utama sesuai permintaan: 100% Sama (Tgl & Kode Sama) + Sama Bulan & Transaksi & Kode (Beda Tanggal)
    const allDuplicateIds = new Set<string>([...exactSameIds, ...sameMonthDiffDateIds]);

    return {
      exactSameIds,
      sameMonthDiffDateIds,
      sameCodeIds,
      allDuplicateIds,
      groupSortKeyMap,
      groupCountMap,
      duplicateGroupCount,
    };
  }, [submissions, isSubVerifiedLegit]);

  // ID yang masih aktif (belum diberi tanda SAH):
  const activeDuplicateSubmissionIds = useMemo(() => {
    const ids = new Set<string>();
    duplicateInspection.allDuplicateIds.forEach(id => ids.add(id));
    return ids;
  }, [duplicateInspection.allDuplicateIds]);

  const [shareModalSub, setShareModalSub] = useState<Submission | null>(null);
  const [isCopiedShare, setIsCopiedShare] = useState(false);

  const MONTHS_LIST = [
    { value: 'All', label: 'Semua Bulan' },
    { value: '01', label: 'Januari' },
    { value: '02', label: 'Februari' },
    { value: '03', label: 'Maret' },
    { value: '04', label: 'April' },
    { value: '05', label: 'Mei' },
    { value: '06', label: 'Juni' },
    { value: '07', label: 'Juli' },
    { value: '08', label: 'Agustus' },
    { value: '09', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' }
  ];
  
  const [internalLayoutMode, setInternalLayoutMode] = useState<'standard' | 'spreadsheet' | 'audit_logs' | 'invoice_recap' | 'unpaid_outstanding' | 'petty_cash_recap'>(() => {
    try {
      const saved = sessionStorage.getItem('sublist_layoutMode');
      if (saved === 'spreadsheet' || saved === 'audit_logs' || saved === 'unpaid_outstanding') return 'standard';
      return (saved as any) || 'standard';
    } catch (e) {
      return 'standard';
    }
  });

  const layoutMode = propLayoutMode !== undefined ? propLayoutMode : internalLayoutMode;

  const handleSetLayoutMode = (mode: 'standard' | 'spreadsheet' | 'audit_logs' | 'invoice_recap' | 'unpaid_outstanding' | 'petty_cash_recap') => {
    setInternalLayoutMode(mode);
    try { sessionStorage.setItem('sublist_layoutMode', mode); } catch (e) {}
    if (onLayoutModeChange) onLayoutModeChange(mode);
  };

  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  const activeActionSub = useMemo(() => {
    if (!openActionMenuId) return null;
    const cleanOpenId = openActionMenuId.replace(/^mob-/, '');
    return submissions.find(s => s.id === openActionMenuId || s.id === cleanOpenId) || null;
  }, [openActionMenuId, submissions]);

  const updateActionMenuPosition = (subId: string) => {
    const cleanId = subId.replace(/^mob-/, '');
    const btn = document.getElementById(`btn-action-trigger-${cleanId}`) || 
                document.getElementById(`btn-action-trigger-mob-${cleanId}`) ||
                document.getElementById(`btn-action-trigger-${subId}`) ||
                document.getElementById(`btn-action-trigger-mob-${subId}`);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 224;
    const menuEstimatedHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < menuEstimatedHeight && spaceAbove > spaceBelow;

    let left = rect.right - menuWidth;
    if (left < 12) {
      left = Math.max(12, rect.left);
    }
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }

    if (openUpwards) {
      setActionMenuPosition({
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        left,
        maxHeight: Math.min(460, Math.max(160, spaceAbove - 16)),
      });
    } else {
      setActionMenuPosition({
        top: Math.max(8, rect.bottom + 6),
        left,
        maxHeight: Math.min(460, Math.max(160, spaceBelow - 16)),
      });
    }
  };

  useEffect(() => {
    if (openActionMenuId) {
      updateActionMenuPosition(openActionMenuId);
    }
  }, [openActionMenuId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.action-menu-dropdown-root')) {
        setOpenActionMenuId(null);
        setActionMenuPosition(null);
      }
      if (!target?.closest('.check-menu-dropdown-root')) {
        setIsCheckMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenActionMenuId(null);
        setActionMenuPosition(null);
        setIsCheckMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!openActionMenuId) return;
    const handleScrollOrResize = () => {
      updateActionMenuPosition(openActionMenuId);
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [openActionMenuId]);
  const [activeSheetTab, setActiveSheetTab] = useState<string>('Data Sinkron');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // States for Petty Cash Recap view
  const [pettyCashSearchQuery, setPettyCashSearchQuery] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_pettyCashSearchQuery') || ''; } catch (e) { return ''; }
  });
  const [pettyCashCustodianFilter, setPettyCashCustodianFilter] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_pettyCashCustodianFilter') || 'All'; } catch (e) { return 'All'; }
  });
  const [pettyCashMonthFilter, setPettyCashMonthFilter] = useState<string>(() => {
    try {
      const hasCustom = sessionStorage.getItem('sublist_hasCustomPeriodFilter');
      if (hasCustom === 'true') {
        return sessionStorage.getItem('sublist_pettyCashMonthFilter') || currentMonthDefault;
      }
      return currentMonthDefault;
    } catch (e) {
      return currentMonthDefault;
    }
  });

  // States for Unpaid/Outstanding view
  const [unpaidSearchTerm, setUnpaidSearchTerm] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_unpaidSearchTerm') || ''; } catch (e) { return ''; }
  });
  const [unpaidLocationFilter, setUnpaidLocationFilter] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_unpaidLocationFilter') || 'All'; } catch (e) { return 'All'; }
  });

  // States for Invoice Recap view
  const [invoiceMonthFilter, setInvoiceMonthFilter] = useState<string>(() => {
    try {
      const hasCustom = sessionStorage.getItem('sublist_hasCustomPeriodFilter');
      if (hasCustom === 'true') {
        return sessionStorage.getItem('sublist_invoiceMonthFilter') || currentMonthDefault;
      }
      return currentMonthDefault;
    } catch (e) {
      return currentMonthDefault;
    }
  });
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_invoiceSearchQuery') || ''; } catch (e) { return ''; }
  });
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>(() => {
    try { return sessionStorage.getItem('sublist_invoiceStatusFilter') || 'All'; } catch (e) { return 'All'; }
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Persist filter state changes to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('sublist_searchTerm', searchTerm);
      sessionStorage.setItem('sublist_searchCategory', searchCategory);
      sessionStorage.setItem('sublist_methodFilter', methodFilter);
      sessionStorage.setItem('sublist_statusFilter', statusFilter);
      sessionStorage.setItem('sublist_yearFilter', yearFilter);
      sessionStorage.setItem('sublist_monthFilter', monthFilter);
      sessionStorage.setItem('sublist_dateFilter', dateFilter);
      sessionStorage.setItem('sublist_layoutMode', layoutMode);
      sessionStorage.setItem('sublist_pettyCashSearchQuery', pettyCashSearchQuery);
      sessionStorage.setItem('sublist_pettyCashCustodianFilter', pettyCashCustodianFilter);
      sessionStorage.setItem('sublist_pettyCashMonthFilter', pettyCashMonthFilter);
      sessionStorage.setItem('sublist_unpaidSearchTerm', unpaidSearchTerm);
      sessionStorage.setItem('sublist_unpaidLocationFilter', unpaidLocationFilter);
      sessionStorage.setItem('sublist_invoiceMonthFilter', invoiceMonthFilter);
      sessionStorage.setItem('sublist_invoiceSearchQuery', invoiceSearchQuery);
      sessionStorage.setItem('sublist_invoiceStatusFilter', invoiceStatusFilter);
      sessionStorage.setItem('sublist_priorityFilter', String(priorityFilter));
      sessionStorage.setItem('sublist_pinPriorityTop', String(pinPriorityTop));
    } catch (e) {}
  }, [
    searchTerm, searchCategory, methodFilter, statusFilter, yearFilter, monthFilter,
    dateFilter, layoutMode, pettyCashSearchQuery, pettyCashCustodianFilter,
    pettyCashMonthFilter, unpaidSearchTerm, unpaidLocationFilter,
    invoiceMonthFilter, invoiceSearchQuery, invoiceStatusFilter, priorityFilter, pinPriorityTop
  ]);

  // Track and restore window scroll position automatically
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 0) {
        try {
          sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString());
        } catch (e) {}
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    try {
      const savedScroll = sessionStorage.getItem('sublist_scrollPos');
      if (savedScroll) {
        const scrollY = parseInt(savedScroll, 10);
        if (!isNaN(scrollY) && scrollY > 0) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo({ top: scrollY, behavior: 'instant' });
            });
          });
        }
      }
    } catch (e) {}
  }, []);

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsSearchTerm, setLogsSearchTerm] = useState('');
  const [logsTab, setLogsTab] = useState<'all' | 'deletions' | 'missing_analysis'>('all');

  const [isReminderOpen, setIsReminderOpen] = useState(false);

  // Central helper to accurately determine payment status, taking into account uploaded payment proofs
  const getSubStatus = (sub: Submission): 'Lunas' | 'Belum Lunas' | 'DP / Cicilan' => {
    if (sub.status === 'DP / Cicilan') {
      const grandTotal = (sub.items || []).reduce((s, i) => s + (Number(i.total) || 0), 0);
      const dp = Number(sub.dpAmount) || 0;
      if (dp >= grandTotal && grandTotal > 0) return 'Lunas';
      return 'DP / Cicilan';
    }
    if (sub.status === 'Lunas') return 'Lunas';
    if (sub.buktiPembayaran || (sub.googleDriveFiles || []).some(f => f.isBuktiPembayaran)) {
      return 'Lunas';
    }
    return sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas');
  };

  // Helper to check if an unpaid transaction is older than 1 week (7 days)
  const isEligibleForManualPaymentMark = (sub: Submission) => {
    const subStatus = getSubStatus(sub);
    if (subStatus !== 'Belum Lunas') return false;
    
    if (!sub.tanggal) return false;
    const subDate = new Date(sub.tanggal);
    const today = new Date();
    subDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    const diffTime = today.getTime() - subDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
  };

  // Fetch activity logs when audit logs tab is open
  const reloadLogs = () => {
    setIsLoadingLogs(true);
    loadActivityLogsFromFirestore()
      .then(data => {
        setLogs(data);
      })
      .catch(err => {
        console.error("Gagal mematikan/mengambil log riwayat:", err);
      })
      .finally(() => {
        setIsLoadingLogs(false);
      });
  };

  useEffect(() => {
    if (layoutMode === 'audit_logs') {
      reloadLogs();
    }
  }, [layoutMode]);

  // Helper to extract item texts as a concatenated string (Isi Invoice)
  const getIsiInvoice = (sub: Submission) => {
    if (!sub.items || sub.items.length === 0) {
      return sub.notes || 'Tidak ada detil items';
    }
    return sub.items.map(item => item.item).filter(Boolean).join(', ');
  };

  // Extract dynamic monthly sheets represented in submissions
  const availableSheets = useMemo(() => {
    const sheets = ['Data Sinkron'];
    const months = new Set<string>();
    submissions.forEach(sub => {
      if (sub.tanggal) {
        const parts = sub.tanggal.split('-');
        if (parts.length >= 2) {
          months.add(`${parts[0]}-${parts[1]}`); // e.g., "2026-06"
        }
      }
    });
    // Sort months descending (latest first)
    const sortedMonths = Array.from(months).sort((a, b) => b.localeCompare(a));
    sortedMonths.forEach(m => {
      sheets.push(`PT Nusantara Mineral Sukses Abadi-${m}`);
    });
    return sheets;
  }, [submissions]);

  // Dynamic list of years from submissions
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    years.add(currentYearDefault);
    submissions.forEach(sub => {
      if (sub.tanggal) {
        const parts = sub.tanggal.split('-');
        if (parts.length >= 1 && parts[0]) {
          years.add(parts[0]);
        }
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [submissions, currentYearDefault]);

  // Deteksi No-Kode sama atau Transaksi 100% sama namun BERBEDA TANGGAL (wajib dalam bulan YYYY-MM yang sama)
  const checkedDiffDateSet = useMemo(() => new Set(checkedDiffDateIds), [checkedDiffDateIds]);

  const diffDateDetection = useMemo(() => {
    const codeGroups = new Map<string, Submission[]>();
    const txGroups = new Map<string, Submission[]>();

    const normalizeDateKey = (rawDate?: string) => String(rawDate || '').trim().substring(0, 10);

    submissions.forEach((sub) => {
      if (!sub || !sub.id) return;
      if (isSubVerifiedLegit(sub)) return;

      const yearMonth = extractYearMonth(sub.tanggal);
      if (!yearMonth) return;

      // 1. Group by No-Kode 100% sama (angka, huruf, & garis miring) dalam bulan yang sama (abaikan kosong / '-' / 'HO')
      const exactKode = normalizeExactTransactionCode(sub.kode);
      if (exactKode && exactKode !== '-' && exactKode !== 'HO' && exactKode.length >= 3) {
        const kodeKey = `${yearMonth}|${exactKode}`;
        const arr = codeGroups.get(kodeKey) || [];
        arr.push(sub);
        codeGroups.set(kodeKey, arr);
      }

      // 2. Group by Bulan + Kode Transaksi 100% sama + Penerima + Jenis Pengajuan + Total Nominal 100% sama
      const subTotal = (sub.items || []).reduce((sum, item) => sum + (Number(item.total) || 0), 0) || Number((sub as any).nominal) || 0;
      const penerimaKey = normalizeText(sub.dibayarkanKepada);
      const jenisKey = normalizeText(sub.jenisPengajuan);
      if (penerimaKey && jenisKey && exactKode && exactKode !== '-' && subTotal > 0) {
        const txKey = `${yearMonth}|${exactKode}|${penerimaKey}|${jenisKey}|${subTotal}`;
        const arr = txGroups.get(txKey) || [];
        arr.push(sub);
        txGroups.set(txKey, arr);
      }
    });

    const sameCodeIds = new Set<string>();
    const sameTxIds = new Set<string>();
    const groupSortKeyMap = new Map<string, string>();

    codeGroups.forEach((group, kodeKey) => {
      const distinctDates = new Set(group.map((s) => normalizeDateKey(s.tanggal)).filter(Boolean));
      if (group.length >= 2 && distinctDates.size >= 2) {
        group.forEach((s) => {
          sameCodeIds.add(s.id);
          groupSortKeyMap.set(s.id, `KODE:${kodeKey}`);
        });
      }
    });

    txGroups.forEach((group, txKey) => {
      const distinctDates = new Set(group.map((s) => normalizeDateKey(s.tanggal)).filter(Boolean));
      if (group.length >= 2 && distinctDates.size >= 2) {
        group.forEach((s) => {
          sameTxIds.add(s.id);
          if (!groupSortKeyMap.has(s.id)) {
            groupSortKeyMap.set(s.id, `TX:${txKey}`);
          }
        });
      }
    });

    const sameAnyIds = new Set<string>([...sameCodeIds, ...sameTxIds]);

    return {
      sameCodeIds,
      sameTxIds,
      sameAnyIds,
      groupSortKeyMap,
      uncheckedCodeCount: sameCodeIds.size,
      uncheckedTxCount: sameTxIds.size,
      uncheckedAnyCount: sameAnyIds.size,
    };
  }, [submissions, isSubVerifiedLegit]);

  // Filter logic
  const filteredSubmissions = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    const numericQuery = query.replace(/[^\d]/g, '');

    const list = submissions.filter((sub) => {
      // Helper to check if submission matches numeric values (subTotal, items, DP)
      const matchNominal = (s: Submission) => {
        const subTotal = (s.items || []).reduce((sum, item) => sum + (item.total || 0), 0);
        const totalStr = String(subTotal);
        const formattedTotal = formatRupiah(subTotal).toLowerCase();
        
        if (numericQuery && totalStr.includes(numericQuery)) return true;
        if (formattedTotal.includes(query)) return true;
        if (s.dpAmount) {
          if (numericQuery && String(s.dpAmount).includes(numericQuery)) return true;
          if (formatRupiah(s.dpAmount).toLowerCase().includes(query)) return true;
        }
        return (s.items || []).some(item => {
          const val = item.total || item.nominal || 0;
          const itTotal = String(val);
          return (numericQuery && itTotal.includes(numericQuery)) ||
            formatRupiah(val).toLowerCase().includes(query);
        });
      };

      let matchSearch = true;
      if (query) {
        switch (searchCategory) {
          case 'penerima':
            matchSearch = (sub.dibayarkanKepada || '').toLowerCase().includes(query) ||
              (!!sub.pettyCashCustodian && sub.pettyCashCustodian.toLowerCase().includes(query));
            break;
          case 'jenis':
            matchSearch = (sub.jenisPengajuan || '').toLowerCase().includes(query);
            break;
          case 'transaksi':
            matchSearch = (sub.items || []).some((item) => 
              (item.item && item.item.toLowerCase().includes(query)) ||
              (item.keterangan && item.keterangan.toLowerCase().includes(query))
            ) || (!!sub.notes && sub.notes.toLowerCase().includes(query));
            break;
          case 'nominal':
            matchSearch = matchNominal(sub);
            break;
          case 'kode':
            matchSearch = (sub.kode || '').toLowerCase().includes(query);
            break;
          case 'all':
          default:
            const matchText =
              (sub.dibayarkanKepada || '').toLowerCase().includes(query) ||
              (sub.jenisPengajuan || '').toLowerCase().includes(query) ||
              (sub.lokasi || '').toLowerCase().includes(query) ||
              (sub.kode || '').toLowerCase().includes(query) ||
              (!!sub.pettyCashCustodian && sub.pettyCashCustodian.toLowerCase().includes(query)) ||
              (!!sub.notes && sub.notes.toLowerCase().includes(query)) ||
              (sub.items || []).some((item) => 
                (item.item && item.item.toLowerCase().includes(query)) ||
                (item.keterangan && item.keterangan.toLowerCase().includes(query))
              );
            const matchNum = numericQuery.length >= 2 ? matchNominal(sub) : false;
            matchSearch = matchText || matchNum;
            break;
        }
      }

      const matchMethod = methodFilter === 'All' || sub.dibayarkanDengan === methodFilter;
      const subStatus = getSubStatus(sub);
      const matchStatus = statusFilter === 'All' || subStatus === statusFilter;

      // Filter Kode / Transaksi sama namun berbeda tanggal dalam bulan yang sama
      let matchDiffDate = true;
      if (diffDateFilter !== 'all') {
        if (diffDateFilter === 'same_code_diff_date') {
          matchDiffDate = diffDateDetection.sameCodeIds.has(sub.id);
        } else if (diffDateFilter === 'same_tx_diff_date') {
          matchDiffDate = diffDateDetection.sameTxIds.has(sub.id);
        } else {
          matchDiffDate = diffDateDetection.sameAnyIds.has(sub.id);
        }
      }

      // Filter by Date, Month, Year (saat mode filter duplikat / beda tanggal / prioritas bayar aktif, abaikan batas bulan agar seluruh data terkait terlihat)
      let matchDate = true;
      if (diffDateFilter !== 'all' || duplicateFilterMode !== 'all' || priorityFilter) {
        matchDate = !dateFilter || sub.tanggal === dateFilter;
      } else if (sub.tanggal) {
        const [y, m] = sub.tanggal.split('-'); // Format "YYYY-MM-DD"
        
        const matchYear = yearFilter === 'All' || y === yearFilter;
        const matchMonth = monthFilter === 'All' || m === monthFilter;
        const matchDay = !dateFilter || sub.tanggal === dateFilter;
        
        matchDate = matchYear && matchMonth && matchDay;
      } else {
        matchDate = yearFilter === 'All' && monthFilter === 'All' && !dateFilter;
      }

      let matchDuplicates = true;
      if (duplicateFilterMode === 'exact_same') {
        matchDuplicates = duplicateInspection.exactSameIds.has(sub.id);
      } else if (duplicateFilterMode === 'same_month_diff_date') {
        matchDuplicates = duplicateInspection.sameMonthDiffDateIds.has(sub.id);
      } else if (duplicateFilterMode === 'same_code') {
        matchDuplicates = duplicateInspection.sameCodeIds.has(sub.id);
      } else if (duplicateFilterMode === 'any_duplicate') {
        matchDuplicates = duplicateInspection.allDuplicateIds.has(sub.id);
      }
      const idLow = String(sub.id || '').toLowerCase().trim();
      const isRowUnsynced = Boolean(unsyncedSubmissionIds?.has(idLow));
      const isRowSynced = !isRowUnsynced && Boolean(hasCloudInventory && cloudSyncedIds?.has(idLow));
      const matchUnsynced = !showOnlyUnsynced || isRowUnsynced;
      const matchFirestoreFilter =
        firestoreFilter === 'all' ||
        (firestoreFilter === 'unsynced' && isRowUnsynced) ||
        (firestoreFilter === 'synced' && isRowSynced);
      const matchPriority = !priorityFilter || isSubPriorityPayNext(sub);

      return matchSearch && matchMethod && matchStatus && matchDate && matchDuplicates && matchUnsynced && matchFirestoreFilter && matchDiffDate && matchPriority;
    });

    // Sort descending by tanggal (latest date first), or pin priority-to-pay rows at top, or group matching pairs together
    return list.sort((a, b) => {
      if (diffDateFilter !== 'all') {
        const keyA = diffDateDetection.groupSortKeyMap.get(a.id) || '';
        const keyB = diffDateDetection.groupSortKeyMap.get(b.id) || '';
        if (keyA !== keyB) {
          return keyA.localeCompare(keyB);
        }
      } else if (duplicateFilterMode !== 'all') {
        const keyA = duplicateInspection.groupSortKeyMap.get(a.id) || '';
        const keyB = duplicateInspection.groupSortKeyMap.get(b.id) || '';
        if (keyA !== keyB) {
          return keyA.localeCompare(keyB);
        }
      } else if (pinPriorityTop) {
        const prioA = isSubPriorityPayNext(a) ? 1 : 0;
        const prioB = isSubPriorityPayNext(b) ? 1 : 0;
        if (prioA !== prioB) {
          return prioB - prioA;
        }
      }

      // 1. Compare Date (tanggal)
      const dateA = a.tanggal || '';
      const dateB = b.tanggal || '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }

      // 2. Compare BKK serial number suffix if matching pattern e.g. "BKK-NMSA/VI/26/1020"
      const suffixA = a.kode ? parseInt(a.kode.split('/').pop() || '0', 10) : 0;
      const suffixB = b.kode ? parseInt(b.kode.split('/').pop() || '0', 10) : 0;
      if (!isNaN(suffixA) && !isNaN(suffixB) && suffixA !== suffixB) {
        return suffixB - suffixA; // Higher serial number first
      }

      // 3. Fallback to createdAt
      const timeC = a.createdAt || '';
      const timeD = b.createdAt || '';
      if (timeC !== timeD) {
        return timeD.localeCompare(timeC);
      }

      // 4. Fallback to ID
      return b.id.localeCompare(a.id);
    });
  }, [submissions, searchTerm, searchCategory, methodFilter, statusFilter, yearFilter, monthFilter, dateFilter, duplicateFilterMode, duplicateInspection, showOnlyUnsynced, firestoreFilter, diffDateFilter, diffDateDetection, checkedDiffDateSet, unsyncedSubmissionIds, hasCloudInventory, cloudSyncedIds, priorityFilter, pinPriorityTop, isSubPriorityPayNext]);

  // Ringkasan transaksi yang disorot untuk dibayar selanjutnya (Prioritas Pembayaran)
  const priorityPaySummary = useMemo(() => {
    const list = (submissions || []).filter((s) => isSubPriorityPayNext(s));
    const totalNominal = list.reduce(
      (sum, s) => sum + ((s.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0)),
      0
    );
    const unpaidCount = list.filter((s) => getSubStatus(s) !== 'Lunas').length;
    return {
      list,
      count: list.length,
      unpaidCount,
      totalNominal,
    };
  }, [submissions, isSubPriorityPayNext]);

  // Ringkasan filter aktif agar pengguna selalu tahu filter apa yang sedang membatasi tampilan
  const activeFilterDescriptors = useMemo(() => {
    const items: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (searchTerm.trim()) {
      items.push({
        key: 'search',
        label: `Kata kunci: "${searchTerm.trim()}"`,
        onClear: () => setSearchTerm(''),
      });
    }
    if (duplicateFilterMode !== 'all') {
      const dupLabel =
        duplicateFilterMode === 'exact_same'
          ? '100% Sama Semua'
          : duplicateFilterMode === 'same_month_diff_date'
          ? 'Bulan Sama, Beda Tanggal'
          : duplicateFilterMode === 'same_code'
          ? 'No-Kode Duplikat'
          : 'Semua Terfilter Duplikat';
      items.push({
        key: 'dup',
        label: `Filter Duplikat: ${dupLabel}`,
        onClear: () => setDuplicateFilterMode('all'),
      });
    }
    if (diffDateFilter !== 'all') {
      items.push({
        key: 'diffdate',
        label: 'Filter Kode/Transaksi Sama Beda Tgl',
        onClear: () => setDiffDateFilter('all'),
      });
    }
    if (priorityFilter) {
      items.push({
        key: 'priority',
        label: 'Prioritas Dibayar Selanjutnya',
        onClear: () => setPriorityFilter(false),
      });
    }
    if (firestoreFilter !== 'all' || showOnlyUnsynced) {
      items.push({
        key: 'firestore',
        label: firestoreFilter === 'synced' ? 'Status: Sudah di Firestore' : 'Status: Belum di Firestore',
        onClear: () => {
          setFirestoreFilter('all');
          setShowOnlyUnsynced(false);
        },
      });
    }
    if (statusFilter !== 'All') {
      items.push({
        key: 'status',
        label: `Status Bayar: ${statusFilter}`,
        onClear: () => setStatusFilter('All'),
      });
    }
    if (methodFilter !== 'All') {
      items.push({
        key: 'method',
        label: `Metode: ${methodFilter}`,
        onClear: () => setMethodFilter('All'),
      });
    }
    if (dateFilter) {
      items.push({
        key: 'date',
        label: `Tanggal: ${dateFilter}`,
        onClear: () => setDateFilter(''),
      });
    } else {
      if (yearFilter !== 'All' && duplicateFilterMode === 'all' && diffDateFilter === 'all' && !priorityFilter) {
        items.push({
          key: 'year',
          label: `Tahun: ${yearFilter}`,
          onClear: () => {
            setYearFilter('All');
            try { sessionStorage.setItem('sublist_hasCustomPeriodFilter', 'true'); } catch (_) {}
          },
        });
      }
      if (monthFilter !== 'All' && duplicateFilterMode === 'all' && diffDateFilter === 'all' && !priorityFilter) {
        const mName = MONTHS_LIST.find((m) => m.value === monthFilter)?.label || monthFilter;
        items.push({
          key: 'month',
          label: `Bulan: ${mName}`,
          onClear: () => {
            setMonthFilter('All');
            try { sessionStorage.setItem('sublist_hasCustomPeriodFilter', 'true'); } catch (_) {}
          },
        });
      }
    }
    return items;
  }, [searchTerm, duplicateFilterMode, diffDateFilter, priorityFilter, firestoreFilter, showOnlyUnsynced, statusFilter, methodFilter, dateFilter, yearFilter, monthFilter]);

  const checkedSelectionGroups = useMemo(() => {
    const visibleUnpaidIds = filteredSubmissions
      .filter((s) => getSubStatus(s) !== 'Lunas')
      .map((s) => s.id);
    const visibleLunasIds = filteredSubmissions
      .filter((s) => getSubStatus(s) === 'Lunas')
      .map((s) => s.id);
    const visiblePriorityIds = filteredSubmissions
      .filter((s) => isSubPriorityPayNext(s))
      .map((s) => s.id);
    const visibleUnsyncedIds = filteredSubmissions
      .filter((s) => s?.id && Boolean(unsyncedSubmissionIds?.has(String(s.id).toLowerCase().trim())))
      .map((s) => s.id);
    const visibleDuplicateIds = filteredSubmissions
      .filter((s) => activeDuplicateSubmissionIds.has(s.id))
      .map((s) => s.id);

    const selectedSubs = submissions.filter((s) => selectedCheckedSet.has(s.id));
    const selectedTotalNominal = selectedSubs.reduce(
      (sum, s) => sum + ((s.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0)),
      0
    );
    const selectedUnpaidSubs = selectedSubs.filter((s) => getSubStatus(s) !== 'Lunas');
    const selectedPrioritySubs = selectedSubs.filter((s) => isSubPriorityPayNext(s));
    const selectedNonPrioritySubs = selectedSubs.filter((s) => !isSubPriorityPayNext(s));
    const selectedLegitSubs = selectedSubs.filter((s) => isSubVerifiedLegit(s));
    const selectedUnsyncedSubs = selectedSubs.filter(
      (s) => s?.id && Boolean(unsyncedSubmissionIds?.has(String(s.id).toLowerCase().trim()))
    );

    return {
      visibleUnpaidIds,
      visibleLunasIds,
      visiblePriorityIds,
      visibleUnsyncedIds,
      visibleDuplicateIds,
      selectedSubs,
      selectedTotalNominal,
      selectedUnpaidSubs,
      selectedPrioritySubs,
      selectedNonPrioritySubs,
      selectedLegitSubs,
      selectedUnsyncedSubs,
    };
  }, [filteredSubmissions, submissions, selectedCheckedSet, isSubPriorityPayNext, unsyncedSubmissionIds, activeDuplicateSubmissionIds, isSubVerifiedLegit]);

  const handleApplyCheckSelection = (ids: string[], mode: 'replace' | 'invert' | 'clear') => {
    setIsCheckMenuOpen(false);
    if (mode === 'clear') {
      setSelectedCheckedIds([]);
      return;
    }
    if (mode === 'invert') {
      const visibleIds = filteredSubmissions.map((s) => s.id);
      const visibleSet = new Set(visibleIds);
      const invertedVisible = visibleIds.filter((id) => !selectedCheckedSet.has(id));
      setSelectedCheckedIds((prev) => [
        ...prev.filter((id) => !visibleSet.has(id)),
        ...invertedVisible,
      ]);
      return;
    }
    setSelectedCheckedIds(Array.from(new Set(ids)));
  };

  const openCheckOptionsPopover = (triggerEl: HTMLElement | null) => {
    if (isCheckMenuOpen) {
      setIsCheckMenuOpen(false);
      return;
    }
    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      const menuW = 272;
      let left = rect.left;
      if (left + menuW > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuW - 12);
      }
      setCheckMenuPosition({
        top: Math.min(window.innerHeight - 260, rect.bottom + 6),
        left: Math.max(12, left),
      });
    }
    setIsCheckMenuOpen(true);
  };

  const handleBulkMarkCheckedAsPaid = async () => {
    const unpaidTargets = checkedSelectionGroups.selectedUnpaidSubs;
    if (unpaidTargets.length === 0) return;

    if (onBulkUpdateSubmissions) {
      const updatedSubs: Submission[] = unpaidTargets.map((s) => ({
        ...s,
        status: 'Lunas' as const,
        paymentPriority: null,
        paymentPriorityAt: undefined,
      }));
      await onBulkUpdateSubmissions(
        updatedSubs,
        `✓ ${updatedSubs.length} transaksi berhasil ditandai SUDAH DIBAYAR (Lunas).`
      );
    } else if (onMarkAsPaid) {
      for (const s of unpaidTargets) {
        await onMarkAsPaid(s.id);
      }
    }

    setLocalPriorityIds((prev) => {
      const paidSet = new Set(unpaidTargets.map((s) => s.id));
      const next = prev.filter((id) => !paidSet.has(id));
      try { localStorage.setItem('nmsa_payment_priority_ids', JSON.stringify(next)); } catch (_) {}
      return next;
    });
    setBulkMarkPaidConfirmOpen(false);
    setBulkActionToast(`✓ ${unpaidTargets.length} transaksi terpilih berhasil ditandai sebagai LUNAS.`);
    setTimeout(() => setBulkActionToast(null), 5000);
  };

  const handleDownloadSelectedCSV = (targetSubs: Submission[]) => {
    if (!targetSubs || targetSubs.length === 0) {
      setBulkActionToast('Pilih minimal 1 transaksi untuk diunduh ke CSV.');
      setTimeout(() => setBulkActionToast(null), 4000);
      return;
    }
    const headers = [
      'No',
      'Tanggal',
      'No Voucher / Kode',
      'Lokasi',
      'Jenis Pengajuan',
      'Penerima',
      'Metode Pembayaran',
      'Status',
      'Prioritas Bayar',
      'Items Pengeluaran',
      'Keterangan Items',
      'Nominal (IDR)',
    ];
    const rows = targetSubs.map((sub, idx) => {
      const subTotal = (sub.items || []).reduce((sum, item) => sum + (Number(item.total) || 0), 0);
      const itemsStr = (sub.items || []).map((item) => item.item).join(' | ');
      const specStr = (sub.items || []).map((item) => item.keterangan || '').filter(Boolean).join(' | ');
      return [
        String(idx + 1),
        sub.tanggal || '',
        sub.kode || '',
        `"${(sub.lokasi || '').replace(/"/g, '""')}"`,
        `"${(sub.jenisPengajuan || '').replace(/"/g, '""')}"`,
        `"${(sub.dibayarkanKepada || '').replace(/"/g, '""')}"`,
        sub.dibayarkanDengan || '',
        getSubStatus(sub),
        isSubPriorityPayNext(sub) ? 'PRIORITAS BAYAR SELANJUTNYA' : '-',
        `"${itemsStr.replace(/"/g, '""')}"`,
        `"${specStr.replace(/"/g, '""')}"`,
        String(subTotal),
      ];
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Transaksi_Terpilih_${targetSubs.length}_Voucher.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBulkActionToast(`✓ ${targetSubs.length} transaksi terpilih berhasil diekspor ke file CSV.`);
    setTimeout(() => setBulkActionToast(null), 4000);
  };

  const unsyncedCount = useMemo(() => {
    if (!unsyncedSubmissionIds || unsyncedSubmissionIds.size === 0) return 0;
    return submissions.filter((s) => s?.id && unsyncedSubmissionIds.has(String(s.id).toLowerCase().trim())).length;
  }, [submissions, unsyncedSubmissionIds]);

  const syncedFirestoreCount = useMemo(() => {
    if (!hasCloudInventory || !cloudSyncedIds || cloudSyncedIds.size === 0) return 0;
    return submissions.filter((s) => {
      if (!s?.id) return false;
      const idLow = String(s.id).toLowerCase().trim();
      return cloudSyncedIds.has(idLow) && !unsyncedSubmissionIds?.has(idLow);
    }).length;
  }, [submissions, hasCloudInventory, cloudSyncedIds, unsyncedSubmissionIds]);

  useEffect(() => {
    if (showOnlyUnsynced && unsyncedCount === 0) {
      setShowOnlyUnsynced(false);
    }
    if (firestoreFilter === 'unsynced' && unsyncedCount === 0) {
      setFirestoreFilter('all');
    }
  }, [showOnlyUnsynced, firestoreFilter, unsyncedCount]);

  // Smart fallback: jika bulan/tahun default kosong tetapi ada data di periode lain, otomatis tampilkan Semua Bulan/Tahun
  useEffect(() => {
    if (didAutoExpandPeriodRef.current) return;
    if (submissions.length === 0) return;
    const hasCustom = (() => {
      try { return sessionStorage.getItem('sublist_hasCustomPeriodFilter') === 'true'; } catch { return false; }
    })();
    if (hasCustom) {
      didAutoExpandPeriodRef.current = true;
      return;
    }
    const hasOtherFilters = Boolean(searchTerm.trim() || methodFilter !== 'All' || statusFilter !== 'All' || dateFilter);
    if (hasOtherFilters) return;
    if (filteredSubmissions.length === 0 && (monthFilter !== 'All' || yearFilter !== 'All')) {
      didAutoExpandPeriodRef.current = true;
      const hasCurrentYear = submissions.some((s) => s.tanggal && s.tanggal.startsWith(yearFilter));
      setMonthFilter('All');
      if (!hasCurrentYear && yearFilter !== 'All') {
        setYearFilter('All');
      }
    }
  }, [submissions, filteredSubmissions.length, monthFilter, yearFilter, searchTerm, methodFilter, statusFilter, dateFilter]);

  const spreadsheetFilteredSubmissions = useMemo(() => {
    if (activeSheetTab === 'Data Sinkron') {
      return filteredSubmissions;
    }
    const prefix = 'PT Nusantara Mineral Sukses Abadi-';
    if (activeSheetTab.startsWith(prefix)) {
      const yearMonth = activeSheetTab.substring(prefix.length);
      return filteredSubmissions.filter(sub => sub.tanggal && sub.tanggal.startsWith(yearMonth));
    }
    return filteredSubmissions;
  }, [filteredSubmissions, activeSheetTab]);

  const spreadsheetSum = useMemo(() => {
    return spreadsheetFilteredSubmissions.reduce((sum, sub) => {
      const subSum = sub.items.reduce((itemSum, item) => itemSum + item.total, 0);
      return sum + subSum;
    }, 0);
  }, [spreadsheetFilteredSubmissions]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = filteredSubmissions.length;
    const totalAmount = filteredSubmissions.reduce((sum, sub) => {
      const subSum = sub.items.reduce((itemSum, item) => itemSum + item.total, 0);
      return sum + subSum;
    }, 0);

    const locationsCount = new Set(filteredSubmissions.map((s) => s.lokasi)).size;

    return {
      totalCount,
      totalAmount,
      locationsCount,
    };
  }, [filteredSubmissions]);

  // Filter on activity logs
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      const text = (log.details || '').toLowerCase() + ' ' + 
                   (log.userName || '').toLowerCase() + ' ' + 
                   (log.userEmail || '').toLowerCase() + ' ' +
                   (log.submissionCode || '').toLowerCase();
      return text.includes(logsSearchTerm.toLowerCase());
    });
  }, [logs, logsSearchTerm]);

  // Extract specifically deleted vouchers logs
  const deletionLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => log.action === 'delete_submission');
  }, [logs]);

  // Analyze missing sequential voucher codes
  const missingVouchersAnalysis = useMemo(() => {
    const results: {
      prefix: string;
      range: string;
      missing: {
        sequence: number;
        fullKode: string;
        deletedLog?: ActivityLog;
      }[];
      activeCount: number;
    }[] = [];

    // 1. Group active submissions by prefix
    const prefixMap = new Map<string, {
      rawPrefix: string;
      sequences: Set<number>;
      submissions: Submission[];
    }>();

    submissions.forEach(sub => {
      const kode = sub.kode;
      if (!kode) return;

      // 1. Strict standard BKK pattern: BKK-[COMPANY]/[ROMAN]/[YY]/[SEQ]
      // Matches exactly four parts. Example: BKK-NMSA/VI/26/1003
      const bkkMatch = kode.trim().match(/^(BKK-[A-Z0-9]+\/[IVX]+\/\d{2})\/(\d+)$/i);
      if (bkkMatch) {
        const prefix = bkkMatch[1].toUpperCase();
        const seq = parseInt(bkkMatch[2], 10);
        if (!isNaN(seq)) {
          if (!prefixMap.has(prefix)) {
            prefixMap.set(prefix, { rawPrefix: bkkMatch[1], sequences: new Set(), submissions: [] });
          }
          prefixMap.get(prefix)!.sequences.add(seq);
          prefixMap.get(prefix)!.submissions.push(sub);
        }
        return;
      }

      // 2. Strict classic short sequential pattern: e.g. "HO-002" or "PETTY-105"
      // Must be a clean alpha-numeric prefix (2 to 8 characters) separated by dash or slash to a trailing number
      const classicMatch = kode.trim().match(/^([A-Z0-9]{2,8})[\-\/](\d+)$/i);
      if (classicMatch) {
        const prefix = classicMatch[1].toUpperCase();
        const seq = parseInt(classicMatch[2], 10);
        if (!isNaN(seq)) {
          if (!prefixMap.has(prefix)) {
            prefixMap.set(prefix, { rawPrefix: classicMatch[1], sequences: new Set(), submissions: [] });
          }
          prefixMap.get(prefix)!.sequences.add(seq);
          prefixMap.get(prefix)!.submissions.push(sub);
        }
        return;
      }

      // Other codes (e.g. random imported invoice numbers or document revision codes like 'FM.FIN.03.00.05 REV.01') 
      // are ignored to avoid generating incorrect sequence gaps.
    });

    // 2. Identify gaps in sequence for each group
    prefixMap.forEach((data, prefix) => {
      const seqArr = Array.from(data.sequences).sort((a, b) => a - b);
      if (seqArr.length === 0) return;

      const minSeq = seqArr[0];
      const maxSeq = seqArr[seqArr.length - 1];

      // Auto BKK format starts at 1001. Other custom patterns start at minSeq, or 1 if minSeq is low (<= 5).
      const expectedStart = prefix.startsWith('BKK-') ? 1001 : (minSeq <= 5 ? 1 : minSeq);

      const missing: {
        sequence: number;
        fullKode: string;
        deletedLog?: ActivityLog;
      }[] = [];

      for (let s = expectedStart; s <= maxSeq; s++) {
        if (!data.sequences.has(s)) {
          // Reconstruct the voucher code
          let fullKode = '';
          if (prefix.startsWith('BKK-')) {
            fullKode = `${data.rawPrefix}/${s}`;
          } else {
            // Reconstruct based on original separator if possible, else default to suffix
            const sample = data.submissions[0]?.kode || '';
            const separator = sample.includes('/') ? '/' : sample.includes('-') ? '-' : '';
            // Match original length padding if applicable (e.g., HO-001 vs HO-1)
            const digitsMatch = sample.match(/(\d+)$/);
            if (digitsMatch) {
              const origLen = digitsMatch[1].length;
              const paddedSeq = String(s).padStart(origLen, '0');
              fullKode = `${data.rawPrefix}${separator}${paddedSeq}`;
            } else {
              fullKode = `${data.rawPrefix}${separator}${s}`;
            }
          }

          // Cross-reference with deletion logs
          const deletionLog = logs.find(log => 
            log.action === 'delete_submission' && 
            (log.submissionCode === fullKode || log.details.includes(fullKode))
          );

          missing.push({
            sequence: s,
            fullKode,
            deletedLog: deletionLog
          });
        }
      }

      if (missing.length > 0 || seqArr.length > 0) {
        results.push({
          prefix,
          range: `${expectedStart} - ${maxSeq}`,
          missing,
          activeCount: data.sequences.size
        });
      }
    });

    // Sort by prefix alphabetically
    return results.sort((a, b) => a.prefix.localeCompare(b.prefix));
  }, [submissions, logs]);

  // Grouped amounts for quick charts/budget
  const methodStats = useMemo(() => {
    let transfer = 0;
    let lunasCount = 0;
    let dpCount = 0;
    let belumLunasCount = 0;
    filteredSubmissions.forEach(sub => {
      const subSum = sub.items.reduce((itemSum, item) => itemSum + item.total, 0);
      transfer += subSum;
      const status = getSubStatus(sub);
      if (status === 'Lunas') lunasCount++;
      else if (status === 'DP / Cicilan') dpCount++;
      else belumLunasCount++;
    });
    return { transfer, lunasCount, dpCount, belumLunasCount };
  }, [filteredSubmissions]);

  // Invoice calculations and groupings
  const invoiceSubmissions = useMemo(() => {
    return submissions.filter(sub => isInvoiceSubmission(sub));
  }, [submissions]);

  // Petty Cash calculations and groupings (unified across all views)
  const pettyCashSubmissions = useMemo(() => {
    return submissions.filter(sub => isPettyCashSubmission(sub));
  }, [submissions]);

  const availablePettyCashCustodians = useMemo(() => {
    const custodians = new Set<string>();
    pettyCashSubmissions.forEach(sub => {
      const custodian = getPettyCashCustodian(sub, pettyCashHolders);
      if (custodian) {
        custodians.add(custodian);
      }
    });
    return Array.from(custodians).sort();
  }, [pettyCashSubmissions, pettyCashHolders]);

  const availablePettyCashMonths = useMemo(() => {
    const months = new Set<string>();
    pettyCashSubmissions.forEach(sub => {
      if (sub.tanggal) {
        const parts = sub.tanggal.split('-');
        if (parts.length >= 2) {
          months.add(`${parts[0]}-${parts[1]}`);
        }
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [pettyCashSubmissions]);

  const filteredPettyCashSubmissions = useMemo(() => {
    const list = pettyCashSubmissions.filter(sub => {
      // 1. Custodian Filter
      if (pettyCashCustodianFilter !== 'All') {
        const custodianName = getPettyCashCustodian(sub, pettyCashHolders).toLowerCase();
        const target = pettyCashCustodianFilter.trim().toLowerCase();
        if (custodianName !== target && !custodianName.includes(target)) {
          return false;
        }
      }

      // 2. Month Filter
      if (pettyCashMonthFilter !== 'All') {
        const parts = (sub.tanggal || '').split('-');
        const subMonth = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : '';
        if (subMonth !== pettyCashMonthFilter) return false;
      }

      // 3. Search Query
      if (pettyCashSearchQuery.trim()) {
        const query = pettyCashSearchQuery.toLowerCase();
        const textToSearch = [
          sub.kode || '',
          getPettyCashCustodian(sub, pettyCashHolders),
          sub.pettyCashCustodian || '',
          sub.jenisPengajuan || '',
          sub.notes || '',
          sub.dibayarkanKepada || ''
        ].join(' ').toLowerCase();
        if (!textToSearch.includes(query)) return false;
      }

      return true;
    });

    return sortSubmissionsDescending(list);
  }, [pettyCashSubmissions, pettyCashCustodianFilter, pettyCashMonthFilter, pettyCashSearchQuery, pettyCashHolders]);

  // Dynamic invoice month list
  const availableInvoiceMonths = useMemo(() => {
    const months = new Set<string>();
    invoiceSubmissions.forEach(sub => {
      if (sub.tanggal) {
        const parts = sub.tanggal.split('-');
        if (parts.length >= 2) {
          months.add(`${parts[0]}-${parts[1]}`); // formats "YYYY-MM"
        }
      }
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a)); // Latest first
  }, [invoiceSubmissions]);

  // Invoice list after active filters applied
  const filteredInvoiceSubmissions = useMemo(() => {
    const list = invoiceSubmissions.filter(sub => {
      // 1. Month Filter
      if (invoiceMonthFilter !== 'All') {
        const parts = sub.tanggal.split('-');
        const subMonth = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : '';
        if (subMonth !== invoiceMonthFilter) return false;
      }

      // 2. Status Filter
      if (invoiceStatusFilter !== 'All') {
        const subSum = sub.items.reduce((s, i) => s + (i.total || 0), 0);
        const subStatus = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran) ? 'Lunas' : 'Belum Lunas';
        if (subStatus !== invoiceStatusFilter) return false;
      }

      // 3. Search Query
      if (invoiceSearchQuery.trim()) {
        const q = invoiceSearchQuery.toLowerCase();
        const matchesKode = (sub.kode || '').toLowerCase().includes(q);
        const matchesPenerima = (sub.dibayarkanKepada || '').toLowerCase().includes(q);
        const matchesNoInv = (sub.invoiceNumber || '').toLowerCase().includes(q) || 
                             (sub.notes || '').toLowerCase().includes(q) ||
                             sub.items?.some(i => (i.item || '').toLowerCase().includes(q) || (i.keterangan || '').toLowerCase().includes(q));
        const matchesJenis = (sub.jenisPengajuan || '').toLowerCase().includes(q);
        
        if (!matchesKode && !matchesPenerima && !matchesNoInv && !matchesJenis) return false;
      }

      return true;
    });

    return sortSubmissionsDescending(list);
  }, [invoiceSubmissions, invoiceMonthFilter, invoiceStatusFilter, invoiceSearchQuery]);

  // Combined stats for chosen month/filters
  const invoiceRecapStats = useMemo(() => {
    let totalNominal = 0;
    let totalLunas = 0;
    let totalBelumLunas = 0;

    filteredInvoiceSubmissions.forEach(sub => {
      const grandTotal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
      const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);
      
      const invoiceAmt = typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : grandTotal;
      totalNominal += invoiceAmt;

      if (isLunas) {
        totalLunas++;
      } else {
        totalBelumLunas++;
      }
    });

    return {
      count: filteredInvoiceSubmissions.length,
      totalNominal,
      totalLunas,
      totalBelumLunas
    };
  }, [filteredInvoiceSubmissions]);

  // Month-by-month grid matrix
  const invoiceMonthlyGrid = useMemo(() => {
    const monthsMap: { [key: string]: { count: number; total: number; lunas: number; belumLunas: number } } = {};
    
    invoiceSubmissions.forEach(sub => {
      if (!sub.tanggal) return;
      const parts = sub.tanggal.split('-');
      if (parts.length < 2) return;
      const mKey = `${parts[0]}-${parts[1]}`;

      const grandTotal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
      const invoiceAmt = typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : grandTotal;
      const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);

      if (!monthsMap[mKey]) {
        monthsMap[mKey] = { count: 0, total: 0, lunas: 0, belumLunas: 0 };
      }

      monthsMap[mKey].count += 1;
      monthsMap[mKey].total += invoiceAmt;
      if (isLunas) {
        monthsMap[mKey].lunas += 1;
      } else {
        monthsMap[mKey].belumLunas += 1;
      }
    });

    return Object.entries(monthsMap)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month)); // Sort descending
  }, [invoiceSubmissions]);

  // Unpaid invoices of all time
  const unpaidInvoicesAllTime = useMemo(() => {
    return invoiceSubmissions.filter(sub => {
      const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);
      return !isLunas;
    });
  }, [invoiceSubmissions]);

  // ALL unpaid submissions of all time across the entire application
  const allUnpaidSubmissionsAllTime = useMemo(() => {
    return submissions.filter(sub => {
      const subStatus = getSubStatus(sub);
      return subStatus === 'Belum Lunas';
    });
  }, [submissions]);

  // Filtered unpaid submissions for the "Kewajiban Belum Bayar" center
  const filteredUnpaidSubmissions = useMemo(() => {
    return allUnpaidSubmissionsAllTime.filter(sub => {
      const matchSearch =
        sub.dibayarkanKepada.toLowerCase().includes(unpaidSearchTerm.toLowerCase()) ||
        sub.jenisPengajuan.toLowerCase().includes(unpaidSearchTerm.toLowerCase()) ||
        sub.lokasi.toLowerCase().includes(unpaidSearchTerm.toLowerCase()) ||
        sub.kode.toLowerCase().includes(unpaidSearchTerm.toLowerCase()) ||
        sub.items.some(item => (item.item || '').toLowerCase().includes(unpaidSearchTerm.toLowerCase()));

      const matchLocation = unpaidLocationFilter === 'All' || sub.lokasi === unpaidLocationFilter;
      return matchSearch && matchLocation;
    });
  }, [allUnpaidSubmissionsAllTime, unpaidSearchTerm, unpaidLocationFilter]);

  // Aggregate stats for outstanding payments
  const unpaidOutstandingStats = useMemo(() => {
    const totalAmount = filteredUnpaidSubmissions.reduce((sum, sub) => {
      const subSum = sub.items.reduce((itemSum, item) => itemSum + item.total, 0);
      return sum + subSum;
    }, 0);

    return {
      count: filteredUnpaidSubmissions.length,
      totalAmount,
    };
  }, [filteredUnpaidSubmissions]);

  // Dynamic set of locations showing up in unpaid items
  const unpaidLocations = useMemo(() => {
    const locSet = new Set<string>();
    allUnpaidSubmissionsAllTime.forEach(s => {
      if (s.lokasi) locSet.add(s.lokasi);
    });
    return Array.from(locSet);
  }, [allUnpaidSubmissionsAllTime]);

  const handleDownloadCSV = () => {
    if (filteredSubmissions.length === 0) {
      alert("Tidak ada data untuk diunduh!");
      return;
    }

    // Headers matching professional ledger style
    const headers = [
      "No",
      "Tanggal",
      "No Voucher / Kode",
      "Lokasi",
      "Jenis Pengajuan",
      "Penerima",
      "Metode Pembayaran",
      "Status",
      "Items Pengeluaran",
      "Keterangan Items",
      "Nominal (IDR)"
    ];

    const rows: string[][] = [];

    filteredSubmissions.forEach((sub, idx) => {
      const subTotal = sub.items.reduce((sum, item) => sum + item.total, 0);
      const itemsStr = sub.items.map(item => item.item).join(" | ");
      const specStr = sub.items.map(item => item.keterangan || "").filter(Boolean).join(" | ");
      const statusStr = getSubStatus(sub);

      rows.push([
        String(idx + 1),
        sub.tanggal || "",
        sub.kode || "",
        `"${(sub.lokasi || "").replace(/"/g, '""')}"`,
        `"${(sub.jenisPengajuan || "").replace(/"/g, '""')}"`,
        `"${(sub.dibayarkanKepada || "").replace(/"/g, '""')}"`,
        sub.dibayarkanDengan || "",
        statusStr,
        `"${itemsStr.replace(/"/g, '""')}"`,
        `"${specStr.replace(/"/g, '""')}"`,
        String(subTotal)
      ]);
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    let monthLabel = monthFilter === 'All' ? 'Semua-Bulan' : MONTHS_LIST.find(m => m.value === monthFilter)?.label || monthFilter;
    let yearLabel = yearFilter === 'All' ? 'Semua-Tahun' : yearFilter;
    let fileDateLabel = dateFilter ? `-${dateFilter}` : `-${monthLabel}-${yearLabel}`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Transaksi_PT_NMSA${fileDateLabel}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {cloudSyncNotice && (
        <div className="bg-sky-50 border border-sky-200 text-sky-900 rounded-2xl px-4 py-3 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-3xs print:hidden">
          <div className="flex items-center gap-2.5">
            <RefreshCw size={15} className={`text-sky-600 shrink-0 ${isCloudSyncing ? 'animate-spin' : ''}`} />
            <span>{cloudSyncNotice}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onRestoreBackupToFirestore && submissions.length > 0 && (
              <button
                type="button"
                onClick={onRestoreBackupToFirestore}
                disabled={isCloudSyncing}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
              >
                ☁️ Upload Backup ke Firestore
              </button>
            )}
            {onOpenDriveCleaner && (
              <button
                type="button"
                onClick={onOpenDriveCleaner}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 text-[11px] font-bold transition cursor-pointer"
              >
                🧹 Buka Pembersih Drive
              </button>
            )}
            {onDismissCloudSyncNotice && (
              <button
                type="button"
                onClick={onDismissCloudSyncNotice}
                className="p-1.5 rounded-lg hover:bg-sky-200/70 text-sky-700 transition cursor-pointer"
                title="Tutup notifikasi"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {unsyncedCount > 0 && (
        <div className="bg-orange-50 border border-orange-300 text-orange-950 rounded-2xl px-4 py-3 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs print:hidden">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-2 bg-orange-500/15 text-orange-700 rounded-xl shrink-0">
              <CloudUpload size={18} className="text-orange-600" />
            </div>
            <div>
              <p className="font-black text-orange-950">
                {unsyncedCount} Transaksi Belum Tersimpan di Firestore
              </p>
              <p className="text-[11px] text-orange-800 mt-0.5">
                {hasCloudInventory
                  ? 'Transaksi bertanda "Belum di Firestore" masih tersimpan di perangkat/server lokal dan belum masuk Cloud Firestore.'
                  : 'Perubahan transaksi lokal ini belum berhasil diunggah ke Cloud Firestore.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowOnlyUnsynced((v) => {
                  const next = !v;
                  setFirestoreFilter(next ? 'unsynced' : 'all');
                  return next;
                });
              }}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                showOnlyUnsynced || firestoreFilter === 'unsynced'
                  ? 'bg-orange-900 text-white border-orange-950'
                  : 'bg-white hover:bg-orange-100 text-orange-900 border-orange-300'
              }`}
            >
              {showOnlyUnsynced || firestoreFilter === 'unsynced' ? 'Tampilkan Semua' : `Lihat Belum di Firestore (${unsyncedCount})`}
            </button>
            {onUploadUnsyncedToFirestore && (
              <button
                type="button"
                onClick={onUploadUnsyncedToFirestore}
                disabled={isCloudSyncing}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-black transition shadow-3xs cursor-pointer disabled:opacity-50"
              >
                <CloudUpload size={13} className={isCloudSyncing ? 'animate-pulse' : ''} />
                <span>{isCloudSyncing ? 'Mengupload...' : `Upload ${unsyncedCount} ke Firestore`}</span>
              </button>
            )}
          </div>
        </div>
      )}
      {/* Persistent Missing Drive Archive Banner */}
      {(() => {
        const missingCount = submissions.filter(sub => {
          const driveFiles = sub.googleDriveFiles || [];
          const hasF1 = driveFiles.some(f => 
            (f.isF1 || (f.name && (f.name.startsWith('F1 -') || f.name.startsWith('F1-') || f.name.toUpperCase() === 'F1.PDF'))) &&
            (!!f.url && f.url.includes('drive.google.com'))
          );
          const hasF2 = driveFiles.some(f => 
            (f.isF2 || (f.name && (f.name.startsWith('F2 -') || f.name.startsWith('F2-') || f.name.toUpperCase() === 'F2.PDF'))) &&
            (!!f.url && f.url.includes('drive.google.com'))
          );
          const rawFiles = sub.files || [];
          const hasUnarchivedRawFiles = rawFiles.some(f => !f.isDrive && (!f.url || !f.url.includes('drive.google.com')));
          const hasUnarchivedPayment = sub.buktiPembayaran && (!sub.buktiPembayaran.url || !sub.buktiPembayaran.url.includes('drive.google.com'));

          return !hasF1 || !hasF2 || hasUnarchivedRawFiles || hasUnarchivedPayment || driveFiles.length === 0;
        }).length;

        if (missingCount === 0) return null;

        return (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-fade-in print:hidden">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-700 rounded-xl shrink-0">
                <Cloud size={20} className="text-amber-600 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-black text-amber-950 font-display">
                  Pengarsipan Lampiran & Dokumen F1/F2 Otomatis
                </p>
                <p className="text-[11px] text-amber-850 mt-0.5">
                  Terdapat <strong className="font-mono text-amber-950 font-bold">{missingCount} laporan</strong> yang belum memiliki F1, F2, atau lampirannya belum tersimpan di Google Drive.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              }}
              className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Sparkles size={13} />
              <span>⚡ Buka Pengarsipan ({missingCount})</span>
            </button>
          </div>
        );
      })()}

      {/* KPI Cards */}
      {layoutMode === 'standard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
          {/* Card 1 - Midnight Gold Accent */}
          <div className="relative overflow-hidden bg-stone-900 text-white p-6 rounded-2xl shadow-xs border border-stone-850 flex items-center justify-between group">
            <div className="absolute right-0 top-0 w-24 h-24 rounded-full blur-2xl transition-all group-hover:scale-125 opacity-25" style={{ backgroundColor: 'var(--brand-gold)' }}></div>
            <div className="space-y-1 relative z-10 font-display">
              <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Total Pengajuan</span>
              <div className="text-3xl font-black tracking-tight text-white">
                {stats.totalCount} <span className="text-xs font-medium text-stone-400 font-sans uppercase">Voucher</span>
              </div>
            </div>
            <div className="p-3 bg-stone-800 rounded-xl text-gold-dynamic border border-stone-750 relative z-10">
              <Calendar size={22} />
            </div>
          </div>

          {/* Card 2 - Premium Pearl White */}
          <div className="relative overflow-hidden bg-white p-6 rounded-2xl shadow-xs border border-stone-200 flex items-center justify-between group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-stone-100 rounded-full blur-2xl transition-all group-hover:scale-125"></div>
            <div className="space-y-1 relative z-10">
              <span className="text-[10px] text-stone-500 font-mono tracking-widest uppercase block">Total Nilai Kas Keluar</span>
              <div className="text-2xl font-black text-stone-900 font-mono tracking-tight">
                Rp {formatRupiah(stats.totalAmount)}
              </div>
            </div>
            <div className="p-3 bg-stone-50 rounded-xl text-stone-700 border border-stone-150 relative z-10">
              <DollarSign size={22} className="text-[#917118]" />
            </div>
          </div>

          {/* Card 3 - Corporate Summary */}
          <div className="relative overflow-hidden bg-white p-6 rounded-2xl shadow-xs border border-stone-205 flex items-center justify-between group">
            <div className="absolute right-0 top-0 w-24 h-24 bg-stone-100 rounded-full blur-2xl transition-all group-hover:scale-125"></div>
            <div className="space-y-1 relative z-10 w-full">
              <span className="text-[10px] text-stone-500 font-mono tracking-widest uppercase block">Metode & Status Pembayaran</span>
              <div className="text-xs space-y-1.5 font-mono pt-1">
                <div className="flex justify-between gap-4">
                  <span className="text-stone-450">Semua Transfer:</span>
                  <span className="font-bold text-stone-800">Rp {formatRupiah(methodStats.transfer)}</span>
                </div>
                <div className="flex justify-between gap-4 text-[11px]">
                  <span className="text-stone-450">Lunas: <strong className="text-teal-700">{methodStats.lunasCount}</strong></span>
                  <span className="text-stone-450">DP/Cicilan: <strong className="text-amber-700">{methodStats.dpCount}</strong></span>
                  <span className="text-stone-450">Belum Lunas: <strong className="text-rose-700">{methodStats.belumLunasCount}</strong></span>
                </div>
              </div>
            </div>
            <div className="p-3 bg-stone-50 rounded-xl text-stone-700 border border-stone-150 shrink-0 relative z-10">
              <MapPin size={22} className="text-stone-500" />
            </div>
          </div>
        </div>
      )}

      {/* Control Panel: Search & Filters */}
      {layoutMode === 'standard' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs divide-y divide-stone-150 print:hidden animate-fade-in">
          {/* Row 1: General search & core criteria */}
          <div className="p-3.5 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4">
            <div className="flex-1 flex flex-col md:flex-row items-stretch gap-2.5 sm:gap-3">
              {/* Dropdown Kategori Pencarian */}
              <div className="relative w-full md:w-56 shrink-0">
                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="w-full pl-3.5 pr-8 py-2.5 bg-stone-50 border border-stone-250 rounded-xl text-sm font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 cursor-pointer shadow-3xs"
                  title="Pilih kategori pencarian"
                >
                  <option value="all">🔍 Semua Kategori</option>
                  <option value="penerima">👤 Nama Penerima</option>
                  <option value="jenis">📂 Jenis Pengajuan</option>
                  <option value="transaksi">📝 Isi Transaksi</option>
                  <option value="nominal">💰 Nominal (Angka)</option>
                  <option value="kode">🏷️ No. Voucher / Kode</option>
                </select>
              </div>

              {/* Single Search Input with dynamic placeholder & clear button */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder={
                    searchCategory === 'penerima'
                      ? 'Cari nama penerima (dibayarkan kepada)...'
                      : searchCategory === 'jenis'
                      ? 'Cari jenis pengajuan (e.g. Petty Cash, Gaji, Operasional)...'
                      : searchCategory === 'transaksi'
                      ? 'Cari isi transaksi, nama barang, atau keterangan...'
                      : searchCategory === 'nominal'
                      ? 'Cari nominal (contoh: 59600000 atau 59.600)...'
                      : searchCategory === 'kode'
                      ? 'Cari no. voucher / kode pengajuan...'
                      : 'Cari penerima, jenis, transaksi, nominal, atau kode...'
                  }
                  className="w-full pl-10 pr-10 py-2.5 bg-stone-50 border border-stone-250 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 transition text-stone-900 font-medium"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1 rounded-full hover:bg-stone-200 transition cursor-pointer"
                    title="Hapus pencarian"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

            </div>

            {/* Action Button Container */}
            <div className="grid grid-cols-1 sm:flex sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full xl:w-auto">


              <button
                onClick={() => onOpenBuktiTransfer?.()}
                id="btn-upload-bukti-transfer"
                className="flex items-center justify-center gap-1 px-4 py-2.5 border border-stone-250 bg-white hover:bg-stone-50 hover:border-stone-400 text-stone-700 font-bold rounded-xl transition shadow-3xs cursor-pointer text-xs"
              >
                <RefreshCw size={14} className="text-amber-500 mr-1" />
                <span>Upload Bukti Bayar</span>
              </button>

              <button
                onClick={() => {
                  triggerGoogleDriveAutoRefresh('btn-input-pengajuan', false, false).catch(() => {});
                  onAddNew();
                }}
                id="btn-add-new-submission"
                className="flex items-center justify-center gap-2 bg-gold-dynamic hover:bg-gold-dynamic-hover text-stone-900 font-extrabold px-5 py-2.5 rounded-xl transition shadow-xs focus:ring-2 focus:ring-amber-300 cursor-pointer text-xs font-display tracking-wide"
              >
                <Plus size={16} />
                <span>Input Pengajuan Baru</span>
              </button>
            </div>
          </div>

          {/* Row 2: Monthly, Yearly, Date, Unified Filter & Action Buttons */}
          <div className="p-3.5 sm:px-5 sm:py-4 bg-stone-50/40 flex flex-col xl:flex-row xl:items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-2.5 sm:gap-3">
              {/* Year Filter Option */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2.5 sm:gap-3 w-full sm:w-auto">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Tahun</span>
                  <select
                    className="w-full sm:w-auto px-3 py-2 bg-white border border-stone-250 rounded-xl text-xs focus:ring-2 focus:ring-stone-400 focus:outline-none text-stone-850 sm:min-w-[96px] font-medium"
                    value={yearFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setYearFilter(val);
                      try {
                        sessionStorage.setItem('sublist_yearFilter', val);
                        sessionStorage.setItem('sublist_hasCustomPeriodFilter', 'true');
                      } catch (err) {}
                    }}
                  >
                    <option value="All">Semua Tahun</option>
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>

                {/* Month Filter Option */}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Bulan</span>
                  <select
                    className="w-full sm:w-auto px-3 py-2 bg-white border border-stone-250 rounded-xl text-xs focus:ring-2 focus:ring-stone-400 focus:outline-none text-stone-850 sm:min-w-[140px] font-medium"
                    value={monthFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMonthFilter(val);
                      try {
                        sessionStorage.setItem('sublist_monthFilter', val);
                        sessionStorage.setItem('sublist_hasCustomPeriodFilter', 'true');
                      } catch (err) {}
                    }}
                  >
                    {MONTHS_LIST.map(m => (
                      <option key={m.value} value={m.value}>
                        {m.label} {m.value === currentMonthDefault ? '★ (Bulan Ini)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Jump to Current Month Button */}
              <div className="self-end">
                <button
                  type="button"
                  onClick={() => {
                    setYearFilter(currentYearDefault);
                    setMonthFilter(currentMonthDefault);
                    setDateFilter('');
                    try {
                      sessionStorage.setItem('sublist_yearFilter', currentYearDefault);
                      sessionStorage.setItem('sublist_monthFilter', currentMonthDefault);
                      sessionStorage.setItem('sublist_hasCustomPeriodFilter', 'true');
                    } catch (err) {}
                  }}
                  title={`Tampilkan default bulan ini (${MONTHS_LIST.find(m => m.value === currentMonthDefault)?.label || ''} ${currentYearDefault})`}
                  className={`px-3 py-2 text-xs font-bold font-mono rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-3xs whitespace-nowrap ${
                    monthFilter === currentMonthDefault && yearFilter === currentYearDefault && !dateFilter
                      ? 'bg-amber-600 text-white shadow-xs font-bold'
                      : 'bg-white hover:bg-amber-50 text-amber-800 border border-amber-300'
                  }`}
                >
                  <Calendar size={13} />
                  <span>Bulan Ini ({MONTHS_LIST.find(m => m.value === currentMonthDefault)?.label})</span>
                </button>
              </div>

              {/* Specific Date Picker Input */}
              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Tanggal Spesifik</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    className="w-full sm:w-auto px-3 py-2 bg-white border border-stone-250 rounded-xl text-xs focus:ring-2 focus:ring-stone-400 focus:outline-none text-stone-850 font-mono"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  />
                  {dateFilter && (
                    <button
                      onClick={() => setDateFilter('')}
                      className="px-2.5 py-2 hover:bg-stone-200/60 text-stone-550 hover:text-stone-800 text-[11px] font-mono font-bold rounded-lg transition shrink-0"
                      title="Bersihkan Tanggal"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Unified Filter: Transaksi Duplikat + Prioritas Bayar + Status Firestore + Cek Kode / Transaksi Sama Beda Tanggal */}
              <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Filter &amp; Cek Data</span>
                <select
                  className={`w-full sm:w-auto px-3 py-2 rounded-xl text-xs focus:ring-2 focus:outline-none sm:min-w-[205px] transition ${
                    duplicateFilterMode !== 'all'
                      ? 'bg-rose-50 border-2 border-rose-400 text-rose-950 font-bold focus:ring-rose-400'
                      : priorityFilter
                      ? 'bg-amber-50 border-2 border-amber-500 text-amber-950 font-bold focus:ring-amber-400'
                      : diffDateFilter !== 'all'
                      ? 'bg-amber-50 border-2 border-amber-400 text-amber-950 font-bold focus:ring-amber-400'
                      : firestoreFilter !== 'all'
                      ? 'bg-sky-50 border-2 border-sky-400 text-sky-950 font-bold focus:ring-sky-400'
                      : 'bg-white border border-stone-250 text-stone-850 font-medium focus:ring-stone-400'
                  }`}
                  value={
                    duplicateFilterMode !== 'all'
                      ? `dup_${duplicateFilterMode}`
                      : priorityFilter
                      ? 'priority_next'
                      : diffDateFilter !== 'all'
                      ? diffDateFilter
                      : firestoreFilter
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'priority_next') {
                      setPriorityFilter(true);
                      setDuplicateFilterMode('all');
                      setDiffDateFilter('all');
                      setFirestoreFilter('all');
                      setShowOnlyUnsynced(false);
                    } else if (
                      val === 'dup_any_duplicate' ||
                      val === 'dup_exact_same' ||
                      val === 'dup_same_month_diff_date' ||
                      val === 'dup_same_code'
                    ) {
                      const mode = val.replace('dup_', '') as 'any_duplicate' | 'exact_same' | 'same_month_diff_date' | 'same_code';
                      setDuplicateFilterMode(mode);
                      setPriorityFilter(false);
                      setDiffDateFilter('all');
                      setFirestoreFilter('all');
                      setShowOnlyUnsynced(false);
                    } else if (val === 'same_any_diff_date' || val === 'same_code_diff_date' || val === 'same_tx_diff_date') {
                      setDiffDateFilter(val);
                      setPriorityFilter(false);
                      setDuplicateFilterMode('all');
                      setFirestoreFilter('all');
                      setShowOnlyUnsynced(false);
                    } else if (val === 'synced' || val === 'unsynced') {
                      setPriorityFilter(false);
                      setDiffDateFilter('all');
                      setDuplicateFilterMode('all');
                      setFirestoreFilter(val);
                      setShowOnlyUnsynced(val === 'unsynced');
                    } else {
                      setPriorityFilter(false);
                      setDiffDateFilter('all');
                      setDuplicateFilterMode('all');
                      setFirestoreFilter('all');
                      setShowOnlyUnsynced(false);
                    }
                  }}
                  title="Saring transaksi prioritas dibayar selanjutnya, duplikat ketat, beda tanggal di bulan sama, atau status Cloud Firestore"
                >
                  <option value="all">Semua Data ({submissions.length})</option>
                  <optgroup label="Prioritas Pembayaran">
                    <option value="priority_next">
                      ⭐ Prioritas Dibayar Selanjutnya ({priorityPaySummary.count})
                    </option>
                  </optgroup>
                  <optgroup label="Filter Duplikat Ketat (100% Sama · Bulan Sama)">
                    <option value="dup_any_duplicate">
                      Semua Terfilter Duplikat ({duplicateInspection.allDuplicateIds.size})
                    </option>
                    <option value="dup_exact_same">
                      100% Sama Tgl, Kode, Nominal, Penerima &amp; Jenis ({duplicateInspection.exactSameIds.size})
                    </option>
                    <option value="dup_same_month_diff_date">
                      Bulan Sama &amp; 100% Sama (Kode, Nominal, Penerima, Jenis), Beda Tgl ({duplicateInspection.sameMonthDiffDateIds.size})
                    </option>
                    <option value="dup_same_code">
                      Kode Transaksi 100% Sama di Bulan Sama ({duplicateInspection.sameCodeIds.size})
                    </option>
                  </optgroup>
                  <optgroup label="Cek Kode / Transaksi (Bulan Sama, Beda Tanggal)">
                    <option value="same_any_diff_date">
                      Kode / Transaksi Sama Beda Tgl ({diffDateDetection.uncheckedAnyCount})
                    </option>
                    <option value="same_code_diff_date">
                      Kode Transaksi 100% Sama Beda Tgl ({diffDateDetection.uncheckedCodeCount})
                    </option>
                    <option value="same_tx_diff_date">
                      Transaksi &amp; Kode 100% Sama Beda Tgl ({diffDateDetection.uncheckedTxCount})
                    </option>
                  </optgroup>
                  <optgroup label="Status Cloud Firestore">
                    <option value="synced" disabled={!hasCloudInventory}>
                      {hasCloudInventory ? `✓ Sudah di Firestore (${syncedFirestoreCount})` : '✓ Sudah di Firestore (Belum dicek)'}
                    </option>
                    <option value="unsynced">⏳ Belum di Firestore ({unsyncedCount})</option>
                  </optgroup>
                </select>
              </div>

              {/* Quick One-Click Toggle Button: Filter Transaksi Duplikat Ketat */}
              <div className="self-end">
                <button
                  type="button"
                  onClick={() => {
                    if (duplicateFilterMode !== 'all') {
                      setDuplicateFilterMode('all');
                    } else {
                      setDuplicateFilterMode('any_duplicate');
                      setDiffDateFilter('all');
                      setFirestoreFilter('all');
                      setShowOnlyUnsynced(false);
                    }
                  }}
                  title="Tampilkan hanya transaksi yang 100% sama (Tanggal, Kode Transaksi angka/huruf/garis miring, Nominal, Penerima & Jenis Transaksi) serta yang 100% sama di bulan sama namun beda tanggal"
                  className={`px-3 py-2 text-xs font-bold font-mono rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-3xs whitespace-nowrap border ${
                    duplicateFilterMode !== 'all'
                      ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                      : duplicateInspection.allDuplicateIds.size > 0
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300'
                      : 'bg-white hover:bg-stone-100 text-stone-600 border-stone-250'
                  }`}
                >
                  <Layers size={13} />
                  <span>Filter Duplikat ({duplicateInspection.allDuplicateIds.size})</span>
                </button>
              </div>
            </div>

            {/* Compact Action Buttons: Satukan Nama & Cetak List (PDF) */}
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full xl:w-auto">
              {onOpenConsolidateModal && (
                <button
                  type="button"
                  onClick={onOpenConsolidateModal}
                  className="flex-1 xl:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 border border-amber-600 text-stone-950 font-black rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none whitespace-nowrap"
                  title="Satukan & Rapikan Variasi Nama Penerima atau Pemegang Petty Cash yang Mirip"
                >
                  <Sparkles size={13} className="text-stone-950" />
                  <span>Satukan Nama</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsListPrintPreviewOpen(true)}
                className="flex-1 xl:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-955 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none whitespace-nowrap"
                title="Buka Menu Pratinjau, Atur/Hilangkan Penanda Tangan, & Cetak List (PDF)"
              >
                <Printer size={13} className="text-amber-500" />
                <span>Cetak List (PDF)</span>
              </button>
            </div>
          </div>

          {/* Active Filter Summary Strip: Menjelaskan secara transparan filter/pencarian apa yang sedang aktif */}
          {activeFilterDescriptors.length > 0 && (
            <div className="px-3.5 sm:px-5 py-2.5 bg-stone-50/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mr-1">
                  <Filter size={11} />
                  <span>Filter Aktif:</span>
                </span>
                {activeFilterDescriptors.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onClear}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-stone-300 hover:border-rose-300 text-stone-800 hover:text-rose-800 text-[11px] font-semibold transition cursor-pointer"
                    title={`Klik untuk menghapus filter: ${item.label}`}
                  >
                    <span>{item.label}</span>
                    <X size={11} className="text-stone-400" />
                  </button>
                ))}
                <span className="text-[11px] font-mono text-stone-500 ml-1 tabular-nums">
                  ({filteredSubmissions.length} hasil)
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-bold transition cursor-pointer shrink-0 whitespace-nowrap"
              >
                <RotateCcw size={11} />
                <span>Reset Semua Filter</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sorotan Prioritas Pembayaran Selanjutnya */}
      {layoutMode === 'standard' && priorityPaySummary.count > 0 && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-2xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs shadow-3xs print:hidden">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2 bg-amber-500 text-stone-950 rounded-xl shrink-0">
              <Star size={16} className="fill-stone-950" />
            </div>
            <div className="min-w-0">
              <div className="font-black text-amber-950 flex flex-wrap items-center gap-2">
                <span>Prioritas Dibayar Selanjutnya:</span>
                <span className="font-mono tabular-nums px-2 py-0.5 rounded-md bg-amber-200/80 text-stone-950 text-[11px]">
                  {priorityPaySummary.count} Transaksi ({priorityPaySummary.unpaidCount} Belum Lunas)
                </span>
                <span className="font-mono tabular-nums font-black text-amber-900">
                  Rp {formatRupiah(priorityPaySummary.totalNominal)}
                </span>
              </div>
              <p className="text-[11px] text-amber-900/90 mt-0.5">
                Transaksi yang disorot ditandai warna emas pada daftar agar mudah diprioritaskan saat pembayaran berikutnya.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPinPriorityTop((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer whitespace-nowrap ${
                pinPriorityTop
                  ? 'bg-amber-500 text-stone-950 border-amber-600'
                  : 'bg-white hover:bg-amber-100 text-amber-950 border-amber-300'
              }`}
              title="Tempatkan transaksi prioritas di urutan paling atas tabel"
            >
              {pinPriorityTop ? '✓ Prioritas di Atas' : 'Urutkan Prioritas di Atas'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPriorityFilter((v) => !v);
                setDuplicateFilterMode('all');
                setDiffDateFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer whitespace-nowrap ${
                priorityFilter
                  ? 'bg-stone-900 text-white border-stone-950'
                  : 'bg-white hover:bg-amber-100 text-amber-950 border-amber-300'
              }`}
            >
              {priorityFilter ? 'Tampilkan Semua Data' : `Lihat Prioritas (${priorityPaySummary.count})`}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCheckedIds(priorityPaySummary.list.map((s) => s.id))}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-bold transition cursor-pointer whitespace-nowrap"
              title="Centang seluruh transaksi prioritas untuk tindakan massal"
            >
              Centang Prioritas ({priorityPaySummary.count})
            </button>
          </div>
        </div>
      )}

      {/* Toast feedback setelah menandai transaksi sah atau aksi massal */}
      {bulkActionToast && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 shadow-xs animate-fade-in print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            <span>{bulkActionToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkActionToast(null)}
            className="p-1 rounded-lg hover:bg-emerald-200/70 text-emerald-800 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Active Filter Notification: Transaksi Duplikat Ketat */}
      {showOnlyDuplicates && (
        <div className="p-3.5 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border border-rose-300 rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs text-stone-900 font-sans shadow-3xs mb-4 animate-fade-in print:hidden">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-1.5 bg-rose-100 text-rose-700 rounded-xl shrink-0 border border-rose-300">
              <AlertTriangle size={18} />
            </div>
            <div className="space-y-1">
              <div>
                <span className="font-black text-rose-950 block sm:inline">
                  Filter Duplikat Ketat (100% Sama · Bulan Sama) Aktif:
                </span>{' '}
                <span>
                  Menampilkan <strong>{filteredSubmissions.length} voucher</strong>
                  {searchTerm.trim() ? ` (disaring kata kunci "${searchTerm.trim()}" dari ${duplicateInspection.allDuplicateIds.size} duplikat)` : ''} yang 100% sama (Tanggal, Kode Transaksi angka/huruf/garis miring, Nominal, Penerima &amp; Jenis Transaksi) atau sama persis di bulan yang sama namun berbeda tanggal.
                </span>
              </div>
              {searchTerm.trim() && filteredSubmissions.length === 0 && duplicateInspection.allDuplicateIds.size > 0 && (
                <div className="p-2 bg-white/90 border border-rose-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-900 font-semibold">
                  <span>
                    Kata kunci pencarian <strong>"{searchTerm.trim()}"</strong> sedang aktif dan menyembunyikan <strong>{duplicateInspection.allDuplicateIds.size}</strong> transaksi duplikat.
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer whitespace-nowrap"
                  >
                    Hapus Pencarian "{searchTerm.trim()}"
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <button
                  type="button"
                  onClick={() => setDuplicateFilterMode('any_duplicate')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono cursor-pointer border transition ${
                    duplicateFilterMode === 'any_duplicate'
                      ? 'bg-rose-600 text-white border-rose-700'
                      : 'bg-white hover:bg-rose-50 text-stone-700 border-stone-300'
                  }`}
                >
                  Semua Terfilter ({duplicateInspection.allDuplicateIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateFilterMode('exact_same')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono cursor-pointer border transition ${
                    duplicateFilterMode === 'exact_same'
                      ? 'bg-rose-600 text-white border-rose-700'
                      : 'bg-white hover:bg-rose-50 text-stone-700 border-stone-300'
                  }`}
                >
                  100% Sama Semua ({duplicateInspection.exactSameIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateFilterMode('same_month_diff_date')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono cursor-pointer border transition ${
                    duplicateFilterMode === 'same_month_diff_date'
                      ? 'bg-amber-600 text-white border-amber-700'
                      : 'bg-white hover:bg-amber-50 text-stone-700 border-stone-300'
                  }`}
                >
                  Bulan Sama, Beda Tanggal ({duplicateInspection.sameMonthDiffDateIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateFilterMode('same_code')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono cursor-pointer border transition ${
                    duplicateFilterMode === 'same_code'
                      ? 'bg-rose-600 text-white border-rose-700'
                      : 'bg-white hover:bg-rose-50 text-stone-700 border-stone-300'
                  }`}
                >
                  No-Kode Duplikat ({duplicateInspection.sameCodeIds.size})
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto">
            <button
              type="button"
              onClick={() => {
                setSelectedClusterKey(null);
                setDuplicateModalSearch('');
                setIsDuplicateModalOpen(true);
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black rounded-xl text-xs shadow-3xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Layers size={13} />
              <span>Lihat Rekap Kelompok Dobel</span>
            </button>
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 font-bold border border-stone-300 rounded-xl text-xs transition cursor-pointer whitespace-nowrap"
            >
              Tampilkan Semua
            </button>
          </div>
        </div>
      )}

      {/* Active Filter Notification: Kode / Transaksi Sama Beda Tanggal (Bulan Sama) */}
      {diffDateFilter !== 'all' && (
        <div className="p-3.5 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-950 font-sans shadow-3xs mb-4 animate-fade-in print:hidden">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-1.5 bg-amber-200 text-amber-900 rounded-xl shrink-0 border border-amber-300">
              <AlertTriangle size={18} />
            </div>
            <div>
              <span className="font-black text-amber-950 block sm:inline">
                Filter {diffDateFilter === 'same_code_diff_date' ? 'No-Kode Sama (Bulan Sama, Beda Tanggal)' : diffDateFilter === 'same_tx_diff_date' ? 'Transaksi 100% Sama (Bulan Sama, Beda Tanggal)' : 'No-Kode / Transaksi 100% Sama (Bulan Sama, Beda Tanggal)'} Aktif:
              </span>{' '}
              <span>
                Menampilkan <strong>{filteredSubmissions.length} voucher</strong> yang identik dalam bulan yang sama namun berbeda tanggal. Centang kolom <strong>Check</strong> lalu pilih tindakan yang diinginkan.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {checkedDiffDateIds.length > 0 && (
              <button
                type="button"
                onClick={handleResetCheckedDiffDate}
                className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 font-bold border border-rose-300 rounded-xl text-xs transition cursor-pointer"
                title="Deteksi ulang transaksi yang sebelumnya ditandai sah"
              >
                Reset Tanda Sah ({checkedDiffDateIds.length})
              </button>
            )}
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Tampilkan Semua
            </button>
          </div>
        </div>
      )}

      {/* Action Bar Lengkap saat ada transaksi yang dicentang (Check) - mencakup pilihan menu Tindakan + Sorotan Prioritas Bayar */}
      {layoutMode === 'standard' && selectedCheckedIds.length > 0 && (() => {
        const selectedSubs = checkedSelectionGroups.selectedSubs;
        const singleSelectedSub = selectedSubs.length === 1 ? selectedSubs[0] : null;
        const unpaidSelectedCount = checkedSelectionGroups.selectedUnpaidSubs.length;
        const prioritySelectedCount = checkedSelectionGroups.selectedPrioritySubs.length;
        const nonPrioritySelectedCount = checkedSelectionGroups.selectedNonPrioritySubs.length;
        const legitSelectedCount = checkedSelectionGroups.selectedLegitSubs.length;
        const unsyncedSelectedSubs = checkedSelectionGroups.selectedUnsyncedSubs;

        return (
          <div className="sticky top-20 z-[70] p-3.5 sm:px-5 bg-stone-900 text-white border border-amber-400/80 rounded-2xl shadow-xl space-y-3 animate-fade-in print:hidden">
            {/* Header ringkasan pilihan */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-800">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-400 text-stone-950 font-black text-xs font-mono tabular-nums">
                  <Check size={14} />
                  <span>{selectedCheckedIds.length} Transaksi Dipilih</span>
                </span>
                <span className="text-xs font-mono font-bold text-amber-300 tabular-nums">
                  Total: Rp {formatRupiah(checkedSelectionGroups.selectedTotalNominal)}
                </span>
                {singleSelectedSub && (
                  <span className="text-[11px] text-stone-300 truncate max-w-[260px]">
                    · {singleSelectedSub.kode || 'Tanpa Kode'} — {singleSelectedSub.dibayarkanKepada}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleClearSelectedChecks}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white text-[11px] font-bold transition cursor-pointer whitespace-nowrap"
              >
                <X size={12} />
                <span>Batal Pilih</span>
              </button>
            </div>

            {/* Daftar tombol tindakan lengkap */}
            <div className="flex flex-wrap items-center gap-2">
              {/* 1. Soroti / Prioritaskan untuk Dibayar Selanjutnya */}
              {nonPrioritySelectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleSetPaymentPriority(selectedSubs, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition cursor-pointer whitespace-nowrap"
                  title="Soroti transaksi terpilih agar diprioritaskan untuk dibayar selanjutnya"
                >
                  <Star size={14} className="fill-stone-950" />
                  <span>Soroti Prioritas Bayar ({selectedSubs.length})</span>
                </button>
              )}
              {prioritySelectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleSetPaymentPriority(checkedSelectionGroups.selectedPrioritySubs, false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/40 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                  title="Hapus sorotan prioritas bayar dari transaksi yang sudah ditandai"
                >
                  <X size={13} />
                  <span>Hapus Sorotan Prioritas ({prioritySelectedCount})</span>
                </button>
              )}

              {/* 2. Input Bukti Bayar (jika 1 transaksi) & Tandai Lunas */}
              {singleSelectedSub && onOpenBuktiTransfer && (
                <button
                  type="button"
                  onClick={() => onOpenBuktiTransfer(singleSelectedSub)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition cursor-pointer whitespace-nowrap"
                  title="Input atau unggah bukti transfer/pembayaran untuk transaksi ini"
                >
                  <Receipt size={14} />
                  <span>Input Bukti Bayar</span>
                </button>
              )}
              {unpaidSelectedCount > 0 && (onBulkUpdateSubmissions || onMarkAsPaid) && (
                <button
                  type="button"
                  onClick={() => setBulkMarkPaidConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer whitespace-nowrap"
                  title="Tandai transaksi belum lunas yang dipilih sebagai SUDAH DIBAYAR (Lunas)"
                >
                  <CheckCircle size={14} />
                  <span>Tandai Lunas ({unpaidSelectedCount})</span>
                </button>
              )}

              {/* 3. Upload ke Firestore */}
              {(onUploadSelectedToFirestore || onUploadSingleToFirestore) && (
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={async () => {
                    const targets = unsyncedSelectedSubs.length > 0 ? unsyncedSelectedSubs : selectedSubs;
                    if (onUploadSelectedToFirestore) {
                      await onUploadSelectedToFirestore(targets);
                    } else if (onUploadSingleToFirestore) {
                      for (const s of targets) {
                        await onUploadSingleToFirestore(s);
                      }
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                    unsyncedSelectedSubs.length > 0
                      ? 'bg-orange-600 hover:bg-orange-500 text-white'
                      : 'bg-sky-700 hover:bg-sky-600 text-white'
                  }`}
                  title="Upload atau sinkronkan ulang transaksi terpilih ke Firebase Firestore"
                >
                  <CloudUpload size={14} />
                  <span>
                    {unsyncedSelectedSubs.length > 0
                      ? `Upload ke Firestore (${unsyncedSelectedSubs.length})`
                      : `Sync Firestore (${selectedSubs.length})`}
                  </span>
                </button>
              )}

              {/* 4. Tindakan Dokumen (mirror menu Tindakan saat 1 transaksi dicentang) */}
              {singleSelectedSub && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      triggerGoogleDriveAutoRefresh('check-lihat-voucher', false, false).catch(() => {});
                      onSelect(singleSelectedSub);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                  >
                    <Eye size={14} />
                    <span>Lihat Voucher</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(singleSelectedSub)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-sky-300 border border-stone-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                  >
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicate(singleSelectedSub)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                  >
                    <Copy size={14} />
                    <span>Salin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShareModalSub(singleSelectedSub);
                      setIsCopiedShare(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-emerald-300 border border-stone-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                  >
                    <Share2 size={14} />
                    <span>Bagikan Link</span>
                  </button>
                  {onCreateMemo && (
                    <button
                      type="button"
                      onClick={() => onCreateMemo(singleSelectedSub)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-200 border border-stone-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                    >
                      <FileText size={14} />
                      <span>Buat Memo</span>
                    </button>
                  )}
                  {((singleSelectedSub.jenisPengajuan || '').toLowerCase().includes('perjalanan dinas') ||
                    (singleSelectedSub.jenisPengajuan || '').toLowerCase().includes('sppd')) &&
                    onOpenSppdEditor && (
                      <button
                        type="button"
                        onClick={() => onOpenSppdEditor(singleSelectedSub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-200 border border-stone-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                      >
                        <FileText size={14} />
                        <span>Form SPPD</span>
                      </button>
                    )}
                </>
              )}

              {/* 5. Export CSV Terpilih */}
              <button
                type="button"
                onClick={() => handleDownloadSelectedCSV(selectedSubs)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                title="Unduh transaksi terpilih dalam format Excel/CSV"
              >
                <Download size={14} />
                <span>Export CSV ({selectedSubs.length})</span>
              </button>

              {/* 6. Tandai Transaksi Sah / Batalkan Tanda Sah */}
              <button
                type="button"
                id="btn-mark-selected-sah"
                onClick={handleMarkSelectedAsLegitimate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition cursor-pointer whitespace-nowrap"
                title="Tandai transaksi yang dicentang sebagai transaksi sah agar tidak lagi masuk filter duplikat"
              >
                <CheckCircle size={14} />
                <span>Tandai Transaksi Sah ({selectedCheckedIds.length})</span>
              </button>
              {legitSelectedCount > 0 && (
                <button
                  type="button"
                  onClick={handleUnmarkSelectedAsLegitimate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 font-bold text-xs transition cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw size={13} />
                  <span>Batalkan Sah ({legitSelectedCount})</span>
                </button>
              )}

              {/* 7. Hapus Terpilih */}
              <button
                type="button"
                id="btn-delete-selected-checked"
                onClick={() => {
                  setBulkDeleteIncludeDrive(true);
                  setBulkDeleteConfirmOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition cursor-pointer whitespace-nowrap ml-auto"
                title="Hapus semua transaksi yang dicentang secara permanen"
              >
                <Trash2 size={14} />
                <span>Hapus ({selectedCheckedIds.length})</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Main Content Layout Block: Standard List vs Google Sheets Simulator */}
      {layoutMode === 'standard' ? (
        /* Standard Table & Mobile Card View */
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs print:hidden overflow-hidden">
          {/* Mobile Select-All + Pilihan Menu Check Bar (Muncul otomatis saat ada transaksi dipilih) */}
          {showCheckColumn && filteredSubmissions.length > 0 && (
            <div className="flex md:hidden items-center justify-between px-3.5 py-2.5 bg-stone-50 border-b border-stone-200 text-xs gap-2">
              <div className="flex items-center gap-1.5 check-menu-dropdown-root">
                <input
                  type="checkbox"
                  checked={filteredSubmissions.length > 0 && filteredSubmissions.every((s) => selectedCheckedSet.has(s.id))}
                  onChange={() => {
                    const visibleIds = filteredSubmissions.map((s) => s.id);
                    const allSelected = visibleIds.every((id) => selectedCheckedSet.has(id));
                    if (allSelected) {
                      const visibleSet = new Set(visibleIds);
                      setSelectedCheckedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
                    } else {
                      setSelectedCheckedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                    }
                  }}
                  className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                  aria-label="Centang semua transaksi yang tampil"
                />
                <button
                  type="button"
                  onClick={(e) => openCheckOptionsPopover(e.currentTarget)}
                  className="inline-flex items-center justify-center p-1 rounded-md bg-white border border-stone-300 text-stone-700 cursor-pointer"
                  title="Buka menu pilihan centang"
                  aria-label="Buka menu pilihan centang"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
              <span className="font-mono text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 tabular-nums">
                {selectedCheckedIds.length} dipilih
              </span>
            </div>
          )}

          {/* Mobile Screen Card View (Layar HP) - Responsif, Bebas Terpotong & Melebihi Layar */}
          <div className="block md:hidden divide-y divide-stone-150">
            {filteredSubmissions.length > 0 ? (
              filteredSubmissions.map((sub) => {
                const subTotal = sub.items.reduce((sum, i) => sum + i.total, 0);
                const isDuplicateActive = activeDuplicateSubmissionIds.has(sub.id);
                const isRowChecked = selectedCheckedSet.has(sub.id);
                const isVerifiedLegit = isSubVerifiedLegit(sub);
                const isPriorityPay = isSubPriorityPayNext(sub);
                return (
                  <div
                    key={`mob-${sub.id}`}
                    className={`p-3.5 sm:p-4 transition space-y-2.5 ${
                      isRowChecked
                        ? 'bg-sky-50/75 ring-1 ring-inset ring-sky-300/70'
                        : isPriorityPay
                        ? 'bg-amber-50/90 ring-1 ring-inset ring-amber-300/80'
                        : isDuplicateActive
                        ? 'bg-amber-50/40'
                        : 'bg-white hover:bg-stone-50/50'
                    }`}
                  >
                    {/* Header bar: Tanggal, Kode & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-extrabold text-stone-900 text-xs flex items-center gap-2 flex-wrap">
                          {showCheckColumn && (
                            <input
                              type="checkbox"
                              checked={isRowChecked}
                              onChange={() => handleToggleSelectCheck(sub.id)}
                              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                              title={isRowChecked ? 'Batalkan centang transaksi ini' : 'Centang transaksi ini untuk tindakan massal'}
                              aria-label="Pilih transaksi"
                            />
                          )}
                          <span>{formatDateIndonesian(sub.tanggal)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="font-mono text-[10px] font-bold bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200">
                            Kode: {sub.kode || '-'}
                          </span>
                          {isPriorityPay && (
                            <span className="inline-flex items-center gap-1 font-mono text-[9px] font-black bg-amber-400 text-stone-950 px-2 py-0.5 rounded border border-amber-500">
                              <Star size={10} className="fill-stone-950" />
                              <span>PRIORITAS BAYAR SELANJUTNYA</span>
                            </span>
                          )}
                          {diffDateFilter !== 'all' && (
                            <span className="font-mono text-[9px] font-black bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">
                              {diffDateDetection.sameCodeIds.has(sub.id) && diffDateDetection.sameTxIds.has(sub.id)
                                ? 'Kode & Transaksi 100% Sama (Beda Tgl)'
                                : diffDateDetection.sameCodeIds.has(sub.id)
                                ? 'Kode Sama Beda Tgl (Bulan Sama)'
                                : 'Bulan & Transaksi 100% Sama (Beda Tgl)'}
                            </span>
                          )}
                          {duplicateFilterMode !== 'all' && (
                            <span className={`font-mono text-[9px] font-black px-1.5 py-0.5 rounded border ${
                              duplicateInspection.exactSameIds.has(sub.id)
                                ? 'bg-rose-100 text-rose-900 border-rose-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}>
                              {duplicateInspection.exactSameIds.has(sub.id)
                                ? `100% Sama Semua (${duplicateInspection.groupCountMap.get(sub.id) || 2}x)`
                                : duplicateInspection.sameMonthDiffDateIds.has(sub.id)
                                ? `Bulan & Transaksi Sama, Beda Tgl (${duplicateInspection.groupCountMap.get(sub.id) || 2}x)`
                                : `No-Kode Duplikat (${duplicateInspection.groupCountMap.get(sub.id) || 2}x)`}
                            </span>
                          )}
                          {isVerifiedLegit && (
                            <span className="font-mono text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300">
                              ✓ Sah
                            </span>
                          )}
                          <span className="text-[10px] text-stone-500 font-medium truncate max-w-[130px]">
                            📍 {sub.lokasi || '-'}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {(() => {
                          const effStatus = getSubStatus(sub);
                          if (effStatus === 'DP / Cicilan') {
                            return (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                                DP: Rp {formatRupiah(sub.dpAmount || 0)}
                              </span>
                            );
                          }
                          return (
                            <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-extrabold border ${
                              effStatus === 'Lunas'
                                ? 'bg-teal-50 text-teal-700 border-teal-150'
                                : 'bg-rose-50 text-rose-700 border-rose-150'
                            }`}>
                              {effStatus}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Middle: Penerima & Jenis Pengajuan */}
                    <div>
                      <div className="font-black text-stone-900 text-sm leading-snug">
                        {sub.dibayarkanKepada}
                      </div>
                      <div className="text-xs text-stone-600 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-stone-700">{sub.jenisPengajuan}</span>
                        <span className="text-stone-300">•</span>
                        <span className="font-mono text-[11px] text-stone-500">{sub.items.length} item</span>
                      </div>

                      {/* Badges container */}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {isDuplicateActive && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const total = (sub.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0) || (sub as any).nominal || 0;
                              const ym = extractYearMonth(sub.tanggal) || '';
                              const key = `${ym}|${normalizeText(sub.dibayarkanKepada)}|${normalizeText(sub.jenisPengajuan)}|${total}`;
                              setSelectedClusterKey(key);
                              setDuplicateModalSearch(sub.dibayarkanKepada || '');
                              setIsDuplicateModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-[9px] font-mono bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-black px-2 py-0.5 rounded-md shadow-3xs cursor-pointer"
                            title="Klik untuk membuka rincian pasangan transaksi yang sama persis di sistem"
                          >
                            <span>⚠️ Potensi Dobel</span>
                          </button>
                        )}

                        {sub.isInvoice && (
                          <span className="text-[9px] font-mono bg-amber-500 text-white font-black px-2 py-0.5 rounded-md shadow-3xs uppercase">
                            Invoice
                          </span>
                        )}

                        {sub.isPettyCash && (
                          <span className="text-[9px] font-mono bg-violet-600 text-white font-black px-2 py-0.5 rounded-md shadow-3xs uppercase">
                            Petty Cash
                          </span>
                        )}

                        {(sub.loanNumber || sub.jenisPengajuan === 'Pinjaman Karyawan' || sub.notes?.includes('PK-')) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenLoanManager) onOpenLoanManager();
                            }}
                            className="inline-flex items-center gap-1 text-[9px] font-mono bg-blue-700 hover:bg-blue-800 text-white font-black px-2 py-0.5 rounded-md shadow-3xs uppercase tracking-wider cursor-pointer"
                            title="Buka Modul Pinjaman Karyawan"
                          >
                            <CreditCard size={10} />
                            <span>Pinjaman: {sub.loanNumber || 'PK'}</span>
                          </button>
                        )}

                        {(() => {
                          const idLow = String(sub.id || '').toLowerCase().trim();
                          const isUnsynced = Boolean(unsyncedSubmissionIds?.has(idLow));
                          const isUploading = Boolean(uploadingSubmissionIds?.has(idLow));
                          const isConfirmedInCloud = !isUnsynced && Boolean(hasCloudInventory && cloudSyncedIds?.has(idLow));

                          if (isUnsynced) {
                            return (
                              <>
                                <span
                                  className="inline-flex items-center gap-1 text-[9px] font-mono bg-orange-100 text-orange-900 border border-orange-300 font-black px-2 py-0.5 rounded-md shadow-3xs"
                                  title="Transaksi ini belum tersimpan di Firebase Firestore (hanya cadangan lokal/server)"
                                >
                                  <AlertCircle size={10} className="text-orange-600" />
                                  <span>Belum di Firestore</span>
                                </span>
                                {onUploadSingleToFirestore && (
                                  <button
                                    type="button"
                                    disabled={isUploading || isCloudSyncing}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUploadSingleToFirestore(sub);
                                    }}
                                    className="inline-flex items-center gap-1 text-[9px] font-mono bg-orange-600 hover:bg-orange-700 text-white font-black px-2 py-0.5 rounded-md shadow-3xs cursor-pointer disabled:opacity-60"
                                    title="Upload transaksi ini langsung ke Firebase Firestore"
                                  >
                                    <CloudUpload size={10} />
                                    <span>{isUploading ? 'Upload...' : 'Upload'}</span>
                                  </button>
                                )}
                              </>
                            );
                          }

                          if (isConfirmedInCloud) {
                            return (
                              <span
                                className="inline-flex items-center gap-1 text-[9px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-250 font-bold px-2 py-0.5 rounded-md"
                                title={`Data transaksi ini sudah masuk & tersimpan di Cloud Firestore (ID: ${sub.id})`}
                              >
                                <Database size={10} className="text-emerald-600" />
                                <span>Firestore ✓</span>
                              </span>
                            );
                          }

                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onForceCloudSync?.();
                              }}
                              disabled={!onForceCloudSync || isCloudSyncing}
                              className="inline-flex items-center gap-1 text-[9px] font-mono bg-stone-100 hover:bg-stone-200 text-stone-600 border border-stone-250 font-bold px-2 py-0.5 rounded-md cursor-pointer disabled:opacity-60"
                              title="Status Firestore belum terverifikasi — klik untuk memeriksa via Sinkron Cloud"
                            >
                              <Cloud size={10} className="text-stone-500" />
                              <span>Cek Firestore</span>
                            </button>
                          );
                        })()}

                        {(() => {
                          const displayFileObj = (sub.googleDriveFiles || []).find(f => !f.isF1 && !f.isF2 && !f.isBuktiPembayaran) || 
                                                 (sub.googleDriveFileUrl && !sub.googleDriveFileName?.startsWith('F1 -') && !sub.googleDriveFileName?.startsWith('F2 -') ? { url: sub.googleDriveFileUrl, name: sub.googleDriveFileName } : null) || 
                                                 sub.pettyCashFile || 
                                                 sub.buktiPembayaran || 
                                                 (sub.googleDriveFiles && sub.googleDriveFiles.length > 0 ? sub.googleDriveFiles[0] : null);
                          if (!displayFileObj?.url) return null;
                          return (
                            <a
                              href={displayFileObj.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[9px] font-mono bg-amber-50 text-amber-850 border border-amber-200 px-2 py-0.5 rounded-md hover:bg-amber-100 transition font-bold"
                            >
                              <Cloud size={10} className="text-amber-600" />
                              <span>Drive</span>
                            </a>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Bottom: Nominal & Action Buttons */}
                    <div className="pt-2 border-t border-stone-150 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[9px] font-mono text-stone-400 block uppercase font-bold">Total Nilai</span>
                        <span className="text-sm sm:text-base font-black font-mono text-stone-900 truncate block">
                          Rp {formatRupiah(subTotal)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            triggerGoogleDriveAutoRefresh('mob-lihat-voucher', false, false).catch(() => {});
                            onSelect(sub);
                          }}
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 shadow-3xs"
                          title="Lihat / Cetak Voucher"
                        >
                          <Eye size={13} className="text-[#D4AF37]" />
                          <span>Lihat</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onEdit(sub)}
                          className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 shadow-3xs"
                          title="Edit Transaksi"
                        >
                          <Edit2 size={13} className="text-sky-600" />
                          <span>Edit</span>
                        </button>

                        <div className="relative inline-block text-left action-menu-dropdown-root">
                          <button
                            type="button"
                            id={`btn-action-trigger-mob-${sub.id}`}
                            aria-expanded={openActionMenuId === sub.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openActionMenuId === sub.id) {
                                setOpenActionMenuId(null);
                                setActionMenuPosition(null);
                              } else {
                                setOpenActionMenuId(sub.id);
                                updateActionMenuPosition(`mob-${sub.id}`);
                              }
                            }}
                            className={`p-1.5 rounded-xl border transition shadow-3xs cursor-pointer ${
                              openActionMenuId === sub.id
                                ? 'bg-amber-600 text-white border-amber-700'
                                : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-250'
                            }`}
                            title="Menu Tindakan Lengkap"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 px-4 space-y-3">
                <FileText size={36} className="mx-auto text-stone-300" />
                <div>
                  <p className="text-sm font-bold text-stone-700">
                    {submissions.length > 0 ? 'Tidak ada data yang cocok dengan filter aktif' : 'Tidak ada data transaksi'}
                  </p>
                  <p className="text-xs text-stone-500 mt-1">
                    {activeFilterDescriptors.length > 0
                      ? `Filter aktif: ${activeFilterDescriptors.map((f) => f.label).join(' · ')}. Tersedia ${submissions.length} total transaksi.`
                      : submissions.length > 0
                      ? `Tersedia ${submissions.length} total transaksi di sistem. Reset filter untuk menampilkan semua.`
                      : 'Coba muat ulang sinkronisasi cloud & server cadangan.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {searchTerm.trim() && submissions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer"
                    >
                      Hapus Pencarian "{searchTerm.trim()}"
                    </button>
                  )}
                  {submissions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetAllFilters}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs transition cursor-pointer"
                    >
                      Tampilkan Semua ({submissions.length} Transaksi)
                    </button>
                  )}
                  {onForceCloudSync && (
                    <button
                      type="button"
                      onClick={onForceCloudSync}
                      disabled={isCloudSyncing}
                      className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      Pulihkan &amp; Sinkron Data
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Table View (Layar Komputer) */}
          <div className="hidden md:block overflow-x-auto min-h-[220px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-display text-[10px] uppercase tracking-widest font-extrabold">
                  {showCheckColumn && (
                    <th className="py-4.5 px-3 text-center w-20 check-menu-dropdown-root">
                      <div className="inline-flex items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          checked={filteredSubmissions.length > 0 && filteredSubmissions.every((s) => selectedCheckedSet.has(s.id))}
                          onChange={() => {
                            const visibleIds = filteredSubmissions.map((s) => s.id);
                            const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCheckedSet.has(id));
                            if (allSelected) {
                              const visibleSet = new Set(visibleIds);
                              setSelectedCheckedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
                            } else {
                              setSelectedCheckedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                            }
                          }}
                          className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                          title="Centang / batalkan semua yang tampil"
                          aria-label="Centang semua yang tampil"
                        />
                        <button
                          type="button"
                          id="btn-check-options-trigger"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCheckOptionsPopover(e.currentTarget);
                          }}
                          className={`p-1 rounded-md border transition cursor-pointer ${
                            isCheckMenuOpen
                              ? 'bg-stone-900 text-white border-stone-950'
                              : 'bg-white hover:bg-stone-200 text-stone-600 border-stone-300'
                          }`}
                          title="Buka pilihan cepat untuk mencentang transaksi"
                          aria-label="Buka menu pilihan centang"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>
                    </th>
                  )}
                  <th className="py-4.5 px-6">Tanggal</th>
                  <th className="py-4.5 px-6">Lokasi & Kode</th>
                  <th className="py-4.5 px-6">Jenis Pengajuan</th>
                  <th className="py-4.5 px-6">Penerima Kas</th>
                  <th className="py-4.5 px-6 text-right">Total Nilai</th>
                  <th className="py-4.5 px-6 text-center">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-800 text-sm">
                {filteredSubmissions.length > 0 ? (
                  filteredSubmissions.map((sub) => {
                    const subTotal = sub.items.reduce((sum, i) => sum + i.total, 0);
                    const isChecked = selectedCheckedSet.has(sub.id);
                    const isVerifiedLegit = isSubVerifiedLegit(sub);
                    const isPriorityPay = isSubPriorityPayNext(sub);
                    return (
                      <tr
                        key={sub.id}
                        className={`transition ${
                          isChecked
                            ? 'bg-sky-50/75 ring-1 ring-inset ring-sky-300/70'
                            : isPriorityPay
                            ? 'bg-amber-50/90 hover:bg-amber-100/75 ring-1 ring-inset ring-amber-300/80'
                            : 'hover:bg-stone-50/50'
                        } ${openActionMenuId === sub.id ? 'relative z-[60]' : ''}`}
                      >
                        {showCheckColumn && (
                          <td className="py-4.5 px-3 text-center">
                            <div className="inline-flex flex-col items-center gap-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSelectCheck(sub.id)}
                                className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                                title={isChecked ? 'Batalkan centang transaksi ini' : 'Centang transaksi ini untuk memilih tindakan'}
                                aria-label="Pilih transaksi"
                              />
                              {isPriorityPay && (
                                <span title="Diprioritaskan untuk dibayar selanjutnya" className="inline-flex">
                                  <Star size={12} className="text-amber-600 fill-amber-500" />
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="py-4.5 px-6 whitespace-nowrap">
                          <div className="font-extrabold text-stone-900">
                            {formatDateIndonesian(sub.tanggal)}
                          </div>
                          <div className="text-xs text-stone-400 font-mono mt-0.5">{sub.tanggal}</div>
                        </td>
                        <td className="py-4.5 px-6">
                          <div className="font-extrabold text-stone-800 flex items-center gap-1">
                            <MapPin size={13} className="text-stone-400" />
                            {sub.lokasi}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span className="inline-block font-mono text-[10px] font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-sm border border-stone-200">
                              Kode: {sub.kode}
                            </span>
                            {isPriorityPay && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSetPaymentPriority([sub], false);
                                }}
                                className="inline-flex items-center gap-1 font-mono text-[9px] font-black bg-amber-400 hover:bg-amber-300 text-stone-950 px-2 py-0.5 rounded border border-amber-500 cursor-pointer"
                                title="Transaksi disorot untuk dibayar selanjutnya. Klik untuk melepas sorotan."
                              >
                                <Star size={9} className="fill-stone-950" />
                                <span>PRIORITAS BAYAR</span>
                              </button>
                            )}
                            {diffDateFilter !== 'all' && (
                              <span className="inline-block font-mono text-[9px] font-black bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">
                                {diffDateDetection.sameCodeIds.has(sub.id) && diffDateDetection.sameTxIds.has(sub.id)
                                  ? 'Kode & Transaksi 100% Sama (Beda Tgl)'
                                  : diffDateDetection.sameCodeIds.has(sub.id)
                                  ? 'Kode Sama Beda Tgl (Bulan Sama)'
                                  : 'Bulan & Transaksi 100% Sama (Beda Tgl)'}
                              </span>
                            )}
                            {duplicateFilterMode !== 'all' && (
                              <span className={`inline-block font-mono text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                duplicateInspection.exactSameIds.has(sub.id)
                                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                                  : 'bg-amber-100 text-amber-900 border-amber-300'
                              }`}>
                                {duplicateInspection.exactSameIds.has(sub.id)
                                  ? `100% Sama Semua (${duplicateInspection.groupCountMap.get(sub.id) || 2}x)`
                                  : duplicateInspection.sameMonthDiffDateIds.has(sub.id)
                                  ? `Bulan & Transaksi Sama, Beda Tgl (${duplicateInspection.groupCountMap.get(sub.id) || 2}x)`
                                  : `No-Kode Duplikat (${duplicateInspection.groupCountMap.get(sub.id) || 2}x)`}
                              </span>
                            )}
                            {isVerifiedLegit && (
                              <span className="inline-block font-mono text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300">
                                ✓ Sah
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4.5 px-6">
                          <div className="font-extrabold text-stone-900">{sub.jenisPengajuan}</div>
                          <div className="text-xs text-stone-500 mt-0.5 font-mono">
                            {sub.items.length} Item pengeluaran
                          </div>
                        </td>
                        <td className="py-4.5 px-6">
                          <div className="font-extrabold text-stone-900">{sub.dibayarkanKepada}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-150">
                              Transfer
                            </span>
                            
                            {(() => {
                              const effStatus = getSubStatus(sub);
                              if (effStatus === 'DP / Cicilan') {
                                return (
                                  <span className="inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full font-extrabold bg-amber-50 text-amber-800 border border-amber-200" title={sub.cicilanNotes || 'Pembayaran bertahap/cicilan'}>
                                    DP/Cicilan: Rp {formatRupiah(sub.dpAmount || 0)}
                                    {sub.dpAmount && subTotal > sub.dpAmount ? ` (Sisa Rp ${formatRupiah(subTotal - sub.dpAmount)})` : ''}
                                  </span>
                                );
                              }
                              return (
                                <span className={`inline-block text-[10px] font-mono px-2.5 py-0.5 rounded-full font-extrabold ${
                                  effStatus === 'Lunas'
                                    ? 'bg-teal-50 text-teal-700 border border-teal-150'
                                    : 'bg-rose-50 text-rose-700 border border-rose-150'
                                }`}>
                                  {effStatus}
                                </span>
                              );
                            })()}

                            {sub.isInvoice && (
                              <span className="inline-block text-[9px] font-mono bg-amber-500 text-white font-black px-2 py-0.5 rounded-md shadow-3xs uppercase tracking-wider">
                                Invoice
                              </span>
                            )}

                            {sub.isPettyCash && (
                              <span className="inline-block text-[9px] font-mono bg-violet-600 text-white font-black px-2 py-0.5 rounded-md shadow-3xs uppercase tracking-wider" title={`Custodian: ${sub.pettyCashCustodian}`}>
                                Petty Cash
                              </span>
                            )}

                            {(sub.loanNumber || sub.jenisPengajuan === 'Pinjaman Karyawan' || sub.notes?.includes('PK-')) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onOpenLoanManager) onOpenLoanManager();
                                }}
                                className="inline-flex items-center gap-1 text-[9px] font-mono bg-blue-700 hover:bg-blue-800 text-white font-black px-2 py-0.5 rounded-md shadow-3xs uppercase tracking-wider cursor-pointer"
                                title="Buka Modul Pinjaman Karyawan"
                              >
                                <CreditCard size={10} />
                                <span>Pinjaman: {sub.loanNumber || 'PK'}</span>
                              </button>
                            )}


                            {(() => {
                              const idLow = String(sub.id || '').toLowerCase().trim();
                              const isUnsynced = Boolean(unsyncedSubmissionIds?.has(idLow));
                              const isUploading = Boolean(uploadingSubmissionIds?.has(idLow));
                              const isConfirmedInCloud = !isUnsynced && Boolean(hasCloudInventory && cloudSyncedIds?.has(idLow));

                              if (isUnsynced) {
                                return (
                                  <>
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-mono bg-orange-100 text-orange-900 border border-orange-300 px-2.5 py-0.5 rounded-full font-extrabold"
                                      title="Transaksi ini belum tersimpan di Firebase Firestore (hanya cadangan lokal/server)"
                                    >
                                      <AlertCircle size={10} className="text-orange-600" />
                                      <span>Belum di Firestore</span>
                                    </span>
                                    {onUploadSingleToFirestore && (
                                      <button
                                        type="button"
                                        disabled={isUploading || isCloudSyncing}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onUploadSingleToFirestore(sub);
                                        }}
                                        className="inline-flex items-center gap-1 text-[10px] font-mono bg-orange-600 hover:bg-orange-700 text-white px-2.5 py-0.5 rounded-full font-bold transition shadow-3xs cursor-pointer disabled:opacity-60"
                                        title="Upload transaksi ini ke Firebase Firestore"
                                      >
                                        <CloudUpload size={10} />
                                        <span>{isUploading ? 'Mengupload...' : 'Upload'}</span>
                                      </button>
                                    )}
                                  </>
                                );
                              }

                              if (isConfirmedInCloud) {
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-250 px-2.5 py-0.5 rounded-full font-bold"
                                    title={`Data transaksi ini sudah masuk & tersimpan di Cloud Firestore (ID: ${sub.id})`}
                                  >
                                    <Database size={10} className="text-emerald-600" />
                                    <span>Firestore ✓</span>
                                  </span>
                                );
                              }

                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onForceCloudSync?.();
                                  }}
                                  disabled={!onForceCloudSync || isCloudSyncing}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono bg-stone-100 hover:bg-stone-200 text-stone-600 border border-stone-250 px-2.5 py-0.5 rounded-full font-bold transition cursor-pointer disabled:opacity-60"
                                  title="Status Firestore belum terverifikasi — klik untuk memeriksa via Sinkron Cloud"
                                >
                                  <Cloud size={10} className="text-stone-500" />
                                  <span>Cek Firestore</span>
                                </button>
                              );
                            })()}

                            {(() => {
                              const displayFileObj = (sub.googleDriveFiles || []).find(f => !f.isF1 && !f.isF2 && !f.isBuktiPembayaran) || 
                                                     (sub.googleDriveFileUrl && !sub.googleDriveFileName?.startsWith('F1 -') && !sub.googleDriveFileName?.startsWith('F2 -') ? { url: sub.googleDriveFileUrl, name: sub.googleDriveFileName } : null) || 
                                                     sub.pettyCashFile || 
                                                     sub.buktiPembayaran || 
                                                     (sub.googleDriveFiles && sub.googleDriveFiles.length > 0 ? sub.googleDriveFiles[0] : null);
                              const displayFileUrl = displayFileObj?.url || '';
                              const displayFileName = displayFileObj?.name || 'Buka Berkas';
                              if (!displayFileUrl) return null;
                              return (
                                <a
                                  href={displayFileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`Lampiran: ${displayFileName}`}
                                  className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-850 border border-amber-200 px-2.5 py-0.5 rounded-full hover:bg-amber-100 transition font-mono font-bold"
                                >
                                  <Cloud size={10} className="text-amber-600" />
                                  Drive
                                </a>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-4.5 px-6 text-right font-mono font-extrabold text-stone-900">
                          Rp {formatRupiah(subTotal)}
                        </td>
                        <td className="py-4.5 px-6 text-center">
                          <div className="relative inline-block text-left action-menu-dropdown-root">
                            <button
                              id={`btn-action-trigger-${sub.id}`}
                              aria-expanded={openActionMenuId === sub.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openActionMenuId === sub.id) {
                                  setOpenActionMenuId(null);
                                  setActionMenuPosition(null);
                                } else {
                                  setOpenActionMenuId(sub.id);
                                  updateActionMenuPosition(sub.id);
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-3xs border cursor-pointer ${
                                openActionMenuId === sub.id
                                  ? "bg-amber-700 text-white border-amber-800 shadow-sm"
                                  : "bg-white hover:bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-300"
                              }`}
                              title="Pilihan Tindakan Transaksi"
                            >
                              <span>Tindakan</span>
                              <MoreVertical size={14} className={openActionMenuId === sub.id ? "text-white" : "text-stone-500"} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={showCheckColumn ? 7 : 6} className="py-12 px-4 text-center">
                      <div className="space-y-3 max-w-xl mx-auto">
                        <p className="text-sm font-bold text-stone-700">
                          {priorityFilter
                            ? 'Tidak ada transaksi yang ditandai Prioritas Dibayar Selanjutnya pada kriteria ini.'
                            : duplicateFilterMode !== 'all'
                            ? searchTerm.trim()
                              ? `Tidak ada transaksi duplikat yang cocok dengan pencarian "${searchTerm.trim()}".`
                              : 'Tidak ada transaksi duplikat pada filter yang dipilih.'
                            : diffDateFilter !== 'all'
                            ? 'Semua transaksi dengan No-Kode / Transaksi sama (beda tanggal) sudah di-check atau tidak ditemukan.'
                            : submissions.length > 0
                            ? 'Tidak ada data yang cocok dengan filter atau pencarian saat ini.'
                            : 'Tidak ditemukan data transaksi yang dimuat.'}
                        </p>
                        {activeFilterDescriptors.length > 0 && (
                          <p className="text-xs text-stone-500">
                            Filter aktif saat ini: <strong>{activeFilterDescriptors.map((f) => f.label).join(' · ')}</strong>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {searchTerm.trim() && submissions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSearchTerm('')}
                              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer"
                            >
                              Hapus Pencarian "{searchTerm.trim()}"
                            </button>
                          )}
                          {submissions.length > 0 && (
                            <button
                              type="button"
                              onClick={handleResetAllFilters}
                              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs transition cursor-pointer"
                            >
                              Tampilkan Semua ({submissions.length} Transaksi)
                            </button>
                          )}
                          {onForceCloudSync && (
                            <button
                              type="button"
                              onClick={onForceCloudSync}
                              disabled={isCloudSyncing}
                              className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                            >
                              Pulihkan &amp; Sinkron Data
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : layoutMode === 'spreadsheet' ? (
        /* Google Sheets Table Simulator View with tabs & sum status */
        <div className="bg-[#f9fbfd] rounded-2xl border border-stone-300 shadow-sm overflow-hidden flex flex-col font-sans select-none animate-fade-in">
          {/* Google Sheets Header & Topbar */}
          <div className="bg-emerald-800 text-white p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-emerald-900">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white text-emerald-800 rounded-lg shadow-sm">
                <FileText size={18} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm tracking-tight text-white">Pembuatan Voucher NMSA</span>
                  <span className="text-[10px] bg-emerald-700/80 text-emerald-100 px-1.5 py-0.2 rounded font-mono">Disinkronisasi</span>
                </div>
                <div className="flex flex-wrap gap-x-3 text-[10.5px] text-emerald-200 mt-0.5">
                  <span className="hover:text-white cursor-pointer transition">File</span>
                  <span className="hover:text-white cursor-pointer transition">Edit</span>
                  <span className="hover:text-white cursor-pointer transition">Tampilan</span>
                  <span className="hover:text-white cursor-pointer transition">Format</span>
                  <span className="hover:text-white cursor-pointer transition">Data</span>
                  <span className="hover:text-white cursor-pointer transition">Alat</span>
                  <span className="hover:text-white cursor-pointer transition">Bantuan</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Quick action with selected row */}
              {selectedRowId && (() => {
                const selectedSub = submissions.find(s => s.id === selectedRowId);
                if (!selectedSub) return null;
                const subTotal = selectedSub.items.reduce((sum, i) => sum + i.total, 0);
                return (
                  <div className="bg-emerald-900/80 border border-emerald-600 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs">
                    <span className="text-emerald-300">Baris Terpilih: <strong className="text-white font-mono">{selectedSub.kode || 'Voucher'}</strong></span>
                    <div className="h-4 w-[1px] bg-emerald-700"></div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onSelect(selectedSub)}
                        className="p-1 hover:bg-emerald-850 text-amber-400 hover:text-amber-300 rounded cursor-pointer transition"
                        title="Lihat / Cetak Voucher"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => onEdit(selectedSub)}
                        className="p-1 hover:bg-emerald-850 text-sky-400 hover:text-sky-300 rounded cursor-pointer transition"
                        title="Edit Voucher"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => onDuplicate(selectedSub)}
                        className="p-1 hover:bg-emerald-850 text-stone-300 hover:text-white rounded cursor-pointer transition"
                        title="Duplikat Voucher"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => {
                          setDeleteIncludeDrive(true);
                          setDeleteConfirmSub(selectedSub);
                        }}
                        className="p-1 hover:bg-emerald-850 text-rose-400 hover:text-rose-300 rounded cursor-pointer transition"
                        title="Hapus Voucher"
                      >
                        <Trash2 size={13} />
                      </button>

                      {onMarkAsPaid && isEligibleForManualPaymentMark(selectedSub) && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Yakin ingin menandai voucher ${selectedSub.kode} sebagai SUDAH DIBAYAR (Lunas) tanpa bukti fisik? (Karena umur transaksi sudah lebih dari 1 minggu)`)) {
                              onMarkAsPaid(selectedSub.id);
                            }
                          }}
                          className="p-1 hover:bg-emerald-850 text-teal-400 hover:text-teal-300 rounded cursor-pointer transition flex items-center justify-center"
                          title="Tandai Sudah Dibayar (Lunas)"
                        >
                          <CheckCircle size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
              
              <button
                onClick={onAddNew}
                className="bg-white hover:bg-stone-100 text-emerald-850 font-black text-xs px-4 py-1.5 rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Tambah Baris</span>
              </button>
            </div>
          </div>

          {/* Google Sheets Decorative Menu Formatter Bar */}
          <div className="bg-stone-50 border-b border-stone-200 p-1.5 flex flex-wrap items-center gap-1 text-xs text-stone-600">
            <div className="px-2 py-1 bg-white border border-stone-200 rounded text-[11px] font-medium text-stone-700 min-w-[70px] text-center">
              Arial
            </div>
            <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>
            <div className="px-2 py-1 bg-white border border-stone-200 rounded text-[11px] font-medium text-stone-700 text-center">
              100%
            </div>
            <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>
            <button className="p-1 hover:bg-stone-200 rounded font-bold font-mono">Rp</button>
            <button className="p-1 hover:bg-stone-200 rounded font-bold font-mono">%</button>
            <button className="p-1 hover:bg-stone-200 rounded font-mono">.0</button>
            <button className="p-1 hover:bg-stone-200 rounded font-mono">.00</button>
            <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>
            <button className="p-1 bg-stone-200/50 text-stone-800 rounded">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
              </svg>
            </button>
            <div className="h-4 w-[1px] bg-stone-300 mx-1"></div>
            <div className="flex-1 text-right text-[10.5px] font-mono text-stone-400 pr-2">
              Double klik baris untuk cetak bukti PDF
            </div>
          </div>

          {/* Dense Table wrapper */}
          <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
            <table className="w-full text-left border-collapse table-fixed select-text">
              <thead>
                {/* Spreadsheet Column Label Coordinates (A, B, C...) */}
                <tr className="bg-stone-100 text-stone-500 font-mono text-[10px] uppercase text-center border-b border-stone-250">
                  <th className="w-10 bg-stone-200/60 border-r border-stone-250 py-1"></th>
                  <th className="w-12 border-r border-stone-250 py-1">A</th>
                  <th className="w-48 border-r border-stone-250 py-1">B</th>
                  <th className="w-28 border-r border-stone-250 py-1">C</th>
                  <th className="w-48 border-r border-stone-250 py-1">D</th>
                  <th className="w-36 border-r border-stone-250 py-1">E</th>
                  <th className="w-64 border-r border-stone-250 py-1">F</th>
                  <th className="w-32 border-r border-stone-250 py-1">G</th>
                  <th className="w-24 border-r border-stone-250 py-1">H</th>
                  <th className="w-44 border-r border-stone-250 py-1">I</th>
                  <th className="w-20 border-r border-stone-250 py-1">J</th>
                  <th className="w-36 border-r border-stone-250 py-1">K</th>
                  <th className="w-24 bg-stone-105 border-stone-250 py-1">Aksi</th>
                </tr>
                {/* Actual Labels Row (No, Company, Tanggal...) */}
                <tr className="bg-stone-50 border-b border-stone-300 text-stone-600 font-bold text-[11px] tracking-tight">
                  <th className="bg-stone-100 border-r border-stone-300 text-center py-2 text-stone-400 font-mono text-[10px]">#</th>
                  <th className="border-r border-stone-300 px-2 py-2">No</th>
                  <th className="border-r border-stone-300 px-2.5 py-2">Company</th>
                  <th className="border-r border-stone-300 px-2 py-2">Tanggal</th>
                  <th className="border-r border-stone-300 px-2 py-2">No Invoice</th>
                  <th className="border-r border-stone-300 px-2 py-2">Jenis</th>
                  <th className="border-r border-stone-300 px-2.5 py-2">Isi Invoice</th>
                  <th className="border-r border-stone-300 px-2.5 py-2 text-right">Nominal</th>
                  <th className="border-r border-stone-300 px-2 py-2 text-center">Status</th>
                  <th className="border-r border-stone-300 px-2.5 py-2">Dibayarkan</th>
                  <th className="border-r border-stone-300 px-2 py-2 text-center">Link File</th>
                  <th className="border-r border-stone-300 px-2 py-2">Nama File</th>
                  <th className="px-2 py-2 text-center bg-stone-100/50">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-stone-800 text-[11px] font-sans">
                {spreadsheetFilteredSubmissions.length > 0 ? (
                  spreadsheetFilteredSubmissions.map((sub, idx) => {
                    const subTotal = sub.items.reduce((sum, i) => sum + i.total, 0);
                    const isSelected = selectedRowId === sub.id;
                    const itemDescription = getIsiInvoice(sub);
                    
                    return (
                      <tr 
                        key={sub.id} 
                        onClick={() => setSelectedRowId(sub.id)}
                        onDoubleClick={() => onSelect(sub)}
                        className={`hover:bg-amber-50/20 active:bg-amber-100/35 transition-colors cursor-pointer ${
                          isSelected ? 'bg-emerald-50/60 font-medium border-l-2 border-emerald-600' : 'bg-white'
                        }`}
                      >
                        {/* Left vertical numbers list indicator */}
                        <td className={`font-mono text-[10px] text-center select-none border-r border-stone-300 font-bold ${
                          isSelected ? 'bg-emerald-700 text-white' : 'bg-stone-50 text-stone-400'
                        }`}>
                          {idx + 1}
                        </td>
                        
                        {/* Column A: No */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 font-mono text-center">
                          {idx + 1}
                        </td>
                        
                        {/* Column B: Company */}
                        <td className="border-r border-stone-200/80 px-2.5 py-1.5 truncate max-w-full" title="PT Nusantara Mineral Sukses Abadi">
                          PT Nusantara Mineral Sukses Abadi
                        </td>
                        
                        {/* Column C: Tanggal */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 whitespace-nowrap text-stone-700">
                          {formatDateIndonesian(sub.tanggal)}
                        </td>
                        
                        {/* Column D: No Invoice */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 font-mono font-bold text-stone-900 truncate">
                          {sub.kode || 'BKK-VOUCHER'}
                        </td>
                        
                        {/* Column E: Jenis */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 truncate" title={sub.jenisPengajuan}>
                          {sub.jenisPengajuan}
                        </td>
                        
                        {/* Column F: Isi Invoice */}
                        <td className="border-r border-stone-200/80 px-2.5 py-1.5 text-stone-600 max-w-xs truncate" title={itemDescription}>
                          {itemDescription}
                        </td>
                        
                        {/* Column G: Nominal */}
                        <td className="border-r border-stone-200/80 px-2.5 py-1.5 text-right font-mono font-bold text-emerald-800">
                          Rp {formatRupiah(subTotal)}
                        </td>
                        
                        {/* Column H: Status */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 text-center">
                          {(() => {
                            const effStatus = getSubStatus(sub);
                            return (
                              <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                effStatus === 'Lunas'
                                  ? 'bg-emerald-100 text-emerald-850 font-extrabold uppercase border border-emerald-350'
                                  : effStatus === 'DP / Cicilan'
                                  ? 'bg-amber-100 text-amber-850 font-extrabold uppercase border border-amber-350'
                                  : 'bg-rose-100 text-rose-850 font-extrabold uppercase border border-rose-350 animate-pulse'
                              }`}>
                                {effStatus}
                              </span>
                            );
                          })()}
                        </td>
                        
                        {/* Column I: Dibayarkan */}
                        <td className="border-r border-stone-200/80 px-2.5 py-1.5 font-medium truncate" title={sub.dibayarkanKepada}>
                          {sub.dibayarkanKepada}
                        </td>
                        
                        {/* Column J: Link File (Google Drive) */}
                        <td className="border-r border-stone-200/80 px-2 py-1.5 text-center">
                          {sub.googleDriveFileUrl ? (
                            <a
                              href={sub.googleDriveFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 hover:bg-amber-200 text-[#a58421] border border-amber-300 px-1.5 py-0.5 rounded font-mono font-black shadow-3xs"
                              title={sub.googleDriveFileName || "Buka Lampiran Drive"}
                            >
                              <Cloud size={10} className="text-amber-500" />
                              Drive
                            </a>
                          ) : (
                            <span className="text-stone-300 font-mono">-</span>
                          )}
                        </td>
                        
                        {/* Column K: Nama File */}
                        <td className="border-r border-stone-200/80 px-2 py-1 flex items-center h-full max-w-xs overflow-x-auto scrollbar-none" title={sub.googleDriveFileName || 'Tidak ada file lampiran'}>
                          {(() => {
                            const userAttachmentFiles = (sub.googleDriveFiles || []).filter(f => !f.isF1 && !f.isF2 && !f.isBuktiPembayaran && f.docType !== 'petty_cash_report');
                            if (userAttachmentFiles.length > 0) {
                              return (
                                <div className="flex flex-wrap gap-1 items-center py-0.5">
                                  {userAttachmentFiles.map((f, i) => {
                                    const docAbbrev = f.docType === 'po' ? 'PO'
                                                    : f.docType === 'lhv' ? 'LHV'
                                                    : f.docType === 'draft_survei' ? 'Survei'
                                                    : f.docType === 'bill_of_lading' ? 'B/L'
                                                    : f.docType === 'cargo_manifest' ? 'Cargo'
                                                    : f.docType === 'cow_coa_ds_bongkar' ? 'COW/COA'
                                                    : f.docType === 'bukti_pembayaran_batubara' ? 'P.Bara'
                                                    : f.docType === 'bukti_shipment_tongkang_founder' ? 'S.Tongkang'
                                                    : f.docType === 'bukti_pajak_trader_founder' ? 'Pajak'
                                                    : f.docType === 'merged_all' ? 'Gabungan'
                                                    : f.docType === 'invoice_vendor' ? 'Invoice'
                                                    : f.docType ? f.docType.toUpperCase()
                                                    : (f.name ? (f.name.length > 15 ? f.name.substring(0, 15) + '...' : f.name) : `File ${i + 1}`);
                                    return (
                                      <a
                                        key={f.url || i}
                                        href={f.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="border text-[8.5px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0 transition bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-250 shadow-3xs"
                                        title={`Buka ${f.name}`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {docAbbrev}
                                      </a>
                                    );
                                  })}
                                </div>
                              );
                            }
                            
                            const validFileName = sub.googleDriveFileName && !sub.googleDriveFileName.startsWith('F1 -') && !sub.googleDriveFileName.startsWith('F2 -')
                              ? sub.googleDriveFileName
                              : null;

                            return (
                              <span className="truncate block py-0.5 text-[11px] font-mono text-stone-600" title={validFileName || ''}>
                                {validFileName || '-'}
                              </span>
                            );
                          })()}
                        </td>
                        
                        {/* Action buttons inside rows */}
                        <td className="px-2 py-1.5 text-center bg-stone-50/50">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              title="Tampilkan / Cetak PDF"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelect(sub);
                              }}
                              className="p-1 hover:bg-stone-255 hover:bg-stone-200/80 text-[#D4AF37] rounded transition"
                            >
                              <Eye size={12} />
                            </button>
                            
                            <button
                              title="Edit Data"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(sub);
                              }}
                              className="p-1 hover:bg-stone-255 hover:bg-stone-200/80 text-sky-500 rounded transition"
                            >
                              <Edit2 size={12} />
                            </button>
                            
                            <button
                              title="Hapus Data"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteIncludeDrive(true);
                                setDeleteConfirmSub(sub);
                              }}
                              className="p-1 hover:bg-stone-255 hover:bg-stone-200/80 text-rose-500 rounded transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-stone-400 font-mono text-xs">
                      Tidak ditemukan data transaksi yang terdaftar di halaman filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* BOTTOM GOOGLE SHEETS TABS */}
          <div className="bg-stone-100 border-t border-stone-300 flex flex-col sm:flex-row sm:items-center justify-between text-xs px-2 select-none h-auto sm:h-11">
            {/* Tabs flow container */}
            <div className="flex flex-wrap items-end h-full gap-0.5 overflow-x-auto scroller-hidden">
              {/* Quick left controls (like spreadsheet) */}
              <div className="flex items-center gap-1 px-2 text-stone-500 border-r border-stone-300 h-9 shrink-0">
                <button 
                  onClick={() => onAddNew()}
                  className="p-1 hover:bg-stone-200 rounded text-stone-700 cursor-pointer text-xs font-black"
                  title="Input Voucher Baru"
                >
                  +
                </button>
                <div className="h-4 w-[1px] bg-stone-300 mx-0.5"></div>
                <span className="text-[10px] font-mono select-none">Halaman {spreadsheetFilteredSubmissions.length} baris</span>
              </div>
              
              {/* Direct tabs */}
              {availableSheets.map((sheet) => {
                const isActive = activeSheetTab === sheet;
                // Clean description label
                let label = sheet;
                if (sheet === 'Data Sinkron') {
                  label = '📊 Data Sinkron';
                } else {
                  // Shorten tab label to match Google Sheet: "NMSA-2026-06"
                  label = sheet.replace('PT Nusantara Mineral Sukses Abadi-', '📁 NMSA-');
                }
                
                return (
                  <button
                    key={sheet}
                    onClick={() => setActiveSheetTab(sheet)}
                    className={`px-4 py-2 font-bold text-[11px] rounded-t-lg border-t-3 transition duration-150 cursor-pointer h-9 flex items-center justify-center shrink-0 border-x border-stone-300 ${
                      isActive 
                        ? 'bg-white text-emerald-800 border-t-emerald-700 font-extrabold shadow-3xs' 
                        : 'bg-stone-50 hover:bg-stone-150 text-stone-600 border-t-transparent'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              
              {/* Decorative dashboard redirection tab */}
              <button
                onClick={() => handleSetLayoutMode('standard')}
                className="px-4 py-2 font-bold text-[11px] rounded-t-lg border-t-3 border-t-transparent bg-stone-50 hover:bg-stone-150 text-[#D4AF37] cursor-pointer h-9 flex items-center justify-center shrink-0 border-x border-stone-300"
              >
                🏠 KEMBALI KE METRIK DASHBOARD
              </button>
            </div>

            {/* Sum details at bottom right */}
            <div className="p-2 sm:p-0 font-mono text-[11.5px] font-bold text-stone-600 shrink-0 flex items-center gap-4 bg-stone-200/50 rounded-lg sm:bg-transparent sm:rounded-none">
              <div className="flex items-center gap-1 bg-stone-200 px-2.5 py-1 rounded">
                <span className="text-stone-400">JUMLAH BARIS:</span>
                <span className="text-stone-800">{spreadsheetFilteredSubmissions.length} Data</span>
              </div>
              <div className="flex items-center gap-1 bg-emerald-50 text-emerald-800 px-3 py-1 rounded border border-emerald-250">
                <span className="text-emerald-600 font-extrabold">SUM TOTAL:</span>
                <span className="font-extrabold">Rp {formatRupiah(spreadsheetSum)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : layoutMode === 'invoice_recap' ? (
        /* Rekapitulasi & Pembayaran Invoice Bulanan View */
        <div className="space-y-6">
          
          {/* Header Dashboard section */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in print:hidden">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-amber-50 rounded-xl text-amber-700">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h2 className="text-base font-black text-stone-900 tracking-tight font-display uppercase">Pusat Rekapitulasi Pembayaran Invoice</h2>
                  <p className="text-xs text-stone-500">Menganalisis, menghitung volume, and mencetak rekapitulasi invoice vendor beserta bukti pembayarannya per bulan.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="inline-flex items-center gap-2 px-4.5 py-2 hover:bg-stone-100 border border-stone-250 text-stone-800 font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none"
                title="Cetak Laporan Rekap Bulanan yang Aktif"
              >
                <Printer size={14} className="text-[#a58421]" />
                <span>Cetak Rekap Laporan</span>
              </button>
              
              <button
                onClick={onAddNew}
                className="inline-flex items-center gap-2 px-4.5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-xs cursor-pointer select-none"
              >
                <Plus size={14} className="text-[#D4AF37]" />
                <span>Input Invoice Baru</span>
              </button>
            </div>
          </div>

          {/* PRINT-ONLY HEADER AND FORMAL REPORT ACCENT - ONLY OUTDOES ON PAPER PRINTING */}
          <div className="hidden print:block font-sans text-black p-4 space-y-6">
            <div className="border-b-2 border-stone-900 pb-4 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-bold font-display uppercase tracking-wider">PT NUSANTARA MINERAL SUKSES ABADI</h1>
                <p className="text-xs text-stone-500 font-mono">DIVISI FINANCE & INTERNAL LEDGER DATABASE</p>
                <h2 className="text-sm font-semibold text-stone-850 mt-1">Laporan Rekapitulasi Transaksi Pembayaran Invoice</h2>
              </div>
              <div className="text-right font-mono text-[10px] text-stone-500">
                <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p>Filter Bulan: {invoiceMonthFilter === 'All' ? 'Semua Bulan' : formatDateIndonesian(`${invoiceMonthFilter}-01`).replace('1 ', '')}</p>
              </div>
            </div>

            {/* Print KPIs */}
            <div className="grid grid-cols-3 gap-4 border border-stone-300 p-3 rounded-lg font-mono text-xs">
              <div>
                <span className="text-stone-500 uppercase block text-[9px]">Total Transaksi</span>
                <strong>{invoiceRecapStats.count} Invoice</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[9px]">Total Nilai Tagihan</span>
                <strong>Rp {invoiceRecapStats.totalNominal.toLocaleString('id-ID')}</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[9px]">Status Kelayakan</span>
                <strong>Lunas: {invoiceRecapStats.totalLunas} | Belum Lunas: {invoiceRecapStats.totalBelumLunas}</strong>
              </div>
            </div>
          </div>

          {/* Quick Metrics Columns (KPIs) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs hover:shadow-2xs transition flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Total Transaksi Invoice</span>
                <div className="text-2xl font-black text-stone-900 font-display">
                  {invoiceRecapStats.count} <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">Transaksi</span>
                </div>
                <span className="text-[10px] text-stone-400 block block font-mono">Bulan Filter: {invoiceMonthFilter === 'All' ? 'Semua Bulan' : invoiceMonthFilter}</span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                <FileText size={20} />
              </div>
            </div>

            <div className="bg-stone-900 text-white p-5 rounded-2xl border border-stone-850 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Volume Nilai Tagihan</span>
                <div className="text-2xl font-black text-white font-display">
                  Rp {invoiceRecapStats.totalNominal.toLocaleString('id-ID')}
                </div>
                <span className="text-[10px] text-stone-400 block block font-mono">Total tagihan terakumulasi</span>
              </div>
              <div className="p-3 bg-stone-800 rounded-xl text-amber-500 border border-stone-750">
                <DollarSign size={20} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs hover:shadow-2xs transition flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Pemberesan & Status</span>
                <div className="text-base font-black text-stone-800 font-display flex items-center gap-1.5">
                  <span className="text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-150 font-sans">{invoiceRecapStats.totalLunas} Lunas</span>
                  <span className="text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-150 font-sans">{invoiceRecapStats.totalBelumLunas} Outstanding</span>
                </div>
                <p className="text-[10px] text-stone-400 mt-1 block font-mono">Diupdate secara real-time berdasarkan bukti transfer</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <CheckCircle size={20} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print:block">
            
            {/* LEFT COLUMN: MONTH-BY-MONTH STRUCTURED MATRIX CONTAINER */}
            <div className="lg:col-span-1 space-y-4 print:hidden">
              <div className="bg-white rounded-2xl border border-stone-200 p-4.5 space-y-3 shadow-3xs">
                <div>
                  <h3 className="text-xs font-black uppercase font-mono tracking-wider text-stone-500">Mencatat Rekap Per Bulan</h3>
                  <p className="text-[10.5px] text-stone-400 mt-0.5">Klik pada bulan di bawah untuk memfilter daftar invoice secara instan.</p>
                </div>

                <div className="space-y-1.5 pt-1.5 border-t border-stone-150/60">
                  {/* Dedicated Halaman Belum Bayar button */}
                  <button
                    onClick={() => {
                      setInvoiceMonthFilter('All');
                      setInvoiceStatusFilter('Belum Lunas');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-black rounded-xl transition border cursor-pointer select-none ${
                      invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas'
                        ? 'bg-amber-500 border-amber-600 text-stone-950 font-black shadow-sm'
                        : 'bg-amber-50/70 hover:bg-amber-100 text-amber-900 border-amber-200/50'
                    }`}
                    title="Klik untuk memfilter semua transaksi tagihan/invoice yang belum dibayar sejak awal."
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <AlertCircle size={13} className={invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas' ? 'text-stone-950' : 'text-amber-600'} />
                      Halaman Belum Bayar
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold font-mono ${
                      invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas'
                        ? 'bg-stone-950/20 text-stone-950'
                        : 'bg-amber-600/15 text-amber-800 font-extrabold'
                    }`}>
                      {unpaidInvoicesAllTime.length}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setInvoiceMonthFilter('All');
                      setInvoiceStatusFilter('All');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition cursor-pointer select-none border ${
                      invoiceMonthFilter === 'All' && invoiceStatusFilter === 'All'
                        ? 'bg-[#917118] border-[#917118] text-white font-extrabold shadow-3xs'
                        : 'bg-stone-50 text-stone-700 hover:bg-stone-100 hover:text-stone-900 border-stone-150'
                    }`}
                  >
                    <span>📅 Semua Transaksi (All)</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold font-mono ${
                      invoiceMonthFilter === 'All' && invoiceStatusFilter === 'All'
                        ? 'bg-white/20 text-white'
                        : 'bg-stone-200/50 text-stone-800'
                    }`}>
                      {invoiceSubmissions.length}
                    </span>
                  </button>

                  {invoiceMonthlyGrid.length > 0 ? (
                    invoiceMonthlyGrid.map((row) => {
                      // Format month label "2026-06" to Indonesian e.g. "Juni 2026"
                      const displayMonth = formatDateIndonesian(`${row.month}-01`).replace('1 ', '');
                      
                      return (
                        <button
                          key={row.month}
                          onClick={() => setInvoiceMonthFilter(row.month)}
                          className={`w-full flex flex-col px-3 py-2 text-xs rounded-xl transition text-left border ${
                            invoiceMonthFilter === row.month
                              ? 'bg-stone-900 border-stone-950 text-white shadow-3xs'
                              : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-900'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>{displayMonth}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${invoiceMonthFilter === row.month ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-700'}`}>
                              {row.count} Inv
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-stone-400 mt-1 font-mono">
                            <span>Tagihan:</span>
                            <span className={invoiceMonthFilter === row.month ? 'text-amber-400 font-bold' : 'text-stone-800 font-bold'}>
                              Rp {row.total.toLocaleString('id-ID')}
                            </span>
                          </div>
                          
                          <div className="flex gap-1.5 mt-1">
                            <span className="text-[9px] text-emerald-600 font-sans font-semibold">● {row.lunas} Lunas</span>
                            <span className="text-[9px] text-amber-700 font-sans font-semibold">● {row.belumLunas} Berjalan</span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-[11px] text-stone-400">
                      Belum terdeteksi data transaksi invoice.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: MAIN INVOICE DETAIL SHEET */}
            <div className="lg:col-span-3 space-y-4 print:w-full print:block">
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden animate-fade-in print:border-none print:shadow-none">
                
                {/* Search & Filter section header */}
                <div className="px-6 py-4.5 bg-stone-50 border-b border-stone-150 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                  <div className="space-y-0.5">
                    <span className="text-xs uppercase font-mono tracking-widest text-[#a58421] font-bold">
                      {invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas'
                        ? '📂 Ringkasan Tagihan Outstanding'
                        : 'Tabel Transaksi Utama'}
                    </span>
                    <h3 className="text-sm font-black text-stone-900 flex items-center gap-1.5">
                      {invoiceMonthFilter === 'All' && invoiceStatusFilter === 'Belum Lunas' ? (
                        <>
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>Tagihan Belum Dibayar (Semuawaktu)</span>
                        </>
                      ) : (
                        <span>Daftar Transaksi Invoice Aktif</span>
                      )}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search Field */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                      <input
                        type="text"
                        placeholder="Cari vendor, no invoice, koin..."
                        className="pl-8 pr-4 py-1.5 w-full sm:w-56 bg-white border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-700"
                        value={invoiceSearchQuery}
                        onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                      />
                    </div>

                    {/* Status filter dropdown */}
                    <select
                      className="bg-white border border-stone-250 rounded-xl text-xs py-1.5 px-3 focus:outline-none text-stone-700 font-medium"
                      value={invoiceStatusFilter}
                      onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                    >
                      <option value="All">Semua Status</option>
                      <option value="Lunas">Lunas</option>
                      <option value="Belum Lunas">Belum Lunas</option>
                    </select>

                    {/* Clear filter if active */}
                    {(invoiceMonthFilter !== 'All' || invoiceStatusFilter !== 'All' || invoiceSearchQuery.trim()) && (
                      <button
                        onClick={() => {
                          setInvoiceMonthFilter('All');
                          setInvoiceStatusFilter('All');
                          setInvoiceSearchQuery('');
                        }}
                        className="text-[11px] text-rose-600 hover:text-rose-800 transition font-bold"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                </div>

                {/* Table details container */}
                <div className="overflow-x-auto">
                  {filteredInvoiceSubmissions.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-100/85 border-b border-stone-200 text-stone-600 text-[10.5px] uppercase font-mono tracking-wider select-none">
                          <th className="py-3 px-4 font-bold border-r border-stone-200">Tanggal & Kode</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200">Nomor Invoice</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200">Vendor / Penerima</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200 text-right">Nominal</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200 text-center">Bukti Lampiran</th>
                          <th className="py-3 px-4 font-bold border-r border-stone-200 text-center">Status</th>
                          <th className="py-3 px-4 font-bold text-center print:hidden">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200/80 font-sans text-xs">
                        {filteredInvoiceSubmissions.map((sub) => {
                          const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);
                          const grandTotal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
                          const invoiceAmtComputed = typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : grandTotal;

                          // Extract specific invoice file if uploaded
                          const invoiceFileObj = sub.googleDriveFiles?.find(
                            f => f.docType === 'invoice_vendor' || 
                                 (f.name || '').toLowerCase().includes('invoice') || 
                                 (f.name || '').toLowerCase().includes('tagihan') ||
                                 (f.name || '').toLowerCase().includes('nota') ||
                                 (f.name || '').toLowerCase().includes('faktur')
                          ) || sub.googleDriveFiles?.find(
                            f => !f.isBuktiPembayaran && !f.isF1 && !f.isF2 && f.docType !== 'merged_all'
                          ) || (sub.googleDriveFileUrl && !sub.googleDriveFileName?.startsWith('F1 -') && !sub.googleDriveFileName?.startsWith('F2 -') ? { url: sub.googleDriveFileUrl, name: sub.googleDriveFileName } : undefined);

                          // Extract payment proof file
                          const paymentProofObj = sub.buktiPembayaran || sub.googleDriveFiles?.find(f => f.isBuktiPembayaran);

                          return (
                            <tr
                              key={sub.id}
                              onClick={() => onSelect(sub)}
                              className="hover:bg-stone-50/50 hover:text-stone-900 transition-colors cursor-pointer"
                            >
                              {/* Tanggal & Voucher Code */}
                              <td className="py-3 px-4 border-r border-stone-200/85">
                                <div className="font-mono text-[11px] font-black text-stone-900">{sub.kode || 'HO'}</div>
                                <div className="text-[10px] text-stone-500 font-mono mt-0.5">{formatDateIndonesian(sub.tanggal)}</div>
                              </td>

                              {/* Invoice Number */}
                              <td className="py-3 px-4 border-r border-stone-200/85 font-mono">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-stone-850 break-all">{sub.invoiceNumber || sub.kode || 'Tanpa Kode'}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(sub.invoiceNumber || sub.kode || '');
                                      setCopiedId(sub.id);
                                      setTimeout(() => setCopiedId(null), 1500);
                                    }}
                                    className="p-1 hover:bg-stone-150 rounded transition text-stone-400 hover:text-stone-700 print:hidden shrink-0"
                                    title="Salin Nomor Identifikasi"
                                  >
                                    {copiedId === sub.id ? (
                                      <Check size={11} className="text-emerald-600" />
                                    ) : (
                                      <Copy size={11} />
                                    )}
                                  </button>
                                </div>
                                <span className="text-[10px] text-stone-400 block font-sans block truncate mt-0.5" title={sub.jenisPengajuan}>
                                  Kategori: {sub.jenisPengajuan}
                                </span>
                              </td>

                              {/* Vendor / Recipient */}
                              <td className="py-3 px-4 border-r border-stone-200/85 font-semibold text-stone-850">
                                <div className="truncate max-w-[170px]" title={sub.dibayarkanKepada}>
                                  {sub.dibayarkanKepada}
                                </div>
                                <span className="text-[9.5px] text-stone-400 font-mono block font-medium mt-0.5">Loc: {sub.lokasi || 'Lt. 1'}</span>
                              </td>

                              {/* Nominal */}
                              <td className="py-3 px-4 border-r border-stone-200/85 text-right font-mono font-bold text-stone-900">
                                Rp {formatRupiah(invoiceAmtComputed)}
                              </td>

                              {/* File Bukti: Invoice & Bukti Pembayaran */}
                              <td className="py-3 px-4 border-r border-stone-200/85" onClick={(e) => e.stopPropagation()}>
                                <div className="flex flex-col gap-1 items-center justify-center">
                                  {/* Render Invoice File Badge */}
                                  {invoiceFileObj ? (
                                    <a
                                      href={invoiceFileObj.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2 py-1 w-full bg-amber-50 hover:bg-amber-100 text-[#917118] border border-amber-200 rounded-lg text-[9.5px] font-black transition tracking-tight shadow-3xs"
                                      title={`Nama Berkas: ${invoiceFileObj.name}`}
                                    >
                                      <FileText size={11} className="shrink-0" />
                                      <span className="truncate max-w-[90px]">{invoiceFileObj.name || 'Dokumen Invoice'}</span>
                                      <ExternalLink size={10} className="shrink-0 ml-auto" />
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-stone-350 italic block border border-dashed border-stone-200 px-2 py-0.5 rounded-lg w-full text-center">
                                      File Invoice (-)
                                    </span>
                                  )}

                                  {/* Render Payment Proof Badge */}
                                  {paymentProofObj ? (
                                    <a
                                      href={paymentProofObj.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2 py-1 w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[9.5px] font-black transition tracking-tight shadow-3xs"
                                      title={`Nama Berkas: ${paymentProofObj.name}`}
                                    >
                                      <Cloud size={11} className="shrink-0" />
                                      <span className="truncate max-w-[90px]">{paymentProofObj.name || 'Bukti Transfer'}</span>
                                      <ExternalLink size={10} className="shrink-0 ml-auto" />
                                    </a>
                                  ) : (
                                    <span className="text-[9px] text-stone-350 italic block border border-dashed border-stone-200 px-2 py-0.5 rounded-lg w-full text-center">
                                      Bukti Bayar (-)
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Status Badging */}
                              <td className="py-3 px-4 border-r border-stone-200/85 text-center select-none">
                                <span className={`inline-block px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase tracking-wider ${
                                  isLunas
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-250'
                                    : 'bg-amber-50 text-amber-700 border border-amber-250'
                                }`}>
                                  {isLunas ? 'Lunas' : 'Belum Lunas'}
                                </span>
                              </td>

                              {/* Action Buttons Link */}
                              <td className="py-3 px-4 whitespace-nowrap text-center print:hidden" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => onSelect(sub)}
                                    className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition shadow-3xs"
                                    title="Lihat Voucher Transaksi"
                                  >
                                    <Eye size={12} />
                                  </button>
                                  <button
                                    onClick={() => onEdit(sub)}
                                    className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition shadow-3xs"
                                    title="Edit Informasi"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Focus select and print it directly
                                      onSelect(sub, 'only_invoice_payment');
                                      setTimeout(() => {
                                        window.print();
                                      }, 500);
                                    }}
                                    className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg transition border border-amber-250 shadow-3xs"
                                    title="Cetak Hanya Berkas Invoice & Bukti Bayar"
                                  >
                                    <Printer size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-24 text-center space-y-2">
                      <AlertCircle className="mx-auto text-stone-400" size={32} />
                      <div className="text-stone-850 font-bold text-xs mt-1">Saringan Kosong</div>
                      <p className="text-[11px] text-stone-400 max-w-sm mx-auto">Tidak ditemukan transaksi invoice yang sesuai dengan keyword pencarian, status, atau filter bulan Anda.</p>
                      <button
                        onClick={() => {
                          setInvoiceMonthFilter('All');
                          setInvoiceStatusFilter('All');
                          setInvoiceSearchQuery('');
                        }}
                        className="text-[11px] px-3 py-1 bg-stone-100 hover:bg-stone-150 rounded-lg font-bold text-stone-800 transition"
                      >
                        Hapus Semua Filter
                      </button>
                    </div>
                  )}
                </div>

                {/* Print only detailed list table */}
                <div className="hidden print:block font-sans text-xs pt-4">
                  <span className="block font-mono text-[9px] font-bold uppercase text-stone-500 mb-2">Lampiran Rekapitulasi Detail Transaksi Invoice</span>
                  <table className="w-full text-left border-collapse border border-stone-200 table-fixed">
                    <thead>
                      <tr className="bg-stone-50 text-stone-800 text-[8px] uppercase font-mono border-b border-stone-250">
                        <th className="p-2 border border-stone-150 w-[11%]">Tanggal</th>
                        <th className="p-2 border border-stone-150 w-[18%]">Voucher & Inv#</th>
                        <th className="p-2 border border-stone-150 w-[18%]">Vendor / Penerima</th>
                        <th className="p-2 border border-stone-150 w-[22%]">Kategori</th>
                        <th className="p-2 border border-stone-150 w-[13%] text-right font-bold">Nominal</th>
                        <th className="p-2 border border-stone-150 w-[8%] text-center">Status</th>
                        <th className="p-2 border border-stone-150 w-[10%]">Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoiceSubmissions.map((sub, idx) => {
                        const isLunas = sub.buktiPembayaran || sub.googleDriveFiles?.some(f => f.isBuktiPembayaran);
                        const grandTotal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
                        const invoiceAmtComputed = typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : grandTotal;
                        return (
                          <tr key={sub.id} className="border-b border-stone-200 font-sans text-[8.5px] text-stone-850">
                            <td className="p-2 border border-stone-150 font-mono whitespace-nowrap">{sub.tanggal}</td>
                            <td className="p-2 border border-stone-150 font-bold font-mono break-all whitespace-normal leading-tight">
                              {sub.invoiceNumber || sub.kode}
                            </td>
                            <td className="p-2 border border-stone-150 font-sans leading-snug break-words whitespace-normal">{sub.dibayarkanKepada}</td>
                            <td className="p-2 border border-stone-150 leading-relaxed break-words whitespace-normal">{sub.jenisPengajuan}</td>
                            <td className="p-2 border border-stone-150 text-right font-bold font-mono whitespace-nowrap">Rp {invoiceAmtComputed.toLocaleString('id-ID')}</td>
                            <td className="p-2 border border-stone-150 text-center font-mono font-bold text-[7.5px] leading-tight">
                              {isLunas ? 'LUNAS' : 'PENDING'}
                            </td>
                            <td className="p-2 border border-stone-150 text-[8px] text-stone-500 italic break-words whitespace-normal leading-tight">{sub.notes || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Formal signatures block for print reports */}
                  <div className="grid grid-cols-2 gap-8 mt-12 text-center text-xs font-sans">
                    <div>
                      <p className="text-stone-500 uppercase text-[9px] mb-12">YANG MELAPORKAN (FINANCE)</p>
                      <strong>{submissions[0]?.dibuatOleh || 'Nur Wahyudi'}</strong>
                      <p className="text-[10px] text-stone-400">Divisi Keuangan & Verifikasi</p>
                    </div>
                    <div>
                      <p className="text-stone-500 uppercase text-[9px] mb-12">DISETUJUI OLEH (DIREKTUR UTAMA)</p>
                      <strong>{submissions[0]?.disetujuiOleh2 || 'H. A. Nursyam Halid'}</strong>
                      <p className="text-[10px] text-stone-400">Direktur Utama</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      ) : layoutMode === 'unpaid_outstanding' ? (
        /* Dedicated KPI & Outstanding Payments Center View */
        <div className="space-y-6">
          {/* Header Panel */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in print:hidden">
            <div className="space-y-1.5 animate-slide-in">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-rose-50 rounded-xl text-rose-700">
                  <AlertCircle size={22} className="animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base font-black text-stone-900 tracking-tight font-display uppercase font-mono">Pusat Kewajiban Pembayaran</h2>
                  <p className="text-xs text-stone-500">Memonitoring, menyaring, dan mengekspor seluruh transaksi voucher pengeluaran yang berstatus belum lunas.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 hover:bg-stone-100 border border-stone-250 text-stone-800 font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none"
                title="Cetak Laporan Kewajiban Pembayaran ke PDF"
              >
                <Printer size={14} className="text-rose-600" />
                <span>Cetak Laporan Pembayaran (PDF)</span>
              </button>
              
              <button
                onClick={onAddNew}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-xs cursor-pointer select-none"
              >
                <Plus size={14} className="text-[#D4AF37]" />
                <span>Input Transaksi Baru</span>
              </button>
            </div>
          </div>

          {/* PRINT-ONLY HEADER AND FORMAL REPORT ACCENT - ONLY OUTDOES ON PAPER PRINTING */}
          <div className="hidden print:block font-sans text-black p-2 space-y-4">
            <div className="border-b-2 border-stone-900 pb-3 flex justify-between items-end">
              <div>
                <h1 className="text-lg font-bold font-display uppercase tracking-wider">PT NUSANTARA MINERAL SUKSES ABADI</h1>
                <p className="text-[10px] text-stone-500 font-mono">DIVISI FINANCE & INTERNAL LEDGER DATABASE</p>
                <h2 className="text-xs font-semibold text-stone-850 mt-0.5">Laporan Kewajiban Pembayaran (Outstanding Ledger)</h2>
              </div>
              <div className="text-right font-mono text-[9px] text-stone-500">
                <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p>Status: BELUM LUNAS (OUTSTANDING)</p>
                {unpaidLocationFilter !== 'All' && <p>Sektor Lokasi: {unpaidLocationFilter}</p>}
              </div>
            </div>

            {/* Print KPIs */}
            <div className="grid grid-cols-2 gap-4 border border-stone-300 p-2.5 rounded-lg font-mono text-[11px]">
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Total Kewajiban</span>
                <strong>{unpaidOutstandingStats.count} Item Tagihan / Voucher</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Total Nominal Harus Dibayar (Outstanding)</span>
                <strong>Rp {unpaidOutstandingStats.totalAmount.toLocaleString('id-ID')}</strong>
              </div>
            </div>
          </div>

          {/* Quick Metrics Columns (KPIs) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block">Total Voucher Outstanding</span>
                <div className="text-2xl font-black text-stone-900 font-display">
                  {unpaidOutstandingStats.count} <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">Transaksi</span>
                </div>
                <span className="text-[10px] text-rose-500 font-bold font-mono">Belum Lunas & Memerlukan Pembayaran</span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
                <AlertCircle size={20} />
              </div>
            </div>

            <div className="bg-stone-900 text-white p-5 rounded-2xl border border-stone-850 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-stone-400 font-mono tracking-widest uppercase block font-bold text-[#D4AF37]">Total Dana Outstanding</span>
                <div className="text-2xl font-black text-rose-400 font-display font-mono">
                  Rp {unpaidOutstandingStats.totalAmount.toLocaleString('id-ID')}
                </div>
                <span className="text-[10px] text-stone-400 block font-mono">Sisa tagihan yang harus segera ditransfer/tunai</span>
              </div>
              <div className="p-3 bg-stone-800 rounded-xl text-amber-500 border border-stone-750">
                <DollarSign size={20} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print:block">
            {/* LEFT COLUMN: LOCATION TABS SIDEBAR (print:hidden) */}
            <div className="lg:col-span-1 space-y-4 print:hidden">
              <div className="bg-white rounded-2xl border border-stone-200 p-4.5 space-y-3 shadow-3xs">
                <div>
                  <h3 className="text-xs font-black uppercase font-mono tracking-wider text-stone-500">Filter Sektor Lokasi</h3>
                  <p className="text-[10.5px] text-stone-400 mt-0.5">Saring tagihan berdasarkan lokasi penambangan atau administratif.</p>
                </div>

                <div className="space-y-1.5 pt-1.5 border-t border-stone-150/60">
                  <button
                    onClick={() => setUnpaidLocationFilter('All')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold rounded-xl transition cursor-pointer border ${
                      unpaidLocationFilter === 'All'
                        ? 'bg-rose-750 border-rose-800 text-white font-extrabold'
                        : 'bg-stone-50 text-stone-700 hover:bg-stone-150 border-stone-150'
                    }`}
                  >
                    <span>🌐 Semua Lokasi</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold font-mono ${
                      unpaidLocationFilter === 'All' ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'
                    }`}>
                      {allUnpaidSubmissionsAllTime.length}
                    </span>
                  </button>

                  {unpaidLocations.map((loc) => {
                    const countLoc = allUnpaidSubmissionsAllTime.filter(s => s.lokasi === loc).length;
                    return (
                      <button
                        key={loc}
                        onClick={() => setUnpaidLocationFilter(loc)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl transition cursor-pointer border ${
                          unpaidLocationFilter === loc
                            ? 'bg-rose-750 border-rose-800 text-white font-extrabold'
                            : 'bg-stone-50 text-stone-700 hover:bg-stone-150 border-stone-150'
                        }`}
                      >
                        <span className="truncate pr-1">📍 {loc}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold font-mono ${
                          unpaidLocationFilter === loc ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'
                        }`}>
                          {countLoc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Informative Help Card */}
              <div className="p-4 bg-amber-50/70 border border-amber-200/50 rounded-2xl text-xs text-amber-900 space-y-1 shadow-3xs">
                <span className="font-extrabold block text-amber-950 uppercase tracking-wide text-[10px]">💡 Petunjuk Untuk Finance</span>
                <p className="text-stone-600 text-[11px] leading-relaxed">
                  Laporan ini menunjukkan semua pengeluaran yang disetujui direksi namun belum ditransfer/dibayarkan. Gunakan tombol <strong className="text-stone-850">Cetak Laporan Pembayaran (PDF)</strong> untuk mencetak rekap fisik terverifikasi bagi pimpinan/petugas kas.
                </p>
              </div>
            </div>

            {/* RIGHT COLUMN: MAIN TABLE VIEW AND TRANSACTIONS */}
            <div className="lg:col-span-3 space-y-4 print:w-full print:block">
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden select-none">
                {/* Search & Filter table header */}
                <div className="px-6 py-4.5 bg-stone-50 border-b border-stone-150 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                  <div className="space-y-0.5">
                    <span className="text-xs uppercase font-mono tracking-widest text-rose-600 font-extrabold">
                      Outstanding Liabilities
                    </span>
                    <h3 className="text-sm font-black text-stone-900 flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                      <span>Daftar Transaksi Belum Selesai Lunas</span>
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search Term Input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={13} />
                      <input
                        type="text"
                        placeholder="Cari kode, penerima, item..."
                        className="pl-8.5 pr-3 py-1.5 w-48 sm:w-56 bg-white border border-stone-250 rounded-xl text-xs font-bold text-stone-700 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
                        value={unpaidSearchTerm}
                        onChange={(e) => setUnpaidSearchTerm(e.target.value)}
                      />
                    </div>

                    {unpaidSearchTerm && (
                      <button
                        onClick={() => setUnpaidSearchTerm('')}
                        className="text-[10px] px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-600 font-extrabold transition font-mono"
                      >
                        RESET
                      </button>
                    )}
                  </div>
                </div>

                {/* Table Data */}
                <div className="overflow-x-auto print:hidden">
                  {filteredUnpaidSubmissions.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-50/40 border-b border-stone-150 text-stone-500 font-mono text-[9px] uppercase tracking-wider font-extrabold">
                          <th className="py-3 px-5">Voucher</th>
                          <th className="py-3 px-5">Tanggal</th>
                          <th className="py-3 px-5">Sektor / Lokasi</th>
                          <th className="py-3 px-5">Jenis Pengajuan & Item</th>
                          <th className="py-3 px-5">Diberikan Kepada</th>
                          <th className="py-3 px-5 text-right">Nilai Outstanding</th>
                          <th className="py-3 px-5 text-center">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 text-stone-800 text-xs">
                        {filteredUnpaidSubmissions.map((sub) => {
                          const subSumTotal = sub.items.reduce((s, i) => s + i.total, 0);
                          return (
                            <tr key={sub.id} className="hover:bg-stone-50/50 transition">
                              <td className="py-3 px-5 whitespace-nowrap font-bold font-mono text-stone-900">
                                {sub.kode}
                              </td>
                              <td className="py-3 px-5 whitespace-nowrap font-bold text-stone-600">
                                {sub.tanggal}
                              </td>
                              <td className="py-3 px-5 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2 py-0.5 rounded-sm border border-stone-200 font-mono text-[10px] font-bold">
                                  {sub.lokasi}
                                </span>
                              </td>
                              <td className="py-3 px-5">
                                <div className="font-extrabold text-stone-900 truncate max-w-[170px]" title={sub.jenisPengajuan}>
                                  {sub.jenisPengajuan}
                                </div>
                                <div className="text-[10px] text-stone-400 mt-0.5 truncate max-w-[170px]" title={getIsiInvoice(sub)}>
                                  {getIsiInvoice(sub)}
                                </div>
                              </td>
                              <td className="py-3 px-5 whitespace-nowrap font-medium text-stone-900">
                                {sub.dibayarkanKepada}
                                <div className="text-[9px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-1 py-0.2 mt-0.5 inline-block ml-1">
                                  {sub.dibayarkanDengan}
                                </div>
                              </td>
                              <td className="py-3 px-5 text-right font-bold text-rose-700 font-mono whitespace-nowrap">
                                Rp {formatRupiah(subSumTotal)}
                              </td>
                              <td className="py-3 px-5">
                                <div className="flex items-center justify-center gap-1">
                                  {/* View / Print submission detail voucher */}
                                  <button
                                    onClick={() => onSelect(sub)}
                                    className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg transition"
                                    title="Tinjau & Cetak Voucher F1/F2"
                                  >
                                    <Eye size={12} />
                                  </button>

                                  {/* Trigger upload transfer proof to PAY */}
                                  {onOpenBuktiTransfer && (
                                    <button
                                      onClick={() => onOpenBuktiTransfer(sub)}
                                      className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-250 rounded-lg transition font-extrabold flex items-center justify-center gap-0.5"
                                      title="Unggah Bukti Bayar untuk Melunasi Tagihan ini"
                                    >
                                      <RefreshCw size={11} className="text-emerald-600" />
                                      <span className="text-[9px]">Bayar</span>
                                    </button>
                                  )}

                                  {onMarkAsPaid && isEligibleForManualPaymentMark(sub) && (
                                    <button
                                      onClick={() => {
                                        if (window.confirm(`Yakin ingin menandai voucher ${sub.kode} untuk "${sub.dibayarkanKepada}" sebagai SUDAH DIBAYAR (Lunas) tanpa bukti fisik? (Karena umur transaksi sudah lebih dari 1 minggu)`)) {
                                          onMarkAsPaid(sub.id);
                                        }
                                      }}
                                      className="p-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg transition font-extrabold flex items-center justify-center gap-0.5"
                                      title="Tandai Sudah Dibayar (Lunas tanpa bukti fisik)"
                                    >
                                      <CheckCircle size={11} className="text-teal-600" />
                                      <span className="text-[9px]">Tandai Lunas</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-24 text-center space-y-2">
                      <AlertCircle className="mx-auto text-stone-400 animate-pulse" size={32} />
                      <div className="text-stone-850 font-bold text-xs mt-1">Saringan Kewajiban Kosong</div>
                      <p className="text-[11px] text-stone-400 max-w-sm mx-auto">Selamat! Tidak ada transaksi outstanding/belum dibayar untuk saringan filter pencarian ini.</p>
                      <button
                        onClick={() => {
                          setUnpaidLocationFilter('All');
                          setUnpaidSearchTerm('');
                        }}
                        className="text-[11px] px-3 py-1 bg-stone-100 hover:bg-stone-150 rounded-lg font-bold text-stone-800 transition"
                      >
                        Bersihkan Saringan
                      </button>
                    </div>
                  )}
                </div>

                {/* Print only detailed list table */}
                <div className="hidden print:block font-sans text-xs pt-2">
                  <span className="block font-mono text-[8px] font-bold uppercase text-stone-500 mb-2">Lampiran Detail Kewajiban Pembayaran (All Outstanding Liabilities)</span>
                  <table className="w-full text-left border-collapse border border-stone-200 table-fixed">
                    <thead>
                      <tr className="bg-stone-50 text-stone-800 text-[8px] uppercase font-mono border-b border-stone-250">
                        <th className="p-2 border border-stone-150 w-[14%] whitespace-nowrap">No. Voucher</th>
                        <th className="p-2 border border-stone-150 w-[11%]">Tanggal</th>
                        <th className="p-2 border border-stone-150 w-[8%] text-center">Sektor</th>
                        <th className="p-2 border border-stone-150 w-[30%]">Uraian / Pekerjaan / Item</th>
                        <th className="p-2 border border-stone-150 w-[15%]">Vendor / Penerima Kas</th>
                        <th className="p-2 border border-stone-150 w-[14%] text-right font-black">Outstanding (Rp)</th>
                        <th className="p-2 border border-stone-150 w-[8%] text-center">Cara Bayar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnpaidSubmissions.map((sub, idx) => {
                        const sumTotal = sub.items.reduce((s, i) => s + i.total, 0);
                        return (
                          <tr key={sub.id} className="border-b border-stone-200 font-mono text-[8.5px] text-stone-800">
                            <td className="p-2 border border-stone-150 font-bold whitespace-nowrap break-all font-mono">{sub.kode}</td>
                            <td className="p-2 border border-stone-150 whitespace-nowrap">{sub.tanggal}</td>
                            <td className="p-2 border border-stone-150 text-center uppercase font-mono">{sub.lokasi}</td>
                            <td className="p-2 border border-stone-150 font-sans leading-relaxed break-words whitespace-normal">{sub.jenisPengajuan} - {getIsiInvoice(sub)}</td>
                            <td className="p-2 border border-stone-150 font-sans leading-snug break-words whitespace-normal">{sub.dibayarkanKepada}</td>
                            <td className="p-2 border border-stone-150 text-right font-bold text-stone-900 font-mono whitespace-nowrap">Rp {sumTotal.toLocaleString('id-ID')}</td>
                            <td className="p-2 border border-stone-150 text-center font-sans text-[8px] leading-tight break-words whitespace-normal">{sub.dibayarkanDengan}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Formal signatures block for print reports */}
                  <div className="grid grid-cols-2 gap-8 mt-12 text-center text-xs font-sans">
                    <div>
                      <p className="text-stone-500 uppercase text-[9px] mb-12">DIBUAT OLEH (DIVISI FINANCE)</p>
                      <strong className="border-b border-stone-800 pb-0.5">{submissions[0]?.dibuatOleh || 'Nur Wahyudi'}</strong>
                      <p className="text-[10px] text-stone-400 mt-0.5">Finance Department</p>
                    </div>
                    <div>
                      <p className="text-stone-500 uppercase text-[9px] mb-12">DISETUJUI & DIVERIFIKASI OLEH</p>
                      <strong className="border-b border-stone-800 pb-0.5">{submissions[0]?.disetujuiOleh2 || 'H. A. Nursyam Halid'}</strong>
                      <p className="text-[10px] text-stone-400 mt-0.5">Direktur Utama</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      ) : layoutMode === 'petty_cash_recap' ? (
        /* Dedicated Petty Cash Reconciliation and Report View */
        <div className="space-y-6">
          {/* Header Panel */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in print:hidden">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-violet-50 rounded-xl text-violet-700">
                  <Coins size={22} className="text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-black text-stone-900 tracking-tight font-display uppercase font-mono">Rekonsiliasi Petty Cash Lapangan</h2>
                  <p className="text-xs text-stone-500">Menganalisis, menyaring, and mengelola berkas laporan pertanggungjawaban petty cash lapangan per pemegang kas (custodian).</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 hover:bg-stone-100 border border-stone-250 text-stone-800 font-extrabold rounded-xl transition duration-150 text-xs shadow-3xs cursor-pointer select-none"
                title="Cetak Laporan Petty Cash Lapangan ke PDF"
              >
                <Printer size={14} className="text-violet-600" />
                <span>Cetak Rekap Pertanggungjawaban (PDF)</span>
              </button>
              
              <button
                onClick={onAddNew}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl transition duration-150 text-xs shadow-xs cursor-pointer select-none"
              >
                <Plus size={14} className="text-[#D4AF37]" />
                <span>Input Transaksi Baru</span>
              </button>
            </div>
          </div>

          {/* PRINT-ONLY HEADER AND FORMAL REPORT ACCENT */}
          <div className="hidden print:block font-sans text-black p-2 space-y-4">
            <div className="border-b-2 border-stone-900 pb-3 flex justify-between items-end">
              <div>
                <h1 className="text-lg font-bold font-display uppercase tracking-wider">PT NUSANTARA MINERAL SUKSES ABADI</h1>
                <p className="text-[10px] text-stone-500 font-mono">DIVISI FINANCE & INTERNAL LEDGER DATABASE</p>
                <h2 className="text-xs font-semibold text-stone-850 mt-0.5">Laporan Rekonsiliasi & Pertanggungjawaban Petty Cash Lapangan</h2>
              </div>
              <div className="text-right font-mono text-[9px] text-stone-500">
                <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                <p>Status: VERIFIKASI SELESAI</p>
                {pettyCashCustodianFilter !== 'All' && <p>Pemegang Kas: {pettyCashCustodianFilter}</p>}
                {pettyCashMonthFilter !== 'All' && <p>Periode Laporan: {pettyCashMonthFilter}</p>}
              </div>
            </div>

            {/* Print KPIs */}
            <div className="grid grid-cols-3 gap-4 border border-stone-300 p-2.5 rounded-lg font-mono text-[11px]">
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Total Pencatatan</span>
                <strong>{filteredPettyCashSubmissions.length} Transaksi Pengisian</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Yg Mengajukan LPJ</span>
                <strong>{pettyCashCustodianFilter === 'All' ? 'Semua Custodian' : pettyCashCustodianFilter}</strong>
              </div>
              <div>
                <span className="text-stone-500 uppercase block text-[8px]">Total Nominal Rekap</span>
                <strong>Rp {filteredPettyCashSubmissions.reduce((sum, sub) => sum + sub.items.reduce((s, i) => s + (i.total || 0), 0), 0).toLocaleString('id-ID')}</strong>
              </div>
            </div>
          </div>

          {/* KPI Cards (Metrics) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 print:hidden">
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 font-mono">Total Transaksi Petty Cash</span>
                <div className="text-2xl font-black text-stone-900 font-display">
                  {filteredPettyCashSubmissions.length} <span className="text-xs font-medium text-stone-400">Unit Voucher</span>
                </div>
              </div>
              <div className="p-3 bg-violet-50 text-violet-700 rounded-2xl">
                <Coins size={20} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 font-mono">Total Dana Direkon</span>
                <div className="text-2xl font-black text-stone-900 font-mono">
                  Rp {formatRupiah(filteredPettyCashSubmissions.reduce((sum, sub) => sum + sub.items.reduce((s, i) => s + (i.total || 0), 0), 0))}
                </div>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
                <FileSpreadsheet size={20} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-3xs flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 font-mono">Custodian Aktif</span>
                <div className="text-2xl font-black text-stone-900 font-display">
                  {availablePettyCashCustodians.length} <span className="text-xs font-medium text-stone-400">Personil</span>
                </div>
                {onOpenConsolidateModal && (
                  <button
                    onClick={onOpenConsolidateModal}
                    className="text-[11px] text-amber-800 hover:text-amber-900 font-extrabold flex items-center gap-1 hover:underline cursor-pointer pt-0.5"
                    title="Satukan nama yang berbeda huruf atau tidak lengkap"
                  >
                    <Sparkles size={12} className="text-amber-600" />
                    <span>Satukan Nama Serupa</span>
                  </button>
                )}
              </div>
              <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl">
                <User size={20} />
              </div>
            </div>
          </div>

          {/* Saringan & Sorter Panel */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-3xs print:hidden">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              
              {/* Search input field */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold text-stone-550">Pencarian Cepat</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
                  <input
                    type="text"
                    className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-transparent text-stone-800 placeholder-stone-400"
                    placeholder="Cari pemegang, kode pengisian, jenis, dll..."
                    value={pettyCashSearchQuery}
                    onChange={(e) => setPettyCashSearchQuery(e.target.value)}
                  />
                  {pettyCashSearchQuery && (
                    <button
                      onClick={() => setPettyCashSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs font-bold font-mono"
                    >
                      CLEAR
                    </button>
                  )}
                </div>
              </div>

              {/* Custodian Select Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-550">Pemegang Petty Cash</label>
                <select
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-850 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
                  value={pettyCashCustodianFilter}
                  onChange={(e) => setPettyCashCustodianFilter(e.target.value)}
                >
                  <option value="All">Semua Custodian ({availablePettyCashCustodians.length})</option>
                  {availablePettyCashCustodians.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Month Select Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-550">Periode Bulan</label>
                <select
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-850 focus:outline-none focus:ring-1 focus:ring-violet-500 cursor-pointer"
                  value={pettyCashMonthFilter}
                  onChange={(e) => setPettyCashMonthFilter(e.target.value)}
                >
                  <option value="All">Semua Periode ({availablePettyCashMonths.length})</option>
                  {availablePettyCashMonths.map(m => {
                    const [y, mNum] = m.split('-');
                    const indMonths = [
                      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
                    ];
                    const label = `${indMonths[parseInt(mNum, 10) - 1]} ${y}`;
                    return <option key={m} value={m}>{label}</option>;
                  })}
                </select>
              </div>

            </div>
          </div>

          {/* Table Ledger view */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden print:shadow-none print:border-none">
            <div className="p-5 border-b border-stone-200/80 flex items-center justify-between print:hidden">
              <span className="text-xs font-black uppercase font-mono tracking-wider text-stone-600">Daftar Laporan Pertanggungjawaban Petty Cash Terdaftar</span>
              <span className="text-[10px] bg-violet-100 text-violet-850 font-mono font-extrabold px-2 py-0.5 rounded-lg border border-violet-150 shadow-3xs uppercase">
                {filteredPettyCashSubmissions.length} Transaksi Ditemukan
              </span>
            </div>

            <div className="overflow-x-auto">
              {filteredPettyCashSubmissions.length > 0 ? (
                <table className="w-full text-left border-collapse print:table">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-display text-[10px] uppercase tracking-widest font-extrabold">
                      <th className="py-4 px-6 print:py-2 print:px-3">Tanggal & Voucher</th>
                      <th className="py-4 px-6 print:py-2 print:px-3">Pemegang Petty Cash</th>
                      <th className="py-4 px-6 print:py-2 print:px-3">Uraian / Sektor Lokasi</th>
                      <th className="py-4 px-6 text-right print:py-2 print:px-3">Jumlah Pengisian</th>
                      <th className="py-4 px-6 text-center print:py-2 print:px-3 font-extrabold">Berkas LPJ</th>
                      <th className="py-4 px-6 text-center print:hidden">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-850 text-xs">
                    {filteredPettyCashSubmissions.map((sub) => {
                      const totalNominal = sub.items.reduce((s, i) => s + (i.total || 0), 0);
                      return (
                        <tr key={sub.id} className="hover:bg-stone-50/50 transition">
                          {/* Tanggal & Voucher Code */}
                          <td className="py-4.5 px-6 whitespace-nowrap print:py-1.5 print:px-3 font-mono">
                            <div className="font-extrabold text-stone-900">{formatDateIndonesian(sub.tanggal)}</div>
                            <div className="text-[10px] font-mono text-stone-400 mt-0.5">{sub.kode}</div>
                          </td>

                          {/* Pemegang Petty Cash Custodian */}
                          <td className="py-4.5 px-6 print:py-1.5 print:px-3">
                            <div className="flex items-center gap-1.5">
                              <div className="h-6 w-6 rounded-full bg-violet-100 text-violet-800 flex items-center justify-center font-bold text-[10px] uppercase font-sans shrink-0">
                                {sub.pettyCashCustodian ? sub.pettyCashCustodian.charAt(0) : 'C'}
                              </div>
                              <div>
                                <span className="font-black text-stone-900 block leading-tight">{sub.pettyCashCustodian || '-'}</span>
                                <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">Custodian Lapangan</span>
                              </div>
                            </div>
                          </td>

                          {/* Uraian dan Lokasi */}
                          <td className="py-4.5 px-6 print:py-1.5 print:px-3">
                            <div className="font-bold text-stone-850">{sub.jenisPengajuan}</div>
                            <div className="text-[10.5px] text-stone-550 mt-0.5 font-sans leading-relaxed">
                              Sektor Lokasi: <strong className="text-stone-700">{sub.lokasi}</strong>
                              {sub.notes && <span className="block mt-0.5 text-stone-400 italic">"{sub.notes}"</span>}
                            </div>
                          </td>

                          {/* Jumlah Pengisian */}
                          <td className="py-4.5 px-6 text-right font-mono font-extrabold text-stone-900 print:py-1.5 print:px-3 text-xs leading-none">
                            Rp {formatRupiah(totalNominal)}
                          </td>

                          {/* Berkas LPJ Link */}
                          <td className="py-4.5 px-6 text-center print:py-1.5 print:px-3 whitespace-nowrap">
                            {sub.pettyCashFile?.url ? (
                              <a
                                href={sub.pettyCashFile.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 rounded-xl transition font-mono text-[10px] font-bold shadow-3xs hover:shadow-2xs select-none"
                                title={`Buka berkas LPJ: ${sub.pettyCashFile.name}`}
                              >
                                📂 Drive Report
                                <ExternalLink size={10} />
                              </a>
                            ) : (
                              <div className="text-[10px] text-stone-400 font-mono">- Belum Diunggah -</div>
                            )}
                          </td>

                          {/* Action button */}
                          <td className="py-4.5 px-6 text-center print:hidden whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                title="Buka Detail / Cetak PDF"
                                onClick={() => onSelect(sub)}
                                className="p-2 hover:bg-stone-50 border border-transparent hover:border-stone-200 text-[#D4AF37] hover:text-[#Bca031] rounded-xl transition cursor-pointer shadow-3xs bg-white"
                              >
                                <Eye size={15} />
                              </button>
                              
                              <button
                                title="Edit Transaksi ini"
                                onClick={() => onEdit(sub)}
                                className="p-2 hover:bg-stone-50 border border-transparent hover:border-stone-200 text-sky-500 hover:text-sky-750 rounded-xl transition cursor-pointer shadow-3xs bg-white"
                              >
                                <Edit2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-24 text-center space-y-2 print:py-12">
                  <Coins className="mx-auto text-stone-400" size={32} />
                  <div className="text-stone-850 font-bold text-xs mt-1">Saringan Kosong</div>
                  <p className="text-[11px] text-stone-400 max-w-sm mx-auto">Tidak ditemukan transaksi pengisian petty cash lapangan terdaftar yang sesuai dengan saringan Anda.</p>
                  <button
                    onClick={() => {
                      setPettyCashCustodianFilter('All');
                      setPettyCashMonthFilter('All');
                      setPettyCashSearchQuery('');
                    }}
                    className="text-[11px] px-3 py-1 bg-stone-100 hover:bg-stone-150 rounded-lg font-bold text-stone-800 transition cursor-pointer"
                  >
                    Hapus Semua Saringan
                  </button>
                </div>
              )}
            </div>

            {/* PRINT OPTION SIGNATURE SECTION */}
            <div className="hidden print:block font-sans text-xs pt-12 pb-6">
              <div className="grid grid-cols-2 gap-8 text-center">
                <div>
                  <p className="text-stone-550 uppercase text-[9px] mb-14 font-mono">YANG MELAPORKAN (FINANCE)</p>
                  <strong className="text-stone-850 block">{submissions[0]?.dibuatOleh || 'Nur Wahyudi'}</strong>
                  <span className="text-[9.5px] text-stone-400">Divisi Keuangan & Verifikasi</span>
                </div>
                <div>
                  <p className="text-stone-550 uppercase text-[9px] mb-14 font-mono">DISETUJUI OLEH OLEH (DIREKTUR UTAMA)</p>
                  <strong className="text-stone-850 block">{submissions[0]?.disetujuiOleh2 || 'H. A. Nursyam Halid'}</strong>
                  <span className="text-[9.5px] text-stone-400 font-sans">Direktur Utama</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* Log Riwayat Audit Detail View */
        <div className="bg-white rounded-2xl border border-stone-250 shadow-sm overflow-hidden animate-fade-in">
          {/* Header Activity Log panel */}
          <div className="px-6 py-5 bg-stone-50 border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-stone-900">Riwayat Audit & Aktivitas Aplikasi</span>
                <span className="text-[10px] bg-[#917118] text-white font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {filteredLogs.length} Entri Terdaftar
                </span>
              </div>
              <p className="text-xs text-stone-500 font-sans">Log sinkronisasi transaksi, persetujuan admin, dan pengunggahan bukti pembayaran Google Drive secara real-time.</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Search Log (only visible on "all" logs tab) */}
              {logsTab === 'all' && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                  <input
                    type="text"
                    placeholder="Cari kata kunci log..."
                    className="pl-8 pr-4 py-1.5 w-full sm:w-56 bg-white border border-stone-250 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#917118] focus:border-transparent text-stone-700 font-mono"
                    value={logsSearchTerm}
                    onChange={(e) => setLogsSearchTerm(e.target.value)}
                  />
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={reloadLogs}
                disabled={isLoadingLogs}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-stone-250 hover:bg-stone-50 text-stone-700 bg-white font-extrabold rounded-xl text-xs transition duration-150 shadow-3xs cursor-pointer shrink-0"
              >
                <RefreshCw size={12} className={isLoadingLogs ? 'animate-spin' : ''} />
                <span>Segarkan</span>
              </button>
            </div>
          </div>

          {/* Sub Tab Navigation */}
          <div className="px-6 py-3 bg-stone-50/50 border-b border-stone-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
            <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 flex-wrap gap-1">
              <button
                onClick={() => setLogsTab('all')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
                  logsTab === 'all'
                    ? 'bg-white text-stone-900 shadow-3xs font-extrabold'
                    : 'text-stone-550 hover:text-stone-900'
                }`}
              >
                <Database size={13} />
                <span>Semua Log Aktivitas</span>
              </button>

              <button
                onClick={() => setLogsTab('deletions')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
                  logsTab === 'deletions'
                    ? 'bg-rose-50 border border-rose-200/50 text-rose-800 shadow-3xs font-extrabold'
                    : 'text-stone-550 hover:text-stone-900'
                }`}
              >
                <Trash2 size={13} className={logsTab === 'deletions' ? 'text-rose-600' : ''} />
                <span>Riwayat Penghapusan ({deletionLogs.length})</span>
              </button>

              <button
                onClick={() => setLogsTab('missing_analysis')}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-150 cursor-pointer ${
                  logsTab === 'missing_analysis'
                    ? 'bg-amber-50 border border-amber-200/50 text-[#8a6810] shadow-3xs font-extrabold'
                    : 'text-stone-550 hover:text-stone-900'
                }`}
              >
                <AlertCircle size={13} className={logsTab === 'missing_analysis' ? 'text-amber-600' : ''} />
                <span>Analisis Nomor Hilang ({missingVouchersAnalysis.reduce((acc, curr) => acc + curr.missing.length, 0)})</span>
              </button>
            </div>

            <div className="text-[10px] text-stone-400 font-mono">
              Status Sinkron: {isFirebaseConfigured() ? '☁️ Firebase Aktif' : '💾 Penyimpanan Lokal'}
            </div>
          </div>

          {/* Tab 1: ALL LOGS */}
          {logsTab === 'all' && (
            <div className="overflow-x-auto">
              {isLoadingLogs ? (
                <div className="py-20 text-center text-stone-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={32} className="animate-spin text-[#917118]" />
                  <span className="text-xs font-bold text-stone-500">Memuat log riwayat aktivitas terbaru...</span>
                </div>
              ) : filteredLogs.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50/60 border-b border-stone-200 text-stone-500 font-mono text-[10px] uppercase tracking-wider">
                      <th className="py-3.5 px-6">Waktu Kejadian (WIB)</th>
                      <th className="py-3.5 px-6">Pelaku Aktivitas</th>
                      <th className="py-3.5 px-6">Nama Modul</th>
                      <th className="py-3.5 px-6">Detail Log Aktivitas</th>
                      <th className="py-3.5 px-6 text-center">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-800 text-xs font-mono">
                    {filteredLogs.map((log) => {
                      const affiliateSub = submissions.find(s => s.id === log.submissionId || (s.kode && log.submissionCode && s.kode === log.submissionCode));
                      const logDate = new Date(log.timestamp);
                      const isToday = new Date().toDateString() === logDate.toDateString();
                      
                      let timeStr = logDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      let fullDateStr = isToday 
                        ? `Hari ini, ${timeStr}`
                        : `${formatDateIndonesian(log.timestamp.split('T')[0])} ${timeStr}`;

                      let catStyle = "bg-stone-100 text-stone-700 border-stone-200";
                      if (log.category === 'success') {
                        catStyle = "bg-emerald-50 text-emerald-800 border-emerald-150";
                      } else if (log.category === 'warning') {
                        catStyle = "bg-rose-50 text-rose-800 border-rose-150";
                      } else if (log.category === 'info') {
                        catStyle = "bg-sky-50 text-sky-800 border-sky-150";
                      }

                      return (
                        <tr key={log.id} className="hover:bg-stone-50/40 transition">
                          <td className="py-3.5 px-6 whitespace-nowrap">
                            <span className="text-[11px] text-stone-500 font-mono">{fullDateStr}</span>
                          </td>

                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-[10px] uppercase select-none font-sans shrink-0">
                                {log.userName ? log.userName.charAt(0) : 'S'}
                              </div>
                              <div className="font-sans text-left">
                                <div className="font-bold text-stone-800 text-xs">{log.userName || 'Sistem'}</div>
                                <div className="text-[10px] text-stone-400 font-mono leading-none">{log.userEmail || 'system_ledger'}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-6 whitespace-nowrap">
                            <span className={`px-2 py-0.5 border text-[10px] font-mono font-black rounded-lg ${catStyle}`}>
                              {log.action.toUpperCase()}
                            </span>
                          </td>

                          <td className="py-3.5 px-6 text-left">
                            <p className="max-w-md break-all sm:break-normal text-stone-700 leading-normal font-sans text-xs">{log.details}</p>
                          </td>

                          <td className="py-3.5 px-6 whitespace-nowrap text-center font-sans">
                            {affiliateSub ? (
                              <button
                                onClick={() => {
                                  onSelect(affiliateSub);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-900 border border-stone-800 text-white hover:bg-stone-800 font-extrabold rounded-lg transition duration-150 text-[10px] cursor-pointer shadow-3xs"
                                title="Buka / Cetak voucher transaksi yang sah"
                              >
                                <Eye size={11} className="text-[#D4AF37]" />
                                <span>Lihat Voucher</span>
                              </button>
                            ) : log.submissionCode ? (
                              <span className="text-[10px] text-stone-400 font-mono">ID: {log.submissionCode}</span>
                            ) : (
                              <span className="text-[10px] text-stone-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-20 text-center text-stone-400 text-xs">
                  Belum terdaftar riwayat ataupun asersi kejadian dalam sistem log riwayat aktivitas.
                </div>
              )}
            </div>
          )}

          {/* Tab 2: DELETED VOUCHERS */}
          {logsTab === 'deletions' && (
            <div className="overflow-x-auto text-left">
              {isLoadingLogs ? (
                <div className="py-20 text-center text-stone-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={32} className="animate-spin text-rose-500" />
                  <span className="text-xs font-bold text-stone-500">Memuat riwayat penghapusan...</span>
                </div>
              ) : deletionLogs.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-rose-50/40 border-b border-rose-100 text-stone-500 font-mono text-[10px] uppercase tracking-wider">
                      <th className="py-3.5 px-6">Waktu Penghapusan</th>
                      <th className="py-3.5 px-6">Dihapus Oleh</th>
                      <th className="py-3.5 px-6">Nomor Voucher</th>
                      <th className="py-3.5 px-6">Rincian Transaksi Yang Dihapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-850 text-xs font-mono">
                    {deletionLogs.map((log) => {
                      const logDate = new Date(log.timestamp);
                      const isToday = new Date().toDateString() === logDate.toDateString();
                      
                      let timeStr = logDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      let fullDateStr = isToday 
                        ? `Hari ini, ${timeStr}`
                        : `${formatDateIndonesian(log.timestamp.split('T')[0])} ${timeStr}`;

                      return (
                        <tr key={log.id} className="hover:bg-rose-50/10 transition">
                          <td className="py-3.5 px-6 whitespace-nowrap">
                            <span className="text-[11px] text-rose-750 font-semibold font-mono">{fullDateStr}</span>
                          </td>

                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-[10px] uppercase select-none font-sans shrink-0">
                                {log.userName ? log.userName.charAt(0) : 'U'}
                              </div>
                              <div className="font-sans text-left">
                                <div className="font-bold text-stone-850 text-xs">{log.userName || 'Sistem'}</div>
                                <div className="text-[10px] text-stone-400 font-mono leading-none">{log.userEmail || 'offline_user'}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-6 whitespace-nowrap">
                            <span className="px-2.5 py-1 bg-rose-50 border border-rose-100 text-rose-700 font-black rounded-lg text-[11px]">
                              {log.submissionCode || 'TIDAK TERDEFINISI'}
                            </span>
                          </td>

                          <td className="py-3.5 px-6 font-sans text-xs text-stone-700 text-left">
                            <p className="max-w-2xl whitespace-pre-line leading-relaxed">{log.details}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-20 text-center text-stone-400 text-xs flex flex-col items-center justify-center gap-2">
                  <Trash2 size={24} className="text-stone-300" />
                  <span>Belum ada transaksi yang tercatat dihapus dari sistem.</span>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: MISSING SEQUENTIAL NUMBERS */}
          {logsTab === 'missing_analysis' && (
            <div className="p-6 text-left space-y-6">
              <div className="bg-amber-50/60 border border-amber-200/60 p-4 rounded-xl text-stone-800 text-xs leading-relaxed space-y-2 font-sans">
                <div className="flex items-center gap-2 font-black text-amber-900">
                  <AlertCircle size={15} className="text-amber-600 shrink-0" />
                  <span>Bagaimana Deteksi Nomor Voucher Hilang Bekerja?</span>
                </div>
                <p className="text-stone-600 leading-relaxed">
                  Sistem menganalisis urutan nomor seri voucher transaksi (contoh format otomatis: <code className="bg-white/80 px-1 border border-stone-200 rounded font-mono text-[10.5px]">BKK-NMSA/VI/26/1001, 1002, 1003...</code>) berdasarkan masing-masing kelompok perusahaan/bulan/tahun. Jika ada nomor seri yang terlewat atau bolong dalam daftar aktif, sistem mendeteksinya sebagai <strong>Nomor Hilang (Gaps)</strong> dan mengorelasikannya dengan log penghapusan untuk mengonfirmasi apakah voucher tersebut dihapus secara resmi oleh admin, atau sekadar diloncati saat pembuatan transaksi manual.
                </p>
              </div>

              {isLoadingLogs ? (
                <div className="py-12 text-center text-stone-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={32} className="animate-spin text-amber-500" />
                  <span className="text-xs font-bold text-stone-500">Menganalisis urutan transaksi...</span>
                </div>
              ) : missingVouchersAnalysis.length > 0 ? (
                <div className="space-y-6">
                  {missingVouchersAnalysis.map((group, idx) => {
                    const totalMissing = group.missing.length;
                    return (
                      <div key={idx} className="border border-stone-200 rounded-xl overflow-hidden shadow-3xs bg-white font-sans">
                        {/* Group Header */}
                        <div className="px-5 py-3.5 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="space-y-0.5 text-left">
                            <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Prefix Kelompok</span>
                            <h4 className="font-bold text-stone-800 text-sm font-mono">{group.prefix}</h4>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-stone-200/60 text-stone-700 font-mono text-[10px] rounded-md" title="Jangkauan nomor sequence terdaftar">
                              Rentang: {group.range}
                            </span>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold rounded-md">
                              {group.activeCount} Voucher Aktif
                            </span>
                            {totalMissing > 0 ? (
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 font-mono text-[10px] font-black rounded-md animate-pulse">
                                {totalMissing} Nomor Hilang
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-500 text-white font-mono text-[10px] font-bold rounded-md">
                                Lengkap & Sesuai Urutan
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Missing items list */}
                        <div className="divide-y divide-stone-100">
                          {totalMissing > 0 ? (
                            group.missing.map((missingItem, mIdx) => {
                              const delLog = missingItem.deletedLog;
                              return (
                                <div key={mIdx} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50/20 transition">
                                  {/* Code and Sequence Number */}
                                  <div className="flex items-center gap-3 text-left">
                                    <span className="h-5 w-5 bg-stone-100 text-stone-600 font-mono font-bold text-[10px] rounded flex items-center justify-center shrink-0">
                                      #{missingItem.sequence}
                                    </span>
                                    <div className="space-y-0.5">
                                      <span className="font-bold font-mono text-stone-900 text-xs">
                                        {missingItem.fullKode}
                                      </span>
                                      <p className="text-[10px] text-stone-400">Nomor voucher ini tidak terdaftar aktif di database.</p>
                                    </div>
                                  </div>

                                  {/* Status indicator / Deletion cross-reference */}
                                  <div className="sm:text-right shrink-0 text-left">
                                    {delLog ? (
                                      <div className="space-y-1">
                                        <div className="flex items-center sm:justify-end gap-1.5 text-xs text-rose-600 font-bold">
                                          <Trash2 size={12} />
                                          <span>DIHAPUS RESMI</span>
                                        </div>
                                        <p className="text-[10px] text-stone-500">
                                          Oleh <strong>{delLog.userName}</strong> pada {new Date(delLog.timestamp).toLocaleDateString('id-ID')}
                                        </p>
                                        <p className="text-[9.5px] text-stone-400 max-w-xs font-sans italic truncate sm:text-right" title={delLog.details}>
                                          "{delLog.details}"
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="space-y-1">
                                        <div className="flex items-center sm:justify-end gap-1.5 text-xs text-amber-600 font-black">
                                          <AlertCircle size={12} />
                                          <span>HILANG / TERLEWATKAN</span>
                                        </div>
                                        <p className="text-[10px] text-stone-400 max-w-xs leading-normal sm:text-right">
                                          Tidak ada log penghapusan. Kemungkinan diloncati saat pembuatan transaksi manual.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="p-6 text-center text-stone-400 text-xs flex items-center justify-center gap-2">
                              <CheckCircle size={14} className="text-emerald-500" />
                              <span>Hebat! Seluruh urutan nomor voucher dalam kelompok ini terisi lengkap tanpa ada celah (gap).</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 text-center text-stone-400 text-xs flex flex-col items-center justify-center gap-2">
                  <CheckCircle size={32} className="text-emerald-500" />
                  <span className="font-bold text-stone-600">Urutan Voucher Sempurna!</span>
                  <span>Tidak ditemukan celah atau nomor voucher yang hilang pada seluruh data aktif.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 
        FORMAL PRINT REPORT ACCENT: 
        Only visible on physical print paper or PDF export (hidden on screen)
      */}
      {layoutMode === 'standard' && (
        <div id="printable-submissions-table" className="hidden print:block print-only-container font-sans text-black p-0 space-y-4 max-w-full overflow-hidden">
          <div className="border-b-2 border-stone-900 pb-2.5 flex justify-between items-end">
            <div>
              <h1 className="text-base font-bold font-display uppercase tracking-wider text-stone-900 leading-tight">
                {activeCompanyFullName.toUpperCase()}
              </h1>
              <p className="text-[9px] text-stone-600 font-mono">DIVISI FINANCE &amp; INTERNAL LEDGER DATABASE</p>
              <h2 className="text-xs font-bold text-stone-850 mt-0.5">Laporan List Transaksi Pengeluaran Kas / Bank</h2>
            </div>
            <div className="text-right font-mono text-[8.5px] text-stone-600 leading-tight">
              <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              <p>Filter: {monthFilter === 'All' ? 'Semua Bulan' : MONTHS_LIST.find(m => m.value === monthFilter)?.label} {yearFilter === 'All' ? 'Semua Tahun' : yearFilter}</p>
            </div>
          </div>

          <table className="w-full text-left border-collapse text-[8.5px] my-1 table-fixed max-w-full">
            <thead>
              <tr className="bg-stone-100 border-y-2 border-stone-900 font-bold text-stone-900 text-[8.5px]">
                <th className="py-1 px-1 border border-stone-400 text-center w-[3.5%]">No</th>
                <th className="py-1 px-1 border border-stone-400 w-[11%]">Tanggal</th>
                <th className="py-1 px-1 border border-stone-400 w-[15%]">No Voucher/Kode</th>
                <th className="py-1 px-1 border border-stone-400 w-[6%] text-center">Lokasi</th>
                <th className="py-1 px-1.5 border border-stone-400 w-[17%]">Jenis Pengajuan</th>
                <th className="py-1 px-1.5 border border-stone-400 w-[18%]">Penerima Kas</th>
                <th className="py-1 px-1 border border-stone-400 w-[7%] text-center">Metode</th>
                <th className="py-1 px-1 border border-stone-400 w-[8.5%] text-center">Status</th>
                <th className="py-1 px-1.5 border border-stone-400 w-[14%] text-right">Total Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-300">
              {filteredSubmissions.length > 0 ? (
                filteredSubmissions.map((sub, idx) => {
                  const subTotal = sub.items.reduce((sum, i) => sum + i.total, 0);
                  const effStatus = getSubStatus(sub);
                  const displayStatus = effStatus === 'DP / Cicilan'
                    ? `DP/Cicilan${sub.dpAmount ? ` (Rp ${formatRupiah(sub.dpAmount)})` : ''}`
                    : effStatus;
                  return (
                    <tr key={sub.id} className="align-top border-b border-stone-300">
                      <td className="py-1 px-1 border border-stone-300 text-center font-mono text-stone-600 text-[8px]">{idx + 1}</td>
                      <td className="py-1 px-1 border border-stone-300 font-medium leading-tight break-words text-[8px]">
                        {formatDateIndonesian(sub.tanggal)}
                      </td>
                      <td className="py-1 px-1 border border-stone-300 font-mono font-bold text-stone-900 break-all leading-tight text-[8px]">
                        {sub.kode}
                      </td>
                      <td className="py-1 px-1 border border-stone-300 font-semibold text-center break-words text-[8px]">
                        {sub.lokasi || '-'}
                      </td>
                      <td className="py-1 px-1.5 border border-stone-300 text-stone-900 leading-tight break-words text-[8px]">
                        {sub.jenisPengajuan || '-'}
                      </td>
                      <td className="py-1 px-1.5 border border-stone-300 font-bold text-stone-900 leading-tight break-words text-[8px]">
                        {sub.dibayarkanKepada || '-'}
                      </td>
                      <td className="py-1 px-1 border border-stone-300 text-center font-mono text-stone-600 text-[7.5px]">
                        Transfer
                      </td>
                      <td className="py-1 px-1 border border-stone-300 text-center font-mono font-bold text-[7.5px] leading-tight break-words">
                        {displayStatus}
                      </td>
                      <td className="py-1 px-1.5 border border-stone-300 text-right font-mono font-black text-stone-900 text-[8.5px] whitespace-nowrap">
                        Rp {formatRupiah(subTotal)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-400">Tidak ada data transaksi yang cocok dengan kriteria filter.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              {/* Total Row */}
              <tr className="bg-stone-100 font-bold text-stone-955 border-t-2 border-stone-900">
                <td colSpan={8} className="py-1.5 px-2 text-right text-stone-850 font-mono text-[8.5px] uppercase tracking-wider">
                  SUM/TOTAL NILAI KELUAR:
                </td>
                <td className="py-1.5 px-1.5 text-right font-mono text-[9px] font-black text-stone-955 whitespace-nowrap">
                  Rp {formatRupiah(filteredSubmissions.reduce((sum, s) => sum + s.items.reduce((acc, i) => acc + i.total, 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Autograph / Tanda Tangan (Dapat Diatur 1-8 Kolom atau Dihilangkan Sepenuhnya) */}
          {listShowSigners && (
            <div className="pt-6 pb-4 page-break break-inside-avoid">
              <F1SignaturesBlock
                signers={listSigners}
                style={listSignatureStyle}
                density="dense"
                isCompact
              />
            </div>
          )}
        </div>
      )}

      {/* Quick Share Modal for Selected Submission */}
      {shareModalSub && (() => {
        const grandTotal = shareModalSub.items.reduce((sum, item) => sum + item.total, 0);
        const cleanSlug = (text: string) => (text || 'transaksi').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const shareSlug = cleanSlug(shareModalSub.jenisPengajuan);
        const isLunas = (shareModalSub.status || '').toLowerCase() === 'lunas' || shareModalSub.dibayarkanDengan === 'Cek/Transfer';

        const shareParams = new URLSearchParams();
        shareParams.set('id', shareModalSub.id);
        if (shareModalSub.kode) shareParams.set('kode', shareModalSub.kode);
        shareParams.set('transaksi', shareSlug);
        shareParams.set('nominal', String(grandTotal));
        if (shareModalSub.dibayarkanKepada) shareParams.set('kepada', shareModalSub.dibayarkanKepada);
        if (shareModalSub.tanggal) shareParams.set('tanggal', shareModalSub.tanggal);
        if (shareModalSub.status) shareParams.set('status', shareModalSub.status);
        if (shareModalSub.dibayarkanDengan) shareParams.set('bayar', shareModalSub.dibayarkanDengan);
        if (shareModalSub.items && shareModalSub.items.length > 0) {
          try {
            shareParams.set('items', JSON.stringify(shareModalSub.items.slice(0, 10)));
          } catch (_) {}
        }

        const shareUrl = getVoucherShareLink(shareModalSub.id, {
          kode: shareModalSub.kode,
          transaksi: shareSlug,
          nominal: grandTotal,
          kepada: shareModalSub.dibayarkanKepada,
          tanggal: shareModalSub.tanggal,
          status: shareModalSub.status,
          bayar: shareModalSub.dibayarkanDengan
        });
        const shareImageUrl = `/api/share-image?${shareParams.toString()}`;

        // Ensure backend memory and persistent store has the latest submission record for share-image
        try {
          fetch('/api/sync-submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submission: shareModalSub })
          }).catch(() => {});
        } catch (_) {}

        const itemsListText = (shareModalSub.items || [])
          .slice(0, 5)
          .map((it, idx) => `   ${idx + 1}. ${it.item} (Rp ${(it.total || 0).toLocaleString('id-ID')})`)
          .join('\n');

        const waText = `🧾 *BUKTI PENGELUARAN KAS / BANK (VOUCHER)*\n` +
          `*PT NUSANTARA MINERAL SUKSES ABADI*\n` +
          `─────────────────────────────\n` +
          `• *No. Voucher:* ${shareModalSub.kode}\n` +
          `• *Dibayarkan Kepada:* ${shareModalSub.dibayarkanKepada}\n` +
          `• *Tanggal:* ${formatDateIndonesian(shareModalSub.tanggal)}\n` +
          `• *Jenis Pengajuan:* ${shareModalSub.jenisPengajuan || 'Dokumen Transaksi'}\n` +
          `• *Isi Transaksi:*\n${itemsListText || `   1. ${shareModalSub.jenisPengajuan || 'Transaksi'} (Rp ${grandTotal.toLocaleString('id-ID')})`}\n` +
          `• *Total Jumlah:* Rp ${grandTotal.toLocaleString('id-ID')}\n` +
          `• *Status:* ${isLunas ? '✅ Lunas' : '⏳ Belum Lunas'}\n` +
          `─────────────────────────────\n\n` +
          `Silakan klik tautan di bawah ini untuk melihat detail lengkap transaksi beserta gambar voucher & bukti bayar:\n` +
          `${shareUrl}`;

        return (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 print:hidden animate-fade-in">
            <div className="bg-white rounded-3xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="p-5 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                    <Share2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black font-display tracking-tight text-white">
                      Bagikan Tautan Transaksi & Gambar
                    </h3>
                    <p className="text-[11px] text-stone-400 font-mono">
                      Pratinjau otomatis di WhatsApp & Medsos
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShareModalSub(null)}
                  className="p-1.5 hover:bg-stone-800 text-stone-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {/* Visual Card Preview */}
                <div className="rounded-2xl border border-stone-250 bg-stone-50 overflow-hidden shadow-xs">
                  <div className="aspect-[1200/630] w-full bg-stone-100 relative overflow-hidden flex items-center justify-center border-b border-stone-200">
                    <img
                      src={shareImageUrl}
                      alt={shareModalSub.jenisPengajuan}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="absolute top-2 left-2 px-2.5 py-1 bg-white/95 backdrop-blur-xs border border-stone-300 text-stone-900 text-[10px] font-mono font-bold rounded-lg shadow-xs">
                      {shareModalSub.kode}
                    </div>
                  </div>
                  <div className="p-3.5 space-y-1.5 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {shareModalSub.jenisPengajuan || 'Transaksi'}
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${isLunas ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                        {isLunas ? 'LUNAS' : 'BELUM LUNAS'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-stone-500 font-medium">Dibayarkan Kepada:</p>
                        <p className="text-xs font-bold text-stone-900 truncate">{shareModalSub.dibayarkanKepada}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-stone-500 font-medium">Total Jumlah:</p>
                        <p className="text-base font-black font-mono text-stone-900">
                          Rp {formatRupiah(grandTotal)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Share URL Box */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-500 uppercase font-mono tracking-wider">
                    Tautan Publik Berisi Judul & Nominal
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="flex-1 px-3 py-2 bg-stone-100 border border-stone-300 rounded-xl text-xs font-mono text-stone-800 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setIsCopiedShare(true);
                        setTimeout(() => setIsCopiedShare(false), 2500);
                      }}
                      className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold font-mono transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {isCopiedShare ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{isCopiedShare ? 'Tersalin' : 'Salin'}</span>
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Send size={15} />
                    <span>Bagikan via WhatsApp</span>
                  </a>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-stone-250 cursor-pointer"
                  >
                    <ExternalLink size={15} />
                    <span>Buka Tautan</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL ANALISIS & REKAP POTENSI TRANSAKSI DOBEL */}
      {isDuplicateModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in font-sans">
          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className={`p-5 sm:p-6 flex items-start gap-4 border-b ${
              activeDuplicateSubmissionIds.size > 0 
                ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-orange-400 text-stone-950 border-amber-300'
                : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 text-white border-emerald-400'
            }`}>
              <div className={`p-3 rounded-2xl shrink-0 shadow-3xs mt-0.5 border ${
                activeDuplicateSubmissionIds.size > 0
                  ? 'bg-white/80 text-amber-950 border-amber-400'
                  : 'bg-white/20 text-white border-emerald-300'
              }`}>
                {activeDuplicateSubmissionIds.size > 0 ? (
                  <AlertTriangle size={24} className="animate-pulse" />
                ) : (
                  <Check size={24} className="font-extrabold" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-block mb-1 border shadow-3xs ${
                    activeDuplicateSubmissionIds.size > 0
                      ? 'text-amber-950 bg-white/80 border-amber-300'
                      : 'text-emerald-950 bg-emerald-100 border-emerald-300'
                  }`}>
                    {activeDuplicateSubmissionIds.size > 0 ? 'Pusat Analisis & Audit Dobel Input' : 'Status: 0 Potensi Dobel (Aman)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsDuplicateModalOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-black/10 transition cursor-pointer"
                    title="Tutup dialog"
                  >
                    <X size={20} />
                  </button>
                </div>
                <h3 className="text-base sm:text-xl font-black tracking-tight">
                  Daftar &amp; Rekap Potensi Transaksi Dobel
                </h3>
                <p className="text-xs mt-1 leading-relaxed opacity-95">
                  {activeDuplicateSubmissionIds.size > 0 ? (
                    <>
                      Menampilkan <strong>{activeDuplicateSubmissionIds.size} voucher</strong> yang terindikasi serupa. Anda dapat memilih tombol <strong>✓ Transaksi Ini Seluruhnya Tidak Dobel (Set 0)</strong> agar aplikasi tidak mendeteksinya lagi sampai ada transaksi baru yang serupa.
                    </>
                  ) : (
                    <>
                      ✓ Seluruh <strong>{duplicateSubmissionIds.size} riwayat voucher</strong> telah diverifikasi SAH &amp; Bukan Dobel. Aplikasi tidak akan mendeteksinya lagi. Transaksi baru yang serupa barulah akan dideteksi kembali.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Modal Toolbar / Filter bar */}
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Cari nama penerima atau nominal di daftar dobel..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none text-stone-800 font-medium"
                  value={duplicateModalSearch}
                  onChange={(e) => setDuplicateModalSearch(e.target.value)}
                />
                {duplicateModalSearch && (
                  <button
                    type="button"
                    onClick={() => setDuplicateModalSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Tombol Utama: Transaksi Ini Seluruhnya Tidak Dobel (Set 0 & Abaikan Riwayat Ini) */}
                {activeDuplicateSubmissionIds.size > 0 ? (
                  <button
                    type="button"
                    id="btn-acknowledge-all-history"
                    onClick={handleAcknowledgeAllHistory}
                    className="px-3.5 py-2 text-xs font-black font-mono rounded-xl transition cursor-pointer border flex items-center gap-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 active:scale-95"
                    title="Pilih bahwa transaksi ini seluruhnya tidak dobel dan aplikasi tidak akan mendeteksinya lagi sampai ada transaksi baru serupa"
                  >
                    <Check size={14} className="text-white font-bold" />
                    <span>✓ Transaksi Ini Seluruhnya Tidak Dobel (Set 0)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleResetAcknowledgeDuplicates}
                    className="px-3 py-2 text-xs font-bold font-mono rounded-xl transition cursor-pointer border flex items-center gap-1.5 bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-rose-700 border-stone-300"
                    title="Atur ulang verifikasi tanda jika ingin mendeteksi ulang seluruh riwayat"
                  >
                    <span>Reset Tanda (Deteksi Ulang)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowOnlyDuplicates(prev => !prev)}
                  className={`px-3 py-2 text-xs font-bold font-mono rounded-xl transition cursor-pointer border flex items-center gap-1.5 ${
                    showOnlyDuplicates
                      ? 'bg-amber-100 text-amber-950 border-amber-400 font-extrabold shadow-3xs'
                      : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
                  }`}
                >
                  <Filter size={13} />
                  <span>{showOnlyDuplicates ? '✓ Filter Aktif' : 'Saring Tabel'}</span>
                </button>
              </div>
            </div>

            {/* Modal Body / Cluster List */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 max-h-[60vh]">
              {(() => {
                const searchLower = duplicateModalSearch.trim().toLowerCase();

                // If active duplicates is 0 and user is not searching or explicitly viewing archived, show clean verified card
                if (activeDuplicateSubmissionIds.size === 0 && !showArchivedDuplicates && !searchLower) {
                  return (
                    <div className="text-center py-10 px-5 bg-gradient-to-b from-emerald-50/80 to-white rounded-3xl border-2 border-emerald-300 shadow-sm space-y-3.5">
                      <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto border border-emerald-300 shadow-3xs">
                        <Check size={30} className="font-black" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base sm:text-lg font-black text-emerald-950">
                          Seluruh Transaksi Telah Ditandai SAH &amp; Bukan Dobel
                        </h4>
                        <p className="text-xs text-emerald-900 max-w-xl mx-auto leading-relaxed">
                          Sesuai pilihan Anda, seluruh <strong>{duplicateSubmissionIds.size} voucher</strong> riwayat ini telah dinyatakan sah. Aplikasi <strong>tidak mendeteksi potensi dobel</strong> lagi (Status: 0 Dobel).
                        </p>
                        <p className="text-[11px] text-stone-600 max-w-md mx-auto pt-1">
                          Jika di kemudian hari ada <strong>transaksi baru</strong> yang diinput dengan nama dan nominal serupa, barulah sistem akan memunculkan peringatan potensi dobel kembali.
                        </p>
                      </div>
                      <div className="pt-2 flex items-center justify-center gap-2.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setShowArchivedDuplicates(true)}
                          className="px-4 py-2 bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 font-bold rounded-xl text-xs transition cursor-pointer shadow-3xs flex items-center gap-1.5"
                        >
                          <Eye size={13} className="text-emerald-600" />
                          <span>Lihat Arsip {duplicateClusters.length} Grup ({duplicateSubmissionIds.size} Voucher) yang Ditandai Sah</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleResetAcknowledgeDuplicates}
                          className="px-3.5 py-2 bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-700 border border-stone-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                        >
                          <span>Reset Tanda (Deteksi Ulang)</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                // If showArchivedDuplicates is false and there are active clusters, only show clusters that have active unacknowledged duplicates!
                const sourceClusters = (!showArchivedDuplicates && activeDuplicateSubmissionIds.size > 0)
                  ? duplicateClusters.filter(c => c.submissions.some(s => activeDuplicateSubmissionIds.has(s.id)))
                  : duplicateClusters;

                const filteredClusters = sourceClusters.filter(cluster => {
                  if (!searchLower) return true;
                  const matchRecipient = cluster.recipientName.toLowerCase().includes(searchLower);
                  const matchNominal = String(cluster.nominal).includes(searchLower) || formatRupiah(cluster.nominal).toLowerCase().includes(searchLower);
                  const matchKode = cluster.submissions.some(s => (s.kode || '').toLowerCase().includes(searchLower));
                  return matchRecipient || matchNominal || matchKode;
                });

                if (filteredClusters.length === 0) {
                  return (
                    <div className="text-center py-12 px-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                      <AlertCircle size={32} className="mx-auto text-stone-400 mb-2" />
                      <p className="text-sm font-bold text-stone-700">Tidak ada kelompok transaksi dobel yang sesuai</p>
                      <p className="text-xs text-stone-500">
                        {searchLower ? 'Coba gunakan kata kunci nama penerima atau nominal lain.' : 'Seluruh potensi transaksi dobel telah bersih (0 dobel).'}
                      </p>
                    </div>
                  );
                }

                return (
                  <>
                    {showArchivedDuplicates && (
                      <div className="p-3 bg-stone-100 rounded-xl flex items-center justify-between text-xs text-stone-700 font-medium">
                        <span>Menampilkan riwayat seluruh kelompok yang telah diverifikasi sah.</span>
                        <button
                          type="button"
                          onClick={() => setShowArchivedDuplicates(false)}
                          className="text-stone-900 font-bold underline cursor-pointer"
                        >
                          Tutup Tampilan Arsip
                        </button>
                      </div>
                    )}
                    {filteredClusters.map((cluster, cIdx) => {
                      const isSelected = selectedClusterKey === cluster.key;
                      const activeInCluster = cluster.submissions.filter(s => activeDuplicateSubmissionIds.has(s.id));
                      const isClusterAllAcknowledged = activeInCluster.length === 0;

                      return (
                        <div 
                          key={cIdx}
                          className={`rounded-2xl border transition-all ${
                            isSelected 
                              ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-300 shadow-sm' 
                              : isClusterAllAcknowledged
                                ? 'border-emerald-200 bg-emerald-50/20 shadow-3xs'
                                : 'border-stone-200 bg-white hover:border-amber-300 shadow-3xs'
                          }`}
                        >
                          {/* Cluster Header */}
                          <div className={`p-4 border-b rounded-t-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                            isClusterAllAcknowledged ? 'bg-emerald-50/60 border-emerald-200' : 'bg-stone-50/80 border-stone-200'
                          }`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-stone-500 bg-stone-200 px-2 py-0.5 rounded">
                                Kelompok #{cIdx + 1}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-stone-700 bg-white px-2 py-0.5 rounded border border-stone-300">
                                📅 {cluster.yearMonth}
                              </span>
                              <span className="text-[11px] font-mono font-black text-stone-900 bg-stone-100 px-2 py-0.5 rounded border border-stone-300">
                                #️⃣ {cluster.kode}
                              </span>
                              <span className="text-sm font-black text-stone-900">
                                👤 {cluster.recipientName}
                              </span>
                              <span className="text-[11px] font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                🏷️ {cluster.jenisPengajuan}
                              </span>
                              <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 font-mono">
                                💰 Rp {formatRupiah(cluster.nominal)}
                              </span>
                              {isClusterAllAcknowledged ? (
                                <span className="text-[10px] font-bold font-mono text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                                  ✓ Ditandai Sah
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold font-mono text-amber-900 bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-full">
                                  ⚠️ {activeInCluster.length} Belum Ditandai
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {!isClusterAllAcknowledged && (
                                <button
                                  type="button"
                                  onClick={() => handleAcknowledgeCluster(cluster.submissions)}
                                  className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-3xs cursor-pointer flex items-center gap-1"
                                  title="Tandai seluruh voucher dalam grup ini sah / bukan dobel"
                                >
                                  <Check size={11} />
                                  <span>Tandai Grup Ini Sah</span>
                                </button>
                              )}
                              <span className="text-[11px] font-mono font-bold text-stone-600 bg-white px-2.5 py-1 rounded-lg border border-stone-250 shrink-0 self-start sm:self-auto">
                                {cluster.submissions.length} Transaksi Serupa
                              </span>
                            </div>
                          </div>

                          {/* Cluster Items List */}
                          <div className="p-3 sm:p-4 divide-y divide-stone-100">
                            {cluster.submissions.map((sub, sIdx) => {
                              const itemsCount = sub.items?.length || 0;
                              const isSubAcknowledged = isSubVerifiedLegit(sub);

                              return (
                                <div key={sIdx} className="py-2.5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <span className="font-mono font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded border border-stone-250">
                                        {sub.kode || 'Tanpa Kode'}
                                      </span>
                                      <span className="text-stone-600 font-medium">
                                        📅 {formatDateIndonesian(sub.tanggal)}
                                      </span>
                                      <span className="text-stone-500 font-mono text-[11px]">
                                        ({sub.jenisPengajuan})
                                      </span>
                                      <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                                        sub.status === 'Lunas' 
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                          : 'bg-rose-50 text-rose-700 border-rose-200'
                                      }`}>
                                        {sub.status || 'Belum Lunas'}
                                      </span>
                                      {isSubAcknowledged && (
                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                          ✓ Sah
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-stone-600 line-clamp-1">
                                      {sub.notes ? (
                                        <span>Catatan: <em>{sub.notes}</em></span>
                                      ) : itemsCount > 0 ? (
                                        <span>Rincian: {sub.items?.map(it => it.item).join(', ')}</span>
                                      ) : (
                                        <span className="italic text-stone-400">Tidak ada catatan tambahan</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Row Action Buttons */}
                                  <div className="flex items-center gap-1.5 flex-wrap shrink-0 self-stretch sm:self-auto justify-end sm:justify-start pt-1 sm:pt-0">
                                    {/* Tombol Beri Tanda Aman untuk Voucher Ini */}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleAcknowledgeDuplicate(sub.id)}
                                      className={`px-2.5 py-1.5 font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1 shadow-3xs border ${
                                        isSubAcknowledged
                                          ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300 font-extrabold'
                                          : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
                                      }`}
                                      title="Beri tanda voucher ini sah / bukan dobel (Set status potensi dobel menjadi 0)"
                                    >
                                      <Check size={12} className={isSubAcknowledged ? 'text-emerald-700' : 'text-stone-400'} />
                                      <span>{isSubAcknowledged ? '✓ Ditandai Sah' : 'Tandai Sah'}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsDuplicateModalOpen(false);
                                        onSelect(sub);
                                      }}
                                      className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-750 font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1 shadow-3xs"
                                      title="Lihat rincian & cetak voucher ini"
                                    >
                                      <Eye size={12} />
                                      <span>Lihat</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsDuplicateModalOpen(false);
                                        onEdit(sub);
                                      }}
                                      className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1 shadow-3xs"
                                      title="Edit data voucher ini"
                                    >
                                      <Edit2 size={12} />
                                      <span>Edit</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteIncludeDrive(true);
                                        setDeleteConfirmSub(sub);
                                      }}
                                      className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1 shadow-3xs"
                                      title="Hapus jika voucher ini tidak sengaja terinput dua kali"
                                    >
                                      <Trash2 size={12} />
                                      <span>Hapus</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-stone-500 font-medium">
                💡 {activeDuplicateSubmissionIds.size > 0 
                  ? `Menampilkan ${activeDuplicateSubmissionIds.size} voucher terdeteksi serupa.` 
                  : `Seluruh ${duplicateSubmissionIds.size} voucher riwayat telah ditandai sah (0 dobel).`}
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {activeDuplicateSubmissionIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleAcknowledgeAllHistory}
                    className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>✓ Transaksi Ini Seluruhnya Tidak Dobel (Set 0)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsDuplicateModalOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl transition cursor-pointer shadow-xs shrink-0"
                >
                  Tutup Rekap
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Universal Floating Action Dropdown Popover via Portal (Never Clipped by Containers/Tables) */}
      {openActionMenuId && activeActionSub && createPortal(
        <div
          id="portal-action-menu-dropdown"
          style={{
            position: 'fixed',
            top: actionMenuPosition?.top !== undefined ? `${actionMenuPosition.top}px` : (actionMenuPosition?.bottom === undefined ? '100px' : 'auto'),
            bottom: actionMenuPosition?.bottom !== undefined ? `${actionMenuPosition.bottom}px` : 'auto',
            left: actionMenuPosition?.left !== undefined ? `${actionMenuPosition.left}px` : 'auto',
            right: actionMenuPosition?.left === undefined ? '16px' : 'auto',
            width: '224px',
            maxHeight: actionMenuPosition?.maxHeight !== undefined ? `${actionMenuPosition.maxHeight}px` : '420px',
            zIndex: 9999999,
          }}
          className="action-menu-dropdown-root action-menu-dropdown-popover w-56 bg-white rounded-2xl shadow-2xl border border-stone-200 py-1.5 overflow-y-auto divide-y divide-stone-100 text-left select-none ring-1 ring-black/5 animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3.5 py-2 bg-stone-50/90 border-b border-stone-150">
            <div className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider truncate">
              {activeActionSub.kode || 'Transaksi'}
            </div>
            <div className="text-xs font-extrabold text-stone-800 truncate" title={activeActionSub.dibayarkanKepada}>
              {activeActionSub.dibayarkanKepada}
            </div>
          </div>

          <div className="py-1">
            {/* Pilih Transaksi (Munculkan kolom check & tandai transaksi ini) */}
            {(() => {
              const isAlreadyChecked = selectedCheckedSet.has(activeActionSub.id);
              return (
                <button
                  type="button"
                  onClick={() => {
                    const targetId = activeActionSub.id;
                    setOpenActionMenuId(null);
                    setActionMenuPosition(null);
                    handleToggleSelectCheck(targetId);
                  }}
                  className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer ${
                    isAlreadyChecked
                      ? 'bg-sky-100 text-sky-950 hover:bg-sky-200 border-b border-sky-200'
                      : 'text-emerald-800 hover:bg-emerald-50 border-b border-stone-100'
                  }`}
                  title={isAlreadyChecked ? 'Hapus centang transaksi ini (kolom check otomatis hilang jika tidak ada yang dipilih)' : 'Munculkan kotak check dan pilih transaksi ini'}
                >
                  <Check size={15} className={isAlreadyChecked ? 'text-sky-700 shrink-0' : 'text-emerald-600 shrink-0'} />
                  <span>{isAlreadyChecked ? 'Batalkan Pilih Transaksi' : 'Pilih Transaksi'}</span>
                </button>
              );
            })()}

            {/* 0a. Soroti / Prioritaskan untuk Dibayar Selanjutnya */}
            {(() => {
              const isPrio = isSubPriorityPayNext(activeActionSub);
              return (
                <button
                  type="button"
                  onClick={() => {
                    const target = activeActionSub;
                    setOpenActionMenuId(null);
                    setActionMenuPosition(null);
                    handleSetPaymentPriority([target], !isPrio);
                  }}
                  className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer ${
                    isPrio
                      ? 'bg-amber-100 text-amber-950 hover:bg-amber-200 border-b border-amber-200'
                      : 'text-amber-800 hover:bg-amber-50'
                  }`}
                  title={isPrio ? 'Hapus sorotan prioritas pembayaran pada transaksi ini' : 'Soroti transaksi ini untuk diprioritaskan dibayar selanjutnya'}
                >
                  <Star size={15} className={isPrio ? 'text-amber-600 fill-amber-500 shrink-0' : 'text-amber-500 shrink-0'} />
                  <span>{isPrio ? 'Hapus Prioritas Bayar' : 'Prioritaskan Bayar Selanjutnya'}</span>
                </button>
              );
            })()}

            {/* 0. Upload ke Firebase Firestore */}
            {onUploadSingleToFirestore && (() => {
              const idLow = String(activeActionSub.id || '').toLowerCase().trim();
              const isUnsynced = Boolean(unsyncedSubmissionIds?.has(idLow));
              const isUploading = Boolean(uploadingSubmissionIds?.has(idLow));
              return (
                <button
                  id={`btn-upload-firestore-${activeActionSub.id}`}
                  disabled={isUploading || isCloudSyncing}
                  onClick={() => {
                    const target = activeActionSub;
                    setOpenActionMenuId(null);
                    setActionMenuPosition(null);
                    onUploadSingleToFirestore(target);
                  }}
                  className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer disabled:opacity-60 ${
                    isUnsynced
                      ? 'bg-orange-50/90 text-orange-900 hover:bg-orange-100 border-b border-orange-150'
                      : 'text-sky-700 hover:bg-sky-50'
                  }`}
                  title={isUnsynced ? 'Upload transaksi ini agar tersimpan permanen di Firebase Firestore' : 'Sinkronkan ulang transaksi ini ke Firebase Firestore'}
                >
                  <CloudUpload size={15} className={isUnsynced ? 'text-orange-600 shrink-0' : 'text-sky-600 shrink-0'} />
                  <span>
                    {isUploading
                      ? 'Mengupload ke Firestore...'
                      : isUnsynced
                      ? 'Upload ke Firestore'
                      : 'Sync Ulang ke Firestore'}
                  </span>
                </button>
              );
            })()}

            {/* 1. Bagikan Link */}
            <button
              id={`btn-share-${activeActionSub.id}`}
              onClick={() => {
                setOpenActionMenuId(null);
                setActionMenuPosition(null);
                setShareModalSub(activeActionSub);
                setIsCopiedShare(false);
              }}
              className="w-full px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2.5 transition text-left cursor-pointer"
              title="Bagikan Tautan Transaksi & Gambar Voucher (WhatsApp / Publik)"
            >
              <Share2 size={15} className="text-emerald-600 shrink-0" />
              <span>Bagikan Link</span>
            </button>

            {/* 2. Lihat */}
            <button
              id={`btn-view-${activeActionSub.id}`}
              onClick={() => {
                setOpenActionMenuId(null);
                setActionMenuPosition(null);
                triggerGoogleDriveAutoRefresh('action-lihat-voucher', false, false).catch(() => {});
                onSelect(activeActionSub);
              }}
              className="w-full px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50 flex items-center gap-2.5 transition text-left cursor-pointer"
              title="Tampilkan / Cetak PDF"
            >
              <Eye size={15} className="text-[#D4AF37] shrink-0" />
              <span>Lihat Voucher</span>
            </button>

            {/* 3. Salin */}
            <button
              id={`btn-dup-${activeActionSub.id}`}
              onClick={() => {
                setOpenActionMenuId(null);
                setActionMenuPosition(null);
                onDuplicate(activeActionSub);
              }}
              className="w-full px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center gap-2.5 transition text-left cursor-pointer"
              title="Duplikat Data"
            >
              <Copy size={15} className="text-stone-500 shrink-0" />
              <span>Salin Data</span>
            </button>

            {/* 4. Edit */}
            <button
              id={`btn-edit-${activeActionSub.id}`}
              onClick={() => {
                setOpenActionMenuId(null);
                setActionMenuPosition(null);
                onEdit(activeActionSub);
              }}
              className="w-full px-3.5 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 flex items-center gap-2.5 transition text-left cursor-pointer"
              title="Edit Data Transaksi"
            >
              <Edit2 size={15} className="text-sky-600 shrink-0" />
              <span>Edit Transaksi</span>
            </button>

            {/* 5. Input Bukti Bayar / Cicilan */}
            {onOpenBuktiTransfer && (
              <button
                onClick={() => {
                  const target = activeActionSub;
                  setOpenActionMenuId(null);
                  setActionMenuPosition(null);
                  onOpenBuktiTransfer(target);
                }}
                className="w-full px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                title="Input / Unggah Bukti Bayar & Cicilan"
              >
                <Receipt size={15} className="text-teal-600 shrink-0" />
                <span>Input Bukti Bayar</span>
              </button>
            )}

            {/* SPPD option if applicable */}
            {((activeActionSub.jenisPengajuan || '').toLowerCase().includes('perjalanan dinas') || (activeActionSub.jenisPengajuan || '').toLowerCase().includes('sppd')) && onOpenSppdEditor && (
              <button
                onClick={() => {
                  setOpenActionMenuId(null);
                  setActionMenuPosition(null);
                  onOpenSppdEditor(activeActionSub);
                }}
                className="w-full px-3.5 py-2 text-xs font-semibold text-amber-850 hover:bg-amber-50 flex items-center gap-2.5 transition text-left cursor-pointer"
              >
                <FileText size={15} className="text-amber-700 shrink-0" />
                <span>Form SPPD</span>
              </button>
            )}

            {/* Buat Internal Memo Resmi */}
            {onCreateMemo && (
              <button
                onClick={() => {
                  setOpenActionMenuId(null);
                  setActionMenuPosition(null);
                  onCreateMemo(activeActionSub);
                }}
                className="w-full px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                title="Buat Internal Memo Direksi untuk pembayaran voucher ini"
              >
                <FileText size={15} className="text-amber-600 shrink-0" />
                <span>Buat Internal Memo</span>
              </button>
            )}

            {/* Mark as paid if applicable */}
            {onMarkAsPaid && isEligibleForManualPaymentMark(activeActionSub) && (
              <button
                id={`btn-markpaid-${activeActionSub.id}`}
                onClick={() => {
                  setOpenActionMenuId(null);
                  setActionMenuPosition(null);
                  if (window.confirm(`Yakin ingin menandai voucher ${activeActionSub.kode} untuk "${activeActionSub.dibayarkanKepada}" sebagai SUDAH DIBAYAR (Lunas) tanpa bukti bayar fisik?`)) {
                    onMarkAsPaid(activeActionSub.id);
                  }
                }}
                className="w-full px-3.5 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 flex items-center gap-2.5 transition text-left cursor-pointer"
              >
                <CheckCircle size={15} className="text-teal-600 shrink-0" />
                <span>Tandai Sudah Dibayar</span>
              </button>
            )}
          </div>

          {/* Hapus */}
          <div className="py-1">
            <button
              id={`btn-delete-${activeActionSub.id}`}
              onClick={() => {
                const subToDelete = activeActionSub;
                setOpenActionMenuId(null);
                setActionMenuPosition(null);
                setDeleteIncludeDrive(true);
                setDeleteConfirmSub(subToDelete);
              }}
              className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition text-left cursor-pointer"
              title="Hapus Data Transaksi"
            >
              <Trash2 size={15} className="text-rose-500 shrink-0" />
              <span>Hapus Data</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* IN-APP DELETE CONFIRMATION MODAL (replaces window.confirm & adds Google Drive folder deletion toggle) */}
      {deleteConfirmSub && createPortal(
        <div
          className="fixed inset-0 z-[10050] bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDeleteConfirmSub(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-stone-200 shadow-2xl overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-50 border-b border-rose-200 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-stone-900 font-display">
                    Konfirmasi Hapus Transaksi Voucher
                  </h3>
                  <p className="text-[11px] font-mono text-rose-700 font-semibold">
                    {deleteConfirmSub.kode || deleteConfirmSub.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmSub(null)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-rose-100 hover:text-stone-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-stone-700">
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">Penerima Kas:</span>
                  <strong className="text-stone-900 text-right">{deleteConfirmSub.dibayarkanKepada || '-'}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">Jenis Pengajuan:</span>
                  <strong className="text-stone-800 text-right">{deleteConfirmSub.jenisPengajuan || '-'}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">Tanggal:</span>
                  <strong className="font-mono text-stone-800">{deleteConfirmSub.tanggal || '-'}</strong>
                </div>
                <div className="flex justify-between gap-2 pt-1 border-t border-stone-200">
                  <span className="text-stone-500">Total Nominal:</span>
                  <strong className="font-mono text-rose-700 text-sm">
                    Rp {formatRupiah((deleteConfirmSub.items || []).reduce((sum, i) => sum + (i.total || 0), 0))}
                  </strong>
                </div>
              </div>

              {(() => {
                const delIdLow = String(deleteConfirmSub.id || '').toLowerCase().trim();
                const isDelUnsynced = Boolean(unsyncedSubmissionIds?.has(delIdLow));
                const isDelInFirestore = !isDelUnsynced && Boolean(hasCloudInventory && cloudSyncedIds?.has(delIdLow));

                if (isDelInFirestore) {
                  return (
                    <div className="p-3 bg-emerald-50 border border-emerald-250 rounded-xl flex items-start gap-2.5">
                      <Database size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="font-black text-emerald-950 block">
                          Status Firestore: Sudah Masuk di Cloud Firestore ✓
                        </span>
                        <span className="text-[11px] text-emerald-800 leading-relaxed block">
                          Data voucher ini sudah tersimpan di database Cloud Firestore (ID: <span className="font-mono">{deleteConfirmSub.id}</span>). Jika dihapus, data di Cloud Firestore juga akan ikut terhapus permanen.
                        </span>
                      </div>
                    </div>
                  );
                }

                if (isDelUnsynced) {
                  return (
                    <div className="p-3 bg-orange-50 border border-orange-250 rounded-xl flex items-start gap-2.5">
                      <AlertCircle size={16} className="text-orange-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="font-black text-orange-950 block">
                          Status Firestore: Belum Masuk di Cloud Firestore
                        </span>
                        <span className="text-[11px] text-orange-800 leading-relaxed block">
                          Transaksi ini saat ini hanya ada di penyimpanan lokal/cadangan server dan belum tersimpan di Cloud Firestore.
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-3 bg-amber-50 border border-amber-250 rounded-xl flex items-start gap-2.5">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-black text-amber-950 block">
                        Status Firestore: Belum Terverifikasi
                      </span>
                      <span className="text-[11px] text-amber-800 leading-relaxed block">
                        Daftar dokumen Firestore belum terbaca (karena pembatasan Rules/koneksi). Jika ragu agar tidak salah hapus, klik <strong>Batal</strong> lalu tekan <strong>Sinkron Cloud</strong> terlebih dahulu.
                      </span>
                    </div>
                  </div>
                );
              })()}

              <label className="flex items-start gap-2.5 p-3 bg-sky-50 border border-sky-200 rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteIncludeDrive}
                  onChange={(e) => setDeleteIncludeDrive(e.target.checked)}
                  className="mt-0.5 rounded border-sky-400 text-sky-600 focus:ring-sky-500 cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="font-bold text-sky-950 block">
                    Hapus otomatis folder &amp; seluruh file lampiran di Google Drive
                  </span>
                  <span className="text-[11px] text-sky-800 leading-relaxed block">
                    Sistem akan mencari folder berdasarkan ID, lampiran, dan kode voucher ({deleteConfirmSub.kode || 'transaksi ini'}) lalu menghapusnya dari Google Drive.
                  </span>
                </div>
              </label>

              <p className="text-[11px] text-stone-500 leading-relaxed">
                Transaksi akan dihapus dari daftar aplikasi, backup server, dan Cloud Firestore.
              </p>
            </div>

            <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteConfirmSub(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = deleteConfirmSub.id;
                  const includeDrive = deleteIncludeDrive;
                  setDeleteConfirmSub(null);
                  setSelectedRowId((prev) => (prev === targetId ? null : prev));
                  setSelectedCheckedIds((prev) => prev.filter((id) => id !== targetId));
                  onDelete(targetId, { deleteDriveFolder: includeDrive });
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Ya, Hapus Transaksi</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* IN-APP BULK DELETE CONFIRMATION MODAL FOR CHECKED ROWS */}
      {bulkDeleteConfirmOpen && selectedCheckedIds.length > 0 && createPortal(
        (() => {
          const selectedSubs = submissions.filter((s) => selectedCheckedSet.has(s.id));
          const totalSelectedNominal = selectedSubs.reduce(
            (sum, s) => sum + ((s.items || []).reduce((itSum, it) => itSum + (Number(it.total) || 0), 0)),
            0
          );
          return (
            <div
              className="fixed inset-0 z-[10055] bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => setBulkDeleteConfirmOpen(false)}
            >
              <div
                className="w-full max-w-lg bg-white rounded-2xl border border-stone-200 shadow-2xl overflow-hidden animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-rose-50 border-b border-rose-200 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                      <Trash2 size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-stone-900 font-display">
                        Konfirmasi Hapus {selectedSubs.length} Transaksi Terpilih
                      </h3>
                      <p className="text-[11px] font-mono text-rose-700 font-semibold">
                        Total Nilai: Rp {formatRupiah(totalSelectedNominal)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBulkDeleteConfirmOpen(false)}
                    className="p-1.5 rounded-lg text-stone-500 hover:bg-rose-100 hover:text-stone-800 transition cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-5 space-y-4 text-xs text-stone-700">
                  <div className="max-h-48 overflow-y-auto bg-stone-50 border border-stone-200 rounded-xl divide-y divide-stone-200">
                    {selectedSubs.map((s) => {
                      const sTotal = (s.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0);
                      return (
                        <div key={s.id} className="px-3.5 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 truncate">{s.dibayarkanKepada || '-'}</div>
                            <div className="text-[10px] font-mono text-stone-500 truncate">
                              {s.tanggal || '-'} · {s.kode || '-'} · {s.jenisPengajuan || '-'}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-rose-700 shrink-0">
                            Rp {formatRupiah(sTotal)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <label className="flex items-start gap-2.5 p-3 bg-sky-50 border border-sky-200 rounded-xl cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={bulkDeleteIncludeDrive}
                      onChange={(e) => setBulkDeleteIncludeDrive(e.target.checked)}
                      className="mt-0.5 rounded border-sky-400 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="font-bold text-sky-950 block">
                        Hapus otomatis folder &amp; file lampiran Google Drive dari transaksi yang dipilih
                      </span>
                      <span className="text-[11px] text-sky-800 leading-relaxed block">
                        Seluruh {selectedSubs.length} transaksi terpilih akan dihapus permanen dari aplikasi, server cadangan, dan Cloud Firestore.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBulkDeleteConfirmOpen(false)}
                    className="px-4 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const idsToDelete = [...selectedCheckedIds];
                      const includeDrive = bulkDeleteIncludeDrive;
                      setBulkDeleteConfirmOpen(false);
                      setSelectedCheckedIds([]);
                      if (selectedRowId && idsToDelete.includes(selectedRowId)) {
                        setSelectedRowId(null);
                      }
                      if (onBulkDelete) {
                        onBulkDelete(idsToDelete, { deleteDriveFolder: includeDrive });
                      } else {
                        idsToDelete.forEach((id) => onDelete(id, { deleteDriveFolder: includeDrive }));
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Ya, Hapus {selectedSubs.length} Transaksi</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* CHECK SELECTION OPTIONS PORTAL DROPDOWN (Never clipped by table overflow) */}
      {isCheckMenuOpen && checkMenuPosition && createPortal(
        <div
          id="portal-check-options-menu"
          style={{
            position: 'fixed',
            top: `${checkMenuPosition.top}px`,
            left: `${checkMenuPosition.left}px`,
            width: '272px',
            zIndex: 9999999,
          }}
          className="check-menu-dropdown-root bg-white rounded-2xl shadow-2xl border border-stone-200 py-1.5 divide-y divide-stone-100 text-left select-none ring-1 ring-black/5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3.5 py-2 bg-stone-50">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">
              Pilihan Centang (Check)
            </div>
            <div className="text-[11px] text-stone-600 mt-0.5">
              Pilih kelompok transaksi untuk tindakan cepat
            </div>
          </div>
          <div className="py-1 text-xs">
            <button
              type="button"
              onClick={() => handleApplyCheckSelection(submissions.map((s) => s.id), 'replace')}
              disabled={submissions.length === 0}
              className="w-full px-3.5 py-2 hover:bg-emerald-50 font-bold text-emerald-900 flex items-center justify-between cursor-pointer disabled:opacity-40"
            >
              <span>Check All (Semua Transaksi)</span>
              <span className="font-mono text-[11px] text-emerald-700 tabular-nums">{submissions.length}</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyCheckSelection(filteredSubmissions.map((s) => s.id), 'replace')}
              disabled={filteredSubmissions.length === 0}
              className="w-full px-3.5 py-2 hover:bg-stone-50 font-semibold text-stone-800 flex items-center justify-between cursor-pointer disabled:opacity-40"
            >
              <span>Pilih Semua yang Tampil</span>
              <span className="font-mono text-[11px] text-stone-500 tabular-nums">{filteredSubmissions.length}</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyCheckSelection(checkedSelectionGroups.visibleUnpaidIds, 'replace')}
              disabled={checkedSelectionGroups.visibleUnpaidIds.length === 0}
              className="w-full px-3.5 py-2 hover:bg-rose-50 font-semibold text-rose-800 flex items-center justify-between cursor-pointer disabled:opacity-40"
            >
              <span>Pilih Belum Lunas / DP</span>
              <span className="font-mono text-[11px] text-rose-600 tabular-nums">{checkedSelectionGroups.visibleUnpaidIds.length}</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyCheckSelection(checkedSelectionGroups.visiblePriorityIds, 'replace')}
              disabled={checkedSelectionGroups.visiblePriorityIds.length === 0}
              className="w-full px-3.5 py-2 hover:bg-amber-50 font-semibold text-amber-900 flex items-center justify-between cursor-pointer disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1.5">
                <Star size={12} className="text-amber-500 fill-amber-400" />
                <span>Pilih Prioritas Bayar</span>
              </span>
              <span className="font-mono text-[11px] text-amber-700 tabular-nums">{checkedSelectionGroups.visiblePriorityIds.length}</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyCheckSelection(checkedSelectionGroups.visibleUnsyncedIds, 'replace')}
              disabled={checkedSelectionGroups.visibleUnsyncedIds.length === 0}
              className="w-full px-3.5 py-2 hover:bg-orange-50 font-semibold text-orange-900 flex items-center justify-between cursor-pointer disabled:opacity-40"
            >
              <span>Pilih Belum di Firestore</span>
              <span className="font-mono text-[11px] text-orange-700 tabular-nums">{checkedSelectionGroups.visibleUnsyncedIds.length}</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyCheckSelection(checkedSelectionGroups.visibleLunasIds, 'replace')}
              disabled={checkedSelectionGroups.visibleLunasIds.length === 0}
              className="w-full px-3.5 py-2 hover:bg-teal-50 font-semibold text-teal-800 flex items-center justify-between cursor-pointer disabled:opacity-40"
            >
              <span>Pilih Sudah Lunas</span>
              <span className="font-mono text-[11px] text-teal-600 tabular-nums">{checkedSelectionGroups.visibleLunasIds.length}</span>
            </button>
            {checkedSelectionGroups.visibleDuplicateIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleApplyCheckSelection(checkedSelectionGroups.visibleDuplicateIds, 'replace')}
                className="w-full px-3.5 py-2 hover:bg-amber-50 font-semibold text-amber-900 flex items-center justify-between cursor-pointer"
              >
                <span>Pilih Potensi Duplikat</span>
                <span className="font-mono text-[11px] text-amber-700 tabular-nums">{checkedSelectionGroups.visibleDuplicateIds.length}</span>
              </button>
            )}
          </div>
          <div className="py-1 text-xs">
            <button
              type="button"
              onClick={() => handleApplyCheckSelection([], 'invert')}
              className="w-full px-3.5 py-2 hover:bg-stone-50 font-semibold text-stone-700 text-left cursor-pointer"
            >
              Balikkan Pilihan Saat Ini
            </button>
            <button
              type="button"
              onClick={() => handleApplyCheckSelection([], 'clear')}
              disabled={selectedCheckedIds.length === 0}
              className="w-full px-3.5 py-2 hover:bg-rose-50 font-semibold text-rose-700 text-left cursor-pointer disabled:opacity-40"
            >
              Batalkan Semua Pilihan
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* IN-APP BULK MARK AS PAID CONFIRMATION MODAL */}
      {bulkMarkPaidConfirmOpen && checkedSelectionGroups.selectedUnpaidSubs.length > 0 && createPortal(
        (() => {
          const targets = checkedSelectionGroups.selectedUnpaidSubs;
          const totalUnpaidNominal = targets.reduce(
            (sum, s) => sum + ((s.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0)),
            0
          );
          return (
            <div
              className="fixed inset-0 z-[10060] bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => setBulkMarkPaidConfirmOpen(false)}
            >
              <div
                className="w-full max-w-md bg-white rounded-2xl border border-stone-200 shadow-2xl overflow-hidden animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                      <CheckCircle size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-stone-900 font-display">
                        Tandai {targets.length} Transaksi Lunas
                      </h3>
                      <p className="text-[11px] font-mono text-emerald-800 font-semibold tabular-nums">
                        Total Nilai: Rp {formatRupiah(totalUnpaidNominal)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBulkMarkPaidConfirmOpen(false)}
                    className="p-1.5 rounded-lg text-stone-500 hover:bg-emerald-100 hover:text-stone-800 transition cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-5 space-y-3 text-xs text-stone-700">
                  <p>
                    Status transaksi di bawah ini akan diubah menjadi <strong>Lunas</strong> dan sorotan prioritas pembayarannya otomatis diselesaikan:
                  </p>
                  <div className="max-h-44 overflow-y-auto bg-stone-50 border border-stone-200 rounded-xl divide-y divide-stone-200">
                    {targets.map((s) => {
                      const sTotal = (s.items || []).reduce((acc, it) => acc + (Number(it.total) || 0), 0);
                      return (
                        <div key={s.id} className="px-3.5 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 truncate">{s.dibayarkanKepada || '-'}</div>
                            <div className="text-[10px] font-mono text-stone-500 truncate">
                              {s.tanggal || '-'} · {s.kode || '-'}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-emerald-700 shrink-0 tabular-nums">
                            Rp {formatRupiah(sTotal)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setBulkMarkPaidConfirmOpen(false)}
                    className="px-4 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 font-bold text-xs transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkMarkCheckedAsPaid}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <CheckCircle size={14} />
                    <span>Ya, Tandai Lunas ({targets.length})</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* Modal Pratinjau & Pengaturan Cetak List (PDF) */}
      {isListPrintPreviewOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1100] bg-stone-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:hidden">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-4xl h-[calc(100vh-2.5rem)] max-h-[820px] flex flex-col overflow-hidden">
            {/* Header Bar Rapi */}
            <div className="bg-stone-900 text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Printer size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black tracking-tight truncate">Menu Cetak List Transaksi (PDF)</h3>
                  <p className="text-[11px] text-stone-400 font-mono truncate">
                    {filteredSubmissions.length} transaksi · {activeCompanyFullName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-sm transition cursor-pointer"
                >
                  <Printer size={13} />
                  <span>Cetak / Simpan PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsListPrintPreviewOpen(false)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
                  title="Tutup Pratinjau"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Sub-Toolbar Pengaturan PDF & Penanda Tangan di Dalam Menu Cetak List */}
            <div className="bg-stone-100 border-b border-stone-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-stone-600">Penanda Tangan:</span>
                <div className="inline-flex items-center bg-white p-0.5 rounded-xl border border-stone-300 shadow-3xs">
                  <button
                    type="button"
                    onClick={() => handleToggleListSignersVisibility(true)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                      listShowSigners
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Eye size={12} />
                    <span>Tampilkan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleListSignersVisibility(false)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                      !listShowSigners
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <EyeOff size={12} />
                    <span>Hilangkan TTD</span>
                  </button>
                </div>

                {listShowSigners && (
                  <div className="inline-flex items-center bg-white p-0.5 rounded-xl border border-stone-300 shadow-3xs">
                    <button
                      type="button"
                      onClick={() => handleChangeListSignatureStyle('line')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        listSignatureStyle === 'line'
                          ? 'bg-amber-500 text-stone-950 font-black'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Hanya Garis
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeListSignatureStyle('table')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        listSignatureStyle === 'table'
                          ? 'bg-amber-500 text-stone-950 font-black'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Kotak Tabel
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsListSignerModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-black transition cursor-pointer shadow-3xs"
              >
                <SlidersHorizontal size={13} />
                <span>Atur Penanda Tangan</span>
                <span className="px-1.5 py-0.2 rounded-full bg-stone-900/15 text-[10px]">
                  {listShowSigners ? `${activeListSignerCount} Kolom` : 'Tanpa TTD'}
                </span>
              </button>
            </div>

            {/* Live A4 Preview Area */}
            <div className="flex-1 min-h-0 overflow-y-auto bg-stone-200/80 p-3 sm:p-5">
              <div className="bg-white border border-stone-300 shadow-md rounded-lg mx-auto max-w-[780px] p-4 sm:p-6 font-sans text-black space-y-3.5">
                <div className="border-b-2 border-stone-900 pb-2.5 flex justify-between items-end gap-4">
                  <div>
                    <h1 className="text-base font-bold font-display uppercase tracking-wider text-stone-900 leading-tight">
                      {activeCompanyFullName.toUpperCase()}
                    </h1>
                    <p className="text-[9px] text-stone-600 font-mono">DIVISI FINANCE &amp; INTERNAL LEDGER DATABASE</p>
                    <h2 className="text-xs font-bold text-stone-850 mt-0.5">Laporan List Transaksi Pengeluaran Kas / Bank</h2>
                  </div>
                  <div className="text-right font-mono text-[9px] text-stone-600 leading-tight shrink-0">
                    <p>Dicetak pada: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    <p>Filter: {monthFilter === 'All' ? 'Semua Bulan' : MONTHS_LIST.find(m => m.value === monthFilter)?.label} {yearFilter === 'All' ? 'Semua Tahun' : yearFilter}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[9px] my-1 table-fixed">
                    <thead>
                      <tr className="bg-stone-100 border-y-2 border-stone-900 font-bold text-stone-900">
                        <th className="py-1.5 px-1 border border-stone-400 text-center w-[4%]">No</th>
                        <th className="py-1.5 px-1 border border-stone-400 w-[11%]">Tanggal</th>
                        <th className="py-1.5 px-1 border border-stone-400 w-[15%]">No Voucher/Kode</th>
                        <th className="py-1.5 px-1 border border-stone-400 w-[6%] text-center">Lokasi</th>
                        <th className="py-1.5 px-1.5 border border-stone-400 w-[17%]">Jenis Pengajuan</th>
                        <th className="py-1.5 px-1.5 border border-stone-400 w-[18%]">Penerima Kas</th>
                        <th className="py-1.5 px-1 border border-stone-400 w-[7%] text-center">Metode</th>
                        <th className="py-1.5 px-1 border border-stone-400 w-[8.5%] text-center">Status</th>
                        <th className="py-1.5 px-1.5 border border-stone-400 w-[13.5%] text-right">Total Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-300">
                      {filteredSubmissions.length > 0 ? (
                        filteredSubmissions.slice(0, 50).map((sub, idx) => {
                          const subTotal = sub.items.reduce((sum, i) => sum + i.total, 0);
                          const effStatus = getSubStatus(sub);
                          const displayStatus = effStatus === 'DP / Cicilan'
                            ? `DP/Cicilan${sub.dpAmount ? ` (Rp ${formatRupiah(sub.dpAmount)})` : ''}`
                            : effStatus;
                          return (
                            <tr key={sub.id} className="align-top border-b border-stone-300">
                              <td className="py-1 px-1 border border-stone-300 text-center font-mono text-stone-600">{idx + 1}</td>
                              <td className="py-1 px-1 border border-stone-300 font-medium leading-tight break-words">{formatDateIndonesian(sub.tanggal)}</td>
                              <td className="py-1 px-1 border border-stone-300 font-mono font-bold text-stone-900 break-all leading-tight">{sub.kode}</td>
                              <td className="py-1 px-1 border border-stone-300 font-semibold text-center break-words">{sub.lokasi || '-'}</td>
                              <td className="py-1 px-1.5 border border-stone-300 text-stone-900 leading-tight break-words">{sub.jenisPengajuan || '-'}</td>
                              <td className="py-1 px-1.5 border border-stone-300 font-bold text-stone-900 leading-tight break-words">{sub.dibayarkanKepada || '-'}</td>
                              <td className="py-1 px-1 border border-stone-300 text-center font-mono text-stone-600">Transfer</td>
                              <td className="py-1 px-1 border border-stone-300 text-center font-mono font-bold leading-tight break-words">{displayStatus}</td>
                              <td className="py-1 px-1.5 border border-stone-300 text-right font-mono font-black text-stone-900 whitespace-nowrap">Rp {formatRupiah(subTotal)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-stone-400">Tidak ada data transaksi yang cocok dengan kriteria filter.</td>
                        </tr>
                      )}
                      {filteredSubmissions.length > 50 && (
                        <tr>
                          <td colSpan={9} className="py-1.5 px-2 text-center bg-stone-50 text-stone-500 italic">
                            ... dan {filteredSubmissions.length - 50} baris transaksi lainnya akan ikut tercetak penuh saat menekan "Cetak / Simpan PDF".
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-stone-100 font-bold text-stone-955 border-t-2 border-stone-900">
                        <td colSpan={8} className="py-1.5 px-2 text-right text-stone-850 font-mono uppercase tracking-wider">
                          SUM/TOTAL NILAI KELUAR:
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-mono font-black text-stone-955 whitespace-nowrap">
                          Rp {formatRupiah(filteredSubmissions.reduce((sum, s) => sum + s.items.reduce((acc, i) => acc + i.total, 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {listShowSigners ? (
                  <div className="pt-4">
                    <F1SignaturesBlock
                      signers={listSigners}
                      style={listSignatureStyle}
                      density="dense"
                      isCompact
                    />
                  </div>
                ) : (
                  <div className="py-3 px-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 text-center text-[11px] text-stone-500 italic">
                    Kolom penanda tangan dihilangkan — tidak akan tercetak di PDF.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Pengaturan Penanda Tangan Lengkap (Cetak List, F1, F2) */}
      <SignerSettingsModal
        isOpen={isListSignerModalOpen}
        onClose={() => setIsListSignerModalOpen(false)}
        companyId={activeCompanyId}
        companyName={activeCompanyFullName}
        initialTab="list"
        f1Signers={companyF1Signers}
        f2Signers={companyF2Signers}
        listSigners={listSigners}
        listShowSigners={listShowSigners}
        listSignatureStyle={listSignatureStyle}
        signatureStyle={companySignatureStyle}
        onSave={(newF1, newF2, newStyle, saveAsDefault) => {
          setCompanyF1Signers(newF1);
          setCompanyF2Signers(newF2);
          setCompanySignatureStyle(newStyle);
          if (saveAsDefault) {
            saveCompanySignerBundle(activeCompanyId, {
              f1Signers: newF1,
              f2Signers: newF2,
              signatureStyle: newStyle,
            });
          }
        }}
        onSaveList={handleSaveListSigners}
        onReset={() => {
          const fresh = resetCompanySignerBundle(activeCompanyId, userProfile);
          setCompanyF1Signers(fresh.f1Signers);
          setCompanyF2Signers(fresh.f2Signers);
          setCompanySignatureStyle(fresh.signatureStyle);
        }}
        onResetList={handleResetListSigners}
      />
    </div>
  );
};


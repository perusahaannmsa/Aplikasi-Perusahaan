import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Submission, SubmissionItem, PettyCashReport, TransactionType, NpwpRecord, AgendaItem, Project, ProjectRabItem, ProjectExpense, InternalMemo, EmployeeLoan, MonthlyRecurringTransaction } from './types';
import { INITIAL_SUBMISSIONS } from './data/initialData';
import { INITIAL_AGENDA_ITEMS } from './data/initialAgenda';
import { SubmissionsList } from './components/SubmissionsList';
import { SubmissionForm } from './components/SubmissionForm';
import { PrintDocument } from './components/PrintDocument';
import { JsonBackup } from './components/JsonBackup';
import { DriveSyncMass } from './components/DriveSyncMass';
import { NusantaraLogo } from './components/NusantaraLogo';
import { CloudControlCenter } from './components/CloudControlCenter';
import { FirebaseMigration } from './components/FirebaseMigration';
import { SppdIntegration, SppdRecord } from './components/SppdIntegration';
import { SppdManager, SPPDRecord } from './components/SppdManager';
import { PublicSppdInput } from './components/PublicSppdInput';
import { PublicEmployeeLoanInput } from './components/PublicEmployeeLoanInput';
import { AuthGate } from './components/AuthGate';
import { InputBuktiTransfer } from './components/InputBuktiTransfer';
import { UploadBuktiTransferModal } from './components/UploadBuktiTransferModal';
import { UserProfileModal } from './components/UserProfileModal';
import { GoogleDriveSettingsModal } from './components/GoogleDriveSettingsModal';
import { DriveOrphanCleanerModal } from './components/DriveOrphanCleanerModal';
import { FirebaseQuotaModal } from './components/FirebaseQuotaModal';
import { AbsensiHarianNmsa } from './components/AbsensiHarianNmsa';
import { PettyCashHoldersModal } from './components/PettyCashHoldersModal';
import { ConsolidateNamesModal } from './components/ConsolidateNamesModal';
import {
  PettyCashCustodiansConfig,
  loadPettyCashCustodians,
  savePettyCashCustodians,
  getAllPettyCashHolders
} from './utils/pettyCashCustodians';
import { NpwpManager } from './components/NpwpManager';
import { AccuratePettyCashMapping } from './components/AccuratePettyCashMapping';
import { AccountMappingContainer } from './components/AccountMappingContainer';
import { AgendaReminderBanner } from './components/AgendaReminderBanner';
import { GeneralLedger } from './components/GeneralLedger';
import { WhatsAppAiModal } from './components/WhatsAppAiModal';
import { LiveClock } from './components/LiveClock';
import { Pph23BupotRecap } from './components/Pph23BupotRecap';
import { ProjectBudgetRab } from './components/ProjectBudgetRab';
import { CompanySwitcherModal } from './components/CompanySwitcherModal';
import { InternalMemoManager } from './components/InternalMemoManager';
import { EmployeeLoanManager } from './components/EmployeeLoanManager';
import { MonthlyTransactionsManager } from './components/MonthlyTransactionsManager';
import { MenuAlatView, AppViewMode } from './components/MenuAlatView';
import { PengaturanView } from './components/PengaturanView';
import { GoogleDriveBrowser } from './components/GoogleDriveBrowser';
import {
  STORAGE_KEY_MONTHLY_TRANSACTIONS,
  getJakartaTodayParts,
  getPendingMonthlySummary,
  getSubmissionTotalAmount,
  isSubmissionSettledForMonthly,
} from './utils/monthlyTransactions';
import { ThemeSelectorModal, AppTheme } from './components/ThemeSelectorModal';
import { getSynchronizedAttendanceWorkers, getSavedEmployeeLoans, saveEmployeeLoans, isLoanSubmission, syncLoansWithSubmissions } from './utils/loanUtils';
import { isPettyCashSubmission, getPettyCashCustodian, isInvoiceSubmission, syncInvoiceSubmissionToAgenda, formatDateIndonesian } from './utils';
import { areNamesSimilar, toTitleCase } from './utils/nameConsolidation';
import { deleteSubmissionDriveFolder } from './utils/googleDriveCleaner';
import { 
  isFirebaseConfigured, 
  saveSubmissionToFirestore, 
  saveSubmissionsBatchToFirestore,
  deleteSubmissionFromFirestore,
  deleteGoogleDriveFile,
  registerAuthChangeListener,
  getUserProfileFromFirestore,
  loadSubmissionsFromFirestoreSafe,
  restoreSubmissionsToFirestore,
  loadAllLocalSubmissionsForCompany,
  persistSubmissionsToLocalCaches,
  purgeAllLocalSubmissionCaches,
  addLocalDeletedSubmissionId,
  getLocalDeletedSubmissionIds,
  saveLocalDeletedSubmissionIds,
  normalizeCompanyKey,
  getCompanyProfileFromFirestore,
  logoutFromFirebase,
  saveActivityLogToFirestore,
  getSubmissionFromFirestore,
  loadNpwpRecordsFromFirestore,
  subscribeToNpwpRecordsFromFirestore,
  saveSingleNpwpRecordToFirestore,
  saveNpwpRecordsToFirestore,
  deleteNpwpRecordFromFirestore,
  loadSppdRecordsFromFirestore,
  saveSppdRecordsToFirestore,
  deleteSppdRecordFromFirestore,
  loadConnectedDrivesFromFirestore,
  startGoogleDriveTokenAutoRefresh,
  triggerGoogleDriveAutoRefresh,
  ensureValidDriveToken,
  getStoredGoogleDriveToken,
  getMasterDriveEmail,
  getActiveGoogleDriveAccount,
  subscribeToCompanySettingsFromFirestore,
  saveCompanySettingsToFirestore,
  switchUserCompany,
  setActiveCompanyId,
  isFirestoreQuotaExceeded,
  resetFirestoreQuotaCooldown,
  getPendingFirestoreSyncCount,
  flushFirestoreQueue,
  loadMonthlyTransactionsFromFirestore,
  saveMonthlyTransactionsToFirestore,
  subscribeToMonthlyTransactionsFromFirestore,
  subscribeToSubmissionsFromFirestore,
  sortSubmissionsList,
  mergeSubmissionsSafely,
  mergeNpwpListsSafely,
  getDeletedNpwpIds,
  getActiveFirebaseProjectId,
  withTimeout
} from './firebase';
import { loadAttendanceFromFirestore, loadWorkersFromFirestore, mergeWorkerListsSafely, getDeletedWorkerIds } from './lib/firebaseAbsen';

import { CleanFirestoreModal } from './components/CleanFirestoreModal';
import { DriveDeduplicateModal } from './components/DriveDeduplicateModal';
import { Database, FileText, CheckSquare, ShieldCheck, Heart, Cloud, Loader2, ArrowRight, ArrowLeftRight, LogIn, Printer, Users, Receipt, FileSpreadsheet, ChevronDown, LogOut, LayoutGrid, Settings, Check, Coins, History, AlertCircle, X, Briefcase, Layers, Calendar, CalendarClock, MessageSquare, Bot, BookOpen, Wrench, Building2, Plus, HandCoins, ExternalLink, RefreshCw, FolderSync, Trash2 } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      return (localStorage.getItem('NUSANTARA_THEME') as any) || 'classic';
    } catch (e) {
      return 'classic';
    }
  });

  const handleSelectTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('NUSANTARA_THEME', newTheme);
      saveCompanySettingsToFirestore({ theme: newTheme }).catch(() => {});
    } catch (e) {
      console.warn('Error saving theme:', e);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('NUSANTARA_THEME', theme);
    } catch (e) {
      console.error(e);
    }
  }, [theme]);

  useEffect(() => {
    try {
      if (window.screen && (window.screen.orientation as any)?.lock) {
        (window.screen.orientation as any).lock('portrait').catch(() => {});
      }
    } catch (e) {}
  }, []);

  const [submissions, setSubmissions] = useState<Submission[]>(() => {
    try {
      const activeComp = localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_ID') || 'nmsa';
      return loadAllLocalSubmissionsForCompany(activeComp);
    } catch (_) {
      return [];
    }
  });

  const submissionsRef = useRef<Submission[]>(submissions);
  const serverBackupSubmissionsRef = useRef<Submission[]>([]);
  const serverBackupFetchPromiseRef = useRef<Promise<Submission[]> | null>(null);
  useEffect(() => {
    submissionsRef.current = submissions;
  }, [submissions]);

  const hydrateServerBackupFromPayload = (payload: any): Submission[] => {
    if (!payload || typeof payload !== 'object') return serverBackupSubmissionsRef.current;
    const raw = payload.raw && typeof payload.raw === 'object' ? payload.raw : {};
    const serverDelIds: string[] = Array.isArray(payload.menu1_vouchers?.deletedSubmissionIds)
      ? payload.menu1_vouchers.deletedSubmissionIds
      : Array.isArray(raw.deletedSubmissionIds)
      ? raw.deletedSubmissionIds
      : Array.isArray(payload.deletedSubmissionIds)
      ? payload.deletedSubmissionIds
      : [];
    const mergedDelIds = Array.from(new Set([...getLocalDeletedSubmissionIds(), ...serverDelIds.map(String)]));
    saveLocalDeletedSubmissionIds(mergedDelIds);
    const delLower = new Set(mergedDelIds.map((x) => x.toLowerCase().trim()));

    const rawSubs: any[] =
      Array.isArray(raw.submissions) && raw.submissions.length > 0
        ? raw.submissions
        : Array.isArray(payload.menu1_vouchers?.submissions) && payload.menu1_vouchers.submissions.length > 0
        ? payload.menu1_vouchers.submissions
        : Array.isArray(payload.submissions)
        ? payload.submissions
        : [];

    if (rawSubs.length === 0) return serverBackupSubmissionsRef.current;

    const normalizedServerSubs: Submission[] = rawSubs
      .filter((s: any) => s && s.id && !delLower.has(String(s.id).toLowerCase().trim()))
      .map((s: any) => ({
        ...s,
        companyId: normalizeCompanyKey(s.companyId || 'nmsa'),
      }));
    const sortedServerSubs = sortSubmissionsList(normalizedServerSubs);
    if (sortedServerSubs.length > 0) {
      serverBackupSubmissionsRef.current = sortedServerSubs;
    }
    return sortedServerSubs;
  };

  const ensureServerBackupLoaded = async (forceRefresh = false): Promise<Submission[]> => {
    if (!forceRefresh && serverBackupSubmissionsRef.current.length > 0) {
      return serverBackupSubmissionsRef.current;
    }
    if (serverBackupFetchPromiseRef.current) {
      return serverBackupFetchPromiseRef.current;
    }
    serverBackupFetchPromiseRef.current = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch('/api/unified-storage');
          if (res.ok) {
            const data = await res.json();
            const hydrated = hydrateServerBackupFromPayload(data);
            if (hydrated.length > 0) return hydrated;
          }
        } catch (_) {}
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      try {
        const fbRes = await fetch('/api/shared-state');
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          const hydrated = hydrateServerBackupFromPayload(fbData);
          if (hydrated.length > 0) return hydrated;
        }
      } catch (_) {}
      return serverBackupSubmissionsRef.current;
    })().finally(() => {
      serverBackupFetchPromiseRef.current = null;
    });
    return serverBackupFetchPromiseRef.current;
  };

  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [cloudSyncNotice, setCloudSyncNotice] = useState<string | null>(null);
  const [isInitialReconcileDone, setIsInitialReconcileDone] = useState<boolean>(false);

  const PENDING_FIRESTORE_IDS_KEY = 'NUSANTARA_PENDING_FIRESTORE_SUBMISSION_IDS';
  const normalizeSubId = (id?: string) => String(id || '').toLowerCase().trim();

  const [cloudSyncedIds, setCloudSyncedIds] = useState<Set<string>>(() => new Set());
  const [hasCloudInventory, setHasCloudInventory] = useState<boolean>(false);
  const [uploadingSubIds, setUploadingSubIds] = useState<Set<string>>(() => new Set());
  const [pendingFirestoreIds, setPendingFirestoreIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PENDING_FIRESTORE_IDS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? Array.from(new Set(parsed.map((x: any) => String(x || '').toLowerCase().trim()).filter(Boolean)))
        : [];
    } catch {
      return [];
    }
  });

  const persistPendingFirestoreIds = (nextIds: string[]) => {
    const clean = Array.from(new Set(nextIds.map(normalizeSubId).filter(Boolean)));
    try {
      if (clean.length === 0) {
        localStorage.removeItem(PENDING_FIRESTORE_IDS_KEY);
      } else {
        localStorage.setItem(PENDING_FIRESTORE_IDS_KEY, JSON.stringify(clean));
      }
    } catch (_) {}
    return clean;
  };

  const markPendingFirestoreIds = (ids: string[]) => {
    const additions = ids.map(normalizeSubId).filter(Boolean);
    if (additions.length === 0) return;
    setPendingFirestoreIds((prev) => persistPendingFirestoreIds([...prev, ...additions]));
  };

  const clearPendingFirestoreIds = (ids: string[]) => {
    const toRemove = new Set(ids.map(normalizeSubId).filter(Boolean));
    if (toRemove.size === 0) return;
    setPendingFirestoreIds((prev) => persistPendingFirestoreIds(prev.filter((id) => !toRemove.has(id))));
  };

  const addCloudSyncedIds = (ids: string[]) => {
    const additions = ids.map(normalizeSubId).filter(Boolean);
    if (additions.length === 0) return;
    setCloudSyncedIds((prev) => {
      const next = new Set(prev);
      additions.forEach((id) => next.add(id));
      return next;
    });
  };

  const updateCloudInventoryFromList = (cloudList: Submission[]) => {
    setCloudSyncedIds(new Set((cloudList || []).map((s) => normalizeSubId(s.id)).filter(Boolean)));
    setHasCloudInventory(true);
  };

  const resetCloudInventory = () => {
    setCloudSyncedIds(new Set());
    setHasCloudInventory(false);
  };

  // Petty Cash master state organized by category (Lapangan & Kantor Pusat)
  const [pettyCashCustodiansConfig, setPettyCashCustodiansConfig] = useState<PettyCashCustodiansConfig>(() => {
    return loadPettyCashCustodians();
  });

  const [pettyCashHolders, setPettyCashHolders] = useState<string[]>(() => {
    const config = loadPettyCashCustodians();
    return getAllPettyCashHolders(config);
  });

  const [pettyCashReports, setPettyCashReports] = useState<PettyCashReport[]>(() => {
    try {
      const stored = localStorage.getItem('petty_cash_reports');
      if (!stored || stored === 'undefined' || stored === 'null') return [];
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.updatedPettyCashReports)) {
        localStorage.setItem('petty_cash_reports', JSON.stringify(parsed.updatedPettyCashReports));
        return parsed.updatedPettyCashReports.filter(Boolean);
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  const [npwpRecords, setNpwpRecords] = useState<NpwpRecord[]>(() => {
    try {
      const stored = localStorage.getItem('npwp_records_v1');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const [sppdRecords, setSppdRecords] = useState<SPPDRecord[]>(() => {
    try {
      const stored = localStorage.getItem('sppd_records_v1');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Task / Activity Reminders (Agenda Kegiatan & Pengingat Tenggat Waktu)
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>(() => {
    try {
      const stored = localStorage.getItem('nmsa_agenda_items_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  // Project Management & Budget (RAB) per Proyek (Accurate Style)
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const stored = localStorage.getItem('nmsa_projects_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [projectRab, setProjectRab] = useState<ProjectRabItem[]>(() => {
    try {
      const stored = localStorage.getItem('nmsa_project_rab_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [projectExpenses, setProjectExpenses] = useState<ProjectExpense[]>(() => {
    try {
      const stored = localStorage.getItem('nmsa_project_expenses_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Transaksi Bulanan Otomatis (Jatuh Tempo Sebelum Tanggal 15)
  const [deletedMonthlyIds, setDeletedMonthlyIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('nmsa_monthly_deleted_ids_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.map(String);
      }
    } catch (e) {}
    return [];
  });

  const [monthlyTransactions, setMonthlyTransactions] = useState<MonthlyRecurringTransaction[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_MONTHLY_TRANSACTIONS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const mergeMonthlyListsSafely = (
    localList: MonthlyRecurringTransaction[],
    incomingList: MonthlyRecurringTransaction[],
    deletedIds: string[]
  ): MonthlyRecurringTransaction[] => {
    const delSet = new Set((deletedIds || []).map(String));
    const map = new Map<string, MonthlyRecurringTransaction>();
    for (const item of localList || []) {
      if (item && item.id && !delSet.has(String(item.id))) {
        map.set(String(item.id), item);
      }
    }
    for (const item of incomingList || []) {
      if (!item || !item.id || delSet.has(String(item.id))) continue;
      const existing = map.get(String(item.id));
      if (!existing) {
        map.set(String(item.id), item);
      } else {
        const tEx = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const tIn = new Date(item.updatedAt || item.createdAt || 0).getTime();
        if (tIn >= tEx) {
          map.set(String(item.id), {
            ...existing,
            ...item,
            paidMonths: { ...(existing.paidMonths || {}), ...(item.paidMonths || {}) },
          });
        }
      }
    }
    return Array.from(map.values());
  };

  const handleSaveMonthlyTransactions = async (
    updatedList: MonthlyRecurringTransaction[],
    deletedId?: string
  ) => {
    const nextDeleted = deletedId
      ? Array.from(new Set([...deletedMonthlyIds, String(deletedId)]))
      : deletedMonthlyIds;
    const delSet = new Set(nextDeleted.map(String));
    const cleanList = (updatedList || []).filter((it) => it && it.id && !delSet.has(String(it.id)));

    setDeletedMonthlyIds(nextDeleted);
    setMonthlyTransactions(cleanList);
    try {
      localStorage.setItem(STORAGE_KEY_MONTHLY_TRANSACTIONS, JSON.stringify(cleanList));
      localStorage.setItem('nmsa_monthly_deleted_ids_v1', JSON.stringify(nextDeleted));
    } catch (e) {}

    saveMonthlyTransactionsToFirestore(cleanList, nextDeleted).catch(() => {});
    try {
      fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyTransactions: cleanList,
          deletedMonthlyIds: nextDeleted,
        }),
      }).catch(() => {});
    } catch (e) {}
  };

  const [isHoldersModalOpen, setIsHoldersModalOpen] = useState(false);
  const [isConsolidateNamesModalOpen, setIsConsolidateNamesModalOpen] = useState(false);
  const [isDriveOrphanCleanerOpen, setIsDriveOrphanCleanerOpen] = useState(false);
  const [showQuotaBanner, setShowQuotaBanner] = useState<boolean>(() => isFirestoreQuotaExceeded());

  useEffect(() => {
    const onOpenCleaner = () => setIsDriveOrphanCleanerOpen(true);
    window.addEventListener('open-drive-orphan-cleaner', onOpenCleaner);
    return () => window.removeEventListener('open-drive-orphan-cleaner', onOpenCleaner);
  }, []);

  useEffect(() => {
    const handler = () => setShowQuotaBanner(true);
    window.addEventListener('firestore-quota-exceeded', handler);
    return () => window.removeEventListener('firestore-quota-exceeded', handler);
  }, []);

  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => getPendingFirestoreSyncCount());
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);

  useEffect(() => {
    const onQueueStatus = (e: any) => {
      if (e.detail) {
        setPendingSyncCount(e.detail.pendingCount ?? 0);
        setIsSyncingQueue(!!e.detail.isSyncing);
      }
    };
    window.addEventListener('firestore-queue-status', onQueueStatus);
    return () => window.removeEventListener('firestore-queue-status', onQueueStatus);
  }, []);

  // Shared Server State sync (Express unified-storage / shared-state + Google Drive keeper + local caches)
  useEffect(() => {
    // 1. Keep local settings subscription (no-op on Firestore)
    const unsubscribeCompany = subscribeToCompanySettingsFromFirestore((settings) => {
      if (settings.pettyCashHolders && Array.isArray(settings.pettyCashHolders) && settings.pettyCashHolders.length > 0) {
        setPettyCashHolders(settings.pettyCashHolders);
      }
      if (settings.pettyCashReports && Array.isArray(settings.pettyCashReports)) {
        setPettyCashReports(settings.pettyCashReports);
      }
      if (settings.npwpRecords && Array.isArray(settings.npwpRecords) && settings.npwpRecords.length > 0) {
        setNpwpRecords(prev => {
          const map = new Map<string, NpwpRecord>();
          prev.forEach(r => map.set(r.id, r));
          settings.npwpRecords!.forEach((r: NpwpRecord) => map.set(r.id, r));
          return Array.from(map.values());
        });
      }
      if (settings.sppdRecords && Array.isArray(settings.sppdRecords) && settings.sppdRecords.length > 0) {
        setSppdRecords(prev => {
          const map = new Map<string, SPPDRecord>();
          prev.forEach(r => map.set(r.id, r));
          settings.sppdRecords!.forEach((r: SPPDRecord) => map.set(r.id, r));
          return Array.from(map.values());
        });
      }
      if (settings.agendaItems && Array.isArray(settings.agendaItems) && settings.agendaItems.length > 0) {
        setAgendaItems(settings.agendaItems);
      }
      if (settings.theme && ['classic', 'gold-dark', 'emerald', 'slate', 'sunset', 'nordic', 'cyberpunk', 'cozy'].includes(settings.theme)) {
        setTheme(settings.theme as any);
      }
    });

    // 2. Initial fallback fetch from server /api/unified-storage & /api/shared-state with resilient retry
    const loadSharedState = async (retries = 3, delay = 800) => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch('/api/unified-storage');
          if (!res.ok) {
            // fallback to /api/shared-state if needed
            const fbRes = await fetch('/api/shared-state');
            if (!fbRes.ok) throw new Error(`HTTP ${fbRes.status}`);
            const fbData = await fbRes.json();
            if (fbData) {
              if (fbData.workers && Array.isArray(fbData.workers) && fbData.workers.length > 0) {
                try {
                  const existingRaw = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
                  const existingList = existingRaw ? JSON.parse(existingRaw) : [];
                  const merged = mergeWorkerListsSafely(existingList, fbData.workers, getDeletedWorkerIds());
                  localStorage.setItem('karyawan_uang_makan', JSON.stringify(merged));
                  localStorage.setItem('workers_v1', JSON.stringify(merged));
                } catch (_) {}
              }
              if (fbData.pettyCashHolders && Array.isArray(fbData.pettyCashHolders) && fbData.pettyCashHolders.length > 0) {
                setPettyCashHolders(fbData.pettyCashHolders);
                localStorage.setItem('petty_cash_holders_v2', JSON.stringify(fbData.pettyCashHolders));
              }
              if (fbData.pettyCashReports && Array.isArray(fbData.pettyCashReports)) {
                setPettyCashReports(fbData.pettyCashReports);
                localStorage.setItem('petty_cash_reports', JSON.stringify(fbData.pettyCashReports));
              }
              if (fbData.npwpRecords && Array.isArray(fbData.npwpRecords) && fbData.npwpRecords.length > 0) {
                setNpwpRecords(prev => {
                  const map = new Map<string, NpwpRecord>();
                  prev.forEach(r => map.set(r.id, r));
                  fbData.npwpRecords.forEach((r: NpwpRecord) => map.set(r.id, r));
                  const merged = Array.from(map.values());
                  localStorage.setItem('npwp_records_v1', JSON.stringify(merged));
                  return merged;
                });
              }
              if (fbData.sppdRecords && Array.isArray(fbData.sppdRecords) && fbData.sppdRecords.length > 0) {
                setSppdRecords(prev => {
                  const map = new Map<string, SPPDRecord>();
                  prev.forEach(r => map.set(r.id, r));
                  fbData.sppdRecords.forEach((r: SPPDRecord) => map.set(r.id, r));
                  const merged = Array.from(map.values());
                  localStorage.setItem('sppd_records_v1', JSON.stringify(merged));
                  return merged;
                });
              }
              if (fbData.agendaItems && Array.isArray(fbData.agendaItems) && fbData.agendaItems.length > 0) {
                setAgendaItems(fbData.agendaItems);
                localStorage.setItem('nmsa_agenda_items_v1', JSON.stringify(fbData.agendaItems));
              }
              if (fbData.monthlyTransactions && Array.isArray(fbData.monthlyTransactions)) {
                const delIds = Array.from(new Set([...deletedMonthlyIds, ...((fbData.deletedMonthlyIds || []) as string[]).map(String)]));
                setDeletedMonthlyIds(delIds);
                setMonthlyTransactions(prev => {
                  const merged = mergeMonthlyListsSafely(prev, fbData.monthlyTransactions, delIds);
                  try {
                    localStorage.setItem(STORAGE_KEY_MONTHLY_TRANSACTIONS, JSON.stringify(merged));
                    localStorage.setItem('nmsa_monthly_deleted_ids_v1', JSON.stringify(delIds));
                  } catch (_) {}
                  return merged;
                });
              }
              if (fbData.projects && Array.isArray(fbData.projects) && fbData.projects.length > 0) {
                setProjects(fbData.projects);
                localStorage.setItem('nmsa_projects_v1', JSON.stringify(fbData.projects));
              }
              if (fbData.projectRab && Array.isArray(fbData.projectRab)) {
                setProjectRab(fbData.projectRab);
                localStorage.setItem('nmsa_project_rab_v1', JSON.stringify(fbData.projectRab));
              }
              if (fbData.projectExpenses && Array.isArray(fbData.projectExpenses)) {
                setProjectExpenses(fbData.projectExpenses);
                localStorage.setItem('nmsa_project_expenses_v1', JSON.stringify(fbData.projectExpenses));
              }
              const hydratedFbSubs = hydrateServerBackupFromPayload(fbData);
              if (hydratedFbSubs.length > 0) {
                const currentComp = normalizeCompanyKey(localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_ID') || 'nmsa');
                const companyFbSubs = hydratedFbSubs.filter((s) => normalizeCompanyKey(s.companyId) === currentComp);
                if (companyFbSubs.length > 0) {
                  setSubmissions((prev) => {
                    const merged = mergeSubmissionsSafely([companyFbSubs, prev]);
                    persistSubmissionsToLocalCaches(merged, currentComp);
                    return merged;
                  });
                  setCloudSyncNotice((prevNotice) => {
                    if (prevNotice && prevNotice.includes('Menampilkan 0 transaksi')) {
                      return prevNotice.replace(
                        'Menampilkan 0 transaksi',
                        `Menampilkan ${companyFbSubs.length} transaksi`
                      );
                    }
                    return prevNotice;
                  });
                }
              }
            }
            return;
          }

          const data = await res.json();
          if (data && data.success) {
            const raw = data.raw || {};
            if (raw.workers && Array.isArray(raw.workers) && raw.workers.length > 0) {
              try {
                const existingRaw = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
                const existingList = existingRaw ? JSON.parse(existingRaw) : [];
                const merged = mergeWorkerListsSafely(existingList, raw.workers, getDeletedWorkerIds());
                localStorage.setItem('karyawan_uang_makan', JSON.stringify(merged));
                localStorage.setItem('workers_v1', JSON.stringify(merged));
              } catch (_) {}
            }
            if (raw.pettyCashHolders && Array.isArray(raw.pettyCashHolders) && raw.pettyCashHolders.length > 0) {
              setPettyCashHolders(raw.pettyCashHolders);
              localStorage.setItem('petty_cash_holders_v2', JSON.stringify(raw.pettyCashHolders));
            }
            if (raw.pettyCashReports && Array.isArray(raw.pettyCashReports) && raw.pettyCashReports.length > 0) {
              setPettyCashReports(raw.pettyCashReports);
              localStorage.setItem('petty_cash_reports', JSON.stringify(raw.pettyCashReports));
            }
            if (raw.npwpRecords && Array.isArray(raw.npwpRecords) && raw.npwpRecords.length > 0) {
              setNpwpRecords(prev => {
                const map = new Map<string, NpwpRecord>();
                prev.forEach(r => map.set(r.id, r));
                raw.npwpRecords.forEach((r: NpwpRecord) => map.set(r.id, r));
                const merged = Array.from(map.values());
                localStorage.setItem('npwp_records_v1', JSON.stringify(merged));
                return merged;
              });
            }
            if (raw.sppdRecords && Array.isArray(raw.sppdRecords) && raw.sppdRecords.length > 0) {
              setSppdRecords(prev => {
                const map = new Map<string, SPPDRecord>();
                prev.forEach(r => map.set(r.id, r));
                raw.sppdRecords.forEach((r: SPPDRecord) => map.set(r.id, r));
                const merged = Array.from(map.values());
                localStorage.setItem('sppd_records_v1', JSON.stringify(merged));
                return merged;
              });
            }
            if (raw.agendaItems && Array.isArray(raw.agendaItems) && raw.agendaItems.length > 0) {
              setAgendaItems(raw.agendaItems);
              localStorage.setItem('nmsa_agenda_items_v1', JSON.stringify(raw.agendaItems));
            }
            if (raw.monthlyTransactions && Array.isArray(raw.monthlyTransactions)) {
              const delIds = Array.from(new Set([...deletedMonthlyIds, ...((raw.deletedMonthlyIds || []) as string[]).map(String)]));
              setDeletedMonthlyIds(delIds);
              setMonthlyTransactions(prev => {
                const merged = mergeMonthlyListsSafely(prev, raw.monthlyTransactions, delIds);
                try {
                  localStorage.setItem(STORAGE_KEY_MONTHLY_TRANSACTIONS, JSON.stringify(merged));
                  localStorage.setItem('nmsa_monthly_deleted_ids_v1', JSON.stringify(delIds));
                } catch (_) {}
                return merged;
              });
            }
            if (raw.projects && Array.isArray(raw.projects) && raw.projects.length > 0) {
              setProjects(raw.projects);
              localStorage.setItem('nmsa_projects_v1', JSON.stringify(raw.projects));
            }
            if (raw.projectRab && Array.isArray(raw.projectRab)) {
              setProjectRab(raw.projectRab);
              localStorage.setItem('nmsa_project_rab_v1', JSON.stringify(raw.projectRab));
            }
            if (raw.projectExpenses && Array.isArray(raw.projectExpenses)) {
              setProjectExpenses(raw.projectExpenses);
              localStorage.setItem('nmsa_project_expenses_v1', JSON.stringify(raw.projectExpenses));
            }
            if (raw.internalMemos && Array.isArray(raw.internalMemos) && raw.internalMemos.length > 0) {
              try {
                const localMemosRaw = localStorage.getItem('nmsa_internal_memos_v1');
                const localMemos = localMemosRaw ? JSON.parse(localMemosRaw) : [];
                const memoMap = new Map<string, any>();
                if (Array.isArray(localMemos)) localMemos.forEach((m: any) => { if (m?.id) memoMap.set(m.id, m); });
                raw.internalMemos.forEach((m: any) => { if (m?.id) memoMap.set(m.id, m); });
                localStorage.setItem('nmsa_internal_memos_v1', JSON.stringify(Array.from(memoMap.values())));
              } catch (_) {}
            }

            // Hydrate submission tombstones & server backup submissions (supports both Express raw/menu1_vouchers & Vercel top-level submissions)
            const sortedServerSubs = hydrateServerBackupFromPayload(data);
            if (sortedServerSubs.length > 0) {
              const delLower = new Set(getLocalDeletedSubmissionIds().map((x) => x.toLowerCase().trim()));
              const currentComp = normalizeCompanyKey(localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_ID') || 'nmsa');
              const companyServerSubs = sortedServerSubs.filter((s) => normalizeCompanyKey(s.companyId) === currentComp);
              if (companyServerSubs.length > 0) {
                persistSubmissionsToLocalCaches(companyServerSubs, currentComp);
                setSubmissions((prev) => {
                  const filteredPrev = prev.filter((p) => p?.id && !delLower.has(String(p.id).toLowerCase().trim()));
                  if (filteredPrev.length === 0) {
                    return companyServerSubs;
                  }
                  const map = new Map<string, Submission>();
                  companyServerSubs.forEach((s) => map.set(String(s.id).toLowerCase(), s));
                  filteredPrev.forEach((s) => map.set(String(s.id).toLowerCase(), s));
                  return sortSubmissionsList(Array.from(map.values()));
                });
                setCloudSyncNotice((prevNotice) => {
                  if (prevNotice && prevNotice.includes('Menampilkan 0 transaksi')) {
                    return prevNotice.replace(
                      'Menampilkan 0 transaksi',
                      `Menampilkan ${companyServerSubs.length} transaksi`
                    );
                  }
                  return prevNotice;
                });
              }
            }
          }

          // Also attempt explicit /api/projects synchronization
          try {
            const prjRes = await fetch('/api/projects');
            if (prjRes.ok) {
              const prjData = await prjRes.json();
              if (prjData && prjData.success) {
                if (prjData.projects && Array.isArray(prjData.projects) && prjData.projects.length > 0) {
                  setProjects(prjData.projects);
                  localStorage.setItem('nmsa_projects_v1', JSON.stringify(prjData.projects));
                }
                if (prjData.projectRab && Array.isArray(prjData.projectRab)) {
                  setProjectRab(prjData.projectRab);
                  localStorage.setItem('nmsa_project_rab_v1', JSON.stringify(prjData.projectRab));
                }
                if (prjData.projectExpenses && Array.isArray(prjData.projectExpenses)) {
                  setProjectExpenses(prjData.projectExpenses);
                  localStorage.setItem('nmsa_project_expenses_v1', JSON.stringify(prjData.projectExpenses));
                }
              }
            }
          } catch (prjErr) {}
          return;
        } catch (err) {
          if (i < retries - 1) {
            await new Promise(res => setTimeout(res, delay * (i + 1)));
          } else {
            console.warn('Sinkronisasi shared state server offline atau tertunda, menggunakan cache lokal:', err);
          }
        }
      }
    };
    loadSharedState();

    loadSppdRecordsFromFirestore()
      .then(fsRecords => {
        if (fsRecords && fsRecords.length > 0) {
          setSppdRecords(prev => {
            const map = new Map<string, SPPDRecord>();
            prev.forEach(r => map.set(r.id, r));
            fsRecords.forEach(r => map.set(r.id, r));
            const merged = Array.from(map.values());
            localStorage.setItem('sppd_records_v1', JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(err => console.warn('Local SPPD sync skipped:', err));

    // Automatically sync Google Drive connection across the entire app
    loadConnectedDrivesFromFirestore()
      .then(drives => {
        if (drives && drives.length > 0) {
          console.log(`☁️ Synced ${drives.length} Google Drive account(s) globally.`);
        }
      })
      .catch(err => console.warn('Drive sync skipped:', err));

    // Start background auto-keeper for Google Drive token (every 30 seconds)
    const stopAutoRefresh = startGoogleDriveTokenAutoRefresh(30);

    // ⚡ On startup, immediately refresh & verify Google Drive token
    triggerGoogleDriveAutoRefresh('app-startup', true, false).catch(() => {});

    // If token is expired/missing on app startup, renew silently in background
    const handleFirstUserInteraction = () => {
      const activeToken = getStoredGoogleDriveToken(true);
      if (!activeToken) {
        triggerGoogleDriveAutoRefresh('first-interaction-renew', false, false).catch(() => {});
      }
    };
    window.addEventListener('pointerdown', handleFirstUserInteraction, { once: true });
    window.addEventListener('keydown', handleFirstUserInteraction, { once: true });

    return () => {
      unsubscribeCompany();
      stopAutoRefresh();
      window.removeEventListener('pointerdown', handleFirstUserInteraction);
      window.removeEventListener('keydown', handleFirstUserInteraction);
    };
  }, []);

  // Auto-sync Petty Cash submissions into pettyCashReports
  useEffect(() => {
    if (!submissions || submissions.length === 0) return;

    let reportsChanged = false;
    let updatedReports = [...pettyCashReports];

    submissions.forEach((sub) => {
      const isPC = isPettyCashSubmission(sub);

      if (isPC) {
        const custodianName = getPettyCashCustodian(sub, pettyCashHolders) || 'Suryo Pranoto';

        // 2. Ensure submission has a corresponding PettyCashReport
        const totalExp = sub.items ? sub.items.reduce((acc, it) => acc + (it.total || 0), 0) : 0;
        const attachedFiles = sub.googleDriveFiles || sub.files || [];
        const reportFileUrl = sub.pettyCashFile?.url || 
                              sub.googleDriveFileUrl || 
                              (attachedFiles.length > 0 ? attachedFiles[0].url : '');
        const reportFileName = sub.pettyCashFile?.name || 
                               sub.googleDriveFileName || 
                               (attachedFiles.length > 0 ? attachedFiles[0].name : `Laporan Petty Cash Lapangan - ${sub.kode || 'HO'}`);

        const existingIdx = updatedReports.findIndex(r => r.submissionId === sub.id || (sub.kode && r.submissionCode === sub.kode));

        const reportItem: PettyCashReport = {
          id: existingIdx >= 0 ? updatedReports[existingIdx].id : 'pcr_' + sub.id,
          fileName: reportFileName,
          uploadedAt: sub.tanggal || new Date().toISOString().split('T')[0],
          summary: {
            totalIncome: 0,
            totalExpense: totalExp,
            remainingBalance: -totalExp,
            workerName: custodianName,
            reportMonth: sub.tanggal ? sub.tanggal.substring(0, 7) : new Date().toISOString().substring(0, 7)
          },
          transactions: sub.items && sub.items.length > 0 ? sub.items.map(it => ({
            date: sub.tanggal || new Date().toISOString().split('T')[0],
            description: it.item || 'Transaksi Petty Cash Lapangan HO',
            category: sub.jenisPengajuan || 'Petty Cash',
            amount: it.total || 0,
            worker: custodianName,
            type: TransactionType.EXPENSE,
            verified: true
          })) : [{
            date: sub.tanggal || new Date().toISOString().split('T')[0],
            description: sub.notes || `Voucher ${sub.kode || 'HO'} Petty Cash`,
            category: sub.jenisPengajuan || 'Petty Cash',
            amount: totalExp,
            worker: custodianName,
            type: TransactionType.EXPENSE,
            verified: true
          }],
          driveUrl: reportFileUrl,
          submissionId: sub.id,
          submissionCode: sub.kode || 'HO'
        };

        if (existingIdx >= 0) {
          // Keep driveUrl, fileName, and workerName synced with latest submission data
          if (reportFileUrl && updatedReports[existingIdx].driveUrl !== reportFileUrl) {
            updatedReports[existingIdx].driveUrl = reportFileUrl;
            updatedReports[existingIdx].fileName = reportFileName;
            reportsChanged = true;
          }
          if (updatedReports[existingIdx].summary.workerName !== custodianName) {
            updatedReports[existingIdx].summary.workerName = custodianName;
            reportsChanged = true;
          }
          if (updatedReports[existingIdx].summary.totalExpense !== totalExp) {
            updatedReports[existingIdx].summary.totalExpense = totalExp;
            updatedReports[existingIdx].summary.remainingBalance = -totalExp;
            reportsChanged = true;
          }
        } else {
          updatedReports.unshift(reportItem);
          reportsChanged = true;
        }
      }
    });

    if (reportsChanged) {
      setPettyCashReports(updatedReports);
      localStorage.setItem('petty_cash_reports', JSON.stringify(updatedReports));
    }

    if (reportsChanged) {
      fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pettyCashHolders,
          pettyCashReports: updatedReports
        })
      }).catch(err => console.warn('Sync shared state error:', err));
    }
  }, [submissions, pettyCashHolders]);

  // Sync all submissions to backend memory & data-store for WhatsApp AI Bot
  useEffect(() => {
    if (submissions && submissions.length > 0) {
      fetch('/api/sync-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions })
      }).catch(err => console.warn('Sync submissions to server error:', err));
    }
  }, [submissions]);

  const handleSaveCustodiansConfig = async (newConfig: PettyCashCustodiansConfig) => {
    setPettyCashCustodiansConfig(newConfig);
    savePettyCashCustodians(newConfig);
    const flat = getAllPettyCashHolders(newConfig);
    setPettyCashHolders(flat);
    try {
      await fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pettyCashHolders: flat, pettyCashCustodians: newConfig, pettyCashReports })
      });
      await fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pettyCashHolders: flat, pettyCashCustodians: newConfig })
      });
      await saveCompanySettingsToFirestore({ pettyCashHolders: flat, pettyCashCustodians: newConfig } as any);
    } catch (err) {
      console.error('Gagal sinkronisasi master list pemegang petty cash:', err);
    }
  };

  const handleSavePettyCashHolders = async (newHolders: string[]) => {
    setPettyCashHolders(newHolders);
    localStorage.setItem('petty_cash_holders_v2', JSON.stringify(newHolders));
    try {
      await fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pettyCashHolders: newHolders, pettyCashReports })
      });
      await fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pettyCashHolders: newHolders })
      });
      await saveCompanySettingsToFirestore({ pettyCashHolders: newHolders });
    } catch (err) {
      console.error('Gagal sinkronisasi master list pemegang petty cash:', err);
    }
  };

  const handleApplyConsolidation = async (
    payload: any,
    secondParam?: any
  ) => {
    let consolidatedSubmissions: Submission[] = [];
    let consolidatedHolders: string[] = pettyCashHolders;
    let consolidatedReports: PettyCashReport[] = pettyCashReports;

    // Check if called with result object { updatedSubmissions, updatedPettyCashHolders, updatedPettyCashReports }
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.updatedSubmissions)) {
      consolidatedSubmissions = payload.updatedSubmissions;
      if (Array.isArray(payload.updatedPettyCashHolders)) {
        consolidatedHolders = payload.updatedPettyCashHolders;
      }
      if (Array.isArray(payload.updatedPettyCashReports)) {
        consolidatedReports = payload.updatedPettyCashReports;
      }
    } else if (Array.isArray(payload)) {
      consolidatedSubmissions = payload;
      if (Array.isArray(secondParam)) {
        consolidatedHolders = secondParam;
      }
    } else {
      console.error('Payload konsolidasi tidak valid:', payload);
      return;
    }

    // Defensive check: pastikan selalu berupa array
    if (!Array.isArray(consolidatedSubmissions)) {
      console.error('consolidatedSubmissions bukan array:', consolidatedSubmissions);
      return;
    }
    if (!Array.isArray(consolidatedHolders)) {
      consolidatedHolders = pettyCashHolders;
    }

    // 1. Update React state immediately
    setSubmissions(consolidatedSubmissions);
    setPettyCashHolders(consolidatedHolders);
    if (Array.isArray(consolidatedReports)) {
      setPettyCashReports(consolidatedReports);
    }

    // 2. Persist consolidated submissions & master settings locally to browser
    try {
      purgeAllLocalSubmissionCaches();
      persistSubmissionsToLocalCaches(consolidatedSubmissions, activeCompForSync);
      localStorage.setItem('petty_cash_holders_v2', JSON.stringify(consolidatedHolders));
      if (Array.isArray(consolidatedReports)) {
        localStorage.setItem('petty_cash_reports', JSON.stringify(consolidatedReports));
      }
    } catch (e) {
      console.error('Gagal menyimpan pengaturan ke localStorage:', e);
    }

    // 3. Batch update all modified submissions into Firestore
    try {
      const batchRes = await saveSubmissionsBatchToFirestore(consolidatedSubmissions);
      const ids = consolidatedSubmissions.map((s) => s.id);
      if (batchRes.success) {
        addCloudSyncedIds(ids);
        clearPendingFirestoreIds(ids);
      } else {
        markPendingFirestoreIds(ids);
      }
    } catch (err) {
      markPendingFirestoreIds(consolidatedSubmissions.map((s) => s.id));
      console.warn('Gagal batch update submissions ke Firestore:', err);
    }

    // 4. Save updated pettyCashHolders to Firestore
    try {
      await saveCompanySettingsToFirestore({ pettyCashHolders: consolidatedHolders });
    } catch (err) {
      console.warn('Gagal simpan pettyCashHolders ke Firestore:', err);
    }

    // 5. Sync to unified storage & shared state servers
    try {
      await fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pettyCashHolders: consolidatedHolders,
          submissions: consolidatedSubmissions
        })
      });
      await fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pettyCashHolders: consolidatedHolders,
          pettyCashReports: consolidatedReports
        })
      });
    } catch (err) {
      console.warn('Gagal sync backend servers setelah konsolidasi:', err);
    }
  };

  const handleSavePettyCashReports = async (newReports: PettyCashReport[]) => {
    setPettyCashReports(newReports);
    localStorage.setItem('petty_cash_reports', JSON.stringify(newReports));
    try {
      await fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pettyCashReports: newReports, pettyCashHolders })
      });
    } catch (err) {
      console.error('Gagal sinkronisasi laporan petty cash:', err);
    }
  };

  const handleSaveNpwpRecords = async (newRecords: NpwpRecord[]) => {
    const prevMap = new Map(npwpRecords.map((r) => [r.id, r]));
    const nextMap = new Map(newRecords.map((r) => [r.id, r]));
    const removedIds = npwpRecords.filter((r) => !nextMap.has(r.id)).map((r) => r.id);
    const changedOrAdded = newRecords.filter((r) => {
      const prev = prevMap.get(r.id);
      if (!prev) return true;
      return JSON.stringify(prev) !== JSON.stringify(r);
    });

    setNpwpRecords(newRecords);
    try {
      localStorage.setItem('npwp_records_v1', JSON.stringify(newRecords));
    } catch (e) {
      console.error('Error saving npwp_records_v1 to localStorage:', e);
    }

    try {
      await fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npwpRecords: newRecords })
      });
    } catch (err) {
      console.error('Gagal sinkronisasi data NPWP ke server:', err);
    }

    try {
      for (const delId of removedIds) {
        await deleteNpwpRecordFromFirestore(delId);
      }
      if (changedOrAdded.length === 1) {
        await saveSingleNpwpRecordToFirestore(changedOrAdded[0]);
      } else if (changedOrAdded.length > 1) {
        await saveNpwpRecordsToFirestore(changedOrAdded);
      }
    } catch (err) {
      console.warn('Gagal sinkronisasi data NPWP ke Firestore:', err);
    }
  };

  // Non-destructive NPWP cloud merge (never treats unsynced local items as deleted)
  const handleSyncNpwpFromCloud = (cloudRecords: NpwpRecord[]) => {
    if (!Array.isArray(cloudRecords) || cloudRecords.length === 0) return;
    const delIds = getDeletedNpwpIds();
    setNpwpRecords((prev) => {
      const merged = mergeNpwpListsSafely(cloudRecords, prev, delIds);
      try {
        localStorage.setItem('npwp_records_v1', JSON.stringify(merged));
      } catch (_) {}
      return merged;
    });
  };

  const handleSaveAgendaItems = async (newItems: AgendaItem[]) => {
    setAgendaItems(newItems);
    try {
      localStorage.setItem('nmsa_agenda_items_v1', JSON.stringify(newItems));
    } catch (e) {
      console.error('Gagal menyimpan agenda ke localStorage:', e);
    }

    try {
      await fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agendaItems: newItems })
      });
    } catch (err) {
      console.warn('Gagal sinkronisasi agenda ke unified storage:', err);
    }

    try {
      await saveCompanySettingsToFirestore({ agendaItems: newItems });
    } catch (err) {
      console.warn('Gagal sinkronisasi agenda ke Firestore:', err);
    }
  };

  const handleToggleAgendaComplete = (id: string) => {
    const newList = agendaItems.map(item => {
      if (item.id === id) {
        const isNowCompleted = item.status === 'pending';
        return {
          ...item,
          status: (isNowCompleted ? 'completed' : 'pending') as 'pending' | 'completed',
          completedAt: isNowCompleted ? new Date().toISOString() : undefined,
          completedBy: isNowCompleted ? (userProfile?.fullName || 'Nur Wahyudi') : undefined
        };
      }
      return item;
    });
    handleSaveAgendaItems(newList);
  };

  const handlePostponeAgenda = (id: string, days: number = 1) => {
    const newList = agendaItems.map(item => {
      if (item.id === id) {
        const curr = new Date(item.dueDate);
        curr.setDate(curr.getDate() + days);
        const newDue = curr.toISOString().split('T')[0];
        return {
          ...item,
          dueDate: newDue,
          updatedAt: new Date().toISOString()
        };
      }
      return item;
    });
    handleSaveAgendaItems(newList);
  };

  // Automatic periodic Google Drive token keepalive and auto-refresh (every 30 seconds)
  useEffect(() => {
    const stopAutoRefresh = startGoogleDriveTokenAutoRefresh(30); // Auto checks every 30 seconds
    return () => {
      stopAutoRefresh();
    };
  }, []);

  const [view, setViewInternal] = useState<AppViewMode>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const h = window.location.hash;
      const p = window.location.pathname;
      if (
        sp.get('view') === 'absen' || 
        sp.get('tab') === 'absen' || 
        sp.has('quick') || 
        sp.has('workerId') || 
        p === '/absen' || 
        p === '/absensi' || 
        h.includes('absen')
      ) {
        return 'absen';
      }
      if (sp.get('view') === 'pinjaman' || sp.get('tab') === 'pinjaman') {
        return 'pinjaman';
      }
      if (sp.get('view') === 'bulanan' || sp.get('tab') === 'bulanan' || sp.get('view') === 'agenda' || sp.get('tab') === 'agenda') {
        return 'bulanan';
      }
      if (sp.get('view') === 'menu_alat') {
        return 'menu_alat';
      }
      if (sp.get('view') === 'pengaturan') {
        return 'pengaturan';
      }
      if (sp.get('view') === 'drive_storage') {
        return 'drive_storage';
      }
      const saved = sessionStorage.getItem('NUSANTARA_ACTIVE_VIEW');
      if (saved === 'agenda') return 'bulanan';
      if (saved) return saved as AppViewMode;
    } catch (e) {}
    return 'list';
  });

  const [previousView, setPreviousView] = useState<AppViewMode>('list');
  const [bulananInitialTab, setBulananInitialTab] = useState<'recurring' | 'agenda'>('recurring');

  const [memoSubmissionTarget, setMemoSubmissionTarget] = useState<Submission | null>(null);
  const [targetAccurateSubmission, setTargetAccurateSubmission] = useState<Submission | null>(null);

  const setView = (
    newView: AppViewMode,
    options?: { preservePrevious?: boolean }
  ) => {
    // ⚡ Proactively refresh and extend Google Drive token silently when user switches view
    triggerGoogleDriveAutoRefresh('menu-switch-' + newView, false, false).catch(() => {});

    setViewInternal((current) => {
      if (current !== newView && current !== 'form' && current !== 'print' && !options?.preservePrevious) {
        setPreviousView(current);
        try { sessionStorage.setItem('NUSANTARA_PREVIOUS_VIEW', current); } catch (e) {}
      }
      try { sessionStorage.setItem('NUSANTARA_ACTIVE_VIEW', newView); } catch (e) {}
      return newView;
    });
  };

  // ⚡ Otomatis membaca database penyimpanan di Firebase & menyegarkan token Google Drive ketika menu terkait dibuka
  useEffect(() => {
    // Keep Google Drive token alive and ready across all view changes
    triggerGoogleDriveAutoRefresh('view-' + view, false, false).catch(() => {});

    if (view === 'npwp' || view === 'pph23') {
      loadNpwpRecordsFromFirestore()
        .then(records => {
          if (records && records.length > 0) {
            setNpwpRecords(records);
            localStorage.setItem('npwp_records_v1', JSON.stringify(records));
            console.log(`☁️ [Auto-Fetch] ${records.length} data NPWP berhasil dibaca langsung dari Firebase Firestore.`);
          }
        })
        .catch(err => console.warn('Auto-read NPWP from Firestore failed:', err));
    } else if (view === 'sppd') {
      loadSppdRecordsFromFirestore()
        .then(records => {
          if (records && records.length > 0) {
            setSppdRecords(records);
            localStorage.setItem('sppd_records_v1', JSON.stringify(records));
            console.log(`☁️ [Auto-Fetch] ${records.length} data SPPD berhasil dibaca langsung dari Firebase Firestore.`);
          }
        })
        .catch(err => console.warn('Auto-read SPPD from Firestore failed:', err));
    } else if (view === 'list') {
      // Realtime Firestore listener + reconciliation keep 'submissions' automatically synchronized across all devices
    } else if (view === 'absen' || view === 'pinjaman') {
      Promise.all([
        loadAttendanceFromFirestore().catch(() => null),
        loadWorkersFromFirestore().catch(() => [])
      ])
        .then(([res, masterWorkers]) => {
          const deletedIds = getDeletedWorkerIds();
          const mergedWorkers = mergeWorkerListsSafely(
            masterWorkers || [],
            res?.workers || [],
            deletedIds
          );
          if (mergedWorkers.length > 0) {
            localStorage.setItem('karyawan_uang_makan', JSON.stringify(mergedWorkers));
            localStorage.setItem('workers_v1', JSON.stringify(mergedWorkers));
            window.dispatchEvent(new CustomEvent('nmsa-workers-updated', { detail: { workers: mergedWorkers } }));
          }
          if (res) {
            if (res.attendanceRecords && res.attendanceRecords.length > 0) {
              localStorage.setItem('absensi_uang_makan_records', JSON.stringify(res.attendanceRecords));
            }
            if (res.weeklyReports && res.weeklyReports.length > 0) {
              localStorage.setItem('weekly_reports_nmsa', JSON.stringify(res.weeklyReports));
              localStorage.setItem('weekly_reports', JSON.stringify(res.weeklyReports));
              localStorage.setItem('laporan_uang_makan_log', JSON.stringify(res.weeklyReports));
            }
            console.log(`☁️ [Auto-Fetch] ${mergedWorkers.length} data karyawan & ${(res.attendanceRecords || []).length} absensi berhasil dibaca langsung dari Firebase.`);
          }
        })
        .catch(err => console.warn('Auto-read Attendance from Firestore failed:', err));
    } else if (view === 'bulanan') {
      loadMonthlyTransactionsFromFirestore()
        .then(cloudRes => {
          if (cloudRes) {
            const mergedDel = Array.from(new Set([...deletedMonthlyIds, ...(cloudRes.deletedIds || [])]));
            setDeletedMonthlyIds(mergedDel);
            setMonthlyTransactions(prev => {
              const merged = mergeMonthlyListsSafely(prev, cloudRes.items || [], mergedDel);
              try {
                localStorage.setItem(STORAGE_KEY_MONTHLY_TRANSACTIONS, JSON.stringify(merged));
                localStorage.setItem('nmsa_monthly_deleted_ids_v1', JSON.stringify(mergedDel));
              } catch (_) {}
              return merged;
            });
          }
        })
        .catch(err => console.warn('Auto-read Monthly transactions from Firestore failed:', err));
    }
  }, [view]);

  // Handlers for Project & RAB Management
  const handleSaveProject = async (project: Project) => {
    setProjects(prev => {
      const existingIdx = prev.findIndex(p => p.id === project.id);
      const updated = existingIdx >= 0 
        ? prev.map(p => p.id === project.id ? { ...p, ...project, updatedAt: new Date().toISOString() } : p)
        : [project, ...prev];
      try { localStorage.setItem('nmsa_projects_v1', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project })
      });
    } catch (e) {
      console.warn('Gagal sinkronisasi proyek ke server:', e);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    setProjects(prev => {
      const updated = prev.filter(p => p.id !== projectId);
      try { localStorage.setItem('nmsa_projects_v1', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    setProjectRab(prev => {
      const updated = prev.filter(r => r.projectId !== projectId);
      try { localStorage.setItem('nmsa_project_rab_v1', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    setProjectExpenses(prev => {
      const updated = prev.filter(e => e.projectId !== projectId);
      try { localStorage.setItem('nmsa_project_expenses_v1', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    try {
      await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Gagal menghapus proyek di server:', e);
    }
  };

  const handleSaveRabItem = async (item: ProjectRabItem) => {
    setProjectRab(prev => {
      const existingIdx = prev.findIndex(r => r.id === item.id);
      const updated = existingIdx >= 0
        ? prev.map(r => r.id === item.id ? { ...r, ...item, updatedAt: new Date().toISOString() } : r)
        : [...prev, item];
      try { localStorage.setItem('nmsa_project_rab_v1', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    try {
      await fetch(`/api/projects/${item.projectId}/rab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item })
      });
    } catch (e) {
      console.warn('Gagal sinkronisasi pos RAB ke server:', e);
    }
  };

  const handleDeleteRabItem = async (itemId: string, projectId: string) => {
    setProjectRab(prev => {
      const updated = prev.filter(r => r.id !== itemId);
      try { localStorage.setItem('nmsa_project_rab_v1', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    try {
      await fetch(`/api/projects/${projectId}/rab/${itemId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Gagal menghapus pos RAB di server:', e);
    }
  };

  const handleSaveExpense = async (expense: ProjectExpense) => {
    setProjectExpenses(prev => {
      const existingIdx = prev.findIndex(e => e.id === expense.id);
      const updated = existingIdx >= 0
        ? prev.map(e => e.id === expense.id ? { ...e, ...expense } : e)
        : [expense, ...prev];
      try { localStorage.setItem('nmsa_project_expenses_v1', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    if (expense.rabItemId) {
      setProjectRab(prev => {
        const updated = prev.map(r => {
          if (r.id === expense.rabItemId) {
            return {
              ...r,
              actualSpent: (Number(r.actualSpent) || 0) + (Number(expense.amount) || 0),
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        try { localStorage.setItem('nmsa_project_rab_v1', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
    }

    try {
      await fetch(`/api/projects/${expense.projectId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense })
      });
    } catch (e) {
      console.warn('Gagal sinkronisasi pengeluaran proyek ke server:', e);
    }
  };

  const handleDeleteExpense = async (expenseId: string, projectId: string) => {
    const existing = projectExpenses.find(e => e.id === expenseId);
    if (existing && existing.rabItemId) {
      setProjectRab(prev => {
        const updated = prev.map(r => {
          if (r.id === existing.rabItemId) {
            return {
              ...r,
              actualSpent: Math.max(0, (Number(r.actualSpent) || 0) - (Number(existing.amount) || 0)),
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        try { localStorage.setItem('nmsa_project_rab_v1', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
    }

    setProjectExpenses(prev => {
      const updated = prev.filter(e => e.id !== expenseId);
      try { localStorage.setItem('nmsa_project_expenses_v1', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    try {
      await fetch(`/api/projects/${projectId}/expenses/${expenseId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Gagal menghapus pengeluaran proyek di server:', e);
    }
  };

  // Auto restore scroll position when returning to list view
  useEffect(() => {
    if (view === 'list') {
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
    }
  }, [view]);

  const [targetSppdId, setTargetSppdId] = useState<string | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  // Pengaman otomatis: jika view print aktif tetapi tidak ada submission aktif, segera kembali ke daftar Voucher HO
  useEffect(() => {
    if (view === 'print' && !activeSubmission) {
      setViewInternal('list');
    }
  }, [view, activeSubmission]);

  // Selalu sinkronkan activeSubmission saat submissions array diperbarui (agar pratinjau cetak & barcode langsung mutakhir)
  useEffect(() => {
    if (activeSubmission) {
      const fresh = submissions.find(s => s.id === activeSubmission.id);
      if (fresh && fresh !== activeSubmission) {
        setActiveSubmission(fresh);
      }
    }
  }, [submissions]);

  const handleOpenSppdEditor = (sub: Submission) => {
    try {
      const stored = localStorage.getItem('sppd_records_v1');
      const list = stored ? JSON.parse(stored) : [];
      const match = list.find((s: any) => s.submissionId === sub.id || (s.noSppd && sub.notes?.includes(s.noSppd)));
      if (match) {
        setTargetSppdId(match.id);
      } else {
        setTargetSppdId(sub.id);
      }
    } catch (e) {
      setTargetSppdId(sub.id);
    }
    setView('sppd');
  };
  const [printInitialTab, setPrintInitialTab] = useState<'both' | 'pengajuan' | 'pengeluaran' | 'lampiran' | 'slip_gaji' | 'sppd_sheet' | 'only_invoice_payment' | 'lembar_cicilan'>('both');
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null);
  const [authUser, setAuthUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isFirebaseMigrationOpen, setIsFirebaseMigrationOpen] = useState(false);
  const [isGoogleDriveSettingsOpen, setIsGoogleDriveSettingsOpen] = useState(false);
  const [driveSettingsInitialTab, setDriveSettingsInitialTab] = useState<'whitelist' | 'manual-token' | 'overview'>('whitelist');
  const [driveSettingsTargetEmail, setDriveSettingsTargetEmail] = useState<string>('');
  const [isFirebaseQuotaModalOpen, setIsFirebaseQuotaModalOpen] = useState(false);
  const [uploadBuktiModalSub, setUploadBuktiModalSub] = useState<Submission | null>(null);
  const [isUploadBuktiModalOpen, setIsUploadBuktiModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isExportImportModalOpen, setIsExportImportModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isCleanFirestoreModalOpen, setIsCleanFirestoreModalOpen] = useState(false);
  const [isDriveDeduplicateModalOpen, setIsDriveDeduplicateModalOpen] = useState(false);
  const [masterDriveEmail, setMasterDriveEmailState] = useState<string>(() => getMasterDriveEmail());

  // Multi-Company switching handler with strictly segregated Firestore & local storage
  const handleSwitchCompany = async (newCompanyId: string, newCompanyName: string) => {
    const cleanId = newCompanyId.toLowerCase().trim();
    setActiveCompanyId(cleanId);
    try {
      localStorage.setItem('NUSANTARA_ACTIVE_COMPANY_ID', cleanId);
      localStorage.setItem('NUSANTARA_ACTIVE_COMPANY_NAME', newCompanyName);
    } catch (e) {}

    try {
      // 1. Fetch company profile details from Firestore
      let compDetails = await getCompanyProfileFromFirestore(cleanId);
      if (!compDetails) {
        compDetails = {
          id: cleanId,
          code: cleanId.toUpperCase(),
          name: newCompanyName,
          fullName: newCompanyName,
          displayName: newCompanyName,
          defaultJenis: 'Operasional Kantor',
          defaultKode: `BKK-${cleanId.toUpperCase()}/V/2026/10001`,
          defaultLokasi: 'Lt. 1',
          no_invoice_prefix: `BKK-${cleanId.toUpperCase()}`,
          sigAccounting: 'Sri Ekowati',
          sigAccountingJabatan: 'Manager Keuangan',
          sigDibuat: userProfile?.fullName || 'Nur Wahyudi',
          sigDibuatJabatan: 'Staff Operasional',
          sigDirKeuangan: 'Harijon',
          sigDirektur: 'H. Andi Nursyam Halid',
          sigDirekturJabatan: 'Direktur Utama',
          sigDisetujui: 'Harijon',
          sigDisetujuiJabatan: 'Direktur Keuangan',
          sigDiverifikasi: 'Andi Muhammad Rifki',
          sigDiverifikasiJabatan: 'Direktur',
          sigMengetahui: 'ABDUL AZIZ HALID',
          sigMengetahuiJabatan: 'Direktur Operasional',
          sigKeuangan: 'Sri Ekowati',
          icon: '🏢',
          isActive: true
        };
      }

      // 2. Update user profile state
      const updatedProfile = {
        ...(userProfile || {}),
        companyId: cleanId,
        companyName: newCompanyName,
        companyLogoUrl: compDetails?.logoUrl || userProfile?.companyLogoUrl || '',
        companyDetails: compDetails
      };
      setUserProfile(updatedProfile);

      // 3. Persist to active user document in Firestore if logged in
      if (authUser?.uid) {
        try {
          await switchUserCompany(authUser.uid, cleanId, newCompanyName);
        } catch (e) {
          console.warn('switchUserCompany non-fatal:', e);
        }
      }

      // 4. Fetch submissions from Cloud Firestore with timestamp-aware local & server backup merge
      const cloudRes = await loadSubmissionsFromFirestoreSafe(cleanId);
      if (cloudRes.ok) {
        updateCloudInventoryFromList(cloudRes.list);
      } else {
        resetCloudInventory();
      }
      const delIds = getLocalDeletedSubmissionIds();
      const localSubs = loadAllLocalSubmissionsForCompany(cleanId);
      const serverSubs = serverBackupSubmissionsRef.current.filter(
        (s) => normalizeCompanyKey(s.companyId) === normalizeCompanyKey(cleanId)
      );
      const companySubmissions = mergeSubmissionsSafely(
        [serverSubs, localSubs, cloudRes.ok ? cloudRes.list : []],
        delIds
      );
      if (companySubmissions.length > 0) {
        persistSubmissionsToLocalCaches(companySubmissions, cleanId);
      }
      setSubmissions(companySubmissions);

      // 5. Activity log
      try {
        await saveActivityLogToFirestore(
          'Ganti Perusahaan',
          `Beralih ke ruang kerja perusahaan ${newCompanyName} (${cleanId.toUpperCase()}). Database voucher dimuat terpisah (${companySubmissions.length} transaksi).`,
          'info',
          undefined,
          undefined,
          updatedProfile
        );
      } catch (e) {}

      console.log(`✅ Berhasil beralih ke perusahaan: ${cleanId}, memuat ${companySubmissions.length} transaksi.`);
    } catch (err) {
      console.error('Gagal beralih perusahaan:', err);
    }
  };

  useEffect(() => {
    const handleDriveUpdated = () => {
      setMasterDriveEmailState(getMasterDriveEmail());
    };
    window.addEventListener('nusantara-drive-updated', handleDriveUpdated);
    return () => {
      window.removeEventListener('nusantara-drive-updated', handleDriveUpdated);
    };
  }, []);
  
  const [layoutMode, setLayoutMode] = useState<'standard' | 'spreadsheet' | 'audit_logs' | 'invoice_recap' | 'unpaid_outstanding' | 'petty_cash_recap'>(() => {
    try {
      const saved = sessionStorage.getItem('sublist_layoutMode');
      if (saved === 'spreadsheet' || saved === 'audit_logs' || saved === 'unpaid_outstanding') return 'standard';
      return (saved as any) || 'standard';
    } catch (e) {
      return 'standard';
    }
  });

  const unpaidCount = useMemo(() => {
    return submissions.filter(sub => {
      const subStatus = sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas');
      return subStatus === 'Belum Lunas';
    }).length;
  }, [submissions]);

  const pettyCashCount = useMemo(() => {
    return submissions.filter(sub => isPettyCashSubmission(sub)).length;
  }, [submissions]);

  const agendaDueCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return agendaItems.filter(item => item.status === 'pending' && item.dueDate <= today).length;
  }, [agendaItems]);

  const pendingMonthlySummary = useMemo(
    () => getPendingMonthlySummary(monthlyTransactions, submissions, userProfile?.companyId),
    [monthlyTransactions, submissions, userProfile?.companyId]
  );

  const handleCreateVoucherFromMonthly = (item: MonthlyRecurringTransaction, targetMonth: string) => {
    const todayParts = getJakartaTodayParts();
    const defaultDate = targetMonth === todayParts.monthKey ? todayParts.dateStr : `${targetMonth}-01`;
    setEditingSubmission({
      id: '',
      kode: 'HO',
      tanggal: defaultDate,
      jenisPengajuan: item.category || 'Biaya Operasional',
      dibayarkanKepada: item.recipient || item.title,
      dibayarkanDengan: item.paymentMethod || 'Cek/Transfer',
      status: 'Belum Lunas',
      notes: item.notes || `Pembayaran rutin bulanan (${targetMonth}): ${item.title}`,
      recurringTemplateId: item.id,
      recurringMonth: targetMonth,
      items: [
        {
          id: 'it-1',
          item: item.title,
          jumlahVolume: '1 Bulan',
          harga: item.defaultAmount || 0,
          total: item.defaultAmount || 0,
          keterangan: `Tagihan rutin periode ${targetMonth}`,
        },
      ],
    } as any);
    setPreviousView('bulanan');
    setView('form');
  };

  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  const [sharedSubmission, setSharedSubmission] = useState<Submission | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [sharedError, setSharedError] = useState('');

  const getSharedId = (hash: string, path: string) => {
    // 1. From URL search params ?id=...
    try {
      const sp = new URLSearchParams(window.location.search);
      const qId = sp.get('id');
      if (qId) return qId;
      if (sp.has('transaksi') || sp.has('nominal')) {
        return `sub-shared-${Date.now()}`;
      }
    } catch (e) {}

    // 2. From hash (e.g. #/shared-view?id=... or #shared-view/...)
    if (hash.includes('shared-view') || hash.includes('voucher') || hash.includes('transaksi') || hash.includes('shared')) {
      const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/) || hash.match(/(?:shared-view|voucher|transaksi|shared)\/([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        return idMatch[1];
      }
      const parts = hash.split('shared-view/');
      if (parts[1]) {
        return parts[1].split('?')[0];
      }
    }

    // 3. From path (e.g. /shared-view/:id or /voucher/:id)
    const pathMatch = path.match(/\/(?:shared-view|voucher|shared|transaksi)\/([a-zA-Z0-9_-]+)/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    return null;
  };

  useEffect(() => {
    const sharedId = getSharedId(currentHash, currentPath);
    if (!sharedId) {
      setSharedSubmission(null);
      return;
    }

    setIsLoadingShared(true);
    setSharedError('');

    const resolveSubmission = async () => {
      const cleanTargetId = String(sharedId).toLowerCase().trim();

      // Tier 1: Check memory submissions state
      const memoryMatch = submissions.find(s => 
        String(s.id).toLowerCase().trim() === cleanTargetId ||
        String(s.kode).toLowerCase().trim() === cleanTargetId
      );
      if (memoryMatch) {
        setSharedSubmission(memoryMatch);
        setIsLoadingShared(false);
        return;
      }

      // Tier 2: Firestore Cloud Query
      try {
        const firestoreSub = await getSubmissionFromFirestore(sharedId);
        if (firestoreSub) {
          setSharedSubmission(firestoreSub);
          setIsLoadingShared(false);
          return;
        }
      } catch (fsErr) {
        console.warn('Firestore fetch error for shared submission:', fsErr);
      }

      // Tier 4: Server API endpoint /api/submissions/:id
      try {
        const apiRes = await fetch(`/api/submissions/${encodeURIComponent(sharedId)}`);
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (apiData?.submission) {
            setSharedSubmission(apiData.submission);
            setIsLoadingShared(false);
            return;
          }
        }
      } catch (apiErr) {
        console.warn('API fetch error for shared submission:', apiErr);
      }

      // Tier 5: Check backend shared-state
      try {
        const ssRes = await fetch('/api/shared-state');
        if (ssRes.ok) {
          const ssData = await ssRes.json();
          const stateSub = (ssData?.submissions || []).find((s: any) => 
            String(s.id).toLowerCase().trim() === cleanTargetId ||
            String(s.kode).toLowerCase().trim() === cleanTargetId
          );
          if (stateSub) {
            setSharedSubmission(stateSub);
            setIsLoadingShared(false);
            return;
          }
        }
      } catch (ssErr) {}

      // Tier 6: High-Resilience URL Parameter Fallback
      // When shared via link containing ?id=...&kode=...&transaksi=...&nominal=..., synthesize official voucher
      try {
        const sp = new URLSearchParams(window.location.search);
        const transaksiParam = sp.get('transaksi');
        const nominalParam = sp.get('nominal');
        const kodeParam = sp.get('kode');
        const idParam = sp.get('id') || sharedId;

        if (transaksiParam || nominalParam || kodeParam || idParam) {
          const rawNom = Number(nominalParam) || 0;
          const formattedJenis = (transaksiParam || 'Biaya Transaksi')
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

          const numericId = String(idParam).replace(/[^0-9]/g, '');
          const generatedCode = kodeParam || (idParam.toUpperCase().startsWith('DOC-') || idParam.toUpperCase().startsWith('VCR-') 
            ? idParam.toUpperCase() 
            : `VCR-${numericId ? numericId.slice(-6) : Date.now().toString().slice(-6)}`);

          const fallbackSubmission: Submission = {
            id: idParam || `sub-${Date.now()}`,
            kode: generatedCode,
            tanggal: sp.get('tanggal') || new Date().toISOString().split('T')[0],
            jenisPengajuan: formattedJenis,
            dibayarkanKepada: sp.get('kepada') || 'Pihak Terkait / Rekanan',
            dibayarkanDengan: (sp.get('bayar') as any) || 'Cek/Transfer',
            lokasi: 'Head Office',
            diajukanOleh: 'Sri Ekowati',
            diajukanJabatan: 'Manager Keuangan',
            dibuatOleh: 'Nur Wahyudi',
            diverifikasiOleh: 'Andi Muhammad Rifki',
            diverifikasiJabatan: 'Direktur',
            disetujuiOleh: 'Direktur Utama',
            disetujuiOleh2: 'Harijon',
            disetujuiJabatan2: 'Direktur Keuangan',
            dibukukanOleh: 'Sri Ekowati',
            dibukukanJabatan: 'Accounting',
            mengetahuiOleh: 'ABDUL AZIZ HALID',
            mengetahuiJabatan: 'Direktur Operasional',
            diketahuiOleh: 'Direksi',
            createdAt: new Date().toISOString(),
            items: (() => {
              const itemsParam = sp.get('items');
              if (itemsParam) {
                try {
                  const arr = JSON.parse(decodeURIComponent(itemsParam));
                  if (Array.isArray(arr) && arr.length > 0) {
                    return arr.map((it: any, idx: number) => ({
                      id: `item-${idx + 1}`,
                      no: idx + 1,
                      item: it.item || it.nama || formattedJenis,
                      jumlahVolume: it.volume || it.jumlahVolume || '1 Item',
                      total: Number(it.total) || Number(it.nominal) || 0,
                      keterangan: it.keterangan || '-'
                    }));
                  }
                } catch (e) {}
              }
              return [
                {
                  id: `item-${Date.now()}`,
                  no: 1,
                  item: formattedJenis,
                  jumlahVolume: '1 Dokumen',
                  total: rawNom,
                  keterangan: 'Dokumen Transaksi'
                }
              ];
            })(),
            status: (sp.get('status') as any) || 'Lunas',
            notes: 'Dokumen transaksi resmi PT Nusantara Mineral Sukses Abadi.'
          };

          setSharedSubmission(fallbackSubmission);
          setIsLoadingShared(false);
          return;
        }
      } catch (fallbackErr) {}

      setSharedError('Maaf, dokumen transaksi tidak ditemukan atau sudah dihapus dari server cloud.');
      setIsLoadingShared(false);
    };

    resolveSubmission();
  }, [currentHash, currentPath, submissions.length]);

  // Synchronous route popstate and hashchange tracking
  useEffect(() => {
    const handleNavigation = () => {
      setCurrentPath(window.location.pathname);
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
    return () => {
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('hashchange', handleNavigation);
    };
  }, []);

  // Sync view to 'absen' if attendance path/params are in URL
  useEffect(() => {
    const sParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const hasWorkerOrAbsen = 
      sParams.has('workerId') || 
      sParams.has('id') || 
      sParams.has('quick') || 
      sParams.get('view') === 'absen' || 
      sParams.get('tab') === 'absen' ||
      sParams.has('absen');

    const isAbsen = 
      currentPath === '/absen' || 
      currentPath === '/absensi' || 
      currentPath === '/absen-mandiri' ||
      currentHash.includes('absen') || 
      currentHash.includes('absensi') ||
      hasWorkerOrAbsen;

    if (isAbsen && view !== 'absen') {
      setView('absen');
    }
  }, [currentPath, currentHash]);

  const navigateTo = (path: string) => {
    if (path === '/') {
      window.history.pushState({}, '', '/');
      window.location.hash = '';
      setCurrentPath('/');
      setCurrentHash('');
    } else if (path.startsWith('#')) {
      window.location.hash = path;
      setCurrentHash(path);
    } else {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      setCurrentHash('');
    }
  };

  // Listen to Firebase Auth status and load/clear data accordingly
  useEffect(() => {
    // Check if current tab is a public portal (form pinjaman, SPPD publik, absen mandiri, shared voucher)
    const pPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const pHash = typeof window !== 'undefined' ? window.location.hash : '';
    const pSearch = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const isPublicPortalUrl = Boolean(
      pPath === '/pinjaman-karyawan' || pPath === '/form-pinjaman' || pPath === '/loan-form' ||
      pHash.includes('pinjaman-karyawan') || pHash.includes('form-pinjaman') || pHash.includes('loan-form') ||
      pPath === '/input-sppd' || pPath === '/sppd-form' ||
      pHash.includes('input-sppd') || pHash.includes('sppd-form') ||
      pPath === '/absen' || pPath === '/absensi' || pPath === '/absen-mandiri' ||
      pHash.includes('absen') || pHash.includes('absensi') || pHash.includes('shared-view') ||
      pPath.includes('shared-view') || pPath.includes('/voucher') || pPath.includes('/transaksi') || pPath.includes('/shared') ||
      pHash.includes('voucher') || pHash.includes('transaksi') ||
      pSearch.has('workerId') || pSearch.has('quick') || pSearch.get('view') === 'absen' || pSearch.get('tab') === 'absen' ||
      pSearch.has('transaksi') || pSearch.has('nominal') || pSearch.has('kode') || pSearch.has('id')
    );

    // Elegant shared terminal/device logic:
    // If the browser session is fresh (all tabs closed and reopened), prevent auto-login by logging out first.
    // Preserves active logins across page reloads (F5) and NEVER logs out when opening public portals or another tab while a tab is active!
    const hasActiveSession = sessionStorage.getItem('NUSANTARA_SESSION_ACTIVE') === 'true';
    const lastHeartbeat = Number(localStorage.getItem('NUSANTARA_ACTIVE_TAB_HEARTBEAT') || '0');
    const hasLiveOtherTab = lastHeartbeat > 0 && (Date.now() - lastHeartbeat) < 15000;

    let isDisposed = false;
    let unsubscribe: (() => void) | null = null;
    const heartbeatTimer = window.setInterval(() => {
      if (!isPublicPortalUrl && sessionStorage.getItem('NUSANTARA_SESSION_ACTIVE') === 'true') {
        try {
          localStorage.setItem('NUSANTARA_ACTIVE_TAB_HEARTBEAT', String(Date.now()));
        } catch (_) {}
      }
    }, 4000);

    const setupAuthLifecycle = async () => {
      // Wait for explicit logout BEFORE attaching auth listener so Firestore listeners don't race with signOut
      if (!isPublicPortalUrl && !hasActiveSession && !hasLiveOtherTab) {
        await logoutFromFirebase().catch(() => {});
      }
      if (isDisposed) return;

      unsubscribe = registerAuthChangeListener(async (user) => {
        if (isDisposed) return;
        setAuthUser(user);
        if (!user) {
          setUserProfile(null);
          setIsInitialReconcileDone(false);
          setIsCloudSyncing(false);
          // DO NOT implicitly delete localStorage or empty submissions here.
        } else {
          setIsInitialReconcileDone(false);
          // Mark session as active to prevent force-logout during same-tab refreshes and sibling tabs
          if (!isPublicPortalUrl) {
            sessionStorage.setItem('NUSANTARA_SESSION_ACTIVE', 'true');
            try {
              localStorage.setItem('NUSANTARA_ACTIVE_TAB_HEARTBEAT', String(Date.now()));
            } catch (_) {}
          }

          // Determine cached company fallback immediately
          const storedActiveCompId = localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_ID');
          let companyId = (storedActiveCompId || 'nmsa').toLowerCase().trim();
          setActiveCompanyId(companyId);

          // Fetch user & company profiles with timeout protection
          let profile = await getUserProfileFromFirestore(user.uid).catch(() => null);
          if (!profile) {
            profile = {
              fullName: user.email === 'admin@nmsa.com' ? 'Nur Wahyudi' : user.email?.split('@')[0] || 'User',
              role: user.email === 'admin@nmsa.com' ? 'Accounting' : 'User',
              email: user.email,
              companyId: companyId,
              companyName: 'PT Nusantara Mineral Sukses Abadi'
            };
          }

          companyId = (storedActiveCompId || profile.companyId || 'nmsa').toLowerCase().trim();
          setActiveCompanyId(companyId);

          let companyDetails = await getCompanyProfileFromFirestore(companyId).catch(() => null);
          if (!companyDetails) {
            companyDetails = {
              id: companyId,
              code: companyId.toUpperCase(),
              name: companyId === 'nmsa' ? 'PT Nusantara Mineral Sukses Abadi' : companyId.toUpperCase(),
              fullName: companyId === 'nmsa' ? 'PT. Nusantara Mineral Sukses Abadi' : companyId.toUpperCase(),
              defaultJenis: 'Operasional Kantor',
              defaultKode: `BKK-${companyId.toUpperCase()}/V/2026/10001`,
              defaultLokasi: 'Lt.1',
              displayName: `Invoice-${companyId.toUpperCase()}`,
              icon: '🏢',
              isActive: true,
              no_invoice_prefix: `BKK-${companyId.toUpperCase()}`,
              sigAccounting: 'Sri Ekowati',
              sigDibuat: 'Nur Wahyudi',
              sigDirKeuangan: 'Harijon',
              sigDirektur: 'Andi Nursyam Halid',
              sigDisetujui: 'Harijon',
              sigKeuangan: 'Andi Dhiya Salsabila'
            };
          }

          if (isDisposed) return;
          const combinedProfile = {
            ...profile,
            companyId,
            companyName: companyDetails.name || companyDetails.fullName || 'PT Nusantara Mineral Sukses Abadi',
            companyLogoUrl: companyDetails?.logoUrl || profile?.companyLogoUrl || '',
            companyDetails
          };
          setUserProfile(combinedProfile);

          // Load submissions safely from Cloud Firestore with timeout & server/local backup preservation
          try {
            setIsCloudSyncing(true);
            const [, cloudRes] = await withTimeout(
              Promise.all([
                ensureServerBackupLoaded(),
                loadSubmissionsFromFirestoreSafe(companyId),
              ]),
              14000,
              'Sinkronisasi awal transaksi'
            );
            if (isDisposed) return;
            const delIds = getLocalDeletedSubmissionIds();
            const localBackup = loadAllLocalSubmissionsForCompany(companyId);
            const serverBackup = serverBackupSubmissionsRef.current.filter(
              (s) => normalizeCompanyKey(s.companyId) === normalizeCompanyKey(companyId)
            );
            const currentCompSubs = submissionsRef.current.filter(
              (s) => s?.id && normalizeCompanyKey(s.companyId) === normalizeCompanyKey(companyId)
            );
            const bestBackup = mergeSubmissionsSafely(
              [serverBackup, localBackup, currentCompSubs],
              delIds
            );

            if (cloudRes.ok) {
              updateCloudInventoryFromList(cloudRes.list);
            } else {
              resetCloudInventory();
            }

            if (cloudRes.ok && cloudRes.list.length > 0) {
              const combined = mergeSubmissionsSafely([bestBackup, cloudRes.list], delIds);
              persistSubmissionsToLocalCaches(combined, companyId);
              setSubmissions(combined);
              setCloudSyncNotice((prev) =>
                prev && (prev.includes('Rules') || prev.includes('terkendala') || prev.includes('tertunda')) ? null : prev
              );
            } else if (bestBackup.length > 0) {
              persistSubmissionsToLocalCaches(bestBackup, companyId);
              setSubmissions(bestBackup);
              const reason = cloudRes.errorCode === 'permission-denied'
                ? 'Akses baca Firestore dibatasi Security Rules Firebase Console'
                : cloudRes.errorCode === 'resource-exhausted'
                ? 'Kuota baca harian Firestore (Spark) sedang cooldown sementara'
                : cloudRes.errorCode === 'internal-sdk-error' || cloudRes.errorCode === 'deadline-exceeded'
                ? 'Sinkronisasi Cloud Firestore tertunda sementara (timeout/stream reset)'
                : (cloudRes.ok ? 'Firestore masih kosong (0 dokumen)' : `Koneksi Firestore terkendala (${cloudRes.error || 'offline'})`);
              setCloudSyncNotice(`⚠️ ${reason}. Menampilkan ${bestBackup.length} transaksi dari cadangan server/lokal.`);
            } else {
              setSubmissions([]);
            }
          } catch (e: any) {
            console.warn('Gagal memuat voucher dari Firestore:', e);
            const localBackup = getBestBackupForCompany(companyId);
            if (localBackup.length > 0) {
              setSubmissions(localBackup);
            }
          } finally {
            setIsCloudSyncing(false);
            setIsInitialReconcileDone(true);
          }
        }
      });
    };

    setupAuthLifecycle();

    return () => {
      isDisposed = true;
      window.clearInterval(heartbeatTimer);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Real-time Firestore listener for submissions across ALL open devices (HP, Komputer, & Preview)
  const activeCompForSync = (userProfile?.companyId || localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_ID') || 'nmsa').toLowerCase().trim();
  const activeCompNameForSync = userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi';

  const [syncListenerEpoch, setSyncListenerEpoch] = useState(0);

  const getBestBackupForCompany = (compId: string): Submission[] => {
    const targetComp = normalizeCompanyKey(compId || 'nmsa');
    const delLower = new Set(getLocalDeletedSubmissionIds().map((x) => x.toLowerCase().trim()));
    const map = new Map<string, Submission>();
    serverBackupSubmissionsRef.current.forEach((s) => {
      if (s?.id && normalizeCompanyKey(s.companyId) === targetComp) map.set(String(s.id).toLowerCase(), s);
    });
    loadAllLocalSubmissionsForCompany(targetComp).forEach((s) => {
      if (s?.id) map.set(String(s.id).toLowerCase(), s);
    });
    submissionsRef.current.forEach((s) => {
      if (s?.id && normalizeCompanyKey(s.companyId) === targetComp) map.set(String(s.id).toLowerCase(), s);
    });
    return sortSubmissionsList(
      Array.from(map.values()).filter((s) => !delLower.has(String(s.id).toLowerCase().trim()))
    );
  };

  const unsyncedSubmissionIds = useMemo(() => {
    const pendingSet = new Set(pendingFirestoreIds.map(normalizeSubId));
    const result = new Set<string>();
    submissions.forEach((sub) => {
      if (!sub?.id) return;
      const idLow = normalizeSubId(sub.id);
      if (pendingSet.has(idLow) || (hasCloudInventory && !cloudSyncedIds.has(idLow))) {
        result.add(idLow);
      }
    });
    return result;
  }, [submissions, pendingFirestoreIds, hasCloudInventory, cloudSyncedIds]);

  const handleUploadSingleToFirestore = async (sub: Submission) => {
    if (!sub?.id) return;
    const idLow = normalizeSubId(sub.id);
    setUploadingSubIds((prev) => {
      const next = new Set(prev);
      next.add(idLow);
      return next;
    });

    try {
      await resetFirestoreQuotaCooldown().catch(() => {});
      const targetComp = normalizeCompanyKey(sub.companyId || activeCompForSync || 'nmsa');
      const targetCompName = sub.companyName || activeCompNameForSync;
      const res = await saveSubmissionToFirestore(sub, targetComp, targetCompName);
      if (res.syncedToCloud) {
        addCloudSyncedIds([sub.id]);
        clearPendingFirestoreIds([sub.id]);
        setCloudSyncNotice(`☁️ Transaksi ${sub.kode || sub.dibayarkanKepada} berhasil diupload ke Firebase Firestore (${getActiveFirebaseProjectId()}).`);
        setTimeout(() => setCloudSyncNotice(null), 5000);
      } else {
        markPendingFirestoreIds([sub.id]);
        setCloudSyncNotice(`❌ Gagal upload ${sub.kode || sub.dibayarkanKepada} ke Firestore: ${res.error || 'Periksa Rules / koneksi Firebase'}`);
      }
    } catch (err: any) {
      markPendingFirestoreIds([sub.id]);
      setCloudSyncNotice(`❌ Gagal upload ke Firestore: ${err?.message || err}`);
    } finally {
      setUploadingSubIds((prev) => {
        const next = new Set(prev);
        next.delete(idLow);
        return next;
      });
    }
  };

  const handleUploadUnsyncedToFirestore = async () => {
    const unsyncedList = submissions.filter((s) => s?.id && unsyncedSubmissionIds.has(normalizeSubId(s.id)));
    const targetList = unsyncedList.length > 0 ? unsyncedList : getBestBackupForCompany(activeCompForSync);
    if (targetList.length === 0) {
      setCloudSyncNotice('✅ Semua transaksi sudah tersimpan di Firebase Firestore.');
      setTimeout(() => setCloudSyncNotice(null), 4000);
      return;
    }

    const idLows = targetList.map((s) => normalizeSubId(s.id));
    setIsCloudSyncing(true);
    setUploadingSubIds((prev) => {
      const next = new Set(prev);
      idLows.forEach((id) => next.add(id));
      return next;
    });
    setCloudSyncNotice(`☁️ Mengupload ${targetList.length} transaksi yang belum tersimpan ke Firebase Firestore (${getActiveFirebaseProjectId()})...`);

    try {
      await resetFirestoreQuotaCooldown().catch(() => {});
      const res = await restoreSubmissionsToFirestore(targetList, activeCompForSync, activeCompNameForSync);
      if (res.successCount > 0) {
        const uploadedIds = targetList.slice(0, res.successCount).map((s) => s.id);
        addCloudSyncedIds(uploadedIds);
        clearPendingFirestoreIds(uploadedIds);
        setSyncListenerEpoch((n) => n + 1);
        setCloudSyncNotice(`✅ Berhasil mengupload ${res.successCount}/${res.total} transaksi ke Firebase Firestore (${getActiveFirebaseProjectId()}).`);
        setTimeout(() => setCloudSyncNotice(null), 5000);
      } else {
        setCloudSyncNotice(`❌ Gagal upload ke Firestore: ${res.error || 'Periksa Security Rules atau login akun Firebase Console Anda.'}`);
      }
    } catch (err: any) {
      setCloudSyncNotice(`❌ Gagal upload ke Firestore: ${err?.message || err}`);
    } finally {
      setIsCloudSyncing(false);
      setUploadingSubIds((prev) => {
        const next = new Set(prev);
        idLows.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleRestoreBackupToFirestore = async () => {
    await ensureServerBackupLoaded();
    const backupList = getBestBackupForCompany(activeCompForSync);
    if (backupList.length === 0) {
      setCloudSyncNotice('⚠️ Tidak ada data cadangan yang ditemukan untuk diunggah ke Firestore.');
      return;
    }
    setIsCloudSyncing(true);
    setCloudSyncNotice(`☁️ Mengunggah ${backupList.length} data transaksi cadangan ke Firebase Firestore (${getActiveFirebaseProjectId()})...`);
    try {
      const res = await restoreSubmissionsToFirestore(backupList, activeCompForSync, activeCompNameForSync);
      if (res.successCount > 0) {
        const uploadedIds = backupList.slice(0, res.successCount).map((s) => s.id);
        addCloudSyncedIds(uploadedIds);
        clearPendingFirestoreIds(uploadedIds);
        setCloudSyncNotice(`✅ Berhasil memulihkan ${res.successCount}/${res.total} transaksi ke Firebase Firestore (${getActiveFirebaseProjectId()}).`);
        setSyncListenerEpoch((n) => n + 1);
      } else {
        setCloudSyncNotice(`❌ Gagal mengunggah ke Firestore: ${res.error || 'Periksa Rules / izin akun di Firebase Console'}. Data tetap aman tampil dari server cadangan.`);
      }
    } catch (err: any) {
      setCloudSyncNotice(`❌ Gagal upload backup ke Firestore: ${err?.message || err}`);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const forceCloudSyncInFlightRef = useRef<Promise<void> | null>(null);

  const handleForceCloudSync = async (silent: boolean = false) => {
    if (!authUser) return;
    if (forceCloudSyncInFlightRef.current) {
      return forceCloudSyncInFlightRef.current;
    }
    const run = (async () => {
      setIsCloudSyncing(true);
      if (!silent) setCloudSyncNotice('Memuat ulang seluruh voucher dari Firebase Firestore & cadangan server...');
      try {
        if (!silent) {
          await resetFirestoreQuotaCooldown().catch(() => {});
        }
        const [, cloudRes] = await withTimeout(
          Promise.all([
            ensureServerBackupLoaded(),
            loadSubmissionsFromFirestoreSafe(activeCompForSync),
          ]),
          14000,
          'Sinkronisasi cloud'
        );
        if (cloudRes.ok) {
          updateCloudInventoryFromList(cloudRes.list);
        }
        const bestBackup = getBestBackupForCompany(activeCompForSync);
        const pid = getActiveFirebaseProjectId();

        if (cloudRes.ok && cloudRes.list.length > 0) {
          const finalMerged = mergeSubmissionsSafely([bestBackup, cloudRes.list]);
          persistSubmissionsToLocalCaches(finalMerged, activeCompForSync);
          setSubmissions(finalMerged);
          setShowQuotaBanner(isFirestoreQuotaExceeded());
          if (!silent) {
            setSyncListenerEpoch((n) => n + 1);
            setCloudSyncNotice(`☁️ Tersinkron dari Firebase Firestore (${pid}): ${cloudRes.list.length} cloud, total ${finalMerged.length} voucher aktif.`);
            setTimeout(() => setCloudSyncNotice(null), 5000);
          } else {
            setCloudSyncNotice((prev) =>
              prev && (prev.includes('Rules') || prev.includes('terkendala') || prev.includes('tertunda')) ? null : prev
            );
          }
        } else {
          if (bestBackup.length > 0) {
            persistSubmissionsToLocalCaches(bestBackup, activeCompForSync);
            setSubmissions(bestBackup);
          }
          setShowQuotaBanner(isFirestoreQuotaExceeded());
          if (!silent) {
            const skipHints: string[] = [];
            if ((cloudRes.skippedByCompany || 0) > 0) {
              skipHints.push(`${cloudRes.skippedByCompany} dokumen berada di kode perusahaan lain`);
            }
            if ((cloudRes.skippedDeleted || 0) > 0) {
              skipHints.push(`${cloudRes.skippedDeleted} tersembunyi di daftar hapus lokal`);
            }
            const hintText = skipHints.length > 0 ? ` (${skipHints.join(', ')})` : '';
            const reason = cloudRes.errorCode === 'permission-denied'
              ? `Akses Firestore (${pid}) dibatasi Security Rules Firebase Console`
              : cloudRes.errorCode === 'resource-exhausted'
              ? `Kuota harian Spark Firestore (${pid}) sedang cooldown sementara`
              : cloudRes.errorCode === 'internal-sdk-error' || cloudRes.errorCode === 'deadline-exceeded'
              ? `Koneksi Cloud Firestore (${pid}) tertunda sementara (timeout/stream reset)`
              : (cloudRes.ok ? `Firestore (${pid}) mengembalikan 0 transaksi untuk PT "${activeCompForSync.toUpperCase()}"${hintText}` : `Gagal membaca Firestore (${cloudRes.error || 'periksa jaringan'})`);
            setCloudSyncNotice(`⚠️ ${reason}. Menampilkan ${bestBackup.length} transaksi dari cadangan aman.`);
          }
        }
      } catch (err: any) {
        if (!silent) {
          setCloudSyncNotice('Gagal memuat data dari Firebase Firestore: ' + (err?.message || 'Periksa jaringan'));
        }
      } finally {
        setIsCloudSyncing(false);
        forceCloudSyncInFlightRef.current = null;
      }
    })();

    forceCloudSyncInFlightRef.current = run;
    return run;
  };

  useEffect(() => {
    const onQuotaReset = () => setSyncListenerEpoch((n) => n + 1);
    const onInternalError = () => {
      setIsCloudSyncing(false);
    };
    window.addEventListener('firestore-quota-reset', onQuotaReset);
    window.addEventListener('firestore-internal-error', onInternalError);
    return () => {
      window.removeEventListener('firestore-quota-reset', onQuotaReset);
      window.removeEventListener('firestore-internal-error', onInternalError);
    };
  }, []);

  // Authenticated-only Firestore realtime subscriptions (prevents unauthenticated stream churn & ca9/b815)
  useEffect(() => {
    if (!authUser || !isInitialReconcileDone) return;

    let lastFocusSyncAt = 0;

    // 1. Submissions realtime listener
    const unsubSubs = subscribeToSubmissionsFromFirestore(activeCompForSync, (cloudSubs) => {
      updateCloudInventoryFromList(cloudSubs);
      if (cloudSubs.length === 0 && submissionsRef.current.length > 0) {
        return;
      }
      const bestBackup = getBestBackupForCompany(activeCompForSync);
      const merged = mergeSubmissionsSafely([bestBackup, cloudSubs]);
      persistSubmissionsToLocalCaches(merged, activeCompForSync);
      setSubmissions(merged);
    });

    // 2. NPWP initial load & realtime listener
    loadNpwpRecordsFromFirestore()
      .then(fsRecords => {
        if (fsRecords && fsRecords.length > 0) {
          setNpwpRecords(prev => {
            const map = new Map<string, NpwpRecord>();
            prev.forEach(r => map.set(r.id, r));
            fsRecords.forEach(r => map.set(r.id, r));
            const merged = Array.from(map.values());
            localStorage.setItem('npwp_records_v1', JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(err => console.warn('Firestore NPWP sync skipped:', err));

    const unsubscribeNpwp = subscribeToNpwpRecordsFromFirestore((records) => {
      if (records && records.length > 0) {
        setNpwpRecords(records);
      }
    });

    // 3. Monthly transactions initial load & realtime listener
    const applyCloudMonthlyUpdate = (cloudItems: MonthlyRecurringTransaction[], cloudDeletedIds: string[]) => {
      let existingLocalDeleted: string[] = [];
      try {
        const raw = localStorage.getItem('nmsa_monthly_deleted_ids_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) existingLocalDeleted = parsed.map(String);
        }
      } catch (_) {}
      const mergedDel = Array.from(new Set([...existingLocalDeleted, ...(cloudDeletedIds || []).map(String)]));
      try { localStorage.setItem('nmsa_monthly_deleted_ids_v1', JSON.stringify(mergedDel)); } catch (_) {}
      setDeletedMonthlyIds(mergedDel);
      setMonthlyTransactions(prev => {
        const merged = mergeMonthlyListsSafely(prev, cloudItems || [], mergedDel);
        try { localStorage.setItem(STORAGE_KEY_MONTHLY_TRANSACTIONS, JSON.stringify(merged)); } catch (_) {}
        return merged;
      });
    };

    loadMonthlyTransactionsFromFirestore()
      .then(cloudRes => {
        if (cloudRes) {
          applyCloudMonthlyUpdate(cloudRes.items || [], cloudRes.deletedIds || []);
        }
      })
      .catch(err => console.warn('Firestore Monthly sync skipped:', err));

    const unsubscribeMonthly = subscribeToMonthlyTransactionsFromFirestore((cloudItems, cloudDeletedIds) => {
      applyCloudMonthlyUpdate(cloudItems, cloudDeletedIds);
    });

    const handleWakeSync = (forceFullCheck: boolean = false) => {
      const now = Date.now();
      if (getPendingFirestoreSyncCount() > 0 && !isFirestoreQuotaExceeded()) {
        flushFirestoreQueue().catch(() => {});
      }
      if (!forceFullCheck && now - lastFocusSyncAt < 10 * 60 * 1000) return;
      lastFocusSyncAt = now;
      handleForceCloudSync(true).catch(() => {});
    };

    const onFocus = () => handleWakeSync(false);
    const onOnline = () => handleWakeSync(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') handleWakeSync(false);
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsubSubs();
      unsubscribeNpwp();
      unsubscribeMonthly();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authUser?.uid, activeCompForSync, syncListenerEpoch, isInitialReconcileDone]);

  // Update in-memory React state + lightweight local cache persistence
  const saveSubmissionsToStorage = (updatedList: Submission[]) => {
    if (!Array.isArray(updatedList)) {
      console.error('saveSubmissionsToStorage dipanggil dengan data non-array:', updatedList);
      return;
    }
    const sorted = sortSubmissionsList(updatedList);
    setSubmissions(sorted);
    persistSubmissionsToLocalCaches(sorted, activeCompForSync);
  };

  // Delete handler (removes from UI state, server data-store.json, Firestore, and Google Drive folder)
  const handleDelete = async (id: string, options?: { deleteDriveFolder?: boolean }) => {
    const targetSub = submissions.find(s => s.id === id);
    const shouldDeleteDrive = options?.deleteDriveFolder !== false;

    addLocalDeletedSubmissionId(id);
    clearPendingFirestoreIds([id]);
    setCloudSyncedIds((prev) => {
      const next = new Set(prev);
      next.delete(normalizeSubId(id));
      return next;
    });
    const updated = submissions.filter((sub) => sub.id !== id);
    saveSubmissionsToStorage(updated);

    // Hapus juga dari data-store.json backend & catat tombstone
    fetch(`/api/sync-submissions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch((err) => console.warn('Gagal hapus voucher dari backup server:', err));

    // Auto-delete Google Drive folder if enabled (searches by folderId, attachments, standard name, kode, or voucher number)
    if (targetSub && shouldDeleteDrive) {
      const targetLabel = targetSub.kode || targetSub.dibayarkanKepada || targetSub.id;
      setCloudSyncNotice(`🗑️ Voucher "${targetLabel}" dihapus. Sedang mencari & menghapus folder di Google Drive...`);
      deleteSubmissionDriveFolder(targetSub).then((res) => {
        if (res.success) {
          console.log(`[Auto-Sync] ${res.message}`);
          setCloudSyncNotice(`✅ Voucher "${targetLabel}" & folder Google Drive "${res.folderName || ''}" berhasil dihapus.`);
          setTimeout(() => setCloudSyncNotice(null), 6000);
        } else {
          console.log(`[Auto-Sync] Info folder Drive: ${res.message}`);
          if (res.needsAuth) {
            setCloudSyncNotice(`⚠️ Voucher "${targetLabel}" terhapus dari sistem, namun Google Drive belum terhubung/berizin penuh untuk menghapus foldernya (${res.message}).`);
          } else {
            setCloudSyncNotice(`ℹ️ Voucher "${targetLabel}" terhapus. ${res.message}`);
            setTimeout(() => setCloudSyncNotice(null), 6000);
          }
        }
      }).catch((err) => {
        console.warn('Gagal menghapus folder Google Drive saat menghapus transaksi:', err);
        setCloudSyncNotice(`⚠️ Voucher "${targetLabel}" terhapus, namun gagal menghapus folder Google Drive: ${err?.message || err}`);
      });
    } else if (targetSub) {
      setCloudSyncNotice(`✅ Voucher "${targetSub.kode || targetSub.dibayarkanKepada}" dihapus dari aplikasi (folder Drive dipertahankan).`);
      setTimeout(() => setCloudSyncNotice(null), 4000);
    }

    // Re-sync pinjaman jika transaksi yang dihapus merupakan pinjaman
    if (targetSub && isLoanSubmission(targetSub)) {
      try {
        const currentLoans = getSavedEmployeeLoans();
        const cleanedLoans = currentLoans.map(l => {
          const disbList = (l.disbursements || []).filter(d => d.submissionId !== id && d.kodeDokumen !== targetSub.kode);
          const totalFromDisbursements = disbList.reduce((sum, d) => sum + (Number(d.jumlah) || 0), 0);
          return {
            ...l,
            disbursements: disbList,
            jumlahPinjaman: disbList.length > 0 ? totalFromDisbursements : l.jumlahPinjaman,
            linkedSubmissionId: l.linkedSubmissionId === id ? undefined : l.linkedSubmissionId,
            linkedSubmissionKode: l.linkedSubmissionKode === targetSub.kode ? undefined : l.linkedSubmissionKode
          };
        });
        saveEmployeeLoans(cleanedLoans);
      } catch (e) {}
    }

    if (isFirebaseConfigured()) {
      try {
        await deleteSubmissionFromFirestore(id);
      } catch (err: any) {
        console.warn('Gagal menghapus voucher di Firebase Firestore:', err);
      }
    }

    if (targetSub) {
      try {
        const totalVal = targetSub.items.reduce((sum, item) => sum + item.total, 0);
        await saveActivityLogToFirestore(
          'delete_submission',
          `Menghapus voucher ${targetSub.kode} milik ${targetSub.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')}.`,
          'warning',
          id,
          targetSub.kode,
          userProfile
        );
      } catch (logErr) {
        console.warn('Gagal mencatat log hapus:', logErr);
      }
    }

    if (activeSubmission?.id === id) {
      setActiveSubmission(null);
      if (view === 'print' || view === 'form') {
        setView(previousView || 'list');
      }
    }
  };

  // Duplicate handler
  const handleDuplicate = async (orig: Submission) => {
    // Generate new ID and reset date to today
    const today = new Date();
    const yr = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, '0');
    const dy = String(today.getDate()).padStart(2, '0');

    // Deep copy items
    const copiedItems = orig.items.map((item) => ({
      ...item,
      id: Math.random().toString(),
    }));

    const dupe: Submission = {
      ...orig,
      id: `sub-${Date.now()}`,
      tanggal: `${yr}-${mo}-${dy}`,
      dibayarkanKepada: `${orig.dibayarkanKepada} (Salinan)`,
      items: copiedItems,
      createdAt: new Date().toISOString(),
    };

    const updated = [dupe, ...submissions];
    saveSubmissionsToStorage(updated);

    try {
      fetch('/api/sync-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission: dupe })
      }).catch(() => {});
    } catch (_) {}

    if (isFirebaseConfigured()) {
      try {
        const res = await saveSubmissionToFirestore(dupe, userProfile?.companyId, userProfile?.companyName);
        if (res.syncedToCloud) {
          addCloudSyncedIds([dupe.id]);
          clearPendingFirestoreIds([dupe.id]);
        } else {
          markPendingFirestoreIds([dupe.id]);
        }
      } catch (err) {
        markPendingFirestoreIds([dupe.id]);
        console.warn('Silent fallback: cloud replicate rejected', err);
      }
    } else {
      markPendingFirestoreIds([dupe.id]);
    }

    try {
      const totalVal = dupe.items.reduce((sum, item) => sum + item.total, 0);
      await saveActivityLogToFirestore(
        'update_submission',
        `Menduplikasi voucher lama ${orig.kode} menjadi voucher baru ${dupe.kode} untuk ${dupe.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')}.`,
        'info',
        dupe.id,
        dupe.kode,
        userProfile
      );
    } catch (logErr) {
      console.warn('Gagal mencatat log duplikasi:', logErr);
    }
  };

  // Save/Update from form submission
  const handleSaveSubmission = async (savedSub: Submission) => {
    const stampedSub: Submission = {
      ...savedSub,
      companyId: (savedSub.companyId || userProfile?.companyId || activeCompForSync || 'nmsa').toLowerCase().trim(),
      companyName: savedSub.companyName || userProfile?.companyName || activeCompNameForSync,
      updatedAt: new Date().toISOString(),
    };

    let updatedList: Submission[] = [];
    const exists = submissions.some((sub) => sub.id === stampedSub.id);

    if (exists) {
      updatedList = submissions.map((sub) => (sub.id === stampedSub.id ? stampedSub : sub));
    } else {
      updatedList = [stampedSub, ...submissions];
    }

    saveSubmissionsToStorage(updatedList);

    if (isFirebaseConfigured()) {
      try {
        const res = await saveSubmissionToFirestore(stampedSub, stampedSub.companyId, stampedSub.companyName);
        if (res.syncedToCloud) {
          addCloudSyncedIds([stampedSub.id]);
          clearPendingFirestoreIds([stampedSub.id]);
          setCloudSyncNotice(`☁️ Voucher ${stampedSub.kode || stampedSub.dibayarkanKepada} tersimpan langsung di Firebase Firestore.`);
          setTimeout(() => setCloudSyncNotice(null), 4000);
        } else {
          markPendingFirestoreIds([stampedSub.id]);
          setCloudSyncNotice(`❌ Gagal menyimpan voucher ke Firebase Firestore: ${res.error || 'Periksa koneksi internet'}`);
          setTimeout(() => setCloudSyncNotice(null), 6000);
        }
      } catch (err: any) {
        markPendingFirestoreIds([stampedSub.id]);
        console.error('❌ Cloud Firestore write error:', err);
        setCloudSyncNotice(`❌ Gagal menyimpan voucher ke Firebase Firestore: ${err?.message || 'Periksa jaringan'}`);
        setTimeout(() => setCloudSyncNotice(null), 6000);
      }
    } else {
      markPendingFirestoreIds([stampedSub.id]);
    }

    // If this submission is a Petty Cash transaction, automatically create/update report for Absen Harian NMSA
    const isPC = isPettyCashSubmission(savedSub);
    if (isPC) {
      const custodianName = getPettyCashCustodian(savedSub) || (pettyCashHolders.length > 0 ? pettyCashHolders[0] : 'Suryo Pranoto');
      const totalExp = savedSub.items ? savedSub.items.reduce((acc, it) => acc + (it.total || 0), 0) : 0;
      const attachedFiles = savedSub.googleDriveFiles || (savedSub as any).files || [];
      const reportFileUrl = savedSub.pettyCashFile?.url || 
                            savedSub.googleDriveFileUrl || 
                            (attachedFiles.length > 0 ? attachedFiles[0].url : '');
      const reportFileName = savedSub.pettyCashFile?.name || 
                             savedSub.googleDriveFileName || 
                             (attachedFiles.length > 0 ? attachedFiles[0].name : `Laporan Petty Cash Lapangan - ${savedSub.kode || 'HO'}`);

      const existingIndex = pettyCashReports.findIndex(r => r.submissionId === savedSub.id || (savedSub.kode && r.submissionCode === savedSub.kode));

      const reportItem: PettyCashReport = {
        id: existingIndex >= 0 ? pettyCashReports[existingIndex].id : 'pcr_' + Date.now(),
        fileName: reportFileName,
        uploadedAt: savedSub.tanggal || new Date().toISOString().split('T')[0],
        summary: {
          totalIncome: 0,
          totalExpense: totalExp,
          remainingBalance: -totalExp,
          workerName: custodianName,
          reportMonth: savedSub.tanggal ? savedSub.tanggal.substring(0, 7) : new Date().toISOString().substring(0, 7)
        },
        transactions: savedSub.items && savedSub.items.length > 0 ? savedSub.items.map(it => ({
          date: savedSub.tanggal || new Date().toISOString().split('T')[0],
          description: it.item || 'Transaksi Petty Cash Lapangan HO',
          category: savedSub.jenisPengajuan || 'Petty Cash',
          amount: it.total || 0,
          worker: custodianName,
          type: TransactionType.EXPENSE,
          verified: true
        })) : [{
          date: savedSub.tanggal || new Date().toISOString().split('T')[0],
          description: savedSub.notes || `Voucher ${savedSub.kode || 'HO'} Petty Cash`,
          category: savedSub.jenisPengajuan || 'Petty Cash',
          amount: totalExp,
          worker: custodianName,
          type: TransactionType.EXPENSE,
          verified: true
        }],
        driveUrl: reportFileUrl,
        submissionId: savedSub.id,
        submissionCode: savedSub.kode || 'HO'
      };

      let updatedReports = [...pettyCashReports];
      if (existingIndex >= 0) {
        updatedReports[existingIndex] = reportItem;
      } else {
        updatedReports = [reportItem, ...updatedReports];
      }

      setPettyCashReports(updatedReports);
      localStorage.setItem('petty_cash_reports', JSON.stringify(updatedReports));

      // Sync to server so Absen Harian NMSA immediately sees it
      try {
        fetch('/api/shared-state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pettyCashReports: updatedReports,
            pettyCashHolders
          })
        }).catch(err => console.warn('Sync error:', err));
      } catch (e) {
        console.warn('Gagal sinkronisasi laporan petty cash:', e);
      }
    }

    // If this submission is a Loan transaction (Pinjaman Karyawan / Perusahaan), automatically sync & accumulate
    if (isLoanSubmission(savedSub)) {
      try {
        const currentLoans = getSavedEmployeeLoans();
        const { syncedLoans } = syncLoansWithSubmissions(currentLoans, updatedList);
        saveEmployeeLoans(syncedLoans);
      } catch (loanSyncErr) {
        console.warn('Gagal sinkronisasi transaksi pinjaman:', loanSyncErr);
      }
    }

    // If this submission was created from a Monthly Recurring Transaction, record link & settle only when Lunas or proof uploaded
    if (savedSub.recurringTemplateId && savedSub.recurringMonth) {
      const targetId = savedSub.recurringTemplateId;
      const targetMonth = savedSub.recurringMonth;
      const settled = isSubmissionSettledForMonthly(savedSub);
      const updatedMonthly = monthlyTransactions.map((m) =>
        m.id === targetId
          ? {
              ...m,
              paidMonths: {
                ...(m.paidMonths || {}),
                [targetMonth]: {
                  monthKey: targetMonth,
                  status: (settled ? 'paid' : 'pending') as 'paid' | 'pending',
                  paidAt: savedSub.tanggal || new Date().toISOString().split('T')[0],
                  submissionId: savedSub.id,
                  submissionCode: savedSub.kode,
                  amount: getSubmissionTotalAmount(savedSub),
                  markedManually: false,
                },
              },
              updatedAt: new Date().toISOString(),
            }
          : m
      );
      handleSaveMonthlyTransactions(updatedMonthly);
    }

    // If this submission is an SPPD (Perjalanan Dinas), automatically sync/create record in SPPD Manager
    const isSppdType = (savedSub.jenisPengajuan || '').toLowerCase().includes('perjalanan dinas') || 
                       (savedSub.jenisPengajuan || '').toLowerCase().includes('sppd');
    if (isSppdType) {
      try {
        const storedSppd = localStorage.getItem('sppd_records_v1');
        let sppdList = storedSppd ? JSON.parse(storedSppd) : [];

        const existingSppdIdx = sppdList.findIndex((s: any) => s.submissionId === savedSub.id || (s.noSppd && savedSub.notes?.includes(s.noSppd)));

        const sppdCostItems = savedSub.items && savedSub.items.length > 0 ? savedSub.items.map((it, idx) => ({
          id: it.id || `c_${idx}_${Date.now()}`,
          kategori: it.item || 'Biaya SPPD',
          rincian: it.keterangan || it.item || '',
          hargaAcuan: it.total || 0,
          jumlah: it.total || 0
        })) : [];

        const extractSppdNo = savedSub.notes?.match(/SPPD[-A-Z0-9\/]+/i)?.[0];

        const sppdRecord = {
          id: existingSppdIdx >= 0 ? sppdList[existingSppdIdx].id : 'sppd_' + Date.now(),
          noSppd: extractSppdNo || (existingSppdIdx >= 0 ? sppdList[existingSppdIdx].noSppd : `SPPD-NMSA/${new Date().getFullYear()}/${savedSub.kode || 'HO'}/${Date.now().toString().slice(-4)}`),
          hariTanggal: savedSub.tanggal ? new Date(savedSub.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
          pemberiPerintah: savedSub.disetujuiOleh2 || 'H. A. Nursyam Halid',
          pemberiPerintahJabatan: savedSub.disetujuiJabatan2 || 'Direktur Utama',
          namaPekerja: savedSub.dibayarkanKepada || 'Pekerja SPPD',
          jabatan: savedSub.diverifikasiJabatan || 'Supervisor',
          divisi: 'Operational & Finance',
          kotaAsal: 'Jakarta (HO)',
          kotaTujuan: savedSub.notes?.match(/Tujuan:\s*([^.(]+)/i)?.[1]?.trim() || 'Site Lapangan',
          transportasi: 'Pesawat / Mobil Operational',
          lamaPerjalanan: 'Perjalanan Dinas',
          tanggalMulai: savedSub.tanggal || new Date().toISOString().split('T')[0],
          tanggalSelesai: savedSub.tanggal || new Date().toISOString().split('T')[0],
          tujuanPerjalanan: savedSub.notes || `Biaya Perjalanan Dinas (SPPD) ${savedSub.dibayarkanKepada || ''}`,
          keteranganSppd: savedSub.notes || '',
          costItems: sppdCostItems,
          pemberiPerintahName: savedSub.disetujuiOleh2 || 'H. A. Nursyam Halid',
          sppdDisetujuiName: savedSub.disetujuiOleh || 'Harijon',
          sppdDisetujuiJabatan: 'Head of Operational',
          sppdMengetahuiName: savedSub.dibuatOleh || 'Nur Wahyudi',
          status: savedSub.status === 'Lunas' ? 'Terbayar' : 'Disetujui',
          createdAt: savedSub.createdAt || new Date().toISOString(),
          submissionId: savedSub.id,
          submissionCode: savedSub.kode || 'HO'
        };

        if (existingSppdIdx >= 0) {
          sppdList[existingSppdIdx] = { ...sppdList[existingSppdIdx], ...sppdRecord };
        } else {
          sppdList = [sppdRecord, ...sppdList];
        }

        localStorage.setItem('sppd_records_v1', JSON.stringify(sppdList));
      } catch (err) {
        console.warn('Gagal sinkronisasi data SPPD:', err);
      }
    }

    // If this submission is an Invoice, automatically sync/create reminder in Agenda Manager for Coretax DJP (due 20th of next month)
    const isInv = isInvoiceSubmission(savedSub) || savedSub.isInvoice || savedSub.sendToAgenda;
    if (isInv && savedSub.sendToAgenda !== false) {
      try {
        const { updatedAgendaItems, affectedAgendaId, isNew, dueDateFormatted } = syncInvoiceSubmissionToAgenda(
          savedSub,
          agendaItems,
          userProfile?.fullName
        );
        await handleSaveAgendaItems(updatedAgendaItems);
        console.log(`[Agenda Tax Sync] Berhasil ${isNew ? 'membuat' : 'memperbarui'} pengingat PPh Coretax DJP jatuh tempo ${dueDateFormatted} (ID: ${affectedAgendaId})`);
      } catch (agendaErr) {
        console.warn('Gagal sinkronisasi pengingat PPh invoice ke agenda:', agendaErr);
      }
    }

    try {
      const totalVal = savedSub.items.reduce((sum, item) => sum + item.total, 0);
      await saveActivityLogToFirestore(
        exists ? 'update_submission' : 'create_submission',
        exists 
          ? `Memperbarui rincian voucher ${savedSub.kode} untuk ${savedSub.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')}.`
          : `Membuat voucher baru dengan kode ${savedSub.kode} untuk ${savedSub.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')}.`,
        exists ? 'info' : 'success',
        savedSub.id,
        savedSub.kode,
        userProfile
      );
    } catch (logErr) {
      console.warn('Gagal mencatat log penyimpanan:', logErr);
    }

    // Pastikan activeSubmission langsung diperbarui jika dokumen yang diedit sedang dibuka
    if (activeSubmission && (activeSubmission.id === savedSub.id || activeSubmission.kode === savedSub.kode)) {
      setActiveSubmission(savedSub);
    }

    // Sinkronisasi otomatis ke memori server backend
    try {
      fetch('/api/sync-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission: savedSub })
      }).catch((syncErr) => console.warn('Background server sync warning:', syncErr));
    } catch (_) {}

    // Navigate or remain in place appropriately without resetting view
    if (view === 'form') {
      setEditingSubmission(null);
      if (previousView === 'print') {
        setActiveSubmission(savedSub);
      }
      setView(previousView || 'list');
    } else if (view === 'print') {
      setActiveSubmission(savedSub);
    }
    // If saving occurred from inside Accurate, Absen, Npwp, or List modal/action, keep view intact!
  };

  // Mark unpaid old submission as paid (Lunas) without attachment proof
  const handleMarkAsPaid = async (id: string) => {
    const updatedList = submissions.map((sub) => {
      if (sub.id === id) {
        return {
          ...sub,
          status: 'Lunas' as const,
        };
      }
      return sub;
    });

    saveSubmissionsToStorage(updatedList);

    const targetSub = submissions.find((sub) => sub.id === id);
    if (targetSub) {
      const updatedSub = {
        ...targetSub,
        status: 'Lunas' as const,
      };

      try {
        fetch('/api/sync-submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission: updatedSub })
        }).catch(() => {});
      } catch (_) {}

      if (isFirebaseConfigured()) {
        try {
          const res = await saveSubmissionToFirestore(updatedSub, userProfile?.companyId, userProfile?.companyName);
          if (res.syncedToCloud) {
            addCloudSyncedIds([updatedSub.id]);
            clearPendingFirestoreIds([updatedSub.id]);
          } else {
            markPendingFirestoreIds([updatedSub.id]);
          }
        } catch (err) {
          markPendingFirestoreIds([updatedSub.id]);
          console.warn('Silent fallback: cloud status update rejected', err);
        }
      } else {
        markPendingFirestoreIds([updatedSub.id]);
      }

      try {
        const totalVal = targetSub.items.reduce((sum, item) => sum + item.total, 0);
        await saveActivityLogToFirestore(
          'pay_submission',
          `Menandai voucher ${targetSub.kode} untuk ${targetSub.dibayarkanKepada} senilai Rp ${totalVal.toLocaleString('id-ID')} sebagai SUDAH DIBAYAR (Lunas) tanpa bukti transfer/bayar fisik karena data lama/hilang.`,
          'success',
          id,
          targetSub.kode,
          userProfile
        );
      } catch (logErr) {
        console.warn('Gagal mencatat log penandaan lunas:', logErr);
      }
    }
  };

  // Central Logout Handler
  const handleLogout = async () => {
    try {
      if (getPendingFirestoreSyncCount() > 0 && !isFirestoreQuotaExceeded()) {
        await flushFirestoreQueue().catch(() => {});
      }
      sessionStorage.removeItem('NUSANTARA_SESSION_ACTIVE');
      sessionStorage.removeItem('NUSANTARA_ACTIVE_VIEW');
      localStorage.removeItem('NUSANTARA_ACTIVE_TAB_HEARTBEAT');
      localStorage.removeItem('NUSANTARA_ACTIVE_VIEW');
      setViewInternal('list');
      setIsInitialReconcileDone(false);
      setSubmissions([]);
      setUserProfile(null);
      setAuthUser(null);
      await logoutFromFirebase();
    } catch (e) {
      console.error('Keluar aplikasi gagal:', e);
    }
  };

  // Import handler for JSON backup
  const handleImportJson = (importedList: Submission[]) => {
    const mergedMap = new Map<string, Submission>();
    submissions.forEach(sub => mergedMap.set(sub.id, sub));
    importedList.forEach(sub => {
      if (sub && sub.id) {
        mergedMap.set(sub.id, { ...sub, companyId: sub.companyId || activeCompForSync, updatedAt: new Date().toISOString() });
      }
    });

    const updated = sortSubmissionsList(Array.from(mergedMap.values()));
    saveSubmissionsToStorage(updated);
    if (isFirebaseConfigured() && importedList.length > 0) {
      saveSubmissionsBatchToFirestore(importedList, activeCompForSync, activeCompNameForSync)
        .then((res) => {
          const ids = importedList.map((s) => s.id);
          if (res.success) {
            addCloudSyncedIds(ids);
            clearPendingFirestoreIds(ids);
          } else {
            markPendingFirestoreIds(ids);
          }
        })
        .catch(() => {
          markPendingFirestoreIds(importedList.map((s) => s.id));
        });
    } else if (importedList.length > 0) {
      markPendingFirestoreIds(importedList.map((s) => s.id));
    }
  };

  // Sync / Import handler for Google Sheets legacy vouchers
  const handleSheetsImport = (importedList: Submission[], mergeMode: 'merge' | 'overwrite' = 'merge') => {
    const stampedImported = importedList.map(sub => {
      return { ...sub, companyId: sub.companyId || activeCompForSync, updatedAt: new Date().toISOString() };
    });
    if (mergeMode === 'overwrite') {
      saveSubmissionsToStorage(stampedImported);
      if (isFirebaseConfigured() && stampedImported.length > 0) {
        saveSubmissionsBatchToFirestore(stampedImported, activeCompForSync, activeCompNameForSync).catch(() => {});
      }
    } else {
      const mergedMap = new Map<string, Submission>();
      submissions.forEach(sub => mergedMap.set(sub.id, sub));
      stampedImported.forEach(sub => mergedMap.set(sub.id, sub));

      const updated = sortSubmissionsList(Array.from(mergedMap.values()));
      saveSubmissionsToStorage(updated);
      if (isFirebaseConfigured() && stampedImported.length > 0) {
        saveSubmissionsBatchToFirestore(stampedImported, activeCompForSync, activeCompNameForSync).catch(() => {});
      }
    }
  };

  // Sync handler for Firebase Cloud Firestore
  const handleFirebaseSync = (cloudList: Submission[]) => {
    const mergedMap = new Map<string, Submission>();
    submissions.forEach(sub => mergedMap.set(sub.id, sub));
    cloudList.forEach(sub => mergedMap.set(sub.id, sub));

    const updated = sortSubmissionsList(Array.from(mergedMap.values()));
    saveSubmissionsToStorage(updated);
  };

  // Helper function to extract concise, clean official category names
  const getCleanCategoryItemTitle = (kategori: string, durationStr?: string): string => {
    const cat = (kategori || '').toLowerCase();
    if (cat.includes('jkt - bandara') || cat.includes('rumah - bandara') || cat.includes('transport jkt') || (cat.includes('transport') && (cat.includes('bandara') || cat.includes('stasiun')) && !cat.includes('hotel'))) {
      return 'Transport Rumah - Bandara PP';
    }
    if (cat.includes('makan') || cat.includes('konsumsi')) {
      return durationStr ? `Uang Makan (${durationStr})` : 'Uang Makan / Hari';
    }
    if (cat.includes('saku') || cat.includes('pocket') || cat.includes('allowance')) {
      return durationStr ? `Uang Saku (${durationStr})` : 'Uang Saku';
    }
    if ((cat.includes('hotel') && cat.includes('bandara')) || cat.includes('taksi') || cat.includes('taxi') || cat.includes('perjalanan') || cat.includes('antar jemput') || cat.includes('lokal')) {
      return 'Transport Bandara - Hotel PP';
    }
    if (cat.includes('pesawat') || cat.includes('flight') || cat.includes('boarding')) {
      return 'Tiket Pesawat PP';
    }
    if (cat.includes('kereta') || cat.includes('kai') || cat.includes('whoosh')) {
      return 'Tiket Kereta Api';
    }
    if (cat.includes('hotel') || cat.includes('penginapan') || cat.includes('lodging') || cat.includes('kamar')) {
      return 'Penginapan / Hotel';
    }
    if (cat.includes('double cabin') || cat.includes('dcabin') || cat.includes('hilux') || cat.includes('triton')) {
      return 'Sewa Mobil Double Cabin';
    }
    if (cat.includes('sewa mobil') || cat.includes('rental mobil') || cat.includes('avanza') || cat.includes('innova')) {
      return 'Sewa Mobil Operasional';
    }
    const base = (kategori || '').split(/[:\-\–]/)[0].trim();
    return base || 'Biaya SPPD';
  };

  // Helper to generate SPPD voucher code matching requested format (e.g. BKK-NMSA-SPPD-7648)
  const generateSppdVoucherDocumentCode = (sppd: any, allSubmissions: Submission[]): string => {
    const comp = (userProfile?.companyId || sppd.company || 'NMSA').toUpperCase();
    
    // Check if sppd.noSppd has numeric sequence (e.g. 7648)
    let seqStr = '';
    if (sppd.noSppd) {
      const match = sppd.noSppd.match(/(\d{3,5})/);
      if (match) {
        seqStr = match[1];
      } else {
        const digits = sppd.noSppd.replace(/\D/g, '');
        if (digits.length >= 3) {
          seqStr = digits.slice(-4);
        }
      }
    }

    if (!seqStr) {
      // Find highest SPPD sequence in existing submissions
      let maxSeq = 7647;
      allSubmissions.forEach(sub => {
        if (sub.kode) {
          const m = sub.kode.match(/SPPD[-/](\d+)/i) || sub.kode.match(/(\d{4})/);
          if (m && m[1]) {
            const v = parseInt(m[1], 10);
            if (v > maxSeq && v < 99999) maxSeq = v;
          }
        }
      });
      seqStr = String(maxSeq + 1);
    }

    return `BKK-${comp}-SPPD-${seqStr}`;
  };

  // SPPD Import to Submission handler
  const handleImportSppdToSubmission = (sppd: any) => {
    // 1. Determine traveler name (nama dibayarkan = nama karyawan)
    const travelerName = (sppd.namaPekerja || sppd.namaPegawai || '').trim();
    // 2. Tanggal pengajuan = tanggal default tanggal awal dimulai perjalanan dinas
    const dateVal = sppd.tanggalMulai || sppd.tanggalBerangkat || new Date().toISOString().split('T')[0];
    const destination = sppd.kotaTujuan || '';
    const lamaDinas = sppd.lamaPerjalanan || 'Dinas';
    const tglMulai = sppd.tanggalMulai || sppd.tanggalBerangkat || '';
    const tglSelesai = sppd.tanggalSelesai || sppd.tanggalKembali || '';
    
    const dateRangeStr = tglMulai && tglSelesai
      ? `${formatDateIndonesian(tglMulai)} s/d ${formatDateIndonesian(tglSelesai)}`
      : (tglMulai ? formatDateIndonesian(tglMulai) : '');

    // 3. Document code: nomor dok + SPPD setelah no default, e.g. BKK-NMSA-SPPD-7648
    const docKode = generateSppdVoucherDocumentCode(sppd, submissions);

    // 4. Notes: khusus dari tujuan perjalanan dinas yang tertulis di form SPPD
    const sppdPurpose = (sppd.tujuanPerjalanan || sppd.maksudDinas || '').trim();
    const cleanNotes = sppdPurpose || (sppd.noSppd ? `Tujuan SPPD ${sppd.noSppd}: ${destination}` : destination);

    // 5. Collect all attachments uploaded by employee
    const pdfAttachments: Array<{ url: string; name: string; pageCount?: number; docType?: string; isF1?: boolean; isF2?: boolean; isBuktiPembayaran?: boolean }> = [];

    if (sppd.costItems && Array.isArray(sppd.costItems)) {
      sppd.costItems.forEach((c: any) => {
        if (c.attachment && c.attachment.url) {
          pdfAttachments.push({
            url: c.attachment.url,
            name: c.attachment.name || `Bukti_${c.kategori || 'Biaya'}.pdf`,
            pageCount: c.attachment.pageCount || 1,
            docType: `Bukti ${c.kategori || 'SPPD'}`
          });
        }
      });
    }

    if (sppd.attachedFiles && Array.isArray(sppd.attachedFiles)) {
      sppd.attachedFiles.forEach((f: any) => {
        if (f.url && !pdfAttachments.some(p => p.url === f.url)) {
          pdfAttachments.push({
            url: f.url,
            name: f.name || 'Bukti_SPPD.pdf',
            pageCount: f.pageCount || 1,
            docType: f.category ? `Bukti ${f.category}` : 'Bukti SPPD'
          });
        }
      });
    }

    // 6. Calculate total SPPD amount
    let totalSppdNominal = 0;
    if (sppd.costItems && Array.isArray(sppd.costItems) && sppd.costItems.length > 0) {
      totalSppdNominal = sppd.costItems.reduce((sum: number, c: any) => {
        const calc = c.jumlah !== undefined ? Number(c.jumlah) : (c.vol && c.hargaSatuan ? Number(c.vol) * Number(c.hargaSatuan) : 0);
        return sum + (calc || 0);
      }, 0);
    } else if (sppd.totalBiaya !== undefined && Number(sppd.totalBiaya) > 0) {
      totalSppdNominal = Number(sppd.totalBiaya);
    } else {
      totalSppdNominal = (Number(sppd.biayaTransport) || 0) + (Number(sppd.uangHarian) || 0) + (Number(sppd.biayaPenginapan) || 0);
    }

    // 7. Format single-row item description: Biaya Perjalanan Dinas + Nama Karyawan + lama Dinas dengan tanggalnya + lokasi dinas
    const dateFormattedPart = dateRangeStr ? `(${dateRangeStr})` : '';
    const locationPart = destination ? `ke ${destination}` : '';
    const singleItemDescription = `Biaya Perjalanan Dinas ${travelerName} ${lamaDinas} ${dateFormattedPart} ${locationPart}`.replace(/\s+/g, ' ').trim();

    const newSppdSubmission: Submission = {
      id: 'sub_' + Date.now(),
      lokasi: destination || 'Lt. 1',
      tanggal: dateVal,
      jenisPengajuan: 'Perjalanan Dinas',
      kode: docKode,
      dibayarkanKepada: travelerName,
      dibayarkanDengan: 'Cek/Transfer',
      status: 'Belum Lunas',
      notes: cleanNotes,
      isSppd: true,
      sppdId: sppd.id,
      sppdNo: sppd.noSppd,
      sppdRecord: sppd,
      googleDriveFiles: pdfAttachments.length > 0 ? pdfAttachments : undefined,
      googleDriveFileUrl: pdfAttachments.length > 0 ? pdfAttachments[0].url : undefined,
      googleDriveFileName: pdfAttachments.length > 0 ? pdfAttachments[0].name : undefined,
      dibuatOleh: userProfile ? userProfile.fullName : 'Nur Wahyudi',
      disetujuiOleh: sppd.sppdDisetujuiName || 'Harijon',
      diverifikasiOleh: 'Andi Dhiya Salsabila',
      diverifikasiJabatan: 'Keuangan',
      disetujuiOleh2: sppd.pemberiPerintah || sppd.pemberiPerintahName || 'H. A. Nursyam Halid',
      disetujuiJabatan2: sppd.pemberiPerintahJabatan || 'Direktur Utama',
      dibukukanOleh: 'Sri Ekowati',
      dibukukanJabatan: 'Accounting',
      items: [
        {
          id: 'item_sppd_' + Date.now(),
          no: 1,
          item: singleItemDescription,
          jumlahVolume: '1 Paket',
          total: totalSppdNominal,
          keterangan: sppd.noSppd ? `SPPD No: ${sppd.noSppd}` : 'Biaya SPPD'
        }
      ],
      createdAt: new Date().toISOString()
    };

    setEditingSubmission(newSppdSubmission);
    setView('form');
  };

  // Handler to create a new Voucher HO draft directly from an Internal Memo
  const handleCreateVoucherFromMemo = (memo: InternalMemo) => {
    const docKode = `VCR-${Date.now().toString().slice(-6)}`;
    const amount = Number(memo.linkedAmount) || 0;
    const recipient = memo.accountHolder || memo.kepada?.split('–')[0]?.split('-')[0]?.trim() || 'Pihak Terkait';

    const newMemoSubmission: Submission = {
      id: 'sub-memo-' + Date.now(),
      lokasi: 'Lt.1',
      tanggal: memo.tanggal || new Date().toISOString().split('T')[0],
      jenisPengajuan: 'Operasional Direksi',
      kode: docKode,
      dibayarkanKepada: recipient,
      dibayarkanDengan: 'Cek/Transfer',
      status: 'Belum Lunas',
      notes: `Ref Internal Memo No. ${memo.nomorMemo}: ${memo.perihal || ''}`,
      rekeningTujuan: memo.accountNumber || '',
      noRekeningTujuan: memo.accountNumber || '',
      namaBankTujuan: memo.bankName || 'Bank Mandiri',
      atasNamaRekeningTujuan: memo.accountHolder || recipient,
      dibuatOleh: userProfile ? userProfile.fullName : 'Nur Wahyudi',
      disetujuiOleh: memo.penandatanganNama2 || 'Harijon',
      disetujuiJabatan: memo.penandatanganJabatan2 || 'Direktur Keuangan',
      diverifikasiOleh: 'Andi Muhammad Rifki',
      diverifikasiJabatan: 'Direktur',
      disetujuiOleh2: memo.penandatanganNama3 || 'Abdul Aziz Halid',
      disetujuiJabatan2: memo.penandatanganJabatan3 || 'Direktur Utama ANH',
      dibukukanOleh: 'Sri Ekowati',
      dibukukanJabatan: 'Accounting',
      items: [
        {
          id: 'item_memo_' + Date.now(),
          no: 1,
          item: memo.perihal || 'Pengeluaran sesuai Internal Memo',
          jumlahVolume: '1 Paket',
          total: amount,
          keterangan: `Internal Memo No. ${memo.nomorMemo}`
        }
      ],
      createdAt: new Date().toISOString()
    };

    setEditingSubmission(newMemoSubmission);
    setView('form');
  };

  // Handler to create a new Voucher HO draft directly from an Employee Loan disbursement request
  const handleCreateVoucherFromLoan = (loan: EmployeeLoan) => {
    const docKode = `VCR-${Date.now().toString().slice(-6)}`;
    const newLoanSubmission: Submission = {
      id: 'sub-loan-' + Date.now(),
      lokasi: 'Lt.1',
      tanggal: loan.tanggalPengambilanPinjaman || loan.tanggalPermohonan || new Date().toISOString().split('T')[0],
      jenisPengajuan: 'Pinjaman Karyawan',
      loanId: loan.id,
      loanNumber: loan.nomorPinjaman,
      kode: docKode,
      dibayarkanKepada: loan.namaKaryawan,
      dibayarkanDengan: 'Cek/Transfer',
      status: 'Belum Lunas',
      notes: `Pencairan Pinjaman Karyawan No. ${loan.nomorPinjaman} atas nama ${loan.namaKaryawan} (${loan.divisi || 'Karyawan'}). Alasan: ${loan.alasanPeminjaman || '-'}. Skema: ${loan.caraPembayaran || '-'}`,
      dibuatOleh: userProfile ? userProfile.fullName : 'Nur Wahyudi',
      diajukanOleh: loan.namaKaryawan,
      diajukanJabatan: loan.peminjamJabatan || 'Karyawan',
      disetujuiOleh: loan.financeNama || 'Harijon',
      disetujuiJabatan: loan.financeJabatan || 'Direktur Keuangan',
      diverifikasiOleh: loan.atasanNama || 'Andi Muhammad Rifki',
      diverifikasiJabatan: loan.atasanJabatan || 'Direktur',
      disetujuiOleh2: loan.direkturNama || 'Andi Nursyam Halid',
      disetujuiJabatan2: loan.direkturJabatan || 'Direktur Utama',
      dibukukanOleh: 'Sri Ekowati',
      dibukukanJabatan: 'Accounting',
      items: [
        {
          id: 'item_loan_' + Date.now(),
          no: 1,
          item: `Pinjaman Karyawan: ${loan.namaKaryawan} (${loan.divisi || 'Karyawan'})`,
          jumlahVolume: '1 Paket',
          total: loan.jumlahPinjaman,
          keterangan: `No. Pinjaman ${loan.nomorPinjaman} - ${loan.caraPembayaran || '-'}`
        }
      ],
      createdAt: new Date().toISOString()
    };

    setEditingSubmission(newLoanSubmission);
    setView('form');
  };

  // 1. Direct Absensi Harian NMSA (Highest Priority when worker opens attendance link from WhatsApp / Web)
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const rawIdParam = (searchParams.get('id') || '').toLowerCase().trim();
  const isSubmissionIdParam = 
    rawIdParam.startsWith('sub-') || 
    rawIdParam.startsWith('tx-') || 
    rawIdParam.startsWith('vcr-') || 
    rawIdParam.startsWith('inv-') ||
    (rawIdParam.length > 10 && !rawIdParam.startsWith('w-') && !rawIdParam.startsWith('kar-') && !rawIdParam.startsWith('worker-'));

  const isAbsenRoute = Boolean(
    currentPath === '/absen' || 
    currentPath === '/absensi' || 
    currentPath === '/absen-mandiri' ||
    currentHash.includes('absen') || 
    currentHash.includes('absensi') ||
    searchParams.has('workerId') || 
    searchParams.has('quick') || 
    searchParams.get('view') === 'absen' || 
    searchParams.get('tab') === 'absen' ||
    (searchParams.has('id') && !isSubmissionIdParam && !searchParams.has('transaksi') && !searchParams.has('nominal') && !searchParams.has('kode'))
  );

  if (isAbsenRoute && (!authUser || searchParams.has('quick') || searchParams.has('workerId') || searchParams.get('view') === 'absen' || currentPath.includes('absen') || currentHash.includes('absen'))) {
    return (
      <div id="app-root" className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased theme-${theme}`}>
        <AbsensiHarianNmsa
          onClose={() => {
            window.history.pushState({}, '', '/');
            window.location.hash = '';
            setCurrentPath('/');
            setCurrentHash('');
            setView('list');
          }}
          pettyCashHolders={pettyCashHolders}
          onUpdatePettyCashHolders={setPettyCashHolders}
          pettyCashReports={pettyCashReports}
          onUpdatePettyCashReports={handleSavePettyCashReports}
          submissions={submissions}
          onPostToVoucherHO={(newSub) => {
            handleSaveSubmission(newSub);
          }}
          userProfile={userProfile}
          initialSelfAttendanceMode={searchParams.has('self') || currentPath === '/absen-mandiri' || currentPath === '/absen'}
        />
      </div>
    );
  }

  // 2. Check Public Share View Route (Only for valid Voucher / Pengeluaran links)
  const isSharedViewRoute = !isAbsenRoute && Boolean(
    currentHash.includes('shared-view') ||
    currentPath.includes('shared-view') ||
    currentPath.includes('/voucher') ||
    currentPath.includes('/transaksi') ||
    currentPath.includes('/shared') ||
    currentHash.includes('voucher') ||
    currentHash.includes('transaksi') ||
    searchParams.has('transaksi') ||
    searchParams.has('nominal') ||
    searchParams.has('kode') ||
    (searchParams.has('id') && isSubmissionIdParam)
  );

  if (isSharedViewRoute) {
    return (
      <div id="app-root" className={`min-h-screen bg-stone-50 text-stone-850 flex flex-col antialiased theme-${theme}`}>
        {/* Public Header bar with brand styling & explicit Print/PDF actions */}
        <header className="bg-stone-900 border-b border-stone-800 sticky top-0 z-50 shadow-md print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img 
                src="https://i.ibb.co.com/TqgprgPT/Logo-Nusantara-Mineral-Abadi.webp" 
                alt="Logo NMSA" 
                className="h-8 w-auto object-contain bg-white rounded-lg p-0.5" 
                crossOrigin="anonymous"
              />
              <div className="text-white">
                <span className="font-mono text-[9px] uppercase tracking-widest text-amber-400 font-bold block leading-none mb-1">
                  Portal Transaksi &amp; Voucher Publik
                </span>
                <h1 className="text-xs sm:text-sm font-black tracking-tight leading-none text-white">
                  PT Nusantara Mineral Sukses Abadi
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-sm active:scale-95"
                title="Cetak Voucher & Dokumen Lengkap"
              >
                <Printer size={15} />
                <span>Cetak / Cetak PDF</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col">
          {isLoadingShared ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 space-y-4">
              <Loader2 className="animate-spin text-amber-600" size={40} />
              <p className="text-xs font-mono font-bold text-stone-600 uppercase tracking-widest">
                Mengambil Dokumen Transaksi dari Cloud...
              </p>
            </div>
          ) : sharedError && !sharedSubmission ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto space-y-4">
              <div className="p-4 bg-rose-100 text-rose-700 rounded-2xl">
                <ShieldCheck size={32} className="text-rose-600" />
              </div>
              <h3 className="font-sans font-black text-stone-900 text-lg">Gagal Memuat Transaksi</h3>
              <p className="text-xs text-stone-500 leading-relaxed font-mono">
                {sharedError}
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Muat Ulang
                </button>
                <button
                  onClick={() => navigateTo('/')}
                  className="bg-stone-900 hover:bg-stone-850 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  Kembali ke Beranda
                </button>
              </div>
            </div>
          ) : sharedSubmission ? (
            <div className="space-y-6">
              {/* Informative notification pill */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-emerald-950">
                      Voucher Transaksi Resmi: {sharedSubmission.kode}
                    </div>
                    <div className="text-[11px] text-emerald-800 font-mono">
                      {sharedSubmission.jenisPengajuan} • Total: Rp {((sharedSubmission.items && sharedSubmission.items.reduce((acc, it) => acc + (it.total || 0), 0)) || (sharedSubmission as any).total || 0).toLocaleString('id-ID')} • Status: {sharedSubmission.status || 'Lunas'}
                    </div>
                  </div>
                </div>
              </div>

              <PrintDocument
                submission={sharedSubmission}
                userProfile={{
                  companyName: 'PT Nusantara Mineral Sukses Abadi',
                  companyDetails: {
                    name: 'PT Nusantara Mineral Sukses Abadi',
                    fullName: 'PT. Nusantara Mineral Sukses Abadi',
                    displayName: 'Invoice-NMSA'
                  }
                }}
                initialTab="both"
                isSharedView={true}
                onBack={() => navigateTo('/')}
                onUpdateSubmission={(updated) => setSharedSubmission(updated)}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto space-y-4">
              <p className="text-xs font-mono text-stone-500">Menyiapkan pratinjau dokumen transaksi...</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                Muat Ulang Halaman
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  const isPublicLoanView = 
    currentPath === '/pinjaman-karyawan' || 
    currentPath === '/form-pinjaman' ||
    currentPath === '/loan-form' ||
    currentHash.includes('pinjaman-karyawan') || 
    currentHash.includes('form-pinjaman') ||
    currentHash.includes('loan-form');

  if (isPublicLoanView) {
    return <PublicEmployeeLoanInput onBackToHome={() => navigateTo('/')} />;
  }

  const isPublicSppdView = 
    currentPath === '/input-sppd' || 
    currentPath === '/sppd-form' ||
    currentHash.includes('input-sppd') || 
    currentHash.includes('sppd-form');

  if (isPublicSppdView) {
    return <PublicSppdInput onBackToHome={() => navigateTo('/')} />;
  }

  // Check Authentication First: enforce AuthGate for ALL pages when unauthenticated
  if (!authUser) {
    return (
      <AuthGate
        onLoginSuccess={(user, initialData) => {
          sessionStorage.setItem('NUSANTARA_SESSION_ACTIVE', 'true');
          try {
            localStorage.setItem('NUSANTARA_ACTIVE_TAB_HEARTBEAT', String(Date.now()));
          } catch (_) {}
          setAuthUser(user);
          setViewInternal('list');
          try {
            sessionStorage.setItem('NUSANTARA_ACTIVE_VIEW', 'list');
            localStorage.setItem('NUSANTARA_ACTIVE_VIEW', 'list');
          } catch (e) {}
          const compId = (user?.companyId || localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_ID') || 'nmsa').toLowerCase().trim();
          const backupSeed = getBestBackupForCompany(compId);
          const initialValid = Array.isArray(initialData) && initialData.length > 0 ? initialData : backupSeed;
          setSubmissions(sortSubmissionsList(initialValid));
        }}
      />
    );
  }

  const isIndividualUploaderView = 
    currentPath === '/input-bukti-transfer' || 
    currentHash === '#/input-bukti-transfer' || 
    currentHash === '#input-bukti-transfer';

  if (isIndividualUploaderView) {
    return (
      <div id="app-root" className={`min-h-screen bg-stone-50 text-stone-850 flex flex-col antialiased theme-${theme}`}>
        <header className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-xs print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between min-h-18 py-2 md:py-0">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo('/')}>
                <div className="p-2.5 bg-stone-100 rounded-xl text-stone-850">
                  <Database size={20} className="text-gold-dynamic" />
                </div>
                <div className="space-y-0.5">
                  <span className="font-mono text-xs uppercase tracking-wider text-stone-400 font-bold block">
                    {userProfile?.companyDetails?.displayName || 'Internal HO System'}
                  </span>
                  <h1 className="text-xs sm:text-sm font-black text-stone-900 tracking-tight flex items-center gap-1.5 font-sans">
                    {userProfile?.companyName ? `${userProfile.companyName} Portal` : 'Nusantara Mineral Payment Portal'}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Company Switcher Pill / Badge */}
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(true)}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 transition cursor-pointer shadow-3xs font-sans text-xs font-bold"
                  title="Kelola & Ganti Perusahaan (Data Transaksi Terpisah)"
                >
                  <Building2 size={13} className="text-amber-700 shrink-0" />
                  <span className="truncate max-w-[120px]">
                    {userProfile?.companyDetails?.code || userProfile?.companyId?.toUpperCase() || 'NMSA'}
                  </span>
                  <span className="text-[9px] bg-amber-200/90 text-amber-900 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                    Ganti
                  </span>
                </button>

                {/* Master Google Drive 24/7 Status Header Badge */}
                <button
                  type="button"
                  onClick={() => setIsGoogleDriveSettingsOpen(true)}
                  className="hidden sm:flex items-center gap-2 py-1.5 px-3 rounded-2xl bg-amber-50/90 hover:bg-amber-100 border border-amber-300/80 text-amber-950 transition cursor-pointer shadow-3xs font-mono text-xs"
                  title="Master Google Drive 24/7 Terhubung ke Semua Menu. Klik untuk Kelola Akun & Whitelist."
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <Cloud size={14} className="text-amber-600 shrink-0" />
                  <span className="font-bold truncate max-w-[140px] md:max-w-[200px]">
                    {masterDriveEmail}
                  </span>
                </button>

                {/* Realtime Cloud Sync Badge (In-Memory Queue Status) */}
                {pendingSyncCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => flushFirestoreQueue()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 transition cursor-pointer shadow-3xs font-mono text-xs"
                    title="Data tersimpan instan di memori sementara. Klik untuk sinkronisasi paksa ke Cloud Firestore sekarang."
                  >
                    <RefreshCw size={12} className={isSyncingQueue ? "animate-spin text-amber-600" : "text-amber-600"} />
                    <span className="font-bold text-[11px] whitespace-nowrap">
                      {isSyncingQueue ? 'Menyinkron...' : `Antrian (${pendingSyncCount})`}
                    </span>
                  </button>
                ) : (
                  <div
                    className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-emerald-50/70 border border-emerald-250 text-emerald-800 font-mono text-[11px] font-bold"
                    title="Semua data tersimpan instan di memori & telah tersinkronisasi aman di Cloud Firestore"
                  >
                    <Check size={12} className="text-emerald-600" />
                    <span>Cloud Tersinkron</span>
                  </div>
                )}

                {/* Direct Pengaturan Page Button (Replaces User Dropdown) */}
                <button
                  type="button"
                  onClick={() => {
                    navigateTo('/');
                    setView('pengaturan');
                  }}
                  className="flex items-center gap-2 py-1.5 px-3 rounded-2xl hover:bg-stone-100 border border-stone-200 transition cursor-pointer select-none bg-stone-50"
                  title="Buka Halaman Pengaturan Akun, Tema & Cloud"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-xs">
                    {(userProfile?.fullName || 'Nur Wahyudi').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="hidden sm:flex flex-col items-start text-left">
                    <span className="text-xs font-sans font-black text-stone-900 leading-tight truncate max-w-[120px] sm:max-w-[160px]">
                      {userProfile?.fullName || 'Nur Wahyudi'}
                    </span>
                    <span className="text-[10px] text-stone-500 font-mono leading-tight flex items-center gap-1">
                      <Settings size={10} />
                      <span>Pengaturan</span>
                    </span>
                  </div>
                </button>
            </div>
          </div>
        </div>
      </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <InputBuktiTransfer 
            submissions={submissions} 
            userProfile={userProfile}
            onUpdateSubmissions={saveSubmissionsToStorage} 
            onBack={() => navigateTo('/')} 
          />
        </main>

        <footer className="bg-white border-t border-stone-200 py-6 print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-stone-400">
            <div>
              {userProfile?.companyName || 'PT. Nusantara Mineral Sukses Abadi'} &copy; 2026. Semua hak cipta dilindungi.
            </div>
            <div className="flex items-center gap-1 text-stone-200">
              Dibuat dengan <Heart size={10} className="fill-rose-500 text-rose-500 animate-pulse" /> untuk administrasi HO yang modern
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div id="app-root" className={`min-h-screen bg-stone-50 text-stone-850 flex flex-col antialiased theme-${theme}`}>
      
      {/* GLOBAL HEADER - Sticky at the top on scroll */}
      <header className="app-global-header bg-white border-b border-stone-200 sticky top-0 z-[1000] shadow-xs print:hidden">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-18 py-2 md:py-0">
            {/* Logo area - Responsive for mobile and desktop */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-3 cursor-pointer min-w-0" onClick={() => setView('list')}>
                <div className="p-1.5 sm:p-2.5 bg-stone-100 rounded-xl text-stone-850 shrink-0">
                  <Database size={17} className="text-gold-dynamic sm:w-5 sm:h-5" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <span className="font-mono text-[9px] sm:text-xs uppercase tracking-wider text-stone-400 font-bold block truncate max-w-[90px] sm:max-w-none">
                    {userProfile?.companyDetails?.code || userProfile?.companyDetails?.displayName || 'NMSA'}
                  </span>
                  <h1 className="text-xs sm:text-sm font-black text-stone-900 tracking-tight flex items-center gap-1.5 font-sans truncate max-w-[110px] sm:max-w-[200px] md:max-w-none">
                    <span className="sm:hidden">Portal Kas</span>
                    <span className="hidden sm:inline">{userProfile?.companyName ? `${userProfile.companyName} Portal` : 'Nusantara Mineral Payment Portal'}</span>
                  </h1>
                </div>
              </div>

              {/* Company Switcher Pill / Badge */}
              <button
                type="button"
                onClick={() => setIsCompanyModalOpen(true)}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 transition cursor-pointer shadow-3xs font-sans text-xs font-bold"
                title="Kelola & Ganti Perusahaan (Data Transaksi Firestore Terpisah)"
              >
                <Building2 size={13} className="text-amber-700 shrink-0" />
                <span className="truncate max-w-[130px]">
                  {userProfile?.companyDetails?.code || userProfile?.companyId?.toUpperCase() || 'NMSA'}
                </span>
                <span className="text-[9px] bg-amber-200/90 text-amber-900 px-1.5 py-0.2 rounded font-mono font-bold shrink-0">
                  Ganti
                </span>
              </button>

            </div>

            {/* HEADER RIGHT ACTIONS: CLEAN, COMPACT & RESPONSIVE */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {/* Real-time System Clock (WIB) - Shown on tablet/desktop to save mobile width */}
              <LiveClock variant="badge" className="hidden sm:inline-flex min-w-0 max-w-[160px] sm:max-w-[220px]" />

              {/* Direct Dedicated Button: Bulanan & Agenda Pengingat */}
              {(() => {
                const totalBulananBadge = pendingMonthlySummary.pendingCount + agendaDueCount;
                const hasUrgent = pendingMonthlySummary.overdueCount > 0 || agendaDueCount > 0;
                const isBulananActive = view === 'bulanan' || view === 'agenda';
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setBulananInitialTab('recurring');
                      setView(isBulananActive ? 'list' : 'bulanan');
                    }}
                    className={`relative flex items-center gap-1.5 py-1.5 px-3 rounded-xl border transition cursor-pointer shadow-3xs text-xs font-bold font-sans whitespace-nowrap shrink-0 ${
                      isBulananActive
                        ? 'bg-amber-500 text-stone-950 border-amber-600'
                        : hasUrgent
                        ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-900'
                        : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-800'
                    }`}
                    title={`Transaksi Bulanan (${pendingMonthlySummary.pendingCount} belum bayar) & Agenda Kerja (${agendaDueCount} jatuh tempo)`}
                  >
                    <CalendarClock size={14} className={isBulananActive ? 'text-stone-950' : hasUrgent ? 'text-rose-600' : 'text-amber-600'} />
                    <span className="hidden lg:inline">Bulanan</span>
                    {totalBulananBadge > 0 && (
                      <span className="inline-flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-mono font-bold text-white tabular-nums">
                        {totalBulananBadge}
                      </span>
                    )}
                  </button>
                );
              })()}

              {/* Direct Dedicated Button: Menu & Alat View (Replaces Dropdown) */}
              <button
                type="button"
                onClick={() => setView(view === 'menu_alat' ? 'list' : 'menu_alat')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl border transition cursor-pointer shadow-3xs text-xs font-bold font-sans whitespace-nowrap shrink-0 ${
                  view === 'menu_alat'
                    ? 'bg-amber-500 text-stone-950 border-amber-600'
                    : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-850'
                }`}
                title="Buka Tampilan Lengkap Menu & Alat Operasional"
              >
                <LayoutGrid size={14} className={view === 'menu_alat' ? 'text-stone-950' : 'text-amber-600'} />
                <span className="hidden sm:inline font-sans">Menu &amp; Alat</span>
              </button>

              {/* Direct Dedicated Button: Pengaturan View (Replaces User Dropdown) */}
              <button
                type="button"
                onClick={() => setView(view === 'pengaturan' ? 'list' : 'pengaturan')}
                className={`flex items-center gap-1.5 sm:gap-2 py-1.5 px-2.5 sm:px-3 rounded-2xl border transition cursor-pointer select-none shrink-0 ${
                  view === 'pengaturan'
                    ? 'bg-amber-500 text-stone-950 border-amber-600'
                    : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-900'
                }`}
                title="Buka Tampilan Pengaturan (Profil, Perusahaan, Tema, Drive, Firebase & Logout)"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-xs shrink-0">
                  {(userProfile?.fullName || 'Nur Wahyudi').substring(0, 2).toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col items-start text-left">
                  <span className="text-xs font-sans font-black leading-tight truncate max-w-[120px] sm:max-w-[160px]">
                    {userProfile?.fullName || 'Nur Wahyudi'}
                  </span>
                  <span className={`text-[10px] font-mono leading-tight flex items-center gap-1 ${view === 'pengaturan' ? 'text-stone-900 font-bold' : 'text-stone-500'}`}>
                    <Settings size={10} />
                    <span>Pengaturan</span>
                  </span>
                </div>
              </button>
            </div>
          </div>
      </div>
    </header>

    {/* PERSISTENT REMINDER BANNER FOR DUE / OVERDUE AGENDA ITEMS */}
    <AgendaReminderBanner
      agendaItems={agendaItems}
      onToggleComplete={handleToggleAgendaComplete}
      onOpenAgendaView={() => {
        setBulananInitialTab('agenda');
        setView('bulanan');
      }}
      onPostponeOneDay={handlePostponeAgenda}
    />

    {/* FIRESTORE QUOTA EXCEEDED INFORMATIONAL NOTICE */}
    {showQuotaBanner && (
      <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-b border-amber-300 px-4 py-2.5 text-xs text-amber-950 font-sans print:hidden animate-fade-in shadow-3xs">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-1 px-2 rounded-md bg-amber-500 text-stone-950 font-black text-[10px] uppercase font-mono shrink-0">
              Info Kuota Cloud
            </span>
            <span className="leading-snug text-xs text-stone-800">
              <strong>Batas kuota harian gratis Firebase (Spark Plan) telah tercapai.</strong> Seluruh data Anda 100% aman dan otomatis disimpan di penyimpanan lokal &amp; server sinkronisasi internal. Kuota gratis Firebase akan direset secara otomatis besok hari.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <a
              href="https://console.firebase.google.com/project/pencatatan-voucher-perusahaan/firestore/databases/(default)/data?openUpgradeDialog=true"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition inline-flex items-center gap-1 shadow-3xs cursor-pointer"
            >
              <span>Upgrade / Buka Console</span>
              <ExternalLink size={12} />
            </a>
            <a
              href="https://firebase.google.com/pricing#cloud-firestore"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-lg font-bold text-[11px] transition inline-flex items-center gap-1 shadow-3xs cursor-pointer"
            >
              <span>Dokumentasi Biaya</span>
              <ExternalLink size={12} />
            </a>
            <button
              type="button"
              onClick={() => {
                resetFirestoreQuotaCooldown();
                setShowQuotaBanner(false);
              }}
              className="p-1 hover:bg-amber-200/70 rounded-md text-amber-900 transition cursor-pointer"
              title="Tutup pemberitahuan"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    )}

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 pb-24 md:pb-8">
        
        {/* VIEW 1: Submissions Data History & Backup Operations */}
        <div className={view === 'list' ? 'space-y-6' : 'hidden'}>
          {/* Compact Monthly Recurring Transaction Reminder Strip (< Tgl 15) */}
          {pendingMonthlySummary.pendingCount > 0 && (
            <div
              className={`rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs ${
                pendingMonthlySummary.overdueCount > 0
                  ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                  : 'bg-amber-50/80 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    pendingMonthlySummary.overdueCount > 0
                      ? 'bg-rose-600 text-white'
                      : 'bg-amber-500 text-stone-950'
                  }`}
                >
                  <CalendarClock size={16} />
                </div>
                <div className="min-w-0 text-xs">
                  <div className="font-black">
                    Transaksi Bulanan {pendingMonthlySummary.monthLabel}:{' '}
                    <span className="tabular-nums">{pendingMonthlySummary.pendingCount}</span> belum dijalankan (batas sebelum Tgl 15)
                  </div>
                  <div className="text-[11px] text-stone-600 truncate">
                    {pendingMonthlySummary.pendingItems
                      .slice(0, 3)
                      .map((p) => `${p.item.title} (Tgl ${p.detection.dueDay})`)
                      .join(' · ')}
                    {pendingMonthlySummary.pendingItems.length > 3 ? ` · +${pendingMonthlySummary.pendingItems.length - 3} lainnya` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setView('bulanan')}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition cursor-pointer shrink-0"
              >
                <span>Buka Transaksi Bulanan</span>
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          {/* Main Listing components */}
          <SubmissionsList
            submissions={submissions}
            layoutMode={layoutMode}
            onLayoutModeChange={setLayoutMode}
            userProfile={userProfile}
            pettyCashHolders={pettyCashHolders}
            onForceCloudSync={() => handleForceCloudSync(false)}
            onRestoreBackupToFirestore={handleRestoreBackupToFirestore}
            onUploadSingleToFirestore={handleUploadSingleToFirestore}
            onUploadUnsyncedToFirestore={handleUploadUnsyncedToFirestore}
            unsyncedSubmissionIds={unsyncedSubmissionIds}
            uploadingSubmissionIds={uploadingSubIds}
            hasCloudInventory={hasCloudInventory}
            onOpenDriveCleaner={() => setIsDriveOrphanCleanerOpen(true)}
            isCloudSyncing={isCloudSyncing}
            cloudSyncNotice={cloudSyncNotice}
            onDismissCloudSyncNotice={() => setCloudSyncNotice(null)}
            onOpenConsolidateModal={() => setIsConsolidateNamesModalOpen(true)}
            onOpenPph23View={() => setView('pph23')}
            onOpenRabView={() => setView('rab')}
            onOpenLoanManager={() => setView('pinjaman')}
            onSelect={(sub, initialTab) => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
              triggerGoogleDriveAutoRefresh('lihat-transaksi', false, false).catch(() => {});
              setActiveSubmission(sub);
              setPrintInitialTab(initialTab || 'both');
              setView('print');
            }}
            onEdit={(sub) => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
              triggerGoogleDriveAutoRefresh('edit-transaksi', false, false).catch(() => {});
              setEditingSubmission(sub);
              setView('form');
            }}
            onOpenSppdEditor={(sub) => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
              handleOpenSppdEditor(sub);
            }}
            onOpenSppdManager={() => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
              setView('sppd');
            }}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onAddNew={() => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
              triggerGoogleDriveAutoRefresh('input-pengajuan-baru', false, false).catch(() => {});
              setEditingSubmission(null);
              setView('form');
            }}
            onOpenBuktiTransfer={(targetSub) => {
              setUploadBuktiModalSub(targetSub || null);
              setIsUploadBuktiModalOpen(true);
            }}
            onMarkAsPaid={handleMarkAsPaid}
            onCreateMemo={(sub) => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
              setMemoSubmissionTarget(sub);
              setView('memo');
            }}
          />

          {/* Backup / Export-Import Section */}
          <div className="pt-4 print:hidden space-y-4">
            {/* Quick Action Card: Salin / Migrasi Data ke Firebase Baru */}
            <div className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-3xs">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500 text-stone-955 rounded-xl shadow-3xs">
                  <ArrowLeftRight size={22} />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-stone-900 uppercase tracking-wider font-display flex items-center gap-2">
                    Salin Data ke Akun Firebase Lain
                    <span className="text-[9px] font-mono normal-case bg-amber-200 text-amber-950 px-2 py-0.5 rounded-full font-bold">
                      Migrasi Proyek
                    </span>
                  </h4>
                  <p className="text-xs text-stone-600 mt-0.5">
                    Pindahkan seluruh data transaksi voucher, profil multi-perusahaan, SPPD, NPWP, dan absensi ke proyek Firebase baru tanpa downtime.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFirebaseMigrationOpen(true)}
                className="px-4 py-2.5 text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition flex items-center gap-2 shadow-3xs cursor-pointer shrink-0"
              >
                <span>Buka Menu Salin Data</span>
                <ArrowRight size={14} />
              </button>
            </div>

            <DriveSyncMass submissions={submissions} onUpdateSubmissions={saveSubmissionsToStorage} />
          </div>
        </div>

        {/* VIEW 2: Input / Edit Submission Form */}
        {view === 'form' && (
          <SubmissionForm
            initialSubmission={editingSubmission}
            userProfile={userProfile}
            submissions={submissions}
            projects={projects}
            projectRab={projectRab}
            pettyCashHolders={pettyCashHolders}
            custodiansConfig={pettyCashCustodiansConfig}
            onOpenManageHolders={() => setIsHoldersModalOpen(true)}
            onOpenConsolidateModal={() => setIsConsolidateNamesModalOpen(true)}
            onSave={handleSaveSubmission}
            onCancel={() => {
              setEditingSubmission(null);
              setView(previousView || 'list');
            }}
          />
        )}

        {/* VIEW 3: Print document presentation with precision styles */}
        {view === 'print' && activeSubmission && (
          <PrintDocument
            submission={activeSubmission}
            userProfile={userProfile}
            initialTab={printInitialTab}
            onBack={() => {
              setActiveSubmission(null);
              setView(previousView || 'list');
            }}
            onEdit={() => {
              setEditingSubmission(activeSubmission);
              setView('form');
            }}
            onOpenSppdEditor={() => handleOpenSppdEditor(activeSubmission)}
            onNavigateToPettyCashMapping={(sub) => {
              setTargetAccurateSubmission(sub);
              setPreviousView('print');
              setView('accurate', { preservePrevious: true });
            }}
            onUpdateSubmission={async (updated) => {
              setActiveSubmission(updated);
              const updatedList = submissions.map((s) => (s.id === updated.id ? updated : s));
              saveSubmissionsToStorage(updatedList);
              if (isFirebaseConfigured()) {
                try {
                  await saveSubmissionToFirestore(updated, userProfile?.companyId, userProfile?.companyName);
                } catch (e) {
                  console.warn('Silent fallback onUpdateSubmission firestore save:', e);
                }
              }
              try {
                fetch('/api/sync-submissions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ submission: updated }),
                }).catch(() => {});
              } catch (_) {}
            }}
          />
        )}

        {/* VIEW 4: Modul Kelola SPPD (Perjalanan Dinas) */}
        {view === 'sppd' && (
          <SppdManager
            onPostToVoucherHO={(sppd) => handleImportSppdToSubmission(sppd)}
            onClose={() => setView('list')}
            initialSppdId={targetSppdId}
          />
        )}

        {/* VIEW 5: Modul Absensi Harian NMSA */}
        {view === 'absen' && (
          <AbsensiHarianNmsa
            onClose={() => setView('list')}
            pettyCashHolders={pettyCashHolders}
            onUpdatePettyCashHolders={setPettyCashHolders}
            pettyCashReports={pettyCashReports}
            onUpdatePettyCashReports={handleSavePettyCashReports}
            submissions={submissions}
            onPostToVoucherHO={(newSub) => {
              handleSaveSubmission(newSub);
            }}
            userProfile={userProfile}
          />
        )}

        {/* VIEW 6: Modul Master List NPWP & Invoice Vendor */}
        {view === 'npwp' && (
          <NpwpManager
            npwpRecords={npwpRecords}
            onSaveNpwpRecords={handleSaveNpwpRecords}
            onSyncFromCloud={handleSyncNpwpFromCloud}
            submissions={submissions}
            onSelectSubmissionForPrint={(sub) => {
              setPreviousView('npwp');
              setActiveSubmission(sub);
              setView('print');
            }}
            onBack={() => setView('list')}
          />
        )}

        {/* VIEW 7: Modul Pemetaan Akun (Accurate Petty Cash & SPPD Perjalanan Dinas) */}
        {view === 'accurate' && (
          <AccountMappingContainer
            pettyCashReports={pettyCashReports}
            submissions={submissions}
            userProfile={userProfile}
            pettyCashHolders={pettyCashHolders}
            targetSubmission={targetAccurateSubmission}
            onClearTargetSubmission={() => setTargetAccurateSubmission(null)}
            onUpdatePettyCashHolders={handleSavePettyCashHolders}
            onSaveSubmission={handleSaveSubmission}
            onSelectSubmissionForView={(sub) => {
              setActiveSubmission(sub);
              setPrintInitialTab('both');
              setView('print');
            }}
            onOpenSppdForm={() => {
              setView('sppd');
            }}
            onPostToVoucherHO={(sppd) => {
              handleImportSppdToSubmission(sppd);
            }}
            onBack={() => setView(previousView || 'list')}
          />
        )}

        {/* Modul Agenda kini terintegrasi di dalam menu Bulanan */}

        {/* VIEW 9: Modul Buku Besar Sub-Jenis Pengajuan (General Ledger) */}
        {view === 'ledger' && (
          <GeneralLedger
            submissions={submissions}
            userProfile={userProfile}
            onOpenSubmissionForPrint={(sub) => {
              setActiveSubmission(sub);
              setPrintInitialTab('both');
              setView('print');
            }}
            onEditSubmissionNote={(sub) => {
              setEditingSubmission(sub);
              setView('form');
            }}
            onClose={() => setView(previousView || 'list')}
            onOpenRab={() => setView('rab')}
          />
        )}

        {/* VIEW 10: Modul Bukti Potong PPh 23 (Biaya PSi & Jasa Rekanan) - Coretax DJP Ready */}
        {view === 'pph23' && (
          <Pph23BupotRecap
            submissions={submissions}
            npwpRecords={npwpRecords}
            onSaveNpwpRecords={handleSaveNpwpRecords}
            onSyncNpwpFromCloud={handleSyncNpwpFromCloud}
            onUpdateSubmission={handleSaveSubmission}
            onSelectSubmission={(sub) => {
              setActiveSubmission(sub);
              setPrintInitialTab('both');
              setView('print');
            }}
            onBackToVoucher={() => setView('list')}
          />
        )}

        {/* VIEW 11: Modul Rencana Anggaran Biaya (RAB) & Pengeluaran Proyek (Accurate Style) */}
        {view === 'rab' && (
          <ProjectBudgetRab
            projects={projects}
            projectRab={projectRab}
            projectExpenses={projectExpenses}
            submissions={submissions}
            onSaveProject={handleSaveProject}
            onDeleteProject={handleDeleteProject}
            onSaveRabItem={handleSaveRabItem}
            onDeleteRabItem={handleDeleteRabItem}
            onSaveExpense={handleSaveExpense}
            onDeleteExpense={handleDeleteExpense}
            onCreateVoucherForProject={(projectId, rabItemId) => {
              const proj = projects.find(p => p.id === projectId);
              const rItem = projectRab.find(r => r.id === rabItemId);
              setEditingSubmission({
                id: '',
                kode: 'HO',
                tanggal: new Date().toISOString().split('T')[0],
                jenisPengajuan: 'Biaya Kantor',
                dibayarkanKepada: '',
                dibayarkanDengan: 'Cek/Transfer',
                status: 'Belum Lunas',
                projectId: projectId,
                projectName: proj?.name,
                projectCode: proj?.code,
                projectRabItemId: rabItemId,
                projectRabItemName: rItem?.name,
                projectAccountCode: rItem?.accountCode,
                projectAccountName: rItem?.accountName,
                notes: rItem ? `Realisasi Pos RAB [${rItem.accountCode || ''}] ${rItem.name}` : '',
                items: [
                  {
                    id: 'it-1',
                    item: rItem ? `${rItem.name} (${rItem.accountName || rItem.category})` : '',
                    volume: '1',
                    satuan: 'Lumpsum',
                    hargaSatuan: 0,
                    total: 0,
                    keterangan: proj ? `Proyek ${proj.name}` : ''
                  }
                ]
              } as any);
              setPreviousView('rab');
              setView('form');
            }}
            onViewSubmission={(sub) => {
              if (sub) {
                setActiveSubmission(sub);
                setPrintInitialTab('pengeluaran');
                setPreviousView('rab');
                setView('print');
              }
            }}
            onBackToLedger={() => setView('ledger')}
            onBackToVoucher={() => setView('list')}
          />
        )}

        {/* VIEW 12: Internal Memo Resmi Direksi */}
        {view === 'memo' && (
          <InternalMemoManager
            submissions={submissions}
            initialSubmissionForMemo={memoSubmissionTarget}
            onBackToList={() => setView('list')}
            userProfile={userProfile}
            onCreateVoucher={handleCreateVoucherFromMemo}
          />
        )}

        {/* VIEW 13: Modul Form Pinjaman Karyawan & Pencatatan / Perhitungan Pembayaran Cicilan */}
        {view === 'pinjaman' && (
          <EmployeeLoanManager
            onBackToList={() => setView('list')}
            workers={getSynchronizedAttendanceWorkers()}
            userProfile={userProfile}
            onCreateVoucher={handleCreateVoucherFromLoan}
            submissions={submissions}
            onViewSubmission={(sub) => {
              setEditingSubmission(sub);
              setView('form');
            }}
          />
        )}

        {/* VIEW 14: Modul Jadwal Bulanan & Pengingat Agenda (Terpadu) */}
        {(view === 'bulanan' || view === 'agenda') && (
          <MonthlyTransactionsManager
            items={monthlyTransactions}
            submissions={submissions}
            activeCompanyId={userProfile?.companyId}
            userProfile={userProfile}
            onSaveItems={handleSaveMonthlyTransactions}
            onCreateVoucher={handleCreateVoucherFromMonthly}
            onViewVoucher={(sub) => {
              setActiveSubmission(sub);
              setPrintInitialTab('both');
              setPreviousView('bulanan');
              setView('print', { preservePrevious: true });
            }}
            onUploadPaymentProof={(sub) => {
              setUploadBuktiModalSub(sub);
              setIsUploadBuktiModalOpen(true);
            }}
            onBackToList={() => setView('list')}
            agendaItems={agendaItems}
            onSaveAgendaItems={handleSaveAgendaItems}
            initialSubTab={view === 'agenda' ? 'agenda' : bulananInitialTab}
            onSubTabChange={(tab) => setBulananInitialTab(tab)}
          />
        )}

        {/* VIEW 15: Tampilan Khusus Menu & Alat Operasional */}
        {view === 'menu_alat' && (
          <MenuAlatView
            currentView={view}
            pendingMonthlySummary={pendingMonthlySummary}
            agendaDueCount={agendaDueCount}
            masterDriveEmail={masterDriveEmail}
            onBackToDashboard={() => setView('list')}
            onNavigateView={(target) => {
              if (target === 'memo') setMemoSubmissionTarget(null);
              setView(target);
            }}
            onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
            onOpenGoogleDrive={() => setIsGoogleDriveSettingsOpen(true)}
            onOpenDriveCleaner={() => setIsDriveOrphanCleanerOpen(true)}
          />
        )}

        {/* VIEW 16: Tampilan Khusus Pengaturan Sistem & Akun */}
        {view === 'pengaturan' && (
          <PengaturanView
            userProfile={userProfile}
            authUser={authUser}
            theme={theme}
            masterDriveEmail={masterDriveEmail}
            onSelectTheme={(t) => handleSelectTheme(t)}
            onBackToDashboard={() => setView('list')}
            onOpenProfile={() => setIsProfileOpen(true)}
            onOpenCompanyModal={() => setIsCompanyModalOpen(true)}
            onOpenThemeGallery={() => setIsThemeModalOpen(true)}
            onOpenGoogleDrive={() => {
              setDriveSettingsInitialTab('whitelist');
              setDriveSettingsTargetEmail('');
              setIsGoogleDriveSettingsOpen(true);
            }}
            onOpenDriveStorage={() => setView('drive_storage')}
            onOpenDriveDeduplicate={() => setIsDriveDeduplicateModalOpen(true)}
            onOpenDriveCleaner={() => setIsDriveOrphanCleanerOpen(true)}
            onOpenFirebaseQuota={() => setIsFirebaseQuotaModalOpen(true)}
            onOpenCloudModal={() => setIsCloudModalOpen(true)}
            onOpenFirebaseMigration={() => setIsFirebaseMigrationOpen(true)}
            onOpenExportImport={() => setIsExportImportModalOpen(true)}
            onOpenCleanFirestore={() => setIsCleanFirestoreModalOpen(true)}
            onLogout={handleLogout}
            onForceCloudSync={() => handleForceCloudSync(false)}
            isCloudSyncing={isCloudSyncing}
            submissionCount={submissions.length}
          />
        )}

        {/* VIEW 17: Penyimpanan Google Drive (Eksklusif Akun Terdaftar & 3 Folder Utama) */}
        {view === 'drive_storage' && (
          <GoogleDriveBrowser
            onBackToDashboard={() => setView('list')}
            onOpenDriveSettings={(tab = 'whitelist', targetEmail = '') => {
              setDriveSettingsInitialTab(tab);
              setDriveSettingsTargetEmail(targetEmail);
              setIsGoogleDriveSettingsOpen(true);
            }}
          />
        )}

      </main>

      {/* COMPACT FOOTER - Hidden on print */}
      <footer className="bg-white border-t border-stone-200 py-6 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-stone-400">
          <div>
            {userProfile?.companyName || 'PT. Nusantara Mineral Sukses Abadi'} &copy; 2026. Semua hak cipta dilindungi.
          </div>
          <div className="flex items-center gap-1 text-stone-300">
            Dibuat dengan <Heart size={10} className="fill-rose-500 text-rose-500 animate-pulse" /> untuk administrasi HO yang lebih modern & efisien
          </div>
        </div>
      </footer>

      {/* User Profile Details & Storage Manager Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userProfile={userProfile}
        authUser={authUser}
        onOpenCompanySwitcher={() => setIsCompanyModalOpen(true)}
        onOpenFirebaseQuota={() => setIsFirebaseQuotaModalOpen(true)}
      />

      {/* Multi-Tenant Firebase Company Switcher & Creation Modal */}
      <CompanySwitcherModal
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        currentCompanyId={userProfile?.companyId || 'nmsa'}
        onSelectCompany={handleSwitchCompany}
        currentUserName={userProfile?.fullName || 'Nur Wahyudi'}
      />

      {/* Master List Pemegang Petty Cash Modal */}
      <PettyCashHoldersModal
        isOpen={isHoldersModalOpen}
        onClose={() => setIsHoldersModalOpen(false)}
        holders={pettyCashHolders}
        custodiansConfig={pettyCashCustodiansConfig}
        onSaveConfig={handleSaveCustodiansConfig}
        onSaveHolders={handleSavePettyCashHolders}
        onOpenConsolidation={() => setIsConsolidateNamesModalOpen(true)}
      />

      {/* Satukan Variasi Nama & Deduplikasi Modal */}
      <ConsolidateNamesModal
        isOpen={isConsolidateNamesModalOpen}
        onClose={() => setIsConsolidateNamesModalOpen(false)}
        submissions={submissions}
        pettyCashHolders={pettyCashHolders}
        pettyCashReports={pettyCashReports}
        onApplyConsolidation={handleApplyConsolidation}
      />

      {/* Pusat Layanan Awan & Integrasi Modal */}
      {isCloudModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col font-sans">
            <div className="flex items-center justify-between px-6 py-4 bg-stone-900 text-white border-b border-stone-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <Cloud size={20} className="text-amber-400" />
                <div>
                  <h3 className="text-sm font-black tracking-tight text-white">Pusat Layanan Awan & Integrasi Data</h3>
                  <p className="text-[10px] text-stone-300 font-mono">
                    Sinkronisasi Firebase, Export-Import Google Sheets & SPPD
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCloudModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition cursor-pointer"
                title="Tutup Modal"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <CloudControlCenter
                submissions={submissions}
                userProfile={userProfile}
                onSyncData={handleFirebaseSync}
                onUpdateSubmissions={saveSubmissionsToStorage}
                onImportSuccess={handleSheetsImport}
                onImportSppdToSubmission={handleImportSppdToSubmission}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pengaturan Master Google Drive & Whitelist Modal */}
      <GoogleDriveSettingsModal
        isOpen={isGoogleDriveSettingsOpen}
        onClose={() => setIsGoogleDriveSettingsOpen(false)}
        initialTab={driveSettingsInitialTab}
        targetEmailForToken={driveSettingsTargetEmail}
        onOpenDriveBrowser={() => {
          setIsGoogleDriveSettingsOpen(false);
          setView('drive_storage');
        }}
      />

      {/* Pembersih Folder Google Drive Transaksi Terhapus */}
      <DriveOrphanCleanerModal
        isOpen={isDriveOrphanCleanerOpen}
        onClose={() => setIsDriveOrphanCleanerOpen(false)}
        submissions={submissions}
      />

      {/* Monitoring Kuota & Sinkronisasi Firebase */}
      <FirebaseQuotaModal
        isOpen={isFirebaseQuotaModalOpen}
        onClose={() => setIsFirebaseQuotaModalOpen(false)}
        onNpwpSynced={(records) => setNpwpRecords(records)}
        onWorkersSynced={(wrks) => {
          localStorage.setItem('karyawan_uang_makan', JSON.stringify(wrks));
          localStorage.setItem('workers_v1', JSON.stringify(wrks));
          window.dispatchEvent(new CustomEvent('nmsa-workers-updated', { detail: { workers: wrks } }));
        }}
      />

      {/* Pop-up Khusus Upload Bukti Pembayaran */}
      <UploadBuktiTransferModal
        isOpen={isUploadBuktiModalOpen}
        onClose={() => {
          setIsUploadBuktiModalOpen(false);
          setUploadBuktiModalSub(null);
        }}
        submission={uploadBuktiModalSub}
        allSubmissions={submissions}
        onUpdateSubmission={(updatedSub) => {
          const nextList = submissions.map(s => s.id === updatedSub.id ? updatedSub : s);
          saveSubmissionsToStorage(nextList);
          if (editingSubmission?.id === updatedSub.id) {
            setEditingSubmission(updatedSub);
          }
          if (uploadBuktiModalSub?.id === updatedSub.id) {
            setUploadBuktiModalSub(updatedSub);
          }
        }}
        userProfile={userProfile}
      />

      {/* Integrasi WhatsApp Business AI & Pusat Data Modal */}
      {isWhatsAppModalOpen && (
        <WhatsAppAiModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
        />
      )}

      {/* Salin Data ke Akun Firebase Lain (Migrasi Proyek) Modal */}
      {isFirebaseMigrationOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200 print:hidden">
          <div className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col font-sans my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-stone-900 text-white border-b border-stone-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500 text-stone-950 rounded-xl shadow-3xs">
                  <ArrowLeftRight size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-2">
                    Salin Data ke Akun Firebase Lain
                    <span className="text-[9px] font-mono bg-amber-400 text-stone-950 px-2 py-0.5 rounded-full font-bold">
                      Migrasi Proyek
                    </span>
                  </h3>
                  <p className="text-[10px] text-stone-300 font-mono">
                    Duplikasi seluruh transaksi voucher, profil multi-PT, SPPD, dan NPWP ke akun atau proyek Firebase baru
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFirebaseMigrationOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition cursor-pointer"
                title="Tutup Modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto flex-1">
              <FirebaseMigration
                submissions={submissions}
                userProfile={userProfile}
                onMigrationComplete={() => {
                  setIsFirebaseMigrationOpen(false);
                }}
                isModalDirect={true}
                onCloseModal={() => setIsFirebaseMigrationOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ekspor / Impor Data Backup Modal */}
      <JsonBackup
        isOpen={isExportImportModalOpen}
        onClose={() => setIsExportImportModalOpen(false)}
        submissions={submissions}
        onImport={handleImportJson}
        isModal={true}
      />

      {/* Galeri Tema Estetika & Karakter Animasi Modal */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentTheme={theme}
        onSelectTheme={(t) => handleSelectTheme(t)}
      />

      {/* Bersihkan Koleksi Tak Terpakai di Firestore Modal */}
      <CleanFirestoreModal
        isOpen={isCleanFirestoreModalOpen}
        onClose={() => setIsCleanFirestoreModalOpen(false)}
        onSuccess={() => {
          // Sukses pembersihan koleksi tak terpakai
        }}
      />

      {/* Auto-Refresh & Bersihkan Duplikat Google Drive Modal */}
      <DriveDeduplicateModal
        isOpen={isDriveDeduplicateModalOpen}
        onClose={() => setIsDriveDeduplicateModalOpen(false)}
        submissions={submissions}
        onUpdateSubmissions={(updated) => {
          saveSubmissionsToStorage(updated);
        }}
      />

    </div>
  );
}

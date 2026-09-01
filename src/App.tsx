import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Submission, SubmissionItem, PettyCashReport, TransactionType, NpwpRecord, AgendaItem } from './types';
import { INITIAL_SUBMISSIONS } from './data/initialData';
import { INITIAL_AGENDA_ITEMS } from './data/initialAgenda';
import { SubmissionsList } from './components/SubmissionsList';
import { SubmissionForm } from './components/SubmissionForm';
import { PrintDocument } from './components/PrintDocument';
import { JsonBackup } from './components/JsonBackup';
import { DriveSyncMass } from './components/DriveSyncMass';
import { NusantaraLogo } from './components/NusantaraLogo';
import { CloudControlCenter } from './components/CloudControlCenter';
import { SppdIntegration, SppdRecord } from './components/SppdIntegration';
import { SppdManager, SPPDRecord } from './components/SppdManager';
import { PublicSppdInput } from './components/PublicSppdInput';
import { AuthGate } from './components/AuthGate';
import { InputBuktiTransfer } from './components/InputBuktiTransfer';
import { UserProfileModal } from './components/UserProfileModal';
import { GoogleDriveSettingsModal } from './components/GoogleDriveSettingsModal';
import { AbsensiHarianNmsa } from './components/AbsensiHarianNmsa';
import { PettyCashHoldersModal } from './components/PettyCashHoldersModal';
import { NpwpManager } from './components/NpwpManager';
import { AccuratePettyCashMapping } from './components/AccuratePettyCashMapping';
import { AccountMappingContainer } from './components/AccountMappingContainer';
import { AgendaManager } from './components/AgendaManager';
import { AgendaReminderBanner } from './components/AgendaReminderBanner';
import { WhatsAppAiModal } from './components/WhatsAppAiModal';
import { isPettyCashSubmission, getPettyCashCustodian, isInvoiceSubmission, formatDateIndonesian } from './utils';
import { 
  isFirebaseConfigured, 
  saveSubmissionToFirestore, 
  deleteSubmissionFromFirestore,
  deleteGoogleDriveFile,
  registerAuthChangeListener,
  getUserProfileFromFirestore,
  loadSubmissionsFromFirestore,
  getCompanyProfileFromFirestore,
  logoutFromFirebase,
  saveActivityLogToFirestore,
  getSubmissionFromFirestore,
  loadNpwpRecordsFromFirestore,
  saveNpwpRecordsToFirestore,
  deleteNpwpRecordFromFirestore,
  loadSppdRecordsFromFirestore,
  saveSppdRecordsToFirestore,
  deleteSppdRecordFromFirestore,
  loadConnectedDrivesFromFirestore,
  startGoogleDriveTokenAutoRefresh,
  ensureValidDriveToken,
  getMasterDriveEmail,
  getActiveGoogleDriveAccount,
  subscribeToCompanySettingsFromFirestore,
  saveCompanySettingsToFirestore
} from './firebase';
import { Database, FileText, CheckSquare, ShieldCheck, Heart, Cloud, Palette, Loader2, ArrowRight, LogIn, Printer, Users, Receipt, FileSpreadsheet, ChevronDown, LogOut, LayoutGrid, Settings, Check, Coins, History, AlertCircle, X, Briefcase, Layers, Calendar, Bell, MessageSquare, Bot } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<'classic' | 'gold-dark' | 'emerald' | 'slate'>(() => {
    try {
      return (localStorage.getItem('NUSANTARA_THEME') as any) || 'classic';
    } catch (e) {
      return 'classic';
    }
  });

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
      const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Error loading cached submissions on init:', e);
      return [];
    }
  });

  // Petty Cash master state
  const [pettyCashHolders, setPettyCashHolders] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('petty_cash_holders_v2');
      return stored ? JSON.parse(stored) : ['Suryo Pranoto', 'Muhammad Akbar', 'Nurul Izza', 'Andi Dhiya Salsabila'];
    } catch (e) {
      return ['Suryo Pranoto', 'Muhammad Akbar', 'Nurul Izza', 'Andi Dhiya Salsabila'];
    }
  });

  const [pettyCashReports, setPettyCashReports] = useState<PettyCashReport[]>(() => {
    try {
      const stored = localStorage.getItem('petty_cash_reports');
      return stored ? JSON.parse(stored) : [];
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
      return INITIAL_AGENDA_ITEMS;
    } catch (e) {
      return INITIAL_AGENDA_ITEMS;
    }
  });

  const [isHoldersModalOpen, setIsHoldersModalOpen] = useState(false);

  // Real-time Cloud Firestore subscription & Shared State sync across all computers/devices
  useEffect(() => {
    // 1. Subscribe to Firestore real-time snapshot for instant updates across devices
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
      if (settings.theme && ['classic', 'gold-dark', 'emerald', 'slate'].includes(settings.theme)) {
        setTheme(settings.theme as any);
      }
    });

    // 2. Initial fallback fetch from server /api/shared-state
    fetch('/api/shared-state')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          if (data.pettyCashHolders && Array.isArray(data.pettyCashHolders) && data.pettyCashHolders.length > 0) {
            setPettyCashHolders(data.pettyCashHolders);
            localStorage.setItem('petty_cash_holders_v2', JSON.stringify(data.pettyCashHolders));
          }
          if (data.pettyCashReports && Array.isArray(data.pettyCashReports)) {
            setPettyCashReports(data.pettyCashReports);
            localStorage.setItem('petty_cash_reports', JSON.stringify(data.pettyCashReports));
          }
          if (data.npwpRecords && Array.isArray(data.npwpRecords) && data.npwpRecords.length > 0) {
            setNpwpRecords(prev => {
              const map = new Map<string, NpwpRecord>();
              prev.forEach(r => map.set(r.id, r));
              data.npwpRecords.forEach((r: NpwpRecord) => map.set(r.id, r));
              const merged = Array.from(map.values());
              localStorage.setItem('npwp_records_v1', JSON.stringify(merged));
              return merged;
            });
          }
          if (data.sppdRecords && Array.isArray(data.sppdRecords) && data.sppdRecords.length > 0) {
            setSppdRecords(prev => {
              const map = new Map<string, SPPDRecord>();
              prev.forEach(r => map.set(r.id, r));
              data.sppdRecords.forEach((r: SPPDRecord) => map.set(r.id, r));
              const merged = Array.from(map.values());
              localStorage.setItem('sppd_records_v1', JSON.stringify(merged));
              return merged;
            });
          }
        }
      })
      .catch(err => console.error('Gagal memuat shared state:', err));

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
      .catch(err => console.warn('Firestore SPPD sync skipped:', err));

    // Automatically sync Google Drive connection across the entire app
    loadConnectedDrivesFromFirestore()
      .then(drives => {
        if (drives && drives.length > 0) {
          console.log(`☁️ Synced ${drives.length} Google Drive account(s) globally from Firestore.`);
        }
      })
      .catch(err => console.warn('Firestore Drive sync skipped:', err));

    // Start background auto-keeper for Google Drive token
    const stopAutoRefresh = startGoogleDriveTokenAutoRefresh(3);

    return () => {
      unsubscribeCompany();
      stopAutoRefresh();
    };
  }, []);

  // Auto-sync Petty Cash submissions into pettyCashReports & pettyCashHolders
  useEffect(() => {
    if (!submissions || submissions.length === 0) return;

    let holdersChanged = false;
    let newHoldersList = [...pettyCashHolders];

    let reportsChanged = false;
    let updatedReports = [...pettyCashReports];

    submissions.forEach((sub) => {
      const isPC = isPettyCashSubmission(sub);

      if (isPC) {
        const custodianName = getPettyCashCustodian(sub) || 'Suryo Pranoto';
        
        // 1. Ensure custodian is registered in pettyCashHolders
        if (custodianName && !newHoldersList.some(h => h.trim().toLowerCase() === custodianName.toLowerCase())) {
          newHoldersList.push(custodianName);
          holdersChanged = true;
        }

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

    if (holdersChanged) {
      setPettyCashHolders(newHoldersList);
      localStorage.setItem('petty_cash_holders_v2', JSON.stringify(newHoldersList));
    }

    if (reportsChanged) {
      setPettyCashReports(updatedReports);
      localStorage.setItem('petty_cash_reports', JSON.stringify(updatedReports));
    }

    if (holdersChanged || reportsChanged) {
      fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pettyCashHolders: newHoldersList,
          pettyCashReports: updatedReports
        })
      }).catch(err => console.warn('Sync shared state error:', err));
    }
  }, [submissions]);

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

  const handleSavePettyCashHolders = async (newHolders: string[]) => {
    setPettyCashHolders(newHolders);
    localStorage.setItem('petty_cash_holders_v2', JSON.stringify(newHolders));
    try {
      await fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pettyCashHolders: newHolders, pettyCashReports })
      });
    } catch (err) {
      console.error('Gagal sinkronisasi master list pemegang petty cash:', err);
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
    setNpwpRecords(newRecords);
    try {
      localStorage.setItem('npwp_records_v1', JSON.stringify(newRecords));
    } catch (e) {
      console.error('Error saving npwp_records_v1 to localStorage:', e);
    }

    try {
      await fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npwpRecords: newRecords })
      });
    } catch (err) {
      console.error('Gagal sinkronisasi data NPWP ke server:', err);
    }

    try {
      await saveNpwpRecordsToFirestore(newRecords);
    } catch (err) {
      console.warn('Gagal sinkronisasi data NPWP ke Firestore:', err);
    }
  };

  const handleSaveAgendaItems = (newItems: AgendaItem[]) => {
    setAgendaItems(newItems);
    try {
      localStorage.setItem('nmsa_agenda_items_v1', JSON.stringify(newItems));
    } catch (e) {
      console.error('Gagal menyimpan agenda ke localStorage:', e);
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

  // Automatic periodic Google Drive token keepalive and auto-refresh
  useEffect(() => {
    const stopAutoRefresh = startGoogleDriveTokenAutoRefresh(3); // Auto checks every 3 minutes
    return () => {
      stopAutoRefresh();
    };
  }, []);

  const [view, setViewInternal] = useState<'list' | 'form' | 'print' | 'sppd' | 'absen' | 'npwp' | 'accurate' | 'agenda'>(() => {
    try {
      const stored = sessionStorage.getItem('NUSANTARA_ACTIVE_VIEW') || localStorage.getItem('NUSANTARA_ACTIVE_VIEW');
      if (stored && ['list', 'form', 'print', 'sppd', 'absen', 'npwp', 'accurate', 'agenda'].includes(stored)) {
        return stored as any;
      }
    } catch (e) {}
    return 'list';
  });

  const [previousView, setPreviousView] = useState<'list' | 'form' | 'print' | 'sppd' | 'absen' | 'npwp' | 'accurate' | 'agenda'>(() => {
    try {
      const stored = sessionStorage.getItem('NUSANTARA_PREVIOUS_VIEW');
      if (stored && ['list', 'form', 'print', 'sppd', 'absen', 'npwp', 'accurate', 'agenda'].includes(stored)) {
        return stored as any;
      }
    } catch (e) {}
    return 'list';
  });

  const setView = (
    newView: 'list' | 'form' | 'print' | 'sppd' | 'absen' | 'npwp' | 'accurate' | 'agenda',
    options?: { preservePrevious?: boolean }
  ) => {
    setViewInternal((current) => {
      if (current !== newView && current !== 'form' && current !== 'print' && !options?.preservePrevious) {
        setPreviousView(current);
        try { sessionStorage.setItem('NUSANTARA_PREVIOUS_VIEW', current); } catch (e) {}
      }
      try { sessionStorage.setItem('NUSANTARA_ACTIVE_VIEW', newView); } catch (e) {}
      return newView;
    });
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
  const [printInitialTab, setPrintInitialTab] = useState<'both' | 'pengajuan' | 'pengeluaran' | 'lampiran' | 'only_invoice_payment'>('both');
  const [editingSubmission, setEditingSubmission] = useState<Submission | null>(null);
  const [authUser, setAuthUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isDashboardNavOpen, setIsDashboardNavOpen] = useState(false);
  const [isVoucherSubmenuOpen, setIsVoucherSubmenuOpen] = useState(true);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isGoogleDriveSettingsOpen, setIsGoogleDriveSettingsOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [masterDriveEmail, setMasterDriveEmailState] = useState<string>(() => getMasterDriveEmail());

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
    try { return (sessionStorage.getItem('sublist_layoutMode') as any) || 'standard'; } catch (e) { return 'standard'; }
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

  const userMenuRef = useRef<HTMLDivElement>(null);
  const dashboardNavRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (dashboardNavRef.current && !dashboardNavRef.current.contains(event.target as Node)) {
        setIsDashboardNavOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  const [sharedSubmission, setSharedSubmission] = useState<Submission | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState(false);
  const [sharedError, setSharedError] = useState('');

  const getSharedIdFromHash = (hash: string) => {
    if (hash.includes('shared-view')) {
      const idMatch = hash.match(/[?&]id=([a-zA-Z0-9_-]+)/) || hash.match(/shared-view\/([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        return idMatch[1];
      }
      const parts = hash.split('shared-view/');
      if (parts[1]) {
        return parts[1].split('?')[0];
      }
    }
    return null;
  };

  useEffect(() => {
    const sharedId = getSharedIdFromHash(currentHash);
    if (sharedId) {
      setIsLoadingShared(true);
      setSharedError('');
      getSubmissionFromFirestore(sharedId)
        .then((sub) => {
          if (sub) {
            setSharedSubmission(sub);
          } else {
            setSharedError('Maaf, dokumen transaksi tidak ditemukan atau sudah dihapus dari server cloud.');
          }
        })
        .catch((err) => {
          setSharedError(`Gagal memuat dokumen transaksi: ${err.message || String(err)}`);
        })
        .finally(() => {
          setIsLoadingShared(false);
        });
    } else {
      setSharedSubmission(null);
    }
  }, [currentHash]);

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
    // Elegant shared terminal/device logic:
    // If the browser session is fresh (or reopened tab), prevent auto-login by logging out first.
    // Preserves active logins across simple page reloads (F5) through sessionStorage.
    const hasActiveSession = sessionStorage.getItem('NUSANTARA_SESSION_ACTIVE') === 'true';
    if (!hasActiveSession) {
      logoutFromFirebase();
    }

    const unsubscribe = registerAuthChangeListener(async (user) => {
      setAuthUser(user);
      if (!user) {
        setUserProfile(null);
        // DO NOT implicitly delete localStorage or empty submissions here.
        // This avoids race conditions and data-loss during initial app loading stages or tab reopenings!
      } else {
        // Mark session as active to prevent force-logout during same-tab refreshes
        sessionStorage.setItem('NUSANTARA_SESSION_ACTIVE', 'true');
        // Fetch user profile info from Firestore collection
        let profile = await getUserProfileFromFirestore(user.uid);
        if (!profile) {
          profile = {
            fullName: user.email === 'admin@nmsa.com' ? 'Nur Wahyudi' : user.email.split('@')[0],
            role: user.email === 'admin@nmsa.com' ? 'Accounting' : 'User',
            email: user.email,
            companyId: 'nmsa',
            companyName: 'PT Nusantara Mineral Sukses Abadi'
          };
        }

        const companyId = profile.companyId || 'nmsa';
        let companyDetails = await getCompanyProfileFromFirestore(companyId);
        
        // If not found, fall back to Nusantara Mineral default template
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

        const combinedProfile = {
          ...profile,
          companyId,
          companyName: companyDetails.name || companyDetails.fullName || 'PT Nusantara Mineral Sukses Abadi',
          companyDetails
        };
        setUserProfile(combinedProfile);

        // Fetch submissions automatically from Firestore
        try {
          const cloudData = await loadSubmissionsFromFirestore(profile?.companyId);
          if (cloudData && cloudData.length > 0) {
            // MERGE behavior instead of blind overwrite!
            // This prevents locally added/edited entries (such as the 101st item) from being wiped out
            // by a slightly stale/delayed cloud set or temporary syncing delay.
            const storedLocal = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
            let localList: Submission[] = [];
            try {
              localList = storedLocal ? JSON.parse(storedLocal) : [];
            } catch (jsonErr) {
              console.error('Error parsing stored local submissions:', jsonErr);
            }

            const mergedMap = new Map<string, Submission>();
            // Load current state / local list first holding edits/creations
            localList.forEach(sub => {
              if (sub && sub.id) {
                mergedMap.set(sub.id, sub);
              }
            });
            // Overwrite with incoming cloud items
            cloudData.forEach(sub => {
              if (sub && sub.id) {
                mergedMap.set(sub.id, sub);
              }
            });

            const mergedList = Array.from(mergedMap.values());
            mergedList.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

            saveSubmissionsToStorage(mergedList);
          } else {
            const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
            if (stored) {
              setSubmissions(JSON.parse(stored));
            } else {
              setSubmissions([]);
            }
          }
        } catch (e) {
          console.error('Error fetching data from Firestore:', e);
          try {
            const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
            if (stored) {
              setSubmissions(JSON.parse(stored));
            } else {
              setSubmissions([]);
            }
          } catch (localStorageErr) {
            console.error('Error loading data from localStorage:', localStorageErr);
            setSubmissions([]);
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync state changes with localStorage
  const saveSubmissionsToStorage = (updatedList: Submission[]) => {
    setSubmissions(updatedList);
    try {
      localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(updatedList));
    } catch (e) {
      console.error('Error saving data to localStorage:', e);
    }
  };

  // Delete handler
  const handleDelete = async (id: string) => {
    const targetSub = submissions.find(s => s.id === id);
    const updated = submissions.filter((sub) => sub.id !== id);
    saveSubmissionsToStorage(updated);
    
    // Auto-delete Google Drive folder if exists
    if (targetSub?.googleDriveFolderId) {
      try {
        console.log(`[Auto-Sync] Menghapus folder transaksi dari Google Drive: ${targetSub.googleDriveFolderId}`);
        await deleteGoogleDriveFile(targetSub.googleDriveFolderId);
      } catch (err) {
        console.warn('Gagal menghapus folder Google Drive saat menghapus transaksi:', err);
      }
    }

    if (isFirebaseConfigured()) {
      try {
        await deleteSubmissionFromFirestore(id);
      } catch (err) {
        console.warn('Silent fallback: cloud delete rejected', err);
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

    if (isFirebaseConfigured()) {
      try {
        await saveSubmissionToFirestore(dupe, userProfile?.companyId, userProfile?.companyName);
      } catch (err) {
        console.warn('Silent fallback: cloud replicate rejected', err);
      }
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
    let updatedList: Submission[] = [];
    const exists = submissions.some((sub) => sub.id === savedSub.id);

    if (exists) {
      updatedList = submissions.map((sub) => (sub.id === savedSub.id ? savedSub : sub));
    } else {
      updatedList = [savedSub, ...submissions];
    }

    saveSubmissionsToStorage(updatedList);

    if (isFirebaseConfigured()) {
      try {
        await saveSubmissionToFirestore(savedSub, userProfile?.companyId, userProfile?.companyName);
      } catch (err: any) {
        console.error('Core cloud write failed:', err);
        // We throw a detailed error so that the form UI handles it and remains open,
        // preventing the silent cloud save failures from tricking the user.
        throw new Error(
          `Pengajuan berhasil disimpan secara LOKAL di browser Anda, tetapi GAGAL disinkronkan ke Cloud Firestore.\n` +
          `Detail Error: ${err instanceof Error ? err.message : String(err)}\n\n` +
          `Saran Tindakan:\n` +
          `1. Pastikan Rule Keamanan (Security Rules) di Firebase Console Anda memperbolehkan akses tulis (write) untuk koleksi 'submissions'.\n` +
          `2. Periksa apakah masa aktif aturan test-mode 30 hari Anda telah kedaluwarsa.`
        );
      }
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

    // Navigate or remain in place appropriately without resetting view
    if (view === 'form') {
      setEditingSubmission(null);
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

      if (isFirebaseConfigured()) {
        try {
          await saveSubmissionToFirestore(updatedSub, userProfile?.companyId, userProfile?.companyName);
        } catch (err) {
          console.warn('Silent fallback: cloud status update rejected', err);
        }
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
      sessionStorage.removeItem('NUSANTARA_SESSION_ACTIVE');
      localStorage.removeItem('NUSANTARA_HO_SUBMISSIONS');
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
    // Overwrite database with imported values, or merge them.
    // Overwriting is safer for full restores, let's offer overwrite + deduplicate based on IDs
    const mergedMap = new Map<string, Submission>();
    
    // Add existing ones first
    submissions.forEach(sub => mergedMap.set(sub.id, sub));
    // Add imported ones (which might overwrite if match ID, otherwise brand new)
    importedList.forEach(sub => mergedMap.set(sub.id, sub));
    
    const updated = Array.from(mergedMap.values());
    // Sort by latest date
    updated.sort((a,b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
    
    saveSubmissionsToStorage(updated);
  };

  // Sync / Import handler for Google Sheets legacy vouchers
  const handleSheetsImport = (importedList: Submission[], mergeMode: 'merge' | 'overwrite') => {
    if (mergeMode === 'overwrite') {
      saveSubmissionsToStorage(importedList);
    } else {
      // Merge mode based on deduplicating ids or invoice notes
      const mergedMap = new Map<string, Submission>();
      submissions.forEach(sub => mergedMap.set(sub.id, sub));
      importedList.forEach(sub => mergedMap.set(sub.id, sub));
      
      const updated = Array.from(mergedMap.values());
      updated.sort((a,b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
      saveSubmissionsToStorage(updated);
    }
  };

  // Sync handler for Firebase Cloud Firestore
  const handleFirebaseSync = (cloudList: Submission[]) => {
    const mergedMap = new Map<string, Submission>();
    submissions.forEach(sub => mergedMap.set(sub.id, sub));
    cloudList.forEach(sub => mergedMap.set(sub.id, sub));
    
    const updated = Array.from(mergedMap.values());
    updated.sort((a,b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
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

  // Check direct attendance route & query params before AuthGate
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const hasWorkerOrAbsenParam = 
    searchParams.has('workerId') || 
    searchParams.has('id') || 
    searchParams.has('quick') || 
    searchParams.get('view') === 'absen' || 
    searchParams.get('tab') === 'absen' ||
    searchParams.has('absen');

  const isAbsenRoute = 
    currentPath === '/absen' || 
    currentPath === '/absensi' || 
    currentPath === '/absen-mandiri' ||
    currentHash.includes('absen') || 
    currentHash.includes('absensi') ||
    hasWorkerOrAbsenParam;

  // Route 1: Direct Absensi Harian NMSA (Public Access for Workers / Visitors / WhatsApp Links)
  if (isAbsenRoute && !authUser) {
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
        />
      </div>
    );
  }

  // Route 2: Public Share View Route before AuthGate
  const isSharedViewRoute = currentHash.includes('shared-view');

  if (isSharedViewRoute) {
    return (
      <div id="app-root" className={`min-h-screen bg-stone-50 text-stone-850 flex flex-col antialiased theme-${theme}`}>
        {/* Public Header bar */}
        <header className="bg-amber-600 border-b border-amber-700 sticky top-0 z-40 shadow-sm print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl text-white">
                <Database size={18} />
              </div>
              <div className="text-white">
                <span className="font-mono text-[9px] uppercase tracking-widest text-amber-200 font-bold block leading-none mb-1">
                  Portal Transaksi Publik
                </span>
                <h1 className="text-xs sm:text-sm font-black tracking-tight leading-none">
                  PT Nusantara Mineral Sukses Abadi
                </h1>
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-white text-amber-700 font-bold px-3.5 py-1.5 rounded-xl text-xs hover:bg-stone-100 transition cursor-pointer shadow-3xs"
            >
              <Printer size={13} />
              Cetak Dokumen
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col">
          {isLoadingShared ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="animate-spin text-amber-600" size={36} />
              <p className="text-xs font-mono font-bold text-stone-500 uppercase tracking-widest">
                Mengambil Dokumen Transaksi dari Cloud...
              </p>
            </div>
          ) : sharedError ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto space-y-4">
              <div className="p-4 bg-rose-100 text-rose-700 rounded-2xl">
                <ShieldCheck size={32} className="text-rose-600" />
              </div>
              <h3 className="font-sans font-black text-stone-900 text-lg">Gagal Memuat Transaksi</h3>
              <p className="text-xs text-stone-500 leading-relaxed font-mono">
                {sharedError}
              </p>
              <button
                onClick={() => navigateTo('/')}
                className="bg-stone-900 hover:bg-stone-850 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Kembali ke Beranda
              </button>
            </div>
          ) : sharedSubmission ? (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 leading-relaxed flex gap-2.5 print:hidden">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Akses Terbuka:</strong> Anda sedang melihat salinan digital resmi dari transaksi voucher <strong>{sharedSubmission.kode}</strong>. Seluruh lampiran dokumen di bawah ini telah di-upload ke Google Drive dan dapat diakses secara publik.
                </p>
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
              <p className="text-xs font-mono text-stone-400">Terjadi kesalahan yang tidak diketahui.</p>
            </div>
          )}
        </main>
      </div>
    );
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
          setAuthUser(user);
          if (initialData && initialData.length > 0) {
            saveSubmissionsToStorage(initialData);
          } else {
            // Check localstorage content as fallback
            try {
              const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
              if (stored) {
                setSubmissions(JSON.parse(stored));
              }
            } catch (e) {
              console.error('Error loading data from localStorage:', e);
            }
          }
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

                {/* User Dropdown Menu (Contains Theme, Profile, & Logout) */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 py-1.5 px-3 rounded-2xl hover:bg-stone-100 border border-stone-200 transition cursor-pointer select-none bg-stone-50"
                    title="Klik untuk menu profil, ganti tema, & logout"
                  >
                    <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-xs">
                      {(userProfile?.fullName || 'Nur Wahyudi').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <div className="flex items-center gap-1 text-xs font-sans font-black text-stone-900 leading-tight">
                        <span className="truncate max-w-[120px] sm:max-w-[160px]">
                          {userProfile?.fullName || 'Nur Wahyudi'}
                        </span>
                        <ChevronDown size={13} className={`text-stone-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                      </div>
                      <span className="text-[10px] text-stone-400 font-mono leading-tight">
                        {userProfile?.role || 'Divisi Keuangan'}
                      </span>
                    </div>
                  </button>

                  {/* User Dropdown Popover */}
                  {isUserMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-stone-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
                      <div className="p-3.5 bg-stone-50 border-b border-stone-200">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                            {(userProfile?.fullName || 'Nur Wahyudi').substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-black text-stone-900 truncate">
                              {userProfile?.fullName || 'Nur Wahyudi'}
                            </h4>
                            <p className="text-[10px] text-stone-500 font-mono truncate">
                              {authUser?.email || 'keuangan@nmsa.co.id'}
                            </p>
                            <span className="inline-block mt-0.5 text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                              {userProfile?.role || 'Divisi Keuangan HO'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 space-y-1.5">
                          {/* Master Drive Quick Access */}
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setIsGoogleDriveSettingsOpen(true);
                            }}
                            className="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-between font-sans shadow-3xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Cloud size={15} className="text-amber-600 shrink-0" />
                              <span className="truncate">Pengaturan Master Drive</span>
                            </div>
                            <span className="text-[9px] font-mono bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold shrink-0">
                              24/7
                            </span>
                          </button>

                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setIsProfileOpen(true);
                            }}
                            className="w-full bg-white hover:bg-stone-100 border border-stone-250 text-stone-700 font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 font-mono shadow-3xs"
                          >
                            <Settings size={13} className="text-stone-500" />
                            <span>Pengaturan Profil & Storage</span>
                          </button>
                        </div>
                      </div>

                    <div className="p-3 border-b border-stone-200 space-y-2">
                      <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                        Pilihan Tema Tampilan:
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
                        <button
                          onClick={() => { setTheme('classic'); setIsUserMenuOpen(false); }}
                          className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer text-left ${
                            theme === 'classic' ? 'bg-stone-900 text-white border-stone-900 font-bold' : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0 border border-stone-300" style={{ background: 'linear-gradient(135deg, #ffffff 50%, #D4AF37 50%)' }} />
                          <span className="text-[11px] truncate">Classic</span>
                        </button>

                        <button
                          onClick={() => { setTheme('gold-dark'); setIsUserMenuOpen(false); }}
                          className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer text-left ${
                            theme === 'gold-dark' ? 'bg-stone-900 text-amber-400 border-stone-900 font-bold' : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0 border border-stone-800" style={{ background: 'linear-gradient(135deg, #141416 50%, #D4AF37 50%)' }} />
                          <span className="text-[11px] truncate">Gold Dark</span>
                        </button>

                        <button
                          onClick={() => { setTheme('emerald'); setIsUserMenuOpen(false); }}
                          className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer text-left ${
                            theme === 'emerald' ? 'bg-emerald-900 text-white border-emerald-900 font-bold' : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0 border border-emerald-300" style={{ background: 'linear-gradient(135deg, #f1f6f3 50%, #059669 50%)' }} />
                          <span className="text-[11px] truncate">Emerald</span>
                        </button>

                        <button
                          onClick={() => { setTheme('slate'); setIsUserMenuOpen(false); }}
                          className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer text-left ${
                            theme === 'slate' ? 'bg-slate-900 text-sky-300 border-slate-900 font-bold' : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0 border border-slate-800" style={{ background: 'linear-gradient(135deg, #11141a 50%, #0284c7 50%)' }} />
                          <span className="text-[11px] truncate">Slate</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-2 bg-stone-50">
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 border border-rose-200"
                      >
                        <LogOut size={14} />
                        <span>Keluar dari Sesi (Logout)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <InputBuktiTransfer 
            submissions={submissions} 
            userProfile={userProfile}
            onUpdateSubmissions={setSubmissions} 
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
      
      {/* GLOBAL HEADER HEADER - Hidden on print */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-18 py-2 md:py-0">
            {/* Logo area */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('list')}>
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

              {/* Dashboard Nav Dropdown Selector */}
              <div className="relative ml-2 pl-2 sm:ml-4 sm:pl-4 border-l border-stone-200" ref={dashboardNavRef}>
                <button
                  onClick={() => setIsDashboardNavOpen(!isDashboardNavOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-stone-900 text-white hover:bg-stone-800 transition cursor-pointer shadow-3xs border border-stone-800 font-sans"
                >
                  <LayoutGrid size={14} className="text-amber-400 shrink-0" />
                  <div className="flex items-center gap-1.5 text-xs font-extrabold">
                    <span>
                      {view === 'list' && (
                        layoutMode === 'standard' ? 'Voucher HO (Standar)' :
                        layoutMode === 'spreadsheet' ? 'Voucher HO (Spreadsheet)' :
                        layoutMode === 'audit_logs' ? 'Voucher HO (Audit Log)' :
                        layoutMode === 'invoice_recap' ? 'Voucher HO (Rekap Invoice)' :
                        layoutMode === 'unpaid_outstanding' ? 'Voucher HO (Kewajiban)' :
                        'Voucher HO (Petty Cash)'
                      )}
                      {view === 'absen' && 'Absen Harian NMSA'}
                      {view === 'npwp' && 'Master NPWP & Vendor'}
                      {view === 'accurate' && 'Pemetaan Akun'}
                      {view === 'form' && 'Form Pengajuan Payment'}
                      {view === 'print' && 'Cetak Dokumen F1/F2'}
                      {view === 'sppd' && 'Data SPPD & Perjalanan'}
                    </span>
                    <ChevronDown size={14} className={`text-stone-300 transition-transform duration-200 ${isDashboardNavOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Navigation Dropdown List */}
                {isDashboardNavOpen && (
                  <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-2xl shadow-xl border border-stone-200 z-50 overflow-hidden p-2 animate-in fade-in zoom-in-95 duration-150 font-sans max-h-[85vh] overflow-y-auto">
                    <div className="px-3 py-1 text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider mb-1">
                      Pilihan Menu Dashboard:
                    </div>

                    {/* 1. VOUCHER HO DROPDOWN GROUP */}
                    <div className="rounded-xl border border-stone-200 bg-stone-50/80 overflow-hidden mb-1.5">
                      <button
                        onClick={() => setIsVoucherSubmenuOpen(!isVoucherSubmenuOpen)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold transition cursor-pointer text-left ${
                          view === 'list' ? 'bg-stone-900 text-white font-black' : 'text-stone-800 hover:bg-stone-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Database size={15} className={view === 'list' ? 'text-amber-400' : 'text-stone-600'} />
                          <div className="flex flex-col">
                            <span className="leading-snug">Voucher HO & Mode Rekap</span>
                            <span className={`text-[10px] font-normal leading-none ${view === 'list' ? 'text-stone-300' : 'text-stone-400'}`}>
                              Daftar Transaksi & Layout Mode
                            </span>
                          </div>
                        </div>
                        <ChevronDown size={14} className={`transition-transform duration-200 ${isVoucherSubmenuOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* SUB-MENU DROPDOWN FOR VOUCHER HO */}
                      {isVoucherSubmenuOpen && (
                        <div className="p-1.5 space-y-1 bg-white border-t border-stone-200">
                          <button
                            onClick={() => {
                              setView('list');
                              setLayoutMode('standard');
                              setIsDashboardNavOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              view === 'list' && layoutMode === 'standard'
                                ? 'bg-amber-500 text-stone-950 font-black'
                                : 'text-stone-700 hover:bg-stone-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Database size={13} className={view === 'list' && layoutMode === 'standard' ? 'text-stone-950' : 'text-amber-600'} />
                              <span>Tampilan Standar</span>
                            </div>
                            <span className="text-[9px] font-mono opacity-80">Daftar Utama</span>
                          </button>

                          <button
                            onClick={() => {
                              setView('list');
                              setLayoutMode('spreadsheet');
                              setIsDashboardNavOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              view === 'list' && layoutMode === 'spreadsheet'
                                ? 'bg-emerald-700 text-white font-black'
                                : 'text-stone-700 hover:bg-emerald-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <FileText size={13} className={view === 'list' && layoutMode === 'spreadsheet' ? 'text-white' : 'text-emerald-600'} />
                              <span>Tampilan Spreadsheet</span>
                            </div>
                            <span className="text-[9px] font-mono opacity-80">Sheets</span>
                          </button>

                          <button
                            onClick={() => {
                              setView('list');
                              setLayoutMode('audit_logs');
                              setIsDashboardNavOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              view === 'list' && layoutMode === 'audit_logs'
                                ? 'bg-[#917118] text-white font-black'
                                : 'text-stone-700 hover:bg-amber-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <History size={13} className={view === 'list' && layoutMode === 'audit_logs' ? 'text-white' : 'text-[#917118]'} />
                              <span>Riwayat Audit Log</span>
                            </div>
                            <span className="text-[9px] font-mono opacity-80">Logs</span>
                          </button>

                          <button
                            onClick={() => {
                              setView('list');
                              setLayoutMode('invoice_recap');
                              setIsDashboardNavOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              view === 'list' && layoutMode === 'invoice_recap'
                                ? 'bg-amber-600 text-white font-black'
                                : 'text-stone-700 hover:bg-amber-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet size={13} className={view === 'list' && layoutMode === 'invoice_recap' ? 'text-white' : 'text-amber-600'} />
                              <span>Rekap & Bukti Invoice</span>
                            </div>
                            <span className="text-[9px] font-mono opacity-80">Vendor</span>
                          </button>

                          <button
                            onClick={() => {
                              setView('list');
                              setLayoutMode('unpaid_outstanding');
                              setIsDashboardNavOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              view === 'list' && layoutMode === 'unpaid_outstanding'
                                ? 'bg-rose-700 text-white font-black'
                                : 'text-rose-900 hover:bg-rose-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <AlertCircle size={13} className={view === 'list' && layoutMode === 'unpaid_outstanding' ? 'text-white' : 'text-rose-600'} />
                              <span>Kewajiban Belum Bayar</span>
                            </div>
                            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                              view === 'list' && layoutMode === 'unpaid_outstanding' ? 'bg-white text-rose-900' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {unpaidCount}
                            </span>
                          </button>

                          <button
                            onClick={() => {
                              setView('list');
                              setLayoutMode('petty_cash_recap');
                              setIsDashboardNavOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              view === 'list' && layoutMode === 'petty_cash_recap'
                                ? 'bg-violet-700 text-white font-black'
                                : 'text-violet-900 hover:bg-violet-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Coins size={13} className={view === 'list' && layoutMode === 'petty_cash_recap' ? 'text-white' : 'text-violet-600'} />
                              <span>Petty Cash Lapangan</span>
                            </div>
                            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                              view === 'list' && layoutMode === 'petty_cash_recap' ? 'bg-white text-violet-900' : 'bg-violet-100 text-violet-800'
                            }`}>
                              {pettyCashCount}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 2. ABSEN HARIAN NMSA */}
                    <button
                      onClick={() => { setView('absen'); setIsDashboardNavOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left mb-1 ${
                        view === 'absen' ? 'bg-emerald-700 text-white font-black' : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Users size={15} className={view === 'absen' ? 'text-emerald-200' : 'text-emerald-600'} />
                      <div className="flex flex-col">
                        <span>Absen Harian NMSA</span>
                        <span className={`text-[10px] font-normal ${view === 'absen' ? 'text-emerald-100' : 'text-stone-400'}`}>
                          Kehadiran & Absensi Karyawan
                        </span>
                      </div>
                    </button>

                    {/* 3. MASTER NPWP */}
                    <button
                      onClick={() => { setView('npwp'); setIsDashboardNavOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left mb-1 ${
                        view === 'npwp' ? 'bg-indigo-800 text-white font-black' : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Receipt size={15} className={view === 'npwp' ? 'text-indigo-200' : 'text-indigo-600'} />
                      <div className="flex flex-col">
                        <span>Master NPWP & Vendor</span>
                        <span className={`text-[10px] font-normal ${view === 'npwp' ? 'text-indigo-100' : 'text-stone-400'}`}>
                          Database NPWP & Rekening
                        </span>
                      </div>
                    </button>

                    {/* 4. PEMETAAN AKUN (ACCURATE & SPPD) */}
                    <button
                      onClick={() => { setView('accurate'); setIsDashboardNavOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left mb-1 ${
                        view === 'accurate' ? 'bg-emerald-900 text-white font-black' : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Layers size={15} className={view === 'accurate' ? 'text-amber-400' : 'text-emerald-700'} />
                      <div className="flex flex-col">
                        <span>Pemetaan Akun</span>
                        <span className={`text-[10px] font-normal ${view === 'accurate' ? 'text-emerald-200' : 'text-stone-400'}`}>
                          Accurate (Petty Cash) & SPPD Dinas
                        </span>
                      </div>
                    </button>

                    {/* 5. SURAT PERINTAH PERJALANAN DINAS (SPPD) */}
                    <button
                      onClick={() => { setView('sppd'); setIsDashboardNavOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left mb-1 ${
                        view === 'sppd' ? 'bg-amber-600 text-white font-black' : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Briefcase size={15} className={view === 'sppd' ? 'text-amber-200' : 'text-amber-600'} />
                      <div className="flex flex-col">
                        <span>Formulir & SPPD Dinas</span>
                        <span className={`text-[10px] font-normal ${view === 'sppd' ? 'text-amber-100' : 'text-stone-400'}`}>
                          Surat Tugas & Biaya Dinas
                        </span>
                      </div>
                    </button>

                    {/* 6. PENGINGAT & AGENDA KERJA */}
                    <button
                      onClick={() => { setView('agenda'); setIsDashboardNavOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left mb-1 ${
                        view === 'agenda' ? 'bg-amber-500 text-stone-950 font-black' : 'text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Calendar size={15} className={view === 'agenda' ? 'text-stone-950' : 'text-amber-600'} />
                        <div className="flex flex-col">
                          <span>Pengingat &amp; Agenda Kerja</span>
                          <span className={`text-[10px] font-normal ${view === 'agenda' ? 'text-stone-900' : 'text-stone-400'}`}>
                            Jadwal Pajak, Gaji, SPPD &amp; Tugas
                          </span>
                        </div>
                      </div>
                      {agendaDueCount > 0 && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-black ${
                          view === 'agenda' ? 'bg-rose-700 text-white' : 'bg-rose-600 text-white'
                        }`}>
                          {agendaDueCount}
                        </span>
                      )}
                    </button>

                    {(view === 'form' || view === 'print' || view === 'sppd' || view === 'agenda') && (
                      <button
                        onClick={() => { setView('list'); setIsDashboardNavOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left text-amber-700 bg-amber-50 hover:bg-amber-100 mt-1 border border-amber-200"
                      >
                        <ArrowRight size={14} className="rotate-180" />
                        <span>Kembali ke Voucher HO</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Quick Agenda & Reminder Header Button */}
              <button
                type="button"
                onClick={() => setView('agenda')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-2xl border transition cursor-pointer shadow-3xs font-mono text-xs font-bold ${
                  view === 'agenda'
                    ? 'bg-amber-500 text-stone-950 border-amber-600 font-black'
                    : agendaDueCount > 0
                    ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                }`}
                title={`Agenda Kegiatan & Pengingat Tugas (${agendaDueCount} tugas jatuh tempo / hari ini)`}
              >
                <Bell size={14} className={agendaDueCount > 0 ? 'text-rose-600 animate-bounce' : 'text-stone-500'} />
                <span className="hidden md:inline font-sans">Agenda</span>
                {agendaDueCount > 0 && (
                  <span className="flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white">
                    {agendaDueCount}
                  </span>
                )}
              </button>

              {/* WhatsApp AI & Database Assistant Button */}
              <button
                type="button"
                onClick={() => setIsWhatsAppModalOpen(true)}
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 transition cursor-pointer shadow-3xs font-mono text-xs font-bold"
                title="Integrasi WhatsApp Business AI & Pusat Data. Klik untuk Scan QR / Kode Pairing / Make.com Webhook."
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <MessageSquare size={14} className="text-emerald-700 shrink-0" />
                <span className="hidden md:inline font-sans">WhatsApp AI</span>
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

              {/* User Profile Dropdown Menu (Contains Theme, Profile, Cloud Center & Logout) */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 py-1.5 px-3 rounded-2xl hover:bg-stone-100 border border-stone-200 transition cursor-pointer select-none bg-stone-50"
                  title="Klik untuk menu profil, ganti tema, & logout"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-xs">
                    {(userProfile?.fullName || 'Nur Wahyudi').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-col items-start text-left">
                    <div className="flex items-center gap-1 text-xs font-sans font-black text-stone-900 leading-tight">
                      <span className="truncate max-w-[120px] sm:max-w-[160px]">
                        {userProfile?.fullName || 'Nur Wahyudi'}
                      </span>
                      <ChevronDown size={13} className={`text-stone-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono leading-tight">
                      {userProfile?.role || 'Divisi Keuangan'}
                    </span>
                  </div>
                </button>

                {/* User Dropdown Popover */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-stone-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
                    <div className="p-3.5 bg-stone-50 border-b border-stone-200">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                          {(userProfile?.fullName || 'Nur Wahyudi').substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-black text-stone-900 truncate">
                            {userProfile?.fullName || 'Nur Wahyudi'}
                          </h4>
                          <p className="text-[10px] text-stone-500 font-mono truncate">
                            {authUser?.email || 'keuangan@nmsa.co.id'}
                          </p>
                          <span className="inline-block mt-0.5 text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                            {userProfile?.role || 'Divisi Keuangan HO'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1.5">
                        {/* Master Drive Quick Access */}
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            setIsGoogleDriveSettingsOpen(true);
                          }}
                          className="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-between font-sans shadow-3xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Cloud size={15} className="text-amber-600 shrink-0" />
                            <span className="truncate">Pengaturan Master Drive</span>
                          </div>
                          <span className="text-[9px] font-mono bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-bold shrink-0">
                            24/7
                          </span>
                        </button>

                        {/* PUSAT LAYANAN AWAN & INTEGRASI (Unified into Nur Wahyudi dropdown!) */}
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            setIsCloudModalOpen(true);
                          }}
                          className="w-full bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-250 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-between font-sans shadow-3xs"
                        >
                          <div className="flex items-center gap-2">
                            <Cloud size={15} className="text-stone-600" />
                            <span>Pusat Layanan Awan & Integrasi</span>
                          </div>
                          <span className="text-[9px] font-mono bg-stone-300 text-stone-900 px-1.5 py-0.5 rounded font-bold">
                            Ready
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            setIsProfileOpen(true);
                          }}
                          className="w-full bg-white hover:bg-stone-100 border border-stone-250 text-stone-700 font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 font-mono shadow-3xs"
                        >
                          <Settings size={13} className="text-stone-500" />
                          <span>Pengaturan Profil & Storage</span>
                        </button>
                      </div>
                    </div>

                  <div className="p-3 border-b border-stone-200 space-y-2">
                    <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                      Pilihan Tema Tampilan:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
                      <button
                        onClick={() => { setTheme('classic'); setIsUserMenuOpen(false); }}
                        className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer text-left ${
                          theme === 'classic' ? 'bg-stone-900 text-white border-stone-900 font-bold' : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full shrink-0 border border-stone-300" style={{ background: 'linear-gradient(135deg, #ffffff 50%, #D4AF37 50%)' }} />
                        <span className="text-[11px] truncate">Classic</span>
                      </button>

                      <button
                        onClick={() => { setTheme('gold-dark'); setIsUserMenuOpen(false); }}
                        className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer text-left ${
                          theme === 'gold-dark' ? 'bg-stone-900 text-amber-400 border-stone-900 font-bold' : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full shrink-0 border border-stone-800" style={{ background: 'linear-gradient(135deg, #141416 50%, #D4AF37 50%)' }} />
                        <span className="text-[11px] truncate">Gold Dark</span>
                      </button>

                      <button
                        onClick={() => { setTheme('emerald'); setIsUserMenuOpen(false); }}
                        className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer text-left ${
                          theme === 'emerald' ? 'bg-emerald-900 text-white border-emerald-900 font-bold' : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full shrink-0 border border-emerald-300" style={{ background: 'linear-gradient(135deg, #f1f6f3 50%, #059669 50%)' }} />
                        <span className="text-[11px] truncate">Emerald</span>
                      </button>

                      <button
                        onClick={() => { setTheme('slate'); setIsUserMenuOpen(false); }}
                        className={`p-2 rounded-xl border flex items-center gap-2 transition cursor-pointer text-left ${
                          theme === 'slate' ? 'bg-slate-900 text-sky-300 border-slate-900 font-bold' : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full shrink-0 border border-slate-800" style={{ background: 'linear-gradient(135deg, #11141a 50%, #0284c7 50%)' }} />
                        <span className="text-[11px] truncate">Slate</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-2 bg-stone-50">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 border border-rose-200"
                    >
                      <LogOut size={14} />
                      <span>Keluar dari Sesi (Logout)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>

    {/* PERSISTENT REMINDER BANNER FOR DUE / OVERDUE AGENDA ITEMS */}
    <AgendaReminderBanner
      agendaItems={agendaItems}
      onToggleComplete={handleToggleAgendaComplete}
      onOpenAgendaView={() => setView('agenda')}
      onPostponeOneDay={handlePostponeAgenda}
    />

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* VIEW 1: Submissions Data History & Backup Operations */}
        <div className={view === 'list' ? 'space-y-6' : 'hidden'}>
          {/* Main Listing components */}
          <SubmissionsList
            submissions={submissions}
            layoutMode={layoutMode}
            onLayoutModeChange={setLayoutMode}
            userProfile={userProfile}
            onSelect={(sub, initialTab) => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
              setActiveSubmission(sub);
              setPrintInitialTab(initialTab || 'both');
              setView('print');
            }}
            onEdit={(sub) => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
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
              setEditingSubmission(null);
              setView('form');
            }}
            onOpenBuktiTransfer={() => {
              try { sessionStorage.setItem('sublist_scrollPos', window.scrollY.toString()); } catch (e) {}
              navigateTo('#/input-bukti-transfer');
            }}
            onMarkAsPaid={handleMarkAsPaid}
          />

          {/* Backup / Export-Import Section */}
          <div className="pt-4 print:hidden space-y-4">
            <DriveSyncMass submissions={submissions} onUpdateSubmissions={saveSubmissionsToStorage} />
            <JsonBackup submissions={submissions} onImport={handleImportJson} />
          </div>
        </div>

        {/* VIEW 2: Input / Edit Submission Form */}
        {view === 'form' && (
          <SubmissionForm
            initialSubmission={editingSubmission}
            userProfile={userProfile}
            submissions={submissions}
            pettyCashHolders={pettyCashHolders}
            onOpenManageHolders={() => setIsHoldersModalOpen(true)}
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
            onUpdateSubmission={(updated) => {
              setActiveSubmission(updated);
              const updatedList = submissions.map((s) => (s.id === updated.id ? updated : s));
              saveSubmissionsToStorage(updatedList);
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
          />
        )}

        {/* VIEW 6: Modul Master List NPWP & Invoice Vendor */}
        {view === 'npwp' && (
          <NpwpManager
            npwpRecords={npwpRecords}
            onSaveNpwpRecords={handleSaveNpwpRecords}
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
            onBack={() => setView('list')}
          />
        )}

        {/* VIEW 8: Modul Pengingat & Agenda Kegiatan Kerja */}
        {view === 'agenda' && (
          <AgendaManager
            agendaItems={agendaItems}
            onSaveAgendaItems={handleSaveAgendaItems}
            submissions={submissions}
            userProfile={userProfile}
            onOpenSubmissionForPrint={(sub) => {
              setActiveSubmission(sub);
              setPrintInitialTab('both');
              setView('print');
            }}
            onClose={() => setView(previousView || 'list')}
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
      />

      {/* Master List Pemegang Petty Cash Modal */}
      <PettyCashHoldersModal
        isOpen={isHoldersModalOpen}
        onClose={() => setIsHoldersModalOpen(false)}
        holders={pettyCashHolders}
        onSaveHolders={handleSavePettyCashHolders}
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
      />

      {/* Integrasi WhatsApp Business AI & Pusat Data Modal */}
      <WhatsAppAiModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        submissions={submissions}
      />

    </div>
  );
}

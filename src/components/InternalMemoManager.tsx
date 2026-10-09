import React, { useState, useEffect, useRef } from 'react';
import { InternalMemo, BankAccountMaster, Submission } from '../types';
import {
  formatHariTanggalMemo,
  generateDefaultMemoNumber,
  getNextMemoSequence,
  generateNextMemoNumber,
  getSavedBankAccounts,
  saveBankAccounts,
  getSavedInternalMemos,
  saveInternalMemos,
  createInitialMemo,
  generateMemoPdfBlobFromElement,
  OFFICIAL_KOP_SURAT_IMAGE_URL,
  parseDari,
} from '../utils/memoUtils';
import { memoGoogleDriveService } from '../utils/memoDriveService';
import { getInternalMemoLink } from '../utils/appLinks';
import {
  saveInternalMemoToFirestore,
  getInternalMemosFromFirestore,
  deleteInternalMemoFromFirestore,
} from '../firebase';
import { InternalMemoDocument } from './InternalMemoDocument';
import { ManageBankAccountsModal } from './ManageBankAccountsModal';
import { MemoRichEditor } from './MemoRichEditor';
import {
  FileText,
  Printer,
  Save,
  Plus,
  Copy,
  Trash2,
  Edit,
  Sparkles,
  RefreshCw,
  CreditCard,
  Building,
  Calendar,
  User,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  FileDown,
  FileUp,
  Link as LinkIcon,
  ChevronDown,
  Image as ImageIcon,
  Users,
  UserCheck,
  Cloud,
  FolderCheck,
  CloudUpload,
  FolderUp,
  CheckSquare,
  Square,
  Check,
  ExternalLink,
  Loader2,
  Share2,
  X,
} from 'lucide-react';

const COMMON_MEMO_SIGNERS = [
  { name: 'Andi Muhammad Rifki', role: 'Direktur' },
  { name: 'Harijon', role: 'Direktur Keuangan' },
  { name: 'Abdul Aziz Halid', role: 'Direktur Utama ANH' },
  { name: 'H. Andi Nursyam Halid', role: 'Direktur Utama' },
  { name: 'Sri Ekowati', role: 'Manager Keuangan' },
];

interface InternalMemoManagerProps {
  submissions?: Submission[];
  initialSubmissionForMemo?: Submission | null;
  onBackToList: () => void;
  userProfile?: any;
  onCreateVoucher?: (memo: InternalMemo) => void;
}

export const InternalMemoManager: React.FC<InternalMemoManagerProps> = ({
  submissions = [],
  initialSubmissionForMemo = null,
  onBackToList,
  userProfile,
  onCreateVoucher,
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'history' | 'banks'>('editor');
  const [memos, setMemos] = useState<InternalMemo[]>(() => getSavedInternalMemos());
  const [bankAccounts, setBankAccounts] = useState<BankAccountMaster[]>(() => getSavedBankAccounts());
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);

  // Google Drive backup state
  const [isAutoDriveUploadEnabled, setIsAutoDriveUploadEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('NMSA_MEMO_AUTO_DRIVE_BACKUP') !== 'false';
    } catch {
      return true;
    }
  });
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [syncingMemoId, setSyncingMemoId] = useState<string | null>(null);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [driveSuccessMsg, setDriveSuccessMsg] = useState('');
  const [driveErrorMsg, setDriveErrorMsg] = useState('');
  const [selectedMemoIds, setSelectedMemoIds] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; memoNumber: string } | null>(null);

  // Track if user is editing an existing memo from history, or creating a new memo
  const [editingExistingId, setEditingExistingId] = useState<string | null>(null);

  // Active memo being edited - automatically sequential
  const [currentMemo, setCurrentMemo] = useState<InternalMemo>(() => {
    if (initialSubmissionForMemo) {
      return createInitialMemo(initialSubmissionForMemo, memos);
    }
    // Default to a brand-new memo draft with automatically advanced sequential number
    return createInitialMemo(null, memos);
  });

  // Initial cloud sync on mount from server and Firestore
  useEffect(() => {
    let isMounted = true;
    const syncMemosFromCloud = async () => {
      try {
        const local = getSavedInternalMemos();
        const mergedMap = new Map<string, InternalMemo>();
        local.forEach((m) => { if (m.id) mergedMap.set(m.id, m); });

        // 1. Fetch from server backend
        try {
          const res = await fetch('/api/internal-memos');
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.memos)) {
              data.memos.forEach((m: InternalMemo) => {
                if (m.id && !mergedMap.has(m.id)) {
                  mergedMap.set(m.id, m);
                } else if (m.id && m.updatedAt) {
                  const existing = mergedMap.get(m.id);
                  if (!existing?.updatedAt || new Date(m.updatedAt) > new Date(existing.updatedAt)) {
                    mergedMap.set(m.id, m);
                  }
                }
              });
            }
          }
        } catch (_) {}

        // 2. Fetch from Firestore
        try {
          const fsMemos = await getInternalMemosFromFirestore();
          if (Array.isArray(fsMemos)) {
            fsMemos.forEach((m) => {
              if (m.id && !mergedMap.has(m.id)) {
                mergedMap.set(m.id, m);
              }
            });
          }
        } catch (_) {}

        if (isMounted) {
          const mergedList = Array.from(mergedMap.values());
          mergedList.sort((a, b) => new Date(b.createdAt || b.tanggal).getTime() - new Date(a.createdAt || a.tanggal).getTime());
          if (mergedList.length > 0) {
            setMemos(mergedList);
            saveInternalMemos(mergedList);
          }
        }
      } catch (err) {
        console.warn('Error syncing internal memos on mount:', err);
      }
    };

    syncMemosFromCloud();
    return () => { isMounted = false; };
  }, []);

  // When memos list updates, if user is on a fresh new draft, keep nomorMemo aligned with latest sequence
  useEffect(() => {
    if (!editingExistingId && memos.length > 0) {
      const nextNomor = generateNextMemoNumber(memos, currentMemo.tanggal ? new Date(currentMemo.tanggal) : new Date(), 168);
      // Only auto-update if nomorMemo matches a default template pattern
      if (currentMemo.nomorMemo !== nextNomor && (!currentMemo.nomorMemo || currentMemo.nomorMemo.includes('/IM-NMSA/KEU/'))) {
        setCurrentMemo((prev) => ({ ...prev, nomorMemo: nextNomor }));
      }
    }
  }, [memos.length, editingExistingId]);

  // If initialSubmissionForMemo changes, update currentMemo with sequential number
  useEffect(() => {
    if (initialSubmissionForMemo) {
      const newMemo = createInitialMemo(initialSubmissionForMemo, memos);
      setCurrentMemo(newMemo);
      setEditingExistingId(null);
      setActiveTab('editor');
    }
  }, [initialSubmissionForMemo]);

  // If ?id= is in URL (?view=memo&id=...), auto-load that memo
  useEffect(() => {
    try {
      const sParams = new URLSearchParams(window.location.search);
      const targetId = sParams.get('id') || '';
      if (targetId && memos.length > 0) {
        const found = memos.find(m => m.id === targetId || m.nomorMemo === targetId);
        if (found) {
          setCurrentMemo(found);
          setEditingExistingId(found.id);
          setActiveTab('editor');
        }
      }
    } catch (_) {}
  }, [memos]);

  // AI polishing state
  const [isPolishing, setIsPolishing] = useState(false);
  const [aiSuccessMsg, setAiSuccessMsg] = useState('');
  const [aiErrorMsg, setAiErrorMsg] = useState('');

  // Save notification
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Search filter for history
  const [searchQuery, setSearchQuery] = useState('');

  // Linked voucher picker modal / dropdown state
  const [isVoucherPickerOpen, setIsVoucherPickerOpen] = useState(false);

  // Sync bank accounts when updated
  const handleSaveBankAccounts = (updated: BankAccountMaster[]) => {
    setBankAccounts(updated);
    saveBankAccounts(updated);
  };

  // Sync internal memos to storage
  const persistMemos = (updated: InternalMemo[]) => {
    setMemos(updated);
    saveInternalMemos(updated);
  };

  // Save auto drive upload preference
  const handleToggleAutoDrive = (enabled: boolean) => {
    setIsAutoDriveUploadEnabled(enabled);
    try {
      localStorage.setItem('NMSA_MEMO_AUTO_DRIVE_BACKUP', enabled ? 'true' : 'false');
    } catch (_) {}
  };

  // Save current memo to Riwayat & optionally to Google Drive
  const handleSaveCurrentMemo = async (options?: { forceUploadDrive?: boolean; forceAsNew?: boolean }) => {
    const existingIndex = editingExistingId
      ? memos.findIndex((m) => m.id === editingExistingId)
      : memos.findIndex((m) => m.id === currentMemo.id);
    const existingMemo = existingIndex >= 0 ? memos[existingIndex] : null;

    // Detect if this should be saved as a brand new memo entry:
    // 1. Explicitly requested with forceAsNew
    // 2. Not currently editing an existing memo (editingExistingId is null)
    // 3. Current memo ID is not in saved memos
    // 4. User changed nomorMemo to a different number than the saved existing memo
    const isDifferentNumber = Boolean(existingMemo && existingMemo.nomorMemo !== currentMemo.nomorMemo);
    const shouldSaveAsNew = Boolean(
      options?.forceAsNew ||
      !editingExistingId ||
      existingIndex < 0 ||
      isDifferentNumber
    );

    let payload: InternalMemo;
    let updated: InternalMemo[];

    if (shouldSaveAsNew) {
      const newId = `memo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      // If forced as new, ensure number advances if it matched old memo
      const nextNomor = options?.forceAsNew && !isDifferentNumber
        ? generateNextMemoNumber(memos, currentMemo.tanggal ? new Date(currentMemo.tanggal) : new Date(), 168)
        : currentMemo.nomorMemo;

      payload = {
        ...currentMemo,
        id: newId,
        nomorMemo: nextNomor,
        useImageHeader: true,
        companyHeaderUrl: currentMemo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL,
        updatedAt: new Date().toISOString(),
        createdAt: currentMemo.createdAt || new Date().toISOString(),
      };

      updated = [payload, ...memos.filter((m) => m.id !== payload.id)];
      setCurrentMemo(payload);
      setEditingExistingId(payload.id);
    } else {
      payload = {
        ...currentMemo,
        useImageHeader: true,
        companyHeaderUrl: currentMemo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL,
        updatedAt: new Date().toISOString(),
      };
      updated = [...memos];
      updated[existingIndex] = payload;
      setCurrentMemo(payload);
      setEditingExistingId(payload.id);
    }

    persistMemos(updated);

    // Sync to backend server
    try {
      fetch('/api/internal-memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo: payload }),
      }).catch((e) => console.warn('Server memo sync error:', e));
    } catch (_) {}

    // Sync to Firestore Cloud
    try {
      saveInternalMemoToFirestore(payload).catch((e) => console.warn('Firestore memo sync error:', e));
    } catch (_) {}

    setSaveSuccessMsg(
      shouldSaveAsNew
        ? `Internal Memo baru (${payload.nomorMemo}) berhasil ditambahkan ke Riwayat! Total tersimpan: ${updated.length} memo.`
        : `Perubahan memo (${payload.nomorMemo}) berhasil disimpan ke Riwayat!`
    );

    const shouldUploadDrive = options?.forceUploadDrive || isAutoDriveUploadEnabled;

    if (shouldUploadDrive) {
      setIsUploadingDrive(true);
      setDriveErrorMsg('');
      setDriveSuccessMsg('');

      try {
        const docElem = document.getElementById('internal-memo-printable-document');
        const driveRes = await memoGoogleDriveService.uploadMemo(payload, docElem || undefined);

        if (driveRes.success && driveRes.url) {
          payload = {
            ...payload,
            driveUrl: driveRes.url,
            driveFileId: driveRes.fileId,
            driveFolderPath: driveRes.folderPath,
            driveSyncedAt: new Date().toISOString(),
          };

          const reUpdated = updated.map((m) => (m.id === payload.id ? payload : m));
          persistMemos(reUpdated);
          setCurrentMemo(payload);

          // Update backend & Firestore with Drive link
          fetch('/api/internal-memos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memo: payload }),
          }).catch(() => {});
          saveInternalMemoToFirestore(payload).catch(() => {});

          setDriveSuccessMsg(`Tersimpan di Google Drive: ${driveRes.folderPath}`);
          setTimeout(() => setDriveSuccessMsg(''), 7000);
        } else if (driveRes.error) {
          setDriveErrorMsg(`Google Drive: ${driveRes.error}`);
          setTimeout(() => setDriveErrorMsg(''), 6000);
        }
      } catch (err: any) {
        setDriveErrorMsg(`Gagal upload ke Drive: ${err.message}`);
        setTimeout(() => setDriveErrorMsg(''), 6000);
      } finally {
        setIsUploadingDrive(false);
      }
    }

    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  // Upload specific memo from history to Google Drive
  const handleUploadSpecificMemoToDrive = async (targetMemo: InternalMemo) => {
    setSyncingMemoId(targetMemo.id);

    try {
      const domElem = currentMemo.id === targetMemo.id ? document.getElementById('internal-memo-printable-document') : null;
      const driveRes = await memoGoogleDriveService.uploadMemo(targetMemo, domElem || undefined);

      if (driveRes.success && driveRes.url) {
        const updatedMemo: InternalMemo = {
          ...targetMemo,
          driveUrl: driveRes.url,
          driveFileId: driveRes.fileId,
          driveFolderPath: driveRes.folderPath,
          driveSyncedAt: new Date().toISOString(),
        };

        const updatedList = memos.map((m) => (m.id === updatedMemo.id ? updatedMemo : m));
        persistMemos(updatedList);
        if (currentMemo.id === updatedMemo.id) {
          setCurrentMemo(updatedMemo);
        }

        // Sync to server and Firestore
        fetch('/api/internal-memos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memo: updatedMemo }),
        }).catch(() => {});
        saveInternalMemoToFirestore(updatedMemo).catch(() => {});

        setDriveSuccessMsg(`Memo ${targetMemo.nomorMemo} berhasil diarsipkan di Google Drive: ${driveRes.folderPath}!`);
        setTimeout(() => setDriveSuccessMsg(''), 6000);
      } else if (driveRes.error) {
        setDriveErrorMsg(driveRes.error);
        setTimeout(() => setDriveErrorMsg(''), 6000);
      }
    } catch (e: any) {
      setDriveErrorMsg(e.message || 'Gagal menyimpan ke Google Drive.');
      setTimeout(() => setDriveErrorMsg(''), 6000);
    } finally {
      setSyncingMemoId(null);
    }
  };

  // Toggle selection for single memo
  const handleToggleSelectMemo = (memoId: string) => {
    setSelectedMemoIds((prev) =>
      prev.includes(memoId) ? prev.filter((id) => id !== memoId) : [...prev, memoId]
    );
  };

  // Toggle select all filtered memos
  const handleToggleSelectAll = () => {
    if (selectedMemoIds.length === filteredMemos.length) {
      setSelectedMemoIds([]);
    } else {
      setSelectedMemoIds(filteredMemos.map((m) => m.id));
    }
  };

  // Upload selected memos to Google Drive
  const handleUploadSelectedMemosToDrive = async () => {
    const selectedMemos = memos.filter((m) => selectedMemoIds.includes(m.id));
    if (selectedMemos.length === 0) {
      setDriveErrorMsg('Pilih minimal 1 memo untuk diunggah ke Google Drive.');
      setTimeout(() => setDriveErrorMsg(''), 4000);
      return;
    }

    setIsBulkSyncing(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedMemos.length; i++) {
      const m = selectedMemos[i];
      setUploadProgress({ current: i + 1, total: selectedMemos.length, memoNumber: m.nomorMemo });
      try {
        const domElem = currentMemo.id === m.id ? document.getElementById('internal-memo-printable-document') : null;
        const res = await memoGoogleDriveService.uploadMemo(m, domElem || undefined);
        if (res.success && res.url) {
          const updatedMemo: InternalMemo = {
            ...m,
            driveUrl: res.url,
            driveFileId: res.fileId,
            driveFolderPath: res.folderPath,
            driveSyncedAt: new Date().toISOString(),
          };
          setMemos((prev) => prev.map((x) => (x.id === m.id ? updatedMemo : x)));
          saveInternalMemos(getSavedInternalMemos().map((x) => (x.id === m.id ? updatedMemo : x)));
          saveInternalMemoToFirestore(updatedMemo).catch(() => {});
          try {
            fetch('/api/internal-memos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memo: updatedMemo }),
            }).catch(() => {});
          } catch (_) {}
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.warn(`Failed to sync memo ${m.nomorMemo}:`, err);
        failCount++;
      }
    }

    setUploadProgress(null);
    setIsBulkSyncing(false);
    setSelectedMemoIds([]);
    setDriveSuccessMsg(
      `Selesai! ${successCount} memo terpilih berhasil diarsipkan ke Google Drive.${failCount > 0 ? ` (${failCount} gagal)` : ''}`
    );
    setTimeout(() => setDriveSuccessMsg(''), 7000);
  };

  // Upload all memos in riwayat to Google Drive
  const handleUploadAllMemosToDrive = async () => {
    if (memos.length === 0) {
      setDriveErrorMsg('Belum ada memo di riwayat.');
      setTimeout(() => setDriveErrorMsg(''), 4000);
      return;
    }

    setIsBulkSyncing(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < memos.length; i++) {
      const m = memos[i];
      setUploadProgress({ current: i + 1, total: memos.length, memoNumber: m.nomorMemo });
      try {
        const domElem = currentMemo.id === m.id ? document.getElementById('internal-memo-printable-document') : null;
        const res = await memoGoogleDriveService.uploadMemo(m, domElem || undefined);
        if (res.success && res.url) {
          const updatedMemo: InternalMemo = {
            ...m,
            driveUrl: res.url,
            driveFileId: res.fileId,
            driveFolderPath: res.folderPath,
            driveSyncedAt: new Date().toISOString(),
          };
          setMemos((prev) => prev.map((x) => (x.id === m.id ? updatedMemo : x)));
          saveInternalMemos(getSavedInternalMemos().map((x) => (x.id === m.id ? updatedMemo : x)));
          saveInternalMemoToFirestore(updatedMemo).catch(() => {});
          try {
            fetch('/api/internal-memos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memo: updatedMemo }),
            }).catch(() => {});
          } catch (_) {}
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.warn(`Failed to sync memo ${m.nomorMemo}:`, err);
        failCount++;
      }
    }

    setUploadProgress(null);
    setIsBulkSyncing(false);
    setDriveSuccessMsg(
      `Selesai! ${successCount} dari ${memos.length} memo di riwayat berhasil diarsipkan ke Google Drive.${failCount > 0 ? ` (${failCount} gagal)` : ''}`
    );
    setTimeout(() => setDriveSuccessMsg(''), 7000);
  };

  // Create new blank / default memo with next accumulated sequence
  const handleCreateNewMemo = () => {
    const fresh = createInitialMemo(null, memos);
    setCurrentMemo(fresh);
    setEditingExistingId(null);
    setActiveTab('editor');
    setSaveSuccessMsg(`Draf memo baru dengan Nomor ${fresh.nomorMemo} siap diedit.`);
    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  // Duplicate current memo with next accumulated sequence
  const handleDuplicateMemo = (memoToDupe: InternalMemo = currentMemo) => {
    const nextNomor = generateNextMemoNumber(memos, new Date(), 168);
    const duplicated: InternalMemo = {
      ...memoToDupe,
      id: `memo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      nomorMemo: nextNomor,
      tanggal: new Date().toISOString().split('T')[0],
      hariTanggalDisplay: formatHariTanggalMemo(new Date()),
      driveFileId: undefined,
      driveUrl: undefined,
      driveFolderPath: undefined,
      driveSyncedAt: undefined,
      useImageHeader: true,
      companyHeaderUrl: memoToDupe.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persistMemos([duplicated, ...memos]);
    setCurrentMemo(duplicated);
    setEditingExistingId(duplicated.id);
    setActiveTab('editor');
    setSaveSuccessMsg(`Memo diduplikasi sebagai Nomor baru: ${nextNomor}`);
    setTimeout(() => setSaveSuccessMsg(''), 3500);

    // Sync to backend and firestore
    fetch('/api/internal-memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo: duplicated }),
    }).catch(() => {});
    saveInternalMemoToFirestore(duplicated).catch(() => {});
  };

  // Delete a memo
  const handleDeleteMemo = (id: string) => {
    if (window.confirm('Hapus memo internal ini dari riwayat?')) {
      const updated = memos.filter((m) => m.id !== id);
      persistMemos(updated);
      setSelectedMemoIds((prev) => prev.filter((mId) => mId !== id));

      // Delete from server & Firestore
      try {
        fetch(`/api/internal-memos/${id}`, { method: 'DELETE' }).catch(() => {});
        deleteInternalMemoFromFirestore(id).catch(() => {});
      } catch (_) {}

      if (currentMemo.id === id || editingExistingId === id) {
        setEditingExistingId(null);
        setCurrentMemo(createInitialMemo(null, updated));
      }
      setSaveSuccessMsg('Memo berhasil dihapus dari riwayat.');
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    }
  };

  // Select a memo from history to edit
  const handleSelectMemoFromHistory = (memo: InternalMemo) => {
    setCurrentMemo({
      ...memo,
      useImageHeader: true,
      companyHeaderUrl: memo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL,
    });
    setEditingExistingId(memo.id);
    setActiveTab('editor');
    setSaveSuccessMsg(`Membuka memo ${memo.nomorMemo} dari riwayat untuk diedit.`);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // Handle date change
  const handleDateChange = (isoDate: string) => {
    const formatted = formatHariTanggalMemo(isoDate);
    setCurrentMemo((prev) => ({
      ...prev,
      tanggal: isoDate,
      hariTanggalDisplay: formatted,
    }));
  };

  // Handle bank account change from dropdown
  const handleSelectBankAccount = (acc: BankAccountMaster) => {
    setCurrentMemo((prev) => ({
      ...prev,
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      accountHolder: acc.accountHolder,
    }));
  };

  // Link memo to an existing voucher
  const handleLinkVoucher = (sub: Submission) => {
    const subTotal = (sub.items || []).reduce((sum, item) => sum + (item.total || 0), 0);
    const formattedAmount = `Rp. ${Number(subTotal).toLocaleString('id-ID')},-`;
    const invoiceOrRef = sub.kode ? `No. ${sub.kode}` : '';
    const dateFormatted = formatHariTanggalMemo(sub.tanggal || new Date());

    // Check if currently opened memo was already saved in history
    const isExistingSaved = memos.some((m) => m.id === currentMemo.id);
    const nextNomor = isExistingSaved
      ? generateNextMemoNumber(memos, new Date(), 168)
      : currentMemo.nomorMemo || generateNextMemoNumber(memos, new Date(), 168);
    const newId = isExistingSaved
      ? `memo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      : currentMemo.id;

    setCurrentMemo((prev) => ({
      ...prev,
      id: newId,
      nomorMemo: nextNomor,
      linkedSubmissionId: sub.id,
      linkedSubmissionKode: sub.kode,
      linkedAmount: subTotal,
      perihal: `Pembayaran ${sub.jenisPengajuan || 'Operasional'} - ${sub.dibayarkanKepada || ''}`.trim(),
      isiSurat: `Sehubungan dengan adanya pengajuan pembayaran keperluan ${sub.jenisPengajuan || 'operasional'} terkait ${sub.dibayarkanKepada || 'pihak rekanan'} sesuai rincian pada formulir voucher pengeluaran ${invoiceOrRef} tertanggal ${dateFormatted}, dengan ini kami memohon untuk dilakukan pembayaran sebesar ${formattedAmount} dapat di transfer ke :`,
      accountHolder: sub.dibayarkanKepada || prev.accountHolder,
      useImageHeader: true,
      driveUrl: undefined,
      driveFileId: undefined,
      driveFolderPath: undefined,
      driveSyncedAt: undefined,
    }));
    setIsVoucherPickerOpen(false);
    setSaveSuccessMsg(`Memo disiapkan untuk voucher ${sub.kode} dengan Nomor ${nextNomor}!`);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // AI Polish feature
  const handlePolishWithAI = async () => {
    setIsPolishing(true);
    setAiSuccessMsg('');
    setAiErrorMsg('');

    try {
      const response = await fetch('/api/gemini/refine-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftText: currentMemo.isiSurat,
          perihal: currentMemo.perihal,
          kepada: currentMemo.kepada,
          dari: currentMemo.dari,
          nominal: currentMemo.linkedAmount ? `Rp. ${currentMemo.linkedAmount.toLocaleString('id-ID')}` : undefined,
          voucherKode: currentMemo.linkedSubmissionKode,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyempurnakan teks dengan AI.');
      }

      if (data.text) {
        setCurrentMemo((prev) => ({
          ...prev,
          isiSurat: data.text,
        }));
        setAiSuccessMsg('✨ Isi surat berhasil disempurnakan menjadi lebih formal & berwibawa!');
        setTimeout(() => setAiSuccessMsg(''), 4000);
      }
    } catch (err: any) {
      console.error('AI refine error:', err);
      setAiErrorMsg(err.message || 'Terjadi kesalahan saat memanggil asisten AI.');
      setTimeout(() => setAiErrorMsg(''), 5000);
    } finally {
      setIsPolishing(false);
    }
  };

  // Restore sample document matching user's official "IM - Pembayaran Tongkang" Word document
  const handleLoadSampleDokumen = () => {
    const nextNomor = generateNextMemoNumber(memos, new Date(), 168);
    setCurrentMemo({
      id: `memo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      nomorMemo: nextNomor,
      tanggal: '2026-09-24',
      hariTanggalDisplay: 'Kamis / 24 September 2026',
      dari: 'Andi Muhammad Rifki – Direktur',
      kepada: 'Harijon – Direktur Keuangan',
      perihal: 'Pembayaran DP Batubara 50%',
      isiSurat:
        'Sehubungan dengan akan dilakukannya kegiatan pengiriman Batubara ke <strong>PLTU Pelabuhan Ratu ADC</strong>, dengan ini kami memohon untuk dapat dilakukan pembayaran <strong>DP Tongkang sebesar 50%</strong> dari total biaya yang terlampir didalam <strong>Invoice No. 001-DP/WAA-BJM-NMSA/IX/26 Tanggal 23 September 2026</strong>, yaitu <strong>Sebesar Rp. 712.500.000,-</strong> dapat di Transfer ke :',
      bankName: 'Bank Mandiri',
      accountNumber: '1030013139064',
      accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
      penutup:
        'Demikian Internal Memo ini dibuat untuk dapat dipahami bersama dan dilaksanakan sebaik baiknya',
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
      useImageHeader: true,
      createdAt: new Date().toISOString(),
    });
    setSaveSuccessMsg(`Contoh DP Batubara dimuat dengan Nomor ${nextNomor}!`);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // Print function with complete isolation to match Microsoft Word exact output
  const handlePrint = () => {
    // Automatically save before print
    handleSaveCurrentMemo();
    document.body.classList.add('is-printing-internal-memo');

    const cleanup = () => {
      document.body.classList.remove('is-printing-internal-memo');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
      window.print();
      // Fallback timeout cleanup in case afterprint doesn't trigger on some browsers
      setTimeout(cleanup, 2500);
    }, 150);
  };

  // Filter memos for history tab
  const filteredMemos = memos.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.nomorMemo.toLowerCase().includes(q) ||
      m.perihal.toLowerCase().includes(q) ||
      m.kepada.toLowerCase().includes(q) ||
      m.bankName.toLowerCase().includes(q) ||
      m.accountNumber.toLowerCase().includes(q) ||
      m.hariTanggalDisplay.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 font-sans">
      {/* HEADER BAR */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToList}
            className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Kembali ke Daftar Voucher HO"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Voucher HO</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-stone-900 tracking-tight flex items-center gap-2">
                <FileText className="text-amber-600" size={20} />
                Internal Memo Resmi Direksi
              </h2>
              <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                PT. NMSA
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Format resmi memo direksi permohonan transfer dana operasional / transaksi voucher
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* Navigation Tabs */}
          <div className="bg-stone-100 p-1 rounded-xl flex items-center gap-1 border border-stone-200">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'editor'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Edit size={14} />
              <span>Editor Memo</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <FileText size={14} />
              <span>Riwayat ({memos.length})</span>
            </button>
            <button
              onClick={() => setIsBankModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
            >
              <CreditCard size={14} />
              <span>Master Rekening</span>
            </button>
          </div>

          {/* Auto Google Drive Backup Toggle */}
          <button
            type="button"
            onClick={() => handleToggleAutoDrive(!isAutoDriveUploadEnabled)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border cursor-pointer ${
              isAutoDriveUploadEnabled
                ? 'bg-blue-50 border-blue-300 text-blue-800 shadow-2xs'
                : 'bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-700'
            }`}
            title="Otomatis unggah PDF ke Google Drive (Folder khusus: INTERNAL-MEMO-NMSA / Tahun / Bulan / Tanggal) setiap kali memo disimpan"
          >
            <Cloud size={14} className={isAutoDriveUploadEnabled ? 'text-blue-600' : 'text-stone-400'} />
            <span className="hidden sm:inline">Auto Drive:</span>
            <span className={isAutoDriveUploadEnabled ? 'text-blue-700 font-extrabold' : 'text-stone-500'}>
              {isAutoDriveUploadEnabled ? 'AKTIF' : 'NONAKTIF'}
            </span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            title="Cetak A4 atau Simpan sebagai PDF"
          >
            <Printer size={15} />
            <span>Cetak / PDF</span>
          </button>
        </div>
      </div>

      {/* SUCCESS / ALERT BANNERS */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs animate-in fade-in duration-200 print:hidden">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {driveSuccessMsg && (
        <div className="bg-blue-50 border border-blue-300 text-blue-950 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-in fade-in duration-200 print:hidden">
          <div className="flex items-center gap-2">
            <FolderCheck size={16} className="text-blue-600 shrink-0" />
            <span>{driveSuccessMsg}</span>
          </div>
          {currentMemo.driveUrl && (
            <a
              href={currentMemo.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1 text-[11px] font-bold shrink-0"
            >
              <span>Buka di Drive</span>
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {driveErrorMsg && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 shadow-xs animate-in fade-in duration-200 print:hidden">
          <Cloud size={16} className="text-amber-600 shrink-0" />
          <span>{driveErrorMsg}</span>
        </div>
      )}

      {/* VIEW 1: EDITOR MEMO (Form on left, Live A4 Preview on right) */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:block print:w-full print:p-0 print:m-0">
          {/* FORM CONTROLS (Left side 5 cols on lg) */}
          <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-5 print:hidden">
            {/* Quick Actions Header */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-stone-700">
                Pengaturan Isi Dokumen
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCreateNewMemo}
                  className="px-2.5 py-1 text-[11px] font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  title="Buat draf memo baru (nomor otomatis)"
                >
                  <Plus size={13} /> Baru
                </button>
                <button
                  type="button"
                  onClick={handleLoadSampleDokumen}
                  className="px-2.5 py-1 text-[11px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg transition flex items-center gap-1 cursor-pointer"
                  title="Muat contoh DP Batubara PLTU Pelabuhan Ratu"
                >
                  <RefreshCw size={13} /> Contoh DP Batubara
                </button>
              </div>
            </div>

            {/* Mode Indicator Banner: Editing vs New Memo */}
            {editingExistingId ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Edit size={13} className="text-amber-700 shrink-0" />
                    <span className="truncate">Mode Edit: Memo {currentMemo.nomorMemo}</span>
                  </div>
                  <p className="text-[10.5px] text-amber-700 leading-tight mt-0.5">
                    Menyimpan akan memperbarui memo ini di riwayat.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateNewMemo}
                  className="px-2.5 py-1.5 bg-white hover:bg-stone-50 border border-amber-300 text-stone-800 text-[11px] font-bold rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
                  title="Batal edit dan buat draf memo baru"
                >
                  + Buat Memo Baru
                </button>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between text-xs gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <Sparkles size={13} className="text-emerald-600 shrink-0" />
                    <span>Draf Memo Baru</span>
                    <span className="font-mono text-[11px] bg-emerald-100/90 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                      {currentMemo.nomorMemo}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-emerald-700 leading-tight mt-0.5">
                    Nomor dihitung otomatis terakumulasi dari memo sebelumnya.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = generateNextMemoNumber(memos, currentMemo.tanggal ? new Date(currentMemo.tanggal) : new Date(), 168);
                    setCurrentMemo((prev) => ({ ...prev, nomorMemo: next }));
                    setSaveSuccessMsg(`Nomor otomatis disegarkan: ${next}`);
                    setTimeout(() => setSaveSuccessMsg(''), 2500);
                  }}
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-bold rounded-lg transition shrink-0 cursor-pointer flex items-center gap-1"
                  title="Hitung ulang nomor urut otomatis berikutnya"
                >
                  <RefreshCw size={11} />
                  <span>Segarkan No</span>
                </button>
              </div>
            )}

            {/* Link from Voucher Button */}
            {submissions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsVoucherPickerOpen(!isVoucherPickerOpen)}
                  className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl text-xs font-bold text-amber-950 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <LinkIcon size={14} className="text-amber-700" />
                    <span>
                      {currentMemo.linkedSubmissionKode
                        ? `Terhubung ke: ${currentMemo.linkedSubmissionKode}`
                        : 'Hubungkan dengan Transaksi Voucher HO...'}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`transition-transform ${isVoucherPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {isVoucherPickerOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-stone-300 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto p-2 space-y-1">
                    <p className="text-[10px] font-bold text-stone-400 px-2 py-1 uppercase">
                      Pilih voucher untuk auto-fill memo:
                    </p>
                    {submissions.slice(0, 15).map((sub) => {
                      const subTotal = (sub.items || []).reduce((sum, item) => sum + (item.total || 0), 0);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleLinkVoucher(sub)}
                          className="w-full text-left p-2 hover:bg-amber-50 rounded-lg text-xs transition flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-stone-900">{sub.kode}</div>
                            <div className="text-[11px] text-stone-500">
                              {sub.jenisPengajuan} • {sub.dibayarkanKepada}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-emerald-800 text-[11px]">
                            Rp. {Number(subTotal).toLocaleString('id-ID')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Fields Grid */}
            <div className="space-y-3.5">
              {/* Kop Surat Setting - Pilihan Dengan Kop Surat atau Tanpa Kop Surat */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1.5">
                    <ImageIcon size={13} className="text-amber-600" />
                    <span>Pilihan Format Kop Surat</span>
                  </label>
                  {/* Segmented Button: Dengan Kop vs Tanpa Kop */}
                  <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-stone-200/70 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          showKopSurat: true,
                          useImageHeader: true,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                        currentMemo.showKopSurat !== false
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                      title="Tampilkan banner kop surat resmi PT. NMSA"
                    >
                      <Check size={12} />
                      <span>Dengan Kop Surat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          showKopSurat: false,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                        currentMemo.showKopSurat === false
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                      title="Sembunyikan kop surat (untuk cetak pada kertas blanko berkop fisik)"
                    >
                      <X size={12} />
                      <span>Tanpa Kop Surat</span>
                    </button>
                  </div>
                </div>

                {currentMemo.showKopSurat !== false ? (
                  <div className="bg-white border border-stone-200 rounded-xl p-2.5 shadow-2xs space-y-2">
                    <div className="w-full bg-stone-100 rounded-lg overflow-hidden border border-stone-200/80 p-1 flex items-center justify-center">
                      <img
                        src={currentMemo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL}
                        alt="Banner Kop Surat PT. NMSA"
                        className="w-full h-auto max-h-16 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 mb-1">
                        Link Direct Gambar Kop Surat :
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={currentMemo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              useImageHeader: true,
                              companyHeaderUrl: e.target.value,
                            }))
                          }
                          placeholder="https://... atau /kop-surat-nmsa-full.png"
                          className="flex-1 px-2.5 py-1.5 text-[11px] font-mono bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const url = currentMemo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL;
                            const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
                            navigator.clipboard.writeText(fullUrl);
                            setSaveSuccessMsg('Link direct kop surat berhasil disalin!');
                            setTimeout(() => setSaveSuccessMsg(''), 2500);
                          }}
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-[10.5px] font-bold text-stone-700 rounded-lg transition shrink-0 cursor-pointer flex items-center gap-1"
                          title="Salin link direct kop surat"
                        >
                          <Copy size={12} />
                          <span>Salin Link</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              useImageHeader: true,
                              companyHeaderUrl: OFFICIAL_KOP_SURAT_IMAGE_URL,
                            }))
                          }
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-amber-100 text-[10.5px] font-bold text-stone-600 hover:text-amber-900 rounded-lg transition shrink-0 cursor-pointer"
                          title="Reset ke Kop Surat Resmi Default NMSA"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-stone-700 text-xs flex items-center gap-2.5">
                    <AlertCircle size={16} className="text-amber-600 shrink-0" />
                    <div>
                      <strong className="text-amber-950 font-bold block">Mode Tanpa Kop Surat Aktif</strong>
                      <span className="text-[11px] text-stone-600">
                        Banner kop surat dihilangkan dan ruang margin atas otomatis disiapkan untuk dicetak langsung pada kertas blanko berkop fisik resmi perusahaan.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* No Memo */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  Nomor Dokumen Memo
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentMemo.nomorMemo}
                    onChange={(e) =>
                      setCurrentMemo((prev) => ({ ...prev, nomorMemo: e.target.value }))
                    }
                    placeholder="164/IM-NMSA/KEU/IX/2026"
                    className="flex-1 px-3 py-2 text-xs font-mono font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentMemo((prev) => ({
                        ...prev,
                        nomorMemo: generateNextMemoNumber(
                          memos,
                          prev.tanggal ? new Date(prev.tanggal) : new Date(),
                          168
                        ),
                      }))
                    }
                    className="px-2.5 py-2 bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 text-xs font-bold rounded-xl transition flex items-center gap-1 cursor-pointer"
                    title="Generate nomor urut memo otomatis terakumulasi (+1 dari nomor tertinggi)"
                  >
                    <RefreshCw size={12} />
                    <span>Auto Urut</span>
                  </button>
                </div>
              </div>

              {/* Hari & Tanggal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <Calendar size={13} /> Pilih Tanggal
                  </label>
                  <input
                    type="date"
                    value={currentMemo.tanggal}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Teks Hari / Tanggal
                  </label>
                  <input
                    type="text"
                    value={currentMemo.hariTanggalDisplay}
                    onChange={(e) =>
                      setCurrentMemo((prev) => ({
                        ...prev,
                        hariTanggalDisplay: e.target.value,
                      }))
                    }
                    placeholder="Senin / 21 September 2026"
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Dari & Kepada */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-stone-700">
                      Dari (Pejabat Pemohon)
                    </label>
                    <span className="text-[9px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                      Auto sinkron ke Penandatangan 1
                    </span>
                  </div>
                  <input
                    type="text"
                    value={currentMemo.dari}
                    onChange={(e) => {
                      const newDari = e.target.value;
                      const { nama, jabatan } = parseDari(newDari);
                      setCurrentMemo((prev) => ({
                        ...prev,
                        dari: newDari,
                        penandatanganNama: nama,
                        penandatanganJabatan: jabatan || (nama ? '' : prev.penandatanganJabatan),
                      }));
                    }}
                    placeholder="Andi Muhammad Rifki - Direktur"
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Kepada (Default Direktur Keuangan)
                  </label>
                  <input
                    type="text"
                    value={currentMemo.kepada}
                    onChange={(e) =>
                      setCurrentMemo((prev) => ({ ...prev, kepada: e.target.value }))
                    }
                    placeholder="Harijon – Direktur Keuangan"
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Perihal */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  Perihal
                </label>
                <input
                  type="text"
                  value={currentMemo.perihal}
                  onChange={(e) =>
                    setCurrentMemo((prev) => ({ ...prev, perihal: e.target.value }))
                  }
                  placeholder="Pembayaran DP Batubara 50%"
                  className="w-full px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Isi Surat with AI Assist */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-stone-700">
                    Isi Permohonan (setelah "Dengan Hormat,")
                  </label>
                  <button
                    type="button"
                    onClick={handlePolishWithAI}
                    disabled={isPolishing}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition flex items-center gap-1 shadow-3xs cursor-pointer ${
                      isPolishing
                        ? 'bg-amber-100 text-amber-600 animate-pulse'
                        : 'bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white'
                    }`}
                    title="Sempurnakan bahasa isi memo dengan AI agar lebih formal dan berwibawa"
                  >
                    <Sparkles size={13} className={isPolishing ? 'animate-spin' : ''} />
                    <span>{isPolishing ? 'Menyempurnakan...' : '✨ Sempurnakan dengan AI'}</span>
                  </button>
                </div>

                {aiSuccessMsg && (
                  <div className="mb-2 p-2 bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] rounded-lg font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span>{aiSuccessMsg}</span>
                  </div>
                )}

                {aiErrorMsg && (
                  <div className="mb-2 p-2 bg-red-50 border border-red-300 text-red-800 text-[11px] rounded-lg font-medium flex items-center gap-1.5">
                    <AlertCircle size={13} className="text-red-600 shrink-0" />
                    <span>{aiErrorMsg}</span>
                  </div>
                )}

                {/* Word-like Rich Text Editor */}
                <MemoRichEditor
                  value={currentMemo.isiSurat}
                  onChange={(html) =>
                    setCurrentMemo((prev) => ({ ...prev, isiSurat: html }))
                  }
                  placeholder="Sehubungan dengan akan dilakukannya kegiatan..."
                />
                <div className="flex justify-between text-[10px] text-stone-400 font-mono mt-0.5">
                  <span>{currentMemo.includeBankDetails === false ? '📄 Mode Surat Biasa Aktif (tanpa rekening tujuan)' : 'Pastikan berakhiran: "... dapat di transfer ke :"'}</span>
                  <span>{currentMemo.isiSurat.replace(/<[^>]*>/g, '').length} karakter</span>
                </div>
              </div>

              {/* Data No Rekening Dropdown & Master */}
              <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase text-amber-950 flex items-center gap-1.5">
                    <CreditCard size={14} className="text-amber-700" />
                    Data Rekening Tujuan Transfer
                  </span>

                  {/* Toggle Button Seperti Penandatangan: Tampilkan Rekening vs Hilangkan Rekening */}
                  <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-stone-200/70 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          includeBankDetails: true,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                        currentMemo.includeBankDetails !== false
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      <Check size={12} />
                      <span>Tampilkan Rekening</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          includeBankDetails: false,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                        currentMemo.includeBankDetails === false
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      <X size={12} />
                      <span>Hilangkan Rekening (Surat Biasa)</span>
                    </button>
                  </div>
                </div>

                {currentMemo.includeBankDetails !== false ? (
                  <>
                    <div className="flex items-center justify-between pt-1">
                      <label className="block text-[10px] font-bold text-stone-600">
                        Pilih Dari Daftar Rekening Tersimpan:
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsBankModalOpen(true)}
                        className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline flex items-center gap-1"
                      >
                        <Plus size={12} /> Kelola Master Rekening
                      </button>
                    </div>

                    {/* Dropdown Rekening */}
                    <div>
                      <select
                        onChange={(e) => {
                          const selected = bankAccounts.find((a) => a.id === e.target.value);
                          if (selected) handleSelectBankAccount(selected);
                        }}
                        value={
                          bankAccounts.find(
                            (a) =>
                              a.bankName === currentMemo.bankName &&
                              a.accountNumber === currentMemo.accountNumber
                          )?.id || ''
                        }
                        className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      >
                        <option value="" disabled>
                          -- Pilih Rekening Bank --
                        </option>
                        {bankAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.bankName} - {acc.accountNumber} ({acc.accountHolder})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Editable 3 fields for Bank */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                          Nama Bank
                        </label>
                        <input
                          type="text"
                          value={currentMemo.bankName}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({ ...prev, bankName: e.target.value }))
                          }
                          placeholder="Bank Mandiri"
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                          No. Rekening
                        </label>
                        <input
                          type="text"
                          value={currentMemo.accountNumber}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({ ...prev, accountNumber: e.target.value }))
                          }
                          placeholder="1030013139064"
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                          Nama Rekening
                        </label>
                        <input
                          type="text"
                          value={currentMemo.accountHolder}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({ ...prev, accountHolder: e.target.value }))
                          }
                          placeholder="PT. Nusantara Mineral Sukses Abadi"
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-3 bg-stone-100/80 border border-stone-200 rounded-xl text-stone-700 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-stone-500 shrink-0" />
                      <span>
                        <strong>Mode Surat Dinas / Biasa:</strong> Rincian nomor rekening tujuan disembunyikan dari berkas dan cetakan PDF memo ini.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentMemo((prev) => ({ ...prev, includeBankDetails: true }))}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shrink-0 transition"
                    >
                      Munculkan Rekening
                    </button>
                  </div>
                )}
              </div>

              {/* Signer Configuration Section (1, 2, or 3 Signers Sesuai Dokumen Word) */}
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200">
                  <span className="text-[11px] font-bold text-stone-800 flex items-center gap-1.5">
                    <Users size={14} className="text-amber-600" />
                    Format Penandatangan Dokumen
                  </span>
                  {/* Segmented Signer Mode Selector */}
                  <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-stone-200/70 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          signerCount: 3,
                          useSecondSigner: true,
                          useThirdSigner: true,
                          salamPenutup: prev.salamPenutup || 'Hormat Saya',
                          approvalHeaderTitle: prev.approvalHeaderTitle || 'Mengetahui dan Menyetujui',
                          penandatanganNama2: prev.penandatanganNama2 || 'Harijon',
                          penandatanganJabatan2: prev.penandatanganJabatan2 || 'Direktur Keuangan',
                          penandatanganNama3: prev.penandatanganNama3 || 'Abdul Aziz Halid',
                          penandatanganJabatan3: prev.penandatanganJabatan3 || 'Direktur Utama ANH',
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        currentMemo.signerCount === 3 || currentMemo.useThirdSigner
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      3 Pejabat (Resmi Word)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          signerCount: 2,
                          useSecondSigner: true,
                          useThirdSigner: false,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        currentMemo.signerCount === 2 ||
                        (currentMemo.useSecondSigner && !currentMemo.useThirdSigner && currentMemo.signerCount !== 3)
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      2 Pejabat
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          signerCount: 1,
                          useSecondSigner: false,
                          useThirdSigner: false,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        currentMemo.signerCount === 1 ||
                        (!currentMemo.useSecondSigner && !currentMemo.useThirdSigner)
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      1 Pejabat
                    </button>
                  </div>
                </div>

                {/* Penandatangan 1: Otomatis dari 'Dari' (Pembuat / Pemohon) */}
                <div className="bg-white p-3 rounded-lg border border-stone-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <User size={13} className="text-amber-600" />
                      <span className="text-[11px] font-bold text-stone-800">
                        Penandatangan 1 (Pejabat Pemohon)
                      </span>
                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <CheckCircle2 size={10} className="text-emerald-700" />
                        Otomatis dari Dari
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-stone-500 font-medium">Salam:</span>
                      <input
                        type="text"
                        value={currentMemo.salamPenutup || 'Hormat Saya'}
                        onChange={(e) =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            salamPenutup: e.target.value,
                          }))
                        }
                        placeholder="Hormat Saya"
                        className="px-2 py-0.5 text-[11px] bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none w-28 text-stone-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="block text-[10px] font-bold text-stone-600">
                          Nama Penandatangan 1
                        </label>
                        <span className="text-[9px] text-stone-400 font-medium">Sesuai nama di Dari</span>
                      </div>
                      <input
                        type="text"
                        value={currentMemo.penandatanganNama || parseDari(currentMemo.dari).nama}
                        onChange={(e) =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            penandatanganNama: e.target.value,
                          }))
                        }
                        placeholder="Andi Muhammad Rifki"
                        className="w-full px-2.5 py-1.5 text-xs font-bold bg-stone-50 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="block text-[10px] font-bold text-stone-600">
                          Jabatan Penandatangan 1
                        </label>
                        <span className="text-[9px] text-stone-400 font-medium">Sesuai jabatan di Dari</span>
                      </div>
                      <input
                        type="text"
                        value={currentMemo.penandatanganJabatan || parseDari(currentMemo.dari).jabatan}
                        onChange={(e) =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            penandatanganJabatan: e.target.value,
                          }))
                        }
                        placeholder="Direktur"
                        className="w-full px-2.5 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5 text-[10px] text-stone-500">
                    <span className="text-[9.5px] italic text-stone-500">
                      *Tercetak otomatis di bawah tanda tangan: <strong>{currentMemo.penandatanganNama || parseDari(currentMemo.dari).nama || 'Nama'}</strong> - (bawahnya) <strong>{currentMemo.penandatanganJabatan || parseDari(currentMemo.dari).jabatan || 'Jabatan'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = parseDari(currentMemo.dari);
                        setCurrentMemo((prev) => ({
                          ...prev,
                          penandatanganNama: parsed.nama,
                          penandatanganJabatan: parsed.jabatan,
                        }));
                      }}
                      className="text-[10px] text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer shrink-0 ml-2"
                    >
                      Sinkronkan Ulang
                    </button>
                  </div>
                </div>

                {/* Bagian Penandatangan 2 & 3 (Untuk 3 Pejabat Sesuai Word) */}
                {(currentMemo.signerCount === 3 || currentMemo.useThirdSigner) && (
                  <div className="bg-amber-50/60 p-3 rounded-lg border border-amber-200/80 space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-amber-200">
                      <span className="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                        <Users size={13} className="text-amber-700" />
                        Pihak yang Menyetujui (2 Pejabat Sejajar di Kanan)
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-stone-600 font-medium">Judul Header:</span>
                        <input
                          type="text"
                          value={currentMemo.approvalHeaderTitle || 'Mengetahui dan Menyetujui'}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              approvalHeaderTitle: e.target.value,
                            }))
                          }
                          placeholder="Mengetahui dan Menyetujui"
                          className="px-2 py-0.5 text-[11px] bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none w-44 text-stone-800 font-medium"
                        />
                      </div>
                    </div>

                    {/* Penandatangan 2: Harijon - Direktur Keuangan */}
                    <div className="bg-white p-2.5 rounded-lg border border-stone-200 space-y-1.5">
                      <span className="text-[10.5px] font-bold text-stone-700 block">
                        Penandatangan 2 (Mengetahui 1)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9.5px] font-bold text-stone-500 mb-0.5">Nama</label>
                          <input
                            type="text"
                            value={currentMemo.penandatanganNama2 || ''}
                            onChange={(e) =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganNama2: e.target.value,
                              }))
                            }
                            placeholder="Harijon"
                            className="w-full px-2 py-1 text-xs font-bold bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9.5px] font-bold text-stone-500 mb-0.5">Jabatan</label>
                          <input
                            type="text"
                            value={currentMemo.penandatanganJabatan2 || ''}
                            onChange={(e) =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganJabatan2: e.target.value,
                              }))
                            }
                            placeholder="Direktur Keuangan"
                            className="w-full px-2 py-1 text-xs bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {COMMON_MEMO_SIGNERS.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            onClick={() =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganNama2: s.name,
                                penandatanganJabatan2: s.role,
                              }))
                            }
                            className="px-1.5 py-0.5 text-[9.5px] bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-sm transition cursor-pointer"
                          >
                            {s.name} ({s.role})
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Penandatangan 3: Abdul Aziz Halid - Direktur Utama ANH */}
                    <div className="bg-white p-2.5 rounded-lg border border-stone-200 space-y-1.5">
                      <span className="text-[10.5px] font-bold text-stone-700 block">
                        Penandatangan 3 (Mengetahui 2)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9.5px] font-bold text-stone-500 mb-0.5">Nama</label>
                          <input
                            type="text"
                            value={currentMemo.penandatanganNama3 || ''}
                            onChange={(e) =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganNama3: e.target.value,
                              }))
                            }
                            placeholder="Abdul Aziz Halid"
                            className="w-full px-2 py-1 text-xs font-bold bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9.5px] font-bold text-stone-500 mb-0.5">Jabatan</label>
                          <input
                            type="text"
                            value={currentMemo.penandatanganJabatan3 || ''}
                            onChange={(e) =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganJabatan3: e.target.value,
                              }))
                            }
                            placeholder="Direktur Utama ANH"
                            className="w-full px-2 py-1 text-xs bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {COMMON_MEMO_SIGNERS.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            onClick={() =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganNama3: s.name,
                                penandatanganJabatan3: s.role,
                              }))
                            }
                            className="px-1.5 py-0.5 text-[9.5px] bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-sm transition cursor-pointer"
                          >
                            {s.name} ({s.role})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Bagian Penandatangan 2 Saja (Jika mode 2 Penandatangan dipilih) */}
                {currentMemo.signerCount === 2 && (
                  <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-bold text-stone-700">
                        Data Penandatangan 2 (Menyetujui)
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-stone-500 font-medium">Salam:</span>
                        <input
                          type="text"
                          value={currentMemo.salamPenutup2 || 'Menyetujui,'}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              salamPenutup2: e.target.value,
                            }))
                          }
                          placeholder="Menyetujui,"
                          className="px-2 py-0.5 text-[11px] bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none w-28 text-stone-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                          Nama Penandatangan 2
                        </label>
                        <input
                          type="text"
                          value={currentMemo.penandatanganNama2 || ''}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              penandatanganNama2: e.target.value,
                            }))
                          }
                          placeholder="Harijon"
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                          Jabatan Penandatangan 2
                        </label>
                        <input
                          type="text"
                          value={currentMemo.penandatanganJabatan2 || ''}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              penandatanganJabatan2: e.target.value,
                            }))
                          }
                          placeholder="Direktur Keuangan"
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-[10px] text-stone-400 self-center mr-1">Preset:</span>
                      {COMMON_MEMO_SIGNERS.map((s) => (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              penandatanganNama2: s.name,
                              penandatanganJabatan2: s.role,
                            }))
                          }
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 text-stone-700 border border-stone-250 rounded-md transition cursor-pointer"
                        >
                          {s.name} ({s.role})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Google Drive Status for Current Memo */}
              {currentMemo.driveUrl ? (
                <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-blue-900 min-w-0">
                    <FolderCheck size={18} className="text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 flex items-center gap-1.5">
                        <span>Tersimpan di Google Drive</span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-mono px-1.5 py-0.5 rounded">Resmi</span>
                      </p>
                      <p className="text-[10.5px] text-blue-700 font-mono truncate" title={currentMemo.driveFolderPath}>
                        📁 {currentMemo.driveFolderPath || 'INTERNAL-MEMO-NMSA'}
                      </p>
                    </div>
                  </div>
                  <a
                    href={currentMemo.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1 text-[11px] font-bold shrink-0 shadow-2xs"
                  >
                    <span>Buka PDF</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              ) : (
                <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between text-xs text-stone-600">
                  <div className="flex items-center gap-2">
                    <Cloud size={16} className="text-stone-400 shrink-0" />
                    <span className="text-[11px]">
                      {isAutoDriveUploadEnabled
                        ? 'Otomatis diunggah ke Google Drive saat disimpan'
                        : 'Belum disimpan ke Google Drive'}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                {editingExistingId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSaveCurrentMemo()}
                      className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Perbarui perubahan memo ini di riwayat"
                    >
                      <Save size={15} />
                      <span>Perbarui Memo Ini</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveCurrentMemo({ forceAsNew: true })}
                      className="py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Simpan sebagai memo baru dengan nomor urut berikutnya tanpa menimpa memo ini"
                    >
                      <Plus size={15} />
                      <span>Simpan Sebagai Baru</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSaveCurrentMemo()}
                    className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Simpan memo baru ini ke riwayat"
                  >
                    <Save size={15} />
                    <span>Simpan ke Riwayat</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isUploadingDrive}
                  onClick={() => handleSaveCurrentMemo({ forceUploadDrive: true })}
                  className="py-2.5 px-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Simpan ke Riwayat dan Langsung Unggah PDF ke Google Drive (Folder khusus: Tahun/Bulan/Tanggal)"
                >
                  {isUploadingDrive ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Mengunggah ke Drive...</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload size={15} />
                      <span>{currentMemo.driveUrl ? 'Perbarui di Drive' : 'Unggah ke Drive'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const link = getInternalMemoLink(currentMemo.id);
                    navigator.clipboard.writeText(link);
                    setSaveSuccessMsg(`Tautan memo ${currentMemo.nomorMemo} berhasil disalin!`);
                    setTimeout(() => setSaveSuccessMsg(''), 3000);
                  }}
                  className="px-3 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
                  title="Salin tautan langsung untuk membuka memo ini"
                >
                  <Share2 size={15} />
                  <span className="hidden sm:inline">Salin Link</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDuplicateMemo(currentMemo)}
                  className="px-3 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
                  title="Duplikasi sebagai nomor memo baru"
                >
                  <Copy size={15} />
                  <span className="hidden sm:inline">Duplikasi</span>
                </button>
              </div>
            </div>
          </div>

          {/* LIVE A4 DOCUMENT PREVIEW (Right side 7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col items-center print:block print:w-full print:p-0 print:m-0">
            <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-3 px-1 print:hidden">
              <span className="text-xs font-bold text-stone-500 font-mono">
                Pratinjau Resmi Lembar A4 (Siap Cetak / PDF)
              </span>

              <div className="flex items-center gap-2">
                {/* Quick Toggle: Dengan Kop Surat vs Tanpa Kop Surat */}
                <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-stone-100 text-[11px] shadow-2xs">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentMemo((prev) => ({
                        ...prev,
                        showKopSurat: true,
                        useImageHeader: true,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                      currentMemo.showKopSurat !== false
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="Tampilkan kop surat resmi pada pratinjau & cetakan"
                  >
                    <Check size={11} />
                    <span>Dengan Kop</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentMemo((prev) => ({
                        ...prev,
                        showKopSurat: false,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer flex items-center gap-1 ${
                      currentMemo.showKopSurat === false
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                    title="Sembunyikan kop surat untuk cetak pada kertas blanko berkop fisik"
                  >
                    <X size={11} />
                    <span>Tanpa Kop</span>
                  </button>
                </div>

                <button
                  onClick={handlePrint}
                  className="px-3 py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Printer size={13} />
                  <span>Cetak A4</span>
                </button>
              </div>
            </div>

            {/* Document wrapper */}
            <div className="w-full overflow-x-auto pb-6 print:overflow-visible print:p-0 print:m-0">
              <div className="min-w-[680px] sm:min-w-[740px] max-w-[860px] w-full mx-auto print:min-w-0 print:w-full print:max-w-none print:m-0 print:p-0">
                <InternalMemoDocument
                  memo={currentMemo}
                  showKopSurat={currentMemo.showKopSurat !== false}
                  customLogoUrl={userProfile?.companyDetails?.logoUrl}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: RIWAYAT DAFTAR MEMO TERSIMPAN */}
      {activeTab === 'history' && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4 print:hidden">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-stone-200 pb-4">
            <div>
              <h3 className="text-sm sm:text-base font-black text-stone-900">
                Daftar Riwayat Internal Memo ({memos.length})
              </h3>
              <p className="text-xs text-stone-500">
                Centang memo untuk diunggah ke Google Drive atau klik tombol unggah semua sekaligus.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* Select All Checkbox Button */}
              {filteredMemos.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="Pilih atau batalkan pilihan semua memo pada riwayat"
                >
                  {selectedMemoIds.length === filteredMemos.length && filteredMemos.length > 0 ? (
                    <>
                      <CheckSquare size={14} className="text-blue-600" />
                      <span>Batal Pilih</span>
                    </>
                  ) : (
                    <>
                      <Square size={14} className="text-stone-400" />
                      <span>Pilih Semua ({selectedMemoIds.length})</span>
                    </>
                  )}
                </button>
              )}

              {/* Upload Selected to Drive Button */}
              <button
                type="button"
                onClick={handleUploadSelectedMemosToDrive}
                disabled={isBulkSyncing || selectedMemoIds.length === 0}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                title="Unggah memo yang dicentang/terpilih ke Google Drive"
              >
                {isBulkSyncing && uploadProgress && selectedMemoIds.length > 0 ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Upload ({uploadProgress.current}/{uploadProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <FolderUp size={14} />
                    <span>Upload Terpilih ({selectedMemoIds.length})</span>
                  </>
                )}
              </button>

              {/* Upload All to Google Drive Button */}
              <button
                type="button"
                onClick={handleUploadAllMemosToDrive}
                disabled={isBulkSyncing || memos.length === 0}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                title="Unggah SEMUA memo di riwayat ke Google Drive"
              >
                {isBulkSyncing && uploadProgress && uploadProgress.total === memos.length ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Upload ({uploadProgress.current}/{uploadProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload size={14} />
                    <span>Upload Semua ke Drive</span>
                  </>
                )}
              </button>

              <div className="relative flex-1 sm:w-52">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Cari no. memo, perihal..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                onClick={handleCreateNewMemo}
                className="px-3 py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Plus size={14} /> Buat Memo
              </button>
            </div>
          </div>

          {/* Progress bar when bulk syncing to Google Drive */}
          {uploadProgress && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-bold text-blue-950">
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span>Mengunggah ke Google Drive: {uploadProgress.memoNumber}</span>
                </span>
                <span>{uploadProgress.current} dari {uploadProgress.total}</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {filteredMemos.length === 0 ? (
            <div className="py-12 text-center text-stone-400 text-xs">
              Tidak ada memo internal yang cocok dengan pencarian.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMemos.map((memo) => (
                <div
                  key={memo.id}
                  className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${
                    currentMemo.id === memo.id
                      ? 'bg-amber-50/70 border-amber-300 shadow-xs'
                      : 'bg-white border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectMemo(memo.id);
                          }}
                          className="p-0.5 text-stone-400 hover:text-blue-600 transition cursor-pointer shrink-0"
                          title={selectedMemoIds.includes(memo.id) ? 'Batalkan pilihan' : 'Pilih memo ini untuk diunggah ke Google Drive'}
                        >
                          {selectedMemoIds.includes(memo.id) ? (
                            <CheckSquare size={17} className="text-blue-600" />
                          ) : (
                            <Square size={17} className="text-stone-300 hover:text-stone-500" />
                          )}
                        </button>
                        <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                          {memo.nomorMemo}
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-500">
                        {memo.hariTanggalDisplay}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-stone-900 mt-2 line-clamp-1">
                      {memo.perihal}
                    </h4>

                    <p className="text-xs text-stone-600 line-clamp-2 mt-1 leading-relaxed">
                      {memo.isiSurat}
                    </p>

                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                      <span>
                        Bank: <strong className="text-stone-800">{memo.bankName}</strong> ({memo.accountNumber})
                      </span>
                      <span>
                        Dari: <strong className="text-stone-800">{memo.dari.split('–')[0]}</strong>
                      </span>
                    </div>

                    {/* Google Drive Status Bar for this Memo */}
                    <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between gap-2 text-[10.5px]">
                      {memo.driveUrl ? (
                        <div className="flex items-center gap-1.5 text-blue-800 min-w-0">
                          <FolderCheck size={13} className="text-blue-600 shrink-0" />
                          <span className="truncate font-mono text-[10px]" title={memo.driveFolderPath}>
                            {memo.driveFolderPath ? memo.driveFolderPath.split('/').slice(-3).join('/') : 'Google Drive'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-stone-400 text-[10.5px]">
                          <Cloud size={13} />
                          <span>Belum di Drive</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        {memo.driveUrl ? (
                          <a
                            href={memo.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10.5px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition"
                          >
                            <span>Lihat PDF</span>
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUploadSpecificMemoToDrive(memo)}
                            disabled={syncingMemoId === memo.id}
                            className="inline-flex items-center gap-1 text-[10.5px] font-bold text-stone-700 hover:text-blue-700 bg-stone-100 hover:bg-blue-50 border border-stone-200 px-2 py-0.5 rounded transition cursor-pointer"
                            title="Unggah berkas PDF memo ini ke Google Drive (folder tahun/bulan/tanggal)"
                          >
                            {syncingMemoId === memo.id ? (
                              <>
                                <Loader2 size={11} className="animate-spin text-blue-600" />
                                <span>Mengunggah...</span>
                              </>
                            ) : (
                              <>
                                <CloudUpload size={11} className="text-blue-600" />
                                <span>Upload Drive</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-stone-100">
                    <button
                      onClick={() => handleSelectMemoFromHistory(memo)}
                      className="px-2.5 py-1 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                    >
                      <Edit size={13} /> Buka di Editor
                    </button>
                    <button
                      onClick={() => {
                        handleSelectMemoFromHistory(memo);
                        document.body.classList.add('is-printing-internal-memo');
                        setTimeout(() => {
                          window.print();
                          setTimeout(() => {
                            document.body.classList.remove('is-printing-internal-memo');
                          }, 1000);
                        }, 200);
                      }}
                      className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition cursor-pointer"
                      title="Cetak langsung"
                    >
                      <Printer size={13} />
                    </button>
                    <button
                      onClick={() => handleDuplicateMemo(memo)}
                      className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition cursor-pointer"
                      title="Duplikasi memo"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteMemo(memo.id)}
                      className="px-2 py-1 bg-stone-100 hover:bg-red-100 text-stone-500 hover:text-red-700 text-xs font-bold rounded-lg transition cursor-pointer"
                      title="Hapus memo"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MASTER BANK ACCOUNTS MODAL */}
      <ManageBankAccountsModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        accounts={bankAccounts}
        onSaveAccounts={handleSaveBankAccounts}
        onSelectAccount={handleSelectBankAccount}
      />
    </div>
  );
};

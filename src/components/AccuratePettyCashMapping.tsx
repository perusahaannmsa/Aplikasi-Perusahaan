import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileSpreadsheet, FileText, Upload, Sparkles, CheckCircle2, AlertCircle, 
  Copy, Download, RefreshCw, Plus, Trash2, Edit2, Check, ArrowRight, 
  Settings, BookOpen, Layers, ShieldCheck, Search, Filter, HelpCircle,
  FileCheck, DollarSign, ChevronDown, ChevronUp, Save, Eye, X, ArrowLeftRight, ExternalLink,
  Cloud, Database, HardDrive, History, CheckCheck
} from 'lucide-react';
import { AccurateAccount, AccurateMappedTransaction, AccurateMappingReport, PettyCashReport, Submission } from '../types';
import { DEFAULT_ACCURATE_ACCOUNTS, autoMapTransactionToAccurate } from '../data/accurateCoaData';
import { isPettyCashSubmission, getPettyCashCustodian, sortSubmissionsDescending } from '../utils';
import { 
  saveAccurateMappingToFirestore, 
  deleteAccurateMappingFromFirestore,
  loadAccurateMappingsFromFirestore,
  ensureValidDriveToken,
  googleDriveLogin,
  isFirebaseConfigured,
  saveSubmissionToFirestore,
  getActiveGoogleDriveAccount,
  getConnectedDrives,
  executeDriveApiWithAutoRefresh
} from '../firebase';

interface AccuratePettyCashMappingProps {
  pettyCashReports?: PettyCashReport[];
  submissions?: Submission[];
  userProfile?: any;
  pettyCashHolders?: string[];
  onUpdatePettyCashHolders?: (holders: string[]) => void;
  onSaveSubmission?: (sub: Submission) => Promise<void> | void;
  onBack?: () => void;
}

interface CachedPettyCashMapping {
  reportTitle: string;
  period: string;
  transactions: AccurateMappedTransaction[];
  selectedKasCode: string;
  activeDocumentUrl: string | null;
  activeDocumentName: string | null;
  activeCustodianName: string | null;
  activeSubmission: Submission | null;
  updatedAt: string;
}

const getInitialCachedMapping = (): CachedPettyCashMapping | null => {
  try {
    const raw = localStorage.getItem('accurate_petty_cash_active_mapping_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load cached petty cash mapping:', e);
  }
  return null;
};

// Helper to normalize person names (strip Pak/Bpk/Ibu, normalize spacing and case)
const normalizePersonName = (rawName: string): string => {
  if (!rawName) return '';
  return rawName
    .trim()
    .replace(/^(pak|bpk|ibu|bapak)\s+/i, '')
    .trim();
};

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const formatIndonesianDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  try {
    const clean = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      const parts = clean.split('T')[0].split('-');
      const y = parts[0];
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (m >= 0 && m < 12 && !isNaN(d)) {
        return `${d} ${MONTH_NAMES_ID[m]} ${y}`;
      }
    } else if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/.test(clean)) {
      const parts = clean.split(/[\/\-\.]/);
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parts[2];
      if (m >= 0 && m < 12 && !isNaN(d)) {
        return `${d} ${MONTH_NAMES_ID[m]} ${y}`;
      }
    }
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()]} ${d.getFullYear()}`;
    }
  } catch (e) {}
  return dateStr;
};

export const calculatePettyCashPeriod = (
  txs: { date?: string }[],
  sub?: Submission | null,
  periodFallback?: string
): string => {
  const dates: { year: number; month: number; day: number; raw: string }[] = [];

  const parseToParts = (str?: string) => {
    if (!str) return null;
    const clean = str.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      const parts = clean.split('T')[0].split('-');
      return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) - 1, day: parseInt(parts[2], 10), raw: clean };
    }
    if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/.test(clean)) {
      const parts = clean.split(/[\/\-\.]/);
      return { year: parseInt(parts[2], 10), month: parseInt(parts[1], 10) - 1, day: parseInt(parts[0], 10), raw: clean };
    }
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), raw: clean };
    }
    return null;
  };

  if (Array.isArray(txs)) {
    txs.forEach((t) => {
      const p = parseToParts(t.date);
      if (p && !isNaN(p.year) && !isNaN(p.month) && !isNaN(p.day) && p.year > 2000) {
        dates.push(p);
      }
    });
  }

  if (dates.length === 0 && sub?.tanggal) {
    const p = parseToParts(sub.tanggal);
    if (p && p.year > 2000) dates.push(p);
  }

  if (dates.length === 0) {
    if (periodFallback && periodFallback.includes('-')) {
      const parts = periodFallback.split('-');
      const y = parts[0];
      const m = parseInt(parts[1], 10) - 1;
      if (m >= 0 && m < 12) return `${MONTH_NAMES_ID[m]} ${y}`;
    }
    return sub?.tanggal ? formatIndonesianDate(sub.tanggal) : '-';
  }

  dates.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });

  const minD = dates[0];
  const maxD = dates[dates.length - 1];

  if (minD.year === maxD.year && minD.month === maxD.month && minD.day === maxD.day) {
    return `${minD.day} ${MONTH_NAMES_ID[minD.month]} ${minD.year}`;
  }

  if (minD.year === maxD.year && minD.month === maxD.month) {
    return `${minD.day} - ${maxD.day} ${MONTH_NAMES_ID[minD.month]} ${minD.year}`;
  }

  if (minD.year === maxD.year) {
    return `${minD.day} ${MONTH_NAMES_ID[minD.month]} - ${maxD.day} ${MONTH_NAMES_ID[maxD.month]} ${minD.year}`;
  }

  return `${minD.day} ${MONTH_NAMES_ID[minD.month]} ${minD.year} - ${maxD.day} ${MONTH_NAMES_ID[maxD.month]} ${maxD.year}`;
};

export function AccuratePettyCashMapping({
  pettyCashReports = [],
  submissions = [],
  userProfile,
  pettyCashHolders = [],
  onUpdatePettyCashHolders,
  onSaveSubmission,
  onBack
}: AccuratePettyCashMappingProps) {
  // Master Accounts State
  const [accounts, setAccounts] = useState<AccurateAccount[]>(() => {
    try {
      const stored = localStorage.getItem('accurate_coa_master_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 20) {
          return parsed;
        }
      }
      return DEFAULT_ACCURATE_ACCOUNTS;
    } catch (e) {
      return DEFAULT_ACCURATE_ACCOUNTS;
    }
  });

  const cachedInitial = useMemo(() => getInitialCachedMapping(), []);

  // Selected Kas Account (Credit account for Petty Cash - auto-detected or restored from cache)
  const [selectedKasCode, setSelectedKasCode] = useState<string>(() => cachedInitial?.selectedKasCode || '110102');

  // Input Mode state with session persistence ('voucher' is priority if submissions exist)
  const [activeTab, setActiveTabInternal] = useState<'voucher' | 'upload' | 'workspace' | 'text' | 'saved'>(() => {
    try {
      const saved = sessionStorage.getItem('accurate_active_tab');
      if (saved && ['voucher', 'upload', 'workspace', 'text', 'saved'].includes(saved)) {
        return saved as any;
      }
    } catch (e) {}
    return submissions.length > 0 ? 'voucher' : 'upload';
  });

  const setActiveTab = (tab: 'voucher' | 'upload' | 'workspace' | 'text' | 'saved') => {
    setActiveTabInternal(tab);
    try { sessionStorage.setItem('accurate_active_tab', tab); } catch (e) {}
  };

  // Active Document & Custodian state
  const [activeDocumentUrl, setActiveDocumentUrl] = useState<string | null>(() => cachedInitial?.activeDocumentUrl || null);
  const [activeDocumentName, setActiveDocumentName] = useState<string | null>(() => cachedInitial?.activeDocumentName || null);
  const [activeCustodianName, setActiveCustodianName] = useState<string | null>(() => cachedInitial?.activeCustodianName || null);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(() => cachedInitial?.activeSubmission || null);

  // In-App Interactive Document & Voucher Detail Modal state
  const [selectedVoucherForModal, setSelectedVoucherForModal] = useState<Submission | null>(null);
  const [selectedDocIndex, setSelectedDocIndex] = useState<number>(0);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState<boolean>(false);

  // Document Upload State within Modal
  const [isUploadingModalDoc, setIsUploadingModalDoc] = useState<boolean>(false);
  const [uploadModalProgress, setUploadModalProgress] = useState<string>('');
  const [uploadModalError, setUploadModalError] = useState<string>('');
  const [uploadModalSuccess, setUploadModalSuccess] = useState<string>('');
  const [driveAccount, setDriveAccount] = useState<{ email: string; displayName?: string } | null>(() => getActiveGoogleDriveAccount());
  const [isDriveConnecting, setIsDriveConnecting] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  useEffect(() => {
    setDriveAccount(getActiveGoogleDriveAccount());

    const onDriveUpdated = () => {
      setDriveAccount(getActiveGoogleDriveAccount());
    };

    window.addEventListener('nusantara-drive-updated', onDriveUpdated);
    return () => {
      window.removeEventListener('nusantara-drive-updated', onDriveUpdated);
    };
  }, []);

  const handleConnectGoogleDrive = async () => {
    setIsDriveConnecting(true);
    setUploadModalError('');
    try {
      const res = await googleDriveLogin();
      if (res?.user || res?.accessToken) {
        setDriveAccount(getActiveGoogleDriveAccount());
        setSuccessMessage(`Google Drive (${res.user?.email || 'Akun'}) berhasil terhubung!`);
        setTimeout(() => setSuccessMessage(''), 3500);
      }
    } catch (err: any) {
      setErrorMessage(`Gagal menghubungkan Google Drive: ${err?.message || err}`);
    } finally {
      setIsDriveConnecting(false);
    }
  };

  // Google Drive Folder & File Upload Helpers
  const getOrCreateFolder = async (_token: string, folderName: string, parentId?: string): Promise<string> => {
    const queryParts = [
      `name = '${folderName.replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      'trashed = false',
    ];
    if (parentId) {
      queryParts.push(`'${parentId}' in parents`);
    }
    const q = queryParts.join(' and ');

    return executeDriveApiWithAutoRefresh(async (token) => {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (searchRes.status === 401) throw new Error('UNAUTHORIZED_401');
      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.files && data.files.length > 0) {
          return data.files[0].id;
        }
      }

      const metadata: any = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parentId) {
        metadata.parents = [parentId];
      }
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      });

      if (createRes.status === 401) throw new Error('UNAUTHORIZED_401');

      if (!createRes.ok) {
        const errorText = await createRes.text();
        throw new Error(`Gagal membuat folder '${folderName}': ${errorText}`);
      }
      const folderData = await createRes.json();
      return folderData.id;
    }, { actionName: `getOrCreateFolder(${folderName})` });
  };

  const getOrCreatePettyCashFolderHierarchy = async (
    token: string,
    targetSubmission: Submission,
    year: string,
    month: string,
    day: string
  ): Promise<string> => {
    // If submission already has a dedicated Google Drive folder (created during voucher input), use it directly!
    if (targetSubmission.googleDriveFolderId) {
      return targetSubmission.googleDriveFolderId;
    }

    const rootId = 'root';
    const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
    const companyFolderId = await getOrCreateFolder(token, 'NMSA', voucherAppId);
    const yearId = await getOrCreateFolder(token, year, companyFolderId);
    const monthId = await getOrCreateFolder(token, month, yearId);
    const dayId = await getOrCreateFolder(token, day, monthId);

    // Compute transaction folder name matching SubmissionForm standard
    const cleanJenis = (targetSubmission.jenisPengajuan || 'Petty Cash').trim().replace(/[\/\\?%*:|"<>.]/g, '');
    const cleanPenerima = (targetSubmission.pettyCashCustodian || targetSubmission.dibayarkanKepada || 'Suryo Pranoto').trim().replace(/[\/\\?%*:|"<>.]/g, '');
    const cleanKode = (targetSubmission.kode || '').trim().replace(/[\/\\?%*:|"<>.]/g, '-');
    const txBaseName = `Pembayaran-${cleanJenis}+${cleanPenerima}`;
    const txFolderName = cleanKode ? `${cleanKode} - ${txBaseName}` : txBaseName;

    const txFolderId = await getOrCreateFolder(token, txFolderName, dayId);
    return txFolderId;
  };

  const uploadFileToGoogleDrive = async (
    _token: string,
    fileName: string,
    fileMimeType: string,
    fileBlob: Blob,
    folderId: string
  ): Promise<{ url: string; name: string; fileId: string }> => {
    return executeDriveApiWithAutoRefresh(async (token) => {
      const metadata = {
        name: fileName,
        mimeType: fileMimeType,
        parents: [folderId],
      };

      const formData = new FormData();
      formData.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      formData.append('file', fileBlob);

      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (res.status === 401) throw new Error('UNAUTHORIZED_401');

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gagal mengunggah file '${fileName}' ke Drive: ${errorText}`);
      }

      const fileData = await res.json();

      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone',
          }),
        });
      } catch (perErr) {
        console.warn('Could not set permissions for uploaded file:', fileName, perErr);
      }

      return {
        url: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view?usp=drivesdk`,
        name: fileData.name || fileName,
        fileId: fileData.id
      };
    }, { actionName: `upload ${fileName}` });
  };

  // Upload handler for missing petty cash documents directly from modal
  const handleUploadDocumentToVoucher = async (targetSubmission: Submission, file: File) => {
    if (!targetSubmission || !file) return;

    setIsUploadingModalDoc(true);
    setUploadModalProgress(`Mempersiapkan berkas: ${file.name}...`);
    setUploadModalError('');
    setUploadModalSuccess('');

    try {
      let finalUrl = '';
      let finalName = file.name;
      let targetFolderId = targetSubmission.googleDriveFolderId || '';

      setUploadModalProgress('Memeriksa koneksi Google Drive...');
      let token = await ensureValidDriveToken();

      if (!token) {
        setUploadModalProgress('Menghubungkan akun Google Drive...');
        try {
          const authRes = await googleDriveLogin();
          if (authRes?.accessToken) {
            token = authRes.accessToken;
          }
        } catch (loginErr) {
          console.warn('Google Drive interactive connect failed or cancelled:', loginErr);
        }
      }

      if (token) {
        setUploadModalProgress('Mencari direktori transaksi di Google Drive...');
        const parts = (targetSubmission.tanggal || new Date().toISOString().split('T')[0]).split('-');
        let yearStr = parts[0] || String(new Date().getFullYear());
        let monthStr = '1. Januari';
        let dayStr = '1';

        if (parts.length === 3) {
          const monthIdx = parseInt(parts[1], 10) - 1;
          const INDONESIAN_MONTHS = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
          ];
          const mNum = monthIdx + 1;
          const mName = INDONESIAN_MONTHS[monthIdx] || 'Januari';
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(parseInt(parts[2], 10));
        }

        targetFolderId = await getOrCreatePettyCashFolderHierarchy(
          token,
          targetSubmission,
          yearStr,
          monthStr,
          dayStr
        );

        const cleanKode = (targetSubmission.kode || 'PC').replace(/[\/\\?%*:|"<>.]/g, '_');
        const cleanFileName = file.name.replace(/[\/\\?%*:|"<>]/g, '_');
        const uploadName = `PettyCash_${cleanKode}_${cleanFileName}`;

        setUploadModalProgress(`Mengunggah "${file.name}" ke Google Drive...`);
        try {
          const uploadResult = await uploadFileToGoogleDrive(
            token,
            uploadName,
            file.type || 'application/pdf',
            file,
            targetFolderId
          );

          finalUrl = uploadResult.url;
          finalName = uploadResult.name;
        } catch (driveErr: any) {
          console.warn('Google Drive direct upload encountered issue, saving document directly to database:', driveErr);
          setUploadModalProgress('Menyimpan lampiran dokumen ke sistem...');
          finalUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Gagal membaca file lokal.'));
            reader.readAsDataURL(file);
          });
        }
      } else {
        // If file is > 400KB and Google Drive is not connected
        if (file.size > 2 * 1024 * 1024) {
          throw new Error(`Ukuran berkas (${(file.size / 1024 / 1024).toFixed(2)} MB) melebihi batas database (maks 2 MB). Silakan klik hubungkan akun Google Drive agar berkas terunggah ke Cloud Drive secara otomatis.`);
        }

        // Local base64 fallback
        setUploadModalProgress('Menyimpan berkas ke sistem...');
        finalUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Gagal membaca file lokal.'));
          reader.readAsDataURL(file);
        });
      }

      // Construct updated submission object
      const newDriveDoc = {
        url: finalUrl,
        name: finalName,
        docType: 'petty_cash_report'
      };

      const existingFiles = targetSubmission.googleDriveFiles || [];
      const updatedDriveFiles = [...existingFiles.filter(f => f.url !== finalUrl), newDriveDoc];

      const updatedSubmission: Submission = {
        ...targetSubmission,
        googleDriveFolderId: targetFolderId || targetSubmission.googleDriveFolderId,
        pettyCashFile: {
          url: finalUrl,
          name: finalName
        },
        googleDriveFiles: updatedDriveFiles,
        googleDriveFileUrl: targetSubmission.googleDriveFileUrl || finalUrl,
        googleDriveFileName: targetSubmission.googleDriveFileName || finalName
      };

      // Save submission to state & cloud
      if (onSaveSubmission) {
        await onSaveSubmission(updatedSubmission);
      } else {
        try {
          if (isFirebaseConfigured()) {
            await saveSubmissionToFirestore(updatedSubmission, userProfile?.companyId, userProfile?.companyName);
          }
          const localRaw = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
          if (localRaw) {
            const list: Submission[] = JSON.parse(localRaw);
            const updatedList = list.map(s => s.id === updatedSubmission.id ? updatedSubmission : s);
            localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(updatedList));
          }
        } catch (e) {
          console.warn('Direct fallback save notice:', e);
        }
      }

      // Update local modal state
      setSelectedVoucherForModal(updatedSubmission);
      if (activeSubmission?.id === updatedSubmission.id) {
        setActiveSubmission(updatedSubmission);
        setActiveDocumentUrl(finalUrl);
        setActiveDocumentName(finalName);
      }

      // Calculate new doc index to auto-focus newly uploaded document
      const updatedDocs = getSubmissionDocuments(updatedSubmission);
      const newIdx = updatedDocs.findIndex(d => d.url === finalUrl);
      if (newIdx >= 0) {
        setSelectedDocIndex(newIdx);
      } else {
        setSelectedDocIndex(0);
      }

      setUploadModalSuccess(`Berkas "${file.name}" berhasil diunggah & ditautkan ke Voucher ${targetSubmission.kode}!`);
    } catch (err: any) {
      console.error('Upload document to voucher failed:', err);
      setUploadModalError(err.message || 'Gagal mengunggah dokumen.');
    } finally {
      setIsUploadingModalDoc(false);
      setUploadModalProgress('');
    }
  };

  // Helper to retrieve all uploaded attachments for Petty Cash mapping
  // Strictly excludes F1 (Bukti Pengeluaran Kas/Bank) and F2 (Formulir Pengajuan Dana HO)
  const getSubmissionDocuments = (sub: Submission | null) => {
    if (!sub) return [];
    const docs: { id: string; label: string; fileName: string; url: string; type: string }[] = [];

    const isExcludedFile = (name: string = '', fileObj?: any) => {
      if (fileObj?.isF1 || fileObj?.isF2) return true;
      const lower = (name || '').toLowerCase().trim();
      // Strictly exclude F1 and F2 generated forms
      if (/^f[12][_\s-]/i.test(name) || /[\s_]f[12]\.pdf$/i.test(name) || name.toUpperCase().startsWith('F1_') || name.toUpperCase().startsWith('F2_') || name.toUpperCase().startsWith('F1 -') || name.toUpperCase().startsWith('F2 -') || name === 'F1.pdf' || name === 'F2.pdf') return true;
      if (lower.includes('bukti_pengeluaran_kas') || lower.includes('bukti pengeluaran kas') || lower.includes('bukti_pengeluaran_bank') || lower.includes('bukti pengeluaran bank')) return true;
      if (lower.includes('formulir_pengajuan') || lower.includes('formulir pengajuan') || lower.includes('form pengajuan ho') || lower.includes('formulir pengajuan ho')) return true;
      return false;
    };

    // 1. Check direct sub.pettyCashFile (Uploaded as LPJ / Petty Cash Report)
    if (sub.pettyCashFile?.url && !isExcludedFile(sub.pettyCashFile.name || '', sub.pettyCashFile)) {
      const fileName = sub.pettyCashFile.name || 'Laporan_Pertanggungjawaban_Petty_Cash.pdf';
      docs.push({
        id: 'doc-petty-cash-file',
        label: `📑 LPJ Lapangan: ${fileName}`,
        fileName,
        url: sub.pettyCashFile.url,
        type: 'lpj'
      });
    }

    // 2. Check all uploaded files in sub.googleDriveFiles (excluding F1/F2)
    if (sub.googleDriveFiles && Array.isArray(sub.googleDriveFiles)) {
      sub.googleDriveFiles.forEach((file, idx) => {
        if (!file.url) return;
        if (isExcludedFile(file.name || '', file)) return;
        if (docs.some(d => d.url === file.url)) return;

        const fName = file.name || `Dokumen_${idx + 1}.pdf`;
        const lowerName = fName.toLowerCase();

        let label = `📄 Lampiran: ${fName}`;
        if (lowerName.includes('lpj') || lowerName.includes('petty') || lowerName.includes('pertanggungjawaban') || lowerName.includes('kas_kecil')) {
          label = `📑 Laporan LPJ: ${fName}`;
        } else if (lowerName.includes('nota') || lowerName.includes('kwitansi') || lowerName.includes('struk') || lowerName.includes('bon')) {
          label = `🧾 Nota/Kwitansi: ${fName}`;
        } else if (lowerName.includes('rekap') || lowerName.includes('rincian') || lowerName.includes('excel') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv')) {
          label = `📊 Rekap Transaksi: ${fName}`;
        } else if (lowerName.includes('bukti') || lowerName.includes('transfer') || lowerName.includes('bayar')) {
          label = `💳 Bukti Unggahan: ${fName}`;
        }

        docs.push({
          id: `drive-doc-${idx}`,
          label,
          fileName: fName,
          url: file.url,
          type: 'attachment'
        });
      });
    }

    // 3. Check sub.googleDriveFileUrl (if not F1/F2 and not already included)
    if (sub.googleDriveFileUrl && !docs.some(d => d.url === sub.googleDriveFileUrl)) {
      if (!isExcludedFile(sub.googleDriveFileName || '')) {
        const fName = sub.googleDriveFileName || 'Lampiran_Petty_Cash.pdf';
        docs.push({
          id: 'drive-main-doc',
          label: `📄 Lampiran Drive: ${fName}`,
          fileName: fName,
          url: sub.googleDriveFileUrl,
          type: 'drive_main'
        });
      }
    }

    // 4. Check sub.buktiPembayaran (if uploaded separately and not F1/F2)
    if (sub.buktiPembayaran?.url && !isExcludedFile(sub.buktiPembayaran.name || '') && !docs.some(d => d.url === sub.buktiPembayaran?.url)) {
      const fName = sub.buktiPembayaran.name || 'Bukti_Pembayaran.jpg';
      docs.push({
        id: 'doc-bukti-pembayaran',
        label: `💳 Bukti Unggahan: ${fName}`,
        fileName: fName,
        url: sub.buktiPembayaran.url,
        type: 'bukti'
      });
    }

    return docs;
  };

  // Convert Google Drive view URL to embeddable preview iframe URL
  const getEmbeddableUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('drive.google.com')) {
      if (url.includes('/view')) {
        return url.replace(/\/view(\?.*)?$/, '/preview');
      }
      if (url.includes('id=')) {
        const match = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          return `https://drive.google.com/file/d/${match[1]}/preview`;
        }
      }
    }
    return url;
  };

  const handleOpenVoucherModal = (sub: Submission) => {
    setSelectedVoucherForModal(sub);
    setSelectedDocIndex(0);
    setIsVoucherModalOpen(true);
  };

  const handleMapFromModal = (sub: Submission) => {
    const docs = getSubmissionDocuments(sub);
    const currentDoc = docs[selectedDocIndex] || docs[0];
    const targetUrl = currentDoc?.url || undefined;
    const targetName = currentDoc?.fileName || undefined;

    setIsVoucherModalOpen(false);
    handleLoadVoucherSubmission(sub, targetUrl, targetName);

    setTimeout(() => {
      const tableEl = document.getElementById('accurate-mapped-table-section');
      if (tableEl) {
        tableEl.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Helper to check if a submission matches the selected custodian filter
  const isSubmissionMatchingCustodian = (sub: Submission, filter: string): boolean => {
    if (!filter || filter === 'All') return true;
    const cleanFilter = normalizePersonName(filter).toLowerCase();
    const filterTokens = cleanFilter.split(/\s+/).filter(t => t.length > 2);

    const subFields = [
      sub.pettyCashCustodian || '',
      sub.dibayarkanKepada || '',
      sub.diajukanOleh || '',
      getPettyCashCustodian(sub),
      sub.notes || '',
      sub.kode || '',
      sub.jenisPengajuan || ''
    ];

    return subFields.some(field => {
      if (!field) return false;
      const cleanField = normalizePersonName(field).toLowerCase();
      
      // Exact or bidirectional substring match
      if (cleanField.includes(cleanFilter) || cleanFilter.includes(cleanField)) {
        return true;
      }
      
      // Token-level match (e.g. "Usmar", "Suryo", "Hasnawi", "Dhiya", "Ilham")
      if (filterTokens.some(token => cleanField.includes(token))) {
        return true;
      }
      return false;
    });
  };

  // Strictly filter submissions to only Petty Cash types (unified across all views)
  const pettyCashSubmissions = useMemo(() => {
    const list = submissions.filter(sub => isPettyCashSubmission(sub));
    return sortSubmissionsDescending(list);
  }, [submissions]);

  // Custodian & Search Filter States for Vouchers
  const [custodianFilter, setCustodianFilter] = useState<string>('All');
  const [voucherSearchQuery, setVoucherSearchQuery] = useState<string>('');

  // Collect unique available custodians with clean title-casing & deduplication
  const availableCustodians = useMemo(() => {
    const rawList: string[] = [];
    pettyCashHolders.forEach(h => { if (h && h.trim()) rawList.push(h.trim()); });
    pettyCashSubmissions.forEach(sub => {
      const c = getPettyCashCustodian(sub) || sub.pettyCashCustodian || sub.dibayarkanKepada;
      if (c && c.trim()) rawList.push(c.trim());
    });

    const uniqueMap = new Map<string, string>();
    rawList.forEach(name => {
      const norm = normalizePersonName(name).toLowerCase();
      if (norm && !uniqueMap.has(norm)) {
        const displayName = name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        uniqueMap.set(norm, displayName);
      }
    });

    return Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b));
  }, [pettyCashHolders, pettyCashSubmissions]);

  // Handle Custodian filter change with auto Kas code synchronization
  const handleCustodianFilterChange = (newVal: string) => {
    setCustodianFilter(newVal);
    if (newVal !== 'All') {
      const norm = normalizePersonName(newVal).toLowerCase();
      if (norm.includes('usmar')) setSelectedKasCode('11010201');
      else if (norm.includes('suryo')) setSelectedKasCode('11010202');
      else if (norm.includes('hasnawi')) setSelectedKasCode('11010203');
      else if (norm.includes('pbm') || norm.includes('ilham')) setSelectedKasCode('11010204');
      else if (norm.includes('deasy')) setSelectedKasCode('110103');
      else if (norm.includes('dhiya')) setSelectedKasCode('110101');
      else setSelectedKasCode('110102');
    }
  };

  // Filtered petty cash submissions for tab 0
  const filteredPettyCashSubmissions = useMemo(() => {
    const list = pettyCashSubmissions.filter(sub => {
      if (custodianFilter !== 'All') {
        if (!isSubmissionMatchingCustodian(sub, custodianFilter)) {
          return false;
        }
      }
      if (voucherSearchQuery.trim()) {
        const q = voucherSearchQuery.toLowerCase();
        const text = [
          sub.kode || '',
          getPettyCashCustodian(sub),
          sub.pettyCashCustodian || '',
          sub.dibayarkanKepada || '',
          sub.jenisPengajuan || '',
          sub.notes || '',
          sub.diajukanOleh || ''
        ].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
    return sortSubmissionsDescending(list);
  }, [pettyCashSubmissions, custodianFilter, voucherSearchQuery]);

  // Active Mapping Data (restored from browser cache if exists)
  const [reportTitle, setReportTitle] = useState<string>(() => cachedInitial?.reportTitle || 'Laporan Petty Cash');
  const [period, setPeriod] = useState<string>(() => cachedInitial?.period || new Date().toISOString().substring(0, 7));
  const [transactions, setTransactions] = useState<AccurateMappedTransaction[]>(() => cachedInitial?.transactions || []);
  const [savedSearchQuery, setSavedSearchQuery] = useState<string>('');
  
  // Last saved timestamp & Auto-save status
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem('accurate_petty_cash_active_mapping_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.updatedAt) {
          return new Date(parsed.updatedAt).toLocaleTimeString('id-ID');
        }
      }
    } catch {}
    return null;
  });
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);

  // Saved Mappings list from Firestore & localStorage
  const [savedMappings, setSavedMappings] = useState<AccurateMappingReport[]>(() => {
    try {
      const stored = localStorage.getItem('accurate_mapped_reports_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    loadAccurateMappingsFromFirestore().then((res) => {
      if (res && res.length > 0) {
        setSavedMappings(res);
      }
    }).catch(() => {});
  }, []);

  // Multi-tier Persistence Engine: Local Cache + Firebase Firestore + Google Drive + Linked Submission
  const persistMappingData = async (
    customPayload?: Partial<AccurateMappingReport>,
    explicitSub?: Submission | null,
    showToast: boolean = false
  ) => {
    const currentTransactions = customPayload?.transactions || transactions;
    if (!currentTransactions || currentTransactions.length === 0) return;

    const currentTitle = customPayload?.title || reportTitle;
    const currentPeriod = customPayload?.period || period;
    const currentKas = customPayload?.selectedKasCode || selectedKasCode;
    const currentDocUrl = customPayload?.documentUrl !== undefined ? customPayload.documentUrl : activeDocumentUrl;
    const currentDocName = customPayload?.documentName !== undefined ? customPayload.documentName : activeDocumentName;
    const currentCustodian = customPayload?.custodian !== undefined ? customPayload.custodian : activeCustodianName;
    const targetSub = explicitSub !== undefined ? explicitSub : activeSubmission;
    const currentTotal = currentTransactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

    const reportId = customPayload?.id || (targetSub ? `vh-map-${targetSub.id}` : `acc-map-${Date.now()}`);
    const nowIso = new Date().toISOString();

    const mappingPayload: AccurateMappingReport = {
      id: reportId,
      title: currentTitle,
      period: currentPeriod,
      selectedKasCode: currentKas,
      kasAccountCode: currentKas,
      kasAccountName: accounts.find(a => a.code === currentKas)?.name || 'Petty Cash Lapangan',
      totalExpense: currentTotal,
      transactions: currentTransactions,
      custodian: currentCustodian,
      documentUrl: currentDocUrl,
      documentName: currentDocName,
      submissionId: targetSub?.id || null,
      submissionCode: targetSub?.kode || null,
      sourceType: customPayload?.sourceType || (targetSub ? 'voucher_submission' : 'excel'),
      accountsCount: accounts.length,
      savedAt: nowIso,
      updatedAt: nowIso,
      driveBackupUrl: customPayload?.driveBackupUrl || null,
      driveBackupFileId: customPayload?.driveBackupFileId || null
    };

    // 1. Save to LocalStorage active cache
    try {
      const activeCache: CachedPettyCashMapping = {
        reportTitle: currentTitle,
        period: currentPeriod,
        transactions: currentTransactions,
        selectedKasCode: currentKas,
        activeDocumentUrl: currentDocUrl,
        activeDocumentName: currentDocName,
        activeCustodianName: currentCustodian,
        activeSubmission: targetSub,
        updatedAt: nowIso
      };
      localStorage.setItem('accurate_petty_cash_active_mapping_v2', JSON.stringify(activeCache));
    } catch (e) {}

    // 2. Save to Firestore and sync local list
    try {
      setIsAutoSaving(true);
      await saveAccurateMappingToFirestore(mappingPayload);
      setSavedMappings(prev => {
        const filtered = prev.filter(m => m.id !== reportId);
        return [mappingPayload, ...filtered];
      });
      setLastSavedTime(new Date().toLocaleTimeString('id-ID'));
    } catch (e) {
      console.warn('Gagal menyimpan pemetaan ke Firestore:', e);
    } finally {
      setIsAutoSaving(false);
    }

    // 3. Link back to Submission object if applicable
    if (targetSub) {
      const updatedSub: Submission = {
        ...targetSub,
        isAccurateMapped: true,
        accurateMappedAt: nowIso,
        accurateMappingReportId: reportId,
        accurateMappedTransactions: currentTransactions,
        accurateTotalExpense: currentTotal,
        accurateKasAccountCode: currentKas,
        accurateReportTitle: currentTitle
      };

      if (onSaveSubmission) {
        try { await onSaveSubmission(updatedSub); } catch (e) {}
      } else {
        try {
          if (isFirebaseConfigured()) {
            await saveSubmissionToFirestore(updatedSub, userProfile?.companyId, userProfile?.companyName);
          }
          const localRaw = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
          if (localRaw) {
            const list: Submission[] = JSON.parse(localRaw);
            const updatedList = list.map(s => s.id === updatedSub.id ? updatedSub : s);
            localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(updatedList));
          }
        } catch (e) {}
      }
    }

    if (showToast) {
      setSuccessMessage(`Hasil pemetaan akun tersimpan secara permanen di Cloud Database & Cache Aplikasi (${currentTransactions.length} transaksi - Rp ${currentTotal.toLocaleString('id-ID')})!`);
      setTimeout(() => setSuccessMessage(''), 3500);
    }
  };

  // Debounced auto-save effect when transactions change in active workspace
  useEffect(() => {
    if (transactions.length === 0) return;
    
    // Save to local active cache immediately
    try {
      const activeCache: CachedPettyCashMapping = {
        reportTitle,
        period,
        transactions,
        selectedKasCode,
        activeDocumentUrl,
        activeDocumentName,
        activeCustodianName,
        activeSubmission,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('accurate_petty_cash_active_mapping_v2', JSON.stringify(activeCache));
    } catch (e) {}

    // Debounced cloud save
    const timer = setTimeout(() => {
      persistMappingData(undefined, undefined, false);
    }, 1800);

    return () => clearTimeout(timer);
  }, [transactions, reportTitle, period, selectedKasCode]);

  // Handler to clear active mapping cache and start clean
  const handleClearMapping = () => {
    if (window.confirm('Bersihkan data pemetaan saat ini dan mulai pemetaan baru? (Data riwayat yang tersimpan di Cloud/Database tetap aman)')) {
      setTransactions([]);
      setReportTitle('Laporan Petty Cash');
      setActiveDocumentUrl(null);
      setActiveDocumentName(null);
      setActiveCustodianName(null);
      setActiveSubmission(null);
      localStorage.removeItem('accurate_petty_cash_active_mapping_v2');
      setSuccessMessage('Workspace pemetaan aktif berhasil dibersihkan. Anda dapat memilih voucher baru atau membuka riwayat pemetaan tersimpan.');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  // Handler to load a saved mapping report from history
  const handleLoadSavedMapping = (mapping: AccurateMappingReport) => {
    if (!mapping || !mapping.transactions) return;

    setReportTitle(mapping.title || 'Laporan Petty Cash');
    setPeriod(mapping.period || new Date().toISOString().substring(0, 7));
    if (mapping.selectedKasCode || mapping.kasAccountCode) {
      setSelectedKasCode(mapping.selectedKasCode || mapping.kasAccountCode || '110102');
    }
    setTransactions(mapping.transactions);
    setActiveDocumentUrl(mapping.documentUrl || null);
    setActiveDocumentName(mapping.documentName || null);
    setActiveCustodianName(mapping.custodian || null);

    if (mapping.submissionId) {
      const foundSub = pettyCashSubmissions.find(s => s.id === mapping.submissionId);
      setActiveSubmission(foundSub || null);
    } else {
      setActiveSubmission(null);
    }

    setSuccessMessage(`Berhasil memuat pemetaan tersimpan "${mapping.title}" (${mapping.transactions.length} baris transaksi - Rp ${(mapping.totalExpense || 0).toLocaleString('id-ID')})!`);
    setTimeout(() => setSuccessMessage(''), 3500);

    // Scroll to verification table
    setTimeout(() => {
      const tableEl = document.getElementById('accurate-mapped-table-section');
      if (tableEl) {
        tableEl.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Handler to delete a saved mapping report from Firestore & localStorage
  const handleDeleteSavedMapping = async (id: string, title?: string) => {
    if (!window.confirm(`Hapus riwayat pemetaan "${title || id}" secara permanen dari Cloud Database & Cache?`)) {
      return;
    }

    try {
      await deleteAccurateMappingFromFirestore(id);
      setSavedMappings(prev => prev.filter(m => m.id !== id));
      setSuccessMessage(`Riwayat pemetaan "${title || id}" berhasil dihapus.`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (e: any) {
      setErrorMessage(`Gagal menghapus riwayat pemetaan: ${e.message || String(e)}`);
    }
  };

  // Backup mapping to Google Drive
  const handleBackupToGoogleDrive = async (targetMapping?: any) => {
    const mapToSave = targetMapping || {
      id: activeSubmission ? `vh-map-${activeSubmission.id}` : `acc-map-${Date.now()}`,
      title: reportTitle,
      period,
      selectedKasCode,
      totalExpense,
      transactions,
      custodian: activeCustodianName,
      documentUrl: activeDocumentUrl,
      documentName: activeDocumentName,
      savedAt: new Date().toISOString()
    };

    if (!mapToSave.transactions || mapToSave.transactions.length === 0) {
      setErrorMessage('Tidak ada data transaksi yang dapat dicadangkan ke Google Drive.');
      return;
    }

    setIsProcessing(true);
    setProcessMessage('Menyiapkan & Mengunggah Cadangan Pemetaan ke Google Drive...');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // 1. Check or authenticate Google Drive
      let token = await ensureValidDriveToken();
      if (!token) {
        const authed = await googleDriveLogin();
        if (!authed) {
          throw new Error('Google Drive belum terhubung. Silakan login ke Google Drive pada menu pengaturan.');
        }
        token = await ensureValidDriveToken();
      }

      if (!token) {
        throw new Error('Token Google Drive tidak tersedia.');
      }

      // 2. Prepare JSON backup blob
      const jsonContent = JSON.stringify(mapToSave, null, 2);
      const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
      const safeTitle = (mapToSave.title || 'Pemetaan_Accurate_PettyCash').replace(/[^a-zA-Z0-9_-]/g, '_');
      const backupFileName = `Backup_Accurate_${safeTitle}_${new Date().toISOString().substring(0, 10)}.json`;

      // 3. Upload directly to Google Drive
      const metadata = {
        name: backupFileName,
        mimeType: 'application/json',
        description: `Cadangan Pemetaan Akun Accurate Petty Cash: ${mapToSave.title} (${mapToSave.transactions.length} baris, Total Rp ${mapToSave.totalExpense?.toLocaleString('id-ID')})`
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', jsonBlob);

      const driveRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      });

      if (!driveRes.ok) {
        const errText = await driveRes.text();
        throw new Error(`Google Drive API error: ${errText}`);
      }

      const driveData = await driveRes.json();
      const driveUrl = driveData.webViewLink || `https://drive.google.com/file/d/${driveData.id}/view`;

      // Update mapping record with drive backup info
      const updatedMapping: AccurateMappingReport = {
        ...mapToSave,
        driveBackupUrl: driveUrl,
        driveBackupFileId: driveData.id,
        updatedAt: new Date().toISOString()
      };

      await saveAccurateMappingToFirestore(updatedMapping);
      setSavedMappings(prev => [updatedMapping, ...prev.filter(m => m.id !== updatedMapping.id)]);

      setSuccessMessage(`Berhasil mencadangkan pemetaan ke Google Drive! Berkas: "${backupFileName}". Anda dapat mengaksesnya kapan saja.`);
    } catch (err: any) {
      console.error('Error backing up to Google Drive:', err);
      setErrorMessage(err.message || 'Gagal mencadangkan ke Google Drive.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to compute voucher card stats (submisi vs realisasi pengeluaran LPJ & date period)
  const getVoucherStats = (sub: Submission) => {
    const itemsCount = sub.items?.length || 0;
    const totalAmt = sub.items?.reduce((acc, it) => acc + (Number(it.total) || 0), 0) || 0;
    const custodian = sub.pettyCashCustodian || sub.dibayarkanKepada || getPettyCashCustodian(sub) || 'Petty Cash';
    const lpjDocs = getSubmissionDocuments(sub);

    // 1. Check if currently active mapped submission
    const isActive = activeSubmission?.id === sub.id;
    const activeExpense = isActive && transactions.length > 0
      ? transactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0)
      : null;

    // 2. Check saved mappings from Firestore/localStorage or directly on sub
    const saved = savedMappings.find((m) => {
      if (m.id === `vh-map-${sub.id}` || m.id === sub.id) return true;
      if (m.submissionId === sub.id) return true;
      if (sub.kode && m.submissionCode === sub.kode) return true;
      if (sub.kode && m.title && m.title.includes(sub.kode)) return true;
      return false;
    }) || (sub.isAccurateMapped && Array.isArray(sub.accurateMappedTransactions) && sub.accurateMappedTransactions.length > 0 ? {
      id: sub.accurateMappingReportId || `vh-map-${sub.id}`,
      title: sub.accurateReportTitle || `Laporan Petty Cash: ${sub.kode} - ${custodian}`,
      period: sub.tanggal ? sub.tanggal.substring(0, 7) : '',
      selectedKasCode: sub.accurateKasAccountCode || '110102',
      totalExpense: typeof sub.accurateTotalExpense === 'number' ? sub.accurateTotalExpense : sub.accurateMappedTransactions.reduce((acc, t) => acc + (Number(t.amount) || 0), 0),
      transactions: sub.accurateMappedTransactions,
      custodian,
      savedAt: sub.accurateMappedAt || ''
    } : null);

    const savedExpense = saved 
      ? (Number(saved.totalExpense) || (saved.transactions?.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0) || 0)) 
      : null;

    // 3. Check workspace petty cash reports
    const report = pettyCashReports.find((r) => {
      if (r.submissionId === sub.id) return true;
      if (sub.kode && r.submissionCode === sub.kode) return true;
      if (r.summary?.workerName && isSubmissionMatchingCustodian(sub, r.summary.workerName)) return true;
      return false;
    });

    const reportExpense = report 
      ? (Number(report.summary?.totalExpense) || (report.transactions?.reduce((acc, t) => acc + (Number(t.amount) || 0), 0) || 0)) 
      : null;

    const totalExpense = activeExpense !== null 
      ? activeExpense 
      : (savedExpense !== null 
          ? savedExpense 
          : (reportExpense !== null ? reportExpense : 0));

    const isMapped = (activeExpense !== null && activeExpense > 0) || (savedExpense !== null && savedExpense > 0) || (reportExpense !== null && reportExpense > 0);

    // Calculate dates & period string
    let periodText = '';
    if (isActive && transactions.length > 0) {
      periodText = calculatePettyCashPeriod(transactions, sub, period);
    } else if (saved && saved.transactions && saved.transactions.length > 0) {
      periodText = calculatePettyCashPeriod(saved.transactions, sub, saved.period);
    } else if (report && report.transactions && report.transactions.length > 0) {
      periodText = calculatePettyCashPeriod(report.transactions, sub, report.summary?.reportMonth);
    } else {
      periodText = formatIndonesianDate(sub.tanggal);
    }

    return {
      itemsCount,
      totalAmt,
      custodian,
      lpjDocs,
      totalExpense,
      isMapped,
      savedMapping: saved || null,
      savedCount: saved?.transactions?.length || 0,
      periodText,
      diff: totalExpense > 0 ? totalExpense - totalAmt : 0
    };
  };

  // Loading & Error States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processMessage, setProcessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Paste Text state
  const [pastedText, setPastedText] = useState<string>('');

  // COA Manager Modal State
  const [isCoaModalOpen, setIsCoaModalOpen] = useState<boolean>(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Beban Operasional');
  const [newKeywords, setNewKeywords] = useState<string>('');
  const [searchTermCoa, setSearchTermCoa] = useState<string>('');

  // Group Detail Modal State
  const [selectedGroupCode, setSelectedGroupCode] = useState<string | null>(null);
  const [groupSearchTerm, setGroupSearchTerm] = useState<string>('');
  const [bulkMoveTargetCode, setBulkMoveTargetCode] = useState<string>('');

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync Master Accounts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('accurate_coa_master_v1', JSON.stringify(accounts));
    } catch (e) {
      console.error(e);
    }
  }, [accounts]);

  // Helper: Get Kas Account Object
  const kasAccount = accounts.find(a => a.code === selectedKasCode) || {
    code: '110102',
    name: 'Petty Cash Lapangan',
    category: 'Kas & Bank'
  };

  // Total Calculations
  const totalExpense = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // Grouped by Accurate Account
  const groupedSummary = React.useMemo(() => {
    const map = new Map<string, { accountCode: string; accountName: string; totalAmount: number; items: AccurateMappedTransaction[] }>();

    transactions.forEach((t) => {
      const code = t.accurateAccountCode || '5-1900';
      const name = t.accurateAccountName || 'Biaya Operasional Lain-lain';
      if (!map.has(code)) {
        map.set(code, {
          accountCode: code,
          accountName: name,
          totalAmount: 0,
          items: []
        });
      }
      const entry = map.get(code)!;
      entry.totalAmount += (Number(t.amount) || 0);
      entry.items.push(t);
    });

    return Array.from(map.values()).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }, [transactions]);

  // Currently Selected Group Details
  const activeGroup = React.useMemo(() => {
    if (!selectedGroupCode) return null;
    return groupedSummary.find(g => g.accountCode === selectedGroupCode) || null;
  }, [groupedSummary, selectedGroupCode]);

  // Bulk Move All Transactions in a Group
  const handleBulkMoveGroup = (sourceCode: string, targetCode: string) => {
    if (!targetCode || sourceCode === targetCode) return;
    const targetAcc = accounts.find(a => a.code === targetCode);
    if (!targetAcc) return;

    setTransactions(prev => prev.map(t => {
      if ((t.accurateAccountCode || '5-1900') === sourceCode) {
        return {
          ...t,
          accurateAccountCode: targetAcc.code,
          accurateAccountName: targetAcc.name,
          confidence: 'manual'
        };
      }
      return t;
    }));

    setSuccessMessage(`Seluruh transaksi dari [${sourceCode}] berhasil dipindahkan ke [${targetAcc.code}] ${targetAcc.name}!`);
    setTimeout(() => setSuccessMessage(''), 3500);
  };

  // Handle Account Change for a specific Transaction Row
  const handleAccountChange = (id: string, newCode: string) => {
    const targetAccount = accounts.find(a => a.code === newCode);
    setTransactions(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          accurateAccountCode: newCode,
          accurateAccountName: targetAccount ? targetAccount.name : 'Unassigned Account',
          confidence: 'manual'
        };
      }
      return t;
    }));
  };

  // Update Transaction Field
  const handleUpdateTransaction = (id: string, field: keyof AccurateMappedTransaction, value: any) => {
    setTransactions(prev => prev.map(t => {
      if (t.id === id) {
        const updated = { ...t, [field]: value };
        if (field === 'description' && t.confidence !== 'manual') {
          // Re-map automatically if description changes
          const mapped = autoMapTransactionToAccurate(String(value), accounts);
          updated.accurateAccountCode = mapped.code;
          updated.accurateAccountName = mapped.name;
          updated.confidence = mapped.confidence;
        }
        return updated;
      }
      return t;
    }));
  };

  // Add Empty Row
  const handleAddRow = () => {
    const defaultAcc = accounts.find(a => a.code === '5-1900') || accounts[1] || { code: '5-1900', name: 'Biaya Operasional' };
    const newTx: AccurateMappedTransaction = {
      id: 'tx-' + Date.now() + '-' + Math.random().toString().slice(-4),
      date: new Date().toISOString().split('T')[0],
      description: 'Pengeluaran Petty Cash',
      amount: 0,
      recipient: '',
      accurateAccountCode: defaultAcc.code,
      accurateAccountName: defaultAcc.name,
      confidence: 'manual'
    };
    setTransactions(prev => [...prev, newTx]);
  };

  // Delete Row
  const handleDeleteRow = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  // --- PARSING HANDLERS ---

  // 1. Excel File Parser (.xlsx, .xls, .csv)
  const parseExcelFile = (file: File) => {
    setIsProcessing(true);
    setProcessMessage('Membaca lembar kerja Excel...');
    setErrorMessage('');
    setSuccessMessage('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON array of arrays or objects
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

        if (!rawRows || rawRows.length === 0) {
          throw new Error('Berkas Excel kosong atau tidak memiliki data.');
        }

        // Find header index
        let headerIdx = -1;
        let dateColIdx = -1;
        let descColIdx = -1;
        let amountColIdx = -1;
        let recipientColIdx = -1;

        for (let i = 0; i < Math.min(15, rawRows.length); i++) {
          const row = rawRows[i];
          if (!Array.isArray(row)) continue;
          
          row.forEach((cellVal, colIdx) => {
            const str = String(cellVal || '').toLowerCase().trim();
            if (str.includes('tanggal') || str.includes('tgl') || str.includes('date')) {
              dateColIdx = colIdx;
              headerIdx = i;
            }
            if (str.includes('keterangan') || str.includes('uraian') || str.includes('rincian') || str.includes('deskripsi') || str.includes('item')) {
              descColIdx = colIdx;
              headerIdx = i;
            }
            if (str.includes('jumlah') || str.includes('nominal') || str.includes('debet') || str.includes('pengeluaran') || str.includes('amount') || str.includes('total')) {
              amountColIdx = colIdx;
              headerIdx = i;
            }
            if (str.includes('penerima') || str.includes('worker') || str.includes('oleh') || str.includes('nama')) {
              recipientColIdx = colIdx;
            }
          });

          if (dateColIdx !== -1 && descColIdx !== -1 && amountColIdx !== -1) {
            break;
          }
        }

        // Fallback column positions if headers weren't explicitly named
        if (dateColIdx === -1) dateColIdx = 0;
        if (descColIdx === -1) descColIdx = 1;
        if (amountColIdx === -1) amountColIdx = 2;

        const startRowIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
        const parsedTxs: AccurateMappedTransaction[] = [];

        for (let i = startRowIdx; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          const descStr = String(row[descColIdx] || '').trim();
          const amountRaw = String(row[amountColIdx] || '').replace(/[^0-9.-]/g, '');
          const amountVal = parseFloat(amountRaw) || 0;

          // Skip header repeats or empty descriptions/amounts
          if (!descStr || amountVal <= 0 || descStr.toLowerCase().includes('total') || descStr.toLowerCase().includes('saldo')) {
            continue;
          }

          let dateStr = String(row[dateColIdx] || '').trim();
          if (!dateStr || dateStr.toLowerCase().includes('tanggal')) {
            dateStr = new Date().toISOString().split('T')[0];
          }

          const recipientStr = recipientColIdx !== -1 ? String(row[recipientColIdx] || '').trim() : '';

          // Auto Map
          const mapped = autoMapTransactionToAccurate(descStr, accounts);

          parsedTxs.push({
            id: `excel-${i}-${Date.now()}`,
            date: dateStr,
            description: descStr,
            amount: amountVal,
            recipient: recipientStr,
            accurateAccountCode: mapped.code,
            accurateAccountName: mapped.name,
            confidence: mapped.confidence,
            rawLine: row.join(' | ')
          });
        }

        if (parsedTxs.length === 0) {
          throw new Error('Tidak dapat mengekstrak baris transaksi valid dari Excel. Pastikan terdapat kolom Tanggal, Keterangan, dan Nominal.');
        }

        setReportTitle(`Impor Excel: ${file.name}`);
        setTransactions(parsedTxs);
        setSuccessMessage(`Berhasil membaca ${parsedTxs.length} transaksi dari file Excel "${file.name}"!`);
      } catch (err: any) {
        console.error('Error parsing Excel:', err);
        setErrorMessage(err.message || 'Gagal membaca berkas Excel.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // 2. AI / Gemini Parser for PDF, Image, or Unstructured File
  const parseWithAI = async (file: File) => {
    setIsProcessing(true);
    setProcessMessage('Menganalisis dokumen & mengekstrak data via AI (Gemini)...');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await fetch('/api/gemini/parse-petty-cash', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64: base64Data,
              mimeType: file.type || 'application/pdf',
              accounts
            })
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || data.details || 'Gagal mengekstrak dokumen dengan AI.');
          }

          const result = data.result;
          if (result.reportTitle) setReportTitle(result.reportTitle);
          if (result.period) setPeriod(result.period);

          if (result.transactions && Array.isArray(result.transactions) && result.transactions.length > 0) {
            const mappedTxs: AccurateMappedTransaction[] = result.transactions.map((t: any, idx: number) => {
              const matchedAccount = accounts.find(a => a.code === t.accurateAccountCode) || autoMapTransactionToAccurate(t.description, accounts);
              return {
                id: `ai-${idx}-${Date.now()}`,
                date: t.date || new Date().toISOString().split('T')[0],
                description: t.description || 'Transaksi Petty Cash',
                amount: Number(t.amount) || 0,
                recipient: t.recipient || '',
                accurateAccountCode: matchedAccount.code,
                accurateAccountName: matchedAccount.name,
                confidence: 'high'
              };
            });

            setTransactions(mappedTxs);
            setSuccessMessage(`Berhasil mengekstrak ${mappedTxs.length} transaksi menggunakan AI!`);
          } else {
            throw new Error('AI tidak menemukan rincian transaksi pada dokumen ini.');
          }
        } catch (err: any) {
          console.error(err);
          setErrorMessage(err.message || 'Terjadi kesalahan saat memproses via AI.');
        } finally {
          setIsProcessing(false);
        }
      };
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal membaca berkas.');
      setIsProcessing(false);
    }
  };

  // Main Upload Dispatcher
  const handleFileSelect = (file: File) => {
    if (!file) return;
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      parseExcelFile(file);
    } else {
      parseWithAI(file);
    }
  };

  // 3. Parse Pasted Text
  const handleParsePastedText = () => {
    if (!pastedText.trim()) {
      setErrorMessage('Silakan tempel (paste) teks/tabel transaksi terlebih dahulu.');
      return;
    }

    setIsProcessing(true);
    setProcessMessage('Mengekstrak baris dari teks...');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const lines = pastedText.split('\n');
      const parsedTxs: AccurateMappedTransaction[] = [];

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.toLowerCase().includes('total') || trimmed.toLowerCase().includes('saldo')) return;

        // Split by Tab, Pipe, or Semicolon
        let parts = trimmed.split('\t');
        if (parts.length < 2) parts = trimmed.split('|');
        if (parts.length < 2) parts = trimmed.split(';');

        let dateStr = new Date().toISOString().split('T')[0];
        let descStr = '';
        let amountVal = 0;
        let recipientStr = '';

        if (parts.length >= 3) {
          // Format: Tanggal | Keterangan | Nominal
          dateStr = parts[0].trim();
          descStr = parts[1].trim();
          const amountRaw = parts[2].replace(/[^0-9.-]/g, '');
          amountVal = parseFloat(amountRaw) || 0;
          if (parts[3]) recipientStr = parts[3].trim();
        } else if (parts.length === 2) {
          descStr = parts[0].trim();
          const amountRaw = parts[1].replace(/[^0-9.-]/g, '');
          amountVal = parseFloat(amountRaw) || 0;
        } else {
          // Single string line: extract number at the end
          const match = trimmed.match(/(.+?)\s+Rp?\s*([\d.,]+)$/i) || trimmed.match(/(.+?)\s+([\d.,]{3,})$/);
          if (match) {
            descStr = match[1].trim();
            amountVal = parseFloat(match[2].replace(/[^0-9.-]/g, '')) || 0;
          }
        }

        if (descStr && amountVal > 0) {
          const mapped = autoMapTransactionToAccurate(descStr, accounts);
          parsedTxs.push({
            id: `text-${idx}-${Date.now()}`,
            date: dateStr,
            description: descStr,
            amount: amountVal,
            recipient: recipientStr,
            accurateAccountCode: mapped.code,
            accurateAccountName: mapped.name,
            confidence: mapped.confidence,
            rawLine: trimmed
          });
        }
      });

      if (parsedTxs.length === 0) {
        throw new Error('Gagal mengenali format teks. Pastikan baris berisi Keterangan dan Nominal Angka.');
      }

      setReportTitle('Impor Teks Salinan');
      setTransactions(parsedTxs);
      setSuccessMessage(`Berhasil mengekstrak ${parsedTxs.length} baris transaksi dari teks!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengekstrak teks.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Load from Workspace Petty Cash Report
  const handleLoadWorkspaceReport = (report: PettyCashReport) => {
    if (!report || !report.transactions || report.transactions.length === 0) {
      setErrorMessage('Laporan petty cash ini tidak memiliki rincian transaksi.');
      return;
    }

    const docUrl = report.driveUrl || null;
    const docName = report.fileName || null;
    const custodian = report.summary?.workerName || 'Petty Cash NMSA';

    setActiveDocumentUrl(docUrl);
    setActiveDocumentName(docName);
    setActiveCustodianName(custodian);

    const mappedTxs: AccurateMappedTransaction[] = report.transactions.map((t, idx) => {
      const mapped = autoMapTransactionToAccurate(t.description, accounts);
      return {
        id: `pc-${report.id}-${idx}`,
        date: t.date || report.uploadedAt,
        description: t.description,
        amount: Number(t.amount) || 0,
        recipient: t.worker || custodian,
        accurateAccountCode: mapped.code,
        accurateAccountName: mapped.name,
        confidence: mapped.confidence
      };
    });

    setReportTitle(`Laporan Petty Cash: ${custodian} (${report.fileName || 'PDF'})`);
    setPeriod(report.summary?.reportMonth || new Date().toISOString().substring(0, 7));
    setTransactions(mappedTxs);
    setSuccessMessage(`Berhasil memuat ${mappedTxs.length} transaksi dari Laporan Petty Cash (${custodian})!`);
  };

  // Helper to extract base64 data from file URL (data URL, blob URL, Google Drive URL, or public HTTP URL)
  const extractBase64FromUrl = async (url: string): Promise<{ base64Data: string; mimeType: string }> => {
    if (!url) throw new Error('URL dokumen tidak ditemukan.');

    if (url.startsWith('data:')) {
      const mimeTypeMatch = url.match(/^data:([^;]+);/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'application/pdf';
      return { base64Data: url, mimeType };
    }

    let blob: Blob | null = null;
    let mimeType = 'application/pdf';

    // Check if it's a Google Drive URL
    let fileId = '';
    const match1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const match3 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1 && match1[1]) fileId = match1[1];
    else if (match2 && match2[1]) fileId = match2[1];
    else if (match3 && match3[1]) fileId = match3[1];

    if (fileId) {
      const token = localStorage.getItem('NUSANTARA_GOOGLE_DRIVE_TOKEN') || 
                    localStorage.getItem('google_access_token') ||
                    (typeof window !== 'undefined' && (window as any).gapi?.auth?.getToken?.()?.access_token);

      if (token) {
        try {
          const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (driveRes.ok) {
            blob = await driveRes.blob();
            const ct = driveRes.headers.get('content-type');
            if (ct && !ct.includes('octet-stream')) mimeType = ct.split(';')[0];
          }
        } catch (e) {
          console.warn('Direct Google Drive API download error, attempting backend proxy...', e);
        }
      }

      // If direct fetch didn't succeed, use server-side drive proxy
      if (!blob) {
        try {
          const proxyUrl = `/api/drive-proxy?id=${fileId}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
          const proxyRes = await fetch(proxyUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (proxyRes.ok) {
            blob = await proxyRes.blob();
            const ct = proxyRes.headers.get('content-type');
            if (ct && !ct.includes('octet-stream')) mimeType = ct.split(';')[0];
          }
        } catch (e) {
          console.warn('Proxy download failed, attempting direct fetch...', e);
        }
      }
    }

    // Fallback standard fetch for normal HTTP/HTTPS urls
    if (!blob) {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Gagal mengunduh berkas LPJ dari server/Google Drive (HTTP ${res.status}).`);
      }
      blob = await res.blob();
      const ct = res.headers.get('content-type');
      if (ct && !ct.includes('octet-stream')) mimeType = ct.split(';')[0];
    }

    if (!blob) {
      throw new Error('Gagal membaca isi dokumen LPJ.');
    }

    if (!mimeType || mimeType === 'application/octet-stream') {
      if (url.match(/\.(jpeg|jpg)$/i)) mimeType = 'image/jpeg';
      else if (url.match(/\.png$/i)) mimeType = 'image/png';
      else if (url.match(/\.webp$/i)) mimeType = 'image/webp';
      else mimeType = 'application/pdf';
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result) {
          resolve({ base64Data: result, mimeType });
        } else {
          reject(new Error('Gagal membaca data berkas dokumen LPJ.'));
        }
      };
      reader.onerror = () => reject(new Error('Gagal membaca blob berkas LPJ.'));
      reader.readAsDataURL(blob!);
    });
  };

  // 5. Load from Uploaded Voucher HO Submission with AI Document Parsing
  const handleLoadVoucherSubmission = async (sub: Submission, specificDocUrl?: string, specificDocName?: string) => {
    if (!sub) return;

    // Strictly prioritize LPJ (Laporan Pertanggungjawaban Petty Cash Lapangan) documents
    const lpjDocs = getSubmissionDocuments(sub);
    const primaryLpjDoc = specificDocUrl 
      ? { url: specificDocUrl, fileName: specificDocName || 'Laporan_Petty_Cash.pdf' }
      : (lpjDocs[0] || (sub.pettyCashFile?.url ? { url: sub.pettyCashFile.url, fileName: sub.pettyCashFile.name || 'Laporan_Pertanggungjawaban.pdf' } : null));

    const docUrl = primaryLpjDoc?.url || null;
    const docName = primaryLpjDoc?.fileName || (docUrl ? 'Laporan_Pertanggungjawaban_Petty_Cash.pdf' : null);
    const custodian = sub.pettyCashCustodian || sub.dibayarkanKepada || 'Petty Cash';

    setActiveDocumentUrl(docUrl);
    setActiveDocumentName(docName);
    setActiveCustodianName(custodian);
    setActiveSubmission(sub);

    // Attempt AI/Gemini document extraction on the physical LPJ document!
    if (docUrl) {
      setIsProcessing(true);
      setProcessMessage(`Menganalisis Berkas LPJ Lapangan (${docName || 'PDF'})...`);
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const { base64Data, mimeType } = await extractBase64FromUrl(docUrl);

        const res = await fetch('/api/gemini/parse-petty-cash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64Data,
            mimeType,
            accounts
          })
        });

        const data = await res.json();
        if (res.ok && data.success && data.result && data.result.transactions && data.result.transactions.length > 0) {
          const mappedTxs: AccurateMappedTransaction[] = data.result.transactions.map((t: any, idx: number) => {
            const matchedAccount = accounts.find(a => a.code === t.accurateAccountCode) || autoMapTransactionToAccurate(t.description, accounts);
            return {
              id: `ai-vh-${sub.id}-${idx}-${Date.now()}`,
              date: t.date || sub.tanggal || new Date().toISOString().substring(0, 10),
              description: t.description || 'Transaksi Petty Cash',
              amount: Number(t.amount) || 0,
              recipient: t.recipient || custodian,
              accurateAccountCode: matchedAccount.code,
              accurateAccountName: matchedAccount.name,
              confidence: 'high'
            };
          });

          setReportTitle(`Laporan Petty Cash: ${sub.kode} - ${custodian}`);
          setPeriod(sub.tanggal ? sub.tanggal.substring(0, 7) : new Date().toISOString().substring(0, 7));
          setTransactions(mappedTxs);
          setSuccessMessage(`Berhasil menganalisis Berkas LPJ Lapangan "${docName || 'Petty Cash'}" & mengekstrak ${mappedTxs.length} rincian transaksi via AI!`);

          saveAccurateMappingToFirestore({
            id: `vh-map-${sub.id}`,
            title: `Laporan Petty Cash: ${sub.kode} - ${custodian}`,
            period: sub.tanggal ? sub.tanggal.substring(0, 7) : new Date().toISOString().substring(0, 7),
            selectedKasCode,
            totalExpense: mappedTxs.reduce((s, t) => s + (t.amount || 0), 0),
            transactions: mappedTxs,
            custodian,
            documentUrl: docUrl,
            documentName: docName || undefined,
            savedAt: new Date().toISOString()
          });

          setIsProcessing(false);
          return; // Done with AI parsing!
        }
      } catch (err: any) {
        console.warn('Analisis AI dokumen LPJ gagal, beralih ke rincian voucher:', err);
      } finally {
        setIsProcessing(false);
      }
    }

    // Fallback if no LPJ document URL or AI extraction failed/produced empty list
    if (!sub.items || sub.items.length === 0) {
      setErrorMessage(`Voucher [${sub?.kode || 'Ini'}] tidak memiliki berkas LPJ ataupun rincian item transaksi.`);
      return;
    }

    const mappedTxs: AccurateMappedTransaction[] = sub.items.map((it, idx) => {
      const itemDesc = it.item || 'Biaya Operasional Lapangan';
      const mapped = autoMapTransactionToAccurate(itemDesc, accounts);
      return {
        id: `vh-${sub.id}-${idx}-${Date.now()}`,
        date: sub.tanggal || new Date().toISOString().substring(0, 10),
        description: itemDesc,
        amount: Number(it.total) || 0,
        recipient: custodian,
        accurateAccountCode: mapped.code,
        accurateAccountName: mapped.name,
        confidence: mapped.confidence,
        notes: it.keterangan || undefined
      };
    });

    setReportTitle(`Laporan Petty Cash: ${sub.kode} - ${custodian}`);
    setPeriod(sub.tanggal ? sub.tanggal.substring(0, 7) : new Date().toISOString().substring(0, 7));
    setTransactions(mappedTxs);
    setSuccessMessage(`Memuat ${mappedTxs.length} rincian transaksi dari data voucher [${sub.kode}] (${custodian}).`);

    saveAccurateMappingToFirestore({
      id: `vh-map-${sub.id}`,
      title: `Laporan Petty Cash: ${sub.kode} - ${custodian}`,
      period: sub.tanggal ? sub.tanggal.substring(0, 7) : new Date().toISOString().substring(0, 7),
      selectedKasCode,
      totalExpense: mappedTxs.reduce((s, t) => s + (t.amount || 0), 0),
      transactions: mappedTxs,
      custodian,
      documentUrl: docUrl || undefined,
      documentName: docName || undefined,
      savedAt: new Date().toISOString()
    });
  };

  // Save current mapping report to Cloud Firestore & App LocalStorage
  const handleSaveMappingToCloud = async () => {
    if (transactions.length === 0) {
      setErrorMessage('Tidak ada transaksi yang dapat disimpan.');
      return;
    }

    setIsProcessing(true);
    setProcessMessage('Menyimpan hasil pemetaan akun Accurate ke penyimpanan Cloud & Aplikasi...');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const mappingPayload = {
        id: `acc-map-${Date.now()}`,
        title: reportTitle,
        period,
        selectedKasCode,
        totalExpense,
        transactions,
        custodian: activeCustodianName,
        documentUrl: activeDocumentUrl,
        documentName: activeDocumentName,
        accountsCount: accounts.length,
        savedAt: new Date().toISOString()
      };

      await saveAccurateMappingToFirestore(mappingPayload);
      setSuccessMessage('Hasil pemetaan akun Accurate berhasil tersimpan di Cloud / Penyimpanan Aplikasi! Data tidak akan hilang saat aplikasi di-restart atau di-update.');
    } catch (err: any) {
      setErrorMessage('Gagal menyimpan ke cloud: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  // --- EXPORT FUNCTIONS ---

  // 1. Export Excel Accurate Import File
  const handleExportAccurateExcel = () => {
    if (transactions.length === 0) return;

    // Header structure formatted for Accurate Online Journal Voucher Import
    const excelData = transactions.map((t, idx) => ({
      'No. Transaksi': `JV-PC-${idx + 1}`,
      'Tanggal': t.date,
      'Kode Akun Debit': t.accurateAccountCode,
      'Nama Akun Debit': t.accurateAccountName,
      'Nominal Debit': t.amount,
      'Kode Akun Kredit (Kas)': kasAccount.code,
      'Nama Akun Kredit': kasAccount.name,
      'Nominal Kredit': t.amount,
      'Catatan / Memo': t.description,
      'Penerima / Pemohon': t.recipient || '',
      'Departemen / Divisi': 'Operational Site',
      'Status Pemetaan': t.confidence.toUpperCase()
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Impor Jurnal Accurate');

    const fileName = `Accurate_Import_PettyCash_${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().substring(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // 2. Export PDF Mapping Summary Options
  const handleExportPDF = () => {
    if (transactions.length === 0) return;
    setShowPrintModal(true);
  };

  // Option 1: Standard Flat List PDF
  const handleExportPDFStandard = () => {
    if (transactions.length === 0) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PT NUSANTARA MINERAL SUKSES ABADI', 14, 15);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP & PEMETAAN AKUN ACCURATE - PETTY CASH', 14, 22);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Judul / Sumber: ${reportTitle}`, 14, 28);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')} | Periode: ${period}`, 14, 33);
    doc.text(`Akun Kas / Kredit: [${kasAccount.code}] ${kasAccount.name} | Total: Rp ${totalExpense.toLocaleString('id-ID')}`, 14, 38);

    // Grouped Summary Table
    const summaryRows = groupedSummary.map((g, i) => [
      i + 1,
      g.accountCode,
      g.accountName,
      g.items.length,
      `Rp ${g.totalAmount.toLocaleString('id-ID')}`
    ]);

    summaryRows.push([
      '',
      'TOTAL',
      'KESELURUHAN BEBAN',
      transactions.length,
      `Rp ${totalExpense.toLocaleString('id-ID')}`
    ]);

    autoTable(doc, {
      startY: 43,
      head: [['No', 'Kode Akun', 'Nama Akun Accurate', 'Jumlah Transaksi', 'Total Nominal']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [243, 244, 246], fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 2 }
    });

    // Detailed Item Table
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 100;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RINCIAN TRANSAKSI PER BARIS', 14, finalY);

    const detailRows = transactions.map((t, i) => [
      i + 1,
      t.date,
      t.description,
      t.recipient || '-',
      t.accurateAccountCode,
      t.accurateAccountName,
      `Rp ${t.amount.toLocaleString('id-ID')}`
    ]);

    autoTable(doc, {
      startY: finalY + 3,
      head: [['No', 'Tanggal', 'Keterangan Transaksi', 'Penerima', 'Kode Akun', 'Nama Akun Accurate', 'Nominal']],
      body: detailRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 1.5 }
    });

    doc.save(`Laporan_Pemetaan_Accurate_Standar_${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    setShowPrintModal(false);
  };

  // Option 2: Grouped by Category & Sorted by Time/Date Chronologically
  const handleExportPDFGroupedByCategory = () => {
    if (transactions.length === 0) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('PT NUSANTARA MINERAL SUKSES ABADI', 14, 15);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP & PEMETAAN AKUN ACCURATE - PER KATEGORI', 14, 22);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Judul / Sumber: ${reportTitle}`, 14, 28);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')} | Periode: ${period}`, 14, 33);
    doc.text(`Akun Kas (Kredit): [${kasAccount.code}] ${kasAccount.name} | Total Beban: Rp ${totalExpense.toLocaleString('id-ID')}`, 14, 38);

    // 1. Global Summary Table
    const summaryRows = groupedSummary.map((g, i) => [
      i + 1,
      g.accountCode,
      g.accountName,
      g.items.length,
      `Rp ${g.totalAmount.toLocaleString('id-ID')}`
    ]);

    summaryRows.push([
      '',
      'TOTAL',
      'KESELURUHAN BEBAN',
      transactions.length,
      `Rp ${totalExpense.toLocaleString('id-ID')}`
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['No', 'Kode Akun', 'Nama Akun Accurate', 'Jumlah Item', 'Total Nominal (Rp)']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [243, 244, 246], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 }
    });

    let currentY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 95;

    // 2. Iterate through each Category in groupedSummary
    groupedSummary.forEach((group, groupIdx) => {
      // Sort items chronologically by Date / Time (Oldest to Newest)
      const sortedGroupItems = [...group.items].sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        const dateDiff = dateA.localeCompare(dateB);
        if (dateDiff !== 0) return dateDiff;
        return a.id.localeCompare(b.id);
      });

      // Check if page overflow will occur (leave at least 40mm)
      if (currentY > 250) {
        doc.addPage();
        currentY = 15;
      }

      // Category Header
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(
        `${groupIdx + 1}. [${group.accountCode}] ${group.accountName}  —  Subtotal: Rp ${group.totalAmount.toLocaleString('id-ID')} (${sortedGroupItems.length} Transaksi)`,
        14,
        currentY
      );
      doc.setTextColor(0, 0, 0);

      // Build rows for this category
      const catRows = sortedGroupItems.map((t, idx) => [
        idx + 1,
        t.date || '-',
        t.description,
        t.recipient || '-',
        `Rp ${t.amount.toLocaleString('id-ID')}`
      ]);

      // Subtotal row
      catRows.push([
        '',
        '',
        `Subtotal [${group.accountCode}]`,
        `${sortedGroupItems.length} Item`,
        `Rp ${group.totalAmount.toLocaleString('id-ID')}`
      ]);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['No', 'Tanggal Transaksi', 'Keterangan / Uraian Belanja', 'Penerima / Toko', 'Nominal (Rp)']],
        body: catRows,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 1.8 },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 26 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 38 },
          4: { cellWidth: 32, halign: 'right' }
        },
        didParseCell: (data) => {
          if (data.row.index === catRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 245, 245];
          }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 8;
    });

    // 3. Signature Block
    if (currentY > 235) {
      doc.addPage();
      currentY = 20;
    } else {
      currentY += 4;
    }

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    const col1X = 14;
    const col2X = 80;
    const col3X = 146;

    doc.text('Dibuat Oleh:', col1X, currentY);
    doc.text('Diverifikasi Oleh:', col2X, currentY);
    doc.text('Disetujui Oleh:', col3X, currentY);

    doc.setFont('helvetica', 'normal');
    doc.text('Kasir / Pemegang Petty Cash', col1X, currentY + 4);
    doc.text('Accounting / Verifikator', col2X, currentY + 4);
    doc.text('Direktur Keuangan / PM', col3X, currentY + 4);

    doc.line(col1X, currentY + 22, col1X + 45, currentY + 22);
    doc.line(col2X, currentY + 22, col2X + 45, currentY + 22);
    doc.line(col3X, currentY + 22, col3X + 45, currentY + 22);

    doc.text(`( ${activeCustodianName || '.....................'} )`, col1X, currentY + 26);
    doc.text('( ..................... )', col2X, currentY + 26);
    doc.text('( ..................... )', col3X, currentY + 26);

    doc.save(`Laporan_Pemetaan_Kategori_Accurate_${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    setShowPrintModal(false);
  };

  // 3. Copy Summary to Clipboard
  const handleCopyClipboard = () => {
    let text = `=== REKAP PEMETAAN AKUN ACCURATE ===\n`;
    text += `Judul: ${reportTitle}\n`;
    text += `Total Petty Cash: Rp ${totalExpense.toLocaleString('id-ID')}\n`;
    text += `Akun Kas (Kredit): [${kasAccount.code}] ${kasAccount.name}\n\n`;
    text += `--- RINGKASAN PER AKUN ---\n`;

    groupedSummary.forEach((g) => {
      text += `[${g.accountCode}] ${g.accountName}: Rp ${g.totalAmount.toLocaleString('id-ID')} (${g.items.length} item)\n`;
    });

    text += `\n--- RINCIAN TRANSAKSI ---\n`;
    transactions.forEach((t, i) => {
      text += `${i + 1}. [${t.date}] ${t.description} -> [${t.accurateAccountCode}] ${t.accurateAccountName} | Rp ${t.amount.toLocaleString('id-ID')}\n`;
    });

    navigator.clipboard.writeText(text);
    setSuccessMessage('Data rekap pemetaan Accurate berhasil disalin ke clipboard!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // --- COA MANAGEMENT HANDLERS ---
  const handleStartEditCoa = (acc: AccurateAccount) => {
    setEditingCode(acc.code);
    setNewCode(acc.code);
    setNewName(acc.name);
    setNewCategory(acc.category);
    setNewKeywords(acc.keywords ? acc.keywords.join(', ') : '');
  };

  const handleCancelEditCoa = () => {
    setEditingCode(null);
    setNewCode('');
    setNewName('');
    setNewCategory('Beban Operasional');
    setNewKeywords('');
  };

  const handleAddCoaAccount = () => {
    if (!newCode.trim() || !newName.trim()) return;

    const keywordsArr = newKeywords.split(',').map(k => k.trim()).filter(Boolean);
    const updatedAcc: AccurateAccount = {
      code: newCode.trim(),
      name: newName.trim(),
      category: newCategory,
      keywords: keywordsArr
    };

    if (editingCode) {
      setAccounts(prev => prev.map(a => a.code === editingCode ? updatedAcc : a));
      setSuccessMessage(`Akun Accurate [${updatedAcc.code}] ${updatedAcc.name} berhasil diperbarui!`);
    } else {
      setAccounts(prev => [...prev, updatedAcc]);
      setSuccessMessage(`Akun Accurate [${updatedAcc.code}] ${updatedAcc.name} berhasil ditambahkan!`);
    }

    handleCancelEditCoa();
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleDeleteCoaAccount = (code: string) => {
    setAccounts(prev => prev.filter(a => a.code !== code));
    if (editingCode === code) {
      handleCancelEditCoa();
    }
  };

  const handleResetCoaToDefault = () => {
    if (confirm('Apakah Anda yakin ingin mereset seluruh daftar COA ke susunan standar Accurate dari dokumen laporan?')) {
      setAccounts(DEFAULT_ACCURATE_ACCOUNTS);
      localStorage.setItem('accurate_coa_master_v1', JSON.stringify(DEFAULT_ACCURATE_ACCOUNTS));
      setSuccessMessage('Daftar COA Accurate berhasil direset ke standar lengkap!');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  const filteredCoaAccounts = accounts.filter(a => 
    a.code.toLowerCase().includes(searchTermCoa.toLowerCase()) || 
    a.name.toLowerCase().includes(searchTermCoa.toLowerCase()) ||
    a.category.toLowerCase().includes(searchTermCoa.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-stone-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-10">
          <FileSpreadsheet size={240} className="text-white" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 backdrop-blur-md px-3 py-1 rounded-full text-emerald-300 text-xs font-mono font-bold uppercase tracking-wider">
            <Sparkles size={14} className="animate-pulse" />
            Module Integrasi Accurate ERP & AI Parser
          </div>

          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white font-sans">
            Rekap & Pemetaan Akun Accurate (Petty Cash)
          </h2>

          <p className="text-stone-300 text-xs md:text-sm leading-relaxed font-sans">
            Membaca laporan petty cash (Excel, PDF, Gambar, Teks), mengekstrak transaksi dengan presisi tanpa kesalahan baca, dan mengelompokkan secara otomatis ke Kode Akun Accurate untuk mempermudah jurnal input.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3 text-xs font-mono">
            {/* Unified Google Drive Connection Status */}
            <div className="bg-emerald-950/80 border border-emerald-400/40 text-emerald-300 font-bold px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Google Drive:</span>
              <span className="text-white font-mono">{driveAccount?.email || 'Master Terhubung'}</span>
            </div>

            <button
              onClick={() => setIsCoaModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus size={15} />
              <span>Tambah Akun COA Baru</span>
            </button>

            <button
              onClick={() => setIsCoaModalOpen(true)}
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Settings size={15} className="text-amber-300" />
              <span>Kelola Master COA ({accounts.length} Akun)</span>
            </button>

            {onBack && (
              <button
                onClick={onBack}
                className="bg-stone-800/80 hover:bg-stone-800 text-stone-300 px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Kembali ke Daftar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs flex items-center gap-3 animate-fadeIn">
          <AlertCircle size={18} className="text-rose-600 shrink-0" />
          <p className="font-semibold">{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="font-semibold">{successMessage}</p>
        </div>
      )}

      {/* Main Input Source Section */}
      <div className="bg-white border border-stone-250 rounded-3xl p-6 shadow-xs space-y-5">
        <div className="border-b border-stone-200 pb-4">
          <h3 className="font-sans font-black text-stone-900 text-base">
            1. Pilih Sumber File / Data Petty Cash
          </h3>
          <p className="text-stone-500 text-xs font-mono">
            Pilih dari daftar voucher terupload, unggah berkas Excel/PDF nota, atau tempelkan teks transaksi.
          </p>
        </div>

        {/* Source Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-200 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('voucher')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'voucher' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <FileCheck size={15} />
            <span>Pilih Voucher Petty Cash Terupload ({pettyCashSubmissions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'upload' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Upload size={15} />
            <span>Unggah File (Excel / PDF / Gambar)</span>
          </button>

          <button
            onClick={() => setActiveTab('workspace')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'workspace' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Layers size={15} />
            <span>Laporan Workspace ({pettyCashReports.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'text' ? 'bg-emerald-700 text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <FileText size={15} />
            <span>Copy & Paste Teks Tabel</span>
          </button>

          <button
            onClick={() => setActiveTab('saved')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ml-auto ${
              activeTab === 'saved' ? 'bg-indigo-700 text-white shadow-sm' : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 border border-indigo-200'
            }`}
          >
            <History size={15} className="text-indigo-500" />
            <span>Riwayat Pemetaan Tersimpan ({savedMappings.length})</span>
          </button>
        </div>

        {/* Tab Content 0: Voucher HO Submissions (Filtered strictly to Petty Cash) */}
        {activeTab === 'voucher' && (
          <div className="space-y-4">
            <div className="bg-emerald-50/80 border border-emerald-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Sparkles size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-950 leading-relaxed font-sans">
                  <strong>Terfilter Khusus Voucher / Laporan Petty Cash:</strong> Menampilkan pengajuan berjenis Petty Cash. Rincian item transaksi beserta <strong>link dokumen/nota terlampir</strong> otomatis terserap untuk dipetakan ke COA Accurate.
                </p>
              </div>

              {/* Custodian & Search Filter Bar */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                  <input
                    type="text"
                    value={voucherSearchQuery}
                    onChange={(e) => setVoucherSearchQuery(e.target.value)}
                    placeholder="Cari kode/penerima..."
                    className="pl-8 pr-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 text-stone-800"
                  />
                </div>

                <select
                  value={custodianFilter}
                  onChange={(e) => handleCustodianFilterChange(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-extrabold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="All">👤 Semua Pemegang Kas ({availableCustodians.length})</option>
                  {availableCustodians.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredPettyCashSubmissions.length === 0 ? (
              <div className="p-8 text-center bg-stone-50 rounded-2xl border border-stone-200">
                <FileCheck size={32} className="mx-auto text-stone-400 mb-2" />
                <p className="text-xs font-bold text-stone-700">Tidak ada Voucher / Pengajuan Petty Cash yang cocok.</p>
                <p className="text-[11px] text-stone-500 mt-1">Coba sesuaikan kata kunci pencarian atau saringan pemegang kas.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                {filteredPettyCashSubmissions.map((sub) => {
                  const stats = getVoucherStats(sub);

                  return (
                    <div 
                      key={sub.id} 
                      className="bg-white hover:bg-emerald-50/40 border border-stone-250 hover:border-emerald-400 rounded-2xl p-4 transition shadow-xs flex flex-col justify-between space-y-3.5 cursor-pointer group"
                      onClick={() => handleOpenVoucherModal(sub)}
                    >
                      <div className="space-y-2.5">
                        {/* Header: Document Code & Type Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-black text-stone-900 group-hover:text-emerald-800 tracking-tight">
                            {sub.kode}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-0.5 rounded-full shrink-0">
                            Petty Cash
                          </span>
                        </div>

                        {/* Details: Custodian, Document Date & Item Count */}
                        <div className="space-y-1">
                          <p className="text-xs font-extrabold text-stone-900 flex items-center gap-1.5 truncate">
                            <span className="shrink-0">👤</span>
                            <span className="truncate">Dibayarkan: <strong className="text-emerald-950">{stats.custodian}</strong></span>
                          </p>
                          <p className="text-[11px] text-stone-600 font-mono flex items-center gap-1.5">
                            <span>📅 Tanggal: {formatIndonesianDate(sub.tanggal)}</span>
                            <span className="text-stone-300">•</span>
                            <span>📋 {stats.itemsCount} Item</span>
                          </p>
                          {stats.periodText && (
                            <p className="text-[11px] text-amber-950 font-mono font-bold bg-amber-50/80 px-2 py-0.5 rounded-md border border-amber-200/80 flex items-center gap-1">
                              <span>🗓️</span>
                              <span className="truncate">Periode: {stats.periodText}</span>
                            </p>
                          )}
                        </div>

                        {/* Document Link Badges & Selection */}
                        {stats.lpjDocs.length > 0 ? (
                          <div className="pt-0.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md border border-emerald-300">
                                📎 {stats.lpjDocs.length} Lampiran Terunggah
                              </span>
                              <span className="text-[9px] font-mono text-stone-400">
                                F1/F2 Diabaikan
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                              {stats.lpjDocs.map((doc, dIdx) => (
                                <button
                                  key={doc.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVoucherForModal(sub);
                                    setSelectedDocIndex(dIdx);
                                    setIsVoucherModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg transition shadow-3xs cursor-pointer truncate max-w-[220px]"
                                  title={`Lihat & Petakan "${doc.fileName}"`}
                                >
                                  <Eye size={11} className="text-emerald-700 shrink-0" />
                                  <span className="truncate">{doc.fileName}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="pt-0.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                                <AlertCircle size={10} className="text-amber-600 shrink-0" />
                                <span>Belum ada berkas fisik</span>
                              </span>
                              <span className="text-[9px] font-mono text-stone-400">
                                F1/F2 Diabaikan
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Financial Detail Grid: Total Submisi vs Total Pengeluaran LPJ */}
                        <div className="p-2.5 bg-stone-50 group-hover:bg-emerald-50/50 border border-stone-200/90 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-stone-500 font-medium">Total Submisi:</span>
                            <span className="font-bold text-stone-900">
                              Rp {stats.totalAmt.toLocaleString('id-ID')}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-stone-200/80">
                            <span className="text-emerald-900 font-bold flex items-center gap-1">
                              <span>📊 Pengeluaran LPJ:</span>
                            </span>
                            {stats.totalExpense > 0 ? (
                              <div className="text-right">
                                <span className="font-black text-emerald-800">
                                  Rp {stats.totalExpense.toLocaleString('id-ID')}
                                </span>
                                {stats.diff !== 0 && (
                                  <span className={`block text-[9px] font-bold ${stats.diff > 0 ? 'text-amber-700' : 'text-sky-700'}`}>
                                    {stats.diff > 0 ? `(+Rp ${stats.diff.toLocaleString('id-ID')})` : `(Sisa Rp ${Math.abs(stats.diff).toLocaleString('id-ID')})`}
                                  </span>
                                )}
                              </div>
                            ) : stats.lpjDocs.length > 0 ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                                Siap Dipetakan
                              </span>
                            ) : (
                              <span className="text-[10px] text-stone-400 italic">
                                Belum Ada Berkas
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Action Buttons */}
                      <div className="pt-2 border-t border-stone-200/80 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5">
                          {stats.savedMapping ? (
                            <span className="text-[10px] font-mono font-black text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <CheckCircle2 size={11} className="text-emerald-700" />
                              <span>Tersimpan di Cloud</span>
                            </span>
                          ) : stats.isMapped ? (
                            <span className="text-[10px] font-mono font-extrabold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Sparkles size={11} className="text-indigo-600" />
                              <span>Sedang Terpetakan</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-stone-400">Status: Belum Dipetakan</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {stats.savedMapping ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLoadSavedMapping(stats.savedMapping);
                                }}
                                className="bg-indigo-700 hover:bg-indigo-800 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-3xs cursor-pointer"
                                title="Buka data pemetaan yang tersimpan di Cloud/Cache tanpa perlu analisis ulang"
                              >
                                <History size={12} />
                                <span>Buka Pemetaan</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLoadVoucherSubmission(sub);
                                }}
                                className="bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 px-2 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                title="Analisis ulang dokumen fisik atau rincian item voucher ini"
                              >
                                <RefreshCw size={11} />
                                <span className="hidden sm:inline">Ulangi</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {stats.lpjDocs.length === 0 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenVoucherModal(sub);
                                  }}
                                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1 transition cursor-pointer shadow-3xs"
                                  title="Unggah berkas LPJ / Dokumen fisik untuk voucher ini"
                                >
                                  <Upload size={12} className="text-amber-700" />
                                  <span>Upload LPJ</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenVoucherModal(sub);
                                  }}
                                  className="bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                                  title="Pilih Berkas Lampiran & Pratinjau Dokumen"
                                >
                                  <Eye size={12} />
                                  <span>Pilih Dokumen</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLoadVoucherSubmission(sub);
                                }}
                                className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-xs transition cursor-pointer"
                                title="Petakan Dokumen Lampiran ke Akun COA Accurate"
                              >
                                <span>Petakan</span>
                                <ArrowRight size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab Content 1: Upload File */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-300 hover:border-emerald-500 bg-stone-50/70 hover:bg-emerald-50/30 rounded-3xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
              <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-xs group-hover:scale-110 transition text-emerald-600">
                <FileSpreadsheet size={36} />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">
                  Klik untuk Memilih File atau Drag & Drop Berkas
                </h4>
                <p className="text-stone-500 text-xs font-mono mt-1">
                  Mendukung Format Excel (.xlsx, .xls, .csv), PDF, dan Foto Nota Laporan Petty Cash
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-stone-400 bg-white px-3 py-1 rounded-full border border-stone-200">
                <ShieldCheck size={12} className="text-emerald-500" />
                <span>Otomatis dibaca matematis (Excel) atau AI OCR Presisi Tinggi (PDF/Foto)</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 2: Workspace Petty Cash Reports */}
        {activeTab === 'workspace' && (
          <div className="space-y-4">
            {pettyCashReports.length === 0 ? (
              <div className="text-center py-8 text-stone-500 text-xs font-mono bg-stone-50 rounded-2xl border border-stone-200">
                Belum ada laporan petty cash yang tersimpan di workspace aplikasi. Silakan unggah file Excel/PDF secara langsung.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
                {pettyCashReports.map((report) => (
                  <div
                    key={report.id}
                    onClick={() => handleLoadWorkspaceReport(report)}
                    className="border border-stone-250 bg-stone-50/60 hover:bg-emerald-50/50 hover:border-emerald-400 rounded-2xl p-3.5 cursor-pointer transition space-y-2 group shadow-3xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileCheck size={16} className="text-emerald-600 shrink-0" />
                        <span className="font-bold text-xs text-stone-900 group-hover:text-emerald-900 line-clamp-1">
                          {report.fileName || 'Laporan Petty Cash'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono bg-stone-200 group-hover:bg-emerald-200 px-2 py-0.5 rounded-full font-bold text-stone-700">
                        {report.transactions?.length || 0} items
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-stone-500">
                      <span>Worker: {report.summary.workerName || 'NMSA'}</span>
                      <span className="font-bold text-stone-900">
                        Rp {(report.summary.totalExpense || 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content 3: Copy & Paste Text */}
        {activeTab === 'text' && (
          <div className="space-y-3">
            <textarea
              rows={5}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Tempelkan baris data di sini (Contoh: 2026-08-10 [Tab] Pertamax Dex Operasional [Tab] 350000 [Tab] Suryo)..."
              className="w-full bg-stone-50 border border-stone-250 rounded-2xl p-3.5 text-xs font-mono text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
            <button
              onClick={handleParsePastedText}
              disabled={isProcessing || !pastedText.trim()}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer shadow-3xs"
            >
              <Sparkles size={15} />
              <span>Ekstrak & Petakan Teks Tadi</span>
            </button>
          </div>
        )}

        {/* Tab Content 4: Saved Mappings History (Cloud Database & Local Storage & Google Drive) */}
        {activeTab === 'saved' && (
          <div className="space-y-4">
            <div className="bg-indigo-50/90 border border-indigo-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Database size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                    Riwayat Pemetaan Akun Tersimpan (Cloud Firestore & Cache Aplikasi)
                  </h4>
                  <p className="text-xs text-indigo-900 leading-relaxed font-sans mt-0.5">
                    Hasil pemetaan akun Accurate yang telah dibacakan dan diverifikasi disimpan secara permanen di database Cloud Firebase, cache browser, dan dapat dicadangkan langsung ke Google Drive.
                  </p>
                </div>
              </div>

              {/* Search Filter for Saved Reports */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                  <input
                    type="text"
                    value={savedSearchQuery}
                    onChange={(e) => setSavedSearchQuery(e.target.value)}
                    placeholder="Cari riwayat pemetaan..."
                    className="pl-8 pr-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-stone-800"
                  />
                </div>
                {savedMappings.length > 0 && (
                  <button
                    onClick={() => {
                      loadAccurateMappingsFromFirestore().then((res) => {
                        if (res) setSavedMappings(res);
                        setSuccessMessage('Data riwayat pemetaan berhasil disinkronkan dari Cloud!');
                        setTimeout(() => setSuccessMessage(''), 2500);
                      });
                    }}
                    className="p-1.5 bg-white hover:bg-indigo-100 border border-indigo-300 text-indigo-800 rounded-xl transition cursor-pointer shadow-3xs"
                    title="Sinkronkan Ulang dari Cloud"
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
              </div>
            </div>

            {savedMappings.length === 0 ? (
              <div className="p-8 text-center bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                <Database size={32} className="mx-auto text-stone-400" />
                <p className="text-xs font-bold text-stone-700">Belum ada riwayat pemetaan akun Accurate yang tersimpan.</p>
                <p className="text-[11px] text-stone-500 max-w-md mx-auto">
                  Saat Anda memilih voucher atau mengunggah laporan dan sistem selesai membacakan serta memetakan transaksi, data akan otomatis tersimpan di sini dan tidak akan hilang saat aplikasi di-restart atau di-update.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[460px] overflow-y-auto p-1">
                {savedMappings
                  .filter((m) => {
                    if (!savedSearchQuery.trim()) return true;
                    const q = savedSearchQuery.toLowerCase();
                    const text = [
                      m.title || '',
                      m.custodian || '',
                      m.period || '',
                      m.submissionCode || '',
                      m.selectedKasCode || '',
                      m.documentName || ''
                    ].join(' ').toLowerCase();
                    return text.includes(q);
                  })
                  .map((m) => {
                    const txCount = m.transactions?.length || 0;
                    const totalAmt = m.totalExpense || m.transactions?.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0) || 0;
                    const isCurrentlyActive = activeSubmission?.id === m.submissionId || (reportTitle === m.title && transactions.length === txCount);

                    return (
                      <div
                        key={m.id}
                        className={`border rounded-2xl p-4 transition shadow-xs flex flex-col justify-between space-y-3 ${
                          isCurrentlyActive 
                            ? 'bg-emerald-50/60 border-emerald-400 ring-1 ring-emerald-400' 
                            : 'bg-white hover:bg-stone-50/80 border-stone-250 hover:border-indigo-300'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded-full inline-block">
                                ☁️ Cloud & Cache
                              </span>
                              <h4 className="font-sans font-black text-xs text-stone-900 line-clamp-1 pt-1">
                                {m.title || 'Laporan Petty Cash Mapped'}
                              </h4>
                            </div>
                            <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md font-bold shrink-0">
                              {txCount} Transaksi
                            </span>
                          </div>

                          <div className="space-y-1 text-[11px] font-mono text-stone-600">
                            {m.custodian && (
                              <p className="truncate">
                                👤 Pemegang: <strong className="text-stone-900">{m.custodian}</strong>
                              </p>
                            )}
                            {m.period && (
                              <p>
                                🗓️ Periode: <strong className="text-stone-900">{m.period}</strong>
                              </p>
                            )}
                            <p>
                              🏦 Kas: <span className="text-emerald-800 font-bold">[{m.selectedKasCode || '110102'}]</span>
                            </p>
                            {m.documentName && (
                              <p className="text-[10px] text-stone-500 truncate" title={m.documentName}>
                                📄 Lampiran: {m.documentName}
                              </p>
                            )}
                          </div>

                          <div className="p-2 bg-stone-100/80 rounded-xl flex items-center justify-between text-xs font-mono">
                            <span className="text-stone-500 font-medium">Total Beban:</span>
                            <span className="font-black text-emerald-900">
                              Rp {totalAmt.toLocaleString('id-ID')}
                            </span>
                          </div>

                          {m.savedAt && (
                            <p className="text-[9px] font-mono text-stone-400">
                              Disimpan: {new Date(m.savedAt).toLocaleString('id-ID')}
                            </p>
                          )}
                        </div>

                        <div className="pt-2 border-t border-stone-200/80 flex items-center justify-between gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleLoadSavedMapping(m)}
                            className="bg-indigo-700 hover:bg-indigo-800 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-3xs cursor-pointer"
                            title="Buka dan muat pemetaan ini ke tabel verifikasi"
                          >
                            <Eye size={12} />
                            <span>Buka Pemetaan</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleBackupToGoogleDrive(m)}
                              className="p-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 rounded-xl transition cursor-pointer"
                              title="Cadangkan arsip pemetaan ini ke Google Drive"
                            >
                              <HardDrive size={13} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteSavedMapping(m.id, m.title)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl transition cursor-pointer"
                              title="Hapus riwayat pemetaan ini dari Cloud & Cache"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-900 animate-pulse">
            <RefreshCw size={18} className="animate-spin text-amber-600" />
            <span className="font-bold">{processMessage}</span>
          </div>
        )}
      </div>

      {/* Mapping & Verification Table Section */}
      {transactions.length > 0 && (
        <div id="accurate-mapped-table-section" className="bg-white border border-stone-250 rounded-3xl p-6 shadow-xs space-y-6">
          {/* Top Control Stats Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  Langkah 2: Verifikasi & Jurnal
                </span>

                {isAutoSaving ? (
                  <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1 animate-pulse">
                    <RefreshCw size={11} className="animate-spin" />
                    <span>Menyimpan ke Cloud...</span>
                  </span>
                ) : lastSavedTime ? (
                  <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                    <CheckCheck size={12} className="text-emerald-600" />
                    <span>Tersimpan di Cloud & Cache ({lastSavedTime})</span>
                  </span>
                ) : null}
              </div>

              <h3 className="font-sans font-black text-stone-900 text-lg flex items-center gap-2 pt-1">
                <span>{reportTitle}</span>
                <span className="text-xs font-mono font-bold text-stone-500">({transactions.length} Baris)</span>
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleSaveMappingToCloud}
                className="bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
                title="Simpan hasil pemetaan secara permanen ke Cloud Database & Cache Aplikasi"
              >
                <Save size={14} />
                <span>Simpan ke Cloud</span>
              </button>

              <button
                onClick={() => handleBackupToGoogleDrive()}
                className="bg-stone-800 hover:bg-stone-900 text-stone-100 font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
                title="Cadangkan berkas pemetaan ke Google Drive"
              >
                <HardDrive size={14} className="text-emerald-400" />
                <span>Cadangkan ke Drive</span>
              </button>

              <button
                onClick={handleExportAccurateExcel}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
                title="Download file Excel khusus siap impor ke Accurate Online/Desktop"
              >
                <Download size={14} />
                <span>Impor Accurate (.xlsx)</span>
              </button>

              <button
                onClick={handleCopyClipboard}
                className="bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 font-extrabold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
                title="Salin rekapitulasi ke clipboard"
              >
                <Copy size={13} />
                <span>Salin Teks</span>
              </button>

              <button
                onClick={handleExportPDF}
                className="bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 font-extrabold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
                title="Cetak Berita Acara / Laporan Pemetaan PDF"
              >
                <FileText size={13} />
                <span>PDF Laporan</span>
              </button>

              <button
                onClick={handleClearMapping}
                className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold px-3 py-2 rounded-xl text-xs transition flex items-center gap-1 cursor-pointer shadow-3xs"
                title="Bersihkan workspace pemetaan saat ini"
              >
                <Trash2 size={13} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Document Source Banner & Multi-Document Switcher */}
          {(activeDocumentUrl || activeCustodianName || activeSubmission) && (
            <div className="bg-emerald-50/90 border border-emerald-300 rounded-2xl p-4.5 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-700 text-white rounded-xl shadow-3xs">
                    <FileText size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs text-stone-900 tracking-wide uppercase">
                        Dokumen Sumber yang Dibaca (Petty Cash):
                      </span>
                      <span className="text-[10px] font-bold font-mono bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-300">
                        ✅ Terverifikasi
                      </span>
                    </div>
                    {activeDocumentName ? (
                      <p className="text-xs font-mono text-emerald-900 font-bold mt-0.5">
                        📄 Berkas LPJ: {activeDocumentName}
                      </p>
                    ) : (
                      <p className="text-xs font-mono text-stone-500 mt-0.5">
                        Sistem terhubung langsung dengan Voucher HO & Absensi NMSA
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeSubmission ? (
                    <button
                      type="button"
                      onClick={() => handleOpenVoucherModal(activeSubmission)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs transition flex items-center gap-2 shadow-2xs cursor-pointer"
                    >
                      <Eye size={15} />
                      <span>Buka Dokumen Preview</span>
                    </button>
                  ) : activeDocumentUrl ? (
                    <a
                      href={activeDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs transition flex items-center gap-2 shadow-2xs cursor-pointer"
                    >
                      <Eye size={15} />
                      <span>Buka Dokumen ({activeDocumentName || 'PDF'})</span>
                    </a>
                  ) : (
                    <span className="text-xs font-mono font-bold text-stone-500 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200">
                      📎 Belum ada link dokumen langsung
                    </span>
                  )}
                </div>
              </div>

              {/* Detailed Source Metadata Cards (Nomor Dokumen, Tanggal, Dibayarkan Kepada, Periode Petty Cash) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                {/* 1. Nomor Dokumen / Voucher */}
                <div className="bg-white/95 border border-emerald-200/90 rounded-xl p-2.5 space-y-0.5 shadow-3xs">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                    📋 Nomor Dokumen / Voucher
                  </span>
                  <span className="font-mono text-xs font-extrabold text-stone-900 truncate block" title={activeSubmission?.kode || reportTitle}>
                    {activeSubmission?.kode || (reportTitle.includes('BKK-') ? reportTitle.split(' - ')[0].replace('Laporan Petty Cash: ', '') : reportTitle)}
                  </span>
                </div>

                {/* 2. Tanggal Dokumen / Voucher */}
                <div className="bg-white/95 border border-emerald-200/90 rounded-xl p-2.5 space-y-0.5 shadow-3xs">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                    📅 Tanggal Dokumen
                  </span>
                  <span className="font-mono text-xs font-extrabold text-stone-900 block">
                    {formatIndonesianDate(activeSubmission?.tanggal) || '-'}
                  </span>
                </div>

                {/* 3. Dibayarkan Kepada */}
                <div className="bg-white/95 border border-emerald-200/90 rounded-xl p-2.5 space-y-0.5 shadow-3xs">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                    👤 Dibayarkan Kepada
                  </span>
                  <span className="font-mono text-xs font-extrabold text-emerald-950 truncate block" title={activeCustodianName || activeSubmission?.dibayarkanKepada || 'Petty Cash'}>
                    {activeCustodianName || activeSubmission?.dibayarkanKepada || activeSubmission?.pettyCashCustodian || 'Petty Cash Lapangan'}
                  </span>
                </div>

                {/* 4. Periode Tanggal Petty Cash */}
                <div className="bg-white/95 border border-emerald-200/90 rounded-xl p-2.5 space-y-0.5 shadow-3xs">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                    🗓️ Periode Tanggal Petty Cash
                  </span>
                  <span className="font-mono text-xs font-black text-amber-900 block truncate" title={calculatePettyCashPeriod(transactions, activeSubmission, period)}>
                    {calculatePettyCashPeriod(transactions, activeSubmission, period)}
                  </span>
                </div>
              </div>

              {/* Financial Summary Comparison Banner (Submisi Voucher vs Realisasi LPJ) */}
              {activeSubmission && (
                <div className="bg-white/90 border border-emerald-300/80 rounded-xl p-2.5 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                  <div className="flex items-center gap-3">
                    <span className="text-stone-600">
                      Total Submisi Voucher: <strong className="text-stone-900">Rp {(activeSubmission.items?.reduce((s, i) => s + (Number(i.total) || 0), 0) || 0).toLocaleString('id-ID')}</strong>
                    </span>
                    <span className="text-stone-300">•</span>
                    <span className="text-emerald-950 font-bold">
                      Total Realisasi Pengeluaran: <strong className="text-emerald-900">Rp {totalExpense.toLocaleString('id-ID')}</strong> ({transactions.length} Baris)
                    </span>
                  </div>
                  {(() => {
                    const subTotal = activeSubmission.items?.reduce((s, i) => s + (Number(i.total) || 0), 0) || 0;
                    const diff = totalExpense - subTotal;
                    if (diff === 0) {
                      return (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md border border-emerald-300">
                          ✅ Nominal Sesuai (Rp 0 Selisih)
                        </span>
                      );
                    } else if (diff > 0) {
                      return (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-950 px-2 py-0.5 rounded-md border border-amber-300">
                          ⚠️ Realisasi Melebihi Submisi (+Rp {diff.toLocaleString('id-ID')})
                        </span>
                      );
                    } else {
                      return (
                        <span className="text-[10px] font-bold bg-sky-100 text-sky-950 px-2 py-0.5 rounded-md border border-sky-300">
                          ℹ️ Sisa Saldo Kas (+Rp {Math.abs(diff).toLocaleString('id-ID')})
                        </span>
                      );
                    }
                  })()}
                </div>
              )}

              {/* Multi-Document Switcher if activeSubmission has multiple uploaded attachments */}
              {activeSubmission && (() => {
                const subDocs = getSubmissionDocuments(activeSubmission);
                if (subDocs.length > 1) {
                  return (
                    <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[11px] font-mono font-bold text-emerald-900 flex items-center gap-1">
                        <span>📑</span>
                        <span>Pilih Dokumen Lampiran Lain untuk Dibaca AI:</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {subDocs.map((doc) => {
                          const isActive = activeDocumentUrl === doc.url || activeDocumentName === doc.fileName;
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => handleLoadVoucherSubmission(activeSubmission, doc.url, doc.fileName)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition flex items-center gap-1 cursor-pointer truncate max-w-[200px] ${
                                isActive
                                  ? 'bg-emerald-800 text-white shadow-3xs'
                                  : 'bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                              }`}
                              title={`Petakan transaksi dari berkas "${doc.fileName}"`}
                            >
                              <Sparkles size={11} className={isActive ? 'text-amber-300' : 'text-emerald-600'} />
                              <span className="truncate">{doc.fileName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Quick Stat Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5">
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">Total Pengeluaran:</span>
              <span className="text-base sm:text-lg font-black text-stone-900 font-mono">
                Rp {totalExpense.toLocaleString('id-ID')}
              </span>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5">
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">Akun Kas (Kredit):</span>
              <span className="text-xs sm:text-sm font-bold text-emerald-700 font-mono truncate block" title={kasAccount.name}>
                [{kasAccount.code}] {kasAccount.name}
              </span>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5">
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">Akun Terpakai:</span>
              <span className="text-base sm:text-lg font-black text-indigo-700 font-mono">
                {groupedSummary.length} Akun COA
              </span>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5">
              <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">Status Jurnal:</span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 font-mono mt-0.5">
                <CheckCircle2 size={14} />
                SEIMBANG (Balanced)
              </span>
            </div>
          </div>

          {/* Grouped Account Summary Cards (Accordion style) */}
          <div className="space-y-3 pt-2">
            <h4 className="font-sans font-bold text-stone-900 text-sm flex items-center gap-2">
              <BookOpen size={16} className="text-emerald-600" />
              <span>Pengelompokan per Akun Accurate (Siap Input ke Accurate):</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groupedSummary.map((group) => {
                const percentage = totalExpense > 0 ? ((group.totalAmount / totalExpense) * 100).toFixed(1) : '0';
                return (
                  <div 
                    key={group.accountCode} 
                    onClick={() => {
                      setSelectedGroupCode(group.accountCode);
                      setGroupSearchTerm('');
                      setBulkMoveTargetCode('');
                    }}
                    className="border border-stone-250 hover:border-emerald-500 bg-stone-50/50 hover:bg-white rounded-2xl p-4 space-y-2.5 transition-all cursor-pointer shadow-3xs hover:shadow-md group/card relative"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-stone-200 pb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-250 px-2 py-0.5 rounded uppercase">
                            Kode {group.accountCode}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-amber-50 group-hover/card:bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full transition flex items-center gap-1">
                            <Eye size={11} className="text-amber-700" />
                            <span>Detail & Pindah ({group.items.length})</span>
                          </span>
                        </div>
                        <h5 className="font-bold text-stone-900 text-xs sm:text-sm">
                          {group.accountName}
                        </h5>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-stone-900 text-sm sm:text-base block">
                          Rp {group.totalAmount.toLocaleString('id-ID')}
                        </span>
                        <span className="text-[10px] font-mono text-stone-500">
                          {group.items.length} transaksi ({percentage}%)
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-emerald-600 h-full rounded-full transition-all duration-300" 
                        style={{ width: `${Math.min(100, parseFloat(percentage))}%` }} 
                      />
                    </div>

                    {/* Quick Item Previews */}
                    <div className="space-y-1 pt-1 max-h-36 overflow-y-auto">
                      {group.items.map((it, idx) => (
                        <div 
                          key={it.id || idx} 
                          className="flex items-center justify-between gap-2 text-[11px] font-mono text-stone-600 hover:bg-stone-100 p-1 rounded-lg transition"
                        >
                          <span className="truncate flex-1 font-medium text-stone-800" title={it.description}>
                            • {it.description}
                          </span>

                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <span className="font-bold text-stone-900">
                              Rp {it.amount.toLocaleString('id-ID')}
                            </span>
                            
                            <select
                              value={it.accurateAccountCode}
                              onChange={(e) => handleAccountChange(it.id, e.target.value)}
                              className="text-[10px] bg-white border border-stone-300 rounded-md px-1.5 py-0.5 font-mono cursor-pointer hover:border-emerald-500 text-stone-700 max-w-[120px] truncate focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              title="Pindahkan transaksi ini ke akun lain secara langsung"
                            >
                              {accounts.map((acc) => (
                                <option key={acc.code} value={acc.code}>
                                  [{acc.code}] {acc.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1 text-[10px] font-mono text-stone-400 text-center border-t border-stone-200/60 group-hover/card:text-emerald-700 transition font-bold flex items-center justify-center gap-1">
                      <ArrowLeftRight size={11} />
                      <span>Klik kotak ini untuk membuka Rincian Lanjutan & Pemindahan Massal</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Detailed Mapping Table */}
          <div id="accurate-mapped-table-section" className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="font-sans font-bold text-stone-900 text-sm flex items-center gap-2">
                <Edit2 size={16} className="text-amber-600" />
                <span>Rincian Baris Transaksi & Pengubahan Akun Accurate:</span>
              </h4>

              <button
                onClick={handleAddRow}
                className="bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 font-bold px-3 py-1.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Tambah Baris</span>
              </button>
            </div>

            <div className="border border-stone-250 rounded-2xl overflow-x-auto shadow-3xs">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-stone-900 text-white text-[11px] font-bold">
                    <th className="p-2.5 text-center w-10">No</th>
                    <th className="p-2.5 w-28">Tanggal</th>
                    <th className="p-2.5">Keterangan / Rincian Pengeluaran</th>
                    <th className="p-2.5 w-28">Penerima</th>
                    <th className="p-2.5 w-32 text-right">Nominal (Rp)</th>
                    <th className="p-2.5 w-64">Kode & Nama Akun Accurate</th>
                    <th className="p-2.5 text-center w-24">Status</th>
                    <th className="p-2.5 text-center w-12">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {transactions.map((t, idx) => (
                    <tr key={t.id} className="hover:bg-amber-50/40 transition">
                      <td className="p-2 text-center text-stone-500 font-bold">
                        {idx + 1}
                      </td>

                      <td className="p-2">
                        <input
                          type="text"
                          value={t.date}
                          onChange={(e) => handleUpdateTransaction(t.id, 'date', e.target.value)}
                          className="w-full bg-white border border-stone-250 rounded-lg px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="text"
                          value={t.description}
                          onChange={(e) => handleUpdateTransaction(t.id, 'description', e.target.value)}
                          className="w-full bg-white border border-stone-250 rounded-lg px-2 py-1 text-xs font-mono font-bold text-stone-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="text"
                          value={t.recipient || ''}
                          onChange={(e) => handleUpdateTransaction(t.id, 'recipient', e.target.value)}
                          placeholder="Penerima"
                          className="w-full bg-white border border-stone-250 rounded-lg px-2 py-1 text-xs font-mono text-stone-600 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={t.amount}
                          onChange={(e) => handleUpdateTransaction(t.id, 'amount', parseFloat(e.target.value) || 0)}
                          className="w-full text-right font-black text-stone-900 bg-white border border-stone-250 rounded-lg px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </td>

                      {/* Accurate Account Dropdown Selector */}
                      <td className="p-2">
                        <select
                          value={t.accurateAccountCode}
                          onChange={(e) => handleAccountChange(t.id, e.target.value)}
                          className="w-full bg-white border border-emerald-300 font-bold text-stone-900 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                        >
                          {accounts.map((acc) => (
                            <option key={acc.code} value={acc.code}>
                              [{acc.code}] {acc.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Confidence Badge */}
                      <td className="p-2 text-center">
                        {t.confidence === 'high' ? (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] font-black px-2 py-0.5 rounded-full uppercase" title="Otomatis terpetakan dengan sangat akurat">
                            100% Rule
                          </span>
                        ) : t.confidence === 'manual' ? (
                          <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-black px-2 py-0.5 rounded-full uppercase" title="Diubah/dipilih manual oleh pengguna">
                            Manual
                          </span>
                        ) : (
                          <span className="bg-sky-100 text-sky-800 border border-sky-300 text-[9px] font-black px-2 py-0.5 rounded-full uppercase" title="Terpetakan via AI">
                            AI Match
                          </span>
                        )}
                      </td>

                      <td className="p-2 text-center">
                        <button
                          onClick={() => handleDeleteRow(t.id)}
                          className="text-stone-400 hover:text-rose-600 transition cursor-pointer p-1 rounded hover:bg-rose-50"
                          title="Hapus baris ini"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Drawer: COA Manager */}
      {isCoaModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <div className="flex items-center gap-2 text-stone-900 font-sans font-black text-lg">
                <Settings className="text-amber-500" size={20} />
                <h3>Kelola Master Akun Accurate (Chart of Accounts)</h3>
              </div>
              <button
                onClick={() => setIsCoaModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 font-bold text-sm cursor-pointer px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Add / Edit Account Form */}
            <div className={`border p-4 rounded-2xl space-y-3 transition-colors ${editingCode ? 'bg-amber-50/70 border-amber-300' : 'bg-stone-50 border-stone-250'}`}>
              <h4 className="font-bold text-xs text-stone-900 uppercase font-mono tracking-wider flex items-center justify-between">
                <span>{editingCode ? `✏️ Edit Akun Accurate [${editingCode}]` : '+ Tambah Akun Accurate Baru'}</span>
                <span className="text-[10px] text-stone-500 font-normal">Kategori & Kata Kunci Otomatis</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-stone-500 uppercase font-bold block mb-1">
                    Kode Perkiraan:
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="Contoh: 600030"
                    className="w-full bg-white border border-stone-250 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-mono text-stone-500 uppercase font-bold block mb-1">
                    Nama Akun Accurate:
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Contoh: Beban Humas & CSR Site"
                    className="w-full bg-white border border-stone-250 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-stone-500 uppercase font-bold block mb-1">
                    Tipe Akun:
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-white border border-stone-250 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Kas & Bank">Kas & Bank</option>
                    <option value="Piutang Usaha">Piutang Usaha</option>
                    <option value="Persediaan">Persediaan</option>
                    <option value="Aset Lancar Lainnya">Aset Lancar Lainnya</option>
                    <option value="Aset Tetap">Aset Tetap</option>
                    <option value="Akumulasi Penyusutan">Akumulasi Penyusutan</option>
                    <option value="Utang Usaha">Utang Usaha</option>
                    <option value="Liabilitas Jangka Pendek">Liabilitas Jangka Pendek</option>
                    <option value="Liabilitas Jangka Panjang">Liabilitas Jangka Panjang</option>
                    <option value="Modal">Modal</option>
                    <option value="Pendapatan">Pendapatan</option>
                    <option value="Beban Pokok Penjualan">Beban Pokok Penjualan</option>
                    <option value="Beban Operasional">Beban Operasional</option>
                    <option value="Pendapatan Lainnya">Pendapatan Lainnya</option>
                    <option value="Beban Lainnya">Beban Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-stone-500 uppercase font-bold block mb-1">
                    Kata Kunci Auto-Mapping (Opsional):
                  </label>
                  <input
                    type="text"
                    value={newKeywords}
                    onChange={(e) => setNewKeywords(e.target.value)}
                    placeholder="Contoh: humas, csr, donasi, warga"
                    className="w-full bg-white border border-stone-250 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddCoaAccount}
                  disabled={!newCode.trim() || !newName.trim()}
                  className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
                >
                  {editingCode ? <Check size={14} /> : <Plus size={14} />}
                  <span>{editingCode ? 'Simpan Perubahan Akun' : 'Simpan Akun COA Baru'}</span>
                </button>

                {editingCode && (
                  <button
                    onClick={handleCancelEditCoa}
                    className="bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Batal Edit
                  </button>
                )}
              </div>
            </div>

            {/* List of Current Accounts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-stone-700 uppercase">
                  Daftar Akun Master COA ({accounts.length} Akun)
                </span>

                <div className="relative w-48">
                  <input
                    type="text"
                    value={searchTermCoa}
                    onChange={(e) => setSearchTermCoa(e.target.value)}
                    placeholder="Cari kode/nama..."
                    className="w-full bg-stone-50 border border-stone-250 rounded-xl pl-7 pr-2 py-1 text-xs font-mono focus:outline-none"
                  />
                  <Search size={12} className="absolute left-2.5 top-2 text-stone-400" />
                </div>
              </div>

              <div className="border border-stone-250 rounded-2xl max-h-60 overflow-y-auto divide-y divide-stone-200">
                {filteredCoaAccounts.map((acc) => (
                  <div key={acc.code} className={`p-3 flex items-center justify-between gap-3 text-xs font-mono transition ${editingCode === acc.code ? 'bg-amber-100/60' : 'hover:bg-stone-50'}`}>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          {acc.code}
                        </span>
                        <span className="font-extrabold text-stone-900">{acc.name}</span>
                        <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded font-sans">
                          {acc.category}
                        </span>
                      </div>
                      {acc.keywords && acc.keywords.length > 0 && (
                        <span className="block text-[10px] text-stone-400 mt-0.5">
                          Keywords: {acc.keywords.join(', ')}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleStartEditCoa(acc)}
                        className="text-stone-400 hover:text-amber-600 transition cursor-pointer p-1.5 rounded-lg hover:bg-amber-100/80"
                        title="Edit akun ini"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteCoaAccount(acc.code)}
                        className="text-stone-400 hover:text-rose-600 transition cursor-pointer p-1.5 rounded-lg hover:bg-rose-100/80"
                        title="Hapus akun ini"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-stone-200">
              <button
                onClick={handleResetCoaToDefault}
                className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold px-3.5 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5"
                title="Kembalikan susunan COA ke standar lengkap sesuai laporan Accurate"
              >
                <RefreshCw size={13} />
                <span>Reset ke Standar COA Accurate</span>
              </button>

              <button
                onClick={() => setIsCoaModalOpen(false)}
                className="bg-stone-900 hover:bg-stone-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detail Rincian & Pemindahan Transaksi per Akun */}
      {selectedGroupCode && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 space-y-5 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-stone-200 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg">
                    Kode {selectedGroupCode}
                  </span>
                  <span className="text-xs font-mono font-bold bg-stone-100 text-stone-700 px-2.5 py-0.5 rounded-lg">
                    {activeGroup ? activeGroup.items.length : 0} Transaksi
                  </span>
                </div>
                <h3 className="font-bold text-stone-900 text-base sm:text-xl">
                  Rincian Detail Transaksi & Pemindahan: {activeGroup ? activeGroup.accountName : 'Akun Accurate'}
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  Total Nominal dalam Akun ini: <strong className="text-stone-900 text-sm">Rp {activeGroup ? activeGroup.totalAmount.toLocaleString('id-ID') : 0}</strong>
                </p>
              </div>

              <button
                onClick={() => setSelectedGroupCode(null)}
                className="text-stone-400 hover:text-stone-700 hover:bg-stone-100 p-2 rounded-2xl transition cursor-pointer"
                title="Tutup Modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Bulk Transfer Banner */}
            {activeGroup && activeGroup.items.length > 0 && (
              <div className="bg-amber-50/90 border border-amber-300 p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <ArrowLeftRight size={16} className="text-amber-700 shrink-0" />
                    <span>Pindahkan SELURUH ({activeGroup.items.length}) transaksi dari akun ini sekaligus:</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={bulkMoveTargetCode}
                      onChange={(e) => setBulkMoveTargetCode(e.target.value)}
                      className="bg-white border border-amber-300 font-bold text-stone-900 rounded-xl px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">-- Pilih Akun Accurate Tujuan --</option>
                      {accounts.filter(a => a.code !== selectedGroupCode).map((acc) => (
                        <option key={acc.code} value={acc.code}>
                          [{acc.code}] {acc.name}
                        </option>
                      ))}
                    </select>

                    <button
                      disabled={!bulkMoveTargetCode}
                      onClick={() => {
                        handleBulkMoveGroup(selectedGroupCode, bulkMoveTargetCode);
                        setBulkMoveTargetCode('');
                      }}
                      className="bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-bold px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-3xs flex items-center gap-1.5"
                    >
                      <Check size={14} />
                      <span>Pindahkan Semua</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Search Filter for Transactions in Group */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
                <input
                  type="text"
                  value={groupSearchTerm}
                  onChange={(e) => setGroupSearchTerm(e.target.value)}
                  placeholder="Cari transaksi dalam akun ini..."
                  className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-250 rounded-xl text-xs font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <span className="text-[11px] font-mono text-stone-500">
                Pilih opsi pada kolom <strong>"Pindahkan Ke Akun Accurate"</strong> untuk memindahkan per item.
              </span>
            </div>

            {/* Transaction Items Table */}
            <div className="border border-stone-250 rounded-2xl overflow-x-auto max-h-96 shadow-3xs">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-stone-900 text-white text-[11px] font-bold sticky top-0 z-10">
                    <th className="p-2.5 text-center w-10">No</th>
                    <th className="p-2.5 w-28">Tanggal</th>
                    <th className="p-2.5">Keterangan / Detail Pengeluaran</th>
                    <th className="p-2.5 w-28">Penerima</th>
                    <th className="p-2.5 w-32 text-right">Nominal (Rp)</th>
                    <th className="p-2.5 w-64">Pindahkan Ke Akun Accurate</th>
                    <th className="p-2.5 text-center w-12">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {(!activeGroup || activeGroup.items.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-stone-400 font-mono">
                        Tidak ada transaksi di dalam kelompok akun ini. Semuanya telah dipindahkan ke akun lain!
                      </td>
                    </tr>
                  ) : (
                    activeGroup.items
                      .filter(it => !groupSearchTerm || it.description.toLowerCase().includes(groupSearchTerm.toLowerCase()) || (it.recipient && it.recipient.toLowerCase().includes(groupSearchTerm.toLowerCase())))
                      .map((t, idx) => (
                        <tr key={t.id} className="hover:bg-amber-50/50 transition">
                          <td className="p-2.5 text-center text-stone-500 font-bold">
                            {idx + 1}
                          </td>

                          <td className="p-2.5 text-stone-700">
                            {t.date}
                          </td>

                          <td className="p-2.5 font-bold text-stone-900">
                            {t.description}
                          </td>

                          <td className="p-2.5 text-stone-600">
                            {t.recipient || '-'}
                          </td>

                          <td className="p-2.5 text-right font-black text-stone-900">
                            Rp {t.amount.toLocaleString('id-ID')}
                          </td>

                          {/* Reclassify Dropdown */}
                          <td className="p-2.5">
                            <select
                              value={t.accurateAccountCode}
                              onChange={(e) => handleAccountChange(t.id, e.target.value)}
                              className="w-full bg-white border border-emerald-400 font-bold text-stone-900 rounded-lg px-2 py-1.5 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer shadow-3xs"
                            >
                              {accounts.map((acc) => (
                                <option key={acc.code} value={acc.code}>
                                  [{acc.code}] {acc.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="p-2.5 text-center">
                            <button
                              onClick={() => handleDeleteRow(t.id)}
                              className="text-stone-400 hover:text-rose-600 transition cursor-pointer p-1 rounded hover:bg-rose-50"
                              title="Hapus baris transaksi ini"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-stone-200">
              <span className="text-xs text-stone-500 font-mono">
                Perubahan akun langsung memperbarui rekap Pemetaan Accurate secara real-time.
              </span>

              <button
                onClick={() => setSelectedGroupCode(null)}
                className="bg-stone-900 hover:bg-stone-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* In-App Interactive Document & Voucher Detail Modal */}
      {isVoucherModalOpen && selectedVoucherForModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 via-stone-850 to-emerald-950 text-white flex items-center justify-between border-b border-stone-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-700/80 text-white rounded-2xl border border-emerald-500/30">
                  <FileText size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                      {selectedVoucherForModal.kode}
                    </span>
                    <span className="text-xs font-extrabold text-stone-200">
                      Detail Voucher & Pratinjau Dokumen Petty Cash
                    </span>
                  </div>
                  <p className="text-xs text-stone-300 font-mono mt-0.5">
                    Pemegang Kas: <strong className="text-emerald-300">{selectedVoucherForModal.pettyCashCustodian || selectedVoucherForModal.dibayarkanKepada || 'Petty Cash'}</strong> • Tanggal: {selectedVoucherForModal.tanggal}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsVoucherModalOpen(false)}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-2xl transition cursor-pointer"
                title="Tutup Pratinjau Dokumen"
              >
                <X size={20} />
              </button>
            </div>

            {/* Document Selector & Action Sub-Header */}
            {(() => {
              const docs = getSubmissionDocuments(selectedVoucherForModal);
              const currentDoc = docs[selectedDocIndex] || docs[0];

              return (
                <div className="flex flex-col flex-1 overflow-hidden">
                  <div className="bg-stone-100/90 border-b border-stone-250 px-4 py-3 flex items-center justify-between flex-wrap gap-3 shrink-0">
                    {/* Left Document Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 sm:pb-0">
                      {docs.length === 0 ? (
                        <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                          <AlertCircle size={13} className="text-amber-600 shrink-0" />
                          <span>Belum ada berkas fisik terlampir</span>
                        </span>
                      ) : (
                        docs.map((doc, idx) => (
                          <button
                            key={doc.id}
                            onClick={() => setSelectedDocIndex(idx)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                              selectedDocIndex === idx
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : 'bg-white hover:bg-stone-200 text-stone-700 border border-stone-250'
                            }`}
                          >
                            <span>{doc.label}</span>
                          </button>
                        ))
                      )}
                    </div>

                    {/* Right Action Bar */}
                    <div className="flex items-center gap-2">
                      {/* Upload Document / LPJ Button */}
                      <label 
                        className={`bg-white hover:bg-stone-50 border border-emerald-400 text-emerald-900 font-extrabold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-3xs ${isUploadingModalDoc ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Unggah berkas LPJ, nota, atau invoice fisik baru untuk voucher ini"
                      >
                        <Upload size={14} className="text-emerald-700" />
                        <span>{docs.length === 0 ? 'Upload Dokumen LPJ' : '+ Tambah Lampiran'}</span>
                        <input
                          type="file"
                          accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"
                          className="hidden"
                          disabled={isUploadingModalDoc}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleUploadDocumentToVoucher(selectedVoucherForModal, e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => handleMapFromModal(selectedVoucherForModal)}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
                        title="Otomatis petakan rincian transaksi dokumen ini ke Akun COA Accurate"
                      >
                        <Sparkles size={16} className="text-amber-300 animate-pulse" />
                        <span>Petakan Akun Accurate pada File Ini</span>
                      </button>

                      {currentDoc?.url && (
                        <a
                          href={currentDoc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                          title="Buka dokumen di tab browser terpisah"
                        >
                          <ExternalLink size={14} />
                          <span className="hidden sm:inline">Buka Tab Baru</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Modal Body: Voucher Summary Sidebar + Embedded Viewer */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-stone-100">
                    
                    {/* Left Column: Voucher Items Summary (4 cols) */}
                    <div className="md:col-span-4 p-4 border-r border-stone-250 bg-white overflow-y-auto space-y-3.5">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-1.5">
                        <span className="text-[10px] font-mono font-bold text-emerald-800 uppercase tracking-wider block">
                          Total Nominal Voucher
                        </span>
                        <p className="font-mono text-lg font-black text-emerald-950">
                          Rp {selectedVoucherForModal.items?.reduce((s, it) => s + (Number(it.total) || 0), 0).toLocaleString('id-ID')}
                        </p>
                        {selectedVoucherForModal.notes && (
                          <p className="text-xs text-stone-600 mt-1 italic border-t border-emerald-200/60 pt-1.5">
                            "{selectedVoucherForModal.notes}"
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <h5 className="font-extrabold text-xs text-stone-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
                          <span>📋</span>
                          <span>Rincian Item Transaksi ({selectedVoucherForModal.items?.length || 0}):</span>
                        </h5>

                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {selectedVoucherForModal.items?.map((it, idx) => (
                            <div key={idx} className="bg-stone-50 border border-stone-200 p-2.5 rounded-xl space-y-1 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-stone-900 leading-snug">
                                  {idx + 1}. {it.item || 'Item Transaksi'}
                                </span>
                                <span className="font-mono font-bold text-emerald-800 text-[11px] shrink-0">
                                  Rp {Number(it.total || 0).toLocaleString('id-ID')}
                                </span>
                              </div>
                              {it.keterangan && (
                                <p className="text-[10px] text-stone-500 font-mono">
                                  Ket: {it.keterangan}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-stone-200">
                        <button
                          type="button"
                          onClick={() => handleMapFromModal(selectedVoucherForModal)}
                          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold py-2.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                        >
                          <Sparkles size={15} />
                          <span>⚡ Impor & Petakan ke Accurate</span>
                        </button>
                      </div>
                    </div>

                    {/* Right Column: Embedded In-App Document Previewer (8 cols) */}
                    <div className="md:col-span-8 p-3 bg-stone-900 flex flex-col justify-center items-center overflow-hidden relative min-h-[480px]">
                      {currentDoc?.url ? (
                        currentDoc.url.match(/\.(jpeg|jpg|gif|png|webp)/i) || currentDoc.url.startsWith('data:image/') ? (
                          <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
                            <img
                              src={currentDoc.url}
                              alt={currentDoc.fileName}
                              className="max-h-[520px] w-auto mx-auto object-contain rounded-2xl shadow-xl border border-stone-800"
                            />
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center relative rounded-2xl overflow-hidden">
                            <iframe
                              src={getEmbeddableUrl(currentDoc.url)}
                              className="w-full h-[540px] rounded-2xl border border-stone-800 shadow-xl bg-white"
                              title={currentDoc.fileName}
                            />
                          </div>
                        )
                      ) : (
                        /* Interactive Upload Dropzone when no document is uploaded */
                        <div className="w-full max-w-lg p-6 sm:p-8 bg-stone-850 border-2 border-dashed border-stone-700 hover:border-emerald-500/80 rounded-3xl text-center space-y-4 transition-all duration-200 shadow-2xl">
                          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                            <Upload size={30} className={isUploadingModalDoc ? "animate-bounce" : ""} />
                          </div>

                          <div className="space-y-1.5">
                            <h4 className="text-sm font-extrabold text-white">
                              Unggah Dokumen Pertanggungjawaban / LPJ Petty Cash
                            </h4>
                            <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
                              Dokumen pertanggungjawaban fisik untuk voucher ini belum diunggah atau masih kosong. Silakan unggah berkas LPJ, nota, atau invoice fisik agar dapat langsung dipratinjau & dipetakan secara otomatis.
                            </p>
                          </div>

                          {/* Connected Google Drive indicator */}
                          {driveAccount?.email ? (
                            <div className="flex items-center justify-center gap-2 text-[11px] text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 rounded-xl px-3 py-1.5 w-fit mx-auto">
                              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                              <span>Tersimpan ke Google Drive:</span>
                              <span className="font-bold text-white font-mono">{driveAccount.email}</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2 text-[11px] text-amber-300 bg-amber-950/60 border border-amber-500/30 rounded-xl px-3 py-1.5 w-fit mx-auto">
                              <span>⚠️ Google Drive belum terhubung</span>
                              <button 
                                type="button" 
                                onClick={handleConnectGoogleDrive}
                                className="underline font-bold text-white hover:text-amber-200 cursor-pointer ml-1"
                              >
                                Hubungkan Sekarang
                              </button>
                            </div>
                          )}

                          {/* Upload Progress Notification */}
                          {isUploadingModalDoc && (
                            <div className="p-3 bg-emerald-950/90 border border-emerald-500/40 rounded-2xl space-y-2 text-left animate-in fade-in">
                              <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                                <span className="flex items-center gap-2">
                                  <RefreshCw size={14} className="animate-spin text-emerald-400" />
                                  <span>{uploadModalProgress || 'Sedang memproses & mengunggah berkas...'}</span>
                                </span>
                              </div>
                              <div className="w-full bg-stone-800 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-emerald-400 h-1.5 rounded-full animate-pulse w-3/4"></div>
                              </div>
                            </div>
                          )}

                          {uploadModalError && (
                            <div className="p-3 bg-rose-950/90 border border-rose-500/40 rounded-2xl space-y-2 text-left">
                              <div className="flex items-center gap-2 text-xs font-semibold text-rose-200">
                                <AlertCircle size={16} className="text-rose-400 shrink-0" />
                                <span>{uploadModalError}</span>
                              </div>
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setUploadModalError('');
                                    setUploadModalProgress('Menghubungkan akun Google Drive...');
                                    try {
                                      const res = await googleDriveLogin();
                                      if (res?.accessToken) {
                                        setUploadModalSuccess(`Google Drive (${res.user?.email || 'Akun'}) berhasil terhubung! Silakan pilih berkas kembali.`);
                                      }
                                    } catch (err: any) {
                                      setUploadModalError(`Gagal menghubungkan Google Drive: ${err?.message || err}`);
                                    } finally {
                                      setUploadModalProgress('');
                                    }
                                  }}
                                  className="bg-rose-900/80 hover:bg-rose-800 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl border border-rose-400 flex items-center gap-1.5 cursor-pointer transition"
                                >
                                  <span>🔑 Hubungkan Google Drive Sekarang</span>
                                </button>
                              </div>
                            </div>
                          )}

                          {uploadModalSuccess && (
                            <div className="p-3 bg-emerald-950/90 border border-emerald-500/40 rounded-2xl flex items-center gap-2 text-xs font-semibold text-emerald-200 text-left">
                              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                              <span>{uploadModalSuccess}</span>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                            <label className={`w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition cursor-pointer ${isUploadingModalDoc ? 'opacity-50 cursor-not-allowed' : ''}`}>
                              <Upload size={15} />
                              <span>Pilih & Upload Dokumen Petty Cash</span>
                              <input
                                type="file"
                                accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"
                                className="hidden"
                                disabled={isUploadingModalDoc}
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handleUploadDocumentToVoucher(selectedVoucherForModal, e.target.files[0]);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => handleMapFromModal(selectedVoucherForModal)}
                              className="w-full sm:w-auto bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white font-bold px-4 py-2.5 rounded-2xl text-xs flex items-center justify-center gap-2 border border-stone-700 transition cursor-pointer"
                            >
                              <Sparkles size={14} className="text-amber-400" />
                              <span>Petakan Tanpa Berkas Fisik</span>
                            </button>
                          </div>

                          <p className="text-[10px] text-stone-500 font-mono">
                            Mendukung berkas: PDF, Excel (.xlsx / .xls), dan Gambar (JPG / PNG)
                          </p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      )}

      {/* PDF Print Options Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-800 to-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-2xl">
                  <FileText size={22} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-wide">Pilih Opsi Cetak PDF Rekap</h3>
                  <p className="text-xs text-stone-300">Pilih format laporan pemetaan Accurate sesuai kebutuhan Anda</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="p-1.5 hover:bg-white/10 text-stone-300 hover:text-white rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Option 1: PDF Standar (Flat List) */}
              <button
                type="button"
                onClick={handleExportPDFStandard}
                className="w-full text-left p-4 rounded-2xl border-2 border-stone-200 hover:border-emerald-500 bg-stone-50/50 hover:bg-emerald-50/40 transition group cursor-pointer flex items-start gap-3.5 shadow-xs"
              >
                <div className="p-3 bg-stone-200 group-hover:bg-emerald-600 text-stone-700 group-hover:text-white rounded-xl transition shrink-0 mt-0.5">
                  <FileText size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-stone-900 group-hover:text-emerald-950">
                      Opsi 1: PDF Format Standar
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-stone-200 group-hover:bg-emerald-200 text-stone-800 group-hover:text-emerald-900 rounded-md">
                      Format Utama
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                    Mencetak tabel ringkasan global akun di atas, diikuti oleh tabel seluruh rincian transaksi berurutan dalam satu daftar datar.
                  </p>
                </div>
              </button>

              {/* Option 2: PDF Berdasarkan Kategori & Disortir Waktu */}
              <button
                type="button"
                onClick={handleExportPDFGroupedByCategory}
                className="w-full text-left p-4 rounded-2xl border-2 border-emerald-300 hover:border-emerald-600 bg-emerald-50/60 hover:bg-emerald-100/50 transition group cursor-pointer flex items-start gap-3.5 shadow-xs"
              >
                <div className="p-3 bg-emerald-600 group-hover:bg-emerald-700 text-white rounded-xl transition shrink-0 mt-0.5 shadow-sm">
                  <Layers size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-emerald-950">
                      Opsi 2: PDF Berdasarkan Kategori (Urut Waktu)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded-md">
                      Rekomendasi Akuntansi
                    </span>
                  </div>
                  <p className="text-xs text-emerald-900/80 mt-1 leading-relaxed">
                    Mencetak transaksi yang <strong>dikelompokkan rapi per Kategori Akun Accurate</strong>, dengan rincian yang <strong>disortir kronologis berdasarkan waktu/tanggal</strong>, subtotal tiap kategori, serta tanda tangan resmi.
                  </p>
                </div>
              </button>
            </div>

            <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

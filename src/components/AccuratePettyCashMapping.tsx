import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileSpreadsheet, FileText, Upload, Sparkles, CheckCircle2, AlertCircle, 
  Copy, Download, RefreshCw, Plus, Trash2, Edit2, Check, ArrowRight, 
  Settings, BookOpen, Layers, ShieldCheck, Search, Filter, HelpCircle,
  FileCheck, DollarSign, ChevronDown, ChevronUp, Save, Eye, X, ArrowLeftRight, ExternalLink
} from 'lucide-react';
import { AccurateAccount, AccurateMappedTransaction, PettyCashReport, Submission } from '../types';
import { DEFAULT_ACCURATE_ACCOUNTS, autoMapTransactionToAccurate } from '../data/accurateCoaData';
import { isPettyCashSubmission, getPettyCashCustodian, sortSubmissionsDescending } from '../utils';
import { 
  saveAccurateMappingToFirestore, 
  loadAccurateMappingsFromFirestore,
  ensureValidDriveToken,
  googleDriveLogin,
  isFirebaseConfigured,
  saveSubmissionToFirestore,
  getActiveGoogleDriveAccount,
  getConnectedDrives
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

  // Selected Kas Account (Credit account for Petty Cash)
  const [selectedKasCode, setSelectedKasCode] = useState<string>('110102');

  // Input Mode state with session persistence ('voucher' is priority if submissions exist)
  const [activeTab, setActiveTabInternal] = useState<'voucher' | 'upload' | 'workspace' | 'text'>(() => {
    try {
      const saved = sessionStorage.getItem('accurate_active_tab');
      if (saved && ['voucher', 'upload', 'workspace', 'text'].includes(saved)) {
        return saved as any;
      }
    } catch (e) {}
    return submissions.length > 0 ? 'voucher' : 'upload';
  });

  const setActiveTab = (tab: 'voucher' | 'upload' | 'workspace' | 'text') => {
    setActiveTabInternal(tab);
    try { sessionStorage.setItem('accurate_active_tab', tab); } catch (e) {}
  };

  // Active Document & Custodian state
  const [activeDocumentUrl, setActiveDocumentUrl] = useState<string | null>(null);
  const [activeDocumentName, setActiveDocumentName] = useState<string | null>(null);
  const [activeCustodianName, setActiveCustodianName] = useState<string | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

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
  const getOrCreateFolder = async (token: string, folderName: string, parentId?: string): Promise<string> => {
    const queryParts = [
      `name = '${folderName.replace(/'/g, "\\'")}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      'trashed = false',
    ];
    if (parentId) {
      queryParts.push(`'${parentId}' in parents`);
    }
    const q = queryParts.join(' and ');
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
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
    if (!createRes.ok) {
      const errorText = await createRes.text();
      throw new Error(`Gagal membuat folder '${folderName}': ${errorText}`);
    }
    const folderData = await createRes.json();
    return folderData.id;
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
    token: string,
    fileName: string,
    fileMimeType: string,
    fileBlob: Blob,
    folderId: string
  ): Promise<{ url: string; name: string; fileId: string }> => {
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
        const uploadResult = await uploadFileToGoogleDrive(
          token,
          uploadName,
          file.type || 'application/pdf',
          file,
          targetFolderId
        );

        finalUrl = uploadResult.url;
        finalName = uploadResult.name;
      } else {
        // If file is > 400KB and Google Drive is not connected
        if (file.size > 400 * 1024) {
          throw new Error(`Ukuran berkas (${(file.size / 1024 / 1024).toFixed(2)} MB) melebihi batas simpan langsung dokumen database (maks 1 MB). Silakan klik hubungkan akun Google Drive agar berkas terunggah ke Cloud Drive secara otomatis.`);
        }

        // Small file offline/local base64 fallback (< 400KB)
        setUploadModalProgress('Menyimpan berkas secara lokal...');
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

  // Strictly filter submissions to only Petty Cash types (unified across all views)
  const pettyCashSubmissions = useMemo(() => {
    const list = submissions.filter(sub => isPettyCashSubmission(sub));
    return sortSubmissionsDescending(list);
  }, [submissions]);

  // Custodian & Search Filter States for Vouchers
  const [custodianFilter, setCustodianFilter] = useState<string>('All');
  const [voucherSearchQuery, setVoucherSearchQuery] = useState<string>('');

  // Collect unique available custodians
  const availableCustodians = useMemo(() => {
    const set = new Set<string>();
    pettyCashHolders.forEach(h => { if (h && h.trim()) set.add(h.trim()); });
    pettyCashSubmissions.forEach(sub => {
      const c = getPettyCashCustodian(sub);
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [pettyCashHolders, pettyCashSubmissions]);

  // Filtered petty cash submissions for tab 0
  const filteredPettyCashSubmissions = useMemo(() => {
    const list = pettyCashSubmissions.filter(sub => {
      if (custodianFilter !== 'All') {
        const c = getPettyCashCustodian(sub).toLowerCase();
        if (!c.includes(custodianFilter.toLowerCase())) return false;
      }
      if (voucherSearchQuery.trim()) {
        const q = voucherSearchQuery.toLowerCase();
        const text = [
          sub.kode || '',
          getPettyCashCustodian(sub),
          sub.pettyCashCustodian || '',
          sub.dibayarkanKepada || '',
          sub.jenisPengajuan || '',
          sub.notes || ''
        ].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
    return sortSubmissionsDescending(list);
  }, [pettyCashSubmissions, custodianFilter, voucherSearchQuery]);
  // Active Mapping Data
  const [reportTitle, setReportTitle] = useState<string>('Laporan Petty Cash');
  const [period, setPeriod] = useState<string>(new Date().toISOString().substring(0, 7));
  const [transactions, setTransactions] = useState<AccurateMappedTransaction[]>([]);
  
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
          const proxyRes = await fetch(`/api/drive-proxy?id=${fileId}`);
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

  // 2. Export PDF Mapping Summary
  const handleExportPDF = () => {
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
    doc.text(`Akun Kas / Kredit: [${kasAccount.code}] ${kasAccount.name}`, 14, 38);

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

    doc.save(`Laporan_Pemetaan_Accurate_${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
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
            {driveAccount?.email ? (
              <div className="bg-emerald-950/80 border border-emerald-400/40 text-emerald-300 font-bold px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Google Drive:</span>
                <span className="text-white font-mono">{driveAccount.email}</span>
                <button
                  type="button"
                  onClick={handleConnectGoogleDrive}
                  disabled={isDriveConnecting}
                  title="Ganti atau Sinkronkan Ulang Akun Google Drive"
                  className="hover:text-emerald-100 ml-1 underline cursor-pointer text-[11px]"
                >
                  {isDriveConnecting ? 'Sinkronisasi...' : 'Sinkronkan'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogleDrive}
                disabled={isDriveConnecting}
                className="bg-amber-600/90 hover:bg-amber-500 text-white font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-sm animate-pulse"
              >
                <RefreshCw size={14} className={isDriveConnecting ? "animate-spin" : ""} />
                <span>Hubungkan Google Drive</span>
              </button>
            )}

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <h3 className="font-sans font-black text-stone-900 text-base">
              1. Pilih Sumber File / Data Petty Cash
            </h3>
            <p className="text-stone-500 text-xs font-mono">
              Unggah berkas Excel, PDF nota, pilih dari workspace, atau tempelkan teks tabel transaksi.
            </p>
          </div>

          {/* Kas Account Selection */}
          <div className="flex items-center gap-2 bg-stone-50 border border-stone-250 px-3 py-1.5 rounded-2xl">
            <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">Akun Kas (Kredit):</span>
            <select
              value={selectedKasCode}
              onChange={(e) => setSelectedKasCode(e.target.value)}
              className="text-xs font-mono font-bold text-stone-900 bg-transparent border-none focus:outline-none cursor-pointer"
            >
              {accounts.filter(a => a.category === 'Kas & Bank' || a.code.startsWith('1-')).map(a => (
                <option key={a.code} value={a.code}>
                  [{a.code}] {a.name}
                </option>
              ))}
            </select>
          </div>
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
        </div>

        {/* Tab Content 0: Voucher HO Submissions (Filtered strictly to Petty Cash) */}
        {activeTab === 'voucher' && (
          <div className="space-y-4">
            <div className="bg-emerald-50/80 border border-emerald-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Sparkles size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-950 leading-relaxed font-sans">
                  <strong>Terfilter Khusus Voucher / Laporan Petty Cash:</strong> Menampilkan pengajuan berjenis Petty Cash (misal: Laporan Petty Cash Suryo Pranoto, Petty Cash HO, dll). Rincian item transaksi beserta <strong>link dokumen/nota terlampir</strong> otomatis terserap untuk dipetakan ke COA Accurate.
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
                  onChange={(e) => setCustodianFilter(e.target.value)}
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
                  const itemsCount = sub.items?.length || 0;
                  const totalAmt = sub.items?.reduce((acc, it) => acc + (Number(it.total) || 0), 0) || 0;
                  const custodian = sub.pettyCashCustodian || sub.dibayarkanKepada || 'Petty Cash';
                  const lpjDocs = getSubmissionDocuments(sub);
                  const primaryLpj = lpjDocs[0] || null;
                  const docUrl = primaryLpj?.url;
                  const docName = primaryLpj?.fileName;

                  return (
                    <div 
                      key={sub.id} 
                      className="bg-stone-50 hover:bg-emerald-50/60 border border-stone-250 hover:border-emerald-400 rounded-2xl p-4 transition shadow-xs flex flex-col justify-between space-y-3 cursor-pointer group"
                      onClick={() => handleOpenVoucherModal(sub)}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-stone-900 group-hover:text-emerald-800">
                            {sub.kode}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-0.5 rounded-full">
                            Petty Cash
                          </span>
                        </div>

                        <div>
                          <p className="text-xs font-extrabold text-stone-900 flex items-center gap-1.5">
                            <span>👤</span>
                            <span>{custodian}</span>
                          </p>
                          <p className="text-[11px] text-stone-500 font-mono mt-0.5">
                            📅 {sub.tanggal} • 📋 {itemsCount} Item Transaksi
                          </p>
                        </div>

                        {/* Document Link Badges & Selection */}
                        {lpjDocs.length > 0 ? (
                          <div className="pt-1 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md border border-emerald-300">
                                📎 {lpjDocs.length} Lampiran Terunggah
                              </span>
                              <span className="text-[9px] font-mono text-stone-400">
                                F1/F2 Otomatis Diabaikan
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                              {lpjDocs.map((doc, dIdx) => (
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
                          <div className="pt-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                                <AlertCircle size={10} className="text-amber-600 shrink-0" />
                                <span>Belum ada berkas fisik</span>
                              </span>
                              <span className="text-[9px] font-mono text-stone-400">
                                F1/F2 Diabaikan
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-stone-400 italic">
                              Klik tombol Upload LPJ di bawah untuk melampirkan berkas
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-stone-200/80 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-stone-400 font-mono uppercase">Total Submisi</p>
                          <p className="font-mono text-xs font-extrabold text-stone-900">
                            Rp {totalAmt.toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {lpjDocs.length === 0 ? (
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
                              className="bg-stone-200 hover:bg-stone-300 text-stone-800 px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
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
        <div className="bg-white border border-stone-250 rounded-3xl p-6 shadow-xs space-y-6">
          {/* Top Control Stats Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 pb-5">
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                Langkah 2: Verifikasi & Jurnal
              </span>
              <h3 className="font-sans font-black text-stone-900 text-lg flex items-center gap-2 pt-1">
                <span>{reportTitle}</span>
                <span className="text-xs font-mono font-bold text-stone-500">({transactions.length} Baris)</span>
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSaveMappingToCloud}
                className="bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer shadow-3xs"
                title="Simpan hasil pemetaan ke Cloud / Aplikasi agar tidak hilang saat restart/update"
              >
                <Save size={15} />
                <span>Simpan ke Cloud / Aplikasi</span>
              </button>

              <button
                onClick={handleExportAccurateExcel}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer shadow-3xs"
                title="Download file Excel khusus siap impor ke Accurate Online/Desktop"
              >
                <Download size={15} />
                <span>Download Impor Accurate (.xlsx)</span>
              </button>

              <button
                onClick={handleCopyClipboard}
                className="bg-stone-900 hover:bg-stone-800 text-white font-extrabold px-3.5 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
                title="Salin rekapitulasi ke clipboard"
              >
                <Copy size={14} />
                <span>Salin Teks</span>
              </button>

              <button
                onClick={handleExportPDF}
                className="bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 font-extrabold px-3.5 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
                title="Cetak Berita Acara / Laporan Pemetaan PDF"
              >
                <FileText size={14} />
                <span>PDF Laporan</span>
              </button>
            </div>
          </div>

          {/* Document Source Banner & Multi-Document Switcher */}
          {(activeDocumentUrl || activeCustodianName) && (
            <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <FileText size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-xs text-stone-900">
                        Dokumen Sumber yang Dibaca:
                      </span>
                      {activeCustodianName && (
                        <span className="text-[11px] font-bold font-mono bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md border border-emerald-300">
                          👤 Pemegang: {activeCustodianName}
                        </span>
                      )}
                    </div>
                    {activeDocumentName ? (
                      <p className="text-xs font-mono text-emerald-800 font-bold mt-0.5">
                        📄 Berkas Aktif: {activeDocumentName}
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
    </div>
  );
}

import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Briefcase, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, 
  Download, RefreshCw, Search, Filter, HelpCircle, 
  ChevronDown, ChevronUp, Layers, Check, ExternalLink,
  DollarSign, ShieldCheck, Tag, Info, UserCheck, Sparkles,
  Upload, Trash2, Edit2, Plus, Settings, Copy, Eye, ArrowRight,
  FolderOpen, Calendar, MapPin, CheckSquare, X,
  MoreVertical, SlidersHorizontal, PlusCircle, ArrowUp, ArrowDown,
  ListOrdered
} from 'lucide-react';
import { Submission, SubmissionItem } from '../types';
import { 
  SPPD_POSITIONS, 
  SPPD_RATE_GUIDELINES, 
  SppdPositionKey, 
  SppdRateGuidelineItem,
  matchSppdItemToGuideline,
  detectSppdPositionKey
} from '../data/sppdRateGuidelines';
import { formatRupiah, isSppdSubmission, getSppdEmployeeName } from '../utils';
import { 
  getStoredGoogleDriveToken, 
  ensureValidDriveToken, 
  googleDriveLogin, 
  getConnectedDrives,
  saveSppdRecordsToFirestore
} from '../firebase';
import { SPPDRecord } from './SppdManager';
import { consolidateSppdCostItems } from './PrintSppdDocument';

interface SppdAccountMappingProps {
  submissions?: Submission[];
  userProfile?: any;
  onSelectSubmissionForView?: (sub: Submission) => void;
  onOpenSppdForm?: () => void;
}

interface CachedSppdMapping {
  reportTitle: string;
  period: string;
  employeeName: string;
  employeePosition: SppdPositionKey;
  destination: string;
  activeDocumentName: string;
  activeDocumentUrl: string;
  transactions: SppdMappedTransaction[];
  updatedAt: string;
}

const getInitialCachedSppdMapping = (): CachedSppdMapping | null => {
  try {
    const raw = localStorage.getItem('sppd_active_mapping_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load cached SPPD mapping:', e);
  }
  return null;
};

export interface SppdMappedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  recipient: string;
  positionKey: SppdPositionKey;
  sppdAccountCode: string;
  sppdAccountName: string;
  guidelineId: string;
  category: string;
  confidence: 'high' | 'medium' | 'low' | 'manual';
  notes?: string;
}

export function SppdAccountMapping({
  submissions = [],
  userProfile,
  onSelectSubmissionForView,
  onOpenSppdForm
}: SppdAccountMappingProps) {
  // Master Guidelines state with custom keywords persistence
  const [guidelines, setGuidelines] = useState<SppdRateGuidelineItem[]>(() => {
    try {
      const saved = localStorage.getItem('sppd_coa_master_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return SPPD_RATE_GUIDELINES;
  });

  const cachedInitial = useMemo(() => getInitialCachedSppdMapping(), []);

  // Source Tab selection: 'voucher' | 'upload' | 'text'
  const [activeSourceTab, setActiveSourceTab] = useState<'voucher' | 'upload' | 'text'>('voucher');

  // Transactions list currently mapped (restored from browser cache if available)
  const [transactions, setTransactions] = useState<SppdMappedTransaction[]>(() => cachedInitial?.transactions || []);
  const [reportTitle, setReportTitle] = useState<string>(() => cachedInitial?.reportTitle || 'Laporan Biaya Perjalanan Dinas (SPPD)');
  const [period, setPeriod] = useState<string>(() => cachedInitial?.period || new Date().toISOString().substring(0, 7));
  const [employeeName, setEmployeeName] = useState<string>(() => cachedInitial?.employeeName || '');
  const [employeePosition, setEmployeePosition] = useState<SppdPositionKey>(() => cachedInitial?.employeePosition || 'staf');
  const [destination, setDestination] = useState<string>(() => cachedInitial?.destination || 'Site / Proyek');

  // Active document context
  const [activeDocumentName, setActiveDocumentName] = useState<string>(() => cachedInitial?.activeDocumentName || '');
  const [activeDocumentUrl, setActiveDocumentUrl] = useState<string>(() => cachedInitial?.activeDocumentUrl || '');
  const [rawTextInput, setRawTextInput] = useState<string>('');

  // Auto-save mapped SPPD transactions to browser storage
  useEffect(() => {
    if (transactions.length > 0) {
      try {
        const payload: CachedSppdMapping = {
          reportTitle,
          period,
          employeeName,
          employeePosition,
          destination,
          activeDocumentName,
          activeDocumentUrl,
          transactions,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem('sppd_active_mapping_v2', JSON.stringify(payload));
      } catch (e) {
        console.error('Failed to cache SPPD mapping:', e);
      }
    }
  }, [transactions, reportTitle, period, employeeName, employeePosition, destination, activeDocumentName, activeDocumentUrl]);

  // Handler to clear active SPPD mapping and reset
  const handleClearSppdMapping = () => {
    if (window.confirm('Bersihkan hasil pemetaan SPPD saat ini dan mulai pemetaan baru?')) {
      setTransactions([]);
      setReportTitle('Laporan Biaya Perjalanan Dinas (SPPD)');
      setEmployeeName('');
      setActiveDocumentName('');
      setActiveDocumentUrl('');
      localStorage.removeItem('sppd_active_mapping_v2');
      setSuccessMessage('Hasil pemetaan SPPD berhasil dibersihkan.');
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  // Processing & UI States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processMessage, setProcessMessage] = useState<string>('Menganalisis Dokumen SPPD...');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Google Drive state (using unified master account)
  const [driveAccount, setDriveAccount] = useState<{ email: string } | null>(null);
  const [isDriveConnecting, setIsDriveConnecting] = useState<boolean>(false);

  // Master COA & Keywords Modal
  const [isCoaModalOpen, setIsCoaModalOpen] = useState<boolean>(false);
  const [editingGuidelineId, setEditingGuidelineId] = useState<string | null>(null);
  const [tempKeywords, setTempKeywords] = useState<string>('');
  const [tempAccountName, setTempAccountName] = useState<string>('');
  const [searchTermCoa, setSearchTermCoa] = useState<string>('');

  // Manual Transaction Editing Modal
  const [editingTransaction, setEditingTransaction] = useState<SppdMappedTransaction | null>(null);
  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState<boolean>(false);

  // Add Manual Transaction Modal
  const [isAddTxModalOpen, setIsAddTxModalOpen] = useState<boolean>(false);
  const [newManualTx, setNewManualTx] = useState<Partial<SppdMappedTransaction>>({
    date: new Date().toISOString().substring(0, 10),
    description: '',
    amount: 0,
    recipient: '',
    positionKey: 'staf',
    guidelineId: 'g1',
    category: 'Uang Makan / Hari',
    sppdAccountCode: '610101',
    sppdAccountName: 'Biaya Uang Makan Dinas',
    notes: ''
  });

  // Action Menu Dropdown State
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Move Position Modal
  const [isMoveModalOpen, setIsMoveModalOpen] = useState<boolean>(false);
  const [movePositionTxId, setMovePositionTxId] = useState<string | null>(null);
  const [moveTargetIndexStr, setMoveTargetIndexStr] = useState<string>('1');

  // Filter & Search inside mapped transactions
  const [txSearchQuery, setTxSearchQuery] = useState<string>('');
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('all');
  const [txComplianceFilter, setTxComplianceFilter] = useState<string>('all');

  // Interactive View Modes: 'category_hierarchy' (Default) | 'flat_table'
  const [mappingViewMode, setMappingViewMode] = useState<'category_hierarchy' | 'flat_table'>('category_hierarchy');
  const [expandedCategories, setExpandedCategories] = useState<{ [catId: string]: boolean }>({
    'sppd_1': true,
    'sppd_2': true,
    'sppd_3': true,
    'sppd_4': true,
    'sppd_5': true,
    'sppd_6': true,
    'sppd_7': true,
    'sppd_8': true,
    'sppd_9': true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Drive status from unified token
  useEffect(() => {
    const checkDrive = async () => {
      const drives = getConnectedDrives();
      if (drives.length > 0 && drives[0].email) {
        setDriveAccount({ email: drives[0].email });
      } else {
        const lastEmail = localStorage.getItem('NUSANTARA_LAST_ACTIVE_EMAIL') || 'penyimpanandrivenmsa1@gmail.com';
        const token = getStoredGoogleDriveToken();
        if (token) {
          setDriveAccount({ email: lastEmail });
        }
      }
    };
    checkDrive();
  }, []);

  const handleConnectGoogleDrive = async () => {
    try {
      setIsDriveConnecting(true);
      const res = await googleDriveLogin('penyimpanandrivenmsa1@gmail.com', true);
      if (res && res.accessToken) {
        setDriveAccount({ email: (res as any).user?.email || 'penyimpanandrivenmsa1@gmail.com' });
        setSuccessMessage('Google Drive Master terhubung secara otomatis ke seluruh modul!');
      }
    } catch (err: any) {
      setErrorMessage('Gagal menghubungkan Google Drive: ' + (err.message || String(err)));
    } finally {
      setIsDriveConnecting(false);
    }
  };

  // Filter all submissions that are SPPD
  const sppdSubmissions = useMemo(() => {
    return submissions.filter(sub => isSppdSubmission(sub));
  }, [submissions]);

  // Save customized guidelines to storage
  const handleSaveGuidelines = (updated: SppdRateGuidelineItem[]) => {
    setGuidelines(updated);
    try {
      localStorage.setItem('sppd_coa_master_v1', JSON.stringify(updated));
    } catch (e) {}
    setSuccessMessage('Master Akun & Kata Kunci SPPD berhasil disimpan!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleResetGuidelines = () => {
    if (confirm('Kembalikan seluruh daftar akun COA SPPD dan kata kunci ke standar resmi Harga Acuan?')) {
      handleSaveGuidelines(SPPD_RATE_GUIDELINES);
    }
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
        throw new Error(`Gagal mengunduh berkas SPPD dari server/Google Drive (HTTP ${res.status}).`);
      }
      blob = await res.blob();
      const ct = res.headers.get('content-type');
      if (ct && !ct.includes('octet-stream')) mimeType = ct.split(';')[0];
    }

    if (!blob) {
      throw new Error('Gagal membaca isi dokumen SPPD.');
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
          reject(new Error('Gagal membaca data berkas dokumen SPPD.'));
        }
      };
      reader.onerror = () => reject(new Error('Gagal memproses berkas dokumen SPPD.'));
      reader.readAsDataURL(blob!);
    });
  };

  // Map raw line item using custom guidelines
  const autoMapSppdLine = (desc: string, posKey: SppdPositionKey): { guideline: SppdRateGuidelineItem; confidence: 'high' | 'medium' | 'low' } => {
    const matched = matchSppdItemToGuideline(desc, guidelines);
    if (matched) {
      return { guideline: matched, confidence: 'high' };
    }
    // Default fallback to Uang Makan or Lain-lain
    return { guideline: guidelines[0], confidence: 'low' };
  };

  // 1. SELECT EXISTING SPPD SUBMISSION TO PARSE
  const handleSelectSubmissionToParse = async (sub: Submission) => {
    setIsProcessing(true);
    setProcessMessage('Menyiapkan parameter voucher SPPD...');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const emp = getSppdEmployeeName(sub);
      const posKey = detectSppdPositionKey(sub.notes || (sub as any).sppdData?.jabatan || '');
      setEmployeeName(emp);
      setEmployeePosition(posKey);
      setReportTitle(`SPPD: ${emp} (${sub.kode})`);
      setPeriod(sub.tanggal ? sub.tanggal.substring(0, 7) : new Date().toISOString().substring(0, 7));

      // 1. If submission has uploaded Google Drive document or attachment, parse with Gemini AI
      const docUrl = sub.googleDriveFileUrl || (sub.googleDriveFiles && sub.googleDriveFiles[0]?.url) || (sub as any).pettyCashFile?.url;
      const docName = sub.googleDriveFileName || (sub.googleDriveFiles && sub.googleDriveFiles[0]?.name) || 'Bukti SPPD';

      setActiveDocumentUrl(docUrl || '');
      setActiveDocumentName(docName);

      if (docUrl) {
        try {
          setProcessMessage(`Mengunduh berkas lampiran SPPD (${docName}) dari server / Google Drive...`);
          const { base64Data, mimeType } = await extractBase64FromUrl(docUrl);
          
          setProcessMessage(`Menganalisis tiket pesawat, hotel, & pos biaya SPPD ${emp} menggunakan Gemini AI...`);
          const aiRes = await fetch('/api/gemini/parse-sppd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64: base64Data,
              mimeType,
              employeeName: emp,
              position: posKey,
              accounts: guidelines
            })
          });

          if (aiRes.ok) {
            setProcessMessage('Memetakan hasil analisis AI ke 9 Kategori COA Resmi SPPD NMSA...');
            const aiData = await aiRes.json();
            if (aiData.success && aiData.result?.transactions?.length > 0) {
              const mappedFromAi: SppdMappedTransaction[] = aiData.result.transactions.map((t: any, idx: number) => {
                const g = guidelines.find(guide => guide.defaultCoaCode === t.sppdAccountCode) || autoMapSppdLine(t.description, posKey).guideline;
                return {
                  id: `ai-${sub.id}-${idx}`,
                  date: t.date || sub.tanggal,
                  description: t.description,
                  amount: Number(t.amount) || 0,
                  recipient: t.recipient || emp,
                  positionKey: posKey,
                  sppdAccountCode: g.defaultCoaCode,
                  sppdAccountName: g.defaultCoaName,
                  guidelineId: g.id,
                  category: g.item,
                  confidence: t.confidence || 'high',
                  notes: t.notes || ''
                };
              });

              setTransactions(mappedFromAi);
              setSuccessMessage(`Berhasil mengekstrak ${mappedFromAi.length} pos transaksi dari bukti dokumen SPPD menggunakan AI Parser!`);
              setIsProcessing(false);
              return;
            }
          }
        } catch (docErr) {
          console.warn('AI document parsing notice, falling back to submission line items:', docErr);
        }
      }

      // 2. Direct line items extraction from submission items
      setProcessMessage(`Mengekstrak ${(sub.items || []).length} rincian biaya dari data voucher...`);
      const mappedTxs: SppdMappedTransaction[] = (sub.items || []).map((item, idx) => {
        const desc = item.keterangan || item.item || 'Pengeluaran SPPD';
        const { guideline, confidence } = autoMapSppdLine(desc, posKey);
        return {
          id: `item-${sub.id}-${idx}`,
          date: sub.tanggal,
          description: desc,
          amount: Number(item.total) || 0,
          recipient: emp,
          positionKey: posKey,
          sppdAccountCode: guideline.defaultCoaCode,
          sppdAccountName: guideline.defaultCoaName,
          guidelineId: guideline.id,
          category: guideline.item,
          confidence: confidence
        };
      });

      setTransactions(mappedTxs);
      setSuccessMessage(`Berhasil memuat ${mappedTxs.length} pos rincian transaksi dari voucher SPPD [${sub.kode}]!`);
    } catch (err: any) {
      setErrorMessage('Gagal membaca transaksi SPPD: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. UPLOAD FILE (EXCEL / PDF / GAMBAR)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessMessage(`Membaca berkas ${file.name}...`);
    setErrorMessage('');
    setSuccessMessage('');
    setActiveDocumentName(file.name);

    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');

      if (isExcel) {
        // Read Excel File directly
        setProcessMessage(`Mengekstrak baris tabel Excel ${file.name}...`);
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const extracted: SppdMappedTransaction[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          // Detect columns (Date, Description, Amount, Recipient)
          let date = new Date().toISOString().substring(0, 10);
          let desc = '';
          let amount = 0;
          let rec = employeeName || 'Karyawan';

          for (const cell of row) {
            if (typeof cell === 'string' && (cell.match(/^\d{4}-\d{2}-\d{2}$/) || cell.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/))) {
              date = cell;
            } else if (typeof cell === 'number' && cell > 1000) {
              amount = cell;
            } else if (typeof cell === 'string' && cell.trim().length > 3 && !desc) {
              desc = cell.trim();
            }
          }

          if (desc && amount > 0) {
            const { guideline, confidence } = autoMapSppdLine(desc, employeePosition);
            extracted.push({
              id: `excel-${i}`,
              date,
              description: desc,
              amount,
              recipient: rec,
              positionKey: employeePosition,
              sppdAccountCode: guideline.defaultCoaCode,
              sppdAccountName: guideline.defaultCoaName,
              guidelineId: guideline.id,
              category: guideline.item,
              confidence
            });
          }
        }

        if (extracted.length > 0) {
          setTransactions(extracted);
          setReportTitle(`SPPD: ${file.name}`);
          setSuccessMessage(`Berhasil membaca ${extracted.length} transaksi dari berkas Excel!`);
        } else {
          throw new Error('Tidak ada baris transaksi yang valid di file Excel.');
        }
      } else {
        // PDF / Image via AI Parser
        setProcessMessage(`Membaca dan mengonversi berkas ${file.name}...`);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64Data = reader.result as string;
            const mimeType = file.type || 'application/pdf';

            setProcessMessage(`Menganalisis tiket/nota/dokumen SPPD ${file.name} menggunakan Gemini AI...`);
            const res = await fetch('/api/gemini/parse-sppd', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileBase64: base64Data,
                mimeType,
                employeeName,
                position: employeePosition,
                accounts: guidelines
              })
            });

            setProcessMessage('Memetakan rincian transaksi hasil analisis AI ke Akun COA SPPD...');
            const data = await res.json();
            if (data.success && data.result?.transactions?.length > 0) {
              const mappedTxs: SppdMappedTransaction[] = data.result.transactions.map((t: any, idx: number) => {
                const g = guidelines.find(guide => guide.defaultCoaCode === t.sppdAccountCode) || autoMapSppdLine(t.description, employeePosition).guideline;
                return {
                  id: `upload-ai-${idx}`,
                  date: t.date || new Date().toISOString().substring(0, 10),
                  description: t.description,
                  amount: Number(t.amount) || 0,
                  recipient: t.recipient || employeeName || 'Karyawan',
                  positionKey: employeePosition,
                  sppdAccountCode: g.defaultCoaCode,
                  sppdAccountName: g.defaultCoaName,
                  guidelineId: g.id,
                  category: g.item,
                  confidence: t.confidence || 'high'
                };
              });

              setTransactions(mappedTxs);
              setReportTitle(data.result.reportTitle || `SPPD: ${file.name}`);
              setSuccessMessage(`AI Parser berhasil mengekstrak ${mappedTxs.length} pos transaksi dari ${file.name}!`);
            } else {
              throw new Error(data.error || 'AI tidak menemukan pos transaksi dalam dokumen.');
            }
          } catch (aiErr: any) {
            setErrorMessage('Gagal memproses dokumen dengan AI: ' + (aiErr.message || String(aiErr)));
          } finally {
            setIsProcessing(false);
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    } catch (err: any) {
      setErrorMessage('Gagal membaca berkas: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. PARSE RAW TEXT
  const handleParseRawText = async () => {
    if (!rawTextInput.trim()) {
      setErrorMessage('Silakan tempelkan teks tabel rincian SPPD terlebih dahulu.');
      return;
    }

    setIsProcessing(true);
    setProcessMessage('Menganalisis teks rincian pengeluaran dinas dengan Gemini AI...');
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/gemini/parse-sppd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawTextInput,
          employeeName,
          position: employeePosition,
          accounts: guidelines
        })
      });

      setProcessMessage('Memetakan pos biaya ke standar COA SPPD...');
      const data = await res.json();
      if (data.success && data.result?.transactions?.length > 0) {
        const mappedTxs: SppdMappedTransaction[] = data.result.transactions.map((t: any, idx: number) => {
          const g = guidelines.find(guide => guide.defaultCoaCode === t.sppdAccountCode) || autoMapSppdLine(t.description, employeePosition).guideline;
          return {
            id: `text-ai-${idx}`,
            date: t.date || new Date().toISOString().substring(0, 10),
            description: t.description,
            amount: Number(t.amount) || 0,
            recipient: t.recipient || employeeName || 'Karyawan',
            positionKey: employeePosition,
            sppdAccountCode: g.defaultCoaCode,
            sppdAccountName: g.defaultCoaName,
            guidelineId: g.id,
            category: g.item,
            confidence: t.confidence || 'high'
          };
        });

        setTransactions(mappedTxs);
        setReportTitle(data.result.reportTitle || `SPPD: ${employeeName || 'Karyawan'} (Input Teks)`);
        setSuccessMessage(`Berhasil menganalisis dan memetakan ${mappedTxs.length} pos transaksi dari teks SPPD!`);
      } else {
        throw new Error(data.error || 'Gagal mengekstrak rincian transaksi dari teks yang ditempel.');
      }
    } catch (err: any) {
      setErrorMessage('Gagal memproses teks: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate compliance for a line item
  // Helper to get benchmark rate for a transaction
  const getBenchmarkRate = (t: SppdMappedTransaction): { nominal: number; label: string; isSpecial: boolean } => {
    const guide = guidelines.find(g => g.id === t.guidelineId || g.defaultCoaCode === t.sppdAccountCode);
    if (!guide) return { nominal: 0, label: 'Sesuai Bukti', isSpecial: true };
    const posKey = t.positionKey || employeePosition || 'staf';
    const posRate = guide.rates[posKey];
    if (!posRate) return { nominal: 0, label: 'Sesuai Bukti', isSpecial: true };
    if (posRate.nominal === 0) return { nominal: 0, label: posRate.spec || 'Sesuai Keuangan', isSpecial: true };
    return { nominal: posRate.nominal, label: `Rp ${posRate.nominal.toLocaleString('id-ID')}`, isSpecial: false };
  };

  // Helper to get approved / rounded capped amount for a transaction
  const getApprovedAmount = (t: SppdMappedTransaction): { amount: number; isCapped: boolean; excess: number } => {
    const b = getBenchmarkRate(t);
    if (b.isSpecial || b.nominal === 0) {
      return { amount: t.amount, isCapped: false, excess: 0 };
    }
    if (t.amount > b.nominal) {
      return { amount: b.nominal, isCapped: true, excess: t.amount - b.nominal };
    }
    return { amount: t.amount, isCapped: false, excess: 0 };
  };

  // Calculate compliance for a line item (Status Acuan)
  const getComplianceStatus = (t: SppdMappedTransaction): { 
    status: 'sesuai' | 'melebihi' | 'tiket_keuangan'; 
    label: string; 
    shortLabel: string;
    maxAllowed: number; 
    spec?: string 
  } => {
    const guide = guidelines.find(g => g.id === t.guidelineId || g.defaultCoaCode === t.sppdAccountCode);
    if (!guide) {
      return { status: 'sesuai', label: 'Standar Acuan', shortLabel: 'Sesuai Acuan', maxAllowed: 0 };
    }

    const posKey = t.positionKey || employeePosition || 'staf';
    const posRate = guide.rates[posKey];
    if (!posRate) {
      return { status: 'sesuai', label: 'Standar', shortLabel: 'Sesuai Acuan', maxAllowed: 0 };
    }

    if (posRate.nominal === 0) {
      return { 
        status: 'tiket_keuangan', 
        label: `Sesuai Keuangan (${posRate.spec || 'Sesuai Bagian Keuangan'})`, 
        shortLabel: 'Sesuai Keuangan',
        maxAllowed: 0,
        spec: posRate.spec 
      };
    }

    if (t.amount > posRate.nominal) {
      return { 
        status: 'melebihi', 
        label: `Melebihi Acuan (Maks Rp ${posRate.nominal.toLocaleString('id-ID')})`, 
        shortLabel: 'Melebihi Acuan',
        maxAllowed: posRate.nominal 
      };
    }

    return { 
      status: 'sesuai', 
      label: `Sesuai Acuan (Maks Rp ${posRate.nominal.toLocaleString('id-ID')})`, 
      shortLabel: 'Sesuai Acuan',
      maxAllowed: posRate.nominal 
    };
  };

  // POSTING TO SPPD FORMULIR & SPPD DATABASE
  const handlePostToSppdForm = async () => {
    if (transactions.length === 0) {
      setErrorMessage('Tidak ada transaksi yang dipetakan untuk diposting.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const now = new Date();
      const sppdRecordId = `SPPD-${Date.now()}`;
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

      // Estimate trip duration in days
      let tripDays = 4;
      const allDates: string[] = Array.from(new Set(transactions.map(t => t.date).filter(Boolean))).sort() as string[];
      if (allDates.length > 0) {
        const dFirst = new Date(allDates[0]).getTime();
        const dLast = new Date(allDates[allDates.length - 1]).getTime();
        const diff = Math.ceil((dLast - dFirst) / (1000 * 60 * 60 * 24)) + 1;
        if (diff > 0 && diff <= 60) {
          tripDays = diff;
        } else {
          tripDays = Math.max(1, allDates.length);
        }
      }

      // Consolidate into standard official categories with zero duplicates & meal/pocket capping
      const rawCostInputs = transactions.map(t => ({
        id: t.id,
        kategori: t.category,
        rincian: t.description,
        hargaAcuan: t.amount,
        jumlah: t.amount,
        date: t.date
      }));

      const consolidatedList = consolidateSppdCostItems(rawCostInputs, `${tripDays} Hari`, employeePosition);
      const jabatanLabel = (SPPD_POSITIONS.find(p => p.key === employeePosition)?.label || 'Staf') as any;

      const newSppdRecord: SPPDRecord = {
        id: sppdRecordId,
        noSppd: `SPPD/NMSA/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${Math.floor(1000 + Math.random() * 9000)}`,
        hariTanggal: now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        pemberiPerintah: 'Harijon',
        pemberiPerintahJabatan: 'Direktur Operasional',
        namaPekerja: employeeName || 'Karyawan NMSA',
        jabatan: jabatanLabel,
        divisi: 'Operasional Lapangan',
        kotaAsal: 'Jakarta (HO)',
        kotaTujuan: destination || 'Site / Proyek Tambang',
        transportasi: 'Pesawat / Operasional',
        lamaPerjalanan: `${tripDays} Hari`,
        tanggalMulai: allDates[0] || transactions[0]?.date || now.toISOString().substring(0, 10),
        tanggalSelesai: allDates[allDates.length - 1] || transactions[transactions.length - 1]?.date || now.toISOString().substring(0, 10),
        tujuanPerjalanan: reportTitle,
        keteranganSppd: `Diposting dari Pemetaan Akun SPPD (${transactions.length} sub-transaksi). Kelebihan biaya di atas plafon acuan resmi telah diakumulasikan dan dihapuskan sesuai pedoman.`,
        costItems: consolidatedList.map(c => ({
          id: `cost-${Math.random().toString(36).substring(2, 7)}`,
          kategori: c.kategori,
          rincian: c.rincian,
          hargaAcuan: typeof c.hargaAcuan === 'number' ? c.hargaAcuan : 0,
          jumlah: c.jumlah
        })),
        status: 'Disetujui',
        createdAt: now.toISOString()
      };

      // Save to localStorage SPPD records
      const existingStored = localStorage.getItem('sppd_records_v1');
      let recordsList: SPPDRecord[] = existingStored ? JSON.parse(existingStored) : [];
      recordsList = [newSppdRecord, ...recordsList.filter(r => r.id !== sppdRecordId)];
      localStorage.setItem('sppd_records_v1', JSON.stringify(recordsList));

      // Save to Firestore
      try {
        await saveSppdRecordsToFirestore(recordsList);
      } catch (cloudErr) {
        console.warn('Could not sync SPPD directly to cloud, saved locally:', cloudErr);
      }

      setSuccessMessage(`Berhasil memposting SPPD [${newSppdRecord.noSppd}] ke Formulir SPPD Dinas & Database! Total Disetujui: Rp ${consolidatedList.reduce((s, c) => s + c.jumlah, 0).toLocaleString('id-ID')}`);
    } catch (err: any) {
      setErrorMessage('Gagal memposting ke Formulir SPPD: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  // Comprehensive SPPD Audit, Capping, Spillover & Elimination Engine
  const sppdAuditEngine = useMemo(() => {
    // Determine trip duration in days
    let tripDays = 4;
    const allDates: string[] = Array.from(new Set(transactions.map(t => t.date).filter(Boolean))).sort() as string[];
    if (allDates.length > 0) {
      const dFirst = new Date(allDates[0]).getTime();
      const dLast = new Date(allDates[allDates.length - 1]).getTime();
      const diff = Math.ceil((dLast - dFirst) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0 && diff <= 60) {
        tripDays = diff;
      } else {
        tripDays = Math.max(1, allDates.length);
      }
    }

    // Daily benchmark rates based on position
    const guideMakan = guidelines.find(g => g.id === 'sppd_1' || g.defaultCoaCode === '610101');
    const guideSaku = guidelines.find(g => g.id === 'sppd_2' || g.defaultCoaCode === '610102');

    const posMealRate = guideMakan?.rates[employeePosition]?.nominal;
    const dailyMealRate = (posMealRate && posMealRate > 0) ? posMealRate : (employeePosition === 'direktur' ? 300000 : 100000);

    const posPocketRate = guideSaku?.rates[employeePosition]?.nominal;
    const dailyPocketRate = (posPocketRate && posPocketRate > 0) ? posPocketRate : (employeePosition === 'direktur' ? 250000 : 100000);

    const maxTripMealAllowed = tripDays * dailyMealRate;
    const maxTripPocketAllowed = tripDays * dailyPocketRate;

    // Filter meal transactions
    const mealTxs = transactions.filter(t => 
      t.sppdAccountCode === '610101' || 
      t.guidelineId === 'sppd_1' ||
      t.category.toLowerCase().includes('makan')
    );
    const rawMealTotal = mealTxs.reduce((sum, t) => sum + t.amount, 0);

    // Group meal transactions by date
    const mealByDate: { [dateStr: string]: { total: number; count: number; items: SppdMappedTransaction[] } } = {};
    mealTxs.forEach(t => {
      const d = t.date || 'Lainnya';
      if (!mealByDate[d]) mealByDate[d] = { total: 0, count: 0, items: [] };
      mealByDate[d].total += t.amount;
      mealByDate[d].count += 1;
      mealByDate[d].items.push(t);
    });

    let cappedMealTotal = 0;
    let excessMealToPocket = 0;

    const dateKeys = Object.keys(mealByDate);
    if (dateKeys.length > 0 && dateKeys.some(k => k !== 'Lainnya')) {
      dateKeys.forEach(k => {
        const dayTotal = mealByDate[k].total;
        if (dayTotal > dailyMealRate) {
          cappedMealTotal += dailyMealRate;
          excessMealToPocket += (dayTotal - dailyMealRate);
        } else {
          cappedMealTotal += dayTotal;
        }
      });
    } else {
      if (rawMealTotal > maxTripMealAllowed) {
        cappedMealTotal = maxTripMealAllowed;
        excessMealToPocket = rawMealTotal - maxTripMealAllowed;
      } else {
        cappedMealTotal = rawMealTotal;
        excessMealToPocket = 0;
      }
    }

    // Filter pocket money & other uncategorized/snack transactions
    const pocketTxs = transactions.filter(t => 
      t.sppdAccountCode === '610102' || 
      t.guidelineId === 'sppd_2' ||
      t.category.toLowerCase().includes('saku')
    );
    const rawPocketTotal = pocketTxs.reduce((sum, t) => sum + t.amount, 0);
    const accumulatedPocketTotal = rawPocketTotal + excessMealToPocket;

    // Pocket Capping & Elimination
    let finalPocketApproved = accumulatedPocketTotal;
    let eliminatedPocketExcess = 0;

    if (accumulatedPocketTotal > maxTripPocketAllowed) {
      finalPocketApproved = maxTripPocketAllowed;
      eliminatedPocketExcess = accumulatedPocketTotal - maxTripPocketAllowed;
    }

    // Other categories (transport, hotel, tickets)
    const otherTxs = transactions.filter(t => 
      t.sppdAccountCode !== '610101' && 
      t.guidelineId !== 'sppd_1' && 
      !t.category.toLowerCase().includes('makan') &&
      t.sppdAccountCode !== '610102' && 
      t.guidelineId !== 'sppd_2' && 
      !t.category.toLowerCase().includes('saku')
    );
    const otherTotal = otherTxs.reduce((sum, t) => sum + t.amount, 0);

    const totalExpenseRiil = transactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenseApproved = cappedMealTotal + finalPocketApproved + otherTotal;
    const totalEliminatedExcess = Math.max(0, totalExpenseRiil - totalExpenseApproved);

    return {
      tripDays,
      dailyMealRate,
      dailyPocketRate,
      maxTripMealAllowed,
      maxTripPocketAllowed,
      rawMealTotal,
      cappedMealTotal,
      excessMealToPocket,
      mealByDate,
      rawPocketTotal,
      accumulatedPocketTotal,
      finalPocketApproved,
      eliminatedPocketExcess,
      otherTotal,
      totalExpenseRiil,
      totalExpenseApproved,
      totalEliminatedExcess,
      hasMealExcess: excessMealToPocket > 0,
      hasPocketElimination: eliminatedPocketExcess > 0
    };
  }, [transactions, guidelines, employeePosition]);

  // Backward compatibility alias
  const mealCappingAnalysis = sppdAuditEngine;

  // Grouped Summary by 9 Categories
  const groupedSummary = useMemo(() => {
    return guidelines.map(g => {
      const items = transactions.filter(t => t.sppdAccountCode === g.defaultCoaCode || t.guidelineId === g.id);
      const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
      return {
        guideline: g,
        items,
        totalAmount,
        count: items.length
      };
    });
  }, [guidelines, transactions]);

  const totalExpense = useMemo(() => {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  // Export Excel
  const handleExportExcel = () => {
    if (transactions.length === 0) return;

    const excelData = transactions.map((t, idx) => {
      const comp = getComplianceStatus(t);
      const bench = getBenchmarkRate(t);
      const appr = getApprovedAmount(t);

      return {
        'No.': idx + 1,
        'Tanggal': t.date,
        'Nama Karyawan': t.recipient,
        'Jabatan': SPPD_POSITIONS.find(p => p.key === t.positionKey)?.label || t.positionKey,
        'Rincian Pengeluaran SPPD': t.description,
        'Kode Akun COA': t.sppdAccountCode,
        'Nama Akun COA SPPD': t.sppdAccountName,
        'Nominal Acuan (Rp)': bench.isSpecial ? bench.label : bench.nominal,
        'Nominal Riil (Rp)': t.amount,
        'Nominal Pembulatan / Disetujui (Rp)': appr.amount,
        'Status Acuan': comp.shortLabel,
        'Tingkat Keyakinan': t.confidence.toUpperCase()
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pemetaan Akun SPPD');

    const fileName = `Pemetaan_Akun_SPPD_${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().substring(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Export PDF (clean format with 1 nominal column matching Gambar 2 + footer audit notes)
  const handleExportPDF = () => {
    if (transactions.length === 0) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PT NUSANTARA MINERAL SUKSES ABADI', 14, 15);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('REKAP & PEMETAAN AKUN SPPD - PERJALANAN DINAS', 14, 22);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Judul / Sumber: ${reportTitle}`, 14, 28);
    doc.text(`Karyawan: ${employeeName || '-'} | Jabatan: ${SPPD_POSITIONS.find(p => p.key === employeePosition)?.label || 'Staf'} | Durasi: ${sppdAuditEngine.tripDays} Hari`, 14, 33);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')} | Total Riil: Rp ${sppdAuditEngine.totalExpenseRiil.toLocaleString('id-ID')} | Total Disetujui: Rp ${sppdAuditEngine.totalExpenseApproved.toLocaleString('id-ID')}`, 14, 38);

    // Grouped Summary Table (Matching Gambar 2 Table 1)
    const summaryRows = groupedSummary.filter(g => g.totalAmount > 0).map((g, i) => [
      i + 1,
      g.guideline.defaultCoaCode,
      g.guideline.item,
      g.count,
      `Rp ${g.totalAmount.toLocaleString('id-ID')}`
    ]);

    summaryRows.push([
      '',
      'TOTAL',
      'KESELURUHAN BIAYA SPPD',
      transactions.length,
      `Rp ${totalExpense.toLocaleString('id-ID')}`
    ]);

    autoTable(doc, {
      startY: 43,
      head: [['No', 'Kode COA', 'Kategori Akun SPPD', 'Jumlah', 'Total Nominal']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 2 }
    });

    // Detailed Item Table (Matching Gambar 2 Table 2: 1 Single Nominal column, Status Acuan)
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 100;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RINCIAN TRANSAKSI SPPD PER BARIS', 14, finalY);

    const detailRows = transactions.map((t, i) => {
      const comp = getComplianceStatus(t);
      return [
        i + 1,
        t.date,
        t.description,
        t.sppdAccountCode,
        t.category,
        `Rp ${t.amount.toLocaleString('id-ID')}`,
        comp.status === 'sesuai' ? 'SESUAI' : comp.status === 'melebihi' ? 'MELEBIHI' : 'SESUAI KEUANGAN'
      ];
    });

    autoTable(doc, {
      startY: finalY + 3,
      head: [['No', 'Tanggal', 'Rincian Pengeluaran', 'Kode COA', 'Kategori', 'Nominal', 'Status Acuan']],
      body: detailRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      columnStyles: {
        5: { fontStyle: 'bold', halign: 'right' },
        6: { halign: 'center', fontStyle: 'bold' }
      }
    });

    // Audit & Elimination Disclosure Box at Bottom of PDF
    const noteStartY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 6 : 220;
    
    // Check if new page is needed for the audit disclosure box
    let currentY = noteStartY;
    if (currentY > 240) {
      doc.addPage();
      currentY = 15;
    }

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, currentY, 182, sppdAuditEngine.hasPocketElimination || sppdAuditEngine.hasMealExcess ? 42 : 32, 'FD');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('CATATAN AUDIT PLAFON ACUAN & PENGHAPUSAN KELEBIHAN SPPD:', 17, currentY + 5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`1. Total Pengeluaran Riil SPPD: Rp ${sppdAuditEngine.totalExpenseRiil.toLocaleString('id-ID')} (${transactions.length} baris transaksi, Durasi: ${sppdAuditEngine.tripDays} Hari).`, 17, currentY + 10);
    
    doc.text(`2. Kategori Uang Makan: Riil Rp ${sppdAuditEngine.rawMealTotal.toLocaleString('id-ID')} | Plafon Acuan: ${sppdAuditEngine.tripDays} Hari x Rp ${sppdAuditEngine.dailyMealRate.toLocaleString('id-ID')} = Rp ${sppdAuditEngine.maxTripMealAllowed.toLocaleString('id-ID')} | Disetujui: Rp ${sppdAuditEngine.cappedMealTotal.toLocaleString('id-ID')}${sppdAuditEngine.hasMealExcess ? ` (Kelebihan Rp ${sppdAuditEngine.excessMealToPocket.toLocaleString('id-ID')} dialihkan ke Uang Saku)` : ''}.`, 17, currentY + 15);
    
    doc.text(`3. Kategori Uang Saku: Riil Rp ${sppdAuditEngine.rawPocketTotal.toLocaleString('id-ID')}${sppdAuditEngine.hasMealExcess ? ` + Pelimpahan Makan Rp ${sppdAuditEngine.excessMealToPocket.toLocaleString('id-ID')} = Akumulasi Rp ${sppdAuditEngine.accumulatedPocketTotal.toLocaleString('id-ID')}` : ''} | Batas Plafon Acuan: ${sppdAuditEngine.tripDays} Hari x Rp ${sppdAuditEngine.dailyPocketRate.toLocaleString('id-ID')} = Rp ${sppdAuditEngine.maxTripPocketAllowed.toLocaleString('id-ID')}.`, 17, currentY + 20);

    if (sppdAuditEngine.eliminatedPocketExcess > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(185, 28, 28);
      doc.text(`4. JUMLAH NOMINAL YANG DIHAPUSKAN: Rp ${sppdAuditEngine.eliminatedPocketExcess.toLocaleString('id-ID')} (Kelebihan di atas plafon acuan Uang Saku resmi dihapuskan/tidak diganti).`, 17, currentY + 26);
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text(`5. TOTAL BIAYA SPPD YANG DISETUJUI & DIBAYARKAN PERUSAHAAN: Rp ${sppdAuditEngine.totalExpenseApproved.toLocaleString('id-ID')}.`, 17, currentY + 31);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text('* Ketentuan: Berdasarkan Pedoman Plafon SPPD PT NMSA, kelebihan biaya yang melampaui batas acuan tidak dibebankan ke kas perusahaan.', 17, currentY + 37);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text(`4. TOTAL BIAYA SPPD YANG DISETUJUI & DIBAYARKAN PERUSAHAAN: Rp ${sppdAuditEngine.totalExpenseApproved.toLocaleString('id-ID')} (Seluruh pengeluaran sesuai batas acuan plafon).`, 17, currentY + 26);
    }

    doc.save(`Laporan_Pemetaan_SPPD_${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
  };

  // Action Handlers for Mapped Transactions Table
  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(item => item.id !== id));
    setActiveActionMenuId(null);
    setSuccessMessage('Baris transaksi berhasil dihapus.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleDuplicateTransaction = (id: string) => {
    setTransactions(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const itemToCopy = prev[idx];
      const duplicated: SppdMappedTransaction = {
        ...itemToCopy,
        id: `dup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        description: `${itemToCopy.description} (Salinan)`
      };
      const next = [...prev];
      next.splice(idx + 1, 0, duplicated);
      return next;
    });
    setActiveActionMenuId(null);
    setSuccessMessage('Baris transaksi berhasil disalin & ditambahkan ke urutan.');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleMoveTransaction = (id: string, direction: 'up' | 'down') => {
    setTransactions(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      next.splice(targetIdx, 0, removed);
      return next;
    });
    setActiveActionMenuId(null);
  };

  const handleOpenMoveModal = (id: string) => {
    const idx = transactions.findIndex(t => t.id === id);
    setMovePositionTxId(id);
    setMoveTargetIndexStr(String(idx + 1));
    setIsMoveModalOpen(true);
    setActiveActionMenuId(null);
  };

  const handleConfirmMovePosition = () => {
    const targetIdx = parseInt(moveTargetIndexStr, 10) - 1;
    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= transactions.length || !movePositionTxId) {
      setIsMoveModalOpen(false);
      return;
    }
    setTransactions(prev => {
      const currentIdx = prev.findIndex(t => t.id === movePositionTxId);
      if (currentIdx === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(currentIdx, 1);
      next.splice(targetIdx, 0, removed);
      return next;
    });
    setIsMoveModalOpen(false);
    setSuccessMessage(`Berhasil memindahkan baris transaksi ke urutan nomor ${targetIdx + 1}.`);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleOpenEditModal = (tx: SppdMappedTransaction) => {
    setEditingTransaction({ ...tx });
    setIsEditTxModalOpen(true);
    setActiveActionMenuId(null);
  };

  const handleSaveEditedTransaction = (tx: SppdMappedTransaction) => {
    setTransactions(prev => prev.map(item => item.id === tx.id ? tx : item));
    setIsEditTxModalOpen(false);
    setEditingTransaction(null);
    setSuccessMessage('Perubahan data transaksi berhasil disimpan!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleOpenAddModal = () => {
    const defaultDate = transactions.length > 0 ? transactions[transactions.length - 1].date : new Date().toISOString().substring(0, 10);
    const defaultGuide = guidelines[0] || SPPD_RATE_GUIDELINES[0];
    setNewManualTx({
      date: defaultDate,
      description: '',
      amount: 0,
      recipient: employeeName || 'Karyawan',
      positionKey: employeePosition || 'staf',
      guidelineId: defaultGuide.id,
      category: defaultGuide.item,
      sppdAccountCode: defaultGuide.defaultCoaCode,
      sppdAccountName: defaultGuide.defaultCoaName,
      notes: ''
    });
    setIsAddTxModalOpen(true);
  };

  const handleSaveNewManualTransaction = (andAddAnother: boolean = false) => {
    if (!newManualTx.description?.trim()) {
      alert('Mohon isi Rincian Pengeluaran SPPD');
      return;
    }
    const g = guidelines.find(guide => guide.id === newManualTx.guidelineId) || guidelines[0] || SPPD_RATE_GUIDELINES[0];
    const newTx: SppdMappedTransaction = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date: newManualTx.date || new Date().toISOString().substring(0, 10),
      description: newManualTx.description.trim(),
      amount: Number(newManualTx.amount) || 0,
      recipient: newManualTx.recipient || employeeName || 'Karyawan',
      positionKey: (newManualTx.positionKey as SppdPositionKey) || employeePosition || 'staf',
      sppdAccountCode: g.defaultCoaCode,
      sppdAccountName: g.defaultCoaName,
      guidelineId: g.id,
      category: g.item,
      confidence: 'manual',
      notes: newManualTx.notes || ''
    };
    setTransactions(prev => [...prev, newTx]);
    setSuccessMessage(`Berhasil menambahkan data transaksi manual: "${newTx.description}"!`);
    setTimeout(() => setSuccessMessage(''), 3000);

    if (andAddAnother) {
      setNewManualTx(prev => ({
        ...prev,
        description: '',
        amount: 0,
        notes: ''
      }));
    } else {
      setIsAddTxModalOpen(false);
    }
  };

  // Filtered transactions for display
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = !txSearchQuery || 
        t.description.toLowerCase().includes(txSearchQuery.toLowerCase()) ||
        t.sppdAccountCode.includes(txSearchQuery) ||
        t.category.toLowerCase().includes(txSearchQuery.toLowerCase());

      const matchCategory = txCategoryFilter === 'all' || t.category === txCategoryFilter || t.sppdAccountCode === txCategoryFilter;
      
      const comp = getComplianceStatus(t);
      const matchCompliance = txComplianceFilter === 'all' || comp.status === txComplianceFilter;

      return matchSearch && matchCategory && matchCompliance;
    });
  }, [transactions, txSearchQuery, txCategoryFilter, txComplianceFilter, guidelines]);

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-stone-900 to-amber-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-10">
          <Briefcase size={240} className="text-white" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-400/30 backdrop-blur-md px-3 py-1 rounded-full text-amber-300 text-xs font-mono font-bold uppercase tracking-wider">
            <Sparkles size={14} className="animate-pulse" />
            Module Pemetaan Akun SPPD & Sinkronisasi Biaya Dinas
          </div>

          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white font-sans">
            Rekap & Pemetaan Akun SPPD (Perjalanan Dinas)
          </h2>

          <p className="text-stone-300 text-xs md:text-sm leading-relaxed font-sans">
            Membaca bukti transaksi pengeluaran SPPD (tiket, hotel, kwitansi, taksi, uang makan/saku), mengekstrak pos pengeluaran secara presisi ke 9 Akun COA Pedoman Resmi, dan menyinkronkan langsung ke Formulir SPPD & Voucher HO.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3 text-xs font-mono">
            {/* Unified Google Drive Connection Status */}
            <div className="bg-amber-950/90 border border-amber-400/40 text-amber-300 font-bold px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span>Google Drive Master:</span>
              <span className="text-white font-mono">{driveAccount?.email || 'Master Terhubung'}</span>
            </div>

            <button
              onClick={() => setIsCoaModalOpen(true)}
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Settings size={15} className="text-amber-300" />
              <span>Kelola Master Akun SPPD ({guidelines.length} Kategori)</span>
            </button>

            {onOpenSppdForm && (
              <button
                onClick={onOpenSppdForm}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Briefcase size={15} />
                <span>Buka Formulir SPPD Dinas</span>
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

      {/* 2. Main Input Source Section */}
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <h3 className="font-sans font-black text-stone-900 text-base">
              1. Pilih Bukti Dokumen / Transaksi SPPD
            </h3>
            <p className="text-stone-500 text-xs font-mono">
              Hanya membaca pos transaksi pengeluaran dari berkas bukti pengajuan berjenis Perjalanan Dinas / SPPD.
            </p>
          </div>

          {/* Employee & Position Selector for Rate Guideline checks */}
          <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-2xl">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-[10px] font-bold text-stone-500 uppercase">Jabatan Dinas:</span>
              <select
                value={employeePosition}
                onChange={(e) => setEmployeePosition(e.target.value as SppdPositionKey)}
                className="text-xs font-bold font-sans text-stone-900 bg-transparent border-none focus:outline-none cursor-pointer"
              >
                {SPPD_POSITIONS.map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Source Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-200 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveSourceTab('voucher')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeSourceTab === 'voucher' ? 'bg-amber-600 text-white shadow-xs' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Briefcase size={15} />
            <span>Pilih Pengajuan SPPD Terupload ({sppdSubmissions.length})</span>
          </button>

          <button
            onClick={() => setActiveSourceTab('upload')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeSourceTab === 'upload' ? 'bg-amber-600 text-white shadow-xs' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Upload size={15} />
            <span>Unggah Berkas Baru (Excel / PDF / Gambar)</span>
          </button>

          <button
            onClick={() => setActiveSourceTab('text')}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
              activeSourceTab === 'text' ? 'bg-amber-600 text-white shadow-xs' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <FileText size={15} />
            <span>Tempelkan Teks Transaksi SPPD</span>
          </button>
        </div>

        {/* SOURCE TAB 1: LIST VOUCHER SPPD TERUPLOAD */}
        {activeSourceTab === 'voucher' && (
          <div className="space-y-4">
            {sppdSubmissions.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-stone-200 rounded-2xl">
                <Briefcase size={40} className="mx-auto text-stone-300 mb-2" />
                <p className="text-sm font-bold text-stone-700">Belum ada transaksi berjenis Perjalanan Dinas / SPPD</p>
                <p className="text-xs text-stone-400 mt-1">Input transaksi dengan jenis pengajuan SPPD atau unggah berkas baru di tab sebelah.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sppdSubmissions.map(sub => {
                  const emp = getSppdEmployeeName(sub);
                  const total = sub.items?.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0) || 0;
                  const hasAttachment = Boolean(sub.googleDriveFileUrl || (sub.googleDriveFiles && sub.googleDriveFiles.length > 0) || sub.buktiPembayaran);

                  return (
                    <div
                      key={sub.id}
                      className="border border-stone-200 hover:border-amber-400 bg-stone-50/50 hover:bg-amber-50/20 rounded-2xl p-4 transition flex flex-col justify-between space-y-3 group"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-black px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md border border-amber-200">
                            {sub.kode || 'SPPD'}
                          </span>
                          <span className="text-[11px] font-mono text-stone-500">{sub.tanggal}</span>
                        </div>

                        <h4 className="text-xs font-black text-stone-900 line-clamp-1 group-hover:text-amber-900">
                          {emp}
                        </h4>

                        <p className="text-[11px] text-stone-500 line-clamp-2">
                          {sub.notes || sub.jenisPengajuan}
                        </p>

                        <div className="pt-1 flex items-center justify-between text-xs">
                          <span className="text-[10px] text-stone-400 font-mono">
                            {sub.items?.length || 0} Pos Pengeluaran
                          </span>
                          <span className="font-mono font-black text-stone-900">
                            Rp {total.toLocaleString('id-ID')}
                          </span>
                        </div>

                        {hasAttachment && (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 w-fit">
                            <CheckSquare size={11} />
                            <span>Memiliki Lampiran Bukti Dokumen</span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectSubmissionToParse(sub)}
                        disabled={isProcessing}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                      >
                        <Sparkles size={14} />
                        <span>Ekstrak & Petakan Bukti SPPD</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SOURCE TAB 2: UPLOAD BERKAS BARU */}
        {activeSourceTab === 'upload' && (
          <div className="space-y-4">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/30 hover:bg-amber-50/60 rounded-3xl p-8 text-center cursor-pointer transition space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl mx-auto flex items-center justify-center">
                <Upload size={24} />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-800">
                  Klik untuk Memilih Berkas atau Seret Berkas ke Sini
                </p>
                <p className="text-xs text-stone-500 font-mono mt-1">
                  Mendukung Excel (.xlsx, .csv), PDF Laporan/Tiket, atau Foto Kwitansi/Nota Pengeluaran SPPD.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SOURCE TAB 3: TEMPEL TEKS */}
        {activeSourceTab === 'text' && (
          <div className="space-y-3">
            <textarea
              rows={5}
              value={rawTextInput}
              onChange={(e) => setRawTextInput(e.target.value)}
              placeholder="Tempelkan daftar rincian SPPD di sini... Contoh:
10/08/2026 Tiket Pesawat Jakarta - Makassar Rp 2.450.000
11/08/2026 Hotel Santika Makassar 2 Malam Rp 1.100.000
11/08/2026 Uang Makan Dinas 3 Hari Rp 600.000
11/08/2026 Taksi Bandara Makassar Rp 200.000"
              className="w-full text-xs font-mono p-3.5 border border-stone-300 rounded-2xl focus:outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={handleParseRawText}
              disabled={isProcessing || !rawTextInput.trim()}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Sparkles size={15} />
              <span>{isProcessing ? 'Memproses AI Parser...' : 'Analisis & Petakan Teks dengan AI'}</span>
            </button>
          </div>
        )}

        {/* Processing / Analyzing Banner Indicator */}
        {isProcessing && (
          <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-950 shadow-sm animate-pulse">
            <RefreshCw size={19} className="animate-spin text-amber-600 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="font-extrabold text-amber-900 text-[13px] flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-600" />
                <span>Menganalisis Dokumen SPPD Dinas...</span>
              </span>
              <span className="font-medium text-amber-800 font-mono text-[11px]">{processMessage}</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Mapped Transactions Table & Summary */}
      {transactions.length > 0 && (
        <div className="space-y-6">
          {/* Header Action Bar */}
          <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-stone-900 font-sans">
                  {reportTitle}
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md font-bold">
                  {transactions.length} Baris Transaksi
                </span>
              </div>
              <p className="text-xs text-stone-500 font-mono mt-0.5">
                Total Biaya: <strong className="text-stone-900">Rp {totalExpense.toLocaleString('id-ID')}</strong> | Karyawan: <strong className="text-stone-900">{employeeName || '-'}</strong> ({SPPD_POSITIONS.find(p => p.key === employeePosition)?.label || 'Staf'})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                id="btn-add-manual-sppd-top"
                onClick={handleOpenAddModal}
                className="px-3.5 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Tambah Baris Transaksi Baru Secara Manual"
              >
                <PlusCircle size={15} />
                <span>+ Tambah Manual</span>
              </button>

              <button
                type="button"
                onClick={handlePostToSppdForm}
                disabled={isProcessing}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Posting langsung ke Formulir SPPD Dinas & Sinkronkan ke Database"
              >
                <CheckSquare size={15} />
                <span>Posting ke Formulir SPPD Dinas</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileSpreadsheet size={15} />
                <span>Ekspor Excel</span>
              </button>

              <button
                type="button"
                onClick={handleExportPDF}
                className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Download size={15} />
                <span>Cetak / PDF Rekap</span>
              </button>

              <button
                type="button"
                onClick={handleClearSppdMapping}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Bersihkan hasil pemetaan SPPD saat ini dan mulai baru"
              >
                <Trash2 size={14} />
                <span>Mulai Baru / Reset</span>
              </button>
            </div>
          </div>

          {/* Grouped Category Recap (9 Official Categories) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupedSummary.map(({ guideline, totalAmount, count }) => {
              const isSelectedCategory = txCategoryFilter === guideline.item;
              const isExpanded = expandedCategories[guideline.id] !== false;

              return (
                <div 
                  key={guideline.id} 
                  onClick={() => {
                    setExpandedCategories(prev => ({
                      ...prev,
                      [guideline.id]: !isExpanded
                    }));
                  }}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer hover:shadow-xs ${
                    isSelectedCategory
                      ? 'bg-amber-100/60 border-amber-400 ring-2 ring-amber-300'
                      : totalAmount > 0 
                        ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300' 
                        : 'bg-white border-stone-200 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="px-1.5 py-0.5 bg-stone-200/80 text-stone-700 rounded font-bold">
                        {guideline.defaultCoaCode}
                      </span>
                      <span className={`font-bold ${count > 0 ? 'text-amber-800' : 'text-stone-400'}`}>
                        {count} Sub-Akun
                      </span>
                    </div>
                    <h5 className="text-xs font-bold text-stone-900 line-clamp-1">
                      {guideline.item}
                    </h5>
                    <p className="text-[10px] text-stone-500 font-mono">
                      Plafon {SPPD_POSITIONS.find(p => p.key === employeePosition)?.shortLabel}: {
                        guideline.rates[employeePosition]?.nominal > 0 
                          ? `Rp ${guideline.rates[employeePosition].nominal.toLocaleString('id-ID')}` 
                          : (guideline.rates[employeePosition]?.spec || 'Sesuai Keuangan')
                      }
                    </p>
                  </div>

                  <div className="pt-2 border-t border-stone-200/60 mt-2 flex items-center justify-between text-xs font-mono">
                    <span className="text-[10px] text-stone-400">Total Kategori:</span>
                    <span className="font-black text-amber-900">
                      Rp {totalAmount.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Meal Capping, Pocket Spillover & Elimination Breakdown Banner */}
          {(sppdAuditEngine.hasMealExcess || sppdAuditEngine.hasPocketElimination) && (
            <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-rose-500/10 border-2 border-amber-300 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-sans shadow-xs">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-600 text-white rounded-2xl shrink-0 mt-0.5 shadow-3xs">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-amber-950 text-sm">
                      Kalkulasi Acuan Plafon, Pelimpahan & Penghapusan Kelebihan Biaya
                    </h4>
                    <span className="text-[10px] font-mono bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                      {sppdAuditEngine.tripDays} Hari Perjalanan ({SPPD_POSITIONS.find(p => p.key === employeePosition)?.label || 'Staf'})
                    </span>
                  </div>
                  <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                    {sppdAuditEngine.hasMealExcess && (
                      <span>
                        • <strong>Uang Makan:</strong> Riil <strong className="font-mono">Rp {sppdAuditEngine.rawMealTotal.toLocaleString('id-ID')}</strong> melebihi acuan (<strong className="font-mono">Rp {sppdAuditEngine.dailyMealRate.toLocaleString('id-ID')}/hari x {sppdAuditEngine.tripDays} Hari = Rp {sppdAuditEngine.maxTripMealAllowed.toLocaleString('id-ID')}</strong>). Dibulatkan ke <strong className="font-mono">Rp {sppdAuditEngine.cappedMealTotal.toLocaleString('id-ID')}</strong>, kelebihan <strong className="font-mono bg-amber-200/80 px-1 py-0.5 rounded">Rp {sppdAuditEngine.excessMealToPocket.toLocaleString('id-ID')}</strong> dialihkan ke Uang Saku.
                      </span>
                    )}
                    {sppdAuditEngine.hasPocketElimination ? (
                      <span className="block mt-1 text-rose-900">
                        • <strong>Uang Saku:</strong> Akumulasi (<strong className="font-mono">Rp {sppdAuditEngine.accumulatedPocketTotal.toLocaleString('id-ID')}</strong>) melampaui batas acuan uang saku ({sppdAuditEngine.tripDays} Hari x Rp {sppdAuditEngine.dailyPocketRate.toLocaleString('id-ID')} = <strong className="font-mono">Rp {sppdAuditEngine.maxTripPocketAllowed.toLocaleString('id-ID')}</strong>). Kelebihan sebesar <strong className="font-mono bg-rose-200/90 text-rose-950 px-1.5 py-0.5 rounded font-black">Rp {sppdAuditEngine.eliminatedPocketExcess.toLocaleString('id-ID')}</strong> <u>resmi dihapuskan</u> dan tidak diganti.
                      </span>
                    ) : (
                      sppdAuditEngine.hasMealExcess && (
                        <span className="block mt-1 text-emerald-900">
                          • <strong>Uang Saku:</strong> Akumulasi Uang Saku (<strong className="font-mono">Rp {sppdAuditEngine.accumulatedPocketTotal.toLocaleString('id-ID')}</strong>) masih dalam batas acuan aman ({sppdAuditEngine.tripDays} Hari x Rp {sppdAuditEngine.dailyPocketRate.toLocaleString('id-ID')} = <strong className="font-mono">Rp {sppdAuditEngine.maxTripPocketAllowed.toLocaleString('id-ID')}</strong>).
                        </span>
                      )
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-white/90 border border-amber-200 rounded-2xl p-3 shrink-0 text-right font-mono text-xs shadow-xs min-w-[220px]">
                <div className="text-[10px] text-stone-500">Total SPPD Disetujui:</div>
                <div className="font-black text-emerald-800 text-sm">
                  Rp {sppdAuditEngine.totalExpenseApproved.toLocaleString('id-ID')}
                </div>
                {sppdAuditEngine.eliminatedPocketExcess > 0 ? (
                  <div className="text-[9px] text-rose-700 font-sans font-semibold mt-0.5">
                    Dihapuskan: -Rp {sppdAuditEngine.eliminatedPocketExcess.toLocaleString('id-ID')}
                  </div>
                ) : (
                  <div className="text-[9px] text-emerald-700 font-sans font-semibold mt-0.5">
                    Sesuai Batas Acuan Plafon
                  </div>
                )}
              </div>
            </div>
          )}

          {/* View Mode Toggle & Filter Bar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-stone-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setMappingViewMode('category_hierarchy')}
                className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  mappingViewMode === 'category_hierarchy'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                }`}
              >
                <Layers size={14} />
                <span>Hierarki Kategori & Sub-Akun</span>
              </button>
              <button
                type="button"
                onClick={() => setMappingViewMode('flat_table')}
                className={`px-3 py-1.5 rounded-lg font-sans text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  mappingViewMode === 'flat_table'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                }`}
              >
                <ListOrdered size={14} />
                <span>Tabel Semua Baris (3 Kolom Nominal)</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <Search size={14} className="text-stone-400" />
              <input
                type="text"
                placeholder="Cari rincian pengeluaran, penerima, atau COA..."
                value={txSearchQuery}
                onChange={(e) => setTxSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none text-xs font-sans text-stone-800"
              />
            </div>

            {/* Category & Status Selectors */}
            <div className="flex items-center gap-2">
              <select
                value={txCategoryFilter}
                onChange={(e) => setTxCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-sans font-bold"
              >
                <option value="all">Semua Kategori (9 Kategori)</option>
                {guidelines.map(g => (
                  <option key={g.id} value={g.item}>{g.item}</option>
                ))}
              </select>

              <select
                value={txComplianceFilter}
                onChange={(e) => setTxComplianceFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-sans font-bold"
              >
                <option value="all">Semua Status Acuan</option>
                <option value="sesuai">Sesuai Acuan</option>
                <option value="melebihi">Melebihi Acuan</option>
                <option value="tiket_keuangan">Sesuai Keuangan</option>
              </select>
            </div>
          </div>

          {/* VIEW MODE 1: INTERACTIVE CATEGORY HIERARCHY & SUB-ACCOUNTS ACCORDION */}
          {mappingViewMode === 'category_hierarchy' && (
            <div className="space-y-4">
              {groupedSummary
                .filter(({ guideline }) => txCategoryFilter === 'all' || txCategoryFilter === guideline.item)
                .map(({ guideline, items, totalAmount, count }) => {
                  const isExpanded = expandedCategories[guideline.id] !== false;
                  const isMealCategory = guideline.id === 'sppd_1' || guideline.defaultCoaCode === '610101';
                  const isPocketCategory = guideline.id === 'sppd_2' || guideline.defaultCoaCode === '610102';

                  return (
                    <div 
                      key={guideline.id} 
                      className={`bg-white border rounded-3xl overflow-hidden transition-all shadow-xs ${
                        totalAmount > 0 ? 'border-stone-300' : 'border-stone-200 opacity-80'
                      }`}
                    >
                      {/* Category Header Bar */}
                      <div 
                        onClick={() => {
                          setExpandedCategories(prev => ({
                            ...prev,
                            [guideline.id]: !isExpanded
                          }));
                        }}
                        className="p-4 bg-stone-50 hover:bg-amber-50/40 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none transition"
                      >
                        <div className="flex items-center gap-3">
                          <button 
                            type="button"
                            className="p-1.5 bg-white border border-stone-200 rounded-xl text-stone-600 hover:text-stone-900 transition"
                          >
                            <ChevronDown size={16} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 bg-stone-900 text-white rounded-lg text-xs font-mono font-bold">
                                [{guideline.defaultCoaCode}]
                              </span>
                              <h4 className="font-bold text-stone-900 text-sm">
                                {guideline.item}
                              </h4>
                              <span className="text-[11px] font-mono px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full font-bold">
                                {count} Sub-Akun / Transaksi
                              </span>
                            </div>

                            <p className="text-[11px] text-stone-500 font-mono mt-0.5">
                              Harga Acuan ({SPPD_POSITIONS.find(p => p.key === employeePosition)?.shortLabel}): {
                                guideline.rates[employeePosition]?.nominal > 0 
                                  ? `Rp ${guideline.rates[employeePosition].nominal.toLocaleString('id-ID')}` 
                                  : (guideline.rates[employeePosition]?.spec || 'Sesuai Bukti')
                              }
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-[10px] text-stone-400 font-mono uppercase tracking-wider">Total Riil Kategori</div>
                            <div className="text-sm font-black text-amber-900 font-mono">
                              Rp {totalAmount.toLocaleString('id-ID')}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewManualTx({
                                date: new Date().toISOString().substring(0, 10),
                                description: '',
                                amount: 0,
                                recipient: employeeName || '',
                                positionKey: employeePosition,
                                guidelineId: guideline.id,
                                category: guideline.item,
                                sppdAccountCode: guideline.defaultCoaCode,
                                sppdAccountName: guideline.defaultCoaName,
                                notes: ''
                              });
                              setIsAddTxModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-3xs"
                            title={`Tambah sub-akun baru ke kategori ${guideline.item}`}
                          >
                            <PlusCircle size={14} />
                            <span>+ Sub-Akun</span>
                          </button>
                        </div>
                      </div>

                      {/* Special info box for Meal Capping within the category */}
                      {isMealCategory && isExpanded && (
                        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-xs font-sans flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Info size={15} className="text-amber-700 shrink-0" />
                            <span className="text-amber-900">
                              Acuan Harian: <strong>Rp {sppdAuditEngine.dailyMealRate.toLocaleString('id-ID')}/hari</strong> ({sppdAuditEngine.tripDays} Hari = Plafon Rp {sppdAuditEngine.maxTripMealAllowed.toLocaleString('id-ID')})
                            </span>
                          </div>
                          {sppdAuditEngine.hasMealExcess && (
                            <span className="text-[11px] font-mono font-bold bg-amber-200/80 text-amber-950 px-2.5 py-1 rounded-lg">
                              ⚠️ Kelebihan Rp {sppdAuditEngine.excessMealToPocket.toLocaleString('id-ID')} dialihkan ke Uang Saku
                            </span>
                          )}
                        </div>
                      )}

                      {/* Special info box for Pocket Money within the category */}
                      {isPocketCategory && isExpanded && (
                        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 text-xs font-sans flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                            <span className="text-emerald-900">
                              Acuan Uang Saku: <strong>Rp {sppdAuditEngine.dailyPocketRate.toLocaleString('id-ID')}/hari</strong> ({sppdAuditEngine.tripDays} Hari = Plafon Rp {sppdAuditEngine.maxTripPocketAllowed.toLocaleString('id-ID')}). Uang saku riil (<strong>Rp {sppdAuditEngine.rawPocketTotal.toLocaleString('id-ID')}</strong>){sppdAuditEngine.hasMealExcess ? ` + pelimpahan makan (Rp ${sppdAuditEngine.excessMealToPocket.toLocaleString('id-ID')})` : ''}.
                            </span>
                          </div>
                          {sppdAuditEngine.eliminatedPocketExcess > 0 ? (
                            <span className="text-[11px] font-mono font-bold bg-rose-200/80 text-rose-950 px-2.5 py-1 rounded-lg">
                              🚫 Kelebihan Rp {sppdAuditEngine.eliminatedPocketExcess.toLocaleString('id-ID')} Dihapuskan
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono font-bold bg-emerald-200/80 text-emerald-950 px-2.5 py-1 rounded-lg">
                              Disetujui: Rp {sppdAuditEngine.finalPocketApproved.toLocaleString('id-ID')}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Sub-Transactions Table for This Category with 3 Nominal Columns */}
                      {isExpanded && (
                        <div className="p-0 overflow-x-auto">
                          {items.length === 0 ? (
                            <div className="py-6 px-4 text-center text-stone-400 text-xs font-mono">
                              Belum ada sub-akun transaksi pada kategori ini.
                            </div>
                          ) : (
                            <table className="w-full text-left text-xs border-collapse font-sans">
                              <thead className="bg-stone-100/80 text-stone-700 font-mono text-[10.5px] uppercase tracking-wider border-b border-stone-200">
                                <tr>
                                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                                  <th className="py-2.5 px-3 w-28">Tanggal</th>
                                  <th className="py-2.5 px-4">Rincian Pengeluaran Sub-Akun</th>
                                  <th className="py-2.5 px-3 w-32 text-right bg-stone-100/60">Kolom 1: Acuan (Rp)</th>
                                  <th className="py-2.5 px-3 w-32 text-right">Kolom 2: Riil (Rp)</th>
                                  <th className="py-2.5 px-3 w-32 text-right bg-emerald-50/60">Kolom 3: Pembulatan (Rp)</th>
                                  <th className="py-2.5 px-3 w-32 text-center">Status Acuan</th>
                                  <th className="py-2.5 px-3 w-20 text-center">Aksi</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-100">
                                {items.map((t, subIdx) => {
                                  const comp = getComplianceStatus(t);
                                  const bench = getBenchmarkRate(t);
                                  const appr = getApprovedAmount(t);
                                  const isExceeding = !bench.isSpecial && bench.nominal > 0 && t.amount > bench.nominal;
                                  const isMenuOpen = activeActionMenuId === t.id;

                                  return (
                                    <tr key={t.id} className="hover:bg-amber-50/30 transition">
                                      <td className="py-2.5 px-3 text-center font-mono text-stone-400">{subIdx + 1}</td>
                                      <td className="py-2.5 px-3 font-mono text-stone-600">{t.date}</td>
                                      <td className="py-2.5 px-4 font-semibold text-stone-900">
                                        <div className="flex items-center gap-2">
                                          <span>{t.description}</span>
                                          {t.confidence === 'manual' && (
                                            <span className="text-[9px] font-mono px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded font-bold">
                                              Manual
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-stone-400 font-mono font-normal">
                                          Penerima: {t.recipient || employeeName || 'Karyawan'}
                                          {t.notes && <span className="ml-2 text-stone-500 italic">({t.notes})</span>}
                                        </div>
                                      </td>

                                      {/* Kolom 1: Acuan */}
                                      <td className="py-2.5 px-3 text-right font-mono bg-stone-50/50 text-stone-600 font-semibold">
                                        {bench.isSpecial ? (
                                          <span className="text-[10px] font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                            {bench.label}
                                          </span>
                                        ) : (
                                          `Rp ${bench.nominal.toLocaleString('id-ID')}`
                                        )}
                                      </td>

                                      {/* Kolom 2: Riil (Merah jika melebihi acuan) */}
                                      <td className="py-2.5 px-3 text-right font-mono">
                                        {isExceeding ? (
                                          <span className="font-black text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg inline-block shadow-3xs" title={`Melebihi batas acuan Rp ${bench.nominal.toLocaleString('id-ID')}`}>
                                            Rp {t.amount.toLocaleString('id-ID')}
                                          </span>
                                        ) : (
                                          <span className="font-bold text-stone-900">
                                            Rp {t.amount.toLocaleString('id-ID')}
                                          </span>
                                        )}
                                      </td>

                                      {/* Kolom 3: Pembulatan / Nilai Batas Acuan */}
                                      <td className="py-2.5 px-3 text-right font-mono bg-emerald-50/30">
                                        <span className="font-bold text-emerald-800">
                                          Rp {appr.amount.toLocaleString('id-ID')}
                                        </span>
                                      </td>

                                      {/* Status Acuan */}
                                      <td className="py-2.5 px-3 text-center">
                                        {comp.status === 'sesuai' && (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200">
                                            <CheckCircle2 size={11} />
                                            <span>Sesuai</span>
                                          </span>
                                        )}
                                        {comp.status === 'melebihi' && (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md border border-rose-200" title={comp.label}>
                                            <AlertCircle size={11} />
                                            <span>Melebihi</span>
                                          </span>
                                        )}
                                        {comp.status === 'tiket_keuangan' && (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-sky-100 text-sky-800 rounded-md border border-sky-200" title={comp.label}>
                                            <Info size={11} />
                                            <span>Keuangan</span>
                                          </span>
                                        )}
                                      </td>

                                      {/* Aksi */}
                                      <td className="py-2.5 px-3 text-center">
                                        <div className="relative inline-block text-left">
                                          <button
                                            id={`btn-sub-menu-${t.id}`}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveActionMenuId(isMenuOpen ? null : t.id);
                                            }}
                                            className="px-2 py-1 bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 border border-stone-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                          >
                                            <SlidersHorizontal size={12} />
                                            <span>Opsi</span>
                                            <ChevronDown size={11} className={`transition-transform duration-150 ${isMenuOpen ? 'rotate-180' : ''}`} />
                                          </button>

                                          {isMenuOpen && (
                                            <>
                                              <div 
                                                className="fixed inset-0 z-30" 
                                                onClick={() => setActiveActionMenuId(null)}
                                              />
                                              <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-2xl shadow-2xl border border-stone-200 py-1.5 z-40 font-sans text-left animate-in fade-in zoom-in-95 duration-100">
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenEditModal(t)}
                                                  className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-2 transition cursor-pointer font-medium"
                                                >
                                                  <Edit2 size={13} className="text-amber-600" />
                                                  <span>Edit Sub-Akun</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleDuplicateTransaction(t.id)}
                                                  className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-emerald-50 hover:text-emerald-900 flex items-center gap-2 transition cursor-pointer font-medium"
                                                >
                                                  <Copy size={13} className="text-emerald-600" />
                                                  <span>Duplikasi Baris</span>
                                                </button>

                                                <div className="my-1 border-t border-stone-100" />

                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteTransaction(t.id)}
                                                  className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-800 flex items-center gap-2 transition cursor-pointer font-medium"
                                                >
                                                  <Trash2 size={13} className="text-rose-600" />
                                                  <span>Hapus Sub-Akun</span>
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* VIEW MODE 2: FULL FLAT TABLE WITH 3 NOMINAL COLUMNS */}
          {mappingViewMode === 'flat_table' && (
            <div className="bg-white border border-stone-200 rounded-3xl overflow-visible shadow-xs">
              <div className="overflow-x-auto rounded-t-3xl">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead className="bg-stone-900 text-white font-mono text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">No</th>
                      <th className="py-3 px-3 w-28">Tanggal</th>
                      <th className="py-3 px-4">Rincian Pengeluaran SPPD</th>
                      <th className="py-3 px-3 w-40">Kategori COA SPPD</th>
                      <th className="py-3 px-3 w-32 text-right bg-stone-800 text-amber-200">Kolom 1: Acuan (Rp)</th>
                      <th className="py-3 px-3 w-32 text-right text-stone-100">Kolom 2: Riil (Rp)</th>
                      <th className="py-3 px-3 w-32 text-right bg-stone-800 text-emerald-300">Kolom 3: Pembulatan (Rp)</th>
                      <th className="py-3 px-3 w-32 text-center">Status Acuan</th>
                      <th className="py-3 px-3 w-24 text-center">Opsi Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 font-sans">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-stone-400 font-mono">
                          Tidak ada transaksi yang cocok dengan filter.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((t, idx) => {
                        const comp = getComplianceStatus(t);
                        const bench = getBenchmarkRate(t);
                        const appr = getApprovedAmount(t);
                        const isExceeding = !bench.isSpecial && bench.nominal > 0 && t.amount > bench.nominal;
                        const isMenuOpen = activeActionMenuId === t.id;

                        return (
                          <tr key={t.id} className="hover:bg-amber-50/30 transition">
                            <td className="py-3 px-3 text-center font-mono text-stone-400">{idx + 1}</td>
                            <td className="py-3 px-3 font-mono text-stone-600">{t.date}</td>
                            <td className="py-3 px-4 font-semibold text-stone-900">
                              <div className="flex items-center gap-2">
                                <span>{t.description}</span>
                                {t.confidence === 'manual' && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded font-bold">
                                    Manual
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-stone-400 font-mono">
                                Penerima: {t.recipient || employeeName || 'Karyawan'} ({SPPD_POSITIONS.find(p => p.key === t.positionKey)?.shortLabel || 'Staf'})
                                {t.notes && <span className="ml-2 text-stone-500 italic">({t.notes})</span>}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <select
                                value={t.guidelineId}
                                onChange={(e) => {
                                  const g = guidelines.find(guide => guide.id === e.target.value);
                                  if (!g) return;
                                  setTransactions(prev => prev.map(item => item.id === t.id ? {
                                    ...item,
                                    guidelineId: g.id,
                                    category: g.item,
                                    sppdAccountCode: g.defaultCoaCode,
                                    sppdAccountName: g.defaultCoaName,
                                    confidence: 'manual'
                                  } : item));
                                }}
                                className="text-xs font-mono font-bold text-amber-900 bg-amber-50/80 border border-amber-200 rounded-lg p-1 w-full cursor-pointer focus:outline-none"
                              >
                                {guidelines.map(g => (
                                  <option key={g.id} value={g.id}>
                                    [{g.defaultCoaCode}] {g.item}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Kolom 1: Acuan */}
                            <td className="py-3 px-3 text-right font-mono bg-stone-50 text-stone-700 font-bold">
                              {bench.isSpecial ? (
                                <span className="text-[10px] font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 inline-block">
                                  {bench.label}
                                </span>
                              ) : (
                                `Rp ${bench.nominal.toLocaleString('id-ID')}`
                              )}
                            </td>

                            {/* Kolom 2: Riil (Merah jika melebihi acuan) */}
                            <td className="py-3 px-3 text-right font-mono">
                              {isExceeding ? (
                                <span className="font-black text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg inline-block shadow-3xs" title={`Melebihi batas acuan Rp ${bench.nominal.toLocaleString('id-ID')}`}>
                                  Rp {t.amount.toLocaleString('id-ID')}
                                </span>
                              ) : (
                                <span className="font-black text-stone-900">
                                  Rp {t.amount.toLocaleString('id-ID')}
                                </span>
                              )}
                            </td>

                            {/* Kolom 3: Pembulatan / Batas Acuan Maksimal */}
                            <td className="py-3 px-3 text-right font-mono bg-emerald-50/40">
                              <span className="font-black text-emerald-800 bg-emerald-100/60 border border-emerald-200 px-2 py-0.5 rounded-lg inline-block">
                                Rp {appr.amount.toLocaleString('id-ID')}
                              </span>
                            </td>

                            {/* Status Acuan */}
                            <td className="py-3 px-3 text-center">
                              {comp.status === 'sesuai' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200">
                                  <CheckCircle2 size={11} />
                                  <span>Sesuai Acuan</span>
                                </span>
                              )}
                              {comp.status === 'melebihi' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md border border-rose-200" title={comp.label}>
                                  <AlertCircle size={11} />
                                  <span>Melebihi Acuan</span>
                                </span>
                              )}
                              {comp.status === 'tiket_keuangan' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-sky-100 text-sky-800 rounded-md border border-sky-200" title={comp.label}>
                                  <Info size={11} />
                                  <span>Sesuai Keuangan</span>
                                </span>
                              )}
                            </td>

                            {/* Opsi Aksi */}
                            <td className="py-3 px-3 text-center">
                              <div className="relative inline-block text-left">
                                <button
                                  id={`btn-action-menu-${t.id}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveActionMenuId(isMenuOpen ? null : t.id);
                                  }}
                                  className="px-2.5 py-1.5 bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 border border-stone-200 hover:border-amber-300 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-3xs"
                                  title="Pilihan Opsi Transaksi"
                                >
                                  <SlidersHorizontal size={13} />
                                  <span>Opsi</span>
                                  <ChevronDown size={12} className={`transition-transform duration-150 ${isMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isMenuOpen && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-30" 
                                      onClick={() => setActiveActionMenuId(null)}
                                    />
                                    <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl shadow-2xl border border-stone-200 py-1.5 z-40 font-sans text-left animate-in fade-in zoom-in-95 duration-100">
                                      <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider border-b border-stone-100 flex items-center justify-between">
                                        <span>Baris #{idx + 1}</span>
                                        <span className="text-amber-700 font-bold">SPPD</span>
                                      </div>

                                      {/* 1. Edit Data */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(t)}
                                        className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-2.5 transition cursor-pointer font-medium"
                                      >
                                        <Edit2 size={14} className="text-amber-600" />
                                        <div>
                                          <div className="font-bold">Edit Data</div>
                                          <div className="text-[10px] text-stone-400 font-mono">Ubah rincian, nominal, atau COA</div>
                                        </div>
                                      </button>

                                      {/* 2. Salin / Duplicate */}
                                      <button
                                        type="button"
                                        onClick={() => handleDuplicateTransaction(t.id)}
                                        className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-emerald-50 hover:text-emerald-900 flex items-center gap-2.5 transition cursor-pointer font-medium"
                                      >
                                        <Copy size={14} className="text-emerald-600" />
                                        <div>
                                          <div className="font-bold">Salin / Duplikasi</div>
                                          <div className="text-[10px] text-stone-400 font-mono">Gandakan baris ini</div>
                                        </div>
                                      </button>

                                      <div className="my-1 border-t border-stone-100" />

                                      {/* 3. Pindah Urutan ke Atas */}
                                      <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() => handleMoveTransaction(t.id, 'up')}
                                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2.5 transition font-medium ${
                                          idx === 0 ? 'text-stone-300 cursor-not-allowed' : 'text-stone-700 hover:bg-sky-50 hover:text-sky-900 cursor-pointer'
                                        }`}
                                      >
                                        <ArrowUp size={14} className={idx === 0 ? 'text-stone-300' : 'text-sky-600'} />
                                        <span>Pindah ke Atas</span>
                                      </button>

                                      {/* 4. Pindah Urutan ke Bawah */}
                                      <button
                                        type="button"
                                        disabled={idx === filteredTransactions.length - 1}
                                        onClick={() => handleMoveTransaction(t.id, 'down')}
                                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2.5 transition font-medium ${
                                          idx === filteredTransactions.length - 1 ? 'text-stone-300 cursor-not-allowed' : 'text-stone-700 hover:bg-sky-50 hover:text-sky-900 cursor-pointer'
                                        }`}
                                      >
                                        <ArrowDown size={14} className={idx === filteredTransactions.length - 1 ? 'text-stone-300' : 'text-sky-600'} />
                                        <span>Pindah ke Bawah</span>
                                      </button>

                                      {/* 5. Pindah ke Posisi / Nomor Urut Tertentu */}
                                      <button
                                        type="button"
                                        onClick={() => handleOpenMoveModal(t.id)}
                                        className="w-full text-left px-3 py-2 text-xs text-stone-700 hover:bg-purple-50 hover:text-purple-900 flex items-center gap-2.5 transition cursor-pointer font-medium"
                                      >
                                        <ListOrdered size={14} className="text-purple-600" />
                                        <div>
                                          <div className="font-bold">Pindahkan Urutan...</div>
                                          <div className="text-[10px] text-stone-400 font-mono">Ubah ke nomor baris spesifik</div>
                                        </div>
                                      </button>

                                      <div className="my-1 border-t border-stone-100" />

                                      {/* 6. Hapus */}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTransaction(t.id)}
                                        className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-800 flex items-center gap-2.5 transition cursor-pointer font-medium"
                                      >
                                        <Trash2 size={14} className="text-rose-600" />
                                        <div>
                                          <div className="font-bold">Hapus Baris</div>
                                          <div className="text-[10px] text-rose-400 font-mono">Hapus dari rekap</div>
                                        </div>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bottom Card: Comprehensive Settlement, Elimination & Action Card */}
          <div className="space-y-4">
            <div className="p-5 bg-stone-900 text-white rounded-3xl border border-stone-800 shadow-lg flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                <div className="p-3.5 bg-stone-800/80 rounded-2xl border border-stone-700/60">
                  <div className="text-[11px] font-mono text-stone-400">Total Pengeluaran Riil (SPPD):</div>
                  <div className="text-lg font-black text-white font-mono mt-0.5">
                    Rp {sppdAuditEngine.totalExpenseRiil.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">{transactions.length} baris sub-transaksi</div>
                </div>

                <div className="p-3.5 bg-stone-800/80 rounded-2xl border border-stone-700/60">
                  <div className="text-[11px] font-mono text-rose-300">Nominal Dihapuskan (Kelebihan Plafon):</div>
                  <div className={`text-lg font-black font-mono mt-0.5 ${sppdAuditEngine.eliminatedPocketExcess > 0 ? 'text-rose-400' : 'text-stone-400'}`}>
                    - Rp {sppdAuditEngine.eliminatedPocketExcess.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[10px] text-rose-300/80 mt-0.5">
                    {sppdAuditEngine.eliminatedPocketExcess > 0 ? 'Kelebihan Uang Saku tidak diganti' : 'Tidak ada potongan'}
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-950/80 rounded-2xl border border-emerald-800/60">
                  <div className="text-[11px] font-mono text-emerald-300">Total SPPD Yang Disetujui:</div>
                  <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                    Rp {sppdAuditEngine.totalExpenseApproved.toLocaleString('id-ID')}
                  </div>
                  <div className="text-[10px] text-emerald-300/80 mt-0.5">Batas acuan resmi perusahaan</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
                <button
                  id="btn-add-manual-sppd-bottom"
                  type="button"
                  onClick={handleOpenAddModal}
                  className="w-full sm:w-auto px-5 py-3 bg-amber-600 hover:bg-amber-500 active:scale-98 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg"
                >
                  <PlusCircle size={16} />
                  <span>+ Tambahkan Data Secara Manual</span>
                </button>
              </div>
            </div>

            {/* Policy Settlement Footnote */}
            {sppdAuditEngine.eliminatedPocketExcess > 0 && (
              <div className="px-5 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-center gap-2.5">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>
                  <strong>Ketentuan Kebijakan Plafon SPPD PT NMSA:</strong> Seluruh kelebihan biaya di atas batas acuan akumulasi Uang Saku (sebesar <strong>Rp {sppdAuditEngine.eliminatedPocketExcess.toLocaleString('id-ID')}</strong>) telah otomatis <strong>dihapuskan</strong> dan tidak dapat ditagihkan/di-reimburse dari kas operasional perusahaan.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MODAL: KELOLA MASTER AKUN SPPD & KATA KUNCI (KEYWORDS) */}
      {isCoaModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden font-sans">
            {/* Modal Header */}
            <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-600 text-white rounded-2xl shadow-xs">
                  <Settings size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-black text-stone-900 text-base">
                    Kelola Master Akun SPPD & Deteksi Kata Kunci
                  </h3>
                  <p className="text-stone-500 text-xs font-mono">
                    9 Kategori Akun Harga Acuan Resmi & Kata Kunci Otomatis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCoaModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Search & Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 bg-stone-100 px-3 py-2 rounded-xl flex-1 text-xs">
                  <Search size={14} className="text-stone-400" />
                  <input
                    type="text"
                    placeholder="Cari kategori akun atau kata kunci..."
                    value={searchTermCoa}
                    onChange={(e) => setSearchTermCoa(e.target.value)}
                    className="w-full bg-transparent border-none focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleResetGuidelines}
                  className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} />
                  <span>Reset Default</span>
                </button>
              </div>

              {/* Account Cards List */}
              <div className="space-y-3">
                {guidelines
                  .filter(g => 
                    g.item.toLowerCase().includes(searchTermCoa.toLowerCase()) || 
                    g.defaultCoaCode.includes(searchTermCoa) ||
                    g.keywords.some(k => k.toLowerCase().includes(searchTermCoa.toLowerCase()))
                  )
                  .map(g => {
                    const isEditing = editingGuidelineId === g.id;
                    return (
                      <div key={g.id} className="p-4 border border-stone-200 rounded-2xl bg-stone-50/50 hover:bg-amber-50/20 transition space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-black px-2 py-0.5 bg-amber-600 text-white rounded-md">
                              {g.defaultCoaCode}
                            </span>
                            <span className="text-xs font-black text-stone-900">{g.item}</span>
                            <span className="text-[10px] text-stone-400 font-mono">({g.unit})</span>
                          </div>

                          {!isEditing ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingGuidelineId(g.id);
                                setTempKeywords(g.keywords.join(', '));
                                setTempAccountName(g.defaultCoaName);
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100 rounded-lg transition flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 size={12} />
                              <span>Edit Kata Kunci</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedKeywords = tempKeywords.split(',').map(k => k.trim()).filter(Boolean);
                                  const updatedList = guidelines.map(item => item.id === g.id ? {
                                    ...item,
                                    keywords: updatedKeywords,
                                    defaultCoaName: tempAccountName || item.defaultCoaName
                                  } : item);
                                  handleSaveGuidelines(updatedList);
                                  setEditingGuidelineId(null);
                                }}
                                className="px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition cursor-pointer"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingGuidelineId(null)}
                                className="px-2.5 py-1 text-xs font-bold bg-stone-200 text-stone-700 hover:bg-stone-300 rounded-lg transition cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Keyword list display / editor */}
                        {isEditing ? (
                          <div className="space-y-2 pt-2 border-t border-stone-200">
                            <div>
                              <label className="text-[10px] font-mono font-bold text-stone-500 uppercase">
                                Kata Kunci Deteksi Transaksi (Pisahkan dengan koma):
                              </label>
                              <input
                                type="text"
                                value={tempKeywords}
                                onChange={(e) => setTempKeywords(e.target.value)}
                                className="w-full text-xs font-mono p-2 border border-stone-300 rounded-xl mt-1 focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {g.keywords.map((kw, kwIdx) => (
                              <span key={kwIdx} className="text-[10px] font-mono px-2 py-0.5 bg-white border border-stone-200 text-stone-700 rounded-md">
                                #{kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsCoaModalOpen(false)}
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Tutup Pengaturan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: EDIT TRANSAKSI SPPD */}
      {isEditTxModalOpen && editingTransaction && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-lg w-full overflow-hidden font-sans">
            <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-600 text-white rounded-2xl shadow-xs">
                  <Edit2 size={18} />
                </div>
                <div>
                  <h3 className="font-sans font-black text-stone-900 text-base">
                    Edit Data Transaksi SPPD
                  </h3>
                  <p className="text-stone-500 text-xs font-mono">
                    Perbarui rincian pengeluaran, akun COA, atau nominal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditTxModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                    Tanggal Transaksi
                  </label>
                  <input
                    type="date"
                    value={editingTransaction.date}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, date: e.target.value })}
                    className="w-full font-mono p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                    Nominal Biaya (Rp)
                  </label>
                  <input
                    type="number"
                    value={editingTransaction.amount}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full font-mono font-bold text-stone-900 p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                  Rincian Pengeluaran SPPD
                </label>
                <textarea
                  rows={2}
                  value={editingTransaction.description}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, description: e.target.value })}
                  placeholder="Contoh: Tiket Pesawat Citilink Jakarta - Kendari PP"
                  className="w-full p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                  Kategori Akun COA Pedoman
                </label>
                <select
                  value={editingTransaction.guidelineId}
                  onChange={(e) => {
                    const g = guidelines.find(guide => guide.id === e.target.value);
                    if (!g) return;
                    setEditingTransaction({
                      ...editingTransaction,
                      guidelineId: g.id,
                      category: g.item,
                      sppdAccountCode: g.defaultCoaCode,
                      sppdAccountName: g.defaultCoaName,
                      confidence: 'manual'
                    });
                  }}
                  className="w-full font-mono font-bold p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500 bg-amber-50/50"
                >
                  {guidelines.map(g => (
                    <option key={g.id} value={g.id}>
                      [{g.defaultCoaCode}] {g.item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                    Nama Karyawan / Penerima
                  </label>
                  <input
                    type="text"
                    value={editingTransaction.recipient}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, recipient: e.target.value })}
                    className="w-full p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                    Jabatan (Plafon)
                  </label>
                  <select
                    value={editingTransaction.positionKey}
                    onChange={(e) => setEditingTransaction({ ...editingTransaction, positionKey: e.target.value as SppdPositionKey })}
                    className="w-full p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                  >
                    {SPPD_POSITIONS.map(pos => (
                      <option key={pos.key} value={pos.key}>
                        {pos.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={editingTransaction.notes || ''}
                  onChange={(e) => setEditingTransaction({ ...editingTransaction, notes: e.target.value })}
                  placeholder="Contoh: Lampiran kwitansi hotel asli ada di amplop"
                  className="w-full p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditTxModalOpen(false)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditedTransaction(editingTransaction)}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: TAMBAH TRANSAKSI SECARA MANUAL */}
      {isAddTxModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-lg w-full overflow-hidden font-sans">
            <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-600 text-white rounded-2xl shadow-xs">
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-black text-stone-900 text-base">
                    Tambah Data Transaksi SPPD Manual
                  </h3>
                  <p className="text-stone-500 text-xs font-mono">
                    Input rincian transaksi baru yang belum terdeteksi dokumen
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddTxModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                    Tanggal Transaksi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newManualTx.date}
                    onChange={(e) => setNewManualTx({ ...newManualTx, date: e.target.value })}
                    className="w-full font-mono p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                    Nominal Biaya (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={newManualTx.amount || ''}
                    placeholder="0"
                    onChange={(e) => setNewManualTx({ ...newManualTx, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full font-mono font-bold text-stone-900 p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                  Rincian Pengeluaran SPPD <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={newManualTx.description}
                  onChange={(e) => setNewManualTx({ ...newManualTx, description: e.target.value })}
                  placeholder="Contoh: Biaya Makan Siang & Malam Tim Proyek di Site 2 Hari"
                  className="w-full p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                  Kategori Akun COA Pedoman <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newManualTx.guidelineId}
                  onChange={(e) => {
                    const g = guidelines.find(guide => guide.id === e.target.value);
                    if (!g) return;
                    setNewManualTx({
                      ...newManualTx,
                      guidelineId: g.id,
                      category: g.item,
                      sppdAccountCode: g.defaultCoaCode,
                      sppdAccountName: g.defaultCoaName
                    });
                  }}
                  className="w-full font-mono font-bold p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500 bg-amber-50/50"
                >
                  {guidelines.map(g => (
                    <option key={g.id} value={g.id}>
                      [{g.defaultCoaCode}] {g.item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                    Nama Karyawan
                  </label>
                  <input
                    type="text"
                    value={newManualTx.recipient}
                    onChange={(e) => setNewManualTx({ ...newManualTx, recipient: e.target.value })}
                    placeholder="Nama penerima..."
                    className="w-full p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                    Jabatan (Plafon)
                  </label>
                  <select
                    value={newManualTx.positionKey}
                    onChange={(e) => setNewManualTx({ ...newManualTx, positionKey: e.target.value as SppdPositionKey })}
                    className="w-full p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                  >
                    {SPPD_POSITIONS.map(pos => (
                      <option key={pos.key} value={pos.key}>
                        {pos.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                  Catatan / Keterangan Tambahan
                </label>
                <input
                  type="text"
                  value={newManualTx.notes || ''}
                  onChange={(e) => setNewManualTx({ ...newManualTx, notes: e.target.value })}
                  placeholder="Opsional, keterangan pendukung"
                  className="w-full p-2.5 border border-stone-300 rounded-xl focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsAddTxModalOpen(false)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveNewManualTransaction(true)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Simpan & Tambah Lagi
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveNewManualTransaction(false)}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  Simpan Transaksi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: PINDAHKAN URUTAN BARIS */}
      {isMoveModalOpen && movePositionTxId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-sm w-full overflow-hidden font-sans">
            <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-600 text-white rounded-2xl shadow-xs">
                  <ListOrdered size={18} />
                </div>
                <div>
                  <h3 className="font-sans font-black text-stone-900 text-base">
                    Pindahkan Urutan Baris
                  </h3>
                  <p className="text-stone-500 text-xs font-mono">
                    Total {transactions.length} baris transaksi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-mono font-bold text-stone-700 uppercase mb-1">
                  Pindahkan ke Nomor Urut (1 s/d {transactions.length})
                </label>
                <input
                  type="number"
                  min="1"
                  max={transactions.length}
                  value={moveTargetIndexStr}
                  onChange={(e) => setMoveTargetIndexStr(e.target.value)}
                  className="w-full font-mono font-black text-lg p-2.5 border border-stone-300 rounded-xl text-center focus:outline-none focus:border-purple-500"
                />
              </div>
              <p className="text-[11px] text-stone-500 font-sans text-center">
                Baris transaksi yang dipilih akan digeser ke posisi urutan baru tersebut.
              </p>
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(false)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmMovePosition}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Terapkan Posisi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

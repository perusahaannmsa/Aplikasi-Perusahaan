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
  FolderOpen, Calendar, MapPin, CheckSquare, X
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

interface SppdAccountMappingProps {
  submissions?: Submission[];
  userProfile?: any;
  onSelectSubmissionForView?: (sub: Submission) => void;
  onOpenSppdForm?: () => void;
}

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

  // Source Tab selection: 'voucher' | 'upload' | 'text'
  const [activeSourceTab, setActiveSourceTab] = useState<'voucher' | 'upload' | 'text'>('voucher');

  // Transactions list currently mapped
  const [transactions, setTransactions] = useState<SppdMappedTransaction[]>([]);
  const [reportTitle, setReportTitle] = useState<string>('Laporan Biaya Perjalanan Dinas (SPPD)');
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().substring(0, 7));
  const [employeeName, setEmployeeName] = useState<string>('');
  const [employeePosition, setEmployeePosition] = useState<SppdPositionKey>('staf');
  const [destination, setDestination] = useState<string>('Site / Proyek');

  // Active document context
  const [activeDocumentName, setActiveDocumentName] = useState<string>('');
  const [activeDocumentUrl, setActiveDocumentUrl] = useState<string>('');
  const [rawTextInput, setRawTextInput] = useState<string>('');

  // Processing & UI States
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
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

  // Filter & Search inside mapped transactions
  const [txSearchQuery, setTxSearchQuery] = useState<string>('');
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('all');
  const [txComplianceFilter, setTxComplianceFilter] = useState<string>('all');

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
          const { base64Data, mimeType } = await extractBase64FromUrl(docUrl);
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
    setErrorMessage('');
    setSuccessMessage('');
    setActiveDocumentName(file.name);

    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');

      if (isExcel) {
        // Read Excel File directly
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
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64Data = reader.result as string;
            const mimeType = file.type || 'application/pdf';

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
        setReportTitle(data.result.reportTitle || `SPPD: ${employeeName || 'Teks Transaksi'}`);
        setSuccessMessage(`Berhasil mengekstrak ${mappedTxs.length} pos transaksi dari teks SPPD!`);
      } else {
        throw new Error(data.error || 'AI tidak dapat mendeteksi pos transaksi dari teks.');
      }
    } catch (err: any) {
      setErrorMessage('Gagal memproses teks: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate compliance for a line item
  const getComplianceStatus = (t: SppdMappedTransaction): { status: 'sesuai' | 'melebihi' | 'tiket_keuangan'; label: string; maxAllowed: number; spec?: string } => {
    const guide = guidelines.find(g => g.id === t.guidelineId || g.defaultCoaCode === t.sppdAccountCode);
    if (!guide) {
      return { status: 'sesuai', label: 'Standar Acuan', maxAllowed: 0 };
    }

    const posRate = guide.rates[t.positionKey || 'staf'];
    if (!posRate) {
      return { status: 'sesuai', label: 'Standar', maxAllowed: 0 };
    }

    if (posRate.nominal === 0) {
      return { 
        status: 'tiket_keuangan', 
        label: `Tiket Keuangan (${posRate.spec || 'Sesuai Bagian Keuangan'})`, 
        maxAllowed: 0,
        spec: posRate.spec 
      };
    }

    if (t.amount > posRate.nominal) {
      return { 
        status: 'melebihi', 
        label: `Melebihi Plafon (Maks Rp ${posRate.nominal.toLocaleString('id-ID')})`, 
        maxAllowed: posRate.nominal 
      };
    }

    return { 
      status: 'sesuai', 
      label: `Sesuai Plafon (Maks Rp ${posRate.nominal.toLocaleString('id-ID')})`, 
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

      // Map line items into standard SPPD cost items format
      const costItems = transactions.map(t => {
        const comp = getComplianceStatus(t);
        return {
          id: t.id,
          kategori: t.category,
          rincian: t.description,
          hargaAcuan: comp.maxAllowed || t.amount,
          jumlah: t.amount
        };
      });

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
        lamaPerjalanan: `${Math.max(1, transactions.length)} Hari`,
        tanggalMulai: transactions[0]?.date || now.toISOString().substring(0, 10),
        tanggalSelesai: transactions[transactions.length - 1]?.date || now.toISOString().substring(0, 10),
        tujuanPerjalanan: reportTitle,
        keteranganSppd: `Diposting dari Pemetaan Akun SPPD pada ${now.toLocaleString('id-ID')}`,
        costItems: costItems,
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

      setSuccessMessage(`Berhasil memposting SPPD [${newSppdRecord.noSppd}] ke Formulir SPPD Dinas & Database! Total: Rp ${totalAmount.toLocaleString('id-ID')}`);
    } catch (err: any) {
      setErrorMessage('Gagal memposting ke Formulir SPPD: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

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
      return {
        'No.': idx + 1,
        'Tanggal': t.date,
        'Nama Karyawan': t.recipient,
        'Jabatan': SPPD_POSITIONS.find(p => p.key === t.positionKey)?.label || t.positionKey,
        'Rincian Pengeluaran SPPD': t.description,
        'Kode Akun COA': t.sppdAccountCode,
        'Nama Akun COA SPPD': t.sppdAccountName,
        'Nominal (Rp)': t.amount,
        'Status Plafon': comp.label,
        'Tingkat Keyakinan': t.confidence.toUpperCase()
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pemetaan Akun SPPD');

    const fileName = `Pemetaan_Akun_SPPD_${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().substring(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Export PDF
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
    doc.text(`Karyawan: ${employeeName || '-'} | Jabatan: ${SPPD_POSITIONS.find(p => p.key === employeePosition)?.label || 'Staf'}`, 14, 33);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')} | Total Biaya: Rp ${totalExpense.toLocaleString('id-ID')}`, 14, 38);

    // Grouped Summary Table
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

    // Detailed Item Table
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 100;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RINCIAN TRANSAKSI SPPD PER BARIS', 14, finalY);

    const detailRows = transactions.map((t, i) => [
      i + 1,
      t.date,
      t.description,
      t.sppdAccountCode,
      t.category,
      `Rp ${t.amount.toLocaleString('id-ID')}`,
      getComplianceStatus(t).status.toUpperCase()
    ]);

    autoTable(doc, {
      startY: finalY + 3,
      head: [['No', 'Tanggal', 'Rincian Pengeluaran', 'Kode COA', 'Kategori', 'Nominal', 'Status Plafon']],
      body: detailRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 1.5 }
    });

    doc.save(`Laporan_Pemetaan_SPPD_${reportTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
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
            {driveAccount?.email ? (
              <div className="bg-amber-950/90 border border-amber-400/40 text-amber-300 font-bold px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span>Google Drive Master:</span>
                <span className="text-white font-mono">{driveAccount.email}</span>
                <button
                  type="button"
                  onClick={handleConnectGoogleDrive}
                  disabled={isDriveConnecting}
                  title="Sinkronkan Ulang Akun Google Drive"
                  className="hover:text-amber-100 ml-1 underline cursor-pointer text-[11px]"
                >
                  {isDriveConnecting ? 'Sinkronisasi...' : 'Sinkronkan'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogleDrive}
                disabled={isDriveConnecting}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-xs animate-pulse"
              >
                <RefreshCw size={14} className={isDriveConnecting ? "animate-spin" : ""} />
                <span>Hubungkan Google Drive Master</span>
              </button>
            )}

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
            </div>
          </div>

          {/* Grouped Category Recap (9 Official Categories) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groupedSummary.map(({ guideline, totalAmount, count }) => (
              <div 
                key={guideline.id} 
                className={`p-4 rounded-2xl border transition flex flex-col justify-between ${
                  totalAmount > 0 
                    ? 'bg-amber-50/40 border-amber-200' 
                    : 'bg-white border-stone-200 opacity-60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 bg-stone-200/80 text-stone-700 rounded font-bold">
                      {guideline.defaultCoaCode}
                    </span>
                    <span className="text-stone-400 font-bold">{count} Transaksi</span>
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
                  <span className="text-[10px] text-stone-400">Total:</span>
                  <span className="font-black text-amber-900">
                    Rp {totalAmount.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search size={14} className="text-stone-400" />
              <input
                type="text"
                placeholder="Cari rincian pengeluaran, kode COA, atau kategori..."
                value={txSearchQuery}
                onChange={(e) => setTxSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none focus:outline-none text-xs font-sans text-stone-800"
              />
            </div>

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
                <option value="all">Semua Status Plafon</option>
                <option value="sesuai">Sesuai Plafon</option>
                <option value="melebihi">Melebihi Plafon</option>
                <option value="tiket_keuangan">Tiket Keuangan</option>
              </select>
            </div>
          </div>

          {/* Transactions Detailed Table */}
          <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-stone-900 text-white font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3 w-12 text-center">No</th>
                    <th className="py-3 px-3 w-28">Tanggal</th>
                    <th className="py-3 px-4">Rincian Pengeluaran SPPD</th>
                    <th className="py-3 px-3 w-36">Kategori COA SPPD</th>
                    <th className="py-3 px-3 w-32 text-right">Nominal (Rp)</th>
                    <th className="py-3 px-3 w-40 text-center">Status Plafon</th>
                    <th className="py-3 px-2 w-20 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 font-sans">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-stone-400 font-mono">
                        Tidak ada transaksi yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((t, idx) => {
                      const comp = getComplianceStatus(t);
                      return (
                        <tr key={t.id} className="hover:bg-amber-50/30 transition">
                          <td className="py-3 px-3 text-center font-mono text-stone-400">{idx + 1}</td>
                          <td className="py-3 px-3 font-mono text-stone-600">{t.date}</td>
                          <td className="py-3 px-4 font-semibold text-stone-900">
                            <div>{t.description}</div>
                            <div className="text-[10px] text-stone-400 font-mono">
                              Penerima: {t.recipient} ({SPPD_POSITIONS.find(p => p.key === t.positionKey)?.shortLabel || 'Staf'})
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
                          <td className="py-3 px-3 text-right font-mono font-black text-stone-900">
                            Rp {t.amount.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {comp.status === 'sesuai' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md border border-emerald-200">
                                <CheckCircle2 size={11} />
                                <span>Sesuai Plafon</span>
                              </span>
                            )}
                            {comp.status === 'melebihi' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md border border-rose-200" title={comp.label}>
                                <AlertCircle size={11} />
                                <span>Melebihi Plafon</span>
                              </span>
                            )}
                            {comp.status === 'tiket_keuangan' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 bg-sky-100 text-sky-800 rounded-md border border-sky-200" title={comp.label}>
                                <Info size={11} />
                                <span>Tiket Keuangan</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setTransactions(prev => prev.filter(item => item.id !== t.id));
                              }}
                              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Hapus Baris"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}

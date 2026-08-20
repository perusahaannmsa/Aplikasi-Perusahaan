import React, { useState, useEffect, useRef } from 'react';
import { Submission, SubmissionItem, PaymentMethod, REQUIRED_TRANSACTION_DOCS } from '../types';
import { 
  googleDriveLogin, 
  getStoredGoogleDriveToken, 
  setGoogleDriveToken, 
  getConnectedDrives,
  ensureValidDriveToken
} from '../firebase';
import { DriveAccountsManager } from './DriveAccountsManager';
import { SppdIntegration, SppdRecord } from './SppdIntegration';
import { Trash2, Plus, ArrowLeft, Save, AlertCircle, Sparkles, Cloud, Loader2, FileText, Coins, FileUp, ExternalLink, GitBranch, X, Calculator, Percent, Tag, Receipt } from 'lucide-react';
import { generateF1PdfBytes, generateF2PdfBytes, formatDateIndonesian, convertImageToPdf, formatRupiah, analyzeVolumeInput } from '../utils';

interface SubmissionFormProps {
  initialSubmission?: Submission | null;
  userProfile?: any;
  submissions?: Submission[];
  onSave: (submission: Submission) => Promise<void> | void;
  onCancel: () => void;
  pettyCashHolders?: string[];
  onOpenManageHolders?: () => void;
}

const COMMON_NAMES = {
  dibuatOleh: ['Nur Wahyudi', 'Indra Wijaya', 'Sri Utami'],
  disetujuiOleh: ['Harijon', 'Andi Nursyam Halid', 'Tanpa Disetujui'],
  diverifikasiOleh: ['Andi Muhammad Rifki', 'Andi Nursyam Halid', 'Andi Dhiya Salsabila', 'Andi Rifki Naufal'],
  disetujuiOleh2: ['Harijon', 'Andi Nursyam Halid'],
  dibukukanOleh: ['Sri Ekowati', 'Dewi Lestari'],
  lokasi: ['Lt. 1', 'Lt. 2', 'Lt. 3', 'Gedung Utama', 'Gudang Utama'],
  jenisPengajuan: [
    'Petty Cash Lapangan',
    'Petty Cash Kantor Pusat',
    'Biaya Gaji',
    'Biaya Operasional',
    'Biaya Perjalanan Dinas (SPPD)',
    'Pemeliharaan AC',
    'Perlengkapan Kantor',
    'Transportasi'
  ],
  penerima: ['ANDI DHIYA SALSABILA', 'MANDIRI STATIONERY', 'CV ABADI TEKNIK', 'PRATAMA SECURITY', 'KANTIN SEHAT', 'SURYO PRANOTO', 'MUHAMMAD AKBAR']
};

const extractGoogleDriveFileId = (url: string): string | null => {
  if (!url) return null;
  const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) {
    return dMatch[1];
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }
  return null;
};

// ═════════ GOOGLE DRIVE DIR HIERARCHY HELPER ACTIONS ═════════
const getOrCreateFolder = async (token: string, name: string, parentId: string): Promise<string> => {
  const cleanName = name.trim();
  // Escape backslashes first, then single quotes for safe Google Drive query string syntax
  const cleanSearchName = cleanName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const query = `name = '${cleanSearchName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  
  console.log(`[Drive API] Searching folder: "${cleanName}" under parent "${parentId}"`);
  
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED_DRIVE_TOKEN');
    }
    throw new Error(`Gagal mencari folder '${cleanName}': ${res.statusText}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    console.log(`[Drive API] Folder found: "${cleanName}" with ID: ${data.files[0].id}`);
    return data.files[0].id;
  }

  console.log(`[Drive API] Folder NOT found. Creating folder: "${cleanName}" under parent "${parentId}"`);

  // Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: cleanName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });

  if (!createRes.ok) {
    if (createRes.status === 401) {
      throw new Error('UNAUTHORIZED_DRIVE_TOKEN');
    }
    const errText = await createRes.text();
    throw new Error(`Gagal membuat folder '${cleanName}': ${errText}`);
  }

  const createdData = await createRes.json();
  console.log(`[Drive API] Folder created: "${cleanName}" with ID: ${createdData.id}`);
  return createdData.id;
};

const parseCompanyAndSequence = (kodeStr: string): { company: string; customFolderKode: string } => {
  const clean = (kodeStr || '').trim();
  const upperClean = clean.toUpperCase();
  
  let company = 'nmsa'; // Default company
  
  // 1. If it explicitly contains "NMSA" anywhere, company is "nmsa"
  if (upperClean.includes('NMSA')) {
    company = 'nmsa';
  } else {
    const parts = clean.split(/[\s/\\_-]+/);
    if (parts.length > 0) {
      const p0 = parts[0].toUpperCase();
      const isPrefix = ['BKK', 'BKM', 'INV', 'T', 'VOUCHER', 'LPJ'].includes(p0);
      if (isPrefix && parts.length >= 2) {
        const potentialComp = parts[1].toLowerCase();
        const isNumeric = /^\d+$/.test(potentialComp);
        const isMonthNumeral = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii'].includes(potentialComp);
        const isTooShortOrLong = potentialComp.length < 2 || potentialComp.length > 15;
        if (!isNumeric && !isMonthNumeral && !isTooShortOrLong) {
          company = potentialComp;
        } else {
          company = 'nmsa';
        }
      } else if (!isPrefix) {
        const p0Lower = parts[0].toLowerCase();
        const isNumeric = /^\d+$/.test(p0Lower);
        const isTooShortOrLong = p0Lower.length < 2 || p0Lower.length > 15;
        if (!isNumeric && !isTooShortOrLong) {
          company = p0Lower;
        } else {
          company = 'nmsa';
        }
      }
    }
  }

  company = company.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!company || /^\d+$/.test(company)) {
    company = 'nmsa';
  }

  // To build customFolderKode:
  const partsForFolder = clean.split(/[\s/\\_-]+/);
  let prefix = 'BKK';
  let seq = '';
  if (partsForFolder.length > 0) {
    const p0 = partsForFolder[0].toUpperCase();
    if (['BKK', 'BKM', 'INV', 'T', 'VOUCHER', 'LPJ'].includes(p0)) {
      prefix = p0;
      seq = partsForFolder[partsForFolder.length - 1] || '';
    } else {
      prefix = 'BKK';
      seq = partsForFolder[partsForFolder.length - 1] || '';
    }
  }
  const cleanSeq = (seq || '').toUpperCase();
  const customFolderKode = `${prefix}-${company.toUpperCase()}-${cleanSeq}`;

  return {
    company,
    customFolderKode
  };
};

const getOrCreateFolderHierarchy = async (
  token: string,
  company: string,
  year: string,
  month: string,
  day: string,
  jenisPengajuan: string,
  dibayarkanKepada: string
): Promise<string> => {
  // 1. Get or create 'Voucher-APP' under 'root'
  const rootId = 'root';
  const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
  
  // 2. Get or create company folder under 'Voucher-APP'
  const companyId = await getOrCreateFolder(token, company, voucherAppId);

  // 3. Get or create year folder under company folder
  const yearId = await getOrCreateFolder(token, year, companyId);
  
  // 4. Get or create month folder under year folder
  const monthId = await getOrCreateFolder(token, month, yearId);
  
  // 5. Get or create day folder under month folder
  const dayId = await getOrCreateFolder(token, day, monthId);

  // 6. Get or create custom transaction folder under day folder named (Jenis_Pengajuan - Dibayarkan_Kepada)
  const cleanJenis = (jenisPengajuan || 'Pengajuan').trim().replace(/[\/\\?%*:|"<>.]/g, '');
  const cleanPenerima = (dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
  const txFolderName = `${cleanJenis} - ${cleanPenerima}`;

  const txFolderId = await getOrCreateFolder(token, txFolderName, dayId);
  
  return txFolderId;
};

const getOrCreatePettyCashFolderHierarchy = async (
  token: string,
  custodian: string,
  year: string,
  month: string,
  day: string
): Promise<string> => {
  // 1. Get or create 'Voucher-APP' under 'root'
  const rootId = 'root';
  const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
  
  // 2. Get or create 'Petty Cash' folder under 'Voucher-APP'
  const pettyCashId = await getOrCreateFolder(token, 'Petty Cash', voucherAppId);

  // 3. Get or create custodian folder under 'Petty Cash' folder
  const cleanCustodian = (custodian || 'Pemegang Petty Cash').trim().replace(/[\/\\?%*:|"<>.]/g, '');
  const custodianId = await getOrCreateFolder(token, cleanCustodian, pettyCashId);
  
  // 4. Get or create year folder under custodian folder
  const yearId = await getOrCreateFolder(token, year, custodianId);
  
  // 5. Get or create month folder under year folder
  const monthId = await getOrCreateFolder(token, month, yearId);
  
  // 6. Get or create day folder under month folder
  const dayId = await getOrCreateFolder(token, day, monthId);

  return dayId;
};

// Helper to auto-generate monthly dynamic accounting voucher codes based on Company name, month, and year.
const generateAutoKode = (targetDate: string, compCode: string, allSubmissions: Submission[], currentId?: string): string => {
  if (!targetDate) return '';
  
  const dateParts = targetDate.split('-');
  if (dateParts.length !== 3) return '';
  const yearStr = dateParts[0];
  const monthIdx = parseInt(dateParts[1], 10);
  
  const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const romanMonth = romanMonths[monthIdx - 1] || 'I';
  
  // 2 digit year
  const yy = yearStr.substring(yearStr.length - 2);
  const cleanComp = (compCode || 'NMSA').toUpperCase();
  
  let maxSeq = 1000; // Next starts at 1001 (maxSeq + 1)
  
  allSubmissions.forEach(sub => {
    if (currentId && sub.id === currentId) return;
    const subKode = sub.kode;
    if (!subKode) return;
    
    // Check match for exactly formatting: e.g. BKK-NMSA/VI/26/1001
    const pattern = new RegExp(`^BKK-${cleanComp}\\/${romanMonth}\\/${yy}\\/(\\d+)$`, 'i');
    const match = subKode.trim().match(pattern);
    if (match) {
      const seqVal = parseInt(match[1], 10);
      if (!isNaN(seqVal)) {
        if (seqVal > maxSeq) {
          maxSeq = seqVal;
        }
      }
    }
  });
  
  const nextSeq = maxSeq + 1;
  return `BKK-${cleanComp}/${romanMonth}/${yy}/${nextSeq}`;
};

export const SubmissionForm: React.FC<SubmissionFormProps> = ({
  initialSubmission,
  userProfile,
  submissions = [],
  onSave,
  onCancel,
  pettyCashHolders = [],
  onOpenManageHolders,
}) => {
  // Local states
  const [id, setId] = useState('');
  const [isManualKode, setIsManualKode] = useState(false);
  const [lokasi, setLokasi] = useState('Lt. 1');
  const [tanggal, setTanggal] = useState('');
  const [jenisPengajuan, setJenisPengajuan] = useState('Biaya Gaji');
  const [kode, setKode] = useState('HO');
  const [dibayarkanKepada, setDibayarkanKepada] = useState('');
  const [dibayarkanDengan, setDibayarkanDengan] = useState<PaymentMethod>('Cek/Transfer');
  const [status, setStatus] = useState<'Lunas' | 'Belum Lunas'>('Belum Lunas');
  const [notes, setNotes] = useState('');

  // Effective petty cash holders master list
  const effectiveHolders = (pettyCashHolders && pettyCashHolders.length > 0)
    ? pettyCashHolders
    : ['Suryo Pranoto', 'Muhammad Akbar', 'Nurul Izza', 'Andi Dhiya Salsabila'];

  // Invoice fields
  const [isInvoice, setIsInvoice] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState<number | string>('');

  // Petty Cash & SPPD fields
  const [isPettyCash, setIsPettyCash] = useState(false);
  const [isSppd, setIsSppd] = useState(false);
  const [pettyCashCustodian, setPettyCashCustodian] = useState('');
  const [pettyCashLocalFile, setPettyCashLocalFile] = useState<File | null>(null);
  const [pettyCashDriveFile, setPettyCashDriveFile] = useState<{ url: string; name: string } | null>(null);
  const isSubmittingRef = useRef(false);

  // Dynamic options for Jenis Pengajuan compiled from presets and past submissions
  const jenisOptions = React.useMemo(() => {
    const set = new Set<string>();
    COMMON_NAMES.jenisPengajuan.forEach(j => { if (j && j.trim()) set.add(j.trim()); });
    submissions.forEach(s => {
      if (s.jenisPengajuan && s.jenisPengajuan.trim()) {
        set.add(s.jenisPengajuan.trim());
      }
    });
    return Array.from(set);
  }, [submissions]);

  // Dynamic recipient history compiled from previous submissions, master holders, and presets
  const recipientHistory = React.useMemo(() => {
    const set = new Set<string>();
    if (isPettyCash) {
      // In Petty Cash mode, suggest uppercase names
      effectiveHolders.forEach(h => { if (h && h.trim()) set.add(h.trim().toUpperCase()); });
      COMMON_NAMES.penerima.forEach(p => { if (p && p.trim()) set.add(p.trim().toUpperCase()); });
      submissions.forEach(s => {
        if (s.dibayarkanKepada && s.dibayarkanKepada.trim()) {
          set.add(s.dibayarkanKepada.trim().toUpperCase());
        }
        if (s.pettyCashCustodian && s.pettyCashCustodian.trim()) {
          set.add(s.pettyCashCustodian.trim().toUpperCase());
        }
      });
      try {
        const saved = JSON.parse(localStorage.getItem('NUSANTARA_RECIPIENT_HISTORY') || '[]');
        if (Array.isArray(saved)) {
          saved.forEach((s: string) => { if (s && s.trim()) set.add(s.trim().toUpperCase()); });
        }
      } catch (e) {}
    } else {
      // In Standard mode, suggest historical names with their original casing
      COMMON_NAMES.penerima.forEach(p => { if (p && p.trim()) set.add(p.trim()); });
      effectiveHolders.forEach(h => { if (h && h.trim()) set.add(h.trim()); });
      submissions.forEach(s => {
        if (s.dibayarkanKepada && s.dibayarkanKepada.trim()) {
          set.add(s.dibayarkanKepada.trim());
        }
      });
      try {
        const saved = JSON.parse(localStorage.getItem('NUSANTARA_RECIPIENT_HISTORY') || '[]');
        if (Array.isArray(saved)) {
          saved.forEach((s: string) => { if (s && s.trim()) set.add(s.trim()); });
        }
      } catch (e) {}
    }
    return Array.from(set).sort();
  }, [submissions, effectiveHolders, isPettyCash]);

  // Auto-detect transaction classification (Petty Cash, SPPD, Invoice, Salary, or Standard)
  useEffect(() => {
    const jenisLower = (jenisPengajuan || '').toLowerCase();
    const kodeLower = (kode || '').toLowerCase();

    const isPC = jenisLower.includes('petty cash') || jenisLower.includes('kas kecil');
    setIsPettyCash(isPC);

    const isS = jenisLower.includes('perjalanan dinas') || jenisLower.includes('sppd');
    setIsSppd(isS);

    if (isPC && !pettyCashCustodian) {
      const defHolder = effectiveHolders[0] || 'Suryo Pranoto';
      setPettyCashCustodian(defHolder);
      if (!dibayarkanKepada) {
        setDibayarkanKepada(defHolder.toUpperCase());
      }
    }

    const isInv = jenisLower.includes('invoice') || jenisLower.includes('tagihan') || kodeLower.includes('inv');
    setIsInvoice(isInv);
  }, [jenisPengajuan, kode, effectiveHolders]);
  // Signatures
  const [dibuatOleh, setDibuatOleh] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_CREATOR_NAME') || 'Nur Wahyudi');
  const [disetujuiOleh, setDisetujuiOleh] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_APPROVER_NAME') || '');
  const [diverifikasiOleh, setDiverifikasiOleh] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_NAME') || 'Andi Muhammad Rifki');
  const [diverifikasiJabatan, setDiverifikasiJabatan] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_JABATAN') || 'Direktur');
  const [disetujuiOleh2, setDisetujuiOleh2] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_NAME') || 'Harijon');
  const [disetujuiJabatan2, setDisetujuiJabatan2] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_JABATAN') || 'Direktur Keuangan');
  const [dibukukanOleh, setDibukukanOleh] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_NAME') || 'Sri Ekowati');
  const [dibukukanJabatan, setDibukukanJabatan] = useState(() => localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_JABATAN') || 'Accounting');

  // Salary details state
  const [namaKaryawanSalary, setNamaKaryawanSalary] = useState('');
  const [nikJabatanSalary, setNikJabatanSalary] = useState('');
  const [periodeBulanSalary, setPeriodeBulanSalary] = useState('');
  const [gajiPokokSalary, setGajiPokokSalary] = useState<number | ''>('');
  const [tunjanganJabatanSalary, setTunjanganJabatanSalary] = useState<number | ''>('');
  const [tunjanganOperasionalSalary, setTunjanganOperasionalSalary] = useState<number | ''>('');
  const [uangMakanTransportSalary, setUangMakanTransportSalary] = useState<number | ''>('');
  const [bonusInsentifSalary, setBonusInsentifSalary] = useState<number | ''>('');
  const [potonganBpjsSalary, setPotonganBpjsSalary] = useState<number | ''>('');
  const [potonganPajakSalary, setPotonganPajakSalary] = useState<number | ''>('');
  const [potonganLainSalary, setPotonganLainSalary] = useState<number | ''>('');
  const [keteranganPotonganSalary, setKeteranganPotonganSalary] = useState('');

  // Table items
  const [items, setItems] = useState<SubmissionItem[]>([
    { id: '1', no: 1, item: '', jumlahVolume: '', total: 0, keterangan: '' }
  ]);

  // Tax calculation helpers and modal states
  const [showCustomTaxModal, setShowCustomTaxModal] = useState<boolean>(false);
  const [customTaxType, setCustomTaxType] = useState<'ppn' | 'pph'>('ppn');
  const [customTaxRateInput, setCustomTaxRateInput] = useState<string>('11');
  const [customTaxNominalInput, setCustomTaxNominalInput] = useState<string>('');
  const [customTaxMode, setCustomTaxMode] = useState<'percentage' | 'nominal'>('percentage');

  // Calculates DPP (Dasar Pengenaan Pajak) from primary items (excluding existing PPn and PPh rows)
  const getBaseDppAmount = () => {
    // If the 1st row has nominal > 0 and is not a tax row, use row 1 total as primary DPP (standard Indonesian invoice convention)
    const firstItem = items[0];
    if (firstItem && Number(firstItem.total) > 0 && !/^(ppn|pph)/i.test(firstItem.item)) {
      return Number(firstItem.total);
    }
    const nonTax = items.filter(i => !/^(ppn|pph)/i.test(i.item.trim()));
    const sum = nonTax.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
    return sum > 0 ? sum : 0;
  };

  const handleApplyPpn = (ratePercent: number, customNominal?: number) => {
    const dpp = getBaseDppAmount();
    const finalNominal = customNominal !== undefined ? Math.round(customNominal) : Math.round(dpp * (ratePercent / 100));
    
    // Check if PPn row already exists
    const existingIdx = items.findIndex(i => /^ppn/i.test(i.item.trim()));
    if (existingIdx !== -1) {
      setItems(prev => {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          item: `PPn ${ratePercent}%`,
          jumlahVolume: `${ratePercent}%`,
          total: finalNominal,
          keterangan: next[existingIdx].keterangan || 'Faktur Pajak Terlampir'
        };
        return next;
      });
    } else {
      setItems(prev => [
        ...prev,
        {
          id: `ppn-${Date.now()}`,
          no: prev.length + 1,
          item: `PPn ${ratePercent}%`,
          jumlahVolume: `${ratePercent}%`,
          total: finalNominal,
          keterangan: 'Faktur Pajak Terlampir'
        }
      ]);
    }
  };

  const handleApplyPph = (ratePercent: number, customNominal?: number) => {
    const dpp = getBaseDppAmount();
    const finalNominal = customNominal !== undefined 
      ? -Math.abs(Math.round(customNominal)) 
      : -Math.abs(Math.round(dpp * (ratePercent / 100)));
    
    // Check if PPh row already exists
    const existingIdx = items.findIndex(i => /^pph/i.test(i.item.trim()));
    if (existingIdx !== -1) {
      setItems(prev => {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          item: `PPh ( -${ratePercent}% )`,
          jumlahVolume: `-${ratePercent}%`,
          total: finalNominal,
          keterangan: next[existingIdx].keterangan || 'Bukti Potong PPh 23 Terlampir'
        };
        return next;
      });
    } else {
      setItems(prev => [
        ...prev,
        {
          id: `pph-${Date.now()}`,
          no: prev.length + 1,
          item: `PPh ( -${ratePercent}% )`,
          jumlahVolume: `-${ratePercent}%`,
          total: finalNominal,
          keterangan: 'Bukti Potong PPh 23 Terlampir'
        }
      ]);
    }
  };

  const [validationError, setValidationError] = useState('');
  const [showSppdModal, setShowSppdModal] = useState(false);

  const handleImportSppdData = (sppd: any) => {
    setJenisPengajuan('Biaya Perjalanan Dinas (SPPD)');
    setDibayarkanKepada(sppd.namaPegawai || sppd.namaPekerja || '');
    setNotes(`Voucher Biaya Perjalanan Dinas (SPPD) No: ${sppd.noSppd}. Kota Tujuan: ${sppd.kotaTujuan} (${sppd.tanggalBerangkat || sppd.tanggalMulai} s.d ${sppd.tanggalKembali || sppd.tanggalSelesai}). Maksud Dinas: ${sppd.maksudDinas || sppd.tujuanPerjalanan}`);
    
    const fullRec = sppd.fullRecord || sppd;
    if (fullRec && fullRec.costItems && Array.isArray(fullRec.costItems) && fullRec.costItems.length > 0) {
      const mappedItems = fullRec.costItems.map((c: any, index: number) => ({
        id: `sppd_item_${index + 1}_` + Date.now(),
        no: index + 1,
        item: `${c.kategori} - ${c.rincian || ''}`,
        jumlahVolume: '1 Paket',
        total: c.jumlah || 0,
        keterangan: `SPPD ${sppd.noSppd} (${sppd.kotaTujuan || ''})`
      }));
      setItems(mappedItems);
    } else {
      const generated = [
        {
          id: 'sppd_1_' + Date.now(),
          no: 1,
          item: `Biaya Transportasi & Tiket SPPD (${sppd.kotaTujuan})`,
          jumlahVolume: '1 Paket',
          total: sppd.biayaTransport || 0,
          keterangan: `Transportasi SPPD ${sppd.noSppd}`
        },
        {
          id: 'sppd_2_' + Date.now(),
          no: 2,
          item: `Uang Harian Perjalanan Dinas (${sppd.tanggalBerangkat} s.d ${sppd.tanggalKembali})`,
          jumlahVolume: '1 Paket',
          total: sppd.uangHarian || 0,
          keterangan: `Uang Harian SPPD ${sppd.noSppd}`
        },
        {
          id: 'sppd_3_' + Date.now(),
          no: 3,
          item: `Biaya Akomodasi & Penginapan Hotel (${sppd.kotaTujuan})`,
          jumlahVolume: '1 Paket',
          total: sppd.biayaPenginapan || 0,
          keterangan: `Penginapan SPPD ${sppd.noSppd}`
        }
      ].filter(i => i.total > 0 || i.no === 1);
      setItems(generated);
    }
    setShowSppdModal(false);
  };
  
  // AI Receipt Scanner states
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResultJson, setScanResultJson] = useState<any>(null);
  const [showLedgerCols, setShowLedgerCols] = useState(false);

  // File handler for AI Receipt processing
  const handleAiScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanSuccess(false);
    setScanError('');
    setScanResultJson(null);

    try {
      const reader = new FileReader();
      const fileLoadedPromise = new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
        reader.onload = () => {
          const resultStr = reader.result as string;
          resolve({
            base64: resultStr,
            mimeType: file.type || 'application/octet-stream'
          });
        };
        reader.onerror = () => {
          reject(new Error('Gagal membaca berkas.'));
        };
        reader.readAsDataURL(file);
      });

      const { base64, mimeType } = await fileLoadedPromise;

      const response = await fetch('/api/gemini/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType: mimeType
        })
      });

      if (!response.ok) {
        const errObj = await response.json();
        throw new Error(errObj.error || errObj.details || 'Gagal memproses struk menggunakan Gemini AI.');
      }

      const resData = await response.json();
      if (resData.success && resData.result) {
        const extracted = resData.result;
        setScanResultJson(extracted);
        setScanSuccess(true);

        // Pre-fill fields
        if (extracted.tanggal) setTanggal(extracted.tanggal);
        if (extracted.deskripsi) setDibayarkanKepada(extracted.deskripsi);
        if (extracted.keterangan) setNotes(extracted.keterangan);
        if (extracted.nominal) {
          setInvoiceAmount(extracted.nominal);
          setIsInvoice(true);
        }

        // Check if extracted items have ledger details
        let hasLedger = false;

        if (extracted.items && extracted.items.length > 0) {
          const mappedItems: SubmissionItem[] = extracted.items.map((it: any, idx: number) => {
            if (it.debit !== undefined || it.kredit !== undefined || it.saldo !== undefined) {
              hasLedger = true;
            }
            return {
              id: `ai-${idx}-${Math.random()}`,
              no: idx + 1,
              item: it.item || 'Item Terdeteksi',
              jumlahVolume: it.jumlahVolume || '1 Ls',
              total: Number(it.total) || 0,
              keterangan: it.keterangan || 'Diekstrak oleh AI',
              debit: it.debit,
              kredit: it.kredit,
              saldo: it.saldo
            };
          });
          setItems(mappedItems);
        } else {
          if (extracted.debit !== undefined || extracted.kredit !== undefined || extracted.saldo !== undefined) {
            hasLedger = true;
          }
          setItems([
            {
              id: `ai-single-${Math.random()}`,
              no: 1,
              item: extracted.deskripsi || extracted.keterangan || 'Belanja Struk/Kwitansi',
              jumlahVolume: '1 Ls',
              total: Number(extracted.nominal) || 0,
              keterangan: 'Diekstrak oleh AI',
              debit: extracted.debit,
              kredit: extracted.kredit,
              saldo: extracted.saldo
            }
          ]);
        }

        if (hasLedger) {
          setShowLedgerCols(true);
        }
      } else {
        throw new Error('Ekstraksi AI tidak membuahkan hasil data JSON yang valid.');
      }
    } catch (err: any) {
      console.error(err);
      setScanError(err.message || 'Gagal melakukan pemindaian berkas.');
    } finally {
      setIsScanning(false);
    }
  };

  // Google Drive attachment support states
  const [googleDriveFileUrl, setGoogleDriveFileUrl] = useState('');
  const [googleDriveFileName, setGoogleDriveFileName] = useState('');
  const [googleDriveFiles, setGoogleDriveFiles] = useState<{ url: string; name: string }[]>([]);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // keep for display if needed
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Modern unified local/drive files list state
  const [fileItems, setFileItems] = useState<{ id: string; name: string; file?: File; url?: string; isDrive: boolean; docType?: string }[]>([]);
  const [isMergedMethod, setIsMergedMethod] = useState(false);
  
  // Dedicated Bukti Pembayaran states
  const [buktiPembayaranFile, setBuktiPembayaranFile] = useState<File | null>(null);
  const [buktiPembayaranDrive, setBuktiPembayaranDrive] = useState<{ url: string; name: string } | null>(null);

  // Google Drive File deletion confirmation warning states
  const [driveFileToDelete, setDriveFileToDelete] = useState<{
    url: string;
    name: string;
    onConfirm: () => void;
    onForceDeleteFromApp: () => void;
  } | null>(null);
  const [fileToDeleteStatus, setFileToDeleteStatus] = useState<'idle' | 'deleting'>('idle');
  const [fileToDeleteError, setFileToDeleteError] = useState<string | null>(null);

  // Sync payment status state with payment proof file presence
  useEffect(() => {
    if (buktiPembayaranFile || buktiPembayaranDrive) {
      setStatus('Lunas');
    } else if (initialSubmission && initialSubmission.status === 'Lunas') {
      setStatus('Lunas'); // Preserve manual lunas marking when editing
    } else {
      setStatus('Belum Lunas');
    }
  }, [buktiPembayaranFile, buktiPembayaranDrive, initialSubmission]);

  // Check Drive connection status automatically and react to token refresh events
  useEffect(() => {
    const checkStatus = async () => {
      const token = await ensureValidDriveToken();
      if (token) {
        setIsDriveConnected(true);
      } else {
        const drives = getConnectedDrives();
        setIsDriveConnected(drives.length > 0);
      }
    };
    checkStatus();

    const onDriveUpdated = () => {
      const drives = getConnectedDrives();
      setIsDriveConnected(drives.length > 0 || !!getStoredGoogleDriveToken());
    };

    window.addEventListener('nusantara-drive-updated', onDriveUpdated);
    return () => {
      window.removeEventListener('nusantara-drive-updated', onDriveUpdated);
    };
  }, []);

  const handleConnectDrive = async () => {
    setUploadError('');
    try {
      const result = await googleDriveLogin();
      if (result.accessToken) {
        setIsDriveConnected(true);
      }
    } catch (err: any) {
      setUploadError(`Gagal menghubungkan Google Drive Anda: ${err.message || err}`);
    }
  };

  const downloadGoogleDriveFile = async (url: string, token: string): Promise<Uint8Array | null> => {
    try {
      const match = url.match(/[-\w]{25,}/);
      if (!match) return null;
      const fileId = match[0];
      
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        console.error(`Failed to download ${url} from Google Drive: ${res.statusText}`);
        return null;
      }
      
      const arrayBuffer = await res.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      console.error(`Error downloading Google Drive file ${url}:`, error);
      return null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError('');
    const hasInvoiceVendorDoc = fileItems.some(f => f.docType === 'invoice_vendor');

    const newItems = (Array.from(files) as File[]).map((file, idx) => {
      const lowerName = file.name.toLowerCase();
      let docType: string | undefined = undefined;
      if (
        isInvoice &&
        !hasInvoiceVendorDoc &&
        idx === 0
      ) {
        docType = 'invoice_vendor';
      } else if (isInvoice && (lowerName.includes('invoice') || lowerName.includes('tagihan') || lowerName.includes('faktur') || lowerName.includes('nota'))) {
        docType = 'invoice_vendor';
      }

      return {
        id: `local-${Date.now()}-${idx}`,
        name: file.name,
        file: file,
        isDrive: false,
        docType
      };
    });

    setFileItems(prev => [...prev, ...newItems]);
    // Reset file input target value so user can select the same/edited files again
    e.target.value = '';
  };

  const handleSpecificFileUpload = (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError('');
    const extDoc = REQUIRED_TRANSACTION_DOCS.find(d => d.key === docType);
    const label = extDoc ? extDoc.label : 'Dokumen';

    const newItems = (Array.from(files) as File[]).map((file, idx) => ({
      id: `local-${docType}-${Date.now()}-${idx}`,
      name: `${label} - ${file.name}`,
      file: file,
      isDrive: false,
      docType: docType
    }));

    // Filter out any existing file with this docType to replace it easily
    setFileItems(prev => {
      const filtered = prev.filter(item => item.docType !== docType);
      return [...filtered, ...newItems];
    });

    e.target.value = '';
  };

  const handleDeleteFileItem = (id: string) => {
    const item = fileItems.find(f => f.id === id);
    if (item && item.isDrive && item.url) {
      setFileToDeleteError(null);
      setDriveFileToDelete({
        url: item.url,
        name: item.name,
        onConfirm: async () => {
          setFileToDeleteStatus('deleting');
          const fileId = extractGoogleDriveFileId(item.url || '');
          if (fileId) {
            const token = await ensureValidDriveToken();
            if (token) {
              try {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (res.ok || res.status === 204 || res.status === 404) {
                  setFileItems(prev => prev.filter(f => f.id !== id));
                  setDriveFileToDelete(null);
                } else {
                  const errText = await res.text();
                  console.error('Delete Drive file failed:', errText);
                  setFileToDeleteError(`Google Drive mengembalikan kesalahan (Status ${res.status}). Sesi mungkin sudah kedaluwarsa.`);
                }
              } catch (err: any) {
                console.error('Error deleting file:', err);
                setFileToDeleteError(`Gagal menghubungi Google Drive: ${err.message || err}`);
              } finally {
                setFileToDeleteStatus('idle');
              }
            } else {
              setFileToDeleteError('Sesi koneksi Google Drive tidak aktif. Silakan hubungkan kembali akun Google Drive Anda.');
              setFileToDeleteStatus('idle');
            }
          } else {
            // No file ID could be extracted, just remove from local state
            setFileItems(prev => prev.filter(f => f.id !== id));
            setDriveFileToDelete(null);
          }
        },
        onForceDeleteFromApp: () => {
          setFileItems(prev => prev.filter(f => f.id !== id));
          setDriveFileToDelete(null);
          setFileToDeleteError(null);
        }
      });
    } else {
      setFileItems(prev => prev.filter(f => f.id !== id));
    }
  };

  const handleDeleteBuktiPembayaran = () => {
    if (buktiPembayaranDrive && buktiPembayaranDrive.url) {
      setFileToDeleteError(null);
      setDriveFileToDelete({
        url: buktiPembayaranDrive.url,
        name: buktiPembayaranDrive.name,
        onConfirm: async () => {
          setFileToDeleteStatus('deleting');
          const fileId = extractGoogleDriveFileId(buktiPembayaranDrive.url);
          if (fileId) {
            const token = await ensureValidDriveToken();
            if (token) {
              try {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (res.ok || res.status === 204 || res.status === 404) {
                  setBuktiPembayaranDrive(null);
                  setDriveFileToDelete(null);
                } else {
                  const errText = await res.text();
                  console.error('Delete Drive file failed:', errText);
                  setFileToDeleteError(`Google Drive mengembalikan kesalahan (Status ${res.status}).`);
                }
              } catch (err: any) {
                console.error('Error deleting file:', err);
                setFileToDeleteError(`Gagal menghubungi Google Drive: ${err.message || err}`);
              } finally {
                setFileToDeleteStatus('idle');
              }
            } else {
              setFileToDeleteError('Sesi koneksi Google Drive tidak aktif atau kadaluarsa.');
              setFileToDeleteStatus('idle');
            }
          } else {
            setBuktiPembayaranDrive(null);
            setDriveFileToDelete(null);
          }
        },
        onForceDeleteFromApp: () => {
          setBuktiPembayaranDrive(null);
          setDriveFileToDelete(null);
          setFileToDeleteError(null);
        }
      });
    } else {
      setBuktiPembayaranDrive(null);
    }
  };

  const handleDeletePettyCashDriveFile = () => {
    if (pettyCashDriveFile && pettyCashDriveFile.url) {
      setFileToDeleteError(null);
      setDriveFileToDelete({
        url: pettyCashDriveFile.url,
        name: pettyCashDriveFile.name,
        onConfirm: async () => {
          setFileToDeleteStatus('deleting');
          const fileId = extractGoogleDriveFileId(pettyCashDriveFile.url);
          if (fileId) {
            const token = await ensureValidDriveToken();
            if (token) {
              try {
                const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (res.ok || res.status === 204 || res.status === 404) {
                  setPettyCashDriveFile(null);
                  setDriveFileToDelete(null);
                } else {
                  const errText = await res.text();
                  console.error('Delete Drive file failed:', errText);
                  setFileToDeleteError(`Google Drive mengembalikan kesalahan (Status ${res.status}).`);
                }
              } catch (err: any) {
                console.error('Error deleting file:', err);
                setFileToDeleteError(`Gagal menghubungi Google Drive: ${err.message || err}`);
              } finally {
                setFileToDeleteStatus('idle');
              }
            } else {
              setFileToDeleteError('Sesi koneksi Google Drive tidak aktif atau kadaluarsa.');
              setFileToDeleteStatus('idle');
            }
          } else {
            setPettyCashDriveFile(null);
            setDriveFileToDelete(null);
          }
        },
        onForceDeleteFromApp: () => {
          setPettyCashDriveFile(null);
          setDriveFileToDelete(null);
          setFileToDeleteError(null);
        }
      });
    } else {
      setPettyCashDriveFile(null);
    }
  };

  // Initialize form
  useEffect(() => {
    if (initialSubmission) {
      setId(initialSubmission.id);
      setLokasi(initialSubmission.lokasi);
      setTanggal(initialSubmission.tanggal);
      setJenisPengajuan(initialSubmission.jenisPengajuan);
      setKode(initialSubmission.kode);
      setIsManualKode(true);
      setDibayarkanKepada(initialSubmission.dibayarkanKepada);
      setDibayarkanDengan(initialSubmission.dibayarkanDengan);
      setStatus(initialSubmission.status || 'Belum Lunas');
      setNotes(initialSubmission.notes);
      setIsInvoice(initialSubmission.isInvoice || false);
      setInvoiceNumber(initialSubmission.invoiceNumber || '');
      setInvoiceDate(initialSubmission.invoiceDate || '');
      setInvoiceAmount(initialSubmission.invoiceAmount !== undefined ? initialSubmission.invoiceAmount : '');
      setIsPettyCash(initialSubmission.isPettyCash || false);
      setPettyCashCustodian(initialSubmission.pettyCashCustodian || '');
      setPettyCashDriveFile(initialSubmission.pettyCashFile || null);
      setPettyCashLocalFile(null);
      setGoogleDriveFileUrl(initialSubmission.googleDriveFileUrl || '');
      setGoogleDriveFileName(initialSubmission.googleDriveFileName || '');
      setBuktiPembayaranDrive(initialSubmission.buktiPembayaran || null);
      if (initialSubmission.googleDriveFiles && initialSubmission.googleDriveFiles.length > 0) {
        setGoogleDriveFiles(initialSubmission.googleDriveFiles);
        // Exclude system files (F1, F2, petty cash report, and payment proof) from the editable attachments list
        const filteredAttachmentFiles = initialSubmission.googleDriveFiles.filter(f => {
          if (f.isF1 || f.isF2 || f.isBuktiPembayaran || f.docType === 'petty_cash_report') {
            return false;
          }
          const name = f.name || '';
          if (name.startsWith('F1 - ') && name.endsWith('.pdf')) return false;
          if (name.startsWith('F2 - ') && name.endsWith('.pdf')) return false;
          return true;
        });
        setFileItems(filteredAttachmentFiles.map((f, i) => ({
          id: `drive-${i}`,
          name: f.name,
          url: f.url,
          isDrive: true,
          docType: f.docType
        })));
        setIsMergedMethod(initialSubmission.googleDriveFiles.some(f => f.docType === 'merged_all'));
      } else if (initialSubmission.googleDriveFileUrl) {
        const defaultDrive = [{ url: initialSubmission.googleDriveFileUrl, name: initialSubmission.googleDriveFileName || 'Buka di Drive' }];
        setGoogleDriveFiles(defaultDrive);
        setFileItems(defaultDrive.map((f, i) => ({
          id: `drive-${i}`,
          name: f.name,
          url: f.url,
          isDrive: true
        })));
      } else {
        setGoogleDriveFiles([]);
        setFileItems([]);
      }

      if (initialSubmission.buktiPembayaran) {
        setBuktiPembayaranDrive(initialSubmission.buktiPembayaran);
      } else {
        setBuktiPembayaranDrive(null);
      }
      setBuktiPembayaranFile(null);

      setDibuatOleh(initialSubmission.dibuatOleh);
      setDisetujuiOleh(initialSubmission.disetujuiOleh);
      setDiverifikasiOleh(initialSubmission.diverifikasiOleh);
      setDiverifikasiJabatan(initialSubmission.diverifikasiJabatan);
      setDisetujuiOleh2(initialSubmission.disetujuiOleh2);
      setDisetujuiJabatan2(initialSubmission.disetujuiJabatan2);
      setDibukukanOleh(initialSubmission.dibukukanOleh);
      setDibukukanJabatan(initialSubmission.dibukukanJabatan);

      if (initialSubmission.salaryDetails) {
        const sd = initialSubmission.salaryDetails;
        setNamaKaryawanSalary(sd.namaKaryawan || '');
        setNikJabatanSalary(sd.nikJabatan || '');
        setPeriodeBulanSalary(sd.periodeBulan || '');
        setGajiPokokSalary(sd.gajiPokok !== undefined ? sd.gajiPokok : '');
        setTunjanganJabatanSalary(sd.tunjanganJabatan !== undefined ? sd.tunjanganJabatan : '');
        setTunjanganOperasionalSalary(sd.tunjanganOperasional !== undefined ? sd.tunjanganOperasional : '');
        setUangMakanTransportSalary(sd.uangMakanTransport !== undefined ? sd.uangMakanTransport : '');
        setBonusInsentifSalary(sd.bonusInsentif !== undefined ? sd.bonusInsentif : '');
        setPotonganBpjsSalary(sd.potonganBpjs !== undefined ? sd.potonganBpjs : '');
        setPotonganPajakSalary(sd.potonganPajak !== undefined ? sd.potonganPajak : '');
        setPotonganLainSalary(sd.potonganLain !== undefined ? sd.potonganLain : '');
        setKeteranganPotonganSalary(sd.keteranganPotongan || '');
      }

      setItems(initialSubmission.items.map(item => ({ ...item })));
    } else {
      // Setup default current date
      const today = new Date();
      const yr = today.getFullYear();
      const mo = String(today.getMonth() + 1).padStart(2, '0');
      const dy = String(today.getDate()).padStart(2, '0');
      setTanggal(`${yr}-${mo}-${dy}`);
      
      const details = userProfile?.companyDetails;

      // Defaults mapping dynamically from company metadata profile if loaded
      setId('');
      setLokasi(details?.defaultLokasi || 'Lt. 1');
      setJenisPengajuan(details?.defaultJenis || 'Biaya Gaji');
      setKode(details?.defaultKode || 'HO');
      setIsManualKode(false);
      setDibayarkanKepada('');
      setDibayarkanDengan('Cek/Transfer');
      setStatus('Belum Lunas');
      setNotes('');
      setGoogleDriveFileUrl('');
      setGoogleDriveFileName('');
      setGoogleDriveFiles([]);
      setFileItems([]);
      setBuktiPembayaranFile(null);
      setBuktiPembayaranDrive(null);
      setIsPettyCash(false);
      setPettyCashCustodian('');
      setPettyCashLocalFile(null);
      setPettyCashDriveFile(null);
      const storedDefaultCreator = localStorage.getItem('NUSANTARA_DEFAULT_CREATOR_NAME');
      const storedDefaultApprover = localStorage.getItem('NUSANTARA_DEFAULT_APPROVER_NAME');
      const storedDefaultVerifier = localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_NAME');
      const storedDefaultVerifierJabatan = localStorage.getItem('NUSANTARA_DEFAULT_VERIFIER_JABATAN');
      const storedDefaultApprover2 = localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_NAME');
      const storedDefaultApprover2Jabatan = localStorage.getItem('NUSANTARA_DEFAULT_APPROVER2_JABATAN');
      const storedDefaultBookkeeper = localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_NAME');
      const storedDefaultBookkeeperJabatan = localStorage.getItem('NUSANTARA_DEFAULT_BOOKKEEPER_JABATAN');

      setDibuatOleh(storedDefaultCreator || details?.sigDibuat || userProfile?.fullName || 'Nur Wahyudi');
      setDisetujuiOleh(storedDefaultApprover || details?.sigDisetujui || '');
      setDiverifikasiOleh(storedDefaultVerifier || details?.sigKeuangan || 'Andi Muhammad Rifki');
      setDiverifikasiJabatan(storedDefaultVerifierJabatan || 'Direktur');
      setDisetujuiOleh2(storedDefaultApprover2 || details?.sigDirektur || 'H. A. Nursyam Halid');
      setDisetujuiJabatan2(storedDefaultApprover2Jabatan || 'Direktur Utama');
      setDibukukanOleh(storedDefaultBookkeeper || details?.sigAccounting || 'Sri Ekowati');
      setDibukukanJabatan(storedDefaultBookkeeperJabatan || 'Accounting');

      setItems([
        { id: Math.random().toString(), no: 1, item: '', jumlahVolume: '', total: 0, keterangan: '' }
      ]);
    }
  }, [initialSubmission, userProfile]);

  // Hook to dynamically generate voucher code automatically on fields changes
  useEffect(() => {
    if (isManualKode) return;
    
    const compCode = (userProfile?.companyDetails?.code || userProfile?.companyId || 'NMSA').toUpperCase();
    const autoKode = generateAutoKode(tanggal, compCode, submissions, id);
    if (autoKode) {
      setKode(autoKode);
    }
  }, [tanggal, userProfile, submissions, isManualKode, id]);

  // Handle item input updates
  const handleItemChange = (index: number, field: keyof SubmissionItem, value: any) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    setItems(updatedItems);
  };

  // Add Item Row
  const handleAddItemRow = () => {
    const nextNo = items.length + 1;
    setItems([
      ...items,
      { id: Math.random().toString(), no: nextNo, item: '', jumlahVolume: '', total: 0, keterangan: '' }
    ]);
  };

  // Remove Item Row
  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) {
      setValidationError('Minimal harus ada 1 item pengajuan.');
      return;
    }
    const filtered = items.filter((_, i) => i !== index);
    // Re-index row numbers
    const reindexed = filtered.map((item, idx) => ({
      ...item,
      no: idx + 1
    }));
    setItems(reindexed);
    setValidationError('');
  };

  // Run calculation
  const calculatedGrandTotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingRef.current) return;

    // Validation
    if (!dibayarkanKepada.trim()) {
      setValidationError('Penerima pembayaran (Dibayarkan Kepada) wajib diisi.');
      return;
    }
    if (!tanggal) {
      setValidationError('Tanggal pengajuan wajib ditentukan.');
      return;
    }
    if (items.some(item => !item.item.trim())) {
      setValidationError('Nama item pengajuan tidak boleh kosong.');
      return;
    }
    if (isPettyCash && !pettyCashCustodian.trim()) {
      setValidationError('Nama pemegang Petty cash wajib diisi untuk transaksi Pengisian Petty Cash Lapangan.');
      return;
    }
    if (calculatedGrandTotal < 0) {
      setValidationError('Total Gabungan pengajuan tidak boleh di bawah 0 (negatif). Harap periksa kembali pengeluaran dan pengurangan/potongan Anda.');
      return;
    }

    isSubmittingRef.current = true;
    setValidationError('');
    setIsSaving(true);
    setSaveProgress('Menyiapkan parameter unggahan...');

    try {
      let finalFiles: { url: string; name: string; isF1?: boolean; isF2?: boolean; isBuktiPembayaran?: boolean; docType?: string }[] = [];
      let finalBuktiPembayaran: { url: string; name: string } | undefined = undefined;
      let finalPettyCashFile: { url: string; name: string } | undefined = undefined;
      let targetFolderId: string | undefined = undefined;

      // Ensure we have a valid token (auto-refreshes from cloud Firestore or backend Service Account)
      let token = await ensureValidDriveToken(true);
      if (token) {
        setSaveProgress('Menghitung format tanggal pengajuan...');
        // 1. Resolve Year/Month/Day folder structure parameters
        const parts = (tanggal || '').split('-');
        let yearStr = '';
        let monthStr = '';
        let dayStr = '';

        if (parts.length === 3) {
          yearStr = parts[0];
          const monthIdx = parseInt(parts[1], 10) - 1;
          const INDONESIAN_MONTHS = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
          ];
          const mNum = monthIdx + 1;
          const mName = INDONESIAN_MONTHS[monthIdx] || 'Januari';
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(parseInt(parts[2], 10));
        } else {
          const dateObj = new Date();
          yearStr = String(dateObj.getFullYear());
          const INDONESIAN_MONTHS = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
          ];
          const mNum = dateObj.getMonth() + 1;
          const mName = INDONESIAN_MONTHS[dateObj.getMonth()];
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(dateObj.getDate());
        }

        // Force companyCode to always be 'nmsa' to guarantee folder structure remains inside NMSA company
        const companyCode = 'nmsa';
        const folderCompanyUpper = 'NMSA';
        
        console.log('[Drive Upload] Memulai pembuatan struktur direktori:', { company: folderCompanyUpper, yearStr, monthStr, dayStr });
        
        setSaveProgress('1/6. Mencari/Membuat folder utama: "Voucher-APP"...');
        const rootId = 'root';
        const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
        console.log('[Drive Upload] Folder "Voucher-APP" ID:', voucherAppId);

        setSaveProgress(`2/6. Mencari/Membuat folder perusahaan: "${folderCompanyUpper}"...`);
        const companyId = await getOrCreateFolder(token, folderCompanyUpper, voucherAppId);
        console.log(`[Drive Upload] Folder perusahaan "${folderCompanyUpper}" ID:`, companyId);

        setSaveProgress(`3/6. Mencari/Membuat folder tahun: "${yearStr}"...`);
        const yearId = await getOrCreateFolder(token, yearStr, companyId);
        console.log(`[Drive Upload] Folder tahun "${yearStr}" ID:`, yearId);

        setSaveProgress(`4/6. Mencari/Membuat folder bulan: "${monthStr}"...`);
        const monthId = await getOrCreateFolder(token, monthStr, yearId);
        console.log(`[Drive Upload] Folder bulan "${monthStr}" ID:`, monthId);

        setSaveProgress(`5/6. Mencari/Membuat folder tanggal: "${dayStr}"...`);
        const dayId = await getOrCreateFolder(token, dayStr, monthId);
        console.log(`[Drive Upload] Folder tanggal "${dayStr}" ID:`, dayId);

        // Base name computation based on invoice or standard payment
        const cleanJenis = (jenisPengajuan || 'Pengajuan').trim().replace(/[\/\\?%*:|"<>.]/g, '');
        const cleanPenerima = (dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
        const cleanKode = (kode || '').trim().replace(/[\/\\?%*:|"<>.]/g, '-');
        
        let txBaseName = '';
        if (isInvoice && invoiceNumber) {
          const cleanInv = invoiceNumber.trim().replace(/[\/\\?%*:|"<>.]/g, '');
          txBaseName = `Pembayaran-${cleanInv}`;
        } else {
          txBaseName = `Pembayaran-${cleanJenis}+${cleanPenerima}`;
        }

        const txFolderName = cleanKode ? `${cleanKode} - ${txBaseName}` : txBaseName;

        setSaveProgress(`6/6. Mencari/Membuat folder transaksi khusus: "${txFolderName}"...`);
        targetFolderId = await getOrCreateFolder(token, txFolderName, dayId);
        console.log('[Drive Upload] Folder Transaksi Khusus ID:', targetFolderId);

        // Move existing files if the folder ID has changed (e.g., date/metadata modified)
        const oldFolderId = (initialSubmission as any)?.googleDriveFolderId;
        if (oldFolderId && oldFolderId !== targetFolderId) {
          setSaveProgress('Memindahkan berkas-berkas lama ke folder tanggal baru...');
          try {
            const listRes = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
                `'${oldFolderId}' in parents and trashed = false`
              )}&fields=files(id,name,mimeType)&pageSize=100`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            if (listRes.ok) {
              const listData = await listRes.json();
              const filesToMove = listData.files || [];
              console.log('[Drive Move] Files found in old folder to move:', filesToMove);

              for (const file of filesToMove) {
                // Skip files we're going to regenerate anyway (like F1 & F2) to avoid unnecessary move calls
                if (file.name.startsWith('F1 - ') || file.name.startsWith('F2 - ')) {
                  continue;
                }
                setSaveProgress(`Memindahkan "${file.name}" ke folder baru...`);
                await fetch(
                  `https://www.googleapis.com/drive/v3/files/${file.id}?addParents=${targetFolderId}&removeParents=${oldFolderId}`,
                  {
                    method: 'PATCH',
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
              }

              // Delete the old folder since it is now empty/obsolete
              console.log('[Drive Move] Deleting old empty folder:', oldFolderId);
              await fetch(`https://www.googleapis.com/drive/v3/files/${oldFolderId}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });
            }
          } catch (moveErr) {
            console.error('Error moving files to new folder:', moveErr);
          }
        }

        // Define reusable upload function to avoid duplicates
        const uploadFileToFolder = async (
          fileName: string,
          fileMimeType: string,
          fileBytes: Uint8Array,
          folderId: string
        ): Promise<{ url: string; name: string }> => {
          // Check if file already exists in this folder to avoid duplicates
          try {
            const searchRes = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
                `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`
              )}&fields=files(id)`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              if (searchData.files && searchData.files.length > 0) {
                for (const existingFile of searchData.files) {
                  await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}`, {
                    method: 'DELETE',
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                }
              }
            }
          } catch (dupErr) {
            console.warn('Error checking/deleting duplicate file:', fileName, dupErr);
          }

          const fileBlob = new Blob([fileBytes], { type: fileMimeType });
          const compiledFile = new File([fileBlob], fileName, { type: fileMimeType });

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
          formData.append('file', compiledFile);

          let res = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: formData,
            }
          );

          // Auto-refresh retry on 401
          if (res.status === 401) {
            console.log('🔄 [Drive Auto-Refresh] Token 401 terdeteksi, mencoba pembaruan token otomatis...');
            const freshToken = await ensureValidDriveToken(true);
            if (freshToken && freshToken !== token) {
              token = freshToken;
              res = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                  body: formData,
                }
              );
            }
          }

          if (!res.ok) {
            if (res.status === 401) {
              setIsDriveConnected(false);
              setGoogleDriveToken(null);
              throw new Error('Sesi otentikasi Google Drive telah kedaluwarsa. Silakan hubungkan ulang Google Drive Anda.');
            }
            const errorText = await res.text();
            throw new Error(`Gagal mengunggah file '${fileName}' ke Drive: ${errorText}`);
          }

          const fileData = await res.json();

          // Set permissions
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
          };
        };

        // Create a temporary object representation for PDF drawing
        const tempSubmissionForPdf = {
          lokasi,
          tanggal,
          jenisPengajuan,
          kode,
          dibayarkanKepada,
          dibayarkanDengan,
          notes,
          dibuatOleh,
          disetujuiOleh,
          diverifikasiOleh,
          diverifikasiJabatan,
          disetujuiOleh2,
          disetujuiJabatan2,
          dibukukanOleh,
          dibukukanJabatan,
          items: items.map(item => ({
            ...item,
            total: Number(item.total) || 0
          }))
        };

        // Helper to delete old F1 & F2 files to avoid duplicates when regenerating
        const deleteOldF1AndF2 = async (folderId: string) => {
          try {
            const res = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
                `('${folderId}' in parents and trashed = false) and (name starts with 'F1 -' or name starts with 'F2 -' or name = 'F1.pdf' or name = 'F2.pdf')`
              )}&fields=files(id,name)`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            if (res.ok) {
              const data = await res.json();
              if (data.files && data.files.length > 0) {
                console.log('[Drive Upload] Deleting old F1/F2 files to prevent duplicates:', data.files);
                for (const file of data.files) {
                  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                    method: 'DELETE',
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                }
              }
            }
          } catch (err) {
            console.warn('Gagal menghapus F1/F2 lama:', err);
          }
        };

        // Delete old F1 and F2
        await deleteOldF1AndF2(targetFolderId);

        // 2. Generate and Upload F1
        setSaveProgress('Membuat Dokumen PDF Bukti Pengeluaran Kas/Bank (F1)...');
        const f1PdfBytes = await generateF1PdfBytes(tempSubmissionForPdf, calculatedGrandTotal);
        setSaveProgress('Mengunggah Dokumen F1 ke Google Drive...');
        const f1Data = await uploadFileToFolder(`F1 - ${txBaseName}.pdf`, 'application/pdf', f1PdfBytes, targetFolderId);
        finalFiles.push({
          url: f1Data.url,
          name: f1Data.name,
          isF1: true
        });

        // 3. Generate and Upload F2
        setSaveProgress('Membuat Dokumen PDF Form Pengajuan HO (F2)...');
        const f2PdfBytes = await generateF2PdfBytes(tempSubmissionForPdf, calculatedGrandTotal);
        setSaveProgress('Mengunggah Dokumen F2 ke Google Drive...');
        const f2Data = await uploadFileToFolder(`F2 - ${txBaseName}.pdf`, 'application/pdf', f2PdfBytes, targetFolderId);
        finalFiles.push({
          url: f2Data.url,
          name: f2Data.name,
          isF2: true
        });

        // 4. Upload normal selected attachments (fileItems)
        const getFileExtensionForSave = (filename: string): string => {
          const lastDot = filename.lastIndexOf('.');
          return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
        };

        const getCleanOriginalName = (filename: string): string => {
          if (!filename) return '';
          // Strip system-added prefixes to restore the original name
          let cleaned = filename.replace(/^Lampiran - \([^-]+\s*-\s*[^)]+\)\s*-\s*/i, '');
          cleaned = cleaned.replace(/^File Pendukung Transaksi - \([^-]+\s*-\s*[^)]+\)\s*-\s*/i, '');
          cleaned = cleaned.replace(/^[^-]+ - \([^-]+\s*-\s*[^)]+\)\s*-\s*/i, '');
          
          REQUIRED_TRANSACTION_DOCS.forEach(doc => {
            const rx = new RegExp(`^${doc.label}\\s*-\\s*`, 'i');
            cleaned = cleaned.replace(rx, '');
          });
          return cleaned.trim() || filename;
        };

        const usedNames = new Set<string>();
        // Add system-generated files to usedNames to avoid conflicts
        usedNames.add(`F1 - ${txBaseName}.pdf`.toLowerCase());
        usedNames.add(`F2 - ${txBaseName}.pdf`.toLowerCase());

        let bCounter = 1;
        let invCounter = 1;
        let pettyCashCounter = 1;

        for (let i = 0; i < fileItems.length; i++) {
          const item = fileItems[i];
          // Skip if they are older versions of generated F1/F2 files to avoid infinite loops / redundant pages
          const nameStr = item.name || '';
          const isSystemGenerated = 
            (nameStr.startsWith('F1 - ') && nameStr.endsWith('.pdf')) ||
            (nameStr.startsWith('F2 - ') && nameStr.endsWith('.pdf'));
          if (isSystemGenerated) {
            continue;
          }

          if (item.isDrive && item.url) {
            // Berkas sudah ada di Google Drive, tidak perlu diunduh dan diunggah ulang
            finalFiles.push({
              url: item.url,
              name: item.name,
              docType: item.docType
            });
            usedNames.add(item.name.toLowerCase());
            continue;
          }

          setSaveProgress(`Mengunggah Berkas Lampiran (${i + 1}/${fileItems.length}): ${item.name}...`);
          let fileBytes: Uint8Array | null = null;
          let mimeType = 'application/octet-stream';
          const originalName = item.name;

          if (item.file) {
            fileBytes = new Uint8Array(await item.file.arrayBuffer());
            mimeType = item.file.type || 'application/octet-stream';
          } else if (item.isDrive && item.url) {
            fileBytes = await downloadGoogleDriveFile(item.url, token);
            const extLower = getFileExtensionForSave(originalName);
            if (extLower === '.pdf') mimeType = 'application/pdf';
            else if (extLower === '.png') mimeType = 'image/png';
            else if (extLower === '.jpg' || extLower === '.jpeg') mimeType = 'image/jpeg';
            else if (extLower === '.gif') mimeType = 'image/gif';
            else if (extLower === '.webp') mimeType = 'image/webp';
          }

          if (!fileBytes) {
            console.warn('Skipping file as bytes are empty:', originalName);
            if (item.isDrive && item.url) {
              finalFiles.push({
                url: item.url,
                name: item.name,
                docType: item.docType
              });
            }
            continue;
          }

          if (mimeType.startsWith('image/') || /\.jpe?g|\.png/i.test(originalName)) {
            try {
              setSaveProgress(`Mengubah gambar ke PDF (${i + 1}/${fileItems.length}): ${item.name}...`);
              fileBytes = await convertImageToPdf(fileBytes, mimeType);
              mimeType = 'application/pdf';
            } catch (convErr) {
              console.warn('Gagal mengubah gambar ke PDF:', convErr);
            }
          }

          const ext = mimeType === 'application/pdf' ? '.pdf' : (getFileExtensionForSave(originalName) || '.bin');
          
          let prefix = '';
          if (item.docType === 'invoice_vendor') {
            prefix = invCounter === 1 ? 'INV' : `INV${invCounter}`;
            invCounter++;
          } else if (item.docType === 'petty_cash_report') {
            prefix = pettyCashCounter === 1 ? 'PettyCash' : `PettyCash${pettyCashCounter}`;
            pettyCashCounter++;
          } else {
            prefix = `B${bCounter}`;
            bCounter++;
          }

          const finalFileName = `${prefix} - ${txBaseName}${ext}`;
          usedNames.add(finalFileName.toLowerCase());

          const resData = await uploadFileToFolder(finalFileName, mimeType, fileBytes, targetFolderId);
          finalFiles.push({
            url: resData.url,
            name: resData.name,
            docType: item.docType
          });
        }

        // 5. Upload Bukti Pembayaran file to its special subfolder: "Bukti Pembayaran"
        if (buktiPembayaranFile) {
          setSaveProgress('Membuat/Mencari folder "Bukti Pembayaran"...');
          const folderBuktiBayarId = await getOrCreateFolder(token, 'Bukti Pembayaran', targetFolderId);
          
          setSaveProgress(`Mengunggah berkas Bukti Pembayaran: ${buktiPembayaranFile.name}...`);
          let bytes = new Uint8Array(await buktiPembayaranFile.arrayBuffer());
          let mime = buktiPembayaranFile.type || 'application/octet-stream';
          
          let paymentExt = getFileExtensionForSave(buktiPembayaranFile.name) || '.pdf';
          if (mime.startsWith('image/') || /\.jpe?g|\.png/i.test(buktiPembayaranFile.name)) {
            try {
              setSaveProgress('Mengubah gambar bukti pembayaran ke PDF...');
              bytes = await convertImageToPdf(bytes, mime);
              mime = 'application/pdf';
              paymentExt = '.pdf';
            } catch (convErr) {
              console.warn('Gagal mengubah bukti pembayaran ke PDF:', convErr);
            }
          }
          
          const finalName = `BUKTI_BAYAR - ${txBaseName}${paymentExt}`;
          
          const uploadResult = await uploadFileToFolder(finalName, mime, bytes, folderBuktiBayarId);
          finalBuktiPembayaran = uploadResult;
          finalFiles.push({
            url: uploadResult.url,
            name: uploadResult.name,
            isBuktiPembayaran: true
          });
        } else if (buktiPembayaranDrive) {
          finalBuktiPembayaran = buktiPembayaranDrive;
          if (!finalFiles.some(f => f.url === buktiPembayaranDrive.url)) {
            finalFiles.push({
              url: buktiPembayaranDrive.url,
              name: buktiPembayaranDrive.name,
              isBuktiPembayaran: true
            });
          }
        }

        // 6. Upload Petty Cash LPJ file to dedicated Petty Cash directory if isPettyCash is true
        if (isPettyCash) {
          if (pettyCashLocalFile) {
            setSaveProgress('Membuat/Mencari folder Laporan Pertanggungjawaban Petty Cash...');
            const pchyHierarchyId = await getOrCreatePettyCashFolderHierarchy(
              token,
              pettyCashCustodian,
              yearStr,
              monthStr,
              dayStr
            );
            
            setSaveProgress(`Mengunggah berkas Laporan Petty Cash: ${pettyCashLocalFile.name}...`);
            let pchyBytes = new Uint8Array(await pettyCashLocalFile.arrayBuffer());
            let pchyMime = pettyCashLocalFile.type || 'application/octet-stream';
            
            let pchyExt = getFileExtensionForSave(pettyCashLocalFile.name) || '.pdf';
            if (pchyMime.startsWith('image/') || /\.jpe?g|\.png/i.test(pettyCashLocalFile.name)) {
              try {
                setSaveProgress('Mengubah gambar laporan petty cash ke PDF...');
                pchyBytes = await convertImageToPdf(pchyBytes, pchyMime);
                pchyMime = 'application/pdf';
                pchyExt = '.pdf';
              } catch (convErr) {
                console.warn('Gagal mengubah berkas laporan petty cash ke PDF:', convErr);
              }
            }
            
            let pchyFinalName = `PettyCash - ${txBaseName}${pchyExt}`;
            
            const pchyUploadResult = await uploadFileToFolder(pchyFinalName, pchyMime, pchyBytes, pchyHierarchyId);
            finalPettyCashFile = pchyUploadResult;
            
            finalFiles.push({
              url: pchyUploadResult.url,
              name: pchyUploadResult.name,
              docType: 'petty_cash_report'
            });
          } else if (pettyCashDriveFile) {
            finalPettyCashFile = pettyCashDriveFile;
            finalFiles.push({
              url: pettyCashDriveFile.url,
              name: pettyCashDriveFile.name,
              docType: 'petty_cash_report'
            });
          }
        }
      } else {
        // If Google Drive is not connected or token is falsy, preserve existing files, payment proof and petty cash
        if (initialSubmission) {
          finalFiles = initialSubmission.googleDriveFiles || [];
          finalBuktiPembayaran = initialSubmission.buktiPembayaran || undefined;
          finalPettyCashFile = initialSubmission.pettyCashFile || undefined;
        }
      }

      // Extract the first non-form attachment link as the legacy single-file fallback URL
      const firstRealAttachment = finalFiles.find(f => !f.isF1 && !f.isF2 && !f.isBuktiPembayaran && f.docType !== 'petty_cash_report');
      const finalFileUrl = firstRealAttachment ? firstRealAttachment.url : '';
      const finalFileName = firstRealAttachment ? firstRealAttachment.name : '';

      const cleanedItems = items.map(item => ({
        ...item,
        total: Number(item.total) || 0
      }));

      // Ensure the Lunas status is determined strictly by the presence of a payment proof document
      // uploaded on the dedicated "bukti pembayaran" uploader menu, or if previously marked as paid.
      const isLunas = !!(
        finalBuktiPembayaran ||
        buktiPembayaranFile ||
        buktiPembayaranDrive
      ) || (initialSubmission?.status === 'Lunas');

      const payload: Submission = {
        id: id || `sub-${Date.now()}`,
        lokasi,
        tanggal,
        jenisPengajuan,
        kode,
        dibayarkanKepada,
        dibayarkanDengan,
        status: isLunas ? 'Lunas' : 'Belum Lunas',
        notes,
        
        // Save Invoice properties
        isInvoice,
        invoiceNumber,
        invoiceDate,
        invoiceAmount: invoiceAmount !== '' ? Number(invoiceAmount) : undefined,

        // Save Salary Slip properties
        salaryDetails: (jenisPengajuan.toLowerCase().includes('gaji') || namaKaryawanSalary) ? {
          namaKaryawan: namaKaryawanSalary || dibayarkanKepada,
          nikJabatan: nikJabatanSalary,
          periodeBulan: periodeBulanSalary,
          gajiPokok: gajiPokokSalary !== '' ? Number(gajiPokokSalary) : Number(calculatedGrandTotal),
          tunjanganJabatan: tunjanganJabatanSalary !== '' ? Number(tunjanganJabatanSalary) : 0,
          tunjanganOperasional: tunjanganOperasionalSalary !== '' ? Number(tunjanganOperasionalSalary) : 0,
          uangMakanTransport: uangMakanTransportSalary !== '' ? Number(uangMakanTransportSalary) : 0,
          bonusInsentif: bonusInsentifSalary !== '' ? Number(bonusInsentifSalary) : 0,
          potonganBpjs: potonganBpjsSalary !== '' ? Number(potonganBpjsSalary) : 0,
          potonganPajak: potonganPajakSalary !== '' ? Number(potonganPajakSalary) : 0,
          potonganLain: potonganLainSalary !== '' ? Number(potonganLainSalary) : 0,
          keteranganPotongan: keteranganPotonganSalary,
          totalGajiBersih: (
            (gajiPokokSalary !== '' ? Number(gajiPokokSalary) : Number(calculatedGrandTotal)) +
            (tunjanganJabatanSalary !== '' ? Number(tunjanganJabatanSalary) : 0) +
            (tunjanganOperasionalSalary !== '' ? Number(tunjanganOperasionalSalary) : 0) +
            (uangMakanTransportSalary !== '' ? Number(uangMakanTransportSalary) : 0) +
            (bonusInsentifSalary !== '' ? Number(bonusInsentifSalary) : 0) -
            (potonganBpjsSalary !== '' ? Number(potonganBpjsSalary) : 0) -
            (potonganPajakSalary !== '' ? Number(potonganPajakSalary) : 0) -
            (potonganLainSalary !== '' ? Number(potonganLainSalary) : 0)
          )
        } : undefined,

        // Save Petty Cash properties
        isPettyCash,
        pettyCashCustodian: isPettyCash ? (pettyCashCustodian.trim() || (effectiveHolders.length > 0 ? effectiveHolders[0] : 'Suryo Pranoto')) : undefined,
        pettyCashFile: isPettyCash ? finalPettyCashFile : undefined,

        googleDriveFileUrl: finalFileUrl,
        googleDriveFileName: finalFileName,
        googleDriveFiles: finalFiles,
        googleDriveFolderId: targetFolderId || (initialSubmission as any)?.googleDriveFolderId,
        buktiPembayaran: finalBuktiPembayaran,
        dibuatOleh,
        disetujuiOleh,
        diverifikasiOleh,
        diverifikasiJabatan,
        disetujuiOleh2,
        disetujuiJabatan2,
        dibukukanOleh,
        dibukukanJabatan,
        items: cleanedItems,
        createdAt: initialSubmission ? initialSubmission.createdAt : new Date().toISOString()
      };

      // Update recipient history in localStorage for future quick selections
      if (dibayarkanKepada && dibayarkanKepada.trim()) {
        try {
          const currentHist: string[] = JSON.parse(localStorage.getItem('NUSANTARA_RECIPIENT_HISTORY') || '[]');
          const cleanName = dibayarkanKepada.trim().toUpperCase();
          if (!currentHist.includes(cleanName)) {
            const updatedHist = [cleanName, ...currentHist].slice(0, 50);
            localStorage.setItem('NUSANTARA_RECIPIENT_HISTORY', JSON.stringify(updatedHist));
          }
        } catch (e) {}
      }

      setSaveProgress('Menyimpan data transaksi ke database Firestore...');
      await onSave(payload);
    } catch (err: any) {
      console.error(err);
      if (err.message === 'UNAUTHORIZED_DRIVE_TOKEN' || (err.message && err.message.includes('UNAUTHORIZED_DRIVE_TOKEN'))) {
        setIsDriveConnected(false);
        setGoogleDriveToken(null);
        setValidationError('Gagal menyinkronkan berkas ke Google Drive: Sesi Google Drive Anda telah kedaluwarsa atau tidak sah. Silakan hubungkan ulang Google Drive Anda melalui tombol "Hubungkan Google Drive Aman" di bagian bawah formulir ini, lalu klik Simpan kembali.');
      } else {
        setValidationError(err.message || 'Sesuatu yang salah terjadi saat memproses dokumen.');
      }
    } finally {
      setIsSaving(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-205 shadow-sm overflow-hidden">
      {/* Top Gold Corporate Accent Line on Form Card */}
      <div className="h-[3px] border-header-gradient w-full"></div>
      
      {/* Form Header */}
      <div className="px-6 py-5.5 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onCancel}
            id="btn-form-back"
            className="p-2 hover:bg-stone-150 border border-transparent hover:border-stone-250 text-stone-550 hover:text-stone-900 rounded-xl transition cursor-pointer shadow-3xs"
          >
            <ArrowLeft size={17} />
          </button>
          <h2 className="text-base sm:text-lg font-black font-display text-stone-900 uppercase tracking-wide">
            {initialSubmission ? 'Edit Data Pengajuan HO' : 'Input Pengajuan Baru'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {isSppd && (
            <button
              type="button"
              onClick={() => setShowSppdModal(true)}
              className="px-3 py-1.5 bg-stone-900 hover:bg-amber-500 hover:text-stone-950 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              title="Integrasi SPPD Repo (yudiakunkerja/SPPD-Perusahaan)"
            >
              <GitBranch size={13} />
              <span>Tarik Data SPPD</span>
            </button>
          )}

          <div className="text-[10px] text-stone-400 font-mono uppercase tracking-wider font-extrabold select-none hidden md:block">
            {userProfile?.companyName || 'PT. Nusantara Mineral Sukses Abadi'}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {validationError && (
          <div className="p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl flex items-start gap-2 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        {/* SECTION 1: Form & Metadata */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 bg-stone-50/50 p-5 rounded-2xl border border-stone-200">
          <div className="lg:col-span-4 pb-2 border-b border-stone-200">
            <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-stone-500">Form & Identitas</h3>
          </div>

          {/* Lokasi */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Lokasi</label>
            <input
              type="text"
              list="preset-lokasi"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
            />
            <datalist id="preset-lokasi">
              {COMMON_NAMES.lokasi.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>

          {/* Tanggal */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Tanggal Pengajuan</label>
            <input
              type="date"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>

          {/* Jenis Pengajuan */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Jenis Pengajuan</label>
            <input
              type="text"
              list="preset-jenis"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 font-semibold"
              placeholder="Ketik jenis pengajuan..."
              value={jenisPengajuan}
              onChange={(e) => setJenisPengajuan(e.target.value)}
            />
            <datalist id="preset-jenis">
              {jenisOptions.map(j => <option key={j} value={j} />)}
            </datalist>
          </div>

          {/* Kode */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-medium text-stone-500">Kode Dokumen</label>
              {isManualKode && (
                <button
                  type="button"
                  onClick={() => {
                    setIsManualKode(false);
                    const compCode = (userProfile?.companyDetails?.code || userProfile?.companyId || 'NMSA').toUpperCase();
                    const autoKode = generateAutoKode(tanggal, compCode, submissions, id);
                    if (autoKode) {
                      setKode(autoKode);
                    }
                  }}
                  className="text-[10px] text-amber-600 hover:text-amber-700 font-bold flex items-center gap-0.5"
                >
                  <Sparkles size={11} className="text-amber-500" />
                  Reset Otomatis
                </button>
              )}
            </div>
            <input
              type="text"
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 font-mono font-bold"
              value={kode}
              onChange={(e) => {
                setKode(e.target.value);
                setIsManualKode(true);
              }}
            />
          </div>

          {/* Dibayarkan Kepada */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-stone-500">
                Dibayarkan Kepada (Penerima)
              </label>
              {isPettyCash && (
                <span className="text-[10px] text-amber-700 font-mono font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  Otomatis Huruf Kapital (Petty Cash)
                </span>
              )}
            </div>
            
            <input
              type="text"
              list="preset-penerima"
              className={`w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 font-semibold text-stone-900 ${
                isPettyCash ? 'uppercase tracking-wide' : ''
              }`}
              placeholder={isPettyCash ? "MASUKKAN NAMA PENERIMA / PEMEGANG KAS..." : "Masukkan nama penerima..."}
              value={dibayarkanKepada}
              onChange={(e) => {
                const val = isPettyCash ? e.target.value.toUpperCase() : e.target.value;
                setDibayarkanKepada(val);
              }}
            />
            <datalist id="preset-penerima">
              {recipientHistory.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Dibayarkan Dengan */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Metode Bayar</label>
            <select
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={dibayarkanDengan}
              onChange={(e) => {
                const method = e.target.value as PaymentMethod;
                setDibayarkanDengan(method);
              }}
            >
              <option value="Cek/Transfer">Cek / Transfer</option>
              <option value="Tunai">Tunai</option>
            </select>
          </div>

          {/* Status Pembayaran (Auto-Calculated Badge based on proof upload) */}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Status Pembayaran</label>
            <div className="w-full bg-stone-50 border border-stone-200 rounded-lg py-1.5 px-3 text-sm flex items-center justify-between min-h-[38px]">
              <span className="font-medium text-stone-500 text-xs">Auto-System</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider ${
                (buktiPembayaranFile || buktiPembayaranDrive) 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' 
                  : 'bg-amber-50 text-[#a58421] border border-amber-250'
              }`}>
                {(buktiPembayaranFile || buktiPembayaranDrive) ? 'Lunas' : 'Belum Lunas'}
              </span>
            </div>
            <p className="text-[10px] text-stone-400 mt-1">Status ditentukan berdasarkan bukti pembayaran.</p>
          </div>

          {/* Catatan / Notes */}
          <div className="lg:col-span-4">
            <label className="block text-xs font-medium text-stone-500 mb-1">Catatan Tambahan (Keterangan/Note)</label>
            <input
              type="text"
              placeholder="Catatan di bagian bawah formulir..."
              className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* DYNAMIC AUTO-DETECTED TRANSACTIONS (Invoice or Petty Cash) */}
        {(isInvoice || isPettyCash) && (
          <div className="border border-stone-200/80 rounded-2xl p-5 space-y-4 bg-stone-50/25">
            {/* Auto-detected Invoice Section */}
            {isInvoice && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                  <Sparkles size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold">Sistem Menyeleksi Transaksi Invoice / Tagihan Vendor (Otomatis)</span>
                    <p className="text-stone-550">Mendeteksi kata "Invoice / Tagihan" atau Kode "INV". Silakan sertakan lampiran faktur resmi jika tersedia.</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 shadow-3xs">
                  <div className="flex items-center gap-1.5 justify-start text-[11.5px] font-mono font-black uppercase tracking-wider text-stone-700">
                    <FileText size={13} className="text-amber-500" />
                    <span>Lampiran Dokumen / Nota Invoice Resmi Vendor (Opsional)</span>
                  </div>

                  {(() => {
                    const matched = fileItems.find((itm) => 
                      itm.docType === 'invoice_vendor' || 
                      (itm.name || '').toLowerCase().includes('invoice') || 
                      (itm.name || '').toLowerCase().includes('tagihan') || 
                      (itm.name || '').toLowerCase().includes('faktur') || 
                      (itm.name || '').toLowerCase().includes('nota')
                    ) || fileItems.find(itm => !itm.docType && !itm.isDrive);
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                        <div>
                          {matched ? (
                            <div className="p-3 bg-emerald-50/20 border border-emerald-250 rounded-xl flex items-center justify-between gap-3 shadow-3xs">
                              <div className="min-w-0 flex-1">
                                <span className="block text-xs font-bold text-emerald-800 truncate" title={matched.name}>
                                  {matched.name.includes(' - ') ? matched.name.substring(matched.name.indexOf(' - ') + 3) : matched.name}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[8px] text-emerald-600 font-bold uppercase tracking-widest font-mono mt-0.5">
                                  {matched.isDrive ? '● Terunggah di Google Drive' : '● File Lokal (Belum Disimpan)'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {matched.isDrive && matched.url && (
                                  <a
                                    href={matched.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-250 py-1 px-2.5 rounded-lg font-bold transition flex items-center shadow-3xs"
                                  >
                                    Buka
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteFileItem(matched.id)}
                                  className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-250 p-1.5 rounded-lg font-bold transition shadow-3xs cursor-pointer"
                                  title="Hapus berkas invoice"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-stone-400 italic bg-stone-100/50 p-3 rounded-xl border border-stone-200 border-dashed">
                              Faktur/Berkas invoice belum terpilih. Silakan klik tombol di samping kanan untuk memilih berkas lampiran invoice resmi.
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col">
                          {!matched && (
                            <label className="cursor-pointer text-xs text-center border border-dashed border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 text-[#6c5513] hover:text-[#52400a] font-extrabold rounded-xl py-4 px-4 transition flex items-center justify-center gap-2 shadow-3xs">
                              <Cloud size={15} className="text-[#D4AF37]" />
                              Klik untuk Pilih & Upload Lampiran Invoice
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                                onChange={(e) => handleSpecificFileUpload(e, 'invoice_vendor')}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Auto-detected SPPD / Perjalanan Dinas Section */}
            {isSppd && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3 animate-fade-in shadow-3xs">
                <div className="flex items-start gap-2">
                  <FileText size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">Sistem Transaksi Perjalanan Dinas (SPPD)</span>
                    <p className="text-stone-600 text-[11px]">
                      Voucher ini tersinkronisasi otomatis dengan <strong>Modul SPPD</strong>. Input rincian biaya akan langsung masuk sebagai draf SPPD.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSppdModal(true)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition shrink-0 cursor-pointer shadow-3xs flex items-center gap-1"
                >
                  <FileText size={13} />
                  <span>Impor / Panggil SPPD</span>
                </button>
              </div>
            )}

            {/* Auto-detected Petty Cash Section */}
            {isPettyCash && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-[11px] text-violet-800 flex items-start gap-2">
                  <Sparkles size={14} className="text-violet-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold">Sistem Menyeleksi Transaksi Petty Cash / Kas Kecil Lapangan (Otomatis)</span>
                    <p className="text-stone-550">Sistem mengelompokkan voucher ini ke dalam rekapitulasi real-time Petty Cash berdasarkan pemegang petty cash.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-stone-600">
                        Nama Pemegang Petty Cash (Custodian)
                      </label>
                      {onOpenManageHolders && (
                        <button
                          type="button"
                          onClick={onOpenManageHolders}
                          className="text-[10px] text-amber-700 hover:text-amber-800 font-extrabold flex items-center gap-1 cursor-pointer hover:underline"
                        >
                          <Plus size={11} />
                          <span>Kelola Master List</span>
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 bg-white border border-stone-200 rounded-lg py-2 px-3 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold text-stone-800 cursor-pointer"
                        value={pettyCashCustodian || (effectiveHolders.length > 0 ? effectiveHolders[0] : '')}
                        onChange={(e) => {
                          const selected = e.target.value;
                          setPettyCashCustodian(selected);
                          setDibayarkanKepada(selected.toUpperCase());
                        }}
                      >
                        {/* Preserve older/legacy custodian names if not present in master list */}
                        {pettyCashCustodian && !effectiveHolders.includes(pettyCashCustodian) && (
                          <option value={pettyCashCustodian}>👤 {pettyCashCustodian} (Laporan Lama)</option>
                        )}
                        {effectiveHolders.map((holder, idx) => (
                          <option key={idx} value={holder}>
                            👤 {holder}
                          </option>
                        ))}
                      </select>
                      {onOpenManageHolders && (
                        <button
                          type="button"
                          onClick={onOpenManageHolders}
                          className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-900 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                          title="Tambah / Kelola Master List Pemegang Petty Cash"
                        >
                          <Plus size={13} />
                          <span className="hidden sm:inline">Kelola List</span>
                        </button>
                      )}
                    </div>

                    {/* Quick-select chips for Petty Cash Custodians: Clicking automatically updates both custodian and recipient */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-stone-500 font-mono font-semibold">Klik Cepat Nama:</span>
                      {effectiveHolders.map((holder, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setPettyCashCustodian(holder);
                            setDibayarkanKepada(holder.toUpperCase());
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                            pettyCashCustodian === holder
                              ? 'bg-amber-600 text-white shadow-3xs'
                              : 'bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 border border-stone-200'
                          }`}
                          title={`Pilih ${holder} dan otomatis masukkan ke kolom Dibayarkan Kepada`}
                        >
                          <span>👤</span>
                          <span>{holder}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dedicated Upload space for Laporan Pertanggungjawaban / Laporan Periode Petty Cash (Tidak Wajib) */}
                <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 shadow-3xs">
                  <div className="flex items-center gap-1.5 justify-start text-[11px] font-mono font-bold uppercase tracking-wider text-stone-700">
                    <Coins size={13} className="text-violet-500" />
                    <span>Berkas Laporan Pertanggungjawaban Petty Cash Lapangan (Opsional)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                    <div>
                      {pettyCashLocalFile || pettyCashDriveFile ? (
                        <div className="p-3 bg-emerald-50/20 border border-emerald-250 rounded-xl flex items-center justify-between gap-3 shadow-3xs">
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-emerald-800 truncate" title={pettyCashLocalFile ? pettyCashLocalFile.name : pettyCashDriveFile?.name}>
                              {pettyCashLocalFile ? pettyCashLocalFile.name : pettyCashDriveFile?.name}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[8px] text-emerald-600 font-bold uppercase tracking-widest font-mono mt-0.5">
                              {pettyCashLocalFile ? '● File Berkas Baru (Belum Disimpan)' : '● Terunggah di Google Drive'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!pettyCashLocalFile && pettyCashDriveFile?.url && (
                              <a
                                href={pettyCashDriveFile.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 hover:bg-emerald-100/55 rounded-lg text-emerald-700 transition cursor-pointer"
                                title="Buka Berkas di Google Drive"
                              >
                                <ExternalLink size={13} />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (pettyCashLocalFile) {
                                  setPettyCashLocalFile(null);
                                } else if (pettyCashDriveFile) {
                                  handleDeletePettyCashDriveFile();
                                }
                              }}
                              className="p-1.5 hover:bg-rose-150 rounded-lg text-rose-600 transition cursor-pointer"
                              title="Hapus Berkas Laporan"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-stone-400 italic bg-stone-100/50 p-3 rounded-xl border border-stone-200 border-dashed">
                          LPJ Berkas tidak wajib diupload. Jika tersedia, klik tombol di kanan untuk menyertakan Laporan LPJ.
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <label className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 hover:bg-stone-50 border border-stone-250 text-stone-850 font-bold rounded-xl transition text-xs shadow-3xs cursor-pointer select-none">
                        <FileUp size={13} className="text-violet-500" />
                        <span>{pettyCashLocalFile || pettyCashDriveFile ? 'Ganti File Laporan' : 'Pilih File Laporan'}</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              setPettyCashLocalFile(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <p className="text-[10px] text-stone-400 leading-relaxed font-mono font-medium">
                    Jika diunggah, berkas LPJ diletakkan pada folder Google Drive:
                    <code className="block mt-1 p-1 bg-stone-50 border border-stone-150 text-[9.5px] text-violet-950 font-mono rounded-lg">
                      Voucher-APP &gt; Petty Cash &gt; [Pemegang Petty Cash] &gt; [Tahun] &gt; [Bulan] &gt; (LPJ File)
                    </code>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION FORM SLIP GAJI (Conditional when jenisPengajuan includes "gaji" or "Gaji") */}
        {(jenisPengajuan.toLowerCase().includes('gaji') || !!namaKaryawanSalary) && (
          <div className="border border-emerald-200 bg-emerald-50/20 rounded-2xl p-5 space-y-4 animate-fade-in shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200 pb-3">
              <div className="flex items-center gap-2">
                <Coins className="text-emerald-600" size={18} />
                <div>
                  <h3 className="text-xs font-black uppercase font-mono tracking-wider text-emerald-950">
                    Rincian Form Slip Gaji Karyawan
                  </h3>
                  <p className="text-[11px] text-emerald-700">Isi rincian gaji pokok, tunjangan, dan potongan karyawan untuk otomatis mencetak Lembar Slip Gaji.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNamaKaryawanSalary(dibayarkanKepada);
                  setNikJabatanSalary('Staff HO');
                  setPeriodeBulanSalary(new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }));
                  setGajiPokokSalary(calculatedGrandTotal);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-3xs flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Sparkles size={12} />
                Autofill dari Total
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  Nama Karyawan
                </label>
                <input
                  type="text"
                  value={namaKaryawanSalary || dibayarkanKepada}
                  onChange={(e) => setNamaKaryawanSalary(e.target.value)}
                  placeholder="e.g. Budi Santoso"
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  NIK / Jabatan Karyawan
                </label>
                <input
                  type="text"
                  value={nikJabatanSalary}
                  onChange={(e) => setNikJabatanSalary(e.target.value)}
                  placeholder="e.g. 2024-001 / Staff Keuangan"
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  Periode Gaji (Bulan / Tahun)
                </label>
                <input
                  type="text"
                  value={periodeBulanSalary}
                  onChange={(e) => setPeriodeBulanSalary(e.target.value)}
                  placeholder="e.g. Agustus 2026"
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Rincian Komponen Penerimaan & Potongan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Komponen Penerimaan */}
              <div className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-2.5">
                <span className="block text-xs font-extrabold text-emerald-800 uppercase tracking-wider border-b border-stone-100 pb-1">
                  Komponen Penerimaan ( + )
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-stone-500 font-medium">Gaji Pokok (Rp)</label>
                    <input
                      type="number"
                      value={gajiPokokSalary}
                      onChange={(e) => setGajiPokokSalary(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder={calculatedGrandTotal.toString()}
                      className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono text-xs font-bold text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-500 font-medium">Tunjangan Jabatan (Rp)</label>
                    <input
                      type="number"
                      value={tunjanganJabatanSalary}
                      onChange={(e) => setTunjanganJabatanSalary(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono text-xs font-bold text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-500 font-medium">Tunj. Operasional (Rp)</label>
                    <input
                      type="number"
                      value={tunjanganOperasionalSalary}
                      onChange={(e) => setTunjanganOperasionalSalary(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono text-xs font-bold text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-500 font-medium">Uang Makan & Transport (Rp)</label>
                    <input
                      type="number"
                      value={uangMakanTransportSalary}
                      onChange={(e) => setUangMakanTransportSalary(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono text-xs font-bold text-stone-900"
                    />
                  </div>
                </div>
              </div>

              {/* Komponen Potongan */}
              <div className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-2.5">
                <span className="block text-xs font-extrabold text-rose-800 uppercase tracking-wider border-b border-stone-100 pb-1">
                  Komponen Potongan ( - )
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] text-stone-500 font-medium">BPJS (Rp)</label>
                    <input
                      type="number"
                      value={potonganBpjsSalary}
                      onChange={(e) => setPotonganBpjsSalary(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono text-xs font-bold text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-500 font-medium">PPh 21 / Pajak (Rp)</label>
                    <input
                      type="number"
                      value={potonganPajakSalary}
                      onChange={(e) => setPotonganPajakSalary(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono text-xs font-bold text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-500 font-medium">Potongan Lain (Rp)</label>
                    <input
                      type="number"
                      value={potonganLainSalary}
                      onChange={(e) => setPotonganLainSalary(e.target.value !== '' ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg font-mono text-xs font-bold text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-500 font-medium">Ket. Potongan</label>
                    <input
                      type="text"
                      value={keteranganPotonganSalary}
                      onChange={(e) => setKeteranganPotonganSalary(e.target.value)}
                      placeholder="e.g. Kasbon / Keterlambatan"
                      className="w-full px-2.5 py-1.5 border border-stone-200 rounded-lg text-xs font-medium text-stone-900"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION GOOGLE DRIVE UPLOAD */}
        <div className="border border-stone-200 rounded-2xl p-5 space-y-4 bg-stone-50/20">
          <div className="flex items-center justify-between border-b border-stone-200 pb-2">
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-stone-500 flex items-center gap-1.5">
                <Cloud size={14} className="text-[#D4AF37]" />
                File Pendukung Transaksi (Google Drive)
              </h3>
              <p className="text-xs text-stone-400">Unggah file/berkas pendukung atau nota pendukung transaksi langsung ke cloud Google Drive Anda.</p>
            </div>
            
            {isDriveConnected && (
              <button
                type="button"
                onClick={() => {
                  setGoogleDriveToken(null);
                  setIsDriveConnected(false);
                  setGoogleDriveFileUrl('');
                  setGoogleDriveFileName('');
                }}
                className="text-[10px] font-mono font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition"
              >
                Disconnect Drive
              </button>
            )}
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-50 text-rose-750 border border-rose-100 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          {!isDriveConnected ? (
            <DriveAccountsManager onConnectionChange={setIsDriveConnected} />
          ) : (
            <div className="space-y-6">
              {isInvoice && (
                <>
                  {/* Segmented control to choose between separate vs merged upload */}
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/85 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
                    <div className="space-y-0.5">
                      <span className="block text-xs font-bold text-stone-800">Format Dokumen Transaksi Utama:</span>
                      <p className="text-[10px] text-stone-500">Apakah dokumen Anda terpisah atau sudah digabung menjadi 1 file utuh?</p>
                    </div>
                    <div className="flex gap-1 bg-stone-200/60 p-1 rounded-lg self-start sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsMergedMethod(false)}
                        className={`py-1.5 px-3 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                          !isMergedMethod
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-500 hover:text-stone-850'
                        }`}
                      >
                        📂 9 Dokumen Terpisah
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMergedMethod(true)}
                        className={`py-1.5 px-3 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
                          isMergedMethod
                            ? 'bg-[#917118] text-white shadow-xs'
                            : 'text-stone-500 hover:text-stone-850'
                        }`}
                      >
                        📄 1 Berkas Gabungan (Utuh)
                      </button>
                    </div>
                  </div>

                  {isMergedMethod ? (
                    /* Beautiful block for 1 Merged PDF File */
                    <div className="space-y-3">
                      <span className="block text-[11px] font-mono font-bold text-[#917118] uppercase tracking-wider">
                        Berkas Gabungan Dokumen Utama (PO, LHV, B/L, Cargo dll. dalam 1 PDF)
                      </span>
                      {(() => {
                        const matched = fileItems.find((itm) => itm.docType === 'merged_all');
                        return (
                          <div
                            className={`p-5 border rounded-2xl transition duration-150 flex flex-col justify-between min-h-[145px] ${
                              matched
                                ? 'border-emerald-250 bg-emerald-50/20'
                                : 'border-stone-250 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 bg-white'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex justify-between items-start gap-1">
                                <div>
                                  <span className="text-xs font-bold text-stone-800">
                                    Berkas Gabungan Utama (Kompleks)
                                  </span>
                                  <p className="text-[10px] text-stone-500 mt-0.5">
                                    Unggah terus 1 berkas PDF utuh hasil penggabungan (Lengkapi PO, LHV, Draft Survei, B/L, Cargo Manifest, DLL).
                                  </p>
                                </div>
                                {matched && (
                                  <span className="shrink-0 bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono">
                                    Ada
                                  </span>
                                )}
                              </div>
                              
                              {matched ? (
                                <div className="space-y-1 mt-2.5 bg-white/60 p-2.5 rounded-lg border border-stone-200">
                                  <p className="text-[10px] text-stone-600 truncate font-mono uppercase" title={matched.name}>
                                    {matched.name.includes(' - ') ? matched.name.substring(matched.name.indexOf(' - ') + 3) : matched.name}
                                  </p>
                                  {matched.isDrive ? (
                                    <span className="inline-block text-[8px] text-amber-600 font-extrabold uppercase tracking-wide">
                                      ● Drive Cloud
                                    </span>
                                  ) : (
                                    <span className="inline-block text-[8px] text-blue-600 font-extrabold uppercase tracking-wide">
                                      ● Lokal (Belum Simpan)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[10px] text-stone-400 italic mt-1 bg-stone-50 p-2 rounded-lg border border-stone-150 border-dashed">
                                  Belum ada berkas gabungan yang dimasukkan. Silakan pilih berkas PDF gabungan Anda di bawah.
                                </p>
                              )}
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-stone-150/50 flex items-center justify-between">
                              {matched ? (
                                <div className="flex gap-1.5 items-center w-full">
                                  {matched.isDrive && matched.url && (
                                    <a
                                      href={matched.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-250 py-1 px-2.5 rounded-md font-bold transition flex items-center gap-0.5"
                                    >
                                      Buka File
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteFileItem(matched.id)}
                                    className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-1 px-2.5 rounded-md font-bold transition flex items-center gap-0.5 ml-auto"
                                  >
                                    <Trash2 size={10} />
                                    Hapus File
                                  </button>
                                </div>
                              ) : (
                                <label className="cursor-pointer text-[10px] text-[#917118] hover:text-stone-850 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/35 py-1.5 px-3 rounded-lg transition font-semibold block text-center w-full">
                                  Pilih Berkas Gabungan
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                                    onChange={(e) => handleSpecificFileUpload(e, 'merged_all')}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    /* Grid 9 required documents for coal transactions */
                    <div className="space-y-3">
                      <span className="block text-[11px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                        {isInvoice ? 'Berkas Dokumen Pendukung Tambahan (Batubara)' : '9 Dokumen Pendukung Transaksi Wajib / Utama (Batubara)'}
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {REQUIRED_TRANSACTION_DOCS.filter(doc => isInvoice ? doc.key !== 'invoice_vendor' : true).map((doc) => {
                          const matched = fileItems.find((itm) => itm.docType === doc.key);
                          return (
                            <div
                              key={doc.key}
                              className={`p-3 border rounded-xl transition duration-150 flex flex-col justify-between min-h-[120px] ${
                                matched
                                  ? 'border-emerald-250 bg-emerald-50/20'
                                  : 'border-stone-200 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 bg-white'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex justify-between items-start gap-1">
                                  <span className="text-xs font-bold text-stone-800 line-clamp-2" title={doc.fullName}>
                                    {doc.fullName}
                                  </span>
                                  {matched && (
                                    <span className="shrink-0 bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider font-mono">
                                      Ada
                                    </span>
                                  )}
                                </div>
                                
                                {matched ? (
                                  <div className="space-y-1 mt-1">
                                    <p className="text-[10px] text-stone-600 truncate font-mono uppercase" title={matched.name}>
                                      {matched.name.includes(' - ') ? matched.name.substring(matched.name.indexOf(' - ') + 3) : matched.name}
                                    </p>
                                    {matched.isDrive ? (
                                      <span className="inline-block text-[8px] text-amber-600 font-extrabold uppercase tracking-wide">
                                        ● Drive Cloud
                                      </span>
                                    ) : (
                                      <span className="inline-block text-[8px] text-blue-600 font-extrabold uppercase tracking-wide">
                                        ● Lokal (Belum Simpan)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-stone-400 italic">Berkas belum dilampirkan</p>
                                )}
                              </div>

                              <div className="mt-2.5 pt-2 border-t border-stone-150/50 flex items-center justify-between">
                                {matched ? (
                                  <div className="flex gap-1.5 items-center w-full">
                                    {matched.isDrive && matched.url && (
                                      <a
                                        href={matched.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[9px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-250 py-0.5 px-2 rounded-md font-bold transition flex items-center gap-0.5"
                                      >
                                        Buka
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFileItem(matched.id)}
                                      className="text-[9px] bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 py-0.5 px-2 rounded-md font-bold transition flex items-center gap-0.5 ml-auto"
                                    >
                                      <Trash2 size={10} />
                                      Hapus
                                    </button>
                                  </div>
                                ) : (
                                  <label className="cursor-pointer text-[10px] text-[#917118] hover:text-stone-850 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/35 py-1 px-2.5 rounded-lg transition font-semibold block text-center w-full">
                                    Pilih Berkas / Upload File
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                                      onChange={(e) => handleSpecificFileUpload(e, doc.key)}
                                    />
                                  </label>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* General Attachments */}
              <div className={`${isInvoice ? 'pt-4 border-t border-stone-200/80' : ''} space-y-3`}>
                <span className="block text-[11px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                  Lampiran Pendukung Lainnya (General Attachments)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* General file selector */}
                  <div className="border border-dashed border-stone-300 rounded-xl p-4 flex flex-col items-center justify-center text-center bg-white min-h-[110px]">
                    <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center py-2 space-y-1 hover:bg-stone-50/50 rounded-lg transition duration-250">
                      <Cloud size={20} className="text-stone-400" />
                      <span className="text-xs font-bold text-stone-700">Pilih Berkas Lampiran Lain</span>
                      <span className="text-[9px] text-stone-400">PDF, Excel, Word, Image, dll.</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                        multiple
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>

                  {/* List of general attachments */}
                  <div className="flex flex-col p-4 bg-white border border-stone-200 rounded-xl max-h-[180px] overflow-y-auto">
                    {(() => {
                      const displayedFiles = fileItems.filter(f => !isInvoice || !f.docType);
                      return (
                        <>
                          <span className="block text-[9px] font-mono font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                            Daftar Lampiran Pendukung ({displayedFiles.length})
                          </span>
                          {displayedFiles.length > 0 ? (
                            <div className="space-y-1.5">
                              {displayedFiles.map((item, idx) => (
                                <div
                                  key={item.id}
                                  className="p-1.5 border border-stone-200 rounded-lg bg-stone-50/50 flex items-center justify-between gap-1.5 text-[11px]"
                                >
                                  <span className="truncate font-medium text-stone-700 flex-1" title={item.name}>
                                    {idx + 1}. {item.name}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {item.isDrive && item.url && (
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#917118] border border-[#D4AF37]/30 py-0.5 px-1.5 rounded text-[9px] font-bold"
                                      >
                                        Buka
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteFileItem(item.id)}
                                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-250 p-1 rounded-md cursor-pointer"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs italic text-stone-400 my-auto text-center">Tidak ada lampiran lain.</span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Multi Google Drive Accounts Manager */}
              <div className="border-t border-stone-200 pt-5 mt-6">
                <DriveAccountsManager onConnectionChange={setIsDriveConnected} />
              </div>
            </div>
          )}

          {/* Section: Dedicated Bukti Pembayaran */}
          {isDriveConnected && (
            <div className="mt-6 pt-5 border-t border-stone-200">
              <div className="flex items-center justify-between mb-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold uppercase font-mono tracking-wider text-[#917118] flex items-center gap-1.5">
                    <Sparkles size={13} className="text-[#D4AF37]" />
                    Bukti Pembayaran Khusus (Transfer Proof)
                  </h4>
                  <p className="text-[11px] text-stone-400">Tombol khusus untuk mengunggah bukti pembayaran hasil transfer kas/bank.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Upload Button */}
                <div className="border border-dashed border-[#D4AF37]/50 rounded-xl p-4 flex flex-col items-center justify-center text-center bg-amber-50/10 hover:bg-amber-50/25 transition">
                  <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center py-2 space-y-1">
                    <Cloud size={20} className="text-[#D4AF37]" />
                    <span className="text-xs font-bold text-stone-700">Upload Bukti Pembayaran</span>
                    <span className="text-[10px] text-stone-400">Pilih file bukti transfer bank</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,.xlsx,.xls,.doc,.docx,.csv,.txt"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          setBuktiPembayaranFile(e.target.files[0]);
                          setBuktiPembayaranDrive(null); // overwrite existing
                        }
                      }}
                    />
                  </label>
                </div>

                {/* Display Current Bukti Pembayaran */}
                <div className="flex flex-col p-4 bg-white border border-stone-200 rounded-xl justify-center min-h-[90px]">
                  <span className="block text-[10px] font-mono font-bold text-[#917118] uppercase tracking-wider mb-2">
                    Bukti Pembayaran Terpilih
                  </span>
                  {buktiPembayaranFile ? (
                    <div className="p-2 border border-[#D4AF37]/30 rounded-lg bg-amber-50/10 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <span className="block font-semibold text-stone-800 truncate" title={buktiPembayaranFile.name}>
                          {buktiPembayaranFile.name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[8.5px] text-blue-600 font-semibold uppercase tracking-wider mt-0.5">
                          ● Lokal (Menunggu Simpan)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBuktiPembayaranFile(null)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 p-1 rounded-md transition"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : buktiPembayaranDrive ? (
                    <div className="p-2 border border-green-200 rounded-lg bg-green-50/20 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <span className="block font-semibold text-stone-800 truncate" title={buktiPembayaranDrive.name}>
                          {buktiPembayaranDrive.name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[8.5px] text-emerald-600 font-semibold uppercase tracking-wider mt-0.5">
                          ● Terunggah di Google Drive
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {buktiPembayaranDrive.url && (
                          <a
                            href={buktiPembayaranDrive.url}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#917118] border border-[#D4AF37]/30 py-1 px-2 rounded-md text-[10px] font-bold transition"
                          >
                            Buka
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={handleDeleteBuktiPembayaran}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 p-1 rounded-md transition"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-2">
                      <span className="text-xs italic text-stone-400">Belum ada bukti transfer dipilih.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: Dynamic Row Items */}
        <div className="border border-stone-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-200 pb-3 gap-3">
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-stone-500 flex items-center gap-2">
                <span>Item & Transaksi Pengeluaran</span>
                {isInvoice && (
                  <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md border border-amber-300">
                    Mode Tagihan / Invoice
                  </span>
                )}
              </h3>
              <p className="text-xs text-stone-450">Tulis deskripsi detail item, volume (Qty / Satuan Harga), serta nominal transaksinya.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer hover:text-stone-900 select-none bg-stone-100 hover:bg-stone-200/80 px-3 py-1.5 rounded-lg transition border border-stone-200 shadow-3xs">
                <input
                  type="checkbox"
                  checked={showLedgerCols}
                  onChange={(e) => setShowLedgerCols(e.target.checked)}
                  className="rounded border-stone-300 text-stone-900 focus:ring-stone-500 h-3.5 w-3.5 cursor-pointer"
                />
                Kolom Akunting (D/K/Saldo)
              </label>

              <button
                type="button"
                onClick={handleAddItemRow}
                className="flex items-center gap-1.5 text-xs bg-stone-900 hover:bg-stone-850 text-white font-medium px-3 py-1.5 rounded-lg transition shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                Tambah Baris Item
              </button>
            </div>
          </div>

          {/* Quick Tax & Deductions Automation Bar */}
          <div className="p-3.5 bg-stone-50/90 border border-stone-200/80 rounded-xl space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-amber-100 text-amber-800 rounded-md">
                  <Calculator size={14} />
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-stone-800">Otomatisasi Pajak (PPN & PPh): </span>
                  <span className="font-mono text-stone-600 text-[11px]">
                    Dasar DPP: <strong className="text-stone-900">Rp {formatRupiah(getBaseDppAmount())}</strong>
                  </span>
                </div>
              </div>
              
              {isInvoice && (
                <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                  💡 PPh 2% otomatis dihitung dari transaksi ke-1
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* PPN Group */}
              <div className="flex items-center bg-white border border-stone-200 rounded-lg p-1 shadow-3xs">
                <span className="text-[10px] font-mono font-bold text-stone-500 px-2 uppercase flex items-center gap-1 border-r border-stone-200 mr-1">
                  <Percent size={11} className="text-amber-600" />
                  PPN:
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyPpn(11)}
                  className="px-2 py-1 text-xs font-bold text-stone-700 hover:text-amber-700 hover:bg-amber-50 rounded transition cursor-pointer"
                  title={`Hitung PPN 11% dari Rp ${formatRupiah(getBaseDppAmount())} = Rp ${formatRupiah(Math.round(getBaseDppAmount() * 0.11))}`}
                >
                  + PPN 11%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPpn(12)}
                  className="px-2 py-1 text-xs font-bold text-stone-700 hover:text-amber-700 hover:bg-amber-50 rounded transition cursor-pointer border-l border-stone-100"
                  title={`Hitung PPN 12% dari Rp ${formatRupiah(getBaseDppAmount())} = Rp ${formatRupiah(Math.round(getBaseDppAmount() * 0.12))}`}
                >
                  + PPN 12%
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPpn(10)}
                  className="px-2 py-1 text-xs font-bold text-stone-700 hover:text-amber-700 hover:bg-amber-50 rounded transition cursor-pointer border-l border-stone-100"
                  title={`Hitung PPN 10% dari Rp ${formatRupiah(getBaseDppAmount())} = Rp ${formatRupiah(Math.round(getBaseDppAmount() * 0.10))}`}
                >
                  + PPN 10%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomTaxType('ppn');
                    setCustomTaxMode('percentage');
                    setCustomTaxRateInput('11');
                    setCustomTaxNominalInput(String(Math.round(getBaseDppAmount() * 0.11) || ''));
                    setShowCustomTaxModal(true);
                  }}
                  className="px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 rounded transition cursor-pointer border-l border-stone-200"
                  title="Input manual PPN dengan tarif kustom atau nominal langsung"
                >
                  ⚙️ PPN Manual
                </button>
              </div>

              {/* PPh Group */}
              <div className="flex items-center bg-white border border-stone-200 rounded-lg p-1 shadow-3xs">
                <span className="text-[10px] font-mono font-bold text-rose-700 px-2 uppercase flex items-center gap-1 border-r border-stone-200 mr-1">
                  <Percent size={11} className="text-rose-600" />
                  PPh:
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyPph(2)}
                  className="px-2.5 py-1 text-xs font-bold text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded transition cursor-pointer"
                  title={`Hitung Potongan PPh 23 (-2%) dari Rp ${formatRupiah(getBaseDppAmount())} = -Rp ${formatRupiah(Math.round(getBaseDppAmount() * 0.02))}`}
                >
                  + PPh 2% ( -2% )
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPph(0.5)}
                  className="px-2 py-1 text-xs font-bold text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded transition cursor-pointer border-l border-stone-100"
                  title={`Hitung Potongan PPh Final (-0.5%) dari Rp ${formatRupiah(getBaseDppAmount())} = -Rp ${formatRupiah(Math.round(getBaseDppAmount() * 0.005))}`}
                >
                  + PPh 0.5%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomTaxType('pph');
                    setCustomTaxMode('percentage');
                    setCustomTaxRateInput('2');
                    setCustomTaxNominalInput(String(Math.round(getBaseDppAmount() * 0.02) || ''));
                    setShowCustomTaxModal(true);
                  }}
                  className="px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 rounded transition cursor-pointer border-l border-stone-200"
                  title="Input manual PPh dengan persentase atau nominal langsung"
                >
                  ⚙️ PPh Manual
                </button>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-550 font-mono text-xs uppercase">
                  <th className="py-2 w-10">No</th>
                  <th className="py-2">Item Deskripsi Pengeluaran</th>
                  <th className="py-2 w-44">Jumlah / Volume</th>
                  {showLedgerCols && (
                    <>
                      <th className="py-2 w-32 text-right">Debit (Rp)</th>
                      <th className="py-2 w-32 text-right">Kredit (Rp)</th>
                      <th className="py-2 w-32 text-right">Saldo (Rp)</th>
                    </>
                  )}
                  <th className="py-2 w-44 text-right">Nilai Total (Rp)</th>
                  <th className="py-2 w-44 pl-4">Keterangan Halaman</th>
                  <th className="py-2 w-12 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((item, index) => {
                  const volAnalysis = analyzeVolumeInput(item.jumlahVolume);

                  return (
                    <tr key={item.id} className="hover:bg-stone-50/50">
                      <td className="py-3 font-mono text-stone-450">{index + 1}</td>
                      
                      {/* Item Name */}
                      <td className="py-3 pr-2">
                        <input
                          type="text"
                          placeholder="Contoh: Biaya Gaji Office Boy dan Satpam Kantor"
                          className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={item.item}
                          onChange={(e) => handleItemChange(index, 'item', e.target.value)}
                        />
                      </td>

                      {/* Volume with Intelligent Type Detection (Qty vs Satuan Harga vs Custom) */}
                      <td className="py-3 pr-2">
                        <div className="space-y-1">
                          <input
                            type="text"
                            placeholder="e.g. 2 / 5 Box / Rp 500.000"
                            className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                            value={item.jumlahVolume}
                            onChange={(e) => handleItemChange(index, 'jumlahVolume', e.target.value)}
                          />
                          
                          {/* Live Dynamic Badge Indicator */}
                          {item.jumlahVolume && item.jumlahVolume.trim() && (
                            <div className="flex items-center gap-1">
                              {volAnalysis.type === 'qty' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <span>📦 {volAnalysis.formattedText.toLowerCase().includes('pcs') ? volAnalysis.formattedText : `Pcs / Qty (${volAnalysis.formattedText})`}</span>
                                </span>
                              )}
                              {volAnalysis.type === 'price' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                  <span>🏷️ Satuan Harga ({volAnalysis.formattedText})</span>
                                </span>
                              )}
                              {volAnalysis.type === 'volume' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200">
                                  <span>💧 Volume ({volAnalysis.formattedText})</span>
                                </span>
                              )}
                              {volAnalysis.type === 'custom' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                                  <span>📋 {item.jumlahVolume}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Conditional Ledger Columns D/K/S */}
                      {showLedgerCols && (
                        <>
                          {/* Debit */}
                          <td className="py-3 pr-2 text-right">
                            <input
                              type="text"
                              placeholder="0"
                              className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2 text-right text-xs font-mono focus:ring-1 focus:ring-stone-400 focus:outline-none"
                              value={item.debit ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d+$/.test(val)) {
                                  handleItemChange(index, 'debit', val === '' ? undefined : parseInt(val, 10));
                                }
                              }}
                            />
                          </td>

                          {/* Kredit */}
                          <td className="py-3 pr-2 text-right">
                            <input
                              type="text"
                              placeholder="0"
                              className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2 text-right text-xs font-mono focus:ring-1 focus:ring-stone-400 focus:outline-none"
                              value={item.kredit ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d+$/.test(val)) {
                                  handleItemChange(index, 'kredit', val === '' ? undefined : parseInt(val, 10));
                                }
                              }}
                            />
                          </td>

                          {/* Saldo */}
                          <td className="py-3 pr-2 text-right font-medium">
                            <input
                              type="text"
                              placeholder="0"
                              className="w-full bg-amber-50/50 border border-amber-200/60 rounded-lg py-1.5 px-2 text-right text-xs font-mono focus:ring-1 focus:ring-stone-400 focus:outline-none font-semibold text-stone-800"
                              value={item.saldo ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d+$/.test(val)) {
                                  handleItemChange(index, 'saldo', val === '' ? undefined : parseInt(val, 10));
                                }
                              }}
                            />
                          </td>
                        </>
                      )}

                      {/* Numeric Rupiah Total */}
                      <td className="py-3 pr-2 text-right">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs font-mono">Rp</span>
                          <input
                            type="text"
                            placeholder="0"
                            className={`w-full bg-white border border-stone-200 rounded-lg py-1.5 pl-8 pr-2 text-right text-sm font-mono focus:ring-1 focus:ring-stone-400 focus:outline-none ${
                              Number(item.total) < 0 ? 'text-rose-600 font-bold' : ''
                            }`}
                            value={item.total}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || val === '-' || val === '-0' || /^-?\d+$/.test(val)) {
                                handleItemChange(index, 'total', val);
                              }
                            }}
                          />
                        </div>
                      </td>

                      {/* Column Keterangan */}
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="text"
                          placeholder="Sesuai nota terlampir"
                          className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={item.keterangan}
                          onChange={(e) => handleItemChange(index, 'keterangan', e.target.value)}
                        />
                      </td>

                      {/* Remove Action */}
                      <td className="py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(index)}
                          className="p-1 text-stone-400 hover:text-rose-600 rounded hover:bg-rose-50 transition cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Running Totals visual */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-stone-50 border border-stone-200 rounded-xl font-mono text-sm gap-2">
            <div className="text-xs text-stone-500 font-sans">
              Jumlah Baris Item: <strong>{items.length}</strong> | DPP: <strong>Rp {formatRupiah(getBaseDppAmount())}</strong>
            </div>
            <div className="flex items-center self-end sm:self-auto">
              <span className="text-stone-500 font-sans mr-2 text-xs">Total Bersih Penyerahan: </span>
              <span className="font-bold text-stone-900 bg-amber-100/70 px-3 py-1 rounded-lg border border-amber-300 text-base shadow-3xs">
                Rp {formatRupiah(calculatedGrandTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Custom Tax / PPN / PPh Input Modal */}
        {showCustomTaxModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-xl overflow-hidden text-left">
              <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${customTaxType === 'ppn' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                    <Calculator size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 text-sm">
                      {customTaxType === 'ppn' ? 'Input Manual PPN' : 'Input Manual PPh'}
                    </h3>
                    <p className="text-[11px] text-stone-500 font-mono">
                      DPP Dasar: Rp {formatRupiah(getBaseDppAmount())}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCustomTaxModal(false)}
                  className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-4 text-sm">
                {/* Method selector */}
                <div className="flex rounded-xl bg-stone-100 p-1 border border-stone-200">
                  <button
                    type="button"
                    onClick={() => setCustomTaxMode('percentage')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                      customTaxMode === 'percentage' ? 'bg-white text-stone-900 shadow-3xs' : 'text-stone-500'
                    }`}
                  >
                    Berdasarkan Persentase (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomTaxMode('nominal')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                      customTaxMode === 'nominal' ? 'bg-white text-stone-900 shadow-3xs' : 'text-stone-500'
                    }`}
                  >
                    Nominal Langsung (Rp)
                  </button>
                </div>

                {customTaxMode === 'percentage' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-stone-700">
                      Tarif Persentase (%):
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="0.1"
                          value={customTaxRateInput}
                          onChange={(e) => setCustomTaxRateInput(e.target.value)}
                          placeholder="e.g. 11, 12, 10, 2, 0.5"
                          className="w-full bg-white border border-stone-300 rounded-xl py-2 px-3 text-sm focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold">%</span>
                      </div>
                      
                      {/* Preset Chips */}
                      {customTaxType === 'ppn' ? (
                        <div className="flex gap-1">
                          {['10', '11', '12'].map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setCustomTaxRateInput(r)}
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
                                customTaxRateInput === r ? 'bg-amber-600 text-white border-amber-600' : 'bg-stone-50 text-stone-700 border-stone-200'
                              }`}
                            >
                              {r}%
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          {['0.5', '2', '2.5'].map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setCustomTaxRateInput(r)}
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
                                customTaxRateInput === r ? 'bg-rose-600 text-white border-rose-600' : 'bg-stone-50 text-stone-700 border-stone-200'
                              }`}
                            >
                              {r}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs flex justify-between font-mono">
                      <span className="text-stone-500">Hasil Hitung:</span>
                      <strong className={customTaxType === 'ppn' ? 'text-amber-800' : 'text-rose-700'}>
                        {customTaxType === 'pph' ? '- ' : '+ '}
                        Rp {formatRupiah(Math.round(getBaseDppAmount() * (Number(customTaxRateInput) || 0) / 100))}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-stone-700">
                      Nominal Manual (Rp):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-mono text-xs">Rp</span>
                      <input
                        type="number"
                        value={customTaxNominalInput}
                        onChange={(e) => setCustomTaxNominalInput(e.target.value)}
                        placeholder="Contoh: 290400"
                        className="w-full bg-white border border-stone-300 rounded-xl py-2 pl-9 pr-3 text-sm focus:ring-1 focus:ring-amber-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomTaxModal(false)}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold px-4 py-2 rounded-xl text-xs transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (customTaxType === 'ppn') {
                      if (customTaxMode === 'percentage') {
                        handleApplyPpn(Number(customTaxRateInput) || 11);
                      } else {
                        handleApplyPpn(0, Number(customTaxNominalInput) || 0);
                      }
                    } else {
                      if (customTaxMode === 'percentage') {
                        handleApplyPph(Number(customTaxRateInput) || 2);
                      } else {
                        handleApplyPph(0, Number(customTaxNominalInput) || 0);
                      }
                    }
                    setShowCustomTaxModal(false);
                  }}
                  className={`font-bold px-4 py-2 rounded-xl text-xs text-white transition ${
                    customTaxType === 'ppn' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Terapkan ke Tabel Item
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: Signatories and Personnel mapping */}
        <div className="border border-stone-200 rounded-2xl p-5 space-y-4 bg-stone-50/20">
          <div className="border-b border-stone-200 pb-2">
            <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-stone-500">Otorisasi & Tanda Tangan</h3>
            <p className="text-xs text-stone-450">Tentukan nama penandatangan untuk kedua format dokumen (Formulir PO maupun Kwitansi Kas).</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Form 1: Dibuat Oleh */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Dibuat Oleh (Formulir HO)</label>
              <input
                type="text"
                list="preset-dibuat"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={dibuatOleh}
                onChange={(e) => setDibuatOleh(e.target.value)}
              />
              <datalist id="preset-dibuat">
                {COMMON_NAMES.dibuatOleh.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            {/* Form 1: Disetujui Oleh */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Disetujui Oleh (Formulir HO)</label>
              <input
                type="text"
                list="preset-disetujui1"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={disetujuiOleh}
                onChange={(e) => setDisetujuiOleh(e.target.value)}
              />
              <datalist id="preset-disetujui1">
                {COMMON_NAMES.disetujuiOleh.map(n => <option key={n} value={n} />)}
              </datalist>
            </div>

            {/* Form 2: Diverifikasi Oleh */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Diverifikasi Oleh (Formulir Kasir)</label>
              <input
                type="text"
                list="preset-diverifikasi"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={diverifikasiOleh}
                onChange={(e) => setDiverifikasiOleh(e.target.value)}
              />
              <datalist id="preset-diverifikasi">
                {COMMON_NAMES.diverifikasiOleh.map(n => <option key={n} value={n} />)}
              </datalist>
              <input
                type="text"
                placeholder="Jabatan"
                className="w-full mt-1.5 bg-white border border-stone-150 rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-500"
                value={diverifikasiJabatan}
                onChange={(e) => setDiverifikasiJabatan(e.target.value)}
              />
            </div>

            {/* Form 2: Disetujui Voucher 1 */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Disetujui Voucher (Dir-Keu)</label>
              <input
                type="text"
                list="preset-disetujui2"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={disetujuiOleh}
                onChange={(e) => setDisetujuiOleh(e.target.value)}
              />
            </div>

            {/* Form 2: Disetujui Voucher 2 */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Disetujui Voucher (Dir-Utama)</label>
              <input
                type="text"
                list="preset-disetujuiUtama"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={disetujuiOleh2}
                onChange={(e) => setDisetujuiOleh2(e.target.value)}
              />
              <datalist id="preset-disetujuiUtama">
                {COMMON_NAMES.disetujuiOleh2.map(n => <option key={n} value={n} />)}
              </datalist>
              <input
                type="text"
                placeholder="Jabatan"
                className="w-full mt-1.5 bg-white border border-stone-150 rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-500"
                value={disetujuiJabatan2}
                onChange={(e) => setDisetujuiJabatan2(e.target.value)}
              />
            </div>

            {/* Form 2: Dibukukan Oleh */}
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Dibukukan Oleh (Accounting)</label>
              <input
                type="text"
                list="preset-dibukukan"
                className="w-full bg-white border border-stone-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                value={dibukukanOleh}
                onChange={(e) => setDibukukanOleh(e.target.value)}
              />
              <datalist id="preset-dibukukan">
                {COMMON_NAMES.dibukukanOleh.map(n => <option key={n} value={n} />)}
              </datalist>
              <input
                type="text"
                placeholder="Jabatan"
                className="w-full mt-1.5 bg-white border border-stone-150 rounded-lg py-1 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-500"
                value={dibukukanJabatan}
                onChange={(e) => setDibukukanJabatan(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-stone-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full sm:w-auto px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-750 font-semibold rounded-xl transition disabled:opacity-50"
          >
            Batal
          </button>
          
          <button
            type="submit"
            id="btn-save-submission"
            disabled={isSaving}
            className="w-full sm:w-auto flex flex-col items-center justify-center gap-1.5 bg-[#D4AF37] hover:bg-[#Bca031] text-stone-900 font-bold px-6 py-2.5 rounded-xl transition shadow-xs disabled:opacity-75"
          >
            {isSaving ? (
              <div className="flex flex-col items-center text-center">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-stone-900" />
                  <span className="text-sm font-bold">Sedang Diproses...</span>
                </div>
                {saveProgress && (
                  <span className="text-[10px] text-stone-750 font-mono mt-0.5 select-none animate-pulse max-w-[280px] truncate">
                    {saveProgress}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Save size={18} />
                <span>Simpan Data Pengajuan</span>
              </div>
            )}
          </button>
        </div>
      </form>

      {/* Google Drive File Delete Confirmation Warning Modal */}
      {driveFileToDelete && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <AlertCircle size={24} className="animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-stone-900 tracking-tight">PERINGATAN KERAS</h3>
                <p className="text-xs text-rose-700 font-semibold bg-rose-50/70 p-2.5 rounded-lg border border-rose-100 leading-relaxed">
                  Menghapus berkas lampiran ini melalui aplikasi akan otomatis menghapus berkas fisik tersebut secara permanen dari sistem Google Drive Anda!
                </p>
              </div>
            </div>

            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono block">Nama Berkas di Drive</span>
              <span className="text-xs font-bold text-stone-800 break-all block">{driveFileToDelete.name}</span>
            </div>

            {fileToDeleteError && (
              <div className="text-[11px] text-rose-650 font-semibold bg-rose-50 border border-rose-100 p-2.5 rounded-lg flex items-start gap-1.5 leading-relaxed">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{fileToDeleteError}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={fileToDeleteStatus === 'deleting'}
                onClick={driveFileToDelete.onConfirm}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition text-xs shadow-3xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {fileToDeleteStatus === 'deleting' ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-white" />
                    <span>Menghapus Berkas di Google Drive...</span>
                  </>
                ) : (
                  <span>Ya, Hapus Permanen dari Google Drive & Aplikasi</span>
                )}
              </button>

              {fileToDeleteError && (
                <button
                  type="button"
                  onClick={driveFileToDelete.onForceDeleteFromApp}
                  className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-250 font-bold rounded-xl transition text-xs cursor-pointer"
                >
                  Hapus Saja dari Aplikasi (Abaikan Error Drive)
                </button>
              )}

              <button
                type="button"
                disabled={fileToDeleteStatus === 'deleting'}
                onClick={() => {
                  setDriveFileToDelete(null);
                  setFileToDeleteError(null);
                }}
                className="w-full py-2 bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 font-bold rounded-xl transition text-xs cursor-pointer disabled:opacity-50"
              >
                Batalkan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL SYNC / TARIK DATA SPPD PERUSAHAAN */}
      {showSppdModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-stone-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch size={18} className="text-amber-400" />
                <h3 className="text-sm font-black uppercase font-display tracking-wider">
                  Impor Data SPPD (yudiakunkerja/SPPD-Perusahaan)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSppdModal(false)}
                className="p-1 text-stone-400 hover:text-white rounded-lg transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <SppdIntegration
                onImportSppdToSubmission={(sppd) => handleImportSppdData(sppd)}
                onClose={() => setShowSppdModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

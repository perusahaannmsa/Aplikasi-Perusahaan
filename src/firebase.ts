import { initializeApp, getApp, getApps, FirebaseApp, deleteApp } from 'firebase/app';
import firebaseAppletConfig from '../firebase-applet-config.json';
import { 
  getFirestore, 
  initializeFirestore,
  memoryLocalCache,
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy,
  where,
  limit,
  Firestore,
  getDocFromServer,
  getDoc,
  onSnapshot,
  writeBatch,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged, 
  Auth, 
  User,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence
} from 'firebase/auth';
import { Submission, SubmissionItem, ActivityLog, NpwpRecord, CompanyProfile, InternalMemo, Worker, MonthlyRecurringTransaction, EmployeeLoan } from './types';
import { INITIAL_WORKERS } from './constantsAbsen';
import { isPettyCashSubmission, getPettyCashCustodian, isInvoiceSubmission } from './utils';
import { apiFetch } from './utils/backendApi';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

// Global variable holding the active configuration
let firebaseApp: FirebaseApp | null = null;
export let firestoreDb: Firestore | null = null;
let firebaseAuth: Auth | null = null;
let currentUser: User | null = null;

export const getSharedFirebaseApp = (): FirebaseApp | null => {
  if (!firebaseApp) isFirebaseConfigured();
  return firebaseApp;
};

export const getSharedFirestoreDb = (): Firestore | null => {
  if (!firestoreDb) isFirebaseConfigured();
  return firestoreDb;
};

export const getSharedFirebaseAuth = (): Auth | null => {
  if (!firebaseAuth) isFirebaseConfigured();
  return firebaseAuth;
};

export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, label = 'Operasi Firestore'): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: any = new Error(`${label} melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik).`);
      err.code = 'deadline-exceeded';
      reject(err);
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
};

// 🔒 PERMANENT LOCKED OFFICIAL FIREBASE CONFIGURATION (PT Nusantara Mineral Sukses Abadi)
// JANGAN DIUBAH OLEH AI GITHUB ATAU SISTEM APAPUN - KONFIGURASI RESMI & PERMANEN PERUSAHAAN
export const PERMANENT_LOCKED_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDfIvUOLqAULR9eKy0rkqJfY_99Q4rxy2M",
  authDomain: "pencatatan-voucher-perusahaan.firebaseapp.com",
  databaseURL: "https://pencatatan-voucher-perusahaan-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pencatatan-voucher-perusahaan",
  storageBucket: "pencatatan-voucher-perusahaan.firebasestorage.app",
  messagingSenderId: "5344554002",
  appId: "1:5344554002:web:9137a500fbb8f3223b7ccb",
  measurementId: "G-1249N852Y5",
  firestoreDatabaseId: "(default)"
};

export const getOfficialFirebaseConfig = () => PERMANENT_LOCKED_FIREBASE_CONFIG;

// Helper to check and parse stored config - permanently defaults to NMSA Official Project
export const getStoredFirebaseConfig = (): any => {
  // 1. Check if a custom user config was explicitly saved via Migration / Settings panel
  try {
    const isManualCustom = localStorage.getItem('NUSANTARA_CUSTOM_CONFIG_MANUAL') === 'true';
    const custom = localStorage.getItem('NUSANTARA_FIREBASE_CONFIG');
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed && parsed.apiKey && parsed.projectId) {
        if (isManualCustom || parsed.projectId === PERMANENT_LOCKED_FIREBASE_CONFIG.projectId) {
          return {
            ...parsed,
            firestoreDatabaseId: parsed.firestoreDatabaseId || '(default)'
          };
        } else {
          // Stale non-manual config from another project -> clear and restore official config
          try { localStorage.removeItem('NUSANTARA_FIREBASE_CONFIG'); } catch (_) {}
        }
      }
    }
  } catch (e) {
    console.warn('Error reading stored custom firebase config:', e);
  }

  // 2. Always return the official locked NMSA configuration
  return PERMANENT_LOCKED_FIREBASE_CONFIG;
};

// TWO-WAY DATA SCHEMAS TRANSLATION / MAPPER UTILITIES
export const mapFirestoreToSubmission = (docId: string, data: any): Submission => {
  let firestoreItems = Array.isArray(data.items) ? data.items : [];
  
  // Reconstruct nested item array if the old record was stored flat at the top-level
  if (firestoreItems.length === 0) {
    const itemName = data.isi_invoice || data.isiInvoice || data.item || data.nama || data.jenis_pengajuan || data.jenisPengajuan || data.jenis || 'Item Penyerahan';
    const itemTotal = parseFloat(data.total_nominal || data.totalNominal || data.nominal || data.total || '0') || 0;
    const itemQty = data.qty !== undefined ? String(data.qty) : (data.jumlahVolume || '1');
    const itemKeterangan = data.no_invoice || data.noInvoice || data.keterangan || '';
    
    firestoreItems = [{
      id: `item-${docId}-flat`,
      no: 1,
      nama: itemName,
      qty: itemQty,
      nominal: itemTotal,
      totalNominal: itemTotal,
      noInvoice: itemKeterangan,
      keterangan: itemKeterangan,
      status: data.status || 'Belum Lunas'
    }];
  }

  // Map internal database nested maps to UI SubmissionItem structures
  const mappedItems: SubmissionItem[] = firestoreItems.map((fi: any, idx: number) => {
    let ket = '';
    if (fi.keterangan !== undefined) {
      ket = fi.keterangan || '';
    } else if (fi.noInvoice !== undefined) {
      const isAutoGenerated = typeof fi.noInvoice === 'string' && fi.noInvoice.startsWith('INV-sub-');
      ket = isAutoGenerated ? '' : (fi.noInvoice || '');
    }
    return {
      id: fi.id || `item-${docId}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      no: fi.no || (idx + 1),
      item: fi.nama || fi.item || 'Item Penyerahan',
      jumlahVolume: fi.qty !== undefined ? `${fi.qty}` : (fi.jumlahVolume || '1'),
      total: fi.totalNominal || fi.nominal || fi.total || 0,
      keterangan: ket
    };
  });

  // Extract date correctly from Firestore Timestamp, milliseconds, or string representation
  const extractIsoDate = (rawVal: any, fallbackIso: string): string => {
    if (!rawVal) return fallbackIso;
    if (typeof rawVal.toDate === 'function') {
      return rawVal.toDate().toISOString();
    }
    if (typeof rawVal === 'object' && typeof rawVal.seconds === 'number') {
      return new Date(rawVal.seconds * 1000).toISOString();
    }
    return String(rawVal);
  };

  const fallbackNowIso = new Date().toISOString();
  const createdAtStr = extractIsoDate(data.createdAt || data.created_at || data.tanggal, fallbackNowIso);
  const updatedAtStr = extractIsoDate(data.updatedAt || data.updated_at, createdAtStr);

  // Determine which field holds the long document code (e.g. BKK-NMSA/VI/2026/10001)
  let docCode = '';
  const candidates = [
    data.no_invoice,
    data.noInvoice,
    data.kode,
    data.code
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 5) {
      docCode = c;
      break;
    }
  }
  if (!docCode) {
    docCode = data.no_invoice || data.noInvoice || data.kode || data.code || 'BKK-HO/VI/2026/10001';
  }

  const firstItem = firestoreItems[0] || {};
  const hasProof = !!(data.buktiPembayaran || (Array.isArray(data.googleDriveFiles) && data.googleDriveFiles.some((f: any) => f.isBuktiPembayaran)));
  const rawStatus = data.status || firstItem.status;
  const isDocLunas = rawStatus === 'Lunas' || hasProof || (!rawStatus && (data.dibayarkanDengan === 'Cek/Transfer' || data.dibayarkan_dengan === 'Cek/Transfer'));
  const finalStatus: 'Lunas' | 'Belum Lunas' | 'DP / Cicilan' = rawStatus === 'DP / Cicilan'
    ? 'DP / Cicilan'
    : (isDocLunas ? 'Lunas' : (rawStatus || 'Belum Lunas'));

  // Parse DP / Cicilan amount and history
  const rawDp = data.dpAmount !== undefined ? data.dpAmount : (data.dp_amount !== undefined ? data.dp_amount : undefined);
  const parsedDpAmount = typeof rawDp === 'number' ? rawDp : (rawDp && !isNaN(Number(rawDp)) ? Number(rawDp) : undefined);
  const rawCicilanNotes = data.cicilanNotes || data.cicilan_notes || undefined;
  const rawRiwayatCicilan = Array.isArray(data.riwayatCicilan) ? data.riwayatCicilan : (Array.isArray(data.riwayat_cicilan) ? data.riwayat_cicilan : undefined);
  const rawRekeningTujuan = data.rekeningTujuan || data.rekening_tujuan || undefined;

  return {
    id: docId,
    lokasi: data.lokasi || firstItem.lokasi || 'Lt. 1',
    tanggal: data.tanggal || data.tanggal_pengajuan || firstItem.tanggal || new Date().toISOString().split('T')[0],
    jenisPengajuan: data.jenisPengajuan || data.jenis_pengajuan || data.jenis || firstItem.jenis || '',
    kode: docCode,
    dibayarkanKepada: data.dibayarkanKepada || data.dibayarkan_kepada || 'Penerima',
    dibayarkanDengan: data.dibayarkanDengan || data.dibayarkan_dengan || (finalStatus === 'Lunas' ? 'Cek/Transfer' : 'Tunai'),
    status: finalStatus,
    dpAmount: parsedDpAmount,
    cicilanNotes: rawCicilanNotes,
    riwayatCicilan: rawRiwayatCicilan,
    rekeningTujuan: rawRekeningTujuan,
    notes: data.notes || data.catatan || data.catatan_tambahan || data.catatanTambahan || '',
    
    // Corporate signatures support
    dibuatOleh: data.dibuatOleh || data.createdByEmail || 'Nur Wahyudi',
    disetujuiOleh: data.disetujuiOleh || 'Harijon',
    diverifikasiOleh: data.diverifikasiOleh || 'Andi Dhiya Salsabila',
    diverifikasiJabatan: data.diverifikasiJabatan || 'Keuangan',
    disetujuiOleh2: data.disetujuiOleh2 || 'H. A. Nursyam Halid',
    disetujuiJabatan2: data.disetujuiJabatan2 || 'Direktur Utama',
    dibukukanOleh: data.dibukukanOleh || 'Sri Ekowati',
    dibukukanJabatan: data.dibukukanJabatan || 'Accounting',

    // Google Drive attachment support
    googleDriveFileUrl: data.googleDriveFileUrl || '',
    googleDriveFileName: data.googleDriveFileName || '',
    googleDriveFolderId: data.googleDriveFolderId || undefined,
    driveArchived: data.driveArchived === true ? true : undefined,
    googleDriveFiles: data.googleDriveFiles || (data.googleDriveFileUrl ? [{ url: data.googleDriveFileUrl, name: data.googleDriveFileName || 'Buka di Drive' }] : []),
    buktiPembayaran: data.buktiPembayaran || undefined,

    // Invoice properties mapping
    isInvoice: isInvoiceSubmission(data),
    invoiceNumber: data.invoiceNumber || '',
    invoiceDate: data.invoiceDate || '',
    invoiceAmount: typeof data.invoiceAmount === 'number' ? data.invoiceAmount : undefined,

    // PPh 23 & Bukti Potong properties
    pph23Rate: typeof data.pph23Rate === 'number' ? data.pph23Rate : undefined,
    pph23Amount: typeof data.pph23Amount === 'number' ? data.pph23Amount : undefined,
    dppAmount: typeof data.dppAmount === 'number' ? data.dppAmount : undefined,
    bupotNumber: data.bupotNumber || undefined,
    bupotStatus: data.bupotStatus || undefined,
    bupotDate: data.bupotDate || undefined,
    vendorNpwp: data.vendorNpwp || undefined,
    bupotDriveUrl: data.bupotDriveUrl || undefined,
    bupotFileName: data.bupotFileName || undefined,

    // Petty Cash properties mapping (unified across all menus)
    isPettyCash: isPettyCashSubmission(data),
    pettyCashCustodian: getPettyCashCustodian(data),
    pettyCashFile: data.pettyCashFile || undefined,

    // Accurate Online Mapping properties
    isAccurateMapped: data.isAccurateMapped === true || !!data.accurateMappingReportId || (Array.isArray(data.accurateMappedTransactions) && data.accurateMappedTransactions.length > 0),
    accurateMappedAt: data.accurateMappedAt || '',
    accurateMappingReportId: data.accurateMappingReportId || '',
    accurateMappedTransactions: Array.isArray(data.accurateMappedTransactions) ? data.accurateMappedTransactions : undefined,
    accurateTotalExpense: typeof data.accurateTotalExpense === 'number' ? data.accurateTotalExpense : undefined,
    accurateKasAccountCode: data.accurateKasAccountCode || '',
    accurateReportTitle: data.accurateReportTitle || '',

    // Company & Project / Loan / Monthly links
    companyId: (data.companyId || data.company_id || 'nmsa').toLowerCase().trim(),
    companyName: data.companyName || data.company_name || undefined,
    noRekeningTujuan: data.noRekeningTujuan || undefined,
    namaBankTujuan: data.namaBankTujuan || undefined,
    atasNamaRekeningTujuan: data.atasNamaRekeningTujuan || undefined,
    projectId: data.projectId || undefined,
    projectName: data.projectName || undefined,
    projectCode: data.projectCode || undefined,
    projectRabItemId: data.projectRabItemId || undefined,
    projectRabItemName: data.projectRabItemName || undefined,
    projectAccountCode: data.projectAccountCode || undefined,
    projectAccountName: data.projectAccountName || undefined,
    loanId: data.loanId || undefined,
    loanNumber: data.loanNumber || undefined,
    recurringTemplateId: data.recurringTemplateId || undefined,
    recurringMonth: data.recurringMonth || undefined,
    showF2: data.showF2,
    f2ApprovedBy: data.f2ApprovedBy,

    items: mappedItems,
    createdAt: createdAtStr,
    updatedAt: updatedAtStr,
    deletedPageIds: Array.isArray(data.deletedPageIds) ? data.deletedPageIds : []
  };
};

// Deeply sanitize objects to replace undefined/NaN/oversized Base64 values to prevent Firestore write crashes & 1MB limit errors
export const cleanUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (typeof obj === 'number') {
    return Number.isFinite(obj) ? obj : 0;
  }
  if (typeof obj === 'string') {
    if (obj.startsWith('data:') && obj.length > 150000) {
      return `[LOCAL_BASE64_ATTACHMENT:${Math.round(obj.length / 1024)}KB]`;
    }
    return obj;
  }
  if (obj instanceof Date) {
    return isNaN(obj.getTime()) ? new Date() : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item));
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined && typeof val !== 'function') {
        cleaned[key] = cleanUndefined(val);
      }
    }
    return cleaned;
  }
  return obj;
};

export const sanitizeFirestoreDocId = (rawId: string): string => {
  const cleaned = String(rawId || `sub-${Date.now()}`).replace(/\//g, '-').trim();
  return (cleaned || `sub-${Date.now()}`).slice(0, 128);
};

// Safe helper to strip huge Base64 data URLs (> 300 KB) from Firestore documents to prevent 1MB limit crash
export const sanitizeUrlForFirestore = (url: string | null | undefined, docName: string = 'Dokumen'): string => {
  if (!url) return '';
  // If it's a huge Base64 string that will overflow Firestore's 1MB limit
  if (url.startsWith('data:') && url.length > 300000) {
    console.warn(`⚠️ URL for "${docName}" is a massive Base64 payload (${(url.length / 1024 / 1024).toFixed(2)} MB). Excluded from Firestore document body to comply with 1MB limit.`);
    return `[LOCAL_BASE64_ATTACHMENT:${docName}]`;
  }
  return url;
};

export const mapSubmissionToFirestore = (
  sub: Submission, 
  userEmail?: string, 
  userId?: string,
  userCompanyId: string = 'nmsa',
  userCompanyName: string = 'PT Nusantara Mineral Sukses Abadi'
): any => {
  const hasProof = !!(sub.buktiPembayaran || (Array.isArray(sub.googleDriveFiles) && sub.googleDriveFiles.some(f => f.isBuktiPembayaran)));
  const finalStatus = sub.status === 'DP / Cicilan'
    ? 'DP / Cicilan'
    : (sub.status === 'Lunas' || hasProof ? 'Lunas' : (sub.status || (sub.dibayarkanDengan === 'Cek/Transfer' ? 'Lunas' : 'Belum Lunas')));
  const isLunas = finalStatus === 'Lunas';
  const computedTotal = Array.isArray(sub.items) ? sub.items.reduce((sum, item) => sum + (item.total || 0), 0) : 0;
  const firstItemKeterangan = (sub.items && sub.items[0]?.keterangan) || '';
  const firstItemName = (sub.items && sub.items[0]?.item) || '';

  let shortKode = 'HO';
  if (sub.kode) {
    const upperSubKode = sub.kode.toUpperCase();
    if (upperSubKode.includes('LP')) {
      shortKode = 'LP';
    } else if (upperSubKode.includes('HO')) {
      shortKode = 'HO';
    } else {
      shortKode = userCompanyId ? userCompanyId.toUpperCase() : 'HO';
    }
  }

  const subItemsList = Array.isArray(sub.items) ? sub.items : [];
  const cleanItems = subItemsList.map((item, idx) => {
    // Extract numbers from volume (e.g. "1 Lot" -> 1, "5 Box" -> 5)
    const qtyStr = String(item.jumlahVolume || '1');
    const parsedQty = parseInt(qtyStr.replace(/[^0-9]/g, '')) || 1;
    
    return {
      nama: item.item || '',
      nominal: item.total || 0, 
      qty: parsedQty,
      jenis: sub.jenisPengajuan || '',
      kode: shortKode,
      lokasi: sub.lokasi || 'Lt. 1',
      noInvoice: item.keterangan || '',
      keterangan: item.keterangan || '',
      status: finalStatus,
      tanggal: sub.tanggal || '',
      tglBayar: isLunas && sub.tanggal ? new Date(sub.tanggal) : null,
      totalNominal: item.total || 0
    };
  });

  const parsedCreatedAt = sub.createdAt && !isNaN(new Date(sub.createdAt).getTime())
    ? new Date(sub.createdAt)
    : new Date();
  const parsedUpdatedAt = sub.updatedAt && !isNaN(new Date(sub.updatedAt).getTime())
    ? new Date(sub.updatedAt)
    : new Date();

  return {
    // Both camelCase and snake_case fields for total backwards compatibility
    catatan: sub.notes || '',
    catatan_tambahan: sub.notes || '',
    catatanTambahan: sub.notes || '',
    companyId: (sub.companyId || userCompanyId || 'nmsa').toLowerCase().trim(),
    companyName: sub.companyName || userCompanyName,
    company_id: (sub.companyId || userCompanyId || 'nmsa').toLowerCase().trim(),
    company_name: sub.companyName || userCompanyName,
    createdAt: parsedCreatedAt,
    created_at: parsedCreatedAt,
    createdBy: userId || 'pwsDJv3bKHQamy89PDaAeCoZQcU2',
    createdByEmail: userEmail || 'admin@nmsa.com',
    dibayarkanKepada: sub.dibayarkanKepada || '',
    dibayarkan_kepada: sub.dibayarkanKepada || '',
    dibayarkanDengan: sub.dibayarkanDengan || 'Tunai',
    dibayarkan_dengan: sub.dibayarkanDengan || 'Tunai',
    status: finalStatus,
    totalNominal: computedTotal,
    total_nominal: computedTotal,
    noInvoice: sub.kode || '',
    no_invoice: sub.kode || '',
    isi_invoice: firstItemName,
    isiInvoice: firstItemName,
    files: [],
    
    // Google Drive attachment support (with Firestore 1MB limit safety)
    googleDriveFileUrl: sanitizeUrlForFirestore(sub.googleDriveFileUrl, sub.googleDriveFileName || 'Lampiran'),
    googleDriveFileName: sub.googleDriveFileName || '',
    googleDriveFolderId: sub.googleDriveFolderId || null,
    driveArchived: sub.driveArchived === true ? true : null,
    googleDriveFiles: Array.isArray(sub.googleDriveFiles)
      ? sub.googleDriveFiles.map(f => ({
          ...f,
          url: sanitizeUrlForFirestore(f.url, f.name || 'Lampiran')
        }))
      : [],

    items: cleanItems,
    updatedAt: parsedUpdatedAt,
    updated_at: parsedUpdatedAt,
    
    // Double save native fields so pulling it back preserves signatures
    id: sub.id,
    
    // DP & Cicilan Bertahap synchronization
    dpAmount: typeof sub.dpAmount === 'number' ? sub.dpAmount : (sub.dpAmount && !isNaN(Number(sub.dpAmount)) ? Number(sub.dpAmount) : null),
    dp_amount: typeof sub.dpAmount === 'number' ? sub.dpAmount : (sub.dpAmount && !isNaN(Number(sub.dpAmount)) ? Number(sub.dpAmount) : null),
    cicilanNotes: sub.cicilanNotes || null,
    cicilan_notes: sub.cicilanNotes || null,
    riwayatCicilan: Array.isArray(sub.riwayatCicilan) ? sub.riwayatCicilan : null,
    riwayat_cicilan: Array.isArray(sub.riwayatCicilan) ? sub.riwayatCicilan : null,
    rekeningTujuan: sub.rekeningTujuan || null,
    rekening_tujuan: sub.rekeningTujuan || null,
    noRekeningTujuan: sub.noRekeningTujuan || null,
    namaBankTujuan: sub.namaBankTujuan || null,
    atasNamaRekeningTujuan: sub.atasNamaRekeningTujuan || null,

    isInvoice: isInvoiceSubmission(sub),
    invoiceNumber: sub.invoiceNumber || '',
    invoiceDate: sub.invoiceDate || '',
    invoiceAmount: typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : null,

    pph23Rate: typeof sub.pph23Rate === 'number' ? sub.pph23Rate : null,
    pph23Amount: typeof sub.pph23Amount === 'number' ? sub.pph23Amount : null,
    dppAmount: typeof sub.dppAmount === 'number' ? sub.dppAmount : null,
    bupotNumber: sub.bupotNumber || null,
    bupotStatus: sub.bupotStatus || null,
    bupotDate: sub.bupotDate || null,
    vendorNpwp: sub.vendorNpwp || null,
    bupotDriveUrl: sanitizeUrlForFirestore(sub.bupotDriveUrl, sub.bupotFileName || 'Bukti Potong PPh 23') || null,
    bupotFileName: sub.bupotFileName || null,

    buktiPembayaran: sub.buktiPembayaran ? {
      ...sub.buktiPembayaran,
      url: sanitizeUrlForFirestore(sub.buktiPembayaran.url, sub.buktiPembayaran.name || 'Bukti Pembayaran')
    } : null,

    isPettyCash: isPettyCashSubmission(sub),
    pettyCashCustodian: getPettyCashCustodian(sub),
    pettyCashFile: sub.pettyCashFile ? {
      ...sub.pettyCashFile,
      url: sanitizeUrlForFirestore(sub.pettyCashFile.url, sub.pettyCashFile.name || 'Laporan Petty Cash')
    } : null,
    
    // Accurate Online mapping persistence
    isAccurateMapped: sub.isAccurateMapped === true || !!sub.accurateMappingReportId || (Array.isArray(sub.accurateMappedTransactions) && sub.accurateMappedTransactions.length > 0),
    accurateMappedAt: sub.accurateMappedAt || '',
    accurateMappingReportId: sub.accurateMappingReportId || '',
    accurateMappedTransactions: Array.isArray(sub.accurateMappedTransactions) ? sub.accurateMappedTransactions : null,
    accurateTotalExpense: typeof sub.accurateTotalExpense === 'number' ? sub.accurateTotalExpense : null,
    accurateKasAccountCode: sub.accurateKasAccountCode || '',
    accurateReportTitle: sub.accurateReportTitle || '',

    lokasi: sub.lokasi || 'Lt. 1',
    tanggal: sub.tanggal || '',
    jenisPengajuan: sub.jenisPengajuan || '',
    jenis_pengajuan: sub.jenisPengajuan || '',
    jenis: sub.jenisPengajuan || '',
    kode: shortKode,
    dibuatOleh: sub.dibuatOleh || '',
    disetujuiOleh: sub.disetujuiOleh || '',
    diverifikasiOleh: sub.diverifikasiOleh || '',
    diverifikasiJabatan: sub.diverifikasiJabatan || '',
    disetujuiOleh2: sub.disetujuiOleh2 || '',
    disetujuiJabatan2: sub.disetujuiJabatan2 || '',
    dibukukanOleh: sub.dibukukanOleh || '',
    dibukukanJabatan: sub.dibukukanJabatan || '',
    projectId: sub.projectId || null,
    projectName: sub.projectName || null,
    projectCode: sub.projectCode || null,
    projectRabItemId: sub.projectRabItemId || null,
    projectRabItemName: sub.projectRabItemName || null,
    projectAccountCode: sub.projectAccountCode || null,
    projectAccountName: sub.projectAccountName || null,
    loanId: sub.loanId || null,
    loanNumber: sub.loanNumber || null,
    recurringTemplateId: sub.recurringTemplateId || null,
    recurringMonth: sub.recurringMonth || null,
    showF2: typeof sub.showF2 === 'boolean' ? sub.showF2 : null,
    f2ApprovedBy: sub.f2ApprovedBy || null,
    deletedPageIds: sub.deletedPageIds || []
  };
};

export const getUserProfileFromFirestore = async (uid: string): Promise<any> => {
  if (!isFirebaseConfigured() || !firestoreDb || isFirestoreQuotaExceeded() || isFirestoreInternalDegraded()) return null;
  try {
    const docRef = doc(firestoreDb, 'users', uid);
    const snap = await withTimeout(getDoc(docRef), 8000, 'Baca profil user');
    if (snap.exists()) {
      const data = snap.data();
      if (data?.companyId) {
        setActiveCompanyId(data.companyId);
      }
      return data;
    }
  } catch (err) {
    markFirestoreInternalAssertion(err);
    console.warn('Silent read rejection - failed to fetch user profile:', err);
  }
  return null;
};

let activeCompanyId: string = 'nmsa';
export const getActiveCompanyId = () => activeCompanyId;
export const setActiveCompanyId = (id: string) => {
  activeCompanyId = id.toLowerCase().trim();
};

export const getCompanyProfileFromFirestore = async (companyId: string): Promise<any> => {
  const cleanId = companyId.toLowerCase().trim();
  setActiveCompanyId(cleanId);
  
  // Try fetching from Firestore
  if (isFirebaseConfigured() && firestoreDb && !isFirestoreQuotaExceeded() && !isFirestoreInternalDegraded()) {
    try {
      const docRef = doc(firestoreDb, 'companies', cleanId);
      const snap = await withTimeout(getDoc(docRef), 8000, 'Baca profil perusahaan');
      if (snap.exists()) {
        const data = snap.data();
        // Auto-load shared Google Drive settings from Firestore to achieve zero-friction default connection!
        if (Array.isArray(data.googleDrives) && data.googleDrives.length > 0) {
          console.log('🔄 Auto-loaded company-shared Google Drive settings from Firestore:', data.googleDrives.length, 'drives');
          const mergedDrives = mergeDrivesWithLocal(data.googleDrives);
          localStorage.setItem('NUSANTARA_CONNECTED_DRIVES', JSON.stringify(mergedDrives));
          const activeDrive = mergedDrives.find((d: any) => isDriveTokenValid(d) && (d.quotaLimit - d.quotaUsed > 10 * 1024 * 1024));
          const bestToken = activeDrive ? activeDrive.accessToken : (mergedDrives[0]?.accessToken || null);
          if (bestToken) {
            localStorage.setItem('NUSANTARA_GOOGLE_DRIVE_TOKEN', bestToken);
          }
        }
        return data;
      }
    } catch (err) {
      markFirestoreInternalAssertion(err);
      console.warn('Silent read rejection - failed to fetch company profile from Firestore:', err);
    }
  }

  // Fallback to locally saved companies
  try {
    const localRaw = localStorage.getItem('NUSANTARA_SAVED_COMPANIES');
    if (localRaw) {
      const list = JSON.parse(localRaw);
      if (Array.isArray(list)) {
        const match = list.find((c: any) => (c.id || c.code || '').toLowerCase().trim() === cleanId);
        if (match) return match;
      }
    }
  } catch (e) {
    console.warn('Fallback local company read warning:', e);
  }

  return null;
};

export const loadAllCompaniesFromFirestore = async (): Promise<any[]> => {
  const result: any[] = [];
  
  if (isFirebaseConfigured() && firestoreDb && !isFirestoreQuotaExceeded() && !isFirestoreInternalDegraded()) {
    try {
      const colRef = collection(firestoreDb, 'companies');
      const snap = await withTimeout(getDocs(colRef), 8000, 'Baca daftar perusahaan');
      snap.forEach((doc) => {
        result.push(doc.data());
      });
    } catch (err) {
      markFirestoreInternalAssertion(err);
      console.warn('Silent read rejection - failed to fetch companies from Firestore:', err);
    }
  }

  // Merge with locally stored companies
  try {
    const localRaw = localStorage.getItem('NUSANTARA_SAVED_COMPANIES');
    if (localRaw) {
      const localList = JSON.parse(localRaw);
      if (Array.isArray(localList)) {
        localList.forEach((localComp: any) => {
          const lId = (localComp.id || localComp.code || '').toLowerCase().trim();
          if (!result.some(r => (r.id || r.code || '').toLowerCase().trim() === lId)) {
            result.push(localComp);
          }
        });
      }
    }
  } catch (e) {
    console.warn('Local companies merge warning:', e);
  }

  return result;
};

// Save or create a new company profile in Firestore with instant local backup
export const saveCompanyProfileToFirestore = async (company: Partial<CompanyProfile>): Promise<void> => {
  const rawCode = company.code || company.id || 'company';
  const cleanId = (company.id || rawCode).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
  const cleanCode = rawCode.toUpperCase().trim();
  const companyName = (company.name || company.fullName || cleanCode).trim();
  
  const payload = {
    id: cleanId,
    code: cleanCode,
    name: companyName,
    fullName: company.fullName || companyName,
    displayName: company.displayName || companyName,
    defaultJenis: company.defaultJenis || 'Operasional Kantor',
    defaultKode: company.defaultKode || `BKK-${cleanCode}/V/2026/10001`,
    defaultLokasi: company.defaultLokasi || 'Lt. 1',
    no_invoice_prefix: company.no_invoice_prefix || `BKK-${cleanCode}`,
    sigDibuat: company.sigDibuat || 'Nur Wahyudi',
    sigDibuatJabatan: company.sigDibuatJabatan || 'Staff Operasional',
    sigAccounting: company.sigAccounting || 'Sri Ekowati',
    sigAccountingJabatan: company.sigAccountingJabatan || 'Manager Keuangan',
    sigDiverifikasi: company.sigDiverifikasi || 'Andi Muhammad Rifki',
    sigDiverifikasiJabatan: company.sigDiverifikasiJabatan || 'Direktur',
    sigDisetujui: company.sigDisetujui || 'Harijon',
    sigDisetujuiJabatan: company.sigDisetujuiJabatan || 'Direktur Keuangan',
    sigMengetahui: company.sigMengetahui || 'ABDUL AZIZ HALID',
    sigMengetahuiJabatan: company.sigMengetahuiJabatan || 'Direktur Operasional',
    sigDirektur: company.sigDirektur || 'H. Andi Nursyam Halid',
    sigDirekturJabatan: company.sigDirekturJabatan || 'Direktur Utama',
    sigDirKeuangan: company.sigDirKeuangan || 'Harijon',
    sigKeuangan: company.sigKeuangan || 'Sri Ekowati',
    icon: company.icon || '🏢',
    logoUrl: company.logoUrl || '',
    isActive: company.isActive ?? true,
    updatedAt: new Date().toISOString(),
    createdAt: company.createdAt || new Date().toISOString()
  };

  // Always save to local storage immediately
  try {
    const localRaw = localStorage.getItem('NUSANTARA_SAVED_COMPANIES');
    let list: any[] = [];
    if (localRaw) {
      try { list = JSON.parse(localRaw); } catch (e) { list = []; }
    }
    const idx = list.findIndex((c: any) => (c.id || c.code || '').toLowerCase().trim() === cleanId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...payload };
    } else {
      list.push(payload);
    }
    localStorage.setItem('NUSANTARA_SAVED_COMPANIES', JSON.stringify(list));
  } catch (e) {
    console.warn('Local storage company backup warning:', e);
  }

  setActiveCompanyId(cleanId);

  // Stored locally to conserve daily Firestore quota
};

// Switch active user company and store locally
export const switchUserCompany = async (
  uid: string,
  companyId: string,
  companyName: string
): Promise<void> => {
  const cleanId = companyId.toLowerCase().trim();
  setActiveCompanyId(cleanId);
  localStorage.setItem('NUSANTARA_ACTIVE_COMPANY_ID', cleanId);
  localStorage.setItem('NUSANTARA_ACTIVE_COMPANY_NAME', companyName);
  console.log(`👤 User [${uid}] company switched to [${cleanId} - ${companyName}] (saved locally)`);
};

export const registerUserToFirebase = async (
  _email: string, 
  _password: string, 
  _fullName: string, 
  _role: string,
  _companyId: string = 'nmsa',
  _companyName: string = 'PT Nusantara Mineral Sukses Abadi',
  _logoUrl: string = ''
): Promise<User> => {
  throw new Error('Fitur pendaftaran akun dinonaktifkan. Aplikasi berstatus tertutup khusus akun terdaftar langsung oleh Administrator di Firebase Console.');
};

// Production configuration for NMSA original database
export const NMSA_PROD_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDfIvUOLqAULR9eKy0rkqJfY_99Q4rxy2M",
  authDomain: "pencatatan-voucher-perusahaan.firebaseapp.com",
  databaseURL: "https://pencatatan-voucher-perusahaan-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pencatatan-voucher-perusahaan",
  storageBucket: "pencatatan-voucher-perusahaan.firebasestorage.app",
  messagingSenderId: "5344554002",
  appId: "1:5344554002:web:9137a500fbb8f3223b7ccb",
  measurementId: "G-1249N852Y5"
};

// Switch active database to NMSA original project
export const switchToProductionDatabase = (): boolean => {
  try {
    localStorage.removeItem('NUSANTARA_CUSTOM_CONFIG_MANUAL');
    localStorage.removeItem('NUSANTARA_FIREBASE_CONFIG');
  } catch (_) {}
  return initializeFirebaseApp(PERMANENT_LOCKED_FIREBASE_CONFIG);
};

// Switch active database back to AI Studio Applet project
export const switchToAppletDatabase = (): boolean => {
  localStorage.removeItem('NUSANTARA_FIREBASE_CONFIG');
  if (firebaseAppletConfig && (firebaseAppletConfig as any).apiKey) {
    return initializeFirebaseApp(firebaseAppletConfig);
  }
  return false;
};

// Get current active Firebase project ID
export const getActiveFirebaseProjectId = (): string => {
  const cfg = getStoredFirebaseConfig();
  return cfg?.projectId || 'unknown';
};

const createSafeFirestoreInstance = (app: FirebaseApp, dbId: string): Firestore => {
  try {
    // Use memoryLocalCache + experimentalAutoDetectLongPolling to prevent IndexedDB WatchChangeAggregator (ca9/b815)
    // assertion failures and proxy/iFrame WebChannel stalls; app already persists backups in localStorage & server JSON.
    return initializeFirestore(
      app,
      {
        localCache: memoryLocalCache(),
        experimentalAutoDetectLongPolling: true,
      },
      dbId
    );
  } catch {
    return getFirestore(app, dbId);
  }
};

// Initialize Firebase dynamically based on configs
export const initializeFirebaseApp = (customConfig?: any): boolean => {
  const config = customConfig || getStoredFirebaseConfig();
  if (!config || !config.apiKey || !config.projectId) {
    firebaseApp = null;
    firestoreDb = null;
    firebaseAuth = null;
    return false;
  }

  try {
    const defaultApp = getApps().find(a => a.name === '[DEFAULT]');
    if (defaultApp) {
      // If the current defaultApp belongs to a different project, recreate it cleanly
      if (defaultApp.options.projectId !== config.projectId) {
        try {
          deleteApp(defaultApp);
        } catch (_) {}
        firebaseApp = initializeApp(config);
      } else {
        firebaseApp = defaultApp;
      }
    } else {
      firebaseApp = initializeApp(config);
    }
    // Set firestore and auth instances
    const dbId = config.firestoreDatabaseId || (firebaseAppletConfig as any)?.firestoreDatabaseId || "(default)";
    firestoreDb = createSafeFirestoreInstance(firebaseApp, dbId);
    registerFirestoreInstance(firestoreDb);
    firebaseAuth = getAuth(firebaseApp);
    // Keep primary Firebase Auth session permanently persisted across refreshes & new tabs
    setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {});
    
    // Register listener for auth states
    onAuthStateChanged(firebaseAuth, (user) => {
      if (isDrivePopupConnecting) return;
      currentUser = user;
      console.log('📡 Auth State Modified. User logged in:', user ? user.email : 'NONE');
      if (user) {
        resetFirestorePermissionDenied();
        if (!isFirestoreQuotaExceeded()) {
          testConnection();
        }
      }
    });

    console.log('✅ Firebase initialized successfully with project:', config.projectId);
    
    // If quota is already exceeded, immediately disable network to prevent gRPC Write stream errors
    if (isFirestoreQuotaExceeded()) {
      isFirestoreNetworkDisabledByQuota = true;
      console.log('ℹ️ [Firestore Init] Kuota harian Firestore sedang dalam masa cooldown. Jaringan dinonaktifkan untuk mencegah gRPC Write stream errors.');
      disableNetwork(firestoreDb).catch(() => {});
    }
    return true;
  } catch (e) {
    console.error('❌ Failed to initialize Firebase:', e);
    firebaseApp = null;
    firestoreDb = null;
    firebaseAuth = null;
    return false;
  }
};

// Asynchronously validate connection
async function testConnection() {
  if (!firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) return;
  try {
    await withTimeout(getDocFromServer(doc(firestoreDb, 'test', 'connection')), 6000, 'Tes koneksi Firestore');
    console.log('📡 Firestore database connection status: ACTIVE');
  } catch (error: any) {
    markFirestoreInternalAssertion(error);
    if (isFirestorePermissionError(error)) {
      return;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network status.");
    }
  }
}

// Registered Firestore instances across the application
const registeredFirestoreInstances = new Set<Firestore>();
let isFirestoreNetworkDisabledByQuota = false;

export const registerFirestoreInstance = (dbInstance: Firestore | null) => {
  if (dbInstance) {
    registeredFirestoreInstances.add(dbInstance);
    if (isFirestoreQuotaExceeded()) {
      isFirestoreNetworkDisabledByQuota = true;
      disableNetwork(dbInstance).catch(() => {});
    }
  }
};

// Circuit breaker for Firebase SDK internal state assertion errors (e.g. b815 / ca9)
let lastInternalAssertionTime = 0;
let lastInternalAssertionLogTime = 0;
const INTERNAL_ASSERTION_COOLDOWN_MS = 60 * 1000;

export const isFirestoreInternalAssertionError = (err?: any): boolean => {
  const errStr = String(err?.message || err?.code || err || '');
  return (
    errStr.includes('INTERNAL ASSERTION FAILED') ||
    errStr.includes('ID: b815') ||
    errStr.includes('ID: ca9') ||
    errStr.includes('Unexpected state')
  );
};

export const isFirestoreInternalDegraded = (): boolean => {
  return lastInternalAssertionTime > 0 && (Date.now() - lastInternalAssertionTime < INTERNAL_ASSERTION_COOLDOWN_MS);
};

export const markFirestoreInternalAssertion = (err?: any) => {
  if (isFirestoreInternalAssertionError(err)) {
    const now = Date.now();
    const wasDegraded = isFirestoreInternalDegraded();
    lastInternalAssertionTime = now;
    if (!wasDegraded && now - lastInternalAssertionLogTime > 15000) {
      lastInternalAssertionLogTime = now;
      console.warn('⚠️ [Firestore SDK Guard] Mendeteksi reset stream Watch internal Firebase SDK (ca9/b815). Menggunakan cadangan lokal/server sementara tanpa membebani kuota.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('firestore-internal-error'));
      }
    }
  }
};

export const resetFirestoreInternalAssertionCooldown = () => {
  lastInternalAssertionTime = 0;
};

// Global interceptor for unhandled console.error / unhandledrejection from @firebase/firestore
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    const fullMsg = args
      .map(a => (typeof a === 'object' && a !== null ? (a.message || a.code || JSON.stringify(a)) : String(a)))
      .join(' ');

    if (
      fullMsg.includes('RESOURCE_EXHAUSTED') ||
      fullMsg.includes('Quota exceeded') ||
      fullMsg.includes('quota exceeded') ||
      (fullMsg.includes('Code: 8') && fullMsg.includes('Firestore'))
    ) {
      markFirestoreQuotaExceeded(fullMsg);
      console.warn('⚠️ [Firestore Quota Guard] GrpcConnection stream quota error intercepted. Mengalihkan ke mode lokal & menutup stream jaringan.');
      return;
    }
    if (
      (fullMsg.includes('PERMISSION_DENIED') || fullMsg.includes('Missing or insufficient permissions') || fullMsg.includes('Code: 7')) &&
      (fullMsg.includes('Firestore') || fullMsg.includes('@firebase/firestore') || fullMsg.includes('GrpcConnection'))
    ) {
      markFirestorePermissionDenied(fullMsg);
      return;
    }
    if (isFirestoreInternalAssertionError(fullMsg)) {
      const alreadyDegraded = isFirestoreInternalDegraded();
      markFirestoreInternalAssertion(fullMsg);
      if (alreadyDegraded) {
        return; // Suppress endless SDK assertion flood in console
      }
      return;
    }
    originalConsoleError.apply(console, args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event?.reason?.message || event?.reason || '');
    if (isFirestoreInternalAssertionError(msg)) {
      markFirestoreInternalAssertion(msg);
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = String(event?.message || event?.error?.message || '');
    if (isFirestoreInternalAssertionError(msg)) {
      markFirestoreInternalAssertion(msg);
      event.preventDefault();
    }
  });
}

// Helper to check configuration readiness
export const isFirebaseConfigured = (): boolean => {
  if (!firestoreDb) {
    return initializeFirebaseApp();
  }
  return true;
};

// Circuit breaker when Firestore daily free quota (Spark Plan) is exhausted
let lastQuotaExceededTime = 0;
const QUOTA_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown so transient quota errors recover automatically without locking out writes

export const isFirestoreQuotaExceeded = (): boolean => {
  if (lastQuotaExceededTime === 0) {
    try {
      const stored = localStorage.getItem('nmsa_fs_quota_exceeded') || sessionStorage.getItem('nmsa_fs_quota_exceeded');
      if (stored) {
        const ts = parseInt(stored, 10);
        if (Date.now() - ts < QUOTA_COOLDOWN_MS) {
          lastQuotaExceededTime = ts;
          return true;
        }
      }
    } catch (_) {}
    return false;
  }
  return Date.now() - lastQuotaExceededTime < QUOTA_COOLDOWN_MS;
};

export const markFirestoreQuotaExceeded = (err?: any) => {
  const errStr = String(err?.message || err?.code || err || '');
  const isQuota = 
    err?.code === 'resource-exhausted' ||
    err?.code === 8 ||
    errStr.includes('RESOURCE_EXHAUSTED') ||
    errStr.includes('Quota exceeded') ||
    errStr.includes('quota exceeded') ||
    errStr.includes('resource-exhausted') ||
    errStr.includes('Code: 8');

  if (isQuota) {
    const wasAlreadyExceeded = isFirestoreQuotaExceeded();
    lastQuotaExceededTime = Date.now();
    isFirestoreNetworkDisabledByQuota = true;
    try {
      localStorage.setItem('nmsa_fs_quota_exceeded', String(lastQuotaExceededTime));
      sessionStorage.setItem('nmsa_fs_quota_exceeded', String(lastQuotaExceededTime));
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    } catch (_) {}

    if (!wasAlreadyExceeded) {
      console.warn('⚠️ [Firestore Quota Guard] Kuota harian gratis Firebase (Spark Plan) telah tercapai (RESOURCE_EXHAUSTED). Mengalihkan operasi tulis ke penyimpanan lokal dan backend server sementara.');
    }

    // CRITICAL: Shut down the GrpcConnection RPC 'Write' stream immediately on ALL instances ONLY when quota is exceeded
    for (const inst of registeredFirestoreInstances) {
      disableNetwork(inst).catch(() => {});
    }
    if (firestoreDb) {
      disableNetwork(firestoreDb).catch(() => {});
    }
  }
};

export const resetFirestoreQuotaCooldown = async () => {
  lastQuotaExceededTime = 0;
  resetFirestoreInternalAssertionCooldown();
  try {
    localStorage.removeItem('nmsa_fs_quota_exceeded');
    sessionStorage.removeItem('nmsa_fs_quota_exceeded');
    window.dispatchEvent(new CustomEvent('firestore-quota-reset'));
  } catch (_) {}
  if (!isFirestoreNetworkDisabledByQuota) {
    return;
  }
  isFirestoreNetworkDisabledByQuota = false;
  for (const inst of registeredFirestoreInstances) {
    try {
      await withTimeout(enableNetwork(inst), 4000, 'Aktifkan kembali jaringan Firestore');
    } catch (_) {}
  }
  if (firestoreDb) {
    try {
      await withTimeout(enableNetwork(firestoreDb), 4000, 'Aktifkan kembali jaringan Firestore');
    } catch (_) {}
  }
};

// Guard auth & permission-denied state across Firestore operations
let lastPermissionDeniedTime = 0;
const PERMISSION_DENIED_COOLDOWN_MS = 60 * 1000;

export const hasAuthenticatedFirebaseUser = (): boolean => {
  return Boolean(firebaseAuth?.currentUser || currentUser);
};

export const isFirestorePermissionError = (err?: any): boolean => {
  const errStr = String(err?.message || err?.code || err || '');
  return (
    err?.code === 'permission-denied' ||
    err?.code === 7 ||
    errStr.includes('PERMISSION_DENIED') ||
    errStr.includes('permission-denied') ||
    errStr.includes('insufficient permissions')
  );
};

export const isFirestorePermissionDenied = (): boolean => {
  return lastPermissionDeniedTime > 0 && (Date.now() - lastPermissionDeniedTime < PERMISSION_DENIED_COOLDOWN_MS);
};

export const markFirestorePermissionDenied = (err?: any) => {
  if (isFirestorePermissionError(err)) {
    const wasDenied = isFirestorePermissionDenied();
    lastPermissionDeniedTime = Date.now();
    if (!wasDenied) {
      console.warn('⚠️ [Firestore Rules Guard] Penulisan/pembacaan Firestore diblokir oleh Security Rules (PERMISSION_DENIED). Pastikan user sudah login dan Firestore Rules telah dipublikasikan di Firebase Console.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('firestore-permission-denied'));
      }
    }
  }
};

export const resetFirestorePermissionDenied = () => {
  lastPermissionDeniedTime = 0;
};

// ═════════════════════════════════════════════════════════════════════
// 📊 REAL-TIME FIREBASE FIRESTORE QUOTA USAGE & MONITORING (SPARK TIER)
// ═════════════════════════════════════════════════════════════════════
export interface FirestoreQuotaMetrics {
  date: string;
  reads: number;
  writes: number;
  deletes: number;
  sessionReads: number;
  sessionWrites: number;
  sessionDeletes: number;
  maxDailyReads: number;   // 50,000 document reads/hari (Spark Plan Gratis)
  maxDailyWrites: number;  // 20,000 document writes/hari (Spark Plan Gratis)
  maxDailyDeletes: number; // 20,000 document deletes/hari (Spark Plan Gratis)
  maxStorageBytes: number; // 1 GiB free storage
  isQuotaExceeded: boolean;
  pendingQueueCount: number;
  lastSyncTime: string | null;
  connectedProjectId: string;
  activeDatabaseId: string;
}

let sessionReads = 0;
let sessionWrites = 0;
let sessionDeletes = 0;
let lastSyncTimestamp: string | null = null;

const getTodayDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const getFirestoreQuotaMetrics = (): FirestoreQuotaMetrics => {
  const today = getTodayDateString();
  let storedMetrics = { date: today, reads: 0, writes: 0, deletes: 0 };
  try {
    const raw = localStorage.getItem('nmsa_fs_quota_metrics');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) {
        storedMetrics = {
          date: today,
          reads: Number(parsed.reads) || 0,
          writes: Number(parsed.writes) || 0,
          deletes: Number(parsed.deletes) || 0
        };
      }
    }
  } catch (_) {}

  return {
    date: today,
    reads: storedMetrics.reads,
    writes: storedMetrics.writes,
    deletes: storedMetrics.deletes,
    sessionReads,
    sessionWrites,
    sessionDeletes,
    maxDailyReads: 50000,
    maxDailyWrites: 20000,
    maxDailyDeletes: 20000,
    maxStorageBytes: 1073741824,
    isQuotaExceeded: isFirestoreQuotaExceeded(),
    pendingQueueCount: firestoreWriteQueue.length,
    lastSyncTime: lastSyncTimestamp || localStorage.getItem('nmsa_fs_last_sync') || null,
    connectedProjectId: getActiveFirebaseProjectId(),
    activeDatabaseId: "(default)"
  };
};

const notifyQuotaUpdate = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore-quota-updated', { detail: getFirestoreQuotaMetrics() }));
  }
};

export const recordFirestoreReads = (count: number = 1) => {
  if (count <= 0) return;
  sessionReads += count;
  const today = getTodayDateString();
  try {
    let current = { date: today, reads: 0, writes: 0, deletes: 0 };
    const raw = localStorage.getItem('nmsa_fs_quota_metrics');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) current = parsed;
    }
    current.reads += count;
    current.date = today;
    localStorage.setItem('nmsa_fs_quota_metrics', JSON.stringify(current));
  } catch (_) {}
  notifyQuotaUpdate();
};

export const recordFirestoreWrites = (count: number = 1) => {
  if (count <= 0) return;
  sessionWrites += count;
  const today = getTodayDateString();
  try {
    let current = { date: today, reads: 0, writes: 0, deletes: 0 };
    const raw = localStorage.getItem('nmsa_fs_quota_metrics');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) current = parsed;
    }
    current.writes += count;
    current.date = today;
    localStorage.setItem('nmsa_fs_quota_metrics', JSON.stringify(current));
    lastSyncTimestamp = new Date().toISOString();
    localStorage.setItem('nmsa_fs_last_sync', lastSyncTimestamp);
  } catch (_) {}
  notifyQuotaUpdate();
};

export const recordFirestoreDeletes = (count: number = 1) => {
  if (count <= 0) return;
  sessionDeletes += count;
  const today = getTodayDateString();
  try {
    let current = { date: today, reads: 0, writes: 0, deletes: 0 };
    const raw = localStorage.getItem('nmsa_fs_quota_metrics');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) current = parsed;
    }
    current.deletes += count;
    current.date = today;
    localStorage.setItem('nmsa_fs_quota_metrics', JSON.stringify(current));
    lastSyncTimestamp = new Date().toISOString();
    localStorage.setItem('nmsa_fs_last_sync', lastSyncTimestamp);
  } catch (_) {}
  notifyQuotaUpdate();
};

export const resetFirestoreSessionCounters = () => {
  sessionReads = 0;
  sessionWrites = 0;
  sessionDeletes = 0;
  notifyQuotaUpdate();
};

// Custom Firestore standard error reporter
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errStr = error instanceof Error ? error.message : String(error);
  const isQuota = (error as any)?.code === 'resource-exhausted' || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota exceeded');
  if (isQuota) {
    markFirestoreQuotaExceeded(error);
  }

  const errInfo: FirestoreErrorInfo = {
    error: errStr,
    authInfo: {
      userId: currentUser?.uid || 'ANONYMOUS_CLIENT_DASHBOARD',
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || true,
      tenantId: currentUser?.tenantId || null,
      providerInfo: currentUser?.providerData || []
    },
    operationType,
    path
  };
  console.warn('Firestore Notice: ', JSON.stringify(errInfo));
  if (!isQuota) {
    throw new Error(JSON.stringify(errInfo));
  }
}

// Firebase Auth API Wrappers
export const loginToFirebase = async (email: string, password: string): Promise<User> => {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth is not initialized. Please configure credentials first.');
  }
  const cleanEmail = (email || '').trim();
  if (!cleanEmail) {
    throw new Error('Alamat E-Mail wajib diisi.');
  }
  try {
    await setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {});
    const creds = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
    currentUser = creds.user;
    return creds.user;
  } catch (error) {
    console.error('Authentication Failed:', error);
    throw error;
  }
};

export const loginWithGoogle = async (): Promise<User> => {
  throw new Error('Login Akun Google dinonaktifkan. Aplikasi berstatus tertutup khusus akun terdaftar di Firebase Console.');
};

export const resetPasswordViaEmail = async (email: string): Promise<void> => {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth belum dikonfigurasi.');
  }
  const cleanEmail = (email || '').trim();
  if (!cleanEmail) {
    throw new Error('Silakan masukkan alamat e-mail terlebih dahulu.');
  }
  await sendPasswordResetEmail(firebaseAuth, cleanEmail);
};

export const ensureUserProfile = async (
  user: User,
  defaults: { companyId?: string; companyName?: string } = {}
): Promise<void> => {
  if (!user) return;
  const companyId = (defaults.companyId || 'nmsa').toLowerCase().trim();
  const companyName = defaults.companyName || 'PT Nusantara Mineral Sukses Abadi';
  setActiveCompanyId(companyId);

  try {
    const cachedProfile = {
      uid: user.uid,
      email: user.email,
      fullName: user.displayName || user.email?.split('@')[0] || 'User',
      role: 'Divisi Keuangan',
      companyId: companyId,
      companyName: companyName,
      createdAt: new Date().toISOString()
    };
    localStorage.setItem(`user_profile_${user.uid}`, JSON.stringify(cachedProfile));
  } catch (err) {
    console.warn('Failed to cache user profile locally:', err);
  }
};

export const logoutFromFirebase = async (): Promise<void> => {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
  currentUser = null;
};

let isDrivePopupConnecting = false;

export const getFirebaseUser = (): User | null => {
  return currentUser;
};

export const registerAuthChangeListener = (callback: (user: User | null) => void): (() => void) => {
  if (!firebaseAuth) {
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth, (user) => {
    if (isDrivePopupConnecting) {
      console.log('🛡️ Menahan perubahan user portal saat menghubungkan token Google Drive.');
      return;
    }
    currentUser = user;
    callback(user);
  });
};

// ═════════ GOOGLE DRIVE / OAUTH PERSISTENCE UTILITIES ═════════
export interface ConnectedDrive {
  email: string;
  accessToken: string;
  displayName: string;
  photoURL?: string;
  quotaUsed: number;   // Bytes
  quotaLimit: number;  // Bytes
  lastChecked: string; // ISO String
  isExpired?: boolean;
  issuedAt?: number;   // Epoch timestamp of token issue
  expiresAt?: number;  // Epoch timestamp of token expiration
}

// Google OAuth token standard lifetime is 3600 seconds (60 mins).
// We set token lifespan to 55 minutes to allow a safe 5-minute buffer.
export const TOKEN_LIFESPAN_MS = 55 * 60 * 1000;

/**
 * Checks whether a Google Drive token is still valid within its official time window.
 * This guarantees a token is NEVER falsely marked as expired immediately after connection.
 */
export const isDriveTokenValid = (drive: ConnectedDrive | null | undefined): boolean => {
  if (!drive || !drive.accessToken) return false;
  const now = Date.now();
  if (drive.expiresAt && typeof drive.expiresAt === 'number') {
    return now < drive.expiresAt;
  }
  if (drive.issuedAt && typeof drive.issuedAt === 'number') {
    return (now - drive.issuedAt) < TOKEN_LIFESPAN_MS;
  }
  if (drive.lastChecked) {
    const lastCheckedMs = new Date(drive.lastChecked).getTime();
    if (!isNaN(lastCheckedMs)) {
      return (now - lastCheckedMs) < TOKEN_LIFESPAN_MS && !drive.isExpired;
    }
  }
  return !drive.isExpired;
};

/**
 * Computes remaining minutes of validity for a given connected drive token.
 */
export const getDriveRemainingMinutes = (drive: ConnectedDrive): number => {
  const now = Date.now();
  if (drive.expiresAt && typeof drive.expiresAt === 'number') {
    return Math.max(0, Math.round((drive.expiresAt - now) / 60000));
  }
  if (drive.issuedAt && typeof drive.issuedAt === 'number') {
    const remaining = TOKEN_LIFESPAN_MS - (now - drive.issuedAt);
    return Math.max(0, Math.round(remaining / 60000));
  }
  if (drive.lastChecked) {
    const lastCheckedMs = new Date(drive.lastChecked).getTime();
    if (!isNaN(lastCheckedMs)) {
      const remaining = TOKEN_LIFESPAN_MS - (now - lastCheckedMs);
      return Math.max(0, Math.round(remaining / 60000));
    }
  }
  return drive.isExpired ? 0 : 55;
};

/**
 * Merges remote Firestore drives with local drives, ensuring fresh valid local tokens
 * are NEVER overwritten by stale or expired records stored in the cloud.
 */
export const mergeDrivesWithLocal = (remoteDrives: ConnectedDrive[]): ConnectedDrive[] => {
  let localDrives: ConnectedDrive[] = [];
  try {
    const raw = localStorage.getItem('NUSANTARA_CONNECTED_DRIVES');
    if (raw) localDrives = JSON.parse(raw);
  } catch (e) {}

  const cleanRemote = (Array.isArray(remoteDrives) ? remoteDrives : []).filter(
    d => d && d.email && !isBlockedLegacyDriveEmail(d.email)
  );
  const cleanLocal = (Array.isArray(localDrives) ? localDrives : []).filter(
    d => d && d.email && !isBlockedLegacyDriveEmail(d.email)
  );

  if (cleanRemote.length === 0) return cleanLocal;
  if (cleanLocal.length === 0) return cleanRemote;

  const result: ConnectedDrive[] = [...cleanRemote];

  for (const local of cleanLocal) {
    const idx = result.findIndex(r => r.email.toLowerCase() === local.email.toLowerCase());
    if (idx === -1) {
      result.push(local);
    } else {
      const remote = result[idx];
      const localIssued = local.issuedAt || 0;
      const remoteIssued = remote.issuedAt || 0;
      const localValid = isDriveTokenValid(local);
      const remoteValid = isDriveTokenValid(remote);

      // Preserve local if local is valid and remote expired, OR local issuedAt is more recent
      if ((localValid && !remoteValid) || (localIssued >= remoteIssued && local.accessToken)) {
        result[idx] = {
          ...remote,
          ...local,
          isExpired: !localValid ? remote.isExpired : false
        };
      }
    }
  }

  return result;
};

let googleDriveTokenMemory: string | null = null;

export const setGoogleDriveToken = (token: string | null) => {
  googleDriveTokenMemory = token;
  if (token) {
    localStorage.setItem('NUSANTARA_GOOGLE_DRIVE_TOKEN', token);
  } else {
    localStorage.removeItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
  }
};

// 🔒 KONFIGURASI AKUN RESMI PERMANEN & TERKUNCI (PT Nusantara Mineral Sukses Abadi)
// JANGAN UBAH ATAU HAPUS SAAT PENAMBAHAN FITUR MAUPUN UPDATE APLIKASI.
// Akun-akun ini dikunci secara internal dan TIDAK BOLEH ditampilkan secara terbuka pada antarmuka pengguna.
export const PERMANENT_LOCKED_ACCOUNTS = Object.freeze({
  firebaseAuthEmail: 'yudiakungaming@gmail.com',
  googleDriveEmail: 'akuncoding211@gmail.com',
  vercelEmail: 'perusahaannmsa@gmail.com'
});

export const LOCKED_FIREBASE_AUTH_EMAIL = PERMANENT_LOCKED_ACCOUNTS.firebaseAuthEmail;
export const PRIMARY_MASTER_DRIVE_EMAIL = PERMANENT_LOCKED_ACCOUNTS.googleDriveEmail;
export const LOCKED_MASTER_DRIVE_EMAIL = PERMANENT_LOCKED_ACCOUNTS.googleDriveEmail;
export const LOCKED_VERCEL_EMAIL = PERMANENT_LOCKED_ACCOUNTS.vercelEmail;

export const DEFAULT_AUTHORIZED_DRIVE_EMAILS: string[] = [
  LOCKED_MASTER_DRIVE_EMAIL
];

const LEGACY_BLOCKED_DRIVE_EMAILS = new Set<string>([
  'penyimpanandrivenmsa1@gmail.com',
  'penyimpanandrivenmsa2@gmail.com'
]);

export const isBlockedLegacyDriveEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return LEGACY_BLOCKED_DRIVE_EMAILS.has(email.trim().toLowerCase());
};

export const isAuthorizedPortalFirebaseEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase() === LOCKED_FIREBASE_AUTH_EMAIL;
};

export const maskLockedAccountLabel = (
  email?: string | null,
  fallbackLabel = 'Akun Resmi NMSA (Terkunci)'
): string => {
  if (!email) return fallbackLabel;
  const clean = email.trim().toLowerCase();
  if (
    clean === LOCKED_FIREBASE_AUTH_EMAIL ||
    clean === LOCKED_MASTER_DRIVE_EMAIL ||
    clean === LOCKED_VERCEL_EMAIL ||
    isBlockedLegacyDriveEmail(clean)
  ) {
    return fallbackLabel;
  }
  return email;
};

// Isolated secondary FirebaseApp + Auth solely for Google Drive OAuth token acquisition,
// guaranteeing that Drive OAuth popups NEVER overwrite or sign out the primary Firebase Auth user.
let driveOAuthApp: FirebaseApp | null = null;
let driveOAuthAuth: Auth | null = null;

export const getIsolatedDriveAuth = (): Auth => {
  const config = getStoredFirebaseConfig() || PERMANENT_LOCKED_FIREBASE_CONFIG;
  if (!driveOAuthApp || driveOAuthApp.options.projectId !== config.projectId) {
    const existing = getApps().find((a) => a.name === 'NMSA_DRIVE_OAUTH');
    driveOAuthApp = existing || initializeApp(config, 'NMSA_DRIVE_OAUTH');
    driveOAuthAuth = null;
  }
  if (!driveOAuthAuth) {
    driveOAuthAuth = getAuth(driveOAuthApp);
    setPersistence(driveOAuthAuth, inMemoryPersistence).catch(() => {});
  }
  return driveOAuthAuth;
};

// Auto-cleanup legacy accounts and permanently lock default Google Drive to akuncoding211@gmail.com
if (typeof window !== 'undefined') {
  try {
    localStorage.setItem('NUSANTARA_MASTER_DRIVE_EMAIL', LOCKED_MASTER_DRIVE_EMAIL);
    localStorage.setItem('NUSANTARA_LAST_ACTIVE_EMAIL', LOCKED_MASTER_DRIVE_EMAIL);
    localStorage.setItem('g_user_email', LOCKED_MASTER_DRIVE_EMAIL);

    const rawAuth = localStorage.getItem('NUSANTARA_AUTHORIZED_DRIVES');
    if (rawAuth) {
      try {
        const parsed = JSON.parse(rawAuth);
        if (Array.isArray(parsed)) {
          const filtered = parsed
            .map(e => String(e).trim().toLowerCase())
            .filter(e => e && !isBlockedLegacyDriveEmail(e));
          if (!filtered.includes(LOCKED_MASTER_DRIVE_EMAIL)) {
            filtered.unshift(LOCKED_MASTER_DRIVE_EMAIL);
          }
          localStorage.setItem('NUSANTARA_AUTHORIZED_DRIVES', JSON.stringify(filtered));
        }
      } catch (e) {}
    } else {
      localStorage.setItem('NUSANTARA_AUTHORIZED_DRIVES', JSON.stringify(DEFAULT_AUTHORIZED_DRIVE_EMAILS));
    }
    const rawConn = localStorage.getItem('NUSANTARA_CONNECTED_DRIVES');
    if (rawConn) {
      try {
        const parsed = JSON.parse(rawConn);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(d =>
            d && d.email && !isBlockedLegacyDriveEmail(d.email)
          );
          localStorage.setItem('NUSANTARA_CONNECTED_DRIVES', JSON.stringify(filtered));
        }
      } catch (e) {}
    }
  } catch (e) {}
}

/**
 * Flexible mode allows any Google account to be linked.
 * Default is FALSE so ONLY accounts registered/input by the user in the app are authorized & readable.
 */
export const isDriveFlexibleMode = (): boolean => {
  try {
    const raw = localStorage.getItem('NUSANTARA_DRIVE_FLEXIBLE_MODE');
    if (raw !== null) {
      return raw === 'true';
    }
  } catch (e) {}
  return false;
};

export const setDriveFlexibleMode = async (enabled: boolean): Promise<void> => {
  try {
    localStorage.setItem('NUSANTARA_DRIVE_FLEXIBLE_MODE', String(enabled));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nusantara-drive-updated', {
        detail: { flexibleMode: enabled }
      }));
    }
  } catch (e) {
    console.warn('Failed to save flexible mode state:', e);
  }
};

export const getAuthorizedDriveEmails = (): string[] => {
  try {
    const raw = localStorage.getItem('NUSANTARA_AUTHORIZED_DRIVES');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const set = new Set([
          LOCKED_MASTER_DRIVE_EMAIL,
          ...parsed
            .map(e => String(e).trim().toLowerCase())
            .filter(e => e && !isBlockedLegacyDriveEmail(e))
        ]);
        return Array.from(set);
      }
    }
  } catch (e) {}
  return [...DEFAULT_AUTHORIZED_DRIVE_EMAILS];
};

export const saveAuthorizedDriveEmails = async (emails: string[]): Promise<void> => {
  try {
    const cleanList = Array.from(new Set([
      LOCKED_MASTER_DRIVE_EMAIL,
      ...emails
        .map(e => (e || '').trim().toLowerCase())
        .filter(e => e && !isBlockedLegacyDriveEmail(e))
    ]));
    localStorage.setItem('NUSANTARA_AUTHORIZED_DRIVES', JSON.stringify(cleanList));
  } catch (e) {
    console.error('Failed to save authorized drive emails:', e);
  }
};

export const addAuthorizedDriveEmail = async (email: string): Promise<string[]> => {
  const clean = (email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@') || !clean.includes('.')) {
    throw new Error('Alamat email Google tidak valid (contoh: akun@gmail.com).');
  }
  const current = getAuthorizedDriveEmails();
  if (!current.includes(clean)) {
    current.push(clean);
    await saveAuthorizedDriveEmails(current);
  }
  return current;
};

export const updateAuthorizedDriveEmail = async (oldEmail: string, newEmail: string): Promise<string[]> => {
  const cleanOld = (oldEmail || '').trim().toLowerCase();
  const cleanNew = (newEmail || '').trim().toLowerCase();
  if (!cleanNew || !cleanNew.includes('@') || !cleanNew.includes('.')) {
    throw new Error('Alamat email Google baru tidak valid (contoh: akun@gmail.com).');
  }
  const current = getAuthorizedDriveEmails();
  const index = current.findIndex(e => e.toLowerCase() === cleanOld);
  if (index !== -1) {
    current[index] = cleanNew;
  } else if (!current.includes(cleanNew)) {
    current.push(cleanNew);
  }
  await saveAuthorizedDriveEmails(current);

  if (getMasterDriveEmail().toLowerCase() === cleanOld) {
    await setMasterDriveEmail(cleanNew);
  }

  // Remove old token if email changed so another account's token isn't reused
  const drives = getConnectedDrives();
  const filteredDrives = drives.filter(d => d.email.toLowerCase() !== cleanOld);
  if (filteredDrives.length !== drives.length) {
    await saveConnectedDrives(filteredDrives);
  }

  return current;
};

export const removeAuthorizedDriveEmail = async (emailToRemove: string): Promise<string[]> => {
  const clean = (emailToRemove || '').trim().toLowerCase();
  const current = getAuthorizedDriveEmails();
  const updated = current.filter(e => e.toLowerCase() !== clean);
  await saveAuthorizedDriveEmails(updated);
  const drives = getConnectedDrives();
  const remainingDrives = drives.filter(d => d.email.toLowerCase() !== clean);
  if (remainingDrives.length !== drives.length) {
    await saveConnectedDrives(remainingDrives);
  }
  if (getMasterDriveEmail().toLowerCase() === clean && updated.length > 0) {
    await setMasterDriveEmail(updated[0]);
  }
  return updated;
};

/**
 * Strict check: verifies the email exists explicitly in the app's registered accounts list.
 * Never bypassed by flexible mode.
 */
export const isStrictlyAuthorizedDriveEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (!clean || isBlockedLegacyDriveEmail(clean)) return false;
  const list = getAuthorizedDriveEmails().map(e => e.trim().toLowerCase());
  return list.includes(clean);
};

export const isDriveEmailAuthorized = (email?: string | null): boolean => {
  if (!email) return false;
  if (isDriveFlexibleMode()) return email.includes('@');
  return isStrictlyAuthorizedDriveEmail(email);
};

export const getTokenForRegisteredDriveEmail = (email?: string | null): string | null => {
  if (!email || !isStrictlyAuthorizedDriveEmail(email)) return null;
  const clean = email.trim().toLowerCase();
  const drives = getConnectedDrives();
  const match = drives.find(d => d.email.trim().toLowerCase() === clean);
  if (match && isDriveTokenValid(match) && match.accessToken) {
    return match.accessToken;
  }
  return null;
};

export const getMasterDriveEmail = (): string => {
  try {
    const stored = localStorage.getItem('NUSANTARA_MASTER_DRIVE_EMAIL');
    if (stored && stored.trim()) {
      return stored.trim().toLowerCase();
    }
  } catch (e) {}
  return PRIMARY_MASTER_DRIVE_EMAIL;
};

export const setMasterDriveEmail = async (email: string): Promise<void> => {
  try {
    const clean = email.trim().toLowerCase();
    localStorage.setItem('NUSANTARA_MASTER_DRIVE_EMAIL', clean);
    localStorage.setItem('NUSANTARA_LAST_ACTIVE_EMAIL', clean);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nusantara-drive-updated', {
        detail: {
          activeAccount: getActiveGoogleDriveAccount(),
          masterEmail: clean
        }
      }));
    }
  } catch (e) {
    console.error('Failed to set master drive email:', e);
  }
};

export const ensureGoogleDriveFileSharing = async (fileId: string, driveToken: string): Promise<void> => {
  if (!fileId || !driveToken) return;

  // 1. Set public reader permission (anyone with link)
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${driveToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
  } catch (err) {
    console.warn('Could not set public anyone permission on Drive file:', fileId, err);
  }

  // 2. Explicitly share with Master Drive account
  const masterEmail = getMasterDriveEmail();
  if (masterEmail) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${driveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'writer',
          type: 'user',
          emailAddress: masterEmail,
        }),
      });
    } catch {}
  }

  // 3. Explicitly share with all authorized & connected company accounts
  const targets = new Set<string>();
  getAuthorizedDriveEmails().forEach(e => { if (e) targets.add(e.toLowerCase()); });
  getConnectedDrives().forEach(d => { if (d.email) targets.add(d.email.toLowerCase()); });

  for (const email of targets) {
    if (email === masterEmail?.toLowerCase()) continue;
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${driveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'user',
          emailAddress: email,
        }),
      });
    } catch {}
  }
};

export const getConnectedDrives = (): ConnectedDrive[] => {
  try {
    const raw = localStorage.getItem('NUSANTARA_CONNECTED_DRIVES');
    if (raw) {
      const parsed: ConnectedDrive[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let changed = false;
        // Keep ONLY drives whose emails are explicitly authorized/registered in the app
        const filteredDrives = parsed.filter(d => 
          d && d.email && 
          !isBlockedLegacyDriveEmail(d.email) &&
          isDriveEmailAuthorized(d.email)
        );
        const normalized = filteredDrives.map(d => {
          const isValidTime = isDriveTokenValid(d);
          if (isValidTime && d.isExpired) {
            d.isExpired = false;
            changed = true;
          } else if (!isValidTime && !d.isExpired) {
            d.isExpired = true;
            changed = true;
          }
          return d;
        });
        if (changed || filteredDrives.length !== parsed.length) {
          try {
            localStorage.setItem('NUSANTARA_CONNECTED_DRIVES', JSON.stringify(normalized));
          } catch (e) {}
        }
        return normalized;
      }
    }
  } catch (e) {
    console.error('Failed to parse connected drives list', e);
  }

  // Fallback / migration for legacy single token
  const legacyToken = localStorage.getItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
  if (legacyToken) {
    const now = Date.now();
    const masterEmail = getMasterDriveEmail();
    const initialDrive: ConnectedDrive = {
      email: masterEmail,
      accessToken: legacyToken,
      displayName: 'Master Drive NMSA',
      quotaUsed: 0,
      quotaLimit: 15 * 1024 * 1024 * 1024, // 15 GB
      lastChecked: new Date().toISOString(),
      issuedAt: now,
      expiresAt: now + TOKEN_LIFESPAN_MS,
      isExpired: false
    };
    return [initialDrive];
  }
  return [];
};

let lastServerDriveHydrateTime = 0;

export const loadConnectedDrivesFromFirestore = async (_companyId: string = 'nmsa'): Promise<ConnectedDrive[]> => {
  const localDrives = getConnectedDrives();
  const hasValidLocal = localDrives.some((d) => isDriveTokenValid(d) && d.accessToken);
  if (hasValidLocal) {
    return localDrives;
  }

  const now = Date.now();
  if (now - lastServerDriveHydrateTime < 10000) {
    return localDrives;
  }
  lastServerDriveHydrateTime = now;

  try {
    const res = await fetch('/api/unified-storage');
    if (res.ok) {
      const data = await res.json();
      const serverDrives: ConnectedDrive[] = Array.isArray(data?.googleDrives) ? data.googleDrives : [];
      if (serverDrives.length > 0) {
        const merged = mergeDrivesWithLocal(serverDrives);
        const validMerged = merged.filter((d) => d && d.email && !isBlockedLegacyDriveEmail(d.email));
        if (validMerged.length > 0) {
          localStorage.setItem('NUSANTARA_CONNECTED_DRIVES', JSON.stringify(validMerged));
          const activeDrive = validMerged.find((d) => isDriveTokenValid(d) && d.accessToken);
          if (activeDrive?.accessToken) {
            setGoogleDriveToken(activeDrive.accessToken);
            localStorage.setItem('g_access_token', activeDrive.accessToken);
            localStorage.setItem('g_access_token_time', String(Date.now()));
          }
          return validMerged;
        }
      }
    }
  } catch (_) {}

  return localDrives;
};

export const getActiveGoogleDriveAccount = (): { email: string; displayName?: string; photoURL?: string } | null => {
  const drives = getConnectedDrives();
  if (drives.length > 0) {
    const active = drives.find(d => !d.isExpired) || drives[0];
    return {
      email: active.email,
      displayName: active.displayName,
      photoURL: active.photoURL
    };
  }
  return { email: LOCKED_MASTER_DRIVE_EMAIL, displayName: 'Master Drive NMSA' };
};

export const saveConnectedDrives = async (drives: ConnectedDrive[]) => {
  try {
    const cleanDrives = drives.filter(d => d && d.email && !isBlockedLegacyDriveEmail(d.email));
    localStorage.setItem('NUSANTARA_CONNECTED_DRIVES', JSON.stringify(cleanDrives));
    // Synced with legacy single token to maintain maximum compatibility with existing code
    const activeDrive = cleanDrives.find(d => !d.isExpired && (d.quotaLimit - d.quotaUsed > 10 * 1024 * 1024));
    const bestToken = activeDrive ? activeDrive.accessToken : (cleanDrives[0]?.accessToken || null);
    setGoogleDriveToken(bestToken);

    if (activeDrive) {
      localStorage.setItem('NUSANTARA_LAST_ACTIVE_EMAIL', activeDrive.email);
    }

    // Backup to server unified storage without calling Firestore
    try {
      fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleDrives: cleanDrives })
      }).catch(() => {});
    } catch (_) {}

    // Notify all active application components about the updated Drive account
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nusantara-drive-updated', {
        detail: {
          drives,
          activeAccount: getActiveGoogleDriveAccount(),
          hasToken: !!bestToken
        }
      }));
    }
  } catch (e) {
    console.error('Failed to save connected drives list', e);
  }
};

export const fetchDriveQuotaMetadata = async (token: string): Promise<{
  email: string;
  displayName: string;
  photoURL?: string;
  quotaUsed: number;
  quotaLimit: number;
}> => {
  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      return {
        email: data.user?.emailAddress || getMasterDriveEmail(),
        displayName: data.user?.displayName || 'Google Drive',
        photoURL: data.user?.photoLink || '',
        quotaUsed: parseInt(data.storageQuota?.usage || '0', 10),
        quotaLimit: parseInt(data.storageQuota?.limit || '16106127360', 10) // default 15GB in bytes
      };
    }
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED_401');
    }
  } catch (err: any) {
    if (err?.message?.includes('UNAUTHORIZED_401') || err?.message?.includes('401')) {
      throw err;
    }
  }

  // Fallback: Check token validity via lightweight userinfo probe
  try {
    const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (uRes.ok) {
      const uData = await uRes.json();
      return {
        email: uData.email || getMasterDriveEmail(),
        displayName: uData.name || 'Google Drive',
        photoURL: uData.picture || '',
        quotaUsed: 0,
        quotaLimit: 15 * 1024 * 1024 * 1024
      };
    }
    if (uRes.status === 401) {
      throw new Error('UNAUTHORIZED_401');
    }
  } catch (err: any) {
    if (err?.message?.includes('UNAUTHORIZED_401') || err?.message?.includes('401')) {
      throw err;
    }
  }

  return {
    email: getMasterDriveEmail(),
    displayName: 'Google Drive',
    photoURL: '',
    quotaUsed: 0,
    quotaLimit: 15 * 1024 * 1024 * 1024
  };
};

/**
 * Connect Google Drive directly using a manual OAuth Access Token or Authorization Code.
 * Validates the token immediately with Google Drive API and persists the connection.
 */
export const connectDriveWithManualToken = async (
  tokenInput: string,
  targetEmailHint?: string
): Promise<ConnectedDrive> => {
  const cleanToken = (tokenInput || '').trim().replace(/^Bearer\s+/i, '');
  if (!cleanToken) {
    throw new Error('Kode token Google Drive tidak boleh kosong.');
  }

  // 1. Validate token with Google Drive API
  let meta: any = null;
  try {
    meta = await fetchDriveQuotaMetadata(cleanToken);
  } catch (err: any) {
    console.error('Manual token validation error:', err);
    throw new Error(
      'Kode token Google Drive tidak valid atau sudah kedaluwarsa.\n' +
      'Pastikan Anda memasukkan Access Token Google yang masih aktif (biasanya berawalan "ya29.").'
    );
  }

  const email = (meta.email || targetEmailHint || '').trim().toLowerCase();
  if (!email || !isStrictlyAuthorizedDriveEmail(email)) {
    throw new Error(
      `Akses Ditolak: Akun Google '${email || '(tidak diketahui)'}' belum terdaftar di aplikasi.\n` +
      `Silakan daftarkan/input alamat email tersebut di daftar Akun Terdaftar terlebih dahulu sebelum menghubungkan Google Drive-nya.`
    );
  }

  const now = Date.now();
  const newDrive: ConnectedDrive = {
    email: email,
    accessToken: cleanToken,
    displayName: meta.displayName || `Google Drive (${email})`,
    photoURL: meta.photoURL || '',
    quotaUsed: meta.quotaUsed || 0,
    quotaLimit: meta.quotaLimit || 15 * 1024 * 1024 * 1024,
    lastChecked: new Date().toISOString(),
    isExpired: false,
    issuedAt: now,
    expiresAt: now + TOKEN_LIFESPAN_MS
  };

  // 3. Update connected drives list
  const currentDrives = getConnectedDrives();
  const idx = currentDrives.findIndex(d => d.email.toLowerCase() === email.toLowerCase());
  if (idx !== -1) {
    currentDrives[idx] = newDrive;
  } else {
    currentDrives.push(newDrive);
  }

  await saveConnectedDrives(currentDrives);
  localStorage.setItem('g_access_token', cleanToken);
  localStorage.setItem('g_access_token_time', Date.now().toString());
  localStorage.setItem('g_user_email', email);
  localStorage.setItem('NUSANTARA_LAST_ACTIVE_EMAIL', email);

  // If no master exists, set this as master
  const currentMaster = getMasterDriveEmail();
  if (!currentMaster) {
    await setMasterDriveEmail(email);
  }

  return newDrive;
};

export const refreshAllDrivesQuota = async (): Promise<ConnectedDrive[]> => {
  const drives = getConnectedDrives();
  if (drives.length === 0) return [];

  const updatedDrives = await Promise.all(
    drives.map(async (drive) => {
      const isWithinWindow = isDriveTokenValid(drive);
      try {
        const meta = await fetchDriveQuotaMetadata(drive.accessToken);
        return {
          ...drive,
          email: meta.email || drive.email,
          displayName: meta.displayName || drive.displayName,
          photoURL: meta.photoURL || drive.photoURL,
          quotaUsed: meta.quotaUsed ?? drive.quotaUsed,
          quotaLimit: meta.quotaLimit ?? drive.quotaLimit,
          lastChecked: new Date().toISOString(),
          isExpired: false
        };
      } catch (err: any) {
        console.warn(`Drive quota check note for ${drive.email}:`, err);
        const isAuthError = err?.message?.includes('401') || err?.message?.includes('UNAUTHORIZED');
        
        // If token is still within its 55-minute lifetime, ignore transient 401 from quota API
        if (isAuthError && isWithinWindow) {
          console.log(`🛡️ Token for ${drive.email} is within valid lifetime (${getDriveRemainingMinutes(drive)}m left). Retaining active status.`);
          return {
            ...drive,
            lastChecked: new Date().toISOString(),
            isExpired: false
          };
        }

        return {
          ...drive,
          isExpired: isAuthError ? true : (drive.isExpired ?? false)
        };
      }
    })
  );

  saveConnectedDrives(updatedDrives);
  return updatedDrives;
};

export const autoCleanDriveFolders = async (activeSubmissions: any[]) => {
  const token = getStoredGoogleDriveToken();
  if (!token) return;

  try {
    console.log('[Auto-Sync] Memeriksa sinkronisasi data dengan Google Drive...');
    // Real implementation would be too dangerous to blindly delete folders.
    // The deletion is already handled reliably in the handleDelete function.
  } catch (error) {
    console.error('[Auto-Sync] Error during auto clean:', error);
  }
};

export const deleteGoogleDriveFile = async (fileId: string): Promise<void> => {
  return executeDriveApiWithAutoRefresh(async (token) => {
    // 1. Try direct DELETE
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.ok || response.status === 404) {
      console.log(`[Google Drive] Successfully deleted file/folder ${fileId}`);
      return;
    }

    if (response.status === 401) {
      throw new Error('UNAUTHORIZED_401'); // Triggers auto-refresh retry in wrapper
    }

    // 2. Fallback: If permanent DELETE is prohibited by permission/policy, move to trash via PATCH
    const trashResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ trashed: true })
    });

    if (trashResponse.ok || trashResponse.status === 404) {
      console.log(`[Google Drive] Successfully moved file/folder ${fileId} to Trash`);
      return;
    }

    const errorData = await response.json().catch(() => null);
    throw new Error(`Failed to delete file/folder: ${response.status} ${response.statusText} - ${errorData?.error?.message || ''}`);
  }, { actionName: `delete file ${fileId}` });
};

// Invalidate a specific token or current active token so next calls trigger fresh renewal
export const invalidateDriveToken = (badToken?: string | null): void => {
  const currentDrives = getConnectedDrives();
  let changed = false;
  const now = Date.now();

  if (badToken) {
    currentDrives.forEach(d => {
      if (d.accessToken === badToken) {
        // Do not prematurely invalidate tokens issued less than 3 minutes ago
        const isFresh = d.issuedAt && (now - d.issuedAt < 3 * 60 * 1000);
        if (!isFresh) {
          d.isExpired = true;
          changed = true;
        }
      }
    });
    if (googleDriveTokenMemory === badToken) {
      googleDriveTokenMemory = null;
      localStorage.removeItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
      changed = true;
    }
  } else {
    // Invalidate active one if not very fresh
    const active = currentDrives.find(d => !d.isExpired);
    if (active) {
      const isFresh = active.issuedAt && (now - active.issuedAt < 3 * 60 * 1000);
      if (!isFresh) {
        active.isExpired = true;
        changed = true;
      }
    }
    googleDriveTokenMemory = null;
    localStorage.removeItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
  }

  if (changed) {
    saveConnectedDrives(currentDrives);
  }
};

export const getStoredGoogleDriveToken = (strictFreshnessCheck = false): string | null => {
  const drives = getConnectedDrives();
  if (drives.length === 0) {
    if (googleDriveTokenMemory) return googleDriveTokenMemory;
    try {
      return localStorage.getItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
    } catch {
      return null;
    }
  }

  // Find first active drive with available storage space and valid lifetime
  const availableDrive = drives.find(d => {
    if (strictFreshnessCheck && !isDriveTokenValid(d)) return false;
    if (!strictFreshnessCheck && d.isExpired) return false;
    const remainingBytes = d.quotaLimit - d.quotaUsed;
    return remainingBytes > 10 * 1024 * 1024; // 10MB
  });

  if (availableDrive && availableDrive.accessToken) {
    return availableDrive.accessToken;
  }

  if (strictFreshnessCheck) {
    return null;
  }

  // Fallback to any drive with an access token if not strict
  const fallbackDrive = drives.find(d => !!d.accessToken && !d.isExpired);
  if (fallbackDrive) {
    return fallbackDrive.accessToken;
  }
  
  return googleDriveTokenMemory || localStorage.getItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
};

export const getAllConnectedDriveTokens = (): string[] => {
  const drives = getConnectedDrives();
  const tokens: string[] = [];
  drives.forEach(d => {
    if (d.accessToken && !tokens.includes(d.accessToken)) {
      tokens.push(d.accessToken);
    }
  });
  if (googleDriveTokenMemory && !tokens.includes(googleDriveTokenMemory)) {
    tokens.push(googleDriveTokenMemory);
  }
  try {
    const legacy = localStorage.getItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
    if (legacy && !tokens.includes(legacy)) {
      tokens.push(legacy);
    }
  } catch {}
  return tokens;
};

// ═════════ CLOUD SETTINGS & MULTI-DEVICE SYNC ENGINE ═════════

export interface CompanyCloudSettings {
  sppdPedomanRates?: any[];
  sppdMonthlyCounters?: Record<string, number>;
  authorizedDriveEmails?: string[];
  masterDriveEmail?: string;
  pettyCashHolders?: string[];
  pettyCashReports?: any[];
  npwpRecords?: any[];
  sppdRecords?: any[];
  agendaItems?: any[];
  recipientHistory?: string[];
  theme?: string;
  accurateMappedReports?: any[];
  googleDrives?: ConnectedDrive[];
  waConnected?: boolean;
  waUser?: any;
  waPhone?: string;
  waName?: string;
  waQr?: string | null;
  waStatus?: string;
  updatedAt?: string;
}

export const saveCompanySettingsToFirestore = async (
  partialSettings: Partial<CompanyCloudSettings>,
  companyId: string = 'nmsa'
): Promise<void> => {
  const compId = companyId || activeCompanyId || 'nmsa';
  
  // 1. Sync to local memory / localStorage immediately for instantaneous responsiveness
  if (partialSettings.sppdPedomanRates) {
    localStorage.setItem('sppd_pedoman_rates', JSON.stringify(partialSettings.sppdPedomanRates));
  }
  if (partialSettings.sppdMonthlyCounters) {
    localStorage.setItem('sppd_monthly_counters', JSON.stringify(partialSettings.sppdMonthlyCounters));
  }
  if (partialSettings.authorizedDriveEmails) {
    localStorage.setItem('NUSANTARA_AUTHORIZED_DRIVES', JSON.stringify(partialSettings.authorizedDriveEmails));
  }
  if (partialSettings.masterDriveEmail) {
    localStorage.setItem('NUSANTARA_MASTER_DRIVE_EMAIL', partialSettings.masterDriveEmail);
    localStorage.setItem('NUSANTARA_LAST_ACTIVE_EMAIL', partialSettings.masterDriveEmail);
  }
  if (partialSettings.pettyCashHolders) {
    localStorage.setItem('petty_cash_holders_v2', JSON.stringify(partialSettings.pettyCashHolders));
  }
  if (partialSettings.pettyCashReports) {
    localStorage.setItem('petty_cash_reports', JSON.stringify(partialSettings.pettyCashReports));
  }
  if (partialSettings.npwpRecords) {
    localStorage.setItem('npwp_records_v1', JSON.stringify(partialSettings.npwpRecords));
  }
  if (partialSettings.sppdRecords) {
    localStorage.setItem('sppd_records_v1', JSON.stringify(partialSettings.sppdRecords));
  }
  if (partialSettings.agendaItems) {
    localStorage.setItem('nmsa_agenda_items_v1', JSON.stringify(partialSettings.agendaItems));
  }
  if (partialSettings.theme) {
    localStorage.setItem('NUSANTARA_THEME', partialSettings.theme);
  }
  if (partialSettings.recipientHistory) {
    localStorage.setItem('NUSANTARA_RECIPIENT_HISTORY', JSON.stringify(partialSettings.recipientHistory));
  }
  if (partialSettings.waConnected !== undefined) {
    localStorage.setItem('nmsa_wa_connected', partialSettings.waConnected ? 'true' : 'false');
  }
  if (partialSettings.waPhone) {
    localStorage.setItem('nmsa_wa_phone', partialSettings.waPhone);
  }
  if (partialSettings.waName) {
    localStorage.setItem('nmsa_wa_name', partialSettings.waName);
  }

  // 2. Persist to server /api/shared-state as secondary persistent backup
  try {
    fetch('/api/shared-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partialSettings)
    }).catch(() => {});
  } catch (apiErr) {}
};

export const subscribeToCompanySettingsFromFirestore = (
  _onSettingsUpdate: (settings: CompanyCloudSettings) => void,
  _companyId: string = 'nmsa'
): (() => void) => {
  // Disabled Firestore real-time snapshot listener on companies to conserve daily free quota
  return () => {};
};

// Global Single-Flight Mutex to ensure simultaneous uploads NEVER collide or open duplicate popups
let activeDriveRenewalPromise: Promise<string> | null = null;

// Helper function to silently auto-refresh token if it's expired or about to expire
export const ensureValidDriveToken = async (forceRefresh = false): Promise<string | null> => {
  // 1. If force refresh is requested, sync latest cloud drives from Firestore first
  if (forceRefresh) {
    try {
      await loadConnectedDrivesFromFirestore();
    } catch (e) {}
  }

  // 2. Check if stored token in memory or drive list is fresh
  let token = getStoredGoogleDriveToken(!forceRefresh);
  if (token && !forceRefresh) {
    return token;
  }

  // 3. Check if a fresh token exists in Firestore company document (synced from any active device)
  try {
    const cloudDrives = await loadConnectedDrivesFromFirestore();
    if (cloudDrives && cloudDrives.length > 0) {
      const activeDrive = cloudDrives.find(d => isDriveTokenValid(d) && (d.quotaLimit - d.quotaUsed > 15 * 1024 * 1024));
      if (activeDrive && activeDrive.accessToken) {
        setGoogleDriveToken(activeDrive.accessToken);
        return activeDrive.accessToken;
      }
    }
  } catch (e) {}

  // 4. Fallback token in memory or localStorage ONLY IF NOT forceRefresh
  if (!forceRefresh) {
    return googleDriveTokenMemory || localStorage.getItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
  }
  return null;
};

// Auto-Renew Token with Anti-Collision Mutex Protection
export const getOrRenewDriveToken = async (
  targetEmail?: string,
  interactiveIfRequired = false
): Promise<string> => {
  // If a renewal is already in-flight across the app, reuse the exact same promise!
  if (activeDriveRenewalPromise) {
    return activeDriveRenewalPromise;
  }

  activeDriveRenewalPromise = (async () => {
    try {
      // 1. Check local drives first - if we have a currently valid token, return it immediately without popup!
      const currentDrives = getConnectedDrives();
      const currentValid = currentDrives.find(d => isDriveTokenValid(d) && (d.quotaLimit - d.quotaUsed > 10 * 1024 * 1024));
      if (currentValid && currentValid.accessToken) {
        setGoogleDriveToken(currentValid.accessToken);
        localStorage.setItem('g_access_token', currentValid.accessToken);
        localStorage.setItem('g_access_token_time', Date.now().toString());
        return currentValid.accessToken;
      }

      // 2. Check Firestore for latest synced cloud drive token from other tabs/devices
      try {
        const cloudDrives = await loadConnectedDrivesFromFirestore();
        if (cloudDrives && cloudDrives.length > 0) {
          const validDrive = cloudDrives.find(d => isDriveTokenValid(d) && d.accessToken);
          if (validDrive && validDrive.accessToken) {
            setGoogleDriveToken(validDrive.accessToken);
            localStorage.setItem('g_access_token', validDrive.accessToken);
            localStorage.setItem('g_access_token_time', Date.now().toString());
            return validDrive.accessToken;
          }
        }
      } catch (fsErr) {}

      // 2b. Check backend /api/drive-token (if server service account is available, provides fresh token instantly)
      try {
        const srvRes = await fetch('/api/drive-token');
        if (srvRes.ok) {
          const srvData = await srvRes.json();
          if (srvData?.accessToken) {
            setGoogleDriveToken(srvData.accessToken);
            localStorage.setItem('g_access_token', srvData.accessToken);
            localStorage.setItem('g_access_token_time', Date.now().toString());
            return srvData.accessToken;
          }
        }
      } catch (_) {}

      // 3. Determine the exact Google Drive email to connect / reconnect (locked default)
      const activeAccount = getActiveGoogleDriveAccount();
      const emailToUse = targetEmail || activeAccount?.email || getMasterDriveEmail() || LOCKED_MASTER_DRIVE_EMAIL;

      // 4. If interactive renewal is allowed (explicit user action), perform login directly to locked email
      if (interactiveIfRequired && emailToUse) {
        try {
          const loginRes = await googleDriveLogin(emailToUse, false);
          if (loginRes.accessToken) {
            localStorage.setItem('g_access_token', loginRes.accessToken);
            localStorage.setItem('g_access_token_time', Date.now().toString());
            return loginRes.accessToken;
          }
        } catch (err: any) {
          console.warn('Drive token renewal notice:', err);
          if (interactiveIfRequired) {
            throw err;
          }
        }
      }

      // 5. Fallback to any memory or localStorage token
      const fallback = googleDriveTokenMemory || localStorage.getItem('NUSANTARA_GOOGLE_DRIVE_TOKEN');
      if (fallback) return fallback;

      return '';
    } finally {
      // Clear mutex lock after 500ms cooling period
      setTimeout(() => {
        activeDriveRenewalPromise = null;
      }, 500);
    }
  })();

  return activeDriveRenewalPromise;
};

// Universal High-Reliability Google Drive API Executor with Auto-Token Precheck & Auto-Retry
export const executeDriveApiWithAutoRefresh = async <T>(
  action: (token: string) => Promise<T>,
  options?: {
    actionName?: string;
    maxRetries?: number;
    interactiveIfRequired?: boolean;
    targetEmail?: string;
  }
): Promise<T> => {
  const maxRetries = options?.maxRetries ?? 2;
  const allowInteractive = options?.interactiveIfRequired ?? true;
  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;
    
    // Obtain valid token (forces fresh sync on retry)
    let token = await ensureValidDriveToken(attempts > 1);
    if (!token) {
      const activeAccount = getActiveGoogleDriveAccount();
      const targetEmail = options?.targetEmail || activeAccount?.email || LOCKED_MASTER_DRIVE_EMAIL;
      token = await getOrRenewDriveToken(targetEmail, allowInteractive);
    }
    if (!token) {
      token = googleDriveTokenMemory || localStorage.getItem('NUSANTARA_GOOGLE_DRIVE_TOKEN') || '';
    }

    if (!token || token.trim() === '') {
      throw new Error(
        'Akun Google Drive belum terhubung atau sesi login telah berakhir. ' +
        'Silakan buka menu pengaturan Google Drive dan klik "Hubungkan Akun Google Drive" terlebih dahulu.'
      );
    }

    try {
      const result = await action(token);

      // Handle fetch Response object with 401 Unauthorized
      if (result instanceof Response && result.status === 401) {
        console.warn(`⚠️ [Google Drive Auto-Check] Mendeteksi respons 401 pada ${options?.actionName || 'Drive API'}. Memperbarui token otomatis (Percobaan ${attempts}/${maxRetries + 1})...`);
        if (attempts <= maxRetries) {
          invalidateDriveToken(token);
          const activeAccount = getActiveGoogleDriveAccount();
          const targetEmail = options?.targetEmail || activeAccount?.email || LOCKED_MASTER_DRIVE_EMAIL;
          const freshToken = await getOrRenewDriveToken(targetEmail, allowInteractive);
          token = freshToken;
          continue; // Retry loop with fresh token
        }
      }

      return result;
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      const isAuthErr = 
        errMsg.includes('401') || 
        errMsg.includes('UNAUTHORIZED') ||
        errMsg.includes('UNAUTHENTICATED') ||
        errMsg.includes('Invalid Credentials') ||
        errMsg.includes('invalid_grant') ||
        errMsg.includes('TOKEN_EXPIRED') ||
        err?.status === 401;

      if (isAuthErr && attempts <= maxRetries) {
        console.warn(`⚠️ [Google Drive Auto-Check] Token kedaluwarsa (${errMsg}). Memperbarui token Google Drive secara otomatis (Percobaan ${attempts}/${maxRetries + 1})...`);
        invalidateDriveToken(token);
        const activeAccount = getActiveGoogleDriveAccount();
        const targetEmail = options?.targetEmail || activeAccount?.email || LOCKED_MASTER_DRIVE_EMAIL;
        try {
          const freshToken = await getOrRenewDriveToken(targetEmail, allowInteractive);
          if (freshToken) {
            token = freshToken;
            localStorage.setItem('g_access_token', freshToken);
            continue; // Retry loop with fresh token
          }
        } catch (renewErr) {
          console.warn('Auto renewal attempt error:', renewErr);
        }
      }
      throw err;
    }
  }

  throw new Error(`Operasi Google Drive gagal setelah ${maxRetries + 1} percobaan.`);
};

// Periodic Background Auto-Keeper for Google Drive connection
let tokenAutoRefreshIntervalId: any = null;
let isRefreshingDriveToken = false;
let lastDriveRefreshTime = 0;
let lastDriveQuotaCheckTime = 0;

/**
 * Universal Trigger for Google Drive Token Refresh.
 * Checks token validity cleanly without unnecessary 30s spam when token is healthy.
 */
export const triggerGoogleDriveAutoRefresh = async (
  reason = 'manual', 
  force = false, 
  allowInteractive = false
): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  const now = Date.now();

  // Skip background timer checks when tab is hidden unless forced manually
  if (reason === '30s-timer' && document.visibilityState === 'hidden') {
    return getStoredGoogleDriveToken(true);
  }

  // Debounce non-forced checks to prevent network thrashing
  if (!force && (now - lastDriveRefreshTime < 5000)) {
    return getStoredGoogleDriveToken(true);
  }
  
  if (isRefreshingDriveToken) {
    return getStoredGoogleDriveToken(true);
  }

  isRefreshingDriveToken = true;
  lastDriveRefreshTime = now;

  try {
    const activeDrives = getConnectedDrives();
    const currentToken = getStoredGoogleDriveToken(true);
    const shouldCheckQuotaApi =
      force && reason !== '30s-timer'
        ? true
        : (now - lastDriveQuotaCheckTime > 5 * 60 * 1000);

    if (!currentToken || (force && reason !== '30s-timer')) {
      if (reason !== '30s-timer') {
        console.log(`⏰ [Google Drive Auto-Keeper] Memeriksa & memperbarui token (${reason})...`);
      }
      const freshToken = await getOrRenewDriveToken(undefined, allowInteractive);
      if (freshToken) {
        return freshToken;
      }
    } else if (activeDrives.length > 0 && shouldCheckQuotaApi) {
      lastDriveQuotaCheckTime = now;
      try {
        await refreshAllDrivesQuota();
      } catch (qErr: any) {
        const errMsg = String(qErr?.message || qErr);
        const isAuth401 = errMsg.includes('401') || errMsg.includes('UNAUTHORIZED') || errMsg.includes('Invalid Credentials');
        if (isAuth401) {
          console.warn('⚠️ [Google Drive Auto-Keeper] Token kadaluarsa saat pengecekan kuota. Memperbarui token otomatis...');
          if (currentToken) {
            invalidateDriveToken(currentToken);
          }
          const refreshed = await loadConnectedDrivesFromFirestore();
          const valid = refreshed.find(d => isDriveTokenValid(d) && d.accessToken);
          if (valid && valid.accessToken) {
            setGoogleDriveToken(valid.accessToken);
            return valid.accessToken;
          }
          return await getOrRenewDriveToken(undefined, allowInteractive);
        }
      }
    }

    return getStoredGoogleDriveToken(true);
  } catch (err) {
    console.warn('[Google Drive Auto-Keeper] Error saat auto-refresh:', err);
    return null;
  } finally {
    isRefreshingDriveToken = false;
  }
};

export const startGoogleDriveTokenAutoRefresh = (intervalSeconds = 30): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  // Run immediately on launch
  triggerGoogleDriveAutoRefresh('startup', true);

  // Clear existing interval if any
  if (tokenAutoRefreshIntervalId) {
    clearInterval(tokenAutoRefreshIntervalId);
  }

  const intervalMs = Math.max(30, intervalSeconds) * 1000;
  tokenAutoRefreshIntervalId = setInterval(() => {
    triggerGoogleDriveAutoRefresh('30s-timer', false);
  }, intervalMs);

  // Trigger when tab becomes visible or gains focus
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      triggerGoogleDriveAutoRefresh('tab-visible', false);
    }
  };

  const onWindowFocus = () => {
    triggerGoogleDriveAutoRefresh('window-focus', false);
  };

  // Trigger SILENT token sync on user activity (NEVER open unsolicited popups on clicks/keypresses!)
  let lastUserActivityCheck = 0;
  const onUserActivity = () => {
    const t = Date.now();
    if (t - lastUserActivityCheck > 30000) {
      lastUserActivityCheck = t;
      const activeTok = getStoredGoogleDriveToken(true);
      if (!activeTok) {
        triggerGoogleDriveAutoRefresh('user-activity', false, false);
      }
    }
  };

  window.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('pointerdown', onUserActivity, { passive: true });
  window.addEventListener('keydown', onUserActivity, { passive: true });
  window.addEventListener('popstate', onUserActivity, { passive: true });

  return () => {
    if (tokenAutoRefreshIntervalId) {
      clearInterval(tokenAutoRefreshIntervalId);
      tokenAutoRefreshIntervalId = null;
    }
    window.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onWindowFocus);
    window.removeEventListener('pointerdown', onUserActivity);
    window.removeEventListener('keydown', onUserActivity);
    window.removeEventListener('popstate', onUserActivity);
  };
};

export const googleDriveLogin = async (
  loginHint?: string,
  _forceSelectAccount = false,
  extraScopes: string[] = []
): Promise<{ user: User; accessToken: string; driveDetails?: any }> => {
  const config = getStoredFirebaseConfig();
  if (!config) {
    throw new Error('Database autentikasi belum beroperasi.');
  }

  // Use isolated secondary Auth instance so Google Drive OAuth NEVER overwrites the primary portal Firebase Auth session!
  const targetAuth = getIsolatedDriveAuth();
  const provider = new GoogleAuthProvider();
  // Request full Google Drive + drive.file permissions so created & legacy folders can be managed and deleted
  provider.addScope('https://www.googleapis.com/auth/drive');
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  for (const sc of extraScopes) {
    if (sc && typeof sc === 'string') provider.addScope(sc);
  }

  // Permanently direct Google OAuth directly to the locked Drive email without account-picker prompts
  const cleanedHint = (loginHint || '').trim().toLowerCase();
  const effectiveHint =
    cleanedHint && !isBlockedLegacyDriveEmail(cleanedHint) && isStrictlyAuthorizedDriveEmail(cleanedHint)
      ? cleanedHint
      : LOCKED_MASTER_DRIVE_EMAIL;

  provider.setCustomParameters({
    login_hint: effectiveHint
  });

  // Set timeout protection (45 seconds) so it NEVER spins indefinitely!
  const TIMEOUT_MS = 45000;
  let timeoutTimer: any = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => {
      reject(new Error(
        'Waktu tunggu koneksi Google Drive habis (45 detik).\n\n' +
        'Penyebab umum: Jendela pop-up login ditutup, diblokir browser, atau domain belum diizinkan.\n\n' +
        'SOLUSI INSTAN: Anda dapat menggunakan fitur "Input Token Manual" untuk menyambungkan Google Drive dalam hitungan detik tanpa perlu pop-up!'
      ));
    }, TIMEOUT_MS);
  });

  isDrivePopupConnecting = true;
  const savedPortalUser = currentUser;

  try {
    const result = await Promise.race([
      signInWithPopup(targetAuth, provider),
      timeoutPromise
    ]);

    if (timeoutTimer) clearTimeout(timeoutTimer);

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Sesi otentikasi Google gagal menyuplai kunci akses (Access Token).');
    }

    // Fetch detailed metadata from Drive API for accurate storage & user matching
    let driveDetails = null;
    try {
      driveDetails = await fetchDriveQuotaMetadata(credential.accessToken);
    } catch (apiErr) {
      console.warn('Failed to fetch Drive metadata, using fallback details', apiErr);
      const fallbackEmail = result.user.email || effectiveHint || LOCKED_MASTER_DRIVE_EMAIL;
      driveDetails = {
        email: fallbackEmail,
        displayName: 'Master Drive NMSA',
        photoURL: result.user.photoURL || '',
        quotaUsed: 0,
        quotaLimit: 15 * 1024 * 1024 * 1024
      };
    }

    const userEmail = (driveDetails.email || result.user.email || '').trim().toLowerCase();
    if (!userEmail || !isStrictlyAuthorizedDriveEmail(userEmail)) {
      throw new Error(
        `Akun Google yang dipilih tidak cocok dengan akun Google Drive resmi aplikasi.\n\n` +
        `Silakan gunakan akun Google Drive resmi yang terdaftar di sistem.`
      );
    }

    // If no master exists, make this master
    const activeMaster = getMasterDriveEmail();
    if (!activeMaster) {
      await setMasterDriveEmail(userEmail);
    }

    // Store as last active email
    localStorage.setItem('NUSANTARA_LAST_ACTIVE_EMAIL', driveDetails.email);

    // Load existing connected drives list
    const currentDrives = getConnectedDrives();
    const now = Date.now();
    const newDrive: ConnectedDrive = {
      email: driveDetails.email,
      accessToken: credential.accessToken,
      displayName: driveDetails.displayName,
      photoURL: driveDetails.photoURL,
      quotaUsed: driveDetails.quotaUsed,
      quotaLimit: driveDetails.quotaLimit,
      lastChecked: new Date().toISOString(),
      isExpired: false,
      issuedAt: now,
      expiresAt: now + TOKEN_LIFESPAN_MS
    };

    // Replace if email exists, otherwise index appends
    const index = currentDrives.findIndex(d => d.email.toLowerCase() === driveDetails.email.toLowerCase());
    if (index !== -1) {
      currentDrives[index] = newDrive;
    } else {
      currentDrives.push(newDrive);
    }

    await saveConnectedDrives(currentDrives);
    localStorage.setItem('g_access_token', credential.accessToken);
    localStorage.setItem('g_access_token_time', Date.now().toString());
    if (driveDetails?.email) {
      localStorage.setItem('g_user_email', driveDetails.email);
    }

    return { user: result.user, accessToken: credential.accessToken, driveDetails };
  } catch (error: any) {
    if (timeoutTimer) clearTimeout(timeoutTimer);

    if (error?.code === 'auth/popup-closed-by-user' || String(error?.message).includes('popup-closed-by-user')) {
      throw new Error('Jendela pop-up Google ditutup sebelum login selesai. Silakan klik Sambungkan kembali atau gunakan "Input Token Manual".');
    }
    if (error?.code === 'auth/cancelled-popup-request' || String(error?.message).includes('cancelled-popup-request')) {
      throw new Error('Permintaan pop-up Google dibatalkan karena ada jendela otentikasi lain.');
    }
    if (error?.code === 'auth/popup-blocked' || String(error?.message).includes('popup-blocked')) {
      throw new Error('Jendela pop-up Google diblokir oleh browser. Silakan izinkan pop-up (Pop-ups Allowed) di pengaturan browser Anda atau gunakan tombol "Input Token Manual".');
    }
    if (error?.code === 'auth/unauthorized-domain' || String(error?.message).includes('unauthorized-domain')) {
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      console.warn(`[Firebase Auth] Domain '${currentHost}' belum terdaftar di Authorized Domains.`);
      throw new Error(
        `Domain aplikasi ini (${currentHost}) belum didaftarkan di Firebase Authentication Authorized Domains.\n\n` +
        `SOLUSI INSTAN (TANPA BUKA FIREBASE CONSOLE):\n` +
        `Gunakan tombol "Input Token Manual" di menu Google Drive untuk menghubungkan akun Google Anda secara instan!`
      );
    }
    console.error('Error Google Drive connection:', error);
    throw error;
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    setTimeout(() => {
      isDrivePopupConnecting = false;
      if (savedPortalUser) {
        currentUser = savedPortalUser;
      }
    }, 1000);
  }
};

// ═════════ FIRESTORE REST DATA OPERATION & CROSS-DEVICE SYNC ═════════

const DELETED_SUBMISSIONS_STORAGE_KEY = 'NUSANTARA_DELETED_SUBMISSION_IDS';

// Hapus cache lokal hanya bila diminta secara eksplisit (forceWipe = true)
export const purgeAllLocalSubmissionCaches = (forceWipe: boolean = false): void => {
  if (!forceWipe || typeof localStorage === 'undefined') return;
  try {
    const keysToRemove: string[] = [
      'NUSANTARA_HO_SUBMISSIONS',
      'voucher_submissions',
      DELETED_SUBMISSIONS_STORAGE_KEY,
    ];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('NUSANTARA_HO_SUBMISSIONS_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
  } catch (_) {}
};

export const sortSubmissionsList = (list: Submission[]): Submission[] => {
  return [...list].sort((a, b) => {
    const dateA = a.tanggal || '';
    const dateB = b.tanggal || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const suffixA = a.kode ? parseInt(a.kode.split('/').pop() || '0', 10) : 0;
    const suffixB = b.kode ? parseInt(b.kode.split('/').pop() || '0', 10) : 0;
    if (!isNaN(suffixA) && !isNaN(suffixB) && suffixA !== suffixB) {
      return suffixB - suffixA;
    }
    const timeC = a.createdAt || '';
    const timeD = b.createdAt || '';
    if (timeC !== timeD) return timeD.localeCompare(timeC);
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
};

export const getLocalDeletedSubmissionIds = (): string[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELETED_SUBMISSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? Array.from(new Set(parsed.map(String).filter(Boolean))) : [];
  } catch (_) {
    return [];
  }
};

export const saveLocalDeletedSubmissionIds = (ids: string[]) => {
  if (typeof localStorage === 'undefined') return;
  try {
    const unique = Array.from(new Set((ids || []).map((x) => String(x).trim()).filter(Boolean))).slice(-1000);
    if (unique.length === 0) {
      localStorage.removeItem(DELETED_SUBMISSIONS_STORAGE_KEY);
    } else {
      localStorage.setItem(DELETED_SUBMISSIONS_STORAGE_KEY, JSON.stringify(unique));
    }
  } catch (_) {}
};

export const addLocalDeletedSubmissionId = (id: string): string[] => {
  const cleanId = String(id || '').trim();
  if (!cleanId) return getLocalDeletedSubmissionIds();
  const next = Array.from(new Set([...getLocalDeletedSubmissionIds(), cleanId]));
  saveLocalDeletedSubmissionIds(next);
  return next;
};

export const removeLocalDeletedSubmissionId = (id: string): string[] => {
  const cleanId = String(id || '').trim().toLowerCase();
  if (!cleanId) return getLocalDeletedSubmissionIds();
  const next = getLocalDeletedSubmissionIds().filter((x) => x.toLowerCase().trim() !== cleanId);
  saveLocalDeletedSubmissionIds(next);
  return next;
};

export const loadDeletedSubmissionIdsFromFirestore = async (): Promise<string[]> => {
  return getLocalDeletedSubmissionIds();
};

export const syncDeletedSubmissionIdToCloud = async (id: string): Promise<void> => {
  addLocalDeletedSubmissionId(id);
};

export const subscribeToDeletedSubmissionIdsFromFirestore = (
  _onUpdate: (deletedIds: string[]) => void
): (() => void) => {
  return () => {};
};

export const normalizeCompanyKey = (raw?: string | null): string => {
  const val = String(raw || '').toLowerCase().trim();
  if (!val || val === 'nmsa' || val.includes('nusantara mineral sukses abadi')) {
    return 'nmsa';
  }
  return val;
};

const stripHeavyFieldsForLocalCache = (list: Submission[]): Submission[] => {
  return (list || []).map((sub) => {
    const cleanFiles = Array.isArray(sub.files)
      ? sub.files.map((f: any) => ({
          id: f.id,
          name: f.name,
          url: f.url,
          isDrive: f.isDrive,
          docType: f.docType,
        }))
      : undefined;
    const { files: _ignoreFiles, ...rest } = sub as any;
    return cleanFiles ? { ...rest, files: cleanFiles } : rest;
  });
};

export const loadAllLocalSubmissionsForCompany = (companyId: string = 'nmsa'): Submission[] => {
  if (typeof localStorage === 'undefined') return [];
  const targetComp = normalizeCompanyKey(companyId);
  const delLower = new Set(getLocalDeletedSubmissionIds().map((x) => x.toLowerCase()));
  const keys = [
    `NUSANTARA_HO_SUBMISSIONS_${targetComp}`,
    'NUSANTARA_HO_SUBMISSIONS',
    'voucher_submissions',
  ];
  const map = new Map<string, Submission>();

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (!item || !item.id) continue;
        const idLower = String(item.id).toLowerCase();
        if (delLower.has(idLower)) continue;
        const itemComp = normalizeCompanyKey(item.companyId);
        if (itemComp !== targetComp) continue;
        if (!map.has(idLower)) {
          map.set(idLower, item);
        }
      }
    } catch (_) {}
  }

  return sortSubmissionsList(Array.from(map.values()));
};

export const persistSubmissionsToLocalCaches = (list: Submission[], companyId: string = 'nmsa') => {
  if (typeof localStorage === 'undefined' || !Array.isArray(list)) return;
  const targetComp = normalizeCompanyKey(companyId);
  const lightweight = stripHeavyFieldsForLocalCache(list);
  const serialized = JSON.stringify(lightweight);
  try {
    localStorage.setItem(`NUSANTARA_HO_SUBMISSIONS_${targetComp}`, serialized);
  } catch (_) {}
  try {
    if (targetComp === 'nmsa') {
      localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', serialized);
    }
  } catch (_) {}
};

const getSubmissionTimestamp = (sub: Partial<Submission> | null | undefined): number => {
  if (!sub) return 0;
  const raw = (sub as any).updatedAt || sub.createdAt || '';
  if (!raw) return 0;
  const parsed = Date.parse(String(raw));
  return isNaN(parsed) ? 0 : parsed;
};

const pickRicherSubmission = (existing: Submission, incoming: Submission): Submission => {
  const existingTs = getSubmissionTimestamp(existing);
  const incomingTs = getSubmissionTimestamp(incoming);

  // Choose the newer record; if timestamps match or are absent, prefer incoming
  const winner = incomingTs >= existingTs ? incoming : existing;
  const loser = winner === incoming ? existing : incoming;

  // Preserve file/Drive attachments if the winner happens to come from a lightweight cache without them
  const winnerFiles = Array.isArray(winner.files) ? winner.files : [];
  const loserFiles = Array.isArray(loser.files) ? loser.files : [];
  const mergedFiles =
    winnerFiles.length > 0
      ? winnerFiles
      : loserFiles.length > 0
      ? loserFiles
      : winner.files;

  const mergedDriveFiles =
    Array.isArray(winner.googleDriveFiles) && winner.googleDriveFiles.length > 0
      ? winner.googleDriveFiles
      : loser.googleDriveFiles;

  return {
    ...winner,
    ...(mergedFiles !== undefined ? { files: mergedFiles } : {}),
    ...(mergedDriveFiles !== undefined ? { googleDriveFiles: mergedDriveFiles } : {}),
    googleDriveFileUrl: winner.googleDriveFileUrl || loser.googleDriveFileUrl,
    googleDriveFolderId: winner.googleDriveFolderId || loser.googleDriveFolderId,
    buktiPembayaran: winner.buktiPembayaran || loser.buktiPembayaran,
    bupotDriveUrl: winner.bupotDriveUrl || loser.bupotDriveUrl,
    bupotFileName: winner.bupotFileName || loser.bupotFileName,
    bupotNumber: winner.bupotNumber || loser.bupotNumber,
  };
};

export const mergeSubmissionsSafely = (
  lists: Submission[][],
  deletedIds?: string[]
): Submission[] => {
  const delSet = new Set(
    (deletedIds ?? getLocalDeletedSubmissionIds()).map((x) => String(x || '').toLowerCase().trim()).filter(Boolean)
  );
  const map = new Map<string, Submission>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || !item.id) continue;
      const idLower = String(item.id).toLowerCase().trim();
      if (delSet.has(idLower)) continue;
      const existing = map.get(idLower);
      if (!existing) {
        map.set(idLower, item);
      } else {
        map.set(idLower, pickRicherSubmission(existing, item));
      }
    }
  }

  return sortSubmissionsList(Array.from(map.values()));
};

// Single-flight deduplication for submissions collection reads per company
const inFlightSubmissionsLoadMap = new Map<string, Promise<{
  list: Submission[];
  ok: boolean;
  error?: string;
  errorCode?: string;
  totalCloudDocs?: number;
  skippedByCompany?: number;
  skippedDeleted?: number;
}>>();

// Safe loader from Cloud Firestore that returns explicit diagnostics instead of throwing or hanging
export const loadSubmissionsFromFirestoreSafe = async (
  companyId?: string
): Promise<{
  list: Submission[];
  ok: boolean;
  error?: string;
  errorCode?: string;
  totalCloudDocs?: number;
  skippedByCompany?: number;
  skippedDeleted?: number;
}> => {
  if (!isFirebaseConfigured() || !firestoreDb) {
    return {
      list: [],
      ok: false,
      error: 'Konfigurasi Firebase Firestore belum siap.',
      errorCode: 'not-configured'
    };
  }
  if (!hasAuthenticatedFirebaseUser()) {
    return {
      list: [],
      ok: false,
      error: 'Sesi login Firebase belum aktif.',
      errorCode: 'unauthenticated'
    };
  }
  if (isFirestoreQuotaExceeded()) {
    return {
      list: [],
      ok: false,
      error: 'Kuota harian Spark Firestore sedang cooldown sementara.',
      errorCode: 'resource-exhausted'
    };
  }
  if (isFirestoreInternalDegraded()) {
    return {
      list: [],
      ok: false,
      error: 'Stream Firestore SDK sedang dalam pemulihan sementara.',
      errorCode: 'internal-sdk-error'
    };
  }

  const targetComp = companyId ? normalizeCompanyKey(companyId) : '';
  const dedupeKey = targetComp || '__all__';
  const existingPromise = inFlightSubmissionsLoadMap.get(dedupeKey);
  if (existingPromise) {
    return existingPromise;
  }

  const path = 'submissions';
  const loadPromise = (async () => {
    try {
      const snapshot = await withTimeout(
        getDocs(collection(firestoreDb!, path)),
        12000,
        'Memuat voucher dari Firestore'
      );
      recordFirestoreReads(Math.max(1, snapshot.size));
      resetFirestorePermissionDenied();
      const delLower = new Set(getLocalDeletedSubmissionIds().map((x) => x.toLowerCase()));
      const list: Submission[] = [];
      let skippedDeleted = 0;
      let skippedByCompany = 0;

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const mapped = mapFirestoreToSubmission(docSnap.id, data);
        if (delLower.has(String(mapped.id || '').toLowerCase())) {
          skippedDeleted++;
          return;
        }
        const docComp = normalizeCompanyKey(data.companyId || data.company_id);

        if (!targetComp || docComp === targetComp) {
          list.push(mapped);
        } else {
          skippedByCompany++;
        }
      });

      const sorted = sortSubmissionsList(list);
      return {
        list: sorted,
        ok: true,
        totalCloudDocs: snapshot.size,
        skippedByCompany,
        skippedDeleted,
      };
    } catch (error: any) {
      markFirestoreQuotaExceeded(error);
      markFirestorePermissionDenied(error);
      markFirestoreInternalAssertion(error);
      const errorCode = isFirestoreInternalAssertionError(error)
        ? 'internal-sdk-error'
        : (error?.code || 'unknown');
      const errorMsg = error?.message || String(error);
      console.warn(`⚠️ [Firestore Safe Load] Gagal membaca koleksi "${path}" (${errorCode}):`, errorMsg);
      return {
        list: [],
        ok: false,
        error: errorMsg,
        errorCode
      };
    } finally {
      inFlightSubmissionsLoadMap.delete(dedupeKey);
    }
  })();

  inFlightSubmissionsLoadMap.set(dedupeKey, loadPromise);
  return loadPromise;
};

// Fetch submissions from Cloud Firestore with safe local cache fallback on error/empty
export const loadSubmissionsFromFirestore = async (companyId?: string): Promise<Submission[]> => {
  const res = await loadSubmissionsFromFirestoreSafe(companyId);
  const localBackup = loadAllLocalSubmissionsForCompany(companyId || 'nmsa');
  if (res.ok && res.list.length > 0) {
    return mergeSubmissionsSafely([localBackup, res.list]);
  }
  if (localBackup.length > 0) {
    return localBackup;
  }
  return res.list;
};

// Real-time Firestore snapshot subscription for submissions across all devices
export const subscribeToSubmissionsFromFirestore = (
  companyId: string = 'nmsa',
  onUpdate: (cloudSubmissions: Submission[]) => void,
  onError?: (err: any) => void
): (() => void) => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) {
    return () => {};
  }
  const targetComp = normalizeCompanyKey(companyId || 'nmsa');
  let isInitialSnapshot = true;

  try {
    const unsub = onSnapshot(
      collection(firestoreDb, 'submissions'),
      (snapshot) => {
        if (snapshot.empty && snapshot.metadata?.fromCache) {
          return;
        }
        const readUnits = isInitialSnapshot
          ? Math.max(1, snapshot.size)
          : Math.max(1, snapshot.docChanges().length);
        isInitialSnapshot = false;
        recordFirestoreReads(readUnits);

        const delLower = new Set(getLocalDeletedSubmissionIds().map((x) => x.toLowerCase()));
        const list: Submission[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          const mapped = mapFirestoreToSubmission(docSnap.id, data);
          if (delLower.has(String(mapped.id || '').toLowerCase())) return;
          const docComp = normalizeCompanyKey(data.companyId || data.company_id);
          if (!targetComp || docComp === targetComp) {
            list.push(mapped);
          }
        });

        const sorted = sortSubmissionsList(list);
        onUpdate(sorted);
      },
      (err: any) => {
        markFirestoreQuotaExceeded(err);
        markFirestorePermissionDenied(err);
        markFirestoreInternalAssertion(err);
        console.warn('⚠️ Realtime listener submissions notice:', err?.message || err);
        if (onError) onError(err);
      }
    );
    return unsub;
  } catch (err) {
    markFirestoreInternalAssertion(err);
    console.warn('Failed to subscribe to submissions:', err);
    return () => {};
  }
};

// Fetch single submission from Firestore by its ID
export const getSubmissionFromFirestore = async (docId: string): Promise<Submission | null> => {
  if (!isFirebaseConfigured() || !firestoreDb) return null;
  try {
    const docRef = doc(firestoreDb, 'submissions', docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return mapFirestoreToSubmission(snap.id, snap.data());
    }

    // Secondary fallback: query by field 'kode' or 'id'
    try {
      const qKode = query(collection(firestoreDb, 'submissions'), where('kode', '==', docId), limit(1));
      const snapKode = await getDocs(qKode);
      if (!snapKode.empty) {
        const first = snapKode.docs[0];
        return mapFirestoreToSubmission(first.id, first.data());
      }
    } catch (_) {}

    try {
      const qId = query(collection(firestoreDb, 'submissions'), where('id', '==', docId), limit(1));
      const snapId = await getDocs(qId);
      if (!snapId.empty) {
        const first = snapId.docs[0];
        return mapFirestoreToSubmission(first.id, first.data());
      }
    } catch (_) {}
  } catch (err) {
    console.warn('Error fetching single submission:', err);
  }
  return null;
};

// ═════════ IN-MEMORY FIRESTORE QUEUE (NON-VOUCHER COLLECTIONS ONLY) ═════════

export interface FirestoreQueueItem {
  id: string; // unique key: `${path}/${docId}`
  path: string;
  docId: string;
  payload: any;
  addedAt: number;
  retries: number;
  description?: string;
}

let firestoreWriteQueue: FirestoreQueueItem[] = [];
let isProcessingFirestoreQueue = false;
let queueFlushTimer: any = null;

const loadPersistedFirestoreQueue = (): FirestoreQueueItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('NUSANTARA_FIRESTORE_WRITE_QUEUE');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item: any) => item?.path && item.path !== 'submissions');
      }
    }
  } catch (e) {}
  return [];
};

const persistFirestoreQueue = () => {
  if (typeof window === 'undefined') return;
  try {
    const nonSub = firestoreWriteQueue.filter(item => item.path !== 'submissions');
    if (nonSub.length === 0) {
      localStorage.removeItem('NUSANTARA_FIRESTORE_WRITE_QUEUE');
    } else {
      localStorage.setItem('NUSANTARA_FIRESTORE_WRITE_QUEUE', JSON.stringify(nonSub));
    }
  } catch (e) {}
};

if (typeof window !== 'undefined') {
  firestoreWriteQueue = loadPersistedFirestoreQueue();
}

export const getPendingFirestoreSyncCount = (): number => {
  return firestoreWriteQueue.length;
};

export const isFirestoreSyncing = (): boolean => {
  return isProcessingFirestoreQueue;
};

export const notifyFirestoreQueueStatus = (isSyncing: boolean = isProcessingFirestoreQueue) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore-queue-status', {
      detail: {
        pendingCount: firestoreWriteQueue.length,
        isSyncing
      }
    }));
  }
};

export const removeFromFirestoreQueue = (path: string, docId: string): void => {
  const key = `${path}/${docId}`;
  const beforeLen = firestoreWriteQueue.length;
  firestoreWriteQueue = firestoreWriteQueue.filter(item => item.id !== key);
  if (firestoreWriteQueue.length !== beforeLen) {
    persistFirestoreQueue();
    notifyFirestoreQueueStatus();
  }
};

export const enqueueFirestoreWrite = (
  path: string, 
  docId: string, 
  payload: any, 
  description?: string
): void => {
  // Voucher 'submissions' writes are always direct-only to Firestore (no temporary local queue)
  const ALLOWED_COLLECTIONS = ['npwp_records', 'attendance', 'workers'];
  if (!ALLOWED_COLLECTIONS.includes(path)) {
    return;
  }

  const key = `${path}/${docId}`;
  const now = Date.now();

  const existingIdx = firestoreWriteQueue.findIndex(item => item.id === key);
  const newItem: FirestoreQueueItem = {
    id: key,
    path,
    docId,
    payload,
    addedAt: now,
    retries: 0,
    description: description || `Write to ${key}`
  };

  if (existingIdx !== -1) {
    firestoreWriteQueue[existingIdx] = newItem;
  } else {
    firestoreWriteQueue.push(newItem);
  }

  persistFirestoreQueue();
  notifyFirestoreQueueStatus();

  if (isFirestoreQuotaExceeded()) {
    return;
  }

  if (!queueFlushTimer) {
    queueFlushTimer = setTimeout(() => {
      queueFlushTimer = null;
      flushFirestoreQueue().catch(() => {});
    }, 80);
  }
};

export const flushFirestoreQueue = async (): Promise<{ processed: number; remaining: number }> => {
  if (isProcessingFirestoreQueue) {
    return { processed: 0, remaining: firestoreWriteQueue.length };
  }

  if (firestoreWriteQueue.length === 0) {
    return { processed: 0, remaining: 0 };
  }

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser()) {
    return { processed: 0, remaining: firestoreWriteQueue.length };
  }

  if (isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) {
    return { processed: 0, remaining: firestoreWriteQueue.length };
  }

  isProcessingFirestoreQueue = true;
  notifyFirestoreQueueStatus(true);
  let processed = 0;

  try {
    while (firestoreWriteQueue.length > 0) {
      if (isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) {
        break;
      }

      const item = firestoreWriteQueue[0];
      try {
        const docRef = doc(firestoreDb, item.path, item.docId);
        await withTimeout(setDoc(docRef, item.payload, { merge: true }), 10000, `Simpan antrean ${item.id}`);
        
        firestoreWriteQueue.shift();
        processed++;
        recordFirestoreWrites(1);
        persistFirestoreQueue();
        notifyFirestoreQueueStatus(true);
      } catch (err: any) {
        console.warn(`[Firestore Queue] Gagal sinkronisasi data ${item.id}:`, err?.message || err);
        markFirestoreQuotaExceeded(err);
        markFirestorePermissionDenied(err);
        markFirestoreInternalAssertion(err);
        
        item.retries = (item.retries || 0) + 1;
        persistFirestoreQueue();
        break;
      }
    }
  } finally {
    isProcessingFirestoreQueue = false;
    notifyFirestoreQueueStatus(false);
  }

  return { processed, remaining: firestoreWriteQueue.length };
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushFirestoreQueue().catch(() => {});
  });
}

// Put/Save single submission DIRECTLY to Cloud Firestore
export const saveSubmissionToFirestore = async (
  submission: Submission, 
  userCompanyId: string = 'nmsa',
  userCompanyName: string = 'PT Nusantara Mineral Sukses Abadi',
  _options?: { waitForCloudAck?: boolean }
): Promise<{ syncedToCloud: boolean; error?: string }> => {
  removeLocalDeletedSubmissionId(submission.id);
  const cleanComp = normalizeCompanyKey(submission.companyId || userCompanyId || activeCompanyId);
  const stampedSubmission: Submission = {
    ...submission,
    companyId: cleanComp,
    companyName: submission.companyName || userCompanyName,
    updatedAt: new Date().toISOString()
  };

  const path = 'submissions';
  const fPayload = mapSubmissionToFirestore(
    stampedSubmission, 
    currentUser?.email || 'admin@nmsa.com', 
    currentUser?.uid || 'pwsDJv3bKHQamy89PDaAeCoZQcU2',
    cleanComp,
    userCompanyName
  );
  const cleanedPayload = cleanUndefined(fPayload);
  const safeDocId = sanitizeFirestoreDocId(stampedSubmission.id);

  if (!isFirebaseConfigured() || !firestoreDb) {
    return {
      syncedToCloud: false,
      error: 'Konfigurasi Firebase Firestore belum aktif.'
    };
  }

  if (!hasAuthenticatedFirebaseUser()) {
    return {
      syncedToCloud: false,
      error: 'Sesi login Firebase Auth belum aktif. Silakan login terlebih dahulu.'
    };
  }

  if (isFirestoreQuotaExceeded()) {
    return {
      syncedToCloud: false,
      error: 'Kuota Firestore sedang cooldown sementara. Coba lagi sebentar atau klik Sinkron Cloud.'
    };
  }
  if (isFirestoreInternalDegraded()) {
    return {
      syncedToCloud: false,
      error: 'Koneksi Firestore SDK sedang dipulihkan sementara. Data aman di penyimpanan lokal/server.'
    };
  }

  try {
    await withTimeout(setDoc(doc(firestoreDb, path, safeDocId), cleanedPayload, { merge: true }), 12000, 'Simpan voucher ke Firestore');
    recordFirestoreWrites(1);
    resetFirestorePermissionDenied();
    console.log(`☁️ [Firestore Direct] Voucher ${stampedSubmission.kode || stampedSubmission.id} langsung tersimpan ke Firebase Firestore.`);
    return { syncedToCloud: true };
  } catch (error: any) {
    markFirestoreQuotaExceeded(error);
    markFirestorePermissionDenied(error);
    markFirestoreInternalAssertion(error);
    const msg = error?.message || String(error);
    console.warn(`⚠️ [Firestore Direct] Gagal menyimpan voucher (${safeDocId}):`, msg);
    return { syncedToCloud: false, error: msg };
  }
};

// Batch save/update multiple submissions DIRECTLY in Firestore
export const saveSubmissionsBatchToFirestore = async (
  submissions: Submission[],
  userCompanyId: string = 'nmsa',
  userCompanyName: string = 'PT Nusantara Mineral Sukses Abadi'
): Promise<{ success: boolean; count: number; error?: string }> => {
  if (submissions.length === 0) {
    return { success: true, count: 0 };
  }

  const cleanComp = normalizeCompanyKey(userCompanyId || activeCompanyId || 'nmsa');

  if (!isFirebaseConfigured() || !firestoreDb) {
    return { success: false, count: 0, error: 'Firebase Firestore belum terhubung.' };
  }
  if (!hasAuthenticatedFirebaseUser()) {
    return { success: false, count: 0, error: 'Sesi login Firebase Auth belum aktif. Silakan login ulang.' };
  }
  if (isFirestoreQuotaExceeded()) {
    return { success: false, count: 0, error: 'Kuota Firestore sedang cooldown sementara.' };
  }
  if (isFirestoreInternalDegraded()) {
    return { success: false, count: 0, error: 'Stream Firestore SDK sedang dalam pemulihan sementara.' };
  }

  const BATCH_SIZE = 400;
  let totalSaved = 0;
  let lastError = '';

  for (let i = 0; i < submissions.length; i += BATCH_SIZE) {
    if (isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) break;
    const chunk = submissions.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestoreDb);

    for (const sub of chunk) {
      const fPayload = mapSubmissionToFirestore(
        sub,
        currentUser?.email || 'admin@nmsa.com',
        currentUser?.uid || 'pwsDJv3bKHQamy89PDaAeCoZQcU2',
        normalizeCompanyKey(sub.companyId || cleanComp),
        sub.companyName || userCompanyName
      );
      const cleaned = cleanUndefined(fPayload);
      const docId = sanitizeFirestoreDocId(sub.id);
      const subRef = doc(firestoreDb, 'submissions', docId);
      batch.set(subRef, cleaned, { merge: true });
    }

    try {
      await withTimeout(batch.commit(), 15000, 'Upload batch voucher ke Firestore');
      totalSaved += chunk.length;
      recordFirestoreWrites(chunk.length);
      resetFirestorePermissionDenied();
      console.log(`☁️ Batch saved ${chunk.length} submissions directly to Firestore.`);
    } catch (err: any) {
      lastError = err?.message || String(err);
      markFirestoreQuotaExceeded(err);
      markFirestoreInternalAssertion(err);
      if (isFirestorePermissionError(err)) {
        markFirestorePermissionDenied(err);
        break;
      }
      if (isFirestoreInternalDegraded() || err?.code === 'deadline-exceeded') {
        break;
      }
      console.warn('Batch write fallback -> trying per-document direct writes for chunk:', err);
      for (const sub of chunk) {
        if (isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) break;
        const payload = cleanUndefined(
          mapSubmissionToFirestore(
            sub,
            currentUser?.email || 'admin@nmsa.com',
            currentUser?.uid || 'pwsDJv3bKHQamy89PDaAeCoZQcU2',
            normalizeCompanyKey(sub.companyId || cleanComp),
            sub.companyName || userCompanyName
          )
        );
        const docId = sanitizeFirestoreDocId(sub.id);
        try {
          if (!isFirestoreQuotaExceeded()) {
            await withTimeout(setDoc(doc(firestoreDb, 'submissions', docId), payload, { merge: true }), 8000, `Simpan voucher ${docId}`);
            totalSaved += 1;
            recordFirestoreWrites(1);
          }
        } catch (docErr: any) {
          lastError = docErr?.message || String(docErr);
          markFirestoreQuotaExceeded(docErr);
          markFirestorePermissionDenied(docErr);
          markFirestoreInternalAssertion(docErr);
          console.warn(`⚠️ Gagal simpan individu voucher ${sub.kode || docId}:`, docErr);
          if (isFirestorePermissionError(docErr) || isFirestoreInternalDegraded()) break;
        }
      }
    }
  }

  return { success: totalSaved > 0, count: totalSaved, error: totalSaved === 0 ? lastError : undefined };
};

// Restore backup submissions into Cloud Firestore
export const restoreSubmissionsToFirestore = async (
  submissions: Submission[],
  companyId: string = 'nmsa',
  companyName: string = 'PT Nusantara Mineral Sukses Abadi'
): Promise<{ successCount: number; total: number; error?: string }> => {
  resetFirestorePermissionDenied();
  await resetFirestoreQuotaCooldown().catch(() => {});
  const targetComp = normalizeCompanyKey(companyId || 'nmsa');
  const validSubs = (submissions || []).filter((s) => s && s.id);
  const res = await saveSubmissionsBatchToFirestore(validSubs, targetComp, companyName);
  return {
    successCount: res.count,
    total: validSubs.length,
    error: res.error
  };
};

// Cloud loader with safe fallback
export const reconcileSubmissionsWithCloud = async (
  companyId: string = 'nmsa',
  _companyName: string = 'PT Nusantara Mineral Sukses Abadi',
  options?: { forceResetQuota?: boolean; localSnapshot?: Submission[] }
): Promise<{
  merged: Submission[];
  uploadedCount: number;
  cloudCount: number;
  deletedIds: string[];
  usedOfflineFallback: boolean;
}> => {
  const cleanComp = normalizeCompanyKey(companyId || 'nmsa');

  if (options?.forceResetQuota) {
    await resetFirestoreQuotaCooldown();
  }

  const localFallback = options?.localSnapshot && options.localSnapshot.length > 0
    ? options.localSnapshot
    : loadAllLocalSubmissionsForCompany(cleanComp);

  if (!isFirebaseConfigured() || !firestoreDb || isFirestoreQuotaExceeded()) {
    return {
      merged: localFallback,
      uploadedCount: 0,
      cloudCount: 0,
      deletedIds: getLocalDeletedSubmissionIds(),
      usedOfflineFallback: true
    };
  }

  try {
    const safeRes = await loadSubmissionsFromFirestoreSafe(cleanComp);
    return {
      merged: safeRes.ok && safeRes.list.length > 0 ? safeRes.list : localFallback,
      uploadedCount: 0,
      cloudCount: safeRes.list.length,
      deletedIds: getLocalDeletedSubmissionIds(),
      usedOfflineFallback: !safeRes.ok
    };
  } catch (err) {
    console.warn('⚠️ [Firestore Direct] Gagal memuat data langsung dari Firestore:', err);
    return {
      merged: localFallback,
      uploadedCount: 0,
      cloudCount: 0,
      deletedIds: getLocalDeletedSubmissionIds(),
      usedOfflineFallback: true
    };
  }
};

// Delete single submission directly from Firestore and record tombstone
export const deleteSubmissionFromFirestore = async (id: string): Promise<void> => {
  addLocalDeletedSubmissionId(id);

  if (!isFirebaseConfigured() || !firestoreDb) {
    throw new Error('Firebase is not initialized.');
  }

  if (isFirestoreQuotaExceeded()) {
    throw new Error('Kuota Firestore sedang cooldown sementara.');
  }
  if (isFirestoreInternalDegraded()) {
    throw new Error('Koneksi Firestore SDK sedang dipulihkan sementara.');
  }

  const path = 'submissions';
  const safeId = sanitizeFirestoreDocId(id);
  try {
    await withTimeout(deleteDoc(doc(firestoreDb, path, id)), 10000, `Hapus voucher ${id}`);
    if (safeId && safeId !== id) {
      await withTimeout(deleteDoc(doc(firestoreDb, path, safeId)), 6000, `Hapus voucher ${safeId}`).catch(() => {});
    }
    recordFirestoreDeletes(1);
    console.log(`☁️ Submission ${id} deleted directly from Firestore.`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    markFirestoreInternalAssertion(error);
    handleFirestoreError(error, OperationType.DELETE, `${path}/${id}`);
  }
};

// Fetch activity logs (stored locally to conserve daily free Firestore quota)
export const loadActivityLogsFromFirestore = async (_companyId?: string): Promise<ActivityLog[]> => {
  try {
    const stored = localStorage.getItem('NUSANTARA_ACTIVITY_LOGS');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Push a single activity log to local cache (saved locally to conserve daily Firestore quota)
export const saveActivityLogToFirestore = async (
  action: string,
  details: string,
  category: 'info' | 'success' | 'warning' = 'info',
  submissionId?: string,
  submissionCode?: string,
  userProfile?: any
): Promise<void> => {
  const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const timestamp = new Date().toISOString();
  
  const activeUser = currentUser;
  const userId = activeUser?.uid || 'anonymous';
  const userEmail = activeUser?.email || 'offline_user';
  const userName = userProfile?.fullName || activeUser?.email?.split('@')[0] || 'Sistem';

  const logPayload: ActivityLog = {
    id: logId,
    timestamp,
    userId,
    userEmail,
    userName,
    action,
    details,
    category,
    submissionId: submissionId || '',
    submissionCode: submissionCode || ''
  };

  // Cache to local storage list
  try {
    const stored = localStorage.getItem('NUSANTARA_ACTIVITY_LOGS');
    const list: ActivityLog[] = stored ? JSON.parse(stored) : [];
    const updatedList = [logPayload, ...list].slice(0, 500); // limit to latest 500 logs to prevent overflow
    localStorage.setItem('NUSANTARA_ACTIVITY_LOGS', JSON.stringify(updatedList));
  } catch (e) {
    console.warn('Failed to save log to localStorage:', e);
  }
};

export const mergeNpwpListsSafely = (
  primary: NpwpRecord[],
  secondary: NpwpRecord[],
  deletedIds: string[]
): NpwpRecord[] => {
  const delSet = new Set(deletedIds.map((x) => String(x || '').trim()).filter(Boolean));
  const map = new Map<string, NpwpRecord>();
  (secondary || []).forEach((r) => {
    if (r && r.id && !delSet.has(r.id)) map.set(r.id, r);
  });
  (primary || []).forEach((r) => {
    if (r && r.id && !delSet.has(r.id)) {
      const existing = map.get(r.id);
      if (!existing) {
        map.set(r.id, r);
      } else {
        const existingTs = Date.parse((existing as any).updatedAt || existing.createdAt || '') || 0;
        const primaryTs = Date.parse((r as any).updatedAt || r.createdAt || '') || 0;
        map.set(r.id, primaryTs >= existingTs ? r : existing);
      }
    }
  });
  return Array.from(map.values());
};

const readLocalNpwpBackup = (delSet: Set<string>): NpwpRecord[] => {
  try {
    const stored = localStorage.getItem('npwp_records_v1');
    const parsed: NpwpRecord[] = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.filter((r) => r && r.id && !delSet.has(r.id))
      : [];
  } catch {
    return [];
  }
};

// Fetch NPWP Records from Firestore (merging safely with local & server backup)
export const loadNpwpRecordsFromFirestore = async (): Promise<NpwpRecord[]> => {
  const deletedList = getDeletedNpwpIds();
  const delSet = new Set(deletedList);
  const localRecords = readLocalNpwpBackup(delSet);

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) {
    return localRecords;
  }

  const path = 'npwp_records';
  try {
    const snapshot = await withTimeout(getDocs(collection(firestoreDb, path)), 10000, 'Memuat data NPWP');
    recordFirestoreReads(snapshot.size || 1);
    const cloudList: NpwpRecord[] = [];
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const docId = docSnap.id || data?.id;
      if (data && data.companyName && docId && !delSet.has(docId)) {
        cloudList.push({
          id: docId,
          companyName: data.companyName,
          npwpNumber: data.npwpNumber || '',
          address: data.address || '',
          kppName: data.kppName || '',
          taxStatus: data.taxStatus || 'PKP',
          contactPerson: data.contactPerson || '',
          notes: data.notes || '',
          createdAt: data.createdAt || new Date().toISOString()
        });
      }
    });
    
    // If collection was empty, check company doc snapshot
    if (cloudList.length === 0) {
      try {
        const compSnap = await withTimeout(getDoc(doc(firestoreDb, 'companies', 'nmsa')), 6000, 'Baca company NPWP');
        if (compSnap.exists()) {
          const compData = compSnap.data();
          if (compData && Array.isArray(compData.npwpRecords) && compData.npwpRecords.length > 0) {
            compData.npwpRecords.forEach((r: any) => {
              if (r && r.companyName && r.id && !delSet.has(r.id)) cloudList.push(r);
            });
          }
        }
      } catch (compErr) {
        console.warn('Fallback reading company doc NPWP:', compErr);
      }
    }

    let merged = mergeNpwpListsSafely(cloudList, localRecords, deletedList);

    // Tertiary fallback: check server endpoint if still empty
    if (merged.length === 0) {
      try {
        const srvRes = await fetch('/api/npwp/firebase-restore');
        if (srvRes.ok) {
          const srvData = await srvRes.json();
          if (srvData && Array.isArray(srvData.npwpRecords) && srvData.npwpRecords.length > 0) {
            merged = mergeNpwpListsSafely(srvData.npwpRecords, localRecords, deletedList);
          }
        }
      } catch {}
    }

    if (merged.length > 0) {
      localStorage.setItem('npwp_records_v1', JSON.stringify(merged));
    }
    return merged;
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    markFirestorePermissionDenied(error);
    markFirestoreInternalAssertion(error);
    if (!isFirestorePermissionError(error)) {
      console.warn('Gagal memuat data NPWP dari Firestore:', error);
    }
    return localRecords;
  }
};

// Real-time Cloud Firestore subscription for NPWP records
export const subscribeToNpwpRecordsFromFirestore = (
  onUpdate: (records: NpwpRecord[]) => void
): (() => void) => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) return () => {};
  try {
    const unsub = onSnapshot(collection(firestoreDb, 'npwp_records'), (snapshot) => {
      if (snapshot.empty && snapshot.metadata?.fromCache) {
        return;
      }
      const deletedList = getDeletedNpwpIds();
      const delSet = new Set(deletedList);
      const localRecords = readLocalNpwpBackup(delSet);

      if (snapshot.empty) {
        if (delSet.size > 0) {
          localStorage.setItem('npwp_records_v1', JSON.stringify(localRecords));
          onUpdate(localRecords);
        }
        return;
      }

      const list: NpwpRecord[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const docId = docSnap.id || data?.id;
        if (data && data.companyName && docId && !delSet.has(docId)) {
          list.push({
            id: docId,
            companyName: data.companyName,
            npwpNumber: data.npwpNumber || '',
            address: data.address || '',
            kppName: data.kppName || '',
            taxStatus: data.taxStatus || 'PKP',
            contactPerson: data.contactPerson || '',
            notes: data.notes || '',
            createdAt: data.createdAt || new Date().toISOString()
          });
        }
      });

      const merged = mergeNpwpListsSafely(list, localRecords, deletedList);
      localStorage.setItem('npwp_records_v1', JSON.stringify(merged));
      onUpdate(merged);
    }, (error) => {
      markFirestoreQuotaExceeded(error);
      markFirestorePermissionDenied(error);
      markFirestoreInternalAssertion(error);
      if (!isFirestorePermissionError(error)) {
        console.warn('Real-time listener notice for npwp_records:', error);
      }
    });
    return unsub;
  } catch (err) {
    markFirestoreInternalAssertion(err);
    console.warn('Failed to subscribe to npwp_records:', err);
    return () => {};
  }
};

// Save single NPWP record to Firestore (hemat kuota Spark Plan - hanya 1 penulisan dokumen spesifik)
export const saveSingleNpwpRecordToFirestore = async (record: NpwpRecord): Promise<void> => {
  if (!record || !record.id) return;

  // Hapus dari daftar tombstone jika record disimpan ulang
  try {
    const nextDeleted = getDeletedNpwpIds().filter((x) => x !== record.id);
    localStorage.setItem(DELETED_NPWP_KEY, JSON.stringify(nextDeleted));
  } catch (_) {}

  // 1. Update localStorage segera
  try {
    const stored = localStorage.getItem('npwp_records_v1');
    let list: NpwpRecord[] = stored ? JSON.parse(stored) : [];
    const idx = list.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...record, updatedAt: new Date().toISOString() };
    } else {
      list.unshift({ ...record, createdAt: record.createdAt || new Date().toISOString() });
    }
    localStorage.setItem('npwp_records_v1', JSON.stringify(list));

    // 2. Persist to server unified-storage
    fetch('/api/unified-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npwpRecords: list })
    }).catch(() => {});
  } catch (_) {}

  // 3. Write ONLY single document to Firestore (hanya 1 penulisan)
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return;
  const path = 'npwp_records';
  try {
    await setDoc(doc(firestoreDb, path, record.id), cleanUndefined(record), { merge: true });
    recordFirestoreWrites(1);
    console.log(`☁️ [NPWP Firestore] Dokumen NPWP "${record.companyName}" (${record.id}) berhasil disimpan ke Firestore.`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    markFirestorePermissionDenied(error);
    if (!isFirestorePermissionError(error)) {
      console.warn('Gagal menyimpan single NPWP ke Firestore:', error);
    }
  }
};

// Save all or single NPWP Record to Firestore & sync everywhere
export const saveNpwpRecordsToFirestore = async (records: NpwpRecord[]): Promise<void> => {
  try {
    localStorage.setItem('npwp_records_v1', JSON.stringify(records));
  } catch (e) {
    console.warn('Gagal menyimpan NPWP ke localStorage:', e);
  }

  // 1. Persist to server /api/unified-storage & /api/npwp/firebase-sync
  try {
    fetch('/api/unified-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npwpRecords: records })
    }).catch(() => {});
  } catch {}

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return;

  const path = 'npwp_records';
  try {
    // 2. Save records in npwp_records collection (batch for efficiency, breaks cleanly on first permission/quota error)
    const validRecords = (records || []).filter((r) => r && r.id);
    if (validRecords.length === 0) return;

    const batch = writeBatch(firestoreDb);
    validRecords.slice(0, 400).forEach((rec) => {
      batch.set(doc(firestoreDb!, path, rec.id), cleanUndefined(rec), { merge: true });
    });
    await batch.commit();
    recordFirestoreWrites(Math.min(validRecords.length, 400));
    console.log(`☁️ ${Math.min(validRecords.length, 400)} NPWP records synced to Firestore.`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    markFirestorePermissionDenied(error);
    if (!isFirestorePermissionError(error)) {
      console.warn('Gagal menyimpan NPWP ke Firestore:', error);
    }
  }
};


// Save Accurate Petty Cash Mappings to localStorage (Firestore writes disabled to conserve daily free quota)
export const saveAccurateMappingToFirestore = async (mappingData: any): Promise<void> => {
  const docId = mappingData.id || `acc-map-${Date.now()}`;
  const payload = {
    ...mappingData,
    id: docId,
    updatedAt: new Date().toISOString()
  };

  try {
    const existingRaw = localStorage.getItem('accurate_mapped_reports_v1');
    const existingList = existingRaw ? JSON.parse(existingRaw) : [];
    const updatedList = [payload, ...existingList.filter((item: any) => item.id !== docId)];
    localStorage.setItem('accurate_mapped_reports_v1', JSON.stringify(updatedList));
  } catch (e) {
    console.warn('Gagal menyimpan pemetaan Accurate ke localStorage:', e);
  }
};

// Delete Accurate Petty Cash Mapping from localStorage
export const deleteAccurateMappingFromFirestore = async (id: string): Promise<void> => {
  try {
    const stored = localStorage.getItem('accurate_mapped_reports_v1');
    if (stored) {
      const list = JSON.parse(stored);
      const filtered = list.filter((item: any) => item.id !== id);
      localStorage.setItem('accurate_mapped_reports_v1', JSON.stringify(filtered));
    }
  } catch (e) {
    console.warn('Gagal menghapus pemetaan Accurate dari localStorage:', e);
  }
};

// Load Accurate Petty Cash Mappings from localStorage
export const loadAccurateMappingsFromFirestore = async (): Promise<any[]> => {
  try {
    const stored = localStorage.getItem('accurate_mapped_reports_v1');
    const list = stored ? JSON.parse(stored) : [];
    list.sort((a: any, b: any) => {
      const timeA = new Date(a.updatedAt || a.savedAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.savedAt || 0).getTime();
      return timeB - timeA;
    });
    return list;
  } catch {
    return [];
  }
};

// Save Absen Harian NMSA records & weekly reports to localStorage (central attendance is in attendance/current_records)
export const saveAbsenDataToFirestore = async (absenData: any): Promise<void> => {
  const docId = absenData.id || `absen-${Date.now()}`;
  const payload = {
    ...absenData,
    id: docId,
    updatedAt: new Date().toISOString()
  };

  try {
    const stored = localStorage.getItem('absen_records_v1');
    const list = stored ? JSON.parse(stored) : [];
    const updated = [payload, ...list.filter((item: any) => item.id !== docId)];
    localStorage.setItem('absen_records_v1', JSON.stringify(updated));
  } catch (e) {
    console.warn('Gagal menyimpan data Absen ke localStorage:', e);
  }

  // NOTE: Penulisan dokumen individu ke 'absen_records' dinonaktifkan permanen
  // Data absensi master disimpan terpusat dan rapi di 'attendance/current_records' untuk menghemat kuota Firestore.
};

export interface CleanCollectionsResult {
  success: boolean;
  totalDeleted: number;
  details: { collection: string; count: number; error?: string }[];
  message: string;
}

/**
 * Membersihkan koleksi tak terpakai dari Firebase Firestore (absen_records, accurate_mappings, activity_logs, dll.)
 * Koleksi penting (submissions, attendance, npwp_records, companies, users) tetap aman 100%!
 */
export const cleanUnusedFirestoreCollections = async (
  onProgress?: (progressMsg: string) => void
): Promise<CleanCollectionsResult> => {
  if (!isFirebaseConfigured() || !firestoreDb) {
    return {
      success: false,
      totalDeleted: 0,
      details: [],
      message: 'Firebase belum terhubung atau belum diinisialisasi.'
    };
  }

  // Koleksi yang tidak diperlukan & aman untuk dibersihkan (JANGAN hapus internal_memos!)
  const TARGET_COLLECTIONS = [
    'absen_records',
    'accurate_mappings',
    'activity_logs',
    'office_config',
    'test'
  ];

  const details: { collection: string; count: number; error?: string }[] = [];
  let totalDeleted = 0;

  for (const collName of TARGET_COLLECTIONS) {
    if (onProgress) onProgress(`Memeriksa koleksi "${collName}" di Firebase...`);
    try {
      const collRef = collection(firestoreDb, collName);
      const snap = await getDocs(collRef);
      if (snap.empty) {
        details.push({ collection: collName, count: 0 });
        continue;
      }

      let deletedInColl = 0;
      const docsToDelete = snap.docs;
      if (onProgress) onProgress(`Menghapus ${docsToDelete.length} dokumen dalam "${collName}"...`);

      // Hapus dalam batch maksimal 400 dokumen
      const BATCH_SIZE = 400;
      for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
        const chunk = docsToDelete.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(firestoreDb);
        for (const docSnap of chunk) {
          batch.delete(docSnap.ref);
        }
        await batch.commit();
        deletedInColl += chunk.length;
      }

      totalDeleted += deletedInColl;
      details.push({ collection: collName, count: deletedInColl });
      if (onProgress) onProgress(`✓ Berhasil membersihkan ${deletedInColl} dokumen dari "${collName}".`);
    } catch (err: any) {
      console.warn(`Pemberitahuan saat membersihkan ${collName}:`, err);
      details.push({ collection: collName, count: 0, error: err?.message || String(err) });
    }
  }

  return {
    success: true,
    totalDeleted,
    details,
    message: totalDeleted > 0
      ? `Berhasil membersihkan ${totalDeleted} dokumen tak terpakai dari Firestore. Koleksi kosong akan otomatis hilang di Firebase Console.`
      : `Koleksi tak terpakai di Firestore sudah bersih dan kosong.`
  };
};

// Load Absen Harian NMSA records from Firestore
export const loadAbsenDataFromFirestore = async (): Promise<any[]> => {
  if (!isFirebaseConfigured() || !firestoreDb || !currentUser) {
    try {
      const stored = localStorage.getItem('absen_records_v1');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  try {
    const snapshot = await getDocs(collection(firestoreDb, 'absen_records'));
    const list: any[] = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data());
    });
    if (list.length > 0) {
      localStorage.setItem('absen_records_v1', JSON.stringify(list));
    }
    return list;
  } catch (error: any) {
    if (error?.code !== 'permission-denied' && !error?.message?.includes('insufficient permissions')) {
      console.warn('Gagal memuat data Absen dari Firestore:', error);
    }
    try {
      const stored = localStorage.getItem('absen_records_v1');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
};

const DELETED_NPWP_KEY = 'nmsa_deleted_npwp_ids';

export const getDeletedNpwpIds = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_NPWP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    }
  } catch (_) {}
  return [];
};

export const addDeletedNpwpId = (id: string): string[] => {
  const current = getDeletedNpwpIds();
  if (id && !current.includes(id)) current.push(id);
  const unique = Array.from(new Set(current)).slice(-300);
  try {
    localStorage.setItem(DELETED_NPWP_KEY, JSON.stringify(unique));
  } catch (_) {}
  return unique;
};

// Delete single NPWP record from Firestore
export const deleteNpwpRecordFromFirestore = async (id: string): Promise<void> => {
  const deletedIds = addDeletedNpwpId(id);
  try {
    const stored = localStorage.getItem('npwp_records_v1');
    if (stored) {
      const list = JSON.parse(stored);
      const remaining = list.filter((r: any) => r.id !== id);
      localStorage.setItem('npwp_records_v1', JSON.stringify(remaining));
      
      // Sync to server
      apiFetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npwpRecords: remaining, deletedNpwpIds: deletedIds })
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Gagal menghapus NPWP dari localStorage:', e);
  }

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return;
  try {
    await deleteDoc(doc(firestoreDb, 'npwp_records', id));
    recordFirestoreDeletes(1);
    console.log(`🗑️ [NPWP Firestore] Dokumen tunggal NPWP ${id} berhasil dihapus dari Firestore.`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    markFirestorePermissionDenied(error);
    if (!isFirestorePermissionError(error)) {
      console.warn('Gagal menghapus NPWP dari Firestore:', error);
    }
  }
};

// ═════════════════════════════════════════════════════════════════════
// 👥 MASTER LIST KARYAWAN FIRESTORE PERSISTENCE (HEMAT KUOTA & ANTI-HILANG)
// Menggunakan dokumen terdedikasi `attendance/workers_master` (selalu diizinkan
// oleh rules Firestore) serta sinkronisasi ke koleksi `workers` bila diizinkan.
// ═════════════════════════════════════════════════════════════════════

const DELETED_WORKERS_KEY = 'nmsa_deleted_worker_ids';

export const getDeletedWorkerIds = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_WORKERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    }
  } catch (_) {}
  return [];
};

export const saveDeletedWorkerIds = (ids: string[]): string[] => {
  const unique = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  try {
    localStorage.setItem(DELETED_WORKERS_KEY, JSON.stringify(unique));
  } catch (_) {}
  return unique;
};

export const addDeletedWorkerId = (workerId: string): string[] => {
  const current = getDeletedWorkerIds();
  if (!current.includes(workerId)) {
    current.push(workerId);
  }
  return saveDeletedWorkerIds(current);
};

export const removeDeletedWorkerId = (workerId: string): string[] => {
  const current = getDeletedWorkerIds().filter((id) => id !== workerId);
  return saveDeletedWorkerIds(current);
};

export const mergeWorkerListsSafely = (
  primaryList: Worker[] = [],
  secondaryList: Worker[] = [],
  deletedIds: string[] = []
): Worker[] => {
  const deletedSet = new Set((deletedIds || []).map(String));
  const map = new Map<string, Worker>();

  const upsert = (w: Worker) => {
    if (!w || !w.id || !w.name) return;
    const idStr = String(w.id).trim();
    if (!idStr || deletedSet.has(idStr)) return;
    const existing = map.get(idStr);
    if (!existing) {
      map.set(idStr, {
        ...w,
        id: idStr,
        role: w.role || 'Karyawan',
        isActive: w.isActive ?? true,
      });
    } else {
      const existingTs = Number(existing.updatedAt || 0);
      const incomingTs = Number(w.updatedAt || 0);
      if (incomingTs >= existingTs) {
        map.set(idStr, {
          ...existing,
          ...w,
          id: idStr,
          role: w.role || existing.role || 'Karyawan',
          isActive: w.isActive ?? existing.isActive ?? true,
          phoneNumber: w.phoneNumber || existing.phoneNumber,
          bankName: w.bankName || existing.bankName,
          bankAccount: w.bankAccount || existing.bankAccount,
        });
      } else {
        map.set(idStr, {
          ...w,
          ...existing,
          id: idStr,
          phoneNumber: existing.phoneNumber || w.phoneNumber,
          bankName: existing.bankName || w.bankName,
          bankAccount: existing.bankAccount || w.bankAccount,
        });
      }
    }
  };

  (secondaryList || []).forEach(upsert);
  (primaryList || []).forEach(upsert);

  const merged = Array.from(map.values());
  merged.sort((a, b) => (a.id || '').localeCompare(b.id || '', undefined, { numeric: true }));
  return merged;
};

export const saveWorkersListToFirestore = async (
  workersList: Worker[],
  deletedIdsOverride?: string[]
): Promise<boolean> => {
  const deletedIds = deletedIdsOverride !== undefined
    ? saveDeletedWorkerIds(deletedIdsOverride)
    : getDeletedWorkerIds();

  const cleanList = (workersList || []).filter((w) => w && w.id && w.name);

  try {
    localStorage.setItem('karyawan_uang_makan', JSON.stringify(cleanList));
    localStorage.setItem('workers_v1', JSON.stringify(cleanList));
    apiFetch('/api/unified-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workers: cleanList, deletedWorkerIds: deletedIds })
    }).catch(() => {});
  } catch (_) {}

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) {
    return false;
  }

  let savedToCloud = false;
  try {
    const payload = cleanUndefined({
      workers: cleanList,
      deletedWorkerIds: deletedIds,
      totalWorkers: cleanList.length,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(firestoreDb, 'attendance', 'workers_master'), payload, { merge: true });
    recordFirestoreWrites(1);
    savedToCloud = true;
    console.log(`☁️ [Workers Master Firestore] ${cleanList.length} karyawan berhasil disimpan permanen ke Firestore (attendance/workers_master).`);
  } catch (err: any) {
    markFirestoreQuotaExceeded(err);
    markFirestorePermissionDenied(err);
    if (!isFirestorePermissionError(err)) {
      console.warn('Notice menyimpan workers_master ke Firestore:', err?.message || err);
    }
  }

  return savedToCloud;
};

export const loadWorkersFromFirestore = async (): Promise<Worker[]> => {
  let cloudMasterWorkers: Worker[] = [];
  let cloudDiscreteWorkers: Worker[] = [];
  let cloudCurrentWorkers: Worker[] = [];
  let cloudDeletedIds: string[] = getDeletedWorkerIds();
  let hadMasterDoc = false;
  let masterReadOk = false;

  // 1. Coba baca dari Firestore (attendance/workers_master, attendance/current_records, dan koleksi workers)
  if (isFirebaseConfigured() && firestoreDb && hasAuthenticatedFirebaseUser() && !isFirestoreQuotaExceeded() && !isFirestorePermissionDenied()) {
    try {
      const masterSnap = await getDoc(doc(firestoreDb, 'attendance', 'workers_master'));
      masterReadOk = true;
      recordFirestoreReads(1);
      if (masterSnap.exists()) {
        hadMasterDoc = true;
        const mData = masterSnap.data();
        if (Array.isArray(mData?.workers)) {
          cloudMasterWorkers = mData.workers;
        }
        if (Array.isArray(mData?.deletedWorkerIds)) {
          cloudDeletedIds = saveDeletedWorkerIds([...cloudDeletedIds, ...mData.deletedWorkerIds]);
        }
      }
    } catch (err: any) {
      markFirestoreQuotaExceeded(err);
      markFirestorePermissionDenied(err);
    }

    // Baca koleksi 'workers' (opsional - tidak error jika rules hanya membuka /attendance)
    if (!isFirestoreQuotaExceeded() && !isFirestorePermissionDenied()) {
      try {
        const snap = await getDocs(collection(firestoreDb, 'workers'));
        if (!snap.empty) {
          recordFirestoreReads(snap.size);
          snap.forEach(d => {
            const data = d.data() as Worker;
            if (data && (data.id || d.id) && data.name) {
              cloudDiscreteWorkers.push({
                id: data.id || d.id,
                name: data.name,
                role: data.role || 'Karyawan',
                isActive: data.isActive ?? true,
                division: data.division,
                bankName: data.bankName,
                bankAccount: data.bankAccount,
                phoneNumber: data.phoneNumber,
                nik: data.nik,
                photoUrl: data.photoUrl,
                updatedAt: data.updatedAt
              });
            }
          });
        }
      } catch (err: any) {
        const msg = String(err?.message || err?.code || '');
        if (!isFirestorePermissionError(err)) {
          markFirestoreQuotaExceeded(err);
          console.warn('Notice membaca koleksi workers:', msg);
        }
      }
    }

    // Jika workers_master belum ada atau kosong, baca juga dari attendance/current_records.workers
    if (cloudMasterWorkers.length === 0 && !isFirestoreQuotaExceeded() && !isFirestorePermissionDenied()) {
      try {
        const curSnap = await getDoc(doc(firestoreDb, 'attendance', 'current_records'));
        recordFirestoreReads(1);
        if (curSnap.exists()) {
          const cData = curSnap.data();
          if (Array.isArray(cData?.workers)) {
            cloudCurrentWorkers = cData.workers;
          }
        }
      } catch (err: any) {
        markFirestoreQuotaExceeded(err);
        markFirestorePermissionDenied(err);
      }
    }
  }

  // Gabungkan semua sumber Firestore dengan aman
  const combinedCloud = mergeWorkerListsSafely(
    cloudMasterWorkers,
    mergeWorkerListsSafely(cloudDiscreteWorkers, cloudCurrentWorkers, cloudDeletedIds),
    cloudDeletedIds
  );

  if (combinedCloud.length > 0) {
    // Jika local memiliki worker baru yang belum tersinkron, gabungkan tanpa menghilangkan data cloud
    let localWorkers: Worker[] = [];
    try {
      const localRaw = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
      if (localRaw) {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed)) localWorkers = parsed;
      }
    } catch (_) {}

    const finalWorkers = mergeWorkerListsSafely(combinedCloud, localWorkers, cloudDeletedIds);

    try {
      localStorage.setItem('karyawan_uang_makan', JSON.stringify(finalWorkers));
      localStorage.setItem('workers_v1', JSON.stringify(finalWorkers));
      apiFetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers: finalWorkers, deletedWorkerIds: cloudDeletedIds })
      }).catch(() => {});
    } catch (_) {}

    // Otomatis seed attendance/workers_master hanya jika pembacaan master berhasil & memang belum pernah ada doc-nya
    if (masterReadOk && !hadMasterDoc && hasAuthenticatedFirebaseUser() && isFirebaseConfigured() && firestoreDb && !isFirestoreQuotaExceeded() && !isFirestorePermissionDenied()) {
      saveWorkersListToFirestore(finalWorkers, cloudDeletedIds).catch(() => {});
    }

    console.log(`☁️ [Workers Firestore] Berhasil memuat ${finalWorkers.length} karyawan dari Cloud Firestore.`);
    return finalWorkers;
  }

  // 2. Fallback: baca dari server unified-storage (/api/unified-storage)
  try {
    const srvRes = await apiFetch('/api/unified-storage');
    if (srvRes.ok) {
      const srvData = await srvRes.json();
      const serverWorkers = srvData?.raw?.workers || srvData?.workers;
      if (Array.isArray(serverWorkers) && serverWorkers.length > 0) {
        const cleanSrv = mergeWorkerListsSafely(serverWorkers, [], cloudDeletedIds);
        localStorage.setItem('karyawan_uang_makan', JSON.stringify(cleanSrv));
        localStorage.setItem('workers_v1', JSON.stringify(cleanSrv));
        return cleanSrv;
      }
    }
  } catch (_) {}

  // 3. Fallback: cek localStorage browser
  try {
    const local = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return mergeWorkerListsSafely(parsed, [], cloudDeletedIds);
      }
    }
  } catch (_) {}

  // 4. Default: kembalikan INITIAL_WORKERS (kecuali yang sudah dihapus)
  return mergeWorkerListsSafely(INITIAL_WORKERS, [], cloudDeletedIds);
};

export const subscribeToWorkersMasterFromFirestore = (
  onUpdate: (workers: Worker[], deletedIds: string[]) => void
): (() => void) => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) {
    return () => {};
  }
  try {
    return onSnapshot(
      doc(firestoreDb, 'attendance', 'workers_master'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const cloudWorkers = Array.isArray(data?.workers) ? (data.workers as Worker[]) : [];
        const cloudDeleted = Array.isArray(data?.deletedWorkerIds)
          ? saveDeletedWorkerIds([...getDeletedWorkerIds(), ...data.deletedWorkerIds])
          : getDeletedWorkerIds();
        if (cloudWorkers.length > 0) {
          onUpdate(cloudWorkers, cloudDeleted);
        }
      },
      (err) => {
        markFirestoreQuotaExceeded(err);
        markFirestorePermissionDenied(err);
        markFirestoreInternalAssertion(err);
      }
    );
  } catch (err) {
    markFirestoreInternalAssertion(err);
    return () => {};
  }
};

export const saveWorkerToFirestore = async (worker: Worker): Promise<boolean> => {
  if (!worker || !worker.id) return false;

  const updatedWorker: Worker = { ...worker, updatedAt: worker.updatedAt || Date.now() };
  const deletedIds = removeDeletedWorkerId(updatedWorker.id);

  // 1. Simpan ke localStorage & unified-storage segera
  let updatedList: Worker[] = [];
  try {
    const stored = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
    const existingList: Worker[] = stored ? JSON.parse(stored) : [];
    updatedList = mergeWorkerListsSafely([updatedWorker], existingList, deletedIds);
    localStorage.setItem('karyawan_uang_makan', JSON.stringify(updatedList));
    localStorage.setItem('workers_v1', JSON.stringify(updatedList));

    apiFetch('/api/unified-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workers: updatedList, deletedWorkerIds: deletedIds })
    }).catch(() => {});
  } catch (_) {
    updatedList = [updatedWorker];
  }

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) {
    return false;
  }

  let saved = false;

  // 2. Simpan ke attendance/workers_master (utama & selalu diizinkan oleh rules Firestore)
  try {
    const masterPayload = cleanUndefined({
      workers: updatedList,
      deletedWorkerIds: deletedIds,
      totalWorkers: updatedList.length,
      updatedAt: new Date().toISOString()
    });
    await setDoc(doc(firestoreDb, 'attendance', 'workers_master'), masterPayload, { merge: true });
    recordFirestoreWrites(1);
    saved = true;
    console.log(`☁️ [Worker Firestore] Karyawan "${updatedWorker.name}" (${updatedWorker.id}) tersimpan ke Firestore (workers_master).`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    markFirestorePermissionDenied(error);
    if (!isFirestorePermissionError(error)) {
      console.warn(`Gagal menyimpan workers_master untuk ${updatedWorker.id}:`, error);
    }
    return false;
  }

  // 3. Simpan juga ke koleksi 'workers/{id}' jika workers_master berhasil
  if (saved && !isFirestorePermissionDenied()) {
    try {
      const cleanWorker = cleanUndefined(updatedWorker);
      await setDoc(doc(firestoreDb, 'workers', updatedWorker.id), cleanWorker, { merge: true });
      recordFirestoreWrites(1);
    } catch (error: any) {
      if (!isFirestorePermissionError(error)) {
        markFirestoreQuotaExceeded(error);
      }
    }
  }

  return saved;
};

export const deleteWorkerFromFirestore = async (workerId: string): Promise<boolean> => {
  if (!workerId) return false;

  const deletedIds = addDeletedWorkerId(workerId);

  // 1. Hapus dari localStorage & unified-storage segera
  let remaining: Worker[] = [];
  try {
    const stored = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
    if (stored) {
      const list: Worker[] = JSON.parse(stored);
      remaining = list.filter(w => w.id !== workerId);
      localStorage.setItem('karyawan_uang_makan', JSON.stringify(remaining));
      localStorage.setItem('workers_v1', JSON.stringify(remaining));

      apiFetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers: remaining, deletedWorkerIds: deletedIds })
      }).catch(() => {});
    }
  } catch (_) {}

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) {
    return false;
  }

  let deleted = false;

  // 2. Perbarui attendance/workers_master dengan daftar terbaru & tombstone deletedWorkerIds
  try {
    await setDoc(doc(firestoreDb, 'attendance', 'workers_master'), cleanUndefined({
      workers: remaining,
      deletedWorkerIds: deletedIds,
      totalWorkers: remaining.length,
      updatedAt: new Date().toISOString()
    }), { merge: true });
    recordFirestoreWrites(1);
    deleted = true;
    console.log(`🗑️ [Worker Firestore] Karyawan ${workerId} dihapus & dicatat di Firestore (workers_master).`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    markFirestorePermissionDenied(error);
    if (!isFirestorePermissionError(error)) {
      console.warn(`Gagal memperbarui workers_master saat hapus ${workerId}:`, error);
    }
    return false;
  }

  // 3. Hapus dokumen tunggal di koleksi 'workers' bila diizinkan
  if (deleted && !isFirestorePermissionDenied()) {
    try {
      await deleteDoc(doc(firestoreDb, 'workers', workerId));
      recordFirestoreDeletes(1);
    } catch (error: any) {
      if (!isFirestorePermissionError(error)) {
        markFirestoreQuotaExceeded(error);
      }
    }
  }

  return deleted;
};


// Load SPPD (Surat Perintah Perjalanan Dinas) records from localStorage
export const loadSppdRecordsFromFirestore = async (): Promise<any[]> => {
  try {
    const stored = localStorage.getItem('sppd_records_v1');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save SPPD Records to localStorage & server backup (Firestore writes disabled to conserve quota)
export const saveSppdRecordsToFirestore = async (records: any[]): Promise<void> => {
  try {
    localStorage.setItem('sppd_records_v1', JSON.stringify(records));
    // Persist to server unified-storage
    fetch('/api/unified-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sppdRecords: records })
    }).catch(() => {});
  } catch (e) {
    console.warn('Gagal menyimpan SPPD ke localStorage:', e);
  }
};

// Delete single SPPD record from localStorage & server
export const deleteSppdRecordFromFirestore = async (id: string): Promise<void> => {
  try {
    const stored = localStorage.getItem('sppd_records_v1');
    if (stored) {
      const list = JSON.parse(stored);
      const filtered = list.filter((item: any) => item.id !== id);
      localStorage.setItem('sppd_records_v1', JSON.stringify(filtered));
      fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sppdRecords: filtered })
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Gagal menghapus SPPD dari localStorage:', e);
  }
};

// Set stored config dynamically (allows pasting from UI setting panel)
export const saveAndInitializeFirebaseConfig = (config: any): boolean => {
  if (!config || !config.apiKey || !config.projectId) {
    localStorage.removeItem('NUSANTARA_FIREBASE_CONFIG');
    localStorage.removeItem('NUSANTARA_CUSTOM_CONFIG_MANUAL');
    firebaseApp = null;
    firestoreDb = null;
    firebaseAuth = null;
    return false;
  }

  localStorage.setItem('NUSANTARA_FIREBASE_CONFIG', JSON.stringify(config));
  if (config.projectId === PERMANENT_LOCKED_FIREBASE_CONFIG.projectId) {
    localStorage.removeItem('NUSANTARA_CUSTOM_CONFIG_MANUAL');
  } else {
    localStorage.setItem('NUSANTARA_CUSTOM_CONFIG_MANUAL', 'true');
  }
  return initializeFirebaseApp(config);
};

// Clear config to disconnect custom Firebase and revert to official config
export const clearFirebaseConfig = () => {
  localStorage.removeItem('NUSANTARA_FIREBASE_CONFIG');
  localStorage.removeItem('NUSANTARA_CUSTOM_CONFIG_MANUAL');
  firebaseApp = null;
  firestoreDb = null;
  firebaseAuth = null;
};

// --- Internal Memo Cloud Firestore + Local + Server Sync Methods ---
const STORAGE_KEY_INTERNAL_MEMOS = 'nmsa_internal_memos_v1';
const DELETED_MEMO_IDS_KEY = 'nmsa_deleted_internal_memo_ids';
const MEMO_MASTER_DOC_ID = 'internal_memos_master';

export const getDeletedInternalMemoIds = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_MEMO_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    }
  } catch (_) {}
  return [];
};

export const saveDeletedInternalMemoIds = (ids: string[]): string[] => {
  const unique = Array.from(new Set((ids || []).map(String).filter(Boolean))).slice(-300);
  try {
    localStorage.setItem(DELETED_MEMO_IDS_KEY, JSON.stringify(unique));
  } catch (_) {}
  return unique;
};

const addDeletedInternalMemoId = (id: string): string[] => {
  const list = getDeletedInternalMemoIds();
  if (id && !list.includes(id)) list.push(id);
  return saveDeletedInternalMemoIds(list);
};

const removeDeletedInternalMemoId = (id: string): string[] => {
  return saveDeletedInternalMemoIds(getDeletedInternalMemoIds().filter((x) => x !== id));
};

const sanitizeMemoForMasterDoc = (memo: InternalMemo): any => {
  return cleanUndefined({
    ...memo,
    // Hindari blob data URL besar agar master doc tidak melebihi batas 1MB Firestore
    signedDocumentUrl:
      memo.signedDocumentUrl && memo.signedDocumentUrl.startsWith('data:') && memo.signedDocumentUrl.length > 50000
        ? undefined
        : memo.signedDocumentUrl,
  });
};

const mergeMemoListsSafely = (
  lists: InternalMemo[][],
  deletedIds: string[] = []
): InternalMemo[] => {
  const delSet = new Set(deletedIds.map(String));
  const map = new Map<string, InternalMemo>();
  lists.forEach((arr) => {
    (arr || []).forEach((m) => {
      if (!m || !m.id || delSet.has(String(m.id))) return;
      const existing = map.get(m.id);
      if (!existing) {
        map.set(m.id, m);
      } else {
        const existingTs = new Date(existing.updatedAt || existing.createdAt || existing.tanggal || 0).getTime();
        const incomingTs = new Date(m.updatedAt || m.createdAt || m.tanggal || 0).getTime();
        if (incomingTs >= existingTs) {
          map.set(m.id, {
            ...existing,
            ...m,
            driveUrl: m.driveUrl || existing.driveUrl,
            driveFileId: m.driveFileId || existing.driveFileId,
            driveFolderPath: m.driveFolderPath || existing.driveFolderPath,
            signedDriveUrl: m.signedDriveUrl || existing.signedDriveUrl,
          });
        } else {
          map.set(m.id, {
            ...m,
            ...existing,
            driveUrl: existing.driveUrl || m.driveUrl,
            driveFileId: existing.driveFileId || m.driveFileId,
            driveFolderPath: existing.driveFolderPath || m.driveFolderPath,
            signedDriveUrl: existing.signedDriveUrl || m.signedDriveUrl,
          });
        }
      }
    });
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt || b.tanggal || 0).getTime() - new Date(a.createdAt || a.tanggal || 0).getTime()
  );
};

const writeMemoMasterFallbackDoc = async (memosList: InternalMemo[], deletedIds: string[]): Promise<boolean> => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return false;
  try {
    const compactMemos = memosList.slice(0, 150).map(sanitizeMemoForMasterDoc);
    await setDoc(
      doc(firestoreDb, 'attendance', MEMO_MASTER_DOC_ID),
      cleanUndefined({
        memos: compactMemos,
        deletedMemoIds: deletedIds.slice(-200),
        totalMemos: compactMemos.length,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
    recordFirestoreWrites(1);
    return true;
  } catch (err: any) {
    markFirestoreQuotaExceeded(err);
    markFirestorePermissionDenied(err);
    if (!isFirestorePermissionError(err)) {
      console.warn('⚠️ Notice menulis attendance/internal_memos_master:', err?.message || err);
    }
    return false;
  }
};

export const saveInternalMemoToFirestore = async (memo: InternalMemo): Promise<void> => {
  if (!memo || !memo.id) return;
  const deletedIds = removeDeletedInternalMemoId(memo.id);

  let updatedLocal: InternalMemo[] = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_INTERNAL_MEMOS);
    const list: InternalMemo[] = stored ? JSON.parse(stored) : [];
    updatedLocal = [memo, ...list.filter((m) => m && m.id !== memo.id)];
    localStorage.setItem(STORAGE_KEY_INTERNAL_MEMOS, JSON.stringify(updatedLocal));
  } catch (err) {
    console.warn('Failed to save internal memo locally:', err);
  }

  try {
    apiFetch('/api/internal-memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo }),
    }).catch(() => {});
  } catch (_) {}

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return;

  let savedCollection = false;
  try {
    const docId = sanitizeFirestoreDocId(memo.id);
    await setDoc(doc(firestoreDb, 'internal_memos', docId), cleanUndefined(memo), { merge: true });
    recordFirestoreWrites(1);
    savedCollection = true;
    console.log(`☁️ [Internal Memo Firestore] Memo ${memo.nomorMemo} (${docId}) tersimpan ke Cloud Firestore.`);
  } catch (err: any) {
    const msg = String(err?.code || err?.message || '');
    if (isFirestorePermissionError(err)) {
      console.warn('⚠️ Koleksi internal_memos masih diblokir rules lama, mencoba fallback attendance/internal_memos_master...');
    } else {
      markFirestoreQuotaExceeded(err);
      console.warn('⚠️ Gagal menyimpan memo ke koleksi internal_memos:', msg);
    }
  }

  // Fallback langsung ke dokumen master di koleksi attendance (jika tidak sedang dalam cooldown global permission)
  if (!savedCollection && !isFirestorePermissionDenied()) {
    await writeMemoMasterFallbackDoc(updatedLocal.length > 0 ? updatedLocal : [memo], deletedIds);
  }
};

export const getInternalMemosFromFirestore = async (): Promise<InternalMemo[]> => {
  let localList: InternalMemo[] = [];
  let deletedIds = getDeletedInternalMemoIds();
  try {
    const stored = localStorage.getItem(STORAGE_KEY_INTERNAL_MEMOS);
    localList = stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.warn('Failed to read internal memos locally:', err);
  }

  const sources: InternalMemo[][] = [];

  // 1. Baca dari Cloud Firestore (koleksi internal_memos & attendance/internal_memos_master)
  if (isFirebaseConfigured() && firestoreDb && hasAuthenticatedFirebaseUser() && !isFirestoreQuotaExceeded() && !isFirestorePermissionDenied()) {
    try {
      const masterSnap = await getDoc(doc(firestoreDb, 'attendance', MEMO_MASTER_DOC_ID));
      recordFirestoreReads(1);
      if (masterSnap.exists()) {
        const mData = masterSnap.data() || {};
        if (Array.isArray(mData.deletedMemoIds)) {
          deletedIds = saveDeletedInternalMemoIds([...deletedIds, ...mData.deletedMemoIds]);
        }
        if (Array.isArray(mData.memos) && mData.memos.length > 0) {
          sources.push(mData.memos);
        }
      }
    } catch (err: any) {
      markFirestoreQuotaExceeded(err);
      markFirestorePermissionDenied(err);
    }

    if (!isFirestorePermissionDenied() && !isFirestoreQuotaExceeded()) {
      try {
        const snap = await getDocs(collection(firestoreDb, 'internal_memos'));
        if (!snap.empty) {
          recordFirestoreReads(snap.size);
          const fsList: InternalMemo[] = [];
          snap.forEach((d) => {
            const data = d.data() as InternalMemo;
            if (data && (data.id || d.id)) {
              fsList.push({ ...data, id: data.id || d.id });
            }
          });
          if (fsList.length > 0) sources.push(fsList);
        }
      } catch (err: any) {
        if (!isFirestorePermissionError(err)) {
          markFirestoreQuotaExceeded(err);
        }
      }
    }
  }

  // 2. Baca juga dari server endpoint (/api/internal-memos)
  try {
    const res = await apiFetch('/api/internal-memos');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.deletedMemoIds)) {
        deletedIds = saveDeletedInternalMemoIds([...deletedIds, ...data.deletedMemoIds]);
      }
      const serverList: InternalMemo[] = Array.isArray(data?.memos)
        ? data.memos
        : Array.isArray(data)
        ? data
        : [];
      if (serverList.length > 0) sources.push(serverList);
    }
  } catch (_) {}

  sources.push(localList);
  const merged = mergeMemoListsSafely(sources, deletedIds);

  try {
    localStorage.setItem(STORAGE_KEY_INTERNAL_MEMOS, JSON.stringify(merged));
  } catch (_) {}

  return merged;
};

export const subscribeToInternalMemosFromFirestore = (
  onUpdate: (memos: InternalMemo[]) => void
): (() => void) => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) {
    return () => {};
  }

  const unsubs: Array<() => void> = [];
  let latestCollectionMemos: InternalMemo[] = [];
  let latestMasterMemos: InternalMemo[] = [];

  const emitMerged = () => {
    let localList: InternalMemo[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_INTERNAL_MEMOS);
      localList = raw ? JSON.parse(raw) : [];
    } catch (_) {}
    const deletedIds = getDeletedInternalMemoIds();
    const merged = mergeMemoListsSafely([latestCollectionMemos, latestMasterMemos, localList], deletedIds);
    try {
      localStorage.setItem(STORAGE_KEY_INTERNAL_MEMOS, JSON.stringify(merged));
    } catch (_) {}
    onUpdate(merged);
  };

  try {
    const unsubMaster = onSnapshot(
      doc(firestoreDb, 'attendance', MEMO_MASTER_DOC_ID),
      (snap) => {
        recordFirestoreReads(1);
        if (!snap.exists()) return;
        const data = snap.data() || {};
        if (Array.isArray(data.deletedMemoIds)) {
          saveDeletedInternalMemoIds([...getDeletedInternalMemoIds(), ...data.deletedMemoIds]);
        }
        latestMasterMemos = Array.isArray(data.memos) ? data.memos : [];
        emitMerged();
      },
      (err: any) => {
        markFirestoreQuotaExceeded(err);
        markFirestorePermissionDenied(err);
      }
    );
    unsubs.push(unsubMaster);
  } catch (_) {}

  try {
    const unsubColl = onSnapshot(
      collection(firestoreDb, 'internal_memos'),
      (snap) => {
        recordFirestoreReads(Math.max(1, snap.size));
        const list: InternalMemo[] = [];
        snap.forEach((d) => {
          const data = d.data() as InternalMemo;
          if (data && (data.id || d.id)) {
            list.push({ ...data, id: data.id || d.id });
          }
        });
        latestCollectionMemos = list;
        emitMerged();
      },
      (err: any) => {
        if (!isFirestorePermissionError(err)) {
          markFirestoreQuotaExceeded(err);
        }
      }
    );
    unsubs.push(unsubColl);
  } catch (_) {}

  return () => {
    unsubs.forEach((u) => {
      try { u(); } catch (_) {}
    });
  };
};

export const deleteInternalMemoFromFirestore = async (id: string): Promise<void> => {
  if (!id) return;
  const deletedIds = addDeletedInternalMemoId(id);

  let remaining: InternalMemo[] = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY_INTERNAL_MEMOS);
    if (stored) {
      const list: InternalMemo[] = JSON.parse(stored);
      remaining = list.filter((m) => m && m.id !== id);
      localStorage.setItem(STORAGE_KEY_INTERNAL_MEMOS, JSON.stringify(remaining));
    }
  } catch (err) {
    console.warn('Failed to delete internal memo locally:', err);
  }

  try {
    apiFetch(`/api/internal-memos/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  } catch (_) {}

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return;

  try {
    await deleteDoc(doc(firestoreDb, 'internal_memos', sanitizeFirestoreDocId(id)));
    recordFirestoreDeletes(1);
  } catch (err: any) {
    if (!isFirestorePermissionError(err)) {
      markFirestoreQuotaExceeded(err);
    }
  }

  // Perbarui master doc agar penghapusan langsung tersinkron ke perangkat lain
  if (!isFirestorePermissionDenied()) {
    await writeMemoMasterFallbackDoc(remaining, deletedIds).catch(() => {});
  }
};

// --- Employee Loans Cloud Firestore + Local + Server Sync Methods ---
const STORAGE_KEY_EMPLOYEE_LOANS_SYNC = 'nmsa_employee_loans_v1';
const DELETED_LOAN_IDS_KEY = 'nmsa_deleted_employee_loan_ids';
const LOANS_MASTER_DOC_ID = 'employee_loans_master';

export const getDeletedLoanIds = (): string[] => {
  try {
    const raw = localStorage.getItem(DELETED_LOAN_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    }
  } catch (_) {}
  return [];
};

export const saveDeletedLoanIds = (ids: string[]): string[] => {
  const unique = Array.from(new Set((ids || []).map(String).filter(Boolean))).slice(-300);
  try {
    localStorage.setItem(DELETED_LOAN_IDS_KEY, JSON.stringify(unique));
  } catch (_) {}
  return unique;
};

export const addDeletedLoanId = (loanId: string): string[] => {
  const current = getDeletedLoanIds();
  if (loanId && !current.includes(loanId)) current.push(loanId);
  return saveDeletedLoanIds(current);
};

export const mergeEmployeeLoansSafely = (
  lists: EmployeeLoan[][],
  deletedIds: string[] = []
): EmployeeLoan[] => {
  const delSet = new Set(deletedIds.map(String));
  const map = new Map<string, EmployeeLoan>();
  lists.forEach((arr) => {
    (arr || []).forEach((loan) => {
      if (!loan || !loan.id || delSet.has(String(loan.id))) return;
      const existing = map.get(loan.id);
      if (!existing) {
        map.set(loan.id, loan);
      } else {
        const existingTs = new Date(existing.updatedAt || existing.createdAt || existing.tanggalPermohonan || 0).getTime();
        const incomingTs = new Date(loan.updatedAt || loan.createdAt || loan.tanggalPermohonan || 0).getTime();
        if (incomingTs >= existingTs) {
          map.set(loan.id, {
            ...existing,
            ...loan,
            driveUrl: loan.driveUrl || existing.driveUrl,
            driveFileId: loan.driveFileId || existing.driveFileId,
            driveFolderPath: loan.driveFolderPath || existing.driveFolderPath,
          });
        } else {
          map.set(loan.id, {
            ...loan,
            ...existing,
            driveUrl: existing.driveUrl || loan.driveUrl,
            driveFileId: existing.driveFileId || loan.driveFileId,
            driveFolderPath: existing.driveFolderPath || loan.driveFolderPath,
          });
        }
      }
    });
  });
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt || b.tanggalPermohonan || 0).getTime() - new Date(a.createdAt || a.tanggalPermohonan || 0).getTime()
  );
};

const writeLoansMasterDoc = async (loansList: EmployeeLoan[], deletedIds: string[]): Promise<boolean> => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return false;
  try {
    const cleanLoans = cleanUndefined(loansList.slice(0, 200));
    await setDoc(
      doc(firestoreDb, 'attendance', LOANS_MASTER_DOC_ID),
      {
        employeeLoans: cleanLoans,
        deletedLoanIds: deletedIds.slice(-200),
        totalLoans: cleanLoans.length,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    recordFirestoreWrites(1);
    return true;
  } catch (err: any) {
    markFirestoreQuotaExceeded(err);
    markFirestorePermissionDenied(err);
    if (!isFirestorePermissionError(err)) {
      console.warn('⚠️ Notice menyimpan attendance/employee_loans_master:', err?.message || err);
    }
    return false;
  }
};

export const loadEmployeeLoansFromFirestore = async (): Promise<EmployeeLoan[] | null> => {
  let localList: EmployeeLoan[] = [];
  let deletedIds = getDeletedLoanIds();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC);
    if (raw) localList = JSON.parse(raw);
  } catch (_) {}

  const sources: EmployeeLoan[][] = [];

  if (isFirebaseConfigured() && firestoreDb && hasAuthenticatedFirebaseUser() && !isFirestoreQuotaExceeded() && !isFirestorePermissionDenied()) {
    try {
      const masterSnap = await getDoc(doc(firestoreDb, 'attendance', LOANS_MASTER_DOC_ID));
      recordFirestoreReads(1);
      if (masterSnap.exists()) {
        const mData = masterSnap.data() || {};
        if (Array.isArray(mData.deletedLoanIds)) {
          deletedIds = saveDeletedLoanIds([...deletedIds, ...mData.deletedLoanIds]);
        }
        if (Array.isArray(mData.employeeLoans) && mData.employeeLoans.length > 0) {
          sources.push(mData.employeeLoans);
        }
      }
    } catch (err: any) {
      markFirestoreQuotaExceeded(err);
      markFirestorePermissionDenied(err);
    }

    if (!isFirestorePermissionDenied() && !isFirestoreQuotaExceeded()) {
      try {
        const snap = await getDocs(collection(firestoreDb, 'employee_loans'));
        if (!snap.empty) {
          recordFirestoreReads(snap.size);
          const fsLoans: EmployeeLoan[] = [];
          snap.forEach((d) => {
            const data = d.data() as EmployeeLoan;
            if (data && (data.id || d.id)) {
              fsLoans.push({ ...data, id: data.id || d.id });
            }
          });
          if (fsLoans.length > 0) sources.push(fsLoans);
        }
      } catch (err: any) {
        if (!isFirestorePermissionError(err)) {
          markFirestoreQuotaExceeded(err);
        }
      }
    }
  }

  try {
    const res = await apiFetch('/api/unified-storage');
    if (res.ok) {
      const srv = await res.json();
      if (Array.isArray(srv?.deletedLoanIds)) {
        deletedIds = saveDeletedLoanIds([...deletedIds, ...srv.deletedLoanIds]);
      }
      const srvLoans = srv?.employeeLoans || srv?.raw?.employeeLoans;
      if (Array.isArray(srvLoans) && srvLoans.length > 0) {
        sources.push(srvLoans);
      }
    }
  } catch (_) {}

  if (sources.length === 0 && localList.length === 0) return null;
  sources.push(localList);
  const merged = mergeEmployeeLoansSafely(sources, deletedIds);
  try {
    localStorage.setItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC, JSON.stringify(merged));
  } catch (_) {}
  return merged;
};

export const saveSingleEmployeeLoanToFirestore = async (loan: EmployeeLoan): Promise<boolean> => {
  if (!loan || !loan.id) return false;
  const deletedIds = saveDeletedLoanIds(getDeletedLoanIds().filter((x) => x !== loan.id));

  let updatedLocal: EmployeeLoan[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC);
    const list: EmployeeLoan[] = raw ? JSON.parse(raw) : [];
    updatedLocal = [loan, ...list.filter((l) => l && l.id !== loan.id)];
    localStorage.setItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC, JSON.stringify(updatedLocal));
  } catch (_) {}

  apiFetch('/api/employee-loans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loan, deletedLoanIds: deletedIds }),
  }).catch(() => {});

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return false;

  // Simpan master doc terlebih dahulu agar aman; baru simpan dokumen per item jika tidak ditolak rules
  const savedMaster = await writeLoansMasterDoc(updatedLocal.length > 0 ? updatedLocal : [loan], deletedIds);

  let savedDoc = false;
  if (!isFirestorePermissionDenied() && !isFirestoreQuotaExceeded()) {
    try {
      await setDoc(doc(firestoreDb, 'employee_loans', sanitizeFirestoreDocId(loan.id)), cleanUndefined(loan), { merge: true });
      recordFirestoreWrites(1);
      savedDoc = true;
    } catch (err: any) {
      if (!isFirestorePermissionError(err)) {
        markFirestoreQuotaExceeded(err);
      }
    }
  }

  return savedDoc || savedMaster;
};

export const saveEmployeeLoansToFirestore = async (
  loansList: EmployeeLoan[],
  deletedIdsOverride?: string[]
): Promise<boolean> => {
  const deletedIds = deletedIdsOverride !== undefined
    ? saveDeletedLoanIds(deletedIdsOverride)
    : getDeletedLoanIds();

  const delSet = new Set(deletedIds.map(String));
  const cleanList = (loansList || []).filter((l) => l && l.id && !delSet.has(String(l.id)));

  try {
    localStorage.setItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC, JSON.stringify(cleanList));
  } catch (_) {}

  apiFetch('/api/unified-storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeLoans: cleanList, deletedLoanIds: deletedIds }),
  }).catch(() => {});

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return false;

  const savedMaster = await writeLoansMasterDoc(cleanList, deletedIds);
  if (!savedMaster || isFirestorePermissionDenied() || isFirestoreQuotaExceeded()) {
    return savedMaster;
  }

  // Sync per-document juga jika rules mengizinkan
  try {
    const batch = writeBatch(firestoreDb);
    cleanList.slice(0, 100).forEach((l) => {
      batch.set(doc(firestoreDb!, 'employee_loans', sanitizeFirestoreDocId(l.id)), cleanUndefined(l), { merge: true });
    });
    await batch.commit();
    recordFirestoreWrites(cleanList.slice(0, 100).length);
  } catch (err: any) {
    if (!isFirestorePermissionError(err)) {
      markFirestoreQuotaExceeded(err);
    }
  }

  return savedMaster;
};

export const deleteEmployeeLoanFromFirestore = async (loanId: string): Promise<boolean> => {
  if (!loanId) return false;
  const deletedIds = addDeletedLoanId(loanId);

  let remaining: EmployeeLoan[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC);
    if (raw) {
      const list: EmployeeLoan[] = JSON.parse(raw);
      remaining = list.filter((l) => l && l.id !== loanId);
      localStorage.setItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC, JSON.stringify(remaining));
    }
  } catch (_) {}

  apiFetch(`/api/employee-loans/${encodeURIComponent(loanId)}`, { method: 'DELETE' }).catch(() => {});

  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) return false;

  const savedMaster = await writeLoansMasterDoc(remaining, deletedIds);
  if (savedMaster && !isFirestorePermissionDenied() && !isFirestoreQuotaExceeded()) {
    try {
      await deleteDoc(doc(firestoreDb, 'employee_loans', sanitizeFirestoreDocId(loanId)));
      recordFirestoreDeletes(1);
    } catch (err: any) {
      if (!isFirestorePermissionError(err)) {
        markFirestoreQuotaExceeded(err);
      }
    }
  }

  return savedMaster;
};

export const subscribeToEmployeeLoansFromFirestore = (
  onUpdate: (loans: EmployeeLoan[], deletedIds: string[]) => void
): (() => void) => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied()) {
    return () => {};
  }

  const unsubs: Array<() => void> = [];
  let masterLoans: EmployeeLoan[] = [];
  let collLoans: EmployeeLoan[] = [];

  const emitMerged = () => {
    let localList: EmployeeLoan[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC);
      if (raw) localList = JSON.parse(raw);
    } catch (_) {}
    const deletedIds = getDeletedLoanIds();
    const merged = mergeEmployeeLoansSafely([collLoans, masterLoans, localList], deletedIds);
    try {
      localStorage.setItem(STORAGE_KEY_EMPLOYEE_LOANS_SYNC, JSON.stringify(merged));
    } catch (_) {}
    onUpdate(merged, deletedIds);
  };

  try {
    const unsubMaster = onSnapshot(
      doc(firestoreDb, 'attendance', LOANS_MASTER_DOC_ID),
      (snap) => {
        recordFirestoreReads(1);
        if (!snap.exists()) return;
        const data = snap.data() || {};
        if (Array.isArray(data.deletedLoanIds)) {
          saveDeletedLoanIds([...getDeletedLoanIds(), ...data.deletedLoanIds]);
        }
        masterLoans = Array.isArray(data.employeeLoans) ? data.employeeLoans : [];
        emitMerged();
      },
      (err: any) => {
        markFirestoreQuotaExceeded(err);
        markFirestorePermissionDenied(err);
      }
    );
    unsubs.push(unsubMaster);
  } catch (_) {}

  try {
    const unsubColl = onSnapshot(
      collection(firestoreDb, 'employee_loans'),
      (snap) => {
        recordFirestoreReads(Math.max(1, snap.size));
        const list: EmployeeLoan[] = [];
        snap.forEach((d) => {
          const data = d.data() as EmployeeLoan;
          if (data && (data.id || d.id)) {
            list.push({ ...data, id: data.id || d.id });
          }
        });
        collLoans = list;
        emitMerged();
      },
      (err: any) => {
        if (!isFirestorePermissionError(err)) {
          markFirestoreQuotaExceeded(err);
        }
      }
    );
    unsubs.push(unsubColl);
  } catch (_) {}

  return () => {
    unsubs.forEach((u) => {
      try { u(); } catch (_) {}
    });
  };
};

// --- Monthly Recurring Transactions Cloud Sync (Single master doc on existing attendance collection) ---
export const loadMonthlyTransactionsFromFirestore = async (): Promise<{ items: MonthlyRecurringTransaction[]; deletedIds: string[] } | null> => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) return null;
  const docPath = 'attendance/monthly_transactions_master';
  try {
    const docRef = doc(firestoreDb, 'attendance', 'monthly_transactions_master');
    const snap = await withTimeout(getDoc(docRef), 10000, 'Memuat transaksi bulanan');
    recordFirestoreReads(1);
    if (snap.exists()) {
      const data = snap.data() || {};
      const items: MonthlyRecurringTransaction[] = Array.isArray(data.monthlyTransactions) ? data.monthlyTransactions : [];
      const deletedIds: string[] = Array.isArray(data.deletedMonthlyIds) ? data.deletedMonthlyIds.map(String) : [];
      return { items, deletedIds };
    }
    return { items: [], deletedIds: [] };
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
      markFirestoreQuotaExceeded(err);
    } else if (isFirestorePermissionError(err)) {
      markFirestorePermissionDenied(err);
    } else {
      markFirestoreInternalAssertion(err);
      console.warn(`⚠️ Gagal memuat ${docPath} dari Firestore:`, err?.message || err);
    }
    return null;
  }
};

export const saveMonthlyTransactionsToFirestore = async (
  items: MonthlyRecurringTransaction[],
  deletedIds: string[] = []
): Promise<boolean> => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) return false;
  const docPath = 'attendance/monthly_transactions_master';
  try {
    const docRef = doc(firestoreDb, 'attendance', 'monthly_transactions_master');
    const delSet = new Set(deletedIds.map(String));
    const cleanItems = cleanUndefined(
      items.filter(item => item && item.id && !delSet.has(String(item.id)))
    );
    await withTimeout(
      setDoc(
        docRef,
        {
          monthlyTransactions: cleanItems,
          deletedMonthlyIds: Array.from(delSet).slice(-200),
          totalItems: cleanItems.length,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      ),
      10000,
      'Menyimpan transaksi bulanan'
    );
    recordFirestoreWrites(1);
    return true;
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
      markFirestoreQuotaExceeded(err);
    } else if (isFirestorePermissionError(err)) {
      markFirestorePermissionDenied(err);
    } else {
      markFirestoreInternalAssertion(err);
      console.warn(`⚠️ Gagal menyimpan ${docPath} ke Firestore:`, err?.message || err);
    }
    return false;
  }
};

export const subscribeToMonthlyTransactionsFromFirestore = (
  onUpdate: (items: MonthlyRecurringTransaction[], deletedIds: string[]) => void
): (() => void) => {
  if (!isFirebaseConfigured() || !firestoreDb || !hasAuthenticatedFirebaseUser() || isFirestoreQuotaExceeded() || isFirestorePermissionDenied() || isFirestoreInternalDegraded()) {
    return () => {};
  }
  try {
    const docRef = doc(firestoreDb, 'attendance', 'monthly_transactions_master');
    return onSnapshot(
      docRef,
      (snap) => {
        recordFirestoreReads(1);
        if (snap.exists()) {
          const data = snap.data() || {};
          const items: MonthlyRecurringTransaction[] = Array.isArray(data.monthlyTransactions) ? data.monthlyTransactions : [];
          const deletedIds: string[] = Array.isArray(data.deletedMonthlyIds) ? data.deletedMonthlyIds.map(String) : [];
          onUpdate(items, deletedIds);
        }
      },
      (err: any) => {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
          markFirestoreQuotaExceeded(err);
        } else if (isFirestorePermissionError(err)) {
          markFirestorePermissionDenied(err);
        } else {
          markFirestoreInternalAssertion(err);
          console.warn('⚠️ Realtime listener monthly_transactions_master notice:', err?.message || err);
        }
      }
    );
  } catch (err) {
    markFirestoreInternalAssertion(err);
    return () => {};
  }
};

// Load initial config checking
initializeFirebaseApp();


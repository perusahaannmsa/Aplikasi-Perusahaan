import { initializeApp, getApp, getApps, FirebaseApp, deleteApp } from 'firebase/app';
import firebaseAppletConfig from '../firebase-applet-config.json';
import { 
  getFirestore, 
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
  sendPasswordResetEmail
} from 'firebase/auth';
import { Submission, SubmissionItem, ActivityLog, NpwpRecord, CompanyProfile, InternalMemo, Worker } from './types';
import { INITIAL_WORKERS } from './constantsAbsen';
import { isPettyCashSubmission, getPettyCashCustodian, isInvoiceSubmission } from './utils';

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

// Helper to check and parse stored config - PERMANENTLY LOCKED to NMSA Production
export const getStoredFirebaseConfig = (): any => {
  // Check if custom user config was saved to localStorage (e.g. from Firebase Migration / Multi-project)
  try {
    const custom = localStorage.getItem('NUSANTARA_FIREBASE_CONFIG');
    if (custom) {
      const parsed = JSON.parse(custom);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading stored custom firebase config:', e);
  }

  // Check if firebase-applet-config.json exists and has valid configuration for pencatatan-voucher-perusahaan
  if (firebaseAppletConfig && (firebaseAppletConfig as any).apiKey && (firebaseAppletConfig as any).projectId === "pencatatan-voucher-perusahaan") {
    return firebaseAppletConfig;
  }

  // Environment variables override if specified
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (envApiKey && envProjectId) {
    return {
      apiKey: envApiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://${envProjectId}-default-rtdb.asia-southeast1.firebasedatabase.app`,
      projectId: envProjectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${envProjectId}.firebasestorage.app`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
      firestoreDatabaseId: "(default)"
    };
  }

  // 🔒 Always return the locked permanent configuration by default
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
  let createdAtStr = new Date().toISOString();
  const rawCreatedAt = data.createdAt || data.created_at || data.tanggal;
  if (rawCreatedAt) {
    if (typeof rawCreatedAt.toDate === 'function') {
      createdAtStr = rawCreatedAt.toDate().toISOString();
    } else if (rawCreatedAt.seconds) {
      createdAtStr = new Date(rawCreatedAt.seconds * 1000).toISOString();
    } else {
      createdAtStr = String(rawCreatedAt);
    }
  }

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
    googleDriveFiles: data.googleDriveFiles || (data.googleDriveFileUrl ? [{ url: data.googleDriveFileUrl, name: data.googleDriveFileName || 'Buka di Drive' }] : []),
    buktiPembayaran: data.buktiPembayaran || undefined,

    // Invoice properties mapping
    isInvoice: isInvoiceSubmission(data),
    invoiceNumber: data.invoiceNumber || '',
    invoiceDate: data.invoiceDate || '',
    invoiceAmount: typeof data.invoiceAmount === 'number' ? data.invoiceAmount : undefined,

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

    items: mappedItems,
    createdAt: createdAtStr,
    deletedPageIds: Array.isArray(data.deletedPageIds) ? data.deletedPageIds : []
  };
};

// Deeply sanitize objects to replace undefined keys or values with null/empty types to prevent Firestore write crashes
export const cleanUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (obj instanceof Date) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item));
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        cleaned[key] = cleanUndefined(val);
      }
    }
    return cleaned;
  }
  return obj;
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

  return {
    // Both camelCase and snake_case fields for total backwards compatibility
    catatan: sub.notes || '',
    catatan_tambahan: sub.notes || '',
    catatanTambahan: sub.notes || '',
    companyId: userCompanyId,
    companyName: userCompanyName,
    company_id: userCompanyId,
    company_name: userCompanyName,
    createdAt: new Date(),
    created_at: new Date(),
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
    googleDriveFiles: Array.isArray(sub.googleDriveFiles)
      ? sub.googleDriveFiles.map(f => ({
          ...f,
          url: sanitizeUrlForFirestore(f.url, f.name || 'Lampiran')
        }))
      : [],

    items: cleanItems,
    updatedAt: new Date(),
    updated_at: new Date(),
    
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

    isInvoice: isInvoiceSubmission(sub),
    invoiceNumber: sub.invoiceNumber || '',
    invoiceDate: sub.invoiceDate || '',
    invoiceAmount: typeof sub.invoiceAmount === 'number' ? sub.invoiceAmount : null,
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
    deletedPageIds: sub.deletedPageIds || []
  };
};

export const getUserProfileFromFirestore = async (uid: string): Promise<any> => {
  if (!isFirebaseConfigured() || !firestoreDb) return null;
  try {
    const docRef = doc(firestoreDb, 'users', uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data?.companyId) {
        setActiveCompanyId(data.companyId);
      }
      return data;
    }
  } catch (err) {
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
  if (isFirebaseConfigured() && firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'companies', cleanId);
      const snap = await getDoc(docRef);
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
  
  if (isFirebaseConfigured() && firestoreDb) {
    try {
      const colRef = collection(firestoreDb, 'companies');
      const snap = await getDocs(colRef);
      snap.forEach((doc) => {
        result.push(doc.data());
      });
    } catch (err) {
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
  return saveAndInitializeFirebaseConfig(NMSA_PROD_FIREBASE_CONFIG);
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
    firestoreDb = getFirestore(firebaseApp, dbId);
    registerFirestoreInstance(firestoreDb);
    firebaseAuth = getAuth(firebaseApp);
    
    // Register listener for auth states
    onAuthStateChanged(firebaseAuth, (user) => {
      currentUser = user;
      console.log('📡 Auth State Modified. User logged in:', user?.email || 'NONE');
    });

    console.log('✅ Firebase initialized successfully with project:', config.projectId);
    
    // If quota is already exceeded, immediately disable network to prevent gRPC Write stream errors
    if (isFirestoreQuotaExceeded()) {
      console.log('ℹ️ [Firestore Init] Kuota harian Firestore sedang dalam masa cooldown. Jaringan dinonaktifkan untuk mencegah gRPC Write stream errors.');
      disableNetwork(firestoreDb).catch(() => {});
    } else {
      // Asynchronously validate connection to Firestore only if quota not exceeded
      testConnection();
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
  if (!firestoreDb || isFirestoreQuotaExceeded()) return;
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    console.log('📡 Firestore database connection status: ACTIVE');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network status.");
    }
  }
}

// Registered Firestore instances across the application
const registeredFirestoreInstances = new Set<Firestore>();

export const registerFirestoreInstance = (dbInstance: Firestore | null) => {
  if (dbInstance) {
    registeredFirestoreInstances.add(dbInstance);
    if (isFirestoreQuotaExceeded()) {
      disableNetwork(dbInstance).catch(() => {});
    }
  }
};

// Global interceptor for unhandled console.error from @firebase/firestore
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
    originalConsoleError.apply(console, args);
  };
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
const QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours cooldown (Firebase Spark tier quota resets daily at midnight PST)

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
    try {
      localStorage.setItem('nmsa_fs_quota_exceeded', String(lastQuotaExceededTime));
      sessionStorage.setItem('nmsa_fs_quota_exceeded', String(lastQuotaExceededTime));
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    } catch (_) {}

    if (!wasAlreadyExceeded) {
      console.warn('⚠️ [Firestore Quota Guard] Kuota harian gratis Firebase (Spark Plan) telah tercapai (RESOURCE_EXHAUSTED). Mengalihkan operasi tulis ke penyimpanan lokal dan backend server sementara.');
    }

    // CRITICAL: Shut down the GrpcConnection RPC 'Write' stream immediately on ALL instances
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
  try {
    localStorage.removeItem('nmsa_fs_quota_exceeded');
    sessionStorage.removeItem('nmsa_fs_quota_exceeded');
    window.dispatchEvent(new CustomEvent('firestore-quota-reset'));
  } catch (_) {}
  for (const inst of registeredFirestoreInstances) {
    try {
      await enableNetwork(inst);
    } catch (_) {}
  }
  if (firestoreDb) {
    try {
      await enableNetwork(firestoreDb);
    } catch (_) {}
  }
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
  try {
    const creds = await signInWithEmailAndPassword(firebaseAuth, email, password);
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
  await sendPasswordResetEmail(firebaseAuth, email);
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
    d => d && d.email && d.email.toLowerCase() !== 'penyimpanandrivenmsa1@gmail.com'
  );
  const cleanLocal = (Array.isArray(localDrives) ? localDrives : []).filter(
    d => d && d.email && d.email.toLowerCase() !== 'penyimpanandrivenmsa1@gmail.com'
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

// 🔒 GOOGLE DRIVE ACCOUNTS CONFIGURATION (PT Nusantara Mineral Sukses Abadi)
// Akun resmi Google Drive permanen & eksklusif: akuncoding211@gmail.com
export const PRIMARY_MASTER_DRIVE_EMAIL = 'akuncoding211@gmail.com';
export const LOCKED_MASTER_DRIVE_EMAIL = 'akuncoding211@gmail.com';

export const DEFAULT_AUTHORIZED_DRIVE_EMAILS: string[] = [
  'akuncoding211@gmail.com'
];

// Auto-cleanup legacy accounts and lock to akuncoding211@gmail.com
if (typeof window !== 'undefined') {
  try {
    const curMaster = localStorage.getItem('NUSANTARA_MASTER_DRIVE_EMAIL');
    if (!curMaster || curMaster.toLowerCase() === 'penyimpanandrivenmsa1@gmail.com') {
      localStorage.setItem('NUSANTARA_MASTER_DRIVE_EMAIL', LOCKED_MASTER_DRIVE_EMAIL);
    }
    const rawAuth = localStorage.getItem('NUSANTARA_AUTHORIZED_DRIVES');
    if (rawAuth) {
      try {
        const parsed = JSON.parse(rawAuth);
        if (Array.isArray(parsed)) {
          const filtered = parsed
            .map(e => String(e).trim().toLowerCase())
            .filter(e => e && e !== 'penyimpanandrivenmsa1@gmail.com');
          if (!filtered.includes(LOCKED_MASTER_DRIVE_EMAIL)) {
            filtered.unshift(LOCKED_MASTER_DRIVE_EMAIL);
          }
          localStorage.setItem('NUSANTARA_AUTHORIZED_DRIVES', JSON.stringify(filtered));
        }
      } catch (e) {}
    }
    const rawConn = localStorage.getItem('NUSANTARA_CONNECTED_DRIVES');
    if (rawConn) {
      try {
        const parsed = JSON.parse(rawConn);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(d => 
            d && d.email && d.email.toLowerCase() !== 'penyimpanandrivenmsa1@gmail.com'
          );
          localStorage.setItem('NUSANTARA_CONNECTED_DRIVES', JSON.stringify(filtered));
        }
      } catch (e) {}
    }
  } catch (e) {}
}

/**
 * Flexible mode allows any Google account to be linked and used as a storage target.
 * Default is TRUE so users are never blocked or rejected when connecting their accounts.
 */
export const isDriveFlexibleMode = (): boolean => {
  try {
    const raw = localStorage.getItem('NUSANTARA_DRIVE_FLEXIBLE_MODE');
    if (raw !== null) {
      return raw === 'true';
    }
  } catch (e) {}
  return true;
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
            .filter(e => e && e !== 'penyimpanandrivenmsa1@gmail.com')
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
        .filter(e => e && e !== 'penyimpanandrivenmsa1@gmail.com')
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

  // Update in connected drives if matching
  const drives = getConnectedDrives();
  let changed = false;
  drives.forEach(d => {
    if (d.email.toLowerCase() === cleanOld) {
      d.email = cleanNew;
      changed = true;
    }
  });
  if (changed) {
    await saveConnectedDrives(drives);
  }

  return current;
};

export const removeAuthorizedDriveEmail = async (emailToRemove: string): Promise<string[]> => {
  const clean = (emailToRemove || '').trim().toLowerCase();
  const current = getAuthorizedDriveEmails();
  const updated = current.filter(e => e.toLowerCase() !== clean);
  await saveAuthorizedDriveEmails(updated);
  if (getMasterDriveEmail().toLowerCase() === clean && updated.length > 0) {
    await setMasterDriveEmail(updated[0]);
  }
  return updated;
};

export const isDriveEmailAuthorized = (email?: string | null): boolean => {
  if (!email) return false;
  // If flexible mode is active, any valid email format is authorized!
  if (isDriveFlexibleMode()) return email.includes('@');
  const clean = email.trim().toLowerCase();
  const list = getAuthorizedDriveEmails().map(e => e.trim().toLowerCase());
  return list.includes(clean);
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
        // Keep drives whose emails are authorized or present, strictly excluding legacy accounts
        const filteredDrives = parsed.filter(d => 
          d && d.email && 
          d.email.toLowerCase() !== 'penyimpanandrivenmsa1@gmail.com' &&
          (isDriveEmailAuthorized(d.email) || d.email.includes('@'))
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
      displayName: `Master Drive NMSA (${masterEmail})`,
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

export const loadConnectedDrivesFromFirestore = async (_companyId: string = 'nmsa'): Promise<ConnectedDrive[]> => {
  return getConnectedDrives();
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
  const lastEmail = localStorage.getItem('NUSANTARA_LAST_ACTIVE_EMAIL');
  if (lastEmail) {
    return { email: lastEmail };
  }
  return null;
};

export const saveConnectedDrives = async (drives: ConnectedDrive[]) => {
  try {
    const cleanDrives = drives.filter(d => d && d.email && d.email.toLowerCase() !== 'penyimpanandrivenmsa1@gmail.com');
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

  const email = (meta.email || targetEmailHint || getMasterDriveEmail() || 'google-drive@nmsa.com').trim().toLowerCase();
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

  // 2. Auto-whitelist email so it is accepted
  try {
    const list = getAuthorizedDriveEmails();
    if (!list.includes(email)) {
      list.push(email);
      await saveAuthorizedDriveEmails(list);
    }
  } catch (e) {}

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

      // 3. Determine the exact Google Drive email to connect / reconnect
      const activeAccount = getActiveGoogleDriveAccount();
      const lastEmail = localStorage.getItem('NUSANTARA_LAST_ACTIVE_EMAIL');
      const emailToUse = targetEmail || activeAccount?.email || lastEmail || getConnectedDrives()[0]?.email || getMasterDriveEmail();

      // 4. If interactive renewal is allowed (e.g. user clicked save, backup, or submitting voucher), perform login
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
      const targetEmail = options?.targetEmail || activeAccount?.email;
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
        console.warn(`⚠️ [Google Drive Auto-Check] Mendeteksi respons 401 pada ${options?.actionName || 'Drive API'}. Memperbarui token otomatis di latar belakang (Percobaan ${attempts}/${maxRetries + 1})...`);
        if (attempts <= maxRetries) {
          invalidateDriveToken(token);
          const activeAccount = getActiveGoogleDriveAccount();
          const targetEmail = options?.targetEmail || activeAccount?.email;
          const freshToken = await getOrRenewDriveToken(targetEmail, true);
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
        const targetEmail = options?.targetEmail || activeAccount?.email;
        try {
          const freshToken = await getOrRenewDriveToken(targetEmail, true);
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

/**
 * Universal Trigger for Google Drive Token Refresh.
 * Called automatically every 30 seconds, on view/menu switch, on user actions, and on demand.
 */
export const triggerGoogleDriveAutoRefresh = async (
  reason = 'manual', 
  force = false, 
  allowInteractive = false
): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  const now = Date.now();

  // Debounce non-forced checks to prevent network thrashing (at least 3s between runs unless forced)
  if (!force && (now - lastDriveRefreshTime < 3000)) {
    return getStoredGoogleDriveToken(true);
  }
  
  if (isRefreshingDriveToken) {
    return getStoredGoogleDriveToken(true);
  }

  isRefreshingDriveToken = true;
  lastDriveRefreshTime = now;

  try {
    console.log(`⏰ [Google Drive Auto-Keeper] Memeriksa & memperbarui token (${reason})...`);

    // 1. Always pull latest shared drives from Firestore (so cross-device/tab updates sync instantly)
    try {
      await loadConnectedDrivesFromFirestore();
    } catch (fsErr) {
      console.warn('[Google Drive Auto-Keeper] Firestore sync notice:', fsErr);
    }

    // 2. Check all connected drives
    const activeDrives = getConnectedDrives();
    const currentToken = getStoredGoogleDriveToken(true);

    if (!currentToken || force) {
      // Token missing or forced: get or renew token from cache, Firestore, backend, or interactive login
      const freshToken = await getOrRenewDriveToken(undefined, allowInteractive);
      if (freshToken) {
        console.log(`✅ [Google Drive Auto-Keeper] Token Google Drive berhasil aktif & diperbarui (${reason}).`);
        return freshToken;
      }
    } else if (activeDrives.length > 0) {
      // 3. Verify token with active Google Drive ping
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
          // Reload from Firestore or interactive renewal
          const refreshed = await loadConnectedDrivesFromFirestore();
          const valid = refreshed.find(d => isDriveTokenValid(d) && d.accessToken);
          if (valid && valid.accessToken) {
            setGoogleDriveToken(valid.accessToken);
            return valid.accessToken;
          }
          // Attempt renewal
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

  // Set interval (every 30 seconds as explicitly requested by user)
  const intervalMs = Math.max(5, intervalSeconds) * 1000;
  tokenAutoRefreshIntervalId = setInterval(() => {
    triggerGoogleDriveAutoRefresh('30s-timer', true);
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

  // Trigger on user activity (clicks, navigation, menu changes) throttled to once per 15s
  let lastUserActivityCheck = 0;
  const onUserActivity = () => {
    const t = Date.now();
    if (t - lastUserActivityCheck > 15000) {
      lastUserActivityCheck = t;
      // If token is missing or expired, renew it interactively since this is an active user click!
      const activeTok = getStoredGoogleDriveToken(true);
      triggerGoogleDriveAutoRefresh('user-activity', !activeTok, !activeTok);
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
  forceSelectAccount = false
): Promise<{ user: User; accessToken: string; driveDetails?: any }> => {
  const config = getStoredFirebaseConfig();
  if (!config) {
    throw new Error('Database autentikasi belum beroperasi.');
  }

  // Use primary auth instance to guarantee popup postMessage resolution!
  const targetAuth = firebaseAuth || getAuth();
  const provider = new GoogleAuthProvider();
  // Request Google Drive File write/edit permissions
  provider.addScope('https://www.googleapis.com/auth/drive.file');

  const customParams: Record<string, string> = {};
  if (loginHint) {
    customParams.login_hint = loginHint;
  }
  if (forceSelectAccount) {
    customParams.prompt = 'select_account';
  }
  provider.setCustomParameters(customParams);

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
      const fallbackEmail = result.user.email || loginHint || getMasterDriveEmail() || 'google-drive@nmsa.com';
      driveDetails = {
        email: fallbackEmail,
        displayName: result.user.displayName || `Google Drive (${fallbackEmail})`,
        photoURL: result.user.photoURL || '',
        quotaUsed: 0,
        quotaLimit: 15 * 1024 * 1024 * 1024
      };
    }

    const userEmail = (driveDetails.email || result.user.email || '').trim().toLowerCase();
    if (userEmail) {
      // Auto-whitelist email so it is NEVER blocked
      try {
        const authList = getAuthorizedDriveEmails();
        if (!authList.includes(userEmail)) {
          authList.push(userEmail);
          await saveAuthorizedDriveEmails(authList);
        }
      } catch (e) {}

      // If no master exists, make this master
      const activeMaster = getMasterDriveEmail();
      if (!activeMaster) {
        await setMasterDriveEmail(userEmail);
      }
    }

    // Check if storage is full
    const limit = driveDetails.quotaLimit || 15 * 1024 * 1024 * 1024;
    const used = driveDetails.quotaUsed || 0;
    const remains = limit - used;
    const isFull = remains <= 15 * 1024 * 1024; // Less than 15MB free

    if (isFull) {
      const usedGB = Math.round(used / (1024 * 1024 * 1024) * 100) / 100;
      const limitGB = Math.round(limit / (1024 * 1024 * 1024));
      window.alert(
        `Penyimpanan Google Drive "${driveDetails.email}" telah penuh (Terisi: ${usedGB} GB dari ${limitGB} GB).\n\nSilakan pilih akun Google Drive cadangan atau akun Google ke-2 Anda untuk melanjutkan penyimpanan secara otomatis tanpa hambatan.`
      );
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

// ═════════ FIRESTORE REST DATA OPERATION IMPLEMENTATIONS ═════════

// Fetch submissions from Firestore, strictly filtered by user's companyId to achieve complete database segregation
export const loadSubmissionsFromFirestore = async (companyId?: string): Promise<Submission[]> => {
  if (!isFirebaseConfigured() || !firestoreDb) {
    throw new Error('Firebase is not initialized. Please provide correct configuration.');
  }

  const path = 'submissions';
  try {
    const q = query(collection(firestoreDb, path), orderBy('tanggal', 'desc'));
    const snapshot = await getDocs(q);
    const list: Submission[] = [];
    const targetComp = (companyId || '').toLowerCase().trim();
    
    snapshot.forEach(docSnap => {
      // Apply mapping from user schema (with items details and timestamps) to our rich interface
      const data = docSnap.data();
      const mapped = mapFirestoreToSubmission(docSnap.id, data);
      
      // Strict data segregation per company
      // Legacy submissions without explicit companyId belong to default 'nmsa'
      const docComp = (data.companyId || data.company_id || (targetComp === 'nmsa' ? 'nmsa' : '')).toLowerCase().trim();
      
      if (!targetComp || docComp === targetComp) {
        list.push(mapped);
      }
    });

    // Self-healing: if status is 'DP / Cicilan' and dpAmount is missing, recover from local cache if present
    try {
      const localSubsRaw = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS') || localStorage.getItem('voucher_submissions');
      if (localSubsRaw) {
        const localSubs = JSON.parse(localSubsRaw);
        if (Array.isArray(localSubs)) {
          list.forEach(item => {
            if (item.status === 'DP / Cicilan' && (!item.dpAmount || item.dpAmount === 0)) {
              const matchedLocal = localSubs.find((ls: any) => ls.id === item.id || (ls.kode && ls.kode === item.kode));
              if (matchedLocal && matchedLocal.dpAmount) {
                item.dpAmount = Number(matchedLocal.dpAmount);
                item.cicilanNotes = item.cicilanNotes || matchedLocal.cicilanNotes;
                if (!isFirestoreQuotaExceeded()) {
                  saveSubmissionToFirestore(item, targetComp || 'nmsa').catch(() => {});
                }
              }
            }
          });
        }
      }
    } catch (_) {}
    
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
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

// ═════════ IN-MEMORY & PERSISTENT FIRESTORE BACKGROUND QUEUE ═════════
// Solusi cerdas: Data langsung tersimpan instan di memori sementara (RAM) & cache lokal,
// lalu di-upload secara asynchronous di latar belakang. Jika Firestore lambat/down,
// data tersimpan aman dan di-upload otomatis saat koneksi pulih!

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
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
};

const persistFirestoreQueue = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('NUSANTARA_FIRESTORE_WRITE_QUEUE', JSON.stringify(firestoreWriteQueue));
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

export const enqueueFirestoreWrite = (
  path: string, 
  docId: string, 
  payload: any, 
  description?: string
): void => {
  // If Firestore quota is currently exhausted, do not queue cloud writes to prevent Write stream errors
  if (isFirestoreQuotaExceeded()) {
    return;
  }

  // Strictly enforce user quota directive: only Absen, NPWP, and Voucher submissions
  const ALLOWED_COLLECTIONS = ['submissions', 'npwp_records', 'attendance', 'workers'];
  if (!ALLOWED_COLLECTIONS.includes(path)) {
    return;
  }

  const key = `${path}/${docId}`;
  const now = Date.now();
  
  // Deduplicate: perbarui antrian jika dokumen yang sama sudah ada di antrian
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

  // Jadwalkan flush di background (debounce 80ms agar operasi batch bersatu)
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

  if (!isFirebaseConfigured() || !firestoreDb) {
    return { processed: 0, remaining: firestoreWriteQueue.length };
  }

  if (isFirestoreQuotaExceeded()) {
    console.log(`ℹ️ [Firestore Queue] Flush ditunda karena batas kuota harian tercapai. Antrian (${firestoreWriteQueue.length} data) tersimpan aman di memori & penyimpanan lokal.`);
    if (firestoreDb) {
      disableNetwork(firestoreDb).catch(() => {});
    }
    return { processed: 0, remaining: firestoreWriteQueue.length };
  }

  isProcessingFirestoreQueue = true;
  notifyFirestoreQueueStatus(true);
  let processed = 0;

  try {
    while (firestoreWriteQueue.length > 0) {
      if (isFirestoreQuotaExceeded()) {
        if (firestoreDb) disableNetwork(firestoreDb).catch(() => {});
        break;
      }

      const item = firestoreWriteQueue[0];
      try {
        const docRef = doc(firestoreDb, item.path, item.docId);
        await setDoc(docRef, item.payload, { merge: true });
        
        // Berhasil disimpan ke cloud, hapus dari antrian
        firestoreWriteQueue.shift();
        processed++;
        recordFirestoreWrites(1);
        persistFirestoreQueue();
        notifyFirestoreQueueStatus(true);
        console.log(`☁️ [Firestore Background Sync] Berhasil mengunggah ${item.description || item.id} ke cloud.`);
      } catch (err: any) {
        console.warn(`[Firestore Queue] Gagal sinkronisasi data ${item.id}:`, err?.message || err);
        markFirestoreQuotaExceeded(err);
        
        item.retries = (item.retries || 0) + 1;
        
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const errMsg = String(err?.message || '').toLowerCase();
        const isTransient = isOffline || errMsg.includes('offline') || errMsg.includes('unavailable') || errMsg.includes('timeout') || errMsg.includes('network');
        
        if (isTransient || isFirestoreQuotaExceeded()) {
          console.log(`[Firestore Queue] Menghentikan sementara proses antrian. Data tetap aman di memori & akan dilanjutkan otomatis.`);
          if (firestoreDb) disableNetwork(firestoreDb).catch(() => {});
          break;
        }

        if (item.retries >= 5) {
          firestoreWriteQueue.shift();
          persistFirestoreQueue();
        } else {
          break;
        }
      }
    }
  } finally {
    isProcessingFirestoreQueue = false;
    notifyFirestoreQueueStatus(false);
  }

  return { processed, remaining: firestoreWriteQueue.length };
};

// Auto-sync listener & interval
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 Koneksi internet aktif kembali. Mengunggah antrian data Firestore yang tertunda...');
    flushFirestoreQueue().catch(() => {});
  });

  setInterval(() => {
    if (firestoreWriteQueue.length > 0 && !isProcessingFirestoreQueue && !isFirestoreQuotaExceeded()) {
      flushFirestoreQueue().catch(() => {});
    }
  }, 20000);

  setTimeout(() => {
    if (firestoreWriteQueue.length > 0 && !isFirestoreQuotaExceeded()) {
      console.log(`[Firestore Queue] Melanjutkan sinkronisasi ${firestoreWriteQueue.length} data tertunda dari sesi sebelumnya...`);
      flushFirestoreQueue().catch(() => {});
    }
  }, 3000);
}

// Put/Save single submission in Firestore under user's actual companyId with instant optimistic memory save
export const saveSubmissionToFirestore = async (
  submission: Submission, 
  userCompanyId: string = 'nmsa',
  userCompanyName: string = 'PT Nusantara Mineral Sukses Abadi',
  options?: { waitForCloudAck?: boolean }
): Promise<void> => {
  // 1. Immediately cache in local storage so user sees the change instantly
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
      if (raw) {
        const list: Submission[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          const idx = list.findIndex(s => s.id === submission.id);
          if (idx !== -1) {
            list[idx] = submission;
          } else {
            list.unshift(submission);
          }
          localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(list));
        }
      }
    }
  } catch (e) {}

  // 2. Prepare payload
  const path = `submissions`;
  const fPayload = mapSubmissionToFirestore(
    submission, 
    currentUser?.email || 'admin@nmsa.com', 
    currentUser?.uid || 'pwsDJv3bKHQamy89PDaAeCoZQcU2',
    userCompanyId,
    userCompanyName
  );
  const cleanedPayload = cleanUndefined(fPayload);

  // 3. Enqueue to in-memory & persistent sync queue (Instant execution, 0ms delay)
  enqueueFirestoreWrite(path, submission.id, cleanedPayload, `Voucher ${submission.kode || submission.id}`);
  console.log(`⚡ [Fast-Save] Submission ${submission.id} tersimpan di memori sementara & diantrikan ke background cloud sync.`);

  // 4. Optional blocking wait if caller specifically requested it
  if (options?.waitForCloudAck) {
    if (isFirebaseConfigured() && firestoreDb && !isFirestoreQuotaExceeded()) {
      try {
        await setDoc(doc(firestoreDb, path, submission.id), cleanedPayload);
      } catch (error) {
        markFirestoreQuotaExceeded(error);
        handleFirestoreError(error, OperationType.WRITE, `${path}/${submission.id}`);
      }
    }
  }

  return Promise.resolve();
};

// Batch save/update multiple submissions in Firestore (e.g. after name consolidation)
export const saveSubmissionsBatchToFirestore = async (
  submissions: Submission[],
  userCompanyId: string = 'nmsa',
  userCompanyName: string = 'PT Nusantara Mineral Sukses Abadi'
): Promise<{ success: boolean; count: number }> => {
  if (!isFirebaseConfigured() || !firestoreDb || submissions.length === 0) {
    return { success: false, count: 0 };
  }

  if (isFirestoreQuotaExceeded()) {
    console.log(`ℹ️ [Firestore Quota Guard] Batch update ${submissions.length} submissions ke Firestore dilewati sementara karena kuota harian tercapai.`);
    return { success: false, count: 0 };
  }

  const BATCH_SIZE = 450; // Firestore limit is 500 operations per batch
  let totalSaved = 0;

  for (let i = 0; i < submissions.length; i += BATCH_SIZE) {
    const chunk = submissions.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(firestoreDb);

    for (const sub of chunk) {
      const fPayload = mapSubmissionToFirestore(
        sub,
        currentUser?.email || 'admin@nmsa.com',
        currentUser?.uid || 'pwsDJv3bKHQamy89PDaAeCoZQcU2',
        userCompanyId,
        userCompanyName
      );
      const cleaned = cleanUndefined(fPayload);
      const subRef = doc(firestoreDb, 'submissions', sub.id);
      batch.set(subRef, cleaned);
    }

    try {
      await batch.commit();
      totalSaved += chunk.length;
      console.log(`☁️ Batch saved ${chunk.length} submissions to Firestore.`);
    } catch (err) {
      markFirestoreQuotaExceeded(err);
      console.warn('Batch write error in Firestore:', err);
    }
  }

  return { success: totalSaved > 0, count: totalSaved };
};

// Delete single submission from Firestore
export const deleteSubmissionFromFirestore = async (id: string): Promise<void> => {
  if (!isFirebaseConfigured() || !firestoreDb) {
    throw new Error('Firebase is not initialized.');
  }

  if (isFirestoreQuotaExceeded()) {
    console.log(`ℹ️ [Firestore Quota Guard] Operasi hapus submission ${id} ke Firestore dilewati karena kuota harian tercapai.`);
    return;
  }

  const path = `submissions`;
  try {
    await deleteDoc(doc(firestoreDb, path, id));
    recordFirestoreDeletes(1);
    console.log(`☁️ Submission ${id} deleted from Firestore.`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
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

// Fetch NPWP Records from Firestore (or fallback to local / server)
export const loadNpwpRecordsFromFirestore = async (): Promise<NpwpRecord[]> => {
  if (!isFirebaseConfigured() || !firestoreDb) {
    try {
      const stored = localStorage.getItem('npwp_records_v1');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  const path = 'npwp_records';
  try {
    const snapshot = await getDocs(collection(firestoreDb, path));
    recordFirestoreReads(snapshot.size || 1);
    const list: NpwpRecord[] = [];
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.companyName) {
        list.push({
          id: docSnap.id || data.id,
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
    if (list.length === 0) {
      try {
        const compSnap = await getDoc(doc(firestoreDb, 'companies', 'nmsa'));
        if (compSnap.exists()) {
          const compData = compSnap.data();
          if (compData && Array.isArray(compData.npwpRecords) && compData.npwpRecords.length > 0) {
            compData.npwpRecords.forEach((r: any) => {
              if (r && r.companyName) list.push(r);
            });
          }
        }
      } catch (compErr) {
        console.warn('Fallback reading company doc NPWP:', compErr);
      }
    }

    if (list.length > 0) {
      localStorage.setItem('npwp_records_v1', JSON.stringify(list));
      return list;
    }

    // Secondary fallback: check local storage or server restore
    try {
      const stored = localStorage.getItem('npwp_records_v1');
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}

    // Tertiary fallback: check server endpoint
    try {
      const srvRes = await fetch('/api/npwp/firebase-restore');
      if (srvRes.ok) {
        const srvData = await srvRes.json();
        if (srvData && Array.isArray(srvData.npwpRecords) && srvData.npwpRecords.length > 0) {
          localStorage.setItem('npwp_records_v1', JSON.stringify(srvData.npwpRecords));
          return srvData.npwpRecords;
        }
      }
    } catch {}

    return [];
  } catch (error) {
    console.warn('Gagal memuat data NPWP dari Firestore:', error);
    try {
      const stored = localStorage.getItem('npwp_records_v1');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
};

// Real-time Cloud Firestore subscription for NPWP records
export const subscribeToNpwpRecordsFromFirestore = (
  onUpdate: (records: NpwpRecord[]) => void
): (() => void) => {
  if (!isFirebaseConfigured() || !firestoreDb || isFirestoreQuotaExceeded()) return () => {};
  try {
    const unsub = onSnapshot(collection(firestoreDb, 'npwp_records'), (snapshot) => {
      if (snapshot.empty) return;
      const list: NpwpRecord[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.companyName) {
          list.push({
            id: docSnap.id || data.id,
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
      if (list.length > 0) {
        localStorage.setItem('npwp_records_v1', JSON.stringify(list));
        onUpdate(list);
      }
    }, (error) => {
      markFirestoreQuotaExceeded(error);
      console.warn('Real-time listener notice for npwp_records:', error);
    });
    return unsub;
  } catch (err) {
    console.warn('Failed to subscribe to npwp_records:', err);
    return () => {};
  }
};

// Save single NPWP record to Firestore (hemat kuota Spark Plan - hanya 1 penulisan dokumen spesifik)
export const saveSingleNpwpRecordToFirestore = async (record: NpwpRecord): Promise<void> => {
  if (!record || !record.id) return;

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
  if (!isFirebaseConfigured() || !firestoreDb || isFirestoreQuotaExceeded()) return;
  const path = 'npwp_records';
  try {
    await setDoc(doc(firestoreDb, path, record.id), cleanUndefined(record), { merge: true });
    recordFirestoreWrites(1);
    console.log(`☁️ [NPWP Firestore] Dokumen NPWP "${record.companyName}" (${record.id}) berhasil disimpan ke Firestore.`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    console.warn('Gagal menyimpan single NPWP ke Firestore:', error);
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

  if (!isFirebaseConfigured() || !firestoreDb || isFirestoreQuotaExceeded()) return;

  const path = 'npwp_records';
  try {
    // 2. Save each record into npwp_records collection
    for (const rec of records) {
      if (rec.id) {
        await setDoc(doc(firestoreDb, path, rec.id), cleanUndefined(rec), { merge: true });
      }
    }
    recordFirestoreWrites(records.length);
    console.log(`☁️ ${records.length} NPWP records synced to Firestore.`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    console.warn('Gagal menyimpan NPWP ke Firestore:', error);
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

  // Koleksi yang tidak diperlukan & aman untuk dibersihkan
  const TARGET_COLLECTIONS = [
    'absen_records',
    'accurate_mappings',
    'activity_logs',
    'office_config',
    'test',
    'internal_memos'
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

// Delete single NPWP record from Firestore
export const deleteNpwpRecordFromFirestore = async (id: string): Promise<void> => {
  try {
    const stored = localStorage.getItem('npwp_records_v1');
    if (stored) {
      const list = JSON.parse(stored);
      const remaining = list.filter((r: any) => r.id !== id);
      localStorage.setItem('npwp_records_v1', JSON.stringify(remaining));
      
      // Sync to server
      fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npwpRecords: remaining })
      }).catch(() => {});

      // No mirroring to companies to conserve daily free quota
    }
  } catch (e) {
    console.warn('Gagal menghapus NPWP dari localStorage:', e);
  }

  if (!isFirebaseConfigured() || !firestoreDb || isFirestoreQuotaExceeded()) return;
  try {
    await deleteDoc(doc(firestoreDb, 'npwp_records', id));
    recordFirestoreDeletes(1);
    console.log(`🗑️ [NPWP Firestore] Dokumen tunggal NPWP ${id} berhasil dihapus dari Firestore.`);
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    console.warn('Gagal menghapus NPWP dari Firestore:', error);
  }
};

// ═════════════════════════════════════════════════════════════════════
// 👥 MASTER LIST KARYAWAN FIRESTORE PERSISTENCE (HEMAT KUOTA)
// Hanya simpan & hapus dokumen per-karyawan agar kuota tidak terkuras
// ═════════════════════════════════════════════════════════════════════

export const loadWorkersFromFirestore = async (): Promise<Worker[]> => {
  // 1. Coba baca dari koleksi 'workers' Firestore jika aktif
  if (isFirebaseConfigured() && firestoreDb && !isFirestoreQuotaExceeded()) {
    try {
      const snap = await getDocs(collection(firestoreDb, 'workers'));
      if (!snap.empty) {
        recordFirestoreReads(snap.size);
        const list: Worker[] = [];
        snap.forEach(d => {
          const data = d.data() as Worker;
          if (data && (data.id || d.id) && data.name) {
            list.push({
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
        if (list.length > 0) {
          list.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
          try {
            localStorage.setItem('karyawan_uang_makan', JSON.stringify(list));
            localStorage.setItem('workers_v1', JSON.stringify(list));
            fetch('/api/unified-storage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workers: list })
            }).catch(() => {});
          } catch (_) {}
          console.log(`☁️ [Workers Firestore] Berhasil memuat ${list.length} karyawan dari Cloud Firestore.`);
          return list;
        }
      }
    } catch (err) {
      markFirestoreQuotaExceeded(err);
      console.warn('Gagal memuat list karyawan dari Firestore:', err);
    }
  }

  // 2. Fallback: baca dari server unified-storage (/api/unified-storage)
  try {
    const srvRes = await fetch('/api/unified-storage');
    if (srvRes.ok) {
      const srvData = await srvRes.json();
      const serverWorkers = srvData?.raw?.workers || srvData?.workers;
      if (Array.isArray(serverWorkers) && serverWorkers.length > 0) {
        localStorage.setItem('karyawan_uang_makan', JSON.stringify(serverWorkers));
        localStorage.setItem('workers_v1', JSON.stringify(serverWorkers));
        return serverWorkers;
      }
    }
  } catch (_) {}

  // 3. Fallback: cek localStorage browser
  try {
    const local = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (_) {}

  // 4. Default: kembalikan INITIAL_WORKERS
  return INITIAL_WORKERS;
};

export const saveWorkerToFirestore = async (worker: Worker): Promise<boolean> => {
  if (!worker || !worker.id) return false;

  // 1. Simpan ke localStorage segera
  try {
    const stored = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
    let list: Worker[] = stored ? JSON.parse(stored) : [];
    const idx = list.findIndex(w => w.id === worker.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...worker, updatedAt: Date.now() };
    } else {
      list.push({ ...worker, updatedAt: Date.now() });
    }
    localStorage.setItem('karyawan_uang_makan', JSON.stringify(list));
    localStorage.setItem('workers_v1', JSON.stringify(list));

    // 2. Simpan ke server unified-storage
    fetch('/api/unified-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workers: list })
    }).catch(() => {});
  } catch (_) {}

  // 3. Simpan hanya dokumen tunggal ini ke Firestore (Hemat Kuota: 1 Write)
  if (!isFirebaseConfigured() || !firestoreDb || isFirestoreQuotaExceeded()) {
    return false;
  }

  try {
    const cleanWorker = cleanUndefined(worker);
    await setDoc(doc(firestoreDb, 'workers', worker.id), cleanWorker, { merge: true });
    recordFirestoreWrites(1);
    console.log(`☁️ [Worker Firestore] Data karyawan "${worker.name}" (${worker.id}) berhasil disimpan ke Firestore.`);
    return true;
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    console.warn(`Gagal menyimpan karyawan ${worker.id} ke Firestore:`, error);
    return false;
  }
};

export const deleteWorkerFromFirestore = async (workerId: string): Promise<boolean> => {
  if (!workerId) return false;

  // 1. Hapus dari localStorage segera
  try {
    const stored = localStorage.getItem('karyawan_uang_makan') || localStorage.getItem('workers_v1');
    if (stored) {
      const list: Worker[] = JSON.parse(stored);
      const remaining = list.filter(w => w.id !== workerId);
      localStorage.setItem('karyawan_uang_makan', JSON.stringify(remaining));
      localStorage.setItem('workers_v1', JSON.stringify(remaining));

      // 2. Simpan ke server unified-storage
      fetch('/api/unified-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers: remaining })
      }).catch(() => {});
    }
  } catch (_) {}

  // 3. Hapus hanya dokumen tunggal ini dari Firestore (Hemat Kuota: 1 Delete)
  if (!isFirebaseConfigured() || !firestoreDb || isFirestoreQuotaExceeded()) {
    return false;
  }

  try {
    await deleteDoc(doc(firestoreDb, 'workers', workerId));
    recordFirestoreDeletes(1);
    console.log(`🗑️ [Worker Firestore] Karyawan ${workerId} berhasil dihapus dari Firestore.`);
    return true;
  } catch (error) {
    markFirestoreQuotaExceeded(error);
    console.warn(`Gagal menghapus karyawan ${workerId} dari Firestore:`, error);
    return false;
  }
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
    firebaseApp = null;
    firestoreDb = null;
    firebaseAuth = null;
    return false;
  }

  localStorage.setItem('NUSANTARA_FIREBASE_CONFIG', JSON.stringify(config));
  return initializeFirebaseApp(config);
};

// Clear config to disconnect Firebase
export const clearFirebaseConfig = () => {
  localStorage.removeItem('NUSANTARA_FIREBASE_CONFIG');
  firebaseApp = null;
  firestoreDb = null;
  firebaseAuth = null;
};

// --- Internal Memo Local Storage Methods (Firestore disabled to conserve quota) ---
export const saveInternalMemoToFirestore = async (memo: InternalMemo): Promise<void> => {
  try {
    const stored = localStorage.getItem('nmsa_internal_memos_v1');
    const list: InternalMemo[] = stored ? JSON.parse(stored) : [];
    const updated = [memo, ...list.filter((m) => m.id !== memo.id)];
    localStorage.setItem('nmsa_internal_memos_v1', JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save internal memo locally:', err);
  }
};

export const getInternalMemosFromFirestore = async (): Promise<InternalMemo[]> => {
  try {
    const stored = localStorage.getItem('nmsa_internal_memos_v1');
    const list: InternalMemo[] = stored ? JSON.parse(stored) : [];
    list.sort((a, b) => new Date(b.createdAt || b.tanggal).getTime() - new Date(a.createdAt || a.tanggal).getTime());
    return list;
  } catch (err) {
    console.warn('Failed to fetch internal memos locally:', err);
    return [];
  }
};

export const deleteInternalMemoFromFirestore = async (id: string): Promise<void> => {
  try {
    const stored = localStorage.getItem('nmsa_internal_memos_v1');
    if (stored) {
      const list: InternalMemo[] = JSON.parse(stored);
      const filtered = list.filter((m) => m.id !== id);
      localStorage.setItem('nmsa_internal_memos_v1', JSON.stringify(filtered));
    }
  } catch (err) {
    console.warn('Failed to delete internal memo locally:', err);
  }
};

// Load initial config checking
initializeFirebaseApp();


import React, { useState, useEffect } from 'react';
import { Submission, CicilanPaymentRecord } from '../types';
import { 
  loadSubmissionsFromFirestore, 
  saveSubmissionToFirestore, 
  isFirebaseConfigured,
  googleDriveLogin,
  getStoredGoogleDriveToken,
  getConnectedDrives,
  saveActivityLogToFirestore,
  ensureValidDriveToken,
  getOrRenewDriveToken,
  getActiveGoogleDriveAccount,
  executeDriveApiWithAutoRefresh,
  ensureGoogleDriveFileSharing
} from '../firebase';
import { DriveAccountsManager } from './DriveAccountsManager';
import { 
  formatRupiah, 
  formatDateIndonesian, 
  convertImageToPdf, 
  compressImage, 
  mergeFilesToSinglePdf,
  isCicilanSubmission,
  getStandardDriveFolderName,
  getLegacyDriveFolderName
} from '../utils';
import { 
  ArrowLeft, 
  UploadCloud, 
  CheckCircle, 
  Search, 
  FileText, 
  X, 
  CreditCard,
  Building,
  Calendar,
  User,
  AlertCircle,
  Clock,
  Filter,
  Check,
  TrendingUp,
  TrendingDown,
  Info,
  CalendarDays,
  Tag,
  Coins,
  MapPin,
  ListFilter,
  SlidersHorizontal,
  Cloud,
  CheckSquare,
  Link,
  Plus,
  Trash2,
  DollarSign,
  Calculator,
  History,
  ExternalLink,
  Layers,
  ChevronRight,
  Receipt,
  FolderSync,
  Loader2
} from 'lucide-react';

interface InputBuktiTransferProps {
  onBack: () => void;
  submissions: Submission[];
  onUpdateSubmissions: (updatedSubmissions: Submission[]) => void;
  userProfile?: any;
}

export interface UploadedReceiptItem {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  base64: string;
  fileObject: File;
  previewUrl?: string;
}

export const InputBuktiTransfer: React.FC<InputBuktiTransferProps> = ({ 
  onBack, 
  submissions: parentSubmissions, 
  onUpdateSubmissions,
  userProfile
}) => {
  const [localSubmissions, setLocalSubmissions] = useState<Submission[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Advanced Filter state variables
  const [filterStatus, setFilterStatus] = useState<'All' | 'Belum Lunas' | 'DP / Cicilan' | 'Lunas'>('Belum Lunas');
  const [filterLocation, setFilterLocation] = useState<string>('All');
  const [filterJenis, setFilterJenis] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'tanggal-desc' | 'tanggal-asc' | 'nominal-desc' | 'nominal-asc'>('tanggal-desc');

  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  // Multiple files upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedReceiptItem[]>([]);
  
  // Cicilan & Payment Amount state
  const [paymentMode, setPaymentMode] = useState<'lunas' | 'cicilan'>('lunas');
  const [nominalBayar, setNominalBayar] = useState<number | ''>('');
  const [keteranganCicilan, setKeteranganCicilan] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const [isSuccess, setIsSuccess] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successDetails, setSuccessDetails] = useState<{
    kode: string;
    nominalBayar: number;
    sisa: number;
    status: string;
    fileCount: number;
    pdfUrl?: string;
    pdfName?: string;
  } | null>(null);

  // Google Drive state variables
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairMessage, setRepairMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Check Drive connection status on mount and userProfile changes
  useEffect(() => {
    const checkDrive = async () => {
      const token = await ensureValidDriveToken();
      if (token) {
        setIsDriveConnected(true);
      } else {
        const drives = getConnectedDrives();
        setIsDriveConnected(drives.length > 0);
      }
    };
    checkDrive();

    const onDriveUpdated = () => {
      const drives = getConnectedDrives();
      setIsDriveConnected(drives.length > 0 || !!getStoredGoogleDriveToken());
    };

    window.addEventListener('nusantara-drive-updated', onDriveUpdated);
    return () => {
      window.removeEventListener('nusantara-drive-updated', onDriveUpdated);
    };
  }, []);

  // Fetch newest submissions on startup
  useEffect(() => {
    const fetchLatest = async () => {
      setIsLoading(true);
      try {
        if (isFirebaseConfigured()) {
          const freshData = await loadSubmissionsFromFirestore(userProfile?.companyId);
          if (freshData && freshData.length > 0) {
            setLocalSubmissions(freshData);
            onUpdateSubmissions(freshData);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Fallback silent read to local state', err);
      }
      
      // Fallback
      setLocalSubmissions(parentSubmissions.length > 0 ? parentSubmissions : loadFromLocalStorage());
      setIsLoading(false);
    };

    fetchLatest();
  }, [userProfile]);

  const loadFromLocalStorage = (): Submission[] => {
    try {
      const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  };

  // Helper to calculate total for a submission
  const getSubmissionTotal = (sub: Submission): number => {
    return sub.items?.reduce((sum, item) => sum + (Number(item.total) || 0), 0) || 0;
  };

  // Helper to calculate cumulative already paid amount for a submission
  const getSubmissionPaid = (sub: Submission): number => {
    if (sub.status === 'Lunas') {
      return getSubmissionTotal(sub);
    }
    if (typeof sub.dpAmount === 'number' && sub.dpAmount > 0) {
      return sub.dpAmount;
    }
    if (sub.riwayatCicilan && sub.riwayatCicilan.length > 0) {
      const sumHist = sub.riwayatCicilan.reduce((sum, r) => sum + (Number(r.nominal) || 0), 0);
      if (sumHist > 0) return sumHist;
    }
    // Also check local cache for recovery
    try {
      const localStored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS') || localStorage.getItem('voucher_submissions');
      if (localStored) {
        const parsed = JSON.parse(localStored);
        if (Array.isArray(parsed)) {
          const match = parsed.find((p: any) => p.id === sub.id || (p.kode && p.kode === sub.kode));
          if (match && typeof match.dpAmount === 'number' && match.dpAmount > 0) {
            return match.dpAmount;
          }
        }
      }
    } catch (_) {}
    return sub.dpAmount || 0;
  };

  // Helper to calculate remaining unpaid balance for a submission
  const getSubmissionRemaining = (sub: Submission): number => {
    const total = getSubmissionTotal(sub);
    const paid = getSubmissionPaid(sub);
    return Math.max(0, total - paid);
  };

  // Handle selecting a submission from the list
  const handleSelectSubmission = (sub: Submission) => {
    setSelectedSubmission(sub);
    setErrorText('');
    setIsSuccess(false);
    setUploadedFiles([]);
    setShowHistory(false);

    const total = getSubmissionTotal(sub);
    const paid = getSubmissionPaid(sub);
    const remaining = Math.max(0, total - paid);

    if (isCicilanSubmission(sub)) {
      setPaymentMode('cicilan');
      setNominalBayar(remaining > 0 ? remaining : '');
      setKeteranganCicilan(sub.cicilanNotes ? `Cicilan Lanjutan` : 'Termin Pembayaran');
    } else {
      setPaymentMode('lunas');
      setNominalBayar(total);
      setKeteranganCicilan('');
    }
  };

  // ═════════ GOOGLE DRIVE DIR HIERARCHY HELPER ACTIONS ═════════
  const getOrCreateFolder = async (_initialToken: string, name: string, parentId: string): Promise<string> => {
    const cleanName = name.trim();
    const cleanSearchName = cleanName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = `name = '${cleanSearchName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    
    return executeDriveApiWithAutoRefresh(async (token) => {
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (searchRes.status === 401) {
        throw new Error('UNAUTHORIZED_401');
      }

      if (!searchRes.ok) {
        throw new Error(`Gagal mencari folder '${cleanName}': ${searchRes.statusText}`);
      }

      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }

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

      if (createRes.status === 401) {
        throw new Error('UNAUTHORIZED_401');
      }

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Gagal membuat folder '${cleanName}': ${errText}`);
      }

      const createdData = await createRes.json();
      return createdData.id;
    }, { actionName: `getOrCreateFolder(${cleanName})` });
  };

  const uploadFileToFolder = async (
    _initialToken: string,
    fileName: string,
    fileMimeType: string,
    fileBytes: Uint8Array,
    folderId: string
  ): Promise<{ url: string; name: string }> => {
    return executeDriveApiWithAutoRefresh(async (driveToken) => {
      // Check if file already exists in this folder to avoid duplicates
      try {
        const searchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
            `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`
          )}&fields=files(id)`,
          {
            headers: {
              Authorization: `Bearer ${driveToken}`,
            },
          }
        );

        if (searchRes.status === 401) throw new Error('UNAUTHORIZED_401');

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            for (const existingFile of searchData.files) {
              await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}`, {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${driveToken}`,
                },
              });
            }
          }
        }
      } catch (dupErr: any) {
        if (dupErr?.message?.includes('UNAUTHORIZED') || dupErr?.message?.includes('401')) throw dupErr;
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

      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${driveToken}`,
          },
          body: formData,
        }
      );

      if (res.status === 401) {
        throw new Error('UNAUTHORIZED_401');
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gagal mengunggah file '${fileName}' ke Drive: ${errorText}`);
      }

      const fileData = await res.json();

      try {
        await ensureGoogleDriveFileSharing(fileData.id, driveToken);
      } catch (perErr) {
        console.warn('Could not set permissions for uploaded file:', fileName, perErr);
      }

      return {
        url: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view?usp=drivesdk`,
        name: fileData.name || fileName,
      };
    }, { actionName: `upload ${fileName}` });
  };

  // Helper to recursively merge duplicate or legacy folder contents into the canonical transaction folder and remove duplicate
  const mergeFolderContents = async (token: string, sourceFolderId: string, destFolderId: string): Promise<void> => {
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${sourceFolderId}' in parents and trashed = false`
        )}&fields=files(id,name,mimeType)&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const items: Array<{ id: string; name: string; mimeType: string }> = data.files || [];
      
      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          const subDestFolderId = await getOrCreateFolder(token, item.name, destFolderId);
          await mergeFolderContents(token, item.id, subDestFolderId);
          await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => {});
        } else {
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${item.id}?addParents=${destFolderId}&removeParents=${sourceFolderId}`,
            {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}` }
            }
          ).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[Drive Merge] Gagal menggabungkan isi folder:', e);
    }
  };

  // Consolidates legacy folders (e.g. "Tiket Pesawat - Traveloka") into the official voucher folder in Drive
  const repairAndConsolidateDriveFolder = async (
    sub: Submission
  ): Promise<{ success: boolean; message: string; folderId?: string }> => {
    return executeDriveApiWithAutoRefresh(async (token) => {
      let yearStr = '';
      let monthStr = '';
      let dayStr = '';

      const parts = (sub.tanggal || '').split('-');
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

      const activeCompanyCode = (
        userProfile?.companyDetails?.code || 
        userProfile?.companyId || 
        sub.companyId || 
        'nmsa'
      ).toLowerCase().trim();
      const folderCompanyUpper = activeCompanyCode.toUpperCase();

      const rootId = 'root';
      const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
      const companyFolderId = await getOrCreateFolder(token, folderCompanyUpper, voucherAppId);
      const yearId = await getOrCreateFolder(token, yearStr, companyFolderId);
      const monthId = await getOrCreateFolder(token, monthStr, yearId);
      const dayId = await getOrCreateFolder(token, dayStr, monthId);

      const standardTxFolderName = getStandardDriveFolderName(sub);
      const legacyTxFolderName = getLegacyDriveFolderName(sub);
      const cleanKode = (sub.kode || '').trim().replace(/[\/\\?%*:|"<>.]/g, '-');

      // 1. Resolve official standard folder
      let targetFolderId: string | null = null;
      if (sub.googleDriveFolderId) {
        try {
          const chkRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${sub.googleDriveFolderId}?fields=id,name,parents,trashed`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (chkRes.ok) {
            const fInfo = await chkRes.json();
            if (!fInfo.trashed) {
              targetFolderId = fInfo.id;
              if (fInfo.name !== standardTxFolderName) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${targetFolderId}`, {
                  method: 'PATCH',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: standardTxFolderName }),
                }).catch(() => {});
              }
            }
          }
        } catch (_) {}
      }

      if (!targetFolderId) {
        const cleanSearchStandard = standardTxFolderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const qStd = `name = '${cleanSearchStandard}' and mimeType = 'application/vnd.google-apps.folder' and '${dayId}' in parents and trashed = false`;
        const resStd = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qStd)}&fields=files(id,name)`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resStd.ok) {
          const dataStd = await resStd.json();
          if (dataStd.files && dataStd.files.length > 0) {
            targetFolderId = dataStd.files[0].id;
          }
        }
      }

      if (!targetFolderId && cleanKode && cleanKode.length >= 4 && cleanKode !== 'HO') {
        const cleanSearchKode = cleanKode.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const qKode = `name contains '${cleanSearchKode}' and mimeType = 'application/vnd.google-apps.folder' and '${dayId}' in parents and trashed = false`;
        const resKode = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qKode)}&fields=files(id,name)`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resKode.ok) {
          const dataKode = await resKode.json();
          if (dataKode.files && dataKode.files.length > 0) {
            targetFolderId = dataKode.files[0].id;
            if (dataKode.files[0].name !== standardTxFolderName) {
              await fetch(`https://www.googleapis.com/drive/v3/files/${targetFolderId}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: standardTxFolderName }),
              }).catch(() => {});
            }
          }
        }
      }

      if (!targetFolderId) {
        const cleanSearchLegacy = legacyTxFolderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const qLeg = `name = '${cleanSearchLegacy}' and mimeType = 'application/vnd.google-apps.folder' and '${dayId}' in parents and trashed = false`;
        const resLeg = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qLeg)}&fields=files(id,name)`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resLeg.ok) {
          const dataLeg = await resLeg.json();
          if (dataLeg.files && dataLeg.files.length > 0) {
            targetFolderId = dataLeg.files[0].id;
            await fetch(`https://www.googleapis.com/drive/v3/files/${targetFolderId}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: standardTxFolderName }),
            }).catch(() => {});
          }
        }
      }

      if (!targetFolderId) {
        targetFolderId = await getOrCreateFolder(token, standardTxFolderName, dayId);
      }

      // 2. Scan and merge any duplicate folders under dayId
      let mergedCount = 0;
      const dayChildrenResp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${dayId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        )}&fields=files(id,name)&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (dayChildrenResp.ok) {
        const dayChildrenData = await dayChildrenResp.json();
        const childFolders: Array<{ id: string; name: string }> = dayChildrenData.files || [];
        
        const duplicateFolders = childFolders.filter(f => {
          if (f.id === targetFolderId) return false;
          if (f.name === legacyTxFolderName) return true;
          if (cleanKode && cleanKode.length >= 4 && cleanKode !== 'HO' && f.name.includes(cleanKode)) return true;
          return false;
        });

        for (const dup of duplicateFolders) {
          await mergeFolderContents(token, dup.id, targetFolderId);
          await fetch(`https://www.googleapis.com/drive/v3/files/${dup.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => {});
          mergedCount++;
        }
      }

      return {
        success: true,
        message: mergedCount > 0 
          ? `Berhasil menggabungkan ${mergedCount} folder duplikat ke dalam folder resmi "${standardTxFolderName}"!` 
          : `Folder resmi "${standardTxFolderName}" sudah rapi dan sesuai format standar.`,
        folderId: targetFolderId
      };
    }, { actionName: 'repairAndConsolidateDriveFolder' });
  };

  const handleManualFolderRepair = async () => {
    if (!selectedSubmission) return;
    setRepairLoading(true);
    setRepairMessage(null);
    try {
      const res = await repairAndConsolidateDriveFolder(selectedSubmission);
      setRepairMessage({ text: res.message, isError: !res.success });
      if (res.folderId && res.folderId !== selectedSubmission.googleDriveFolderId) {
        const updated = {
          ...selectedSubmission,
          googleDriveFolderId: res.folderId
        };
        setSelectedSubmission(updated);
        const nextList = localSubmissions.map(s => s.id === updated.id ? updated : s);
        setLocalSubmissions(nextList);
        onUpdateSubmissions(nextList);
        if (isFirebaseConfigured()) {
          const finalCompanyId = updated.companyId || 'nmsa';
          const finalCompanyName = updated.companyName || 'PT Nusantara Mineral Sukses Abadi';
          await saveSubmissionToFirestore(updated, finalCompanyId, finalCompanyName);
        }
      }
    } catch (e: any) {
      setRepairMessage({ text: `Gagal merapikan folder: ${e?.message || e}`, isError: true });
    } finally {
      setRepairLoading(false);
    }
  };


  // ═════════ MULTI-FILE PROCESSING ACTIONS ═════════
  const processFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    setErrorText('');
    setIsLoading(true);
    setSaveProgress(`Menyiapkan ${fileList.length} berkas bukti transfer...`);

    const newItems: UploadedReceiptItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const mimeType = file.type || '';
        const isImage = mimeType.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(file.name);

        if (isImage) {
          setSaveProgress(`Mengompresi gambar ${i + 1}/${fileList.length}: ${file.name}...`);
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const compressed = await compressImage(bytes, mimeType, 1200, 0.7);
          const blob = new Blob([compressed.bytes], { type: compressed.mimeType });
          const compressedFile = new File([blob], file.name, { type: compressed.mimeType });

          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(compressedFile);
          });

          newItems.push({
            id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${i}`,
            name: compressedFile.name,
            size: compressedFile.size,
            mimeType: compressed.mimeType,
            base64: base64Data,
            fileObject: compressedFile,
            previewUrl: base64Data
          });
        } else {
          if (file.size > 25 * 1024 * 1024) {
            setErrorText(`Berkas ${file.name} terlalu besar (maksimal 25 MB).`);
            continue;
          }
          setSaveProgress(`Membaca dokumen ${i + 1}/${fileList.length}: ${file.name}...`);
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          newItems.push({
            id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${i}`,
            name: file.name,
            size: file.size,
            mimeType: mimeType || 'application/pdf',
            base64: base64Data,
            fileObject: file
          });
        }
      } catch (err: any) {
        console.warn('Gagal memproses berkas:', file.name, err);
      }
    }

    setUploadedFiles(prev => [...prev, ...newItems]);
    setIsLoading(false);
    setSaveProgress('');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = ''; // Reset input to allow adding the same files or new ones
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleClearAllFiles = () => {
    setUploadedFiles([]);
  };

  // Calculations for current selected voucher
  const totalVoucher = selectedSubmission ? getSubmissionTotal(selectedSubmission) : 0;
  const alreadyPaid = selectedSubmission ? getSubmissionPaid(selectedSubmission) : 0;
  const sisaSebelumBayar = Math.max(0, totalVoucher - alreadyPaid);
  
  const currentPaymentNominal = paymentMode === 'lunas' 
    ? (sisaSebelumBayar > 0 ? sisaSebelumBayar : (totalVoucher > 0 ? totalVoucher : 0)) 
    : (typeof nominalBayar === 'number' ? nominalBayar : 0);

  const accumulatedPaid = alreadyPaid + currentPaymentNominal;
  const remainingDebt = Math.max(0, totalVoucher - accumulatedPaid);
  const willBeLunas = paymentMode === 'lunas' || accumulatedPaid >= totalVoucher || remainingDebt === 0;

  // Shortcut percentage button click
  const handleSetPercentage = (percent: number) => {
    if (sisaSebelumBayar <= 0) return;
    const calculated = Math.round((sisaSebelumBayar * percent) / 100);
    setNominalBayar(calculated);
    setKeteranganCicilan(percent === 100 ? 'Pelunasan Sisa' : `Cicilan ${percent}%`);
  };

  // ═════════ SUBMIT PAYMENT & MERGE TO 1 PDF ═════════
  const handleSubmitReceipt = async () => {
    if (!selectedSubmission) {
      setErrorText('Harap pilih salah satu pengajuan voucher terlebih dahulu.');
      return;
    }
    if (uploadedFiles.length === 0) {
      setErrorText('Harap sertakan minimal 1 file/foto bukti transfer.');
      return;
    }
    if (currentPaymentNominal <= 0) {
      setErrorText('Nominal pembayaran dari bukti transfer harus lebih besar dari Rp 0.');
      return;
    }

    setIsLoading(true);
    setErrorText('');
    setSaveProgress(`1/6. Menggabungkan ${uploadedFiles.length} berkas bukti transfer menjadi 1 file PDF pembayaran...`);

    try {
      const isInstallmentTx = paymentMode === 'cicilan' || isCicilanSubmission(selectedSubmission);
      const finalStatus: 'Lunas' | 'DP / Cicilan' = (!isInstallmentTx || willBeLunas) ? 'Lunas' : 'DP / Cicilan';

      const cleanJenis = (selectedSubmission.jenisPengajuan || 'Non-Kategori').replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
      const cleanPenerima = (selectedSubmission.dibayarkanKepada || 'Penerima').replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
      const baseMergedName = `Bukti Pembayaran - (${cleanJenis} - ${cleanPenerima})`;

      // 1. Merge all uploaded files into ONE single PDF!
      const mergeResult = await mergeFilesToSinglePdf(
        uploadedFiles.map(u => u.fileObject),
        baseMergedName
      );

      const pdfBytes = mergeResult.bytes;
      const formattedFileName = mergeResult.name;

      // Convert Uint8Array to base64 data URL
      let binary = '';
      const len = pdfBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(pdfBytes[i]);
      }
      const pdfBase64 = `data:application/pdf;base64,${window.btoa(binary)}`;

      let finalBuktiPembayaran = {
        url: pdfBase64,
        name: formattedFileName
      };

      // 1b. Preserve ALL existing files (including ALL previous payment proof files)
      let finalDriveFiles = [
        ...(selectedSubmission.googleDriveFiles || [])
      ];

      // If selectedSubmission.buktiPembayaran exists but is not in finalDriveFiles, ensure it is preserved
      if (selectedSubmission.buktiPembayaran && selectedSubmission.buktiPembayaran.url) {
        const alreadyInDrive = finalDriveFiles.some(f => f.url === selectedSubmission.buktiPembayaran?.url);
        if (!alreadyInDrive) {
          finalDriveFiles.push({
            url: selectedSubmission.buktiPembayaran.url,
            name: selectedSubmission.buktiPembayaran.name || 'Bukti Pembayaran Sebelumnya',
            isBuktiPembayaran: true
          });
        }
      }

      // 2. Google Drive upload
      let token: string | null = null;
      const activeAccount = getActiveGoogleDriveAccount();
      const connectedDrives = getConnectedDrives();
      const hasDriveSetup = connectedDrives.length > 0 || !!activeAccount?.email || isDriveConnected;

      if (hasDriveSetup) {
        setSaveProgress(`2/6. Menghubungkan akun Google Drive resmi (${activeAccount?.email || 'akuncoding211@gmail.com'})...`);
        try {
          token = await getOrRenewDriveToken(activeAccount?.email, true);
          if (token) {
            setIsDriveConnected(true);
          }
        } catch (tokErr: any) {
          console.warn('Gagal mendapatkan token Drive:', tokErr);
        }
      }

      if (token) {
        setSaveProgress('3/6. Menyusun struktur folder arsip di Google Drive...');
        let yearStr = '';
        let monthStr = '';
        let dayStr = '';

        const parts = (selectedSubmission.tanggal || '').split('-');
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

        let targetFolderId: string | undefined = undefined;

        try {
          setSaveProgress('3/6. Menyiapkan folder transaksi resmi di Google Drive...');
          const repairResult = await repairAndConsolidateDriveFolder(selectedSubmission);
          targetFolderId = repairResult.folderId;
          if (!targetFolderId) {
            throw new Error('Gagal mendapatkan atau membuat folder transaksi Google Drive');
          }

          const folderBuktiBayarId = await getOrCreateFolder(token, 'Bukti Pembayaran', targetFolderId);

          setSaveProgress('4/6. Mengunggah 1 file PDF Bukti Pembayaran gabungan ke Google Drive...');
          const uploadResult = await uploadFileToFolder(
            token,
            formattedFileName,
            'application/pdf',
            pdfBytes,
            folderBuktiBayarId
          );

          finalBuktiPembayaran = {
            url: uploadResult.url,
            name: uploadResult.name
          };

          // Append new payment proof without deleting previous ones
          finalDriveFiles.push({
            url: uploadResult.url,
            name: uploadResult.name,
            isBuktiPembayaran: true
          });

          console.log('[Drive Upload] Upload Bukti Pembayaran PDF berhasil:', uploadResult);
        } catch (driveErr: any) {
          console.warn('[Drive Upload] Gagal upload ke Drive, fallback ke lampiran lokal:', driveErr);
          finalDriveFiles.push({
            url: pdfBase64,
            name: formattedFileName,
            isBuktiPembayaran: true
          });
        }
      } else {
        finalDriveFiles.push({
          url: pdfBase64,
          name: formattedFileName,
          isBuktiPembayaran: true
        });
      }

      setSaveProgress('5/6. Memperbarui status & riwayat pembayaran transaksi...');

      let updatedSubmission: Submission;

      if (!isInstallmentTx) {
        // STANDARD NON-INSTALLMENT TRANSACTION:
        // Single full payment / standard transfer without installment breakdown.
        // Wipe any dummy cicilan fields and preserve clean standard voucher status.
        updatedSubmission = {
          ...selectedSubmission,
          status: 'Lunas',
          googleDriveFolderId: targetFolderId || selectedSubmission.googleDriveFolderId,
          dpAmount: undefined,
          cicilanNotes: undefined,
          riwayatCicilan: undefined,
          buktiPembayaran: finalBuktiPembayaran,
          googleDriveFiles: finalDriveFiles
        };
      } else {
        // INSTALLMENT TRANSACTION (DP / Cicilan Bertahap):
        const finalDpAmount: number = willBeLunas ? totalVoucher : accumulatedPaid;

        let finalCicilanNotes = selectedSubmission.cicilanNotes || '';
        if (willBeLunas) {
          if (keteranganCicilan) {
            finalCicilanNotes = `${keteranganCicilan} (LUNAS 100%)`;
          } else if (selectedSubmission.status === 'DP / Cicilan') {
            finalCicilanNotes = `${selectedSubmission.cicilanNotes ? selectedSubmission.cicilanNotes + ' - ' : ''}LUNAS (100%)`;
          } else {
            finalCicilanNotes = 'Lunas (100%)';
          }
        } else {
          finalCicilanNotes = keteranganCicilan || `Cicilan Rp ${formatRupiah(currentPaymentNominal)} (Sisa Rp ${formatRupiah(remainingDebt)})`;
        }

        const newInstallment: CicilanPaymentRecord = {
          id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tanggal: new Date().toISOString().split('T')[0],
          nominal: currentPaymentNominal,
          sisaSetelahBayar: remainingDebt,
          keterangan: keteranganCicilan || (willBeLunas ? 'Pelunasan Penuh' : 'Pembayaran Cicilan'),
          buktiPembayaran: finalBuktiPembayaran,
          createdAt: new Date().toISOString()
        };

        // Reconstruct & preserve complete payment history:
        let existingRiwayat: CicilanPaymentRecord[] = Array.isArray(selectedSubmission.riwayatCicilan) && selectedSubmission.riwayatCicilan.length > 0
          ? [...selectedSubmission.riwayatCicilan]
          : [];

        const priorProof = selectedSubmission.buktiPembayaran || 
          (selectedSubmission.googleDriveFiles || []).find(f => f.isBuktiPembayaran);

        if (existingRiwayat.length === 0 && alreadyPaid > 0) {
          existingRiwayat.push({
            id: `pay_initial_${selectedSubmission.id}`,
            tanggal: selectedSubmission.tanggal,
            nominal: alreadyPaid,
            sisaSetelahBayar: Math.max(0, totalVoucher - alreadyPaid),
            keterangan: selectedSubmission.cicilanNotes || 'Pembayaran DP / Termin Ke-1',
            buktiPembayaran: priorProof,
            createdAt: selectedSubmission.createdAt || selectedSubmission.tanggal
          });
        } else if (existingRiwayat.length > 0) {
          const sumExisting = existingRiwayat.reduce((s, r) => s + (Number(r.nominal) || 0), 0);
          if (alreadyPaid > sumExisting && (alreadyPaid - sumExisting) > 0) {
            const missingInitial = alreadyPaid - sumExisting;
            existingRiwayat.unshift({
              id: `pay_init_restored_${selectedSubmission.id}`,
              tanggal: selectedSubmission.tanggal,
              nominal: missingInitial,
              sisaSetelahBayar: Math.max(0, totalVoucher - missingInitial),
              keterangan: 'Pembayaran DP / Termin Ke-1',
              buktiPembayaran: priorProof,
              createdAt: selectedSubmission.createdAt || selectedSubmission.tanggal
            });
          }
        }

        const updatedRiwayat: CicilanPaymentRecord[] = [
          ...existingRiwayat,
          newInstallment
        ];

        updatedSubmission = {
          ...selectedSubmission,
          status: finalStatus,
          googleDriveFolderId: targetFolderId || selectedSubmission.googleDriveFolderId,
          dpAmount: finalDpAmount,
          cicilanNotes: finalCicilanNotes,
          riwayatCicilan: updatedRiwayat,
          buktiPembayaran: finalBuktiPembayaran,
          googleDriveFiles: finalDriveFiles
        };
      }

      setSaveProgress('6/6. Menyimpan data ke Firebase Firestore & backup lokal...');

      // Push to Firestore
      if (isFirebaseConfigured()) {
        const finalCompanyId = selectedSubmission.companyId || 'nmsa';
        const finalCompanyName = selectedSubmission.companyName || 'PT Nusantara Mineral Sukses Abadi';
        await saveSubmissionToFirestore(updatedSubmission, finalCompanyId, finalCompanyName);
      }

      // Sync local listing states
      const nextList = localSubmissions.map(sub => 
        sub.id === selectedSubmission.id ? updatedSubmission : sub
      );

      setLocalSubmissions(nextList);
      onUpdateSubmissions(nextList);

      // Save directly to localStorage as backup
      try {
        localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(nextList));
        const compId = selectedSubmission.companyId || userProfile?.companyId;
        if (compId) {
          localStorage.setItem(`NUSANTARA_HO_SUBMISSIONS_${compId}`, JSON.stringify(nextList));
        }
      } catch (localSaveErr) {
        console.warn('LocalStorage save failure:', localSaveErr);
      }

      // Audit Log
      try {
        const actionText = finalStatus === 'Lunas'
          ? `Melunasi voucher ${selectedSubmission.kode} (${selectedSubmission.dibayarkanKepada}) dengan pembayaran senilai Rp ${formatRupiah(currentPaymentNominal)}. Menggabungkan ${uploadedFiles.length} berkas bukti transfer menjadi 1 file PDF resmi.`
          : `Mencatat pembayaran cicilan voucher ${selectedSubmission.kode} (${selectedSubmission.dibayarkanKepada}) senilai Rp ${formatRupiah(currentPaymentNominal)}. Sisa tagihan: Rp ${formatRupiah(remainingDebt)}. Menggabungkan ${uploadedFiles.length} berkas bukti transfer menjadi 1 file PDF resmi.`;

        await saveActivityLogToFirestore(
          'pay_submission',
          actionText,
          'success',
          selectedSubmission.id,
          selectedSubmission.kode
        );
      } catch (logErr) {
        console.warn('Gagal mencatat log aktivitas:', logErr);
      }

      setSuccessDetails({
        kode: selectedSubmission.kode || 'BKK-VOUCHER',
        nominalBayar: currentPaymentNominal,
        sisa: remainingDebt,
        status: finalStatus,
        fileCount: uploadedFiles.length,
        pdfUrl: finalBuktiPembayaran.url,
        pdfName: finalBuktiPembayaran.name
      });

      setIsSuccess(true);
      setUploadedFiles([]);
      setSelectedSubmission(null);
    } catch (err: any) {
      console.error(err);
      setErrorText(`Gagal memproses bukti pembayaran: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
      setSaveProgress('');
    }
  };

  // Compile unique lists for drop-down filters dynamically
  const uniqueLocations = Array.from(new Set(localSubmissions.map(s => s.lokasi).filter(Boolean)));
  const uniqueJenis = Array.from(new Set(localSubmissions.map(s => s.jenisPengajuan).filter(Boolean)));

  // Filter Submissions based on search + filters
  const filteredSubmissions = localSubmissions.filter(sub => {
    // 1. Text Search query filter
    const q = searchQuery.toLowerCase();
    const matchesCode = (sub.kode || '').toLowerCase().includes(q);
    const matchesRecipient = (sub.dibayarkanKepada || '').toLowerCase().includes(q);
    const matchesType = (sub.jenisPengajuan || '').toLowerCase().includes(q);
    
    // Check item details of each submission
    const matchesItems = sub.items?.some(item => 
      (item.item || '').toLowerCase().includes(q) || 
      (item.keterangan || '').toLowerCase().includes(q)
    );

    const matchesSearch = matchesCode || matchesRecipient || matchesType || matchesItems || q === '';

    // 2. Status Filter
    let matchesStatus = true;
    if (filterStatus === 'Lunas') {
      matchesStatus = sub.status === 'Lunas';
    } else if (filterStatus === 'DP / Cicilan') {
      matchesStatus = sub.status === 'DP / Cicilan';
    } else if (filterStatus === 'Belum Lunas') {
      matchesStatus = sub.status !== 'Lunas';
    }

    // 3. Location Filter
    const matchesLocation = 
      filterLocation === 'All' ? true : 
      sub.lokasi === filterLocation;

    // 4. Category / Jenis Filter
    const matchesJenis = 
      filterJenis === 'All' ? true : 
      sub.jenisPengajuan === filterJenis;

    return matchesSearch && matchesStatus && matchesLocation && matchesJenis;
  });

  // Sort submissions based on dropdown choice
  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    if (sortBy === 'tanggal-desc') {
      return (b.tanggal || '').localeCompare(a.tanggal || '');
    } else if (sortBy === 'tanggal-asc') {
      return (a.tanggal || '').localeCompare(b.tanggal || '');
    } else if (sortBy === 'nominal-desc') {
      return getSubmissionTotal(b) - getSubmissionTotal(a);
    } else if (sortBy === 'nominal-asc') {
      return getSubmissionTotal(a) - getSubmissionTotal(b);
    }
    return 0;
  });

  // KPI calculations
  const totalSubmissionsCount = localSubmissions.length;
  const paidCount = localSubmissions.filter(s => s.status === 'Lunas').length;
  const cicilanCount = localSubmissions.filter(s => s.status === 'DP / Cicilan').length;
  const unpaidCount = localSubmissions.filter(s => (s.status || 'Belum Lunas') === 'Belum Lunas').length;

  const totalOutstandingDebt = localSubmissions.reduce((sum, s) => {
    return sum + getSubmissionRemaining(s);
  }, 0);

  return (
    <div className="max-w-7xl mx-auto py-2 px-1 sm:px-3">
      
      {/* CARD CONTEXT */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden transition-all duration-300">
        
        {/* PREMIUM GOLD TOP BAR ACCENT */}
        <div className="h-2 bg-gradient-to-r from-stone-850 via-[#D4AF37] to-stone-900"></div>

        {/* INTERACTIVE COMPONENT HEADER */}
        <div className="p-6 sm:p-8 border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-50/50">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1 px-3 bg-amber-500/10 text-[#a58421] rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border border-amber-500/20">
                Divisi Keuangan • Nusantara Portal
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight font-sans flex items-center gap-2.5">
              <span>Input Pembayaran & Cicilan Bukti Transfer</span>
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 font-medium">
              Upload tanda bukti transfer (bisa lebih dari 1 file & digabungkan otomatis jadi 1 PDF), input nominal pembayaran cicilan, dan deteksi sisa tagihan secara real-time.
            </p>
          </div>
          
          <button
            onClick={onBack}
            className="flex items-center justify-center gap-1.5 px-4.5 py-2.5 border border-stone-200 hover:border-stone-350 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-xl transition cursor-pointer font-mono shrink-0 shadow-3xs"
          >
            <ArrowLeft size={13} />
            <span>KEMBALI KE PORTAL UTAMA</span>
          </button>
        </div>

        {/* MAIN BODY AREA */}
        <div className="p-4 sm:p-6 space-y-6">
          
          {/* KPI BLOCKS: QUICK REVIEW STATS */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            
            <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-stone-400 font-bold uppercase tracking-wider block">Total Voucher</span>
                <span className="text-lg font-black text-stone-900">{totalSubmissionsCount}</span>
              </div>
              <div className="p-2 bg-stone-100 rounded-lg text-stone-600">
                <SlidersHorizontal size={15} />
              </div>
            </div>

            <div className="bg-rose-50/40 rounded-xl p-3.5 border border-rose-200/80 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-rose-600 font-bold uppercase tracking-wider block">Belum Lunas</span>
                <span className="text-lg font-black text-rose-700">{unpaidCount}</span>
              </div>
              <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                <Clock size={15} />
              </div>
            </div>

            <div className="bg-amber-50/50 rounded-xl p-3.5 border border-amber-200 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-amber-700 font-bold uppercase tracking-wider block">DP / Cicilan</span>
                <span className="text-lg font-black text-amber-800">{cicilanCount}</span>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Coins size={15} />
              </div>
            </div>

            <div className="bg-emerald-50/30 rounded-xl p-3.5 border border-emerald-200/80 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-emerald-700 font-bold uppercase tracking-wider block">Lunas (Paid)</span>
                <span className="text-lg font-black text-emerald-800">{paidCount}</span>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                <CheckCircle size={15} />
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-stone-900 text-stone-100 rounded-xl p-3.5 border border-stone-850 flex items-center justify-between shadow-2xs">
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-stone-400 font-bold uppercase tracking-wider block">Sisa Tagihan Belum Lunas</span>
                <span className="text-sm sm:text-base font-black text-amber-400 font-mono tracking-tight truncate block">
                  Rp {formatRupiah(totalOutstandingDebt)}
                </span>
              </div>
              <div className="p-2 bg-stone-800 rounded-lg text-amber-400 shrink-0">
                <DollarSign size={15} />
              </div>
            </div>

          </div>

          {/* ADVANCED FILTER TOOLBAR */}
          <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3.5">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
              <Filter size={14} className="text-amber-500" />
              <h2 className="text-xs font-mono font-black text-stone-800 uppercase tracking-widest">Filter & Pencarian Voucher Transaksi</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              
              {/* Search String */}
              <div className="md:col-span-4 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Cari Kode, Penerima, atau Item</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Contoh: HO-01, Vendor, Bahan Bakar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-1.5 bg-white text-xs text-stone-900 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="md:col-span-3 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Status Pembayaran</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                >
                  <option value="Belum Lunas">⏳ Belum Lunas (Termasuk DP / Cicilan)</option>
                  <option value="DP / Cicilan">🪙 Sedang Cicilan / Bertahap</option>
                  <option value="Lunas">✅ Lunas Penuh (100%)</option>
                  <option value="All">📂 Semua Transaksi</option>
                </select>
              </div>

              {/* Location */}
              <div className="md:col-span-2 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Lokasi Pengajuan</label>
                <select
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none"
                >
                  <option value="All">Semua Lokasi</option>
                  {uniqueLocations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div className="md:col-span-3 space-y-1">
                <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase">Kategori / Sortir</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full bg-white border border-stone-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none font-mono"
                >
                  <option value="tanggal-desc">📆 Tanggal Terbaru</option>
                  <option value="tanggal-asc">📆 Tanggal Terlama</option>
                  <option value="nominal-desc">💰 Nominal Tertinggi</option>
                  <option value="nominal-asc">💰 Nominal Terendah</option>
                </select>
              </div>

            </div>
          </div>

          {/* DUAL COLUMN SPLIT BOARD */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT SIDE: LIST OF VOUCHERS (7 COLS) */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h3 className="text-xs font-mono font-black text-stone-400 uppercase tracking-widest block">
                  Daftar Voucher Transaksi ({sortedSubmissions.length})
                </h3>
                <span className="text-[10px] text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full font-bold">
                  Klik item untuk input pembayaran & cicilan
                </span>
              </div>

              {isLoading ? (
                <div className="p-16 border rounded-xl bg-white text-center text-stone-400 text-xs">
                  <span className="inline-block w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-3"></span>
                  <p className="font-mono">Menyelaraskan data real-time dengan database...</p>
                </div>
              ) : sortedSubmissions.length === 0 ? (
                <div className="p-16 border-2 border-dashed border-stone-200 rounded-xl bg-white text-center text-stone-450 text-xs space-y-2">
                  <SlidersHorizontal size={24} className="mx-auto text-stone-300" />
                  <p className="font-bold">Tidak Menemukan Data Transaksi</p>
                  <p className="text-[11px] text-stone-400">Silakan sesuaikan filter pencarian, status, atau kategori di atas.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
                  {sortedSubmissions.map((sub) => {
                    const totalVoucher = getSubmissionTotal(sub);
                    const paidVoucher = getSubmissionPaid(sub);
                    const remainingVoucher = getSubmissionRemaining(sub);
                    const isSelected = selectedSubmission?.id === sub.id;
                    const isLunas = sub.status === 'Lunas';
                    const isCicilan = isCicilanSubmission(sub);

                    return (
                      <div
                        key={sub.id}
                        onClick={() => handleSelectSubmission(sub)}
                        className={`p-3.5 border rounded-xl bg-white transition shadow-3xs cursor-pointer flex flex-col sm:flex-row gap-3 sm:items-center justify-between group text-xs text-stone-600 ${
                          isSelected 
                            ? 'border-amber-450 ring-2 ring-amber-200 bg-amber-50/15' 
                            : 'border-stone-200 hover:border-amber-300 hover:bg-stone-50/50'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1 min-w-0 pr-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span 
                              className="font-sans text-stone-900 font-extrabold text-sm tracking-tight group-hover:text-amber-700 transition block truncate max-w-full"
                              title={sub.items && sub.items.length > 0 ? sub.items.map(i => i.item).filter(Boolean).join(', ') : sub.jenisPengajuan}
                            >
                              {sub.items && sub.items.length > 0 
                                ? sub.items.map(i => i.item).filter(Boolean).join(', ') 
                                : sub.jenisPengajuan || 'Non-Kategori'}
                            </span>
                            
                            <span className="text-[10px] bg-amber-50 text-[#a58421] border border-amber-200 px-1.5 py-0.5 rounded font-mono font-bold whitespace-nowrap">
                              {sub.kode || 'BKK-VOUCHER'}
                            </span>
                            
                            <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-mono font-bold">
                              {sub.lokasi || 'N/A'}
                            </span>

                            {/* Status Badges */}
                            {isLunas && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black font-mono rounded uppercase border border-emerald-250">
                                <CheckCircle size={10} className="fill-emerald-50" />
                                LUNAS
                              </span>
                            )}
                            {isCicilan && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-black font-mono rounded uppercase border border-amber-300">
                                <Coins size={10} />
                                DP / CICILAN
                              </span>
                            )}
                            {!isLunas && !isCicilan && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-black font-mono rounded uppercase border border-rose-200">
                                <Clock size={10} />
                                BELUM LUNAS
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-stone-500 font-sans text-[11px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <User size={11} className="text-stone-400 shrink-0" />
                              <span className="truncate">Kepada: <strong className="text-stone-800 font-medium">{sub.dibayarkanKepada || '-'}</strong></span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CalendarDays size={11} className="text-stone-400 shrink-0" />
                              <span>{formatDateIndonesian(sub.tanggal)}</span>
                            </div>
                          </div>

                          {/* Cicilan Details on Card if available */}
                          {isCicilan && (
                            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono pt-0.5">
                              <span className="text-emerald-700 font-semibold bg-emerald-50/80 px-1.5 py-0.5 rounded border border-emerald-200">
                                Terbayar: Rp {formatRupiah(paidVoucher)}
                              </span>
                              <span className="text-rose-700 font-bold bg-rose-50/80 px-1.5 py-0.5 rounded border border-rose-200">
                                Sisa: Rp {formatRupiah(remainingVoucher)}
                              </span>
                              {sub.riwayatCicilan && sub.riwayatCicilan.length > 0 && (
                                <span className="text-stone-400 text-[9px]">
                                  ({sub.riwayatCicilan.length}x pembayaran)
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Nominal right box */}
                        <div className="text-left sm:text-right font-mono shrink-0 sm:pl-3 border-t sm:border-t-0 sm:border-l border-stone-100 pt-2 sm:pt-0">
                          <span className="text-[9px] text-stone-400 font-bold block uppercase">
                            {isCicilan ? 'TOTAL TAGIHAN' : 'NOMINAL VOUCHER'}
                          </span>
                          <span className={`text-sm sm:text-base font-black tracking-tight ${isLunas ? 'text-stone-700' : 'text-stone-900'}`}>
                            Rp {formatRupiah(totalVoucher)}
                          </span>
                          {isCicilan && (
                            <span className="block text-[10px] text-rose-600 font-bold mt-0.5">
                              Sisa: Rp {formatRupiah(remainingVoucher)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT SIDE: SELECTED CONTEXT WORKSPACE & MULTI-FILE UPLOADER & CICILAN (5 COLS) */}
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-xs font-mono font-black text-stone-400 uppercase tracking-widest block">
                Form Input Pembayaran & Bukti Transfer
              </h3>

              {/* GOOGLE DRIVE INTEGRATION STATUS */}
              <DriveAccountsManager onConnectionChange={setIsDriveConnected} />

              {/* SUCCESS BANNER */}
              {isSuccess && successDetails && (
                <div className="p-5 border border-emerald-200 bg-emerald-50/50 rounded-2xl text-center space-y-3.5 animate-fade-in shadow-2xs">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-300 shadow-3xs">
                    <CheckCircle size={24} className="stroke-[2.5]" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-stone-900 uppercase tracking-wider font-mono">
                      PEMBAYARAN BERHASIL DISIMPAN!
                    </h4>
                    <p className="text-stone-600 text-xs leading-relaxed">
                      Bukti transfer untuk voucher <strong className="font-mono text-stone-900">{successDetails.kode}</strong> telah berhasil diproses.
                    </p>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-emerald-200 text-left font-mono text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Nominal Dibayar:</span>
                      <strong className="text-emerald-700 font-bold">Rp {formatRupiah(successDetails.nominalBayar)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Status Transaksi:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        successDetails.status === 'Lunas' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {successDetails.status}
                      </span>
                    </div>
                    {successDetails.sisa > 0 && (
                      <div className="flex justify-between text-rose-700">
                        <span>Sisa Belum Lunas:</span>
                        <strong className="font-black">Rp {formatRupiah(successDetails.sisa)}</strong>
                      </div>
                    )}
                    <div className="flex justify-between text-stone-500 pt-1 border-t border-stone-100">
                      <span>Dokumen Bukti:</span>
                      <span className="text-stone-800 font-semibold">{successDetails.fileCount} file ➔ 1 PDF Gabungan</span>
                    </div>
                  </div>

                  {successDetails.pdfUrl && (
                    <a
                      href={successDetails.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-[11px] font-bold uppercase tracking-wider rounded-xl transition shadow-3xs"
                    >
                      <ExternalLink size={13} />
                      <span>Buka File PDF Bukti Pembayaran</span>
                    </a>
                  )}

                  <button
                    onClick={() => {
                      setIsSuccess(false);
                      setSuccessDetails(null);
                    }}
                    className="w-full py-2 bg-stone-900 hover:bg-stone-850 text-white font-mono text-[10px] font-bold uppercase tracking-wider rounded-xl transition"
                  >
                    Input Pembayaran Transaksi Lain
                  </button>
                </div>
              )}

              {/* EMPTY PLACEHOLDER WHEN NOTHING SELECTED */}
              {!isSuccess && !selectedSubmission && (
                <div className="p-8 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50/50 text-center text-stone-400 text-xs flex flex-col items-center justify-center min-h-[360px] space-y-3">
                  <div className="p-3 bg-white rounded-xl shadow-3xs border border-stone-150">
                    <ListFilter size={24} className="text-[#D4AF37]" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-stone-700 text-sm">Pilih Voucher yang Ingin Dibayar</p>
                    <p className="text-[11px] text-stone-400 px-4 leading-relaxed">
                      Silakan pilih salah satu data transaksi dari daftar sebelah kiri. Anda dapat mengunggah beberapa bukti transfer (otomatis digabung menjadi 1 PDF) dan mencatat nominal cicilan.
                    </p>
                  </div>
                </div>
              )}

              {/* ACTIVE WORKSPACE WHEN SUBMISSION IS SELECTED */}
              {!isSuccess && selectedSubmission && (
                <div className="border border-stone-200 rounded-2xl bg-white p-4 sm:p-5 space-y-4 shadow-sm animate-fade-in">
                  
                  {/* Miniature Detail card */}
                  <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-stone-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <Receipt size={12} className="text-[#a58421]" />
                        <span>RINCIAN TRANSAKSI</span>
                      </span>
                      <button 
                        onClick={() => setSelectedSubmission(null)}
                        className="text-stone-400 hover:text-stone-600 p-0.5 rounded transition"
                        title="Tutup pilihan"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-stone-900 font-bold font-mono text-sm">
                        <span>{selectedSubmission.kode}</span>
                        {selectedSubmission.status === 'Lunas' ? (
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase rounded font-mono border border-emerald-200">
                            Lunas
                          </span>
                        ) : selectedSubmission.status === 'DP / Cicilan' ? (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 text-[9px] font-bold uppercase rounded font-mono border border-amber-300">
                            DP / Cicilan
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 text-[9px] font-bold uppercase rounded font-mono border border-rose-200">
                            Belum Lunas
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500">{formatDateIndonesian(selectedSubmission.tanggal)}</p>
                    </div>

                    <div className="h-px bg-stone-200" />

                    <div className="space-y-1 text-[11px] text-stone-600">
                      <div className="flex justify-between">
                        <span className="text-stone-400 font-medium">Dibayarkan Kepada:</span>
                        <strong className="text-stone-800 font-bold">{selectedSubmission.dibayarkanKepada || '-'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400 font-medium">Kategori / Lokasi:</span>
                        <span className="text-stone-800">{selectedSubmission.jenisPengajuan || '-'} • {selectedSubmission.lokasi || '-'}</span>
                      </div>
                      {selectedSubmission.rekeningTujuan && (
                        <div className="flex justify-between">
                          <span className="text-stone-400 font-medium">Rekening Tujuan:</span>
                          <strong className="text-stone-800 font-mono text-[10px]">{selectedSubmission.rekeningTujuan}</strong>
                        </div>
                      )}
                      <div className="pt-1.5 flex justify-between items-baseline border-t border-stone-200">
                        <span className="text-stone-400 text-[10px] font-black uppercase tracking-wider font-mono">TOTAL NILAI:</span>
                        <strong className="text-sm font-black text-stone-900 font-mono">
                          Rp {formatRupiah(totalVoucher)}
                        </strong>
                      </div>

                      {/* Google Drive Standard Folder Info & Quick Consolidate / Repair Button */}
                      <div className="pt-2 border-t border-stone-200 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-stone-400 font-mono uppercase tracking-wider flex items-center gap-1">
                            <Cloud size={11} className="text-blue-500" />
                            Folder Drive:
                          </span>
                          <span className="font-mono text-stone-700 font-semibold truncate max-w-[210px]" title={getStandardDriveFolderName(selectedSubmission)}>
                            {getStandardDriveFolderName(selectedSubmission)}
                          </span>
                        </div>
                        {isDriveConnected && (
                          <button
                            type="button"
                            onClick={handleManualFolderRepair}
                            disabled={repairLoading}
                            className="w-full py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                            title="Periksa dan gabungkan folder duplikat (seperti Tiket Pesawat - Traveloka) ke folder resmi voucher ini"
                          >
                            {repairLoading ? (
                              <>
                                <Loader2 size={11} className="animate-spin" />
                                <span>Memeriksa & Merapikan Folder Drive...</span>
                              </>
                            ) : (
                              <>
                                <FolderSync size={11} />
                                <span>Periksa & Rapikan Folder Duplikat Drive</span>
                              </>
                            )}
                          </button>
                        )}
                        {repairMessage && (
                          <div className={`p-2 rounded-lg text-[10px] font-mono ${repairMessage.isError ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                            {repairMessage.text}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PAST INSTALLMENT HISTORY COLLAPSIBLE IF ANY */}
                  {(() => {
                    const displayHistory: CicilanPaymentRecord[] = (selectedSubmission.riwayatCicilan && selectedSubmission.riwayatCicilan.length > 0)
                      ? selectedSubmission.riwayatCicilan
                      : (alreadyPaid > 0 ? [{
                          id: 'init_rec',
                          tanggal: selectedSubmission.tanggal,
                          nominal: alreadyPaid,
                          sisaSetelahBayar: Math.max(0, totalVoucher - alreadyPaid),
                          keterangan: selectedSubmission.cicilanNotes || 'Pembayaran DP / Termin Awal',
                          createdAt: selectedSubmission.createdAt
                        }] : []);

                    if (displayHistory.length === 0) return null;

                    return (
                      <div className="border border-stone-200 rounded-xl overflow-hidden bg-stone-50/70 text-xs">
                        <button
                          type="button"
                          onClick={() => setShowHistory(!showHistory)}
                          className="w-full p-2.5 bg-stone-100 hover:bg-stone-200/70 flex items-center justify-between text-stone-700 font-mono font-bold text-[11px] transition"
                        >
                          <span className="flex items-center gap-1.5">
                            <History size={13} className="text-amber-600" />
                            <span>Riwayat Pembayaran Cicilan ({displayHistory.length})</span>
                          </span>
                          <span className="text-stone-400 text-[10px]">
                            {showHistory ? 'Tutup ▲' : 'Buka ▼'}
                          </span>
                        </button>
                        
                        {showHistory && (
                          <div className="p-3 space-y-2 border-t border-stone-200 max-h-48 overflow-y-auto">
                            {displayHistory.map((rec, idx) => (
                              <div key={rec.id || idx} className="p-2 bg-white rounded-lg border border-stone-200 flex items-center justify-between font-mono text-[10px]">
                                <div>
                                  <span className="text-stone-400 block">{formatDateIndonesian(rec.tanggal)}</span>
                                  <span className="font-bold text-stone-800">{rec.keterangan || `Pembayaran ke-${idx + 1}`}</span>
                                </div>
                                <div className="text-right">
                                  <span className="font-black text-emerald-700 block">Rp {formatRupiah(rec.nominal)}</span>
                                  <span className="text-stone-400 text-[9px]">Sisa: Rp {formatRupiah(rec.sisaSetelahBayar)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* PEMBAYARAN CICILAN / LUNAS SECTION */}
                  <div className="p-3.5 bg-amber-50/40 rounded-xl border border-amber-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-black text-stone-800 uppercase tracking-widest flex items-center gap-1.5">
                        <Calculator size={13} className="text-[#a58421]" />
                        <span>METODE & NOMINAL PEMBAYARAN</span>
                      </span>
                      <span className="text-[10px] font-mono text-amber-700 font-bold bg-amber-100/80 px-2 py-0.5 rounded">
                        {paymentMode === 'lunas' ? 'Lunas 100%' : 'Cicilan Bertahap'}
                      </span>
                    </div>

                    {/* Mode Toggle Switch */}
                    <div className="grid grid-cols-2 gap-2 bg-white p-1 rounded-xl border border-amber-200 text-xs font-mono font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMode('lunas');
                          setNominalBayar(sisaSebelumBayar);
                          setKeteranganCicilan('');
                        }}
                        className={`py-1.5 px-2 rounded-lg transition text-center flex items-center justify-center gap-1.5 ${
                          paymentMode === 'lunas'
                            ? 'bg-emerald-600 text-white shadow-3xs'
                            : 'text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        <CheckCircle size={12} />
                        <span>Pelunasan Penuh</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMode('cicilan');
                          if (nominalBayar === '' || nominalBayar === totalVoucher) {
                            setNominalBayar(sisaSebelumBayar > 0 ? sisaSebelumBayar : '');
                          }
                          if (!keteranganCicilan) {
                            setKeteranganCicilan(alreadyPaid > 0 ? 'Cicilan Lanjutan' : 'DP Pembayaran');
                          }
                        }}
                        className={`py-1.5 px-2 rounded-lg transition text-center flex items-center justify-center gap-1.5 ${
                          paymentMode === 'cicilan'
                            ? 'bg-amber-600 text-white shadow-3xs'
                            : 'text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        <Coins size={12} />
                        <span>Cicilan / Bertahap</span>
                      </button>
                    </div>

                    {/* Input Nominal Transfer */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-stone-700">
                          {paymentMode === 'lunas' 
                            ? 'Nominal Pelunasan (Rp)' 
                            : 'Nominal dari Bukti Transfer Kali Ini (Rp) *'}
                        </label>
                        {paymentMode === 'cicilan' && (
                          <span className="text-[10px] text-stone-500 font-mono">
                            Maks: Rp {formatRupiah(sisaSebelumBayar)}
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-stone-400 font-mono">
                          Rp
                        </span>
                        <input
                          type="text"
                          disabled={paymentMode === 'lunas'}
                          placeholder="0"
                          value={
                            paymentMode === 'lunas' 
                              ? formatRupiah(sisaSebelumBayar) 
                              : (nominalBayar !== '' ? formatRupiah(Number(nominalBayar) || 0) : '')
                          }
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            const val = raw ? Number(raw) : '';
                            setNominalBayar(val);
                          }}
                          className={`w-full pl-9 pr-3 py-2 bg-white border rounded-xl text-sm font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                            paymentMode === 'lunas' 
                              ? 'bg-stone-50 border-stone-200 text-stone-700 cursor-not-allowed' 
                              : 'border-amber-300'
                          }`}
                        />
                      </div>

                      {/* Quick percentage helper buttons for Cicilan */}
                      {paymentMode === 'cicilan' && sisaSebelumBayar > 0 && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-mono text-stone-400 font-semibold mr-1">Isi Cepat:</span>
                          <button
                            type="button"
                            onClick={() => handleSetPercentage(25)}
                            className="px-2 py-0.5 bg-white hover:bg-amber-100 text-stone-700 border border-stone-200 hover:border-amber-300 rounded font-mono text-[10px] font-bold transition"
                          >
                            25%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetPercentage(50)}
                            className="px-2 py-0.5 bg-white hover:bg-amber-100 text-stone-700 border border-stone-200 hover:border-amber-300 rounded font-mono text-[10px] font-bold transition"
                          >
                            50%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetPercentage(75)}
                            className="px-2 py-0.5 bg-white hover:bg-amber-100 text-stone-700 border border-stone-200 hover:border-amber-300 rounded font-mono text-[10px] font-bold transition"
                          >
                            75%
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetPercentage(100)}
                            className="px-2 py-0.5 bg-amber-500 hover:bg-amber-600 text-white rounded font-mono text-[10px] font-bold transition"
                          >
                            Lunasi Sisa (100%)
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Keterangan Termin / Cicilan */}
                    {paymentMode === 'cicilan' && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-stone-700 block">
                          Keterangan Termin / Tahapan Pembayaran
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: DP 50%, Termin ke-2, Cicilan Pelunasan..."
                          value={keteranganCicilan}
                          onChange={(e) => setKeteranganCicilan(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </div>
                    )}

                    {/* LIVE CALCULATION SISA TAGIHAN CARD */}
                    <div className="p-3 bg-white rounded-xl border border-amber-200/80 space-y-2 font-mono text-xs shadow-3xs">
                      <div className="flex justify-between text-stone-500">
                        <span>Total Nilai Voucher:</span>
                        <strong className="text-stone-800">Rp {formatRupiah(totalVoucher)}</strong>
                      </div>
                      {alreadyPaid > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>Sudah Terbayar Sebelumnya:</span>
                          <strong className="font-bold">Rp {formatRupiah(alreadyPaid)}</strong>
                        </div>
                      )}
                      <div className="flex justify-between text-amber-700 font-semibold border-t border-stone-100 pt-1.5">
                        <span>Pembayaran Bukti Transfer Ini:</span>
                        <strong className="font-black">+ Rp {formatRupiah(currentPaymentNominal)}</strong>
                      </div>
                      <div className="flex justify-between items-center text-stone-800 border-t border-stone-200 pt-1.5">
                        <span className="font-black uppercase text-[11px]">SISA YANG HARUS DIBAYARKAN:</span>
                        <span className={`text-sm font-black ${remainingDebt === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          Rp {formatRupiah(remainingDebt)}
                        </span>
                      </div>

                      {/* Status Target Indicator */}
                      <div className="pt-1">
                        {willBeLunas ? (
                          <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[10px] font-sans flex items-center gap-1.5 font-bold">
                            <CheckCircle size={12} className="text-emerald-600 shrink-0" />
                            <span>Pembayaran ini akan melunasi voucher! Status berubah menjadi <strong>LUNAS</strong>.</span>
                          </div>
                        ) : (
                          <div className="p-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[10px] font-sans flex items-center gap-1.5 font-medium">
                            <Coins size={12} className="text-amber-600 shrink-0" />
                            <span>Masih ada sisa Rp {formatRupiah(remainingDebt)}. Status voucher akan menjadi <strong>DP / CICILAN</strong>.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MULTI-FILE UPLOAD ZONE (BUKTI TRANSFER BISA LEBIH DARI 1) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Layers size={13} className="text-amber-500" />
                        <span>UNGGAH BUKTI TRANSFER (BISA &gt; 1 BERKAS)</span>
                      </label>
                      {uploadedFiles.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAllFiles}
                          className="text-[10px] font-mono text-rose-600 hover:underline"
                        >
                          Hapus Semua ({uploadedFiles.length})
                        </button>
                      )}
                    </div>

                    {/* UPLOADED FILES LIST IF ANY */}
                    {uploadedFiles.length > 0 && (
                      <div className="space-y-2">
                        <div className="p-2.5 bg-amber-500/10 border border-amber-300 rounded-xl flex items-center justify-between text-xs font-mono">
                          <span className="font-bold text-amber-900 flex items-center gap-1.5">
                            <Layers size={14} className="text-[#a58421]" />
                            <span>{uploadedFiles.length} Berkas Bukti Transfer Terpilih</span>
                          </span>
                          <span className="text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-bold">
                            Digabung Jadi 1 PDF
                          </span>
                        </div>

                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {uploadedFiles.map((fileItem, idx) => (
                            <div 
                              key={fileItem.id} 
                              className="p-2 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {fileItem.mimeType.startsWith('image/') && fileItem.previewUrl ? (
                                  <img 
                                    src={fileItem.previewUrl} 
                                    alt="Preview" 
                                    className="w-8 h-8 object-cover rounded border border-stone-200 shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-stone-200 flex items-center justify-center text-stone-600 shrink-0">
                                    <FileText size={16} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-mono font-bold text-stone-850 truncate text-[11px] max-w-[200px]" title={fileItem.name}>
                                    {idx + 1}. {fileItem.name}
                                  </p>
                                  <p className="text-[9px] text-stone-400 font-mono">
                                    {(fileItem.size / 1024).toFixed(1)} KB • {fileItem.mimeType.includes('pdf') ? 'Dokumen PDF' : 'Gambar'}
                                  </p>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveFile(fileItem.id)}
                                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-stone-200/70 rounded-lg transition"
                                title="Hapus berkas ini"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* DROPZONE / ADD BUTTON */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center gap-2 transition cursor-pointer ${
                        dragActive 
                          ? 'border-[#D4AF37] bg-amber-50/10' 
                          : 'border-stone-200 hover:border-amber-300 bg-stone-50/50'
                      }`}
                      onClick={() => document.getElementById('bukti_transfer_multi_upload')?.click()}
                    >
                      <input
                        id="bukti_transfer_multi_upload"
                        type="file"
                        multiple
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <div className="w-10 h-10 bg-amber-500/10 text-[#D4AF37] border border-amber-500/20 rounded-xl flex items-center justify-center shadow-3xs">
                        <UploadCloud size={20} />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-stone-800">
                          {uploadedFiles.length > 0 
                            ? '+ Tambah berkas bukti transfer lainnya' 
                            : 'Drop bukti transfer di sini, atau pilih berkas'}
                        </p>
                        <p className="text-[10px] text-stone-400">
                          Mendukung banyak gambar (JPG, PNG) & PDF. Otomatis digabungkan jadi 1 PDF pembayaran.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* PROGRESS INDICATOR */}
                  {isLoading && saveProgress && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-stone-800 text-[11px] flex items-center gap-2.5 animate-pulse font-mono">
                      <span className="inline-block w-4 h-4 border-2 border-[#a58421] border-t-transparent rounded-full animate-spin shrink-0"></span>
                      <span>{saveProgress}</span>
                    </div>
                  )}

                  {/* ERROR NOTIFICATION */}
                  {errorText && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{errorText}</span>
                    </div>
                  )}

                  {/* ACTION BUTTONS */}
                  <div className="flex gap-2 justify-end pt-2 border-t border-stone-200">
                    <button
                      type="button"
                      onClick={() => setSelectedSubmission(null)}
                      className="px-3.5 py-2 border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-bold transition font-mono uppercase"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitReceipt}
                      disabled={isLoading || uploadedFiles.length === 0 || currentPaymentNominal <= 0}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition font-mono uppercase shadow-3xs ${
                        isLoading || uploadedFiles.length === 0 || currentPaymentNominal <= 0
                          ? 'bg-stone-200 text-stone-400 border border-stone-200 cursor-not-allowed'
                          : 'bg-[#D4AF37] border border-[#a58421] hover:bg-[#bfa035] text-white shadow-2xs hover:shadow cursor-pointer'
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Memproses PDF...</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>
                            {willBeLunas 
                              ? 'Simpan & Lunasi Voucher ➔' 
                              : `Simpan Cicilan (Sisa Rp ${formatRupiah(remainingDebt)}) ➔`}
                          </span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* HELPFUL SUMMARY FOOTER */}
                  <div className="flex gap-2 p-2.5 bg-blue-50/60 text-blue-900 text-[10px] rounded-xl border border-blue-200/80 leading-relaxed font-sans">
                    <Info size={13} className="shrink-0 mt-0.5 text-blue-600" />
                    <span>
                      {uploadedFiles.length > 1 ? (
                        <>Seluruh <strong>{uploadedFiles.length} berkas bukti transfer</strong> akan otomatis dikompilasi menjadi <strong>1 file PDF resmi</strong> bernama <em>&quot;Bukti Pembayaran - ({selectedSubmission.jenisPengajuan || 'Non-Kategori'} - {selectedSubmission.dibayarkanKepada || 'Penerima'}).pdf&quot;</em> dan diunggah ke Google Drive.</>
                      ) : (
                        <>Bukti transfer akan otomatis dikonversi menjadi dokumen PDF resmi dan diarsipkan rapi di Google Drive.</>
                      )}
                    </span>
                  </div>

                </div>
              )}

            </div>

          </div>

        </div>

      </div>
    </div>
  );
};

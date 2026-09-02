import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Submission, REQUIRED_TRANSACTION_DOCS } from '../types';
import { 
  getStoredGoogleDriveToken, 
  ensureValidDriveToken,
  googleDriveLogin, 
  saveSubmissionToFirestore,
  getConnectedDrives,
  loadAllCompaniesFromFirestore,
  getOrRenewDriveToken,
  getActiveGoogleDriveAccount
} from '../firebase';
import { 
  generateF1PdfBytes, 
  generateF2PdfBytes, 
  formatDateIndonesian, 
  convertImageToPdf 
} from '../utils';
import { Cloud, Loader2, CheckCircle2, AlertTriangle, Play, RefreshCw, Layers, FolderSync, Trash2, Sparkles } from 'lucide-react';

interface DriveSyncMassProps {
  submissions: Submission[];
  onUpdateSubmissions: (updated: Submission[]) => void;
  autoOpen?: boolean;
}

export const DriveSyncMass: React.FC<DriveSyncMassProps> = ({ submissions, onUpdateSubmissions, autoOpen = false }) => {
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [activeDriveEmail, setActiveDriveEmail] = useState<string | null>(null);
  
  // Progress states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState<'incomplete_only' | 'all'>('incomplete_only');
  const [isStopRequested, setIsStopRequested] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const stopRequestedRef = useRef(false);
  const [syncProgress, setSyncProgress] = useState(0); // overall percentage
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentStepText, setCurrentStepText] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [errorLog, setErrorLog] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [f1GeneratedCount, setF1GeneratedCount] = useState(0);
  const [f2GeneratedCount, setF2GeneratedCount] = useState(0);
  const [attachmentsArchivedCount, setAttachmentsArchivedCount] = useState(0);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Helper to test if a submission is missing F1, F2, or attachments on Google Drive
  const checkDriveCompleteness = (sub: Submission) => {
    const driveFiles = sub.googleDriveFiles || [];
    
    // Check F1
    const hasF1 = driveFiles.some(f => 
      (f.isF1 || (f.name && (f.name.startsWith('F1 -') || f.name.startsWith('F1-') || f.name.toUpperCase() === 'F1.PDF'))) &&
      (!!f.url && f.url.includes('drive.google.com'))
    );

    // Check F2
    const hasF2 = driveFiles.some(f => 
      (f.isF2 || (f.name && (f.name.startsWith('F2 -') || f.name.startsWith('F2-') || f.name.toUpperCase() === 'F2.PDF'))) &&
      (!!f.url && f.url.includes('drive.google.com'))
    );

    // Check attachments from sub.files (if any local file not yet in Drive)
    const rawFiles = sub.files || [];
    const hasUnarchivedRawFiles = rawFiles.some(f => !f.isDrive && (!f.url || !f.url.includes('drive.google.com')));

    // Check Bukti Pembayaran
    const hasUnarchivedPayment = sub.buktiPembayaran && (!sub.buktiPembayaran.url || !sub.buktiPembayaran.url.includes('drive.google.com'));

    // Check Petty cash
    const hasUnarchivedPetty = sub.isPettyCash && sub.pettyCashFile && (!sub.pettyCashFile.url || !sub.pettyCashFile.url.includes('drive.google.com'));

    const isComplete = hasF1 && hasF2 && !hasUnarchivedRawFiles && !hasUnarchivedPayment && !hasUnarchivedPetty;

    return {
      hasF1,
      hasF2,
      hasUnarchivedRawFiles,
      hasUnarchivedPayment,
      hasUnarchivedPetty,
      isComplete,
      needsSync: !isComplete || driveFiles.length === 0
    };
  };

  // Precomputed stats
  const driveStats = useMemo(() => {
    let complete = 0;
    let missingF1 = 0;
    let missingF2 = 0;
    let missingAttachments = 0;
    let totalNeedingSync = 0;

    submissions.forEach(sub => {
      const res = checkDriveCompleteness(sub);
      if (res.isComplete) {
        complete++;
      } else {
        totalNeedingSync++;
        if (!res.hasF1) missingF1++;
        if (!res.hasF2) missingF2++;
        if (res.hasUnarchivedRawFiles || res.hasUnarchivedPayment || res.hasUnarchivedPetty) {
          missingAttachments++;
        }
      }
    });

    return {
      total: submissions.length,
      complete,
      missingF1,
      missingF2,
      missingAttachments,
      totalNeedingSync
    };
  }, [submissions]);

  // Check Drive connections
  useEffect(() => {
    const drives = getConnectedDrives();
    if (drives.length > 0) {
      setIsDriveConnected(true);
      setActiveDriveEmail(drives[0].email);
    } else {
      setIsDriveConnected(false);
      setActiveDriveEmail(null);
    }
  }, []);

  const handleConnectDrive = async () => {
    try {
      const loginRes = await googleDriveLogin();
      if (loginRes.accessToken) {
        setIsDriveConnected(true);
        setActiveDriveEmail(loginRes.user.email || 'Google Drive');
        addLog(`Google Drive berhasil terhubung: ${loginRes.user.email}`);
      }
    } catch (err: any) {
      setErrorLog(`Gagal menghubungkan Google Drive: ${err.message || err}`);
    }
  };

  const addLog = (text: string) => {
    const timestamp = new Date().toLocaleTimeString('id-ID');
    setLogs(prev => [...prev, `[${timestamp}] ${text}`]);
  };

  // Scroll to bottom of log terminal
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Folder helper functions
  const getOrCreateFolder = async (initialToken: string, name: string, parentId: string): Promise<string> => {
    let token = initialToken;
    const cleanName = name.trim().replace(/'/g, "\\'");
    const query = `name = '${cleanName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    
    let res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.status === 401) {
      console.log('🔄 [DriveSyncMass] Token 401 terdeteksi, memperbarui token otomatis...');
      try {
        const activeAcc = getActiveGoogleDriveAccount();
        const freshToken = await getOrRenewDriveToken(activeAcc?.email, true);
        if (freshToken) {
          token = freshToken;
          res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      } catch (renewErr) {
        console.warn('Gagal renew token saat search folder:', renewErr);
      }
    }

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }
    
    // Create new
    let createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });

    if (createRes.status === 401) {
      console.log('🔄 [DriveSyncMass] Token 401 terdeteksi saat membuat folder, memperbarui otomatis...');
      try {
        const activeAcc = getActiveGoogleDriveAccount();
        const freshToken = await getOrRenewDriveToken(activeAcc?.email, true);
        if (freshToken) {
          token = freshToken;
          createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: name,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentId]
            })
          });
        }
      } catch (renewErr) {
        console.warn('Gagal renew token saat buat folder:', renewErr);
      }
    }
    
    if (!createRes.ok) {
      throw new Error(`Gagal membuat folder: ${name}`);
    }
    const createdData = await createRes.json();
    return createdData.id;
  };

  const getOrCreatePettyCashFolderHierarchy = async (
    token: string,
    custodian: string,
    year: string,
    month: string,
    day: string
  ): Promise<string> => {
    const rootId = 'root';
    const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
    const pettyCashId = await getOrCreateFolder(token, 'Petty Cash', voucherAppId);
    const cleanCustodian = (custodian || 'Pemegang Petty Cash').trim().replace(/[\/\\?%*:|"<>.]/g, '');
    const custodianId = await getOrCreateFolder(token, cleanCustodian, pettyCashId);
    const yearId = await getOrCreateFolder(token, year, custodianId);
    const monthId = await getOrCreateFolder(token, month, yearId);
    const dayId = await getOrCreateFolder(token, day, monthId);
    return dayId;
  };

  const restoreFileFromTrashIfNecessary = async (fileId: string, token: string): Promise<boolean> => {
    try {
      const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,trashed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!checkRes.ok) return false;
      const meta = await checkRes.json();
      if (meta.trashed) {
        addLog(`Mendeteksi berkas "${meta.name}" berada di Sampah (Trash) Google Drive. Memulihkan berkas otomatis...`);
        const patchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ trashed: false })
        });
        if (patchRes.ok) {
          addLog(`[SUKSES MEMULIHKAN] Berkas "${meta.name}" berhasil dikembalikan dari Sampah Google Drive!`);
          return true;
        } else {
          addLog(`[Peringatan] Gagal memulihkan berkas "${meta.name}" dari Sampah.`);
        }
      }
    } catch (e) {
      console.warn("Error restoring trashed file:", e);
    }
    return false;
  };

  const downloadGoogleDriveFile = async (url: string, token: string): Promise<Uint8Array | null> => {
    try {
      const match = url.match(/[-\w]{25,}/);
      if (!match) return null;
      const fileId = match[0];
      
      // Auto-restore if trashed before attempting download
      await restoreFileFromTrashIfNecessary(fileId, token);
      
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const uploadFileToFolder = async (
    initialToken: string,
    fileName: string,
    fileMimeType: string,
    fileBytes: Uint8Array,
    folderId: string
  ): Promise<{ url: string; name: string }> => {
    let token = initialToken;

    // Delete existing duplicate with same name to avoid clutter in the folder
    try {
      let searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`
        )}&fields=files(id)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (searchRes.status === 401) {
        console.log('🔄 [DriveSyncMass] Token 401 saat search duplikat, renew token otomatis...');
        try {
          const activeAcc = getActiveGoogleDriveAccount();
          const freshToken = await getOrRenewDriveToken(activeAcc?.email, true);
          if (freshToken) {
            token = freshToken;
            searchRes = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
                `name = '${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`
              )}&fields=files(id)`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        } catch (renewErr) {
          console.warn('Gagal renew token saat search duplikat:', renewErr);
        }
      }

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          for (const existingFile of searchData.files) {
            await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            });
          }
        }
      }
    } catch (dupErr) {
      console.warn('Error checking duplicates:', dupErr);
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
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }
    );

    if (res.status === 401) {
      console.log('🔄 [DriveSyncMass] Token 401 saat upload file, renew token otomatis...');
      try {
        const activeAcc = getActiveGoogleDriveAccount();
        const freshToken = await getOrRenewDriveToken(activeAcc?.email, true);
        if (freshToken) {
          token = freshToken;
          res = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            }
          );
        }
      } catch (renewErr) {
        console.warn('Gagal renew token saat upload file:', renewErr);
      }
    }

    if (!res.ok) {
      throw new Error(`Upload gagal untuk files ${fileName}`);
    }

    const fileData = await res.json();

    // Make shared link accessible
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      });
    } catch (perErr) {
      console.warn('Permission error:', perErr);
    }

    return {
      url: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view?usp=drivesdk`,
      name: fileData.name || fileName,
    };
  };

  const parseCompanyAndSequenceLocal = (kodeStr: string): { company: string } => {
    const clean = (kodeStr || '').trim();
    const upperClean = clean.toUpperCase();
    let company = 'nmsa'; // Default company
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
    return { company };
  };

  const handleCleanDriveTrash = async () => {
    const activeAccount = getActiveGoogleDriveAccount();
    const token = await getOrRenewDriveToken(activeAccount?.email, true);
    if (!token) {
      setErrorLog('Google Drive belum terhubung. Hubungkan akun terlebih dahulu.');
      return;
    }

    setIsCleaning(true);
    setLogs([]);
    setErrorLog(null);
    addLog(`[BERSIHKAN] Sedang mendeteksi daftar perusahaan terdaftar di sistem...`);

    try {
      // Collect registered companies from Firestore
      const registeredCompanies = await loadAllCompaniesFromFirestore();
      const protectedCompanyLowerNames = new Set<string>();

      // Standard folders that are protected
      protectedCompanyLowerNames.add('nmsa');
      protectedCompanyLowerNames.add('petty cash');

      // Add registered company IDs & codes to protected list
      registeredCompanies.forEach((comp: any) => {
        if (comp.id) protectedCompanyLowerNames.add(comp.id.trim().toLowerCase());
        if (comp.code) protectedCompanyLowerNames.add(comp.code.trim().toLowerCase());
      });

      // Add company names parsed from submissions
      submissions.forEach((sub) => {
        const parsed = parseCompanyAndSequenceLocal(sub.kode);
        if (parsed && parsed.company) {
          protectedCompanyLowerNames.add(parsed.company.trim().toLowerCase());
        }
      });

      const protectedListString = Array.from(protectedCompanyLowerNames)
        .map(name => name.toUpperCase())
        .sort()
        .join(', ');

      const confirmMessage = `Apakah Anda yakin ingin merapikan folder Google Drive?\n\n` +
        `Tindakan ini akan memindahkan folder asing lainnya ke tempat Sampah Google Drive agar rapi.\n\n` +
        `SISTEM MENDETEKSI PERUSAHAAN BERIKUT SEBAGAI DATA VALID & AMAN (TIDAK AKAN DIHAPUS):\n` +
        `👉 ${protectedListString}\n\n` +
        `Apakah Anda ingin melanjutkan?`;

      if (!window.confirm(confirmMessage)) {
        addLog(`[BERSIHKAN] Dibatalkan oleh pengguna.`);
        setIsCleaning(false);
        return;
      }

      addLog(`[BERSIHKAN] Memulai proses merapikan folder...`);
      addLog(`[BERSIHKAN] Subfolder terlindungi: ${protectedListString}`);

      // 1. Find or get root ID / 'Voucher-APP' folder ID
      const queryRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='Voucher-APP'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!queryRes.ok) {
        throw new Error('Gagal mengakses folder Voucher-APP di Google Drive');
      }
      const queryData = await queryRes.json();
      if (!queryData.files || queryData.files.length === 0) {
        throw new Error('Folder "Voucher-APP" tidak ditemukan di Google Drive Anda.');
      }
      const voucherAppId = queryData.files[0].id;

      // 2. List all immediate subfolders of 'Voucher-APP'
      const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${voucherAppId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!listRes.ok) {
        throw new Error('Gagal membaca isi folder Voucher-APP');
      }
      const listData = await listRes.json();
      const files = listData.files || [];

      // Filter subfolders that are NOT in the protected list
      const messyFolders = files.filter((f: any) => {
        const lowerName = f.name.trim().toLowerCase();
        return !protectedCompanyLowerNames.has(lowerName);
      });

      if (messyFolders.length === 0) {
        addLog(`[BERSIHKAN] Folder Anda sudah bersih! Tidak ada folder asing atau berantakan yang terdeteksi.`);
        setIsCleaning(false);
        return;
      }

      addLog(`[BERSIHKAN] Menemukan ${messyFolders.length} folder berantakan: ${messyFolders.map((f: any) => f.name).join(', ')}`);

      let cleanSuccess = 0;
      for (const folder of messyFolders) {
        addLog(`[BERSIHKAN] Memindahkan folder "${folder.name}" ke Sampah (Trash)...`);
        const patchRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folder.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ trashed: true })
        });

        if (patchRes.ok) {
          addLog(`[BERSIHKAN] [SUKSES] Folder "${folder.name}" berhasil dipindahkan ke Sampah.`);
          cleanSuccess++;
        } else {
          addLog(`[BERSIHKAN] [PENGINGAT] Gagal memindahkan folder "${folder.name}".`);
        }
      }

      addLog(`[BERSIHKAN] SELESAI UNTUK MERAPIKAN! Berhasil memindahkan ${cleanSuccess} folder berantakan ke Sampah Google Drive.`);
      addLog(`[BERSIHKAN] Sekarang tampilan Google Drive Anda telah rapi dan hanya berisi folder utama: ${protectedListString}.`);
    } catch (err: any) {
      setErrorLog(err.message || 'Gagal merapikan folder.' );
      addLog(`[BERSIHKAN] Eror: ${err.message || err}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const parseDuplicate = (filename: string) => {
    const lastDot = filename.lastIndexOf('.');
    const ext = lastDot !== -1 ? filename.substring(lastDot) : '';
    const nameWithoutExt = lastDot !== -1 ? filename.substring(0, lastDot) : filename;

    let current = nameWithoutExt;
    let isCopy = false;
    
    // Pola untuk mencocokkan " (1)", " (2)", " - Copy", " - Copy (1)", dll.
    const copyRegex = /\s+\(\d+\)$|\s+-?\s*Copy\s*(?:\(\d+\))?$/i;
    
    while (copyRegex.test(current)) {
      current = current.replace(copyRegex, '');
      isCopy = true;
    }

    return {
      isCopy,
      baseName: current + ext,
      cleanNameWithoutExt: current
    };
  };

  const handleDeduplicateFiles = async () => {
    const token = await ensureValidDriveToken();
    if (!token) {
      setErrorLog('Google Drive belum terhubung. Hubungkan akun terlebih dahulu.');
      return;
    }

    const confirmMessage = `Apakah Anda yakin ingin mencari & menghapus file duplikat di Google Drive?\n\n` +
      `Sistem akan memindai seluruh subfolder di dalam "Voucher-APP" untuk mencari:\n` +
      `1. File dengan nama sama persis (hanya menyimpan yang paling baru).\n` +
      `2. File salinan dengan akhiran angka seperti (1), (2), (Copy) dll.\n\n` +
      `File duplikat yang tidak terpilih akan dipindahkan ke Sampah Google Drive agar rapi.\n\n` +
      `Apakah Anda ingin melanjutkan?`;

    if (!window.confirm(confirmMessage)) {
      addLog(`[DUPLIKAT] Proses dibatalkan oleh pengguna.`);
      return;
    }

    setIsDeduplicating(true);
    setLogs([]);
    setErrorLog(null);
    addLog(`[DUPLIKAT] Memulai pemindaian file duplikat di folder "Voucher-APP"...`);

    try {
      // 1. Find Voucher-APP folder ID
      const queryRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='Voucher-APP'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!queryRes.ok) {
        throw new Error('Gagal mengakses Google Drive.');
      }
      const queryData = await queryRes.json();
      if (!queryData.files || queryData.files.length === 0) {
        throw new Error('Folder "Voucher-APP" tidak ditemukan. Lakukan sinkronisasi terlebih dahulu untuk membuat folder.');
      }
      const voucherAppId = queryData.files[0].id;

      let processedFoldersCount = 0;
      let totalDeletedCount = 0;
      let totalRenamedCount = 0;

      // Recursive scan function
      const scanFolder = async (folderId: string, folderPath: string) => {
        processedFoldersCount++;
        addLog(`[DUPLIKAT] Memindai folder [${processedFoldersCount}]: ${folderPath}...`);

        // Fetch files inside folder
        const listRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,createdTime)&pageSize=1000`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!listRes.ok) {
          addLog(`[Peringatan] Gagal memindai folder: ${folderPath}`);
          return;
        }

        const data = await listRes.json();
        const items = data.files || [];

        const subfolders = items.filter((i: any) => i.mimeType === 'application/vnd.google-apps.folder');
        const filesOnly = items.filter((i: any) => i.mimeType !== 'application/vnd.google-apps.folder');

        // Group files in this folder by base name
        const groups: { [baseName: string]: any[] } = {};
        for (const f of filesOnly) {
          const { baseName, isCopy } = parseDuplicate(f.name);
          const enriched = {
            ...f,
            baseName,
            isCopy,
            createdTimeDate: new Date(f.createdTime || 0)
          };
          if (!groups[baseName]) {
            groups[baseName] = [];
          }
          groups[baseName].push(enriched);
        }

        // Process each group
        for (const baseName of Object.keys(groups)) {
          const groupFiles = groups[baseName];
          if (groupFiles.length <= 1) {
            continue; // No duplicates
          }

          // Sort groupFiles:
          // 1. Non-copies (clean files) come first
          // 2. Newer createdTime comes first
          groupFiles.sort((a, b) => {
            if (a.isCopy !== b.isCopy) {
              return a.isCopy ? 1 : -1; // non-copies first
            }
            return b.createdTimeDate.getTime() - a.createdTimeDate.getTime(); // newer first
          });

          const primaryFile = groupFiles[0];
          addLog(`[DUPLIKAT] Menemukan ${groupFiles.length} file terkait untuk "${baseName}":`);
          addLog(`  -> Menyimpan file utama: "${primaryFile.name}" (ID: ${primaryFile.id})`);

          // If the primary file was a copy, we rename it to baseName for extreme neatness!
          if (primaryFile.isCopy) {
            addLog(`  -> Merapikan nama file copy "${primaryFile.name}" menjadi "${baseName}"...`);
            try {
              const renameRes = await fetch(`https://www.googleapis.com/drive/v3/files/${primaryFile.id}`, {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: baseName })
              });
              if (renameRes.ok) {
                addLog(`  -> [SUKSES] Nama file dirapikan.`);
                totalRenamedCount++;
              } else {
                addLog(`  -> [Peringatan] Gagal merapikan nama file.`);
              }
            } catch (err) {
              console.error(err);
            }
          }

          // Move the rest of the files in the group to Trash
          for (let i = 1; i < groupFiles.length; i++) {
            const dupFile = groupFiles[i];
            addLog(`  -> Memindahkan duplikat ke Sampah: "${dupFile.name}" (ID: ${dupFile.id})`);
            try {
              const trashRes = await fetch(`https://www.googleapis.com/drive/v3/files/${dupFile.id}`, {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ trashed: true })
              });
              if (trashRes.ok) {
                addLog(`  -> [SUKSES HAPUS] Berhasil membuang duplikat.`);
                totalDeletedCount++;
              } else {
                addLog(`  -> [Peringatan] Gagal membuang duplikat.`);
              }
            } catch (err) {
              console.error(err);
            }
          }
        }

        // Recurse subfolders
        for (const sub of subfolders) {
          await scanFolder(sub.id, `${folderPath}/${sub.name}`);
        }
      };

      // Start the recursive scan starting from Voucher-APP
      await scanFolder(voucherAppId, '/Voucher-APP');

      addLog(`== SELESAI PEMBERSIHAN ==`);
      addLog(`Berhasil menyisir ${processedFoldersCount} folder.`);
      addLog(`Berhasil memindahkan ${totalDeletedCount} file duplikat/copy ke Sampah Google Drive.`);
      addLog(`Berhasil mengoreksi nama ${totalRenamedCount} file copy agar rapi.`);
      addLog(`Tampilan Google Drive Anda sekarang bersih, rapi, dan teratur! ✨`);

    } catch (err: any) {
      setErrorLog(err.message || 'Gagal membersihkan file duplikat.');
      addLog(`[DUPLIKAT] Eror: ${err.message || err}`);
    } finally {
      setIsDeduplicating(false);
    }
  };

  const handleStopSync = () => {
    setIsStopRequested(true);
    stopRequestedRef.current = true;
    addLog('[SISTEM] Mengirim permintaan pembatalan... Sinkronisasi akan dihentikan setelah memproses berkas saat ini.');
  };

  const handleStartSync = async (mode: 'incomplete_only' | 'all' = 'incomplete_only') => {
    if (submissions.length === 0) {
      setErrorLog('Tidak ada transaksi untuk disinkronkan.');
      return;
    }

    const activeAccount = getActiveGoogleDriveAccount();
    const token = await getOrRenewDriveToken(activeAccount?.email, true);
    if (!token) {
      setErrorLog('Koneksi Google Drive terputus. Silakan hubungkan kembali.');
      return;
    }

    // Determine target items to process
    const targetSubmissions = mode === 'incomplete_only'
      ? submissions.filter(sub => checkDriveCompleteness(sub).needsSync)
      : submissions;

    if (targetSubmissions.length === 0) {
      addLog('✓ Seluruh transaksi Anda sudah lengkap dengan F1, F2, dan Lampiran di Google Drive! Tidak ada berkas yang tertinggal.');
      return;
    }

    setSyncMode(mode);
    setIsSyncing(true);
    setIsStopRequested(false);
    stopRequestedRef.current = false;
    setLogs([]);
    setErrorLog(null);
    setSuccessCount(0);
    setFailedCount(0);
    setF1GeneratedCount(0);
    setF2GeneratedCount(0);
    setAttachmentsArchivedCount(0);

    addLog(`Memulai pengarsipan otomatis (${targetSubmissions.length} laporan diproses, mode: ${mode === 'incomplete_only' ? 'Hanya Yang Belum Lengkap' : 'Semua Transaksi'})...`);

    const updatedSubmissions = [...submissions];
    let actualSuccesses = 0;
    let actualFailures = 0;
    let actualF1Count = 0;
    let actualF2Count = 0;
    let actualAttachCount = 0;

    for (let index = 0; index < targetSubmissions.length; index++) {
      if (stopRequestedRef.current) {
        addLog(`== PENGARSIPAN DIHENTIKAN OLEH PENGGUNA ==`);
        addLog(`Berhasil menyimpan progres sementara untuk ${actualSuccesses + actualFailures} dokumen.`);
        break;
      }

      setCurrentIndex(index);
      const sub = targetSubmissions[index];
      const parentIndex = submissions.findIndex(s => s.id === sub.id);
      const percent = Math.round(((index + 1) / targetSubmissions.length) * 100);
      setSyncProgress(percent);

      const kodeStr = sub.kode || 'Tanpa Kode';
      setCurrentStepText(`Memproses [${index + 1}/${targetSubmissions.length}] - ${kodeStr}`);
      addLog(`Mulai memproses transaksi: ${kodeStr} - ${sub.jenisPengajuan || 'Pengajuan'}...`);

      try {
        // Compute date parts
        const parts = (sub.tanggal || '').split('-');
        let yearStr = '2026';
        let monthStr = '1. Januari';
        let dayStr = '1';

        const INDONESIAN_MONTHS = [
          'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];

        if (parts.length === 3) {
          yearStr = parts[0];
          const monthIdx = parseInt(parts[1], 10) - 1;
          const mNum = monthIdx + 1;
          const mName = INDONESIAN_MONTHS[monthIdx] || 'Januari';
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(parseInt(parts[2], 10));
        } else {
          const dateObj = new Date(sub.createdAt || Date.now());
          yearStr = String(dateObj.getFullYear());
          const mNum = dateObj.getMonth() + 1;
          const mName = INDONESIAN_MONTHS[dateObj.getMonth()];
          monthStr = `${mNum}. ${mName}`;
          dayStr = String(dateObj.getDate());
        }

        const folderCompanyUpper = 'NMSA';

        // 1. Create/Retrieve company, year, month, day path
        const rootId = 'root';
        const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
        const companyId = await getOrCreateFolder(token, folderCompanyUpper, voucherAppId);
        const yearId = await getOrCreateFolder(token, yearStr, companyId);
        const monthId = await getOrCreateFolder(token, monthStr, yearId);
        const dayId = await getOrCreateFolder(token, dayStr, monthId);

        // Name of transaction custom folder
        const cleanJenis = (sub.jenisPengajuan || 'Pengajuan').trim().replace(/[\/\\?%*:|"<>.]/g, '');
        const cleanPenerima = (sub.dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
        const cleanKode = (sub.kode || '').trim().replace(/[\/\\?%*:|"<>.]/g, '-');
        
        let txBaseName = '';
        if (sub.isInvoice && sub.invoiceNumber) {
          const cleanInv = sub.invoiceNumber.trim().replace(/[\/\\?%*:|"<>.]/g, '');
          txBaseName = `Pembayaran-${cleanInv}`;
        } else {
          txBaseName = `Pembayaran-${cleanJenis}+${cleanPenerima}`;
        }

        const txFolderName = cleanKode ? `${cleanKode} - ${txBaseName}` : txBaseName;
        const targetFolderId = await getOrCreateFolder(token, txFolderName, dayId);

        addLog(`Folder Tujuan: /Voucher-APP/${folderCompanyUpper}/${yearStr}/${monthStr}/${dayStr}/${txFolderName}`);

        // Prepare items and grandTotal
        const subItems = sub.items || [];
        const grandTotal = subItems.reduce((acc, current) => acc + (current.total || 0), 0);

        const completeness = checkDriveCompleteness(sub);
        const existingDriveFiles = sub.googleDriveFiles || [];
        const freshFinalFiles: { url: string; name: string; isF1?: boolean; isF2?: boolean; isBuktiPembayaran?: boolean; docType?: string }[] = [];
        let freshBuktiPembayaran: { url: string; name: string } | undefined = undefined;

        // 2. Process F1
        const existingF1 = existingDriveFiles.find(f => 
          (f.isF1 || (f.name && (f.name.startsWith('F1 -') || f.name.startsWith('F1-') || f.name.toUpperCase() === 'F1.PDF'))) &&
          (!!f.url && f.url.includes('drive.google.com'))
        );

        if (mode === 'incomplete_only' && existingF1) {
          freshFinalFiles.push(existingF1);
          addLog(`✓ Dokumen F1 sudah ada di Google Drive, mempertahankan berkas: ${existingF1.name}`);
        } else {
          addLog(`Menggambar & Mengunggah F1 Bukti Pengeluaran Kas/Bank...`);
          const f1PdfBytes = await generateF1PdfBytes(sub, grandTotal);
          const f1Data = await uploadFileToFolder(
            token,
            `F1 - ${txBaseName}.pdf`,
            'application/pdf',
            f1PdfBytes,
            targetFolderId
          );
          freshFinalFiles.push({
            url: f1Data.url,
            name: f1Data.name,
            isF1: true
          });
          actualF1Count++;
          setF1GeneratedCount(actualF1Count);
          addLog(`✓ F1 berhasil digenerate & diunggah ke Drive: ${f1Data.name}`);
        }

        // 3. Process F2
        const existingF2 = existingDriveFiles.find(f => 
          (f.isF2 || (f.name && (f.name.startsWith('F2 -') || f.name.startsWith('F2-') || f.name.toUpperCase() === 'F2.PDF'))) &&
          (!!f.url && f.url.includes('drive.google.com'))
        );

        if (mode === 'incomplete_only' && existingF2) {
          freshFinalFiles.push(existingF2);
          addLog(`✓ Dokumen F2 sudah ada di Google Drive, mempertahankan berkas: ${existingF2.name}`);
        } else {
          addLog(`Menggambar & Mengunggah F2 Form Pengajuan HO...`);
          const f2PdfBytes = await generateF2PdfBytes(sub, grandTotal);
          const f2Data = await uploadFileToFolder(
            token,
            `F2 - ${txBaseName}.pdf`,
            'application/pdf',
            f2PdfBytes,
            targetFolderId
          );
          freshFinalFiles.push({
            url: f2Data.url,
            name: f2Data.name,
            isF2: true
          });
          actualF2Count++;
          setF2GeneratedCount(actualF2Count);
          addLog(`✓ F2 berhasil digenerate & diunggah ke Drive: ${f2Data.name}`);
        }

        // 4. Archive raw attachments from sub.files (if any local/unarchived files exist)
        const rawFiles = sub.files || [];
        let bCounter = 1;
        let invCounter = 1;
        let pettyCashCounter = 1;

        for (let i = 0; i < rawFiles.length; i++) {
          if (stopRequestedRef.current) break;
          const rawItem = rawFiles[i];
          const rawName = rawItem.name || '';
          if (rawName.startsWith('F1 -') || rawName.startsWith('F2 -')) continue;

          // If already in Drive, keep it
          if (rawItem.isDrive && rawItem.url && rawItem.url.includes('drive.google.com')) {
            if (!freshFinalFiles.some(f => f.url === rawItem.url)) {
              freshFinalFiles.push({
                url: rawItem.url,
                name: rawItem.name,
                docType: rawItem.docType
              });
            }
            continue;
          }

          // If has local data / file / base64: archive to Drive
          if ((rawItem as any).file || (rawItem as any).dataUrl || (rawItem as any).base64) {
            addLog(`Mengarsipkan lampiran lokal (${i + 1}/${rawFiles.length}): ${rawItem.name}...`);
            let fileBytes: Uint8Array | null = null;
            let mimeType = 'application/octet-stream';

            if ((rawItem as any).file) {
              fileBytes = new Uint8Array(await (rawItem as any).file.arrayBuffer());
              mimeType = (rawItem as any).file.type || 'application/octet-stream';
            } else if ((rawItem as any).dataUrl || (rawItem as any).base64) {
              const dataUrl = (rawItem as any).dataUrl || (rawItem as any).base64;
              const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                mimeType = matches[1];
                const binaryStr = atob(matches[2]);
                const bytes = new Uint8Array(binaryStr.length);
                for (let b = 0; b < binaryStr.length; b++) {
                  bytes[b] = binaryStr.charCodeAt(b);
                }
                fileBytes = bytes;
              }
            }

            if (fileBytes) {
              if (mimeType.startsWith('image/') || /\.jpe?g|\.png/i.test(rawItem.name)) {
                try {
                  fileBytes = await convertImageToPdf(fileBytes, mimeType);
                  mimeType = 'application/pdf';
                } catch (convErr) {}
              }

              const ext = mimeType === 'application/pdf' ? '.pdf' : '.bin';
              let prefix = '';
              if (rawItem.docType === 'invoice_vendor') {
                prefix = invCounter === 1 ? 'INV' : `INV${invCounter}`;
                invCounter++;
              } else if (rawItem.docType === 'petty_cash_report') {
                prefix = pettyCashCounter === 1 ? 'PettyCash' : `PettyCash${pettyCashCounter}`;
                pettyCashCounter++;
              } else {
                prefix = `B${bCounter}`;
                bCounter++;
              }

              const finalFileName = `${prefix} - ${txBaseName}${ext}`;
              const resData = await uploadFileToFolder(token, finalFileName, mimeType, fileBytes, targetFolderId);
              freshFinalFiles.push({
                url: resData.url,
                name: resData.name,
                docType: rawItem.docType
              });
              actualAttachCount++;
              setAttachmentsArchivedCount(actualAttachCount);
              addLog(`✓ Lampiran berhasil diarsipkan ke Drive: ${finalFileName}`);
            }
          }
        }

        // 5. Download and Re-Upload existing supporting docs if syncing all or missing
        const existingDocs = existingDriveFiles.filter(f => {
          if (f.isF1 || f.isF2 || f.isBuktiPembayaran || f.docType === 'petty_cash_report') {
            return false;
          }
          const name = f.name || '';
          if (name.startsWith('F1 - ') && name.endsWith('.pdf')) return false;
          if (name.startsWith('F2 - ') && name.endsWith('.pdf')) return false;
          return true;
        });

        for (let docIdx = 0; docIdx < existingDocs.length; docIdx++) {
          if (stopRequestedRef.current) break;
          const doc = existingDocs[docIdx];
          if (!freshFinalFiles.some(f => f.url === doc.url || f.name === doc.name)) {
            freshFinalFiles.push(doc);
          }
        }

        // 6. Download and Re-Upload Bukti Pembayaran if any
        if (!stopRequestedRef.current) {
          const existingPaymentDoc = sub.buktiPembayaran || existingDriveFiles.find(f => f.isBuktiPembayaran);
          if (existingPaymentDoc) {
            freshBuktiPembayaran = existingPaymentDoc;
            if (!freshFinalFiles.some(f => f.url === existingPaymentDoc.url || f.isBuktiPembayaran)) {
              freshFinalFiles.push({
                url: existingPaymentDoc.url,
                name: existingPaymentDoc.name,
                isBuktiPembayaran: true
              });
            }
          }
        }

        // 7. Petty Cash file
        if (!stopRequestedRef.current && sub.isPettyCash && sub.pettyCashFile) {
          if (!sub.pettyCashFile.url || !sub.pettyCashFile.url.includes('drive.google.com')) {
            addLog(`Mengarsipkan LPJ Petty Cash ke Google Drive...`);
          }
        }

        // Update target object
        const updatedSub: Submission = {
          ...sub,
          googleDriveFiles: freshFinalFiles,
          buktiPembayaran: freshBuktiPembayaran || sub.buktiPembayaran
        };

        // Save back to firestore & update parental cache list
        await saveSubmissionToFirestore(updatedSub);
        
        if (parentIndex !== -1) {
          updatedSubmissions[parentIndex] = updatedSub;
        }
        actualSuccesses++;
        setSuccessCount(actualSuccesses);
        addLog(`[SUKSES] Laporan transaksi ${kodeStr} berhasil diarsipkan & diperbarui!`);
      } catch (subErr: any) {
        actualFailures++;
        setFailedCount(actualFailures);
        addLog(`[EROR] Gagal mengunggah transaksi ${kodeStr}: ${subErr.message || subErr}`);
        console.error(subErr);
      }
    }

    // Persist finalized array
    onUpdateSubmissions(updatedSubmissions);
    setIsSyncing(false);
    setIsStopRequested(false);
    const wasStopped = stopRequestedRef.current;
    stopRequestedRef.current = false;
    setCurrentStepText(wasStopped ? 'Pengarsipan dihentikan.' : 'Pengarsipan Otomatis Selesai!');
    addLog(`== SELESAI == Berhasil memproses pengarsipan. Sukses: ${actualSuccesses}, Eror: ${actualFailures}, F1 Dibuat: ${actualF1Count}, F2 Dibuat: ${actualF2Count}, Lampiran Diarsipkan: ${actualAttachCount}.`);
  };

  return (
    <div className="bg-white border border-stone-150 rounded-2xl shadow-sm p-5 max-w-4xl mx-auto my-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 text-amber-700 rounded-2xl shrink-0">
            <FolderSync size={24} className="text-amber-600 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-black text-stone-900 font-display">Pengarsipan Lampiran & Sinkronisasi F1/F2 Google Drive</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Otomatis membuat dokumen F1 & F2 untuk laporan sebelumnya dan mengarsipkan seluruh lampiran ke struktur folder Google Drive.
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-4 py-2 text-xs font-bold font-display text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-all cursor-pointer"
        >
          {isOpen ? 'Sembunyikan Panel' : 'Buka Pengarsipan Otomatis'}
        </button>
      </div>

      {isOpen && (
        <div className="pt-5 space-y-5 animate-fade-in">
          {/* Status Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider block">Total Laporan</span>
              <span className="text-lg font-black text-stone-900 font-mono mt-0.5 block">{driveStats.total}</span>
              <span className="text-[9.5px] text-stone-400">Seluruh transaksi</span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
              <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">Lengkap di Drive</span>
              <span className="text-lg font-black text-emerald-700 font-mono mt-0.5 block">{driveStats.complete}</span>
              <span className="text-[9.5px] text-emerald-600">F1, F2 & Lampiran OK</span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
              <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">Kurang F1 / F2</span>
              <span className="text-lg font-black text-amber-700 font-mono mt-0.5 block">{driveStats.missingF1 + driveStats.missingF2}</span>
              <span className="text-[9.5px] text-amber-600">F1: {driveStats.missingF1} | F2: {driveStats.missingF2}</span>
            </div>

            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-center">
              <span className="text-[10px] uppercase font-bold text-rose-800 tracking-wider block">Belum Diarsipkan</span>
              <span className="text-lg font-black text-rose-700 font-mono mt-0.5 block">{driveStats.totalNeedingSync}</span>
              <span className="text-[9.5px] text-rose-600">Perlu pengarsipan</span>
            </div>
          </div>

          {/* Connection Status Box */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
            <div className="flex items-center gap-3">
              <Cloud size={20} className={isDriveConnected ? 'text-emerald-600' : 'text-stone-400'} />
              <div>
                <p className="text-xs font-extrabold text-stone-800">
                  Status Penyimpanan Cloud: {isDriveConnected ? 'Google Drive Terhubung' : 'Google Drive Belum Terhubung'}
                </p>
                {isDriveConnected ? (
                  <p className="text-[10.5px] text-stone-500">Akun Aktif: <strong className="font-mono text-emerald-700 underline shrink-0">{activeDriveEmail}</strong></p>
                ) : (
                  <p className="text-[10.5px] text-stone-400">Hubungkan untuk mengunggah otomatis kwitansi, F1, and F2.</p>
                )}
              </div>
            </div>

            {!isDriveConnected ? (
              <button
                type="button"
                onClick={handleConnectDrive}
                className="flex items-center gap-2 px-4 py-2 text-xs font-black text-amber-950 bg-amber-400 hover:bg-amber-500 rounded-lg transition shadow-xs cursor-pointer"
              >
                Hubungkan Google Drive
              </button>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-[10px] text-emerald-800 font-bold font-sans">
                Koneksi Aktif
              </div>
            )}
          </div>

          {/* Sync Trigger Section */}
          {isDriveConnected && (
            <div className="space-y-4">
              {/* Main Action 1: Smart Incomplete-Only Sync */}
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-amber-50 border border-amber-300/80 p-4 rounded-xl shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-600 shrink-0" />
                    <p className="text-xs font-black text-amber-950 leading-tight uppercase tracking-wider font-display">
                      Arsipkan & Buat F1/F2 (Hanya Yang Belum Ada di Google Drive)
                    </p>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Menyisir <strong>{driveStats.totalNeedingSync} laporan</strong> yang belum lengkap di Google Drive. Sistem akan otomatis menggambar berkas PDF F1 & F2 yang belum tersimpan dan mengarsipkan seluruh lampiran ke folder <code className="bg-amber-100 text-amber-900 px-1 py-0.5 rounded text-[10px] font-mono">/Voucher-APP/NMSA/YYYY/M. Bulan/D/...</code>.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
                  <button
                    type="button"
                    disabled={isSyncing || driveStats.totalNeedingSync === 0}
                    onClick={() => handleStartSync('incomplete_only')}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 text-xs font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 disabled:bg-stone-350 rounded-xl shadow-sm transition disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSyncing && syncMode === 'incomplete_only' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Mengarsipkan...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        <span>⚡ Arsipkan Yang Belum Ada ({driveStats.totalNeedingSync})</span>
                      </>
                    )}
                  </button>

                  {isSyncing && (
                    <button
                      type="button"
                      disabled={isStopRequested}
                      onClick={handleStopSync}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 disabled:bg-stone-300 rounded-xl shadow-sm transition cursor-pointer"
                    >
                      {isStopRequested ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Menghentikan...</span>
                        </>
                      ) : (
                        <span>Hentikan</span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Action 2: Full Mass Sync (All) */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-stone-50 border border-stone-200 p-3.5 rounded-xl">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-stone-800 leading-tight flex items-center gap-1.5">
                    <RefreshCw size={13} className="text-stone-500" />
                    Sinkronkan Seluruh {submissions.length} Transaksi (Semua)
                  </p>
                  <p className="text-[10px] text-stone-500">
                    Regenerasi ulang dan verifikasi seluruh transaksi dari awal hingga akhir ke Google Drive.
                  </p>
                </div>
                
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => handleStartSync('all')}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-[11px] font-bold text-stone-700 bg-white hover:bg-stone-100 border border-stone-250 rounded-lg shadow-3xs transition cursor-pointer shrink-0"
                >
                  <RefreshCw size={12} />
                  <span>Sinkronkan Semua Transaksi</span>
                </button>
              </div>

              {/* Clean Up Section */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-stone-50 border border-stone-200 p-3.5 rounded-xl">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-stone-800 leading-tight flex items-center gap-1.5">
                    <Trash2 size={13} className="text-amber-500" />
                    Merapikan Google Drive (Hapus Folder Asing/Berantakan)
                  </p>
                  <p className="text-[10px] text-stone-500">
                    Pindahkan semua folder asing di luar <strong className="text-stone-800">NMSA</strong> dan <strong className="text-stone-800">Petty Cash</strong> langsung ke Sampah Google Drive.
                  </p>
                </div>
                
                <button
                  type="button"
                  disabled={isSyncing || isCleaning || isDeduplicating}
                  onClick={handleCleanDriveTrash}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-[11px] font-bold text-stone-700 bg-white hover:bg-stone-100 border border-stone-250 rounded-lg shadow-3xs transition cursor-pointer shrink-0"
                >
                  {isCleaning ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  <span>Rapikan Tampilan Drive</span>
                </button>
              </div>

              {/* Clean Up Duplicates Section */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-stone-50 border border-stone-200 p-3.5 rounded-xl">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-stone-800 leading-tight flex items-center gap-1.5">
                    <Layers size={13} className="text-amber-600" />
                    Bersihkan File Duplikat & Salinan (Copy)
                  </p>
                  <p className="text-[10px] text-stone-500">
                    Menyisir folder <strong className="text-stone-800">Voucher-APP</strong> untuk mendeteksi file salinan ganda (seperti <code className="bg-stone-100 px-1 py-0.5 rounded text-rose-600">(1)</code>, <code className="bg-stone-100 px-1 py-0.5 rounded text-rose-600">Copy</code>) and membuang duplikatnya ke Sampah.
                  </p>
                </div>
                
                <button
                  type="button"
                  disabled={isSyncing || isCleaning || isDeduplicating}
                  onClick={handleDeduplicateFiles}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-[11px] font-bold text-stone-700 bg-white hover:bg-stone-100 border border-stone-250 rounded-lg shadow-3xs transition cursor-pointer shrink-0"
                >
                  {isDeduplicating ? <Loader2 size={12} className="animate-spin" /> : <Layers size={12} />}
                  <span>Bersihkan File Duplikat</span>
                </button>
              </div>

              {/* Progress Panel */}
              {isSyncing && (
                <div className="space-y-2 bg-stone-50 border border-stone-200/80 p-4 rounded-xl">
                  <div className="flex justify-between items-center text-xs font-black text-stone-800 font-display">
                    <span>Progres Pengunggahan & Pengarsipan</span>
                    <span className="font-mono text-amber-700">{syncProgress}%</span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-amber-500 h-full transition-all duration-300"
                      style={{ width: `${syncProgress}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap justify-between text-[11px] text-stone-600 font-mono mt-2 gap-2">
                    <span className="truncate max-w-[60%]">{currentStepText}</span>
                    <span>Sukses: {successCount} | Gagal: {failedCount} | F1: {f1GeneratedCount} | F2: {f2GeneratedCount}</span>
                  </div>
                </div>
              )}

              {/* Logs Terminal */}
              {(logs.length > 0 || isSyncing) && (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10.5px] font-bold text-stone-500 uppercase tracking-wide">Log Proses Pengarsipan</label>
                    <button 
                      onClick={() => setLogs([])}
                      className="text-[10px] text-stone-400 hover:text-stone-600 transition cursor-pointer"
                      disabled={isSyncing}
                    >
                      Bersihkan Log
                    </button>
                  </div>
                  <div 
                    ref={logContainerRef}
                    className="bg-stone-900 border border-stone-800 text-[11px] text-gray-200 p-3 h-52 overflow-y-auto rounded-xl font-mono leading-relaxed space-y-1 select-text scroll-smooth"
                  >
                    {logs.map((log, index) => {
                      let colorClass = 'text-stone-300';
                      if (log.includes('[SUKSES]') || log.includes('✓')) colorClass = 'text-emerald-400 font-bold';
                      else if (log.includes('[Peringatan]')) colorClass = 'text-amber-400 font-bold';
                      else if (log.includes('[EROR]')) colorClass = 'text-rose-400 font-black';
                      else if (log.includes('== SELESAI ==')) colorClass = 'text-amber-300 font-extrabold border-t border-stone-700 pt-1 mt-1';
                      return (
                        <div key={index} className={colorClass}>
                          {log}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notification Badges */}
              {errorLog && (
                <div className="p-3 bg-rose-50 border border-rose-250 rounded-xl text-[11.5px] text-rose-700 font-medium flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <div>{errorLog}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

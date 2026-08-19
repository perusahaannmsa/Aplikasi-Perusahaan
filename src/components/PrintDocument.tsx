import React, { useState, useEffect, useMemo } from 'react'; 
import { Submission } from '../types';
import { formatRupiah, formatDateIndonesian, numberToTerbilang } from '../utils';
import { NusantaraLogo } from './NusantaraLogo';
import { Printer, ArrowLeft, Layers, FileText, CheckCircle, Cloud, Loader2, Lock, ShieldAlert, RefreshCw, Share2, Copy, Check, Send, Edit2, Trash, Trash2, RotateCw, Coins } from 'lucide-react';
import { getStoredGoogleDriveToken, googleDriveLogin, saveSubmissionToFirestore } from '../firebase';

interface PrintDocumentProps {
  submission: Submission;
  onBack: () => void;
  onEdit?: () => void;
  onOpenSppdEditor?: () => void;
  userProfile?: any;
  initialTab?: 'both' | 'pengajuan' | 'pengeluaran' | 'lampiran';
  onUpdateSubmission?: (updated: Submission) => void;
  isSharedView?: boolean;
}

const getGoogleDriveEmbedUrl = (url: string): string => {
  if (!url) return '';
  if (url.includes('/preview')) return url;
  
  const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) {
    return `https://drive.google.com/file/d/${dMatch[1]}/preview`;
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
  }
  return url;
};

export interface RenderedPage {
  id: string;
  fileName: string;
  fileIndex: number;
  pageNumber: number;
  dataUrl: string;
  isLandscape?: boolean;
  isPlaceholder?: boolean;
  errorReason?: string;
  fileId?: string;
  fileUrl?: string;
}

const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = () => {
      reject(new Error('Gagal memuat pustaka PDF.js'));
    };
    document.head.appendChild(script);
  });
};

// Helper functions for real-time Google Drive synchronization
const findFolderIdForSubmission = async (token: string, sub: any): Promise<string | null> => {
  try {
    // 1. Search 'Voucher-APP' folder under root
    const resVoucherApp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        "name = 'Voucher-APP' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false"
      )}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resVoucherApp.ok) return null;
    const dataVoucherApp = await resVoucherApp.json();
    if (!dataVoucherApp.files || dataVoucherApp.files.length === 0) return null;
    const voucherAppId = dataVoucherApp.files[0].id;

    // 2. Resolve Year/Month/Day folder parameters from submission.tanggal
    const parts = (sub.tanggal || '').split('-');
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

    const companyUpper = 'NMSA';

    // 3. Search Company folder under 'Voucher-APP'
    const resCompany = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name = '${companyUpper}' and mimeType = 'application/vnd.google-apps.folder' and '${voucherAppId}' in parents and trashed = false`
      )}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resCompany.ok) return null;
    const dataCompany = await resCompany.json();
    if (!dataCompany.files || dataCompany.files.length === 0) return null;
    const companyId = dataCompany.files[0].id;

    // 4. Search Year folder under Company folder
    const resYear = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name = '${yearStr}' and mimeType = 'application/vnd.google-apps.folder' and '${companyId}' in parents and trashed = false`
      )}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resYear.ok) return null;
    const dataYear = await resYear.json();
    if (!dataYear.files || dataYear.files.length === 0) return null;
    const yearId = dataYear.files[0].id;

    // 5. Search Month folder under Year folder
    const resMonth = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name = '${monthStr}' and mimeType = 'application/vnd.google-apps.folder' and '${yearId}' in parents and trashed = false`
      )}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resMonth.ok) return null;
    const dataMonth = await resMonth.json();
    if (!dataMonth.files || dataMonth.files.length === 0) return null;
    const monthId = dataMonth.files[0].id;

    // 6. Search Day folder under Month folder
    const resDay = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name = '${dayStr}' and mimeType = 'application/vnd.google-apps.folder' and '${monthId}' in parents and trashed = false`
      )}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resDay.ok) return null;
    const dataDay = await resDay.json();
    if (!dataDay.files || dataDay.files.length === 0) return null;
    const dayId = dataDay.files[0].id;

    // 7. Search Custom Transaction folder under Day folder
    const cleanJenis = (sub.jenisPengajuan || 'Pengajuan').trim().replace(/[\/\\?%*:|"<>.]/g, '');
    const cleanPenerima = (sub.dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
    const txFolderName = `${cleanJenis} - ${cleanPenerima}`;

    const resTx = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name = '${txFolderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${dayId}' in parents and trashed = false`
      )}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resTx.ok) return null;
    const dataTx = await resTx.json();
    if (!dataTx.files || dataTx.files.length === 0) return null;
    return dataTx.files[0].id;
  } catch (err) {
    console.error('Error finding Google Drive folder ID:', err);
    return null;
  }
};

const fetchAllFolderFilesRecursive = async (token: string, folderId: string): Promise<any[]> => {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `'${folderId}' in parents and trashed = false`
      )}&fields=files(id,name,webViewLink,mimeType)&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const topFiles = data.files || [];
    
    let allFiles = [...topFiles];
    
    // Check if there is a "Bukti Pembayaran" folder
    const bpFolder = topFiles.find(f => f.mimeType === 'application/vnd.google-apps.folder' && f.name === 'Bukti Pembayaran');
    if (bpFolder) {
      const bpRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          `'${bpFolder.id}' in parents and trashed = false`
        )}&fields=files(id,name,webViewLink,mimeType)&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (bpRes.ok) {
        const bpData = await bpRes.json();
        const bpFiles = (bpData.files || []).map((f: any) => ({
          ...f,
          isBuktiPembayaran: true
        }));
        allFiles = [...allFiles, ...bpFiles];
      }
    }
    
    return allFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  } catch (err) {
    console.error('Error recursive listing files:', err);
    return [];
  }
};

const syncDriveFilesToAppFormat = (driveFiles: any[], cleanJenis: string, cleanPenerima: string) => {
  return driveFiles.map(f => {
    const name = f.name || '';
    const url = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view?usp=drivesdk`;
    
    let isF1 = false;
    let isF2 = false;
    let isBuktiPembayaran = !!f.isBuktiPembayaran;
    let docType = '';

    const nameUpper = name.toUpperCase();
    if (nameUpper.startsWith('F1 -') || nameUpper.startsWith('F1-') || nameUpper === 'F1.PDF') {
      isF1 = true;
    } else if (nameUpper.startsWith('F2 -') || nameUpper.startsWith('F2-') || nameUpper === 'F2.PDF') {
      isF2 = true;
    } else if (nameUpper.startsWith('PETTYCASH -') || nameUpper.startsWith('PETTY_CASH -') || nameUpper.startsWith('PETTYCASH-') || nameUpper.includes('PETTYCASH')) {
      docType = 'petty_cash_report';
    } else if (nameUpper.startsWith('INV -') || nameUpper.startsWith('INV-') || nameUpper.startsWith('INVOICE -') || nameUpper.includes('INVOICE')) {
      docType = 'invoice_vendor';
    } else if (nameUpper.startsWith('BUKTI_BAYAR -') || nameUpper.startsWith('BUKTI_BAYAR-') || nameUpper.startsWith('BUKTI_TRANSFER -') || nameUpper.startsWith('BKK -') || nameUpper.startsWith('BKM -')) {
      isBuktiPembayaran = true;
    } else {
      docType = 'attachment';
    }

    return {
      url,
      name,
      isF1,
      isF2,
      isBuktiPembayaran,
      docType
    };
  });
};

// PageScaleWrapper wraps a print sheet to fit the responsive layout of the viewport on screen while remaining unscaled in print
const PageScaleWrapper: React.FC<{ children: React.ReactNode; isLandscape?: boolean; isLastPage?: boolean }> = ({ children, isLandscape, isLastPage }) => {
  const [scale, setScale] = useState(1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // A4 dimensions at 96 DPI: 
  // Portrait: 210mm x 297mm -> 794px x 1123px
  // Landscape: 297mm x 210mm -> 1123px x 794px
  const targetWidth = isLandscape ? 1123 : 794;
  const targetHeight = isLandscape ? 794 : 1123;

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const viewportWidth = window.innerWidth;
      const parentRectWidth = containerRef.current.parentElement?.getBoundingClientRect().width || viewportWidth;
      
      // Resolve circular dependency where parent stretches to fit child:
      // We bound parentRectWidth by viewportWidth to ensure it never exceeds the screen width on mobile devices.
      const parentWidth = Math.min(parentRectWidth, viewportWidth);
      const padding = 24; // responsive margin padding
      const availableWidth = parentWidth - padding;
      
      if (availableWidth < targetWidth) {
        setScale(availableWidth / targetWidth);
      } else {
        setScale(1);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    const timer = setTimeout(handleResize, 150);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [targetWidth]);

  if (scale < 1) {
    return (
      <div 
        ref={containerRef} 
        className={`w-full flex flex-col items-center justify-center print:!block print:!w-auto print:!h-auto print:!overflow-visible ${!isLastPage ? "print-force-page-break" : ""}`}
      >
        <div 
          style={{ 
            width: `${targetWidth * scale}px`,
            height: `${targetHeight * scale}px`,
          }}
          className="relative overflow-hidden flex items-start justify-start print:!w-auto print:!h-auto print:!overflow-visible print:!block"
        >
          <div 
            style={{ 
              transform: `scale(${scale})`, 
              transformOrigin: 'top left',
              width: `${targetWidth}px`,
              height: `${targetHeight}px`,
            }}
            className="origin-top-left shrink-0 print:!transform-none print:!w-auto print:!h-auto print:!overflow-visible print:!block print:!p-0 print:!m-0"
          >
            {children}
          </div>
        </div>
      </div>
    );
  }

  // Normal scale (no scaling needed)
  return (
    <div ref={containerRef} className={`w-full flex flex-col items-center print:!block print:!w-auto ${!isLastPage ? "print-force-page-break" : ""}`}>
      <div className="shrink-0 print:!block print:!w-auto print:!h-auto print:!overflow-visible">
        {children}
      </div>
    </div>
  );
};

export const PrintDocument: React.FC<PrintDocumentProps> = ({ submission, onBack, onEdit, onOpenSppdEditor, userProfile, initialTab, onUpdateSubmission, isSharedView }) => {
  const [activeTab, setActiveTab] = useState<'both' | 'pengajuan' | 'pengeluaran' | 'slip_gaji' | 'lampiran'>(
    initialTab || 'both'
  );
  const [printLayoutMode, setPrintLayoutMode] = useState<'standard' | 'compact_70' | 'eco_1page'>('standard');
  const [showF2, setShowF2] = useState<boolean>(true);
  const [f1Verifier, setF1Verifier] = useState<'rifki' | 'nursyam'>(() => {
    if (submission.diverifikasiOleh?.toLowerCase().includes('nursyam')) return 'nursyam';
    return 'rifki';
  });
  const [f2ApprovedBy, setF2ApprovedBy] = useState<'harijon' | 'nursyam' | 'none'>(() => {
    if (submission.disetujuiOleh && submission.disetujuiOleh.toLowerCase().includes('nursyam')) {
      return 'nursyam';
    }
    if (submission.disetujuiOleh && submission.disetujuiOleh.toLowerCase().includes('harijon')) {
      return 'harijon';
    }
    return 'none';
  });
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([]);
  const [deletedPageIds, setDeletedPageIds] = useState<string[]>([]);
  const [pageRotations, setPageRotations] = useState<{[key: string]: number}>({});
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isSavingPages, setIsSavingPages] = useState(false);
  const [savePagesSuccess, setSavePagesSuccess] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [fileOwnership, setFileOwnership] = useState<{[key: string]: 'mine' | 'others' | 'unknown'}>({});
  const [isCopying, setIsCopying] = useState<{[key: string]: boolean}>({});

  const [isConnectedToDrive, setIsConnectedToDrive] = useState(!!getStoredGoogleDriveToken());
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Real-time synced file state from Google Drive
  const [syncedDriveFiles, setSyncedDriveFiles] = useState<any[]>(() => submission.googleDriveFiles || []);
  const [isSyncingDriveFiles, setIsSyncingDriveFiles] = useState(false);

  // Reordering of attachment documents after F1 & F2
  const [attachmentOrderPreset, setAttachmentOrderPreset] = useState<'lampiran_first' | 'transfer_first' | 'petty_first' | 'custom'>('lampiran_first');
  const [customFileOrder, setCustomFileOrder] = useState<string[]>([]);

  // Sync deleted pages state when submission prop changes (reset local changes on save)
  useEffect(() => {
    setDeletedPageIds([]);
  }, [submission.deletedPageIds]);

  // Sync files from Google Drive in real-time
  useEffect(() => {
    const syncFiles = async () => {
      const token = getStoredGoogleDriveToken();
      if (!token) return;

      setIsSyncingDriveFiles(true);
      try {
        let folderId = (submission as any).googleDriveFolderId;
        if (!folderId) {
          folderId = await findFolderIdForSubmission(token, submission);
        }

        if (folderId) {
          const driveFiles = await fetchAllFolderFilesRecursive(token, folderId);
          const cleanJenis = (submission.jenisPengajuan || 'Pengajuan').trim().replace(/[\/\\?%*:|"<>.]/g, '');
          const cleanPenerima = (submission.dibayarkanKepada || 'Penerima').trim().replace(/[\/\\?%*:|"<>.]/g, '');
          const formattedFiles = syncDriveFilesToAppFormat(driveFiles, cleanJenis, cleanPenerima);
          
          if (formattedFiles.length > 0) {
            setSyncedDriveFiles(formattedFiles);
          }
        }
      } catch (err) {
        console.error('Error syncing files from Google Drive:', err);
      } finally {
        setIsSyncingDriveFiles(false);
      }
    };

    syncFiles();
  }, [submission, reloadTrigger]);

  const handleConnectDriveFromWarning = async () => {
    setIsConnectingDrive(true);
    try {
      const loginRes = await googleDriveLogin();
      if (loginRes.accessToken) {
        setIsConnectedToDrive(true);
        setReloadTrigger(prev => prev + 1);
      }
    } catch (err: any) {
      alert("Gagal menghubungkan Google Drive Anda: " + (err.message || err));
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const grandTotal = submission.items.reduce((sum, item) => sum + item.total, 0);

  const displayFiles = syncedDriveFiles.length > 0 ? syncedDriveFiles : (submission.googleDriveFiles || []);

  const billFiles = displayFiles.filter(
    (f: any) => !f.isF1 && !f.isF2 && !f.isBuktiPembayaran && f.docType !== 'petty_cash_report'
  );
  
  const legacyFiles = !(submission.googleDriveFiles && submission.googleDriveFiles.length > 0) && submission.googleDriveFileUrl
    ? [{ url: submission.googleDriveFileUrl, name: submission.googleDriveFileName || 'Lampiran Bukti' }]
    : [];
    
  const activeBillFiles = billFiles.length > 0 ? billFiles : legacyFiles;

  const paymentProofFile = submission.buktiPembayaran || displayFiles.find((f: any) => f.isBuktiPembayaran);
  const pettyCashReportFile = submission.pettyCashFile || displayFiles.find((f: any) => f.docType === 'petty_cash_report');
  
  const handleMoveAttachmentFile = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= attachmentFiles.length) return;
    const newFiles = [...attachmentFiles];
    const temp = newFiles[index];
    newFiles[index] = newFiles[targetIndex];
    newFiles[targetIndex] = temp;
    setAttachmentOrderPreset('custom');
    setCustomFileOrder(newFiles.map(f => f.url || f.name || ''));
  };

  const attachmentFiles = useMemo(() => {
    let files: any[] = [];
    if (attachmentOrderPreset === 'transfer_first') {
      files = [
        ...(paymentProofFile ? [{ ...paymentProofFile, isBuktiPembayaran: true }] : []),
        ...activeBillFiles,
        ...(pettyCashReportFile ? [{ ...pettyCashReportFile, docType: 'petty_cash_report' }] : [])
      ];
    } else if (attachmentOrderPreset === 'petty_first') {
      files = [
        ...(pettyCashReportFile ? [{ ...pettyCashReportFile, docType: 'petty_cash_report' }] : []),
        ...(paymentProofFile ? [{ ...paymentProofFile, isBuktiPembayaran: true }] : []),
        ...activeBillFiles
      ];
    } else {
      // Default: lampiran / nota / invoice first
      files = [
        ...activeBillFiles,
        ...(paymentProofFile ? [{ ...paymentProofFile, isBuktiPembayaran: true }] : []),
        ...(pettyCashReportFile ? [{ ...pettyCashReportFile, docType: 'petty_cash_report' }] : [])
      ];
    }

    if (customFileOrder.length > 0) {
      files.sort((a, b) => {
        const keyA = a.url || a.name || '';
        const keyB = b.url || b.name || '';
        const idxA = customFileOrder.indexOf(keyA);
        const idxB = customFileOrder.indexOf(keyB);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
    }

    return files;
  }, [activeBillFiles, paymentProofFile, pettyCashReportFile, attachmentOrderPreset, customFileOrder]);

  // Check which files are owned by the current user vs others in Drive
  useEffect(() => {
    const checkFilesOwnership = async () => {
      const token = getStoredGoogleDriveToken();
      if (!token || attachmentFiles.length === 0) return;

      const newOwnership: {[key: string]: 'mine' | 'others' | 'unknown'} = {};
      
      for (const file of attachmentFiles) {
        if (!file.url) continue;
        const dMatch = file.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        const idMatch = file.url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
        
        if (fileId) {
          try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=owners(me,emailAddress)`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            if (res.ok) {
              const data = await res.json();
              const isMine = data.owners && data.owners.some((o: any) => o.me === true);
              newOwnership[fileId] = isMine ? 'mine' : 'others';
            } else {
              // If we fail because we don't own it or can't see owners, it's owned by others
              newOwnership[fileId] = 'others';
            }
          } catch (err) {
            newOwnership[fileId] = 'unknown';
          }
        }
      }
      
      setFileOwnership(prev => ({ ...prev, ...newOwnership }));
    };

    checkFilesOwnership();
  }, [submission, reloadTrigger]);

  const handleCopyFileToMyDrive = async (fileUrl: string, fileName: string) => {
    const dMatch = fileUrl ? fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) : null;
    const idMatch = fileUrl ? fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) : null;
    const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
    
    if (!fileId) {
      alert("Maaf, ID berkas tidak ditemukan di URL ini.");
      return;
    }
    
    let token = getStoredGoogleDriveToken();
    if (!token) {
      try {
        const loginRes = await googleDriveLogin();
        token = loginRes.accessToken;
      } catch (err: any) {
        alert("Gagal menghubungkan Google Drive Anda: " + (err.message || err));
        return;
      }
    }
    
    if (!token) {
      alert("Silakan hubungkan akun Google Drive Anda terlebih dahulu.");
      return;
    }
    
    setIsCopying(prev => ({ ...prev, [fileId]: true }));
    
    try {
      // 1. Copy the file in Drive using copy API
      const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name,webViewLink`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: fileName
        })
      });
      
      if (!copyRes.ok) {
        const errText = await copyRes.text();
        throw new Error(`Google API error ${copyRes.status}: ${errText}`);
      }
      
      const newFileData = await copyRes.json();
      const newFileId = newFileData.id;
      const newFileUrl = `https://docs.google.com/uc?export=view&id=${newFileId}`;
      
      // 2. Grant permissions to anyone with link as reader
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${newFileId}/permissions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        });
      } catch (perErr) {
        console.warn("Could not set permissions for copied file:", perErr);
      }
      
      // 3. Update paths in Firestore
      const updatedSubmission = { ...submission };
      
      if (updatedSubmission.googleDriveFileUrl === fileUrl) {
        updatedSubmission.googleDriveFileUrl = newFileUrl;
      }
      
      if (updatedSubmission.buktiPembayaran && updatedSubmission.buktiPembayaran.url === fileUrl) {
        updatedSubmission.buktiPembayaran = {
          ...updatedSubmission.buktiPembayaran,
          url: newFileUrl
        };
      }
      
      if (updatedSubmission.googleDriveFiles) {
        updatedSubmission.googleDriveFiles = updatedSubmission.googleDriveFiles.map(f => {
          if (f.url === fileUrl) {
            return {
              ...f,
              url: newFileUrl
            };
          }
          return f;
        });
      }
      
      await saveSubmissionToFirestore(
        updatedSubmission,
        userProfile?.companyId || 'nmsa',
        userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi'
      );
      
      // Update local states
      setFileOwnership(prev => ({ ...prev, [newFileId]: 'mine' }));
      
      alert(`Sukses menyalin berkas "${fileName}" ke Google Drive Anda! Sekarang berkas aman tersimpan di akun Anda.`);
      
      setReloadTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error("Failed to copy file:", err);
      const errMsg = err.message || String(err);
      if (errMsg.includes("404") || errMsg.toLowerCase().includes("not found")) {
        alert(`Dokumen asli "${fileName}" tidak ditemukan di Google Drive.\n\nKemungkinan:\n1. Berkas telah dihapus atau dipindahkan ke Sampah oleh pemiliknya.\n2. Berkas diunggah menggunakan akun Google Apps yang berbeda, sehingga akun Anda saat ini tidak memiliki hak akses.\n\nSaran: Silakan periksa atau unggah ulang berkas dokumen pendukung Anda melalui tombol "Edit Transaksi".`);
      } else {
        alert("Gagal menyalin berkas ke Google Drive Anda: " + errMsg);
      }
    } finally {
      setIsCopying(prev => ({ ...prev, [fileId]: false }));
    }
  };

  // Dynamic document title based on "Jenis Pengajuan & Nomor Kode" for proper PDF download naming
  useEffect(() => {
    const originalTitle = document.title;
    if (submission) {
      const jenis = submission.jenisPengajuan || 'Pengajuan';
      const kode = submission.kode || 'Dokumen';
      const cleanTitle = `${jenis}-${kode}`
        .replace(/[\s/\\_]+/g, '-') // Replace spaces, slashes, backslashes, underscores with '-'
        .replace(/-+/g, '-')        // Collapse consecutive '-' to a single '-'
        .trim()                     // Trim leading/trailing whitespace
        .replace(/^-+|-+$/g, '');   // Trim leading/trailing dashes

      document.title = cleanTitle || originalTitle;
    }
    return () => {
      document.title = originalTitle;
    };
  }, [submission]);

  useEffect(() => {
    if (attachmentFiles.length === 0) {
      setRenderedPages([]);
      return;
    }

    let isMounted = true;
    const processFiles = async () => {
      setIsLoadingPages(true);
      setLoadError('');
      setRenderedPages([]);

      try {
        const token = getStoredGoogleDriveToken();
        const tempPages: RenderedPage[] = [];

        for (let i = 0; i < attachmentFiles.length; i++) {
          const file = attachmentFiles[i];
          if (isMounted) {
            setLoadingProgress(`Mengunduh berkas ${i + 1} dari ${attachmentFiles.length}: ${file.name}...`);
          }

          if (file.url && (file.url.startsWith('data:') || file.url.startsWith('blob:'))) {
            const isPdf = /\.pdf/i.test(file.name || '') || file.url.startsWith('data:application/pdf');
            if (isPdf) {
              if (isMounted) {
                setLoadingProgress(`Membaca dokumen PDF ${file.name}...`);
              }
              try {
                const pdfjsLib = await loadPdfJs();
                let pdfData: any = file.url;
                if (file.url.startsWith('data:application/pdf;base64,')) {
                  const base64Content = file.url.split(',')[1];
                  const binStr = atob(base64Content);
                  const len = binStr.length;
                  const bytes = new Uint8Array(len);
                  for (let j = 0; j < len; j++) {
                    bytes[j] = binStr.charCodeAt(j);
                  }
                  pdfData = { data: bytes.buffer };
                }
                const pdf = await pdfjsLib.getDocument(pdfData).promise;

                for (let pNum = 1; pNum <= pdf.numPages; pNum++) {
                  if (isMounted) {
                    setLoadingProgress(`Merender PDF ${file.name} - Halaman ${pNum} dari ${pdf.numPages}...`);
                  }
                  const page = await pdf.getPage(pNum);
                  const viewport = page.getViewport({ scale: 2.2 });
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  if (!context) continue;

                  canvas.height = viewport.height;
                  canvas.width = viewport.width;

                  await page.render({
                    canvasContext: context,
                    viewport: viewport
                  }).promise;

                  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                  const isLandscape = viewport.width > viewport.height;
                  tempPages.push({
                    id: `b64-pdf-${i}-p${pNum}`,
                    fileName: file.name,
                    fileIndex: i,
                    pageNumber: pNum,
                    dataUrl,
                    isLandscape
                  });
                }
              } catch (pdfErr) {
                console.error('Error rendering base64 PDF, falling back to direct:', pdfErr);
                tempPages.push({
                  id: `direct-b64-${i}-${Date.now()}`,
                  fileName: file.name,
                  fileIndex: i,
                  pageNumber: 1,
                  dataUrl: file.url,
                  isLandscape: false
                });
              }
            } else {
              let isLandscape = false;
              try {
                const img = new Image();
                img.src = file.url;
                await new Promise((resolve) => {
                  img.onload = () => {
                    isLandscape = img.width > img.height;
                    resolve(null);
                  };
                  img.onerror = () => resolve(null);
                });
              } catch (e) {
                console.warn('Failed to parse direct file orientation, defaulting to portrait', e);
              }
              tempPages.push({
                id: `direct-b64-${i}-${Date.now()}`,
                fileName: file.name,
                fileIndex: i,
                pageNumber: 1,
                dataUrl: file.url,
                isLandscape
              });
            }
            continue;
          }

          const dMatch = file.url ? file.url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) : null;
          const idMatch = file.url ? file.url.match(/[?&]id=([a-zA-Z0-9_-]+)/) : null;
          const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);

          if (!fileId) {
            console.warn('Tidak dapat menemukan file ID untuk', file?.url);
            continue;
          }

          try {
            const isPdf = /\.pdf/i.test(file.name || '') || file.url.includes('.pdf');

            // Download file content via authenticated direct API, server-side CORS proxy, or public fallback download
            let fileBlob: Blob | null = null;
            try {
              if (token) {
                try {
                  const headers: HeadersInit = {
                    'Authorization': `Bearer ${token}`
                  };
                  const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers });
                  if (fileRes.ok) {
                    fileBlob = await fileRes.blob();
                  } else {
                    console.warn(`Gagal mengambil media via token direct (status ${fileRes.status}), mencoba proxy...`);
                  }
                } catch (tokenErr) {
                  console.warn('Gagal unduh via token direct, dialihkan ke proxy:', tokenErr);
                }
              }

              // If token failed, absent, or we don't have one, use the server-side CORS proxy
              if (!fileBlob) {
                const proxyRes = await fetch(`/api/drive-proxy?id=${fileId}`);
                if (proxyRes.ok) {
                  fileBlob = await proxyRes.blob();
                } else {
                  console.warn(`Proxy server mengembalikan status ${proxyRes.status}, mencoba fallback langsung...`);
                }
              }
            } catch (err) {
              console.warn('Gagal unduh lewat token/proxy, mencoba fallback langsung:', err);
            }

            if (!fileBlob) {
              try {
                if (!isPdf) {
                  // Non-PDF files (images) fallback direct export
                  const dataUrl = `https://docs.google.com/uc?export=view&id=${fileId}`;
                  let isLandscape = false;
                  try {
                    const img = new Image();
                    img.src = dataUrl;
                    await new Promise((resolve) => {
                      img.onload = () => {
                        isLandscape = img.width > img.height;
                        resolve(null);
                      };
                      img.onerror = () => resolve(null);
                    });
                  } catch (e) {
                    console.warn('Failed to parse fallback image orientation, defaulting to portrait', e);
                  }

                  tempPages.push({
                    id: `${fileId}-fallback-img`,
                    fileName: file.name,
                    fileIndex: i,
                    pageNumber: 1,
                    dataUrl,
                    isLandscape
                  });
                  continue;
                } else {
                  // Fallback direct download
                  const publicRes = await fetch(`https://docs.google.com/uc?export=download&id=${fileId}`);
                  if (publicRes.ok) {
                    fileBlob = await publicRes.blob();
                  } else {
                    throw new Error(`HTTP ${publicRes.status}`);
                  }
                }
              } catch (fallbackErr) {
                throw new Error(`Gagal mengunduh dokumen dari Google Drive. Pastikan berkas diatur "Akses Publik" (Anyone with link can view).`);
              }
            }

            if (isPdf && fileBlob) {
              if (isMounted) {
                setLoadingProgress(`Membaca dokumen PDF ${file.name}...`);
              }
              const pdfjsLib = await loadPdfJs();
              const arrayBuffer = await fileBlob.arrayBuffer();
              const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

              for (let pNum = 1; pNum <= pdf.numPages; pNum++) {
                if (isMounted) {
                  setLoadingProgress(`Merender PDF ${file.name} - Halaman ${pNum} dari ${pdf.numPages}...`);
                }
                const page = await pdf.getPage(pNum);
                // Scale to 2.2 for high-definition print resolution which preserves micro-text readability
                const viewport = page.getViewport({ scale: 2.2 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) continue;

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({
                  canvasContext: context,
                  viewport: viewport
                }).promise;

                const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                const isLandscape = viewport.width > viewport.height;
                tempPages.push({
                  id: `${fileId}-p${pNum}`,
                  fileName: file.name,
                  fileIndex: i,
                  pageNumber: pNum,
                  dataUrl,
                  isLandscape
                });
              }
            } else if (fileBlob) {
              // Treat as single-page image
              const dataUrl = URL.createObjectURL(fileBlob);
              
              // Asynchronously load the image to determine its orientation (portrait or landscape)
              let isLandscape = false;
              try {
                const img = new Image();
                img.src = dataUrl;
                await new Promise((resolve) => {
                  img.onload = () => {
                    isLandscape = img.width > img.height;
                    resolve(null);
                  };
                  img.onerror = () => resolve(null);
                });
              } catch (e) {
                console.warn('Failed to parse image orientation, defaulting to portrait', e);
              }

              tempPages.push({
                id: `${fileId}-img`,
                fileName: file.name,
                fileIndex: i,
                pageNumber: 1,
                dataUrl,
                isLandscape
              });
            }
          } catch (fileErr: any) {
            console.warn(`Error rendering individual attachment ${file.name}:`, fileErr);
            tempPages.push({
              id: `${fileId}-placeholder-error`,
              fileName: file.name,
              fileIndex: i,
              pageNumber: 1,
              dataUrl: '',
              isLandscape: false,
              isPlaceholder: true,
              errorReason: fileErr.message || String(fileErr),
              fileId: fileId,
              fileUrl: file.url
            });
          }
        }

        if (isMounted) {
          setRenderedPages(tempPages);
        }
      } catch (err: any) {
        console.error('Failure rendering attachments:', err);
        if (isMounted) {
          setLoadError(`Gagal mempersiapkan dokumen lampiran bukti: ${err.message || err}. Silakan hubungkan ulang Google Drive Anda.`);
        }
      } finally {
        if (isMounted) {
          setIsLoadingPages(false);
        }
      }
    };

    processFiles();

    return () => {
      isMounted = false;
    };
  }, [submission, reloadTrigger]);

  const handlePrint = () => {
    window.print();
  };

  const getFilesToBeDeletedFromDrive = (): any[] => {
    const token = getStoredGoogleDriveToken();
    if (!token) return [];

    const filesToDelete: any[] = [];
    
    attachmentFiles.forEach((file, fileIdx) => {
      // Find all pages belonging to this file index in renderedPages
      const pagesForFile = renderedPages.filter(p => p.fileIndex === fileIdx);
      if (pagesForFile.length === 0) return;

      // Check if every page for this file is in the newly deleted page IDs
      const allPagesDeleted = pagesForFile.every(p => deletedPageIds.includes(p.id));
      if (allPagesDeleted) {
        // Find the Google Drive file ID
        const url = file.url || '';
        const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
        if (fileId) {
          filesToDelete.push({
            fileId,
            name: file.name,
            fileIndex: fileIdx
          });
        }
      }
    });

    return filesToDelete;
  };

  const handleSaveDeletedPages = async () => {
    setIsSavingPages(true);
    setSavePagesSuccess(false);
    setIsConfirmDeleteOpen(false);
    try {
      const token = getStoredGoogleDriveToken();
      const filesToDelete = getFilesToBeDeletedFromDrive();
      
      // Delete from Google Drive if token and file IDs are present
      if (token && filesToDelete.length > 0) {
        for (const file of filesToDelete) {
          try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${file.fileId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            console.log(`Deleted file ${file.name} from Google Drive.`);
          } catch (driveErr) {
            console.error(`Failed to delete file ${file.name} from Google Drive:`, driveErr);
          }
        }
      }

      // Update submission state
      const mergedDeletedPageIds = [
        ...(submission.deletedPageIds || []),
        ...deletedPageIds
      ];

      // Remove deleted files from the submission's file list to synchronize
      let updatedFiles = submission.googleDriveFiles ? [...submission.googleDriveFiles] : [];
      let updatedFileUrl = submission.googleDriveFileUrl;
      let updatedFileName = submission.googleDriveFileName;

      if (filesToDelete.length > 0) {
        const deletedIds = filesToDelete.map(f => f.fileId);
        
        // Filter out deleted files from googleDriveFiles list
        if (submission.googleDriveFiles) {
          updatedFiles = submission.googleDriveFiles.filter(f => {
            const fMatch = f.url?.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || f.url?.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            const fId = fMatch ? fMatch[1] : null;
            return !deletedIds.includes(fId);
          });
        }

        // If the main legacy URL matches a deleted file, clear it
        if (submission.googleDriveFileUrl) {
          const lMatch = submission.googleDriveFileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || submission.googleDriveFileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
          const lId = lMatch ? lMatch[1] : null;
          if (deletedIds.includes(lId)) {
            updatedFileUrl = '';
            updatedFileName = '';
          }
        }
      }

      const updatedSubmission: Submission = {
        ...submission,
        deletedPageIds: mergedDeletedPageIds,
        googleDriveFiles: updatedFiles,
        googleDriveFileUrl: updatedFileUrl,
        googleDriveFileName: updatedFileName
      };

      await saveSubmissionToFirestore(
        updatedSubmission,
        userProfile?.companyId || 'nmsa',
        userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi'
      );
      
      // Notify parent of the updated submission to keep app state synchronized
      if (onUpdateSubmission) {
        onUpdateSubmission(updatedSubmission);
      }

      // Trigger success state
      setSavePagesSuccess(true);
      setDeletedPageIds([]); // Reset local state
      setTimeout(() => setSavePagesSuccess(false), 3000);
    } catch (err: any) {
      console.error("Failed to save deleted pages:", err);
      alert("Gagal menyimpan susunan halaman: " + (err.message || String(err)));
    } finally {
      setIsSavingPages(false);
    }
  };

  const visiblePages = renderedPages.filter(page => {
    const savedDeletedIds = submission.deletedPageIds || [];
    if (savedDeletedIds.includes(page.id) || deletedPageIds.includes(page.id)) {
      return false;
    }
    const fileObj = attachmentFiles[page.fileIndex];
    if (activeTab === 'pengeluaran') {
      return fileObj?.isBuktiPembayaran === true;
    }
    if (activeTab === 'lampiran') {
      return !fileObj?.isBuktiPembayaran;
    }
    return true;
  });

  const basePagesCount = showF2 ? (printLayoutMode === 'eco_1page' ? 1 : 2) : 1;
  const totalPagesCount = activeTab === 'pengajuan'
    ? basePagesCount
    : (activeTab === 'pengeluaran' || activeTab === 'lampiran' ? visiblePages.length : basePagesCount + visiblePages.length);

  return (
    <div className="space-y-6">
      {/* Tab Controls / Print Actions */}
      {!isSharedView && (
        <div className="bg-white rounded-2xl border border-stone-250 shadow-xs p-5 space-y-4 print:hidden">
        {/* Row 1: Title block & Action buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-3 text-left">
            <button
              onClick={onBack}
              id="btn-print-back"
              className="p-2 hover:bg-stone-100 text-stone-500 hover:text-stone-900 rounded-xl transition cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="space-y-0.5">
              <h3 className="font-display font-black text-stone-900 text-lg leading-tight">Preview & Cetak Dokumen</h3>
              <p className="text-xs text-stone-500">Sesuaikan format cetak berkas dan bagikan tautan transaksi terpadu Anda.</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full sm:w-auto">
            {((submission.jenisPengajuan || '').toLowerCase().includes('perjalanan dinas') || (submission.jenisPengajuan || '').toLowerCase().includes('sppd')) && onOpenSppdEditor && (
              <button
                type="button"
                onClick={onOpenSppdEditor}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-950 font-extrabold px-4 py-2.5 rounded-xl transition cursor-pointer shadow-3xs text-sm shrink-0"
                title="Edit Form SPPD & Lembar Perjalanan Dinas"
              >
                <FileText size={16} />
                <span>Edit Form SPPD</span>
              </button>
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 font-bold px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs text-sm shrink-0"
              >
                <Edit2 size={16} />
                <span>Edit Transaksi</span>
              </button>
            )}
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs text-sm shrink-0"
            >
              <Share2 size={16} />
              <span>Bagikan Transaksi</span>
            </button>
            
            <button
              onClick={handlePrint}
              id="btn-print-document"
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-850 text-white font-bold px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs text-sm shrink-0"
            >
              <Printer size={16} />
              <span>Cetak PDF / A4</span>
            </button>
          </div>
        </div>

        {/* Row 2: Tab Selection & Layout Mode Selector & Status Lampiran */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Tab Selection & Layout Mode */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 flex-wrap gap-1">
              <button
                onClick={() => setActiveTab('both')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'both' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-550 hover:text-stone-955'
                }`}
              >
                <Layers size={13} />
                {attachmentFiles.length > 0 ? `Cetak Semua (${isLoadingPages ? '...' : totalPagesCount} Hal)` : 'Cetak Semua Halaman'}
              </button>
              <button
                onClick={() => setActiveTab('pengajuan')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'pengajuan' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-550 hover:text-stone-955'
                }`}
              >
                <FileText size={13} />
                Hanya Pengajuan ( F1 & F2 )
              </button>
              <button
                onClick={() => setActiveTab('pengeluaran')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'pengeluaran' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-550 hover:text-stone-955'
                }`}
              >
                <CheckCircle size={13} />
                Hanya Bukti Bayar
              </button>
              {((submission.jenisPengajuan || '').toLowerCase().includes('gaji') || !!submission.salaryDetails) && (
                <button
                  onClick={() => setActiveTab('slip_gaji')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                    activeTab === 'slip_gaji' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-100/70 text-amber-900 hover:bg-amber-200/80'
                  }`}
                >
                  <Coins size={13} />
                  Slip Gaji Karyawan
                </button>
              )}
              {attachmentFiles.length > 0 && (
                <button
                  onClick={() => setActiveTab('lampiran')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                    activeTab === 'lampiran' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-555 hover:text-stone-955'
                  }`}
                >
                  <Cloud size={13} className="text-amber-600" />
                  Hanya Lampiran
                </button>
              )}
            </div>

            {/* Layout Mode Selection & F2 Controls & F1 Verifier Selector */}
            {(activeTab === 'both' || activeTab === 'pengajuan') && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Toggle F2 */}
                <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 items-center gap-1 shadow-3xs">
                  <span className="text-[10px] font-bold text-stone-500 px-2 uppercase font-mono hidden sm:inline">Formulir F2:</span>
                  <button
                    type="button"
                    onClick={() => setShowF2(true)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                      showF2 ? 'bg-amber-600 text-white shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Aktifkan F2 (Formulir Pengajuan Dana)"
                  >
                    <CheckCircle size={12} />
                    <span>Aktifkan F2</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowF2(false)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                      !showF2 ? 'bg-stone-800 text-white shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Nonaktifkan F2 (Hanya 1 Lembar Bukti Pengeluaran Kas F1)"
                  >
                    <span>🚫 Non-Aktif F2 (1 Lembar)</span>
                  </button>
                </div>

                {/* Layout Mode Selection */}
                <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 items-center gap-1 shadow-3xs">
                  <span className="text-[10px] font-bold text-stone-500 px-2 uppercase font-mono hidden sm:inline">Layout:</span>
                  <button
                    type="button"
                    onClick={() => setPrintLayoutMode('standard')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      printLayoutMode === 'standard' ? 'bg-white text-stone-900 shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Format Standar (100% Lebar)"
                  >
                    Standard (100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintLayoutMode('compact_70')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      printLayoutMode === 'compact_70' ? 'bg-amber-600 text-white shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Format 100% Lebar Atas (50% Space Bawah)"
                  >
                    Separuh Atas
                  </button>
                  {showF2 && (
                    <button
                      type="button"
                      onClick={() => setPrintLayoutMode('eco_1page')}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                        printLayoutMode === 'eco_1page' ? 'bg-amber-600 text-white shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                      }`}
                      title="Format Hemat Kertas: F1 (50% Atas) dan F2 (50% Bawah) digabung pas dalam 1 lembar A4"
                    >
                      🌱 Eco (F1+F2 1 Hal)
                    </button>
                  )}
                </div>

                {/* Menu Diverifikasi F1 */}
                <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200 items-center gap-1 shadow-3xs">
                  <span className="text-[10px] font-bold text-stone-500 px-2 uppercase font-mono hidden sm:inline">Diverifikasi (F1):</span>
                  <button
                    type="button"
                    onClick={() => setF1Verifier('rifki')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      f1Verifier === 'rifki' ? 'bg-white text-stone-900 shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Andi Muhammad Rifki (Direktur)"
                  >
                    Andi Muhammad Rifki
                  </button>
                  <button
                    type="button"
                    onClick={() => setF1Verifier('nursyam')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      f1Verifier === 'nursyam' ? 'bg-white text-stone-900 shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Andi Nursyam Halid (Direktur Utama)"
                  >
                    Andi Nursyam Halid
                  </button>
                </div>

                {/* Menu Disetujui F2 */}
                <div className={`flex bg-stone-100 p-1 rounded-xl border border-stone-200 items-center gap-1 shadow-3xs ${!showF2 ? 'opacity-50' : ''}`}>
                  <span className="text-[10px] font-bold text-stone-500 px-2 uppercase font-mono hidden sm:inline">Disetujui (F2):</span>
                  <button
                    type="button"
                    disabled={!showF2}
                    onClick={() => setF2ApprovedBy('harijon')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      f2ApprovedBy === 'harijon' ? 'bg-white text-stone-900 shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Harijon (Direktur Keuangan)"
                  >
                    Harijon
                  </button>
                  <button
                    type="button"
                    disabled={!showF2}
                    onClick={() => setF2ApprovedBy('nursyam')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      f2ApprovedBy === 'nursyam' ? 'bg-white text-stone-900 shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Andi Nursyam Halid (Direktur Utama)"
                  >
                    Andi Nursyam Halid
                  </button>
                  <button
                    type="button"
                    disabled={!showF2}
                    onClick={() => setF2ApprovedBy('none')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      f2ApprovedBy === 'none' ? 'bg-amber-600 text-white shadow-3xs' : 'text-stone-500 hover:text-stone-850'
                    }`}
                    title="Tanpa Disetujui"
                  >
                    🚫 Tanpa Disetujui
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Status Lampiran & Reorder Control */}
          {attachmentFiles.length > 0 && (
            <div className="flex flex-col gap-2 p-3 bg-stone-50 border border-stone-200 rounded-xl print:hidden w-full lg:max-w-[360px] text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Cloud size={14} className="text-amber-600" />
                  <span className="font-semibold text-stone-700 text-xs">Urutan Halaman & Lampiran:</span>
                </div>
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-sm">
                  {attachmentFiles.length} Berkas
                </span>
              </div>
              <div className="text-[11px] max-h-[160px] overflow-y-auto space-y-1.5 scrollbar-thin">
                {attachmentFiles.map((file, i) => {
                  const url = file.url || '';
                  const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                  const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
                  
                  const ownership = fileId ? fileOwnership[fileId] : 'unknown';
                  const copying = fileId ? isCopying[fileId] : false;

                  const isBuktiTransfer = file.isBuktiPembayaran;
                  const isPettyCash = file.docType === 'petty_cash_report';

                  return (
                    <div key={i} className="p-1.5 bg-white border border-stone-200 rounded-lg flex flex-col gap-1 shadow-3xs">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-stone-400">#{i + 1}</span>
                            <a 
                              href={url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="font-bold text-stone-850 hover:text-amber-700 hover:underline block truncate flex-1"
                              title={file.name}
                            >
                              {file.name}
                            </a>
                          </div>
                          {isBuktiTransfer && (
                            <span className="inline-block mt-0.5 text-[9px] px-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-semibold">
                              Bukti Transfer
                            </span>
                          )}
                          {isPettyCash && (
                            <span className="inline-block mt-0.5 text-[9px] px-1 bg-sky-50 text-sky-700 border border-sky-200 rounded font-semibold">
                              LPJ Petty Cash
                            </span>
                          )}
                        </div>

                        {/* Reorder Buttons (Move Up / Down) */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveAttachmentFile(i, 'up')}
                            disabled={i === 0}
                            className="p-1 text-stone-600 hover:text-stone-900 disabled:opacity-30 hover:bg-stone-100 rounded text-[10px] font-bold cursor-pointer"
                            title="Naikkan Urutan Berkas"
                          >
                            ⬆️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveAttachmentFile(i, 'down')}
                            disabled={i === attachmentFiles.length - 1}
                            className="p-1 text-stone-600 hover:text-stone-900 disabled:opacity-30 hover:bg-stone-100 rounded text-[10px] font-bold cursor-pointer"
                            title="Turunkan Urutan Berkas"
                          >
                            ⬇️
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-1 mt-0.5">
                        <span className="text-[9px] font-mono leading-none flex items-center gap-1">
                          {ownership === 'mine' ? (
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Tersimpan di Drive Anda
                            </span>
                          ) : ownership === 'others' ? (
                            <span className="text-amber-600 font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Di Drive Akun Lain
                            </span>
                          ) : (
                            <span className="text-stone-400">Memeriksa kepemilikan...</span>
                          )}
                        </span>

                        {fileId && ownership === 'others' && (
                          <button
                            onClick={() => handleCopyFileToMyDrive(url, file.name)}
                            disabled={copying}
                            className="text-[9px] bg-amber-600 hover:bg-amber-700 disabled:bg-stone-200 text-white font-bold px-2 py-0.5 rounded transition flex items-center gap-0.5 shrink-0 cursor-pointer"
                          >
                            {copying ? (
                              <>
                                <Loader2 size={10} className="animate-spin" />
                                <span>Menyalin...</span>
                              </>
                            ) : (
                              <>
                                <Cloud size={10} />
                                <span>Salin ke Drive Saya</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Row 3: Page Customization / Filter Controls */}
        {(() => {
          if (deletedPageIds.length === 0) return null;

          return (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 bg-amber-50/70 border border-amber-200 text-amber-950 text-xs rounded-xl print:hidden">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-amber-100/80 rounded-lg text-amber-800 shrink-0">
                  <FileText size={14} />
                </span>
                <span>
                  Terdapat <strong>{deletedPageIds.length}</strong> halaman lampiran baru disembunyikan dari cetakan PDF ini.
                  <span className="text-stone-500 ml-1 font-semibold block sm:inline">
                    (Perubahan belum disimpan)
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeletedPageIds([])}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[11px] transition cursor-pointer self-start sm:self-center shrink-0"
                >
                  Pulihkan Semua Halaman
                </button>
                <button
                  type="button"
                  disabled={isSavingPages}
                  onClick={() => setIsConfirmDeleteOpen(true)}
                  className={`px-3.5 py-1.5 text-white font-bold rounded-lg text-[11px] transition cursor-pointer self-start sm:self-center shrink-0 flex items-center gap-1.5 ${
                    savePagesSuccess 
                      ? 'bg-emerald-600 hover:bg-emerald-700' 
                      : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50'
                  }`}
                >
                  {isSavingPages ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : savePagesSuccess ? (
                    <>
                      <CheckCircle size={12} />
                      <span>Tersimpan!</span>
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      <span>Simpan Konfigurasi</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })()}
        </div>
      )}

      {/* Confirm Delete Pages Modal */}
      {isConfirmDeleteOpen && (() => {
        const filesToDelete = getFilesToBeDeletedFromDrive();
        const hasToken = !!getStoredGoogleDriveToken();

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] print:hidden">
            <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
              {/* Header */}
              <div className="p-5 border-b border-stone-100 flex items-center gap-3 bg-rose-50 text-rose-900">
                <div className="p-2 bg-rose-100 rounded-xl text-rose-700 shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-black text-stone-900 text-sm leading-tight">Peringatan Penghapusan Permanen</h3>
                  <p className="text-[10px] text-rose-700 font-mono">Tindakan ini tidak dapat dibatalkan</p>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4 font-sans text-sm">
                <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-4 text-xs text-rose-950 leading-relaxed space-y-2">
                  <p className="font-semibold text-rose-900">
                    Apakah Anda yakin ingin menyimpan perubahan konfigurasi halaman ini?
                  </p>
                  <p>
                    Halaman yang sudah Anda hapus (jumlah: <strong>{deletedPageIds.length}</strong>) akan disembunyikan secara <strong>permanen</strong> dari tampilan cetak dokumen dan tidak akan pernah bisa dipulihkan kembali seperti semula.
                  </p>
                </div>

                {filesToDelete.length > 0 && (
                  <div className="space-y-2 bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs">
                    <p className="font-bold text-stone-700 uppercase tracking-wide text-[9px] font-mono">
                      Sinkronisasi Google Drive:
                    </p>
                    <p className="text-stone-600">
                      Karena seluruh halaman dari berkas berikut telah Anda hapus, sistem juga akan menghapus berkas asli ini dari folder Google Drive Anda agar data tetap sinkron:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 font-mono text-[10px] text-amber-800">
                      {filesToDelete.map((f, idx) => (
                        <li key={idx} className="truncate max-w-full">
                          {f.name}
                        </li>
                      ))}
                    </ul>
                    {!hasToken && (
                      <p className="text-[9px] text-amber-600 font-medium italic mt-1.5">
                        * Catatan: Penghapusan berkas di Google Drive memerlukan koneksi otorisasi Google Drive Anda yang aktif.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsConfirmDeleteOpen(false)}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveDeletedPages}
                  disabled={isSavingPages}
                  className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isSavingPages ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Trash size={13} />
                      <span>Ya, Hapus Permanen</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Share Modal Dialog Box */}
      {isShareModalOpen && (() => {
        const shareUrl = `${window.location.origin}${window.location.pathname}#/shared-view?id=${submission.id}`;
        const waText = `Halo, berikut adalah bukti dokumen pengeluaran kas/bank yang sudah tersinkronisasi sebagai 1 kesatuan:\n\n` +
          `*Nomor Voucher:* ${submission.kode}\n` +
          `*Dibayarkan Kepada:* ${submission.dibayarkanKepada}\n` +
          `*Tanggal:* ${formatDateIndonesian(submission.tanggal)}\n` +
          `*Kategori:* ${submission.jenisPengajuan || '-'}\n` +
          `*Total Nominal:* Rp ${grandTotal.toLocaleString('id-ID')}\n\n` +
          `Silakan klik tautan di bawah ini untuk melihat detail lengkap transaksi beserta seluruh lampiran asli yang sudah di-upload:\n` +
          `${shareUrl}`;
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] print:hidden">
            <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
              {/* Header */}
              <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                    <Share2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-sans font-black text-stone-900 text-sm">Bagikan Dokumen Transaksi</h3>
                    <p className="text-[11px] text-stone-500 font-mono">Kode Voucher: {submission.kode}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition font-mono font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-5 font-sans">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 leading-relaxed flex gap-2.5">
                  <CheckCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    Sistem secara otomatis mengunggah dokumen dengan izin <strong>"Akses Publik" (Anyone with link can view)</strong> di Google Drive Anda. Siapapun yang memiliki tautan di bawah ini dapat mengakses visualisasi voucher, rincian pengeluaran, dan lampiran aslinya sekaligus sebagai 1 kesatuan!
                  </p>
                </div>

                {/* Shareable Link Input */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                    Link Publik Transaksi (Satu Kesatuan):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 bg-stone-50 border border-stone-250 rounded-xl px-3.5 py-2.5 text-xs font-mono text-stone-800 select-all focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      }}
                      className={`px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                        isCopied 
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                          : 'bg-stone-900 hover:bg-stone-850 text-white'
                      }`}
                    >
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                      {isCopied ? 'Tersalin' : 'Salin Link'}
                    </button>
                  </div>
                </div>

                {/* Individual Attachment Links */}
                {attachmentFiles.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                      Daftar Link Berkas Google Drive Langsung:
                    </label>
                    <div className="max-h-[120px] overflow-y-auto border border-stone-200 rounded-xl p-2 bg-stone-50/50 space-y-2 divide-y divide-stone-100">
                      {attachmentFiles.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs pt-1.5 first:pt-0">
                          <span className="font-mono text-[11px] text-stone-600 truncate max-w-[280px]">
                            {idx + 1}. {f.name}
                          </span>
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-amber-700 hover:underline hover:text-amber-900 font-bold text-[11px]"
                          >
                            Buka Berkas asli ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* WhatsApp Button */}
                <div className="pt-2">
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold py-3 px-4 rounded-xl transition text-sm cursor-pointer shadow-sm text-center"
                  >
                    <Send size={16} />
                    Kirim via WhatsApp
                  </a>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-stone-50 border-t border-stone-100 flex justify-end">
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DOCUMENT PAGE HOLDER */}
      <div className="flex flex-col items-center space-y-8 print:space-y-0 print:bg-white">
          {/* ================= PAGE 1: BUKTI PENGELUARAN KAS / BANK ================= */}
        {/* ================= PAGE 1: BUKTI PENGELUARAN KAS / BANK (STANDARD 100% LAYOUT) ================= */}
        {printLayoutMode === 'standard' && (activeTab === 'both' || activeTab === 'pengajuan') && (
          <PageScaleWrapper isLandscape={false} isLastPage={1 === totalPagesCount}>
            <div className="w-[210mm] min-h-[297mm] bg-white p-[15mm] border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none print:!p-0 print:!m-0 page-break">
              
              {/* Header Block Left (Logo) & Right (Code & Tanggal) */}
              <div className="flex justify-between items-start mb-6">
                <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />

                <div className="flex flex-col items-end pt-2">
                  <div className="border border-black px-8 py-1.5 font-bold text-base text-black bg-stone-50 mb-2 min-w-[120px] text-center font-mono">
                    {submission.kode}
                  </div>
                  <div className="text-xs text-black font-semibold">
                    Tanggal : <span className="font-normal">{formatDateIndonesian(submission.tanggal)}</span>
                  </div>
                </div>
              </div>

            {/* Document Title Block */}
            <div className="border-[2px] border-black bg-white py-2.5 text-center mb-6">
              <h1 className="text-sm font-bold text-black font-sans uppercase tracking-[1.5px]">
                BUKTI PENGELUARAN KAS / BANK
              </h1>
            </div>

            {/* Metadata Fields Area */}
            <div className="text-sm font-sans space-y-2 mb-6 px-1">
              <div className="grid grid-cols-[140px_10px_1fr] gap-y-3">
                <span className="font-semibold text-black">Dibayarkan Kepada</span>
                <span className="text-black">:</span>
                <span className="text-black font-bold">{submission.dibayarkanKepada}</span>

                {submission.isPettyCash && (
                  <>
                    <span className="font-semibold text-black">Pemegang Petty Cash</span>
                    <span className="text-black">:</span>
                    <span className="text-black font-bold text-violet-800">{submission.pettyCashCustodian}</span>
                  </>
                )}

                <span className="font-semibold text-black">Jenis Pengajuan</span>
                <span className="text-black">:</span>
                <span className="text-black">{submission.jenisPengajuan}</span>

                <span className="font-semibold text-black">Kode</span>
                <span className="text-black">:</span>
                <span className="text-black font-mono">{submission.kode}</span>

                <span className="font-semibold text-black">Dibayarkan dengan</span>
                <span className="text-black">:</span>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-5 border border-black flex items-center justify-center font-bold text-black bg-stone-50 font-mono">
                      {submission.dibayarkanDengan === 'Tunai' ? 'X' : ''}
                    </div>
                    <span>Tunai</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-8 h-5 border border-black flex items-center justify-center font-bold text-black bg-stone-50 font-mono">
                      {submission.dibayarkanDengan === 'Cek/Transfer' ? 'X' : ''}
                    </div>
                    <span>Cek / Transfer</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Table Voucher */}
            <div className="mb-6">
              <table className="w-full border-collapse border-[1.5px] border-black text-sm">
                <thead>
                  <tr className="bg-white border-b-[1.5px] border-black text-black font-bold uppercase text-xs">
                    <th className="border-r border-black py-2.5 px-4 text-left">JENIS PENGAJUAN</th>
                    <th className="py-2.5 px-4 text-right w-64">JUMLAH</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.items.map((item) => (
                    <tr key={item.id} className="border-b border-black text-black min-h-[70px]">
                      <td className="border-r border-black py-5 px-4 leading-relaxed font-semibold">
                        {item.item}
                      </td>
                      <td className="py-5 px-4 text-right font-mono font-bold text-base">
                        Rp <span className="float-right">{formatRupiah(item.total)}</span>
                      </td>
                    </tr>
                  ))}
                  
                  <tr className="border-t-[1.5px] border-black font-bold text-black">
                    <td className="border-r border-black py-2 px-4 bg-stone-50"></td>
                    <td className="py-2.5 px-4 text-right font-mono text-base font-bold bg-[#fcfcfc]">
                      Rp <span className="float-right">{formatRupiah(grandTotal)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Terbilang block */}
            <div className="border border-black p-3.5 mb-8 bg-stone-50/30 text-sm flex gap-2">
              <span className="font-bold text-black">Terbilang :</span>
              <span className="text-black italic font-medium">
                "{numberToTerbilang(grandTotal)}"
              </span>
            </div>

            {/* 3 Signers Row */}
            <div className="flex justify-between text-sm text-black mt-12 px-6">
              <div className="flex flex-col items-center w-52 text-center">
                <span className="font-sans font-medium uppercase text-xs mb-16">Diajukan</span>
                <span className="border-b border-black pb-0.5 px-3 font-bold tracking-wide uppercase text-xs truncate max-w-full">
                  {submission.diajukanOleh || 'Andi Dhiya Salsabila'}
                </span>
                <span className="text-xs text-stone-600 font-mono mt-1 uppercase">
                  {submission.diajukanJabatan || 'Keuangan'}
                </span>
              </div>

              <div className="flex flex-col items-center w-52 text-center">
                <span className="font-sans font-medium uppercase text-xs mb-16">Diverifikasi</span>
                <span className="border-b border-black pb-0.5 px-3 font-bold tracking-wide uppercase text-xs truncate max-w-full">
                  {f1Verifier === 'nursyam'
                    ? 'Andi Nursyam Halid'
                    : ((submission.diverifikasiOleh && submission.diverifikasiOleh !== 'Andi Dhiya Salsabila') ? submission.diverifikasiOleh : 'Andi Muhammad Rifki')}
                </span>
                <span className="text-xs text-stone-600 font-mono mt-1 uppercase">
                  {f1Verifier === 'nursyam'
                    ? 'Direktur Utama'
                    : ((submission.diverifikasiJabatan && submission.diverifikasiJabatan !== 'Keuangan') ? submission.diverifikasiJabatan : 'Direktur')}
                </span>
              </div>

              <div className="flex flex-col items-center w-52 text-center">
                <span className="font-sans font-medium uppercase text-xs mb-16">Disetujui</span>
                <span className="border-b border-black pb-0.5 px-3 font-bold tracking-wide uppercase text-xs truncate max-w-full">
                  {(submission.disetujuiOleh2 && !submission.disetujuiOleh2.toLowerCase().includes('nursyam')) ? submission.disetujuiOleh2 : 'Harijon'}
                </span>
                <span className="text-xs text-stone-600 font-mono mt-1 uppercase">
                  {(submission.disetujuiOleh2 && !submission.disetujuiOleh2.toLowerCase().includes('nursyam')) ? (submission.disetujuiJabatan2 || 'Direktur Keuangan') : 'Direktur Keuangan'}
                </span>
              </div>
            </div>

            {/* Notes Section */}
            <div className="mt-8">
              <span className="block text-xs font-bold text-black tracking-wide uppercase mb-1">
                NOTE :
              </span>
              <div className="border-[1.5px] border-black p-4 min-h-[70px] rounded-xs text-sm text-stone-800 leading-relaxed font-sans bg-stone-50/30">
                {submission.notes ? submission.notes : ""}
              </div>
            </div>

            </div>
          </PageScaleWrapper>
        )}

        {/* ================= PAGE 1: BUKTI PENGELUARAN KAS / BANK (COMPACT TOP LAYOUT) ================= */}
        {printLayoutMode === 'compact_70' && (activeTab === 'both' || activeTab === 'pengajuan') && (
          <PageScaleWrapper isLandscape={false} isLastPage={1 === totalPagesCount}>
            <div className="w-[210mm] print:w-full min-h-[297mm] print:h-[297mm] bg-white p-[8mm] border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none page-break flex flex-col justify-between box-border overflow-hidden">
              
              {/* Top Half (50%): F1 Box */}
              <div className="w-full border-[1.5px] border-black p-4 bg-white text-xs sm:text-sm flex-1 flex flex-col justify-between box-border overflow-hidden">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />
                    <div className="flex flex-col items-end">
                      <div className="border border-black px-3 py-1 font-bold text-xs text-black bg-stone-50 mb-1 font-mono">
                        {submission.kode}
                      </div>
                      <div className="text-xs text-black font-semibold">
                        Tanggal : <span className="font-normal">{formatDateIndonesian(submission.tanggal)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-black bg-white py-1 text-center font-bold text-xs sm:text-sm uppercase tracking-wider mb-2">
                    BUKTI PENGELUARAN KAS / BANK
                  </div>

                  <div className="border border-black p-2 text-xs sm:text-sm grid grid-cols-[140px_10px_1fr] gap-y-1 mb-2 font-sans">
                    <span className="font-semibold text-black">Dibayarkan Kepada</span>
                    <span>:</span>
                    <span className="font-bold">{submission.dibayarkanKepada}</span>

                    {submission.isPettyCash && (
                      <>
                        <span className="font-semibold text-black">Pemegang Petty Cash</span>
                        <span>:</span>
                        <span className="font-bold text-violet-800">{submission.pettyCashCustodian}</span>
                      </>
                    )}

                    <span className="font-semibold text-black">Jenis Pengajuan</span>
                    <span>:</span>
                    <span>{submission.jenisPengajuan}</span>

                    <span className="font-semibold text-black">Kode</span>
                    <span>:</span>
                    <span className="font-mono">{submission.kode}</span>
                  </div>

                  <table className="w-full border-collapse border border-black text-xs sm:text-sm mb-2">
                    <thead>
                      <tr className="bg-stone-100 border-b border-black font-bold uppercase text-xs">
                        <th className="border-r border-black p-1.5 text-left">JENIS PENGAJUAN</th>
                        <th className="p-1.5 text-right w-44">JUMLAH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submission.items.map((item) => (
                        <tr key={item.id} className="border-b border-black">
                          <td className="border-r border-black p-1.5 font-semibold">{item.item}</td>
                          <td className="p-1.5 text-right font-mono font-bold">
                            Rp <span className="float-right">{formatRupiah(item.total)}</span>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-black font-bold text-black bg-stone-50">
                        <td className="border-r border-black p-1.5 uppercase">TOTAL</td>
                        <td className="p-1.5 text-right font-mono font-bold">
                          Rp <span className="float-right">{formatRupiah(grandTotal)}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="border border-black p-1.5 bg-stone-50/50 text-xs sm:text-sm flex gap-2 mb-2">
                    <span className="font-bold">Terbilang :</span>
                    <span className="italic font-medium">"{numberToTerbilang(grandTotal)}"</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between px-6 mt-2 mb-1 text-xs sm:text-sm text-black">
                    <div className="flex flex-col items-center text-center w-1/3">
                      <span className="font-sans font-medium mb-10 uppercase text-xs">Diajukan</span>
                      <span className="border-b border-black pb-0.5 px-2 font-bold uppercase text-xs whitespace-nowrap">
                        {submission.diajukanOleh || 'Andi Dhiya Salsabila'}
                      </span>
                      <span className="text-xs text-stone-600 font-mono mt-0.5 uppercase">
                        {submission.diajukanJabatan || 'Keuangan'}
                      </span>
                    </div>

                    <div className="flex flex-col items-center text-center w-1/3">
                      <span className="font-sans font-medium mb-10 uppercase text-xs">Diverifikasi</span>
                      <span className="border-b border-black pb-0.5 px-2 font-bold uppercase text-xs whitespace-nowrap">
                        {(submission.diverifikasiOleh && submission.diverifikasiOleh !== 'Andi Dhiya Salsabila')
                          ? submission.diverifikasiOleh
                          : (submission.disetujuiOleh2?.toLowerCase().includes('nursyam') ? 'Andi Nursyam Halid' : 'Andi Rifki Naufal')}
                      </span>
                      <span className="text-xs text-stone-600 font-mono mt-0.5 uppercase">
                        {(submission.diverifikasiOleh?.toLowerCase().includes('nursyam') || submission.disetujuiOleh2?.toLowerCase().includes('nursyam'))
                          ? 'Direktur Utama'
                          : ((submission.diverifikasiJabatan && submission.diverifikasiJabatan !== 'Keuangan') ? submission.diverifikasiJabatan : 'Direktur')}
                      </span>
                    </div>

                    <div className="flex flex-col items-center text-center w-1/3">
                      <span className="font-sans font-medium mb-10 uppercase text-xs">Disetujui</span>
                      <span className="border-b border-black pb-0.5 px-2 font-bold uppercase text-xs whitespace-nowrap">
                        {(submission.disetujuiOleh2 && !submission.disetujuiOleh2.toLowerCase().includes('nursyam')) ? submission.disetujuiOleh2 : 'Harijon'}
                      </span>
                      <span className="text-xs text-stone-600 font-mono mt-0.5 uppercase">
                        {(submission.disetujuiOleh2 && !submission.disetujuiOleh2.toLowerCase().includes('nursyam')) ? (submission.disetujuiJabatan2 || 'Direktur Keuangan') : 'Direktur Keuangan'}
                      </span>
                    </div>
                  </div>

                  {submission.notes && (
                    <div className="mt-1 text-xs">
                      <span className="font-bold uppercase text-black block mb-0.5">NOTE :</span>
                      <div className="border border-black p-1.5 text-stone-800 bg-stone-50/30 font-sans leading-tight">
                        {submission.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Center Separator Line */}
              <div className="w-full border-t-2 border-dashed border-stone-300 my-3 shrink-0 print:hidden" />

              {/* Bottom Half Empty Space Box */}
              <div className="w-full border-2 border-dashed border-stone-250 rounded-lg flex-1 flex items-center justify-center print:border-none print:bg-transparent text-center">
                <span className="text-xs text-stone-400 font-mono font-medium italic print:hidden">
                  Space Kosong 50% (Bagian Bawah Halaman A4 Biarkan Kosong)
                </span>
              </div>
            </div>
          </PageScaleWrapper>
        )}

        {/* Divider for Screen View, hidden during printing */}
        {showF2 && (printLayoutMode === 'standard' || printLayoutMode === 'compact_70') && activeTab === 'both' && (
          <div className="w-[210mm] border-t-2 border-dashed border-stone-300 py-2 print:hidden flex justify-center">
            <span className="text-xs bg-stone-100 text-stone-500 px-3 py-1 rounded-full font-semibold">BATAS HALAMAN CETAK (PAGE BREAK)</span>
          </div>
        )}

        {/* ================= PAGE 2: FORMULIR PENGAJUAN HO (STANDARD 100% LAYOUT) ================= */}
        {showF2 && printLayoutMode === 'standard' && (activeTab === 'both' || activeTab === 'pengajuan') && (
          <PageScaleWrapper isLandscape={false} isLastPage={2 === totalPagesCount}>
            <div className="w-[210mm] min-h-[297mm] bg-white p-[15mm] border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none print:!p-0 print:!m-0 page-break">
              
              {/* Header Area */}
              <div className="flex justify-between items-start mb-6">
                <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />
              </div>

            {/* Document Title Block */}
            <div className="border-[2px] border-black bg-[#D9D9D9] py-2.5 text-center mb-6">
              <h1 className="text-base font-bold text-black font-sans uppercase tracking-[1px]">
                FORMULIR PENGAJUAN DANA
              </h1>
            </div>

            {/* Metadata Fields Box */}
            <div className="border border-black p-4 mb-6 text-sm font-sans">
              <div className="grid grid-cols-[140px_10px_1fr] gap-y-2">
                <span className="font-semibold text-black">Lokasi</span>
                <span className="text-black">:</span>
                <span className="text-black">{submission.lokasi}</span>

                <span className="font-semibold text-black">Tanggal</span>
                <span className="text-black">:</span>
                <span className="text-black">{formatDateIndonesian(submission.tanggal)}</span>

                <span className="font-semibold text-black">Jenis Pengajuan</span>
                <span className="text-black">:</span>
                <span className="text-black">{submission.jenisPengajuan}</span>

                <span className="font-semibold text-black">Kode</span>
                <span className="text-black">:</span>
                <span className="text-black font-mono">{submission.kode}</span>
              </div>
            </div>

            {/* Main Items Table */}
            <div className="mb-6">
              <table className="w-full border-collapse border-[1.5px] border-black text-sm table-fixed">
                <thead>
                  <tr className="bg-[#D9D9D9]/30 border-b-[1.5px] border-black text-black font-bold uppercase text-xs">
                    <th className="border-r border-black py-2.5 px-1 text-center w-[5%]">NO</th>
                    <th className="border-r border-black py-2.5 px-3 text-left w-[41%]">ITEM DETIL (INVOICE / DESKRIPSI)</th>
                    <th className="border-r border-black py-2.5 px-2 text-center w-[8%]">VOL</th>
                    <th className="border-r border-black py-2.5 px-3 text-center w-[24%]">TOTAL (RP)</th>
                    <th className="py-2.5 px-3 text-left w-[22%]">KETERANGAN</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-black align-top text-black">
                      <td className="border-r border-black py-3 px-1 text-center font-mono text-xs">{idx + 1}</td>
                      <td className="border-r border-black py-3 px-3 font-semibold text-xs leading-relaxed break-words whitespace-pre-wrap text-stone-900">{item.item}</td>
                      <td className="border-r border-black py-3 px-2 text-center text-xs text-stone-800">{item.jumlahVolume || '-'}</td>
                      <td className="border-r border-black py-3 px-3 text-right font-mono font-bold text-xs font-semibold">
                        {formatRupiah(item.total)}
                      </td>
                      <td className="py-3 px-3 text-stone-700 text-[10px] italic break-all break-words whitespace-pre-wrap leading-tight text-left">{item.keterangan || '-'}</td>
                    </tr>
                  ))}
                  
                  {/* Total Row */}
                  <tr className="border-t-[1.5px] border-black font-bold text-black bg-stone-50">
                    <td colSpan={3} className="border-r border-black py-3 px-4 text-center uppercase tracking-wider text-xs">
                       TOTAL PENYERAHAN
                    </td>
                    <td className="border-r border-black py-3 px-3 text-right font-mono text-sm font-bold bg-amber-50/10">
                      {formatRupiah(grandTotal)}
                    </td>
                    <td className="py-3 px-3 bg-stone-50"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signatures Row */}
            {f2ApprovedBy === 'none' ? (
              <div className="flex justify-center text-sm text-black mb-8 mt-12">
                <div className="flex flex-col items-center w-60 text-center">
                  <span className="font-sans font-medium mb-16">Dibuat Oleh</span>
                  <span className="border-b border-black pb-0.5 px-4 font-bold tracking-wide">
                    {submission.dibuatOleh || 'Nur Wahyudi'}
                  </span>
                  <span className="text-xs text-stone-600 font-mono mt-1">Staff Keuangan</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between text-sm text-black px-10 mb-8 mt-12">
                <div className="flex flex-col items-center w-60 text-center">
                  <span className="font-sans font-medium mb-16">Dibuat Oleh</span>
                  <span className="border-b border-black pb-0.5 px-4 font-bold tracking-wide">
                    {submission.dibuatOleh || 'Nur Wahyudi'}
                  </span>
                  <span className="text-xs text-stone-600 font-mono mt-1">Staff Keuangan</span>
                </div>
                
                <div className="flex flex-col items-center w-60 text-center">
                  <span className="font-sans font-medium mb-16">Diajukan</span>
                  <span className="border-b border-black pb-0.5 px-4 font-bold tracking-wide">
                    {submission.diajukanOleh || 'Andi Dhiya Salsabila'}
                  </span>
                  <span className="text-xs text-stone-600 font-mono mt-1">
                    {submission.diajukanJabatan || 'Keuangan'}
                  </span>
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div className="mt-8">
              <span className="block text-xs font-bold text-black tracking-wide uppercase mb-1">
                NOTE :
              </span>
              <div className="border-[1.5px] border-black p-4 min-h-[70px] rounded-xs text-sm text-stone-800 leading-relaxed font-sans bg-stone-50/30">
                {submission.notes ? submission.notes : ""}
              </div>
            </div>

            </div>
          </PageScaleWrapper>
        )}

        {/* ================= PAGE 2: FORMULIR PENGAJUAN HO (COMPACT TOP LAYOUT) ================= */}
        {showF2 && printLayoutMode === 'compact_70' && (activeTab === 'both' || activeTab === 'pengajuan') && (
          <PageScaleWrapper isLandscape={false} isLastPage={2 === totalPagesCount}>
            <div className="w-[210mm] print:w-full min-h-[297mm] print:h-[297mm] bg-white p-[8mm] border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none page-break flex flex-col justify-between box-border overflow-hidden">
              
              {/* Top Half (50%): F2 Box */}
              <div className="w-full border-[1.5px] border-black p-4 bg-white text-xs sm:text-sm flex-1 flex flex-col justify-between box-border overflow-hidden">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />
                    <div className="flex flex-col items-end">
                      <div className="border border-black px-3 py-1 font-bold text-xs text-black bg-stone-50 mb-1 font-mono">
                        {submission.kode}
                      </div>
                      <div className="text-xs text-black font-semibold">
                        Tanggal : <span className="font-normal">{formatDateIndonesian(submission.tanggal)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-black bg-[#D9D9D9] py-1 text-center font-bold text-xs sm:text-sm uppercase tracking-wider mb-2">
                    FORMULIR PENGAJUAN DANA
                  </div>

                  <div className="border border-black p-2 text-xs sm:text-sm grid grid-cols-[140px_10px_1fr] gap-y-1 mb-2 font-sans">
                    <span className="font-semibold text-black">Lokasi</span>
                    <span>:</span>
                    <span>{submission.lokasi}</span>

                    <span className="font-semibold text-black">Tanggal</span>
                    <span>:</span>
                    <span>{formatDateIndonesian(submission.tanggal)}</span>

                    <span className="font-semibold text-black">Jenis Pengajuan</span>
                    <span>:</span>
                    <span>{submission.jenisPengajuan}</span>

                    <span className="font-semibold text-black">Kode</span>
                    <span>:</span>
                    <span className="font-mono">{submission.kode}</span>
                  </div>

                  <table className="w-full border-collapse border border-black text-xs sm:text-sm mb-2 table-fixed">
                    <thead>
                      <tr className="bg-[#D9D9D9]/30 border-b border-black font-bold uppercase text-xs">
                        <th className="border-r border-black p-1.5 text-center w-[5%]">NO</th>
                        <th className="border-r border-black p-1.5 text-left w-[41%]">ITEM DETIL</th>
                        <th className="border-r border-black p-1.5 text-center w-[8%]">VOL</th>
                        <th className="border-r border-black p-1.5 text-center w-[24%]">TOTAL (RP)</th>
                        <th className="p-1.5 text-left w-[22%]">KET</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submission.items.map((item, idx) => (
                        <tr key={item.id} className="border-b border-black align-top">
                          <td className="border-r border-black p-1.5 text-center font-mono">{idx + 1}</td>
                          <td className="border-r border-black p-1.5 font-semibold leading-tight">{item.item}</td>
                          <td className="border-r border-black p-1.5 text-center">{item.jumlahVolume || '-'}</td>
                          <td className="border-r border-black p-1.5 text-right font-mono font-bold">
                            {formatRupiah(item.total)}
                          </td>
                          <td className="p-1.5 text-xs italic">{item.keterangan || '-'}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-black font-bold bg-stone-50">
                        <td colSpan={3} className="border-r border-black p-1.5 text-center uppercase">TOTAL PENYERAHAN</td>
                        <td className="border-r border-black p-1.5 text-right font-mono font-bold">{formatRupiah(grandTotal)}</td>
                        <td className="p-1.5"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  {f2ApprovedBy === 'none' ? (
                    <div className="flex justify-center mt-2 mb-1 text-xs sm:text-sm">
                      <div className="flex flex-col items-center text-center">
                        <span className="mb-10 font-medium uppercase text-xs">Dibuat Oleh</span>
                        <span className="border-b border-black pb-0.5 px-3 font-bold">{submission.dibuatOleh || 'Nur Wahyudi'}</span>
                        <span className="text-xs text-stone-600 font-mono mt-0.5">Staff Keuangan</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between px-10 mt-2 mb-1 text-xs sm:text-sm">
                      <div className="flex flex-col items-center text-center">
                        <span className="mb-10 font-medium uppercase text-xs">Dibuat Oleh</span>
                        <span className="border-b border-black pb-0.5 px-3 font-bold">{submission.dibuatOleh || 'Nur Wahyudi'}</span>
                        <span className="text-xs text-stone-600 font-mono mt-0.5">Staff Keuangan</span>
                      </div>

                      <div className="flex flex-col items-center text-center">
                        <span className="mb-10 font-medium uppercase text-xs">Diajukan</span>
                        <span className="border-b border-black pb-0.5 px-3 font-bold">
                          {submission.diajukanOleh || 'Andi Dhiya Salsabila'}
                        </span>
                        <span className="text-xs text-stone-600 font-mono mt-0.5">
                          {submission.diajukanJabatan || 'Keuangan'}
                        </span>
                      </div>
                    </div>
                  )}

                  {submission.notes && (
                    <div className="mt-1 text-xs">
                      <span className="font-bold block uppercase text-black mb-0.5">NOTE :</span>
                      <div className="border border-black p-1.5 text-stone-800 bg-stone-50/30 font-sans leading-tight">
                        {submission.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Center Separator Line */}
              <div className="w-full border-t-2 border-dashed border-stone-300 my-3 shrink-0 print:hidden" />

              {/* Bottom Half Empty Space Box */}
              <div className="w-full border-2 border-dashed border-stone-250 rounded-lg flex-1 flex items-center justify-center print:border-none print:bg-transparent text-center">
                <span className="text-xs text-stone-400 font-mono font-medium italic print:hidden">
                  Space Kosong 50% (Bagian Bawah Halaman A4 Biarkan Kosong)
                </span>
              </div>
            </div>
          </PageScaleWrapper>
        )}

        {/* ================= ECO 1-PAGE COMBINED LAYOUT (50% F1 / 50% F2) ================= */}
        {printLayoutMode === 'eco_1page' && (activeTab === 'both' || activeTab === 'pengajuan') && (
          <PageScaleWrapper isLandscape={false} isLastPage={1 === totalPagesCount}>
            <div className="w-[210mm] print:w-full min-h-[297mm] print:h-[297mm] bg-white p-[8mm] border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none page-break flex flex-col justify-between box-border overflow-hidden">
              
              {/* Top Half (50%): F1 (BUKTI PENGELUARAN KAS / BANK) */}
              <div className="w-full border-[1.5px] border-black p-4 bg-white text-xs sm:text-sm flex-1 flex flex-col justify-between box-border overflow-hidden">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />
                    <div className="flex flex-col items-end">
                      <div className="border border-black px-3 py-1 font-bold text-xs text-black bg-stone-50 mb-1 font-mono">
                        {submission.kode}
                      </div>
                      <div className="text-xs text-black font-semibold">
                        Tanggal : <span className="font-normal">{formatDateIndonesian(submission.tanggal)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border border-black bg-white py-1 text-center font-bold text-xs sm:text-sm uppercase tracking-wider mb-2">
                    BUKTI PENGELUARAN KAS / BANK
                  </div>

                  <div className="border border-black p-2 text-xs sm:text-sm grid grid-cols-[140px_10px_1fr] gap-y-1 mb-2 font-sans">
                    <span className="font-semibold text-black">Dibayarkan Kepada</span>
                    <span>:</span>
                    <span className="font-bold">{submission.dibayarkanKepada}</span>

                    {submission.isPettyCash && (
                      <>
                        <span className="font-semibold text-black">Pemegang Petty Cash</span>
                        <span>:</span>
                        <span className="font-bold text-violet-800">{submission.pettyCashCustodian}</span>
                      </>
                    )}

                    <span className="font-semibold text-black">Jenis Pengajuan</span>
                    <span>:</span>
                    <span>{submission.jenisPengajuan}</span>

                    <span className="font-semibold text-black">Kode</span>
                    <span>:</span>
                    <span className="font-mono">{submission.kode}</span>
                  </div>

                  <table className="w-full border-collapse border border-black text-xs sm:text-sm mb-2">
                    <thead>
                      <tr className="bg-stone-100 border-b border-black font-bold uppercase text-xs">
                        <th className="border-r border-black p-1.5 text-left">JENIS PENGAJUAN</th>
                        <th className="p-1.5 text-right w-44">JUMLAH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submission.items.map((item) => (
                        <tr key={item.id} className="border-b border-black">
                          <td className="border-r border-black p-1.5 font-semibold">{item.item}</td>
                          <td className="p-1.5 text-right font-mono font-bold">
                            Rp <span className="float-right">{formatRupiah(item.total)}</span>
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-black font-bold text-black bg-stone-50">
                        <td className="border-r border-black p-1.5 uppercase">TOTAL</td>
                        <td className="p-1.5 text-right font-mono font-bold">
                          Rp <span className="float-right">{formatRupiah(grandTotal)}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="border border-black p-1.5 bg-stone-50/50 text-xs sm:text-sm flex gap-2 mb-2">
                    <span className="font-bold">Terbilang :</span>
                    <span className="italic font-medium">"{numberToTerbilang(grandTotal)}"</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between px-6 mt-2 mb-1 text-xs sm:text-sm text-black">
                    <div className="flex flex-col items-center text-center w-1/3">
                      <span className="font-sans font-medium mb-10 uppercase text-xs">Diajukan</span>
                      <span className="border-b border-black pb-0.5 px-2 font-bold uppercase text-xs whitespace-nowrap">
                        {submission.diajukanOleh || 'Andi Dhiya Salsabila'}
                      </span>
                      <span className="text-xs text-stone-600 font-mono mt-0.5 uppercase">
                        {submission.diajukanJabatan || 'Keuangan'}
                      </span>
                    </div>

                    <div className="flex flex-col items-center text-center w-1/3">
                      <span className="font-sans font-medium mb-10 uppercase text-xs">Diverifikasi</span>
                      <span className="border-b border-black pb-0.5 px-2 font-bold uppercase text-xs whitespace-nowrap">
                        {(submission.diverifikasiOleh && submission.diverifikasiOleh !== 'Andi Dhiya Salsabila')
                          ? submission.diverifikasiOleh
                          : (submission.disetujuiOleh2?.toLowerCase().includes('nursyam') ? 'Andi Nursyam Halid' : 'Andi Rifki Naufal')}
                      </span>
                      <span className="text-xs text-stone-600 font-mono mt-0.5 uppercase">
                        {(submission.diverifikasiOleh?.toLowerCase().includes('nursyam') || submission.disetujuiOleh2?.toLowerCase().includes('nursyam'))
                          ? 'Direktur Utama'
                          : ((submission.diverifikasiJabatan && submission.diverifikasiJabatan !== 'Keuangan') ? submission.diverifikasiJabatan : 'Direktur')}
                      </span>
                    </div>

                    <div className="flex flex-col items-center text-center w-1/3">
                      <span className="font-sans font-medium mb-10 uppercase text-xs">Disetujui</span>
                      <span className="border-b border-black pb-0.5 px-2 font-bold uppercase text-xs whitespace-nowrap">
                        {(submission.disetujuiOleh2 && !submission.disetujuiOleh2.toLowerCase().includes('nursyam')) ? submission.disetujuiOleh2 : 'Harijon'}
                      </span>
                      <span className="text-xs text-stone-600 font-mono mt-0.5 uppercase">
                        {(submission.disetujuiOleh2 && !submission.disetujuiOleh2.toLowerCase().includes('nursyam')) ? (submission.disetujuiJabatan2 || 'Direktur Keuangan') : 'Direktur Keuangan'}
                      </span>
                    </div>
                  </div>

                  {submission.notes && (
                    <div className="mt-1 text-xs">
                      <span className="font-bold uppercase text-black block mb-0.5">NOTE :</span>
                      <div className="border border-black p-1.5 text-stone-800 bg-stone-50/30 font-sans leading-tight">
                        {submission.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Center Divider Line (Exact Middle between F1 and F2, no text) */}
              <div className="w-full border-t-2 border-dashed border-stone-400 my-3 shrink-0" />

              {/* Bottom Half (50%): F2 (FORMULIR PENGAJUAN DANA) or Space Kosong */}
              {showF2 ? (
                <div className="w-full border-[1.5px] border-black p-4 bg-white text-xs sm:text-sm flex-1 flex flex-col justify-between box-border overflow-hidden">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />
                      <div className="flex flex-col items-end">
                        <div className="border border-black px-3 py-1 font-bold text-xs text-black bg-stone-50 mb-1 font-mono">
                          {submission.kode}
                        </div>
                        <div className="text-xs text-black font-semibold">
                          Tanggal : <span className="font-normal">{formatDateIndonesian(submission.tanggal)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="border border-black bg-[#D9D9D9] py-1 text-center font-bold text-xs sm:text-sm uppercase tracking-wider mb-2">
                      FORMULIR PENGAJUAN DANA
                    </div>

                    <div className="border border-black p-2 text-xs sm:text-sm grid grid-cols-[140px_10px_1fr] gap-y-1 mb-2 font-sans">
                      <span className="font-semibold text-black">Lokasi</span>
                      <span>:</span>
                      <span>{submission.lokasi}</span>

                      <span className="font-semibold text-black">Tanggal</span>
                      <span>:</span>
                      <span>{formatDateIndonesian(submission.tanggal)}</span>

                      <span className="font-semibold text-black">Jenis Pengajuan</span>
                      <span>:</span>
                      <span>{submission.jenisPengajuan}</span>

                      <span className="font-semibold text-black">Kode</span>
                      <span>:</span>
                      <span className="font-mono">{submission.kode}</span>
                    </div>

                    <table className="w-full border-collapse border border-black text-xs sm:text-sm mb-2 table-fixed">
                      <thead>
                        <tr className="bg-[#D9D9D9]/30 border-b border-black font-bold uppercase text-xs">
                          <th className="border-r border-black p-1.5 text-center w-[5%]">NO</th>
                          <th className="border-r border-black p-1.5 text-left w-[41%]">ITEM DETIL</th>
                          <th className="border-r border-black p-1.5 text-center w-[8%]">VOL</th>
                          <th className="border-r border-black p-1.5 text-center w-[24%]">TOTAL (RP)</th>
                          <th className="p-1.5 text-left w-[22%]">KET</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submission.items.map((item, idx) => (
                          <tr key={item.id} className="border-b border-black align-top">
                            <td className="border-r border-black p-1.5 text-center font-mono">{idx + 1}</td>
                            <td className="border-r border-black p-1.5 font-semibold leading-tight">{item.item}</td>
                            <td className="border-r border-black p-1.5 text-center">{item.jumlahVolume || '-'}</td>
                            <td className="border-r border-black p-1.5 text-right font-mono font-bold">
                              {formatRupiah(item.total)}
                            </td>
                            <td className="p-1.5 text-xs italic">{item.keterangan || '-'}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-black font-bold bg-stone-50">
                          <td colSpan={3} className="border-r border-black p-1.5 text-center uppercase">TOTAL PENYERAHAN</td>
                          <td className="border-r border-black p-1.5 text-right font-mono font-bold">{formatRupiah(grandTotal)}</td>
                          <td className="p-1.5"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    {f2ApprovedBy === 'none' ? (
                      <div className="flex justify-center mt-2 mb-1 text-xs sm:text-sm">
                        <div className="flex flex-col items-center text-center">
                          <span className="mb-10 font-medium uppercase text-xs">Dibuat Oleh</span>
                          <span className="border-b border-black pb-0.5 px-3 font-bold">{submission.dibuatOleh || 'Nur Wahyudi'}</span>
                          <span className="text-xs text-stone-600 font-mono mt-0.5">Staff Keuangan</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between px-10 mt-2 mb-1 text-xs sm:text-sm">
                        <div className="flex flex-col items-center text-center">
                          <span className="mb-10 font-medium uppercase text-xs">Dibuat Oleh</span>
                          <span className="border-b border-black pb-0.5 px-3 font-bold">{submission.dibuatOleh || 'Nur Wahyudi'}</span>
                          <span className="text-xs text-stone-600 font-mono mt-0.5">Staff Keuangan</span>
                        </div>

                        <div className="flex flex-col items-center text-center">
                          <span className="mb-10 font-medium uppercase text-xs">Diajukan</span>
                          <span className="border-b border-black pb-0.5 px-3 font-bold">
                            {submission.diajukanOleh || 'Andi Dhiya Salsabila'}
                          </span>
                          <span className="text-xs text-stone-600 font-mono mt-0.5">
                            {submission.diajukanJabatan || 'Keuangan'}
                          </span>
                        </div>
                      </div>
                    )}

                    {submission.notes && (
                      <div className="mt-1 text-xs">
                        <span className="font-bold block uppercase text-black mb-0.5">NOTE :</span>
                        <div className="border border-black p-1.5 text-stone-800 bg-stone-50/30 font-sans leading-tight">
                          {submission.notes}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full border-2 border-dashed border-stone-250 rounded-lg flex-1 flex items-center justify-center print:border-none print:bg-transparent text-center">
                  <span className="text-xs text-stone-400 font-mono font-medium italic print:hidden">
                    Space Kosong 50% (Bagian Bawah Halaman A4 Biarkan Kosong)
                  </span>
                </div>
              )}
            </div>
          </PageScaleWrapper>
        )}

        {/* ================= PAGE: SLIP GAJI KARYAWAN ================= */}
        {(activeTab === 'both' || activeTab === 'slip_gaji') && ((submission.jenisPengajuan || '').toLowerCase().includes('gaji') || !!submission.salaryDetails) && (() => {
          const sd = submission.salaryDetails || {};
          const namaKaryawan = sd.namaKaryawan || submission.dibayarkanKepada;
          const nikJabatan = sd.nikJabatan || 'Staff / Karyawan';
          const periodeBulan = sd.periodeBulan || 'Bulan Berjalan';
          
          const gajiPokok = sd.gajiPokok !== undefined ? sd.gajiPokok : grandTotal;
          const tunjJabatan = sd.tunjanganJabatan || 0;
          const tunjOps = sd.tunjanganOperasional || 0;
          const makanTrans = sd.uangMakanTransport || 0;
          const bonus = sd.bonusInsentif || 0;
          
          const potBpjs = sd.potonganBpjs || 0;
          const potPajak = sd.potonganPajak || 0;
          const potLain = sd.potonganLain || 0;
          const ketPot = sd.keteranganPotongan || '';

          const totalPenerimaan = gajiPokok + tunjJabatan + tunjOps + makanTrans + bonus;
          const totalPotongan = potBpjs + potPajak + potLain;
          const gajiBersih = sd.totalGajiBersih !== undefined ? sd.totalGajiBersih : (totalPenerimaan - totalPotongan);

          return (
            <>
              {activeTab === 'both' && (
                <div className="w-[210mm] border-t-2 border-dashed border-amber-300 py-2 print:hidden flex justify-center">
                  <span className="text-xs bg-amber-50 text-amber-800 px-3 py-1 rounded-full font-bold">SLIP GAJI KARYAWAN</span>
                </div>
              )}
              <PageScaleWrapper isLandscape={false} isLastPage={true}>
                <div className="w-[210mm] min-h-[297mm] bg-white p-[15mm] border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none print:!p-0 print:!m-0 page-break">
                  
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6 border-b border-black pb-4">
                    <NusantaraLogo size="md" className="items-start text-left" companyName={userProfile?.companyName} />
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-stone-700">REF / VOUCHER: {submission.kode}</div>
                      <div className="text-xs text-stone-600 mt-1">TANGGAL: {formatDateIndonesian(submission.tanggal)}</div>
                    </div>
                  </div>

                  {/* Title Banner */}
                  <div className="border-[2px] border-black bg-stone-100 py-2.5 text-center mb-6">
                    <h1 className="text-base font-bold text-black uppercase tracking-wider font-sans">
                      SLIP GAJI KARYAWAN
                    </h1>
                  </div>

                  {/* Details Grid */}
                  <div className="border border-black p-4 mb-6 bg-stone-50/50 text-xs font-sans">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                      <div className="grid grid-cols-[110px_10px_1fr]">
                        <span className="font-semibold text-stone-700">Nama Karyawan</span>
                        <span>:</span>
                        <span className="font-bold text-black">{namaKaryawan}</span>
                      </div>
                      <div className="grid grid-cols-[110px_10px_1fr]">
                        <span className="font-semibold text-stone-700">NIK / Jabatan</span>
                        <span>:</span>
                        <span className="font-bold text-stone-900">{nikJabatan}</span>
                      </div>
                      <div className="grid grid-cols-[110px_10px_1fr]">
                        <span className="font-semibold text-stone-700">Periode Gaji</span>
                        <span>:</span>
                        <span className="font-medium text-stone-900">{periodeBulan}</span>
                      </div>
                      <div className="grid grid-cols-[110px_10px_1fr]">
                        <span className="font-semibold text-stone-700">Metode Bayar</span>
                        <span>:</span>
                        <span className="font-bold text-emerald-800">{submission.dibayarkanDengan} ({submission.status || 'Lunas'})</span>
                      </div>
                    </div>
                  </div>

                  {/* Tables for Penerimaan & Potongan */}
                  <div className={totalPotongan > 0 ? "grid grid-cols-2 gap-4 mb-6" : "mb-6"}>
                    {/* Penerimaan */}
                    <div className="border border-black">
                      <div className="bg-stone-200 border-b border-black py-2 px-3 font-bold text-xs uppercase text-center text-black">
                        PENERIMAAN ( + )
                      </div>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-stone-200">
                          <tr>
                            <td className="py-2 px-3 text-stone-700">Gaji Pokok</td>
                            <td className="py-2 px-3 text-right font-mono font-semibold">Rp {formatRupiah(gajiPokok)}</td>
                          </tr>
                          {tunjJabatan > 0 && (
                            <tr>
                              <td className="py-2 px-3 text-stone-700">Tunjangan Jabatan</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold">Rp {formatRupiah(tunjJabatan)}</td>
                            </tr>
                          )}
                          {tunjOps > 0 && (
                            <tr>
                              <td className="py-2 px-3 text-stone-700">Tunjangan Operasional</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold">Rp {formatRupiah(tunjOps)}</td>
                            </tr>
                          )}
                          {makanTrans > 0 && (
                            <tr>
                              <td className="py-2 px-3 text-stone-700">Uang Makan & Transport</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold">Rp {formatRupiah(makanTrans)}</td>
                            </tr>
                          )}
                          {bonus > 0 && (
                            <tr>
                              <td className="py-2 px-3 text-stone-700">Bonus / Insentif</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold">Rp {formatRupiah(bonus)}</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-stone-100 font-bold border-t border-black">
                            <td className="py-2.5 px-3 uppercase text-[10px]">Total Penerimaan</td>
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-black">Rp {formatRupiah(totalPenerimaan)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Potongan (Only displayed if totalPotongan > 0) */}
                    {totalPotongan > 0 && (
                      <div className="border border-black">
                        <div className="bg-stone-200 border-b border-black py-2 px-3 font-bold text-xs uppercase text-center text-black">
                          POTONGAN ( - )
                        </div>
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-stone-200">
                            {potBpjs > 0 && (
                              <tr>
                                <td className="py-2 px-3 text-stone-700">BPJS Ketenagakerjaan / Kesehatan</td>
                                <td className="py-2 px-3 text-right font-mono font-semibold">Rp {formatRupiah(potBpjs)}</td>
                              </tr>
                            )}
                            {potPajak > 0 && (
                              <tr>
                                <td className="py-2 px-3 text-stone-700">Pajak Penghasilan (PPh 21)</td>
                                <td className="py-2 px-3 text-right font-mono font-semibold">Rp {formatRupiah(potPajak)}</td>
                              </tr>
                            )}
                            {potLain > 0 && (
                              <tr>
                                <td className="py-2 px-3 text-stone-700">
                                  Potongan Lain {ketPot ? `(${ketPot})` : ''}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold">Rp {formatRupiah(potLain)}</td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="bg-stone-100 font-bold border-t border-black">
                              <td className="py-2.5 px-3 uppercase text-[10px]">Total Potongan</td>
                              <td className="py-2.5 px-3 text-right font-mono text-xs text-rose-800">Rp {formatRupiah(totalPotongan)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Total Gaji Bersih Banner */}
                  <div className="border-[2px] border-black p-4 mb-8 bg-stone-50 flex justify-between items-center">
                    <div>
                      <span className="block text-xs font-bold text-stone-700 uppercase tracking-wider">TOTAL GAJI BERSIH (TAKE HOME PAY)</span>
                      <span className="text-[11px] italic text-stone-600 mt-1 block">Terbilang: "{numberToTerbilang(gajiBersih)}"</span>
                    </div>
                    <div className="text-xl font-black font-mono text-black">
                      Rp {formatRupiah(gajiBersih)}
                    </div>
                  </div>

                  {/* Signatures Row - Only Staff Keuangan as requested */}
                  <div className="flex justify-end mt-16 text-center text-xs pr-8">
                    <div>
                      <p className="text-stone-600 font-medium mb-16">Disetujui / Keuangan,</p>
                      <p className="font-bold border-b border-black pb-0.5 inline-block px-8">
                        {submission.dibuatOleh || 'Nur Wahyudi'}
                      </p>
                      <p className="text-[10px] text-stone-500 mt-1">Staff Keuangan HO</p>
                    </div>
                  </div>

                </div>
              </PageScaleWrapper>
            </>
          );
        })()}

        {/* Loading state indicator on screen only */}
        {isLoadingPages && (
          <div className="w-[210mm] min-h-[140mm] bg-white border border-stone-250 shadow-md rounded-xl p-8 flex flex-col items-center justify-center gap-3 print:hidden">
            <Loader2 size={36} className="animate-spin text-amber-500" />
            <span className="text-sm font-semibold text-stone-700">Mempersiapkan Lembar Lampiran Pendukung Transaksi...</span>
            <span className="text-xs text-stone-400 font-mono animate-pulse">{loadingProgress}</span>
          </div>
        )}

        {/* Error state indicator on screen only */}
        {loadError && (
          <div className="w-[210mm] min-h-[100mm] bg-rose-50 border border-rose-250 rounded-xl p-8 flex flex-col items-center justify-center gap-3 print:hidden shadow-xs">
            <Cloud size={36} className="text-rose-500" />
            <span className="text-sm font-bold text-rose-800 text-center">{loadError}</span>
            <p className="text-xs text-rose-600 text-center max-w-lg mb-2 leading-relaxed">
              Sesi koneksi Google Drive Anda kemungkinan sudah kedaluwarsa (berlaku maksimum 60 menit semenjak login terakhir demi keamanan Google), atau berkas tidak diatur agar dapat diakses oleh publik. Silakan sambungkan kembali.
            </p>
            <button
              onClick={async () => {
                try {
                  setIsLoadingPages(true);
                  setLoadError('');
                  setLoadingProgress('Menghubungkan ke Google Drive...');
                  const res = await googleDriveLogin();
                  if (res && res.accessToken) {
                    setReloadTrigger(prev => prev + 1);
                  } else {
                    throw new Error('Gagal mendapatkan token akses baru.');
                  }
                } catch (err: any) {
                  setLoadError(`Gagal menyambungkan kembali Google Drive: ${err?.message || err}`);
                } finally {
                  setIsLoadingPages(false);
                }
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Cloud size={14} />
              Sambungkan Ulang Google Drive
            </button>
          </div>
        )}

        {/* ================= PAGE 3+: LAMPIRAN DOKUMEN BUKTI (DYNAMIC SEVERAL PAGES) ================= */}
        {(activeTab === 'both' || activeTab === 'lampiran' || activeTab === 'pengeluaran') && !isLoadingPages && visiblePages.map((page, idx) => {
          const fileObj = attachmentFiles[page.fileIndex];
          const fileLabel = fileObj?.isBuktiPembayaran ? 'Bukti Bayar'
                          : fileObj?.docType === 'po' ? 'PO'
                          : fileObj?.docType === 'lhv' ? 'LHV'
                          : fileObj?.docType === 'draft_survei' ? 'Survei'
                          : fileObj?.docType === 'bill_of_lading' ? 'Bill of Lading'
                          : fileObj?.docType === 'cargo_manifest' ? 'Cargo'
                          : fileObj?.docType === 'cow_coa_ds_bongkar' ? 'COW & COA DS Bongkar'
                          : fileObj?.docType === 'bukti_pembayaran_batubara' ? 'P.Batubara'
                          : fileObj?.docType === 'bukti_shipment_tongkang_founder' ? 'S.Tongkang'
                          : fileObj?.docType === 'bukti_pajak_trader_founder' ? 'Pajak Trader'
                          : fileObj?.docType === 'petty_cash_report' ? 'LPJ Petty Cash'
                          : fileObj?.docType === 'merged_all' ? 'Gabungan Dokumen Utama'
                          : `Lampiran B${page.fileIndex + 1}`;

          const isLandscape = false;

          return (
            <React.Fragment key={page.id}>
              {/* Divider for Screen View, hidden during printing */}
              {activeTab === 'both' && (
                <div className={`${isLandscape ? 'w-[297mm]' : 'w-[210mm]'} border-t-2 border-dashed border-stone-300 py-3 print:hidden flex justify-center transition-all duration-200`}>
                  <span className="text-xs bg-stone-100 text-[#917118] px-3 py-1 rounded-full font-semibold uppercase font-mono">
                    BATAS HALAMAN {fileLabel.toUpperCase()} (PAGE BREAK - {isLandscape ? 'LANDSCAPE' : 'PORTRAIT'})
                  </span>
                </div>
              )}

              <PageScaleWrapper isLandscape={isLandscape} isLastPage={((activeTab === "both" || activeTab === "pengajuan") ? basePagesCount : 0) + idx + 1 === totalPagesCount}>
                {/* Responsive container matching orientation format on screen & print */}
                <div 
                  className={`bg-white border border-stone-250 shadow-md rounded-xl print:shadow-none print:border-none print:rounded-none print:!p-0 print:!m-0 page-break is-image-page relative overflow-hidden bg-stone-50/10 flex items-center justify-center transition-all duration-200 ${
                    isLandscape 
                      ? 'w-[297mm] min-h-[210mm] h-[210mm] print-landscape' 
                      : 'w-[210mm] min-h-[297mm] h-[297mm] print-portrait'
                  }`}
                >
                  {/* Floating Action for Hiding / Deleting / Rotating Page from PDF Print */}
                  {!isSharedView && (
                    <div className="absolute top-4 right-4 flex gap-2 z-20 print:hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setPageRotations(prev => ({ ...prev, [page.id]: ((prev[page.id] || 0) + 90) % 360 }));
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-sans font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-md border border-blue-500 transition-all cursor-pointer hover:scale-105 active:scale-95"
                        title="Putar Halaman"
                      >
                        <RotateCw size={13} />
                        <span>Putar Halaman</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletedPageIds(prev => [...prev, page.id]);
                        }}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-sans font-bold text-[11px] px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-md border border-rose-500 transition-all cursor-pointer hover:scale-105 active:scale-95"
                        title="Hapus Halaman Ini"
                      >
                        <Trash2 size={13} />
                        <span>Hapus Halaman</span>
                      </button>
                    </div>
                  )}

                  {page.isPlaceholder && page.fileId ? (
                    <div className="w-full h-full relative flex flex-col items-center justify-between bg-stone-100 overflow-hidden">
                    {/* Native Google Drive Embedded Viewer */}
                    <div 
                      className="absolute inset-0 m-auto flex items-center justify-center transition-all duration-300" 
                      style={{ 
                        transform: `rotate(${pageRotations[page.id] || 0}deg) scale(${(pageRotations[page.id] || 0) % 180 !== 0 ? 210/297 : 1})`,
                        width: '100%',
                        height: '100%'
                      }}
                    >
                      <iframe
                        src={`https://drive.google.com/file/d/${page.fileId}/preview`}
                        className="w-full h-full border-0 z-0 bg-stone-50"
                        allow="autoplay"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    {/* Floating Controls Overlay specifically configured for quick sync and manual copy overrides */}
                    <div className="absolute bottom-4 left-4 right-4 bg-stone-900/90 hover:bg-stone-950/95 text-white rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl backdrop-blur-md z-10 print:hidden transition-all duration-150 border border-stone-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-500/10 border border-amber-500/35 rounded-lg text-[#D4AF37]">
                          <Cloud size={14} />
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] font-extrabold tracking-wide uppercase text-stone-300">Pratinjau Langsung Google Drive</p>
                          <p className="text-[9px] text-stone-400 font-medium">Bekerja via otorisasi browser Anda. Jika file tidak muncul, Anda dapat menyalin file atau membuka tab baru.</p>
                        </div>
                      </div>

                      {(() => {
                        const file = attachmentFiles[page.fileIndex];
                        const url = file?.url || '';
                        const copying = isCopying[page.fileId!];

                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={handleConnectDriveFromWarning}
                              disabled={isConnectingDrive}
                              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-750 text-white font-bold rounded-lg text-[10px] transition cursor-pointer flex items-center gap-1.5"
                            >
                              <RefreshCw size={11} className={isConnectingDrive ? 'animate-spin' : ''} />
                              Ganti Akun
                            </button>

                            <button
                              onClick={() => handleCopyFileToMyDrive(url, file.name)}
                              disabled={copying}
                              className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#Bca031] disabled:bg-stone-700 text-stone-950 font-extrabold rounded-lg text-[10px] transition flex items-center gap-1.5 cursor-pointer"
                            >
                              {copying ? (
                                <>
                                  <Loader2 size={11} className="animate-spin text-stone-950" />
                                  Menyalin...
                                </>
                              ) : (
                                <>
                                  <Cloud size={11} className="text-stone-950" />
                                  Salin ke GDrive Saya
                                </>
                              )}
                            </button>
                            
                            <a
                              href={`https://drive.google.com/file/d/${page.fileId}/view`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-750 text-white font-bold rounded-lg text-[10px] transition flex items-center gap-1.5 cursor-pointer no-underline"
                            >
                              Buka di Tab Baru ↗
                            </a>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : page.isPlaceholder ? (
                  <div className="flex flex-col items-center justify-center text-center p-8 max-w-xl animate-fade-in">
                    {/* Modern Secure Lock Badge */}
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-[#D4AF37]/10 rounded-full blur-xl opacity-60 animate-pulse"></div>
                      <div className="relative h-20 w-20 rounded-full bg-stone-50 border border-stone-200 flex items-center justify-center shadow-xs">
                        <div className="h-16 w-16 rounded-full bg-amber-50/50 border border-amber-100 flex items-center justify-center">
                          <Lock className="text-[#917118] w-7 h-7" />
                        </div>
                      </div>
                    </div>

                    <h4 className="text-base font-bold text-stone-900 tracking-wide uppercase mb-1">
                      Lampiran Dokumen: {fileLabel}
                    </h4>
                    <span className="text-[10px] text-stone-500 font-mono mb-6 bg-stone-100 border border-stone-200 px-3 py-1 rounded-full max-w-sm truncate inline-block">
                      {page.fileName}
                    </span>

                    {/* Classy Corporate Notification Box */}
                    <div className="bg-white border border-stone-250 border-t-4 border-t-[#D4AF37] rounded-2xl p-6 text-left max-w-md shadow-sm space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl text-[#917118] shrink-0 mt-0.5">
                          <ShieldAlert size={18} />
                        </div>
                        <div className="space-y-1">
                          <h5 className="text-[11px] font-extrabold text-stone-900 tracking-wide uppercase">
                            Proteksi Dokumen Google Drive
                          </h5>
                          <p className="text-[11px] text-stone-600 leading-relaxed">
                            Akun aktif Anda saat ini belum memiliki hak akses langsung atau otorisasi penuh untuk menampilkan berkas ini dari pihak pengunggah asal.
                          </p>
                        </div>
                      </div>

                      <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-500 font-mono">Langkah Solusi</span>
                        </div>
                        <p className="text-[11px] text-stone-600 leading-relaxed font-medium">
                          Silakan tautkan akun Google Drive Anda atau lakukan penyalinan berkas secara instan ke Drive pribadi Anda demi kenyamanan pratinjau dan pencetakan dokumen.
                        </p>
                      </div>

                      {/* Action Interface */}
                      {(() => {
                        const file = attachmentFiles[page.fileIndex];
                        const url = file?.url || '';
                        const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
                        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                        const fileId = (dMatch && dMatch[1]) || (idMatch && idMatch[1]);
                        const copying = fileId ? isCopying[fileId] : false;

                        return (
                          <div className="pt-3 border-t border-stone-150 flex flex-col gap-2">
                            <button
                              onClick={handleConnectDriveFromWarning}
                              disabled={isConnectingDrive}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-850 disabled:bg-stone-300 text-white font-extrabold rounded-xl text-xs transition duration-150 shadow-3xs cursor-pointer"
                            >
                              <Cloud size={14} className="text-[#D4AF37]" />
                              <span>{isConnectedToDrive ? 'Ganti Otorisasi Google Drive' : 'Hubungkan Akun Google Drive'}</span>
                            </button>

                            {fileId && (
                              <button
                                onClick={() => handleCopyFileToMyDrive(url, file.name)}
                                disabled={copying}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#Bca031] disabled:bg-stone-200 disabled:text-stone-400 text-stone-900 font-extrabold rounded-xl text-xs transition duration-150 shadow-3xs cursor-pointer"
                              >
                                {copying ? (
                                  <>
                                    <Loader2 size={13} className="animate-spin text-stone-900" />
                                    <span>Menyalin Dokumen...</span>
                                  </>
                                ) : (
                                  <>
                                    <Cloud size={13} className="text-stone-900" />
                                    <span>Salin ke GDrive Saya & Tampilkan</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div 
                    className="absolute inset-0 m-auto flex items-center justify-center transition-all duration-300 print:!relative print:!transform-none print:!w-full print:!h-full" 
                    style={{ 
                      transform: `rotate(${pageRotations[page.id] || 0}deg) scale(${(pageRotations[page.id] || 0) % 180 !== 0 ? 210/297 : 1})`,
                      width: '100%',
                      height: '100%'
                    }}
                  >
                    <img
                      src={page.dataUrl}
                      alt={page.fileName}
                      className="w-full h-full object-contain print:!w-full print:!h-full print:!object-contain print:!block"
                    />
                  </div>
                )}
              </div>
              </PageScaleWrapper>
            </React.Fragment>
          );
        })}

      </div>

      {/* Styled inline media-print stylesheet to dynamically align perfectly fit elements */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 12mm 15mm;
          }
          @page landscape-page {
            size: A4 landscape;
            margin: 12mm 15mm 12mm 15mm;
          }
          html, body, #app-root, main, #app-root > main {
            background-color: white !important;
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            display: block !important;
            box-shadow: none !important;
            border: none !important;
          }
          /* Ensure wrapper elements do not carry external paddings/spacings in print content */
          .space-y-6 > * + *, .space-y-8 > * + * {
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
          }
          .print\:hidden {
            display: none !important;
          }
          /* Ensure each form fits exactly on a single A4 page */
          .page-break {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            box-shadow: none !important;
          }
          .page-break.is-image-page {
            height: 272mm !important;
          }
          .page-break.is-image-page.print-landscape {
            height: 185mm !important;
            page: landscape-page !important;
          }
          .page-break.is-image-page img {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain !important;
            display: block !important;
            max-width: 100% !important;
            max-height: 100% !important;
          }
          .company-logo-img {
            max-width: 100% !important;
            object-fit: contain !important;
          }
          .print-force-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          /* Ensure no cutoffs or overlapping content */
          table {
            page-break-inside: avoid;
          }
        }
      `}</style>

    </div>
  );
};

/* 
 * =========================================================================
 * 🛑 CRITICAL PRINT LAYOUT ZONE - DO NOT MODIFY WITHOUT EXTREME CAUTION 🛑
 * =========================================================================
 * 
 * ATURAN PENTING (AGENT/AI):
 * 1. Jangan ubah struktur `@media print` style, PageScaleWrapper, atau
 *    penempatan CSS class seperti `print:hidden`, `print:!transform-none`.
 * 2. Layout cetakan A4 ini sangat rapuh jika ada perubahan orientasi,
 *    `absolute` vs `relative`, dan margin (terutama untuk iframe/img).
 * 3. Gambar lampiran (image pages) mengandalkan `.is-image-page` untuk
 *    menetapkan dimensi tinggi absolut saat dicetak.
 * 4. Jika ada perbaikan layout cetak, LAKUKAN HANYA PADA BAGIAN YANG 
 *    SPESIFIK (jangan hapus atau reset seluruh kelas Tailwind!).
 * 
 * =========================================================================
 */

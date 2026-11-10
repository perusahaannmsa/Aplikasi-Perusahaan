import React, { useState, useEffect } from 'react';
import { Submission, CicilanPaymentRecord } from '../types';
import { 
  formatRupiah, 
  formatDateIndonesian, 
  mergeFilesToSinglePdf,
  isCicilanSubmission,
  getStandardDriveFolderName
} from '../utils';
import { 
  saveSubmissionToFirestore, 
  isFirebaseConfigured,
  ensureValidDriveToken,
  getOrRenewDriveToken,
  getActiveGoogleDriveAccount,
  getConnectedDrives,
  executeDriveApiWithAutoRefresh,
  ensureGoogleDriveFileSharing,
  saveActivityLogToFirestore
} from '../firebase';
import { 
  X, 
  UploadCloud, 
  Receipt, 
  CheckCircle2, 
  AlertTriangle, 
  CreditCard, 
  Calendar, 
  User, 
  FileText, 
  Check, 
  Trash2, 
  ExternalLink, 
  Search,
  Building,
  DollarSign,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileCheck
} from 'lucide-react';

interface UploadBuktiTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: Submission | null;
  allSubmissions?: Submission[];
  onUpdateSubmission?: (updatedSubmission: Submission) => void;
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

export const UploadBuktiTransferModal: React.FC<UploadBuktiTransferModalProps> = ({
  isOpen,
  onClose,
  submission: initialSubmission,
  allSubmissions = [],
  onUpdateSubmission,
  userProfile
}) => {
  const [selectedSub, setSelectedSub] = useState<Submission | null>(initialSubmission);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Payment Form State
  const [paymentMode, setPaymentMode] = useState<'lunas' | 'cicilan'>('lunas');
  const [nominalBayar, setNominalBayar] = useState<number | ''>('');
  const [keteranganCicilan, setKeteranganCicilan] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Transfer Bank');
  
  // File Upload State
  const [uploadedFiles, setUploadedFiles] = useState<UploadedReceiptItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Sync state when modal opens or initialSubmission changes
  useEffect(() => {
    if (isOpen) {
      setSelectedSub(initialSubmission);
      resetForm(initialSubmission);
    } else {
      setIsSuccess(false);
      setErrorText('');
      setSaveProgress('');
    }
  }, [isOpen, initialSubmission]);

  const getSubTotal = (sub: Submission | null): number => {
    if (!sub) return 0;
    return sub.items?.reduce((sum, item) => sum + (Number(item.total) || 0), 0) || 0;
  };

  const getSubPaid = (sub: Submission | null): number => {
    if (!sub) return 0;
    if (sub.status === 'Lunas') {
      return getSubTotal(sub);
    }
    if (typeof sub.dpAmount === 'number' && sub.dpAmount > 0) {
      return sub.dpAmount;
    }
    if (sub.riwayatCicilan && sub.riwayatCicilan.length > 0) {
      const sumHist = sub.riwayatCicilan.reduce((sum, r) => sum + (Number(r.nominal) || 0), 0);
      if (sumHist > 0) return sumHist;
    }
    return 0;
  };

  const resetForm = (sub: Submission | null) => {
    setUploadedFiles([]);
    setErrorText('');
    setIsSuccess(false);
    setSaveProgress('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('Transfer Bank');

    if (!sub) {
      setNominalBayar('');
      setKeteranganCicilan('');
      return;
    }

    const total = getSubTotal(sub);
    const paid = getSubPaid(sub);
    const remaining = Math.max(0, total - paid);

    if (isCicilanSubmission(sub) || sub.status === 'DP / Cicilan') {
      setPaymentMode('cicilan');
      setNominalBayar(remaining > 0 ? remaining : total);
      setKeteranganCicilan(sub.cicilanNotes ? `Pelunasan / Termin Lanjutan` : 'Termin Pembayaran');
    } else {
      setPaymentMode('lunas');
      setNominalBayar(remaining > 0 ? remaining : total);
      setKeteranganCicilan('');
    }
  };

  if (!isOpen) return null;

  const totalVoucher = getSubTotal(selectedSub);
  const alreadyPaid = getSubPaid(selectedSub);
  const remainingBeforePayment = Math.max(0, totalVoucher - alreadyPaid);

  const currentPayNominal = paymentMode === 'lunas'
    ? (remainingBeforePayment > 0 ? remainingBeforePayment : totalVoucher)
    : (typeof nominalBayar === 'number' ? nominalBayar : 0);

  const accumulatedPaid = alreadyPaid + currentPayNominal;
  const remainingDebtAfter = Math.max(0, totalVoucher - accumulatedPaid);
  const willBeFullyPaid = paymentMode === 'lunas' || accumulatedPaid >= totalVoucher || remainingDebtAfter === 0;

  // File Handling Actions
  const processFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    setErrorText('');

    const newItems: UploadedReceiptItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.includes('image/') && file.type !== 'application/pdf') {
        setErrorText('Format file tidak didukung. Harap sertakan file Gambar (JPG, PNG, WEBP) atau PDF.');
        continue;
      }

      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      let previewUrl = '';
      let base64 = '';

      if (file.type.includes('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      try {
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      } catch (e) {
        console.warn('Gagal membaca base64:', e);
      }

      newItems.push({
        id,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        base64,
        fileObject: file,
        previewUrl
      });
    }

    setUploadedFiles(prev => [...prev, ...newItems]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
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
      e.target.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Google Drive Helpers
  const getOrCreateFolder = async (_initialToken: string, name: string, parentId: string): Promise<string> => {
    const cleanName = name.trim();
    const cleanSearchName = cleanName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const query = `name = '${cleanSearchName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    
    return executeDriveApiWithAutoRefresh(async (token) => {
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType)`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (searchRes.status === 401) throw new Error('UNAUTHORIZED_401');

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.files && data.files.length > 0) {
          return data.files[0].id;
        }
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

      if (createRes.status === 401) throw new Error('UNAUTHORIZED_401');
      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Gagal membuat folder '${cleanName}': ${errText}`);
      }

      const createdData = await createRes.json();
      return createdData.id;
    }, { actionName: `getOrCreateFolder(${cleanName})` });
  };

  const uploadFileToFolder = async (
    fileName: string,
    fileMimeType: string,
    fileBytes: Uint8Array,
    folderId: string
  ): Promise<{ url: string; name: string }> => {
    return executeDriveApiWithAutoRefresh(async (driveToken) => {
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
          headers: { Authorization: `Bearer ${driveToken}` },
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

  // Main Submit Action
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) {
      setErrorText('Harap pilih pengajuan transaksi terlebih dahulu.');
      return;
    }

    if (uploadedFiles.length === 0) {
      setErrorText('Harap sertakan minimal 1 berkas / foto bukti transfer pembayaran.');
      return;
    }

    if (currentPayNominal <= 0) {
      setErrorText('Nominal pembayaran harus lebih besar dari Rp 0.');
      return;
    }

    setIsLoading(true);
    setErrorText('');
    setSaveProgress(`1/4. Menggabungkan ${uploadedFiles.length} berkas bukti transfer menjadi 1 file PDF pembayaran...`);

    try {
      const isInstallmentTx = paymentMode === 'cicilan' || isCicilanSubmission(selectedSub);
      const finalStatus: 'Lunas' | 'DP / Cicilan' = (!isInstallmentTx || willBeFullyPaid) ? 'Lunas' : 'DP / Cicilan';

      const cleanKode = (selectedSub.kode || 'BKK').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanPenerima = (selectedSub.dibayarkanKepada || 'Penerima').replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
      const baseMergedName = `Bukti Pembayaran - ${cleanKode} (${cleanPenerima})`;

      // 1. Merge files into single PDF
      const mergeResult = await mergeFilesToSinglePdf(
        uploadedFiles.map(u => u.fileObject),
        baseMergedName
      );

      const pdfBytes = mergeResult.bytes;
      const formattedFileName = mergeResult.name;

      // Base64 fallback
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

      // 2. Preserve existing files
      let finalDriveFiles = [...(selectedSub.googleDriveFiles || [])];
      if (selectedSub.buktiPembayaran?.url) {
        const alreadyInDrive = finalDriveFiles.some(f => f.url === selectedSub.buktiPembayaran?.url);
        if (!alreadyInDrive) {
          finalDriveFiles.push({
            url: selectedSub.buktiPembayaran.url,
            name: selectedSub.buktiPembayaran.name || 'Bukti Pembayaran Sebelumnya',
            isBuktiPembayaran: true
          });
        }
      }

      // 3. Upload to Google Drive
      setSaveProgress('2/4. Memeriksa koneksi Google Drive...');
      let token: string | null = null;
      try {
        token = await ensureValidDriveToken(false);
        if (!token) {
          const activeAccount = getActiveGoogleDriveAccount();
          token = await getOrRenewDriveToken(activeAccount?.email, false);
        }
      } catch (err) {
        console.warn('Drive token check note:', err);
      }

      if (token) {
        try {
          setSaveProgress('3/4. Menyusun folder transaksi di Google Drive & mengunggah berkas...');
          
          let yearStr = '';
          let monthStr = '';
          let dayStr = '';

          const parts = (selectedSub.tanggal || '').split('-');
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
            monthStr = `${dateObj.getMonth() + 1}. ${INDONESIAN_MONTHS[dateObj.getMonth()]}`;
            dayStr = String(dateObj.getDate());
          }

          const activeCompanyCode = (
            userProfile?.companyDetails?.code || 
            userProfile?.companyId || 
            selectedSub.companyId || 
            'nmsa'
          ).toLowerCase().trim();
          const folderCompanyUpper = activeCompanyCode.toUpperCase();

          const rootId = 'root';
          const voucherAppId = await getOrCreateFolder(token, 'Voucher-APP', rootId);
          const companyFolderId = await getOrCreateFolder(token, folderCompanyUpper, voucherAppId);
          const yearFolderId = await getOrCreateFolder(token, yearStr, companyFolderId);
          const monthFolderId = await getOrCreateFolder(token, monthStr, yearFolderId);
          const dayFolderId = await getOrCreateFolder(token, dayStr, monthFolderId);

          const standardTxFolderName = getStandardDriveFolderName(selectedSub);
          const txFolderId = await getOrCreateFolder(token, standardTxFolderName, dayFolderId);
          const buktiBayarFolderId = await getOrCreateFolder(token, 'Bukti Pembayaran', txFolderId);

          const uploadResult = await uploadFileToFolder(
            formattedFileName,
            'application/pdf',
            pdfBytes,
            buktiBayarFolderId
          );

          finalBuktiPembayaran = {
            url: uploadResult.url,
            name: uploadResult.name
          };

          finalDriveFiles.push({
            url: uploadResult.url,
            name: uploadResult.name,
            isBuktiPembayaran: true
          });

          console.log('✅ Berkas bukti pembayaran berhasil diunggah ke Google Drive:', uploadResult);
        } catch (driveErr) {
          console.warn('Gagal upload ke Google Drive, fallback ke penyimpanan database:', driveErr);
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

      setSaveProgress('4/4. Memperbarui status transaksi & riwayat pembayaran...');

      // 4. Construct updated submission object
      let updatedSubmission: Submission;

      const newRecord: CicilanPaymentRecord = {
        id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        tanggal: paymentDate || new Date().toISOString().split('T')[0],
        nominal: currentPayNominal,
        sisaSetelahBayar: remainingDebtAfter,
        keterangan: keteranganCicilan.trim() || (willBeFullyPaid ? 'Pelunasan Tagihan' : `Pembayaran Termin (${paymentMethod})`),
        buktiPembayaran: finalBuktiPembayaran,
        createdAt: new Date().toISOString()
      };

      const existingHistory = selectedSub.riwayatCicilan || [];
      const updatedHistory = [...existingHistory, newRecord];

      if (!isInstallmentTx) {
        updatedSubmission = {
          ...selectedSub,
          status: 'Lunas',
          buktiPembayaran: finalBuktiPembayaran,
          googleDriveFiles: finalDriveFiles,
          riwayatCicilan: updatedHistory
        };
      } else {
        updatedSubmission = {
          ...selectedSub,
          status: finalStatus,
          dpAmount: accumulatedPaid,
          cicilanNotes: keteranganCicilan.trim() || (willBeFullyPaid ? 'Lunas Penuh' : selectedSub.cicilanNotes),
          riwayatCicilan: updatedHistory,
          buktiPembayaran: finalBuktiPembayaran,
          googleDriveFiles: finalDriveFiles
        };
      }

      // 5. Save to Firestore
      if (isFirebaseConfigured()) {
        const finalCompanyId = (updatedSubmission.companyId || userProfile?.companyId || 'nmsa').toLowerCase().trim();
        const finalCompanyName = updatedSubmission.companyName || userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi';
        await saveSubmissionToFirestore(updatedSubmission, finalCompanyId, finalCompanyName);

        await saveActivityLogToFirestore({
          action: 'PAYMENT_RECEIPT_UPLOADED',
          targetId: updatedSubmission.id,
          targetKode: updatedSubmission.kode,
          details: `Upload bukti bayar ${formatRupiah(currentPayNominal)} (${updatedSubmission.status}) untuk ${updatedSubmission.dibayarkanKepada}`,
          companyId: finalCompanyId,
          timestamp: new Date().toISOString()
        }, userProfile);
      }

      // 6. Notify parent component to update state
      if (onUpdateSubmission) {
        onUpdateSubmission(updatedSubmission);
      }

      setIsSuccess(true);
      setSaveProgress('Sukses! Bukti pembayaran berhasil disimpan.');

      // Auto close after 1.5 seconds on success
      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Submit payment error:', err);
      setErrorText(err.message || 'Gagal menyimpan bukti pembayaran.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered unpaid submissions for dropdown if no submission was passed
  const unpaidSubmissions = allSubmissions.filter(s => {
    if (!s) return false;
    const isUnpaid = s.status === 'Belum Lunas' || s.status === 'DP / Cicilan';
    if (!searchQuery.trim()) return isUnpaid;
    const q = searchQuery.toLowerCase();
    return (
      (s.kode || '').toLowerCase().includes(q) ||
      (s.dibayarkanKepada || '').toLowerCase().includes(q) ||
      (s.jenisPengajuan || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 via-stone-850 to-teal-950 text-white flex items-center justify-between border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-500/20 text-teal-300 rounded-2xl border border-teal-500/30 shadow-inner">
              <Receipt size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] font-bold bg-teal-400/20 text-teal-300 px-2 py-0.5 rounded-full border border-teal-400/30">
                  UPLOAD BUKTI PEMBAYARAN
                </span>
                <span className="text-xs font-bold text-stone-200">
                  Pelunasan &amp; Struk Bank Transfer
                </span>
              </div>
              <p className="text-[11px] text-stone-300 font-mono mt-0.5 truncate">
                {selectedSub ? `Transaksi: ${selectedSub.kode} • ${selectedSub.dibayarkanKepada}` : 'Pilih transaksi yang ingin dilunasi'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-2xl transition cursor-pointer"
            title="Tutup Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-stone-50/50">

          {/* Success Overlay */}
          {isSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-center gap-3 animate-in fade-in duration-200 shadow-xs">
              <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider font-sans">
                  Pembayaran Berhasil Disimpan &amp; Diunggah!
                </h4>
                <p className="text-[11px] font-mono text-emerald-800 mt-0.5">
                  Status voucher kini telah diperbarui menjadi <strong>{willBeFullyPaid ? 'LUNAS' : 'DP / CICILAN'}</strong> dan berkas tersinkronisasi ke Google Drive.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorText && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-start gap-2.5 font-medium animate-in fade-in duration-150">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-line leading-relaxed">{errorText}</span>
            </div>
          )}

          {/* Selector if no submission passed */}
          {!selectedSub && (
            <div className="bg-white border border-stone-250 rounded-2xl p-4 space-y-3 shadow-xs">
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                Pilih Transaksi Voucher yang Ingin Dilunasi:
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kode transaksi, nama penerima, atau jenis pengajuan..."
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-9 pr-3 py-2 text-xs font-mono focus:outline-none focus:border-teal-600"
                />
              </div>

              <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100">
                {unpaidSubmissions.slice(0, 10).map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSelectedSub(sub);
                      resetForm(sub);
                    }}
                    className="w-full p-2.5 text-left hover:bg-teal-50/60 transition flex items-center justify-between gap-2 text-xs font-sans cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-stone-900">{sub.kode}</span>
                        <span className="text-[10px] text-stone-500 font-medium">({sub.tanggal})</span>
                      </div>
                      <p className="text-[11px] text-stone-600 truncate">{sub.dibayarkanKepada} • {sub.jenisPengajuan}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-stone-900 block">
                        Rp {formatRupiah(getSubTotal(sub))}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                        sub.status === 'DP / Cicilan' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {sub.status || 'Belum Lunas'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transaction Summary Card */}
          {selectedSub && (
            <div className="bg-white border border-stone-250 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-150 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-stone-900 text-white font-mono text-xs font-bold">
                    {selectedSub.kode}
                  </span>
                  <span className="text-xs font-bold text-stone-800">
                    {selectedSub.jenisPengajuan}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    selectedSub.status === 'Lunas' 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                      : selectedSub.status === 'DP / Cicilan'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}>
                    {selectedSub.status || 'Belum Lunas'}
                  </span>
                  {!initialSubmission && (
                    <button
                      type="button"
                      onClick={() => setSelectedSub(null)}
                      className="text-[10px] text-stone-400 hover:text-stone-700 underline"
                    >
                      Ganti
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                <div className="p-2 bg-stone-50 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-stone-400 block">Penerima:</span>
                  <span className="font-bold text-stone-800 block truncate" title={selectedSub.dibayarkanKepada}>
                    {selectedSub.dibayarkanKepada}
                  </span>
                </div>

                <div className="p-2 bg-stone-50 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-stone-400 block">Tanggal Pengajuan:</span>
                  <span className="font-bold text-stone-800 block">
                    {selectedSub.tanggal}
                  </span>
                </div>

                <div className="p-2 bg-stone-50 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-stone-400 block">Total Nilai Tagihan:</span>
                  <span className="font-bold text-stone-900 block">
                    Rp {formatRupiah(totalVoucher)}
                  </span>
                </div>

                <div className="p-2 bg-teal-50 border border-teal-200/80 rounded-xl space-y-0.5">
                  <span className="text-[10px] text-teal-700 block">Sisa Belum Dibayar:</span>
                  <span className="font-bold text-teal-900 block">
                    Rp {formatRupiah(remainingBeforePayment)}
                  </span>
                </div>
              </div>

              {/* Rekening Tujuan info if available */}
              {(selectedSub.namaBankTujuan || selectedSub.noRekeningTujuan) && (
                <div className="p-2.5 bg-amber-50/60 border border-amber-200/60 rounded-xl text-[11px] font-mono flex items-center justify-between flex-wrap gap-2 text-amber-900">
                  <div className="flex items-center gap-1.5">
                    <Building size={13} className="text-amber-700" />
                    <span>Rekening Tujuan: <strong>{selectedSub.namaBankTujuan || 'Bank'}</strong> • {selectedSub.noRekeningTujuan}</span>
                  </div>
                  {selectedSub.atasNamaRekeningTujuan && (
                    <span className="text-[10px] text-amber-800">a.n {selectedSub.atasNamaRekeningTujuan}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payment Details Form */}
          {selectedSub && (
            <form onSubmit={handleSubmitPayment} className="space-y-4">
              
              {/* Payment Mode Selection */}
              <div className="bg-white border border-stone-250 rounded-2xl p-4 shadow-xs space-y-3">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  1. Status Pelunasan Pembayaran:
                </label>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('lunas');
                      setNominalBayar(remainingBeforePayment > 0 ? remainingBeforePayment : totalVoucher);
                      setKeteranganCicilan('');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      paymentMode === 'lunas'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-xs'
                        : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-700'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold block">Pelunasan Penuh (Lunas)</span>
                      <span className="text-[10px] font-mono text-stone-500">Membayar seluruh sisa tagihan</span>
                    </div>
                    {paymentMode === 'lunas' && <Check size={16} className="text-emerald-600" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('cicilan');
                      if (nominalBayar === '' || nominalBayar === totalVoucher) {
                        setNominalBayar(Math.round(remainingBeforePayment / 2) || 1000000);
                      }
                      setKeteranganCicilan(selectedSub.cicilanNotes ? 'Termin Lanjutan' : 'Termin 1 (DP)');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      paymentMode === 'cicilan'
                        ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold shadow-xs'
                        : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-700'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold block">Pembayaran Termin / DP</span>
                      <span className="text-[10px] font-mono text-stone-500">Membayar sebagian / cicilan</span>
                    </div>
                    {paymentMode === 'cicilan' && <Check size={16} className="text-amber-600" />}
                  </button>
                </div>

                {/* Nominal Input & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-600 uppercase tracking-wider">
                      Nominal Pembayaran Sekarang:
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-stone-400">Rp</span>
                      <input
                        type="number"
                        required
                        min="1"
                        max={remainingBeforePayment > 0 ? remainingBeforePayment : totalVoucher}
                        value={nominalBayar}
                        onChange={(e) => setNominalBayar(e.target.value === '' ? '' : Number(e.target.value))}
                        disabled={paymentMode === 'lunas'}
                        placeholder="0"
                        className={`w-full bg-stone-50 border rounded-xl pl-9 pr-3 py-2 text-xs font-mono font-bold text-stone-900 focus:outline-none focus:border-teal-600 ${
                          paymentMode === 'lunas' ? 'bg-stone-100 text-stone-600 cursor-not-allowed' : ''
                        }`}
                      />
                    </div>
                    {typeof nominalBayar === 'number' && (
                      <span className="text-[10px] font-mono text-stone-500 block">
                        Rp {formatRupiah(nominalBayar)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-600 uppercase tracking-wider">
                      Tanggal Pembayaran / Transfer:
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        required
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-800 focus:outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Details: Method & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-600 uppercase tracking-wider">
                      Metode Pembayaran:
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-800 focus:outline-none focus:border-teal-600"
                    >
                      <option value="Transfer Bank BCA">Transfer Bank BCA</option>
                      <option value="Transfer Bank Mandiri">Transfer Bank Mandiri</option>
                      <option value="Transfer Bank BRI">Transfer Bank BRI</option>
                      <option value="Transfer Bank BNI">Transfer Bank BNI</option>
                      <option value="Transfer Bank Lain">Transfer Bank Lain</option>
                      <option value="Kas Tunai">Kas Tunai</option>
                      <option value="Cek / Bilyet Giro">Cek / Bilyet Giro</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-600 uppercase tracking-wider">
                      Catatan Pembayaran (Opsional):
                    </label>
                    <input
                      type="text"
                      value={keteranganCicilan}
                      onChange={(e) => setKeteranganCicilan(e.target.value)}
                      placeholder="Contoh: Pelunasan biaya notaris, Termin 1..."
                      className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-xs font-sans text-stone-800 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                </div>

                {/* Real-time Calculation Summary */}
                <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between text-xs font-mono">
                  <span className="text-stone-500">Sisa Saldo Setelah Pembayaran Ini:</span>
                  <span className={`font-black ${remainingDebtAfter === 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                    Rp {formatRupiah(remainingDebtAfter)} {remainingDebtAfter === 0 ? '(LUNAS)' : ''}
                  </span>
                </div>
              </div>

              {/* Upload Dropzone Section */}
              <div className="bg-white border border-stone-250 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                    2. Berkas Bukti Transfer / Pembayaran:
                  </label>
                  <span className="text-[10px] font-mono text-stone-400">
                    JPG, PNG, WEBP, atau PDF
                  </span>
                </div>

                {/* Drag and Drop Box */}
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`p-6 border-2 border-dashed rounded-2xl text-center space-y-2 transition flex flex-col items-center justify-center cursor-pointer ${
                    dragActive 
                      ? 'border-teal-500 bg-teal-50/50' 
                      : 'border-stone-300 hover:border-teal-500 bg-stone-50/40 hover:bg-stone-50'
                  }`}
                  onClick={() => document.getElementById('bukti-transfer-file-input')?.click()}
                >
                  <input
                    id="bukti-transfer-file-input"
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center">
                    <UploadCloud size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-800">
                      Klik untuk Pilih Berkas atau Seret &amp; Lepas di Sini
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      Bisa pilih beberapa foto struk sekaligus (otomatis digabungkan rapi ke 1 PDF)
                    </p>
                  </div>
                </div>

                {/* Uploaded Files Preview List */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                      Berkas yang Siap Diunggah ({uploadedFiles.length} berkas):
                    </span>
                    <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden bg-stone-50/30">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="p-2.5 flex items-center justify-between gap-3 bg-white hover:bg-stone-50">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {file.previewUrl ? (
                              <img 
                                src={file.previewUrl} 
                                alt="Preview" 
                                className="w-9 h-9 rounded-lg object-cover border border-stone-200 shrink-0" 
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs shrink-0 border border-teal-200">
                                PDF
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-stone-800 truncate block">
                                {file.name}
                              </span>
                              <span className="text-[10px] text-stone-400 font-mono">
                                {(file.size / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFile(file.id);
                            }}
                            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hapus berkas ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Existing Payment Receipts History Card */}
              {(selectedSub.buktiPembayaran?.url || (selectedSub.riwayatCicilan && selectedSub.riwayatCicilan.length > 0)) && (
                <div className="bg-stone-50 border border-stone-250 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-stone-600 uppercase tracking-wider flex items-center gap-1.5">
                      <FileCheck size={13} className="text-teal-700" />
                      Bukti Pembayaran yang Pernah Diunggah:
                    </span>
                    {selectedSub.buktiPembayaran?.url && (
                      <a
                        href={selectedSub.buktiPembayaran.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1 underline"
                      >
                        <span>Buka Struk Terakhir</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>

                  {selectedSub.riwayatCicilan && selectedSub.riwayatCicilan.length > 0 && (
                    <div className="text-[10px] font-mono text-stone-500 space-y-1">
                      {selectedSub.riwayatCicilan.map((r, i) => (
                        <div key={r.id || i} className="flex justify-between items-center py-0.5 border-b border-stone-200/50">
                          <span>{r.tanggal || 'Pembayaran'} • {r.keterangan || `Termin ${i+1}`}</span>
                          <span className="font-bold text-stone-800">Rp {formatRupiah(r.nominal)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Buttons & Progress */}
              <div className="pt-2 space-y-2">
                {isLoading && (
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs font-mono text-teal-900 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-ping"></span>
                    <span>{saveProgress || 'Sedang memproses & mengunggah ke Google Drive...'}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition cursor-pointer"
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={isLoading || uploadedFiles.length === 0 || currentPayNominal <= 0}
                    className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider font-mono flex items-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? (
                      <span>Mengunggah...</span>
                    ) : (
                      <>
                        <ShieldCheck size={14} className="text-teal-300" />
                        <span>Simpan &amp; Upload Bukti Pembayaran</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </form>
          )}

        </div>

      </div>
    </div>
  );
};

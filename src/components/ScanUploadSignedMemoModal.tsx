import React, { useState, useRef, useEffect } from 'react';
import { InternalMemo } from '../types';
import {
  X,
  Upload,
  Camera,
  Printer,
  FileText,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  RefreshCw,
  CloudUpload,
  Eye,
  FileCheck,
  Sparkles,
  HelpCircle,
  Loader2,
  Trash2,
  Layers,
} from 'lucide-react';

interface ScanUploadSignedMemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  memo: InternalMemo;
  onSaveSignedDocument: (
    updatedFields: Partial<InternalMemo>,
    fileBlob: Blob,
    fileName: string
  ) => Promise<boolean>;
  onPrintOriginalDocument?: () => void;
}

export const ScanUploadSignedMemoModal: React.FC<ScanUploadSignedMemoModalProps> = ({
  isOpen,
  onClose,
  memo,
  onSaveSignedDocument,
  onPrintOriginalDocument,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'camera' | 'guide'>('upload');
  
  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'pdf' | 'image' | null>(null);
  const [fileBlobToSave, setFileBlobToSave] = useState<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isEnhanceContrast, setIsEnhanceContrast] = useState(true);

  // Form metadata
  const [signedDate, setSignedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [signerNotes, setSignerNotes] = useState<string>(
    memo.signedNotes || 'Telah ditandatangani basah oleh Pejabat Direksi & dibubuhi cap stempel resmi.'
  );
  const [autoUploadDrive, setAutoUploadDrive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Reset or cleanup on open/close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setSelectedFile(null);
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(null);
      setFileBlobToSave(null);
      setErrorMessage('');
    } else {
      if (memo.signedDocumentUrl) {
        setFilePreviewUrl(memo.signedDocumentUrl);
        setFileType(memo.signedDocumentType?.includes('pdf') ? 'pdf' : 'image');
      }
      if (memo.signedAt) {
        setSignedDate(memo.signedAt.split('T')[0]);
      }
    }
  }, [isOpen, memo]);

  // Handle camera start/stop
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Peramban Anda tidak mendukung akses kamera langsung.');
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // Back camera preferred on phones/tablets
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'Gagal mengakses kamera. Pastikan izin kamera telah diizinkan.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab]);

  // Capture snapshot from video stream
  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply rotation if needed
    if (rotationAngle !== 0) {
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotationAngle * Math.PI) / 180);
      ctx.drawImage(video, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Apply document contrast enhancement (make document crisp white & dark text)
    if (isEnhanceContrast) {
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          // Increase contrast and sharpen text
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          // Grayscale luminance
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          // Document thresholding curve
          const enhanced = gray > 140 ? Math.min(255, gray * 1.15) : Math.max(0, gray * 0.85);
          d[i] = (r * 0.3) + (enhanced * 0.7);
          d[i + 1] = (g * 0.3) + (enhanced * 0.7);
          d[i + 2] = (b * 0.3) + (enhanced * 0.7);
        }
        ctx.putImageData(imgData, 0, 0);
      } catch (_) {}
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setFilePreviewUrl(dataUrl);
        setFileType('image');
        setFileBlobToSave(blob);
        setSelectedFile(
          new File([blob], `Scan_Kamera_IM_${memo.nomorMemo || 'Dokumen'}.jpg`, {
            type: 'image/jpeg',
          })
        );
        stopCamera();
      },
      'image/jpeg',
      0.92
    );
  };

  // Handle file select (from local printer scanner folder or file system)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    processSelectedFile(file);
  };

  const processSelectedFile = (file: File) => {
    setSelectedFile(file);
    setFileBlobToSave(file);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setFileType(isPdf ? 'pdf' : 'image');

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setFilePreviewUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  // Save signed document to memo
  const handleSaveDocument = async () => {
    if (!fileBlobToSave && !filePreviewUrl) {
      setErrorMessage('Silakan pilih berkas hasil scan atau ambil foto dokumen terlebih dahulu.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      let blob = fileBlobToSave;
      if (!blob && filePreviewUrl && filePreviewUrl.startsWith('data:')) {
        // Convert data URL to Blob
        const res = await fetch(filePreviewUrl);
        blob = await res.blob();
      }

      if (!blob) {
        throw new Error('Berkas dokumen tidak valid atau kosong.');
      }

      const fileName = selectedFile
        ? selectedFile.name
        : `TTD_SCAN_IM_${(memo.nomorMemo || 'NMSA').replace(/[\/\\?%*:|"<>]/g, '_')}.${fileType === 'pdf' ? 'pdf' : 'jpg'}`;

      const updatedFields: Partial<InternalMemo> = {
        signedDocumentUrl: filePreviewUrl || undefined,
        signedDocumentName: fileName,
        signedDocumentType: fileType === 'pdf' ? 'application/pdf' : 'image/jpeg',
        signedDocumentSize: blob.size,
        signedAt: new Date(signedDate).toISOString(),
        signedNotes: signerNotes,
      };

      const success = await onSaveSignedDocument(updatedFields, blob, fileName);
      if (success) {
        onClose();
      }
    } catch (err: any) {
      console.error('Error saving signed memo:', err);
      setErrorMessage(err.message || 'Gagal menyimpan berkas memo bertanda tangan.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="bg-stone-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-amber-500 text-stone-950 rounded-2xl shrink-0 shadow-md">
              <FileCheck size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black tracking-tight text-white font-sans">
                  Pindai / Upload Memo Bertanda Tangan Basah
                </h3>
                <span className="font-mono text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  {memo.nomorMemo}
                </span>
              </div>
              <p className="text-xs text-stone-300 mt-0.5 truncate">
                Simpan lembar fisik yang telah ditandatangani basah &amp; cap stempel resmi ke Riwayat &amp; Google Drive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer shrink-0 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* STEP 1 HELPER BAR: PRINT BLANK BEFORE SIGNING */}
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-950 font-medium">
            <Printer size={15} className="text-amber-700 shrink-0" />
            <span>Belum mencetak memo ke printer?</span>
          </div>
          {onPrintOriginalDocument && (
            <button
              type="button"
              onClick={onPrintOriginalDocument}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-900 hover:bg-black text-white font-bold rounded-xl text-[11px] shadow-3xs cursor-pointer transition shrink-0"
              title="Kirim dokumen memo ke printer kantor sekarang"
            >
              <Printer size={13} />
              <span>Cetak ke Printer Fisik</span>
            </button>
          )}
        </div>

        {/* TAB CONTROLS */}
        <div className="px-4 sm:px-6 pt-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-white text-stone-900 border-amber-600 shadow-3xs'
                  : 'text-stone-500 hover:text-stone-900 border-transparent'
              }`}
            >
              <Upload size={14} />
              <span>Upload Hasil Scan (PDF / Gambar)</span>
            </button>
            <button
              onClick={() => setActiveTab('camera')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
                activeTab === 'camera'
                  ? 'bg-white text-stone-900 border-amber-600 shadow-3xs'
                  : 'text-stone-500 hover:text-stone-900 border-transparent'
              }`}
            >
              <Camera size={14} />
              <span>Scan Kamera Langsung</span>
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
                activeTab === 'guide'
                  ? 'bg-white text-stone-900 border-amber-600 shadow-3xs'
                  : 'text-stone-500 hover:text-stone-900 border-transparent'
              }`}
            >
              <HelpCircle size={14} />
              <span>Panduan Scanner</span>
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: UPLOAD DARI HASIL SCAN SCANNER / PRINTER */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              {!filePreviewUrl ? (
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-stone-300 hover:border-amber-500 bg-stone-50 hover:bg-amber-50/40 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3"
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-3xs">
                    <Upload size={26} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm font-bold text-stone-850">
                      Klik untuk memilih berkas scan, atau seret &amp; letakkan di sini
                    </p>
                    <p className="text-xs text-stone-500">
                      Mendukung format berkas hasil scan scanner kantor: <strong>PDF, JPG, JPEG, PNG</strong> (hingga 25 MB)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-xs"
                  >
                    Pilih Berkas Scan
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/jpg"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                /* PREVIEW OF SELECTED FILE */
                <div className="border border-stone-200 rounded-2xl p-4 bg-stone-50 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-200 pb-2.5">
                    <div className="flex items-center gap-2">
                      <FileCheck className="text-emerald-600" size={18} />
                      <span className="text-xs font-bold text-stone-900 truncate max-w-xs">
                        {selectedFile?.name || memo.signedDocumentName || 'Berkas Dokumen Bertanda Tangan'}
                      </span>
                      {selectedFile && (
                        <span className="text-[10px] font-mono text-stone-400">
                          ({(selectedFile.size / 1024).toFixed(0)} KB)
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setFilePreviewUrl(null);
                        setFileBlobToSave(null);
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Ganti Berkas</span>
                    </button>
                  </div>

                  {/* PREVIEW CONTAINER */}
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 flex items-center justify-center">
                    {fileType === 'pdf' ? (
                      <div className="w-full text-center py-8 space-y-3">
                        <FileText size={48} className="mx-auto text-rose-600 animate-pulse" />
                        <div>
                          <p className="text-xs font-bold text-stone-800">Dokumen Scan PDF Siap Disimpan</p>
                          <p className="text-[11px] text-stone-500 font-mono mt-0.5">
                            {selectedFile?.name || memo.signedDocumentName}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={filePreviewUrl}
                        alt="Scan Memo Bertanda Tangan"
                        className="max-h-68 w-auto object-contain rounded-lg shadow-3xs"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CAMERA SCANNER (PHOTO DOCUMENT DIRECTLY) */}
          {activeTab === 'camera' && (
            <div className="space-y-3">
              {cameraError ? (
                <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-2">
                  <AlertCircle size={32} className="mx-auto text-rose-600" />
                  <p className="text-xs font-bold text-rose-800">{cameraError}</p>
                  <p className="text-xs text-stone-600">
                    Silakan gunakan tab <strong>"Upload Hasil Scan"</strong> untuk memilih berkas dari scanner atau galeri.
                  </p>
                </div>
              ) : isCameraActive ? (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-72 flex items-center justify-center border border-stone-300">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                      style={{
                        transform: `rotate(${rotationAngle}deg)`,
                        transition: 'transform 0.2s ease',
                      }}
                    />
                    {/* Scanner Framing Overlay */}
                    <div className="absolute inset-4 border-2 border-dashed border-amber-400/80 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                      <span className="text-[10px] font-bold text-amber-300 bg-black/60 px-2 py-0.5 rounded self-start">
                        Arahkan lembar memo ke dalam kotak ini
                      </span>
                      <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded self-end">
                        Pastikan tanda tangan &amp; stempel terbaca jelas
                      </span>
                    </div>
                  </div>

                  {/* Camera Controls */}
                  <div className="flex items-center justify-between gap-2 flex-wrap bg-stone-50 p-3 rounded-2xl border border-stone-200">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRotationAngle((prev) => (prev + 90) % 360)}
                        className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        title="Putar orientasi 90 derajat"
                      >
                        <RotateCw size={13} />
                        <span>Putar ({rotationAngle}&deg;)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEnhanceContrast(!isEnhanceContrast)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                          isEnhanceContrast
                            ? 'bg-amber-500 text-stone-950 font-black shadow-3xs'
                            : 'bg-stone-200 text-stone-700'
                        }`}
                        title="Tingkatkan kontras agar teks & stempel tajam"
                      >
                        <Sparkles size={13} />
                        <span>Filter Dokumen</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleCaptureSnapshot}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      <Camera size={16} />
                      <span>Ambil Foto Dokumen</span>
                    </button>
                  </div>
                </div>
              ) : filePreviewUrl ? (
                /* Captured Photo Preview */
                <div className="border border-stone-200 rounded-2xl p-4 bg-stone-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      Foto dokumen berhasil diambil
                    </span>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="text-xs text-amber-800 hover:text-amber-950 font-bold flex items-center gap-1 cursor-pointer underline"
                    >
                      <RefreshCw size={13} />
                      <span>Foto Ulang</span>
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 flex items-center justify-center">
                    <img
                      src={filePreviewUrl}
                      alt="Hasil Scan Kamera"
                      className="max-h-68 w-auto object-contain rounded-lg shadow-3xs"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 3: SCANNER GUIDE */}
          {activeTab === 'guide' && (
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3 text-xs text-stone-700">
              <h4 className="font-bold text-stone-900 flex items-center gap-1.5">
                <Printer size={15} className="text-amber-600" />
                Cara Scan dari Printer / Mesin Scanner Kantor ke Aplikasi:
              </h4>
              <ol className="list-decimal list-inside space-y-2 leading-relaxed text-stone-600">
                <li>
                  <strong>Cetak memo terlebih dahulu:</strong> Gunakan tombol <em>"Cetak ke Printer Fisik"</em> di bagian atas untuk mencetak lembar A4 ke printer kantor Anda.
                </li>
                <li>
                  <strong>Tanda tangan basah &amp; cap stempel:</strong> Mintakan tanda tangan asli dari Pejabat yang tertera di dokumen (Direktur &amp; Direktur Keuangan).
                </li>
                <li>
                  <strong>Letakkan di mesin scanner:</strong> Masukkan lembar kertas ke Flatbed atau ADF scanner printer (Canon, Epson, HP, Brother, Ricoh, dll).
                </li>
                <li>
                  <strong>Buka program scan bawaan printer di komputer:</strong>
                  <ul className="list-disc list-inside pl-4 pt-1 space-y-0.5 text-stone-500">
                    <li>Canon: Canon IJ Scan Utility (Pilih format PDF atau Auto)</li>
                    <li>Epson: Epson Scan 2 / Epson Document Capture</li>
                    <li>HP: HP Smart / HP Scan</li>
                    <li>Windows umum: Tekan Windows Key &gt; ketik <em>"Windows Fax and Scan"</em></li>
                  </ul>
                </li>
                <li>
                  <strong>Upload hasil scan ke sini:</strong> Buka tab <strong>"Upload Hasil Scan"</strong> di modal ini, lalu pilih berkas PDF/JPG hasil scan tadi.
                </li>
                <li>
                  Sistem otomatis menyimpan berkas ke <strong>Google Drive</strong> dan riwayat database aplikasi!
                </li>
              </ol>
            </div>
          )}

          {/* FORM METADATA & SETTINGS */}
          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">
                  Tanggal Dokumen Fisik Ditandatangani:
                </label>
                <input
                  type="date"
                  value={signedDate}
                  onChange={(e) => setSignedDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">
                  Keterangan / Status Penandatanganan:
                </label>
                <input
                  type="text"
                  value={signerNotes}
                  onChange={(e) => setSignerNotes(e.target.value)}
                  placeholder="Contoh: Ditandatangani basah Direktur Utama & Direktur Keuangan"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Google Drive automatic backup toggle */}
            <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoUploadDrive}
                  onChange={(e) => setAutoUploadDrive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-stone-850 flex items-center gap-1.5">
                  <CloudUpload size={14} className="text-emerald-600" />
                  Cadangkan Berkas Scan ke Google Drive Resmi (INTERNAL-MEMO-NMSA)
                </span>
              </label>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">
                Otomatis
              </span>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="bg-white border-t border-stone-200 p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSaveDocument}
            disabled={isSaving || (!filePreviewUrl && !fileBlobToSave)}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer"
          >
            {isSaving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CloudUpload size={15} />
            )}
            <span>
              {isSaving
                ? 'Menyimpan & Mengunggah ke Drive...'
                : 'Simpan Berkas Memo Bertanda Tangan'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

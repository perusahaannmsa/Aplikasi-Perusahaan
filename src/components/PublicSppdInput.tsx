import React, { useState, useEffect, useRef } from 'react';
import { NusantaraLogo } from './NusantaraLogo';
import { PrintSppdDocument, terbilangRupiah } from './PrintSppdDocument';
import { SPPDRecord, SPPDCostItem, SPPDCostAttachment } from './SppdManager';
import { JabatanDinas } from '../data/pedomanBiaya';
import { 
  saveSppdRecordsToFirestore, 
  loadSppdRecordsFromFirestore 
} from '../firebase';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Save, 
  Calendar, 
  MapPin, 
  User, 
  Briefcase, 
  CheckCircle2, 
  Printer, 
  Copy, 
  Check, 
  ArrowLeft,
  ShieldCheck,
  Building,
  Navigation,
  UploadCloud,
  FileCheck,
  Eye,
  X,
  Loader2,
  Paperclip,
  Download,
  AlertCircle
} from 'lucide-react';
import { formatDateIndonesian } from '../utils';
import { convertImagesToMergedPdf } from '../utils/imageToPdf';

interface PublicSppdInputProps {
  onBackToHome?: () => void;
}

export const PublicSppdInput: React.FC<PublicSppdInputProps> = ({ onBackToHome }) => {
  const [pemberiPerintah, setPemberiPerintah] = useState('H. A. Nursyam Halid');
  const [pemberiPerintahJabatan, setPemberiPerintahJabatan] = useState('Direktur Utama');
  const [namaPekerja, setNamaPekerja] = useState('');
  const [jabatan, setJabatan] = useState<JabatanDinas>('Staff');
  const [divisi, setDivisi] = useState('Operasional Lapangan');
  const [kotaAsal, setKotaAsal] = useState('Jakarta (HO)');
  const [kotaTujuan, setKotaTujuan] = useState('');
  const [transportasi, setTransportasi] = useState('Pesawat Komersial');
  const [lamaPerjalanan, setLamaPerjalanan] = useState('3 Hari 2 Malam');
  
  const todayStr = new Date().toISOString().split('T')[0];
  const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [tanggalMulai, setTanggalMulai] = useState(todayStr);
  const [tanggalSelesai, setTanggalSelesai] = useState(threeDaysLater);
  const [tujuanPerjalanan, setTujuanPerjalanan] = useState('');
  const [keteranganSppd, setKeteranganSppd] = useState('');

  const [noSppd, setNoSppd] = useState(() => {
    const monthRoman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][new Date().getMonth()];
    const year = new Date().getFullYear();
    const rand = Math.floor(100 + Math.random() * 900);
    return `SPPD-NMSA/${monthRoman}/${year}/${rand}`;
  });

  const [costItems, setCostItems] = useState<SPPDCostItem[]>([]);
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null);
  const [convertingProgress, setConvertingProgress] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<SPPDRecord | null>(null);
  const [showPrintView, setShowPrintView] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // PDF Preview Modal State
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfTitle, setPreviewPdfTitle] = useState<string>('');

  // Initial standard cost categories with clean empty nominals (No reference rates shown to employee)
  const initializeStandardCategories = () => {
    let days = 3;
    try {
      const d1 = new Date(tanggalMulai).getTime();
      const d2 = new Date(tanggalSelesai).getTime();
      const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0 && diff < 60) days = diff;
    } catch {}

    const items: SPPDCostItem[] = [
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Uang Makan Harian',
        rincian: `${days} Hari (Lampirkan nota/kwitansi konsumsi)`,
        jumlah: 0,
      },
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Uang Saku Per Hari',
        rincian: `${days} Hari Dinas Lapangan`,
        jumlah: 0,
      },
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Transportasi Lokal (JKT & PP)',
        rincian: 'Transportasi ke/dari Bandara (Lampirkan bukti tiket/taksi)',
        jumlah: 0,
      },
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Tiket Transportasi (Pesawat/KA)',
        rincian: `Tiket PP (${kotaAsal || 'Jakarta'} - ${kotaTujuan || 'Site/Tujuan'})`,
        jumlah: 0,
      },
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Akomodasi & Hotel Penginapan',
        rincian: `${Math.max(1, days - 1)} Malam (Lampirkan billing/kwitansi hotel)`,
        jumlah: 0,
      }
    ];

    setCostItems(items);
  };

  useEffect(() => {
    initializeStandardCategories();
  }, []);

  const handleCostItemChange = (index: number, field: keyof SPPDCostItem, value: any) => {
    const updated = [...costItems];
    updated[index] = { ...updated[index], [field]: value };
    setCostItems(updated);
  };

  const handleAddCostItem = () => {
    setCostItems([
      ...costItems,
      {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        kategori: 'Biaya Lainnya / Operasional Lapangan',
        rincian: 'Lampirkan bukti/bon pengeluaran',
        jumlah: 0
      }
    ]);
  };

  const handleRemoveCostItem = (index: number) => {
    setCostItems(costItems.filter((_, i) => i !== index));
  };

  // Convert uploaded images to multi-page PDF for specific cost category
  const handleFileUpload = async (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);

    const targetCategory = costItems[index]?.kategori || `Biaya_${index + 1}`;
    setConvertingIndex(index);
    setConvertingProgress(`Mengonversi ${fileArray.length} berkas bukti ke 1 PDF...`);

    try {
      const result = await convertImagesToMergedPdf(fileArray, targetCategory, noSppd);
      
      const attachment: SPPDCostAttachment = {
        name: result.fileName,
        url: result.pdfDataUrl,
        pageCount: result.pageCount,
        sizeBytes: result.sizeBytes,
        uploadedAt: new Date().toISOString(),
        sourceImagesCount: fileArray.length
      };

      const updated = [...costItems];
      updated[index] = {
        ...updated[index],
        attachment
      };
      setCostItems(updated);
    } catch (err: any) {
      alert(`Gagal memproses berkas bukti: ${err.message || String(err)}`);
    } finally {
      setConvertingIndex(null);
      setConvertingProgress('');
    }
  };

  const handleRemoveAttachment = (index: number) => {
    const updated = [...costItems];
    delete updated[index].attachment;
    setCostItems(updated);
  };

  const totalCost = costItems.reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!namaPekerja.trim()) {
      setErrorMessage('Mohon lengkapi Nama Pegawai yang melaksanakan dinas.');
      return;
    }
    if (!kotaTujuan.trim()) {
      setErrorMessage('Mohon tentukan Kota / Lokasi Tujuan Perjalanan Dinas.');
      return;
    }
    if (!tujuanPerjalanan.trim()) {
      setErrorMessage('Mohon jelaskan Maksud & Tujuan Perjalanan Dinas.');
      return;
    }

    setIsSubmitting(true);

    // Collect all attached PDFs across cost items
    const attachedFiles = costItems
      .filter(c => c.attachment && c.attachment.url)
      .map(c => ({
        url: c.attachment!.url,
        name: c.attachment!.name,
        pageCount: c.attachment!.pageCount,
        category: c.kategori,
        sizeBytes: c.attachment!.sizeBytes
      }));

    const newRecord: SPPDRecord = {
      id: 'sppd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      noSppd: noSppd.trim() || `SPPD-NMSA/2026/${Math.floor(100 + Math.random() * 900)}`,
      hariTanggal: formatDateIndonesian(tanggalMulai),
      pemberiPerintah,
      pemberiPerintahJabatan,
      namaPekerja: namaPekerja.trim(),
      jabatan,
      divisi,
      kotaAsal,
      kotaTujuan: kotaTujuan.trim(),
      transportasi,
      lamaPerjalanan,
      tanggalMulai,
      tanggalSelesai,
      tujuanPerjalanan: tujuanPerjalanan.trim(),
      keteranganSppd: keteranganSppd.trim(),
      costItems,
      attachedFiles,
      pemberiPerintahName: pemberiPerintah,
      sppdDisetujuiName: 'Harijon',
      sppdDisetujuiJabatan: 'Head of Operational',
      status: 'Disetujui',
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Simpan ke server backend via /api/sppd
      await fetch('/api/sppd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: newRecord })
      }).catch(err => console.warn('Gagal simpan ke /api/sppd:', err));

      // 2. Simpan ke Firestore
      await saveSppdRecordsToFirestore([newRecord]).catch(err => console.warn('Firestore err:', err));

      // 3. Simpan ke local storage
      try {
        const stored = localStorage.getItem('sppd_records_v1');
        const list: SPPDRecord[] = stored ? JSON.parse(stored) : [];
        const filtered = list.filter(r => r.id !== newRecord.id && r.noSppd !== newRecord.noSppd);
        filtered.unshift(newRecord);
        localStorage.setItem('sppd_records_v1', JSON.stringify(filtered));
      } catch (err) {}

      setSubmittedRecord(newRecord);
    } catch (err: any) {
      setErrorMessage('Terjadi kendala saat menyimpan SPPD: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  // IF USER CLICKED PRINT/PREVIEW OF THE SUBMITTED SPPD
  if (showPrintView && submittedRecord) {
    return (
      <div className="min-h-screen bg-stone-100 py-6 px-3 sm:px-6">
        <PrintSppdDocument
          sppd={submittedRecord}
          onBack={() => setShowPrintView(false)}
          isPublicView={true}
        />
      </div>
    );
  }

  // SUCCESS CONFIRMATION SCREEN
  if (submittedRecord) {
    const attachedCount = (submittedRecord.attachedFiles || []).length;

    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-2xl w-full bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-6 animate-fade-in">
          
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 size={36} />
          </div>

          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Pengajuan SPPD Berhasil Dikirim ke Server
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 mt-3 font-display">
              Surat Perintah Perjalanan Dinas Resmi Dibuat!
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 mt-1.5 font-sans">
              Nomor: <strong className="font-mono text-stone-900">{submittedRecord.noSppd}</strong> &bull; Pegawai: <strong>{submittedRecord.namaPekerja}</strong>
            </p>
          </div>

          {/* RINGKASAN DATA */}
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-left text-xs font-sans space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Rute Dinas</span>
                <span className="font-bold text-stone-900">{submittedRecord.kotaAsal} &rarr; {submittedRecord.kotaTujuan}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Waktu Pelaksanaan</span>
                <span className="font-semibold text-stone-800">{submittedRecord.tanggalMulai} s.d {submittedRecord.tanggalSelesai}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Jabatan / Divisi</span>
                <span className="font-semibold text-stone-800">{submittedRecord.jabatan} ({submittedRecord.divisi})</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Total Pengeluaran SPPD</span>
                <span className="font-black font-mono text-amber-700">Rp {(submittedRecord.costItems || []).reduce((a, c) => a + (c.jumlah || 0), 0).toLocaleString('id-ID')}</span>
              </div>
            </div>
            
            <div className="pt-2 border-t border-stone-200">
              <span className="text-stone-400 block text-[10px] uppercase font-bold">Maksud Perjalanan Dinas:</span>
              <p className="text-stone-800 italic mt-0.5">{submittedRecord.tujuanPerjalanan}</p>
            </div>

            {/* ATTACHED PDF RECEIPTS SUMMARY */}
            {attachedCount > 0 && (
              <div className="pt-2 border-t border-stone-200 space-y-1.5">
                <span className="text-[10px] text-stone-400 uppercase font-bold flex items-center gap-1">
                  <FileCheck size={12} className="text-emerald-600" />
                  <span>Lampiran Bukti Transaksi PDF Terkirim ({attachedCount} Kategori):</span>
                </span>
                <div className="space-y-1">
                  {(submittedRecord.attachedFiles || []).map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-white border border-stone-200 rounded-xl text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="p-1 bg-rose-50 text-rose-600 rounded-md font-mono text-[10px] font-bold">PDF</span>
                        <span className="font-semibold text-stone-800 truncate">{file.category || file.name}</span>
                        <span className="text-[10px] text-stone-400 font-mono">({file.pageCount || 1} Halaman)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPdfUrl(file.url);
                          setPreviewPdfTitle(`Bukti: ${file.category || file.name}`);
                        }}
                        className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Eye size={12} />
                        <span>Lihat PDF</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowPrintView(true)}
              className="w-full sm:w-auto px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer size={16} />
              <span>Pratinjau &amp; Cetak SPPD Resmi</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSubmittedRecord(null);
                setNamaPekerja('');
                setKotaTujuan('');
                setTujuanPerjalanan('');
                setKeteranganSppd('');
                const monthRoman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][new Date().getMonth()];
                const year = new Date().getFullYear();
                const rand = Math.floor(100 + Math.random() * 900);
                setNoSppd(`SPPD-NMSA/${monthRoman}/${year}/${rand}`);
                initializeStandardCategories();
              }}
              className="w-full sm:w-auto px-5 py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={15} />
              <span>Input SPPD Baru Lainnya</span>
            </button>
          </div>

          {onBackToHome && (
            <div className="pt-3 border-t border-stone-150">
              <button
                type="button"
                onClick={onBackToHome}
                className="text-xs text-stone-500 hover:text-stone-800 font-bold underline cursor-pointer"
              >
                Kembali ke Aplikasi Utama
              </button>
            </div>
          )}

        </div>

        {/* PDF PREVIEW MODAL */}
        {previewPdfUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/75 backdrop-blur-xs animate-in fade-in">
            <div className="relative w-full max-w-4xl h-[85vh] bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-3.5 bg-stone-900 text-white border-b border-stone-800 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-amber-400" />
                  <span className="font-bold text-xs sm:text-sm">{previewPdfTitle || 'Pratinjau Dokumen Bukti PDF'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={previewPdfUrl}
                    download={`${previewPdfTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`}
                    className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition"
                    title="Unduh PDF"
                  >
                    <Download size={16} />
                  </a>
                  <button
                    onClick={() => setPreviewPdfUrl(null)}
                    className="p-1.5 hover:bg-stone-800 text-stone-400 hover:text-white rounded-lg transition cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-stone-200">
                <iframe
                  src={previewPdfUrl}
                  className="w-full h-full border-none"
                  title="PDF Viewer"
                />
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // MAIN FORM INPUT
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col antialiased">
      
      {/* HEADER PORTAL */}
      <header className="bg-stone-900 text-white border-b border-stone-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <NusantaraLogo size="sm" className="h-10 w-auto object-contain" />
            <div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-amber-400 font-bold block">
                Portal Pengisian Mandiri SPPD
              </span>
              <h1 className="text-xs sm:text-sm font-black tracking-tight">
                PT. Nusantara Mineral Sukses Abadi
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer border border-stone-700"
              title="Salin Tautan Formulir Ini"
            >
              {isCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{isCopied ? 'Tersalin' : 'Bagikan Link'}</span>
            </button>

            {onBackToHome && (
              <button
                type="button"
                onClick={onBackToHome}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-3xs"
              >
                <ArrowLeft size={13} />
                <span>Masuk Admin HO</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* FORM CONTENT CONTAINER */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* HERO CARD INFO */}
        <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
                Formulir Mandiri Karyawan
              </span>
              <span className="text-stone-400 text-xs font-mono">&bull; PT Nusantara Mineral Sukses Abadi</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-stone-900 font-display">
              Surat Perintah Perjalanan Dinas (SPPD) &amp; Bukti Bon
            </h2>
            <p className="text-xs text-stone-500 leading-relaxed font-sans max-w-2xl">
              Silakan lengkapi data penugasan dinas, rincian biaya aktual yang Anda keluarkan, dan lampirkan foto bon/kwitansi pendukung untuk setiap kategori. Sistem akan secara otomatis menggabungkan seluruh foto bon Anda menjadi berkas PDF resmi untuk diproses menjadi Voucher Pengeluaran oleh Kantor Pusat (HO).
            </p>
          </div>
          
          <div className="bg-stone-50 border border-stone-200 p-3 rounded-2xl text-xs font-mono text-stone-600 text-right shrink-0">
            <span className="block text-[10px] text-stone-400 uppercase font-bold">Kantor Pusat (HO):</span>
            <span className="font-semibold text-stone-800 text-[11px] block mt-0.5">Jl. Raya Pasar Minggu Kav. 2B-C</span>
            <span className="text-[10px] text-stone-500 block">Pancoran, Jakarta Selatan 12780</span>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs font-bold text-rose-800 flex items-center gap-2 animate-fade-in">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* MAIN FORM */}
        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-8 shadow-sm space-y-6">
          
          {/* SECTION 1: NOMOR & PEJABAT PEMBERI PERINTAH */}
          <div className="border-b border-stone-150 pb-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono mb-4 flex items-center gap-2">
              <ShieldCheck size={16} />
              <span>I. Data Surat &amp; Pejabat Pemberi Perintah</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Nomor SPPD Resmi
                </label>
                <input
                  type="text"
                  value={noSppd}
                  onChange={(e) => setNoSppd(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono font-bold text-stone-900 bg-stone-50 focus:bg-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Pejabat Pemberi Perintah
                </label>
                <input
                  type="text"
                  value={pemberiPerintah}
                  onChange={(e) => setPemberiPerintah(e.target.value)}
                  placeholder="H. A. Nursyam Halid"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Jabatan Pejabat Pemberi Perintah
                </label>
                <input
                  type="text"
                  value={pemberiPerintahJabatan}
                  onChange={(e) => setPemberiPerintahJabatan(e.target.value)}
                  placeholder="Direktur Utama"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: IDENTITAS PEGAWAI YANG DIPERINTAHKAN */}
          <div className="border-b border-stone-150 pb-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono mb-4 flex items-center gap-2">
              <User size={16} />
              <span>II. Identitas Pegawai yang Melaksanakan Tugas</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Nama Lengkap Pegawai <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={namaPekerja}
                  onChange={(e) => setNamaPekerja(e.target.value)}
                  placeholder="Contoh: Nur Wahyudi"
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Jabatan Dinas
                </label>
                <select
                  value={jabatan}
                  onChange={(e) => setJabatan(e.target.value as JabatanDinas)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-semibold text-stone-900 bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Direktur">Direktur</option>
                  <option value="General Manager">General Manager</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Staff">Staff</option>
                  <option value="Non Staff / Driver / Helper">Non Staff / Driver / Helper</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Divisi / Unit Kerja
                </label>
                <input
                  type="text"
                  value={divisi}
                  onChange={(e) => setDivisi(e.target.value)}
                  placeholder="Contoh: Operasional Lapangan / Finance"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: DETAIL RUTE, TANGGAL & MAKSUD DINAS */}
          <div className="border-b border-stone-150 pb-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono mb-4 flex items-center gap-2">
              <Navigation size={16} />
              <span>III. Rute, Waktu, &amp; Maksud Perjalanan Dinas</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Kota Asal (Tempat Berangkat)
                </label>
                <input
                  type="text"
                  value={kotaAsal}
                  onChange={(e) => setKotaAsal(e.target.value)}
                  placeholder="Jakarta (HO)"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Kota / Site Tujuan Dinas <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={kotaTujuan}
                  onChange={(e) => setKotaTujuan(e.target.value)}
                  placeholder="Contoh: Site Kolaka / Kendari"
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Alat Angkut / Transportasi
                </label>
                <input
                  type="text"
                  value={transportasi}
                  onChange={(e) => setTransportasi(e.target.value)}
                  placeholder="Pesawat + Mobil Double Cabin"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Lamanya Perjalanan
                </label>
                <input
                  type="text"
                  value={lamaPerjalanan}
                  onChange={(e) => setLamaPerjalanan(e.target.value)}
                  placeholder="3 Hari 2 Malam"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Tanggal Berangkat
                </label>
                <input
                  type="date"
                  value={tanggalMulai}
                  onChange={(e) => setTanggalMulai(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Tanggal Harus Kembali
                </label>
                <input
                  type="date"
                  value={tanggalSelesai}
                  onChange={(e) => setTanggalSelesai(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Maksud &amp; Tujuan Perjalanan Dinas <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={tujuanPerjalanan}
                  onChange={(e) => setTujuanPerjalanan(e.target.value)}
                  placeholder="Contoh: Pengawasan operasional lapangan, verifikasi aset tambang mineral, dan rekonsiliasi site."
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Keterangan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  value={keteranganSppd}
                  onChange={(e) => setKeteranganSppd(e.target.value)}
                  placeholder="Contoh: Bon dan kwitansi telah diunggah lengkap pada setiap pos biaya."
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: RINCIAN BIAYA RIIL & UPLOAD BUKTI BON (AUTO PDF MERGE) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono flex items-center gap-2">
                  <FileText size={16} />
                  <span>IV. Rincian Pengeluaran Riil &amp; Upload Bukti Transaksi (Bon)</span>
                </h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Isi nominal riil yang Anda gunakan dan upload foto kwitansi/bon pada masing-masing kategori. Foto akan otomatis dikonversi &amp; digabungkan menjadi PDF.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddCostItem}
                className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl border border-stone-200 transition flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus size={13} />
                <span>Tambah Kategori</span>
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {costItems.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl text-xs space-y-3 hover:border-amber-300 transition"
                >
                  {/* ROW 1: INPUT FIELDS */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                    <div className="sm:col-span-4">
                      <label className="text-[10px] font-bold text-stone-400 block uppercase">
                        {idx + 1}. Kategori Pengeluaran
                      </label>
                      <input
                        type="text"
                        value={item.kategori}
                        onChange={(e) => handleCostItemChange(idx, 'kategori', e.target.value)}
                        className="w-full px-2.5 py-2 border border-stone-200 rounded-xl font-bold text-stone-900 bg-white focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="text-[10px] font-bold text-stone-400 block uppercase">
                        Rincian / Keterangan Bon
                      </label>
                      <input
                        type="text"
                        value={item.rincian}
                        onChange={(e) => handleCostItemChange(idx, 'rincian', e.target.value)}
                        placeholder="Contoh: 3 Hari makan / Nota warung"
                        className="w-full px-2.5 py-2 border border-stone-200 rounded-xl text-stone-800 bg-white focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="text-[10px] font-bold text-stone-400 block uppercase">
                        Nominal Riil (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={item.jumlah === 0 ? '' : item.jumlah}
                        onChange={(e) => handleCostItemChange(idx, 'jumlah', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-2.5 py-2 border border-stone-300 rounded-xl font-mono font-black text-stone-900 bg-white text-right focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="sm:col-span-1 text-center pt-2 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveCostItem(idx)}
                        className="p-2 text-stone-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition cursor-pointer"
                        title="Hapus Baris Kategori"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* ROW 2: PROOF UPLOAD & AUTO PDF CONVERSION */}
                  <div className="pt-2 border-t border-stone-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    
                    <div className="flex-1 w-full">
                      {convertingIndex === idx ? (
                        <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-bold">
                          <Loader2 size={15} className="animate-spin text-amber-600" />
                          <span>{convertingProgress || 'Mengonversi gambar menjadi PDF...'}</span>
                        </div>
                      ) : item.attachment ? (
                        <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs gap-2">
                          <div className="flex items-center gap-2 truncate">
                            <span className="px-1.5 py-0.5 bg-rose-600 text-white font-mono text-[10px] font-black rounded">
                              PDF
                            </span>
                            <span className="font-bold text-emerald-950 truncate max-w-[200px] sm:max-w-xs">
                              {item.attachment.name}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">
                              {item.attachment.pageCount} Halaman ({item.attachment.sourceImagesCount || item.attachment.pageCount} Foto)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewPdfUrl(item.attachment!.url);
                                setPreviewPdfTitle(`Bukti Transaksi: ${item.kategori}`);
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-emerald-300 text-emerald-900 rounded-lg font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                              title="Pratinjau Dokumen PDF"
                            >
                              <Eye size={12} />
                              <span>Lihat PDF</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-100/60 rounded-lg transition cursor-pointer"
                              title="Hapus Bukti Bon"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs text-stone-500">
                          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-stone-100 border border-dashed border-stone-300 hover:border-amber-500 text-stone-700 rounded-xl font-bold cursor-pointer transition shadow-3xs">
                            <UploadCloud size={14} className="text-amber-600" />
                            <span>Upload Foto Bon / Kwitansi (Bisa Banyak Gambar)</span>
                            <input
                              type="file"
                              multiple
                              accept="image/*,application/pdf"
                              onChange={(e) => handleFileUpload(idx, e.target.files)}
                              className="hidden"
                            />
                          </label>
                          <span className="text-[10px] text-stone-400 italic">
                            *Jika upload 10 gambar foto bon, otomatis digabung menjadi 1 file PDF (10 halaman).
                          </span>
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              ))}
            </div>

            {/* TOTAL REAL EXPENDITURE */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-black uppercase text-amber-900 block">
                  TOTAL KLAIM PENGELUARAN DINAS RIIL:
                </span>
                <span className="text-xs text-amber-800 italic font-medium">
                  Terbilang: &quot;{terbilangRupiah(totalCost)}&quot;
                </span>
              </div>

              <div className="text-right">
                <span className="text-2xl font-black font-mono text-amber-950">
                  Rp {totalCost.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-stone-500 flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
              <span>Data pengeluaran beserta seluruh lampiran PDF bon akan langsung terkirim ke Server HO untuk dibuatkan Voucher Pengeluaran.</span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || convertingIndex !== null}
              className="w-full sm:w-auto px-8 py-3.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-400 text-white text-xs font-black rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Mengirim SPPD &amp; Lampiran...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Kirim SPPD &amp; Lampiran Bukti ke Server HO</span>
                </>
              )}
            </button>
          </div>

        </form>

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-stone-200 py-5 text-center text-xs font-mono text-stone-500">
        PT. Nusantara Mineral Sukses Abadi &bull; Jl. Raya Pasar Minggu Kav. 2B-C, RT.2/RW.2, Pancoran, Jakarta Selatan 12780
      </footer>

      {/* PDF PREVIEW MODAL */}
      {previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/75 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-4xl h-[85vh] bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-3.5 bg-stone-900 text-white border-b border-stone-800 shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-amber-400" />
                <span className="font-bold text-xs sm:text-sm">{previewPdfTitle || 'Pratinjau Dokumen Bukti PDF'}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewPdfUrl}
                  download={`${previewPdfTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`}
                  className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition"
                  title="Unduh PDF"
                >
                  <Download size={16} />
                </a>
                <button
                  onClick={() => setPreviewPdfUrl(null)}
                  className="p-1.5 hover:bg-stone-800 text-stone-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-stone-200">
              <iframe
                src={previewPdfUrl}
                className="w-full h-full border-none"
                title="PDF Viewer"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

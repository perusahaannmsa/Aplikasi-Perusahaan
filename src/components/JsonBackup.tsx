import React, { useState } from 'react';
import { Submission } from '../types';
import { Download, Upload, AlertCircle, CheckCircle2, ChevronRight, ChevronDown, FileArchive, X } from 'lucide-react';
import JSZip from 'jszip';

interface JsonBackupProps {
  submissions: Submission[];
  onImport: (importedData: Submission[]) => void;
  isOpen?: boolean;
  onClose?: () => void;
  isModal?: boolean;
}

export const JsonBackup: React.FC<JsonBackupProps> = ({ 
  submissions, 
  onImport,
  isOpen: modalIsOpen,
  onClose,
  isModal = false
}) => {
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [errorLog, setErrorLog] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Handle Export to JSON file
  const handleExportJson = () => {
    try {
      if (submissions.length === 0) {
        setErrorLog('Tidak ada data transaksi untuk diekspor.');
        return;
      }
      const dataStr = JSON.stringify(submissions, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `Backup_Data_Nusantara_HO_${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      setErrorLog('');
      setSuccessMsg(`Berhasil mengekspor ${submissions.length} data ke file JSON!`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e: any) {
      console.error(e);
      setErrorLog(`Gagal mengekspor data ke JSON: ${e.message}`);
    }
  };

  // Handle Export to ZIP file containing individual voucher files
  const handleExportZip = async () => {
    try {
      if (submissions.length === 0) {
        setErrorLog('Tidak ada data transaksi untuk dimasukkan ke file ZIP.');
        return;
      }
      const zip = new JSZip();
      
      // Add a meta file explaining the backup contents
      const metaInfo = {
        exportedAt: new Date().toISOString(),
        totalVouchers: submissions.length,
        systemName: "Nusantara Mineral HO Portal Backup"
      };
      zip.file('index_meta.json', JSON.stringify(metaInfo, null, 2));

      // Package each voucher inside submissions folder
      submissions.forEach((sub) => {
        const cleanName = sub.dibayarkanKepada.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        zip.file(`submissions/${sub.id}_${cleanName}.json`, JSON.stringify(sub, null, 2));
      });

      // Construct ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      
      const exportFileDefaultName = `Backup_Data_Nusantara_HO_${new Date().toISOString().split('T')[0]}.zip`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', downloadUrl);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      setErrorLog('');
      setSuccessMsg(`Berhasil mengekspor ${submissions.length} data ke file ZIP (Satu file per voucher)!`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e: any) {
      console.error(e);
      setErrorLog(`Gagal mengekspor data ke ZIP: ${e.message}`);
    }
  };

  // Process and validate imported JSON array string
  const processImport = (rawString: string) => {
    try {
      if (!rawString.trim()) {
        setErrorLog('Kolom input Masukkan JSON masih kosong.');
        return;
      }

      const parsed = JSON.parse(rawString);
      
      const finalItems: Submission[] = Array.isArray(parsed) ? parsed : [parsed];

      // Verification of properties
      if (finalItems.length > 0) {
        const item = finalItems[0];
        const requiredFields = ['id', 'lokasi', 'tanggal', 'jenisPengajuan', 'dibayarkanKepada', 'items'];
        const missingFields = requiredFields.filter(f => !(f in item));
        
        if (missingFields.length > 0) {
          setErrorLog(`Format skema tidak valid. Kolom wajib yang hilang: ${missingFields.join(', ')}`);
          return;
        }
      }

      onImport(finalItems);
      setSuccessMsg(`Berhasil mengimpor ${finalItems.length} riwayat data transaksi!`);
      setPasteData('');
      setErrorLog('');
      
      setTimeout(() => {
        setSuccessMsg('');
      }, 4000);
    } catch (err: any) {
      setErrorLog(`JSON tidak valid secara sintaks: ${err.message}`);
    }
  };

  // Handle File Upload Select (detects .json or .zip archive)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorLog('');
    setSuccessMsg('');

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file);
        const parsedSubmissions: Submission[] = [];
        
        const promises: Promise<void>[] = [];
        zip.forEach((relativePath, fileInfo) => {
          if (!fileInfo.dir && relativePath.startsWith('submissions/') && relativePath.endsWith('.json')) {
            const fileReaderPromise = fileInfo.async('text').then((content) => {
              try {
                const parsed = JSON.parse(content);
                // Validate fields are present before accepting
                if (parsed.id && parsed.lokasi && parsed.tanggal && parsed.items) {
                  parsedSubmissions.push(parsed);
                }
              } catch (err) {
                console.warn(`Gagal parse file JSON di dalam zip: ${relativePath}`, err);
              }
            });
            promises.push(fileReaderPromise);
          }
        });

        await Promise.all(promises);

        if (parsedSubmissions.length === 0) {
          setErrorLog('Tidak ditemukan data voucher JSON yang valid di dalam zip (harus di folder "submissions/").');
          return;
        }

        onImport(parsedSubmissions);
        setSuccessMsg(`Berhasil memulihkan ${parsedSubmissions.length} riwayat transaksi dari file ZIP!`);
        setTimeout(() => setSuccessMsg(''), 4000);
      } catch (err: any) {
        setErrorLog(`Gagal membaca atau unpack file ZIP: ${err.message}`);
      }
    } else {
      // Treat as standard JSON file
      const fileReader = new FileReader();
      fileReader.readAsText(file, "UTF-8");
      fileReader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          processImport(event.target.result);
        }
      };
    }
  };

  const contentBody = (
    <div className="space-y-4 font-sans">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Export JSON */}
        <button
          onClick={handleExportJson}
          className="flex items-center justify-center gap-2 border border-stone-300 hover:bg-stone-50 text-stone-700 font-semibold py-2.5 px-4 rounded-xl text-sm transition cursor-pointer"
        >
          <Download size={16} className="text-amber-600" />
          Ekspor ke file JSON (.json)
        </button>

        {/* Export ZIP */}
        <button
          onClick={handleExportZip}
          className="flex items-center justify-center gap-2 border border-stone-300 hover:bg-stone-50 text-stone-700 font-semibold py-2.5 px-4 rounded-xl text-sm transition cursor-pointer"
        >
          <FileArchive size={16} className="text-cyan-600" />
          Ekspor ke berkas ZIP (.zip)
        </button>

        {/* Upload Selector */}
        <label className="flex items-center justify-center gap-2 border border-stone-300 hover:bg-stone-50 text-stone-700 font-semibold py-2.5 px-4 rounded-xl text-sm transition cursor-pointer text-center">
          <Upload size={16} className="text-stone-500" />
          Pulihkan (.json / .zip)
          <input
            type="file"
            accept=".json,.zip"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      </div>

      {/* Paste Interface */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider">
          Atau Tempel (Paste) Kode JSON Data Riwayat
        </label>
        <textarea
          rows={4}
          placeholder='Contoh: [{"id":"sub-001","lokasi":"Lt. 1","tanggal":"2026-06-03","jenisPengajuan":"Biaya Gaji","kode":"HO",...}]'
          className="w-full p-3 font-mono text-xs bg-stone-50 border border-stone-250 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-400 placeholder:text-stone-300 text-stone-800"
          value={pasteData}
          onChange={(e) => setPasteData(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            onClick={() => processImport(pasteData)}
            className="bg-stone-900 hover:bg-stone-850 text-white font-semibold text-xs px-4 py-2 rounded-lg transition cursor-pointer"
          >
            Proses & Impor Kode Tempel
          </button>
        </div>
      </div>

      {/* Feedback logs */}
      {errorLog && (
        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-xl flex items-start gap-2">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{errorLog}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-xl flex items-start gap-2">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );

  if (isModal) {
    if (!modalIsOpen) return null;
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-stone-900/65 backdrop-blur-xs animate-fade-in print:hidden">
        <div 
          className="relative bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 border-b border-stone-200 bg-stone-50/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-300 flex items-center justify-center text-amber-700 shadow-3xs shrink-0">
                <FileArchive size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-900 font-display">
                  Ekspor / Impor Backup Cadangan & Pemulihan
                </h3>
                <p className="text-xs text-stone-500 font-sans mt-0.5">
                  Unduh seluruh riwayat voucher dalam format JSON / ZIP atau pulihkan cadangan.
                </p>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-stone-200/60 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer shrink-0"
                title="Tutup dialog"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Modal Body */}
          <div className="p-5 overflow-y-auto">
            {contentBody}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
            <span className="text-xs text-stone-500 font-mono">
              Total {submissions.length} transaksi voucher siap diekspor / dipulihkan
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Tutup
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stone-50 border border-stone-250 rounded-2xl overflow-hidden shadow-xs print:hidden">
      {/* Accordion Trigger */}
      <button
        onClick={() => setIsAccordionOpen(!isAccordionOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-stone-100/50 transition focus:outline-none cursor-pointer"
      >
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
            Ekspor / Impor Backup Cadangan & Pemulihan (JSON / ZIP)
          </h4>
          <p className="text-xs text-stone-500">
            Unduh seluruh riwayat voucher Anda dalam satu klik sebagai JSON teratur atau file ZIP terkompresi.
          </p>
        </div>
        <div className="text-stone-500">
          {isAccordionOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {/* Accordion Content */}
      {isAccordionOpen && (
        <div className="px-5 pb-5 pt-2 border-t border-stone-200 bg-white">
          {contentBody}
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { 
  Trash2, 
  Search, 
  FolderSync, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  X, 
  ExternalLink,
  ShieldAlert,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Submission } from '../types';
import { 
  searchDriveFoldersByKeyword, 
  findOrphanedDriveFolders, 
  DriveFolderInfo,
  extractVoucherNumber 
} from '../utils/googleDriveCleaner';
import { deleteGoogleDriveFile } from '../firebase';

interface DriveOrphanCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: Submission[];
}

export const DriveOrphanCleanerModal: React.FC<DriveOrphanCleanerModalProps> = ({
  isOpen,
  onClose,
  submissions
}) => {
  const [activeTab, setActiveTab] = useState<'quick_search' | 'auto_scan'>('quick_search');
  
  // Quick search state (default search for 1088 if user just asked about it)
  const [searchKeyword, setSearchKeyword] = useState('1088');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DriveFolderInfo[]>([]);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // Auto scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>('');
  const [orphanedFolders, setOrphanedFolders] = useState<DriveFolderInfo[]>([]);
  const [hasScanned, setHasScanned] = useState(false);

  // Deletion state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Reset or run quick search on open
  useEffect(() => {
    if (isOpen) {
      setNotification(null);
      if (searchKeyword && searchResults.length === 0) {
        handleQuickSearch();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleQuickSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = searchKeyword.trim();
    if (!cleanKey) return;

    setIsSearching(true);
    setSearchMessage(null);
    setNotification(null);

    try {
      const results = await searchDriveFoldersByKeyword(cleanKey);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchMessage(`Tidak ditemukan folder Google Drive yang mengandung kata kunci "${cleanKey}".`);
      } else {
        setSearchMessage(`Ditemukan ${results.length} folder yang cocok dengan "${cleanKey}".`);
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: `Gagal mencari folder di Google Drive: ${err?.message || 'Pastikan Google Drive sudah terhubung.'}`
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartAutoScan = async () => {
    setIsScanning(true);
    setNotification(null);
    setScanProgress('Memulai pemindaian Google Drive...');

    try {
      const list = await findOrphanedDriveFolders(submissions, (msg) => {
        setScanProgress(msg);
      });
      setOrphanedFolders(list);
      setHasScanned(true);
      if (list.length === 0) {
        setNotification({
          type: 'success',
          text: 'Google Drive bersih! Tidak ditemukan folder transaksi terhapus yang tertinggal.'
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: `Gagal memindai Google Drive: ${err?.message || 'Pastikan Google Drive terhubung.'}`
      });
    } finally {
      setIsScanning(false);
      setScanProgress('');
    }
  };

  const handleDeleteFolder = async (folder: DriveFolderInfo) => {
    if (!window.confirm(`Yakin ingin menghapus folder "${folder.name}" dari Google Drive?\n\nFolder dan seluruh lampiran di dalamnya akan dipindahkan ke Sampah Google Drive.`)) {
      return;
    }

    setDeletingId(folder.id);
    try {
      await deleteGoogleDriveFile(folder.id);
      
      // Update local states
      setSearchResults(prev => prev.filter(f => f.id !== folder.id));
      setOrphanedFolders(prev => prev.filter(f => f.id !== folder.id));

      setNotification({
        type: 'success',
        text: `Berhasil! Folder "${folder.name}" telah dihapus dari Google Drive.`
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: `Gagal menghapus folder "${folder.name}": ${err?.message || err}`
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAllOrphaned = async () => {
    if (orphanedFolders.length === 0) return;
    if (!window.confirm(`PERINGATAN: Anda akan menghapus ${orphanedFolders.length} folder transaksi terhapus dari Google Drive.\n\nLanjutkan penghapusan seluruh folder ini?`)) {
      return;
    }

    setIsDeletingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const folder of orphanedFolders) {
      try {
        await deleteGoogleDriveFile(folder.id);
        successCount++;
      } catch (err) {
        console.warn(`Gagal menghapus folder ${folder.id}`, err);
        failCount++;
      }
    }

    setOrphanedFolders([]);
    setIsDeletingAll(false);

    if (failCount === 0) {
      setNotification({
        type: 'success',
        text: `Selesai! Seluruh ${successCount} folder transaksi terhapus berhasil dibersihkan dari Google Drive.`
      });
    } else {
      setNotification({
        type: 'info',
        text: `${successCount} folder berhasil dihapus, ${failCount} folder gagal.`
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white border border-stone-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-150 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center shadow-3xs">
              <Trash2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Pembersih Folder Google Drive Transaksi Terhapus
              </h3>
              <p className="text-[11px] text-stone-500">
                Hapus folder di Google Drive yang transaksinya sudah dihapus dari aplikasi (contoh: No. 1088)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-5 pt-3 pb-2 border-b border-stone-150 flex items-center gap-2 bg-stone-50/40">
          <button
            type="button"
            onClick={() => setActiveTab('quick_search')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'quick_search'
                ? 'bg-amber-500 text-white shadow-3xs'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Search size={13} />
            <span>Cari Berdasarkan No. Voucher / Nama (Cepat)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auto_scan')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'auto_scan'
                ? 'bg-amber-500 text-white shadow-3xs'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <FolderSync size={13} />
            <span>Pindai Otomatis Seluruh Folder Terhapus</span>
          </button>
        </div>

        {/* Notification Banner */}
        {notification && (
          <div className={`mx-5 mt-3 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 ${
            notification.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
            notification.type === 'error' ? 'bg-rose-50 border border-rose-200 text-rose-800' :
            'bg-amber-50 border border-amber-200 text-amber-800'
          }`}>
            {notification.type === 'success' ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0" /> :
             notification.type === 'error' ? <AlertTriangle size={15} className="text-rose-600 shrink-0" /> :
             <Sparkles size={15} className="text-amber-600 shrink-0" />}
            <span className="flex-1">{notification.text}</span>
            <button onClick={() => setNotification(null)} className="text-stone-400 hover:text-stone-600">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Tab 1: Quick Search Content */}
        {activeTab === 'quick_search' && (
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            <form onSubmit={handleQuickSearch} className="space-y-2">
              <label className="text-xs font-semibold text-stone-700 block">
                Masukkan Nomor Voucher atau Nama yang ingin Dihapus dari Google Drive:
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="Contoh: 1088 atau BKK-NMSA-VII-26-1088 atau Rudiharto"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-mono"
                  />
                  <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !searchKeyword.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-3xs transition cursor-pointer"
                >
                  {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                  <span>Cari di Drive</span>
                </button>
              </div>
              <p className="text-[11px] text-stone-400">
                Sistem akan mencari folder yang cocok langsung di Google Drive Anda.
              </p>
            </form>

            {searchMessage && (
              <p className="text-xs font-medium text-stone-600 bg-stone-50 border border-stone-200/80 px-3 py-2 rounded-lg">
                {searchMessage}
              </p>
            )}

            {/* Search Results List */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                  Folder Ditemukan di Google Drive ({searchResults.length})
                </span>

                <div className="divide-y divide-stone-150 border border-stone-200 rounded-xl overflow-hidden bg-white">
                  {searchResults.map((folder) => {
                    const isDeletingThis = deletingId === folder.id;
                    const vNum = extractVoucherNumber(folder.name);
                    const isStillInApp = vNum && submissions.some(s => extractVoucherNumber(s.kode) === vNum);

                    return (
                      <div key={folder.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-stone-50 transition">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-800 break-all">
                              📁 {folder.name}
                            </span>
                            {isStillInApp ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                Ada di Aplikasi
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                                Sudah Dihapus di Aplikasi
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-400 font-mono truncate">
                            ID Drive: {folder.id}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {folder.webViewLink && (
                            <a
                              href={folder.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition"
                              title="Buka di Google Drive"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}

                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => handleDeleteFolder(folder)}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-250 text-rose-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                          >
                            {isDeletingThis ? (
                              <Loader2 size={13} className="animate-spin text-rose-600" />
                            ) : (
                              <Trash2 size={13} className="text-rose-600" />
                            )}
                            <span>Hapus dari Drive</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Auto Scan Orphaned Folders */}
        {activeTab === 'auto_scan' && (
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            <div className="bg-amber-50/60 border border-amber-200/70 p-3.5 rounded-xl space-y-1">
              <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-600" />
                Pindai Otomatis Seluruh Folder Yatim (Orphaned Folders)
              </h4>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Fitur ini akan menyisir folder <strong>Voucher-APP</strong> di Google Drive Anda, lalu mendeteksi semua folder transaksi yang nomor vouchernya sudah <strong>tidak ada lagi di daftar aplikasi</strong> (misal karena sudah dihapus sebelumnya seperti nomor 1088).
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={isScanning || isDeletingAll}
                onClick={handleStartAutoScan}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-3xs transition cursor-pointer"
              >
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                <span>{hasScanned ? 'Pindai Ulang Google Drive' : 'Mulai Pindai Google Drive'}</span>
              </button>

              {orphanedFolders.length > 0 && (
                <button
                  type="button"
                  disabled={isDeletingAll || isScanning}
                  onClick={handleDeleteAllOrphaned}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-3xs transition cursor-pointer"
                >
                  {isDeletingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  <span>Hapus Semua ({orphanedFolders.length} Folder)</span>
                </button>
              )}
            </div>

            {isScanning && (
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                  <Loader2 size={14} className="animate-spin text-amber-500" />
                  <span>Sedang memindai Google Drive...</span>
                </div>
                <p className="text-[11px] text-stone-500 font-mono">
                  {scanProgress}
                </p>
              </div>
            )}

            {hasScanned && !isScanning && orphanedFolders.length === 0 && (
              <div className="py-8 text-center space-y-1.5">
                <CheckCircle2 size={36} className="text-emerald-500 mx-auto" />
                <h4 className="text-xs font-bold text-stone-800">Semua Folder Google Drive Sinkron!</h4>
                <p className="text-[11px] text-stone-500 max-w-sm mx-auto">
                  Tidak ada folder transaksi di Google Drive yang datanya hilang atau sudah terhapus di aplikasi.
                </p>
              </div>
            )}

            {orphanedFolders.length > 0 && !isScanning && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                    Ditemukan {orphanedFolders.length} Folder Transaksi Terhapus
                  </span>
                  <span className="text-[10px] text-rose-600 font-semibold">
                    Tidak ditemukan di daftar voucher aktif
                  </span>
                </div>

                <div className="divide-y divide-stone-150 border border-stone-200 rounded-xl overflow-hidden bg-white max-h-80 overflow-y-auto">
                  {orphanedFolders.map((folder) => {
                    const isDeletingThis = deletingId === folder.id;

                    return (
                      <div key={folder.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-stone-50 transition">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="text-xs font-bold text-stone-800 break-all">
                            📁 {folder.name}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-stone-400">
                            {folder.voucherNumber && (
                              <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 font-mono">
                                No. Voucher: {folder.voucherNumber}
                              </span>
                            )}
                            <span className="font-mono truncate">ID: {folder.id}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {folder.webViewLink && (
                            <a
                              href={folder.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition"
                              title="Buka di Google Drive"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}

                          <button
                            type="button"
                            disabled={isDeletingThis || isDeletingAll}
                            onClick={() => handleDeleteFolder(folder)}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-250 text-rose-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                          >
                            {isDeletingThis ? (
                              <Loader2 size={13} className="animate-spin text-rose-600" />
                            ) : (
                              <Trash2 size={13} className="text-rose-600" />
                            )}
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-150 bg-stone-50/80 flex items-center justify-between">
          <p className="text-[11px] text-stone-500">
            Folder yang dihapus akan otomatis dipindahkan ke Sampah Google Drive.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-800 hover:bg-stone-200/60 rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

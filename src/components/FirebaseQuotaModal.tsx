import React, { useState, useEffect } from 'react';
import { 
  getFirestoreQuotaMetrics, 
  resetFirestoreSessionCounters, 
  resetFirestoreQuotaCooldown, 
  isFirestoreQuotaExceeded,
  loadWorkersFromFirestore,
  loadNpwpRecordsFromFirestore,
  FirestoreQuotaMetrics
} from '../firebase';
import { 
  Database, 
  X, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Users, 
  Receipt, 
  Layers, 
  HardDrive, 
  Activity, 
  Zap,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';

interface FirebaseQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkersSynced?: (workers: any[]) => void;
  onNpwpSynced?: (records: any[]) => void;
}

export const FirebaseQuotaModal: React.FC<FirebaseQuotaModalProps> = ({
  isOpen,
  onClose,
  onWorkersSynced,
  onNpwpSynced
}) => {
  const [metrics, setMetrics] = useState<FirestoreQuotaMetrics>(getFirestoreQuotaMetrics());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Keep metrics fresh in real-time
  useEffect(() => {
    if (!isOpen) return;
    setMetrics(getFirestoreQuotaMetrics());

    const handleUpdate = (e: any) => {
      if (e?.detail) {
        setMetrics(e.detail);
      } else {
        setMetrics(getFirestoreQuotaMetrics());
      }
    };

    window.addEventListener('firestore-quota-updated', handleUpdate);
    window.addEventListener('firestore-quota-exceeded', handleUpdate);
    window.addEventListener('firestore-quota-reset', handleUpdate);

    return () => {
      window.removeEventListener('firestore-quota-updated', handleUpdate);
      window.removeEventListener('firestore-quota-exceeded', handleUpdate);
      window.removeEventListener('firestore-quota-reset', handleUpdate);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const readsPercent = Math.min(100, Math.round((metrics.reads / metrics.maxDailyReads) * 1000) / 10);
  const writesPercent = Math.min(100, Math.round((metrics.writes / metrics.maxDailyWrites) * 1000) / 10);
  const deletesPercent = Math.min(100, Math.round((metrics.deletes / metrics.maxDailyDeletes) * 1000) / 10);

  const getStatusColor = (percent: number) => {
    if (percent >= 90) return 'text-rose-600 bg-rose-500';
    if (percent >= 70) return 'text-amber-600 bg-amber-500';
    return 'text-emerald-600 bg-emerald-500';
  };

  const handleManualSyncNow = async () => {
    setIsSyncing(true);
    setSyncStatus('Memeriksa dan menyinkronkan data koleksi Firebase...');
    try {
      const [workers, npwp] = await Promise.all([
        loadWorkersFromFirestore(),
        loadNpwpRecordsFromFirestore()
      ]);

      if (onWorkersSynced && Array.isArray(workers)) {
        onWorkersSynced(workers);
      }
      if (onNpwpSynced && Array.isArray(npwp)) {
        onNpwpSynced(npwp);
      }

      setMetrics(getFirestoreQuotaMetrics());
      setSyncStatus(`✓ Berhasil disinkronkan: ${workers.length} Karyawan, ${npwp.length} NPWP Perusahaan.`);
    } catch (err: any) {
      setSyncStatus('⚠️ Sinkronisasi selesai dengan peringatan: ' + (err?.message || 'Koneksi lokal'));
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(null), 5000);
    }
  };

  const handleResetSession = () => {
    resetFirestoreSessionCounters();
    setMetrics(getFirestoreQuotaMetrics());
  };

  const handleResetCooldown = async () => {
    await resetFirestoreQuotaCooldown();
    setMetrics(getFirestoreQuotaMetrics());
  };

  const quotaExceeded = isFirestoreQuotaExceeded();

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-stone-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-indigo-950 text-white p-5 sm:p-6 flex items-start justify-between gap-4 border-b border-stone-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5">
                <Database size={11} className="text-amber-400" />
                Firebase Firestore Spark Plan (Gratis)
              </span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                quotaExceeded 
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${quotaExceeded ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'}`}></span>
                <span>{quotaExceeded ? 'Mode Cooldown / Offline' : 'Koneksi Cloud Aktif'}</span>
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
              <Activity className="text-amber-400 shrink-0" size={22} />
              Monitoring Kuota &amp; Sinkronisasi Firebase
            </h3>
            <p className="text-xs text-stone-300">
              Pantau estimasi pemakaian kuota harian dokumen read/write agar kuota Spark Plan tidak habis, serta memastikan list karyawan dan NPWP tersimpan permanen.
            </p>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white hover:bg-stone-800/80 rounded-xl transition cursor-pointer shrink-0"
            title="Tutup Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 bg-stone-50/50">

          {/* Sync Status Alert */}
          {syncStatus && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-3xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{syncStatus}</span>
              </div>
              <button onClick={() => setSyncStatus(null)} className="text-emerald-700 hover:text-emerald-950 p-1">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Quota Exceeded Warning */}
          {quotaExceeded && (
            <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-2xl text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                <span>Batas Kuota Harian Spark Tercapai (Penyimpanan Sementara Aktif)</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Seluruh data baru tetap tersimpan aman di penyimpanan lokal browser dan server backend. Antrian sinkronisasi akan dilanjutkan otomatis saat kuota harian di-reset oleh Google Firebase.
              </p>
              <div className="pt-1 flex items-center gap-2">
                <button
                  onClick={handleResetCooldown}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-3xs cursor-pointer transition flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  <span>Coba Buka Kembali Koneksi Cloud</span>
                </button>
              </div>
            </div>
          )}

          {/* Spark Free Limits Dashboard Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: Document Reads */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-3xs space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                  Document Reads
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                  Harian
                </span>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-stone-900 font-sans">
                    {metrics.reads.toLocaleString('id-ID')}
                  </span>
                  <span className="text-xs font-mono font-bold text-stone-400">
                    / {metrics.maxDailyReads.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 mt-0.5 flex items-center justify-between">
                  <span>Sisa: {(metrics.maxDailyReads - metrics.reads).toLocaleString('id-ID')}</span>
                  <span className="font-bold text-stone-700">{readsPercent}%</span>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${getStatusColor(readsPercent).split(' ')[1]}`}
                  style={{ width: `${Math.max(2, readsPercent)}%` }}
                />
              </div>
              <div className="text-[10px] font-mono text-stone-400 pt-1 border-t border-stone-100 flex items-center justify-between">
                <span>Sesi aktif saat ini:</span>
                <span className="font-bold text-indigo-600">+{metrics.sessionReads}</span>
              </div>
            </div>

            {/* Card 2: Document Writes */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-3xs space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                  Document Writes
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                  Harian
                </span>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-stone-900 font-sans">
                    {metrics.writes.toLocaleString('id-ID')}
                  </span>
                  <span className="text-xs font-mono font-bold text-stone-400">
                    / {metrics.maxDailyWrites.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 mt-0.5 flex items-center justify-between">
                  <span>Sisa: {(metrics.maxDailyWrites - metrics.writes).toLocaleString('id-ID')}</span>
                  <span className="font-bold text-stone-700">{writesPercent}%</span>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${getStatusColor(writesPercent).split(' ')[1]}`}
                  style={{ width: `${Math.max(2, writesPercent)}%` }}
                />
              </div>
              <div className="text-[10px] font-mono text-stone-400 pt-1 border-t border-stone-100 flex items-center justify-between">
                <span>Sesi aktif saat ini:</span>
                <span className="font-bold text-amber-600">+{metrics.sessionWrites}</span>
              </div>
            </div>

            {/* Card 3: Document Deletes */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-3xs space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                  Document Deletes
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                  Harian
                </span>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black text-stone-900 font-sans">
                    {metrics.deletes.toLocaleString('id-ID')}
                  </span>
                  <span className="text-xs font-mono font-bold text-stone-400">
                    / {metrics.maxDailyDeletes.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="text-[11px] text-stone-500 mt-0.5 flex items-center justify-between">
                  <span>Sisa: {(metrics.maxDailyDeletes - metrics.deletes).toLocaleString('id-ID')}</span>
                  <span className="font-bold text-stone-700">{deletesPercent}%</span>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${getStatusColor(deletesPercent).split(' ')[1]}`}
                  style={{ width: `${Math.max(2, deletesPercent)}%` }}
                />
              </div>
              <div className="text-[10px] font-mono text-stone-400 pt-1 border-t border-stone-100 flex items-center justify-between">
                <span>Sesi aktif saat ini:</span>
                <span className="font-bold text-rose-600">+{metrics.sessionDeletes}</span>
              </div>
            </div>
          </div>

          {/* Synchronized Collections Status */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-3xs space-y-3">
            <div className="flex items-center justify-between border-b border-stone-150 pb-2.5">
              <h4 className="text-xs font-black text-stone-850 uppercase tracking-wider font-display flex items-center gap-2">
                <Layers size={15} className="text-amber-600" />
                Status Koleksi Tersinkronisasi (Hemat Kuota)
              </h4>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">
                Auto-Optimized
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Collection 1: Workers */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <Users size={14} className="text-indigo-600" />
                    <span>List Karyawan (`workers`)</span>
                  </div>
                  <span className="text-[9px] font-mono bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-bold">
                    Per-Dokumen
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Menyimpan dan menghapus data karyawan secara discrete (1 dokumen per karyawan). Data tetap ada di Cloud Firestore meskipun browser clear cache / refresh.
                </p>
                <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  <span>Tersimpan di Firestore &amp; Server Backend</span>
                </div>
              </div>

              {/* Collection 2: NPWP Records */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <Receipt size={14} className="text-emerald-600" />
                    <span>NPWP Perusahaan (`npwp_records`)</span>
                  </div>
                  <span className="text-[9px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                    Per-Dokumen
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Hanya menulis dan menghapus data NPWP yang diubah untuk mencegah pembacaan dan penulisan massal yang menguras kuota harian.
                </p>
                <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  <span>Tersimpan di Firestore &amp; Server Backend</span>
                </div>
              </div>

              {/* Collection 3: Attendance */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <Zap size={14} className="text-amber-600" />
                    <span>Absensi Terpusat (`attendance`)</span>
                  </div>
                  <span className="text-[9px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                    Tersentralisasi
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Rekapitulasi absensi harian dan uang makan disatukan dalam satu dokumen master `current_records` sehingga meminimalkan jumlah operasi baca.
                </p>
                <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  <span>Real-time listener aktif</span>
                </div>
              </div>

              {/* Collection 4: Submissions / Vouchers */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900">
                    <HardDrive size={14} className="text-blue-600" />
                    <span>Voucher Kas &amp; Bank (`submissions`)</span>
                  </div>
                  <span className="text-[9px] font-mono bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">
                    Fast-Save
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Disimpan ke memori lokal instan lalu diantrikan secara otomatis ke background sync tanpa memblokir antarmuka kerja pengguna.
                </p>
                <div className="text-[10px] text-stone-500 font-medium flex items-center gap-1">
                  <span>Antrian tertunda saat ini:</span>
                  <span className="font-bold text-stone-800">{metrics.pendingQueueCount} data</span>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration & Diagnostics Info */}
          <div className="bg-stone-100 border border-stone-200 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between text-stone-750">
              <span className="font-medium">Firebase Project ID:</span>
              <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-stone-300 text-stone-900">
                {metrics.connectedProjectId}
              </span>
            </div>
            <div className="flex items-center justify-between text-stone-750">
              <span className="font-medium">Database ID:</span>
              <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-stone-300 text-stone-900">
                {metrics.activeDatabaseId}
              </span>
            </div>
            <div className="flex items-center justify-between text-stone-750">
              <span className="font-medium">Waktu Terakhir Sinkron:</span>
              <span className="font-mono text-stone-600">
                {metrics.lastSyncTime ? new Date(metrics.lastSyncTime).toLocaleString('id-ID') : 'Sesi aktif berjalan'}
              </span>
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="bg-stone-100 border-t border-stone-200 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetSession}
              className="px-3 py-2 rounded-xl bg-white hover:bg-stone-50 text-stone-700 border border-stone-250 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
              title="Reset hitungan session saat ini"
            >
              <RotateCcw size={13} />
              <span>Reset Counter Sesi</span>
            </button>
            <a
              href={`https://console.firebase.google.com/project/${metrics.connectedProjectId}/firestore/usage`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl bg-white hover:bg-stone-50 text-indigo-700 hover:text-indigo-900 border border-stone-250 text-xs font-bold transition flex items-center gap-1.5 shadow-3xs"
            >
              <span>Firebase Console</span>
              <ExternalLink size={12} />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSyncNow}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
            >
              <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition cursor-pointer shadow-3xs"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

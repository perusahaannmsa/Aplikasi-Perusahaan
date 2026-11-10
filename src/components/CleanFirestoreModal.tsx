import React, { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle, RefreshCw, X, ShieldCheck, Database, Layers } from 'lucide-react';
import { cleanUnusedFirestoreCollections, CleanCollectionsResult } from '../firebase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CleanFirestoreModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [result, setResult] = useState<CleanCollectionsResult | null>(null);

  if (!isOpen) return null;

  const targetCollections = [
    { name: 'absen_records', desc: 'Data presensi per-dokumen lama (sudah digantikan oleh attendance/current_records)' },
    { name: 'accurate_mappings', desc: 'Cache pemetaan Accurate lama (sudah disimpan di lokal & server)' },
    { name: 'activity_logs', desc: 'Catatan log audit lama (sudah dinonaktifkan dari cloud)' },
    { name: 'office_config', desc: 'Data konfigurasi kantor lama yang tidak terpakai' },
    { name: 'test', desc: 'Dokumen uji coba koneksi Firestore awal' },
    { name: 'internal_memos', desc: 'Cache draft memo internal lama (sudah tersimpan di server)' }
  ];

  const preservedCollections = [
    { name: 'submissions', desc: 'Semua voucher transaksi HO & kas/bank (UTAMA)' },
    { name: 'attendance', desc: 'Master kehadiran & absensi harian karyawan' },
    { name: 'npwp_records', desc: 'Master data NPWP rekanan / vendor' },
    { name: 'companies', desc: 'Profil perusahaan & pengaturan PT' },
    { name: 'users', desc: 'Akun autentikasi login pengguna' }
  ];

  const handleStartCleanup = async () => {
    setIsRunning(true);
    setProgressMsg('Menghubungkan ke Cloud Firestore...');
    setResult(null);

    try {
      const res = await cleanUnusedFirestoreCollections((msg) => {
        setProgressMsg(msg);
      });
      setResult(res);
      if (res.success && onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setResult({
        success: false,
        totalDeleted: 0,
        details: [],
        message: err?.message || 'Terjadi kesalahan saat membersihkan koleksi.'
      });
    } finally {
      setIsRunning(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150 font-sans">
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-150 bg-stone-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500 text-white rounded-2xl shadow-3xs">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="font-display font-black text-base text-stone-900 leading-tight">
                Bersihkan Koleksi Firestore Tak Terpakai
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Hapus dokumen di koleksi lama agar database Firebase bersih &amp; kuota tetap hemat
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 hover:bg-stone-200 text-stone-400 hover:text-stone-700 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs text-stone-700">
          {/* Explanation Alert */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold text-amber-950">Kenapa koleksi ini perlu dibersihkan?</span>
              <p className="text-stone-600 mt-1">
                Koleksi seperti <code className="bg-amber-150 px-1 py-0.5 rounded font-mono text-[11px] font-bold">absen_records</code> merupakan sisa implementasi lama yang menulis data perorangan satu per satu. Dengan menghapusnya, tampilan di Firebase Console Anda akan rapi dan tidak ada data sampah yang membebani database.
              </p>
            </div>
          </div>

          {/* List of target collections to be cleaned */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-wider font-bold text-rose-700 mb-2 flex items-center gap-1.5">
              <Trash2 size={13} />
              <span>Koleksi yang Akan Dihapus / Dikosongkan (6 Koleksi):</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {targetCollections.map((c) => (
                <div key={c.name} className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-200/80 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></span>
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-rose-900 text-xs block">{c.name}</span>
                    <span className="text-[11px] text-stone-500 leading-tight block">{c.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preserved collections reminder */}
          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-wider font-bold text-emerald-700 mb-2 flex items-center gap-1.5">
              <ShieldCheck size={14} />
              <span>Koleksi Penting yang Tetap Aman 100% (Tidak Dihapus):</span>
            </h4>
            <div className="p-3 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl space-y-1.5">
              {preservedCollections.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs py-0.5 border-b border-emerald-100 last:border-0">
                  <span className="font-mono font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle size={13} className="text-emerald-600" />
                    <span>{c.name}</span>
                  </span>
                  <span className="text-[11px] text-stone-500">{c.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress or Result */}
          {isRunning && (
            <div className="p-4 rounded-2xl bg-stone-100 border border-stone-200 flex items-center gap-3 animate-pulse">
              <RefreshCw size={18} className="text-amber-600 animate-spin shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-stone-900 block">Sedang Membersihkan Firestore...</span>
                <span className="text-xs text-stone-600 font-mono truncate block">{progressMsg}</span>
              </div>
            </div>
          )}

          {result && (
            <div className={`p-4 rounded-2xl border ${result.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
              <div className="flex items-start gap-2.5">
                {result.success ? <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />}
                <div>
                  <h5 className="font-bold text-xs">{result.success ? 'Pembersihan Selesai!' : 'Pemberitahuan'}</h5>
                  <p className="text-xs mt-0.5">{result.message}</p>
                  {result.details && result.details.length > 0 && (
                    <div className="mt-2 text-[11px] font-mono space-y-0.5">
                      {result.details.map((d, i) => (
                        <div key={i} className="text-stone-600">
                          • {d.collection}: {d.count > 0 ? `${d.count} dokumen dihapus` : (d.error ? `Lewati (${d.error})` : 'Sudah kosong')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-stone-150 bg-stone-50 flex items-center justify-between gap-3">
          <span className="text-[11px] text-stone-500 hidden sm:inline">
            Koleksi kosong akan otomatis hilang dari Firebase Console.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isRunning}
              className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold text-xs transition cursor-pointer"
            >
              {result ? 'Tutup' : 'Batal'}
            </button>
            <button
              type="button"
              onClick={handleStartCleanup}
              disabled={isRunning}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-xs transition cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
            >
              {isRunning ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>{isRunning ? 'Membersihkan...' : 'Mulai Bersihkan Koleksi'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

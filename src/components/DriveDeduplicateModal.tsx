import React, { useState } from 'react';
import { RefreshCw, CloudCheck, Trash2, CheckCircle2, AlertCircle, X, ShieldAlert, Sparkles, FolderSync, ExternalLink } from 'lucide-react';
import { Submission } from '../types';
import { runAutoRefreshAndDeduplicateDrive, DeduplicateResult } from '../utils/googleDriveDeduplicator';
import { getStoredGoogleDriveToken, getActiveGoogleDriveAccount } from '../firebase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  submissions: Submission[];
  onUpdateSubmissions: (subs: Submission[]) => void;
}

export const DriveDeduplicateModal: React.FC<Props> = ({
  isOpen,
  onClose,
  submissions,
  onUpdateSubmissions
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<DeduplicateResult | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [autoDeduplicateEnabled, setAutoDeduplicateEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nmsa_auto_drive_dedup') !== 'false';
    } catch {
      return true;
    }
  });

  if (!isOpen) return null;

  const driveAccount = getActiveGoogleDriveAccount();
  const hasToken = !!getStoredGoogleDriveToken();

  const handleToggleAuto = (val: boolean) => {
    setAutoDeduplicateEnabled(val);
    try {
      localStorage.setItem('nmsa_auto_drive_dedup', val ? 'true' : 'false');
    } catch (_) {}
  };

  const handleStartDeduplication = async () => {
    setIsRunning(true);
    setProgressMsg('Memulai pemindaian Google Drive...');
    setLogs([]);
    setResult(null);

    try {
      const { result: res, updatedSubmissionsList } = await runAutoRefreshAndDeduplicateDrive(
        submissions,
        (msg) => {
          setProgressMsg(msg);
          setLogs((prev) => [...prev.slice(-30), msg]);
        }
      );

      setResult(res);
      onUpdateSubmissions(updatedSubmissionsList);
    } catch (err: any) {
      setResult({
        scannedFolders: 0,
        duplicatesRemoved: 0,
        renamedFiles: 0,
        updatedSubmissions: 0,
        details: [`Error: ${err?.message || 'Gagal memproses Google Drive.'}`]
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
            <div className="p-2.5 bg-amber-500 text-stone-950 rounded-2xl shadow-3xs">
              <FolderSync size={20} />
            </div>
            <div>
              <h3 className="font-display font-black text-base text-stone-900 leading-tight">
                Auto-Refresh &amp; Bersihkan Duplikat Google Drive
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Deteksi otomatis file ganda &amp; sinkronkan Google Drive 100% dengan aplikasi
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
          {/* Drive Status Badge */}
          <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${hasToken ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <div>
                <span className="font-bold text-xs text-stone-900 block">
                  {hasToken ? 'Google Drive Terhubung' : 'Google Drive Belum Terhubung'}
                </span>
                <span className="text-[11px] text-stone-500 font-mono">
                  {driveAccount?.email || 'Silakan hubungkan akun Google Drive Anda'}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-200/80 font-bold text-stone-700">
              Folder: "Voucher-APP"
            </span>
          </div>

          {/* Explanation Banner */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-3">
            <Sparkles size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold text-amber-950">Cara Kerja Sinkronisasi Cerdas:</span>
              <p className="text-stone-600 mt-1">
                Jika ada file yang terupload lebih dari 1 kali dengan nama sama (atau akhiran seperti <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">(1)</code>, <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">(Copy)</code>), sistem akan:
              </p>
              <ul className="list-disc list-inside mt-1.5 space-y-0.5 text-stone-700">
                <li>Menyimpan 1 file yang paling baru dan valid sebagai dokumen utama.</li>
                <li>Merapikan nama file agar bersih tanpa tanda duplikat.</li>
                <li>Memindahkan file duplikat lama ke <strong>Sampah Google Drive</strong>.</li>
                <li>Memperbarui link lampiran di dalam aplikasi agar selalu sinkron.</li>
              </ul>
            </div>
          </div>

          {/* Background Toggle */}
          <div className="p-3.5 rounded-2xl border border-stone-200 bg-stone-50/70 flex items-center justify-between gap-3">
            <div>
              <span className="font-bold text-xs text-stone-900 block">
                Otomatis Bersihkan Duplikat di Latar Belakang
              </span>
              <span className="text-[11px] text-stone-500">
                Sistem akan langsung memeriksa &amp; merapikan duplikat setiap kali Anda mengunggah berkas baru.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoDeduplicateEnabled}
                onChange={(e) => handleToggleAuto(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Running Indicator */}
          {isRunning && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3 animate-pulse">
              <RefreshCw size={18} className="text-amber-600 animate-spin shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-amber-950 block">Sedang Memindai &amp; Membersihkan Duplikat...</span>
                <span className="text-xs text-amber-800 font-mono truncate block">{progressMsg}</span>
              </div>
            </div>
          )}

          {/* Results Summary */}
          {result && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <h5 className="font-bold text-xs">Sinkronisasi Selesai Berhasil!</h5>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-white/80 rounded-xl border border-emerald-200">
                  <span className="text-lg font-black block font-mono text-emerald-800">{result.scannedFolders}</span>
                  <span className="text-[10px] text-stone-500 uppercase font-mono">Folder Dipindai</span>
                </div>
                <div className="p-2 bg-white/80 rounded-xl border border-emerald-200">
                  <span className="text-lg font-black block font-mono text-rose-700">{result.duplicatesRemoved}</span>
                  <span className="text-[10px] text-stone-500 uppercase font-mono">Duplikat Dibuang</span>
                </div>
                <div className="p-2 bg-white/80 rounded-xl border border-emerald-200">
                  <span className="text-lg font-black block font-mono text-amber-700">{result.renamedFiles}</span>
                  <span className="text-[10px] text-stone-500 uppercase font-mono">Nama Dirapikan</span>
                </div>
                <div className="p-2 bg-white/80 rounded-xl border border-emerald-200">
                  <span className="text-lg font-black block font-mono text-emerald-800">{result.updatedSubmissions}</span>
                  <span className="text-[10px] text-stone-500 uppercase font-mono">Voucher Disinkron</span>
                </div>
              </div>
            </div>
          )}

          {/* Live Logs */}
          {logs.length > 0 && (
            <div>
              <span className="font-mono text-[10px] uppercase font-bold text-stone-400 block mb-1">
                Aktivitas Terakhir:
              </span>
              <div className="bg-stone-900 text-stone-200 p-3 rounded-2xl font-mono text-[10px] max-h-36 overflow-y-auto space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="leading-tight truncate">{log}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-stone-150 bg-stone-50 flex items-center justify-between gap-3">
          <span className="text-[11px] text-stone-500 hidden sm:inline">
            File cadangan di Google Drive tetap aman dan tertata rapi.
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isRunning}
              className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-bold text-xs transition cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleStartDeduplication}
              disabled={isRunning || !hasToken}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl font-bold text-xs shadow-xs transition cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
            >
              {isRunning ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>{isRunning ? 'Sedang Menyinkronkan...' : 'Mulai Refresh & Bersihkan'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

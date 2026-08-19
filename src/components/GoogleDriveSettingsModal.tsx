import React, { useState, useEffect } from 'react';
import { 
  ConnectedDrive, 
  getConnectedDrives, 
  saveConnectedDrives, 
  googleDriveLogin, 
  refreshAllDrivesQuota,
  getAuthorizedDriveEmails,
  saveAuthorizedDriveEmails,
  getMasterDriveEmail,
  setMasterDriveEmail,
  getActiveGoogleDriveAccount,
  ensureValidDriveToken
} from '../firebase';
import { 
  Cloud, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  RefreshCw, 
  AlertTriangle, 
  HardDrive, 
  CheckCircle2, 
  Check, 
  X, 
  Lock, 
  Mail, 
  Star, 
  Sparkles,
  Layers,
  FileText,
  CreditCard,
  Briefcase,
  Users
} from 'lucide-react';

interface GoogleDriveSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleDriveSettingsModal: React.FC<GoogleDriveSettingsModalProps> = ({ isOpen, onClose }) => {
  const [drives, setDrives] = useState<ConnectedDrive[]>([]);
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [masterEmail, setMasterEmail] = useState<string>('penyimpanandrivenmsa1@gmail.com');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = () => {
    const list = getConnectedDrives();
    setDrives(list);
    const authList = getAuthorizedDriveEmails();
    setAuthorizedEmails(authList);
    const currentMaster = getMasterDriveEmail();
    setMasterEmail(currentMaster);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    const onDriveUpdated = () => {
      loadData();
    };
    window.addEventListener('nusantara-drive-updated', onDriveUpdated);
    return () => {
      window.removeEventListener('nusantara-drive-updated', onDriveUpdated);
    };
  }, []);

  if (!isOpen) return null;

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 4500);
  };

  const handleAddAuthorizedEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newEmailInput.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      showFeedback('error', 'Masukkan alamat email Google yang valid (contoh: nama@gmail.com).');
      return;
    }

    if (authorizedEmails.includes(clean)) {
      showFeedback('error', 'Email ini sudah terdaftar dalam daftar akun yang diizinkan.');
      return;
    }

    const updated = [...authorizedEmails, clean];
    setAuthorizedEmails(updated);
    await saveAuthorizedDriveEmails(updated);
    setNewEmailInput('');
    showFeedback('success', `Akun '${clean}' berhasil ditambahkan ke daftar izin Google Drive.`);
  };

  const handleRemoveAuthorizedEmail = async (emailToRemove: string) => {
    if (authorizedEmails.length <= 1) {
      showFeedback('error', 'Minimal harus ada 1 akun Google Drive yang diizinkan.');
      return;
    }

    const updated = authorizedEmails.filter(e => e.toLowerCase() !== emailToRemove.toLowerCase());
    setAuthorizedEmails(updated);
    await saveAuthorizedDriveEmails(updated);

    // If removed email was master, set new master
    if (masterEmail.toLowerCase() === emailToRemove.toLowerCase()) {
      const nextMaster = updated[0];
      setMasterEmail(nextMaster);
      await setMasterDriveEmail(nextMaster);
    }

    showFeedback('success', `Akun '${emailToRemove}' berhasil dihapus dari daftar izin.`);
  };

  const handleSetMasterAccount = async (email: string) => {
    const clean = email.trim().toLowerCase();
    setMasterEmail(clean);
    await setMasterDriveEmail(clean);
    showFeedback('success', `Akun '${clean}' sekarang dijadikan sebagai Master Google Drive 24/7.`);
  };

  const handleConnectMasterDrive = async (emailHint?: string) => {
    setIsConnecting(true);
    try {
      const targetEmail = emailHint || masterEmail || authorizedEmails[0] || 'penyimpanandrivenmsa1@gmail.com';
      const result = await googleDriveLogin(targetEmail, false);
      if (result.accessToken) {
        loadData();
        showFeedback('success', `Google Drive (${result.user?.email || targetEmail}) berhasil terhubung & tersinkronisasi ke semua menu!`);
      }
    } catch (err: any) {
      console.error(err);
      showFeedback('error', err.message || String(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleManualRefreshToken = async () => {
    setIsRefreshing(true);
    try {
      const token = await ensureValidDriveToken();
      if (token) {
        await refreshAllDrivesQuota();
        loadData();
        showFeedback('success', 'Token Google Drive berhasil diperbarui dan status kuota tersinkronisasi.');
      } else {
        // Trigger login
        await handleConnectMasterDrive(masterEmail);
      }
    } catch (err: any) {
      showFeedback('error', 'Gagal memperbarui token: ' + (err.message || String(err)));
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const activeAccount = getActiveGoogleDriveAccount();
  const currentDriveData = drives.find(d => d.email.toLowerCase() === masterEmail.toLowerCase()) || drives[0];

  const quotaPercent = currentDriveData && currentDriveData.quotaLimit > 0
    ? Math.min(100, Math.round((currentDriveData.quotaUsed / currentDriveData.quotaLimit) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-stone-900 via-stone-850 to-amber-950 text-white flex items-center justify-between border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 shadow-inner">
              <Cloud size={24} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold bg-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                  MASTER GOOGLE DRIVE
                </span>
                <span className="text-xs font-extrabold text-stone-200">
                  Pengaturan Akun & Sinkronisasi Otomatis Seluruh Menu
                </span>
              </div>
              <p className="text-xs text-stone-300 font-mono mt-0.5">
                PT Nusantara Mineral Sukses Abadi • Penyimpanan Terpusat Dokumen Keuangan
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-2xl transition cursor-pointer"
            title="Tutup Pengaturan"
          >
            <X size={20} />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div className={`p-3.5 mx-5 mt-4 rounded-2xl text-xs font-medium flex items-center gap-2.5 shrink-0 animate-in fade-in slide-in-from-top-2 duration-150 ${
            feedbackMessage.type === 'success' 
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' 
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}>
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
            )}
            <span className="flex-1">{feedbackMessage.text}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 bg-stone-50/50">
          
          {/* SECTION 1: MASTER GOOGLE DRIVE STATUS CARD */}
          <div className="bg-white border border-stone-250 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-150 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold">
                  <Star size={16} className="fill-amber-500 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider font-sans">
                    Akun Master Google Drive Aktif Saat Ini
                  </h4>
                  <p className="text-[11px] text-stone-500 font-mono">
                    Akun ini digunakan secara otomatis 24/7 di seluruh menu aplikasi tanpa perlu login ulang.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-emerald-100 border border-emerald-300 text-emerald-800 px-3 py-1 rounded-full text-xs font-extrabold font-mono shadow-3xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  TERHUBUNG OTOMATIS
                </span>
              </div>
            </div>

            {/* Master Account Info & Quota */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-6 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-stone-900 text-white font-bold flex items-center justify-center text-base shadow-sm border border-stone-800">
                    <Cloud size={22} className="text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black text-stone-900 block truncate">
                      {currentDriveData?.displayName || 'Google Drive Master NMSA'}
                    </span>
                    <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded block truncate w-fit mt-0.5">
                      {masterEmail}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-stone-500 leading-relaxed pt-1">
                  Semua berkas transaksi, bukti pengeluaran petty cash, SPPD dinas, invoice, dan bukti transfer otomatis tersimpan di dalam folder hirarki rapi: 
                  <code className="bg-stone-100 text-stone-800 px-1.5 py-0.5 rounded font-mono text-[10px] ml-1">
                    Voucher-APP / NMSA / [Tahun] / [Bulan] / [Hari]
                  </code>
                </p>
              </div>

              <div className="md:col-span-6 bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-stone-700">Kapasitas Penyimpanan Drive:</span>
                  <span className="font-black text-stone-900">
                    {currentDriveData ? `${formatBytes(currentDriveData.quotaUsed)} / ${formatBytes(currentDriveData.quotaLimit)}` : '15 GB (Google Cloud)'}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden border border-stone-300/60">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(5, quotaPercent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-stone-500">
                  <span>Terisi: {quotaPercent}%</span>
                  <span>Sisa Ruang: {currentDriveData ? formatBytes(Math.max(0, currentDriveData.quotaLimit - currentDriveData.quotaUsed)) : 'Tersedia'}</span>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-200">
                  <button
                    type="button"
                    onClick={handleManualRefreshToken}
                    disabled={isRefreshing || isConnecting}
                    className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-100 border border-stone-300 text-stone-800 font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-3xs disabled:opacity-50"
                    title="Perbarui token dan cek kuota Google Drive sekarang"
                  >
                    <RefreshCw size={12} className={isRefreshing ? 'animate-spin text-amber-600' : 'text-stone-500'} />
                    <span>{isRefreshing ? 'Memperbarui Token...' : 'Refresh Token & Kuota'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleConnectMasterDrive(masterEmail)}
                    disabled={isConnecting}
                    className="inline-flex items-center gap-1.5 bg-stone-900 hover:bg-stone-800 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-3xs disabled:opacity-50"
                  >
                    <Cloud size={12} className="text-amber-400" />
                    <span>Hubungkan Ulang Sesi</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: AUTHORIZED ACCOUNTS WHITELIST */}
          <div className="bg-white border border-stone-250 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold">
                  <Lock size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider font-sans">
                    Daftar Akun Google Drive yang Diizinkan (Whitelist)
                  </h4>
                  <p className="text-[11px] text-stone-500 font-mono">
                    Aplikasi akan menolak secara otomatis setiap akun Google yang tidak terdaftar di bawah ini.
                  </p>
                </div>
              </div>
            </div>

            {/* Add New Authorized Email Form */}
            <form onSubmit={handleAddAuthorizedEmail} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Mail size={14} className="absolute left-3 top-3 text-stone-400" />
                <input
                  type="email"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder="Tambah email Google baru (contoh: penyimpanandrivenmsa1@gmail.com)..."
                  className="w-full bg-stone-50 border border-stone-300 focus:border-emerald-500 focus:bg-white rounded-xl pl-9 pr-3 py-2 text-xs font-mono focus:outline-none transition"
                />
              </div>
              <button
                type="submit"
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-3xs shrink-0"
              >
                <Plus size={14} />
                <span>Tambah Akun Izin</span>
              </button>
            </form>

            {/* List of Authorized Emails */}
            <div className="border border-stone-200 rounded-2xl divide-y divide-stone-100 overflow-hidden bg-white">
              {authorizedEmails.map((email, idx) => {
                const isMaster = email.toLowerCase() === masterEmail.toLowerCase();
                const isConnected = drives.some(d => d.email.toLowerCase() === email.toLowerCase());

                return (
                  <div key={email} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/50 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                        isMaster ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-stone-100 text-stone-600 border border-stone-200'
                      }`}>
                        {idx + 1}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-stone-900 truncate">
                            {email}
                          </span>
                          {isMaster && (
                            <span className="bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-black font-mono px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                              <Star size={10} className="fill-amber-500 text-amber-600" />
                              MASTER UTAMA (24/7)
                            </span>
                          )}
                          {isConnected && (
                            <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9px] font-bold font-mono px-1.5 py-0.2 rounded flex items-center gap-1">
                              <ShieldCheck size={10} className="text-emerald-600" />
                              Token Tersimpan
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {!isMaster && (
                        <button
                          type="button"
                          onClick={() => handleSetMasterAccount(email)}
                          className="bg-white hover:bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-4xs"
                          title="Jadikan akun ini sebagai Master Google Drive aktif"
                        >
                          <Star size={12} className="text-amber-600" />
                          <span>Jadikan Master</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveAuthorizedEmail(email)}
                        disabled={authorizedEmails.length <= 1}
                        className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Hapus akun dari whitelist"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: REALTIME MULTI-MENU SYNC STATUS */}
          <div className="bg-white border border-stone-250 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-stone-150 pb-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold">
                <Layers size={16} />
              </div>
              <div>
                <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider font-sans">
                  Status Sinkronisasi Otomatis di Seluruh Menu Aplikasi
                </h4>
                <p className="text-[11px] text-stone-500 font-mono">
                  Semua modul di bawah ini otomatis terhubung 24/7 menggunakan Master Google Drive di atas tanpa perlu dihubungkan ulang.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3.5 bg-stone-50/80 border border-stone-200 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
                    <FileText size={15} className="text-amber-600" />
                    <span>Form Voucher HO</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <p className="text-[10px] text-stone-500 leading-relaxed font-mono">
                  Unggah berkas transaksi, kwitansi, invoice vendor, & buat folder tanggal otomatis.
                </p>
              </div>

              <div className="p-3.5 bg-stone-50/80 border border-stone-200 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
                    <Layers size={15} className="text-emerald-700" />
                    <span>Pemetaan Accurate</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <p className="text-[10px] text-stone-500 leading-relaxed font-mono">
                  Membaca dokumen LPJ Petty Cash fisik & unggah lampiran nota pendukung tanpa login ulang.
                </p>
              </div>

              <div className="p-3.5 bg-stone-50/80 border border-stone-200 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
                    <Briefcase size={15} className="text-amber-600" />
                    <span>Pemetaan & SPPD</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <p className="text-[10px] text-stone-500 leading-relaxed font-mono">
                  Pratinjau berkas tiket dinas, hotel, & AI parsing pos biaya SPPD langsung ke Drive.
                </p>
              </div>

              <div className="p-3.5 bg-stone-50/80 border border-stone-200 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
                    <CreditCard size={15} className="text-emerald-700" />
                    <span>Input Bukti Transfer</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <p className="text-[10px] text-stone-500 leading-relaxed font-mono">
                  Unggah struk bank transfer pelunasan voucher otomatis tersimpan di folder Google Drive.
                </p>
              </div>

              <div className="p-3.5 bg-stone-50/80 border border-stone-200 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
                    <Users size={15} className="text-indigo-700" />
                    <span>Absensi Harian NMSA</span>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <p className="text-[10px] text-stone-500 leading-relaxed font-mono">
                  Lampiran foto kehadiran & surat tugas lapangan terpusat di Google Drive master.
                </p>
              </div>

              <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-1.5 flex flex-col justify-center">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  <span>24/7 Keep-Alive Aktif</span>
                </div>
                <p className="text-[10px] text-emerald-800 leading-relaxed font-mono">
                  Sistem otomatis memperbarui token Google Drive di background setiap 3 menit.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-100 border-t border-stone-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono text-stone-500">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Master Drive: <strong>{masterEmail}</strong></span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="bg-stone-900 hover:bg-stone-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-3xs"
          >
            Tutup Pengaturan
          </button>
        </div>

      </div>
    </div>
  );
};

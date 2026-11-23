import React, { useState, useEffect } from 'react';
import { 
  ConnectedDrive, 
  getConnectedDrives, 
  saveConnectedDrives, 
  googleDriveLogin, 
  refreshAllDrivesQuota,
  getAuthorizedDriveEmails,
  saveAuthorizedDriveEmails,
  addAuthorizedDriveEmail,
  updateAuthorizedDriveEmail,
  removeAuthorizedDriveEmail,
  isDriveFlexibleMode,
  setDriveFlexibleMode,
  connectDriveWithManualToken,
  getMasterDriveEmail,
  setMasterDriveEmail,
  getActiveGoogleDriveAccount,
  ensureValidDriveToken,
  loadConnectedDrivesFromFirestore,
  isDriveTokenValid,
  getDriveRemainingMinutes,
  LOCKED_MASTER_DRIVE_EMAIL,
  maskLockedAccountLabel
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
  Users,
  Database,
  Laptop,
  Key,
  Edit2,
  ExternalLink,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Info
} from 'lucide-react';

interface GoogleDriveSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'whitelist' | 'manual-token' | 'overview';
  targetEmailForToken?: string;
  onOpenDriveBrowser?: () => void;
}

export const GoogleDriveSettingsModal: React.FC<GoogleDriveSettingsModalProps> = ({ 
  isOpen, 
  onClose,
  initialTab = 'whitelist',
  targetEmailForToken,
  onOpenDriveBrowser
}) => {
  const [activeTab, setActiveTab] = useState<'whitelist' | 'manual-token' | 'overview'>(initialTab);
  const [drives, setDrives] = useState<ConnectedDrive[]>([]);
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>(() => getAuthorizedDriveEmails());
  const [newEmailInput, setNewEmailInput] = useState('');
  const [masterEmail, setMasterEmail] = useState<string>(() => getMasterDriveEmail());
  const [flexibleMode, setFlexibleModeState] = useState<boolean>(() => isDriveFlexibleMode());
  
  // Inline edit state
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Manual token input state
  const [manualTokenInput, setManualTokenInput] = useState('');
  const [manualTokenEmail, setManualTokenEmail] = useState<string>(targetEmailForToken || '');
  const [isValidatingToken, setIsValidatingToken] = useState(false);

  // Connection states
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingEmail, setConnectingEmail] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const loadData = async () => {
    try {
      await loadConnectedDrivesFromFirestore();
    } catch (e) {}

    const list = getConnectedDrives();
    setDrives(list);
    setAuthorizedEmails([LOCKED_MASTER_DRIVE_EMAIL]);
    setMasterEmail(LOCKED_MASTER_DRIVE_EMAIL);
    setFlexibleModeState(false);
    setManualTokenEmail(LOCKED_MASTER_DRIVE_EMAIL);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (initialTab) setActiveTab(initialTab);
      if (targetEmailForToken) setManualTokenEmail(targetEmailForToken);
    }
  }, [isOpen, initialTab, targetEmailForToken]);

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

  const showFeedback = (type: 'success' | 'error' | 'info', text: string) => {
    setFeedbackMessage({ type, text });
    const timer = type === 'error' ? 12000 : 5000;
    setTimeout(() => {
      setFeedbackMessage(null);
    }, timer);
  };

  const handleToggleFlexibleMode = async () => {
    setFlexibleModeState(false);
    await setDriveFlexibleMode(false);
    showFeedback(
      'info',
      `Penyimpanan Google Drive dikunci permanen khusus ke akun ${LOCKED_MASTER_DRIVE_EMAIL} dan tidak dapat diubah ke akun lain.`
    );
  };

  const handleAddAuthorizedEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newEmailInput.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      showFeedback('error', 'Masukkan alamat email Google yang valid (contoh: nama@gmail.com).');
      return;
    }

    try {
      const updated = await addAuthorizedDriveEmail(clean);
      setAuthorizedEmails(updated);
      setNewEmailInput('');
      showFeedback('success', `Akun Google '${clean}' berhasil ditambahkan ke daftar yang diizinkan!`);
    } catch (err: any) {
      showFeedback('error', err.message || 'Gagal menambahkan akun.');
    }
  };

  const handleStartEdit = (email: string) => {
    setEditingEmail(email);
    setEditingValue(email);
  };

  const handleCancelEdit = () => {
    setEditingEmail(null);
    setEditingValue('');
  };

  const handleSaveEdit = async (oldEmail: string) => {
    const clean = editingValue.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      showFeedback('error', 'Alamat email baru tidak valid.');
      return;
    }

    try {
      const updated = await updateAuthorizedDriveEmail(oldEmail, clean);
      setAuthorizedEmails(updated);
      setEditingEmail(null);
      setEditingValue('');
      if (masterEmail.toLowerCase() === oldEmail.toLowerCase()) {
        setMasterEmail(clean);
      }
      showFeedback('success', `Akun '${oldEmail}' berhasil diubah menjadi '${clean}'.`);
    } catch (err: any) {
      showFeedback('error', err.message || 'Gagal mengubah akun.');
    }
  };

  const handleRemoveAuthorizedEmail = async (emailToRemove: string) => {
    if (authorizedEmails.length <= 1) {
      showFeedback('error', 'Minimal harus ada 1 akun Google Drive yang terdaftar.');
      return;
    }

    const confirm = window.confirm(`Apakah Anda yakin ingin menghapus akun '${emailToRemove}' dari daftar yang diizinkan?`);
    if (!confirm) return;

    try {
      const updated = await removeAuthorizedDriveEmail(emailToRemove);
      setAuthorizedEmails(updated);
      if (masterEmail.toLowerCase() === emailToRemove.toLowerCase()) {
        setMasterEmail(updated[0] || '');
      }
      showFeedback('success', `Akun '${emailToRemove}' berhasil dihapus dari daftar.`);
    } catch (err: any) {
      showFeedback('error', err.message || 'Gagal menghapus akun.');
    }
  };

  const handleSetMasterAccount = async (email: string) => {
    const clean = email.trim().toLowerCase();
    setMasterEmail(clean);
    await setMasterDriveEmail(clean);
    showFeedback('success', `Akun '${clean}' sekarang dijadikan sebagai Master Google Drive aktif.`);
  };

  const handleConnectDriveAccount = async (emailHint?: string) => {
    const targetEmail = emailHint || masterEmail || getMasterDriveEmail() || LOCKED_MASTER_DRIVE_EMAIL;
    setIsConnecting(true);
    setConnectingEmail(targetEmail);
    try {
      const result = await googleDriveLogin(targetEmail, false);
      if (result.accessToken) {
        await loadData();
        showFeedback('success', `Google Drive (${maskLockedAccountLabel(result.user?.email || targetEmail, 'Master Drive NMSA')}) berhasil terhubung & tersinkronisasi!`);
      }
    } catch (err: any) {
      console.error(err);
      showFeedback('error', err.message || String(err));
    } finally {
      setIsConnecting(false);
      setConnectingEmail(null);
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = manualTokenInput.trim();
    if (!token) {
      showFeedback('error', 'Silakan masukkan kode token Google Drive (Access Token).');
      return;
    }

    setIsValidatingToken(true);
    try {
      const drive = await connectDriveWithManualToken(token, manualTokenEmail);
      await loadData();
      setManualTokenInput('');
      showFeedback(
        'success', 
        `Sukses! Akun Google Drive (${maskLockedAccountLabel(drive.email, 'Master Drive NMSA')}) berhasil diverifikasi & terhubung tanpa hambatan pop-up!`
      );
    } catch (err: any) {
      showFeedback('error', err.message || 'Gagal memverifikasi token.');
    } finally {
      setIsValidatingToken(false);
    }
  };

  const handleManualRefreshToken = async () => {
    setIsRefreshing(true);
    try {
      const token = await ensureValidDriveToken(true);
      if (token) {
        await refreshAllDrivesQuota();
        await loadData();
        showFeedback('success', 'Token Google Drive berhasil diperbarui dan status kuota tersinkronisasi.');
      } else {
        await handleConnectDriveAccount(masterEmail);
      }
    } catch (err: any) {
      showFeedback('error', 'Gagal memperbarui token: ' + (err.message || String(err)));
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

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
                  PUSAT KENDALI GOOGLE DRIVE
                </span>
                <span className="text-xs font-extrabold text-stone-200">
                  Kelola Akun, Whitelist &amp; Token
                </span>
              </div>
              <p className="text-xs text-stone-300 font-mono mt-0.5">
                Penyimpanan Permanen Terkunci • Eksklusif Akun {LOCKED_MASTER_DRIVE_EMAIL}
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

        {/* Navigation Tabs */}
        <div className="bg-stone-100 border-b border-stone-200 px-5 pt-3 flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('whitelist')}
              className={`px-4 py-2 text-xs font-bold font-sans rounded-t-xl transition cursor-pointer flex items-center gap-2 border-t border-x ${
                activeTab === 'whitelist'
                  ? 'bg-white text-stone-900 border-stone-200 -mb-[1px] shadow-xs'
                  : 'text-stone-500 hover:text-stone-800 border-transparent'
              }`}
            >
              <Lock size={14} className={activeTab === 'whitelist' ? 'text-amber-600' : ''} />
              <span>Akun Drive Permanen</span>
              <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                Terkunci
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manual-token')}
              className={`px-4 py-2 text-xs font-bold font-sans rounded-t-xl transition cursor-pointer flex items-center gap-2 border-t border-x ${
                activeTab === 'manual-token'
                  ? 'bg-white text-stone-900 border-stone-200 -mb-[1px] shadow-xs'
                  : 'text-stone-500 hover:text-stone-800 border-transparent'
              }`}
            >
              <Key size={14} className={activeTab === 'manual-token' ? 'text-emerald-600' : ''} />
              <span>Input Token Manual (Bebas Muter)</span>
              <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                Solusi Instan
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-xs font-bold font-sans rounded-t-xl transition cursor-pointer flex items-center gap-2 border-t border-x ${
                activeTab === 'overview'
                  ? 'bg-white text-stone-900 border-stone-200 -mb-[1px] shadow-xs'
                  : 'text-stone-500 hover:text-stone-800 border-transparent'
              }`}
            >
              <Layers size={14} className={activeTab === 'overview' ? 'text-indigo-600' : ''} />
              <span>Status Kuota &amp; Modul</span>
            </button>
          </div>

          <div className="pb-2 flex items-center gap-2">
            {onOpenDriveBrowser && (
              <button
                type="button"
                onClick={onOpenDriveBrowser}
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black px-3 py-1.5 rounded-xl text-[11px] transition cursor-pointer shadow-3xs"
                title="Lihat & buka 3 folder utama (Absen, Voucher, Internal Memo) dari akun terdaftar"
              >
                <HardDrive size={12} />
                <span>Lihat Isi Drive (3 Folder)</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleManualRefreshToken}
              disabled={isRefreshing || isConnecting}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 font-bold px-3 py-1.5 rounded-xl text-[11px] transition cursor-pointer shadow-3xs disabled:opacity-50"
              title="Perbarui token dan cek kuota Google Drive"
            >
              <RefreshCw size={11} className={isRefreshing ? 'animate-spin text-amber-600' : 'text-stone-500'} />
              <span>{isRefreshing ? 'Memperbarui...' : 'Refresh Kuota'}</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div className={`p-3.5 mx-5 mt-4 rounded-2xl text-xs font-medium flex items-center gap-2.5 shrink-0 animate-in fade-in slide-in-from-top-2 duration-150 ${
            feedbackMessage.type === 'success' 
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' 
              : feedbackMessage.type === 'info'
              ? 'bg-amber-50 border border-amber-200 text-amber-900'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}>
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : feedbackMessage.type === 'info' ? (
              <Info size={16} className="text-amber-600 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
            )}
            <span className="flex-1 whitespace-pre-line leading-relaxed">{feedbackMessage.text}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-stone-50/50">
          
          {/* TAB 1: PERMANENT LOCKED GOOGLE DRIVE ACCOUNT */}
          {activeTab === 'whitelist' && (
            <div className="space-y-5">
              
              {/* Permanent Lock Status Banner */}
              <div className="bg-gradient-to-r from-amber-50 via-white to-emerald-50 border border-amber-300 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Lock size={15} className="text-amber-700 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider text-stone-900">
                      Penyimpanan Google Drive Terkunci Permanen
                    </span>
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      LOCKED PERMANEN
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Seluruh arsip aplikasi (Voucher, Absen, Internal Memo, SPPD, Pinjaman &amp; PPh) dikunci permanen ke akun Google Drive{' '}
                    <strong className="font-mono text-stone-900">{LOCKED_MASTER_DRIVE_EMAIL}</strong>. Akun ini tidak dapat diubah, diganti, maupun dihapus saat ganti perusahaan atau update aplikasi.
                  </p>
                </div>
              </div>

              {/* Akun Permanen Terkunci */}
              <div className="bg-white border border-stone-250 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-stone-150 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={15} className="text-emerald-700" />
                    <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                      Akun Google Drive Utama (Permanen)
                    </h4>
                  </div>
                  <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg font-mono font-bold">
                    Hanya {LOCKED_MASTER_DRIVE_EMAIL}
                  </span>
                </div>

                <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
                  {[LOCKED_MASTER_DRIVE_EMAIL].map((email, idx) => {
                    const matchedDrive = drives.find(d => d.email.toLowerCase() === email.toLowerCase());
                    const isValidToken = matchedDrive ? isDriveTokenValid(matchedDrive) : false;
                    const remainingMins = matchedDrive ? getDriveRemainingMinutes(matchedDrive) : 0;
                    const isConnectingThis = isConnecting && connectingEmail?.toLowerCase() === email.toLowerCase();

                    return (
                      <div key={email} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/50 transition">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 bg-amber-100 text-amber-800 border border-amber-300">
                            <Lock size={13} />
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono font-bold text-stone-900 truncate">
                                {LOCKED_MASTER_DRIVE_EMAIL}
                              </span>
                              <span className="bg-amber-100 border border-amber-300 text-amber-900 text-[9px] font-black font-mono px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                                <Star size={10} className="fill-amber-500 text-amber-600" />
                                MASTER PERMANEN
                              </span>
                              {matchedDrive && (
                                isValidToken ? (
                                  <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9px] font-bold font-mono px-1.5 py-0.2 rounded flex items-center gap-1">
                                    <ShieldCheck size={10} className="text-emerald-600" />
                                    Aktif {remainingMins > 0 ? `(~${remainingMins}m)` : ''}
                                  </span>
                                ) : (
                                  <span className="bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-bold font-mono px-1.5 py-0.2 rounded">
                                    Kedaluwarsa
                                  </span>
                                )
                              )}
                            </div>
                            {matchedDrive && matchedDrive.quotaLimit > 0 && (
                              <div className="text-[10px] font-mono text-stone-500">
                                Terpakai: {formatBytes(matchedDrive.quotaUsed)} dari {formatBytes(matchedDrive.quotaLimit)}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleConnectDriveAccount(LOCKED_MASTER_DRIVE_EMAIL)}
                            disabled={isConnecting}
                            className="bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-3xs disabled:opacity-50"
                            title="Hubungkan akun permanen via pop-up Google"
                          >
                            <Cloud size={11} className={isConnectingThis ? 'animate-spin text-amber-400' : 'text-amber-400'} />
                            <span>{isConnectingThis ? 'Menghubungkan...' : 'Sambungkan'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setManualTokenEmail(LOCKED_MASTER_DRIVE_EMAIL);
                              setActiveTab('manual-token');
                            }}
                            className="bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-300 text-emerald-900 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-4xs"
                            title="Input token Google Drive manual untuk akun permanen ini"
                          >
                            <Key size={11} className="text-emerald-700" />
                            <span>Input Token</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: MANUAL TOKEN INPUT (BEBAS MUTER-MUTER) */}
          {activeTab === 'manual-token' && (
            <div className="space-y-4">
              
              <div className="bg-gradient-to-br from-emerald-50 via-white to-amber-50/30 border border-emerald-300 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <Key size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-stone-900 uppercase tracking-wider font-sans">
                      Input / Tempel Token Akses Google Drive Secara Langsung
                    </h4>
                    <p className="text-[11px] text-stone-600 font-mono mt-0.5">
                      Khusus akun Google Drive permanen: <strong>{LOCKED_MASTER_DRIVE_EMAIL}</strong>
                    </p>
                  </div>
                </div>

                <form onSubmit={handleManualTokenSubmit} className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-600 uppercase tracking-wider">
                      1. Akun Google Drive Terkunci Permanen:
                    </label>
                    <div className="flex items-center gap-2 bg-amber-50/80 border border-amber-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-stone-900">
                      <Lock size={13} className="text-amber-700 shrink-0" />
                      <span>{LOCKED_MASTER_DRIVE_EMAIL}</span>
                      <span className="ml-auto text-[10px] text-amber-800 uppercase">Permanen</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-600 uppercase tracking-wider">
                      2. Tempel Kode Token Google Drive (Access Token):
                    </label>
                    <textarea
                      rows={3}
                      value={manualTokenInput}
                      onChange={(e) => setManualTokenInput(e.target.value)}
                      placeholder="Tempel token akses Google Drive Anda di sini (biasanya berawalan 'ya29.a0...')..."
                      className="w-full bg-white border border-stone-300 focus:border-emerald-600 rounded-xl p-3 text-xs font-mono focus:outline-none transition"
                    />
                    <p className="text-[10px] text-stone-400 font-mono">
                      Token akan otomatis diverifikasi langsung ke server Google Drive dan disinkronkan ke seluruh menu aplikasi.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isValidatingToken || !manualTokenInput.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {isValidatingToken ? (
                      <>
                        <RefreshCw size={13} className="animate-spin text-amber-300" />
                        <span>Memverifikasi Token ke Google Drive...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Verifikasi &amp; Sambungkan Token Sekarang</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Panduan Cara Mendapatkan Token */}
              <div className="bg-white border border-stone-250 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <HelpCircle size={15} className="text-amber-600" />
                  <h5 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-sans">
                    Cara Mendapatkan Kode Token Google Drive (Hanya 1 Menit)
                  </h5>
                </div>

                <div className="space-y-2 text-[11px] text-stone-600 font-sans leading-relaxed">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold font-mono flex items-center justify-center shrink-0 text-[10px]">
                      1
                    </span>
                    <p>
                      Buka <strong>Google OAuth 2.0 Playground</strong> resmi melalui tautan berikut:
                      <a
                        href="https://developers.google.com/oauthplayground/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 font-bold underline ml-1"
                      >
                        Google OAuth 2.0 Playground <ExternalLink size={11} />
                      </a>
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold font-mono flex items-center justify-center shrink-0 text-[10px]">
                      2
                    </span>
                    <p>
                      Pada daftar <strong>Step 1: Select &amp; authorize APIs</strong>, cari dan centang <code>Drive API v3</code> (pilih <code>https://www.googleapis.com/auth/drive.file</code> atau <code>drive</code>).
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold font-mono flex items-center justify-center shrink-0 text-[10px]">
                      3
                    </span>
                    <p>
                      Klik tombol biru <strong>"Authorize APIs"</strong>, pilih akun Google Anda yang ingin disambungkan, dan klik "Lanjutkan / Izinkan".
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold font-mono flex items-center justify-center shrink-0 text-[10px]">
                      4
                    </span>
                    <p>
                      Pada <strong>Step 2</strong>, klik tombol <strong>"Exchange authorization code for tokens"</strong>, lalu salin teks panjang di kotak <strong>"Access token"</strong> (berawalan <code>ya29.</code>) dan tempel pada formulir di atas!
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: STORAGE QUOTA & MULTI-MODULE OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              
              {/* Master Account Info & Quota */}
              <div className="bg-white border border-stone-250 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-stone-150 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold">
                      <Star size={16} className="fill-amber-500 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider font-sans">
                        Kapasitas Master Google Drive Aktif
                      </h4>
                      <p className="text-[11px] text-stone-500 font-mono">
                        Status: <strong>{maskLockedAccountLabel(masterEmail, 'Akun Master Drive NMSA (Terkunci)')}</strong>
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-stone-700 bg-stone-100 px-3 py-1 rounded-xl border border-stone-200">
                    {currentDriveData ? `${formatBytes(currentDriveData.quotaUsed)} / ${formatBytes(currentDriveData.quotaLimit)}` : '15 GB'}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-stone-500">Persentase Terisi:</span>
                    <span className="font-bold text-stone-800">{quotaPercent}%</span>
                  </div>
                  <div className="w-full bg-stone-100 h-3 rounded-full overflow-hidden border border-stone-200">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(3, quotaPercent)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-stone-400">
                    <span>0 GB</span>
                    <span>Sisa: {currentDriveData ? formatBytes(Math.max(0, currentDriveData.quotaLimit - currentDriveData.quotaUsed)) : 'Tersedia'}</span>
                    <span>{currentDriveData ? formatBytes(currentDriveData.quotaLimit) : '15 GB'}</span>
                  </div>
                </div>
              </div>

              {/* Module Sync Status */}
              <div className="bg-white border border-stone-250 rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 border-b border-stone-150 pb-2.5">
                  <Layers size={16} className="text-indigo-600" />
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider font-sans">
                    Semua Modul Terhubung Otomatis ke Master Drive
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                      <span className="flex items-center gap-1.5"><FileText size={13} className="text-amber-600" /> Voucher HO</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    </div>
                    <p className="text-[10px] text-stone-500 font-mono">Kwitansi &amp; bukti invoice</p>
                  </div>

                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                      <span className="flex items-center gap-1.5"><CreditCard size={13} className="text-emerald-700" /> Bukti Transfer</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    </div>
                    <p className="text-[10px] text-stone-500 font-mono">Struk bank pembayaran</p>
                  </div>

                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                      <span className="flex items-center gap-1.5"><Briefcase size={13} className="text-indigo-600" /> SPPD Dinas</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    </div>
                    <p className="text-[10px] text-stone-500 font-mono">Tiket pesawat &amp; hotel</p>
                  </div>

                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                      <span className="flex items-center gap-1.5"><Layers size={13} className="text-amber-600" /> Pemetaan Nota</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    </div>
                    <p className="text-[10px] text-stone-500 font-mono">LPJ fisik kas kecil</p>
                  </div>

                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                      <span className="flex items-center gap-1.5"><Users size={13} className="text-teal-700" /> Absensi Harian</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    </div>
                    <p className="text-[10px] text-stone-500 font-mono">Foto kehadiran &amp; tanda tangan</p>
                  </div>

                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 flex flex-col justify-center">
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-900">
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      <span>Sinkron Multi-Device</span>
                    </div>
                    <p className="text-[10px] text-emerald-800 font-mono">Tersimpan di Cloud Firestore</p>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-100 border-t border-stone-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono text-stone-600">
            <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
            <span>Master Drive Aktif: <strong>{maskLockedAccountLabel(masterEmail, 'Terkunci Otomatis (Master NMSA)')}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-stone-900 hover:bg-stone-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition cursor-pointer shadow-3xs"
            >
              Selesai &amp; Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

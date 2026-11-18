import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addAuthorizedDriveEmail,
  getAuthorizedDriveEmails,
  getConnectedDrives,
  getDriveRemainingMinutes,
  getMasterDriveEmail,
  getTokenForRegisteredDriveEmail,
  googleDriveLogin,
  isDriveTokenValid,
  isStrictlyAuthorizedDriveEmail,
  setMasterDriveEmail,
  ConnectedDrive,
} from '../firebase';
import {
  DriveModuleKey,
  RegisteredAccountStorageSnapshot,
  ScopedDriveFile,
  fetchScopedFolderChildren,
  formatDriveBytes,
  getDriveMimeBadge,
  loadRegisteredAccountScopedDrive,
} from '../utils/googleDriveScopedBrowser';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Cloud,
  ExternalLink,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderLock,
  HardDrive,
  Image as ImageIcon,
  Key,
  Loader2,
  Lock,
  Mail,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

interface GoogleDriveBrowserProps {
  onBackToDashboard: () => void;
  onOpenDriveSettings: (tab?: 'whitelist' | 'manual-token' | 'overview', targetEmail?: string) => void;
}

interface BreadcrumbNode {
  id: string;
  name: string;
  moduleKey: DriveModuleKey;
  webViewLink?: string;
}

const formatModifiedDate = (iso?: string): string => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const GoogleDriveBrowser: React.FC<GoogleDriveBrowserProps> = ({
  onBackToDashboard,
  onOpenDriveSettings,
}) => {
  const [registeredEmails, setRegisteredEmails] = useState<string[]>(() =>
    getAuthorizedDriveEmails()
  );
  const [connectedDrives, setConnectedDrives] = useState<ConnectedDrive[]>(() =>
    getConnectedDrives()
  );
  const [masterEmail, setMasterEmailState] = useState<string>(() => getMasterDriveEmail());
  const [selectedEmail, setSelectedEmail] = useState<string>(() => {
    const master = getMasterDriveEmail();
    const authList = getAuthorizedDriveEmails();
    if (master && authList.some((e) => e.toLowerCase() === master.toLowerCase())) {
      return master.toLowerCase();
    }
    return authList[0]?.toLowerCase() || '';
  });

  // Add new registered account inline
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [accountFeedback, setAccountFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Storage & Folder state
  const [snapshot, setSnapshot] = useState<RegisteredAccountStorageSnapshot | null>(null);
  const [isLoadingRoot, setIsLoadingRoot] = useState(false);
  const [rootError, setRootError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Drill-down folder navigation
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbNode[]>([]);
  const [folderItems, setFolderItems] = useState<ScopedDriveFile[]>([]);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Preview modal
  const [previewFile, setPreviewFile] = useState<ScopedDriveFile | null>(null);

  const allowedFolderIdsRef = useRef<Set<string>>(new Set());

  const syncAccountLists = useCallback(() => {
    const authList = getAuthorizedDriveEmails();
    const conns = getConnectedDrives();
    const master = getMasterDriveEmail();
    setRegisteredEmails(authList);
    setConnectedDrives(conns);
    setMasterEmailState(master);
    setSelectedEmail((prev) => {
      if (prev && authList.some((e) => e.toLowerCase() === prev.toLowerCase())) {
        return prev;
      }
      if (master && authList.some((e) => e.toLowerCase() === master.toLowerCase())) {
        return master.toLowerCase();
      }
      return authList[0]?.toLowerCase() || '';
    });
  }, []);

  const loadAccountRoot = useCallback(async (emailToLoad: string) => {
    if (!emailToLoad) {
      setSnapshot(null);
      setRootError('Belum ada akun Google Drive yang terdaftar di aplikasi.');
      return;
    }

    if (!isStrictlyAuthorizedDriveEmail(emailToLoad)) {
      setSnapshot(null);
      setRootError(
        `Akun '${emailToLoad}' belum terdaftar di aplikasi. Hanya akun yang terdaftar yang dapat dibaca.`
      );
      return;
    }

    setIsLoadingRoot(true);
    setRootError(null);
    setSnapshot(null);
    setBreadcrumbs([]);
    setFolderItems([]);
    setFolderError(null);
    allowedFolderIdsRef.current = new Set();

    try {
      const snap = await loadRegisteredAccountScopedDrive(emailToLoad);
      allowedFolderIdsRef.current = new Set(snap.allowedFolderIds);
      setSnapshot(snap);
    } catch (err: any) {
      setRootError(err?.message || 'Gagal memuat penyimpanan Google Drive akun ini.');
    } finally {
      setIsLoadingRoot(false);
    }
  }, []);

  useEffect(() => {
    syncAccountLists();
    const onUpdate = () => {
      syncAccountLists();
    };
    window.addEventListener('nusantara-drive-updated', onUpdate);
    return () => window.removeEventListener('nusantara-drive-updated', onUpdate);
  }, [syncAccountLists]);

  useEffect(() => {
    if (selectedEmail) {
      loadAccountRoot(selectedEmail);
    }
  }, [selectedEmail, loadAccountRoot]);

  const loadFolderChildren = useCallback(
    async (folderId: string, queryText = '') => {
      if (!selectedEmail) return;
      setIsLoadingFolder(true);
      setFolderError(null);
      try {
        const items = await fetchScopedFolderChildren(
          selectedEmail,
          folderId,
          allowedFolderIdsRef.current,
          queryText
        );
        setFolderItems(items);
      } catch (err: any) {
        setFolderError(err?.message || 'Gagal membuka isi folder Google Drive.');
      } finally {
        setIsLoadingFolder(false);
      }
    },
    [selectedEmail]
  );

  const handleOpenRootFolder = (
    moduleKey: DriveModuleKey,
    folder: ScopedDriveFile
  ) => {
    allowedFolderIdsRef.current.add(folder.id);
    const nextCrumbs: BreadcrumbNode[] = [
      {
        id: folder.id,
        name: folder.name,
        moduleKey,
        webViewLink: folder.webViewLink,
      },
    ];
    setBreadcrumbs(nextCrumbs);
    setSearchQuery('');
    loadFolderChildren(folder.id, '');
  };

  const handleOpenSubfolder = (folder: ScopedDriveFile) => {
    if (!folder.isFolder) return;
    allowedFolderIdsRef.current.add(folder.id);
    const currentModuleKey = breadcrumbs[0]?.moduleKey || 'voucher';
    const nextCrumbs: BreadcrumbNode[] = [
      ...breadcrumbs,
      {
        id: folder.id,
        name: folder.name,
        moduleKey: currentModuleKey,
        webViewLink: folder.webViewLink,
      },
    ];
    setBreadcrumbs(nextCrumbs);
    setSearchQuery('');
    loadFolderChildren(folder.id, '');
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index < 0) {
      setBreadcrumbs([]);
      setFolderItems([]);
      setFolderError(null);
      setSearchQuery('');
      return;
    }
    const sliced = breadcrumbs.slice(0, index + 1);
    const target = sliced[sliced.length - 1];
    setBreadcrumbs(sliced);
    setSearchQuery('');
    loadFolderChildren(target.id, '');
  };

  const handleRefreshCurrentView = () => {
    if (breadcrumbs.length === 0) {
      loadAccountRoot(selectedEmail);
    } else {
      const current = breadcrumbs[breadcrumbs.length - 1];
      loadFolderChildren(current.id, searchQuery);
    }
  };

  const handleConnectSelectedAccount = async () => {
    if (!selectedEmail) return;
    setIsConnecting(true);
    setAccountFeedback(null);
    setRootError(null);
    try {
      const res = await googleDriveLogin(selectedEmail, true);
      if (res.accessToken) {
        syncAccountLists();
        await loadAccountRoot(selectedEmail);
        setAccountFeedback({
          type: 'success',
          text: `Akun '${selectedEmail}' berhasil terhubung dan siap dibaca (khusus 3 folder utama).`,
        });
      }
    } catch (err: any) {
      setAccountFeedback({
        type: 'error',
        text: err?.message || 'Gagal menyambungkan akun Google Drive.',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleAddAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFeedback(null);
    const clean = newEmailInput.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setAccountFeedback({
        type: 'error',
        text: 'Masukkan alamat email Google yang valid (contoh: nama@gmail.com).',
      });
      return;
    }
    try {
      const updated = await addAuthorizedDriveEmail(clean);
      setRegisteredEmails(updated);
      setNewEmailInput('');
      setShowAddAccount(false);
      setSelectedEmail(clean);
      setAccountFeedback({
        type: 'success',
        text: `Akun '${clean}' berhasil didaftarkan. Klik "Sambungkan Akun" untuk membuka Google Drive-nya.`,
      });
    } catch (err: any) {
      setAccountFeedback({
        type: 'error',
        text: err?.message || 'Gagal mendaftarkan akun baru.',
      });
    }
  };

  const handleSetSelectedAsMaster = async () => {
    if (!selectedEmail) return;
    await setMasterDriveEmail(selectedEmail);
    setMasterEmailState(selectedEmail);
    setAccountFeedback({
      type: 'success',
      text: `Akun '${selectedEmail}' dijadikan Master Google Drive aktif.`,
    });
  };

  const selectedDriveRecord = useMemo(() => {
    return connectedDrives.find(
      (d) => d.email.trim().toLowerCase() === selectedEmail.trim().toLowerCase()
    );
  }, [connectedDrives, selectedEmail]);

  const filteredFolderItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return folderItems;
    return folderItems.filter((it) => it.name.toLowerCase().includes(q));
  }, [folderItems, searchQuery]);

  const activeTokenForPreview = useMemo(() => {
    return getTokenForRegisteredDriveEmail(selectedEmail) || '';
  }, [selectedEmail, snapshot]);

  const getCategoryIcon = (key: DriveModuleKey) => {
    if (key === 'absen') return <Users size={22} />;
    if (key === 'voucher') return <Receipt size={22} />;
    return <FileText size={22} />;
  };

  const getCategoryAccent = (key: DriveModuleKey) => {
    if (key === 'absen') {
      return {
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        iconBox: 'bg-emerald-100 text-emerald-700',
        border: 'hover:border-emerald-400',
      };
    }
    if (key === 'voucher') {
      return {
        badge: 'bg-amber-100 text-amber-900 border-amber-200',
        iconBox: 'bg-amber-100 text-amber-700',
        border: 'hover:border-amber-400',
      };
    }
    return {
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      iconBox: 'bg-indigo-100 text-indigo-700',
      border: 'hover:border-indigo-400',
    };
  };

  const getFileIcon = (file: ScopedDriveFile) => {
    if (file.isFolder) return <Folder size={18} className="text-amber-600 fill-amber-100" />;
    if (file.mimeType === 'application/pdf') return <FileText size={18} className="text-rose-600" />;
    if (file.mimeType.startsWith('image/')) return <ImageIcon size={18} className="text-emerald-600" />;
    if (
      file.mimeType.includes('spreadsheet') ||
      file.mimeType.includes('excel') ||
      file.mimeType === 'text/csv'
    ) {
      return <FileSpreadsheet size={18} className="text-emerald-700" />;
    }
    return <File size={18} className="text-stone-500" />;
  };

  const canInlinePreview = (file: ScopedDriveFile) =>
    !file.isFolder &&
    (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/'));

  const buildProxyUrl = (fileId: string) =>
    `/api/drive-proxy?id=${encodeURIComponent(fileId)}&token=${encodeURIComponent(activeTokenForPreview)}`;

  const quotaUsed = snapshot?.quotaUsed ?? selectedDriveRecord?.quotaUsed ?? 0;
  const quotaLimit = snapshot?.quotaLimit ?? selectedDriveRecord?.quotaLimit ?? 15 * 1024 * 1024 * 1024;
  const quotaPercent = quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-3xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 text-xs font-bold transition cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Kembali ke Dashboard</span>
            </button>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
              <Lock size={12} />
              Khusus 3 Folder Utama &amp; Akun Terdaftar
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight font-display flex items-center gap-2">
            <HardDrive size={24} className="text-amber-600 shrink-0" />
            <span>Penyimpanan Google Drive</span>
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 max-w-2xl">
            Lihat dan buka arsip Google Drive dari akun yang terdaftar di aplikasi. Akses dibatasi eksklusif hanya membaca 3 folder utama:{' '}
            <strong className="text-stone-800">Absen</strong>,{' '}
            <strong className="text-stone-800">Voucher</strong>, dan{' '}
            <strong className="text-stone-800">Internal Memo</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefreshCurrentView}
            disabled={isLoadingRoot || isLoadingFolder}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-xs font-bold text-stone-800 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoadingRoot || isLoadingFolder ? 'animate-spin text-amber-600' : ''} />
            <span>Muat Ulang</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenDriveSettings('whitelist', selectedEmail)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition cursor-pointer"
          >
            <Settings size={14} className="text-amber-400" />
            <span>Kelola Akun &amp; Token</span>
          </button>
        </div>
      </div>

      {/* Feedback Notice */}
      {accountFeedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            accountFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {accountFeedback.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
            )}
            <span className="whitespace-pre-line">{accountFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setAccountFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Registered Accounts Selector + Storage Quota Strip */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-3xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-mono font-bold text-stone-500 uppercase tracking-wider">
              Akun Google Drive Terdaftar ({registeredEmails.length} Akun)
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Hanya akun dalam daftar ini yang Google Drive-nya diizinkan untuk dibaca oleh aplikasi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddAccount((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold transition cursor-pointer self-start sm:self-auto"
          >
            <Plus size={14} />
            <span>Daftarkan Akun Baru</span>
          </button>
        </div>

        {showAddAccount && (
          <form
            onSubmit={handleAddAccountSubmit}
            className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="email"
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                placeholder="Masukkan email Google yang akan didaftarkan (contoh: finance@gmail.com)..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-300 bg-white focus:border-amber-500 outline-none text-xs font-mono"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Simpan Akun
              </button>
              <button
                type="button"
                onClick={() => setShowAddAccount(false)}
                className="px-3 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        )}

        {/* Registered Account Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {registeredEmails.map((email) => {
            const clean = email.trim().toLowerCase();
            const isSelected = clean === selectedEmail.trim().toLowerCase();
            const isMaster = clean === masterEmail.trim().toLowerCase();
            const driveRec = connectedDrives.find((d) => d.email.trim().toLowerCase() === clean);
            const hasValidToken = driveRec ? isDriveTokenValid(driveRec) : false;
            const remainingMins = driveRec ? getDriveRemainingMinutes(driveRec) : 0;

            return (
              <button
                key={clean}
                type="button"
                onClick={() => setSelectedEmail(clean)}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-amber-50/90 border-amber-500 ring-1 ring-amber-400'
                    : 'bg-stone-50/70 hover:bg-stone-100 border-stone-200'
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono font-bold text-stone-900 truncate">
                      {clean}
                    </span>
                    {isMaster && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 text-[9px] font-mono font-black uppercase">
                        Master
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {hasValidToken ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                        <ShieldCheck size={12} />
                        Terhubung {remainingMins > 0 ? `(~${remainingMins} mnt)` : ''}
                      </span>
                    ) : driveRec ? (
                      <span className="text-rose-600 font-bold">Sesi Kedaluwarsa</span>
                    ) : (
                      <span className="text-stone-500 font-medium">Belum Terhubung</span>
                    )}
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className={isSelected ? 'text-amber-700 shrink-0' : 'text-stone-400 shrink-0'}
                />
              </button>
            );
          })}
        </div>

        {/* Selected Account Quota Summary */}
        {selectedEmail && (
          <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-800">
                  Kapasitas Penyimpanan:{' '}
                  <span className="font-mono text-stone-900">{selectedEmail}</span>
                </span>
                <span className="font-mono text-stone-600 tabular-nums">
                  {formatDriveBytes(quotaUsed)} / {formatDriveBytes(quotaLimit)} ({quotaPercent}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden border border-stone-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    quotaPercent >= 90
                      ? 'bg-rose-500'
                      : quotaPercent >= 75
                      ? 'bg-amber-500'
                      : 'bg-emerald-600'
                  }`}
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {selectedEmail.toLowerCase() !== masterEmail.toLowerCase() && (
                <button
                  type="button"
                  onClick={handleSetSelectedAsMaster}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold transition cursor-pointer"
                >
                  Jadikan Master
                </button>
              )}
              <button
                type="button"
                onClick={handleConnectSelectedAccount}
                disabled={isConnecting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                <Cloud size={13} className="text-amber-400" />
                <span>{isConnecting ? 'Menghubungkan...' : 'Sambungkan / Perbarui Sesi'}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenDriveSettings('manual-token', selectedEmail)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold transition cursor-pointer"
              >
                <Key size={13} />
                <span>Token Manual</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Browser Body */}
      {isLoadingRoot ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center space-y-3 shadow-3xs">
          <Loader2 size={28} className="animate-spin text-amber-600 mx-auto" />
          <div className="text-sm font-bold text-stone-800">
            Membaca 3 folder utama dari Google Drive ({selectedEmail})...
          </div>
          <p className="text-xs text-stone-500">
            Hanya folder Absen, Voucher, dan Internal Memo yang diakses oleh aplikasi.
          </p>
        </div>
      ) : rootError ? (
        <div className="bg-white rounded-2xl border border-amber-300 p-6 sm:p-8 text-center space-y-4 shadow-3xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <FolderLock size={24} />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h3 className="text-base font-black text-stone-900">
              Google Drive Akun Ini Belum Siap Dibaca
            </h3>
            <p className="text-xs sm:text-sm text-stone-600 whitespace-pre-line">
              {rootError}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={handleConnectSelectedAccount}
              disabled={isConnecting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              <Cloud size={14} className="text-amber-400" />
              <span>{isConnecting ? 'Menghubungkan...' : `Sambungkan ${selectedEmail}`}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenDriveSettings('manual-token', selectedEmail)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
            >
              <Key size={14} />
              <span>Input Token Manual</span>
            </button>
          </div>
        </div>
      ) : snapshot && breadcrumbs.length === 0 ? (
        /* ROOT VIEW: Strictly 3 Main Data Folders Only */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {snapshot.roots.map((root) => {
              const accent = getCategoryAccent(root.category.key);
              return (
                <div
                  key={root.category.key}
                  className={`bg-white rounded-2xl border border-stone-200 ${accent.border} p-5 shadow-3xs flex flex-col justify-between gap-4 transition`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`p-3 rounded-xl ${accent.iconBox}`}>
                        {getCategoryIcon(root.category.key)}
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold ${
                          root.exists
                            ? accent.badge
                            : 'bg-stone-100 text-stone-500 border-stone-200'
                        }`}
                      >
                        {root.exists ? 'Folder Tersedia' : 'Belum Ada Data'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base font-black text-stone-900">
                        {root.category.label}
                      </h3>
                      <div className="text-[11px] font-mono font-bold text-stone-500 mt-0.5">
                        Folder: {root.category.folderName}
                      </div>
                      <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                        {root.category.description}
                      </p>
                    </div>

                    {root.folder?.modifiedTime && (
                      <div className="text-[11px] font-mono text-stone-400">
                        Pembaruan terakhir: {formatModifiedDate(root.folder.modifiedTime)}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex items-center gap-2 flex-wrap">
                    {root.folder ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenRootFolder(root.category.key, root.folder!)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs transition cursor-pointer"
                        >
                          <Folder size={14} />
                          <span>Buka Folder</span>
                        </button>
                        {root.folder.webViewLink && (
                          <a
                            href={root.folder.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-bold text-xs transition"
                            title="Buka langsung di tab Google Drive"
                          >
                            <ExternalLink size={13} />
                            <span>Drive</span>
                          </a>
                        )}
                      </>
                    ) : (
                      <div className="w-full text-center py-2 px-3 rounded-xl bg-stone-50 border border-stone-200 text-[11px] text-stone-500">
                        Folder akan muncul otomatis setelah Anda mengarsipkan data {root.category.label}.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-stone-100/80 rounded-2xl border border-stone-200 p-4 flex items-center gap-3 text-xs text-stone-600">
            <ShieldCheck size={18} className="text-emerald-700 shrink-0" />
            <span>
              <strong>Pembatasan Privasi Aktif:</strong> Aplikasi hanya membaca 3 folder utama di atas (
              <code className="font-mono text-stone-800">ABSENSI-NMSA-APP</code>,{' '}
              <code className="font-mono text-stone-800">Voucher-APP</code>, dan{' '}
              <code className="font-mono text-stone-800">ARSIP-INTERNAL-MEMO-NMSA</code>) milik akun terdaftar{' '}
              <strong className="text-stone-900">{snapshot.email}</strong>. Folder pribadi dan file lainnya tidak dibaca.
            </span>
          </div>
        </div>
      ) : snapshot && breadcrumbs.length > 0 ? (
        /* DRILL-DOWN FOLDER VIEW */
        <div className="bg-white rounded-2xl border border-stone-200 shadow-3xs overflow-hidden">
          {/* Breadcrumb & Filter Toolbar */}
          <div className="p-4 sm:p-5 border-b border-stone-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-stone-50/70">
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(-1)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 border border-stone-200 font-bold text-stone-800 transition cursor-pointer"
              >
                3 Folder Utama
              </button>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <ChevronRight size={14} className="text-stone-400 shrink-0" />
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(idx)}
                    className={`px-2.5 py-1 rounded-lg border font-bold transition cursor-pointer ${
                      idx === breadcrumbs.length - 1
                        ? 'bg-amber-500 text-stone-950 border-amber-600'
                        : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-200'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari file / folder di sini..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-stone-200 bg-white focus:border-amber-500 outline-none text-xs"
                />
              </div>

              {breadcrumbs[breadcrumbs.length - 1]?.webViewLink && (
                <a
                  href={breadcrumbs[breadcrumbs.length - 1].webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition shrink-0"
                >
                  <ExternalLink size={13} className="text-amber-400" />
                  <span>Buka di Google Drive</span>
                </a>
              )}
            </div>
          </div>

          {/* Folder Contents List */}
          {isLoadingFolder ? (
            <div className="p-10 text-center space-y-2">
              <Loader2 size={24} className="animate-spin text-amber-600 mx-auto" />
              <div className="text-xs font-bold text-stone-600">Memuat isi folder...</div>
            </div>
          ) : folderError ? (
            <div className="p-8 text-center space-y-3">
              <AlertTriangle size={24} className="text-rose-600 mx-auto" />
              <div className="text-xs font-bold text-rose-800">{folderError}</div>
              <button
                type="button"
                onClick={handleRefreshCurrentView}
                className="px-3.5 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-bold cursor-pointer"
              >
                Coba Lagi
              </button>
            </div>
          ) : filteredFolderItems.length === 0 ? (
            <div className="p-10 text-center text-xs text-stone-500">
              {searchQuery
                ? `Tidak ada item yang cocok dengan "${searchQuery}" di folder ini.`
                : 'Folder ini masih kosong.'}
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {filteredFolderItems.map((item) => (
                <div
                  key={item.id}
                  className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/70 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-xl bg-stone-100 shrink-0">
                      {getFileIcon(item)}
                    </div>
                    <div className="min-w-0">
                      {item.isFolder ? (
                        <button
                          type="button"
                          onClick={() => handleOpenSubfolder(item)}
                          className="text-sm font-bold text-stone-900 hover:text-amber-700 truncate block text-left cursor-pointer"
                        >
                          {item.name}
                        </button>
                      ) : (
                        <div className="text-sm font-bold text-stone-900 truncate">
                          {item.name}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-stone-500 mt-0.5">
                        <span>{getDriveMimeBadge(item.mimeType)}</span>
                        {!item.isFolder && item.size !== undefined && (
                          <>
                            <span>·</span>
                            <span>{formatDriveBytes(item.size)}</span>
                          </>
                        )}
                        {item.modifiedTime && (
                          <>
                            <span>·</span>
                            <span>{formatModifiedDate(item.modifiedTime)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {item.isFolder ? (
                      <button
                        type="button"
                        onClick={() => handleOpenSubfolder(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs transition cursor-pointer"
                      >
                        <Folder size={13} />
                        <span>Buka</span>
                      </button>
                    ) : (
                      canInlinePreview(item) &&
                      activeTokenForPreview && (
                        <button
                          type="button"
                          onClick={() => setPreviewFile(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-bold text-xs transition cursor-pointer"
                        >
                          <Eye size={13} />
                          <span>Lihat</span>
                        </button>
                      )
                    )}

                    {item.webViewLink && (
                      <a
                        href={item.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 font-bold text-xs transition"
                      >
                        <ExternalLink size={13} />
                        <span>Buka di Drive</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Inline File Preview Modal (PDF / Image) */}
      {previewFile && activeTokenForPreview && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-stone-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-black truncate">{previewFile.name}</h3>
                <p className="text-[11px] font-mono text-stone-300">
                  {getDriveMimeBadge(previewFile.mimeType)} · {formatDriveBytes(previewFile.size)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewFile.webViewLink && (
                  <a
                    href={previewFile.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-black transition"
                  >
                    <ExternalLink size={13} />
                    <span>Buka di Drive</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-full hover:bg-stone-800 text-stone-300 hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-stone-100 overflow-auto flex items-center justify-center p-3">
              {previewFile.mimeType.startsWith('image/') ? (
                <img
                  src={buildProxyUrl(previewFile.id)}
                  alt={previewFile.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow"
                />
              ) : (
                <iframe
                  src={buildProxyUrl(previewFile.id)}
                  title={previewFile.name}
                  className="w-full h-full rounded-lg bg-white border border-stone-200"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

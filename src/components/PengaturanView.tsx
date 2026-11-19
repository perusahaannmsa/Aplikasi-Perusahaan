import React from 'react';
import { AppTheme } from './ThemeSelectorModal';
import {
  ArrowLeft,
  ArrowLeftRight,
  Building2,
  Check,
  Cloud,
  Database,
  FileSpreadsheet,
  FolderSync,
  HardDrive,
  LogOut,
  Palette,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface PengaturanViewProps {
  userProfile: any;
  authUser: any;
  theme: AppTheme;
  masterDriveEmail: string;
  onSelectTheme: (t: AppTheme) => void;
  onBackToDashboard: () => void;
  onOpenProfile: () => void;
  onOpenCompanyModal: () => void;
  onOpenThemeGallery: () => void;
  onOpenGoogleDrive: () => void;
  onOpenDriveStorage: () => void;
  onOpenDriveDeduplicate: () => void;
  onOpenDriveCleaner: () => void;
  onOpenFirebaseQuota: () => void;
  onOpenCloudModal: () => void;
  onOpenFirebaseMigration: () => void;
  onOpenExportImport: () => void;
  onOpenCleanFirestore: () => void;
  onLogout: () => void;
  onForceCloudSync?: () => void;
  isCloudSyncing?: boolean;
  submissionCount?: number;
}

const THEMES: Array<{
  id: AppTheme;
  label: string;
  desc: string;
  grad: string;
}> = [
  { id: 'classic', label: 'Classic', desc: 'Putih Emas Korporat', grad: 'linear-gradient(135deg, #ffffff 50%, #D4AF37 50%)' },
  { id: 'gold-dark', label: 'Gold Dark', desc: 'Hitam Elegan Emas', grad: 'linear-gradient(135deg, #07070a 50%, #fbbf24 50%)' },
  { id: 'emerald', label: 'Emerald', desc: 'Hijau Zamrud Segar', grad: 'linear-gradient(135deg, #f1f9f4 50%, #059669 50%)' },
  { id: 'slate', label: 'Slate', desc: 'Biru Gelap Modern', grad: 'linear-gradient(135deg, #03060f 50%, #06b6d4 50%)' },
  { id: 'sunset', label: 'Sunset', desc: 'Hangat Oranye Senja', grad: 'linear-gradient(135deg, #fff7ed 50%, #f97316 50%)' },
  { id: 'nordic', label: 'Nordic', desc: 'Minimalis Biru Es', grad: 'linear-gradient(135deg, #f8fafc 50%, #0284c7 50%)' },
  { id: 'cyberpunk', label: 'Synthwave', desc: 'Ungu Neon Modern', grad: 'linear-gradient(135deg, #110c1f 50%, #ec4899 50%)' },
  { id: 'cozy', label: 'Cozy', desc: 'Krem Hangat Kertas', grad: 'linear-gradient(135deg, #faf6f0 50%, #b45309 50%)' },
];

export const PengaturanView: React.FC<PengaturanViewProps> = ({
  userProfile,
  authUser,
  theme,
  masterDriveEmail,
  onSelectTheme,
  onBackToDashboard,
  onOpenProfile,
  onOpenCompanyModal,
  onOpenThemeGallery,
  onOpenGoogleDrive,
  onOpenDriveStorage,
  onOpenDriveDeduplicate,
  onOpenDriveCleaner,
  onOpenFirebaseQuota,
  onOpenCloudModal,
  onOpenFirebaseMigration,
  onOpenExportImport,
  onOpenCleanFirestore,
  onLogout,
  onForceCloudSync,
  isCloudSyncing = false,
  submissionCount,
}) => {
  const fullName = userProfile?.fullName || 'Nur Wahyudi';
  const roleLabel = userProfile?.role || 'Divisi Keuangan HO';
  const email = authUser?.email || 'keuangan@nmsa.co.id';
  const companyCode =
    userProfile?.companyDetails?.code || userProfile?.companyId?.toUpperCase() || 'NMSA';
  const companyName =
    userProfile?.companyName || 'PT Nusantara Mineral Sukses Abadi';

  return (
    <div className="space-y-6 font-sans">
      {/* Top Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-3xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 text-xs font-bold transition cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Kembali ke Dashboard</span>
          </button>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight font-display">
            Pengaturan Akun &amp; Sistem
          </h2>
          <p className="text-xs sm:text-sm text-stone-500">
            Kelola profil pengguna, perusahaan aktif, tema tampilan, Google Drive, cadangan data, dan database Firebase.
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black transition cursor-pointer shrink-0"
        >
          <LogOut size={15} />
          <span>Keluar dari Sesi (Logout)</span>
        </button>
      </div>

      {/* Account & Active Company Identity Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white font-black text-lg flex items-center justify-center shadow-3xs shrink-0">
            {fullName.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-stone-900 truncate">
                {fullName}
              </h3>
              <span className="text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                {roleLabel}
              </span>
            </div>
            <p className="text-xs font-mono text-stone-500 truncate">{email}</p>
            <p className="text-xs text-stone-600">
              Perusahaan Aktif: <strong className="text-stone-900">{companyName}</strong> ({companyCode})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenProfile}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-xs font-bold text-stone-800 transition cursor-pointer"
          >
            <Settings size={14} />
            <span>Profil &amp; Storage</span>
          </button>
          <button
            type="button"
            onClick={onOpenCompanyModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-black transition cursor-pointer"
          >
            <Building2 size={14} />
            <span>Ganti / Tambah Perusahaan ({companyCode})</span>
          </button>
        </div>
      </div>

      {/* Section 1: Theme Selector */}
      <section className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-3xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-black text-stone-900 flex items-center gap-2">
              <Palette size={17} className="text-amber-600" />
              <span>Pilihan Tema Tampilan</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Pilih palet warna tampilan aplikasi atau buka Galeri Tema untuk pengaturan huruf &amp; gaya lanjutan.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenThemeGallery}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold transition cursor-pointer self-start sm:self-auto"
          >
            <Sparkles size={14} className="text-amber-600" />
            <span>Buka Galeri &amp; Detail Tema</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTheme(t.id)}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                  active
                    ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-400'
                    : 'bg-stone-50 hover:bg-stone-100 border-stone-200'
                }`}
              >
                <span
                  className="w-6 h-6 rounded-full border border-stone-300 shrink-0"
                  style={{ background: t.grad }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-black text-stone-900 truncate">
                      {t.label}
                    </span>
                    {active && <Check size={13} className="text-amber-700 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-stone-500 truncate">{t.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Section 2: Google Drive & Backup */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-bold text-stone-500 uppercase tracking-wider px-1">
          Penyimpanan Google Drive &amp; Backup Data
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <button
            type="button"
            onClick={onOpenDriveStorage}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-amber-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <HardDrive size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Buka Penyimpanan Google Drive</h4>
                <span className="text-[10px] font-mono text-emerald-700 font-bold">3 Folder</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Lihat folder Absen, Voucher &amp; Internal Memo dari akun Google Drive terdaftar.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenGoogleDrive}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-amber-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-stone-100 text-stone-800 shrink-0">
              <Cloud size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Pengaturan Master Google Drive</h4>
                <span className="text-[10px] font-mono text-stone-400">24/7</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5 truncate">
                Akun terhubung: {masterDriveEmail}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenExportImport}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-amber-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-stone-100 text-stone-800 shrink-0">
              <FileSpreadsheet size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Ekspor / Impor Data (Backup)</h4>
                <span className="text-[10px] font-mono text-stone-400">JSON / ZIP</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Unduh arsip cadangan seluruh data atau pulihkan dari file JSON / ZIP.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenDriveDeduplicate}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-sky-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-sky-100 text-sky-800 shrink-0">
              <FolderSync size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Refresh &amp; Bersihkan Duplikat Drive</h4>
                <span className="text-[10px] font-mono text-stone-400">Sinkron</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Segarkan tautan folder Google Drive dan rapikan entri ganda secara otomatis.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenDriveCleaner}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-rose-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-800 shrink-0">
              <Trash2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Pembersih Folder Drive Terhapus</h4>
                <span className="text-[10px] font-mono text-stone-400">Pembersihan</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Hapus folder lampiran transaksi lama di Google Drive yang sudah dihapus di portal.
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* Section 3: Firebase & Cloud Sync */}
      <section className="space-y-3">
        <h3 className="text-xs font-mono font-bold text-stone-500 uppercase tracking-wider px-1">
          Database Firebase &amp; Layanan Awan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {onForceCloudSync && (
            <button
              type="button"
              onClick={onForceCloudSync}
              disabled={isCloudSyncing}
              className="bg-white hover:bg-sky-50/70 rounded-2xl border border-sky-200 hover:border-sky-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5 disabled:opacity-60"
            >
              <div className="p-2.5 rounded-xl bg-sky-100 text-sky-800 shrink-0">
                <RefreshCw size={18} className={isCloudSyncing ? 'animate-spin' : ''} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-stone-900">
                    {isCloudSyncing ? 'Menyinkronkan Voucher...' : 'Sinkronkan Voucher Semua Perangkat'}
                  </h4>
                  <span className="text-[10px] font-mono text-sky-700 font-bold">
                    {typeof submissionCount === 'number' ? `${submissionCount} Voucher` : 'Real-Time'}
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Unggah voucher lokal yang tertahan dan samakan data HP &amp; Komputer lewat Cloud Firestore.
                </p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenFirebaseQuota}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-indigo-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-800 shrink-0">
              <Database size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Monitoring Kuota Firebase</h4>
                <span className="text-[10px] font-mono text-stone-400">Read / Write</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Pantau pemakaian baca-tulis Firestore harian dan paksa sinkronisasi cloud.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenCloudModal}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-amber-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-stone-100 text-stone-800 shrink-0">
              <Cloud size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Pusat Layanan Awan &amp; Integrasi</h4>
                <span className="text-[10px] font-mono text-stone-400">Cloud</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Sinkronisasi Firebase, ekspor-impor Google Sheets, dan integrasi SPPD.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenFirebaseMigration}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-amber-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0">
              <ArrowLeftRight size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Salin / Migrasi Data Firebase</h4>
                <span className="text-[10px] font-mono text-stone-400">Multi-Akun</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Pindahkan atau duplikasi seluruh data transaksi &amp; master ke proyek Firebase lain.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenCleanFirestore}
            className="bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-rose-400 p-4 text-left shadow-3xs transition cursor-pointer flex items-start gap-3.5"
          >
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-800 shrink-0">
              <Trash2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-stone-900">Bersihkan Koleksi Tak Terpakai</h4>
                <span className="text-[10px] font-mono text-stone-400">Firestore</span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Hapus dokumen sementara atau koleksi lama yang tidak lagi digunakan di Firestore.
              </p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
};

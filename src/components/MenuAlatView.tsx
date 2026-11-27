import React, { useMemo, useState } from 'react';
import { PendingMonthlySummary } from '../utils/monthlyTransactions';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarClock,
  Cloud,
  Database,
  ExternalLink,
  FileText,
  HandCoins,
  HardDrive,
  Layers,
  MessageSquare,
  Receipt,
  Search,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import { maskLockedAccountLabel } from '../firebase';

export type AppViewMode =
  | 'list'
  | 'form'
  | 'print'
  | 'sppd'
  | 'absen'
  | 'npwp'
  | 'accurate'
  | 'agenda'
  | 'ledger'
  | 'pph23'
  | 'rab'
  | 'memo'
  | 'pinjaman'
  | 'bulanan'
  | 'menu_alat'
  | 'pengaturan'
  | 'drive_storage';

interface MenuAlatViewProps {
  currentView: AppViewMode;
  pendingMonthlySummary: PendingMonthlySummary;
  pendingBupotDjpCount?: number;
  agendaDueCount: number;
  masterDriveEmail: string;
  onBackToDashboard: () => void;
  onNavigateView: (target: AppViewMode) => void;
  onOpenWhatsApp: () => void;
  onOpenGoogleDrive: () => void;
  onOpenDriveCleaner: () => void;
}

interface MenuCardItem {
  id: string;
  group: 'keuangan' | 'operasional' | 'integrasi';
  title: string;
  description: string;
  tag?: string;
  badgeCount?: number;
  icon: React.ReactNode;
  accentBg: string;
  href?: string;
  onClick?: () => void;
}

export const MenuAlatView: React.FC<MenuAlatViewProps> = ({
  pendingMonthlySummary,
  pendingBupotDjpCount = 0,
  agendaDueCount,
  masterDriveEmail,
  onBackToDashboard,
  onNavigateView,
  onOpenWhatsApp,
  onOpenGoogleDrive,
  onOpenDriveCleaner,
}) => {
  const [search, setSearch] = useState('');

  const allItems: MenuCardItem[] = useMemo(
    () => [
      // Group 1: Keuangan & Rutin Bulanan
      {
        id: 'voucher',
        group: 'keuangan',
        title: 'Voucher HO (Kas & Bank)',
        description: 'Daftar pengajuan, persetujuan, dan bukti transfer utama.',
        tag: 'Utama',
        icon: <Database size={18} />,
        accentBg: 'bg-amber-100 text-amber-800',
        onClick: () => onNavigateView('list'),
      },
      {
        id: 'bulanan',
        group: 'keuangan',
        title: 'Transaksi Bulanan & Agenda Kerja',
        description: 'Deteksi tagihan rutin sebelum Tgl 15, wajib Bukti Potong DJP < Tgl 5, dan pengingat agenda.',
        tag: 'Jadwal & Pajak',
        badgeCount: pendingMonthlySummary.pendingCount + pendingBupotDjpCount + agendaDueCount,
        icon: <CalendarClock size={18} />,
        accentBg:
          pendingMonthlySummary.overdueCount > 0 || pendingBupotDjpCount > 0 || agendaDueCount > 0
            ? 'bg-rose-100 text-rose-800'
            : 'bg-amber-100 text-amber-800',
        onClick: () => onNavigateView('bulanan'),
      },
      {
        id: 'ledger',
        group: 'keuangan',
        title: 'Buku Besar & Anggaran RAB',
        description: 'Rekap akuntansi per sub-jenis pengajuan dan realisasi RAB proyek.',
        tag: 'Akuntansi',
        icon: <BookOpen size={18} />,
        accentBg: 'bg-stone-100 text-stone-800',
        onClick: () => onNavigateView('ledger'),
      },
      {
        id: 'pph23',
        group: 'keuangan',
        title: 'Bukti Potong PPh 23 & NPWP',
        description: 'Rekapitulasi Coretax DJP dan Master NPWP vendor perusahaan.',
        tag: 'Coretax',
        icon: <Receipt size={18} />,
        accentBg: 'bg-amber-100 text-amber-800',
        onClick: () => onNavigateView('pph23'),
      },
      {
        id: 'accurate',
        group: 'keuangan',
        title: 'Pemetaan Akun Accurate',
        description: 'Mapping Petty Cash & SPPD agar siap diimpor ke Accurate Online.',
        tag: 'Accurate',
        icon: <Layers size={18} />,
        accentBg: 'bg-emerald-100 text-emerald-800',
        onClick: () => onNavigateView('accurate'),
      },

      // Group 2: Operasional, SDM & Dokumen
      {
        id: 'absen',
        group: 'operasional',
        title: 'Absen Harian NMSA',
        description: 'Kehadiran karyawan harian, uang makan, dan laporan kas lapangan.',
        tag: 'SDM',
        icon: <Users size={18} />,
        accentBg: 'bg-emerald-100 text-emerald-800',
        onClick: () => onNavigateView('absen'),
      },
      {
        id: 'sppd',
        group: 'operasional',
        title: 'Formulir & SPPD Dinas',
        description: 'Surat Perintah Perjalanan Dinas dan posting biaya ke Voucher HO.',
        tag: 'Dinas',
        icon: <Briefcase size={18} />,
        accentBg: 'bg-stone-100 text-stone-800',
        onClick: () => onNavigateView('sppd'),
      },
      {
        id: 'memo',
        group: 'operasional',
        title: 'Internal Memo Direksi',
        description: 'Pembuatan dan arsip memo resmi antar divisi beserta kop surat PT.',
        tag: 'Resmi',
        icon: <FileText size={18} />,
        accentBg: 'bg-amber-100 text-amber-800',
        onClick: () => onNavigateView('memo'),
      },
      {
        id: 'pinjaman',
        group: 'operasional',
        title: 'Pinjaman Karyawan & Cicilan',
        description: 'Kelola pengajuan pinjaman karyawan, jadwal potong, dan tautan voucher.',
        tag: 'Karyawan',
        icon: <HandCoins size={18} />,
        accentBg: 'bg-emerald-100 text-emerald-800',
        onClick: () => onNavigateView('pinjaman'),
      },
      {
        id: 'portal_pinjaman',
        group: 'operasional',
        title: 'Portal Formulir Karyawan',
        description: 'Buka halaman mandiri pengajuan pinjaman karyawan di tab baru.',
        tag: 'Tab Baru',
        icon: <ExternalLink size={18} />,
        accentBg: 'bg-stone-100 text-stone-800',
        href: '#/form-pinjaman',
      },

      // Group 3: Integrasi AI & Google Drive
      {
        id: 'drive_storage',
        group: 'integrasi',
        title: 'Penyimpanan Google Drive',
        description: 'Lihat & buka isi 5 folder utama (Absen, Voucher, Memo, Pinjaman, PPh 23) dari akun terdaftar.',
        tag: '5 Folder Utama',
        icon: <HardDrive size={18} />,
        accentBg: 'bg-amber-100 text-amber-800',
        onClick: () => onNavigateView('drive_storage'),
      },
      {
        id: 'whatsapp',
        group: 'integrasi',
        title: 'WhatsApp Baileys',
        description: 'Tautkan QR Code, Kode Pairing 8-Digit & pengingat absensi via Baileys.',
        tag: 'Baileys',
        icon: <MessageSquare size={18} />,
        accentBg: 'bg-emerald-100 text-emerald-800',
        onClick: onOpenWhatsApp,
      },
      {
        id: 'drive',
        group: 'integrasi',
        title: 'Master Google Drive (Akun & Token)',
        description: `Status: ${maskLockedAccountLabel(masterDriveEmail, 'Master Drive 24/7 Terkunci')}`,
        tag: 'Pengaturan',
        icon: <Cloud size={18} />,
        accentBg: 'bg-stone-100 text-stone-800',
        onClick: onOpenGoogleDrive,
      },
      {
        id: 'drive_cleaner',
        group: 'integrasi',
        title: 'Pembersih Folder Drive',
        description: 'Bersihkan folder lampiran transaksi yang sudah dihapus di aplikasi.',
        tag: 'Alat Drive',
        icon: <Trash2 size={18} />,
        accentBg: 'bg-rose-100 text-rose-800',
        onClick: onOpenDriveCleaner,
      },
    ],
    [
      pendingMonthlySummary,
      agendaDueCount,
      masterDriveEmail,
      onNavigateView,
      onOpenWhatsApp,
      onOpenGoogleDrive,
      onOpenDriveCleaner,
    ]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q) ||
        (it.tag || '').toLowerCase().includes(q)
    );
  }, [allItems, search]);

  const sections: Array<{ key: MenuCardItem['group']; label: string }> = [
    { key: 'keuangan', label: 'Keuangan, Kas & Rutin Bulanan' },
    { key: 'operasional', label: 'Operasional, SDM & Dokumen' },
    { key: 'integrasi', label: 'Integrasi WhatsApp & Google Drive' },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
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
            <button
              type="button"
              onClick={() => onNavigateView('pengaturan')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 text-xs font-bold transition cursor-pointer"
            >
              <Settings size={13} />
              <span>Buka Pengaturan</span>
            </button>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight font-display">
            Menu &amp; Alat Operasional
          </h2>
          <p className="text-xs sm:text-sm text-stone-500">
            Pilih modul kerja secara langsung tanpa daftar menu yang bertumpuk.
          </p>
        </div>

        <div className="relative w-full lg:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari modul atau alat (misal: bulanan, gaji, pph)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:border-amber-500 outline-none text-xs sm:text-sm text-stone-900"
          />
        </div>
      </div>

      {/* Highlight Banner: Transaksi Bulanan Sebelum Tgl 15 */}
      <div
        className={`rounded-2xl border p-5 shadow-3xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          pendingMonthlySummary.overdueCount > 0
            ? 'bg-rose-50/70 border-rose-200'
            : pendingMonthlySummary.pendingCount > 0
            ? 'bg-amber-50/80 border-amber-300'
            : 'bg-emerald-50/70 border-emerald-200'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className={`p-3 rounded-xl shrink-0 ${
              pendingMonthlySummary.overdueCount > 0
                ? 'bg-rose-600 text-white'
                : pendingMonthlySummary.pendingCount > 0
                ? 'bg-amber-500 text-stone-950'
                : 'bg-emerald-600 text-white'
            }`}
          >
            <CalendarClock size={22} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-stone-900">
                Pemantauan Transaksi Bulanan — {pendingMonthlySummary.monthLabel}
              </h3>
              <span className="text-[11px] font-mono font-bold text-stone-600 tabular-nums">
                {pendingMonthlySummary.executedCount}/{pendingMonthlySummary.totalActive} selesai
              </span>
            </div>
            <p className="text-xs text-stone-600 mt-0.5">
              {pendingMonthlySummary.totalActive === 0
                ? 'Atur daftar tagihan & gaji rutin bulanan agar sistem otomatis mendeteksi pembayarannya sebelum tanggal 15.'
                : pendingMonthlySummary.pendingCount === 0
                ? 'Seluruh transaksi rutin bulan ini sudah terdeteksi dijalankan di Voucher HO.'
                : `${pendingMonthlySummary.pendingCount} transaksi bulanan belum tercatat lunas bulan ini${
                    pendingMonthlySummary.overdueCount > 0
                      ? ` (${pendingMonthlySummary.overdueCount} melewati tanggal jatuh tempo)`
                      : ' — segera siapkan sebelum tanggal 15'
                  }.`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigateView('bulanan')}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition cursor-pointer shrink-0"
        >
          <span>Kelola Transaksi Bulanan</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Categorized Simplified Cards */}
      {sections.map((section) => {
        const itemsInGroup = filtered.filter((it) => it.group === section.key);
        if (itemsInGroup.length === 0) return null;

        return (
          <section key={section.key} className="space-y-3">
            <h3 className="text-xs font-mono font-bold text-stone-500 uppercase tracking-wider px-1">
              {section.label}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {itemsInGroup.map((item) => {
                const content = (
                  <div className="h-full bg-white hover:bg-stone-50 rounded-2xl border border-stone-200 hover:border-amber-400 p-4 shadow-3xs transition flex items-start gap-3.5 text-left">
                    <div className={`p-2.5 rounded-xl shrink-0 ${item.accentBg}`}>
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-black text-stone-900 truncate">
                          {item.title}
                        </h4>
                        {typeof item.badgeCount === 'number' && item.badgeCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-mono font-bold tabular-nums shrink-0">
                            {item.badgeCount}
                          </span>
                        ) : item.tag ? (
                          <span className="text-[10px] font-mono font-bold text-stone-400 shrink-0">
                            {item.tag}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );

                if (item.href) {
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block cursor-pointer"
                    >
                      {content}
                    </a>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onClick}
                    className="block w-full cursor-pointer"
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-sm text-stone-500">
          Tidak ditemukan menu yang sesuai dengan kata kunci "{search}".
        </div>
      )}
    </div>
  );
};

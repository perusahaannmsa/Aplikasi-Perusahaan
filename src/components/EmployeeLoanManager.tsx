import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EmployeeLoan, LoanPayment, LoanSigner, Worker, Submission } from '../types';
import {
  calculateLoanSummary,
  formatRupiah,
  terbilang,
  formatTanggalIndo,
  generateNextLoanNumber,
  getSavedEmployeeLoans,
  saveEmployeeLoans,
  INITIAL_SAMPLE_LOANS,
  getSynchronizedAttendanceWorkers,
  syncLoansWithSubmissions,
  determineLoanCategory,
  markLoanAsLunas,
  reopenLoan,
  manuallyUnlinkVoucherFromLoan,
  STORAGE_KEY_EMPLOYEE_LOANS
} from '../utils/loanUtils';
import { downloadEmployeeLoanPdf } from '../utils/loanPdfGenerator';
import { EmployeeLoanDocument } from './EmployeeLoanDocument';
import { ManualSyncLoanModal } from './ManualSyncLoanModal';
import { LinkVoucherToLoanModal } from './LinkVoucherToLoanModal';
import {
  FileText,
  Plus,
  Search,
  Filter,
  CreditCard,
  Printer,
  Edit,
  Trash2,
  Unlink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  User,
  Building,
  ArrowLeft,
  ChevronRight,
  Download,
  Share2,
  RefreshCw,
  X,
  FileCheck,
  Check,
  DollarSign,
  TrendingDown,
  ExternalLink,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Users,
  UserPlus,
  Link,
  RotateCcw,
  MoreVertical,
  Eye
} from 'lucide-react';

interface EmployeeLoanManagerProps {
  onBackToList: () => void;
  workers?: Worker[];
  userProfile?: any;
  onCreateVoucher?: (loan: EmployeeLoan) => void;
  submissions?: Submission[];
  onViewSubmission?: (sub: Submission) => void;
}

export const EmployeeLoanManager: React.FC<EmployeeLoanManagerProps> = ({
  onBackToList,
  workers: propWorkers = [],
  userProfile,
  onCreateVoucher,
  submissions = [],
  onViewSubmission
}) => {
  const [loans, setLoans] = useState<EmployeeLoan[]>(() => getSavedEmployeeLoans());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('aktif'); // Default: Daftar Hutang (Belum Lunas)
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'karyawan' | 'perusahaan'>('all');
  const [expandedDisbursements, setExpandedDisbursements] = useState<Record<string, boolean>>({});
  const [syncMessage, setSyncMessage] = useState<string>('');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<EmployeeLoan | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [targetLoanForPayment, setTargetLoanForPayment] = useState<EmployeeLoan | null>(null);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [targetLoanForHistory, setTargetLoanForHistory] = useState<EmployeeLoan | null>(null);

  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [targetLoanForPrint, setTargetLoanForPrint] = useState<EmployeeLoan | null>(null);
  const [printWithLedger, setPrintWithLedger] = useState(true);
  const [showKopSuratInPrint, setShowKopSuratInPrint] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(0.85);

  // Manual Voucher Link & Synchronization Modals
  const [isManualSyncModalOpen, setIsManualSyncModalOpen] = useState(false);
  const [targetLoanForLinkVoucher, setTargetLoanForLinkVoucher] = useState<EmployeeLoan | null>(null);

  // Dialog Konfirmasi Tandai Lunas Langsung
  const [settlementConfirmLoan, setSettlementConfirmLoan] = useState<EmployeeLoan | null>(null);
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [settlementNote, setSettlementNote] = useState('Pelunasan Pinjaman');

  // Floating Dropdown Menu state (portal popover per item pinjaman)
  const [openLoanMenuId, setOpenLoanMenuId] = useState<string | null>(null);
  const [loanMenuPosition, setLoanMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  const activeMenuLoan = useMemo(() => {
    if (!openLoanMenuId) return null;
    return loans.find(l => l.id === openLoanMenuId) || null;
  }, [openLoanMenuId, loans]);

  const findLinkedVoucherForLoan = (loan: EmployeeLoan): Submission | undefined => {
    return submissions.find(s =>
      (loan.linkedSubmissionId && s.id === loan.linkedSubmissionId) ||
      (loan.linkedSubmissionKode && s.kode === loan.linkedSubmissionKode) ||
      (Array.isArray(loan.disbursements) && loan.disbursements.some(d =>
        (d.submissionId && d.submissionId === s.id) ||
        (d.kodeDokumen && s.kode && d.kodeDokumen === s.kode)
      )) ||
      (s.loanId && s.loanId === loan.id) ||
      (s.loanNumber && s.loanNumber === loan.nomorPinjaman) ||
      (s.notes && s.notes.includes(loan.nomorPinjaman)) ||
      (s.items && s.items.some(it => it.keterangan && it.keterangan.includes(loan.nomorPinjaman)))
    );
  };

  const isLoanConnectedToVoucher = (loan: EmployeeLoan, linkedVoucher?: Submission): boolean => {
    return Boolean(
      linkedVoucher ||
      (Array.isArray(loan.disbursements) && loan.disbursements.length > 0)
    );
  };

  const updateLoanMenuPosition = (loanId: string) => {
    const btn = document.getElementById(`btn-loan-action-${loanId}`);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 224;
    const menuEstimatedHeight = 330;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < menuEstimatedHeight && spaceAbove > spaceBelow;

    let left = rect.right - menuWidth;
    if (left < 12) {
      left = Math.max(12, rect.left);
    }
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }

    if (openUpwards) {
      setLoanMenuPosition({
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        left,
        maxHeight: Math.min(420, Math.max(160, spaceAbove - 16)),
      });
    } else {
      setLoanMenuPosition({
        top: Math.max(8, rect.bottom + 6),
        left,
        maxHeight: Math.min(420, Math.max(160, spaceBelow - 16)),
      });
    }
  };

  useEffect(() => {
    if (openLoanMenuId) {
      updateLoanMenuPosition(openLoanMenuId);
    }
  }, [openLoanMenuId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.loan-action-menu-root')) {
        setOpenLoanMenuId(null);
        setLoanMenuPosition(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenLoanMenuId(null);
        setLoanMenuPosition(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!openLoanMenuId) return;
    const handleScrollOrResize = () => updateLoanMenuPosition(openLoanMenuId);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [openLoanMenuId]);

  // Sinkronkan pengajuan dari portal karyawan (cross-tab / server unified-storage)
  useEffect(() => {
    let isMounted = true;
    fetch('/api/unified-storage')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!isMounted || !data || !Array.isArray(data.employeeLoans) || data.employeeLoans.length === 0) return;
        const hasLocalKey = !!localStorage.getItem(STORAGE_KEY_EMPLOYEE_LOANS);
        if (!hasLocalKey) {
          setLoans(data.employeeLoans);
          localStorage.setItem(STORAGE_KEY_EMPLOYEE_LOANS, JSON.stringify(data.employeeLoans));
          return;
        }
        // Gabungkan pengajuan dari portal karyawan publik yang belum ada di localStorage
        setLoans(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const missingPublicLoans = (data.employeeLoans as EmployeeLoan[]).filter(
            srvLoan => srvLoan && srvLoan.id && srvLoan.id.startsWith('loan-emp-') && !existingIds.has(srvLoan.id)
          );
          if (missingPublicLoans.length === 0) return prev;
          const merged = [...missingPublicLoans, ...prev];
          try {
            localStorage.setItem(STORAGE_KEY_EMPLOYEE_LOANS, JSON.stringify(merged));
          } catch (_) {}
          return merged;
        });
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Pastikan Ctrl+P pada modal cetak pinjaman selalu memakai layout cetak resmi
  useEffect(() => {
    if (!isPrintModalOpen || !targetLoanForPrint) return;
    const originalTitle = document.title;
    const cleanNo = (targetLoanForPrint.nomorPinjaman || 'KARYAWAN').replace(/[^a-zA-Z0-9_-]/g, '_');
    const handleBeforePrint = () => {
      document.body.classList.add('is-printing-employee-loan');
      document.title = `FORM_PINJAMAN_${cleanNo}`;
    };
    const handleAfterPrint = () => {
      document.body.classList.remove('is-printing-employee-loan');
      document.title = originalTitle;
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('is-printing-employee-loan');
      document.title = originalTitle;
    };
  }, [isPrintModalOpen, targetLoanForPrint]);

  // Reactive listener untuk sinkronisasi instan antar modul dan tab
  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setLoans(e.detail);
      } else {
        setLoans(getSavedEmployeeLoans());
      }
    };
    window.addEventListener('nmsa-employee-loans-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('nmsa-employee-loans-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Karyawan tersinkronisasi 100% dengan Modul Absensi Harian NMSA
  const syncedWorkers = useMemo(() => {
    return getSynchronizedAttendanceWorkers();
  }, []);

  const workers = useMemo(() => {
    if (propWorkers && propWorkers.length > 0) {
      const map = new Map<string, Worker>();
      syncedWorkers.forEach(w => map.set(w.name.toLowerCase().trim(), w));
      propWorkers.forEach(w => map.set(w.name.toLowerCase().trim(), w));
      return Array.from(map.values());
    }
    return syncedWorkers;
  }, [propWorkers, syncedWorkers]);

  // Form State
  const [nomorPinjaman, setNomorPinjaman] = useState('');
  const [tanggalPermohonan, setTanggalPermohonan] = useState(() => new Date().toISOString().split('T')[0]);
  const [namaKaryawan, setNamaKaryawan] = useState('');
  const [loanCategory, setLoanCategory] = useState<'karyawan' | 'perusahaan'>('karyawan');
  const [divisi, setDivisi] = useState('');
  const [alasanPeminjaman, setAlasanPeminjaman] = useState('');
  const [jumlahPinjaman, setJumlahPinjaman] = useState<number | ''>('');
  const [tenorBulan, setTenorBulan] = useState<number>(5);
  const [cicilanPerBulan, setCicilanPerBulan] = useState<number | ''>('');
  const [caraPembayaran, setCaraPembayaran] = useState('');

  // Fitur pendeteksi otomatis dinonaktifkan sesuai permintaan pengguna.
  // Transaksi pinjaman hanya ditandai secara manual atau otomatis saat dibuatkan voucher dari menu pinjaman.

  const handleManualSyncSubmissions = () => {
    if (!submissions || submissions.length === 0) {
      alert('Tidak ada transaksi voucher pengeluaran kas yang ditemukan.');
      return;
    }
    const { syncedLoans, newLoansCount, accumulatedCount } = syncLoansWithSubmissions(loans, submissions, workers);
    setLoans(syncedLoans);
    saveEmployeeLoans(syncedLoans);
    setSyncMessage(`✅ Sinkronisasi Selesai: ${newLoansCount} pinjaman baru ditambahkan, ${accumulatedCount} voucher terakumulasi.`);
    setTimeout(() => setSyncMessage(''), 6000);
  };

  // Konfirmasi Pelunasan Pinjaman (Tandai Lunas)
  const handleConfirmMarkAsLunas = () => {
    if (!settlementConfirmLoan) return;
    const updatedLoan = markLoanAsLunas(
      settlementConfirmLoan,
      settlementDate,
      settlementNote,
      userProfile?.fullName || 'Finance'
    );
    const updated = loans.map(l => l.id === updatedLoan.id ? updatedLoan : l);
    setLoans(updated);
    saveEmployeeLoans(updated);
    setSettlementConfirmLoan(null);
    setSyncMessage(`🎉 Hutang ${updatedLoan.namaKaryawan} (${updatedLoan.nomorPinjaman}) berhasil ditandai LUNAS dan dipindahkan ke Tab Lunas.`);
    setTimeout(() => setSyncMessage(''), 6000);
  };

  // Batalkan status lunas (kembalikan ke daftar hutang aktif)
  const handleReopen = (loan: EmployeeLoan) => {
    const updatedLoan = reopenLoan(loan);
    const updated = loans.map(l => l.id === updatedLoan.id ? updatedLoan : l);
    setLoans(updated);
    saveEmployeeLoans(updated);
    setSyncMessage(`↩️ Status pinjaman ${loan.namaKaryawan} dikembalikan menjadi Belum Lunas (Masuk kembali ke Daftar Hutang).`);
    setTimeout(() => setSyncMessage(''), 6000);
  };

  // Toggle kategori antara Karyawan dan Perusahaan
  const handleToggleCategory = (targetLoan: EmployeeLoan) => {
    const currentCat = targetLoan.category || determineLoanCategory(targetLoan.namaKaryawan, undefined, workers);
    const newCat = currentCat === 'karyawan' ? 'perusahaan' : 'karyawan';
    const updatedLoan: EmployeeLoan = {
      ...targetLoan,
      category: newCat,
      divisi: newCat === 'karyawan' ? 'Staff / Karyawan NMSA' : 'Pihak Ketiga / Rekanan Perusahaan',
      updatedAt: new Date().toISOString()
    };
    const updated = loans.map(l => l.id === updatedLoan.id ? updatedLoan : l);
    setLoans(updated);
    saveEmployeeLoans(updated);
    setSyncMessage(`🔄 Kategori ${targetLoan.namaKaryawan} diubah menjadi Pinjaman ${newCat === 'karyawan' ? 'Karyawan' : 'Perusahaan / Pihak Ketiga'}.`);
    setTimeout(() => setSyncMessage(''), 5000);
  };
  const [tanggalPengambilanPinjaman, setTanggalPengambilanPinjaman] = useState(() => new Date().toISOString().split('T')[0]);
  const [peminjamJabatan, setPeminjamJabatan] = useState('');
  const [atasanNama, setAtasanNama] = useState('Andi Muhammad Rifki');
  const [atasanJabatan, setAtasanJabatan] = useState('Direktur');
  const [financeNama, setFinanceNama] = useState('Harijon');
  const [financeJabatan, setFinanceJabatan] = useState('Direktur Keuangan');
  const [direkturNama, setDirekturNama] = useState('Andi Nursyam Halid');
  const [direkturJabatan, setDirekturJabatan] = useState('Direktur Utama');
  const [catatan, setCatatan] = useState('');
  const [loanStatus, setLoanStatus] = useState<EmployeeLoan['status']>('Belum Lunas');

  // Signer Roles & Additional Signers State
  const [peminjamRole, setPeminjamRole] = useState('Diajukan');
  const [atasanRole, setAtasanRole] = useState('Diverifikasi');
  const [financeRole, setFinanceRole] = useState('Diverifikasi');
  const [direkturRole, setDirekturRole] = useState('Disetujui');
  const [additionalSigners, setAdditionalSigners] = useState<LoanSigner[]>([]);

  // Signer Config Modal State (Quick Editor)
  const [isSignerConfigModalOpen, setIsSignerConfigModalOpen] = useState(false);
  const [targetLoanForSigners, setTargetLoanForSigners] = useState<EmployeeLoan | null>(null);

  // Payment Form State
  const [payTanggal, setPayTanggal] = useState(() => new Date().toISOString().split('T')[0]);
  const [payJumlah, setPayJumlah] = useState<number | ''>('');
  const [payMetode, setPayMetode] = useState<LoanPayment['metodePembayaran']>('Potong Gaji');
  const [payKeterangan, setPayKeterangan] = useState('');
  const [payNomorBukti, setPayNomorBukti] = useState('');
  const [payDiterimaOleh, setPayDiterimaOleh] = useState('Sri Ekowati (Finance)');

  // Save changes to storage
  const handleUpdateLoans = (updated: EmployeeLoan[]) => {
    setLoans(updated);
    saveEmployeeLoans(updated);
  };

  // Sync initial calculation for caraPembayaran when amount or tenor changes
  useEffect(() => {
    if (typeof jumlahPinjaman === 'number' && jumlahPinjaman > 0 && tenorBulan > 0) {
      const calcMonthly = Math.round(jumlahPinjaman / tenorBulan);
      setCicilanPerBulan(calcMonthly);
      setCaraPembayaran(`Potong Gaji Bulanan Rp ${calcMonthly.toLocaleString('id-ID')} x ${tenorBulan} Bulan`);
    }
  }, [jumlahPinjaman, tenorBulan]);

  const handleOpenNewLoanForm = () => {
    const nextNo = generateNextLoanNumber(loans);
    setEditingLoan(null);
    setNomorPinjaman(nextNo);
    setTanggalPermohonan(new Date().toISOString().split('T')[0]);
    setNamaKaryawan('');
    setDivisi('');
    setAlasanPeminjaman('');
    setJumlahPinjaman('');
    setTenorBulan(5);
    setCicilanPerBulan('');
    setCaraPembayaran('');
    setTanggalPengambilanPinjaman(new Date().toISOString().split('T')[0]);
    setPeminjamRole('Diajukan');
    setPeminjamJabatan('Karyawan');
    setAtasanRole('Diverifikasi');
    setAtasanNama('Andi Muhammad Rifki');
    setAtasanJabatan('Direktur');
    setFinanceRole('Diverifikasi');
    setFinanceNama('Harijon');
    setFinanceJabatan('Direktur Keuangan');
    setDirekturRole('Disetujui');
    setDirekturNama('Andi Nursyam Halid');
    setDirekturJabatan('Direktur Utama');
    setAdditionalSigners([]);
    setCatatan('Disetujui. Pembayaran angsuran dipotong melalui slip gaji bulanan.');
    setLoanStatus('Belum Lunas');
    setLoanCategory('karyawan');
    setIsFormModalOpen(true);
  };

  const handleOpenEditLoanForm = (loan: EmployeeLoan) => {
    setEditingLoan(loan);
    setNomorPinjaman(loan.nomorPinjaman);
    setTanggalPermohonan(loan.tanggalPermohonan);
    setNamaKaryawan(loan.namaKaryawan);
    setLoanCategory(loan.category || determineLoanCategory(loan.namaKaryawan, undefined, workers));
    setDivisi(loan.divisi);
    setAlasanPeminjaman(loan.alasanPeminjaman);
    setJumlahPinjaman(loan.jumlahPinjaman);
    setTenorBulan(loan.tenorBulan || 5);
    setCicilanPerBulan(loan.cicilanPerBulan || '');
    setCaraPembayaran(loan.caraPembayaran);
    setTanggalPengambilanPinjaman(loan.tanggalPengambilanPinjaman);
    setPeminjamRole(loan.peminjamRole || 'Diajukan');
    setPeminjamJabatan(loan.peminjamJabatan || 'Karyawan');
    setAtasanRole(loan.atasanRole || 'Diverifikasi');
    setAtasanNama(loan.atasanNama || 'Andi Muhammad Rifki');
    setAtasanJabatan(loan.atasanJabatan || 'Direktur');
    setFinanceRole(loan.financeRole || 'Diverifikasi');
    setFinanceNama(loan.financeNama || 'Harijon');
    setFinanceJabatan(loan.financeJabatan || 'Direktur Keuangan');
    setDirekturRole(loan.direkturRole || 'Disetujui');
    setDirekturNama(loan.direkturNama || 'Andi Nursyam Halid');
    setDirekturJabatan(loan.direkturJabatan || 'Direktur Utama');
    setAdditionalSigners(loan.additionalSigners ? [...loan.additionalSigners] : []);
    setCatatan(loan.catatan || '');
    setLoanStatus(loan.status);
    setIsFormModalOpen(true);
  };

  const handleSaveLoanForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaKaryawan.trim()) {
      alert(loanCategory === 'karyawan' ? 'Mohon isi nama karyawan peminjam.' : 'Mohon isi nama perusahaan / rekanan peminjam.');
      return;
    }
    const numAmount = Number(jumlahPinjaman) || 0;
    if (numAmount <= 0) {
      alert('Mohon masukkan jumlah nominal pinjaman yang valid.');
      return;
    }

    if (editingLoan) {
      const updated = loans.map(l => {
        if (l.id === editingLoan.id) {
          return {
            ...l,
            nomorPinjaman: nomorPinjaman.trim() || l.nomorPinjaman,
            tanggalPermohonan,
            namaKaryawan: namaKaryawan.trim(),
            category: loanCategory,
            divisi: divisi.trim(),
            alasanPeminjaman: alasanPeminjaman.trim(),
            jumlahPinjaman: numAmount,
            tenorBulan: Number(tenorBulan) || undefined,
            cicilanPerBulan: Number(cicilanPerBulan) || undefined,
            caraPembayaran: caraPembayaran.trim(),
            tanggalPengambilanPinjaman,
            peminjamRole: peminjamRole.trim() || 'Diajukan',
            peminjamNama: namaKaryawan.trim(),
            peminjamJabatan: peminjamJabatan.trim(),
            atasanRole: atasanRole.trim() || 'Diverifikasi',
            atasanNama: atasanNama.trim(),
            atasanJabatan: atasanJabatan.trim(),
            financeRole: financeRole.trim() || 'Diverifikasi',
            financeNama: financeNama.trim(),
            financeJabatan: financeJabatan.trim(),
            direkturRole: direkturRole.trim() || 'Disetujui',
            direkturNama: direkturNama.trim(),
            direkturJabatan: direkturJabatan.trim(),
            additionalSigners: [...additionalSigners],
            catatan: catatan.trim(),
            status: loanStatus,
            updatedAt: new Date().toISOString()
          };
        }
        return l;
      });
      handleUpdateLoans(updated);
    } else {
      const newLoan: EmployeeLoan = {
        id: 'loan-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        nomorPinjaman: nomorPinjaman.trim() || generateNextLoanNumber(loans),
        tanggalPermohonan,
        namaKaryawan: namaKaryawan.trim(),
        category: loanCategory,
        divisi: divisi.trim() || (loanCategory === 'karyawan' ? 'Operasional Lapangan' : 'Rekanan Perusahaan / Pihak Ketiga'),
        alasanPeminjaman: alasanPeminjaman.trim(),
        jumlahPinjaman: numAmount,
        tenorBulan: Number(tenorBulan) || undefined,
        cicilanPerBulan: Number(cicilanPerBulan) || undefined,
        caraPembayaran: caraPembayaran.trim() || `Potong Gaji / Angsuran Bulanan`,
        tanggalPengambilanPinjaman,
        peminjamRole: peminjamRole.trim() || 'Diajukan',
        peminjamNama: namaKaryawan.trim(),
        peminjamJabatan: peminjamJabatan.trim() || (loanCategory === 'karyawan' ? 'Karyawan' : 'Pimpinan Rekanan'),
        atasanRole: atasanRole.trim() || 'Diverifikasi',
        atasanNama: atasanNama.trim() || 'Andi Muhammad Rifki',
        atasanJabatan: atasanJabatan.trim() || 'Direktur',
        financeRole: financeRole.trim() || 'Diverifikasi',
        financeNama: financeNama.trim() || 'Harijon',
        financeJabatan: financeJabatan.trim() || 'Direktur Keuangan',
        direkturRole: direkturRole.trim() || 'Disetujui',
        direkturNama: direkturNama.trim() || 'Andi Nursyam Halid',
        direkturJabatan: direkturJabatan.trim() || 'Direktur Utama',
        additionalSigners: [...additionalSigners],
        catatan: catatan.trim(),
        status: loanStatus,
        payments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      handleUpdateLoans([newLoan, ...loans]);
    }

    setIsFormModalOpen(false);
  };

  // Signer Configuration Handlers
  const handleOpenSignerConfig = (loan: EmployeeLoan) => {
    setTargetLoanForSigners(loan);
    setPeminjamRole(loan.peminjamRole || 'Diajukan');
    setPeminjamJabatan(loan.peminjamJabatan || loan.divisi || 'Karyawan');
    setNamaKaryawan(loan.peminjamNama || loan.namaKaryawan || '');
    setAtasanRole(loan.atasanRole || 'Diverifikasi');
    setAtasanNama(loan.atasanNama || 'Andi Muhammad Rifki');
    setAtasanJabatan(loan.atasanJabatan || 'Direktur');
    setFinanceRole(loan.financeRole || 'Diverifikasi');
    setFinanceNama(loan.financeNama || 'Harijon');
    setFinanceJabatan(loan.financeJabatan || 'Direktur Keuangan');
    setDirekturRole(loan.direkturRole || 'Disetujui');
    setDirekturNama(loan.direkturNama || 'Andi Nursyam Halid');
    setDirekturJabatan(loan.direkturJabatan || 'Direktur Utama');
    setAdditionalSigners(loan.additionalSigners ? [...loan.additionalSigners] : []);
    setIsSignerConfigModalOpen(true);
  };

  const handleSaveSignerConfig = () => {
    if (!targetLoanForSigners) return;
    const updatedLoan: EmployeeLoan = {
      ...targetLoanForSigners,
      peminjamRole: peminjamRole.trim() || 'Diajukan',
      peminjamNama: (namaKaryawan || targetLoanForSigners.namaKaryawan).trim(),
      peminjamJabatan: (peminjamJabatan || targetLoanForSigners.peminjamJabatan || 'Karyawan').trim(),
      atasanRole: atasanRole.trim() || 'Diverifikasi',
      atasanNama: atasanNama.trim(),
      atasanJabatan: atasanJabatan.trim(),
      financeRole: financeRole.trim() || 'Diverifikasi',
      financeNama: financeNama.trim(),
      financeJabatan: financeJabatan.trim(),
      direkturRole: direkturRole.trim() || 'Disetujui',
      direkturNama: direkturNama.trim(),
      direkturJabatan: direkturJabatan.trim(),
      additionalSigners: [...additionalSigners],
      updatedAt: new Date().toISOString()
    };

    const updatedList = loans.map(l => (l.id === updatedLoan.id ? updatedLoan : l));
    handleUpdateLoans(updatedList);

    if (targetLoanForPrint && targetLoanForPrint.id === updatedLoan.id) {
      setTargetLoanForPrint(updatedLoan);
    }

    setIsSignerConfigModalOpen(false);
  };

  const handleAddAdditionalSigner = (preset?: { role?: string; nama?: string; jabatan?: string }) => {
    const newSigner: LoanSigner = {
      id: 'signer-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      role: preset?.role || 'Disetujui',
      nama: preset?.nama || '',
      jabatan: preset?.jabatan || '',
      tanggal: new Date().toISOString().split('T')[0]
    };
    setAdditionalSigners(prev => [...prev, newSigner]);
  };

  const handleUpdateAdditionalSigner = (id: string, field: keyof LoanSigner, value: string) => {
    setAdditionalSigners(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleRemoveAdditionalSigner = (id: string) => {
    setAdditionalSigners(prev => prev.filter(s => s.id !== id));
  };

  const handleUnlinkVoucherFromLoan = (loan: EmployeeLoan, submissionId?: string, kodeDokumen?: string) => {
    const ident = kodeDokumen || submissionId || 'transaksi ini';
    if (!window.confirm(`Lepaskan tautan ${ident} dari pinjaman "${loan.namaKaryawan}"?\n\nAMAN: Transaksi voucher kas asli di aplikasi TIDAK AKAN terhapus. Hanya dicoret/dilepaskan dari daftar pinjaman ini.`)) {
      return;
    }
    const updatedLoan = manuallyUnlinkVoucherFromLoan(loan, submissionId || '');
    const updated = loans.map(l => l.id === loan.id ? updatedLoan : l);
    handleUpdateLoans(updated);
    setSyncMessage(`🔗 Tautan voucher ${ident} berhasil dilepas dari pinjaman. Data voucher transaksi tetap aman.`);
    setTimeout(() => setSyncMessage(''), 6000);
  };

  const handleDeleteLoan = (loan: EmployeeLoan) => {
    if (!window.confirm(`Hapus formulir pinjaman ${loan.nomorPinjaman} atas nama "${loan.namaKaryawan}" dari menu pinjaman?\n\nAMAN: Transaksi voucher pengeluaran kas di aplikasi TIDAK AKAN terhapus. Hanya kartu catatan pinjaman ini yang dihapus.`)) {
      return;
    }
    const updated = loans.filter(l => l.id !== loan.id);
    handleUpdateLoans(updated);
  };

  // Payment Recording
  const handleOpenPaymentModal = (loan: EmployeeLoan) => {
    const summary = calculateLoanSummary(loan);
    setTargetLoanForPayment(loan);
    setPayTanggal(new Date().toISOString().split('T')[0]);
    // Pre-fill with monthly installment or remaining balance
    const suggestedAmt = Math.min(summary.sisaPinjaman, Number(loan.cicilanPerBulan) || summary.sisaPinjaman);
    setPayJumlah(suggestedAmt > 0 ? suggestedAmt : '');
    setPayMetode('Potong Gaji');
    setPayKeterangan(`Angsuran ke-${summary.paymentCount + 1} (${loan.namaKaryawan})`);
    setPayNomorBukti(`SLIP-${new Date().toISOString().slice(0, 7).replace('-', '')}`);
    setPayDiterimaOleh(userProfile?.displayName || 'Sri Ekowati (Finance)');
    setIsPaymentModalOpen(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLoanForPayment) return;
    const amt = Number(payJumlah) || 0;
    if (amt <= 0) {
      alert('Mohon masukkan nominal pembayaran yang valid.');
      return;
    }

    const newPayment: LoanPayment = {
      id: 'pay-' + Date.now(),
      tanggalBayar: payTanggal,
      jumlahBayar: amt,
      metodePembayaran: payMetode,
      keterangan: payKeterangan.trim() || `Angsuran (${targetLoanForPayment.namaKaryawan})`,
      nomorBukti: payNomorBukti.trim() || undefined,
      diterimaOleh: payDiterimaOleh.trim() || 'Finance',
      createdAt: new Date().toISOString()
    };

    const updated = loans.map(l => {
      if (l.id === targetLoanForPayment.id) {
        const existingPayments = Array.isArray(l.payments) ? l.payments : [];
        const nextPayments = [newPayment, ...existingPayments];
        const nextSummary = calculateLoanSummary({ ...l, payments: nextPayments });
        return {
          ...l,
          payments: nextPayments,
          status: nextSummary.sisaPinjaman <= 0 ? 'Lunas' : l.status,
          updatedAt: new Date().toISOString()
        };
      }
      return l;
    });

    handleUpdateLoans(updated);
    setIsPaymentModalOpen(false);
  };

  const handleDeletePayment = (loanId: string, paymentId: string) => {
    if (!window.confirm('Hapus catatan pembayaran/angsuran ini? Sisa pinjaman akan dikalkulasi ulang otomatis.\n\nAMAN: Transaksi voucher pengeluaran kas asli di aplikasi TIDAK AKAN terhapus.')) return;
    const updated = loans.map(l => {
      if (l.id === loanId) {
        const nextPayments = (l.payments || []).filter(p => p.id !== paymentId);
        const nextSummary = calculateLoanSummary({ ...l, payments: nextPayments });
        return {
          ...l,
          payments: nextPayments,
          status: (nextSummary.sisaPinjaman <= 0 ? 'Lunas' : 'Belum Lunas') as EmployeeLoan['status'],
          updatedAt: new Date().toISOString()
        };
      }
      return l;
    });
    handleUpdateLoans(updated);

    if (targetLoanForHistory && targetLoanForHistory.id === loanId) {
      const found = updated.find(l => l.id === loanId);
      if (found) setTargetLoanForHistory(found);
    }
  };

  // Open Printable View
  const handleOpenPrintModal = (loan: EmployeeLoan) => {
    setTargetLoanForPrint(loan);
    setPrintWithLedger(true);
    setShowKopSuratInPrint(true);
    setZoomLevel(0.85);
    setIsPrintModalOpen(true);
  };

  const handlePrintBlankForm = () => {
    const blankLoan: EmployeeLoan = {
      id: 'blank',
      nomorPinjaman: 'PK-_____-____',
      tanggalPermohonan: '',
      namaKaryawan: '',
      divisi: '',
      alasanPeminjaman: '',
      jumlahPinjaman: 0,
      caraPembayaran: '',
      tanggalPengambilanPinjaman: '',
      peminjamNama: '',
      peminjamJabatan: '',
      atasanNama: 'Andi Muhammad Rifki',
      atasanJabatan: 'Direktur',
      financeNama: 'Harijon',
      financeJabatan: 'Direktur Keuangan',
      direkturNama: 'Andi Nursyam Halid',
      direkturJabatan: 'Direktur Utama',
      catatan: '',
      status: 'Menunggu Persetujuan',
      payments: [],
      createdAt: ''
    };
    setTargetLoanForPrint(blankLoan);
    setPrintWithLedger(false);
    setIsPrintModalOpen(true);
  };

  // Dedicated Print Handler with Document Isolation
  const handlePrintDocument = () => {
    if (!targetLoanForPrint) return;
    document.body.classList.add('is-printing-employee-loan');
    const originalTitle = document.title;
    const cleanNo = (targetLoanForPrint.nomorPinjaman || 'KARYAWAN').replace(/[^a-zA-Z0-9_-]/g, '_');
    document.title = `FORM_PINJAMAN_${cleanNo}`;

    const cleanup = () => {
      document.body.classList.remove('is-printing-employee-loan');
      document.title = originalTitle;
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 2500);
    }, 150);
  };

  // Preview directly from form modal before or during editing
  const handlePreviewFromFormModal = () => {
    const previewLoan: EmployeeLoan = {
      id: editingLoan?.id || 'preview-' + Date.now(),
      nomorPinjaman: nomorPinjaman.trim() || 'PK-_____-____',
      tanggalPermohonan,
      namaKaryawan: namaKaryawan.trim(),
      divisi: divisi.trim(),
      alasanPeminjaman: alasanPeminjaman.trim(),
      jumlahPinjaman: typeof jumlahPinjaman === 'number' ? jumlahPinjaman : 0,
      tenorBulan,
      cicilanPerBulan: typeof cicilanPerBulan === 'number' ? cicilanPerBulan : undefined,
      caraPembayaran: caraPembayaran.trim(),
      tanggalPengambilanPinjaman,
      peminjamRole,
      peminjamNama: namaKaryawan.trim(),
      peminjamJabatan: peminjamJabatan.trim() || divisi.trim() || 'Karyawan',
      atasanRole,
      atasanNama,
      atasanJabatan,
      financeRole,
      financeNama,
      financeJabatan,
      direkturRole,
      direkturNama,
      direkturJabatan,
      additionalSigners: [...additionalSigners],
      catatan: catatan.trim(),
      status: loanStatus,
      payments: editingLoan?.payments || [],
      createdAt: editingLoan?.createdAt || new Date().toISOString()
    };
    setTargetLoanForPrint(previewLoan);
    setPrintWithLedger(true);
    setShowKopSuratInPrint(true);
    setZoomLevel(0.85);
    setIsPrintModalOpen(true);
  };

  // Category Counts
  const categoryCounts = useMemo(() => {
    let allCount = loans.length;
    let karyawanCount = 0;
    let perusahaanCount = 0;

    loans.forEach(l => {
      const cat = l.category || determineLoanCategory(l.namaKaryawan, undefined, workers);
      if (cat === 'karyawan') karyawanCount++;
      else perusahaanCount++;
    });

    return { allCount, karyawanCount, perusahaanCount };
  }, [loans, workers]);

  // Filtered Loans
  const filteredLoans = useMemo(() => {
    return loans.filter(l => {
      const summary = calculateLoanSummary(l);
      // 'aktif' = Default: hanya tampilkan hutang berjalan yang belum lunas
      if (statusFilter === 'aktif' && summary.effectiveStatus === 'Lunas') return false;
      if (statusFilter === 'lunas' && summary.effectiveStatus !== 'Lunas') return false;
      if (statusFilter === 'cicilan' && summary.effectiveStatus !== 'Dalam Cicilan') return false;
      if (statusFilter === 'belum_bayar' && summary.effectiveStatus !== 'Belum Dibayar') return false;
      if (statusFilter === 'pending' && summary.effectiveStatus !== 'Menunggu Persetujuan') return false;

      const cat = l.category || determineLoanCategory(l.namaKaryawan, undefined, workers);
      if (categoryFilter === 'karyawan' && cat !== 'karyawan') return false;
      if (categoryFilter === 'perusahaan' && cat !== 'perusahaan') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        l.nomorPinjaman.toLowerCase().includes(q) ||
        l.namaKaryawan.toLowerCase().includes(q) ||
        (l.divisi && l.divisi.toLowerCase().includes(q)) ||
        (l.alasanPeminjaman && l.alasanPeminjaman.toLowerCase().includes(q)) ||
        (l.caraPembayaran && l.caraPembayaran.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      // Urutkan pinjaman dari aktivitas terbaru / permohonan terbaru ke yang terlama
      const dateA = a.updatedAt || a.tanggalPermohonan || a.createdAt || '';
      const dateB = b.updatedAt || b.tanggalPermohonan || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });
  }, [loans, searchQuery, statusFilter, categoryFilter, workers]);

  // Overall Totals
  const overallStats = useMemo(() => {
    let totalPinjaman = 0;
    let totalTerbayar = 0;
    let sisaPiutang = 0;
    let peminjamAktif = 0;
    let peminjamLunas = 0;

    loans.forEach(l => {
      const s = calculateLoanSummary(l);
      totalPinjaman += s.totalPinjaman;
      totalTerbayar += s.totalDibayar;
      sisaPiutang += s.sisaPinjaman;
      if (s.effectiveStatus === 'Lunas') {
        peminjamLunas++;
      } else {
        peminjamAktif++;
      }
    });

    const progressKeseluruhan = totalPinjaman > 0 ? Math.round((totalTerbayar / totalPinjaman) * 100) : 0;

    return {
      totalPinjaman,
      totalTerbayar,
      sisaPiutang,
      peminjamAktif,
      peminjamLunas,
      progressKeseluruhan
    };
  }, [loans]);

  return (
    <div className="min-h-screen bg-stone-100/70 p-3 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* TOP HEADER & NAVIGATION */}
        <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <button
              type="button"
              onClick={onBackToList}
              className="p-2 sm:p-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 transition cursor-pointer shrink-0 shadow-3xs"
              title="Kembali ke Dashboard Transaksi"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md font-bold">
                  PT Nusantara Mineral Sukses Abadi
                </span>
                <span className="text-[10px] font-mono uppercase bg-blue-100 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md font-bold">
                  Modul Finansial
                </span>
              </div>
              <h1 className="text-lg sm:text-2xl font-black text-stone-900 tracking-tight font-display mt-0.5 flex items-center gap-2">
                <CreditCard className="text-amber-600 w-6 h-6 shrink-0" />
                <span>Form Pinjaman Karyawan &amp; Rekap Cicilan</span>
              </h1>
              <p className="text-xs text-stone-500 mt-0.5">
                Pencatatan permohonan pinjaman resmi, persetujuan direksi, serta kartu kalkulasi pembayaran &amp; sisa piutang.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}#/form-pinjaman`;
                navigator.clipboard.writeText(url);
                setSyncMessage(`📋 Tautan formulir karyawan disalin: ${url}`);
                setTimeout(() => setSyncMessage(''), 6000);
              }}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
              title="Salin link formulir mandiri untuk dibagikan ke karyawan"
            >
              <Share2 size={14} className="text-amber-700" />
              <span>Bagikan Form Karyawan</span>
            </button>

            <a
              href="#/form-pinjaman"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs font-bold rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-750 transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
              title="Buka website formulir mandiri karyawan di tab baru"
            >
              <ExternalLink size={14} className="text-stone-500" />
              <span className="hidden sm:inline">Portal Karyawan</span>
            </a>

            <button
              type="button"
              onClick={handlePrintBlankForm}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-750 transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
              title="Cetak formulir fisik kosong untuk diisi manual"
            >
              <Printer size={14} className="text-stone-500" />
              <span>Cetak Form Kosong</span>
            </button>

            <button
              type="button"
              onClick={handleOpenNewLoanForm}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-600/20"
            >
              <Plus size={16} />
              <span>+ Buat Permohonan Baru</span>
            </button>
          </div>
        </div>

        {/* SYNC NOTIFICATION BANNER */}
        {syncMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-850 text-xs font-bold flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{syncMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSyncMessage('')}
              className="text-emerald-600 hover:text-emerald-850 text-xs font-mono"
            >
              ✕
            </button>
          </div>
        )}

        {/* PRIMARY CATEGORY TABS (Semua vs Pinjaman Karyawan vs Pinjaman Perusahaan) */}
        <div className="bg-white border border-stone-200/90 rounded-2xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
              }`}
            >
              <CreditCard size={15} />
              <span>Semua Pinjaman</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                categoryFilter === 'all' ? 'bg-stone-700 text-white' : 'bg-stone-200 text-stone-800'
              }`}>
                {categoryCounts.allCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCategoryFilter('karyawan')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer ${
                categoryFilter === 'karyawan'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
              }`}
            >
              <User size={15} />
              <span>Pinjaman Karyawan</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                categoryFilter === 'karyawan' ? 'bg-amber-800 text-white' : 'bg-amber-200 text-amber-900'
              }`}>
                {categoryCounts.karyawanCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCategoryFilter('perusahaan')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer ${
                categoryFilter === 'perusahaan'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
              }`}
            >
              <Building size={15} />
              <span>Pinjaman Perusahaan</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                categoryFilter === 'perusahaan' ? 'bg-indigo-800 text-white' : 'bg-indigo-200 text-indigo-900'
              }`}>
                {categoryCounts.perusahaanCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsManualSyncModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-sky-600 hover:bg-sky-700 text-white transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
              title="Hubungkan atau ganti transaksi voucher kas dengan pinjaman secara manual"
            >
              <Link size={13} />
              <span>Sinkron Manual &amp; Ganti Tautan</span>
            </button>
            <button
              type="button"
              onClick={handleManualSyncSubmissions}
              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
              title="Sinkronkan ulang seluruh transaksi voucher pengeluaran kas/bank berjenis pinjaman dan akumulasikan saldo peminjam yang sama"
            >
              <RefreshCw size={13} className="text-amber-700" />
              <span>Auto-Sinkronkan</span>
            </button>
          </div>
        </div>

        {/* SUMMARY STATS CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Pinjaman */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-stone-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Pinjaman</span>
              <div className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
                <CreditCard size={14} />
              </div>
            </div>
            <div className="text-lg sm:text-xl font-black font-mono text-stone-900">
              {formatRupiah(overallStats.totalPinjaman)}
            </div>
            <div className="text-[10px] text-stone-500 mt-1">
              Dari <strong>{loans.length}</strong> formulir pengajuan
            </div>
          </div>

          {/* Card 2: Total Pembayaran Diterima */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-stone-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Total Terbayar</span>
              <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
                <CheckCircle2 size={14} />
              </div>
            </div>
            <div className="text-lg sm:text-xl font-black font-mono text-emerald-950">
              {formatRupiah(overallStats.totalTerbayar)}
            </div>
            <div className="text-[10px] text-emerald-700 font-bold mt-1">
              Progress Pelunasan: {overallStats.progressKeseluruhan}%
            </div>
          </div>

          {/* Card 3: Sisa Piutang Karyawan */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-stone-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-800">Sisa Piutang</span>
              <div className="p-1.5 bg-red-50 text-red-700 rounded-lg">
                <TrendingDown size={14} />
              </div>
            </div>
            <div className="text-lg sm:text-xl font-black font-mono text-red-950">
              {formatRupiah(overallStats.sisaPiutang)}
            </div>
            <div className="text-[10px] text-stone-500 mt-1">
              Hutang berjalan yang belum lunas
            </div>
          </div>

          {/* Card 4: Status Peminjam */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-stone-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Status Karyawan</span>
              <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg">
                <User size={14} />
              </div>
            </div>
            <div className="text-lg sm:text-xl font-black font-mono text-stone-900">
              {overallStats.peminjamAktif} <span className="text-xs font-normal text-stone-500">Aktif</span> / {overallStats.peminjamLunas} <span className="text-xs font-normal text-emerald-600">Lunas</span>
            </div>
            <div className="text-[10px] text-stone-500 mt-1">
              Rekapitulasi status karyawan peminjam
            </div>
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari nama karyawan, no. pinjaman, alasan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {[
              { id: 'aktif', label: 'Daftar Hutang (Belum Lunas)', count: overallStats.peminjamAktif },
              { id: 'lunas', label: 'Lunas', count: overallStats.peminjamLunas },
              { id: 'all', label: 'Semua Pinjaman', count: loans.length },
              { id: 'cicilan', label: 'Dalam Cicilan' },
              { id: 'belum_bayar', label: 'Belum Ada Pembayaran' },
              { id: 'pending', label: 'Menunggu Persetujuan' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  statusFilter === tab.id
                    ? 'bg-amber-600 text-white shadow-3xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                    statusFilter === tab.id
                      ? 'bg-amber-800 text-white'
                      : 'bg-stone-200 text-stone-800'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* MAIN LIST OF LOANS */}
        <div className="space-y-3">
          {filteredLoans.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-3">
                <CreditCard size={24} />
              </div>
              <h3 className="font-bold text-sm text-stone-850">Tidak ada data pinjaman karyawan ditemukan</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto mt-1">
                {searchQuery
                  ? `Tidak ada hasil pencarian yang cocok dengan kata kunci "${searchQuery}".`
                  : 'Belum ada formulir permohonan pinjaman karyawan yang dicatat.'}
              </p>
              <button
                type="button"
                onClick={handleOpenNewLoanForm}
                className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-3xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Buat Pengajuan Pinjaman Baru</span>
              </button>
            </div>
          ) : (
            filteredLoans.map((loan) => {
              const summary = calculateLoanSummary(loan);
              const payments = loan.payments || [];
              const linkedVoucher = findLinkedVoucherForLoan(loan);
              const isConnectedToVoucher = isLoanConnectedToVoucher(loan, linkedVoucher);
              const showDisbursementAccordion =
                Array.isArray(loan.disbursements) &&
                (loan.disbursements.length > 1 || (!linkedVoucher && loan.disbursements.length === 1));

              return (
                <div
                  key={loan.id}
                  className={`bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-amber-300 transition duration-150 ${
                    openLoanMenuId === loan.id ? 'relative z-30 border-amber-300' : ''
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Info Peminjam */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs bg-stone-100 border border-stone-200 text-stone-800 px-2 py-0.5 rounded-md">
                          {loan.nomorPinjaman}
                        </span>

                        {/* Kategori Badge: Perusahaan vs Karyawan (Klik untuk ubah) */}
                        <button
                          type="button"
                          onClick={() => handleToggleCategory(loan)}
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-3xs cursor-pointer transition ${
                            ((loan.category || determineLoanCategory(loan.namaKaryawan, undefined, workers)) === 'perusahaan')
                              ? 'bg-indigo-100 text-indigo-950 border border-indigo-300 hover:bg-indigo-200'
                              : 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200'
                          }`}
                          title="Klik untuk mengubah kategori antara Pinjaman Karyawan dan Perusahaan"
                        >
                          {((loan.category || determineLoanCategory(loan.namaKaryawan, undefined, workers)) === 'perusahaan') ? (
                            <>
                              <Building size={11} className="text-indigo-700" />
                              <span>Pinjaman Perusahaan</span>
                            </>
                          ) : (
                            <>
                              <User size={11} className="text-amber-700" />
                              <span>Pinjaman Karyawan</span>
                            </>
                          )}
                        </button>

                        <span className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                          summary.effectiveStatus === 'Lunas'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : summary.effectiveStatus === 'Dalam Cicilan'
                            ? 'bg-blue-100 text-blue-900 border-blue-300'
                            : summary.effectiveStatus === 'Menunggu Persetujuan'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : summary.effectiveStatus === 'Ditolak'
                            ? 'bg-red-100 text-red-900 border-red-300'
                            : 'bg-stone-100 text-stone-800 border-stone-300'
                        }`}>
                          {summary.effectiveStatus === 'Lunas' ? (
                            <CheckCircle2 size={12} className="text-emerald-700" />
                          ) : (
                            <Clock size={12} className="text-amber-700" />
                          )}
                          <span>{summary.effectiveStatus}</span>
                        </span>
                        <span className="text-[11px] text-stone-500">
                          Diajukan: <strong>{formatTanggalIndo(loan.tanggalPermohonan)}</strong>
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2">
                        <h3 className="font-bold text-base sm:text-lg text-stone-900 tracking-tight">
                          {loan.namaKaryawan}
                        </h3>
                        {loan.divisi && (
                          <span className="text-xs font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded">
                            {loan.divisi}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-stone-600 line-clamp-2">
                        <strong>Alasan:</strong> {loan.alasanPeminjaman || '-'}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-stone-500 flex-wrap pt-0.5">
                        <span>Skema: <strong>{loan.caraPembayaran || '-'}</strong></span>
                        <span>•</span>
                        <span>Pencairan: <strong>{formatTanggalIndo(loan.tanggalPengambilanPinjaman)}</strong></span>
                        {summary.paymentCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-800 font-bold">
                              {summary.paymentCount}x Pembayaran Tercatat
                            </span>
                          </>
                        )}
                      </div>

                      {/* Riwayat Akumulasi Transaksi Voucher Kas/Bank HO (ditampilkan bila multi-voucher atau belum ter-match di list voucher) */}
                      {showDisbursementAccordion && loan.disbursements && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setExpandedDisbursements(prev => ({ ...prev, [loan.id]: !prev[loan.id] }))}
                            className="text-[11px] font-bold text-amber-850 hover:text-amber-950 flex items-center gap-1.5 cursor-pointer bg-amber-50/80 hover:bg-amber-100 px-2.5 py-1 rounded-xl border border-amber-300/80 transition shadow-3xs"
                          >
                            <Layers size={13} className="text-amber-700" />
                            <span>
                              {loan.disbursements.length > 1
                                ? `Terakumulasi dari ${loan.disbursements.length} transaksi voucher (Total: ${formatRupiah(loan.jumlahPinjaman)})`
                                : `Terhubung dengan Voucher Kas ${loan.disbursements[0].kodeDokumen || '-'}`}
                            </span>
                            <ChevronRight size={13} className={`transform transition-transform ${expandedDisbursements[loan.id] ? 'rotate-90' : ''}`} />
                          </button>

                          {expandedDisbursements[loan.id] && (
                            <div className="mt-2 bg-stone-50 rounded-xl p-3 border border-stone-200 space-y-1.5 text-xs font-mono">
                              <div className="font-bold text-stone-700 text-[10px] uppercase tracking-wide">
                                Rincian Transaksi Voucher Terakumulasi:
                              </div>
                              {loan.disbursements.map((d, dIdx) => (
                                <div key={d.id || dIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-1.5 border-b border-stone-200/60 last:border-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-stone-500">{d.tanggal}</span>
                                    <span className="font-bold text-stone-900 bg-white px-1.5 py-0.5 rounded border border-stone-200">{d.kodeDokumen || '-'}</span>
                                    <span className="text-stone-600 truncate max-w-xs">{d.keterangan || '-'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                    <span className="font-bold text-stone-900">{formatRupiah(d.jumlah)}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-sans font-bold ${
                                      d.statusPembayaran === 'Lunas' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {d.statusPembayaran || 'Tercatat'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleUnlinkVoucherFromLoan(loan, d.submissionId, d.kodeDokumen)}
                                      className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                      title="Lepaskan transaksi ini dari pinjaman jika bukan pinjaman (Transaksi kas di aplikasi TIDAK AKAN terhapus)"
                                    >
                                      <Unlink size={12} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Linked Voucher HO Badge & Status */}
                      {linkedVoucher && (!loan.disbursements || loan.disbursements.length <= 1) && (
                        <div className="pt-1.5 flex items-center gap-2 flex-wrap">
                          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-emerald-50 border border-emerald-300 rounded-xl text-xs shadow-3xs">
                            <FileCheck size={13} className="text-emerald-700 shrink-0" />
                            <span className="text-stone-600 font-medium">Voucher HO:</span>
                            <span className="font-mono font-black text-emerald-950">{linkedVoucher.kode}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase ${
                              linkedVoucher.status === 'Lunas' ? 'bg-emerald-200 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
                            }`}>
                              {linkedVoucher.status === 'Lunas' ? 'LUNAS (SUDAH DIBAYAR)' : 'BELUM DIBAYAR'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUnlinkVoucherFromLoan(loan, linkedVoucher.id, linkedVoucher.kode)}
                              className="text-stone-400 hover:text-red-600 p-0.5 rounded transition cursor-pointer ml-0.5"
                              title="Lepaskan tautan voucher ini dari catatan pinjaman (Transaksi voucher kas tetap aman)"
                            >
                              <Unlink size={12} />
                            </button>
                            {onViewSubmission && (
                              <button
                                type="button"
                                onClick={() => onViewSubmission(linkedVoucher)}
                                className="text-emerald-800 hover:text-emerald-950 font-bold ml-1 underline flex items-center gap-1 cursor-pointer"
                              >
                                <span>Buka Dokumen</span>
                                <ExternalLink size={10} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Middle: Kalkulasi Finansial & Progress */}
                    <div className="bg-stone-50/90 border border-stone-200/90 rounded-xl p-3 sm:p-4 min-w-[260px] sm:min-w-[300px] shrink-0 space-y-2">
                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-stone-500 font-medium">Jumlah Pinjaman:</span>
                        <span className="font-mono font-bold text-stone-900 text-sm">
                          {formatRupiah(summary.totalPinjaman)}
                        </span>
                      </div>

                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-emerald-800 font-medium">Total Terbayar:</span>
                        <span className="font-mono font-bold text-emerald-950 text-sm">
                          {formatRupiah(summary.totalDibayar)}
                        </span>
                      </div>

                      <div className="flex justify-between items-baseline text-xs pt-1 border-t border-stone-200">
                        <span className="text-red-800 font-bold">Sisa Pinjaman:</span>
                        <span className="font-mono font-black text-red-950 text-sm sm:text-base">
                          {formatRupiah(summary.sisaPinjaman)}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1 pt-1">
                        <div className="flex justify-between text-[10px] font-mono text-stone-500">
                          <span>Progress Cicilan</span>
                          <span>{summary.progressPersen}%</span>
                        </div>
                        <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              summary.progressPersen >= 100
                                ? 'bg-emerald-600'
                                : 'bg-amber-600'
                            }`}
                            style={{ width: `${summary.progressPersen}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Right: Compact Dropdown Menu Trigger */}
                    <div className="flex items-center justify-end lg:justify-center shrink-0 self-end lg:self-center w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-stone-100 loan-action-menu-root">
                      <button
                        type="button"
                        id={`btn-loan-action-${loan.id}`}
                        aria-expanded={openLoanMenuId === loan.id}
                        aria-haspopup="menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openLoanMenuId === loan.id) {
                            setOpenLoanMenuId(null);
                            setLoanMenuPosition(null);
                          } else {
                            setOpenLoanMenuId(loan.id);
                            updateLoanMenuPosition(loan.id);
                          }
                        }}
                        className={`w-full lg:w-auto px-3.5 py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 shadow-3xs cursor-pointer whitespace-nowrap ${
                          openLoanMenuId === loan.id
                            ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                            : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-250'
                        }`}
                        title={isConnectedToVoucher ? 'Menu tindakan pinjaman (Sudah terhubung voucher)' : 'Menu tindakan pinjaman'}
                      >
                        <span>Tindakan</span>
                        <MoreVertical size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL 1: FORM PINJAMAN KARYAWAN (TAMBAH / EDIT) */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-900 rounded-xl">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-stone-900">
                    {editingLoan ? 'Edit Form Pinjaman Karyawan' : 'Buat Permohonan Pinjaman Karyawan Baru'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Sesuai format resmi PT. Nusantara Mineral Sukses Abadi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveLoanForm} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Nomor Pinjaman */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Nomor Pinjaman (Ref):
                  </label>
                  <input
                    type="text"
                    required
                    value={nomorPinjaman}
                    onChange={(e) => setNomorPinjaman(e.target.value)}
                    placeholder="Contoh: PK-202611-001"
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                {/* Tanggal Permohonan */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Tanggal Permohonan:
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalPermohonan}
                    onChange={(e) => setTanggalPermohonan(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Kategori Pinjaman: Karyawan vs Perusahaan */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1.5">
                  Kategori Pinjaman:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLoanCategory('karyawan');
                      if (divisi.includes('Rekanan') || divisi.includes('Perusahaan')) {
                        setDivisi('Operasional Lapangan');
                      }
                    }}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-2 cursor-pointer transition ${
                      loanCategory === 'karyawan'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-3xs'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    <User size={14} />
                    <span>Pinjaman Karyawan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLoanCategory('perusahaan');
                      if (!divisi || divisi.includes('Operasional') || divisi.includes('Keuangan')) {
                        setDivisi('Rekanan Perusahaan / Pihak Ketiga');
                      }
                      if (!peminjamJabatan || peminjamJabatan === 'Karyawan') {
                        setPeminjamJabatan('Pimpinan / Penanggung Jawab');
                      }
                    }}
                    className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-2 cursor-pointer transition ${
                      loanCategory === 'perusahaan'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-3xs'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    <Building size={14} />
                    <span>Pinjaman Perusahaan</span>
                  </button>
                </div>
              </div>

              {/* Nama Peminjam & Divisi */}
              <div className="space-y-2.5 p-3.5 bg-stone-50 border border-stone-200 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-stone-800 uppercase flex items-center gap-1.5">
                    {loanCategory === 'karyawan' ? (
                      <>
                        <Users size={14} className="text-amber-600" />
                        <span>Nama Karyawan Peminjam (Tersinkron dengan Absensi NMSA):</span>
                      </>
                    ) : (
                      <>
                        <Building size={14} className="text-indigo-600" />
                        <span>Nama Perusahaan / Pihak Ketiga Rekanan:</span>
                      </>
                    )}
                  </label>
                  {loanCategory === 'karyawan' && (
                    <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      ✓ {workers.length} Karyawan Aktif
                    </span>
                  )}
                </div>

                {/* Quick Selection Chips dari Seluruh Karyawan Absensi */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
                  {workers.map((w) => {
                    const isSelected = namaKaryawan.toLowerCase().trim() === w.name.toLowerCase().trim();
                    return (
                      <button
                        key={w.id || w.name}
                        type="button"
                        onClick={() => {
                          setNamaKaryawan(w.name);
                          let autoDiv = w.division || w.role || 'Operasional Lapangan';
                          if (w.name.toLowerCase().includes('ekowati') || w.name.toLowerCase().includes('dhiya')) {
                            autoDiv = 'Keuangan & Akuntansi';
                          } else if (w.name.toLowerCase().includes('wahyudi') || w.name.toLowerCase().includes('faisal') || w.name.toLowerCase().includes('junaedi')) {
                            autoDiv = 'Operasional Lapangan';
                          }
                          setDivisi(autoDiv);
                          setPeminjamJabatan(w.role || 'Karyawan');
                        }}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer border ${
                          isSelected
                            ? 'bg-amber-500 text-stone-950 border-amber-600 shadow-2xs font-extrabold'
                            : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-stone-950' : 'bg-emerald-500'}`}></span>
                        <span>{w.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Text Input Autocomplete */}
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                      Ketik Nama Karyawan:
                    </label>
                    <input
                      type="text"
                      required
                      list="worker-suggestions"
                      value={namaKaryawan}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNamaKaryawan(val);
                        const matched = workers.find(w => w.name.toLowerCase().trim() === val.toLowerCase().trim());
                        if (matched) {
                          let autoDiv = matched.division || matched.role || 'Operasional Lapangan';
                          if (matched.name.toLowerCase().includes('ekowati') || matched.name.toLowerCase().includes('dhiya')) {
                            autoDiv = 'Keuangan & Akuntansi';
                          }
                          setDivisi(autoDiv);
                          setPeminjamJabatan(matched.role || 'Karyawan');
                        }
                      }}
                      placeholder="Pilih di atas atau ketik nama..."
                      className="w-full px-3 py-2 text-xs font-bold bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <datalist id="worker-suggestions">
                      {workers.map(w => (
                        <option key={w.id} value={w.name}>{w.role ? `${w.name} (${w.role})` : w.name}</option>
                      ))}
                    </datalist>
                  </div>

                  {/* Divisi / Jabatan */}
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                      Divisi / Posisi Pekerjaan:
                    </label>
                    <input
                      type="text"
                      value={divisi}
                      onChange={(e) => {
                        setDivisi(e.target.value);
                        setPeminjamJabatan(e.target.value);
                      }}
                      placeholder="Contoh: Operasional / Keuangan / Lapangan"
                      className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    {/* Quick Division Suggestions */}
                    <div className="flex items-center gap-1 mt-1 text-[9.5px] text-stone-500">
                      <span>Cepat:</span>
                      <button
                        type="button"
                        onClick={() => { setDivisi('Operasional Lapangan'); setPeminjamJabatan('Staff Operasional'); }}
                        className="hover:text-amber-800 underline cursor-pointer"
                      >
                        Operasional
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => { setDivisi('Keuangan & Akuntansi'); setPeminjamJabatan('Staff Keuangan'); }}
                        className="hover:text-amber-800 underline cursor-pointer"
                      >
                        Keuangan
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alasan Peminjaman */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Alasan Peminjaman:
                </label>
                <textarea
                  required
                  rows={2}
                  value={alasanPeminjaman}
                  onChange={(e) => setAlasanPeminjaman(e.target.value)}
                  placeholder="Jelaskan keperluan peminjaman dana (contoh: Biaya mendesak renovasi rumah, keperluan medis, pendidikan, dll)..."
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Jumlah Pinjaman & Skema Cicilan */}
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-800 uppercase mb-1">
                      Jumlah Pinjaman (Rp):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-stone-400">Rp</span>
                      <input
                        type="text"
                        required
                        value={jumlahPinjaman ? jumlahPinjaman.toLocaleString('id-ID') : ''}
                        onChange={(e) => {
                          const clean = e.target.value.replace(/[^0-9]/g, '');
                          const num = clean ? parseInt(clean, 10) : '';
                          setJumlahPinjaman(num);
                        }}
                        placeholder="Contoh: 5.000.000"
                        className="w-full pl-9 pr-3 py-2 text-sm font-mono font-black bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    {typeof jumlahPinjaman === 'number' && jumlahPinjaman > 0 && (
                      <span className="text-[10.5px] italic text-amber-900 block mt-1">
                        Terbilang: {terbilang(jumlahPinjaman)}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-800 uppercase mb-1">
                      Tenor Pembayaran (Bulan):
                    </label>
                    <select
                      value={tenorBulan}
                      onChange={(e) => setTenorBulan(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map(m => (
                        <option key={m} value={m}>{m} Bulan ({m}x Angsuran)</option>
                      ))}
                    </select>
                    {typeof cicilanPerBulan === 'number' && cicilanPerBulan > 0 && (
                      <span className="text-[10.5px] font-mono text-stone-600 block mt-1 font-semibold">
                        Estimasi: {formatRupiah(cicilanPerBulan)} / bulan
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-800 uppercase mb-1">
                    Keterangan Cara Pembayaran:
                  </label>
                  <input
                    type="text"
                    value={caraPembayaran}
                    onChange={(e) => setCaraPembayaran(e.target.value)}
                    placeholder="Contoh: Potong Gaji Bulanan Rp 1.000.000 x 5 Bulan"
                    className="w-full px-3 py-2 text-xs font-bold bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Tanggal Pencairan & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Tanggal Pengambilan / Pencairan:
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalPengambilanPinjaman}
                    onChange={(e) => setTanggalPengambilanPinjaman(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Status Pengajuan:
                  </label>
                  <select
                    value={loanStatus}
                    onChange={(e) => setLoanStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="Menunggu Persetujuan">Menunggu Persetujuan</option>
                    <option value="Disetujui">Disetujui</option>
                    <option value="Belum Lunas">Belum Lunas (Sedang Berjalan)</option>
                    <option value="Lunas">Lunas</option>
                    <option value="Ditolak">Ditolak</option>
                  </select>
                </div>
              </div>

              {/* Catatan */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Catatan Tambahan (Direksi / Finance):
                </label>
                <textarea
                  rows={2}
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Tambahkan catatan syarat, mekanisme pemotongan, atau keterangan transfer..."
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Penandatangan Form Resmi */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-[10.5px] font-mono uppercase font-bold text-stone-700 block">
                      Penandatangan Resmi Sesuai Form:
                    </span>
                    <span className="text-[11px] text-stone-500">
                      4 kolom baris atas + penanda tangan tambahan di baris bawah
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAddAdditionalSigner({ role: 'Disetujui', nama: 'H. ANDI NURSYAM HALID', jabatan: 'Direktur Utama' })}
                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      title="Tambah preset penanda tangan Direktur Utama H. ANDI NURSYAM HALID"
                    >
                      <Plus size={12} />
                      <span>+ Preset Dirut (H. ANDI NURSYAM HALID)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddAdditionalSigner()}
                      className="px-2.5 py-1 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus size={12} />
                      <span>+ Tambah Baru</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-1">
                    <span className="text-[10px] text-stone-500 block font-bold uppercase">Persetujuan Atasan:</span>
                    <input
                      type="text"
                      value={atasanNama}
                      onChange={(e) => setAtasanNama(e.target.value)}
                      placeholder="Nama Atasan"
                      className="w-full px-2 py-1 text-xs font-bold bg-stone-50 border border-stone-200 rounded-md focus:bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={atasanJabatan}
                      onChange={(e) => setAtasanJabatan(e.target.value)}
                      placeholder="Jabatan"
                      className="w-full px-2 py-1 text-[11px] bg-stone-50 border border-stone-200 rounded-md focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-1">
                    <span className="text-[10px] text-stone-500 block font-bold uppercase">Persetujuan Finance:</span>
                    <input
                      type="text"
                      value={financeNama}
                      onChange={(e) => setFinanceNama(e.target.value)}
                      placeholder="Nama Finance"
                      className="w-full px-2 py-1 text-xs font-bold bg-stone-50 border border-stone-200 rounded-md focus:bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={financeJabatan}
                      onChange={(e) => setFinanceJabatan(e.target.value)}
                      placeholder="Jabatan"
                      className="w-full px-2 py-1 text-[11px] bg-stone-50 border border-stone-200 rounded-md focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-stone-200 space-y-1">
                    <span className="text-[10px] text-stone-500 block font-bold uppercase">Persetujuan Direktur:</span>
                    <input
                      type="text"
                      value={direkturNama}
                      onChange={(e) => setDirekturNama(e.target.value)}
                      placeholder="Nama Direktur"
                      className="w-full px-2 py-1 text-xs font-bold bg-stone-50 border border-stone-200 rounded-md focus:bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={direkturJabatan}
                      onChange={(e) => setDirekturJabatan(e.target.value)}
                      placeholder="Jabatan"
                      className="w-full px-2 py-1 text-[11px] bg-stone-50 border border-stone-200 rounded-md focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                {/* Additional Signers List in Form */}
                {additionalSigners.length > 0 && (
                  <div className="pt-2 border-t border-stone-200 space-y-2">
                    <span className="text-[10px] font-bold text-amber-900 uppercase block">
                      Penanda Tangan Tambahan ({additionalSigners.length} Orang - Ukuran 25% Berposisi di Tengah Bawah):
                    </span>

                    <div className="space-y-1.5">
                      {additionalSigners.map((as, idx) => (
                        <div key={as.id} className="p-2 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[10px] text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                            #{idx + 1}
                          </span>
                          <input
                            type="text"
                            value={as.role}
                            onChange={(e) => handleUpdateAdditionalSigner(as.id, 'role', e.target.value)}
                            placeholder="Role (Disetujui)"
                            className="w-24 px-2 py-1 bg-white border border-stone-300 rounded text-xs font-bold"
                          />
                          <input
                            type="text"
                            value={as.nama}
                            onChange={(e) => handleUpdateAdditionalSigner(as.id, 'nama', e.target.value)}
                            placeholder="Nama Lengkap"
                            className="flex-1 px-2 py-1 bg-white border border-stone-300 rounded text-xs font-semibold"
                          />
                          <input
                            type="text"
                            value={as.jabatan}
                            onChange={(e) => handleUpdateAdditionalSigner(as.id, 'jabatan', e.target.value)}
                            placeholder="Jabatan"
                            className="w-32 px-2 py-1 bg-white border border-stone-300 rounded text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveAdditionalSigner(as.id)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-stone-200 flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePreviewFromFormModal}
                  className="px-3.5 py-2 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
                  title="Lihat Pratinjau Form Cetak Resmi"
                >
                  <Printer size={14} className="text-amber-700" />
                  <span>Pratinjau &amp; Cetak Form</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition shadow-3xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Check size={15} />
                    <span>{editingLoan ? 'Simpan Perubahan' : 'Simpan Pengajuan'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CATAT PEMBAYARAN / POTONG GAJI */}
      {isPaymentModalOpen && targetLoanForPayment && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-900 rounded-xl">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-stone-900">
                    Catat Pembayaran / Angsuran Cicilan
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Karyawan: <strong>{targetLoanForPayment.namaKaryawan}</strong> ({targetLoanForPayment.nomorPinjaman})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-4 sm:p-6 space-y-4">
              {/* Snapshot Sisa Pinjaman */}
              {(() => {
                const s = calculateLoanSummary(targetLoanForPayment);
                const payAmt = Number(payJumlah) || 0;
                const newBalance = Math.max(0, s.sisaPinjaman - payAmt);

                return (
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between text-stone-600">
                      <span>Total Pinjaman:</span>
                      <strong className="font-mono">{formatRupiah(s.totalPinjaman)}</strong>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Sisa Sebelum Bayar:</span>
                      <strong className="font-mono text-red-800">{formatRupiah(s.sisaPinjaman)}</strong>
                    </div>
                    {payAmt > 0 && (
                      <div className="flex justify-between text-emerald-800 font-bold pt-1 border-t border-stone-200">
                        <span>Sisa Setelah Pembayaran Ini:</span>
                        <strong className="font-mono">{formatRupiah(newBalance)} {newBalance === 0 ? '✓ (Lunas)' : ''}</strong>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Tanggal Pembayaran:
                  </label>
                  <input
                    type="date"
                    required
                    value={payTanggal}
                    onChange={(e) => setPayTanggal(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Metode Pembayaran:
                  </label>
                  <select
                    value={payMetode}
                    onChange={(e) => setPayMetode(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Potong Gaji">Potong Gaji Bulanan</option>
                    <option value="Transfer Bank">Transfer Bank</option>
                    <option value="Tunai">Tunai / Cash</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Jumlah Pembayaran (Rp):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs font-bold text-stone-400">Rp</span>
                  <input
                    type="text"
                    required
                    value={payJumlah ? payJumlah.toLocaleString('id-ID') : ''}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^0-9]/g, '');
                      setPayJumlah(clean ? parseInt(clean, 10) : '');
                    }}
                    placeholder="Contoh: 1.000.000"
                    className="w-full pl-9 pr-3 py-2 text-base font-mono font-black bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none text-emerald-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Keterangan Pembayaran:
                </label>
                <input
                  type="text"
                  required
                  value={payKeterangan}
                  onChange={(e) => setPayKeterangan(e.target.value)}
                  placeholder="Contoh: Potong gaji angsuran ke-1 (Periode Nov 2026)"
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    No. Bukti / Slip (Opsional):
                  </label>
                  <input
                    type="text"
                    value={payNomorBukti}
                    onChange={(e) => setPayNomorBukti(e.target.value)}
                    placeholder="Contoh: SLIP-NOV-2026"
                    className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                    Petugas Penerima:
                  </label>
                  <input
                    type="text"
                    value={payDiterimaOleh}
                    onChange={(e) => setPayDiterimaOleh(e.target.value)}
                    placeholder="Nama staf finance"
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition shadow-3xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={15} />
                  <span>Simpan Pembayaran</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RIWAYAT PEMBAYARAN & KARTU PIUTANG */}
      {isHistoryModalOpen && targetLoanForHistory && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-stone-900 flex items-center gap-2">
                  <Layers size={18} className="text-amber-600" />
                  <span>Kartu Riwayat Cicilan &amp; Pembayaran</span>
                </h3>
                <p className="text-[11px] text-stone-500">
                  {targetLoanForHistory.namaKaryawan} • Ref: <strong>{targetLoanForHistory.nomorPinjaman}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {/* Summary */}
              {(() => {
                const s = calculateLoanSummary(targetLoanForHistory);
                return (
                  <div className="grid grid-cols-3 gap-2.5 p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <div>
                      <span className="text-[10px] text-stone-500 uppercase font-bold block">Total Pinjaman</span>
                      <strong className="text-sm font-mono text-stone-900">{formatRupiah(s.totalPinjaman)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-800 uppercase font-bold block">Terbayar</span>
                      <strong className="text-sm font-mono text-emerald-950">{formatRupiah(s.totalDibayar)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-red-800 uppercase font-bold block">Sisa Hutang</span>
                      <strong className="text-sm font-mono text-red-950">{formatRupiah(s.sisaPinjaman)}</strong>
                    </div>
                  </div>
                );
              })()}

              {/* Table */}
              <div className="border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-100 text-stone-700 border-b border-stone-200 font-bold">
                      <th className="py-2 px-2.5 w-10 text-center">No.</th>
                      <th className="py-2 px-3">Tanggal</th>
                      <th className="py-2 px-3">Keterangan</th>
                      <th className="py-2 px-3">Metode</th>
                      <th className="py-2 px-3 text-right">Jumlah</th>
                      <th className="py-2 px-2 w-10 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(targetLoanForHistory.payments || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-stone-400 italic">
                          Belum ada pembayaran atau angsuran yang dicatat untuk pinjaman ini.
                        </td>
                      </tr>
                    ) : (
                      (targetLoanForHistory.payments || []).map((p, idx) => (
                        <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50/60">
                          <td className="py-2 px-2.5 text-center font-mono text-stone-400">{idx + 1}</td>
                          <td className="py-2 px-3 font-medium whitespace-nowrap">{formatTanggalIndo(p.tanggalBayar)}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-stone-900">{p.keterangan}</div>
                            {p.nomorBukti && <span className="text-[10px] font-mono text-stone-400">Bukti: {p.nomorBukti}</span>}
                          </td>
                          <td className="py-2 px-3 text-stone-600">{p.metodePembayaran}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-950">
                            {formatRupiah(p.jumlahBayar)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeletePayment(targetLoanForHistory.id, p.id)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition cursor-pointer"
                              title="Hapus Pembayaran"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-stone-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsHistoryModalOpen(false);
                  handleOpenPaymentModal(targetLoanForHistory);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
              >
                <Plus size={14} />
                <span>+ Tambah Pembayaran Baru</span>
              </button>

              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: STUDIO PRATINJAU & CETAK DOKUMEN RESMI (TAMPILAN BARU SESUAI FORMAT NMSA) */}
      {isPrintModalOpen && targetLoanForPrint && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-stone-900/95 backdrop-blur-md text-white overflow-hidden animate-in fade-in duration-150 print:hidden">
          {/* Top Fixed Floating Control Toolbar (Always visible, clean, never scrolls out of view) */}
          <header className="h-16 px-4 sm:px-6 bg-stone-950/90 border-b border-stone-800 flex items-center justify-between shrink-0 z-30 print:hidden select-none">
            {/* Left: Close & Document Meta */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-bold transition cursor-pointer border border-stone-700"
                title="Tutup Pratinjau & Kembali ke Daftar"
              >
                <ArrowLeft size={15} />
                <span className="hidden sm:inline">Kembali</span>
              </button>

              <div className="border-l border-stone-800 pl-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-wide text-white">
                    FORM PINJAMAN KARYAWAN
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {targetLoanForPrint.nomorPinjaman}
                  </span>
                </div>
                <p className="text-[11px] text-stone-400 font-medium truncate max-w-[200px] sm:max-w-xs">
                  {targetLoanForPrint.namaKaryawan} {targetLoanForPrint.divisi ? `• ${targetLoanForPrint.divisi}` : ''}
                </p>
              </div>
            </div>

            {/* Center: Zoom Controls & Scaler (Solves 'terlalu besar' problem) */}
            <div className="hidden md:flex items-center gap-1 bg-stone-900 px-2 py-1 rounded-2xl border border-stone-800">
              <button
                type="button"
                onClick={() => setZoomLevel(z => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition cursor-pointer"
                title="Perkecil Tampilan (-)"
              >
                <ZoomOut size={15} />
              </button>
              
              <button
                type="button"
                onClick={() => setZoomLevel(0.85)}
                className="px-2.5 py-1 text-xs font-mono font-bold text-amber-400 hover:text-amber-300 transition cursor-pointer"
                title="Reset Zoom ke 85% (Pas Layar)"
              >
                {Math.round(zoomLevel * 100)}%
              </button>

              <button
                type="button"
                onClick={() => setZoomLevel(z => Math.min(1.4, +(z + 0.1).toFixed(2)))}
                className="p-1.5 text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition cursor-pointer"
                title="Perbesar Tampilan (+)"
              >
                <ZoomIn size={15} />
              </button>

              <div className="h-4 w-px bg-stone-700 mx-1"></div>

              <button
                type="button"
                onClick={() => setZoomLevel(0.8)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  zoomLevel === 0.8 ? 'bg-amber-500 text-stone-950 font-black' : 'text-stone-300 hover:bg-stone-800'
                }`}
                title="Skala Pas Layar Laptop/Monitor"
              >
                Pas Layar
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                  zoomLevel === 1 ? 'bg-amber-500 text-stone-950 font-black' : 'text-stone-300 hover:bg-stone-800'
                }`}
                title="Skala 100% Ukuran Asli Cetak"
              >
                100%
              </button>
            </div>

            {/* Right: Toggles, Signer Manager & Print Buttons */}
            <div className="flex items-center gap-2">
              {/* Button: Atur Penanda Tangan */}
              <button
                type="button"
                onClick={() => handleOpenSignerConfig(targetLoanForPrint)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                title="Tambah atau atur penanda tangan form ini"
              >
                <Users size={14} />
                <span className="hidden sm:inline">Penanda Tangan</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-stone-950 font-black">
                  {4 + (targetLoanForPrint.additionalSigners?.length || 0)}
                </span>
              </button>

              {/* Toggle Kop Surat (Disamakan dengan Internal Memo) */}
              <button
                type="button"
                onClick={() => setShowKopSuratInPrint(!showKopSuratInPrint)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                  showKopSuratInPrint
                    ? 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'
                    : 'bg-stone-800/60 text-stone-500 border-stone-800 hover:bg-stone-800'
                }`}
                title="Nyalakan / Matikan Kop Surat (Matikan jika mencetak pada kertas blanko berkop)"
              >
                <Building size={14} />
                <span className="hidden lg:inline">{showKopSuratInPrint ? 'Kop: ON' : 'Kop: OFF (Blanko)'}</span>
              </button>

              {/* Toggle Riwayat Pembayaran */}
              <button
                type="button"
                onClick={() => setPrintWithLedger(!printWithLedger)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                  printWithLedger
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-stone-700'
                }`}
                title="Sertakan atau sembunyikan tabel rincian pembayaran cicilan"
              >
                <Layers size={14} />
                <span className="hidden xl:inline">{printWithLedger ? 'Riwayat: YA' : 'Riwayat: TIDAK'}</span>
              </button>

              {/* Button: Buat Voucher Kas/Bank HO (hanya tampil jika belum terhubung voucher) */}
              {onCreateVoucher && !isLoanConnectedToVoucher(targetLoanForPrint, findLinkedVoucherForLoan(targetLoanForPrint)) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsPrintModalOpen(false);
                    onCreateVoucher(targetLoanForPrint);
                  }}
                  className="hidden sm:flex px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition items-center gap-1.5 cursor-pointer shadow-2xs border border-emerald-600"
                  title="Buat draf Formulir Voucher Kas/Bank HO untuk pencairan pinjaman ini"
                >
                  <FileCheck size={14} />
                  <span>+ Buat Voucher</span>
                </button>
              )}

              {/* Button: Print / Cetak Dokumen */}
              <button
                type="button"
                onClick={handlePrintDocument}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
                title="Cetak langsung ke printer atau simpan sebagai PDF"
              >
                <Printer size={15} />
                <span>Cetak / PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition cursor-pointer ml-1"
                title="Tutup Modal"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          {/* Document Studio Canvas Workspace */}
          <main className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start bg-stone-900/80 print:bg-white print:p-0 print:overflow-visible relative">
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                marginBottom: `${Math.max(40, (1 - zoomLevel) * 200)}px`
              }}
              className="print:transform-none print:m-0"
            >
              <EmployeeLoanDocument
                id="employee-loan-preview-studio"
                loan={targetLoanForPrint}
                showPaymentLedger={printWithLedger}
                showKopSurat={showKopSuratInPrint}
              />
            </div>

            {/* Floating Quick Action Bar at bottom center for easy access when scrolling document */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-stone-950/90 backdrop-blur-md border border-stone-800 rounded-full px-4 py-2 flex items-center gap-3 shadow-2xl print:hidden">
              <button
                type="button"
                onClick={() => handleOpenSignerConfig(targetLoanForPrint)}
                className="flex items-center gap-1.5 text-xs font-bold text-stone-300 hover:text-white px-2 py-1 rounded-lg hover:bg-stone-800 transition cursor-pointer"
                title="Tambah atau atur penanda tangan form ini"
              >
                <Users size={14} className="text-amber-400" />
                <span>Atur Penanda Tangan {targetLoanForPrint.additionalSigners?.length ? `(+${targetLoanForPrint.additionalSigners.length})` : ''}</span>
              </button>
              <div className="h-4 w-px bg-stone-700"></div>
              <button
                type="button"
                onClick={handlePrintDocument}
                className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black rounded-full text-xs shadow-md transition cursor-pointer active:scale-95"
              >
                <Printer size={14} />
                <span>Cetak / PDF</span>
              </button>
              <div className="h-4 w-px bg-stone-700"></div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="text-stone-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-stone-800 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </main>
        </div>
      )}

      {/* MODAL 5: PENGATURAN & PENAMBAHAN PENANDA TANGAN */}
      {isSignerConfigModalOpen && targetLoanForSigners && (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150 text-stone-900">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-100 text-amber-900 rounded-2xl">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900">
                    Pengaturan &amp; Penambahan Penanda Tangan Form
                  </h3>
                  <p className="text-xs text-stone-500">
                    {targetLoanForSigners.nomorPinjaman} &bull; {targetLoanForSigners.namaKaryawan}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSignerConfigModalOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
              {/* Bagian 1: 4 Penanda Tangan Utama (Baris Atas) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    4 Penanda Tangan Utama (Baris Atas)
                  </span>
                  <span className="text-[11px] text-stone-500 font-mono">4 Kotak Sejajar Penuh (25% per kotak)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Kolom 1: Peminjam / Diajukan */}
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Judul Kotak 1:
                      </label>
                      <input
                        type="text"
                        value={peminjamRole}
                        onChange={(e) => setPeminjamRole(e.target.value)}
                        placeholder="Diajukan"
                        className="w-full px-2.5 py-1 text-xs font-bold bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Nama:
                      </label>
                      <input
                        type="text"
                        value={namaKaryawan}
                        onChange={(e) => setNamaKaryawan(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs font-semibold bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Jabatan:
                      </label>
                      <input
                        type="text"
                        value={peminjamJabatan}
                        onChange={(e) => setPeminjamJabatan(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Kolom 2: Diverifikasi / Persetujuan Atasan */}
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Judul Kotak 2:
                      </label>
                      <input
                        type="text"
                        value={atasanRole}
                        onChange={(e) => setAtasanRole(e.target.value)}
                        placeholder="Diverifikasi"
                        className="w-full px-2.5 py-1 text-xs font-bold bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Nama:
                      </label>
                      <input
                        type="text"
                        value={atasanNama}
                        onChange={(e) => setAtasanNama(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs font-semibold bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Jabatan:
                      </label>
                      <input
                        type="text"
                        value={atasanJabatan}
                        onChange={(e) => setAtasanJabatan(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Kolom 3: Diverifikasi / Persetujuan Finance */}
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Judul Kotak 3:
                      </label>
                      <input
                        type="text"
                        value={financeRole}
                        onChange={(e) => setFinanceRole(e.target.value)}
                        placeholder="Diverifikasi"
                        className="w-full px-2.5 py-1 text-xs font-bold bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Nama:
                      </label>
                      <input
                        type="text"
                        value={financeNama}
                        onChange={(e) => setFinanceNama(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs font-semibold bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Jabatan:
                      </label>
                      <input
                        type="text"
                        value={financeJabatan}
                        onChange={(e) => setFinanceJabatan(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Kolom 4: Disetujui / Persetujuan Direktur */}
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Judul Kotak 4:
                      </label>
                      <input
                        type="text"
                        value={direkturRole}
                        onChange={(e) => setDirekturRole(e.target.value)}
                        placeholder="Disetujui"
                        className="w-full px-2.5 py-1 text-xs font-bold bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Nama:
                      </label>
                      <input
                        type="text"
                        value={direkturNama}
                        onChange={(e) => setDirekturNama(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs font-semibold bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                        Jabatan:
                      </label>
                      <input
                        type="text"
                        value={direkturJabatan}
                        onChange={(e) => setDirekturJabatan(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg focus:ring-1 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bagian 2: Penanda Tangan Tambahan (Baris Bawah) */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Penanda Tangan Tambahan (Baris Bawah)
                    </span>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Kotak di baris bawah berukuran sama (25%). Otomatis berposisi di tengah jika 1, 2, atau 3 orang, dan sejajar jika 4 orang.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleAddAdditionalSigner({ role: 'Disetujui', nama: 'H. ANDI NURSYAM HALID', jabatan: 'Direktur Utama' })}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                      title="Tambah preset penanda tangan Direktur Utama H. ANDI NURSYAM HALID"
                    >
                      <Plus size={12} />
                      <span>+ Preset Dirut (H. ANDI NURSYAM HALID)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAddAdditionalSigner()}
                      className="px-3 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-xs"
                    >
                      <UserPlus size={12} />
                      <span>+ Tambah Baru</span>
                    </button>
                  </div>
                </div>

                {/* List of Additional Signers */}
                {additionalSigners.length === 0 ? (
                  <div className="p-6 bg-stone-50 border border-dashed border-stone-300 rounded-2xl text-center">
                    <p className="text-xs text-stone-500 font-medium">
                      Belum ada penanda tangan tambahan di baris bawah.
                    </p>
                    <p className="text-[11px] text-stone-400 mt-1">
                      Klik tombol <strong>"+ Preset Dirut"</strong> atau <strong>"+ Tambah Baru"</strong> untuk menambahkan pejabat penanda tangan di baris kedua.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {additionalSigners.map((signer, idx) => (
                      <div
                        key={signer.id}
                        className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2.5 relative"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-md font-mono text-[10px]">
                              #{idx + 1}
                            </span>
                            <span>Penanda Tangan Tambahan (Baris Bawah)</span>
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveAdditionalSigner(signer.id)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Hapus penanda tangan ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
                          <div>
                            <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                              Status / Role:
                            </label>
                            <input
                              type="text"
                              value={signer.role}
                              onChange={(e) => handleUpdateAdditionalSigner(signer.id, 'role', e.target.value)}
                              placeholder="Misal: Disetujui / Mengetahui"
                              className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl font-bold focus:ring-1 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                              Nama Lengkap:
                            </label>
                            <input
                              type="text"
                              value={signer.nama}
                              onChange={(e) => handleUpdateAdditionalSigner(signer.id, 'nama', e.target.value)}
                              placeholder="Nama penanda tangan"
                              className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl font-semibold focus:ring-1 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                              Jabatan:
                            </label>
                            <input
                              type="text"
                              value={signer.jabatan}
                              onChange={(e) => handleUpdateAdditionalSigner(signer.id, 'jabatan', e.target.value)}
                              placeholder="Misal: Direktur Utama"
                              className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-stone-600 uppercase mb-1">
                              Tanggal (Opsional):
                            </label>
                            <input
                              type="date"
                              value={signer.tanggal || ''}
                              onChange={(e) => handleUpdateAdditionalSigner(signer.id, 'tanggal', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Simulation miniature */}
                    <div className="p-3 bg-stone-100 rounded-2xl border border-stone-200">
                      <span className="text-[10px] font-mono uppercase font-bold text-stone-600 block mb-1.5">
                        Simulasi Posisi Kotak Form Resmi:
                      </span>
                      <div className="space-y-1.5 max-w-sm mx-auto">
                        <div className="grid grid-cols-4 gap-1">
                          <div className="bg-blue-200 border border-blue-400 py-1 text-[9px] font-bold text-center rounded">1</div>
                          <div className="bg-blue-200 border border-blue-400 py-1 text-[9px] font-bold text-center rounded">2</div>
                          <div className="bg-blue-200 border border-blue-400 py-1 text-[9px] font-bold text-center rounded">3</div>
                          <div className="bg-blue-200 border border-blue-400 py-1 text-[9px] font-bold text-center rounded">4</div>
                        </div>

                        {additionalSigners.length > 0 && (
                          <div className="flex justify-center">
                            <div className={`grid gap-1 ${
                              additionalSigners.length === 1 ? 'grid-cols-1 w-1/4' :
                              additionalSigners.length === 2 ? 'grid-cols-2 w-2/4' :
                              additionalSigners.length === 3 ? 'grid-cols-3 w-3/4' :
                              'grid-cols-4 w-full'
                            }`}>
                              {additionalSigners.slice(0, 4).map((_, i) => (
                                <div key={i} className="bg-amber-300 border border-amber-500 py-1 text-[9px] font-bold text-center rounded">
                                  #{i + 1}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-stone-200 flex items-center justify-between shrink-0 bg-stone-50 rounded-b-3xl">
              <span className="text-xs text-stone-500 font-mono">
                Total Penanda Tangan: <strong>{4 + additionalSigners.length} Orang</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSignerConfigModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-200 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveSignerConfig}
                  className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition shadow-3xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check size={15} />
                  <span>Simpan &amp; Terapkan ke Form</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG KONFIRMASI TANDAI LUNAS */}
      {settlementConfirmLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-stone-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-stone-900">
                    Konfirmasi Tandai Lunas
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    {settlementConfirmLoan.nomorPinjaman} • {settlementConfirmLoan.namaKaryawan}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettlementConfirmLoan(null)}
                className="w-7 h-7 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-1 text-xs">
              <div className="text-emerald-900 font-bold flex justify-between">
                <span>Sisa Pinjaman yang Dilunasi:</span>
                <span className="font-mono font-black text-sm text-emerald-950">
                  {formatRupiah(calculateLoanSummary(settlementConfirmLoan).sisaPinjaman)}
                </span>
              </div>
              <p className="text-[11px] text-emerald-700 leading-relaxed pt-1">
                Pinjaman ini akan ditandai <strong>LUNAS</strong>, otomatis hilang dari <em>Daftar Hutang</em>, dan berpindah ke tab <em>Lunas</em>.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-600 font-bold mb-1">Tanggal Pelunasan:</label>
                <input
                  type="date"
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-stone-600 font-bold mb-1">Catatan / Keterangan Pelunasan:</label>
                <input
                  type="text"
                  value={settlementNote}
                  onChange={(e) => setSettlementNote(e.target.value)}
                  placeholder="Misal: Pelunasan penuh via transfer / potong gaji / tunai"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setSettlementConfirmLoan(null)}
                className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmMarkAsLunas}
                className="px-5 py-2 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                <span>Konfirmasi Lunas Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SINKRONISASI MANUAL SELURUH VOUCHER */}
      {isManualSyncModalOpen && (
        <ManualSyncLoanModal
          isOpen={isManualSyncModalOpen}
          onClose={() => setIsManualSyncModalOpen(false)}
          submissions={submissions}
          loans={loans}
          workers={workers}
          onLoansUpdated={(updated) => {
            setLoans(updated);
            saveEmployeeLoans(updated);
          }}
          onViewSubmission={onViewSubmission}
        />
      )}

      {/* MODAL GANTI / HUBUNGKAN VOUCHER UNTUK PINJAMAN TERTENTU */}
      {targetLoanForLinkVoucher && (
        <LinkVoucherToLoanModal
          isOpen={!!targetLoanForLinkVoucher}
          onClose={() => setTargetLoanForLinkVoucher(null)}
          loan={targetLoanForLinkVoucher}
          submissions={submissions}
          onLoanUpdated={(updatedLoan) => {
            const updated = loans.map(l => l.id === updatedLoan.id ? updatedLoan : l);
            setLoans(updated);
            saveEmployeeLoans(updated);
            setTargetLoanForLinkVoucher(null);
            setSyncMessage(`✅ Transaksi voucher untuk ${updatedLoan.namaKaryawan} berhasil diperbarui.`);
            setTimeout(() => setSyncMessage(''), 5000);
          }}
        />
      )}

      {/* PORTAL DROPDOWN MENU TINDAKAN PINJAMAN */}
      {openLoanMenuId && activeMenuLoan && typeof document !== 'undefined' && createPortal(
        (() => {
          const menuSummary = calculateLoanSummary(activeMenuLoan);
          const menuPayments = activeMenuLoan.payments || [];
          const menuLinkedVoucher = findLinkedVoucherForLoan(activeMenuLoan);
          const menuIsConnected = isLoanConnectedToVoucher(activeMenuLoan, menuLinkedVoucher);
          const closeMenu = () => {
            setOpenLoanMenuId(null);
            setLoanMenuPosition(null);
          };

          return (
            <div
              id="portal-loan-action-menu"
              role="menu"
              style={{
                position: 'fixed',
                top: loanMenuPosition?.top !== undefined ? `${loanMenuPosition.top}px` : (loanMenuPosition?.bottom === undefined ? '100px' : 'auto'),
                bottom: loanMenuPosition?.bottom !== undefined ? `${loanMenuPosition.bottom}px` : 'auto',
                left: loanMenuPosition?.left !== undefined ? `${loanMenuPosition.left}px` : 'auto',
                right: loanMenuPosition?.left === undefined ? '16px' : 'auto',
                width: '224px',
                maxHeight: loanMenuPosition?.maxHeight !== undefined ? `${loanMenuPosition.maxHeight}px` : '420px',
                zIndex: 9999999,
              }}
              className="loan-action-menu-root action-menu-dropdown-popover w-56 bg-white rounded-2xl shadow-2xl border border-stone-200 py-1.5 overflow-y-auto divide-y divide-stone-100 text-left select-none ring-1 ring-black/5 animate-in fade-in duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Info Pinjaman */}
              <div className="px-3.5 py-2 bg-stone-50/90 border-b border-stone-150">
                <div className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider truncate">
                  {activeMenuLoan.nomorPinjaman}
                </div>
                <div className="text-xs font-extrabold text-stone-800 truncate" title={activeMenuLoan.namaKaryawan}>
                  {activeMenuLoan.namaKaryawan}
                </div>
              </div>

              {/* Kelompok 1: Voucher Transaksi (Kondisional: Ganti Voucher vs Buat Voucher) */}
              <div className="py-1">
                {menuIsConnected ? (
                  <>
                    {menuLinkedVoucher && onViewSubmission && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          closeMenu();
                          onViewSubmission(menuLinkedVoucher);
                        }}
                        className="w-full px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                      >
                        <Eye size={15} className="text-emerald-600 shrink-0" />
                        <span className="truncate">Lihat Voucher ({menuLinkedVoucher.kode})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        const target = activeMenuLoan;
                        closeMenu();
                        setTargetLoanForLinkVoucher(target);
                      }}
                      className="w-full px-3.5 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                    >
                      <Link size={15} className="text-sky-600 shrink-0" />
                      <span>Ganti Voucher</span>
                    </button>
                  </>
                ) : (
                  onCreateVoucher && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        const target = activeMenuLoan;
                        closeMenu();
                        onCreateVoucher(target);
                      }}
                      className="w-full px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                    >
                      <FileText size={15} className="text-amber-600 shrink-0" />
                      <span>Buat Voucher</span>
                    </button>
                  )
                )}
              </div>

              {/* Kelompok 2: Pembayaran, Pelunasan & Riwayat */}
              <div className="py-1">
                {menuSummary.sisaPinjaman > 0 && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const target = activeMenuLoan;
                      closeMenu();
                      handleOpenPaymentModal(target);
                    }}
                    className="w-full px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                  >
                    <CreditCard size={15} className="text-emerald-600 shrink-0" />
                    <span>Catat Bayar</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const target = activeMenuLoan;
                    closeMenu();
                    setTargetLoanForHistory(target);
                    setIsHistoryModalOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Layers size={15} className="text-stone-500 shrink-0" />
                  <span>Riwayat ({menuPayments.length})</span>
                </button>

                {menuSummary.effectiveStatus === 'Lunas' ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const target = activeMenuLoan;
                      closeMenu();
                      handleReopen(target);
                    }}
                    className="w-full px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                  >
                    <RotateCcw size={15} className="text-amber-600 shrink-0" />
                    <span>Batalkan Lunas</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const target = activeMenuLoan;
                      closeMenu();
                      setSettlementConfirmLoan(target);
                      setSettlementDate(new Date().toISOString().split('T')[0]);
                      setSettlementNote(`Pelunasan penuh pinjaman ${target.nomorPinjaman} (${target.namaKaryawan})`);
                    }}
                    className="w-full px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                  >
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    <span>Tandai Lunas</span>
                  </button>
                )}
              </div>

              {/* Kelompok 3: Cetak, Edit & Hapus */}
              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const target = activeMenuLoan;
                    closeMenu();
                    handleOpenPrintModal(target);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Printer size={15} className="text-amber-600 shrink-0" />
                  <span>Cetak Form</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const target = activeMenuLoan;
                    closeMenu();
                    handleOpenEditLoanForm(target);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Edit size={15} className="text-sky-600 shrink-0" />
                  <span>Edit Pinjaman</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const target = activeMenuLoan;
                    closeMenu();
                    handleDeleteLoan(target);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Trash2 size={15} className="text-rose-600 shrink-0" />
                  <span>Hapus Pinjaman</span>
                </button>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* DEDICATED PRINT PORTAL ON DOCUMENT BODY */}
      {isPrintModalOpen && targetLoanForPrint && typeof document !== 'undefined' && createPortal(
        <div id="employee-loan-print-sheet-wrapper" className="hidden print:block bg-white text-black w-full">
          <EmployeeLoanDocument
            id="employee-loan-printable-document"
            loan={targetLoanForPrint}
            showPaymentLedger={printWithLedger}
            showKopSurat={showKopSuratInPrint}
          />
        </div>,
        document.body
      )}

    </div>
  );
};

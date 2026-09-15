import React, { useState, useMemo } from 'react';
import { Submission, NpwpRecord } from '../types';
import { formatRupiah, formatDateIndonesian, isVendorOrCompanyMatch, isInvoiceSubmission } from '../utils';
import {
  FileText,
  Search,
  Download,
  Printer,
  Copy,
  Check,
  Building2,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowRight,
  Edit3,
  Calendar,
  Save,
  X,
  Plus,
  Receipt,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Eye,
  Cloud,
  FileCheck,
  ChevronDown,
  CheckCircle2
} from 'lucide-react';

interface Pph23BupotRecapProps {
  submissions: Submission[];
  npwpRecords: NpwpRecord[];
  onSaveNpwpRecords: (records: NpwpRecord[]) => void;
  onUpdateSubmission: (submission: Submission) => void;
  onSelectSubmission?: (sub: Submission) => void;
  onBackToVoucher?: () => void;
}

// Helper to compute previous month in 'YYYY-MM'
const getPreviousMonthString = (): string => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

// Helper to compute current month in 'YYYY-MM'
const getCurrentMonthString = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

// Format month key into readable Indonesian string
const formatMonthKeyToIndonesian = (mKey: string): string => {
  if (!mKey || mKey === 'All') return 'Semua Periode Bulan';
  const parts = mKey.split('-');
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const d = new Date(year, month, 1);
    return d.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
  }
  return mKey;
};

/**
 * Calculates DPP from transaction items excluding PPN, PPh, and non-DPP taxes/fees.
 */
export const calculateInvoiceDpp = (sub: Submission): number => {
  if (typeof sub.dppAmount === 'number' && sub.dppAmount > 0) {
    return sub.dppAmount;
  }

  const items = sub.items || [];
  // Exclude tax rows (PPN, PPh, PB1, Bea Materai, etc.)
  const nonTaxItems = items.filter(i => {
    const raw = (i.item || '').trim().toLowerCase();
    if (/^(ppn|pph|pajak|materai|bea\s*materai)/i.test(raw)) return false;
    if (raw.includes('pajak pertambahan nilai')) return false;
    if (raw.includes('pajak penghasilan')) return false;
    return true;
  });

  if (nonTaxItems.length > 0) {
    const sum = nonTaxItems.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
    if (sum > 0) return sum;
  }

  // If sub has invoiceAmount
  if (typeof sub.invoiceAmount === 'number' && sub.invoiceAmount > 0) {
    return sub.invoiceAmount;
  }

  const rawTotal = items.reduce((acc, itm) => acc + (Number(itm.total) || 0), 0);
  return rawTotal > 0 ? rawTotal : 0;
};

export const Pph23BupotRecap: React.FC<Pph23BupotRecapProps> = ({
  submissions,
  npwpRecords,
  onSaveNpwpRecords,
  onUpdateSubmission,
  onSelectSubmission,
  onBackToVoucher
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Default filter: previous month (e.g. if current is September, default is August)
  const defaultPrevMonth = useMemo(() => getPreviousMonthString(), []);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem('pph23_selectedMonthFilter');
      if (stored) return stored;
    } catch (e) {}
    return defaultPrevMonth;
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Document preview modal
  const [previewSub, setPreviewSub] = useState<Submission | null>(null);

  // Quick edit modal for DPP / PPh 23 / Bupot
  const [editingSub, setEditingSub] = useState<Submission | null>(null);
  const [editDpp, setEditDpp] = useState<number>(0);
  const [editRate, setEditRate] = useState<number>(2);
  const [editPphAmount, setEditPphAmount] = useState<number>(0);
  const [editBupotNumber, setEditBupotNumber] = useState<string>('');
  const [editBupotDate, setEditBupotDate] = useState<string>('');

  // Quick NPWP modal
  const [npwpModalVendor, setNpwpModalVendor] = useState<string | null>(null);
  const [npwpInputNumber, setNpwpInputNumber] = useState('');
  const [npwpInputKpp, setNpwpInputKpp] = useState('');
  const [npwpInputTaxStatus, setNpwpInputTaxStatus] = useState<'PKP' | 'Non-PKP'>('PKP');
  const [npwpInputAddress, setNpwpInputAddress] = useState('');

  // Save selected month to sessionStorage
  const handleSelectMonth = (monthKey: string) => {
    setSelectedMonthFilter(monthKey);
    try {
      sessionStorage.setItem('pph23_selectedMonthFilter', monthKey);
    } catch (e) {}
  };

  // Helper to find matching NPWP record for vendor
  const findNpwpForVendor = (vendorName: string): NpwpRecord | undefined => {
    if (!vendorName) return undefined;
    return npwpRecords.find(r => isVendorOrCompanyMatch(r.companyName, vendorName));
  };

  // Helper to compute effective DPP, rate, and PPh 23
  const getPphDetails = (sub: Submission) => {
    const dpp = calculateInvoiceDpp(sub);
    const npwp = findNpwpForVendor(sub.dibayarkanKepada) || sub.vendorNpwp;
    const defaultRate = npwp ? 2 : 4; // 2% for registered NPWP, 4% for non-NPWP
    const rate = sub.pph23Rate !== undefined ? sub.pph23Rate : defaultRate;
    const pphAmount = sub.pph23Amount !== undefined ? sub.pph23Amount : Math.round(dpp * (rate / 100));
    const netAmount = Math.max(0, dpp - pphAmount);

    return {
      dpp,
      rate,
      pphAmount,
      netAmount,
      hasNpwp: !!npwp,
      npwpRecord: findNpwpForVendor(sub.dibayarkanKepada)
    };
  };

  // 1. Filter ALL submissions to ONLY TRANSAKSI TAGIHAN (Invoice)
  const allInvoiceSubmissions = useMemo(() => {
    return submissions.filter(sub => isInvoiceSubmission(sub));
  }, [submissions]);

  // Available months derived from all invoice submissions (plus previous and current month)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(defaultPrevMonth);
    set.add(getCurrentMonthString());

    allInvoiceSubmissions.forEach(s => {
      if (s.tanggal && s.tanggal.length >= 7) {
        set.add(s.tanggal.substring(0, 7));
      }
    });
    return Array.from(set).sort().reverse();
  }, [allInvoiceSubmissions, defaultPrevMonth]);

  // 2. Filter invoice submissions by selected month and search query
  const filteredInvoices = useMemo(() => {
    return allInvoiceSubmissions.filter(sub => {
      // Month Filter
      if (selectedMonthFilter !== 'All') {
        const subMonth = (sub.tanggal || '').substring(0, 7);
        if (subMonth !== selectedMonthFilter) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const npwp = findNpwpForVendor(sub.dibayarkanKepada);
        const npwpText = npwp ? `${npwp.npwpNumber} ${npwp.companyName}`.toLowerCase() : '';
        const itemsText = (sub.items || []).map(i => i.item || '').join(' ').toLowerCase();
        const match =
          (sub.dibayarkanKepada || '').toLowerCase().includes(q) ||
          (sub.invoiceNumber || '').toLowerCase().includes(q) ||
          (sub.kode || '').toLowerCase().includes(q) ||
          (sub.jenisPengajuan || '').toLowerCase().includes(q) ||
          itemsText.includes(q) ||
          npwpText.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [allInvoiceSubmissions, selectedMonthFilter, searchQuery, npwpRecords]);

  // Summary KPI statistics
  const stats = useMemo(() => {
    let totalDpp = 0;
    let totalPph23 = 0;
    let totalNetto = 0;
    let npwpRegisteredCount = 0;

    filteredInvoices.forEach(sub => {
      const { dpp, pphAmount, netAmount, hasNpwp } = getPphDetails(sub);
      totalDpp += dpp;
      totalPph23 += pphAmount;
      totalNetto += netAmount;
      if (hasNpwp) {
        npwpRegisteredCount++;
      }
    });

    return {
      count: filteredInvoices.length,
      totalDpp,
      totalPph23,
      totalNetto,
      npwpRegisteredCount
    };
  }, [filteredInvoices, npwpRecords]);

  // Month navigation: previous / next month
  const handlePrevMonthNav = () => {
    if (selectedMonthFilter === 'All') return;
    const parts = selectedMonthFilter.split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1; // 0-indexed
      const targetDate = new Date(y, m - 1, 1);
      const targetKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      handleSelectMonth(targetKey);
    }
  };

  const handleNextMonthNav = () => {
    if (selectedMonthFilter === 'All') return;
    const parts = selectedMonthFilter.split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const targetDate = new Date(y, m + 1, 1);
      const targetKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      handleSelectMonth(targetKey);
    }
  };

  // Open edit modal
  const handleOpenEdit = (sub: Submission) => {
    const { dpp, rate, pphAmount } = getPphDetails(sub);
    setEditingSub(sub);
    setEditDpp(dpp);
    setEditRate(rate);
    setEditPphAmount(pphAmount);
    setEditBupotNumber(sub.bupotNumber || '');
    setEditBupotDate(sub.bupotDate || sub.tanggal || new Date().toISOString().substring(0, 10));
  };

  const handleSaveEdit = () => {
    if (!editingSub) return;
    const updated: Submission = {
      ...editingSub,
      dppAmount: editDpp,
      pph23Rate: editRate,
      pph23Amount: editPphAmount,
      bupotNumber: editBupotNumber.trim(),
      bupotDate: editBupotDate
    };
    onUpdateSubmission(updated);
    setEditingSub(null);
  };

  // Quick save new NPWP record
  const handleSaveQuickNpwp = () => {
    if (!npwpModalVendor) return;
    const cleanNumber = npwpInputNumber.trim();
    if (!cleanNumber) {
      alert('Nomor NPWP wajib diisi!');
      return;
    }

    const newRecord: NpwpRecord = {
      id: `npwp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyName: npwpModalVendor.trim(),
      npwpNumber: cleanNumber,
      kppName: npwpInputKpp.trim() || undefined,
      taxStatus: npwpInputTaxStatus,
      address: npwpInputAddress.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    onSaveNpwpRecords([...npwpRecords, newRecord]);
    setNpwpModalVendor(null);
    setNpwpInputNumber('');
    setNpwpInputKpp('');
    setNpwpInputAddress('');
  };

  // Copy single NPWP
  const handleCopyNpwp = (npwpText: string, id: string) => {
    navigator.clipboard.writeText(npwpText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Copy table for Coretax DJP / Excel
  const handleCopyAllForCoretax = () => {
    const headers = [
      'No',
      'Tanggal Transaksi',
      'Nomor Dokumen / Invoice',
      'Vendor / Rekanan',
      'NPWP Terkait',
      'DPP Transaksi (di luar PPN)',
      'Tarif PPh 23 (%)',
      'PPh Yang Dipotong (-2%)'
    ];

    const rows = filteredInvoices.map((sub, idx) => {
      const { dpp, rate, pphAmount } = getPphDetails(sub);
      const npwp = findNpwpForVendor(sub.dibayarkanKepada);

      return [
        idx + 1,
        sub.tanggal,
        sub.invoiceNumber || sub.kode,
        sub.dibayarkanKepada,
        npwp?.npwpNumber || sub.vendorNpwp || 'BELUM ADA NPWP',
        dpp,
        `${rate}%`,
        -pphAmount
      ].join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(tsvContent);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // Export CSV format Coretax
  const handleExportCsv = () => {
    const headers = [
      'No',
      'Tanggal Transaksi',
      'Nomor Dokumen / Invoice',
      'Vendor / Rekanan',
      'NPWP',
      'Status Pajak',
      'DPP Transaksi (di luar PPN)',
      'Tarif %',
      'PPh Yang Dipotong'
    ];

    const rows = filteredInvoices.map((sub, idx) => {
      const { dpp, rate, pphAmount } = getPphDetails(sub);
      const npwp = findNpwpForVendor(sub.dibayarkanKepada);

      return [
        idx + 1,
        `"${sub.tanggal}"`,
        `"${(sub.invoiceNumber || sub.kode || '').replace(/"/g, '""')}"`,
        `"${(sub.dibayarkanKepada || '').replace(/"/g, '""')}"`,
        `"${(npwp?.npwpNumber || sub.vendorNpwp || '').replace(/"/g, '""')}"`,
        `"${npwp?.taxStatus || 'Non-PKP'}"`,
        dpp,
        `"${rate}%"`,
        -pphAmount
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bukti_Potong_PPh23_Tagihan_${selectedMonthFilter}_${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Active month display name
  const currentMonthLabel = useMemo(() => {
    if (selectedMonthFilter === 'All') return 'Semua Periode';
    return formatMonthKeyToIndonesian(selectedMonthFilter);
  }, [selectedMonthFilter]);

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Top Header Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-500/10 text-amber-800 rounded-xl border border-amber-500/20">
              <Receipt size={22} className="text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-stone-900 tracking-tight font-display uppercase">
                  Bukti Potong PPh 23 (Transaksi Tagihan)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold font-mono uppercase tracking-wider">
                  Khusus Transaksi Tagihan
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Rekapitulasi pemotongan pajak PPh Pasal 23 khusus transaksi berjenis tagihan rekanan, dasar pengenaan pajak (DPP) bersih di luar PPN, data NPWP, dan tautan dokumen transaksi.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onBackToVoucher && (
            <button
              onClick={onBackToVoucher}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 hover:bg-stone-100 border border-stone-250 text-stone-700 font-bold rounded-xl transition text-xs shadow-3xs cursor-pointer"
            >
              <ArrowRight size={13} className="rotate-180" />
              <span>Kembali ke Voucher HO</span>
            </button>
          )}

          <a
            href="https://coretaxdjp.pajak.go.id"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-bold rounded-xl transition text-xs shadow-3xs"
            title="Buka Portal Web Coretax DJP di Tab Baru"
          >
            <ExternalLink size={13} className="text-amber-700" />
            <span>Web Coretax DJP</span>
          </a>

          <button
            onClick={handleCopyAllForCoretax}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl transition text-xs shadow-3xs cursor-pointer"
            title="Salin data tabel ke clipboard untuk dipaste ke Excel / Coretax"
          >
            {copiedAll ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-stone-600" />}
            <span>{copiedAll ? 'Tersalin!' : 'Salin Data'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl transition text-xs shadow-xs cursor-pointer"
            title="Unduh file CSV format pelaporan pajak"
          >
            <Download size={13} className="text-amber-400" />
            <span>Ekspor CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-50 hover:bg-stone-100 border border-stone-250 text-stone-800 font-bold rounded-xl transition text-xs shadow-3xs cursor-pointer"
            title="Cetak Laporan Pemotongan PPh 23"
          >
            <Printer size={13} className="text-stone-600" />
            <span className="hidden sm:inline">Cetak</span>
          </button>
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 print:hidden">
        {/* Total Transaksi Tagihan */}
        <div className="bg-white p-4.5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider font-mono">
              Total Transaksi Tagihan
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-stone-900 font-sans">
                {stats.count}
              </span>
              <span className="text-xs text-stone-500 font-medium">Tagihan</span>
            </div>
            <p className="text-[10px] text-stone-400 font-mono">
              Periode: <strong className="text-stone-700">{currentMonthLabel}</strong>
            </p>
          </div>
          <div className="p-3 bg-stone-100 rounded-xl text-stone-700">
            <FileText size={20} />
          </div>
        </div>

        {/* Total DPP Transaksi (di luar PPN) */}
        <div className="bg-white p-4.5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider font-mono">
              Total DPP (di luar PPN)
            </span>
            <div className="text-xl sm:text-2xl font-black text-stone-900 font-mono tracking-tight">
              Rp {formatRupiah(stats.totalDpp)}
            </div>
            <p className="text-[10px] text-stone-400">Dasar Pengenaan Pajak Tagihan</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
            <Receipt size={20} />
          </div>
        </div>

        {/* Total PPh 23 Yang Dipotong (-2%) */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4.5 rounded-2xl shadow-xs text-stone-950 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider font-mono text-stone-900/80">
              Total PPh 23 Dipotong (-2%)
            </span>
            <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-stone-950">
              -Rp {formatRupiah(stats.totalPph23)}
            </div>
            <p className="text-[10px] text-stone-900 font-semibold">
              Potongan Pajak ke Rekanan Vendor
            </p>
          </div>
          <div className="p-3 bg-white/30 backdrop-blur-xs rounded-xl text-stone-950">
            <Sparkles size={20} />
          </div>
        </div>

        {/* Status NPWP Vendor */}
        <div className="bg-white p-4.5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider font-mono">
              Status NPWP Vendor Rekanan
            </span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-emerald-700 font-sans">
                {stats.npwpRegisteredCount}
              </span>
              <span className="text-sm text-stone-400 font-bold">/ {stats.count}</span>
              <span className="text-xs text-stone-500 font-medium">Ber-NPWP</span>
            </div>
            <p className="text-[10px] text-stone-400">
              {stats.count - stats.npwpRegisteredCount > 0 ? (
                <span className="text-rose-600 font-semibold">
                  {stats.count - stats.npwpRegisteredCount} vendor belum ber-NPWP
                </span>
              ) : (
                <span className="text-emerald-600 font-semibold">
                  Semua vendor sudah terdaftar NPWP
                </span>
              )}
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
            <ShieldCheck size={20} />
          </div>
        </div>
      </div>

      {/* FILTER PERIODE BULAN & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3 print:hidden">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Month Filter Selector with Previous/Next Month Navigation */}
          <div className="flex items-center gap-1.5 bg-stone-50 p-1.5 rounded-xl border border-stone-200 shrink-0">
            <button
              type="button"
              onClick={handlePrevMonthNav}
              disabled={selectedMonthFilter === 'All'}
              className="p-1.5 hover:bg-stone-200 rounded-lg text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center gap-2 px-1">
              <Calendar size={15} className="text-amber-600 shrink-0" />
              <select
                value={selectedMonthFilter}
                onChange={(e) => handleSelectMonth(e.target.value)}
                className="bg-transparent font-bold text-xs text-stone-800 focus:outline-hidden cursor-pointer"
              >
                <option value="All">Semua Periode Bulan</option>
                {availableMonths.map((m) => {
                  const label = formatMonthKeyToIndonesian(m);
                  const isPrev = m === defaultPrevMonth;
                  const isCurrent = m === getCurrentMonthString();
                  return (
                    <option key={m} value={m}>
                      {label} {isPrev ? '(Bulan Lalu - Default)' : isCurrent ? '(Bulan Ini)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonthNav}
              disabled={selectedMonthFilter === 'All'}
              className="p-1.5 hover:bg-stone-200 rounded-lg text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Bulan Berikutnya"
            >
              <ChevronRight size={16} />
            </button>

            {/* Quick Button to Reset to Default Previous Month */}
            {selectedMonthFilter !== defaultPrevMonth && (
              <button
                type="button"
                onClick={() => handleSelectMonth(defaultPrevMonth)}
                className="ml-1 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer"
                title={`Kembali ke Bulan Sebelumnya (${formatMonthKeyToIndonesian(defaultPrevMonth)})`}
              >
                Default ({formatMonthKeyToIndonesian(defaultPrevMonth).split(' ')[0]})
              </button>
            )}
          </div>

          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama vendor, nomor invoice, ref voucher, atau NPWP..."
              className="w-full pl-9 pr-8 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Info Badge */}
          <div className="flex items-center gap-2 text-xs text-stone-500 font-mono shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>
              Menampilkan <strong className="text-stone-800 font-bold">{filteredInvoices.length}</strong> transaksi tagihan
            </span>
          </div>
        </div>
      </div>

      {/* PRINT-ONLY FORMAL HEADER */}
      <div className="hidden print:block font-sans text-black p-4 space-y-4">
        <div className="border-b-2 border-stone-900 pb-3 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wider">PT NUSANTARA MINERAL SUKSES ABADI</h1>
            <p className="text-xs text-stone-600 font-mono">DIVISI FINANCE &amp; PERPAJAKAN (TAX HO)</p>
            <h2 className="text-sm font-semibold text-stone-850 mt-1">
              Rekapitulasi Pemotongan Pajak PPh Pasal 23 Transaksi Tagihan Rekanan - Periode {currentMonthLabel}
            </h2>
          </div>
          <div className="text-right font-mono text-[10px] text-stone-500">
            <p>Dicetak: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            <p>Total PPh 23: Rp {formatRupiah(stats.totalPph23)}</p>
          </div>
        </div>
      </div>

      {/* MAIN DATA TABLE (EXACT REQUESTED COLUMNS ONLY) */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-900 text-white font-mono uppercase text-[11px] tracking-wider border-b border-stone-800">
                {/* 1. NO */}
                <th className="py-3.5 px-3 text-center w-12">No</th>

                {/* 2. TGL & NO DOKUMEN TRANSAKSINYA */}
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[170px]">Tgl &amp; No Dokumen Transaksinya</th>

                {/* 3. VENDOR */}
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[200px]">Vendor</th>

                {/* 4. NPWP */}
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[210px]">NPWP</th>

                {/* 5. DPP DARI TRANSAKSINYA (DILUAR PPN DAN BIAYA LAINNYA) */}
                <th className="py-3.5 px-4 text-right whitespace-nowrap min-w-[220px]">
                  DPP dari Transaksinya (diluar PPN &amp; biaya lainnya)
                </th>

                {/* 6. TARIF % */}
                <th className="py-3.5 px-3 text-center whitespace-nowrap w-20">Tarif %</th>

                {/* 7. PPH YANG DIPOTONG -2% */}
                <th className="py-3.5 px-4 text-right whitespace-nowrap min-w-[180px] bg-amber-500/25 text-amber-300 font-black">
                  PPh Yang dipotong -2%
                </th>

                {/* 8. LIHAT DOKUMENNYA */}
                <th className="py-3.5 px-4 text-center whitespace-nowrap w-40 print:hidden">
                  Lihat Dokumennya
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-stone-500">
                    <Receipt size={36} className="mx-auto text-stone-300 mb-2" />
                    <p className="font-bold text-sm text-stone-700">
                      Tidak ada transaksi tagihan pada periode {currentMonthLabel}.
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Pilih periode bulan lain atau pilih &quot;Semua Periode Bulan&quot; pada filter di atas.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((sub, idx) => {
                  const { dpp, rate, pphAmount, hasNpwp, npwpRecord } = getPphDetails(sub);
                  const displayNpwp = npwpRecord?.npwpNumber || sub.vendorNpwp;
                  const docNumber = sub.invoiceNumber || sub.kode || 'Tanpa No Dokumen';
                  const driveFileCount = (sub.googleDriveFiles || []).length;
                  const hasDriveFiles = driveFileCount > 0 || !!sub.googleDriveFileUrl;

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-amber-50/30 transition duration-150 group"
                    >
                      {/* 1. NO */}
                      <td className="py-3 px-3 text-center text-stone-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* 2. TGL & NO DOKUMEN TRANSAKSINYA */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900 font-mono text-[11px]">
                          {sub.tanggal}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="text-[10.5px] text-amber-800 font-mono font-bold truncate max-w-[170px]"
                            title={docNumber}
                          >
                            {sub.invoiceNumber ? `Inv: ${sub.invoiceNumber}` : `Ref: ${sub.kode}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(docNumber);
                              setCopiedId(`doc-${sub.id}`);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                            className="p-0.5 text-stone-400 hover:text-stone-700 transition print:hidden"
                            title="Salin Nomor Dokumen"
                          >
                            {copiedId === `doc-${sub.id}` ? (
                              <Check size={11} className="text-emerald-600" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                        </div>
                        {sub.jenisPengajuan && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 text-[9px] font-mono">
                            {sub.jenisPengajuan}
                          </span>
                        )}
                      </td>

                      {/* 3. VENDOR */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900 text-xs">
                          {sub.dibayarkanKepada}
                        </div>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {sub.dibayarkanDengan || 'Transfer'}
                        </span>
                      </td>

                      {/* 4. NPWP */}
                      <td className="py-3 px-4">
                        {displayNpwp ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-stone-900 text-[11px] bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                                {displayNpwp}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyNpwp(displayNpwp, sub.id)}
                                className="p-1 text-stone-400 hover:text-stone-700 rounded transition print:hidden"
                                title="Salin Nomor NPWP untuk Web Coretax"
                              >
                                {copiedId === sub.id ? (
                                  <Check size={12} className="text-emerald-600" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] font-mono">
                              <span
                                className={`px-1.5 py-0.2 rounded font-bold ${
                                  npwpRecord?.taxStatus === 'PKP'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-stone-100 text-stone-700'
                                }`}
                              >
                                {npwpRecord?.taxStatus || 'PKP'}
                              </span>
                              {npwpRecord?.kppName && (
                                <span className="text-stone-500 truncate max-w-[130px]" title={npwpRecord.kppName}>
                                  KPP: {npwpRecord.kppName}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold font-mono">
                              <AlertCircle size={11} />
                              <span>NPWP Belum Ada</span>
                            </span>
                            <div className="print:hidden">
                              <button
                                type="button"
                                onClick={() => {
                                  setNpwpModalVendor(sub.dibayarkanKepada);
                                  setNpwpInputNumber('');
                                  setNpwpInputKpp('');
                                  setNpwpInputAddress('');
                                }}
                                className="inline-flex items-center gap-1 text-[10px] text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                              >
                                <Plus size={10} />
                                <span>+ Catat NPWP</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 5. DPP DARI TRANSAKSINYA (DILUAR PPN DAN BIAYA LAINNYA) */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-mono font-black text-stone-900 text-xs">
                          Rp {formatRupiah(dpp)}
                        </div>
                        <span className="text-[9.5px] text-stone-400 font-mono">
                          (Dasar Pengenaan Pajak)
                        </span>
                      </td>

                      {/* 6. TARIF % */}
                      <td className="py-3 px-3 text-center font-mono">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10.5px] font-bold ${
                            hasNpwp
                              ? 'bg-amber-100 text-amber-900 border border-amber-200'
                              : 'bg-rose-100 text-rose-900 border border-rose-200'
                          }`}
                        >
                          {rate}%
                        </span>
                        {!hasNpwp && (
                          <span className="block text-[8.5px] text-rose-600 font-bold mt-0.5">Non-NPWP</span>
                        )}
                      </td>

                      {/* 7. PPH YANG DIPOTONG -2% */}
                      <td className="py-3 px-4 text-right bg-amber-50/50">
                        <div className="font-mono font-black text-amber-900 text-xs">
                          -Rp {formatRupiah(pphAmount)}
                        </div>
                        <span className="text-[9px] text-amber-700 font-mono font-bold">
                          Potongan -{rate}%
                        </span>
                      </td>

                      {/* 8. LIHAT DOKUMENNYA */}
                      <td className="py-3 px-4 text-center print:hidden">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewSub(sub)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl transition text-[11px] font-bold shadow-3xs cursor-pointer"
                            title="Buka Pratinjau Dokumen & Lampiran"
                          >
                            <Eye size={12} className="text-amber-600" />
                            <span>Lihat Dokumen</span>
                            {hasDriveFiles && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Ada Berkas Lampiran Drive"></span>
                            )}
                          </button>

                          {/* Subtle Edit Action */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(sub)}
                            className="p-1.5 bg-stone-50 hover:bg-amber-100 hover:text-amber-900 text-stone-400 rounded-lg transition"
                            title="Sesuaikan DPP / Tarif PPh 23"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* GRAND TOTAL FOOTER */}
            {filteredInvoices.length > 0 && (
              <tfoot>
                <tr className="bg-stone-100 font-mono font-black text-stone-900 border-t-2 border-stone-300">
                  <td colSpan={4} className="py-3.5 px-4 text-right font-sans text-xs uppercase tracking-wider">
                    Total Rekapitulasi ({filteredInvoices.length} Transaksi Tagihan - {currentMonthLabel}):
                  </td>
                  <td className="py-3.5 px-4 text-right text-xs text-stone-900">
                    Rp {formatRupiah(stats.totalDpp)}
                  </td>
                  <td className="py-3.5 px-3 text-center text-stone-500 font-normal">-</td>
                  <td className="py-3.5 px-4 text-right text-xs text-amber-950 bg-amber-500/20 font-black">
                    -Rp {formatRupiah(stats.totalPph23)}
                  </td>
                  <td className="py-3.5 px-4 text-center print:hidden">
                    <span className="text-[10px] text-stone-500 font-sans">
                      PPh 23 Terhitung
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* MODAL: LIHAT DOKUMEN TRANSAKSI & LAMPIRAN */}
      {previewSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-stone-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm leading-tight">Dokumen Transaksi Tagihan</h3>
                  <p className="text-[10px] font-mono text-stone-400">
                    {previewSub.invoiceNumber ? `Invoice: ${previewSub.invoiceNumber}` : `Ref: ${previewSub.kode}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewSub(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* Ringkasan Header Transaksi */}
              <div className="grid grid-cols-2 gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                <div>
                  <span className="text-[10px] text-stone-400 font-mono uppercase block">Vendor / Rekanan</span>
                  <p className="font-bold text-stone-900 text-sm mt-0.5">{previewSub.dibayarkanKepada}</p>
                  <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                    NPWP: {findNpwpForVendor(previewSub.dibayarkanKepada)?.npwpNumber || previewSub.vendorNpwp || 'Belum Terdaftar'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-stone-400 font-mono uppercase block">Tanggal &amp; Cara Bayar</span>
                  <p className="font-bold text-stone-900 text-sm mt-0.5">{previewSub.tanggal}</p>
                  <p className="text-[10px] text-stone-500 font-mono mt-0.5">{previewSub.dibayarkanDengan || 'Transfer Bank'}</p>
                </div>
              </div>

              {/* Rincian Finansial & Pajak */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-stone-100 border border-stone-200">
                  <span className="text-[10px] text-stone-500 font-mono uppercase block">DPP (di luar PPN)</span>
                  <p className="font-mono font-black text-stone-900 text-sm mt-1">
                    Rp {formatRupiah(calculateInvoiceDpp(previewSub))}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-[10px] text-amber-800 font-mono uppercase block">PPh 23 Dipotong</span>
                  <p className="font-mono font-black text-amber-900 text-sm mt-1">
                    -Rp {formatRupiah(getPphDetails(previewSub).pphAmount)} ({getPphDetails(previewSub).rate}%)
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] text-emerald-800 font-mono uppercase block">Netto Dibayarkan</span>
                  <p className="font-mono font-black text-emerald-900 text-sm mt-1">
                    Rp {formatRupiah(getPphDetails(previewSub).netAmount)}
                  </p>
                </div>
              </div>

              {/* Rincian Item Tagihan */}
              <div>
                <h4 className="font-bold text-stone-800 text-xs mb-1.5 flex items-center gap-1.5">
                  <Receipt size={14} className="text-amber-600" />
                  <span>Rincian Item Pengajuan ({previewSub.items?.length || 0} Item)</span>
                </h4>
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-stone-100 font-mono text-[10px] text-stone-600 uppercase border-b border-stone-200">
                      <tr>
                        <th className="py-2 px-3">Uraian Item</th>
                        <th className="py-2 px-2 text-center">Volume / Keterangan</th>
                        <th className="py-2 px-3 text-right">Total Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150">
                      {(previewSub.items || []).map((itm, i) => (
                        <tr key={i} className="hover:bg-stone-50">
                          <td className="py-2 px-3 font-medium text-stone-800">{itm.item}</td>
                          <td className="py-2 px-2 text-center font-mono text-stone-500">
                            {itm.jumlahVolume || itm.keterangan || '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">
                            Rp {formatRupiah(itm.total || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Berkas Dokumen & Lampiran Tagihan */}
              <div>
                <h4 className="font-bold text-stone-800 text-xs mb-1.5 flex items-center gap-1.5">
                  <Cloud size={14} className="text-amber-600" />
                  <span>Berkas Dokumen Lampiran Tagihan</span>
                </h4>
                
                {(() => {
                  const driveFiles = previewSub.googleDriveFiles || [];
                  const rawFiles = (previewSub.files || []).filter(f => !driveFiles.some(df => df.name === f.name));
                  const hasDriveUrl = !!previewSub.googleDriveFileUrl && driveFiles.length === 0;
                  const hasPaymentProof = !!previewSub.buktiPembayaran?.url;
                  const totalFiles = driveFiles.length + rawFiles.length + (hasDriveUrl ? 1 : 0) + (hasPaymentProof ? 1 : 0);

                  if (totalFiles === 0) {
                    return (
                      <div className="p-4 rounded-xl bg-stone-50 border border-dashed border-stone-200 text-center text-stone-400 text-xs">
                        Belum ada berkas lampiran yang diunggah untuk transaksi ini.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-1.5">
                      {driveFiles.map((file, fIdx) => (
                        <div
                          key={`df-${fIdx}`}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-200 hover:border-amber-300 transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileCheck size={16} className="text-emerald-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-stone-900 text-xs truncate">{file.name}</p>
                              <span className="text-[10px] font-mono text-stone-400 uppercase">
                                Google Drive • {file.docType ? file.docType.replace('_', ' ') : 'Lampiran'}
                              </span>
                            </div>
                          </div>

                          {file.url && (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-lg text-xs transition shrink-0 shadow-3xs"
                            >
                              <span>Buka Dokumen</span>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      ))}

                      {hasDriveUrl && (
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileCheck size={16} className="text-emerald-600 shrink-0" />
                            <p className="font-bold text-stone-900 text-xs truncate">
                              {previewSub.googleDriveFileName || 'Dokumen Tagihan (Drive)'}
                            </p>
                          </div>
                          <a
                            href={previewSub.googleDriveFileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-lg text-xs transition shadow-3xs"
                          >
                            <span>Buka di Drive</span>
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      )}

                      {rawFiles.map((file, rIdx) => (
                        <div
                          key={`rf-${rIdx}`}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-200"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={16} className="text-stone-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-stone-900 text-xs truncate">{file.name}</p>
                              <span className="text-[10px] font-mono text-stone-400 uppercase">Lampiran Tambahan</span>
                            </div>
                          </div>
                          {file.url && (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-lg text-xs transition shrink-0"
                            >
                              <span>Buka</span>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      ))}

                      {hasPaymentProof && (
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-bold text-stone-900 text-xs truncate">
                                {previewSub.buktiPembayaran?.name || 'Bukti Bayar / Transfer'}
                              </p>
                              <span className="text-[10px] font-mono text-emerald-700 uppercase">Bukti Pelunasan</span>
                            </div>
                          </div>
                          <a
                            href={previewSub.buktiPembayaran!.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shrink-0 shadow-3xs"
                          >
                            <span>Lihat Bukti Bayar</span>
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPreviewSub(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 font-bold hover:bg-stone-100 transition text-xs"
              >
                Tutup
              </button>

              {onSelectSubmission && (
                <button
                  type="button"
                  onClick={() => {
                    const subToOpen = previewSub;
                    setPreviewSub(null);
                    onSelectSubmission(subToOpen);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black transition text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer size={13} />
                  <span>Buka Lembar Cetak Voucher HO (F1/F2)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SESUAIKAN DPP & TARIF PPH 23 */}
      {editingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-amber-400" />
                <h3 className="font-bold text-sm">Sesuaikan DPP &amp; PPh 23</h3>
              </div>
              <button
                onClick={() => setEditingSub(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">Vendor:</span>
                  <strong className="text-stone-900">{editingSub.dibayarkanKepada}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">No. Dokumen:</span>
                  <strong className="text-stone-900">{editingSub.invoiceNumber || editingSub.kode}</strong>
                </div>
              </div>

              {/* DPP & Tarif */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    DPP Transaksi (di luar PPN)
                  </label>
                  <input
                    type="number"
                    value={editDpp}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setEditDpp(val);
                      setEditPphAmount(Math.round(val * (editRate / 100)));
                    }}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    Tarif PPh 23 (%)
                  </label>
                  <select
                    value={editRate}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      setEditRate(r);
                      setEditPphAmount(Math.round(editDpp * (r / 100)));
                    }}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  >
                    <option value={2}>2% (Standar Ber-NPWP)</option>
                    <option value={4}>4% (Non-NPWP)</option>
                    <option value={0}>0% (Bebas / SKB)</option>
                  </select>
                </div>
              </div>

              {/* Nominal PPh 23 Dipotong */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <label className="block text-[11px] font-bold text-amber-900">
                  Nominal PPh 23 yang Dipotong (Rp)
                </label>
                <input
                  type="number"
                  value={editPphAmount}
                  onChange={(e) => setEditPphAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg font-mono font-bold text-amber-900 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              {/* Nomor Bukti Potong */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-stone-700">
                  Nomor Bukti Potong (Opsional)
                </label>
                <input
                  type="text"
                  value={editBupotNumber}
                  onChange={(e) => setEditBupotNumber(e.target.value)}
                  placeholder="mis. BP23-2026-001..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSub(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 font-bold hover:bg-stone-100 transition text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black transition text-xs flex items-center gap-1.5 shadow-xs"
              >
                <Save size={13} />
                <span>Simpan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUICK CATAT NPWP VENDOR */}
      {npwpModalVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-amber-400" />
                <h3 className="font-bold text-sm">Catat Data NPWP Vendor</h3>
              </div>
              <button
                onClick={() => setNpwpModalVendor(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
                <span className="text-[10px] text-stone-400 font-mono uppercase font-bold block">
                  Nama Wajib Pajak / Perusahaan
                </span>
                <p className="font-bold text-stone-900 text-sm mt-0.5">{npwpModalVendor}</p>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-stone-700">
                  Nomor NPWP (15 atau 16 Digit) *
                </label>
                <input
                  type="text"
                  value={npwpInputNumber}
                  onChange={(e) => setNpwpInputNumber(e.target.value)}
                  placeholder="Contoh: 01.234.567.8-901.000"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    Status Wajib Pajak
                  </label>
                  <select
                    value={npwpInputTaxStatus}
                    onChange={(e) => setNpwpInputTaxStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  >
                    <option value="PKP">PKP (Pengusaha Kena Pajak)</option>
                    <option value="Non-PKP">Non-PKP</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    KPP Pratama Terdaftar
                  </label>
                  <input
                    type="text"
                    value={npwpInputKpp}
                    onChange={(e) => setNpwpInputKpp(e.target.value)}
                    placeholder="mis. KPP Pratama Jakarta..."
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-stone-700">
                  Alamat Sesuai NPWP (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={npwpInputAddress}
                  onChange={(e) => setNpwpInputAddress(e.target.value)}
                  placeholder="Alamat kantor terdaftar..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden resize-none"
                />
              </div>
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNpwpModalVendor(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 font-bold hover:bg-stone-100 transition text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveQuickNpwp}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-black transition text-xs flex items-center gap-1.5 shadow-xs"
              >
                <Save size={13} />
                <span>Simpan ke Master NPWP</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

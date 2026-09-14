import React, { useState, useMemo } from 'react';
import { Submission, NpwpRecord } from '../types';
import { formatRupiah, isVendorOrCompanyMatch } from '../utils';
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
  Filter,
  ArrowRight,
  Edit3,
  Calendar,
  Save,
  X,
  Plus,
  Receipt,
  Sparkles,
  ChevronDown
} from 'lucide-react';

interface Pph23BupotRecapProps {
  submissions: Submission[];
  npwpRecords: NpwpRecord[];
  onSaveNpwpRecords: (records: NpwpRecord[]) => void;
  onUpdateSubmission: (submission: Submission) => void;
  onSelectSubmission?: (sub: Submission) => void;
  onBackToVoucher?: () => void;
}

export const Pph23BupotRecap: React.FC<Pph23BupotRecapProps> = ({
  submissions,
  npwpRecords,
  onSaveNpwpRecords,
  onUpdateSubmission,
  onSelectSubmission,
  onBackToVoucher
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('All');
  const [statusBupotFilter, setStatusBupotFilter] = useState<'ALL' | 'BELUM' | 'SUDAH' | 'SIAP_LAPOR'>('ALL');
  const [onlyPsiAndJasa, setOnlyPsiAndJasa] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Quick edit modal for PPh 23 and Bupot
  const [editingSub, setEditingSub] = useState<Submission | null>(null);
  const [editDpp, setEditDpp] = useState<number>(0);
  const [editRate, setEditRate] = useState<number>(2);
  const [editPphAmount, setEditPphAmount] = useState<number>(0);
  const [editBupotNumber, setEditBupotNumber] = useState<string>('');
  const [editBupotStatus, setEditBupotStatus] = useState<'Belum Bupot' | 'Sudah Bupot' | 'Siap Lapor Coretax'>('Belum Bupot');
  const [editBupotDate, setEditBupotDate] = useState<string>('');

  // Quick NPWP modal
  const [npwpModalVendor, setNpwpModalVendor] = useState<string | null>(null);
  const [npwpInputNumber, setNpwpInputNumber] = useState('');
  const [npwpInputKpp, setNpwpInputKpp] = useState('');
  const [npwpInputTaxStatus, setNpwpInputTaxStatus] = useState<'PKP' | 'Non-PKP'>('PKP');
  const [npwpInputAddress, setNpwpInputAddress] = useState('');

  // Helper to find matching NPWP for a company/vendor
  const findNpwpForVendor = (vendorName: string): NpwpRecord | undefined => {
    if (!vendorName) return undefined;
    return npwpRecords.find(r => isVendorOrCompanyMatch(r.companyName, vendorName));
  };

  // Helper to compute effective DPP, rate, and PPh 23
  const getPphDetails = (sub: Submission) => {
    const rawTotal = (sub.items || []).reduce((acc, itm) => acc + (Number(itm.total) || 0), 0);
    const dpp = sub.dppAmount ?? (sub.invoiceAmount || rawTotal);
    
    // Check if vendor has NPWP
    const npwp = findNpwpForVendor(sub.dibayarkanKepada) || sub.vendorNpwp;
    const defaultRate = npwp ? 2 : 4; // 2% for registered NPWP, 4% for non-NPWP according to PPh 23
    const rate = sub.pph23Rate ?? defaultRate;
    
    // PPh 23 amount (standard or customized)
    const pphAmount = sub.pph23Amount !== undefined ? sub.pph23Amount : Math.round(dpp * (rate / 100));
    const netAmount = Math.max(0, dpp - pphAmount);
    
    const bupotStatus = sub.bupotStatus || (sub.bupotNumber ? 'Sudah Bupot' : 'Belum Bupot');
    const bupotNumber = sub.bupotNumber || '';

    return {
      dpp,
      rate,
      pphAmount,
      netAmount,
      bupotStatus,
      bupotNumber,
      hasNpwp: !!npwp
    };
  };

  // Filter submissions: only Biaya PSi or Jasa, or marked with PPh 23
  const psiSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      const jenisLower = (sub.jenisPengajuan || '').toLowerCase();
      const itemsText = (sub.items || []).map(i => i.item || '').join(' ').toLowerCase();
      const penerimaLower = (sub.dibayarkanKepada || '').toLowerCase();

      // Check if it's Biaya PSi or Jasa
      const isPsi = jenisLower.includes('psi') || itemsText.includes('psi') || jenisLower.includes('pre-shipment');
      const isJasa = jenisLower.includes('jasa') || itemsText.includes('jasa') || itemsText.includes('survey') || itemsText.includes('inspeksi');
      const isMarkedPph = sub.pph23Amount !== undefined || !!sub.bupotNumber;

      if (onlyPsiAndJasa) {
        if (!isPsi && !isJasa && !isMarkedPph) return false;
      }

      // Filter by month
      if (selectedMonthFilter !== 'All') {
        const subMonth = (sub.tanggal || '').substring(0, 7);
        if (subMonth !== selectedMonthFilter) return false;
      }

      // Filter by Bupot status
      const { bupotStatus } = getPphDetails(sub);
      if (statusBupotFilter === 'BELUM' && bupotStatus !== 'Belum Bupot') return false;
      if (statusBupotFilter === 'SUDAH' && bupotStatus !== 'Sudah Bupot') return false;
      if (statusBupotFilter === 'SIAP_LAPOR' && bupotStatus !== 'Siap Lapor Coretax') return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const npwp = findNpwpForVendor(sub.dibayarkanKepada);
        const npwpText = npwp ? `${npwp.npwpNumber} ${npwp.companyName}`.toLowerCase() : '';
        const match =
          (sub.dibayarkanKepada || '').toLowerCase().includes(q) ||
          (sub.kode || '').toLowerCase().includes(q) ||
          (sub.invoiceNumber || '').toLowerCase().includes(q) ||
          (sub.jenisPengajuan || '').toLowerCase().includes(q) ||
          (sub.bupotNumber || '').toLowerCase().includes(q) ||
          itemsText.includes(q) ||
          npwpText.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [submissions, onlyPsiAndJasa, selectedMonthFilter, statusBupotFilter, searchQuery, npwpRecords]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalDpp = 0;
    let totalPph23 = 0;
    let totalNetto = 0;
    let bupotTerbitCount = 0;
    let npwpRegisteredCount = 0;

    psiSubmissions.forEach(sub => {
      const { dpp, pphAmount, netAmount, bupotStatus, hasNpwp } = getPphDetails(sub);
      totalDpp += dpp;
      totalPph23 += pphAmount;
      totalNetto += netAmount;
      if (bupotStatus === 'Sudah Bupot' || bupotStatus === 'Siap Lapor Coretax') {
        bupotTerbitCount++;
      }
      if (hasNpwp) {
        npwpRegisteredCount++;
      }
    });

    return {
      count: psiSubmissions.length,
      totalDpp,
      totalPph23,
      totalNetto,
      bupotTerbitCount,
      npwpRegisteredCount
    };
  }, [psiSubmissions, npwpRecords]);

  // Available months for filtering
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => {
      if (s.tanggal && s.tanggal.length >= 7) {
        set.add(s.tanggal.substring(0, 7));
      }
    });
    return Array.from(set).sort().reverse();
  }, [submissions]);

  // Handle open edit PPh 23 modal
  const handleOpenEdit = (sub: Submission) => {
    const { dpp, rate, pphAmount, bupotStatus, bupotNumber } = getPphDetails(sub);
    setEditingSub(sub);
    setEditDpp(dpp);
    setEditRate(rate);
    setEditPphAmount(pphAmount);
    setEditBupotNumber(bupotNumber);
    setEditBupotStatus(bupotStatus);
    setEditBupotDate(sub.bupotDate || sub.tanggal || new Date().toISOString().substring(0, 10));
  };

  // Recalculate PPh 23 when DPP or rate changes in modal
  const handleDppChange = (val: number) => {
    setEditDpp(val);
    setEditPphAmount(Math.round(val * (editRate / 100)));
  };

  const handleRateChange = (rateVal: number) => {
    setEditRate(rateVal);
    setEditPphAmount(Math.round(editDpp * (rateVal / 100)));
  };

  // Save edit PPh 23 & Bupot
  const handleSaveEdit = () => {
    if (!editingSub) return;
    const updated: Submission = {
      ...editingSub,
      dppAmount: editDpp,
      pph23Rate: editRate,
      pph23Amount: editPphAmount,
      bupotNumber: editBupotNumber.trim(),
      bupotStatus: editBupotStatus,
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

  // Copy all table rows formatted for Coretax DJP / Excel
  const handleCopyAllForCoretax = () => {
    const headers = [
      'No',
      'Tanggal Transaksi',
      'Nomor Dokumen / Invoice',
      'Nama Vendor / Penerima',
      'Nomor NPWP Terkait',
      'Status Pajak',
      'Uraian Transaksi (Jasa)',
      'Dasar Pengenaan Pajak (DPP)',
      'Tarif PPh 23 (%)',
      'Pajak PPh 23 Dipotong (Rp)',
      'Nominal Netto (Rp)',
      'Nomor Bukti Potong (Bupot)',
      'Status Bupot Coretax'
    ];

    const rows = psiSubmissions.map((sub, idx) => {
      const { dpp, rate, pphAmount, netAmount, bupotStatus, bupotNumber } = getPphDetails(sub);
      const npwp = findNpwpForVendor(sub.dibayarkanKepada);
      const itemDesc = (sub.items || []).map(i => i.item).filter(Boolean).join('; ') || sub.jenisPengajuan;

      return [
        idx + 1,
        sub.tanggal,
        sub.invoiceNumber || sub.kode,
        sub.dibayarkanKepada,
        npwp?.npwpNumber || sub.vendorNpwp || 'BELUM ADA NPWP',
        npwp?.taxStatus || 'Non-PKP',
        itemDesc,
        dpp,
        `${rate}%`,
        pphAmount,
        netAmount,
        bupotNumber || '-',
        bupotStatus
      ].join('\t');
    });

    const tsvContent = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(tsvContent);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // Export CSV for Coretax DJP
  const handleExportCsv = () => {
    const headers = [
      'No',
      'Tanggal Transaksi',
      'Nomor Dokumen / Invoice',
      'Nama Perusahaan Vendor',
      'NPWP Vendor',
      'Status Pajak Rekanan',
      'KPP Pratama',
      'Uraian Jasa',
      'DPP / Penghasilan Bruto (Rp)',
      'Tarif PPh 23 (%)',
      'PPh 23 Dipotong (Rp)',
      'Jumlah Netto (Rp)',
      'Nomor Bukti Potong Coretax',
      'Tanggal Bupot',
      'Status Bukti Potong'
    ];

    const rows = psiSubmissions.map((sub, idx) => {
      const { dpp, rate, pphAmount, netAmount, bupotStatus, bupotNumber } = getPphDetails(sub);
      const npwp = findNpwpForVendor(sub.dibayarkanKepada);
      const itemDesc = (sub.items || []).map(i => i.item).filter(Boolean).join('; ') || sub.jenisPengajuan;

      return [
        idx + 1,
        `"${sub.tanggal}"`,
        `"${(sub.invoiceNumber || sub.kode || '').replace(/"/g, '""')}"`,
        `"${(sub.dibayarkanKepada || '').replace(/"/g, '""')}"`,
        `"${(npwp?.npwpNumber || sub.vendorNpwp || '').replace(/"/g, '""')}"`,
        `"${npwp?.taxStatus || 'Non-PKP'}"`,
        `"${(npwp?.kppName || '').replace(/"/g, '""')}"`,
        `"${itemDesc.replace(/"/g, '""')}"`,
        dpp,
        rate,
        pphAmount,
        netAmount,
        `"${bupotNumber.replace(/"/g, '""')}"`,
        `"${sub.bupotDate || sub.tanggal || ''}"`,
        `"${bupotStatus}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rekap_Bupot_PPh23_Biaya_PSi_Jasa_${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-500/10 text-amber-800 rounded-xl border border-amber-500/20">
              <Receipt size={22} className="text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-stone-900 tracking-tight font-display uppercase">
                  Bukti Potong PPh 23 (Biaya PSi & Jasa)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold font-mono uppercase tracking-wider">
                  Coretax DJP Ready
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Pusat data transaksi Biaya PSi &amp; Jasa rekanan lengkap dengan kolom Pajak PPh 23 yang dipotong, data NPWP perusahaan, serta nomor Bukti Potong untuk pelaporan SPT Masa Unifikasi Web Pajak Coretax.
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
            title="Buka Portal Resmi Coretax DJP di Tab Baru"
          >
            <ExternalLink size={13} className="text-amber-700" />
            <span>Web Coretax DJP</span>
          </a>

          <button
            onClick={handleCopyAllForCoretax}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl transition text-xs shadow-3xs cursor-pointer"
            title="Salin seluruh baris tabel ke clipboard untuk paste langsung ke Excel / Coretax"
          >
            {copiedAll ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-stone-600" />}
            <span>{copiedAll ? 'Berhasil Disalin!' : 'Salin Data Coretax'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl transition text-xs shadow-xs cursor-pointer"
            title="Unduh file CSV format pelaporan pajak"
          >
            <Download size={13} className="text-amber-400" />
            <span>Ekspor CSV Coretax</span>
          </button>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-stone-50 hover:bg-stone-100 border border-stone-250 text-stone-800 font-bold rounded-xl transition text-xs shadow-3xs cursor-pointer"
            title="Cetak Laporan Rekap Bupot PPh 23"
          >
            <Printer size={13} className="text-stone-600" />
            <span className="hidden sm:inline">Cetak</span>
          </button>
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 print:hidden">
        {/* Total Transaksi */}
        <div className="bg-white p-4.5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider font-mono">
              Total Transaksi PSi / Jasa
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-stone-900 font-sans">
                {stats.count}
              </span>
              <span className="text-xs text-stone-500 font-medium">Transaksi</span>
            </div>
            <p className="text-[10px] text-stone-400">Objek Pemotongan PPh Pasal 23</p>
          </div>
          <div className="p-3 bg-stone-100 rounded-xl text-stone-700">
            <FileText size={20} />
          </div>
        </div>

        {/* Total DPP Bruto */}
        <div className="bg-white p-4.5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider font-mono">
              Total DPP (Nilai Bruto Jasa)
            </span>
            <div className="text-xl sm:text-2xl font-black text-stone-900 font-mono tracking-tight">
              Rp {formatRupiah(stats.totalDpp)}
            </div>
            <p className="text-[10px] text-stone-400">Dasar Pengenaan Pajak</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
            <Receipt size={20} />
          </div>
        </div>

        {/* Total PPh 23 Dipotong (Highlight) */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-4.5 rounded-2xl shadow-xs text-stone-950 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider font-mono text-stone-900/80">
              Total Pajak PPh 23 Dipotong
            </span>
            <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-stone-950">
              Rp {formatRupiah(stats.totalPph23)}
            </div>
            <p className="text-[10px] text-stone-900 font-semibold">
              Wajib Disetor &amp; Dilaporkan ke Coretax
            </p>
          </div>
          <div className="p-3 bg-white/30 backdrop-blur-xs rounded-xl text-stone-950">
            <Sparkles size={20} />
          </div>
        </div>

        {/* Status NPWP & Bupot */}
        <div className="bg-white p-4.5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider font-mono">
              NPWP &amp; Status Bupot
            </span>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-lg font-black text-emerald-700 font-sans">
                  {stats.npwpRegisteredCount}/{stats.count}
                </span>
                <span className="block text-[9px] text-stone-500 font-mono">Ber-NPWP</span>
              </div>
              <div className="h-6 w-px bg-stone-200"></div>
              <div>
                <span className="text-lg font-black text-indigo-700 font-sans">
                  {stats.bupotTerbitCount}/{stats.count}
                </span>
                <span className="block text-[9px] text-stone-500 font-mono">Terbit Bupot</span>
              </div>
            </div>
            <p className="text-[10px] text-stone-400">Validasi identitas Coretax DJP</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
            <ShieldCheck size={20} />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3 print:hidden">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan nama vendor, nomor invoice, nomor bupot, NPWP, atau uraian jasa..."
              className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
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

          {/* Month Filter */}
          <div className="flex items-center gap-2 shrink-0">
            <Calendar size={15} className="text-stone-400 shrink-0" />
            <select
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-700 focus:outline-hidden focus:border-amber-500"
            >
              <option value="All">Semua Periode Bulan</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {new Date(`${m}-01`).toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })}
                </option>
              ))}
            </select>
          </div>

          {/* Status Bupot Filter */}
          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setStatusBupotFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusBupotFilter === 'ALL'
                  ? 'bg-white text-stone-900 shadow-3xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Semua ({psiSubmissions.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusBupotFilter('BELUM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusBupotFilter === 'BELUM'
                  ? 'bg-amber-600 text-white shadow-3xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Belum Bupot
            </button>
            <button
              type="button"
              onClick={() => setStatusBupotFilter('SUDAH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusBupotFilter === 'SUDAH'
                  ? 'bg-emerald-700 text-white shadow-3xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Sudah Bupot
            </button>
          </div>
        </div>

        {/* Sub-bar toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-150 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-stone-700 font-semibold select-none">
            <input
              type="checkbox"
              checked={onlyPsiAndJasa}
              onChange={(e) => setOnlyPsiAndJasa(e.target.checked)}
              className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
            />
            <span>Hanya Transaksi Khusus Biaya PSi atau Jasa (Pre-Shipment Inspection / Surveyor / Teknik)</span>
          </label>

          <span className="text-[11px] text-stone-400 font-mono">
            Menampilkan <strong className="text-stone-800">{psiSubmissions.length}</strong> transaksi kena pajak
          </span>
        </div>
      </div>

      {/* PRINT-ONLY FORMAL HEADER */}
      <div className="hidden print:block font-sans text-black p-4 space-y-4">
        <div className="border-b-2 border-stone-900 pb-3 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wider">PT NUSANTARA MINERAL SUKSES ABADI</h1>
            <p className="text-xs text-stone-600 font-mono">DIVISI FINANCE &amp; PERPAJAKAN (TAX HO)</p>
            <h2 className="text-sm font-semibold text-stone-850 mt-1">
              Daftar Rekapitulasi Pemotongan Pajak PPh Pasal 23 (Biaya PSi &amp; Jasa Rekanan) - Web Pajak Coretax
            </h2>
          </div>
          <div className="text-right font-mono text-[10px] text-stone-500">
            <p>Dicetak: {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            <p>Total PPh 23: Rp {formatRupiah(stats.totalPph23)}</p>
          </div>
        </div>
      </div>

      {/* MAIN DATA TABLE */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-900 text-white font-mono uppercase text-[11px] tracking-wider border-b border-stone-800">
                <th className="py-3.5 px-3 text-center w-12">No</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[120px]">Tgl &amp; Dokumen</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[200px]">Vendor / Penerima Kas</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[220px]">NPWP Terkait Perusahaan</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[200px]">Uraian Biaya / Jasa</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap min-w-[140px]">DPP (Bruto)</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap w-20">Tarif</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap min-w-[150px] bg-amber-500/20 text-amber-300 font-black">
                  Pajak PPh 23
                </th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap min-w-[140px]">Jumlah Netto</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[180px]">Bukti Potong Coretax</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap w-28 print:hidden">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {psiSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-stone-500">
                    <Receipt size={36} className="mx-auto text-stone-300 mb-2" />
                    <p className="font-bold text-sm text-stone-700">Tidak ada transaksi Biaya PSi atau Jasa yang sesuai filter.</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Coba sesuaikan pencarian atau centang &quot;Semua Periode Bulan&quot;.
                    </p>
                  </td>
                </tr>
              ) : (
                psiSubmissions.map((sub, idx) => {
                  const { dpp, rate, pphAmount, netAmount, bupotStatus, bupotNumber, hasNpwp } = getPphDetails(sub);
                  const npwpRecord = findNpwpForVendor(sub.dibayarkanKepada);
                  const displayNpwp = npwpRecord?.npwpNumber || sub.vendorNpwp;
                  const itemSummary = (sub.items || []).map(i => i.item).filter(Boolean).join(', ') || sub.notes || sub.jenisPengajuan;

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-amber-50/30 transition duration-150 group"
                    >
                      {/* No */}
                      <td className="py-3 px-3 text-center text-stone-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Tgl & No Dokumen */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900 font-mono text-[11px]">
                          {sub.tanggal}
                        </div>
                        <div className="text-[10px] text-amber-700 font-mono font-semibold truncate max-w-[140px]" title={sub.invoiceNumber || sub.kode}>
                          {sub.invoiceNumber ? `Inv: ${sub.invoiceNumber}` : `Ref: ${sub.kode}`}
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 text-[9px] font-bold font-mono">
                          {sub.jenisPengajuan}
                        </span>
                      </td>

                      {/* Vendor Rekanan */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900 text-xs">
                          {sub.dibayarkanKepada}
                        </div>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {sub.dibayarkanDengan}
                        </span>
                      </td>

                      {/* TAMPILAN NPWP TERKAIT PERUSAHAAN (User requirement!) */}
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
                              <span className={`px-1.5 py-0.2 rounded font-bold ${
                                npwpRecord?.taxStatus === 'PKP'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-stone-100 text-stone-700'
                              }`}>
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
                              <span>NPWP Belum Dicatat</span>
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
                                <span>+ Catat NPWP Vendor</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Uraian Biaya / Jasa */}
                      <td className="py-3 px-4">
                        <p className="text-stone-700 text-xs line-clamp-2" title={itemSummary}>
                          {itemSummary}
                        </p>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {sub.items?.length || 0} rincian item
                        </span>
                      </td>

                      {/* DPP (Dasar Pengenaan Pajak) */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-stone-800">
                        Rp {formatRupiah(dpp)}
                      </td>

                      {/* Tarif PPh 23 */}
                      <td className="py-3 px-3 text-center font-mono">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          hasNpwp
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-rose-100 text-rose-900'
                        }`}>
                          {rate}%
                        </span>
                        {!hasNpwp && (
                          <span className="block text-[8px] text-rose-600 font-bold mt-0.5">Non-NPWP</span>
                        )}
                      </td>

                      {/* Pajak PPh 23 yang Dipotong (Highlighted!) */}
                      <td className="py-3 px-4 text-right font-mono font-black text-amber-800 bg-amber-50/50">
                        Rp {formatRupiah(pphAmount)}
                      </td>

                      {/* Jumlah Netto */}
                      <td className="py-3 px-4 text-right font-mono font-medium text-stone-600">
                        Rp {formatRupiah(netAmount)}
                      </td>

                      {/* Status & Nomor Bukti Potong Coretax */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                            bupotStatus === 'Siap Lapor Coretax'
                              ? 'bg-blue-100 text-blue-800'
                              : bupotStatus === 'Sudah Bupot'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {bupotStatus === 'Sudah Bupot' ? <Check size={10} /> : <Clock size={10} />}
                            <span>{bupotStatus}</span>
                          </span>

                          {bupotNumber ? (
                            <div className="text-[10px] font-mono text-stone-700 font-bold truncate max-w-[160px]" title={bupotNumber}>
                              No: {bupotNumber}
                            </div>
                          ) : (
                            <p className="text-[9px] text-stone-400 italic">Belum ada no. bupot</p>
                          )}
                        </div>
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-3 text-center print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(sub)}
                            className="p-1.5 bg-stone-100 hover:bg-amber-100 hover:text-amber-900 text-stone-700 rounded-lg transition"
                            title="Edit Pajak PPh 23 & Nomor Bukti Potong Coretax"
                          >
                            <Edit3 size={13} />
                          </button>

                          {onSelectSubmission && (
                            <button
                              type="button"
                              onClick={() => onSelectSubmission(sub)}
                              className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition"
                              title="Buka Dokumen Voucher Asli"
                            >
                              <ExternalLink size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Grand Total Footer */}
            {psiSubmissions.length > 0 && (
              <tfoot>
                <tr className="bg-stone-100 font-mono font-black text-stone-900 border-t-2 border-stone-300">
                  <td colSpan={5} className="py-3 px-4 text-right font-sans text-xs uppercase tracking-wider">
                    Total Rekapitulasi ({psiSubmissions.length} Transaksi PSi / Jasa):
                  </td>
                  <td className="py-3 px-4 text-right text-xs">
                    Rp {formatRupiah(stats.totalDpp)}
                  </td>
                  <td className="py-3 px-3 text-center text-stone-500">-</td>
                  <td className="py-3 px-4 text-right text-xs text-amber-900 bg-amber-500/20 font-black">
                    Rp {formatRupiah(stats.totalPph23)}
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-stone-700">
                    Rp {formatRupiah(stats.totalNetto)}
                  </td>
                  <td colSpan={2} className="py-3 px-4 text-[10px] text-stone-500 font-sans">
                    Siap dilaporkan di formulir SPT Masa Unifikasi Coretax DJP
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* MODAL: Edit PPh 23 & Bukti Potong */}
      {editingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-amber-400" />
                <h3 className="font-bold text-sm">Sesuaikan Pajak PPh 23 &amp; Bukti Potong</h3>
              </div>
              <button
                onClick={() => setEditingSub(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Info Transaksi */}
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">Penerima Kas:</span>
                  <strong className="text-stone-900">{editingSub.dibayarkanKepada}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Dokumen Ref:</span>
                  <strong className="text-stone-900">{editingSub.invoiceNumber || editingSub.kode}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">NPWP Terkait:</span>
                  <span className="font-mono font-bold text-stone-800">
                    {findNpwpForVendor(editingSub.dibayarkanKepada)?.npwpNumber || 'Belum Terdaftar'}
                  </span>
                </div>
              </div>

              {/* DPP & Tarif */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    DPP / Nilai Bruto Jasa (Rp)
                  </label>
                  <input
                    type="number"
                    value={editDpp}
                    onChange={(e) => handleDppChange(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    Tarif PPh 23 (%)
                  </label>
                  <select
                    value={editRate}
                    onChange={(e) => handleRateChange(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  >
                    <option value={2}>2% (Standar Ber-NPWP)</option>
                    <option value={4}>4% (Non-NPWP / 100% Lebih Tinggi)</option>
                    <option value={0}>0% (Bebas Potong / SKB)</option>
                  </select>
                </div>
              </div>

              {/* Nominal PPh 23 Terhitung */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <label className="block text-[11px] font-bold text-amber-900">
                  Nominal Pajak PPh 23 yang Dipotong (Rp)
                </label>
                <input
                  type="number"
                  value={editPphAmount}
                  onChange={(e) => setEditPphAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg font-mono font-bold text-amber-900 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
                <p className="text-[10px] text-amber-700">
                  Otomatis terhitung dari DPP x Tarif, atau masukkan angka pasti sesuai Bukti Potong resmi.
                </p>
              </div>

              {/* Nomor & Tanggal Bukti Potong */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    Nomor Bukti Potong (Bupot)
                  </label>
                  <input
                    type="text"
                    value={editBupotNumber}
                    onChange={(e) => setEditBupotNumber(e.target.value)}
                    placeholder="mis. BP23-2026-001..."
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    Tanggal Bukti Potong
                  </label>
                  <input
                    type="date"
                    value={editBupotDate}
                    onChange={(e) => setEditBupotDate(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Status Pelaporan */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-stone-700">
                  Status Bukti Potong / Coretax
                </label>
                <select
                  value={editBupotStatus}
                  onChange={(e) => setEditBupotStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-bold text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                >
                  <option value="Belum Bupot">Belum Bupot</option>
                  <option value="Sudah Bupot">Sudah Bupot (Diterbitkan)</option>
                  <option value="Siap Lapor Coretax">Siap Lapor Coretax / Sudah Disetor</option>
                </select>
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
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Quick Catat NPWP Vendor */}
      {npwpModalVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-amber-400" />
                <h3 className="font-bold text-sm">Catat Data NPWP Vendor Rekanan</h3>
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

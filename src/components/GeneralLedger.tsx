import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Calendar, 
  Filter, 
  ArrowUpDown, 
  Download, 
  Printer, 
  ChevronRight, 
  FileText, 
  Layers, 
  Wallet, 
  Building2, 
  Tag, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  ExternalLink,
  DollarSign,
  TrendingDown,
  Info,
  RefreshCw,
  X
} from 'lucide-react';
import { Submission, SubmissionItem } from '../types';
import { formatDateIndonesian, formatRupiah, toTitleCase } from '../utils';

interface GeneralLedgerProps {
  submissions: Submission[];
  userProfile?: any;
  onOpenSubmissionForPrint?: (sub: Submission) => void;
  onEditSubmissionNote?: (sub: Submission) => void;
  onClose?: () => void;
}

interface LedgerRow {
  uniqueId: string;
  submissionId: string;
  tanggal: string;
  kode: string;
  jenisPengajuan: string;
  subJenis: string;
  uraian: string;
  dibayarkanKepada: string;
  dibayarkanDengan: string;
  status: string;
  notes: string;
  invoiceNumber?: string;
  volumeInfo?: string;
  pengeluaran: number;
  submission: Submission;
}

export const GeneralLedger: React.FC<GeneralLedgerProps> = ({
  submissions = [],
  userProfile,
  onOpenSubmissionForPrint,
  onEditSubmissionNote,
  onClose
}) => {
  // Filter States
  const [selectedJenis, setSelectedJenis] = useState<string>('all');
  const [selectedSubJenis, setSelectedSubJenis] = useState<string>('all');
  const [periodPreset, setPeriodPreset] = useState<'all' | 'this_month' | 'last_month' | 'this_year' | 'custom'>('this_month');
  
  // Custom Date Range
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  
  const [startDate, setStartDate] = useState<string>(() => {
    return `${currentYear}-${currentMonth}-01`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const lastDay = new Date(currentYear, now.getMonth() + 1, 0).getDate();
    return `${currentYear}-${currentMonth}-${String(lastDay).padStart(2, '0')}`;
  });

  const [paymentFilter, setPaymentFilter] = useState<'all' | 'Tunai' | 'Cek/Transfer'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Lunas' | 'Belum Lunas'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // Kronologis asc default akuntansi

  // Note Quick Edit Modal State
  const [activeNoteSub, setActiveNoteSub] = useState<Submission | null>(null);

  // 1. Compile Unique List of Jenis Pengajuan
  const uniqueJenisList = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => {
      if (s.jenisPengajuan && s.jenisPengajuan.trim()) {
        set.add(s.jenisPengajuan.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [submissions]);

  // 2. Extract All Sub-Jenis (Item descriptions) per Jenis Pengajuan
  const subJenisStats = useMemo(() => {
    const map = new Map<string, { count: number; total: number; parentJenis: Set<string> }>();

    submissions.forEach(sub => {
      if (!sub.items || sub.items.length === 0) {
        // Fallback jika tidak ada item spesifik
        const name = sub.jenisPengajuan || 'Non-Kategori';
        const curr = map.get(name) || { count: 0, total: 0, parentJenis: new Set() };
        curr.count += 1;
        curr.total += sub.invoiceAmount || 0;
        curr.parentJenis.add(sub.jenisPengajuan || 'Non-Kategori');
        map.set(name, curr);
        return;
      }

      sub.items.forEach(it => {
        const rawName = (it.item || '').trim();
        const subName = rawName ? toTitleCase(rawName) : 'Uraian Biaya Umum';
        const curr = map.get(subName) || { count: 0, total: 0, parentJenis: new Set() };
        curr.count += 1;
        curr.total += Number(it.total) || 0;
        curr.parentJenis.add(sub.jenisPengajuan || 'Non-Kategori');
        map.set(subName, curr);
      });
    });

    return map;
  }, [submissions]);

  // Available Sub-Jenis filtered by selectedJenis
  const availableSubJenisList = useMemo(() => {
    const list: { name: string; count: number; total: number }[] = [];
    subJenisStats.forEach((val, key) => {
      if (selectedJenis === 'all' || val.parentJenis.has(selectedJenis)) {
        list.push({
          name: key,
          count: val.count,
          total: val.total
        });
      }
    });
    return list.sort((a, b) => b.total - a.total); // Sort by highest total expense
  }, [subJenisStats, selectedJenis]);

  // Handle Preset Period Change
  const handlePeriodChange = (preset: 'all' | 'this_month' | 'last_month' | 'this_year' | 'custom') => {
    setPeriodPreset(preset);
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth(); // 0-11

    if (preset === 'this_month') {
      const mStr = String(m + 1).padStart(2, '0');
      const lastDay = new Date(y, m + 1, 0).getDate();
      setStartDate(`${y}-${mStr}-01`);
      setEndDate(`${y}-${mStr}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'last_month') {
      const prevDate = new Date(y, m - 1, 1);
      const prevY = prevDate.getFullYear();
      const prevMStr = String(prevDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(prevY, prevDate.getMonth() + 1, 0).getDate();
      setStartDate(`${prevY}-${prevMStr}-01`);
      setEndDate(`${prevY}-${prevMStr}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'this_year') {
      setStartDate(`${y}-01-01`);
      setEndDate(`${y}-12-31`);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // 3. Build Detailed Ledger Rows (Flattening Submissions & Items)
  const allLedgerRows = useMemo(() => {
    const rows: LedgerRow[] = [];

    submissions.forEach(sub => {
      const txDate = sub.tanggal || '';
      
      // Period filter check
      if (periodPreset !== 'all') {
        if (startDate && txDate < startDate) return;
        if (endDate && txDate > endDate) return;
      }

      // Jenis filter check
      if (selectedJenis !== 'all' && sub.jenisPengajuan !== selectedJenis) {
        return;
      }

      // Payment method filter
      if (paymentFilter !== 'all' && sub.dibayarkanDengan !== paymentFilter) {
        return;
      }

      // Status filter
      if (statusFilter !== 'all' && (sub.status || 'Belum Lunas') !== statusFilter) {
        return;
      }

      const hasItems = sub.items && sub.items.length > 0;

      if (!hasItems) {
        // Single row if no sub-items
        const subJenisName = sub.jenisPengajuan || 'Umum';
        
        // SubJenis filter check
        if (selectedSubJenis !== 'all' && subJenisName.toLowerCase() !== selectedSubJenis.toLowerCase()) {
          return;
        }

        const totalVal = sub.invoiceAmount || 0;
        rows.push({
          uniqueId: `${sub.id}_main`,
          submissionId: sub.id,
          tanggal: txDate,
          kode: sub.kode || 'HO',
          jenisPengajuan: sub.jenisPengajuan || 'Non-Kategori',
          subJenis: subJenisName,
          uraian: sub.notes || `Transaksi ${sub.jenisPengajuan}`,
          dibayarkanKepada: sub.dibayarkanKepada || '-',
          dibayarkanDengan: sub.dibayarkanDengan || 'Tunai',
          status: sub.status || 'Belum Lunas',
          notes: sub.notes || '',
          invoiceNumber: sub.invoiceNumber,
          volumeInfo: undefined,
          pengeluaran: totalVal,
          submission: sub
        });
      } else {
        // Explode into rows per sub-item so user can see each sub-item clearly in the ledger!
        sub.items.forEach((item, itemIdx) => {
          const rawItemName = (item.item || '').trim();
          const cleanSubJenis = rawItemName ? toTitleCase(rawItemName) : (sub.jenisPengajuan || 'Umum');

          // SubJenis filter check
          if (selectedSubJenis !== 'all' && cleanSubJenis.toLowerCase() !== selectedSubJenis.toLowerCase()) {
            return;
          }

          const volStr = (item as any).satuan && item.jumlahVolume 
            ? `${item.jumlahVolume} ${(item as any).satuan}` 
            : (item.jumlahVolume ? String(item.jumlahVolume) : undefined);

          rows.push({
            uniqueId: `${sub.id}_${itemIdx}`,
            submissionId: sub.id,
            tanggal: txDate,
            kode: sub.kode || 'HO',
            jenisPengajuan: sub.jenisPengajuan || 'Non-Kategori',
            subJenis: cleanSubJenis,
            uraian: item.keterangan || item.item || sub.notes || '-',
            dibayarkanKepada: sub.dibayarkanKepada || '-',
            dibayarkanDengan: sub.dibayarkanDengan || 'Tunai',
            status: sub.status || 'Belum Lunas',
            notes: sub.notes || '',
            invoiceNumber: sub.invoiceNumber,
            volumeInfo: volStr,
            pengeluaran: Number(item.total) || 0,
            submission: sub
          });
        });
      }
    });

    // Sort kronologis berdasarkan tanggal
    rows.sort((a, b) => {
      if (a.tanggal !== b.tanggal) {
        return sortOrder === 'asc' 
          ? a.tanggal.localeCompare(b.tanggal) 
          : b.tanggal.localeCompare(a.tanggal);
      }
      return sortOrder === 'asc' 
        ? a.kode.localeCompare(b.kode) 
        : b.kode.localeCompare(a.kode);
    });

    // Apply Search Query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return rows.filter(r => 
        r.kode.toLowerCase().includes(q) ||
        r.dibayarkanKepada.toLowerCase().includes(q) ||
        r.subJenis.toLowerCase().includes(q) ||
        r.uraian.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q) ||
        (r.invoiceNumber && r.invoiceNumber.toLowerCase().includes(q))
      );
    }

    return rows;
  }, [
    submissions, 
    periodPreset, 
    startDate, 
    endDate, 
    selectedJenis, 
    selectedSubJenis, 
    paymentFilter, 
    statusFilter, 
    searchQuery, 
    sortOrder
  ]);

  // Compute Running Cumulative Balance
  const rowsWithBalance = useMemo(() => {
    let runningBalance = 0;
    return allLedgerRows.map(row => {
      runningBalance += row.pengeluaran;
      return {
        ...row,
        saldoBerjalan: runningBalance
      };
    });
  }, [allLedgerRows]);

  // Summary KPI Calculations
  const totalPengeluaran = useMemo(() => {
    return allLedgerRows.reduce((acc, row) => acc + row.pengeluaran, 0);
  }, [allLedgerRows]);

  const totalTransaksiCount = allLedgerRows.length;
  const avgPengeluaran = totalTransaksiCount > 0 ? totalPengeluaran / totalTransaksiCount : 0;

  // Top Sub-Jenis Breakdown for Visualization
  const topSubJenisBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    allLedgerRows.forEach(r => {
      map.set(r.subJenis, (map.get(r.subJenis) || 0) + r.pengeluaran);
    });
    return Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount, percentage: totalPengeluaran > 0 ? (amount / totalPengeluaran) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [allLedgerRows, totalPengeluaran]);

  // Export to CSV
  const handleExportCsv = () => {
    if (rowsWithBalance.length === 0) {
      alert('Tidak ada data buku besar untuk diekspor.');
      return;
    }

    const headers = [
      'No',
      'Tanggal',
      'No. Voucher / Bukti',
      'Jenis Pengajuan',
      'Sub-Jenis Pengajuan',
      'Uraian / Keterangan',
      'Dibayarkan Kepada',
      'Metode Pembayaran',
      'Status',
      'No. Invoice',
      'Catatan / Note',
      'Pengeluaran (Kredit)',
      'Saldo Kumulatif Berjalan'
    ];

    const csvRows = [
      `"BUKU BESAR SUB-JENIS PENGAJUAN - ${userProfile?.companyName || 'PT. NUSANTARA MINERAL SUKSES ABADI'}"`,
      `"Periode: ${startDate || 'Awal'} s/d ${endDate || 'Sekarang'} | Filter Jenis: ${selectedJenis === 'all' ? 'Semua' : selectedJenis} | Sub-Jenis: ${selectedSubJenis === 'all' ? 'Semua' : selectedSubJenis}"`,
      `"Tanggal Cetak: ${new Date().toLocaleString('id-ID')}"`,
      '',
      headers.map(h => `"${h}"`).join(',')
    ];

    rowsWithBalance.forEach((row, idx) => {
      const line = [
        idx + 1,
        row.tanggal,
        row.kode,
        row.jenisPengajuan,
        row.subJenis,
        (row.uraian || '').replace(/"/g, '""'),
        (row.dibayarkanKepada || '').replace(/"/g, '""'),
        row.dibayarkanDengan,
        row.status,
        row.invoiceNumber || '-',
        (row.notes || '').replace(/"/g, '""'),
        row.pengeluaran,
        row.saldoBerjalan
      ];
      csvRows.push(line.map(val => `"${val}"`).join(','));
    });

    csvRows.push('');
    csvRows.push(`"","","","","","","","","","TOTAL PENGELUARAN","","${totalPengeluaran}","${totalPengeluaran}"`);

    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanJenisFile = (selectedJenis === 'all' ? 'SEMUA' : selectedJenis).replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute('download', `Buku_Besar_${cleanJenisFile}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans space-y-6 animate-fade-in">
      
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-xs print:hidden">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-stone-900 text-amber-400 rounded-2xl shadow-xs">
            <BookOpen size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-amber-800 font-bold bg-amber-100 px-2.5 py-0.5 rounded-full">
                Sistem Akuntansi &amp; Buku Besar
              </span>
              <span className="text-xs text-stone-400 font-mono">General Ledger Sub-Account</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight mt-0.5">
              Buku Besar Sub-Jenis Pengajuan
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Mutasi rinci, histori saldo berjalan, dan rekapitulasi per jenis dan sub-kategori transaksi HO.
            </p>
          </div>
        </div>

        {/* Action Buttons: Cetak & Export */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-250 text-stone-700 text-xs font-bold transition cursor-pointer shadow-3xs active:scale-95"
            title="Cetak format akuntansi resmi"
          >
            <Printer size={15} className="text-stone-600" />
            <span>Cetak Buku Besar</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition cursor-pointer shadow-3xs active:scale-95"
            title="Download file CSV untuk Microsoft Excel & Google Sheets"
          >
            <Download size={15} />
            <span>Ekspor ke Excel (CSV)</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 transition cursor-pointer"
              title="Tutup Buku Besar"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* FILTER CONTROL PANEL */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-4 print:hidden">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-black text-stone-900 uppercase tracking-wide">
            <Filter size={14} className="text-amber-600" />
            <span>Filter Kategori, Sub-Jenis &amp; Periode Transaksi</span>
          </div>
          <button
            onClick={() => {
              setSelectedJenis('all');
              setSelectedSubJenis('all');
              handlePeriodChange('this_month');
              setPaymentFilter('all');
              setStatusFilter('all');
              setSearchQuery('');
            }}
            className="text-[11px] font-bold text-amber-700 hover:text-amber-800 transition flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw size={11} />
            <span>Reset Filter</span>
          </button>
        </div>

        {/* Row 1: Selection Dropdowns (Jenis & Sub-Jenis Pengajuan) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* 1. Jenis Pengajuan Utama */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
              1. Pilih Jenis Pengajuan Utama:
            </label>
            <div className="relative">
              <select
                value={selectedJenis}
                onChange={(e) => {
                  setSelectedJenis(e.target.value);
                  setSelectedSubJenis('all'); // Reset sub-jenis when main jenis changes
                }}
                className="w-full px-3.5 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans font-bold text-stone-800"
              >
                <option value="all">📁 Semua Jenis Pengajuan ({uniqueJenisList.length} Kategori)</option>
                {uniqueJenisList.map(j => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Sub-Jenis Pengajuan (Rincian Item Spesifik) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center justify-between">
              <span>2. Pilih Sub-Jenis Pengajuan (Uraian Item):</span>
              <span className="text-[10px] text-amber-700 font-mono font-normal">
                {availableSubJenisList.length} sub-kategori tersedia
              </span>
            </label>
            <div className="relative">
              <select
                value={selectedSubJenis}
                onChange={(e) => setSelectedSubJenis(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans font-bold text-stone-800"
              >
                <option value="all">📑 Semua Sub-Jenis (Tampilkan Seluruh Uraian)</option>
                {availableSubJenisList.map(sub => (
                  <option key={sub.name} value={sub.name}>
                    {sub.name} ({sub.count}x transaksi - Rp {formatRupiah(sub.total)})
                  </option>
                ))}
              </select>
            </div>
          </div>

        </div>

        {/* Row 2: Periode, Status, Metode, Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2 border-t border-stone-100">
          
          {/* Preset Periode */}
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">
              Periode Waktu
            </label>
            <select
              value={periodPreset}
              onChange={(e) => handlePeriodChange(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:bg-white font-medium"
            >
              <option value="this_month">Bulan Ini ({now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })})</option>
              <option value="last_month">Bulan Lalu</option>
              <option value="this_year">Tahun Berjalan ({currentYear})</option>
              <option value="all">Semua Waktu</option>
              <option value="custom">Rentang Tanggal Khusus</option>
            </select>
          </div>

          {/* Metode Pembayaran */}
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">
              Metode Pembayaran
            </label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:bg-white font-medium"
            >
              <option value="all">Semua Kas / Bank</option>
              <option value="Tunai">Kas Tunai</option>
              <option value="Cek/Transfer">Bank (Cek / Transfer)</option>
            </select>
          </div>

          {/* Status Pembayaran */}
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">
              Status Voucher
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:bg-white font-medium"
            >
              <option value="all">Semua Status</option>
              <option value="Lunas">Lunas (Terbayar)</option>
              <option value="Belum Lunas">Belum Lunas (Outstanding)</option>
            </select>
          </div>

          {/* Cari Cepat */}
          <div>
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">
              Cari Cepat
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="No voucher, penerima, inv..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:bg-white font-medium"
              />
              <Search size={13} className="absolute left-2.5 top-2.5 text-stone-400" />
            </div>
          </div>

        </div>

        {/* Custom Date Range Picker (shown when custom is selected) */}
        {periodPreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-amber-50/50 border border-amber-250 rounded-xl animate-fade-in">
            <span className="text-xs font-bold text-amber-900">Rentang Tanggal:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg font-mono"
              />
              <span className="text-xs text-stone-400">s/d</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-lg font-mono"
              />
            </div>
          </div>
        )}

      </div>

      {/* KPI METRIC CARDS & BREAKDOWN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        
        {/* Card 1: Total Pengeluaran Sub-Jenis Terpilih */}
        <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase tracking-wider">
            <span>Total Pengeluaran (Kredit)</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <TrendingDown size={16} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-rose-700 font-mono tracking-tight">
              Rp {formatRupiah(totalPengeluaran)}
            </div>
            <p className="text-[11px] text-stone-400 font-mono mt-0.5">
              {selectedSubJenis !== 'all' ? `Sub: ${selectedSubJenis}` : (selectedJenis !== 'all' ? `Jenis: ${selectedJenis}` : 'Semua Sub-Jenis')}
            </p>
          </div>
        </div>

        {/* Card 2: Jumlah Mutasi / Transaksi */}
        <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase tracking-wider">
            <span>Jumlah Mutasi Transaksi</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Layers size={16} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-stone-900 font-mono tracking-tight">
              {totalTransaksiCount} <span className="text-sm font-normal text-stone-500">baris mutasi</span>
            </div>
            <p className="text-[11px] text-stone-400 font-mono mt-0.5">
              Urutan: {sortOrder === 'asc' ? 'Kronologis (Terlama → Terbaru)' : 'Terbaru → Terlama'}
            </p>
          </div>
        </div>

        {/* Card 3: Rata-rata Pengeluaran */}
        <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-xs font-bold uppercase tracking-wider">
            <span>Rata-Rata per Baris Mutasi</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Wallet size={16} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-black text-stone-900 font-mono tracking-tight">
              Rp {formatRupiah(Math.round(avgPengeluaran))}
            </div>
            <p className="text-[11px] text-stone-400 font-mono mt-0.5">
              Rata-rata nominal per sub-uraian
            </p>
          </div>
        </div>

        {/* Card 4: Top Sub-Jenis Pengeluaran (Visual Bar) */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-500 text-[11px] font-bold uppercase tracking-wider mb-2">
            <span>Top 3 Sub-Jenis Terbesar</span>
            <Tag size={14} className="text-stone-400" />
          </div>
          <div className="space-y-1.5">
            {topSubJenisBreakdown.slice(0, 3).map((top, idx) => (
              <div key={top.name} className="text-[10.5px]">
                <div className="flex items-center justify-between text-stone-700 font-medium truncate">
                  <span className="truncate pr-1">{idx + 1}. {top.name}</span>
                  <span className="font-mono font-bold shrink-0">{top.percentage.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-1.5 mt-0.5 overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${top.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {topSubJenisBreakdown.length === 0 && (
              <p className="text-xs text-stone-400 italic">Tidak ada data untuk periode ini.</p>
            )}
          </div>
        </div>

      </div>

      {/* PRINT HEADER - Hanya tampil saat mencetak */}
      <div className="hidden print:block text-center border-b-2 border-stone-900 pb-4 mb-6">
        <h2 className="text-lg font-black uppercase tracking-wider text-stone-900">
          {userProfile?.companyName || 'PT. NUSANTARA MINERAL SUKSES ABADI'}
        </h2>
        <p className="text-xs text-stone-600 font-mono">
          HEAD OFFICE - LAPORAN BUKU BESAR SUB-JENIS PENGAJUAN (GENERAL LEDGER)
        </p>
        <div className="text-xs font-mono text-stone-500 mt-1 flex justify-center gap-4">
          <span>Kategori: {selectedJenis === 'all' ? 'Semua Kategori' : selectedJenis}</span>
          <span>•</span>
          <span>Sub-Jenis: {selectedSubJenis === 'all' ? 'Semua Sub-Jenis' : selectedSubJenis}</span>
          <span>•</span>
          <span>Periode: {startDate || '-'} s/d {endDate || '-'}</span>
        </div>
      </div>

      {/* LEDGER DATA TABLE */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
        
        {/* Table Toolbar */}
        <div className="px-5 py-3.5 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-stone-800">Daftar Mutasi Buku Besar</span>
            <span className="px-2 py-0.5 bg-stone-200 text-stone-700 rounded-full font-mono text-[10px] font-bold">
              {rowsWithBalance.length} Baris
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900 font-bold transition cursor-pointer"
            >
              <ArrowUpDown size={13} />
              <span>Urutan: {sortOrder === 'asc' ? 'Kronologis (Asc)' : 'Terbaru (Desc)'}</span>
            </button>
          </div>
        </div>

        {/* The Accounting Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-700 border-collapse">
            <thead className="bg-stone-900 text-stone-200 font-mono text-[11px] uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="py-3 px-3 text-center w-10">No</th>
                <th className="py-3 px-3 w-28">Tanggal</th>
                <th className="py-3 px-3 w-36">No. Voucher</th>
                <th className="py-3 px-3 w-40">Jenis Pengajuan</th>
                <th className="py-3 px-3 w-48">Sub-Jenis (Akun)</th>
                <th className="py-3 px-4 min-w-[200px]">Uraian / Keterangan</th>
                <th className="py-3 px-3 w-44">Dibayarkan Kepada</th>
                <th className="py-3 px-3 w-24 text-center">Metode</th>
                <th className="py-3 px-3 w-32">Catatan / Note</th>
                <th className="py-3 px-3 w-36 text-right">Pengeluaran (Kredit)</th>
                <th className="py-3 px-4 w-36 text-right bg-stone-950 text-amber-400 font-black">Saldo Kumulatif</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150 font-sans">
              {rowsWithBalance.map((row, idx) => (
                <tr 
                  key={row.uniqueId} 
                  className={`hover:bg-amber-50/40 transition ${idx % 2 === 1 ? 'bg-stone-50/50' : 'bg-white'}`}
                >
                  {/* 1. No */}
                  <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[11px]">
                    {idx + 1}
                  </td>

                  {/* 2. Tanggal */}
                  <td className="py-2.5 px-3 font-mono text-[11px] text-stone-700 whitespace-nowrap">
                    {formatDateIndonesian(row.tanggal)}
                  </td>

                  {/* 3. No Voucher */}
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <button
                      onClick={() => onOpenSubmissionForPrint && onOpenSubmissionForPrint(row.submission)}
                      className="font-mono font-bold text-amber-800 hover:text-amber-950 underline flex items-center gap-1 cursor-pointer"
                      title="Klik untuk cetak / lihat rincian voucher"
                    >
                      <span>{row.kode}</span>
                      <ExternalLink size={10} className="text-stone-400 print:hidden" />
                    </button>
                    {row.invoiceNumber && (
                      <span className="block text-[10px] font-mono text-stone-500">
                        Inv: {row.invoiceNumber}
                      </span>
                    )}
                  </td>

                  {/* 4. Jenis Pengajuan */}
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-100 text-stone-800 border border-stone-200/80 inline-block whitespace-nowrap">
                      {row.jenisPengajuan}
                    </span>
                  </td>

                  {/* 5. Sub-Jenis Pengajuan */}
                  <td className="py-2.5 px-3 font-bold text-stone-900">
                    <span className="text-xs text-amber-900">
                      {row.subJenis}
                    </span>
                    {row.volumeInfo && (
                      <span className="block text-[10px] text-stone-400 font-mono font-normal">
                        Vol: {row.volumeInfo}
                      </span>
                    )}
                  </td>

                  {/* 6. Uraian Keterangan */}
                  <td className="py-2.5 px-4 text-xs text-stone-750 leading-relaxed">
                    {row.uraian}
                  </td>

                  {/* 7. Dibayarkan Kepada */}
                  <td className="py-2.5 px-3 font-medium text-stone-850">
                    {row.dibayarkanKepada}
                  </td>

                  {/* 8. Metode Pembayaran */}
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      row.dibayarkanDengan === 'Tunai' 
                        ? 'bg-amber-100 text-amber-900' 
                        : 'bg-emerald-100 text-emerald-900'
                    }`}>
                      {row.dibayarkanDengan}
                    </span>
                  </td>

                  {/* 9. Catatan / Note Transaksi */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] text-stone-600 truncate max-w-[130px]" title={row.notes}>
                        {row.notes || <span className="text-stone-300 italic">-</span>}
                      </span>
                      {onEditSubmissionNote && (
                        <button
                          type="button"
                          onClick={() => onEditSubmissionNote(row.submission)}
                          className="p-1 rounded-md text-stone-400 hover:text-amber-600 hover:bg-amber-50 transition print:hidden cursor-pointer shrink-0"
                          title="Edit Catatan Transaksi"
                        >
                          <Edit3 size={12} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* 10. Pengeluaran (Kredit) */}
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                    Rp {formatRupiah(row.pengeluaran)}
                  </td>

                  {/* 11. Saldo Akumulasi Berjalan */}
                  <td className="py-2.5 px-4 text-right font-mono font-black text-stone-900 bg-amber-500/10 whitespace-nowrap">
                    Rp {formatRupiah(row.saldoBerjalan)}
                  </td>
                </tr>
              ))}

              {/* Empty State */}
              {rowsWithBalance.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-stone-400 space-y-2">
                    <BookOpen size={36} className="mx-auto text-stone-300" />
                    <p className="text-sm font-bold text-stone-600">Tidak ada data buku besar yang sesuai kriteria filter.</p>
                    <p className="text-xs text-stone-400">Silakan sesuaikan jenis pengajuan, sub-jenis, atau tanggal di panel filter.</p>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Total Footer */}
            {rowsWithBalance.length > 0 && (
              <tfoot className="bg-stone-900 text-white font-mono font-black border-t-2 border-amber-500">
                <tr>
                  <td colSpan={9} className="py-3.5 px-4 text-right uppercase tracking-wider text-amber-400 text-xs">
                    TOTAL PENGELUARAN BUKU BESAR :
                  </td>
                  <td className="py-3.5 px-3 text-right text-rose-300 text-xs whitespace-nowrap">
                    Rp {formatRupiah(totalPengeluaran)}
                  </td>
                  <td className="py-3.5 px-4 text-right bg-black text-amber-400 text-xs whitespace-nowrap">
                    Rp {formatRupiah(totalPengeluaran)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

      </div>

      {/* PRINT SIGNATURE FOOTER - Format Resmi Akuntansi HO */}
      <div className="hidden print:grid grid-cols-3 gap-8 pt-10 text-center font-sans">
        <div className="space-y-16">
          <p className="text-xs font-bold uppercase text-stone-600">Dibuat Oleh (Accounting)</p>
          <div>
            <p className="text-xs font-black underline">Sri Ekowati</p>
            <p className="text-[10px] text-stone-500 font-mono">Accounting Staff</p>
          </div>
        </div>

        <div className="space-y-16">
          <p className="text-xs font-bold uppercase text-stone-600">Diperiksa Oleh (Finance)</p>
          <div>
            <p className="text-xs font-black underline">Andi Dhiya Salsabila</p>
            <p className="text-[10px] text-stone-500 font-mono">Finance Supervisor</p>
          </div>
        </div>

        <div className="space-y-16">
          <p className="text-xs font-bold uppercase text-stone-600">Disetujui Oleh (Direksi)</p>
          <div>
            <p className="text-xs font-black underline">Harijon</p>
            <p className="text-[10px] text-stone-500 font-mono">Direktur Keuangan</p>
          </div>
        </div>
      </div>

    </div>
  );
};

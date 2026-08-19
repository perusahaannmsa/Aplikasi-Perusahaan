import React, { useState, useMemo } from 'react';
import { NpwpRecord, Submission } from '../types';
import { 
  Building2, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  FileText, 
  ExternalLink, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  X, 
  Receipt, 
  CreditCard, 
  Tag, 
  Filter,
  Eye,
  ShieldCheck,
  Building
} from 'lucide-react';

interface NpwpManagerProps {
  npwpRecords: NpwpRecord[];
  onSaveNpwpRecords: (records: NpwpRecord[]) => void;
  submissions: Submission[];
  onSelectSubmissionForPrint?: (sub: Submission) => void;
  onBack?: () => void;
}

export const NpwpManager: React.FC<NpwpManagerProps> = ({
  npwpRecords,
  onSaveNpwpRecords,
  submissions,
  onSelectSubmissionForPrint,
  onBack
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaxFilter, setSelectedTaxFilter] = useState<'ALL' | 'PKP' | 'Non-PKP'>('ALL');
  
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<NpwpRecord | null>(null);
  
  // Form input states
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formNpwpNumber, setFormNpwpNumber] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formKppName, setFormKppName] = useState('');
  const [formTaxStatus, setFormTaxStatus] = useState<'PKP' | 'Non-PKP'>('PKP');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Selected company to view invoices modal
  const [selectedCompanyForInvoices, setSelectedCompanyForInvoices] = useState<NpwpRecord | null>(null);

  // Auto NPWP Formatter (e.g., 01.234.567.8-901.000)
  const formatNpwp = (val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length <= 15) {
      // 00.000.000.0-000.000
      let formatted = cleaned;
      if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
      if (cleaned.length > 5) formatted = formatted.slice(0, 6) + '.' + cleaned.slice(5);
      if (cleaned.length > 8) formatted = formatted.slice(0, 10) + '.' + cleaned.slice(8);
      if (cleaned.length > 9) formatted = formatted.slice(0, 12) + '-' + cleaned.slice(9);
      if (cleaned.length > 12) formatted = formatted.slice(0, 16) + '.' + cleaned.slice(12);
      return formatted;
    }
    return val;
  };

  const handleOpenAddModal = () => {
    setEditingRecord(null);
    setFormCompanyName('');
    setFormNpwpNumber('');
    setFormAddress('');
    setFormKppName('');
    setFormTaxStatus('PKP');
    setFormContactPerson('');
    setFormNotes('');
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (rec: NpwpRecord) => {
    setEditingRecord(rec);
    setFormCompanyName(rec.companyName);
    setFormNpwpNumber(rec.npwpNumber);
    setFormAddress(rec.address || '');
    setFormKppName(rec.kppName || '');
    setFormTaxStatus(rec.taxStatus || 'PKP');
    setFormContactPerson(rec.contactPerson || '');
    setFormNotes(rec.notes || '');
    setIsFormModalOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCompanyName.trim()) {
      alert('Nama Perusahaan / Wajib Pajak wajib diisi!');
      return;
    }
    if (!formNpwpNumber.trim()) {
      alert('Nomor NPWP wajib diisi!');
      return;
    }

    if (editingRecord) {
      const updated = npwpRecords.map(r => r.id === editingRecord.id ? {
        ...r,
        companyName: formCompanyName.trim(),
        npwpNumber: formNpwpNumber.trim(),
        address: formAddress.trim(),
        kppName: formKppName.trim(),
        taxStatus: formTaxStatus,
        contactPerson: formContactPerson.trim(),
        notes: formNotes.trim()
      } : r);
      onSaveNpwpRecords(updated);
    } else {
      const newRec: NpwpRecord = {
        id: 'npwp_' + Date.now(),
        companyName: formCompanyName.trim(),
        npwpNumber: formNpwpNumber.trim(),
        address: formAddress.trim(),
        kppName: formKppName.trim(),
        taxStatus: formTaxStatus,
        contactPerson: formContactPerson.trim(),
        notes: formNotes.trim(),
        createdAt: new Date().toISOString()
      };
      onSaveNpwpRecords([newRec, ...npwpRecords]);
    }

    setIsFormModalOpen(false);
  };

  const handleDeleteRecord = (id: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus data NPWP untuk "${name}"?`)) {
      const remaining = npwpRecords.filter(r => r.id !== id);
      onSaveNpwpRecords(remaining);
    }
  };

  // Auto-extract vendors from submissions that are missing in npwpRecords
  const unrecordedVendors = useMemo(() => {
    const recordedNames = new Set(npwpRecords.map(r => r.companyName.trim().toLowerCase()));
    const vendorMap = new Map<string, { name: string; count: number; totalAmount: number }>();

    submissions.forEach(sub => {
      const vendorName = (sub.dibayarkanKepada || '').trim();
      if (vendorName && vendorName.length > 2 && !recordedNames.has(vendorName.toLowerCase())) {
        const total = sub.items ? sub.items.reduce((acc, it) => acc + (it.total || 0), 0) : 0;
        const existing = vendorMap.get(vendorName.toLowerCase());
        if (existing) {
          existing.count += 1;
          existing.totalAmount += total;
        } else {
          vendorMap.set(vendorName.toLowerCase(), { name: vendorName, count: 1, totalAmount: total });
        }
      }
    });

    return Array.from(vendorMap.values());
  }, [npwpRecords, submissions]);

  const handleQuickAddVendor = (vendorName: string) => {
    setEditingRecord(null);
    setFormCompanyName(vendorName);
    setFormNpwpNumber('');
    setFormAddress('');
    setFormKppName('');
    setFormTaxStatus('PKP');
    setFormContactPerson('');
    setFormNotes('Auto-imported dari histori Voucher / Invoice');
    setIsFormModalOpen(true);
  };

  // Get linked invoices for a given company name
  const getLinkedSubmissionsForCompany = (companyName: string) => {
    const lower = companyName.toLowerCase();
    return submissions.filter(sub => {
      const matchVendor = (sub.dibayarkanKepada || '').toLowerCase().includes(lower);
      const matchItem = sub.items && sub.items.some(it => (it.item || '').toLowerCase().includes(lower));
      const matchNotes = (sub.notes || '').toLowerCase().includes(lower);
      return matchVendor || matchItem || matchNotes;
    });
  };

  // Filtered NPWP records
  const filteredNpwpRecords = useMemo(() => {
    return npwpRecords.filter(rec => {
      const query = searchQuery.toLowerCase();
      const matchSearch = rec.companyName.toLowerCase().includes(query) ||
                          rec.npwpNumber.toLowerCase().includes(query) ||
                          (rec.address || '').toLowerCase().includes(query) ||
                          (rec.kppName || '').toLowerCase().includes(query);
      
      const matchTax = selectedTaxFilter === 'ALL' || rec.taxStatus === selectedTaxFilter;

      return matchSearch && matchTax;
    });
  }, [npwpRecords, searchQuery, selectedTaxFilter]);

  // Overall statistics
  const totalPkp = npwpRecords.filter(r => r.taxStatus === 'PKP').length;
  const totalInvoicesLinked = useMemo(() => {
    let count = 0;
    npwpRecords.forEach(r => {
      count += getLinkedSubmissionsForCompany(r.companyName).length;
    });
    return count;
  }, [npwpRecords, submissions]);

  // Export to CSV
  const handleExportCsv = () => {
    if (npwpRecords.length === 0) {
      alert('Tidak ada data NPWP untuk diekspor!');
      return;
    }

    const headers = ['Nama Perusahaan / Wajib Pajak', 'Nomor NPWP', 'Status Pajak', 'Alamat Terdaftar', 'KPP', 'Kontak Finance', 'Jumlah Invoice Terkait', 'Total Nominal Invoice'];
    const rows = npwpRecords.map(r => {
      const linked = getLinkedSubmissionsForCompany(r.companyName);
      const totalVal = linked.reduce((acc, sub) => acc + (sub.items ? sub.items.reduce((sum, i) => sum + (i.total || 0), 0) : 0), 0);
      return [
        `"${r.companyName.replace(/"/g, '""')}"`,
        `"${r.npwpNumber}"`,
        `"${r.taxStatus || 'PKP'}"`,
        `"${(r.address || '-').replace(/"/g, '""')}"`,
        `"${(r.kppName || '-').replace(/"/g, '""')}"`,
        `"${(r.contactPerson || '-').replace(/"/g, '""')}"`,
        linked.length,
        totalVal
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Master_List_NPWP_Perusahaan_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-stone-900 to-indigo-950 rounded-2xl p-6 text-white shadow-lg border border-stone-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold tracking-wider uppercase">
              Modul Perpajakan & Vendor HO
            </span>
            <span className="text-stone-400 text-xs font-mono">Real-Time Sync</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-sans tracking-tight flex items-center gap-2">
            <Receipt className="text-emerald-400 shrink-0" size={26} />
            Master List Data NPWP & Invoice Vendor
          </h2>
          <p className="text-xs text-stone-300 max-w-2xl">
            Kelola data NPWP perusahaan, supplier, dan vendor rekanan untuk verifikasi Faktur Pajak, pemotongan PPh/PPN, dan pelacakan riwayat invoice per perusahaan.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
          >
            <Download size={14} />
            <span>Ekspor CSV/Excel</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Plus size={16} />
            <span>Tambah NPWP Baru</span>
          </button>
        </div>
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs space-y-1">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider">Total NPWP Terdaftar</span>
            <Building2 size={18} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-stone-900 font-mono">
            {npwpRecords.length} <span className="text-xs font-sans text-stone-500 font-normal">Perusahaan</span>
          </div>
          <p className="text-[10px] text-stone-500">
            {totalPkp} Berstatus PKP, {npwpRecords.length - totalPkp} Non-PKP
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs space-y-1">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider">Pengusaha Kena Pajak (PKP)</span>
            <ShieldCheck size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {totalPkp} <span className="text-xs font-sans text-stone-500 font-normal">Vendor PKP</span>
          </div>
          <p className="text-[10px] text-stone-500">
            Memiliki kewajiban Faktur Pajak PPN
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs space-y-1">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider">Invoice Terkait</span>
            <FileText size={18} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono">
            {totalInvoicesLinked} <span className="text-xs font-sans text-stone-500 font-normal">Voucher/Invoice</span>
          </div>
          <p className="text-[10px] text-stone-500">
            Terhubung dari histori transaksi Voucher HO
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs space-y-1">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider">Vendor Belum Dicatat</span>
            <Sparkles size={18} className="text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-700 font-mono">
            {unrecordedVendors.length} <span className="text-xs font-sans text-stone-500 font-normal">Terdeteksi</span>
          </div>
          <p className="text-[10px] text-stone-500">
            Nama vendor pada voucher yang belum ber-NPWP
          </p>
        </div>
      </div>

      {/* Unrecorded Vendors Suggestions (If any) */}
      {unrecordedVendors.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="text-amber-600 shrink-0" size={16} />
              <span className="text-xs font-bold text-amber-900">
                Sistem Menemukan {unrecordedVendors.length} Vendor dari Histori Voucher yang Belum Dicatat NPWP-nya:
              </span>
            </div>
            <span className="text-[10px] text-amber-700 font-mono">Klik untuk tambah cepat</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {unrecordedVendors.slice(0, 6).map((v) => (
              <button
                key={v.name}
                onClick={() => handleQuickAddVendor(v.name)}
                className="px-3 py-1.5 bg-white border border-amber-300 hover:border-amber-500 rounded-xl text-xs font-medium text-stone-800 hover:text-amber-900 transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
              >
                <Building size={12} className="text-amber-600" />
                <span className="font-bold">{v.name}</span>
                <span className="text-[10px] font-mono text-stone-500">({v.count} invoice)</span>
                <Plus size={12} className="text-amber-600 ml-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
          <input
            type="text"
            placeholder="Cari berdasarkan nama perusahaan, nomor NPWP, KPP, atau alamat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Filter size={14} className="text-stone-400" />
          <span className="text-xs font-bold text-stone-600">Status Pajak:</span>
          <select
            value={selectedTaxFilter}
            onChange={(e) => setSelectedTaxFilter(e.target.value as any)}
            className="bg-stone-50 border border-stone-250 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Status (PKP & Non-PKP)</option>
            <option value="PKP">Hanya PKP (Pengusaha Kena Pajak)</option>
            <option value="Non-PKP">Hanya Non-PKP</option>
          </select>
        </div>
      </div>

      {/* NPWP List Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-3xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-100/90 border-b border-stone-200 text-[11px] font-mono font-bold text-stone-700 uppercase tracking-wider">
                <th className="py-3.5 px-4 min-w-[200px]">Nama Perusahaan / Wajib Pajak</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[190px]">Nomor NPWP</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[140px]">Status Pajak</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">KPP Terdaftar</th>
                <th className="py-3.5 px-4 min-w-[200px]">Alamat & Kontak</th>
                <th className="py-3.5 px-4 text-center whitespace-nowrap min-w-[160px]">Invoice Terkait</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap min-w-[100px]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150 text-xs text-stone-800">
              {filteredNpwpRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-stone-400 space-y-2">
                    <Building2 size={36} className="mx-auto text-stone-300" />
                    <p className="font-bold">Belum ada data NPWP yang ditemukan.</p>
                    <p className="text-[11px] font-mono">Klik "Tambah NPWP Baru" untuk mencatat data pajak perusahaan/vendor baru.</p>
                  </td>
                </tr>
              ) : (
                filteredNpwpRecords.map((rec) => {
                  const linkedSubs = getLinkedSubmissionsForCompany(rec.companyName);
                  const totalLinkedValue = linkedSubs.reduce((acc, sub) => acc + (sub.items ? sub.items.reduce((sum, i) => sum + (i.total || 0), 0) : 0), 0);

                  return (
                    <tr key={rec.id} className="hover:bg-stone-50/80 transition">
                      
                      {/* Company Name */}
                      <td className="py-3.5 px-4 font-bold text-stone-900">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-indigo-600 shrink-0" />
                          <div>
                            <span className="block">{rec.companyName}</span>
                            {rec.notes && <span className="text-[10px] text-stone-400 font-normal block truncate max-w-xs">{rec.notes}</span>}
                          </div>
                        </div>
                      </td>

                      {/* NPWP Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-stone-800 whitespace-nowrap">
                        <span className="inline-flex items-center px-3 py-1 rounded-lg bg-stone-900 border border-stone-800 text-amber-300 font-mono font-bold text-xs tracking-wide whitespace-nowrap shadow-3xs">
                          {formatNpwp(rec.npwpNumber)}
                        </span>
                      </td>

                      {/* Tax Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {rec.taxStatus === 'PKP' ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap">
                            <ShieldCheck size={12} className="shrink-0" />
                            <span>PKP (Faktur Pajak)</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200 text-[10px] font-bold inline-flex items-center whitespace-nowrap">
                            Non-PKP
                          </span>
                        )}
                      </td>

                      {/* KPP */}
                      <td className="py-3.5 px-4 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                        {rec.kppName || '-'}
                      </td>

                      {/* Address & Contact */}
                      <td className="py-3.5 px-4 text-stone-600 text-[11px] max-w-xs">
                        <div className="truncate">{rec.address || '-'}</div>
                        {rec.contactPerson && (
                          <div className="text-[10px] text-indigo-600 font-mono">PIC: {rec.contactPerson}</div>
                        )}
                      </td>

                      {/* Linked Invoices Count */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedCompanyForInvoices(rec)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 mx-auto cursor-pointer border ${
                            linkedSubs.length > 0 
                              ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100' 
                              : 'bg-stone-50 text-stone-400 border-stone-200 hover:bg-stone-100'
                          }`}
                          title="Klik untuk melihat daftar voucher & invoice perusahaan ini"
                        >
                          <FileText size={13} />
                          <span>{linkedSubs.length} Invoice</span>
                          {linkedSubs.length > 0 && (
                            <span className="text-[10px] font-mono text-amber-700">
                              (Rp {totalLinkedValue.toLocaleString('id-ID')})
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedCompanyForInvoices(rec)}
                            className="p-1.5 text-stone-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Lihat Invoice Terkait"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(rec)}
                            className="p-1.5 text-stone-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title="Edit Data NPWP"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(rec.id, rec.companyName)}
                            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Hapus Data NPWP"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit NPWP */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-stone-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="text-emerald-400" size={20} />
                <h3 className="font-bold text-sm">
                  {editingRecord ? 'Edit Data NPWP Perusahaan' : 'Tambah Data NPWP Perusahaan / Vendor Baru'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="text-stone-400 hover:text-white transition p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">Nama Perusahaan / Wajib Pajak *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT. Kalimantan Energi Bersama"
                  value={formCompanyName}
                  onChange={(e) => setFormCompanyName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">Nomor NPWP *</label>
                  <input
                    type="text"
                    required
                    placeholder="00.000.000.0-000.000"
                    value={formNpwpNumber}
                    onChange={(e) => setFormNpwpNumber(formatNpwp(e.target.value))}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">Status Pajak</label>
                  <select
                    value={formTaxStatus}
                    onChange={(e) => setFormTaxStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="PKP">PKP (Pengusaha Kena Pajak - Menerbitkan Faktur)</option>
                    <option value="Non-PKP">Non-PKP</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">KPP Terdaftar (Kantor Pelayanan Pajak)</label>
                <input
                  type="text"
                  placeholder="Contoh: KPP Pratama Banjarmasin / KPP Pratama Jakarta Selatan"
                  value={formKppName}
                  onChange={(e) => setFormKppName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">Alamat Terdaftar di NPWP</label>
                <textarea
                  rows={2}
                  placeholder="Alamat lengkap Wajib Pajak..."
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">PIC / Kontak Finance Vendor</label>
                  <input
                    type="text"
                    placeholder="Nama / No HP Finance Vendor"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">Catatan Tambahan</label>
                  <input
                    type="text"
                    placeholder="Catatan pph/ppn atau jenis usaha"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer shadow-md"
                >
                  {editingRecord ? 'Simpan Perubahan' : 'Tambah NPWP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal View Invoices for Selected Company */}
      {selectedCompanyForInvoices && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-stone-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Building2 className="text-amber-400" size={20} />
                  <h3 className="font-bold text-sm">
                    Riwayat Invoice & Voucher: {selectedCompanyForInvoices.companyName}
                  </h3>
                </div>
                <div className="text-[11px] font-mono text-stone-300">
                  NPWP: <span className="text-amber-300 font-bold">{selectedCompanyForInvoices.npwpNumber}</span> ({selectedCompanyForInvoices.taxStatus})
                </div>
              </div>
              <button
                onClick={() => setSelectedCompanyForInvoices(null)}
                className="text-stone-400 hover:text-white transition p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {(() => {
                const linkedSubs = getLinkedSubmissionsForCompany(selectedCompanyForInvoices.companyName);
                const totalAmount = linkedSubs.reduce((acc, sub) => acc + (sub.items ? sub.items.reduce((s, i) => s + (i.total || 0), 0) : 0), 0);

                if (linkedSubs.length === 0) {
                  return (
                    <div className="text-center py-12 text-stone-400 space-y-2">
                      <FileText size={36} className="mx-auto text-stone-300" />
                      <p className="font-bold text-stone-600">Belum ada transaksi Voucher / Invoice yang tercatat untuk {selectedCompanyForInvoices.companyName}.</p>
                      <p className="text-xs">Ketika Anda membuat Voucher HO dan mengisi "Dibayarkan Kepada" dengan nama perusahaan ini, transaksinya akan otomatis muncul di sini.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="bg-stone-100 p-3.5 rounded-xl border border-stone-250 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-stone-500 block font-mono">Total Transaksi Ditemukan:</span>
                        <span className="font-black text-stone-900 text-sm">{linkedSubs.length} Voucher / Invoice</span>
                      </div>
                      <div className="text-right">
                        <span className="text-stone-500 block font-mono">Total Nominal Kumulatif:</span>
                        <span className="font-black text-emerald-700 text-sm font-mono">Rp {totalAmount.toLocaleString('id-ID')}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {linkedSubs.map((sub) => {
                        const subTotal = sub.items ? sub.items.reduce((sum, i) => sum + (i.total || 0), 0) : 0;
                        return (
                          <div key={sub.id} className="p-4 bg-stone-50 rounded-xl border border-stone-200 hover:border-indigo-300 transition space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-stone-900 text-white font-mono font-bold text-[10px]">
                                  {sub.kode || 'HO'}
                                </span>
                                <span className="text-xs font-bold text-stone-900">
                                  {sub.jenisPengajuan}
                                </span>
                                <span className="text-xs font-mono text-stone-400">
                                  • {sub.tanggal}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  sub.status === 'Lunas' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {sub.status || 'Belum Lunas'}
                                </span>
                                <span className="font-mono font-black text-xs text-stone-900">
                                  Rp {subTotal.toLocaleString('id-ID')}
                                </span>
                              </div>
                            </div>

                            {/* Sub items / descriptions */}
                            <div className="text-xs text-stone-600 bg-white p-2.5 rounded-lg border border-stone-200 space-y-1">
                              {sub.invoiceNumber && (
                                <div className="text-[11px] font-mono text-indigo-700 font-bold">
                                  No. Invoice Vendor: {sub.invoiceNumber}
                                </div>
                              )}
                              {sub.items && sub.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between text-[11px]">
                                  <span>- {it.item}</span>
                                  <span className="font-mono text-stone-500">Rp {(it.total || 0).toLocaleString('id-ID')}</span>
                                </div>
                              ))}
                              {sub.notes && (
                                <div className="text-[10px] text-stone-400 italic pt-1 border-t border-stone-100">
                                  Catatan: {sub.notes}
                                </div>
                              )}
                            </div>

                            {onSelectSubmissionForPrint && (
                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={() => {
                                    setSelectedCompanyForInvoices(null);
                                    onSelectSubmissionForPrint(sub);
                                  }}
                                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Buka / Cetak Voucher</span>
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedCompanyForInvoices(null)}
                className="px-5 py-2 rounded-xl bg-stone-800 text-white text-xs font-bold hover:bg-stone-700 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

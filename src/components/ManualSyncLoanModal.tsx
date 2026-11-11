import React, { useState, useMemo } from 'react';
import { Submission, EmployeeLoan, Worker } from '../types';
import {
  isLoanSubmission,
  determineLoanCategory,
  formatRupiah,
  formatTanggalIndo,
  generateNextLoanNumber,
  saveEmployeeLoans,
  manuallyLinkVoucherToLoan,
  manuallyUnlinkVoucherFromLoan,
  syncLoansWithSubmissions
} from '../utils/loanUtils';
import {
  X,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Link,
  Unlink,
  Plus,
  RefreshCw,
  Building,
  User,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';

interface ManualSyncLoanModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: Submission[];
  loans: EmployeeLoan[];
  workers: Worker[];
  onLoansUpdated: (updatedLoans: EmployeeLoan[]) => void;
  onViewSubmission?: (sub: Submission) => void;
}

export const ManualSyncLoanModal: React.FC<ManualSyncLoanModalProps> = ({
  isOpen,
  onClose,
  submissions = [],
  loans = [],
  workers = [],
  onLoansUpdated,
  onViewSubmission
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'detected_loans' | 'unlinked' | 'linked'>('detected_loans');
  const [selectedVoucherForLink, setSelectedVoucherForLink] = useState<Submission | null>(null);
  const [targetLoanId, setTargetLoanId] = useState<string>('');
  const [newLoanCategory, setNewLoanCategory] = useState<'karyawan' | 'perusahaan'>('karyawan');
  const [toastMsg, setToastMsg] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4500);
  };

  // Helper untuk menghitung nominal voucher
  const getVoucherAmount = (sub: Submission): number => {
    let amt = 0;
    if (Array.isArray(sub.items) && sub.items.length > 0) {
      amt = sub.items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
    }
    if (amt <= 0) {
      amt = Number((sub as any).subTotal) || Number((sub as any).total) || 0;
    }
    if (amt <= 0) {
      amt = Number((sub as any).invoiceAmount) || 0;
    }
    return amt;
  };

  // Map setiap voucher ke pinjaman yang terhubung
  const voucherConnectionMap = useMemo(() => {
    const map = new Map<string, { loan: EmployeeLoan; isMain: boolean; disbursementIndex: number }>();
    loans.forEach(loan => {
      if (loan.linkedSubmissionId) {
        map.set(loan.linkedSubmissionId, { loan, isMain: true, disbursementIndex: 0 });
      }
      if (Array.isArray(loan.disbursements)) {
        loan.disbursements.forEach((d, idx) => {
          if (d.submissionId) {
            map.set(d.submissionId, { loan, isMain: false, disbursementIndex: idx });
          }
        });
      }
    });
    return map;
  }, [loans]);

  // Filtered submissions list
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      const isDetected = isLoanSubmission(sub);
      const isLinked = voucherConnectionMap.has(sub.id) || (sub.kode && loans.some(l => l.linkedSubmissionKode === sub.kode));

      if (filterType === 'detected_loans' && !isDetected) return false;
      if (filterType === 'unlinked' && isLinked) return false;
      if (filterType === 'linked' && !isLinked) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchKode = (sub.kode || '').toLowerCase().includes(q);
      const matchPenerima = (sub.dibayarkanKepada || '').toLowerCase().includes(q);
      const matchJenis = (sub.jenisPengajuan || '').toLowerCase().includes(q);
      const matchNotes = (sub.notes || '').toLowerCase().includes(q);
      const amtStr = getVoucherAmount(sub).toString();
      const matchAmt = amtStr.includes(q);

      return matchKode || matchPenerima || matchJenis || matchNotes || matchAmt;
    });
  }, [submissions, filterType, searchQuery, voucherConnectionMap, loans]);

  if (!isOpen) return null;

  // Jalankan auto-sync massal
  const handleRunAutoSync = () => {
    const { syncedLoans, newLoansCount, accumulatedCount } = syncLoansWithSubmissions(loans, submissions, workers);
    onLoansUpdated(syncedLoans);
    saveEmployeeLoans(syncedLoans);
    showToast(`✅ Auto-sync selesai: ${newLoansCount} pinjaman baru dibuat, ${accumulatedCount} voucher terakumulasi.`);
  };

  // Buat pinjaman baru langsung dari voucher terpilih
  const handleCreateNewLoanFromVoucher = (sub: Submission, categoryOverride?: 'karyawan' | 'perusahaan') => {
    const category = categoryOverride || determineLoanCategory(sub.dibayarkanKepada, sub.jenisPengajuan, workers);
    const amount = getVoucherAmount(sub);
    const nextLoanNo = generateNextLoanNumber(loans);
    const recipient = sub.dibayarkanKepada || 'Penerima Pinjaman';

    const newLoan: EmployeeLoan = {
      id: `loan-manual-${sub.id}-${Date.now()}`,
      nomorPinjaman: nextLoanNo,
      tanggalPermohonan: sub.tanggal || new Date().toISOString().split('T')[0],
      namaKaryawan: recipient,
      category,
      divisi: category === 'karyawan' ? 'Staff / Karyawan NMSA' : 'Pihak Ketiga / Rekanan Perusahaan',
      alasanPeminjaman: sub.notes || `Pencairan ${sub.jenisPengajuan}`,
      jumlahPinjaman: amount,
      caraPembayaran: `Voucher HO (${sub.kode || '-'})`,
      tenorBulan: 5,
      cicilanPerBulan: Math.round(amount / 5),
      tanggalPengambilanPinjaman: sub.tanggal || new Date().toISOString().split('T')[0],
      peminjamNama: recipient,
      peminjamJabatan: category === 'karyawan' ? 'Karyawan' : 'Pimpinan Rekanan',
      peminjamTanggal: sub.tanggal,
      atasanNama: 'Andi Muhammad Rifki',
      atasanJabatan: 'Direktur',
      atasanTanggal: sub.tanggal,
      financeNama: 'Harijon',
      financeJabatan: 'Direktur Keuangan',
      financeTanggal: sub.tanggal,
      direkturNama: 'Andi Nursyam Halid',
      direkturJabatan: 'Direktur Utama',
      direkturTanggal: sub.tanggal,
      catatan: `Dihubungkan secara manual dari Voucher ${sub.kode || ''}: ${sub.notes || sub.jenisPengajuan}`,
      status: 'Belum Lunas',
      payments: [],
      disbursements: [{
        id: `disb-manual-${sub.id}`,
        submissionId: sub.id,
        kodeDokumen: sub.kode,
        tanggal: sub.tanggal || new Date().toISOString().split('T')[0],
        jumlah: amount,
        keterangan: sub.notes || sub.jenisPengajuan || 'Pencairan Pinjaman via Voucher HO (Manual)',
        statusPembayaran: sub.status || 'Belum Lunas'
      }],
      linkedSubmissionId: sub.id,
      linkedSubmissionKode: sub.kode,
      createdAt: new Date().toISOString()
    };

    const updated = [newLoan, ...loans];
    onLoansUpdated(updated);
    saveEmployeeLoans(updated);
    showToast(`✅ Berhasil membuat Pinjaman baru (${newLoan.nomorPinjaman}) untuk ${recipient}.`);
  };

  // Hubungkan voucher ke pinjaman yang sudah ada
  const handleLinkToExistingLoan = (sub: Submission, targetId: string) => {
    if (!targetId) return;
    const targetIdx = loans.findIndex(l => l.id === targetId);
    if (targetIdx < 0) return;

    const targetLoan = loans[targetIdx];
    const updatedLoan = manuallyLinkVoucherToLoan(targetLoan, sub);

    const updated = [...loans];
    updated[targetIdx] = updatedLoan;
    // Pindahkan ke paling atas
    updated.splice(targetIdx, 1);
    updated.unshift(updatedLoan);

    onLoansUpdated(updated);
    saveEmployeeLoans(updated);
    setSelectedVoucherForLink(null);
    setTargetLoanId('');
    showToast(`✅ Berhasil menghubungkan Voucher ${sub.kode} ke ${targetLoan.namaKaryawan} (${targetLoan.nomorPinjaman}).`);
  };

  // Lepaskan tautan voucher dari pinjaman
  const handleUnlinkVoucher = (sub: Submission) => {
    const conn = voucherConnectionMap.get(sub.id);
    if (!conn) return;

    const targetLoan = conn.loan;
    const targetIdx = loans.findIndex(l => l.id === targetLoan.id);
    if (targetIdx < 0) return;

    const updatedLoan = manuallyUnlinkVoucherFromLoan(targetLoan, sub.id);
    const updated = [...loans];
    updated[targetIdx] = updatedLoan;

    onLoansUpdated(updated);
    saveEmployeeLoans(updated);
    showToast(`🔗 Tautan Voucher ${sub.kode} berhasil dilepas dari ${targetLoan.namaKaryawan}.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/60 backdrop-blur-xs">
      <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-gradient-to-r from-amber-50 via-stone-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20">
              <Link size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-stone-900">
                Sinkronisasi &amp; Hubungkan Transaksi Manual
              </h2>
              <p className="text-xs text-stone-500">
                Hubungkan atau ganti transaksi voucher kas dengan data pinjaman jika sistem salah/belum mendeteksi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toast Notifikasi */}
        {toastMsg && (
          <div className="bg-emerald-600 text-white px-5 py-2.5 text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2 duration-150 shadow-inner">
            <CheckCircle2 size={15} />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Toolbar & Filter */}
        <div className="p-4 border-b border-stone-200 bg-stone-50/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Search bar */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="Cari no. voucher, penerima, jenis transaksi, atau nominal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
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

          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'detected_loans', label: 'Voucher Pinjaman' },
              { id: 'unlinked', label: 'Belum Terhubung' },
              { id: 'linked', label: 'Sudah Terhubung' },
              { id: 'all', label: 'Semua Transaksi' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer whitespace-nowrap ${
                  filterType === tab.id
                    ? 'bg-amber-600 text-white shadow-3xs'
                    : 'bg-white hover:bg-stone-200 text-stone-700 border border-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {/* Run Auto-Sync Button */}
            <button
              type="button"
              onClick={handleRunAutoSync}
              className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-amber-300 shadow-3xs cursor-pointer transition shrink-0 ml-1"
              title="Jalankan pemindaian otomatis seluruh transaksi"
            >
              <RefreshCw size={13} className="text-amber-700" />
              <span>Auto-Sinkron</span>
            </button>
          </div>
        </div>

        {/* Content Table / List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-12 text-stone-500 bg-stone-50 rounded-2xl border border-stone-200">
              <AlertCircle size={28} className="mx-auto text-stone-400 mb-2" />
              <p className="text-xs font-bold">Tidak ada transaksi voucher yang cocok dengan filter atau kata kunci.</p>
              <p className="text-[11px] text-stone-400 mt-0.5">Coba ganti filter atau hapus kata pencarian.</p>
            </div>
          ) : (
            filteredSubmissions.map(sub => {
              const amount = getVoucherAmount(sub);
              const isDetected = isLoanSubmission(sub);
              const conn = voucherConnectionMap.get(sub.id);
              const linkedLoan = conn ? conn.loan : null;
              const autoCategory = determineLoanCategory(sub.dibayarkanKepada, sub.jenisPengajuan, workers);

              return (
                <div
                  key={sub.id}
                  className={`bg-white border rounded-2xl p-3.5 sm:p-4 shadow-3xs transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    linkedLoan
                      ? 'border-emerald-200 hover:border-emerald-300 bg-emerald-50/20'
                      : isDetected
                      ? 'border-amber-200 hover:border-amber-300'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  {/* Left: Info Voucher */}
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-xs text-stone-900 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                        {sub.kode || 'VOUCHER'}
                      </span>
                      <span className="text-[11px] text-stone-500 font-mono">
                        {formatTanggalIndo(sub.tanggal)}
                      </span>
                      <span className="font-bold text-xs text-stone-800 bg-amber-50 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                        {sub.jenisPengajuan}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sub.status === 'Lunas' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {sub.status || 'Belum Lunas'}
                      </span>
                      {isDetected && (
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                          ⚡ Terdeteksi Pinjaman
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-2 pt-0.5">
                      <h4 className="font-bold text-sm text-stone-900">{sub.dibayarkanKepada || '-'}</h4>
                      <span className="font-mono font-black text-sm text-stone-900 text-emerald-700">
                        {formatRupiah(amount)}
                      </span>
                    </div>

                    {sub.notes && (
                      <p className="text-xs text-stone-500 line-clamp-1">
                        <strong>Catatan:</strong> {sub.notes}
                      </p>
                    )}

                    {/* Status Hubungan */}
                    {linkedLoan ? (
                      <div className="pt-1 flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-950 rounded-xl text-xs font-bold border border-emerald-300">
                          <CheckCircle2 size={13} className="text-emerald-700" />
                          <span>Terhubung ke Pinjaman:</span>
                          <span className="font-mono underline">{linkedLoan.nomorPinjaman}</span>
                          <span>({linkedLoan.namaKaryawan})</span>
                        </div>
                        <span className="text-[11px] text-stone-500">
                          Total Pinjaman Terakumulasi: <strong>{formatRupiah(linkedLoan.jumlahPinjaman)}</strong>
                        </span>
                      </div>
                    ) : (
                      <div className="pt-0.5 text-[11px] text-amber-700 font-medium flex items-center gap-1">
                        <AlertCircle size={12} />
                        <span>Belum terhubung ke catatan menu pinjaman</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Tombol Tindakan */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center flex-wrap">
                    {onViewSubmission && (
                      <button
                        type="button"
                        onClick={() => onViewSubmission(sub)}
                        className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Buka form voucher transaksi"
                      >
                        <ExternalLink size={12} />
                        <span>Buka</span>
                      </button>
                    )}

                    {linkedLoan ? (
                      <button
                        type="button"
                        onClick={() => handleUnlinkVoucher(sub)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Lepaskan tautan dari pinjaman ini"
                      >
                        <Unlink size={13} />
                        <span>Lepas Tautan</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCreateNewLoanFromVoucher(sub, 'karyawan')}
                          className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-3xs cursor-pointer"
                          title="Buat sebagai Pinjaman Karyawan baru"
                        >
                          <User size={13} />
                          <span>+ Pinjaman Karyawan</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCreateNewLoanFromVoucher(sub, 'perusahaan')}
                          className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-3xs cursor-pointer"
                          title="Buat sebagai Pinjaman Perusahaan / Rekanan / Pihak Ketiga baru"
                        >
                          <Building size={13} />
                          <span>+ Pinjaman Perusahaan</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVoucherForLink(sub);
                            setTargetLoanId(loans.length > 0 ? loans[0].id : '');
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-3xs cursor-pointer"
                          title="Gabungkan / Akumulasikan ke pinjaman yang sudah ada"
                        >
                          <Link size={13} />
                          <span>Gabung ke Pinjaman</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Sub-Dialog untuk Memilih Pinjaman yang Ditautkan */}
        {selectedVoucherForLink && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs">
            <div className="bg-white rounded-3xl p-5 w-full max-w-lg shadow-2xl border border-stone-200 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-extrabold text-sm sm:text-base text-stone-900 flex items-center gap-2">
                  <Link size={16} className="text-emerald-600" />
                  <span>Hubungkan Voucher ke Pinjaman</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedVoucherForLink(null)}
                  className="w-7 h-7 rounded-lg bg-stone-100 text-stone-500 hover:bg-stone-200 flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-3 bg-stone-50 rounded-xl text-xs font-mono space-y-1 border border-stone-200">
                <div className="text-stone-500">Voucher Dipilih:</div>
                <div className="font-bold text-stone-900">
                  {selectedVoucherForLink.kode} - {selectedVoucherForLink.dibayarkanKepada}
                </div>
                <div className="text-emerald-700 font-bold">
                  {formatRupiah(getVoucherAmount(selectedVoucherForLink))} ({selectedVoucherForLink.jenisPengajuan})
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Pilih Data Pinjaman Tujuan untuk Diakumulasikan:
                </label>
                <select
                  value={targetLoanId}
                  onChange={(e) => setTargetLoanId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {loans.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.nomorPinjaman} - {l.namaKaryawan} ({l.category === 'karyawan' ? 'Karyawan' : 'Perusahaan'}) - Saldo: {formatRupiah(l.jumlahPinjaman)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-500 mt-1">
                  Nominal voucher ini akan ditambahkan secara akumulatif ke saldo pinjaman yang dipilih.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedVoucherForLink(null)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleLinkToExistingLoan(selectedVoucherForLink, targetLoanId)}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-3xs"
                >
                  Hubungkan Sekarang
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
          <span>Menampilkan <strong>{filteredSubmissions.length}</strong> transaksi voucher</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-stone-800 hover:bg-stone-900 text-white font-bold rounded-xl shadow-3xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};

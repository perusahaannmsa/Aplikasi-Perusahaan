import React, { useState, useMemo } from 'react';
import { Submission, EmployeeLoan } from '../types';
import {
  formatRupiah,
  formatTanggalIndo,
  manuallyLinkVoucherToLoan,
  manuallyUnlinkVoucherFromLoan,
  saveEmployeeLoans
} from '../utils/loanUtils';
import {
  X,
  Search,
  Link,
  Unlink,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Layers,
  Check,
  ChevronRight
} from 'lucide-react';

interface LinkVoucherToLoanModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: EmployeeLoan;
  submissions: Submission[];
  onLoanUpdated: (updatedLoan: EmployeeLoan) => void;
}

export const LinkVoucherToLoanModal: React.FC<LinkVoucherToLoanModalProps> = ({
  isOpen,
  onClose,
  loan,
  submissions = [],
  onLoanUpdated
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'available' | 'connected'>('available');

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

  const connectedSubmissionIds = useMemo(() => {
    const ids = new Set<string>();
    if (loan.linkedSubmissionId) ids.add(loan.linkedSubmissionId);
    if (Array.isArray(loan.disbursements)) {
      loan.disbursements.forEach(d => {
        if (d.submissionId) ids.add(d.submissionId);
      });
    }
    return ids;
  }, [loan]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter(sub => {
      const isConnected = connectedSubmissionIds.has(sub.id) || (sub.kode && loan.linkedSubmissionKode === sub.kode);
      if (activeTab === 'connected' && !isConnected) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (sub.kode || '').toLowerCase().includes(q) ||
        (sub.dibayarkanKepada || '').toLowerCase().includes(q) ||
        (sub.jenisPengajuan || '').toLowerCase().includes(q) ||
        (sub.notes || '').toLowerCase().includes(q) ||
        getVoucherAmount(sub).toString().includes(q)
      );
    });
  }, [submissions, searchQuery, activeTab, connectedSubmissionIds, loan]);

  if (!isOpen) return null;

  const handleLink = (sub: Submission) => {
    const updated = manuallyLinkVoucherToLoan(loan, sub);
    onLoanUpdated(updated);
  };

  const handleUnlink = (submissionId: string) => {
    const updated = manuallyUnlinkVoucherFromLoan(loan, submissionId);
    onLoanUpdated(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/60 backdrop-blur-xs">
      <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20">
              <Link size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-stone-900">
                Ganti / Hubungkan Transaksi Voucher
              </h2>
              <p className="text-xs text-stone-500">
                Pinjaman <strong>{loan.nomorPinjaman}</strong> - {loan.namaKaryawan} ({formatRupiah(loan.jumlahPinjaman)})
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

        {/* Current Linked Vouchers Info */}
        <div className="p-4 bg-amber-50/60 border-b border-amber-200 text-xs">
          <div className="font-bold text-amber-950 mb-1.5 flex items-center gap-1.5">
            <Layers size={14} className="text-amber-700" />
            <span>Voucher yang Saat Ini Terhubung ({loan.disbursements?.length || 0}):</span>
          </div>

          {!loan.disbursements || loan.disbursements.length === 0 ? (
            <div className="text-stone-500 italic">Belum ada transaksi voucher kas yang terhubung dengan pinjaman ini.</div>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {loan.disbursements.map((d, idx) => (
                <div key={d.id || idx} className="bg-white rounded-xl p-2.5 border border-amber-200 flex items-center justify-between gap-2 shadow-3xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-stone-900 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                      {d.kodeDokumen || '-'}
                    </span>
                    <span className="text-stone-500">{d.tanggal}</span>
                    <span className="text-stone-700 font-medium truncate max-w-xs">{d.keterangan || '-'}</span>
                    <span className="font-mono font-black text-emerald-800">{formatRupiah(d.jumlah)}</span>
                  </div>
                  {d.submissionId && (
                    <button
                      type="button"
                      onClick={() => handleUnlink(d.submissionId!)}
                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
                    >
                      <Unlink size={11} />
                      <span>Lepas</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search & Tabs */}
        <div className="p-4 border-b border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="Cari voucher berdasarkan kode, penerima, atau jenis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('available')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                activeTab === 'available'
                  ? 'bg-amber-600 text-white shadow-3xs'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              Semua Voucher ({submissions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('connected')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                activeTab === 'connected'
                  ? 'bg-amber-600 text-white shadow-3xs'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              Hanya Terhubung ({connectedSubmissionIds.size})
            </button>
          </div>
        </div>

        {/* Voucher List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredSubmissions.length === 0 ? (
            <div className="text-center py-10 text-stone-500 bg-stone-50 rounded-2xl border border-stone-200 text-xs">
              Tidak ada voucher kas yang ditemukan.
            </div>
          ) : (
            filteredSubmissions.map(sub => {
              const amount = getVoucherAmount(sub);
              const isConnected = connectedSubmissionIds.has(sub.id) || (sub.kode && loan.linkedSubmissionKode === sub.kode);

              return (
                <div
                  key={sub.id}
                  className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                    isConnected
                      ? 'bg-emerald-50/50 border-emerald-300 shadow-3xs'
                      : 'bg-white border-stone-200 hover:border-amber-300'
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs bg-stone-100 text-stone-900 px-2 py-0.5 rounded border border-stone-200">
                        {sub.kode || '-'}
                      </span>
                      <span className="text-[11px] text-stone-500 font-mono">
                        {formatTanggalIndo(sub.tanggal)}
                      </span>
                      <span className="text-xs font-semibold text-stone-700 bg-amber-50 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                        {sub.jenisPengajuan}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sub.status === 'Lunas' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {sub.status || 'Belum Lunas'}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-sm text-stone-900">{sub.dibayarkanKepada || '-'}</span>
                      <span className="font-mono font-black text-sm text-emerald-800">
                        {formatRupiah(amount)}
                      </span>
                    </div>

                    {sub.notes && (
                      <p className="text-[11px] text-stone-500 line-clamp-1">{sub.notes}</p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {isConnected ? (
                      <button
                        type="button"
                        onClick={() => handleUnlink(sub.id)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <Unlink size={12} />
                        <span>Lepas Tautan</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleLink(sub)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-3xs cursor-pointer"
                      >
                        <Link size={12} />
                        <span>Hubungkan</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
          <span>Pilih transaksi voucher untuk dihubungkan atau diakumulasikan</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-stone-800 hover:bg-stone-900 text-white font-bold rounded-xl shadow-3xs transition cursor-pointer"
          >
            Selesai
          </button>
        </div>

      </div>
    </div>
  );
};

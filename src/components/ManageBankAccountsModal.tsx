import React, { useState } from 'react';
import { BankAccountMaster } from '../types';
import { Plus, Trash2, Edit2, Check, X, Building, CreditCard, User, Star } from 'lucide-react';

interface ManageBankAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccountMaster[];
  onSaveAccounts: (updated: BankAccountMaster[]) => void;
  onSelectAccount?: (account: BankAccountMaster) => void;
}

export const ManageBankAccountsModal: React.FC<ManageBankAccountsModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onSaveAccounts,
  onSelectAccount,
}) => {
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('PT. Nusantara Mineral Sukses Abadi');
  const [isDefault, setIsDefault] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleStartEdit = (acc: BankAccountMaster) => {
    setEditingId(acc.id);
    setBankName(acc.bankName);
    setAccountNumber(acc.accountNumber);
    setAccountHolder(acc.accountHolder);
    setIsDefault(!!acc.isDefault);
    setErrorMsg('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setBankName('');
    setAccountNumber('');
    setAccountHolder('PT. Nusantara Mineral Sukses Abadi');
    setIsDefault(false);
    setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      setErrorMsg('Semua kolom rekening bank harus diisi lengkap.');
      return;
    }

    let updated: BankAccountMaster[];
    if (editingId) {
      updated = accounts.map((acc) => {
        if (acc.id === editingId) {
          return {
            ...acc,
            bankName: bankName.trim(),
            accountNumber: accountNumber.trim(),
            accountHolder: accountHolder.trim(),
            isDefault,
          };
        }
        return isDefault ? { ...acc, isDefault: false } : acc;
      });
    } else {
      const newAcc: BankAccountMaster = {
        id: `bank-${Date.now()}`,
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountHolder: accountHolder.trim(),
        isDefault,
      };
      updated = isDefault
        ? [...accounts.map((a) => ({ ...a, isDefault: false })), newAcc]
        : [...accounts, newAcc];
    }

    onSaveAccounts(updated);
    handleCancelEdit();
  };

  const handleDelete = (id: string) => {
    if (accounts.length <= 1) {
      alert('Minimal harus ada 1 rekening tersimpan.');
      return;
    }
    if (window.confirm('Hapus rekening ini dari daftar master?')) {
      const updated = accounts.filter((a) => a.id !== id);
      onSaveAccounts(updated);
      if (editingId === id) handleCancelEdit();
    }
  };

  const handleSetDefault = (id: string) => {
    const updated = accounts.map((a) => ({
      ...a,
      isDefault: a.id === id,
    }));
    onSaveAccounts(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-stone-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <CreditCard size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Master Rekening Bank Tujuan Transfer
              </h3>
              <p className="text-xs text-stone-300">
                Simpan dan kelola nomor rekening untuk dropdown Internal Memo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Form Tambah / Edit */}
          <form
            onSubmit={handleSubmit}
            className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                {editingId ? <Edit2 size={14} className="text-amber-600" /> : <Plus size={14} className="text-emerald-600" />}
                {editingId ? 'Edit Rekening Bank' : 'Tambah Rekening Baru'}
              </h4>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-stone-500 hover:text-stone-800 underline"
                >
                  Batal Edit
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="text-xs text-red-600 font-semibold bg-red-50 p-2 rounded-lg border border-red-200">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-1 flex items-center gap-1">
                  <Building size={12} /> Nama Bank
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Bank Mandiri"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-1 flex items-center gap-1">
                  <CreditCard size={12} /> No. Rekening
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 1030013139064"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-1 flex items-center gap-1">
                  <User size={12} /> Nama Rekening / Pemilik
                </label>
                <input
                  type="text"
                  placeholder="PT. Nusantara Mineral Sukses Abadi"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <span>Jadikan rekening default otomatis</span>
              </label>

              <button
                type="submit"
                className="px-4 py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5"
              >
                {editingId ? <Check size={14} /> : <Plus size={14} />}
                {editingId ? 'Perbarui Rekening' : 'Simpan Rekening'}
              </button>
            </div>
          </form>

          {/* List Rekening Tersimpan */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                Daftar Rekening Tersimpan ({accounts.length})
              </h4>
              <span className="text-[11px] text-stone-400 font-mono">
                Klik Pilih untuk memasukkan ke Memo saat ini
              </span>
            </div>

            <div className="space-y-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                    acc.isDefault
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-white border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-900">
                        {acc.bankName}
                      </span>
                      {acc.isDefault && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 bg-amber-500 text-white rounded font-mono flex items-center gap-1">
                          <Star size={10} fill="currentColor" /> Default
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono font-bold text-stone-800 mt-0.5 tracking-wider">
                      {acc.accountNumber}
                    </div>
                    <div className="text-[11px] text-stone-500 truncate">
                      a.n. {acc.accountHolder}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onSelectAccount && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectAccount(acc);
                          onClose();
                        }}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition shadow-3xs"
                        title="Pilih dan masukkan ke Internal Memo"
                      >
                        Pilih
                      </button>
                    )}

                    {!acc.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(acc.id)}
                        className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition"
                        title="Jadikan default"
                      >
                        <Star size={15} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleStartEdit(acc)}
                      className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition"
                      title="Edit rekening"
                    >
                      <Edit2 size={15} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(acc.id)}
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Hapus rekening"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-stone-100 border-t border-stone-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold rounded-xl transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

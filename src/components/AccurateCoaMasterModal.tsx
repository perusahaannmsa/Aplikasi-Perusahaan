import React, { useState, useMemo } from 'react';
import { Settings, Plus, Check, Search, Trash2, Edit2, RotateCcw, AlertCircle, BookOpen, Layers } from 'lucide-react';
import { AccurateAccount } from '../types';
import { useAccurateCoa } from '../utils/accurateCoaStore';

interface AccurateCoaMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAccount?: (account: AccurateAccount) => void;
  title?: string;
}

export const AccurateCoaMasterModal: React.FC<AccurateCoaMasterModalProps> = ({
  isOpen,
  onClose,
  onSelectAccount,
  title = 'Kelola Master Akun Accurate (Chart of Accounts - 1 Pintu)'
}) => {
  const { accounts, addAccount, updateAccount, deleteAccount, resetAccounts } = useAccurateCoa();

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Beban Pokok Penjualan');
  const [newKeywords, setNewKeywords] = useState<string>('');
  const [searchTermCoa, setSearchTermCoa] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    accounts.forEach(a => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats);
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const q = searchTermCoa.toLowerCase().trim();
    return accounts.filter(a => {
      const matchSearch = !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.keywords && a.keywords.some(k => k.toLowerCase().includes(q)));
      const matchCat = categoryFilter === 'all' || a.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [accounts, searchTermCoa, categoryFilter]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleStartEdit = (acc: AccurateAccount) => {
    setEditingCode(acc.code);
    setNewCode(acc.code);
    setNewName(acc.name);
    setNewCategory(acc.category || 'Beban Operasional');
    setNewKeywords(acc.keywords ? acc.keywords.join(', ') : '');
  };

  const handleCancelEdit = () => {
    setEditingCode(null);
    setNewCode('');
    setNewName('');
    setNewKeywords('');
    setNewCategory('Beban Pokok Penjualan');
  };

  const handleSaveAccount = () => {
    if (!newCode.trim() || !newName.trim()) {
      showNotification('error', 'Kode dan Nama Akun wajib diisi!');
      return;
    }

    const keywordsArray = newKeywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    try {
      if (editingCode) {
        updateAccount(editingCode, {
          code: newCode.trim(),
          name: newName.trim(),
          category: newCategory,
          keywords: keywordsArray
        });
        showNotification('success', `Akun [${editingCode}] berhasil diperbarui dan tersinkronisasi ke seluruh sistem (Pemetaan & RAB)!`);
      } else {
        addAccount({
          code: newCode.trim(),
          name: newName.trim(),
          category: newCategory,
          keywords: keywordsArray
        });
        showNotification('success', `Akun baru [${newCode.trim()}] berhasil ditambahkan ke Master COA!`);
      }
      handleCancelEdit();
    } catch (e: any) {
      showNotification('error', e.message || 'Gagal menyimpan akun');
    }
  };

  const handleDeleteAccount = (acc: AccurateAccount) => {
    if (window.confirm(`Hapus akun [${acc.code}] "${acc.name}" dari Master COA?`)) {
      try {
        deleteAccount(acc.code);
        showNotification('success', `Akun [${acc.code}] berhasil dihapus.`);
        if (editingCode === acc.code) {
          handleCancelEdit();
        }
      } catch (e: any) {
        showNotification('error', e.message || 'Gagal menghapus akun');
      }
    }
  };

  const handleReset = () => {
    if (window.confirm('Apakah Anda yakin ingin mereset seluruh daftar COA ke susunan standar Accurate & RAB Proyek lengkap?')) {
      resetAccounts();
      showNotification('success', 'Master COA berhasil direset ke standar lengkap!');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-5 shadow-2xl border border-stone-200 max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 shrink-0">
          <div className="flex items-center gap-2.5 text-stone-900 font-sans font-black text-lg">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Settings size={20} />
            </div>
            <div>
              <h3 className="leading-tight">{title}</h3>
              <p className="text-[11px] font-normal text-stone-500 font-sans mt-0.5">
                Satu Pintu Master Akun terintegrasi otomatis antara <strong>Pemetaan Akun Accurate</strong> dan <strong>RAB Anggaran Proyek</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 font-bold text-sm cursor-pointer p-2 rounded-xl hover:bg-stone-100 transition"
          >
            ✕
          </button>
        </div>

        {/* Feedback Message */}
        {feedbackMsg && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 ${
            feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            <AlertCircle size={15} />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Form Add / Edit */}
        <div className={`border p-4 rounded-2xl space-y-3 shrink-0 transition-colors ${editingCode ? 'bg-amber-50/70 border-amber-300' : 'bg-stone-50 border-stone-200'}`}>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs text-stone-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
              <span>{editingCode ? `✏️ Edit Akun COA [${editingCode}]` : '+ Tambah Akun COA Baru (1 Pintu)'}</span>
            </h4>
            <span className="text-[10px] text-stone-500">Otomatis terhubung ke RAB Proyek & Pemetaan Akun</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-mono text-stone-500 uppercase font-bold block mb-1">
                Kode Akun:
              </label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Contoh: 5-1100 atau 600028"
                className="w-full bg-white border border-stone-250 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] font-mono text-stone-500 uppercase font-bold block mb-1">
                Nama Akun Accurate / Pos RAB:
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contoh: Beban Material Proyek / Beban BBM"
                className="w-full bg-white border border-stone-250 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-stone-500 uppercase font-bold block mb-1">
                Kategori Akun:
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full bg-white border border-stone-250 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                <option value="Beban Pokok Penjualan">Beban Pokok Penjualan (HPP / Biaya Proyek)</option>
                <option value="Beban Operasional">Beban Operasional</option>
                <option value="Kas & Bank">Kas & Bank</option>
                <option value="Piutang Usaha">Piutang Usaha</option>
                <option value="Persediaan">Persediaan</option>
                <option value="Aset Lancar Lainnya">Aset Lancar Lainnya</option>
                <option value="Aset Tetap">Aset Tetap</option>
                <option value="Akumulasi Penyusutan">Akumulasi Penyusutan</option>
                <option value="Utang Usaha">Utang Usaha</option>
                <option value="Liabilitas Jangka Pendek">Liabilitas Jangka Pendek</option>
                <option value="Liabilitas Jangka Panjang">Liabilitas Jangka Panjang</option>
                <option value="Modal">Modal</option>
                <option value="Pendapatan">Pendapatan</option>
                <option value="Pendapatan Lainnya">Pendapatan Lainnya</option>
                <option value="Beban Lainnya">Beban Lainnya</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-stone-500 uppercase font-bold block mb-1">
                Kata Kunci Auto-Mapping (Pisahkan koma):
              </label>
              <input
                type="text"
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                placeholder="Contoh: solar, bensin, spbu, bbm"
                className="w-full bg-white border border-stone-250 rounded-xl p-2 text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAccount}
                disabled={!newCode.trim() || !newName.trim()}
                className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                {editingCode ? <Check size={14} /> : <Plus size={14} />}
                <span>{editingCode ? 'Simpan Perubahan' : 'Simpan Akun Baru'}</span>
              </button>

              {editingCode && (
                <button
                  onClick={handleCancelEdit}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>

            <button
              onClick={handleReset}
              className="text-[11px] font-bold text-rose-700 hover:text-rose-900 flex items-center gap-1 cursor-pointer px-2 py-1 rounded-lg hover:bg-rose-50 transition"
              title="Reset seluruh master COA ke standar Accurate & RAB default"
            >
              <RotateCcw size={12} />
              <span>Reset Standar Lengkap</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-mono font-bold text-stone-700 uppercase flex items-center gap-1.5">
              <Layers size={14} className="text-amber-600" />
              <span>Master Akun ({filteredAccounts.length}/{accounts.length})</span>
            </span>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs py-1 px-2.5 rounded-xl border border-stone-250 bg-stone-50 font-mono text-stone-700 focus:outline-none"
            >
              <option value="all">Semua Kategori</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchTermCoa}
              onChange={(e) => setSearchTermCoa(e.target.value)}
              placeholder="Cari kode atau nama akun..."
              className="w-full bg-stone-50 border border-stone-250 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:bg-white"
            />
            <Search size={13} className="absolute left-2.5 top-2 text-stone-400" />
          </div>
        </div>

        {/* Account Table / List */}
        <div className="border border-stone-250 rounded-2xl flex-1 overflow-y-auto divide-y divide-stone-100 min-h-[220px]">
          {filteredAccounts.length === 0 ? (
            <div className="p-8 text-center text-stone-400 text-xs font-mono">
              Tidak ada akun yang sesuai dengan pencarian atau filter.
            </div>
          ) : (
            filteredAccounts.map((acc) => (
              <div
                key={acc.code}
                className={`p-3 flex items-center justify-between gap-3 text-xs font-mono transition ${
                  editingCode === acc.code ? 'bg-amber-100/60' : 'hover:bg-stone-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px]">
                      {acc.code}
                    </span>
                    <span className="font-extrabold text-stone-900 truncate">
                      {acc.name}
                    </span>
                    <span className="text-[10px] text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md font-sans">
                      {acc.category}
                    </span>
                  </div>

                  {acc.keywords && acc.keywords.length > 0 && (
                    <p className="text-[10px] text-stone-400 mt-1 truncate">
                      Keywords: {acc.keywords.join(', ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onSelectAccount && (
                    <button
                      onClick={() => {
                        onSelectAccount(acc);
                        onClose();
                      }}
                      className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold px-2.5 py-1 rounded-lg text-[11px] transition cursor-pointer"
                    >
                      Pilih
                    </button>
                  )}

                  <button
                    onClick={() => handleStartEdit(acc)}
                    className="p-1.5 hover:bg-amber-100 text-amber-700 rounded-lg transition cursor-pointer"
                    title="Edit Akun"
                  >
                    <Edit2 size={13} />
                  </button>

                  <button
                    onClick={() => handleDeleteAccount(acc)}
                    className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg transition cursor-pointer"
                    title="Hapus Akun"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500 shrink-0">
          <span>Setiap perubahan akan langsung tersimpan & digunakan di RAB dan Pemetaan Akun.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

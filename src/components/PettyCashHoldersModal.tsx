import React, { useState } from 'react';
import { Users, Plus, Trash2, Edit2, Check, X, ShieldCheck, AlertCircle } from 'lucide-react';

interface PettyCashHoldersModalProps {
  isOpen: boolean;
  onClose: () => void;
  holders: string[];
  onSaveHolders: (newHolders: string[]) => Promise<void> | void;
}

export const PettyCashHoldersModal: React.FC<PettyCashHoldersModalProps> = ({
  isOpen,
  onClose,
  holders,
  onSaveHolders,
}) => {
  const [newHolderName, setNewHolderName] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleAddHolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newHolderName.trim();
    if (!trimmed) {
      setErrorMsg('Nama pemegang petty cash tidak boleh kosong.');
      return;
    }

    if (holders.some((h) => h.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(`Nama "${trimmed}" sudah ada dalam daftar pemegang petty cash.`);
      return;
    }

    setErrorMsg('');
    const updated = [...holders, trimmed];
    setIsSaving(true);
    try {
      await onSaveHolders(updated);
      setNewHolderName('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan data pemegang petty cash.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingName(holders[index]);
    setErrorMsg('');
  };

  const handleSaveEdit = async (index: number) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setErrorMsg('Nama pemegang petty cash tidak boleh kosong.');
      return;
    }

    const exists = holders.some(
      (h, idx) => idx !== index && h.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setErrorMsg(`Nama "${trimmed}" sudah ada dalam daftar.`);
      return;
    }

    setErrorMsg('');
    const updated = [...holders];
    updated[index] = trimmed;

    setIsSaving(true);
    try {
      await onSaveHolders(updated);
      setEditingIndex(null);
      setEditingName('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengubah nama.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHolder = async (index: number) => {
    const targetName = holders[index];
    if (
      !window.confirm(
        `Apakah Anda yakin ingin menghapus "${targetName}" dari daftar pemegang petty cash?`
      )
    ) {
      return;
    }

    const updated = holders.filter((_, idx) => idx !== index);
    setIsSaving(true);
    try {
      await onSaveHolders(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus data.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Users size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-stone-100">
                Master List Pemegang Petty Cash
              </h3>
              <p className="text-[11px] text-stone-400">
                Daftar terstandarisasi untuk Voucher HO & Absen Harian NMSA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Add New Holder Form */}
          <form onSubmit={handleAddHolder} className="space-y-2">
            <label className="block text-xs font-bold text-stone-700">
              Tambah Pemegang Petty Cash Baru
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Contoh: Suryo Pranoto, Muhammad Akbar..."
                className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                value={newHolderName}
                onChange={(e) => setNewHolderName(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSaving || !newHolderName.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-stone-950 font-extrabold rounded-xl text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-3xs"
              >
                <Plus size={15} />
                <span>Tambah</span>
              </button>
            </div>
          </form>

          {/* Holders Master List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-stone-500 px-1">
              <span>DAFTAR PEMEGANG TERDAFTAR ({holders.length})</span>
              <span className="text-[10px] text-emerald-600 font-mono font-bold flex items-center gap-1">
                <ShieldCheck size={12} />
                Tersinkron Otomatis
              </span>
            </div>

            {holders.length === 0 ? (
              <div className="text-center py-8 bg-stone-50 rounded-xl border border-stone-200 border-dashed text-stone-400 text-xs">
                Belum ada daftar pemegang petty cash. Tambahkan nama di atas.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 bg-stone-50/50 rounded-xl border border-stone-200 overflow-hidden">
                {holders.map((name, index) => (
                  <div
                    key={index}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-stone-100/60 transition"
                  >
                    {editingIndex === index ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          className="flex-1 bg-white border border-amber-400 rounded-lg px-2.5 py-1 text-xs font-bold text-stone-900 focus:outline-none"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveEdit(index)}
                          disabled={isSaving}
                          className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                          title="Simpan Perubahan"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingIndex(null)}
                          className="p-1.5 bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300 transition cursor-pointer"
                          title="Batal"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-900 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-xs font-extrabold text-stone-800 truncate">
                            {name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleStartEdit(index)}
                            className="p-1.5 hover:bg-stone-200/80 rounded-lg text-stone-600 hover:text-stone-900 transition cursor-pointer"
                            title="Edit Nama"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteHolder(index)}
                            className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-600 transition cursor-pointer"
                            title="Hapus Nama"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-stone-50 border-t border-stone-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl text-xs transition cursor-pointer shadow-3xs"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};

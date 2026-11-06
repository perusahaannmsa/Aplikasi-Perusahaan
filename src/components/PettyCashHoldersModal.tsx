import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  MapPin,
  Building2,
  RotateCcw,
  ArrowRightLeft
} from 'lucide-react';
import { areNamesSimilar, toTitleCase } from '../utils/nameConsolidation';
import {
  PettyCashCustodiansConfig,
  PettyCashCategory,
  DEFAULT_LAPANGAN_CUSTODIANS,
  DEFAULT_PUSAT_CUSTODIANS,
  DEFAULT_PETTY_CASH_CUSTODIANS,
  loadPettyCashCustodians,
  savePettyCashCustodians,
  sanitizeNamesList
} from '../utils/pettyCashCustodians';

interface PettyCashHoldersModalProps {
  isOpen: boolean;
  onClose: () => void;
  holders?: string[];
  custodiansConfig?: PettyCashCustodiansConfig;
  onSaveConfig?: (newConfig: PettyCashCustodiansConfig) => Promise<void> | void;
  onSaveHolders?: (newHolders: string[]) => Promise<void> | void;
  onOpenConsolidation?: () => void;
}

export const PettyCashHoldersModal: React.FC<PettyCashHoldersModalProps> = ({
  isOpen,
  onClose,
  custodiansConfig: initialConfigProp,
  onSaveConfig,
  onSaveHolders,
  onOpenConsolidation,
}) => {
  // Config state containing lapangan and pusat lists
  const [config, setConfig] = useState<PettyCashCustodiansConfig>(() => {
    if (initialConfigProp) return initialConfigProp;
    return loadPettyCashCustodians();
  });

  const [activeTab, setActiveTab] = useState<'all' | 'lapangan' | 'pusat'>('all');
  const [targetCategory, setTargetCategory] = useState<PettyCashCategory>('lapangan');
  const [newHolderName, setNewHolderName] = useState('');

  // Editing state
  const [editingTarget, setEditingTarget] = useState<{ category: PettyCashCategory; index: number } | null>(null);
  const [editingName, setEditingName] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [warningMsg, setWarningMsg] = useState<{ text: string; matchedName: string; category: PettyCashCategory } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Sync internal state when opened or prop updates
  useEffect(() => {
    if (isOpen) {
      if (initialConfigProp) {
        setConfig(initialConfigProp);
      } else {
        setConfig(loadPettyCashCustodians());
      }
      setErrorMsg('');
      setWarningMsg(null);
      setSuccessNotice(null);
      setEditingTarget(null);
    }
  }, [isOpen, initialConfigProp]);

  // Combined unique list for checks
  const allHolders = useMemo(() => {
    return Array.from(new Set([...(config.lapangan || []), ...(config.pusat || [])]));
  }, [config]);

  if (!isOpen) return null;

  const persistConfig = async (updatedConfig: PettyCashCustodiansConfig, msg?: string) => {
    setIsSaving(true);
    try {
      const sanitized: PettyCashCustodiansConfig = {
        lapangan: sanitizeNamesList(updatedConfig.lapangan),
        pusat: sanitizeNamesList(updatedConfig.pusat)
      };
      setConfig(sanitized);
      savePettyCashCustodians(sanitized);

      if (onSaveConfig) {
        await onSaveConfig(sanitized);
      }
      if (onSaveHolders) {
        const flat = Array.from(new Set([...sanitized.lapangan, ...sanitized.pusat]));
        await onSaveHolders(flat);
      }

      if (msg) {
        setSuccessNotice(msg);
        setTimeout(() => setSuccessNotice(null), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan perubahan pemegang petty cash.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddHolder = async (e: React.FormEvent, force = false) => {
    if (e) e.preventDefault();
    const trimmed = newHolderName.trim();
    if (!trimmed) {
      setErrorMsg('Nama pemegang petty cash tidak boleh kosong.');
      return;
    }

    const titleCased = toTitleCase(trimmed);
    const targetList = targetCategory === 'lapangan' ? config.lapangan : config.pusat;
    const otherList = targetCategory === 'lapangan' ? config.pusat : config.lapangan;
    const categoryName = targetCategory === 'lapangan' ? 'Petty Cash Lapangan' : 'Petty Cash Kantor Pusat';

    // Exact check in the same category
    if (targetList.some(h => h.toLowerCase() === titleCased.toLowerCase())) {
      setErrorMsg(`Nama "${titleCased}" sudah terdaftar di kategori ${categoryName}.`);
      return;
    }

    // Check if it already exists in the other category
    if (otherList.some(h => h.toLowerCase() === titleCased.toLowerCase())) {
      setErrorMsg(`Nama "${titleCased}" sudah ada di kategori lain. Satu pemegang kas disarankan fokus di satu unit kerja.`);
      return;
    }

    // Similarity / duplicate check
    if (!force) {
      const similarHolder = allHolders.find(h => areNamesSimilar(h, titleCased).isMatch);
      if (similarHolder) {
        const similarity = areNamesSimilar(similarHolder, titleCased);
        setWarningMsg({
          text: `Nama "${titleCased}" mendekati pemegang terdaftar "${similarHolder}" (${similarity.reason}). Disarankan menyamakan nama agar konsisten.`,
          matchedName: similarHolder,
          category: targetCategory
        });
        return;
      }
    }

    setErrorMsg('');
    setWarningMsg(null);

    const updatedConfig: PettyCashCustodiansConfig = {
      ...config,
      [targetCategory]: [...targetList, titleCased]
    };

    await persistConfig(updatedConfig, `Berhasil menambahkan "${titleCased}" ke ${categoryName}`);
    setNewHolderName('');
  };

  const handleStartEdit = (category: PettyCashCategory, index: number) => {
    const list = category === 'lapangan' ? config.lapangan : config.pusat;
    setEditingTarget({ category, index });
    setEditingName(list[index] || '');
    setErrorMsg('');
    setWarningMsg(null);
  };

  const handleSaveEdit = async () => {
    if (!editingTarget) return;
    const { category, index } = editingTarget;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setErrorMsg('Nama tidak boleh kosong.');
      return;
    }

    const titleCased = toTitleCase(trimmed);
    const list = [...(category === 'lapangan' ? config.lapangan : config.pusat)];

    // Check duplicate in same list excluding current index
    const exists = list.some((h, i) => i !== index && h.toLowerCase() === titleCased.toLowerCase());
    if (exists) {
      setErrorMsg(`Nama "${titleCased}" sudah ada di kategori ini.`);
      return;
    }

    list[index] = titleCased;
    const updatedConfig: PettyCashCustodiansConfig = {
      ...config,
      [category]: list
    };

    setErrorMsg('');
    await persistConfig(updatedConfig, `Nama berhasil diperbarui menjadi "${titleCased}"`);
    setEditingTarget(null);
    setEditingName('');
  };

  const handleSwitchCategory = async (currentCat: PettyCashCategory, index: number) => {
    const fromList = [...(currentCat === 'lapangan' ? config.lapangan : config.pusat)];
    const toCat: PettyCashCategory = currentCat === 'lapangan' ? 'pusat' : 'lapangan';
    const toList = [...(toCat === 'lapangan' ? config.lapangan : config.pusat)];

    const targetName = fromList[index];
    if (!targetName) return;

    // Remove from source and add to destination
    fromList.splice(index, 1);
    toList.push(targetName);

    const updatedConfig: PettyCashCustodiansConfig = {
      lapangan: currentCat === 'lapangan' ? fromList : toList,
      pusat: currentCat === 'pusat' ? fromList : toList
    };

    await persistConfig(
      updatedConfig,
      `"${targetName}" dipindahkan ke ${toCat === 'lapangan' ? 'Petty Cash Lapangan' : 'Petty Cash Kantor Pusat'}`
    );
  };

  const handleDelete = async (category: PettyCashCategory, index: number) => {
    const list = category === 'lapangan' ? config.lapangan : config.pusat;
    const targetName = list[index];
    const catLabel = category === 'lapangan' ? 'Petty Cash Lapangan' : 'Petty Cash Kantor Pusat';

    if (!window.confirm(`Hapus "${targetName}" dari ${catLabel}?`)) {
      return;
    }

    const updatedList = list.filter((_, i) => i !== index);
    const updatedConfig: PettyCashCustodiansConfig = {
      ...config,
      [category]: updatedList
    };

    await persistConfig(updatedConfig, `"${targetName}" berhasil dihapus.`);
  };

  const handleResetToStandard = async () => {
    if (
      !window.confirm(
        'Kembalikan daftar pemegang petty cash ke standar resmi?\n\n' +
        '• Lapangan: Suryo Pranoto, Usmar, Andi Hasnawi\n' +
        '• Kantor Pusat: Andi Dhiya Salsabila, Deasy Annisa Syahdane\n\n' +
        'Nama-nama kotor atau transaksi acak akan dihapus dari daftar pemegang.'
      )
    ) {
      return;
    }

    const resetConfig: PettyCashCustodiansConfig = {
      lapangan: [...DEFAULT_LAPANGAN_CUSTODIANS],
      pusat: [...DEFAULT_PUSAT_CUSTODIANS]
    };

    await persistConfig(resetConfig, 'Daftar pemegang petty cash berhasil dikembalikan ke standar resmi.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in font-sans">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Users size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-stone-100 tracking-tight">
                  Master List Pemegang Petty Cash
                </h3>
                <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
                  Terorganisir
                </span>
              </div>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Kategori terpisah: <strong>Lapangan</strong> & <strong>Kantor Pusat</strong> • Sinkron otomatis dengan Form & Laporan
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

        {/* Tab & Category Pill Filter */}
        <div className="px-6 pt-4 pb-2 bg-stone-50 border-b border-stone-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-stone-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'all'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>Semua</span>
              <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded-full border border-stone-200">
                {allHolders.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('lapangan')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'lapangan'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-emerald-800'
              }`}
            >
              <MapPin size={12} />
              <span>Lapangan</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${activeTab === 'lapangan' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                {config.lapangan.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pusat')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'pusat'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-amber-800'
              }`}
            >
              <Building2 size={12} />
              <span>Kantor Pusat</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${activeTab === 'pusat' ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-900'}`}>
                {config.pusat.length}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetToStandard}
            className="text-[11px] text-stone-600 hover:text-amber-800 hover:bg-stone-200/80 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer border border-stone-200"
            title="Reset ke daftar nama resmi: Suryo Pranoto, Usmar, Andi Hasnawi & Andi Dhiya Salsabila, Deasy Annisa Syahdane"
          >
            <RotateCcw size={12} className="text-amber-600" />
            <span>Reset Standar Resmi</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Notifications */}
          {successNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
              <span className="font-bold">{successNotice}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {warningMsg && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-950 rounded-xl text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 text-amber-600 mt-0.5" />
                <span className="leading-relaxed">{warningMsg.text}</span>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200">
                <button
                  type="button"
                  onClick={() => {
                    setNewHolderName('');
                    setWarningMsg(null);
                  }}
                  className="px-2.5 py-1 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg text-[11px] font-bold cursor-pointer transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={(e) => handleAddHolder(e, true)}
                  className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-[11px] font-bold cursor-pointer transition"
                >
                  Tetap Tambahkan Nama Ini
                </button>
              </div>
            </div>
          )}

          {/* Form to Add New Custodian with Category Selector */}
          <form onSubmit={handleAddHolder} className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-stone-800">
                Tambah Pemegang Petty Cash Baru
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-stone-500 font-bold">Pilih Kategori:</span>
                <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-white">
                  <button
                    type="button"
                    onClick={() => setTargetCategory('lapangan')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                      targetCategory === 'lapangan'
                        ? 'bg-emerald-600 text-white shadow-3xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <MapPin size={10} />
                    <span>Lapangan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetCategory('pusat')}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                      targetCategory === 'pusat'
                        ? 'bg-amber-600 text-white shadow-3xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Building2 size={10} />
                    <span>Kantor Pusat</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder={
                  targetCategory === 'lapangan'
                    ? "Contoh: Suryo Pranoto, Usmar, Andi Hasnawi..."
                    : "Contoh: Andi Dhiya Salsabila, Deasy Annisa Syahdane..."
                }
                className="flex-1 bg-white border border-stone-300 rounded-xl px-3.5 py-2 text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-3xs"
                value={newHolderName}
                onChange={(e) => setNewHolderName(e.target.value)}
              />
              <button
                type="submit"
                disabled={isSaving || !newHolderName.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-3xs"
              >
                <Plus size={15} />
                <span>+ Tambah</span>
              </button>
            </div>
          </form>

          {/* Section 1: Petty Cash Lapangan */}
          {(activeTab === 'all' || activeTab === 'lapangan') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className="p-1 rounded-md bg-emerald-100 text-emerald-800">
                    <MapPin size={12} />
                  </span>
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                    Petty Cash Lapangan ({config.lapangan.length})
                  </span>
                </div>
                <span className="text-[10px] text-stone-500 font-mono">
                  Hanya muncul saat memilih Petty Cash Lapangan
                </span>
              </div>

              {config.lapangan.length === 0 ? (
                <div className="p-4 text-center text-xs text-stone-400 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                  Belum ada pemegang Petty Cash Lapangan.
                </div>
              ) : (
                <div className="divide-y divide-stone-100 bg-white rounded-xl border border-stone-200 overflow-hidden shadow-3xs">
                  {config.lapangan.map((name, index) => {
                    const isEditing = editingTarget?.category === 'lapangan' && editingTarget?.index === index;
                    return (
                      <div
                        key={`lapangan-${index}`}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-stone-50/80 transition"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              className="flex-1 bg-white border border-emerald-500 rounded-lg px-2.5 py-1 text-xs font-bold text-stone-900 focus:outline-none"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                              title="Simpan Perubahan"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingTarget(null)}
                              className="p-1.5 bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300 transition cursor-pointer"
                              title="Batal"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                                {index + 1}
                              </span>
                              <span className="text-xs font-black text-stone-900 truncate">
                                {name}
                              </span>
                              <span className="text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-200">
                                Lapangan
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleSwitchCategory('lapangan', index)}
                                className="p-1.5 hover:bg-amber-50 rounded-lg text-amber-700 hover:text-amber-900 transition cursor-pointer"
                                title="Pindahkan ke Kantor Pusat"
                              >
                                <ArrowRightLeft size={13} />
                              </button>
                              <button
                                onClick={() => handleStartEdit('lapangan', index)}
                                className="p-1.5 hover:bg-stone-200 rounded-lg text-stone-600 hover:text-stone-900 transition cursor-pointer"
                                title="Edit Nama"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete('lapangan', index)}
                                className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-600 transition cursor-pointer"
                                title="Hapus Nama"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section 2: Petty Cash Kantor Pusat */}
          {(activeTab === 'all' || activeTab === 'pusat') && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className="p-1 rounded-md bg-amber-100 text-amber-900">
                    <Building2 size={12} />
                  </span>
                  <span className="text-xs font-black text-amber-950 uppercase tracking-wide">
                    Petty Cash Kantor Pusat ({config.pusat.length})
                  </span>
                </div>
                <span className="text-[10px] text-stone-500 font-mono">
                  Hanya muncul saat memilih Petty Cash Kantor Pusat
                </span>
              </div>

              {config.pusat.length === 0 ? (
                <div className="p-4 text-center text-xs text-stone-400 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                  Belum ada pemegang Petty Cash Kantor Pusat.
                </div>
              ) : (
                <div className="divide-y divide-stone-100 bg-white rounded-xl border border-stone-200 overflow-hidden shadow-3xs">
                  {config.pusat.map((name, index) => {
                    const isEditing = editingTarget?.category === 'pusat' && editingTarget?.index === index;
                    return (
                      <div
                        key={`pusat-${index}`}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-stone-50/80 transition"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              className="flex-1 bg-white border border-amber-500 rounded-lg px-2.5 py-1 text-xs font-bold text-stone-900 focus:outline-none"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              autoFocus
                            />
                            <button
                              onClick={handleSaveEdit}
                              disabled={isSaving}
                              className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                              title="Simpan Perubahan"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingTarget(null)}
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
                              <span className="text-xs font-black text-stone-900 truncate">
                                {name}
                              </span>
                              <span className="text-[9px] font-mono font-bold bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded border border-amber-200">
                                Kantor Pusat
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleSwitchCategory('pusat', index)}
                                className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-700 hover:text-emerald-900 transition cursor-pointer"
                                title="Pindahkan ke Lapangan"
                              >
                                <ArrowRightLeft size={13} />
                              </button>
                              <button
                                onClick={() => handleStartEdit('pusat', index)}
                                className="p-1.5 hover:bg-stone-200 rounded-lg text-stone-600 hover:text-stone-900 transition cursor-pointer"
                                title="Edit Nama"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete('pusat', index)}
                                className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-600 transition cursor-pointer"
                                title="Hapus Nama"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Quick Consolidation Banner */}
          {onOpenConsolidation && (
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={15} className="text-amber-600 shrink-0" />
                <span className="text-stone-700 text-[11px] truncate">
                  Ingin menyamakan variasi ejaan lama pada voucher terdahulu?
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenConsolidation();
                }}
                className="text-amber-800 hover:underline font-bold text-[11px] shrink-0 cursor-pointer"
              >
                Buka Satukan Nama
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-700 font-bold">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Tersinkron dengan Form Input & Laporan Kas</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-xl text-xs transition cursor-pointer shadow-3xs"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};

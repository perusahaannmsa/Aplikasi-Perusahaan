import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Sparkles, 
  Check, 
  X, 
  ArrowRight, 
  ShieldCheck, 
  AlertCircle, 
  RotateCcw, 
  ChevronRight,
  Filter,
  Layers,
  Search,
  CheckCircle2,
  SlidersHorizontal
} from 'lucide-react';
import { Submission } from '../types';
import { 
  findDuplicateNameClusters, 
  applyNameConsolidation, 
  NameCluster,
  toTitleCase 
} from '../utils/nameConsolidation';

interface ConsolidateNamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: Submission[];
  pettyCashHolders: string[];
  pettyCashReports?: any[];
  onApplyConsolidation: (result: {
    updatedSubmissions: Submission[];
    updatedPettyCashHolders: string[];
    updatedPettyCashReports: any[];
    modifiedCount: number;
    description: string;
  }) => Promise<void> | void;
}

export const ConsolidateNamesModal: React.FC<ConsolidateNamesModalProps> = ({
  isOpen,
  onClose,
  submissions,
  pettyCashHolders,
  pettyCashReports = [],
  onApplyConsolidation
}) => {
  const [activeTab, setActiveTab] = useState<'auto' | 'manual' | 'holders'>('auto');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search filter inside modal
  const [searchQuery, setSearchQuery] = useState('');

  // Editable cluster canonical names & holder flags
  const [clusterOverrides, setClusterOverrides] = useState<Record<string, { canonical: string; isHolder: boolean }>>({});

  // Manual merge states
  const [manualTargetName, setManualTargetName] = useState('');
  const [manualSelectedVariants, setManualSelectedVariants] = useState<string[]>([]);
  const [manualIsHolder, setManualIsHolder] = useState(false);

  // Analyze clusters
  const detectedClusters = useMemo(() => {
    return findDuplicateNameClusters(submissions, pettyCashHolders);
  }, [submissions, pettyCashHolders]);

  // All unique names present across submissions and holders
  const allUniqueNames = useMemo(() => {
    const map = new Map<string, number>();
    submissions.forEach(s => {
      const p = s.dibayarkanKepada?.trim();
      if (p) map.set(p, (map.get(p) || 0) + 1);
      const c = s.pettyCashCustodian?.trim();
      if (c && c !== p) map.set(c, (map.get(c) || 0) + 1);
    });
    pettyCashHolders.forEach(h => {
      const trimmed = h.trim();
      if (trimmed && !map.has(trimmed)) map.set(trimmed, 0);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [submissions, pettyCashHolders]);

  // Filtered clusters based on search query
  const filteredClusters = useMemo(() => {
    if (!searchQuery.trim()) return detectedClusters;
    const q = searchQuery.toLowerCase();
    return detectedClusters.filter(c => {
      if (c.canonicalName.toLowerCase().includes(q)) return true;
      return c.variations.some(v => v.name.toLowerCase().includes(q));
    });
  }, [detectedClusters, searchQuery]);

  if (!isOpen) return null;

  // Handle single cluster merge
  const handleMergeSingleCluster = async (cluster: NameCluster) => {
    const override = clusterOverrides[cluster.id];
    const canonicalName = override?.canonical || cluster.canonicalName;
    const isHolder = override ? override.isHolder : cluster.isPettyCashHolder;

    const variants = cluster.variations.map(v => v.name);

    setIsProcessing(true);
    setSuccessMessage(null);

    try {
      const res = applyNameConsolidation({
        submissions,
        pettyCashHolders,
        pettyCashReports,
        clustersToMerge: [{
          canonicalName,
          variants,
          isPettyCashHolder: isHolder
        }]
      });

      await onApplyConsolidation({
        ...res,
        modifiedCount: res.modifiedSubmissionsCount,
        description: `Menyatukan variasi nama "${canonicalName}" (${variants.length} bentuk penulisan, ${cluster.totalVouchers} voucher).`
      });

      setSuccessMessage(`Berhasil menyatukan variasi ke "${canonicalName}"! ${res.modifiedSubmissionsCount} voucher telah diperbarui.`);
    } catch (err: any) {
      alert('Terjadi kesalahan saat menyatukan data: ' + (err?.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle merge all detected clusters at once
  const handleMergeAllClusters = async () => {
    if (detectedClusters.length === 0) return;

    if (!window.confirm(
      `Yakin ingin menyatukan ${detectedClusters.length} kelompok nama secara otomatis?\n\n` +
      `Sistem akan memperbarui pengetikan nama penerima dan pemegang kas menjadi satu bentuk resmi standar.`
    )) {
      return;
    }

    setIsProcessing(true);
    setSuccessMessage(null);

    try {
      const clustersToMerge = detectedClusters.map(cluster => {
        const override = clusterOverrides[cluster.id];
        return {
          canonicalName: override?.canonical || cluster.canonicalName,
          variants: cluster.variations.map(v => v.name),
          isPettyCashHolder: override ? override.isHolder : cluster.isPettyCashHolder
        };
      });

      const res = applyNameConsolidation({
        submissions,
        pettyCashHolders,
        pettyCashReports,
        clustersToMerge
      });

      await onApplyConsolidation({
        ...res,
        modifiedCount: res.modifiedSubmissionsCount,
        description: `Menyatukan semua ${detectedClusters.length} kelompok nama duplikat secara otomatis (${res.modifiedSubmissionsCount} voucher diperbarui).`
      });

      setSuccessMessage(`Sukses! ${detectedClusters.length} kelompok nama berhasil disatukan. Sebanyak ${res.modifiedSubmissionsCount} voucher kini seragam.`);
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + (err?.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle manual merge
  const handleManualMerge = async () => {
    const target = toTitleCase(manualTargetName.trim());
    if (!target) {
      alert('Harap masukkan atau pilih Nama Utama (Standar).');
      return;
    }
    if (manualSelectedVariants.length === 0) {
      alert('Pilih minimal 1 nama variasi yang ingin digabungkan ke nama utama.');
      return;
    }

    setIsProcessing(true);
    setSuccessMessage(null);

    try {
      const res = applyNameConsolidation({
        submissions,
        pettyCashHolders,
        pettyCashReports,
        clustersToMerge: [{
          canonicalName: target,
          variants: manualSelectedVariants,
          isPettyCashHolder: manualIsHolder
        }]
      });

      await onApplyConsolidation({
        ...res,
        modifiedCount: res.modifiedSubmissionsCount,
        description: `Penggabungan manual ${manualSelectedVariants.length} nama ke "${target}".`
      });

      setSuccessMessage(`Berhasil meleburkan ${manualSelectedVariants.length} nama ke "${target}". ${res.modifiedSubmissionsCount} voucher diperbarui.`);
      setManualTargetName('');
      setManualSelectedVariants([]);
    } catch (err: any) {
      alert('Gagal menggabungkan: ' + (err?.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white border border-stone-200 rounded-3xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-5 border-b border-stone-150 bg-gradient-to-r from-stone-50 via-amber-50/30 to-stone-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center shadow-3xs">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-stone-900 font-display">
                  Penyatuan & Standardisasi Nama Penerima / Pemegang Kas
                </h3>
                <span className="bg-amber-100 text-amber-900 font-mono text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-amber-300">
                  Smart Normalizer
                </span>
              </div>
              <p className="text-xs text-stone-550 mt-0.5">
                Menggabungkan nama yang sama namun berbeda huruf besar/kecil, nama tidak lengkap, atau typo menjadi 1 orang terpadu.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition cursor-pointer"
            title="Tutup"
          >
            <X size={20} />
          </button>
        </div>

        {/* STATS STRIP */}
        <div className="px-6 py-3 bg-stone-100/60 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-stone-600 font-medium">
            <span>
              Total Transaksi: <strong className="text-stone-900 font-mono">{submissions.length}</strong>
            </span>
            <span>•</span>
            <span>
              Nama Unik Terdata: <strong className="text-stone-900 font-mono">{allUniqueNames.length}</strong>
            </span>
            <span>•</span>
            <span>
              Pemegang Petty Cash: <strong className="text-stone-900 font-mono">{pettyCashHolders.length}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-stone-500">Kelompok Terduplikasi:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-bold ${
              detectedClusters.length > 0 
                ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}>
              {detectedClusters.length} Kelompok
            </span>
          </div>
        </div>

        {/* SUCCESS NOTIFICATION */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-250 rounded-2xl flex items-center gap-3 text-emerald-900 text-xs font-semibold animate-fade-in shadow-3xs">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span className="flex-1">{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-950 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* TABS HEADER */}
        <div className="px-6 pt-4 border-b border-stone-200 flex items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('auto')}
              className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer ${
                activeTab === 'auto'
                  ? 'border-amber-600 text-amber-900 bg-amber-50/40'
                  : 'border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-50'
              }`}
            >
              <Sparkles size={14} className={activeTab === 'auto' ? 'text-amber-600' : ''} />
              <span>Deteksi Otomatis</span>
              {detectedClusters.length > 0 && (
                <span className="bg-amber-500 text-white font-mono text-[10px] px-2 py-0.2 rounded-full font-black">
                  {detectedClusters.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer ${
                activeTab === 'manual'
                  ? 'border-amber-600 text-amber-900 bg-amber-50/40'
                  : 'border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-50'
              }`}
            >
              <SlidersHorizontal size={14} className={activeTab === 'manual' ? 'text-amber-600' : ''} />
              <span>Penyatuan Manual</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('holders')}
              className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer ${
                activeTab === 'holders'
                  ? 'border-amber-600 text-amber-900 bg-amber-50/40'
                  : 'border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-50'
              }`}
            >
              <Users size={14} className={activeTab === 'holders' ? 'text-amber-600' : ''} />
              <span>Daftar Pemegang Petty Cash</span>
              <span className="bg-stone-200 text-stone-700 font-mono text-[10px] px-2 py-0.2 rounded-full font-bold">
                {pettyCashHolders.length}
              </span>
            </button>
          </div>

          {activeTab === 'auto' && detectedClusters.length > 0 && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleMergeAllClusters}
              className="mb-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-extrabold text-xs rounded-xl shadow-3xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Satukan seluruh kelompok yang terdeteksi secara otomatis sekaligus"
            >
              <Sparkles size={14} />
              <span>Satukan Semua Sekaligus ({detectedClusters.length})</span>
            </button>
          )}
        </div>

        {/* MODAL BODY */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-stone-50/50">

          {/* TAB 1: AUTO DETECTION CLUSTERS */}
          {activeTab === 'auto' && (
            <div className="space-y-4">
              {/* Search Box */}
              {detectedClusters.length > 0 && (
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Cari nama dalam kelompok yang terdeteksi..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}

              {detectedClusters.length === 0 ? (
                <div className="py-12 px-6 bg-white border border-stone-200 rounded-2xl text-center space-y-3 shadow-3xs">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="text-base font-bold text-stone-900">
                    Semua Data Nama Telah Rapi & Standar!
                  </h4>
                  <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                    Tidak ditemukan nama penerima atau pemegang petty cash yang terduplikasi karena perbedaan huruf besar/kecil maupun potongan nama yang tidak lengkap.
                  </p>
                </div>
              ) : filteredClusters.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500 bg-white rounded-2xl border border-stone-200">
                  Tidak ada nama yang cocok dengan kata kunci pencarian "{searchQuery}".
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredClusters.map((cluster) => {
                    const override = clusterOverrides[cluster.id];
                    const currentCanonical = override?.canonical ?? cluster.canonicalName;
                    const isHolder = override ? override.isHolder : cluster.isPettyCashHolder;

                    return (
                      <div
                        key={cluster.id}
                        className="bg-white border border-stone-200 rounded-2xl p-4.5 space-y-3.5 shadow-3xs hover:border-amber-300 transition"
                      >
                        {/* Top: Target Standard Name Input + Status Badges */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 font-mono">
                                Target Nama Standar (Resmi):
                              </span>
                              {cluster.matchReasons.map((reason, idx) => (
                                <span
                                  key={idx}
                                  className="bg-stone-100 text-stone-600 text-[9px] font-bold font-mono px-2 py-0.5 rounded-md border border-stone-200"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={currentCanonical}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setClusterOverrides(prev => ({
                                    ...prev,
                                    [cluster.id]: {
                                      canonical: val,
                                      isHolder: prev[cluster.id]?.isHolder ?? cluster.isPettyCashHolder
                                    }
                                  }));
                                }}
                                className="font-extrabold text-sm text-stone-900 bg-amber-50/50 border border-amber-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 w-full max-w-sm"
                                placeholder="Masukkan nama standar..."
                              />

                              <label className="flex items-center gap-1.5 text-xs text-stone-700 select-none cursor-pointer bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 hover:bg-stone-100 shrink-0">
                                <input
                                  type="checkbox"
                                  checked={isHolder}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setClusterOverrides(prev => ({
                                      ...prev,
                                      [cluster.id]: {
                                        canonical: prev[cluster.id]?.canonical ?? cluster.canonicalName,
                                        isHolder: checked
                                      }
                                    }));
                                  }}
                                  className="rounded text-amber-600 focus:ring-0 cursor-pointer"
                                />
                                <span className="font-bold text-[11px]">Pemegang Petty Cash</span>
                              </label>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleMergeSingleCluster(cluster)}
                            className="self-end sm:self-center px-3.5 py-2 bg-stone-900 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-3xs flex items-center gap-1.5 shrink-0"
                          >
                            <Check size={13} />
                            <span>Satukan Kelompok Ini</span>
                          </button>
                        </div>

                        {/* List of Variations Found */}
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">
                            Variasi Penulisan Ditemukan ({cluster.variations.length} bentuk, total {cluster.totalVouchers} voucher):
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {cluster.variations.map((v) => {
                              const isTarget = v.name === currentCanonical;
                              return (
                                <div
                                  key={v.name}
                                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                                    isTarget
                                      ? 'bg-amber-50/60 border-amber-300 text-amber-950 font-bold'
                                      : 'bg-stone-50 border-stone-200 text-stone-700'
                                  }`}
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate font-semibold">{v.name}</span>
                                      {v.isHolder && (
                                        <span className="bg-amber-200/80 text-amber-900 text-[8px] font-black uppercase px-1.5 py-0.2 rounded">
                                          Holder
                                        </span>
                                      )}
                                      {isTarget && (
                                        <span className="bg-emerald-200 text-emerald-900 text-[8px] font-black uppercase px-1.5 py-0.2 rounded">
                                          Nama Utama
                                        </span>
                                      )}
                                    </div>
                                    {v.sampleCodes.length > 0 && (
                                      <div className="text-[9px] text-stone-400 font-mono truncate">
                                        Contoh: {v.sampleCodes.join(', ')}
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-right shrink-0">
                                    <span className="font-mono font-bold text-stone-900 text-[11px]">
                                      {v.count}
                                    </span>
                                    <span className="text-[9px] text-stone-400 ml-1">voucher</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUAL MERGE TOOL */}
          {activeTab === 'manual' && (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-6 shadow-3xs">
              <div>
                <h4 className="text-sm font-bold text-stone-900">
                  Penggabungan Manual / Kustom
                </h4>
                <p className="text-xs text-stone-500 mt-0.5">
                  Pilih satu nama tujuan (master), lalu pilih nama-nama lain yang ingin disatukan/dilebur ke nama tersebut.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Select / Enter Target Name */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-stone-700">
                    1. Nama Utama Target (Hasil Akhir)
                  </label>
                  <input
                    type="text"
                    list="unique-names-list"
                    value={manualTargetName}
                    onChange={(e) => setManualTargetName(e.target.value)}
                    placeholder="Ketik atau pilih nama tujuan..."
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <datalist id="unique-names-list">
                    {allUniqueNames.map(item => (
                      <option key={item.name} value={item.name}>
                        {item.name} ({item.count} voucher)
                      </option>
                    ))}
                  </datalist>

                  <label className="flex items-center gap-2 pt-1 text-xs text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualIsHolder}
                      onChange={(e) => setManualIsHolder(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-0"
                    />
                    <span>Tetapkan nama ini sebagai Pemegang Petty Cash Resmi</span>
                  </label>
                </div>

                {/* 2. Select Variants to Merge */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-stone-700">
                    2. Pilih Nama-Nama yang Ingin Dileburkan ({manualSelectedVariants.length} terpilih)
                  </label>
                  <div className="max-h-60 overflow-y-auto border border-stone-200 rounded-xl p-2 bg-stone-50 space-y-1">
                    {allUniqueNames
                      .filter(item => item.name !== manualTargetName)
                      .map(item => {
                        const isSelected = manualSelectedVariants.includes(item.name);
                        return (
                          <div
                            key={item.name}
                            onClick={() => {
                              if (isSelected) {
                                setManualSelectedVariants(manualSelectedVariants.filter(v => v !== item.name));
                              } else {
                                setManualSelectedVariants([...manualSelectedVariants, item.name]);
                              }
                            }}
                            className={`p-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition select-none ${
                              isSelected
                                ? 'bg-amber-100/70 border border-amber-300 text-amber-950 font-bold'
                                : 'bg-white border border-stone-150 text-stone-700 hover:bg-stone-100'
                            }`}
                          >
                            <span className="truncate">{item.name}</span>
                            <span className="text-[10px] font-mono text-stone-400">
                              {item.count} voucher
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-stone-100 flex justify-end">
                <button
                  type="button"
                  disabled={isProcessing || !manualTargetName || manualSelectedVariants.length === 0}
                  onClick={handleManualMerge}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-3xs transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <Sparkles size={14} />
                  <span>Gabungkan Menjadi 1 Orang</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: MASTER PETTY CASH HOLDERS */}
          {activeTab === 'holders' && (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 shadow-3xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-stone-900">
                    Daftar Pemegang Petty Cash Resmi
                  </h4>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Hanya ada beberapa pemegang petty cash resmi di perusahaan. Nama-nama di bawah ini dijadikan acuan utama sistem.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                {pettyCashHolders.map(holder => {
                  const count = submissions.filter(
                    s => (s.pettyCashCustodian?.toLowerCase() === holder.toLowerCase()) ||
                         (s.dibayarkanKepada?.toLowerCase() === holder.toLowerCase() && s.isPettyCash)
                  ).length;

                  return (
                    <div
                      key={holder}
                      className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                          <ShieldCheck size={14} className="text-emerald-600" />
                          <span>{holder}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                          {count} voucher terkait
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <div className="text-xs text-stone-500">
            Perubahan langsung diperbarui pada daftar voucher, rekapan petty cash, dan tersimpan di database.
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Selesai / Tutup
          </button>
        </div>

      </div>
    </div>
  );
};

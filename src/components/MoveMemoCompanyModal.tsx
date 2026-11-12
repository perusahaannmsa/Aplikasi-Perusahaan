import React, { useState, useEffect } from 'react';
import { InternalMemo, SavedKopSuratLink } from '../types';
import {
  ArrowRightLeft,
  Check,
  X,
  FileText,
  Image as ImageIcon,
  Sparkles,
  CreditCard,
  Plus,
} from 'lucide-react';
import { extractMemoNominal, OFFICIAL_KOP_SURAT_IMAGE_URL } from '../utils/memoUtils';

export interface DynamicKopTabInfo {
  id: string;
  name: string;
  shortName?: string;
  icon?: string;
  tabLabel?: string;
  url?: string;
  count?: number;
  isDefault?: boolean;
  isWithoutKop?: boolean;
  prefix?: string;
}

interface MoveMemoCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  memosToMove: InternalMemo[];
  savedKopLinks: SavedKopSuratLink[];
  dynamicTabs: DynamicKopTabInfo[];
  onConfirmMove: (params: {
    targetKopName: string;
    targetKopUrl?: string;
    isWithoutKop: boolean;
    targetTabId: string;
    updateMemoNumber: boolean;
    customNomorMemo?: string;
  }) => void;
  onAddNewKopLink?: (link: SavedKopSuratLink) => void;
}

function getPrefixFromKopName(kopName: string): string {
  const upper = kopName.toUpperCase();
  if (upper.includes('NMSA') || upper.includes('NUSANTARA MINERAL')) return 'IM-NMSA';
  if (upper.includes('IPN') || upper.includes('INDUSTRI PADI NUSANTARA')) return 'IM-IPN';
  if (upper.includes('ANH') || upper.includes('AGRO NUSANTARA')) return 'IM-ANH';
  const matchPt = upper.match(/PT\.?\s*([A-Z0-9]{2,6})/);
  if (matchPt && matchPt[1]) return `IM-${matchPt[1]}`;
  return 'IM-NMSA';
}

function computeUpdatedNomorMemo(
  oldNomor: string,
  targetKopName: string,
  isWithoutKop: boolean
): string {
  if (!oldNomor) return oldNomor;
  if (isWithoutKop) {
    // If moving to without kop: convert /IM-XXX/KEU/ to /IM/KEU/
    return oldNomor.replace(/\/IM-[A-Z0-9_-]+\/KEU\//i, '/IM/KEU/');
  }

  // Moving to a Kop Surat
  const prefix = getPrefixFromKopName(targetKopName);
  if (oldNomor.includes('/IM/KEU/')) {
    return oldNomor.replace('/IM/KEU/', `/${prefix}/KEU/`);
  }
  return oldNomor.replace(/\/IM-[A-Z0-9_-]+\/KEU\//i, `/${prefix}/KEU/`);
}

export const MoveMemoCompanyModal: React.FC<MoveMemoCompanyModalProps> = ({
  isOpen,
  onClose,
  memosToMove,
  savedKopLinks,
  dynamicTabs,
  onConfirmMove,
  onAddNewKopLink,
}) => {
  // Target options derived from dynamicTabs (excluding 'all')
  const availableTargetTabs = dynamicTabs.filter((t) => t.id !== 'all');

  const [selectedTargetTabId, setSelectedTargetTabId] = useState<string>('kop-resmi-nmsa');
  const [shouldUpdateMemoNumber, setShouldUpdateMemoNumber] = useState<boolean>(true);
  const [editedNomorMemo, setEditedNomorMemo] = useState<string>('');

  // Add new Kop Surat inline state
  const [isAddingNewKop, setIsAddingNewKop] = useState<boolean>(false);
  const [newKopName, setNewKopName] = useState<string>('');
  const [newKopUrl, setNewKopUrl] = useState<string>('');

  // Single memo or multiple memos
  const isSingle = memosToMove.length === 1;
  const singleMemo = isSingle ? memosToMove[0] : null;

  // Initialize modal state when opened
  useEffect(() => {
    if (isOpen && memosToMove.length > 0) {
      // Pick a target tab different from current memo if possible
      const currentKop = memosToMove[0]?.companyHeaderName || '';
      const isCurrentWithoutKop = memosToMove[0]?.showKopSurat === false;

      let defaultTargetId = 'kop-resmi-nmsa';
      if (isCurrentWithoutKop) {
        defaultTargetId = 'kop-resmi-nmsa';
      } else if (currentKop.includes('NMSA')) {
        const other = availableTargetTabs.find((t) => t.id !== 'kop-resmi-nmsa');
        if (other) defaultTargetId = other.id;
      }

      setSelectedTargetTabId(defaultTargetId);
      setShouldUpdateMemoNumber(true);
      setIsAddingNewKop(false);

      if (isSingle && singleMemo) {
        const targetTab = availableTargetTabs.find((t) => t.id === defaultTargetId) || availableTargetTabs[0];
        const targetName = targetTab?.name || 'Kop Surat Resmi PT NMSA';
        const isTargetWithoutKop = targetTab?.isWithoutKop === true;
        setEditedNomorMemo(
          computeUpdatedNomorMemo(singleMemo.nomorMemo, targetName, isTargetWithoutKop)
        );
      }
    }
  }, [isOpen, memosToMove]);

  // Update preview number when selectedTargetTabId or shouldUpdateMemoNumber changes
  useEffect(() => {
    if (isSingle && singleMemo) {
      const targetTab = availableTargetTabs.find((t) => t.id === selectedTargetTabId) || availableTargetTabs[0];
      const targetName = targetTab?.name || 'Kop Surat Resmi PT NMSA';
      const isTargetWithoutKop = targetTab?.isWithoutKop === true;

      if (shouldUpdateMemoNumber) {
        setEditedNomorMemo(
          computeUpdatedNomorMemo(singleMemo.nomorMemo, targetName, isTargetWithoutKop)
        );
      } else {
        setEditedNomorMemo(singleMemo.nomorMemo);
      }
    }
  }, [selectedTargetTabId, shouldUpdateMemoNumber, isSingle, singleMemo]);

  if (!isOpen || memosToMove.length === 0) return null;

  const targetTab = availableTargetTabs.find((t) => t.id === selectedTargetTabId) || availableTargetTabs[0];
  const targetName = targetTab?.name || 'Kop Surat Resmi PT NMSA';
  const targetUrl = targetTab?.url || OFFICIAL_KOP_SURAT_IMAGE_URL;
  const isTargetWithoutKop = targetTab?.isWithoutKop === true;

  const handleSaveNewKopInline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKopName.trim() || !newKopUrl.trim()) return;

    const newLink: SavedKopSuratLink = {
      id: `kop-${Date.now()}`,
      name: newKopName.trim(),
      url: newKopUrl.trim(),
      isDefault: false,
      createdAt: new Date().toISOString(),
    };

    if (onAddNewKopLink) {
      onAddNewKopLink(newLink);
    }

    const newTabId = 'kop-' + newKopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setSelectedTargetTabId(newTabId);
    setIsAddingNewKop(false);
    setNewKopName('');
    setNewKopUrl('');
  };

  const handleSubmit = () => {
    onConfirmMove({
      targetKopName: targetName,
      targetKopUrl: isTargetWithoutKop ? '' : targetUrl,
      isWithoutKop: isTargetWithoutKop,
      targetTabId: targetTab?.id || 'kop-resmi-nmsa',
      updateMemoNumber: shouldUpdateMemoNumber,
      customNomorMemo: isSingle && editedNomorMemo.trim() ? editedNomorMemo.trim() : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <ArrowRightLeft size={18} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                Pindahkan Internal Memo ke Tab Kop Surat Lain
              </h3>
              <p className="text-xs text-amber-100 mt-0.5">
                Kelompokkan memo ke tab kop surat yang sesuai agar rapih &amp; tidak tercampur
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Detail Memo yang Akan Dipindahkan */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200">
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1.5">
              <FileText size={12} className="text-amber-700" />
              <span>
                {isSingle ? 'Memo yang Dipindahkan:' : `Memindahkan ${memosToMove.length} Memo Terpilih:`}
              </span>
            </div>

            {isSingle && singleMemo ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                    {singleMemo.nomorMemo}
                  </span>
                  <span className="text-xs text-stone-500">
                    {singleMemo.hariTanggalDisplay}
                  </span>
                  <span className="text-[10.5px] font-semibold text-stone-600 bg-white px-2 py-0.5 rounded border border-stone-200">
                    Kop Saat Ini: <strong className="text-stone-800">{singleMemo.showKopSurat === false ? 'Tanpa Kop Surat' : (singleMemo.companyHeaderName || 'Kop Surat Resmi PT NMSA')}</strong>
                  </span>
                </div>
                <div className="text-xs font-bold text-stone-900 line-clamp-2">
                  {singleMemo.perihal || '(Tanpa Perihal)'}
                </div>
                {(() => {
                  const nom = extractMemoNominal(singleMemo);
                  return nom.formatted ? (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                      <CreditCard size={12} className="text-emerald-600" />
                      <span>{nom.formatted}</span>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {memosToMove.map((m) => (
                  <div
                    key={m.id}
                    className="text-[11px] flex items-center justify-between gap-2 p-1.5 bg-white rounded-lg border border-stone-200"
                  >
                    <span className="font-mono font-bold text-amber-900 truncate">
                      {m.nomorMemo}
                    </span>
                    <span className="text-stone-600 truncate text-[10px] max-w-[200px]">
                      {m.perihal || 'Memo Internal'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PILIH TAB KOP SURAT TUJUAN */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <ImageIcon size={14} className="text-amber-600" />
                <span>Pilih Tab / Kop Surat Tujuan :</span>
              </label>
              <button
                type="button"
                onClick={() => setIsAddingNewKop(!isAddingNewKop)}
                className="text-[10.5px] font-bold text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus size={11} />
                <span>{isAddingNewKop ? 'Batal' : '+ Tambah Kop Surat Baru'}</span>
              </button>
            </div>

            {/* Form Tambah Kop Baru Inline */}
            {isAddingNewKop && (
              <div className="mb-3 p-3 bg-amber-50/70 rounded-xl border border-amber-200 space-y-2 animate-in fade-in duration-150">
                <div className="text-[11px] font-bold text-amber-950">
                  Tambah Pilihan Kop Surat Baru:
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-stone-600 font-semibold block mb-0.5">
                      Nama Kop Surat (e.g. Kop Surat PT Industri Padi Nusantara):
                    </label>
                    <input
                      type="text"
                      value={newKopName}
                      onChange={(e) => setNewKopName(e.target.value)}
                      placeholder="Contoh: Kop Surat PT Industri Padi Nusantara"
                      className="w-full text-xs p-1.5 border border-stone-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-600 font-semibold block mb-0.5">
                      Link Direct Gambar Kop Surat (URL Image / Google Drive direct):
                    </label>
                    <input
                      type="url"
                      value={newKopUrl}
                      onChange={(e) => setNewKopUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full text-xs p-1.5 border border-stone-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingNewKop(false)}
                    className="px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewKopInline}
                    disabled={!newKopName.trim() || !newKopUrl.trim()}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer transition shadow-2xs"
                  >
                    Simpan Kop Surat
                  </button>
                </div>
              </div>
            )}

            {/* List Pilihan Tab Kop Surat */}
            <div className="grid grid-cols-1 gap-2">
              {availableTargetTabs.map((tab) => {
                const isSelected = selectedTargetTabId === tab.id;
                return (
                  <div
                    key={tab.id}
                    onClick={() => setSelectedTargetTabId(tab.id)}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-400/30 shadow-xs'
                        : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-600 shrink-0 overflow-hidden">
                        {tab.isWithoutKop ? (
                          <FileText size={18} className="text-stone-500" />
                        ) : tab.url ? (
                          <img
                            src={tab.url}
                            alt={tab.name}
                            className="max-h-full max-w-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <ImageIcon size={18} className="text-amber-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {tab.icon && <span className="text-sm">{tab.icon}</span>}
                          <span className="font-bold text-xs text-stone-900 truncate">
                            {tab.shortName ? `${tab.shortName} (${tab.name})` : tab.name}
                          </span>
                          {tab.isDefault && (
                            <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                              Default
                            </span>
                          )}
                          {tab.isWithoutKop && (
                            <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 border border-stone-300">
                              Blanko Fisik
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 truncate mt-0.5">
                          {tab.isWithoutKop ? (
                            <span>Format nomor: <code className="font-mono font-bold text-stone-800">.../IM/KEU/...</code></span>
                          ) : (
                            <span>Kop Resmi • Format nomor: <code className="font-mono font-bold text-amber-900">.../{getPrefixFromKopName(tab.name)}/KEU/...</code></span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'border-stone-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* OPSI PENOMORAN MEMO */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-600" />
                <span>Format Nomor Internal Memo :</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shouldUpdateMemoNumber}
                  onChange={(e) => setShouldUpdateMemoNumber(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
                />
                <span className="text-[11px] font-semibold text-stone-700">
                  Sesuaikan Kode Nomor Memo
                </span>
              </label>
            </div>

            {shouldUpdateMemoNumber && isSingle && (
              <div className="space-y-1">
                <div className="text-[10.5px] text-stone-500">
                  Pratinjau Nomor Memo setelah dipindahkan (dapat diedit manual):
                </div>
                <input
                  type="text"
                  value={editedNomorMemo}
                  onChange={(e) => setEditedNomorMemo(e.target.value)}
                  className="w-full text-xs font-mono font-bold p-2 bg-white border border-amber-300 rounded-lg text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            )}

            {!isSingle && shouldUpdateMemoNumber && (
              <p className="text-[11px] text-stone-600 bg-white p-2 rounded-lg border border-stone-200">
                Semua {memosToMove.length} memo yang dipindahkan akan disesuaikan kode perusahaannya menjadi{' '}
                <strong className="text-amber-900 font-mono font-bold">
                  {isTargetWithoutKop ? '/IM/KEU/' : `/${getPrefixFromKopName(targetName)}/KEU/`}
                </strong>.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-stone-100 border-t border-stone-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl transition cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <ArrowRightLeft size={14} />
            <span>Pindahkan ke Tab {targetName}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

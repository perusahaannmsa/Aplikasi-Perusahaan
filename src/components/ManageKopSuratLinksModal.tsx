import React, { useState, useEffect } from 'react';
import { SavedKopSuratLink } from '../types';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ExternalLink,
  Copy,
  AlertCircle,
  Sparkles,
  Link as LinkIcon,
  CheckCircle2,
} from 'lucide-react';
import { OFFICIAL_KOP_SURAT_IMAGE_URL } from '../utils/memoUtils';

interface ManageKopSuratLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  links: SavedKopSuratLink[];
  onSaveLinks: (updated: SavedKopSuratLink[]) => void;
  activeUrl?: string;
  onSelectLink?: (link: SavedKopSuratLink) => void;
}

export const ManageKopSuratLinksModal: React.FC<ManageKopSuratLinksModalProps> = ({
  isOpen,
  onClose,
  links,
  onSaveLinks,
  activeUrl,
  onSelectLink,
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    setImageLoadError(false);
  }, [url]);

  if (!isOpen) return null;

  const handleStartEdit = (link: SavedKopSuratLink) => {
    setEditingId(link.id);
    setName(link.name);
    setUrl(link.url);
    setIsDefault(!!link.isDefault);
    setErrorMsg('');
    setImageLoadError(false);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setUrl('');
    setIsDefault(false);
    setErrorMsg('');
    setImageLoadError(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Nama / label kop surat wajib diisi (misal: "Kop Surat ANH" atau "Kop Surat Resmi").');
      return;
    }
    if (!url.trim()) {
      setErrorMsg('Alamat URL direct gambar kop surat wajib diisi.');
      return;
    }

    let updated: SavedKopSuratLink[];
    if (editingId) {
      updated = links.map((item) => {
        if (item.id === editingId) {
          return {
            ...item,
            name: name.trim(),
            url: url.trim(),
            isDefault,
          };
        }
        return isDefault ? { ...item, isDefault: false } : item;
      });
      setSuccessMsg('Kop surat berhasil diperbarui!');
    } else {
      const newLink: SavedKopSuratLink = {
        id: `kop-${Date.now()}`,
        name: name.trim(),
        url: url.trim(),
        isDefault,
        createdAt: new Date().toISOString(),
      };
      updated = isDefault
        ? [...links.map((item) => ({ ...item, isDefault: false })), newLink]
        : [...links, newLink];
      setSuccessMsg(`Kop surat "${name.trim()}" berhasil disimpan!`);
    }

    onSaveLinks(updated);
    handleCancelEdit();
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleDelete = (id: string, itemUrl: string) => {
    if (itemUrl === OFFICIAL_KOP_SURAT_IMAGE_URL) {
      setErrorMsg('Kop surat resmi default PT NMSA tidak dapat dihapus.');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    if (confirm('Apakah Anda yakin ingin menghapus pilihan kop surat ini?')) {
      const updated = links.filter((item) => item.id !== id);
      onSaveLinks(updated);
      if (editingId === id) handleCancelEdit();
      setSuccessMsg('Kop surat berhasil dihapus.');
      setTimeout(() => setSuccessMsg(''), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl my-auto flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-stone-900 to-amber-950 text-white flex items-center justify-between border-b border-amber-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-300 border border-amber-400/30">
              <ImageIcon size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>Kelola &amp; Simpan Link Kop Surat</span>
                <span className="text-[10px] font-mono font-bold bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full border border-amber-400/40">
                  {links.length} Pilihan
                </span>
              </h2>
              <p className="text-[11px] text-stone-300">
                Simpan link gambar kop surat dengan nama alias agar mudah dipilih di form memo.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-300 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
            title="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-bold text-red-700 animate-in fade-in">
            <AlertCircle size={15} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800 animate-in fade-in">
            <CheckCircle2 size={15} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Form: Tambah / Edit Link Kop Surat */}
          <form
            onSubmit={handleSubmit}
            className="bg-stone-50 border border-stone-200/90 rounded-xl p-4 space-y-3.5 shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-600" />
                <span>{editingId ? 'Edit Nama & Link Kop Surat' : 'Tambah / Simpan Link Kop Surat Baru'}</span>
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-[11px] text-stone-500 hover:text-stone-800 underline font-semibold cursor-pointer"
                >
                  Batal Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  Nama Alias Kop Surat <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Kop Surat ANH, Kop Surat Proyek A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <span className="text-[10px] text-stone-500 block mt-0.5">
                  Nama inilah yang akan tampil di kolom pilihan saat diklik.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  Direct Link / URL Gambar <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="https://... atau /kop-surat-nmsa-full.png"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <span className="text-[10px] text-stone-500 block mt-0.5">
                  Link gambar PNG/JPG kop surat resmi perusahaan.
                </span>
              </div>
            </div>

            {/* Live Image Preview Tester */}
            {url.trim() && (
              <div className="p-2.5 bg-white border border-stone-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-stone-600">
                  <span>Pratinjau Gambar Kop Surat:</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-0.5"
                  >
                    <span>Buka URL</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
                <div className="w-full bg-stone-100 rounded-lg p-2 border border-stone-200 flex items-center justify-center min-h-[50px] overflow-hidden">
                  {!imageLoadError ? (
                    <img
                      src={url}
                      alt="Pratinjau Kop Surat"
                      onError={() => setImageLoadError(true)}
                      className="max-h-16 w-auto object-contain mx-auto"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="text-center py-2 text-[11px] text-amber-700 font-medium">
                      ⚠️ Gambar belum dapat dimuat dari URL ini. Pastikan link direct gambar dapat diakses langsung.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-stone-700">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span>Jadikan kop surat default saat membuat memo</span>
              </label>

              <button
                type="submit"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {editingId ? <Check size={14} /> : <Plus size={14} />}
                <span>{editingId ? 'Simpan Perubahan' : 'Simpan Kop Surat'}</span>
              </button>
            </div>
          </form>

          {/* List of Saved Kop Surat Links */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-700">
              Daftar Link Kop Surat Tersimpan ({links.length})
            </h4>

            <div className="space-y-2">
              {links.map((item) => {
                const isActive = activeUrl && (activeUrl === item.url || (item.url === OFFICIAL_KOP_SURAT_IMAGE_URL && activeUrl.includes('kop-surat-nmsa-full.png')));
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      isActive
                        ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
                        : 'bg-white border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Thumbnail */}
                      <div className="w-20 h-10 bg-stone-100 border border-stone-200 rounded-lg p-1 shrink-0 flex items-center justify-center overflow-hidden">
                        <img
                          src={item.url}
                          alt={item.name}
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-stone-900 truncate">
                            {item.name}
                          </span>
                          {item.isDefault && (
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-200 shrink-0">
                              Default
                            </span>
                          )}
                          {isActive && (
                            <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0 flex items-center gap-0.5">
                              <Check size={10} /> Aktif Digunakan
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-stone-400 truncate mt-0.5" title={item.url}>
                          {item.url}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {onSelectLink && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectLink(item);
                            onClose();
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                            isActive
                              ? 'bg-emerald-600 text-white'
                              : 'bg-stone-900 hover:bg-black text-white'
                          }`}
                          title="Pilih kop surat ini untuk memo aktif"
                        >
                          <Check size={12} />
                          <span>{isActive ? 'Terpilih' : 'Pilih Ini'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const fullUrl = item.url.startsWith('http')
                            ? item.url
                            : `${window.location.origin}${item.url}`;
                          navigator.clipboard.writeText(fullUrl);
                          setSuccessMsg(`URL untuk "${item.name}" berhasil disalin!`);
                          setTimeout(() => setSuccessMsg(''), 2500);
                        }}
                        className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition cursor-pointer"
                        title="Salin URL gambar"
                      >
                        <Copy size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 text-stone-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                        title="Edit nama atau link"
                      >
                        <Edit2 size={13} />
                      </button>

                      {item.url !== OFFICIAL_KOP_SURAT_IMAGE_URL && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id, item.url)}
                          className="p-1.5 text-stone-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          title="Hapus kop surat"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs">
          <span className="text-stone-500 text-[11px]">
            Tersimpan di sistem &amp; browser Anda.
          </span>
          <button
            type="button"
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

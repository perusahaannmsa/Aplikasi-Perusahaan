import React, { useState } from 'react';
import { X, Save, RotateCcw, Check, UserCheck, Shield, Sparkles } from 'lucide-react';

export interface SignerConfigItem {
  title: string;
  name: string;
  role: string;
}

export interface SignerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  f1Signers: SignerConfigItem[];
  f2Signers: SignerConfigItem[];
  onSave: (newF1: SignerConfigItem[], newF2: SignerConfigItem[], saveAsDefault: boolean) => void;
  onReset: () => void;
}

export const SignerSettingsModal: React.FC<SignerSettingsModalProps> = ({
  isOpen,
  onClose,
  f1Signers,
  f2Signers,
  onSave,
  onReset,
}) => {
  const [localF1, setLocalF1] = useState<SignerConfigItem[]>(f1Signers);
  const [localF2, setLocalF2] = useState<SignerConfigItem[]>(f2Signers);
  const [activeTab, setActiveTab] = useState<'f1' | 'f2'>('f1');
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(true);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Sync when opened
  React.useEffect(() => {
    if (isOpen) {
      setLocalF1(f1Signers);
      setLocalF2(f2Signers);
    }
  }, [isOpen, f1Signers, f2Signers]);

  if (!isOpen) return null;

  const handleUpdateF1 = (index: number, field: keyof SignerConfigItem, value: string) => {
    setLocalF1((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleUpdateF2 = (index: number, field: keyof SignerConfigItem, value: string) => {
    setLocalF2((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleApplyPreset = (presetType: 'nmsa_standard' | 'direksi_utama' | 'operasional') => {
    if (presetType === 'nmsa_standard') {
      setLocalF1([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan' },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan' },
        { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur' },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan' },
      ]);
      setLocalF2([
        { title: 'Dibuat Oleh', name: 'Nur Wahyudi', role: 'Staff Keuangan' },
        { title: 'Diajukan', name: 'Sri Ekowati', role: 'Manager Keuangan' },
      ]);
    } else if (presetType === 'direksi_utama') {
      setLocalF1([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan' },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan' },
        { title: 'Diverifikasi', name: 'H. Andi Nursyam Halid', role: 'Direktur Utama' },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan' },
      ]);
      setLocalF2([
        { title: 'Dibuat Oleh', name: 'Nur Wahyudi', role: 'Staff Keuangan' },
        { title: 'Diajukan', name: 'Sri Ekowati', role: 'Manager Keuangan' },
      ]);
    } else if (presetType === 'operasional') {
      setLocalF1([
        { title: 'Dibuat Oleh', name: 'Staff Operasional', role: 'Koordinator Lapangan' },
        { title: 'Diperiksa', name: 'Sri Ekowati', role: 'Manager Keuangan' },
        { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur Operasional' },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan' },
      ]);
      setLocalF2([
        { title: 'Dibuat Oleh', name: 'Staff Operasional', role: 'Koordinator Lapangan' },
        { title: 'Diajukan', name: 'Sri Ekowati', role: 'Manager Keuangan' },
      ]);
    }
  };

  const handleSaveAndApply = () => {
    onSave(localF1, localF2, saveAsDefault);
    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
      onClose();
    }, 600);
  };

  const commonStatusPresets = [
    'Diajukan',
    'Diverifikasi',
    'Disetujui',
    'Dibuat Oleh',
    'Diperiksa',
    'Mengetahui',
    'Disahkan',
  ];

  const commonNamePresets = [
    { name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan' },
    { name: 'Sri Ekowati', role: 'Manager Keuangan' },
    { name: 'Andi Muhammad Rifki', role: 'Direktur' },
    { name: 'H. Andi Nursyam Halid', role: 'Direktur Utama' },
    { name: 'Harijon', role: 'Direktur Keuangan' },
    { name: 'Nur Wahyudi', role: 'Staff Keuangan' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto print:hidden">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-stone-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <UserCheck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Atur Nama, Jabatan & Status Penanda Tangan</h3>
              <p className="text-[11px] text-stone-400">
                Ubah secara manual agar tidak perlu mengetik ulang setiap saat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Presets & Tabs Toolbar */}
        <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2.5">
          {/* Tabs: F1 vs F2 */}
          <div className="flex bg-stone-200/70 p-1 rounded-xl gap-1">
            <button
              onClick={() => setActiveTab('f1')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                activeTab === 'f1'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Voucher F1 (4 Kolom)
            </button>
            <button
              onClick={() => setActiveTab('f2')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                activeTab === 'f2'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Formulir F2 HO (2 Kolom)
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-stone-500 font-mono">Preset Cepat:</span>
            <button
              onClick={() => handleApplyPreset('nmsa_standard')}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-white border border-stone-300 hover:border-amber-500 text-stone-700 rounded-md transition"
              title="Standar NMSA (Dhiya, Sri, Rifki, Harijon)"
            >
              Standar NMSA
            </button>
            <button
              onClick={() => handleApplyPreset('direksi_utama')}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-white border border-stone-300 hover:border-amber-500 text-stone-700 rounded-md transition"
              title="Direksi Utama (Dhiya, Sri, Nursyam, Harijon)"
            >
              Direktur Utama
            </button>
            <button
              onClick={() => handleApplyPreset('operasional')}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-white border border-stone-300 hover:border-amber-500 text-stone-700 rounded-md transition"
              title="Operasional Lapangan"
            >
              Operasional
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'f1' ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                  <Shield size={14} className="text-amber-600" />
                  Konfigurasi 4 Kolom Penanda Tangan Voucher F1
                </span>
                <span className="text-[11px] text-stone-500">
                  Tiap kolom diatur proporsional 25% (lebar tetap & rapi)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {localF1.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-stone-50/80 rounded-xl border border-stone-200/90 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between border-b border-stone-200/80 pb-1.5">
                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1">
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-black inline-flex items-center justify-center">
                          {idx + 1}
                        </span>
                        Kolom {idx + 1}
                      </span>
                      <span className="text-[10.5px] font-mono text-stone-500">Posisi #{idx + 1}</span>
                    </div>

                    {/* Status / Title */}
                    <div>
                      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                        Status / Judul Kolom:
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => handleUpdateF1(idx, 'title', e.target.value)}
                        placeholder="Contoh: Diajukan, Diverifikasi, Disetujui"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-amber-500 font-semibold"
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {commonStatusPresets.slice(0, 5).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleUpdateF1(idx, 'title', preset)}
                            className="px-1.5 py-0.5 text-[9.5px] bg-stone-200/70 hover:bg-amber-100 hover:text-amber-900 rounded text-stone-700 transition"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Nama */}
                    <div>
                      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                        Nama Lengkap:
                      </label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateF1(idx, 'name', e.target.value)}
                        placeholder="Contoh: Andi Dhiya Salsabila"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-amber-500 font-bold"
                      />
                    </div>

                    {/* Jabatan */}
                    <div>
                      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                        Jabatan / Posisi:
                      </label>
                      <input
                        type="text"
                        value={item.role}
                        onChange={(e) => handleUpdateF1(idx, 'role', e.target.value)}
                        placeholder="Contoh: Staff Keuangan, Manager Keuangan"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-amber-500 font-medium"
                      />
                    </div>

                    {/* Fast Fill Name Pill */}
                    <div className="pt-1 border-t border-stone-200/60">
                      <span className="text-[9.5px] font-semibold text-stone-400 block mb-1 font-mono">Pilih Cepat Nama & Jabatan:</span>
                      <div className="flex flex-wrap gap-1">
                        {commonNamePresets.map((p) => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => {
                              handleUpdateF1(idx, 'name', p.name);
                              handleUpdateF1(idx, 'role', p.role);
                            }}
                            className="px-1.5 py-0.5 text-[9.5px] bg-stone-100 hover:bg-amber-100 hover:text-amber-900 rounded text-stone-700 transition"
                          >
                            {p.name.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                  <Shield size={14} className="text-amber-600" />
                  Konfigurasi Penanda Tangan Formulir F2 (Dana HO)
                </span>
                <span className="text-[11px] text-stone-500">
                  Digunakan pada lembar F2 standar, compact, maupun eco
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {localF2.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-stone-50/80 rounded-xl border border-stone-200/90 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between border-b border-stone-200/80 pb-1.5">
                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1">
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-black inline-flex items-center justify-center">
                          {idx + 1}
                        </span>
                        Kolom {idx === 0 ? 'Kiri (Pembuat)' : 'Kanan (Penyetuju)'}
                      </span>
                    </div>

                    {/* Status */}
                    <div>
                      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                        Status / Judul:
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => handleUpdateF2(idx, 'title', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-amber-500 font-semibold"
                      />
                    </div>

                    {/* Nama */}
                    <div>
                      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                        Nama Lengkap:
                      </label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleUpdateF2(idx, 'name', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-amber-500 font-bold"
                      />
                    </div>

                    {/* Jabatan */}
                    <div>
                      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-stone-600 mb-1">
                        Jabatan:
                      </label>
                      <input
                        type="text"
                        value={item.role}
                        onChange={(e) => handleUpdateF2(idx, 'role', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-amber-500 font-medium"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-stone-50 border-t border-stone-200 px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="saveAsDefaultCheck"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300 cursor-pointer"
            />
            <label htmlFor="saveAsDefaultCheck" className="text-xs font-bold text-stone-800 cursor-pointer">
              Simpan sebagai Default Aplikasi (Tidak perlu diubah lagi setiap buka voucher)
            </label>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onReset}
              className="px-3 py-2 text-xs font-bold text-stone-600 hover:text-stone-900 bg-stone-200/70 hover:bg-stone-200 rounded-xl transition flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Reset Standar</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-bold text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 rounded-xl transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Save size={14} />
              <span>Terapkan Penanda Tangan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

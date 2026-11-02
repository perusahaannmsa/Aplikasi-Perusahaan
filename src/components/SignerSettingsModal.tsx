import React, { useState } from 'react';
import { X, Save, RotateCcw, UserCheck, Shield, CheckCircle2, Sliders, Plus, Trash2, Users } from 'lucide-react';

export interface SignerConfigItem {
  title: string;
  name: string;
  role: string;
  enabled?: boolean;
}

export interface SignerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  f1Signers: SignerConfigItem[];
  f2Signers: SignerConfigItem[];
  signatureStyle?: 'table' | 'line';
  onSave: (
    newF1: SignerConfigItem[],
    newF2: SignerConfigItem[],
    newStyle: 'table' | 'line',
    saveAsDefault: boolean
  ) => void;
  onReset: () => void;
}

export const DEFAULT_SIGNER_POOL: SignerConfigItem[] = [
  { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
  { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
  { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur', enabled: true },
  { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan', enabled: true },
  { title: 'Disetujui', name: 'H. Andi Nursyam Halid', role: 'Direktur Utama', enabled: true },
  { title: 'Mengetahui', name: 'Komisaris Perusahaan', role: 'Komisaris Utama', enabled: true },
  { title: 'Diperiksa', name: 'Internal Audit', role: 'Audit Internal', enabled: true },
  { title: 'Disahkan', name: 'Dewan Direksi', role: 'Dewan Direksi', enabled: true },
];

export const SignerSettingsModal: React.FC<SignerSettingsModalProps> = ({
  isOpen,
  onClose,
  f1Signers,
  f2Signers,
  signatureStyle = 'table',
  onSave,
  onReset,
}) => {
  const [localF1, setLocalF1] = useState<SignerConfigItem[]>(f1Signers);
  const [localF2, setLocalF2] = useState<SignerConfigItem[]>(f2Signers);
  const [localStyle, setLocalStyle] = useState<'table' | 'line'>(signatureStyle);
  const [activeTab, setActiveTab] = useState<'f1' | 'f2'>('f1');
  const [saveAsDefault, setSaveAsDefault] = useState<boolean>(true);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Sync when opened
  React.useEffect(() => {
    if (isOpen) {
      setLocalF1(
        (f1Signers && f1Signers.length > 0 ? f1Signers : DEFAULT_SIGNER_POOL.slice(0, 4)).map((s) => ({
          ...s,
          enabled: s.enabled !== false,
        }))
      );
      setLocalF2(
        f2Signers.map((s) => ({
          ...s,
          enabled: s.enabled !== false,
        }))
      );
      setLocalStyle(signatureStyle);
    }
  }, [isOpen, f1Signers, f2Signers, signatureStyle]);

  if (!isOpen) return null;

  const handleUpdateF1 = (index: number, field: keyof SignerConfigItem, value: any) => {
    setLocalF1((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleToggleF1Enabled = (index: number) => {
    setLocalF1((prev) => {
      const updated = [...prev];
      const current = updated[index]?.enabled !== false;
      updated[index] = { ...updated[index], enabled: !current };
      return updated;
    });
  };

  const handleSetSignerCountF1 = (count: number) => {
    setLocalF1((prev) => {
      let updated = [...prev];
      // Expand array if needed up to count
      while (updated.length < count && updated.length < DEFAULT_SIGNER_POOL.length) {
        const nextDefault = DEFAULT_SIGNER_POOL[updated.length];
        updated.push({ ...nextDefault, enabled: true });
      }

      if (count === 2) {
        // Kolom 1 (Diajukan) dan Kolom 4 (Disetujui) atau kolom pertama dan terakhir
        return updated.map((s, idx) => ({
          ...s,
          enabled: idx === 0 || idx === (updated.length >= 4 ? 3 : updated.length - 1),
        }));
      } else if (count === 3) {
        // Kolom 1, 2, 4 aktif
        return updated.map((s, idx) => ({
          ...s,
          enabled: idx === 0 || idx === 1 || idx === (updated.length >= 4 ? 3 : 2),
        }));
      } else {
        // count = 4, 5, 6, 7, 8
        return updated.map((s, idx) => ({
          ...s,
          enabled: idx < count,
        }));
      }
    });
  };

  const handleAddSignerF1 = () => {
    setLocalF1((prev) => {
      if (prev.length >= 8) return prev;
      const nextIdx = prev.length;
      const defaultData = DEFAULT_SIGNER_POOL[nextIdx] || {
        title: 'Mengetahui',
        name: 'Penanda Tangan Baru',
        role: 'Jabatan',
        enabled: true,
      };
      return [...prev, { ...defaultData, enabled: true }];
    });
  };

  const handleRemoveSignerF1 = (index: number) => {
    setLocalF1((prev) => {
      if (prev.length <= 2) return prev; // Minimal 2 kolom tersisa
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleUpdateF2 = (index: number, field: keyof SignerConfigItem, value: any) => {
    setLocalF2((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleToggleF2Enabled = (index: number) => {
    setLocalF2((prev) => {
      const updated = [...prev];
      const current = updated[index]?.enabled !== false;
      updated[index] = { ...updated[index], enabled: !current };
      return updated;
    });
  };

  const handleSyncF2WithF1 = () => {
    // Dynamically match F2 signers with F1 voucher signers
    const firstF1 = localF1[0] || { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan' };
    const secondF1 = localF1[1] || { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan' };
    setLocalF2([
      { title: firstF1.title || 'Diajukan', name: firstF1.name, role: firstF1.role, enabled: true },
      { title: secondF1.title || 'Diverifikasi', name: secondF1.name, role: secondF1.role, enabled: false }, // 2nd signer disabled by default
    ]);
  };

  const handleApplyPreset = (presetType: 'nmsa_standard' | 'direksi_utama' | '5_penanda_tangan' | '6_penanda_tangan' | '8_penanda_tangan' | 'operasional') => {
    if (presetType === 'nmsa_standard') {
      setLocalF1([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur', enabled: true },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan', enabled: true },
      ]);
      setLocalF2([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: false },
      ]);
    } else if (presetType === '5_penanda_tangan') {
      // 4 di atas + 1 di bawah tengah (Direktur Utama)
      setLocalF1([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur', enabled: true },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan', enabled: true },
        { title: 'Disetujui', name: 'H. Andi Nursyam Halid', role: 'Direktur Utama', enabled: true },
      ]);
      setLocalF2([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: false },
      ]);
    } else if (presetType === '6_penanda_tangan') {
      // 4 di atas + 2 di bawah tengah
      setLocalF1([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur', enabled: true },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan', enabled: true },
        { title: 'Disetujui', name: 'H. Andi Nursyam Halid', role: 'Direktur Utama', enabled: true },
        { title: 'Mengetahui', name: 'Komisaris Perusahaan', role: 'Komisaris Utama', enabled: true },
      ]);
      setLocalF2([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: false },
      ]);
    } else if (presetType === '8_penanda_tangan') {
      // 4 di atas + 4 di bawah sejajar
      setLocalF1([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur', enabled: true },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan', enabled: true },
        { title: 'Disetujui', name: 'H. Andi Nursyam Halid', role: 'Direktur Utama', enabled: true },
        { title: 'Mengetahui', name: 'Komisaris Perusahaan', role: 'Komisaris Utama', enabled: true },
        { title: 'Diperiksa', name: 'Internal Audit', role: 'Audit Internal', enabled: true },
        { title: 'Disahkan', name: 'Dewan Direksi', role: 'Dewan Direksi', enabled: true },
      ]);
      setLocalF2([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: false },
      ]);
    } else if (presetType === 'direksi_utama') {
      setLocalF1([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'H. Andi Nursyam Halid', role: 'Direktur Utama', enabled: true },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan', enabled: true },
      ]);
      setLocalF2([
        { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: false },
      ]);
    } else if (presetType === 'operasional') {
      setLocalF1([
        { title: 'Dibuat Oleh', name: 'Staff Operasional', role: 'Koordinator Lapangan', enabled: true },
        { title: 'Diperiksa', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
        { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur Operasional', enabled: true },
        { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan', enabled: true },
      ]);
      setLocalF2([
        { title: 'Dibuat Oleh', name: 'Staff Operasional', role: 'Koordinator Lapangan', enabled: true },
        { title: 'Diajukan', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: false },
      ]);
    }
  };

  const handleSaveAndApply = () => {
    onSave(localF1, localF2, localStyle, saveAsDefault);
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
    { name: 'Komisaris Perusahaan', role: 'Komisaris Utama' },
    { name: 'Internal Audit', role: 'Audit Internal' },
  ];

  const activeF1Count = localF1.filter((s) => s.enabled !== false).length;
  const activeF2Count = localF2.filter((s) => s.enabled !== false).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto print:hidden">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="bg-stone-900 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <UserCheck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Atur Nama, Jabatan & Penanda Tangan (2 - 8 Kolom)</h3>
              <p className="text-[11px] text-stone-400">
                Tambah hingga 8 penanda tangan. Kolom 5-8 otomatis diposisikan simetris di baris bawah dengan ukuran kotak sama persis.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition cursor-pointer"
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
              className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'f1'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>Voucher F1</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeF1Count >= 5
                  ? 'bg-purple-100 text-purple-800'
                  : activeF1Count === 4
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {activeF1Count} Kolom
              </span>
            </button>
            <button
              onClick={() => setActiveTab('f2')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'f2'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>Formulir F2 HO</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-black bg-stone-200 text-stone-700">
                {activeF2Count} Kolom
              </span>
            </button>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-stone-500 font-mono">Preset Cepat:</span>
            <button
              onClick={() => handleApplyPreset('nmsa_standard')}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-white border border-stone-300 hover:border-amber-500 text-stone-700 rounded-md transition cursor-pointer"
              title="Standar NMSA (4 Kolom)"
            >
              Standar 4 Kolom
            </button>
            <button
              onClick={() => handleApplyPreset('5_penanda_tangan')}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-white border border-stone-300 hover:border-amber-500 text-stone-700 rounded-md transition cursor-pointer"
              title="5 Kolom (4 di atas + 1 Direktur Utama di bawah tengah)"
            >
              5 Kolom (+ Dirut Bawah)
            </button>
            <button
              onClick={() => handleApplyPreset('6_penanda_tangan')}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-white border border-stone-300 hover:border-amber-500 text-stone-700 rounded-md transition cursor-pointer"
              title="6 Kolom (4 di atas + 2 di bawah tengah)"
            >
              6 Kolom (Direksi)
            </button>
            <button
              onClick={() => handleApplyPreset('8_penanda_tangan')}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-white border border-stone-300 hover:border-amber-500 text-stone-700 rounded-md transition cursor-pointer"
              title="8 Kolom (4 di atas + 4 di bawah sejajar)"
            >
              8 Kolom (Lengkap)
            </button>
            <button
              onClick={() => handleApplyPreset('operasional')}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-white border border-stone-300 hover:border-amber-500 text-stone-700 rounded-md transition cursor-pointer"
              title="Operasional Lapangan"
            >
              Operasional
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* FORMAT TAMPILAN: KOTAK PENANDA TANGAN VS HANYA GARIS SAJA */}
          <div className="bg-amber-50/60 border border-amber-200/90 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs">
            <div>
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Sliders size={14} className="text-amber-600" />
                Format Tampilan Penanda Tangan:
              </span>
              <p className="text-[11px] text-stone-600 mt-0.5">
                Pilih apakah menggunakan kotak bergaris tertutup atau garis bawah terbuka seperti biasa
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-amber-300 shadow-3xs shrink-0">
              <button
                type="button"
                onClick={() => setLocalStyle('table')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  localStyle === 'table'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <span>▦</span>
                <span>Kotak Penanda Tangan</span>
              </button>
              <button
                type="button"
                onClick={() => setLocalStyle('line')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer ${
                  localStyle === 'line'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <span>━</span>
                <span>Hanya Garis Saja</span>
              </button>
            </div>
          </div>

          {activeTab === 'f1' ? (
            <div className="space-y-3.5">
              {/* Top Controls: Active Column Count Quick Select + Add Signer Button */}
              <div className="bg-stone-100/90 p-3 rounded-xl border border-stone-200/90 space-y-2.5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-stone-800 flex items-center gap-1">
                      <Users size={14} className="text-amber-600" />
                      Jumlah Kolom:
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleSetSignerCountF1(num)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                            activeF1Count === num
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 hover:border-amber-400'
                          }`}
                          title={`Atur tepat ${num} kolom penanda tangan aktif`}
                        >
                          <span>{num} Kolom</span>
                          {num > 4 && (
                            <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${activeF1Count === num ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-600'}`}>
                              (2 Baris)
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Button "+ Tambah Penanda Tangan" */}
                  <button
                    type="button"
                    onClick={handleAddSignerF1}
                    disabled={localF1.length >= 8}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      localF1.length >= 8
                        ? 'bg-stone-200 text-stone-400 border border-stone-300 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                    }`}
                    title={localF1.length >= 8 ? 'Maksimal 8 penanda tangan' : 'Tambah penanda tangan baru ke baris bawah'}
                  >
                    <Plus size={13} />
                    <span>+ Tambah Penanda Tangan {localF1.length < 8 ? `(${localF1.length + 1})` : ''}</span>
                  </button>
                </div>

                {/* Info Banner on placement and box sizes */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] gap-2 pt-1 border-t border-stone-200/70">
                  <div className="flex items-center gap-1.5 text-stone-700 flex-wrap">
                    <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                      {activeF1Count} Penanda Tangan Aktif
                    </span>
                    <span className="font-medium text-stone-600">
                      {activeF1Count <= 4
                        ? `(Baris 1: ${(100 / Math.max(1, activeF1Count)).toFixed(0)}% lebar per kotak)`
                        : `(Baris 1: 4 kotak sejajar + Baris 2: ${activeF1Count - 4} kotak di bawah posisi tengah, ukuran kotak 25% sama persis)`}
                    </span>
                  </div>
                  <span className="text-stone-500 font-mono text-[10.5px]">
                    Total Kolom Terkonfigurasi: {localF1.length} / 8
                  </span>
                </div>
              </div>

              {/* Columns Configuration Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {localF1.map((item, idx) => {
                  const isEnabled = item.enabled !== false;
                  const isRow2 = idx >= 4;
                  return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border shadow-2xs space-y-2.5 transition relative ${
                        isEnabled
                          ? isRow2
                            ? 'bg-amber-50/50 border-amber-200/90'
                            : 'bg-stone-50/80 border-stone-200/90'
                          : 'bg-stone-100/70 border-dashed border-stone-300 opacity-60'
                      }`}
                    >
                      {/* Card Header with row info & buttons */}
                      <div className="flex items-center justify-between border-b border-stone-200/80 pb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-5 h-5 rounded-full text-white text-[11px] font-black inline-flex items-center justify-center ${
                              isEnabled ? (isRow2 ? 'bg-amber-600' : 'bg-amber-500') : 'bg-stone-400'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-stone-900">
                            Kolom {idx + 1}
                          </span>
                          <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                            isRow2
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-stone-200 text-stone-700'
                          }`}>
                            {isRow2 ? `Baris 2 (Bawah #${idx - 3})` : 'Baris 1 (Atas)'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Toggle Aktif / Nonaktif */}
                          <button
                            type="button"
                            onClick={() => handleToggleF1Enabled(idx)}
                            className={`px-2 py-0.5 text-[10.5px] font-bold rounded-md transition flex items-center gap-1 cursor-pointer ${
                              isEnabled
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-stone-200 text-stone-600 border border-stone-300 hover:bg-stone-300'
                            }`}
                            title={isEnabled ? 'Klik untuk menonaktifkan kolom ini' : 'Klik untuk mengaktifkan kolom ini'}
                          >
                            {isEnabled ? (
                              <>
                                <CheckCircle2 size={12} className="text-emerald-700" />
                                <span>Aktif</span>
                              </>
                            ) : (
                              <>
                                <X size={12} className="text-stone-500" />
                                <span>Nonaktif</span>
                              </>
                            )}
                          </button>

                          {/* Delete Button (for extra columns beyond 4, or if user added columns) */}
                          {localF1.length > 4 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSignerF1(idx)}
                              className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                              title="Hapus kolom penanda tangan ini"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {!isEnabled && (
                        <div className="p-1.5 bg-stone-200/60 rounded text-[10.5px] text-stone-600 italic text-center">
                          Kolom ini dinonaktifkan dan tidak akan ditampilkan pada cetakan voucher.
                        </div>
                      )}

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
                          {commonStatusPresets.slice(0, 6).map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleUpdateF1(idx, 'title', preset)}
                              className="px-1.5 py-0.5 text-[9.5px] bg-stone-200/70 hover:bg-amber-100 hover:text-amber-900 rounded text-stone-700 transition cursor-pointer"
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
                        <span className="text-[9.5px] font-semibold text-stone-400 block mb-1 font-mono">
                          Pilih Cepat Nama & Jabatan:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {commonNamePresets.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => {
                                handleUpdateF1(idx, 'name', p.name);
                                handleUpdateF1(idx, 'role', p.role);
                              }}
                              className="px-1.5 py-0.5 text-[9.5px] bg-stone-100 hover:bg-amber-100 hover:text-amber-900 rounded text-stone-700 transition cursor-pointer"
                            >
                              {p.name.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                    <Shield size={14} className="text-amber-600" />
                    Konfigurasi Penanda Tangan Formulir F2 (Dana HO)
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Menyesuaikan tanda tangan dengan voucher di aplikasi
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSyncF2WithF1}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                    title="Samakan nama & jabatan penanda tangan F2 dengan F1 voucher"
                  >
                    <span>🔄 Samakan dgn Voucher F1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalF2(prev => [
                        { ...prev[0], enabled: true },
                        { ...prev[1], enabled: false }
                      ]);
                    }}
                    className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                    title="Hapus penanda tangan ke-2 agar hanya ada 1 kolom penanda tangan"
                  >
                    <span>🚫 Hapus Penanda Tangan Ke-2</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {localF2.map((item, idx) => {
                  const isEnabled = item.enabled !== false;
                  return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border shadow-2xs space-y-2.5 transition ${
                        isEnabled
                          ? 'bg-stone-50/80 border-stone-200/90'
                          : 'bg-stone-100/70 border-dashed border-stone-300 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-stone-200/80 pb-1.5">
                        <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                          <span
                            className={`w-5 h-5 rounded-full text-white text-[11px] font-black inline-flex items-center justify-center ${
                              isEnabled ? 'bg-amber-500' : 'bg-stone-400'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          Kolom {idx === 0 ? 'Kiri (Pembuat)' : 'Kanan (Penyetuju)'}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleToggleF2Enabled(idx)}
                          className={`px-2 py-0.5 text-[10.5px] font-bold rounded-md transition flex items-center gap-1 cursor-pointer ${
                            isEnabled
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                              : 'bg-stone-200 text-stone-600 border border-stone-300 hover:bg-stone-300'
                          }`}
                        >
                          {isEnabled ? (
                            <>
                              <CheckCircle2 size={12} className="text-emerald-700" />
                              <span>Aktif</span>
                            </>
                          ) : (
                            <>
                              <X size={12} className="text-stone-500" />
                              <span>Nonaktif</span>
                            </>
                          )}
                        </button>
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
                  );
                })}
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
              Simpan sebagai Default Aplikasi (Format & Pilihan Nama Tersimpan)
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

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Check, 
  ChevronRight, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  FileText, 
  MapPin, 
  PenTool, 
  ArrowRight,
  Database,
  RefreshCw,
  FolderTree
} from 'lucide-react';
import { CompanyProfile } from '../types';
import { 
  loadAllCompaniesFromFirestore, 
  saveCompanyProfileToFirestore, 
  getCompanyProfileFromFirestore 
} from '../firebase';

interface CompanySwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCompanyId: string;
  onSelectCompany: (companyId: string, companyName: string) => Promise<void>;
  currentUserName?: string;
}

export const CompanySwitcherModal: React.FC<CompanySwitcherModalProps> = ({
  isOpen,
  onClose,
  currentCompanyId,
  onSelectCompany,
  currentUserName = 'Nur Wahyudi'
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State for creating a new company
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newLogoUrl, setNewLogoUrl] = useState('');
  const [newPrefix, setNewPrefix] = useState('');
  const [newLokasi, setNewLokasi] = useState('Lt. 1');
  const [newJenis, setNewJenis] = useState('Operasional Kantor');
  
  // Signatures State with the latest company structure
  const [sigDibuat, setSigDibuat] = useState(currentUserName || 'Nur Wahyudi');
  const [sigDibuatJabatan, setSigDibuatJabatan] = useState('Staff Operasional');
  const [sigAccounting, setSigAccounting] = useState('Sri Ekowati');
  const [sigAccountingJabatan, setSigAccountingJabatan] = useState('Manager Keuangan');
  const [sigDiverifikasi, setSigDiverifikasi] = useState('Andi Muhammad Rifki');
  const [sigDiverifikasiJabatan, setSigDiverifikasiJabatan] = useState('Direktur');
  const [sigDisetujui, setSigDisetujui] = useState('Harijon');
  const [sigDisetujuiJabatan, setSigDisetujuiJabatan] = useState('Direktur Keuangan');
  const [sigMengetahui, setSigMengetahui] = useState('ABDUL AZIZ HALID');
  const [sigMengetahuiJabatan, setSigMengetahuiJabatan] = useState('Direktur Operasional');
  const [sigDirektur, setSigDirektur] = useState('H. Andi Nursyam Halid');
  const [sigDirekturJabatan, setSigDirekturJabatan] = useState('Direktur Utama');

  // Load companies from Firestore on open
  const fetchCompanies = async () => {
    setIsLoading(true);
    setFeedbackMsg(null);
    try {
      const data = await loadAllCompaniesFromFirestore();
      
      // Ensure default NMSA exists in list
      const nmsaExists = data.some(c => (c.id || '').toLowerCase() === 'nmsa');
      const fullList: CompanyProfile[] = [...data];
      
      if (!nmsaExists) {
        fullList.unshift({
          id: 'nmsa',
          code: 'NMSA',
          name: 'PT Nusantara Mineral Sukses Abadi',
          fullName: 'PT. Nusantara Mineral Sukses Abadi',
          displayName: 'PT Nusantara Mineral Sukses Abadi',
          defaultJenis: 'Operasional Kantor',
          defaultKode: 'BKK-NMSA/V/2026/10001',
          defaultLokasi: 'Lt. 1',
          no_invoice_prefix: 'BKK-NMSA',
          sigDibuat: 'Nur Wahyudi',
          sigDibuatJabatan: 'Staff Operasional',
          sigAccounting: 'Sri Ekowati',
          sigAccountingJabatan: 'Manager Keuangan',
          sigDiverifikasi: 'Andi Muhammad Rifki',
          sigDiverifikasiJabatan: 'Direktur',
          sigDisetujui: 'Harijon',
          sigDisetujuiJabatan: 'Direktur Keuangan',
          sigMengetahui: 'ABDUL AZIZ HALID',
          sigMengetahuiJabatan: 'Direktur Operasional',
          sigDirektur: 'H. Andi Nursyam Halid',
          sigDirekturJabatan: 'Direktur Utama',
          sigDirKeuangan: 'Harijon',
          sigKeuangan: 'Sri Ekowati',
          icon: '🏢',
          isActive: true
        });
      }

      setCompanies(fullList);
    } catch (err) {
      console.error('Gagal memuat daftar perusahaan:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCompanies();
      setActiveTab('list');
      setFeedbackMsg(null);
    }
  }, [isOpen]);

  // Auto-sync code to prefix
  const handleCodeChange = (val: string) => {
    const cleanUpper = val.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    setNewCode(cleanUpper);
    if (cleanUpper) {
      setNewPrefix(`BKK-${cleanUpper}`);
      if (!newDisplayName && newName) {
        setNewDisplayName(`${newName} (${cleanUpper})`);
      }
    }
  };

  const handleNameChange = (val: string) => {
    setNewName(val);
    if (!newDisplayName && val) {
      setNewDisplayName(val);
    }
  };

  // Submit new company creation
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Kode singkatan perusahaan harus diisi (contoh: PBM, BBM).' });
      return;
    }
    if (!newName.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Nama perusahaan harus diisi.' });
      return;
    }

    const cleanId = newCode.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
    
    // Check if ID already exists
    if (companies.some(c => (c.id || '').toLowerCase() === cleanId)) {
      setFeedbackMsg({ type: 'error', text: `Perusahaan dengan kode [${newCode.toUpperCase()}] sudah terdaftar.` });
      return;
    }

    setIsSaving(true);
    setFeedbackMsg(null);

    const payload: Partial<CompanyProfile> = {
      id: cleanId,
      code: newCode.toUpperCase(),
      name: newName.trim(),
      fullName: newName.trim(),
      displayName: newDisplayName.trim() || newName.trim(),
      logoUrl: newLogoUrl.trim(),
      defaultJenis: newJenis,
      defaultKode: `${newPrefix || `BKK-${newCode.toUpperCase()}`}/V/2026/10001`,
      defaultLokasi: newLokasi,
      no_invoice_prefix: newPrefix || `BKK-${newCode.toUpperCase()}`,
      sigDibuat: sigDibuat.trim() || currentUserName || 'Nur Wahyudi',
      sigDibuatJabatan: sigDibuatJabatan.trim() || 'Staff Operasional',
      sigAccounting: sigAccounting.trim() || 'Sri Ekowati',
      sigAccountingJabatan: sigAccountingJabatan.trim() || 'Manager Keuangan',
      sigDiverifikasi: sigDiverifikasi.trim() || 'Andi Muhammad Rifki',
      sigDiverifikasiJabatan: sigDiverifikasiJabatan.trim() || 'Direktur',
      sigDisetujui: sigDisetujui.trim() || 'Harijon',
      sigDisetujuiJabatan: sigDisetujuiJabatan.trim() || 'Direktur Keuangan',
      sigMengetahui: sigMengetahui.trim() || 'ABDUL AZIZ HALID',
      sigMengetahuiJabatan: sigMengetahuiJabatan.trim() || 'Direktur Operasional',
      sigDirektur: sigDirektur.trim() || 'H. Andi Nursyam Halid',
      sigDirekturJabatan: sigDirekturJabatan.trim() || 'Direktur Utama',
      sigDirKeuangan: sigDisetujui.trim() || 'Harijon',
      sigKeuangan: sigAccounting.trim() || 'Sri Ekowati',
      icon: '🏢',
      isActive: true,
      createdAt: new Date().toISOString()
    };

    try {
      await saveCompanyProfileToFirestore(payload);
      setFeedbackMsg({ 
        type: 'success', 
        text: `Perusahaan "${newName}" berhasil ditambahkan & diaktifkan!` 
      });

      // Reset form
      setNewCode('');
      setNewName('');
      setNewDisplayName('');
      setNewLogoUrl('');
      setNewPrefix('');

      // Refresh list
      await fetchCompanies();

      // Immediately switch to the newly created company!
      await onSelectCompany(cleanId, newName.trim());
      
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.warn('Simpan ke Firestore peringatan, aktifkan via cache lokal:', err);
      try {
        await onSelectCompany(cleanId, newName.trim());
        setFeedbackMsg({ 
          type: 'success', 
          text: `Perusahaan "${newName}" berhasil dibuat dan diaktifkan!` 
        });
        setTimeout(() => {
          onClose();
        }, 1000);
      } catch (innerErr: any) {
        setFeedbackMsg({ 
          type: 'error', 
          text: err?.message || 'Gagal menyimpan perusahaan. Silakan coba lagi.' 
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Switch company handler
  const handleSwitchCompany = async (company: CompanyProfile) => {
    const compId = (company.id || company.code || '').toLowerCase().trim();
    if (compId === currentCompanyId.toLowerCase().trim()) {
      return; // Already active
    }

    setSwitchingId(compId);
    setFeedbackMsg(null);
    try {
      await onSelectCompany(compId, company.name || company.fullName || compId.toUpperCase());
      setFeedbackMsg({
        type: 'success',
        text: `Berhasil beralih ke "${company.name || company.code}". Data transaksi kini disesuaikan secara terpisah.`
      });
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      console.error('Gagal beralih perusahaan:', err);
      setFeedbackMsg({
        type: 'error',
        text: err?.message || 'Gagal beralih perusahaan. Coba lagi.'
      });
    } finally {
      setSwitchingId(null);
    }
  };

  if (!isOpen) return null;

  const activeCompLower = currentCompanyId.toLowerCase().trim();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div 
        className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-5 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold text-white tracking-tight flex items-center gap-2">
                Kelola &amp; Pilih Perusahaan
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Multi-Tenant Firebase
                </span>
              </h2>
              <p className="text-xs text-stone-400 font-sans">
                Setiap perusahaan memiliki database transaksi, nomor voucher, dan folder Drive terpisah.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center transition cursor-pointer font-bold"
            title="Tutup dialog"
          >
            ✕
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-stone-200 bg-stone-50 px-6 pt-3 gap-2">
          <button
            onClick={() => { setActiveTab('list'); setFeedbackMsg(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 font-sans font-bold text-xs rounded-t-xl transition border-t-2 border-x-2 -mb-[1px] cursor-pointer ${
              activeTab === 'list'
                ? 'bg-white border-stone-200 border-t-amber-600 text-stone-900 shadow-xs'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Building2 size={14} className={activeTab === 'list' ? 'text-amber-600' : 'text-stone-400'} />
            <span>Daftar Perusahaan ({companies.length})</span>
          </button>
          
          <button
            onClick={() => { setActiveTab('add'); setFeedbackMsg(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 font-sans font-bold text-xs rounded-t-xl transition border-t-2 border-x-2 -mb-[1px] cursor-pointer ${
              activeTab === 'add'
                ? 'bg-white border-stone-200 border-t-amber-600 text-stone-900 shadow-xs'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Plus size={14} className={activeTab === 'add' ? 'text-amber-600' : 'text-stone-400'} />
            <span>Tambah Perusahaan Baru</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div className={`mx-6 mt-4 p-3.5 rounded-xl border text-xs font-sans flex items-start gap-2.5 animate-in fade-in ${
            feedbackMsg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            {feedbackMsg.type === 'success' ? (
              <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="font-medium">{feedbackMsg.text}</div>
          </div>
        )}

        {/* Tab 1: List of Companies */}
        {activeTab === 'list' && (
          <div className="p-6 overflow-y-auto flex-1 space-y-3">
            <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
              <span>Pilih perusahaan untuk memuat data pengajuan dan voucher spesifik:</span>
              <button 
                onClick={fetchCompanies}
                disabled={isLoading}
                className="flex items-center gap-1 text-amber-700 hover:text-amber-800 font-semibold cursor-pointer"
                title="Muat ulang daftar perusahaan dari Firestore"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                <span>Segarkan</span>
              </button>
            </div>

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-500">
                <Loader2 size={24} className="animate-spin text-amber-600" />
                <span className="text-xs font-sans">Memuat daftar perusahaan dari Firestore...</span>
              </div>
            ) : companies.length === 0 ? (
              <div className="py-10 text-center text-stone-500 border-2 border-dashed border-stone-200 rounded-2xl p-6">
                <Building2 size={32} className="mx-auto text-stone-300 mb-2" />
                <p className="text-xs font-sans">Belum ada perusahaan terdaftar.</p>
                <button
                  onClick={() => setActiveTab('add')}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Tambah Perusahaan Sekarang</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {companies.map((comp) => {
                  const compId = (comp.id || comp.code || '').toLowerCase().trim();
                  const isActive = compId === activeCompLower;
                  const isSwitching = switchingId === compId;

                  return (
                    <div
                      key={compId}
                      className={`p-4 rounded-2xl border transition-all ${
                        isActive
                          ? 'bg-amber-50/50 border-amber-400 ring-2 ring-amber-400/20 shadow-xs'
                          : 'bg-white border-stone-200 hover:border-stone-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 overflow-hidden ${
                            isActive 
                              ? 'bg-white border-2 border-amber-500 shadow-3xs' 
                              : 'bg-stone-50 text-stone-700 border border-stone-200'
                          }`}>
                            {comp.logoUrl ? (
                              <img
                                src={comp.logoUrl}
                                alt={comp.name || compId}
                                className="w-9 h-9 object-contain"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              comp.icon || '🏢'
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-stone-900 font-sans">
                                {comp.name || comp.fullName || compId.toUpperCase()}
                              </h3>
                              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-stone-700">
                                {comp.code || compId.toUpperCase()}
                              </span>
                              {isActive && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <Check size={10} />
                                  Sedang Digunakan
                                </span>
                              )}
                            </div>

                            {/* Metadata Pills */}
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-stone-500 font-sans flex-wrap">
                              <span className="flex items-center gap-1">
                                <FileText size={11} className="text-stone-400" />
                                Prefix: <code className="text-stone-700 font-mono font-semibold">{comp.no_invoice_prefix || `BKK-${comp.code}`}</code>
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin size={11} className="text-stone-400" />
                                Lokasi: <span className="text-stone-700">{comp.defaultLokasi || 'Lt. 1'}</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <PenTool size={11} className="text-stone-400" />
                                Disetujui: <span className="text-stone-700">{comp.sigDisetujui || 'Harijon'}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Button */}
                        <div className="flex items-center gap-2 sm:self-center shrink-0">
                          {isActive ? (
                            <span className="text-xs font-bold text-amber-800 bg-amber-100/70 border border-amber-300 px-3 py-1.5 rounded-xl flex items-center gap-1">
                              <Check size={14} className="text-amber-700" />
                              <span>Aktif</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSwitchCompany(comp)}
                              disabled={isSwitching}
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-400 text-white font-sans font-bold text-xs rounded-xl transition shadow-3xs cursor-pointer"
                            >
                              {isSwitching ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" />
                                  <span>Memuat Data...</span>
                                </>
                              ) : (
                                <>
                                  <span>Gunakan Perusahaan</span>
                                  <ArrowRight size={13} />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Explanatory note */}
            <div className="mt-4 p-3.5 bg-stone-50 border border-stone-200 rounded-2xl flex items-start gap-2.5 text-stone-600 text-xs">
              <Database size={16} className="text-stone-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-stone-800">Pemisahan Ruang Kerja Firestore:</span> Saat Anda beralih perusahaan, seluruh daftar pengajuan, riwayat cetak, nomor otomatis voucher (BKK), dan folder Google Drive akan sepenuhnya diisolasi per perusahaan.
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Create New Company */}
        {activeTab === 'add' && (
          <form onSubmit={handleCreateCompany} className="p-6 overflow-y-auto flex-1 space-y-4">
            <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-2xl text-amber-900 text-xs flex items-start gap-2">
              <FolderTree size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Pembuatan Entitas Perusahaan Baru:</strong> Perusahaan baru akan dibuatkan dokumen metadata mandiri di Firestore (<code className="bg-amber-100 px-1 py-0.2 rounded font-mono">companies/{'{id}'}</code>). Seluruh voucher transaksi baru akan tersimpan dengan <code className="bg-amber-100 px-1 py-0.2 rounded font-mono">companyId</code> terpisah.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Kode Perusahaan */}
              <div>
                <label className="block text-xs font-bold text-stone-800 font-sans mb-1">
                  Kode Singkatan Perusahaan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: PBM, BBM, KPA, NMSA2"
                  value={newCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 uppercase"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">Digunakan sebagai ID &amp; penomoran folder Drive.</span>
              </div>

              {/* Prefix Nomor Voucher */}
              <div>
                <label className="block text-xs font-bold text-stone-800 font-sans mb-1">
                  Prefix Nomor Voucher (BKK) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: BKK-PBM"
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 uppercase"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">Contoh format: {newPrefix || 'BKK-PBM'}/V/2026/10001</span>
              </div>
            </div>

            {/* Nama Lengkap Perusahaan */}
            <div>
              <label className="block text-xs font-bold text-stone-800 font-sans mb-1">
                Nama Lengkap Perusahaan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Misal: PT Pelayaran Bahtera Makmur"
                value={newName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-sans bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium"
              />
            </div>

            {/* Nama Tampilan Dokumen / Header */}
            <div>
              <label className="block text-xs font-bold text-stone-800 font-sans mb-1">
                Nama Tampilan Header Dokumen
              </label>
              <input
                type="text"
                placeholder="Misal: PT Pelayaran Bahtera Makmur"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-sans bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            {/* Input Link ImgBB / Logo Perusahaan Baru */}
            <div className="border border-stone-250 bg-stone-50/70 p-4 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-stone-800 font-sans">
                  Link Gambar Logo Perusahaan (ImgBB / URL Web)
                </label>
                {newLogoUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => setNewLogoUrl('')}
                    className="text-[10px] text-stone-400 hover:text-stone-700 font-mono underline cursor-pointer"
                  >
                    Kosongkan Link
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
                <input
                  type="url"
                  placeholder="https://i.ibb.co.com/gFHNJ1JD/LOGO-NH.png"
                  value={newLogoUrl}
                  onChange={(e) => setNewLogoUrl(e.target.value)}
                  className="w-full flex-1 px-3.5 py-2.5 text-xs font-mono bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-stone-900 placeholder:text-stone-400"
                />

                <button
                  type="button"
                  onClick={() => setNewLogoUrl('https://i.ibb.co.com/gFHNJ1JD/LOGO-NH.png')}
                  className="w-full sm:w-auto px-3 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-mono text-[11px] font-bold rounded-xl transition shrink-0 whitespace-nowrap cursor-pointer shadow-3xs"
                  title="Gunakan link ImgBB contoh"
                >
                  Gunakan Link Contoh ImgBB
                </button>
              </div>

              {newLogoUrl.trim() ? (
                <div className="flex items-center gap-3 mt-1.5 p-2 bg-white rounded-xl border border-stone-250">
                  <div className="w-12 h-12 rounded-lg border border-stone-200 bg-stone-50 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={newLogoUrl.trim()}
                      alt="Logo Preview"
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).alt = 'Gambar gagal dimuat';
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-stone-600 font-sans">
                    <div className="font-bold text-stone-800">Preview Logo Terdeteksi</div>
                    <div className="text-stone-400 truncate max-w-xs sm:max-w-md font-mono text-[10px]">{newLogoUrl.trim()}</div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-stone-500 font-sans">
                  Masukkan tautan langsung gambar dari ImgBB (contoh: <code className="font-mono bg-stone-200/80 px-1 py-0.5 rounded text-stone-700">https://i.ibb.co.com/gFHNJ1JD/LOGO-NH.png</code>) untuk mengkustomisasi logo kop surat voucher &amp; dokumen pengajuan perusahaan ini.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Lokasi Default */}
              <div>
                <label className="block text-xs font-bold text-stone-800 font-sans mb-1">
                  Lokasi Default Form
                </label>
                <input
                  type="text"
                  placeholder="Misal: Lt. 1, Kantor Pusat, Site Morowali"
                  value={newLokasi}
                  onChange={(e) => setNewLokasi(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-sans bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              {/* Jenis Pengajuan Default */}
              <div>
                <label className="block text-xs font-bold text-stone-800 font-sans mb-1">
                  Jenis Pengajuan Default
                </label>
                <input
                  type="text"
                  placeholder="Operasional Kantor / Biaya Proyek"
                  value={newJenis}
                  onChange={(e) => setNewJenis(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-sans bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </div>

            {/* Default Signatures Accordion/Section */}
            <div className="border border-stone-200 rounded-2xl p-4 bg-stone-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-900 font-sans flex items-center gap-1.5">
                  <PenTool size={13} className="text-amber-700" />
                  <span>Pengaturan Pejabat Penandatangan Lembar Cetak (Default Signatures Resmi)</span>
                </h4>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Struktur Direksi Terbaru
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Diajukan Oleh */}
                <div className="bg-white p-2.5 rounded-xl border border-stone-200 space-y-1.5 shadow-3xs">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-stone-700">1. Diajukan Oleh (Pembuat)</label>
                    <span className="text-[9px] font-mono text-stone-400">Pemohon</span>
                  </div>
                  <input
                    type="text"
                    value={sigDibuat}
                    onChange={(e) => setSigDibuat(e.target.value)}
                    placeholder="Nama Pembuat / Pemohon"
                    className="w-full px-2.5 py-1.5 text-xs bg-stone-50/80 border border-stone-300 rounded-lg focus:bg-white font-medium"
                  />
                  <input
                    type="text"
                    value={sigDibuatJabatan}
                    onChange={(e) => setSigDibuatJabatan(e.target.value)}
                    placeholder="Jabatan (cth: Staff Operasional)"
                    className="w-full px-2.5 py-1 text-[11px] text-stone-600 bg-white border border-stone-200 rounded-lg"
                  />
                </div>

                {/* 2. Dibukukan / Diajukan (Keuangan) */}
                <div className="bg-white p-2.5 rounded-xl border border-stone-200 space-y-1.5 shadow-3xs">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-stone-700">2. Dibukukan / Diajukan (Keuangan)</label>
                    <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Resmi Terkini</span>
                  </div>
                  <input
                    type="text"
                    value={sigAccounting}
                    onChange={(e) => setSigAccounting(e.target.value)}
                    placeholder="Nama Pejabat Keuangan"
                    className="w-full px-2.5 py-1.5 text-xs bg-stone-50/80 border border-stone-300 rounded-lg focus:bg-white font-medium"
                  />
                  <input
                    type="text"
                    value={sigAccountingJabatan}
                    onChange={(e) => setSigAccountingJabatan(e.target.value)}
                    placeholder="Jabatan (cth: Manager Keuangan)"
                    className="w-full px-2.5 py-1 text-[11px] text-stone-600 bg-white border border-stone-200 rounded-lg"
                  />
                </div>

                {/* 3. Diverifikasi Oleh */}
                <div className="bg-white p-2.5 rounded-xl border border-stone-200 space-y-1.5 shadow-3xs">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-stone-700">3. Diverifikasi Oleh</label>
                    <span className="text-[9px] font-mono text-stone-400">Verifikasi F1</span>
                  </div>
                  <input
                    type="text"
                    value={sigDiverifikasi}
                    onChange={(e) => setSigDiverifikasi(e.target.value)}
                    placeholder="Nama Pejabat Verifikasi"
                    className="w-full px-2.5 py-1.5 text-xs bg-stone-50/80 border border-stone-300 rounded-lg focus:bg-white font-medium"
                  />
                  <input
                    type="text"
                    value={sigDiverifikasiJabatan}
                    onChange={(e) => setSigDiverifikasiJabatan(e.target.value)}
                    placeholder="Jabatan (cth: Direktur)"
                    className="w-full px-2.5 py-1 text-[11px] text-stone-600 bg-white border border-stone-200 rounded-lg"
                  />
                </div>

                {/* 4. Disetujui Oleh */}
                <div className="bg-white p-2.5 rounded-xl border border-stone-200 space-y-1.5 shadow-3xs">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-stone-700">4. Disetujui Oleh</label>
                    <span className="text-[9px] font-mono text-stone-400">Persetujuan F2</span>
                  </div>
                  <input
                    type="text"
                    value={sigDisetujui}
                    onChange={(e) => setSigDisetujui(e.target.value)}
                    placeholder="Nama Pejabat Disetujui"
                    className="w-full px-2.5 py-1.5 text-xs bg-stone-50/80 border border-stone-300 rounded-lg focus:bg-white font-medium"
                  />
                  <input
                    type="text"
                    value={sigDisetujuiJabatan}
                    onChange={(e) => setSigDisetujuiJabatan(e.target.value)}
                    placeholder="Jabatan (cth: Direktur Keuangan)"
                    className="w-full px-2.5 py-1 text-[11px] text-stone-600 bg-white border border-stone-200 rounded-lg"
                  />
                </div>

                {/* 5. Mengetahui Oleh */}
                <div className="bg-white p-2.5 rounded-xl border border-stone-200 space-y-1.5 shadow-3xs">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-stone-700">5. Mengetahui Oleh</label>
                    <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Resmi Terkini</span>
                  </div>
                  <input
                    type="text"
                    value={sigMengetahui}
                    onChange={(e) => setSigMengetahui(e.target.value)}
                    placeholder="Nama Pejabat Mengetahui"
                    className="w-full px-2.5 py-1.5 text-xs bg-stone-50/80 border border-stone-300 rounded-lg focus:bg-white font-medium"
                  />
                  <input
                    type="text"
                    value={sigMengetahuiJabatan}
                    onChange={(e) => setSigMengetahuiJabatan(e.target.value)}
                    placeholder="Jabatan (cth: Direktur Operasional)"
                    className="w-full px-2.5 py-1 text-[11px] text-stone-600 bg-white border border-stone-200 rounded-lg"
                  />
                </div>

                {/* 6. Direktur Utama */}
                <div className="bg-white p-2.5 rounded-xl border border-stone-200 space-y-1.5 shadow-3xs">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-stone-700">6. Direktur Utama</label>
                    <span className="text-[9px] font-mono text-stone-400">Pemberi Perintah / SPPD</span>
                  </div>
                  <input
                    type="text"
                    value={sigDirektur}
                    onChange={(e) => setSigDirektur(e.target.value)}
                    placeholder="Nama Direktur Utama"
                    className="w-full px-2.5 py-1.5 text-xs bg-stone-50/80 border border-stone-300 rounded-lg focus:bg-white font-medium"
                  />
                  <input
                    type="text"
                    value={sigDirekturJabatan}
                    onChange={(e) => setSigDirekturJabatan(e.target.value)}
                    placeholder="Jabatan (cth: Direktur Utama)"
                    className="w-full px-2.5 py-1 text-[11px] text-stone-600 bg-white border border-stone-200 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 font-sans font-bold text-xs transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-sans font-bold text-xs transition shadow-3xs flex items-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Menyimpan ke Firestore...</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    <span>Simpan &amp; Aktifkan Perusahaan Baru</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="p-4 bg-stone-100 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Perusahaan Aktif Saat Ini: <strong className="text-stone-800 font-mono uppercase">{currentCompanyId}</strong></span>
          </div>
          <button
            onClick={onClose}
            className="text-stone-600 hover:text-stone-900 font-bold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

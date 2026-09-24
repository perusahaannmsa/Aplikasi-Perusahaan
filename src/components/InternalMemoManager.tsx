import React, { useState, useEffect, useRef } from 'react';
import { InternalMemo, BankAccountMaster, Submission } from '../types';
import {
  formatHariTanggalMemo,
  generateDefaultMemoNumber,
  getSavedBankAccounts,
  saveBankAccounts,
  getSavedInternalMemos,
  saveInternalMemos,
  createInitialMemo,
  OFFICIAL_KOP_SURAT_IMAGE_URL,
} from '../utils/memoUtils';
import { InternalMemoDocument } from './InternalMemoDocument';
import { ManageBankAccountsModal } from './ManageBankAccountsModal';
import { MemoRichEditor } from './MemoRichEditor';
import {
  FileText,
  Printer,
  Save,
  Plus,
  Copy,
  Trash2,
  Edit,
  Sparkles,
  RefreshCw,
  CreditCard,
  Building,
  Calendar,
  User,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  FileDown,
  FileUp,
  Link as LinkIcon,
  ChevronDown,
  Image as ImageIcon,
  Users,
  UserCheck,
} from 'lucide-react';

const COMMON_MEMO_SIGNERS = [
  { name: 'Andi Muhammad Rifki', role: 'Direktur' },
  { name: 'Harijon', role: 'Direktur Keuangan' },
  { name: 'Abdul Aziz Halid', role: 'Direktur Utama ANH' },
  { name: 'H. Andi Nursyam Halid', role: 'Direktur Utama' },
  { name: 'Sri Ekowati', role: 'Manager Keuangan' },
];

interface InternalMemoManagerProps {
  submissions?: Submission[];
  initialSubmissionForMemo?: Submission | null;
  onBackToList: () => void;
  userProfile?: any;
}

export const InternalMemoManager: React.FC<InternalMemoManagerProps> = ({
  submissions = [],
  initialSubmissionForMemo = null,
  onBackToList,
  userProfile,
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'history' | 'banks'>('editor');
  const [memos, setMemos] = useState<InternalMemo[]>(() => getSavedInternalMemos());
  const [bankAccounts, setBankAccounts] = useState<BankAccountMaster[]>(() => getSavedBankAccounts());
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);

  // Active memo being edited
  const [currentMemo, setCurrentMemo] = useState<InternalMemo>(() => {
    if (initialSubmissionForMemo) {
      return createInitialMemo(initialSubmissionForMemo, memos.length + 163);
    }
    if (memos.length > 0) {
      return {
        ...memos[0],
        useImageHeader: memos[0].useImageHeader !== false,
        companyHeaderUrl: memos[0].companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL,
      };
    }
    return createInitialMemo(null, 163);
  });

  // If initialSubmissionForMemo changes, update currentMemo
  useEffect(() => {
    if (initialSubmissionForMemo) {
      const newMemo = createInitialMemo(initialSubmissionForMemo, memos.length + 163);
      setCurrentMemo(newMemo);
      setActiveTab('editor');
    }
  }, [initialSubmissionForMemo]);

  // AI polishing state
  const [isPolishing, setIsPolishing] = useState(false);
  const [aiSuccessMsg, setAiSuccessMsg] = useState('');
  const [aiErrorMsg, setAiErrorMsg] = useState('');

  // Save notification
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Search filter for history
  const [searchQuery, setSearchQuery] = useState('');

  // Linked voucher picker modal / dropdown state
  const [isVoucherPickerOpen, setIsVoucherPickerOpen] = useState(false);

  // Sync bank accounts when updated
  const handleSaveBankAccounts = (updated: BankAccountMaster[]) => {
    setBankAccounts(updated);
    saveBankAccounts(updated);
  };

  // Sync internal memos to storage
  const persistMemos = (updated: InternalMemo[]) => {
    setMemos(updated);
    saveInternalMemos(updated);
  };

  // Save current memo
  const handleSaveCurrentMemo = () => {
    const existingIndex = memos.findIndex((m) => m.id === currentMemo.id);
    let updated: InternalMemo[];
    const payload = {
      ...currentMemo,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      updated = [...memos];
      updated[existingIndex] = payload;
    } else {
      updated = [payload, ...memos];
    }

    persistMemos(updated);
    setSaveSuccessMsg('Internal Memo berhasil disimpan ke daftar riwayat!');
    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  // Create new blank / default memo
  const handleCreateNewMemo = () => {
    const fresh = createInitialMemo(null, memos.length + 164);
    setCurrentMemo(fresh);
    setActiveTab('editor');
    setSaveSuccessMsg('Draf memo baru telah dibuat.');
    setTimeout(() => setSaveSuccessMsg(''), 2500);
  };

  // Duplicate current memo
  const handleDuplicateMemo = (memoToDupe: InternalMemo = currentMemo) => {
    const nextSeq = memos.length + 164;
    const duplicated: InternalMemo = {
      ...memoToDupe,
      id: `memo-${Date.now()}`,
      nomorMemo: generateDefaultMemoNumber(nextSeq, new Date()),
      tanggal: new Date().toISOString().split('T')[0],
      hariTanggalDisplay: formatHariTanggalMemo(new Date()),
      createdAt: new Date().toISOString(),
    };
    persistMemos([duplicated, ...memos]);
    setCurrentMemo(duplicated);
    setActiveTab('editor');
    setSaveSuccessMsg('Memo berhasil diduplikasi sebagai nomor memo baru.');
    setTimeout(() => setSaveSuccessMsg(''), 2500);
  };

  // Delete a memo
  const handleDeleteMemo = (id: string) => {
    if (window.confirm('Hapus memo internal ini dari riwayat?')) {
      const updated = memos.filter((m) => m.id !== id);
      persistMemos(updated);
      if (currentMemo.id === id) {
        if (updated.length > 0) {
          setCurrentMemo(updated[0]);
        } else {
          setCurrentMemo(createInitialMemo(null, 164));
        }
      }
    }
  };

  // Select a memo from history to edit
  const handleSelectMemoFromHistory = (memo: InternalMemo) => {
    setCurrentMemo({ ...memo });
    setActiveTab('editor');
  };

  // Handle date change
  const handleDateChange = (isoDate: string) => {
    const formatted = formatHariTanggalMemo(isoDate);
    setCurrentMemo((prev) => ({
      ...prev,
      tanggal: isoDate,
      hariTanggalDisplay: formatted,
    }));
  };

  // Handle bank account change from dropdown
  const handleSelectBankAccount = (acc: BankAccountMaster) => {
    setCurrentMemo((prev) => ({
      ...prev,
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      accountHolder: acc.accountHolder,
    }));
  };

  // Link memo to an existing voucher
  const handleLinkVoucher = (sub: Submission) => {
    const subTotal = (sub.items || []).reduce((sum, item) => sum + (item.total || 0), 0);
    const formattedAmount = `Rp. ${Number(subTotal).toLocaleString('id-ID')},-`;
    const invoiceOrRef = sub.kode ? `No. ${sub.kode}` : '';
    const dateFormatted = formatHariTanggalMemo(sub.tanggal || new Date());

    setCurrentMemo((prev) => ({
      ...prev,
      linkedSubmissionId: sub.id,
      linkedSubmissionKode: sub.kode,
      linkedAmount: subTotal,
      perihal: `Pembayaran ${sub.jenisPengajuan || 'Operasional'} - ${sub.dibayarkanKepada || ''}`.trim(),
      isiSurat: `Sehubungan dengan adanya pengajuan pembayaran keperluan ${sub.jenisPengajuan || 'operasional'} terkait ${sub.dibayarkanKepada || 'pihak rekanan'} sesuai rincian pada formulir voucher pengeluaran ${invoiceOrRef} tertanggal ${dateFormatted}, dengan ini kami memohon untuk dilakukan pembayaran sebesar ${formattedAmount} dapat di transfer ke :`,
      accountHolder: sub.dibayarkanKepada || prev.accountHolder,
    }));
    setIsVoucherPickerOpen(false);
    setSaveSuccessMsg(`Memo dihubungkan dengan voucher ${sub.kode}!`);
    setTimeout(() => setSaveSuccessMsg(''), 2500);
  };

  // AI Polish feature
  const handlePolishWithAI = async () => {
    setIsPolishing(true);
    setAiSuccessMsg('');
    setAiErrorMsg('');

    try {
      const response = await fetch('/api/gemini/refine-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftText: currentMemo.isiSurat,
          perihal: currentMemo.perihal,
          kepada: currentMemo.kepada,
          dari: currentMemo.dari,
          nominal: currentMemo.linkedAmount ? `Rp. ${currentMemo.linkedAmount.toLocaleString('id-ID')}` : undefined,
          voucherKode: currentMemo.linkedSubmissionKode,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyempurnakan teks dengan AI.');
      }

      if (data.text) {
        setCurrentMemo((prev) => ({
          ...prev,
          isiSurat: data.text,
        }));
        setAiSuccessMsg('✨ Isi surat berhasil disempurnakan menjadi lebih formal & berwibawa!');
        setTimeout(() => setAiSuccessMsg(''), 4000);
      }
    } catch (err: any) {
      console.error('AI refine error:', err);
      setAiErrorMsg(err.message || 'Terjadi kesalahan saat memanggil asisten AI.');
      setTimeout(() => setAiErrorMsg(''), 5000);
    } finally {
      setIsPolishing(false);
    }
  };

  // Restore sample document matching user's official "IM - Pembayaran Tongkang" Word document
  const handleLoadSampleDokumen = () => {
    setCurrentMemo({
      id: `memo-${Date.now()}`,
      nomorMemo: '168/IM-NMSA/KEU/IX/2026',
      tanggal: '2026-09-24',
      hariTanggalDisplay: 'Kamis / 24 September 2026',
      dari: 'Andi Muhammad Rifki – Direktur',
      kepada: 'Harijon – Direktur Keuangan',
      perihal: 'Pembayaran DP Batubara 50%',
      isiSurat:
        'Sehubungan dengan akan dilakukannya kegiatan pengiriman Batubara ke <strong>PLTU Pelabuhan Ratu ADC</strong>, dengan ini kami memohon untuk dapat dilakukan pembayaran <strong>DP Tongkang sebesar 50%</strong> dari total biaya yang terlampir didalam <strong>Invoice No. 001-DP/WAA-BJM-NMSA/IX/26 Tanggal 23 September 2026</strong>, yaitu <strong>Sebesar Rp. 712.500.000,-</strong> dapat di Transfer ke :',
      bankName: 'Bank Mandiri',
      accountNumber: '1030013139064',
      accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
      penutup:
        'Demikian Internal Memo ini dibuat untuk dapat dipahami bersama dan dilaksanakan sebaik baiknya',
      salamPenutup: 'Hormat Saya',
      penandatanganNama: 'Andi Muhammad Rifki',
      penandatanganJabatan: 'Direktur',
      signerCount: 3,
      useSecondSigner: true,
      useThirdSigner: true,
      approvalHeaderTitle: 'Mengetahui dan Menyetujui',
      salamPenutup2: 'Menyetujui,',
      penandatanganNama2: 'Harijon',
      penandatanganJabatan2: 'Direktur Keuangan',
      salamPenutup3: 'Menyetujui,',
      penandatanganNama3: 'Abdul Aziz Halid',
      penandatanganJabatan3: 'Direktur Utama ANH',
      companyName: 'PT. NUSANTARA MINERAL SUKSES ABADI',
      companyHeaderUrl: OFFICIAL_KOP_SURAT_IMAGE_URL,
      useImageHeader: false, // Default to official layout with long line like Word document
      createdAt: new Date().toISOString(),
    });
    setSaveSuccessMsg('Draf contoh resmi IM - Pembayaran Tongkang (3 Penandatangan Sesuai Word) dimuat.');
    setTimeout(() => setSaveSuccessMsg(''), 2500);
  };

  // Print function with complete isolation to match Microsoft Word exact output
  const handlePrint = () => {
    // Automatically save before print
    handleSaveCurrentMemo();
    document.body.classList.add('is-printing-internal-memo');

    const cleanup = () => {
      document.body.classList.remove('is-printing-internal-memo');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    setTimeout(() => {
      window.print();
      // Fallback timeout cleanup in case afterprint doesn't trigger on some browsers
      setTimeout(cleanup, 2500);
    }, 150);
  };

  // Filter memos for history tab
  const filteredMemos = memos.filter((m) => {
    const q = searchQuery.toLowerCase();
    return (
      m.nomorMemo.toLowerCase().includes(q) ||
      m.perihal.toLowerCase().includes(q) ||
      m.kepada.toLowerCase().includes(q) ||
      m.bankName.toLowerCase().includes(q) ||
      m.accountNumber.toLowerCase().includes(q) ||
      m.hariTanggalDisplay.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 font-sans">
      {/* HEADER BAR */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToList}
            className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Kembali ke Daftar Voucher HO"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Voucher HO</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-stone-900 tracking-tight flex items-center gap-2">
                <FileText className="text-amber-600" size={20} />
                Internal Memo Resmi Direksi
              </h2>
              <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                PT. NMSA
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Format resmi memo direksi permohonan transfer dana operasional / transaksi voucher
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* Navigation Tabs */}
          <div className="bg-stone-100 p-1 rounded-xl flex items-center gap-1 border border-stone-200">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'editor'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Edit size={14} />
              <span>Editor Memo</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <FileText size={14} />
              <span>Riwayat ({memos.length})</span>
            </button>
            <button
              onClick={() => setIsBankModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-200/60"
            >
              <CreditCard size={14} />
              <span>Master Rekening</span>
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
            title="Cetak A4 atau Simpan sebagai PDF"
          >
            <Printer size={15} />
            <span>Cetak / PDF</span>
          </button>
        </div>
      </div>

      {/* SUCCESS / ALERT BANNERS */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs animate-in fade-in duration-200 print:hidden">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* VIEW 1: EDITOR MEMO (Form on left, Live A4 Preview on right) */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:block print:w-full print:p-0 print:m-0">
          {/* FORM CONTROLS (Left side 5 cols on lg) */}
          <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-5 print:hidden">
            {/* Quick Actions Header */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-stone-700">
                Pengaturan Isi Dokumen
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCreateNewMemo}
                  className="px-2.5 py-1 text-[11px] font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition flex items-center gap-1"
                  title="Buat draf memo baru"
                >
                  <Plus size={13} /> Baru
                </button>
                <button
                  type="button"
                  onClick={handleLoadSampleDokumen}
                  className="px-2.5 py-1 text-[11px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg transition flex items-center gap-1"
                  title="Muat contoh DP Batubara PLTU Pelabuhan Ratu"
                >
                  <RefreshCw size={13} /> Contoh DP Batubara
                </button>
              </div>
            </div>

            {/* Link from Voucher Button */}
            {submissions.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsVoucherPickerOpen(!isVoucherPickerOpen)}
                  className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl text-xs font-bold text-amber-950 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <LinkIcon size={14} className="text-amber-700" />
                    <span>
                      {currentMemo.linkedSubmissionKode
                        ? `Terhubung ke: ${currentMemo.linkedSubmissionKode}`
                        : 'Hubungkan dengan Transaksi Voucher HO...'}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`transition-transform ${isVoucherPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {isVoucherPickerOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-stone-300 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto p-2 space-y-1">
                    <p className="text-[10px] font-bold text-stone-400 px-2 py-1 uppercase">
                      Pilih voucher untuk auto-fill memo:
                    </p>
                    {submissions.slice(0, 15).map((sub) => {
                      const subTotal = (sub.items || []).reduce((sum, item) => sum + (item.total || 0), 0);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleLinkVoucher(sub)}
                          className="w-full text-left p-2 hover:bg-amber-50 rounded-lg text-xs transition flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-stone-900">{sub.kode}</div>
                            <div className="text-[11px] text-stone-500">
                              {sub.jenisPengajuan} • {sub.dibayarkanKepada}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-emerald-800 text-[11px]">
                            Rp. {Number(subTotal).toLocaleString('id-ID')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Fields Grid */}
            <div className="space-y-3.5">
              {/* Kop Surat Setting */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-stone-700 flex items-center gap-1.5">
                    <ImageIcon size={13} className="text-amber-600" />
                    <span>Header / Kop Surat Memo</span>
                  </label>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Resmi NMSA
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentMemo((prev) => ({
                        ...prev,
                        useImageHeader: false,
                      }))
                    }
                    className={`py-2 px-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      currentMemo.useImageHeader === false
                        ? 'bg-amber-100 border-amber-500 text-amber-950 font-black shadow-xs ring-1 ring-amber-400'
                        : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className={currentMemo.useImageHeader === false ? 'text-amber-700' : 'opacity-0'} />
                      <span className="font-bold">Format IM Tongkang</span>
                    </div>
                    <span className="text-[9.5px] font-normal text-stone-600 leading-tight">
                      Logo + Teks + Garis Panjang (Sesuai PDF Asli)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentMemo((prev) => ({
                        ...prev,
                        useImageHeader: true,
                        companyHeaderUrl: prev.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL,
                      }))
                    }
                    className={`py-2 px-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                      currentMemo.useImageHeader === true
                        ? 'bg-amber-100 border-amber-500 text-amber-950 font-black shadow-xs ring-1 ring-amber-400'
                        : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className={currentMemo.useImageHeader === true ? 'text-amber-700' : 'opacity-0'} />
                      <span className="font-bold">Banner Gambar Kop</span>
                    </div>
                    <span className="text-[9.5px] font-normal text-stone-600 leading-tight">
                      Banner Gambar Tunggal (Full Width)
                    </span>
                  </button>
                </div>

                {currentMemo.useImageHeader !== false && (
                  <div className="pt-2 border-t border-stone-200/80 space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-11 w-32 bg-white border border-stone-200 rounded-lg p-0.5 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                        <img
                          src={currentMemo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL}
                          alt="Preview Kop Surat"
                          className="h-full w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-stone-800 truncate">
                          Kop Surat Resmi PT. NMSA
                        </p>
                        <p className="text-[9px] text-stone-500 truncate font-mono">
                          {currentMemo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={currentMemo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL}
                        onChange={(e) =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            companyHeaderUrl: e.target.value,
                          }))
                        }
                        placeholder="https://..."
                        className="flex-1 px-2 py-1 text-[11px] font-mono bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            companyHeaderUrl: OFFICIAL_KOP_SURAT_IMAGE_URL,
                          }))
                        }
                        className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-[10px] font-bold text-stone-600 rounded-lg transition shrink-0"
                        title="Reset ke Kop Surat Resmi NMSA"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* No Memo */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  Nomor Dokumen Memo
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentMemo.nomorMemo}
                    onChange={(e) =>
                      setCurrentMemo((prev) => ({ ...prev, nomorMemo: e.target.value }))
                    }
                    placeholder="164/IM-NMSA/KEU/IX/2026"
                    className="flex-1 px-3 py-2 text-xs font-mono font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentMemo((prev) => ({
                        ...prev,
                        nomorMemo: generateDefaultMemoNumber(memos.length + 164, new Date()),
                      }))
                    }
                    className="px-2.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs rounded-xl transition"
                    title="Generate nomor memo otomatis"
                  >
                    Auto
                  </button>
                </div>
              </div>

              {/* Hari & Tanggal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <Calendar size={13} /> Pilih Tanggal
                  </label>
                  <input
                    type="date"
                    value={currentMemo.tanggal}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Teks Hari / Tanggal
                  </label>
                  <input
                    type="text"
                    value={currentMemo.hariTanggalDisplay}
                    onChange={(e) =>
                      setCurrentMemo((prev) => ({
                        ...prev,
                        hariTanggalDisplay: e.target.value,
                      }))
                    }
                    placeholder="Senin / 21 September 2026"
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Dari & Kepada */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Dari (Default Direktur Utama)
                  </label>
                  <input
                    type="text"
                    value={currentMemo.dari}
                    onChange={(e) =>
                      setCurrentMemo((prev) => ({ ...prev, dari: e.target.value }))
                    }
                    placeholder="H. A. Nursyam Halid – Direktur Utama"
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Kepada (Default Direktur Keuangan)
                  </label>
                  <input
                    type="text"
                    value={currentMemo.kepada}
                    onChange={(e) =>
                      setCurrentMemo((prev) => ({ ...prev, kepada: e.target.value }))
                    }
                    placeholder="Harijon – Direktur Keuangan"
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Perihal */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  Perihal
                </label>
                <input
                  type="text"
                  value={currentMemo.perihal}
                  onChange={(e) =>
                    setCurrentMemo((prev) => ({ ...prev, perihal: e.target.value }))
                  }
                  placeholder="Pembayaran DP Batubara 50%"
                  className="w-full px-3 py-2 text-xs font-bold bg-stone-50 border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Isi Surat with AI Assist */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-stone-700">
                    Isi Permohonan (setelah "Dengan Hormat,")
                  </label>
                  <button
                    type="button"
                    onClick={handlePolishWithAI}
                    disabled={isPolishing}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition flex items-center gap-1 shadow-3xs cursor-pointer ${
                      isPolishing
                        ? 'bg-amber-100 text-amber-600 animate-pulse'
                        : 'bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white'
                    }`}
                    title="Sempurnakan bahasa isi memo dengan AI agar lebih formal dan berwibawa"
                  >
                    <Sparkles size={13} className={isPolishing ? 'animate-spin' : ''} />
                    <span>{isPolishing ? 'Menyempurnakan...' : '✨ Sempurnakan dengan AI'}</span>
                  </button>
                </div>

                {aiSuccessMsg && (
                  <div className="mb-2 p-2 bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] rounded-lg font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span>{aiSuccessMsg}</span>
                  </div>
                )}

                {aiErrorMsg && (
                  <div className="mb-2 p-2 bg-red-50 border border-red-300 text-red-800 text-[11px] rounded-lg font-medium flex items-center gap-1.5">
                    <AlertCircle size={13} className="text-red-600 shrink-0" />
                    <span>{aiErrorMsg}</span>
                  </div>
                )}

                {/* Word-like Rich Text Editor */}
                <MemoRichEditor
                  value={currentMemo.isiSurat}
                  onChange={(html) =>
                    setCurrentMemo((prev) => ({ ...prev, isiSurat: html }))
                  }
                  placeholder="Sehubungan dengan akan dilakukannya kegiatan..."
                />
                <div className="flex justify-between text-[10px] text-stone-400 font-mono mt-0.5">
                  <span>Pastikan berakhiran: "... dapat di transfer ke :"</span>
                  <span>{currentMemo.isiSurat.replace(/<[^>]*>/g, '').length} karakter</span>
                </div>
              </div>

              {/* Data No Rekening Dropdown & Master */}
              <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-amber-950 flex items-center gap-1.5">
                    <CreditCard size={14} className="text-amber-700" />
                    Data Rekening Tujuan Transfer
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsBankModalOpen(true)}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline flex items-center gap-1"
                  >
                    <Plus size={12} /> Kelola Master Rekening
                  </button>
                </div>

                {/* Dropdown Rekening */}
                <div>
                  <label className="block text-[10px] font-bold text-stone-600 mb-1">
                    Pilih Dari Daftar Rekening Tersimpan:
                  </label>
                  <select
                    onChange={(e) => {
                      const selected = bankAccounts.find((a) => a.id === e.target.value);
                      if (selected) handleSelectBankAccount(selected);
                    }}
                    value={
                      bankAccounts.find(
                        (a) =>
                          a.bankName === currentMemo.bankName &&
                          a.accountNumber === currentMemo.accountNumber
                      )?.id || ''
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="" disabled>
                      -- Pilih Rekening Bank --
                    </option>
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bankName} - {acc.accountNumber} ({acc.accountHolder})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Editable 3 fields for Bank */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                      Nama Bank
                    </label>
                    <input
                      type="text"
                      value={currentMemo.bankName}
                      onChange={(e) =>
                        setCurrentMemo((prev) => ({ ...prev, bankName: e.target.value }))
                      }
                      placeholder="Bank Mandiri"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                      No. Rekening
                    </label>
                    <input
                      type="text"
                      value={currentMemo.accountNumber}
                      onChange={(e) =>
                        setCurrentMemo((prev) => ({ ...prev, accountNumber: e.target.value }))
                      }
                      placeholder="1030013139064"
                      className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                      Nama Rekening
                    </label>
                    <input
                      type="text"
                      value={currentMemo.accountHolder}
                      onChange={(e) =>
                        setCurrentMemo((prev) => ({ ...prev, accountHolder: e.target.value }))
                      }
                      placeholder="PT. Nusantara Mineral Sukses Abadi"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Signer Configuration Section (1, 2, or 3 Signers Sesuai Dokumen Word) */}
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200">
                  <span className="text-[11px] font-bold text-stone-800 flex items-center gap-1.5">
                    <Users size={14} className="text-amber-600" />
                    Format Penandatangan Dokumen
                  </span>
                  {/* Segmented Signer Mode Selector */}
                  <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-stone-200/70 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          signerCount: 3,
                          useSecondSigner: true,
                          useThirdSigner: true,
                          salamPenutup: prev.salamPenutup || 'Hormat Saya',
                          approvalHeaderTitle: prev.approvalHeaderTitle || 'Mengetahui dan Menyetujui',
                          penandatanganNama2: prev.penandatanganNama2 || 'Harijon',
                          penandatanganJabatan2: prev.penandatanganJabatan2 || 'Direktur Keuangan',
                          penandatanganNama3: prev.penandatanganNama3 || 'Abdul Aziz Halid',
                          penandatanganJabatan3: prev.penandatanganJabatan3 || 'Direktur Utama ANH',
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        currentMemo.signerCount === 3 || currentMemo.useThirdSigner
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      3 Pejabat (Resmi Word)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          signerCount: 2,
                          useSecondSigner: true,
                          useThirdSigner: false,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        currentMemo.signerCount === 2 ||
                        (currentMemo.useSecondSigner && !currentMemo.useThirdSigner && currentMemo.signerCount !== 3)
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      2 Pejabat
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentMemo((prev) => ({
                          ...prev,
                          signerCount: 1,
                          useSecondSigner: false,
                          useThirdSigner: false,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                        currentMemo.signerCount === 1 ||
                        (!currentMemo.useSecondSigner && !currentMemo.useThirdSigner)
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-stone-700 hover:text-stone-900'
                      }`}
                    >
                      1 Pejabat
                    </button>
                  </div>
                </div>

                {/* Penandatangan 1: Pemohon / Hormat Saya */}
                <div className="bg-white p-3 rounded-lg border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-stone-800 flex items-center gap-1.5">
                      <User size={13} className="text-amber-600" />
                      Penandatangan 1 (Pembuat / Pemohon)
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-stone-500 font-medium">Salam:</span>
                      <input
                        type="text"
                        value={currentMemo.salamPenutup || 'Hormat Saya'}
                        onChange={(e) =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            salamPenutup: e.target.value,
                          }))
                        }
                        placeholder="Hormat Saya"
                        className="px-2 py-0.5 text-[11px] bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none w-28 text-stone-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                        Nama Penandatangan 1
                      </label>
                      <input
                        type="text"
                        value={currentMemo.penandatanganNama}
                        onChange={(e) =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            penandatanganNama: e.target.value,
                          }))
                        }
                        placeholder="Andi Muhammad Rifki"
                        className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                        Jabatan Penandatangan 1
                      </label>
                      <input
                        type="text"
                        value={currentMemo.penandatanganJabatan}
                        onChange={(e) =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            penandatanganJabatan: e.target.value,
                          }))
                        }
                        placeholder="Direktur"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Preset quick buttons for Signer 1 */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="text-[10px] text-stone-400 self-center mr-1">Preset:</span>
                    {COMMON_MEMO_SIGNERS.map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() =>
                          setCurrentMemo((prev) => ({
                            ...prev,
                            penandatanganNama: s.name,
                            penandatanganJabatan: s.role,
                          }))
                        }
                        className="px-2 py-0.5 text-[10px] bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-250 rounded-md transition cursor-pointer"
                      >
                        {s.name} ({s.role})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bagian Penandatangan 2 & 3 (Untuk 3 Pejabat Sesuai Word) */}
                {(currentMemo.signerCount === 3 || currentMemo.useThirdSigner) && (
                  <div className="bg-amber-50/60 p-3 rounded-lg border border-amber-200/80 space-y-3">
                    <div className="flex items-center justify-between pb-1 border-b border-amber-200">
                      <span className="text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                        <Users size={13} className="text-amber-700" />
                        Pihak yang Menyetujui (2 Pejabat Sejajar di Kanan)
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-stone-600 font-medium">Judul Header:</span>
                        <input
                          type="text"
                          value={currentMemo.approvalHeaderTitle || 'Mengetahui dan Menyetujui'}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              approvalHeaderTitle: e.target.value,
                            }))
                          }
                          placeholder="Mengetahui dan Menyetujui"
                          className="px-2 py-0.5 text-[11px] bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none w-44 text-stone-800 font-medium"
                        />
                      </div>
                    </div>

                    {/* Penandatangan 2: Harijon - Direktur Keuangan */}
                    <div className="bg-white p-2.5 rounded-lg border border-stone-200 space-y-1.5">
                      <span className="text-[10.5px] font-bold text-stone-700 block">
                        Penandatangan 2 (Mengetahui 1)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9.5px] font-bold text-stone-500 mb-0.5">Nama</label>
                          <input
                            type="text"
                            value={currentMemo.penandatanganNama2 || ''}
                            onChange={(e) =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganNama2: e.target.value,
                              }))
                            }
                            placeholder="Harijon"
                            className="w-full px-2 py-1 text-xs font-bold bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9.5px] font-bold text-stone-500 mb-0.5">Jabatan</label>
                          <input
                            type="text"
                            value={currentMemo.penandatanganJabatan2 || ''}
                            onChange={(e) =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganJabatan2: e.target.value,
                              }))
                            }
                            placeholder="Direktur Keuangan"
                            className="w-full px-2 py-1 text-xs bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {COMMON_MEMO_SIGNERS.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            onClick={() =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganNama2: s.name,
                                penandatanganJabatan2: s.role,
                              }))
                            }
                            className="px-1.5 py-0.5 text-[9.5px] bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-sm transition cursor-pointer"
                          >
                            {s.name} ({s.role})
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Penandatangan 3: Abdul Aziz Halid - Direktur Utama ANH */}
                    <div className="bg-white p-2.5 rounded-lg border border-stone-200 space-y-1.5">
                      <span className="text-[10.5px] font-bold text-stone-700 block">
                        Penandatangan 3 (Mengetahui 2)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9.5px] font-bold text-stone-500 mb-0.5">Nama</label>
                          <input
                            type="text"
                            value={currentMemo.penandatanganNama3 || ''}
                            onChange={(e) =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganNama3: e.target.value,
                              }))
                            }
                            placeholder="Abdul Aziz Halid"
                            className="w-full px-2 py-1 text-xs font-bold bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9.5px] font-bold text-stone-500 mb-0.5">Jabatan</label>
                          <input
                            type="text"
                            value={currentMemo.penandatanganJabatan3 || ''}
                            onChange={(e) =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganJabatan3: e.target.value,
                              }))
                            }
                            placeholder="Direktur Utama ANH"
                            className="w-full px-2 py-1 text-xs bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {COMMON_MEMO_SIGNERS.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            onClick={() =>
                              setCurrentMemo((prev) => ({
                                ...prev,
                                penandatanganNama3: s.name,
                                penandatanganJabatan3: s.role,
                              }))
                            }
                            className="px-1.5 py-0.5 text-[9.5px] bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-sm transition cursor-pointer"
                          >
                            {s.name} ({s.role})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Bagian Penandatangan 2 Saja (Jika mode 2 Penandatangan dipilih) */}
                {currentMemo.signerCount === 2 && (
                  <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-bold text-stone-700">
                        Data Penandatangan 2 (Menyetujui)
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-stone-500 font-medium">Salam:</span>
                        <input
                          type="text"
                          value={currentMemo.salamPenutup2 || 'Menyetujui,'}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              salamPenutup2: e.target.value,
                            }))
                          }
                          placeholder="Menyetujui,"
                          className="px-2 py-0.5 text-[11px] bg-white border border-stone-300 rounded-md focus:ring-1 focus:ring-amber-500 focus:outline-none w-28 text-stone-700"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                          Nama Penandatangan 2
                        </label>
                        <input
                          type="text"
                          value={currentMemo.penandatanganNama2 || ''}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              penandatanganNama2: e.target.value,
                            }))
                          }
                          placeholder="Harijon"
                          className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                          Jabatan Penandatangan 2
                        </label>
                        <input
                          type="text"
                          value={currentMemo.penandatanganJabatan2 || ''}
                          onChange={(e) =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              penandatanganJabatan2: e.target.value,
                            }))
                          }
                          placeholder="Direktur Keuangan"
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-[10px] text-stone-400 self-center mr-1">Preset:</span>
                      {COMMON_MEMO_SIGNERS.map((s) => (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() =>
                            setCurrentMemo((prev) => ({
                              ...prev,
                              penandatanganNama2: s.name,
                              penandatanganJabatan2: s.role,
                            }))
                          }
                          className="px-2 py-0.5 text-[10px] bg-white hover:bg-stone-100 text-stone-700 border border-stone-250 rounded-md transition cursor-pointer"
                        >
                          {s.name} ({s.role})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={handleSaveCurrentMemo}
                  className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save size={15} />
                  <span>Simpan Perubahan</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicateMemo(currentMemo)}
                  className="px-3 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition flex items-center gap-1"
                  title="Duplikasi sebagai memo baru"
                >
                  <Copy size={15} />
                  <span className="hidden sm:inline">Duplikasi</span>
                </button>
              </div>
            </div>
          </div>

          {/* LIVE A4 DOCUMENT PREVIEW (Right side 7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col items-center print:block print:w-full print:p-0 print:m-0">
            <div className="w-full flex items-center justify-between mb-3 px-1 print:hidden">
              <span className="text-xs font-bold text-stone-500 font-mono">
                Pratinjau Resmi Lembar A4 (Siap Cetak / PDF)
              </span>
              <button
                onClick={handlePrint}
                className="px-3 py-1 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
              >
                <Printer size={13} />
                <span>Cetak A4</span>
              </button>
            </div>

            {/* Document wrapper */}
            <div className="w-full overflow-x-auto pb-6 print:overflow-visible print:p-0 print:m-0">
              <div className="min-w-[680px] sm:min-w-[740px] max-w-[860px] w-full mx-auto print:min-w-0 print:w-full print:max-w-none print:m-0 print:p-0">
                <InternalMemoDocument
                  memo={currentMemo}
                  customLogoUrl={userProfile?.companyDetails?.logoUrl}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: RIWAYAT DAFTAR MEMO TERSIMPAN */}
      {activeTab === 'history' && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4 print:hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
            <div>
              <h3 className="text-sm sm:text-base font-black text-stone-900">
                Daftar Riwayat Internal Memo ({memos.length})
              </h3>
              <p className="text-xs text-stone-500">
                Semua memo yang pernah dibuat tersimpan secara lokal dan dapat dicetak kembali kapan saja
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Cari no. memo, perihal, atau tujuan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                onClick={handleCreateNewMemo}
                className="px-3 py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center gap-1 shrink-0"
              >
                <Plus size={14} /> Buat Memo
              </button>
            </div>
          </div>

          {filteredMemos.length === 0 ? (
            <div className="py-12 text-center text-stone-400 text-xs">
              Tidak ada memo internal yang cocok dengan pencarian.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMemos.map((memo) => (
                <div
                  key={memo.id}
                  className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${
                    currentMemo.id === memo.id
                      ? 'bg-amber-50/70 border-amber-300 shadow-xs'
                      : 'bg-white border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                        {memo.nomorMemo}
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {memo.hariTanggalDisplay}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-stone-900 mt-2 line-clamp-1">
                      {memo.perihal}
                    </h4>

                    <p className="text-xs text-stone-600 line-clamp-2 mt-1 leading-relaxed">
                      {memo.isiSurat}
                    </p>

                    <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                      <span>
                        Bank: <strong className="text-stone-800">{memo.bankName}</strong> ({memo.accountNumber})
                      </span>
                      <span>
                        Dari: <strong className="text-stone-800">{memo.dari.split('–')[0]}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-stone-100">
                    <button
                      onClick={() => handleSelectMemoFromHistory(memo)}
                      className="px-2.5 py-1 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-lg transition flex items-center gap-1"
                    >
                      <Edit size={13} /> Buka di Editor
                    </button>
                    <button
                      onClick={() => {
                        handleSelectMemoFromHistory(memo);
                        document.body.classList.add('is-printing-internal-memo');
                        setTimeout(() => {
                          window.print();
                          setTimeout(() => {
                            document.body.classList.remove('is-printing-internal-memo');
                          }, 1000);
                        }, 200);
                      }}
                      className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition"
                      title="Cetak langsung"
                    >
                      <Printer size={13} />
                    </button>
                    <button
                      onClick={() => handleDuplicateMemo(memo)}
                      className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition"
                      title="Duplikasi memo"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteMemo(memo.id)}
                      className="px-2 py-1 bg-stone-100 hover:bg-red-100 text-stone-500 hover:text-red-700 text-xs font-bold rounded-lg transition"
                      title="Hapus memo"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MASTER BANK ACCOUNTS MODAL */}
      <ManageBankAccountsModal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        accounts={bankAccounts}
        onSaveAccounts={handleSaveBankAccounts}
        onSelectAccount={handleSelectBankAccount}
      />
    </div>
  );
};

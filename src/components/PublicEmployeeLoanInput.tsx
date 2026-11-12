import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  User, 
  Briefcase, 
  Calendar, 
  Coins, 
  HelpCircle, 
  ArrowLeft, 
  Printer, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  Check, 
  Copy,
  Building,
  Eye,
  X
} from 'lucide-react';
import { NusantaraLogo } from './NusantaraLogo';
import { EmployeeLoan, Worker } from '../types';
import { 
  getSavedEmployeeLoans, 
  saveEmployeeLoans, 
  generateNextLoanNumber, 
  getSynchronizedAttendanceWorkers,
  formatRupiah,
  terbilang,
  formatTanggalIndo 
} from '../utils/loanUtils';
import { downloadEmployeeLoanPdf } from '../utils/loanPdfGenerator';
import { EmployeeLoanDocument } from './EmployeeLoanDocument';

interface PublicEmployeeLoanInputProps {
  onBackToHome?: () => void;
}

export const PublicEmployeeLoanInput: React.FC<PublicEmployeeLoanInputProps> = ({ onBackToHome }) => {
  // Workers master dari database absensi
  const workers = useMemo(() => {
    return getSynchronizedAttendanceWorkers();
  }, []);

  // Form states
  const todayStr = new Date().toISOString().split('T')[0];
  const [namaKaryawan, setNamaKaryawan] = useState('');
  const [divisi, setDivisi] = useState('');
  const [tanggalPermohonan, setTanggalPermohonan] = useState(todayStr);
  const [tanggalPengambilan, setTanggalPengambilan] = useState(todayStr);
  const [jumlahPinjaman, setJumlahPinjaman] = useState<number | ''>('');
  const [rawJumlahInput, setRawJumlahInput] = useState('');
  const [alasanPeminjaman, setAlasanPeminjaman] = useState('');
  const [caraPembayaran, setCaraPembayaran] = useState('Potong Gaji Bulanan');
  const [tenorBulan, setTenorBulan] = useState<number>(5);
  const [catatan, setCatatan] = useState('');

  // Penyetuju default resmi PT. NMSA
  const [atasanNama, setAtasanNama] = useState('Andi Muhammad Rifki');
  const [atasanJabatan, setAtasanJabatan] = useState('Direktur');
  const [financeNama, setFinanceNama] = useState('Harijon');
  const [financeJabatan, setFinanceJabatan] = useState('Direktur Keuangan');
  const [direkturNama, setDirekturNama] = useState('Andi Nursyam Halid');
  const [direkturJabatan, setDirekturJabatan] = useState('Direktur Utama');

  // UI Flow states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedLoan, setSubmittedLoan] = useState<EmployeeLoan | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isCopiedRef, setIsCopiedRef] = useState(false);

  // Auto calculate cicilan per bulan
  const cicilanPerBulan = useMemo(() => {
    if (!jumlahPinjaman || typeof jumlahPinjaman !== 'number' || tenorBulan <= 0) return 0;
    return Math.round(jumlahPinjaman / tenorBulan);
  }, [jumlahPinjaman, tenorBulan]);

  // Handle format rupiah input
  const handleJumlahChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, '');
    if (!rawVal) {
      setJumlahPinjaman('');
      setRawJumlahInput('');
      return;
    }
    const num = parseInt(rawVal, 10);
    setJumlahPinjaman(num);
    setRawJumlahInput(num.toLocaleString('id-ID'));
  };

  // Pilih dari daftar karyawan yang sudah ada
  const handleSelectWorker = (workerName: string) => {
    setNamaKaryawan(workerName);
    const found = workers.find(w => w.name.toLowerCase() === workerName.toLowerCase());
    if (found && found.role) {
      setDivisi(found.role);
    }
  };

  // Build draft preview loan object
  const draftLoan: EmployeeLoan = useMemo(() => {
    const existingLoans = getSavedEmployeeLoans();
    const nextNo = generateNextLoanNumber(existingLoans);

    return {
      id: submittedLoan?.id || 'draft-loan-' + Date.now(),
      nomorPinjaman: submittedLoan?.nomorPinjaman || nextNo,
      tanggalPermohonan: tanggalPermohonan || todayStr,
      namaKaryawan: namaKaryawan.trim() || 'Nama Karyawan',
      category: 'karyawan',
      divisi: divisi.trim() || 'Karyawan',
      alasanPeminjaman: alasanPeminjaman.trim() || 'Pencairan Kasbon / Pinjaman Dana',
      jumlahPinjaman: typeof jumlahPinjaman === 'number' ? jumlahPinjaman : 0,
      tenorBulan: tenorBulan || 1,
      cicilanPerBulan: cicilanPerBulan,
      caraPembayaran: `${caraPembayaran} (${tenorBulan} Bulan)`.trim(),
      tanggalPengambilanPinjaman: tanggalPengambilan || tanggalPermohonan || todayStr,
      status: 'Menunggu Persetujuan',
      catatan: catatan.trim() || 'Diajukan secara mandiri oleh karyawan melalui portal formulir pinjaman.',
      payments: [],
      disbursements: [],
      peminjamNama: namaKaryawan.trim() || 'Peminjam',
      peminjamJabatan: divisi.trim() || 'Karyawan',
      atasanNama,
      atasanJabatan,
      financeNama,
      financeJabatan,
      direkturNama,
      direkturJabatan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }, [
    submittedLoan,
    namaKaryawan,
    divisi,
    tanggalPermohonan,
    tanggalPengambilan,
    jumlahPinjaman,
    tenorBulan,
    cicilanPerBulan,
    caraPembayaran,
    catatan,
    atasanNama,
    atasanJabatan,
    financeNama,
    financeJabatan,
    direkturNama,
    direkturJabatan,
    todayStr
  ]);

  // Submit & Download PDF Handler
  const handleSubmitAndDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!namaKaryawan.trim()) {
      setErrorMsg('Harap masukkan Nama Karyawan yang mengajukan pinjaman.');
      return;
    }
    if (!jumlahPinjaman || typeof jumlahPinjaman !== 'number' || jumlahPinjaman <= 0) {
      setErrorMsg('Harap masukkan Jumlah Pinjaman yang valid.');
      return;
    }
    if (!alasanPeminjaman.trim()) {
      setErrorMsg('Harap isi Alasan Peminjaman dana secara jelas.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Dapatkan daftar pinjaman tersimpan dan tentukan nomor referensi resmi
      const existingLoans = getSavedEmployeeLoans();
      const officialLoanNumber = generateNextLoanNumber(existingLoans);

      const newLoanRecord: EmployeeLoan = {
        ...draftLoan,
        id: `loan-emp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        nomorPinjaman: officialLoanNumber,
        status: 'Menunggu Persetujuan',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 2. Simpan ke sistem (LocalStorage + server backend storage)
      const updatedLoans = [newLoanRecord, ...existingLoans];
      saveEmployeeLoans(updatedLoans);

      setSubmittedLoan(newLoanRecord);

      // 3. Langsung unduh file PDF resmi ke perangkat karyawan
      await downloadEmployeeLoanPdf(newLoanRecord);

    } catch (err: any) {
      console.error('Gagal mengajukan formulir pinjaman:', err);
      setErrorMsg(`Gagal memproses permohonan: ${err?.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintBrowser = () => {
    if (!submittedLoan) return;
    document.body.classList.add('is-printing-employee-loan');
    const origTitle = document.title;
    document.title = `FORM_PINJAMAN_${submittedLoan.nomorPinjaman}`;
    const cleanup = () => {
      document.body.classList.remove('is-printing-employee-loan');
      document.title = origTitle;
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 2000);
    }, 150);
  };

  const copyRefNumber = () => {
    if (!submittedLoan?.nomorPinjaman) return;
    navigator.clipboard.writeText(submittedLoan.nomorPinjaman);
    setIsCopiedRef(true);
    setTimeout(() => setIsCopiedRef(false), 2500);
  };

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-900 flex flex-col justify-between selection:bg-amber-500 selection:text-white">
      {/* Top Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <NusantaraLogo size="sm" className="h-9 w-auto" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-tight text-stone-900 uppercase">
                  PT. NUSANTARA MINERAL SUKSES ABADI
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  Portal Karyawan
                </span>
              </div>
              <p className="text-[11px] text-stone-500">
                Formulir Pengajuan Pinjaman Dana Karyawan (Edisi Khusus Karyawan)
              </p>
            </div>
          </div>

          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-250 transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Kembali</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8">
        {/* SUCCESS STATE AFTER SUBMISSION & DOWNLOAD */}
        {submittedLoan ? (
          <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-10 shadow-xl space-y-6 animate-in fade-in zoom-in-95 duration-200 text-center max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-emerald-100 border border-emerald-200 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
              <CheckCircle2 size={36} />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 inline-block">
                Permohonan Berhasil Dikirim &amp; Terunduh
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
                Formulir Pinjaman Karyawan Berhasil Dibuat!
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
                File PDF resmi telah <strong>otomatis diunduh</strong> ke perangkat Anda. Data permohonan telah tercatat di sistem keuangan untuk diproses persetujuannya.
              </p>
            </div>

            {/* Reference Number Card */}
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl max-w-md mx-auto space-y-2">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>Nomor Referensi Resmi :</span>
                <button
                  type="button"
                  onClick={copyRefNumber}
                  className="flex items-center gap-1 text-amber-700 hover:text-amber-800 font-semibold cursor-pointer"
                >
                  {isCopiedRef ? <Check size={12} /> : <Copy size={12} />}
                  <span>{isCopiedRef ? 'Tersalin' : 'Salin Nomor'}</span>
                </button>
              </div>

              <div className="text-lg font-mono font-black text-stone-900 bg-white border border-stone-200 py-2 px-3 rounded-xl tracking-wider">
                {submittedLoan.nomorPinjaman}
              </div>

              <div className="grid grid-cols-2 gap-2 text-left pt-2 text-[11px] text-stone-600 border-t border-stone-200">
                <div>
                  <span className="text-stone-400 block">Peminjam:</span>
                  <strong className="text-stone-800">{submittedLoan.namaKaryawan}</strong>
                </div>
                <div>
                  <span className="text-stone-400 block">Nominal:</span>
                  <strong className="text-stone-800">{formatRupiah(submittedLoan.jumlahPinjaman)}</strong>
                </div>
              </div>
            </div>

            {/* Actions for downloaded document */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => downloadEmployeeLoanPdf(submittedLoan)}
                className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download size={14} />
                <span>Unduh Ulang File PDF</span>
              </button>

              <button
                type="button"
                onClick={handlePrintBrowser}
                className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-stone-50 text-stone-700 border border-stone-250 text-xs font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer size={14} />
                <span>Cetak / Print Langsung</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSubmittedLoan(null);
                  setNamaKaryawan('');
                  setDivisi('');
                  setJumlahPinjaman('');
                  setRawJumlahInput('');
                  setAlasanPeminjaman('');
                  setCatatan('');
                }}
                className="w-full sm:w-auto px-5 py-2.5 text-stone-500 hover:text-stone-800 text-xs font-semibold rounded-xl hover:bg-stone-100 transition cursor-pointer"
              >
                Isi Formulir Baru
              </button>
            </div>
          </div>
        ) : (
          /* INPUT FORM */
          <div className="space-y-6">
            {/* Title Banner */}
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200/80 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="text-amber-600" size={18} />
                    <h1 className="text-base sm:text-lg font-black text-stone-900 tracking-tight">
                      Pengajuan Permohonan Pinjaman Dana Karyawan
                    </h1>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed max-w-2xl">
                    Silakan isi rincian permohonan pinjaman dana Anda. Setelah Anda menekan tombol <strong>Selesai &amp; Unduh Formulir</strong> di bagian bawah, sistem akan otomatis mengunduh berkas PDF resmi untuk diajukan ke Direksi dan Divisi Keuangan.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="px-3.5 py-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-250 rounded-xl text-xs font-bold shadow-3xs transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Eye size={13} className="text-amber-600" />
                  <span>Lihat Format Form</span>
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2 animate-in fade-in duration-150">
                <AlertCircle size={15} className="text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form Container */}
            <form onSubmit={handleSubmitAndDownload} className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5 sm:p-7 space-y-6">
              {/* SECTION 1: IDENTITAS PEMOHON */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-stone-150">
                  <User size={15} className="text-amber-600" />
                  <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                    1. Identitas Karyawan Pemohon
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nama Karyawan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-700 flex items-center justify-between">
                      <span>Nama Lengkap Karyawan <span className="text-rose-500">*</span></span>
                      {workers.length > 0 && (
                        <span className="text-[10px] text-stone-400 font-normal">
                          (Dapat dipilih dari daftar)
                        </span>
                      )}
                    </label>

                    <input
                      type="text"
                      list="karyawan-datalist"
                      value={namaKaryawan}
                      onChange={(e) => handleSelectWorker(e.target.value)}
                      placeholder="Masukkan nama lengkap pemohon..."
                      className="w-full px-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-medium"
                      required
                    />

                    <datalist id="karyawan-datalist">
                      {workers.map((w, idx) => (
                        <option key={idx} value={w.name}>{w.role || 'Karyawan'}</option>
                      ))}
                    </datalist>
                  </div>

                  {/* Divisi / Jabatan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-700">
                      Divisi / Jabatan Pekerjaan
                    </label>
                    <input
                      type="text"
                      value={divisi}
                      onChange={(e) => setDivisi(e.target.value)}
                      placeholder="Contoh: Operasional Lapangan, Keuangan, Staf, dll."
                      className="w-full px-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: RINCIAN PINJAMAN DANA */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-stone-150">
                  <Coins size={15} className="text-amber-600" />
                  <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                    2. Rincian Dana yang Diajukan
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Tanggal Permohonan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-700">
                      Tanggal Permohonan
                    </label>
                    <input
                      type="date"
                      value={tanggalPermohonan}
                      onChange={(e) => setTanggalPermohonan(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-medium"
                    />
                  </div>

                  {/* Tanggal Pengambilan Pinjaman */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-700">
                      Rencana Tanggal Pengambilan Dana
                    </label>
                    <input
                      type="date"
                      value={tanggalPengambilan}
                      onChange={(e) => setTanggalPengambilan(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-medium"
                    />
                  </div>
                </div>

                {/* Jumlah Pinjaman (Rp) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 flex items-center justify-between">
                    <span>Jumlah Pinjaman Dana (Nominal Rp) <span className="text-rose-500">*</span></span>
                    {typeof jumlahPinjaman === 'number' && jumlahPinjaman > 0 && (
                      <span className="text-[11px] font-mono font-bold text-amber-700">
                        {formatRupiah(jumlahPinjaman)}
                      </span>
                    )}
                  </label>

                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-stone-400">Rp</span>
                    <input
                      type="text"
                      value={rawJumlahInput}
                      onChange={handleJumlahChange}
                      placeholder="0"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-mono text-sm font-bold text-stone-900"
                      required
                    />
                  </div>

                  {typeof jumlahPinjaman === 'number' && jumlahPinjaman > 0 && (
                    <p className="text-[11px] text-stone-500 italic bg-stone-50 border border-stone-200/80 p-2 rounded-lg">
                      Terbilang: <strong>{terbilang(jumlahPinjaman)}</strong>
                    </p>
                  )}
                </div>

                {/* Alasan Peminjaman */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700">
                    Alasan Peminjaman Dana <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={alasanPeminjaman}
                    onChange={(e) => setAlasanPeminjaman(e.target.value)}
                    placeholder="Contoh: Pencairan Kasbon untuk biaya operasional mendesak, keperluan darurat keluarga, dll."
                    className="w-full px-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
                    required
                  />

                  {/* Suggestion Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      'Pencairan Kasbon',
                      'Keperluan Medis Mendesak',
                      'Biaya Pendidikan Anak',
                      'Renovasi Tempat Tinggal',
                      'Kebutuhan Darurat Keluarga'
                    ].map((sug, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => setAlasanPeminjaman(sug)}
                        className="px-2 py-0.5 text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md border border-stone-250 transition cursor-pointer"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SECTION 3: SKEMA PEMBAYARAN & CICILAN */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-stone-150">
                  <Calendar size={15} className="text-amber-600" />
                  <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                    3. Skema Pembayaran &amp; Angsuran
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Cara Pembayaran */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold text-stone-700">
                      Cara Pembayaran / Skema Pelunasan
                    </label>
                    <input
                      type="text"
                      value={caraPembayaran}
                      onChange={(e) => setCaraPembayaran(e.target.value)}
                      placeholder="Contoh: Potong Gaji Bulanan, Dicicil 5x, dll."
                      className="w-full px-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-medium"
                    />
                  </div>

                  {/* Tenor Bulan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-700">
                      Tenor (Bulan)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={36}
                        value={tenorBulan}
                        onChange={(e) => setTenorBulan(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-mono font-bold"
                      />
                      <span className="text-xs text-stone-500">Bulan</span>
                    </div>
                  </div>
                </div>

                {/* Cicilan per bulan estimation */}
                {typeof jumlahPinjaman === 'number' && jumlahPinjaman > 0 && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200/90 rounded-xl flex items-center justify-between text-xs text-amber-900">
                    <span className="font-medium">
                      Estimasi Angsuran per Bulan ({tenorBulan} Bulan) :
                    </span>
                    <strong className="text-sm font-mono font-black text-amber-800">
                      {formatRupiah(cicilanPerBulan)} / Bulan
                    </strong>
                  </div>
                )}

                {/* Catatan Tambahan */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700">
                    Catatan Tambahan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Tambahkan keterangan pendukung bila diperlukan..."
                    className="w-full px-3 py-2 text-xs border border-stone-250 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
                  />
                </div>
              </div>

              {/* SECTION 4: PENANDA TANGAN RESMI */}
              <div className="space-y-3 pt-2 border-t border-stone-150">
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span className="font-bold uppercase tracking-wider text-stone-500 text-[10px]">
                    Struktur Penanda Tangan Persetujuan:
                  </span>
                  <span className="text-[11px] text-stone-400">
                    (Format tanda tangan resmi PT. NMSA)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-stone-50 border border-stone-200 p-3 rounded-xl">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-stone-400 uppercase">1. Peminjam</span>
                    <p className="font-bold text-stone-800 truncate">{namaKaryawan || 'Karyawan'}</p>
                    <p className="text-[10px] text-stone-500 truncate">{divisi || 'Pemohon'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-stone-400 uppercase">2. Atasan</span>
                    <p className="font-bold text-stone-800 truncate">{atasanNama}</p>
                    <p className="text-[10px] text-stone-500 truncate">{atasanJabatan}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-stone-400 uppercase">3. Keuangan</span>
                    <p className="font-bold text-stone-800 truncate">{financeNama}</p>
                    <p className="text-[10px] text-stone-500 truncate">{financeJabatan}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-stone-400 uppercase">4. Direktur Utama</span>
                    <p className="font-bold text-stone-800 truncate">{direkturNama}</p>
                    <p className="text-[10px] text-stone-500 truncate">{direkturJabatan}</p>
                  </div>
                </div>
              </div>

              {/* SUBMIT BUTTON */}
              <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-[11px] text-stone-500 text-center sm:text-left">
                  Dengan mengklik tombol di samping, formulir resmi PDF akan dibuat dan <strong>otomatis terunduh</strong> ke perangkat Anda.
                </p>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Pratinjau
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Membuat &amp; Mengunduh PDF...</span>
                      </>
                    ) : (
                      <>
                        <Download size={15} />
                        <span>Selesai &amp; Unduh Formulir PDF</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 py-4 text-center text-xs text-stone-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>PT. Nusantara Mineral Sukses Abadi &bull; Sistem Pinjaman Karyawan</span>
          <span className="text-[11px] text-stone-400 font-mono">
            {new Date().getFullYear()} &copy; Hak Cipta Dilindungi
          </span>
        </div>
      </footer>

      {/* PREVIEW MODAL */}
      {isPreviewOpen && (
        <div 
          className="fixed inset-0 z-50 bg-stone-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => setIsPreviewOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-amber-600" />
                <h3 className="text-xs font-bold text-stone-800">
                  Pratinjau Formulir Resmi: FORM PINJAMAN KARYAWAN
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-stone-200/50 flex justify-center">
              <div className="bg-white shadow-xl scale-95 sm:scale-100 origin-top">
                <EmployeeLoanDocument
                  loan={draftLoan}
                  showPaymentLedger={false}
                  showKopSurat={true}
                />
              </div>
            </div>

            <div className="p-3.5 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-1.5 text-xs font-bold text-stone-600 hover:text-stone-800 hover:bg-stone-200 rounded-lg transition"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

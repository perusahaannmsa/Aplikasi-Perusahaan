import React, { useState, useEffect } from 'react';
import { NusantaraLogo } from './NusantaraLogo';
import { PrintSppdDocument, terbilangRupiah } from './PrintSppdDocument';
import { SPPDRecord, SPPDCostItem } from './SppdManager';
import { 
  JabatanDinas, 
  getPedomanByJabatan, 
  getStoredPedomanMatrix 
} from '../data/pedomanBiaya';
import { 
  saveSppdRecordsToFirestore, 
  loadSppdRecordsFromFirestore 
} from '../firebase';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Save, 
  Calendar, 
  MapPin, 
  User, 
  Briefcase, 
  CheckCircle2, 
  Printer, 
  Copy, 
  Check, 
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Building,
  Navigation
} from 'lucide-react';
import { formatDateIndonesian } from '../utils';

interface PublicSppdInputProps {
  onBackToHome?: () => void;
}

export const PublicSppdInput: React.FC<PublicSppdInputProps> = ({ onBackToHome }) => {
  const [pemberiPerintah, setPemberiPerintah] = useState('H. A. Nursyam Halid');
  const [pemberiPerintahJabatan, setPemberiPerintahJabatan] = useState('Direktur Utama');
  const [namaPekerja, setNamaPekerja] = useState('');
  const [jabatan, setJabatan] = useState<JabatanDinas>('Staff');
  const [divisi, setDivisi] = useState('Operasional Lapangan');
  const [kotaAsal, setKotaAsal] = useState('Jakarta (HO)');
  const [kotaTujuan, setKotaTujuan] = useState('');
  const [transportasi, setTransportasi] = useState('Pesawat Komersial');
  const [lamaPerjalanan, setLamaPerjalanan] = useState('3 Hari 2 Malam');
  
  const todayStr = new Date().toISOString().split('T')[0];
  const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [tanggalMulai, setTanggalMulai] = useState(todayStr);
  const [tanggalSelesai, setTanggalSelesai] = useState(threeDaysLater);
  const [tujuanPerjalanan, setTujuanPerjalanan] = useState('');
  const [keteranganSppd, setKeteranganSppd] = useState('');

  const [noSppd, setNoSppd] = useState(() => {
    const monthRoman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][new Date().getMonth()];
    const year = new Date().getFullYear();
    const rand = Math.floor(100 + Math.random() * 900);
    return `SPPD-NMSA/${monthRoman}/${year}/${rand}`;
  });

  const [costItems, setCostItems] = useState<SPPDCostItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<SPPDRecord | null>(null);
  const [showPrintView, setShowPrintView] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Auto populate standard cost items when Jabatan or dates change
  const applyStandardCostItems = (selectedJabatan: JabatanDinas) => {
    const pedoman = getPedomanByJabatan(selectedJabatan);
    
    // Estimate days
    let days = 3;
    try {
      const d1 = new Date(tanggalMulai).getTime();
      const d2 = new Date(tanggalSelesai).getTime();
      const diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0 && diff < 60) days = diff;
    } catch {}

    const items: SPPDCostItem[] = [
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Uang Makan Harian',
        rincian: `${days} Hari @ Rp ${pedoman.uangMakanPerHari.toLocaleString('id-ID')}`,
        hargaAcuan: pedoman.uangMakanPerHari * days,
        jumlah: pedoman.uangMakanPerHari * days,
      },
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Uang Saku Per Hari',
        rincian: `${days} Hari @ Rp ${pedoman.uangSakuPerHari.toLocaleString('id-ID')}`,
        hargaAcuan: pedoman.uangSakuPerHari * days,
        jumlah: pedoman.uangSakuPerHari * days,
      },
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Transportasi Lokal (JKT & PP)',
        rincian: 'Transportasi ke/dari Bandara',
        hargaAcuan: pedoman.transportJkt + pedoman.transportBandara,
        jumlah: pedoman.transportJkt + pedoman.transportBandara,
      },
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Tiket Transportasi (Pesawat/KA)',
        rincian: `Tiket PP (${kotaAsal || 'Jakarta'} - ${kotaTujuan || 'Site/Tujuan'})`,
        hargaAcuan: pedoman.tiketPesawatRate,
        jumlah: pedoman.tiketPesawatRate,
      },
      {
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        kategori: 'Akomodasi & Hotel Penginapan',
        rincian: `${Math.max(1, days - 1)} Malam @ Rp ${pedoman.hotelPerMalam.toLocaleString('id-ID')}`,
        hargaAcuan: pedoman.hotelPerMalam * Math.max(1, days - 1),
        jumlah: pedoman.hotelPerMalam * Math.max(1, days - 1),
      }
    ];

    setCostItems(items);
  };

  useEffect(() => {
    applyStandardCostItems(jabatan);
  }, [jabatan]);

  const handleCostItemChange = (index: number, field: keyof SPPDCostItem, value: any) => {
    const updated = [...costItems];
    updated[index] = { ...updated[index], [field]: value };
    setCostItems(updated);
  };

  const handleAddCostItem = () => {
    setCostItems([
      ...costItems,
      {
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
        kategori: 'Biaya Lainnya / Operasional Lapangan',
        rincian: 'Sesuai kebutuhan dinas riil',
        hargaAcuan: 0,
        jumlah: 0
      }
    ]);
  };

  const handleRemoveCostItem = (index: number) => {
    setCostItems(costItems.filter((_, i) => i !== index));
  };

  const totalCost = costItems.reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!namaPekerja.trim()) {
      setErrorMessage('Mohon lengkapi Nama Pegawai yang melaksanakan dinas.');
      return;
    }
    if (!kotaTujuan.trim()) {
      setErrorMessage('Mohon tentukan Kota / Lokasi Tujuan Perjalanan Dinas.');
      return;
    }
    if (!tujuanPerjalanan.trim()) {
      setErrorMessage('Mohon jelaskan Maksud & Tujuan Perjalanan Dinas.');
      return;
    }

    setIsSubmitting(true);

    const newRecord: SPPDRecord = {
      id: 'sppd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      noSppd: noSppd.trim() || `SPPD-NMSA/2026/${Math.floor(100 + Math.random() * 900)}`,
      hariTanggal: formatDateIndonesian(tanggalMulai),
      pemberiPerintah,
      pemberiPerintahJabatan,
      namaPekerja: namaPekerja.trim(),
      jabatan,
      divisi,
      kotaAsal,
      kotaTujuan: kotaTujuan.trim(),
      transportasi,
      lamaPerjalanan,
      tanggalMulai,
      tanggalSelesai,
      tujuanPerjalanan: tujuanPerjalanan.trim(),
      keteranganSppd: keteranganSppd.trim(),
      costItems,
      pemberiPerintahName: pemberiPerintah,
      sppdDisetujuiName: 'Harijon',
      sppdDisetujuiJabatan: 'Head of Operational',
      status: 'Disetujui',
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Simpan ke server backend via /api/sppd
      await fetch('/api/sppd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: newRecord })
      }).catch(err => console.warn('Gagal simpan ke /api/sppd:', err));

      // 2. Simpan ke Firestore
      await saveSppdRecordsToFirestore([newRecord]).catch(err => console.warn('Firestore err:', err));

      // 3. Simpan ke local storage
      try {
        const stored = localStorage.getItem('sppd_records_v1');
        const list: SPPDRecord[] = stored ? JSON.parse(stored) : [];
        const filtered = list.filter(r => r.id !== newRecord.id && r.noSppd !== newRecord.noSppd);
        filtered.unshift(newRecord);
        localStorage.setItem('sppd_records_v1', JSON.stringify(filtered));
      } catch (err) {}

      setSubmittedRecord(newRecord);
    } catch (err: any) {
      setErrorMessage('Terjadi kendala saat menyimpan SPPD: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  // IF USER CLICKED PRINT/PREVIEW OF THE SUBMITTED SPPD
  if (showPrintView && submittedRecord) {
    return (
      <div className="min-h-screen bg-stone-100 py-6 px-3 sm:px-6">
        <PrintSppdDocument
          sppd={submittedRecord}
          onBack={() => setShowPrintView(false)}
          isPublicView={true}
        />
      </div>
    );
  }

  // SUCCESS CONFIRMATION SCREEN
  if (submittedRecord) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-2xl w-full bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-6 animate-fade-in">
          
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 size={36} />
          </div>

          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Pengajuan SPPD Berhasil Disimpan
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 mt-3 font-display">
              Surat Perintah Perjalanan Dinas Resmi Dibuat!
            </h2>
            <p className="text-xs sm:text-sm text-stone-500 mt-1.5 font-sans">
              Nomor: <strong className="font-mono text-stone-900">{submittedRecord.noSppd}</strong> &bull; Pegawai: <strong>{submittedRecord.namaPekerja}</strong>
            </p>
          </div>

          {/* RINGKASAN DATA */}
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-left text-xs font-sans space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Rute Dinas</span>
                <span className="font-bold text-stone-900">{submittedRecord.kotaAsal} &rarr; {submittedRecord.kotaTujuan}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Waktu Pelaksanaan</span>
                <span className="font-semibold text-stone-800">{submittedRecord.tanggalMulai} s.d {submittedRecord.tanggalSelesai}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Jabatan / Divisi</span>
                <span className="font-semibold text-stone-800">{submittedRecord.jabatan} ({submittedRecord.divisi})</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Total Anggaran SPPD</span>
                <span className="font-black font-mono text-amber-700">Rp {(submittedRecord.costItems || []).reduce((a, c) => a + (c.jumlah || 0), 0).toLocaleString('id-ID')}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-stone-200">
              <span className="text-stone-400 block text-[10px] uppercase font-bold">Maksud Perjalanan Dinas:</span>
              <p className="text-stone-800 italic mt-0.5">{submittedRecord.tujuanPerjalanan}</p>
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowPrintView(true)}
              className="w-full sm:w-auto px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer size={16} />
              <span>Pratinjau &amp; Cetak SPPD (Format Resmi)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSubmittedRecord(null);
                setNamaPekerja('');
                setKotaTujuan('');
                setTujuanPerjalanan('');
                setKeteranganSppd('');
                const monthRoman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][new Date().getMonth()];
                const year = new Date().getFullYear();
                const rand = Math.floor(100 + Math.random() * 900);
                setNoSppd(`SPPD-NMSA/${monthRoman}/${year}/${rand}`);
                applyStandardCostItems(jabatan);
              }}
              className="w-full sm:w-auto px-5 py-3 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={15} />
              <span>Input SPPD Baru Lainnya</span>
            </button>
          </div>

          {onBackToHome && (
            <div className="pt-3 border-t border-stone-150">
              <button
                type="button"
                onClick={onBackToHome}
                className="text-xs text-stone-500 hover:text-stone-800 font-bold underline cursor-pointer"
              >
                Kembali ke Aplikasi Utama
              </button>
            </div>
          )}

        </div>
      </div>
    );
  }

  // MAIN FORM INPUT
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col antialiased">
      
      {/* HEADER PORTAL */}
      <header className="bg-stone-900 text-white border-b border-stone-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <NusantaraLogo size="sm" className="h-10 w-auto object-contain" />
            <div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-amber-400 font-bold block">
                Portal Formulir Mandiri
              </span>
              <h1 className="text-xs sm:text-sm font-black tracking-tight">
                PT. Nusantara Mineral Sukses Abadi
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer border border-stone-700"
              title="Salin Tautan Formulir Ini"
            >
              {isCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{isCopied ? 'Tersalin' : 'Bagikan Link'}</span>
            </button>

            {onBackToHome && (
              <button
                type="button"
                onClick={onBackToHome}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-3.5 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-3xs"
              >
                <ArrowLeft size={13} />
                <span>Masuk Admin</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* FORM CONTENT CONTAINER */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* HERO CARD INFO */}
        <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
                Formulir Resmi
              </span>
              <span className="text-stone-400 text-xs font-mono">&bull; Standard Corporate Format</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-stone-900 font-display">
              Surat Perintah Perjalanan Dinas (SPPD)
            </h2>
            <p className="text-xs text-stone-500 leading-relaxed font-sans max-w-2xl">
              Isi data penugasan dinas luar kota, transportasi, dan rincian biaya sesuai pedoman tarif perusahaan. Setelah disimpan, dokumen SPPD resmi dapat langsung dicetak atau diunduh ke PDF dengan kop surat resmi PT. Nusantara Mineral Sukses Abadi.
            </p>
          </div>
          
          <div className="bg-stone-50 border border-stone-200 p-3 rounded-2xl text-xs font-mono text-stone-600 text-right shrink-0">
            <span className="block text-[10px] text-stone-400 uppercase font-bold">Alamat Kantor Pusat:</span>
            <span className="font-semibold text-stone-800 text-[11px] block mt-0.5">Jl. Raya Pasar Minggu Kav. 2B-C</span>
            <span className="text-[10px] text-stone-500 block">Pancoran, Jakarta Selatan 12780</span>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs font-bold text-rose-800 flex items-center gap-2 animate-fade-in">
            <Trash2 size={16} className="text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* MAIN FORM */}
        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-8 shadow-sm space-y-6">
          
          {/* SECTION 1: NOMOR & PEJABAT PEMBERI PERINTAH */}
          <div className="border-b border-stone-150 pb-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono mb-4 flex items-center gap-2">
              <ShieldCheck size={16} />
              <span>I. Data Surat &amp; Pejabat Pemberi Perintah</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Nomor SPPD Resmi
                </label>
                <input
                  type="text"
                  value={noSppd}
                  onChange={(e) => setNoSppd(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-mono font-bold text-stone-900 bg-stone-50 focus:bg-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Pejabat yang Memberi Perintah
                </label>
                <input
                  type="text"
                  value={pemberiPerintah}
                  onChange={(e) => setPemberiPerintah(e.target.value)}
                  placeholder="H. A. Nursyam Halid"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Jabatan Pejabat Pemberi Perintah
                </label>
                <input
                  type="text"
                  value={pemberiPerintahJabatan}
                  onChange={(e) => setPemberiPerintahJabatan(e.target.value)}
                  placeholder="Direktur Utama"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: IDENTITAS PEGAWAI YANG DIPERINTAHKAN */}
          <div className="border-b border-stone-150 pb-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono mb-4 flex items-center gap-2">
              <User size={16} />
              <span>II. Identitas Pegawai yang Diperintahkan</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Nama Lengkap Pegawai <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={namaPekerja}
                  onChange={(e) => setNamaPekerja(e.target.value)}
                  placeholder="Contoh: Nur Wahyudi"
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Pangkat / Tingkat Jabatan
                </label>
                <select
                  value={jabatan}
                  onChange={(e) => {
                    const newJ = e.target.value as JabatanDinas;
                    setJabatan(newJ);
                    applyStandardCostItems(newJ);
                  }}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-semibold text-stone-900 bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Direktur">Direktur</option>
                  <option value="General Manager">General Manager</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Staff">Staff</option>
                  <option value="Non Staff / Driver / Helper">Non Staff / Driver / Helper</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Divisi / Unit Kerja
                </label>
                <input
                  type="text"
                  value={divisi}
                  onChange={(e) => setDivisi(e.target.value)}
                  placeholder="Contoh: Operasional Lapangan / Finance HO"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: DETAIL RUTE, TANGGAL & MAKSUD DINAS */}
          <div className="border-b border-stone-150 pb-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono mb-4 flex items-center gap-2">
              <Navigation size={16} />
              <span>III. Rute, Waktu, &amp; Maksud Perjalanan Dinas</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Tempat Berangkat (Kota Asal)
                </label>
                <input
                  type="text"
                  value={kotaAsal}
                  onChange={(e) => setKotaAsal(e.target.value)}
                  placeholder="Jakarta (HO)"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl font-semibold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Tempat Tujuan (Kota / Site) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={kotaTujuan}
                  onChange={(e) => setKotaTujuan(e.target.value)}
                  placeholder="Contoh: Site Kolaka / Kendari"
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Alat Angkut / Transportasi
                </label>
                <input
                  type="text"
                  value={transportasi}
                  onChange={(e) => setTransportasi(e.target.value)}
                  placeholder="Pesawat + Mobil Double Cabin"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Lamanya Perjalanan
                </label>
                <input
                  type="text"
                  value={lamaPerjalanan}
                  onChange={(e) => setLamaPerjalanan(e.target.value)}
                  placeholder="3 Hari 2 Malam"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Tanggal Berangkat
                </label>
                <input
                  type="date"
                  value={tanggalMulai}
                  onChange={(e) => {
                    setTanggalMulai(e.target.value);
                    applyStandardCostItems(jabatan);
                  }}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Tanggal Harus Kembali
                </label>
                <input
                  type="date"
                  value={tanggalSelesai}
                  onChange={(e) => {
                    setTanggalSelesai(e.target.value);
                    applyStandardCostItems(jabatan);
                  }}
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Maksud &amp; Tujuan Perjalanan Dinas <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={tujuanPerjalanan}
                  onChange={(e) => setTujuanPerjalanan(e.target.value)}
                  placeholder="Contoh: Pengawasan lapangan, verifikasi aset tambang mineral, dan rekonsiliasi operasional site."
                  className="w-full px-3 py-2 border border-stone-300 rounded-xl text-stone-900 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Keterangan Lain-lain (Opsional)
                </label>
                <input
                  type="text"
                  value={keteranganSppd}
                  onChange={(e) => setKeteranganSppd(e.target.value)}
                  placeholder="Contoh: Tiket dan kwitansi hotel dilampirkan setelah kembali ke kantor pusat."
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: RINCIAN BIAYA & PLAFON ANGGARAN */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono flex items-center gap-2">
                <FileText size={16} />
                <span>IV. Rincian Anggaran / Plafon Biaya Dinas</span>
              </h3>

              <button
                type="button"
                onClick={handleAddCostItem}
                className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl border border-stone-200 transition flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} />
                <span>Tambah Item Biaya</span>
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {costItems.map((item, idx) => (
                <div key={item.id || idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs">
                  <div className="sm:col-span-4">
                    <span className="text-[10px] font-bold text-stone-400 block uppercase">Komponen</span>
                    <input
                      type="text"
                      value={item.kategori}
                      onChange={(e) => handleCostItemChange(idx, 'kategori', e.target.value)}
                      className="w-full px-2 py-1.5 border border-stone-200 rounded-lg font-semibold text-stone-900 bg-white"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <span className="text-[10px] font-bold text-stone-400 block uppercase">Rincian Perhitungan</span>
                    <input
                      type="text"
                      value={item.rincian}
                      onChange={(e) => handleCostItemChange(idx, 'rincian', e.target.value)}
                      className="w-full px-2 py-1.5 border border-stone-200 rounded-lg text-stone-800 bg-white"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <span className="text-[10px] font-bold text-stone-400 block uppercase">Jumlah Biaya (Rp)</span>
                    <input
                      type="number"
                      value={item.jumlah}
                      onChange={(e) => handleCostItemChange(idx, 'jumlah', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-stone-300 rounded-lg font-mono font-bold text-stone-900 bg-white text-right"
                    />
                  </div>

                  <div className="sm:col-span-1 text-center pt-3 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => handleRemoveCostItem(idx)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                      title="Hapus Baris"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* TOTAL ESTIMASI */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-black uppercase text-amber-900 block">
                  TOTAL ESTIMASI ANGGARAN SPPD:
                </span>
                <span className="text-xs text-amber-800 italic font-medium">
                  Terbilang: &quot;{terbilangRupiah(totalCost)}&quot;
                </span>
              </div>

              <div className="text-right">
                <span className="text-xl font-black font-mono text-amber-950">
                  Rp {totalCost.toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-stone-500 flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-emerald-600 shrink-0" />
              <span>Data SPPD akan langsung terekam ke sistem administrasi HO dan siap diproses ke Voucher Pengeluaran.</span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-8 py-3.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-400 text-white text-xs font-black rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Save size={16} />
              <span>{isSubmitting ? 'Menyimpan SPPD...' : 'Simpan & Dapatkan Dokumen SPPD'}</span>
            </button>
          </div>

        </form>

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-stone-200 py-5 text-center text-xs font-mono text-stone-500">
        PT. Nusantara Mineral Sukses Abadi &bull; Jl. Raya Pasar Minggu Kav. 2B-C, RT.2/RW.2, Pancoran, Jakarta Selatan 12780
      </footer>

    </div>
  );
};

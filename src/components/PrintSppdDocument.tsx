import React, { useState } from 'react';
import { SPPDRecord } from './SppdManager';
import { NusantaraLogo } from './NusantaraLogo';
import { Printer, ArrowLeft, Download, CheckCircle, FileText, MapPin, Calendar, User, Briefcase, Share2, Copy, Check } from 'lucide-react';
import { formatDateIndonesian } from '../utils';

interface PrintSppdDocumentProps {
  sppd: SPPDRecord;
  onBack?: () => void;
  onEdit?: () => void;
  onPostToVoucher?: () => void;
  isPublicView?: boolean;
}

// Convert number to Indonesian words
function terbilangAngka(nominal: number): string {
  const bilangan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  nominal = Math.floor(Math.abs(nominal));
  
  if (nominal < 12) {
    return bilangan[nominal];
  } else if (nominal < 20) {
    return terbilangAngka(nominal - 10) + ' Belas';
  } else if (nominal < 100) {
    return terbilangAngka(Math.floor(nominal / 10)) + ' Puluh ' + terbilangAngka(nominal % 10);
  } else if (nominal < 200) {
    return 'Seratus ' + terbilangAngka(nominal - 100);
  } else if (nominal < 1000) {
    return terbilangAngka(Math.floor(nominal / 100)) + ' Ratus ' + terbilangAngka(nominal % 100);
  } else if (nominal < 2000) {
    return 'Seribu ' + terbilangAngka(nominal - 1000);
  } else if (nominal < 1000000) {
    return terbilangAngka(Math.floor(nominal / 1000)) + ' Ribu ' + terbilangAngka(nominal % 1000);
  } else if (nominal < 1000000000) {
    return terbilangAngka(Math.floor(nominal / 1000000)) + ' Juta ' + terbilangAngka(nominal % 1000000);
  } else if (nominal < 1000000000000) {
    return terbilangAngka(Math.floor(nominal / 1000000000)) + ' Miliar ' + terbilangAngka(nominal % 1000000000);
  }
  return '';
}

export function terbilangRupiah(nominal: number): string {
  if (!nominal || nominal === 0) return 'Nol Rupiah';
  const hasil = terbilangAngka(nominal).replace(/\s+/g, ' ').trim();
  return hasil + ' Rupiah';
}

export const PrintSppdDocument: React.FC<PrintSppdDocumentProps> = ({
  sppd,
  onBack,
  onEdit,
  onPostToVoucher,
  isPublicView = false,
}) => {
  const [includeVisum, setIncludeVisum] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const totalBiaya = (sppd.costItems || []).reduce((acc, curr) => acc + (curr.jumlah || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/sppd-view?id=${encodeURIComponent(sppd.id || sppd.noSppd)}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="w-full flex flex-col items-center print:items-start text-stone-900">
      
      {/* ACTION BAR (HIDDEN IN PRINT) */}
      <div className="w-full max-w-5xl bg-white border border-stone-200 rounded-2xl p-4 mb-6 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Kembali</span>
            </button>
          )}
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 block">
              Pratinjau &amp; Cetak SPPD Resmi
            </span>
            <h2 className="text-sm font-black text-stone-900 font-display">
              {sppd.noSppd} &bull; {sppd.namaPekerja}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer select-none text-stone-700 hover:bg-stone-100">
            <input
              type="checkbox"
              checked={includeVisum}
              onChange={(e) => setIncludeVisum(e.target.checked)}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
            <span>Sertakan Lembar Visum Lapangan (Hal 2)</span>
          </label>

          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            title="Salin tautan dokumen SPPD ini"
          >
            {isCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{isCopied ? 'Link Tersalin!' : 'Bagikan Link'}</span>
          </button>

          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="px-3.5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Edit SPPD
            </button>
          )}

          {onPostToVoucher && (
            <button
              type="button"
              onClick={onPostToVoucher}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>Posting ke Voucher HO</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <Printer size={15} />
            <span>Cetak SPPD (Print / PDF)</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HALAMAN 1: SURAT PERINTAH PERJALANAN DINAS (SPPD) & RINCIAN BIAYA         */}
      {/* ========================================================================= */}
      <div className="w-[210mm] min-h-[297mm] bg-white p-[10mm] sm:p-[12mm] border border-stone-300 shadow-xl rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full page-break box-border font-serif text-[12px] leading-relaxed">
        
        {/* KOP SURAT RESMI PERUSAHAAN */}
        <div className="border-b-[2.5px] border-black pb-2 mb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="shrink-0">
              <NusantaraLogo size="md" className="h-16 w-auto object-contain" />
            </div>
            <div className="flex-1 text-center font-sans">
              <h1 className="text-base sm:text-lg font-black uppercase tracking-wider text-black">
                PT. NUSANTARA MINERAL SUKSES ABADI
              </h1>
              <p className="text-[10px] sm:text-[11px] text-black font-semibold mt-0.5 leading-snug">
                Jl. Raya Pasar Minggu Kav. 2B-C, RT.2/RW.2, Pancoran, Kecamatan Pancoran,<br />
                Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta, Kode Pos 12780
              </p>
              <p className="text-[9px] text-stone-600 font-mono mt-0.5">
                Email: info@nmsa.co.id &bull; Telp / WA: +62 821-8888-0000
              </p>
            </div>
            <div className="w-16 hidden sm:block shrink-0" />
          </div>
          {/* Garis Tipis Tambahan Kop Surat */}
          <div className="border-b border-black mt-1" />
        </div>

        {/* JUDUL DOKUMEN & NOMOR */}
        <div className="text-center my-3 font-sans">
          <h2 className="text-sm sm:text-base font-black uppercase tracking-widest text-black underline underline-offset-4">
            SURAT PERINTAH PERJALANAN DINAS (SPPD)
          </h2>
          <div className="text-xs font-mono font-bold text-black mt-1">
            Nomor: <span className="bg-stone-100 px-2 py-0.5 border border-stone-300 rounded font-black">{sppd.noSppd}</span>
          </div>
        </div>

        {/* TABEL FORMAT STANDAR SPPD NASIONAL */}
        <table className="w-full border-collapse border border-black text-[11px] sm:text-[12px] mb-3">
          <tbody>
            <tr className="border-b border-black">
              <td className="w-8 border-r border-black p-1.5 text-center font-bold font-sans">1.</td>
              <td className="w-64 border-r border-black p-1.5 font-bold font-sans">Pejabat Berwenang yang Memberi Perintah</td>
              <td className="p-1.5 font-sans font-semibold">
                {sppd.pemberiPerintah} <span className="text-stone-600 font-normal">({sppd.pemberiPerintahJabatan || 'Direktur Utama'})</span>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">2.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">Nama Pegawai yang Diperintahkan</td>
              <td className="p-1.5 font-sans font-bold text-stone-900">
                {sppd.namaPekerja}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">3.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">
                a. Pangkat / Golongan / Jabatan<br />
                b. Divisi / Unit Kerja
              </td>
              <td className="p-1.5 font-sans">
                a. <span className="font-semibold">{sppd.jabatan}</span><br />
                b. <span>{sppd.divisi || 'Operasional Lapangan & HO'}</span>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">4.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">Maksud &amp; Tujuan Perjalanan Dinas</td>
              <td className="p-1.5 font-sans font-semibold leading-snug text-stone-850">
                {sppd.tujuanPerjalanan}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">5.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">Alat Angkut / Transportasi yang Digunakan</td>
              <td className="p-1.5 font-sans">
                {sppd.transportasi}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">6.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">
                a. Tempat Berangkat (Asal)<br />
                b. Tempat Tujuan
              </td>
              <td className="p-1.5 font-sans">
                a. <strong>{sppd.kotaAsal}</strong><br />
                b. <strong>{sppd.kotaTujuan}</strong>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">7.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">
                a. Lamanya Perjalanan Dinas<br />
                b. Tanggal Berangkat<br />
                c. Tanggal Harus Kembali / Tiba
              </td>
              <td className="p-1.5 font-sans">
                a. <span className="font-semibold">{sppd.lamaPerjalanan}</span><br />
                b. <span>{formatDateIndonesian(sppd.tanggalMulai)}</span><br />
                c. <span>{formatDateIndonesian(sppd.tanggalSelesai)}</span>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">8.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">
                Pembebanan Anggaran<br />
                <span className="text-[10px] font-normal text-stone-500 font-sans">a. Entitas Perusahaan<br />b. Akun Pembebanan</span>
              </td>
              <td className="p-1.5 font-sans">
                a. <strong>PT. Nusantara Mineral Sukses Abadi</strong><br />
                b. <span>Beban Perjalanan Dinas Operasional (Akun 600015)</span>
              </td>
            </tr>

            <tr>
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">9.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">Keterangan Lain-lain</td>
              <td className="p-1.5 font-sans text-stone-700 italic text-[11px]">
                {sppd.keteranganSppd || 'Semua bukti tiket, boarding pass, kwitansi hotel, dan bukti transportasi wajib dilampirkan.'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABEL RINCIAN BIAYA & PLAFON SPPD */}
        <div className="mb-3 font-sans">
          <div className="text-[11px] font-black uppercase tracking-wider text-black mb-1 flex items-center justify-between">
            <span>Rincian Biaya &amp; Anggaran Perjalanan Dinas (Plafon / Realisasi):</span>
            <span className="text-[10px] font-mono text-stone-500">Mata Uang: IDR (Rupiah)</span>
          </div>
          <table className="w-full border-collapse border border-black text-[10.5px]">
            <thead>
              <tr className="bg-stone-100 border-b border-black font-bold uppercase text-center">
                <th className="border-r border-black p-1 w-8">No</th>
                <th className="border-r border-black p-1 text-left">Komponen / Kategori Biaya</th>
                <th className="border-r border-black p-1 text-left w-52">Rincian / Catatan Perhitungan</th>
                <th className="border-r border-black p-1 text-right w-24">Tarif Acuan</th>
                <th className="p-1 text-right w-28">Jumlah (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {(sppd.costItems || []).map((item, idx) => (
                <tr key={item.id || idx} className="border-b border-black">
                  <td className="border-r border-black p-1 text-center font-mono">{idx + 1}</td>
                  <td className="border-r border-black p-1 font-semibold">{item.kategori}</td>
                  <td className="border-r border-black p-1 text-stone-700">{item.rincian}</td>
                  <td className="border-r border-black p-1 text-right font-mono text-stone-600">
                    {item.hargaAcuan ? item.hargaAcuan.toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="p-1 text-right font-mono font-bold">
                    {item.jumlah ? item.jumlah.toLocaleString('id-ID') : '0'}
                  </td>
                </tr>
              ))}
              <tr className="border-t-[1.5px] border-black bg-stone-50 font-bold">
                <td colSpan={4} className="border-r border-black p-1.5 text-center uppercase tracking-wider text-xs">
                  TOTAL BIAYA PERJALANAN DINAS
                </td>
                <td className="p-1.5 text-right font-mono text-xs font-black">
                  Rp {totalBiaya.toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>

          {/* TERBILANG BOX */}
          <div className="border border-black border-t-0 p-1.5 bg-stone-50/50 text-[10.5px] flex gap-2">
            <span className="font-bold shrink-0">Terbilang:</span>
            <span className="italic font-semibold text-stone-900">"{terbilangRupiah(totalBiaya)}"</span>
          </div>
        </div>

        {/* KOLOM TANDA TANGAN & PENGESAHAN RESMI (3 PIHAK) */}
        <div className="pt-2 font-sans">
          <div className="flex justify-end text-[11px] mb-2 font-medium">
            <span>Dikeluarkan di: <strong>Jakarta</strong>, Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalMulai)}</strong></span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10.5px]">
            {/* 1. Yang Melaksanakan Perintah */}
            <div className="flex flex-col items-center justify-between min-h-[95px] p-1 border border-stone-200 rounded">
              <span className="font-semibold text-stone-700">Pegawai yang Diperintahkan,</span>
              <div className="mt-12">
                <span className="border-b border-black font-bold uppercase block px-2 leading-tight">
                  {sppd.namaPekerja}
                </span>
                <span className="text-[9.5px] text-stone-500 font-mono block mt-0.5">
                  {sppd.jabatan}
                </span>
              </div>
            </div>

            {/* 2. Mengetahui / Head of Ops */}
            <div className="flex flex-col items-center justify-between min-h-[95px] p-1 border border-stone-200 rounded">
              <span className="font-semibold text-stone-700">Mengetahui / Menyetujui,</span>
              <div className="mt-12">
                <span className="border-b border-black font-bold uppercase block px-2 leading-tight">
                  {sppd.sppdDisetujuiName || 'Harijon'}
                </span>
                <span className="text-[9.5px] text-stone-500 font-mono block mt-0.5">
                  {sppd.sppdDisetujuiJabatan || 'Head of Operational'}
                </span>
              </div>
            </div>

            {/* 3. Pejabat Pemberi Perintah / Direktur */}
            <div className="flex flex-col items-center justify-between min-h-[95px] p-1 border border-stone-200 rounded">
              <span className="font-semibold text-stone-700">Pejabat Pemberi Perintah,</span>
              <div className="mt-12">
                <span className="border-b border-black font-bold uppercase block px-2 leading-tight">
                  {sppd.pemberiPerintah}
                </span>
                <span className="text-[9.5px] text-stone-500 font-mono block mt-0.5">
                  {sppd.pemberiPerintahJabatan || 'Direktur Utama'}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* HALAMAN 2: LEMBAR VISUM & CATATAN KEDATANGAN / KEBERANGKATAN LAPANGAN     */}
      {/* ========================================================================= */}
      {includeVisum && (
        <div className="w-[210mm] min-h-[297mm] bg-white p-[10mm] sm:p-[12mm] border border-stone-300 shadow-xl rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full page-break box-border font-serif text-[11px] leading-relaxed mt-6 print:mt-0">
          
          {/* HEADER VISUM */}
          <div className="border-b-[2px] border-black pb-2 mb-4 font-sans flex items-center justify-between">
            <div>
              <h2 className="text-xs sm:text-sm font-black uppercase text-black">
                LEMBAR VISUM &amp; KEDATANGAN / KEBERANGKATAN DINAS LAPANGAN
              </h2>
              <p className="text-[10px] text-stone-600 font-mono">
                Lampiran SPPD No: <strong>{sppd.noSppd}</strong> &bull; Pegawai: <strong>{sppd.namaPekerja}</strong>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold border border-black px-2 py-1 bg-stone-50">
                HALAMAN 2 (VISUM)
              </span>
            </div>
          </div>

          <p className="text-[10px] font-sans text-stone-600 italic mb-3">
            * Lembar visum ini wajib diisi dan dicap/ditandatangani oleh pimpinan/penanggung jawab di setiap lokasi tujuan perjalan dinas.
          </p>

          {/* TABEL VISUM 4 POSISI */}
          <div className="grid grid-cols-2 border border-black text-xs font-sans">
            
            {/* POS 1: Keberangkatan dari Kantor Asal */}
            <div className="border-r border-b border-black p-3 space-y-2 min-h-[140px] flex flex-col justify-between">
              <div>
                <div className="font-bold uppercase text-[11px] text-black">I. Berangkat dari Kantor Asal</div>
                <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                  <div>Tempat: <strong>{sppd.kotaAsal}</strong></div>
                  <div>Ke: <strong>{sppd.kotaTujuan}</strong></div>
                  <div>Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalMulai)}</strong></div>
                </div>
              </div>
              <div className="text-center pt-6">
                <span className="text-[9.5px] text-stone-400 block mb-6">(Tanda Tangan &amp; Cap Bagian SDM / HO)</span>
                <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                  Bagian Administrasi HO
                </span>
              </div>
            </div>

            {/* POS 2: Tiba di Tempat Tujuan Lapangan / Site */}
            <div className="border-b border-black p-3 space-y-2 min-h-[140px] flex flex-col justify-between">
              <div>
                <div className="font-bold uppercase text-[11px] text-black">II. Tiba di Lokasi Tujuan (Site / Wilayah)</div>
                <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                  <div>Tempat: <strong>{sppd.kotaTujuan}</strong></div>
                  <div>Pada Tanggal: _____________________</div>
                  <div>Pukul: _______ WITA / WIB</div>
                </div>
              </div>
              <div className="text-center pt-6">
                <span className="text-[9.5px] text-stone-400 block mb-6">(Tanda Tangan &amp; Cap Pimpinan Lokasi Tujuan)</span>
                <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                  Penanggung Jawab / Kepala Unit Site
                </span>
              </div>
            </div>

            {/* POS 3: Berangkat Kembali dari Tempat Tujuan */}
            <div className="border-r border-black p-3 space-y-2 min-h-[140px] flex flex-col justify-between">
              <div>
                <div className="font-bold uppercase text-[11px] text-black">III. Berangkat Kembali dari Lokasi Tujuan</div>
                <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                  <div>Dari: <strong>{sppd.kotaTujuan}</strong></div>
                  <div>Ke: <strong>{sppd.kotaAsal}</strong></div>
                  <div>Pada Tanggal: _____________________</div>
                </div>
              </div>
              <div className="text-center pt-6">
                <span className="text-[9.5px] text-stone-400 block mb-6">(Tanda Tangan &amp; Cap Pimpinan Lokasi Tujuan)</span>
                <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                  Penanggung Jawab / Kepala Unit Site
                </span>
              </div>
            </div>

            {/* POS 4: Tiba Kembali di Kantor Asal */}
            <div className="p-3 space-y-2 min-h-[140px] flex flex-col justify-between">
              <div>
                <div className="font-bold uppercase text-[11px] text-black">IV. Tiba Kembali di Kantor Asal (HO)</div>
                <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                  <div>Tempat: <strong>{sppd.kotaAsal}</strong></div>
                  <div>Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalSelesai)}</strong></div>
                  <div>Pukul: _______ WIB</div>
                </div>
              </div>
              <div className="text-center pt-6">
                <span className="text-[9.5px] text-stone-400 block mb-6">(Tanda Tangan &amp; Cap Verifikasi SDM / HO)</span>
                <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                  Pejabat yang Memberi Perintah / Keuangan
                </span>
              </div>
            </div>

          </div>

          {/* CATATAN RESUME DINAS */}
          <div className="mt-4 border border-black p-3 font-sans">
            <span className="text-[11px] font-bold uppercase block mb-1">
              V. Catatan Hasil Kegiatan Perjalanan Dinas / Resume Lapangan:
            </span>
            <div className="min-h-[100px] border border-dashed border-stone-300 p-2 text-[10px] text-stone-600 bg-stone-50/50">
              {sppd.keteranganSppd ? (
                <p className="text-stone-800">{sppd.keteranganSppd}</p>
              ) : (
                <p className="italic text-stone-400">
                  (Dapat diisi secara manual oleh pegawai bersangkutan setelah kembali dari perjalanan dinas untuk pelaporan hasil audit/inspeksi/tugas).
                </p>
              )}
            </div>
          </div>

          {/* FOOTER PENGESAHAN AKHIR */}
          <div className="mt-4 pt-2 border-t border-black flex justify-between items-center text-[9.5px] font-mono text-stone-600">
            <div>
              Dokumen Sah PT. Nusantara Mineral Sukses Abadi &bull; Alamat: Jl. Raya Pasar Minggu Kav. 2B-C, Pancoran, Jakarta Selatan
            </div>
            <div>
              ID Berkas: {sppd.id}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

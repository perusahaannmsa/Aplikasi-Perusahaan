import React from 'react';
import { EmployeeLoan } from '../types';
import { formatRupiah, terbilang, formatTanggalIndo, calculateLoanSummary } from '../utils/loanUtils';
import { NusantaraLogo } from './NusantaraLogo';

interface EmployeeLoanDocumentProps {
  loan: EmployeeLoan;
  showPaymentLedger?: boolean;
}

export const EmployeeLoanDocument: React.FC<EmployeeLoanDocumentProps> = ({
  loan,
  showPaymentLedger = true
}) => {
  const summary = calculateLoanSummary(loan);
  const payments = Array.isArray(loan.payments) ? loan.payments : [];

  return (
    <div className="bg-white text-black p-6 sm:p-10 font-sans max-w-[210mm] mx-auto min-h-[297mm] shadow-lg print:shadow-none print:p-0 print:m-0 print:max-w-none text-[12px] leading-normal print:leading-normal">
      {/* 1. KOP SURAT RESMI PT NMSA (PERSIS DOKUMEN ASLI) */}
      <div className="flex items-center justify-between pb-3 border-b-2 border-black">
        <div className="w-1/3 flex items-center justify-start">
          <NusantaraLogo size="lg" className="h-20 w-auto object-contain" />
        </div>
        <div className="w-2/3 text-right">
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-stone-900 uppercase">
            PT. NUSANTARA MINERAL SUKSES ABADI
          </h1>
          <p className="text-[11px] font-bold text-stone-850 mt-0.5">
            WISMA NH BUILDING No.. 2B – C LT. 1
          </p>
          <p className="text-[10px] text-stone-700 font-medium">
            JL. RAYA PASAR MINGGU, JAKARTA SELATAN, DKI Jakarta 12780
          </p>
          <p className="text-[10px] text-stone-700">
            Email : <span className="text-blue-700 underline font-medium">nusantaramineralsuksesabadi@gmail.com</span>
          </p>
          <p className="text-[10px] text-stone-700 font-medium">
            Phone : 021.27533169
          </p>
        </div>
      </div>
      <div className="border-b border-black mt-0.5 mb-5"></div>

      {/* 2. JUDUL DOKUMEN: FORM PINJAMAN KARYAWAN */}
      <div className="flex items-center justify-between mb-4">
        <div className="w-full border border-black py-1.5 px-4 text-center bg-stone-50 print:bg-transparent">
          <h2 className="text-sm sm:text-base font-black tracking-wider uppercase text-black">
            FORM PINJAMAN KARYAWAN
          </h2>
        </div>
      </div>

      <div className="flex justify-between items-center text-[11px] font-mono text-stone-600 mb-2 px-1">
        <span>No. Ref: <strong className="text-stone-900 font-bold">{loan.nomorPinjaman || '-'}</strong></span>
        <span>Tanggal Permohonan: <strong className="text-stone-900 font-bold">{formatTanggalIndo(loan.tanggalPermohonan)}</strong></span>
      </div>

      {/* 3. TABEL DATA PINJAMAN (6 BARIS SESUAI FORM ASLI) */}
      <div className="border border-black mb-6">
        <table className="w-full text-left border-collapse text-[12px]">
          <tbody>
            <tr className="border-b border-black">
              <td className="w-[30%] py-2 px-3.5 font-bold border-r border-black bg-stone-50/50 print:bg-transparent">
                Tanggal Permohonan
              </td>
              <td className="w-[4%] py-2 px-1 text-center font-bold border-r border-black">:</td>
              <td className="py-2 px-3.5 font-medium">
                {formatTanggalIndo(loan.tanggalPermohonan)}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="py-2 px-3.5 font-bold border-r border-black bg-stone-50/50 print:bg-transparent">
                Nama Karyawan / Divisi
              </td>
              <td className="py-2 px-1 text-center font-bold border-r border-black">:</td>
              <td className="py-2 px-3.5 font-bold text-stone-950">
                {loan.namaKaryawan || '-'} {loan.divisi ? ` / ${loan.divisi}` : ''}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="py-2 px-3.5 font-bold border-r border-black bg-stone-50/50 print:bg-transparent">
                Alasan Peminjaman
              </td>
              <td className="py-2 px-1 text-center font-bold border-r border-black">:</td>
              <td className="py-2 px-3.5 text-stone-900">
                {loan.alasanPeminjaman || '-'}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="py-2 px-3.5 font-bold border-r border-black bg-stone-50/50 print:bg-transparent">
                Jumlah Pinjaman
              </td>
              <td className="py-2 px-1 text-center font-bold border-r border-black">:</td>
              <td className="py-2 px-3.5 font-black text-stone-950">
                <span>{formatRupiah(loan.jumlahPinjaman)}</span>
                <span className="ml-2 font-normal italic text-[11px] text-stone-700">
                  ({terbilang(loan.jumlahPinjaman)})
                </span>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="py-2 px-3.5 font-bold border-r border-black bg-stone-50/50 print:bg-transparent">
                Cara Pembayaran
              </td>
              <td className="py-2 px-1 text-center font-bold border-r border-black">:</td>
              <td className="py-2 px-3.5 text-stone-900">
                {loan.caraPembayaran || '-'}
                {loan.cicilanPerBulan ? (
                  <span className="ml-1 text-stone-600 font-mono text-[11px]">
                    (Est. {formatRupiah(loan.cicilanPerBulan)} / Bulan)
                  </span>
                ) : null}
              </td>
            </tr>

            <tr>
              <td className="py-2 px-3.5 font-bold border-r border-black bg-stone-50/50 print:bg-transparent">
                Tanggal Pengambilan Pinjaman
              </td>
              <td className="py-2 px-1 text-center font-bold border-r border-black">:</td>
              <td className="py-2 px-3.5 font-medium">
                {formatTanggalIndo(loan.tanggalPengambilanPinjaman)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4. TABEL PERSETUJUAN & TANDA TANGAN 4 KOLOM (PERSIS TEMPLATE RESMI) */}
      <div className="border border-black mb-6">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-black bg-stone-50/70 print:bg-transparent text-center font-bold">
              <th className="py-2 px-2 w-1/4 border-r border-black">Peminjam :</th>
              <th className="py-2 px-2 w-1/4 border-r border-black">Persetujuan Atasan :</th>
              <th className="py-2 px-2 w-1/4 border-r border-black">Persetujuan Finance :</th>
              <th className="py-2 px-2 w-1/4">Persetujuan Direktur :</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {/* Kolom 1: Peminjam */}
              <td className="p-2 border-r border-black align-top h-32 flex flex-col justify-between">
                <div className="h-16 flex items-center justify-center">
                  <span className="text-stone-300 print:text-stone-200 text-[10px] italic">Paraf / TTD</span>
                </div>
                <div className="border-t border-black/40 pt-1 text-[10px] space-y-0.5">
                  <div><strong>Nama :</strong> {loan.peminjamNama || loan.namaKaryawan || '.....................'}</div>
                  <div><strong>Jabatan :</strong> {loan.peminjamJabatan || loan.divisi || '.....................'}</div>
                  <div><strong>Tanggal :</strong> {formatTanggalIndo(loan.peminjamTanggal || loan.tanggalPermohonan)}</div>
                </div>
              </td>

              {/* Kolom 2: Persetujuan Atasan */}
              <td className="p-2 border-r border-black align-top h-32 flex flex-col justify-between">
                <div className="h-16 flex items-center justify-center">
                  <span className="text-stone-300 print:text-stone-200 text-[10px] italic">Paraf / TTD</span>
                </div>
                <div className="border-t border-black/40 pt-1 text-[10px] space-y-0.5">
                  <div><strong>Nama :</strong> {loan.atasanNama || 'Andi Muhammad Rifki'}</div>
                  <div><strong>Jabatan :</strong> {loan.atasanJabatan || 'Direktur'}</div>
                  <div><strong>Tanggal :</strong> {formatTanggalIndo(loan.atasanTanggal || loan.tanggalPermohonan)}</div>
                </div>
              </td>

              {/* Kolom 3: Persetujuan Finance */}
              <td className="p-2 border-r border-black align-top h-32 flex flex-col justify-between">
                <div className="h-16 flex items-center justify-center">
                  <span className="text-stone-300 print:text-stone-200 text-[10px] italic">Paraf / TTD</span>
                </div>
                <div className="border-t border-black/40 pt-1 text-[10px] space-y-0.5">
                  <div><strong>Nama :</strong> {loan.financeNama || 'Harijon'}</div>
                  <div><strong>Jabatan :</strong> {loan.financeJabatan || 'Direktur Keuangan'}</div>
                  <div><strong>Tanggal :</strong> {formatTanggalIndo(loan.financeTanggal || loan.tanggalPengambilanPinjaman)}</div>
                </div>
              </td>

              {/* Kolom 4: Persetujuan Direktur */}
              <td className="p-2 align-top h-32 flex flex-col justify-between">
                <div className="h-16 flex items-center justify-center">
                  <span className="text-stone-300 print:text-stone-200 text-[10px] italic">Paraf / TTD</span>
                </div>
                <div className="border-t border-black/40 pt-1 text-[10px] space-y-0.5">
                  <div><strong>Nama :</strong> {loan.direkturNama || 'Andi Nursyam Halid'}</div>
                  <div><strong>Jabatan :</strong> {loan.direkturJabatan || 'Direktur Utama'}</div>
                  <div><strong>Tanggal :</strong> {formatTanggalIndo(loan.direkturTanggal || loan.tanggalPengambilanPinjaman)}</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 5. KOTAK CATATAN */}
      <div className="mb-6">
        <div className="text-[11px] font-bold mb-1">Catatan :</div>
        <div className="border border-black p-3 min-h-[64px] text-[11px] leading-relaxed text-stone-850">
          {loan.catatan || '(Tidak ada catatan khusus)'}
        </div>
      </div>

      {/* 6. KARTU RIWAYAT & PERHITUNGAN PEMBAYARAN CICILAN (KARTU PIUTANG PINJAMAN) */}
      {showPaymentLedger && (
        <div className="mt-8 pt-4 border-t-2 border-dashed border-stone-400">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
              <span>KARTU PERHITUNGAN &amp; REALISASI PEMBAYARAN CICILAN</span>
            </h3>
            <span className={`text-[10px] font-black px-2 py-0.5 border ${
              summary.effectiveStatus === 'Lunas'
                ? 'bg-emerald-100 border-emerald-500 text-emerald-900'
                : 'bg-amber-100 border-amber-500 text-amber-900'
            }`}>
              STATUS: {summary.effectiveStatus.toUpperCase()} ({summary.progressPersen}%)
            </span>
          </div>

          {/* Ringkasan Angka */}
          <div className="grid grid-cols-3 gap-2 mb-3 text-center text-[11px]">
            <div className="border border-black p-1.5 bg-stone-50">
              <span className="text-[10px] text-stone-600 block">Total Pinjaman:</span>
              <strong className="text-xs font-mono">{formatRupiah(summary.totalPinjaman)}</strong>
            </div>
            <div className="border border-black p-1.5 bg-stone-50">
              <span className="text-[10px] text-stone-600 block">Total Terbayar:</span>
              <strong className="text-xs font-mono text-emerald-900">{formatRupiah(summary.totalDibayar)}</strong>
            </div>
            <div className="border border-black p-1.5 bg-stone-50">
              <span className="text-[10px] text-stone-600 block">Sisa Hutang / Piutang:</span>
              <strong className="text-xs font-mono text-red-900">{formatRupiah(summary.sisaPinjaman)}</strong>
            </div>
          </div>

          {/* Tabel Catatan Realisasi Pembayaran */}
          <table className="w-full text-left border-collapse border border-black text-[10.5px]">
            <thead>
              <tr className="bg-stone-100 border-b border-black text-center font-bold">
                <th className="py-1 px-1.5 w-8 border-r border-black">No.</th>
                <th className="py-1 px-2 border-r border-black">Tanggal</th>
                <th className="py-1 px-2 border-r border-black">Keterangan / Angsuran</th>
                <th className="py-1 px-2 border-r border-black">Metode</th>
                <th className="py-1 px-2 border-r border-black text-right">Jumlah Bayar</th>
                <th className="py-1 px-2 border-r border-black text-right">Sisa Pinjaman</th>
                <th className="py-1 px-2">Penerima</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-center text-stone-500 italic border-b border-black">
                    Belum ada catatan pembayaran / angsuran cicilan yang tercatat.
                  </td>
                </tr>
              ) : (
                (() => {
                  let runningBalance = summary.totalPinjaman;
                  return payments.map((p, idx) => {
                    const payAmt = Number(p.jumlahBayar) || 0;
                    runningBalance = Math.max(0, runningBalance - payAmt);
                    return (
                      <tr key={p.id || idx} className="border-b border-black">
                        <td className="py-1 px-1.5 text-center border-r border-black">{idx + 1}</td>
                        <td className="py-1 px-2 border-r border-black whitespace-nowrap">{formatTanggalIndo(p.tanggalBayar)}</td>
                        <td className="py-1 px-2 border-r border-black">{p.keterangan || `Angsuran ke-${idx + 1}`}</td>
                        <td className="py-1 px-2 border-r border-black text-center">{p.metodePembayaran}</td>
                        <td className="py-1 px-2 border-r border-black text-right font-mono font-bold text-emerald-950">
                          {formatRupiah(payAmt)}
                        </td>
                        <td className="py-1 px-2 border-r border-black text-right font-mono font-bold text-red-950">
                          {formatRupiah(runningBalance)}
                        </td>
                        <td className="py-1 px-2 text-[10px] text-stone-700">{p.diterimaOleh || 'Finance'}</td>
                      </tr>
                    );
                  });
                })()
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer cetak */}
      <div className="mt-6 pt-2 border-t border-stone-300 flex justify-between text-[9px] text-stone-400 font-mono">
        <span>PT Nusantara Mineral Sukses Abadi • Sistem Administrasi Keuangan</span>
        <span>Dicetak pada: {new Date().toLocaleString('id-ID')}</span>
      </div>
    </div>
  );
};

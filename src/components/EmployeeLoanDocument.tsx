import React from 'react';
import { EmployeeLoan } from '../types';
import { formatRupiah, terbilang, formatTanggalIndo, calculateLoanSummary } from '../utils/loanUtils';
import { NusantaraLogo } from './NusantaraLogo';

interface EmployeeLoanDocumentProps {
  loan: EmployeeLoan;
  showPaymentLedger?: boolean;
  showKopSurat?: boolean;
  className?: string;
  id?: string;
}

export const EmployeeLoanDocument: React.FC<EmployeeLoanDocumentProps> = ({
  loan,
  showPaymentLedger = true,
  showKopSurat = true,
  className = '',
  id = 'employee-loan-printable-document'
}) => {
  const summary = calculateLoanSummary(loan);
  const payments = Array.isArray(loan.payments) ? loan.payments : [];

  // Kop Surat Banner Gambar Resmi PT. NMSA (Full Width, sama persis dengan Internal Memo)
  const headerImageUrl = '/kop-surat-nmsa-full.png';

  return (
    <div
      id={id}
      className={`bg-white text-black shadow-md border border-stone-300 mx-auto p-8 sm:p-12 md:p-14 max-w-[850px] w-full min-h-[1050px] flex flex-col justify-between select-text print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none ${className}`}
      style={{
        boxSizing: 'border-box',
        fontFamily: "Calibri, 'Calibri (Body)', Aptos, 'Segoe UI', Arial, sans-serif",
        fontSize: '11pt',
        lineHeight: 1.2,
      }}
    >
      <div>
        {/* 1. KOP SURAT RESMI PT. NMSA (DISAMAKAN DENGAN KOP SURAT INTERNAL MEMO) */}
        {showKopSurat ? (
          <div className="w-full pb-1 -mt-2 print:mt-0 print:pb-1">
            <img
              src={headerImageUrl}
              alt="Kop Surat PT. Nusantara Mineral Sukses Abadi"
              className="w-full h-auto block"
              style={{
                width: '100%',
                maxWidth: '100%',
                height: 'auto',
                display: 'block',
                imageRendering: '-webkit-optimize-contrast',
              }}
              onError={(e) => {
                // Fallback jika gambar kop surat tidak terload
                const target = e.currentTarget;
                target.style.display = 'none';
                const fallback = document.getElementById('employee-loan-vector-kop');
                if (fallback) fallback.style.display = 'block';
              }}
              referrerPolicy="no-referrer"
            />
            {/* Fallback Header jika offline */}
            <div id="employee-loan-vector-kop" style={{ display: 'none' }} className="w-full pb-3 border-b-2 border-black">
              <div className="flex items-center justify-between">
                <div className="w-1/3 flex items-center justify-start">
                  <NusantaraLogo size="lg" className="h-16 w-auto object-contain" />
                </div>
                <div className="w-2/3 text-right">
                  <h1 className="text-base font-black tracking-tight text-black uppercase">
                    PT. NUSANTARA MINERAL SUKSES ABADI
                  </h1>
                  <p className="text-[10pt] font-bold text-black mt-0.5">
                    WISMA NH BUILDING No.. 2B – C LT. 1
                  </p>
                  <p className="text-[9pt] text-stone-800">
                    JL. RAYA PASAR MINGGU, JAKARTA SELATAN, DKI Jakarta 12780
                  </p>
                  <p className="text-[9pt] text-stone-800">
                    Email : nusantaramineralsuksesabadi@gmail.com | Phone : 021.27533169
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full">
            {/* Indikator Mode Tanpa Kop Surat (Hanya Tampil di Layar, Tersembunyi Saat Dicetak) */}
            <div className="print:hidden mb-2 p-2 bg-amber-50 border border-amber-300 rounded-xl text-center text-xs font-mono text-amber-900 flex items-center justify-center gap-2 select-none shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <strong>Mode Form Tanpa Kop Surat</strong> &bull; Ruang atas disesuaikan untuk dicetak langsung pada kertas blanko / berkop fisik perusahaan.
            </div>
            {/* Spasi proporsional untuk kertas fisik berkop */}
            <div className="w-full h-8 sm:h-10 print:h-12 print:block" />
          </div>
        )}

        {/* 2. JUDUL DOKUMEN: FORM PINJAMAN KARYAWAN (KOTAK BERGARIS PERSIS FORMAT RESMI) */}
        <div className="w-full border-[1.5px] border-black py-1.5 px-4 text-center my-3 print:my-2.5">
          <h2 className="text-[12pt] print:text-[12pt] font-bold uppercase tracking-wider text-black">
            FORM PINJAMAN KARYAWAN
          </h2>
        </div>

        {/* 3. SUB-HEADER: TANGGAL PERMOHONAN & NOMOR REFERENSI */}
        <div className="flex justify-between items-center text-[10.5pt] print:text-[10.5pt] mb-2 px-0.5 text-black">
          <div>
            <span>Tanggal Permohonan : </span>
            <strong className="font-bold">{formatTanggalIndo(loan.tanggalPermohonan)}</strong>
          </div>
          {loan.nomorPinjaman && (
            <div className="text-[10pt] font-mono text-stone-700 print:text-black">
              <span>No. Ref: <strong>{loan.nomorPinjaman}</strong></span>
            </div>
          )}
        </div>

        {/* 4. TABEL DATA PINJAMAN (5 BARIS SESUAI PERSIS SCAN FORMAT RESMI NMSA) */}
        <div className="border-[1.5px] border-black mb-4 print:mb-3">
          <table className="w-full text-left border-collapse text-[10.5pt] print:text-[10.5pt] text-black">
            <tbody>
              {/* Baris 1: Nama Karyawan / Divisi */}
              <tr className="border-b border-black">
                <td className="w-[32%] py-2 px-3 font-semibold border-r border-black whitespace-nowrap">
                  Nama Karyawan / Divisi
                </td>
                <td className="w-[4%] py-2 px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="py-2 px-3 font-bold">
                  {loan.namaKaryawan || '-'} {loan.divisi ? ` / ${loan.divisi}` : ''}
                </td>
              </tr>

              {/* Baris 2: Alasan Peminjaman */}
              <tr className="border-b border-black">
                <td className="py-2 px-3 font-semibold border-r border-black">
                  Alasan Peminjaman
                </td>
                <td className="py-2 px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="py-2 px-3">
                  {loan.alasanPeminjaman || '-'}
                </td>
              </tr>

              {/* Baris 3: Jumlah Pinjaman */}
              <tr className="border-b border-black">
                <td className="py-2 px-3 font-semibold border-r border-black">
                  Jumlah Pinjaman
                </td>
                <td className="py-2 px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="py-2 px-3 font-bold">
                  <span>{formatRupiah(loan.jumlahPinjaman)}</span>
                  <span className="ml-2 font-normal italic text-[9.5pt]">
                    ({terbilang(loan.jumlahPinjaman)})
                  </span>
                </td>
              </tr>

              {/* Baris 4: Cara Pembayaran */}
              <tr className="border-b border-black">
                <td className="py-2 px-3 font-semibold border-r border-black">
                  Cara Pembayaran
                </td>
                <td className="py-2 px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="py-2 px-3">
                  {loan.caraPembayaran || '-'}
                  {loan.cicilanPerBulan ? (
                    <span className="ml-1 text-stone-600 font-mono text-[9.5pt]">
                      (Est. {formatRupiah(loan.cicilanPerBulan)} / Bulan)
                    </span>
                  ) : null}
                </td>
              </tr>

              {/* Baris 5: Tanggal Pengambilan Pinjaman */}
              <tr>
                <td className="py-2 px-3 font-semibold border-r border-black">
                  Tanggal Pengambilan Pinjaman
                </td>
                <td className="py-2 px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="py-2 px-3">
                  {formatTanggalIndo(loan.tanggalPengambilanPinjaman)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 5. TABEL PERSETUJUAN 4 KOLOM BERDAMPINGAN (EQUAL 25% COLUMN WIDTHS - TIDAK PECAH/VERTIKAL) */}
        <div className="border-[1.5px] border-black mb-3 print:mb-2.5">
          <table className="w-full table-fixed border-collapse text-[10pt] print:text-[10pt] text-black">
            <thead>
              <tr className="border-b border-black text-center font-bold">
                <th className="py-2 px-2 w-1/4 border-r border-black font-bold">
                  {loan.peminjamRole || 'Peminjam :'}
                </th>
                <th className="py-2 px-2 w-1/4 border-r border-black font-bold">
                  {loan.atasanRole || 'Persetujuan Atasan :'}
                </th>
                <th className="py-2 px-2 w-1/4 border-r border-black font-bold">
                  {loan.financeRole || 'Persetujuan Finance :'}
                </th>
                <th className="py-2 px-2 w-1/4 font-bold">
                  {loan.direkturRole || 'Persetujuan Direktur :'}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {/* Kolom 1: Peminjam */}
                <td className="w-1/4 p-2 border-r border-black align-top h-32">
                  <div className="h-16 flex items-center justify-center text-stone-300 print:text-stone-200 text-[10px] italic">
                    Paraf / TTD
                  </div>
                  <div className="border-t border-black pt-1.5 text-[9pt] leading-tight space-y-0.5">
                    <div><strong>Nama :</strong> {loan.peminjamNama || loan.namaKaryawan || '.....................'}</div>
                    <div><strong>Jabatan :</strong> {loan.peminjamJabatan || loan.divisi || '.....................'}</div>
                  </div>
                </td>

                {/* Kolom 2: Persetujuan Atasan */}
                <td className="w-1/4 p-2 border-r border-black align-top h-32">
                  <div className="h-16 flex items-center justify-center text-stone-300 print:text-stone-200 text-[10px] italic">
                    Paraf / TTD
                  </div>
                  <div className="border-t border-black pt-1.5 text-[9pt] leading-tight space-y-0.5">
                    <div><strong>Nama :</strong> {loan.atasanNama || 'Andi Muhammad Rifki'}</div>
                    <div><strong>Jabatan :</strong> {loan.atasanJabatan || 'Direktur'}</div>
                  </div>
                </td>

                {/* Kolom 3: Persetujuan Finance */}
                <td className="w-1/4 p-2 border-r border-black align-top h-32">
                  <div className="h-16 flex items-center justify-center text-stone-300 print:text-stone-200 text-[10px] italic">
                    Paraf / TTD
                  </div>
                  <div className="border-t border-black pt-1.5 text-[9pt] leading-tight space-y-0.5">
                    <div><strong>Nama :</strong> {loan.financeNama || 'Harijon'}</div>
                    <div><strong>Jabatan :</strong> {loan.financeJabatan || 'Direktur Keuangan'}</div>
                  </div>
                </td>

                {/* Kolom 4: Persetujuan Direktur */}
                <td className="w-1/4 p-2 align-top h-32">
                  <div className="h-16 flex items-center justify-center text-stone-300 print:text-stone-200 text-[10px] italic">
                    Paraf / TTD
                  </div>
                  <div className="border-t border-black pt-1.5 text-[9pt] leading-tight space-y-0.5">
                    <div><strong>Nama :</strong> {loan.direkturNama || 'Andi Nursyam Halid'}</div>
                    <div><strong>Jabatan :</strong> {loan.direkturJabatan || 'Direktur Utama'}</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 5B. PENANDA TANGAN TAMBAHAN DI BAWAH (UKURAN SAMA DENGAN 4 KOTAK DI ATAS & BERPOSISI TENGAH JIKA 1, 2, 3 DAN SEJAJAR JIKA 4) */}
        {loan.additionalSigners && loan.additionalSigners.length > 0 && (() => {
          const rows: Array<typeof loan.additionalSigners> = [];
          for (let i = 0; i < loan.additionalSigners.length; i += 4) {
            rows.push(loan.additionalSigners.slice(i, i + 4));
          }

          return (
            <div className="space-y-3 print:space-y-2 mb-3 print:mb-2.5">
              {rows.map((rowSigners, rIdx) => {
                const count = rowSigners.length;
                // Posisi dimulai dari tengah jika hanya 1, 2, dan 3.
                // Jika 4 dibuat sejajar dengan 4 penanda tangan sebelumnya.
                const widthPercent = Math.min(100, count * 25);
                const widthStyle = `${widthPercent}%`;
                const widthClass = `table-w-${widthPercent}`;

                return (
                  <div key={rIdx} className="w-full flex justify-center text-center">
                    <table 
                      data-preserve-width="true"
                      style={{ width: widthStyle, maxWidth: widthStyle }}
                      className={`signature-sub-table ${widthClass} border-[1.5px] border-black table-fixed border-collapse text-[10pt] print:text-[10pt] text-black mx-auto`}
                    >
                      <thead>
                        <tr className="border-b border-black text-center font-bold">
                          {rowSigners.map((signer, sIdx) => (
                            <th
                              key={signer.id || sIdx}
                              className={`py-2 px-2 font-bold ${sIdx < count - 1 ? 'border-r border-black' : ''}`}
                              style={{ width: `${100 / count}%` }}
                            >
                              {signer.role || 'Disetujui :'}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {rowSigners.map((signer, sIdx) => (
                            <td
                              key={signer.id || sIdx}
                              className={`p-2 align-top h-32 ${sIdx < count - 1 ? 'border-r border-black' : ''}`}
                              style={{ width: `${100 / count}%` }}
                            >
                              <div className="h-16 flex items-center justify-center text-stone-300 print:text-stone-200 text-[10px] italic">
                                {signer.paraf || 'Paraf / TTD'}
                              </div>
                              <div className="border-t border-black pt-1.5 text-[9pt] leading-tight space-y-0.5">
                                <div><strong>Nama :</strong> {signer.nama || '.....................'}</div>
                                <div><strong>Jabatan :</strong> {signer.jabatan || '.....................'}</div>
                              </div>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* 6. KOTAK CATATAN (SESUAI SCAN FORM ASLI) */}
        <div className="mb-4">
          <div className="text-[10.5pt] font-bold mb-1">Catatan :</div>
          <div className="border-[1.5px] border-black p-3 min-h-[85px] text-[10pt] leading-relaxed text-black">
            {loan.catatan || ''}
          </div>
        </div>

        {/* 7. KARTU RIWAYAT & PERHITUNGAN PEMBAYARAN CICILAN (JIKA DIAKTIFKAN) */}
        {showPaymentLedger && payments.length > 0 && (
          <div className="mt-6 pt-4 border-t-2 border-dashed border-stone-400 print:page-break-before-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10pt] font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                <span>KARTU PERHITUNGAN &amp; REALISASI PEMBAYARAN CICILAN</span>
              </h3>
              <span className={`text-[9pt] font-black px-2 py-0.5 border ${
                summary.effectiveStatus === 'Lunas'
                  ? 'bg-emerald-100 border-emerald-500 text-emerald-900'
                  : 'bg-amber-100 border-amber-500 text-amber-900'
              }`}>
                STATUS: {summary.effectiveStatus.toUpperCase()} ({summary.progressPersen}%)
              </span>
            </div>

            {/* Ringkasan Angka */}
            <div className="grid grid-cols-3 gap-2 mb-3 text-center text-[10pt]">
              <div className="border border-black p-1.5 bg-stone-50">
                <span className="text-[9pt] text-stone-600 block">Total Pinjaman:</span>
                <strong className="text-xs font-mono">{formatRupiah(summary.totalPinjaman)}</strong>
              </div>
              <div className="border border-black p-1.5 bg-stone-50">
                <span className="text-[9pt] text-stone-600 block">Total Terbayar:</span>
                <strong className="text-xs font-mono text-emerald-900">{formatRupiah(summary.totalDibayar)}</strong>
              </div>
              <div className="border border-black p-1.5 bg-stone-50">
                <span className="text-[9pt] text-stone-600 block">Sisa Piutang:</span>
                <strong className="text-xs font-mono text-red-900">{formatRupiah(summary.sisaPinjaman)}</strong>
              </div>
            </div>

            {/* Tabel Catatan Realisasi Pembayaran */}
            <table className="w-full text-left border-collapse border border-black text-[9.5pt]">
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
                {(() => {
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
                        <td className="py-1 px-2 text-[9pt] text-stone-700">{p.diterimaOleh || 'Finance'}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FOOTER RESMI DOKUMEN CETAK */}
      <div className="mt-6 pt-2 border-t border-stone-400 flex justify-between text-[9pt] text-stone-600 font-mono">
        <span>PT. Nusantara Mineral Sukses Abadi • Sistem Keuangan</span>
        <span>Dicetak pada: {new Date().toLocaleString('id-ID')}</span>
      </div>
    </div>
  );
};

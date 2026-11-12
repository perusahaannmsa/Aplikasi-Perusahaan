import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EmployeeLoan } from '../types';
import { formatRupiah, terbilang, formatTanggalIndo } from './loanUtils';

/**
 * Menghasilkan file PDF resmi Formulir Pinjaman Karyawan PT. NMSA (Format Vektor A4)
 * Persis sesuai dengan file resmi: FORM PINJAMAN KARYAWAN
 */
export async function generateEmployeeLoanPdfBlob(loan: EmployeeLoan): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  // 1. KOP SURAT RESMI PT. NUSANTARA MINERAL SUKSES ABADI
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('PT. NUSANTARA MINERAL SUKSES ABADI', pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  doc.text('WISMA NH BUILDING No.. 2B – C LT. 1', pageWidth / 2, y, { align: 'center' });
  y += 4.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.text('JL. RAYA PASAR MINGGU, JAKARTA SELATAN, DKI Jakarta 12780', pageWidth / 2, y, { align: 'center' });
  y += 3.8;

  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text('Email : nusantaramineralsuksesabadi@gmail.com | Phone : 021.27533169', pageWidth / 2, y, { align: 'center' });
  y += 4;

  // Garis Pembatas Tebal Kop Surat
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // 2. KOTAK JUDUL DOKUMEN: FORM PINJAMAN KARYAWAN
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  const titleBoxHeight = 8;
  doc.rect(margin, y, contentWidth, titleBoxHeight);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('FORM PINJAMAN KARYAWAN', pageWidth / 2, y + 5.5, { align: 'center' });
  y += titleBoxHeight + 5;

  // 3. SUB-HEADER: TANGGAL PERMOHONAN & NOMOR REFERENSI
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`Tanggal Permohonan : `, margin, y);
  doc.setFont('helvetica', 'bold');
  doc.text(`${formatTanggalIndo(loan.tanggalPermohonan)}`, margin + 37, y);

  if (loan.nomorPinjaman) {
    doc.setFont('helvetica', 'normal');
    const refPrefix = 'No. Ref: ';
    const refVal = loan.nomorPinjaman;
    const fullRefText = `${refPrefix}${refVal}`;
    const refWidth = doc.getTextWidth(fullRefText);
    doc.text(refPrefix, pageWidth - margin - refWidth, y);
    doc.setFont('helvetica', 'bold');
    doc.text(refVal, pageWidth - margin - doc.getTextWidth(refVal), y);
  }
  y += 3.5;

  // 4. TABEL DATA PINJAMAN (5 BARIS BERGARIS HITAM RAPI)
  const formattedJumlah = formatRupiah(loan.jumlahPinjaman);
  const terbilangStr = `(${terbilang(loan.jumlahPinjaman)})`;
  const paymentMethodStr = loan.caraPembayaran || '-';
  const cicilanEst = loan.cicilanPerBulan ? ` (Est. ${formatRupiah(loan.cicilanPerBulan)} / Bulan)` : '';

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.35,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    columnStyles: {
      0: { cellWidth: 54, fontStyle: 'bold' },
      1: { cellWidth: 5, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
    },
    body: [
      [
        'Nama Karyawan / Divisi',
        ':',
        `${loan.namaKaryawan || '-'} ${loan.divisi ? `/ ${loan.divisi}` : ''}`
      ],
      [
        'Alasan Peminjaman',
        ':',
        loan.alasanPeminjaman || '-'
      ],
      [
        'Jumlah Pinjaman',
        ':',
        `${formattedJumlah} ${terbilangStr}`
      ],
      [
        'Cara Pembayaran',
        ':',
        `${paymentMethodStr}${cicilanEst}`
      ],
      [
        'Tanggal Pengambilan Pinjaman',
        ':',
        formatTanggalIndo(loan.tanggalPengambilanPinjaman || loan.tanggalPermohonan)
      ],
    ],
  });

  // Ambil posisi Y setelah tabel pinjaman
  const finalTable = (doc as any).lastAutoTable;
  y = finalTable ? finalTable.finalY + 5 : y + 40;

  // 5. TABEL PERSETUJUAN 4 KOLOM BERDAMPINGAN (EQUAL 25% COLUMN WIDTHS)
  // CATATAN: Tanggal di bawah jabatan DIHAPUS sesuai permintaan pengguna, hanya menyisakan Nama & Jabatan
  const colWidth = contentWidth / 4;

  const peminjamNama = loan.peminjamNama || loan.namaKaryawan || '.....................';
  const peminjamJabatan = loan.peminjamJabatan || loan.divisi || 'Karyawan';

  const atasanNama = loan.atasanNama || 'Andi Muhammad Rifki';
  const atasanJabatan = loan.atasanJabatan || 'Direktur';

  const financeNama = loan.financeNama || 'Harijon';
  const financeJabatan = loan.financeJabatan || 'Direktur Keuangan';

  const direkturNama = loan.direkturNama || 'Andi Nursyam Halid';
  const direkturJabatan = loan.direkturJabatan || 'Direktur Utama';

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.35,
      cellPadding: 2,
    },
    head: [
      [
        { content: loan.peminjamRole || 'Peminjam :', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: loan.atasanRole || 'Persetujuan Atasan :', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: loan.financeRole || 'Persetujuan Finance :', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: loan.direkturRole || 'Persetujuan Direktur :', styles: { halign: 'center', fontStyle: 'bold' } },
      ]
    ],
    body: [
      [
        {
          content: `\n\nParaf / TTD\n\n\nNama : ${peminjamNama}\nJabatan : ${peminjamJabatan}`,
          styles: { halign: 'left', minCellHeight: 35 }
        },
        {
          content: `\n\nParaf / TTD\n\n\nNama : ${atasanNama}\nJabatan : ${atasanJabatan}`,
          styles: { halign: 'left', minCellHeight: 35 }
        },
        {
          content: `\n\nParaf / TTD\n\n\nNama : ${financeNama}\nJabatan : ${financeJabatan}`,
          styles: { halign: 'left', minCellHeight: 35 }
        },
        {
          content: `\n\nParaf / TTD\n\n\nNama : ${direkturNama}\nJabatan : ${direkturJabatan}`,
          styles: { halign: 'left', minCellHeight: 35 }
        },
      ]
    ],
    columnStyles: {
      0: { cellWidth: colWidth },
      1: { cellWidth: colWidth },
      2: { cellWidth: colWidth },
      3: { cellWidth: colWidth },
    }
  });

  const finalSigTable = (doc as any).lastAutoTable;
  y = finalSigTable ? finalSigTable.finalY + 5 : y + 45;

  // 6. KOTAK CATATAN
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Catatan :', margin, y);
  y += 2.5;

  const notesBoxHeight = 24;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(margin, y, contentWidth, notesBoxHeight);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  
  const notesText = loan.catatan || 'Pengajuan pinjaman dana karyawan telah diajukan melalui portal mandiri karyawan dan menunggu persetujuan Direksi serta Bagian Keuangan.';
  const splitNotes = doc.splitTextToSize(notesText, contentWidth - 6);
  doc.text(splitNotes, margin + 3, y + 4.5);

  // 7. FOOTER RESMI DOKUMEN CETAK
  const footerY = pageHeight - 12;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('PT. Nusantara Mineral Sukses Abadi • Sistem Keuangan', margin, footerY + 2);
  doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, pageWidth - margin, footerY + 2, { align: 'right' });

  return doc.output('blob');
}

/**
 * Memicu unduhan langsung file PDF formulir pinjaman karyawan ke perangkat pengguna
 */
export async function downloadEmployeeLoanPdf(loan: EmployeeLoan): Promise<void> {
  const blob = await generateEmployeeLoanPdfBlob(loan);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanNumber = (loan.nomorPinjaman || 'KARYAWAN').replace(/[^a-zA-Z0-9_-]/g, '_');
  a.download = `FORM_PINJAMAN_${cleanNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

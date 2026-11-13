import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EmployeeLoan, LoanSigner } from '../types';
import { formatRupiah, terbilang, formatTanggalIndo } from './loanUtils';

/**
 * Mengambil gambar Kop Surat resmi PT. NMSA dan mengubahnya menjadi Data URL untuk jsPDF
 */
async function getKopSuratImageDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/kop-surat-nmsa-full.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Menggambar isi kotak tanda tangan (Paraf/TTD, garis pemisah horizontal, Nama, dan Jabatan tanpa tanggal)
 */
function drawSignatureBoxContent(
  doc: jsPDF,
  cell: { x: number; y: number; width: number; height: number },
  nama: string,
  jabatan: string,
  parafLabel = 'Paraf / TTD'
) {
  const padX = 2.2;
  const innerWidth = cell.width - padX * 2;
  const dividerY = cell.y + cell.height - 12.2;

  // 1. Paraf / TTD placeholder (tengah area tanda tangan, abu-abu muda miring)
  const signAreaMidY = cell.y + (dividerY - cell.y) / 2 + 1;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.2);
  doc.setTextColor(175, 175, 175);
  doc.text(parafLabel, cell.x + cell.width / 2, signAreaMidY, { align: 'center' });

  // 2. Garis pemisah horizontal tipis di atas Nama & Jabatan (sesuai EmployeeLoanDocument.tsx)
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.line(cell.x + padX, dividerY, cell.x + cell.width - padX, dividerY);

  // 3. Nama & Jabatan (tanpa tanggal)
  const textFontSize = 8;
  doc.setFontSize(textFontSize);
  doc.setTextColor(0, 0, 0);

  const line1Y = dividerY + 4;
  const line2Y = dividerY + 8.3;

  // Baris Nama
  doc.setFont('helvetica', 'bold');
  const namaPrefix = 'Nama : ';
  const namaPrefixW = doc.getTextWidth(namaPrefix);
  doc.text(namaPrefix, cell.x + padX, line1Y);

  doc.setFont('helvetica', 'normal');
  const maxNamaW = Math.max(10, innerWidth - namaPrefixW);
  const namaLines = doc.splitTextToSize(nama || '.....................', maxNamaW);
  doc.text(namaLines[0] || '', cell.x + padX + namaPrefixW, line1Y);

  // Baris Jabatan
  doc.setFont('helvetica', 'bold');
  const jabPrefix = 'Jabatan : ';
  const jabPrefixW = doc.getTextWidth(jabPrefix);
  doc.text(jabPrefix, cell.x + padX, line2Y);

  doc.setFont('helvetica', 'normal');
  const maxJabW = Math.max(10, innerWidth - jabPrefixW);
  const jabLines = doc.splitTextToSize(jabatan || '.....................', maxJabW);
  doc.text(jabLines[0] || '', cell.x + padX + jabPrefixW, line2Y);
}

/**
 * Menghasilkan file PDF resmi Formulir Pinjaman Karyawan PT. NMSA (Format Vektor A4)
 * Persis sama tampilan & formatnya dengan EmployeeLoanDocument di website
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
  const contentWidth = pageWidth - margin * 2; // 182mm
  let y = 11;

  // 1. KOP SURAT RESMI PT. NUSANTARA MINERAL SUKSES ABADI (/kop-surat-nmsa-full.png)
  let drewImageHeader = false;
  try {
    const kopDataUrl = await getKopSuratImageDataUrl();
    if (kopDataUrl) {
      // Rasio asli gambar kop surat: 1002 x 216 (aspect ratio = 4.638889)
      const imgWidth = contentWidth;
      const imgHeight = Math.round((imgWidth / (1002 / 216)) * 10) / 10; // ~39.2mm
      doc.addImage(kopDataUrl, 'PNG', margin, y, imgWidth, imgHeight);
      y += imgHeight + 4;
      drewImageHeader = true;
    }
  } catch (err) {
    console.warn('Gagal memuat gambar kop surat untuk PDF, memakai fallback vektor:', err);
  }

  if (!drewImageHeader) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('PT. NUSANTARA MINERAL SUKSES ABADI', pageWidth / 2, y + 4, { align: 'center' });
    y += 9;

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

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  }

  // 2. KOTAK JUDUL DOKUMEN: FORM PINJAMAN KARYAWAN
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  const titleBoxHeight = 8.5;
  doc.rect(margin, y, contentWidth, titleBoxHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('FORM PINJAMAN KARYAWAN', pageWidth / 2, y + 5.7, { align: 'center' });
  y += titleBoxHeight + 5;

  // 3. SUB-HEADER: TANGGAL PERMOHONAN & NOMOR REFERENSI
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  const tglLabel = 'Tanggal Permohonan : ';
  doc.text(tglLabel, margin, y);
  doc.setFont('helvetica', 'bold');
  doc.text(formatTanggalIndo(loan.tanggalPermohonan), margin + doc.getTextWidth(tglLabel), y);

  if (loan.nomorPinjaman) {
    const refPrefix = 'No. Ref: ';
    const refVal = loan.nomorPinjaman;
    doc.setFont('helvetica', 'bold');
    const refValWidth = doc.getTextWidth(refVal);
    doc.setFont('helvetica', 'normal');
    const refPrefixWidth = doc.getTextWidth(refPrefix);
    doc.text(refPrefix, pageWidth - margin - refValWidth - refPrefixWidth, y);
    doc.setFont('helvetica', 'bold');
    doc.text(refVal, pageWidth - margin - refValWidth, y);
  }
  y += 2.5;

  // 4. TABEL DATA PINJAMAN (5 BARIS BERGARIS HITAM RAPI, SAMA PERSIS DENGAN WEBSITE)
  const formattedJumlah = formatRupiah(loan.jumlahPinjaman);
  const terbilangStr = `(${terbilang(loan.jumlahPinjaman)})`;
  const paymentMethodStr = loan.caraPembayaran || '-';
  const cicilanEst = loan.cicilanPerBulan ? ` (Est. ${formatRupiah(loan.cicilanPerBulan)} / Bulan)` : '';

  const dataTableStartY = y;
  autoTable(doc, {
    startY: dataTableStartY,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      valign: 'middle',
      cellPadding: { top: 2.3, bottom: 2.3, left: 2.8, right: 2.8 },
    },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: 'bold' },
      1: { cellWidth: 6.5, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
    },
    body: [
      [
        'Nama Karyawan / Divisi',
        ':',
        {
          content: `${loan.namaKaryawan || '-'}${loan.divisi ? ` / ${loan.divisi}` : ''}`,
          styles: { fontStyle: 'bold' },
        },
      ],
      [
        'Alasan Peminjaman',
        ':',
        loan.alasanPeminjaman || '-',
      ],
      [
        'Jumlah Pinjaman',
        ':',
        '', // Digambar custom di didDrawCell agar nominal bold + terbilang italic sejajar persis seperti di website
      ],
      [
        'Cara Pembayaran',
        ':',
        `${paymentMethodStr}${cicilanEst}`,
      ],
      [
        'Tanggal Pengambilan Pinjaman',
        ':',
        formatTanggalIndo(loan.tanggalPengambilanPinjaman || loan.tanggalPermohonan),
      ],
    ],
    didDrawCell: (data) => {
      if (data.section === 'body' && data.row.index === 2 && data.column.index === 2) {
        const textX = data.cell.x + 2.8;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        const amtW = doc.getTextWidth(formattedJumlah + '  ');
        const maxRemaining = Math.max(20, data.cell.width - 5.6 - amtW);

        doc.setFont('helvetica', 'italic');
        let terbFontSize = 8.8;
        doc.setFontSize(terbFontSize);
        let terbilangLines = doc.splitTextToSize(terbilangStr, maxRemaining);
        if (terbilangLines.length > 1) {
          terbFontSize = 7.6;
          doc.setFontSize(terbFontSize);
          terbilangLines = doc.splitTextToSize(terbilangStr, maxRemaining);
        }

        const baseY =
          terbilangLines.length > 1
            ? data.cell.y + 4
            : data.cell.y + data.cell.height / 2 + 1.1;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(formattedJumlah, textX, baseY);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(terbFontSize);
        if (terbilangLines.length === 1) {
          doc.text(terbilangLines[0] || '', textX + amtW, baseY);
        } else {
          doc.text(terbilangLines.slice(0, 2), textX + amtW, baseY);
        }
      }
    },
  });

  const finalTable = (doc as any).lastAutoTable;
  if (finalTable) {
    // Border luar tabel sedikit lebih tebal sesuai border-[1.5px]
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.45);
    doc.rect(margin, dataTableStartY, contentWidth, finalTable.finalY - dataTableStartY);
    y = finalTable.finalY + 4.5;
  } else {
    y += 42;
  }

  // 5. TABEL PERSETUJUAN 4 KOLOM BERDAMPINGAN (EQUAL 25% COLUMN WIDTHS)
  // Tanpa tanggal di bawah jabatan, hanya menyisakan Nama & Jabatan + garis pemisah horizontal
  const colWidth = contentWidth / 4;

  const peminjamNama = loan.peminjamNama || loan.namaKaryawan || '.....................';
  const peminjamJabatan = loan.peminjamJabatan || loan.divisi || 'Karyawan';

  const atasanNama = loan.atasanNama || 'Andi Muhammad Rifki';
  const atasanJabatan = loan.atasanJabatan || 'Direktur';

  const financeNama = loan.financeNama || 'Harijon';
  const financeJabatan = loan.financeJabatan || 'Direktur Keuangan';

  const direkturNama = loan.direkturNama || 'Andi Nursyam Halid';
  const direkturJabatan = loan.direkturJabatan || 'Direktur Utama';

  const sigColumns = [
    { role: loan.peminjamRole || 'Peminjam :', nama: peminjamNama, jabatan: peminjamJabatan },
    { role: loan.atasanRole || 'Persetujuan Atasan :', nama: atasanNama, jabatan: atasanJabatan },
    { role: loan.financeRole || 'Persetujuan Finance :', nama: financeNama, jabatan: financeJabatan },
    { role: loan.direkturRole || 'Persetujuan Direktur :', nama: direkturNama, jabatan: direkturJabatan },
  ];

  const sigStartY = y;
  autoTable(doc, {
    startY: sigStartY,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      cellPadding: 2,
      valign: 'middle',
    },
    head: [
      sigColumns.map((col) => ({
        content: col.role,
        styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 9 },
      })),
    ],
    body: [
      sigColumns.map(() => ({
        content: '',
        styles: { minCellHeight: 31 },
      })),
    ],
    columnStyles: {
      0: { cellWidth: colWidth },
      1: { cellWidth: colWidth },
      2: { cellWidth: colWidth },
      3: { cellWidth: colWidth },
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.row.index === 0) {
        const colInfo = sigColumns[data.column.index];
        if (colInfo) {
          drawSignatureBoxContent(doc, data.cell, colInfo.nama, colInfo.jabatan);
        }
      }
    },
  });

  const finalSigTable = (doc as any).lastAutoTable;
  if (finalSigTable) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.45);
    doc.rect(margin, sigStartY, contentWidth, finalSigTable.finalY - sigStartY);
    y = finalSigTable.finalY + 4;
  } else {
    y += 42;
  }

  // 5B. PENANDA TANGAN TAMBAHAN DI BAWAH (JIKA ADA, SAMA PERSIS DENGAN WEBSITE)
  if (Array.isArray(loan.additionalSigners) && loan.additionalSigners.length > 0) {
    const rows: LoanSigner[][] = [];
    for (let i = 0; i < loan.additionalSigners.length; i += 4) {
      rows.push(loan.additionalSigners.slice(i, i + 4));
    }

    for (const rowSigners of rows) {
      const count = rowSigners.length;
      const subTableWidth = Math.min(contentWidth, count * colWidth);
      const sideMargin = (pageWidth - subTableWidth) / 2;
      const subStartY = y;

      const subColStyles: Record<number, { cellWidth: number }> = {};
      for (let idx = 0; idx < count; idx++) {
        subColStyles[idx] = { cellWidth: subTableWidth / count };
      }

      autoTable(doc, {
        startY: subStartY,
        margin: { left: sideMargin, right: sideMargin },
        theme: 'plain',
        styles: {
          font: 'helvetica',
          fontSize: 9,
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
          cellPadding: 2,
          valign: 'middle',
        },
        head: [
          rowSigners.map((s) => ({
            content: s.role || 'Disetujui :',
            styles: { halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 9 },
          })),
        ],
        body: [
          rowSigners.map(() => ({
            content: '',
            styles: { minCellHeight: 31 },
          })),
        ],
        columnStyles: subColStyles,
        didDrawCell: (data) => {
          if (data.section === 'body' && data.row.index === 0) {
            const signer = rowSigners[data.column.index];
            if (signer) {
              drawSignatureBoxContent(
                doc,
                data.cell,
                signer.nama || '.....................',
                signer.jabatan || '.....................',
                signer.paraf || 'Paraf / TTD'
              );
            }
          }
        },
      });

      const subTable = (doc as any).lastAutoTable;
      if (subTable) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.45);
        doc.rect(sideMargin, subStartY, subTableWidth, subTable.finalY - subStartY);
        y = subTable.finalY + 4;
      }
    }
  }

  // 6. KOTAK CATATAN
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Catatan :', margin, y + 1);
  y += 3;

  const notesBoxHeight = 23;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(margin, y, contentWidth, notesBoxHeight);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  const notesText = loan.catatan || '';
  if (notesText) {
    const splitNotes = doc.splitTextToSize(notesText, contentWidth - 6);
    doc.text(splitNotes, margin + 3, y + 5.5);
  }

  // 7. FOOTER RESMI DOKUMEN CETAK
  const footerY = pageHeight - 13;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.25);
  doc.line(margin, footerY - 2.5, pageWidth - margin, footerY - 2.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('PT. Nusantara Mineral Sukses Abadi • Sistem Keuangan', margin, footerY + 1.5);
  doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, pageWidth - margin, footerY + 1.5, {
    align: 'right',
  });

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

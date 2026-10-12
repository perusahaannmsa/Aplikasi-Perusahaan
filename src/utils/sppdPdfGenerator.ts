import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SPPDRecord } from '../components/SppdManager';
import { consolidateSppdCostItems, terbilangRupiah } from '../components/PrintSppdDocument';
import { formatDateIndonesian } from '../utils';

/**
 * Generates an official standalone vector A4 PDF for SPPD (Surat Perintah Perjalanan Dinas)
 * Matches the official PT. Nusantara Mineral Sukses Abadi format with full tables & signatures.
 */
export async function generateSppdPdfBlob(sppd: SPPDRecord): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  // 1. KOP SURAT RESMI PT. NUSANTARA MINERAL SUKSES ABADI
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text('PT. NUSANTARA MINERAL SUKSES ABADI', pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text('MINING & GENERAL CONTRACTOR - BATUBARA & MINERAL', pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text('Head Office: Gedung Wisma Menara NMSA, Jakarta | Email: corporate@nmsa.co.id', pageWidth / 2, y, { align: 'center' });
  y += 4;

  // Double border line
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 1.2;
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // 2. JUDUL DOKUMEN & NOMOR SPPD
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('SURAT PERINTAH PERJALANAN DINAS (SPPD)', pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(`Nomor: ${sppd.noSppd || 'SPPD-NMSA/X/2026/001'}`, pageWidth / 2, y, { align: 'center' });
  y += 5;

  // 3. TABEL 1: DATA PERINTAH PERJALANAN DINAS (9 Poin Resmi)
  const tujuanDinas = (() => {
    const purpose = sppd.tujuanPerjalanan || '';
    if (!purpose || purpose.includes('Voucher Biaya') || purpose.includes('Laporan SPPD:') || purpose.includes('Diposting dari')) {
      return `Pengawasan Lapangan & Verifikasi Operasional (${sppd.kotaTujuan || 'Site / Proyek'})`;
    }
    return purpose;
  })();

  const mainTableBody = [
    [
      '1.',
      'Pejabat Berwenang yang Memberi Perintah',
      `${sppd.pemberiPerintah || 'H. A. Nursyam Halid'}\nJabatan: ${sppd.pemberiPerintahJabatan || 'Direktur Utama'}`
    ],
    [
      '2.',
      'Nama Pegawai yang Diperintahkan',
      `${sppd.namaPekerja || '-'}`
    ],
    [
      '3.',
      'Pangkat / Jabatan & Divisi Pegawai',
      `${sppd.jabatan || 'Staf'} • ${sppd.divisi || 'Operasional Lapangan & HO'}`
    ],
    [
      '4.',
      'Maksud & Tujuan Perjalanan Dinas',
      tujuanDinas
    ],
    [
      '5.',
      'Alat Angkut / Moda Transportasi yang Digunakan',
      `${sppd.kendaraan || sppd.transportasi || 'Pesawat Udara / Mobil Operasional'}`
    ],
    [
      '6.',
      'Tempat Berangkat (Asal) & Tempat Tujuan',
      `a. Tempat Berangkat (Asal) : ${sppd.kotaAsal || 'Jakarta (HO)'}\nb. Tempat Tujuan (Dinas)   : ${sppd.kotaTujuan || 'Site / Lapangan'}`
    ],
    [
      '7.',
      'Lamanya Perjalanan Dinas & Tanggal',
      `a. Lama Perjalanan : ${sppd.lamaPerjalanan || '4 Hari 3 Malam'}\nb. Tanggal Berangkat: ${formatDateIndonesian(sppd.tanggalMulai)}\nc. Tanggal Kembali  : ${formatDateIndonesian(sppd.tanggalSelesai)}`
    ],
    [
      '8.',
      'Pembebanan Anggaran / Mata Anggaran',
      'PT. Nusantara Mineral Sukses Abadi (HO / Proyek Site)\nMata Anggaran: Biaya Perjalanan Dinas & Akomodasi Lapangan'
    ],
    [
      '9.',
      'Keterangan Lain-Lain',
      sppd.keteranganSppd || 'Surat perintah ini diterbitkan untuk dilaksanakan dengan penuh tanggung jawab dan melaporkan hasil pelaksanaan tugas.'
    ]
  ];

  autoTable(doc, {
    startY: y,
    head: [['No', 'Uraian Perintah Perjalanan Dinas', 'Keterangan / Rincian']],
    body: mainTableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [35, 35, 35],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [20, 20, 20],
      lineColor: [40, 40, 40],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 62, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
    },
  });

  const lastTable1Y = (doc as any).lastAutoTable?.finalY || y + 80;
  y = lastTable1Y + 5;

  // 4. TABEL 2: RINCIAN ANGGARAN & BIAYA PERJALANAN DINAS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text('RINCIAN ANGGARAN & BIAYA PERJALANAN DINAS (SESUAI PEDOMAN PERUSAHAAN):', margin, y);
  y += 3;

  const consolidatedItems = consolidateSppdCostItems(
    sppd.costItems || [],
    sppd.lamaPerjalanan,
    sppd.jabatan
  );

  const costRows = consolidatedItems.map(c => [
    String(c.no),
    c.kategori,
    c.rincian || '-',
    typeof c.hargaAcuan === 'number' && c.hargaAcuan > 0
      ? `Rp ${c.hargaAcuan.toLocaleString('id-ID')}`
      : String(c.hargaAcuan || '-'),
    `Rp ${c.jumlah.toLocaleString('id-ID')}`
  ]);

  const totalBiaya = consolidatedItems.reduce((acc, it) => acc + (it.jumlah || 0), 0);

  costRows.push([
    '',
    'JUMLAH TOTAL BIAYA SPPD',
    '',
    '',
    `Rp ${totalBiaya.toLocaleString('id-ID')}`
  ]);

  autoTable(doc, {
    startY: y,
    head: [['No', 'Komponen Biaya', 'Keterangan / Rincian', 'Tarif Acuan', 'Jumlah (Rp)']],
    body: costRows,
    theme: 'grid',
    headStyles: {
      fillColor: [180, 130, 20], // Elegant gold amber
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [20, 20, 20],
      lineColor: [40, 40, 40],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 50, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 32, halign: 'center' },
      4: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Highlight the total row
      if (data.row.index === costRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [245, 245, 240];
      }
    }
  });

  const lastTable2Y = (doc as any).lastAutoTable?.finalY || y + 40;
  y = lastTable2Y + 2;

  // TERBILANG BOX
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setFillColor(250, 250, 248);
  doc.rect(margin, y, contentWidth, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.text('Terbilang: ', margin + 2, y + 4);
  doc.setFont('helvetica', 'italic');
  doc.text(`"${terbilangRupiah(totalBiaya)}"`, margin + 17, y + 4);
  y += 10;

  // 5. TANDA TANGAN PENGESAHAN LEMBAR SPPD
  // Check if we need a new page for signatures
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  const sigColWidth = contentWidth / 3;
  const leftX = margin;
  const midX = margin + sigColWidth;
  const rightX = margin + sigColWidth * 2;

  // Left col: Dikeluarkan
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  doc.text(`Dikeluarkan di: Jakarta`, leftX, y);
  doc.text(`Pada Tanggal : ${formatDateIndonesian(sppd.tanggalMulai)}`, leftX, y + 4);
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text('No. Form: FM-HO-SPPD-01 (Sah / Asli)', leftX, y + 10);
  if (sppd.driveUrl) {
    doc.setTextColor(180, 130, 20);
    doc.text('Tersimpan di Google Drive NMSA 24/7', leftX, y + 14);
  }

  // Mid col: Pegawai yang Melaksanakan
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(20, 20, 20);
  doc.text('Pegawai yang Melaksanakan Dinas,', midX + sigColWidth / 2, y, { align: 'center' });

  const sigSpacing = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`${sppd.namaPekerja || '-'}`, midX + sigColWidth / 2, y + sigSpacing, { align: 'center' });
  doc.line(midX + 6, y + sigSpacing + 1, midX + sigColWidth - 6, y + sigSpacing + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(`${sppd.jabatan || 'Supervisor'}`, midX + sigColWidth / 2, y + sigSpacing + 4.5, { align: 'center' });

  // Right col: Pejabat Pemberi Perintah
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(20, 20, 20);
  doc.text('Pejabat yang Memberi Perintah,', rightX + sigColWidth / 2, y, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const signerName = sppd.sppdDisetujuiName || sppd.pemberiPerintah || 'H. A. Nursyam Halid';
  const signerRole = sppd.sppdDisetujuiJabatan || sppd.pemberiPerintahJabatan || 'Direktur Utama';
  doc.text(signerName, rightX + sigColWidth / 2, y + sigSpacing, { align: 'center' });
  doc.line(rightX + 6, y + sigSpacing + 1, rightX + sigColWidth - 6, y + sigSpacing + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(signerRole, rightX + sigColWidth / 2, y + sigSpacing + 4.5, { align: 'center' });

  return doc.output('blob');
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NpwpRecord, Submission } from '../types';
import { isVendorOrCompanyMatch } from '../utils';

export const NPWP_MASTER_PDF_FILENAME = 'Daftar_Master_NPWP_Perusahaan.pdf';

const formatNpwpDisplay = (val: string): string => {
  const cleaned = String(val || '').replace(/\D/g, '');
  if (!cleaned) return val || '-';
  if (cleaned.length <= 15) {
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
    if (cleaned.length > 5) formatted = formatted.slice(0, 6) + '.' + cleaned.slice(5);
    if (cleaned.length > 8) formatted = formatted.slice(0, 10) + '.' + cleaned.slice(8);
    if (cleaned.length > 9) formatted = formatted.slice(0, 12) + '-' + cleaned.slice(9);
    if (cleaned.length > 12) formatted = formatted.slice(0, 16) + '.' + cleaned.slice(12);
    return formatted;
  }
  return val;
};

const formatRupiahShort = (val: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val || 0);

function countLinkedInvoices(companyName: string, submissions: Submission[]): { count: number; total: number } {
  const linked = (submissions || []).filter((sub) => {
    if (!sub) return false;
    if (isVendorOrCompanyMatch(companyName, sub.dibayarkanKepada)) return true;
    if (
      sub.items &&
      sub.items.some(
        (it) =>
          isVendorOrCompanyMatch(companyName, it.item) ||
          isVendorOrCompanyMatch(companyName, it.keterangan)
      )
    ) {
      return true;
    }
    if (sub.notes && isVendorOrCompanyMatch(companyName, sub.notes)) return true;
    return false;
  });

  const total = linked.reduce(
    (acc, sub) => acc + (sub.items ? sub.items.reduce((s, i) => s + (Number(i.total) || 0), 0) : 0),
    0
  );
  return { count: linked.length, total };
}

export function generateNpwpMasterPdfBlob(params: {
  npwpRecords: NpwpRecord[];
  submissions?: Submission[];
  companyName?: string;
}): { blob: Blob; fileName: string; totalCount: number } {
  const { npwpRecords, submissions = [], companyName = 'PT. Nusantara Mineral Sukses Abadi' } = params;

  const sortedRecords = [...(npwpRecords || [])].sort((a, b) =>
    (a.companyName || '').localeCompare(b.companyName || '', 'id')
  );

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // Header Banner
  doc.setFillColor(24, 24, 27); // slate-900 / stone-900
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(251, 191, 36); // amber-400
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('MASTER DATABASE PERPAJAKAN & REKANAN VENDOR', marginX, 8);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('DAFTAR MASTER DATA NPWP PERUSAHAAN', marginX, 15.5);

  doc.setTextColor(212, 212, 216);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const generatedTime = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`${companyName}  •  Diperbarui: ${generatedTime} WIB`, marginX, 21.5);

  const pkpCount = sortedRecords.filter((r) => (r.taxStatus || 'PKP') === 'PKP').length;
  const nonPkpCount = sortedRecords.length - pkpCount;

  // Right summary badge in header
  doc.setFillColor(39, 39, 42);
  doc.roundedRect(pageWidth - marginX - 82, 5.5, 82, 15, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Total: ${sortedRecords.length} Perusahaan`, pageWidth - marginX - 78, 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 231, 183);
  doc.text(`PKP: ${pkpCount}  |  Non-PKP: ${nonPkpCount}`, pageWidth - marginX - 78, 17);

  const tableRows = sortedRecords.map((rec, idx) => {
    const linked = countLinkedInvoices(rec.companyName, submissions);
    const addrContact = [
      rec.address && rec.address.trim() ? rec.address.trim() : '-',
      rec.contactPerson && rec.contactPerson.trim() ? `PIC: ${rec.contactPerson.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return [
      String(idx + 1),
      rec.companyName || '-',
      formatNpwpDisplay(rec.npwpNumber),
      rec.taxStatus === 'Non-PKP' ? 'Non-PKP' : 'PKP',
      rec.kppName?.trim() || '-',
      addrContact || '-',
      linked.count > 0 ? `${linked.count} Inv\n(${formatRupiahShort(linked.total)})` : '0 Inv',
      rec.notes?.trim() || '-',
    ];
  });

  autoTable(doc, {
    startY: 31,
    margin: { left: marginX, right: marginX, bottom: 16 },
    head: [[
      'No',
      'Nama Perusahaan / Wajib Pajak',
      'Nomor NPWP',
      'Status Pajak',
      'KPP Terdaftar',
      'Alamat & Kontak Finance',
      'Invoice Terkait',
      'Catatan',
    ]],
    body: tableRows.length > 0
      ? tableRows
      : [['-', 'Belum ada data NPWP yang tersimpan.', '-', '-', '-', '-', '-', '-']],
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [28, 25, 23],
      lineColor: [228, 228, 231],
      lineWidth: 0.2,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [245, 245, 244],
      textColor: [28, 25, 23],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [250, 250, 249],
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 54, fontStyle: 'bold' },
      2: { cellWidth: 38, font: 'courier', fontStyle: 'bold' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 34 },
      5: { cellWidth: 52 },
      6: { cellWidth: 28, halign: 'center' },
      7: { cellWidth: 'auto' },
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 113, 108);
      doc.text(
        `Arsip Resmi Google Drive: PPH23-CORETAX-NMSA/${NPWP_MASTER_PDF_FILENAME}`,
        marginX,
        pageHeight - 7
      );
      doc.text(
        `Halaman ${data.pageNumber} dari ${pageCount}`,
        pageWidth - marginX,
        pageHeight - 7,
        { align: 'right' }
      );
    },
  });

  const blob = doc.output('blob');
  return {
    blob,
    fileName: NPWP_MASTER_PDF_FILENAME,
    totalCount: sortedRecords.length,
  };
}

export function downloadNpwpMasterPdf(params: {
  npwpRecords: NpwpRecord[];
  submissions?: Submission[];
  companyName?: string;
}): void {
  const { blob, fileName } = generateNpwpMasterPdfBlob(params);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

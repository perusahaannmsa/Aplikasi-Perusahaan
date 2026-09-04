// Utility functions for formatting and calculations
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { areNamesSimilar } from './utils/nameConsolidation';
export { areNamesSimilar, toTitleCase, findDuplicateNameClusters, applyNameConsolidation } from './utils/nameConsolidation';
export { 
  checkIsHolidayOrWeekend, 
  formatDateWithDayIndonesian, 
  getNextWorkday, 
  getPreviousWorkday, 
  getDefaultTransactionDate,
  type HolidayCheckResult 
} from './utils/holidayUtils';

export interface PdfInputSource {
  bytes: Uint8Array;
  type: string;
  name: string;
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  if (!text) return [];
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const sanitizedPara = sanitizeString(para);
    const words = sanitizedPara.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (!word) continue;
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth) {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

export function sanitizeString(str: string | null | undefined): string {
  if (!str) return '';
  
  // 1. Map smart punctuation and other common symbols to standard ASCII equivalents
  const conversionMap: { [key: string]: string } = {
    '“': '"',
    '”': '"',
    '‘': "'",
    '’': "'",
    '–': '-',
    '—': '-',
    '…': '...',
    '•': '*',
    '™': 'TM',
    '®': '(R)',
    '©': '(C)',
    '′': "'",
    '″': '"',
  };
  
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (conversionMap[char] !== undefined) {
      result += conversionMap[char];
    } else {
      result += char;
    }
  }
  
  // 2. Filter out anything that is not in the standard safe range of WinAnsi
  // Safe characters are from 32 to 126, and from 160 to 255.
  let cleanResult = '';
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      cleanResult += result[i];
    } else {
      // Replaces control characters or emojis with clean spacing
      if (code !== 10 && code !== 13 && code !== 9) {
        cleanResult += ' ';
      }
    }
  }
  
  return cleanResult;
}

export function cleanSingleLine(text: string | null | undefined): string {
  if (!text) return '';
  const flattened = text.replace(/[\r\n\t]+/g, ' ');
  return sanitizeString(flattened);
}

export async function generateF1PdfBytes(submission: any, grandTotal: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.27, 841.89]);
  
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  
  // Draw Logo text
  page.drawText('PT. NUSANTARA MINERAL SUKSES ABADI', { x: 40, y: 795, size: 14, font: fontBold });
  page.drawText('VOUCHER SYSTEM PLATFORM', { x: 40, y: 780, size: 8, font: fontRegular });
  
  // Draw Code and Date Box top right
  page.drawRectangle({
    x: 370,
    y: 770,
    width: 185,
    height: 35,
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
    color: rgb(0.95, 0.95, 0.95)
  });
  page.drawText(cleanSingleLine(submission.kode), { x: 380, y: 782, size: 10, font: fontMono });
  page.drawText(`Tanggal : ${cleanSingleLine(formatDateIndonesian(submission.tanggal))}`, { x: 370, y: 755, size: 9, font: fontRegular });

  // Draw title in box
  page.drawRectangle({
    x: 40,
    y: 700,
    width: 515,
    height: 35,
    color: rgb(1, 1, 1),
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
  });
  page.drawText('BUKTI PENGELUARAN KAS / BANK', { x: 175, y: 712, size: 12, font: fontBold });

  // Draw metadata fields
  const yStart = 675;
  page.drawText('Dibayarkan Kepada  :   ' + cleanSingleLine(submission.dibayarkanKepada), { x: 45, y: yStart, size: 10, font: fontBold });
  
  page.drawText('Jenis Pengajuan       :   ' + cleanSingleLine(submission.jenisPengajuan), { x: 45, y: yStart - 18, size: 10, font: fontRegular });
  page.drawText('Kode                       :   ' + cleanSingleLine(submission.kode), { x: 45, y: yStart - 36, size: 10, font: fontMono });
  
  // Dibayarkan dengan
  page.drawText('Dibayarkan dengan   : ', { x: 45, y: yStart - 54, size: 10, font: fontRegular });
  
  // Draw Checkboxes
  page.drawRectangle({ x: 165, y: yStart - 56, width: 25, height: 12, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText(submission.dibayarkanDengan === 'Tunai' ? 'X' : '', { x: 174, y: yStart - 53, size: 9, font: fontBold });
  page.drawText('Tunai', { x: 195, y: yStart - 54, size: 9, font: fontRegular });
  
  page.drawRectangle({ x: 235, y: yStart - 56, width: 25, height: 12, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText(submission.dibayarkanDengan === 'Cek/Transfer' ? 'X' : '', { x: 244, y: yStart - 53, size: 9, font: fontBold });
  page.drawText('Cek / Transfer', { x: 265, y: yStart - 54, size: 9, font: fontRegular });

  // Draw table
  page.drawRectangle({
    x: 40,
    y: 530,
    width: 515,
    height: 25,
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
    color: rgb(1,1,1)
  });
  page.drawText('JENIS PENGAJUAN', { x: 50, y: 539, size: 9, font: fontBold });
  page.drawText('JUMLAH', { x: 490, y: 539, size: 9, font: fontBold });

  let curY = 530;
  const items = submission.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemTextWrapped = wrapText(item.item || '', 350, fontRegular, 9);
    const rowHeight = itemTextWrapped.length * 14 + 15;
    
    page.drawRectangle({
      x: 40,
      y: curY - rowHeight,
      width: 515,
      height: rowHeight,
      borderColor: rgb(0,0,0),
      borderWidth: 1,
    });
    // col check line
    page.drawLine({ start: { x: 390, y: curY }, end: { x: 390, y: curY - rowHeight }, thickness: 1 });

    for (let l = 0; l < itemTextWrapped.length; l++) {
      page.drawText(itemTextWrapped[l], { x: 50, y: curY - 15 - (l * 12), size: 9, font: fontBold });
    }
    
    page.drawText('Rp ' + formatRupiah(item.total), { x: 400, y: curY - 15, size: 10, font: fontBold });
    curY -= rowHeight;
  }

  // Draw total row
  page.drawRectangle({
    x: 40,
    y: curY - 25,
    width: 515,
    height: 25,
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
    color: rgb(0.98,0.98,0.98)
  });
  page.drawLine({ start: { x: 390, y: curY }, end: { x: 390, y: curY - 25 }, thickness: 1.5 });
  page.drawText('Total', { x: 50, y: curY - 17, size: 10, font: fontBold });
  page.drawText('Rp ' + formatRupiah(grandTotal), { x: 400, y: curY - 17, size: 10, font: fontBold });
  curY -= 25;

  // Draw Terbilang
  page.drawRectangle({
    x: 40,
    y: curY - 45,
    width: 515,
    height: 35,
    borderColor: rgb(0,0,0),
    borderWidth: 1,
    color: rgb(0.98,0.98,0.98)
  });
  page.drawText('Terbilang :', { x: 48, y: curY - 25, size: 9, font: fontBold });
  const wrappedTerbilang = wrapText('"' + numberToTerbilang(grandTotal) + '"', 420, fontRegular, 9);
  for (let l = 0; l < Math.min(wrappedTerbilang.length, 2); l++) {
    page.drawText(wrappedTerbilang[l], { x: 110, y: curY - 15 - (l * 11), size: 9, font: fontRegular });
  }
  curY -= 45;

  // Signatures Row (3 Signers for F1: Diajukan, Diverifikasi, Disetujui)
  const blockW = 515 / 3;
  const sigY = curY - 70;

  const applicantName = cleanSingleLine(submission.diajukanOleh || 'Andi Dhiya Salsabila');
  const applicantRole = cleanSingleLine(submission.diajukanJabatan || 'Keuangan');

  const rawApprover2 = submission.disetujuiOleh2;
  const isNursyam = rawApprover2 && rawApprover2.toLowerCase().includes('nursyam');
  const approverName = cleanSingleLine(isNursyam || !rawApprover2 ? 'Harijon' : rawApprover2);
  const approverRole = cleanSingleLine(isNursyam || !submission.disetujuiJabatan2 ? 'Direktur Keuangan' : submission.disetujuiJabatan2);

  const verifierRaw = submission.diverifikasiOleh;
  const isVerifierNursyam = verifierRaw?.toLowerCase().includes('nursyam') || isNursyam;
  const verifierName = cleanSingleLine(
    verifierRaw && verifierRaw !== 'Andi Dhiya Salsabila'
      ? verifierRaw
      : (isNursyam ? 'Andi Nursyam Halid' : 'Andi Rifki Naufal')
  );
  const verifierRole = cleanSingleLine(
    isVerifierNursyam
      ? 'Direktur Utama'
      : (submission.diverifikasiJabatan && submission.diverifikasiJabatan !== 'Keuangan'
        ? submission.diverifikasiJabatan
        : 'Direktur')
  );

  // Title Headers ("Diajukan", "Diverifikasi", "Disetujui")
  page.drawText('Diajukan', { x: 40 + (blockW / 2) - 18, y: curY - 20, size: 9, font: fontRegular });
  page.drawText('Diverifikasi', { x: 40 + blockW + (blockW / 2) - 22, y: curY - 20, size: 9, font: fontRegular });
  page.drawText('Disetujui', { x: 40 + blockW * 2 + (blockW / 2) - 18, y: curY - 20, size: 9, font: fontRegular });

  // Diajukan Name & Line & Role
  page.drawText(applicantName, { x: 40 + (blockW / 2) - (applicantName.length * 2.3), y: sigY, size: 9, font: fontBold });
  page.drawLine({ start: { x: 40 + 20, y: sigY - 2 }, end: { x: 40 + blockW - 20, y: sigY - 2 }, thickness: 1 });
  page.drawText(applicantRole, { x: 40 + (blockW / 2) - (applicantRole.length * 2), y: sigY - 14, size: 8, font: fontRegular });

  // Diverifikasi Name & Line & Role
  page.drawText(verifierName, { x: 40 + blockW + (blockW / 2) - (verifierName.length * 2.3), y: sigY, size: 9, font: fontBold });
  page.drawLine({ start: { x: 40 + blockW + 20, y: sigY - 2 }, end: { x: 40 + blockW * 2 - 20, y: sigY - 2 }, thickness: 1 });
  page.drawText(verifierRole, { x: 40 + blockW + (blockW / 2) - (verifierRole.length * 2), y: sigY - 14, size: 8, font: fontRegular });

  // Disetujui Name & Line & Role
  page.drawText(approverName, { x: 40 + blockW * 2 + (blockW / 2) - (approverName.length * 2.3), y: sigY, size: 9, font: fontBold });
  page.drawLine({ start: { x: 40 + blockW * 2 + 20, y: sigY - 2 }, end: { x: 40 + 515 - 20, y: sigY - 2 }, thickness: 1 });
  page.drawText(approverRole, { x: 40 + blockW * 2 + (blockW / 2) - (approverRole.length * 2), y: sigY - 14, size: 8, font: fontRegular });

  // Notes block
  const noteY = sigY - 45;
  page.drawText('NOTE :', { x: 40, y: noteY, size: 9, font: fontBold });
  page.drawRectangle({
    x: 40,
    y: noteY - 45,
    width: 515,
    height: 38,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
    color: rgb(0.98, 0.98, 0.98),
  });
  if (submission.notes) {
    page.drawText(cleanSingleLine(submission.notes), { x: 45, y: noteY - 28, size: 8, font: fontRegular });
  }

  return await pdfDoc.save();
}

export async function generateF2PdfBytes(submission: any, grandTotal: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.27, 841.89]);
  
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  
  // Draw Logo text
  page.drawText('PT. NUSANTARA MINERAL SUKSES ABADI', { x: 40, y: 795, size: 14, font: fontBold });
  page.drawText('VOUCHER SYSTEM PLATFORM', { x: 40, y: 780, size: 8, font: fontRegular });
  
  // Draw title in box
  page.drawRectangle({
    x: 40,
    y: 720,
    width: 515,
    height: 35,
    color: rgb(0.85, 0.85, 0.85),
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.5,
  });
  page.drawText('FORMULIR PENGAJUAN DANA', { x: 190, y: 732, size: 12, font: fontBold });

  // Draw metadata box
  page.drawRectangle({
    x: 40,
    y: 620,
    width: 515,
    height: 80,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.5,
  });
  
  const txtLokasi = `Lokasi                      :  ${cleanSingleLine(submission.lokasi)}`;
  const txtTanggal = `Tanggal                    :  ${cleanSingleLine(formatDateIndonesian(submission.tanggal))}`;
  const txtJenis = `Jenis Pengajuan       :  ${cleanSingleLine(submission.jenisPengajuan)}`;
  const txtKode = `Kode                       :  ${cleanSingleLine(submission.kode)}`;
  
  page.drawText(txtLokasi, { x: 55, y: 680, size: 10, font: fontRegular });
  page.drawText(txtTanggal, { x: 55, y: 663, size: 10, font: fontRegular });
  page.drawText(txtJenis, { x: 55, y: 646, size: 10, font: fontRegular });
  page.drawText(txtKode, { x: 55, y: 629, size: 10, font: fontMono });

  // Draw Table header
  page.drawRectangle({
    x: 40,
    y: 575,
    width: 515,
    height: 25,
    color: rgb(0.9, 0.9, 0.9),
    borderColor: rgb(0,0,0),
    borderWidth: 1,
  });
  
  page.drawText('NO', { x: 45, y: 583, size: 8, font: fontBold });
  page.drawText('ITEM DETIL (INVOICE / DESKRIPSI)', { x: 75, y: 583, size: 8, font: fontBold });
  page.drawText('VOL', { x: 325, y: 583, size: 8, font: fontBold });
  page.drawText('TOTAL (RP)', { x: 400, y: 583, size: 8, font: fontBold });
  page.drawText('KETERANGAN', { x: 475, y: 583, size: 8, font: fontBold });

  let curY = 575;
  const items = submission.items || [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const descWrapped = wrapText(item.item || '', 240, fontRegular, 8);
    const ketWrapped = wrapText(item.keterangan || '-', 70, fontRegular, 8);
    const rowHeight = Math.max(descWrapped.length, ketWrapped.length, 1) * 12 + 10;
    
    // Draw row rectangle
    page.drawRectangle({
      x: 40,
      y: curY - rowHeight,
      width: 515,
      height: rowHeight,
      borderColor: rgb(0,0,0),
      borderWidth: 1,
    });
    
    // Draw columns vertical separation borders
    page.drawLine({ start: { x: 65, y: curY }, end: { x: 65, y: curY - rowHeight }, thickness: 1 });
    page.drawLine({ start: { x: 320, y: curY }, end: { x: 320, y: curY - rowHeight }, thickness: 1 });
    page.drawLine({ start: { x: 390, y: curY }, end: { x: 390, y: curY - rowHeight }, thickness: 1 });
    page.drawLine({ start: { x: 470, y: curY }, end: { x: 470, y: curY - rowHeight }, thickness: 1 });

    // Fill row texts
    page.drawText(String(i + 1), { x: 48, y: curY - 15, size: 8, font: fontMono });
    
    for (let dLine = 0; dLine < descWrapped.length; dLine++) {
      page.drawText(descWrapped[dLine], { x: 75, y: curY - 15 - (dLine * 11), size: 8, font: fontBold });
    }
    
    page.drawText(cleanSingleLine(item.jumlahVolume || '-'), { x: 325, y: curY - 15, size: 8, font: fontRegular });
    page.drawText(formatRupiah(item.total), { x: 395, y: curY - 15, size: 8, font: fontBold });
    
    for (let kLine = 0; kLine < ketWrapped.length; kLine++) {
      page.drawText(ketWrapped[kLine], { x: 475, y: curY - 15 - (kLine * 11), size: 8, font: fontRegular });
    }
    
    curY -= rowHeight;
  }
  
  // Total Row
  page.drawRectangle({
    x: 40,
    y: curY - 25,
    width: 515,
    height: 25,
    color: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0,0,0),
    borderWidth: 1.5,
  });
  page.drawLine({ start: { x: 390, y: curY }, end: { x: 390, y: curY - 25 }, thickness: 1.5 });
  page.drawText('TOTAL PENYERAHAN', { x: 150, y: curY - 17, size: 9, font: fontBold });
  page.drawText(formatRupiah(grandTotal), { x: 395, y: curY - 17, size: 9, font: fontBold });
  
  curY -= 25;
  
  // Signatures
  const sigY = curY - 80;
  const f2Dibuat = cleanSingleLine(submission.dibuatOleh || 'Nur Wahyudi');
  const f2DiajukanName = cleanSingleLine(submission.diajukanOleh || 'Andi Dhiya Salsabila');
  const f2DiajukanRole = cleanSingleLine(submission.diajukanJabatan || 'Keuangan');

  page.drawText('Dibuat Oleh', { x: 90, y: curY - 30, size: 10, font: fontRegular });
  page.drawText(f2Dibuat, { x: 70, y: sigY, size: 10, font: fontBold });
  page.drawLine({ start: { x: 60, y: sigY - 2 }, end: { x: 200, y: sigY - 2 }, thickness: 1 });
  page.drawText('Staff Keuangan', { x: 90, y: sigY - 14, size: 8, font: fontRegular });
  
  page.drawText('Diajukan', { x: 410, y: curY - 30, size: 10, font: fontRegular });
  page.drawText(f2DiajukanName, { x: 375, y: sigY, size: 10, font: fontBold });
  page.drawLine({ start: { x: 370, y: sigY - 2 }, end: { x: 500, y: sigY - 2 }, thickness: 1 });
  page.drawText(f2DiajukanRole, { x: 405, y: sigY - 14, size: 8, font: fontRegular });
  
  // Notes block
  curY = sigY - 50;
  page.drawText('NOTE :', { x: 40, y: curY, size: 9, font: fontBold });
  page.drawRectangle({
    x: 40,
    y: curY - 50,
    width: 515,
    height: 40,
    borderColor: rgb(0,0,0),
    borderWidth: 1,
  });
  const wrappedNotes = wrapText(submission.notes || 'Tidak ada catatan tambahan.', 550, fontRegular, 8);
  for (let nLine = 0; nLine < Math.min(wrappedNotes.length, 3); nLine++) {
    page.drawText(wrappedNotes[nLine], { x: 45, y: curY - 14 - (nLine * 11), size: 8, font: fontRegular });
  }
  
  return await pdfDoc.save();
}

export function formatRupiah(value: number | string): string {
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g, ''));
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
}

export interface VolumeAnalysisResult {
  type: 'qty' | 'price' | 'volume' | 'custom' | 'empty';
  badgeLabel: string;
  formattedText: string;
  rawValue: string;
}

/**
 * Intelligent detector for "Jumlah / Volume" input:
 * - 2 digits or < 100 / explicit piece units -> Type: 'qty' (Pcs / Quantity)
 * - Thousands (>= 1000, dots, Rp) -> Type: 'price' (Satuan Harga / Tarif)
 * - Volume / liquid keywords (liter, ltr, ml, m3, galon, drum, etc.) -> Type: 'volume'
 * - Custom units (1 Bulan, 1 Paket, 1 Lot, etc.) -> Type: 'custom'
 */
export function analyzeVolumeInput(val: string | null | undefined): VolumeAnalysisResult {
  if (!val || !val.trim()) {
    return { type: 'empty', badgeLabel: 'Jumlah / Vol', formattedText: '-', rawValue: '' };
  }
  const clean = val.trim();

  // 1. Check Volume / Liquid / Mass keywords (Liter, Ltr, ML, M3, Kubik, Galon, Drum, Kl, etc.)
  const isVolumeUnit = /(?:^|\s|\d)(?:liter|ltr|lt\b|l\b|ml\b|mili(?:liter)?|cc\b|m3\b|m³\b|kubik|cbm|galon|gallon|drum|tangki|jerigen|jeriken|kl\b|kiloliter|ton\b|kg\b|kilo(?:gram)?|gram|gr\b)(?:$|\s|\b)/i.test(clean);
  if (isVolumeUnit) {
    return {
      type: 'volume',
      badgeLabel: 'Volume',
      formattedText: clean,
      rawValue: clean
    };
  }

  // 2. Check if Currency / Nominal in thousands, has Rp/IDR, or large number >= 1000
  const hasCurrencySymbol = /^(rp\.?|idr)\s*/i.test(clean);
  const hasThousandDots = /^\d{1,3}(\.\d{3})+(\,\d+)?$/.test(clean);
  const hasThousandCommas = /^\d{1,3}(\,\d{3})+(\.\d+)?$/.test(clean);
  const hasKOrRbSuffix = /^\d+(\.\d+)?\s*(k|rb|ribu|jt|juta)$/i.test(clean);
  const isPureNumber = /^\d+$/.test(clean);
  const numericVal = isPureNumber ? Number(clean) : NaN;
  const isThousandsOrHigher = !isNaN(numericVal) && numericVal >= 1000;

  if (hasCurrencySymbol || hasThousandDots || hasThousandCommas || hasKOrRbSuffix || isThousandsOrHigher) {
    let num = NaN;
    if (hasKOrRbSuffix) {
      const match = clean.match(/^(\d+(?:\.\d+)?)\s*(k|rb|ribu|jt|juta)$/i);
      if (match) {
        const base = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 'k' || unit === 'rb' || unit === 'ribu') num = base * 1000;
        else if (unit === 'jt' || unit === 'juta') num = base * 1000000;
      }
    } else {
      const digitsOnly = clean.replace(/[^0-9]/g, '');
      num = Number(digitsOnly);
    }

    const formatted = !isNaN(num) && num > 0 ? `Rp ${num.toLocaleString('id-ID')}` : clean;
    return {
      type: 'price',
      badgeLabel: 'Satuan Harga',
      formattedText: formatted,
      rawValue: clean
    };
  }

  // 3. Explicit quantity unit suffix (pcs, box, unit, lembar, buah, etc.)
  const isExplicitQty = /^\d+\s*(pcs|pc|bh|biji|buah|unit|box|set|roll|lembar|lbr|btg|btl|botol|pack|pak|zak|dus|bt|sak|qty|quantity|pax|org|orang)$/i.test(clean);
  if (isExplicitQty) {
    return {
      type: 'qty',
      badgeLabel: 'Pcs / Qty',
      formattedText: clean,
      rawValue: clean
    };
  }

  // 4. Pure integer number < 100 (1 or 2 digits) or < 1000 -> Auto-format as Pcs
  if (isPureNumber) {
    return {
      type: 'qty',
      badgeLabel: 'Pcs / Qty',
      formattedText: `${clean} Pcs`,
      rawValue: clean
    };
  }

  // 5. Custom text / unit (e.g. 1 Bulan, 1 Paket, 1 Lot, 1 Ls, etc.)
  return {
    type: 'custom',
    badgeLabel: clean,
    formattedText: clean,
    rawValue: clean
  };
}

const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function formatDateIndonesian(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const day = date.getDate().toString().padStart(2, '0');
  const month = INDONESIAN_MONTHS[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

export function numberToTerbilang(angka: number): string {
  const nominal = Math.floor(Math.abs(angka));
  if (nominal === 0) return 'Nol Rupiah';
  
  const prefix = angka < 0 ? 'Minus ' : '';
  const hasil = terbilangHelper(nominal).replace(/\s+/g, ' ').trim();
  return hasil ? prefix + hasil + ' Rupiah' : 'Nol Rupiah';
}

function terbilangHelper(nominal: number): string {
  const huruf = [
    '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 
    'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
  ];
  
  if (nominal < 12) {
    return ' ' + huruf[nominal];
  } else if (nominal < 20) {
    return terbilangHelper(nominal - 10) + ' Belas';
  } else if (nominal < 100) {
    return terbilangHelper(Math.floor(nominal / 10)) + ' Puluh' + terbilangHelper(nominal % 10);
  } else if (nominal < 200) {
    return ' Seratus' + terbilangHelper(nominal - 100);
  } else if (nominal < 1000) {
    return terbilangHelper(Math.floor(nominal / 100)) + ' Ratus' + terbilangHelper(nominal % 100);
  } else if (nominal < 2000) {
    return ' Seribu' + terbilangHelper(nominal - 1000);
  } else if (nominal < 1000000) {
    return terbilangHelper(Math.floor(nominal / 1000)) + ' Ribu' + terbilangHelper(nominal % 1000);
  } else if (nominal < 1000000000) {
    return terbilangHelper(Math.floor(nominal / 1000000)) + ' Juta' + terbilangHelper(nominal % 1000000);
  } else if (nominal < 1000000000000) {
    return terbilangHelper(Math.floor(nominal / 1000000000)) + ' Milyar' + terbilangHelper(nominal % 1000000000);
  } else if (nominal < 1000000000000000) {
    return terbilangHelper(Math.floor(nominal / 1000000000000)) + ' Triliun' + terbilangHelper(nominal % 1000000000000);
  }
  return '';
}

export async function compressImage(
  imageBytes: Uint8Array,
  mimeType: string,
  maxWidthOrHeight: number = 1000,
  quality: number = 0.70
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  // If it's not a common web image, return unchanged
  if (!mimeType.startsWith('image/') || mimeType.includes('gif')) {
    return { bytes: imageBytes, mimeType };
  }

  return new Promise((resolve) => {
    try {
      const blob = new Blob([imageBytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        // Calculate new dimensions preserving aspect ratio
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
          if (width > height) {
            height = Math.round((height * maxWidthOrHeight) / width);
            width = maxWidthOrHeight;
          } else {
            width = Math.round((width * maxWidthOrHeight) / height);
            height = maxWidthOrHeight;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          console.warn('Could not get 2D context for canvas compression');
          resolve({ bytes: imageBytes, mimeType });
          return;
        }
        
        // Fill white background (useful for transparent PNG conversion to JPG)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to highly compact JPEG format
        const outputMime = 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputMime, quality);
        const base64Str = dataUrl.split(',')[1];
        const binaryStr = window.atob(base64Str);
        const outBytes = new Uint8Array(binaryStr.length);
        
        for (let i = 0; i < binaryStr.length; i++) {
          outBytes[i] = binaryStr.charCodeAt(i);
        }
        
        console.log(`[Image Compression] Standardised & compressed image: ${(imageBytes.length / 1024).toFixed(1)} KB -> ${(outBytes.length / 1024).toFixed(1)} KB`);
        resolve({ bytes: outBytes, mimeType: outputMime });
      };
      
      img.onerror = (err) => {
        console.warn('Failed to load image for compression fallback:', err);
        URL.revokeObjectURL(url);
        resolve({ bytes: imageBytes, mimeType });
      };
      
      img.src = url;
    } catch (e) {
      console.warn('Error during image compress execution:', e);
      resolve({ bytes: imageBytes, mimeType });
    }
  });
}

export async function convertImageToPdf(imageBytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  // Perform automatic compression and standardization
  let processedBytes = imageBytes;
  let processedMime = mimeType;
  try {
    const compressed = await compressImage(imageBytes, mimeType, 1200, 0.7);
    processedBytes = compressed.bytes;
    processedMime = compressed.mimeType;
  } catch (err) {
    console.warn('Failed image compression step inside pdf converter:', err);
  }

  const pdfDoc = await PDFDocument.create();
  let image;
  try {
    if (processedMime === 'image/png' || processedMime.includes('png')) {
      image = await pdfDoc.embedPng(processedBytes);
    } else {
      image = await pdfDoc.embedJpg(processedBytes);
    }
  } catch (err) {
    console.warn('Failed to embed image in PDF directly, attempting to embed as JPEG anyway:', err);
    try {
      image = await pdfDoc.embedJpg(processedBytes);
    } catch (e2) {
      throw new Error('Format gambar tidak didukung atau rusak.');
    }
  }

  // Get image dimensions
  const dims = image.scale(1);
  
  // Standard A4 dimensions in points: 595.27 x 841.89
  const a4Width = 595.27;
  const a4Height = 841.89;
  
  // Create page with A4 dimensions
  const page = pdfDoc.addPage([a4Width, a4Height]);
  
  // Calculate scaling factor to fit image on page with some margins (e.g. 20pt)
  const margin = 20;
  const maxWidth = a4Width - (margin * 2);
  const maxHeight = a4Height - (margin * 2);
  
  let scale = 1;
  if (dims.width > maxWidth || dims.height > maxHeight) {
    const scaleX = maxWidth / dims.width;
    const scaleY = maxHeight / dims.height;
    scale = Math.min(scaleX, scaleY);
  }
  
  const width = dims.width * scale;
  const height = dims.height * scale;
  
  // Center image on the page
  const x = (a4Width - width) / 2;
  const y = (a4Height - height) / 2;
  
  page.drawImage(image, {
    x,
    y,
    width,
    height,
  });
  
  return await pdfDoc.save();
}

export async function mergeFilesToSinglePdf(files: File[]): Promise<{ bytes: Uint8Array; name: string; mime: string }> {
  if (!files || files.length === 0) {
    throw new Error('Tidak ada berkas yang dipilih.');
  }
  if (files.length === 1) {
    const f = files[0];
    const bytes = new Uint8Array(await f.arrayBuffer());
    let mime = f.type || 'application/octet-stream';
    let name = f.name;
    if (mime.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(name)) {
      const pdfBytes = await convertImageToPdf(bytes, mime);
      return { bytes: pdfBytes, name: name.replace(/\.[^/.]+$/, '') + '.pdf', mime: 'application/pdf' };
    }
    return { bytes, name, mime };
  }

  const mergedPdf = await PDFDocument.create();
  let baseName = 'BuktiPembayaran_Gabungan';

  for (const file of files) {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const mime = file.type || '';
    const name = file.name || '';
    if (mime.includes('pdf') || name.toLowerCase().endsWith('.pdf')) {
      try {
        const srcPdf = await PDFDocument.load(fileBytes);
        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } catch (e) {
        console.warn('Failed to parse PDF during merge:', e);
      }
    } else if (mime.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(name)) {
      try {
        const pdfBytesFromImg = await convertImageToPdf(fileBytes, mime || 'image/jpeg');
        const srcPdf = await PDFDocument.load(pdfBytesFromImg);
        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } catch (imgErr) {
        console.warn('Failed to convert image to PDF during merge:', imgErr);
      }
    }
  }

  const pdfBytes = await mergedPdf.save();
  return {
    bytes: pdfBytes,
    name: `${baseName}_${Date.now()}.pdf`,
    mime: 'application/pdf',
  };
}

/**
 * Unified helper to check if a submission is Petty Cash across ALL menus & views.
 * Strictly checks that the submission contains "Petty Cash" or "Kas Kecil" in:
 * - jenisPengajuan (e.g. "Petty Cash", "Pengisian Petty Cash Lapangan", "Kas Kecil")
 * - items description (item name / keterangan)
 * - notes / deskripsi pengeluaran
 * - transaction code (kode) specifically for Petty Cash
 */
export function isPettyCashSubmission(sub: any): boolean {
  if (!sub) return false;

  // 1. Check Jenis Pengajuan
  const jenis = (sub.jenisPengajuan || sub.jenis || '').toLowerCase();
  if (jenis.includes('petty cash') || jenis.includes('kas kecil') || jenis.includes('pettycash')) {
    return true;
  }

  // 2. Check general notes / deskripsi pengeluaran
  const notes = (sub.notes || sub.deskripsi || sub.keterangan || '').toLowerCase();
  if (notes.includes('petty cash') || notes.includes('kas kecil') || notes.includes('pettycash')) {
    return true;
  }

  // 3. Check items description / keterangan (isi deskripsi pengeluaran per item)
  if (sub.items && Array.isArray(sub.items)) {
    const hasPcItem = sub.items.some((i: any) => {
      const itemDesc = (i.item || i.namaItem || i.uraian || '').toLowerCase();
      const itemKet = (i.keterangan || '').toLowerCase();
      return itemDesc.includes('petty cash') || itemDesc.includes('kas kecil') || itemDesc.includes('pettycash') ||
             itemKet.includes('petty cash') || itemKet.includes('kas kecil') || itemKet.includes('pettycash');
    });
    if (hasPcItem) return true;
  }

  // 4. Check specific Petty Cash voucher codes
  const kode = (sub.kode || '').toLowerCase();
  if (
    kode.includes('/pc/') || 
    kode.includes('-pc-') || 
    kode.endsWith('/pc') || 
    kode.startsWith('pc-') || 
    kode.includes('bkk-pc') ||
    kode.includes('petty-cash') ||
    kode.includes('pettycash')
  ) {
    return true;
  }

  // 5. Check if dedicated Petty Cash file is attached with explicit petty cash naming
  if (sub.pettyCashFile?.name) {
    const fileName = sub.pettyCashFile.name.toLowerCase();
    if (fileName.includes('petty') || fileName.includes('kas kecil')) {
      return true;
    }
  }

  return false;
}

/**
 * Unified helper to check if a submission is an SPPD (Perjalanan Dinas) transaction across ALL views.
 * Detects based on jenisPengajuan, notes, kode, or item descriptions containing SPPD / Perjalanan Dinas.
 */
export function isSppdSubmission(sub: any): boolean {
  if (!sub) return false;
  
  const jenis = (sub.jenisPengajuan || sub.jenis || '').toLowerCase();
  if (jenis.includes('sppd') || jenis.includes('perjalanan dinas') || jenis.includes('biaya dinas') || jenis.includes('dinas luar') || jenis.includes('tugas dinas')) return true;
  
  const notes = (sub.notes || sub.deskripsi || sub.keterangan || '').toLowerCase();
  if (notes.includes('sppd') || notes.includes('perjalanan dinas') || notes.includes('surat perintah tugas') || notes.includes('dinas luar') || notes.includes('biaya dinas')) return true;
  
  const kode = (sub.kode || '').toLowerCase();
  if (kode.includes('/sppd') || kode.includes('-sppd') || kode.includes('sppd-') || kode.includes('bkk-sppd') || kode.includes('perjalanan-dinas')) return true;
  
  if (sub.sppdNumber || sub.noSppd || sub.sppdData) return true;
  
  // Also check items description / keterangan
  if (sub.items && Array.isArray(sub.items)) {
    const hasSppdItem = sub.items.some((i: any) => {
      const itemDesc = (i.item || i.namaItem || i.uraian || '').toLowerCase();
      const itemKet = (i.keterangan || '').toLowerCase();
      return itemDesc.includes('sppd') || itemDesc.includes('perjalanan dinas') || itemDesc.includes('uang makan dinas') || 
             itemDesc.includes('uang saku dinas') || itemDesc.includes('tiket dinas') || 
             itemKet.includes('sppd') || itemKet.includes('perjalanan dinas') || itemKet.includes('biaya dinas');
    });
    if (hasSppdItem) return true;
  }
  return false;
}

/**
 * Retrieve SPPD employee / traveler name safely
 */
export function getSppdEmployeeName(sub: any): string {
  if (!sub) return '';
  if (sub.sppdData?.namaPegawai) return sub.sppdData.namaPegawai;
  if (sub.sppdData?.namaPekerja) return sub.sppdData.namaPekerja;
  if (sub.dibayarkanKepada && typeof sub.dibayarkanKepada === 'string' && sub.dibayarkanKepada.trim()) {
    return sub.dibayarkanKepada.trim();
  }
  return '';
}

/**
 * Retrieve custodian name safely with fallback to recipient and optional normalization against known holders
 */
export function getPettyCashCustodian(sub: any, knownHolders?: string[]): string {
  if (!sub) return '';
  let raw = '';
  if (sub.pettyCashCustodian && typeof sub.pettyCashCustodian === 'string' && sub.pettyCashCustodian.trim()) {
    raw = sub.pettyCashCustodian.trim();
  } else if (sub.dibayarkanKepada && typeof sub.dibayarkanKepada === 'string' && sub.dibayarkanKepada.trim()) {
    raw = sub.dibayarkanKepada.trim();
  }
  if (!raw) return '';

  // If known registered holders provided, resolve to the canonical registered holder if similar
  if (knownHolders && knownHolders.length > 0) {
    const matched = knownHolders.find(h => areNamesSimilar(h, raw).isMatch);
    if (matched) return matched;
  }
  return raw;
}

/**
 * Unified helper to check if a submission is an Invoice across ALL views.
 */
export function isInvoiceSubmission(sub: any): boolean {
  if (!sub) return false;
  if (typeof sub.isInvoice === 'boolean') return sub.isInvoice;
  const hasInvoiceFile = !!sub.googleDriveFiles?.some(
    (f: any) => f.docType === 'invoice_vendor' || 
         (f.name || '').toLowerCase().includes('invoice') || 
         (f.name || '').toLowerCase().includes('tagihan')
  );
  const isInvoiceNote = (sub.notes || '').toLowerCase().includes('invoice') || 
                        (sub.notes || '').toLowerCase().includes('tagihan') || 
                        (sub.notes || '').toLowerCase().includes('inv/');
  const isInvoiceItem = sub.items?.some((i: any) => 
    (i.item || '').toLowerCase().includes('invoice') || 
    (i.keterangan || '').toLowerCase().includes('invoice')
  );
  const hasInvoiceNo = Boolean(sub.invoiceNumber && String(sub.invoiceNumber).trim().length > 0);
  const match = hasInvoiceFile || isInvoiceNote || isInvoiceItem || hasInvoiceNo;
  if (match) {
    const isTax = 
      (sub.jenisPengajuan || '').toLowerCase().includes('pajak') ||
      (sub.dibayarkanKepada || '').toLowerCase().includes('pajak') ||
      (sub.dibayarkanKepada || '').toLowerCase().includes('djp') ||
      (sub.notes || '').toLowerCase().includes('pajak') ||
      (sub.notes || '').toLowerCase().includes('djp') ||
      (sub.items || []).some((i: any) => 
        (i.item || '').toLowerCase().includes('pajak') || 
        (i.keterangan || '').toLowerCase().includes('pajak')
      );
    if (isTax) return false;
  }
  return match;
}

/**
 * Standard sorting helper for submissions: latest date first, with sequence & ID tiebreakers
 */
export function sortSubmissionsDescending<T extends { tanggal?: string; kode?: string; createdAt?: string; id?: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const dateA = a.tanggal || '';
    const dateB = b.tanggal || '';
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }
    const suffixA = a.kode ? parseInt(a.kode.split('/').pop() || '0', 10) : 0;
    const suffixB = b.kode ? parseInt(b.kode.split('/').pop() || '0', 10) : 0;
    if (!isNaN(suffixA) && !isNaN(suffixB) && suffixA !== suffixB) {
      return suffixB - suffixA;
    }
    const timeC = a.createdAt || '';
    const timeD = b.createdAt || '';
    if (timeC !== timeD) {
      return timeD.localeCompare(timeC);
    }
    return (b.id || '').localeCompare(a.id || '');
  });
}

// Stop words for corporate entities, titles, legal terms, and generic business labels
const ENTITY_STOP_WORDS = new Set([
  'pt', 'cv', 'ud', 'tbk', 'ltd', 'inc', 'corp', 'corporation', 'persero',
  'koperasi', 'yayasan', 'perum', 'cabang', 'cab', 'kantor', 'toko', 'bengkel',
  'h', 'hj', 'haji', 'hajjah', 'dr', 'drs', 'ir', 'sh', 'se', 'mm', 'st', 'skm',
  'bpk', 'bapak', 'ibu', 'sdr', 'sdri', 'dan', 'and', 'the', 'of', 'in', 'di',
  'consult', 'consulting', 'solution', 'solusi', 'servis', 'service', 'services',
  'makassar', 'jakarta', 'kendari', 'kolaka', 'pomalaa', 'surabaya'
]);

/**
 * Normalizes text for smart fuzzy and semantic token matching
 */
export function normalizeEntityString(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts core meaningful tokens from a company/vendor/person name
 */
export function extractCoreTokens(name: string | null | undefined): string[] {
  const norm = normalizeEntityString(name);
  if (!norm) return [];
  const words = norm.split(' ');
  const core = words.filter(w => w.length >= 2 && !ENTITY_STOP_WORDS.has(w));
  return core.length > 0 ? core : words.filter(w => w.length >= 2);
}

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Determines if two company or vendor names refer to the same entity
 * even with typos, abbreviations, prefixes ("PT", "CV", "H."), or incomplete names.
 */
export function isVendorOrCompanyMatch(nameA: string | null | undefined, nameB: string | null | undefined): boolean {
  if (!nameA || !nameB) return false;

  const rawA = nameA.trim();
  const rawB = nameB.trim();
  if (!rawA || !rawB) return false;

  // 1. Direct case-insensitive match
  if (rawA.toLowerCase() === rawB.toLowerCase()) return true;

  const normA = normalizeEntityString(rawA);
  const normB = normalizeEntityString(rawB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // 2. Direct Substring Match if length >= 3
  if (normA.length >= 3 && normB.length >= 3) {
    if (normA.includes(normB) || normB.includes(normA)) {
      return true;
    }
  }

  const tokensA = extractCoreTokens(rawA);
  const tokensB = extractCoreTokens(rawB);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // 3. Compact joined string comparison (e.g. "oowlindonesia" vs "oowl indonesia")
  const compactA = tokensA.join('');
  const compactB = tokensB.join('');
  if (compactA === compactB || (compactA.length >= 4 && compactB.length >= 4 && (compactA.includes(compactB) || compactB.includes(compactA)))) {
    return true;
  }

  // 4. Token Overlap & Fuzzy Token Evaluation
  let matchCount = 0;
  for (const tA of tokensA) {
    for (const tB of tokensB) {
      if (tA === tB) {
        matchCount++;
        break;
      }
      // Substring of token (e.g., "geoservice" and "geoservices", "wiraputra" and "wira")
      if (tA.length >= 4 && tB.length >= 4 && (tA.includes(tB) || tB.includes(tA))) {
        matchCount++;
        break;
      }
      // Levenshtein typo tolerance (1 typo for tokens >= 5 chars, 2 typos for tokens >= 8 chars)
      if (tA.length >= 5 && tB.length >= 5) {
        const maxDist = tA.length >= 8 ? 2 : 1;
        if (levenshteinDistance(tA, tB) <= maxDist) {
          matchCount++;
          break;
        }
      }
    }
  }

  // Rule A: If ALL core tokens of the shorter entity exist in the longer entity
  const minTokens = Math.min(tokensA.length, tokensB.length);
  if (minTokens > 0 && matchCount >= minTokens) {
    return true;
  }

  // Rule B: If at least 2 significant core tokens match
  if (matchCount >= 2) {
    return true;
  }

  // Rule C: If single unique distinct token (e.g., "sucofindo", "geoservices", "anindya", "tonasa", "krakatau") >= 4 chars matches
  if ((tokensA.length === 1 || tokensB.length === 1) && matchCount >= 1) {
    const singleToken = tokensA.length === 1 ? tokensA[0] : tokensB[0];
    if (singleToken.length >= 4 && !['utama', 'jaya', 'abadi', 'sukses', 'karya', 'mandiri', 'bersama'].includes(singleToken)) {
      return true;
    }
  }

  return false;
}


import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
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
export {
  calculateTaxDueDate,
  syncInvoiceSubmissionToAgenda,
  formatTransactionsSummaryNote,
  INDONESIAN_MONTHS
} from './utils/agendaTaxSync';

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

let cachedCorporateLogoBytes: Uint8Array | null = null;

export async function getCorporateLogoPngBytes(): Promise<Uint8Array | null> {
  if (cachedCorporateLogoBytes) return cachedCorporateLogoBytes;
  try {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      const res = await window.fetch('/kop-surat-nmsa-full.png');
      if (res.ok) {
        const arr = await res.arrayBuffer();
        cachedCorporateLogoBytes = new Uint8Array(arr);
        return cachedCorporateLogoBytes;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch corporate logo in browser:', err);
  }

  // Node.js SSR / Background task fallback
  if (typeof process !== 'undefined' && process.cwd) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const fullPath = path.join(process.cwd(), 'public', 'kop-surat-nmsa-full.png');
      if (fs.existsSync(fullPath)) {
        cachedCorporateLogoBytes = new Uint8Array(fs.readFileSync(fullPath));
        return cachedCorporateLogoBytes;
      }
    } catch {}
  }
  return null;
}

export async function getQrCodePngBytes(url: string, size = 160): Promise<Uint8Array | null> {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    } else {
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    }
  } catch (err) {
    console.warn('QR Code generation failed for PDF:', err);
    return null;
  }
}

export function formatDisplayItemTitle(itemTitle: string): string {
  if (!itemTitle) return '-';
  const lower = itemTitle.toLowerCase();
  
  if (lower.includes('rumah - bandara') || lower.includes('jkt - bandara') || (lower.includes('transport') && (lower.includes('bandara') || lower.includes('stasiun')) && !lower.includes('hotel'))) {
    return 'Transport Rumah - Bandara PP';
  }
  if ((lower.includes('hotel') && lower.includes('bandara')) || lower.includes('taksi') || lower.includes('taxi') || lower.includes('perjalanan:') || lower.includes('antar jemput')) {
    return 'Transport Bandara - Hotel PP';
  }
  if (lower.includes('uang makan') || lower.includes('makan')) {
    const daysMatch = itemTitle.match(/(\d+\s*Hari)/i);
    return daysMatch ? `Uang Makan (${daysMatch[1]})` : 'Uang Makan / Hari';
  }
  if (lower.includes('uang saku') || lower.includes('saku')) {
    const daysMatch = itemTitle.match(/(\d+\s*Hari)/i);
    return daysMatch ? `Uang Saku (${daysMatch[1]})` : 'Uang Saku';
  }
  if (lower.includes('tiket pesawat') || lower.includes('pesawat')) {
    return 'Tiket Pesawat PP';
  }
  if (lower.includes('kereta') || lower.includes('kai')) {
    return 'Tiket Kereta Api';
  }
  if (lower.includes('penginapan') || lower.includes('hotel')) {
    return 'Penginapan / Hotel';
  }
  return itemTitle;
}

async function drawCorporateHeader(
  pdfDoc: PDFDocument,
  page: any,
  fontBold: any,
  fontRegular: any,
  x: number,
  y: number,
  maxW: number = 240
): Promise<void> {
  const logoBytes = await getCorporateLogoPngBytes();
  if (logoBytes) {
    try {
      const logoImg = await pdfDoc.embedPng(logoBytes);
      const aspect = logoImg.width / logoImg.height; // ~ 1002 / 216 = 4.64
      const targetW = Math.min(maxW, 230);
      const targetH = targetW / aspect;
      page.drawImage(logoImg, {
        x,
        y: y - targetH + 12,
        width: targetW,
        height: targetH,
      });
      return;
    } catch (e) {
      console.warn('Embedding logo PNG failed, drawing vector logo:', e);
    }
  }

  // Graceful Corporate Vector Emblem & Brand Header
  page.drawRectangle({
    x,
    y: y - 36,
    width: 36,
    height: 36,
    borderColor: rgb(180 / 255, 83 / 255, 9 / 255),
    borderWidth: 1.5,
    color: rgb(254 / 255, 243 / 255, 199 / 255),
  });
  page.drawText('N', {
    x: x + 11,
    y: y - 28,
    size: 22,
    font: fontBold,
    color: rgb(180 / 255, 83 / 255, 9 / 255),
  });

  page.drawText('PT. NUSANTARA MINERAL SUKSES ABADI', {
    x: x + 44,
    y: y - 14,
    size: 11.5,
    font: fontBold,
    color: rgb(15 / 255, 23 / 255, 42 / 255),
  });
  page.drawText('MINING & GENERAL CONTRACTOR - BATUBARA & MINERAL', {
    x: x + 44,
    y: y - 27,
    size: 7.2,
    font: fontBold,
    color: rgb(71 / 255, 85 / 255, 105 / 255),
  });
  page.drawText('Head Office: Gedung Wisma Menara NMSA, Jakarta', {
    x: x + 44,
    y: y - 37,
    size: 6.8,
    font: fontRegular,
    color: rgb(100 / 255, 116 / 255, 139 / 255),
  });
}

export async function generateF1PdfBytes(
  submission: any,
  grandTotal: number,
  customSigners?: Array<{ title: string; name: string; role: string }>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.27, 841.89]);
  
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const pageWidth = 595.27;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 515.27 pt

  // ================= 1. HEADER BLOCK (LOGO + CODE + TANGGAL + QR CODE) =================
  const headerTopY = 805;

  // 1a. Draw Official Logo on Top Left
  await drawCorporateHeader(pdfDoc, page, fontBold, fontRegular, margin, headerTopY, 230);

  // 1b. Right Header: Voucher Code Box, Date & QR Code
  const qrSize = 48;
  const qrX = margin + contentWidth - qrSize;
  const qrY = headerTopY - 42;

  // Generate & Embed Verification QR Code
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://ais-dev-plekddulaqivufl6olm5y6-493574025735.asia-southeast1.run.app';
  const cleanSlug = (submission.jenisPengajuan || 'transaksi')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  const versionKey = submission.updatedAt ? encodeURIComponent(submission.updatedAt) : '';
  const shareUrl = `${origin}/shared-view?id=${encodeURIComponent(submission.id || '')}&kode=${encodeURIComponent(submission.kode || '')}&transaksi=${encodeURIComponent(cleanSlug)}&nominal=${grandTotal}${versionKey ? `&v=${versionKey}` : ''}`;
  
  const qrBytes = await getQrCodePngBytes(shareUrl, 150);
  if (qrBytes) {
    try {
      const qrImg = await pdfDoc.embedPng(qrBytes);
      page.drawRectangle({
        x: qrX - 2,
        y: qrY - 2,
        width: qrSize + 4,
        height: qrSize + 4,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1.0,
        color: rgb(1, 1, 1),
      });
      page.drawImage(qrImg, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });
    } catch (e) {
      console.warn('QR code embed failed:', e);
    }
  }

  // Voucher Code Box (Framed Box with mono font)
  const codeBoxW = 135;
  const codeBoxH = 24;
  const codeBoxX = qrX - codeBoxW - 10;
  const codeBoxY = headerTopY - 20;

  page.drawRectangle({
    x: codeBoxX,
    y: codeBoxY,
    width: codeBoxW,
    height: codeBoxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.2,
    color: rgb(248 / 255, 250 / 255, 252 / 255),
  });

  const kodeText = cleanSingleLine(submission.kode || '-');
  const kodeW = fontMonoBold.widthOfTextAtSize(kodeText, 10);
  page.drawText(kodeText, {
    x: codeBoxX + (codeBoxW - kodeW) / 2,
    y: codeBoxY + 7,
    size: 10,
    font: fontMonoBold,
    color: rgb(0, 0, 0),
  });

  // Date under Code Box
  const tglText = `Tanggal : ${cleanSingleLine(formatDateIndonesian(submission.tanggal))}`;
  const tglW = fontRegular.widthOfTextAtSize(tglText, 8.5);
  page.drawText(tglText, {
    x: codeBoxX + codeBoxW - tglW,
    y: codeBoxY - 14,
    size: 8.5,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // ================= 2. DOCUMENT TITLE BLOCK =================
  const titleBoxY = 726;
  const titleBoxH = 26;

  page.drawRectangle({
    x: margin,
    y: titleBoxY,
    width: contentWidth,
    height: titleBoxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2.0,
    color: rgb(1, 1, 1),
  });

  const titleText = 'BUKTI PENGELUARAN KAS / BANK';
  const titleW = fontBold.widthOfTextAtSize(titleText, 11);
  page.drawText(titleText, {
    x: margin + (contentWidth - titleW) / 2,
    y: titleBoxY + 8,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // ================= 3. METADATA FIELDS AREA =================
  let metaY = 705;
  const labelX = margin + 6;
  const colonX = margin + 145;
  const valX = margin + 158;
  const metaLineH = 16.5;

  // Dibayarkan Kepada
  page.drawText('Dibayarkan Kepada', { x: labelX, y: metaY, size: 9.5, font: fontBold });
  page.drawText(':', { x: colonX, y: metaY, size: 9.5, font: fontBold });
  page.drawText(cleanSingleLine(submission.dibayarkanKepada || '-'), { x: valX, y: metaY, size: 9.5, font: fontBold });
  metaY -= metaLineH;

  // Pemegang Petty Cash (if applicable)
  if (submission.isPettyCash && submission.pettyCashCustodian) {
    page.drawText('Pemegang Petty Cash', { x: labelX, y: metaY, size: 9.0, font: fontBold });
    page.drawText(':', { x: colonX, y: metaY, size: 9.0, font: fontBold });
    page.drawText(cleanSingleLine(submission.pettyCashCustodian), {
      x: valX,
      y: metaY,
      size: 9.0,
      font: fontBold,
      color: rgb(109 / 255, 40 / 255, 217 / 255),
    });
    metaY -= metaLineH;
  }

  // Jenis Pengajuan
  page.drawText('Jenis Pengajuan', { x: labelX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(':', { x: colonX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(cleanSingleLine(submission.jenisPengajuan || '-'), { x: valX, y: metaY, size: 9.0, font: fontRegular });
  metaY -= metaLineH;

  // Kode
  page.drawText('Kode', { x: labelX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(':', { x: colonX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(cleanSingleLine(submission.kode || '-'), { x: valX, y: metaY, size: 9.0, font: fontMonoBold });
  metaY -= metaLineH;

  // Dibayarkan dengan
  page.drawText('Dibayarkan dengan', { x: labelX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(':', { x: colonX, y: metaY, size: 9.0, font: fontBold });

  // Checkbox Tunai
  page.drawRectangle({
    x: valX,
    y: metaY - 2,
    width: 22,
    height: 12,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.0,
    color: rgb(248 / 255, 250 / 255, 252 / 255),
  });
  if (submission.dibayarkanDengan === 'Tunai') {
    page.drawText('X', { x: valX + 7, y: metaY + 1, size: 8.5, font: fontBold });
  }
  page.drawText('Tunai', { x: valX + 28, y: metaY + 1, size: 9.0, font: fontRegular });

  // Checkbox Cek / Transfer
  const cekBoxX = valX + 85;
  page.drawRectangle({
    x: cekBoxX,
    y: metaY - 2,
    width: 22,
    height: 12,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.0,
    color: rgb(248 / 255, 250 / 255, 252 / 255),
  });
  if (submission.dibayarkanDengan === 'Cek/Transfer') {
    page.drawText('X', { x: cekBoxX + 7, y: metaY + 1, size: 8.5, font: fontBold });
  }
  page.drawText('Cek / Transfer', { x: cekBoxX + 28, y: metaY + 1, size: 9.0, font: fontRegular });

  metaY -= 14;

  // ================= 4. TABLE VOUCHER (JENIS PENGAJUAN / JUMLAH) =================
  const colDividerX = margin + 355; // Left col: 355pt, Right col: 160.27pt
  const tableHeaderH = 24;
  const tableTopY = metaY;

  // Table Header Box with stone-100 shading (#F5F5F4)
  page.drawRectangle({
    x: margin,
    y: tableTopY - tableHeaderH,
    width: contentWidth,
    height: tableHeaderH,
    color: rgb(245 / 255, 245 / 255, 244 / 255),
    borderColor: rgb(0, 0, 0),
    borderWidth: 2.0,
  });

  page.drawText('JENIS PENGAJUAN', {
    x: margin + 14,
    y: tableTopY - 16,
    size: 8.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const jmlHeaderTxt = 'JUMLAH';
  const jmlHeaderW = fontBold.widthOfTextAtSize(jmlHeaderTxt, 8.5);
  page.drawText(jmlHeaderTxt, {
    x: margin + contentWidth - jmlHeaderW - 16,
    y: tableTopY - 16,
    size: 8.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // Vertical divider in header
  page.drawLine({
    start: { x: colDividerX, y: tableTopY },
    end: { x: colDividerX, y: tableTopY - tableHeaderH },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });

  // Calculate row wrapping & heights
  let curTableY = tableTopY - tableHeaderH;
  const items = submission.items || [];
  const maxTableContentHeight = 270;

  const rawRows = items.map((it: any) => {
    const wrapped = wrapText(cleanSingleLine(it.item || '-'), 330, fontBold, 8.5);
    const minH = items.length <= 2 ? 38 : items.length <= 4 ? 28 : 20;
    const h = Math.max(minH, wrapped.length * 12 + 10);
    return { wrapped, rawH: h, it };
  });

  const totalRawH = rawRows.reduce((sum: number, r: any) => sum + r.rawH, 0);
  const scale = totalRawH > maxTableContentHeight
    ? Math.max(0.55, maxTableContentHeight / totalRawH)
    : 1.0;
  const fontSize = Math.max(7.0, 8.5 * scale);
  const lineSpacing = Math.max(8.5, 12 * scale);

  for (let i = 0; i < rawRows.length; i++) {
    const { wrapped, rawH, it } = rawRows[i];
    const rowH = Math.max(16, rawH * scale);

    // Row background (white)
    page.drawRectangle({
      x: margin,
      y: curTableY - rowH,
      width: contentWidth,
      height: rowH,
      color: rgb(1, 1, 1),
    });

    // Horizontal bottom line of row
    page.drawLine({
      start: { x: margin, y: curTableY - rowH },
      end: { x: margin + contentWidth, y: curTableY - rowH },
      thickness: 1.0,
      color: rgb(0, 0, 0),
    });

    // Vertical column divider
    page.drawLine({
      start: { x: colDividerX, y: curTableY },
      end: { x: colDividerX, y: curTableY - rowH },
      thickness: 1.0,
      color: rgb(0, 0, 0),
    });

    // Left cell text (Item description)
    const textOffsetY = scale < 0.75 ? 10 : items.length <= 2 ? 18 : 13;
    for (let l = 0; l < wrapped.length; l++) {
      page.drawText(wrapped[l], {
        x: margin + 14,
        y: curTableY - textOffsetY - l * lineSpacing,
        size: fontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    // Right cell text: "Rp" on left, Amount formatted on right
    page.drawText('Rp', {
      x: colDividerX + 12,
      y: curTableY - textOffsetY,
      size: fontSize,
      font: fontMonoBold,
      color: rgb(0, 0, 0),
    });

    const valTxt = formatRupiah(it.total || 0);
    const valW = fontMonoBold.widthOfTextAtSize(valTxt, fontSize);
    page.drawText(valTxt, {
      x: margin + contentWidth - valW - 14,
      y: curTableY - textOffsetY,
      size: fontSize,
      font: fontMonoBold,
      color: rgb(0, 0, 0),
    });

    curTableY -= rowH;
  }

  // Total Row
  const totalRowH = 24;
  page.drawRectangle({
    x: margin,
    y: curTableY - totalRowH,
    width: colDividerX - margin,
    height: totalRowH,
    color: rgb(245 / 255, 245 / 255, 244 / 255),
  });

  page.drawRectangle({
    x: colDividerX,
    y: curTableY - totalRowH,
    width: margin + contentWidth - colDividerX,
    height: totalRowH,
    color: rgb(250 / 255, 250 / 255, 250 / 255),
  });

  // Top line of total
  page.drawLine({
    start: { x: margin, y: curTableY },
    end: { x: margin + contentWidth, y: curTableY },
    thickness: 2.0,
    color: rgb(0, 0, 0),
  });

  // Bottom line of total
  page.drawLine({
    start: { x: margin, y: curTableY - totalRowH },
    end: { x: margin + contentWidth, y: curTableY - totalRowH },
    thickness: 2.0,
    color: rgb(0, 0, 0),
  });

  // Vertical divider in total
  page.drawLine({
    start: { x: colDividerX, y: curTableY },
    end: { x: colDividerX, y: curTableY - totalRowH },
    thickness: 2.0,
    color: rgb(0, 0, 0),
  });

  // TOTAL label centered in left cell
  const totalLabel = 'TOTAL';
  const totalLabelW = fontBold.widthOfTextAtSize(totalLabel, 9.0);
  page.drawText(totalLabel, {
    x: margin + (colDividerX - margin - totalLabelW) / 2,
    y: curTableY - 16,
    size: 9.0,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // Total amount in right cell
  page.drawText('Rp', {
    x: colDividerX + 12,
    y: curTableY - 16,
    size: 9.5,
    font: fontMonoBold,
    color: rgb(0, 0, 0),
  });

  const grandTotalTxt = formatRupiah(grandTotal);
  const grandTotalW = fontMonoBold.widthOfTextAtSize(grandTotalTxt, 9.5);
  page.drawText(grandTotalTxt, {
    x: margin + contentWidth - grandTotalW - 14,
    y: curTableY - 16,
    size: 9.5,
    font: fontMonoBold,
    color: rgb(0, 0, 0),
  });

  // Crisp Solid Outer Border Rectangle for Entire Table (0 pixel gaps guaranteed)
  const fullTableH = tableTopY - (curTableY - totalRowH);
  page.drawRectangle({
    x: margin,
    y: curTableY - totalRowH,
    width: contentWidth,
    height: fullTableH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2.0,
  });

  curTableY -= totalRowH;

  // ================= 5. TERBILANG BOX =================
  const terbilangY = curTableY - 8;
  const rawTerbilang = `"${numberToTerbilang(grandTotal)}"`;
  const wrappedTerbilang = wrapText(rawTerbilang, 415, fontOblique, 8.5);
  const terbilangH = Math.max(26, wrappedTerbilang.length * 12 + 12);

  page.drawRectangle({
    x: margin,
    y: terbilangY - terbilangH,
    width: contentWidth,
    height: terbilangH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.0,
    color: rgb(250 / 255, 250 / 255, 249 / 255),
  });

  page.drawText('Terbilang :', {
    x: margin + 10,
    y: terbilangY - 16,
    size: 8.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  for (let t = 0; t < Math.min(wrappedTerbilang.length, 2); t++) {
    page.drawText(wrappedTerbilang[t], {
      x: margin + 75,
      y: terbilangY - 16 - t * 11,
      size: 8.5,
      font: fontOblique,
      color: rgb(0, 0, 0),
    });
  }

  curTableY = terbilangY - terbilangH - 12;

  // ================= 6. SIGNATURES BLOCK (4 SIGNERS: DIAJUKAN, DIVERIFIKASI, DIVERIFIKASI, DISETUJUI) =================
  const blockW = contentWidth / 4;
  const sigBoxH = 65;
  const sigTopY = curTableY;

  let signers = customSigners;
  if (!signers && typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = localStorage.getItem('nmsa_custom_f1_signers_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4) signers = parsed;
      }
    } catch (_) {}
  }

  if (!signers || signers.length !== 4) {
    const applicantName = cleanSingleLine(
      (submission.diajukanOleh && submission.diajukanOleh !== 'Sri Ekowati')
        ? submission.diajukanOleh
        : 'Andi Dhiya Salsabila'
    );
    const applicantRole = cleanSingleLine(submission.diajukanJabatan || 'Staff Keuangan');

    const verifier1Name = 'Sri Ekowati';
    const verifier1Role = 'Manager Keuangan';

    const verifierRaw = submission.diverifikasiOleh;
    const isVerifierNursyam = verifierRaw?.toLowerCase().includes('nursyam') || submission.disetujuiOleh2?.toLowerCase().includes('nursyam');
    const verifier2Name = cleanSingleLine(
      isVerifierNursyam
        ? 'Andi Nursyam Halid'
        : (verifierRaw && verifierRaw !== 'Andi Dhiya Salsabila' && verifierRaw !== 'Sri Ekowati'
          ? verifierRaw
          : 'Andi Muhammad Rifki')
    );
    const verifier2Role = cleanSingleLine(
      isVerifierNursyam
        ? 'Direktur Utama'
        : (submission.diverifikasiJabatan && submission.diverifikasiJabatan !== 'Keuangan'
          ? submission.diverifikasiJabatan
          : 'Direktur')
    );

    const rawApprover2 = submission.disetujuiOleh2;
    const isNursyam = rawApprover2 && rawApprover2.toLowerCase().includes('nursyam');
    const approverName = cleanSingleLine(isNursyam || !rawApprover2 ? 'Harijon' : rawApprover2);
    const approverRole = cleanSingleLine(isNursyam || !submission.disetujuiJabatan2 ? 'Direktur Keuangan' : submission.disetujuiJabatan2);

    signers = [
      { title: 'Diajukan', name: applicantName, role: applicantRole },
      { title: 'Diverifikasi', name: verifier1Name, role: verifier1Role },
      { title: 'Diverifikasi', name: verifier2Name, role: verifier2Role },
      { title: 'Disetujui', name: approverName, role: approverRole },
    ];
  } else {
    signers = signers.map(s => ({
      title: cleanSingleLine(s.title),
      name: cleanSingleLine(s.name),
      role: cleanSingleLine(s.role),
    }));
  }

  signers.forEach((s, idx) => {
    const colX = margin + idx * blockW;

    const titleW = fontBold.widthOfTextAtSize(s.title, 8.5);
    page.drawText(s.title, {
      x: colX + (blockW - titleW) / 2,
      y: sigTopY,
      size: 8.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const sigLineY = sigTopY - sigBoxH;

    const nameFontSize = 9.0;
    const nameW = fontBold.widthOfTextAtSize(s.name, nameFontSize);
    page.drawText(s.name, {
      x: colX + (blockW - nameW) / 2,
      y: sigLineY + 3,
      size: nameFontSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: { x: colX + 12, y: sigLineY },
      end: { x: colX + blockW - 12, y: sigLineY },
      thickness: 1.0,
      color: rgb(0, 0, 0),
    });

    const roleW = fontRegular.widthOfTextAtSize(s.role, 7.5);
    page.drawText(s.role, {
      x: colX + (blockW - roleW) / 2,
      y: sigLineY - 11,
      size: 7.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
  });

  // ================= 7. NOTES BLOCK =================
  if (submission.notes && submission.notes.trim() !== '') {
    const noteTopY = sigTopY - sigBoxH - 24;
    page.drawText('NOTE :', {
      x: margin,
      y: noteTopY,
      size: 8.0,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const noteBoxY = noteTopY - 26;
    page.drawRectangle({
      x: margin,
      y: noteBoxY,
      width: contentWidth,
      height: 22,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.0,
      color: rgb(250 / 255, 250 / 255, 249 / 255),
    });

    page.drawText(cleanSingleLine(submission.notes), {
      x: margin + 8,
      y: noteBoxY + 6,
      size: 7.5,
      font: fontRegular,
      color: rgb(40 / 255, 40 / 255, 40 / 255),
    });
  }

  // ================= 8. DEDICATED SHEET: LEMBAR RINCIAN PEMBAYARAN BERTAHAP / CICILAN (PAGE 2) =================
  const isCicilan = submission.status === 'DP / Cicilan' || 
                    (typeof submission.dpAmount === 'number' && submission.dpAmount > 0) || 
                    (Array.isArray(submission.riwayatCicilan) && submission.riwayatCicilan.length > 0) ||
                    (typeof submission.cicilanNotes === 'string' && submission.cicilanNotes.trim().length > 0);

  if (isCicilan) {
    // 1. Subtle 1-line note on Page 1 (keeps F1 pristine and uncrowded)
    const f1NoticeY = (submission.notes && submission.notes.trim() !== '') ? (sigTopY - sigBoxH - 52) : (sigTopY - sigBoxH - 24);
    page.drawText('* Transaksi Pembayaran Bertahap / Cicilan (Rincian pembayaran lengkap pada Lembar ke-2)', {
      x: margin,
      y: Math.max(18, f1NoticeY),
      size: 7.2,
      font: fontOblique,
      color: rgb(180 / 255, 83 / 255, 9 / 255),
    });

    // 2. Add Page 2: LEMBAR RINCIAN PEMBAYARAN BERTAHAP / CICILAN
    const page2 = pdfDoc.addPage([595.27, 841.89]);
    
    // Header
    await drawCorporateHeader(pdfDoc, page2, fontBold, fontRegular, margin, headerTopY, 230);

    // QR & Code Box
    if (qrBytes) {
      try {
        const qrImg2 = await pdfDoc.embedPng(qrBytes);
        page2.drawRectangle({
          x: qrX - 2,
          y: qrY - 2,
          width: qrSize + 4,
          height: qrSize + 4,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1.0,
          color: rgb(1, 1, 1),
        });
        page2.drawImage(qrImg2, {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
        });
      } catch (_) {}
    }

    page2.drawRectangle({
      x: codeBoxX,
      y: codeBoxY,
      width: codeBoxW,
      height: codeBoxH,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.2,
      color: rgb(248 / 255, 250 / 255, 252 / 255),
    });

    page2.drawText(kodeText, {
      x: codeBoxX + (codeBoxW - kodeW) / 2,
      y: codeBoxY + 7,
      size: 10,
      font: fontMonoBold,
      color: rgb(0, 0, 0),
    });

    page2.drawText(tglText, {
      x: codeBoxX + codeBoxW - tglW,
      y: codeBoxY - 14,
      size: 8.5,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    const lampTxt = 'Lampiran Lembar Ke-2';
    const lampW = fontBold.widthOfTextAtSize(lampTxt, 7.5);
    page2.drawText(lampTxt, {
      x: codeBoxX + codeBoxW - lampW,
      y: codeBoxY - 24,
      size: 7.5,
      font: fontBold,
      color: rgb(180 / 255, 83 / 255, 9 / 255),
    });

    // Title Box
    page2.drawRectangle({
      x: margin,
      y: titleBoxY,
      width: contentWidth,
      height: titleBoxH,
      borderColor: rgb(0, 0, 0),
      borderWidth: 2.0,
      color: rgb(245 / 255, 245 / 255, 244 / 255),
    });

    const title2Text = 'LEMBAR RINCIAN PEMBAYARAN BERTAHAP / CICILAN';
    const title2W = fontBold.widthOfTextAtSize(title2Text, 10.5);
    page2.drawText(title2Text, {
      x: margin + (contentWidth - title2W) / 2,
      y: titleBoxY + 8,
      size: 10.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Metadata area on Page 2
    let mY = 705;
    const mLabelX = margin + 6;
    const mColonX = margin + 140;
    const mValX = margin + 152;
    const mLineH = 15;

    page2.drawText('Dibayarkan Kepada', { x: mLabelX, y: mY, size: 9.0, font: fontBold });
    page2.drawText(':', { x: mColonX, y: mY, size: 9.0, font: fontBold });
    page2.drawText(cleanSingleLine(submission.dibayarkanKepada || '-'), { x: mValX, y: mY, size: 9.0, font: fontBold });
    mY -= mLineH;

    page2.drawText('Jenis Pengajuan', { x: mLabelX, y: mY, size: 8.5, font: fontBold });
    page2.drawText(':', { x: mColonX, y: mY, size: 8.5, font: fontBold });
    page2.drawText(cleanSingleLine(submission.jenisPengajuan || '-'), { x: mValX, y: mY, size: 8.5, font: fontRegular });
    mY -= mLineH;

    page2.drawText('Status Transaksi', { x: mLabelX, y: mY, size: 8.5, font: fontBold });
    page2.drawText(':', { x: mColonX, y: mY, size: 8.5, font: fontBold });
    page2.drawText(submission.status === 'Lunas' ? 'LUNAS (100%)' : 'DP / CICILAN BERJALAN', { 
      x: mValX, 
      y: mY, 
      size: 8.5, 
      font: fontBold,
      color: submission.status === 'Lunas' ? rgb(6 / 255, 95 / 255, 70 / 255) : rgb(180 / 255, 83 / 255, 9 / 255)
    });

    if (submission.cicilanNotes) {
      mY -= mLineH;
      page2.drawText('Keterangan Termin', { x: mLabelX, y: mY, size: 8.5, font: fontBold });
      page2.drawText(':', { x: mColonX, y: mY, size: 8.5, font: fontBold });
      page2.drawText(cleanSingleLine(submission.cicilanNotes), { x: mValX, y: mY, size: 8.5, font: fontOblique });
    }

    mY -= 12;

    // Financial KPI Summary (3 Cards)
    const totalVoucher = grandTotal || 0;
    const rawPaid = submission.status === 'Lunas' 
      ? totalVoucher 
      : (typeof submission.dpAmount === 'number' ? submission.dpAmount : 0);
    
    const historyPayments: any[] = Array.isArray(submission.riwayatCicilan) && submission.riwayatCicilan.length > 0
      ? submission.riwayatCicilan
      : (rawPaid > 0 ? [{
          id: 'init_pay',
          tanggal: submission.tanggal,
          nominal: rawPaid,
          sisaSetelahBayar: Math.max(0, totalVoucher - rawPaid),
          keterangan: submission.cicilanNotes || 'Pembayaran DP / Termin Ke-1',
        }] : []);

    const totalPaid = submission.status === 'Lunas'
      ? totalVoucher
      : Math.max(rawPaid, historyPayments.reduce((s: number, r: any) => s + (Number(r.nominal) || 0), 0));

    const remainingBalance = Math.max(0, totalVoucher - totalPaid);
    const percentPaid = totalVoucher > 0 ? Math.min(100, Math.round((totalPaid / totalVoucher) * 100)) : 100;

    const cardGap = 8;
    const cardW = (contentWidth - cardGap * 2) / 3;
    const cardH = 42;
    const cardY = mY - cardH;

    // Card 1: Total Nilai Tagihan
    page2.drawRectangle({
      x: margin,
      y: cardY,
      width: cardW,
      height: cardH,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.0,
      color: rgb(248 / 255, 250 / 255, 252 / 255),
    });
    page2.drawText('TOTAL NILAI TAGIHAN', { x: margin + 8, y: cardY + cardH - 12, size: 7.5, font: fontBold, color: rgb(71 / 255, 85 / 255, 105 / 255) });
    const totTxt = `Rp ${formatRupiah(totalVoucher)}`;
    page2.drawText(totTxt, { x: margin + 8, y: cardY + 10, size: 10, font: fontMonoBold, color: rgb(0, 0, 0) });

    // Card 2: Total Terbayar
    const card2X = margin + cardW + cardGap;
    page2.drawRectangle({
      x: card2X,
      y: cardY,
      width: cardW,
      height: cardH,
      borderColor: rgb(6 / 255, 95 / 255, 70 / 255),
      borderWidth: 1.0,
      color: rgb(236 / 255, 253 / 255, 245 / 255),
    });
    page2.drawText(`TOTAL TERBAYAR (${percentPaid}%)`, { x: card2X + 8, y: cardY + cardH - 12, size: 7.5, font: fontBold, color: rgb(6 / 255, 95 / 255, 70 / 255) });
    const paidTxt = `Rp ${formatRupiah(totalPaid)}`;
    page2.drawText(paidTxt, { x: card2X + 8, y: cardY + 10, size: 10, font: fontMonoBold, color: rgb(6 / 255, 95 / 255, 70 / 255) });

    // Card 3: Sisa Belum Lunas
    const card3X = card2X + cardW + cardGap;
    const isLunasClean = remainingBalance === 0;
    page2.drawRectangle({
      x: card3X,
      y: cardY,
      width: cardW,
      height: cardH,
      borderColor: isLunasClean ? rgb(6 / 255, 95 / 255, 70 / 255) : rgb(159 / 255, 18 / 255, 57 / 255),
      borderWidth: 1.0,
      color: isLunasClean ? rgb(236 / 255, 253 / 255, 245 / 255) : rgb(255 / 255, 241 / 255, 242 / 255),
    });
    page2.drawText('SISA TAGIHAN', { 
      x: card3X + 8, 
      y: cardY + cardH - 12, 
      size: 7.5, 
      font: fontBold, 
      color: isLunasClean ? rgb(6 / 255, 95 / 255, 70 / 255) : rgb(159 / 255, 18 / 255, 57 / 255) 
    });
    const sisaTxt = `Rp ${formatRupiah(remainingBalance)}`;
    page2.drawText(sisaTxt, { 
      x: card3X + 8, 
      y: cardY + 10, 
      size: 10, 
      font: fontMonoBold, 
      color: isLunasClean ? rgb(6 / 255, 95 / 255, 70 / 255) : rgb(159 / 255, 18 / 255, 57 / 255) 
    });

    // History Table on Page 2
    // History Table on Page 2 (6 Kolom: NO, TANGGAL, TAHAP, NOMINAL, SISA, CATATAN)
    let p2TableY = cardY - 14;
    const p2HeaderH = 22;
    page2.drawRectangle({
      x: margin,
      y: p2TableY - p2HeaderH,
      width: contentWidth,
      height: p2HeaderH,
      color: rgb(245 / 255, 245 / 255, 244 / 255),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5,
    });

    const cNoW = 24;
    const cTglW = 76;
    const cTahapW = 110;
    const cNomW = 95;
    const cSisaW = 90;
    const cCatatanW = contentWidth - (cNoW + cTglW + cTahapW + cNomW + cSisaW);

    const xNo = margin;
    const xTgl = xNo + cNoW;
    const xTahap = xTgl + cTglW;
    const xNom = xTahap + cTahapW;
    const xSisa = xNom + cNomW;
    const xCatatan = xSisa + cSisaW;

    page2.drawText('NO', { x: xNo + 6, y: p2TableY - 15, size: 7.5, font: fontBold });
    page2.drawText('TANGGAL BAYAR', { x: xTgl + 6, y: p2TableY - 15, size: 7.5, font: fontBold });
    page2.drawText('TAHAP / TERMIN', { x: xTahap + 6, y: p2TableY - 15, size: 7.5, font: fontBold });
    page2.drawText('NOMINAL DIBAYAR', { x: xNom + 8, y: p2TableY - 15, size: 7.5, font: fontBold });
    page2.drawText('SISA TAGIHAN', { x: xSisa + 8, y: p2TableY - 15, size: 7.5, font: fontBold });
    page2.drawText('CATATAN', { x: xCatatan + 6, y: p2TableY - 15, size: 7.5, font: fontBold });

    // Vertical dividers in header
    [xTgl, xTahap, xNom, xSisa, xCatatan].forEach(divX => {
      page2.drawLine({
        start: { x: divX, y: p2TableY },
        end: { x: divX, y: p2TableY - p2HeaderH },
        thickness: 1.0,
        color: rgb(0, 0, 0),
      });
    });

    p2TableY -= p2HeaderH;
    // Adaptive row height so many rows fit comfortably on 1 page:
    const rowH = historyPayments.length > 12 ? 17 : (historyPayments.length > 6 ? 20 : 23);
    const rowFontSize = historyPayments.length > 12 ? 7 : 7.5;

    historyPayments.forEach((pItem: any, idx: number) => {
      page2.drawRectangle({
        x: margin,
        y: p2TableY - rowH,
        width: contentWidth,
        height: rowH,
        color: idx % 2 === 0 ? rgb(1, 1, 1) : rgb(250 / 255, 250 / 255, 250 / 255),
      });

      page2.drawLine({
        start: { x: margin, y: p2TableY - rowH },
        end: { x: margin + contentWidth, y: p2TableY - rowH },
        thickness: 0.8,
        color: rgb(0, 0, 0),
      });

      [xTgl, xTahap, xNom, xSisa, xCatatan].forEach(divX => {
        page2.drawLine({
          start: { x: divX, y: p2TableY },
          end: { x: divX, y: p2TableY - rowH },
          thickness: 0.8,
          color: rgb(0, 0, 0),
        });
      });

      // Stage Title (Hanya berisi pembayaran ke 1 atau DP, atau cicilan ke 2 dst)
      const isFirst = idx === 0;
      const isLunasRow = pItem.sisaSetelahBayar === 0;
      const rawKet = (pItem.keterangan || '').trim();
      let cleanTahap = '';
      if (isFirst) {
        cleanTahap = /dp|uang muka/i.test(rawKet) ? 'Pembayaran DP / Termin 1' : 'Pembayaran Ke-1 (DP)';
      } else {
        cleanTahap = isLunasRow ? `Cicilan Ke-${idx + 1} (Pelunasan)` : `Cicilan Ke-${idx + 1}`;
      }

      // Catatan (Bukti lampiran & info)
      let cleanCatatan = '';
      if (pItem.buktiPembayaran?.name) {
        cleanCatatan = `Bukti: ${pItem.buktiPembayaran.name}`;
      } else if (rawKet && !rawKet.toLowerCase().includes('cicilan') && !rawKet.toLowerCase().includes('termin') && !rawKet.toLowerCase().includes('dp')) {
        cleanCatatan = rawKet;
      } else {
        cleanCatatan = isLunasRow ? 'Pelunasan penuh terlampir' : 'Bukti transfer terlampir';
      }

      // Clip catatan string if exceeding column width
      let displayCatatan = cleanSingleLine(cleanCatatan);
      while (displayCatatan.length > 5 && fontRegular.widthOfTextAtSize(displayCatatan, rowFontSize - 0.5) > (cCatatanW - 12)) {
        displayCatatan = displayCatatan.slice(0, -4) + '...';
      }

      page2.drawText(String(idx + 1), { x: xNo + 8, y: p2TableY - (rowH * 0.65), size: rowFontSize, font: fontBold });
      page2.drawText(cleanSingleLine(formatDateIndonesian(pItem.tanggal)), { x: xTgl + 6, y: p2TableY - (rowH * 0.65), size: rowFontSize, font: fontRegular });
      page2.drawText(cleanSingleLine(cleanTahap), { x: xTahap + 6, y: p2TableY - (rowH * 0.65), size: rowFontSize, font: fontBold });
      
      const pNomTxt = `Rp ${formatRupiah(pItem.nominal)}`;
      const pNomW = fontMonoBold.widthOfTextAtSize(pNomTxt, rowFontSize + 0.5);
      page2.drawText(pNomTxt, { x: xNom + cNomW - pNomW - 6, y: p2TableY - (rowH * 0.65), size: rowFontSize + 0.5, font: fontMonoBold, color: rgb(6 / 255, 95 / 255, 70 / 255) });

      const pSisaTxt = `Rp ${formatRupiah(pItem.sisaSetelahBayar)}`;
      const pSisaW = fontMonoBold.widthOfTextAtSize(pSisaTxt, rowFontSize + 0.5);
      page2.drawText(pSisaTxt, { x: xSisa + cSisaW - pSisaW - 6, y: p2TableY - (rowH * 0.65), size: rowFontSize + 0.5, font: fontMonoBold, color: rgb(159 / 255, 18 / 255, 57 / 255) });

      page2.drawText(displayCatatan, { x: xCatatan + 6, y: p2TableY - (rowH * 0.65), size: rowFontSize - 0.5, font: fontRegular, color: rgb(80 / 255, 80 / 255, 80 / 255) });

      p2TableY -= rowH;
    });

    // Summary Total row in table
    const p2TotalRowH = 22;
    page2.drawRectangle({
      x: margin,
      y: p2TableY - p2TotalRowH,
      width: contentWidth,
      height: p2TotalRowH,
      color: rgb(245 / 255, 245 / 255, 244 / 255),
    });

    page2.drawLine({
      start: { x: margin, y: p2TableY - p2TotalRowH },
      end: { x: margin + contentWidth, y: p2TableY - p2TotalRowH },
      thickness: 1.5,
      color: rgb(0, 0, 0),
    });

    [xTgl, xTahap, xNom, xSisa, xCatatan].forEach(divX => {
      page2.drawLine({
        start: { x: divX, y: p2TableY },
        end: { x: divX, y: p2TableY - p2TotalRowH },
        thickness: 1.0,
        color: rgb(0, 0, 0),
      });
    });

    page2.drawText('TOTAL TERBAYAR AKUMULATIF', { x: xTgl + 6, y: p2TableY - 15, size: 7.5, font: fontBold });
    
    const p2GrandPaidTxt = `Rp ${formatRupiah(totalPaid)}`;
    const p2GrandPaidW = fontMonoBold.widthOfTextAtSize(p2GrandPaidTxt, 8.0);
    page2.drawText(p2GrandPaidTxt, { x: xNom + cNomW - p2GrandPaidW - 6, y: p2TableY - 15, size: 8.0, font: fontMonoBold, color: rgb(6 / 255, 95 / 255, 70 / 255) });

    const p2GrandSisaTxt = `Rp ${formatRupiah(remainingBalance)}`;
    const p2GrandSisaW = fontMonoBold.widthOfTextAtSize(p2GrandSisaTxt, 8.0);
    page2.drawText(p2GrandSisaTxt, { x: xSisa + cSisaW - p2GrandSisaW - 6, y: p2TableY - 15, size: 8.0, font: fontMonoBold, color: rgb(159 / 255, 18 / 255, 57 / 255) });

    const statNote = remainingBalance === 0 ? 'Lunas Sepenuhnya' : 'Sisa Menunggu Pelunasan';
    page2.drawText(statNote, { x: xCatatan + 6, y: p2TableY - 15, size: 7.0, font: fontBold, color: remainingBalance === 0 ? rgb(6 / 255, 95 / 255, 70 / 255) : rgb(159 / 255, 18 / 255, 57 / 255) });

    // Table outer border
    page2.drawRectangle({
      x: margin,
      y: p2TableY - p2TotalRowH,
      width: contentWidth,
      height: (cardY - 14) - (p2TableY - p2TotalRowH),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5,
    });

    p2TableY -= p2TotalRowH + 16;

    // Legal / Note Box
    page2.drawRectangle({
      x: margin,
      y: p2TableY - 26,
      width: contentWidth,
      height: 26,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.0,
      color: rgb(250 / 255, 250 / 255, 249 / 255),
    });
    page2.drawText('Catatan Validasi Kas: Rincian ini adalah rekaman resmi atas tahapan pembayaran transaksi bertahap.', {
      x: margin + 8,
      y: p2TableY - 11,
      size: 7.5,
      font: fontBold,
      color: rgb(30 / 255, 30 / 255, 30 / 255),
    });
    page2.drawText('Seluruh mutasi telah diverifikasi dan disahkan sesuai regulasi keuangan kas/bank perusahaan.', {
      x: margin + 8,
      y: p2TableY - 21,
      size: 7.0,
      font: fontRegular,
      color: rgb(70 / 255, 70 / 255, 70 / 255),
    });
  }

  return await pdfDoc.save();
}


export async function generateF2PdfBytes(
  submission: any,
  grandTotal: number,
  customSigners?: Array<{ title: string; name: string; role: string }>,
  showApproved: boolean = true
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.27, 841.89]);
  
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const pageWidth = 595.27;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 515.27 pt

  // ================= 1. HEADER BLOCK (LOGO + CODE + TANGGAL + QR CODE) =================
  const headerTopY = 805;

  // 1a. Draw Official Logo on Top Left
  await drawCorporateHeader(pdfDoc, page, fontBold, fontRegular, margin, headerTopY, 230);

  // 1b. Right Header: Voucher Code Box & Date (Barcode / QR removed for clean F2 appearance)
  const codeBoxW = 140;
  const codeBoxH = 24;
  const codeBoxX = margin + contentWidth - codeBoxW;
  const codeBoxY = headerTopY - 20;

  page.drawRectangle({
    x: codeBoxX,
    y: codeBoxY,
    width: codeBoxW,
    height: codeBoxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.2,
    color: rgb(248 / 255, 250 / 255, 252 / 255),
  });

  const kodeText = cleanSingleLine(submission.kode || '-');
  const kodeW = fontMonoBold.widthOfTextAtSize(kodeText, 10);
  page.drawText(kodeText, {
    x: codeBoxX + (codeBoxW - kodeW) / 2,
    y: codeBoxY + 7,
    size: 10,
    font: fontMonoBold,
    color: rgb(0, 0, 0),
  });

  // Date under Code Box
  const tglText = `Tanggal : ${cleanSingleLine(formatDateIndonesian(submission.tanggal))}`;
  const tglW = fontRegular.widthOfTextAtSize(tglText, 8.5);
  page.drawText(tglText, {
    x: codeBoxX + codeBoxW - tglW,
    y: codeBoxY - 14,
    size: 8.5,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // ================= 2. DOCUMENT TITLE BLOCK =================
  const titleBoxY = 726;
  const titleBoxH = 26;

  page.drawRectangle({
    x: margin,
    y: titleBoxY,
    width: contentWidth,
    height: titleBoxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2.0,
    color: rgb(217 / 255, 217 / 255, 217 / 255), // #D9D9D9 matching App UI
  });

  const titleText = 'FORMULIR PENGAJUAN DANA';
  const titleW = fontBold.widthOfTextAtSize(titleText, 11);
  page.drawText(titleText, {
    x: margin + (contentWidth - titleW) / 2,
    y: titleBoxY + 8,
    size: 11,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // ================= 3. METADATA FIELDS BOX =================
  const metaBoxY = 648;
  const metaBoxH = 68;
  page.drawRectangle({
    x: margin,
    y: metaBoxY,
    width: contentWidth,
    height: metaBoxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1.2,
    color: rgb(1, 1, 1),
  });

  let metaY = metaBoxY + metaBoxH - 16;
  const metaLabelX = margin + 14;
  const metaColonX = margin + 140;
  const metaValX = margin + 152;
  const metaLineH = 14.5;

  // Lokasi
  page.drawText('Lokasi', { x: metaLabelX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(':', { x: metaColonX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(cleanSingleLine(submission.lokasi || 'Jakarta'), { x: metaValX, y: metaY, size: 9.0, font: fontRegular });
  metaY -= metaLineH;

  // Tanggal
  page.drawText('Tanggal', { x: metaLabelX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(':', { x: metaColonX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(cleanSingleLine(formatDateIndonesian(submission.tanggal)), { x: metaValX, y: metaY, size: 9.0, font: fontRegular });
  metaY -= metaLineH;

  // Jenis Pengajuan
  page.drawText('Jenis Pengajuan', { x: metaLabelX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(':', { x: metaColonX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(cleanSingleLine(submission.jenisPengajuan || '-'), { x: metaValX, y: metaY, size: 9.0, font: fontRegular });
  metaY -= metaLineH;

  // Kode
  page.drawText('Kode', { x: metaLabelX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(':', { x: metaColonX, y: metaY, size: 9.0, font: fontBold });
  page.drawText(cleanSingleLine(submission.kode || '-'), { x: metaValX, y: metaY, size: 9.0, font: fontMonoBold });

  // ================= 4. TABLE ITEMS (5 COLUMNS) =================
  // Column widths matching PrintDocument.tsx proportions (5%, 41%, 8%, 24%, 22%):
  const colWNo = 26;
  const colWDesc = 211;
  const colWVol = 41;
  const colWTotal = 124;
  const colWKet = contentWidth - (colWNo + colWDesc + colWVol + colWTotal); // 113.27pt

  const colX0 = margin;
  const colX1 = colX0 + colWNo;
  const colX2 = colX1 + colWDesc;
  const colX3 = colX2 + colWVol;
  const colX4 = colX3 + colWTotal;

  const tableTopY = metaBoxY - 12;
  const tableHeaderH = 24;

  // Table header background (shaded #D9D9D9/30 -> rgb(238, 238, 238))
  page.drawRectangle({
    x: margin,
    y: tableTopY - tableHeaderH,
    width: contentWidth,
    height: tableHeaderH,
    color: rgb(238 / 255, 238 / 255, 238 / 255),
    borderColor: rgb(0, 0, 0),
    borderWidth: 2.0,
  });

  // Vertical dividers in header
  page.drawLine({ start: { x: colX1, y: tableTopY }, end: { x: colX1, y: tableTopY - tableHeaderH }, thickness: 1.2, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: colX2, y: tableTopY }, end: { x: colX2, y: tableTopY - tableHeaderH }, thickness: 1.2, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: colX3, y: tableTopY }, end: { x: colX3, y: tableTopY - tableHeaderH }, thickness: 1.2, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: colX4, y: tableTopY }, end: { x: colX4, y: tableTopY - tableHeaderH }, thickness: 1.2, color: rgb(0, 0, 0) });

  // Header Titles
  const noHdrTxt = 'NO';
  const noHdrW = fontBold.widthOfTextAtSize(noHdrTxt, 8.5);
  page.drawText(noHdrTxt, { x: colX0 + (colWNo - noHdrW) / 2, y: tableTopY - 16, size: 8.5, font: fontBold });

  page.drawText('ITEM DETIL (INVOICE / DESKRIPSI)', { x: colX1 + 8, y: tableTopY - 16, size: 8.0, font: fontBold });

  const volHdrTxt = 'VOL';
  const volHdrW = fontBold.widthOfTextAtSize(volHdrTxt, 8.5);
  page.drawText(volHdrTxt, { x: colX2 + (colWVol - volHdrW) / 2, y: tableTopY - 16, size: 8.5, font: fontBold });

  const totHdrTxt = 'TOTAL (RP)';
  const totHdrW = fontBold.widthOfTextAtSize(totHdrTxt, 8.0);
  page.drawText(totHdrTxt, { x: colX3 + (colWTotal - totHdrW) / 2, y: tableTopY - 16, size: 8.0, font: fontBold });

  page.drawText('KETERANGAN', { x: colX4 + 8, y: tableTopY - 16, size: 8.0, font: fontBold });

  // Rows Calculation & Dynamic Scaling
  let curTableY = tableTopY - tableHeaderH;
  const items = submission.items || [];
  const maxTableContentHeight = 270;

  const rawRows = items.map((it: any) => {
    const displayTitle = formatDisplayItemTitle(cleanSingleLine(it.item || '-'));
    const descWrapped = wrapText(displayTitle, colWDesc - 16, fontBold, 8.0);
    const ketWrapped = wrapText(cleanSingleLine(it.keterangan || '-'), colWKet - 16, fontRegular, 7.5);
    const linesNeeded = Math.max(descWrapped.length, ketWrapped.length, 1);
    const minH = items.length <= 3 ? 34 : items.length <= 6 ? 24 : 18;
    const rawH = Math.max(minH, linesNeeded * 11 + 10);
    return { descWrapped, ketWrapped, rawH, it };
  });

  const totalRawH = rawRows.reduce((sum: number, r: any) => sum + r.rawH, 0);
  const scale = totalRawH > maxTableContentHeight
    ? Math.max(0.52, maxTableContentHeight / totalRawH)
    : 1.0;
  const fontSize = Math.max(6.5, 8.0 * scale);
  const lineSpacing = Math.max(7.8, 11 * scale);

  for (let i = 0; i < rawRows.length; i++) {
    const { descWrapped, ketWrapped, rawH, it } = rawRows[i];
    const rowH = Math.max(16, rawH * scale);

    // Row Background (white)
    page.drawRectangle({
      x: margin,
      y: curTableY - rowH,
      width: contentWidth,
      height: rowH,
      color: rgb(1, 1, 1),
    });

    // Horizontal Row Border
    page.drawLine({
      start: { x: margin, y: curTableY - rowH },
      end: { x: margin + contentWidth, y: curTableY - rowH },
      thickness: 1.0,
      color: rgb(0, 0, 0),
    });

    // Vertical Column Dividers
    page.drawLine({ start: { x: colX1, y: curTableY }, end: { x: colX1, y: curTableY - rowH }, thickness: 1.0, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: colX2, y: curTableY }, end: { x: colX2, y: curTableY - rowH }, thickness: 1.0, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: colX3, y: curTableY }, end: { x: colX3, y: curTableY - rowH }, thickness: 1.0, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: colX4, y: curTableY }, end: { x: colX4, y: curTableY - rowH }, thickness: 1.0, color: rgb(0, 0, 0) });

    const textOffsetY = scale < 0.75 ? 10 : (items.length <= 3 ? 17 : 13);

    // Col 1: NO
    const noTxt = String(i + 1);
    const noW = fontMono.widthOfTextAtSize(noTxt, fontSize);
    page.drawText(noTxt, {
      x: colX0 + (colWNo - noW) / 2,
      y: curTableY - textOffsetY,
      size: fontSize,
      font: fontMono,
      color: rgb(0, 0, 0),
    });

    // Col 2: Item Description
    for (let l = 0; l < descWrapped.length; l++) {
      page.drawText(descWrapped[l], {
        x: colX1 + 8,
        y: curTableY - textOffsetY - l * lineSpacing,
        size: fontSize,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    // Col 3: Volume
    const volTxt = cleanSingleLine(it.jumlahVolume || '-');
    const volW = fontRegular.widthOfTextAtSize(volTxt, fontSize);
    page.drawText(volTxt, {
      x: colX2 + (colWVol - volW) / 2,
      y: curTableY - textOffsetY,
      size: fontSize,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    // Col 4: Total (Rp)
    const valTxt = formatRupiah(it.total || 0);
    const valW = fontMonoBold.widthOfTextAtSize(valTxt, fontSize);
    page.drawText(valTxt, {
      x: colX4 - valW - 8,
      y: curTableY - textOffsetY,
      size: fontSize,
      font: fontMonoBold,
      color: rgb(0, 0, 0),
    });

    // Col 5: Keterangan
    for (let k = 0; k < ketWrapped.length; k++) {
      page.drawText(ketWrapped[k], {
        x: colX4 + 8,
        y: curTableY - textOffsetY - k * lineSpacing,
        size: Math.max(5.8, fontSize * 0.92),
        font: fontOblique,
        color: rgb(75 / 255, 85 / 255, 99 / 255),
      });
    }

    curTableY -= rowH;
  }

  // Total Row
  const totalRowH = 24;
  // Cols 1-3 background
  page.drawRectangle({
    x: margin,
    y: curTableY - totalRowH,
    width: colX3 - margin,
    height: totalRowH,
    color: rgb(245 / 255, 245 / 255, 244 / 255),
  });
  // Col 4 background (total highlight)
  page.drawRectangle({
    x: colX3,
    y: curTableY - totalRowH,
    width: colWTotal,
    height: totalRowH,
    color: rgb(254 / 255, 243 / 255, 199 / 255), // warm amber-50 tint
  });
  // Col 5 background
  page.drawRectangle({
    x: colX4,
    y: curTableY - totalRowH,
    width: colWKet,
    height: totalRowH,
    color: rgb(245 / 255, 245 / 255, 244 / 255),
  });

  // Top & bottom line of Total Row
  page.drawLine({ start: { x: margin, y: curTableY }, end: { x: margin + contentWidth, y: curTableY }, thickness: 2.0, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: margin, y: curTableY - totalRowH }, end: { x: margin + contentWidth, y: curTableY - totalRowH }, thickness: 2.0, color: rgb(0, 0, 0) });

  // Dividers in Total Row
  page.drawLine({ start: { x: colX3, y: curTableY }, end: { x: colX3, y: curTableY - totalRowH }, thickness: 1.5, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: colX4, y: curTableY }, end: { x: colX4, y: curTableY - totalRowH }, thickness: 1.5, color: rgb(0, 0, 0) });

  // Total Label
  const totLabel = 'TOTAL PENYERAHAN';
  const totLabelW = fontBold.widthOfTextAtSize(totLabel, 8.5);
  page.drawText(totLabel, {
    x: margin + (colX3 - margin - totLabelW) / 2,
    y: curTableY - 16,
    size: 8.5,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // Total Amount
  const grandTotTxt = formatRupiah(grandTotal);
  const grandTotW = fontMonoBold.widthOfTextAtSize(grandTotTxt, 9.5);
  page.drawText(grandTotTxt, {
    x: colX4 - grandTotW - 8,
    y: curTableY - 16,
    size: 9.5,
    font: fontMonoBold,
    color: rgb(0, 0, 0),
  });

  // Full Crisp Outer Border Rectangle
  const fullTableH = tableTopY - (curTableY - totalRowH);
  page.drawRectangle({
    x: margin,
    y: curTableY - totalRowH,
    width: contentWidth,
    height: fullTableH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2.0,
  });

  curTableY -= totalRowH;

  // ================= 5. SIGNATURES BLOCK (TABLE STYLE MATCHING F2SignaturesBlock) =================
  let f2Signers = customSigners;
  if (!f2Signers && typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = localStorage.getItem('nmsa_custom_f2_signers_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 1) f2Signers = parsed;
      }
    } catch (_) {}
  }

  const s1Title = cleanSingleLine(f2Signers?.[0]?.title || 'Dibuat Oleh');
  const s1Name = cleanSingleLine(f2Signers?.[0]?.name || submission.dibuatOleh || 'Nur Wahyudi');
  const s1Role = cleanSingleLine(f2Signers?.[0]?.role || 'Staff Keuangan');

  const s2Title = cleanSingleLine(f2Signers?.[1]?.title || 'Diajukan');
  const s2Name = cleanSingleLine(f2Signers?.[1]?.name || submission.diajukanOleh || 'Sri Ekowati');
  const s2Role = cleanSingleLine(f2Signers?.[1]?.role || submission.diajukanJabatan || 'Manager Keuangan');

  const sigTopY = curTableY - (scale < 0.75 ? 12 : 18);
  const sigTableW = Math.min(380, contentWidth - 40);
  const sigTableX = margin + (contentWidth - sigTableW) / 2;
  const sigHdrH = 20;
  const sigSpaceH = 46;
  const sigFooterH = 34;
  const sigTotalH = sigHdrH + sigSpaceH + sigFooterH;

  const isDualSigners = showApproved && submission.f2ApprovedBy !== 'none';

  if (!isDualSigners) {
    // 1 Signer Centered Box
    const singleW = 200;
    const singleX = margin + (contentWidth - singleW) / 2;

    // Outer table border
    page.drawRectangle({
      x: singleX,
      y: sigTopY - sigTotalH,
      width: singleW,
      height: sigTotalH,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5,
      color: rgb(1, 1, 1),
    });

    // Header divider
    page.drawLine({
      start: { x: singleX, y: sigTopY - sigHdrH },
      end: { x: singleX + singleW, y: sigTopY - sigHdrH },
      thickness: 1.2,
      color: rgb(0, 0, 0),
    });

    // Space divider
    page.drawLine({
      start: { x: singleX, y: sigTopY - sigHdrH - sigSpaceH },
      end: { x: singleX + singleW, y: sigTopY - sigHdrH - sigSpaceH },
      thickness: 1.0,
      color: rgb(0, 0, 0),
    });

    // Title
    const titleW = fontBold.widthOfTextAtSize(s1Title, 8.5);
    page.drawText(s1Title, {
      x: singleX + (singleW - titleW) / 2,
      y: sigTopY - 14,
      size: 8.5,
      font: fontBold,
    });

    // Name
    const nameW = fontBold.widthOfTextAtSize(s1Name, 9.0);
    page.drawText(s1Name, {
      x: singleX + (singleW - nameW) / 2,
      y: sigTopY - sigHdrH - sigSpaceH - 12,
      size: 9.0,
      font: fontBold,
    });

    // Thin underline
    page.drawLine({
      start: { x: singleX + 25, y: sigTopY - sigHdrH - sigSpaceH - 15 },
      end: { x: singleX + singleW - 25, y: sigTopY - sigHdrH - sigSpaceH - 15 },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });

    // Role
    const roleW = fontRegular.widthOfTextAtSize(s1Role, 7.5);
    page.drawText(s1Role, {
      x: singleX + (singleW - roleW) / 2,
      y: sigTopY - sigHdrH - sigSpaceH - 25,
      size: 7.5,
      font: fontRegular,
    });

    curTableY = sigTopY - sigTotalH - 12;
  } else {
    // 2 Signers Table (Dibuat Oleh & Diajukan)
    const colHalfW = sigTableW / 2;

    // Outer table border
    page.drawRectangle({
      x: sigTableX,
      y: sigTopY - sigTotalH,
      width: sigTableW,
      height: sigTotalH,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5,
      color: rgb(1, 1, 1),
    });

    // Vertical center divider
    page.drawLine({
      start: { x: sigTableX + colHalfW, y: sigTopY },
      end: { x: sigTableX + colHalfW, y: sigTopY - sigTotalH },
      thickness: 1.2,
      color: rgb(0, 0, 0),
    });

    // Header horizontal line
    page.drawLine({
      start: { x: sigTableX, y: sigTopY - sigHdrH },
      end: { x: sigTableX + sigTableW, y: sigTopY - sigHdrH },
      thickness: 1.2,
      color: rgb(0, 0, 0),
    });

    // Space horizontal line
    page.drawLine({
      start: { x: sigTableX, y: sigTopY - sigHdrH - sigSpaceH },
      end: { x: sigTableX + sigTableW, y: sigTopY - sigHdrH - sigSpaceH },
      thickness: 1.0,
      color: rgb(0, 0, 0),
    });

    // --- Signer 1 (Left Col) ---
    const t1W = fontBold.widthOfTextAtSize(s1Title, 8.5);
    page.drawText(s1Title, {
      x: sigTableX + (colHalfW - t1W) / 2,
      y: sigTopY - 14,
      size: 8.5,
      font: fontBold,
    });

    const n1W = fontBold.widthOfTextAtSize(s1Name, 9.0);
    page.drawText(s1Name, {
      x: sigTableX + (colHalfW - n1W) / 2,
      y: sigTopY - sigHdrH - sigSpaceH - 12,
      size: 9.0,
      font: fontBold,
    });

    page.drawLine({
      start: { x: sigTableX + 25, y: sigTopY - sigHdrH - sigSpaceH - 15 },
      end: { x: sigTableX + colHalfW - 25, y: sigTopY - sigHdrH - sigSpaceH - 15 },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });

    const r1W = fontRegular.widthOfTextAtSize(s1Role, 7.5);
    page.drawText(s1Role, {
      x: sigTableX + (colHalfW - r1W) / 2,
      y: sigTopY - sigHdrH - sigSpaceH - 25,
      size: 7.5,
      font: fontRegular,
    });

    // --- Signer 2 (Right Col) ---
    const t2W = fontBold.widthOfTextAtSize(s2Title, 8.5);
    page.drawText(s2Title, {
      x: sigTableX + colHalfW + (colHalfW - t2W) / 2,
      y: sigTopY - 14,
      size: 8.5,
      font: fontBold,
    });

    const n2W = fontBold.widthOfTextAtSize(s2Name, 9.0);
    page.drawText(s2Name, {
      x: sigTableX + colHalfW + (colHalfW - n2W) / 2,
      y: sigTopY - sigHdrH - sigSpaceH - 12,
      size: 9.0,
      font: fontBold,
    });

    page.drawLine({
      start: { x: sigTableX + colHalfW + 25, y: sigTopY - sigHdrH - sigSpaceH - 15 },
      end: { x: sigTableX + sigTableW - 25, y: sigTopY - sigHdrH - sigSpaceH - 15 },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });

    const r2W = fontRegular.widthOfTextAtSize(s2Role, 7.5);
    page.drawText(s2Role, {
      x: sigTableX + colHalfW + (colHalfW - r2W) / 2,
      y: sigTopY - sigHdrH - sigSpaceH - 25,
      size: 7.5,
      font: fontRegular,
    });

    curTableY = sigTopY - sigTotalH - 12;
  }

  // ================= 6. NOTES BLOCK =================
  if (submission.notes && submission.notes.trim() !== '') {
    const noteTopY = curTableY;
    page.drawText('NOTE :', {
      x: margin,
      y: noteTopY,
      size: 8.0,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const noteBoxY = noteTopY - 26;
    page.drawRectangle({
      x: margin,
      y: noteBoxY,
      width: contentWidth,
      height: 22,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.0,
      color: rgb(250 / 255, 250 / 255, 249 / 255),
    });

    page.drawText(cleanSingleLine(submission.notes), {
      x: margin + 8,
      y: noteBoxY + 6,
      size: 7.5,
      font: fontRegular,
      color: rgb(40 / 255, 40 / 255, 40 / 255),
    });
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

export function formatCurrency(value: number | string): string {
  return `Rp ${formatRupiah(value)}`;
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

export async function mergeFilesToSinglePdf(
  files: (File | { name: string; bytes?: Uint8Array; base64?: string; type?: string })[],
  customFileName?: string
): Promise<{ bytes: Uint8Array; name: string; mime: string }> {
  if (!files || files.length === 0) {
    throw new Error('Tidak ada berkas yang dipilih.');
  }

  const helperGetBytes = async (item: File | { name: string; bytes?: Uint8Array; base64?: string; type?: string }): Promise<{ bytes: Uint8Array; name: string; mime: string }> => {
    let name = item.name || 'file';
    let mime = (item as any).type || '';
    let bytes: Uint8Array;

    if (item instanceof File) {
      bytes = new Uint8Array(await item.arrayBuffer());
      mime = item.type || '';
    } else if (item.bytes) {
      bytes = item.bytes;
    } else if (item.base64) {
      const base64Data = item.base64.includes(',') ? item.base64.split(',')[1] : item.base64;
      const binaryStr = window.atob(base64Data);
      bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      if (item.base64.startsWith('data:')) {
        mime = item.base64.split(';')[0].split(':')[1] || mime;
      }
    } else {
      throw new Error(`Data berkas ${name} tidak valid.`);
    }

    if (!mime) {
      const lower = name.toLowerCase();
      if (lower.endsWith('.pdf')) mime = 'application/pdf';
      else if (lower.endsWith('.png')) mime = 'image/png';
      else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
      else if (lower.endsWith('.webp')) mime = 'image/webp';
    }

    return { bytes, name, mime };
  };

  const cleanOutputName = (name: string): string => {
    const raw = (name || 'BuktiPembayaran_Gabungan').trim();
    return raw.toLowerCase().endsWith('.pdf') ? raw : `${raw}.pdf`;
  };

  // If single file, convert to PDF if image or return PDF bytes
  if (files.length === 1) {
    const { bytes, name, mime } = await helperGetBytes(files[0]);
    const outName = customFileName ? cleanOutputName(customFileName) : cleanOutputName(name.replace(/\.[^/.]+$/, ''));
    if (mime.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(name)) {
      const pdfBytes = await convertImageToPdf(bytes, mime);
      return { bytes: pdfBytes, name: outName, mime: 'application/pdf' };
    }
    // If it's already a PDF, return it as application/pdf
    return { bytes, name: outName, mime: 'application/pdf' };
  }

  // Multiple files -> merge all into a single unified PDF
  const mergedPdf = await PDFDocument.create();
  let addedPagesCount = 0;

  for (const file of files) {
    try {
      const { bytes, name, mime } = await helperGetBytes(file);
      if (mime.includes('pdf') || name.toLowerCase().endsWith('.pdf')) {
        try {
          const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pageIndices = srcPdf.getPageIndices();
          if (pageIndices.length > 0) {
            const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);
            copiedPages.forEach((page) => {
              mergedPdf.addPage(page);
              addedPagesCount++;
            });
          }
        } catch (pdfErr) {
          console.warn(`[Merge PDF] Gagal membaca halaman PDF ${name}:`, pdfErr);
        }
      } else if (mime.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(name)) {
        try {
          const pdfBytesFromImg = await convertImageToPdf(bytes, mime || 'image/jpeg');
          const srcPdf = await PDFDocument.load(pdfBytesFromImg);
          const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
          copiedPages.forEach((page) => {
            mergedPdf.addPage(page);
            addedPagesCount++;
          });
        } catch (imgErr) {
          console.warn(`[Merge PDF] Gagal mengonversi gambar ${name} ke PDF:`, imgErr);
        }
      }
    } catch (itemErr) {
      console.warn('[Merge PDF] Gagal memproses berkas:', itemErr);
    }
  }

  if (addedPagesCount === 0) {
    // If no pages were added (e.g. invalid formats), create a blank page with error notice
    const page = mergedPdf.addPage([595.27, 841.89]);
    console.warn('[Merge PDF] Tidak ada halaman yang berhasil digabungkan, membuat dokumen fallback.');
  }

  const finalPdfBytes = await mergedPdf.save();
  const outName = customFileName ? cleanOutputName(customFileName) : cleanOutputName(`BuktiPembayaran_Gabungan_${Date.now()}`);

  return {
    bytes: finalPdfBytes,
    name: outName,
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
  const jenis = (sub.jenisPengajuan || sub.jenis || '').toLowerCase();
  const isTagihanJenis = jenis.includes('tagihan') || jenis.includes('invoice') || jenis.includes('inv');
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
    (i.item || '').toLowerCase().includes('tagihan') ||
    (i.keterangan || '').toLowerCase().includes('invoice') ||
    (i.keterangan || '').toLowerCase().includes('tagihan')
  );
  const hasInvoiceNo = Boolean(sub.invoiceNumber && String(sub.invoiceNumber).trim().length > 0);
  const hasVendorNpwp = Boolean(sub.vendorNpwp && String(sub.vendorNpwp).trim().length > 0);
  const hasBupot = Boolean(sub.bupotNumber && String(sub.bupotNumber).trim().length > 0);

  const match = isTagihanJenis || hasInvoiceFile || isInvoiceNote || isInvoiceItem || hasInvoiceNo || hasVendorNpwp || hasBupot;
  if (match) {
    const isTax = 
      jenis.includes('pembayaran pajak') ||
      jenis.includes('ssp ') ||
      (sub.dibayarkanKepada || '').toLowerCase().includes('kas negara') ||
      (sub.dibayarkanKepada || '').toLowerCase().includes('djp') ||
      (sub.notes || '').toLowerCase().includes('setor pajak') ||
      (sub.notes || '').toLowerCase().includes('ebilling');
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


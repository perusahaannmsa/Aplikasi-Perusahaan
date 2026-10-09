import { BankAccountMaster, InternalMemo, Submission } from '../types';

export const OFFICIAL_KOP_SURAT_IMAGE_URL = '/kop-surat-nmsa-full.png';

/**
 * Parses a "Dari" string into Name and Role/Jabatan.
 * Supports formats like:
 * - "Andi Muhammad Rifki - Direktur"
 * - "Andi Muhammad Rifki – Direktur Utama"
 * - "Andi Muhammad Rifki (Direktur)"
 * - "Andi Muhammad Rifki, Direktur"
 */
export function parseDari(dariText: string): { nama: string; jabatan: string } {
  if (!dariText) return { nama: '', jabatan: '' };
  const dashIndex = dariText.search(/\s+(?:–|—|-|\/|\|)\s+/);
  if (dashIndex !== -1) {
    const nama = dariText.substring(0, dashIndex).trim();
    const rest = dariText.substring(dashIndex).replace(/^\s*(?:–|—|-|\/|\|)\s*/, '').trim();
    return { nama, jabatan: rest };
  }
  const parenMatch = dariText.match(/^([^(]+)\(([^)]+)\)$/);
  if (parenMatch) return { nama: parenMatch[1].trim(), jabatan: parenMatch[2].trim() };
  const commaMatch = dariText.match(/^([^,]+),\s*(.+)$/);
  if (commaMatch) return { nama: commaMatch[1].trim(), jabatan: commaMatch[2].trim() };
  return { nama: dariText.trim(), jabatan: '' };
}

export const DEFAULT_BANK_ACCOUNTS: BankAccountMaster[] = [
  {
    id: 'bank-mandiri-nmsa',
    bankName: 'Bank Mandiri',
    accountNumber: '1030013139064',
    accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
    isDefault: true,
  },
  {
    id: 'bank-bca-nmsa',
    bankName: 'Bank BCA',
    accountNumber: '0753088991',
    accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
    isDefault: false,
  },
  {
    id: 'bank-bri-nmsa',
    bankName: 'Bank BRI',
    accountNumber: '034101000789304',
    accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
    isDefault: false,
  },
];

export function formatHariTanggalMemo(dateInput: string | Date = new Date()): string {
  let d: Date;
  if (typeof dateInput === 'string') {
    // Handle YYYY-MM-DD or ISO
    const parts = dateInput.split('T')[0].split('-');
    if (parts.length === 3) {
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(dateInput);
    }
  } else {
    d = dateInput;
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const dayName = days[d.getDay()] || 'Senin';
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()] || 'September';
  const year = d.getFullYear();

  return `${dayName} / ${dayNum} ${monthName} ${year}`;
}

export function toRomanMonth(monthZeroIndexed: number): string {
  const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return romanMonths[monthZeroIndexed] || 'IX';
}

export function generateDefaultMemoNumber(sequence = 164, date = new Date()): string {
  const roman = toRomanMonth(date.getMonth());
  const year = date.getFullYear();
  const seqStr = String(sequence).padStart(3, '0');
  return `${seqStr}/IM-NMSA/KEU/${roman}/${year}`;
}

/**
 * Extracts sequence number from memo number string like "168/IM-NMSA/KEU/IX/2026", "No. : 168/...", or "169/..." -> 168, 169
 */
export function extractMemoSequence(nomorMemo: string | undefined): number | null {
  if (!nomorMemo) return null;
  const cleaned = nomorMemo.trim();
  // 1. Check start of string or right after "No." / "No. :"
  const matchPrefix = cleaned.match(/(?:^|No\.?\s*:?\s*)(\d+)/i);
  if (matchPrefix && matchPrefix[1]) {
    const val = parseInt(matchPrefix[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  // 2. Fallback: match any leading sequence digits before "/"
  const matchSlash = cleaned.match(/(\d+)\s*\//);
  if (matchSlash && matchSlash[1]) {
    const val = parseInt(matchSlash[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  // 3. Fallback: any group of digits
  const matchGeneral = cleaned.match(/(\d+)/);
  if (matchGeneral && matchGeneral[1]) {
    const val = parseInt(matchGeneral[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return null;
}

/**
 * Calculates the next sequential accumulated memo number based on all existing memos.
 * Always increments by +1 from the highest existing memo number found.
 */
export function getNextMemoSequence(existingMemos: InternalMemo[] = [], baseSequence = 168): number {
  if (!existingMemos || existingMemos.length === 0) {
    return baseSequence;
  }
  const foundSeqs: number[] = [];
  for (const m of existingMemos) {
    const seq = extractMemoSequence(m.nomorMemo);
    if (seq !== null && seq > 0) {
      foundSeqs.push(seq);
    }
  }

  if (foundSeqs.length === 0) {
    return baseSequence;
  }

  const maxSeq = Math.max(...foundSeqs);
  return maxSeq + 1;
}

/**
 * Generates the next official sequential memo number, automatically accumulating
 */
export function generateNextMemoNumber(
  existingMemosOrCount: InternalMemo[] | number = [],
  date = new Date(),
  baseSequence = 168
): string {
  let nextSeq: number;
  if (Array.isArray(existingMemosOrCount)) {
    nextSeq = getNextMemoSequence(existingMemosOrCount, baseSequence);
  } else if (typeof existingMemosOrCount === 'number') {
    nextSeq = existingMemosOrCount;
  } else {
    nextSeq = baseSequence;
  }
  return generateDefaultMemoNumber(nextSeq, date);
}

export function getSavedBankAccounts(): BankAccountMaster[] {
  try {
    const raw = localStorage.getItem('NMSA_SAVED_BANK_ACCOUNTS');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load bank accounts from localStorage:', e);
  }
  return DEFAULT_BANK_ACCOUNTS;
}

export function saveBankAccounts(accounts: BankAccountMaster[]): void {
  try {
    localStorage.setItem('NMSA_SAVED_BANK_ACCOUNTS', JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save bank accounts:', e);
  }
}

export function getSavedInternalMemos(): InternalMemo[] {
  try {
    const raw = localStorage.getItem('NMSA_INTERNAL_MEMOS');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((m) => ({
          ...m,
          companyHeaderUrl:
            !m.companyHeaderUrl ||
            m.companyHeaderUrl.includes('kommodo.ai') ||
            m.companyHeaderUrl.includes('Kop-Surat-NMSA.png') ||
            m.companyHeaderUrl.includes('i.ibb.co.com/N26djkQX')
              ? OFFICIAL_KOP_SURAT_IMAGE_URL
              : m.companyHeaderUrl,
        }));
      }
    }
  } catch (e) {
    console.error('Failed to load internal memos:', e);
  }
  return [];
}

export function saveInternalMemos(memos: InternalMemo[]): void {
  try {
    localStorage.setItem('NMSA_INTERNAL_MEMOS', JSON.stringify(memos));
  } catch (e) {
    console.error('Failed to save internal memos:', e);
  }
}

/**
 * Creates initial memo with sequential number accumulation
 */
export function createInitialMemo(
  submission?: Submission | null,
  existingMemosOrCount: InternalMemo[] | number = []
): InternalMemo {
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];
  const hariTanggalDisplay = formatHariTanggalMemo(now);
  const defaultAccounts = getSavedBankAccounts();
  const defaultBank = defaultAccounts.find(a => a.isDefault) || defaultAccounts[0] || DEFAULT_BANK_ACCOUNTS[0];
  const nextNomorMemo = generateNextMemoNumber(existingMemosOrCount, now, 168);

  if (submission) {
    const subTotal = (submission.items || []).reduce((sum, item) => sum + (item.total || 0), 0);
    const formattedAmount = `Rp. ${Number(subTotal).toLocaleString('id-ID')},-`;
    const invoiceOrRef = submission.kode ? `No. ${submission.kode}` : '';
    const dateFormatted = formatHariTanggalMemo(submission.tanggal || now);

    return {
      id: `memo-${Date.now()}`,
      nomorMemo: nextNomorMemo,
      tanggal: todayIso,
      hariTanggalDisplay,
      dari: 'H. A. Nursyam Halid – Direktur Utama',
      kepada: 'Harijon – Direktur Keuangan',
      perihal: `Pembayaran ${submission.jenisPengajuan || 'Operasional'} - ${submission.dibayarkanKepada || ''}`.trim(),
      isiSurat: `Sehubungan dengan adanya pengajuan pembayaran keperluan <strong>${submission.jenisPengajuan || 'operasional'}</strong> terkait <strong>${submission.dibayarkanKepada || 'pihak rekanan'}</strong> sesuai rincian pada formulir voucher pengeluaran <strong>${invoiceOrRef}</strong> tertanggal ${dateFormatted}, dengan ini kami memohon untuk dilakukan pembayaran sebesar <strong>${formattedAmount}</strong> dapat di transfer ke :`,
      bankName: defaultBank.bankName,
      accountNumber: defaultBank.accountNumber,
      accountHolder: defaultBank.accountHolder,
      penutup: 'Demikian Internal Memo ini dibuat untuk dapat dipahami bersama dan dilaksanakan sebaik baiknya',
      salamPenutup: 'Hormat saya,',
      penandatanganNama: 'H. Andi Nursyam Halid',
      penandatanganJabatan: 'Direktur Utama',
      useSecondSigner: false,
      salamPenutup2: 'Menyetujui,',
      penandatanganNama2: 'Harijon',
      penandatanganJabatan2: 'Direktur Keuangan',
      linkedSubmissionId: submission.id,
      linkedSubmissionKode: submission.kode,
      linkedAmount: subTotal,
      companyName: 'PT. NUSANTARA MINERAL SUKSES ABADI',
      companyHeaderUrl: OFFICIAL_KOP_SURAT_IMAGE_URL,
      useImageHeader: true, // Always use banner kop surat as requested
      includeBankDetails: true,
      createdAt: new Date().toISOString(),
    };
  }

  // Default sample exactly matching user's official "IM - Pembayaran Tongkang" Word document
  return {
    id: `memo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    nomorMemo: nextNomorMemo,
    tanggal: todayIso,
    hariTanggalDisplay: formatHariTanggalMemo(now),
    dari: 'Andi Muhammad Rifki – Direktur',
    kepada: 'Harijon – Direktur Keuangan',
    perihal: 'Pembayaran DP Batubara 50%',
    isiSurat: 'Sehubungan dengan akan dilakukannya kegiatan pengiriman Batubara ke <strong>PLTU Pelabuhan Ratu ADC</strong>, dengan ini kami memohon untuk dapat dilakukan pembayaran <strong>DP Tongkang sebesar 50%</strong> dari total biaya yang terlampir didalam <strong>Invoice No. 001-DP/WAA-BJM-NMSA/IX/26 Tanggal 23 September 2026</strong>, yaitu <strong>Sebesar Rp. 712.500.000,-</strong> dapat di Transfer ke :',
    bankName: 'Bank Mandiri',
    accountNumber: '1030013139064',
    accountHolder: 'PT. Nusantara Mineral Sukses Abadi',
    includeBankDetails: true,
    penutup: 'Demikian Internal Memo ini dibuat untuk dapat dipahami bersama dan dilaksanakan sebaik baiknya',
    salamPenutup: 'Hormat Saya',
    penandatanganNama: 'Andi Muhammad Rifki',
    penandatanganJabatan: 'Direktur',
    signerCount: 3,
    useSecondSigner: true,
    useThirdSigner: true,
    approvalHeaderTitle: 'Mengetahui dan Menyetujui',
    salamPenutup2: 'Menyetujui,',
    penandatanganNama2: 'Harijon',
    penandatanganJabatan2: 'Direktur Keuangan',
    salamPenutup3: 'Menyetujui,',
    penandatanganNama3: 'Abdul Aziz Halid',
    penandatanganJabatan3: 'Direktur Utama ANH',
    companyName: 'PT. NUSANTARA MINERAL SUKSES ABADI',
    companyHeaderUrl: OFFICIAL_KOP_SURAT_IMAGE_URL,
    useImageHeader: true, // Always use banner kop surat as requested
    showKopSurat: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generates an official A4 PDF Blob from a rendered Internal Memo DOM element
 * Completely sanitizes modern Tailwind v4 oklch() color syntax to prevent html2canvas crashes.
 */
export async function generateMemoPdfBlobFromElement(element: HTMLElement): Promise<Blob> {
  const { jsPDF } = await import('jspdf');

  try {
    const html2canvasModule = await import('html2canvas');
    const html2canvas = (html2canvasModule.default || html2canvasModule) as any;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 850,
      onclone: (clonedDoc: Document) => {
        // 1. Remove all external stylesheets that might contain oklch() from Tailwind v4
        const linkSheets = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
        linkSheets.forEach((link) => link.remove());

        // 2. Sanitize any inline <style> tags: remove or replace any oklch() colors
        const styleTags = clonedDoc.querySelectorAll('style');
        styleTags.forEach((tag) => {
          if (tag.textContent && tag.textContent.includes('oklch')) {
            try {
              tag.textContent = tag.textContent.replace(/oklch\([^)]+\)/gi, '#000000');
            } catch (e) {
              tag.remove();
            }
          }
        });

        // 3. Inject a clean, comprehensive standalone stylesheet for the memo document
        const cleanStyle = clonedDoc.createElement('style');
        cleanStyle.type = 'text/css';
        cleanStyle.textContent = `
          * { box-sizing: border-box !important; }
          body, html { margin: 0; padding: 0; background: #ffffff !important; color: #000000 !important; font-family: Calibri, 'Segoe UI', Arial, sans-serif !important; }
          table { border-collapse: collapse !important; width: 100% !important; }
          .bg-white { background-color: #ffffff !important; }
          .text-black { color: #000000 !important; }
          .border-black { border-color: #000000 !important; }
          .border { border-width: 1px !important; border-style: solid !important; }
          .border-b { border-bottom-width: 1px !important; border-bottom-style: solid !important; }
          .border-r { border-right-width: 1px !important; border-right-style: solid !important; }
          .flex { display: flex !important; }
          .flex-col { flex-direction: column !important; }
          .justify-between { justify-content: space-between !important; }
          .items-center { align-items: center !important; }
          .items-start { align-items: flex-start !important; }
          .items-baseline { align-items: baseline !important; }
          .grid { display: grid !important; }
          .grid-cols-12 { grid-template-columns: repeat(12, minmax(0, 1fr)) !important; }
          .col-span-4 { grid-column: span 4 / span 4 !important; }
          .w-full { width: 100% !important; }
          .text-center { text-align: center !important; }
          .text-justify { text-align: justify !important; }
          .font-bold { font-weight: bold !important; }
          .font-semibold { font-weight: 600 !important; }
          .uppercase { text-transform: uppercase !important; }
          .underline { text-decoration: underline !important; }
          .underline-offset-4 { text-underline-offset: 4px !important; }
          .p-8 { padding: 2rem !important; }
          .p-12 { padding: 3rem !important; }
          .p-14 { padding: 3.5rem !important; }
          .px-3 { padding-left: 0.75rem !important; padding-right: 0.75rem !important; }
          .py-1\\.5 { padding-top: 0.375rem !important; padding-bottom: 0.375rem !important; }
          .my-4 { margin-top: 1rem !important; margin-bottom: 1rem !important; }
          .my-5 { margin-top: 1.25rem !important; margin-bottom: 1.25rem !important; }
          .mt-6 { margin-top: 1.5rem !important; }
          .mb-4 { margin-bottom: 1rem !important; }
          .mt-14 { margin-top: 3.5rem !important; }
          .ml-10 { margin-left: 2.5rem !important; }
          .space-y-1\\.5 > * + * { margin-top: 0.375rem !important; }
          .w-36 { width: 9rem !important; }
          .w-6 { width: 1.5rem !important; }
          .leading-\\[1\\.15\\] { line-height: 1.15 !important; }
          .text-\\[11pt\\] { font-size: 11pt !important; }
          .text-\\[13pt\\] { font-size: 13pt !important; }
          .tracking-wider { letter-spacing: 0.05em !important; }
          img { max-width: 100% !important; height: auto !important; display: block !important; }
        `;
        clonedDoc.head.appendChild(cleanStyle);

        // 4. Sanitize all DOM element style attributes
        const allElems = clonedDoc.querySelectorAll('*');
        allElems.forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (!htmlEl || !htmlEl.getAttribute) return;
          const styleAttr = htmlEl.getAttribute('style') || '';
          if (styleAttr.includes('oklch')) {
            htmlEl.setAttribute(
              'style',
              styleAttr.replace(/oklch\([^)]+\)/gi, '#000000')
            );
          }
        });

        // 5. Wrap cloned window's getComputedStyle with a Proxy to guarantee NO oklch string ever reaches html2canvas
        const win = clonedDoc.defaultView || window;
        if (win && win.getComputedStyle) {
          const origCS = win.getComputedStyle.bind(win);
          win.getComputedStyle = function(el: Element, pseudo?: string | null) {
            const cs = origCS(el, pseudo);
            return new Proxy(cs, {
              get(target, prop) {
                if (prop === 'getPropertyValue') {
                  return (p: string) => {
                    const val = target.getPropertyValue(p);
                    if (typeof val === 'string' && val.includes('oklch')) {
                      return '#000000';
                    }
                    return val;
                  };
                }
                const val = (target as any)[prop];
                if (typeof val === 'string' && val.includes('oklch')) {
                  return '#000000';
                }
                return typeof val === 'function' ? val.bind(target) : val;
              }
            });
          };
        }
      },
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.96);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(imgHeight, pdfHeight));
    return pdf.output('blob');
  } catch (canvasErr) {
    console.warn('html2canvas rendering fallback triggered, generating direct vector PDF:', canvasErr);
    return generateDirectVectorMemoPdfBlob(element);
  }
}

/**
 * Direct vector A4 PDF generation from DOM element or text extraction
 */
function generateDirectVectorMemoPdfBlob(element: HTMLElement): Blob {
  const { jsPDF } = require('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let yPos = 20;

  // Kop Surat fallback text header
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text('PT. NUSANTARA MINERAL SUKSES ABADI', pageWidth / 2, yPos, { align: 'center' });
  yPos += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Mining & General Contractor - Batubara & Mineral', pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;

  pdf.setLineWidth(0.8);
  pdf.setDrawColor(0, 0, 0);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 1.2;
  pdf.setLineWidth(0.3);
  pdf.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Extract text content from the element
  const titleElem = element.querySelector('h2');
  const memoTitle = titleElem ? titleElem.textContent || 'INTERNAL MEMO' : 'INTERNAL MEMO';
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(memoTitle, pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;

  const noElem = element.querySelector('p');
  const memoNo = noElem ? noElem.textContent || '' : '';
  pdf.setFontSize(11);
  pdf.text(memoNo, pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;

  // Table rows
  const tableRows = element.querySelectorAll('table tr');
  if (tableRows.length > 0) {
    pdf.setLineWidth(0.4);
    tableRows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const label = cells[0].textContent?.trim() || '';
        const colon = cells[1].textContent?.trim() || ':';
        const val = cells[2].textContent?.trim() || '';

        pdf.setFont('helvetica', 'bold');
        pdf.text(label, margin + 4, yPos);
        pdf.text(colon, margin + 35, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(val, margin + 42, yPos);
        yPos += 7;
      }
    });
  }

  yPos += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text('Dengan Hormat,', margin, yPos);
  yPos += 7;

  // Body content
  const bodyElem = element.querySelector('.memo-rich-content') || element.querySelector('div.mt-6');
  const bodyText = bodyElem ? (bodyElem.textContent || '').replace(/\s+/g, ' ').trim() : '';
  const splitBody = pdf.splitTextToSize(bodyText, contentWidth);
  pdf.text(splitBody, margin, yPos);
  yPos += splitBody.length * 5.5 + 10;

  // Signatures
  pdf.setFont('helvetica', 'normal');
  pdf.text('Hormat Saya,', margin, yPos);
  pdf.text('Menyetujui,', pageWidth - margin - 50, yPos);
  yPos += 25;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Andi Muhammad Rifki', margin, yPos);
  pdf.text('Harijon', pageWidth - margin - 50, yPos);
  yPos += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Direktur', margin, yPos);
  pdf.text('Direktur Keuangan', pageWidth - margin - 50, yPos);

  return pdf.output('blob');
}

/**
 * Bulletproof, high-fidelity PDF generator for Internal Memo
 * Generates an official, publication-quality A4 PDF directly from the memo data model
 * or falls back from DOM element to guarantee 100% reliable Google Drive uploads.
 */
export async function generateInternalMemoPdfBlob(
  memo: InternalMemo,
  element?: HTMLElement | null
): Promise<Blob> {
  // If element is visible and valid in DOM, attempt html2canvas
  if (element && element.offsetWidth > 0 && element.offsetHeight > 0) {
    try {
      return await generateMemoPdfBlobFromElement(element);
    } catch (e) {
      console.warn('generateMemoPdfBlobFromElement failed, falling back to direct vector PDF generator:', e);
    }
  }

  // Direct High-Fidelity Vector PDF Generation using jsPDF
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let yPos = 16;

  // 1. Try drawing official Kop Surat banner image
  let drewImageHeader = false;
  try {
    const imgDataUrl = await getKopSuratImageDataUrl();
    if (imgDataUrl) {
      // Banner dimensions: width 170mm, aspect ratio approx 170 x 28 mm
      const imgWidth = contentWidth;
      const imgHeight = 28;
      pdf.addImage(imgDataUrl, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 6;
      drewImageHeader = true;
    }
  } catch (imgErr) {
    console.warn('Could not render kop surat image, using vector typography header:', imgErr);
  }

  if (!drewImageHeader) {
    // Official typography letterhead fallback
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(0, 0, 0);
    pdf.text('PT. NUSANTARA MINERAL SUKSES ABADI', pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('Mining & General Contractor - Batubara & Mineral', pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;

    // Double rule line
    pdf.setLineWidth(0.8);
    pdf.setDrawColor(0, 0, 0);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 1.2;
    pdf.setLineWidth(0.3);
    pdf.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;
  }

  // 2. Title & Nomor Memo
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('INTERNAL MEMO', pageWidth / 2, yPos, { align: 'center' });
  const titleWidth = pdf.getTextWidth('INTERNAL MEMO');
  pdf.setLineWidth(0.4);
  pdf.line(pageWidth / 2 - titleWidth / 2, yPos + 1.2, pageWidth / 2 + titleWidth / 2, yPos + 1.2);
  yPos += 6.5;

  pdf.setFontSize(11);
  pdf.text(`No. : ${memo.nomorMemo || 'IM-NMSA'}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 9;

  // 3. Official recipient & subject table with border
  const tableData = [
    { label: 'Hari/taggal', val: memo.hariTanggalDisplay || formatHariTanggalMemo(memo.tanggal) },
    { label: 'Dari', val: memo.dari || 'H. A. Nursyam Halid – Direktur Utama' },
    { label: 'Kepada', val: memo.kepada || 'Harijon – Direktur Keuangan' },
    { label: 'Perihal', val: memo.perihal || 'Pembayaran Operasional' },
  ];

  const col1W = 32;
  const col2W = 6;
  const col3W = contentWidth - col1W - col2W;
  const rowHeight = 7.5;

  pdf.setLineWidth(0.4);
  pdf.setDrawColor(0, 0, 0);

  tableData.forEach((row, idx) => {
    const rowY = yPos + idx * rowHeight;
    // Row border box
    pdf.rect(margin, rowY, contentWidth, rowHeight);
    // Vertical dividers
    pdf.line(margin + col1W, rowY, margin + col1W, rowY + rowHeight);
    pdf.line(margin + col1W + col2W, rowY, margin + col1W + col2W, rowY + rowHeight);

    // Text label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.text(row.label, margin + 2.5, rowY + 5.2);

    // Colon
    pdf.text(':', margin + col1W + col2W / 2, rowY + 5.2, { align: 'center' });

    // Value
    pdf.setFont('helvetica', 'normal');
    pdf.text(row.val, margin + col1W + col2W + 2.5, rowY + 5.2);
  });

  yPos += tableData.length * rowHeight + 8;

  // 4. Salutation
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text((memo as any).salamPembuka || 'Dengan Hormat,', margin, yPos);
  yPos += 6.5;

  // 5. Body Text (Clean up HTML tags to formatted paragraphs)
  const rawBody = memo.isiSurat || '';
  const cleanBody = rawBody
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '$1')
    .replace(/<b>(.*?)<\/b>/gi, '$1')
    .replace(/<em>(.*?)<\/em>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

  const paragraphs = cleanBody.split(/\n+/).filter(Boolean);
  paragraphs.forEach((pText) => {
    const splitLines = pdf.splitTextToSize(pText.trim(), contentWidth);
    pdf.text(splitLines, margin, yPos);
    yPos += splitLines.length * 5.2 + 3;
  });

  yPos += 3;

  // 6. Bank Details Box (if specified)
  if (memo.bankName || memo.accountNumber) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Bank : ${memo.bankName || '-'}`, margin + 6, yPos);
    yPos += 5.5;
    pdf.text(`No. Rekening : ${memo.accountNumber || '-'}`, margin + 6, yPos);
    yPos += 5.5;
    pdf.text(`Atas Nama : ${memo.accountHolder || '-'}`, margin + 6, yPos);
    yPos += 8;
  }

  // 7. Closing note
  pdf.setFont('helvetica', 'normal');
  pdf.text('Demikian disampaikan, atas kerjasamanya diucapkan terima kasih.', margin, yPos);
  yPos += 14;

  // 8. Signers Section (1, 2, or 3 signers)
  const isThreeSigners =
    memo.signerCount === 3 ||
    memo.useThirdSigner === true ||
    (memo.signerCount === undefined && memo.useSecondSigner !== false && !!memo.penandatanganNama3);

  const parsedDari = parseDari(memo.dari || '');
  const signer1Nama = memo.penandatanganNama || parsedDari.nama || 'Andi Muhammad Rifki';
  const signer1Jabatan = memo.penandatanganJabatan || parsedDari.jabatan || 'Direktur';

  const signer2Nama = memo.penandatanganNama2 || 'Harijon';
  const signer2Jabatan = memo.penandatanganJabatan2 || 'Direktur Keuangan';

  const signer3Nama = memo.penandatanganNama3 || 'Abdul Aziz Halid';
  const signer3Jabatan = memo.penandatanganJabatan3 || 'Direktur Utama ANH';

  // Ensure signatures stay on page
  if (yPos > pageHeight - 45) {
    yPos = pageHeight - 45;
  }

  if (isThreeSigners) {
    const colW = contentWidth / 3;
    const col1X = margin + colW / 2;
    const col2X = margin + colW + colW / 2;
    const col3X = margin + colW * 2 + colW / 2;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10.5);
    pdf.text(memo.salamPenutup || 'Hormat Saya,', col1X, yPos, { align: 'center' });
    pdf.text(memo.salamPenutup2 || 'Menyetujui,', col2X, yPos, { align: 'center' });
    pdf.text(memo.salamPenutup3 || 'Menyetujui,', col3X, yPos, { align: 'center' });

    yPos += 24;

    pdf.setFont('helvetica', 'bold');
    pdf.text(signer1Nama, col1X, yPos, { align: 'center' });
    pdf.text(signer2Nama, col2X, yPos, { align: 'center' });
    pdf.text(signer3Nama, col3X, yPos, { align: 'center' });

    yPos += 4.5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(signer1Jabatan, col1X, yPos, { align: 'center' });
    pdf.text(signer2Jabatan, col2X, yPos, { align: 'center' });
    pdf.text(signer3Jabatan, col3X, yPos, { align: 'center' });
  } else {
    // 2 Signers: Left and Right
    const leftX = margin + 30;
    const rightX = pageWidth - margin - 30;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10.5);
    pdf.text(memo.salamPenutup || 'Hormat Saya,', leftX, yPos, { align: 'center' });
    pdf.text(memo.salamPenutup2 || 'Menyetujui,', rightX, yPos, { align: 'center' });

    yPos += 24;

    pdf.setFont('helvetica', 'bold');
    pdf.text(signer1Nama, leftX, yPos, { align: 'center' });
    pdf.text(signer2Nama, rightX, yPos, { align: 'center' });

    yPos += 4.5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(signer1Jabatan, leftX, yPos, { align: 'center' });
    pdf.text(signer2Jabatan, rightX, yPos, { align: 'center' });
  }

  return pdf.output('blob');
}

/**
 * Helper to fetch kop surat image and convert to data URL for jsPDF
 */
async function getKopSuratImageDataUrl(): Promise<string | null> {
  try {
    const res = await fetch('/kop-surat-nmsa-full.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}


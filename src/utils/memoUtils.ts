import { BankAccountMaster, InternalMemo, Submission } from '../types';
import { OFFICIAL_KOP_SURAT_BASE64 } from './kopSuratBase64';

export const OFFICIAL_KOP_SURAT_IMAGE_URL = '/kop-surat-nmsa-full.png';

/**
 * Cleanly format and sanitize rich text HTML from Word editor or plain text legacy memos
 */
export function formatMemoBodyHtml(raw: string | undefined): string {
  if (!raw) return '';

  // If content contains HTML tags (bold, italic, underline, mark, etc.)
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    // Sanitize any dangerous scripts
    return raw
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '');
  }

  // Legacy plain text fallback: convert newlines to <br /> and escape basic symbols
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');
}

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

export function generateDefaultMemoNumber(sequence = 164, date = new Date(), withKop = true): string {
  const roman = toRomanMonth(date.getMonth());
  const year = date.getFullYear();
  const seqStr = String(sequence).padStart(3, '0');
  if (withKop) {
    return `${seqStr}/IM-NMSA/KEU/${roman}/${year}`;
  }
  // Format nomor memo tanpa kop surat: 001/IM/KEU/X/2026
  return `${seqStr}/IM/KEU/${roman}/${year}`;
}

/**
 * Checks if a memo is classified as "without kop surat".
 */
export function isMemoWithoutKopSurat(memo: Partial<InternalMemo> | undefined | null): boolean {
  if (!memo) return false;
  if (memo.showKopSurat === false) return true;
  if (memo.nomorMemo) {
    const cleaned = memo.nomorMemo.trim();
    if (/IM\/KEU/i.test(cleaned) && !/IM-NMSA/i.test(cleaned)) {
      return true;
    }
  }
  return false;
}

/**
 * Extracts sequence number from memo number string like:
 * - "168/IM-NMSA/KEU/IX/2026" -> 168
 * - "No. : 001/IM/KEU/X/2026" -> 1
 * - "001/IM/KEU/X/2026" -> 1
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
 * Extracts the 4-digit year from a memo or memo number.
 */
export function extractMemoYear(nomorMemoOrMemo: string | Partial<InternalMemo> | undefined): number | null {
  if (!nomorMemoOrMemo) return null;
  if (typeof nomorMemoOrMemo === 'object') {
    if (nomorMemoOrMemo.tanggal) {
      const d = new Date(nomorMemoOrMemo.tanggal);
      if (!isNaN(d.getFullYear())) return d.getFullYear();
    }
    return extractMemoYear(nomorMemoOrMemo.nomorMemo);
  }
  const match = nomorMemoOrMemo.match(/\/(20\d{2})(?:\b|[^\d])/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  const matchAnyYear = nomorMemoOrMemo.match(/\b(20\d{2})\b/);
  if (matchAnyYear && matchAnyYear[1]) {
    return parseInt(matchAnyYear[1], 10);
  }
  return null;
}

/**
 * Calculates the next sequential accumulated memo number based on all existing memos.
 * Differentiates between memo with kop surat vs memo without kop surat.
 * If target year is different, sequence for without-kop resets to 1 (001).
 * Sequence continues month-to-month within the same year (bulan berganti nomor tetap berlanjut).
 */
export function getNextMemoSequence(
  existingMemos: InternalMemo[] = [],
  baseSequence = 168,
  withKop = true,
  targetYear?: number
): number {
  const currentYear = targetYear || new Date().getFullYear();

  if (!existingMemos || existingMemos.length === 0) {
    return withKop ? baseSequence : 1;
  }

  const foundSeqs: number[] = [];

  for (const m of existingMemos) {
    const mIsWithoutKop = isMemoWithoutKopSurat(m);
    // Filter matching category
    if (withKop && mIsWithoutKop) continue;
    if (!withKop && !mIsWithoutKop) continue;

    // Check year constraint: if without kop, reset sequence per year
    if (!withKop) {
      const mYear = extractMemoYear(m);
      if (mYear !== null && mYear !== currentYear) {
        // Different year: ignore for sequence count so new year resets to 1
        continue;
      }
    }

    const seq = extractMemoSequence(m.nomorMemo);
    if (seq !== null && seq > 0) {
      foundSeqs.push(seq);
    }
  }

  if (foundSeqs.length === 0) {
    return withKop ? baseSequence : 1;
  }

  const maxSeq = Math.max(...foundSeqs);
  return maxSeq + 1;
}

/**
 * Generates the next official sequential memo number, automatically accumulating
 * according to kop surat status and year.
 */
export function generateNextMemoNumber(
  existingMemosOrCount: InternalMemo[] | number = [],
  date = new Date(),
  baseSequence = 168,
  withKop = true
): string {
  const targetYear = date.getFullYear();
  let nextSeq: number;
  if (Array.isArray(existingMemosOrCount)) {
    nextSeq = getNextMemoSequence(existingMemosOrCount, baseSequence, withKop, targetYear);
  } else if (typeof existingMemosOrCount === 'number') {
    nextSeq = existingMemosOrCount;
  } else {
    nextSeq = withKop ? baseSequence : 1;
  }
  return generateDefaultMemoNumber(nextSeq, date, withKop);
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
 * Generates an official clean document title / file name according to memo number and perihal
 * e.g. "001-IM-KEU-X-2026 - Pembayaran Operasional" or "168-IM-NMSA-KEU-IX-2026 - DP Batubara"
 */
export function formatMemoDocumentTitle(memo: Partial<InternalMemo> | undefined): string {
  if (!memo) return 'Internal_Memo';
  const rawNomor = (memo.nomorMemo || '').trim();
  const cleanNomor = rawNomor
    .replace(/^No\.?\s*:?\s*/i, '')
    .replace(/[\/\\:?*"<>|]+/g, '-')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const cleanPerihal = (memo.perihal || 'Dokumen')
    .replace(/[\/\\:?*"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

  if (cleanNomor && cleanPerihal) {
    return `${cleanNomor} - ${cleanPerihal}`;
  }
  return cleanNomor || cleanPerihal || 'Internal_Memo';
}

/**
 * Creates initial memo with sequential number accumulation
 */
export function createInitialMemo(
  submission?: Submission | null,
  existingMemosOrCount: InternalMemo[] | number = [],
  withKop = true
): InternalMemo {
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];
  const hariTanggalDisplay = formatHariTanggalMemo(now);
  const defaultAccounts = getSavedBankAccounts();
  const defaultBank = defaultAccounts.find(a => a.isDefault) || defaultAccounts[0] || DEFAULT_BANK_ACCOUNTS[0];
  const nextNomorMemo = generateNextMemoNumber(existingMemosOrCount, now, 168, withKop);

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
      useImageHeader: withKop,
      showKopSurat: withKop,
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
    useImageHeader: withKop,
    showKopSurat: withKop,
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
          table { border-collapse: collapse !important; border-spacing: 0 !important; width: 100% !important; }
          .bg-white { background-color: #ffffff !important; }
          .text-black { color: #000000 !important; }
          .border-black { border-color: #000000 !important; }
          .border { border-width: 1px !important; border-style: solid !important; }
          .border-\\[1\\.5px\\] { border-width: 1.5px !important; border-style: solid !important; border-color: #000000 !important; }
          .border-\\[2px\\] { border-width: 2px !important; border-style: solid !important; border-color: #000000 !important; }
          .border-b { border-bottom-width: 1px !important; border-bottom-style: solid !important; border-bottom-color: #000000 !important; }
          .border-r { border-right-width: 1px !important; border-right-style: solid !important; border-right-color: #000000 !important; }
          .flex { display: flex !important; }
          .flex-col { flex-direction: column !important; }
          .justify-between { justify-content: space-between !important; }
          .items-center { align-items: center !important; }
          .items-start { align-items: flex-start !important; }
          .items-baseline { align-items: baseline !important; }
          .grid { display: grid !important; }
          .grid-cols-12 { grid-template-columns: repeat(12, minmax(0, 1fr)) !important; }
          .col-span-4 { grid-column: span 4 / span 4 !important; }
          .col-span-8 { grid-column: span 8 / span 8 !important; }
          .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .gap-4 { gap: 1rem !important; }
          .gap-8 { gap: 2rem !important; }
          .h-20 { height: 5rem !important; }
          .h-24 { height: 6rem !important; }
          .w-full { width: 100% !important; }
          .text-center { text-align: center !important; }
          .text-justify { text-align: justify !important; text-justify: inter-word !important; }
          .font-bold { font-weight: bold !important; }
          .font-semibold { font-weight: 600 !important; }
          .font-normal { font-weight: normal !important; }
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
          .sm\\:ml-20 { margin-left: 5rem !important; }
          .space-y-1\\.5 > * + * { margin-top: 0.375rem !important; }
          .w-36 { width: 9rem !important; }
          .w-6 { width: 1.5rem !important; }
          .leading-\\[1\\.15\\] { line-height: 1.15 !important; }
          .text-\\[10\\.5pt\\] { font-size: 10.5pt !important; }
          .text-\\[11pt\\] { font-size: 11pt !important; }
          .text-\\[13pt\\] { font-size: 13pt !important; }
          .tracking-wider { letter-spacing: 0.05em !important; }
          .tracking-wide { letter-spacing: 0.025em !important; }
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

  // Direct High-Fidelity Vector PDF Generation using jsPDF matching InternalMemoDocument.tsx
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
  const margin = 20;
  const contentWidth = pageWidth - margin * 2; // 170mm
  let yPos = 14;

  const isKopSuratEnabled = memo.showKopSurat !== false;

  if (isKopSuratEnabled) {
    // 1. Draw official Kop Surat banner image with exact aspect ratio (1002 x 216 -> 4.6389)
    let drewImageHeader = false;
    try {
      const imgDataUrl = await getKopSuratImageDataUrl();
      if (imgDataUrl) {
        const imgWidth = contentWidth; // 170mm
        const imgHeight = Math.round((contentWidth / 4.6389) * 10) / 10; // ~ 36.6mm
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
      pdf.setFontSize(14.5);
      pdf.setTextColor(0, 0, 0);
      pdf.text('PT. NUSANTARA MINERAL SUKSES ABADI', pageWidth / 2, yPos + 6, { align: 'center' });
      yPos += 12;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.text('MINING & GENERAL CONTRACTOR - BATUBARA & MINERAL', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;

      // Double rule line
      pdf.setLineWidth(0.8);
      pdf.setDrawColor(0, 0, 0);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 1.2;
      pdf.setLineWidth(0.3);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 7;
    }
  } else {
    // Mode Tanpa Kop Surat: Sisakan ruang atas proporsional dan tidak terlalu jauh dari header fisik
    yPos = 26;
  }

  // 2. Title & Nomor Memo (Spasi Renggang Sesuai Word)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(0, 0, 0);
  pdf.text('INTERNAL MEMO', pageWidth / 2, yPos, { align: 'center' });
  const titleWidth = pdf.getTextWidth('INTERNAL MEMO');
  pdf.setLineWidth(0.4);
  pdf.line(pageWidth / 2 - titleWidth / 2, yPos + 1.2, pageWidth / 2 + titleWidth / 2, yPos + 1.2);
  yPos += 6.5;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(`No. : ${memo.nomorMemo || 'IM-NMSA'}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  // 3. Official recipient & subject table with border (100% Full Width, 1.5px black border)
  const tableData = [
    { label: 'Hari/taggal', val: memo.hariTanggalDisplay || formatHariTanggalMemo(memo.tanggal), isBold: false },
    { label: 'Dari', val: memo.dari || 'Andi Muhammad Rifki', isBold: false },
    { label: 'Kepada', val: memo.kepada || 'Harijon', isBold: false },
    { label: 'Perihal', val: memo.perihal || 'Pembayaran Operasional', isBold: true },
  ];

  const col1W = 34;
  const col2W = 6;
  const col3W = contentWidth - col1W - col2W; // 130mm
  const rowHeight = 7.2;
  const totalTableH = tableData.length * rowHeight;

  pdf.setLineWidth(0.4); // 1.5px border
  pdf.setDrawColor(0, 0, 0);

  // Outer table rectangle
  pdf.rect(margin, yPos, contentWidth, totalTableH);

  // Vertical dividers
  pdf.line(margin + col1W, yPos, margin + col1W, yPos + totalTableH);
  pdf.line(margin + col1W + col2W, yPos, margin + col1W + col2W, yPos + totalTableH);

  tableData.forEach((row, idx) => {
    const rowY = yPos + idx * rowHeight;
    if (idx > 0) {
      // Horizontal row separator
      pdf.line(margin, rowY, margin + contentWidth, rowY);
    }

    // Label
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.text(row.label, margin + 3, rowY + 5.0);

    // Colon
    pdf.text(':', margin + col1W + col2W / 2, rowY + 5.0, { align: 'center' });

    // Value
    pdf.setFont('helvetica', row.isBold ? 'bold' : 'normal');
    pdf.text(row.val, margin + col1W + col2W + 3, rowY + 5.0);
  });

  yPos += totalTableH + 8;

  // 4. Salutation (Dengan Hormat)
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text((memo as any).salamPembuka || 'Dengan Hormat', margin, yPos);
  yPos += 6.5;

  // 5. Body Text (Clean up HTML tags to formatted paragraphs, Justified, 1.15 line spacing)
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

  yPos += 2;

  // 6. Bank Details Box (Indented, matching Word & App layout)
  if (memo.includeBankDetails !== false && (memo.bankName || memo.accountNumber)) {
    const bankIndent = margin + 16;
    const bCol1 = 32;
    const bCol2 = 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);

    // Row 1: Nama Bank
    pdf.text('Nama Bank', bankIndent, yPos);
    pdf.setFont('helvetica', 'bold');
    pdf.text(':', bankIndent + bCol1, yPos);
    pdf.text(memo.bankName || '-', bankIndent + bCol1 + bCol2, yPos);
    yPos += 5.5;

    // Row 2: No Rekeing
    pdf.setFont('helvetica', 'normal');
    pdf.text('No Rekeing', bankIndent, yPos);
    pdf.setFont('helvetica', 'bold');
    pdf.text(':', bankIndent + bCol1, yPos);
    pdf.text(memo.accountNumber || '-', bankIndent + bCol1 + bCol2, yPos);
    yPos += 5.5;

    // Row 3: Nama Rekening
    pdf.setFont('helvetica', 'normal');
    pdf.text('Nama Rekening', bankIndent, yPos);
    pdf.setFont('helvetica', 'bold');
    pdf.text(':', bankIndent + bCol1, yPos);
    pdf.text(memo.accountHolder || '-', bankIndent + bCol1 + bCol2, yPos);
    yPos += 7.5;
  }

  // 7. Closing paragraph
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(memo.penutup || 'Demikian disampaikan, atas kerjasamanya diucapkan terima kasih.', margin, yPos);
  yPos += 14;

  // 8. Signatures Section (Matching InternalMemoDocument.tsx 3 signers or 2 signers)
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
  if (yPos > pageHeight - 48) {
    yPos = pageHeight - 48;
  }

  if (isThreeSigners) {
    // 3 Signers: Col 1 (Hormat Saya) on left (w: 52mm), Col 2 (Mengetahui dan Menyetujui) on right (w: 112mm)
    const leftColCenterX = margin + 26;
    const rightHeaderCenterX = margin + 52 + 56;
    const subCol1CenterX = margin + 52 + 28;
    const subCol2CenterX = margin + 52 + 56 + 28;

    // Left Title
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(memo.salamPenutup || 'Hormat Saya', leftColCenterX, yPos, { align: 'center' });

    // Right Header Title (Shared over signers 2 & 3)
    pdf.text(memo.approvalHeaderTitle || 'Mengetahui dan Menyetujui', rightHeaderCenterX, yPos, { align: 'center' });

    yPos += 22; // Signature space

    // Signer 1 (Left)
    pdf.setFont('helvetica', 'bold');
    pdf.text(signer1Nama, leftColCenterX, yPos, { align: 'center' });
    const s1W = pdf.getTextWidth(signer1Nama);
    pdf.setLineWidth(0.3);
    pdf.line(leftColCenterX - s1W / 2, yPos + 0.8, leftColCenterX + s1W / 2, yPos + 0.8);

    // Signer 2 (Subcol 1)
    pdf.text(signer2Nama, subCol1CenterX, yPos, { align: 'center' });
    const s2W = pdf.getTextWidth(signer2Nama);
    pdf.line(subCol1CenterX - s2W / 2, yPos + 0.8, subCol1CenterX + s2W / 2, yPos + 0.8);

    // Signer 3 (Subcol 2)
    pdf.text(signer3Nama, subCol2CenterX, yPos, { align: 'center' });
    const s3W = pdf.getTextWidth(signer3Nama);
    pdf.line(subCol2CenterX - s3W / 2, yPos + 0.8, subCol2CenterX + s3W / 2, yPos + 0.8);

    yPos += 4.5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(signer1Jabatan, leftColCenterX, yPos, { align: 'center' });
    pdf.text(signer2Jabatan, subCol1CenterX, yPos, { align: 'center' });
    pdf.text(signer3Jabatan, subCol2CenterX, yPos, { align: 'center' });
  } else {
    // 2 Signers: Left and Right
    const leftX = margin + 30;
    const rightX = pageWidth - margin - 30;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(memo.salamPenutup || 'Hormat Saya', leftX, yPos, { align: 'center' });
    pdf.text(memo.salamPenutup2 || 'Menyetujui,', rightX, yPos, { align: 'center' });

    yPos += 22;

    pdf.setFont('helvetica', 'bold');
    pdf.text(signer1Nama, leftX, yPos, { align: 'center' });
    const s1W = pdf.getTextWidth(signer1Nama);
    pdf.setLineWidth(0.3);
    pdf.line(leftX - s1W / 2, yPos + 0.8, leftX + s1W / 2, yPos + 0.8);

    pdf.text(signer2Nama, rightX, yPos, { align: 'center' });
    const s2W = pdf.getTextWidth(signer2Nama);
    pdf.line(rightX - s2W / 2, yPos + 0.8, rightX + s2W / 2, yPos + 0.8);

    yPos += 4.5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
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


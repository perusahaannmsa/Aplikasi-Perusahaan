import React from 'react';
import { InternalMemo } from '../types';
import { NusantaraLogo } from './NusantaraLogo';
import { OFFICIAL_KOP_SURAT_IMAGE_URL } from '../utils/memoUtils';

interface InternalMemoDocumentProps {
  memo: InternalMemo;
  customLogoUrl?: string;
  customHeaderUrl?: string;
  className?: string;
}

// Cleanly format and sanitize rich text HTML from Word editor or plain text legacy memos
function formatMemoBodyHtml(raw: string | undefined): string {
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

export const InternalMemoDocument: React.FC<InternalMemoDocumentProps> = ({
  memo,
  customLogoUrl,
  customHeaderUrl,
  className = '',
}) => {
  // Check whether to use image banner or official vector layout (matching user's Word layout)
  const isImageHeader = memo.useImageHeader === true;
  const headerImageUrl = customHeaderUrl || memo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL;

  // Determine signer mode (default to 3 signers if useThirdSigner or signerCount is 3 or not explicitly 1/2)
  const isThreeSigners =
    memo.signerCount === 3 ||
    memo.useThirdSigner === true ||
    (memo.signerCount === undefined && memo.useSecondSigner !== false && !!memo.penandatanganNama3);

  const isTwoSigners = !isThreeSigners && (memo.signerCount === 2 || memo.useSecondSigner === true);

  return (
    <div
      id="internal-memo-printable-document"
      className={`bg-white text-black font-sans shadow-md border border-stone-200 mx-auto p-8 sm:p-12 md:p-14 max-w-[850px] w-full min-h-[1050px] flex flex-col justify-between select-text internal-memo-page ${className}`}
      style={{
        boxSizing: 'border-box',
      }}
    >
      <div>
        {/* KOP SURAT NMSA (Sesuai Dokumen Resmi Word: Logo + Alamat + Garis Panjang 100% Full Width) */}
        {isImageHeader ? (
          <div className="w-full pb-1 -mt-2 print:mt-0 print:pb-1">
            <img
              src={headerImageUrl}
              alt="Kop Surat PT. Nusantara Mineral Sukses Abadi"
              className="w-full h-auto max-h-[135px] print:max-h-[110px] object-contain block mx-auto"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="w-full">
            {/* Header Two-Column: Logo on Left, Address Details on Right */}
            <div className="flex items-start justify-between gap-4 pb-1">
              {/* Logo Nusantara (Diamond Gold Emblem) */}
              <div className="w-2/5 sm:w-1/3 flex justify-start items-center shrink-0">
                <NusantaraLogo
                  size="md"
                  className="h-18 sm:h-22 print:h-20 w-auto object-contain"
                  logoUrl={customLogoUrl || memo.companyLogoUrl}
                />
              </div>

              {/* Company Details (Right aligned, uppercase, bold corporate) */}
              <div className="w-3/5 sm:w-2/3 text-right">
                <h1 className="font-sans font-black text-base sm:text-lg md:text-xl print:text-[18px] text-black tracking-wider leading-tight uppercase">
                  {memo.companyName || 'PT. NUSANTARA MINERAL SUKSES ABADI'}
                </h1>
                <div className="text-[11px] sm:text-xs print:text-[11px] font-bold text-black mt-1 leading-snug">
                  <p>WISMA NH BUILDING No.. 2B – C LT. 1</p>
                  <p>JL. RAYA PASAR MINGGU</p>
                  <p>JAKARTA SELATAN, DKI Jakarta 12780</p>
                  <p className="mt-0.5">
                    Email :{' '}
                    <span className="text-[#0066cc] underline font-semibold">
                      nusantaramineralsuksesabadi@gmail.com
                    </span>
                  </p>
                  <p>Phone : 021.27533169</p>
                </div>
              </div>
            </div>

            {/* GARIS PANJANG HEADER (100% Full Width across the entire document width) */}
            <div className="w-full border-b-[2.5px] border-black mt-2 mb-3.5 print:mt-1.5 print:mb-2.5"></div>
          </div>
        )}

        {/* TITLE & NUMBER */}
        <div className="text-center my-3 sm:my-4 print:my-2">
          <h2 className="text-base sm:text-lg md:text-xl print:text-[17px] font-black uppercase tracking-wider underline underline-offset-4 text-black">
            INTERNAL MEMO
          </h2>
          <p className="text-xs sm:text-sm print:text-[12.5px] font-bold text-black mt-1">
            No. : {memo.nomorMemo}
          </p>
        </div>

        {/* RECIPIENT & SUBJECT TABLE (100% Full Width, Sharp 1.5px Black Borders) */}
        <div className="my-3 print:my-2 w-full">
          <table className="w-full border-collapse border-[1.5px] border-black text-xs sm:text-[13px] print:text-[12px] text-black font-sans">
            <tbody>
              <tr className="border-b border-black">
                <td className="w-32 sm:w-36 px-3 py-1.5 print:py-1 font-semibold border-r border-black">
                  Hari/taggal
                </td>
                <td className="w-6 px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="px-3 py-1.5 print:py-1 font-medium">
                  {memo.hariTanggalDisplay}
                </td>
              </tr>
              <tr className="border-b border-black">
                <td className="px-3 py-1.5 print:py-1 font-semibold border-r border-black">
                  Dari
                </td>
                <td className="px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="px-3 py-1.5 print:py-1 font-medium">
                  {memo.dari}
                </td>
              </tr>
              <tr className="border-b border-black">
                <td className="px-3 py-1.5 print:py-1 font-semibold border-r border-black">
                  Kepada
                </td>
                <td className="px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="px-3 py-1.5 print:py-1 font-medium">
                  {memo.kepada}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 print:py-1 font-semibold border-r border-black">
                  Perihal
                </td>
                <td className="px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="px-3 py-1.5 print:py-1 font-bold">
                  {memo.perihal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SALUTATION & BODY WITH WORD RICH TEXT SUPPORT */}
        <div className="my-4 print:my-2 text-xs sm:text-[13px] print:text-[12px] text-black leading-relaxed font-sans">
          <p className="font-semibold mb-2 print:mb-1">Dengan Hormat</p>
          <div
            className="memo-rich-content text-justify leading-relaxed font-normal text-stone-950 font-sans"
            dangerouslySetInnerHTML={{ __html: formatMemoBodyHtml(memo.isiSurat) }}
          />
        </div>

        {/* BANK DETAILS (Indented, matching Word document format) */}
        <div className="my-4 print:my-2.5 ml-6 sm:ml-12 print:ml-8 text-xs sm:text-[13px] print:text-[12px] font-sans text-black space-y-1.5 print:space-y-0.5">
          <div className="flex items-baseline">
            <span className="w-32 sm:w-36 font-normal text-stone-900">Nama Bank</span>
            <span className="w-5 font-bold">:</span>
            <span className="font-bold text-black">{memo.bankName}</span>
          </div>
          <div className="flex items-baseline">
            <span className="w-32 sm:w-36 font-normal text-stone-900">No Rekeing</span>
            <span className="w-5 font-bold">:</span>
            <span className="font-bold font-mono tracking-wider text-black">{memo.accountNumber}</span>
          </div>
          <div className="flex items-baseline">
            <span className="w-32 sm:w-36 font-normal text-stone-900">Nama Rekening</span>
            <span className="w-5 font-bold">:</span>
            <span className="font-bold text-black">{memo.accountHolder}</span>
          </div>
        </div>

        {/* CLOSING PARAGRAPH */}
        <div className="my-4 print:my-2.5 text-xs sm:text-[13px] print:text-[12px] text-black font-sans leading-relaxed">
          <p>{memo.penutup}</p>
        </div>
      </div>

      {/* SIGNATURE BLOCK (PERSIS SESUAI FOTO WORD RESMI: 3 PENANDATANGAN ATAU OPSI 2 / 1) */}
      <div className="mt-8 sm:mt-10 print:mt-6 pt-2 print:pt-0 text-xs sm:text-[13px] print:text-[12px] text-black font-sans print:break-inside-avoid">
        {isThreeSigners ? (
          /* TAMPILAN 3 PENANDATANGAN SESUAI MICROSOFT WORD RESMI */
          <div className="grid grid-cols-12 gap-2 sm:gap-4 print:gap-4 items-start">
            {/* KOLOM KIRI: Hormat Saya (Andi Muhammad Rifki - Direktur) */}
            <div className="col-span-4 text-center flex flex-col justify-between">
              <p className="font-normal">{memo.salamPenutup || 'Hormat Saya'}</p>
              <div className="h-16 sm:h-20 print:h-16"></div>
              <div>
                <p className="font-bold underline tracking-wide text-black">
                  {memo.penandatanganNama || 'Andi Muhammad Rifki'}
                </p>
                <p className="text-stone-900 font-normal mt-0.5 text-[11px] sm:text-xs print:text-[11px]">
                  {memo.penandatanganJabatan || 'Direktur'}
                </p>
              </div>
            </div>

            {/* KOLOM KANAN: Mengetahui dan Menyetujui (Harijon & Abdul Aziz Halid) */}
            <div className="col-span-8 flex flex-col">
              <p className="text-center font-normal mb-0">
                {memo.approvalHeaderTitle || 'Mengetahui dan Menyetujui'}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:gap-4 print:gap-4 flex-1">
                {/* Penandatangan 2: Harijon - Direktur Keuangan */}
                <div className="text-center flex flex-col justify-between">
                  <div className="h-16 sm:h-20 print:h-16"></div>
                  <div>
                    <p className="font-bold underline tracking-wide text-black">
                      {memo.penandatanganNama2 || 'Harijon'}
                    </p>
                    <p className="text-stone-900 font-normal mt-0.5 text-[11px] sm:text-xs print:text-[11px]">
                      {memo.penandatanganJabatan2 || 'Direktur Keuangan'}
                    </p>
                  </div>
                </div>

                {/* Penandatangan 3: Abdul Aziz Halid - Direktur Utama ANH */}
                <div className="text-center flex flex-col justify-between">
                  <div className="h-16 sm:h-20 print:h-16"></div>
                  <div>
                    <p className="font-bold underline tracking-wide text-black">
                      {memo.penandatanganNama3 || 'Abdul Aziz Halid'}
                    </p>
                    <p className="text-stone-900 font-normal mt-0.5 text-[11px] sm:text-xs print:text-[11px]">
                      {memo.penandatanganJabatan3 || 'Direktur Utama ANH'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isTwoSigners ? (
          /* TAMPILAN 2 PENANDATANGAN */
          <div className="grid grid-cols-2 gap-8 print:gap-4">
            <div>
              <p className="font-normal">{memo.salamPenutup || 'Hormat Saya'}</p>
              <div className="h-16 sm:h-20 print:h-14"></div>
              <p className="font-bold underline tracking-wide text-stone-950">
                {memo.penandatanganNama}
              </p>
              <p className="text-xs text-stone-800 font-medium mt-0.5">
                {memo.penandatanganJabatan}
              </p>
            </div>
            <div>
              <p className="font-normal">{memo.salamPenutup2 || 'Menyetujui,'}</p>
              <div className="h-16 sm:h-20 print:h-14"></div>
              <p className="font-bold underline tracking-wide text-stone-950">
                {memo.penandatanganNama2 || 'Harijon'}
              </p>
              <p className="text-xs text-stone-800 font-medium mt-0.5">
                {memo.penandatanganJabatan2 || 'Direktur Keuangan'}
              </p>
            </div>
          </div>
        ) : (
          /* TAMPILAN 1 PENANDATANGAN */
          <div>
            <p className="font-normal">{memo.salamPenutup || 'Hormat Saya'}</p>
            <div className="h-16 sm:h-20 print:h-14"></div>
            <p className="font-bold underline tracking-wide text-stone-950">
              {memo.penandatanganNama}
            </p>
            <p className="text-xs text-stone-800 font-medium mt-0.5">
              {memo.penandatanganJabatan}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

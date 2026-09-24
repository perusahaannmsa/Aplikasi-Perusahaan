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
  // Check whether to use image banner or official vector layout (matching user's PDF IM Tongkang)
  const isImageHeader = memo.useImageHeader === true;
  const headerImageUrl = customHeaderUrl || memo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL;

  return (
    <div
      className={`bg-white text-black font-sans shadow-md border border-stone-200 mx-auto print:shadow-none print:border-none print:m-0 print:p-0 print:min-h-0 print:h-auto print:max-w-none print:w-full print:justify-start p-8 sm:p-12 md:p-14 max-w-[850px] w-full min-h-[1050px] flex flex-col justify-between select-text internal-memo-page ${className}`}
      style={{
        boxSizing: 'border-box',
      }}
    >
      <div>
        {/* KOP SURAT NMSA (Sesuai Asli PDF IM Tongkang: Tidak kecil, garis & header panjang 100% full width) */}
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
              {/* Logo Nusantara (Sharp Diamond Emblem) */}
              <div className="w-2/5 sm:w-1/3 flex justify-start items-center shrink-0">
                <NusantaraLogo
                  size="md"
                  className="h-18 sm:h-22 print:h-18 w-auto object-contain"
                  logoUrl={customLogoUrl || memo.companyLogoUrl}
                />
              </div>

              {/* Company Details (Right aligned, uppercase, bold corporate) */}
              <div className="w-3/5 sm:w-2/3 text-right">
                <h1 className="font-sans font-black text-base sm:text-lg md:text-xl print:text-lg text-black tracking-wider leading-tight uppercase">
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
            <div className="w-full border-b-[2.5px] border-black mt-2 mb-3.5 print:mt-1 print:mb-2.5"></div>
          </div>
        )}

        {/* TITLE & NUMBER */}
        <div className="text-center my-3 sm:my-4 print:my-2">
          <h2 className="text-base sm:text-lg md:text-xl print:text-base font-black uppercase tracking-wider underline underline-offset-4 text-black">
            INTERNAL MEMO
          </h2>
          <p className="text-xs sm:text-sm print:text-xs font-bold text-black mt-1">
            No. : {memo.nomorMemo}
          </p>
        </div>

        {/* RECIPIENT & SUBJECT TABLE (100% Full Width, Sharp 1.5px Black Borders) */}
        <div className="my-3 print:my-2 w-full">
          <table className="w-full border-collapse border-[1.5px] border-black text-xs sm:text-[13px] print:text-xs text-black font-sans">
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
        <div className="my-4 print:my-2 text-xs sm:text-[13px] print:text-xs text-black leading-relaxed font-sans">
          <p className="font-semibold mb-2 print:mb-1">Dengan Hormat</p>
          <div
            className="memo-rich-content text-justify leading-relaxed font-normal text-stone-950 font-sans"
            dangerouslySetInnerHTML={{ __html: formatMemoBodyHtml(memo.isiSurat) }}
          />
        </div>

        {/* BANK DETAILS (Indented, matching document format) */}
        <div className="my-4 print:my-2 ml-6 sm:ml-10 print:ml-6 text-xs sm:text-[13px] print:text-xs font-sans text-black space-y-1.5 print:space-y-0.5">
          <div className="flex items-baseline">
            <span className="w-32 sm:w-36 font-medium text-stone-900">Nama Bank</span>
            <span className="w-5 font-bold">:</span>
            <span className="font-bold text-black">{memo.bankName}</span>
          </div>
          <div className="flex items-baseline">
            <span className="w-32 sm:w-36 font-medium text-stone-900">No Rekeing</span>
            <span className="w-5 font-bold">:</span>
            <span className="font-bold font-mono tracking-wider text-black">{memo.accountNumber}</span>
          </div>
          <div className="flex items-baseline">
            <span className="w-32 sm:w-36 font-medium text-stone-900">Nama Rekening</span>
            <span className="w-5 font-bold">:</span>
            <span className="font-bold text-black">{memo.accountHolder}</span>
          </div>
        </div>

        {/* CLOSING PARAGRAPH */}
        <div className="my-4 print:my-2 text-xs sm:text-[13px] print:text-xs text-black font-sans leading-relaxed">
          <p>{memo.penutup}</p>
        </div>
      </div>

      {/* SIGNATURE BLOCK */}
      <div className="mt-6 sm:mt-8 print:mt-4 pt-2 print:pt-0 text-xs sm:text-[13px] print:text-xs text-black font-sans print:break-inside-avoid">
        {memo.useSecondSigner ? (
          <div className="grid grid-cols-2 gap-8 print:gap-4">
            <div>
              <p className="font-normal">{memo.salamPenutup || 'Hormat saya,'}</p>
              <div className="h-16 sm:h-20 print:h-14"></div>
              <p className="font-bold underline uppercase tracking-wide text-stone-950">
                {memo.penandatanganNama}
              </p>
              <p className="text-xs text-stone-800 font-medium mt-0.5">
                {memo.penandatanganJabatan}
              </p>
            </div>
            <div>
              <p className="font-normal">{memo.salamPenutup2 || 'Menyetujui,'}</p>
              <div className="h-16 sm:h-20 print:h-14"></div>
              <p className="font-bold underline uppercase tracking-wide text-stone-950">
                {memo.penandatanganNama2 || 'Harijon'}
              </p>
              <p className="text-xs text-stone-800 font-medium mt-0.5">
                {memo.penandatanganJabatan2 || 'Direktur Keuangan'}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="font-normal">{memo.salamPenutup}</p>
            <div className="h-16 sm:h-20 print:h-14"></div>
            <p className="font-bold underline uppercase tracking-wide text-stone-950">
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

import React from 'react';
import { InternalMemo } from '../types';
import { NusantaraLogo } from './NusantaraLogo';
import { OFFICIAL_KOP_SURAT_IMAGE_URL, parseDari } from '../utils/memoUtils';

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
  const rawHeaderUrl = customHeaderUrl || memo.companyHeaderUrl || OFFICIAL_KOP_SURAT_IMAGE_URL;
  const headerImageUrl =
    !rawHeaderUrl ||
    rawHeaderUrl.includes('Kop-Surat-NMSA.png') ||
    rawHeaderUrl.includes('i.ibb.co.com/N26djkQX') ||
    rawHeaderUrl.includes('kommodo.ai')
      ? '/kop-surat-nmsa-full.png'
      : rawHeaderUrl;

  // Determine signer mode (default to 3 signers if useThirdSigner or signerCount is 3 or not explicitly 1/2)
  const isThreeSigners =
    memo.signerCount === 3 ||
    memo.useThirdSigner === true ||
    (memo.signerCount === undefined && memo.useSecondSigner !== false && !!memo.penandatanganNama3);

  const isTwoSigners = !isThreeSigners && (memo.signerCount === 2 || memo.useSecondSigner === true);

  // Automatically sync Penandatangan 1 from "Dari" (Pejabat ke-1 otomatis sama dengan Dari)
  const parsedDari = parseDari(memo.dari || '');
  const signer1Nama = memo.penandatanganNama || parsedDari.nama || 'Andi Muhammad Rifki';
  const signer1Jabatan = memo.penandatanganJabatan || parsedDari.jabatan || 'Direktur';

  return (
    <div
      id="internal-memo-printable-document"
      className={`bg-white text-black shadow-md border border-stone-200 mx-auto p-8 sm:p-12 md:p-14 max-w-[850px] w-full min-h-[1050px] flex flex-col justify-between select-text internal-memo-page memo-word-document ${className}`}
      style={{
        boxSizing: 'border-box',
        fontFamily: "Calibri, 'Calibri (Body)', Aptos, 'Segoe UI', Arial, sans-serif",
        fontSize: '11pt',
        lineHeight: 1.15,
      }}
    >
      <div>
        {/* KOP SURAT NMSA (Garis Panjang 100% Full Width Ujung ke Ujung Sesuai Lebar Tabel) */}
        {isImageHeader ? (
          <div className="w-full pb-1 -mt-2 print:mt-0 print:pb-1">
            <img
              src={headerImageUrl}
              alt="Kop Surat PT. Nusantara Mineral Sukses Abadi"
              className="w-full h-auto block"
              style={{
                width: '100%',
                maxWidth: '100%',
                height: 'auto',
                display: 'block',
              }}
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
                <h1 className="font-bold text-[14pt] print:text-[14pt] text-black tracking-wide leading-tight uppercase">
                  {memo.companyName || 'PT. NUSANTARA MINERAL SUKSES ABADI'}
                </h1>
                <div className="text-[9.5pt] print:text-[9.5pt] font-bold text-black mt-1 leading-snug">
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
            <div className="w-full border-b-[2.5px] border-black mt-2 mb-5 print:mt-1 print:mb-4"></div>
          </div>
        )}

        {/* TITLE & NUMBER - Spasi Renggang Sesuai Word */}
        <div className="text-center my-4 sm:my-5 print:my-4">
          <h2 className="text-[13pt] print:text-[13pt] font-bold uppercase tracking-wider underline underline-offset-4 text-black">
            INTERNAL MEMO
          </h2>
          <p className="text-[11pt] print:text-[11pt] font-bold text-black mt-1">
            No. : {memo.nomorMemo}
          </p>
        </div>

        {/* RECIPIENT & SUBJECT TABLE (100% Full Width, Sharp 1.5px Black Borders, Spaced Sesuai Word) */}
        <div className="my-5 print:my-4 w-full">
          <table className="w-full border-collapse border-[1.5px] border-black text-[11pt] print:text-[11pt] text-black">
            <tbody>
              <tr className="border-b border-black">
                <td className="w-36 px-3 py-1.5 font-semibold border-r border-black">
                  Hari/taggal
                </td>
                <td className="w-6 px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="px-3 py-1.5 font-normal">
                  {memo.hariTanggalDisplay}
                </td>
              </tr>
              <tr className="border-b border-black">
                <td className="px-3 py-1.5 font-semibold border-r border-black">
                  Dari
                </td>
                <td className="px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="px-3 py-1.5 font-normal">
                  {memo.dari}
                </td>
              </tr>
              <tr className="border-b border-black">
                <td className="px-3 py-1.5 font-semibold border-r border-black">
                  Kepada
                </td>
                <td className="px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="px-3 py-1.5 font-normal">
                  {memo.kepada}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 font-semibold border-r border-black">
                  Perihal
                </td>
                <td className="px-1 text-center font-bold border-r border-black">
                  :
                </td>
                <td className="px-3 py-1.5 font-bold">
                  {memo.perihal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SALUTATION & BODY - PERSIS WORD (Calibri 11pt, Justified, Multiple 1.08 Line Spacing) */}
        <div className="mt-6 mb-4 print:mt-5 print:mb-3 text-[11pt] print:text-[11pt] text-black">
          <p className="font-normal mb-3 print:mb-2">Dengan Hormat</p>
          <div
            className="memo-rich-content text-justify leading-[1.15] font-normal text-black"
            style={{
              textAlign: 'justify',
              textJustify: 'inter-word',
              lineHeight: 1.15,
            }}
            dangerouslySetInnerHTML={{ __html: formatMemoBodyHtml(memo.isiSurat) }}
          />
        </div>

        {/* BANK DETAILS (Indented Persis Sesuai Posisi Word Image 3) */}
        <div className="my-5 print:my-4 ml-10 sm:ml-20 print:ml-16 text-[11pt] print:text-[11pt] text-black space-y-1.5 print:space-y-1">
          <div className="flex items-baseline">
            <span className="w-36 font-normal text-black">Nama Bank</span>
            <span className="w-6 font-bold">:</span>
            <span className="font-bold text-black">{memo.bankName}</span>
          </div>
          <div className="flex items-baseline">
            <span className="w-36 font-normal text-black">No Rekeing</span>
            <span className="w-6 font-bold">:</span>
            <span className="font-bold font-mono tracking-wider text-black">{memo.accountNumber}</span>
          </div>
          <div className="flex items-baseline">
            <span className="w-36 font-normal text-black">Nama Rekening</span>
            <span className="w-6 font-bold">:</span>
            <span className="font-bold text-black">{memo.accountHolder}</span>
          </div>
        </div>

        {/* CLOSING PARAGRAPH - Spasi Renggang Sesuai Word */}
        <div className="my-5 print:my-4 text-[11pt] print:text-[11pt] text-black leading-[1.15]">
          <p>{memo.penutup}</p>
        </div>
      </div>

      {/* SIGNATURE BLOCK - Renggang ke Bawah Sesuai Dokumen Word */}
      <div className="mt-14 sm:mt-20 print:mt-14 pt-4 print:pt-2 text-[11pt] print:text-[11pt] text-black print:break-inside-avoid">
        {isThreeSigners ? (
          /* TAMPILAN 3 PENANDATANGAN SESUAI MICROSOFT WORD RESMI */
          <div className="grid grid-cols-12 gap-4 print:gap-4 items-start">
            {/* KOLOM KIRI: Hormat Saya (Andi Muhammad Rifki - Direktur) */}
            <div className="col-span-4 text-center flex flex-col justify-between">
              <p className="font-normal">{memo.salamPenutup || 'Hormat Saya'}</p>
              <div className="h-20 sm:h-24 print:h-20"></div>
              <div>
                <p className="font-bold underline tracking-wide text-black">
                  {signer1Nama}
                </p>
                <p className="text-black font-normal mt-0.5 text-[10.5pt] print:text-[10.5pt]">
                  {signer1Jabatan}
                </p>
              </div>
            </div>

            {/* KOLOM KANAN: Mengetahui dan Menyetujui (Harijon & Abdul Aziz Halid) */}
            <div className="col-span-8 flex flex-col">
              <p className="text-center font-normal mb-0">
                {memo.approvalHeaderTitle || 'Mengetahui dan Menyetujui'}
              </p>
              <div className="grid grid-cols-2 gap-4 print:gap-4 flex-1">
                {/* Penandatangan 2: Harijon - Direktur Keuangan */}
                <div className="text-center flex flex-col justify-between">
                  <div className="h-20 sm:h-24 print:h-20"></div>
                  <div>
                    <p className="font-bold underline tracking-wide text-black">
                      {memo.penandatanganNama2 || 'Harijon'}
                    </p>
                    <p className="text-black font-normal mt-0.5 text-[10.5pt] print:text-[10.5pt]">
                      {memo.penandatanganJabatan2 || 'Direktur Keuangan'}
                    </p>
                  </div>
                </div>

                {/* Penandatangan 3: Abdul Aziz Halid - Direktur Utama ANH */}
                <div className="text-center flex flex-col justify-between">
                  <div className="h-20 sm:h-24 print:h-20"></div>
                  <div>
                    <p className="font-bold underline tracking-wide text-black">
                      {memo.penandatanganNama3 || 'Abdul Aziz Halid'}
                    </p>
                    <p className="text-black font-normal mt-0.5 text-[10.5pt] print:text-[10.5pt]">
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
              <div className="h-20 sm:h-24 print:h-20"></div>
              <p className="font-bold underline tracking-wide text-black">
                {signer1Nama}
              </p>
              <p className="text-[10.5pt] text-black font-normal mt-0.5">
                {signer1Jabatan}
              </p>
            </div>
            <div>
              <p className="font-normal">{memo.salamPenutup2 || 'Menyetujui,'}</p>
              <div className="h-20 sm:h-24 print:h-20"></div>
              <p className="font-bold underline tracking-wide text-black">
                {memo.penandatanganNama2 || 'Harijon'}
              </p>
              <p className="text-[10.5pt] text-black font-normal mt-0.5">
                {memo.penandatanganJabatan2 || 'Direktur Keuangan'}
              </p>
            </div>
          </div>
        ) : (
          /* TAMPILAN 1 PENANDATANGAN */
          <div>
            <p className="font-normal">{memo.salamPenutup || 'Hormat Saya'}</p>
            <div className="h-20 sm:h-24 print:h-20"></div>
            <p className="font-bold underline tracking-wide text-black">
              {signer1Nama}
            </p>
            <p className="text-[10.5pt] text-black font-normal mt-0.5">
              {signer1Jabatan}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

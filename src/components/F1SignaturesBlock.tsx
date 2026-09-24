import React from 'react';
import { SignerConfigItem } from './SignerSettingsModal';

export interface F1SignaturesBlockProps {
  signers: SignerConfigItem[];
  style: 'table' | 'line';
  density?: 'normal' | 'dense' | 'ultra_dense' | 'few_items';
  isCompact?: boolean;
}

export const F1SignaturesBlock: React.FC<F1SignaturesBlockProps> = ({
  signers,
  style,
  density = 'normal',
  isCompact = false,
}) => {
  // Ensure default fallback if signers array is empty
  const defaultFallbackSigners: SignerConfigItem[] = [
    { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan', enabled: true },
    { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
    { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur', enabled: true },
    { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan', enabled: true },
  ];

  const sourceSigners = signers && signers.length > 0 ? signers : defaultFallbackSigners;

  // Filter only ACTIVE / ENABLED signers (respecting user's selection of 2, 3, or 4 columns)
  const activeSigners = sourceSigners.filter((s) => s.enabled !== false);
  const displaySigners: SignerConfigItem[] = activeSigners.length > 0 ? activeSigners : sourceSigners;
  const count = displaySigners.length;
  const colWidthPercent = `${(100 / count).toFixed(3)}%`;

  // Height calculations based on density - increased for spacious signature area
  const getGapHeightClass = () => {
    if (density === 'ultra_dense') return 'h-10 sm:h-12 print:h-10 min-h-[40px]';
    if (density === 'dense') return 'h-14 sm:h-16 print:h-14 min-h-[56px]';
    if (density === 'few_items') return 'h-24 sm:h-28 print:h-24 min-h-[96px]';
    if (isCompact) return 'h-12 sm:h-14 print:h-12 min-h-[48px]';
    return 'h-20 sm:h-24 print:h-20 min-h-[80px]';
  };

  const gapHeight = getGapHeightClass();

  // Model 1: Kotak Penanda Tangan (Tabel Berbingkai Tertutup)
  if (style === 'table') {
    return (
      <div className={`w-full text-black ${density === 'ultra_dense' ? 'my-1' : 'my-2 sm:my-2.5 print:my-1.5'}`}>
        <table className="w-full border-collapse border-2 border-black text-center font-sans table-fixed box-border">
          <colgroup>
            {displaySigners.map((_, idx) => (
              <col key={idx} style={{ width: colWidthPercent }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b-2 border-black bg-white">
              {displaySigners.map((signer, idx) => (
                <th
                  key={idx}
                  style={{ width: colWidthPercent, maxWidth: colWidthPercent }}
                  className={`p-1 sm:p-1.5 font-bold uppercase tracking-wider text-[10px] sm:text-[11px] print:text-[10.5px] text-black overflow-hidden ${
                    idx < count - 1 ? 'border-r-2 border-black' : ''
                  }`}
                >
                  <span className="block truncate text-center leading-tight">
                    {signer.title}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b-2 border-black">
              {displaySigners.map((_, idx) => (
                <td
                  key={idx}
                  style={{ width: colWidthPercent, maxWidth: colWidthPercent }}
                  className={`${idx < count - 1 ? 'border-r-2 border-black' : ''} ${gapHeight}`}
                />
              ))}
            </tr>
            <tr>
              {displaySigners.map((signer, idx) => (
                <td
                  key={idx}
                  style={{ width: colWidthPercent, maxWidth: colWidthPercent }}
                  className={`px-1 py-1.5 align-top overflow-hidden ${
                    idx < count - 1 ? 'border-r-2 border-black' : ''
                  }`}
                >
                  <span className="font-bold tracking-tight uppercase text-[10.5px] sm:text-[11.5px] print:text-[11px] text-black block leading-tight text-center break-words">
                    {signer.name}
                  </span>
                  {/* Garis tipis pemisah antara nama dan jabatan */}
                  <div className="w-5/6 mx-auto border-b border-black my-1 print:my-0.5" />
                  <span className="font-bold tracking-tight uppercase text-[8.5px] sm:text-[9.5px] print:text-[9px] text-stone-900 block leading-tight text-center break-words">
                    {signer.role}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // Model 2: Hanya Garis Saja Seperti Biasa (Garis Terbuka Bersih)
  const getGridColsClass = () => {
    if (count === 1) return 'grid-cols-1 max-w-xs mx-auto';
    if (count === 2) return 'grid-cols-2 max-w-xl mx-auto';
    if (count === 3) return 'grid-cols-3';
    if (count === 4) return 'grid-cols-4';
    return 'grid-cols-5';
  };

  return (
    <div className={`w-full text-black ${density === 'ultra_dense' ? 'my-1' : 'my-2 sm:my-3 print:my-2'}`}>
      <div className={`grid ${getGridColsClass()} gap-2 sm:gap-3 w-full px-0.5 box-border`}>
        {displaySigners.map((signer, idx) => (
          <div
            key={idx}
            className="w-full min-w-0 max-w-full flex flex-col items-center text-center overflow-hidden"
          >
            {/* Status / Title */}
            <span className="font-sans font-semibold uppercase tracking-wider text-[10px] sm:text-[11px] print:text-[10.5px] block truncate w-full text-center leading-tight">
              {signer.title}
            </span>

            {/* Signature Area Space */}
            <div className={`w-full ${gapHeight}`} />

            {/* Name with thin line separator underneath */}
            <div className="w-full max-w-[175px] sm:max-w-[200px] border-b border-black pb-0.5 flex items-center justify-center px-0.5 min-w-0">
              <span className="font-bold tracking-tight uppercase text-[10.5px] sm:text-[11.5px] print:text-[11px] block text-center break-words leading-tight w-full">
                {signer.name}
              </span>
            </div>

            {/* Role / Jabatan */}
            <span className="text-[8.5px] sm:text-[9.5px] print:text-[9px] text-stone-800 font-mono mt-0.5 uppercase font-medium leading-tight block text-center break-words w-full">
              {signer.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

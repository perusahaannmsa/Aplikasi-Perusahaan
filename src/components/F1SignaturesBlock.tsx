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
  // Ensure exactly 4 signers
  const safeSigners: SignerConfigItem[] = [
    signers[0] || { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan' },
    signers[1] || { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan' },
    signers[2] || { title: 'Diverifikasi', name: 'Andi Muhammad Rifki', role: 'Direktur' },
    signers[3] || { title: 'Disetujui', name: 'Harijon', role: 'Direktur Keuangan' },
  ];

  // Height calculations based on density
  const getGapHeightClass = () => {
    if (density === 'ultra_dense') return 'h-7 sm:h-8 print:h-7';
    if (density === 'dense') return 'h-9 sm:h-10 print:h-8';
    if (density === 'few_items') return 'h-13 sm:h-15 print:h-12';
    if (isCompact) return 'h-8 sm:h-9 print:h-8';
    return 'h-10 sm:h-12 print:h-10';
  };

  const gapHeight = getGapHeightClass();

  if (style === 'table') {
    return (
      <div className={`w-full text-black ${density === 'ultra_dense' ? 'my-1' : 'my-2 sm:my-2.5 print:my-1.5'}`}>
        <table className="w-full border-collapse border-2 border-black text-center font-sans table-fixed box-border">
          <colgroup>
            <col className="w-1/4" style={{ width: '25%' }} />
            <col className="w-1/4" style={{ width: '25%' }} />
            <col className="w-1/4" style={{ width: '25%' }} />
            <col className="w-1/4" style={{ width: '25%' }} />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-black bg-white">
              {safeSigners.map((signer, idx) => (
                <th
                  key={idx}
                  className={`w-1/4 max-w-[25%] p-1 sm:p-1.5 font-bold uppercase tracking-wider text-[10px] sm:text-[11px] print:text-[10.5px] text-black overflow-hidden ${
                    idx < 3 ? 'border-r-2 border-black' : ''
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
              {safeSigners.map((_, idx) => (
                <td
                  key={idx}
                  className={`w-1/4 max-w-[25%] ${idx < 3 ? 'border-r-2 border-black' : ''} ${gapHeight}`}
                />
              ))}
            </tr>
            <tr>
              {safeSigners.map((signer, idx) => (
                <td
                  key={idx}
                  className={`w-1/4 max-w-[25%] p-1 sm:p-1.5 align-top overflow-hidden ${
                    idx < 3 ? 'border-r-2 border-black' : ''
                  }`}
                >
                  <span className="font-bold tracking-tight uppercase text-[10.5px] sm:text-[11.5px] print:text-[11px] text-black block leading-tight text-center break-words">
                    {signer.name}
                  </span>
                  <span className="font-bold tracking-tight uppercase text-[8.5px] sm:text-[9.5px] print:text-[9px] text-stone-900 block leading-tight text-center mt-0.5 break-words">
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

  // Line Style (Garis Terbuka) with strict CSS Grid layout
  return (
    <div className={`w-full text-black ${density === 'ultra_dense' ? 'my-1' : 'my-2 sm:my-3 print:my-2'}`}>
      <div className="grid grid-cols-4 gap-2 sm:gap-2.5 w-full px-0.5 box-border">
        {safeSigners.map((signer, idx) => (
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

            {/* Name with strict Underline */}
            <div className="w-full max-w-[170px] sm:max-w-[185px] border-b-2 border-black pb-0.5 flex items-center justify-center px-0.5 min-w-0">
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

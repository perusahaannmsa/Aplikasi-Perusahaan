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

  // Filter only ACTIVE / ENABLED signers (supports 2 to 8 signers with multi-row layout)
  const activeSigners = sourceSigners.filter((s) => s.enabled !== false);
  const displaySigners: SignerConfigItem[] = activeSigners.length > 0 ? activeSigners : sourceSigners;
  const count = displaySigners.length;

  const isMultiRow = count > 4;
  const row1 = isMultiRow ? displaySigners.slice(0, 4) : displaySigners;
  const row2 = isMultiRow ? displaySigners.slice(4, 8) : [];

  // Height calculations based on density - equal for both rows (Row 1 and Row 2 have identical height and width)
  const getGapHeightClass = () => {
    if (isMultiRow) {
      if (density === 'ultra_dense') return 'h-12 sm:h-14 print:h-12 min-h-[48px]';
      if (density === 'dense') return 'h-16 sm:h-18 print:h-16 min-h-[64px]';
      if (isCompact) return 'h-14 sm:h-16 print:h-14 min-h-[56px]';
      return 'h-20 sm:h-24 print:h-20 min-h-[80px]';
    }
    if (density === 'ultra_dense') return 'h-12 sm:h-14 print:h-12 min-h-[48px]';
    if (density === 'dense') return 'h-16 sm:h-20 print:h-16 min-h-[64px]';
    if (density === 'few_items') return 'h-24 sm:h-28 print:h-24 min-h-[96px]';
    if (isCompact) return 'h-14 sm:h-16 print:h-14 min-h-[56px]';
    return 'h-20 sm:h-24 print:h-20 min-h-[80px]';
  };

  // Helper renderer for a single table row of signers
  const renderTableSigners = (
    signerItems: SignerConfigItem[],
    containerWidthClass: string,
    isSecondRow: boolean = false,
    exactWidthPercent?: string
  ) => {
    const itemCount = signerItems.length;
    const colWidth = `${(100 / itemCount).toFixed(3)}%`;
    const gapHeight = getGapHeightClass();

    return (
      <div className={`w-full ${isSecondRow ? 'flex justify-center text-center mt-2.5 print:mt-2' : ''}`}>
        <table
          data-preserve-width="true"
          style={exactWidthPercent ? { width: exactWidthPercent, maxWidth: exactWidthPercent } : undefined}
          className={`signature-sub-table border-collapse border-2 border-black text-center font-sans table-fixed box-border mx-auto ${containerWidthClass}`}
        >
          <colgroup>
            {signerItems.map((_, idx) => (
              <col key={idx} style={{ width: colWidth }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b-2 border-black bg-white">
              {signerItems.map((signer, idx) => (
                <th
                  key={idx}
                  style={{ width: colWidth, maxWidth: colWidth }}
                  className={`p-1 sm:p-1.5 font-bold uppercase tracking-wider text-[10px] sm:text-[11px] print:text-[10.5px] text-black overflow-hidden ${
                    idx < itemCount - 1 ? 'border-r-2 border-black' : ''
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
              {signerItems.map((_, idx) => (
                <td
                  key={idx}
                  style={{ width: colWidth, maxWidth: colWidth }}
                  className={`${idx < itemCount - 1 ? 'border-r-2 border-black' : ''} ${gapHeight}`}
                />
              ))}
            </tr>
            <tr>
              {signerItems.map((signer, idx) => (
                <td
                  key={idx}
                  style={{ width: colWidth, maxWidth: colWidth }}
                  className={`px-1 py-1.5 align-top overflow-hidden ${
                    idx < itemCount - 1 ? 'border-r-2 border-black' : ''
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
  };

  // Helper renderer for a single row of line style signers
  const renderLineSigners = (
    signerItems: SignerConfigItem[],
    containerWidthClass: string,
    gridColsClass: string,
    isSecondRow: boolean = false,
    exactWidthPercent?: string
  ) => {
    const gapHeight = getGapHeightClass();

    return (
      <div className={`w-full ${isSecondRow ? 'flex justify-center mt-2.5 sm:mt-3 print:mt-2' : ''}`}>
        <div
          style={exactWidthPercent ? { width: exactWidthPercent, maxWidth: exactWidthPercent } : undefined}
          className={`grid ${gridColsClass} gap-2 sm:gap-3 ${containerWidthClass} px-0.5 box-border mx-auto`}
        >
          {signerItems.map((signer, idx) => (
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

  // Model 1: Kotak Penanda Tangan (Tabel Berbingkai Tertutup)
  if (style === 'table') {
    if (!isMultiRow) {
      // 1 to 4 columns: Single table
      return (
        <div className={`w-full text-black ${density === 'ultra_dense' ? 'my-1' : 'my-2 sm:my-2.5 print:my-1.5'}`}>
          {renderTableSigners(row1, 'table-w-100 w-full', false, '100%')}
        </div>
      );
    }

    // > 4 columns (5 to 8 signers):
    // Row 1: 4 columns across full width (25% per box).
    // Row 2: 1 to 4 columns, positioned in center if 1, 2, 3, and aligned if 4.
    // Each box in Row 2 has the EXACT same 25% width as Row 1!
    const count2 = row2.length;
    const row2WidthClass =
      count2 === 1 ? 'table-w-25 w-1/4' : count2 === 2 ? 'table-w-50 w-2/4' : count2 === 3 ? 'table-w-75 w-3/4' : 'table-w-100 w-full';
    const row2WidthPercent =
      count2 === 1 ? '25%' : count2 === 2 ? '50%' : count2 === 3 ? '75%' : '100%';

    return (
      <div className={`w-full text-black ${density === 'ultra_dense' ? 'my-1' : 'my-2 sm:my-2.5 print:my-1.5'}`}>
        {/* Row 1: 4 Kolom Utama Sejajar */}
        {renderTableSigners(row1, 'table-w-100 w-full', false, '100%')}

        {/* Row 2: Kolom Tambahan (5 - 8), Berposisi Tengah Seimbang & Ukuran Kotak Sama Persis (25% per kotak) */}
        {renderTableSigners(row2, row2WidthClass, true, row2WidthPercent)}
      </div>
    );
  }

  // Model 2: Hanya Garis Saja Seperti Biasa (Garis Terbuka Bersih)
  if (!isMultiRow) {
    const getGridColsClass = () => {
      if (count === 1) return 'grid-cols-1 max-w-xs mx-auto';
      if (count === 2) return 'grid-cols-2 max-w-xl mx-auto';
      if (count === 3) return 'grid-cols-3';
      return 'grid-cols-4';
    };

    return (
      <div className={`w-full text-black ${density === 'ultra_dense' ? 'my-1' : 'my-2 sm:my-3 print:my-2'}`}>
        {renderLineSigners(row1, 'w-full', getGridColsClass(), false, '100%')}
      </div>
    );
  }

  // > 4 signers in Line Style:
  // Row 1: 4 columns
  // Row 2: Centered with exact same item width
  const count2 = row2.length;
  const row2WidthClass =
    count2 === 1 ? 'w-1/4' : count2 === 2 ? 'w-2/4' : count2 === 3 ? 'w-3/4' : 'w-full';
  const row2WidthPercent =
    count2 === 1 ? '25%' : count2 === 2 ? '50%' : count2 === 3 ? '75%' : '100%';
  const row2GridCols =
    count2 === 1 ? 'grid-cols-1' : count2 === 2 ? 'grid-cols-2' : count2 === 3 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className={`w-full text-black ${density === 'ultra_dense' ? 'my-1' : 'my-2 sm:my-3 print:my-2'}`}>
      {renderLineSigners(row1, 'w-full', 'grid-cols-4', false, '100%')}
      {renderLineSigners(row2, row2WidthClass, row2GridCols, true, row2WidthPercent)}
    </div>
  );
};

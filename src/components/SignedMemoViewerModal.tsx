import React, { useState } from 'react';
import { InternalMemo } from '../types';
import {
  X,
  Printer,
  Download,
  ExternalLink,
  FileCheck,
  Calendar,
  Cloud,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Trash2,
  Upload,
} from 'lucide-react';

interface SignedMemoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  memo: InternalMemo;
  onReuploadScan: () => void;
  onDeleteScan?: () => void;
}

export const SignedMemoViewerModal: React.FC<SignedMemoViewerModalProps> = ({
  isOpen,
  onClose,
  memo,
  onReuploadScan,
  onDeleteScan,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);

  if (!isOpen || !memo.signedDocumentUrl) return null;

  const isPdf =
    memo.signedDocumentType?.includes('pdf') ||
    memo.signedDocumentName?.toLowerCase().endsWith('.pdf') ||
    memo.signedDocumentUrl.startsWith('data:application/pdf');

  const handlePrintDocument = () => {
    if (isPdf) {
      const printWindow = window.open(memo.signedDocumentUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
        printWindow.print();
      }
    } else {
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`
        <html>
          <head>
            <title>Cetak Berkas Scan Memo - ${memo.nomorMemo}</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; background: white; }
              img { max-width: 100%; height: auto; display: block; }
              @media print {
                body { margin: 0; }
                img { width: 100%; page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <img src="${memo.signedDocumentUrl}" onload="window.print();window.close();" />
          </body>
        </html>
      `);
      win.document.close();
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = memo.signedDocumentUrl!;
    a.download = memo.signedDocumentName || `Scan_TTD_${memo.nomorMemo}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-[1150] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-4xl w-full overflow-hidden flex flex-col max-h-[94vh]">
        {/* MODAL HEADER */}
        <div className="bg-stone-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-emerald-500 text-white rounded-2xl shrink-0 shadow-md">
              <FileCheck size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black tracking-tight text-white font-sans">
                  Berkas Scan Memo Bertanda Tangan Basah
                </h3>
                <span className="font-mono text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  {memo.nomorMemo}
                </span>
                <span className="text-[10px] font-bold bg-amber-400 text-stone-950 px-2 py-0.5 rounded-full">
                  Dokumen Fisik Sah
                </span>
              </div>
              <p className="text-xs text-stone-300 mt-0.5 truncate">
                {memo.perihal}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <button
              onClick={handlePrintDocument}
              className="p-2 rounded-xl text-stone-300 hover:text-white hover:bg-stone-800 transition cursor-pointer"
              title="Cetak Berkas Scan ke Printer"
            >
              <Printer size={18} />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded-xl text-stone-300 hover:text-white hover:bg-stone-800 transition cursor-pointer"
              title="Unduh Berkas Scan"
            >
              <Download size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* METADATA BAR */}
        <div className="bg-stone-50 border-b border-stone-200 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap text-stone-600">
            <div className="flex items-center gap-1.5">
              <Calendar size={13} className="text-amber-600" />
              <span>
                Tanggal TTD:{' '}
                <strong className="text-stone-900">
                  {memo.signedAt ? new Date(memo.signedAt).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '-'}
                </strong>
              </span>
            </div>
            {memo.signedNotes && (
              <span className="text-stone-500 hidden md:inline truncate max-w-sm" title={memo.signedNotes}>
                &bull; {memo.signedNotes}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {memo.signedDriveUrl ? (
              <a
                href={memo.signedDriveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-bold transition"
              >
                <Cloud size={13} className="text-emerald-600" />
                <span>Buka di Google Drive</span>
                <ExternalLink size={11} />
              </a>
            ) : null}

            <button
              type="button"
              onClick={onReuploadScan}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl text-[11px] font-bold transition cursor-pointer"
              title="Ganti atau pindai ulang berkas ini"
            >
              <Upload size={12} />
              <span>Pindai Ulang</span>
            </button>
          </div>
        </div>

        {/* DOCUMENT VIEW CONTAINER */}
        <div className="flex-1 overflow-auto bg-stone-900/90 p-4 sm:p-6 flex items-center justify-center min-h-[360px]">
          {isPdf ? (
            <div className="w-full h-full min-h-[500px] flex flex-col">
              <iframe
                src={memo.signedDocumentUrl}
                title="Preview PDF Scan Memo"
                className="w-full h-[540px] rounded-xl border border-stone-700 bg-white"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center w-full h-full overflow-auto">
              <img
                src={memo.signedDocumentUrl}
                alt="Berkas Scan Bertanda Tangan"
                className="max-h-[70vh] w-auto object-contain rounded-xl shadow-2xl transition-transform duration-200"
                style={{
                  transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                }}
              />
            </div>
          )}
        </div>

        {/* IMAGE CONTROLS (IF NOT PDF) */}
        {!isPdf && (
          <div className="bg-stone-100 px-4 py-2 flex items-center justify-between border-t border-stone-200 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(50, prev - 25))}
                className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-50 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="font-mono font-bold text-stone-700 w-12 text-center">{zoomLevel}%</span>
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(250, prev + 25))}
                className="p-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-50 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRotation((prev) => (prev + 90) % 360)}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-50 cursor-pointer font-bold flex items-center gap-1"
            >
              <RotateCw size={13} />
              <span>Putar ({rotation}&deg;)</span>
            </button>
          </div>
        )}

        {/* FOOTER */}
        <div className="bg-white border-t border-stone-200 p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0">
          <div>
            {onDeleteScan && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Hapus berkas scan bertanda tangan ini dari memo?')) {
                    onDeleteScan();
                    onClose();
                  }
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Hapus Berkas Scan</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintDocument}
              className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition shadow-3xs flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} />
              <span>Cetak ke Printer</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

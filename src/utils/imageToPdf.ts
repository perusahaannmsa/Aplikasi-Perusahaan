import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';

export interface ConvertedPdfResult {
  pdfBlob: Blob;
  pdfDataUrl: string;
  pageCount: number;
  fileName: string;
  sizeBytes: number;
}

/**
 * Loads an image file and scales it to fit within max dimensions while retaining aspect ratio.
 */
function loadImageData(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Optimize resolution: limit max dimension to 2000px for high quality yet fast rendering & compact PDF
        const maxDim = 2000;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: src, width: img.naturalWidth, height: img.naturalHeight });
          return;
        }

        // Fill white background for transparent PNGs
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        resolve({ dataUrl: optimizedDataUrl, width: w, height: h });
      };
      img.onerror = () => reject(new Error(`Gagal memuat gambar: ${file.name}`));
      img.src = src;
    };
    reader.onerror = () => reject(new Error(`Gagal membaca berkas: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a single image or an array of multiple images (e.g. 10 photos of receipts/bon)
 * into a single merged PDF with 1 page per image.
 * Also handles if PDF files are included by merging them.
 */
export async function convertImagesToMergedPdf(
  files: File[],
  categoryName: string = 'Bukti_Pengeluaran',
  sppdNumber: string = 'SPPD'
): Promise<ConvertedPdfResult> {
  if (!files || files.length === 0) {
    throw new Error('Tidak ada berkas yang dipilih untuk dikonversi.');
  }

  // Sanitize file title
  const safeCategory = categoryName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const safeSppdNo = sppdNumber.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const outputFileName = `Bukti_${safeCategory}_${safeSppdNo}_${Date.now()}.pdf`;

  // Separate image files and PDF files
  const imageFiles = files.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
  const pdfFiles = files.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));

  // If there are only PDF files and exactly 1 file:
  if (imageFiles.length === 0 && pdfFiles.length === 1) {
    const singlePdf = pdfFiles[0];
    const arrayBuffer = await singlePdf.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pageCount = pdfDoc.getPageCount();
    const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const pdfDataUrl = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.readAsDataURL(pdfBlob);
    });

    return {
      pdfBlob,
      pdfDataUrl,
      pageCount,
      fileName: outputFileName,
      sizeBytes: pdfBlob.size
    };
  }

  // If there are multiple images (or images + PDFs)
  // 1. Build image PDF first with jsPDF
  let imagePdfBytes: Uint8Array | null = null;
  let imagePageCount = 0;

  if (imageFiles.length > 0) {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const { dataUrl, width: imgW, height: imgH } = await loadImageData(file);

      // Determine page orientation based on image aspect ratio
      const isLandscape = imgW > imgH * 1.25;
      const pageWidth = isLandscape ? 297 : 210;
      const pageHeight = isLandscape ? 210 : 297;
      const margin = 12; // 12mm margin

      if (i > 0) {
        pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
      } else {
        // Set first page orientation
        if (isLandscape) {
          pdf.deletePage(1);
          pdf.addPage('a4', 'landscape');
        }
      }

      // Calculate fitted dimensions
      const availableW = pageWidth - margin * 2;
      const availableH = pageHeight - margin * 2 - 12; // Leave room for header/footer

      const scale = Math.min(availableW / imgW, availableH / imgH);
      const renderW = imgW * scale;
      const renderH = imgH * scale;

      const posX = margin + (availableW - renderW) / 2;
      const posY = margin + 8 + (availableH - renderH) / 2;

      // Draw image
      pdf.addImage(dataUrl, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');

      // Add neat header badge
      pdf.setFillColor(245, 245, 245);
      pdf.roundedRect(margin, margin - 4, availableW, 8, 1, 1, 'F');
      pdf.setFontSize(8);
      pdf.setTextColor(80, 80, 80);
      pdf.text(
        `BUKTI TRANSAKSI: ${categoryName.toUpperCase()} | ${file.name.substring(0, 40)}`,
        margin + 3,
        margin + 1.5
      );

      // Add footer page indicator
      pdf.setFontSize(7.5);
      pdf.setTextColor(130, 130, 130);
      pdf.text(
        `Halaman ${i + 1} dari ${imageFiles.length} • PT. Nusantara Mineral Sukses Abadi • Lampiran SPPD ${sppdNumber}`,
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );

      imagePageCount++;
    }

    const arrayBuffer = pdf.output('arraybuffer');
    imagePdfBytes = new Uint8Array(arrayBuffer);
  }

  // If we also have PDF files to merge together
  if (pdfFiles.length > 0) {
    const mergedDoc = await PDFDocument.create();

    // 1. Append the images PDF if any
    if (imagePdfBytes) {
      const imgDoc = await PDFDocument.load(imagePdfBytes);
      const copiedPages = await mergedDoc.copyPages(imgDoc, imgDoc.getPageIndices());
      copiedPages.forEach(p => mergedDoc.addPage(p));
    }

    // 2. Append each uploaded PDF
    for (const pdfFile of pdfFiles) {
      try {
        const fileBuffer = await pdfFile.arrayBuffer();
        const srcDoc = await PDFDocument.load(fileBuffer);
        const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        copiedPages.forEach(p => mergedDoc.addPage(p));
      } catch (err) {
        console.warn(`Gagal menggabungkan berkas PDF ${pdfFile.name}:`, err);
      }
    }

    const mergedBytes = await mergedDoc.save();
    const finalBlob = new Blob([mergedBytes], { type: 'application/pdf' });
    const finalPageCount = mergedDoc.getPageCount();

    const pdfDataUrl = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.readAsDataURL(finalBlob);
    });

    return {
      pdfBlob: finalBlob,
      pdfDataUrl,
      pageCount: finalPageCount,
      fileName: outputFileName,
      sizeBytes: finalBlob.size
    };
  }

  // Only images
  if (imagePdfBytes) {
    const finalBlob = new Blob([imagePdfBytes], { type: 'application/pdf' });
    const pdfDataUrl = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.readAsDataURL(finalBlob);
    });

    return {
      pdfBlob: finalBlob,
      pdfDataUrl,
      pageCount: imagePageCount,
      fileName: outputFileName,
      sizeBytes: finalBlob.size
    };
  }

  throw new Error('Gagal mengonversi berkas.');
}

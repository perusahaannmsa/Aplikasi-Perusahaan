/**
 * Google Drive Dedicated Storage Engine for NMSA Internal Memos
 * Automatically uploads official Memo PDFs to a dedicated, separated folder structure:
 * INTERNAL-MEMO-NMSA / [Tahun] / [Bulan] / [Tanggal] / IM_[NoMemo]_[Perihal].pdf
 */

import {
  getOrCreateNestedFolder,
  uploadFileToDrive,
} from '../lib/googleWorkspaceAbsen';
import {
  ensureValidDriveToken,
  getActiveGoogleDriveAccount,
  executeDriveApiWithAutoRefresh,
  getOrRenewDriveToken,
} from '../firebase';
import { InternalMemo } from '../types';
import { generateMemoPdfBlobFromElement } from './memoUtils';

export interface MemoDriveUploadResult {
  success: boolean;
  fileId?: string;
  url?: string;
  folderPath?: string;
  folderId?: string;
  error?: string;
}

export class MemoGoogleDriveService {
  /**
   * Helper to ensure token is valid and execute drive operation with automatic account renewal
   */
  private async withDriveToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const activeAccount = getActiveGoogleDriveAccount();
    const lastEmail = localStorage.getItem('NUSANTARA_LAST_ACTIVE_EMAIL');
    const targetEmail = activeAccount?.email || lastEmail || undefined;

    let token = await getOrRenewDriveToken(targetEmail, true);
    if (!token) {
      token = await ensureValidDriveToken(true);
    }

    if (!token) {
      throw new Error('Akun Google Drive belum terhubung atau sesi login telah kedaluwarsa. Silakan sambungkan Google Drive.');
    }

    return executeDriveApiWithAutoRefresh(
      async (tok) => {
        return await fn(tok);
      },
      {
        actionName: 'Unggah Internal Memo ke Google Drive',
        interactiveIfRequired: true,
        targetEmail,
      }
    );
  }

  /**
   * Uploads an Internal Memo to Google Drive in a separated dedicated folder by Year, Month, and Date
   */
  public async uploadMemo(
    memo: InternalMemo,
    pdfBlobOrElement?: Blob | HTMLElement
  ): Promise<MemoDriveUploadResult> {
    try {
      // 1. Prepare PDF Blob
      let pdfBlob: Blob;
      if (pdfBlobOrElement instanceof Blob) {
        pdfBlob = pdfBlobOrElement;
      } else if (pdfBlobOrElement instanceof HTMLElement) {
        pdfBlob = await generateMemoPdfBlobFromElement(pdfBlobOrElement);
      } else {
        // Fallback: look for DOM element
        const docElem = document.getElementById('internal-memo-printable-document');
        if (docElem) {
          pdfBlob = await generateMemoPdfBlobFromElement(docElem);
        } else {
          throw new Error('Elemen dokumen memo tidak ditemukan untuk menghasilkan berkas PDF.');
        }
      }

      // 2. Compute date parts for dedicated folder structure
      let d = new Date();
      if (memo.tanggal) {
        const parts = memo.tanggal.split('T')[0].split('-');
        if (parts.length === 3) {
          d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
          d = new Date(memo.tanggal);
        }
      }
      if (isNaN(d.getTime())) d = new Date();

      const yearStr = d.getFullYear().toString();
      const monthNamesIndo = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      const monthIdx = d.getMonth();
      const monthNum = String(monthIdx + 1).padStart(2, '0');
      const monthFolderName = `${monthNum} - ${monthNamesIndo[monthIdx]}`;
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dateFolderName = `${yearStr}-${monthNum}-${dayNum}`;

      // Root dedicated folder for internal memos
      const rootFolderName = 'INTERNAL-MEMO-NMSA';
      const folderHierarchy = [rootFolderName, yearStr, monthFolderName, dateFolderName];
      const folderPathStr = folderHierarchy.join('/');

      // 3. Clean up file name
      const safeNomor = (memo.nomorMemo || 'IM-NMSA')
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_');
      const safePerihal = (memo.perihal || 'Dokumen')
        .replace(/[\/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 40);
      const fileName = `IM_${safeNomor}_${safePerihal}.pdf`;

      // 4. Upload to Google Drive using authenticated token
      const result = await this.withDriveToken(async (token) => {
        // Create or get the nested folder structure: INTERNAL-MEMO-NMSA / [Tahun] / [Bulan] / [Tanggal]
        const folderId = await getOrCreateNestedFolder(token, folderHierarchy);

        // Upload or overwrite existing PDF file
        const uploadRes = await uploadFileToDrive(token, folderId, fileName, pdfBlob);

        return {
          fileId: uploadRes.id,
          url: uploadRes.webViewLink,
          folderId,
        };
      });

      return {
        success: true,
        fileId: result.fileId,
        url: result.url,
        folderPath: folderPathStr,
        folderId: result.folderId,
      };
    } catch (err: any) {
      console.error('Error uploading memo to Google Drive:', err);
      return {
        success: false,
        error: err.message || 'Gagal mengunggah Internal Memo ke Google Drive.',
      };
    }
  }

  /**
   * Uploads a scanned/signed document file (from physical printer scanner or camera) to Google Drive
   */
  public async uploadSignedDocument(
    memo: InternalMemo,
    fileBlob: Blob,
    originalFileName?: string
  ): Promise<MemoDriveUploadResult> {
    try {
      let d = new Date();
      if (memo.tanggal) {
        const parts = memo.tanggal.split('T')[0].split('-');
        if (parts.length === 3) {
          d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
          d = new Date(memo.tanggal);
        }
      }
      if (isNaN(d.getTime())) d = new Date();

      const yearStr = d.getFullYear().toString();
      const monthNamesIndo = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      const monthIdx = d.getMonth();
      const monthNum = String(monthIdx + 1).padStart(2, '0');
      const monthFolderName = `${monthNum} - ${monthNamesIndo[monthIdx]}`;
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dateFolderName = `${yearStr}-${monthNum}-${dayNum}`;

      const rootFolderName = 'INTERNAL-MEMO-NMSA';
      const folderHierarchy = [rootFolderName, yearStr, monthFolderName, dateFolderName];
      const folderPathStr = folderHierarchy.join('/');

      let ext = 'pdf';
      if (fileBlob.type === 'image/jpeg' || fileBlob.type === 'image/jpg') ext = 'jpg';
      else if (fileBlob.type === 'image/png') ext = 'png';
      else if (originalFileName && originalFileName.includes('.')) {
        ext = originalFileName.split('.').pop() || 'pdf';
      }

      const safeNomor = (memo.nomorMemo || 'IM-NMSA')
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_');
      const safePerihal = (memo.perihal || 'Dokumen')
        .replace(/[\/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 30);
      const fileName = `TTD_SCAN_IM_${safeNomor}_${safePerihal}.${ext}`;

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, folderHierarchy);
        const uploadRes = await uploadFileToDrive(token, folderId, fileName, fileBlob);
        return {
          fileId: uploadRes.id,
          url: uploadRes.webViewLink,
          folderId,
        };
      });

      return {
        success: true,
        fileId: result.fileId,
        url: result.url,
        folderPath: folderPathStr,
        folderId: result.folderId,
      };
    } catch (err: any) {
      console.error('Error uploading signed memo to Google Drive:', err);
      return {
        success: false,
        error: err.message || 'Gagal mengunggah Berkas Tanda Tangan ke Google Drive.',
      };
    }
  }
}

export const memoGoogleDriveService = new MemoGoogleDriveService();

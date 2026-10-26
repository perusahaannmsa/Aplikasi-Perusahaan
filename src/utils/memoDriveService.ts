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
  getStoredGoogleDriveToken,
  googleDriveLogin,
} from '../firebase';
import { InternalMemo } from '../types';
import { generateInternalMemoPdfBlob, extractMemoSequence } from './memoUtils';

export interface MemoDriveUploadResult {
  success: boolean;
  fileId?: string;
  url?: string;
  folderPath?: string;
  folderId?: string;
  fileName?: string;
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

    let token = getStoredGoogleDriveToken(false);
    if (!token) {
      token = localStorage.getItem('g_access_token');
    }
    if (!token) {
      token = await getOrRenewDriveToken(targetEmail, false);
    }
    if (!token) {
      token = await ensureValidDriveToken(false);
    }

    // If still no token, perform interactive login popup so user request succeeds
    if (!token) {
      try {
        const loginRes = await googleDriveLogin(targetEmail, false);
        token = loginRes.accessToken;
      } catch (authErr: any) {
        throw new Error(
          authErr.message ||
          'Akun Google Drive belum terhubung atau sesi login telah kedaluwarsa. Silakan sambungkan Google Drive terlebih dahulu.'
        );
      }
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
   * Uploads an Internal Memo to Google Drive in an organized folder structure:
   * ARSIP-INTERNAL-MEMO-NMSA / [Tahun] / [Bulan] / [0168 - No. NomorMemo - Perihal.pdf]
   * Ordered by sequence number (4-digit padded) so Google Drive sorts files chronologically & by number.
   */
  public async uploadMemo(
    memo: InternalMemo,
    pdfBlobOrElement?: Blob | HTMLElement
  ): Promise<MemoDriveUploadResult> {
    try {
      // 1. Prepare PDF Blob using bulletproof generator
      let pdfBlob: Blob;
      if (pdfBlobOrElement instanceof Blob) {
        pdfBlob = pdfBlobOrElement;
      } else {
        const domElem =
          pdfBlobOrElement instanceof HTMLElement
            ? pdfBlobOrElement
            : document.getElementById('internal-memo-printable-document');
        pdfBlob = await generateInternalMemoPdfBlob(memo, domElem || undefined);
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

      // Root dedicated archive folder for internal memos organized by Year / Month
      const rootFolderName = 'ARSIP-INTERNAL-MEMO-NMSA';
      const folderHierarchy = [rootFolderName, yearStr, monthFolderName];
      const folderPathStr = folderHierarchy.join('/');

      // 3. Clean up file name with 4-digit sequential number prefix for exact alphabetical/numerical sorting in Google Drive
      const seqNum = extractMemoSequence(memo.nomorMemo) || 1;
      const seqStr = String(seqNum).padStart(4, '0'); // e.g. "0168"
      const safeNomor = (memo.nomorMemo || `IM-${seqStr}`)
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_');
      const safePerihal = (memo.perihal || 'Dokumen')
        .replace(/[\/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 45);
      const fileName = `${seqStr} - No. ${safeNomor} - ${safePerihal}.pdf`;

      // 4. Upload to Google Drive using authenticated token
      const result = await this.withDriveToken(async (token) => {
        // Create or get the nested folder structure: ARSIP-INTERNAL-MEMO-NMSA / [Tahun] / [Bulan]
        const folderId = await getOrCreateNestedFolder(token, folderHierarchy);

        // Upload or overwrite existing PDF file
        const uploadRes = await uploadFileToDrive(token, folderId, fileName, pdfBlob);

        // Also upload structured JSON backup for this memo
        try {
          const jsonPayload = {
            archiveType: 'internal_memo_nmsa',
            archivedAt: new Date().toISOString(),
            memo,
            year: yearStr,
            month: monthFolderName,
            sequence: seqNum,
            fileName,
          };
          const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
          const jsonFileName = `${seqStr} - No. ${safeNomor} - ${safePerihal}.json`;
          await uploadFileToDrive(token, folderId, jsonFileName, jsonBlob);
        } catch (jsonErr) {
          console.warn('Companion memo JSON upload notice:', jsonErr);
        }

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
        fileName,
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
   * Batch upload multiple memos to Google Drive
   */
  public async uploadAllMemos(
    memos: InternalMemo[],
    onProgress?: (current: number, total: number, memo: InternalMemo) => void
  ): Promise<{ success: boolean; totalUploaded: number; failed: number; results: MemoDriveUploadResult[] }> {
    const results: MemoDriveUploadResult[] = [];
    let totalUploaded = 0;
    let failed = 0;

    for (let i = 0; i < memos.length; i++) {
      const m = memos[i];
      if (onProgress) {
        onProgress(i + 1, memos.length, m);
      }

      try {
        const res = await this.uploadMemo(m);
        results.push(res);
        if (res.success) {
          totalUploaded++;
        } else {
          failed++;
        }
      } catch (err: any) {
        failed++;
        results.push({ success: false, error: err.message });
      }
    }

    return {
      success: totalUploaded > 0,
      totalUploaded,
      failed,
      results,
    };
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

      const rootFolderName = 'ARSIP-INTERNAL-MEMO-NMSA';
      const folderHierarchy = [rootFolderName, yearStr, monthFolderName];
      const folderPathStr = folderHierarchy.join('/');

      let ext = 'pdf';
      if (fileBlob.type === 'image/jpeg' || fileBlob.type === 'image/jpg') ext = 'jpg';
      else if (fileBlob.type === 'image/png') ext = 'png';
      else if (originalFileName && originalFileName.includes('.')) {
        ext = originalFileName.split('.').pop() || 'pdf';
      }

      const numMatch = (memo.nomorMemo || '').match(/^(\d+)/);
      const seqPrefix = numMatch ? `No_${numMatch[1].padStart(3, '0')}_` : '';
      const safeNomor = (memo.nomorMemo || 'IM-NMSA')
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_');
      const safePerihal = (memo.perihal || 'Dokumen')
        .replace(/[\/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 35);
      const fileName = `${seqPrefix}${safeNomor}_TTD-SCAN_${safePerihal}.${ext}`;

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

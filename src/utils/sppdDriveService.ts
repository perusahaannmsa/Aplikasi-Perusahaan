/**
 * Dedicated Google Drive Service for SPPD (Surat Perintah Perjalanan Dinas) NMSA
 * Automatically generates vector PDF and uploads to:
 * ARSIP-SPPD-DINAS-NMSA / [Tahun] / [Bulan] / [SPPD-NMSA-... - Nama Pegawai.pdf]
 *
 * Ensures all SPPD documents are preserved in Google Drive and synced to Firebase Firestore
 * with the direct Google Drive URL.
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
import { SPPDRecord } from '../components/SppdManager';
import { generateSppdPdfBlob } from './sppdPdfGenerator';

export interface SppdDriveUploadResult {
  success: boolean;
  fileId?: string;
  url?: string;
  folderPath?: string;
  folderId?: string;
  fileName?: string;
  error?: string;
}

export class SppdGoogleDriveService {
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
        actionName: 'Unggah SPPD ke Google Drive',
        interactiveIfRequired: true,
        targetEmail,
      }
    );
  }

  /**
   * Uploads an SPPD Record PDF to Google Drive in an organized folder structure:
   * ARSIP-SPPD-DINAS-NMSA / [Tahun] / [Bulan] / [SPPD-NMSA-... - Nama Pegawai.pdf]
   */
  public async uploadSppd(
    sppd: SPPDRecord,
    customPdfBlob?: Blob
  ): Promise<SppdDriveUploadResult> {
    try {
      // 1. Prepare PDF Blob using bulletproof vector generator
      const pdfBlob = customPdfBlob || await generateSppdPdfBlob(sppd);

      // 2. Compute date parts for dedicated folder structure
      let d = new Date();
      if (sppd.tanggalMulai) {
        const parts = sppd.tanggalMulai.split('T')[0].split('-');
        if (parts.length === 3) {
          d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
          d = new Date(sppd.tanggalMulai);
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

      // Root dedicated archive folder for SPPD organized by Year / Month
      const rootFolderName = 'ARSIP-SPPD-DINAS-NMSA';
      const folderHierarchy = [rootFolderName, yearStr, monthFolderName];
      const folderPathStr = folderHierarchy.join('/');

      // 3. Clean up file name with SPPD number & employee name
      const safeNomor = (sppd.noSppd || `SPPD-${Date.now()}`)
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_');
      const safeNama = (sppd.namaPekerja || 'Pegawai')
        .replace(/[\/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 40);
      const fileName = `${safeNomor} - ${safeNama}.pdf`;

      // 4. Upload to Google Drive using authenticated token
      const result = await this.withDriveToken(async (token) => {
        // Create or get the nested folder structure: ARSIP-SPPD-DINAS-NMSA / [Tahun] / [Bulan]
        const folderId = await getOrCreateNestedFolder(token, folderHierarchy);

        // Upload or overwrite existing PDF file
        const uploadRes = await uploadFileToDrive(token, folderId, fileName, pdfBlob);

        // Also upload structured JSON companion for this SPPD metadata
        try {
          // Clean base64 from costItems before archiving companion JSON
          const sanitizedSppd = {
            ...sppd,
            costItems: (sppd.costItems || []).map(ci => ({
              ...ci,
              attachment: ci.attachment ? { name: ci.attachment.name, sizeBytes: ci.attachment.sizeBytes } : undefined,
            })),
            attachedFiles: (sppd.attachedFiles || []).map(af => ({
              name: af.name,
              sizeBytes: af.sizeBytes,
              category: af.category,
            })),
          };

          const jsonPayload = {
            archiveType: 'sppd_record_nmsa',
            archivedAt: new Date().toISOString(),
            sppd: sanitizedSppd,
            drivePdfUrl: uploadRes.webViewLink,
            drivePdfFileId: uploadRes.id,
            year: yearStr,
            month: monthFolderName,
            fileName,
          };
          const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
          const jsonFileName = `${safeNomor} - ${safeNama}.json`;
          await uploadFileToDrive(token, folderId, jsonFileName, jsonBlob);
        } catch (jsonErr) {
          console.warn('Companion SPPD JSON upload notice:', jsonErr);
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
      console.error('Error uploading SPPD to Google Drive:', err);
      return {
        success: false,
        error: err.message || 'Gagal mengunggah SPPD ke Google Drive.',
      };
    }
  }

  /**
   * Batch upload multiple SPPD records to Google Drive
   */
  public async uploadAllSppd(
    records: SPPDRecord[],
    onProgress?: (current: number, total: number, record: SPPDRecord) => void
  ): Promise<{ success: boolean; totalUploaded: number; failed: number; results: SppdDriveUploadResult[] }> {
    const results: SppdDriveUploadResult[] = [];
    let totalUploaded = 0;
    let failed = 0;

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (onProgress) onProgress(i + 1, records.length, rec);

      try {
        const res = await this.uploadSppd(rec);
        results.push(res);
        if (res.success) {
          totalUploaded++;
        } else {
          failed++;
        }
      } catch (e: any) {
        results.push({ success: false, error: e.message });
        failed++;
      }
    }

    return {
      success: totalUploaded > 0,
      totalUploaded,
      failed,
      results,
    };
  }
}

export const sppdGoogleDriveService = new SppdGoogleDriveService();

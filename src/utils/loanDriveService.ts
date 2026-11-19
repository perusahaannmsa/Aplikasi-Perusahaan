/**
 * Google Drive Dedicated Storage Engine for NMSA Pinjaman Karyawan & Cicilan
 * Root folder: PINJAMAN-KARYAWAN-NMSA / [Tahun] / [Bulan] / [NomorPinjaman]_[Nama].pdf
 */

import {
  getOrCreateNestedFolder,
  uploadFileToDrive,
} from '../lib/googleWorkspaceAbsen';
import {
  ensureValidDriveToken,
  executeDriveApiWithAutoRefresh,
  getActiveGoogleDriveAccount,
  getOrRenewDriveToken,
  getStoredGoogleDriveToken,
  googleDriveLogin,
} from '../firebase';
import { EmployeeLoan } from '../types';
import { generateEmployeeLoanPdfBlob } from './loanPdfGenerator';

export const LOAN_DRIVE_ROOT_FOLDER = 'PINJAMAN-KARYAWAN-NMSA';

export interface LoanDriveUploadResult {
  success: boolean;
  fileId?: string;
  url?: string;
  folderPath?: string;
  folderId?: string;
  fileName?: string;
  error?: string;
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export class LoanGoogleDriveService {
  private async withDriveToken<T>(actionName: string, fn: (token: string) => Promise<T>): Promise<T> {
    const activeAccount = getActiveGoogleDriveAccount();
    const lastEmail = localStorage.getItem('NUSANTARA_LAST_ACTIVE_EMAIL');
    const targetEmail = activeAccount?.email || lastEmail || undefined;

    let token = getStoredGoogleDriveToken(false);
    if (!token) token = localStorage.getItem('g_access_token');
    if (!token) token = await getOrRenewDriveToken(targetEmail, false);
    if (!token) token = await ensureValidDriveToken(false);

    if (!token) {
      const loginRes = await googleDriveLogin(targetEmail, false);
      token = loginRes.accessToken;
    }

    if (!token) {
      throw new Error(
        'Akun Google Drive belum terhubung atau sesi kedaluwarsa. Silakan sambungkan Google Drive terlebih dahulu.'
      );
    }

    return executeDriveApiWithAutoRefresh(
      async (tok) => fn(tok),
      {
        actionName,
        interactiveIfRequired: true,
        targetEmail,
      }
    );
  }

  public async ensureRootFolder(): Promise<{ id: string; url: string }> {
    return this.withDriveToken('Siapkan Folder Pinjaman Google Drive', async (token) => {
      const folderId = await getOrCreateNestedFolder(token, [LOAN_DRIVE_ROOT_FOLDER]);
      return {
        id: folderId,
        url: `https://drive.google.com/drive/folders/${folderId}`,
      };
    });
  }

  public async uploadLoan(loan: EmployeeLoan): Promise<LoanDriveUploadResult> {
    try {
      const pdfBlob = await generateEmployeeLoanPdfBlob(loan);

      let d = new Date();
      if (loan.tanggalPermohonan) {
        const parts = loan.tanggalPermohonan.split('T')[0].split('-');
        if (parts.length === 3) {
          d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
          d = new Date(loan.tanggalPermohonan);
        }
      }
      if (isNaN(d.getTime())) d = new Date();

      const yearStr = String(d.getFullYear());
      const monthIdx = d.getMonth();
      const monthFolder = `${String(monthIdx + 1).padStart(2, '0')} - ${MONTH_NAMES_ID[monthIdx]}`;
      const folderHierarchy = [LOAN_DRIVE_ROOT_FOLDER, yearStr, monthFolder];
      const folderPath = folderHierarchy.join('/');

      const safeNo = (loan.nomorPinjaman || loan.id || 'PINJAMAN')
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_');
      const safeName = (loan.namaKaryawan || 'Karyawan')
        .replace(/[\/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 40);

      const pdfFileName = `${safeNo}_${safeName}.pdf`;
      const jsonFileName = `${safeNo}_${safeName}.json`;

      const uploaded = await this.withDriveToken('Unggah Formulir Pinjaman ke Google Drive', async (token) => {
        const folderId = await getOrCreateNestedFolder(token, folderHierarchy);
        const pdfRes = await uploadFileToDrive(token, folderId, pdfFileName, pdfBlob);

        try {
          const jsonPayload = {
            archiveType: 'employee_loan_nmsa',
            archivedAt: new Date().toISOString(),
            loan,
            folderPath,
          };
          const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], {
            type: 'application/json',
          });
          await uploadFileToDrive(token, folderId, jsonFileName, jsonBlob);
        } catch (jsonErr) {
          console.warn('Notice upload JSON companion pinjaman:', jsonErr);
        }

        return {
          fileId: pdfRes.id,
          url: pdfRes.webViewLink,
          folderId,
        };
      });

      return {
        success: true,
        fileId: uploaded.fileId,
        url: uploaded.url,
        folderId: uploaded.folderId,
        folderPath,
        fileName: pdfFileName,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Gagal mengunggah formulir pinjaman ke Google Drive.',
      };
    }
  }

  public async uploadAllLoans(
    loans: EmployeeLoan[],
    onProgress?: (current: number, total: number, loan: EmployeeLoan) => void
  ): Promise<{
    success: boolean;
    totalUploaded: number;
    failed: number;
    results: Array<{ loanId: string; result: LoanDriveUploadResult }>;
  }> {
    const results: Array<{ loanId: string; result: LoanDriveUploadResult }> = [];
    let totalUploaded = 0;
    let failed = 0;

    for (let i = 0; i < loans.length; i++) {
      const loan = loans[i];
      if (onProgress) onProgress(i + 1, loans.length, loan);
      const res = await this.uploadLoan(loan);
      results.push({ loanId: loan.id, result: res });
      if (res.success) totalUploaded++;
      else failed++;
    }

    return {
      success: totalUploaded > 0,
      totalUploaded,
      failed,
      results,
    };
  }
}

export const loanGoogleDriveService = new LoanGoogleDriveService();

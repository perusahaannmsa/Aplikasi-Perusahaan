/**
 * Google Drive Dedicated Storage Engine for NMSA PPh 23, Bukti Potong & Master NPWP
 * Root folder: PPH23-CORETAX-NMSA / [Tahun] / [Periode]
 */

import {
  getOrCreateNestedFolder,
  uploadFileToDrive,
} from '../lib/googleWorkspaceAbsen';
import {
  executeDriveApiWithAutoRefresh,
  getActiveGoogleDriveAccount,
  getMasterDriveEmail,
  triggerGoogleDriveAutoRefresh,
} from '../firebase';
import { NpwpRecord, Submission } from '../types';

export const PPH_DRIVE_ROOT_FOLDER = 'PPH23-CORETAX-NMSA';

export interface PphDriveResult {
  success: boolean;
  fileId?: string;
  url?: string;
  folderId?: string;
  folderUrl?: string;
  folderPath?: string;
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

const resolvePeriodHierarchy = (periodKey?: string, fallbackDateStr?: string): string[] => {
  if (periodKey && periodKey !== 'All' && /^\d{4}-\d{2}$/.test(periodKey)) {
    const [yr, mo] = periodKey.split('-');
    const idx = Math.max(0, Math.min(11, parseInt(mo, 10) - 1));
    return [PPH_DRIVE_ROOT_FOLDER, yr, `${mo} - ${MONTH_NAMES_ID[idx]}`];
  }

  if (fallbackDateStr) {
    const parts = fallbackDateStr.split('T')[0].split('-');
    if (parts.length >= 2) {
      const yr = parts[0];
      const mo = parts[1].padStart(2, '0');
      const idx = Math.max(0, Math.min(11, parseInt(mo, 10) - 1));
      return [PPH_DRIVE_ROOT_FOLDER, yr, `${mo} - ${MONTH_NAMES_ID[idx]}`];
    }
  }

  const now = new Date();
  const yr = String(now.getFullYear());
  if (periodKey === 'All') {
    return [PPH_DRIVE_ROOT_FOLDER, yr, 'Semua_Periode'];
  }
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  return [PPH_DRIVE_ROOT_FOLDER, yr, `${mo} - ${MONTH_NAMES_ID[now.getMonth()]}`];
};

export class PphGoogleDriveService {
  private async withDriveToken<T>(actionName: string, fn: (token: string) => Promise<T>): Promise<T> {
    const activeAccount = getActiveGoogleDriveAccount();
    const targetEmail = activeAccount?.email || getMasterDriveEmail();

    await triggerGoogleDriveAutoRefresh('pph-drive-access', false, false).catch(() => null);

    return executeDriveApiWithAutoRefresh(
      async (tok) => fn(tok),
      {
        actionName,
        interactiveIfRequired: true,
        targetEmail,
      }
    );
  }

  public async archivePph23Recap(params: {
    periodKey: string;
    periodLabel: string;
    invoices: Submission[];
    npwpRecords: NpwpRecord[];
    getPphDetails: (sub: Submission) => {
      dpp: number;
      rate: number;
      pphAmount: number;
      netAmount: number;
      hasNpwp: boolean;
      npwpRecord?: NpwpRecord;
    };
  }): Promise<PphDriveResult> {
    try {
      const { periodKey, periodLabel, invoices, npwpRecords, getPphDetails } = params;
      const folderHierarchy = resolvePeriodHierarchy(periodKey);
      const folderPath = folderHierarchy.join('/');
      const safePeriod = (periodKey || 'All').replace(/[^a-zA-Z0-9_-]/g, '_');

      // 1. Generate Coretax CSV
      const headers = [
        'No',
        'Tanggal Transaksi',
        'Nomor Dokumen / Invoice',
        'Vendor / Rekanan',
        'NPWP',
        'Status Pajak',
        'DPP Transaksi (di luar PPN)',
        'Tarif %',
        'PPh Yang Dipotong',
        'Nomor Bukti Potong',
      ];

      const summaryRows = invoices.map((sub, idx) => {
        const details = getPphDetails(sub);
        const npwpNumber = details.npwpRecord?.npwpNumber || sub.vendorNpwp || '';
        const taxStatus = details.npwpRecord?.taxStatus || 'Non-PKP';
        return {
          no: idx + 1,
          id: sub.id,
          tanggal: sub.tanggal,
          docNumber: sub.invoiceNumber || sub.kode || '',
          vendor: sub.dibayarkanKepada || '',
          npwpNumber,
          taxStatus,
          dpp: details.dpp,
          rate: details.rate,
          pphAmount: details.pphAmount,
          netAmount: details.netAmount,
          bupotNumber: sub.bupotNumber || '',
          bupotDriveUrl: sub.bupotDriveUrl || '',
        };
      });

      const csvLines = summaryRows.map((r) =>
        [
          r.no,
          `"${r.tanggal || ''}"`,
          `"${r.docNumber.replace(/"/g, '""')}"`,
          `"${r.vendor.replace(/"/g, '""')}"`,
          `"${r.npwpNumber.replace(/"/g, '""')}"`,
          `"${r.taxStatus}"`,
          r.dpp,
          `"${r.rate}%"`,
          -r.pphAmount,
          `"${r.bupotNumber.replace(/"/g, '""')}"`,
        ].join(',')
      );

      const csvContent = '\uFEFF' + [headers.join(','), ...csvLines].join('\n');
      const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const csvFileName = `Rekap_PPh23_Coretax_${safePeriod}.csv`;

      // 2. Generate structured JSON backup (invoices PPh + master NPWP)
      const jsonPayload = {
        archiveType: 'pph23_coretax_dan_npwp_nmsa',
        archivedAt: new Date().toISOString(),
        periodKey,
        periodLabel,
        totalInvoices: summaryRows.length,
        totalNpwpRecords: npwpRecords.length,
        invoicesSummary: summaryRows,
        npwpRecords,
      };
      const jsonBlob = new Blob([JSON.stringify(jsonPayload, null, 2)], {
        type: 'application/json',
      });
      const jsonFileName = `Master_PPh23_Dan_NPWP_${safePeriod}.json`;

      const uploaded = await this.withDriveToken('Arsipkan Rekap PPh 23 & NPWP ke Google Drive', async (token) => {
        const folderId = await getOrCreateNestedFolder(token, folderHierarchy);
        const csvRes = await uploadFileToDrive(token, folderId, csvFileName, csvBlob);
        await uploadFileToDrive(token, folderId, jsonFileName, jsonBlob);
        return {
          fileId: csvRes.id,
          url: csvRes.webViewLink,
          folderId,
          folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        };
      });

      return {
        success: true,
        fileId: uploaded.fileId,
        url: uploaded.url,
        folderId: uploaded.folderId,
        folderUrl: uploaded.folderUrl,
        folderPath,
        fileName: csvFileName,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Gagal mengarsipkan Rekap PPh 23 ke Google Drive.',
      };
    }
  }

  public async uploadBupotFile(sub: Submission, file: File): Promise<PphDriveResult> {
    try {
      const baseHierarchy = resolvePeriodHierarchy(undefined, sub.tanggal);
      const folderHierarchy = [...baseHierarchy, 'Bukti_Potong'];
      const folderPath = folderHierarchy.join('/');

      const ext = file.name.includes('.') ? file.name.split('.').pop() || 'pdf' : 'pdf';
      const safeDoc = (sub.invoiceNumber || sub.kode || sub.id || 'INV')
        .replace(/[\/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, '_');
      const safeVendor = (sub.dibayarkanKepada || 'Vendor')
        .replace(/[\/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 35);
      const fileName = `Bupot_${safeDoc}_${safeVendor}.${ext}`;

      const uploaded = await this.withDriveToken('Unggah Bukti Potong PPh 23 ke Google Drive', async (token) => {
        const folderId = await getOrCreateNestedFolder(token, folderHierarchy);
        const res = await uploadFileToDrive(token, folderId, fileName, file);
        return {
          fileId: res.id,
          url: res.webViewLink,
          folderId,
          folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        };
      });

      return {
        success: true,
        fileId: uploaded.fileId,
        url: uploaded.url,
        folderId: uploaded.folderId,
        folderUrl: uploaded.folderUrl,
        folderPath,
        fileName,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Gagal mengunggah file Bukti Potong ke Google Drive.',
      };
    }
  }
}

export const pphGoogleDriveService = new PphGoogleDriveService();

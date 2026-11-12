import { executeDriveApiWithAutoRefresh, deleteGoogleDriveFile } from '../firebase';
import { Submission } from '../types';
import { getStandardDriveFolderName, getLegacyDriveFolderName } from '../utils';

export interface DriveFolderInfo {
  id: string;
  name: string;
  parents?: string[];
  modifiedTime?: string;
  webViewLink?: string;
  extractedKode?: string;
  voucherNumber?: string;
  isOrphaned?: boolean;
}

/**
 * Ekstrak ID file Google Drive dari URL (format /file/d/ID atau ?id=ID)
 */
const extractDriveIdFromUrl = (url?: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return null;
};

/**
 * Ekstrak nomor voucher atau sequence numerik dari kode / nama folder
 * Contoh: "BKK-NMSA/VII/26/1088" -> "1088"
 * Contoh: "BKK-NMSA-VII-26-1088 - Pembayaran-Biaya..." -> "1088"
 */
export const extractVoucherNumber = (str?: string): string | null => {
  if (!str) return null;
  const match = str.match(/(\d{3,6})(?:\s*[-+]|\s*$|\s*\))/);
  if (match && match[1]) return match[1];
  const allNums = str.match(/\d{3,6}/g);
  if (allNums && allNums.length > 0) return allNums[allNums.length - 1];
  return null;
};

/**
 * Mencari folder Google Drive yang sesuai dengan data pengajuan transaksi (Submission)
 */
export const findDriveFolderForSubmission = async (
  sub: Partial<Submission>
): Promise<{ id: string; name: string } | null> => {
  return executeDriveApiWithAutoRefresh(async (token) => {
    // 1. Cek langsung via sub.googleDriveFolderId jika sudah tersimpan
    if (sub.googleDriveFolderId) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${sub.googleDriveFolderId}?supportsAllDrives=true&fields=id,name,mimeType,trashed`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.mimeType === 'application/vnd.google-apps.folder' && !data.trashed) {
            return { id: data.id, name: data.name };
          }
        }
      } catch (_) {}
    }

    // 2. Cek via parent dari file lampiran yang sudah terunggah ke Drive (F1, F2, Bukti Bayar)
    const fileUrls: string[] = [];
    if (Array.isArray(sub.googleDriveFiles)) {
      sub.googleDriveFiles.forEach(f => {
        if (f.url) fileUrls.push(f.url);
      });
    }
    if (sub.buktiPembayaran?.url) fileUrls.push(sub.buktiPembayaran.url);
    if (sub.googleDriveFileUrl) fileUrls.push(sub.googleDriveFileUrl);

    for (const url of fileUrls) {
      const driveFileId = extractDriveIdFromUrl(url);
      if (driveFileId) {
        try {
          const fileRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${driveFileId}?supportsAllDrives=true&fields=parents`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (fileRes.ok) {
            const fileData = await fileRes.json();
            if (fileData.parents && fileData.parents.length > 0) {
              const parentId = fileData.parents[0];
              const parentRes = await fetch(
                `https://www.googleapis.com/drive/v3/files/${parentId}?supportsAllDrives=true&fields=id,name,mimeType,trashed`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (parentRes.ok) {
                const parentData = await parentRes.json();
                if (parentData && parentData.mimeType === 'application/vnd.google-apps.folder' && !parentData.trashed) {
                  return { id: parentData.id, name: parentData.name };
                }
              }
            }
          }
        } catch (_) {}
      }
    }

    // 3. Cari berdasarkan nama folder standar dan kode voucher
    const standardName = getStandardDriveFolderName(sub as any);
    const legacyName = getLegacyDriveFolderName(sub as any);
    const cleanKode = (sub.kode || '').trim().replace(/[\/\\?%*:|"<>.]/g, '-');
    const vNum = extractVoucherNumber(sub.kode);

    // 3A. Cari exact standard name
    if (standardName) {
      const qStd = `name = '${standardName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const resStd = await fetch(
        `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(qStd)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resStd.ok) {
        const dStd = await resStd.json();
        if (dStd.files && dStd.files.length > 0) {
          return { id: dStd.files[0].id, name: dStd.files[0].name };
        }
      }
    }

    // 3B. Cari berdasarkan clean kode voucher (contoh: BKK-NMSA-VII-26-1088)
    if (cleanKode && cleanKode.length >= 4 && cleanKode.toUpperCase() !== 'HO') {
      const qKode = `name contains '${cleanKode.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const resKode = await fetch(
        `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(qKode)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resKode.ok) {
        const dKode = await resKode.json();
        if (dKode.files && dKode.files.length > 0) {
          return { id: dKode.files[0].id, name: dKode.files[0].name };
        }
      }
    }

    // 3C. Cari berdasarkan nomor voucher numerik (contoh: 1088)
    if (vNum && vNum.length >= 3) {
      const qNum = `name contains '${vNum}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const resNum = await fetch(
        `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(qNum)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resNum.ok) {
        const dNum = await resNum.json();
        if (dNum.files && dNum.files.length > 0) {
          // Cari folder yang juga mengandung nama penerima atau cleanKode jika ada
          const penerima = (sub.dibayarkanKepada || '').toLowerCase();
          const matched = dNum.files.find((f: any) => {
            const fLower = (f.name || '').toLowerCase();
            return fLower.includes(vNum) && (penerima ? fLower.includes(penerima.substring(0, 4)) : true);
          }) || dNum.files[0];
          return { id: matched.id, name: matched.name };
        }
      }
    }

    // 3D. Fallback nama legacy
    if (legacyName) {
      const qLeg = `name = '${legacyName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const resLeg = await fetch(
        `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(qLeg)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resLeg.ok) {
        const dLeg = await resLeg.json();
        if (dLeg.files && dLeg.files.length > 0) {
          return { id: dLeg.files[0].id, name: dLeg.files[0].name };
        }
      }
    }

    return null;
  }, { actionName: `findDriveFolderForSubmission(${sub.kode || sub.id})` });
};

/**
 * Menghapus folder Google Drive untuk transaksi pengajuan tertentu (otomatis saat transaksi dihapus)
 */
export const deleteSubmissionDriveFolder = async (
  sub: Partial<Submission>
): Promise<{ success: boolean; folderName?: string; message: string }> => {
  try {
    const folder = await findDriveFolderForSubmission(sub);
    if (!folder) {
      return {
        success: false,
        message: 'Folder Google Drive tidak ditemukan atau belum pernah diarsipkan.'
      };
    }

    console.log(`[Google Drive Cleaner] Menghapus folder Drive: "${folder.name}" (${folder.id})`);
    await deleteGoogleDriveFile(folder.id);

    return {
      success: true,
      folderName: folder.name,
      message: `Folder Google Drive "${folder.name}" berhasil dihapus.`
    };
  } catch (err: any) {
    console.warn('[Google Drive Cleaner] Gagal menghapus folder Google Drive:', err);
    return {
      success: false,
      message: `Gagal menghapus folder Google Drive: ${err?.message || err}`
    };
  }
};

/**
 * Mencari folder Google Drive secara interaktif berdasarkan kata kunci (contoh: "1088", "Rudiharto")
 */
export const searchDriveFoldersByKeyword = async (
  keyword: string
): Promise<DriveFolderInfo[]> => {
  const cleanKey = keyword.trim().replace(/['\\]/g, '');
  if (!cleanKey) return [];

  return executeDriveApiWithAutoRefresh(async (token) => {
    const query = `name contains '${cleanKey}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(query)}&fields=files(id,name,parents,modifiedTime,webViewLink)&pageSize=30`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.status === 401) throw new Error('UNAUTHORIZED_401');
    if (!res.ok) return [];

    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      parents: f.parents,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      voucherNumber: extractVoucherNumber(f.name) || undefined
    }));
  }, { actionName: `searchDriveFoldersByKeyword(${cleanKey})` });
};

/**
 * Memindai seluruh folder Voucher-APP di Google Drive dan mendeteksi folder-folder
 * yang transaksinya SUDAH DIHAPUS dari aplikasi (seperti folder nomor 1088).
 */
export const findOrphanedDriveFolders = async (
  activeSubmissions: Submission[],
  onProgress?: (msg: string) => void
): Promise<DriveFolderInfo[]> => {
  return executeDriveApiWithAutoRefresh(async (token) => {
    onProgress?.('Mencari folder utama Voucher-APP di Google Drive...');

    // 1. Dapatkan folder Voucher-APP
    const rootQuery = `name = 'Voucher-APP' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const rootRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(rootQuery)}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!rootRes.ok) return [];
    const rootData = await rootRes.json();
    if (!rootData.files || rootData.files.length === 0) return [];
    const voucherAppId = rootData.files[0].id;

    // Himpun seluruh nomor voucher dan kode transaksi aktif di aplikasi
    const activeKodes = new Set<string>();
    const activeNumbers = new Set<string>();
    activeSubmissions.forEach(sub => {
      if (sub.kode) {
        const clean = sub.kode.trim().toUpperCase().replace(/[\/\\?%*:|"<>.]/g, '-');
        activeKodes.add(clean);
        const vNum = extractVoucherNumber(sub.kode);
        if (vNum) activeNumbers.add(vNum);
      }
    });

    onProgress?.(`Memindai folder transaksi di Google Drive... (${activeSubmissions.length} voucher aktif terdaftar di aplikasi)`);

    // 2. Cari semua folder transaksi di dalam Google Drive (yang diawali BKK, BKM, INV, atau mengandung 'Pembayaran-')
    // Query efisien: cari semua folder yang namanya mengandung 'Pembayaran-' atau 'BKK-'
    const folderQueries = [
      `mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains 'Pembayaran-'`,
      `mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains 'BKK-'`
    ];

    const collectedFoldersMap = new Map<string, any>();

    for (const q of folderQueries) {
      try {
        let pageToken = '';
        do {
          const url: string = `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,parents,modifiedTime,webViewLink)&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) break;
          const data = await res.json();
          (data.files || []).forEach((f: any) => {
            collectedFoldersMap.set(f.id, f);
          });
          pageToken = data.nextPageToken || '';
        } while (pageToken);
      } catch (_) {}
    }

    const allDriveFolders = Array.from(collectedFoldersMap.values());
    onProgress?.(`Ditemukan ${allDriveFolders.length} folder transaksi di Google Drive. Memeriksa status keberadaan voucher...`);

    const orphanedList: DriveFolderInfo[] = [];

    for (const f of allDriveFolders) {
      const folderName = f.name || '';
      const vNum = extractVoucherNumber(folderName);
      
      // Ambil kode voucher dari nama folder jika ada (e.g. BKK-NMSA-VII-26-1088)
      const kodeMatch = folderName.match(/([A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-\d+-\d+)/i) ||
                        folderName.match(/([A-Z0-9]+-[A-Z0-9]+-\d+)/i);
      const extractedKode = kodeMatch ? kodeMatch[1].toUpperCase() : undefined;

      let isFoundInActive = false;

      // Cek apakah kode cocok dengan voucher aktif
      if (extractedKode && activeKodes.has(extractedKode)) {
        isFoundInActive = true;
      }

      // Cek apakah nomor voucher (seperti 1088) ada di daftar voucher aktif
      if (vNum && activeNumbers.has(vNum)) {
        isFoundInActive = true;
      }

      // Jika tidak ditemukan di voucher aktif, maka ini folder transaksi terhapus (orphaned)!
      if (!isFoundInActive) {
        orphanedList.push({
          id: f.id,
          name: f.name,
          parents: f.parents,
          modifiedTime: f.modifiedTime,
          webViewLink: f.webViewLink,
          extractedKode,
          voucherNumber: vNum || undefined,
          isOrphaned: true
        });
      }
    }

    onProgress?.(`Selesai! Ditemukan ${orphanedList.length} folder transaksi terhapus yang masih tertinggal di Google Drive.`);
    return orphanedList;
  }, { actionName: 'findOrphanedDriveFolders' });
};

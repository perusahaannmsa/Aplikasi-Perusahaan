import { executeDriveApiWithAutoRefresh, deleteGoogleDriveFile, ensureValidDriveToken, getStoredGoogleDriveToken } from '../firebase';
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
 * Ekstrak ID file Google Drive dari URL (format /file/d/ID, /folders/ID, atau ?id=ID)
 */
const extractDriveIdFromUrl = (url?: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];
  const fMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fMatch && fMatch[1]) return fMatch[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  return null;
};

/**
 * Hindari menghapus folder struktural seperti Voucher-APP, Tahun (2026), Bulan (7. Juli), atau Tanggal (3)
 */
const isStructuralFolderName = (name?: string): boolean => {
  const n = (name || '').trim();
  if (!n) return true;
  const lower = n.toLowerCase();
  if (lower === 'voucher-app' || lower === 'my drive' || lower === 'drive saya') return true;
  if (/^20\d{2}$/.test(n)) return true;
  if (/^\d{1,2}$/.test(n)) return true;
  if (/^\d{1,2}\.\s*(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)$/i.test(n)) return true;
  return false;
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

const collectFileUrls = (sub: Partial<Submission>): string[] => {
  const urls: string[] = [];
  if (Array.isArray(sub.googleDriveFiles)) {
    sub.googleDriveFiles.forEach((f) => {
      if (f?.url) urls.push(f.url);
    });
  }
  if (sub.buktiPembayaran?.url) urls.push(sub.buktiPembayaran.url);
  if (sub.googleDriveFileUrl) urls.push(sub.googleDriveFileUrl);
  return Array.from(new Set(urls));
};

/**
 * Mencari seluruh kandidat folder Google Drive yang sesuai dengan data transaksi pengajuan (Submission)
 */
export const findAllDriveFoldersForSubmission = async (
  sub: Partial<Submission>
): Promise<{ id: string; name: string }[]> => {
  return executeDriveApiWithAutoRefresh(async (token) => {
    const matchedMap = new Map<string, { id: string; name: string }>();

    // 1. Cek langsung via sub.googleDriveFolderId jika sudah tersimpan
    if (sub.googleDriveFolderId) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${sub.googleDriveFolderId}?supportsAllDrives=true&fields=id,name,mimeType,trashed`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.status === 401) throw new Error('UNAUTHORIZED_401');
        if (res.ok) {
          const data = await res.json();
          if (data && data.mimeType === 'application/vnd.google-apps.folder' && !data.trashed && !isStructuralFolderName(data.name)) {
            matchedMap.set(data.id, { id: data.id, name: data.name });
          }
        }
      } catch (e: any) {
        if (String(e?.message).includes('UNAUTHORIZED_401')) throw e;
      }
    }

    // 2. Cek via parent dari file lampiran yang sudah terunggah ke Drive (F1, F2, Bukti Bayar)
    const fileUrls = collectFileUrls(sub);
    for (const url of fileUrls) {
      const driveFileId = extractDriveIdFromUrl(url);
      if (driveFileId) {
        try {
          const fileRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${driveFileId}?supportsAllDrives=true&fields=id,name,mimeType,parents,trashed`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (fileRes.status === 401) throw new Error('UNAUTHORIZED_401');
          if (fileRes.ok) {
            const fileData = await fileRes.json();
            if (fileData?.mimeType === 'application/vnd.google-apps.folder' && !fileData.trashed && !isStructuralFolderName(fileData.name)) {
              matchedMap.set(fileData.id, { id: fileData.id, name: fileData.name });
            } else if (Array.isArray(fileData.parents) && fileData.parents.length > 0) {
              for (const parentId of fileData.parents) {
                const parentRes = await fetch(
                  `https://www.googleapis.com/drive/v3/files/${parentId}?supportsAllDrives=true&fields=id,name,mimeType,trashed`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                if (parentRes.ok) {
                  const parentData = await parentRes.json();
                  if (parentData && parentData.mimeType === 'application/vnd.google-apps.folder' && !parentData.trashed && !isStructuralFolderName(parentData.name)) {
                    matchedMap.set(parentData.id, { id: parentData.id, name: parentData.name });
                  }
                }
              }
            }
          }
        } catch (e: any) {
          if (String(e?.message).includes('UNAUTHORIZED_401')) throw e;
        }
      }
    }

    // 3. Cari berdasarkan nama folder standar dan kode voucher
    const standardName = getStandardDriveFolderName(sub as any);
    const legacyName = getLegacyDriveFolderName(sub as any);
    const cleanKode = (sub.kode || '').trim().replace(/[\/\\?%*:|"<>.]/g, '-');
    const vNum = extractVoucherNumber(sub.kode);
    const penerimaPrefix = (sub.dibayarkanKepada || '').trim().toLowerCase().slice(0, 5);

    // 3A. Cari exact standard name
    if (standardName && !isStructuralFolderName(standardName)) {
      const qStd = `name = '${standardName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const resStd = await fetch(
        `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(qStd)}&fields=files(id,name)&pageSize=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resStd.status === 401) throw new Error('UNAUTHORIZED_401');
      if (resStd.ok) {
        const dStd = await resStd.json();
        (dStd.files || []).forEach((f: any) => {
          if (f?.id && !isStructuralFolderName(f.name)) matchedMap.set(f.id, { id: f.id, name: f.name });
        });
      }
    }

    // 3B. Cari berdasarkan clean kode voucher (contoh: BKK-NMSA-VII-26-1088)
    if (cleanKode && cleanKode.length >= 4 && cleanKode.toUpperCase() !== 'HO') {
      const qKode = `name contains '${cleanKode.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const resKode = await fetch(
        `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(qKode)}&fields=files(id,name)&pageSize=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resKode.status === 401) throw new Error('UNAUTHORIZED_401');
      if (resKode.ok) {
        const dKode = await resKode.json();
        (dKode.files || []).forEach((f: any) => {
          if (f?.id && !isStructuralFolderName(f.name)) matchedMap.set(f.id, { id: f.id, name: f.name });
        });
      }
    }

    // 3C. Cari berdasarkan nomor voucher numerik (contoh: 1088)
    if (vNum && vNum.length >= 3) {
      const qNum = `name contains '${vNum}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const resNum = await fetch(
        `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(qNum)}&fields=files(id,name)&pageSize=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resNum.status === 401) throw new Error('UNAUTHORIZED_401');
      if (resNum.ok) {
        const dNum = await resNum.json();
        const numBoundary = new RegExp(`(^|[^0-9])${vNum}([^0-9]|$)`);
        (dNum.files || []).forEach((f: any) => {
          if (!f?.id || isStructuralFolderName(f.name)) return;
          const fLower = (f.name || '').toLowerCase();
          if (!numBoundary.test(fLower)) return;
          const matchesKode = cleanKode && cleanKode.length >= 4 && fLower.includes(cleanKode.toLowerCase());
          const matchesRecipient = penerimaPrefix.length >= 3 && fLower.includes(penerimaPrefix);
          const matchesTxPattern = fLower.includes('pembayaran-') && (fLower.includes('bkk-') || fLower.includes('bkm-') || fLower.includes('inv-'));
          if (matchesKode || matchesRecipient || matchesTxPattern) {
            matchedMap.set(f.id, { id: f.id, name: f.name });
          }
        });
      }
    }

    // 3D. Fallback nama legacy
    if (legacyName && !isStructuralFolderName(legacyName)) {
      const qLeg = `name = '${legacyName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const resLeg = await fetch(
        `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(qLeg)}&fields=files(id,name)&pageSize=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resLeg.status === 401) throw new Error('UNAUTHORIZED_401');
      if (resLeg.ok) {
        const dLeg = await resLeg.json();
        (dLeg.files || []).forEach((f: any) => {
          if (f?.id && !isStructuralFolderName(f.name)) matchedMap.set(f.id, { id: f.id, name: f.name });
        });
      }
    }

    return Array.from(matchedMap.values());
  }, {
    actionName: `findAllDriveFoldersForSubmission(${sub.kode || sub.id})`,
    interactiveIfRequired: false,
    maxRetries: 1,
  });
};

/**
 * Mencari folder Google Drive utama yang sesuai dengan data pengajuan transaksi (Submission)
 */
export const findDriveFolderForSubmission = async (
  sub: Partial<Submission>
): Promise<{ id: string; name: string } | null> => {
  const list = await findAllDriveFoldersForSubmission(sub);
  return list.length > 0 ? list[0] : null;
};

/**
 * Menghapus folder Google Drive untuk transaksi pengajuan tertentu (otomatis saat transaksi dihapus)
 * Menggunakan token browser aktif terlebih dahulu (non-blocking), lalu fallback ke endpoint server (OAuth + Service Account).
 */
export const deleteSubmissionDriveFolder = async (
  sub: Partial<Submission>
): Promise<{ success: boolean; folderName?: string; needsAuth?: boolean; message: string }> => {
  const deletedNames: string[] = [];
  let clientNeedsAuth = false;

  // 1. Coba langsung dari client dengan token yang sudah aktif (tanpa memblokir UI dengan pop-up)
  try {
    const folders = await findAllDriveFoldersForSubmission(sub);
    for (const folder of folders) {
      try {
        console.log(`[Google Drive Cleaner] Menghapus folder Drive: "${folder.name}" (${folder.id})`);
        await deleteGoogleDriveFile(folder.id);
        deletedNames.push(folder.name);
      } catch (delErr: any) {
        console.warn(`[Google Drive Cleaner] Gagal hapus via client untuk "${folder.name}":`, delErr?.message || delErr);
      }
    }
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes('belum terhubung') || msg.includes('UNAUTHORIZED') || msg.includes('401')) {
      clientNeedsAuth = true;
    }
    console.warn('[Google Drive Cleaner] Client lookup fallback ke server:', msg);
  }

  if (deletedNames.length > 0) {
    const label = deletedNames.join(', ');
    return {
      success: true,
      folderName: label,
      message: `Folder Google Drive "${deletedNames[0]}"${deletedNames.length > 1 ? ` (+${deletedNames.length - 1} folder duplikat)` : ''} berhasil dihapus.`
    };
  }

  // 2. Fallback ke server endpoint (mencoba token user + kredensial Service Account server)
  try {
    const token = (await ensureValidDriveToken(false).catch(() => null)) || getStoredGoogleDriveToken() || '';
    const standardName = getStandardDriveFolderName(sub as any);
    const legacyName = getLegacyDriveFolderName(sub as any);
    const res = await fetch('/api/drive/delete-submission-folder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        accessToken: token || undefined,
        submission: {
          ...sub,
          voucherNumber: extractVoucherNumber(sub.kode) || undefined,
          fileUrls: collectFileUrls(sub),
          folderNameCandidates: [standardName, legacyName].filter(Boolean),
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success) {
        return {
          success: true,
          folderName: data.folderName,
          message: data.message || `Folder Google Drive "${data.folderName || ''}" berhasil dihapus.`
        };
      }
      return {
        success: false,
        needsAuth: Boolean(data?.needsAuth || clientNeedsAuth),
        message: data?.message || 'Folder Google Drive tidak ditemukan atau belum pernah diarsipkan.'
      };
    }
  } catch (serverErr: any) {
    console.warn('[Google Drive Cleaner] Server fallback error:', serverErr?.message || serverErr);
  }

  return {
    success: false,
    needsAuth: clientNeedsAuth,
    message: clientNeedsAuth
      ? 'Sesi Google Drive belum terhubung atau izin penuh Drive belum aktif. Gunakan Pembersih Folder Drive bila folder masih tertinggal.'
      : 'Folder Google Drive tidak ditemukan atau belum pernah diarsipkan.'
  };
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

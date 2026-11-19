import { ensureValidDriveToken, getStoredGoogleDriveToken, executeDriveApiWithAutoRefresh } from '../firebase';
import { Submission } from '../types';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
}

export interface DeduplicateResult {
  scannedFolders: number;
  duplicatesRemoved: number;
  renamedFiles: number;
  updatedSubmissions: number;
  details: string[];
}

/**
 * Parses a file name to detect copy patterns like (1), (2), (Copy), copy of, etc.
 */
export const normalizeFileNameForDeduplication = (fileName: string): { baseName: string; isCopyPattern: boolean; ext: string } => {
  const lastDot = fileName.lastIndexOf('.');
  const nameWithoutExt = lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;
  const ext = lastDot !== -1 ? fileName.substring(lastDot) : '';

  // Patterns: (1), (2), [1], - Copy, - Salinan, (Copy), Copy of ...
  const copyRegex = /\s*(\(\d+\)|\[\d+\]|\(Copy\)|\(Salinan\)|\s*-\s*Copy|\s*-\s*Salinan)$/i;
  let clean = nameWithoutExt.trim();
  let isCopy = false;

  if (clean.toLowerCase().startsWith('copy of ')) {
    clean = clean.substring(8).trim();
    isCopy = true;
  }

  while (copyRegex.test(clean)) {
    clean = clean.replace(copyRegex, '').trim();
    isCopy = true;
  }

  return {
    baseName: clean + ext,
    isCopyPattern: isCopy,
    ext
  };
};

/**
 * Deduplicates files inside a single Google Drive folder.
 * Keeps the newest/cleanest file and moves duplicates to Trash.
 */
export const deduplicateFolderFiles = async (
  folderId: string,
  token: string,
  onLog?: (msg: string) => void
): Promise<{ keptFiles: DriveFileInfo[]; trashedCount: number; renamedCount: number }> => {
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and trashed = false`
  )}&fields=files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,webContentLink)&pageSize=1000`;

  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    return { keptFiles: [], trashedCount: 0, renamedCount: 0 };
  }

  const data = await res.json();
  const allFiles: DriveFileInfo[] = (data.files || []).filter(
    (f: any) => f.mimeType !== 'application/vnd.google-apps.folder'
  );

  if (allFiles.length <= 1) {
    return { keptFiles: allFiles, trashedCount: 0, renamedCount: 0 };
  }

  // Group files by normalized baseName
  const groups = new Map<string, (DriveFileInfo & { isCopyPattern: boolean; timeMs: number })[]>();
  for (const file of allFiles) {
    const { baseName, isCopyPattern } = normalizeFileNameForDeduplication(file.name);
    const key = baseName.toLowerCase();
    const timeMs = new Date(file.modifiedTime || file.createdTime || 0).getTime();
    const item = { ...file, isCopyPattern, timeMs };

    if (!groups.has(key)) {
      groups.set(key, [item]);
    } else {
      groups.get(key)!.push(item);
    }
  }

  let trashedCount = 0;
  let renamedCount = 0;
  const finalKept: DriveFileInfo[] = [];

  for (const [baseKey, items] of groups.entries()) {
    if (items.length === 1) {
      finalKept.push(items[0]);
      continue;
    }

    // Sort: 1) clean name without (1) first, 2) newest modified/created time
    items.sort((a, b) => {
      if (a.isCopyPattern !== b.isCopyPattern) {
        return a.isCopyPattern ? 1 : -1;
      }
      return b.timeMs - a.timeMs;
    });

    const primary = items[0];
    const { baseName } = normalizeFileNameForDeduplication(primary.name);

    // If primary was named with copy pattern, rename it to clean baseName
    if (primary.isCopyPattern && primary.name !== baseName) {
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${primary.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: baseName })
        });
        primary.name = baseName;
        renamedCount++;
        if (onLog) onLog(`✓ Merapikan nama file "${primary.name}" menjadi "${baseName}"`);
      } catch (_) {}
    }

    finalKept.push(primary);

    // Trash all duplicates
    for (let i = 1; i < items.length; i++) {
      const dup = items[i];
      try {
        const trashRes = await fetch(`https://www.googleapis.com/drive/v3/files/${dup.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ trashed: true })
        });
        if (trashRes.ok) {
          trashedCount++;
          if (onLog) onLog(`🗑️ Memindahkan file duplikat ke Sampah: "${dup.name}" (${dup.id})`);
        }
      } catch (e) {
        console.warn(`Gagal memindahkan file duplikat ${dup.id} ke sampah:`, e);
      }
    }
  }

  return { keptFiles: finalKept, trashedCount, renamedCount };
};

/**
 * Automatically refreshes and deduplicates Google Drive files across all vouchers.
 * Keeps app and Google Drive perfectly in sync.
 */
export const runAutoRefreshAndDeduplicateDrive = async (
  submissions: Submission[],
  onProgress?: (msg: string) => void
): Promise<{ result: DeduplicateResult; updatedSubmissionsList: Submission[] }> => {
  const token = await ensureValidDriveToken();
  if (!token) {
    return {
      result: {
        scannedFolders: 0,
        duplicatesRemoved: 0,
        renamedFiles: 0,
        updatedSubmissions: 0,
        details: ['Google Drive belum terhubung atau token tidak tersedia.']
      },
      updatedSubmissionsList: submissions
    };
  }

  const result: DeduplicateResult = {
    scannedFolders: 0,
    duplicatesRemoved: 0,
    renamedFiles: 0,
    updatedSubmissions: 0,
    details: []
  };

  const updatedList = [...submissions];
  let hasModifications = false;

  if (onProgress) onProgress('Memulai sinkronisasi & pemindaian file duplikat di Google Drive...');

  // 1. Process vouchers with linked googleDriveFolderId or attachments
  const vouchersWithDrive = updatedList.filter(s => s.googleDriveFolderId || (s.googleDriveFiles && s.googleDriveFiles.length > 0));
  
  for (let idx = 0; idx < vouchersWithDrive.length; idx++) {
    const sub = vouchersWithDrive[idx];
    const folderId = sub.googleDriveFolderId;
    if (!folderId) continue;

    result.scannedFolders++;
    if (onProgress && idx % 3 === 0) {
      onProgress(`Memindai Google Drive (${idx + 1}/${vouchersWithDrive.length}): ${sub.kode || sub.id}...`);
    }

    try {
      const { keptFiles, trashedCount, renamedCount } = await deduplicateFolderFiles(folderId, token, (log) => {
        result.details.push(`[${sub.kode || sub.id}] ${log}`);
      });

      result.duplicatesRemoved += trashedCount;
      result.renamedFiles += renamedCount;

      // Synchronize voucher attachment list to keptFiles if any duplicates were removed
      if (trashedCount > 0 || (sub.googleDriveFiles && sub.googleDriveFiles.length > keptFiles.length)) {
        const freshDriveFiles = keptFiles.map(f => {
          const isProof = f.name.toLowerCase().includes('bukti') || f.name.toLowerCase().includes('transfer') || f.name.toLowerCase().includes('bayar');
          const isF1 = f.name.startsWith('F1 -') || f.name === 'F1.pdf';
          const isF2 = f.name.startsWith('F2 -') || f.name === 'F2.pdf';
          return {
            id: f.id,
            name: f.name,
            url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
            isBuktiPembayaran: isProof,
            isF1,
            isF2
          };
        });

        // Update voucher properties
        sub.googleDriveFiles = freshDriveFiles;
        if (freshDriveFiles.length > 0) {
          sub.googleDriveFileUrl = freshDriveFiles[0].url;
          sub.googleDriveFileName = freshDriveFiles[0].name;
        }

        result.updatedSubmissions++;
        hasModifications = true;
      }
    } catch (e: any) {
      console.warn(`Peringatan pemindaian folder voucher ${sub.kode}:`, e);
    }
  }

  // 2. Also scan top-level "Voucher-APP" subfolders if fewer than 5 vouchers had folderIds
  if (result.scannedFolders < 3) {
    try {
      const qVoucher = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='Voucher-APP'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (qVoucher.ok) {
        const vData = await qVoucher.json();
        if (vData.files && vData.files.length > 0) {
          const vId = vData.files[0].id;
          // List company folders inside Voucher-APP
          const compRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q='${vId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (compRes.ok) {
            const compData = await compRes.json();
            for (const cFolder of (compData.files || [])) {
              // Deduplicate files inside company folder
              const { trashedCount, renamedCount } = await deduplicateFolderFiles(cFolder.id, token);
              result.duplicatesRemoved += trashedCount;
              result.renamedFiles += renamedCount;
              result.scannedFolders++;
            }
          }
        }
      }
    } catch (_) {}
  }

  if (hasModifications) {
    try {
      localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(updatedList));
      fetch('/api/shared-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions: updatedList })
      }).catch(() => {});
    } catch (_) {}
  }

  if (onProgress) {
    onProgress(`✓ Sinkronisasi selesai: ${result.duplicatesRemoved} file duplikat dibersihkan dari Google Drive.`);
  }

  return { result, updatedSubmissionsList: updatedList };
};

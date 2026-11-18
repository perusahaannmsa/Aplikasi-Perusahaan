import {
  getConnectedDrives,
  getTokenForRegisteredDriveEmail,
  invalidateDriveToken,
  isStrictlyAuthorizedDriveEmail,
  saveConnectedDrives,
} from '../firebase';

export type DriveModuleKey = 'absen' | 'voucher' | 'memo';

export interface ScopedDriveCategory {
  key: DriveModuleKey;
  label: string;
  folderName: string;
  description: string;
}

export const SCOPED_DRIVE_CATEGORIES: ScopedDriveCategory[] = [
  {
    key: 'absen',
    label: 'Absen Karyawan',
    folderName: 'ABSENSI-NMSA-APP',
    description: 'Laporan absensi harian, uang makan, rekening koran & petty cash lapangan.',
  },
  {
    key: 'voucher',
    label: 'Voucher Keuangan',
    folderName: 'Voucher-APP',
    description: 'Arsip Voucher HO (F1, F2), lampiran invoice, dan bukti transfer pembayaran.',
  },
  {
    key: 'memo',
    label: 'Internal Memo',
    folderName: 'ARSIP-INTERNAL-MEMO-NMSA',
    description: 'Arsip resmi Internal Memo Direksi & dokumen hasil scan tanda tangan.',
  },
];

export const ALLOWED_ROOT_FOLDER_NAMES = new Set(
  SCOPED_DRIVE_CATEGORIES.map((c) => c.folderName)
);

export interface ScopedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
}

export interface ScopedRootFolderStatus {
  category: ScopedDriveCategory;
  exists: boolean;
  folder: ScopedDriveFile | null;
}

export interface RegisteredAccountStorageSnapshot {
  email: string;
  displayName: string;
  photoURL?: string;
  quotaUsed: number;
  quotaLimit: number;
  roots: ScopedRootFolderStatus[];
  allowedFolderIds: Set<string>;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const formatDriveBytes = (bytes?: number | string): string => {
  const num = Number(bytes || 0);
  if (!num || num <= 0 || Number.isNaN(num)) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(num) / Math.log(k)));
  return `${parseFloat((num / Math.pow(k, idx)).toFixed(idx >= 2 ? 2 : 0))} ${units[idx]}`;
};

export const getDriveMimeBadge = (mimeType: string): string => {
  if (mimeType === FOLDER_MIME) return 'Folder';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Gambar';
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'text/csv'
  ) {
    return 'Spreadsheet';
  }
  if (mimeType.includes('document') || mimeType.includes('word')) return 'Dokumen';
  if (mimeType === 'application/json') return 'JSON';
  return 'Berkas';
};

const assertRegisteredAccountAndGetToken = (accountEmail: string): string => {
  const clean = (accountEmail || '').trim().toLowerCase();
  if (!clean || !isStrictlyAuthorizedDriveEmail(clean)) {
    throw new Error(
      `AKUN_TIDAK_TERDAFTAR: Akun '${accountEmail || '-'}' tidak terdaftar di aplikasi. Hanya akun Google yang telah Anda daftarkan yang dapat dibaca.`
    );
  }
  const token = getTokenForRegisteredDriveEmail(clean);
  if (!token) {
    throw new Error(
      `TOKEN_BELUM_AKTIF: Sesi Google Drive untuk akun '${clean}' belum terhubung atau sudah kedaluwarsa. Silakan sambungkan akun ini terlebih dahulu.`
    );
  }
  return token;
};

/**
 * Reads storage metadata and ONLY the 3 allowed root folders (Absen, Voucher, Internal Memo)
 * for a registered account. No other Drive folders or files are queried or returned.
 */
export const loadRegisteredAccountScopedDrive = async (
  accountEmail: string
): Promise<RegisteredAccountStorageSnapshot> => {
  const cleanEmail = (accountEmail || '').trim().toLowerCase();
  const token = assertRegisteredAccountAndGetToken(cleanEmail);

  // 1. Verify token identity & storage quota
  const aboutRes = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName,photoLink),storageQuota(usage,limit)',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (aboutRes.status === 401) {
    invalidateDriveToken(token);
    throw new Error(
      `TOKEN_EXPIRED_401: Token Google Drive untuk '${cleanEmail}' sudah kedaluwarsa. Silakan sambungkan ulang akun ini.`
    );
  }

  let displayName = `Google Drive (${cleanEmail})`;
  let photoURL = '';
  let quotaUsed = 0;
  let quotaLimit = 15 * 1024 * 1024 * 1024;

  if (aboutRes.ok) {
    const aboutData = await aboutRes.json();
    const tokenEmail = (aboutData?.user?.emailAddress || '').trim().toLowerCase();
    if (tokenEmail && !isStrictlyAuthorizedDriveEmail(tokenEmail)) {
      throw new Error(
        `AKUN_TIDAK_TERDAFTAR: Token aktif milik '${tokenEmail}' tidak terdaftar dalam daftar akun aplikasi.`
      );
    }
    if (tokenEmail && tokenEmail !== cleanEmail) {
      throw new Error(
        `AKUN_TIDAK_COCOK: Token yang tersimpan milik '${tokenEmail}', bukan '${cleanEmail}'. Silakan sambungkan ulang akun '${cleanEmail}'.`
      );
    }
    displayName = aboutData?.user?.displayName || displayName;
    photoURL = aboutData?.user?.photoLink || '';
    quotaUsed = parseInt(aboutData?.storageQuota?.usage || '0', 10) || 0;
    quotaLimit = parseInt(aboutData?.storageQuota?.limit || String(quotaLimit), 10) || quotaLimit;

    // Update cached quota metadata on matching connected drive
    try {
      const drives = getConnectedDrives();
      const idx = drives.findIndex((d) => d.email.trim().toLowerCase() === cleanEmail);
      if (idx !== -1) {
        drives[idx] = {
          ...drives[idx],
          displayName,
          photoURL,
          quotaUsed,
          quotaLimit,
          lastChecked: new Date().toISOString(),
          isExpired: false,
        };
        await saveConnectedDrives(drives);
      }
    } catch (_) {}
  }

  // 2. Query ONLY the 3 permitted main folders by exact folder name
  const scopedQuery =
    `mimeType = '${FOLDER_MIME}' and trashed = false and ` +
    `(name = 'ABSENSI-NMSA-APP' or name = 'Voucher-APP' or name = 'ARSIP-INTERNAL-MEMO-NMSA')`;

  const listUrl =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(scopedQuery)}` +
    `&spaces=drive&pageSize=30&orderBy=modifiedTime desc` +
    `&fields=files(id,name,mimeType,modifiedTime,webViewLink,parents)`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (listRes.status === 401) {
    invalidateDriveToken(token);
    throw new Error(
      `TOKEN_EXPIRED_401: Sesi Google Drive '${cleanEmail}' telah kedaluwarsa. Silakan sambungkan ulang.`
    );
  }

  if (!listRes.ok) {
    const errText = await listRes.text().catch(() => listRes.statusText);
    throw new Error(`Gagal membaca 3 folder utama Google Drive: ${errText}`);
  }

  const listData = await listRes.json();
  const rawFiles: any[] = Array.isArray(listData?.files) ? listData.files : [];

  // Double-filter client-side to guarantee only the 3 exact names are kept
  const allowedFolders = rawFiles.filter(
    (f) => f && f.mimeType === FOLDER_MIME && ALLOWED_ROOT_FOLDER_NAMES.has(f.name)
  );

  const allowedFolderIds = new Set<string>();
  const roots: ScopedRootFolderStatus[] = SCOPED_DRIVE_CATEGORIES.map((category) => {
    const matches = allowedFolders.filter((f) => f.name === category.folderName);
    // Register all matching root folder IDs (so nested browsing works reliably), and pick primary
    matches.forEach((m) => {
      if (m.id) allowedFolderIds.add(m.id);
    });
    const best = matches[0] || null;
    return {
      category,
      exists: Boolean(best),
      folder: best
        ? {
            id: best.id,
            name: best.name,
            mimeType: best.mimeType,
            isFolder: true,
            modifiedTime: best.modifiedTime,
            webViewLink:
              best.webViewLink || `https://drive.google.com/drive/folders/${best.id}`,
            parents: best.parents,
          }
        : null,
    };
  });

  return {
    email: cleanEmail,
    displayName,
    photoURL,
    quotaUsed,
    quotaLimit,
    roots,
    allowedFolderIds,
  };
};

/**
 * Lists files & subfolders inside a verified descendant folder belonging to one of the 3 allowed main folders.
 * Refuses to query if folderId is outside the verified hierarchy or if accountEmail is unregistered.
 */
export const fetchScopedFolderChildren = async (
  accountEmail: string,
  folderId: string,
  allowedFolderIds: Set<string>,
  searchQuery?: string
): Promise<ScopedDriveFile[]> => {
  const cleanEmail = (accountEmail || '').trim().toLowerCase();
  const token = assertRegisteredAccountAndGetToken(cleanEmail);

  if (!folderId || !allowedFolderIds.has(folderId)) {
    throw new Error(
      'AKSES_FOLDER_DITOLAK: Folder ini berada di luar 3 folder data utama yang diizinkan (Absen, Voucher, Internal Memo).'
    );
  }

  const safeFolderId = folderId.replace(/'/g, "\\'");
  let q = `'${safeFolderId}' in parents and trashed = false`;
  const cleanSearch = (searchQuery || '').trim();
  if (cleanSearch) {
    const escaped = cleanSearch.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    q += ` and name contains '${escaped}'`;
  }

  const url =
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
    `&spaces=drive&pageSize=100&orderBy=folder,modifiedTime desc` +
    `&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,parents)`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    invalidateDriveToken(token);
    throw new Error(
      `TOKEN_EXPIRED_401: Sesi Google Drive '${cleanEmail}' telah kedaluwarsa. Silakan sambungkan ulang.`
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Gagal membuka isi folder Google Drive: ${errText}`);
  }

  const data = await res.json();
  const raw: any[] = Array.isArray(data?.files) ? data.files : [];

  return raw.map((f) => {
    const isFolder = f.mimeType === FOLDER_MIME;
    if (isFolder && f.id) {
      allowedFolderIds.add(f.id);
    }
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType || 'application/octet-stream',
      isFolder,
      size: f.size ? parseInt(String(f.size), 10) : undefined,
      modifiedTime: f.modifiedTime,
      webViewLink:
        f.webViewLink ||
        (isFolder
          ? `https://drive.google.com/drive/folders/${f.id}`
          : `https://drive.google.com/file/d/${f.id}/view`),
      webContentLink: f.webContentLink,
      parents: f.parents,
    };
  });
};

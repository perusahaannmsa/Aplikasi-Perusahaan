import {
  executeDriveApiWithAutoRefresh,
  getConnectedDrives,
  getOrRenewDriveToken,
  getTokenForRegisteredDriveEmail,
  invalidateDriveToken,
  isStrictlyAuthorizedDriveEmail,
  loadConnectedDrivesFromFirestore,
  saveConnectedDrives,
} from '../firebase';

import { getOrCreateNestedFolder } from '../lib/googleWorkspaceAbsen';

export type DriveModuleKey = 'absen' | 'voucher' | 'memo' | 'pinjaman' | 'pph23';

export interface ScopedDriveCategory {
  key: DriveModuleKey;
  label: string;
  folderName: string;
  legacyFolderNames?: string[];
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
  {
    key: 'pinjaman',
    label: 'Pinjaman Karyawan & Cicilan',
    folderName: 'PINJAMAN-KARYAWAN-NMSA',
    description: 'Formulir permohonan pinjaman PDF, catatan cicilan, & cadangan data pinjaman.',
  },
  {
    key: 'pph23',
    label: 'PPh 23 & Master NPWP',
    folderName: 'PPH23-CORETAX-NMSA',
    legacyFolderNames: ['NPWP-VENDOR-NMSA-APP'],
    description: 'Rekap Coretax PPh 23, berkas Bukti Potong pajak, & cadangan Master NPWP vendor.',
  },
];

export const ALLOWED_ROOT_FOLDER_NAMES = new Set(
  SCOPED_DRIVE_CATEGORIES.flatMap((c) => [c.folderName, ...(c.legacyFolderNames || [])])
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

const assertRegisteredAccountAndGetToken = async (accountEmail: string): Promise<string> => {
  const clean = (accountEmail || '').trim().toLowerCase();
  if (!clean || !isStrictlyAuthorizedDriveEmail(clean)) {
    throw new Error(
      `AKUN_TIDAK_TERDAFTAR: Akun '${accountEmail || '-'}' tidak terdaftar di aplikasi. Hanya akun Google yang telah Anda daftarkan yang dapat dibaca.`
    );
  }
  let token = getTokenForRegisteredDriveEmail(clean);
  if (!token) {
    await loadConnectedDrivesFromFirestore('', true).catch(() => []);
    token = getTokenForRegisteredDriveEmail(clean);
  }
  if (!token) {
    token = await getOrRenewDriveToken(clean, true).catch(() => '');
  }
  if (!token) {
    throw new Error(
      `TOKEN_BELUM_AKTIF: Sesi Google Drive untuk akun '${clean}' belum terhubung atau sudah kedaluwarsa. Klik Sambungkan untuk mengaktifkan kembali.`
    );
  }
  return token;
};

/**
 * Reads storage metadata and ONLY the 5 allowed root folders (Absen, Voucher, Internal Memo, Pinjaman, PPh 23)
 * for a registered account. Automatically refreshes quota & recovers expired tokens.
 */
export const loadRegisteredAccountScopedDrive = async (
  accountEmail: string
): Promise<RegisteredAccountStorageSnapshot> => {
  const cleanEmail = (accountEmail || '').trim().toLowerCase();
  if (!cleanEmail || !isStrictlyAuthorizedDriveEmail(cleanEmail)) {
    throw new Error(
      `AKUN_TIDAK_TERDAFTAR: Akun '${accountEmail || '-'}' tidak terdaftar di aplikasi. Hanya akun Google yang telah Anda daftarkan yang dapat dibaca.`
    );
  }

  return executeDriveApiWithAutoRefresh(
    async (token) => {
      // 1. Verify token identity & live storage quota
      const aboutRes = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName,photoLink),storageQuota(usage,limit)',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (aboutRes.status === 401) {
        invalidateDriveToken(token, true);
        throw new Error('UNAUTHORIZED_401');
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

      // 2. Query ONLY the 5 permitted main folders by exact folder name (plus legacy NPWP folder if present)
      const nameClauses = Array.from(ALLOWED_ROOT_FOLDER_NAMES)
        .map((n) => `name = '${n.replace(/'/g, "\\'")}'`)
        .join(' or ');

      const scopedQuery =
        `mimeType = '${FOLDER_MIME}' and trashed = false and (${nameClauses})`;

      const listUrl =
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(scopedQuery)}` +
        `&spaces=drive&pageSize=50&orderBy=modifiedTime desc` +
        `&fields=files(id,name,mimeType,modifiedTime,webViewLink,parents)`;

      const listRes = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (listRes.status === 401) {
        invalidateDriveToken(token, true);
        throw new Error('UNAUTHORIZED_401');
      }

      if (!listRes.ok) {
        const errText = await listRes.text().catch(() => listRes.statusText);
        throw new Error(`Gagal membaca 5 folder utama Google Drive: ${errText}`);
      }

      const listData = await listRes.json();
  const rawFiles: any[] = Array.isArray(listData?.files) ? listData.files : [];

  // Double-filter client-side to guarantee only the permitted exact names are kept
  const allowedFolders = rawFiles.filter(
    (f) => f && f.mimeType === FOLDER_MIME && ALLOWED_ROOT_FOLDER_NAMES.has(f.name)
  );

  const allowedFolderIds = new Set<string>();
  const roots: ScopedRootFolderStatus[] = SCOPED_DRIVE_CATEGORIES.map((category) => {
    const acceptedNames = new Set([category.folderName, ...(category.legacyFolderNames || [])]);
    const matches = allowedFolders.filter((f) => acceptedNames.has(f.name));
    // Prefer canonical primary folderName over legacy if both exist
    matches.sort((a, b) => {
      if (a.name === category.folderName && b.name !== category.folderName) return -1;
      if (b.name === category.folderName && a.name !== category.folderName) return 1;
      return 0;
    });
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
    },
    {
      actionName: 'Baca Kuota & Folder Google Drive',
      targetEmail: cleanEmail,
      interactiveIfRequired: true,
      skipPostQuotaRefresh: true,
    }
  );
};

/**
 * Lists files & subfolders inside a verified descendant folder belonging to one of the 5 allowed main folders.
 * Refuses to query if folderId is outside the verified hierarchy or if accountEmail is unregistered.
 */
export const fetchScopedFolderChildren = async (
  accountEmail: string,
  folderId: string,
  allowedFolderIds: Set<string>,
  searchQuery?: string
): Promise<ScopedDriveFile[]> => {
  const cleanEmail = (accountEmail || '').trim().toLowerCase();
  if (!cleanEmail || !isStrictlyAuthorizedDriveEmail(cleanEmail)) {
    throw new Error(
      `AKUN_TIDAK_TERDAFTAR: Akun '${accountEmail || '-'}' tidak terdaftar di aplikasi.`
    );
  }

  if (!folderId || !allowedFolderIds.has(folderId)) {
    throw new Error(
      'AKSES_FOLDER_DITOLAK: Folder ini berada di luar 5 folder data utama yang diizinkan (Absen, Voucher, Internal Memo, Pinjaman, PPh 23).'
    );
  }

  return executeDriveApiWithAutoRefresh(
    async (token) => {
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
        invalidateDriveToken(token, true);
        throw new Error('UNAUTHORIZED_401');
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
    },
    {
      actionName: 'Baca Isi Folder Google Drive',
      targetEmail: cleanEmail,
      interactiveIfRequired: true,
    }
  );
};

/**
 * Initializes (creates if missing) one of the 5 permitted main folders on a registered Drive account.
 */
export const initializeScopedRootFolder = async (
  accountEmail: string,
  moduleKey: DriveModuleKey
): Promise<ScopedDriveFile> => {
  const cleanEmail = (accountEmail || '').trim().toLowerCase();
  const token = await assertRegisteredAccountAndGetToken(cleanEmail);
  const category = SCOPED_DRIVE_CATEGORIES.find((c) => c.key === moduleKey);
  if (!category) {
    throw new Error(`Kategori folder '${moduleKey}' tidak dikenali.`);
  }
  const folderId = await executeDriveApiWithAutoRefresh(
    async (liveToken) => getOrCreateNestedFolder(liveToken || token, [category.folderName]),
    {
      actionName: `Siapkan Folder ${category.folderName}`,
      targetEmail: cleanEmail,
      interactiveIfRequired: true,
    }
  );
  return {
    id: folderId,
    name: category.folderName,
    mimeType: FOLDER_MIME,
    isFolder: true,
    modifiedTime: new Date().toISOString(),
    webViewLink: `https://drive.google.com/drive/folders/${folderId}`,
  };
};

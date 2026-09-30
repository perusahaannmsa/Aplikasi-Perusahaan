/**
 * Patented Canonical Application Link Architecture (NMSA Deep Link Standards)
 * Ensures every menu (Absensi, Voucher HO, SPPD, Internal Memo, Agenda, Proyek RAB, NPWP, Kas Kecil)
 * has dedicated, permanent, collision-free URL formats.
 */

export interface AppLinkOptions {
  origin?: string;
  quick?: boolean;
  sign?: boolean;
  pin?: string;
}

/**
 * Returns standard base URL origin safely
 */
export function getAppOrigin(customOrigin?: string): string {
  if (customOrigin) return customOrigin.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
}

/**
 * MENU 2: ABSENSI HARIAN NMSA (Presensi Mandiri / Kehadiran Karyawan)
 * Patented Canonical Format: /?view=absen&workerId=[ID]&quick=true
 */
export function getAttendanceLink(workerId: string, options?: AppLinkOptions): string {
  const origin = getAppOrigin(options?.origin);
  const cleanId = encodeURIComponent(String(workerId || '').trim());
  const params = new URLSearchParams();
  params.set('view', 'absen');
  params.set('workerId', cleanId);
  if (options?.quick !== false) {
    params.set('quick', 'true');
  }
  if (options?.sign) {
    params.set('sign', '1');
  }
  if (options?.pin) {
    params.set('pin', options.pin);
  }
  return `${origin}/?${params.toString()}`;
}

/**
 * MENU 1: VOUCHER TRANSAKSI PUBLIK (Bukti Kas / Bank HO)
 * Patented Canonical Format: /shared-view?id=[SUB_ID]&transaksi=...&nominal=...
 */
export function getVoucherShareLink(
  submissionId: string,
  meta?: {
    kode?: string;
    transaksi?: string;
    nominal?: number | string;
    kepada?: string;
    tanggal?: string;
    status?: string;
    bayar?: string;
  },
  options?: { origin?: string }
): string {
  const origin = getAppOrigin(options?.origin);
  const params = new URLSearchParams();
  params.set('id', String(submissionId || '').trim());
  if (meta?.kode) params.set('kode', meta.kode);
  if (meta?.transaksi) params.set('transaksi', meta.transaksi);
  if (meta?.nominal !== undefined) params.set('nominal', String(meta.nominal));
  if (meta?.kepada) params.set('kepada', meta.kepada);
  if (meta?.tanggal) params.set('tanggal', meta.tanggal);
  if (meta?.status) params.set('status', meta.status);
  if (meta?.bayar) params.set('bayar', meta.bayar);
  return `${origin}/shared-view?${params.toString()}`;
}

/**
 * MENU 4: SPPD (Surat Perintah Perjalanan Dinas)
 * Patented Canonical Format: /?view=sppd&id=[SPPD_ID]
 */
export function getSppdLink(sppdId?: string, options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  const params = new URLSearchParams();
  params.set('view', 'sppd');
  if (sppdId) params.set('id', String(sppdId).trim());
  return `${origin}/?${params.toString()}`;
}

/**
 * MENU 4B: FORM INPUT SPPD PUBLIK (Karyawan / Petugas Lapangan)
 * Patented Canonical Format: /#/input-sppd
 */
export function getPublicSppdLink(options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  return `${origin}/#/input-sppd`;
}

/**
 * MENU 4C: PREVIEW CETAK DOKUMEN SPPD PUBLIK
 * Patented Canonical Format: /#/sppd-view?id=[ID]
 */
export function getSppdViewLink(sppdId: string, options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  const cleanId = encodeURIComponent(String(sppdId || '').trim());
  return `${origin}/#/sppd-view?id=${cleanId}`;
}

/**
 * MENU 12: INTERNAL MEMO DIREKSI
 * Patented Canonical Format: /?view=memo&id=[MEMO_ID]
 */
export function getInternalMemoLink(memoId?: string, options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  const params = new URLSearchParams();
  params.set('view', 'memo');
  if (memoId) params.set('id', String(memoId).trim());
  return `${origin}/?${params.toString()}`;
}

/**
 * MENU 6: AGENDA KERJA RUTIN & PAJAK
 * Patented Canonical Format: /?view=agenda
 */
export function getAgendaLink(options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  return `${origin}/?view=agenda`;
}

/**
 * MENU 7: PROYEK & ANGGARAN RAB
 * Patented Canonical Format: /?view=rab
 */
export function getRabLink(projectId?: string, options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  const params = new URLSearchParams();
  params.set('view', 'rab');
  if (projectId) params.set('id', String(projectId).trim());
  return `${origin}/?${params.toString()}`;
}

/**
 * MENU 3: NPWP & MASTER VENDOR / REKANAN
 * Patented Canonical Format: /?view=npwp
 */
export function getNpwpLink(options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  return `${origin}/?view=npwp`;
}

/**
 * MENU 5: KAS KECIL & ACCURATE PETTY CASH MAPPING
 * Patented Canonical Format: /?view=accurate
 */
export function getPettyCashLink(options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  return `${origin}/?view=accurate`;
}

/**
 * MENU 8: GENERAL LEDGER / BUKU KAS
 * Patented Canonical Format: /?view=ledger
 */
export function getLedgerLink(options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  return `${origin}/?view=ledger`;
}

/**
 * MENU 9: PPH 23
 * Patented Canonical Format: /?view=pph23
 */
export function getPph23Link(options?: { origin?: string }): string {
  const origin = getAppOrigin(options?.origin);
  return `${origin}/?view=pph23`;
}

/**
 * Returns a comprehensive map of all patented application links for PT NMSA
 */
export function getAllCanonicalLinks(customOrigin?: string) {
  const origin = getAppOrigin(customOrigin);
  return {
    origin,
    absen: `${origin}/?view=absen`,
    absenQuick: (workerId: string) => getAttendanceLink(workerId, { origin, quick: true }),
    absenSign: (workerId: string) => getAttendanceLink(workerId, { origin, sign: true }),
    voucher: (submissionId: string, meta?: any) => getVoucherShareLink(submissionId, meta, { origin }),
    sppd: (id?: string) => getSppdLink(id, { origin }),
    sppdInputPublik: getPublicSppdLink({ origin }),
    memo: (id?: string) => getInternalMemoLink(id, { origin }),
    agenda: getAgendaLink({ origin }),
    rab: (id?: string) => getRabLink(id, { origin }),
    npwp: getNpwpLink({ origin }),
    pettyCash: getPettyCashLink({ origin }),
    ledger: getLedgerLink({ origin }),
    pph23: getPph23Link({ origin })
  };
}

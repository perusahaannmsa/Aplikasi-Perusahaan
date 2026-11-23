import { CompanyProfile, Submission } from '../types';

export interface SignerConfigItem {
  title: string;
  name: string;
  role: string;
  enabled?: boolean;
}

export interface CompanySignerBundle {
  companyId: string;
  f1Signers: SignerConfigItem[];
  f2Signers: SignerConfigItem[];
  signatureStyle: 'table' | 'line';
  f2ApprovedBy: 'harijon' | 'nursyam' | 'none';
  creatorName: string;
  approverName: string;
  verifierName: string;
  verifierJabatan: string;
  approver2Name: string;
  approver2Jabatan: string;
  bookkeeperName: string;
  bookkeeperJabatan: string;
  updatedAt?: string;
}

const LEGACY_F1_KEY = 'nmsa_custom_f1_signers_config';
const LEGACY_F2_KEY = 'nmsa_custom_f2_signers_config';
const LEGACY_STYLE_KEY = 'NMSA_SIGNATURE_STYLE';
const LEGACY_F2_APPROVED_KEY = 'nmsa_voucher_f2_approved_by';

const LEGACY_CREATOR_KEY = 'NUSANTARA_DEFAULT_CREATOR_NAME';
const LEGACY_APPROVER_KEY = 'NUSANTARA_DEFAULT_APPROVER_NAME';
const LEGACY_VERIFIER_KEY = 'NUSANTARA_DEFAULT_VERIFIER_NAME';
const LEGACY_VERIFIER_JABATAN_KEY = 'NUSANTARA_DEFAULT_VERIFIER_JABATAN';
const LEGACY_APPROVER2_KEY = 'NUSANTARA_DEFAULT_APPROVER2_NAME';
const LEGACY_APPROVER2_JABATAN_KEY = 'NUSANTARA_DEFAULT_APPROVER2_JABATAN';
const LEGACY_BOOKKEEPER_KEY = 'NUSANTARA_DEFAULT_BOOKKEEPER_NAME';
const LEGACY_BOOKKEEPER_JABATAN_KEY = 'NUSANTARA_DEFAULT_BOOKKEEPER_JABATAN';

export const COMPANY_SIGNERS_MAP_KEY = 'NUSANTARA_COMPANY_SIGNERS_MAP_V1';
export const COMPANY_SIGNERS_UPDATED_EVENT = 'nusantara-company-signers-updated';

export const normalizeSignerCompanyId = (
  rawCompanyId?: string | null,
  fallbackCompanyId?: string | null
): string => {
  const fromRaw = (rawCompanyId || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
  if (fromRaw) return fromRaw;
  const fromFallback = (fallbackCompanyId || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
  if (fromFallback) return fromFallback;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const active = (localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_ID') || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
      if (active) return active;
    } catch (_) {}
  }
  return 'nmsa';
};

export const getCompanyScopedKey = (baseKey: string, companyId: string): string => {
  return `${baseKey}__${normalizeSignerCompanyId(companyId)}`;
};

const safeParseJson = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const sanitizeSignersList = (list: any): SignerConfigItem[] => {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && (item.name || item.title || item.role))
    .map((item) => ({
      title: String(item.title || '').trim() || 'Penanda Tangan',
      name: String(item.name || '').trim(),
      role: String(item.role || '').trim(),
      enabled: item.enabled !== false,
    }));
};

const readSavedCompanyProfile = (
  companyId: string,
  providedUserProfile?: any
): Partial<CompanyProfile> | null => {
  const cleanId = normalizeSignerCompanyId(companyId);

  if (providedUserProfile) {
    const det = providedUserProfile.companyDetails || providedUserProfile;
    const detId = normalizeSignerCompanyId(det?.id || det?.code || providedUserProfile?.companyId, cleanId);
    if (det && detId === cleanId && (det.name || det.fullName || det.sigAccounting || det.f1Signers)) {
      return det;
    }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedList = safeParseJson<any[]>(localStorage.getItem('NUSANTARA_SAVED_COMPANIES'));
      if (Array.isArray(savedList)) {
        const match = savedList.find(
          (c) => normalizeSignerCompanyId(c?.id || c?.code, '') === cleanId
        );
        if (match) return match;
      }
      const activeProf = safeParseJson<any>(localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_PROFILE'));
      if (activeProf && normalizeSignerCompanyId(activeProf?.id || activeProf?.code, '') === cleanId) {
        return activeProf;
      }
    } catch (_) {}
  }

  return null;
};

const readSignersMap = (): Record<string, CompanySignerBundle> => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  const parsed = safeParseJson<Record<string, CompanySignerBundle>>(
    localStorage.getItem(COMPANY_SIGNERS_MAP_KEY)
  );
  return parsed && typeof parsed === 'object' ? parsed : {};
};

const writeSignersMapEntry = (companyId: string, bundle: CompanySignerBundle) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const map = readSignersMap();
    map[normalizeSignerCompanyId(companyId)] = bundle;
    localStorage.setItem(COMPANY_SIGNERS_MAP_KEY, JSON.stringify(map));
  } catch (_) {}
};

// One-time safe migration: ONLY migrate legacy un-suffixed keys to 'nmsa' if '__nmsa' does not exist yet.
// Never leak legacy NMSA keys into NH, ANH, IPN, or other companies!
const migrateLegacyKeysToNmsaOnce = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const f1NmsaKey = getCompanyScopedKey(LEGACY_F1_KEY, 'nmsa');
    if (!localStorage.getItem(f1NmsaKey)) {
      const legacyF1 = localStorage.getItem(LEGACY_F1_KEY);
      if (legacyF1) localStorage.setItem(f1NmsaKey, legacyF1);
    }
    const f2NmsaKey = getCompanyScopedKey(LEGACY_F2_KEY, 'nmsa');
    if (!localStorage.getItem(f2NmsaKey)) {
      const legacyF2 = localStorage.getItem(LEGACY_F2_KEY);
      if (legacyF2) localStorage.setItem(f2NmsaKey, legacyF2);
    }
    const styleNmsaKey = getCompanyScopedKey(LEGACY_STYLE_KEY, 'nmsa');
    if (!localStorage.getItem(styleNmsaKey)) {
      const legacyStyle = localStorage.getItem(LEGACY_STYLE_KEY);
      if (legacyStyle === 'table' || legacyStyle === 'line') {
        localStorage.setItem(styleNmsaKey, legacyStyle);
      }
    }
    const scalarPairs: Array<[string, string]> = [
      [LEGACY_CREATOR_KEY, getCompanyScopedKey(LEGACY_CREATOR_KEY, 'nmsa')],
      [LEGACY_APPROVER_KEY, getCompanyScopedKey(LEGACY_APPROVER_KEY, 'nmsa')],
      [LEGACY_VERIFIER_KEY, getCompanyScopedKey(LEGACY_VERIFIER_KEY, 'nmsa')],
      [LEGACY_VERIFIER_JABATAN_KEY, getCompanyScopedKey(LEGACY_VERIFIER_JABATAN_KEY, 'nmsa')],
      [LEGACY_APPROVER2_KEY, getCompanyScopedKey(LEGACY_APPROVER2_KEY, 'nmsa')],
      [LEGACY_APPROVER2_JABATAN_KEY, getCompanyScopedKey(LEGACY_APPROVER2_JABATAN_KEY, 'nmsa')],
      [LEGACY_BOOKKEEPER_KEY, getCompanyScopedKey(LEGACY_BOOKKEEPER_KEY, 'nmsa')],
      [LEGACY_BOOKKEEPER_JABATAN_KEY, getCompanyScopedKey(LEGACY_BOOKKEEPER_JABATAN_KEY, 'nmsa')],
    ];
    scalarPairs.forEach(([oldK, newK]) => {
      if (!localStorage.getItem(newK)) {
        const val = localStorage.getItem(oldK);
        if (val !== null) localStorage.setItem(newK, val);
      }
    });
  } catch (_) {}
};

export const buildDefaultF1SignersForCompany = (
  companyId: string,
  compProfile?: Partial<CompanyProfile> | null
): SignerConfigItem[] => {
  const cleanId = normalizeSignerCompanyId(companyId);

  if (compProfile?.f1Signers && Array.isArray(compProfile.f1Signers) && compProfile.f1Signers.length > 0) {
    return sanitizeSignersList(compProfile.f1Signers);
  }

  const isNmsa = cleanId === 'nmsa';
  const rawDibuat = (compProfile?.sigDibuat || '').trim();
  const rawDibuatJab = (compProfile?.sigDibuatJabatan || '').trim();

  const col1Name =
    rawDibuat && !(isNmsa && rawDibuat === 'Nur Wahyudi')
      ? rawDibuat
      : 'Andi Dhiya Salsabila';
  const col1Role =
    rawDibuatJab && !(isNmsa && rawDibuatJab === 'Staff Operasional')
      ? rawDibuatJab
      : 'Staff Keuangan';

  const col2Name = (compProfile?.sigAccounting || '').trim() || 'Sri Ekowati';
  const col2Role = (compProfile?.sigAccountingJabatan || '').trim() || 'Manager Keuangan';

  const col3Name = (compProfile?.sigDiverifikasi || '').trim() || 'Andi Muhammad Rifki';
  const col3Role = (compProfile?.sigDiverifikasiJabatan || '').trim() || 'Direktur';

  const col4Name = (compProfile?.sigDisetujui || '').trim() || 'Harijon';
  const col4Role = (compProfile?.sigDisetujuiJabatan || '').trim() || 'Direktur Keuangan';

  return [
    { title: 'Diajukan', name: col1Name, role: col1Role, enabled: true },
    { title: 'Diverifikasi', name: col2Name, role: col2Role, enabled: true },
    { title: 'Diverifikasi', name: col3Name, role: col3Role, enabled: true },
    { title: 'Disetujui', name: col4Name, role: col4Role, enabled: true },
  ];
};

export const buildDefaultF2SignersForCompany = (
  companyId: string,
  f1Signers?: SignerConfigItem[],
  compProfile?: Partial<CompanyProfile> | null
): SignerConfigItem[] => {
  if (compProfile?.f2Signers && Array.isArray(compProfile.f2Signers) && compProfile.f2Signers.length > 0) {
    return sanitizeSignersList(compProfile.f2Signers);
  }

  const baseF1 =
    f1Signers && f1Signers.length > 0
      ? f1Signers
      : buildDefaultF1SignersForCompany(companyId, compProfile);

  const applicant = baseF1[0] || {
    title: 'Diajukan',
    name: 'Andi Dhiya Salsabila',
    role: 'Staff Keuangan',
  };
  const verifier = baseF1[1] || {
    title: 'Diverifikasi',
    name: 'Sri Ekowati',
    role: 'Manager Keuangan',
  };

  return [
    {
      title: applicant.title || 'Diajukan',
      name: applicant.name,
      role: applicant.role,
      enabled: true,
    },
    {
      title: verifier.title || 'Diverifikasi',
      name: verifier.name,
      role: verifier.role,
      enabled: false,
    },
  ];
};

export const resolveCompanySignerBundle = (
  companyId?: string | null,
  providedUserProfile?: any
): CompanySignerBundle => {
  const cleanId = normalizeSignerCompanyId(companyId, providedUserProfile?.companyId);
  if (cleanId === 'nmsa') {
    migrateLegacyKeysToNmsaOnce();
  }

  const compProfile = readSavedCompanyProfile(cleanId, providedUserProfile);
  const mapEntry = readSignersMap()[cleanId];

  // 1. F1 Signers: Scoped localStorage -> Signers map -> CompanyProfile -> derived defaults
  let f1Signers: SignerConfigItem[] = [];
  if (typeof window !== 'undefined' && window.localStorage) {
    const scopedRaw = safeParseJson<any[]>(localStorage.getItem(getCompanyScopedKey(LEGACY_F1_KEY, cleanId)));
    if (Array.isArray(scopedRaw) && scopedRaw.length > 0) {
      f1Signers = sanitizeSignersList(scopedRaw);
    }
  }
  if (f1Signers.length === 0 && mapEntry?.f1Signers?.length) {
    f1Signers = sanitizeSignersList(mapEntry.f1Signers);
  }
  if (f1Signers.length === 0) {
    f1Signers = buildDefaultF1SignersForCompany(cleanId, compProfile);
  }

  // 2. F2 Signers: Scoped localStorage -> Signers map -> CompanyProfile -> derived from THIS company's F1
  let f2Signers: SignerConfigItem[] = [];
  if (typeof window !== 'undefined' && window.localStorage) {
    const scopedF2Raw = safeParseJson<any[]>(localStorage.getItem(getCompanyScopedKey(LEGACY_F2_KEY, cleanId)));
    if (Array.isArray(scopedF2Raw) && scopedF2Raw.length > 0) {
      f2Signers = sanitizeSignersList(scopedF2Raw);
    }
  }
  if (f2Signers.length === 0 && mapEntry?.f2Signers?.length) {
    f2Signers = sanitizeSignersList(mapEntry.f2Signers);
  }
  if (f2Signers.length === 0) {
    f2Signers = buildDefaultF2SignersForCompany(cleanId, f1Signers, compProfile);
  }

  // 3. Signature style ('table' vs 'line')
  let signatureStyle: 'table' | 'line' = 'table';
  if (typeof window !== 'undefined' && window.localStorage) {
    const savedStyle = localStorage.getItem(getCompanyScopedKey(LEGACY_STYLE_KEY, cleanId));
    if (savedStyle === 'line' || savedStyle === 'table') {
      signatureStyle = savedStyle;
    } else if (mapEntry?.signatureStyle === 'line' || mapEntry?.signatureStyle === 'table') {
      signatureStyle = mapEntry.signatureStyle;
    } else if (compProfile?.signatureStyle === 'line' || compProfile?.signatureStyle === 'table') {
      signatureStyle = compProfile.signatureStyle;
    }
  }

  // 4. F2 approved-by mode
  let f2ApprovedBy: 'harijon' | 'nursyam' | 'none' = 'none';
  if (typeof window !== 'undefined' && window.localStorage) {
    const savedF2App = localStorage.getItem(getCompanyScopedKey(LEGACY_F2_APPROVED_KEY, cleanId));
    if (savedF2App === 'harijon' || savedF2App === 'nursyam' || savedF2App === 'none') {
      f2ApprovedBy = savedF2App;
    } else if (mapEntry?.f2ApprovedBy) {
      f2ApprovedBy = mapEntry.f2ApprovedBy;
    } else if (compProfile?.f2ApprovedBy) {
      f2ApprovedBy = compProfile.f2ApprovedBy;
    }
  }

  // 5. Scalar defaults for SubmissionForm & UserProfileModal
  const readScopedStr = (baseKey: string, mapVal?: string, fallback?: string): string => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = localStorage.getItem(getCompanyScopedKey(baseKey, cleanId));
      if (val !== null) return val;
    }
    if (mapVal !== undefined && mapVal !== null) return mapVal;
    return fallback || '';
  };

  const activeF1 = f1Signers.filter((s) => s.enabled !== false);
  const f1Col1 = activeF1[0] || f1Signers[0];
  const f1Col2 = activeF1[1] || f1Signers[1];
  const f1Col3 = activeF1[2] || f1Signers[2];
  const f1Col4 = activeF1[3] || f1Signers[3];

  const creatorName = readScopedStr(
    LEGACY_CREATOR_KEY,
    mapEntry?.creatorName,
    compProfile?.sigDibuat || f2Signers[0]?.name || f1Col1?.name || 'Nur Wahyudi'
  );
  const bookkeeperName = readScopedStr(
    LEGACY_BOOKKEEPER_KEY,
    mapEntry?.bookkeeperName,
    compProfile?.sigAccounting || f1Col2?.name || 'Sri Ekowati'
  );
  const bookkeeperJabatan = readScopedStr(
    LEGACY_BOOKKEEPER_JABATAN_KEY,
    mapEntry?.bookkeeperJabatan,
    compProfile?.sigAccountingJabatan || f1Col2?.role || 'Manager Keuangan'
  );
  const verifierName = readScopedStr(
    LEGACY_VERIFIER_KEY,
    mapEntry?.verifierName,
    compProfile?.sigDiverifikasi || f1Col3?.name || 'Andi Muhammad Rifki'
  );
  const verifierJabatan = readScopedStr(
    LEGACY_VERIFIER_JABATAN_KEY,
    mapEntry?.verifierJabatan,
    compProfile?.sigDiverifikasiJabatan || f1Col3?.role || 'Direktur'
  );
  const approverName = readScopedStr(
    LEGACY_APPROVER_KEY,
    mapEntry?.approverName,
    compProfile?.sigDisetujui || f1Col4?.name || 'Harijon'
  );
  const approver2Name = readScopedStr(
    LEGACY_APPROVER2_KEY,
    mapEntry?.approver2Name,
    compProfile?.sigDirektur || f1Col4?.name || 'H. Andi Nursyam Halid'
  );
  const approver2Jabatan = readScopedStr(
    LEGACY_APPROVER2_JABATAN_KEY,
    mapEntry?.approver2Jabatan,
    compProfile?.sigDirekturJabatan || 'Direktur Utama'
  );

  return {
    companyId: cleanId,
    f1Signers,
    f2Signers,
    signatureStyle,
    f2ApprovedBy,
    creatorName,
    approverName,
    verifierName,
    verifierJabatan,
    approver2Name,
    approver2Jabatan,
    bookkeeperName,
    bookkeeperJabatan,
    updatedAt: mapEntry?.updatedAt || compProfile?.updatedAt,
  };
};

export const saveCompanySignerBundle = (
  companyId: string,
  partial: Partial<CompanySignerBundle>,
  options: { syncServer?: boolean } = { syncServer: true }
): CompanySignerBundle => {
  const cleanId = normalizeSignerCompanyId(companyId);
  const current = resolveCompanySignerBundle(cleanId);

  const nextF1 = partial.f1Signers ? sanitizeSignersList(partial.f1Signers) : current.f1Signers;
  const nextF2 = partial.f2Signers ? sanitizeSignersList(partial.f2Signers) : current.f2Signers;
  const nextStyle = partial.signatureStyle || current.signatureStyle || 'table';
  const nextF2Approved = partial.f2ApprovedBy || current.f2ApprovedBy || 'none';

  const activeF1 = nextF1.filter((s) => s.enabled !== false);
  const c1 = activeF1[0] || nextF1[0];
  const c2 = activeF1[1] || nextF1[1];
  const c3 = activeF1[2] || nextF1[2];
  const c4 = activeF1[3] || nextF1[3];

  const nextBundle: CompanySignerBundle = {
    companyId: cleanId,
    f1Signers: nextF1,
    f2Signers: nextF2,
    signatureStyle: nextStyle,
    f2ApprovedBy: nextF2Approved,
    creatorName:
      partial.creatorName !== undefined
        ? partial.creatorName
        : nextF2[0]?.name || c1?.name || current.creatorName,
    bookkeeperName:
      partial.bookkeeperName !== undefined
        ? partial.bookkeeperName
        : c2?.name || current.bookkeeperName,
    bookkeeperJabatan:
      partial.bookkeeperJabatan !== undefined
        ? partial.bookkeeperJabatan
        : c2?.role || current.bookkeeperJabatan,
    verifierName:
      partial.verifierName !== undefined
        ? partial.verifierName
        : c3?.name || current.verifierName,
    verifierJabatan:
      partial.verifierJabatan !== undefined
        ? partial.verifierJabatan
        : c3?.role || current.verifierJabatan,
    approverName:
      partial.approverName !== undefined
        ? partial.approverName
        : c4?.name || current.approverName,
    approver2Name:
      partial.approver2Name !== undefined
        ? partial.approver2Name
        : current.approver2Name,
    approver2Jabatan:
      partial.approver2Jabatan !== undefined
        ? partial.approver2Jabatan
        : current.approver2Jabatan,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(getCompanyScopedKey(LEGACY_F1_KEY, cleanId), JSON.stringify(nextBundle.f1Signers));
      localStorage.setItem(getCompanyScopedKey(LEGACY_F2_KEY, cleanId), JSON.stringify(nextBundle.f2Signers));
      localStorage.setItem(getCompanyScopedKey(LEGACY_STYLE_KEY, cleanId), nextBundle.signatureStyle);
      localStorage.setItem(getCompanyScopedKey(LEGACY_F2_APPROVED_KEY, cleanId), nextBundle.f2ApprovedBy);

      localStorage.setItem(getCompanyScopedKey(LEGACY_CREATOR_KEY, cleanId), nextBundle.creatorName);
      localStorage.setItem(getCompanyScopedKey(LEGACY_APPROVER_KEY, cleanId), nextBundle.approverName);
      localStorage.setItem(getCompanyScopedKey(LEGACY_VERIFIER_KEY, cleanId), nextBundle.verifierName);
      localStorage.setItem(getCompanyScopedKey(LEGACY_VERIFIER_JABATAN_KEY, cleanId), nextBundle.verifierJabatan);
      localStorage.setItem(getCompanyScopedKey(LEGACY_APPROVER2_KEY, cleanId), nextBundle.approver2Name);
      localStorage.setItem(getCompanyScopedKey(LEGACY_APPROVER2_JABATAN_KEY, cleanId), nextBundle.approver2Jabatan);
      localStorage.setItem(getCompanyScopedKey(LEGACY_BOOKKEEPER_KEY, cleanId), nextBundle.bookkeeperName);
      localStorage.setItem(getCompanyScopedKey(LEGACY_BOOKKEEPER_JABATAN_KEY, cleanId), nextBundle.bookkeeperJabatan);

      writeSignersMapEntry(cleanId, nextBundle);

      // Keep matching company in NUSANTARA_SAVED_COMPANIES & active company profile in sync
      const savedList = safeParseJson<any[]>(localStorage.getItem('NUSANTARA_SAVED_COMPANIES')) || [];
      if (Array.isArray(savedList)) {
        const idx = savedList.findIndex((c) => normalizeSignerCompanyId(c?.id || c?.code, '') === cleanId);
        const syncedCompanyFields = {
          f1Signers: nextBundle.f1Signers,
          f2Signers: nextBundle.f2Signers,
          signatureStyle: nextBundle.signatureStyle,
          f2ApprovedBy: nextBundle.f2ApprovedBy,
          sigDibuat: nextBundle.creatorName,
          sigDibuatJabatan: c1?.role || 'Staff Keuangan',
          sigAccounting: nextBundle.bookkeeperName,
          sigAccountingJabatan: nextBundle.bookkeeperJabatan,
          sigDiverifikasi: nextBundle.verifierName,
          sigDiverifikasiJabatan: nextBundle.verifierJabatan,
          sigDisetujui: nextBundle.approverName,
          sigDisetujuiJabatan: c4?.role || 'Direktur Keuangan',
          sigDirektur: nextBundle.approver2Name,
          sigDirekturJabatan: nextBundle.approver2Jabatan,
          updatedAt: nextBundle.updatedAt,
        };
        if (idx >= 0) {
          savedList[idx] = { ...savedList[idx], ...syncedCompanyFields };
          localStorage.setItem('NUSANTARA_SAVED_COMPANIES', JSON.stringify(savedList));
        }

        const activeCompId = normalizeSignerCompanyId(localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_ID'));
        if (activeCompId === cleanId) {
          const activeProf = safeParseJson<any>(localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_PROFILE'));
          if (activeProf) {
            localStorage.setItem(
              'NUSANTARA_ACTIVE_COMPANY_PROFILE',
              JSON.stringify({ ...activeProf, ...syncedCompanyFields, id: cleanId })
            );
          }
        }
      }

      window.dispatchEvent(
        new CustomEvent(COMPANY_SIGNERS_UPDATED_EVENT, {
          detail: { companyId: cleanId, bundle: nextBundle },
        })
      );
    } catch (err) {
      console.warn('Warning saving scoped company signers:', err);
    }
  }

  if (options.syncServer !== false && typeof fetch === 'function') {
    const mapPayload = readSignersMap();
    mapPayload[cleanId] = nextBundle;
    fetch('/api/unified-storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companySettings: {
          companySignersByCompany: mapPayload,
        },
      }),
    }).catch(() => {});
  }

  return nextBundle;
};

export const resetCompanySignerBundle = (
  companyId: string,
  providedUserProfile?: any
): CompanySignerBundle => {
  const cleanId = normalizeSignerCompanyId(companyId, providedUserProfile?.companyId);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      [
        LEGACY_F1_KEY,
        LEGACY_F2_KEY,
        LEGACY_STYLE_KEY,
        LEGACY_F2_APPROVED_KEY,
        LEGACY_CREATOR_KEY,
        LEGACY_APPROVER_KEY,
        LEGACY_VERIFIER_KEY,
        LEGACY_VERIFIER_JABATAN_KEY,
        LEGACY_APPROVER2_KEY,
        LEGACY_APPROVER2_JABATAN_KEY,
        LEGACY_BOOKKEEPER_KEY,
        LEGACY_BOOKKEEPER_JABATAN_KEY,
      ].forEach((k) => {
        localStorage.removeItem(getCompanyScopedKey(k, cleanId));
      });

      const map = readSignersMap();
      delete map[cleanId];
      localStorage.setItem(COMPANY_SIGNERS_MAP_KEY, JSON.stringify(map));

      // Also clear custom signer arrays from the saved company profile for THIS company only
      const savedList = safeParseJson<any[]>(localStorage.getItem('NUSANTARA_SAVED_COMPANIES'));
      if (Array.isArray(savedList)) {
        const updatedList = savedList.map((c) => {
          if (normalizeSignerCompanyId(c?.id || c?.code, '') === cleanId) {
            const copy = { ...c };
            delete copy.f1Signers;
            delete copy.f2Signers;
            delete copy.signatureStyle;
            delete copy.f2ApprovedBy;
            return copy;
          }
          return c;
        });
        localStorage.setItem('NUSANTARA_SAVED_COMPANIES', JSON.stringify(updatedList));
      }

      const activeProf = safeParseJson<any>(localStorage.getItem('NUSANTARA_ACTIVE_COMPANY_PROFILE'));
      if (activeProf && normalizeSignerCompanyId(activeProf?.id || activeProf?.code, '') === cleanId) {
        const copy = { ...activeProf };
        delete copy.f1Signers;
        delete copy.f2Signers;
        delete copy.signatureStyle;
        delete copy.f2ApprovedBy;
        localStorage.setItem('NUSANTARA_ACTIVE_COMPANY_PROFILE', JSON.stringify(copy));
      }
    } catch (_) {}
  }

  const freshBundle = resolveCompanySignerBundle(cleanId, providedUserProfile);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(COMPANY_SIGNERS_UPDATED_EVENT, {
        detail: { companyId: cleanId, bundle: freshBundle },
      })
    );
  }

  return freshBundle;
};

export const hydrateCompanySignersFromServerSettings = (companySettings: any): void => {
  if (!companySettings || typeof window === 'undefined' || !window.localStorage) return;

  try {
    const incomingMap = companySettings.companySignersByCompany;
    if (incomingMap && typeof incomingMap === 'object') {
      const currentMap = readSignersMap();
      let changed = false;

      Object.entries(incomingMap).forEach(([rawId, incomingBundle]: [string, any]) => {
        if (!incomingBundle || typeof incomingBundle !== 'object') return;
        const cleanId = normalizeSignerCompanyId(rawId);
        const existing = currentMap[cleanId];
        const incTime = incomingBundle.updatedAt ? new Date(incomingBundle.updatedAt).getTime() : 0;
        const curTime = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

        // Only hydrate if local scoped storage does not have a newer config
        const hasLocalScopedF1 = !!localStorage.getItem(getCompanyScopedKey(LEGACY_F1_KEY, cleanId));
        if (!hasLocalScopedF1 || incTime > curTime) {
          saveCompanySignerBundle(cleanId, incomingBundle, { syncServer: false });
          changed = true;
        }
      });

      if (changed) {
        window.dispatchEvent(new CustomEvent(COMPANY_SIGNERS_UPDATED_EVENT, { detail: { hydrated: true } }));
      }
    }
  } catch (err) {
    console.warn('Warning hydrating per-company signers:', err);
  }
};

/**
 * Resolves exact F1 signers for ANY submission (Print Preview, Form, DriveSyncMass, or F1 PDF).
 * Strictly isolated by submission's companyId so every PT stays 100% independent and identical across views.
 */
export const resolveF1SignersForSubmission = (
  submission?: Partial<Submission> | null,
  options: {
    companyId?: string | null;
    userProfile?: any;
    customSigners?: SignerConfigItem[];
    verifierOverride?: 'rifki' | 'nursyam';
  } = {}
): SignerConfigItem[] => {
  if (Array.isArray(options.customSigners) && options.customSigners.length > 0) {
    return sanitizeSignersList(options.customSigners);
  }

  if (submission?.f1Signers && Array.isArray(submission.f1Signers) && submission.f1Signers.length > 0) {
    return sanitizeSignersList(submission.f1Signers);
  }

  const targetCompanyId = normalizeSignerCompanyId(
    options.companyId || submission?.companyId,
    options.userProfile?.companyId
  );

  // Check if user explicitly saved custom signers for this company
  if (typeof window !== 'undefined' && window.localStorage) {
    if (targetCompanyId === 'nmsa') migrateLegacyKeysToNmsaOnce();
    const scopedSaved = safeParseJson<any[]>(
      localStorage.getItem(getCompanyScopedKey(LEGACY_F1_KEY, targetCompanyId))
    );
    if (Array.isArray(scopedSaved) && scopedSaved.length > 0) {
      return sanitizeSignersList(scopedSaved);
    }
  }

  const bundle = resolveCompanySignerBundle(targetCompanyId, options.userProfile);
  if (bundle.f1Signers && bundle.f1Signers.length > 0) {
    return sanitizeSignersList(bundle.f1Signers);
  }

  // Last-resort fallback from submission fields (if no company config exists)
  const applicantName =
    submission?.diajukanOleh && submission.diajukanOleh !== 'Sri Ekowati'
      ? submission.diajukanOleh
      : 'Andi Dhiya Salsabila';
  const applicantRole = submission?.diajukanJabatan || 'Staff Keuangan';
  const isNursyam =
    options.verifierOverride === 'nursyam' ||
    Boolean(submission?.diverifikasiOleh?.toLowerCase().includes('nursyam'));
  const verifier2Name = isNursyam
    ? 'H. Andi Nursyam Halid'
    : submission?.diverifikasiOleh &&
      submission.diverifikasiOleh !== 'Andi Dhiya Salsabila' &&
      submission.diverifikasiOleh !== 'Sri Ekowati'
    ? submission.diverifikasiOleh
    : 'Andi Muhammad Rifki';
  const verifier2Role = isNursyam
    ? 'Direktur Utama'
    : submission?.diverifikasiJabatan && submission.diverifikasiJabatan !== 'Keuangan'
    ? submission.diverifikasiJabatan
    : 'Direktur';
  const rawApprover = submission?.disetujuiOleh2;
  const approverName =
    rawApprover && !rawApprover.toLowerCase().includes('nursyam') ? rawApprover : 'Harijon';
  const approverRole =
    rawApprover && !rawApprover.toLowerCase().includes('nursyam')
      ? submission?.disetujuiJabatan2 || 'Direktur Keuangan'
      : 'Direktur Keuangan';

  return [
    { title: 'Diajukan', name: applicantName, role: applicantRole, enabled: true },
    { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan', enabled: true },
    { title: 'Diverifikasi', name: verifier2Name, role: verifier2Role, enabled: true },
    { title: 'Disetujui', name: approverName, role: approverRole, enabled: true },
  ];
};

/**
 * Resolves exact F2 signers for ANY submission (Print Preview, DriveSyncMass, or F2 PDF).
 * Strictly isolated by submission's companyId.
 */
export const resolveF2SignersForSubmission = (
  submission?: Partial<Submission> | null,
  options: {
    companyId?: string | null;
    userProfile?: any;
    customSigners?: SignerConfigItem[];
  } = {}
): SignerConfigItem[] => {
  if (Array.isArray(options.customSigners) && options.customSigners.length > 0) {
    return sanitizeSignersList(options.customSigners);
  }

  if (submission?.f2Signers && Array.isArray(submission.f2Signers) && submission.f2Signers.length > 0) {
    return sanitizeSignersList(submission.f2Signers);
  }

  const targetCompanyId = normalizeSignerCompanyId(
    options.companyId || submission?.companyId,
    options.userProfile?.companyId
  );

  const bundle = resolveCompanySignerBundle(targetCompanyId, options.userProfile);
  if (bundle.f2Signers && bundle.f2Signers.length > 0) {
    return sanitizeSignersList(bundle.f2Signers).map((item, idx) => {
      if (
        idx === 0 &&
        item.name === 'Nur Wahyudi' &&
        submission?.diajukanOleh &&
        submission.diajukanOleh !== 'Nur Wahyudi'
      ) {
        return {
          ...item,
          name: submission.diajukanOleh,
          role: submission.diajukanJabatan || item.role,
        };
      }
      return item;
    });
  }

  const f1List = resolveF1SignersForSubmission(submission, options);
  const first = f1List[0] || { title: 'Diajukan', name: 'Andi Dhiya Salsabila', role: 'Staff Keuangan' };
  const second = f1List[1] || { title: 'Diverifikasi', name: 'Sri Ekowati', role: 'Manager Keuangan' };

  return [
    { title: first.title || 'Diajukan', name: first.name, role: first.role, enabled: true },
    { title: second.title || 'Diverifikasi', name: second.name, role: second.role, enabled: false },
  ];
};

export const resolveSignatureStyleForSubmission = (
  submission?: Partial<Submission> | null,
  options: { companyId?: string | null; userProfile?: any } = {}
): 'table' | 'line' => {
  if (submission?.signatureStyle === 'line' || submission?.signatureStyle === 'table') {
    return submission.signatureStyle;
  }
  const targetCompanyId = normalizeSignerCompanyId(
    options.companyId || submission?.companyId,
    options.userProfile?.companyId
  );
  return resolveCompanySignerBundle(targetCompanyId, options.userProfile).signatureStyle;
};

export const resolveF2ApprovedByForSubmission = (
  submission?: Partial<Submission> | null,
  options: { companyId?: string | null; userProfile?: any } = {}
): 'harijon' | 'nursyam' | 'none' => {
  if (
    submission?.f2ApprovedBy === 'harijon' ||
    submission?.f2ApprovedBy === 'nursyam' ||
    submission?.f2ApprovedBy === 'none'
  ) {
    return submission.f2ApprovedBy;
  }
  const targetCompanyId = normalizeSignerCompanyId(
    options.companyId || submission?.companyId,
    options.userProfile?.companyId
  );
  return resolveCompanySignerBundle(targetCompanyId, options.userProfile).f2ApprovedBy;
};

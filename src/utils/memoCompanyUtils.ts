import { InternalMemo, SavedKopSuratLink } from '../types';
import { isMemoWithoutKopSurat, OFFICIAL_KOP_SURAT_IMAGE_URL } from './memoUtils';

export interface CompanyMemoGroup {
  id: string; // 'nmsa', 'ipn', 'anh', or custom slug
  code: string; // 'NMSA', 'IPN', 'ANH'
  name: string; // 'PT Nusantara Mineral Sukses Abadi', 'PT Industri Padi Nusantara', etc.
  shortName: string; // 'PT NMSA', 'PT IPN', 'PT ANH'
  icon?: string;
  defaultKopName?: string;
  defaultKopUrl?: string;
  memoPrefix: string; // 'IM-NMSA', 'IM-IPN', 'IM-ANH'
  colorClass: {
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    tabActiveBg: string;
    tabActiveText: string;
    ring: string;
    accentText: string;
  };
}

export const DEFAULT_MEMO_COMPANIES: CompanyMemoGroup[] = [
  {
    id: 'nmsa',
    code: 'NMSA',
    name: 'PT Nusantara Mineral Sukses Abadi',
    shortName: 'PT NMSA',
    icon: '🏢',
    defaultKopName: 'Kop Surat Resmi PT NMSA',
    defaultKopUrl: OFFICIAL_KOP_SURAT_IMAGE_URL,
    memoPrefix: 'IM-NMSA',
    colorClass: {
      badgeBg: 'bg-amber-100',
      badgeText: 'text-amber-900',
      badgeBorder: 'border-amber-300',
      tabActiveBg: 'bg-amber-600',
      tabActiveText: 'text-white',
      ring: 'ring-amber-500',
      accentText: 'text-amber-700',
    },
  },
  {
    id: 'ipn',
    code: 'IPN',
    name: 'PT Industri Padi Nusantara',
    shortName: 'PT IPN',
    icon: '🌾',
    defaultKopName: 'Kop Surat PT Industri Padi Nusantara',
    defaultKopUrl: '',
    memoPrefix: 'IM-IPN',
    colorClass: {
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-900',
      badgeBorder: 'border-emerald-300',
      tabActiveBg: 'bg-emerald-600',
      tabActiveText: 'text-white',
      ring: 'ring-emerald-500',
      accentText: 'text-emerald-700',
    },
  },
  {
    id: 'anh',
    code: 'ANH',
    name: 'PT Agro Nusantara Halid',
    shortName: 'PT ANH',
    icon: '🌴',
    defaultKopName: 'Kop Surat PT Agro Nusantara Halid',
    defaultKopUrl: '',
    memoPrefix: 'IM-ANH',
    colorClass: {
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-900',
      badgeBorder: 'border-blue-300',
      tabActiveBg: 'bg-blue-600',
      tabActiveText: 'text-white',
      ring: 'ring-blue-500',
      accentText: 'text-blue-700',
    },
  },
];

const STORAGE_KEY_MEMO_COMPANIES = 'NMSA_MEMO_COMPANIES_V1';

/**
 * Loads all known companies for Internal Memo, merging default presets with
 * companies saved in localStorage or registered in app.
 */
export function loadMemoCompanies(): CompanyMemoGroup[] {
  const list = [...DEFAULT_MEMO_COMPANIES];

  // 1. Merge from local custom memo companies
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MEMO_COMPANIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: CompanyMemoGroup) => {
          if (item && item.id && !list.some((c) => c.id.toLowerCase() === item.id.toLowerCase())) {
            list.push(item);
          }
        });
      }
    }
  } catch (_) {}

  // 2. Merge from app-wide NUSANTARA_SAVED_COMPANIES
  try {
    const rawSaved = localStorage.getItem('NUSANTARA_SAVED_COMPANIES');
    if (rawSaved) {
      const savedList = JSON.parse(rawSaved);
      if (Array.isArray(savedList)) {
        savedList.forEach((c: any) => {
          const rawId = (c.id || c.code || '').toLowerCase().trim();
          if (rawId && !list.some((existing) => existing.id.toLowerCase() === rawId)) {
            const code = (c.code || rawId).toUpperCase();
            list.push({
              id: rawId,
              code,
              name: c.name || c.fullName || `PT ${code}`,
              shortName: c.shortName || `PT ${code}`,
              icon: c.icon || '🏢',
              defaultKopName: `Kop Surat Resmi PT ${code}`,
              defaultKopUrl: c.headerUrl || c.logoUrl || '',
              memoPrefix: `IM-${code}`,
              colorClass: {
                badgeBg: 'bg-purple-100',
                badgeText: 'text-purple-900',
                badgeBorder: 'border-purple-300',
                tabActiveBg: 'bg-purple-600',
                tabActiveText: 'text-white',
                ring: 'ring-purple-500',
                accentText: 'text-purple-700',
              },
            });
          }
        });
      }
    }
  } catch (_) {}

  return list;
}

/**
 * Saves updated companies list to localStorage
 */
export function saveMemoCompanies(companies: CompanyMemoGroup[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_MEMO_COMPANIES, JSON.stringify(companies));
  } catch (e) {
    console.warn('Failed to save memo companies:', e);
  }
}

/**
 * Detects which company an Internal Memo belongs to based on companyId,
 * companyName, companyHeaderName, nomorMemo, and text patterns.
 */
export function detectMemoCompany(
  memo: Partial<InternalMemo> | undefined | null,
  companies: CompanyMemoGroup[] = DEFAULT_MEMO_COMPANIES
): CompanyMemoGroup {
  if (!memo) return companies[0] || DEFAULT_MEMO_COMPANIES[0];

  // 1. Direct companyId match
  if (memo.companyId) {
    const cleanId = memo.companyId.toLowerCase().trim();
    const found = companies.find((c) => c.id.toLowerCase() === cleanId || c.code.toLowerCase() === cleanId);
    if (found) return found;
  }

  // 2. Nomor memo inspection (e.g. 186/IM-IPN/..., 186/IM-ANH/..., 186/IM-NMSA/...)
  if (memo.nomorMemo) {
    const num = memo.nomorMemo.trim().toUpperCase();
    for (const c of companies) {
      if (num.includes(`IM-${c.code}`) || num.includes(`/${c.code}/`)) {
        return c;
      }
    }
    // Check if regex matches any IM-XXXX prefix
    const prefixMatch = num.match(/\/IM-([A-Z0-9_-]+)\//);
    if (prefixMatch && prefixMatch[1]) {
      const codeFound = prefixMatch[1];
      const match = companies.find((c) => c.code.toUpperCase() === codeFound);
      if (match) return match;
    }
  }

  // 3. companyHeaderName inspection (e.g. "Kop Surat PT Industri Padi Nusantara", "Kop Surat ANH")
  if (memo.companyHeaderName) {
    const head = memo.companyHeaderName.toLowerCase();
    if (head.includes('padi') || head.includes('ipn')) {
      const ipn = companies.find((c) => c.id === 'ipn');
      if (ipn) return ipn;
    }
    if (head.includes('agro') || head.includes('anh') || head.includes('halid')) {
      const anh = companies.find((c) => c.id === 'anh');
      if (anh) return anh;
    }
    if (head.includes('mineral') || head.includes('nmsa')) {
      const nmsa = companies.find((c) => c.id === 'nmsa');
      if (nmsa) return nmsa;
    }
    for (const c of companies) {
      if (head.includes(c.code.toLowerCase()) || head.includes(c.name.toLowerCase())) {
        return c;
      }
    }
  }

  // 4. companyName inspection
  if (memo.companyName) {
    const name = memo.companyName.toLowerCase();
    if (name.includes('padi') || name.includes('ipn')) {
      const ipn = companies.find((c) => c.id === 'ipn');
      if (ipn) return ipn;
    }
    if (name.includes('agro') || name.includes('anh') || name.includes('halid')) {
      const anh = companies.find((c) => c.id === 'anh');
      if (anh) return anh;
    }
    if (name.includes('mineral') || name.includes('nmsa')) {
      const nmsa = companies.find((c) => c.id === 'nmsa');
      if (nmsa) return nmsa;
    }
    for (const c of companies) {
      if (name.includes(c.code.toLowerCase()) || name.includes(c.name.toLowerCase())) {
        return c;
      }
    }
  }

  // Default fallback to first company (NMSA)
  return companies[0] || DEFAULT_MEMO_COMPANIES[0];
}

/**
 * Updates a memo number when moving it to another company.
 * e.g. "186/IM-NMSA/KEU/XI/2026" -> "186/IM-IPN/KEU/XI/2026"
 * or "001/IM/KEU/XI/2026" -> "001/IM-IPN/KEU/XI/2026"
 */
export function updateMemoNumberCompanyPrefix(
  currentNomor: string | undefined,
  targetCompany: CompanyMemoGroup
): string {
  if (!currentNomor) return '';
  const trimmed = currentNomor.trim();

  // Pattern 1: /IM-XXXX/ -> /IM-[targetCompany.code]/
  if (/\/IM-[A-Za-z0-9_-]+\//i.test(trimmed)) {
    return trimmed.replace(/\/IM-[A-Za-z0-9_-]+\//i, `/${targetCompany.memoPrefix}/`);
  }

  // Pattern 2: /IM/KEU/ -> /IM-[targetCompany.code]/KEU/
  if (/\/IM\/KEU\//i.test(trimmed)) {
    return trimmed.replace(/\/IM\/KEU\//i, `/${targetCompany.memoPrefix}/KEU/`);
  }

  // Pattern 3: /IM/ -> /IM-[targetCompany.code]/
  if (/\/IM\//i.test(trimmed)) {
    return trimmed.replace(/\/IM\//i, `/${targetCompany.memoPrefix}/`);
  }

  // Fallback: replace any company code segment or leave as-is with prefix inserted
  return trimmed;
}

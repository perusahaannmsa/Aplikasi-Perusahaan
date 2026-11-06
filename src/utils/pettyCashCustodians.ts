import { areNamesSimilar, toTitleCase } from './nameConsolidation';

export type PettyCashCategory = 'lapangan' | 'pusat';

export interface PettyCashCustodiansConfig {
  lapangan: string[];
  pusat: string[];
}

// User specified exact official custodians:
// Lapangan: Suryo Pranoto, Usmar, Andi Hasnawi
// Kantor Pusat: Andi Dhiya Salsabila, Deasy Annisa Syahdane
export const DEFAULT_LAPANGAN_CUSTODIANS: string[] = [
  'Suryo Pranoto',
  'Usmar',
  'Andi Hasnawi'
];

export const DEFAULT_PUSAT_CUSTODIANS: string[] = [
  'Andi Dhiya Salsabila',
  'Deasy Annisa Syahdane'
];

export const DEFAULT_PETTY_CASH_CUSTODIANS: PettyCashCustodiansConfig = {
  lapangan: [...DEFAULT_LAPANGAN_CUSTODIANS],
  pusat: [...DEFAULT_PUSAT_CUSTODIANS]
};

export const STORAGE_KEY_PETTY_CASH_CUSTODIANS = 'petty_cash_custodians_by_category_v1';
export const STORAGE_KEY_LEGACY_HOLDERS = 'petty_cash_holders_v2';

/**
 * Clean and normalize a list of names, preserving uniqueness and Title Case
 */
export function sanitizeNamesList(names: string[]): string[] {
  if (!Array.isArray(names)) return [];
  const map = new Map<string, string>();
  names.forEach(n => {
    if (typeof n === 'string' && n.trim()) {
      const clean = toTitleCase(n.trim());
      map.set(clean.toLowerCase(), clean);
    }
  });
  return Array.from(map.values());
}

/**
 * Load organized petty cash custodians from localStorage with default fallbacks
 */
export function loadPettyCashCustodians(): PettyCashCustodiansConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PETTY_CASH_CUSTODIANS);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        const lapangan = Array.isArray(parsed.lapangan) && parsed.lapangan.length > 0
          ? sanitizeNamesList(parsed.lapangan)
          : [...DEFAULT_LAPANGAN_CUSTODIANS];

        const pusat = Array.isArray(parsed.pusat) && parsed.pusat.length > 0
          ? sanitizeNamesList(parsed.pusat)
          : [...DEFAULT_PUSAT_CUSTODIANS];

        return { lapangan, pusat };
      }
    }
  } catch (e) {
    console.error('Error loading categorized petty cash custodians:', e);
  }

  // Fallback defaults
  const initial: PettyCashCustodiansConfig = {
    lapangan: [...DEFAULT_LAPANGAN_CUSTODIANS],
    pusat: [...DEFAULT_PUSAT_CUSTODIANS]
  };
  savePettyCashCustodians(initial);
  return initial;
}

/**
 * Save organized petty cash custodians to localStorage and keep legacy array in sync
 */
export function savePettyCashCustodians(config: PettyCashCustodiansConfig): void {
  try {
    const cleanConfig: PettyCashCustodiansConfig = {
      lapangan: sanitizeNamesList(config.lapangan),
      pusat: sanitizeNamesList(config.pusat)
    };
    localStorage.setItem(STORAGE_KEY_PETTY_CASH_CUSTODIANS, JSON.stringify(cleanConfig));

    // Also update legacy flat holders array for backward-compatibility with other modules
    const flat = Array.from(new Set([...cleanConfig.lapangan, ...cleanConfig.pusat]));
    localStorage.setItem(STORAGE_KEY_LEGACY_HOLDERS, JSON.stringify(flat));
  } catch (e) {
    console.error('Error saving petty cash custodians:', e);
  }
}

/**
 * Get all custodians flattened into a single list
 */
export function getAllPettyCashHolders(config: PettyCashCustodiansConfig): string[] {
  return Array.from(new Set([...(config.lapangan || []), ...(config.pusat || [])]));
}

/**
 * Classify jenisPengajuan into Lapangan, Pusat, or non-petty-cash
 */
export function classifyPettyCashJenis(jenisPengajuan: string): 'lapangan' | 'pusat' | 'other_petty_cash' | 'not_petty_cash' {
  const lower = (jenisPengajuan || '').toLowerCase();
  const isPC = lower.includes('petty cash') || lower.includes('kas kecil') || lower.includes('pettycash');
  if (!isPC) return 'not_petty_cash';

  if (lower.includes('lapangan') || lower.includes('field') || lower.includes('site') || lower.includes('tambang')) {
    return 'lapangan';
  }
  if (lower.includes('pusat') || lower.includes('kantor pusat') || lower.includes('ho') || lower.includes('head office')) {
    return 'pusat';
  }
  return 'other_petty_cash';
}

/**
 * Retrieve applicable custodians and default suggestion based strictly on jenisPengajuan
 */
export function getCustodiansForJenis(
  jenisPengajuan: string,
  config: PettyCashCustodiansConfig
): {
  isPettyCash: boolean;
  category: 'lapangan' | 'pusat' | 'all' | 'none';
  categoryLabel: string;
  custodians: string[];
  defaultCustodian: string;
} {
  const classification = classifyPettyCashJenis(jenisPengajuan);

  if (classification === 'lapangan') {
    const list = config.lapangan.length > 0 ? config.lapangan : DEFAULT_LAPANGAN_CUSTODIANS;
    return {
      isPettyCash: true,
      category: 'lapangan',
      categoryLabel: 'Petty Cash Lapangan',
      custodians: list,
      defaultCustodian: list[0] || 'Suryo Pranoto'
    };
  }

  if (classification === 'pusat') {
    const list = config.pusat.length > 0 ? config.pusat : DEFAULT_PUSAT_CUSTODIANS;
    return {
      isPettyCash: true,
      category: 'pusat',
      categoryLabel: 'Petty Cash Kantor Pusat',
      custodians: list,
      defaultCustodian: list[0] || 'Andi Dhiya Salsabila'
    };
  }

  if (classification === 'other_petty_cash') {
    const list = getAllPettyCashHolders(config);
    return {
      isPettyCash: true,
      category: 'all',
      categoryLabel: 'Petty Cash',
      custodians: list,
      defaultCustodian: config.lapangan[0] || 'Suryo Pranoto'
    };
  }

  return {
    isPettyCash: false,
    category: 'none',
    categoryLabel: '',
    custodians: [],
    defaultCustodian: ''
  };
}

/**
 * Normalize a given custodian or recipient name to the canonical official name
 */
export function normalizeCustodianToOfficial(
  name: string,
  config: PettyCashCustodiansConfig
): { officialName: string; category: 'lapangan' | 'pusat' | 'unknown' } {
  const trimmed = (name || '').trim();
  if (!trimmed) return { officialName: '', category: 'unknown' };

  // Check Lapangan first
  for (const holder of config.lapangan) {
    if (holder.toLowerCase() === trimmed.toLowerCase()) {
      return { officialName: holder, category: 'lapangan' };
    }
  }
  for (const holder of config.lapangan) {
    if (areNamesSimilar(holder, trimmed).isMatch) {
      return { officialName: holder, category: 'lapangan' };
    }
  }

  // Check Kantor Pusat
  for (const holder of config.pusat) {
    if (holder.toLowerCase() === trimmed.toLowerCase()) {
      return { officialName: holder, category: 'pusat' };
    }
  }
  for (const holder of config.pusat) {
    if (areNamesSimilar(holder, trimmed).isMatch) {
      return { officialName: holder, category: 'pusat' };
    }
  }

  return { officialName: toTitleCase(trimmed), category: 'unknown' };
}

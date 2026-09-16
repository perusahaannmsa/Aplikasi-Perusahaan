import { useState, useEffect, useCallback } from 'react';
import { AccurateAccount, RabCategory } from '../types';
import { DEFAULT_ACCURATE_ACCOUNTS } from '../data/accurateCoaData';

export const COA_STORAGE_KEY = 'accurate_coa_master_v1';
export const COA_UPDATE_EVENT = 'accurate_coa_updated';

// Project cost accounts to ensure standard RAB compatibility
export const STANDARD_PROJECT_RAB_ACCOUNTS: AccurateAccount[] = [
  { code: '5-1100', name: 'Beban Material & Bahan Proyek', category: 'Beban Pokok Penjualan', keywords: ['material', 'semen', 'besi', 'pasir', 'batu', 'kayu', 'cat'] },
  { code: '5-1200', name: 'Beban Upah & Tenaga Kerja Langsung', category: 'Beban Pokok Penjualan', keywords: ['upah', 'mandor', 'tukang', 'gaji lapangan', 'harian'] },
  { code: '5-1300', name: 'Beban Sewa Alat Berat & Mesin', category: 'Beban Pokok Penjualan', keywords: ['sewa alat', 'excavator', 'dozer', 'crane', 'loader', 'genset'] },
  { code: '5-1400', name: 'Beban Subkontraktor & Pekerjaan Spesialis', category: 'Beban Pokok Penjualan', keywords: ['subkon', 'subkontraktor', 'spesialis', 'borongan'] },
  { code: '5-1500', name: 'Beban Transportasi, Logistik & Angkutan', category: 'Beban Pokok Penjualan', keywords: ['logistik', 'angkutan', 'mobilisasi', 'demobilisasi', 'ekspedisi proyek'] },
  { code: '5-1600', name: 'Beban Operasional Lapangan & BBM', category: 'Beban Pokok Penjualan', keywords: ['bbm proyek', 'solar genset', 'operasional site', 'mess', 'air kerja'] },
  { code: '5-1700', name: 'Beban Overhead, K3 & Perizinan Proyek', category: 'Beban Pokok Penjualan', keywords: ['k3', 'safety', 'apd', 'helm', 'rompi', 'izin proyek', 'retribusi site'] },
  { code: '5-1900', name: 'Beban Lain-Lain & Cadangan Tak Terduga', category: 'Beban Pokok Penjualan', keywords: ['tak terduga', 'cadangan', 'lain-lain proyek'] },
];

/**
 * Get the initial unified COA accounts
 */
export function getUnifiedInitialAccounts(): AccurateAccount[] {
  const mergedMap = new Map<string, AccurateAccount>();

  // 1. Base DEFAULT_ACCURATE_ACCOUNTS
  DEFAULT_ACCURATE_ACCOUNTS.forEach(acc => {
    mergedMap.set(acc.code, { ...acc });
  });

  // 2. Ensure Project RAB Accounts are included
  STANDARD_PROJECT_RAB_ACCOUNTS.forEach(acc => {
    if (!mergedMap.has(acc.code)) {
      mergedMap.set(acc.code, { ...acc });
    }
  });

  return Array.from(mergedMap.values());
}

/**
 * Read COA accounts from localStorage with fallback
 */
export function getStoredCoaAccounts(): AccurateAccount[] {
  try {
    const stored = localStorage.getItem(COA_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure standard project RAB accounts exist in the list
        const codeSet = new Set(parsed.map((a: any) => a.code));
        let hasChanges = false;
        STANDARD_PROJECT_RAB_ACCOUNTS.forEach(projAcc => {
          if (!codeSet.has(projAcc.code)) {
            parsed.push(projAcc);
            hasChanges = true;
          }
        });
        if (hasChanges) {
          try {
            localStorage.setItem(COA_STORAGE_KEY, JSON.stringify(parsed));
          } catch (e) {}
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading COA from storage:', e);
  }

  const initial = getUnifiedInitialAccounts();
  try {
    localStorage.setItem(COA_STORAGE_KEY, JSON.stringify(initial));
  } catch (e) {}
  return initial;
}

/**
 * Save COA accounts to localStorage and dispatch event across the application
 */
export function saveCoaAccounts(accounts: AccurateAccount[]): void {
  try {
    localStorage.setItem(COA_STORAGE_KEY, JSON.stringify(accounts));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(COA_UPDATE_EVENT, { detail: { accounts } }));
    }
  } catch (e) {
    console.error('Error saving COA to storage:', e);
  }
}

/**
 * Add a new account to COA
 */
export function addCoaAccount(newAccount: AccurateAccount): AccurateAccount[] {
  const current = getStoredCoaAccounts();
  const exists = current.some(a => a.code.toLowerCase() === newAccount.code.toLowerCase());
  if (exists) {
    throw new Error(`Kode Akun ${newAccount.code} sudah terdaftar! Gunakan kode unik lain.`);
  }
  const updated = [...current, newAccount].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  saveCoaAccounts(updated);
  return updated;
}

/**
 * Update an existing account
 */
export function updateCoaAccount(code: string, partial: Partial<AccurateAccount>): AccurateAccount[] {
  const current = getStoredCoaAccounts();
  const updated = current.map(a => (a.code === code ? { ...a, ...partial } : a));
  saveCoaAccounts(updated);
  return updated;
}

/**
 * Delete an account by code
 */
export function deleteCoaAccount(code: string): AccurateAccount[] {
  const current = getStoredCoaAccounts();
  const updated = current.filter(a => a.code !== code);
  saveCoaAccounts(updated);
  return updated;
}

/**
 * Reset COA to full default
 */
export function resetCoaAccounts(): AccurateAccount[] {
  const initial = getUnifiedInitialAccounts();
  saveCoaAccounts(initial);
  return initial;
}

/**
 * Map an Accurate COA account to a Project RAB Category
 */
export function mapCoaToRabCategory(account: { code?: string; name?: string; category?: string }): RabCategory {
  const code = (account.code || '').toLowerCase();
  const name = (account.name || '').toLowerCase();
  const cat = (account.category || '').toLowerCase();

  // Explicit project RAB codes
  if (code.startsWith('5-1100') || name.includes('material') || name.includes('bahan')) return 'Material';
  if (code.startsWith('5-1200') || name.includes('upah') || name.includes('tenaga kerja') || code === '5107' || code === '600004') return 'Upah Tenaga Kerja';
  if (code.startsWith('5-1300') || name.includes('sewa alat') || name.includes('alat berat') || code === '5106') return 'Alat Berat & Peralatan';
  if (code.startsWith('5-1400') || name.includes('subkon') || name.includes('subkontraktor') || name.includes('spesialis')) return 'Subkontraktor';
  if (code.startsWith('5-1500') || name.includes('trucking') || name.includes('tongkang') || name.includes('logistik') || name.includes('transport') || code === '5103' || code === '5104') return 'Transportasi & Logistik';
  if (code.startsWith('5-1600') || name.includes('bbm') || name.includes('solar') || name.includes('bensin') || code === '5108' || code === '600003') return 'Operasional & BBM';
  if (code.startsWith('5-1700') || name.includes('overhead') || name.includes('k3') || name.includes('perizinan') || name.includes('legalitas') || code === '600024') return 'Overhead & Perizinan';

  // Specific 51xx or 60xx heuristics
  if (name.includes('surveyor') || code === '5102') return 'Subkontraktor';
  if (name.includes('katering') || name.includes('catering') || code === '5109' || code === '600007') return 'Operasional & BBM';
  if (cat.includes('beban pokok') || cat.includes('hpp')) return 'Operasional & BBM';
  if (cat.includes('operasional')) return 'Operasional & BBM';

  return 'Lain-lain';
}

/**
 * Custom React hook for synchronized COA state across all tabs & components
 */
export function useAccurateCoa() {
  const [accounts, setAccounts] = useState<AccurateAccount[]>(() => getStoredCoaAccounts());

  const refresh = useCallback(() => {
    setAccounts(getStoredCoaAccounts());
  }, []);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.accounts) {
        setAccounts(customEvent.detail.accounts);
      } else {
        refresh();
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === COA_STORAGE_KEY) {
        refresh();
      }
    };

    window.addEventListener(COA_UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(COA_UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refresh]);

  const save = useCallback((newAccounts: AccurateAccount[]) => {
    saveCoaAccounts(newAccounts);
    setAccounts(newAccounts);
  }, []);

  const add = useCallback((newAccount: AccurateAccount) => {
    const updated = addCoaAccount(newAccount);
    setAccounts(updated);
    return updated;
  }, []);

  const update = useCallback((code: string, partial: Partial<AccurateAccount>) => {
    const updated = updateCoaAccount(code, partial);
    setAccounts(updated);
    return updated;
  }, []);

  const remove = useCallback((code: string) => {
    const updated = deleteCoaAccount(code);
    setAccounts(updated);
    return updated;
  }, []);

  const reset = useCallback(() => {
    const updated = resetCoaAccounts();
    setAccounts(updated);
    return updated;
  }, []);

  return {
    accounts,
    saveAccounts: save,
    addAccount: add,
    updateAccount: update,
    deleteAccount: remove,
    resetAccounts: reset,
    refresh
  };
}

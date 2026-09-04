/**
 * Utility functions for detecting, clustering, and consolidating duplicate or
 * near-duplicate recipient names (dibayarkanKepada) and petty cash holders.
 *
 * Rules:
 * 1. Case-insensitivity: "SURYO PRANOTO" === "Suryo Pranoto" === "suryo pranoto"
 * 2. Incomplete / Substring / Word Subset: "Budi" merges with "Budi Santoso", "Suryo" with "Suryo Pranoto"
 * 3. Typo / Near-matching letters: Levenshtein distance & Token overlap
 * 4. Master canonical recommendation: Prioritizes registered petty cash holders & clean title-cased names
 */

import { Submission } from '../types';

export interface NameVariation {
  name: string;
  count: number;
  isHolder: boolean;
  sampleCodes: string[];
}

export interface NameCluster {
  id: string;
  canonicalName: string;
  originalCanonical: string;
  isPettyCashHolder: boolean;
  totalVouchers: number;
  variations: NameVariation[];
  matchReasons: string[];
  confidence: number;
}

/**
 * Converts any string to clean Indonesian Title Case
 * e.g. "SURYO PRANOTO" -> "Suryo Pranoto", "nur wahyudi" -> "Nur Wahyudi"
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  const clean = str.trim().replace(/\s+/g, ' ');
  return clean
    .split(' ')
    .map(word => {
      if (!word) return '';
      // Keep acronyms like PT, CV, SPBU, PLN if uppercase and short
      if (['PT', 'CV', 'SPBU', 'PLN', 'BCA', 'BRI', 'BNI', 'MANDIRI', 'HO'].includes(word.toUpperCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Strips common honorifics, punctuation, and extra prefixes/suffixes for similarity comparison
 */
export function cleanForComparison(str: string): string {
  if (!str) return '';
  let s = str.toLowerCase().trim();
  
  // Strip punctuation and special chars
  s = s.replace(/[\/\\()\[\]{}.,:;'"_!@#$%^&*+=~`-]/g, ' ');
  
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  // Remove common titles/honorifics for comparison only
  const titles = [
    'bpk', 'bapak', 'pak', 'ibu', 'bu', 'sdr', 'sdri', 'saudara',
    'toko', 'tb', 'pt', 'cv', 'ud', 'atas nama', 'a n', 'an',
    'lapangan', 'head office', 'ho'
  ];

  const words = s.split(' ');
  const filteredWords = words.filter(w => !titles.includes(w));
  
  return filteredWords.length > 0 ? filteredWords.join(' ') : s;
}

/**
 * Calculates Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[m][n];
}

/**
 * Calculates Levenshtein similarity score between 0 and 1
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / maxLen;
}

/**
 * Checks whether two names should be considered the same person / entity.
 * Returns whether it's a match, the confidence (0-1), and the primary reason.
 */
export function areNamesSimilar(
  nameA: string, 
  nameB: string
): { isMatch: boolean; confidence: number; reason: string } {
  const trimmedA = (nameA || '').trim();
  const trimmedB = (nameB || '').trim();

  if (!trimmedA || !trimmedB) {
    return { isMatch: false, confidence: 0, reason: '' };
  }

  // 1. Exact string match (identical)
  if (trimmedA === trimmedB) {
    return { isMatch: true, confidence: 1.0, reason: 'Identik' };
  }

  // 2. Case-insensitive equality
  if (trimmedA.toLowerCase() === trimmedB.toLowerCase()) {
    return { isMatch: true, confidence: 1.0, reason: 'Perbedaan Huruf Besar / Kecil' };
  }

  const cleanA = cleanForComparison(trimmedA);
  const cleanB = cleanForComparison(trimmedB);

  // 3. Comparison after stripping punctuation & honorifics
  if (cleanA === cleanB && cleanA.length > 0) {
    return { isMatch: true, confidence: 0.98, reason: 'Perbedaan Tanda Baca / Gelar (Pak/Bpk/Ibu)' };
  }

  const wordsA = cleanA.split(' ').filter(w => w.length > 0);
  const wordsB = cleanB.split(' ').filter(w => w.length > 0);

  // 4. Incomplete Name / Word Subset Match
  // e.g. "Budi" in "Budi Santoso", "Suryo" in "Suryo Pranoto", "Akbar" in "Muhammad Akbar"
  if (wordsA.length > 0 && wordsB.length > 0) {
    const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
    const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;

    // Check if every word in shorter is present in longer
    const allWordsInLonger = shorter.every(w => {
      // Must be at least 3 chars to avoid matching random single letters
      if (w.length < 3) {
        return longer.some(lw => lw === w || lw.startsWith(w));
      }
      return longer.includes(w);
    });

    if (allWordsInLonger) {
      // Shorter name contains at least 3 characters
      const shorterCombinedLen = shorter.join('').length;
      if (shorterCombinedLen >= 3) {
        return {
          isMatch: true,
          confidence: 0.92,
          reason: 'Nama Kurang Lengkap / Tambahan Kata'
        };
      }
    }
  }

  // 5. Prefix or Suffix Match
  // e.g. "Suryo Pranoto" vs "Suryo Pranoto Lapangan"
  if (cleanA.length >= 4 && cleanB.length >= 4) {
    if (cleanA.startsWith(cleanB) || cleanB.startsWith(cleanA)) {
      return {
        isMatch: true,
        confidence: 0.90,
        reason: 'Tambahan Nama Belakang / Keterangan'
      };
    }
  }

  // 6. Initials Match
  // e.g. "M. Akbar" vs "Muhammad Akbar" or "Andi D. Salsabila" vs "Andi Dhiya Salsabila"
  if (wordsA.length === wordsB.length && wordsA.length >= 2) {
    let matchesCount = 0;
    let initialCount = 0;
    for (let i = 0; i < wordsA.length; i++) {
      const wA = wordsA[i];
      const wB = wordsB[i];
      if (wA === wB) {
        matchesCount++;
      } else if (
        (wA.length === 1 && wB.startsWith(wA)) ||
        (wB.length === 1 && wA.startsWith(wB))
      ) {
        initialCount++;
      }
    }
    if (matchesCount + initialCount === wordsA.length && matchesCount >= 1) {
      return {
        isMatch: true,
        confidence: 0.88,
        reason: 'Singkatan Nama / Inisial'
      };
    }
  }

  // 7. Typo / Levenshtein Distance for similar length names (>= 5 chars)
  if (cleanA.length >= 5 && cleanB.length >= 5 && Math.abs(cleanA.length - cleanB.length) <= 2) {
    const sim = levenshteinSimilarity(cleanA, cleanB);
    if (sim >= 0.85) {
      return {
        isMatch: true,
        confidence: sim,
        reason: 'Kemiripan Huruf / Typo Ketik'
      };
    }
  }

  return { isMatch: false, confidence: 0, reason: '' };
}

/**
 * Scans all submissions and pettyCashHolders to detect duplicate or near-duplicate name clusters.
 */
export function findDuplicateNameClusters(
  submissions: Submission[],
  pettyCashHolders: string[]
): NameCluster[] {
  // 1. Gather all names with frequency and source
  const nameMap = new Map<string, { count: number; isHolder: boolean; sampleCodes: Set<string> }>();

  // Add holders
  pettyCashHolders.forEach(holder => {
    const h = holder.trim();
    if (!h) return;
    if (!nameMap.has(h)) {
      nameMap.set(h, { count: 0, isHolder: true, sampleCodes: new Set() });
    } else {
      nameMap.get(h)!.isHolder = true;
    }
  });

  // Add submissions recipients and custodians
  submissions.forEach(sub => {
    const penerima = sub.dibayarkanKepada?.trim();
    if (penerima) {
      if (!nameMap.has(penerima)) {
        nameMap.set(penerima, { count: 1, isHolder: false, sampleCodes: new Set([sub.kode]) });
      } else {
        const item = nameMap.get(penerima)!;
        item.count++;
        if (item.sampleCodes.size < 4 && sub.kode) item.sampleCodes.add(sub.kode);
      }
    }

    const custodian = sub.pettyCashCustodian?.trim();
    if (custodian && custodian !== penerima) {
      if (!nameMap.has(custodian)) {
        nameMap.set(custodian, { count: 1, isHolder: true, sampleCodes: new Set([sub.kode]) });
      } else {
        const item = nameMap.get(custodian)!;
        item.count++;
        item.isHolder = true;
        if (item.sampleCodes.size < 4 && sub.kode) item.sampleCodes.add(sub.kode);
      }
    }
  });

  const uniqueNames = Array.from(nameMap.keys());
  if (uniqueNames.length <= 1) return [];

  // 2. Cluster names using Connected Components (Disjoint Set)
  const parent = new Map<string, string>();
  const find = (n: string): string => {
    if (!parent.has(n)) parent.set(n, n);
    if (parent.get(n) !== n) {
      parent.set(n, find(parent.get(n)!));
    }
    return parent.get(n)!;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  };

  // Track match reasons between names
  const reasonMap = new Map<string, Set<string>>();

  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      const nA = uniqueNames[i];
      const nB = uniqueNames[j];
      const match = areNamesSimilar(nA, nB);
      if (match.isMatch) {
        union(nA, nB);
        const root = find(nA);
        if (!reasonMap.has(root)) reasonMap.set(root, new Set());
        reasonMap.get(root)!.add(match.reason);
      }
    }
  }

  // 3. Group by root
  const groups = new Map<string, string[]>();
  uniqueNames.forEach(name => {
    const root = find(name);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(name);
  });

  // 4. Build clusters for groups with > 1 variation
  const clusters: NameCluster[] = [];

  groups.forEach((members, _root) => {
    if (members.length <= 1) return; // No duplicates for this person

    // Determine the best Canonical Name
    // Rule:
    // a. An official petty cash holder in master list has highest priority
    // b. Otherwise, the longest, most complete Title Case name
    // c. Otherwise, the most frequently used
    let bestCanonical = members[0];
    let isGroupHolder = false;

    const holderInGroup = members.find(m => pettyCashHolders.includes(m));
    if (holderInGroup) {
      bestCanonical = holderInGroup;
      isGroupHolder = true;
    } else {
      // Find one that is Title Case and longest
      members.sort((a, b) => {
        const infoA = nameMap.get(a)!;
        const infoB = nameMap.get(b)!;
        // Prefer Title Case over ALL-CAPS or all-lower
        const aIsTitle = a !== a.toUpperCase() && a !== a.toLowerCase();
        const bIsTitle = b !== b.toUpperCase() && b !== b.toLowerCase();
        if (aIsTitle && !bIsTitle) return -1;
        if (!aIsTitle && bIsTitle) return 1;

        // Prefer longer name (more complete)
        if (b.length !== a.length) return b.length - a.length;

        // Prefer more frequent
        return infoB.count - infoA.count;
      });
      bestCanonical = toTitleCase(members[0]);
    }

    // Check if any member has isHolder = true
    if (!isGroupHolder) {
      isGroupHolder = members.some(m => nameMap.get(m)?.isHolder);
    }

    // Collect variations details
    let totalVouchers = 0;
    const variations: NameVariation[] = members.map(name => {
      const data = nameMap.get(name)!;
      totalVouchers += data.count;
      return {
        name,
        count: data.count,
        isHolder: data.isHolder || pettyCashHolders.includes(name),
        sampleCodes: Array.from(data.sampleCodes)
      };
    });

    // Sort variations: highest count first
    variations.sort((a, b) => b.count - a.count);

    const matchReasons = Array.from(reasonMap.get(find(members[0])) || ['Variasi Pengetikan Nama']);

    clusters.push({
      id: `cluster_${cleanForComparison(bestCanonical).replace(/\s+/g, '_')}`,
      canonicalName: toTitleCase(bestCanonical),
      originalCanonical: bestCanonical,
      isPettyCashHolder: isGroupHolder,
      totalVouchers,
      variations,
      matchReasons,
      confidence: 0.95
    });
  });

  // Sort clusters: most vouchers first
  clusters.sort((a, b) => b.totalVouchers - a.totalVouchers);

  return clusters;
}

/**
 * Executes name consolidation across all submissions, petty cash holders, and reports.
 */
export function applyNameConsolidation(params: {
  submissions: Submission[];
  pettyCashHolders: string[];
  pettyCashReports?: any[];
  clustersToMerge: {
    canonicalName: string;
    variants: string[];
    isPettyCashHolder?: boolean;
  }[];
}): {
  updatedSubmissions: Submission[];
  updatedPettyCashHolders: string[];
  updatedPettyCashReports: any[];
  modifiedSubmissionsCount: number;
} {
  const { submissions, pettyCashHolders, pettyCashReports = [], clustersToMerge } = params;

  // Build replacement map: variant.toLowerCase() -> canonicalName
  const replaceMap = new Map<string, string>();
  const holdersToAdd = new Set<string>();
  const holdersToRemove = new Set<string>();

  clustersToMerge.forEach(cluster => {
    const canonical = toTitleCase(cluster.canonicalName.trim());
    if (!canonical) return;

    if (cluster.isPettyCashHolder) {
      holdersToAdd.add(canonical);
    }

    cluster.variants.forEach(variant => {
      const vTrim = variant.trim();
      if (vTrim && vTrim.toLowerCase() !== canonical.toLowerCase()) {
        replaceMap.set(vTrim.toLowerCase(), canonical);
        holdersToRemove.add(vTrim.toLowerCase());
      } else if (vTrim && vTrim !== canonical) {
        // Same letters but different casing
        replaceMap.set(vTrim.toLowerCase(), canonical);
      }
    });
  });

  let modifiedSubmissionsCount = 0;

  // 1. Update Submissions
  const updatedSubmissions = submissions.map(sub => {
    let subModified = false;
    let newSub = { ...sub };

    // Update dibayarkanKepada
    const currentPenerima = sub.dibayarkanKepada?.trim();
    if (currentPenerima && replaceMap.has(currentPenerima.toLowerCase())) {
      const target = replaceMap.get(currentPenerima.toLowerCase())!;
      if (currentPenerima !== target) {
        newSub.dibayarkanKepada = target;
        subModified = true;
      }
    }

    // Update pettyCashCustodian
    const currentCustodian = sub.pettyCashCustodian?.trim();
    if (currentCustodian && replaceMap.has(currentCustodian.toLowerCase())) {
      const target = replaceMap.get(currentCustodian.toLowerCase())!;
      if (currentCustodian !== target) {
        newSub.pettyCashCustodian = target;
        subModified = true;
      }
    }

    // Update salaryDetails.namaKaryawan if applicable
    if (newSub.salaryDetails?.namaKaryawan) {
      const curSal = newSub.salaryDetails.namaKaryawan.trim();
      if (replaceMap.has(curSal.toLowerCase())) {
        const target = replaceMap.get(curSal.toLowerCase())!;
        if (curSal !== target) {
          newSub.salaryDetails = {
            ...newSub.salaryDetails,
            namaKaryawan: target
          };
          subModified = true;
        }
      }
    }

    // Update sppdRecord.namaPekerja if applicable
    if (newSub.sppdRecord && (newSub.sppdRecord.namaPekerja || newSub.sppdRecord.namaPegawai)) {
      const pName = (newSub.sppdRecord.namaPekerja || newSub.sppdRecord.namaPegawai || '').trim();
      if (replaceMap.has(pName.toLowerCase())) {
        const target = replaceMap.get(pName.toLowerCase())!;
        if (pName !== target) {
          newSub.sppdRecord = {
            ...newSub.sppdRecord,
            namaPekerja: target,
            namaPegawai: target
          };
          subModified = true;
        }
      }
    }

    if (subModified) {
      modifiedSubmissionsCount++;
      return newSub;
    }
    return sub;
  });

  // 2. Update Petty Cash Holders list
  // Normalize existing holders, remove replaced variants, add canonicals
  const finalHoldersSet = new Set<string>();

  pettyCashHolders.forEach(h => {
    const cleanH = h.trim();
    if (!cleanH) return;
    const lower = cleanH.toLowerCase();

    if (replaceMap.has(lower)) {
      finalHoldersSet.add(replaceMap.get(lower)!);
    } else if (!holdersToRemove.has(lower)) {
      finalHoldersSet.add(toTitleCase(cleanH));
    }
  });

  holdersToAdd.forEach(h => finalHoldersSet.add(toTitleCase(h)));

  const updatedPettyCashHolders = Array.from(finalHoldersSet).sort();

  // 3. Update Petty Cash Reports summary workerName
  const updatedPettyCashReports = pettyCashReports.map(rep => {
    const curWorker = rep.summary?.workerName?.trim();
    if (curWorker && replaceMap.has(curWorker.toLowerCase())) {
      const target = replaceMap.get(curWorker.toLowerCase())!;
      return {
        ...rep,
        summary: {
          ...rep.summary,
          workerName: target
        }
      };
    }
    return rep;
  });

  return {
    updatedSubmissions,
    updatedPettyCashHolders,
    updatedPettyCashReports,
    modifiedSubmissionsCount
  };
}

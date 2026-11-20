export interface FirestoreQuotaMetrics {
  date: string; // YYYY-MM-DD
  readsToday: number;
  writesToday: number;
  deletesToday: number;
  totalReadsAllTime: number;
  totalWritesAllTime: number;
  totalDeletesAllTime: number;
  lastOperation?: {
    type: 'READ' | 'WRITE' | 'DELETE';
    collection: string;
    count: number;
    timestamp: string;
    details?: string;
  };
  recentLogs: Array<{
    id: string;
    type: 'READ' | 'WRITE' | 'DELETE';
    collection: string;
    count: number;
    timestamp: string;
    details?: string;
  }>;
  collectionCounts: {
    workers: number;
    npwp_records: number;
    submissions: number;
    attendance: number;
  };
  quotaLimitSpark: {
    reads: number;
    writes: number;
    deletes: number;
    storageBytes: number;
  };
  status: 'safe' | 'warning' | 'exhausted';
  lastSyncTime: string;
}

const STORAGE_KEY = 'nmsa_firestore_quota_metrics_v2';

export const SPARK_LIMITS = {
  reads: 50000,
  writes: 20000,
  deletes: 20000,
  storageBytes: 1024 * 1024 * 1024, // 1 GiB
};

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getFirestoreQuotaMetrics(): FirestoreQuotaMetrics {
  const today = getTodayDateString();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // If stored metric is from a previous day, roll over daily counters
        if (parsed.date !== today) {
          parsed.date = today;
          parsed.readsToday = 0;
          parsed.writesToday = 0;
          parsed.deletesToday = 0;
          parsed.status = 'safe';
        }
        if (!parsed.quotaLimitSpark) {
          parsed.quotaLimitSpark = SPARK_LIMITS;
        }
        if (!parsed.collectionCounts) {
          parsed.collectionCounts = { workers: 0, npwp_records: 0, submissions: 0, attendance: 1 };
        }
        if (!Array.isArray(parsed.recentLogs)) {
          parsed.recentLogs = [];
        }
        return parsed as FirestoreQuotaMetrics;
      }
    }
  } catch (e) {
    console.warn('Error reading firestore quota metrics:', e);
  }

  // Default initial metrics
  const initial: FirestoreQuotaMetrics = {
    date: today,
    readsToday: 0,
    writesToday: 0,
    deletesToday: 0,
    totalReadsAllTime: 0,
    totalWritesAllTime: 0,
    totalDeletesAllTime: 0,
    recentLogs: [],
    collectionCounts: {
      workers: 0,
      npwp_records: 0,
      submissions: 0,
      attendance: 1,
    },
    quotaLimitSpark: SPARK_LIMITS,
    status: 'safe',
    lastSyncTime: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  } catch (_) {}

  return initial;
}

export function saveFirestoreQuotaMetrics(metrics: FirestoreQuotaMetrics): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-quota-metric-updated', { detail: metrics }));
    }
  } catch (e) {
    console.warn('Error saving firestore quota metrics:', e);
  }
}

/**
 * Record a Firestore Read, Write, or Delete operation to keep quota usage accurate and transparent
 */
export function recordFirestoreOperation(
  type: 'READ' | 'WRITE' | 'DELETE',
  collectionName: string,
  count = 1,
  details?: string
): void {
  if (count <= 0) return;

  const metrics = getFirestoreQuotaMetrics();
  const today = getTodayDateString();

  if (metrics.date !== today) {
    metrics.date = today;
    metrics.readsToday = 0;
    metrics.writesToday = 0;
    metrics.deletesToday = 0;
  }

  if (type === 'READ') {
    metrics.readsToday += count;
    metrics.totalReadsAllTime += count;
  } else if (type === 'WRITE') {
    metrics.writesToday += count;
    metrics.totalWritesAllTime += count;
  } else if (type === 'DELETE') {
    metrics.deletesToday += count;
    metrics.totalDeletesAllTime += count;
  }

  // Determine status
  const readPct = (metrics.readsToday / SPARK_LIMITS.reads) * 100;
  const writePct = (metrics.writesToday / SPARK_LIMITS.writes) * 100;
  const maxPct = Math.max(readPct, writePct);

  if (maxPct >= 100) {
    metrics.status = 'exhausted';
  } else if (maxPct >= 70) {
    metrics.status = 'warning';
  } else {
    metrics.status = 'safe';
  }

  const nowIso = new Date().toISOString();
  metrics.lastSyncTime = nowIso;
  metrics.lastOperation = {
    type,
    collection: collectionName,
    count,
    timestamp: nowIso,
    details,
  };

  const newLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    type,
    collection: collectionName,
    count,
    timestamp: nowIso,
    details,
  };

  metrics.recentLogs = [newLog, ...(metrics.recentLogs || [])].slice(0, 35);

  saveFirestoreQuotaMetrics(metrics);
}

export function updateFirestoreCollectionCounts(
  counts: Partial<FirestoreQuotaMetrics['collectionCounts']>
): void {
  const metrics = getFirestoreQuotaMetrics();
  metrics.collectionCounts = {
    ...metrics.collectionCounts,
    ...counts,
  };
  metrics.lastSyncTime = new Date().toISOString();
  saveFirestoreQuotaMetrics(metrics);
}

export function resetFirestoreDailyQuotaMetrics(): void {
  const metrics = getFirestoreQuotaMetrics();
  metrics.readsToday = 0;
  metrics.writesToday = 0;
  metrics.deletesToday = 0;
  metrics.status = 'safe';
  metrics.lastSyncTime = new Date().toISOString();
  saveFirestoreQuotaMetrics(metrics);
}

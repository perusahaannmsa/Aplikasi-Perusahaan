const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const INDO_MONTH_MAP: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

export function getRomanMonth(monthNumber: number): string {
  const index = Math.max(1, Math.min(12, monthNumber)) - 1;
  return ROMAN_MONTHS[index] || 'I';
}

export function parseMonthAndYear(dateStr?: string): { month: number; year: number } {
  const now = new Date();
  if (!dateStr) {
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length >= 3) {
    const monthName = parts[1].toLowerCase();
    const parsedYear = parseInt(parts[2], 10);
    if (INDO_MONTH_MAP[monthName] && !isNaN(parsedYear)) {
      return { month: INDO_MONTH_MAP[monthName], year: parsedYear };
    }
  }
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function generateNextSppdNumber(
  dateStr?: string,
  historyList: any[] = []
): string {
  const { month, year } = parseMonthAndYear(dateStr);
  const romanMonth = getRomanMonth(month);
  
  let maxSeq = 0;
  const pattern = new RegExp(`SPPD-NMSA\\/${romanMonth}\\/${year}\\/(\\d+)`, 'i');
  
  historyList.forEach((item) => {
    if (item.noPengajuan || item.noSppd) {
      const numStr = item.noPengajuan || item.noSppd;
      const match = numStr.match(pattern);
      if (match && match[1]) {
        const seq = parseInt(match[1], 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
  });

  try {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const savedCounters = JSON.parse(localStorage.getItem('sppd_monthly_counters') || '{}');
    const storedSeq = savedCounters[monthKey] || 0;
    if (storedSeq > maxSeq) {
      maxSeq = storedSeq;
    }
  } catch (e) {
    console.error('Failed to read sppd_monthly_counters', e);
  }

  const nextSeq = maxSeq + 1;
  const paddedSeq = String(nextSeq).padStart(3, '0');
  return `SPPD-NMSA/${romanMonth}/${year}/${paddedSeq}`;
}

export function saveSppdNumberUsage(sppdNumber: string, dateStr?: string): void {
  try {
    const { month, year } = parseMonthAndYear(dateStr);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    
    const parts = sppdNumber.split('/');
    const lastPart = parts[parts.length - 1];
    const seq = parseInt(lastPart, 10);
    if (!isNaN(seq)) {
      const savedCounters = JSON.parse(localStorage.getItem('sppd_monthly_counters') || '{}');
      const currentStored = savedCounters[monthKey] || 0;
      if (seq > currentStored) {
        savedCounters[monthKey] = seq;
        localStorage.setItem('sppd_monthly_counters', JSON.stringify(savedCounters));
      }
    }
  } catch (e) {
    console.error('Failed to save SPPD number counter', e);
  }
}

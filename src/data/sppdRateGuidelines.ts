export interface SppdPositionRate {
  nominal: number;
  spec?: string; // e.g. "Ekonomi", "Kelas Argo", "Ekonomi - Non Garuda"
}

export interface SppdRateGuidelineItem {
  id: string;
  no: number;
  item: string;
  unit: string;
  rates: {
    direktur: SppdPositionRate;
    wakil_direktur: SppdPositionRate;
    gm_pimpro: SppdPositionRate;
    manager: SppdPositionRate;
    supervisor: SppdPositionRate;
    staf: SppdPositionRate;
  };
  keterangan: string;
  defaultCoaCode: string;
  defaultCoaName: string;
  keywords: string[];
}

export const SPPD_POSITIONS = [
  { key: 'direktur', label: 'Direktur', shortLabel: 'Direktur' },
  { key: 'wakil_direktur', label: 'Wakil Direktur', shortLabel: 'Wadir' },
  { key: 'gm_pimpro', label: 'General Manager / Pim.Pro', shortLabel: 'GM / PimPro' },
  { key: 'manager', label: 'Manager', shortLabel: 'Manager' },
  { key: 'supervisor', label: 'Supervisor', shortLabel: 'SPV' },
  { key: 'staf', label: 'Staf', shortLabel: 'Staf' },
] as const;

export type SppdPositionKey = typeof SPPD_POSITIONS[number]['key'];

export const SPPD_RATE_GUIDELINES: SppdRateGuidelineItem[] = [
  {
    id: 'sppd_1',
    no: 1,
    item: 'Uang Makan / Hari',
    unit: 'Per Hari',
    rates: {
      direktur: { nominal: 300000 },
      wakil_direktur: { nominal: 250000 },
      gm_pimpro: { nominal: 250000 },
      manager: { nominal: 200000 },
      supervisor: { nominal: 100000 },
      staf: { nominal: 100000 },
    },
    keterangan: 'Per Hari',
    defaultCoaCode: '610101',
    defaultCoaName: 'Biaya Perjalanan Dinas - Uang Makan',
    keywords: ['uang makan', 'makan', 'konsumsi dinas', 'meal', 'lunch', 'dinner', 'sarapan']
  },
  {
    id: 'sppd_2',
    no: 2,
    item: 'Uang Saku',
    unit: 'Per Hari',
    rates: {
      direktur: { nominal: 250000 },
      wakil_direktur: { nominal: 200000 },
      gm_pimpro: { nominal: 150000 },
      manager: { nominal: 125000 },
      supervisor: { nominal: 100000 },
      staf: { nominal: 100000 },
    },
    keterangan: 'Per Hari',
    defaultCoaCode: '610102',
    defaultCoaName: 'Biaya Perjalanan Dinas - Uang Saku',
    keywords: ['uang saku', 'saku', 'pocket money', 'allowance', 'lumpsum']
  },
  {
    id: 'sppd_3',
    no: 3,
    item: 'Transport Jkt - Bandara/Stasiun (1x)',
    unit: '1x jalan',
    rates: {
      direktur: { nominal: 300000 },
      wakil_direktur: { nominal: 300000 },
      gm_pimpro: { nominal: 300000 },
      manager: { nominal: 300000 },
      supervisor: { nominal: 200000 },
      staf: { nominal: 200000 },
    },
    keterangan: '1x jalan',
    defaultCoaCode: '610103',
    defaultCoaName: 'Biaya Perjalanan Dinas - Transport Bandara / Stasiun',
    keywords: ['transport jkt', 'bandara', 'stasiun', 'taksi bandara', 'grab bandara', 'tol bandara']
  },
  {
    id: 'sppd_4',
    no: 4,
    item: 'Transport Bandara - Hotel',
    unit: '1x jalan',
    rates: {
      direktur: { nominal: 300000 },
      wakil_direktur: { nominal: 300000 },
      gm_pimpro: { nominal: 300000 },
      manager: { nominal: 300000 },
      supervisor: { nominal: 200000 },
      staf: { nominal: 200000 },
    },
    keterangan: '1x jalan',
    defaultCoaCode: '610104',
    defaultCoaName: 'Biaya Perjalanan Dinas - Transport Bandara-Hotel',
    keywords: ['bandara - hotel', 'bandara hotel', 'transport hotel', 'taksi hotel', 'antar jemput']
  },
  {
    id: 'sppd_5',
    no: 5,
    item: 'Tiket Pesawat',
    unit: 'Tiket',
    rates: {
      direktur: { nominal: 0, spec: 'Ekonomi' },
      wakil_direktur: { nominal: 0, spec: 'Ekonomi' },
      gm_pimpro: { nominal: 0, spec: 'Ekonomi - Non Garuda' },
      manager: { nominal: 0, spec: 'Ekonomi - Non Garuda' },
      supervisor: { nominal: 0, spec: 'Ekonomi - Non Garuda' },
      staf: { nominal: 0, spec: 'Ekonomi - Non Garuda' },
    },
    keterangan: 'Tergantung Tujuan, Tiket diproses bag. Keuangan.',
    defaultCoaCode: '610105',
    defaultCoaName: 'Biaya Perjalanan Dinas - Tiket Pesawat',
    keywords: ['tiket pesawat', 'pesawat', 'flight', 'garuda', 'batik', 'citilink', 'lion', 'super air jet']
  },
  {
    id: 'sppd_6',
    no: 6,
    item: 'Tiket Kereta Api',
    unit: 'Tiket',
    rates: {
      direktur: { nominal: 0, spec: 'Kelas Argo' },
      wakil_direktur: { nominal: 0, spec: 'Kelas Argo' },
      gm_pimpro: { nominal: 0, spec: 'Kelas Argo' },
      manager: { nominal: 0, spec: 'Kelas Argo' },
      supervisor: { nominal: 0, spec: 'Ekonomi' },
      staf: { nominal: 0, spec: 'Ekonomi' },
    },
    keterangan: 'Tergantung Tujuan, Tiket diproses bag. Keuangan.',
    defaultCoaCode: '610106',
    defaultCoaName: 'Biaya Perjalanan Dinas - Tiket Kereta Api',
    keywords: ['tiket kereta', 'kereta api', 'kai', 'argo', 'whoosh', 'kereta cepat']
  },
  {
    id: 'sppd_7',
    no: 7,
    item: 'Hotel / Hari',
    unit: 'Per Hari',
    rates: {
      direktur: { nominal: 750000 },
      wakil_direktur: { nominal: 650000 },
      gm_pimpro: { nominal: 600000 },
      manager: { nominal: 500000 },
      supervisor: { nominal: 450000 },
      staf: { nominal: 400000 },
    },
    keterangan: 'Tergantung Tujuan, Tiket/Hotel diproses bag. Keuangan.',
    defaultCoaCode: '610107',
    defaultCoaName: 'Biaya Perjalanan Dinas - Penginapan / Hotel',
    keywords: ['hotel', 'penginapan', 'lodging', 'room', 'kamar hotel', 'homestay', 'mess']
  },
  {
    id: 'sppd_8',
    no: 8,
    item: 'Sewa Mobil/Hari (Standar Avanza) + Sopir + BBM',
    unit: 'Per Hari',
    rates: {
      direktur: { nominal: 750000 },
      wakil_direktur: { nominal: 750000 },
      gm_pimpro: { nominal: 750000 },
      manager: { nominal: 750000 },
      supervisor: { nominal: 600000 },
      staf: { nominal: 500000 },
    },
    keterangan: 'Nilai tergantung dari masing-masing Daerah',
    defaultCoaCode: '610108',
    defaultCoaName: 'Biaya Perjalanan Dinas - Sewa Mobil Standar (Avanza)',
    keywords: ['sewa mobil', 'avanza', 'rental mobil', 'sopir bbm', 'mobil operasional dinas', 'xenia', 'innova']
  },
  {
    id: 'sppd_9',
    no: 9,
    item: 'Sewa Mobil/Hari (Double Cabin) + Sopir + BBM',
    unit: 'Per Hari',
    rates: {
      direktur: { nominal: 1500000 },
      wakil_direktur: { nominal: 1500000 },
      gm_pimpro: { nominal: 1500000 },
      manager: { nominal: 1500000 },
      supervisor: { nominal: 1500000 },
      staf: { nominal: 1500000 },
    },
    keterangan: 'Nilai tergantung dari masing-masing Daerah',
    defaultCoaCode: '610109',
    defaultCoaName: 'Biaya Perjalanan Dinas - Sewa Mobil Double Cabin (4x4)',
    keywords: ['double cabin', 'dcabin', 'hilux', 'triton', 'd-max', '4x4', 'tambang', 'site visit']
  },
];

/**
 * Intelligent helper to auto-match an SPPD item description to the official guideline categories
 */
export function matchSppdItemToGuideline(itemDesc: string, customGuidelines: SppdRateGuidelineItem[] = SPPD_RATE_GUIDELINES): SppdRateGuidelineItem | null {
  if (!itemDesc) return null;
  const lower = itemDesc.toLowerCase();
  const list = customGuidelines && customGuidelines.length > 0 ? customGuidelines : SPPD_RATE_GUIDELINES;

  // 1. Try exact keyword matching
  for (const guide of list) {
    if (guide.keywords && guide.keywords.some(kw => kw && lower.includes(kw.toLowerCase()))) {
      return guide;
    }
  }

  // 2. Fallback match on item title words
  for (const guide of list) {
    const titleWords = guide.item.toLowerCase().split(/[\s/()+-]+/).filter(w => w.length > 2);
    if (titleWords.some(w => lower.includes(w))) {
      return guide;
    }
  }

  return null;
}

/**
 * Detect position key from position text string
 */
export function detectSppdPositionKey(positionStr: string): SppdPositionKey {
  if (!positionStr) return 'staf';
  const lower = positionStr.toLowerCase();

  if (lower.includes('wakil') && lower.includes('direktur')) return 'wakil_direktur';
  if (lower.includes('direktur utama') || lower.includes('direktur') || lower.includes('director')) return 'direktur';
  if (lower.includes('general manager') || lower.includes('gm') || lower.includes('pimpro') || lower.includes('pimpinan proyek')) return 'gm_pimpro';
  if (lower.includes('manager') || lower.includes('manajer') || lower.includes('kabag') || lower.includes('kepala bagian')) return 'manager';
  if (lower.includes('supervisor') || lower.includes('spv') || lower.includes('koordinator') || lower.includes('lead')) return 'supervisor';
  
  return 'staf';
}

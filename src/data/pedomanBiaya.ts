export type JabatanDinas = 'Direktur' | 'Wakil Direktur' | 'General Manager / Pim.Pro' | 'Manager' | 'Supervisor' | 'Staf';

export interface RatePedoman {
  jabatan: JabatanDinas;
  uangMakanPerHari: number; // Item 1
  uangSakuPerHari: number;  // Item 2
  transportJkt: number;     // Item 3 (1x jalan)
  transportBandara: number; // Item 4 (1x jalan)
  tiketPesawatRate: number; // Standard reference rate for plane
  hotelPerMalam: number;    // Item 7
  sewaMobilAvanza: number;  // Item 8 (Per hari)
  sewaMobilDoubleCabin: number; // Item 9 (Per hari)
}

export const DEFAULT_PEDOMAN_BIAYA_MATRIX: RatePedoman[] = [
  {
    jabatan: 'Direktur',
    uangMakanPerHari: 300000,
    uangSakuPerHari: 250000,
    transportJkt: 300000,
    transportBandara: 300000,
    tiketPesawatRate: 3500000,
    hotelPerMalam: 750000,
    sewaMobilAvanza: 750000,
    sewaMobilDoubleCabin: 1500000,
  },
  {
    jabatan: 'Wakil Direktur',
    uangMakanPerHari: 250000,
    uangSakuPerHari: 200000,
    transportJkt: 300000,
    transportBandara: 300000,
    tiketPesawatRate: 3000000,
    hotelPerMalam: 650000,
    sewaMobilAvanza: 750000,
    sewaMobilDoubleCabin: 1500000,
  },
  {
    jabatan: 'General Manager / Pim.Pro',
    uangMakanPerHari: 250000,
    uangSakuPerHari: 150000,
    transportJkt: 300000,
    transportBandara: 300000,
    tiketPesawatRate: 2500000,
    hotelPerMalam: 600000,
    sewaMobilAvanza: 750000,
    sewaMobilDoubleCabin: 1500000,
  },
  {
    jabatan: 'Manager',
    uangMakanPerHari: 200000,
    uangSakuPerHari: 125000,
    transportJkt: 300000,
    transportBandara: 300000,
    tiketPesawatRate: 2000000,
    hotelPerMalam: 500000,
    sewaMobilAvanza: 750000,
    sewaMobilDoubleCabin: 1500000,
  },
  {
    jabatan: 'Supervisor',
    uangMakanPerHari: 100000,
    uangSakuPerHari: 100000,
    transportJkt: 200000,
    transportBandara: 200000,
    tiketPesawatRate: 1500000,
    hotelPerMalam: 450000,
    sewaMobilAvanza: 500000,
    sewaMobilDoubleCabin: 1500000,
  },
  {
    jabatan: 'Staf',
    uangMakanPerHari: 100000,
    uangSakuPerHari: 100000,
    transportJkt: 200000,
    transportBandara: 200000,
    tiketPesawatRate: 1500000,
    hotelPerMalam: 400000,
    sewaMobilAvanza: 500000,
    sewaMobilDoubleCabin: 1500000,
  },
];

export function getStoredPedomanMatrix(): RatePedoman[] {
  try {
    const saved = localStorage.getItem('sppd_pedoman_rates');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load stored pedoman rates', e);
  }
  return DEFAULT_PEDOMAN_BIAYA_MATRIX;
}

export function savePedomanMatrix(matrix: RatePedoman[]): void {
  try {
    localStorage.setItem('sppd_pedoman_rates', JSON.stringify(matrix));
  } catch (e) {
    console.error('Failed to save pedoman rates', e);
  }
}

export function getPedomanByJabatan(jabatan: JabatanDinas, customMatrix?: RatePedoman[]): RatePedoman {
  const matrix = customMatrix || getStoredPedomanMatrix();
  return (
    matrix.find((p) => p.jabatan === jabatan) ||
    matrix[matrix.length - 1]
  );
}

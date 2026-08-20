import React, { useState } from 'react';
import { SPPDRecord } from './SppdManager';
import { NusantaraLogo } from './NusantaraLogo';
import { Printer, ArrowLeft, Download, CheckCircle, FileText, MapPin, Calendar, User, Briefcase, Share2, Copy, Check } from 'lucide-react';
import { formatDateIndonesian } from '../utils';

interface PrintSppdDocumentProps {
  sppd: SPPDRecord;
  onBack?: () => void;
  onEdit?: () => void;
  onPostToVoucher?: () => void;
  isPublicView?: boolean;
}

// Convert number to Indonesian words
function terbilangAngka(nominal: number): string {
  const bilangan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  nominal = Math.floor(Math.abs(nominal));
  
  if (nominal < 12) {
    return bilangan[nominal];
  } else if (nominal < 20) {
    return terbilangAngka(nominal - 10) + ' Belas';
  } else if (nominal < 100) {
    return terbilangAngka(Math.floor(nominal / 10)) + ' Puluh ' + terbilangAngka(nominal % 10);
  } else if (nominal < 200) {
    return 'Seratus ' + terbilangAngka(nominal - 100);
  } else if (nominal < 1000) {
    return terbilangAngka(Math.floor(nominal / 100)) + ' Ratus ' + terbilangAngka(nominal % 100);
  } else if (nominal < 2000) {
    return 'Seribu ' + terbilangAngka(nominal - 1000);
  } else if (nominal < 1000000) {
    return terbilangAngka(Math.floor(nominal / 1000)) + ' Ribu ' + terbilangAngka(nominal % 1000);
  } else if (nominal < 1000000000) {
    return terbilangAngka(Math.floor(nominal / 1000000)) + ' Juta ' + terbilangAngka(nominal % 1000000);
  } else if (nominal < 1000000000000) {
    return terbilangAngka(Math.floor(nominal / 1000000000)) + ' Miliar ' + terbilangAngka(nominal % 1000000000);
  }
  return '';
}

export function terbilangRupiah(nominal: number): string {
  if (!nominal || nominal === 0) return 'Nol Rupiah';
  const hasil = terbilangAngka(nominal).replace(/\s+/g, ' ').trim();
  return hasil + ' Rupiah';
}

// Interface for consolidated official SPPD printable cost item
export interface ConsolidatedCostItem {
  no: number;
  kategori: string;
  rincian: string;
  hargaAcuan: string | number;
  jumlah: number;
  rawJumlah?: number;
  eliminatedAmount?: number;
}

// Consolidate raw/itemized transactions into official non-duplicate SPPD categories
export function consolidateSppdCostItems(
  costItems: Array<{
    id?: string;
    kategori?: string;
    rincian?: string;
    hargaAcuan?: number | string;
    jumlah?: number;
    date?: string;
  }> = [],
  lamaPerjalananStr: string = '4 Hari',
  jabatanStr?: string
): ConsolidatedCostItem[] {
  if (!costItems || costItems.length === 0) return [];

  // 1. Determine trip duration in days
  let durationDays = 4;
  const matchNum = (lamaPerjalananStr || '').match(/(\d+)\s*Hari/i) || (lamaPerjalananStr || '').match(/(\d+)/);
  if (matchNum) {
    const parsed = parseInt(matchNum[1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      durationDays = parsed;
    }
  }

  // 2. Determine daily meal and pocket benchmarks based on position
  let dailyMealRate = 100000;
  let dailyPocketRate = 100000;
  const jabLower = (jabatanStr || '').toLowerCase();
  if (jabLower.includes('direktur utama') || (jabLower.includes('direktur') && !jabLower.includes('wakil'))) {
    dailyMealRate = 300000;
    dailyPocketRate = 250000;
  } else if (jabLower.includes('wakil') && jabLower.includes('direktur')) {
    dailyMealRate = 250000;
    dailyPocketRate = 200000;
  } else if (jabLower.includes('gm') || jabLower.includes('pimpro') || jabLower.includes('general manager') || jabLower.includes('pimpinan proyek')) {
    dailyMealRate = 250000;
    dailyPocketRate = 150000;
  } else if (jabLower.includes('manager') || jabLower.includes('manajer') || jabLower.includes('kabag')) {
    dailyMealRate = 200000;
    dailyPocketRate = 125000;
  } else if (jabLower.includes('supervisor') || jabLower.includes('spv')) {
    dailyMealRate = 100000;
    dailyPocketRate = 100000;
  } else {
    dailyMealRate = 100000; // Staf standard rate
    dailyPocketRate = 100000;
  }

  // 3. Buckets for 9 official categories
  const buckets: {
    [key: string]: {
      kategori: string;
      order: number;
      defaultAcuan: string | number;
      items: Array<{ rincian: string; jumlah: number; hargaAcuan?: number; date?: string }>;
    };
  } = {
    transport_jkt: {
      kategori: 'Transport Jkt - Bandara/Stasiun (1x)',
      order: 1,
      defaultAcuan: 200000,
      items: []
    },
    makan: {
      kategori: 'Uang Makan / Hari',
      order: 2,
      defaultAcuan: dailyMealRate,
      items: []
    },
    saku: {
      kategori: 'Uang Saku',
      order: 3,
      defaultAcuan: dailyPocketRate,
      items: []
    },
    transport_hotel: {
      kategori: 'Transport Bandara - Hotel',
      order: 4,
      defaultAcuan: 200000,
      items: []
    },
    tiket_pesawat: {
      kategori: 'Tiket Pesawat',
      order: 5,
      defaultAcuan: 'Sesuai Keuangan',
      items: []
    },
    tiket_kereta: {
      kategori: 'Tiket Kereta Api',
      order: 6,
      defaultAcuan: 'Sesuai Keuangan',
      items: []
    },
    hotel: {
      kategori: 'Hotel / Hari',
      order: 7,
      defaultAcuan: 400000,
      items: []
    },
    mobil_standar: {
      kategori: 'Sewa Mobil/Hari (Standar Avanza) + Sopir + BBM',
      order: 8,
      defaultAcuan: 500000,
      items: []
    },
    mobil_dcabin: {
      kategori: 'Sewa Mobil/Hari (Double Cabin) + Sopir + BBM',
      order: 9,
      defaultAcuan: 1500000,
      items: []
    }
  };

  // 4. Classify each incoming item into the correct official bucket
  costItems.forEach(item => {
    const rawKat = (item.kategori || '').toLowerCase().trim();
    const rawRincian = (item.rincian || '').toLowerCase().trim();
    const combined = `${rawKat} ${rawRincian}`;
    const amount = Number(item.jumlah) || 0;
    const acuan = typeof item.hargaAcuan === 'number' ? item.hargaAcuan : undefined;
    const itemDate = item.date || '';

    if (
      combined.includes('jkt - bandara') ||
      combined.includes('rumah - bandara') ||
      combined.includes('bandara - rumah') ||
      combined.includes('transport jkt') ||
      combined.includes('transport lokal jakarta') ||
      combined.includes('stasiun') ||
      (rawKat.includes('transport') && (rawKat.includes('jkt') || rawKat.includes('stasiun') || rawRincian.includes('rumah')))
    ) {
      buckets.transport_jkt.items.push({ rincian: item.rincian || 'Transport Bandara / Stasiun', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else if (
      combined.includes('bandara - hotel') ||
      combined.includes('hotel - bandara') ||
      combined.includes('bandara hotel') ||
      combined.includes('taksi') ||
      combined.includes('taxi') ||
      combined.includes('antar pak') ||
      combined.includes('antar jemput') ||
      (rawKat.includes('transport') && (rawKat.includes('hotel') || rawKat.includes('bandara')))
    ) {
      buckets.transport_hotel.items.push({ rincian: item.rincian || 'Transport Bandara - Hotel', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else if (
      combined.includes('pesawat') ||
      combined.includes('tiket pesawat') ||
      combined.includes('flight') ||
      combined.includes('boarding pass') ||
      combined.includes('garuda') ||
      combined.includes('lion') ||
      combined.includes('citilink') ||
      combined.includes('batik')
    ) {
      buckets.tiket_pesawat.items.push({ rincian: item.rincian || 'Tiket Pesawat PP', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else if (
      combined.includes('kereta') ||
      combined.includes('kai') ||
      combined.includes('whoosh') ||
      combined.includes('argo')
    ) {
      buckets.tiket_kereta.items.push({ rincian: item.rincian || 'Tiket Kereta Api', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else if (
      combined.includes('double cabin') ||
      combined.includes('dcabin') ||
      combined.includes('hilux') ||
      combined.includes('triton') ||
      combined.includes('4x4') ||
      combined.includes('tambang')
    ) {
      buckets.mobil_dcabin.items.push({ rincian: item.rincian || 'Sewa Mobil Double Cabin', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else if (
      combined.includes('sewa mobil') ||
      combined.includes('avanza') ||
      combined.includes('innova') ||
      combined.includes('xenia') ||
      combined.includes('rental mobil')
    ) {
      buckets.mobil_standar.items.push({ rincian: item.rincian || 'Sewa Mobil Standar', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else if (
      combined.includes('hotel') ||
      combined.includes('penginapan') ||
      combined.includes('lodging') ||
      combined.includes('kamar') ||
      combined.includes('santika') ||
      combined.includes('clarion') ||
      combined.includes('aston')
    ) {
      buckets.hotel.items.push({ rincian: item.rincian || 'Penginapan / Hotel', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else if (
      combined.includes('makan') ||
      combined.includes('konsumsi') ||
      combined.includes('lunch') ||
      combined.includes('dinner') ||
      combined.includes('sarapan') ||
      combined.includes('coto') ||
      combined.includes('sop saudara') ||
      combined.includes('kfc') ||
      combined.includes('marannu') ||
      combined.includes('warung') ||
      rawKat.includes('makan')
    ) {
      buckets.makan.items.push({ rincian: item.rincian || 'Uang Makan', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else if (
      combined.includes('saku') ||
      combined.includes('allowance') ||
      combined.includes('jajanan') ||
      combined.includes('snack') ||
      combined.includes('korean grill') ||
      combined.includes('grill') ||
      combined.includes('pocket') ||
      combined.includes('kopi') ||
      combined.includes('cemilan') ||
      rawKat.includes('saku')
    ) {
      buckets.saku.items.push({ rincian: item.rincian || 'Uang Saku / Jajanan', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    } else {
      // Default fallback
      buckets.saku.items.push({ rincian: item.rincian || item.kategori || 'Pengeluaran Lainnya', jumlah: amount, hargaAcuan: acuan, date: itemDate });
    }
  });

  // 5. Intelligent Calculation of Uang Makan: Daily Cap & Spillover to Uang Saku
  const rawMealItems = buckets.makan.items;
  const maxMealAllowed = durationDays * dailyMealRate;

  // Check if we have date-specific meal entries
  const mealByDate: { [dateKey: string]: number } = {};
  let itemsWithDateCount = 0;
  rawMealItems.forEach(mi => {
    if (mi.date && mi.date.trim()) {
      itemsWithDateCount++;
      mealByDate[mi.date] = (mealByDate[mi.date] || 0) + mi.jumlah;
    }
  });

  let finalMealAmount = 0;
  let excessMealToPocket = 0;

  if (itemsWithDateCount > 0 && Object.keys(mealByDate).length > 0) {
    // Calculate per-day capping
    Object.keys(mealByDate).forEach(d => {
      const dayTotal = mealByDate[d];
      if (dayTotal > dailyMealRate) {
        finalMealAmount += dailyMealRate; // capped to 1 full day acuan
        excessMealToPocket += (dayTotal - dailyMealRate);
      } else {
        finalMealAmount += dayTotal;
      }
    });

    // Handle any meal items without dates
    const undatedMealTotal = rawMealItems.filter(mi => !mi.date || !mi.date.trim()).reduce((s, mi) => s + mi.jumlah, 0);
    if (undatedMealTotal > 0) {
      const remainingAllowed = Math.max(0, maxMealAllowed - finalMealAmount);
      if (undatedMealTotal > remainingAllowed) {
        finalMealAmount += remainingAllowed;
        excessMealToPocket += (undatedMealTotal - remainingAllowed);
      } else {
        finalMealAmount += undatedMealTotal;
      }
    }
  } else {
    // Fallback to trip duration calculation: durationDays * dailyMealRate
    const rawMealTotal = rawMealItems.reduce((sum, i) => sum + i.jumlah, 0);
    if (rawMealTotal > maxMealAllowed) {
      finalMealAmount = maxMealAllowed;
      excessMealToPocket = rawMealTotal - maxMealAllowed;
    } else {
      finalMealAmount = rawMealTotal;
      excessMealToPocket = 0;
    }
  }

  // 6. Build strictly deduplicated official list (max 7-9 official categories, only non-zero items)
  const consolidatedList: ConsolidatedCostItem[] = [];

  // 1. Transport Jkt - Bandara/Stasiun
  const jktItems = buckets.transport_jkt.items;
  const jktTotal = jktItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (jktTotal > 0) {
    const uniqueRincians = Array.from(new Set(jktItems.map(i => i.rincian).filter(Boolean)));
    const desc = uniqueRincians.length > 1
      ? uniqueRincians.join(' & ')
      : (uniqueRincians[0] || 'Transport Rumah - Bandara / Stasiun PP');
    consolidatedList.push({
      no: 0,
      kategori: 'Transport Jkt - Bandara/Stasiun (1x)',
      rincian: desc,
      hargaAcuan: buckets.transport_jkt.defaultAcuan,
      jumlah: jktTotal
    });
  }

  // 2. Uang Makan / Hari
  if (finalMealAmount > 0) {
    const mealNames = Array.from(new Set(rawMealItems.map(i => i.rincian).filter(Boolean)));
    let mealDesc = `${durationDays} Hari @ Rp ${dailyMealRate.toLocaleString('id-ID')}`;
    if (mealNames.length > 0) {
      const summaryList = mealNames.slice(0, 3).join(', ') + (mealNames.length > 3 ? ` + ${mealNames.length - 3} lainnya` : '');
      mealDesc += ` (${summaryList})`;
    }

    consolidatedList.push({
      no: 0,
      kategori: 'Uang Makan / Hari',
      rincian: mealDesc,
      hargaAcuan: dailyMealRate,
      jumlah: finalMealAmount
    });
  }

  // 3. Uang Saku (Includes base pocket allowance, snacks/jajanan, plus any excess meal over benchmark)
  const rawPocketItems = buckets.saku.items;
  const rawPocketTotal = rawPocketItems.reduce((sum, i) => sum + i.jumlah, 0);
  const accumulatedPocketAmount = rawPocketTotal + excessMealToPocket;
  const maxPocketAllowed = durationDays * dailyPocketRate;

  let finalPocketAmount = accumulatedPocketAmount;
  let eliminatedPocketExcess = 0;
  if (accumulatedPocketAmount > maxPocketAllowed) {
    finalPocketAmount = maxPocketAllowed;
    eliminatedPocketExcess = accumulatedPocketAmount - maxPocketAllowed;
  }

  if (finalPocketAmount > 0 || accumulatedPocketAmount > 0) {
    const pocketDetails: string[] = [];
    const uniquePocketRincians = Array.from(new Set(rawPocketItems.map(i => i.rincian).filter(Boolean)));
    
    if (uniquePocketRincians.length > 0) {
      pocketDetails.push(uniquePocketRincians.join(', '));
    }
    
    if (excessMealToPocket > 0) {
      pocketDetails.push(`Pelimpahan kelebihan Uang Makan: Rp ${excessMealToPocket.toLocaleString('id-ID')}`);
    }

    if (eliminatedPocketExcess > 0) {
      pocketDetails.push(`Plafon ${durationDays} Hari: Rp ${maxPocketAllowed.toLocaleString('id-ID')} (Kelebihan Rp ${eliminatedPocketExcess.toLocaleString('id-ID')} dihapuskan)`);
    }

    let pocketDesc = pocketDetails.join('; ');
    if (pocketDetails.length === 0) {
      pocketDesc = `${durationDays} Hari @ Rp ${dailyPocketRate.toLocaleString('id-ID')} (Uang Saku Operasional)`;
    }

    consolidatedList.push({
      no: 0,
      kategori: 'Uang Saku',
      rincian: pocketDesc,
      hargaAcuan: dailyPocketRate,
      jumlah: finalPocketAmount,
      rawJumlah: accumulatedPocketAmount,
      eliminatedAmount: eliminatedPocketExcess
    });
  }

  // 4. Transport Bandara - Hotel
  const hotelTransItems = buckets.transport_hotel.items;
  const hotelTransTotal = hotelTransItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (hotelTransTotal > 0) {
    const uniqueHotelTrans = Array.from(new Set(hotelTransItems.map(i => i.rincian).filter(Boolean)));
    const desc = hotelTransItems.length > 1
      ? `${hotelTransItems.length}x Perjalanan: ` + uniqueHotelTrans.slice(0, 2).join(', ') + (uniqueHotelTrans.length > 2 ? ' dll' : '')
      : (uniqueHotelTrans[0] || 'Transportasi Bandara - Hotel PP');
    consolidatedList.push({
      no: 0,
      kategori: 'Transport Bandara - Hotel',
      rincian: desc,
      hargaAcuan: buckets.transport_hotel.defaultAcuan,
      jumlah: hotelTransTotal
    });
  }

  // 5. Tiket Pesawat
  const pesawatItems = buckets.tiket_pesawat.items;
  const pesawatTotal = pesawatItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (pesawatTotal > 0) {
    const uniquePesawat = Array.from(new Set(pesawatItems.map(i => i.rincian).filter(Boolean)));
    const desc = uniquePesawat.join(', ') || 'Tiket Pesawat PP';
    consolidatedList.push({
      no: 0,
      kategori: 'Tiket Pesawat',
      rincian: desc,
      hargaAcuan: 'Sesuai Keuangan',
      jumlah: pesawatTotal
    });
  }

  // 6. Tiket Kereta Api
  const keretaItems = buckets.tiket_kereta.items;
  const keretaTotal = keretaItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (keretaTotal > 0) {
    const uniqueKereta = Array.from(new Set(keretaItems.map(i => i.rincian).filter(Boolean)));
    const desc = uniqueKereta.join(', ') || 'Tiket Kereta Api';
    consolidatedList.push({
      no: 0,
      kategori: 'Tiket Kereta Api',
      rincian: desc,
      hargaAcuan: 'Sesuai Keuangan',
      jumlah: keretaTotal
    });
  }

  // 7. Hotel / Hari
  const lodgingItems = buckets.hotel.items;
  const lodgingTotal = lodgingItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (lodgingTotal > 0) {
    const uniqueHotels = Array.from(new Set(lodgingItems.map(i => i.rincian).filter(Boolean)));
    const desc = uniqueHotels.join(', ') || 'Biaya Penginapan / Hotel';
    consolidatedList.push({
      no: 0,
      kategori: 'Hotel / Hari',
      rincian: desc,
      hargaAcuan: buckets.hotel.defaultAcuan,
      jumlah: lodgingTotal
    });
  }

  // 8. Sewa Mobil Standar
  const mobilStandarItems = buckets.mobil_standar.items;
  const mobilStandarTotal = mobilStandarItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (mobilStandarTotal > 0) {
    const uniqueMobil = Array.from(new Set(mobilStandarItems.map(i => i.rincian).filter(Boolean)));
    const desc = uniqueMobil.join(', ') || 'Sewa Mobil Standar Operasional';
    consolidatedList.push({
      no: 0,
      kategori: 'Sewa Mobil/Hari (Standar Avanza) + Sopir + BBM',
      rincian: desc,
      hargaAcuan: buckets.mobil_standar.defaultAcuan,
      jumlah: mobilStandarTotal
    });
  }

  // 9. Sewa Mobil Double Cabin
  const dcabinItems = buckets.mobil_dcabin.items;
  const dcabinTotal = dcabinItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (dcabinTotal > 0) {
    const uniqueDcabin = Array.from(new Set(dcabinItems.map(i => i.rincian).filter(Boolean)));
    const desc = uniqueDcabin.join(', ') || 'Sewa Mobil Double Cabin Tambang';
    consolidatedList.push({
      no: 0,
      kategori: 'Sewa Mobil/Hari (Double Cabin) + Sopir + BBM',
      rincian: desc,
      hargaAcuan: buckets.mobil_dcabin.defaultAcuan,
      jumlah: dcabinTotal
    });
  }

  // Assign clean sequential numbering 1, 2, 3...
  return consolidatedList.map((item, idx) => ({
    ...item,
    no: idx + 1
  }));
}

export const PrintSppdDocument: React.FC<PrintSppdDocumentProps> = ({
  sppd,
  onBack,
  onEdit,
  onPostToVoucher,
  isPublicView = false,
}) => {
  const [includeVisum, setIncludeVisum] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Intelligently consolidate cost items to eliminate duplicate categories
  const consolidatedItems = React.useMemo(() => {
    return consolidateSppdCostItems(sppd.costItems || [], sppd.lamaPerjalanan || '4 Hari', sppd.jabatan);
  }, [sppd.costItems, sppd.lamaPerjalanan, sppd.jabatan]);

  const totalBiaya = consolidatedItems.reduce((acc, curr) => acc + (curr.jumlah || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/sppd-view?id=${encodeURIComponent(sppd.id || sppd.noSppd)}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="w-full flex flex-col items-center print:items-start text-stone-900">
      
      {/* ACTION BAR (HIDDEN IN PRINT) */}
      <div className="w-full max-w-5xl bg-white border border-stone-200 rounded-2xl p-4 mb-6 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition flex items-center gap-1.5 text-xs font-bold cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Kembali</span>
            </button>
          )}
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 block">
              Pratinjau &amp; Cetak SPPD Resmi
            </span>
            <h2 className="text-sm font-black text-stone-900 font-display">
              {sppd.noSppd} &bull; {sppd.namaPekerja}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer select-none text-stone-700 hover:bg-stone-100">
            <input
              type="checkbox"
              checked={includeVisum}
              onChange={(e) => setIncludeVisum(e.target.checked)}
              className="rounded text-amber-600 focus:ring-amber-500"
            />
            <span>Sertakan Lembar Visum Lapangan (Hal 2)</span>
          </label>

          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            title="Salin tautan dokumen SPPD ini"
          >
            {isCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{isCopied ? 'Link Tersalin!' : 'Bagikan Link'}</span>
          </button>

          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="px-3.5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Edit SPPD
            </button>
          )}

          {onPostToVoucher && (
            <button
              type="button"
              onClick={onPostToVoucher}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>Posting ke Voucher HO</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black rounded-xl shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <Printer size={15} />
            <span>Cetak SPPD (Print / PDF)</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HALAMAN 1: SURAT PERINTAH PERJALANAN DINAS (SPPD) & RINCIAN BIAYA         */}
      {/* ========================================================================= */}
      <div className="w-[210mm] min-h-[297mm] bg-white p-[10mm] sm:p-[12mm] border border-stone-300 shadow-xl rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full page-break box-border font-serif text-[12px] leading-relaxed">
        
        {/* KOP SURAT RESMI PERUSAHAAN */}
        <div className="border-b-[2.5px] border-black pb-2 mb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="shrink-0">
              <NusantaraLogo size="md" className="h-16 w-auto object-contain" />
            </div>
            <div className="flex-1 text-center font-sans">
              <h1 className="text-base sm:text-lg font-black uppercase tracking-wider text-black">
                PT. NUSANTARA MINERAL SUKSES ABADI
              </h1>
              <p className="text-[10px] sm:text-[11px] text-black font-semibold mt-0.5 leading-snug">
                Jl. Raya Pasar Minggu Kav. 2B-C, RT.2/RW.2, Pancoran, Kecamatan Pancoran,<br />
                Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta, Kode Pos 12780
              </p>
              <p className="text-[9px] text-stone-600 font-mono mt-0.5">
                Email: info@nmsa.co.id &bull; Telp / WA: +62 821-8888-0000
              </p>
            </div>
            <div className="w-16 hidden sm:block shrink-0" />
          </div>
          {/* Garis Tipis Tambahan Kop Surat */}
          <div className="border-b border-black mt-1" />
        </div>

        {/* JUDUL DOKUMEN & NOMOR */}
        <div className="text-center my-3 font-sans">
          <h2 className="text-sm sm:text-base font-black uppercase tracking-widest text-black underline underline-offset-4">
            SURAT PERINTAH PERJALANAN DINAS (SPPD)
          </h2>
          <div className="text-xs font-mono font-bold text-black mt-1">
            Nomor: <span className="bg-stone-100 px-2 py-0.5 border border-stone-300 rounded font-black">{sppd.noSppd}</span>
          </div>
        </div>

        {/* TABEL FORMAT STANDAR SPPD NASIONAL */}
        <table className="w-full border-collapse border border-black text-[11px] sm:text-[12px] mb-3">
          <tbody>
            <tr className="border-b border-black">
              <td className="w-8 border-r border-black p-1.5 text-center font-bold font-sans">1.</td>
              <td className="w-64 border-r border-black p-1.5 font-bold font-sans">Pejabat Berwenang yang Memberi Perintah</td>
              <td className="p-1.5 font-sans font-semibold">
                {sppd.pemberiPerintah} <span className="text-stone-600 font-normal">({sppd.pemberiPerintahJabatan || 'Direktur Utama'})</span>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">2.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">Nama Pegawai yang Diperintahkan</td>
              <td className="p-1.5 font-sans font-bold text-stone-900">
                {sppd.namaPekerja}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">3.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">
                a. Pangkat / Golongan / Jabatan<br />
                b. Divisi / Unit Kerja
              </td>
              <td className="p-1.5 font-sans">
                a. <span className="font-semibold">{sppd.jabatan}</span><br />
                b. <span>{sppd.divisi || 'Operasional Lapangan & HO'}</span>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">4.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">Maksud &amp; Tujuan Perjalanan Dinas</td>
              <td className="p-1.5 font-sans font-semibold leading-snug text-stone-850">
                {sppd.tujuanPerjalanan}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">5.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">Alat Angkut / Transportasi yang Digunakan</td>
              <td className="p-1.5 font-sans">
                {sppd.transportasi}
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">6.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">
                a. Tempat Berangkat (Asal)<br />
                b. Tempat Tujuan
              </td>
              <td className="p-1.5 font-sans">
                a. <strong>{sppd.kotaAsal}</strong><br />
                b. <strong>{sppd.kotaTujuan}</strong>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">7.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">
                a. Lamanya Perjalanan Dinas<br />
                b. Tanggal Berangkat<br />
                c. Tanggal Harus Kembali / Tiba
              </td>
              <td className="p-1.5 font-sans">
                a. <span className="font-semibold">{sppd.lamaPerjalanan}</span><br />
                b. <span>{formatDateIndonesian(sppd.tanggalMulai)}</span><br />
                c. <span>{formatDateIndonesian(sppd.tanggalSelesai)}</span>
              </td>
            </tr>

            <tr className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">8.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">
                Pembebanan Anggaran<br />
                <span className="text-[10px] font-normal text-stone-500 font-sans">a. Entitas Perusahaan<br />b. Akun Pembebanan</span>
              </td>
              <td className="p-1.5 font-sans">
                a. <strong>PT. Nusantara Mineral Sukses Abadi</strong><br />
                b. <span>Beban Perjalanan Dinas Operasional (Akun 600015)</span>
              </td>
            </tr>

            <tr>
              <td className="border-r border-black p-1.5 text-center font-bold font-sans">9.</td>
              <td className="border-r border-black p-1.5 font-bold font-sans">Keterangan Lain-lain</td>
              <td className="p-1.5 font-sans text-stone-700 italic text-[11px]">
                {sppd.keteranganSppd || 'Semua bukti tiket, boarding pass, kwitansi hotel, dan bukti transportasi wajib dilampirkan.'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABEL RINCIAN BIAYA & PLAFON SPPD */}
        <div className="mb-3 font-sans">
          <div className="text-[11px] font-black uppercase tracking-wider text-black mb-1 flex items-center justify-between">
            <span>Rincian Biaya &amp; Anggaran Perjalanan Dinas (Plafon / Realisasi):</span>
            <span className="text-[10px] font-mono text-stone-500">Mata Uang: IDR (Rupiah)</span>
          </div>
          <table className="w-full border-collapse border border-black text-[10.5px]">
            <thead>
              <tr className="bg-stone-100 border-b border-black font-bold uppercase text-center">
                <th className="border-r border-black p-1 w-8">No</th>
                <th className="border-r border-black p-1 text-left">Komponen / Kategori Biaya</th>
                <th className="border-r border-black p-1 text-left w-52">Rincian / Catatan Perhitungan</th>
                <th className="border-r border-black p-1 text-right w-24">Tarif Acuan</th>
                <th className="p-1 text-right w-28">Jumlah (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedItems.map((item, idx) => (
                <tr key={idx} className="border-b border-black">
                  <td className="border-r border-black p-1 text-center font-mono">{item.no || idx + 1}</td>
                  <td className="border-r border-black p-1 font-semibold">{item.kategori}</td>
                  <td className="border-r border-black p-1 text-stone-700 leading-snug">{item.rincian}</td>
                  <td className="border-r border-black p-1 text-right font-mono text-stone-600">
                    {typeof item.hargaAcuan === 'number'
                      ? item.hargaAcuan.toLocaleString('id-ID')
                      : item.hargaAcuan || '-'}
                  </td>
                  <td className="p-1 text-right font-mono font-bold">
                    {item.jumlah ? item.jumlah.toLocaleString('id-ID') : '0'}
                  </td>
                </tr>
              ))}
              <tr className="border-t-[1.5px] border-black bg-stone-50 font-bold">
                <td colSpan={4} className="border-r border-black p-1.5 text-center uppercase tracking-wider text-xs">
                  TOTAL BIAYA PERJALANAN DINAS
                </td>
                <td className="p-1.5 text-right font-mono text-xs font-black">
                  Rp {totalBiaya.toLocaleString('id-ID')}
                </td>
              </tr>
            </tbody>
          </table>

          {/* TERBILANG BOX */}
          <div className="border border-black border-t-0 p-1.5 bg-stone-50/50 text-[10.5px] flex gap-2">
            <span className="font-bold shrink-0">Terbilang:</span>
            <span className="italic font-semibold text-stone-900">"{terbilangRupiah(totalBiaya)}"</span>
          </div>
        </div>

        {/* KOLOM TANDA TANGAN & PENGESAHAN RESMI (3 PIHAK) */}
        <div className="pt-2 font-sans">
          <div className="flex justify-end text-[11px] mb-2 font-medium">
            <span>Dikeluarkan di: <strong>Jakarta</strong>, Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalMulai)}</strong></span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10.5px]">
            {/* 1. Yang Melaksanakan Perintah */}
            <div className="flex flex-col items-center justify-between min-h-[95px] p-1 border border-stone-200 rounded">
              <span className="font-semibold text-stone-700">Pegawai yang Diperintahkan,</span>
              <div className="mt-12">
                <span className="border-b border-black font-bold uppercase block px-2 leading-tight">
                  {sppd.namaPekerja}
                </span>
                <span className="text-[9.5px] text-stone-500 font-mono block mt-0.5">
                  {sppd.jabatan}
                </span>
              </div>
            </div>

            {/* 2. Mengetahui / Head of Ops */}
            <div className="flex flex-col items-center justify-between min-h-[95px] p-1 border border-stone-200 rounded">
              <span className="font-semibold text-stone-700">Mengetahui / Menyetujui,</span>
              <div className="mt-12">
                <span className="border-b border-black font-bold uppercase block px-2 leading-tight">
                  {sppd.sppdDisetujuiName || 'Harijon'}
                </span>
                <span className="text-[9.5px] text-stone-500 font-mono block mt-0.5">
                  {sppd.sppdDisetujuiJabatan || 'Head of Operational'}
                </span>
              </div>
            </div>

            {/* 3. Pejabat Pemberi Perintah / Direktur */}
            <div className="flex flex-col items-center justify-between min-h-[95px] p-1 border border-stone-200 rounded">
              <span className="font-semibold text-stone-700">Pejabat Pemberi Perintah,</span>
              <div className="mt-12">
                <span className="border-b border-black font-bold uppercase block px-2 leading-tight">
                  {sppd.pemberiPerintah}
                </span>
                <span className="text-[9.5px] text-stone-500 font-mono block mt-0.5">
                  {sppd.pemberiPerintahJabatan || 'Direktur Utama'}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* HALAMAN 2: LEMBAR VISUM & CATATAN KEDATANGAN / KEBERANGKATAN LAPANGAN     */}
      {/* ========================================================================= */}
      {includeVisum && (
        <div className="w-[210mm] min-h-[297mm] bg-white p-[10mm] sm:p-[12mm] border border-stone-300 shadow-xl rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full page-break box-border font-serif text-[11px] leading-relaxed mt-6 print:mt-0">
          
          {/* HEADER VISUM */}
          <div className="border-b-[2px] border-black pb-2 mb-4 font-sans flex items-center justify-between">
            <div>
              <h2 className="text-xs sm:text-sm font-black uppercase text-black">
                LEMBAR VISUM &amp; KEDATANGAN / KEBERANGKATAN DINAS LAPANGAN
              </h2>
              <p className="text-[10px] text-stone-600 font-mono">
                Lampiran SPPD No: <strong>{sppd.noSppd}</strong> &bull; Pegawai: <strong>{sppd.namaPekerja}</strong>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold border border-black px-2 py-1 bg-stone-50">
                HALAMAN 2 (VISUM)
              </span>
            </div>
          </div>

          <p className="text-[10px] font-sans text-stone-600 italic mb-3">
            * Lembar visum ini wajib diisi dan dicap/ditandatangani oleh pimpinan/penanggung jawab di setiap lokasi tujuan perjalan dinas.
          </p>

          {/* TABEL VISUM 4 POSISI */}
          <div className="grid grid-cols-2 border border-black text-xs font-sans">
            
            {/* POS 1: Keberangkatan dari Kantor Asal */}
            <div className="border-r border-b border-black p-3 space-y-2 min-h-[140px] flex flex-col justify-between">
              <div>
                <div className="font-bold uppercase text-[11px] text-black">I. Berangkat dari Kantor Asal</div>
                <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                  <div>Tempat: <strong>{sppd.kotaAsal}</strong></div>
                  <div>Ke: <strong>{sppd.kotaTujuan}</strong></div>
                  <div>Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalMulai)}</strong></div>
                </div>
              </div>
              <div className="text-center pt-6">
                <span className="text-[9.5px] text-stone-400 block mb-6">(Tanda Tangan &amp; Cap Bagian SDM / HO)</span>
                <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                  Bagian Administrasi HO
                </span>
              </div>
            </div>

            {/* POS 2: Tiba di Tempat Tujuan Lapangan / Site */}
            <div className="border-b border-black p-3 space-y-2 min-h-[140px] flex flex-col justify-between">
              <div>
                <div className="font-bold uppercase text-[11px] text-black">II. Tiba di Lokasi Tujuan (Site / Wilayah)</div>
                <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                  <div>Tempat: <strong>{sppd.kotaTujuan}</strong></div>
                  <div>Pada Tanggal: _____________________</div>
                  <div>Pukul: _______ WITA / WIB</div>
                </div>
              </div>
              <div className="text-center pt-6">
                <span className="text-[9.5px] text-stone-400 block mb-6">(Tanda Tangan &amp; Cap Pimpinan Lokasi Tujuan)</span>
                <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                  Penanggung Jawab / Kepala Unit Site
                </span>
              </div>
            </div>

            {/* POS 3: Berangkat Kembali dari Tempat Tujuan */}
            <div className="border-r border-black p-3 space-y-2 min-h-[140px] flex flex-col justify-between">
              <div>
                <div className="font-bold uppercase text-[11px] text-black">III. Berangkat Kembali dari Lokasi Tujuan</div>
                <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                  <div>Dari: <strong>{sppd.kotaTujuan}</strong></div>
                  <div>Ke: <strong>{sppd.kotaAsal}</strong></div>
                  <div>Pada Tanggal: _____________________</div>
                </div>
              </div>
              <div className="text-center pt-6">
                <span className="text-[9.5px] text-stone-400 block mb-6">(Tanda Tangan &amp; Cap Pimpinan Lokasi Tujuan)</span>
                <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                  Penanggung Jawab / Kepala Unit Site
                </span>
              </div>
            </div>

            {/* POS 4: Tiba Kembali di Kantor Asal */}
            <div className="p-3 space-y-2 min-h-[140px] flex flex-col justify-between">
              <div>
                <div className="font-bold uppercase text-[11px] text-black">IV. Tiba Kembali di Kantor Asal (HO)</div>
                <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                  <div>Tempat: <strong>{sppd.kotaAsal}</strong></div>
                  <div>Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalSelesai)}</strong></div>
                  <div>Pukul: _______ WIB</div>
                </div>
              </div>
              <div className="text-center pt-6">
                <span className="text-[9.5px] text-stone-400 block mb-6">(Tanda Tangan &amp; Cap Verifikasi SDM / HO)</span>
                <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                  Pejabat yang Memberi Perintah / Keuangan
                </span>
              </div>
            </div>

          </div>

          {/* CATATAN RESUME DINAS */}
          <div className="mt-4 border border-black p-3 font-sans">
            <span className="text-[11px] font-bold uppercase block mb-1">
              V. Catatan Hasil Kegiatan Perjalanan Dinas / Resume Lapangan:
            </span>
            <div className="min-h-[100px] border border-dashed border-stone-300 p-2 text-[10px] text-stone-600 bg-stone-50/50">
              {sppd.keteranganSppd ? (
                <p className="text-stone-800">{sppd.keteranganSppd}</p>
              ) : (
                <p className="italic text-stone-400">
                  (Dapat diisi secara manual oleh pegawai bersangkutan setelah kembali dari perjalanan dinas untuk pelaporan hasil audit/inspeksi/tugas).
                </p>
              )}
            </div>
          </div>

          {/* FOOTER PENGESAHAN AKHIR */}
          <div className="mt-4 pt-2 border-t border-black flex justify-between items-center text-[9.5px] font-mono text-stone-600">
            <div>
              Dokumen Sah PT. Nusantara Mineral Sukses Abadi &bull; Alamat: Jl. Raya Pasar Minggu Kav. 2B-C, Pancoran, Jakarta Selatan
            </div>
            <div>
              ID Berkas: {sppd.id}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

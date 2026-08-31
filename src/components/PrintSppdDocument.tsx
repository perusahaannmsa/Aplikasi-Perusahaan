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

  // 5. Intelligent Calculation of Uang Makan & Uang Saku: No capping, preserve 100% of employee raw input
  const rawMealItems = buckets.makan.items;
  const finalMealAmount = rawMealItems.reduce((sum, i) => sum + i.jumlah, 0);

  // 6. Build strictly deduplicated official list (max 7-9 official categories, only non-zero items)
  const consolidatedList: ConsolidatedCostItem[] = [];

  // 1. Transport Jkt - Bandara/Stasiun
  const jktItems = buckets.transport_jkt.items;
  const jktTotal = jktItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (jktTotal > 0) {
    consolidatedList.push({
      no: 0,
      kategori: 'Transport Jkt - Bandara/Stasiun (1x)',
      rincian: 'Transport Rumah - Bandara PP',
      hargaAcuan: buckets.transport_jkt.defaultAcuan,
      jumlah: jktTotal
    });
  }

  // 2. Uang Makan / Hari
  if (finalMealAmount > 0) {
    const mealDesc = `${durationDays} Hari (Klaim Riil: Rp ${finalMealAmount.toLocaleString('id-ID')})`;
    consolidatedList.push({
      no: 0,
      kategori: 'Uang Makan / Hari',
      rincian: mealDesc,
      hargaAcuan: dailyMealRate,
      jumlah: finalMealAmount
    });
  }

  // 3. Uang Saku
  const rawPocketItems = buckets.saku.items;
  const finalPocketAmount = rawPocketItems.reduce((sum, i) => sum + i.jumlah, 0);

  if (finalPocketAmount > 0) {
    const pocketDesc = `${durationDays} Hari (Klaim Riil: Rp ${finalPocketAmount.toLocaleString('id-ID')})`;

    consolidatedList.push({
      no: 0,
      kategori: 'Uang Saku',
      rincian: pocketDesc,
      hargaAcuan: dailyPocketRate,
      jumlah: finalPocketAmount
    });
  }

  // 4. Transport Bandara - Hotel
  const hotelTransItems = buckets.transport_hotel.items;
  const hotelTransTotal = hotelTransItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (hotelTransTotal > 0) {
    consolidatedList.push({
      no: 0,
      kategori: 'Transport Bandara - Hotel',
      rincian: 'Transport Bandara - Hotel PP',
      hargaAcuan: buckets.transport_hotel.defaultAcuan,
      jumlah: hotelTransTotal
    });
  }

  // 5. Tiket Pesawat
  const pesawatItems = buckets.tiket_pesawat.items;
  const pesawatTotal = pesawatItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (pesawatTotal > 0) {
    consolidatedList.push({
      no: 0,
      kategori: 'Tiket Pesawat',
      rincian: 'Tiket Pesawat PP',
      hargaAcuan: 'Sesuai Keuangan',
      jumlah: pesawatTotal
    });
  }

  // 6. Tiket Kereta Api
  const keretaItems = buckets.tiket_kereta.items;
  const keretaTotal = keretaItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (keretaTotal > 0) {
    consolidatedList.push({
      no: 0,
      kategori: 'Tiket Kereta Api',
      rincian: 'Tiket Kereta Api PP',
      hargaAcuan: 'Sesuai Keuangan',
      jumlah: keretaTotal
    });
  }

  // 7. Hotel / Hari
  const lodgingItems = buckets.hotel.items;
  const lodgingTotal = lodgingItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (lodgingTotal > 0) {
    const nightCount = durationDays > 1 ? durationDays - 1 : 1;
    consolidatedList.push({
      no: 0,
      kategori: 'Hotel / Hari',
      rincian: `Penginapan / Hotel (${nightCount} Malam)`,
      hargaAcuan: buckets.hotel.defaultAcuan,
      jumlah: lodgingTotal
    });
  }

  // 8. Sewa Mobil Standar
  const mobilStandarItems = buckets.mobil_standar.items;
  const mobilStandarTotal = mobilStandarItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (mobilStandarTotal > 0) {
    consolidatedList.push({
      no: 0,
      kategori: 'Sewa Mobil/Hari (Standar Avanza) + Sopir + BBM',
      rincian: 'Sewa Mobil Standar + Sopir + BBM',
      hargaAcuan: buckets.mobil_standar.defaultAcuan,
      jumlah: mobilStandarTotal
    });
  }

  // 9. Sewa Mobil Double Cabin
  const dcabinItems = buckets.mobil_dcabin.items;
  const dcabinTotal = dcabinItems.reduce((sum, i) => sum + i.jumlah, 0);
  if (dcabinTotal > 0) {
    consolidatedList.push({
      no: 0,
      kategori: 'Sewa Mobil/Hari (Double Cabin) + Sopir + BBM',
      rincian: 'Sewa Mobil Double Cabin + Sopir + BBM',
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

export interface SppdSheetContentProps {
  sppd: SPPDRecord;
  includeVisum?: boolean;
  isLastPage?: boolean;
}

export const SppdSheetContent: React.FC<SppdSheetContentProps> = ({
  sppd,
  includeVisum = true,
  isLastPage = false,
}) => {
  // Intelligently consolidate cost items to eliminate duplicate categories
  const consolidatedItems = React.useMemo(() => {
    return consolidateSppdCostItems(sppd.costItems || [], sppd.lamaPerjalanan || '4 Hari', sppd.jabatan);
  }, [sppd.costItems, sppd.lamaPerjalanan, sppd.jabatan]);

  const totalBiaya = consolidatedItems.reduce((acc, curr) => acc + (curr.jumlah || 0), 0);

  return (
    <div className="w-full flex flex-col items-center text-stone-900 print:!block">
      {/* ========================================================================= */}
      {/* HALAMAN 1: SURAT PERINTAH PERJALANAN DINAS (SPPD) & RINCIAN BIAYA         */}
      {/* ========================================================================= */}
      <div className={`w-[210mm] min-h-[297mm] max-w-full bg-white p-[8mm] sm:p-[10mm] border border-stone-300 shadow-xl rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full page-break sppd-print-page ${includeVisum || !isLastPage ? 'print-force-page-break page-break-after' : ''} box-border font-sans text-[11px] leading-snug flex flex-col justify-between mb-8 print:mb-0`}>
        
        <div>
          {/* KOP SURAT RESMI PERUSAHAAN */}
          <div className="border-b-[2.5px] border-black pb-2 mb-2.5">
            <div className="flex items-center justify-between gap-4">
              <div className="shrink-0">
                <NusantaraLogo size="md" className="h-14 sm:h-16 w-auto object-contain" />
              </div>
              <div className="flex-1 text-center font-sans">
                <h1 className="text-base sm:text-[17px] font-black uppercase tracking-wider text-black leading-tight">
                  PT. NUSANTARA MINERAL SUKSES ABADI
                </h1>
                <p className="text-[9.5px] sm:text-[10.5px] text-black font-semibold mt-0.5 leading-snug">
                  Jl. Raya Pasar Minggu Kav. 2B-C, RT.2/RW.2, Pancoran, Kecamatan Pancoran,<br />
                  Kota Jakarta Selatan, Daerah Khusus Ibukota Jakarta, Kode Pos 12780
                </p>
                <p className="text-[9px] sm:text-[9.5px] text-stone-700 font-mono mt-0.5">
                  Email: info@nmsa.co.id &bull; Telp / WA: +62 821-8888-0000
                </p>
              </div>
              <div className="w-12 hidden sm:block shrink-0" />
            </div>
            {/* Garis Tipis Tambahan Kop Surat */}
            <div className="border-b border-black mt-1" />
          </div>

          {/* JUDUL DOKUMEN & NOMOR */}
          <div className="text-center my-2 font-sans">
            <h2 className="text-sm sm:text-[15px] font-black uppercase tracking-widest text-black underline underline-offset-4">
              SURAT PERINTAH PERJALANAN DINAS (SPPD)
            </h2>
            <div className="text-[11px] sm:text-xs font-mono font-bold text-black mt-1">
              Nomor: <span className="bg-stone-100 px-2.5 py-0.5 border border-stone-400 rounded font-black">{sppd.noSppd}</span>
            </div>
          </div>

          {/* RINCIAN PERINTAH PENUGASAN (POIN 1 - 9) - FORMAT TABEL RESMI STANDAR SPPD */}
          <div className="my-2.5 font-sans">
            <table className="w-full border-collapse border border-black text-[10px] sm:text-[10.5px]">
              <tbody>
                {/* 1. Pejabat Pemberi Perintah */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1.5 w-7 text-center font-bold align-top">1.</td>
                  <td className="border-r border-black p-1.5 w-48 sm:w-56 font-semibold text-black align-top">
                    Pejabat Berwenang yang Memberi Perintah
                  </td>
                  <td className="p-1.5 text-stone-900 align-top">
                    <span className="font-bold text-black">{sppd.pemberiPerintah}</span> <span className="text-stone-600">({sppd.pemberiPerintahJabatan || 'Direktur Utama'})</span>
                  </td>
                </tr>

                {/* 2. Pegawai yang Diperintahkan */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1.5 text-center font-bold align-top">2.</td>
                  <td className="border-r border-black p-1.5 font-semibold text-black align-top">
                    Nama Pegawai yang Diperintahkan
                  </td>
                  <td className="p-1.5 font-black uppercase text-black align-top">
                    {sppd.namaPekerja}
                  </td>
                </tr>

                {/* 3. Pangkat / Jabatan & Divisi */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1.5 text-center font-bold align-top">3.</td>
                  <td className="border-r border-black p-1.5 font-semibold text-black align-top">
                    Pangkat / Jabatan &amp; Divisi
                  </td>
                  <td className="p-1.5 text-stone-900 align-top">
                    <span className="font-bold">{sppd.jabatan}</span> &bull; <span>{sppd.divisi || 'Operasional Lapangan & HO'}</span>
                  </td>
                </tr>

                {/* 4. Maksud & Tujuan Perjalanan */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1.5 text-center font-bold align-top">4.</td>
                  <td className="border-r border-black p-1.5 font-semibold text-black align-top">
                    Maksud &amp; Tujuan Perjalanan Dinas
                  </td>
                  <td className="p-1.5 text-stone-900 font-medium leading-snug align-top">
                    {(() => {
                      const purpose = sppd.tujuanPerjalanan || '';
                      if (!purpose || purpose.includes('Voucher Biaya Perjalanan Dinas') || purpose.includes('Laporan SPPD:') || purpose.includes('Diposting dari')) {
                        return `Pengawasan Lapangan & Verifikasi Operasional (${sppd.kotaTujuan || 'Site / Proyek'})`;
                      }
                      return purpose;
                    })()}
                  </td>
                </tr>

                {/* 5. Alat Angkutan / Moda Transportasi */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1.5 text-center font-bold align-top">5.</td>
                  <td className="border-r border-black p-1.5 font-semibold text-black align-top">
                    Alat Angkut yang Digunakan
                  </td>
                  <td className="p-1.5 text-stone-900 align-top">
                    {sppd.kendaraan || 'Pesawat Udara / Mobil Operasional'}
                  </td>
                </tr>

                {/* 6. Rute & Lokasi Perjalanan */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1.5 text-center font-bold align-top">6.</td>
                  <td className="border-r border-black p-1.5 font-semibold text-black align-top">
                    a. Tempat Berangkat (Asal)<br />
                    b. Tempat Tujuan (Lokasi Dinas)
                  </td>
                  <td className="p-1.5 text-stone-900 align-top">
                    a. <strong>{sppd.kotaAsal}</strong><br />
                    b. <strong>{sppd.kotaTujuan}</strong>
                  </td>
                </tr>

                {/* 7. Durasi & Tanggal Perjalanan */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1.5 text-center font-bold align-top">7.</td>
                  <td className="border-r border-black p-1.5 font-semibold text-black align-top">
                    a. Lama Perjalanan Dinas<br />
                    b. Tanggal Berangkat<br />
                    c. Tanggal Harus Kembali / Tiba
                  </td>
                  <td className="p-1.5 text-stone-900 align-top">
                    a. <span className="font-bold text-black">{sppd.lamaPerjalanan}</span><br />
                    b. {formatDateIndonesian(sppd.tanggalMulai)}<br />
                    c. {formatDateIndonesian(sppd.tanggalSelesai)}
                  </td>
                </tr>

                {/* 8. Pembebanan Anggaran */}
                <tr className="border-b border-black">
                  <td className="border-r border-black p-1.5 text-center font-bold align-top">8.</td>
                  <td className="border-r border-black p-1.5 font-semibold text-black align-top">
                    Pembebanan Anggaran<br />
                    &bull; Instansi / Mata Anggaran
                  </td>
                  <td className="p-1.5 text-stone-900 align-top">
                    PT. Nusantara Mineral Sukses Abadi (HO / Proyek Site)<br />
                    <span className="font-mono text-[10px] text-stone-600">Mata Anggaran: Biaya Perjalanan Dinas &amp; Akomodasi Lapangan</span>
                  </td>
                </tr>

                {/* 9. Keterangan Lain-Lain */}
                <tr>
                  <td className="border-r border-black p-1.5 text-center font-bold align-top">9.</td>
                  <td className="border-r border-black p-1.5 font-semibold text-black align-top">
                    Keterangan Lain-Lain
                  </td>
                  <td className="p-1.5 text-stone-700 italic align-top">
                    Surat perintah ini diterbitkan untuk dilaksanakan dengan penuh tanggung jawab dan melaporkan hasil pelaksanaan tugas.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* TABEL RINCIAN PEMBIAYAAN SPPD RESMI STANDAR */}
          <div className="mt-2.5 font-sans">
            <div className="font-bold uppercase text-[10.5px] text-black mb-1 flex items-center justify-between">
              <span>Rincian Biaya Perjalanan Dinas (Biaya Riil &amp; Uang Harian Standar):</span>
              <span className="text-[9.5px] font-mono text-stone-500 font-normal">Sesuai Pedoman Perusahaan</span>
            </div>

            <table className="w-full border-collapse border border-black text-[10px] sm:text-[10.5px]">
              <thead>
                <tr className="bg-stone-100 border-b border-black font-bold uppercase text-[9.5px] sm:text-[10px] text-black">
                  <th className="border-r border-black p-1 text-center w-7">No</th>
                  <th className="border-r border-black p-1 text-left w-52 sm:w-60">Rincian Komponen Biaya</th>
                  <th className="border-r border-black p-1 text-left">Keterangan / Perhitungan</th>
                  <th className="border-r border-black p-1 text-center w-28 sm:w-32">Tarif Acuan</th>
                  <th className="p-1 text-right w-28 sm:w-32">Jumlah (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedItems.map((c) => (
                  <tr key={c.no} className="border-b border-black/80">
                    <td className="border-r border-black p-1 text-center font-mono">{c.no}</td>
                    <td className="border-r border-black p-1 font-semibold text-black">{c.kategori}</td>
                    <td className="border-r border-black p-1 text-stone-700">{c.rincian}</td>
                    <td className="border-r border-black p-1 text-center font-mono text-[9.5px]">
                      {typeof c.hargaAcuan === 'number' && c.hargaAcuan > 0
                        ? `Rp ${c.hargaAcuan.toLocaleString('id-ID')}`
                        : (c.hargaAcuan || '-')}
                    </td>
                    <td className="p-1 text-right font-mono font-bold text-black">
                      Rp {c.jumlah.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}

                {/* BARIS TOTAL */}
                <tr className="border-t-[1.5px] border-black bg-stone-100/80 font-black text-black">
                  <td colSpan={4} className="border-r border-black p-1.5 text-center uppercase tracking-wider text-[10.5px]">
                    JUMLAH TOTAL BIAYA PERJALANAN DINAS (SPPD)
                  </td>
                  <td className="p-1.5 text-right font-mono text-[11px] sm:text-xs">
                    Rp {totalBiaya.toLocaleString('id-ID')}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* TERBILANG NOMINAL */}
            <div className="border border-black border-t-0 p-1.5 bg-stone-50 text-[10px] flex items-baseline gap-1.5">
              <span className="font-bold uppercase text-black shrink-0">Terbilang:</span>
              <span className="italic font-semibold text-black">
                "{terbilangRupiah(totalBiaya)}"
              </span>
            </div>
          </div>

        </div>

        {/* TANDA TANGAN PENGESAHAN LEMBAR 1 */}
        <div className="mt-4 pt-2 border-t-[1.5px] border-black font-sans">
          <div className="flex justify-between items-start text-center text-[10.5px] text-black">
            
            {/* Kolom Dikeluarkan & Tanggal */}
            <div className="w-1/3 text-left space-y-1">
              <div className="text-[10px]">
                Dikeluarkan di: <strong>Jakarta</strong><br />
                Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalMulai)}</strong>
              </div>
              <div className="pt-2 text-[9.5px] text-stone-500 font-mono leading-tight">
                No. Form: FM-HO-SPPD-01<br />
                Status Dokumen: Sah / Asli
              </div>
            </div>

            {/* Kolom Pegawai Yang Diperintahkan */}
            <div className="w-1/3 flex flex-col items-center">
              <span className="text-[10px] font-semibold text-stone-800 mb-12">
                Pegawai yang Melaksanakan Perjalanan Dinas,
              </span>
              <span className="border-b border-black pb-0.5 px-3 font-black uppercase text-[11px]">
                {sppd.namaPekerja}
              </span>
              <span className="text-[9.5px] text-stone-600 font-mono mt-0.5">
                {sppd.jabatan}
              </span>
            </div>

            {/* Kolom Pejabat Pemberi Perintah */}
            <div className="w-1/3 flex flex-col items-center">
              <span className="text-[10px] font-semibold text-stone-800 mb-12">
                Pejabat yang Memberi Perintah,
              </span>
              <span className="border-b border-black pb-0.5 px-3 font-black uppercase text-[11px]">
                {sppd.sppdDisetujuiName || sppd.pemberiPerintah || 'H. A. Nursyam Halid'}
              </span>
              <span className="text-[9.5px] text-stone-600 font-mono mt-0.5">
                {sppd.sppdDisetujuiJabatan || sppd.pemberiPerintahJabatan || 'Direktur Utama'}
              </span>
            </div>

          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* HALAMAN 2: LEMBAR VISUM & PENGESAHAN LAPANGAN (JIKA DIAKTIFKAN)             */}
      {/* ========================================================================= */}
      {includeVisum && (
        <div className={`w-[210mm] min-h-[297mm] max-w-full bg-white p-[8mm] sm:p-[10mm] border border-stone-300 shadow-xl rounded-xl print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full page-break sppd-print-page ${!isLastPage ? 'print-force-page-break' : ''} box-border font-sans text-[11px] leading-snug flex flex-col justify-between`}>
          
          <div>
            {/* HEADER LEMBAR 2 VISUM */}
            <div className="border-b-[2px] border-black pb-2 mb-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 block">
                  LEMBAR LANJUTAN VISUM &bull; HALAMAN 2
                </span>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-black font-sans">
                  LEMBAR VISUM / PENGESAHAN PERJALANAN DINAS
                </h3>
              </div>
              <div className="text-right text-[10px] font-mono">
                <div>Lampiran SPPD No: <strong>{sppd.noSppd}</strong></div>
                <div>Pegawai: <strong>{sppd.namaPekerja}</strong></div>
              </div>
            </div>

            {/* PETUNJUK LEMBAR VISUM */}
            <p className="text-[10px] text-stone-600 italic mb-2">
              Lembar ini wajib ditandatangani dan dicap (stempel) oleh pejabat di tempat berangkat dan tempat tujuan dinas sebagai bukti fisik kehadiran.
            </p>

            {/* TABEL VISUM 4 POS */}
            <div className="border border-black divide-y border-collapse">
              
              {/* POS 1: Berangkat dari Kantor Asal */}
              <div className="p-3 grid grid-cols-2 gap-4 min-h-[145px]">
                <div className="border-r border-black pr-3 flex flex-col justify-between">
                  <div>
                    <div className="font-bold uppercase text-[11px] text-black">I. Berangkat dari (Tempat Kedudukan)</div>
                    <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                      <div>Tempat Asal: <strong>{sppd.kotaAsal}</strong></div>
                      <div>Tujuan: <strong>{sppd.kotaTujuan}</strong></div>
                      <div>Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalMulai)}</strong></div>
                    </div>
                  </div>
                  <div className="text-center pt-4">
                    <span className="text-[9.5px] text-stone-400 block mb-5">(Tanda Tangan &amp; Cap HO)</span>
                    <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                      Pejabat yang Memberi Perintah
                    </span>
                  </div>
                </div>

                {/* POS 2: Tiba di Tempat Tujuan (Site / Lapangan) */}
                <div className="pl-1 flex flex-col justify-between">
                  <div>
                    <div className="font-bold uppercase text-[11px] text-black">II. Tiba di (Tempat Tujuan Dinas)</div>
                    <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                      <div>Tempat: <strong>{sppd.kotaTujuan}</strong></div>
                      <div>Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalMulai)}</strong></div>
                      <div>Pukul: _______ WITA/WIB</div>
                    </div>
                  </div>
                  <div className="text-center pt-4">
                    <span className="text-[9.5px] text-stone-400 block mb-5">(Tanda Tangan &amp; Cap Stempel Lokasi Dinas)</span>
                    <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                      Kepala Kantor / Pimpinan Proyek / Pengawas
                    </span>
                  </div>
                </div>
              </div>

              {/* POS 3: Berangkat dari Tempat Tujuan Kembali ke Asal */}
              <div className="p-3 space-y-2 min-h-[145px] flex flex-col justify-between">
                <div>
                  <div className="font-bold uppercase text-[11px] text-black">III. Berangkat dari (Tempat Tujuan) Menuju Kantor Asal</div>
                  <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                    <div>Tempat: <strong>{sppd.kotaTujuan}</strong></div>
                    <div>Tujuan Kembali: <strong>{sppd.kotaAsal}</strong></div>
                    <div>Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalSelesai)}</strong></div>
                  </div>
                </div>
                <div className="text-center pt-4">
                  <span className="text-[9.5px] text-stone-400 block mb-5">(Tanda Tangan &amp; Cap Stempel Lokasi Dinas)</span>
                  <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                    Kepala Kantor / Pimpinan Proyek / Pengawas
                  </span>
                </div>
              </div>

              {/* POS 4: Tiba Kembali di Kantor Asal */}
              <div className="p-3 space-y-2 min-h-[145px] flex flex-col justify-between">
                <div>
                  <div className="font-bold uppercase text-[11px] text-black">IV. Tiba Kembali di Kantor Asal (HO)</div>
                  <div className="text-[10.5px] text-stone-700 mt-1 space-y-0.5">
                    <div>Tempat: <strong>{sppd.kotaAsal}</strong></div>
                    <div>Pada Tanggal: <strong>{formatDateIndonesian(sppd.tanggalSelesai)}</strong></div>
                    <div>Pukul: _______ WIB</div>
                  </div>
                </div>
                <div className="text-center pt-4">
                  <span className="text-[9.5px] text-stone-400 block mb-5">(Tanda Tangan &amp; Cap Verifikasi SDM / HO)</span>
                  <span className="border-t border-dashed border-stone-400 block pt-1 text-[10px] font-bold">
                    Pejabat yang Memberi Perintah / Keuangan
                  </span>
                </div>
              </div>

            </div>

            {/* CATATAN RESUME DINAS */}
            <div className="mt-3.5 border border-black p-3 font-sans">
              <span className="text-[11px] font-bold uppercase block mb-1">
                V. Catatan Hasil Kegiatan Perjalanan Dinas / Resume Lapangan:
              </span>
              <div className="min-h-[70px] border border-dashed border-stone-300 p-2.5 text-[10px] text-stone-600 bg-stone-50/50">
                {(() => {
                  const remarks = sppd.keteranganSppd || '';
                  if (remarks && !remarks.includes('Voucher Biaya Perjalanan Dinas') && !remarks.includes('Diposting dari') && !remarks.includes('SPPD/NMSA/')) {
                    return <p className="text-stone-800 font-sans">{remarks}</p>;
                  }
                  return (
                    <p className="italic text-stone-500 font-sans">
                      Perjalanan dinas telah terlaksana sesuai penugasan operasional lapangan.
                    </p>
                  );
                })()}
              </div>
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

export const PrintSppdDocument: React.FC<PrintSppdDocumentProps> = ({
  sppd,
  onBack,
  onEdit,
  onPostToVoucher,
  isPublicView = false,
}) => {
  const [includeVisum, setIncludeVisum] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState<boolean>(false);

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
      
      {/* INJECTED PRINT STYLES FOR EXACT SINGLE-PAGE A4 FIT & 2-PAGE VISUM FIT */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm 10mm 12mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .sppd-print-page {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            box-sizing: border-box !important;
          }
          .page-break-after {
            page-break-after: always !important;
            break-after: page !important;
          }
          .page-break-before {
            page-break-before: always !important;
            break-before: page !important;
          }
          .no-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

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

      <SppdSheetContent sppd={sppd} includeVisum={includeVisum} />
    </div>
  );
};

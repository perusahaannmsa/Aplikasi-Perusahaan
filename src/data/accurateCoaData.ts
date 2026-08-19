import { AccurateAccount } from '../types';

export const DEFAULT_ACCURATE_ACCOUNTS: AccurateAccount[] = [
  // Kas & Bank
  { code: '1101', name: 'Kas', category: 'Kas & Bank', isDefaultKas: true, keywords: ['kas', 'cash'] },
  { code: '110101', name: 'Petty Cash Dhiya', category: 'Kas & Bank', keywords: ['dhiya'] },
  { code: '110102', name: 'Petty Cash Lapangan', category: 'Kas & Bank', isDefaultKas: true, keywords: ['kas kecil', 'petty cash', 'lapangan'] },
  { code: '11010201', name: 'Petty Cash Lapangan - Pak Usmar', category: 'Kas & Bank', keywords: ['usmar'] },
  { code: '11010202', name: 'Petty Cash Lapangan - Pak Suryo', category: 'Kas & Bank', keywords: ['suryo'] },
  { code: '11010203', name: 'Petty Cash Lapangan - Pak Hasnawi', category: 'Kas & Bank', keywords: ['hasnawi'] },
  { code: '11010204', name: 'Petty Cash Lapangan - PBM', category: 'Kas & Bank', keywords: ['pbm'] },
  { code: '110103', name: 'Petty Cash - Deasy', category: 'Kas & Bank', keywords: ['deasy'] },

  // Piutang Usaha
  { code: '1103', name: 'Piutang Usaha', category: 'Piutang Usaha', keywords: ['piutang'] },
  { code: '110301', name: 'Piutang Usaha IDR', category: 'Piutang Usaha' },
  { code: '110302', name: 'Uang Muka Pembelian IDR', category: 'Piutang Usaha', keywords: ['dp', 'uang muka'] },
  { code: '110303', name: 'Piutang Usaha USD', category: 'Piutang Usaha' },
  { code: '110304', name: 'Uang Muka Pembelian USD', category: 'Piutang Usaha' },
  { code: '1103.01', name: 'Piutang Karyawan', category: 'Piutang Usaha', keywords: ['kasbon', 'pinjaman karyawan', 'piutang karyawan'] },

  // Persediaan
  { code: '1104', name: 'Persediaan', category: 'Persediaan', keywords: ['persediaan', 'stok', 'stock'] },
  { code: '110401', name: 'Persediaan', category: 'Persediaan' },
  { code: '110402', name: 'Persediaan Terkirim', category: 'Persediaan' },
  { code: '110403', name: 'Persediaan Dalam Proses', category: 'Persediaan' },

  // Aset Lancar Lainnya
  { code: '1105', name: 'Aset Lancar Lainnya', category: 'Aset Lancar Lainnya' },
  { code: '110501', name: 'Biaya Dibayar di Muka', category: 'Aset Lancar Lainnya' },
  { code: '110502', name: 'Sewa Gedung Dibayar Dimuka', category: 'Aset Lancar Lainnya', keywords: ['sewa kantor', 'sewa gedung'] },
  { code: '110503', name: 'Asuransi Dibayar Dimuka', category: 'Aset Lancar Lainnya', keywords: ['asuransi'] },
  { code: '110506', name: 'Pembelian Aset', category: 'Aset Lancar Lainnya' },
  { code: '1106', name: 'Piutang Sister Company', category: 'Aset Lancar Lainnya' },
  { code: '110601', name: 'Piutang Sister Company - ANH', category: 'Aset Lancar Lainnya' },
  { code: '110602', name: 'Piutang Sister Company - NHK', category: 'Aset Lancar Lainnya' },
  { code: '110603', name: 'Piutang Sister Company - NH', category: 'Aset Lancar Lainnya' },
  { code: '110604', name: 'Piutang Sister Company - TSN', category: 'Aset Lancar Lainnya' },
  { code: '1107', name: 'Piutang Affiliasi', category: 'Aset Lancar Lainnya' },
  { code: '110701', name: 'Piutang Affiliasi - RRA', category: 'Aset Lancar Lainnya' },
  { code: '110702', name: 'Piutang Affiliasi - IPN', category: 'Aset Lancar Lainnya' },
  { code: '110703', name: 'Piutang Affiliasi - Coopmura', category: 'Aset Lancar Lainnya' },
  { code: '110704', name: 'Piutang Affiliasi - SIRON', category: 'Aset Lancar Lainnya' },
  { code: '1108', name: 'Piutang Lainnya', category: 'Aset Lancar Lainnya' },
  { code: '110801', name: 'Piutang Lainnya - Owner', category: 'Aset Lancar Lainnya' },
  { code: '11080101', name: 'Piutang Lainnya - A Nursyam Halid', category: 'Aset Lancar Lainnya' },
  { code: '11080102', name: 'Piutang Lainnya - Andi M Nul Al Bisty Nurdin Halid', category: 'Aset Lancar Lainnya' },
  { code: '11080103', name: 'Piutang Lainnya - Andi M Zunnun Armin Nurdin Halid', category: 'Aset Lancar Lainnya' },
  { code: '11080104', name: 'Piutang Lainnya - Andi M Rifki Naufal Saifullah Nursyam', category: 'Aset Lancar Lainnya' },
  { code: '11080105', name: 'Piutang Lainnya - Nanu Rahayu', category: 'Aset Lancar Lainnya' },
  { code: '11080106', name: 'Piutang Lainnya - 01', category: 'Aset Lancar Lainnya' },
  { code: '110802', name: 'Piutang Lainnya - Pak Santoso', category: 'Aset Lancar Lainnya' },
  { code: '11080201', name: 'Pak Santoso - MNC', category: 'Aset Lancar Lainnya' },
  { code: '11080202', name: 'Pak Santoso - Notaris Bali', category: 'Aset Lancar Lainnya' },
  { code: '11080203', name: 'Pak Santoso - Notaris Bank', category: 'Aset Lancar Lainnya' },
  { code: '11080204', name: 'Pak Santoso - Bunga Pinjaman BNI', category: 'Aset Lancar Lainnya' },
  { code: '110803', name: 'Piutang Lainnya - Meggie', category: 'Aset Lancar Lainnya' },
  { code: '1109', name: 'Prepaid Pajak', category: 'Aset Lancar Lainnya' },
  { code: '110901', name: 'PPN Masukan', category: 'Aset Lancar Lainnya', keywords: ['ppn masukan', 'ppn 11%'] },
  { code: '110902', name: 'PPh 23 Penjualan', category: 'Aset Lancar Lainnya' },
  { code: '110903', name: 'Prepaid PPh 22', category: 'Aset Lancar Lainnya' },

  // Aset Tetap
  { code: '1200', name: 'Aset Tetap', category: 'Aset Tetap' },
  { code: '120001', name: 'Tanah', category: 'Aset Tetap' },
  { code: '120002', name: 'Gedung', category: 'Aset Tetap' },
  { code: '120003', name: 'Kendaraan', category: 'Aset Tetap', keywords: ['mobil', 'motor', 'kendaraan'] },
  { code: '120004', name: 'Peralatan', category: 'Aset Tetap', keywords: ['mesin', 'peralatan'] },
  { code: '120005', name: 'Inventaris Kantor', category: 'Aset Tetap', keywords: ['laptop', 'komputer', 'meja', 'kursi', 'ac', 'lemari'] },
  { code: '120006', name: 'Akumulasi Depresiasi Aset Tetap', category: 'Akumulasi Penyusutan' },
  { code: '12000601', name: 'Akumulasi Penyusutan Gedung', category: 'Akumulasi Penyusutan' },
  { code: '12000602', name: 'Akumulasi Penyusutan Kendaraan', category: 'Akumulasi Penyusutan' },
  { code: '12000603', name: 'Akumulasi Penyusutan Peralatan', category: 'Akumulasi Penyusutan' },
  { code: '12000604', name: 'Akumulasi Penyusutan Inventaris Kantor', category: 'Akumulasi Penyusutan' },
  { code: '1300', name: 'Proyek Dalam Pelaksanaan', category: 'Aset Lainnya' },

  // Kewajiban / Hutang
  { code: '2101', name: 'Utang Usaha', category: 'Utang Usaha' },
  { code: '210101', name: 'Utang Usaha IDR', category: 'Utang Usaha' },
  { code: '210102', name: 'Uang Muka Penjualan IDR', category: 'Utang Usaha' },
  { code: '210103', name: 'Utang Usaha USD', category: 'Utang Usaha' },
  { code: '210104', name: 'Uang Muka Penjualan USD', category: 'Utang Usaha' },
  { code: '2102', name: 'Kewajiban Jangka Pendek Lainnya', category: 'Liabilitas Jangka Pendek' },
  { code: '210201', name: 'Hutang Pembelian Belum Ditagih', category: 'Liabilitas Jangka Pendek' },
  { code: '2103', name: 'Hutang Afiliasi', category: 'Liabilitas Jangka Pendek' },
  { code: '210301', name: 'Hutang Afiliasi - NH', category: 'Liabilitas Jangka Pendek' },
  { code: '210302', name: 'Hutang Affiliasi - RRA', category: 'Liabilitas Jangka Pendek' },
  { code: '210303', name: 'Hutang Afiliasi - ANH', category: 'Liabilitas Jangka Pendek' },
  { code: '2104', name: 'Hutang Pajak', category: 'Liabilitas Jangka Pendek', keywords: ['pajak', 'pph', 'ppn'] },
  { code: '210401', name: 'Hutang PPh 21', category: 'Liabilitas Jangka Pendek', keywords: ['pph 21', 'pph21'] },
  { code: '210402', name: 'Hutang PPh 22', category: 'Liabilitas Jangka Pendek', keywords: ['pph 22', 'pph22'] },
  { code: '210403', name: 'Hutang PPh 23 Pembelian', category: 'Liabilitas Jangka Pendek', keywords: ['pph 23', 'pph23'] },
  { code: '210404', name: 'PPN Keluaran', category: 'Liabilitas Jangka Pendek', keywords: ['ppn keluaran'] },
  { code: '2200', name: 'Hutang Jangka Panjang', category: 'Liabilitas Jangka Panjang' },
  { code: '220001', name: 'Hutang Bank BNI', category: 'Liabilitas Jangka Panjang', keywords: ['bni', 'kredit bank'] },

  // Modal
  { code: '3000', name: 'Modal', category: 'Modal' },
  { code: '300001', name: 'Modal Saham - PT Nusantara Halid', category: 'Modal' },
  { code: '300002', name: 'Modal Saham - A Nursyam Halid', category: 'Modal' },
  { code: '300003', name: 'Modal Saham - Andi M. Nul Al Bisty Nurdin Halid', category: 'Modal' },
  { code: '300004', name: 'Modal Saham - Andi M. Zunnun Armin Nurdin Halid', category: 'Modal' },
  { code: '300005', name: 'Modal Saham - Andi M. Rifki Naufal Saif', category: 'Modal' },
  { code: '300006', name: 'Modal Saham - Nanu Rahayu', category: 'Modal' },
  { code: '3100', name: 'Laba Ditahan', category: 'Modal' },
  { code: '3300', name: 'Equitas Saldo Awal', category: 'Modal' },

  // Pendapatan
  { code: '4000', name: 'Pendapatan Operasional', category: 'Pendapatan' },
  { code: '400001', name: 'Penjualan', category: 'Pendapatan', keywords: ['penjualan', 'invoice', 'tagihan'] },
  { code: '400002', name: 'Pendapatan Jasa', category: 'Pendapatan', keywords: ['jasa', 'revenue'] },
  { code: '400003', name: 'Retur Penjualan', category: 'Pendapatan' },
  { code: '400004', name: 'Diskon Penjualan', category: 'Pendapatan', keywords: ['diskon'] },
  { code: '4401', name: 'Diskon Penjualan', category: 'Pendapatan' },
  { code: '440101', name: 'Diskon Penjualan IDR', category: 'Pendapatan' },
  { code: '440102', name: 'Diskon Penjualan USD', category: 'Pendapatan' },

  // Beban Pokok Penjualan
  { code: '5101', name: 'Beban Pokok Penjualan', category: 'Beban Pokok Penjualan', keywords: ['hpp', 'cogs'] },
  { code: '5102', name: 'Biaya Surveyor', category: 'Beban Pokok Penjualan', keywords: ['surveyor', 'draft survey', 'lhv', 'sucofindo', 'geoservices', 'carsurin'] },
  { code: '5103', name: 'Biaya Tongkang', category: 'Beban Pokok Penjualan', keywords: ['tongkang', 'barge', 'freight tongkang', 'towing'] },
  { code: '5104', name: 'Biaya Trucking', category: 'Beban Pokok Penjualan', keywords: ['trucking', 'sewa dump truck', 'dt', 'hauling', 'angkut'] },
  { code: '5105', name: 'Biaya Insurance', category: 'Beban Pokok Penjualan', keywords: ['asuransi kargo', 'insurance'] },
  { code: '5106', name: 'Biaya Sewa Alat Berat & Kendaraan', category: 'Beban Pokok Penjualan', keywords: ['sewa alat berat', 'excavator', 'loader', 'dozer', 'sewa mobil site'] },
  { code: '5107', name: 'Biaya Upah Lapangan', category: 'Beban Pokok Penjualan', keywords: ['upah lapangan', 'gaji lapangan', 'lembur site', 'tenaga kerja'] },
  { code: '5108', name: 'Biaya BBM / Solar', category: 'Beban Pokok Penjualan', keywords: ['solar', 'b30', 'dex', 'bbm industri', 'pertamina', 'spbu'] },
  { code: '5109', name: 'Biaya Catering', category: 'Beban Pokok Penjualan', keywords: ['catering site', 'makan mess', 'katering site'] },

  // Beban Operasional (6000)
  { code: '6000', name: 'Beban Operasional', category: 'Beban Operasional' },
  { code: '600001', name: 'Beban Iklan', category: 'Beban Operasional', keywords: ['iklan', 'promosi', 'brochure', 'spanduk'] },
  { code: '600002', name: 'Beban Komisi', category: 'Beban Operasional', keywords: ['komisi', 'fee', 'mediator'] },
  { code: '600003', name: 'Beban Bensin, Parkir, Tol Kendaraan', category: 'Beban Operasional', keywords: ['bensin', 'pertamax', 'pertalite', 'parkir', 'tol', 'e-toll', 'etoll', 'spbu'] },
  { code: '600004', name: 'Beban Gaji, Upah & Honorer', category: 'Beban Operasional', keywords: ['gaji', 'salary', 'upah', 'honorer', 'bonus'] },
  { code: '600005', name: 'Beban Bonus, Pesangon & Kompensasi', category: 'Beban Operasional', keywords: ['bonus', 'pesangon', 'kompensasi'] },
  { code: '600006', name: 'Beban Transportasi', category: 'Beban Operasional', keywords: ['transport', 'taksi', 'grab', 'gojek', 'sewa mobil', 'travel', 'angkot'] },
  { code: '600007', name: 'Beban Katering & Makan Karyawan', category: 'Beban Operasional', keywords: ['makan', 'katering', 'catering', 'konsumsi', 'snack', 'restoran', 'kopi', 'gula', 'teh', 'galon', 'aqua'] },
  { code: '600008', name: 'Beban Tunjangan Kesehatan', category: 'Beban Operasional', keywords: ['kesehatan', 'obat', 'apotek', 'dokter', 'klinik', 'resep', 'vitamin'] },
  { code: '600009', name: 'Beban Tiket', category: 'Beban Operasional', keywords: ['tiket', 'pesawat', 'lion', 'garuda', 'citilink', 'kereta', 'ka'] },
  { code: '600010', name: 'Beban THR', category: 'Beban Operasional', keywords: ['thr', 'tunjangan hari raya'] },
  { code: '600011', name: 'Beban Listrik', category: 'Beban Operasional', keywords: ['listrik', 'pln', 'token'] },
  { code: '600012', name: 'Beban PAM', category: 'Beban Operasional', keywords: ['pam', 'pdam', 'air'] },
  { code: '600013', name: 'Beban Telekomunikasi', category: 'Beban Operasional', keywords: ['pulsa', 'kuota', 'paket data', 'indihome', 'telkomsel', 'xl', 'biznet', 'wifi', 'telepon'] },
  { code: '600014', name: 'Beban Ekspedisi, Pos & Materai', category: 'Beban Operasional', keywords: ['materai', 'jne', 'j&t', 'sicepat', 'ekspedisi', 'pos', 'kurir', 'ongkir', 'paket'] },
  { code: '600015', name: 'Beban Perjalanan Dinas', category: 'Beban Operasional', keywords: ['sppd', 'perjalanan dinas', 'hotel', 'penginapan', 'lodging', 'uang harian'] },
  { code: '600016', name: 'Beban Perlengkapan Kantor', category: 'Beban Operasional', keywords: ['atk', 'kertas', 'pulpen', 'pensil', 'map', 'amplop', 'printer', 'tinta', 'fotocopy', 'jilid', 'stempel', 'spidol'] },
  { code: '600017', name: 'Beban Pajak Penghasilan', category: 'Beban Operasional', keywords: ['pajak penghasilan', 'pph'] },
  { code: '600018', name: 'Beban Retribusi & Sumbangan', category: 'Beban Operasional', keywords: ['retribusi', 'sumbangan', 'proposal', 'keamanan', 'sampah', 'iuran', 'karang taruna'] },
  { code: '600019', name: 'Beban Sewa Gedung', category: 'Beban Operasional', keywords: ['sewa ruko', 'sewa kantor', 'sewa mess'] },
  { code: '600020', name: 'Beban BPJSTK', category: 'Beban Operasional', keywords: ['bpjs', 'bpjstk', 'bpjs ketenagakerjaan'] },
  { code: '600021', name: 'Beban Rumah Tangga Kantor', category: 'Beban Operasional', keywords: ['rtk', 'rumah tangga kantor', 'sabun', 'tisue', 'tissue', 'desinfektan', 'pembersih', 'keset', 'sapu'] },
  { code: '600022', name: 'BEBAN PERBAIKAN KENDARAAN', category: 'Beban Operasional', keywords: ['bengkel', 'servis mobil', 'service kendaraan', 'sparepart mobil', 'ban', 'cuci mobil', 'ganti oli'] },
  { code: '600023', name: 'BEBAN PERBAIKAN INVENTARIS KANTOR', category: 'Beban Operasional', keywords: ['servis ac', 'perbaikan komputer', 'service printer'] },
  { code: '600024', name: 'Beban Perizinan & Legalitas', category: 'Beban Operasional', keywords: ['notaris', 'legalitas', 'perizinan', 'iup', 'siup', 'nib', 'oss', 'akta'] },
  { code: '600025', name: 'Beban Jasa Konsultan', category: 'Beban Operasional', keywords: ['konsultan', 'pajak', 'auditor', 'pengacara'] },
  { code: '600026', name: 'BEBAN PERBAIKAN', category: 'Beban Operasional', keywords: ['perbaikan', 'renovasi', 'service'] },
  { code: '600029', name: 'Beban Entertainment', category: 'Beban Operasional', keywords: ['entertainment', 'jamuan', 'relasi', 'klien'] },
  { code: '600095', name: 'Beban Penyusutan Inventaris Kantor', category: 'Beban Operasional' },
  { code: '600096', name: 'Beban Penyusutan Peralatan', category: 'Beban Operasional' },
  { code: '600097', name: 'Beban Penyusutan Kendaraan', category: 'Beban Operasional' },
  { code: '600098', name: 'Beban Penyusutan Gedung', category: 'Beban Operasional' },
  { code: '600099', name: 'Beban Operasional Lainnya', category: 'Beban Operasional', keywords: ['lain-lain', 'operasional', 'admin'] },

  // Pendapatan & Beban Diluar Usaha (7000)
  { code: '7100', name: 'Pendapatan Diluar Usaha', category: 'Pendapatan Lainnya' },
  { code: '710001', name: 'Pendapatan Jasa Giro', category: 'Pendapatan Lainnya', keywords: ['jasa giro'] },
  { code: '710002', name: 'Pendapatan Bunga Deposito', category: 'Pendapatan Lainnya', keywords: ['bunga deposito'] },
  { code: '710003', name: 'Penjualan Persediaan / Perlengkapan', category: 'Pendapatan Lainnya' },
  { code: '710004', name: 'Laba/Rugi Revaluasi Aset', category: 'Pendapatan Lainnya' },
  { code: '710005', name: 'Pendapatan Diluar Usaha Lainnya', category: 'Pendapatan Lainnya' },

  { code: '7200', name: 'Beban Diluar Usaha', category: 'Beban Lainnya' },
  { code: '720001', name: 'Beban Bunga Pinjaman', category: 'Beban Lainnya', keywords: ['bunga pinjaman', 'bunga bank'] },
  { code: '720002', name: 'Beban Adm. Bank & Buku Cek/Giro', category: 'Beban Lainnya', keywords: ['biaya admin bank', 'admin bank', 'biaya transfer', 'buku cek', 'giro'] },
  { code: '720003', name: 'Pajak Jasa Giro', category: 'Beban Lainnya' },
  { code: '720004', name: 'Laba/Rugi Terealisasi', category: 'Beban Lainnya' },
  { code: '72000401', name: 'Laba/Rugi Terealisasi IDR', category: 'Beban Lainnya' },
  { code: '72000402', name: 'Laba/Rugi Terealisasi USD', category: 'Beban Lainnya' },
  { code: '720005', name: 'Laba/Rugi Belum Terealisasi', category: 'Beban Lainnya' },
  { code: '72000501', name: 'Laba/Rugi Belum Terealisasi IDR', category: 'Beban Lainnya' },
  { code: '72000502', name: 'Laba/Rugi Belum Terealisasi USD', category: 'Beban Lainnya' },
  { code: '720006', name: 'Laba/Rugi Disposisi Aset', category: 'Beban Lainnya' },
  { code: '720007', name: 'Beban Diluar Usaha Lainnya', category: 'Beban Lainnya' }
];

export function autoMapTransactionToAccurate(description: string, accounts: AccurateAccount[]): { code: string; name: string; confidence: 'high' | 'medium' | 'manual' } {
  const descLower = (description || '').toLowerCase();

  for (const acc of accounts) {
    if (acc.keywords && acc.keywords.length > 0) {
      for (const kw of acc.keywords) {
        if (kw && descLower.includes(kw.toLowerCase())) {
          return {
            code: acc.code,
            name: acc.name,
            confidence: 'high'
          };
        }
      }
    }
  }

  // Fallback to 600099 Beban Operasional Lain-lain or 6000
  const defaultAcc = accounts.find(a => a.code === '600099' || a.code === '6000') || accounts.find(a => a.category.includes('Beban')) || accounts[0];
  return {
    code: defaultAcc.code,
    name: defaultAcc.name,
    confidence: 'medium'
  };
}

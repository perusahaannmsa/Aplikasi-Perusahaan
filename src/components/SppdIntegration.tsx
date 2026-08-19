import React, { useState, useEffect } from 'react';
import { Submission } from '../types';
import { 
  CheckCircle2, 
  FileText, 
  Plus, 
  Calendar, 
  MapPin, 
  User, 
  RefreshCw
} from 'lucide-react';

export interface SppdRecord {
  id: string;
  noSppd: string;
  namaPegawai: string;
  jabatan: string;
  maksudDinas: string;
  kotaTujuan: string;
  tanggalBerangkat: string;
  tanggalKembali: string;
  uangHarian: number;
  biayaTransport: number;
  biayaPenginapan: number;
  totalBiaya: number;
  status: 'Disetujui' | 'Draft' | 'Terbayar';
  fullRecord?: any;
}

export const INITIAL_SPPD_SAMPLES: SppdRecord[] = [
  {
    id: 'SPPD-2026-001',
    noSppd: '090/SPPD-HO/NMSA/VI/2026',
    namaPegawai: 'Nur Wahyudi',
    jabatan: 'Accounting & Finance Supervisor',
    maksudDinas: 'Pengawasan Lapangan & Verifikasi Aset Tambang Mineral',
    kotaTujuan: 'Site Kolaka, Sulawesi Tenggara',
    tanggalBerangkat: '2026-07-15',
    tanggalKembali: '2026-07-18',
    uangHarian: 1500000,
    biayaTransport: 3200000,
    biayaPenginapan: 2400000,
    totalBiaya: 7100000,
    status: 'Disetujui'
  },
  {
    id: 'SPPD-2026-002',
    noSppd: '091/SPPD-HO/NMSA/VI/2026',
    namaPegawai: 'Harijon',
    jabatan: 'Head of Operational',
    maksudDinas: 'Koordinasi Operasional & Pertemuan Mitra Kerja Regional',
    kotaTujuan: 'Kendari, Sulawesi Tenggara',
    tanggalBerangkat: '2026-07-20',
    tanggalKembali: '2026-07-22',
    uangHarian: 1200000,
    biayaTransport: 2800000,
    biayaPenginapan: 1900000,
    totalBiaya: 5900000,
    status: 'Disetujui'
  },
  {
    id: 'SPPD-2026-003',
    noSppd: '092/SPPD-HO/NMSA/VII/2026',
    namaPegawai: 'Andi Dhiya Salsabila',
    jabatan: 'Senior Finance Officer',
    maksudDinas: 'Audit Internal Petty Cash & Kas Lapangan Morowali',
    kotaTujuan: 'Morowali, Sulawesi Tengah',
    tanggalBerangkat: '2026-08-01',
    tanggalKembali: '2026-08-04',
    uangHarian: 1600000,
    biayaTransport: 3500000,
    biayaPenginapan: 2700000,
    totalBiaya: 7800000,
    status: 'Disetujui'
  }
];

interface SppdIntegrationProps {
  onImportSppdToSubmission?: (sppd: SppdRecord) => void;
  onClose?: () => void;
}

export const SppdIntegration: React.FC<SppdIntegrationProps> = ({
  onImportSppdToSubmission
}) => {
  const loadUnifiedSppdList = (): SppdRecord[] => {
    try {
      const storedV1 = localStorage.getItem('sppd_records_v1');
      if (!storedV1) {
        return [];
      }
      let listV1: any[] = JSON.parse(storedV1);

      if (!Array.isArray(listV1) || listV1.length === 0) {
        return [];
      }

      return listV1.map(item => {
        const total = item.costItems ? item.costItems.reduce((a: number, c: any) => a + (c.jumlah || 0), 0) : (item.totalBiaya || 0);
        
        let transport = 0;
        let hotel = 0;
        let harian = 0;
        if (item.costItems && Array.isArray(item.costItems)) {
          item.costItems.forEach((c: any) => {
            const kat = (c.kategori || '').toLowerCase();
            if (kat.includes('makan') || kat.includes('saku') || kat.includes('harian')) {
              harian += (c.jumlah || 0);
            } else if (kat.includes('hotel') || kat.includes('penginapan')) {
              hotel += (c.jumlah || 0);
            } else {
              transport += (c.jumlah || 0);
            }
          });
        }

        return {
          id: item.id || 'sppd_' + Math.random(),
          noSppd: item.noSppd || 'SPPD-NMSA/2026/001',
          namaPegawai: item.namaPekerja || item.namaPegawai || 'Pegawai',
          jabatan: item.jabatan || 'Staf',
          maksudDinas: item.tujuanPerjalanan || item.maksudDinas || 'Dinas Perusahaan',
          kotaTujuan: item.kotaTujuan || 'Site',
          tanggalBerangkat: item.tanggalMulai || item.tanggalBerangkat || new Date().toISOString().split('T')[0],
          tanggalKembali: item.tanggalSelesai || item.tanggalKembali || new Date().toISOString().split('T')[0],
          uangHarian: harian > 0 ? harian : Math.round(total * 0.25),
          biayaTransport: transport > 0 ? transport : Math.round(total * 0.45),
          biayaPenginapan: hotel > 0 ? hotel : Math.round(total * 0.30),
          totalBiaya: total,
          status: item.status || 'Disetujui',
          fullRecord: item
        };
      });
    } catch (e) {
      return INITIAL_SPPD_SAMPLES;
    }
  };

  const [sppdList, setSppdList] = useState<SppdRecord[]>(loadUnifiedSppdList);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleRefresh = () => {
    setSppdList(loadUnifiedSppdList());
    setSuccessMessage('Daftar SPPD diperbarui dari sistem.');
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const handleCreateVoucherFromSppd = (sppd: SppdRecord) => {
    if (onImportSppdToSubmission) {
      onImportSppdToSubmission(sppd);
      setSuccessMessage(`Data SPPD ${sppd.noSppd} dimasukkan ke formulir pengajuan HO!`);
      setTimeout(() => setSuccessMessage(null), 3500);
    }
  };

  return (
    <div className="space-y-4 text-left">
      {/* NOTIFIKASI SUKSES */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-xs font-bold text-emerald-800 animate-fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* DAFTAR SPPD TERSEDIA UNTUK DIIMPOR */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-3xs space-y-3">
        <div className="flex items-center justify-between border-b border-stone-150 pb-2.5">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-amber-600" />
            <h4 className="text-xs font-extrabold text-stone-850 uppercase tracking-wider font-display">
              Daftar Surat Perintah Perjalanan Dinas (SPPD) Siap Impor
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="p-1.5 text-stone-500 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition text-xs flex items-center gap-1 font-bold cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw size={13} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <span className="text-[11px] font-mono text-stone-500 font-semibold bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
              {sppdList.length} Dokumen SPPD
            </span>
          </div>
        </div>

        <p className="text-xs text-stone-500 leading-relaxed">
          Pilih salah satu dokumen SPPD di bawah ini untuk membuat <strong>Formulir Pengajuan Voucher HO & Bukti Pengeluaran Kas/Bank</strong> secara otomatis dengan rincian biaya tiket, hotel, dan uang harian terisi instan.
        </p>

        <div className="grid grid-cols-1 gap-2.5 pt-1">
          {sppdList.map((sppd) => (
            <div 
              key={sppd.id}
              className="bg-stone-50 hover:bg-amber-50/40 border border-stone-200 hover:border-amber-300 rounded-xl p-3.5 transition duration-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black font-mono text-stone-900 bg-stone-200/80 px-2 py-0.5 rounded-md border border-stone-300">
                    {sppd.noSppd}
                  </span>
                  <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {sppd.status}
                  </span>
                </div>
                
                <div className="text-xs font-bold text-stone-850 flex items-center gap-1.5 pt-0.5">
                  <User size={13} className="text-stone-400 shrink-0" />
                  <span>{sppd.namaPegawai}</span>
                  <span className="text-[11px] font-normal text-stone-500 font-sans">({sppd.jabatan})</span>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-stone-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-rose-500 shrink-0" />
                    <strong className="text-stone-700">{sppd.kotaTujuan}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={12} className="text-amber-600 shrink-0" />
                    <span>{sppd.tanggalBerangkat} s.d {sppd.tanggalKembali}</span>
                  </span>
                </div>

                <p className="text-[11px] text-stone-600 italic">
                  &quot;{sppd.maksudDinas}&quot;
                </p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-stone-200 pt-2.5 md:pt-0">
                <div className="text-right">
                  <div className="text-[10px] text-stone-400 font-semibold uppercase">Total Reimburse SPPD</div>
                  <div className="text-sm font-black text-amber-600 font-mono">
                    Rp {sppd.totalBiaya.toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {onImportSppdToSubmission && (
                    <button
                      type="button"
                      onClick={() => handleCreateVoucherFromSppd(sppd)}
                      className="px-3.5 py-2 bg-stone-900 hover:bg-amber-500 hover:text-stone-950 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-xs shrink-0 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Buat Voucher HO</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

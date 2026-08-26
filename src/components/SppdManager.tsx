import React, { useState, useEffect } from 'react';
import { 
  JabatanDinas, 
  RatePedoman, 
  getStoredPedomanMatrix, 
  savePedomanMatrix, 
  getPedomanByJabatan,
  DEFAULT_PEDOMAN_BIAYA_MATRIX
} from '../data/pedomanBiaya';
import { generateNextSppdNumber, saveSppdNumberUsage } from '../utils/sppdNumbering';
import { terbilang } from '../lib/terbilang';
import { PrintSppdDocument } from './PrintSppdDocument';
import { 
  saveSppdRecordsToFirestore, 
  loadSppdRecordsFromFirestore, 
  deleteSppdRecordFromFirestore,
  isFirebaseConfigured
} from '../firebase';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Save, 
  Sparkles, 
  Send, 
  Calendar, 
  MapPin, 
  User, 
  Briefcase, 
  ArrowRight, 
  Settings, 
  CheckCircle2, 
  ListFilter, 
  FileCheck, 
  ExternalLink,
  Printer,
  Copy,
  Info,
  Pencil,
  X,
  Check,
  Cloud,
  Paperclip,
  Eye,
  Download,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';

export interface SPPDCostAttachment {
  name: string;
  url: string; // Base64 data URL
  pageCount: number;
  sizeBytes?: number;
  uploadedAt?: string;
  sourceImagesCount?: number;
}

export interface SPPDCostItem {
  id: string;
  kategori: string;   // Nama Biaya / Jenis Pengeluaran
  rincian: string;    // Rincian / Rumus (cth: 3 hari @ Rp 200.000)
  hargaAcuan?: number; // Harga Acuan / Pedoman Tarif Perusahaan
  jumlah: number;     // Harga Real Digunakan / Terpakai
  attachment?: SPPDCostAttachment; // Converted multi-page PDF proof
}

export interface SPPDRecord {
  id: string;
  noSppd: string;
  hariTanggal: string;
  pemberiPerintah: string;
  pemberiPerintahJabatan?: string;
  namaPekerja: string;
  jabatan: JabatanDinas;
  divisi?: string;
  kotaAsal: string;
  kotaTujuan: string;
  transportasi: string;
  lamaPerjalanan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  tujuanPerjalanan: string;
  keteranganSppd?: string;
  costItems: SPPDCostItem[];
  attachedFiles?: { url: string; name: string; pageCount?: number; category?: string; sizeBytes?: number }[];
  pemberiPerintahName?: string;
  sppdDisetujuiName?: string;
  sppdDisetujuiJabatan?: string;
  sppdMengetahuiName?: string;
  status: 'Draft' | 'Disetujui' | 'Terbayar';
  createdAt: string;
}

// Calculate guideline benchmark for individual cost item
export function getItemBenchmark(
  kategori: string,
  rincian: string,
  targetJabatan: JabatanDinas,
  days: number,
  nights: number,
  matrix: RatePedoman[]
): number {
  const p = getPedomanByJabatan(targetJabatan, matrix);
  const combined = `${kategori || ''} ${rincian || ''}`.toLowerCase();

  if (combined.includes('makan') || combined.includes('konsumsi')) {
    return p.uangMakanPerHari * days;
  }
  if (combined.includes('saku') || combined.includes('pocket') || combined.includes('allowance')) {
    return p.uangSakuPerHari * days;
  }
  if (combined.includes('jkt - bandara') || combined.includes('rumah - bandara') || (combined.includes('transport') && combined.includes('bandara') && !combined.includes('hotel'))) {
    return p.transportJkt + p.transportBandara;
  }
  if (combined.includes('pesawat') || combined.includes('flight') || combined.includes('tiket pesawat')) {
    return p.tiketPesawatRate;
  }
  if (combined.includes('hotel') || combined.includes('penginapan') || combined.includes('lodging') || combined.includes('kamar')) {
    return p.hotelPerMalam * nights;
  }
  if (combined.includes('double cabin') || combined.includes('dcabin') || combined.includes('hilux') || combined.includes('triton') || combined.includes('4x4')) {
    return p.sewaMobilDoubleCabin;
  }
  if (combined.includes('sewa mobil') || combined.includes('avanza') || combined.includes('innova') || combined.includes('rental')) {
    return p.sewaMobilAvanza;
  }
  return 0; // Other / flexible categories
}

interface SppdManagerProps {
  onPostToVoucherHO: (sppd: SPPDRecord) => void;
  onClose?: () => void;
  initialSppdId?: string | null;
}

const INITIAL_SAMPLES: SPPDRecord[] = [
  {
    id: 'sppd_2026_01',
    noSppd: 'SPPD-NMSA/VII/2026/001',
    hariTanggal: '15 Juli 2026',
    pemberiPerintah: 'H. A. Nursyam Halid',
    pemberiPerintahJabatan: 'Direktur Utama',
    namaPekerja: 'Nur Wahyudi',
    jabatan: 'Supervisor',
    divisi: 'Accounting & Finance',
    kotaAsal: 'Jakarta (HO)',
    kotaTujuan: 'Site Kolaka, Sulawesi Tenggara',
    transportasi: 'Pesawat + Mobil Double Cabin',
    lamaPerjalanan: '4 Hari 3 Malam',
    tanggalMulai: '2026-07-15',
    tanggalSelesai: '2026-07-18',
    tujuanPerjalanan: 'Pengawasan Lapangan & Verifikasi Aset Tambang Mineral',
    keteranganSppd: 'Semua bukti tiket & kwitansi hotel dilampirkan lengkap',
    costItems: [
      { id: 'c1', kategori: 'Uang Makan Per Hari', rincian: '4 Hari @ Rp 100.000', hargaAcuan: 400000, jumlah: 400000 },
      { id: 'c2', kategori: 'Uang Saku Per Hari', rincian: '4 Hari @ Rp 100.000', hargaAcuan: 400000, jumlah: 400000 },
      { id: 'c3', kategori: 'Transport Lokal Jakarta / Bandara', rincian: '2x Jalan (PP)', hargaAcuan: 400000, jumlah: 400000 },
      { id: 'c4', kategori: 'Tiket Pesawat PP', rincian: 'Jakarta - Kendari PP', hargaAcuan: 3000000, jumlah: 3200000 },
      { id: 'c5', kategori: 'Penginapan / Hotel', rincian: '3 Malam @ Rp 450.000', hargaAcuan: 1350000, jumlah: 1500000 },
      { id: 'c6', kategori: 'Sewa Mobil Operational Site', rincian: 'Double Cabin 3 Hari', hargaAcuan: 4500000, jumlah: 4200000 },
    ],
    pemberiPerintahName: 'H. A. Nursyam Halid',
    sppdDisetujuiName: 'Harijon',
    sppdDisetujuiJabatan: 'Head of Operational',
    sppdMengetahuiName: 'Nur Wahyudi',
    status: 'Disetujui',
    createdAt: new Date().toISOString()
  }
];

export const SppdManager: React.FC<SppdManagerProps> = ({
  onPostToVoucherHO,
  onClose,
  initialSppdId
}) => {
  const [records, setRecords] = useState<SPPDRecord[]>(() => {
    try {
      const stored = localStorage.getItem('sppd_records_v1');
      if (stored !== null) {
        return JSON.parse(stored);
      }
      return INITIAL_SAMPLES;
    } catch {
      return [];
    }
  });

  const [previewPrintSppd, setPreviewPrintSppd] = useState<SPPDRecord | null>(null);
  const [isLinkCopied, setIsLinkCopied] = useState<boolean>(false);
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState<string | null>(null);
  const [previewAttachmentTitle, setPreviewAttachmentTitle] = useState<string>('');

  // Helper to merge SPPD records without overwriting local changes
  const mergeSppdRecords = (current: SPPDRecord[], incoming: SPPDRecord[]): SPPDRecord[] => {
    if (!Array.isArray(incoming) || incoming.length === 0) return current;
    const map = new Map<string, SPPDRecord>();
    
    // Register all incoming
    incoming.forEach(rec => {
      const key = rec.id || rec.noSppd;
      if (key) map.set(key, rec);
    });
    
    // Merge or preserve current local records
    current.forEach(rec => {
      const key = rec.id || rec.noSppd;
      if (key) {
        if (map.has(key)) {
          map.set(key, { ...map.get(key)!, ...rec });
        } else {
          map.set(key, rec);
        }
      }
    });

    const merged = Array.from(map.values());
    merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return merged;
  };

  // Sync SPPD records from server and Firestore on load & listen to local storage / custom events
  useEffect(() => {
    const handleStorageOrCustomEvent = () => {
      try {
        const stored = localStorage.getItem('sppd_records_v1');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRecords(prev => mergeSppdRecords(prev, parsed));
          }
        }
        const requestedTab = sessionStorage.getItem('sppd_active_tab');
        if (requestedTab && ['create', 'list', 'settings'].includes(requestedTab)) {
          setActiveTabInternal(requestedTab as any);
        }
      } catch (err) {}
    };

    window.addEventListener('storage', handleStorageOrCustomEvent);
    window.addEventListener('sppd_records_updated', handleStorageOrCustomEvent);

    // 1. Sync from server
    fetch('/api/sppd')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.sppdRecords && Array.isArray(data.sppdRecords) && data.sppdRecords.length > 0) {
          setRecords(prev => {
            const merged = mergeSppdRecords(prev, data.sppdRecords);
            localStorage.setItem('sppd_records_v1', JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(() => {
        fetch('/api/shared-state')
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data && data.sppdRecords && Array.isArray(data.sppdRecords) && data.sppdRecords.length > 0) {
              setRecords(prev => {
                const merged = mergeSppdRecords(prev, data.sppdRecords);
                localStorage.setItem('sppd_records_v1', JSON.stringify(merged));
                return merged;
              });
            }
          })
          .catch(() => {});
      });

    // 2. Sync from Firestore
    loadSppdRecordsFromFirestore()
      .then(fsRecords => {
        if (fsRecords && Array.isArray(fsRecords) && fsRecords.length > 0) {
          setRecords(prev => {
            const merged = mergeSppdRecords(prev, fsRecords);
            localStorage.setItem('sppd_records_v1', JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(err => console.warn('Firestore SPPD sync skipped:', err));

    return () => {
      window.removeEventListener('storage', handleStorageOrCustomEvent);
      window.removeEventListener('sppd_records_updated', handleStorageOrCustomEvent);
    };
  }, []);

  const [activeTab, setActiveTabInternal] = useState<'create' | 'list' | 'settings'>(() => {
    try {
      const saved = sessionStorage.getItem('sppd_active_tab');
      if (saved && ['create', 'list', 'settings'].includes(saved)) {
        return saved as any;
      }
    } catch (e) {}
    return 'create';
  });

  const setActiveTab = (tab: 'create' | 'list' | 'settings') => {
    setActiveTabInternal(tab);
    try { sessionStorage.setItem('sppd_active_tab', tab); } catch (e) {}
  };
  const [pedomanMatrix, setPedomanMatrix] = useState<RatePedoman[]>(getStoredPedomanMatrix());
  const [editingPedomanRow, setEditingPedomanRow] = useState<RatePedoman | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: string; noSppd: string } | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [noSppd, setNoSppd] = useState('');
  const [pemberiPerintah, setPemberiPerintah] = useState('H. A. Nursyam Halid');
  const [pemberiPerintahJabatan, setPemberiPerintahJabatan] = useState('Direktur Utama');
  const [namaPekerja, setNamaPekerja] = useState('Nur Wahyudi');
  const [jabatan, setJabatan] = useState<JabatanDinas>('Supervisor');
  const [divisi, setDivisi] = useState('Accounting & Finance');
  const [kotaAsal, setKotaAsal] = useState('Jakarta (HO)');
  const [kotaTujuan, setKotaTujuan] = useState('Kendari / Site Kolaka');
  const [transportasi, setTransportasi] = useState('Pesawat + Mobil Operational');
  const [tanggalMulai, setTanggalMulai] = useState(new Date().toISOString().split('T')[0]);
  const [tanggalSelesai, setTanggalSelesai] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [tujuanPerjalanan, setTujuanPerjalanan] = useState('Dinas Pengawasan & Operasional Lapangan');
  const [keteranganSppd, setKeteranganSppd] = useState('Kwitansi dan bukti pembayaran fisik terlampir.');
  
  // Penandatangan
  const [sppdDisetujuiName, setSppdDisetujuiName] = useState('Harijon');
  const [sppdDisetujuiJabatan, setSppdDisetujuiJabatan] = useState('Head of Operational');

  // Items
  const [costItems, setCostItems] = useState<SPPDCostItem[]>([]);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Auto calculate duration in days
  const calculateDays = (startStr: string, endStr: string) => {
    try {
      const s = new Date(startStr);
      const e = new Date(endStr);
      const diffTime = e.getTime() - s.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return diffDays > 0 ? diffDays : 1;
    } catch {
      return 1;
    }
  };

  const daysCount = calculateDays(tanggalMulai, tanggalSelesai);
  const nightsCount = daysCount > 1 ? daysCount - 1 : 1;
  const lamaPerjalananText = `${daysCount} Hari ${nightsCount} Malam`;

  // Initialize or reset form with auto SPPD number
  const handleNewForm = () => {
    setEditingId(null);
    setIsSaved(false);
    const nextNum = generateNextSppdNumber(tanggalMulai, records);
    setNoSppd(nextNum);
    setPemberiPerintah('H. A. Nursyam Halid');
    setPemberiPerintahJabatan('Direktur Utama');
    setNamaPekerja('Nur Wahyudi');
    setJabatan('Supervisor');
    setDivisi('Accounting & Finance');
    setKotaAsal('Jakarta (HO)');
    setKotaTujuan('Kendari / Site Kolaka');
    setTransportasi('Pesawat + Mobil Operational');
    setTujuanPerjalanan('Dinas Pengawasan & Operasional Lapangan');
    setKeteranganSppd('Kwitansi dan bukti pembayaran fisik terlampir.');
    setSppdDisetujuiName('Harijon');
    setSppdDisetujuiJabatan('Head of Operational');

    // Auto calculate default cost items from pedoman
    rebuildCostItemsFromPedoman('Supervisor', daysCount, nightsCount);
  };

  // Rebuild items from pedoman
  const rebuildCostItemsFromPedoman = (targetJabatan: JabatanDinas, days: number, nights: number) => {
    const p = getPedomanByJabatan(targetJabatan, pedomanMatrix);
    const items: SPPDCostItem[] = [
      {
        id: 'c_' + Math.random().toString(36).substr(2, 6),
        kategori: 'Uang Makan Per Hari',
        rincian: `${days} Hari @ Rp ${p.uangMakanPerHari.toLocaleString('id-ID')}`,
        hargaAcuan: p.uangMakanPerHari * days,
        jumlah: p.uangMakanPerHari * days
      },
      {
        id: 'c_' + Math.random().toString(36).substr(2, 6),
        kategori: 'Uang Saku Per Hari',
        rincian: `${days} Hari @ Rp ${p.uangSakuPerHari.toLocaleString('id-ID')}`,
        hargaAcuan: p.uangSakuPerHari * days,
        jumlah: p.uangSakuPerHari * days
      },
      {
        id: 'c_' + Math.random().toString(36).substr(2, 6),
        kategori: 'Transportasi Lokal Jakarta / Bandara',
        rincian: '2x Jalan (PP)',
        hargaAcuan: p.transportJkt + p.transportBandara,
        jumlah: p.transportJkt + p.transportBandara
      },
      {
        id: 'c_' + Math.random().toString(36).substr(2, 6),
        kategori: 'Tiket Pesawat PP',
        rincian: 'Sesuai Pedoman Kelas Penerbangan',
        hargaAcuan: p.tiketPesawatRate,
        jumlah: p.tiketPesawatRate
      },
      {
        id: 'c_' + Math.random().toString(36).substr(2, 6),
        kategori: 'Penginapan / Hotel',
        rincian: `${nights} Malam @ Rp ${p.hotelPerMalam.toLocaleString('id-ID')}`,
        hargaAcuan: p.hotelPerMalam * nights,
        jumlah: p.hotelPerMalam * nights
      }
    ];
    setCostItems(items);
  };

  useEffect(() => {
    if (initialSppdId) {
      const targetRec = records.find(r => r.id === initialSppdId || r.noSppd === initialSppdId || (r as any).submissionId === initialSppdId);
      if (targetRec) {
        handleEditRecord(targetRec);
        return;
      }
    }
    if (!editingId && (!noSppd || noSppd.length === 0)) {
      handleNewForm();
    }
  }, [initialSppdId]);

  useEffect(() => {
    localStorage.setItem('sppd_records_v1', JSON.stringify(records));
  }, [records]);

  const handleJabatanChange = (newJabatan: JabatanDinas) => {
    setJabatan(newJabatan);
    setIsSaved(false);
  };

  const handleCostItemChange = (index: number, field: keyof SPPDCostItem, value: any) => {
    const updated = [...costItems];
    updated[index] = { ...updated[index], [field]: value };
    setCostItems(updated);
    setIsSaved(false);
  };

  const handleAddCostItem = () => {
    setCostItems([
      ...costItems,
      {
        id: 'c_' + Math.random().toString(36).substr(2, 6),
        kategori: 'Biaya Tambahan Lainnya',
        rincian: '1 Paket',
        hargaAcuan: 0,
        jumlah: 0
      }
    ]);
    setIsSaved(false);
  };

  const handleRemoveCostItem = (index: number) => {
    setCostItems(prev => prev.filter((_, i) => i !== index));
    setIsSaved(false);
  };

  const totalCost = costItems.reduce((acc, curr) => acc + (curr.jumlah || 0), 0);

  const handleSaveSppd = (): SPPDRecord => {
    const newRecord: SPPDRecord = {
      id: editingId || 'sppd_' + Date.now(),
      noSppd: noSppd || generateNextSppdNumber(tanggalMulai, records),
      hariTanggal: new Date(tanggalMulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      pemberiPerintah,
      pemberiPerintahJabatan,
      namaPekerja,
      jabatan,
      divisi,
      kotaAsal,
      kotaTujuan,
      transportasi,
      lamaPerjalanan: lamaPerjalananText,
      tanggalMulai,
      tanggalSelesai,
      tujuanPerjalanan,
      keteranganSppd,
      costItems,
      pemberiPerintahName: pemberiPerintah,
      sppdDisetujuiName,
      sppdDisetujuiJabatan,
      sppdMengetahuiName: namaPekerja,
      status: 'Disetujui',
      createdAt: new Date().toISOString()
    };

    saveSppdNumberUsage(newRecord.noSppd, tanggalMulai);

    let updatedList: SPPDRecord[];
    if (editingId) {
      updatedList = records.map(r => r.id === editingId ? newRecord : r);
      setSaveSuccessMsg(`Data SPPD ${newRecord.noSppd} berhasil diperbarui & disimpan permanen!`);
    } else {
      updatedList = [newRecord, ...records];
      setEditingId(newRecord.id);
      setSaveSuccessMsg(`SPPD Baru ${newRecord.noSppd} berhasil disimpan ke Cloud & Server!`);
    }

    setRecords(updatedList);
    localStorage.setItem('sppd_records_v1', JSON.stringify(updatedList));
    saveSppdRecordsToFirestore(updatedList).catch(() => {});
    
    // Save to server backend
    fetch('/api/sppd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: newRecord, sppdRecords: updatedList })
    }).catch(() => {});
    
    fetch('/api/shared-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sppdRecords: updatedList })
    }).catch(() => {});

    setIsSaved(true);
    setTimeout(() => setSaveSuccessMsg(null), 3500);
    return newRecord;
  };

  const handleDeleteRecord = (id: string, sppdNum: string) => {
    setDeleteConfirmTarget({ id, noSppd: sppdNum });
  };

  const confirmExecuteDelete = () => {
    if (!deleteConfirmTarget) return;
    const { id, noSppd: sppdNum } = deleteConfirmTarget;
    const updated = records.filter(r => r.id !== id && r.noSppd !== sppdNum);
    setRecords(updated);
    localStorage.setItem('sppd_records_v1', JSON.stringify(updated));
    deleteSppdRecordFromFirestore(id).catch(() => {});
    
    // Delete on server
    fetch(`/api/sppd/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    fetch('/api/shared-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sppdRecords: updated })
    }).catch(() => {});

    setSaveSuccessMsg(`Berkas SPPD ${sppdNum} berhasil dihapus.`);
    if (editingId === id || noSppd === sppdNum) {
      handleNewForm();
    }
    setDeleteConfirmTarget(null);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleEditRecord = (record: SPPDRecord) => {
    try {
      setEditingId(record.id);
      setIsSaved(true);
      setNoSppd(record.noSppd || '');
      setPemberiPerintah(record.pemberiPerintah || 'H. A. Nursyam Halid');
      setPemberiPerintahJabatan(record.pemberiPerintahJabatan || 'Direktur Utama');
      setNamaPekerja(record.namaPekerja || '');
      setJabatan(record.jabatan || 'Supervisor');
      setDivisi(record.divisi || 'Operasional');
      setKotaAsal(record.kotaAsal || 'Jakarta (HO)');
      setKotaTujuan(record.kotaTujuan || '');
      setTransportasi(record.transportasi || 'Pesawat + Mobil Operational');
      setTanggalMulai(record.tanggalMulai || new Date().toISOString().split('T')[0]);
      setTanggalSelesai(record.tanggalSelesai || new Date().toISOString().split('T')[0]);
      setTujuanPerjalanan(record.tujuanPerjalanan || '');
      setKeteranganSppd(record.keteranganSppd || '');
      setCostItems((record.costItems || []).map((c, idx) => ({
        ...c,
        id: c.id || `c_${idx}_${Date.now()}`,
        kategori: c.kategori || '',
        rincian: c.rincian || '',
        hargaAcuan: Number(c.hargaAcuan) || 0,
        jumlah: Number(c.jumlah) || 0
      })));
      setSppdDisetujuiName(record.sppdDisetujuiName || 'Harijon');
      setSppdDisetujuiJabatan(record.sppdDisetujuiJabatan || 'Head of Operational');
      setActiveTab('create');
    } catch (e) {
      console.error('Error saat memuat SPPD untuk diedit:', e);
    }
  };

  const handlePostDirectlyToVoucher = (record?: SPPDRecord) => {
    const recToPost = record || handleSaveSppd();
    onPostToVoucherHO(recToPost);
    if (onClose) onClose();
  };

  const handleSavePedomanRow = () => {
    if (!editingPedomanRow) return;
    const updatedMatrix = pedomanMatrix.map(item => 
      item.jabatan === editingPedomanRow.jabatan ? editingPedomanRow : item
    );
    setPedomanMatrix(updatedMatrix);
    savePedomanMatrix(updatedMatrix);
    setEditingPedomanRow(null);
    setSaveSuccessMsg(`Tarif pedoman untuk ${editingPedomanRow.jabatan} berhasil diperbarui!`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleCopyPublicSppdLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/input-sppd`;
    navigator.clipboard.writeText(url);
    setIsLinkCopied(true);
    setTimeout(() => setIsLinkCopied(false), 2500);
  };

  // IF PREVIEW PRINT IS ACTIVE
  if (previewPrintSppd) {
    return (
      <div className="space-y-4">
        <PrintSppdDocument
          sppd={previewPrintSppd}
          onBack={() => setPreviewPrintSppd(null)}
          onEdit={() => {
            handleEditRecord(previewPrintSppd);
            setPreviewPrintSppd(null);
          }}
          onPostToVoucher={() => {
            handlePostDirectlyToVoucher(previewPrintSppd);
            setPreviewPrintSppd(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left">
      {/* HEADER BAR */}
      <div className="bg-stone-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400">
            <FileText size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase font-display tracking-wider text-amber-300">
                Kelola SPPD & Perjalanan Dinas
              </h2>
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                Modul SPPD Head Office
              </span>
            </div>
            <p className="text-xs text-stone-300 mt-0.5">
              Input data SPPD, cetak dokumen resmi ber-kop surat, lalu posting langsung ke Voucher Pengajuan HO.
            </p>
          </div>
        </div>

        {/* TAB & SHARE BUTTONS */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleCopyPublicSppdLink}
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl border border-stone-700 transition flex items-center gap-1.5 cursor-pointer"
            title="Salin tautan formulir SPPD online untuk pegawai"
          >
            {isLinkCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{isLinkCopied ? 'Link Disalin!' : 'Salin Link Form SPPD'}</span>
          </button>

          <div className="flex items-center gap-1.5 bg-stone-950 p-1 rounded-xl border border-stone-800 shrink-0">
            <button
              type="button"
              onClick={() => { setActiveTab('create'); if (!editingId) handleNewForm(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-amber-500 text-stone-950 shadow-xs'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <Plus size={14} />
              <span>{editingId ? 'Edit SPPD' : 'Input SPPD'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-amber-500 text-stone-950 shadow-xs'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <ListFilter size={14} />
              <span>Arsip ({records.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`p-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-amber-500 text-stone-950 shadow-xs'
                  : 'text-stone-300 hover:text-white'
              }`}
              title="Pedoman Tarif Perusahaan"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* NOTIFIKASI */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-xs font-bold text-emerald-800 animate-fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* TAB 1: EDIT / FORM SPPD */}
      {activeTab === 'create' && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-3xs space-y-4">
            {/* NO SPPD & HEADER */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-stone-150 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider font-mono">
                  NOMOR SURAT PERINTAH PERJALANAN DINAS
                </span>
                <input
                  type="text"
                  value={noSppd}
                  onChange={(e) => { setNoSppd(e.target.value); setIsSaved(false); }}
                  placeholder="SPPD-NMSA/VIII/2026/001"
                  className="w-full text-base font-black font-mono text-stone-900 border-b border-dashed border-stone-300 focus:border-amber-500 focus:outline-none bg-transparent pt-0.5"
                />
              </div>

              <div className="flex items-center gap-2">
                {isSaved ? (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl flex items-center gap-1">
                    <CheckCircle2 size={13} /> Status: Tersimpan
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl">
                    Status: Unsaved Changes
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleNewForm}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl border border-stone-200 transition cursor-pointer"
                >
                  Reset Form
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const rec = records.find(r => r.id === editingId || r.noSppd === noSppd);
                    if (rec) {
                      handleDeleteRecord(rec.id, rec.noSppd);
                    } else if (records.length > 0 && noSppd) {
                      setDeleteConfirmTarget({ id: editingId || 'temp', noSppd });
                    } else {
                      handleNewForm();
                      setSaveSuccessMsg('Draf SPPD telah dibersihkan.');
                      setTimeout(() => setSaveSuccessMsg(null), 3000);
                    }
                  }}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition cursor-pointer flex items-center gap-1"
                  title="Hapus Berkas SPPD"
                >
                  <Trash2 size={13} />
                  <span>Hapus SPPD</span>
                </button>
              </div>
            </div>

            {/* FORM FIELDS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pemberi Perintah */}
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <User size={13} className="text-amber-600" />
                  <span>1. Pejabat Pemberi Perintah</span>
                </label>
                <input
                  type="text"
                  value={pemberiPerintah}
                  onChange={(e) => { setPemberiPerintah(e.target.value); setIsSaved(false); }}
                  placeholder="H. A. Nursyam Halid"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50 font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Jabatan Pemberi Perintah */}
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-stone-800">
                  Jabatan Pemberi Perintah
                </label>
                <input
                  type="text"
                  value={pemberiPerintahJabatan}
                  onChange={(e) => { setPemberiPerintahJabatan(e.target.value); setIsSaved(false); }}
                  placeholder="Direktur Utama"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs bg-stone-50 text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Nama Pekerja */}
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <User size={13} className="text-amber-600" />
                  <span>2. Nama Pekerja / Pegawai Dinas</span>
                </label>
                <input
                  type="text"
                  value={namaPekerja}
                  onChange={(e) => { setNamaPekerja(e.target.value); setIsSaved(false); }}
                  placeholder="Nama Lengkap Pegawai"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Jabatan Pekerja (untuk pedoman biaya) */}
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <Briefcase size={13} className="text-amber-600" />
                  <span>Jabatan (Pedoman Tarif Biaya)</span>
                </label>
                <select
                  value={jabatan}
                  onChange={(e) => handleJabatanChange(e.target.value as JabatanDinas)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:border-amber-500 bg-amber-50/50"
                >
                  <option value="Direktur">Direktur</option>
                  <option value="Wakil Direktur">Wakil Direktur</option>
                  <option value="General Manager / Pim.Pro">General Manager / Pim.Pro</option>
                  <option value="Manager">Manager</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Staf">Staf</option>
                </select>
              </div>

              {/* Kota Asal & Tujuan */}
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <MapPin size={13} className="text-rose-500" />
                  <span>3. Kota Asal</span>
                </label>
                <input
                  type="text"
                  value={kotaAsal}
                  onChange={(e) => { setKotaAsal(e.target.value); setIsSaved(false); }}
                  placeholder="Jakarta (HO)"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <MapPin size={13} className="text-rose-500" />
                  <span>Kota Tujuan Perjalanan Dinas</span>
                </label>
                <input
                  type="text"
                  value={kotaTujuan}
                  onChange={(e) => { setKotaTujuan(e.target.value); setIsSaved(false); }}
                  placeholder="Site Kolaka / Kendari"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Tanggal Mulai & Selesai */}
              <div className="space-y-1">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <Calendar size={13} className="text-amber-600" />
                  <span>4. Tanggal Berangkat</span>
                </label>
                <input
                  type="date"
                  value={tanggalMulai}
                  onChange={(e) => { setTanggalMulai(e.target.value); setIsSaved(false); }}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <Calendar size={13} className="text-amber-600" />
                  <span>Tanggal Kembali ({lamaPerjalananText})</span>
                </label>
                <input
                  type="date"
                  value={tanggalSelesai}
                  onChange={(e) => { setTanggalSelesai(e.target.value); setIsSaved(false); }}
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Transportasi */}
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-extrabold text-stone-800">
                  5. Alat Transportasi yang Digunakan
                </label>
                <input
                  type="text"
                  value={transportasi}
                  onChange={(e) => { setTransportasi(e.target.value); setIsSaved(false); }}
                  placeholder="Pesawat Terbang, Mobil Rental / Operational Site"
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Maksud / Tujuan Perjalanan */}
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-extrabold text-stone-800">
                  6. Maksud & Tujuan Perjalanan Dinas
                </label>
                <textarea
                  rows={2}
                  value={tujuanPerjalanan}
                  onChange={(e) => { setTujuanPerjalanan(e.target.value); setIsSaved(false); }}
                  placeholder="Uraikan maksud perjalanan dinas..."
                  className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* RINCIAN COST ITEMS TABLE */}
            <div className="pt-3 border-t border-stone-150 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-extrabold uppercase text-stone-900 tracking-wider font-display">
                    Rincian Anggaran & Biaya Perjalanan Dinas
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    Otomatis disesuaikan dengan pedoman plafon tarif jabatan <strong>{jabatan}</strong> ({daysCount} Hari).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => rebuildCostItemsFromPedoman(jabatan, daysCount, nightsCount)}
                    className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold hover:bg-amber-100 transition cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles size={12} />
                    <span>Hitung Ulang Acuan</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCostItem}
                    className="px-2.5 py-1 bg-stone-900 text-white rounded-lg text-[11px] font-bold hover:bg-stone-800 transition cursor-pointer flex items-center gap-1"
                  >
                    <Plus size={12} />
                    <span>Tambah Biaya</span>
                  </button>
                </div>
              </div>

              {/* LIST BIAYA */}
              <div className="space-y-2">
                {costItems.map((item, idx) => {
                  const itemBenchmark = (item.hargaAcuan !== undefined && item.hargaAcuan > 0)
                    ? item.hargaAcuan
                    : getItemBenchmark(item.kategori, item.rincian, jabatan, daysCount, nightsCount, pedomanMatrix);

                  const isExceeding = itemBenchmark > 0 && item.jumlah > itemBenchmark;
                  const exceedDiff = isExceeding ? item.jumlah - itemBenchmark : 0;

                  return (
                    <div 
                      key={item.id} 
                      className={`p-3 border rounded-xl grid grid-cols-1 md:grid-cols-12 gap-2 items-center transition ${
                        isExceeding ? 'bg-rose-50/40 border-rose-200' : 'bg-stone-50 border-stone-200'
                      }`}
                    >
                      <div className="md:col-span-3">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase">
                          {idx + 1}. Kategori Biaya
                        </span>
                        <input
                          type="text"
                          value={item.kategori}
                          onChange={(e) => handleCostItemChange(idx, 'kategori', e.target.value)}
                          className="w-full px-2 py-1 border border-stone-200 rounded-lg text-xs font-bold text-stone-900 bg-white"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase">
                          Rincian / Catatan
                        </span>
                        <input
                          type="text"
                          value={item.rincian}
                          onChange={(e) => handleCostItemChange(idx, 'rincian', e.target.value)}
                          placeholder="Contoh: 3 hari @ Rp 200.000"
                          className="w-full px-2 py-1 border border-stone-200 rounded-lg text-xs text-stone-800 bg-white"
                        />
                      </div>

                      <div className="md:col-span-2 text-right">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase">
                          Harga Acuan
                        </span>
                        <span className="text-xs font-mono text-stone-500 font-semibold block">
                          {itemBenchmark > 0 ? `Rp ${itemBenchmark.toLocaleString('id-ID')}` : '-'}
                        </span>
                        {isExceeding && (
                          <span className="text-[9px] font-bold text-rose-600 font-mono block leading-tight">
                            +Rp {exceedDiff.toLocaleString('id-ID')}
                          </span>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-stone-400 uppercase">
                            Nominal Real (Rp)
                          </span>
                          {isExceeding && (
                            <span className="text-[9px] font-bold text-rose-600 bg-rose-100 border border-rose-300 px-1 py-0.2 rounded">
                              Melebihi
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          value={item.jumlah}
                          onChange={(e) => handleCostItemChange(idx, 'jumlah', parseFloat(e.target.value) || 0)}
                          className={`w-full px-2 py-1 border rounded-lg text-xs font-bold font-mono text-right bg-white transition ${
                            isExceeding
                              ? 'border-rose-400 text-rose-950 focus:border-rose-500 bg-rose-50/50'
                              : 'border-stone-300 text-stone-900 focus:border-amber-500'
                          }`}
                        />
                      </div>

                      <div className="md:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveCostItem(idx)}
                          className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Hapus Baris Biaya"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TOTAL SPPD & OVER-BUDGET BANNER */}
              {(() => {
                const totalAcuanStandard = costItems.reduce((sum, item) => {
                  const bm = (item.hargaAcuan !== undefined && item.hargaAcuan > 0)
                    ? item.hargaAcuan
                    : getItemBenchmark(item.kategori, item.rincian, jabatan, daysCount, nightsCount, pedomanMatrix);
                  return sum + (bm > 0 ? bm : item.jumlah);
                }, 0);

                const isTotalExceeding = totalCost > totalAcuanStandard && totalAcuanStandard > 0;

                return (
                  <div className="space-y-2">
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold text-amber-900 uppercase">
                          TOTAL ANGGARAN SPPD:
                        </span>
                        <div className="text-xs text-amber-800 font-medium italic pt-0.5">
                          Terbilang: &quot;{terbilang(totalCost)}&quot;
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-lg font-black font-mono text-amber-900">
                          Rp {totalCost.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    {isTotalExceeding && (
                      <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl space-y-1 animate-in fade-in">
                        <div className="flex items-center justify-between font-extrabold text-rose-900 text-xs">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                            <span>PERINGATAN HO: Pengajuan Melebihi Plafon Acuan Tarif</span>
                          </span>
                          <span className="font-mono text-rose-700 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-md font-black">
                            Selisih: +Rp {(totalCost - totalAcuanStandard).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <p className="text-[11px] text-rose-800 leading-relaxed">
                          Total pengajuan riil karyawan: <strong>Rp {totalCost.toLocaleString('id-ID')}</strong> (Plafon Acuan {jabatan}: <strong>Rp {totalAcuanStandard.toLocaleString('id-ID')}</strong>).
                          Sistem mempertahankan nominal asli dari karyawan tanpa pemotongan otomatis agar dapat disesuaikan langsung oleh tim HO.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* ACTION FOOTER: SAVE & POST TO VOUCHER */}
            <div className="pt-3 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-stone-500 flex items-center gap-1.5">
                <Info size={14} className="text-amber-600 shrink-0" />
                <span>Simpan SPPD terlebih dahulu untuk merekam data ke riwayat &amp; modul pengajuan HO.</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleSaveSppd}
                  className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-extrabold rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save size={15} />
                  <span>Simpan</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const savedRecord = handleSaveSppd();
                    setPreviewPrintSppd(savedRecord);
                  }}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 text-xs font-black rounded-xl border border-stone-300 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                  title="Pratinjau & Cetak Dokumen SPPD dengan Kop Surat Perusahaan"
                >
                  <Printer size={15} className="text-amber-600" />
                  <span>Cetak SPPD</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const savedRecord = handleSaveSppd();
                    handlePostDirectlyToVoucher(savedRecord);
                  }}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send size={15} />
                  <span>Posting ke Voucher HO</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ARSIP & DAFTAR SPPD */}
      {activeTab === 'list' && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-3xs space-y-3">
          <div className="flex items-center justify-between border-b border-stone-150 pb-2">
            <h3 className="text-xs font-extrabold uppercase text-stone-850 tracking-wider font-display">
              Daftar Riwayat Surat Perintah Perjalanan Dinas (SPPD)
            </h3>
            <span className="text-[11px] font-mono font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
              {records.length} Berkas
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {records.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-stone-200 rounded-2xl space-y-3">
                <Briefcase size={36} className="mx-auto text-stone-300" />
                <div>
                  <p className="text-sm font-bold text-stone-700">Belum ada arsip SPPD tersimpan</p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Buat pengajuan SPPD baru atau posting hasil dari modul Pemetaan Akun SPPD.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus size={14} />
                  <span>+ Buat SPPD Baru</span>
                </button>
              </div>
            ) : (
              records.map((rec) => {
                const recTotal = (rec.costItems || []).reduce((acc, c) => acc + (c.jumlah || 0), 0);
                const recDays = calculateDays(rec.tanggalMulai, rec.tanggalSelesai);
                const recNights = recDays > 1 ? recDays - 1 : 1;
                const recBenchmarkTotal = (rec.costItems || []).reduce((sum, c) => {
                  const bm = (c.hargaAcuan !== undefined && c.hargaAcuan > 0)
                    ? c.hargaAcuan
                    : getItemBenchmark(c.kategori, c.rincian, rec.jabatan, recDays, recNights, pedomanMatrix);
                  return sum + (bm > 0 ? bm : c.jumlah);
                }, 0);
                const isRecExceeding = recTotal > recBenchmarkTotal && recBenchmarkTotal > 0;

                return (
                  <div 
                    key={rec.id}
                    className={`p-3.5 border rounded-xl transition flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                      isRecExceeding 
                        ? 'bg-rose-50/20 hover:bg-rose-50/50 border-rose-200 hover:border-rose-300' 
                        : 'bg-stone-50 hover:bg-amber-50/40 border-stone-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black font-mono text-stone-900 bg-stone-200 px-2 py-0.5 rounded-md border border-stone-300">
                          {rec.noSppd}
                        </span>
                        <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {rec.status}
                        </span>
                        {isRecExceeding && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <AlertTriangle size={10} className="text-rose-600" />
                            <span>Melebihi Acuan (+Rp {(recTotal - recBenchmarkTotal).toLocaleString('id-ID')})</span>
                          </span>
                        )}
                        {(rec.costItems?.some(c => c.attachment?.url) || (rec.attachedFiles && rec.attachedFiles.length > 0)) && (
                          <button
                            type="button"
                            onClick={() => {
                              const firstAtt = rec.costItems?.find(c => c.attachment?.url)?.attachment || (rec.attachedFiles && rec.attachedFiles[0]);
                              if (firstAtt) {
                                setPreviewAttachmentUrl(firstAtt.url);
                                setPreviewAttachmentTitle(`Bukti Bon SPPD - ${rec.noSppd} (${rec.namaPekerja})`);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                            title="Lihat Bukti Bon PDF Karyawan"
                          >
                            <Paperclip size={10} />
                            <span>Bukti Bon PDF</span>
                          </button>
                        )}
                      </div>

                      <div className="text-xs font-bold text-stone-850 flex items-center gap-1.5 pt-0.5">
                        <User size={13} className="text-stone-400" />
                        <span>{rec.namaPekerja}</span>
                        <span className="text-[11px] font-normal text-stone-500">({rec.jabatan})</span>
                      </div>

                      <div className="text-[11px] text-stone-500 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-rose-500" />
                          <strong>{rec.kotaTujuan}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={12} className="text-amber-600" />
                          <span>{rec.tanggalMulai} s.d {rec.tanggalSelesai}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-stone-200 pt-2 md:pt-0">
                      <div className="text-right">
                        <div className="text-[10px] text-stone-400 font-semibold uppercase">Total SPPD</div>
                        <div className={`text-sm font-black font-mono ${isRecExceeding ? 'text-rose-600' : 'text-amber-600'}`}>
                          Rp {recTotal.toLocaleString('id-ID')}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(rec.id, rec.noSppd)}
                          className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 border border-stone-200 hover:border-rose-200 rounded-lg transition cursor-pointer"
                          title="Hapus Berkas SPPD"
                        >
                          <Trash2 size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewPrintSppd(rec)}
                          className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                          title="Cetak Dokumen SPPD"
                        >
                          <Printer size={13} className="text-amber-600" />
                          <span>Cetak</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEditRecord(rec)}
                          className="px-2.5 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-lg transition cursor-pointer"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePostDirectlyToVoucher(rec)}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-lg shadow-xs transition flex items-center gap-1 cursor-pointer"
                        >
                          <Send size={13} />
                          <span>Buat Voucher</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PEDOMAN TARIF PERUSAHAAN */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-3xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-150 pb-2">
            <div>
              <h3 className="text-xs font-extrabold uppercase text-stone-850 tracking-wider font-display">
                Pedoman Tarif Perjalanan Dinas Perusahaan
              </h3>
              <p className="text-[11px] text-stone-500">
                Matriks batas plafon biaya perjalanan dinas berdasarkan tingkatan jabatan karyawan. Klik tombol pensil untuk mengubah tarif.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setPedomanMatrix(DEFAULT_PEDOMAN_BIAYA_MATRIX);
                savePedomanMatrix(DEFAULT_PEDOMAN_BIAYA_MATRIX);
                setSaveSuccessMsg('Pedoman biaya dikembalikan ke standar awal.');
                setTimeout(() => setSaveSuccessMsg(null), 3000);
              }}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl border border-stone-200 transition cursor-pointer"
            >
              Reset ke Default
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-extrabold border-b border-stone-200">
                  <th className="p-2.5">Jabatan</th>
                  <th className="p-2.5 text-right">Uang Makan / Hari</th>
                  <th className="p-2.5 text-right">Uang Saku / Hari</th>
                  <th className="p-2.5 text-right">Tiket Pesawat (Acuan)</th>
                  <th className="p-2.5 text-right">Penginapan / Malam</th>
                  <th className="p-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {pedomanMatrix.map((p) => (
                  <tr key={p.jabatan} className="hover:bg-stone-50">
                    <td className="p-2.5 font-bold text-stone-900">{p.jabatan}</td>
                    <td className="p-2.5 text-right font-mono">Rp {p.uangMakanPerHari.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 text-right font-mono">Rp {p.uangSakuPerHari.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 text-right font-mono">Rp {p.tiketPesawatRate.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 text-right font-mono">Rp {p.hotelPerMalam.toLocaleString('id-ID')}</td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setEditingPedomanRow({ ...p })}
                        className="p-1.5 text-stone-600 hover:text-amber-800 bg-stone-100 hover:bg-amber-100 border border-stone-200 rounded-lg transition cursor-pointer"
                        title={`Edit Tarif ${p.jabatan}`}
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MODAL / FORM EDIT TARIF JABATAN */}
          {editingPedomanRow && (
            <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
              <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-stone-200 space-y-4 text-left">
                <div className="flex items-center justify-between border-b border-stone-150 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Pencil size={18} className="text-amber-600" />
                    <h4 className="text-sm font-black text-stone-900 uppercase">
                      Edit Tarif Pedoman: {editingPedomanRow.jabatan}
                    </h4>
                  </div>
                  <button 
                    onClick={() => setEditingPedomanRow(null)}
                    className="p-1 text-stone-400 hover:text-stone-700 rounded-lg"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-extrabold text-stone-700 block mb-1">Uang Makan / Hari (Rp)</label>
                    <input 
                      type="number"
                      value={editingPedomanRow.uangMakanPerHari}
                      onChange={(e) => setEditingPedomanRow({ ...editingPedomanRow, uangMakanPerHari: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border border-stone-200 rounded-xl font-mono text-stone-900 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-extrabold text-stone-700 block mb-1">Uang Saku / Hari (Rp)</label>
                    <input 
                      type="number"
                      value={editingPedomanRow.uangSakuPerHari}
                      onChange={(e) => setEditingPedomanRow({ ...editingPedomanRow, uangSakuPerHari: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border border-stone-200 rounded-xl font-mono text-stone-900 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-extrabold text-stone-700 block mb-1">Tiket Pesawat Acuan (Rp)</label>
                    <input 
                      type="number"
                      value={editingPedomanRow.tiketPesawatRate}
                      onChange={(e) => setEditingPedomanRow({ ...editingPedomanRow, tiketPesawatRate: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border border-stone-200 rounded-xl font-mono text-stone-900 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-extrabold text-stone-700 block mb-1">Penginapan / Malam (Rp)</label>
                    <input 
                      type="number"
                      value={editingPedomanRow.hotelPerMalam}
                      onChange={(e) => setEditingPedomanRow({ ...editingPedomanRow, hotelPerMalam: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border border-stone-200 rounded-xl font-mono text-stone-900 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-extrabold text-stone-700 block mb-1">Transport Lokal JKT (Rp)</label>
                    <input 
                      type="number"
                      value={editingPedomanRow.transportJkt}
                      onChange={(e) => setEditingPedomanRow({ ...editingPedomanRow, transportJkt: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border border-stone-200 rounded-xl font-mono text-stone-800"
                    />
                  </div>

                  <div>
                    <label className="font-extrabold text-stone-700 block mb-1">Transport Bandara (Rp)</label>
                    <input 
                      type="number"
                      value={editingPedomanRow.transportBandara}
                      onChange={(e) => setEditingPedomanRow({ ...editingPedomanRow, transportBandara: parseFloat(e.target.value) || 0 })}
                      className="w-full p-2 border border-stone-200 rounded-xl font-mono text-stone-800"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-150 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPedomanRow(null)}
                    className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePedomanRow}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl flex items-center gap-1.5 shadow-xs"
                  >
                    <Check size={14} />
                    <span>Simpan Perubahan Tarif</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS SPPD (AVAILABLE GLOBALLY) */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-stone-200 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
                <Trash2 size={22} />
              </div>
              <div>
                <h4 className="text-sm font-black text-stone-900">
                  Hapus Berkas SPPD?
                </h4>
                <p className="text-xs text-stone-500 mt-0.5">
                  Nomor: <strong className="font-mono text-stone-900">{deleteConfirmTarget.noSppd}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus berkas SPPD ini? Data yang dihapus akan dihilangkan dari sistem dan penyimpanan riwayat.
            </p>

            <div className="pt-2 border-t border-stone-150 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmExecuteDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Ya, Hapus Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF PREVIEW MODAL FOR ATTACHMENTS (AVAILABLE GLOBALLY) */}
      {previewAttachmentUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/75 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-4xl h-[85vh] bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-3.5 bg-stone-900 text-white border-b border-stone-800 shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-amber-400" />
                <span className="font-bold text-xs sm:text-sm">{previewAttachmentTitle || 'Pratinjau Bukti Bon PDF'}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewAttachmentUrl}
                  download={`${(previewAttachmentTitle || 'Bukti_Bon').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`}
                  className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition"
                  title="Unduh PDF"
                >
                  <Download size={16} />
                </a>
                <button
                  onClick={() => setPreviewAttachmentUrl(null)}
                  className="p-1.5 hover:bg-stone-800 text-stone-400 hover:text-white rounded-lg transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-stone-200">
              <iframe
                src={previewAttachmentUrl}
                className="w-full h-full border-none"
                title="PDF Viewer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

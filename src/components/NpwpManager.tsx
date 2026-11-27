import React, { useState, useMemo, useEffect } from 'react';
import { NpwpRecord, Submission } from '../types';
import { isVendorOrCompanyMatch, normalizeEntityString } from '../utils';
import {
  getTokenForRegisteredDriveEmail,
  loadNpwpRecordsFromFirestore,
  saveNpwpRecordsToFirestore,
  subscribeToNpwpRecordsFromFirestore,
} from '../firebase';
import { downloadNpwpMasterPdf } from '../utils/npwpPdfGenerator';
import { pphGoogleDriveService } from '../utils/pphDriveService';
import { 
  Building2, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  FileText, 
  ExternalLink, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  X, 
  Receipt, 
  CreditCard, 
  Tag, 
  Filter,
  Eye,
  ShieldCheck,
  Building,
  Cloud,
  RefreshCw,
  Zap,
  Check,
  Loader2,
  FolderOpen
} from 'lucide-react';

export interface NpwpSaveResult {
  firestoreSynced?: boolean;
  error?: string;
}

interface NpwpManagerProps {
  npwpRecords: NpwpRecord[];
  onSaveNpwpRecords: (records: NpwpRecord[]) => Promise<NpwpSaveResult | void> | void;
  onSyncFromCloud?: (records: NpwpRecord[]) => void;
  submissions: Submission[];
  activeCompanyName?: string;
  onSelectSubmissionForPrint?: (sub: Submission) => void;
  onBack?: () => void;
}

export const NpwpManager: React.FC<NpwpManagerProps> = ({
  npwpRecords,
  onSaveNpwpRecords,
  onSyncFromCloud,
  submissions,
  activeCompanyName,
  onSelectSubmissionForPrint,
  onBack
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTaxFilter, setSelectedTaxFilter] = useState<'ALL' | 'PKP' | 'Non-PKP'>('ALL');
  
  // Cloud Firebase Sync & Drive PDF Backup states
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [isSavingDrivePdf, setIsSavingDrivePdf] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [syncStatusType, setSyncStatusType] = useState<'success' | 'info' | 'error'>('success');
  const [drivePdfResult, setDrivePdfResult] = useState<{
    url?: string;
    folderUrl?: string;
    fileName?: string;
    folderPath?: string;
    savedAt?: string;
  } | null>(null);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<NpwpRecord | null>(null);
  const [confirmAutoRegisterOpen, setConfirmAutoRegisterOpen] = useState(false);

  const showBannerMessage = (msg: string, type: 'success' | 'info' | 'error' = 'success', durationMs = 6000) => {
    setSyncStatusMessage(msg);
    setSyncStatusType(type);
    if (durationMs > 0) {
      setTimeout(() => {
        setSyncStatusMessage((curr) => (curr === msg ? null : curr));
      }, durationMs);
    }
  };

  // Auto-read Firebase database directly whenever this menu is opened + subscribe real-time
  useEffect(() => {
    let isMounted = true;
    setIsSyncingFirebase(true);

    loadNpwpRecordsFromFirestore()
      .then((cloudRecords) => {
        if (!isMounted) return;
        if (cloudRecords && cloudRecords.length > 0) {
          if (onSyncFromCloud) {
            onSyncFromCloud(cloudRecords);
          } else {
            const map = new Map<string, NpwpRecord>();
            npwpRecords.forEach((r) => { if (r?.id) map.set(r.id, r); });
            cloudRecords.forEach((r) => { if (r?.id) map.set(r.id, r); });
            onSaveNpwpRecords(Array.from(map.values()));
          }
          showBannerMessage(
            `✓ Membaca ${cloudRecords.length} data NPWP langsung dari Cloud Firebase Firestore.`,
            'success',
            4500
          );
        } else {
          showBannerMessage('Database NPWP Firebase siap. Tambahkan data NPWP baru untuk menyimpannya ke Firestore.', 'info', 4000);
        }
      })
      .catch((err) => {
        console.warn('Auto-read NPWP from Firestore notice:', err);
        if (isMounted) {
          showBannerMessage('Memuat data NPWP lokal (koneksi Firebase sedang terbatas).', 'info', 4000);
        }
      })
      .finally(() => {
        if (isMounted) setIsSyncingFirebase(false);
      });

    const unsub = subscribeToNpwpRecordsFromFirestore((liveRecords) => {
      if (!isMounted || !Array.isArray(liveRecords)) return;
      if (onSyncFromCloud && liveRecords.length > 0) {
        onSyncFromCloud(liveRecords);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);
  
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<NpwpRecord | null>(null);
  
  // Form input states
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formNpwpNumber, setFormNpwpNumber] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formKppName, setFormKppName] = useState('');
  const [formTaxStatus, setFormTaxStatus] = useState<'PKP' | 'Non-PKP'>('PKP');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Selected company to view invoices modal
  const [selectedCompanyForInvoices, setSelectedCompanyForInvoices] = useState<NpwpRecord | null>(null);

  // Auto NPWP Formatter (e.g., 01.234.567.8-901.000)
  const formatNpwp = (val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length <= 15) {
      // 00.000.000.0-000.000
      let formatted = cleaned;
      if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
      if (cleaned.length > 5) formatted = formatted.slice(0, 6) + '.' + cleaned.slice(5);
      if (cleaned.length > 8) formatted = formatted.slice(0, 10) + '.' + cleaned.slice(8);
      if (cleaned.length > 9) formatted = formatted.slice(0, 12) + '-' + cleaned.slice(9);
      if (cleaned.length > 12) formatted = formatted.slice(0, 16) + '.' + cleaned.slice(12);
      return formatted;
    }
    return val;
  };

  const handleOpenAddModal = () => {
    setFormValidationError(null);
    setEditingRecord(null);
    setFormCompanyName('');
    setFormNpwpNumber('');
    setFormAddress('');
    setFormKppName('');
    setFormTaxStatus('PKP');
    setFormContactPerson('');
    setFormNotes('');
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (rec: NpwpRecord) => {
    setFormValidationError(null);
    setEditingRecord(rec);
    setFormCompanyName(rec.companyName);
    setFormNpwpNumber(rec.npwpNumber);
    setFormAddress(rec.address || '');
    setFormKppName(rec.kppName || '');
    setFormTaxStatus(rec.taxStatus || 'PKP');
    setFormContactPerson(rec.contactPerson || '');
    setFormNotes(rec.notes || '');
    setIsFormModalOpen(true);
  };

  // Silent Drive PDF sync helper when user already has an active Google Drive token
  const tryAutoSyncPdfToDriveInBackground = async (recordsToSync: NpwpRecord[]) => {
    try {
      const hasToken = Boolean(getTokenForRegisteredDriveEmail());
      if (!hasToken || recordsToSync.length === 0) return;
      const res = await pphGoogleDriveService.saveNpwpListPdfToDrive({
        npwpRecords: recordsToSync,
        submissions,
        companyName: activeCompanyName,
        interactiveIfRequired: false,
      });
      if (res.success) {
        setDrivePdfResult({
          url: res.url,
          folderUrl: res.folderUrl,
          fileName: res.fileName,
          folderPath: res.folderPath,
          savedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch (_) {}
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError(null);
    if (!formCompanyName.trim()) {
      setFormValidationError('Nama Perusahaan / Wajib Pajak wajib diisi!');
      return;
    }
    if (!formNpwpNumber.trim()) {
      setFormValidationError('Nomor NPWP wajib diisi!');
      return;
    }

    setIsSavingForm(true);
    try {
      const nowIso = new Date().toISOString();
      let updatedList: NpwpRecord[];
      let actionLabel = '';

      if (editingRecord) {
        const updatedItem: NpwpRecord = {
          ...editingRecord,
          companyName: formCompanyName.trim(),
          npwpNumber: formNpwpNumber.trim(),
          address: formAddress.trim(),
          kppName: formKppName.trim(),
          taxStatus: formTaxStatus,
          contactPerson: formContactPerson.trim(),
          notes: formNotes.trim(),
          updatedAt: nowIso
        };
        updatedList = npwpRecords.map(r => r.id === editingRecord.id ? updatedItem : r);
        actionLabel = `Perubahan NPWP "${updatedItem.companyName}"`;
      } else {
        const newRec: NpwpRecord = {
          id: 'npwp_' + Date.now(),
          companyName: formCompanyName.trim(),
          npwpNumber: formNpwpNumber.trim(),
          address: formAddress.trim(),
          kppName: formKppName.trim(),
          taxStatus: formTaxStatus,
          contactPerson: formContactPerson.trim(),
          notes: formNotes.trim(),
          createdAt: nowIso,
          updatedAt: nowIso
        };
        updatedList = [newRec, ...npwpRecords];
        actionLabel = `NPWP baru "${newRec.companyName}"`;
      }

      const saveRes = await onSaveNpwpRecords(updatedList);
      setIsFormModalOpen(false);

      if (saveRes && saveRes.firestoreSynced === false) {
        showBannerMessage(
          `✓ ${actionLabel} disimpan lokal (${saveRes.error || 'menunggu sinkronisasi Firebase'}).`,
          'info',
          6000
        );
      } else {
        showBannerMessage(
          `✓ ${actionLabel} berhasil ditambahkan & disimpan langsung ke Firebase Firestore!`,
          'success',
          6000
        );
      }

      // Silently refresh the consolidated 1-file PDF on Google Drive if Drive session is active
      void tryAutoSyncPdfToDriveInBackground(updatedList);
    } catch (err: any) {
      setFormValidationError(err?.message || 'Gagal menyimpan data NPWP.');
    } finally {
      setIsSavingForm(false);
    }
  };

  const handleConfirmDeleteRecord = async () => {
    if (!pendingDeleteTarget) return;
    const target = pendingDeleteTarget;
    setPendingDeleteTarget(null);
    const remaining = npwpRecords.filter(r => r.id !== target.id);
    const saveRes = await onSaveNpwpRecords(remaining);
    if (saveRes && saveRes.firestoreSynced === false) {
      showBannerMessage(`Data NPWP "${target.companyName}" dihapus lokal.`, 'info', 4000);
    } else {
      showBannerMessage(`✓ Data NPWP "${target.companyName}" dihapus dari Firebase Firestore.`, 'success', 4500);
    }
    void tryAutoSyncPdfToDriveInBackground(remaining);
  };

  // Auto-extract vendors from submissions that are missing in npwpRecords
  const unrecordedVendors = useMemo(() => {
    const vendorMap = new Map<string, { name: string; count: number; totalAmount: number }>();

    submissions.forEach(sub => {
      const vendorName = (sub.dibayarkanKepada || '').trim();
      if (!vendorName || vendorName.length < 2) return;

      // Check if this vendor name matches ANY registered NPWP record using smart fuzzy / token matching
      const hasRegisteredNpwp = npwpRecords.some(r => isVendorOrCompanyMatch(r.companyName, vendorName));

      if (!hasRegisteredNpwp) {
        const total = sub.items ? sub.items.reduce((acc, it) => acc + (it.total || 0), 0) : 0;
        const normKey = normalizeEntityString(vendorName);
        
        // Check if already in vendorMap under similar name
        let foundExistingKey: string | null = null;
        for (const [key, val] of vendorMap.entries()) {
          if (isVendorOrCompanyMatch(val.name, vendorName) || key === normKey) {
            foundExistingKey = key;
            break;
          }
        }

        if (foundExistingKey) {
          const existing = vendorMap.get(foundExistingKey)!;
          existing.count += 1;
          existing.totalAmount += total;
          // Prefer longer/more descriptive name
          if (vendorName.length > existing.name.length) {
            existing.name = vendorName;
          }
        } else {
          vendorMap.set(normKey || vendorName.toLowerCase(), { name: vendorName, count: 1, totalAmount: total });
        }
      }
    });

    return Array.from(vendorMap.values()).sort((a, b) => b.count - a.count);
  }, [npwpRecords, submissions]);

  const handleQuickAddVendor = (vendorName: string) => {
    setEditingRecord(null);
    setFormCompanyName(vendorName);
    setFormNpwpNumber('');
    setFormAddress('');
    setFormKppName('');
    setFormTaxStatus('PKP');
    setFormContactPerson('');
    setFormNotes('Auto-imported dari histori Voucher / Invoice');
    setIsFormModalOpen(true);
  };

  // Manual trigger to pull directly from Firebase Firestore
  const handleManualFirebaseSync = async () => {
    setIsSyncingFirebase(true);
    showBannerMessage('Sedang membaca database langsung dari Cloud Firebase Firestore...', 'info', 0);
    try {
      const cloudData = await loadNpwpRecordsFromFirestore();
      if (cloudData && cloudData.length > 0) {
        if (onSyncFromCloud) {
          onSyncFromCloud(cloudData);
        } else {
          const map = new Map<string, NpwpRecord>();
          npwpRecords.forEach((r) => { if (r?.id) map.set(r.id, r); });
          cloudData.forEach((r) => { if (r?.id) map.set(r.id, r); });
          onSaveNpwpRecords(Array.from(map.values()));
        }
        showBannerMessage(`✓ Berhasil membaca & menyinkronkan ${cloudData.length} data NPWP dengan Cloud Firebase!`, 'success', 5000);
      } else {
        showBannerMessage('ℹ Database Firebase saat ini belum memiliki rekaman NPWP.', 'info', 5000);
      }
    } catch (err: any) {
      showBannerMessage('⚠️ Gagal membaca Firebase: ' + (err?.message || 'Koneksi error'), 'error', 6000);
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  // Save consolidated 1 PDF file containing ALL NPWP records into Google Drive (PPH23-CORETAX-NMSA)
  const handleSaveListPdfToGoogleDrive = async () => {
    if (npwpRecords.length === 0) {
      showBannerMessage('Belum ada data NPWP perusahaan untuk disimpan ke Google Drive.', 'error', 5000);
      return;
    }

    setIsSavingDrivePdf(true);
    showBannerMessage(`Membuat 1 file PDF berisi ${npwpRecords.length} daftar NPWP & mengunggah ke Google Drive (PPH23-CORETAX-NMSA)...`, 'info', 0);

    try {
      const res = await pphGoogleDriveService.saveNpwpListPdfToDrive({
        npwpRecords,
        submissions,
        companyName: activeCompanyName,
        interactiveIfRequired: true,
      });

      if (res.success) {
        setDrivePdfResult({
          url: res.url,
          folderUrl: res.folderUrl,
          fileName: res.fileName,
          folderPath: res.folderPath,
          savedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        });
        showBannerMessage(
          `✓ Sukses! Seluruh ${npwpRecords.length} NPWP tersimpan dalam 1 file PDF (${res.fileName}) di folder Google Drive ${res.folderPath}.`,
          'success',
          8000
        );
      } else {
        showBannerMessage(`⚠️ ${res.error || 'Gagal menyimpan PDF Master NPWP ke Google Drive.'}`, 'error', 7000);
      }
    } catch (err: any) {
      showBannerMessage(`⚠️ Gagal menyimpan PDF ke Google Drive: ${err?.message || 'Error'}`, 'error', 7000);
    } finally {
      setIsSavingDrivePdf(false);
    }
  };

  const handleDownloadPdfLocal = () => {
    if (npwpRecords.length === 0) {
      showBannerMessage('Tidak ada data NPWP untuk diunduh sebagai PDF!', 'error', 4000);
      return;
    }
    downloadNpwpMasterPdf({
      npwpRecords,
      submissions,
      companyName: activeCompanyName,
    });
    showBannerMessage(`✓ File Daftar Master NPWP (${npwpRecords.length} perusahaan) berhasil diunduh sebagai PDF.`, 'success', 4500);
  };

  // 1-Click: Automatically register all detected vendors from vouchers and store them permanently in Firebase Firestore
  const handleAutoRegisterAllVendors = async () => {
    if (unrecordedVendors.length === 0) return;
    setConfirmAutoRegisterOpen(false);

    setIsSyncingFirebase(true);
    showBannerMessage(`Sedang mendaftarkan ${unrecordedVendors.length} vendor & menyinkronkan ke Firebase Firestore...`, 'info', 0);

    try {
      const existingMap = new Map<string, NpwpRecord>();
      npwpRecords.forEach(r => existingMap.set(r.companyName.toLowerCase().trim(), r));

      const newGenerated: NpwpRecord[] = [];
      const nowIso = new Date().toISOString();

      unrecordedVendors.forEach((v, idx) => {
        const normName = v.name.trim();
        if (existingMap.has(normName.toLowerCase())) return;

        // Check if vendor has any invoice items with PPN or Faktur
        const linked = getLinkedSubmissionsForCompany(normName);
        const hasPpn = linked.some(s => 
          (s.items && s.items.some(i => (i.item || '').toLowerCase().includes('ppn') || (i.item || '').toLowerCase().includes('faktur') || (i.item || '').toLowerCase().includes('pph -2%') || (i.item || '').toLowerCase().includes('pph 23')))
        );

        const newRec: NpwpRecord = {
          id: `npwp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          companyName: normName,
          npwpNumber: '',
          address: '',
          kppName: '',
          taxStatus: hasPpn ? 'PKP' : 'Non-PKP',
          contactPerson: '',
          notes: `Auto-terdaftar dari histori ${v.count} voucher (Rp ${v.totalAmount.toLocaleString('id-ID')})`,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        newGenerated.push(newRec);
        existingMap.set(normName.toLowerCase(), newRec);
      });

      const mergedList = [...newGenerated, ...npwpRecords];
      await onSaveNpwpRecords(mergedList);
      const fsRes = await saveNpwpRecordsToFirestore(mergedList);

      if (fsRes.savedToFirestore) {
        showBannerMessage(`✓ Sukses! ${newGenerated.length} vendor berhasil didaftarkan dan tersimpan permanen di Firebase Firestore!`, 'success', 6000);
      } else {
        showBannerMessage(`✓ ${newGenerated.length} vendor ditambahkan (${fsRes.error || 'sinkronisasi cloud tertunda'}).`, 'info', 6000);
      }
      void tryAutoSyncPdfToDriveInBackground(mergedList);
    } catch (err: any) {
      showBannerMessage('⚠️ Gagal menyimpan ke Firebase: ' + (err?.message || 'Error'), 'error', 6000);
    } finally {
      setIsSyncingFirebase(false);
    }
  };


  // Get linked invoices for a given company name using smart fuzzy & token matching
  const getLinkedSubmissionsForCompany = (companyName: string) => {
    return submissions.filter(sub => {
      // 1. Match Dibayarkan Kepada / Vendor Name
      if (isVendorOrCompanyMatch(companyName, sub.dibayarkanKepada)) {
        return true;
      }

      // 2. Match in items
      if (sub.items && sub.items.some(it => 
        isVendorOrCompanyMatch(companyName, it.item) || 
        isVendorOrCompanyMatch(companyName, it.keterangan)
      )) {
        return true;
      }

      // 3. Match in notes
      if (sub.notes && isVendorOrCompanyMatch(companyName, sub.notes)) {
        return true;
      }

      return false;
    });
  };

  // Filtered NPWP records
  const filteredNpwpRecords = useMemo(() => {
    return npwpRecords.filter(rec => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) {
        return selectedTaxFilter === 'ALL' || rec.taxStatus === selectedTaxFilter;
      }

      const matchSearch = isVendorOrCompanyMatch(rec.companyName, query) ||
                          rec.companyName.toLowerCase().includes(query) ||
                          rec.npwpNumber.replace(/\D/g, '').includes(query.replace(/\D/g, '')) ||
                          rec.npwpNumber.toLowerCase().includes(query) ||
                          (rec.address || '').toLowerCase().includes(query) ||
                          (rec.kppName || '').toLowerCase().includes(query);
      
      const matchTax = selectedTaxFilter === 'ALL' || rec.taxStatus === selectedTaxFilter;

      return matchSearch && matchTax;
    });
  }, [npwpRecords, searchQuery, selectedTaxFilter]);

  // Overall statistics
  const totalPkp = npwpRecords.filter(r => r.taxStatus === 'PKP').length;
  const totalInvoicesLinked = useMemo(() => {
    let count = 0;
    npwpRecords.forEach(r => {
      count += getLinkedSubmissionsForCompany(r.companyName).length;
    });
    return count;
  }, [npwpRecords, submissions]);

  // Export to CSV
  const handleExportCsv = () => {
    if (npwpRecords.length === 0) {
      showBannerMessage('Tidak ada data NPWP untuk diekspor!', 'error', 4000);
      return;
    }

    const headers = ['Nama Perusahaan / Wajib Pajak', 'Nomor NPWP', 'Status Pajak', 'Alamat Terdaftar', 'KPP', 'Kontak Finance', 'Jumlah Invoice Terkait', 'Total Nominal Invoice'];
    const rows = npwpRecords.map(r => {
      const linked = getLinkedSubmissionsForCompany(r.companyName);
      const totalVal = linked.reduce((acc, sub) => acc + (sub.items ? sub.items.reduce((sum, i) => sum + (i.total || 0), 0) : 0), 0);
      return [
        `"${r.companyName.replace(/"/g, '""')}"`,
        `"${r.npwpNumber}"`,
        `"${r.taxStatus || 'PKP'}"`,
        `"${(r.address || '-').replace(/"/g, '""')}"`,
        `"${(r.kppName || '-').replace(/"/g, '""')}"`,
        `"${(r.contactPerson || '-').replace(/"/g, '""')}"`,
        linked.length,
        totalVal
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Master_List_NPWP_Perusahaan_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-stone-900 to-indigo-950 rounded-2xl p-6 text-white shadow-lg border border-stone-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold tracking-wider uppercase">
              Modul Perpajakan & Vendor HO
            </span>
            <span className="text-stone-400 text-xs font-mono">Firebase Real-Time · Arsip PDF Drive</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-sans tracking-tight flex items-center gap-2">
            <Receipt className="text-emerald-400 shrink-0" size={26} />
            Master List Data NPWP & Invoice Vendor
          </h2>
          <p className="text-xs text-stone-300 max-w-2xl">
            Data NPWP tersinkronisasi langsung dengan Cloud Firebase Firestore dan dapat disimpan sebagai 1 file PDF lengkap di folder Google Drive (<span className="font-mono text-amber-300">PPH23-CORETAX-NMSA</span>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
          <button
            onClick={handleManualFirebaseSync}
            disabled={isSyncingFirebase}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-indigo-900/80 hover:bg-indigo-800 text-indigo-100 border border-indigo-700/60 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs whitespace-nowrap disabled:opacity-50"
            title="Baca database penyimpanan langsung dari Cloud Firebase Firestore"
          >
            <Cloud size={14} className={isSyncingFirebase ? 'animate-pulse text-cyan-300' : 'text-indigo-300'} />
            <RefreshCw size={12} className={isSyncingFirebase ? 'animate-spin' : ''} />
            <span>{isSyncingFirebase ? 'Menyinkronkan...' : 'Sinkronkan Firebase'}</span>
          </button>
          <button
            onClick={handleSaveListPdfToGoogleDrive}
            disabled={isSavingDrivePdf || npwpRecords.length === 0}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 border border-amber-400 text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md whitespace-nowrap disabled:opacity-50"
            title="Gabungkan seluruh daftar NPWP menjadi 1 file PDF dan simpan ke folder Google Drive PPH23-CORETAX-NMSA"
          >
            {isSavingDrivePdf ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />}
            <span>{isSavingDrivePdf ? 'Mengunggah PDF...' : 'Simpan List PDF ke Drive'}</span>
          </button>
          <button
            onClick={handleDownloadPdfLocal}
            disabled={npwpRecords.length === 0}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs whitespace-nowrap disabled:opacity-50"
            title="Unduh seluruh daftar NPWP dalam 1 file PDF ke perangkat"
          >
            <FileText size={14} className="text-rose-400" />
            <span>Unduh PDF</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs whitespace-nowrap"
          >
            <Download size={14} />
            <span>Ekspor CSV/Excel</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md whitespace-nowrap"
          >
            <Plus size={16} />
            <span>Tambah NPWP Baru</span>
          </button>
        </div>
      </div>

      {/* Cloud Sync & Drive PDF Status Banner */}
      {(syncStatusMessage || drivePdfResult) && (
        <div className="space-y-2">
          {syncStatusMessage && (
            <div className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between shadow-md border ${
              syncStatusType === 'error'
                ? 'bg-rose-950 text-rose-200 border-rose-500/40'
                : syncStatusType === 'info'
                ? 'bg-slate-900 text-amber-200 border-amber-500/40'
                : 'bg-stone-900 text-emerald-300 border-emerald-500/40'
            }`}>
              <div className="flex items-center gap-2">
                {syncStatusType === 'error' ? (
                  <AlertCircle size={16} className="text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                )}
                <span>{syncStatusMessage}</span>
              </div>
              <button onClick={() => setSyncStatusMessage(null)} className="text-stone-400 hover:text-white p-1 cursor-pointer">
                <X size={14} />
              </button>
            </div>
          )}

          {drivePdfResult && (
            <div className="bg-emerald-50/90 border border-emerald-300 text-emerald-950 px-4 py-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 shadow-3xs">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-emerald-700 shrink-0" />
                <span>
                  <strong>1 File PDF Master NPWP Tersedia di Google Drive:</strong>{' '}
                  <span className="font-mono font-bold">{drivePdfResult.fileName}</span>{' '}
                  <span className="text-emerald-700 font-mono">
                    ({drivePdfResult.folderPath} · Diperbarui {drivePdfResult.savedAt})
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {drivePdfResult.url && (
                  <a
                    href={drivePdfResult.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] transition"
                  >
                    <span>Buka PDF di Drive</span>
                    <ExternalLink size={12} />
                  </a>
                )}
                {drivePdfResult.folderUrl && (
                  <a
                    href={drivePdfResult.folderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[11px] transition"
                  >
                    <FolderOpen size={12} />
                    <span>Buka Folder</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Quick Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs space-y-1">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider">Total NPWP Terdaftar</span>
            <Building2 size={18} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-stone-900 font-mono">
            {npwpRecords.length} <span className="text-xs font-sans text-stone-500 font-normal">Perusahaan</span>
          </div>
          <p className="text-[10px] text-stone-500">
            {totalPkp} Berstatus PKP, {npwpRecords.length - totalPkp} Non-PKP
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs space-y-1">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider">Pengusaha Kena Pajak (PKP)</span>
            <ShieldCheck size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {totalPkp} <span className="text-xs font-sans text-stone-500 font-normal">Vendor PKP</span>
          </div>
          <p className="text-[10px] text-stone-500">
            Memiliki kewajiban Faktur Pajak PPN
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs space-y-1">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider">Invoice Terkait</span>
            <FileText size={18} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono">
            {totalInvoicesLinked} <span className="text-xs font-sans text-stone-500 font-normal">Voucher/Invoice</span>
          </div>
          <p className="text-[10px] text-stone-500">
            Terhubung dari histori transaksi Voucher HO
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs space-y-1">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider">Vendor Belum Dicatat</span>
            <Sparkles size={18} className="text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-700 font-mono">
            {unrecordedVendors.length} <span className="text-xs font-sans text-stone-500 font-normal">Terdeteksi</span>
          </div>
          <p className="text-[10px] text-stone-500">
            Nama vendor pada voucher yang belum ber-NPWP
          </p>
        </div>
      </div>

      {/* Unrecorded Vendors Suggestions (If any) */}
      {unrecordedVendors.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="text-amber-600 shrink-0" size={16} />
              <span className="text-xs font-bold text-amber-900">
                Sistem Menemukan {unrecordedVendors.length} Vendor dari Histori Voucher yang Belum Dicatat NPWP-nya:
              </span>
            </div>
            <button
              onClick={() => setConfirmAutoRegisterOpen(true)}
              disabled={isSyncingFirebase}
              className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap self-start sm:self-auto"
              title="Daftarkan seluruh vendor yang terdeteksi dari voucher & simpan otomatis ke database Cloud Firebase Firestore"
            >
              <Zap size={13} className="text-amber-300" />
              <span>Daftarkan Semua ({unrecordedVendors.length}) ke Firebase</span>
            </button>
          </div>
          {confirmAutoRegisterOpen && (
            <div className="p-3 bg-white border border-amber-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-stone-800">
                Konfirmasi: Daftarkan {unrecordedVendors.length} vendor dari histori voucher &amp; simpan ke Firebase Firestore?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmAutoRegisterOpen(false)}
                  className="px-3 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAutoRegisterAllVendors}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                >
                  Ya, Simpan ke Firebase
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {unrecordedVendors.slice(0, 8).map((v) => (
              <button
                key={v.name}
                onClick={() => handleQuickAddVendor(v.name)}
                className="px-3 py-1.5 bg-white border border-amber-300 hover:border-amber-500 rounded-xl text-xs font-medium text-stone-800 hover:text-amber-900 transition cursor-pointer flex items-center gap-1.5 shadow-3xs"
              >
                <Building size={12} className="text-amber-600" />
                <span className="font-bold">{v.name}</span>
                <span className="text-[10px] font-mono text-stone-500">({v.count} invoice)</span>
                <Plus size={12} className="text-amber-600 ml-0.5" />
              </button>
            ))}
            {unrecordedVendors.length > 8 && (
              <span className="text-[11px] text-amber-800 self-center font-mono font-medium">
                +{unrecordedVendors.length - 8} vendor lainnya
              </span>
            )}
          </div>
        </div>
      )}


      {/* Search & Filter Controls */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-3xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
          <input
            type="text"
            placeholder="Cari berdasarkan nama perusahaan, nomor NPWP, KPP, atau alamat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-250 rounded-xl text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Filter size={14} className="text-stone-400" />
          <span className="text-xs font-bold text-stone-600">Status Pajak:</span>
          <select
            value={selectedTaxFilter}
            onChange={(e) => setSelectedTaxFilter(e.target.value as any)}
            className="bg-stone-50 border border-stone-250 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">Semua Status (PKP & Non-PKP)</option>
            <option value="PKP">Hanya PKP (Pengusaha Kena Pajak)</option>
            <option value="Non-PKP">Hanya Non-PKP</option>
          </select>
        </div>
      </div>

      {/* NPWP List Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-3xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-100/90 border-b border-stone-200 text-[11px] font-mono font-bold text-stone-700 uppercase tracking-wider">
                <th className="py-3.5 px-4 min-w-[200px]">Nama Perusahaan / Wajib Pajak</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[190px]">Nomor NPWP</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[140px]">Status Pajak</th>
                <th className="py-3.5 px-4 whitespace-nowrap min-w-[160px]">KPP Terdaftar</th>
                <th className="py-3.5 px-4 min-w-[200px]">Alamat & Kontak</th>
                <th className="py-3.5 px-4 text-center whitespace-nowrap min-w-[160px]">Invoice Terkait</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap min-w-[100px]">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150 text-xs text-stone-800">
              {filteredNpwpRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-stone-400 space-y-3">
                    <Building2 size={38} className="mx-auto text-stone-300" />
                    <p className="font-bold text-stone-700 text-sm">Belum ada data NPWP yang ditemukan.</p>
                    <p className="text-[11px] font-mono text-stone-500 max-w-md mx-auto">
                      Seluruh data NPWP yang tersimpan di Cloud Firebase akan otomatis ditampilkan di sini.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <button
                        onClick={handleManualFirebaseSync}
                        disabled={isSyncingFirebase}
                        className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl text-xs font-bold text-stone-850 flex items-center gap-1.5 cursor-pointer shadow-3xs disabled:opacity-50"
                      >
                        <RefreshCw size={13} className={isSyncingFirebase ? 'animate-spin text-indigo-600' : 'text-stone-600'} />
                        <span>Baca Ulang dari Firebase</span>
                      </button>
                      {unrecordedVendors.length > 0 && (
                        <button
                          onClick={() => setConfirmAutoRegisterOpen(true)}
                          disabled={isSyncingFirebase}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                        >
                          <Zap size={13} className="text-amber-300" />
                          <span>Pulihkan & Daftarkan {unrecordedVendors.length} Vendor ke Firebase</span>
                        </button>
                      )}
                      <button
                        onClick={handleOpenAddModal}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Plus size={14} />
                        <span>Tambah NPWP Baru</span>
                      </button>
                    </div>
                  </td>
                </tr>

              ) : (
                filteredNpwpRecords.map((rec) => {
                  const linkedSubs = getLinkedSubmissionsForCompany(rec.companyName);
                  const totalLinkedValue = linkedSubs.reduce((acc, sub) => acc + (sub.items ? sub.items.reduce((sum, i) => sum + (i.total || 0), 0) : 0), 0);

                  return (
                    <tr key={rec.id} className="hover:bg-stone-50/80 transition">
                      
                      {/* Company Name */}
                      <td className="py-3.5 px-4 font-bold text-stone-900">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-indigo-600 shrink-0" />
                          <div>
                            <span className="block">{rec.companyName}</span>
                            {rec.notes && <span className="text-[10px] text-stone-400 font-normal block truncate max-w-xs">{rec.notes}</span>}
                          </div>
                        </div>
                      </td>

                      {/* NPWP Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-stone-800 whitespace-nowrap">
                        <span className="inline-flex items-center px-3 py-1 rounded-lg bg-stone-900 border border-stone-800 text-amber-300 font-mono font-bold text-xs tracking-wide whitespace-nowrap shadow-3xs">
                          {formatNpwp(rec.npwpNumber)}
                        </span>
                      </td>

                      {/* Tax Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {rec.taxStatus === 'PKP' ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap">
                            <ShieldCheck size={12} className="shrink-0" />
                            <span>PKP (Faktur Pajak)</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200 text-[10px] font-bold inline-flex items-center whitespace-nowrap">
                            Non-PKP
                          </span>
                        )}
                      </td>

                      {/* KPP */}
                      <td className="py-3.5 px-4 text-stone-600 font-mono text-[11px] whitespace-nowrap">
                        {rec.kppName || '-'}
                      </td>

                      {/* Address & Contact */}
                      <td className="py-3.5 px-4 text-stone-600 text-[11px] max-w-xs">
                        <div className="truncate">{rec.address || '-'}</div>
                        {rec.contactPerson && (
                          <div className="text-[10px] text-indigo-600 font-mono">PIC: {rec.contactPerson}</div>
                        )}
                      </td>

                      {/* Linked Invoices Count */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedCompanyForInvoices(rec)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 mx-auto cursor-pointer border ${
                            linkedSubs.length > 0 
                              ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100' 
                              : 'bg-stone-50 text-stone-400 border-stone-200 hover:bg-stone-100'
                          }`}
                          title="Klik untuk melihat daftar voucher & invoice perusahaan ini"
                        >
                          <FileText size={13} />
                          <span>{linkedSubs.length} Invoice</span>
                          {linkedSubs.length > 0 && (
                            <span className="text-[10px] font-mono text-amber-700">
                              (Rp {totalLinkedValue.toLocaleString('id-ID')})
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedCompanyForInvoices(rec)}
                            className="p-1.5 text-stone-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Lihat Invoice Terkait"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(rec)}
                            className="p-1.5 text-stone-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title="Edit Data NPWP"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => setPendingDeleteTarget(rec)}
                            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hapus Data NPWP"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit NPWP */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-stone-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="text-emerald-400" size={20} />
                <h3 className="font-bold text-sm">
                  {editingRecord ? 'Edit Data NPWP Perusahaan' : 'Tambah Data NPWP Perusahaan / Vendor Baru'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="text-stone-400 hover:text-white transition p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 space-y-4">
              {formValidationError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{formValidationError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">Nama Perusahaan / Wajib Pajak *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PT. Kalimantan Energi Bersama"
                  value={formCompanyName}
                  onChange={(e) => setFormCompanyName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">Nomor NPWP *</label>
                  <input
                    type="text"
                    required
                    placeholder="00.000.000.0-000.000"
                    value={formNpwpNumber}
                    onChange={(e) => setFormNpwpNumber(formatNpwp(e.target.value))}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">Status Pajak</label>
                  <select
                    value={formTaxStatus}
                    onChange={(e) => setFormTaxStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="PKP">PKP (Pengusaha Kena Pajak - Menerbitkan Faktur)</option>
                    <option value="Non-PKP">Non-PKP</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">KPP Terdaftar (Kantor Pelayanan Pajak)</label>
                <input
                  type="text"
                  placeholder="Contoh: KPP Pratama Banjarmasin / KPP Pratama Jakarta Selatan"
                  value={formKppName}
                  onChange={(e) => setFormKppName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-stone-700">Alamat Terdaftar di NPWP</label>
                <textarea
                  rows={2}
                  placeholder="Alamat lengkap Wajib Pajak..."
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">PIC / Kontak Finance Vendor</label>
                  <input
                    type="text"
                    placeholder="Nama / No HP Finance Vendor"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">Catatan Tambahan</label>
                  <input
                    type="text"
                    placeholder="Catatan pph/ppn atau jenis usaha"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={isSavingForm}
                  className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingForm && <Loader2 size={14} className="animate-spin" />}
                  <span>{isSavingForm ? 'Menyimpan ke Firebase...' : editingRecord ? 'Simpan Perubahan' : 'Simpan NPWP ke Firebase'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus NPWP */}
      {pendingDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-stone-900">Hapus Data NPWP?</h3>
                <p className="text-xs text-stone-600">
                  Anda yakin ingin menghapus data NPWP untuk <strong>{pendingDeleteTarget.companyName}</strong> ({pendingDeleteTarget.npwpNumber}) dari database Firebase?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setPendingDeleteTarget(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRecord}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shadow-sm"
              >
                Ya, Hapus Data NPWP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal View Invoices for Selected Company */}
      {selectedCompanyForInvoices && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-stone-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Building2 className="text-amber-400" size={20} />
                  <h3 className="font-bold text-sm">
                    Riwayat Invoice & Voucher: {selectedCompanyForInvoices.companyName}
                  </h3>
                </div>
                <div className="text-[11px] font-mono text-stone-300">
                  NPWP: <span className="text-amber-300 font-bold">{selectedCompanyForInvoices.npwpNumber}</span> ({selectedCompanyForInvoices.taxStatus})
                </div>
              </div>
              <button
                onClick={() => setSelectedCompanyForInvoices(null)}
                className="text-stone-400 hover:text-white transition p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {(() => {
                const linkedSubs = getLinkedSubmissionsForCompany(selectedCompanyForInvoices.companyName);
                const totalAmount = linkedSubs.reduce((acc, sub) => acc + (sub.items ? sub.items.reduce((s, i) => s + (i.total || 0), 0) : 0), 0);

                if (linkedSubs.length === 0) {
                  return (
                    <div className="text-center py-12 text-stone-400 space-y-2">
                      <FileText size={36} className="mx-auto text-stone-300" />
                      <p className="font-bold text-stone-600">Belum ada transaksi Voucher / Invoice yang tercatat untuk {selectedCompanyForInvoices.companyName}.</p>
                      <p className="text-xs">Ketika Anda membuat Voucher HO dan mengisi "Dibayarkan Kepada" dengan nama perusahaan ini, transaksinya akan otomatis muncul di sini.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="bg-stone-100 p-3.5 rounded-xl border border-stone-250 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-stone-500 block font-mono">Total Transaksi Ditemukan:</span>
                        <span className="font-black text-stone-900 text-sm">{linkedSubs.length} Voucher / Invoice</span>
                      </div>
                      <div className="text-right">
                        <span className="text-stone-500 block font-mono">Total Nominal Kumulatif:</span>
                        <span className="font-black text-emerald-700 text-sm font-mono">Rp {totalAmount.toLocaleString('id-ID')}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {linkedSubs.map((sub) => {
                        const subTotal = sub.items ? sub.items.reduce((sum, i) => sum + (i.total || 0), 0) : 0;
                        return (
                          <div key={sub.id} className="p-4 bg-stone-50 rounded-xl border border-stone-200 hover:border-indigo-300 transition space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-stone-900 text-white font-mono font-bold text-[10px]">
                                  {sub.kode || 'HO'}
                                </span>
                                <span className="text-xs font-bold text-stone-900">
                                  {sub.jenisPengajuan}
                                </span>
                                <span className="text-xs font-mono text-stone-400">
                                  • {sub.tanggal}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  sub.status === 'Lunas' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {sub.status || 'Belum Lunas'}
                                </span>
                                <span className="font-mono font-black text-xs text-stone-900">
                                  Rp {subTotal.toLocaleString('id-ID')}
                                </span>
                              </div>
                            </div>

                            {/* Sub items / descriptions */}
                            <div className="text-xs text-stone-600 bg-white p-2.5 rounded-lg border border-stone-200 space-y-1">
                              {sub.invoiceNumber && (
                                <div className="text-[11px] font-mono text-indigo-700 font-bold">
                                  No. Invoice Vendor: {sub.invoiceNumber}
                                </div>
                              )}
                              {sub.items && sub.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between text-[11px]">
                                  <span>- {it.item}</span>
                                  <span className="font-mono text-stone-500">Rp {(it.total || 0).toLocaleString('id-ID')}</span>
                                </div>
                              ))}
                              {sub.notes && (
                                <div className="text-[10px] text-stone-400 italic pt-1 border-t border-stone-100">
                                  Catatan: {sub.notes}
                                </div>
                              )}
                            </div>

                            {onSelectSubmissionForPrint && (
                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={() => {
                                    setSelectedCompanyForInvoices(null);
                                    onSelectSubmissionForPrint(sub);
                                  }}
                                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Buka / Cetak Voucher</span>
                                  <ExternalLink size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedCompanyForInvoices(null)}
                className="px-5 py-2 rounded-xl bg-stone-800 text-white text-xs font-bold hover:bg-stone-700 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

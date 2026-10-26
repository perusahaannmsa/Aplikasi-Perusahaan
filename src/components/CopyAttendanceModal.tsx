import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Cloud,
  FolderOpen,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Upload,
  RefreshCw,
  Search,
  Users,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  FileText,
  Database
} from 'lucide-react';
import { Worker, AttendanceRecord, WeeklyReport } from '../types';
import { googleDriveAutoBackup, BackupSyncLog } from '../utils/googleDriveAutoBackup';
import { ensureValidDriveToken, getActiveGoogleDriveAccount, googleDriveLogin } from '../firebase';
import { loadAttendanceFromFirestore } from '../lib/firebaseAbsen';

interface CopyAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  currentAttendanceRecords: AttendanceRecord[];
  weeklyReports: WeeklyReport[];
  currentWeekStart: string; // e.g. "2026-09-07"
  currentWeekEnd: string;   // e.g. "2026-09-11"
  onCopyAttendance: (
    updatedRecords: AttendanceRecord[],
    reconstructedReport?: WeeklyReport,
    notificationMsg?: string
  ) => Promise<void>;
  onOpenGoogleDriveSettings?: () => void;
}

interface DiscoveredBackupItem {
  id: string;
  source: 'drive' | 'report' | 'local_file' | 'firebase';
  title: string;
  subTitle?: string;
  dateStr?: string;
  periodStart?: string;
  periodEnd?: string;
  driveUrl?: string;
  fileSize?: string;
  recordsCount?: number;
  records?: AttendanceRecord[];
  rawPayload?: any;
}

export const CopyAttendanceModal: React.FC<CopyAttendanceModalProps> = ({
  isOpen,
  onClose,
  workers,
  currentAttendanceRecords,
  weeklyReports,
  currentWeekStart,
  currentWeekEnd,
  onCopyAttendance,
  onOpenGoogleDriveSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'firebase' | 'drive' | 'reports' | 'upload'>('firebase');
  const [isScanningDrive, setIsScanningDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DiscoveredBackupItem[]>([]);
  const [reportFiles, setReportFiles] = useState<DiscoveredBackupItem[]>([]);
  const [firebaseFiles, setFirebaseFiles] = useState<DiscoveredBackupItem[]>([]);
  const [isScanningFirebase, setIsScanningFirebase] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  
  // Selected backup for preview & copy
  const [selectedItem, setSelectedItem] = useState<DiscoveredBackupItem | null>(null);
  const [previewRecords, setPreviewRecords] = useState<AttendanceRecord[] | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Copy options
  const [copyMode, setCopyMode] = useState<'original_dates' | 'target_period'>('original_dates');
  const [isExecutingCopy, setIsExecutingCopy] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Initialize local reports list
  useEffect(() => {
    if (!isOpen) return;

    // Compile reports from weeklyReports
    const list: DiscoveredBackupItem[] = (weeklyReports || [])
      .filter((r) => r && (r.weekStartDate || r.records?.length))
      .map((rep) => {
        const recs = rep.records || [];
        const presentCount = recs.reduce((acc, r) => {
          const daysPresent = Object.values(r.attendance || {}).filter(Boolean).length;
          return acc + daysPresent;
        }, 0);

        return {
          id: rep.id || `report-${rep.weekStartDate}`,
          source: 'report' as const,
          title: `Laporan Mingguan: Periode ${rep.weekStartDate || '-'} s.d. ${rep.weekEndDate || '-'}`,
          subTitle: `${recs.length} Karyawan • ${presentCount} Total Hari Hadir • Rp ${Number(rep.totalAmount || 0).toLocaleString('id-ID')}`,
          periodStart: rep.weekStartDate,
          periodEnd: rep.weekEndDate,
          driveUrl: rep.pdfDriveUrl,
          recordsCount: recs.length,
          records: recs,
          rawPayload: rep,
        };
      })
      .sort((a, b) => (b.periodStart || '').localeCompare(a.periodStart || ''));

    setReportFiles(list);

    // Auto scan Cloud Firestore & Google Drive if opened
    scanFirebaseFirestore();
    scanGoogleDrive();
  }, [isOpen, weeklyReports]);

  // Scan Cloud Firebase Firestore for master attendance records and reports
  const scanFirebaseFirestore = async () => {
    setIsScanningFirebase(true);
    setFirebaseError(null);
    try {
      const data = await loadAttendanceFromFirestore();
      const items: DiscoveredBackupItem[] = [];
      if (data && data.attendanceRecords && data.attendanceRecords.length > 0) {
        items.push({
          id: 'firestore-master-records',
          source: 'firebase',
          title: 'Database Absensi Utama Cloud (Firestore)',
          subTitle: `${data.attendanceRecords.length} Data Rekap Karyawan Terdaftar di Cloud Firebase`,
          recordsCount: data.attendanceRecords.length,
          records: data.attendanceRecords,
        });
      }
      if (data && data.weeklyReports && data.weeklyReports.length > 0) {
        data.weeklyReports.forEach((rep: any) => {
          items.push({
            id: rep.id || `fb-rep-${rep.weekStartDate}`,
            source: 'firebase',
            title: `Laporan Cloud: Periode ${rep.weekStartDate || '-'} s.d. ${rep.weekEndDate || '-'}`,
            subTitle: `${(rep.records || []).length} Karyawan • Rp ${Number(rep.totalAmount || 0).toLocaleString('id-ID')}`,
            periodStart: rep.weekStartDate,
            periodEnd: rep.weekEndDate,
            recordsCount: (rep.records || []).length,
            records: rep.records || [],
            rawPayload: rep,
          });
        });
      }
      setFirebaseFiles(items);
      if (items.length === 0) {
        setFirebaseError('Belum ada data cadangan absensi yang tersimpan di Cloud Firebase Firestore.');
      }
    } catch (err: any) {
      setFirebaseError(err?.message || 'Gagal terhubung ke Cloud Firebase Firestore.');
    } finally {
      setIsScanningFirebase(false);
    }
  };

  // 2. Scan Google Drive for attendance backups
  const scanGoogleDrive = async () => {
    setIsScanningDrive(true);
    setDriveError(null);

    try {
      // 1. Check recent local sync logs from Google Drive backup service
      const logs = googleDriveAutoBackup.getLogs();
      const itemsFromLogs: DiscoveredBackupItem[] = [];

      logs
        .filter((l) => l.module === 'Absensi' || l.module === 'Full_Database' || l.fileName?.includes('Absensi') || l.fileName?.includes('Rekap'))
        .forEach((log) => {
          itemsFromLogs.push({
            id: log.id,
            source: 'drive',
            title: log.fileName || 'Berkas Cadangan Google Drive',
            subTitle: `Disimpan: ${new Date(log.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} • Folder: ${log.folderPath}`,
            dateStr: log.timestamp.split('T')[0],
            driveUrl: log.fileUrl,
            recordsCount: log.recordCount,
          });
        });

      // 2. Query Google Drive API directly
      const driveList = await googleDriveAutoBackup.listAttendanceDriveBackups();
      const discoveredMap = new Map<string, DiscoveredBackupItem>();

      // Add items from API search
      for (const f of driveList) {
        let periodStart = '';
        let periodEnd = '';
        const matchPeriod = f.name.match(/(\d{4}-\d{2}-\d{2})_s\.d\._(\d{4}-\d{2}-\d{2})/);
        if (matchPeriod) {
          periodStart = matchPeriod[1];
          periodEnd = matchPeriod[2];
        } else {
          const matchSingle = f.name.match(/(\d{4}-\d{2}-\d{2})/);
          if (matchSingle) {
            periodStart = matchSingle[1];
          }
        }

        discoveredMap.set(f.id, {
          id: f.id,
          source: 'drive',
          title: f.name,
          subTitle: `Google Drive • Diperbarui: ${f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}`,
          periodStart,
          periodEnd,
          driveUrl: f.webViewLink,
          fileSize: f.size ? `${Math.round(parseInt(f.size, 10) / 1024)} KB` : undefined,
        });
      }

      // Merge logs
      for (const item of itemsFromLogs) {
        if (!discoveredMap.has(item.id)) {
          discoveredMap.set(item.id, item);
        }
      }

      const combinedDriveItems = Array.from(discoveredMap.values());
      setDriveFiles(combinedDriveItems);

      if (combinedDriveItems.length === 0 && itemsFromLogs.length === 0) {
        setDriveError('Tidak ditemukan berkas cadangan absensi di Google Drive. Anda dapat menggunakan tab "Riwayat Laporan" atau "Unggah File" di bawah.');
      }
    } catch (err: any) {
      console.warn('Scan Google Drive notice:', err);
      setDriveError(err?.message || 'Gagal membaca berkas Google Drive. Pastikan akun Google Drive Anda terhubung.');
    } finally {
      setIsScanningDrive(false);
    }
  };

  // 3. Load & Preview Records from chosen item
  const handleSelectItemForPreview = async (item: DiscoveredBackupItem) => {
    setSelectedItem(item);
    setPreviewRecords(null);
    setPreviewError(null);

    // If records are already present in memory (from weekly report)
    if (item.records && item.records.length > 0) {
      setPreviewRecords(item.records);
      return;
    }

    // If item is from Google Drive, download its JSON payload
    if (item.source === 'drive') {
      setIsLoadingPreview(true);
      try {
        // Look up corresponding JSON file if this is a PDF
        let fileIdToDownload = item.id;
        if (item.title.endsWith('.pdf')) {
          const jsonEquivalent = driveFiles.find(
            (f) => f.title === item.title.replace(/\.pdf$/i, '.json')
          );
          if (jsonEquivalent) {
            fileIdToDownload = jsonEquivalent.id;
          }
        }

        const data = await googleDriveAutoBackup.fetchDriveBackupJson(fileIdToDownload);
        if (data) {
          let recs: AttendanceRecord[] = [];
          if (data.records && Array.isArray(data.records)) {
            recs = data.records;
          } else if (data.report?.records && Array.isArray(data.report.records)) {
            recs = data.report.records;
          } else if (data.database?.attendance && Array.isArray(data.database.attendance)) {
            recs = data.database.attendance;
          }

          if (recs.length > 0) {
            setPreviewRecords(recs);
            item.records = recs;
          } else {
            setPreviewError('Berkas di Google Drive ini berformat PDF atau belum memiliki data JSON kehadiran yang dapat dibaca otomatis.');
          }
        } else {
          setPreviewError('Tidak dapat mengunduh isi data JSON dari Google Drive. Pastikan file dapat diakses.');
        }
      } catch (err: any) {
        setPreviewError(err?.message || 'Gagal membaca isi data Google Drive.');
      } finally {
        setIsLoadingPreview(false);
      }
    }
  };

  // 4. Handle Local File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        let extractedRecords: AttendanceRecord[] = [];
        let extractedTitle = file.name;
        let start = '';
        let end = '';

        if (Array.isArray(parsed)) {
          extractedRecords = parsed;
        } else if (parsed.records && Array.isArray(parsed.records)) {
          extractedRecords = parsed.records;
          start = parsed.weekStartDate || '';
          end = parsed.weekEndDate || '';
        } else if (parsed.report?.records && Array.isArray(parsed.report.records)) {
          extractedRecords = parsed.report.records;
          start = parsed.report.weekStartDate || '';
          end = parsed.report.weekEndDate || '';
        } else if (parsed.database?.attendance && Array.isArray(parsed.database.attendance)) {
          extractedRecords = parsed.database.attendance;
        }

        if (extractedRecords.length > 0) {
          const newItem: DiscoveredBackupItem = {
            id: `upload-${Date.now()}`,
            source: 'local_file',
            title: extractedTitle,
            subTitle: `File Unggahan Lokal • ${extractedRecords.length} Karyawan Terdeteksi`,
            periodStart: start,
            periodEnd: end,
            recordsCount: extractedRecords.length,
            records: extractedRecords,
            rawPayload: parsed,
          };

          setSelectedItem(newItem);
          setPreviewRecords(extractedRecords);
          setPreviewError(null);
          setActiveTab('upload');
        } else {
          setPreviewError('File JSON tidak memuat data rekaman kehadiran (attendance records) yang valid.');
        }
      } catch (err) {
        setPreviewError('Format file JSON tidak valid. Pastikan file cadangan JSON yang dipilih benar.');
      }
    };
    reader.readAsText(file);
  };

  // 5. Execute Attendance Copy & Restoration
  const handleExecuteCopy = async () => {
    if (!previewRecords || previewRecords.length === 0) {
      setPreviewError('Pilih berkas cadangan yang memuat data absensi terlebih dahulu.');
      return;
    }

    setIsExecutingCopy(true);

    try {
      // Deep clone existing records to ensure immutability
      const mergedMap = new Map<string, AttendanceRecord>();
      (currentAttendanceRecords || []).forEach((r) => {
        mergedMap.set(r.workerId, {
          ...r,
          attendance: { ...(r.attendance || {}) },
          customStatus: { ...(r.customStatus || {}) },
          reasons: { ...(r.reasons || {}) },
          signatures: { ...(r.signatures || {}) },
          notes: { ...(r.notes || {}) },
        });
      });

      // Target current week dates (Mon to Fri)
      const targetWeekDates: string[] = [];
      const parts = currentWeekStart.split('-');
      if (parts.length === 3) {
        const monDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        for (let i = 0; i < 5; i++) {
          const d = new Date(monDate);
          d.setDate(monDate.getDate() + i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          targetWeekDates.push(`${y}-${m}-${day}`);
        }
      }

      let totalDatesRestored = 0;

      // Iterate through records from chosen backup
      for (const incoming of previewRecords) {
        if (!incoming.workerId) continue;

        let targetRec = mergedMap.get(incoming.workerId);
        if (!targetRec) {
          // Worker might be new or not in active records list yet
          const matchedWorker = workers.find((w) => w.id === incoming.workerId);
          targetRec = {
            workerId: incoming.workerId,
            workerName: matchedWorker?.name || incoming.workerName || 'Karyawan',
            dailyAllowance: incoming.dailyAllowance || 25000,
            attendance: {},
            customStatus: {},
            reasons: {},
          };
          mergedMap.set(incoming.workerId, targetRec);
        }

        if (copyMode === 'original_dates') {
          // MODE 1: Restore exact historical dates (Recovers missing months & dates)
          if (incoming.attendance) {
            Object.entries(incoming.attendance).forEach(([dateStr, isPresent]) => {
              if (isPresent) {
                targetRec!.attendance[dateStr] = true;
                totalDatesRestored++;
              } else {
                delete targetRec!.attendance[dateStr];
              }
            });
          }
          if (incoming.customStatus) {
            Object.entries(incoming.customStatus).forEach(([dateStr, status]) => {
              if (status) targetRec!.customStatus![dateStr] = status as any;
            });
          }
          if (incoming.reasons) {
            Object.entries(incoming.reasons).forEach(([dateStr, reason]) => {
              if (reason) targetRec!.reasons![dateStr] = reason;
            });
          }
        } else {
          // MODE 2: Copy pattern from source week (Day 0..4) to current active week (Senin..Jumat)
          // Find source dates
          const sourceDates = Object.keys(incoming.attendance || {}).sort();
          if (sourceDates.length > 0 && targetWeekDates.length === 5) {
            // Map up to 5 days
            for (let i = 0; i < Math.min(5, sourceDates.length); i++) {
              const srcDate = sourceDates[i];
              const tgtDate = targetWeekDates[i];
              if (srcDate && tgtDate) {
                const isPresent = Boolean(incoming.attendance[srcDate]);
                if (isPresent) {
                  targetRec.attendance[tgtDate] = true;
                  delete targetRec.customStatus?.[tgtDate];
                  delete targetRec.reasons?.[tgtDate];
                  totalDatesRestored++;
                } else {
                  delete targetRec.attendance[tgtDate];
                  if (incoming.customStatus?.[srcDate]) {
                    if (!targetRec.customStatus) targetRec.customStatus = {};
                    targetRec.customStatus[tgtDate] = incoming.customStatus[srcDate] as any;
                  }
                  if (incoming.reasons?.[srcDate]) {
                    if (!targetRec.reasons) targetRec.reasons = {};
                    targetRec.reasons[tgtDate] = incoming.reasons[srcDate];
                  }
                }
              }
            }
          }
        }
      }

      const updatedRecordsList = Array.from(mergedMap.values());

      // Optionally reconstruct/ensure a weekly report exists for this copied period
      let reconstructedReport: WeeklyReport | undefined;
      const targetStart = copyMode === 'original_dates' ? (selectedItem?.periodStart || currentWeekStart) : currentWeekStart;
      const targetEnd = copyMode === 'original_dates' ? (selectedItem?.periodEnd || currentWeekEnd) : currentWeekEnd;

      if (targetStart && targetEnd) {
        const existingRep = weeklyReports.find((r) => r.weekStartDate === targetStart);
        reconstructedReport = {
          id: existingRep?.id || `REP-${Date.now().toString(36).toUpperCase()}`,
          weekStartDate: targetStart,
          weekEndDate: targetEnd,
          totalAmount: 0,
          records: updatedRecordsList,
          isSubmitted: false,
          status: 'draft',
          submittedAt: new Date().toISOString(),
        };
      }

      const msg = `Berhasil! Data absensi (${previewRecords.length} karyawan) berhasil disalin dan dipulihkan ke absensi sistem.`;

      await onCopyAttendance(updatedRecordsList, reconstructedReport, msg);

      setSuccessToast(msg);
      setTimeout(() => {
        setSuccessToast(null);
        onClose();
      }, 1800);
    } catch (err: any) {
      setPreviewError(`Gagal menyalin data absensi: ${err.message || err}`);
    } finally {
      setIsExecutingCopy(false);
    }
  };

  if (!isOpen) return null;

  // Filter items by search
  const filteredDrive = driveFiles.filter((f) =>
    f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.periodStart && f.periodStart.includes(searchTerm))
  );

  const filteredReports = reportFiles.filter((f) =>
    f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.periodStart && f.periodStart.includes(searchTerm))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/80 backdrop-blur-xs select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600/30 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Copy size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Salin &amp; Pulihkan Data Absen dari Google Drive / Riwayat
              </h2>
              <p className="text-xs text-stone-400">
                Pulihkan riwayat absensi bulanan yang hilang atau salin data dari arsip Google Drive ke bulan yang Anda pilih
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* TARGET PERIOD BANNER */}
        <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs text-emerald-950 font-medium">
            <Calendar size={15} className="text-emerald-700 shrink-0" />
            <span>
              Target Periode Absen Saat Ini: <strong className="font-bold">{currentWeekStart} s.d. {currentWeekEnd}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-800">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Data otomatis disimpan ke localStorage, server, dan Google Drive</span>
          </div>
        </div>

        {/* MODAL TABS */}
        <div className="flex border-b border-stone-200 bg-stone-50 px-5 pt-3 shrink-0 gap-2">
          <button
            onClick={() => setActiveTab('drive')}
            className={`pb-2.5 px-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'drive'
                ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            <Cloud size={15} className="text-blue-600" />
            <span>Arsip Google Drive ({driveFiles.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`pb-2.5 px-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'reports'
                ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            <FolderOpen size={15} className="text-amber-600" />
            <span>Riwayat Laporan Sistem ({reportFiles.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 px-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'upload'
                ? 'border-emerald-600 text-emerald-700 bg-white rounded-t-lg'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            <Upload size={15} className="text-purple-600" />
            <span>Unggah File Backup JSON</span>
          </button>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 select-text">
          
          {/* LEFT COLUMN: LIST OF DISCOVERED BACKUPS */}
          <div className="lg:col-span-6 flex flex-col space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
                <input
                  type="text"
                  placeholder="Cari berkas / tanggal..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-stone-100 border border-stone-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-hidden"
                />
              </div>
              {activeTab === 'drive' && (
                <button
                  onClick={scanGoogleDrive}
                  disabled={isScanningDrive}
                  className="px-2.5 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer shrink-0"
                  title="Pindai ulang Google Drive"
                >
                  <RefreshCw size={13} className={isScanningDrive ? 'animate-spin' : ''} />
                  <span>Pindai</span>
                </button>
              )}
            </div>

            {/* TAB 1: GOOGLE DRIVE LIST */}
            {activeTab === 'drive' && (
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[360px] pr-1">
                {isScanningDrive ? (
                  <div className="py-12 text-center text-stone-500 space-y-2">
                    <Loader2 size={24} className="animate-spin text-emerald-600 mx-auto" />
                    <p className="text-xs">Memindai berkas cadangan absensi di Google Drive...</p>
                  </div>
                ) : driveError ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <p>{driveError}</p>
                    </div>
                    {onOpenGoogleDriveSettings && (
                      <button
                        onClick={onOpenGoogleDriveSettings}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition cursor-pointer"
                      >
                        Hubungkan Google Drive
                      </button>
                    )}
                  </div>
                ) : filteredDrive.length === 0 ? (
                  <div className="py-10 text-center text-stone-400 text-xs border-2 border-dashed border-stone-200 rounded-xl">
                    Belum ditemukan berkas cadangan di Google Drive.
                  </div>
                ) : (
                  filteredDrive.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItemForPreview(item)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        selectedItem?.id === item.id
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
                          : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Cloud size={14} className="text-blue-600 shrink-0" />
                          <h4 className="text-xs font-bold text-stone-900 truncate" title={item.title}>
                            {item.title}
                          </h4>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate mt-0.5">{item.subTitle}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.driveUrl && (
                          <a
                            href={item.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-stone-400 hover:text-blue-600"
                            title="Buka berkas di Google Drive"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <ChevronRight
                          size={15}
                          className={selectedItem?.id === item.id ? 'text-emerald-600' : 'text-stone-300'}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: SYSTEM REPORTS LIST */}
            {activeTab === 'reports' && (
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[360px] pr-1">
                {filteredReports.length === 0 ? (
                  <div className="py-10 text-center text-stone-400 text-xs border-2 border-dashed border-stone-200 rounded-xl">
                    Belum ada riwayat laporan mingguan tersimpan.
                  </div>
                ) : (
                  filteredReports.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItemForPreview(item)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        selectedItem?.id === item.id
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-xs'
                          : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FolderOpen size={14} className="text-amber-600 shrink-0" />
                          <h4 className="text-xs font-bold text-stone-900 truncate">{item.title}</h4>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate mt-0.5">{item.subTitle}</p>
                      </div>
                      <ChevronRight
                        size={15}
                        className={selectedItem?.id === item.id ? 'text-emerald-600' : 'text-stone-300'}
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 3: UPLOAD FILE */}
            {activeTab === 'upload' && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-stone-300 rounded-xl text-center space-y-3 bg-stone-50">
                <div className="p-3 bg-purple-100 text-purple-700 rounded-full">
                  <Upload size={24} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-800">Pilih Berkas Cadangan (.JSON)</h4>
                  <p className="text-[11px] text-stone-500 mt-1">
                    Unggah file json cadangan absensi dari komputer atau yang diunduh dari Google Drive
                  </p>
                </div>
                <label className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition cursor-pointer">
                  <span>Pilih File JSON</span>
                  <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: PREVIEW & RESTORE ACTIONS */}
          <div className="lg:col-span-6 bg-stone-50 rounded-xl p-4 border border-stone-200 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="border-b border-stone-200 pb-2">
                <h3 className="text-xs font-black text-stone-800 uppercase tracking-wider">
                  Rincian Data yang Akan Disalin
                </h3>
                {selectedItem ? (
                  <p className="text-xs text-stone-600 font-semibold truncate mt-0.5">
                    {selectedItem.title}
                  </p>
                ) : (
                  <p className="text-xs text-stone-400 italic mt-0.5">
                    Pilih salah satu berkas di kolom kiri untuk melihat preview data
                  </p>
                )}
              </div>

              {/* PREVIEW CONTAINER */}
              {isLoadingPreview ? (
                <div className="py-16 text-center text-stone-500 space-y-2">
                  <Loader2 size={24} className="animate-spin text-emerald-600 mx-auto" />
                  <p className="text-xs">Mengunduh &amp; membaca data presensi dari Google Drive...</p>
                </div>
              ) : previewError ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <p>{previewError}</p>
                </div>
              ) : previewRecords && previewRecords.length > 0 ? (
                <div className="space-y-3">
                  <div className="bg-white p-2.5 rounded-lg border border-stone-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-700 flex items-center gap-1.5">
                      <Users size={14} className="text-emerald-600" />
                      {previewRecords.length} Karyawan Terdata
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Total Hari Terisi: {previewRecords.reduce((acc, r) => acc + Object.values(r.attendance || {}).filter(Boolean).length, 0)} hari
                    </span>
                  </div>

                  {/* PREVIEW TABLE */}
                  <div className="border border-stone-200 rounded-lg bg-white overflow-hidden max-h-[190px] overflow-y-auto text-[11px]">
                    <table className="w-full text-left">
                      <thead className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200 sticky top-0">
                        <tr>
                          <th className="py-1.5 px-2.5">Nama Karyawan</th>
                          <th className="py-1.5 px-2.5 text-center">Hari Hadir</th>
                          <th className="py-1.5 px-2.5 text-right">Uang Makan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {previewRecords.map((r) => {
                          const wName = r.workerName || workers.find((w) => w.id === r.workerId)?.name || r.workerId;
                          const hadirCount = Object.values(r.attendance || {}).filter(Boolean).length;
                          const totalUangMakan = hadirCount * (r.dailyAllowance || 25000);

                          return (
                            <tr key={r.workerId} className="hover:bg-stone-50">
                              <td className="py-1.5 px-2.5 font-medium text-stone-900 truncate max-w-[140px]">
                                {wName}
                              </td>
                              <td className="py-1.5 px-2.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full font-bold ${
                                  hadirCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-500'
                                }`}>
                                  {hadirCount} hari
                                </span>
                              </td>
                              <td className="py-1.5 px-2.5 text-right font-mono text-stone-700">
                                Rp {totalUangMakan.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* MODE SELECTION */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-bold text-stone-700 block">
                      Metode Penyalinan Data:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label
                        className={`p-2.5 rounded-lg border cursor-pointer transition flex items-start gap-2 ${
                          copyMode === 'original_dates'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="copyMode"
                          checked={copyMode === 'original_dates'}
                          onChange={() => setCopyMode('original_dates')}
                          className="mt-0.5 text-emerald-600"
                        />
                        <div>
                          <strong className="block font-bold">Pulihkan Tanggal Asli</strong>
                          <span className="text-[10px] text-stone-500 block leading-tight">
                            Mengembalikan tanggal &amp; riwayat bulan aslinya yang hilang
                          </span>
                        </div>
                      </label>

                      <label
                        className={`p-2.5 rounded-lg border cursor-pointer transition flex items-start gap-2 ${
                          copyMode === 'target_period'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                            : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="copyMode"
                          checked={copyMode === 'target_period'}
                          onChange={() => setCopyMode('target_period')}
                          className="mt-0.5 text-emerald-600"
                        />
                        <div>
                          <strong className="block font-bold">Salin ke Periode Aktif</strong>
                          <span className="text-[10px] text-stone-500 block leading-tight">
                            Terapkan pola kehadiran ke minggu {currentWeekStart}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-14 text-center text-stone-400 text-xs">
                  Pilih salah satu berkas di sebelah kiri untuk melihat rincian karyawan dan data kehadirannya.
                </div>
              )}
            </div>

            {/* ACTION BUTTONS */}
            <div className="pt-4 border-t border-stone-200 mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>

              <button
                type="button"
                onClick={handleExecuteCopy}
                disabled={!previewRecords || previewRecords.length === 0 || isExecutingCopy}
                className={`px-5 py-2.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                  !previewRecords || previewRecords.length === 0 || isExecutingCopy
                    ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                }`}
              >
                {isExecutingCopy ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Menyalin &amp; Menyimpan Data...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Salin Data Absen ke Sistem Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* SUCCESS TOAST */}
        {successToast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
            <CheckCircle2 size={16} />
            <span>{successToast}</span>
          </div>
        )}
      </div>
    </div>
  );
};

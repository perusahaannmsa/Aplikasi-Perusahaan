/**
 * Google Drive Automatic Daily Backup Engine for NMSA Enterprise
 * Automatically backs up Absensi Karyawan, Voucher Submissions, NPWP, SPPD, COA, and Agenda
 * to Google Drive to ensure absolute zero data loss across updates and device switches.
 */

import { 
  getOrCreateNestedFolder, 
  uploadFileToDrive 
} from '../lib/googleWorkspaceAbsen';
import { 
  ensureValidDriveToken, 
  getActiveGoogleDriveAccount, 
  getConnectedDrives, 
  executeDriveApiWithAutoRefresh,
  getStoredGoogleDriveToken,
  getOrRenewDriveToken
} from '../firebase';

export interface BackupSyncLog {
  id: string;
  timestamp: string;
  module: 'Absensi' | 'Submissions' | 'NPWP' | 'SPPD' | 'Accurate' | 'Agenda' | 'Full_Database';
  fileName: string;
  fileUrl?: string;
  folderPath: string;
  status: 'success' | 'failed' | 'in_progress';
  recordCount?: number;
  errorMessage?: string;
}

export interface DriveAutoBackupSettings {
  enabled: boolean;
  frequency: 'daily' | 'on_change_and_daily';
  lastBackupDate: string; // 'YYYY-MM-DD'
  lastBackupTime: string; // ISO
  notifyOnSuccess?: boolean;
  autoSyncAbsen: boolean;
  autoSyncSubmissions: boolean;
  autoSyncNpwp: boolean;
  autoSyncSppd: boolean;
  autoSyncAgenda: boolean;
  autoSyncFullDatabase: boolean;
  latestLinks: Record<string, string>;
}

const DEFAULT_SETTINGS: DriveAutoBackupSettings = {
  enabled: true,
  frequency: 'on_change_and_daily',
  lastBackupDate: '',
  lastBackupTime: '',
  notifyOnSuccess: true,
  autoSyncAbsen: true,
  autoSyncSubmissions: true,
  autoSyncNpwp: true,
  autoSyncSppd: true,
  autoSyncAgenda: true,
  autoSyncFullDatabase: true,
  latestLinks: {}
};

class GoogleDriveAutoBackupService {
  private settings: DriveAutoBackupSettings = DEFAULT_SETTINGS;
  private syncLogs: BackupSyncLog[] = [];
  private isSyncing = false;

  constructor() {
    this.loadSettings();
    this.loadLogs();
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem('NMSA_DRIVE_AUTO_BACKUP_SETTINGS');
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      this.settings = DEFAULT_SETTINGS;
    }
  }

  public saveSettings(newSettings: Partial<DriveAutoBackupSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem('NMSA_DRIVE_AUTO_BACKUP_SETTINGS', JSON.stringify(this.settings));
      window.dispatchEvent(new CustomEvent('nmsa-drive-autobackup-settings-updated', { detail: this.settings }));
    } catch (e) {
      console.warn('Failed to persist backup settings:', e);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.saveSettings({ enabled });
  }

  public getSettings(): DriveAutoBackupSettings {
    return { ...this.settings };
  }

  private loadLogs(): void {
    try {
      const stored = localStorage.getItem('NMSA_DRIVE_AUTO_BACKUP_LOGS');
      if (stored) {
        this.syncLogs = JSON.parse(stored);
      }
    } catch {
      this.syncLogs = [];
    }
  }

  private addLog(log: BackupSyncLog): void {
    this.syncLogs = [log, ...this.syncLogs.slice(0, 49)]; // keep latest 50 logs
    try {
      localStorage.setItem('NMSA_DRIVE_AUTO_BACKUP_LOGS', JSON.stringify(this.syncLogs));
    } catch {}
    window.dispatchEvent(new CustomEvent('nmsa-drive-autobackup-log-added', { detail: log }));
  }

  public getLogs(): BackupSyncLog[] {
    return [...this.syncLogs];
  }

  public isAutoBackupEnabled(): boolean {
    return this.settings.enabled;
  }

  public isCurrentlySyncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Checks whether a daily backup is due today
   */
  public isBackupDueToday(): boolean {
    if (!this.settings.enabled) return false;
    const todayStr = new Date().toISOString().split('T')[0];
    return this.settings.lastBackupDate !== todayStr;
  }

  /**
   * Helper to ensure token is valid and execute drive operation with automatic renewal
   */
  private async withDriveToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const activeAccount = getActiveGoogleDriveAccount();
    const lastEmail = localStorage.getItem('NUSANTARA_LAST_ACTIVE_EMAIL');
    const targetEmail = activeAccount?.email || lastEmail || undefined;

    // Ensure valid token or refresh interactively with account hint
    let token = await getOrRenewDriveToken(targetEmail, true);
    if (!token) {
      token = await ensureValidDriveToken(true);
    }

    return executeDriveApiWithAutoRefresh(async (tok) => {
      return await fn(tok);
    }, { 
      actionName: 'Auto Backup to Google Drive',
      interactiveIfRequired: true,
      targetEmail
    });
  }

  /**
   * 1. Backup Absensi Karyawan to Google Drive (Separate Dedicated Folder: ABSENSI-NMSA-APP)
   * Matches "Cetak PDF Aktif" exact layout and format with official PDF.
   */
  public async backupAbsensi(customData?: any): Promise<{ success: boolean; url?: string; error?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear().toString();
    const fileName = customData?.fileName || `Absensi_Karyawan_NMSA_${today}.pdf`;
    const folderPath = `ABSENSI-NMSA-APP/Cadangan-Data-Absensi/${currentYear}`;

    try {
      // Calculate current week Monday to Friday in local time
      const now = new Date();
      const currentDay = now.getDay(); // 0 is Sun, 1 is Mon...
      const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
      const mondayDate = new Date(now);
      mondayDate.setDate(now.getDate() + diffToMonday);
      const fridayDate = new Date(mondayDate);
      fridayDate.setDate(mondayDate.getDate() + 4);

      const fmtDate = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dt = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dt}`;
      };

      const weekStartDate = customData?.weekStartDate || fmtDate(mondayDate);
      const weekEndDate = customData?.weekEndDate || fmtDate(fridayDate);

      // Extract records, workers, and signatures
      let recordsList = customData?.records;
      let workersList = customData?.workers;
      let signaturesMap = customData?.signatures;

      if (!recordsList || !workersList) {
        try {
          const storedAbsen = localStorage.getItem('absensi_uang_makan_records') || localStorage.getItem('attendance_records_nmsa');
          const storedWorkers = localStorage.getItem('workers_v1') || localStorage.getItem('workers_nmsa');
          const storedSig = localStorage.getItem('nmsa_signatures_v1') || localStorage.getItem('attendance_signatures');
          if (storedAbsen) recordsList = JSON.parse(storedAbsen);
          if (storedWorkers) workersList = JSON.parse(storedWorkers);
          if (storedSig) signaturesMap = JSON.parse(storedSig);
        } catch (e) {}
      }

      // If still missing or empty, attempt to read from shared state API
      if (!recordsList || recordsList.length === 0 || !workersList || workersList.length === 0) {
        try {
          const res = await fetch('/api/shared-state');
          if (res.ok) {
            const shared = await res.json();
            if (!recordsList || recordsList.length === 0) recordsList = shared.attendanceRecords;
            if (!workersList || workersList.length === 0) workersList = shared.workers;
            if (!signaturesMap) signaturesMap = shared.signatures;
          }
        } catch (e) {}
      }

      recordsList = recordsList || [];
      workersList = workersList || [];

      // If records are empty or log-style, check for raw event logs and merge
      try {
        const rawLogsStr = localStorage.getItem('absen_records_v1');
        if (rawLogsStr) {
          const rawLogs: any[] = JSON.parse(rawLogsStr);
          if (Array.isArray(rawLogs) && rawLogs.length > 0) {
            const recMap = new Map<string, any>(recordsList.map((r: any) => [r.workerId, r]));
            for (const log of rawLogs) {
              if (log.workerId && log.date) {
                let rec = recMap.get(log.workerId);
                if (!rec) {
                  rec = {
                    workerId: log.workerId,
                    dailyAllowance: 25000,
                    attendance: {},
                    customStatus: {}
                  };
                  recordsList.push(rec);
                  recMap.set(log.workerId, rec);
                }
                if (!rec.attendance) rec.attendance = {};
                if (log.status === 'Hadir' || log.checkIn || log.timestamp) {
                  rec.attendance[log.date] = true;
                }
              }
            }
          }
        }
      } catch (logErr) {}

      // Filter to active workers only (matching Cetak PDF Aktif)
      const activeWorkerIds = new Set(workersList.filter((w: any) => w.isActive !== false).map((w: any) => w.id));
      const liveRecords = recordsList.filter((r: any) => activeWorkerIds.has(r.workerId));

      // Guard: Do not overwrite Google Drive with empty records or unpopulated data
      const targetRecords = liveRecords.length > 0 ? liveRecords : recordsList;
      const hasAnyAttendance = targetRecords.some((r: any) => 
        r && r.attendance && Object.values(r.attendance).some((val) => Boolean(val))
      );

      if (targetRecords.length === 0 || !hasAnyAttendance) {
        console.log('[Auto-Backup Google Drive] Penundaan upload absensi: Belum ada presensi yang terisi atau data masih dalam proses sinkronisasi.');
        return {
          success: false,
          error: 'Belum ada data presensi aktif untuk dicadangkan ke Google Drive.'
        };
      }

      // Generate the official PDF Blob matching "Cetak PDF Aktif"
      const { generateWeeklyReportPDFBlob } = await import('../lib/attendanceSheetGenerator');
      const liveReport = {
        id: `auto-backup-${weekStartDate}`,
        weekStartDate,
        weekEndDate,
        totalAmount: 0,
        records: targetRecords,
        isSubmitted: false,
        status: 'draft' as const,
        reportedAt: new Date().toISOString()
      };

      const pdfBlob = await generateWeeklyReportPDFBlob(liveReport as any, workersList, signaturesMap);

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, [
          'ABSENSI-NMSA-APP',
          'Cadangan-Data-Absensi',
          currentYear
        ]);

        return await uploadFileToDrive(token, folderId, fileName, pdfBlob);
      });

      this.addLog({
        id: `log-absen-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'Absensi',
        fileName,
        fileUrl: result.webViewLink,
        folderPath,
        status: 'success',
        recordCount: Array.isArray(liveRecords) ? liveRecords.length : recordsList.length
      });

      const updatedLinks = { ...this.settings.latestLinks, absensi: result.webViewLink };
      this.saveSettings({ latestLinks: updatedLinks });

      return { success: true, url: result.webViewLink };
    } catch (err: any) {
      console.warn('Gagal backup Absensi ke Google Drive:', err);
      this.addLog({
        id: `log-absen-err-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'Absensi',
        fileName,
        folderPath,
        status: 'failed',
        errorMessage: err?.message || 'Gagal mengunggah ke Google Drive'
      });
      return { success: false, error: err?.message };
    }
  }

  /**
   * Dedicated Weekly Attendance & Uang Makan PDF Uploader
   * Uploads official Rekap_Uang_Makan_...pdf to ABSENSI-NMSA-APP/Laporan-Absensi-Uang-Makan
   */
  public async backupWeeklyAttendanceReport(report: any, workers: any[], signatures?: any): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const weekStart = report.weekStartDate;
      const weekEnd = report.weekEndDate;
      const reportDate = new Date(weekStart);
      const folderYear = reportDate.getFullYear().toString();
      const monthName = reportDate.toLocaleString('id-ID', { month: 'long' });
      const periodFolderName = `Periode ${weekStart} s.d. ${weekEnd}`;
      const fileName = `Rekap_Uang_Makan_${weekStart}_s.d._${weekEnd}.pdf`;

      const { generateWeeklyReportPDFBlob } = await import('../lib/attendanceSheetGenerator');
      const pdfBlob = await generateWeeklyReportPDFBlob(report, workers, signatures);

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, [
          'ABSENSI-NMSA-APP',
          'Laporan-Absensi-Uang-Makan',
          folderYear,
          monthName,
          periodFolderName
        ]);

        return await uploadFileToDrive(token, folderId, fileName, pdfBlob);
      });

      this.addLog({
        id: `log-weekly-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'Absensi',
        fileName,
        fileUrl: result.webViewLink,
        folderPath: `ABSENSI-NMSA-APP/Laporan-Absensi-Uang-Makan/${folderYear}/${monthName}/${periodFolderName}`,
        status: 'success'
      });

      return { success: true, url: result.webViewLink };
    } catch (err: any) {
      console.warn('Gagal upload Laporan Mingguan ke Google Drive:', err);
      return { success: false, error: err?.message };
    }
  }

  /**
   * 2. Backup Voucher Submissions to Google Drive (Separate Dedicated Folder: Voucher-APP)
   */
  public async backupSubmissions(submissions?: any[]): Promise<{ success: boolean; url?: string; error?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear().toString();
    const folderPath = `Voucher-APP/CADANGAN_VOUCHER/${currentYear}`;

    try {
      let data = submissions;
      if (!data) {
        const stored = localStorage.getItem('submissions');
        data = stored ? JSON.parse(stored) : [];
      }

      const payload = {
        exportDate: new Date().toISOString(),
        module: 'Voucher Transaksi Keuangan NMSA',
        totalRecords: (data || []).length,
        submissions: data
      };

      const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const fileName = `Voucher_Submissions_NMSA_${today}.json`;

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, [
          'Voucher-APP',
          'CADANGAN_VOUCHER',
          currentYear
        ]);
        return await uploadFileToDrive(token, folderId, fileName, jsonBlob);
      });

      this.addLog({
        id: `log-sub-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'Submissions',
        fileName,
        fileUrl: result.webViewLink,
        folderPath,
        status: 'success',
        recordCount: (data || []).length
      });

      const updatedLinks = { ...this.settings.latestLinks, submissions: result.webViewLink };
      this.saveSettings({ latestLinks: updatedLinks });

      return { success: true, url: result.webViewLink };
    } catch (err: any) {
      console.warn('Gagal backup Submissions ke Google Drive:', err);
      return { success: false, error: err?.message };
    }
  }

  /**
   * 3. Backup Master NPWP Vendor (Separate Dedicated Folder: NPWP-VENDOR-NMSA-APP)
   */
  public async backupNpwp(): Promise<{ success: boolean; url?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear().toString();
    const folderPath = `NPWP-VENDOR-NMSA-APP/Cadangan-Data-NPWP/${currentYear}`;
    try {
      const stored = localStorage.getItem('npwp_records_v1');
      const records = stored ? JSON.parse(stored) : [];
      const payload = {
        exportDate: new Date().toISOString(),
        module: 'Master NPWP Vendor NMSA',
        records
      };
      const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const fileName = `Master_NPWP_Vendor_${today}.json`;

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, [
          'NPWP-VENDOR-NMSA-APP',
          'Cadangan-Data-NPWP',
          currentYear
        ]);
        return await uploadFileToDrive(token, folderId, fileName, jsonBlob);
      });

      this.addLog({
        id: `log-npwp-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'NPWP',
        fileName,
        fileUrl: result.webViewLink,
        folderPath,
        status: 'success',
        recordCount: records.length
      });

      return { success: true, url: result.webViewLink };
    } catch (e: any) {
      return { success: false };
    }
  }

  /**
   * 4. Backup SPPD Dinas (Separate Dedicated Folder: SPPD-NMSA-APP)
   */
  public async backupSppd(): Promise<{ success: boolean; url?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear().toString();
    const folderPath = `SPPD-NMSA-APP/Cadangan-Data-SPPD/${currentYear}`;
    try {
      const stored = localStorage.getItem('sppd_records_v1');
      const records = stored ? JSON.parse(stored) : [];
      const payload = {
        exportDate: new Date().toISOString(),
        module: 'SPPD Perjalanan Dinas NMSA',
        records
      };
      const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const fileName = `SPPD_Dinas_NMSA_${today}.json`;

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, [
          'SPPD-NMSA-APP',
          'Cadangan-Data-SPPD',
          currentYear
        ]);
        return await uploadFileToDrive(token, folderId, fileName, jsonBlob);
      });

      this.addLog({
        id: `log-sppd-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'SPPD',
        fileName,
        fileUrl: result.webViewLink,
        folderPath,
        status: 'success',
        recordCount: records.length
      });

      return { success: true, url: result.webViewLink };
    } catch (e: any) {
      return { success: false };
    }
  }

  /**
   * 5. Backup Agenda & Pengingat Kerja (Separate Dedicated Folder: AGENDA-MEETING-NMSA)
   */
  public async backupAgenda(): Promise<{ success: boolean; url?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear().toString();
    const folderPath = `AGENDA-MEETING-NMSA/Cadangan-Data-Agenda/${currentYear}`;
    try {
      const stored = localStorage.getItem('nmsa_agenda_items_v1');
      const records = stored ? JSON.parse(stored) : [];
      const payload = {
        exportDate: new Date().toISOString(),
        module: 'Agenda & Pengingat Kerja NMSA',
        records
      };
      const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const fileName = `Agenda_Kerja_NMSA_${today}.json`;

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, [
          'AGENDA-MEETING-NMSA',
          'Cadangan-Data-Agenda',
          currentYear
        ]);
        return await uploadFileToDrive(token, folderId, fileName, jsonBlob);
      });

      this.addLog({
        id: `log-agenda-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'Agenda',
        fileName,
        fileUrl: result.webViewLink,
        folderPath,
        status: 'success',
        recordCount: records.length
      });

      return { success: true, url: result.webViewLink };
    } catch (e: any) {
      return { success: false };
    }
  }

  /**
   * 6. Master Full Database Backup (All-in-One: CADANGAN-SISTEM-NMSA)
   */
  public async backupFullDatabase(customPayload?: any): Promise<{ success: boolean; url?: string; error?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear().toString();
    const folderPath = `CADANGAN-SISTEM-NMSA/Master-Full-Backup/${currentYear}`;

    try {
      // Gather all keys
      const fullPayload = customPayload || {
        exportTimestamp: new Date().toISOString(),
        date: today,
        platform: 'PT. Nusantara Mediacom Sentra Abadi (NMSA) Enterprise System',
        database: {
          submissions: JSON.parse(localStorage.getItem('submissions') || '[]'),
          attendance: JSON.parse(localStorage.getItem('absen_records_v1') || '[]'),
          workers: JSON.parse(localStorage.getItem('workers_v1') || '[]'),
          weeklyReports: JSON.parse(localStorage.getItem('weekly_reports_v1') || '[]'),
          npwpRecords: JSON.parse(localStorage.getItem('npwp_records_v1') || '[]'),
          sppdRecords: JSON.parse(localStorage.getItem('sppd_records_v1') || '[]'),
          agendaItems: JSON.parse(localStorage.getItem('nmsa_agenda_items_v1') || '[]'),
          accurateMappings: JSON.parse(localStorage.getItem('accurate_account_mappings') || '[]'),
          pettyCashHolders: JSON.parse(localStorage.getItem('petty_cash_holders_v2') || '[]'),
          activityLogs: JSON.parse(localStorage.getItem('NUSANTARA_ACTIVITY_LOGS') || '[]')
        }
      };

      const jsonBlob = new Blob([JSON.stringify(fullPayload, null, 2)], { type: 'application/json' });
      const fileName = `NMSA_Full_Database_Backup_${today}.json`;

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, [
          'CADANGAN-SISTEM-NMSA',
          'Master-Full-Backup',
          currentYear
        ]);
        return await uploadFileToDrive(token, folderId, fileName, jsonBlob);
      });

      this.addLog({
        id: `log-full-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'Full_Database',
        fileName,
        fileUrl: result.webViewLink,
        folderPath,
        status: 'success'
      });

      const updatedLinks = { ...this.settings.latestLinks, fullDatabase: result.webViewLink };
      this.saveSettings({ latestLinks: updatedLinks });

      return { success: true, url: result.webViewLink };
    } catch (err: any) {
      console.warn('Gagal backup Full Database ke Google Drive:', err);
      return { success: false, error: err?.message };
    }
  }

  /**
   * Alias for backupFullDatabase
   */
  public async backupDatabase(fullBackupPayload?: any): Promise<{ success: boolean; url?: string; error?: string }> {
    return this.backupFullDatabase(fullBackupPayload);
  }

  /**
   * Runs complete auto-backup for all enabled modules (Absensi, Submissions, NPWP, SPPD, Agenda, Full)
   */
  public async runAllAutoBackups(force = false): Promise<{ success: boolean; count: number }> {
    if (this.isSyncing) return { success: false, count: 0 };

    const token = getStoredGoogleDriveToken();
    if (!token) {
      console.log('Google Drive belum terhubung, auto-backup ditunda.');
      return { success: false, count: 0 };
    }

    if (!force && !this.isBackupDueToday()) {
      console.log('Pencadangan Google Drive harian sudah selesai untuk hari ini.');
      return { success: true, count: 0 };
    }

    this.isSyncing = true;
    window.dispatchEvent(new CustomEvent('nmsa-drive-autobackup-started'));

    let count = 0;
    try {
      if (this.settings.autoSyncAbsen) {
        const res = await this.backupAbsensi();
        if (res.success) count++;
      }
      if (this.settings.autoSyncSubmissions) {
        const res = await this.backupSubmissions();
        if (res.success) count++;
      }
      if (this.settings.autoSyncNpwp) {
        const res = await this.backupNpwp();
        if (res.success) count++;
      }
      if (this.settings.autoSyncSppd) {
        const res = await this.backupSppd();
        if (res.success) count++;
      }
      if (this.settings.autoSyncAgenda) {
        const res = await this.backupAgenda();
        if (res.success) count++;
      }
      if (this.settings.autoSyncFullDatabase) {
        const res = await this.backupFullDatabase();
        if (res.success) count++;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      this.saveSettings({
        lastBackupDate: todayStr,
        lastBackupTime: new Date().toISOString()
      });

      window.dispatchEvent(new CustomEvent('nmsa-drive-autobackup-completed', {
        detail: { count, date: todayStr }
      }));

      return { success: true, count };
    } catch (e) {
      console.error('Error in runAllAutoBackups:', e);
      return { success: false, count };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Called when the app is opened: checks connection and auto-syncs attendance PDF to Google Drive
   */
  public async onAppOpen(): Promise<void> {
    console.log('[Drive Auto-Backup] App opened: Triggering initial attendance sync to Google Drive...');
    try {
      await this.backupAbsensi();
    } catch (e) {
      console.warn('[Drive Auto-Backup] On app open sync warning:', e);
    }
  }

  /**
   * Called when the app is closing or unmounting: triggers final attendance sync to Google Drive
   */
  public async onAppClose(): Promise<void> {
    console.log('[Drive Auto-Backup] App closing: Triggering final attendance sync to Google Drive...');
    try {
      await this.backupAbsensi();
    } catch (e) {
      console.warn('[Drive Auto-Backup] On app close sync warning:', e);
    }
  }
}

export const googleDriveAutoBackup = new GoogleDriveAutoBackupService();

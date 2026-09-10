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
   */
  public async backupAbsensi(customData?: any): Promise<{ success: boolean; url?: string; error?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear().toString();
    const fileName = `Absensi_Karyawan_NMSA_${today}.json`;
    const folderPath = `ABSENSI-NMSA-APP/Cadangan-Data-Absensi/${currentYear}`;

    try {
      // Gather attendance data from localStorage or passed object
      let attendancePayload = customData;
      if (!attendancePayload) {
        const storedAbsen = localStorage.getItem('absen_records_v1');
        const storedWorkers = localStorage.getItem('workers_v1');
        const storedWeekly = localStorage.getItem('weekly_reports_v1');
        const storedPetty = localStorage.getItem('petty_cash_reports');
        const storedBank = localStorage.getItem('bank_statements');

        attendancePayload = {
          exportDate: new Date().toISOString(),
          version: '2.0',
          module: 'Absensi & Uang Makan Karyawan NMSA',
          records: storedAbsen ? JSON.parse(storedAbsen) : [],
          workers: storedWorkers ? JSON.parse(storedWorkers) : [],
          weeklyReports: storedWeekly ? JSON.parse(storedWeekly) : [],
          pettyCashReports: storedPetty ? JSON.parse(storedPetty) : [],
          bankStatements: storedBank ? JSON.parse(storedBank) : []
        };
      }

      const jsonStr = JSON.stringify(attendancePayload, null, 2);
      const jsonBlob = new Blob([jsonStr], { type: 'application/json' });

      const result = await this.withDriveToken(async (token) => {
        const folderId = await getOrCreateNestedFolder(token, [
          'ABSENSI-NMSA-APP',
          'Cadangan-Data-Absensi',
          currentYear
        ]);

        return await uploadFileToDrive(token, folderId, fileName, jsonBlob);
      });

      this.addLog({
        id: `log-absen-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'Absensi',
        fileName,
        fileUrl: result.webViewLink,
        folderPath,
        status: 'success',
        recordCount: Array.isArray(attendancePayload.records) ? attendancePayload.records.length : undefined
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
        fileName: `Absensi_Karyawan_NMSA_${today}.json`,
        folderPath,
        status: 'failed',
        errorMessage: err?.message || 'Gagal mengunggah ke Google Drive'
      });
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
}

export const googleDriveAutoBackup = new GoogleDriveAutoBackupService();

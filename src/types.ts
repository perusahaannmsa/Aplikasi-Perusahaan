export interface SubmissionItem {
  id: string;
  no: number;
  item: string;
  jumlahVolume: string; // Keterangan/Volume
  total: number; // Nominal
  keterangan: string; // Detail tambahan
  debit?: number;
  kredit?: number;
  saldo?: number;
}

export type PaymentMethod = 'Tunai' | 'Cek/Transfer';

export interface SalaryDetails {
  namaKaryawan?: string;
  nikJabatan?: string;
  periodeBulan?: string;
  gajiPokok?: number;
  tunjanganJabatan?: number;
  tunjanganOperasional?: number;
  uangMakanTransport?: number;
  bonusInsentif?: number;
  potonganBpjs?: number;
  potonganPajak?: number;
  potonganLain?: number;
  keteranganPotongan?: string;
  totalGajiBersih?: number;
}

export interface Submission {
  id: string;
  lokasi: string;
  tanggal: string; // ISO format YYYY-MM-DD
  jenisPengajuan: string; // e.g. "Biaya Gaji", "Operasional"
  kode: string; // e.g. "HO"
  dibayarkanKepada: string;
  dibayarkanDengan: PaymentMethod;
  status?: 'Lunas' | 'Belum Lunas';
  notes: string;
  
  // Invoice properties
  isInvoice?: boolean;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  
  // Salary Slip details
  salaryDetails?: SalaryDetails;
  
  // Petty Cash properties
  isPettyCash?: boolean;
  pettyCashCustodian?: string;
  pettyCashFile?: { url: string; name: string };
  
  // SPPD (Surat Perintah Perjalanan Dinas) properties
  isSppd?: boolean;
  sppdId?: string;
  sppdNo?: string;
  sppdRecord?: any;

  // Accurate Online Mapping properties (Petty Cash)
  isAccurateMapped?: boolean;
  accurateMappedAt?: string;
  accurateMappingReportId?: string;
  accurateMappedTransactions?: AccurateMappedTransaction[];
  accurateTotalExpense?: number;
  accurateKasAccountCode?: string;
  accurateReportTitle?: string;

  // Google Drive attachment support
  googleDriveFileUrl?: string;
  googleDriveFileName?: string;
  googleDriveFiles?: { url: string; name: string; pageCount?: number; isF1?: boolean; isF2?: boolean; isBuktiPembayaran?: boolean; docType?: string }[];
  googleDriveFolderId?: string;
  buktiPembayaran?: { url: string; name: string };
  
  // Signatures for Formulir Pengajuan
  dibuatOleh: string;
  disetujuiOleh: string; // e.g. "Harijon"

  // Signatures for Bukti Pengeluaran Kas/Bank (F1)
  diajukanOleh?: string; // e.g. "Andi Dhiya Salsabila"
  diajukanJabatan?: string; // e.g. "Keuangan"
  diverifikasiOleh: string; // e.g. "Andi Muhammad Rifki"
  diverifikasiJabatan: string; // e.g. "Direktur"
  disetujuiOleh2: string; // e.g. "Harijon"
  disetujuiJabatan2: string; // e.g. "Direktur Keuangan"
  dibukukanOleh: string; // e.g. "Sri Ekowati"
  dibukukanJabatan: string; // e.g. "Accounting"

  items: SubmissionItem[];
  createdAt: string;
  deletedPageIds?: string[];
}

export interface ActivityLog {
  id: string;
  timestamp: string; // ISO String
  userId: string;
  userEmail: string;
  userName: string;
  action: string; // 'create_submission' | 'update_submission' | 'delete_submission' | 'pay_submission' | 'import_sheets' | 'copy_drive_file'
  details: string; // Detailed description of action
  submissionId?: string;
  submissionCode?: string;
  category: 'info' | 'success' | 'warning';
}

export const REQUIRED_TRANSACTION_DOCS = [
  { key: 'invoice_vendor', label: 'Invoice Vendor', fullName: 'Invoice / Surat Tagihan Vendor' },
  { key: 'po', label: 'PO', fullName: 'PO (Purchase Order)' },
  { key: 'lhv', label: 'LHV', fullName: 'LHV (Laporan Hasil Verifikasi)' },
  { key: 'draft_survei', label: 'Draft Survei', fullName: 'Draft Survei (Survey Draft)' },
  { key: 'bill_of_lading', label: 'Bill of Lading', fullName: 'Bill of Lading (B/L)' },
  { key: 'cargo_manifest', label: 'Cargo Manifest', fullName: 'Cargo Manifest' },
  { key: 'cow_coa_ds_bongkar', label: 'COW & COA DS Bongkar', fullName: 'COW & COA DS Bongkar (Draft Survey)' },
  { key: 'bukti_pembayaran_batubara', label: 'Bukti Pembayaran Batubara', fullName: 'Bukti Pembayaran Batubara' },
  { key: 'bukti_shipment_tongkang_founder', label: 'Bukti Shipment Tongkang', fullName: 'Bukti Pembayaran Shipment Tongkang dari Founder' },
  { key: 'bukti_pajak_trader_founder', label: 'Bukti Bayar Pajak Trader', fullName: 'Bukti Bayar Pajak Trader ke Founder' }
];

/* ============================================================================
 * ABSENSI HARIAN & PETTY CASH TYPES (NMSA INTEGRATION)
 * ============================================================================ */
export enum TransactionType {
  EXPENSE = "EXPENSE",
  INCOME = "INCOME",
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
  bankName?: string;
  bankAccount?: string;
  phoneNumber?: string;
  nik?: string;
  photoUrl?: string;
  updatedAt?: number;
}

export interface DailyAttendance {
  date: string; // YYYY-MM-DD
  isPresent: boolean;
  notes?: string;
}

export interface AttendanceRecord {
  workerId: string;
  attendance: { [date: string]: boolean }; // date -> present status
  dailyAllowance: number; // e.g. Rp 50.000
  customStatus?: { [date: string]: "Sakit" | "Izin" | "Meeting" };
  reasons?: { [date: string]: string };
}

export interface WeeklyReport {
  id: string;
  weekStartDate: string; // Monday
  weekEndDate: string; // Friday
  records: AttendanceRecord[];
  isSubmitted: boolean;
  submittedAt?: string;
  sheetsUrl?: string; // If exported to Google Sheets
  driveFileId?: string;
  driveUrl?: string;
  pdfDriveUrl?: string;
  excelDriveUrl?: string;
}

export interface PettyCashTransaction {
  date: string;
  description: string;
  category: string;
  amount: number;
  worker: string;
  type: TransactionType;
  verified?: boolean;
}

export interface PettyCashSummary {
  totalIncome: number;
  totalExpense: number;
  remainingBalance: number;
  workerName: string;
  reportMonth: string;
}

export interface PettyCashReport {
  id: string;
  fileName: string;
  uploadedAt: string;
  summary: PettyCashSummary;
  transactions: PettyCashTransaction[];
  driveFileId?: string;
  driveUrl?: string;
  submissionId?: string;
  submissionCode?: string;
}

export interface BankStatementTransaction {
  date: string;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  balance?: number;
  pemakaian?: string;
}

export interface BankStatementSummary {
  bankName: string;
  accountNumber?: string;
  accountHolder?: string;
  period?: string;
  totalDebit: number;
  totalCredit: number;
  startingBalance?: number;
  endingBalance?: number;
}

export interface BankStatementReport {
  id: string;
  fileName: string;
  uploadedAt: string;
  summary: BankStatementSummary;
  transactions: BankStatementTransaction[];
  driveFileId?: string;
  driveUrl?: string;
  companyName?: string;
  bankName?: string;
}

export interface NpwpRecord {
  id: string;
  companyName: string;
  npwpNumber: string;
  address?: string;
  kppName?: string;
  taxStatus?: 'PKP' | 'Non-PKP';
  contactPerson?: string;
  notes?: string;
  createdAt: string;
}

export interface AccurateAccount {
  code: string; // e.g. "5-1100"
  name: string; // e.g. "Biaya Bahan Bakar Minyak"
  category: string; // e.g. "Beban Operasional", "Kas & Bank", "Hutang"
  keywords?: string[]; // e.g. ["bensin", "solar", "pertamax", "spbu"]
  isDefaultKas?: boolean;
}

export interface AccurateMappedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  recipient?: string;
  accurateAccountCode: string;
  accurateAccountName: string;
  confidence: 'high' | 'medium' | 'manual';
  notes?: string;
  rawLine?: string;
}

export interface AccurateMappingReport {
  id: string;
  title: string;
  period: string;
  sourceType?: 'excel' | 'pdf' | 'text' | 'workspace_petty_cash' | 'voucher_submission';
  createdAt?: string;
  savedAt?: string;
  updatedAt?: string;
  totalExpense: number;
  selectedKasCode?: string;
  kasAccountCode?: string;
  kasAccountName?: string;
  custodian?: string | null;
  documentUrl?: string | null;
  documentName?: string | null;
  driveBackupUrl?: string | null;
  driveBackupFileId?: string | null;
  submissionId?: string | null;
  submissionCode?: string | null;
  accountsCount?: number;
  transactions: AccurateMappedTransaction[];
}



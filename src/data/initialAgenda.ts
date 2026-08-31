import { AgendaItem } from '../types';

export const INITIAL_AGENDA_ITEMS: AgendaItem[] = [
  {
    id: 'agenda_sample_1',
    title: 'Pembayaran & Pelaporan Pajak PPh 21 / PPh 23 Masa Bulanan',
    description: 'Pastikan bukti potong dan rekonsiliasi data pajak karyawan & vendor sudah siap sebelum tanggal jatuh tempo.',
    category: 'Pajak',
    priority: 'tinggi',
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '10:00',
    status: 'pending',
    recurrence: 'monthly',
    assignedTo: 'Andi Dhiya Salsabila',
    createdAt: new Date().toISOString()
  },
  {
    id: 'agenda_sample_2',
    title: 'Rekonsiliasi Kas Operasional & Verifikasi Saldo Petty Cash',
    description: 'Cek LPJ fisik lapangan dengan mutasi voucher BKK pada sistem.',
    category: 'Keuangan',
    priority: 'sedang',
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '14:00',
    status: 'pending',
    recurrence: 'weekly',
    assignedTo: 'Nur Wahyudi',
    createdAt: new Date().toISOString()
  },
  {
    id: 'agenda_sample_3',
    title: 'Verifikasi & Penerbitan Slip Gaji Karyawan',
    description: 'Pengecekan rekap absensi harian dan penerbitan slip gaji resmi bertandatangan.',
    category: 'Penggajian',
    priority: 'tinggi',
    dueDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      return d.toISOString().split('T')[0];
    })(),
    dueTime: '09:00',
    status: 'pending',
    recurrence: 'monthly',
    assignedTo: 'Nur Wahyudi',
    createdAt: new Date().toISOString()
  },
  {
    id: 'agenda_sample_4',
    title: 'Pemeriksaan Visum & Bukti SPPD Perjalanan Dinas Lapangan',
    description: 'Validasi bukti transportasi, boarding pass, dan pengeluaran riil dinas.',
    category: 'SPPD & Lapangan',
    priority: 'sedang',
    dueDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 4);
      return d.toISOString().split('T')[0];
    })(),
    dueTime: '11:00',
    status: 'pending',
    recurrence: 'none',
    assignedTo: 'Nur Wahyudi',
    createdAt: new Date().toISOString()
  },
  {
    id: 'agenda_sample_5',
    title: 'Follow-up Pembayaran Invoice Vendor Batubara & Tongkang',
    description: 'Konfirmasi bukti transfer pelunasan transaksi batubara ke pihak vendor.',
    category: 'Vendor & Tagihan',
    priority: 'tinggi',
    dueDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 6);
      return d.toISOString().split('T')[0];
    })(),
    dueTime: '13:30',
    status: 'pending',
    recurrence: 'none',
    assignedTo: 'Sri Ekowati',
    createdAt: new Date().toISOString()
  }
];

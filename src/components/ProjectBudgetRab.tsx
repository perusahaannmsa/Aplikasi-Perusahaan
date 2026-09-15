import React, { useState, useMemo } from 'react';
import { Project, ProjectRabItem, ProjectExpense, ProjectStatus, RabCategory, Submission } from '../types';
import { 
  Building2, 
  Plus, 
  FolderKanban, 
  Calculator, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  FileSpreadsheet, 
  Printer, 
  Trash2, 
  Edit3, 
  ChevronRight, 
  Search, 
  Filter, 
  ArrowUpRight, 
  Layers, 
  Calendar, 
  User, 
  MapPin, 
  CreditCard, 
  RefreshCw, 
  Check, 
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { formatCurrency, formatDateIndonesian } from '../utils';

interface ProjectBudgetRabProps {
  projects: Project[];
  projectRab: ProjectRabItem[];
  projectExpenses: ProjectExpense[];
  submissions?: Submission[];
  onSaveProject: (project: Project) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onSaveRabItem: (item: ProjectRabItem) => Promise<void>;
  onDeleteRabItem: (itemId: string, projectId: string) => Promise<void>;
  onSaveExpense: (expense: ProjectExpense) => Promise<void>;
  onDeleteExpense: (expenseId: string, projectId: string) => Promise<void>;
  onBackToVoucher?: () => void;
}

const ACCURATE_ACCOUNTS: { code: string; name: string; category: RabCategory }[] = [
  { code: '5-1100', name: 'Beban Material & Bahan Proyek', category: 'Material' },
  { code: '5-1200', name: 'Beban Upah & Tenaga Kerja Langsung', category: 'Upah Tenaga Kerja' },
  { code: '5-1300', name: 'Beban Sewa Alat Berat & Mesin', category: 'Alat Berat & Peralatan' },
  { code: '5-1400', name: 'Beban Subkontraktor & Pekerjaan Spesialis', category: 'Subkontraktor' },
  { code: '5-1500', name: 'Beban Transportasi, Logistik & Angkutan', category: 'Transportasi & Logistik' },
  { code: '5-1600', name: 'Beban Operasional Lapangan & BBM', category: 'Operasional & BBM' },
  { code: '5-1700', name: 'Beban Overhead, K3 & Perizinan Proyek', category: 'Overhead & Perizinan' },
  { code: '5-1900', name: 'Beban Lain-Lain & Cadangan Tak Terduga', category: 'Lain-lain' },
];

export const ProjectBudgetRab: React.FC<ProjectBudgetRabProps> = ({
  projects = [],
  projectRab = [],
  projectExpenses = [],
  submissions = [],
  onSaveProject,
  onDeleteProject,
  onSaveRabItem,
  onDeleteRabItem,
  onSaveExpense,
  onDeleteExpense,
  onBackToVoucher
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return projects.length > 0 ? projects[0].id : '';
  });

  const [activeSubTab, setActiveSubTab] = useState<'rab' | 'expenses' | 'summary'>('rab');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modals state
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [isRabModalOpen, setIsRabModalOpen] = useState(false);
  const [editingRabItem, setEditingRabItem] = useState<ProjectRabItem | null>(null);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ProjectExpense | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // Active Project
  const activeProject = useMemo(() => {
    return projects.find(p => p.id === selectedProjectId) || projects[0] || null;
  }, [projects, selectedProjectId]);

  // RAB items for active project
  const activeProjectRab = useMemo(() => {
    if (!activeProject) return [];
    return projectRab.filter(r => r.projectId === activeProject.id);
  }, [projectRab, activeProject]);

  // Expenses for active project (including linked submissions if any)
  const activeProjectExpenses = useMemo(() => {
    if (!activeProject) return [];
    const directExpenses = projectExpenses.filter(e => e.projectId === activeProject.id);
    
    // Also include approved/paid submissions tagged to this project that aren't already in expenses
    const taggedSubmissions = submissions
      .filter(s => (s as any).projectId === activeProject.id && (s.status === 'Lunas' || (s as any).status === 'approved'))
      .map(s => {
        const total = (s.items || []).reduce((acc, it) => acc + (it.total || 0), 0);
        return {
          id: `sub-exp-${s.id}`,
          projectId: activeProject.id,
          date: s.tanggal,
          category: 'Operasional & BBM' as RabCategory,
          accountCode: '5-1600',
          accountName: 'Beban Operasional Proyek (Voucher HO)',
          description: s.notes || (s as any).keperluan || `Voucher HO ${s.kode}`,
          recipient: s.diajukanOleh || 'HO',
          amount: total,
          paymentMethod: 'Transfer HO',
          invoiceNumber: s.kode,
          createdAt: s.createdAt || new Date().toISOString()
        } as ProjectExpense;
      });

    // Deduplicate by invoiceNumber or id
    const all = [...directExpenses];
    taggedSubmissions.forEach(ts => {
      if (!all.some(e => e.invoiceNumber === ts.invoiceNumber || e.id === ts.id)) {
        all.push(ts);
      }
    });

    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [projectExpenses, submissions, activeProject]);

  // Financial Calculations for Active Project
  const financialSummary = useMemo(() => {
    if (!activeProject) {
      return {
        contractValue: 0,
        totalBudget: 0,
        totalActualSpent: 0,
        remainingBudget: 0,
        budgetBurnRate: 0,
        projectedGrossProfit: 0,
        actualGrossProfit: 0,
        grossProfitMargin: 0
      };
    }

    const contractValue = activeProject.contractValue || 0;
    const totalBudget = activeProjectRab.reduce((sum, item) => sum + (item.totalBudget || 0), 0);
    
    // Calculate total spent from actual expenses ledger
    const totalActualSpent = activeProjectExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
    
    const remainingBudget = totalBudget - totalActualSpent;
    const budgetBurnRate = totalBudget > 0 ? (totalActualSpent / totalBudget) * 100 : 0;
    
    const projectedGrossProfit = contractValue - totalBudget;
    const actualGrossProfit = contractValue - totalActualSpent;
    const grossProfitMargin = contractValue > 0 ? (actualGrossProfit / contractValue) * 100 : 0;

    return {
      contractValue,
      totalBudget,
      totalActualSpent,
      remainingBudget,
      budgetBurnRate,
      projectedGrossProfit,
      actualGrossProfit,
      grossProfitMargin
    };
  }, [activeProject, activeProjectRab, activeProjectExpenses]);

  // Filtered RAB items
  const filteredRabItems = useMemo(() => {
    return activeProjectRab.filter(item => {
      const matchKey = searchKeyword === '' || 
        item.itemName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        item.accountCode.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        item.accountName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        (item.notes && item.notes.toLowerCase().includes(searchKeyword.toLowerCase()));
      
      const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
      return matchKey && matchCat;
    });
  }, [activeProjectRab, searchKeyword, categoryFilter]);

  // Category breakdown for summary
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { budget: number; spent: number; count: number }>();
    
    ACCURATE_ACCOUNTS.forEach(acc => {
      map.set(acc.category, { budget: 0, spent: 0, count: 0 });
    });

    activeProjectRab.forEach(item => {
      const cat = item.category || 'Lain-lain';
      const existing = map.get(cat) || { budget: 0, spent: 0, count: 0 };
      existing.budget += item.totalBudget || 0;
      existing.spent += item.actualSpent || 0;
      existing.count += 1;
      map.set(cat, existing);
    });

    return Array.from(map.entries()).map(([category, data]) => ({
      category,
      budget: data.budget,
      spent: data.spent,
      remaining: data.budget - data.spent,
      burnRate: data.budget > 0 ? (data.spent / data.budget) * 100 : 0,
      count: data.count
    })).filter(c => c.budget > 0 || c.spent > 0);
  }, [activeProjectRab]);

  // Handlers for Project
  const handleOpenAddProject = () => {
    const year = new Date().getFullYear();
    const count = (projects.length + 1).toString().padStart(3, '0');
    setEditingProject({
      id: `PRJ-${Date.now()}`,
      code: `PRJ-${year}-${count}`,
      name: '',
      clientName: '',
      contractValue: 0,
      startDate: new Date().toISOString().split('T')[0],
      targetEndDate: '',
      endDate: '',
      status: 'Perencanaan',
      location: '',
      projectManager: '',
      progressPercent: 0,
      physicalProgress: 0,
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setIsProjectModalOpen(true);
  };

  const handleSaveProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editingProject.name.trim()) {
      alert('Mohon isi nama proyek.');
      return;
    }
    setIsSaving(true);
    try {
      await onSaveProject(editingProject);
      setSelectedProjectId(editingProject.id);
      setIsProjectModalOpen(false);
    } catch (err: any) {
      alert('Gagal menyimpan proyek: ' + (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProjectClick = async (p: Project) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus proyek "${p.name}" (${p.code}) beserta seluruh data RAB dan pengeluarannya?`)) {
      setIsSaving(true);
      try {
        await onDeleteProject(p.id);
        const remaining = projects.filter(x => x.id !== p.id);
        if (remaining.length > 0) {
          setSelectedProjectId(remaining[0].id);
        }
      } catch (err: any) {
        alert('Gagal menghapus proyek: ' + (err.message || String(err)));
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Handlers for RAB Item
  const handleOpenAddRab = () => {
    if (!activeProject) return;
    setEditingRabItem({
      id: `rab-${Date.now()}`,
      projectId: activeProject.id,
      accountCode: '5-1100',
      accountName: 'Beban Material & Bahan Proyek',
      category: 'Material',
      name: '',
      itemName: '',
      volume: 1,
      unit: 'ls',
      unitPrice: 0,
      totalBudget: 0,
      actualSpent: 0,
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setIsRabModalOpen(true);
  };

  const handleSaveRabSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRabItem || !editingRabItem.itemName.trim()) {
      alert('Mohon isi nama / uraian item RAB.');
      return;
    }
    setIsSaving(true);
    try {
      const vol = Number(editingRabItem.volume) || 0;
      const price = Number(editingRabItem.unitPrice) || 0;
      const itemToSave = {
        ...editingRabItem,
        volume: vol,
        unitPrice: price,
        totalBudget: vol * price,
        updatedAt: new Date().toISOString()
      };
      await onSaveRabItem(itemToSave);
      setIsRabModalOpen(false);
    } catch (err: any) {
      alert('Gagal menyimpan item RAB: ' + (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Handlers for Expense
  const handleOpenAddExpense = () => {
    if (!activeProject) return;
    setEditingExpense({
      id: `exp-${Date.now()}`,
      projectId: activeProject.id,
      date: new Date().toISOString().split('T')[0],
      category: 'Material',
      accountCode: '5-1100',
      accountName: 'Beban Material & Bahan Proyek',
      description: '',
      recipient: '',
      amount: 0,
      paymentMethod: 'Transfer Bank',
      invoiceNumber: '',
      notes: '',
      createdAt: new Date().toISOString()
    });
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !editingExpense.description.trim() || !editingExpense.amount) {
      alert('Mohon lengkapi keterangan dan nominal pengeluaran proyek.');
      return;
    }
    setIsSaving(true);
    try {
      await onSaveExpense({
        ...editingExpense,
        amount: Number(editingExpense.amount) || 0
      });
      setIsExpenseModalOpen(false);
    } catch (err: any) {
      alert('Gagal menyimpan pengeluaran proyek: ' + (err.message || String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  // Print RAB Document
  const handlePrintRabReport = () => {
    if (!activeProject) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>RAB Proyek - ${activeProject.code} - ${activeProject.name}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #1e293b; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 16px; font-weight: bold; margin: 0; color: #0f172a; }
          .subtitle { font-size: 11px; color: #475569; margin-top: 4px; }
          .meta-box { width: 100%; margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc; }
          .meta-table { width: 100%; border-collapse: collapse; }
          .meta-table td { padding: 3px 6px; font-size: 10px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .table th { background: #0f172a; color: white; padding: 6px 8px; font-size: 10px; text-align: left; border: 1px solid #0f172a; }
          .table td { padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 10px; }
          .table tr:nth-child(even) { background-color: #f8fafc; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .bold { font-weight: bold; }
          .kpi-row { display: flex; gap: 10px; margin-bottom: 16px; }
          .kpi-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; background: #ffffff; }
          .kpi-title { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: bold; }
          .kpi-val { font-size: 13px; font-weight: bold; margin-top: 2px; color: #0f172a; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; page-break-inside: avoid; }
          .sign-col { text-align: center; width: 200px; }
          .sign-line { border-bottom: 1px solid #0f172a; margin-top: 60px; }
          @media print {
            body { margin: 10mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="font-size: 13px; font-weight: bold; letter-spacing: 1px; color: #0f172a;">PT. NUSANTARA MINERAL SUKSES ABADI</div>
          <div class="title">LAPORAN RENCANA ANGGARAN BIAYA & REALISASI PROYEK</div>
          <div class="subtitle">Standar Akuntansi Finansial Proyek (Accurate Accounting System)</div>
        </div>

        <div class="meta-box">
          <table class="meta-table">
            <tr>
              <td style="width: 15%;"><strong>Kode Proyek</strong></td>
              <td style="width: 35%;">: ${activeProject.code}</td>
              <td style="width: 15%;"><strong>Nilai Kontrak</strong></td>
              <td style="width: 35%;">: <strong>${formatCurrency(activeProject.contractValue)}</strong></td>
            </tr>
            <tr>
              <td><strong>Nama Proyek</strong></td>
              <td>: <strong>${activeProject.name}</strong></td>
              <td><strong>Total Anggaran (RAB)</strong></td>
              <td>: <strong>${formatCurrency(financialSummary.totalBudget)}</strong></td>
            </tr>
            <tr>
              <td><strong>Klien / Pemberi Tugas</strong></td>
              <td>: ${activeProject.clientName || '-'}</td>
              <td><strong>Realisasi Pengeluaran</strong></td>
              <td>: <strong>${formatCurrency(financialSummary.totalActualSpent)}</strong> (${financialSummary.budgetBurnRate.toFixed(1)}%)</td>
            </tr>
            <tr>
              <td><strong>Lokasi Proyek</strong></td>
              <td>: ${activeProject.location || '-'}</td>
              <td><strong>Sisa Anggaran Tersedia</strong></td>
              <td>: <strong>${formatCurrency(financialSummary.remainingBudget)}</strong></td>
            </tr>
            <tr>
              <td><strong>Project Manager</strong></td>
              <td>: ${activeProject.projectManager || '-'}</td>
              <td><strong>Status & Progres</strong></td>
              <td>: ${activeProject.status} (${activeProject.physicalProgress || 0}% Fisik)</td>
            </tr>
          </table>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th style="width: 5%;" class="text-center">No</th>
              <th style="width: 12%;">Kode Akun</th>
              <th style="width: 25%;">Item Pekerjaan / Uraian</th>
              <th style="width: 8%;" class="text-center">Vol</th>
              <th style="width: 8%;" class="text-center">Satuan</th>
              <th style="width: 14%;" class="text-right">Harga Satuan</th>
              <th style="width: 14%;" class="text-right">Total Anggaran (RAB)</th>
              <th style="width: 14%;" class="text-right">Realisasi Aktual</th>
            </tr>
          </thead>
          <tbody>
            ${activeProjectRab.map((item, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td><span style="font-family: monospace; font-size: 9px;">${item.accountCode}</span></td>
                <td><strong>${item.itemName}</strong><br><span style="font-size: 8.5px; color: #64748b;">${item.category}</span></td>
                <td class="text-center">${item.volume}</td>
                <td class="text-center">${item.unit}</td>
                <td class="text-right">${formatCurrency(item.unitPrice)}</td>
                <td class="text-right"><strong>${formatCurrency(item.totalBudget)}</strong></td>
                <td class="text-right" style="color: ${item.actualSpent > item.totalBudget ? '#b91c1c' : '#0f172a'};">${formatCurrency(item.actualSpent)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background: #e2e8f0; font-weight: bold;">
              <td colspan="6" class="text-right">TOTAL KESELURUHAN BIAYA PROYEK:</td>
              <td class="text-right">${formatCurrency(financialSummary.totalBudget)}</td>
              <td class="text-right">${formatCurrency(financialSummary.totalActualSpent)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="signatures">
          <div class="sign-col">
            <div>Dibuat Oleh,</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Cost Control / Estimator</div>
            <div class="sign-line"></div>
            <div style="font-weight: bold; margin-top: 4px;">Nur Wahyudi</div>
          </div>
          <div class="sign-col">
            <div>Diperiksa Oleh,</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Project Manager Lapangan</div>
            <div class="sign-line"></div>
            <div style="font-weight: bold; margin-top: 4px;">${activeProject.projectManager || 'Project Manager'}</div>
          </div>
          <div class="sign-col">
            <div>Disetujui Oleh,</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Direktur Utama / HO</div>
            <div class="sign-line"></div>
            <div style="font-weight: bold; margin-top: 4px;">Pimpinan Perusahaan</div>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!activeProject || activeProjectRab.length === 0) {
      alert('Tidak ada data RAB untuk diekspor.');
      return;
    }

    const headers = ['No', 'Kode Proyek', 'Nama Proyek', 'Kode Akun Accurate', 'Nama Akun', 'Kategori', 'Item Pekerjaan', 'Volume', 'Satuan', 'Harga Satuan (Rp)', 'Total Anggaran RAB (Rp)', 'Realisasi Pengeluaran (Rp)', 'Sisa Anggaran (Rp)'];
    const rows = activeProjectRab.map((item, idx) => [
      idx + 1,
      `"${activeProject.code}"`,
      `"${activeProject.name}"`,
      `"${item.accountCode}"`,
      `"${item.accountName}"`,
      `"${item.category}"`,
      `"${item.itemName.replace(/"/g, '""')}"`,
      item.volume,
      `"${item.unit}"`,
      item.unitPrice,
      item.totalBudget,
      item.actualSpent,
      item.totalBudget - item.actualSpent
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `RAB_Accurate_${activeProject.code}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      
      {/* TOP HEADER & ACTIONS */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700 shadow-xs">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-stone-900 tracking-tight font-display">
                RAB &amp; Anggaran Proyek
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                Accurate Accounting
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Kelola Rencana Anggaran Biaya (RAB), pemantauan pengeluaran beban riil kegiatan proyek, dan kontrol laba/rugi per proyek.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onBackToVoucher && (
            <button
              onClick={onBackToVoucher}
              className="px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              Kembali ke Voucher HO
            </button>
          )}

          <button
            onClick={handlePrintRabReport}
            disabled={!activeProject}
            className="px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Cetak format resmi RAB & Realisasi per proyek"
          >
            <Printer className="w-3.5 h-3.5 text-stone-600" />
            <span>Cetak PDF</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={!activeProject}
            className="px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Ekspor data RAB ke file CSV / Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Ekspor CSV</span>
          </button>

          <button
            onClick={handleOpenAddProject}
            className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs hover:shadow-sm"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Tambah Proyek Baru</span>
          </button>
        </div>
      </div>

      {/* PROJECT SELECTOR & INFO CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* LEFT COLUMN: LIST OF PROJECTS */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                <FolderKanban className="w-4 h-4 text-amber-600" />
                <span>Daftar Proyek ({projects.length})</span>
              </span>
              <button
                onClick={handleOpenAddProject}
                className="text-[11px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Baru
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="text-center py-8 text-xs text-stone-400">
                Belum ada proyek terdaftar. Klik tombol Tambah Proyek Baru.
              </div>
            ) : (
              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {projects.map((p) => {
                  const isSelected = p.id === activeProject?.id;
                  const pRab = projectRab.filter(r => r.projectId === p.id);
                  const rabTotal = pRab.reduce((acc, r) => acc + (r.totalBudget || 0), 0);
                  
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition relative group ${
                        isSelected 
                          ? 'border-amber-500 bg-amber-50/50 shadow-xs ring-1 ring-amber-400' 
                          : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                            {p.code}
                          </span>
                          <h4 className="text-xs font-bold text-stone-900 mt-1 truncate">
                            {p.name}
                          </h4>
                          <p className="text-[10px] text-stone-500 truncate mt-0.5">
                            {p.clientName || 'Klien Umum'}
                          </p>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                          p.status === 'Berjalan' ? 'bg-blue-100 text-blue-800' :
                          p.status === 'Selesai' ? 'bg-emerald-100 text-emerald-800' :
                          p.status === 'On-Hold' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {p.status}
                        </span>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px]">
                        <span className="text-stone-400 font-medium">Anggaran:</span>
                        <span className="font-mono font-bold text-stone-800">{formatCurrency(rabTotal)}</span>
                      </div>

                      {/* Hover action buttons */}
                      <div className="mt-2 flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProject(p);
                            setIsProjectModalOpen(true);
                          }}
                          className="p-1 text-stone-500 hover:text-amber-600 hover:bg-stone-100 rounded cursor-pointer"
                          title="Edit Proyek"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProjectClick(p);
                          }}
                          className="p-1 text-stone-500 hover:text-rose-600 hover:bg-stone-100 rounded cursor-pointer"
                          title="Hapus Proyek"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE PROJECT OVERVIEW & METRICS */}
        <div className="lg:col-span-3 space-y-5">
          {activeProject ? (
            <>
              {/* PROJECT HEADER CARD */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-stone-900 text-amber-400">
                        {activeProject.code}
                      </span>
                      <h2 className="text-lg font-black text-stone-900">
                        {activeProject.name}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 mt-2">
                      {activeProject.clientName && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-stone-400" />
                          <span>Klien: <strong>{activeProject.clientName}</strong></span>
                        </span>
                      )}
                      {activeProject.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-stone-400" />
                          <span>Lokasi: <strong>{activeProject.location}</strong></span>
                        </span>
                      )}
                      {activeProject.projectManager && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-stone-400" />
                          <span>PIC: <strong>{activeProject.projectManager}</strong></span>
                        </span>
                      )}
                      {activeProject.startDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-stone-400" />
                          <span>Periode: <strong>{activeProject.startDate} s/d {activeProject.endDate || 'Selesai'}</strong></span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingProject(activeProject);
                        setIsProjectModalOpen(true);
                      }}
                      className="px-3 py-1.5 border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-stone-500" />
                      <span>Ubah Info</span>
                    </button>
                  </div>
                </div>

                {/* ACCURATE FINANCIAL KPI CARDS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                  <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                      Nilai Kontrak Proyek
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-stone-900 mt-0.5 block">
                      {formatCurrency(financialSummary.contractValue)}
                    </span>
                    <span className="text-[10px] text-stone-500 mt-0.5 block">
                      Nilai kesepakatan klien
                    </span>
                  </div>

                  <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                      Total Anggaran (RAB)
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-amber-950 mt-0.5 block">
                      {formatCurrency(financialSummary.totalBudget)}
                    </span>
                    <span className="text-[10px] text-amber-700 mt-0.5 block">
                      Pagu anggaran disetujui
                    </span>
                  </div>

                  <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">
                      Realisasi Beban Aktual
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono text-blue-950 mt-0.5 block">
                      {formatCurrency(financialSummary.totalActualSpent)}
                    </span>
                    <span className="text-[10px] text-blue-700 mt-0.5 block">
                      Penyerapan: <strong>{financialSummary.budgetBurnRate.toFixed(1)}%</strong>
                    </span>
                  </div>

                  <div className={`border rounded-xl p-3 ${
                    financialSummary.remainingBudget < 0
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  }`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider block opacity-70">
                      Sisa Anggaran Tersedia
                    </span>
                    <span className="text-sm sm:text-base font-black font-mono mt-0.5 block">
                      {formatCurrency(financialSummary.remainingBudget)}
                    </span>
                    <span className="text-[10px] block opacity-80 mt-0.5">
                      {financialSummary.remainingBudget < 0 ? '⚠️ Over Budget' : '✓ Sesuai Anggaran'}
                    </span>
                  </div>
                </div>

                {/* PROGRESS BAR */}
                <div className="mt-4 pt-3 border-t border-stone-100">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-stone-700 flex items-center gap-1.5">
                      <span>Penyerapan Anggaran Terhadap Pagu RAB</span>
                      <span className="text-[10px] font-normal text-stone-400">
                        (Maksimum 100%)
                      </span>
                    </span>
                    <span className={`font-mono font-bold ${
                      financialSummary.budgetBurnRate > 100 ? 'text-rose-600' :
                      financialSummary.budgetBurnRate > 85 ? 'text-amber-600' :
                      'text-emerald-700'
                    }`}>
                      {financialSummary.budgetBurnRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden flex">
                    <div 
                      className={`h-full transition-all duration-500 rounded-full ${
                        financialSummary.budgetBurnRate > 100 ? 'bg-rose-500' :
                        financialSummary.budgetBurnRate > 85 ? 'bg-amber-500' :
                        'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, financialSummary.budgetBurnRate)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* NAVIGATION TABS (RAB / EXPENSES / PROFITABILITY SUMMARY) */}
              <div className="flex bg-stone-100 p-1 rounded-xl w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('rab')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeSubTab === 'rab'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Calculator className="w-3.5 h-3.5 text-amber-600" />
                  <span>Rencana Anggaran Biaya (RAB)</span>
                  <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-700">
                    {activeProjectRab.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('expenses')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeSubTab === 'expenses'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                  <span>Buku Pengeluaran Beban Riil</span>
                  <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-stone-100 text-stone-700">
                    {activeProjectExpenses.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('summary')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeSubTab === 'summary'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Analisis &amp; Akun Accurate</span>
                </button>
              </div>

              {/* SUB-TAB 1: TABEL RAB DETAIL */}
              {activeSubTab === 'rab' && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
                  
                  {/* Filters & Action Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchKeyword}
                          onChange={(e) => setSearchKeyword(e.target.value)}
                          placeholder="Cari uraian pekerjaan atau akun..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>

                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="text-xs py-1.5 px-3 rounded-xl border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="all">Semua Kategori</option>
                        {ACCURATE_ACCOUNTS.map(a => (
                          <option key={a.category} value={a.category}>{a.category}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleOpenAddRab}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah Item RAB</span>
                    </button>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto border border-stone-200 rounded-xl">
                    <table className="w-full text-left text-xs text-stone-700">
                      <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px] font-bold">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-10">No</th>
                          <th className="py-2.5 px-3">Akun Accurate</th>
                          <th className="py-2.5 px-3">Uraian Item Pekerjaan</th>
                          <th className="py-2.5 px-3 text-center">Vol</th>
                          <th className="py-2.5 px-3 text-center">Satuan</th>
                          <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                          <th className="py-2.5 px-3 text-right">Total Anggaran (RAB)</th>
                          <th className="py-2.5 px-3 text-right">Realisasi Beban</th>
                          <th className="py-2.5 px-3 text-right">Sisa Pagu</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3 text-center w-16">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {filteredRabItems.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="text-center py-8 text-stone-400">
                              Tidak ada item RAB yang cocok dengan filter atau belum ditambahkan.
                            </td>
                          </tr>
                        ) : (
                          filteredRabItems.map((item, idx) => {
                            const remaining = (item.totalBudget || 0) - (item.actualSpent || 0);
                            const percentSpent = item.totalBudget > 0 ? ((item.actualSpent || 0) / item.totalBudget) * 100 : 0;
                            const isOver = remaining < 0;

                            return (
                              <tr key={item.id} className="hover:bg-amber-50/30 transition">
                                <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[10px]">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-mono text-[10px] font-bold text-stone-700">
                                    {item.accountCode}
                                  </div>
                                  <div className="text-[9px] text-stone-400 truncate max-w-[140px]">
                                    {item.accountName}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-stone-900">
                                    {item.itemName}
                                  </div>
                                  {item.notes && (
                                    <div className="text-[10px] text-stone-400 italic truncate max-w-[200px]">
                                      {item.notes}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-mono font-bold">
                                  {item.volume}
                                </td>
                                <td className="py-2.5 px-3 text-center text-stone-500">
                                  {item.unit}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono">
                                  {formatCurrency(item.unitPrice)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">
                                  {formatCurrency(item.totalBudget)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-900">
                                  {formatCurrency(item.actualSpent || 0)}
                                </td>
                                <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                                  isOver ? 'text-rose-600' : 'text-emerald-700'
                                }`}>
                                  {formatCurrency(remaining)}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                    isOver ? 'bg-rose-100 text-rose-800' :
                                    percentSpent > 80 ? 'bg-amber-100 text-amber-800' :
                                    'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {percentSpent.toFixed(0)}%
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingRabItem(item);
                                        setIsRabModalOpen(true);
                                      }}
                                      className="p-1 text-stone-400 hover:text-amber-600 rounded cursor-pointer"
                                      title="Ubah Item"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (window.confirm(`Hapus item RAB "${item.itemName}"?`)) {
                                          await onDeleteRabItem(item.id, activeProject.id);
                                        }
                                      }}
                                      className="p-1 text-stone-400 hover:text-rose-600 rounded cursor-pointer"
                                      title="Hapus Item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {filteredRabItems.length > 0 && (
                        <tfoot className="bg-stone-50 border-t border-stone-200 font-bold text-stone-900">
                          <tr>
                            <td colSpan={6} className="py-2.5 px-3 text-right text-stone-500 uppercase text-[10px]">
                              Total Anggaran RAB:
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-amber-900">
                              {formatCurrency(filteredRabItems.reduce((s, r) => s + (r.totalBudget || 0), 0))}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-blue-900">
                              {formatCurrency(filteredRabItems.reduce((s, r) => s + (r.actualSpent || 0), 0))}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-900">
                              {formatCurrency(filteredRabItems.reduce((s, r) => s + ((r.totalBudget || 0) - (r.actualSpent || 0)), 0))}
                            </td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: TABEL PENGELUARAN AKTUAL / EXPENSES */}
              {activeSubTab === 'expenses' && (
                <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-stone-900">
                        Buku Pengeluaran Riil Proyek ({activeProjectExpenses.length} Transaksi)
                      </h3>
                      <p className="text-xs text-stone-500">
                        Catatan realisasi pengeluaran dana untuk kegiatan proyek yang otomatis memotong pagu item RAB.
                      </p>
                    </div>

                    <button
                      onClick={handleOpenAddExpense}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Catat Pengeluaran Proyek</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-stone-200 rounded-xl">
                    <table className="w-full text-left text-xs text-stone-700">
                      <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[10px] font-bold">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-10">No</th>
                          <th className="py-2.5 px-3">Tanggal</th>
                          <th className="py-2.5 px-3">No Ref / Invoice</th>
                          <th className="py-2.5 px-3">Akun Accurate</th>
                          <th className="py-2.5 px-3">Keterangan / Uraian Beban</th>
                          <th className="py-2.5 px-3">Penerima / Vendor</th>
                          <th className="py-2.5 px-3">Metode Bayar</th>
                          <th className="py-2.5 px-3 text-right">Nominal (Rp)</th>
                          <th className="py-2.5 px-3 text-center w-14">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {activeProjectExpenses.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="text-center py-8 text-stone-400">
                              Belum ada transaksi pengeluaran untuk proyek ini.
                            </td>
                          </tr>
                        ) : (
                          activeProjectExpenses.map((exp, idx) => (
                            <tr key={exp.id} className="hover:bg-blue-50/30 transition">
                              <td className="py-2.5 px-3 text-center text-stone-400 font-mono text-[10px]">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                                {exp.date}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[10px] font-bold text-stone-800">
                                {exp.invoiceNumber || '-'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-mono text-[10px] bg-stone-100 px-1.5 py-0.5 rounded font-bold">
                                  {exp.accountCode}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-bold text-stone-900">
                                {exp.description}
                              </td>
                              <td className="py-2.5 px-3 text-stone-600">
                                {exp.recipient || '-'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                                  {exp.paymentMethod || 'Transfer'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900">
                                {formatCurrency(exp.amount)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {!exp.id.startsWith('sub-exp-') && (
                                  <button
                                    onClick={async () => {
                                      if (window.confirm(`Hapus transaksi pengeluaran "${exp.description}"?`)) {
                                        await onDeleteExpense(exp.id, activeProject.id);
                                      }
                                    }}
                                    className="p-1 text-stone-400 hover:text-rose-600 rounded cursor-pointer"
                                    title="Hapus Pengeluaran"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {activeProjectExpenses.length > 0 && (
                        <tfoot className="bg-stone-50 border-t border-stone-200 font-bold text-stone-900">
                          <tr>
                            <td colSpan={7} className="py-2.5 px-3 text-right text-stone-500 uppercase text-[10px]">
                              Total Realisasi Beban Proyek:
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-blue-950 text-sm">
                              {formatCurrency(financialSummary.totalActualSpent)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: ANALISIS PROFITABILITAS & AKUN ACCURATE */}
              {activeSubTab === 'summary' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  
                  {/* BREAKDOWN PER AKUN ACCURATE */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-600" />
                      <span>Alokasi Anggaran &amp; Beban per Akun Accurate</span>
                    </h3>

                    <div className="space-y-3">
                      {categoryBreakdown.length === 0 ? (
                        <div className="text-center py-6 text-xs text-stone-400">
                          Belum ada item anggaran yang dialokasikan.
                        </div>
                      ) : (
                        categoryBreakdown.map((cat) => (
                          <div key={cat.category} className="p-3 bg-stone-50 border border-stone-200/80 rounded-xl space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-stone-900">{cat.category}</span>
                              <span className="font-mono text-stone-500 text-[11px]">
                                {cat.count} Item Pekerjaan
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="text-stone-500">Anggaran: <strong>{formatCurrency(cat.budget)}</strong></span>
                              <span className="text-blue-700">Terpakai: <strong>{formatCurrency(cat.spent)}</strong> ({cat.burnRate.toFixed(1)}%)</span>
                            </div>

                            <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${
                                  cat.burnRate > 100 ? 'bg-rose-500' :
                                  cat.burnRate > 80 ? 'bg-amber-500' :
                                  'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, cat.burnRate)}%` }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* PROFIT & LOSS PROJECTION CARD */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <span>Proyeksi Laba / Rugi (Gross Profit Margin)</span>
                    </h3>

                    <div className="space-y-3">
                      <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-stone-500 block">Pendapatan Kontrak</span>
                          <span className="text-sm font-black font-mono text-stone-900">
                            {formatCurrency(financialSummary.contractValue)}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-stone-400">100%</span>
                      </div>

                      <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200/60 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-amber-900 block">Estimasi Beban Proyek (Pagu RAB)</span>
                          <span className="text-sm font-black font-mono text-amber-950">
                            {formatCurrency(financialSummary.totalBudget)}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-amber-700">
                          {financialSummary.contractValue > 0 ? ((financialSummary.totalBudget / financialSummary.contractValue) * 100).toFixed(1) : 0}%
                        </span>
                      </div>

                      <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-emerald-900 block">Target Laba Kotor Proyek (Projected Gross Profit)</span>
                          <span className="text-base font-black font-mono text-emerald-950">
                            {formatCurrency(financialSummary.projectedGrossProfit)}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                          {financialSummary.contractValue > 0 ? ((financialSummary.projectedGrossProfit / financialSummary.contractValue) * 100).toFixed(1) : 0}% Margin
                        </span>
                      </div>

                      <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-blue-900 block">Laba Berjalan Berdasarkan Pengeluaran Riil</span>
                          <span className="text-base font-black font-mono text-blue-950">
                            {formatCurrency(financialSummary.actualGrossProfit)}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                          {financialSummary.grossProfitMargin.toFixed(1)}% Berjalan
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </>
          ) : (
            <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center shadow-xs">
              <FolderKanban className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-stone-800">Pilih Proyek atau Tambahkan Proyek Baru</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto mt-1 mb-4">
                Pilih proyek di daftar sebelah kiri untuk melihat tabel Rencana Anggaran Biaya (RAB) dan riwayat realisasi pengeluaran, atau buat proyek baru.
              </p>
              <button
                onClick={handleOpenAddProject}
                className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Tambah Proyek Pertama
              </button>
            </div>
          )}
        </div>

      </div>

      {/* MODAL: TAMBAH / UBAH PROYEK */}
      {isProjectModalOpen && editingProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-4">
              <h3 className="text-base font-black text-stone-900 font-display">
                {projects.some(p => p.id === editingProject.id) ? 'Ubah Rincian Proyek' : 'Tambah Proyek Baru'}
              </h3>
              <button
                onClick={() => setIsProjectModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProjectSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Kode Proyek</label>
                  <input
                    type="text"
                    required
                    value={editingProject.code}
                    onChange={(e) => setEditingProject({ ...editingProject, code: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="PRJ-2026-001"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Status Proyek</label>
                  <select
                    value={editingProject.status}
                    onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value as ProjectStatus })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="Perencanaan">Perencanaan</option>
                    <option value="Berjalan">Berjalan</option>
                    <option value="Selesai">Selesai</option>
                    <option value="On-Hold">On-Hold</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Nama Proyek</label>
                <input
                  type="text"
                  required
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Contoh: Pembangunan Dermaga Tambang Site B"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Klien / Pemberi Tugas</label>
                  <input
                    type="text"
                    value={editingProject.clientName}
                    onChange={(e) => setEditingProject({ ...editingProject, clientName: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Nama Perusahaan Klien"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Nilai Kontrak (Rp)</label>
                  <input
                    type="number"
                    value={editingProject.contractValue || ''}
                    onChange={(e) => setEditingProject({ ...editingProject, contractValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Lokasi Proyek</label>
                  <input
                    type="text"
                    value={editingProject.location || ''}
                    onChange={(e) => setEditingProject({ ...editingProject, location: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Morowali / Kendari / dll"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Project Manager (PIC)</label>
                  <input
                    type="text"
                    value={editingProject.projectManager || ''}
                    onChange={(e) => setEditingProject({ ...editingProject, projectManager: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="Nama PIC"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={editingProject.startDate}
                    onChange={(e) => setEditingProject({ ...editingProject, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Target Selesai</label>
                  <input
                    type="date"
                    value={editingProject.endDate || ''}
                    onChange={(e) => setEditingProject({ ...editingProject, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold bg-stone-900 hover:bg-black text-white rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Proyek'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH / UBAH ITEM RAB */}
      {isRabModalOpen && editingRabItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-4">
              <h3 className="text-base font-black text-stone-900 font-display">
                {activeProjectRab.some(r => r.id === editingRabItem.id) ? 'Ubah Item RAB' : 'Tambah Item RAB Baru'}
              </h3>
              <button
                onClick={() => setIsRabModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRabSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Akun Beban Proyek (Standar Accurate)
                </label>
                <select
                  value={editingRabItem.accountCode}
                  onChange={(e) => {
                    const acc = ACCURATE_ACCOUNTS.find(a => a.code === e.target.value);
                    if (acc) {
                      setEditingRabItem({
                        ...editingRabItem,
                        accountCode: acc.code,
                        accountName: acc.name,
                        category: acc.category
                      });
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                >
                  {ACCURATE_ACCOUNTS.map(a => (
                    <option key={a.code} value={a.code}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Uraian Item Pekerjaan / Biaya
                </label>
                <input
                  type="text"
                  required
                  value={editingRabItem.itemName}
                  onChange={(e) => setEditingRabItem({ ...editingRabItem, itemName: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Contoh: Pengadaan Solar Industri HSD 5000 Liter"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Volume</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editingRabItem.volume || ''}
                    onChange={(e) => setEditingRabItem({ ...editingRabItem, volume: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Satuan</label>
                  <input
                    type="text"
                    required
                    value={editingRabItem.unit}
                    onChange={(e) => setEditingRabItem({ ...editingRabItem, unit: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="ls / m3 / unit / hari"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Harga Satuan (Rp)</label>
                  <input
                    type="number"
                    required
                    value={editingRabItem.unitPrice || ''}
                    onChange={(e) => setEditingRabItem({ ...editingRabItem, unitPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Total Calculation Preview */}
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900">Total Anggaran Pagu Item:</span>
                <span className="text-sm font-black font-mono text-amber-950">
                  {formatCurrency((Number(editingRabItem.volume) || 0) * (Number(editingRabItem.unitPrice) || 0))}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Catatan Tambahan (Opsional)</label>
                <textarea
                  rows={2}
                  value={editingRabItem.notes || ''}
                  onChange={(e) => setEditingRabItem({ ...editingRabItem, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Spesifikasi teknis atau vendor referensi..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsRabModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Item RAB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CATAT PENGELUARAN AKTUAL PROYEK */}
      {isExpenseModalOpen && editingExpense && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-4">
              <h3 className="text-base font-black text-stone-900 font-display">
                Catat Pengeluaran Dana Proyek
              </h3>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpenseSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Tanggal Transaksi</label>
                  <input
                    type="date"
                    required
                    value={editingExpense.date}
                    onChange={(e) => setEditingExpense({ ...editingExpense, date: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">No Ref / Invoice / Voucher</label>
                  <input
                    type="text"
                    value={editingExpense.invoiceNumber || ''}
                    onChange={(e) => setEditingExpense({ ...editingExpense, invoiceNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="INV-001 / BKK-HO"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                  Hubungkan ke Item RAB Proyek
                </label>
                <select
                  value={editingExpense.rabItemId || ''}
                  onChange={(e) => {
                    const rabId = e.target.value;
                    const rItem = activeProjectRab.find(r => r.id === rabId);
                    setEditingExpense({
                      ...editingExpense,
                      rabItemId: rabId,
                      accountCode: rItem?.accountCode || editingExpense.accountCode,
                      accountName: rItem?.accountName || editingExpense.accountName
                    });
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Biaya Umum / Non-RAB Spesifik --</option>
                  {activeProjectRab.map(r => (
                    <option key={r.id} value={r.id}>
                      [{r.accountCode}] {r.itemName} (Pagu: {formatCurrency(r.totalBudget)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Keterangan / Uraian Beban</label>
                <input
                  type="text"
                  required
                  value={editingExpense.description}
                  onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Contoh: Pembelian Solar Dexlite untuk genset camp"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Penerima / Toko / Vendor</label>
                  <input
                    type="text"
                    value={editingExpense.recipient || ''}
                    onChange={(e) => setEditingExpense({ ...editingExpense, recipient: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Nama Vendor / Toko"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Nominal Beban (Rp)</label>
                  <input
                    type="number"
                    required
                    value={editingExpense.amount || ''}
                    onChange={(e) => setEditingExpense({ ...editingExpense, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Metode Pembayaran</label>
                  <select
                    value={editingExpense.paymentMethod || 'Transfer Bank'}
                    onChange={(e) => setEditingExpense({ ...editingExpense, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Transfer Bank">Transfer Bank</option>
                    <option value="Kas Tunai Lapangan">Kas Tunai Lapangan</option>
                    <option value="Petty Cash HO">Petty Cash HO</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">Link Bukti Pembayaran (Opsional)</label>
                  <input
                    type="text"
                    value={editingExpense.receiptUrl || ''}
                    onChange={(e) => setEditingExpense({ ...editingExpense, receiptUrl: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="URL Google Drive / Nota"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Pengeluaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

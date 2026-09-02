import React, { useState, useMemo, useEffect } from 'react';
import { AgendaItem, AgendaCategory, AgendaPriority, AgendaRecurrence, Submission } from '../types';
import { 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  Flame, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Trash2, 
  Edit3, 
  Printer, 
  ArrowRight, 
  Sparkles, 
  Layers, 
  RefreshCw, 
  CalendarDays, 
  ListTodo, 
  Tag, 
  User, 
  FileText, 
  X,
  Repeat,
  AlertCircle
} from 'lucide-react';
import { formatDateIndonesian } from '../utils';
import { LiveClock } from './LiveClock';

interface AgendaManagerProps {
  agendaItems: AgendaItem[];
  onSaveAgendaItems: (items: AgendaItem[]) => void;
  submissions: Submission[];
  userProfile: any;
  onOpenSubmissionForPrint?: (sub: Submission) => void;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<AgendaCategory, { bg: string; text: string; border: string }> = {
  'Keuangan': { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  'Pajak': { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
  'Penggajian': { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  'SPPD & Lapangan': { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200' },
  'Vendor & Tagihan': { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  'Operasional': { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200' },
  'Administrasi': { bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-200' },
  'Lainnya': { bg: 'bg-stone-50', text: 'text-stone-700', border: 'border-stone-200' }
};

const PRIORITY_BADGES: Record<AgendaPriority, { label: string; bg: string; text: string }> = {
  'tinggi': { label: 'Tinggi', bg: 'bg-rose-600', text: 'text-white' },
  'sedang': { label: 'Sedang', bg: 'bg-amber-500', text: 'text-stone-950' },
  'normal': { label: 'Normal', bg: 'bg-stone-200', text: 'text-stone-800' }
};

export function AgendaManager({
  agendaItems,
  onSaveAgendaItems,
  submissions,
  userProfile,
  onOpenSubmissionForPrint,
  onClose
}: AgendaManagerProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [activeTab, setActiveTab] = useState<'due_or_overdue' | 'all_active' | 'upcoming' | 'completed'>('due_or_overdue');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(() => new Date().toISOString().split('T')[0]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AgendaItem | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<AgendaCategory>('Keuangan');
  const [formPriority, setFormPriority] = useState<AgendaPriority>('sedang');
  const [formDueDate, setFormDueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formDueTime, setFormDueTime] = useState('09:00');
  const [formRecurrence, setFormRecurrence] = useState<AgendaRecurrence>('none');
  const [formVoucherCode, setFormVoucherCode] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState(userProfile?.fullName || 'Nur Wahyudi');

  const todayStr = new Date().toISOString().split('T')[0];

  const handleOpenAddModal = (presetDate?: string) => {
    setEditingItem(null);
    setFormTitle('');
    setFormDescription('');
    setFormCategory('Keuangan');
    setFormPriority('sedang');
    setFormDueDate(presetDate || todayStr);
    setFormDueTime('09:00');
    setFormRecurrence('none');
    setFormVoucherCode('');
    setFormAssignedTo(userProfile?.fullName || 'Nur Wahyudi');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: AgendaItem) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormDescription(item.description || '');
    setFormCategory(item.category);
    setFormPriority(item.priority);
    setFormDueDate(item.dueDate);
    setFormDueTime(item.dueTime || '');
    setFormRecurrence(item.recurrence || 'none');
    setFormVoucherCode(item.voucherCode || '');
    setFormAssignedTo(item.assignedTo || userProfile?.fullName || 'Nur Wahyudi');
    setIsModalOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDueDate) return;

    if (editingItem) {
      // Update existing
      const updated: AgendaItem = {
        ...editingItem,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        priority: formPriority,
        dueDate: formDueDate,
        dueTime: formDueTime.trim() || undefined,
        recurrence: formRecurrence,
        voucherCode: formVoucherCode.trim() || undefined,
        assignedTo: formAssignedTo.trim() || undefined,
        updatedAt: new Date().toISOString()
      };
      const newList = agendaItems.map(item => item.id === editingItem.id ? updated : item);
      onSaveAgendaItems(newList);
    } else {
      // Create new
      const newItem: AgendaItem = {
        id: 'agenda_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        priority: formPriority,
        dueDate: formDueDate,
        dueTime: formDueTime.trim() || undefined,
        status: 'pending',
        recurrence: formRecurrence,
        voucherCode: formVoucherCode.trim() || undefined,
        assignedTo: formAssignedTo.trim() || undefined,
        createdAt: new Date().toISOString()
      };
      onSaveAgendaItems([newItem, ...agendaItems]);
    }

    setIsModalOpen(false);
  };

  const handleToggleComplete = (id: string) => {
    const newList = agendaItems.map(item => {
      if (item.id === id) {
        const isNowCompleted = item.status === 'pending';
        return {
          ...item,
          status: (isNowCompleted ? 'completed' : 'pending') as 'pending' | 'completed',
          completedAt: isNowCompleted ? new Date().toISOString() : undefined,
          completedBy: isNowCompleted ? (userProfile?.fullName || 'Nur Wahyudi') : undefined
        };
      }
      return item;
    });
    onSaveAgendaItems(newList);
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus agenda kegiatan ini?')) {
      const newList = agendaItems.filter(item => item.id !== id);
      onSaveAgendaItems(newList);
    }
  };

  const handlePostpone = (id: string, days: number) => {
    const newList = agendaItems.map(item => {
      if (item.id === id) {
        const curr = new Date(item.dueDate);
        curr.setDate(curr.getDate() + days);
        const newDue = curr.toISOString().split('T')[0];
        return {
          ...item,
          dueDate: newDue,
          updatedAt: new Date().toISOString()
        };
      }
      return item;
    });
    onSaveAgendaItems(newList);
  };

  // Stats calculation
  const totalPending = agendaItems.filter(i => i.status === 'pending').length;
  const overdueItems = agendaItems.filter(i => i.status === 'pending' && i.dueDate < todayStr);
  const todayItems = agendaItems.filter(i => i.status === 'pending' && i.dueDate === todayStr);
  const completedCount = agendaItems.filter(i => i.status === 'completed').length;

  // Filtered items
  const filteredItems = useMemo(() => {
    return agendaItems.filter(item => {
      // Tab filter
      if (activeTab === 'due_or_overdue') {
        if (item.status === 'completed') return false;
        if (item.dueDate > todayStr) return false;
      } else if (activeTab === 'all_active') {
        if (item.status === 'completed') return false;
      } else if (activeTab === 'upcoming') {
        if (item.status === 'completed') return false;
        if (item.dueDate <= todayStr) return false;
      } else if (activeTab === 'completed') {
        if (item.status !== 'completed') return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // Priority filter
      if (selectedPriority !== 'all' && item.priority !== selectedPriority) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchVoucher = item.voucherCode?.toLowerCase().includes(q);
        const matchCat = item.category.toLowerCase().includes(q);
        const matchAssigned = item.assignedTo?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchVoucher && !matchCat && !matchAssigned) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // In completed tab, sort by completedAt desc
      if (activeTab === 'completed') {
        return (b.completedAt || b.createdAt).localeCompare(a.completedAt || a.createdAt);
      }
      // Otherwise sort by dueDate asc, then priority desc
      if (a.dueDate !== b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      const priorityWeight = { tinggi: 3, sedang: 2, normal: 1 };
      return (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1);
    });
  }, [agendaItems, activeTab, selectedCategory, selectedPriority, searchQuery, todayStr]);

  // Calendar Helpers
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday...

  const monthNamesIndonesian = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const calendarDays = useMemo(() => {
    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Previous month filler
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, d);
      const dateStr = prevDate.toISOString().split('T')[0];
      days.push({ dateStr, dayNum: d, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const currDate = new Date(year, month, d);
      // Ensure local timezone doesn't shift date
      const y = currDate.getFullYear();
      const m = String(currDate.getMonth() + 1).padStart(2, '0');
      const dayStr = String(currDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dayStr}`;
      days.push({ dateStr, dayNum: d, isCurrentMonth: true });
    }

    // Next month filler to reach grid multiple of 7
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, '0');
      const dayStr = String(nextDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dayStr}`;
      days.push({ dateStr, dayNum: i, isCurrentMonth: false });
    }

    return days;
  }, [year, month, daysInMonth, startingDayOfWeek]);

  // Map of dateStr -> AgendaItem[]
  const dateToItemsMap = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    agendaItems.forEach(item => {
      const list = map.get(item.dueDate) || [];
      list.push(item);
      map.set(item.dueDate, list);
    });
    return map;
  }, [agendaItems]);

  const selectedDateItems = selectedDateFilter ? (dateToItemsMap.get(selectedDateFilter) || []) : [];

  return (
    <div className="w-full flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-sans space-y-6">
      
      {/* Top Banner / Breadcrumb & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-xs">
            <CalendarDays size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded">
                Manajemen Jadwal &amp; Tugas
              </span>
              <span className="text-xs text-stone-400 font-mono">Real-time Reminder</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight mt-0.5">
              Pengingat Kegiatan &amp; Agenda Kerja
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Pengingat otomatis untuk tenggat waktu pajak, rekonsiliasi kas, slip gaji, dan SPPD operasional.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <LiveClock variant="compact" className="hidden lg:inline-flex" />

          {/* View Toggle */}
          <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-stone-900 shadow-2xs font-extrabold' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ListTodo size={14} className="text-amber-600" />
              <span>Daftar Tugas</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'calendar' ? 'bg-white text-stone-900 shadow-2xs font-extrabold' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <CalendarIcon size={14} className="text-amber-600" />
              <span>Kalender</span>
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-250 text-stone-700 text-xs font-bold transition cursor-pointer shadow-3xs"
            title="Cetak Jadwal Agenda Kegiatan"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Cetak Checklist</span>
          </button>

          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-black transition cursor-pointer shadow-xs active:scale-95"
          >
            <Plus size={16} />
            <span>Tambah Agenda</span>
          </button>
        </div>
      </div>

      {/* KPI / Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div 
          onClick={() => { setActiveTab('due_or_overdue'); setViewMode('list'); }}
          className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
            activeTab === 'due_or_overdue' && viewMode === 'list'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400' 
              : 'bg-white border-stone-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wide flex items-center gap-1.5">
              <Flame size={14} className="text-rose-600 fill-rose-500" />
              Jatuh Tempo &amp; Hari Ini
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-rose-900 font-mono">
              {overdueItems.length + todayItems.length}
            </span>
            <span className="text-[11px] text-rose-600 font-mono">
              ({overdueItems.length} Terlewat, {todayItems.length} Hari Ini)
            </span>
          </div>
        </div>

        <div 
          onClick={() => { setActiveTab('all_active'); setViewMode('list'); }}
          className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
            activeTab === 'all_active' && viewMode === 'list'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400' 
              : 'bg-white border-stone-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
              <ListTodo size={14} className="text-amber-600" />
              Semua Tugas Aktif
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-950 font-mono">
              {totalPending}
            </span>
            <span className="text-[11px] text-stone-500">Pekerjaan Berjalan</span>
          </div>
        </div>

        <div 
          onClick={() => { setActiveTab('upcoming'); setViewMode('list'); }}
          className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
            activeTab === 'upcoming' && viewMode === 'list'
              ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-400' 
              : 'bg-white border-stone-200 hover:border-sky-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-800 uppercase tracking-wide flex items-center gap-1.5">
              <Clock size={14} className="text-sky-600" />
              Jadwal Mendatang
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-sky-950 font-mono">
              {totalPending - (overdueItems.length + todayItems.length)}
            </span>
            <span className="text-[11px] text-stone-500">Mendatang</span>
          </div>
        </div>

        <div 
          onClick={() => { setActiveTab('completed'); setViewMode('list'); }}
          className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
            activeTab === 'completed' && viewMode === 'list'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400' 
              : 'bg-white border-stone-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Sudah Selesai
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-950 font-mono">
              {completedCount}
            </span>
            <span className="text-[11px] text-emerald-600 font-mono">Tuntas</span>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: LIST / KANBAN VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          
          {/* Controls Bar: Tabs, Search & Filters */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              <button
                onClick={() => setActiveTab('due_or_overdue')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'due_or_overdue' 
                    ? 'bg-rose-600 text-white shadow-xs font-black' 
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Flame size={13} />
                <span>Hari Ini &amp; Terlambat</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-mono">
                  {overdueItems.length + todayItems.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('all_active')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'all_active' 
                    ? 'bg-stone-900 text-white shadow-xs font-black' 
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <span>Semua Aktif</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-mono">
                  {totalPending}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('upcoming')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'upcoming' 
                    ? 'bg-sky-600 text-white shadow-xs font-black' 
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <span>Mendatang</span>
              </button>

              <button
                onClick={() => setActiveTab('completed')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'completed' 
                    ? 'bg-emerald-600 text-white shadow-xs font-black' 
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <CheckCircle2 size={13} />
                <span>Riwayat Selesai ({completedCount})</span>
              </button>
            </div>

            {/* Search & Category / Priority Selects */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <div className="relative flex-1 sm:w-56">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Cari agenda / voucher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    <X size={12} />
                  </button>
                )}
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-stone-50 border border-stone-250 rounded-xl font-sans focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">Semua Kategori</option>
                <option value="Keuangan">Keuangan</option>
                <option value="Pajak">Pajak</option>
                <option value="Penggajian">Penggajian</option>
                <option value="SPPD & Lapangan">SPPD &amp; Lapangan</option>
                <option value="Vendor & Tagihan">Vendor &amp; Tagihan</option>
                <option value="Operasional">Operasional</option>
                <option value="Administrasi">Administrasi</option>
                <option value="Lainnya">Lainnya</option>
              </select>

              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-stone-50 border border-stone-250 rounded-xl font-sans focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">Semua Prioritas</option>
                <option value="tinggi">Tinggi</option>
                <option value="sedang">Sedang</option>
                <option value="normal">Normal</option>
              </select>
            </div>

          </div>

          {/* Agenda Items List */}
          {filteredItems.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold text-stone-800">
                Tidak ada agenda kegiatan yang cocok
              </h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Semua tugas pada kriteria ini sudah selesai atau belum ditambahkan. Klik tombol di bawah untuk membuat agenda baru.
              </p>
              <button
                onClick={() => handleOpenAddModal()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Buat Agenda Baru</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredItems.map((item) => {
                const isCompleted = item.status === 'completed';
                const isOverdue = !isCompleted && item.dueDate < todayStr;
                const isToday = !isCompleted && item.dueDate === todayStr;
                const catStyle = CATEGORY_COLORS[item.category] || CATEGORY_COLORS['Lainnya'];
                const priorityBadge = PRIORITY_BADGES[item.priority] || PRIORITY_BADGES['normal'];

                // Check if matching submission exists for voucher code link
                const linkedSub = item.voucherCode 
                  ? submissions.find(s => s.kode === item.voucherCode || s.id === item.voucherCode)
                  : null;

                return (
                  <div
                    key={item.id}
                    className={`bg-white p-4 rounded-2xl border transition shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isCompleted 
                        ? 'opacity-70 bg-stone-50/80 border-stone-200' 
                        : isOverdue 
                        ? 'border-rose-300 bg-rose-50/20 hover:border-rose-400' 
                        : isToday 
                        ? 'border-amber-400 bg-amber-50/20 hover:border-amber-500' 
                        : 'border-stone-250 hover:border-stone-400'
                    }`}
                  >
                    {/* Left: Checkbox & Title Info */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <button
                        onClick={() => handleToggleComplete(item.id)}
                        className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition cursor-pointer shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-500 border-emerald-600 text-white'
                            : 'border-stone-300 hover:border-emerald-500 hover:bg-emerald-50 text-transparent hover:text-emerald-500'
                        }`}
                        title={isCompleted ? 'Tandai Belum Selesai' : 'Tandai Sudah Selesai'}
                      >
                        <Check size={14} className={isCompleted ? 'opacity-100' : 'opacity-0 hover:opacity-100'} />
                      </button>

                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Badges row */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Status / Timing Badge */}
                          {isOverdue && (
                            <span className="bg-rose-600 text-white text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 shadow-3xs">
                              <Flame size={11} className="fill-white" />
                              Terlewat
                            </span>
                          )}
                          {isToday && (
                            <span className="bg-amber-500 text-stone-950 text-[10px] font-mono px-2 py-0.5 rounded font-black uppercase tracking-wider shadow-3xs">
                              Hari Ini
                            </span>
                          )}
                          {isCompleted && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                              Selesai
                            </span>
                          )}

                          {/* Category Badge */}
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                            {item.category}
                          </span>

                          {/* Priority Badge */}
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${priorityBadge.bg} ${priorityBadge.text}`}>
                            {priorityBadge.label}
                          </span>

                          {/* Recurrence Badge */}
                          {item.recurrence && item.recurrence !== 'none' && (
                            <span className="text-[10px] font-mono bg-purple-50 text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Repeat size={10} />
                              {item.recurrence === 'daily' ? 'Harian' : item.recurrence === 'weekly' ? 'Mingguan' : 'Bulanan'}
                            </span>
                          )}

                          {/* Linked Voucher Code */}
                          {item.voucherCode && (
                            <span className="text-[10px] font-mono bg-stone-100 text-stone-800 border border-stone-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <FileText size={10} className="text-amber-600" />
                              {item.voucherCode}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h4 className={`text-sm font-black text-stone-900 ${isCompleted ? 'line-through text-stone-400' : ''}`}>
                          {item.title}
                        </h4>

                        {/* Description */}
                        {item.description && (
                          <p className={`text-xs text-stone-600 font-sans leading-relaxed ${isCompleted ? 'text-stone-400' : ''}`}>
                            {item.description}
                          </p>
                        )}

                        {/* Meta info: Due date, Assigned to, Completion info */}
                        <div className="flex items-center gap-3 pt-0.5 text-xs text-stone-500 font-mono flex-wrap">
                          <span className={`flex items-center gap-1 font-semibold ${isOverdue ? 'text-rose-600' : isToday ? 'text-amber-700' : 'text-stone-600'}`}>
                            <Clock size={12} />
                            Tenggat: {formatDateIndonesian(item.dueDate)} {item.dueTime ? `pukul ${item.dueTime}` : ''}
                          </span>

                          {item.assignedTo && (
                            <span className="flex items-center gap-1 text-stone-500">
                              <User size={12} />
                              PIC: {item.assignedTo}
                            </span>
                          )}

                          {isCompleted && item.completedAt && (
                            <span className="text-emerald-700 font-sans">
                              Diselesaikan: {formatDateIndonesian(item.completedAt.split('T')[0])} {item.completedBy ? `oleh ${item.completedBy}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Action Controls */}
                    <div className="flex items-center gap-1.5 sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                      {!isCompleted && (
                        <>
                          <button
                            onClick={() => handlePostpone(item.id, 1)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition cursor-pointer font-mono"
                            title="Tunda 1 Hari (+1 Hari)"
                          >
                            +1 Hari
                          </button>
                          <button
                            onClick={() => handlePostpone(item.id, 3)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition cursor-pointer font-mono"
                            title="Tunda 3 Hari (+3 Hari)"
                          >
                            +3 Hari
                          </button>
                        </>
                      )}

                      {linkedSub && onOpenSubmissionForPrint && (
                        <button
                          onClick={() => onOpenSubmissionForPrint(linkedSub)}
                          className="px-2.5 py-1.5 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-3xs"
                          title="Lihat Voucher Transaksi Terkait"
                        >
                          <FileText size={12} className="text-amber-600" />
                          <span>Voucher</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                        title="Edit Agenda"
                      >
                        <Edit3 size={14} />
                      </button>

                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                        title="Hapus Agenda"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* VIEW MODE 2: VISUAL MONTHLY CALENDAR GRID */}
      {viewMode === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Calendar View (2 Cols) */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-4">
            
            {/* Calendar Month Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-stone-900">
                  {monthNamesIndonesian[month]} {year}
                </h2>
                <button
                  onClick={() => setCalendarDate(new Date())}
                  className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-lg transition cursor-pointer font-mono"
                >
                  Hari Ini
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCalendarDate(new Date(year, month - 1, 1))}
                  className="p-2 hover:bg-stone-100 rounded-xl text-stone-600 transition cursor-pointer"
                  title="Bulan Sebelumnya"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setCalendarDate(new Date(year, month + 1, 1))}
                  className="p-2 hover:bg-stone-100 rounded-xl text-stone-600 transition cursor-pointer"
                  title="Bulan Berikutnya"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 gap-1 text-center font-mono font-bold text-xs text-stone-400 py-1 border-b border-stone-100">
              <span className="text-rose-500">Min</span>
              <span>Sen</span>
              <span>Sel</span>
              <span>Rab</span>
              <span>Kam</span>
              <span>Jum</span>
              <span className="text-amber-600">Sab</span>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {calendarDays.map((cell, idx) => {
                const dayItems = dateToItemsMap.get(cell.dateStr) || [];
                const isToday = cell.dateStr === todayStr;
                const isSelected = selectedDateFilter === cell.dateStr;
                const hasPending = dayItems.some(i => i.status === 'pending');
                const hasOverdue = dayItems.some(i => i.status === 'pending' && i.dueDate < todayStr);

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDateFilter(cell.dateStr)}
                    className={`min-h-[80px] sm:min-h-[95px] p-1.5 rounded-xl border flex flex-col justify-between transition cursor-pointer ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-400'
                        : isToday
                        ? 'border-amber-300 bg-amber-50/20'
                        : cell.isCurrentMonth
                        ? 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50/50'
                        : 'border-stone-100 bg-stone-50/50 text-stone-300 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-mono font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-amber-500 text-stone-950 font-black' : isSelected ? 'bg-stone-900 text-white' : ''
                      }`}>
                        {cell.dayNum}
                      </span>

                      {hasOverdue && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Ada agenda terlambat"></span>
                      )}
                    </div>

                    {/* Task Pills on Date */}
                    <div className="space-y-0.5 overflow-hidden mt-1">
                      {dayItems.slice(0, 2).map(item => {
                        const isDone = item.status === 'completed';
                        return (
                          <div
                            key={item.id}
                            className={`text-[9px] font-sans truncate px-1 py-0.5 rounded font-medium ${
                              isDone
                                ? 'bg-emerald-100 text-emerald-800 line-through opacity-70'
                                : item.priority === 'tinggi'
                                ? 'bg-rose-100 text-rose-900 font-bold'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                            title={item.title}
                          >
                            {item.title}
                          </div>
                        );
                      })}
                      {dayItems.length > 2 && (
                        <div className="text-[9px] text-stone-400 font-mono font-bold pl-0.5">
                          +{dayItems.length - 2} lagi
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>

          </div>

          {/* Inspector Pane for Selected Date (1 Col) */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-3">
                <div>
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider block">
                    Agenda Terpilih:
                  </span>
                  <h3 className="text-sm font-black text-stone-900 mt-0.5">
                    {selectedDateFilter ? formatDateIndonesian(selectedDateFilter) : 'Pilih Tanggal'}
                  </h3>
                </div>
                <button
                  onClick={() => handleOpenAddModal(selectedDateFilter || todayStr)}
                  className="p-2 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl text-xs font-bold transition cursor-pointer shadow-3xs flex items-center gap-1"
                  title="Tambah Agenda Pada Tanggal Ini"
                >
                  <Plus size={14} />
                  <span className="text-[11px]">Tambah</span>
                </button>
              </div>

              {selectedDateItems.length === 0 ? (
                <div className="py-12 text-center text-stone-400 space-y-2">
                  <CalendarIcon size={32} className="mx-auto text-stone-300" />
                  <p className="text-xs">Tidak ada kegiatan yang dijadwalkan pada tanggal ini.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {selectedDateItems.map(item => {
                    const isDone = item.status === 'completed';
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border transition ${
                          isDone 
                            ? 'bg-stone-50 border-stone-200 opacity-75' 
                            : item.priority === 'tinggi' 
                            ? 'bg-rose-50/40 border-rose-200' 
                            : 'bg-stone-50/50 border-stone-200'
                        }`}
                      >
                        <div className="flex items-start gap-2 justify-between">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <button
                              onClick={() => handleToggleComplete(item.id)}
                              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition cursor-pointer shrink-0 ${
                                isDone ? 'bg-emerald-500 border-emerald-600 text-white' : 'border-stone-300'
                              }`}
                            >
                              <Check size={10} className={isDone ? 'opacity-100' : 'opacity-0'} />
                            </button>
                            <div className="min-w-0 flex-1">
                              <h4 className={`text-xs font-bold text-stone-900 leading-snug ${isDone ? 'line-through text-stone-400' : ''}`}>
                                {item.title}
                              </h4>
                              <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-stone-400 flex-wrap">
                                <span className="bg-white px-1 rounded border border-stone-200 text-stone-700">
                                  {item.category}
                                </span>
                                {item.dueTime && <span>{item.dueTime}</span>}
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1 text-stone-400 hover:text-stone-700 rounded transition cursor-pointer"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-stone-100">
              <button
                onClick={() => handleOpenAddModal(selectedDateFilter || todayStr)}
                className="w-full py-2 bg-stone-100 hover:bg-amber-100 hover:text-amber-900 border border-stone-200 text-stone-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus size={14} />
                <span>Tambah Agenda di {selectedDateFilter ? selectedDateFilter : 'Hari Ini'}</span>
              </button>
            </div>

          </div>

        </div>
      )}

      {/* MODAL FORM TAMBAH / EDIT AGENDA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col font-sans">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-stone-900 text-white border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500 rounded-xl text-stone-950">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight text-white">
                    {editingItem ? 'Edit Agenda Kegiatan' : 'Tambah Agenda Pekerjaan Baru'}
                  </h3>
                  <p className="text-[10px] text-stone-300 font-mono">
                    Pengingat otomatis pada dashboard &amp; banner
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveItem} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {/* Judul Kegiatan */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Judul Pekerjaan / Kegiatan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pembayaran Pajak PPh 21 / 23 Masa Ini"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans font-medium"
                />
              </div>

              {/* Rincian / Catatan */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Rincian / Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan dokumen pendukung, nomor rekening, atau instruksi..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans"
                />
              </div>

              {/* Grid 2 Cols: Kategori & Prioritas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Kategori <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as AgendaCategory)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans"
                  >
                    <option value="Keuangan">Keuangan</option>
                    <option value="Pajak">Pajak</option>
                    <option value="Penggajian">Penggajian</option>
                    <option value="SPPD & Lapangan">SPPD &amp; Lapangan</option>
                    <option value="Vendor & Tagihan">Vendor &amp; Tagihan</option>
                    <option value="Operasional">Operasional</option>
                    <option value="Administrasi">Administrasi</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Tingkat Prioritas <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as AgendaPriority)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans"
                  >
                    <option value="tinggi">Tinggi (Penting &amp; Mendesak)</option>
                    <option value="sedang">Sedang (Standar)</option>
                    <option value="normal">Normal (Rutin)</option>
                  </select>
                </div>
              </div>

              {/* Grid 2 Cols: Tanggal Jatuh Tempo & Jam */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Tanggal Jatuh Tempo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Jam Pengingat (Opsional)
                  </label>
                  <input
                    type="time"
                    value={formDueTime}
                    onChange={(e) => setFormDueTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Grid 2 Cols: Pengulangan & PIC */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Pengulangan Rutin
                  </label>
                  <select
                    value={formRecurrence}
                    onChange={(e) => setFormRecurrence(e.target.value as AgendaRecurrence)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans"
                  >
                    <option value="none">Sekali Saja</option>
                    <option value="daily">Harian</option>
                    <option value="weekly">Mingguan</option>
                    <option value="monthly">Bulanan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Penanggung Jawab (PIC)
                  </label>
                  <input
                    type="text"
                    placeholder="Nama staf PIC"
                    value={formAssignedTo}
                    onChange={(e) => setFormAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-sans"
                  />
                </div>
              </div>

              {/* Hubungkan ke Kode Voucher HO */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Hubungkan ke Kode Transaksi Voucher HO (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Ketik kode voucher, misal: BKK-001/HO/2026 atau pilih..."
                  value={formVoucherCode}
                  onChange={(e) => setFormVoucherCode(e.target.value)}
                  list="voucher-code-suggestions"
                  className="w-full px-3.5 py-2 text-xs bg-stone-50 border border-stone-250 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                />
                <datalist id="voucher-code-suggestions">
                  {submissions.slice(0, 30).map(s => (
                    <option key={s.id} value={s.kode}>
                      {s.kode} - {s.dibayarkanKepada} ({s.jenisPengajuan})
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-black bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl transition cursor-pointer shadow-xs active:scale-95"
                >
                  {editingItem ? 'Simpan Perubahan' : 'Tambahkan ke Agenda'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}

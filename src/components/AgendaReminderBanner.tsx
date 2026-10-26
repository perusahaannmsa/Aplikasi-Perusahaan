import React, { useState } from 'react';
import { AgendaItem } from '../types';
import { 
  Bell, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  ArrowRight,
  Flame,
  Layers,
  Sparkles,
  Volume2,
  VolumeX,
  Play
} from 'lucide-react';
import { formatDateIndonesian } from '../utils';
import { agendaSound } from '../utils/agendaAudioAlert';

interface AgendaReminderBannerProps {
  agendaItems: AgendaItem[];
  onToggleComplete: (id: string) => void;
  onOpenAgendaView: () => void;
  onPostponeOneDay: (id: string) => void;
  onTriggerAlarmItem?: (item: AgendaItem) => void;
}

export function AgendaReminderBanner({
  agendaItems,
  onToggleComplete,
  onOpenAgendaView,
  onPostponeOneDay,
  onTriggerAlarmItem
}: AgendaReminderBannerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [soundActive, setSoundActive] = useState(() => agendaSound.isEnabled());

  const todayStr = new Date().toISOString().split('T')[0];

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    agendaSound.setEnabled(next);
    if (next) {
      agendaSound.playMelody();
    }
  };

  const handleTestSound = () => {
    if (!agendaSound.isEnabled()) {
      agendaSound.setEnabled(true);
      setSoundActive(true);
    }
    agendaSound.playMelody();
  };

  // Pending tasks that are due today or overdue
  const dueItems = agendaItems.filter(item => {
    if (item.status === 'completed') return false;
    return item.dueDate <= todayStr;
  }).sort((a, b) => {
    // Overdue first, then by priority (tinggi > sedang > normal)
    if (a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    const priorityWeight = { tinggi: 3, sedang: 2, normal: 1 };
    return (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1);
  });

  const overdueCount = dueItems.filter(item => item.dueDate < todayStr).length;
  const todayCount = dueItems.filter(item => item.dueDate === todayStr).length;

  if (dueItems.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-linear-to-r from-amber-500 via-amber-600 to-rose-600 text-white shadow-lg border-b border-amber-600 print:hidden transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        
        {/* Banner Header Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xs shrink-0 shadow-xs">
              <Bell size={18} className="text-white animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white ring-2 ring-amber-600">
                {dueItems.length}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0">
              <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white flex items-center gap-1.5">
                <span>Pengingat Pekerjaan &amp; Agenda Aktif</span>
                {overdueCount > 0 && (
                  <span className="bg-rose-700/90 text-rose-100 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                    <Flame size={11} className="fill-rose-300 text-rose-300" />
                    {overdueCount} Terlewat
                  </span>
                )}
                {todayCount > 0 && (
                  <span className="bg-amber-800/80 text-amber-100 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    {todayCount} Hari Ini
                  </span>
                )}
              </span>
              <span className="text-[11px] text-amber-100/90 hidden md:inline truncate">
                Ada {dueItems.length} pekerjaan yang perlu diselesaikan. Pengingat ini akan tetap muncul sampai ditandai selesai.
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggleSound}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                soundActive ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-rose-900/60 hover:bg-rose-900/80 text-rose-200'
              }`}
              title={soundActive ? 'Suara Musik Pengingat Aktif (Klik untuk Membisukan)' : 'Suara Musik Dibisukan (Klik untuk Mengaktifkan)'}
            >
              {soundActive ? <Volume2 size={14} className="animate-pulse text-amber-200" /> : <VolumeX size={14} />}
              <span className="hidden md:inline text-[11px]">{soundActive ? 'Musik Aktif' : 'Musik Bisu'}</span>
            </button>

            <button
              onClick={handleTestSound}
              className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-white transition cursor-pointer text-xs font-bold flex items-center gap-1.5"
              title="Uji Putar Melodi / Musik Pengingat"
            >
              <Play size={12} className="text-amber-200 fill-amber-200" />
              <span className="hidden sm:inline text-[11px]">Tes Nada</span>
            </button>

            <button
              onClick={onOpenAgendaView}
              className="flex items-center gap-1.5 bg-white text-stone-900 hover:bg-amber-50 font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-xs active:scale-95"
            >
              <Calendar size={13} className="text-amber-600" />
              <span className="hidden sm:inline">Buka Agenda Lengkap</span>
              <span className="sm:hidden">Agenda</span>
              <ArrowRight size={13} className="text-stone-500" />
            </button>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-white transition cursor-pointer"
              title={isExpanded ? 'Sembunyikan Rincian' : 'Tampilkan Rincian'}
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Collapsible Due Items List Preview */}
        {isExpanded && (
          <div className="mt-2.5 pt-2.5 border-t border-white/20 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {dueItems.slice(0, 6).map((item) => {
                const isOverdue = item.dueDate < todayStr;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-xl backdrop-blur-xs transition border ${
                      isOverdue 
                        ? 'bg-rose-950/40 border-rose-400/40 hover:bg-rose-950/60' 
                        : 'bg-stone-900/30 border-amber-300/30 hover:bg-stone-900/40'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <button
                        onClick={() => onToggleComplete(item.id)}
                        className="mt-0.5 w-5 h-5 rounded-md border-2 border-white/70 hover:border-emerald-400 hover:bg-emerald-500/30 flex items-center justify-center transition cursor-pointer shrink-0 group"
                        title="Tandai Sudah Dikerjakan / Selesai"
                      >
                        <Check size={12} className="opacity-0 group-hover:opacity-100 text-emerald-300" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
                            item.priority === 'tinggi' ? 'bg-rose-500 text-white' :
                            item.priority === 'sedang' ? 'bg-amber-400 text-stone-950' : 'bg-stone-200 text-stone-800'
                          }`}>
                            {item.priority}
                          </span>
                          <span className="text-[10px] font-mono text-amber-200 opacity-90 truncate">
                            [{item.category}]
                          </span>
                          {item.voucherCode && (
                            <span className="text-[9px] font-mono bg-white/20 px-1 rounded text-white truncate">
                              {item.voucherCode}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-white truncate mt-0.5" title={item.title}>
                          {item.title}
                        </h4>

                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-amber-100/80 font-mono">
                          <span className={`flex items-center gap-1 font-semibold ${isOverdue ? 'text-rose-200' : 'text-amber-200'}`}>
                            <Clock size={10} />
                            {isOverdue ? 'Terlewat: ' : 'Jatuh tempo: '}
                            {formatDateIndonesian(item.dueDate)}
                            {item.dueTime ? ` (${item.dueTime})` : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons on card */}
                    <div className="flex items-center gap-1 shrink-0">
                      {onTriggerAlarmItem && (
                        <button
                          onClick={() => onTriggerAlarmItem(item)}
                          className="p-1.5 bg-white/20 hover:bg-white/35 text-white rounded-lg transition cursor-pointer"
                          title="Bunyikan Alarm & Buka Pengingat Agenda"
                        >
                          <Bell size={12} className="text-amber-200" />
                        </button>
                      )}
                      <button
                        onClick={() => onPostponeOneDay(item.id)}
                        className="px-2 py-1 text-[10px] font-semibold bg-white/10 hover:bg-white/20 rounded-lg text-amber-100 transition cursor-pointer"
                        title="Tunda 1 Hari (+1 Hari)"
                      >
                        +1 Hari
                      </button>
                      <button
                        onClick={() => onToggleComplete(item.id)}
                        className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition cursor-pointer shadow-2xs"
                        title="Tandai Selesai"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {dueItems.length > 6 && (
              <div className="text-center pt-1">
                <button
                  onClick={onOpenAgendaView}
                  className="text-xs text-amber-100 hover:text-white underline font-semibold cursor-pointer"
                >
                  +{dueItems.length - 6} tugas lainnya di menu Agenda &amp; Kalender &rarr;
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

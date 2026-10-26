import React, { useState, useEffect } from 'react';
import { AgendaItem } from '../types';
import { 
  Bell, 
  Volume2, 
  VolumeX, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  Clock3, 
  ArrowRight, 
  X, 
  Play, 
  Check, 
  Sparkles,
  Sliders,
  Flame,
  User,
  Tag
} from 'lucide-react';
import { agendaSound, SoundMelodyType } from '../utils/agendaAudioAlert';
import { formatDateIndonesian } from '../utils';

interface AgendaAlarmModalProps {
  activeAlarmItem: AgendaItem | null;
  onDismiss: () => void;
  onSnooze: (id: string, minutes: number) => void;
  onComplete: (id: string) => void;
  onOpenAgendaView: () => void;
}

export const AgendaAlarmModal: React.FC<AgendaAlarmModalProps> = ({
  activeAlarmItem,
  onDismiss,
  onSnooze,
  onComplete,
  onOpenAgendaView
}) => {
  const [isMuted, setIsMuted] = useState(() => !agendaSound.isEnabled());
  const [volume, setVolume] = useState(() => agendaSound.getVolume());
  const [selectedMelody, setSelectedMelody] = useState<SoundMelodyType>(() => agendaSound.getMelody());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (activeAlarmItem) {
      // Start sounding the alert loop
      agendaSound.startAlertLoop(selectedMelody);
    } else {
      agendaSound.stopAlert();
    }

    return () => {
      agendaSound.stopAlert();
    };
  }, [activeAlarmItem]);

  if (!activeAlarmItem) return null;

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    agendaSound.setEnabled(!next);
    if (next) {
      agendaSound.stopAlert();
    } else {
      agendaSound.startAlertLoop(selectedMelody);
    }
  };

  const handleMelodyChange = (melody: SoundMelodyType) => {
    setSelectedMelody(melody);
    agendaSound.setMelody(melody);
    agendaSound.playMelody(melody);
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    agendaSound.setVolume(newVol);
  };

  const handleDismissSoundOnly = () => {
    agendaSound.stopAlert();
    onDismiss();
  };

  const handleSnooze = (minutes: number) => {
    agendaSound.stopAlert();
    onSnooze(activeAlarmItem.id, minutes);
  };

  const handleComplete = () => {
    agendaSound.stopAlert();
    onComplete(activeAlarmItem.id);
  };

  const handleOpenFull = () => {
    agendaSound.stopAlert();
    onOpenAgendaView();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border-2 border-amber-400/80 overflow-hidden text-slate-900 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Ribbon / Alarm Pulse */}
        <div className="bg-gradient-to-r from-amber-500 via-rose-500 to-amber-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 shrink-0 shadow-inner">
              <Bell size={24} className="text-white animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-400"></span>
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/25 text-amber-200 font-bold inline-block mb-0.5">
                🔔 PENGINGAT AGENDA KERJA
              </span>
              <h3 className="text-base sm:text-lg font-black tracking-tight font-display text-white">
                Waktu Agenda Telah Tiba!
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToggleMute}
              className={`p-2 rounded-xl transition cursor-pointer ${
                isMuted 
                  ? 'bg-rose-700 text-rose-200 hover:bg-rose-800' 
                  : 'bg-white/20 hover:bg-white/30 text-white'
              }`}
              title={isMuted ? 'Nyalakan Suara Musik' : 'Matikan Suara Musik'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="animate-pulse" />}
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 bg-white/15 hover:bg-white/25 rounded-xl text-white transition cursor-pointer"
              title="Pengaturan Nada & Musik"
            >
              <Sliders size={18} />
            </button>

            <button
              onClick={handleDismissSoundOnly}
              className="p-2 bg-white/15 hover:bg-white/25 rounded-xl text-white transition cursor-pointer ml-1"
              title="Tutup Notifikasi"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Audio / Tone Settings Drawer */}
        {showSettings && (
          <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-3.5 space-y-3 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-600" />
                Pilihan Nada / Musik Pengingat
              </span>
              <button
                onClick={() => agendaSound.playMelody(selectedMelody)}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                <Play size={11} /> Uji Suara
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'melodi_lembut', label: 'Melodi Lembut' },
                { id: 'lonceng_agenda', label: 'Lonceng Kristal' },
                { id: 'alarm_ringkas', label: 'Alarm Dinamis' },
                { id: 'marimba', label: 'Marimba Arpeggio' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => handleMelodyChange(m.id as SoundMelodyType)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer text-left ${
                    selectedMelody === m.id
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-stone-700 border-amber-200 hover:bg-amber-100/60'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <span className="text-[11px] text-amber-900 font-medium shrink-0">Volume Suara:</span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <span className="text-[11px] font-mono text-amber-950 font-bold shrink-0">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Main Title & Badges */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full font-bold tracking-wider ${
                activeAlarmItem.priority === 'tinggi' 
                  ? 'bg-rose-600 text-white' 
                  : activeAlarmItem.priority === 'sedang' 
                    ? 'bg-amber-500 text-stone-950' 
                    : 'bg-stone-200 text-stone-800'
              }`}>
                Prioritas {activeAlarmItem.priority}
              </span>

              <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                {activeAlarmItem.category}
              </span>

              {activeAlarmItem.voucherCode && (
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                  {activeAlarmItem.voucherCode}
                </span>
              )}
            </div>

            <h4 className="text-xl sm:text-2xl font-black text-slate-900 font-display leading-tight">
              {activeAlarmItem.title}
            </h4>

            {activeAlarmItem.description && (
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">
                {activeAlarmItem.description}
              </p>
            )}
          </div>

          {/* Time & Assignment Info */}
          <div className="grid grid-cols-2 gap-3 bg-gradient-to-br from-amber-50/70 to-rose-50/70 p-3.5 rounded-2xl border border-amber-200/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/15 text-amber-700 rounded-xl">
                <Clock size={16} />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-amber-900 tracking-wider">Jadwal Agenda</p>
                <p className="text-xs font-mono font-bold text-slate-900">
                  {activeAlarmItem.dueTime ? `${activeAlarmItem.dueTime} WIB` : 'Hari Ini'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-500/15 text-rose-700 rounded-xl">
                <User size={16} />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-rose-900 tracking-wider">Penanggung Jawab</p>
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {activeAlarmItem.assignedTo || 'Tim Operasional'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleSnooze(10)}
              className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              title="Bunyikan kembali dalam 10 menit"
            >
              <Clock3 size={14} className="text-slate-500" />
              <span>Tunda 10 Menit</span>
            </button>

            <button
              onClick={handleComplete}
              className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              title="Tandai pekerjaan ini selesai"
            >
              <Check size={14} />
              <span>Selesai Sekarang</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleOpenFull}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>Buka Agenda</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

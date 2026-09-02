import React, { useState, useEffect } from 'react';
import { Clock, Calendar as CalendarIcon, Sparkles } from 'lucide-react';

interface LiveClockProps {
  className?: string;
  showSeconds?: boolean;
  variant?: 'compact' | 'full' | 'badge';
}

const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDONESIAN_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const INDONESIAN_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

export const LiveClock: React.FC<LiveClockProps> = ({
  className = '',
  showSeconds = true,
  variant = 'badge'
}) => {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const dayName = INDONESIAN_DAYS[time.getDay()];
  const dateNum = time.getDate();
  const monthName = INDONESIAN_MONTHS[time.getMonth()];
  const monthNameShort = INDONESIAN_MONTHS_SHORT[time.getMonth()];
  const year = time.getFullYear();

  const hours = String(time.getHours()).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');

  const isWeekend = time.getDay() === 0 || time.getDay() === 6;

  if (variant === 'compact') {
    return (
      <div
        id="live-clock-compact"
        className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold text-stone-700 bg-stone-100/90 px-2.5 py-1 rounded-xl border border-stone-250 select-none ${className}`}
        title={`Waktu Sistem: ${dayName}, ${dateNum} ${monthName} ${year} • ${hours}:${minutes}:${seconds} WIB`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
        <span className="text-stone-900 font-sans font-semibold">{dayName}, {dateNum} {monthNameShort}</span>
        <span className="text-stone-400 font-normal">|</span>
        <span className="text-amber-700 font-mono tracking-tight font-black">
          {hours}:{minutes}{showSeconds && <span className="text-stone-500 text-[10px]">:{seconds}</span>}
        </span>
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div
        id="live-clock-full"
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white rounded-2xl border border-stone-750 shadow-md ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <CalendarIcon size={18} />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1.5">
              <span>{isWeekend ? 'Akhir Pekan' : 'Hari Kerja Operasional'}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-sm font-black text-white font-sans">
              {dayName}, {dateNum} {monthName} {year}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-black/40 px-3.5 py-1.5 rounded-xl border border-white/10 font-mono">
          <Clock size={15} className="text-emerald-400 animate-pulse" />
          <span className="text-base sm:text-lg font-black text-amber-300 tracking-wider">
            {hours}:{minutes}
            {showSeconds && <span className="text-xs text-stone-300 font-bold">:{seconds}</span>}
          </span>
          <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
            WIB
          </span>
        </div>
      </div>
    );
  }

  // Default: Variant 'badge' for Header / Navbar
  return (
    <div
      id="live-clock-header"
      className={`inline-flex items-center gap-2 py-1 px-2.5 sm:px-3 rounded-2xl bg-stone-50/95 hover:bg-stone-100/90 border border-stone-200/90 shadow-3xs transition-all cursor-default select-none ${className}`}
      title={`Waktu Operasional HO: ${dayName}, ${dateNum} ${monthName} ${year} • ${hours}:${minutes}:${seconds} WIB`}
    >
      <div className="flex items-center gap-1.5 text-stone-800">
        <div className="relative flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping absolute opacity-75" />
          <span className="w-2 h-2 rounded-full bg-emerald-500 relative" />
        </div>
        <Clock size={13} className="text-amber-600 hidden xs:inline shrink-0" />
      </div>

      <div className="flex items-center gap-1.5 text-xs font-mono leading-none">
        {/* Day & Date */}
        <span className="font-sans font-bold text-stone-850 text-[11px] sm:text-xs">
          <span className="font-black text-stone-900">{dayName}</span>,{' '}
          <span className="hidden sm:inline">{dateNum} {monthName} {year}</span>
          <span className="sm:hidden">{dateNum} {monthNameShort}</span>
        </span>

        <span className="text-stone-300 font-light">|</span>

        {/* Live Clock with Seconds */}
        <span className="font-mono font-black text-stone-950 tracking-tight text-xs flex items-center gap-0.5">
          <span className="text-amber-800 font-extrabold">{hours}:{minutes}</span>
          {showSeconds && (
            <span className="text-[10px] text-stone-500 font-medium font-mono">
              :{seconds}
            </span>
          )}
          <span className="text-[9px] font-bold text-stone-400 ml-0.5 hidden md:inline">
            WIB
          </span>
        </span>
      </div>
    </div>
  );
};

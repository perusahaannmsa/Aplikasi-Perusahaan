import React from 'react';
import { X, Check, Sparkles, Palette, Crown, Moon, Gem, Terminal, Zap, Shield, Eye } from 'lucide-react';

export type AppTheme = 'classic' | 'gold-dark' | 'emerald' | 'slate';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: AppTheme;
  onSelectTheme: (theme: AppTheme) => void;
}

interface ThemeConfig {
  id: AppTheme;
  name: string;
  subtitle: string;
  badge: string;
  icon: React.ReactNode;
  accentColor: string;
  bgPreview: string;
  borderPreview: string;
  badgeBg: string;
  badgeText: string;
  description: string;
  fontStyle: string;
  borderFeature: string;
  animationFeature: string;
  boxFeature: string;
  previewTags: string[];
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  if (!isOpen) return null;

  const themes: ThemeConfig[] = [
    {
      id: 'classic',
      name: 'Royal Nusantara Heritage',
      subtitle: 'Klasik Gading & Emas Tradisional',
      badge: 'WARISAN RESMI',
      icon: <Crown className="w-5 h-5 text-amber-600 animate-float-gentle" />,
      accentColor: '#D4AF37',
      bgPreview: 'from-[#faf7f0] to-[#f4eee1]',
      borderPreview: 'border-2 border-[#d4af37]/60 outline outline-1 outline-[#d4af37]/30 shadow-md',
      badgeBg: 'bg-amber-100/90 border border-amber-300 text-amber-900',
      badgeText: 'text-amber-900',
      description: 'Gaya kemewahan korporat Nusantara dengan nuansa gading hangat, bordir filigri emas, dan tipografi prestisius.',
      fontStyle: 'Cinzel Serif & Outfit Eksekutif',
      borderFeature: 'Bordir Ganda Filigri Emas 24K',
      animationFeature: 'Kilau Cahaya Emas Bergulir (Gold Shimmer)',
      boxFeature: 'Sudut Klasik Bertekstur Kertas Bersegel',
      previewTags: ['Elegan', 'Bordir Ganda', 'Ivory Warm', 'Resmi HO']
    },
    {
      id: 'gold-dark',
      name: 'Midnight Obsidian 24K',
      subtitle: 'Karbon Mewah Gelap & Neon Emas',
      badge: 'ULTRA LUXURY',
      icon: <Moon className="w-5 h-5 text-amber-400 animate-pulse" />,
      accentColor: '#fbbf24',
      bgPreview: 'from-[#07070a] to-[#121217]',
      borderPreview: 'border border-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.35)]',
      badgeBg: 'bg-amber-500/20 border border-amber-400/50 text-amber-300',
      badgeText: 'text-amber-300',
      description: 'Latar hitam obsidian dengan kaca gelap (glassmorphism), kontras tajam, dan pendaran garis neon emas 24 karat.',
      fontStyle: 'Outfit Bold dengan Tracking Lebar',
      borderFeature: 'Garis Neon Emas Berpendar (Neon Halo)',
      animationFeature: 'Denyut Aura Emas Malam (Neon Pulse)',
      boxFeature: 'Kaca Gelap Karbon Tembus Pandang',
      previewTags: ['Dark Mode', 'Neon Glow', 'Glassmorphism', 'Misterius']
    },
    {
      id: 'emerald',
      name: 'Imperial Jade Mineral',
      subtitle: 'Zamrud Hijau Kristal Mineral',
      badge: 'SEGAR & LESTARI',
      icon: <Gem className="w-5 h-5 text-emerald-600 animate-pulse" />,
      accentColor: '#059669',
      bgPreview: 'from-[#f1f9f4] to-[#e5f8ee]',
      borderPreview: 'border-2 border-emerald-400/60 shadow-[0_8px_25px_rgba(5,150,105,0.22)]',
      badgeBg: 'bg-emerald-100 border border-emerald-300 text-emerald-900',
      badgeText: 'text-emerald-900',
      description: 'Melambangkan kekayaan mineral alam Nusantara dengan nuansa zamrud sejuk, kontur membulat ekstra halus, dan ketenangan kerja.',
      fontStyle: 'Plus Jakarta Sans Organik Dinamis',
      borderFeature: 'Kurva Halus Batu Kerikil (Pebble-Smooth 28px)',
      animationFeature: 'Napas Aura Kristal Zamrud (Jade Breathe)',
      boxFeature: 'Kotak Membulat Organik Lembut Tanpa Sudut Tajam',
      previewTags: ['Mineral Alam', 'Pebble Curves', 'Zamrud Sejuk', 'Menenangkan']
    },
    {
      id: 'slate',
      name: 'Titanium Cyber Terminal',
      subtitle: 'Siber HUD Futuristik & Laser Azure',
      badge: 'HIGH TECH HUD',
      icon: <Terminal className="w-5 h-5 text-cyan-400" />,
      accentColor: '#06b6d4',
      bgPreview: 'from-[#03060f] to-[#0a1120]',
      borderPreview: 'border border-cyan-400/60 shadow-[0_0_24px_rgba(6,182,212,0.38)]',
      badgeBg: 'bg-cyan-500/20 border border-cyan-400/50 text-cyan-300',
      badgeText: 'text-cyan-300',
      description: 'Terminal pusat komando operasional masa depan dengan sudut bersiku teknis, aksen laser biru elektrik, dan tipografi kode monospace.',
      fontStyle: 'JetBrains Mono Teknis & Monospace',
      borderFeature: 'Sudut Bracket Teknologis (┌ ┐ HUD Frame)',
      animationFeature: 'Sapuan Garis Laser Horizontal (Cyber Scanline)',
      boxFeature: 'Panel Modular Futuristik dengan Garis Indikator',
      previewTags: ['Cyberpunk', 'Monospace', 'Laser HUD', 'High-Tech']
    }
  ];

  return (
    <div className="fixed inset-0 z-[1200] overflow-y-auto flex items-center justify-center p-3 sm:p-5 bg-stone-950/75 backdrop-blur-md animate-fade-in print:hidden">
      <div 
        className="relative bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative Header Ribbon */}
        <div className="h-1.5 w-full border-header-gradient" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50/70 dark:bg-stone-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400">
              <Palette className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold tracking-widest text-amber-600 dark:text-amber-400 uppercase bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  ESTETIKA &amp; KARAKTER VISUAL
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-stone-500">
                  <Sparkles size={11} className="text-amber-500" />
                  <span>4 Tema Khusus</span>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-stone-100 font-sans tracking-tight">
                Pilih Tema Tampilan Aplikasi NMSA
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition cursor-pointer"
            title="Tutup Modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - 4 Cards Grid */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed font-sans">
            Setiap tema didesain dengan harmoni warna, bordir bingkai, tipografi, kotak kartu, serta animasi yang memiliki karakter unik dan estetika tinggi. Klik kartu untuk langsung menerapkan tema.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {themes.map((t) => {
              const isSelected = currentTheme === t.id;

              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTheme(t.id)}
                  className={`relative rounded-2xl p-4 sm:p-5 transition-all duration-200 cursor-pointer text-left flex flex-col justify-between group overflow-hidden ${
                    isSelected 
                      ? 'ring-2 ring-amber-500 dark:ring-amber-400 shadow-xl scale-[1.01]' 
                      : 'hover:scale-[1.01] hover:shadow-lg'
                  } ${t.id === 'gold-dark' || t.id === 'slate' ? 'text-stone-100' : 'text-stone-900'}`}
                  style={{
                    background: t.id === 'classic' 
                      ? 'linear-gradient(145deg, #fffcf7 0%, #faf3e5 100%)'
                      : t.id === 'gold-dark'
                      ? 'linear-gradient(145deg, #0f0f14 0%, #171720 100%)'
                      : t.id === 'emerald'
                      ? 'linear-gradient(145deg, #f7fdf9 0%, #e8f7ee 100%)'
                      : 'linear-gradient(145deg, #070e1c 0%, #0f1c34 100%)'
                  }}
                >
                  {/* Outer Theme Border Wrapper */}
                  <div className={`absolute inset-0 rounded-2xl pointer-events-none transition-all ${
                    isSelected ? t.borderPreview : 'border border-stone-300 dark:border-stone-700'
                  }`} />

                  {/* Header in Card */}
                  <div className="relative z-10 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-xl bg-white/80 dark:bg-stone-900/80 shadow-xs border border-stone-200/50 dark:border-stone-700/50">
                          {t.icon}
                        </div>
                        <div>
                          <span className={`text-[9px] font-mono font-black tracking-wider uppercase px-2 py-0.5 rounded-full ${t.badgeBg}`}>
                            {t.badge}
                          </span>
                          <h3 className="text-sm font-black tracking-tight mt-0.5 font-sans">
                            {t.name}
                          </h3>
                        </div>
                      </div>

                      {/* Selected Indicator */}
                      {isSelected ? (
                        <div className="flex items-center gap-1 bg-amber-500 text-stone-950 font-black text-[11px] font-mono px-2.5 py-1 rounded-full shadow-sm">
                          <Check size={13} className="stroke-[3]" />
                          <span>AKTIF</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-stone-400 group-hover:text-amber-500 transition">
                          Pilih ➔
                        </span>
                      )}
                    </div>

                    <p className={`text-[11px] leading-relaxed line-clamp-2 ${
                      t.id === 'gold-dark' || t.id === 'slate' ? 'text-stone-300' : 'text-stone-600'
                    }`}>
                      {t.description}
                    </p>
                  </div>

                  {/* Specs & Characteristics Box */}
                  <div className="relative z-10 mt-3 pt-3 border-t border-stone-200/60 dark:border-stone-750/60 space-y-1.5 text-[10px] font-mono">
                    <div className="flex items-start gap-1.5">
                      <span className="text-stone-400 shrink-0">Bordir:</span>
                      <span className="font-bold truncate">{t.borderFeature}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-stone-400 shrink-0">Huruf:</span>
                      <span className="font-bold truncate">{t.fontStyle}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-stone-400 shrink-0">Animasi:</span>
                      <span className="font-bold truncate text-amber-600 dark:text-amber-400">{t.animationFeature}</span>
                    </div>
                  </div>

                  {/* Tag Pills */}
                  <div className="relative z-10 mt-3 flex flex-wrap gap-1">
                    {t.previewTags.map((tag, i) => (
                      <span 
                        key={i}
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-md ${
                          t.id === 'gold-dark' || t.id === 'slate' 
                            ? 'bg-stone-800/90 text-stone-300 border border-stone-700' 
                            : 'bg-white/90 text-stone-700 border border-stone-250 shadow-3xs'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-stone-500">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-amber-500 shrink-0" />
            <span>Pilihan tema disimpan otomatis di memori peramban Anda.</span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition cursor-pointer font-mono shadow-md"
          >
            Terapkan &amp; Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

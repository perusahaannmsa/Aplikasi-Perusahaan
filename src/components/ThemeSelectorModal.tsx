import React, { useState } from 'react';
import { X, Check, Sparkles, Palette, Crown, Moon, Gem, Terminal, Sun, Snowflake, Zap, Coffee, Shield } from 'lucide-react';

export type AppTheme = 'classic' | 'gold-dark' | 'emerald' | 'slate' | 'sunset' | 'nordic' | 'cyberpunk' | 'cozy';

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
  category: 'corporate' | 'casual' | 'minimal' | 'cyber';
  icon: React.ReactNode;
  accentColor: string;
  bgGradient: string;
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
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'corporate' | 'casual' | 'minimal' | 'cyber'>('all');

  if (!isOpen) return null;

  const themes: ThemeConfig[] = [
    {
      id: 'classic',
      name: 'Royal Nusantara Heritage',
      subtitle: 'Klasik Gading & Emas Tradisional',
      badge: 'WARISAN RESMI',
      category: 'corporate',
      icon: <Crown className="w-5 h-5 text-amber-600 animate-float-gentle" />,
      accentColor: '#D4AF37',
      bgGradient: 'linear-gradient(145deg, #fffcf7 0%, #faf3e5 100%)',
      borderPreview: 'border-2 border-[#d4af37]/70 outline outline-1 outline-[#d4af37]/30 shadow-md',
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
      category: 'corporate',
      icon: <Moon className="w-5 h-5 text-amber-400 animate-pulse" />,
      accentColor: '#fbbf24',
      bgGradient: 'linear-gradient(145deg, #0f0f14 0%, #171720 100%)',
      borderPreview: 'border border-amber-400/70 shadow-[0_0_24px_rgba(245,158,11,0.4)]',
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
      category: 'corporate',
      icon: <Gem className="w-5 h-5 text-emerald-600 animate-pulse" />,
      accentColor: '#059669',
      bgGradient: 'linear-gradient(145deg, #f7fdf9 0%, #e8f7ee 100%)',
      borderPreview: 'border-2 border-emerald-400/70 shadow-[0_8px_25px_rgba(5,150,105,0.22)]',
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
      category: 'cyber',
      icon: <Terminal className="w-5 h-5 text-cyan-400" />,
      accentColor: '#06b6d4',
      bgGradient: 'linear-gradient(145deg, #070e1c 0%, #0f1c34 100%)',
      borderPreview: 'border border-cyan-400/70 shadow-[0_0_24px_rgba(6,182,212,0.4)]',
      badgeBg: 'bg-cyan-500/20 border border-cyan-400/50 text-cyan-300',
      badgeText: 'text-cyan-300',
      description: 'Terminal pusat komando operasional masa depan dengan sudut bersiku teknis, aksen laser biru elektrik, dan tipografi kode monospace.',
      fontStyle: 'JetBrains Mono Teknis & Monospace',
      borderFeature: 'Sudut Bracket Teknologis (┌ ┐ HUD Frame)',
      animationFeature: 'Sapuan Garis Laser Horizontal (Cyber Scanline)',
      boxFeature: 'Panel Modular Futuristik dengan Garis Indikator',
      previewTags: ['Cyberpunk', 'Monospace', 'Laser HUD', 'High-Tech']
    },
    {
      id: 'sunset',
      name: 'Senja Tropis Kasual',
      subtitle: 'Peach Ceria, Koral Hangat & Ramah',
      badge: 'KASUAL & CERIA',
      category: 'casual',
      icon: <Sun className="w-5 h-5 text-orange-500 animate-spin-slow" />,
      accentColor: '#f97316',
      bgGradient: 'linear-gradient(145deg, #fffcf8 0%, #fff1e6 100%)',
      borderPreview: 'border-2 border-orange-400/70 shadow-[0_10px_28px_rgba(249,115,22,0.25)]',
      badgeBg: 'bg-orange-100 border border-orange-300 text-orange-950 font-black',
      badgeText: 'text-orange-950',
      description: 'Sentuhan kasual ramah bernuansa senja pantai tropis. Kotak membulat elastis anti kaku, warna karamel peach cerah, dan energi positif.',
      fontStyle: 'Outfit Display Dinamis & Friendly',
      borderFeature: 'Bordir Koral Halus Bouncy (Rounded-24)',
      animationFeature: 'Denyut Cahaya Senja Hangat (Warm Pulse)',
      boxFeature: 'Kotak Membal Kasual Berbayang Karamel',
      previewTags: ['Kasual Santai', 'Peach & Koral', 'Anti Kaku', 'Ceria']
    },
    {
      id: 'nordic',
      name: 'Kutub Nordik Minimalis',
      subtitle: 'Skandinavia Sejuk, Es & Kaca Buram',
      badge: 'MINIMALIS AIRY',
      category: 'minimal',
      icon: <Snowflake className="w-5 h-5 text-sky-500 animate-pulse" />,
      accentColor: '#0284c7',
      bgGradient: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)',
      borderPreview: 'border border-slate-300 outline outline-1 outline-sky-400/30 shadow-md',
      badgeBg: 'bg-sky-100/90 border border-sky-300 text-sky-900 font-bold',
      badgeText: 'text-sky-900',
      description: 'Estetika Skandinavia ultra-bersih dengan garis tipis presisi, latar es sejuk, kaca buram, serta ketertiban visual yang menenangkan.',
      fontStyle: 'Plus Jakarta Sans Geometris Ringan',
      borderFeature: 'Garis Ganda Garis Rambut (Hairline Dual Frame)',
      animationFeature: 'Kilau Kristal Es Kutub (Frost Shimmer)',
      boxFeature: 'Kaca Es Frosted Glass Super Rapi',
      previewTags: ['Skandinavia', 'Ice Blue', 'Super Rapi', 'Tenang']
    },
    {
      id: 'cyberpunk',
      name: 'Neon Synthwave 80s',
      subtitle: 'Magenta Elektrik & Grid Retro Futuristik',
      badge: 'RETRO SYNTHWAVE',
      category: 'cyber',
      icon: <Zap className="w-5 h-5 text-pink-500 animate-bounce" />,
      accentColor: '#ec4899',
      bgGradient: 'linear-gradient(145deg, #130a24 0%, #1d1038 100%)',
      borderPreview: 'border border-pink-500/70 shadow-[0_0_28px_rgba(236,72,153,0.45)]',
      badgeBg: 'bg-pink-500/20 border border-pink-400/50 text-pink-300 font-black',
      badgeText: 'text-pink-300',
      description: 'Nostalgia arkade 1980-an bertemu masa depan. Pendaran neon magenta dan turquoise, garis kisi berpendar, dan aura aksi cepat.',
      fontStyle: 'Outfit Cyber & Font Arkade Retro',
      borderFeature: 'Glow Neon Ganda (Magenta & Cyan Border)',
      animationFeature: 'Denyut Neon Arkade (Synthwave Pulse)',
      boxFeature: 'Panel Gelap Ultraviolet Holografik',
      previewTags: ['Synthwave', 'Neon Pink & Cyan', 'Arkade 80s', 'Bold']
    },
    {
      id: 'cozy',
      name: 'Kopi & Lavender Kasual',
      subtitle: 'Mocha Latte Hangat & Lavender Tenang',
      badge: 'COZY CAFE',
      category: 'casual',
      icon: <Coffee className="w-5 h-5 text-amber-700 animate-float-gentle" />,
      accentColor: '#b45309',
      bgGradient: 'linear-gradient(145deg, #fffcf7 0%, #f4ecdf 100%)',
      borderPreview: 'border-2 border-amber-800/40 shadow-[0_8px_24px_rgba(180,83,9,0.18)]',
      badgeBg: 'bg-amber-100 border border-amber-300 text-amber-900 font-bold',
      badgeText: 'text-amber-900',
      description: 'Suasana santai kedai kopi artisan dengan aroma mocha hangat dan sentuhan lavender lembut. Nyaman untuk penggunaan berjam-jam.',
      fontStyle: 'Plus Jakarta Sans Halus & Terbaca Luwes',
      borderFeature: 'Bordir Organik Hangat Kedai Kopi',
      animationFeature: 'Pusaran Uap Hangat Menenangkan (Swirl Breathe)',
      boxFeature: 'Kotak Hangat Mocha Cream Anti Lelah Mata',
      previewTags: ['Café Cozy', 'Mocha Latte', 'Lavender', 'Nyaman']
    }
  ];

  const filteredThemes = selectedCategory === 'all' 
    ? themes 
    : themes.filter(t => t.category === selectedCategory);

  return (
    <div className="fixed inset-0 z-[1200] overflow-y-auto flex items-center justify-center p-3 sm:p-5 bg-stone-950/80 backdrop-blur-md animate-fade-in print:hidden">
      <div 
        className="relative bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 w-full max-w-5xl overflow-hidden flex flex-col max-h-[94vh] animate-scale-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative Header Ribbon */}
        <div className="h-1.5 w-full border-header-gradient" />

        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50/80 dark:bg-stone-950/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400">
              <Palette className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold tracking-widest text-amber-600 dark:text-amber-400 uppercase bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  GALERI ESTETIKA &amp; KARAKTER VISUAL
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-stone-500">
                  <Sparkles size={11} className="text-amber-500" />
                  <span>8 Tema Spesial</span>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-stone-100 font-sans tracking-tight">
                Pilih Tema Desain &amp; Karakter Animasi Aplikasi
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

        {/* Category Filters Bar */}
        <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[11px] font-mono font-bold text-stone-400 mr-1 shrink-0">Kategori:</span>
          {[
            { id: 'all', label: 'Semua (8)' },
            { id: 'casual', label: '🏖️ Kasual & Santai' },
            { id: 'corporate', label: '👑 Elegan Korporat' },
            { id: 'minimal', label: '❄️ Minimalis Bersih' },
            { id: 'cyber', label: '⚡ Cyber & Futuristik' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition whitespace-nowrap cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-stone-950 shadow-xs'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Content - 8 Cards Grid */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed font-sans">
            Setiap tema didesain secara harmonis dengan warna, bordir bingkai, tipografi, kotak kartu, serta animasi yang berbeda agar aplikasi voucher Anda selalu dinamis, segar, dan tidak kaku. Klik kartu tema untuk langsung mengaktifkannya!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredThemes.map((t) => {
              const isSelected = currentTheme === t.id;
              const isDarkTheme = t.id === 'gold-dark' || t.id === 'slate' || t.id === 'cyberpunk';

              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTheme(t.id)}
                  className={`relative rounded-2xl p-4 sm:p-5 transition-all duration-200 cursor-pointer text-left flex flex-col justify-between group overflow-hidden ${
                    isSelected 
                      ? 'ring-2 ring-amber-500 dark:ring-amber-400 shadow-xl scale-[1.01]' 
                      : 'hover:scale-[1.01] hover:shadow-lg'
                  } ${isDarkTheme ? 'text-stone-100' : 'text-stone-900'}`}
                  style={{ background: t.bgGradient }}
                >
                  {/* Outer Theme Border Wrapper */}
                  <div className={`absolute inset-0 rounded-2xl pointer-events-none transition-all ${
                    isSelected ? t.borderPreview : 'border border-stone-300 dark:border-stone-750'
                  }`} />

                  {/* Header in Card */}
                  <div className="relative z-10 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-xl bg-white/85 dark:bg-stone-900/85 shadow-xs border border-stone-200/50 dark:border-stone-700/50 shrink-0">
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
                        <div className="flex items-center gap-1 bg-amber-500 text-stone-950 font-black text-[11px] font-mono px-2.5 py-1 rounded-full shadow-sm shrink-0">
                          <Check size={13} className="stroke-[3]" />
                          <span>AKTIF</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono text-stone-400 group-hover:text-amber-500 transition shrink-0 font-bold">
                          Ganti Tema ➔
                        </span>
                      )}
                    </div>

                    <p className={`text-[11px] leading-relaxed line-clamp-2 ${
                      isDarkTheme ? 'text-stone-300' : 'text-stone-600'
                    }`}>
                      {t.description}
                    </p>
                  </div>

                  {/* Specs & Characteristics Box */}
                  <div className={`relative z-10 mt-3 pt-3 border-t space-y-1.5 text-[10px] font-mono ${
                    isDarkTheme ? 'border-stone-800' : 'border-stone-200/80'
                  }`}>
                    <div className="flex items-start gap-1.5">
                      <span className="text-stone-400 shrink-0">Bordir &amp; Bingkai:</span>
                      <span className="font-bold truncate">{t.borderFeature}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-stone-400 shrink-0">Bentuk Kotak:</span>
                      <span className="font-bold truncate">{t.boxFeature}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-stone-400 shrink-0">Huruf &amp; Font:</span>
                      <span className="font-bold truncate">{t.fontStyle}</span>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-stone-400 shrink-0">Animasi:</span>
                      <span className="font-bold truncate text-amber-500 dark:text-amber-400">{t.animationFeature}</span>
                    </div>
                  </div>

                  {/* Tag Pills */}
                  <div className="relative z-10 mt-3 flex flex-wrap gap-1">
                    {t.previewTags.map((tag, i) => (
                      <span 
                        key={i}
                        className={`text-[9px] font-mono px-2 py-0.5 rounded-md ${
                          isDarkTheme
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
        <div className="p-4 sm:p-5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-stone-500 shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-amber-500 shrink-0" />
            <span>Tema yang dipilih tersimpan otomatis &amp; dapat diganti kapan saja.</span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition cursor-pointer font-mono shadow-md"
          >
            Terapkan &amp; Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

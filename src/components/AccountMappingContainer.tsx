import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Briefcase, 
  ChevronRight, 
  Coins, 
  Layers, 
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { Submission, PettyCashReport } from '../types';
import { AccuratePettyCashMapping } from './AccuratePettyCashMapping';
import { SppdAccountMapping } from './SppdAccountMapping';
import { isPettyCashSubmission, isSppdSubmission } from '../utils';

interface AccountMappingContainerProps {
  pettyCashReports?: PettyCashReport[];
  submissions?: Submission[];
  userProfile?: any;
  pettyCashHolders?: string[];
  initialSubTab?: 'accurate' | 'sppd';
  onUpdatePettyCashHolders?: (holders: string[]) => void;
  onSaveSubmission?: (sub: Submission) => Promise<void> | void;
  onSelectSubmissionForView?: (sub: Submission) => void;
  onOpenSppdForm?: () => void;
  onPostToVoucherHO?: (sppd: any) => void;
  onBack?: () => void;
}

export function AccountMappingContainer({
  pettyCashReports = [],
  submissions = [],
  userProfile,
  pettyCashHolders = [],
  initialSubTab,
  onUpdatePettyCashHolders,
  onSaveSubmission,
  onSelectSubmissionForView,
  onOpenSppdForm,
  onPostToVoucherHO,
  onBack
}: AccountMappingContainerProps) {
  // Main sub-section tab: 'accurate' (Petty Cash) vs 'sppd' (Biaya Perjalanan Dinas)
  const [selectedSubTab, setSelectedSubTab] = useState<'accurate' | 'sppd'>(() => {
    if (initialSubTab) return initialSubTab;
    try {
      const saved = sessionStorage.getItem('pemetaan_akun_sub_tab');
      if (saved === 'accurate' || saved === 'sppd') return saved;
    } catch (e) {}
    return 'accurate';
  });

  useEffect(() => {
    if (initialSubTab) {
      setSelectedSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSwitchTab = (tab: 'accurate' | 'sppd') => {
    setSelectedSubTab(tab);
    try {
      sessionStorage.setItem('pemetaan_akun_sub_tab', tab);
    } catch (e) {}
  };

  // Count synchronized transactions
  const accurateCount = submissions.filter(s => isPettyCashSubmission(s)).length;
  const sppdCount = submissions.filter(s => isSppdSubmission(s)).length;

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Top Header & Main Switcher */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition cursor-pointer"
                title="Kembali ke Voucher HO"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="p-2.5 bg-stone-900 text-white rounded-xl shadow-xs">
              <Layers size={22} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-stone-900 tracking-tight">
                  Pemetaan Akun
                </h1>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-stone-100 text-stone-700 rounded-md border border-stone-200">
                  COA & Klasifikasi
                </span>
              </div>
              <p className="text-xs text-stone-500 font-sans">
                Pilih modul pemetaan akun antara Petty Cash Lapangan (Accurate Online) dan Biaya SPPD Dinas (Pedoman Plafond).
              </p>
            </div>
          </div>

          {/* Sub-tab Navigation Selector */}
          <div className="flex items-center bg-stone-100 p-1.5 rounded-2xl border border-stone-200 shadow-3xs self-start md:self-auto">
            {/* Tab 1: Pemetaan Akun Accurate */}
            <button
              type="button"
              onClick={() => handleSwitchTab('accurate')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedSubTab === 'accurate'
                  ? 'bg-emerald-800 text-white shadow-xs font-black'
                  : 'text-stone-700 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <FileSpreadsheet size={15} className={selectedSubTab === 'accurate' ? 'text-emerald-300' : 'text-emerald-700'} />
              <span>Pemetaan Akun Accurate</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                selectedSubTab === 'accurate' ? 'bg-emerald-950 text-emerald-200' : 'bg-stone-200 text-stone-700'
              }`}>
                {accurateCount}
              </span>
            </button>

            {/* Tab 2: Pemetaan Akun SPPD */}
            <button
              type="button"
              onClick={() => handleSwitchTab('sppd')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedSubTab === 'sppd'
                  ? 'bg-amber-600 text-white shadow-xs font-black'
                  : 'text-stone-700 hover:text-stone-900 hover:bg-stone-200/60'
              }`}
            >
              <Briefcase size={15} className={selectedSubTab === 'sppd' ? 'text-amber-200' : 'text-amber-600'} />
              <span>Pemetaan Akun SPPD</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                selectedSubTab === 'sppd' ? 'bg-amber-950 text-amber-200' : 'bg-stone-200 text-stone-700'
              }`}>
                {sppdCount}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* RENDER ACTIVE SUB-MODULE */}
      {selectedSubTab === 'accurate' && (
        <AccuratePettyCashMapping
          pettyCashReports={pettyCashReports}
          submissions={submissions}
          userProfile={userProfile}
          pettyCashHolders={pettyCashHolders}
          onUpdatePettyCashHolders={onUpdatePettyCashHolders}
          onSaveSubmission={onSaveSubmission}
          onBack={onBack}
        />
      )}

      {selectedSubTab === 'sppd' && (
        <SppdAccountMapping
          submissions={submissions}
          userProfile={userProfile}
          onSelectSubmissionForView={onSelectSubmissionForView}
          onOpenSppdForm={onOpenSppdForm}
          onPostToVoucherHO={onPostToVoucherHO}
        />
      )}
    </div>
  );
}

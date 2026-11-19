import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Database } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary tertangkap:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      // Periksa dan bersihkan jika data cache di localStorage rusak
      const stored = localStorage.getItem('NUSANTARA_HO_SUBMISSIONS');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (!Array.isArray(parsed)) {
            if (parsed && Array.isArray(parsed.updatedSubmissions)) {
              localStorage.setItem('NUSANTARA_HO_SUBMISSIONS', JSON.stringify(parsed.updatedSubmissions));
            } else {
              localStorage.removeItem('NUSANTARA_HO_SUBMISSIONS');
            }
          }
        } catch {
          localStorage.removeItem('NUSANTARA_HO_SUBMISSIONS');
        }
      }

      const holders = localStorage.getItem('petty_cash_holders_v2');
      if (holders === 'undefined' || holders === 'null') {
        localStorage.removeItem('petty_cash_holders_v2');
      }
    } catch (e) {
      console.warn('Gagal membersihkan cache:', e);
    }
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4 font-sans">
          <div className="max-w-lg w-full bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 sm:p-8 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center border border-rose-200 shadow-3xs">
              <AlertTriangle size={32} />
            </div>

            <span className="text-[10px] font-mono font-bold tracking-widest text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-full uppercase">
              Pemulihan Tampilan Otomatis
            </span>

            <h2 className="text-xl font-black text-stone-900 mt-3 mb-2 font-display">
              Terjadi Gangguan pada Tampilan
            </h2>

            <p className="text-xs text-stone-600 leading-relaxed mb-6">
              Sistem mendeteksi adanya kendala rendering data. Jangan khawatir, data transaksi Anda di cloud tetap aman. Klik tombol di bawah ini untuk memuat ulang atau memulihkan data.
            </p>

            {this.state.error && (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-left mb-6 overflow-x-auto max-h-32 text-[11px] font-mono text-rose-700">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs transition cursor-pointer shadow-xs"
              >
                <RefreshCw size={14} />
                <span>Muat Ulang Halaman</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetCache}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 font-bold text-xs transition cursor-pointer"
              >
                <Database size={14} />
                <span>Pulihkan & Bersihkan Cache</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

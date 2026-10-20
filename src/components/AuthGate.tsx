import React, { useState, useEffect } from 'react';
import { 
  getStoredFirebaseConfig, 
  saveAndInitializeFirebaseConfig, 
  isFirebaseConfigured,
  loginToFirebase,
  resetPasswordViaEmail,
  loadSubmissionsFromFirestore,
  getUserProfileFromFirestore,
  switchToProductionDatabase,
  switchToAppletDatabase,
  getActiveFirebaseProjectId
} from '../firebase';
import { Submission } from '../types';
import { NusantaraLogo } from './NusantaraLogo';
import { Key, Lock, Mail, ShieldCheck, Database, Info, Loader2, RefreshCw, Eye, EyeOff, AlertTriangle, ExternalLink, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface AuthGateProps {
  onLoginSuccess: (user: any, initialData: Submission[]) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'config'>('login');
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => getActiveFirebaseProjectId());
  const [isOperationNotAllowed, setIsOperationNotAllowed] = useState(false);

  // Form Fields - Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields - Firebase Config
  const [apiKey, setApiKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [messagingSenderId, setMessagingSenderId] = useState('');
  const [appId, setAppId] = useState('');

  // Initial Check
  useEffect(() => {
    const ready = isFirebaseConfigured();
    setIsConfigured(ready);
    
    const config = getStoredFirebaseConfig();
    if (config) {
      setApiKey(config.apiKey || '');
      setProjectId(config.projectId || '');
      setAuthDomain(config.authDomain || '');
      setStorageBucket(config.storageBucket || '');
      setMessagingSenderId(config.messagingSenderId || '');
      setAppId(config.appId || '');
    }

    setMode('login');
    setActiveProjectId(getActiveFirebaseProjectId());
  }, []);

  const handleSwitchToNmsaProd = () => {
    setIsLoading(true);
    setStatusMsg({ type: 'info', text: 'Mengalihkan ke database asli NMSA (pencatatan-voucher-perusahaan)...' });
    try {
      switchToProductionDatabase();
      const pid = getActiveFirebaseProjectId();
      setActiveProjectId(pid);
      setIsOperationNotAllowed(false);
      setIsConfigured(true);
      setStatusMsg({
        type: 'success',
        text: 'Berhasil beralih ke database pencatatan-voucher-perusahaan! Silakan masukkan email & sandi terdaftar Anda.'
      });
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: 'Gagal beralih database: ' + (e?.message || e)
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToApplet = () => {
    setIsLoading(true);
    setStatusMsg({ type: 'info', text: 'Mengalihkan ke database AI Studio...' });
    try {
      switchToAppletDatabase();
      const pid = getActiveFirebaseProjectId();
      setActiveProjectId(pid);
      setIsOperationNotAllowed(false);
      setIsConfigured(true);
      setStatusMsg({
        type: 'info',
        text: `Berhasil beralih ke database AI Studio (${pid}).`
      });
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: 'Gagal beralih database: ' + (e?.message || e)
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!apiKey.trim() || !projectId.trim() || !appId.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'Kolom API Key, Project ID, dan App ID wajib diisi.'
      });
      return;
    }

    const val = saveAndInitializeFirebaseConfig({
      apiKey: apiKey.trim(),
      projectId: projectId.trim(),
      authDomain: authDomain.trim(),
      storageBucket: storageBucket.trim(),
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim()
    });

    if (val) {
      setIsConfigured(true);
      setStatusMsg({
        type: 'success',
        text: 'Parameter Firebase berhasil ditautkan! Silakan login menggunakan akun terdaftar Anda.'
      });
      setMode('login');
    } else {
      setIsConfigured(false);
      setStatusMsg({
        type: 'error',
        text: 'Inisialisasi Firebase gagal. Silakan verifikasi kembali kredensial Anda.'
      });
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'Kombinasi Email dan Password wajib diisi.'
      });
      return;
    }

    if (!isFirebaseConfigured() && !isConfigured) {
      setStatusMsg({
        type: 'error',
        text: 'Koneksi database Cloud belum aktif. Silakan klik tombol roda gigi ⚙️ di pojok kanan bawah untuk mengonfigurasi Firebase Anda terlebih dahulu.'
      });
      return;
    }

    setIsLoading(true);
    setStatusMsg({
      type: 'info',
      text: 'Menghubungkan ke server autentikasi terenkripsi...'
    });

    try {
      const user = await loginToFirebase(loginEmail.trim(), loginPassword.trim());
      
      setStatusMsg({
        type: 'info',
        text: 'Autentikasi sukses! Mengimpor data transaksi aman dari cloud...'
      });

      // Fetch user profile info from Firestore collection to retrieve companyId
      const profile = await getUserProfileFromFirestore(user.uid);
      const companyId = profile?.companyId || 'nmsa';

      let cloudSubmissions: Submission[] = [];
      try {
        cloudSubmissions = await loadSubmissionsFromFirestore(companyId);
      } catch (err: any) {
        console.warn('Silent read rejection - possible permissions list', err);
      }
      
      setStatusMsg({
        type: 'success',
        text: `Sukses! Selamat datang kembali, ${profile?.fullName || user.email}.`
      });
      
      setTimeout(() => {
        onLoginSuccess(user, cloudSubmissions);
      }, 500);
    } catch (err: any) {
      const isInvalidCred = err?.code === 'auth/invalid-credential' || String(err?.message).includes('invalid-credential') || String(err?.message).includes('user-not-found') || String(err?.message).includes('wrong-password');
      const isOpNotAllowed = err?.code === 'auth/operation-not-allowed' || String(err?.message).includes('operation-not-allowed');

      if (isOpNotAllowed) {
        setIsOperationNotAllowed(true);
        setStatusMsg({
          type: 'error',
          text: `Metode Login Email & Sandi belum diaktifkan di Firebase Console untuk project "${activeProjectId}".`
        });
      } else {
        setIsOperationNotAllowed(false);
        setStatusMsg({
          type: 'error',
          text: isInvalidCred
            ? 'Email atau kata sandi tidak cocok. Pastikan akun Anda sudah didaftarkan langsung oleh Administrator di Firebase Console.'
            : (err.message || 'Periksa kembali e-mail dan kata sandi Anda.')
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!loginEmail.trim()) {
      setStatusMsg({
        type: 'error',
        text: 'Silakan isi kolom Alamat E-mail terlebih dahulu untuk menerima tautan pemulihan kata sandi.'
      });
      return;
    }

    setIsLoading(true);
    setStatusMsg({
      type: 'info',
      text: `Mengirimkan email pemulihan sandi ke ${loginEmail.trim()}...`
    });

    try {
      await resetPasswordViaEmail(loginEmail.trim());
      setStatusMsg({
        type: 'success',
        text: `Email pemulihan kata sandi telah dikirim ke ${loginEmail.trim()}. Silakan periksa kotak masuk (inbox / spam) Anda.`
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || 'Gagal mengirim email reset kata sandi.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 flex flex-col justify-center items-center p-4 relative antialiased overflow-hidden">
      {/* Background Animated Gradient & Subtle Geometry Ornaments */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-md bg-stone-950/90 backdrop-blur-xl border border-stone-800 shadow-2xl rounded-3xl overflow-hidden transition-all duration-300">
        
        {/* Top Gold Shimmer Border Header */}
        <div className="h-1.5 bg-gradient-to-r from-amber-600 via-[#D4AF37] to-amber-500 w-full" />

        {/* Banner header containing the brand */}
        <div className="bg-gradient-to-b from-stone-900 to-stone-950 px-6 pt-7 pb-6 text-center border-b border-stone-800/80 flex flex-col items-center justify-center space-y-3.5">
          
          {/* Logo container with enlarged image display */}
          <div className="w-full max-w-[320px] bg-stone-900/80 rounded-2xl p-4 flex items-center justify-center border border-stone-800 shadow-inner">
            <NusantaraLogo size="xl" className="w-full justify-center" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-amber-400 text-lg sm:text-xl font-black uppercase tracking-wider font-display">
              Aplikasi Voucher &amp; Keuangan HO
            </h2>
            <p className="text-stone-300 text-xs sm:text-sm font-semibold tracking-tight">
              PT. Nusantara Mineral Sukses Abadi
            </p>
            <div className="pt-1 flex items-center justify-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                <ShieldAlert size={11} className="text-amber-400" />
                <span>AKSES KHUSUS TERBATAS</span>
              </span>
            </div>
          </div>
        </div>

        {/* Exclusive Access Notice Bar */}
        <div className="px-6 py-2.5 bg-stone-900/50 border-b border-stone-800/60 flex items-center justify-between text-[11px] font-mono text-stone-400">
          <span className="flex items-center gap-1.5">
            <Lock size={12} className="text-amber-400" />
            <strong className="text-stone-300">Login Terotorisasi</strong>
          </span>
          <span className="text-[10px] text-stone-500">Firebase Auth</span>
        </div>

        {/* Form area */}
        <div className="p-6 space-y-4">
          
          {/* Status Message Display */}
          {statusMsg && (
            <div className={`p-3.5 border rounded-2xl text-xs leading-relaxed space-y-2 font-medium ${
              statusMsg.type === 'success' ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200' :
              statusMsg.type === 'error' ? 'bg-rose-950/60 border-rose-700/60 text-rose-200' :
              'bg-amber-950/60 border-amber-700/60 text-amber-200'
            }`}>
              <div className="flex items-start gap-2.5">
                {isLoading && statusMsg.type === 'info' ? (
                  <Loader2 size={15} className="animate-spin text-amber-400 shrink-0 mt-0.5" />
                ) : statusMsg.type === 'success' ? (
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Info size={15} className="text-amber-400 shrink-0 mt-0.5" />
                )}
                <span className="flex-1">{statusMsg.text}</span>
              </div>

              {/* Special resolution panel for operation-not-allowed */}
              {statusMsg.type === 'error' && isOperationNotAllowed && (
                <div className="mt-2.5 p-3 bg-stone-900/90 border border-amber-500/40 rounded-xl space-y-2 text-stone-300">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <strong className="text-amber-300 block font-bold">Catatan Konfigurasi:</strong>
                      Metode <strong>Email/Password</strong> belum diaktifkan di Firebase Console untuk project <code className="bg-stone-800 px-1 py-0.5 rounded text-[10px] font-mono text-amber-300">{activeProjectId}</code>.
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {/* Switch to NMSA Production DB */}
                    {activeProjectId !== 'pencatatan-voucher-perusahaan' && (
                      <button
                        type="button"
                        onClick={handleSwitchToNmsaProd}
                        disabled={isLoading}
                        className="w-full py-2 px-3 bg-stone-800 hover:bg-stone-750 text-[#D4AF37] border border-amber-500/30 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Database size={13} />
                        <span>Beralih ke Database Asli (pencatatan-voucher-perusahaan)</span>
                      </button>
                    )}

                    {/* Direct link to enable Email/Password in Console */}
                    <a
                      href={`https://console.firebase.google.com/project/${activeProjectId}/authentication/providers`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-1.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition text-center"
                    >
                      <ExternalLink size={12} />
                      <span>Buka Firebase Console untuk Aktifkan Provider ↗</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Exclusive Private Access Informative Notice */}
          <div className="p-3.5 bg-stone-900/80 border border-amber-500/30 rounded-2xl text-[11px] text-stone-300 leading-relaxed flex items-start gap-2.5 shadow-inner">
            <ShieldCheck size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-300 font-bold block mb-0.5">SISTEM PRIVAT TERTUTUP:</strong>
              Aplikasi ini dikhususkan hanya untuk Anda dan akun yang telah didaftarkan secara manual oleh Administrator di Firebase Authentication Console. Fitur pendaftaran publik dan login pihak ketiga dinonaktifkan demi keamanan integritas keuangan PT NMSA.
            </div>
          </div>

          {/* MODE 1: LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                  ALAMAT E-MAIL RESMI
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-500 pointer-events-none">
                    <Mail size={15} />
                  </span>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="nama@nmsa.com"
                    disabled={isLoading}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-stone-900/90 border border-stone-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-stone-100 placeholder:text-stone-600 transition"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                    KATA SANDI
                  </label>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition hover:underline cursor-pointer"
                    title="Kirim email pemulihan sandi ke alamat email Anda"
                  >
                    Lupa Sandi?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-500 pointer-events-none">
                    <Lock size={15} />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className="w-full pl-10 pr-10 py-2.5 bg-stone-900/90 border border-stone-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-stone-100 placeholder:text-stone-600 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-500 hover:text-stone-300 transition cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-450 hover:to-amber-550 text-stone-950 font-black py-3 px-4 rounded-xl text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={15} className="animate-spin text-stone-950" />
                    Memverifikasi Akun...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    Masuk ke Sistem HO
                  </>
                )}
              </button>

              {!(window.location.hash === '#/input-bukti-transfer' || window.location.hash === '#input-bukti-transfer' || window.location.pathname === '/input-bukti-transfer') && (
                <>
                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-stone-800"></div>
                    <span className="flex-shrink mx-3 text-[10px] font-mono font-bold text-stone-500 uppercase tracking-widest">Akses Singkat</span>
                    <div className="flex-grow border-t border-stone-800"></div>
                  </div>

                  <a
                    href="#/input-bukti-transfer"
                    className="w-full border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-2 transition duration-150 decoration-transparent hover:border-amber-500/50 cursor-pointer text-center"
                  >
                    <RefreshCw size={13} className="text-amber-400" />
                    Input Bukti Pembayaran Keuangan ➔
                  </a>
                </>
              )}
            </form>
          )}

          {/* MODE 2: CONFIGURATION SETUP (ADMINISTRATOR) */}
          {mode === 'config' && (
            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="text-[11px] leading-relaxed text-amber-200">
                  ⚠️ <strong>Konfigurasi Firebase Firestore:</strong> Atur parameter Web App SDK Firebase di bawah ini untuk menghubungkan aplikasi ke database perusahaan.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                  API Key (apiKey) *
                </label>
                <input
                  type="text"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-xl text-[11px] font-mono text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                  Project ID (projectId) *
                </label>
                <input
                  type="text"
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="pencatatan-voucher-perusahaan"
                  className="w-full px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-xl text-[11px] font-mono text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                  App ID (appId) *
                </label>
                <input
                  type="text"
                  required
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="1:84739572917:web:2c846d847..."
                  className="w-full px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-xl text-[11px] font-mono text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                    Auth Domain
                  </label>
                  <input
                    type="text"
                    value={authDomain}
                    onChange={(e) => setAuthDomain(e.target.value)}
                    placeholder="id.firebaseapp.com"
                    className="w-full px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-xl text-[11px] font-mono text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                    Storage Bucket
                  </label>
                  <input
                    type="text"
                    value={storageBucket}
                    onChange={(e) => setStorageBucket(e.target.value)}
                    placeholder="id.appspot.com"
                    className="w-full px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-xl text-[11px] font-mono text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-450 text-stone-950 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider font-mono flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
              >
                <RefreshCw size={13} />
                Hubungkan &amp; Simpan Konfigurasi
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setStatusMsg(null);
                  const config = getStoredFirebaseConfig();
                  if (config) {
                    setApiKey(config.apiKey || '');
                    setProjectId(config.projectId || '');
                    setAuthDomain(config.authDomain || '');
                    setStorageBucket(config.storageBucket || '');
                    setMessagingSenderId(config.messagingSenderId || '');
                    setAppId(config.appId || '');
                  }
                }}
                className="w-full bg-stone-900 hover:bg-stone-850 text-stone-400 border border-stone-800 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider font-mono text-center transition block cursor-pointer"
              >
                Kembali ke Login
              </button>
            </form>
          )}

        </div>

        {/* Footer brand details */}
        <div className="bg-stone-900/80 px-6 py-3.5 border-t border-stone-800/80 text-center flex items-center justify-between gap-2 text-[10px] font-mono text-stone-500">
          <div className="flex items-center gap-1.5 select-none text-left">
            <Key size={12} className="text-amber-400 shrink-0" />
            <span>Otorisasi Keamanan HO</span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (mode === 'config') {
                setMode('login');
                const config = getStoredFirebaseConfig();
                if (config) {
                  setApiKey(config.apiKey || '');
                  setProjectId(config.projectId || '');
                  setAuthDomain(config.authDomain || '');
                  setStorageBucket(config.storageBucket || '');
                  setMessagingSenderId(config.messagingSenderId || '');
                  setAppId(config.appId || '');
                }
              } else {
                setMode('config');
              }
              setStatusMsg(null);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold font-mono uppercase tracking-wider text-stone-400 hover:text-amber-300 bg-stone-900 border border-stone-800 rounded-lg hover:border-stone-700 transition cursor-pointer"
            title="Kelola Parameter Koneksi Database Firebase"
          >
            <Database size={11} />
            <span>{mode === 'config' ? 'Batal' : 'Database'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
